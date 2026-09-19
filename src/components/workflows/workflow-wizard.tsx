'use client';

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VeniceKeySetup } from "@/components/venice-key-setup";
import { readBrowserApiKey } from "@/lib/browser-api-keys";
import { workflowDefinitionSchema } from "@/lib/workflows/validation";
import { wizardMediaModels } from "@/lib/workflows/wizard";
import type { WorkflowDefinition } from "@/lib/workflows/designer-types";

const failures: Record<number, string> = {
  400: "Check your description, Venice key and account balance. Nothing was saved or run.",
  401: "Sign in again as a verified administrator. Your description is still here.",
  403: "Administrator access is required. Nothing was saved or run.",
  413: "The description is too large. Shorten it and try again manually.",
  422: "The model returned an invalid or unsupported draft. Simplify your description and try again manually. Nothing was saved or run.",
  429: "Wizard is busy or cooling down. Wait 30 seconds before trying again manually.",
  503: "Wizard is disabled or unavailable. Check the server configuration.",
};
export function WorkflowWizard({ model, onUseDraft }: { model: string; onUseDraft: (draft: WorkflowDefinition) => void }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [maxSteps, setMaxSteps] = useState(3);
  const [allowVideo, setAllowVideo] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [draft, setDraft] = useState<WorkflowDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (busy || draft) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [busy, draft]);
  async function generate() {
    if (request.current || description.trim().length < 12) return;
    const apiKey = readBrowserApiKey();
    if (!apiKey) { setKeyOpen(true); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/workflow-wizard", {
        method: "POST", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), maxSteps, allowVideo, apiKey }),
      });
      if (!response.ok) throw new Error(failures[response.status] ?? "Wizard request failed. Venice may have charged for it. No automatic retries were made.");
      const body = await response.json();
      const parsed = workflowDefinitionSchema.safeParse(body.definition);
      if (!parsed.success || parsed.data.published || parsed.data.free) throw new Error("Invalid draft response. Nothing was saved or run.");
      if (mounted.current) setDraft(parsed.data);
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setError(cause instanceof Error && Object.values(failures).includes(cause.message) ? cause.message : "Wizard request failed. Your description and any previous preview are preserved. Venice may have charged; retry only when ready.");
    } finally { request.current = null; if (mounted.current) setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
    <DialogTrigger asChild><Button size="sm" variant="outline">Workflow Wizard · Beta</Button></DialogTrigger>
    <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Workflow Wizard</DialogTitle>
        <DialogDescription>Admin beta: describe an image-input workflow, review a draft, then choose whether to open it in the editor. Nothing is saved, published or run automatically.</DialogDescription>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">Authoring model: {model}. Generate draft makes one Venice text request billed to your key. Running the finished workflow costs extra. Description and key pass through this app to Venice; provider privacy varies by model. No catalog, albums or images are sent by this wizard.</p>
      <VeniceKeySetup open={keyOpen} onOpenChange={setKeyOpen} disabled={busy} />
      <div className="space-y-2">
        <Label htmlFor="wizard-description">Describe your workflow</Label>
        <Textarea id="wizard-description" rows={5} maxLength={4000} disabled={busy} value={description} onChange={event => setDescription(event.target.value)} placeholder="Restyle an uploaded portrait as a watercolor, offer warm or cool colors, then add a caption the user can type." />
        <p className="text-xs text-muted-foreground">12–4,000 characters. Supports image edits, editable captions, and an optional final image-to-video step. No text-only image generation, reference attachments or LLM substeps yet.</p>
      </div>
      <div className="flex flex-wrap gap-4 items-center">
        <label className="text-sm flex items-center gap-2">Maximum steps
          <select aria-label="Maximum steps" className="rounded border bg-background p-2" value={maxSteps} disabled={busy} onChange={event => setMaxSteps(Number(event.target.value))}>{[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={allowVideo} disabled={busy} onChange={event => setAllowVideo(event.target.checked)} />Allow a final video step (extra running cost)</label>
      </div>
      <Button disabled={busy || description.trim().length < 12} onClick={() => void generate()}>{busy ? "Creating draft…" : draft ? "Generate another draft" : "Generate draft"}</Button>
      {busy && <p role="status" className="text-sm">One request in progress, up to 45 seconds. No automatic retries.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {draft && <section aria-label="Workflow draft preview" className="border rounded-lg p-4 space-y-3 min-w-0 break-words">
        <h3 className="font-semibold">{draft.name}</h3><p className="text-sm">{draft.description}</p>
        <p className="text-sm">Starts with an uploaded image · {draft.steps.length} steps · up to {draft.steps.filter(step => step.type !== "text-overlay").length} paid media calls per run. Captions use free browser canvas.</p>
        {draft.optionGroups.map(group => <details key={group.id} className="text-sm"><summary>{group.name} ({group.inputType})</summary><ul className="pl-4">{group.choices.map(choice => <li key={choice.id}><strong>{choice.label}:</strong> {choice.prompt}</li>)}</ul></details>)}
        <ol className="space-y-2">{draft.steps.map((step, index) => {
          const media = wizardMediaModels.find(candidate => candidate.id === step.modelId);
          return <li key={step.id} className="text-sm"><details><summary>{index + 1}. {step.label} — {media?.name ?? "Browser caption"}</summary>
            <p className="text-xs text-muted-foreground">{media ? `Indicative running cost: ${media.costEstimate ?? "check Venice pricing"}. Not a quote.` : "No provider call."}</p>
            <p className="whitespace-pre-wrap">{step.promptTemplate}</p></details></li>;
        })}</ol>
        <p className="text-xs text-muted-foreground">Review prompts before using. This preview is only in memory. Opening it creates a new unsaved editor draft and keeps your other drafts. Save explicitly to retain it in the shared admin catalog; publishing is separate.</p>
        <Button disabled={busy} onClick={() => { onUseDraft(draft); setDraft(null); setOpen(false); }}>Open draft in editor</Button>
      </section>}
    </DialogContent>
  </Dialog>;
}
