import { Model } from "@/lib/types";

/**
 * WaveSpeed Seedance 2.5 Image-to-Video Spicy
 * Fast image-to-video generation optimized for scalable content generation — smooth animations
 * and stable aesthetics, with an optional (rather than required) text prompt.
 */
export const wavespeed_seedance_2_5_i2v_spicy: Model = {
  name: "Seedance 2.5 Image-to-Video Spicy (WaveSpeed)",
  id: "bytedance/seedance-2.5/image-to-video-spicy",
  mediaType: "video",
  inputSchema: [
    {
      key: "image",
      type: "image",
      required: true,
      description: "Start image URL to guide the video generation.",
    },
    {
      key: "prompt",
      type: "string",
      description: "Describe the scene, action, camera movement, and mood for the video.",
    },
    {
      key: "last_image",
      type: "image",
      description: "Last frame image URL for video continuation.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "720p",
      options: ["480p", "720p", "1080p", "4k"],
      description: "The output video resolution.",
    },
    {
      key: "duration",
      type: "number",
      default: 5,
      description: "The duration of the generated video in seconds.",
      validation: { min: 4, max: 30 },
    },
    {
      key: "generate_audio",
      type: "boolean",
      default: true,
      description: "Whether to generate native audio synchronized with the output video.",
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
