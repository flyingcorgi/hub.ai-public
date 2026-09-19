'use client';

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Album, AlbumItem } from "@/lib/albums/types";
import { ALBUMS_CHANGED_EVENT } from "@/lib/albums/store";
import { useAlbumStore } from "@/components/albums/album-storage-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lightbox } from "@/components/ui/lightbox";
import { ArrowLeft, Check, Loader2, Pencil, Tag, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { PaidAccessGate } from "@/components/nowpayments/workflow-access-gate";

export default function AlbumDetailPage({ params }: { params: Promise<{ albumId: string }> }) {
  const { albumId } = use(params);
  return (
    <PaidAccessGate title="Albums are locked" description="$45 unlocks Albums along with every guided workflow, for 3 months.">
      <AlbumDetailContent albumId={albumId} />
    </PaidAccessGate>
  );
}

function AlbumDetailContent({ albumId }: { albumId: string }) {
  const { loadAlbums, loadAlbumItems, deleteAlbumItem, renameAlbum, deleteAlbum, patchAlbumItemTags, patchAlbumItemName, saveImageToAlbum } = useAlbumStore();
  const router = useRouter();
  const { toast } = useToast();

  const [album, setAlbum] = useState<Album | null>(null);
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingNameFor, setEditingNameFor] = useState<string | null>(null);
  const [nameEditDraft, setNameEditDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      Promise.all([loadAlbums(), loadAlbumItems(albumId)])
        .then(([albums, loadedItems]) => {
          if (cancelled) return;
          const found = albums.find((a) => a.id === albumId) ?? null;
          setAlbum(found);
          setNameDraft(found?.name ?? "");
          setItems(loadedItems);
        })
        .catch((error) => toast({ title: "Failed to load album", description: error.message, variant: "destructive" }))
        .finally(() => !cancelled && setLoading(false));
    };
    refresh();
    window.addEventListener(ALBUMS_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(ALBUMS_CHANGED_EVENT, refresh);
    };
  }, [albumId, toast, loadAlbums, loadAlbumItems]);

  async function handleAddTag(itemId: string, tagOverride?: string) {
    const tag = (tagOverride ?? tagDraft).trim().toLowerCase();
    if (!tag) return;
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const currentTags = item.tags ?? [];
    if (currentTags.includes(tag)) { setTagDraft(""); return; }
    const nextTags = [...currentTags, tag];
    try {
      const updated = await patchAlbumItemTags(itemId, nextTags);
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
      setTagDraft("");
    } catch (error) {
      toast({ title: "Failed to add tag", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  }

  async function handleRemoveTag(itemId: string, tag: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const nextTags = (item.tags ?? []).filter((t) => t !== tag);
    try {
      const updated = await patchAlbumItemTags(itemId, nextTags);
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
    } catch (error) {
      toast({ title: "Failed to remove tag", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  }

  async function handleRename() {
    const name = nameDraft.trim();
    if (!name || !album) return;
    try {
      await renameAlbum(album.id, name);
      setRenaming(false);
    } catch (error) {
      toast({ title: "Failed to rename album", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  }

  async function handleRenameItem(itemId: string) {
    const name = nameEditDraft.trim();
    try {
      const updated = await patchAlbumItemName(itemId, name || "");
      setItems((prev) => prev.map((i) => (i.id === itemId ? updated : i)));
      setEditingNameFor(null);
    } catch (error) {
      toast({ title: "Failed to rename image", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  }

  async function handleDeleteAlbum() {
    if (!album) return;
    if (!confirm(`Delete "${album.name}" and everything saved in it? This can't be undone.`)) return;
    try {
      await deleteAlbum(album.id);
      router.push("/profile");
    } catch (error) {
      toast({ title: "Failed to delete album", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      await deleteAlbumItem(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setSelectedIndex(null);
    } catch (error) {
      toast({ title: "Failed to remove image", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <main className="container mx-auto max-w-5xl px-4 py-16 flex justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (!album) {
    return (
      <main className="container mx-auto max-w-5xl px-4 py-16 text-center space-y-4">
        <p className="text-muted-foreground">Album not found.</p>
        <Button asChild variant="outline">
          <Link href="/profile">Back to profile</Link>
        </Button>
      </main>
    );
  }

  const selectedItem = selectedIndex !== null ? items[selectedIndex] : null;

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" />
        All albums
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        {renaming ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="h-9 w-56"
            />
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={handleRename}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setRenaming(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{album.name}</h1>
            {!album.isDefault && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRenaming(true)} title="Rename album">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
        {!album.isDefault && (
          <Button variant="outline" size="sm" className="gap-2 text-destructive" onClick={handleDeleteAlbum}>
            <Trash2 className="h-4 w-4" />
            Delete album
          </Button>
        )}
      </div>

      <div className="mb-5 space-y-2">
        <label className="text-sm font-medium" htmlFor="album-upload">Add an image from this device</label>
        <Input id="album-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          try { await saveImageToAlbum(albumId, file, { name: file.name }); }
          catch (error) { toast({ title: "Image was not saved", description: error instanceof Error ? error.message : undefined, variant: "destructive" }); }
        }} />
        <p className="text-xs text-muted-foreground">Saved only in this browser, up to 20 MiB per image. No upload to the app server.</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          Nothing saved here yet — use &ldquo;Save to album&rdquo; on any generated image.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {items.map((item, index) => {
            const displayName = item.name || `Image ${index + 1}`;
            return (
            <div key={item.id} className="relative group">
            <button
              type="button"
              className="relative aspect-square overflow-hidden rounded-lg border hover:ring-2 hover:ring-primary transition-all w-full"
              onClick={() => setSelectedIndex(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={displayName} className="absolute inset-0 h-full w-full object-cover" />
              {/* Tag chips on thumbnail */}
              {(item.tags && item.tags.length > 0) && (
                <div className="absolute bottom-1 left-1 flex flex-wrap gap-0.5">
                  {item.tags.map((tag) => (
                    <span key={tag} className="px-1 py-0.5 text-[10px] rounded bg-primary/80 text-primary-foreground font-medium leading-none">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <span
                role="button"
                tabIndex={0}
                className="absolute top-1.5 right-1.5 h-7 w-7 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteItem(item.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </button>
            {/* Name label below thumbnail */}
            {editingNameFor === item.id ? (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  autoFocus
                  value={nameEditDraft}
                  onChange={(e) => setNameEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameItem(item.id);
                    if (e.key === "Escape") setEditingNameFor(null);
                  }}
                  className="h-7 text-xs"
                />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleRenameItem(item.id)}>
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="mt-1 w-full text-xs text-muted-foreground truncate text-center hover:text-foreground transition-colors"
                title="Click to rename"
                onClick={() => {
                  setEditingNameFor(item.id);
                  setNameEditDraft(item.name || "");
                }}
              >
                {displayName}
              </button>
            )}
          </div>
          );
          })}
        </div>
      )}

      {selectedItem && (
        <Lightbox
          isOpen
          onClose={() => setSelectedIndex(null)}
          imageUrl={selectedItem.url}
          contentType={selectedItem.contentType}
          onNext={selectedIndex !== null && selectedIndex < items.length - 1 ? () => setSelectedIndex((i) => (i !== null ? i + 1 : null)) : undefined}
          onPrevious={selectedIndex !== null && selectedIndex > 0 ? () => setSelectedIndex((i) => (i !== null ? i - 1 : null)) : undefined}
          hasNext={selectedIndex !== null && selectedIndex < items.length - 1}
          hasPrevious={selectedIndex !== null && selectedIndex > 0}
          onDownload={() => {
            const link = document.createElement("a"); link.href = selectedItem.url;
            link.download = `album-${selectedItem.id}.${selectedItem.contentType.split("/")[1]}`;
            link.click();
          }}
          onDelete={() => handleDeleteItem(selectedItem.id)}
        >
          {(selectedItem.prompt || selectedItem.modelName || true) && (
            <div className="space-y-3">
              {/* Name section */}
              <div>
                <h3 className="font-medium mb-1">Name</h3>
                {editingNameFor === selectedItem.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={nameEditDraft}
                      onChange={(e) => setNameEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameItem(selectedItem.id);
                        if (e.key === "Escape") setEditingNameFor(null);
                      }}
                      className="h-8 text-sm"
                      placeholder={`Image ${(selectedIndex ?? 0) + 1}`}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleRenameItem(selectedItem.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    onClick={() => {
                      setEditingNameFor(selectedItem.id);
                      setNameEditDraft(selectedItem.name || "");
                    }}
                  >
                    {selectedItem.name || `Image ${(selectedIndex ?? 0) + 1}`}
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              {/* Tags section */}
              <div>
                <h3 className="font-medium mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(selectedItem.tags ?? []).map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
                      {tag}
                      <button
                        type="button"
                        className="hover:text-destructive"
                        onClick={() => handleRemoveTag(selectedItem.id, tag)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {["face", "body"].filter((qt) => !(selectedItem.tags ?? []).includes(qt)).map((qt) => (
                    <button
                      key={qt}
                      type="button"
                      className="px-2 py-0.5 rounded-full border border-border text-xs hover:bg-primary/10 transition-colors"
                      onClick={() => handleAddTag(selectedItem.id, qt)}
                    >
                      + {qt}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    placeholder="Add tag..."
                    value={tagDraft}
                    className="h-7 text-xs"
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag(selectedItem.id, tagDraft);
                      }
                    }}
                  />
                  <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={() => handleAddTag(selectedItem.id, tagDraft)}>
                    Add
                  </Button>
                </div>
              </div>
              {selectedItem.prompt && (
                <div>
                  <h3 className="font-medium mb-1">Prompt</h3>
                  <p className="text-sm text-muted-foreground">{selectedItem.prompt}</p>
                </div>
              )}
              {selectedItem.modelName && (
                <div>
                  <h3 className="font-medium mb-1">Model</h3>
                  <p className="text-sm text-muted-foreground">{selectedItem.modelName}</p>
                </div>
              )}
            </div>
          )}
        </Lightbox>
      )}
    </main>
  );
}
