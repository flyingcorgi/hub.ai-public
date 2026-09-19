import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGameStore } from "../src/lib/private-storage/game-store";
import { StorageScope, PRIVATE_DB_NAME, PRIVATE_DB_VERSION, openPrivateDb } from "../src/lib/private-storage/database";
import { exportLegacyGame } from "../scripts/lib/export-legacy-game";
import { GET, POST, DELETE } from "../src/app/api/goon-game/sessions/route";
import { GET as rulesGet, POST as rulesPost } from "../src/app/api/goon-game/rules/route";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";
const session = (id = "session-one") => ({ id, fetish: "synthetic topic", messages: [{ id: "m1", role: "domme", type: "image", content: "PRIVATE_GAME_CANARY", imageUrl: png, timestamp: 1 }], conversation: [{ role: "user", content: "PRIVATE_CONVERSATION_CANARY" }], score: 1, phase: "chatting", punishedUntil: 0, punishmentReason: "", updatedAt: 1 });
const blob = (value: unknown) => new Blob([JSON.stringify(value)], { type: "application/json" });

test("game IndexedDB migration, isolation, queued saves and safe recovery", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("No network allowed"); });
  const logs: unknown[] = [];
  for (const method of ["log", "warn", "error", "info", "debug"] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args); });
  const aScope = new StorageScope("owner"), bScope = new StorageScope("other");
  const a = createGameStore(aScope), b = createGameStore(bScope);
  try {
    await t.test("current database upgrade preserves version 1 albums", async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(PRIVATE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          for (const name of ["albums", "albumItems"]) {
            const store = request.result.createObjectStore(name, { keyPath: ["namespace", "id"] }); store.createIndex("namespace", "namespace");
            if (name === "albumItems") store.createIndex("album", ["namespace", "albumId"]);
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction("albums", "readwrite");
          tx.objectStore("albums").put({ namespace: "account:owner", id: "kept", name: "Existing album" });
          tx.oncomplete = () => { db.close(); resolve(); };
        };
      });
      const db = await openPrivateDb(); assert.equal(db.version, PRIVATE_DB_VERSION);
      assert.ok(db.objectStoreNames.contains("gameRecords"));
      const kept = await new Promise(resolve => { const r = db.transaction("albums").objectStore("albums").get(["account:owner", "kept"]); r.onsuccess = () => resolve(r.result); });
      assert.ok(kept);
    });
    await t.test("snapshots and image bytes persist only within their account; queued writes retain newest state", async () => {
      const input = session(); const first = a.saveSession(input); input.conversation[0].content = "changed afterward";
      await first; assert.equal((await a.loadSessions())[0].conversation[0].content, "PRIVATE_CONVERSATION_CANARY");
      await Promise.all([a.saveSession({ ...session(), score: 2 }), a.saveSession({ ...session(), score: 3 })]);
      assert.equal((await a.loadSessions())[0].score, 3);
      assert.equal((await a.loadSessions())[0].messages[0].imageUrl, png);
      assert.deepEqual(await b.loadSessions(), []);
      await a.saveRules({ tone: "synthetic", punishmentRules: "synthetic rules" }); assert.equal(await b.loadRules(), null);
    });
    await t.test("stale tabs cannot overwrite/delete or resurrect deleted sessions", async () => {
      const otherTab = createGameStore(new StorageScope("owner"));
      await otherTab.loadSessions(); await a.saveSession({ ...session(), score: 4 });
      await assert.rejects(otherTab.saveSession(session()), /another tab/);
      await assert.rejects(otherTab.deleteSession(session().id), /another tab/);
      await a.deleteSession(session().id);
      await assert.rejects(a.saveSession(session()), /another tab/);
      assert.deepEqual(await a.loadSessions(), []);
      await a.saveSession(session("new-session"));
    });
    await t.test("backup/import is explicit, idempotent and transactional on conflicts", async () => {
      const backup = await a.exportArchive(); const archive = JSON.parse(await backup.text());
      assert.ok(!JSON.stringify(archive).includes('"namespace"'));
      assert.deepEqual(await b.importArchive(backup), { added: 2, skipped: 0 });
      assert.deepEqual(await b.importArchive(backup), { added: 0, skipped: 2 });
      const conflict = { ...archive, sessions: [session("rollback"), { ...archive.sessions[0], score: 999 }] };
      await assert.rejects(b.importArchive(blob(conflict)), /conflict/);
      assert.equal((await b.loadSessions()).length, 1);
      await assert.rejects(b.importArchive(blob({ ...archive, version: 99 })));
      await assert.rejects(b.saveSession({ ...session(), messages: [{ ...session().messages[0], imageUrl: "blob:private" }] }));
      const pending = a.saveSession(session("stale")); aScope.close(); await assert.rejects(pending, /Account changed/);
    });
    await t.test("all former game endpoints are retired without reading payloads", async () => {
      for (const handler of [GET, POST, DELETE, rulesGet, rulesPost]) {
        const response = await handler(new Request("http://localhost/api/goon-game/sessions"), { params: Promise.resolve({}) });
        assert.equal(response.status, 410); assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
      }
    });
    await t.test("operator export preserves source and embeds old local image references without network", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "game-export-"));
      try {
        const source = path.join(root, "data"); await mkdir(path.join(source, "album-media"), { recursive: true });
        const original = JSON.stringify([{ ...session(), messages: [{ ...session().messages[0], imageUrl: "/api/album-media/one.png" }] }]);
        await writeFile(path.join(source, "goon-game-sessions.json"), original);
        await writeFile(path.join(source, "album-media/one.png"), Buffer.from(png.split(",")[1], "base64"));
        const output = path.join(root, "export.json"); await exportLegacyGame(source, output);
        assert.equal(JSON.parse(await readFile(output, "utf8")).sessions[0].messages[0].imageUrl, png);
        assert.equal(await readFile(path.join(source, "goon-game-sessions.json"), "utf8"), original);
        await assert.rejects(exportLegacyGame(source, output));
        await assert.rejects(exportLegacyGame(source, path.join(source, "bad.json")));
      } finally { await rm(root, { recursive: true, force: true }); }
    });
    assert.equal(fetchMock.mock.callCount(), 0); assert.deepEqual(logs, []);
  } finally { aScope.close(); bScope.close(); (await openPrivateDb()).close(); }
});
