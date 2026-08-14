import { Model } from "@/lib/types";

/**
 * Wavespeed-ai Wan-2.2 I2v-720p-ultra-fast
 * Generate unlimited ultra-fast 720p AI videos from images with Wan 2.2 A14B image-to-video model.
 */
export const wavespeed_wan_i2v_720p_ultra_fast: Model = {
  name: "Wan 2.2 I2V 720p Ultra Fast (WaveSpeed)",
  id: "wavespeed-ai/wan-2.2/i2v-720p-ultra-fast",
  mediaType: "video",
  inputSchema: [
    {
      key: "image",
      type: "image",
      description: "The image for generating the output. Can be a URL or Base64 data URI.",
    },
    {
      key: "prompt",
      type: "string",
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
    {
      key: "seed",
      type: "number",
      default: -1,
      description: "The random seed to use for the generation. -1 means a random seed will be used.",
    },
    {
      key: "enable_safety_checker",
      type: "boolean",
      default: false,
      description: "Whether to enable the safety checker. Default is false (disabled).",
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
        description: "URL of the generated video",
      },
    },
    {
      key: "id",
      type: "string",
      description: "Task ID",
    },
    {
      key: "status",
      type: "string",
      description: "Status of the task (completed or failed)",
    },
  ],
};
