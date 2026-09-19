import { Model } from "@/lib/types";

/**
 * ByteDance Seedream V5 Pro Edit (Multi-Image Edit, uncensored) via Venice.ai
 * Endpoint: https://api.venice.ai/api/v1/image/multi-edit (returns the edited image as binary
 * data). Same underlying model as venice/seedream-v5-pro-edit, but a different request shape —
 * this endpoint takes an `images` array (base image plus up to 5 layered references/masks)
 * instead of a single `image`. Registered as its own model because the two endpoints have
 * incompatible schemas and this app's routing (see generate-venice.ts) picks the endpoint from
 * the model's own inputSchema shape. Venice's own model id is the same "seedream-v5-pro-edit"
 * for both — see VENICE_MODEL_ID_OVERRIDES in generate-venice.ts.
 */
export const venice_seedream_v5_pro_multi_edit: Model = {
  name: "Seedream V5 Pro Multi-Edit (Venice)",
  id: "venice/seedream-v5-pro-multi-edit",
  mediaType: "image",
  costEstimate: "$0.06 / image (1K), $0.11 (2K) — plus $0.0035 per image past the first",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description:
        "Text directions for the edit. Short, descriptive prompts work best (e.g. \"blend the outfit from image 2 onto the person in image 1\").",
    },
    {
      key: "images",
      type: "array",
      required: true,
      items: { type: "image" },
      description:
        "Up to 6 images (public URLs or uploaded images). The first is treated as the base image; the rest are layered edits, masks, or references.",
      validation: { min: 1, max: 6 },
    },
    {
      key: "aspect_ratio",
      type: "enum",
      default: "auto",
      options: ["auto", "1:1", "3:2", "16:9", "21:9", "9:16", "2:3", "3:4", "4:5"],
      description:
        "The aspect ratio of the output image. \"auto\" infers the closest supported ratio from the first input image.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "1K",
      options: ["1K", "2K"],
      description: "The output resolution tier. 1K is the lower-cost tier; 2K is the higher-cost tier.",
    },
    {
      key: "output_format",
      type: "enum",
      default: "jpeg",
      options: ["jpeg", "png", "webp"],
      description: "The format of the output image.",
    },
  ],
  outputSchema: [
    {
      key: "image",
      type: "string",
      required: true,
      description: "The edited image, returned as binary data in the requested output_format.",
    },
  ],
};
