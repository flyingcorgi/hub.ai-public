import assert from "node:assert/strict";
import { test } from "node:test";
import { compileWizardDraft, wizardRequestSchema, wizardSystemPrompt } from "../src/lib/workflows/wizard";
import { createWizardLimiter, generateWizardDraft, wizardModel } from "../src/lib/workflows/wizard-server";
import { wizardBlueprint, wizardProviderResponse } from "./helpers/wizard";

const constraints = { maxSteps: 3, allowVideo: false };
const input = { ...constraints, description: "PRIVATE_WIZARD_PROMPT_CANARY", apiKey: "PRIVATE_WIZARD_KEY_CANARY" };

test("wizard compiles minimal runner-compatible drafts and rejects unsupported chains", () => {
  const source = wizardBlueprint(); const original = JSON.stringify(source);
  const draft = compileWizardDraft(source, constraints);
  assert.equal(draft.published, false); assert.equal(draft.free, false);
  assert.equal(draft.steps[1].modelId, ""); assert.equal(draft.steps[1].userEditable, true);
  assert.notEqual(draft.id, compileWizardDraft(source, constraints).id);
  assert.equal(JSON.stringify(source), original);
  const invalid: unknown[] = [
    { ...source, published: true }, { ...source, id: "overwrite-existing" },
    { ...source, steps: [] }, { ...source, steps: [{ ...source.steps[0], modelId: "arbitrary/model" }] },
    { ...source, steps: [{ ...source.steps[0], modelId: "venice/seedream-v5-pro" }] },
    { ...source, steps: [{ ...source.steps[0], sourceImage: "option" }] },
    { ...source, steps: [{ ...source.steps[0], optional: true }] },
    { ...source, steps: [{ ...source.steps[0], type: "llm" }] },
    { ...source, steps: [{ ...source.steps[0], promptTemplate: "{{missing}}" }] },
    { ...source, steps: [{ ...source.steps[0], promptTemplate: "{{broken" }] },
    { ...source, optionGroups: [...source.optionGroups, source.optionGroups[0]] },
    { ...source, optionGroups: [{ ...source.optionGroups[0], name: "Options" }] },
    { ...source, optionGroups: [{ ...source.optionGroups[0], choices: [] }] },
    { ...source, optionGroups: [{ ...source.optionGroups[0], inputType: "text" }] },
    { ...source, optionGroups: [{ ...source.optionGroups[0], inputType: "toggle", choices: [] }] },
    { ...source, optionGroups: [{ ...source.optionGroups[0], choices: [{ ...source.optionGroups[0].choices[0], referenceImage: "https://untrusted.invalid/private" }] }] },
  ];
  for (const value of invalid) assert.throws(() => compileWizardDraft(value, constraints), /unsupported or invalid draft/);
  assert.throws(() => compileWizardDraft(source, { ...constraints, maxSteps: 1 }));
  const video = { id: "video", type: "video", label: "Animate", modelId: "venice/wan-2-7-image-to-video", promptTemplate: "Gentle camera movement", sourceImage: "pipeline" };
  assert.throws(() => compileWizardDraft({ ...source, steps: [...source.steps, video] }, constraints));
  assert.equal(compileWizardDraft({ ...source, steps: [...source.steps, video] }, { ...constraints, allowVideo: true }).steps.length, 3);
  assert.throws(() => compileWizardDraft({ ...source, steps: [video, ...source.steps] }, { ...constraints, allowVideo: true }));
  assert.equal(wizardRequestSchema.safeParse({ ...input, model: "client-selected" }).success, false);
  assert.equal(wizardRequestSchema.safeParse({ ...input, maxSteps: 100 }).success, false);
  assert.equal(wizardRequestSchema.safeParse({ ...input, apiKey: "has\nnewline" }).success, false);
  const system = wizardSystemPrompt(constraints);
  assert.ok(!system.includes("image-to-video")); assert.ok(!system.includes(input.apiKey));
});

