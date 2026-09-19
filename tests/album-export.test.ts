import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, readdir, stat, symlink, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exportLegacyAlbums } from "../scripts/lib/export-legacy-albums";
import { parseArchive, imageFromDataUrl, imageHash } from "../src/lib/private-storage/album-archive";
import { DEFAULT_ALBUMS } from "../src/lib/albums/types";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";
test("operator-only album export preserves sources, verifies bytes, and refuses URLs/traversal/symlinks/overwrites", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fetishui-album-export-"));
  const source = path.join(root, "data"), output = path.join(root, "backup.json");
  const calls: unknown[] = [];
  for (const method of ["log", "warn", "error", "info", "debug"] as const) t.mock.method(console, method, (...args: unknown[]) => { calls.push(args); });
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("No network permitted"); });
  try {
    await mkdir(path.join(source, "album-media"), { recursive: true });
    const item = { id: "one", albumId: DEFAULT_ALBUMS[0].id, contentType: "image/png", addedAt: 1, url: "/api/album-media/one.png", name: "SYNTHETIC_PRIVATE_NAME" };
    const albums = JSON.stringify(DEFAULT_ALBUMS), items = JSON.stringify([item]);
    await writeFile(path.join(source, "albums.json"), albums);
    await writeFile(path.join(source, "album-items.json"), items);
    await writeFile(path.join(source, "album-media/one.png"), Buffer.from(png, "base64"));
    assert.equal((await exportLegacyAlbums(source, output)).images, 1);
    const archive = parseArchive(JSON.parse(await readFile(output, "utf8")));
    assert.equal(archive.items[0].dataUrl, `data:image/png;base64,${png}`);
    assert.equal(archive.items[0].sha256, await imageHash(await imageFromDataUrl(archive.items[0].dataUrl)));
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.equal(await readFile(path.join(source, "albums.json"), "utf8"), albums);
    assert.equal(await readFile(path.join(source, "album-items.json"), "utf8"), items);
    await assert.rejects(exportLegacyAlbums(source, output));
    await assert.rejects(exportLegacyAlbums(source, path.join(source, "overwrite.json")));
    for (const url of ["https://example.test/image.png", "/api/album-media/../albums.json", "/api/album-media/linked.png"]) {
      if (url.endsWith("linked.png")) await symlink(path.join(source, "album-media/one.png"), path.join(source, "album-media/linked.png"));
      await writeFile(path.join(source, "album-items.json"), JSON.stringify([{ ...item, url }]));
      await assert.rejects(exportLegacyAlbums(source, path.join(root, "bad.json")));
    }
    assert.ok(!(await readdir(root)).includes("bad.json"));
    assert.equal(network.mock.callCount(), 0); assert.deepEqual(calls, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
