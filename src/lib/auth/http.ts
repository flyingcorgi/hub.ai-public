import { privateJson } from "@/lib/privacy/responses";
import { AccessError, requireAdmin } from "./authorization";
import { authConfig } from "./config";

export function requireSameOrigin(request: Request) {
  // Reject missing Origin too. Server-to-server webhooks use signature validation instead.
  if (request.headers.get("origin") !== authConfig().baseURL) {
    throw new AccessError(403, "Request origin is not allowed.");
  }
}

export function accessFailure(error: unknown): Response {
  return error instanceof AccessError
    ? privateJson({ error: error.message }, error.status)
    : privateJson({ error: "Service unavailable. Please try again later." }, 503);
}

export async function readJson(request: Request, maxBytes = 65536): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AccessError(415, "Expected application/json.");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AccessError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Expected a JSON body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AccessError(413, "Request is too large.");
      }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new AccessError(400, "Invalid JSON."); }
  } finally { reader.releaseLock(); }
}

// Interim boundary for legacy operator-owned files/search tools. Do not expose these stores to
// every subscriber; they'll be retired when private content migrates to versioned IndexedDB.
export function adminRoute<Context = { params: Promise<Record<string, string>> }>(handler: (request: Request, context: Context) => Promise<Response>) {
  return async (request: Request, context: Context): Promise<Response> => {
    try {
      await requireAdmin(request.headers);
      if (!["GET", "HEAD"].includes(request.method)) requireSameOrigin(request);
      const response = await handler(request, context);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    } catch (error) { return accessFailure(error); }
  };
}
