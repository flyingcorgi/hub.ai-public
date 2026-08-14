import { NextRequest, NextResponse } from "next/server";
import { generateWavespeed } from "@/lib/actions/generate-wavespeed";
import { generateReplicate } from "@/lib/actions/generate-replicate";
import { generateImage } from "@/lib/actions/generate-image";
import { generateBytePlus } from "@/lib/actions/generate-byteplus";
import { Model } from "@/lib/types";

type ProviderKind = "wavespeed" | "replicate" | "fal" | "byteplus";

// Plain Route Handler (not a Server Action) so the batch generator's concurrent fetch() calls
// actually run in parallel — Next.js serializes Server Actions invoked directly from a client
// component one at a time via its internal action queue, which defeats client-side concurrency.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerKind, model, payload, apiKey } = body as {
      providerKind: ProviderKind;
      model: Model;
      payload: Record<string, unknown>;
      apiKey: string;
    };

    switch (providerKind) {
      case "wavespeed":
        return NextResponse.json(await generateWavespeed(model, payload, apiKey));
      case "replicate":
        return NextResponse.json(await generateReplicate(model, payload, apiKey));
      case "byteplus":
        return NextResponse.json(await generateBytePlus(model, payload, apiKey));
      case "fal":
        return NextResponse.json(await generateImage(model, payload, apiKey));
      default:
        return NextResponse.json({ success: false, error: "Invalid provider" }, { status: 400 });
    }
  } catch (error) {
    // Never let a parse/routing failure here fall through to Next's generic HTML error page —
    // the client expects JSON and a raw HTML response reads as "the payload never arrived".
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to process batch generation request",
    });
  }
}
