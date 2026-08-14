import { Model } from "@/lib/types";

/**
 * Qwen Image Edit Plus LoRA model
 * Docs: fal-ai/qwen-image-edit-plus-lora
 */
export const qwen_image_edit_plus: Model = {
  name: "Qwen Image Edit Plus (LoRA)",
  id: "fal-ai/qwen-image-edit-plus-lora",
  mediaType: "image",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description:
        "Text prompt describing how to edit the provided images. Keep it concise but specific (e.g. “sunset lighting, cinematic, soft focus”).",
    },
    {
      key: "image_urls",
      type: "array",
      required: true,
      description:
        "One or more source image URLs. Supports public URLs, data URIs, or uploaded files. Start with 1–3 images for best results.",
      items: {
        type: "image",
        description: "Image URL or uploaded file converted to a data URI.",
      },
    },
    {
      key: "image_size",
      type: "enum",
      description:
        "Optional size override for generated images. If omitted, the size of the final input image is used to determine the output size.",
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
      description:
        "Number of denoising steps. Default is 28. Higher values improve quality but are slower.",
      validation: {
        min: 1,
        max: 50,
      },
    },
    {
      key: "guidance_scale",
      type: "number",
      default: 4,
      description:
        "How strongly the model follows your prompt vs. the source image. Lower = looser, higher = more literal. Typical range: 3–7.",
      validation: {
        min: 1,
        max: 10,
      },
    },
    {
      key: "seed",
      type: "number",
      description:
        "Random seed for reproducibility. Same seed + prompt + settings yields similar results across runs.",
    },
    {
      key: "sync_mode",
      type: "boolean",
      default: false,
      description:
        "If true, media is returned as a data URI and is not stored in request history.",
    },
    {
      key: "num_images",
      type: "number",
      default: 1,
      description:
        "Number of edited images to generate per request. Values above 4 may increase latency.",
      validation: {
        min: 1,
      },
    },
    {
      key: "enable_safety_checker",
      type: "boolean",
      default: false,
      description:
        "Whether to enable the safety checker for generated images.",
    },
    {
      key: "output_format",
      type: "enum",
      default: "png",
      options: ["jpeg", "png"],
      description:
        "Image file format for the outputs. Use PNG for highest quality and JPEG for smaller files.",
    },
    {
      key: "negative_prompt",
      type: "string",
      default: " ",
      description:
        "Optional negative prompt describing what should be avoided (e.g. “blurry, low quality, extra limbs”).",
    },
    {
      key: "acceleration",
      type: "enum",
      default: "regular",
      options: ["none", "regular"],
      description:
        "Acceleration level for generation. “regular” is recommended; “none” may improve quality slightly at higher latency.",
    },
    {
      key: "loras",
      type: "array",
      description:
        "Optional list of up to 3 LoRA weights to apply during editing. LoRAs are merged together when generating the final image.",
      items: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "URL or path to the LoRA weights (for example, a safetensors file or Hugging Face repository).",
          },
          scale: {
            type: "number",
            description:
              "Scale factor for the LoRA weight. Default is 1. Higher values apply the LoRA more strongly.",
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
      description: "Generated edited images.",
    },
    {
      key: "seed",
      type: "number",
      description: "Seed used for generation.",
    },
    {
      key: "timings",
      type: "object",
      description:
        "Optional timing data for the request, if provided by the API.",
    },
    {
      key: "has_nsfw_concepts",
      type: "array",
      items: { type: "boolean" },
      description:
        "Per-image NSFW flags, if provided by the API. Defaults to an empty array in the UI.",
    },
    {
      key: "prompt",
      type: "string",
      description: "Prompt used for the edit, if returned by the API.",
    },
  ],
};

/**
 * Qwen Image Edit 2511 LoRA model
 * Docs: fal-ai/qwen-image-edit-2511/lora
 */
