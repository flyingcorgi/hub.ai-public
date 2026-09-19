// Use on both success and failure responses that contain personal content or credentials.
// This governs HTTP caches; production proxy buffering/logging still needs a separate audit.
export function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
