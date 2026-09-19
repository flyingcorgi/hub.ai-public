import { z } from "zod";
import { generateWizardDraft } from "../../src/lib/workflows/wizard-server";
import { wizardRequestSchema } from "../../src/lib/workflows/wizard";

const modelSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_./:-]{1,160}$/), type: z.literal("text"),
  model_spec: z.object({
    offline: z.boolean(), privacy: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    capabilities: z.object({ supportsResponseSchema: z.boolean() }),
    pricing: z.object({
      input: z.object({ usd: z.number().finite().nonnegative() }),
      output: z.object({ usd: z.number().finite().nonnegative() }),
    }),
  }),
});

export function wizardCandidates(value: unknown) {
  const catalog = z.object({ data: z.array(z.unknown()).max(2000) }).parse(value);
  return catalog.data.flatMap(entry => {
    const parsed = modelSchema.safeParse(entry);
    if (!parsed.success) return [];
    const { id, model_spec: spec } = parsed.data;
    if (spec.offline || !spec.capabilities.supportsResponseSchema) return [];
    return [{ id, privacy: spec.privacy, inputUsd: spec.pricing.input.usd, outputUsd: spec.pricing.output.usd }];
  }).sort((a, b) => a.outputUsd - b.outputUsd || a.inputUsd - b.inputUsd || a.id.localeCompare(b.id));
}

async function publicCatalog() {
  const response = await fetch("https://api.venice.ai/api/v1/models?type=text", {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error("Catalog unavailable"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Catalog unavailable");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); throw new Error("Catalog too large"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { reader.releaseLock(); }
}

// Operator-only qualification: no application feature-flag changes, DB writes or media calls.
export async function qualifyWizard(args: string[], env: Record<string, string | undefined>, log: (text: string) => void) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--live"))
    throw new Error("Usage: npm run wizard:qualify -- [--live]");
  const live = args[0] === "--live";
  const model = env.WORKFLOW_WIZARD_MODEL?.trim();
  if (model && !/^[a-zA-Z0-9_./:-]{1,160}$/.test(model)) throw new Error("Invalid model configuration");
  const input = live ? wizardRequestSchema.parse({
    description: "Create a single image-edit step that restyles an uploaded landscape as a watercolor painting. No options, captions, or video.",
    maxSteps: 1, allowVideo: false, apiKey: env.VENICE_API_KEY,
  }) : undefined;
  if (live && !model) throw new Error("Select WORKFLOW_WIZARD_MODEL first");
  const candidates = wizardCandidates(await publicCatalog());
  log("Public catalog only; rates are raw catalog USD input/output values, not a quote. Schema capability is not proof of json_object compatibility.");
  for (const candidate of candidates) log(JSON.stringify(candidate));
  const selected = candidates.find(candidate => candidate.id === model);
  if (model && !selected) throw new Error("Selected model is unavailable or lacks required schema/pricing metadata");
  if (!live) { log("No inference made. Review privacy/pricing; select a model and pass --live to authorize ONE paid text request."); return; }
  log(`ONE paid text request to ${selected!.id} (${selected!.privacy}); no retries, media generation or saving.`);
  const result = await generateWizardDraft(input!, selected!.id, new AbortController().signal);
  log(`PASS: structurally valid unpublished draft; ${result.definition.steps.length} step(s). No draft content saved or printed. Visual quality and actual billed cost remain unverified.`);
}
