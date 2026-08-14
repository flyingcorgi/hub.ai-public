'use server';

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

type GenerateBytePlusResponse = SuccessResponse | ErrorResponse;

const BYTEPLUS_IMAGE_GENERATION_URL =
  "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations";
const SEEDREAM_4_5_MODEL_ID = "seedream-4-5-251128";

function getContentType(url: string) {
  return /\.(png)(?:\?|$)/i.test(url) ? "image/png" : "image/jpeg";
}

function normalizeBytePlusImages(data: unknown): Image[] {
  if (!data || typeof data !== "object" || !("data" in data)) {
    return [];
  }

  const imageItems = Array.isArray(data.data) ? data.data : [];

  return imageItems
    .map((item) => {
      if (!item || typeof item !== "object" || !("url" in item)) {
        return null;
      }

      return typeof item.url === "string" ? item.url : null;
    })
    .filter((url): url is string => Boolean(url))
    .map((url) => ({
      url,
      width: 0,
      height: 0,
      content_type: getContentType(url),
    }));
}

function getErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  if ("error" in data) {
    const error = data.error;

    if (typeof error === "string") {
      return error;
    }

    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
  }

  if ("message" in data) {
    return String(data.message);
  }

  return fallback;
}

function getInputImages(input: Record<string, unknown>) {
  const images = input.image;

  if (!Array.isArray(images)) {
    return [];
  }

  return images.filter((image): image is string => typeof image === "string" && image.trim() !== "");
}

function normalizeBytePlusSize(size: unknown) {
  if (typeof size !== "string" || !size.trim()) {
    return "2K";
  }

  // The UI shares the WaveSpeed Seedream size picker, which stores width*height.
  // BytePlus expects either 1K/2K/4K or custom dimensions as WIDTHxHEIGHT.
  return size.trim().replace("*", "x");
}

export async function generateBytePlus(
  model: Model,
  input: Record<string, unknown>,
  apiKey: string
): Promise<GenerateBytePlusResponse> {
  console.log("🚀 Starting BytePlus generation process:", {
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
      process.env.BYTEPLUS_API_KEY ||
      process.env.ARK_API_KEY ||
      process.env.NEXT_PUBLIC_BYTEPLUS_API_KEY ||
      process.env.NEXT_PUBLIC_ARK_API_KEY;

    if (!authToken) {
      throw new Error("Please set your BytePlus API key first");
    }

    if (typeof input.prompt !== "string" || !input.prompt.trim()) {
      throw new Error("Prompt is required");
    }

    const inputImages = getInputImages(input);

    if (inputImages.length === 0) {
      throw new Error("At least one input image is required");
    }

    const requestBody = {
      model: SEEDREAM_4_5_MODEL_ID,
      prompt: input.prompt,
      image: inputImages,
      sequential_image_generation:
        typeof input.sequential_image_generation === "string"
          ? input.sequential_image_generation
          : "disabled",
      response_format: "url",
      size: normalizeBytePlusSize(input.size),
      stream: false,
      watermark:
        typeof input.watermark === "boolean" ? input.watermark : true,
    };

    const startedAt = Date.now();
    const response = await fetch(BYTEPLUS_IMAGE_GENERATION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          data,
          `BytePlus request failed with status ${response.status}`
        )
      );
    }

    console.log("📦 Complete BytePlus response:", JSON.stringify(data, null, 2));

    const outputImages = normalizeBytePlusImages(data);
    const image = outputImages[0];

    if (!image) {
      throw new Error("No image was generated");
    }

    return {
      success: true,
      image,
      images: outputImages,
      seed: -1,
      requestId:
        response.headers.get("x-request-id") ||
        response.headers.get("x-tt-logid") ||
        "byteplus",
      timings: {
        duration_ms: Date.now() - startedAt,
      },
      has_nsfw_concepts: [],
    };
  } catch (error) {
    console.error("❌ BytePlus generation failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate image",
    };
  }
}
