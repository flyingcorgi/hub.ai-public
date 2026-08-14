import { Model } from "@/lib/types";

/**
 * WaveSpeed MiniMax H3 Image-to-Video
 * Animates a first-frame image, optionally with last-frame guidance, into coherent 480p/768p
 * videos with native stereo audio, 5-15s duration, and flexible aspect ratios.
 */
export const wavespeed_minimax_h3_i2v: Model = {
  name: "MiniMax H3 Image-to-Video (WaveSpeed)",
  id: "wavespeed-ai/minimax-h3/image-to-video",
  mediaType: "video",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description:
        "Text description of the desired motion, scene, and soundtrack. Audio is generated natively together with the video.",
    },
    {
      key: "image",
      type: "image",
      required: true,
      description: "First-frame image URL. The output canvas follows this image's aspect ratio.",
    },
    {
      key: "last_image",
      type: "image",
      description:
        "Optional last-frame image URL. When provided, the video interpolates from the first frame to this frame.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "480p",
      options: ["480p", "768p"],
      description: "Output video resolution. 768p is the model's native canvas; 480p is a faster, lower-cost tier.",
    },
    {
      key: "duration",
      type: "enum",
      default: 5,
      options: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      description: "Output video duration in seconds.",
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
