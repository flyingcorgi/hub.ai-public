'use client';

import { GenerationsGallery } from "@/components/image-generator/generations-gallery";
import { HistoryBackupControls } from "@/components/image-generator/history-backup-controls";
import { useGenerationHistory } from "@/hooks/use-generation-history";
import { Button } from "@/components/ui/button";

export default function QueuePage() {
  const { generations, setGenerations, loading, error, refresh } = useGenerationHistory();
  return <main className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
    <div>
      <h1 className="text-2xl font-bold">Queue</h1>
      <p className="text-sm text-muted-foreground">Saved single-model and batch generation history for this account on this browser. This is not a live job queue.</p>
    </div>
    <HistoryBackupControls />
    {loading ? <p role="status">Loading history…</p> : error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void refresh()}>Retry loading history</Button></div> : generations.length === 0 ?
      <p className="text-sm text-muted-foreground py-16 text-center">No saved history in this namespace yet. Generate something or explicitly import your old history above.</p> :
      <GenerationsGallery generations={generations} onGenerationsChange={setGenerations} />}
  </main>;
}
