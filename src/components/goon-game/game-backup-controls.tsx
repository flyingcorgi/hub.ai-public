'use client';

import { useState } from "react";
import { useGameStore } from "@/components/albums/album-storage-provider";
import { useAccount } from "@/components/account/account-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_GAME_ARCHIVE_BYTES, parseGameArchive } from "@/lib/private-storage/game-archive";

export function GameBackupControls() {
  const store = useGameStore();
  const { account } = useAccount();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <details className="mx-auto my-3 w-full max-w-4xl rounded border p-3 text-sm">
    <summary className="cursor-pointer font-medium">Browser-only game saves · backup / import</summary>
    <p className="my-2">Storage: {account.user?.email ?? "anonymous device"}. Sessions, image messages and rules stay in this browser account namespace. They are not uploaded for saving. Chat/generation requests still pass through our backend to Venice.</p>
    <p className="my-2 text-xs text-muted-foreground">No cloud sync or encrypted vault. Clearing browser data can erase saves. External image links remain external and can expire; embedded generated/album image bytes are included. Export regularly. Imports never overwrite existing saves.</p>
    <div className="flex gap-2 flex-wrap my-2">
      <Button variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        try { downloadGameBackup(await store.exportArchive()); setMessage("Backup download started. Protect this unencrypted file; verify it before deleting any originals."); }
        catch (e) { setMessage(e instanceof Error ? e.message : "Backup failed."); }
        finally { setBusy(false); }
      }}>Export saved games</Button>
    </div>
    <label htmlFor="game-backup">Select game backup (96 MiB maximum)</label>
    <Input id="game-backup" type="file" accept="application/json,.json" disabled={busy} onChange={async e => {
      const selected = e.target.files?.[0]; e.target.value = ""; setFile(null);
      if (!selected) return;
      setBusy(true);
      try {
        if (selected.size > MAX_GAME_ARCHIVE_BYTES) throw new Error();
        const archive = parseGameArchive(JSON.parse(await selected.text()));
        setFile(selected); setMessage(`Ready to import ${archive.sessions.length} sessions${archive.rules ? " and rules" : ""} into the currently shown account. Finish/leave any active session first.`);
      } catch { setMessage("Invalid or oversized game backup. Nothing was imported."); }
      finally { setBusy(false); }
    }} />
    {file && <Button className="my-2" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const result = await store.importArchive(file); setFile(null);
        setMessage(`Imported ${result.added} records; skipped ${result.skipped} matching records. Reload the page before editing imported sessions or rules. Source preserved.`);
      } catch (e) { setMessage(e instanceof Error ? e.message : "Import failed. Nothing was changed."); }
      finally { setBusy(false); }
    }}>Confirm game import</Button>}
    {message && <p role="status" className="my-2">{message}</p>}
  </details>;
}
export function downloadGameBackup(blob: Blob) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "fetishui-game-v1.json"; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
