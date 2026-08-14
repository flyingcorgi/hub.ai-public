// Persists the Topic Designer tool's chats, uploaded reference CSV files, and saved topic
// matrix cards to IndexedDB, in its own database — kept separate from the other tools' storage
// (same reasoning as hub-scripts-store) so a bug in one can't corrupt another's data.
export interface TopicChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  // Set on an assistant message that failed to generate — content is empty in that case.
  error?: string;
}

export interface TopicChat {
  id: string;
  title: string;
  // False until the user explicitly renames it — lets the first-message auto-title keep
  // updating without clobbering a name the user chose on purpose.
  titleIsCustom: boolean;
  messages: TopicChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ReferenceCsvFile {
  id: string;
  name: string;
  content: string;
  rowCount: number;
  uploadedAt: number;
}

// The matrix's columns are user-editable (see topic-matrix.ts), so a row is just a bag of cells
// keyed by whatever the current column labels are — not a fixed set of fields. A row created
// under an older schema may be missing keys for newly-added columns (rendered blank) or carry
// keys for columns that were since removed (simply not displayed) — no migration needed.
export type TopicMatrixRow = Record<string, string>;

export type BriefStatus = "idle" | "generating" | "completed" | "failed";

// A row as it lives inside a saved reference card — the parsed matrix cells plus the per-topic
// state needed for the reference list's own actions (generate a brief, send to Scripts).
export interface TopicReferenceRow {
  id: string;
  cells: TopicMatrixRow;
  briefStatus: BriefStatus;
  brief?: string;
  briefError?: string;
  sentToScripts?: boolean;
}

export interface TopicMatrixCard {
  id: string;
  createdAt: number;
  rows: TopicReferenceRow[];
  // The assistant message the rows were parsed from, kept for full-fidelity copy/reference.
  rawText: string;
  collapsed?: boolean;
}

const DB_NAME = "hub-topic-designer-store";
const STORE_NAME = "kv";
const CHATS_KEY = "hub-topic-designer-chats-v1";
const FILES_KEY = "hub-topic-designer-files-v1";
const CARDS_KEY = "hub-topic-designer-cards-v3";

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

async function getValue<T>(key: string, fallback: T): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? fallback);
    req.onerror = () => reject(req.error);
  });
}

async function setValue<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const loadChats = () => getValue<TopicChat[]>(CHATS_KEY, []);
export const saveChats = (chats: TopicChat[]) => setValue(CHATS_KEY, chats);

export const loadReferenceCsvFiles = () => getValue<ReferenceCsvFile[]>(FILES_KEY, []);
export const saveReferenceCsvFiles = (files: ReferenceCsvFile[]) => setValue(FILES_KEY, files);

export const loadMatrixCards = () => getValue<TopicMatrixCard[]>(CARDS_KEY, []);
export const saveMatrixCards = (cards: TopicMatrixCard[]) => setValue(CARDS_KEY, cards);
