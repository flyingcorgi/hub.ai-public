import { Model } from "@/lib/types";

/**
 * OpenAI GPT Image 2 Text-to-Image
 * Generates high-quality images from natural-language prompts.
 * Endpoint: https://api.wavespeed.ai/api/v3/openai/gpt-image-2/text-to-image
 */
export const wavespeed_gpt_image_2_text_to_image: Model = {
  name: "GPT Image 2 (WaveSpeed)",
  id: "openai/gpt-image-2/text-to-image",
  mediaType: "image",
  inputSchema: [
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
      description: "The aspect ratio of the generated image.",
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
