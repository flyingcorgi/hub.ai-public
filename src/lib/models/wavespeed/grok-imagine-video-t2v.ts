import { Model } from "@/lib/types";

/**
 * X-AI Grok Imagine Video (Text to Video)
 * Generates a video directly from a text description.
 * Endpoint: https://api.wavespeed.ai/api/v3/x-ai/grok-imagine-video/text-to-video
 */
export const wavespeed_grok_imagine_video_t2v: Model = {
  name: "Grok Imagine T2V (WaveSpeed)",
  id: "x-ai/grok-imagine-video/text-to-video",
  mediaType: "video",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "Text description of the desired video.",
    },
    {
      key: "duration",
      type: "enum",
      default: 6,
      options: [6, 10],
      description: "Video duration in seconds.",
    },
    {
      key: "aspect_ratio",
      type: "enum",
      default: "16:9",
      options: ["16:9", "1:1", "9:16"],
      description: "Aspect ratio of the generated video.",
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
