'use client';

import { Model } from "@/lib/types";
import { useState, useEffect, useRef } from "react";
import { VeniceKeySetup } from "@/components/venice-key-setup";
import { readBrowserApiKey } from "@/lib/browser-api-keys";
import { GenerationSettings } from "./image-generator/generation-settings";
import { ImageDisplay } from "./image-generator/image-display";
import { GenerationsGallery } from "./image-generator/generations-gallery";
import { generateVenice } from "@/lib/actions/generate-venice";
import { useToast } from "@/hooks/use-toast";
import { Image, Generation } from "@/lib/types";
import { v4 as uuidv4 } from 'uuid';
import { useGenerationHistory } from "@/hooks/use-generation-history";
import { storageError } from "@/lib/private-storage/database";
import { Button } from "@/components/ui/button";

interface ImageGeneratorProps {
  model: Model;
}

export function ImageGenerator({ model }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<"idle" | "generating" | "success" | "failed">("idle");
  const [result, setResult] = useState<Image | null>(null);
  const [previewImages, setPreviewImages] = useState<Image[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const { store: history, generations, setGenerations, error: historyLoadError } = useGenerationHistory();
  const [unsavedGeneration, setUnsavedGeneration] = useState<Generation | null>(null);
  const [historySaveError, setHistorySaveError] = useState<string | null>(null);
  const [savingHistory, setSavingHistory] = useState(false);
  const { toast } = useToast();
  const [keySetupOpen, setKeySetupOpen] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const generatingRef = useRef(false);

  const [parameters, setParameters] = useState<Record<string, any>>(() => {
    // Initialize parameters with default values from the model schema
    return Object.fromEntries(
      model.inputSchema
        .filter(param => param.default !== undefined)
        .map(param => [param.key, param.default])
    );
  });

  async function saveHistory(record: Generation) {
    setSavingHistory(true);
    try {
      await history.add(record);
      setUnsavedGeneration(null); setHistorySaveError(null);
    } catch (cause) {
      setUnsavedGeneration(record); setHistorySaveError(storageError(cause).message);
    } finally { setSavingHistory(false); }
  }

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
    if (genStatus !== "generating" && !unsavedGeneration) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [genStatus, unsavedGeneration]);

  async function handleGenerate() {
    if (generatingRef.current || savingHistory) return;
    if (unsavedGeneration && !window.confirm("The current result has not been saved to history. Download it or retry saving first. Replace the preview anyway?")) return;
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Describe what you want to generate first",
        variant: "destructive",
      });
      return;
    }

    const apiKey = readBrowserApiKey();
    if (!apiKey) {
      setKeySetupOpen(true);
      return;
    }

    generatingRef.current = true;
    setGenerationError(null);
    setIsGenerating(true);
    setGenStatus("generating");
    setPreviewImages([]);
    setPreviewIndex(0);

    try {
      history.assertActive();
      const allParameters: Record<string, unknown> & { prompt: string } = {
        ...parameters,
        prompt,
      };

      const response = await generateVenice(model, allParameters, apiKey);
      history.assertActive(); // Late responses must never enter a newly selected account.

      if (response.success) {
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

        // A local save failure is not a provider failure: keep the result and never regenerate.
        await saveHistory(newGeneration);

        setGenStatus("success");
        toast({
          title: "Media generated successfully",
          description: `Seed: ${response.seed}`,
        });
      } else {
        setGenStatus("failed");
        setGenerationError(response.error);
        toast({
          title: "Generation failed",
          description: response.error,
          variant: "destructive",
        });
      }
    } catch {
      setGenStatus("failed");
      setGenerationError("The request could not be completed. Check your connection and Venice account before trying again.");
      toast({
        title: "Generation failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col space-y-8 w-full max-w-6xl mx-auto">
      <VeniceKeySetup open={keySetupOpen} onOpenChange={setKeySetupOpen} disabled={isGenerating} />
      {(historySaveError || historyLoadError) && <div role="alert" className="rounded-lg border p-4 text-sm space-y-2">
        <p>{historySaveError || historyLoadError}</p>
        {unsavedGeneration && <><p>Generation succeeded, but history was not saved. Download the preview now or retry only the local save; do not regenerate.</p>
          <Button variant="outline" disabled={savingHistory || isGenerating} onClick={() => void saveHistory(unsavedGeneration)}>Retry saving history</Button></>}
        <a className="block underline" href="/queue">History backups and import</a>
      </div>}
      {generationError && (
        <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm space-y-2">
          <p className="font-medium">{generationError}</p>
          <p>Your inputs are still here. You can change your API key above. Nothing is retried automatically; another generation may incur another Venice charge.</p>
        </div>
      )}
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
          <ImageDisplay
            result={previewImages[previewIndex] ?? result}
            forceVideo={model.mediaType === "video"}
            isGenerating={isGenerating}
            canNavigate={previewImages.length > 1}
            prompt={prompt}
            modelName={model.name}
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
