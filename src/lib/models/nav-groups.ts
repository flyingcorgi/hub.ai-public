import { allModels } from "./registry";

// Single source of truth for how models are grouped and ordered across the navbar and the
// homepage, so the two can't drift out of sync. Display labels come from each model's own
// `name` in its definition file, not duplicated here.
export interface ModelNavGroup {
  label: string;
  modelIds: string[];
}

export const modelNavGroups: ModelNavGroup[] = [
  {
    label: "Text to Image",
    modelIds: [
      "venice/seedream-v5-pro", // Seedream V5 Pro (Venice)
      "venice/ideogram-v4", // Ideogram V4 (Venice)
      "venice/krea-2-turbo", // Krea 2 Turbo (Venice)
    ],
  },
  {
    label: "Image to Image",
    modelIds: [
      "venice/seedream-v5-pro-edit", // Seedream V5 Pro Edit (Venice)
      "venice/seedream-v5-pro-multi-edit", // Seedream V5 Pro Multi-Edit (Venice)
    ],
  },
  {
    label: "Text to Video",
    modelIds: [
      "venice/wan-2-7-text-to-video", // Wan 2.7 Text to Video (Venice)
    ],
  },
  {
    label: "Image to Video",
    modelIds: [
      "venice/wan-2-7-image-to-video", // Wan 2.7 Image to Video (Venice)
    ],
  },
];

export const modelById = new Map(allModels.map((model) => [model.id, model]));

export function modelHref(modelId: string) {
  return `/flux/${modelId.replace(/\//g, "-")}`;
}

export type Provider = "Venice" | "Other";

// Mirrors the id-prefix classification used for routing generation requests
// (see image-generator.tsx).
export function providerFor(modelId: string): Provider {
  if (modelId.startsWith("venice/")) return "Venice";
  return "Other";
}
