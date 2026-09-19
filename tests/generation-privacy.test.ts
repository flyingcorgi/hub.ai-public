import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { NextRequest } from "next/server";
import { generateVenice } from "../src/lib/actions/generate-venice";
import { POST as chat } from "../src/app/api/venice-generate/route";
import { POST as batch } from "../src/app/api/batch-generate/route";
import { allModels } from "../src/lib/models/registry";
import type { Model } from "../src/lib/types";

// Synthetic canaries only: no real API key, personal media, disk migration, or live requests.
const secret = "PRIVATE-CANARY-prompt-key-image";
const image = `data:image/png;base64,${Buffer.from(secret).toString("base64")}`;
const model = (id: string): Model => {
  const found = allModels.find((candidate) => candidate.id === id);
  assert.ok(found, `Registered fixture model missing: ${id}`);
  return found;
};
const textImage = model("venice/seedream-v5-pro");
const singleEdit = model("venice/seedream-v5-pro-edit");
const multiEdit = model("venice/seedream-v5-pro-multi-edit");
const video = model("venice/wan-2-7-image-to-video");

let responses: (Response | Error)[];
let requests: { url: string; options: RequestInit }[];
let consoleCalls: unknown[][];

beforeEach(() => {
  responses = [];
  requests = [];
  consoleCalls = [];
  // An unconfigured fetch fails locally; the test suite cannot spend Venice credits.
  mock.method(globalThis, "fetch", async (url: string | URL | Request, options: RequestInit = {}) => {
    requests.push({ url: String(url), options });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected provider request");
    if (response instanceof Error) throw response;
    return response;
  });
  for (const method of ["log", "info", "debug", "warn", "error"] as const) {
    mock.method(console, method, (...args: unknown[]) => { consoleCalls.push(args); });
  }
});

afterEach(() => {
  mock.restoreAll();
  assert.deepEqual(consoleCalls, [], "Generation must not log content or raw errors");
  assert.equal(responses.length, 0, "Every expected provider response must be consumed");
  for (const { url, options } of requests) {
    assert.ok(url.startsWith("https://api.venice.ai/api/v1/"));
    assert.equal(options.cache, "no-store");
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${secret}`);
  }
});

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertPrivate(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.equal(response.headers.get("Expires"), "0");
}

function assertSafeFailure(result: { success: boolean; error?: string }) {
  assert.equal(result.success, false);
  assert.ok(result.error);
  assert.ok(!result.error.includes(secret));
  assert.ok(!result.error.includes(image));
}

test("image generation still delivers the output without logging it", async () => {
  responses.push(Response.json({ id: secret, images: [Buffer.from(secret).toString("base64")] }));
  const result = await generateVenice(textImage, { prompt: secret }, secret);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.ok(result.image.url.startsWith("data:image/jpeg;base64,"));
  assert.equal(result.requestId, secret); // delivered to requester, never logged
  assert.equal(JSON.parse(String(requests[0].options.body)).prompt, secret);
});

for (const editModel of [singleEdit, multiEdit]) {
  test(`${editModel.id} still sends the correct edit request and returns binary media`, async () => {
    responses.push(new Response(Buffer.from(secret), { headers: { "Content-Type": "image/png" } }));
    const result = await generateVenice(editModel, { prompt: secret, image, images: [image] }, secret);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.image.url, image);
    const body = JSON.parse(String(requests[0].options.body));
    if (editModel === multiEdit) {
      assert.equal(body.modelId, "seedream-v5-pro-edit");
      assert.equal(body.model, undefined);
      assert.deepEqual(body.images, [image]);
      assert.ok(requests[0].url.endsWith("/image/multi-edit"));
    } else {
      assert.equal(body.model, "seedream-v5-pro-edit");
      assert.equal(body.image, image);
      assert.ok(requests[0].url.endsWith("/image/edit"));
    }
  });
}

for (const status of [400, 401, 402, 403, 413, 422, 429, 500]) {
  test(`provider HTTP ${status} errors discard the body and expose only a status hint`, async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`${secret} ${image}`));
        controller.close();
      },
      cancel() { cancelled = true; },
    }), { status });
    responses.push(response);
    const result = await generateVenice(textImage, { prompt: secret }, secret);
    assertSafeFailure(result);
    if (result.success) return;
    assert.ok(result.error.includes(String(status)));
    assert.equal(cancelled, true, "Error body should be cancelled without reading its contents");
  });
}

test("network exception text cannot escape the image generation boundary", async () => {
  responses.push(new Error(secret));
  const result = await generateVenice(textImage, { prompt: secret }, secret);
  assert.deepEqual(result, { success: false, error: "Failed to generate media" });
});

test("legacy server album paths and browser blob URLs cannot trigger a filesystem/provider read", async () => {
  for (const localUrl of ["/api/album-media/private-canary.png", "blob:http://localhost/private-canary"]) {
    for (const [target, input] of [[singleEdit, { image: localUrl }], [multiEdit, { images: [localUrl] }], [video, { image_url: localUrl }]] as const) {
      assertSafeFailure(await generateVenice(target, { prompt: secret, ...input }, secret));
    }
  }
  assert.equal(requests.length, 0);
});

test("missing key remains actionable without contacting Venice", async () => {
  const result = await generateVenice(textImage, { prompt: secret }, "");
  assert.deepEqual(result, { success: false, error: "Please set your Venice.ai API key first" });
  assert.equal(requests.length, 0);
});

test("malformed provider JSON cannot echo content via the parser error", async () => {
  responses.push(new Response(`invalid-json-${secret}`));
  assertSafeFailure(await generateVenice(textImage, { prompt: secret }, secret));
});

test("unexpected edit content type is not echoed", async () => {
  responses.push(new Response(secret, { headers: { "Content-Type": `text/${secret}` } }));
  assertSafeFailure(await generateVenice(singleEdit, { prompt: secret, image }, secret));
});

test("video queue failure does not expose provider JSON", async () => {
  responses.push(Response.json({ message: secret, download_url: `https://example.com/${secret}` }));
  assertSafeFailure(await generateVenice(video, { prompt: secret, image_url: image }, secret));
});

test("video status failure does not expose provider JSON", async () => {
  responses.push(Response.json({ queue_id: "test-job" }), Response.json({ status: secret }));
  assertSafeFailure(await generateVenice(video, { prompt: secret, image_url: image }, secret));
});

test("video queue and completed binary result still work", async () => {
  responses.push(
    Response.json({ queue_id: "test-job" }),
    new Response(Buffer.from(secret), { headers: { "Content-Type": "video/mp4" } })
  );
  const result = await generateVenice(video, { prompt: secret, image_url: image }, secret);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.image.content_type, "video/mp4");
  assert.equal(result.requestId, "test-job");
  assert.equal(requests.length, 2);
});

