'use client';

import { Model } from "@/lib/types";
import { useState, useEffect } from "react";
import { GenerationSettings } from "./image-generator/generation-settings";
import { ImageDisplay } from "./image-generator/image-display";
import { GenerationsGallery } from "./image-generator/generations-gallery";
import { generateImage } from "@/lib/actions/generate-image";
import { generateWavespeed } from "@/lib/actions/generate-wavespeed";
import { generateReplicate } from "@/lib/actions/generate-replicate";
import { generateBytePlus } from "@/lib/actions/generate-byteplus";
import { useToast } from "@/hooks/use-toast";
import { Image, Generation } from "@/lib/types";
import { v4 as uuidv4 } from 'uuid';
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";

const API_KEY_STORAGE_KEY = 'fal-ai-api-key';
const WAVESPEED_API_KEY_STORAGE_KEY = 'wavespeed-api-key';
const REPLICATE_API_KEY_STORAGE_KEY = 'replicate-api-key';
const BYTEPLUS_API_KEY_STORAGE_KEY = 'byteplus-api-key';
const GENERATIONS_STORAGE_KEY = 'fal-ai-generations';
const MAX_STORED_GENERATIONS = 60;

function isWavespeedModelId(modelId: string) {
  return (
    modelId.startsWith('wavespeed-ai/') ||
    modelId.startsWith('alibaba/') ||
    modelId.startsWith('bytedance/') ||
    modelId.startsWith('x-ai/') ||
    modelId.startsWith('openai/') ||
    modelId.startsWith('pruna-ai/')
  );
}

function isReplicateModelId(modelId: string) {
  return modelId.startsWith('replicate/');
}

function isBytePlusModelId(modelId: string) {
  return modelId.startsWith('byteplus/');
}

function persistGenerations(generations: Generation[]) {
  const cappedGenerations = generations.slice(0, MAX_STORED_GENERATIONS);

  try {
    localStorage.setItem(GENERATIONS_STORAGE_KEY, JSON.stringify(cappedGenerations));
    return cappedGenerations;
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      const smallerGenerations = cappedGenerations.slice(0, 20);
      localStorage.setItem(GENERATIONS_STORAGE_KEY, JSON.stringify(smallerGenerations));
      return smallerGenerations;
    }

    throw error;
  }
}

interface ImageGeneratorProps {
  model: Model;
}

interface QueuedAudioProgress {
  audioIndex: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: Image;
  error?: string;
}

