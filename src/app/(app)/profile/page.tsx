'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Album, AlbumItem } from "@/lib/albums/types";
import { ALBUMS_CHANGED_EVENT } from "@/lib/albums/store";
import { useAlbumStore } from "@/components/albums/album-storage-provider";
import { AlbumBackupControls } from "@/components/albums/album-backup-controls";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Images, Loader2, Plus, User } from "lucide-react";
import { PaidAccessGate } from "@/components/nowpayments/workflow-access-gate";

export default function ProfilePage() {
  return (
    <>
      <AlbumBackupControls />
      <PaidAccessGate title="Albums are locked" description="$45 unlocks Albums along with every guided workflow, for 3 months.">
        <ProfileContent />
      </PaidAccessGate>
    </>
  );
}

function ProfileContent() {
  const { loadAlbums, loadAlbumItems, createAlbum } = useAlbumStore();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAlbumOpen, setNewAlbumOpen] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      Promise.all([loadAlbums(), loadAlbumItems()])
        .then(([loadedAlbums, loadedItems]) => {
          if (cancelled) return;
          setAlbums(loadedAlbums);
          setItems(loadedItems);
        })
        .catch((error) => toast({ title: "Failed to load albums", description: error.message, variant: "destructive" }))
        .finally(() => !cancelled && setLoading(false));
    };
    refresh();
    window.addEventListener(ALBUMS_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(ALBUMS_CHANGED_EVENT, refresh);
    };
  }, [toast, loadAlbums, loadAlbumItems]);

  async function handleCreateAlbum() {
    const name = newAlbumName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createAlbum(name);
      setNewAlbumName("");
      setNewAlbumOpen(false);
    } catch (error) {
      toast({
        title: "Failed to create album",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
          <User className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-sm text-muted-foreground">Your saved images, organized into albums.</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Albums</h2>
        <Dialog open={newAlbumOpen} onOpenChange={setNewAlbumOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New album
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New album</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                placeholder="Album name"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateAlbum();
                  }
                }}
              />
              <Button type="button" disabled={!newAlbumName.trim() || creating} onClick={handleCreateAlbum}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {albums.map((album) => {
            const albumItems = items.filter((i) => i.albumId === album.id);
            const preview = albumItems.slice(0, 4);
            return (
              <Link key={album.id} href={`/profile/albums/${album.id}`}>
                <Card className="overflow-hidden hover:ring-2 hover:ring-primary transition-all h-full">
                  <CardContent className="p-0">
                    <div className="grid grid-cols-2 aspect-square bg-muted">
                      {preview.length > 0 ? (
                        preview.map((item) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={item.id} src={item.url} alt="" className="h-full w-full object-cover" />
                        ))
                      ) : (
                        <div className="col-span-2 flex items-center justify-center text-muted-foreground">
                          <Images className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-sm truncate">{album.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {albumItems.length} {albumItems.length === 1 ? "image" : "images"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
