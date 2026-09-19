import assert from "node:assert/strict";
import { test } from "node:test";
import { isolatedDatabase } from "./helpers/database";
import { migrate } from "../src/lib/db/migrate";
import { closeDb, getDb } from "../src/lib/db";
import { createAuth } from "../src/lib/auth/server";
import { requireAdmin } from "../src/lib/auth/authorization";
import { GET as list, POST as replaceCatalog } from "../src/app/api/workflows/route";
import { GET as read, PUT as write, DELETE as remove } from "../src/app/api/workflows/[id]/route";
import { importWorkflowCatalog, readPublicWorkflowSummary } from "../src/lib/workflows/catalog";
import { POST as wizard } from "../src/app/api/workflow-wizard/route";
import { wizardProviderResponse } from "./helpers/wizard";
import type { WorkflowDefinition, WorkflowRecord } from "../src/lib/workflows/designer-types";

const origin = "http://localhost:4000";
const secret = "test-only-workflow-secret-at-least-thirty-two-characters";
const prompt = "PRIVATE_PROMPT_CANARY";
const image = "data:image/png;base64,UFJJVkFURV9SRUZFUkVOQ0VfQ0FOQVJZ";
function definition(id: string, free = false, published = true): WorkflowDefinition {
  return { id, name: `Workflow ${id}`, description: "Public summary", free, published, createdAt: 1, updatedAt: 1,
    optionGroups: [{ id: "style", name: "Style", choices: [{ id: "one", label: "One", prompt, referenceImage: image, icon: image }] }],
    steps: [{ id: "caption", type: "text-overlay", label: "Caption", modelId: "", promptTemplate: `${prompt} {{options}}` }],
  };
}
function request(method = "GET", cookie = "", body?: unknown, extraHeaders: Record<string, string> = {}, url = "/api/workflows") {
  return new Request(`${origin}${url}`, { method,
    headers: { ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { origin, "content-type": "application/json" } : {}), ...extraHeaders },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
async function responseJson(response: Response, status = 200) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  return response.json();
}
async function denied(response: Response, status: number) {
  const body = await responseJson(response, status);
  const serialized = JSON.stringify(body);
  for (const canary of [prompt, image, secret]) assert.ok(!serialized.includes(canary));
  assert.deepEqual(Object.keys(body), ["error"]);
}

test("workflow HTTP boundary with library-issued sessions and isolated PostgreSQL", { timeout: 90000 }, async (t) => {
  const fixture = await isolatedDatabase();
  const env = { DATABASE_URL: process.env.DATABASE_URL, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET };
  Object.assign(process.env, { DATABASE_URL: fixture.connectionString, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret });
  // The socket fixture accepts one connection. Routes, auth, and setup must share one pool;
  // otherwise the second pool is reset by the fixture, not rejected by application policy.
  const db = { ...fixture, pool: getDb() };
  db.pool.options.max = 1;
  // No provider traffic, SMTP, or live payments are permitted in this suite.
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external fetch"); });
  const logs: unknown[][] = [];
  for (const method of ["log", "warn", "error", "debug", "info"] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args); });
  try {
    await migrate(db.pool);
    await migrate(db.pool);
    assert.equal((await db.pool.query("SELECT count(*) FROM app_migrations")).rows[0].count, "4");
    const auth = createAuth(db.pool, { baseURL: origin, secret, allowSignUp: true, sendMail: async () => undefined });
    async function actor(email: string, role = "user") {
      const signup = await auth.api.signUpEmail({ body: { email, name: "Test account", password: "test-password-only-long-enough" } });
      await db.pool.query('UPDATE "user" SET "emailVerified"=true, role=$2 WHERE id=$1', [signup.user.id, role]);
      const login = await auth.api.signInEmail({ body: { email, password: "test-password-only-long-enough" }, asResponse: true });
      assert.equal(login.status, 200);
      const cookies = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
      assert.match(cookies, /session_token=/);
      return { id: signup.user.id, cookie: cookies };
    }
    const admin = await actor("admin@example.test", "admin");
    const user = await actor("user@example.test");
    const unverified = await actor("unverified@example.test");
    await db.pool.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1', [unverified.id]);
    assert.equal((await requireAdmin(new Headers({ cookie: admin.cookie }))).userId, admin.id);
    const records = new Map<string, WorkflowRecord>();
    for (const d of [definition("paid"), definition("free", true), definition("draft", false, false), definition("draft-free", true, false)]) {
      records.set(d.id, await responseJson(await write(request("PUT", admin.cookie, { definition: d, revision: null }), context(d.id))));
    }

    await t.test("public summaries exclude draft metadata, prompts, steps, and embedded assets", async () => {
      for (const cookie of ["", user.cookie, admin.cookie, "better-auth.session_token=forged"]) {
        const summaries = await responseJson(await list(request("GET", cookie)));
        assert.deepEqual(summaries.map((d: { id: string }) => d.id), ["free", "paid"]);
        for (const summary of summaries) assert.deepEqual(Object.keys(summary).sort(), ["category", "description", "free", "id", "name", "published"]);
        assert.ok(!JSON.stringify(summaries).includes(prompt));
        assert.ok(!JSON.stringify(summaries).includes(image));
      }
      await denied(await list(request("GET", "", undefined, {}, "/api/workflows?scope=admin")), 401);
      await denied(await list(request("GET", user.cookie, undefined, {}, "/api/workflows?scope=admin")), 403);
      const all = await responseJson(await list(request("GET", admin.cookie, undefined, {}, "/api/workflows?scope=admin")));
      assert.equal(all.length, 4);
      assert.ok(!JSON.stringify(all).includes(prompt));
    });

    await t.test("landing pages read published summaries only, including after unpublishing", async () => {
      for (const id of ["free", "paid"]) {
        const summary = await readPublicWorkflowSummary(db.pool, id);
        assert.equal(summary?.id, id);
        assert.deepEqual(Object.keys(summary!).sort(), ["category", "description", "free", "id", "name", "published"]);
        for (const privateValue of [prompt, image]) assert.ok(!JSON.stringify(summary).includes(privateValue));
      }
      for (const id of ["draft", "draft-free", "missing", "../paid", "paid' OR true--"]) assert.equal(await readPublicWorkflowSummary(db.pool, id), null);
      await db.pool.query("UPDATE workflows SET published=false WHERE id='paid'");
      try { assert.equal(await readPublicWorkflowSummary(db.pool, "paid"), null); }
      finally { await db.pool.query("UPDATE workflows SET published=true WHERE id='paid'"); }
    });

    await t.test("free/paid/draft access is enforced without UI or browser flags", async () => {
      const free = await responseJson(await read(request(), context("free")));
      assert.equal(free.definition.optionGroups[0].choices[0].referenceImage, image);
      await denied(await read(request(), context("paid")), 401);
      await denied(await read(request("GET", user.cookie), context("paid")), 403);
      for (const id of ["draft", "draft-free", "nonexistent"]) {
        for (const cookie of ["", user.cookie]) await denied(await read(request("GET", cookie), context(id)), 404);
      }
      await denied(await read(request("GET", "better-auth.session_token=forged", undefined, { "x-role": "admin", "x-paid-through": "9999999999999" }), context("paid")), 401);
      assert.equal((await responseJson(await read(request("GET", admin.cookie), context("draft-free")))).definition.id, "draft-free");
      assert.equal((await responseJson(await read(request("GET", admin.cookie), context("paid")))).definition.id, "paid");
    });

    await t.test("entitlement grant, expiry, revocation and admin demotion affect the same session immediately", async () => {
      await db.pool.query("INSERT INTO entitlements (user_id, paid_through_at) VALUES ($1,CURRENT_TIMESTAMP + INTERVAL '1 day')", [user.id]);
      await responseJson(await read(request("GET", user.cookie), context("paid")));
      await denied(await read(request("GET", user.cookie), context("draft")), 404);
      await denied(await write(request("PUT", user.cookie, { definition: definition("hijack"), revision: null }), context("hijack")), 403);
      await db.pool.query("UPDATE entitlements SET paid_through_at=CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE user_id=$1", [user.id]);
      await denied(await read(request("GET", user.cookie), context("paid")), 403);
      await db.pool.query("UPDATE entitlements SET paid_through_at=CURRENT_TIMESTAMP + INTERVAL '1 day', revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1", [user.id]);
      await denied(await read(request("GET", user.cookie), context("paid")), 403);
      await db.pool.query("INSERT INTO entitlements (user_id, paid_through_at) VALUES ($1,CURRENT_TIMESTAMP + INTERVAL '1 day')", [unverified.id]);
      await denied(await read(request("GET", unverified.cookie), context("paid")), 403);
      await db.pool.query('UPDATE "user" SET role=\'user\' WHERE id=$1', [admin.id]);
      await denied(await read(request("GET", admin.cookie), context("draft")), 404);
      await denied(await write(request("PUT", admin.cookie, {}), context("paid")), 403);
      await db.pool.query('UPDATE "user" SET role=\'admin\' WHERE id=$1', [admin.id]);
    });

    await t.test("admin mutations require authentication, same Origin and bounded valid JSON", async () => {
      const body = { definition: definition("new"), revision: null };
      for (const method of ["PUT", "DELETE"]) {
        const handler = method === "PUT" ? write : remove;
        await denied(await handler(request(method, "", body), context("new")), 401);
        await denied(await handler(request(method, user.cookie, body), context("new")), 403);
        await denied(await handler(request(method, unverified.cookie, body), context("new")), 403);
        for (const badOrigin of ["", "https://attacker.example", "http://localhost:4000.attacker.example"]) {
          await denied(await handler(request(method, admin.cookie, body, { origin: badOrigin }), context("new")), 403);
        }
      }
      await denied(await write(request("PUT", admin.cookie, body, { "content-type": "text/plain" }), context("new")), 415);
      await denied(await write(request("PUT", admin.cookie, body, { "content-length": String(17 * 1024 * 1024) }), context("new")), 413);
      let cancelled = false;
      const chunk = new Uint8Array(1024 * 1024).fill(32);
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) { controller.enqueue(chunk); },
        cancel() { cancelled = true; },
      });
      const oversized = new Request(`${origin}/api/workflows/new`, {
        method: "PUT", headers: { cookie: admin.cookie, origin, "content-type": "application/json" },
        body: stream, ...{ duplex: "half" },
      });
      await denied(await write(oversized, context("new")), 413);
      assert.ok(cancelled, "oversized streaming body must be cancelled without a Content-Length header");
      const malformed = new Request(`${origin}/api/workflows/new`, { method: "PUT", headers: { cookie: admin.cookie, origin, "content-type": "application/json" }, body: `{"${prompt}` });
      await denied(await write(malformed, context("new")), 400);
      await denied(await write(request("PUT", admin.cookie, { ...body, role: "admin" }), context("new")), 400);
      await denied(await write(request("PUT", admin.cookie, body), context("different-id")), 400);
      await denied(await write(request("PUT", admin.cookie, body), context("../paid")), 400);
      await denied(await replaceCatalog(), 405);
      assert.equal((await db.pool.query("SELECT count(*) FROM workflows")).rows[0].count, "4");
    });

    await t.test("per-item revisions prevent lost updates/deletes and leave unrelated workflows untouched", async () => {
      const previous = records.get("paid")!;
      const next = { ...previous.definition, description: "Edited summary" };
      const attempts = await Promise.all([1, 2].map(() => write(request("PUT", admin.cookie, { definition: next, revision: previous.revision }), context("paid"))));
      assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
      const updated = await responseJson(attempts.find((r) => r.status === 200)!);
      await denied(attempts.find((r) => r.status === 409)!, 409);
      assert.notEqual(updated.revision, previous.revision);
      await denied(await write(request("PUT", admin.cookie, { definition: next, revision: null }), context("paid")), 409);
      await denied(await remove(request("DELETE", admin.cookie, { revision: previous.revision }), context("paid")), 409);
      await denied(await remove(request("DELETE", admin.cookie, {}), context("paid")), 400);
      const unrelated = await responseJson(await read(request("GET", admin.cookie), context("free")));
      assert.equal(unrelated.revision, records.get("free")!.revision);
      // Unpublish is atomic with content: the same URL becomes hidden to non-admins.
      const hidden = await responseJson(await write(request("PUT", admin.cookie, { definition: { ...next, published: false }, revision: updated.revision }), context("paid")));
      await denied(await read(request("GET", user.cookie), context("paid")), 404);
      await responseJson(await remove(request("DELETE", admin.cookie, { revision: hidden.revision }), context("paid")));
      await denied(await read(request("GET", admin.cookie), context("paid")), 404);
      const recreated = await responseJson(await write(request("PUT", admin.cookie, { definition: definition("paid"), revision: null }), context("paid")));
      assert.notEqual(recreated.revision, hidden.revision);
      await denied(await remove(request("DELETE", admin.cookie, { revision: hidden.revision }), context("paid")), 409);
    });

    await t.test("explicit imports default to draft, preserve input, and roll back on any conflicting ID", async () => {
      const source = [definition("imported", true)];
      const snapshot = JSON.stringify(source);
      assert.equal(await importWorkflowCatalog(db.pool, source), 1);
      assert.equal(JSON.stringify(source), snapshot);
      await denied(await read(request(), context("imported")), 404);
      const imported = await responseJson(await read(request("GET", admin.cookie), context("imported")));
      assert.equal(imported.definition.published, false);
      assert.equal(imported.definition.optionGroups[0].choices[0].referenceImage, image);
      await assert.rejects(importWorkflowCatalog(db.pool, [definition("rollback-me"), definition("imported")]));
      assert.equal((await db.pool.query("SELECT id FROM workflows WHERE id='rollback-me'")).rowCount, 0);
      await assert.rejects(importWorkflowCatalog(db.pool, [{ ...definition("invalid"), steps: [{ type: "arbitrary" }] }]));
      assert.equal((await db.pool.query("SELECT id FROM workflows WHERE id='invalid'")).rowCount, 0);
    });

    await t.test("wizard is flag/admin/origin gated, never writes the catalog and rechecks roles", async sub => {
      const previous = { WORKFLOW_WIZARD_ENABLED: process.env.WORKFLOW_WIZARD_ENABLED, WORKFLOW_WIZARD_MODEL: process.env.WORKFLOW_WIZARD_MODEL };
      const body = { description: "Create a watercolor portrait with a caption", apiKey: "synthetic-wizard-key", maxSteps: 3, allowVideo: false };
      const req = (cookie: string, value: unknown = body, headers: Record<string,string> = {}) => request("POST", cookie, value, headers, "/api/workflow-wizard");
      try {
        process.env.WORKFLOW_WIZARD_ENABLED = "false"; process.env.WORKFLOW_WIZARD_MODEL = "synthetic-json-model";
        await denied(await wizard(req(admin.cookie)), 503);
        process.env.WORKFLOW_WIZARD_ENABLED = "true";
        await denied(await wizard(req("")), 401);
        await denied(await wizard(req(user.cookie)), 403);
        await denied(await wizard(req(unverified.cookie)), 403);
        await denied(await wizard(req(admin.cookie, body, {origin:"https://other.invalid"})), 403);
        await denied(await wizard(req(admin.cookie, {...body, maxSteps:20})), 400);
        await denied(await wizard(req(admin.cookie, {...body, description:"x".repeat(17000)})), 413);
        assert.equal(fetchMock.mock.callCount(), 0);
        const count = (await db.pool.query("SELECT count(*) FROM workflows")).rows[0].count;
        let demote = false;
        const provider = sub.mock.method(globalThis, "fetch", async () => {
          if (demote) await db.pool.query('UPDATE "user" SET role=\'user\' WHERE id=$1', [user.id]);
          return Response.json(wizardProviderResponse());
        });
        const result = await responseJson(await wizard(req(admin.cookie)));
        assert.equal(result.definition.published, false); assert.equal(result.definition.free, false);
        assert.equal(result.paidSteps, 1);
        assert.equal((await db.pool.query("SELECT count(*) FROM workflows")).rows[0].count, count);
        await denied(await wizard(req(admin.cookie)), 429);
        assert.equal(provider.mock.callCount(), 1);
        await db.pool.query('UPDATE "user" SET role=\'admin\' WHERE id=$1', [user.id]);
        demote = true;
        await denied(await wizard(req(user.cookie)), 403);
        assert.equal(provider.mock.callCount(), 2);
      } finally {
        for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      }
    });

    await t.test("session revocation and service failures fail closed with no-store safe errors", async () => {
      await db.pool.query('DELETE FROM "session" WHERE "userId"=$1', [admin.id]);
      await denied(await write(request("PUT", admin.cookie, {}), context("free")), 401);
      await denied(await read(request("GET", admin.cookie), context("draft")), 404);
      await closeDb();
      delete process.env.DATABASE_URL;
      await denied(await list(request()), 503);
      await denied(await read(request(), context("free")), 503);
    });
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.deepEqual(logs, []);
  } finally {
    await closeDb();
    await db.close();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
