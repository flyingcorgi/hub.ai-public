import { Model } from "@/lib/types";

/**
 * OpenAI GPT Image 2 Edit
 * Edits images from natural-language instructions with one or more reference images.
 * Endpoint: https://api.wavespeed.ai/api/v3/openai/gpt-image-2/edit
 */
export const wavespeed_gpt_image_2_edit: Model = {
  name: "GPT Image 2 Edit (WaveSpeed)",
  id: "openai/gpt-image-2/edit",
  mediaType: "image",
  inputSchema: [
    {
      key: "images",
      type: "array",
      required: true,
      description: "List of URLs of input images for editing.",
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
      description: "The aspect ratio of the generated image. Auto-detected from input image if not specified.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "1k",
      options: ["1k", "2k", "4k"],
      description: "The resolution of the output image.",
    },
    {
      key: "quality",
      type: "enum",
      default: "medium",
      options: ["low", "medium", "high"],
      description: "The quality of the generated image. Higher quality costs more.",
    },
    {
      key: "output_format",
      type: "enum",
      default: "png",
      options: ["png", "jpeg", "webp"],
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
