'use client';

import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { useAlbumStore } from "./album-storage-provider";
import { MAX_ARCHIVE_BYTES, parseArchive } from "@/lib/private-storage/album-archive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AlbumBackupControls() {
  const { account } = useAccount();
  const { exportArchive, importArchive } = useAlbumStore();
  const [pending, setPending] = useState<{ file: File; albums: number; images: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [usage, setUsage] = useState("");
  useEffect(() => {
    let active = true;
    navigator.storage?.estimate().then(({ usage, quota }) => {
      if (active && quota) setUsage(`This origin uses about ${Math.ceil((usage ?? 0) / 1024 / 1024)} MiB of ${Math.floor(quota / 1024 / 1024)} MiB currently available quota.`);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [message]);
  return <section aria-label="Browser album backups" className="mx-auto w-full max-w-5xl space-y-3 rounded border p-4 my-5">
    <h2 className="font-semibold">Browser-only albums and backups</h2>
    <p className="text-sm">{account.user ? `Album storage for ${account.user.email}.` : "Anonymous device album storage."} Images and metadata stay in IndexedDB on this browser and origin. No automatic cloud backup or cross-device sync.</p>
    <p className="text-xs text-muted-foreground">Changing account does not copy albums. Browser clearing, eviction, private browsing or changing host/port can make them unavailable. Namespaces are not encryption against someone using this browser profile. Export regularly; backups contain unencrypted private images and prompts.</p>
    <p className="text-xs text-muted-foreground">Prompts and selected references still pass through our backend to Venice for generation. Administrator-published workflow references are intentionally saved on the server, separately from personal albums.</p>
    {usage && <p className="text-xs text-muted-foreground">{usage}</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={async () => {
        setBusy(true); setMessage("");
        try {
          const blob = await exportArchive(); const url = URL.createObjectURL(blob);
          const link = document.createElement("a"); link.href = url; link.download = "fetishui-albums-v1.json"; link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          setMessage("Backup download started. Keep the source until you have verified the backup can be imported.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Backup failed. Nothing was removed."); }
        finally { setBusy(false); }
      }}>Export album backup</Button>
      <Button variant="outline" disabled={busy} onClick={async () => {
        try { setMessage(await navigator.storage?.persist() ? "Browser persistence granted. Still keep an external backup." : "Browser persistence was not granted. Keep an external backup."); }
        catch { setMessage("Persistence request unavailable. Keep an external backup."); }
      }}>Request persistent browser storage</Button>
    </div>
    <label htmlFor="album-backup-import" className="block text-sm font-medium">Select an album backup (up to 128 MiB)</label>
    <Input id="album-backup-import" type="file" accept="application/json,.json" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ""; setPending(null); setMessage("");
      if (!file) return;
      setBusy(true);
      try {
        if (file.size > MAX_ARCHIVE_BYTES) throw new Error();
        const archive = parseArchive(JSON.parse(await file.text()));
        setPending({ file, albums: archive.albums.length, images: archive.items.length });
      } catch { setMessage("Invalid, unsupported or oversized album backup. Nothing was imported."); }
      finally { setBusy(false); }
    }} />
    {pending && <div className="space-y-2">
      <p className="text-sm">Import {pending.images} images in {pending.albums} albums into {account.user ? "this signed-in account" : "anonymous device storage"}? Matching records are skipped; conflicts abort the whole import without overwriting. No server upload.</p>
      <Button disabled={busy} onClick={async () => {
        setBusy(true); setMessage("");
        try { const result = await importArchive(pending.file); setMessage(`Imported ${result.added} images; ${result.skipped} matching images skipped. Source backup preserved.`); setPending(null); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Import failed. No partial changes were saved."); }
        finally { setBusy(false); }
      }}>Confirm album import</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel import</Button>
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <p className="text-xs text-muted-foreground">Collections are currently limited to 96 MiB encoded so a complete backup fits in memory. Individual images are limited to 20 MiB. Backup/import remains available even after paid access expires. Legacy server albums require a local operator export; no visitor automatically inherits those files.</p>
  </section>;
}
