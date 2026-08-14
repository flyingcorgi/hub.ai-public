'use client';

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Model, ModelParameter } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  HelpCircle,
  Upload,
  Music,
  Film,
  Loader2,
  Plus,
  X,
  Minus,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Save,
  Trash2,
} from "lucide-react";
import { fal } from "@fal-ai/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  CustomPromptTemplate,
  loadCustomPromptTemplates,
  persistCustomPromptTemplates,
  PROMPT_TEMPLATES,
} from "@/lib/prompt-templates";
import { groupByCategory } from "@/lib/group-by-category";

interface GenerationSettingsProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  model: Model;
  parameters: Record<string, any>;
  setParameters: Dispatch<SetStateAction<Record<string, any>>>;
}

export function GenerationSettings({ 
  prompt, 
  setPrompt, 
  onGenerate, 
  isGenerating, 
  model,
  parameters,
  setParameters 
}: GenerationSettingsProps) {
  const { toast } = useToast();
  const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});
  const [isSeedreamSizeOpen, setIsSeedreamSizeOpen] = useState(true);
  const [selectedPromptTemplateId, setSelectedPromptTemplateId] = useState<string | undefined>();
  const [customTemplates, setCustomTemplates] = useState<CustomPromptTemplate[]>([]);
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateCategoryDraft, setTemplateCategoryDraft] = useState("");

  useEffect(() => {
    setCustomTemplates(loadCustomPromptTemplates());
  }, []);

  const handleSaveTemplate = () => {
    const name = templateNameDraft.trim();
    if (!name) {
      toast({ title: "Name required", description: "Give the template a name first.", variant: "destructive" });
      return;
    }
    if (!prompt.trim()) {
      toast({
        title: "Prompt is empty",
        description: "Write a prompt before saving it as a template.",
        variant: "destructive",
      });
      return;
    }

    const currentLoras = parameters.loras as { path: string; scale: number }[] | undefined;
    const nonEmptyLoras = currentLoras?.filter((lora) => lora.path.trim());
    const category = templateCategoryDraft.trim();
    const newTemplate: CustomPromptTemplate = {
      id: `custom-${uuidv4()}`,
      label: name,
      prompt,
      ...(category ? { category } : {}),
      ...(nonEmptyLoras && nonEmptyLoras.length > 0 ? { loras: nonEmptyLoras } : {}),
    };
    const next = [...customTemplates, newTemplate];
    setCustomTemplates(next);
    persistCustomPromptTemplates(next);
    setSelectedPromptTemplateId(newTemplate.id);
    setTemplateNameDraft("");
    setTemplateCategoryDraft("");
    setShowSaveTemplateInput(false);
    toast({ title: "Template saved", description: `Saved "${name}".` });
  };

  const handleDeleteTemplate = (id: string) => {
    const template = customTemplates.find((t) => t.id === id);
    const next = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(next);
    persistCustomPromptTemplates(next);
    if (selectedPromptTemplateId === id) setSelectedPromptTemplateId(undefined);
    if (template) toast({ title: "Template deleted", description: `Deleted "${template.label}".` });
  };

  const formatLabel = (key: string) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  const updateParameter = (key: string, newValue: any) => {
    setParameters((prev) => {
      const next = { ...prev };
      if (newValue === undefined || newValue === "") {
        delete next[key];
      } else {
        next[key] = newValue;
      }
      return next;
    });
  };

  const clampSize = (size: number) => Math.min(8192, Math.max(512, size));

  const formatSize = (width: number, height: number) =>
    `${clampSize(Math.round(width))}*${clampSize(Math.round(height))}`;

  const parseSize = (rawValue: unknown) => {
    if (typeof rawValue !== "string") {
      return { width: 2560, height: 1440 };
    }

    const match = rawValue.match(/^(\d+)\*(\d+)$/);
    if (!match) {
      return { width: 2560, height: 1440 };
    }

    return {
      width: clampSize(Number(match[1])),
      height: clampSize(Number(match[2])),
    };
  };

  const handleFileUpload = async (file: File): Promise<string | null> => {
    try {
      const apiKey = localStorage.getItem('fal-ai-api-key') ?? process.env.NEXT_PUBLIC_API_KEY;
      
      if (!apiKey) {
        toast({
          title: "API Key Required",
          description: "Please set your FAL.AI API key first to upload files.",
          variant: "destructive",
        });
        return null;
      }

      fal.config({
        credentials: apiKey,
      });

      const url = await fal.storage.upload(file);
      return url;
    } catch (error) {
      console.error("Upload failed:", error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
      return null;
    }
  };

  const renderImageInput = ({
    id,
    label,
    value,
    onChange,
    showLabel = true,
    helperText = "Paste a public image URL or upload a local image (converted to a data URI).",
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (val: string) => void;
    showLabel?: boolean;
    helperText?: string;
  }) => {
    const stringValue = typeof value === "string" ? value : "";
    const showUrl = stringValue.startsWith("data:") ? "" : stringValue;
    const hasUpload = stringValue.startsWith("data:");
    const previewUrl = stringValue || showUrl;
    const handleUpload = (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    };

    return (
      <div className="space-y-2">
        {showLabel && (
          <Label htmlFor={id} className="text-sm">
            {label}
          </Label>
        )}
        <Input
          id={id}
          type="url"
          placeholder="https://example.com/image.png"
          value={showUrl}
          className="h-8"
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept="image/*"
            className="h-8"
            onChange={(e) => {
              handleUpload(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          {hasUpload && (
            <span className="text-xs text-muted-foreground">
              Uploaded image attached
            </span>
          )}
          {(showUrl || hasUpload) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange("")}
              className="h-8"
            >
              Clear
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{helperText}</p>
        {previewUrl && (
          <div className="mt-2">
            <div className="border rounded-md overflow-hidden bg-muted/40 max-h-40 flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Image preview"
                className="max-h-40 w-auto object-contain"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAudioInput = ({
    id,
    label,
    value,
    onChange,
    showLabel = true,
    helperText = "Paste a public audio URL or upload a local audio file.",
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (val: string) => void;
    showLabel?: boolean;
    helperText?: string;
  }) => {
    const stringValue = typeof value === "string" ? value : "";
    const showUrl = stringValue.startsWith("data:") ? "" : stringValue;
    const hasUpload = stringValue.startsWith("data:");
    const handleUpload = (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    };

    return (
      <div className="space-y-2">
        {showLabel && (
          <Label htmlFor={id} className="text-sm">
            {label}
          </Label>
        )}
        <Input
          id={id}
          type="url"
          placeholder="https://example.com/audio.mp3"
          value={showUrl}
          className="h-8"
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Input
              type="file"
              accept="audio/*"
              className="h-8 w-full cursor-pointer opacity-0 absolute top-0 left-0 z-10"
              onChange={(e) => {
                handleUpload(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <Button variant="outline" size="sm" className="h-8 w-full pointer-events-none">
              <Upload className="h-3 w-3 mr-2" />
              Upload Audio
            </Button>
          </div>
          
          {hasUpload && (
            <span className="text-xs text-muted-foreground">
              Audio file attached
            </span>
          )}
          {(showUrl || hasUpload) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange("")}
              className="h-8"
            >
              Clear
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{helperText}</p>
        {(showUrl || hasUpload) && (
          <div className="mt-2 border rounded-md p-2 bg-muted/20">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Music className="h-4 w-4" />
              <span>Audio Preview</span>
            </div>
            <audio controls src={stringValue} className="w-full h-8" />
          </div>
        )}
      </div>
    );
  };

  const renderVideoInput = ({
    id,
    label,
    value,
    onChange,
    showLabel = true,
    helperText = "Paste a public video URL or upload a local video file.",
  }: {
    id: string;
    label: string;
    value: string;
    onChange: (val: string) => void;
    showLabel?: boolean;
    helperText?: string;
  }) => {
    const stringValue = typeof value === "string" ? value : "";
    const showUrl = stringValue.startsWith("data:") ? "" : stringValue;
    const hasUpload = stringValue.startsWith("data:");
    const handleUpload = (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    };

    return (
      <div className="space-y-2">
        {showLabel && (
          <Label htmlFor={id} className="text-sm">
            {label}
          </Label>
        )}
        <Input
          id={id}
          type="url"
          placeholder="https://example.com/video.mp4"
          value={showUrl}
          className="h-8"
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Input
              type="file"
              accept="video/*"
              className="h-8 w-full cursor-pointer opacity-0 absolute top-0 left-0 z-10"
              onChange={(e) => {
                handleUpload(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <Button variant="outline" size="sm" className="h-8 w-full pointer-events-none">
              <Upload className="h-3 w-3 mr-2" />
              Upload Video
            </Button>
          </div>

          {hasUpload && (
            <span className="text-xs text-muted-foreground">
              Video file attached
            </span>
          )}
          {(showUrl || hasUpload) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange("")}
              className="h-8"
            >
              Clear
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{helperText}</p>
        {(showUrl || hasUpload) && (
          <div className="mt-2 border rounded-md p-2 bg-muted/20">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Film className="h-4 w-4" />
              <span>Video Preview</span>
            </div>
            <video controls src={stringValue} className="w-full max-h-40" />
          </div>
        )}
      </div>
    );
  };

  const renderMultipleAudioInput = ({
    id,
    label,
    value,
    onChange,
    showLabel = true,
    helperText = "Add multiple audio files to queue. Each will be processed with the same image.",
  }: {
    id: string;
    label: string;
    value: string[];
    onChange: (audios: string[]) => void;
    showLabel?: boolean;
    helperText?: string;
  }) => {
    const handleAddAudio = (audioUrl: string) => {
      if (audioUrl && !value.includes(audioUrl)) {
        onChange([...value, audioUrl]);
      }
    };

    const handleRemoveAudio = (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    };

    const handleUpload = (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        handleAddAudio(reader.result as string);
      };
      reader.readAsDataURL(file);
    };

    const handleUrlAdd = (url: string) => {
      if (url.trim()) {
        handleAddAudio(url.trim());
      }
    };

    return (
      <div className="space-y-2">
        {showLabel && (
          <Label htmlFor={id} className="text-sm">
            {label} {value.length > 0 && <span className="text-muted-foreground">({value.length} queued)</span>}
          </Label>
        )}
        
        {/* Add new audio input */}
        <div className="space-y-2">
          <Input
            type="url"
            placeholder="https://example.com/audio.mp3"
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleUrlAdd(e.currentTarget.value);
                e.currentTarget.value = "";
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Input
                type="file"
                accept="audio/*"
                className="h-8 w-full cursor-pointer opacity-0 absolute top-0 left-0 z-10"
                onChange={(e) => {
                  handleUpload(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              <Button variant="outline" size="sm" className="h-8 pointer-events-none">
                <Plus className="h-3 w-3 mr-2" />
                Add Audio
              </Button>
            </div>
          </div>
        </div>

        {/* List of queued audios */}
        {value.length > 0 && (
          <div className="space-y-2 mt-3">
            {value.map((audio, index) => {
              const isDataUri = audio.startsWith("data:");
              const showUrl = isDataUri ? "" : audio;
              
              return (
                <div key={index} className="border rounded-md p-2 bg-muted/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Music className="h-4 w-4" />
                      <span className="font-medium">Audio {index + 1}</span>
                      {isDataUri && (
                        <span className="text-xs text-muted-foreground">(Uploaded)</span>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveAudio(index)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  {showUrl && (
                    <div className="text-xs text-muted-foreground mb-2 truncate">
                      {showUrl}
                    </div>
                  )}
                  <audio controls src={audio} className="w-full h-8" />
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{helperText}</p>
      </div>
    );
  };

  const renderLabelWithHelp = (param: ModelParameter, opts?: { htmlFor?: string }) => {
    const labelText = formatLabel(param.key);
    const description = param.description;

    if (!description) {
      return (
        <Label htmlFor={opts?.htmlFor ?? param.key} className="text-sm">
          {labelText}
        </Label>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <Label htmlFor={opts?.htmlFor ?? param.key} className="text-sm">
          {labelText}
        </Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`More info about ${labelText}`}
            >
              <HelpCircle className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-xs">
            <p className="whitespace-pre-line">{description}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  };

  const renderSeedreamSizeInput = (param: ModelParameter, value: unknown) => {
    const isBytePlusSeedreamEdit = model.id === "byteplus/bytedance/seedream-v4.5/edit";
    const isZImage = model.id === "wavespeed-ai/z-image/turbo-lora";
    const minSize = isBytePlusSeedreamEdit ? 1440 : 512;
    const maxSize = isBytePlusSeedreamEdit ? 4096 : isZImage ? 1440 : 8192;
    const clampLocalSize = (size: number) => Math.min(maxSize, Math.max(minSize, size));
    const parsedSize = parseSize(value);
    const width = clampLocalSize(parsedSize.width);
    const height = clampLocalSize(parsedSize.height);
    const aspectRatios = isBytePlusSeedreamEdit
      ? [
          { label: "2560x1440", width: 2560, height: 1440, Icon: RectangleHorizontal },
          { label: "1440x2560", width: 1440, height: 2560, Icon: RectangleVertical },
          { label: "2048x2048", width: 2048, height: 2048, Icon: Square },
          { label: "3072x3072", width: 3072, height: 3072, Icon: Square },
          { label: "3840x2160", width: 3840, height: 2160, Icon: RectangleHorizontal },
          { label: "2160x3840", width: 2160, height: 3840, Icon: RectangleVertical },
          { label: "4096x4096", width: 4096, height: 4096, Icon: Square },
        ]
      : isZImage
        ? [
            // Z-Image Turbo LoRA only reliably works around "1K" scale (its max side is 1440),
            // unlike the other WaveSpeed models this size picker is shared with.
            { label: "1:1", width: 1440, height: 1440, Icon: Square },
            { label: "16:9", width: 1280, height: 720, Icon: RectangleHorizontal },
            { label: "9:16", width: 720, height: 1280, Icon: RectangleVertical },
            { label: "4:3", width: 1280, height: 960, Icon: RectangleHorizontal },
            { label: "3:4", width: 960, height: 1280, Icon: RectangleVertical },
            { label: "3:2", width: 1248, height: 832, Icon: RectangleHorizontal },
            { label: "2:3", width: 832, height: 1248, Icon: RectangleVertical },
          ]
        : [
            { label: "1:1", width: 2048, height: 2048, Icon: Square },
            { label: "16:9", width: 2560, height: 1440, Icon: RectangleHorizontal },
            { label: "9:16", width: 1440, height: 2560, Icon: RectangleVertical },
            { label: "4:3", width: 2304, height: 1728, Icon: RectangleHorizontal },
            { label: "3:4", width: 1728, height: 2304, Icon: RectangleVertical },
            { label: "3:2", width: 2432, height: 1664, Icon: RectangleHorizontal },
            { label: "2:3", width: 1664, height: 2432, Icon: RectangleVertical },
            { label: "4K landscape", width: 3840, height: 2160, Icon: RectangleHorizontal },
          ];
    const activeRatio = aspectRatios.find(
      (ratio) => width === ratio.width && height === ratio.height
    );
    const setSize = (nextWidth: number, nextHeight: number) => {
      updateParameter(
        param.key,
        `${clampLocalSize(Math.round(nextWidth))}*${clampLocalSize(Math.round(nextHeight))}`
      );
    };

    return (
      <div key={param.key} className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          {renderLabelWithHelp(param)}
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label={isSeedreamSizeOpen ? "Collapse size settings" : "Expand size settings"}
            onClick={() => setIsSeedreamSizeOpen((isOpen) => !isOpen)}
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>
        {isSeedreamSizeOpen && (
          <>
            <div className="flex flex-wrap gap-2">
              {aspectRatios.map((ratio) => {
                const Icon = ratio.Icon;

                return (
                  <Button
                    key={ratio.label}
                    type="button"
                    size="sm"
                    variant={activeRatio?.label === ratio.label ? "default" : "outline"}
                    className="gap-2"
                    onClick={() => setSize(ratio.width, ratio.height)}
                  >
                    <Icon className="h-4 w-4" />
                    {ratio.label}
                  </Button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor={`${param.key}-width`} className="text-sm">
                  width
                </Label>
                <Input
                  id={`${param.key}-width`}
                  type="range"
                  min={minSize}
                  max={maxSize}
                  step={64}
                  value={width}
                  className="h-6 accent-foreground"
                  onChange={(event) => setSize(Number(event.target.value), height)}
                />
              </div>
              <Input
                type="number"
                min={minSize}
                max={maxSize}
                value={width}
                className="h-12 text-lg"
                onChange={(event) => setSize(Number(event.target.value), height)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor={`${param.key}-height`} className="text-sm">
                  height
                </Label>
                <Input
                  id={`${param.key}-height`}
                  type="range"
                  min={minSize}
                  max={maxSize}
                  step={64}
                  value={height}
                  className="h-6 accent-foreground"
                  onChange={(event) => setSize(width, Number(event.target.value))}
                />
              </div>
              <Input
                type="number"
                min={minSize}
                max={maxSize}
                value={height}
                className="h-12 text-lg"
                onChange={(event) => setSize(width, Number(event.target.value))}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {width} x {height} px <span className="float-right">Range: {minSize} - {maxSize}</span>
            </p>
          </>
        )}
      </div>
    );
  };

  function renderParameter(param: ModelParameter) {
    if (
      param.key === 'prompt' ||
      param.key === 'sync_mode' ||
      param.key === 'enable_safety_checker' ||
      param.key === 'disable_safety_checker'
    ) return null;

    const value = parameters[param.key] ?? param.default;
    const onChange = (newValue: any) => {
      updateParameter(param.key, newValue);
    };

    switch (param.type) {
      case 'string':
        if (
          param.key === "size" &&
          (model.id === "bytedance/seedream-v4.5/edit" ||
            model.id === "byteplus/bytedance/seedream-v4.5/edit" ||
            model.id === "wavespeed-ai/z-image/turbo-lora")
        ) {
          return renderSeedreamSizeInput(param, value);
        }

        return (
          <div key={param.key} className="space-y-1">
            {renderLabelWithHelp(param, { htmlFor: param.key })}
            <Input
              id={param.key}
              value={typeof value === "string" ? value : ""}
              className="h-8"
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        );

      case 'enum': {
        // Radix Select values are strings; support numeric enums by mapping string <-> original value.
        // This fixes selecting duration (e.g. 5/8) for Wavespeed video models.
        const enumOptions = (param.options ?? []) as Array<string | number>;
        const selectedValueStr =
          value === undefined || value === null ? "" : String(value);

        return (
          <div key={param.key} className="space-y-1">
            {renderLabelWithHelp(param, { htmlFor: param.key })}
            <Select
              value={selectedValueStr}
              onValueChange={(nextValueStr) => {
                const matched = enumOptions.find(
                  (opt) => String(opt) === nextValueStr
                );
                onChange(matched ?? nextValueStr);
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {enumOptions.map((option) => {
                  const optionStr = String(option);
                  return (
                    <SelectItem key={optionStr} value={optionStr}>
                      {optionStr}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        );
      }
      
      case 'boolean':
        return (
          <div key={param.key} className="flex items-center justify-between space-x-2 py-1">
            {renderLabelWithHelp(param, { htmlFor: param.key })}
            <Switch
              id={param.key}
              checked={value}
              onCheckedChange={onChange}
            />
          </div>
        );

      case 'image': {
        return (
          <div key={param.key}>
            {renderImageInput({
              id: param.key,
              label: formatLabel(param.key),
              value: typeof value === "string" ? value : "",
              onChange,
            })}
          </div>
        );
      }

      case 'audio': {
        // Check if this is a Wavespeed model that supports multiple audio files
        const isWavespeedAudioModel = model.id.startsWith('wavespeed-ai/') && 
          (model.id.includes('multitalk') || model.id.includes('infinitetalk'));
        
        if (isWavespeedAudioModel) {
          return (
            <div key={param.key}>
              {renderMultipleAudioInput({
                id: param.key,
                label: formatLabel(param.key),
                value: Array.isArray(value) ? value : (value ? [value] : []),
                onChange: (audios: string[]) => {
                  onChange(audios.length === 0 ? "" : audios.length === 1 ? audios[0] : audios);
                },
              })}
            </div>
          );
        }
        
        return (
          <div key={param.key}>
            {renderAudioInput({
              id: param.key,
              label: formatLabel(param.key),
              value: typeof value === "string" ? value : "",
              onChange,
            })}
          </div>
        );
      }

      case 'video': {
        return (
          <div key={param.key}>
            {renderVideoInput({
              id: param.key,
              label: formatLabel(param.key),
              value: typeof value === "string" ? value : "",
              onChange,
            })}
          </div>
        );
      }

      case 'number':
        // Special handling for guidance_scale and num_inference_steps
        if (param.key === 'guidance_scale' || param.key === 'num_inference_steps') {
          const config = {
            guidance_scale: {
              min: 1,
              max: 10,
              step: 0.1,
              default: 3.5,
              decimals: 1
            },
            num_inference_steps: {
              min: 1,
              max: 50,
              step: 1,
              default: 35,
              decimals: 0
            }
          }[param.key];

          return (
            <div key={param.key} className="space-y-1">
              <div className="flex items-center justify-between">
                {renderLabelWithHelp(param, { htmlFor: param.key })}
                <span className="text-sm w-12 text-right">
                  {Number(value || config.default).toFixed(config.decimals)}
                </span>
              </div>
              <Input
                id={param.key}
                type="range"
                min={config.min}
                max={config.max}
                step={config.step}
                value={value || config.default}
                className="h-6"
                onChange={(e) => onChange(Number(e.target.value))}
              />
            </div>
          );
        }

        // Default number input for other numeric parameters
        return (
          <div key={param.key} className="space-y-1">
            {renderLabelWithHelp(param, { htmlFor: param.key })}
            <Input
              id={param.key}
              type="number"
              value={value}
              className="h-8"
              onChange={(e) => onChange(Number(e.target.value))}
            />
          </div>
        );
      
      case 'array':
        if (param.key.endsWith('loras')) {
          const loras = value as Array<{ path: string; scale: number }> || [];
          const MAX_LORAS = 3;

          return (
            <div key={param.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">
                  {formatLabel(param.key).replace(/Loras$/, "LoRAs")} ({loras.length}/{MAX_LORAS})
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onChange([...loras, { path: '', scale: 1 }])}
                  disabled={loras.length >= MAX_LORAS}
                >
                  Add LoRA
                </Button>
              </div>
              <div className="space-y-2">
                {loras.map((lora, index) => (
                  <div key={index} className="p-2 border rounded-lg space-y-1">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-sm">LoRA #{index + 1}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => {
                          const newLoras = [...loras];
                          newLoras.splice(index, 1);
                          onChange(newLoras);
                        }}
                      >
                        ×
                      </Button>
                    </div>
                    <div className="grid grid-cols-[2fr,1fr] gap-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="LoRA URL or .safetensors path"
                          value={lora.path}
                          className="h-7"
                          onChange={(e) => {
                            const newLoras = [...loras];
                            newLoras[index] = { ...lora, path: e.target.value };
                            onChange(newLoras);
                          }}
                        />
                        <div className="relative">
                          <Input
                            type="file"
                            className="absolute inset-0 opacity-0 cursor-pointer w-8"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const key = `lora-${index}`;
                                setUploadingState(prev => ({ ...prev, [key]: true }));
                                const url = await handleFileUpload(file);
                                setUploadingState(prev => ({ ...prev, [key]: false }));
                                if (url) {
                                  const newLoras = [...loras];
                                  newLoras[index] = { ...lora, path: url };
                                  onChange(newLoras);
                                }
                                e.target.value = "";
                              }
                            }}
                          />
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 w-8 px-0"
                            disabled={uploadingState[`lora-${index}`]}
                          >
                            {uploadingState[`lora-${index}`] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="range"
                          min={0}
                          max={2}
                          step={0.1}
                          value={lora.scale}
                          className="h-7"
                          onChange={(e) => {
                            const newLoras = [...loras];
                            newLoras[index] = { ...lora, scale: Number(e.target.value) };
                            onChange(newLoras);
                          }}
                        />
                        <span className="text-sm w-8 text-right">
                          {lora.scale.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (param.items?.type === "image") {
          const imageArray = Array.isArray(value) ? value : [];
          const addImage = () => onChange([...(imageArray || []), ""]);
          const updateImage = (index: number, newValue: string) => {
            const next = [...imageArray];
            next[index] = newValue;
            onChange(next.filter((entry) => entry !== ""));
          };
          const removeImage = (index: number) => {
            const next = [...imageArray];
            next.splice(index, 1);
            onChange(next);
          };

          return (
            <div key={param.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{formatLabel(param.key)}</Label>
                <Button size="sm" variant="outline" onClick={addImage}>
                  Add Image
                </Button>
              </div>
              {imageArray.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add at least one reference image.
                </p>
              )}
              <div className="space-y-3">
                {imageArray.map((entry: string, index: number) => (
                  <div
                    key={`${param.key}-${index}`}
                    className="border rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Image #{index + 1}</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeImage(index)}
                      >
                        Remove
                      </Button>
                    </div>
                    {renderImageInput({
                      id: `${param.key}-${index}`,
                      label: "",
                      value: entry,
                      onChange: (val) => updateImage(index, val),
                      showLabel: false,
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        }

        {
          const arrayValues = Array.isArray(value) ? value : [];
          return (
            <div key={param.key} className="space-y-1">
              {renderLabelWithHelp(param)}
              <Textarea
                value={arrayValues.join("\n")}
                className="min-h-[80px]"
                placeholder="Enter one value per line"
                onChange={(e) =>
                  onChange(
                    e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                  )
                }
              />
            </div>
          );
        }
      
      default:
        return null;
    }
  }

  // Group parameters by type for more efficient layout
  const groupParameters = () => {
    const enumParams: JSX.Element[] = [];
    const booleanParams: JSX.Element[] = [];
    const numberParams: JSX.Element[] = [];
    const otherParams: JSX.Element[] = [];

    model.inputSchema.forEach(param => {
      const rendered = renderParameter(param);
      if (!rendered) return;

      switch (param.type) {
        case 'enum':
          enumParams.push(rendered);
          break;
        case 'boolean':
          booleanParams.push(rendered);
          break;
        case 'number':
          numberParams.push(rendered);
          break;
        default:
          otherParams.push(rendered);
      }
    });

    return { enumParams, booleanParams, numberParams, otherParams };
  };

  const { enumParams, booleanParams, numberParams, otherParams } = groupParameters();

  return (
    <TooltipProvider delayDuration={0}>
      <Card className="h-full">
        <CardHeader className="pb-4">
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Configure your {model.mediaType === "video" ? "video" : "image"} generation for {model.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_280px] sm:items-end">
              <Label htmlFor="prompt" className="text-sm">
                Prompt
              </Label>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="prompt-template" className="text-xs text-muted-foreground">
                    Prompt template
                  </Label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Save current prompt as a template"
                      onClick={() => {
                        setTemplateNameDraft("");
                        setShowSaveTemplateInput((v) => !v);
                      }}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                    {selectedPromptTemplateId?.startsWith("custom-") && (
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-red-500 hover:bg-muted"
                        title="Delete this template"
                        onClick={() => handleDeleteTemplate(selectedPromptTemplateId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <Select
                  value={selectedPromptTemplateId}
                  onValueChange={(templateId) => {
                    const template = [...PROMPT_TEMPLATES, ...customTemplates].find(
                      (item) => item.id === templateId
                    );
                    if (!template) return;

                    setSelectedPromptTemplateId(templateId);
                    setPrompt(template.prompt);
                    if ("loras" in template && template.loras) {
                      setParameters((prev) => ({ ...prev, loras: template.loras }));
                    }
                  }}
                >
                  <SelectTrigger id="prompt-template" className="h-8">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Built-in</SelectLabel>
                      {PROMPT_TEMPLATES.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {customTemplates.length > 0 && (
                      <>
                        <SelectSeparator />
                        {groupByCategory(customTemplates).map(({ category, items }) => (
                          <SelectGroup key={category}>
                            <SelectLabel>{category}</SelectLabel>
                            {items.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {showSaveTemplateInput && (
                  <div className="flex items-center gap-1 pt-1">
                    <Input
                      placeholder="Template name"
                      value={templateNameDraft}
                      className="h-7 text-xs"
                      autoFocus
                      onChange={(e) => setTemplateNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveTemplate();
                      }}
                    />
                    <Input
                      placeholder="Category (optional)"
                      value={templateCategoryDraft}
                      className="h-7 text-xs"
                      list="prompt-template-categories"
                      onChange={(e) => setTemplateCategoryDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveTemplate();
                      }}
                    />
                    <datalist id="prompt-template-categories">
                      {Array.from(new Set(customTemplates.map((t) => t.category).filter(Boolean))).map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={handleSaveTemplate}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setShowSaveTemplateInput(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <Textarea
              id="prompt"
              placeholder="Enter your image generation prompt..."
              value={prompt}
              onChange={(e) => {
                setSelectedPromptTemplateId(undefined);
                setPrompt(e.target.value);
              }}
              className="min-h-[80px]"
            />
          </div>

          {/* Grid layout for enum parameters */}
          {enumParams.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {enumParams}
            </div>
          )}

          {/* Grid layout for boolean parameters */}
          {booleanParams.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {booleanParams}
            </div>
          )}

          {/* Grid layout for number parameters */}
          {numberParams.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {numberParams}
            </div>
          )}

          {/* Other parameters (like LoRA and Audio) */}
          {otherParams}
        </CardContent>
        <CardFooter>
          <Button 
            onClick={onGenerate}
            disabled={isGenerating || !prompt}
            className="w-full"
          >
            {isGenerating
              ? model.mediaType === "video"
                ? "Generating Video..."
                : "Generating Image..."
              : model.mediaType === "video"
                ? "Generate Video"
                : "Generate Image"}
          </Button>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
