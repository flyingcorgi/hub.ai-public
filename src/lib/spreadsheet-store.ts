// Persists the Spreadsheet tool's grid to IndexedDB, in its own database — kept separate from
// the other tools' storage (same reasoning as hub-scripts-store) so a bug in one can't corrupt
// another's data. The grid itself is just rows of plain text cells — no formulas, no types.
export const DEFAULT_ROWS = 20;
export const DEFAULT_COLS = 10;

export function createEmptyGrid(rows = DEFAULT_ROWS, cols = DEFAULT_COLS): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

const DB_NAME = "hub-spreadsheet-store";
const STORE_NAME = "kv";
const GRID_KEY = "hub-spreadsheet-grid-v1";

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

export async function loadGrid(): Promise<string[][]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(GRID_KEY);
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : createEmptyGrid());
    req.onerror = () => reject(req.error);
  });
}

export async function saveGrid(grid: string[][]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(grid, GRID_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
