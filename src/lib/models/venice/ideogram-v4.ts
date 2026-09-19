import { Model } from "@/lib/types";

/**
 * Ideogram V4 (Text to Image) via Venice.ai
 * Endpoint: https://api.venice.ai/api/v1/image/generate
 * Constraints from Venice's model catalog (aspect ratios, defaults).
 */
export const venice_ideogram_v4: Model = {
  name: "Ideogram V4 (Venice)",
  id: "venice/ideogram-v4",
  mediaType: "image",
  costEstimate: "$0.06 / image",
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
      options: ["1:1", "3:2", "16:9", "21:9", "9:16", "2:3", "3:4", "4:5"],
      description: "The aspect ratio of the generated image.",
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
