// Browser-only personal storage. No server import, network fallback, or localStorage truncation.
export const PRIVATE_DB_NAME = "fetishui-private";
export const PRIVATE_DB_VERSION = 3;
export const PRIVATE_STORAGE_CHANGED = "hub-private-storage-changed";
export class StorageError extends Error {}
export function storageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (error instanceof Error && error.name === "QuotaExceededError") return new StorageError("Browser storage is full. Export a backup and free space, then retry. Nothing was silently trimmed.");
  return new StorageError("Browser storage is unavailable. Enable site storage or free space, then retry. No server fallback was used.");
}

// Every async operation captures this handle, never a mutable global 'current account'.
// Closing a scope aborts active writes and revokes its display URLs on account change/logout.
export class StorageScope {
  readonly namespace: string;
  private active = true;
  private transactions = new Set<IDBTransaction>();
  private urls = new Map<string, string>();
  constructor(userId: string | null) { this.namespace = userId === null ? "device:anonymous" : `account:${userId}`; }
  assertActive() { if (!this.active) throw new StorageError("Account changed. Reopen this screen before saving or importing."); }
  track(tx: IDBTransaction) { this.assertActive(); this.transactions.add(tx); }
  untrack(tx: IDBTransaction) { this.transactions.delete(tx); }
  imageUrl(id: string, blob: Blob) {
    this.assertActive();
    let url = this.urls.get(id);
    if (!url) { url = URL.createObjectURL(blob); this.urls.set(id, url); }
    return url;
  }
  revoke(id: string) { const url = this.urls.get(id); if (url) URL.revokeObjectURL(url); this.urls.delete(id); }
  close() {
    this.active = false;
    for (const tx of this.transactions) { try { tx.abort(); } catch { /* already committed */ } }
    this.transactions.clear();
    for (const id of this.urls.keys()) this.revoke(id);
  }
}
let opening: Promise<IDBDatabase> | undefined;
export function openPrivateDb(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false;
    const fail = () => { failed = true; opening = undefined; reject(new StorageError("Could not open browser storage. Close other app tabs and enable site storage, then retry.")); };
    const request = indexedDB.open(PRIVATE_DB_NAME, PRIVATE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["albums", "albumItems", "gameRecords", "generationRecords"] as const) {
        if (db.objectStoreNames.contains(name)) continue; // Preserve existing album/game stores during upgrades.
        const store = db.createObjectStore(name, { keyPath: ["namespace", "id"] });
        store.createIndex("namespace", "namespace");
        if (name === "albumItems") store.createIndex("album", ["namespace", "albumId"]);
      }
    };
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      const db = request.result;
      if (failed) { db.close(); return; }
      db.onversionchange = () => { db.close(); opening = undefined; };
      db.onclose = () => { opening = undefined; };
      resolve(db);
    };
  }).catch(error => { opening = undefined; throw storageError(error); });
  return opening;
}
export const resultOf = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function transact<T>(scope: StorageScope, stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  try {
    scope.assertActive();
    const db = await openPrivateDb(); scope.assertActive();
    const tx = db.transaction(stores, mode); scope.track(tx);
    const complete = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => { scope.untrack(tx); resolve(); };
      tx.onabort = () => { scope.untrack(tx); reject(tx.error ?? new StorageError("Storage operation cancelled. No partial changes were saved.")); };
      tx.onerror = () => { /* the transaction abort handler reports the failure */ };
    });
    void complete.catch(() => undefined);
    try {
      // Only IndexedDB promises inside work: files/hash/decode must be prepared before opening tx.
      const result = await work(tx); await complete; scope.assertActive(); return result;
    } catch (error) {
      try { tx.abort(); } catch { /* already completed */ }
      await complete.catch(() => undefined); throw error;
    }
  } catch (error) { throw storageError(error); }
}
export function notifyStorageChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PRIVATE_STORAGE_CHANGED));
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(PRIVATE_STORAGE_CHANGED); channel.postMessage("changed"); channel.close();
  }
}
