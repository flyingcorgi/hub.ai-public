import { Model } from "@/lib/types";

/**
 * FLUX.2 [klein] 9B Text-to-Image
 * High-quality text-to-image model with 9B parameters, offering enhanced realism and
 * crisper text generation.
 * Endpoint: https://api.wavespeed.ai/api/v3/wavespeed-ai/flux-2-klein-9b/text-to-image
 */
export const wavespeed_flux_2_klein_9b_text_to_image: Model = {
  name: "FLUX.2 Klein 9B (WaveSpeed)",
  id: "wavespeed-ai/flux-2-klein-9b/text-to-image",
  mediaType: "image",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The positive prompt for the generation.",
    },
    {
      key: "size",
      type: "string",
      default: "1024*1024",
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
