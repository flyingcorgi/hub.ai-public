'use server';

import { Client } from 'wavespeed';
import { Model, Image } from "@/lib/types";
import https from 'https';
import { randomUUID, createHash } from 'crypto';

const WAVESPEED_UPLOAD_URL = 'https://api.wavespeed.ai/api/v3/media/upload/binary';

// Wavespeed's /run endpoint chokes on the huge base64 data URIs the UI embeds for reference
// images/audio (tens of MB once encoded) — the request gets reset/aborted before Wavespeed's
// server even finishes receiving it, which is why it never shows up in Wavespeed's own request
// log. Swap any data URI for a real hosted URL first via Wavespeed's own upload endpoint.
//
// NOT using the wavespeed package's own client.upload() here — confirmed by direct testing that
// it hangs for minutes (then aborts) on real-sized files (~8.5MB), because it builds the request
// with Node's fetch() + FormData/Blob, which has known issues with large multipart bodies. The
// exact same file uploads in under 2s via a hand-built multipart POST over the plain `https`
// module (verified against Wavespeed's real endpoint), so that's what this does instead.
function uploadBufferToWavespeed(buffer: Buffer, filename: string, apiKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // The server sometimes closes the connection immediately after responding, which can raise
    // a stray socket-level error (e.g. EPIPE) after we've already resolved/rejected via the
    // response body — guard so that never surfaces as an unhandled error.
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const boundary = `----WavespeedFormBoundary${randomUUID().replace(/-/g, '')}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const t0 = Date.now();
    const mark = (label: string) => console.log(`    · [${Date.now() - t0}ms] ${label}`);
    mark(`starting request, body ${(body.length / (1024 * 1024)).toFixed(2)}MB`);

    const req = https.request(
      WAVESPEED_UPLOAD_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          Connection: 'close',
        },
        // Explicitly opt out of Node's shared global HTTPS agent/socket pool. In a long-running
        // process (like the dev server) that pool can accumulate stuck sockets over hours of
        // requests — including every earlier aborted/timed-out attempt from this exact session —
        // and a new request can end up queued behind a socket that's never coming back. A fresh
        // process never has that baggage, which is exactly the difference we saw (curl/fresh
        // node scripts always worked; the long-running dev server hung). agent: false forces a
        // brand-new, unpooled connection every time, matching what a fresh process gets for free.
        agent: false,
        // Now that uploads are sequential (no bandwidth contention between them — see
        // uploadDataUrisDeep), a single file should rarely need this long, but a genuinely
        // large file on a slow connection deserves real headroom rather than a premature kill.
        timeout: 300000,
      },
      (res) => {
        mark(`response headers received, status ${res.statusCode}`);
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          mark('response body fully received');
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(responseBody);
              const downloadUrl = parsed?.data?.download_url;
              if (!downloadUrl) {
                settle(() => reject(new Error('Wavespeed upload failed: no download_url in response')));
              } else {
                settle(() => resolve(downloadUrl));
              }
            } catch {
              settle(() => reject(new Error(`Wavespeed upload failed: invalid response: ${responseBody.slice(0, 300)}`)));
            }
          } else {
            settle(() => reject(new Error(`Wavespeed upload failed: HTTP ${res.statusCode}: ${responseBody.slice(0, 300)}`)));
          }
        });
      }
    );

    // Granular socket-lifecycle tracing — pinpoints exactly which phase (DNS, TCP connect, TLS
    // handshake, writing the body, or waiting on a response) is actually the one stalling,
    // instead of guessing from a single "it's slow" data point.
    req.on('socket', (socket) => {
      mark('socket assigned');
      if (socket.connecting) {
        socket.on('lookup', () => mark('DNS lookup resolved'));
        socket.on('connect', () => mark('TCP connected'));
        socket.on('secureConnect', () => mark('TLS handshake complete'));
      } else {
        mark('reused/already-connected socket (unexpected with agent:false)');
      }
    });
    req.on('finish', () => mark('request body fully flushed to the socket'));
    req.on('timeout', () => {
      mark('TIMEOUT fired — destroying request');
      req.destroy(new Error('Wavespeed upload timed out'));
    });
    req.on('error', (err) => {
      mark(`error event: ${err.message}`);
      settle(() => reject(err));
    });
    req.on('drain', () => mark('drain event (backpressure cleared)'));

    // Write in bounded chunks with explicit backpressure handling instead of one single
    // req.end(largeBuffer) call — confirmed by tracing that the single-write approach stalls
    // silently after the TLS handshake (no 'finish' event, ever) specifically inside this
    // process, even though the exact same file uploads fine via curl or a standalone script.
    // That's consistent with the socket's kernel send buffer filling up faster than a single
    // huge write() drains it, and something in this process not being woken by the resulting
    // 'drain' event — writing smaller chunks and waiting for 'drain' between them sidesteps that
    // entirely, since the writable stream never has more outstanding than one chunk at a time.
    const CHUNK_SIZE = 256 * 1024;
    let offset = 0;
    let chunkIndex = 0;
    const writeNextChunk = () => {
      if (settled) return;
      while (offset < body.length) {
        const isLast = offset + CHUNK_SIZE >= body.length;
        const chunk = body.subarray(offset, offset + CHUNK_SIZE);
        chunkIndex += 1;
        offset += chunk.length;
        const ok = isLast ? req.end(chunk) : req.write(chunk);
        if (!ok) {
          mark(`chunk ${chunkIndex} written, backpressure — waiting for drain (${offset}/${body.length} bytes)`);
          req.once('drain', writeNextChunk);
          return;
        }
      }
      mark(`all ${chunkIndex} chunks written synchronously, ${offset}/${body.length} bytes`);
    };
    writeNextChunk();
  });
}

// Regenerating/retrying reuses the same reference image most of the time, so cache the
// resulting URL by content hash — otherwise every single Generate click re-uploads the exact
// same file from scratch. Module-level, in-memory, cleared on server restart; fine for a
// single-instance personal tool, not meant to survive a redeploy.
const uploadCache = new Map<string, string>();

// The body write itself is fast (confirmed: ~3s for a 6MB file once dev-server contention is
// out of the picture) but Wavespeed's own gateway can reset the connection (ECONNRESET/"socket
// hang up") if their backend takes a while to process a particular file after receiving it —
// observed ~60s after an otherwise-successful upload. That's a transient, retry-worthy failure
// on their end, not something wrong with the upload itself, so retry a couple of times before
// giving up.
const RETRYABLE_UPLOAD_ERROR = /ECONNRESET|socket hang up|ETIMEDOUT|EPIPE/i;
const MAX_UPLOAD_ATTEMPTS = 3;

async function uploadBufferToWavespeedWithRetry(buffer: Buffer, filename: string, apiKey: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      return await uploadBufferToWavespeed(buffer, filename, apiKey);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === MAX_UPLOAD_ATTEMPTS || !RETRYABLE_UPLOAD_ERROR.test(message)) throw error;
      console.log(`  ↳ upload attempt ${attempt} failed (${message}), retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

async function uploadDataUriToWavespeed(dataUri: string, apiKey: string): Promise<string> {
  const match = dataUri.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) return dataUri;
  const [, mimeType, base64Data] = match;

  const cacheKey = createHash('sha256').update(base64Data).digest('hex');
  const cachedUrl = uploadCache.get(cacheKey);
  if (cachedUrl) {
    console.log('📎 Reusing cached Wavespeed upload for an already-uploaded file');
    return cachedUrl;
  }

  const ext = mimeType.split('/')[1]?.split('+')[0] || 'bin';
  const buffer = Buffer.from(base64Data, 'base64');
  const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
  const label = `${ext} file (${sizeMb}MB)`;
  console.log(`  ↳ uploading ${label}...`);
  const startedAt = Date.now();
  const url = await uploadBufferToWavespeedWithRetry(buffer, `upload-${randomUUID()}.${ext}`, apiKey);
  console.log(`  ↳ uploaded ${label} in ${Date.now() - startedAt}ms`);
  uploadCache.set(cacheKey, url);
  return url;
}

