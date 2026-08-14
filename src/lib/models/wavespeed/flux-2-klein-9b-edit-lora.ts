import { Model } from "@/lib/types";

/**
 * FLUX.2 [klein] 9B Edit with LoRA support
 * High-quality image editing model with 9B parameters, offering precise modifications
 * using natural language instructions and personalized styles via custom LoRA adapters.
 * Endpoint: https://api.wavespeed.ai/api/v3/wavespeed-ai/flux-2-klein-9b/edit-lora
 */
export const wavespeed_flux_2_klein_9b_edit_lora: Model = {
  name: "FLUX.2 Klein 9B Edit LoRA (WaveSpeed)",
  id: "wavespeed-ai/flux-2-klein-9b/edit-lora",
  mediaType: "image",
  inputSchema: [
    {
      key: "images",
      type: "array",
      required: true,
      description: "List of reference image URLs (1-3 images).",
      items: {
        type: "image",
        description: "Image URL or uploaded file converted to a data URI.",
      },
    },
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The editing instruction.",
    },
    {
      key: "loras",
      type: "array",
      description: "The LoRAs to apply (maximum 3).",
      items: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "URL or the path to the LoRA weights.",
          },
          scale: {
            type: "number",
            description: "The scale of the LoRA weight.",
            validation: { min: 0, max: 2 },
            default: 1,
          },
        },
      },
    },
    {
      key: "size",
      type: "string",
      description: "The size of the generated media in pixels (width*height).",
      validation: {
        pattern: "^\\d+\\*\\d+$",
      },
    },
    {
      key: "seed",
      type: "number",
      default: -1,
      description: "The random seed to use for the generation. -1 means a random seed will be used.",
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
