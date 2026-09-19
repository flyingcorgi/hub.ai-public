// Venice's /image/edit and /image/multi-edit endpoints reject any input image smaller than
// 256x256 pixels ("Image N (WxH) must be at least 256x256 pixels"). Small reference/style
// thumbnails (icons, cropped stock images) routinely fall under that, so uploads are upscaled
// client-side to meet the minimum instead of failing at generation time with a cryptic 400.
const MIN_EDIT_IMAGE_SIZE = 256;

// Plain File -> data URL, no resizing. For images that are never sent to a model (e.g. a
// choice's decorative picker icon), where Venice's minimum-size rule doesn't apply and small
// source images shouldn't be force-upscaled.
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

function upscaleToDataUrl(img: HTMLImageElement, minSize: number): string {
  const scale = Math.max(minSize / img.naturalWidth, minSize / img.naturalHeight);
  const width = Math.ceil(img.naturalWidth * scale);
  const height = Math.ceil(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

// Reads a File as a data URL, upscaling it first if either dimension is below Venice's 256px
// minimum. Images already at or above the minimum are returned untouched (no re-encoding).
export async function readImageFileAsDataUrl(file: File, minSize = MIN_EDIT_IMAGE_SIZE): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  if (img.naturalWidth >= minSize && img.naturalHeight >= minSize) return dataUrl;
  return upscaleToDataUrl(img, minSize);
}

// Longest edge a vision/chat model is sent. Captioning needs enough detail to describe a scene,
// not print resolution — and an un-resized phone photo is several MB of base64 per request, which
// is slow, costs tokens, and pushes request bodies toward the limits the architecture baseline
// requires us to bound. 1024px is the usual sweet spot for hosted vision models.
export const MAX_VISION_IMAGE_SIZE = 1024;

// Downscales an image for use as vision input and re-encodes it as JPEG. Images already within
// the bound are still re-encoded only when they aren't already JPEG, so a large PNG screenshot
// doesn't travel as multi-MB base64. Never upscales.
export async function downscaleForVision(
  dataUrl: string,
  maxSize = MAX_VISION_IMAGE_SIZE
): Promise<string> {
  const img = await loadImage(dataUrl);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const alreadySmallJpeg = longest <= maxSize && /^data:image\/jpeg;/i.test(dataUrl);
  if (alreadySmallJpeg) return dataUrl;

  const scale = longest > maxSize ? maxSize / longest : 1;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

const COMPARISON_LABEL_FONT = "bold 28px sans-serif";
const COMPARISON_LABEL_PADDING = 12;
const COMPARISON_LABEL_MARGIN = 16;

function drawComparisonLabel(ctx: CanvasRenderingContext2D, text: string, originX: number, canvasHeight: number) {
  ctx.font = COMPARISON_LABEL_FONT;
  const metrics = ctx.measureText(text);
  const boxWidth = metrics.width + COMPARISON_LABEL_PADDING * 2;
  const boxHeight = 28 + COMPARISON_LABEL_PADDING * 2;
  const x = originX + COMPARISON_LABEL_MARGIN;
  const y = canvasHeight - boxHeight - COMPARISON_LABEL_MARGIN;

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(x, y, boxWidth, boxHeight);

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + COMPARISON_LABEL_PADDING, y + boxHeight / 2);
}

// Pure client-side compositing — no model call involved, just two images placed side by side on
// a canvas with "Before"/"After" labels burned in. `before` is the user's original upload,
// `after` is the workflow's final result; both are scaled to a shared height (capped at 1024px,
// and never upscaled past either image's own size) so mismatched aspect ratios still line up.
export async function createBeforeAfterImage(beforeUrl: string, afterUrl: string): Promise<string> {
  const [beforeImg, afterImg] = await Promise.all([loadImage(beforeUrl), loadImage(afterUrl)]);

  const commonHeight = Math.min(beforeImg.naturalHeight, afterImg.naturalHeight, 1024);
  const beforeWidth = Math.round(beforeImg.naturalWidth * (commonHeight / beforeImg.naturalHeight));
  const afterWidth = Math.round(afterImg.naturalWidth * (commonHeight / afterImg.naturalHeight));
  const gap = 4;

  const canvas = document.createElement("canvas");
  canvas.width = beforeWidth + gap + afterWidth;
  canvas.height = commonHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(beforeImg, 0, 0, beforeWidth, commonHeight);
  ctx.drawImage(afterImg, beforeWidth + gap, 0, afterWidth, commonHeight);

  drawComparisonLabel(ctx, "Before", 0, commonHeight);
  drawComparisonLabel(ctx, "After", beforeWidth + gap, commonHeight);

  return canvas.toDataURL("image/jpeg", 0.92);
}

import type { TextAlign, TextColorMode } from "@/lib/workflows/designer-types";

export interface TextBoxSpec {
  text: string;
  // Center point of the box, as a percentage of the image's width/height (0-100) — lets the box
  // be dragged to any spot instead of a fixed top/center/bottom anchor.
  xPercent: number;
  yPercent: number;
  // Box width as a percentage of the image's width — this is what the text wraps to, and what
  // resizing the box on screen actually changes. Height is never stored: it's always exactly
  // whatever the wrapped lines need, so there's nothing to scroll.
  widthPercent: number;
  align: TextAlign;
  // Used when colorMode is "solid"; ignored (but still kept as a fallback) otherwise. Emoji
  // glyphs always render in their own native color regardless of colorMode.
  color: string;
  // "gradient" fills with a left-to-right linear gradient across the box using gradientStops
  // (2+ hex colors) instead of the flat color above.
  colorMode: TextColorMode;
  gradientStops: string[];
  // CSS font-family stack (see TEXT_FONT_OPTIONS in designer-types.ts).
  fontFamily: string;
  // Font size as a percentage of the image's width, so it scales with the image.
  sizePercent: number;
  bold: boolean;
  // strokeWidth 0 disables the outline.
  strokeColor: string;
  strokeWidth: number;
  // Stacks several diagonally-offset copies of the text behind the fill, in strokeColor, for a
  // solid extruded/embossed "pop text" look.
  emboss: boolean;
}

// Converts the designer's fixed top/center/bottom anchor into the same xPercent/yPercent
// coordinate space TextBoxSpec expects, for callers that aren't dragging anything.
export function anchorToPercent(position: "top" | "center" | "bottom"): { xPercent: number; yPercent: number } {
  const yPercent = position === "top" ? 12 : position === "bottom" ? 88 : 50;
  return { xPercent: 50, yPercent };
}

function wrapTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

// A left-to-right linear gradient across the box's full width — used for every line regardless
// of its own (shorter, wrapped) width, so multi-line text reads as one continuous gradient
// rather than each line getting its own independent one.
function buildFillStyle(
  ctx: CanvasRenderingContext2D,
  box: TextBoxSpec,
  centerX: number,
  boxWidthPx: number
): string | CanvasGradient {
  if (box.colorMode === "gradient" && box.gradientStops.length >= 2) {
    const gradient = ctx.createLinearGradient(centerX - boxWidthPx / 2, 0, centerX + boxWidthPx / 2, 0);
    const stops = box.gradientStops;
    stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), color));
    return gradient;
  }
  return box.color;
}

