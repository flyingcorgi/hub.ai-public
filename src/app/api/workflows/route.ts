import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { accessFailure } from "@/lib/auth/http";
import { privateJson } from "@/lib/privacy/responses";
import { listWorkflowSummaries } from "@/lib/workflows/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = new URL(request.url).searchParams.get("scope") === "admin";
    const user = admin ? await requireAdmin(request.headers) : null;
    return privateJson(await listWorkflowSummaries(getDb(), user, admin));
  } catch (error) { return accessFailure(error); }
}

// Deliberately retire the unauthenticated whole-catalog replacement contract.
export async function POST() {
  const response = privateJson({ error: "Use revision-checked per-workflow PUT or DELETE." }, 405);
  response.headers.set("Allow", "GET");
  return response;
}
