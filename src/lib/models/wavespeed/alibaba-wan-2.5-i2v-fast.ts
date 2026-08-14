import { Model } from "@/lib/types";

/**
 * Alibaba Wan-2.5 Image-to-video-fast
 * Alibaba WAN 2.5 Fast converts text or images into synchronized-audio videos in 480p, 720p, or 1080p,
 * offering faster, more affordable generation compared to Google Veo3.
 */
export const alibaba_wan_2_5_i2v_fast: Model = {
  name: "Wan 2.5 Image-to-Video Fast (WaveSpeed)",
  id: "alibaba/wan-2.5/image-to-video-fast",
  mediaType: "video",
  inputSchema: [
    {
      key: "image",
      type: "image",
      description: "The image for generating the output. Can be a URL or Base64 data URI.",
    },
    {
      key: "audio",
      type: "audio",
      description: "Audio URL to guide generation (optional).",
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
      key: "resolution",
      type: "enum",
      default: "720p",
      options: ["720p", "1080p"],
      description: "The resolution of the generated media.",
    },
    {
      key: "duration",
      type: "enum",
      default: 5,
      options: [3, 4, 5, 6, 7, 8, 9, 10],
      description: "The duration of the generated media in seconds.",
    },
    {
      key: "enable_prompt_expansion",
      type: "boolean",
      default: false,
      description: "If set to true, the prompt optimizer will be enabled.",
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
