// Persists the Scripts tool's current draft (one entry per topic, carrying its brief and
// article through the pipeline) to IndexedDB, in its own database — kept separate from the
// batch/workflow tools' storage so this still-evolving feature can't affect their already-working
// data (same reasoning as hub-workflow-store).
export type PipelineStatus = "idle" | "generating" | "completed" | "failed";

export interface ScriptItem {
  id: string;
  topic: string;
  briefStatus: PipelineStatus;
  brief: string;
  briefError?: string;
  // See @/lib/brief-prompt-templates — a separate saved list from the article one below.
  briefPromptTemplateId?: string;
  // Extra instructions for the next "Regenerate" of this brief specifically — lets a batch of
  // topics share a base prompt template while still nudging individual briefs differently.
  briefRegenerateInstructions?: string;
  articleStatus: PipelineStatus;
  article: string;
  articleError?: string;
  // See @/lib/article-prompt-templates.
  articlePromptTemplateId?: string;
  // Extra instructions appended on top of the article prompt template above, specific to this
  // item (chosen once the brief exists, per-card — there is no batch-wide default).
  articleAppendText?: string;
}

const DB_NAME = "hub-scripts-store";
const STORE_NAME = "kv";
const DRAFT_KEY = "hub-scripts-draft-v1";

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

export async function loadScriptItems(): Promise<ScriptItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(DRAFT_KEY);
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveScriptItems(items: ScriptItem[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(items, DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
