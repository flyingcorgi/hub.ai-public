import { verifyIpnSignature } from "@/lib/nowpayments/ipn";
import { processPayment } from "@/lib/nowpayments/billing";
import { paymentStatusSchema } from "@/lib/nowpayments/contracts";
import { AccessError } from "@/lib/auth/authorization";
import { accessFailure, readJson } from "@/lib/auth/http";
import { privateJson } from "@/lib/privacy/responses";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    if (!process.env.NOWPAYMENTS_IPN_SECRET) throw new AccessError(503, "Billing notifications are not configured.");
    const payload = await readJson(request, 65536);
    if (!verifyIpnSignature(payload, request.headers.get("x-nowpayments-sig"))) throw new AccessError(401, "Invalid notification signature.");
    const status = paymentStatusSchema.safeParse(payload);
    if (!status.success) throw new AccessError(422, "Unsupported notification. Operator review is required.");
    if (!["finished", "refunded"].includes(status.data.payment_status)) return privateJson({ ok: true, ignored: true });
    // No guessed subscription_id/plan_id/order_id aliases. Unknown final payments fail retryably;
    // only explicit provider-confirmed bindings may select a user. No raw callbacks are retained.
    return privateJson({ ok: true, ...await processPayment(getDb(), payload) });
  } catch (error) { return accessFailure(error); }
}
