import { getDb } from "@/lib/db";
import { getPrincipal, requireAdmin } from "@/lib/auth/authorization";
import { accessFailure, readJson, requireSameOrigin } from "@/lib/auth/http";
import { privateJson } from "@/lib/privacy/responses";
import { deleteWorkflow, readWorkflow, writeWorkflow } from "@/lib/workflows/catalog";
import { MAX_WORKFLOW_BYTES } from "@/lib/workflows/validation";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: Context) {
  try {
    const user = await getPrincipal(request.headers);
    return privateJson(await readWorkflow(getDb(), user, (await context.params).id));
  } catch (error) { return accessFailure(error); }
}

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireAdmin(request.headers);
    requireSameOrigin(request);
    const input = await readJson(request, MAX_WORKFLOW_BYTES);
    return privateJson(await writeWorkflow(getDb(), user, (await context.params).id, input));
  } catch (error) { return accessFailure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireAdmin(request.headers);
    requireSameOrigin(request);
    await deleteWorkflow(getDb(), user, (await context.params).id, await readJson(request));
    return privateJson({ ok: true });
  } catch (error) { return accessFailure(error); }
}