test("wizard provider contract is one bounded, uncached call; errors never echo/log content", async t => {
  const logs: unknown[] = [];
  for (const method of ["log", "error", "warn", "info", "debug"] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args); });
  let response = () => Promise.resolve(Response.json(wizardProviderResponse()));
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    assert.equal(url, "https://api.venice.ai/api/v1/chat/completions");
    assert.equal(options?.cache, "no-store"); assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, "synthetic-json-model"); assert.equal(body.max_tokens, 3500);
    assert.equal(body.messages[1].content, input.description);
    assert.equal(JSON.stringify(body).includes(input.apiKey), false);
    assert.deepEqual(body.response_format, {type:"json_object"});
    assert.equal(body.tools, undefined); assert.equal(body.stream, false);
    return response();
  });
  const run = () => generateWizardDraft(input, "synthetic-json-model", new AbortController().signal);
  const result = await run(); assert.equal(result.paidSteps, 1); assert.equal(result.definition.published, false);
  assert.equal(fetchMock.mock.callCount(), 1);
  const unsafe = `${input.description} ${input.apiKey} PRIVATE_PROVIDER_CANARY`;
  for (const scenario of [
    () => Promise.resolve(new Response(unsafe, {status:401})),
    () => Promise.resolve(new Response(unsafe, {status:402})),
    () => Promise.resolve(new Response(unsafe, {status:500})),
    () => Promise.resolve(new Response(unsafe)),
    () => Promise.resolve(Response.json({choices:[{finish_reason:"length",message:{content:unsafe}}]})),
    () => Promise.resolve(Response.json({choices:[{finish_reason:"stop",message:{content:unsafe}}]})),
    () => Promise.resolve(Response.json({choices:[{finish_reason:"stop",message:{content:"{}",tool_calls:[{name:unsafe}]}}]})),
    () => Promise.resolve(Response.json(wizardProviderResponse({...wizardBlueprint(), published:true}))),
    () => Promise.reject(new Error(unsafe)),
  ]) {
    response = scenario; const before = fetchMock.mock.callCount();
    await assert.rejects(run(), error => {
      const message = String(error);
      for (const canary of [input.description, input.apiKey, "PRIVATE_PROVIDER_CANARY"]) assert.ok(!message.includes(canary));
      return true;
    });
    assert.equal(fetchMock.mock.callCount(), before + 1, "Unexpected automatic provider retry");
  }
  let cancelled = false;
  response = () => Promise.resolve(new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; },
  })));
  await assert.rejects(run(), /invalid draft/); assert.equal(cancelled, true);
  assert.deepEqual(logs, []);
});

test("admin beta guard bounds concurrency and cooldown without storing request content", () => {
  let now = 0; const acquire = createWizardLimiter(() => now);
  const a = acquire("a"), b = acquire("b");
  assert.throws(() => acquire("a"), /busy/); assert.throws(() => acquire("c"), /busy/);
  a(); assert.throws(() => acquire("a"), /cooling down/);
  const c = acquire("c"); c(); b(); now = 30001;
  acquire("a")();
  const env = { WORKFLOW_WIZARD_ENABLED: process.env.WORKFLOW_WIZARD_ENABLED, WORKFLOW_WIZARD_MODEL: process.env.WORKFLOW_WIZARD_MODEL };
  try {
    process.env.WORKFLOW_WIZARD_ENABLED = "false"; process.env.WORKFLOW_WIZARD_MODEL = "synthetic-json-model";
    assert.equal(wizardModel(), undefined);
    process.env.WORKFLOW_WIZARD_ENABLED = "true"; assert.equal(wizardModel(), "synthetic-json-model");
    delete process.env.WORKFLOW_WIZARD_MODEL; assert.equal(wizardModel(), undefined);
    process.env.WORKFLOW_WIZARD_MODEL = "bad model\n"; assert.equal(wizardModel(), undefined);
  } finally { for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
