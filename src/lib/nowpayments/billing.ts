import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { AccessError } from "@/lib/auth/authorization";
import type { Principal } from "@/lib/auth/policy";
import { inTransaction } from "@/lib/db";
import { nowPayments, type BillingGateway } from "./client";
import { decimalUnits, paymentSchema, providerId, type ProviderPayment, type ProviderSubscription } from "./contracts";
import { enrollmentEnabled, PLAN_AMOUNT_USD, PLAN_CURRENCY, PLAN_INTERVAL_DAYS } from "./config";

type SubscriptionRow = {
  id: string; user_id: string; plan_id: string; provider_id: string | null; billing_email: string;
  status: "creating" | "active" | "needs_reconciliation"; amount_usd: string; interval_days: number;
};
function requireVerified(user: Principal | null): asserts user is Principal {
  if (!user) throw new AccessError(401, "Sign in to continue.");
  if (!user.emailVerified) throw new AccessError(403, "Verify your email to continue.");
}
function matchesSubscription(row: SubscriptionRow, provider: ProviderSubscription) {
  return provider.subscription_plan_id === row.plan_id && provider.subscriber.email === row.billing_email &&
    (row.provider_id === null || row.provider_id === provider.id);
}
function validatePayment(row: SubscriptionRow, payment: ProviderPayment) {
  if (payment.price_currency !== PLAN_CURRENCY || decimalUnits(payment.price_amount) !== decimalUnits(row.amount_usd) ||
      decimalUnits(payment.pay_amount) <= BigInt(0) ||
      (payment.payment_status === "finished" && decimalUnits(payment.actually_paid) < decimalUnits(payment.pay_amount))) {
    throw new AccessError(422, "Payment terms do not match the subscription. Operator review is required.");
  }
}

