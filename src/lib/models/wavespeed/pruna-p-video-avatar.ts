import { Model } from "@/lib/types";

/**
 * WaveSpeed Pruna AI P-Video Avatar
 * Fast avatar video generation for digital humans, talking characters, and virtual presenters —
 * drives a still image with an audio track for speech and lip sync.
 */
export const wavespeed_pruna_p_video_avatar: Model = {
  name: "Pruna P-Video Avatar (WaveSpeed)",
  id: "pruna-ai/p-video/avatar",
  mediaType: "video",
  inputSchema: [
    {
      key: "image",
      type: "image",
      required: true,
      description: "Avatar image URL.",
    },
    {
      key: "audio",
      type: "audio",
      required: true,
      description: "Audio URL used to drive the avatar speech and lip sync.",
    },
    {
      key: "video_prompt",
      type: "string",
      default: "The person is talking.",
      description: "Prompt controlling body movement, framing behavior, and atmosphere.",
    },
    {
      key: "resolution",
      type: "enum",
      default: "720p",
      options: ["720p", "1080p"],
      description: "Output resolution.",
    },
    {
      key: "seed",
      type: "number",
      default: -1,
      description: "Random seed for reproducible generations.",
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
