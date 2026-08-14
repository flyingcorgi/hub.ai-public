'use server';

import Replicate from "replicate";
import { Image, Model } from "@/lib/types";

interface SuccessResponse {
  success: true;
  image: Image;
  images: Image[];
  seed: number;
  requestId: string;
  timings: Record<string, any>;
  has_nsfw_concepts: boolean[];
}

interface ErrorResponse {
  success: false;
  error: string;
}

type GenerateReplicateResponse = SuccessResponse | ErrorResponse;
type ReplicateModelId = `${string}/${string}` | `${string}/${string}:${string}`;

function normalizeReplicateOutput(output: unknown): Image[] {
  const outputItems = Array.isArray(output) ? output : [output];

  return outputItems
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item instanceof URL) {
        return item.toString();
      }

      if (item && typeof item === "object") {
        const maybeUrl = "url" in item ? item.url : undefined;
        if (typeof maybeUrl === "string") {
          return maybeUrl;
        }

        const maybeUrlFn = "url" in item ? item.url : undefined;
        if (typeof maybeUrlFn === "function") {
          const url = maybeUrlFn.call(item);
          return url instanceof URL ? url.toString() : String(url);
        }
      }

      return null;
    })
    .filter((url): url is string => Boolean(url))
    .map((url) => ({
      url,
      width: 0,
      height: 0,
      content_type: "image/jpeg",
    }));
}

function normalizeReplicateError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Failed to generate image";

  if (
    /<html|<!doctype html|cloudflare|bad gateway|502/i.test(message) ||
    message.length > 500
  ) {
    return "Replicate is temporarily unavailable (502 Bad Gateway). Please retry later or use another Seedream provider.";
  }

  return message;
}

export async function generateReplicate(
  model: Model,
  input: Record<string, unknown>,
  apiKey: string
): Promise<GenerateReplicateResponse> {
  console.log("🚀 Starting Replicate generation process:", {
    modelId: model.id,
    inputParams: {
      ...input,
      prompt:
        typeof input.prompt === "string"
          ? input.prompt.substring(0, 50) + "..."
          : undefined,
    },
  });

  try {
    const authToken =
      apiKey ||
      process.env.REPLICATE_API_TOKEN ||
      process.env.REPLICATE_API_KEY;

    if (!authToken) {
      throw new Error("Please set your Replicate API key first");
    }

    const replicate = new Replicate({ auth: authToken });
    const modelId = model.id.replace(/^replicate\//, "") as ReplicateModelId;
    const processedInput = { ...input };

    if (modelId === "bytedance/seedream-4.5") {
      processedInput.disable_safety_checker = true;
    }

    const output = await replicate.run(modelId, {
      input: processedInput,
    });

    console.log("📦 Complete Replicate response:", output);

    const normalizedImages = normalizeReplicateOutput(output);
    const image = normalizedImages[0];

    if (!image) {
      throw new Error("No image was generated");
    }

    return {
      success: true,
      image,
      images: normalizedImages,
      seed: -1,
      requestId: "replicate",
      timings: {},
      has_nsfw_concepts: [],
    };
  } catch (error) {
    console.error("❌ Replicate generation failed:", error);
    return {
      success: false,
      error: normalizeReplicateError(error),
    };
  }
}
