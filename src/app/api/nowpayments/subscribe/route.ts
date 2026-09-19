import { requireUser, AccessError } from "@/lib/auth/authorization";
import { accessFailure, readJson, requireSameOrigin } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { privateJson } from "@/lib/privacy/responses";
import { enroll } from "@/lib/nowpayments/billing";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const user = await requireUser(request.headers);
    requireSameOrigin(request);
    // Ownership/email/plan/amount can only come from trusted server identity/configuration.
    if (!z.object({}).strict().safeParse(await readJson(request, 1024)).success) throw new AccessError(400, "No subscription parameters are accepted.");
    return privateJson(await enroll(getDb(), user));
  } catch (error) { return accessFailure(error); }
}
