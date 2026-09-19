'use client';

import { useEffect, useState } from "react";
import { Album } from "@/lib/albums/types";
import { useAlbumStore } from "./album-storage-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BookmarkPlus, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface SaveToAlbumButtonProps {
  imageUrl: string;
  prompt?: string;
  modelName?: string;
  variant?: "icon" | "full";
  className?: string;
}

// Dropped next to any generated image — opens a small picker of albums (default + custom), and
// on pick copies image bytes into this account's browser IndexedDB, never the app server.
export function SaveToAlbumButton({ imageUrl, prompt, modelName, variant = "icon", className }: SaveToAlbumButtonProps) {
  const { loadAlbums, createAlbum, saveImageToAlbum, loadAlbumItems } = useAlbumStore();
  const [open, setOpen] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [albumItemCounts, setAlbumItemCounts] = useState<Record<string, number>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedAlbumId(null);
    setImageName("");
    Promise.all([loadAlbums(), loadAlbumItems()])
      .then(([loadedAlbums, allItems]) => {
        setAlbums(loadedAlbums);
        // Precompute item counts per album so we can suggest "Image N"
        const counts: Record<string, number> = {};
        for (const item of allItems) {
          counts[item.albumId] = (counts[item.albumId] ?? 0) + 1;
        }
        setAlbumItemCounts(counts);
      })
      .catch((error) => toast({ title: "Failed to load albums", description: error.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, toast, loadAlbums, loadAlbumItems]);

  async function handleSave(albumId: string) {
    setSavingId(albumId);
    try {
      const name = imageName.trim() || undefined;
      await saveImageToAlbum(albumId, imageUrl, { prompt, modelName, name });
      toast({ title: "Saved to album" });
      setOpen(false);
    } catch (error) {
      toast({
        title: "Failed to save image",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handleCreateAndSave() {
    const name = newAlbumName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const album = await createAlbum(name);
      setAlbums((prev) => [...prev, album]);
      setAlbumItemCounts((prev) => ({ ...prev, [album.id]: 0 }));
      setNewAlbumName("");
      // Let the user name the image before saving into the new album
      setSelectedAlbumId(album.id);
      setImageName("");
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn("h-8 w-8 bg-black/20 hover:bg-black/40 backdrop-blur-[2px] text-white", className)}
            title="Save to album"
          >
            <BookmarkPlus className="h-4 w-4" />
            <span className="sr-only">Save to album</span>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className={cn("gap-2", className)}>
            <BookmarkPlus className="h-4 w-4" />
            Save to album
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save to album</DialogTitle>
        </DialogHeader>
        {selectedAlbumId ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Saving to <span className="font-medium text-foreground">{albums.find((a) => a.id === selectedAlbumId)?.name}</span>
            </p>
            <div className="space-y-1.5">
              <Input
                autoFocus
                placeholder={`Image ${(albumItemCounts[selectedAlbumId] ?? 0) + 1}`}
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave(selectedAlbumId);
                  }
                }}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Name this image — leave blank to use the default.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" disabled={savingId !== null} onClick={() => handleSave(selectedAlbumId)} className="flex-1">
                {savingId !== null && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedAlbumId(null); setImageName(""); }}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                albums.map((album) => {
                  const nextIndex = (albumItemCounts[album.id] ?? 0) + 1;
                  return (
                    <Button
                      key={album.id}
                      type="button"
                      variant="ghost"
                      className="w-full justify-start text-left"
                      onClick={() => {
                        setSelectedAlbumId(album.id);
                        setImageName("");
                      }}
                    >
                      <span className="flex-1">{album.name}</span>
                      <span className="text-xs text-muted-foreground">{nextIndex} image{nextIndex !== 1 ? "s" : ""}</span>
                    </Button>
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-2 border-t pt-3">
              <Input
                placeholder="New album name"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateAndSave();
                  }
                }}
                className="h-9"
              />
              <Button type="button" size="sm" disabled={!newAlbumName.trim() || creating} onClick={handleCreateAndSave}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
