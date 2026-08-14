import { Model } from "@/lib/types";

/**
 * Topaz Upscale Image
 * AI image upscaling and enhancement via Topaz's suite of models (Standard, CGI, Recovery,
 * Redefine, Wonder, etc). Most fields below only apply to specific `model` choices — see each
 * field's description.
 * Docs: fal-ai/topaz/upscale/image
 */
export const topaz_upscale_image: Model = {
  name: "Topaz Upscale Image (FAL)",
  id: "fal-ai/topaz/upscale/image",
  mediaType: "image",
  inputSchema: [
    {
      key: "image_url",
      type: "image",
      required: true,
      description: "URL of the image to be upscaled.",
    },
    {
      key: "model",
      type: "enum",
      default: "Standard V2",
      options: [
        "Low Resolution V2",
        "Standard V2",
        "CGI",
        "High Fidelity V2",
        "Text Refine",
        "Recovery",
        "Redefine",
        "Recovery V2",
        "Standard MAX",
        "Wonder",
        "Wonder 3",
      ],
      description: "Model to use for image enhancement.",
    },
    {
      key: "upscale_factor",
      type: "number",
      default: 2,
      description: "Factor to upscale the image by (e.g. 2.0 doubles width and height).",
    },
    {
      key: "output_format",
      type: "enum",
      default: "jpeg",
      options: ["jpeg", "png"],
      description: "Output format of the upscaled image.",
    },
    {
      key: "crop_to_fill",
      type: "boolean",
      description: "Whether to crop the image to fill the target dimensions.",
    },
    {
      key: "subject_detection",
      type: "enum",
      default: "All",
      options: ["All", "Foreground", "Background"],
      description:
        "Subject detection mode for the image enhancement. Applies to Standard enhance and Recovery V2 models.",
    },
    {
      key: "face_enhancement",
      type: "boolean",
      default: true,
      description:
        "Whether to apply face enhancement to the image. Applies to Standard enhance and Recovery V2 models.",
    },
    {
      key: "face_enhancement_strength",
      type: "number",
      default: 0.8,
      description:
        "Strength of the face enhancement (0.0-1.0). Ignored if face enhancement is disabled.",
      validation: { min: 0, max: 1 },
    },
    {
      key: "face_enhancement_creativity",
      type: "number",
      description:
        "Creativity level for face enhancement (0.0-1.0). Ignored if face enhancement is disabled.",
      validation: { min: 0, max: 1 },
    },
    {
      key: "sharpen",
      type: "number",
      description:
        "Sharpening level (0.0-1.0). Applies to Standard V2, Low Resolution V2, CGI, High Fidelity V2, Text Refine, and Redefine models.",
      validation: { min: 0, max: 1 },
    },
    {
      key: "denoise",
      type: "number",
      description:
        "Denoising level (0.0-1.0). Applies to Standard V2, Low Resolution V2, CGI, High Fidelity V2, Text Refine, and Redefine models.",
      validation: { min: 0, max: 1 },
    },
    {
      key: "fix_compression",
      type: "number",
      description:
        "Compression artifact removal level (0.0-1.0). Applies to Standard V2, Low Resolution V2, High Fidelity V2, and Text Refine models.",
      validation: { min: 0, max: 1 },
    },
    {
      key: "strength",
      type: "number",
      description: "Enhancement strength (0.01-1.0). Applies to Text Refine model only.",
      validation: { min: 0.01, max: 1 },
    },
    {
      key: "creativity",
      type: "number",
      description:
        "Creativity level for generative upscaling (1-6). Higher values produce more creative/hallucinated details. Applies to Redefine model only.",
      validation: { min: 1, max: 6 },
    },
    {
      key: "texture",
      type: "number",
      description: "Texture detail level for generative upscaling (1-5). Applies to Redefine model only.",
      validation: { min: 1, max: 5 },
    },
    {
      key: "prompt",
      type: "string",
      description: "Text prompt to guide generative upscaling (max 1024 chars). Applies to Redefine model only.",
    },
    {
      key: "autoprompt",
      type: "boolean",
      description: "Enable automatic prompt generation for generative upscaling. Applies to Redefine model only.",
    },
    {
      key: "detail",
      type: "number",
      description: "Detail recovery level (0.0-1.0). Applies to Recovery V2 model only.",
      validation: { min: 0, max: 1 },
    },
    {
      key: "enhancement_strength",
      type: "enum",
      options: ["low", "medium", "high"],
      description:
        "Enhancement strength for generative upscaling. Applies to Wonder 3 model only. When omitted, Topaz auto-configures it.",
    },
  ],
  outputSchema: [
    {
      key: "image",
      type: "object",
      required: true,
      description: "The upscaled image.",
      properties: {
        url: { type: "string" },
        content_type: { type: "string" },
        file_name: { type: "string" },
        file_size: { type: "number" },
      },
    },
  ],
};
