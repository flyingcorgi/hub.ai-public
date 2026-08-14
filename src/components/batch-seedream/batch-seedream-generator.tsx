'use client';

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { Image, Generation, Model, ModelParameter } from "@/lib/types";
import { allModels } from "@/lib/models/registry";
import { modelNavGroups, modelById, providerFor } from "@/lib/models/nav-groups";
import { GenerationsGallery } from "@/components/image-generator/generations-gallery";
import {
  CustomPromptTemplate,
  loadCustomPromptTemplates,
  persistCustomPromptTemplates,
  PROMPT_TEMPLATES,
} from "@/lib/prompt-templates";
import { groupByCategory } from "@/lib/group-by-category";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Plus,
  Copy,
  Trash2,
  Upload,
  Download,
  RotateCcw,
  Save,
  FolderOpen,
} from "lucide-react";

type JobStatus = "idle" | "queued" | "processing" | "completed" | "failed";
export type ProviderKind = "wavespeed" | "replicate" | "fal" | "byteplus";

export interface BatchJob {
  id: string;
  prompt: string;
  // Every other input field, keyed by that model's own schema key (e.g. "images", "image",
  // "image_input", "negative_prompt", "duration"...). This is what makes the batch tool work
  // generically across every model instead of needing hand-built fields per model.
  parameters: Record<string, unknown>;
  enabled: boolean;
}

interface JobResult {
  status: JobStatus;
  images?: Image[];
  error?: string;
  requestId?: string;
}

export interface BatchTemplate {
  id: string;
  name: string;
  modelId: string;
  jobs: BatchJob[];
  appendText: string;
  // Free-form, user-typed — no fixed list. Empty/omitted templates are grouped under
  // "Uncategorized" wherever templates are listed.
  category?: string;
  updatedAt: number;
}

const FAL_API_KEY_STORAGE_KEY = "fal-ai-api-key";
const WAVESPEED_API_KEY_STORAGE_KEY = "wavespeed-api-key";
const REPLICATE_API_KEY_STORAGE_KEY = "replicate-api-key";
const BYTEPLUS_API_KEY_STORAGE_KEY = "byteplus-api-key";
const GENERATIONS_STORAGE_KEY = "fal-ai-generations";
// v2: the batch tool used to only support 4 hand-picked models via a closed `Target` union.
// Now any model in the registry can be selected, so jobs are keyed generically by that model's
// own parameter names instead of a handful of fixed fields — a different enough on-disk shape
// that this bumps the storage key rather than migrating v1 data.
const BATCH_STORAGE_KEY = "seedream-batch-automation-v2";
const TEMPLATES_STORAGE_KEY = "seedream-batch-templates-v2";
const MAX_STORED_GENERATIONS = 60;
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 10;
const WORKER_START_STAGGER_MS = 300;
const DEFAULT_MODEL_ID = "bytedance/seedream-v4.5/edit";

const WAVESPEED_ASPECT_RATIOS: { label: string; sizes: Record<"2K" | "4K", string> }[] = [
  { label: "1:1", sizes: { "2K": "2048*2048", "4K": "4096*4096" } },
  { label: "16:9", sizes: { "2K": "2560*1440", "4K": "3840*2160" } },
  { label: "9:16", sizes: { "2K": "1440*2560", "4K": "2160*3840" } },
  { label: "4:3", sizes: { "2K": "2304*1728", "4K": "3840*2880" } },
  { label: "3:4", sizes: { "2K": "1728*2304", "4K": "2880*3840" } },
  { label: "3:2", sizes: { "2K": "2432*1664", "4K": "3840*2560" } },
  { label: "2:3", sizes: { "2K": "1664*2432", "4K": "2560*3840" } },
];

// Z-Image Turbo LoRA only reliably works around "1K" scale (max side 1440), unlike the other
// WaveSpeed models WAVESPEED_ASPECT_RATIOS is shared across — so it gets its own, smaller preset
// list instead of a 2K/4K resolution toggle.
const Z_IMAGE_ASPECT_RATIOS: { label: string; size: string }[] = [
  { label: "1:1", size: "1440*1440" },
  { label: "16:9", size: "1280*720" },
  { label: "9:16", size: "720*1280" },
  { label: "4:3", size: "1280*960" },
  { label: "3:4", size: "960*1280" },
  { label: "3:2", size: "1248*832" },
  { label: "2:3", size: "832*1248" },
];

// Prompt (and occasionally one other field) worth pre-filling for specific models, carried over
// from earlier iterations of this tool. Keyed by model id so it's easy to extend.
// (Empty in this public build — the real defaults live only in the private deployment.)
const MODEL_SMART_DEFAULTS: Record<string, { prompt: string; parameters?: Record<string, unknown> }> = {};

export function formatLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// Fields intentionally not shown per job: "prompt" has its own dedicated textarea; no
// "*loras" field (some models split these into loras/high_noise_loras/low_noise_loras) is
// worth a per-job picker here; the rest are always forced by the generation actions themselves
// (see generate-wavespeed.ts/generate-image.ts), so exposing a toggle for them would be misleading.
export const EXCLUDED_PARAM_KEYS = new Set([
  "prompt",
  "sync_mode",
  "enable_safety_checker",
  "disable_safety_checker",
]);

export function isExcludedParamKey(key: string): boolean {
  return EXCLUDED_PARAM_KEYS.has(key) || key.endsWith("loras");
}

export function providerKindFor(modelId: string): ProviderKind {
  const provider = providerFor(modelId);
  if (provider === "WaveSpeed") return "wavespeed";
  if (provider === "Replicate") return "replicate";
  if (provider === "BytePlus") return "byteplus";
  return "fal";
}

export function providerLabel(providerKind: ProviderKind) {
  switch (providerKind) {
    case "wavespeed":
      return "WaveSpeed";
    case "replicate":
      return "Replicate";
    case "byteplus":
      return "BytePlus";
    default:
      return "FAL.AI";
  }
}