export const qwen_image_edit_2511: Model = {
  name: "Qwen Image Edit 2511 (LoRA)",
  id: "fal-ai/qwen-image-edit-2511/lora",
  mediaType: "image",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description:
        "The prompt to edit the image with.",
    },
    {
      key: "image_urls",
      type: "array",
      required: true,
      description:
        "The URLs of the images to edit.",
      items: {
        type: "image",
        description: "Image URL or uploaded file converted to a data URI.",
      },
    },
    {
      key: "image_size",
      type: "enum",
      description:
        "The size of the generated image. If None, uses the input image dimensions.",
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
      description:
        "The number of inference steps to perform. Default value: 28",
      validation: {
        min: 1,
        max: 100,
      },
    },
    {
      key: "guidance_scale",
      type: "number",
      default: 4.5,
      description:
        "The guidance scale to use for the image generation. Default value: 4.5",
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
        "If True, the media will be returned as a data URI.",
    },
    {
      key: "num_images",
      type: "number",
      default: 1,
      description:
        "The number of images to generate. Default value: 1",
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
      description:
        "The format of the generated image. Default value: \"png\"",
    },
    {
      key: "negative_prompt",
      type: "string",
      default: "",
      description:
        "The negative prompt to generate an image from. Default value: \"\"",
    },
    {
      key: "acceleration",
      type: "enum",
      default: "regular",
      options: ["none", "regular", "high"],
      description:
        "The acceleration level to use. Default value: \"regular\"",
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
            description:
              "URL or the path to the LoRA weights.",
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
      description:
        "Optional timing data for the request.",
    },
    {
      key: "has_nsfw_concepts",
      type: "array",
      items: { type: "boolean" },
      description:
        "Whether the generated images contain NSFW concepts.",
    },
    {
      key: "prompt",
      type: "string",
      description: "The prompt used for generating the image.",
    },
  ],
};

/**
 * Qwen Image 2 Pro Edit
 * Edit images using Qwen Image 2 Pro.
 * Docs: fal-ai/qwen-image-2/pro/edit
 */
export const qwen_image_2_pro_edit: Model = {
  name: "Qwen Image 2 Pro Edit",
  id: "fal-ai/qwen-image-2/pro/edit",
  mediaType: "image",
  inputSchema: [
    {
      key: "prompt",
      type: "string",
      required: true,
      description:
        "Text prompt describing the desired image edit. Supports both English and Chinese. Reference input images as 'image 1', 'image 2', 'image 3' in your prompt.",
    },
    {
      key: "image_urls",
      type: "array",
      required: true,
      description:
        "Reference images for editing (1–3 images required). Order matters: reference as 'image 1', 'image 2', 'image 3' in the prompt. Resolution: 384–5000px per dimension, max 10MB each. Formats: JPEG, PNG (no alpha), WEBP.",
      items: {
        type: "image",
        description: "Image URL or uploaded file converted to a data URI.",
      },
    },
    {
      key: "negative_prompt",
      type: "string",
      default: "",
      description:
        "Content to avoid in the generated image. Max 500 characters. Default value: \"\"",
    },
    {
      key: "image_size",
      type: "enum",
      description:
        "The size of the generated image. If not provided, the size of the final input image will be used. Total pixels must be between 512×512 and 2048×2048.",
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
      key: "num_images",
      type: "number",
      default: 1,
      description: "The number of images to generate. Default value: 1",
      validation: {
        min: 1,
      },
    },
    {
      key: "output_format",
      type: "enum",
      default: "png",
      options: ["jpeg", "png", "webp"],
      description: "The format of the generated image. Default value: \"png\"",
    },
    {
      key: "enable_prompt_expansion",
      type: "boolean",
      default: true,
      description:
        "Enable LLM prompt optimisation for better results. Default value: true",
    },
    {
      key: "enable_safety_checker",
      type: "boolean",
      default: false,
      description:
        "Enable content moderation for input and output. Default value: false",
    },
    {
      key: "seed",
      type: "number",
      description:
        "Random seed for reproducibility (0–2147483647). Same seed + prompt yields the same output.",
    },
    {
      key: "sync_mode",
      type: "boolean",
      default: false,
      description:
        "If true, the media will be returned as a data URI and the output data won't be available in the request history.",
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
          content_type: { type: "string" },
          file_name: { type: "string" },
          file_size: { type: "number" },
        },
      },
      description: "Generated images.",
    },
    {
      key: "seed",
      type: "number",
      description: "The seed used for generation.",
    },
  ],
};
