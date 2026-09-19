// Server-side API route: proxies a Google Images result via Serper.dev, by search query.
// Same hotlink-protection/CORS reasoning as the TBIB/Danbooru routes — fetch server-side, re-serve
// as a data URI. Unlike TBIB (an illustrated-content imageboard), this pulls real photos from the
// open web via Google's index, so results can be anything Google has indexed for the query.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SERPER_API_URL = "https://google.serper.dev/images";

export async function GET(request: NextRequest) {
  try {
    // Client-supplied key (Settings page, stored in localStorage like the Venice key) takes
    // priority; a server-side env var still works as a fallback for shared/self-hosted setups.
    const apiKey = request.headers.get("x-serper-key") || process.env.SERPER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Serper needs an API key — add one on the Settings page (API Keys tab), or set SERPER_API_KEY in .env.local. Get one free at serper.dev.",
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    if (!q.trim()) {
      return NextResponse.json({ success: false, error: "No search query provided" }, { status: 400 });
    }

    // 1. Query Serper's image search. safe: "off" disables Google's adult-content filtering —
    // without it, Serper (like plain Google Images) blurs/excludes explicit results by default.
    const apiRes = await fetch(SERPER_API_URL, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: 30, safe: "off" }),
      cache: "no-store",
    });

    if (!apiRes.ok) {
      const body = await apiRes.text();
      return NextResponse.json(
        { success: false, error: `Serper API returned ${apiRes.status}: ${body.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data: { images?: Array<{ imageUrl?: string; title?: string; source?: string }> } =
      await apiRes.json();
    const images = (data.images || []).filter((img) => img.imageUrl);
    if (images.length === 0) {
      return NextResponse.json({ success: false, error: "No image results for that search" }, { status: 404 });
    }

    // 2. Download the file server-side — try a few distinct results in case one 404s/blocks
    // hotlinking, same resilience pattern as the TBIB route.
    const shuffled = [...images].sort(() => Math.random() - 0.5).slice(0, 5);
    let lastError = "Failed to download any result";

    for (const img of shuffled) {
      const imageUrl = img.imageUrl!;
      let fileRes: Response;
      try {
        fileRes = await fetch(imageUrl, { headers: { "User-Agent": "FetishUI/1.0" }, cache: "no-store" });
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Network error downloading image";
        continue;
      }
      if (!fileRes.ok) {
        lastError = `Failed to download image (${fileRes.status})`;
        continue;
      }

      const contentType = fileRes.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) {
        lastError = `Result wasn't an image (${contentType})`;
        continue;
      }
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;

      return NextResponse.json({
        success: true,
        url: dataUri,
        contentType,
        title: img.title || q,
        source: img.source || "",
        sourceUrl: imageUrl,
      });
    }

    return NextResponse.json({ success: false, error: lastError }, { status: 502 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
