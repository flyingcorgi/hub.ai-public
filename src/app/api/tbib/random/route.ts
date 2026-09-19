// Server-side API route: proxies a random image from TBIB (The Big ImageBoard) by tag.
// Same hotlink-protection/CORS reasoning as the Danbooru route (see /api/danbooru/random) —
// fetch server-side, re-serve as a data URI.
//
// Unlike Rule34.xxx and Gelbooru (both now require an api_key + user_id even for anonymous
// reads), TBIB's DAPI is still fully open — confirmed live, no credentials needed. It doesn't
// return a `file_url` field though (only Gelbooru/Rule34 do); TBIB's own post shape gives
// `directory` + `image` (filename) instead, so the full/sample URLs have to be built by hand
// following their standard image path convention.
import { NextRequest, NextResponse } from "next/server";

// Without this, Next treats a GET route handler with no obviously-dynamic input as static and
// caches its response — every request for the same tags then got back the exact same
// already-random-picked image instead of a fresh pick. Force it dynamic so each hit re-runs.
export const dynamic = "force-dynamic";

const TBIB_API_BASE = "https://tbib.org/index.php";
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv"]);

function extOf(name: string | undefined): string | undefined {
  return name?.split(".").pop()?.toLowerCase();
}

function isVideoExt(ext: string | undefined): boolean {
  return !!ext && VIDEO_EXTS.has(ext);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tags = searchParams.get("tags") || "latex";
    const limit = Math.min(100, Number(searchParams.get("limit") || "40"));

    // 1. Fetch posts from TBIB's DAPI (Gelbooru-family JSON shape, no auth required).
    const apiUrl =
      `${TBIB_API_BASE}?page=dapi&s=post&q=index&json=1` +
      `&tags=${encodeURIComponent(tags)}&limit=${limit}`;
    const apiRes = await fetch(apiUrl, { headers: { "User-Agent": "FetishUI/1.0" }, cache: "no-store" });

    if (!apiRes.ok) {
      return NextResponse.json(
        { success: false, error: `TBIB API returned ${apiRes.status}` },
        { status: 502 }
      );
    }

    const posts: Array<{
      directory?: number;
      image?: string;
      sample?: boolean;
      width?: number;
      height?: number;
      tags?: string;
      rating?: string;
    }> = await apiRes.json();

    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json(
        { success: false, error: "No results for those tags" },
        { status: 404 }
      );
    }

    const valid = posts.filter((p) => p.directory != null && p.image);
    if (valid.length === 0) {
      return NextResponse.json(
        { success: false, error: "No downloadable files in results" },
        { status: 404 }
      );
    }

    // 2. Download the file server-side — the sample/full URLs are built by hand (see file
    // comment), so either can occasionally 404 even though the post itself is real. Shuffle the
    // valid pool and try a handful of distinct posts, each with its sample/full candidates in
    // order, before giving up — one bad URL shouldn't fail the whole request.
    const shuffled = [...valid].sort(() => Math.random() - 0.5).slice(0, 5);
    let lastError = "No downloadable files in results";

    for (const post of shuffled) {
      const fullUrl = `https://tbib.org/images/${post.directory}/${post.image}`;
      const sampleUrl = post.sample
        ? `https://tbib.org/samples/${post.directory}/sample_${post.image}`
        : undefined;
      // Prefer the (smaller) sample when one exists and the full file isn't a video.
      const candidates =
        sampleUrl && !isVideoExt(extOf(post.image)) ? [sampleUrl, fullUrl] : [fullUrl];

      for (const fileUrl of candidates) {
        let fileRes: Response;
        try {
          fileRes = await fetch(fileUrl, { headers: { "User-Agent": "FetishUI/1.0" }, cache: "no-store" });
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Network error downloading file";
          continue;
        }
        if (!fileRes.ok) {
          lastError = `Failed to download file (${fileRes.status})`;
          continue;
        }

        const contentType = fileRes.headers.get("content-type") || `image/${extOf(post.image) || "jpg"}`;
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;

        return NextResponse.json({
          success: true,
          url: dataUri,
          contentType,
          width: post.width || 0,
          height: post.height || 0,
          tags: post.tags || "",
          sourceUrl: fileUrl,
        });
      }
    }

    return NextResponse.json({ success: false, error: lastError }, { status: 502 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
