import { Model } from "@/lib/types";

/**
 * ByteDance Seedance 2.0 (Image to Video)
 * Hollywood-grade cinematic image-to-video generation with native audio-visual sync,
 * director-level camera/lighting control, and exceptional motion stability.
 * Endpoint: https://api.wavespeed.ai/api/v3/bytedance/seedance-2.0/image-to-video
 */
export const wavespeed_seedance_2_i2v: Model = {
  name: "Seedance 2.0 I2V (WaveSpeed)",
  id: "bytedance/seedance-2.0/image-to-video",
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
      required: true,
      description: "Describe the scene, action, camera movement, and mood for the video.",
    },
    {
      key: "last_image",
      type: "image",
      description: "Last frame image URL for video continuation.",
    },
    {
      key: "aspect_ratio",
      type: "enum",
      options: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
      description: "The aspect ratio of the generated video. If not specified, adapts to the input image.",
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
      description: "The duration of the generated video in seconds (4-15s).",
      validation: { min: 4, max: 15 },
    },
    {
      key: "enable_web_search",
      type: "boolean",
      default: false,
      description: "Enable web search for real-time information.",
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