// Uploaded one at a time, not in parallel — multiple large files uploading concurrently just
// split the same finite upload bandwidth between them, making each one individually slower
// (confirmed: a 2-image payload timed out at ~2x the single-file timeout, consistent with two
// simultaneous large uploads contending for the same connection). Sequential is more reliable
// than "faster in theory," especially on a constrained home connection.
async function uploadDataUrisDeep(value: unknown, apiKey: string): Promise<unknown> {
  if (typeof value === 'string' && value.startsWith('data:')) {
    return uploadDataUriToWavespeed(value, apiKey);
  }
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const item of value) {
      result.push(await uploadDataUrisDeep(item, apiKey));
    }
    return result;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      result[key] = await uploadDataUrisDeep(v, apiKey);
    }
    return result;
  }
  return value;
}

interface SuccessResponse {
  success: true;
  image: Image;
  images: Image[];
  seed: number;
  requestId: string;
  timings: Record<string, any>;
  has_nsfw_concepts: boolean[];
}

interface ErrorResponse {
  success: false;
  error: string;
}

type GenerateWavespeedResponse = SuccessResponse | ErrorResponse;

export async function generateWavespeed(
  model: Model, 
  input: Record<string, any>,
  apiKey: string
): Promise<GenerateWavespeedResponse> {
  console.log('🚀 Starting Wavespeed generation process:', {
    modelId: model.id,
    inputParams: { ...input, prompt: input.prompt?.substring(0, 50) + '...' } // Truncate prompt for logging
  });

  try {
    if (!apiKey) {
      console.error('❌ No API key provided');
      throw new Error("Please set your Wavespeed API key first");
    }

    console.log('📝 Initializing Wavespeed client with API key');
    // Extra headroom for the upload step below, which sends real (if smaller) binary payloads.
    const client = new Client(apiKey, { connectionTimeout: 300 });

    // Ensure duration is a number if it's a string (from enum select)
    const processedInput = { ...input };
    if (processedInput.duration !== undefined) {
      processedInput.duration = typeof processedInput.duration === 'string'
        ? parseInt(processedInput.duration, 10)
        : processedInput.duration;
    }
    // Force safety checker OFF, but only for models whose schema actually declares this field —
    // Wavespeed validates strictly (AJV, additionalProperties: false), so sending it to a model
    // that doesn't expect it fails the whole request with "must NOT have additional properties".
    if (model.inputSchema.some((param) => param.key === 'enable_safety_checker')) {
      processedInput.enable_safety_checker = false;
    }

    console.log('📤 Uploading any embedded reference images/audio to Wavespeed...');
    const uploadStartedAt = Date.now();
    const uploadedInput = (await uploadDataUrisDeep(processedInput, apiKey)) as Record<string, any>;
    console.log(`📤 Upload step took ${Date.now() - uploadStartedAt}ms`);

    console.log('⏳ Submitting Wavespeed request...');
    const runStartedAt = Date.now();
    const result = await client.run(model.id, uploadedInput);
    console.log(`⏳ Submit+generate+poll step took ${Date.now() - runStartedAt}ms`);

    console.log('📦 Complete API Response:', JSON.stringify(result, null, 2));

    // Handle Wavespeed response format
    const outputs = result.outputs || [];
    
    if (!outputs || outputs.length === 0) {
      console.error('❌ No outputs in response');
      throw new Error("No media was generated");
    }

    const normalizedImages: Image[] = [];
    const normalize = (url: string, fallbackType: string): Image => ({
      url: url,
      width: 0,
      height: 0,
      content_type: fallbackType,
    });

    // Wavespeed returns URLs directly in outputs array
    outputs.forEach((outputUrl: string) => {
      // Determine content type from URL or default to video for multitalk
      const contentType = outputUrl.includes('.mp4') || outputUrl.includes('.webm') 
        ? 'video/mp4' 
        : 'image/jpeg';
      normalizedImages.push(normalize(outputUrl, contentType));
    });

    const media: Image | undefined = normalizedImages[0];

    if (!media) {
      console.error('❌ No media in response');
      throw new Error("No media was generated");
    }

    console.log('✅ Generation completed:', { 
      requestId: result.id,
      hasOutputs: !!outputs.length
    });

    console.log('🎉 Successfully generated media:', {
      requestId: result.id,
      media: media
    });

    return {
      success: true,
      image: media,
      images: normalizedImages,
      seed: input.seed || -1,
      requestId: result.id || 'unknown',
      timings: {},
      has_nsfw_concepts: [],
    };
  } catch (error) {
    console.error("❌ Wavespeed generation failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate media",
    };
  }
}
