import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/server";
import { accessFailure, readJson, requireSameOrigin } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  try {
    if (request.method === "POST") {
      requireSameOrigin(request);
      const body = await readJson(request, 16384);
      request = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) });
    }
    const handlers = toNextJsHandler(getAuth());
    const response = request.method === "GET" ? await handlers.GET(request) : await handlers.POST(request);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    const response = accessFailure(error);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
}
export const GET = handle;
export const POST = handle;
