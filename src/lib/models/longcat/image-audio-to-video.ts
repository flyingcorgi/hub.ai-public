import { Model } from "@/lib/types";

/**
 * LongCat Single Avatar Image + Audio to Video
 * Docs: fal-ai/longcat-single-avatar/image-audio-to-video
 */
export const longcat_single_avatar: Model = {
  name: "LongCat Avatar (Audio to Video)",
  id: "fal-ai/longcat-single-avatar/image-audio-to-video",
  mediaType: "video",
  inputSchema: [
    {
      key: "image_url",
      type: "image",
      required: true,
      description: "The URL of the image to animate.",
    },
    {
      key: "audio_url",
      type: "audio",
      required: true,
      description: "The URL of the audio file to drive the avatar.",
    },
    {
      key: "prompt",
      type: "string",
      description:
        "The prompt to guide the video generation. Default value: \"A person is talking naturally with natural expressions and movements.\"",
      default: "A person is talking naturally with natural expressions and movements.",
    },
    {
      key: "negative_prompt",
      type: "string",
      default:
        "Close-up, Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards",
      description:
        "The negative prompt to avoid in the video generation.",
    },
    {
      key: "num_inference_steps",
      type: "number",
      default: 30,
      description: "The number of inference steps to use. Default value: 30",
      validation: {
        min: 1,
        max: 100,
      },
    },
    {
      key: "text_guidance_scale",
      type: "number",
      default: 4,
      description:
        "The text guidance scale for classifier-free guidance. Default value: 4",
      validation: {
        min: 1,
        max: 20,
      },
    },
    {
      key: "audio_guidance_scale",
      type: "number",
      default: 4,
      description:
        "The audio guidance scale. Higher values may lead to exaggerated mouth movements. Default value: 4",
      validation: {
        min: 1,
        max: 20,
      },
    },
    {
      key: "resolution",
      type: "enum",
      default: "480p",
      options: ["480p", "720p"],
      description:
        "Resolution of the generated video (480p or 720p). 720p costs 4x more per second.",
    },
    {
      key: "num_segments",
      type: "number",
      default: 1,
      description:
        "Number of video segments to generate. Each segment adds ~5 seconds of video. First segment is ~5.8s, additional segments are 5s each. Default value: 1",
      validation: {
        min: 1,
        max: 10,
      },
    },
    {
      key: "seed",
      type: "number",
      description: "The seed for the random number generator.",
    },
    {
      key: "enable_safety_checker",
      type: "boolean",
      default: true,
      description: "Whether to enable safety checker. Default value: true",
    },
  ],
  outputSchema: [
    {
      key: "video",
      type: "object",
      required: true,
      properties: {
        url: { type: "string" },
        content_type: { type: "string" },
        file_name: { type: "string" },
        file_size: { type: "number" },
      },
      description: "The generated video file.",
    },
    {
      key: "seed",
      type: "number",
      description: "The seed used for generation.",
    },
  ],
};
