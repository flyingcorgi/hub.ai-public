import { requireAdmin } from "@/lib/auth/authorization";
import { accessFailure, readJson, requireSameOrigin } from "@/lib/auth/http";
import { privateJson } from "@/lib/privacy/responses";
import { wizardRequestSchema } from "@/lib/workflows/wizard";
import { acquireWizard, generateWizardDraft, wizardModel } from "@/lib/workflows/wizard-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request.headers);
    requireSameOrigin(request);
    const model = wizardModel();
    if (!model) return privateJson({ error: "Workflow Wizard beta is disabled or has no configured model." }, 503);
    const parsed = wizardRequestSchema.safeParse(await readJson(request, 16384));
    if (!parsed.success) return privateJson({ error: "Enter a 12–4,000 character description, a valid key and a step limit from 1 to 4." }, 400);
    const release = acquireWizard(user.userId);
    try {
      const draft = await generateWizardDraft(parsed.data, model, request.signal);
      // Recheck current DB privileges after the asynchronous provider call, before delivery.
      await requireAdmin(request.headers);
      return privateJson(draft);
    } finally { release(); }
  } catch (error) { return accessFailure(error); }
}
