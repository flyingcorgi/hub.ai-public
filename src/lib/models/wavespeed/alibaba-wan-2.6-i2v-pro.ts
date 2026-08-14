import { Model } from "@/lib/types";

/**
 * Alibaba Wan-2.6 Image-to-video-pro
 * Converts images into premium-quality videos with superior motion dynamics and cinematic output.
 */
export const alibaba_wan_2_6_i2v_pro: Model = {
  name: "Wan 2.6 Image-to-Video Pro (WaveSpeed)",
  id: "alibaba/wan-2.6/image-to-video-pro",
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
      default: "1080p",
      options: ["1080p", "2k", "4k"],
      description: "The resolution of the generated media.",
    },
    {
      key: "duration",
      type: "enum",
      default: 5,
      options: [5, 10, 15],
      description: "The duration of the generated media in seconds.",
    },
    {
      key: "shot_type",
      type: "enum",
      default: "single",
      options: ["single", "multi"],
      description: "The type of shots to generate.",
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
      description: "The random seed to use for the generation. -1 means random seed.",
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

