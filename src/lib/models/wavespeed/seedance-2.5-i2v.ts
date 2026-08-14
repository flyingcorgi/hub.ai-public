import { Model } from "@/lib/types";

/**
 * WaveSpeed Seedance 2.5 Image-to-Video
 * Generates Hollywood-grade cinematic videos from a reference image and text prompt, with native
 * audio-visual sync, director-level camera/lighting control, and exceptional motion stability.
 */
export const wavespeed_seedance_2_5_i2v: Model = {
  name: "Seedance 2.5 Image-to-Video (WaveSpeed)",
  id: "bytedance/seedance-2.5/image-to-video",
  mediaType: "video",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "Describe the scene, action, camera movement, and mood for the video.",
    },
    {
      key: "image",
      type: "image",
      required: true,
      description: "Start image URL to guide the video generation.",
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
