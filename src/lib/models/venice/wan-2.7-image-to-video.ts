import { Model } from "@/lib/types";

/**
 * Wan 2.7 (Image to Video, uncensored) via Venice.ai
 * Endpoints: https://api.venice.ai/api/v1/video/queue + /video/retrieve (queued/polled)
 * Constraints from Venice's model catalog (resolutions, durations). Aspect ratio follows the
 * input image, so this variant has no aspect_ratio parameter.
 */
export const venice_wan_2_7_image_to_video: Model = {
  name: "Wan 2.7 Image to Video (Venice)",
  id: "venice/wan-2-7-image-to-video",
  mediaType: "video",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The prompt describing how the image should animate.",
    },
    {
      key: "image_url",
      type: "image",
      required: true,
      description: "The reference image to animate (public URL or uploaded image).",
    },
    {
      key: "negative_prompt",
      type: "string",
      description: "A description of what should not be in the video.",
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