export function ImageGenerator({ model }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<"idle" | "generating" | "success" | "failed">("idle");
  const [result, setResult] = useState<Image | null>(null);
  const [previewImages, setPreviewImages] = useState<Image[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [queuedProgress, setQueuedProgress] = useState<QueuedAudioProgress[]>([]);
  const { toast } = useToast();

  const [parameters, setParameters] = useState<Record<string, any>>(() => {
    // Initialize parameters with default values from the model schema
    return Object.fromEntries(
      model.inputSchema
        .filter(param => param.default !== undefined)
        .map(param => [param.key, param.default])
    );
  });

  // Load generations from localStorage on mount
  useEffect(() => {
    const savedGenerations = localStorage.getItem(GENERATIONS_STORAGE_KEY);
    if (savedGenerations) {
      try {
        const parsedGenerations = JSON.parse(savedGenerations);
        if (Array.isArray(parsedGenerations)) {
          setGenerations(persistGenerations(parsedGenerations));
        }
      } catch (error) {
        console.error('Failed to parse saved generations:', error);
        localStorage.removeItem(GENERATIONS_STORAGE_KEY);
      }
    }
  }, []);

  // Reflect generation status in the tab title (🟡 generating, 🔴 failed, 🟢 complete) so it's
  // visible at a glance across tabs, without needing to have the tab focused.
  useEffect(() => {
    const emoji =
      genStatus === "generating" ? "🟡 " : genStatus === "success" ? "🟢 " : genStatus === "failed" ? "🔴 " : "";
    document.title = `${emoji}${model.name}`;
  }, [genStatus, model.name]);

  // Warn before closing/reloading the tab while a generation is in flight, so it isn't lost
  // by an accidental close. Browsers show their own generic message, not `returnValue`'s text.
  useEffect(() => {
    if (genStatus !== "generating") return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [genStatus]);

  async function handleGenerate() {
    console.log("🎨 Starting client-side image generation process");

    // Check if this is a Wavespeed model (includes provider-prefixed WaveSpeed API models)
    const isWavespeedModel = isWavespeedModelId(model.id);
    const isReplicateModel = isReplicateModelId(model.id);
    const isBytePlusModel = isBytePlusModelId(model.id);
    const isWavespeedAudioModel = isWavespeedModel && 
      (model.id.includes('multitalk') || model.id.includes('infinitetalk'));
    
    const apiKey = isReplicateModel
      ? (localStorage.getItem(REPLICATE_API_KEY_STORAGE_KEY) ?? process.env.NEXT_PUBLIC_REPLICATE_API_KEY)
      : isBytePlusModel
        ? (localStorage.getItem(BYTEPLUS_API_KEY_STORAGE_KEY) ?? process.env.NEXT_PUBLIC_BYTEPLUS_API_KEY ?? process.env.NEXT_PUBLIC_ARK_API_KEY)
        : isWavespeedModel
          ? (localStorage.getItem(WAVESPEED_API_KEY_STORAGE_KEY) ?? process.env.NEXT_PUBLIC_WAVESPEED_API_KEY)
          : (localStorage.getItem(API_KEY_STORAGE_KEY) ?? process.env.NEXT_PUBLIC_API_KEY);
    const providerName = isReplicateModel
      ? 'Replicate'
      : isBytePlusModel
        ? 'BytePlus'
        : isWavespeedModel
          ? 'Wavespeed'
          : 'FAL.AI';
    
    if (!apiKey && !isReplicateModel && !isBytePlusModel) {
      console.log("❌ No API key found in localStorage");
      toast({
        title: "API Key Required",
        description: `Please set your ${providerName} API key first`,
        variant: "destructive",
      });
      return;
    }

    // Check for multiple audio files
    const audioParam = parameters.audio;
    const audioFiles = Array.isArray(audioParam) ? audioParam : (audioParam ? [audioParam] : []);
    const hasMultipleAudios = audioFiles.length > 1;

    if (hasMultipleAudios && !isWavespeedAudioModel) {
      toast({
        title: "Multiple audio not supported",
        description: "Multiple audio files are only supported for Wavespeed Multitalk and Infinitetalk models",
        variant: "destructive",
      });
      return;
    }

    console.log("🔄 Setting generation state...");
    setIsGenerating(true);
    setGenStatus("generating");
    setPreviewImages([]);
    setPreviewIndex(0);
    setQueuedProgress([]);

    try {
      const baseParameters: Record<string, unknown> & { prompt: string; audio?: unknown } = {
        ...parameters,
        prompt,
      };

      // Remove audio from base parameters if we're processing multiple
      if (hasMultipleAudios) {
        delete baseParameters.audio;
      }

      if (hasMultipleAudios) {
        // Process multiple audio files concurrently with staggered start times
        console.log(`📤 Processing ${audioFiles.length} audio files concurrently (2s stagger)`);
        
        const progress: QueuedAudioProgress[] = audioFiles.map((_, index) => ({
          audioIndex: index,
          status: 'pending',
        }));
        setQueuedProgress(progress);

        // Process all audio files concurrently with 2-second staggered start times
        const processAudio = async (audioIndex: number, audioUrl: string): Promise<{ success: boolean; result?: Image; generation?: Generation; error?: string }> => {
          // Stagger the start time by 2 seconds per index
          const startDelay = audioIndex * 2000;
          if (startDelay > 0) {
            console.log(`⏳ Audio ${audioIndex + 1}: Waiting ${startDelay}ms before starting...`);
            await new Promise(resolve => setTimeout(resolve, startDelay));
          }

          // Update progress to processing
          setQueuedProgress(prev => prev.map((p, idx) => 
            idx === audioIndex ? { ...p, status: 'processing' } : p
          ));

          const allParameters = {
            ...baseParameters,
            audio: audioUrl,
          };

          console.log(`📤 Processing audio ${audioIndex + 1}/${audioFiles.length}:`, {
            modelId: model.id,
            audioIndex: audioIndex,
          });

          try {
            const response = await generateWavespeed(model, allParameters, apiKey ?? "");

            if (response.success) {
              console.log(`✅ Audio ${audioIndex + 1} generation successful`);
              
              // Update progress to completed
              setQueuedProgress(prev => prev.map((p, idx) => 
                idx === audioIndex ? { ...p, status: 'completed', result: response.image } : p
              ));

              // Create generation record
              const outputImages = response.images ?? [response.image];
              const newGeneration: Generation = {
                id: uuidv4(),
                modelId: model.id,
                modelName: model.name,
                prompt: `${prompt} (Audio ${audioIndex + 1}/${audioFiles.length})`,
                parameters: allParameters,
                output: {
                  images: outputImages,
                  timings: response.timings || {},
                  seed: response.seed,
                  has_nsfw_concepts: response.has_nsfw_concepts || [],
                },
                timestamp: Date.now(),
              };

              return { success: true, result: response.image, generation: newGeneration };
            } else {
              console.error(`❌ Audio ${audioIndex + 1} generation failed:`, response.error);
              
              // Update progress to failed
              setQueuedProgress(prev => prev.map((p, idx) => 
                idx === audioIndex ? { ...p, status: 'failed', error: response.error } : p
              ));

              toast({
                title: `Audio ${audioIndex + 1} failed`,
                description: response.error,
                variant: "destructive",
              });

              return { success: false, error: response.error };
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
            console.error(`💥 Audio ${audioIndex + 1} error:`, error);
            
            setQueuedProgress(prev => prev.map((p, idx) => 
              idx === audioIndex ? { ...p, status: 'failed', error: errorMessage } : p
            ));

            return { success: false, error: errorMessage };
          }
        };

        // Start all processes concurrently
        const promises = audioFiles.map((audioUrl, index) => 
          processAudio(index, audioUrl)
        );

        // Wait for all to complete
        const results = await Promise.all(promises);

        // Collect successful results
        const allResults: Image[] = [];
        const allGenerations: Generation[] = [];

        results.forEach((result, index) => {
          if (result.success && result.result && result.generation) {
            allResults.push(result.result);
            allGenerations.push(result.generation);
          }
        });

        if (allResults.length > 0) {
          setResult(allResults[0]);
          setPreviewImages(allResults);
          setPreviewIndex(0);

          // Update generations in state and localStorage
          const updatedGenerations = [...allGenerations, ...generations];
          setGenerations(persistGenerations(updatedGenerations));

          setGenStatus(allResults.length === audioFiles.length ? "success" : "failed");
          toast({
            title: "Concurrent processing complete",
            description: `Successfully processed ${allResults.length} of ${audioFiles.length} audio files`,
          });
        } else {
          setGenStatus("failed");
        }
      } else {
        // Single audio file or no audio - process normally
        const allParameters = {
          ...baseParameters,
        };

        console.log("📤 Sending generation request with parameters:", {
          modelId: model.id,
          provider: providerName,
          parameters: {
            ...allParameters,
            prompt: prompt.substring(0, 50) + "...",
          },
        });

        const response = isReplicateModel
          ? await generateReplicate(model, allParameters, apiKey ?? "")
          : isBytePlusModel
            ? await generateBytePlus(model, allParameters, apiKey ?? "")
            : isWavespeedModel
              ? await generateWavespeed(model, allParameters, apiKey ?? "")
              : await generateImage(model, allParameters, apiKey ?? "");

        if (response.success) {
          console.log("✅ Generation successful:", {
            seed: response.seed,
            requestId: response.requestId,
          });
          setResult(response.image);
          setPreviewImages(response.images ?? [response.image]);
          setPreviewIndex(0);

          // Create a new generation record
          const outputImages = response.images ?? [response.image];
          const newGeneration: Generation = {
            id: uuidv4(),
            modelId: model.id,
            modelName: model.name,
            prompt,
            parameters: allParameters,
            output: {
              images: outputImages,
              timings: response.timings || {},
              seed: response.seed,
              has_nsfw_concepts: response.has_nsfw_concepts || [],
            },
            timestamp: Date.now(),
          };

          // Update generations in state and localStorage
          const updatedGenerations = [newGeneration, ...generations];
          setGenerations(persistGenerations(updatedGenerations));

          setGenStatus("success");
          toast({
            title: "Image generated successfully",
            description: `Seed: ${response.seed}`,
          });
        } else {
          console.error("❌ Generation failed:", response.error);
          setGenStatus("failed");
          toast({
            title: "Generation failed",
            description: response.error,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("💥 Unexpected error during generation:", error);
      setGenStatus("failed");
      toast({
        title: "Generation failed",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      console.log("🏁 Finishing generation process");
      setIsGenerating(false);
    }
  }

  const completedCount = queuedProgress.filter(p => p.status === 'completed').length;
  const totalQueued = queuedProgress.length;
  const progressPercentage = totalQueued > 0 ? (completedCount / totalQueued) * 100 : 0;

  return (
    <div className="flex flex-col space-y-8 w-full max-w-6xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GenerationSettings 
          prompt={prompt}
          setPrompt={setPrompt}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          model={model}
          parameters={parameters}
          setParameters={setParameters}
        />
        <div className="flex flex-col space-y-4">
          {queuedProgress.length > 0 && (
            <div className="space-y-2 p-4 border rounded-lg bg-muted/20">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Queue Progress</span>
                <span className="text-muted-foreground">
                  {completedCount} / {totalQueued} completed
                </span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
              <div className="space-y-1 mt-2">
                {queuedProgress.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    {item.status === 'completed' && (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    )}
                    {item.status === 'failed' && (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                    {item.status === 'processing' && (
                      <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                    )}
                    {item.status === 'pending' && (
                      <Clock className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className={item.status === 'failed' ? 'text-red-500' : ''}>
                      Audio {idx + 1}: {item.status === 'completed' ? 'Completed' : 
                                      item.status === 'failed' ? `Failed: ${item.error}` :
                                      item.status === 'processing' ? 'Processing...' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <ImageDisplay 
            result={previewImages[previewIndex] ?? result} 
            forceVideo={model.mediaType === "video"}
            isGenerating={isGenerating}
            canNavigate={previewImages.length > 1}
            onPrevious={
              previewImages.length > 1 && previewIndex > 0
                ? () => setPreviewIndex((i) => Math.max(0, i - 1))
                : undefined
            }
            onNext={
              previewImages.length > 1 && previewIndex < previewImages.length - 1
                ? () =>
                    setPreviewIndex((i) =>
                      Math.min(previewImages.length - 1, i + 1)
                    )
                : undefined
            }
          />
        </div>
      </div>
      <GenerationsGallery generations={generations} onGenerationsChange={setGenerations} />
    </div>
  );
} 