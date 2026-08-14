import { Model } from "@/lib/types";

/**
 * X-AI Grok Imagine Video (Image to Video)
 * Animates a still image into a video with natural motion and scene continuity.
 * Endpoint: https://api.wavespeed.ai/api/v3/x-ai/grok-imagine-video/image-to-video
 */
export const wavespeed_grok_imagine_video_i2v: Model = {
  name: "Grok Imagine I2V (WaveSpeed)",
  id: "x-ai/grok-imagine-video/image-to-video",
  mediaType: "video",
  inputSchema: [
    {
      key: "image",
      type: "image",
      required: true,
      description: "URL of the input image for video generation.",
    },
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "Text description of desired motion or changes in the video.",
    },
    {
      key: "duration",
      type: "enum",
      default: 6,
      options: [6, 10],
      description: "Video duration in seconds.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "720p",
      options: ["720p", "480p"],
      description: "Resolution of the output video.",
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
