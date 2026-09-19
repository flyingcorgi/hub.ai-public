'use server';

import { Model, Image } from "@/lib/types";
import { assertVeniceResponseOk, GenerationError, generationErrorMessage } from "@/lib/privacy/generation-errors";

// Browser albums supply data URLs explicitly. Never read a personal server file on behalf of
// an anonymous generation request, even if it names an old album-media endpoint.
function rejectLocalMedia(value: unknown): void {
  if (typeof value === "string" && (value.startsWith("/api/album-media/") || value.startsWith("blob:"))) {
    throw new GenerationError("Select the image again from your browser album or upload it from your device.");
  }
  if (value && typeof value === "object") for (const child of Object.values(value)) rejectLocalMedia(child);
}

const VENICE_API_BASE = 'https://api.venice.ai/api/v1';
// Video generations are queued server-side by Venice and polled via /video/retrieve. P80 is
// usually a few minutes; give slow 1080p/15s jobs real headroom before giving up.
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_POLL_TIMEOUT_MS = 15 * 60 * 1000;

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

type GenerateVeniceResponse = SuccessResponse | ErrorResponse;

// Venice model ids live in the registry with a "venice/" prefix (the same convention the old
// Replicate models used) so provider routing can key off the id — the API itself wants the
// bare id ("seedream-v5-pro", "wan-2-7-text-to-video", ...).
//
// A few app-level ids intentionally diverge from Venice's own model id: one Venice model can
// back two incompatible request shapes (single `image` vs an `images` array) that we register
// as two separate Model entries so routing and the UI can tell them apart, but Venice only knows
// the one underlying id.
const VENICE_MODEL_ID_OVERRIDES: Record<string, string> = {
  'venice/seedream-v5-pro-multi-edit': 'seedream-v5-pro-edit',
};

