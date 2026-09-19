import { Model } from "@/lib/types";

/**
 * ByteDance Seedream V5 Pro Edit (Image to Image, uncensored) via Venice.ai
 * Endpoint: https://api.venice.ai/api/v1/image/edit (returns the edited image as binary data)
 * Request fields from Venice's OpenAPI spec (EditImageRequest); the edit model id is separate
 * from the text-to-image one and must be passed explicitly (the endpoint defaults elsewhere).
 */
export const venice_seedream_v5_pro_edit: Model = {
  name: "Seedream V5 Pro Edit (Venice)",
  id: "venice/seedream-v5-pro-edit",
  mediaType: "image",
  costEstimate: "$0.06 / image (1K), $0.11 (2K)",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description:
        "Text directions for the edit. Short, descriptive prompts work best (e.g. \"remove the tree in the background\").",
    },
    {
      key: "image",
      type: "image",
      required: true,
      description: "The image to edit (public URL or uploaded image).",
    },
    {
      key: "aspect_ratio",
      type: "enum",
      default: "auto",
      options: ["auto", "1:1", "3:2", "16:9", "21:9", "9:16", "2:3", "3:4", "4:5"],
      description:
        "The aspect ratio of the output image. \"auto\" infers the closest supported ratio from the input image.",
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
