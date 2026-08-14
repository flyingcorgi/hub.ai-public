import { Model } from "@/lib/types";

export const pixverse_lipsync: Model = {
  name: "Pixverse Lipsync",
  id: "fal-ai/pixverse/lipsync",
  mediaType: "video",
  inputSchema: [
    {
      key: "video_url",
      type: "string",
      required: true,
      description:
        "URL of the input video that will be lipsynced. Supports publicly accessible URLs or uploaded files converted to a data URI.",
    },
    {
      key: "audio_url",
      type: "string",
      description:
        "Optional URL of the audio track to sync with the video. If omitted, the service will synthesize audio using the selected voice.",
    },
    {
      key: "voice_id",
      type: "enum",
      default: "Auto",
      options: [
        "Emily",
        "James",
        "Isabella",
        "Liam",
        "Chloe",
        "Adrian",
        "Harper",
        "Ava",
        "Sophia",
        "Julia",
        "Mason",
        "Jack",
        "Oliver",
        "Ethan",
        "Auto",
      ],
      description:
        "Voice to use for TTS when no audio_url is provided. Auto lets the service decide the best voice.",
    },
    {
      key: "text",
      type: "string",
      description:
        "Optional TTS script used when audio_url is not provided. Required if you want custom speech without uploading audio.",
    },
  ],
  outputSchema: [
    {
      key: "video",
      type: "object",
      required: true,
      description: "Generated lipsync video file information (url, content_type, etc.).",
    },
  ],
};






