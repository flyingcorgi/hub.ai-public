import assert from "node:assert/strict";
import { test } from "node:test";
import { BillingProviderError, createEmailSubscription, getEmailSubscription, getPayment, getSubscriptionPlan } from "../src/lib/nowpayments/client";
import { decimal, decimalUnits, providerId } from "../src/lib/nowpayments/contracts";

const canary = "BILLING_CREDENTIAL_CANARY";
test("NOWPayments adapter uses explicit envelopes/auth, bounded no-store responses and safe errors", async t => {
  const config = { NOWPAYMENTS_API_KEY: canary, NOWPAYMENTS_ACCOUNT_EMAIL: "merchant@example.test", NOWPAYMENTS_ACCOUNT_PASSWORD: canary };
  const previous = Object.fromEntries(Object.keys(config).map(k => [k, process.env[k]])); Object.assign(process.env, config);
  const logs: unknown[][] = [];
  for (const method of ["log", "warn", "error", "debug", "info"] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args); });
  const subscription = { id: 20, subscription_plan_id: 10, subscriber: { email: "USER@example.test" }, status: "WAITING_PAY" };
  const responses: (() => Response)[] = [];
  const requests: { url: string; options: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, options: RequestInit = {}) => {
    requests.push({ url: String(url), options });
    assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error"); assert.ok(options.signal);
    const next = responses.shift(); assert.ok(next, "Unexpected external request"); return next();
  });
  try {
    responses.push(() => Response.json({ token: canary }), () => Response.json({ result: subscription }));
    assert.equal((await createEmailSubscription({ email: "user@example.test", planId: "10" })).subscriber.email, "user@example.test");
    assert.equal(requests[0].url, "https://api.nowpayments.io/v1/auth");
    assert.equal(new Headers(requests[0].options.headers).get("x-api-key"), null);
    assert.deepEqual(JSON.parse(requests[0].options.body as string), { email: config.NOWPAYMENTS_ACCOUNT_EMAIL, password: canary });
    assert.equal(new Headers(requests[1].options.headers).get("authorization"), `Bearer ${canary}`);
    assert.equal(new Headers(requests[1].options.headers).get("x-api-key"), canary);
    assert.deepEqual(JSON.parse(requests[1].options.body as string), { email: "user@example.test", subscription_plan_id: 10 });
    responses.push(() => Response.json({ result: { id: 10, amount: 45, currency: "USD", interval_day: "90", ipn_callback_url: null } }));
    assert.equal((await getSubscriptionPlan("10")).amount, "45");
    responses.push(() => Response.json({ result: subscription })); assert.equal((await getEmailSubscription("20")).id, "20");
    const safe = (e: unknown) => e instanceof BillingProviderError && !e.message.includes(canary);
    for (const bad of [
      () => Response.json({ error: canary }, { status: 500 }),
      () => new Response(`{"${canary}`, { headers: { "content-type": "application/json" } }),
      () => new Response(canary, { headers: { "content-type": "text/html" } }),
      () => Response.json(subscription), // missing documented result envelope
      () => { throw new Error(canary); },
      () => new Response(" ".repeat(128 * 1024 + 1), { headers: { "content-type": "application/json" } }),
    ]) {
      responses.push(bad); const before = requests.length;
      await assert.rejects(getEmailSubscription("20"), safe); assert.equal(requests.length, before + 1, "Must not retry");
    }
    responses.push(() => Response.json({ payment_id: Number.MAX_SAFE_INTEGER + 1 }));
    await assert.rejects(getPayment("100"), safe);
    const before = requests.length;
    await assert.rejects(createEmailSubscription({ planId: "99999999999999999999", email: "user@example.test" }), safe);
    assert.equal(requests.length, before);
    assert.deepEqual(logs, []);
  } finally {
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("provider IDs and monetary comparisons never round unsafe identifiers or crypto values", () => {
  assert.equal(providerId.parse("99999999999999999999"), "99999999999999999999");
  assert.equal(providerId.safeParse(Number.MAX_SAFE_INTEGER + 1).success, false);
  assert.equal(decimalUnits("1e-8"), decimalUnits("0.00000001"));
  assert.equal(decimalUnits("45.00"), decimalUnits("45"));
  assert.ok(decimalUnits("0.001000000000000001") > decimalUnits("0.001"));
  for (const value of ["NaN", "Infinity", "-1", "1e-99", "0.0000000000000000001", "45 usd"]) assert.equal(decimal.safeParse(value).success, false);
});
