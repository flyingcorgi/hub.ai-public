'use server';

import { fal } from "@fal-ai/client";
import { Model, Image } from "@/lib/types";

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

type GenerateImageResponse = SuccessResponse | ErrorResponse;

export async function generateImage(
  model: Model, 
  input: Record<string, any>,
  apiKey: string
): Promise<GenerateImageResponse> {
  console.log('🚀 Starting image generation process:', {
    modelId: model.id,
    inputParams: { ...input, prompt: input.prompt?.substring(0, 50) + '...' } // Truncate prompt for logging
  });

  try {
    if (!apiKey) {
      console.error('❌ No API key provided');
      throw new Error("Please set your FAL.AI API key first");
    }

    console.log('📝 Configuring FAL client with API key');
    fal.config({
      credentials: apiKey,
    });

    console.log('⏳ Subscribing to FAL model...');
    const result = await fal.subscribe(model.id, {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        console.log(`🔄 Queue Status: ${update.status}`);
        if (update.status === "IN_PROGRESS") {
          console.log('📊 Generation Logs:');
          update.logs.map((log) => log.message).forEach((msg) => console.log(`   ${msg}`));
        }
      },
    });

    console.log('📦 Complete API Response:', JSON.stringify(result, null, 2));

    const data: any = result.data ?? {};

    const normalizedImages: Image[] = [];
    const normalize = (file: any, fallbackType: string): Image => ({
      url: file.url,
      width: file.width ?? 0,
      height: file.height ?? 0,
      content_type: file.content_type ?? fallbackType,
      ...file,
    });

    if (Array.isArray(data.images)) {
      data.images.forEach((img: any) => {
        if (img?.url) {
          normalizedImages.push(normalize(img, "image/jpeg"));
        }
      });
    }

    if (data.image?.url) {
      normalizedImages.push(normalize(data.image, "image/jpeg"));
    }

    const rawVideo = data.video ?? data.videos?.[0];
    if (rawVideo?.url) {
      normalizedImages.push(normalize(rawVideo, "video/mp4"));
    }

    const media: Image | undefined = normalizedImages[0];

    if (!media) {
      console.error('❌ No image or video in response');
      throw new Error("No media was generated");
    }

    console.log('✅ Generation completed:', { 
      requestId: result.requestId,
      hasImages: !!data.images?.length,
      hasVideo: !!rawVideo
    });

    console.log('🎉 Successfully generated image:', {
      seed: result.data?.seed,
      requestId: result.requestId,
      image: media
    });

    return {
      success: true,
      image: media,
      images: normalizedImages,
      seed: data.seed,
      requestId: result.requestId,
      timings: data.timings || {},
      has_nsfw_concepts: data.has_nsfw_concepts || [],
    };
  } catch (error) {
    console.error("❌ Image generation failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate image",
    };
  }
} 