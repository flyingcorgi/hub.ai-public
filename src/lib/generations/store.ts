import { z } from "zod";
import type { Generation } from "@/lib/types";
import { StorageScope, StorageError, resultOf, transact, notifyStorageChanged } from "@/lib/private-storage/database";

export const LEGACY_HISTORY_KEYS = ["venice-generations", "fal-ai-generations"] as const;
export const MAX_HISTORY_BYTES = 96 * 1024 * 1024;
const MAX_RECORDS = 2000;
const mediaUrl = z.string().max(MAX_HISTORY_BYTES).refine(value => {
  if (/^data:(image\/(png|jpeg|webp|gif)|video\/(mp4|webm));base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
});
const schema = z.object({
  id: z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/),
  modelId: z.string().min(1).max(300), modelName: z.string().max(300), prompt: z.string().max(100000),
  parameters: z.record(z.unknown()),
  output: z.object({
    images: z.array(z.object({ url: mediaUrl, width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative(),
      content_type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"]) }).strict()).min(1).max(100),
    timings: z.record(z.unknown()), seed: z.number().finite(), has_nsfw_concepts: z.array(z.boolean()).max(100),
  }).strict(), timestamp: z.number().int().min(0).max(8640000000000000),
}).strict();
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function checkJson(value: unknown, depth = 0): void {
  if (depth > 24) throw new StorageError("History data is too deeply nested.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (/^(blob:|file:|\/api\/album-media\/)/i.test(value)) throw new StorageError("Temporary/local media links cannot be saved. Use embedded media data instead.");
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const child of value) checkJson(child, depth + 1); return; }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new StorageError("Unsupported history data.");
      if (child !== undefined) checkJson(child, depth + 1);
    }
    return;
  }
  throw new StorageError("Unsupported history data.");
}
export function parseGeneration(value: unknown): Generation {
  checkJson(value);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StorageError("Invalid history record. Nothing was saved or imported.");
  if (bytes(parsed.data) > MAX_HISTORY_BYTES) throw new StorageError("History record exceeds the 96 MiB backup-safe limit. Nothing was trimmed.");
  return JSON.parse(JSON.stringify(parsed.data)); // Capture mutable input before any awaits.
}
function checkCapacity(records: Generation[]) {
  if (records.length > MAX_RECORDS || bytes(records) > MAX_HISTORY_BYTES)
    throw new StorageError("History reached its backup-safe limit (96 MiB or 2,000 records). Export a backup before deleting records. Nothing was trimmed.");
}
function parseRecords(value: unknown): Generation[] {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) throw new StorageError("Invalid or oversized history collection.");
  const records = value.map(parseGeneration);
  if (new Set(records.map(r => r.id)).size !== records.length) throw new StorageError("Duplicate history IDs. Nothing was imported.");
  checkCapacity(records); return records;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
async function checksum(records: Generation[]) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(records)));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}
export function readLegacyHistory(storage: Pick<Storage, "getItem">, key: typeof LEGACY_HISTORY_KEYS[number]): Generation[] {
  if (!LEGACY_HISTORY_KEYS.includes(key)) throw new StorageError("Unsupported legacy history source.");
  let raw: string | null;
  try { raw = storage.getItem(key); } catch { throw new StorageError("Cannot read legacy browser history. No source data was changed."); }
  if (raw === null) throw new StorageError("No history found under that legacy key.");
  if (new TextEncoder().encode(raw).byteLength > MAX_HISTORY_BYTES) throw new StorageError("Legacy history is too large. No source data was changed.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new StorageError("Invalid legacy history JSON. No source data was changed."); }
  return parseRecords(value);
}
type Row = { namespace: string; id: string; value: Generation };
export function createGenerationStore(scope: StorageScope) {
  const all = async (tx: IDBTransaction) => (await resultOf(tx.objectStore("generationRecords").index("namespace").getAll(scope.namespace)) as Row[]).map(row => row.value);
  const list = () => transact(scope, ["generationRecords"], "readonly", all).then(rows => rows.sort((a,b) => b.timestamp - a.timestamp));
  async function importRecords(input: unknown) {
    scope.assertActive(); const records = parseRecords(input);
    const added = await transact(scope, ["generationRecords"], "readwrite", async tx => {
      const store = tx.objectStore("generationRecords"); let count = 0;
      for (const value of records) {
        const old = await resultOf(store.get([scope.namespace, value.id])) as Row | undefined;
        if (old) {
          if (canonical(old.value) !== canonical(value)) throw new StorageError("History ID conflict. Nothing was overwritten or imported.");
        } else { await resultOf(store.add({ namespace: scope.namespace, id: value.id, value })); count++; }
      }
      checkCapacity(await all(tx)); return count;
    });
    notifyStorageChanged(); return added;
  }
  async function remove(ids: string[]) {
    await transact(scope, ["generationRecords"], "readwrite", async tx => {
      for (const id of ids) await resultOf(tx.objectStore("generationRecords").delete([scope.namespace, id]));
    }); notifyStorageChanged();
  }
  async function setNsfw(id: string, index: number, flag: boolean) {
    await transact(scope, ["generationRecords"], "readwrite", async tx => {
      const store = tx.objectStore("generationRecords"); const row = await resultOf(store.get([scope.namespace,id])) as Row | undefined;
      if (!row) throw new StorageError("This generation was deleted in another tab. Reload history.");
      if (!Number.isInteger(index) || index < 0 || index >= row.value.output.images.length) throw new StorageError("Invalid image selection.");
      row.value.output.has_nsfw_concepts = row.value.output.images.map((_, i) => i === index ? flag : (row.value.output.has_nsfw_concepts[i] ?? false));
      await resultOf(store.put(row)); checkCapacity(await all(tx));
    }); notifyStorageChanged();
  }
  async function exportArchive() {
    const records = parseRecords(await list()); const sha256 = await checksum(records); scope.assertActive();
    return new Blob([JSON.stringify({ format: "fetishui-history", version: 1, records, sha256 })], { type: "application/json" });
  }
  async function prepareImport(file: Blob) {
    scope.assertActive();
    if (file.size > MAX_HISTORY_BYTES + 4096) throw new StorageError("History backup is too large.");
    let value: unknown;
    try { value = JSON.parse(await file.text()); } catch { throw new StorageError("Invalid history backup JSON."); }
    const envelope = z.object({ format: z.literal("fetishui-history"), version: z.literal(1), records: z.unknown(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(value);
    if (!envelope.success) throw new StorageError("Invalid or unsupported history backup.");
    const records = parseRecords(envelope.data.records);
    if (await checksum(records) !== envelope.data.sha256) throw new StorageError("History backup checksum mismatch. Nothing was imported.");
    scope.assertActive(); return records;
  }
  return { namespace: scope.namespace, assertActive: () => scope.assertActive(), list,
    add: (value: Generation) => importRecords([value]), importRecords, remove, setNsfw, exportArchive, prepareImport };
}