test("chat success delivers text with private no-store headers", async () => {
  responses.push(Response.json({ choices: [{ message: { content: secret } }] }));
  const response = await chat(request({ userPrompt: secret, apiKey: secret, model: "test-chat" }));
  assertPrivate(response);
  assert.deepEqual(await response.json(), { success: true, text: secret });
});

test("tool-only chat response is preserved without logging tool arguments", async () => {
  responses.push(Response.json({ choices: [{ message: {
    content: null,
    tool_calls: [{ id: "test-call", function: { name: "test_tool", arguments: JSON.stringify({ value: secret }) } }],
  } }] }));
  const response = await chat(request({ messages: [{ role: "user", content: secret }], apiKey: secret, model: "test-chat" }));
  assertPrivate(response);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(JSON.parse(result.toolCalls[0].arguments).value, secret);
});

for (const providerResponse of ["http-error", "invalid-json", "network-error"] as const) {
  test(`chat ${providerResponse} has no-store headers and no raw error payload`, async () => {
    responses.push(providerResponse === "network-error" ? new Error(secret) :
      new Response(secret, { status: providerResponse === "http-error" ? 400 : 200 }));
    const response = await chat(request({ userPrompt: secret, apiKey: secret, model: "test-chat" }));
    assertPrivate(response);
    assertSafeFailure(await response.json());
  });
}

test("batch success delivers images with private no-store headers", async () => {
  responses.push(Response.json({ images: [Buffer.from(secret).toString("base64")] }));
  const response = await batch(request({ model: textImage, payload: { prompt: secret }, apiKey: secret }));
  assertPrivate(response);
  assert.equal((await response.json()).success, true);
});

test("batch provider failure has private headers and no content echo", async () => {
  responses.push(new Response(secret, { status: 429 }));
  const response = await batch(request({ model: textImage, payload: { prompt: secret }, apiKey: secret }));
  assertPrivate(response);
  assertSafeFailure(await response.json());
});

for (const [name, handler] of [["chat", chat], ["batch", batch]] as const) {
  test(`${name} malformed client JSON is not echoed in an error response`, async () => {
    const response = await handler(new NextRequest("http://localhost/api/test", {
      method: "POST",
      body: `invalid-json-${secret}`,
    }));
    assertPrivate(response);
    assertSafeFailure(await response.json());
    assert.equal(requests.length, 0);
  });
}
