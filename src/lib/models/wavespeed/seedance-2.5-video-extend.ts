import { Model } from "@/lib/types";

/**
 * WaveSpeed Seedance 2.5 Video Extend
 * Extends an input video with a new cinematic continuation generated from its last frame and a
 * natural-language prompt. The native extension uses the last 30 seconds of the source video as
 * context; generation continues seamlessly from the ending.
 */
export const wavespeed_seedance_2_5_video_extend: Model = {
  name: "Seedance 2.5 Video Extend (WaveSpeed)",
  id: "bytedance/seedance-2.5/video-extend",
  mediaType: "video",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "Describe the cinematic continuation - action, camera movement, lighting, mood.",
    },
    {
      key: "video",
      type: "video",
      required: true,
      description: "URL of the input video to extend.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "720p",
      options: ["480p", "720p", "1080p", "4k"],
      description: "Output resolution of the new segment.",
    },
    {
      key: "duration",
      type: "number",
      default: 5,
      description: "Length in seconds of the new segment to append.",
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
