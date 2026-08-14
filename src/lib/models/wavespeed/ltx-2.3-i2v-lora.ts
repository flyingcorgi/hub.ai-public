import { Model } from "@/lib/types";

/**
 * LTX-2.3 Image-to-Video with LoRA support
 * DiT-based audio-video foundation model that generates synchronized video and audio,
 * with support for custom LoRAs for style, motion, or likeness training.
 * Endpoint: https://api.wavespeed.ai/api/v3/wavespeed-ai/ltx-2.3/image-to-video-lora
 */
export const wavespeed_ltx_2_3_i2v_lora: Model = {
  name: "LTX-2.3 I2V LoRA (WaveSpeed)",
  id: "wavespeed-ai/ltx-2.3/image-to-video-lora",
  mediaType: "video",
  inputSchema: [
    {
      key: "image",
      type: "image",
      required: true,
      description: "The image for the generation.",
    },
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The positive prompt for the generation.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "720p",
      options: ["480p", "720p", "1080p"],
      description: "Video resolution.",
    },
    {
      key: "duration",
      type: "number",
      default: 5,
      description: "The duration of the generated media in seconds.",
      validation: { min: 5, max: 20 },
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
