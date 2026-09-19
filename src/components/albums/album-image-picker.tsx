'use client';

import { useEffect, useState } from "react";
import { Album, AlbumItem } from "@/lib/albums/types";
import { useAlbumStore } from "./album-storage-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Images, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlbumImagePickerProps {
  onPick: (url: string, tags?: string[]) => void;
  className?: string;
  triggerLabel?: string;
}

// The "or choose from album" counterpart to a plain file upload — lets an image already saved in
// one of the user's albums be reused as an input somewhere else (a generation reference image, a
// workflow's start photo) without re-uploading it from disk.
export function AlbumImagePicker({ onPick, className, triggerLabel = "Choose from album" }: AlbumImagePickerProps) {
  const { loadAlbums, loadAlbumItems, getImageDataUrl } = useAlbumStore();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([loadAlbums(), loadAlbumItems()])
      .then(([loadedAlbums, loadedItems]) => {
        setAlbums(loadedAlbums);
        setItems(loadedItems);
        setActiveAlbumId((prev) => prev ?? loadedAlbums[0]?.id ?? null);
      })
      .catch((error) => toast({ title: "Failed to load albums", description: error.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, toast, loadAlbums, loadAlbumItems]);

  const activeItems = items.filter((item) => {
    if (item.albumId !== activeAlbumId) return false;
    if (tagFilter && !(item.tags ?? []).includes(tagFilter)) return false;
    return true;
  });

  // Collect all unique tags across loaded items for filter buttons
  const allTags = Array.from(new Set(items.flatMap((item) => item.tags ?? []))).sort();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={cn("h-8 gap-1.5", className)}>
          <Images className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose from an album</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : albums.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No albums yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {albums.map((album) => (
                <Button
                  key={album.id}
                  type="button"
                  size="sm"
                  variant={activeAlbumId === album.id ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setActiveAlbumId(album.id)}
                >
                  {album.name}
                </Button>
              ))}
            </div>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                    tagFilter === null
                      ? "bg-primary text-primary-foreground"
                      : "border border-border hover:bg-primary/10"
                  }`}
                  onClick={() => setTagFilter(null)}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                      tagFilter === tag
                        ? "bg-primary text-primary-foreground"
                        : "border border-border hover:bg-primary/10"
                    }`}
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
            {activeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">This album is empty.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
                {activeItems.map((item, index) => {
                  const displayName = item.name || `Image ${index + 1}`;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="relative aspect-square overflow-hidden rounded-md border hover:ring-2 hover:ring-primary transition-all group"
                      disabled={picking}
                      onClick={async () => {
                        setPicking(true);
                        try {
                          // blob: URLs are display-only. Send bytes, never a local URL, to a model
                          // or an explicitly saved administrator-curated workflow definition.
                          onPick(await getImageDataUrl(item.id), item.tags);
                          setOpen(false);
                        } catch {
                          toast({ title: "Could not read the image", description: "Account or browser storage changed. Reopen the picker and try again.", variant: "destructive" });
                        } finally { setPicking(false); }
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={displayName} className="absolute inset-0 h-full w-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-white truncate text-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
