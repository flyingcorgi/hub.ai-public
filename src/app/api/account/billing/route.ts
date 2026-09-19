import { requireUser } from "@/lib/auth/authorization";
import { accessFailure } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { privateJson } from "@/lib/privacy/responses";
import { billingSummary } from "@/lib/nowpayments/billing";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return privateJson(await billingSummary(getDb(), await requireUser(request.headers))); }
  catch (error) { return accessFailure(error); }
}
