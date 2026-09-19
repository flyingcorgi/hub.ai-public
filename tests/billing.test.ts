import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { isolatedDatabase } from "./helpers/database";
import { migrate } from "../src/lib/db/migrate";
import { closeDb, getDb } from "../src/lib/db";
import { createAuth } from "../src/lib/auth/server";
import { principalForUser, AccessError } from "../src/lib/auth/authorization";
import { billingSummary, enroll, processPayment, reconcilePayment, reconcileSubscription } from "../src/lib/nowpayments/billing";
import type { BillingGateway } from "../src/lib/nowpayments/client";
import { POST as subscribe } from "../src/app/api/nowpayments/subscribe/route";
import { POST as ipn } from "../src/app/api/nowpayments/ipn/route";
import { POST as verify } from "../src/app/api/nowpayments/verify/route";
import { POST as setup } from "../src/app/api/nowpayments/setup-plan/route";
import { GET as summary } from "../src/app/api/account/billing/route";

const origin = "http://localhost:4000";
const callback = "https://billing.example.test/api/nowpayments/ipn";
const secret = "synthetic-billing-secret-at-least-thirty-two-characters";
const canary = "BILLING_PRIVATE_PAYLOAD_CANARY";
const payment = (id = "100") => ({ payment_id: id, payment_status: "finished", price_amount: "45", price_currency: "usd", pay_amount: "0.001", actually_paid: "0.001", pay_currency: "btc" });
// Independent canonicalizer, including nested objects/arrays and __proto__ as an ordinary key.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function request(path: string, body?: unknown, cookie = "", headers: Record<string, string> = {}) {
  return new Request(origin + path, { method: body === undefined ? "GET" : "POST", headers: { origin, "content-type": "application/json", cookie, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function json(response: Response, status = 200) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  const body = await response.json();
  assert.ok(!JSON.stringify(body).includes(canary));
  assert.ok(!JSON.stringify(body).includes(secret));
  return body;
}
const rejects = (work: Promise<unknown>, status: number) => assert.rejects(work, (e: unknown) => e instanceof AccessError && e.status === status);

test("account-owned billing, retry-safe enrollment and transactional settlement", { timeout: 90000 }, async t => {
  const fixture = await isolatedDatabase();
  const config = { DATABASE_URL: fixture.connectionString, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret,
    NOWPAYMENTS_ENROLLMENT_ENABLED: "true", NOWPAYMENTS_API_KEY: canary, NOWPAYMENTS_ACCOUNT_EMAIL: "merchant@example.test",
    NOWPAYMENTS_ACCOUNT_PASSWORD: canary, NOWPAYMENTS_PLAN_ID: "10", NOWPAYMENTS_IPN_SECRET: secret, NOWPAYMENTS_IPN_CALLBACK_URL: callback };
  const previous = Object.fromEntries(Object.keys(config).map(k => [k, process.env[k]]));
  Object.assign(process.env, config);
  const db = getDb(); db.options.max = 1;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external fetch"); });
  const logs: unknown[][] = [];
  for (const method of ["log", "warn", "error", "debug", "info"] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args); });
  try {
    await migrate(db);
    const auth = createAuth(db, { baseURL: origin, secret, allowSignUp: true, sendMail: async () => undefined });
    async function actor(email: string) {
      const signup = await auth.api.signUpEmail({ body: { email, name: "Billing test", password: "synthetic-billing-password" } });
      await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [signup.user.id]);
      const login = await auth.api.signInEmail({ body: { email, password: "synthetic-billing-password" }, asResponse: true });
      return { principal: (await principalForUser(db, signup.user.id))!, cookie: login.headers.getSetCookie().map(v => v.split(";")[0]).join("; ") };
    }
    const owner = await actor("owner@example.test"), other = await actor("other@example.test");
    let creates = 0;
    const remote = { id: "20", subscription_plan_id: "10", subscriber: { email: owner.principal.email }, status: "WAITING_PAY" as const };
    const gateway: BillingGateway = {
      getSubscriptionPlan: async () => ({ id: "10", amount: "45", currency: "usd", interval_day: 90, ipn_callback_url: callback }),
      createEmailSubscription: async ({ email, planId }) => { creates++; assert.equal(email, owner.principal.email); assert.equal(planId, "10"); return remote; },
      getEmailSubscription: async () => remote,
      getPayment: async id => ({ ...payment(id), payment_status: "finished" as const }),
    };
    let localId = "";
    await t.test("ownership, Origin, strict bodies, disabled enrollment and retired endpoints", async () => {
      await json(await subscribe(request("/api/nowpayments/subscribe", {})), 401);
      await json(await subscribe(request("/api/nowpayments/subscribe", {}, owner.cookie, { origin: "https://evil.example" })), 403);
      await json(await subscribe(request("/api/nowpayments/subscribe", { email: other.principal.email }, owner.cookie)), 400);
      await json(await summary(request("/api/account/billing")), 401);
      await rejects(enroll(db, null, gateway), 401);
      await rejects(enroll(db, { ...owner.principal, emailVerified: false }, gateway), 403);
      process.env.NOWPAYMENTS_ENROLLMENT_ENABLED = "false";
      await json(await subscribe(request("/api/nowpayments/subscribe", {}, owner.cookie)), 503);
      assert.equal((await billingSummary(db, owner.principal)).enrollmentEnabled, false);
      process.env.NOWPAYMENTS_ENROLLMENT_ENABLED = "true";
      await json(await verify(), 410); await json(await setup(), 410);
      assert.equal(creates, 0);
    });
    await t.test("concurrent/retried enrollment submits once and never grants access", async () => {
      await Promise.all([enroll(db, owner.principal, gateway), enroll(db, owner.principal, gateway)]);
      await enroll(db, owner.principal, gateway);
      assert.equal(creates, 1);
      const own = await json(await summary(request("/api/account/billing", undefined, owner.cookie)));
      assert.equal(own.subscriptions.length, 1); assert.equal(own.subscriptions[0].status, "active");
      assert.deepEqual(Object.keys(own.subscriptions[0]).sort(), ["createdAt", "id", "status"]);
      localId = own.subscriptions[0].id;
      assert.deepEqual((await json(await summary(request("/api/account/billing", undefined, other.cookie)))).subscriptions, []);
      assert.equal((await db.query("SELECT * FROM entitlements")).rowCount, 0);
    });
    await t.test("ambiguous enrollment persists intent; retries cannot duplicate; explicit reconciliation checks identity", async () => {
      let attempts = 0;
      const lost: BillingGateway = { ...gateway, createEmailSubscription: async () => { attempts++; throw new Error(canary); } };
      await rejects(enroll(db, other.principal, lost), 503);
      await enroll(db, other.principal, lost); assert.equal(attempts, 1);
      const row = (await billingSummary(db, other.principal)).subscriptions[0];
      assert.equal(row.status, "needs_reconciliation");
      await rejects(reconcileSubscription(db, row.id, "30", gateway), 409);
      const recovered = { ...gateway, getEmailSubscription: async () => ({ ...remote, id: "30", subscriber: { email: other.principal.email } }) };
      await reconcileSubscription(db, row.id, "30", recovered);
      assert.equal((await billingSummary(db, other.principal)).subscriptions[0].status, "active");
      assert.equal((await db.query("SELECT * FROM entitlements")).rowCount, 0);
    });
    const notification = (payload: unknown, sig = createHmac("sha512", secret).update(canonical(payload)).digest("hex")) => ipn(request("/api/nowpayments/ipn", payload, "", { "x-nowpayments-sig": sig }));
    await t.test("signed unknown final events retry, not guessed ownership; intermediate events never grant", async () => {
      await json(await notification(payment(), "0".repeat(128)), 401);
      await json(await notification(payment(), "aa"), 401);
      const pending = { payment_id: "100", payment_status: "waiting", nested: [{ z: 1, a: 2 }], ...JSON.parse('{"__proto__":{"z":2,"a":1}}') };
      assert.equal((await json(await notification(pending))).ignored, true);
      await json(await notification({ ...payment(), subscription_id: "20", order_id: localId, email: owner.principal.email }), 503);
      await json(await notification({ ...payment(), price_amount: canary }), 422);
      assert.equal((await db.query("SELECT * FROM payment_events")).rowCount, 0);
    });
    await t.test("operator-bound settlements grant exactly once, extend from paid-through, and validate money", async () => {
      for (const invalid of [{ price_amount: "44.99" }, { price_currency: "eur" }, { actually_paid: "0.0009" }, { pay_amount: "0" }]) {
        await rejects(reconcilePayment(db, localId, "100", { ...gateway, getPayment: async () => ({ ...payment(), payment_status: "finished" as const, ...invalid }) }), 422);
      }
      assert.equal((await db.query("SELECT * FROM billing_payment_bindings")).rowCount, 0);
      await reconcilePayment(db, localId, "100", gateway);
      const through = async () => (await principalForUser(db, owner.principal.userId))!.paidThroughAt!;
      const first = await through(); assert.ok(Math.abs(first - Date.now() - 90 * 86400000) < 10000);
      await Promise.all([processPayment(db, payment()), processPayment(db, payment()), reconcilePayment(db, localId, "100", gateway)]);
      assert.equal(await through(), first);
      await rejects(processPayment(db, { ...payment(), pay_currency: "eth" }), 409);
      await reconcilePayment(db, localId, "101", gateway);
      assert.equal(await through(), first + 90 * 86400000);
      await json(await notification(payment()));
      assert.equal((await db.query("SELECT * FROM payment_events")).rowCount, 2);
    });
    await t.test("payment identity cannot be rebound and SQL failure rolls back binding and entitlement", async () => {
      const otherId = (await billingSummary(db, other.principal)).subscriptions[0].id;
      const otherGateway = { ...gateway, getEmailSubscription: async () => ({ ...remote, id: "30", subscriber: { email: other.principal.email } }) };
      await rejects(reconcilePayment(db, otherId, "100", otherGateway), 409);
      const before = (await principalForUser(db, owner.principal.userId))!.paidThroughAt;
      await db.query("ALTER TABLE payment_events ADD CONSTRAINT test_failure CHECK (payment_id <> '102')");
      await assert.rejects(reconcilePayment(db, localId, "102", gateway));
      assert.equal((await principalForUser(db, owner.principal.userId))!.paidThroughAt, before);
      assert.equal((await db.query("SELECT * FROM billing_payment_bindings WHERE payment_id='102'")).rowCount, 0);
      await db.query("ALTER TABLE payment_events DROP CONSTRAINT test_failure");
    });
    await t.test("refund is terminal; late settlements and new payments cannot silently undo suspension", async () => {
      const refund = { ...payment(), payment_status: "refunded", actually_paid: "0" };
      await json(await notification(refund));
      await json(await notification(refund));
      const before = (await principalForUser(db, owner.principal.userId))!;
      assert.equal(before.revoked, true);
      assert.equal((await json(await notification(payment()))).duplicate, true);
      assert.equal((await principalForUser(db, owner.principal.userId))!.paidThroughAt, before.paidThroughAt);
      await reconcilePayment(db, localId, "103", gateway);
      assert.equal((await principalForUser(db, owner.principal.userId))!.revoked, true);
      await reconcilePayment(db, localId, "104", { ...gateway, getPayment: async id => ({ ...payment(id), payment_status: "refunded" as const, actually_paid: "0" }) });
      const refundedFirst = (await principalForUser(db, owner.principal.userId))!.paidThroughAt;
      await processPayment(db, payment("104"));
      assert.equal((await principalForUser(db, owner.principal.userId))!.paidThroughAt, refundedFirst);
    });
    assert.equal(fetchMock.mock.callCount(), 0); assert.deepEqual(logs, []);
  } finally {
    await closeDb(); await fixture.close();
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
