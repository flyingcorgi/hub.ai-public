import { Model } from "@/lib/types";

/**
 * Wavespeed-ai Multitalk
 * MultiTalk converts one image and audio into audio-driven talking/singing videos (Image-to-Video), 
 * supporting up to 10 minutes.
 */
export const wavespeed_multitalk: Model = {
  name: "Multitalk (WaveSpeed)",
  id: "wavespeed-ai/multitalk",
  mediaType: "video",
  inputSchema: [
    {
      key: "image",
      type: "image",
      required: true,
      description: "The image for generating the output. Can be a URL or Base64 data URI.",
    },
    {
      key: "audio",
      type: "audio",
      required: true,
      description: "The audio for generating the output. Can be a URL or Base64 data URI.",
    },
    {
      key: "prompt",
      type: "string",
      description: "The positive prompt for the generation.",
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
