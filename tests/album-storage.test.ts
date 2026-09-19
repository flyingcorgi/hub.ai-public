import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBObjectStore } from "fake-indexeddb";
import { createAlbumStore } from "../src/lib/albums/store";
import { DEFAULT_ALBUMS } from "../src/lib/albums/types";
import { StorageScope, openPrivateDb, resultOf, transact, PRIVATE_DB_VERSION } from "../src/lib/private-storage/database";
import { imageHash, imageFromDataUrl, type AlbumArchive } from "../src/lib/private-storage/album-archive";

// A synthetic 1px PNG only. No operator content, provider traffic, or real browser storage.
export const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";
const backup = (value: unknown) => new Blob([JSON.stringify(value)], { type: "application/json" });
test("browser album transactions, recovery and account namespaces", async t => {
  const calls: unknown[] = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network request"); });
  for (const method of ["log", "warn", "error", "info", "debug"] as const) t.mock.method(console, method, (...args: unknown[]) => { calls.push(args); });
  const owner = new StorageScope("owner"), other = new StorageScope("other"), anonymous = new StorageScope(null);
  const a = createAlbumStore(owner), b = createAlbumStore(other), device = createAlbumStore(anonymous);
  let exported: AlbumArchive;
  try {
    await t.test("versioned stores hold image Blobs, not display URLs or shared account records", async () => {
      assert.equal((await openPrivateDb()).version, PRIVATE_DB_VERSION);
      assert.deepEqual(await a.loadAlbums(), DEFAULT_ALBUMS);
      const album = await a.createAlbum("Private album");
      const image = await a.saveImageToAlbum(album.id, png, { name: "PRIVATE_IMAGE_CANARY", prompt: "PRIVATE_PROMPT_CANARY" });
      assert.ok(image.url.startsWith("blob:"));
      assert.equal(await a.getImageDataUrl(image.id), png);
      const raw = await transact(owner, ["albumItems"], "readonly", tx => resultOf(tx.objectStore("albumItems").get([owner.namespace,image.id])));
      assert.ok(raw.blob instanceof Blob); assert.equal(raw.url, undefined);
      assert.equal(raw.sha256, await imageHash(raw.blob));
      assert.deepEqual(await b.loadAlbumItems(), []); assert.deepEqual(await device.loadAlbumItems(), []);
      assert.equal((await b.loadAlbums()).length, DEFAULT_ALBUMS.length);
      await assert.rejects(b.getImageDataUrl(image.id), /not found/);
      await assert.rejects(b.saveImageToAlbum(album.id, png), /not found/);
      await a.patchAlbumItemTags(image.id, ["face", "face"]);
      await a.patchAlbumItemName(image.id, "Renamed image");
      assert.deepEqual((await a.loadAlbumItems(album.id))[0].tags, ["face"]);
      exported = JSON.parse(await (await a.exportArchive()).text());
      assert.equal(exported.items[0].name, "Renamed image"); assert.equal(exported.items[0].dataUrl, png);
      assert.ok(!JSON.stringify(exported).includes('"namespace"')); assert.ok(!JSON.stringify(exported).includes("blob:"));
    });
    await t.test("explicit backup import copies only into the selected account and repeated import skips matching records", async () => {
      assert.deepEqual(await b.importArchive(backup(exported)), { added: 1, skipped: 0 });
      assert.deepEqual(await b.importArchive(backup(exported)), { added: 0, skipped: 1 });
      assert.equal((await b.loadAlbumItems()).length, 1); assert.deepEqual(await device.loadAlbumItems(), []);
      const reload = createAlbumStore(new StorageScope("other"));
      assert.equal(await reload.getImageDataUrl(exported.items[0].id), png);
    });
    await t.test("corruption, unsupported schemas, remote URLs, missing albums and default changes abort import", async () => {
      for (const value of [
        { ...exported, version: 2 },
        { ...exported, namespace: "account:owner" },
        { ...exported, items: [{ ...exported.items[0], sha256: "0".repeat(64) }] },
        { ...exported, items: [{ ...exported.items[0], dataUrl: "https://private.example/image.png" }] },
        { ...exported, items: [exported.items[0], exported.items[0]] },
        { ...exported, albums: [] },
        { ...exported, albums: exported.albums.map((album,i) => i === 0 ? { ...album, name: "Changed default" } : album) },
      ]) await assert.rejects(device.importArchive(backup(value)));
      assert.deepEqual(await device.loadAlbumItems(), []); assert.deepEqual(await device.loadAlbums(), DEFAULT_ALBUMS);
      for (const url of ["/api/album-media/private.png", "https://example.test/image.png", "blob:private", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="])
        await assert.rejects(a.saveImageToAlbum(DEFAULT_ALBUMS[0].id, url));
    });
    await t.test("conflicts and quota errors roll back all writes without trimming existing images", async () => {
      const conflicting = { ...exported, albums: [...exported.albums, { id: "rollback-album", name: "Not committed", isDefault: false, createdAt: 1 }],
        items: [{ ...exported.items[0], id: "rollback-image", albumId: "rollback-album" }, { ...exported.items[0], name: "Conflict" }] };
      await assert.rejects(b.importArchive(backup(conflicting)), /conflict/);
      assert.ok(!(await b.loadAlbums()).some(album => album.id === "rollback-album"));
      assert.equal((await b.loadAlbumItems()).length, 1);
      const original = IDBObjectStore.prototype.add;
      const fault = t.mock.method(IDBObjectStore.prototype, "add", function(this: IDBObjectStore, ...args: Parameters<typeof original>) {
        if (this.name === "albumItems") throw new DOMException("PRIVATE_ERROR_CANARY", "QuotaExceededError");
        return original.apply(this, args);
      });
      await assert.rejects(device.importArchive(backup(exported)), /storage is full/);
      fault.mock.restore();
      assert.deepEqual(await device.loadAlbums(), DEFAULT_ALBUMS); assert.deepEqual(await device.loadAlbumItems(), []);
      assert.equal((await a.loadAlbumItems()).length, 1);
    });
    await t.test("simultaneous saves do not replace each other; deletes cascade only inside the owner namespace", async () => {
      const second = createAlbumStore(new StorageScope("owner"));
      const album = await a.createAlbum("Concurrent");
      await Promise.all([a.saveImageToAlbum(album.id, png), second.saveImageToAlbum(album.id, png)]);
      assert.equal((await a.loadAlbumItems(album.id)).length, 2);
      await a.deleteAlbum(album.id); assert.deepEqual(await a.loadAlbumItems(album.id), []);
      assert.equal((await b.loadAlbumItems()).length, 1);
      await assert.rejects(a.deleteAlbum(DEFAULT_ALBUMS[0].id));
      await assert.rejects(a.renameAlbum(DEFAULT_ALBUMS[0].id, "Changed"));
    });
    await t.test("account-switch closure aborts transactions and late async saves instead of selecting the new account", async () => {
      const stale = new StorageScope("stale"), store = createAlbumStore(stale);
      const blob = await imageFromDataUrl(png);
      const pending = store.saveImageToAlbum(DEFAULT_ALBUMS[0].id, blob);
      stale.close(); await assert.rejects(pending, /Account changed/);
      assert.deepEqual(await createAlbumStore(new StorageScope("stale")).loadAlbumItems(), []);
      const transactionScope = new StorageScope("transaction");
      await assert.rejects(transact(transactionScope, ["albums"], "readwrite", async tx => {
        await resultOf(tx.objectStore("albums").add({ ...DEFAULT_ALBUMS[0], id: "abort", namespace: transactionScope.namespace }));
        transactionScope.close();
      }));
      assert.deepEqual(await createAlbumStore(new StorageScope("transaction")).loadAlbums(), DEFAULT_ALBUMS);
      const revoke = t.mock.method(URL, "revokeObjectURL");
      owner.close(); assert.ok(revoke.mock.callCount() > 0);
      await assert.rejects(a.exportArchive(), /Account changed/);
    });
    assert.equal(fetchMock.mock.callCount(), 0); assert.deepEqual(calls, []);
  } finally { owner.close(); other.close(); anonymous.close(); (await openPrivateDb()).close(); }
});
