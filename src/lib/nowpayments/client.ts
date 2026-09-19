// Server-only NOWPayments adapter. Public contract notes: docs/account-billing.md.
// No automatic retries, redirects, provider-error echoes, or credential/payload logging.
import { z } from "zod";
import { paymentSchema, planSchema, providerId, subscriptionSchema } from "./contracts";

const BASE_URL = "https://api.nowpayments.io/v1";
export class BillingProviderError extends Error {
  constructor() { super("Billing provider unavailable. The request may require reconciliation."); }
}
async function request(path: string, options: { body?: unknown; token?: string; authenticated?: boolean } = {}): Promise<unknown> {
  try {
    const key = process.env.NOWPAYMENTS_API_KEY;
    if (options.authenticated !== false && !key) throw new BillingProviderError();
    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.body === undefined ? "GET" : "POST", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        ...(options.authenticated !== false ? { "x-api-key": key! } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      throw new BillingProviderError();
    }
    const reader = response.body?.getReader();
    if (!reader) throw new BillingProviderError();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 128 * 1024) { await reader.cancel(); throw new BillingProviderError(); }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally { reader.releaseLock(); }
  } catch { throw new BillingProviderError(); }
}
async function parsed<S extends z.ZodTypeAny>(schema: S, work: () => Promise<unknown>): Promise<z.output<S>> {
  try { return schema.parse(await work()); }
  catch { throw new BillingProviderError(); }
}
async function bearerToken(): Promise<string> {
  const email = process.env.NOWPAYMENTS_ACCOUNT_EMAIL;
  const password = process.env.NOWPAYMENTS_ACCOUNT_PASSWORD;
  if (!email || !password) throw new BillingProviderError();
  const result = await parsed(z.object({ token: z.string().min(1).max(8192) }), () => request("/auth", {
    authenticated: false, body: { email, password },
  }));
  return result.token;
}
export async function getSubscriptionPlan(id: string) {
  const result = await parsed(z.object({ result: planSchema }), () => request(`/subscriptions/plans/${providerId.parse(id)}`));
  return result.result;
}
export async function getEmailSubscription(id: string) {
  const result = await parsed(z.object({ result: subscriptionSchema }), () => request(`/subscriptions/${providerId.parse(id)}`));
  return result.result;
}
export async function getPayment(id: string) {
  return parsed(paymentSchema, () => request(`/payment/${providerId.parse(id)}`));
}
export async function createEmailSubscription(params: { planId: string; email: string }) {
  const numericId = Number(providerId.parse(params.planId));
  if (!Number.isSafeInteger(numericId)) throw new BillingProviderError();
  const token = await bearerToken();
  const result = await parsed(z.object({ result: subscriptionSchema }), () => request("/subscriptions", {
    token, body: { subscription_plan_id: numericId, email: params.email },
  }));
  return result.result;
}
export const nowPayments = { getSubscriptionPlan, getEmailSubscription, getPayment, createEmailSubscription };
export type BillingGateway = typeof nowPayments;
