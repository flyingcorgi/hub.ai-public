import { Model } from "@/lib/types";

/**
 * Qwen Image 2512 LoRA model
 * Docs: fal-ai/qwen-image-2512/lora
 */
export const qwen_image_2512_lora: Model = {
  name: "Qwen Image 2512 (LoRA)",
  id: "fal-ai/qwen-image-2512/lora",
  mediaType: "image",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description: "The prompt to generate an image from.",
    },
    {
      key: "negative_prompt",
      type: "string",
      default: "",
      description:
        "The negative prompt to generate an image from. Default value: \"\"",
    },
    {
      key: "image_size",
      type: "enum",
      description: "The size of the generated image. Default value: landscape_4_3",
      default: "landscape_4_3",
      options: [
        "square_hd",
        "square",
        "portrait_4_3",
        "portrait_16_9",
        "landscape_4_3",
        "landscape_16_9",
      ],
    },
    {
      key: "num_inference_steps",
      type: "number",
      default: 28,
      description: "The number of inference steps to perform. Default value: 28",
      validation: {
        min: 1,
        max: 100,
      },
    },
    {
      key: "guidance_scale",
      type: "number",
      default: 4,
      description:
        "The guidance scale to use for the image generation. Default value: 4",
      validation: {
        min: 1,
        max: 20,
      },
    },
    {
      key: "seed",
      type: "number",
      description:
        "The same seed and the same prompt given to the same version of the model will output the same image every time.",
    },
    {
      key: "sync_mode",
      type: "boolean",
      default: false,
      description:
        "If True, the media will be returned as a data URI and the output data won't be available in the request history.",
    },
    {
      key: "num_images",
      type: "number",
      default: 1,
      description: "The number of images to generate. Default value: 1",
      validation: {
        min: 1,
      },
    },
    {
      key: "enable_safety_checker",
      type: "boolean",
      default: false,
      description:
        "If set to true, the safety checker will be enabled. Disabled by default.",
    },
    {
      key: "output_format",
      type: "enum",
      default: "png",
      options: ["jpeg", "png", "webp"],
      description: "The format of the generated image. Default value: \"png\"",
    },
    {
      key: "acceleration",
      type: "enum",
      default: "regular",
      options: ["none", "regular", "high"],
      description: "The acceleration level to use. Default value: \"regular\"",
    },
    {
      key: "loras",
      type: "array",
      description:
        "The LoRAs to use for the image generation. You can use up to 3 LoRAs and they will be merged together to generate the final image.",
      items: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "URL or the path to the LoRA weights.",
          },
          scale: {
            type: "number",
            description:
              "The scale of the LoRA weight. This is used to scale the LoRA weight before merging it with the base model. Default value: 1",
            validation: {
              min: 0,
              max: 2,
            },
            default: 1,
          },
        },
      },
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
      description: "The generated image files info.",
    },
    {
      key: "seed",
      type: "number",
      description: "Seed of the generated Image.",
    },
    {
      key: "timings",
      type: "object",
      description: "Optional timing data for the request.",
    },
    {
      key: "has_nsfw_concepts",
      type: "array",
      items: { type: "boolean" },
      description: "Whether the generated images contain NSFW concepts.",
    },
    {
      key: "prompt",
      type: "string",
      description: "The prompt used for generating the image.",
    },
  ],
};
