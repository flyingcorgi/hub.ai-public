import { Model } from "@/lib/types";

/**
 * Z-Image-Turbo LoRA (6B)
 * Ultra-fast text-to-image generation with external LoRA support, sub-second latency,
 * up to 3 LoRAs for custom styles.
 * Endpoint: https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image/turbo-lora
 */
export const wavespeed_z_image_turbo_lora: Model = {
  name: "Z-Image Turbo LoRA (WaveSpeed)",
  id: "wavespeed-ai/z-image/turbo-lora",
  mediaType: "image",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The positive prompt for the generation.",
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
      default: "1440*1440",
      description: "The size of the generated media in pixels (width*height). Other aspect ratios work as long as they stay around \"1K\" scale (max side ~1440).",
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
