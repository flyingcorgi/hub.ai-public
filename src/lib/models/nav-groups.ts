import { allModels } from "./registry";

// Single source of truth for how models are grouped and ordered across the navbar and the
// homepage, so the two can't drift out of sync. Within each group, models that do the same
// job on different providers are listed next to each other (e.g. the Seedream 4.5 entries)
// so the provider differences are easy to compare at a glance. Display labels come from each
// model's own `name` in its definition file, not duplicated here.
export interface ModelNavGroup {
  label: string;
  modelIds: string[];
}

export const modelNavGroups: ModelNavGroup[] = [
  {
    label: "Text to Image",
    modelIds: [
      "fal-ai/bytedance/seedream/v4.5/text-to-image", // Seedream 4.5 (FAL)
      "replicate/bytedance/seedream-4.5", // Seedream 4.5 (Replicate)
      "bytedance/seedream-v5.0-pro", // Seedream 5.0 Pro (WaveSpeed)
      "openai/gpt-image-2/text-to-image", // GPT Image 2 (WaveSpeed)
      "wavespeed-ai/flux-2-klein-9b/text-to-image", // FLUX.2 Klein 9B (WaveSpeed)
      "wavespeed-ai/flux-2-klein-9b/text-to-image-lora", // FLUX.2 Klein 9B LoRA (WaveSpeed)
      "wavespeed-ai/z-image/turbo-lora", // Z-Image Turbo LoRA (WaveSpeed)
      "fal-ai/qwen-image-2512/lora", // Qwen Image 2512 (LoRA)
    ],
  },
  {
    label: "Image to Image",
    modelIds: [
      "bytedance/seedream-v4.5/edit", // Seedream 4.5 Edit (WaveSpeed)
      "bytedance/seedream-v5.0-pro/edit", // Seedream 5.0 Pro Edit (WaveSpeed)
      "openai/gpt-image-2/edit", // GPT Image 2 Edit (WaveSpeed)
      "wavespeed-ai/flux-2-klein-9b/edit", // FLUX.2 Klein 9B Edit (WaveSpeed)
      "wavespeed-ai/flux-2-klein-9b/edit-lora", // FLUX.2 Klein 9B Edit LoRA (WaveSpeed)
      "fal-ai/qwen-image-edit-plus-lora", // Qwen Image Edit Plus (LoRA)
      "fal-ai/qwen-image-edit-2511/lora", // Qwen Image Edit 2511 (LoRA)
      "fal-ai/qwen-image-2/pro/edit", // Qwen Image 2 Pro Edit
    ],
  },
  {
    label: "Image to Video",
    modelIds: [
      "wavespeed-ai/wan-2.2/i2v-720p-ultra-fast", // Wan 2.2 I2V 720p Ultra Fast (WaveSpeed)
      "wavespeed-ai/wan-2.2/i2v-720p-lora", // Wan 2.2 I2V 720p LoRA (WaveSpeed)
      "alibaba/wan-2.5/image-to-video-fast", // Wan 2.5 Image-to-Video Fast (WaveSpeed)
      "alibaba/wan-2.6/image-to-video-pro", // Wan 2.6 Image-to-Video Pro (WaveSpeed)
      "x-ai/grok-imagine-video/image-to-video", // Grok Imagine I2V (WaveSpeed)
      "bytedance/seedance-2.0-mini/image-to-video", // Seedance 2.0 Mini I2V (WaveSpeed)
      "bytedance/seedance-2.0/image-to-video", // Seedance 2.0 I2V (WaveSpeed)
      "wavespeed-ai/ltx-2.3/image-to-video-lora", // LTX-2.3 I2V LoRA (WaveSpeed)
      "wavespeed-ai/minimax-h3/image-to-video", // MiniMax H3 Image-to-Video (WaveSpeed)
      "bytedance/seedance-2.5/image-to-video", // Seedance 2.5 Image-to-Video (WaveSpeed)
      "bytedance/seedance-2.5/image-to-video-spicy", // Seedance 2.5 Image-to-Video Spicy (WaveSpeed)
    ],
  },
  {
    label: "Text to Video",
    modelIds: [
      "x-ai/grok-imagine-video/text-to-video", // Grok Imagine T2V (WaveSpeed)
    ],
  },
  {
    label: "Video Extend",
    modelIds: [
      "bytedance/seedance-2.5/video-extend", // Seedance 2.5 Video Extend (WaveSpeed)
    ],
  },
  {
    label: "Avatar Generation",
    modelIds: [
      "fal-ai/pixverse/lipsync", // Pixverse Lipsync
      "fal-ai/longcat-single-avatar/image-audio-to-video", // LongCat Avatar (Audio to Video)
      "wavespeed-ai/multitalk", // Multitalk (WaveSpeed)
      "wavespeed-ai/infinitetalk", // Infinitetalk (WaveSpeed)
      "pruna-ai/p-video/avatar", // Pruna P-Video Avatar (WaveSpeed)
    ],
  },
  {
    label: "Image Upscaling",
    modelIds: [
      "fal-ai/topaz/upscale/image", // Topaz Upscale Image (FAL)
    ],
  },
];

export const modelById = new Map(allModels.map((model) => [model.id, model]));

export function modelHref(modelId: string) {
  return `/flux/${modelId.replace(/\//g, "-")}`;
}

export type Provider = "FAL" | "WaveSpeed" | "Replicate" | "BytePlus" | "Other";

// Mirrors the id-prefix classification already used for routing generation requests
// (see isWavespeedModelId/isReplicateModelId/isBytePlusModelId in image-generator.tsx).
export function providerFor(modelId: string): Provider {
  if (
    modelId.startsWith("wavespeed-ai/") ||
    modelId.startsWith("alibaba/") ||
    modelId.startsWith("bytedance/") ||
    modelId.startsWith("x-ai/") ||
    modelId.startsWith("openai/") ||
    modelId.startsWith("pruna-ai/")
  ) {
    return "WaveSpeed";
  }
  if (modelId.startsWith("replicate/")) return "Replicate";
  if (modelId.startsWith("byteplus/")) return "BytePlus";
  if (modelId.startsWith("fal-ai/")) return "FAL";
  return "Other";
}
