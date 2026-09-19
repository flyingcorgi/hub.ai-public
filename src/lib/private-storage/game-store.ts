import { StorageScope, StorageError, resultOf, transact, notifyStorageChanged } from "./database";
import { parseGameSession, parseGameRules, parseGameArchive, MAX_GAME_ARCHIVE_BYTES, MAX_GAME_COLLECTION_BYTES, type GameSession, type GameRules, type GameArchive } from "./game-archive";

type Row = { namespace: string; id: string; revision: string; value: GameSession | GameRules };
export function createGameStore(scope: StorageScope) {
  const revisions = new Map<string, string>();
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(() => { scope.assertActive(); return operation(); });
    queue = result.catch(() => undefined); return result;
  }
  const all = (tx: IDBTransaction) => resultOf(tx.objectStore("gameRecords").index("namespace").getAll(scope.namespace)) as Promise<Row[]>;
  async function capacity(tx: IDBTransaction) {
    const rows = await all(tx);
    if (rows.length > 501 || new TextEncoder().encode(JSON.stringify(rows)).byteLength > MAX_GAME_COLLECTION_BYTES)
      throw new StorageError("Game storage reached its backup-safe limit (64 MiB or 500 sessions). Export and verify a backup before deleting old sessions. Nothing was trimmed.");
  }
  function write(id: string, value: GameSession | GameRules): Promise<void> {
    return enqueue(async () => {
      const revision = crypto.randomUUID();
      await transact(scope, ["gameRecords"], "readwrite", async tx => {
        const store = tx.objectStore("gameRecords"); const old = await resultOf(store.get([scope.namespace,id])) as Row | undefined;
        if (old?.revision !== revisions.get(id)) throw new StorageError("This save changed in another tab. Your changes were not saved. Export your current session, then reload before continuing.");
        await resultOf(store.put({ namespace: scope.namespace, id, revision, value })); await capacity(tx);
      });
      revisions.set(id, revision); notifyStorageChanged();
    });
  }
  const loadSessions = () => enqueue(async () => {
    const rows = await transact(scope, ["gameRecords"], "readonly", all);
    return rows.filter(row => row.id.startsWith("session:")).map(row => {
      revisions.set(row.id, row.revision); return row.value as GameSession;
    }).sort((a,b) => b.updatedAt - a.updatedAt);
  });
  const loadRules = () => enqueue(async () => {
    const row = await transact(scope, ["gameRecords"], "readonly", tx => resultOf(tx.objectStore("gameRecords").get([scope.namespace,"rules"]))) as Row | undefined;
    if (row) revisions.set("rules", row.revision);
    return (row?.value as GameRules | undefined) ?? null;
  });
  async function saveSession(input: unknown) { const value = parseGameSession(input); return write(`session:${value.id}`, value); }
  async function saveRules(input: unknown) { return write("rules", parseGameRules(input)); }
  const deleteSession = (id: string) => enqueue(async () => {
    const key = `session:${id}`;
    await transact(scope, ["gameRecords"], "readwrite", async tx => {
      const store = tx.objectStore("gameRecords"); const old = await resultOf(store.get([scope.namespace,key])) as Row | undefined;
      if (old?.revision !== revisions.get(key)) throw new StorageError("Session changed in another tab. Reload before deleting.");
      await resultOf(store.delete([scope.namespace,key]));
    });
    // Keep the old revision: late saves of a deleted session must conflict, not resurrect it.
    notifyStorageChanged();
  });
  const exportArchive = () => enqueue(async () => {
    const rows = await transact(scope, ["gameRecords"], "readonly", all);
    const archive: GameArchive = { format: "fetishui-game", version: 1, exportedAt: Date.now(),
      sessions: rows.filter(r => r.id.startsWith("session:")).map(r => r.value as GameSession),
      rules: (rows.find(r => r.id === "rules")?.value as GameRules) ?? null };
    return new Blob([JSON.stringify(archive)], { type: "application/json" });
  });
  async function importArchive(file: Blob) {
    scope.assertActive();
    if (file.size > MAX_GAME_ARCHIVE_BYTES) throw new StorageError("Game backups must be at most 96 MiB.");
    let input: unknown;
    try { input = JSON.parse(await file.text()); } catch { throw new StorageError("Invalid backup JSON. Nothing was imported."); }
    const data = parseGameArchive(input);
    return enqueue(async () => {
      const changes = await transact(scope, ["gameRecords"], "readwrite", async tx => {
        const store = tx.objectStore("gameRecords"); let added = 0, skipped = 0;
        const values: [string, GameSession | GameRules][] = data.sessions.map(s => [`session:${s.id}`, s]);
        if (data.rules) values.push(["rules", data.rules]);
        for (const [id, value] of values) {
          const previous = await resultOf(store.get([scope.namespace,id])) as Row | undefined;
          if (previous) {
            if (JSON.stringify(previous.value) !== JSON.stringify(value)) throw new StorageError("Backup conflicts with existing sessions or rules. Nothing was overwritten or imported.");
            skipped++;
          } else { await resultOf(store.add({ namespace: scope.namespace, id, value, revision: crypto.randomUUID() })); added++; }
        }
        await capacity(tx); return { added, skipped };
      }); notifyStorageChanged(); return changes;
    });
  }
  return { loadSessions, loadRules, saveSession, saveRules, deleteSession, exportArchive, importArchive };
}
