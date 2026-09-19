'use client';

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGenerationStore } from "@/components/albums/album-storage-provider";
import { LEGACY_HISTORY_KEYS, readLegacyHistory } from "@/lib/generations/store";
import { storageError } from "@/lib/private-storage/database";
import type { Generation } from "@/lib/types";

export function HistoryBackupControls() {
  const store = useGenerationStore();
  const [pending, setPending] = useState<Generation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setMessage(null);
    try { store.assertActive(); await work(); } catch (cause) { setError(storageError(cause).message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="rounded-lg border p-4 space-y-3" aria-label="History backup and import">
    <p className="text-sm">History stays in this browser, separately for each account. Destination: <strong>{store.namespace === "device:anonymous" ? "anonymous device storage" : "current signed-in account"}</strong>. Browser data can be cleared or evicted; keep external backups. Remote media links may expire; backups do not download them.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
        const blob = await store.exportArchive(); store.assertActive();
        const url = URL.createObjectURL(blob); const link = document.createElement("a");
        link.href = url; link.download = "fetishui-history-v1.json"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Backup downloaded. It contains private prompts and media; store it securely.");
      })}>Export history backup</Button>
      <label className="text-sm flex min-w-0 w-full flex-col gap-2">Select history backup
        <input type="file" accept="application/json,.json" disabled={busy} className="w-full min-w-0 max-w-full" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; setPending(null);
          if (file) void run(async () => { setPending(await store.prepareImport(file)); });
        }} />
      </label>
    </div>
    <details>
      <summary className="cursor-pointer text-sm">Import old device-shared history</summary>
      <p className="text-xs text-muted-foreground my-2">Only import records you own. Both original localStorage keys remain untouched, even after import or clearing new history. Nothing is claimed automatically on login.</p>
      <div className="flex flex-wrap gap-2">{LEGACY_HISTORY_KEYS.map(key => <Button key={key} size="sm" variant="outline" disabled={busy} onClick={() => {
        setPending(null); void run(async () => { setPending(readLegacyHistory(localStorage, key)); });
      }}>Review {key}</Button>)}</div>
    </details>
    {pending && <div className="text-sm space-y-2">
      <p>Import {pending.length} records into {store.namespace === "device:anonymous" ? "anonymous device storage" : "this signed-in account"}? Matching records are skipped; any conflicting ID cancels the entire import.</p>
      <Button disabled={busy} onClick={() => void run(async () => {
        const count = await store.importRecords(pending); setPending(null); setMessage(`Imported ${count} records. Source data was not changed. Reload and export a backup to verify.`);
      })}>Confirm history import</Button>{" "}<Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
