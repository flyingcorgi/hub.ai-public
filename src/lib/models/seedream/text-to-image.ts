import { Model } from "@/lib/types";

export const seedream_4_5: Model = {
  name: "Seedream 4.5 (FAL)",
  id: "fal-ai/bytedance/seedream/v4.5/text-to-image",
  mediaType: "image",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The text prompt used to generate the image.",
    },
    {
      key: "image_size",
      type: "enum",
      default: "auto_2K",
      options: [
        "square_hd",
        "square",
        "portrait_4_3",
        "portrait_16_9",
        "landscape_4_3",
        "landscape_16_9",
        "auto_2K",
        "auto_4K",
      ],
      description:
        "The size of the generated image. For custom sizes, use a width/height object via the raw API.",
    },
    {
      key: "num_images",
      type: "number",
      default: 1,
      description:
        "Number of separate model generations to be run with the prompt.",
      validation: {
        min: 1,
      },
    },
    {
      key: "max_images",
      type: "number",
      default: 1,
      description:
        "If set to a number greater than one, enables multi-image generation.",
      validation: {
        min: 1,
      },
    },
    {
      key: "seed",
      type: "number",
      description:
        "Random seed to control the stochasticity of image generation.",
    },
    {
      key: "sync_mode",
      type: "boolean",
      default: false,
      description:
        "If true, media will be returned as a data URI and output data won't be available in the request history.",
    },
    {
      key: "enable_safety_checker",
      type: "boolean",
      default: false,
      description:
        "If set to true, the safety checker will be enabled. For this app it is disabled by default.",
    },
  ],
  outputSchema: [
    {
      key: "images",
      type: "array",
      required: true,
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          width: { type: "number" },
          height: { type: "number" },
          content_type: { type: "string" },
        },
      },
      description: "Generated images.",
    },
    {
      key: "seed",
      type: "number",
      required: true,
      description: "Seed used for generation.",
    },
  ],
};
