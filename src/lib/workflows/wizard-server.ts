import { AccessError } from "@/lib/auth/authorization";
import { compileWizardDraft, WizardDraftError, wizardSystemPrompt, type WizardRequest } from "./wizard";

export function wizardModel(): string | undefined {
  const model = process.env.WORKFLOW_WIZARD_MODEL?.trim();
  return process.env.WORKFLOW_WIZARD_ENABLED === "true" && model && /^[a-zA-Z0-9_./:-]{1,160}$/.test(model) ? model : undefined;
}

// Interim, process-local admin-beta guard: not a distributed public/subscriber rate limiter.
// Contains only account IDs, expiry times and active flags; never prompts, keys or responses.
export function createWizardLimiter(now = Date.now) {
  const entries = new Map<string, { until: number; active: boolean }>();
  return (userId: string) => {
    const time = now();
    for (const [id, entry] of entries) if (!entry.active && entry.until <= time) entries.delete(id);
    if (entries.get(userId)?.active || (entries.get(userId)?.until ?? 0) > time || [...entries.values()].filter(entry => entry.active).length >= 2)
      throw new AccessError(429, "Wizard is busy or cooling down. Wait 30 seconds before another request; nothing was retried.");
    const entry = { until: time + 30000, active: true }; entries.set(userId, entry);
    return () => { entry.active = false; };
  };
}
export const acquireWizard = createWizardLimiter();

async function readProviderJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new WizardDraftError();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new WizardDraftError(); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new WizardDraftError(); }
  } finally { reader.releaseLock(); }
}

export async function generateWizardDraft(input: WizardRequest, model: string, signal: AbortSignal) {
  try {
    const response = await fetch("https://api.venice.ai/api/v1/chat/completions", {
      method: "POST", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model, messages: [
          { role: "system", content: wizardSystemPrompt(input) },
          { role: "user", content: input.description },
        ],
        max_tokens: 3500, temperature: 0.2, stream: false,
        response_format: { type: "json_object" },
        venice_parameters: { include_venice_system_prompt: false },
      }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403) throw new AccessError(400, "Venice rejected the key or model access. Check your key and account; nothing was saved.");
      if (response.status === 402) throw new AccessError(400, "Venice requires more credit. Check your Venice balance before trying again.");
      throw new AccessError(502, "Venice could not create a draft. Check model availability before retrying manually.");
    }
    const value = await readProviderJson(response);
    // Inspect a narrow response shape without ever exposing provider/parser error content.
    const choices = (value as { choices?: { finish_reason?: string; message?: { content?: unknown; tool_calls?: unknown } }[] } | null)?.choices;
    const choice = Array.isArray(choices) ? choices[0] : undefined;
    if (choice?.finish_reason !== "stop" || choice.message?.tool_calls || typeof choice.message?.content !== "string") throw new WizardDraftError();
    let blueprint: unknown;
    try { blueprint = JSON.parse(choice.message.content); } catch { throw new WizardDraftError(); }
    const definition = compileWizardDraft(blueprint, input);
    return { definition, authoringModel: model, paidSteps: definition.steps.filter(step => step.type !== "text-overlay").length };
  } catch (error) {
    if (error instanceof WizardDraftError) throw new AccessError(422, error.message);
    if (error instanceof AccessError) throw error;
    throw new AccessError(502, "Wizard request failed or timed out. No draft was saved. Venice may have charged for the request; retries are manual.");
  }
}
