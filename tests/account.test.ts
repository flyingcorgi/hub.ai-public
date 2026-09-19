import assert from "node:assert/strict";
import { test } from "node:test";
import { isolatedDatabase } from "./helpers/database";
import { migrate } from "../src/lib/db/migrate";
import { closeDb, getDb } from "../src/lib/db";
import { createAuth } from "../src/lib/auth/server";
import { GET as account } from "../src/app/api/account/route";
import { POST as authPost } from "../src/app/api/auth/[...all]/route";
import * as albums from "../src/app/api/albums/route";
import * as items from "../src/app/api/albums/items/route";
import { GET as media } from "../src/app/api/album-media/[filename]/route";
import * as sessions from "../src/app/api/goon-game/sessions/route";
import * as rules from "../src/app/api/goon-game/rules/route";

const origin = "http://localhost:4000";
const secret = "synthetic-account-secret-at-least-thirty-two-characters";
const password = "ACCOUNT_PASSWORD_CANARY_long";
const email = "account-canary@example.test";
const request = (path: string, method = "GET", body?: unknown, cookie = "", extra: Record<string, string> = {}) => new Request(origin + path, {
  method, headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function privateResponse(response: Response, status: number) {
  assert.equal(response.status, status); assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  return response.json();
}

test("real auth lifecycle and account/private-data HTTP boundaries", { timeout: 90000 }, async t => {
  const fixture = await isolatedDatabase();
  const config = { DATABASE_URL: fixture.connectionString, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret, AUTH_ALLOW_SIGNUP: "false" };
  const previous = Object.fromEntries(Object.keys(config).map(k => [k, process.env[k]])); Object.assign(process.env, config);
  const db = getDb(); db.options.max = 1;
  const mail: { to: string; url: string; purpose: string }[] = [];
  const logs: unknown[][] = [];
  for (const method of ["log", "warn", "error", "debug", "info"] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args); });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external fetch"); });
  try {
    await migrate(db);
    const auth = createAuth(db, { baseURL: origin, secret, allowSignUp: true, sendMail: async (to, url, purpose) => { mail.push({ to, url, purpose }); } });
    const call = (path: string, body?: unknown, cookie = "") => auth.handler(request("/api/auth/" + path, body === undefined ? "GET" : "POST", body, cookie));
    let id = "", cookie = "";
    await t.test("signup ignores supplied roles, sends verification, and cannot sign in before verification", async () => {
      const result = await call("sign-up/email", { name: "Account test", email, password, role: "admin", callbackURL: origin + "/account?verified=1" });
      assert.equal(result.status, 200);
      const data = await result.json(); id = data.user.id;
      assert.equal(data.user.role, "user"); assert.equal(data.token, null);
      assert.equal(mail[0].to, email); assert.equal(mail[0].purpose, "verify");
      assert.equal((await call("sign-in/email", { email, password })).status, 403);
      const verified = await auth.handler(new Request(mail[0].url));
      assert.equal(verified.status, 302);
      assert.equal(verified.headers.get("location"), origin + "/account?verified=1");
      assert.equal((await db.query('SELECT "emailVerified" FROM "user" WHERE id=$1', [id])).rows[0].emailVerified, true);
      const login = await call("sign-in/email", { email, password }); assert.equal(login.status, 200);
      const setCookie = login.headers.getSetCookie().find(v => v.startsWith("better-auth.session_token="))!;
      assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=Lax/i);
      cookie = setCookie.split(";")[0];
      const current = await privateResponse(await account(request("/api/account", "GET", undefined, cookie)), 200);
      assert.equal(current.user.userId, id); assert.equal(current.unlocked, false);
      assert.ok(!JSON.stringify(current).includes(password));
    });
    await t.test("auth HTTP wrapper rejects unsafe origins, malformed/oversize bodies and closed signup", async () => {
      for (const bad of ["", "https://evil.example", "null"]) await privateResponse(await authPost(request("/api/auth/sign-out", "POST", {}, cookie, { origin: bad })), 403);
      await privateResponse(await authPost(request("/api/auth/sign-in/email", "POST", {}, "", { "content-length": "16385" })), 413);
      const malformed = new Request(origin + "/api/auth/sign-in/email", { method: "POST", headers: { origin, "content-type": "application/json" }, body: '{"' + password });
      const invalid = await privateResponse(await authPost(malformed), 400); assert.ok(!JSON.stringify(invalid).includes(password));
      await privateResponse(await authPost(request("/api/auth/sign-up/email", "POST", { name: "Closed", email: "closed@example.test", password })), 400);
      const anonymous = await privateResponse(await account(request("/api/account")), 200); assert.equal(anonymous.user, null);
      const forged = await privateResponse(await account(request("/api/account", "GET", undefined, "better-auth.session_token=forged")), 200); assert.equal(forged.user, null);
    });
    await t.test("anonymous and ordinary/paid accounts cannot touch legacy operator files", async () => {
      await db.query("INSERT INTO entitlements(user_id,paid_through_at) VALUES ($1,CURRENT_TIMESTAMP + INTERVAL '1 day')", [id]);
      const endpoints = [
        ["GET", sessions.GET], ["POST", sessions.POST], ["DELETE", sessions.DELETE], ["GET", rules.GET], ["POST", rules.POST],
      ] as const;
      for (const [method, handler] of endpoints) for (const c of ["", cookie]) {
        const response = await handler(request("/api/private", method, method === "GET" ? undefined : {}, c), { params: Promise.resolve({}) });
        await privateResponse(response, 410);
      }
      for (const c of ["", cookie]) {
        for (const handler of [albums.GET, albums.POST, items.GET, items.POST, items.PATCH, items.DELETE, media]) {
          await privateResponse(await handler(request("/api/albums", "GET", undefined, c), { params: Promise.resolve({ filename: "canary.png" }) }), 410);
        }
      }
      // Exercise admin CSRF rejection without ever opening or changing operator data.
      await db.query('UPDATE "user" SET role=\'admin\' WHERE id=$1', [id]);
      await privateResponse(await sessions.POST(request("/api/goon-game/sessions", "POST", {}, cookie, { origin: "https://evil.example" }), { params: Promise.resolve({}) }), 410);
      await db.query('UPDATE "user" SET role=\'user\' WHERE id=$1', [id]);
    });
    await t.test("recovery is non-enumerating; reset is single-use and revokes existing sessions", async () => {
      const unknown = await call("request-password-reset", { email: "missing@example.test", redirectTo: origin + "/account/reset-password" });
      const known = await call("request-password-reset", { email, redirectTo: origin + "/account/reset-password" });
      assert.equal(unknown.status, 200); assert.equal(known.status, 200); assert.deepEqual(await unknown.json(), await known.json());
      const reset = mail.findLast(m => m.purpose === "reset")!; assert.equal(reset.to, email);
      const redirect = await auth.handler(new Request(reset.url)); assert.equal(redirect.status, 302);
      const token = new URL(redirect.headers.get("location")!).searchParams.get("token")!; assert.ok(token);
      const newPassword = password + "_new";
      assert.equal((await call("reset-password", { token: "invalid", newPassword })).status, 400);
      assert.equal((await call("reset-password", { token, newPassword })).status, 200);
      assert.equal((await call("reset-password", { token, newPassword })).status, 400);
      assert.equal((await privateResponse(await account(request("/api/account", "GET", undefined, cookie)), 200)).user, null);
      assert.equal((await call("sign-in/email", { email, password })).status, 401);
      assert.equal((await call("sign-in/email", { email, password: newPassword })).status, 429);
      // Advance the persisted rate-limit window in this disposable fixture, not production policy.
      await db.query('UPDATE "rateLimit" SET "lastRequest"=0');
      const login = await call("sign-in/email", { email, password: newPassword }); assert.equal(login.status, 200);
      cookie = login.headers.getSetCookie().find(v => v.startsWith("better-auth.session_token="))!.split(";")[0];
      const signout = await authPost(request("/api/auth/sign-out", "POST", {}, cookie));
      await privateResponse(signout, 200); assert.equal(signout.headers.get("referrer-policy"), "no-referrer");
      assert.equal((await privateResponse(await account(request("/api/account", "GET", undefined, cookie)), 200)).user, null);
    });
    await t.test("expired reset/session records fail closed; HTTPS sessions set Secure cookies", async () => {
      await db.query('UPDATE "rateLimit" SET "lastRequest"=0');
      const recovery = await call("request-password-reset", { email, redirectTo: origin + "/account/reset-password" });
      assert.equal(recovery.status, 200);
      const reset = mail.findLast(m => m.purpose === "reset")!;
      const token = new URL((await auth.handler(new Request(reset.url))).headers.get("location")!).searchParams.get("token")!;
      await db.query('UPDATE "verification" SET "expiresAt"=CURRENT_TIMESTAMP - INTERVAL \'1 second\' WHERE identifier=$1', [`reset-password:${token}`]);
      assert.equal((await call("reset-password", { token, newPassword: password + "_expired" })).status, 400);
      const login = await call("sign-in/email", { email, password: password + "_new" }); assert.equal(login.status, 200);
      const expiredCookie = login.headers.getSetCookie().find(v => v.startsWith("better-auth.session_token="))!.split(";")[0];
      await db.query('UPDATE "session" SET "expiresAt"=CURRENT_TIMESTAMP - INTERVAL \'1 second\' WHERE "userId"=$1', [id]);
      assert.equal((await privateResponse(await account(request("/api/account", "GET", undefined, expiredCookie)), 200)).user, null);
      const secure = createAuth(db, { baseURL: "https://secure.example.test", secret, sendMail: async () => undefined });
      const secureLogin = await secure.api.signInEmail({ body: { email, password: password + "_new" }, asResponse: true });
      assert.equal(secureLogin.status, 200);
      const secureCookie = secureLogin.headers.getSetCookie().find(v => v.startsWith("__Secure-better-auth.session_token="))!;
      assert.match(secureCookie, /; Secure/i); assert.match(secureCookie, /HttpOnly/i); assert.match(secureCookie, /SameSite=Lax/i);
    });
    assert.equal(fetchMock.mock.callCount(), 0); assert.deepEqual(logs, []);
  } finally {
    await closeDb(); await fixture.close();
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
