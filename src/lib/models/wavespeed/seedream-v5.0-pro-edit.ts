import { Model } from "@/lib/types";

/**
 * ByteDance Seedream V5.0 Pro Edit
 * Edits and generates images from single-image or multi-reference inputs (up to 10 images).
 * Endpoint: https://api.wavespeed.ai/api/v3/bytedance/seedream-v5.0-pro/edit
 */
export const wavespeed_seedream_v5_pro_edit: Model = {
  name: "Seedream 5.0 Pro Edit (WaveSpeed)",
  id: "bytedance/seedream-v5.0-pro/edit",
  mediaType: "image",
  inputSchema: [
    {
      key: "images",
      type: "array",
      required: true,
      description: "The images to edit. A maximum of 10 reference images can be uploaded.",
      items: {
        type: "image",
        description: "Image URL or uploaded file converted to a data URI.",
      },
    },
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The positive prompt for the generation.",
    },
    {
      key: "aspect_ratio",
      type: "enum",
      options: [
        "1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2",
        "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9",
      ],
      description:
        "The aspect ratio of the generated image. Leave empty to automatically use the closest supported aspect ratio based on the first input image.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "1k",
      options: ["1k", "2k"],
      description:
        "The output resolution tier used for billing. 1k is the lower-cost tier; 2k is the higher-cost tier.",
    },
    {
      key: "output_format",
      type: "enum",
      default: "jpeg",
      options: ["jpeg", "png"],
      description: "The format of the output image.",
    },
  ],
  outputSchema: [
    {
      key: "outputs",
      type: "array",
      required: true,
      description: "Array of URLs to the generated images.",
      items: {
        type: "string",
        description: "URL of the generated image.",
      },
    },
    {
      key: "id",
      type: "string",
      description: "Unique identifier for the prediction.",
    },
    {
      key: "status",
      type: "string",
      description: "Status of the task: created, processing, completed, or failed.",
    },
  ],
};