function drawTextBox(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, box: TextBoxSpec) {
  const trimmed = box.text.trim();
  if (!trimmed) return;

  const fontSize = Math.max(8, Math.round((box.sizePercent / 100) * canvas.width));
  ctx.font = `${box.bold ? "bold " : ""}${fontSize}px ${box.fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = box.align;
  if (box.strokeWidth > 0) {
    ctx.strokeStyle = box.strokeColor;
    ctx.lineWidth = box.strokeWidth * (fontSize / 40);
    ctx.lineJoin = "round";
  }

  const boxWidthPx = Math.max(1, (box.widthPercent / 100) * canvas.width);
  const centerX = (box.xPercent / 100) * canvas.width;
  const centerY = (box.yPercent / 100) * canvas.height;
  const lineX = box.align === "left" ? centerX - boxWidthPx / 2 : box.align === "right" ? centerX + boxWidthPx / 2 : centerX;
  const fillStyle = buildFillStyle(ctx, box, centerX, boxWidthPx);

  const lines = wrapTextToWidth(ctx, trimmed, boxWidthPx);
  const lineHeight = fontSize * 1.25;
  const blockHeight = lines.length * lineHeight;
  let y = centerY - blockHeight / 2 + lineHeight / 2;

  // "Pop text": a stack of solid copies stepping diagonally down-right, in the outline color,
  // drawn before the real fill — reads as an extruded/embossed block rather than a flat outline.
  // Total depth (steps * step size) is kept to ~10% of the font size — enough to read clearly as
  // a 3D/extruded edge without the shadow stack overwhelming the front fill.
  const EMBOSS_STEPS = 5;
  const embossStepPx = Math.max(1, fontSize * 0.02);

  for (const line of lines) {
    if (box.emboss) {
      ctx.fillStyle = box.strokeColor;
      for (let i = EMBOSS_STEPS; i >= 1; i--) {
        ctx.fillText(line, lineX + i * embossStepPx, y + i * embossStepPx);
      }
    }
    if (box.strokeWidth > 0) ctx.strokeText(line, lineX, y);
    ctx.fillStyle = fillStyle;
    ctx.fillText(line, lineX, y);
    y += lineHeight;
  }
}

// Draws one or more text boxes directly onto an image with the Canvas API — no model call, so
// it's instant, free, and never garbles the wording the way asking an AI image model to render
// text tends to.
export async function drawTextBoxesOnImage(imageUrl: string, boxes: TextBoxSpec[]): Promise<string> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.drawImage(img, 0, 0);

  // Custom web fonts (e.g. the "Bubbly" Fredoka option) need to actually finish loading before
  // fillText rasterizes them, or canvas silently falls back to a system font for that draw —
  // even though the live HTML preview (driven by CSS, which repaints once the font arrives)
  // already looks correct. System fonts resolve this instantly as a no-op.
  if (typeof document !== "undefined" && "fonts" in document) {
    await Promise.all(
      boxes.map((box) => {
        const fontSize = Math.max(8, Math.round((box.sizePercent / 100) * canvas.width));
        return document.fonts.load(`${box.bold ? "bold " : ""}${fontSize}px ${box.fontFamily}`).catch(() => undefined);
      })
    );
    await document.fonts.ready;
  }

  for (const box of boxes) drawTextBox(ctx, canvas, box);

  return canvas.toDataURL("image/png");
}
