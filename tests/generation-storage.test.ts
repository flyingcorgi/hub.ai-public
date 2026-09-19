import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createGenerationStore, readLegacyHistory, parseGeneration } from "../src/lib/generations/store";
import { StorageScope, PRIVATE_DB_NAME, PRIVATE_DB_VERSION, openPrivateDb, resultOf } from "../src/lib/private-storage/database";
import type { Generation } from "../src/lib/types";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";
const record = (id = "one"): Generation => ({ id, modelId: "synthetic", modelName: "Synthetic", prompt: "PRIVATE_HISTORY_CANARY", parameters: { reference: png }, output: { images: [{ url: png, width: 1, height: 1, content_type: "image/png" }], timings: {}, seed: -1, has_nsfw_concepts: [] }, timestamp: 1 });

test("generation history migration, isolation, atomic writes and recovery", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("No network allowed"); });
  const logs: unknown[] = [];
  for (const name of ["log", "warn", "error", "info", "debug"] as const) t.mock.method(console, name, (...args: unknown[]) => { logs.push(args); });
  const aScope = new StorageScope("history-owner");
  const a = createGenerationStore(aScope), b = createGenerationStore(new StorageScope("history-other")), anonymous = createGenerationStore(new StorageScope(null));
  try {
    await t.test("v3 upgrade preserves existing album and game records", async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(PRIVATE_DB_NAME, 2);
        request.onupgradeneeded = () => {
          for (const name of ["albums", "albumItems", "gameRecords"]) {
            const store = request.result.createObjectStore(name, { keyPath: ["namespace", "id"] }); store.createIndex("namespace", "namespace");
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result; const tx = db.transaction(["albums", "gameRecords"], "readwrite");
          tx.objectStore("albums").put({ namespace: "account:history-owner", id: "kept-album", name: "kept" });
          tx.objectStore("gameRecords").put({ namespace: "account:history-owner", id: "kept-game", value: "kept" });
          tx.oncomplete = () => { db.close(); resolve(); };
        };
      });
      const db = await openPrivateDb(); assert.equal(db.version, PRIVATE_DB_VERSION);
      assert.ok(await resultOf(db.transaction("albums").objectStore("albums").get([a.namespace,"kept-album"])));
      assert.ok(await resultOf(db.transaction("gameRecords").objectStore("gameRecords").get([a.namespace,"kept-game"])));
    });
    await t.test("writes capture inputs, preserve concurrent additions and separate accounts", async () => {
      const input = record(); const save = a.add(input); input.prompt = "changed later"; await save;
      assert.equal((await a.list())[0].prompt, "PRIVATE_HISTORY_CANARY");
      const sameAccountTab = createGenerationStore(new StorageScope("history-owner"));
      await Promise.all([a.add(record("two")), sameAccountTab.add(record("three"))]);
      assert.equal((await a.list()).length, 3);
      assert.equal(await a.add(record()), 0);
      assert.deepEqual(await b.list(), []); assert.deepEqual(await anonymous.list(), []);
    });
    await t.test("backup checksum and import are idempotent and rollback all conflicting writes", async () => {
      const file = await a.exportArchive();
      assert.ok(!(await file.text()).includes('"namespace"'));
      const rows = await b.prepareImport(file); assert.equal(await b.importRecords(rows), 3);
      assert.equal(await b.importRecords(rows), 0);
      await assert.rejects(b.importRecords([record("rollback"), { ...record(), prompt: "conflict" }]), /conflict/);
      assert.equal((await b.list()).length, 3);
      const corrupt = JSON.parse(await file.text()); corrupt.records[0].prompt = "corrupted";
      await assert.rejects(b.prepareImport(new Blob([JSON.stringify(corrupt)])), /checksum/);
      corrupt.version = 99;
      await assert.rejects(b.prepareImport(new Blob([JSON.stringify(corrupt)])), /unsupported/);
    });
    await t.test("legacy migration reads only the explicitly chosen key, preserving both sources", async () => {
      const raw = JSON.stringify([record("legacy")]); const reads: string[] = [];
      const storage = { getItem: (key: string) => { reads.push(key); return raw; } };
      const records = readLegacyHistory(storage, "fal-ai-generations");
      assert.deepEqual(reads, ["fal-ai-generations"]);
      assert.equal((await anonymous.list()).length, 0);
      await anonymous.importRecords(records); assert.equal((await anonymous.list()).length, 1);
      await anonymous.remove(["legacy"]); assert.equal(storage.getItem("fal-ai-generations"), raw);
      assert.throws(() => readLegacyHistory({getItem: () => "PRIVATE_MALFORMED_CANARY"}, "venice-generations"), /^Error: Invalid legacy history JSON/);
      assert.throws(() => readLegacyHistory({getItem: () => null}, "venice-generations"), /No history/);
    });
    await t.test("targeted flags/deletes never overwrite unrelated rows or resurrect deletions", async () => {
      const media = record("multi"); media.output.images.push({...media.output.images[0]}); await a.add(media);
      await Promise.all([a.setNsfw("multi", 0, true), a.setNsfw("multi", 1, true)]);
      assert.deepEqual((await a.list()).find(row => row.id === "multi")?.output.has_nsfw_concepts, [true, true]);
      const captured = (await a.list()).map(row => row.id);
      await a.add(record("arrived-later")); await a.remove(captured);
      assert.deepEqual((await a.list()).map(row => row.id), ["arrived-later"]);
      await assert.rejects(a.setNsfw("multi", 0, false), /deleted/);
      assert.equal((await b.list()).length, 3);
    });
    await t.test("quota failures rollback without trimming and local-only retry succeeds", async () => {
      const original = IDBObjectStore.prototype.add;
      let calls = 0;
      const mock = t.mock.method(IDBObjectStore.prototype, "add", function(this: IDBObjectStore, ...args: Parameters<IDBObjectStore["add"]>) {
        if (this.name === "generationRecords" && ++calls === 2) throw new DOMException("private quota canary", "QuotaExceededError");
        return original.apply(this, args);
      });
      try { await assert.rejects(a.importRecords([record("quota-one"), record("quota-two")]), /Nothing was silently trimmed/); }
      finally { mock.mock.restore(); }
      assert.deepEqual((await a.list()).map(row => row.id), ["arrived-later"]);
      await a.add(record("quota-one")); assert.equal((await a.list()).length, 2);
    });
    await t.test("invalid inputs and capacity fail without overwriting anything", async () => {
      assert.throws(() => parseGeneration({...record(), timestamp: Infinity}));
      assert.throws(() => parseGeneration({...record(), parameters: {image: "blob:temporary"}}));
      assert.throws(() => parseGeneration({...record(), output: {...record().output, images: [{...record().output.images[0], url: "javascript:alert(1)"}]}}));
      await assert.rejects(a.importRecords([record("duplicate"), record("duplicate")]), /Duplicate/);
      await assert.rejects(a.importRecords(Array.from({length:2000}, (_,i) => record(`limit-${i}`))), /backup-safe limit/);
      assert.equal((await a.list()).length, 2);
    });
    await t.test("account switches cancel in-flight writes and pending file imports", async () => {
      const pending = a.add(record("late")); aScope.close(); await assert.rejects(pending, /Account changed/);
      const fresh = createGenerationStore(new StorageScope("history-owner"));
      assert.equal((await fresh.list()).length, 2);
      await assert.rejects(a.importRecords([record("late-import")] ), /Account changed/);
      const scope = new StorageScope("closing-import"); const store = createGenerationStore(scope);
      const file = await b.exportArchive(); const preparing = store.prepareImport(file); scope.close();
      await assert.rejects(preparing, /Account changed/);
    });
    assert.equal(fetchMock.mock.callCount(), 0); assert.deepEqual(logs, []);
  } finally { aScope.close(); (await openPrivateDb()).close(); }
});
