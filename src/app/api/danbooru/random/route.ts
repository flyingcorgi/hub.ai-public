// Server-side API route: proxies a random image from Danbooru by tag.
// Danbooru's CDN blocks direct browser requests (hotlink protection) but allows
// server-side fetches — same pattern as album media and Venice generation.
//
// For animated posts (mp4/webm), file_url returns a video that <img> can't display.
// We prefer large_file_url first (higher quality still/anim), then preview_file_url
// (guaranteed displayable), then file_url as last resort.
import { NextRequest, NextResponse } from "next/server";

const DANBOORU_BASE = "https://danbooru.donmai.us";
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv"]);

function isVideoExt(ext: string | undefined): boolean {
  return !!ext && VIDEO_EXTS.has(ext.toLowerCase());
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tags = searchParams.get("tags") || "blonde";
    const limit = Math.min(50, Number(searchParams.get("limit") || "20"));

    // 1. Fetch posts from Danbooru API
    const apiUrl = `${DANBOORU_BASE}/posts.json?tags=${encodeURIComponent(tags)}&limit=${limit}&random=true`;
    const apiRes = await fetch(apiUrl, {
      headers: { "User-Agent": "FetishUI/1.0" },
    });

    if (!apiRes.ok) {
      return NextResponse.json(
        { success: false, error: `Danbooru API returned ${apiRes.status}` },
        { status: 502 }
      );
    }

    const posts: Array<{
      file_url?: string;
      large_file_url?: string;
      preview_file_url?: string;
      file_ext?: string;
      image_width?: number;
      image_height?: number;
      file_size?: number;
      tag_string?: string;
    }> = await apiRes.json();

    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json(
        { success: false, error: "No results for those tags" },
        { status: 404 }
      );
    }

    // 2. Filter to posts with valid URLs, pick random
    const valid = posts.filter(
      (p) => p.file_url || p.large_file_url || p.preview_file_url
    );
    if (valid.length === 0) {
      return NextResponse.json(
        { success: false, error: "No downloadable files in results" },
        { status: 404 }
      );
    }

    const post = valid[Math.floor(Math.random() * valid.length)];

    // 3. Pick the best displayable URL:
    //    - large_file_url if it's not a video (best quality)
    //    - file_url if it's not a video (original quality)
    //    - preview_file_url as fallback (always displayable, lower quality)
    let fileUrl: string;
    if (post.large_file_url && !isVideoExt(post.large_file_url.split(".").pop())) {
      fileUrl = post.large_file_url;
    } else if (post.file_url && !isVideoExt(post.file_ext)) {
      fileUrl = post.file_url;
    } else if (post.large_file_url) {
      // large_file_url exists but is video — use preview which is always an image
      fileUrl = post.preview_file_url || post.file_url!;
    } else {
      fileUrl = post.preview_file_url || post.file_url!;
    }

    // 4. Download the file server-side (CDN allows this, blocks browsers)
    const fileRes = await fetch(fileUrl, {
      headers: { "User-Agent": "FetishUI/1.0" },
    });

    if (!fileRes.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to download file (${fileRes.status})` },
        { status: 502 }
      );
    }

    const contentType =
      fileRes.headers.get("content-type") ||
      `image/${post.file_ext || "jpg"}`;
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const b64 = buffer.toString("base64");
    const dataUri = `data:${contentType};base64,${b64}`;

    return NextResponse.json({
      success: true,
      url: dataUri,
      contentType,
      width: post.image_width || 0,
      height: post.image_height || 0,
      size: post.file_size || 0,
      tags: post.tag_string || "",
      sourceUrl: fileUrl,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}