export async function billingSummary(db: Pool, user: Principal | null) {
  requireVerified(user);
  const result = await db.query(`SELECT id,
    CASE WHEN status='creating' AND created_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
      THEN 'needs_reconciliation' ELSE status END AS status,
    created_at AS "createdAt"
    FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [user.userId]);
  return { enrollmentEnabled: enrollmentEnabled(),
    plan: { amountUsd: PLAN_AMOUNT_USD, currency: PLAN_CURRENCY, intervalDays: PLAN_INTERVAL_DAYS },
    subscriptions: result.rows };
}

export async function enroll(db: Pool, user: Principal | null, gateway: BillingGateway = nowPayments) {
  requireVerified(user);
  if (!enrollmentEnabled()) throw new AccessError(503, "New billing enrollments are not enabled yet.");
  const configuredPlan = providerId.safeParse(process.env.NOWPAYMENTS_PLAN_ID);
  const callback = process.env.NOWPAYMENTS_IPN_CALLBACK_URL;
  if (!configuredPlan.success || !callback) throw new AccessError(503, "Billing is not configured.");
  const url = new URL(callback);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || url.pathname !== "/api/nowpayments/ipn") {
    throw new AccessError(503, "Billing callback is not configured.");
  }
  // Persist intent BEFORE any provider mutation. Unique owner/plan means retries/concurrent
  // requests can never submit a second enrollment after an ambiguous response or process crash.
  const inserted = await db.query<SubscriptionRow>(`INSERT INTO subscriptions
    (id,user_id,plan_id,status,amount_usd,interval_days,billing_email)
    VALUES ($1,$2,$3,'creating',$4,$5,$6) ON CONFLICT (user_id,plan_id) DO NOTHING RETURNING *`,
    [randomUUID(), user.userId, configuredPlan.data, PLAN_AMOUNT_USD, PLAN_INTERVAL_DAYS, user.email.toLowerCase()]);
  if (!inserted.rowCount) return billingSummary(db, user);
  const row = inserted.rows[0];
  try {
    const plan = await gateway.getSubscriptionPlan(row.plan_id);
    if (plan.id !== row.plan_id || plan.interval_day !== row.interval_days || plan.currency !== PLAN_CURRENCY ||
        decimalUnits(plan.amount) !== decimalUnits(row.amount_usd) || plan.ipn_callback_url !== callback) {
      throw new AccessError(422, "Provider plan needs operator review.");
    }
    const provider = await gateway.createEmailSubscription({ planId: row.plan_id, email: row.billing_email });
    if (!matchesSubscription(row, provider)) throw new AccessError(422, "Provider subscription needs operator review.");
    await db.query(`UPDATE subscriptions SET provider_id=$2,status='active',last_error_code=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND provider_id IS NULL`, [row.id, provider.id]);
  } catch {
    // No retry/reset here. A callback may already exist even when the HTTP response was lost.
    await db.query(`UPDATE subscriptions SET status='needs_reconciliation',last_error_code='operator_review',updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND provider_id IS NULL`, [row.id]);
    throw new AccessError(503, "Enrollment needs operator review. Do not start another subscription.");
  }
  return billingSummary(db, user);
}

// Local/operator reconciliation only, never a customer API accepting someone else's IDs.
export async function reconcileSubscription(db: Pool, localId: string, remoteId: string, gateway: BillingGateway = nowPayments) {
  const row = (await db.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id=$1", [localId])).rows[0];
  if (!row) throw new AccessError(404, "Subscription not found.");
  const provider = await gateway.getEmailSubscription(providerId.parse(remoteId));
  if (provider.id !== remoteId || !matchesSubscription(row, provider)) throw new AccessError(409, "Subscription identity does not match.");
  const result = await db.query(`UPDATE subscriptions SET provider_id=$2,status='active',last_error_code=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1 AND (provider_id IS NULL OR provider_id=$2) RETURNING id`, [localId, provider.id]);
  if (!result.rowCount) throw new AccessError(409, "Subscription changed during reconciliation.");
}

async function applyPayment(client: PoolClient, payment: ProviderPayment, row: SubscriptionRow) {
  validatePayment(row, payment);
  // Every payment for this owner takes the same row lock, including different subscriptions.
  // Two settlements therefore cannot overwrite each other's paid-through extension.
  await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [row.user_id]);
  const prior = (await client.query("SELECT * FROM payment_events WHERE payment_id=$1 FOR UPDATE", [payment.payment_id])).rows[0];
  if (prior && (prior.subscription_id !== row.id || decimalUnits(prior.amount_usd) !== decimalUnits(payment.price_amount) ||
      (prior.pay_currency !== null && prior.pay_currency !== payment.pay_currency) ||
      (prior.quoted_amount !== null && decimalUnits(prior.quoted_amount) !== decimalUnits(payment.pay_amount)))) {
    throw new AccessError(409, "Payment identity conflict.");
  }
  // Refund is terminal. A late finished notification must not regrant or clear revocation.
  if (prior?.status === "refunded" || (prior && payment.payment_status === "finished")) return { duplicate: true };
  if (payment.payment_status === "refunded") {
    await client.query(`INSERT INTO payment_events (payment_id,subscription_id,amount_usd,currency,status,pay_currency,quoted_amount,actually_paid,reversed_at)
      VALUES ($1,$2,$3,'usd','refunded',$4,$5,$6,CURRENT_TIMESTAMP)
      ON CONFLICT (payment_id) DO UPDATE SET status='refunded',reversed_at=CURRENT_TIMESTAMP`,
      [payment.payment_id, row.id, payment.price_amount, payment.pay_currency, payment.pay_amount, payment.actually_paid]);
    // Conservative reversal policy: suspend all paid access until explicit operator review.
    // Do not subtract time blindly (other payments or already-consumed access may exist).
    await client.query(`INSERT INTO entitlements (user_id,paid_through_at,revoked_at,revocation_reason)
      VALUES ($1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'refund_review')
      ON CONFLICT (user_id) DO UPDATE SET revoked_at=COALESCE(entitlements.revoked_at,CURRENT_TIMESTAMP),
      revocation_reason=COALESCE(entitlements.revocation_reason,'refund_review'),updated_at=CURRENT_TIMESTAMP`, [row.user_id]);
    return { refunded: true };
  }
  const entitlement = await client.query(`INSERT INTO entitlements (user_id,paid_through_at)
    VALUES ($1,CURRENT_TIMESTAMP + $2::integer * INTERVAL '24 hours')
    ON CONFLICT (user_id) DO UPDATE SET paid_through_at=GREATEST(entitlements.paid_through_at,CURRENT_TIMESTAMP) + $2::integer * INTERVAL '24 hours',
    updated_at=CURRENT_TIMESTAMP RETURNING paid_through_at`, [row.user_id, row.interval_days]);
  await client.query(`INSERT INTO payment_events (payment_id,subscription_id,amount_usd,currency,status,pay_currency,quoted_amount,actually_paid,granted_through_at)
    VALUES ($1,$2,$3,'usd','settled',$4,$5,$6,$7)`, [payment.payment_id,row.id,payment.price_amount,payment.pay_currency,
    payment.pay_amount,payment.actually_paid,entitlement.rows[0].paid_through_at]);
  return { settled: true };
}

export async function processPayment(db: Pool, input: unknown) {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) throw new AccessError(422, "Unsupported payment payload. Operator review is required.");
  const payment = parsed.data;
  if (!["finished", "refunded"].includes(payment.payment_status)) return { ignored: true };
  return inTransaction(db, async (client) => {
    const row = (await client.query<SubscriptionRow>(`SELECT s.* FROM subscriptions s
      JOIN billing_payment_bindings b ON b.subscription_id=s.id WHERE b.payment_id=$1`, [payment.payment_id])).rows[0];
    if (!row || !row.provider_id) throw new AccessError(503, "Payment association needs reconciliation. Retry later.");
    return applyPayment(client, payment, row);
  });
}

export async function reconcilePayment(db: Pool, localId: string, paymentId: string, gateway: BillingGateway = nowPayments) {
  const row = (await db.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id=$1", [localId])).rows[0];
  if (!row?.provider_id) throw new AccessError(409, "Reconcile the subscription first.");
  const provider = await gateway.getEmailSubscription(row.provider_id);
  if (!matchesSubscription(row, provider)) throw new AccessError(409, "Subscription identity does not match.");
  const payment = paymentSchema.parse(await gateway.getPayment(providerId.parse(paymentId)));
  if (payment.payment_id !== paymentId || !["finished", "refunded"].includes(payment.payment_status)) {
    throw new AccessError(409, "Payment is not final or does not match.");
  }
  validatePayment(row, payment);
  // The operator must independently confirm the payment belongs to this subscription. Matching
  // price/email is NOT proof; the public provider contract currently omits this association.
  return inTransaction(db, async (client) => {
    await client.query(`INSERT INTO billing_payment_bindings (payment_id,subscription_id) VALUES ($1,$2)
      ON CONFLICT (payment_id) DO NOTHING`, [payment.payment_id, row.id]);
    const binding = (await client.query("SELECT subscription_id FROM billing_payment_bindings WHERE payment_id=$1", [payment.payment_id])).rows[0];
    if (binding.subscription_id !== row.id) throw new AccessError(409, "Payment is already bound to a different subscription.");
    return applyPayment(client, payment, row);
  });
}
