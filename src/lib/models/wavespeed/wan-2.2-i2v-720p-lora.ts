import { Model } from "@/lib/types";

/**
 * WAN 2.2 Image-to-Video (i2v) 720p with LoRA support
 * Converts images into 720p videos with support for custom LoRAs for style
 * personalization, including separate high-noise and low-noise LoRA slots.
 * Endpoint: https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/i2v-720p-lora
 */
const loraArrayField = (key: string, description: string) => ({
  key,
  type: "array" as const,
  description,
  items: {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description: "URL or the path to the LoRA weights.",
      },
      scale: {
        type: "number" as const,
        description: "The scale of the LoRA weight.",
        validation: { min: 0, max: 2 },
        default: 1,
      },
    },
  },
});

export const wavespeed_wan_2_2_i2v_720p_lora: Model = {
  name: "Wan 2.2 I2V 720p LoRA (WaveSpeed)",
  id: "wavespeed-ai/wan-2.2/i2v-720p-lora",
  mediaType: "video",
  inputSchema: [
    {
      key: "image",
      type: "image",
      required: true,
      description: "The image for generating the output.",
    },
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The positive prompt for the generation.",
    },
    {
      key: "negative_prompt",
      type: "string",
      description: "The negative prompt for the generation.",
    },
    {
      key: "last_image",
      type: "image",
      description: "The last image for generating the output.",
    },
    {
      key: "duration",
      type: "enum",
      default: 5,
      options: [5, 8],
      description: "The duration of the generated media in seconds.",
    },
    loraArrayField("loras", "The LoRAs to apply (maximum 3)."),
    loraArrayField("high_noise_loras", "High noise LoRAs to apply (maximum 3)."),
    loraArrayField("low_noise_loras", "Low noise LoRAs to apply (maximum 3)."),
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
      description: "Array of output video URLs.",
      items: {
        type: "string",
        description: "URL of the generated video.",
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
