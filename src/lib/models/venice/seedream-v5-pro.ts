import { Model } from "@/lib/types";

/**
 * ByteDance Seedream V5 Pro (Text to Image, uncensored) via Venice.ai
 * Endpoint: https://api.venice.ai/api/v1/image/generate
 * Constraints from Venice's model catalog (aspect ratios, resolutions, defaults).
 */
export const venice_seedream_v5_pro: Model = {
  name: "Seedream V5 Pro (Venice)",
  id: "venice/seedream-v5-pro",
  mediaType: "image",
  costEstimate: "$0.06 / image (1K), $0.11 (2K)",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The positive prompt for the generation (up to 10000 characters).",
    },
    {
      key: "negative_prompt",
      type: "string",
      description: "A description of what should not be in the image.",
    },
    {
      key: "aspect_ratio",
      type: "enum",
      default: "1:1",
      options: ["1:1", "3:2", "16:9", "9:16", "2:3", "3:4"],
      description: "The aspect ratio of the generated image.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "1K",
      options: ["1K", "2K"],
      description: "The output resolution tier. 1K is the lower-cost tier; 2K is the higher-cost tier.",
    },
    {
      key: "format",
      type: "enum",
      default: "jpeg",
      options: ["jpeg", "png", "webp"],
      description: "The format of the output image.",
    },
    {
      key: "seed",
      type: "number",
      description: "Random seed for generation. Leave empty for a random seed.",
    },
  ],
  outputSchema: [
    {
      key: "images",
      type: "array",
      required: true,
      description: "Array of generated images (base64 data URIs).",
      items: {
        type: "string",
        description: "Base64 data URI of the generated image.",
      },
    },
    {
      key: "id",
      type: "string",
      description: "Unique identifier for the request.",
    },
  ],
};