function veniceModelId(model: Model): string {
  return VENICE_MODEL_ID_OVERRIDES[model.id] ?? model.id.replace(/^venice\//, '');
}

// Builds the request body from the model's own inputSchema — only keys the schema declares are
// forwarded, so a param meant for one model is never sent to another (Venice rejects unknown
// fields on some endpoints). "prompt" is required on every Venice generation model.
function buildRequestBody(model: Model, input: Record<string, any>): Record<string, unknown> {
  const body: Record<string, unknown> = { model: veniceModelId(model) };
  for (const param of model.inputSchema) {
    const value = input[param.key];
    if (value === undefined || value === null || value === '') continue;
    body[param.key] = param.type === 'number' ? Number(value) : value;
  }
  if (!('prompt' in body) && typeof input.prompt === 'string') {
    body.prompt = input.prompt;
  }
  return body;
}

async function veniceFetch(path: string, apiKey: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${VENICE_API_BASE}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

// /image/multi-edit's request schema only accepts `modelId` — unlike /image/edit and
// /image/generate, which take `model` (buildRequestBody's default). additionalProperties: false
// on that schema means sending `model` fails the whole request with "Unrecognized key(s)".
function toMultiEditBody(body: Record<string, unknown>): Record<string, unknown> {
  const { model, ...rest } = body;
  return { ...rest, modelId: model };
}

async function generateVeniceImage(
  model: Model,
  input: Record<string, any>,
  apiKey: string
): Promise<GenerateVeniceResponse> {
  const body = buildRequestBody(model, input);

  rejectLocalMedia(body);

  // Venice's safe_mode only blurs outputs server-side; the models registered here are the
  // uncensored ones, so mirror the rest of the app and always request unblurred results.
  const finalBody = { ...body, safe_mode: false };

  // Multi-image edit models (an `images` array param) go to /image/multi-edit; single-image
  // edit models (a plain `image` param) go to /image/edit — both answer with the raw edited
  // image as binary data. Text-to-image goes to /image/generate, which answers with JSON
  // { id, images: [base64] }.
  const isMultiEdit = model.inputSchema.some(
    (param) => param.type === 'array' && param.items?.type === 'image'
  );
  const isSingleEdit = !isMultiEdit && model.inputSchema.some((param) => param.type === 'image');

  if (isMultiEdit || isSingleEdit) {
    const apiPath = isMultiEdit ? '/image/multi-edit' : '/image/edit';
    const response = await veniceFetch(apiPath, apiKey, isMultiEdit ? toMultiEditBody(finalBody) : finalBody);
    await assertVeniceResponseOk(response);

    const contentType = (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
    if (!contentType.startsWith('image/')) {
      await response.body?.cancel().catch(() => undefined);
      throw new GenerationError('Venice.ai image edit returned an unexpected content type.');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const image: Image = {
      url: `data:${contentType};base64,${buffer.toString('base64')}`,
      width: 0,
      height: 0,
      content_type: contentType,
    };

    return {
      success: true,
      image,
      images: [image],
      seed: typeof input.seed === 'number' ? input.seed : -1,
      requestId: response.headers.get('cf-ray') ?? 'unknown',
      timings: {},
      has_nsfw_concepts: [],
    };
  }

  const format = typeof input.format === 'string' ? input.format : 'jpeg';

  const response = await veniceFetch('/image/generate', apiKey, finalBody);
  await assertVeniceResponseOk(response);

  const data = await response.json();
  const base64Images: string[] = Array.isArray(data?.images) ? data.images : [];
  if (base64Images.length === 0) {
    throw new GenerationError('No media was generated');
  }

  const images: Image[] = base64Images.map((b64) => ({
    url: `data:image/${format};base64,${b64}`,
    width: 0,
    height: 0,
    content_type: `image/${format}`,
  }));

  return {
    success: true,
    image: images[0],
    images,
    seed: typeof input.seed === 'number' ? input.seed : -1,
    requestId: data?.id ?? 'unknown',
    timings: data?.timing ?? {},
    has_nsfw_concepts: [],
  };
}

interface QueueVideoApiResponse {
  queue_id?: string;
  // Pre-signed URL, present for VPS-backed models only — for those, /video/retrieve stays
  // JSON-only and the finished mp4 is fetched from this URL once status hits COMPLETED.
  download_url?: string;
}

async function pollVeniceVideo(
  modelId: string,
  queue: QueueVideoApiResponse,
  apiKey: string
): Promise<{ url: string; contentType: string }> {
  const startedAt = Date.now();

  // First poll happens immediately — short generations can already be done, and for
  // VPS-backed models the first COMPLETED status tells us to use queue.download_url.
  for (;;) {
    const response = await veniceFetch('/video/retrieve', apiKey, {
      model: modelId,
      queue_id: queue.queue_id as string,
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && contentType.includes('video/')) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return { url: `data:${contentType.split(';')[0]};base64,${buffer.toString('base64')}`, contentType };
    }

    if (response.ok) {
      const status = await response.json();
      if (status?.status === 'COMPLETED') {
        if (queue.download_url) {
          return { url: queue.download_url, contentType: 'video/mp4' };
        }
        // COMPLETED but no binary and no download_url shouldn't happen — keep polling a
        // little longer rather than failing a job that may just be finalizing its stream.
      } else if (status?.status !== 'PROCESSING') {
        throw new GenerationError('Venice.ai video generation returned an unexpected status.');
      }
    } else {
      await assertVeniceResponseOk(response);
    }

    if (Date.now() - startedAt > VIDEO_POLL_TIMEOUT_MS) {
      throw new GenerationError('Venice.ai video generation timed out after 15 minutes');
    }
    await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
  }
}

async function generateVeniceVideo(
  model: Model,
  input: Record<string, any>,
  apiKey: string
): Promise<GenerateVeniceResponse> {
  const body = buildRequestBody(model, input);
  rejectLocalMedia(body);

  const queueResponse = await veniceFetch('/video/queue', apiKey, body);
  await assertVeniceResponseOk(queueResponse);

  const queue: QueueVideoApiResponse = await queueResponse.json();
  if (!queue.queue_id) {
    throw new GenerationError('Venice.ai video queue returned no queue_id.');
  }

  const media = await pollVeniceVideo(veniceModelId(model), queue, apiKey);
  const video: Image = {
    url: media.url,
    width: 0,
    height: 0,
    content_type: media.contentType,
  };

  return {
    success: true,
    image: video,
    images: [video],
    seed: typeof input.seed === 'number' ? input.seed : -1,
    requestId: queue.queue_id,
    timings: {},
    has_nsfw_concepts: [],
  };
}

export async function generateVenice(
  model: Model,
  input: Record<string, any>,
  apiKey: string
): Promise<GenerateVeniceResponse> {
  // Do not log input, output, provider identifiers, or raw errors. Even exception messages
  // (including JSON parser failures) can contain personal payloads. Only our own safe errors
  // may cross this boundary. Personal album files are never read or written here.
  try {
    if (!apiKey) {
      throw new GenerationError('Please set your Venice.ai API key first');
    }

    return model.mediaType === 'video'
      ? await generateVeniceVideo(model, input, apiKey)
      : await generateVeniceImage(model, input, apiKey);
  } catch (error) {
    return {
      success: false,
      error: generationErrorMessage(error, 'Failed to generate media'),
    };
  }
}
