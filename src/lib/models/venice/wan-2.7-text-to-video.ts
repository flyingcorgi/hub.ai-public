import { Model } from "@/lib/types";

/**
 * Wan 2.7 (Text to Video, uncensored) via Venice.ai
 * Endpoints: https://api.venice.ai/api/v1/video/queue + /video/retrieve (queued/polled)
 * Constraints from Venice's model catalog (aspect ratios, resolutions, durations).
 */
export const venice_wan_2_7_text_to_video: Model = {
  name: "Wan 2.7 Text to Video (Venice)",
  id: "venice/wan-2-7-text-to-video",
  mediaType: "video",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The prompt describing the video to generate.",
    },
    {
      key: "negative_prompt",
      type: "string",
      description: "A description of what should not be in the video.",
    },
    {
      key: "aspect_ratio",
      type: "enum",
      default: "16:9",
      options: ["16:9", "9:16", "1:1"],
      description: "The aspect ratio of the generated video.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "720p",
      options: ["720p", "1080p"],
      description: "The resolution of the generated video.",
    },
    {
      key: "duration",
      type: "enum",
      default: "5s",
      options: ["5s", "10s", "15s"],
      description: "The duration of the generated video.",
    },
  ],
  outputSchema: [
    {
      key: "video",
      type: "string",
      required: true,
      description: "URL (or data URI) of the generated mp4 video.",
    },
    {
      key: "queue_id",
      type: "string",
      description: "Unique identifier for the queued generation request.",
    },
  ],
};
