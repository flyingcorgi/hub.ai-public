import { Model } from "@/lib/types";

/**
 * ByteDance Seedream 4.5 Edit via WaveSpeed
 * Endpoint: https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit
 */
export const wavespeed_seedream_4_5_edit: Model = {
  name: "Seedream 4.5 Edit (WaveSpeed)",
  id: "bytedance/seedream-v4.5/edit",
  mediaType: "image",
  inputSchema: [
    {
      key: "images",
      type: "array",
      required: true,
      description:
        "Reference images to edit. Upload or paste up to 10 public URLs/base64 data URIs.",
      items: {
        type: "image",
        description: "Image URL or uploaded file converted to a data URI.",
      },
    },
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The positive prompt describing the desired image edit.",
    },
    {
      key: "size",
      type: "string",
      default: "2560*1440",
      description:
        "Optional generated image size as width*height (for example, 1024*1024). Each dimension supports 512 to 8192 pixels.",
      validation: {
        pattern: "^\\d+\\*\\d+$",
      },
    },
    {
      key: "enable_safety_checker",
      type: "boolean",
      default: false,
      description: "Forced off for WaveSpeed requests by the app.",
    },
  ],
  outputSchema: [
    {
      key: "outputs",
      type: "array",
      required: true,
      description: "Array of URLs to the generated edited images.",
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