export function apiKeyFor(providerKind: ProviderKind): string | null {
  switch (providerKind) {
    case "wavespeed":
      return localStorage.getItem(WAVESPEED_API_KEY_STORAGE_KEY) ?? process.env.NEXT_PUBLIC_WAVESPEED_API_KEY ?? null;
    case "replicate":
      return localStorage.getItem(REPLICATE_API_KEY_STORAGE_KEY) ?? process.env.NEXT_PUBLIC_REPLICATE_API_KEY ?? null;
    case "byteplus":
      return (
        localStorage.getItem(BYTEPLUS_API_KEY_STORAGE_KEY) ??
        process.env.NEXT_PUBLIC_BYTEPLUS_API_KEY ??
        process.env.NEXT_PUBLIC_ARK_API_KEY ??
        null
      );
    default:
      return localStorage.getItem(FAL_API_KEY_STORAGE_KEY) ?? process.env.NEXT_PUBLIC_API_KEY ?? null;
  }
}

export function combinePrompt(prompt: string, appendText: string) {
  const trimmedAppend = appendText.trim();
  if (!trimmedAppend) return prompt;
  const trimmedPrompt = prompt.trim();
  return trimmedPrompt ? `${trimmedPrompt} ${trimmedAppend}` : trimmedAppend;
}

function createJob(modelId: string, overrides: Partial<BatchJob> = {}): BatchJob {
  const model = modelById.get(modelId);
  const schemaDefaults = Object.fromEntries(
    (model?.inputSchema ?? [])
      .filter((param) => param.key !== "prompt" && param.default !== undefined)
      .map((param) => [param.key, param.default])
  );
  const smart = MODEL_SMART_DEFAULTS[modelId];
  return {
    id: uuidv4(),
    prompt: smart?.prompt ?? "",
    enabled: true,
    ...overrides,
    parameters: {
      ...schemaDefaults,
      ...(smart?.parameters ?? {}),
      ...(overrides.parameters ?? {}),
    },
  };
}

function buildPayload(job: BatchJob, appendText: string): Record<string, unknown> {
  return { ...job.parameters, prompt: combinePrompt(job.prompt, appendText) };
}

function validateJob(job: BatchJob, model: Model): string | null {
  if (!job.prompt.trim()) return "Prompt is required";
  for (const param of model.inputSchema) {
    if (!param.required) continue;
    if (param.type === "image" || param.type === "audio") {
      if (!job.parameters[param.key]) return `${formatLabel(param.key)} is required`;
    } else if (param.type === "array" && param.items?.type === "image") {
      const value = job.parameters[param.key];
      if (!Array.isArray(value) || value.length === 0) return `${formatLabel(param.key)} is required`;
    }
  }
  return null;
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

// Progressively shrinks the list on quota errors instead of throwing, since a single retry
// at a fixed size can still overflow (e.g. if entries embed large reference images).
function persistGenerations(generations: Generation[]) {
  const capped = generations.slice(0, MAX_STORED_GENERATIONS);
  for (const attempt of [capped, capped.slice(0, 20), capped.slice(0, 5), []]) {
    try {
      localStorage.setItem(GENERATIONS_STORAGE_KEY, JSON.stringify(attempt));
      return attempt;
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
    }
  }
  console.error("Failed to persist generation history: localStorage quota exceeded.");
  return capped;
}

// Reference images/audio can be several MB of embedded data URIs; the gallery only ever
// displays generation.output.images, so drop heavy embedded values from the stored parameters
// (regardless of field name — this works uniformly across every model's schema).
function sanitizeParametersForHistory(payload: Record<string, unknown>): Record<string, unknown> {
  const strip = (value: unknown): unknown => {
    if (typeof value === "string" && value.startsWith("data:")) return "[uploaded file]";
    if (Array.isArray(value)) return value.map(strip);
    return value;
  };
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, strip(value)]));
}

// Batch config and templates can contain several MB of embedded (data URI) images per job,
// which routinely blows past localStorage's ~5-10MB per-origin cap. IndexedDB has a much larger
// quota (tied to available disk space), so it's used here instead.
const IDB_NAME = "seedream-batch-store";
const IDB_VERSION = 1;
const IDB_STORE = "kv";

function openBatchDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) {
        request.result.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openBatchDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openBatchDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

interface StoredBatchConfig {
  modelId: string;
  jobs: BatchJob[];
  activeTemplateId: string | null;
  appendText: string;
  concurrency: number;
}

async function persistBatchConfig(
  modelId: string,
  jobs: BatchJob[],
  activeTemplateId: string | null,
  appendText: string,
  concurrency: number
) {
  try {
    await idbSet(BATCH_STORAGE_KEY, { modelId, jobs, activeTemplateId, appendText, concurrency });
  } catch (error) {
    console.error("Failed to persist batch config:", error);
  }
}

async function persistTemplates(templates: BatchTemplate[]) {
  await idbSet(TEMPLATES_STORAGE_KEY, templates);
}

export interface GenerateApiSuccess {
  success: true;
  image: Image;
  images: Image[];
  seed: number;
  requestId: string;
  timings: Record<string, unknown>;
  has_nsfw_concepts: boolean[];
}
export interface GenerateApiError {
  success: false;
  error: string;
}
export type GenerateApiResponse = GenerateApiSuccess | GenerateApiError;

// Calls a plain API route instead of a Server Action directly: Next.js serializes Server
// Actions invoked from a client component one at a time via its internal action queue, which
// silently defeats the batch's client-side concurrency (jobs would run one after another no
// matter how many are "launched" at once). A regular fetch() has no such queue.
export async function callGenerateApi(
  providerKind: ProviderKind,
  model: Model,
  payload: Record<string, unknown>,
  apiKey: string
): Promise<GenerateApiResponse> {
  try {
    const res = await fetch("/api/batch-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerKind, model, payload, apiKey }),
    });
    const data = await res.json();
    if (data && typeof data === "object" && "success" in data) {
      return data as GenerateApiResponse;
    }
    return { success: false, error: `Request failed with status ${res.status}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

async function downloadMedia(url: string, filename: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("Failed to download image:", error);
  }
}

function ImagesEditor({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const [urlDraft, setUrlDraft] = useState("");

  const addUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    onChange([...images, trimmed]);
    setUrlDraft("");
  };

  const addFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      onChange([...images, reader.result as string]);
    };
    reader.readAsDataURL(file);
  };

  const removeAt = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, index) => (
            <div
              key={index}
              className="relative h-14 w-14 overflow-hidden rounded border bg-muted/40"
            >
              <img src={img} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-[10px] text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          type="url"
          placeholder="Image URL"
          value={urlDraft}
          className="h-8 flex-1 min-w-[160px]"
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={addUrl}>
          Add URL
        </Button>
        <div className="relative">
          <Input
            type="file"
            accept="image/*"
            className="absolute inset-0 h-8 w-full cursor-pointer opacity-0"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addFile(file);
              e.currentTarget.value = "";
            }}
          />
          <Button type="button" size="sm" variant="outline" className="pointer-events-none h-8 gap-1">
            <Upload className="h-3 w-3" />
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

function SingleImageSlot({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const showUrl = value.startsWith("data:") ? "" : value;

  const handleUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {value && (
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border bg-muted/40">
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-[10px] text-white"
            >
              ×
            </button>
          </div>
        )}
        <Input
          type="url"
          placeholder="Image URL"
          value={showUrl}
          className="h-8 flex-1 min-w-[140px]"
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="relative">
          <Input
            type="file"
            accept="image/*"
            className="absolute inset-0 h-8 w-full cursor-pointer opacity-0"
            onChange={(e) => {
              handleUpload(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <Button type="button" size="sm" variant="outline" className="pointer-events-none h-8 gap-1">
            <Upload className="h-3 w-3" />
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

function SingleAudioSlot({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const showUrl = value.startsWith("data:") ? "" : value;

  const handleUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="url"
          placeholder="Audio URL"
          value={showUrl}
          className="h-8 flex-1 min-w-[140px]"
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="relative">
          <Input
            type="file"
            accept="audio/*"
            className="absolute inset-0 h-8 w-full cursor-pointer opacity-0"
            onChange={(e) => {
              handleUpload(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <Button type="button" size="sm" variant="outline" className="pointer-events-none h-8 gap-1">
            <Upload className="h-3 w-3" />
            Upload
          </Button>
        </div>
        {value && (
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => onChange("")}>
            Clear
          </Button>
        )}
      </div>
      {value && <audio controls src={value} className="w-full h-8" />}
    </div>
  );
}

function WaveSpeedSizePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (size: string) => void;
}) {
  const isFourK = WAVESPEED_ASPECT_RATIOS.some((ratio) => ratio.sizes["4K"] === value);
  const [resolution, setResolution] = useState<"2K" | "4K">(isFourK ? "4K" : "2K");
  const activeLabel = WAVESPEED_ASPECT_RATIOS.find((ratio) => ratio.sizes[resolution] === value)?.label;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Size (width*height)</Label>
        <div className="flex gap-1">
          {(["2K", "4K"] as const).map((res) => (
            <Button
              key={res}
              type="button"
              size="sm"
              variant={resolution === res ? "default" : "outline"}
              className="h-6 px-2 text-xs"
              onClick={() => setResolution(res)}
            >
              {res}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {WAVESPEED_ASPECT_RATIOS.map((ratio) => (
          <Button
            key={ratio.label}
            type="button"
            size="sm"
            variant={activeLabel === ratio.label ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onChange(ratio.sizes[resolution])}
          >
            {ratio.label}
          </Button>
        ))}
      </div>
      <Input value={value} className="h-8 w-40" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ZImageSizePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (size: string) => void;
}) {
  const activeLabel = Z_IMAGE_ASPECT_RATIOS.find((ratio) => ratio.size === value)?.label;

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Size (width*height)</Label>
      <div className="flex flex-wrap gap-1.5">
        {Z_IMAGE_ASPECT_RATIOS.map((ratio) => (
          <Button
            key={ratio.label}
            type="button"
            size="sm"
            variant={activeLabel === ratio.label ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onChange(ratio.size)}
          >
            {ratio.label}
          </Button>
        ))}
      </div>
      <Input value={value} className="h-8 w-40" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// Renders one input field generically from a model's own schema. This is what lets the batch
// tool support every model in the registry without hand-coding each one's fields — "prompt" and
// "loras" are skipped (prompt has its own dedicated textarea above; a per-job LoRA picker isn't
// worth the UI complexity here, and it's optional on every model that has it).
export function renderJobParameter(
  modelId: string,
  param: ModelParameter,
  value: unknown,
  onChange: (value: unknown) => void
) {
  if (isExcludedParamKey(param.key)) return null;

  // These models' "size" field is a free-form "W*H" string (not an enum), so an aspect-ratio
  // button picker is worth keeping instead of a plain text box.
  if (param.key === "size" && modelId === "bytedance/seedream-v4.5/edit") {
    return (
      <WaveSpeedSizePicker
        key={param.key}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
      />
    );
  }
  if (param.key === "size" && modelId === "wavespeed-ai/z-image/turbo-lora") {
    return (
      <ZImageSizePicker
        key={param.key}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
      />
    );
  }

  switch (param.type) {
    case "image":
      return (
        <SingleImageSlot
          key={param.key}
          label={`${formatLabel(param.key)}${param.required ? " (required)" : ""}`}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      );

    case "audio":
      return (
        <SingleAudioSlot
          key={param.key}
          label={`${formatLabel(param.key)}${param.required ? " (required)" : ""}`}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      );

    case "array":
      if (param.items?.type === "image") {
        return (
          <div key={param.key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {formatLabel(param.key)}
              {param.required ? " (required)" : ""}
            </Label>
            <ImagesEditor
              images={Array.isArray(value) ? (value as string[]) : []}
              onChange={onChange}
            />
          </div>
        );
      }
      // Generic fallback for any other array type (one value per line) — rare among current models.
      return (
        <div key={param.key} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{formatLabel(param.key)}</Label>
          <Textarea
            className="min-h-[60px] text-xs"
            value={Array.isArray(value) ? (value as unknown[]).join("\n") : ""}
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

    case "boolean":
      return (
        <div key={param.key} className="flex items-center justify-between py-1">
          <Label className="text-xs text-muted-foreground">{formatLabel(param.key)}</Label>
          <Switch checked={Boolean(value)} onCheckedChange={onChange} />
        </div>
      );

    case "enum": {
      const options = (param.options ?? []) as Array<string | number>;
      const selected = value === undefined || value === null ? "" : String(value);
      return (
        <div key={param.key} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{formatLabel(param.key)}</Label>
          <Select
            value={selected}
            onValueChange={(nextStr) => {
              const matched = options.find((option) => String(option) === nextStr);
              onChange(matched ?? nextStr);
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={String(option)} value={String(option)}>
                  {String(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    case "number":
      return (
        <div key={param.key} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{formatLabel(param.key)}</Label>
          <Input
            type="number"
            className="h-8"
            min={param.validation?.min}
            max={param.validation?.max}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </div>
      );

    case "string": {
      const isLongText = param.key.includes("prompt");
      return (
        <div key={param.key} className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            {formatLabel(param.key)}
            {param.required ? " (required)" : ""}
          </Label>
          {isLongText ? (
            <Textarea
              className="min-h-[60px] text-xs"
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <Input
              className="h-8"
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

function StatusBadge({ status }: { status: JobStatus }) {
  switch (status) {
    case "completed":
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="h-3 w-3" /> Completed
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-xs text-red-500">
          <XCircle className="h-3 w-3" /> Failed
        </span>
      );
    case "processing":
      return (
        <span className="flex items-center gap-1 text-xs text-blue-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Processing…
        </span>
      );
    case "queued":
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" /> Queued
        </span>
      );
    default:
      return null;
  }
}

// Per-job prompt template picker — mirrors the single-model generator's "Prompt template"
// control (same shared localStorage-backed template list via @/lib/prompt-templates, so a
// template saved here shows up there and vice versa) so users don't lose access to their saved
// prompts just because they're batching instead of generating one at a time.
function PromptTemplatePicker({
  customTemplates,
  currentPrompt,
  currentLoras,
  onApply,
  onSaveTemplate,
  onDeleteTemplate,
}: {
  customTemplates: CustomPromptTemplate[];
  currentPrompt: string;
  currentLoras?: { path: string; scale: number }[];
  onApply: (template: CustomPromptTemplate) => void;
  onSaveTemplate: (name: string, prompt: string, loras?: { path: string; scale: number }[]) => void;
  onDeleteTemplate: (id: string) => void;
}) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const allTemplates = [...PROMPT_TEMPLATES, ...customTemplates];

  const handleSave = () => {
    const name = nameDraft.trim();
    if (!name) {
      toast({ title: "Name required", description: "Give the template a name first.", variant: "destructive" });
      return;
    }
    if (!currentPrompt.trim()) {
      toast({
        title: "Prompt is empty",
        description: "Write a prompt before saving it as a template.",
        variant: "destructive",
      });
      return;
    }
    onSaveTemplate(name, currentPrompt, currentLoras?.filter((lora) => lora.path.trim()));
    setShowSaveInput(false);
    setNameDraft("");
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Prompt template</Label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Save current prompt as a template"
            onClick={() => {
              setNameDraft("");
              setShowSaveInput((v) => !v);
            }}
          >
            <Save className="h-3.5 w-3.5" />
          </button>
          {selectedId?.startsWith("custom-") && (
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-red-500 hover:bg-muted"
              title="Delete this template"
              onClick={() => {
                onDeleteTemplate(selectedId);
                setSelectedId(undefined);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <Select
        value={selectedId}
        onValueChange={(templateId) => {
          const template = allTemplates.find((t) => t.id === templateId);
          if (!template) return;
          setSelectedId(templateId);
          onApply(template);
        }}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Apply a template..." />
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
      {showSaveInput && (
        <div className="flex items-center gap-1">
          <Input
            placeholder="Template name"
            value={nameDraft}
            className="h-7 text-xs"
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
          <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={handleSave}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setShowSaveInput(false)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export function BatchSeedreamGenerator() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [jobs, setJobs] = useState<BatchJob[]>(() =>
    Array.from({ length: DEFAULT_BATCH_SIZE }, () => createJob(DEFAULT_MODEL_ID))
  );
  const [batchSizeInput, setBatchSizeInput] = useState(DEFAULT_BATCH_SIZE);
  const [results, setResults] = useState<Record<string, JobResult>>({});
  // Only guards the "Generate All" button/label. Individual job runs are tracked per-job via
  // `results[job.id].status`, so jobs can be generated/regenerated concurrently and independently
  // — regenerating #3 no longer blocks starting #4.
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [templates, setTemplates] = useState<BatchTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateCategoryDraft, setTemplateCategoryDraft] = useState("");
  const [appendText, setAppendText] = useState("");
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);
  const [customPromptTemplates, setCustomPromptTemplates] = useState<CustomPromptTemplate[]>([]);

  const model = modelById.get(selectedModelId) ?? allModels[0];

  // Load saved batch config + templates (from IndexedDB) + shared generation history on mount.
  useEffect(() => {
    (async () => {
      try {
        const batchConfig = await idbGet<StoredBatchConfig>(BATCH_STORAGE_KEY);
        if (batchConfig) {
          const savedModelId = modelById.has(batchConfig.modelId) ? batchConfig.modelId : DEFAULT_MODEL_ID;
          if (Array.isArray(batchConfig.jobs) && batchConfig.jobs.length > 0) {
            setSelectedModelId(savedModelId);
            setJobs(batchConfig.jobs.map((job) => createJob(savedModelId, job)));
            setBatchSizeInput(batchConfig.jobs.length);
          }
          if (typeof batchConfig.activeTemplateId === "string") {
            setActiveTemplateId(batchConfig.activeTemplateId);
          }
          if (typeof batchConfig.appendText === "string") {
            setAppendText(batchConfig.appendText);
          }
          if (typeof batchConfig.concurrency === "number" && batchConfig.concurrency > 0) {
            setConcurrency(Math.max(1, Math.min(MAX_CONCURRENCY, Math.round(batchConfig.concurrency))));
          }
        }
      } catch (error) {
        console.error("Failed to load saved batch config:", error);
      }

      try {
        const templatesData = await idbGet<BatchTemplate[]>(TEMPLATES_STORAGE_KEY);
        if (Array.isArray(templatesData)) setTemplates(templatesData);
      } catch (error) {
        console.error("Failed to load saved templates:", error);
      }

      const savedGenerations = localStorage.getItem(GENERATIONS_STORAGE_KEY);
      if (savedGenerations) {
        try {
          const parsed = JSON.parse(savedGenerations);
          if (Array.isArray(parsed)) setGenerations(parsed);
        } catch (error) {
          console.error("Failed to parse saved generations:", error);
        }
      }

      setCustomPromptTemplates(loadCustomPromptTemplates());

      setHydrated(true);
    })();
  }, []);

  // Persist batch config whenever it changes (after initial hydration).
  useEffect(() => {
    if (!hydrated) return;
    void persistBatchConfig(selectedModelId, jobs, activeTemplateId, appendText, concurrency);
  }, [selectedModelId, jobs, activeTemplateId, appendText, concurrency, hydrated]);

  // Reflect the batch's aggregate status in the tab title (🟡 any job still running,
  // 🔴 nothing running but at least one failed, 🟢 everything tracked completed) so it's
  // visible at a glance without the tab needing to be focused.
  useEffect(() => {
    const tracked = Object.values(results);
    let emoji = "";
    if (tracked.some((r) => r.status === "queued" || r.status === "processing")) {
      emoji = "🟡 ";
    } else if (tracked.length > 0) {
      emoji = tracked.some((r) => r.status === "failed") ? "🔴 " : "🟢 ";
    }
    document.title = `${emoji}Batch Automation`;
  }, [results]);

  // Warn before closing/reloading the tab while any job is still queued or in flight, so an
  // accidental close doesn't lose a running batch. Browsers show their own generic message,
  // not `returnValue`'s text.
  useEffect(() => {
    const anyJobBusy = Object.values(results).some(
      (r) => r.status === "queued" || r.status === "processing"
    );
    if (!anyJobBusy) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [results]);

  const updateJob = (id: string, patch: Partial<BatchJob>) => {
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  };

  const updateJobParameter = (id: string, key: string, value: unknown) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === id ? { ...job, parameters: { ...job.parameters, [key]: value } } : job
      )
    );
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
    setBatchSizeInput((prev) => Math.max(1, prev - 1));
  };

  const duplicateJob = (id: string) => {
    setJobs((prev) => {
      const index = prev.findIndex((job) => job.id === id);
      if (index === -1) return prev;
      const copy = { ...prev[index], id: uuidv4() };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setBatchSizeInput((prev) => prev + 1);
  };

  const addJob = () => {
    setJobs((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, createJob(selectedModelId, { parameters: { ...(last?.parameters ?? {}) } })];
    });
    setBatchSizeInput((prev) => prev + 1);
  };

  const applyBatchSize = (nextSize: number) => {
    const clamped = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.round(nextSize) || 1));
    setJobs((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped < prev.length) return prev.slice(0, clamped);
      const additions = Array.from({ length: clamped - prev.length }, () => createJob(selectedModelId));
      return [...prev, ...additions];
    });
    setBatchSizeInput(clamped);
  };

  const resetBatch = () => {
    const freshJobs = Array.from({ length: DEFAULT_BATCH_SIZE }, () => createJob(selectedModelId));
    setJobs(freshJobs);
    setBatchSizeInput(DEFAULT_BATCH_SIZE);
    setResults({});
    setActiveTemplateId(null);
    setAppendText("");
    toast({ title: "Batch reset", description: `Reset to ${DEFAULT_BATCH_SIZE} empty jobs.` });
  };

  const handleSaveAsTemplate = () => {
    const name = templateNameDraft.trim();
    if (!name) {
      toast({ title: "Name required", description: "Give the template a name first.", variant: "destructive" });
      return;
    }

    const category = templateCategoryDraft.trim();
    const newTemplate: BatchTemplate = {
      id: uuidv4(),
      name,
      modelId: selectedModelId,
      jobs: jobs.map((job) => ({ ...job, parameters: { ...job.parameters } })),
      appendText,
      ...(category ? { category } : {}),
      updatedAt: Date.now(),
    };

    const next = [newTemplate, ...templates];
    setTemplates(next);
    persistTemplates(next).catch((error) => {
      console.error("Failed to persist templates:", error);
      toast({
        title: "Failed to save template",
        description: error instanceof Error ? error.message : "Unknown storage error",
        variant: "destructive",
      });
    });
    setActiveTemplateId(newTemplate.id);
    setTemplateNameDraft("");
    setTemplateCategoryDraft("");
    setShowSaveTemplateInput(false);
    toast({ title: "Template saved", description: `Saved "${name}" with ${jobs.length} job(s).` });
  };

  const handleUpdateTemplate = () => {
    if (!activeTemplateId) return;
    const next = templates.map((template) =>
      template.id === activeTemplateId
        ? {
            ...template,
            modelId: selectedModelId,
            jobs: jobs.map((job) => ({ ...job, parameters: { ...job.parameters } })),
            appendText,
            updatedAt: Date.now(),
          }
        : template
    );
    setTemplates(next);
    persistTemplates(next).catch((error) => {
      console.error("Failed to persist templates:", error);
      toast({
        title: "Failed to update template",
        description: error instanceof Error ? error.message : "Unknown storage error",
        variant: "destructive",
      });
    });
    toast({ title: "Template updated" });
  };

  const handleLoadTemplate = (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const loadedModelId = modelById.has(template.modelId) ? template.modelId : DEFAULT_MODEL_ID;
    setSelectedModelId(loadedModelId);
    setJobs(
      template.jobs.map((job) => createJob(loadedModelId, { ...job, parameters: { ...job.parameters } }))
    );
    setBatchSizeInput(template.jobs.length);
    setActiveTemplateId(template.id);
    setAppendText(template.appendText ?? "");
    setResults({});
    toast({ title: "Template loaded", description: `Loaded "${template.name}".` });
  };

  // Lets the Templates manager page ("Open in Batch Automation") jump straight into loading a
  // specific saved template via ?template=<id>, instead of requiring the dropdown every time.
  useEffect(() => {
    if (!hydrated) return;
    const templateId = searchParams.get("template");
    if (templateId) handleLoadTemplate(templateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const handleDeleteTemplate = (id: string) => {
    const template = templates.find((t) => t.id === id);
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next);
    persistTemplates(next).catch((error) => {
      console.error("Failed to persist templates:", error);
      toast({
        title: "Failed to delete template",
        description: error instanceof Error ? error.message : "Unknown storage error",
        variant: "destructive",
      });
    });
    if (activeTemplateId === id) setActiveTemplateId(null);
    if (template) toast({ title: "Template deleted", description: `Deleted "${template.name}".` });
  };

  // Shared with the single-model generator's "Prompt template" picker (@/lib/prompt-templates) —
  // saving/deleting here updates the same list, not a batch-only copy of it.
  const handleSaveCustomPromptTemplate = (
    name: string,
    promptText: string,
    loras?: { path: string; scale: number }[]
  ) => {
    const newTemplate: CustomPromptTemplate = {
      id: `custom-${uuidv4()}`,
      label: name,
      prompt: promptText,
      ...(loras && loras.length > 0 ? { loras } : {}),
    };
    const next = [...customPromptTemplates, newTemplate];
    setCustomPromptTemplates(next);
    persistCustomPromptTemplates(next);
    toast({ title: "Template saved", description: `Saved "${name}".` });
  };

  const handleDeleteCustomPromptTemplate = (id: string) => {
    const template = customPromptTemplates.find((t) => t.id === id);
    const next = customPromptTemplates.filter((t) => t.id !== id);
    setCustomPromptTemplates(next);
    persistCustomPromptTemplates(next);
    if (template) toast({ title: "Template deleted", description: `Deleted "${template.label}".` });
  };

  const handleModelChange = (nextModelId: string) => {
    setSelectedModelId(nextModelId);
    // Manually picking a model starts a clean slate — old prompts, parameters, and append text
    // belonged to a different model's schema and don't carry over meaningfully. This also clears
    // the Templates dropdown's "active" selection, otherwise re-selecting that same template later
    // is a no-op (Radix Select only fires onValueChange when the value actually changes), leaving
    // the model stuck on whatever was manually picked. Loading a template (handleLoadTemplate)
    // still restores its own model, jobs, and append text exactly as saved.
    setActiveTemplateId(null);
    setAppendText("");
    setResults({});
    setJobs((prev) => prev.map(() => createJob(nextModelId)));
  };

  const saveGenerationRecord = (
    job: BatchJob,
    forModel: Model,
    images: Image[],
    response: { requestId?: string; seed?: number; timings?: Record<string, unknown>; has_nsfw_concepts?: boolean[] }
  ) => {
    const newGeneration: Generation = {
      id: uuidv4(),
      modelId: forModel.id,
      modelName: forModel.name,
      prompt: combinePrompt(job.prompt, appendText),
      parameters: sanitizeParametersForHistory(buildPayload(job, appendText)),
      output: {
        images,
        timings: response.timings || {},
        seed: response.seed ?? -1,
        has_nsfw_concepts: response.has_nsfw_concepts || [],
      },
      timestamp: Date.now(),
    };
    setGenerations((prev) => persistGenerations([newGeneration, ...prev]));
  };

  const runJob = async (job: BatchJob) => {
    const validationError = validateJob(job, model);
    if (validationError) {
      setResults((prev) => ({ ...prev, [job.id]: { status: "failed", error: validationError } }));
      return;
    }

    const providerKind = providerKindFor(model.id);
    const apiKey = apiKeyFor(providerKind);

    if (!apiKey && providerKind !== "replicate" && providerKind !== "byteplus") {
      setResults((prev) => ({
        ...prev,
        [job.id]: { status: "failed", error: `Missing ${providerLabel(providerKind)} API key` },
      }));
      return;
    }

    setResults((prev) => ({ ...prev, [job.id]: { status: "processing" } }));

    const payload = buildPayload(job, appendText);

    try {
      const response = await callGenerateApi(providerKind, model, payload, apiKey ?? "");

      if (response.success) {
        const outputImages = response.images ?? [response.image];
        setResults((prev) => ({
          ...prev,
          [job.id]: { status: "completed", images: outputImages, requestId: response.requestId },
        }));
        saveGenerationRecord(job, model, outputImages, response);
      } else {
        setResults((prev) => ({ ...prev, [job.id]: { status: "failed", error: response.error } }));
      }
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [job.id]: {
          status: "failed",
          error: error instanceof Error ? error.message : "Unexpected error",
        },
      }));
    }
  };

  const isJobBusy = (jobId: string) => {
    const status = results[jobId]?.status;
    return status === "queued" || status === "processing";
  };

  const handleGenerateOne = async (job: BatchJob) => {
    // Deliberately doesn't touch isBatchRunning or wait on any other job — this can run
    // concurrently alongside a "Generate All" pass or other individual regenerations.
    await runJob(job);
  };

  const handleGenerateAll = async () => {
    const jobsToRun = jobs.filter((job) => job.enabled);
    if (jobsToRun.length === 0) {
      toast({
        title: "Nothing to generate",
        description: "Enable at least one job first.",
        variant: "destructive",
      });
      return;
    }

    setIsBatchRunning(true);
    setResults((prev) => {
      const next = { ...prev };
      jobsToRun.forEach((job) => {
        next[job.id] = { status: "queued" };
      });
      return next;
    });

    // Bounded worker pool: at most `concurrency` jobs are ever in flight at once, instead of
    // just staggering start times (which doesn't actually cap how many run in parallel once
    // slower models — like video — pile up).
    const limit = Math.max(1, Math.min(MAX_CONCURRENCY, concurrency));
    const queue = [...jobsToRun];

    const worker = async (startDelay: number) => {
      if (startDelay > 0) await new Promise((resolve) => setTimeout(resolve, startDelay));
      let job: BatchJob | undefined;
      while ((job = queue.shift())) {
        await runJob(job);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(limit, jobsToRun.length) }, (_, i) =>
        worker(i * WORKER_START_STAGGER_MS)
      )
    );

    setIsBatchRunning(false);
    toast({ title: "Batch complete", description: `Processed ${jobsToRun.length} job(s).` });
  };

  const openJsonEditor = () => {
    setJsonDraft(
      JSON.stringify(
        jobs.map(({ id, ...rest }) => rest),
        null,
        2
      )
    );
    setShowJsonEditor(true);
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (!Array.isArray(parsed)) throw new Error("Payload must be a JSON array");

      const nextJobs: BatchJob[] = parsed.map((entry: Record<string, unknown>) =>
        createJob(selectedModelId, {
          prompt: typeof entry.prompt === "string" ? entry.prompt : "",
          parameters:
            entry.parameters && typeof entry.parameters === "object"
              ? (entry.parameters as Record<string, unknown>)
              : {},
          enabled: entry.enabled !== false,
        })
      );

      setJobs(nextJobs);
      setBatchSizeInput(nextJobs.length);
      setShowJsonEditor(false);
      toast({ title: "Payload applied", description: `Loaded ${nextJobs.length} job(s) from JSON.` });
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: error instanceof Error ? error.message : "Could not parse payload",
        variant: "destructive",
      });
    }
  };

  const completedCount = Object.values(results).filter((r) => r.status === "completed").length;
  const failedCount = Object.values(results).filter((r) => r.status === "failed").length;
  const totalTracked = Object.keys(results).length;
  const progressPercentage =
    totalTracked > 0 ? ((completedCount + failedCount) / totalTracked) * 100 : 0;
  const jobParameterFields = model.inputSchema.filter((param) => !isExcludedParamKey(param.key));

  return (
    <div className="flex flex-col space-y-6 w-full max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Batch Automation</CardTitle>
          <CardDescription>
            Load prompts and reference images in advance, then generate the whole batch in one click.
            Jobs and settings are saved locally so you can leave and come back. Every model in the
            catalog is available here — the whole batch always runs against the one model selected
            below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-sm">Model</Label>
              <Select value={selectedModelId} onValueChange={handleModelChange}>
                <SelectTrigger className="h-9 w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelNavGroups.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.modelIds.map((id) => {
                        const groupModel = modelById.get(id);
                        if (!groupModel) return null;
                        return (
                          <SelectItem key={id} value={id}>
                            {groupModel.name}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-sm">Batch size</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={MAX_BATCH_SIZE}
                  value={batchSizeInput}
                  className="h-9 w-24"
                  onChange={(e) => setBatchSizeInput(Number(e.target.value))}
                  onBlur={(e) => applyBatchSize(Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyBatchSize(Number(e.currentTarget.value));
                  }}
                />
                <span className="text-xs text-muted-foreground">/ {MAX_BATCH_SIZE} max</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm" title="Max simultaneous generations when running Generate All">
                Concurrency
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={MAX_CONCURRENCY}
                  value={concurrency}
                  className="h-9 w-20"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setConcurrency(
                      Number.isFinite(next) && next > 0
                        ? Math.min(MAX_CONCURRENCY, Math.round(next))
                        : 1
                    );
                  }}
                />
                <span className="text-xs text-muted-foreground">at a time</span>
              </div>
            </div>

            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addJob}>
              <Plus className="h-4 w-4" />
              Add job
            </Button>

            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={openJsonEditor}>
              Edit payload JSON
            </Button>

            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={resetBatch}>
              <RotateCcw className="h-4 w-4" />
              Reset batch
            </Button>

            <Button
              type="button"
              className="ml-auto gap-2"
              onClick={handleGenerateAll}
              disabled={isBatchRunning}
            >
              {isBatchRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                </>
              ) : (
                `Generate All (${jobs.filter((j) => j.enabled).length})`
              )}
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3 bg-muted/20">
            <div className="space-y-1">
              <Label className="text-sm">Templates</Label>
              <Select
                value={activeTemplateId ?? ""}
                onValueChange={(id) => handleLoadTemplate(id)}
              >
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue placeholder={templates.length ? "Load a template…" : "No saved templates"} />
                </SelectTrigger>
                <SelectContent>
                  {groupByCategory(templates).map(({ category, items }) => (
                    <SelectGroup key={category}>
                      <SelectLabel>{category}</SelectLabel>
                      {items.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} ({template.jobs.length})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                setTemplateNameDraft("");
                setShowSaveTemplateInput((v) => !v);
              }}
            >
              <Save className="h-4 w-4" />
              Save as template
            </Button>

            {activeTemplateId && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={handleUpdateTemplate}
                >
                  <FolderOpen className="h-4 w-4" />
                  Update template
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-red-500 hover:text-red-500"
                  onClick={() => handleDeleteTemplate(activeTemplateId)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete template
                </Button>
              </>
            )}

            {showSaveTemplateInput && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Template name"
                  value={templateNameDraft}
                  className="h-9 w-[200px]"
                  autoFocus
                  onChange={(e) => setTemplateNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAsTemplate();
                  }}
                />
                <Input
                  placeholder="Category (optional)"
                  value={templateCategoryDraft}
                  className="h-9 w-[180px]"
                  list="batch-template-categories"
                  onChange={(e) => setTemplateCategoryDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAsTemplate();
                  }}
                />
                <datalist id="batch-template-categories">
                  {Array.from(new Set(templates.map((t) => t.category).filter(Boolean))).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <Button type="button" size="sm" onClick={handleSaveAsTemplate}>
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowSaveTemplateInput(false)}
                >
                  Cancel
                </Button>
              </div>
            )}

            <div className="w-full space-y-1">
              <Label className="text-sm">Append to every prompt</Label>
              <Textarea
                placeholder="e.g. photorealistic, 8k, cinematic lighting"
                value={appendText}
                onChange={(e) => setAppendText(e.target.value)}
                className="min-h-[50px]"
              />
              <p className="text-xs text-muted-foreground">
                Added to the end of every job&apos;s prompt when generating. Each job&apos;s own prompt stays
                unchanged — this is saved and loaded together with the active template.
              </p>
            </div>
          </div>

          {showJsonEditor && (
            <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
              <Label className="text-sm">
                Batch payload (JSON array of {"{ prompt, parameters, enabled }"}). Available{" "}
                <code>parameters</code> keys depend on the selected model — see the job cards below.
              </Label>
              <Textarea
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                className="min-h-[220px] font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={applyJson}>
                  Apply JSON
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowJsonEditor(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {totalTracked > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Batch progress</span>
                <span className="text-muted-foreground">
                  {completedCount} completed, {failedCount} failed / {totalTracked} tracked
                </span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {jobs.map((job, index) => {
          const result = results[job.id];
          return (
            <Card key={job.id} className={job.enabled ? "" : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Job #{index + 1}</CardTitle>
                  <div className="flex items-center gap-2">
                    {result && <StatusBadge status={result.status} />}
                    <Switch
                      checked={job.enabled}
                      onCheckedChange={(checked) => updateJob(job.id, { enabled: checked })}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => duplicateJob(job.id)}
                      title="Duplicate job"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => removeJob(job.id)}
                      title="Remove job"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <PromptTemplatePicker
                  customTemplates={customPromptTemplates}
                  currentPrompt={job.prompt}
                  currentLoras={job.parameters.loras as { path: string; scale: number }[] | undefined}
                  onApply={(template) =>
                    updateJob(job.id, {
                      prompt: template.prompt,
                      parameters: template.loras
                        ? { ...job.parameters, loras: template.loras }
                        : job.parameters,
                    })
                  }
                  onSaveTemplate={handleSaveCustomPromptTemplate}
                  onDeleteTemplate={handleDeleteCustomPromptTemplate}
                />
                <Textarea
                  placeholder="Prompt for this job..."
                  value={job.prompt}
                  onChange={(e) => updateJob(job.id, { prompt: e.target.value })}
                  className="min-h-[70px]"
                />
                {appendText.trim() && (
                  <p className="text-xs text-muted-foreground italic">
                    Will send: &ldquo;{combinePrompt(job.prompt, appendText) || "(empty)"}&rdquo;
                  </p>
                )}

                {jobParameterFields.map((param) =>
                  renderJobParameter(model.id, param, job.parameters[param.key], (value) =>
                    updateJobParameter(job.id, param.key, value)
                  )
                )}

                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={isJobBusy(job.id)}
                    onClick={() => handleGenerateOne(job)}
                  >
                    {isJobBusy(job.id) && <Loader2 className="h-3 w-3 animate-spin" />}
                    {result ? "Regenerate" : "Generate"}
                  </Button>
                  {result?.status === "failed" && (
                    <span className="text-xs text-red-500 max-w-[220px] truncate" title={result.error}>
                      {result.error}
                    </span>
                  )}
                </div>

                {result?.status === "completed" && result.images && result.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {result.images.map((img, imgIndex) => {
                      const isVideo = img.content_type?.startsWith("video/");
                      return (
                        <div
                          key={imgIndex}
                          className="relative h-20 w-20 overflow-hidden rounded border"
                        >
                          {isVideo ? (
                            <video
                              src={img.url}
                              muted
                              loop
                              autoPlay
                              playsInline
                              className="h-full w-full cursor-pointer object-cover"
                              onClick={() => window.open(img.url, "_blank")}
                            />
                          ) : (
                            <img
                              src={img.url}
                              alt=""
                              className="h-full w-full cursor-pointer object-cover"
                              onClick={() => window.open(img.url, "_blank")}
                            />
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="absolute bottom-0 right-0 h-6 w-6 bg-black/40 text-white hover:bg-black/60"
                            onClick={() =>
                              downloadMedia(
                                img.url,
                                `job-${index + 1}-${imgIndex}.${isVideo ? "mp4" : "jpg"}`
                              )
                            }
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <GenerationsGallery generations={generations} onGenerationsChange={setGenerations} />
    </div>
  );
}
