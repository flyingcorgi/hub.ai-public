import { Model } from "@/lib/types";

/**
 * Wavespeed-ai Infinitetalk
 * InfiniteTalk converts one photo + audio into audio-driven talking or singing avatar videos (Image-to-Video), 
 * up to 10 minutes, 720p tier $0.30/5s.
 */
export const wavespeed_infinitetalk: Model = {
  name: "Infinitetalk (WaveSpeed)",
  id: "wavespeed-ai/infinitetalk",
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
      description: "The audio for generating the output. Can be a URL or Base64 data URI.",
    },
    {
      key: "mask_image",
      type: "image",
      description: "Optional mask image to specify the person in the image to animate.",
    },
    {
      key: "prompt",
      type: "string",
      description: "The positive prompt for the generation.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "480p",
      options: ["480p", "720p"],
      description: "The resolution of the output video. 720p tier costs $0.30/5s.",
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
