// Browser-only albums: scoped IndexedDB metadata + image Blobs, never /api/albums requests.
import { Album, AlbumItem, DEFAULT_ALBUMS } from "./types";
import { StorageScope, StorageError, resultOf, transact, notifyStorageChanged, PRIVATE_STORAGE_CHANGED } from "@/lib/private-storage/database";
import { albumSchema, itemSchema, imageDataUrl, imageFromDataUrl, imageHash, validateImage, parseArchive, MAX_ARCHIVE_BYTES, type AlbumArchive, type AlbumItemMetadata } from "@/lib/private-storage/album-archive";

export const ALBUMS_CHANGED_EVENT = PRIVATE_STORAGE_CHANGED;
type StoredAlbum = Album & { namespace: string };
type StoredItem = AlbumItemMetadata & { namespace: string; blob: Blob; sha256: string };
const albumDTO = ({ namespace: _namespace, ...album }: StoredAlbum): Album => album;
const metadata = ({ namespace: _namespace, blob: _blob, sha256: _hash, ...item }: StoredItem): AlbumItemMetadata => item;
const rows = <T>(tx: IDBTransaction, store: string, namespace: string) => resultOf(tx.objectStore(store).index("namespace").getAll(namespace)) as Promise<T[]>;
function checkedAlbum(value: unknown): Album {
  const parsed = albumSchema.safeParse(value);
  if (!parsed.success) throw new StorageError("Album name is required and must be at most 120 characters.");
  return parsed.data;
}
function checkedItem(value: unknown): AlbumItemMetadata {
  const parsed = itemSchema.safeParse(value);
  if (!parsed.success) throw new StorageError("Image details are invalid or too long. Nothing was saved.");
  return parsed.data;
}
const defaultAlbum = (id: string) => DEFAULT_ALBUMS.find(a => a.id === id);
function checkDefault(album: Album) {
  const expected = defaultAlbum(album.id);
  if ((album.isDefault || expected) && JSON.stringify(album) !== JSON.stringify(expected)) throw new StorageError("Default albums cannot be renamed, replaced or deleted.");
}
// Keep every accepted collection recoverable by the bounded JSON exporter. This conservative
// serialized-size cap includes metadata/base64 overhead, not merely raw Blob bytes.
async function enforceBackupCapacity(tx: IDBTransaction, namespace: string) {
  const albums = await rows<StoredAlbum>(tx, "albums", namespace);
  const items = await rows<StoredItem>(tx, "albumItems", namespace);
  const textBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const estimated = 4096 + albums.reduce((n,a) => n + textBytes(albumDTO(a)) + 2, 0) +
    items.reduce((n,i) => n + Math.ceil(i.blob.size / 3) * 4 + textBytes(metadata(i)) + 200, 0);
  if (albums.length > 1997 || items.length > 10000 || estimated > 96 * 1024 * 1024) {
    throw new StorageError("This browser album collection reached its backup-safe limit (96 MiB encoded, 2,000 albums or 10,000 images). Export and verify a backup before removing items. Nothing was silently trimmed.");
  }
}
// Methods close over a stable scope. An old generation/picker/import callback cannot save into
// whichever account happens to be current later; closed handles reject instead.
export function createAlbumStore(scope: StorageScope) {
  const namespace = scope.namespace;
  const view = (row: StoredItem): AlbumItem => ({ ...metadata(row), url: scope.imageUrl(row.id, row.blob) });
  async function loadAlbums(): Promise<Album[]> {
    const custom = await transact(scope, ["albums"], "readonly", tx => rows<StoredAlbum>(tx, "albums", namespace));
    return [...DEFAULT_ALBUMS.map(a => ({ ...a })), ...custom.map(albumDTO).sort((a,b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))];
  }
  async function loadAlbumItems(albumId?: string): Promise<AlbumItem[]> {
    const items = await transact(scope, ["albumItems"], "readonly", tx => albumId
      ? resultOf(tx.objectStore("albumItems").index("album").getAll([namespace, albumId])) as Promise<StoredItem[]>
      : rows<StoredItem>(tx, "albumItems", namespace));
    return items.sort((a,b) => b.addedAt - a.addedAt || a.id.localeCompare(b.id)).map(view);
  }
  async function createAlbum(name: string): Promise<Album> {
    const album = checkedAlbum({ id: crypto.randomUUID(), name, isDefault: false, createdAt: Date.now() });
    await transact(scope, ["albums", "albumItems"], "readwrite", async tx => {
      await resultOf(tx.objectStore("albums").add({ ...album, namespace })); await enforceBackupCapacity(tx, namespace);
    });
    notifyStorageChanged(); return album;
  }
  async function renameAlbum(id: string, name: string): Promise<void> {
    if (defaultAlbum(id)) throw new StorageError("Default albums cannot be renamed.");
    await transact(scope, ["albums", "albumItems"], "readwrite", async tx => {
      const store = tx.objectStore("albums"); const row = await resultOf(store.get([namespace,id])) as StoredAlbum | undefined;
      if (!row) throw new StorageError("Album not found in this account.");
      await resultOf(store.put({ ...checkedAlbum({ ...albumDTO(row), name }), namespace }));
      await enforceBackupCapacity(tx, namespace);
    }); notifyStorageChanged();
  }
  async function deleteAlbum(id: string): Promise<void> {
    if (defaultAlbum(id)) throw new StorageError("Default albums cannot be deleted.");
    const removed = await transact(scope, ["albums", "albumItems"], "readwrite", async tx => {
      const albums = tx.objectStore("albums"), items = tx.objectStore("albumItems");
      const keys = await resultOf(items.index("album").getAllKeys([namespace,id]));
      for (const key of keys) await resultOf(items.delete(key));
      await resultOf(albums.delete([namespace,id])); return keys;
    });
    for (const key of removed) scope.revoke((key as string[])[1]); notifyStorageChanged();
  }
  async function saveImageToAlbum(albumId: string, source: string | Blob, meta?: { prompt?: string; modelName?: string; name?: string }): Promise<AlbumItem> {
    scope.assertActive();
    // Never proxy a remote URL through the backend to save it. Remote results must first be
    // downloaded by the user, then selected with the local file picker (avoids CORS/SSRF fallback).
    if (typeof source === "string" && !source.startsWith("data:")) throw new StorageError("Download this image to your device, then add the file from its album page. Remote/local URLs are never fetched by the app server for storage.");
    const blob = typeof source === "string" ? await imageFromDataUrl(source) : source;
    await validateImage(blob);
    const sha256 = await imageHash(blob);
    const row: StoredItem = { ...checkedItem({ id: crypto.randomUUID(), albumId, contentType: blob.type, addedAt: Date.now(), ...meta }), namespace, blob, sha256 };
    await transact(scope, ["albums", "albumItems"], "readwrite", async tx => {
      if (!defaultAlbum(albumId) && !await resultOf(tx.objectStore("albums").get([namespace,albumId]))) throw new StorageError("Album not found in this account.");
      await resultOf(tx.objectStore("albumItems").add(row));
      await enforceBackupCapacity(tx, namespace);
    }); notifyStorageChanged(); return view(row);
  }
  async function patchItem(id: string, patch: { tags?: string[]; name?: string }): Promise<AlbumItem> {
    const row = await transact(scope, ["albums", "albumItems"], "readwrite", async tx => {
      const store = tx.objectStore("albumItems"); const previous = await resultOf(store.get([namespace,id])) as StoredItem | undefined;
      if (!previous) throw new StorageError("Image not found in this account.");
      const next = { ...previous, ...checkedItem({ ...metadata(previous), ...patch }) };
      await resultOf(store.put(next)); await enforceBackupCapacity(tx, namespace); return next;
    }); notifyStorageChanged(); return view(row);
  }
  async function deleteAlbumItem(id: string): Promise<void> {
    await transact(scope, ["albumItems"], "readwrite", async tx => { await resultOf(tx.objectStore("albumItems").delete([namespace,id])); });
    scope.revoke(id); notifyStorageChanged();
  }
  async function getImageDataUrl(id: string): Promise<string> {
    const row = await transact(scope, ["albumItems"], "readonly", tx => resultOf(tx.objectStore("albumItems").get([namespace,id]))) as StoredItem | undefined;
    if (!row) throw new StorageError("Image not found in this account.");
    const url = await imageDataUrl(row.blob); scope.assertActive(); return url;
  }
  async function exportArchive(): Promise<Blob> {
    const snapshot = await transact(scope, ["albums", "albumItems"], "readonly", async tx => ({
      albums: await rows<StoredAlbum>(tx, "albums", namespace), items: await rows<StoredItem>(tx, "albumItems", namespace),
    }));
    if (snapshot.items.reduce((size, row) => size + row.blob.size * 4 / 3, 0) > MAX_ARCHIVE_BYTES - 1024 * 1024) throw new StorageError("This collection exceeds the 128 MiB backup limit. Download images individually before splitting the collection.");
    const items: AlbumArchive["items"] = [];
    for (const row of snapshot.items) {
      await validateImage(row.blob);
      const hash = await imageHash(row.blob);
      if (hash !== row.sha256) throw new StorageError("Stored image verification failed. Preserve existing backups and contact support.");
      items.push({ ...metadata(row), sha256: hash, dataUrl: await imageDataUrl(row.blob) });
    }
    const archive: AlbumArchive = { format: "fetishui-albums", version: 1, exportedAt: Date.now(), albums: [...DEFAULT_ALBUMS, ...snapshot.albums.map(albumDTO)], items };
    const blob = new Blob([JSON.stringify(archive)], { type: "application/json" });
    if (blob.size > MAX_ARCHIVE_BYTES) throw new StorageError("This backup exceeds the 128 MiB limit. Nothing was removed.");
    scope.assertActive(); return blob;
  }
  async function importArchive(file: Blob): Promise<{ added: number; skipped: number }> {
    scope.assertActive();
    if (file.size > MAX_ARCHIVE_BYTES) throw new StorageError("Backups must be at most 128 MiB.");
    let input: unknown;
    try { input = JSON.parse(await file.text()); } catch { throw new StorageError("Invalid album backup JSON. No changes were imported."); }
    const archive = parseArchive(input);
    for (const album of archive.albums) checkDefault(album);
    const prepared: StoredItem[] = [];
    for (const item of archive.items) {
      scope.assertActive();
      const { dataUrl, sha256, ...meta } = item;
      const blob = await imageFromDataUrl(dataUrl);
      if (blob.type !== meta.contentType || await imageHash(blob) !== sha256) throw new StorageError("Backup image checksum/type mismatch. No changes were imported.");
      prepared.push({ ...meta, namespace, blob, sha256 });
    }
    const result = await transact(scope, ["albums", "albumItems"], "readwrite", async tx => {
      let added = 0, skipped = 0;
      for (const album of archive.albums.filter(a => !a.isDefault)) {
        const store = tx.objectStore("albums"), previous = await resultOf(store.get([namespace,album.id])) as StoredAlbum | undefined;
        if (previous && JSON.stringify(albumDTO(previous)) !== JSON.stringify(album)) throw new StorageError("Backup conflicts with an existing album. Nothing was overwritten or imported.");
        if (!previous) await resultOf(store.add({ ...album, namespace }));
      }
      for (const row of prepared) {
        const store = tx.objectStore("albumItems"), previous = await resultOf(store.get([namespace,row.id])) as StoredItem | undefined;
        if (previous) {
          if (previous.sha256 !== row.sha256 || JSON.stringify(metadata(previous)) !== JSON.stringify(metadata(row))) throw new StorageError("Backup conflicts with an existing image. Nothing was overwritten or imported.");
          skipped++;
        } else { await resultOf(store.add(row)); added++; }
      }
      await enforceBackupCapacity(tx, namespace);
      return { added, skipped };
    }); notifyStorageChanged(); return result;
  }
  return { loadAlbums, loadAlbumItems, createAlbum, renameAlbum, deleteAlbum, saveImageToAlbum,
    patchAlbumItemTags: (id: string, tags: string[]) => patchItem(id, { tags: [...new Set(tags)] }),
    patchAlbumItemName: (id: string, name: string) => patchItem(id, { name }),
    deleteAlbumItem, getImageDataUrl, exportArchive, importArchive };
}
