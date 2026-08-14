// Reads/writes the same IndexedDB record the batch tool itself uses (see IDB_NAME/IDB_STORE/
// TEMPLATES_STORAGE_KEY in batch-seedream-generator.tsx) so the Templates manager page can list,
// rename, categorize, and delete batch templates without importing that whole (heavy) component.
// Deliberately duplicated rather than shared idb helpers — see the batch tool's own comment on
// why its storage was split into a dedicated database in the first place.
import type { BatchTemplate } from "@/components/batch-seedream/batch-seedream-generator";

export type { BatchTemplate };

const DB_NAME = "seedream-batch-store";
const STORE_NAME = "kv";
const TEMPLATES_KEY = "seedream-batch-templates-v2";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadBatchTemplates(): Promise<BatchTemplate[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(TEMPLATES_KEY);
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBatchTemplates(templates: BatchTemplate[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(templates, TEMPLATES_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
