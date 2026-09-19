import assert from "node:assert/strict";
import { test } from "node:test";
import { qualifyWizard, wizardCandidates } from "../scripts/lib/qualify-wizard";
import { wizardBlueprint, wizardProviderResponse } from "./helpers/wizard";

const model = (id = "test-json", output = 0.1) => ({
  id, type: "text", model_spec: { offline: false, privacy: "private",
    capabilities: { supportsResponseSchema: true },
    pricing: { input: { usd: 0.05 }, output: { usd: output } },
  },
});

test("qualification excludes offline, unknown-price and non-schema models and sorts rates", () => {
  const offline = model(); offline.model_spec.offline = true;
  const unsupported = model(); unsupported.model_spec.capabilities.supportsResponseSchema = false;
  assert.deepEqual(wizardCandidates({ data: [model("expensive", 2), offline, unsupported, {}, model(), { ...model(), type: "image" }] }).map(m => m.id), ["test-json", "expensive"]);
  assert.throws(() => wizardCandidates({ error: "provider detail" }));
});

test("preflight is keyless, uncached and never infers even with configured credentials", async t => {
  const calls = t.mock.method(globalThis, "fetch", async (url: unknown, options?: RequestInit) => {
    assert.equal(url, "https://api.venice.ai/api/v1/models?type=text");
    assert.equal(options?.headers, undefined); assert.equal(options?.cache, "no-store");
    assert.equal(options?.redirect, "error"); assert.ok(options?.signal);
    return Response.json({ data: [model()] });
  });
  const logs: string[] = [];
  await qualifyWizard([], { WORKFLOW_WIZARD_MODEL: "test-json", VENICE_API_KEY: "PRIVATE_KEY_CANARY" }, text => logs.push(text));
  assert.equal(calls.mock.callCount(), 1);
  assert.ok(!logs.join().includes("PRIVATE_KEY_CANARY"));
  await assert.rejects(qualifyWizard(["--typo"], {}, () => {}));
  await assert.rejects(qualifyWizard(["--live"], {}, () => {}));
  assert.equal(calls.mock.callCount(), 1, "Invalid live configuration must fail before network access");
});

test("live qualification makes exactly one authoring call, compiles it, and never logs content", async t => {
  let fail = false;
  const calls = t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).includes("/models?")) return Response.json({ data: [model()] });
    assert.equal(url, "https://api.venice.ai/api/v1/chat/completions");
    if (fail) return new Response("PRIVATE_PROVIDER_CANARY", { status: 500 });
    const blueprint = wizardBlueprint();
    return Response.json(wizardProviderResponse({ ...blueprint, steps: [blueprint.steps[0]] }));
  });
  const logs: string[] = [];
  const run = () => qualifyWizard(["--live"], { WORKFLOW_WIZARD_MODEL: "test-json", VENICE_API_KEY: "PRIVATE_KEY_CANARY" }, text => logs.push(text));
  await run(); assert.equal(calls.mock.callCount(), 2); assert.ok(logs.some(log => log.startsWith("PASS")));
  fail = true; await assert.rejects(run()); assert.equal(calls.mock.callCount(), 4);
  assert.ok(!logs.join().includes("PRIVATE_")); assert.ok(!logs.join().includes(wizardBlueprint().name));
});

test("unqualified selected models and oversized catalogs cannot reach inference", async t => {
  const calls = t.mock.method(globalThis, "fetch", async () => Response.json({ data: [model()] }));
  await assert.rejects(qualifyWizard(["--live"], { WORKFLOW_WIZARD_MODEL: "missing", VENICE_API_KEY: "PRIVATE_KEY_CANARY" }, () => {}));
  assert.equal(calls.mock.callCount(), 1);
  let cancelled = false;
  calls.mock.mockImplementation(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); },
    cancel() { cancelled = true; },
  })));
  await assert.rejects(qualifyWizard([], {}, () => {})); assert.equal(cancelled, true);
});
