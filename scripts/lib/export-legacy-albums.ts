// Operator-only read/export. This module is never imported by the web application.
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_ALBUMS } from "../../src/lib/albums/types";
import { albumSchema, itemSchema, imageHash, imageDataUrl, validateImage, parseArchive, MAX_ARCHIVE_BYTES, MAX_IMAGE_BYTES, type AlbumArchive } from "../../src/lib/private-storage/album-archive";

async function boundedFile(file: string, maxBytes: number) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) throw new Error("Unsupported source file");
  const bytes = await readFile(file);
  if (bytes.length > maxBytes) throw new Error("Oversized source file");
  return bytes;
}
export async function exportLegacyAlbums(sourceDirectory: string, outputFile: string): Promise<{ images: number; bytes: number }> {
  const source = await realpath(sourceDirectory);
  const output = path.resolve(outputFile);
  // No output inside the source directory, and no overwrite of any existing file.
  const outputParent = await realpath(path.dirname(output));
  const relative = path.relative(source, outputParent);
  if (relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Choose an output outside the source directory");
  const rawAlbums: unknown = JSON.parse((await boundedFile(path.join(source, "albums.json"), MAX_ARCHIVE_BYTES)).toString("utf8"));
  const rawItems: unknown = JSON.parse((await boundedFile(path.join(source, "album-items.json"), MAX_ARCHIVE_BYTES)).toString("utf8"));
  if (!Array.isArray(rawAlbums) || !Array.isArray(rawItems)) throw new Error("Invalid source arrays");
  const albums = rawAlbums.map(value => albumSchema.parse(value));
  for (const defaultAlbum of DEFAULT_ALBUMS) {
    const found = albums.find(a => a.id === defaultAlbum.id);
    if (found && JSON.stringify(found) !== JSON.stringify(defaultAlbum)) throw new Error("Default album mismatch");
    if (!found) albums.push({ ...defaultAlbum });
  }
  const mediaPath = path.join(source, "album-media");
  if ((await lstat(mediaPath)).isSymbolicLink()) throw new Error("Media directory must not be a symlink");
  const items: AlbumArchive["items"] = [];
  let estimatedSize = 0;
  for (const value of rawItems) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid source item");
    const { url, ...rawMeta } = value as Record<string, unknown>;
    if (typeof url !== "string") throw new Error("Missing local media URL");
    const match = /^\/api\/album-media\/([a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp|gif))$/.exec(url);
    if (!match) throw new Error("Only existing local raster media may be exported; no URLs or traversal");
    const meta = itemSchema.parse(rawMeta);
    const bytes = await boundedFile(path.join(mediaPath, match[1]), MAX_IMAGE_BYTES);
    estimatedSize += bytes.length * 4 / 3;
    if (estimatedSize > MAX_ARCHIVE_BYTES - 1024 * 1024) throw new Error("Export too large");
    const blob = new Blob([new Uint8Array(bytes)], { type: meta.contentType });
    await validateImage(blob);
    items.push({ ...meta, sha256: await imageHash(blob), dataUrl: await imageDataUrl(blob) });
  }
  const archive = parseArchive({ format: "fetishui-albums", version: 1, exportedAt: Date.now(), albums, items });
  const json = JSON.stringify(archive);
  if (Buffer.byteLength(json) > MAX_ARCHIVE_BYTES) throw new Error("Export too large");
  await writeFile(output, json, { flag: "wx", mode: 0o600 });
  return { images: items.length, bytes: Buffer.byteLength(json) };
}
