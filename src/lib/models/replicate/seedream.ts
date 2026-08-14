import { Model } from "@/lib/types";

/**
 * ByteDance Seedream 4.5 via Replicate
 * Model: https://replicate.com/bytedance/seedream-4.5
 */
export const replicate_seedream_4_5: Model = {
  name: "Seedream 4.5 (Replicate)",
  id: "replicate/bytedance/seedream-4.5",
  mediaType: "image",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "Text prompt for image generation or image-to-image editing.",
    },
    {
      key: "image_input",
      type: "array",
      description:
        "Optional input image(s) for image-to-image generation. Supports 1-14 reference images.",
      items: {
        type: "image",
        description: "Image URL or uploaded file converted to a data URI.",
      },
    },
    {
      key: "size",
      type: "enum",
      default: "2K",
      options: ["2K", "4K"],
      description:
        "Image resolution: 2K (2048px) or 4K (4096px). 1K is not supported.",
    },
    {
      key: "aspect_ratio",
      type: "enum",
      default: "match_input_image",
      options: [
        "match_input_image",
        "1:1",
        "16:9",
        "9:16",
        "4:3",
        "3:4",
        "3:2",
        "2:3",
      ],
      description:
        "Image aspect ratio. Used when size is not custom. Use match_input_image to match a reference image.",
    },
    {
      key: "sequential_image_generation",
      type: "enum",
      default: "disabled",
      options: ["disabled", "auto"],
      description:
        "Group image generation mode. Disabled generates a single image; auto lets the model decide whether to generate multiple related images.",
    },
    {
      key: "max_images",
      type: "number",
      default: 1,
      description:
        "Maximum number of images to generate when sequential generation is auto. Total input plus generated images cannot exceed 15.",
      validation: {
        min: 1,
        max: 15,
      },
    },
    {
      key: "disable_safety_checker",
      type: "boolean",
      default: true,
      description:
        "Disable the safety checker for generated images. The Replicate action forces this on for this model.",
    },
  ],
  outputSchema: [
    {
      key: "output",
      type: "array",
      required: true,
      description: "Array of generated image URLs.",
      items: {
        type: "string",
        description: "Generated image URL.",
      },
    },
  ],
};
