import { NextRequest } from "next/server";
import { privateJson } from "@/lib/privacy/responses";
import { generateVenice } from "@/lib/actions/generate-venice";
import { Model } from "@/lib/types";

// Plain Route Handler (not a Server Action) so the batch generator's concurrent fetch() calls
// actually run in parallel — Next.js serializes Server Actions invoked directly from a client
// component one at a time via its internal action queue, which defeats client-side concurrency.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, payload, apiKey } = body as {
      model: Model;
      payload: Record<string, unknown>;
      apiKey: string;
    };

    return privateJson(await generateVenice(model, payload, apiKey));
  } catch {
    // Never let a parse/routing failure here fall through to Next's generic HTML error page —
    // the client expects JSON and a raw HTML response reads as "the payload never arrived".
    // JSON parser errors can quote the body, so never return their raw message.
    return privateJson({
      success: false,
      error: "Failed to process batch generation request",
    });
  }
}
