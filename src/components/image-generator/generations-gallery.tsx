'use client';

import { useState, useEffect, useMemo } from "react";
import { Generation } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Lightbox } from "@/components/ui/lightbox";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Film, Image as ImageIcon, Search, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SaveToAlbumButton } from "@/components/albums/save-to-album-button";
import { useGenerationStore } from "@/components/albums/album-storage-provider";
import { storageError } from "@/lib/private-storage/database";

type NSFWFilter = "show" | "blur" | "hide";

interface GenerationsGalleryProps {
  generations: Generation[];
  onGenerationsChange?: (generations: Generation[]) => void;
}

const ITEMS_PER_PAGE = 16;

const NSFW_OPTIONS = [
  { value: "blur", label: "Blur NSFW" },
  { value: "show", label: "Show NSFW" },
  { value: "hide", label: "Hide NSFW" },
] as const;

function truncateText(text: string, maxWords: number = 150) {
  const words = text.split(' ');
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

function getExtensionFromContentType(contentType?: string) {
  if (!contentType) return "bin";
  const [, subtype] = contentType.split("/");
  if (!subtype) return "bin";
  return subtype.split("+")[0];
}

async function downloadMedia(url: string, filename: string, contentType?: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = objectUrl;
    const extension = getExtensionFromContentType(contentType);
    link.download = `${filename}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error('Failed to download image:', error);
  }
}

export function GenerationsGallery({
  generations,
  onGenerationsChange,
}: GenerationsGalleryProps) {
  const store = useGenerationStore();
  const [storageFailure, setStorageFailure] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [nsfwFilter, setNsfwFilter] = useState<NSFWFilter>("blur");
  const [searchQuery, setSearchQuery] = useState("");
  const [localGenerations, setLocalGenerations] = useState<Generation[]>(generations);

  // Update localGenerations when props change
  useEffect(() => {
    setLocalGenerations(generations);
    setSelectedGeneration(previous => previous ? generations.find(row => row.id === previous.id) ?? null : null);
  }, [generations]);

  // Derive available models from generations so new models (like Seedream) are included automatically
  const availableModels = useMemo(
    () => {
      const map = new Map<string, string>();
      for (const gen of localGenerations) {
        if (!map.has(gen.modelId)) {
          map.set(gen.modelId, gen.modelName);
        }
      }
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    },
    [localGenerations]
  );

  // Initialize selected models to "all" when we first have available models
  useEffect(() => {
    if (availableModels.length > 0 && selectedModels.length === 0) {
      setSelectedModels(availableModels.map((m) => m.id));
    }
  }, [availableModels, selectedModels.length]);

  const sortedAndFilteredGenerations = [...localGenerations]
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter(gen => selectedModels.length === 0 || selectedModels.includes(gen.modelId))
    .filter(gen => 
      searchQuery === "" || 
      gen.prompt.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const mutate = async (operation: () => Promise<void>) => {
    if (mutating) return;
    setMutating(true); setStorageFailure(null);
    try {
      await operation();
      const rows = await store.list();
      setLocalGenerations(rows); onGenerationsChange?.(rows);
      setSelectedGeneration(previous => previous ? rows.find(row => row.id === previous.id) ?? null : null);
    } catch (error) { setStorageFailure(storageError(error).message); }
    finally { setMutating(false); }
  };
  const handleNSFWToggle = (isNSFW: boolean) => {
    if (!selectedGeneration || selectedImageIndex === null) return;
    void mutate(() => store.setNsfw(selectedGeneration.id, selectedImageIndex, isNSFW));
  };
  const handleDelete = (generationId: string) => {
    void mutate(() => store.remove([generationId]));
  };
  const handleClearHistory = () => {
    if (!window.confirm("Delete all currently loaded history in this account/device namespace? Export a backup first. Original legacy history will not be deleted.")) return;
    // Delete captured IDs only: never erase records arriving from another tab after this view loaded.
    void mutate(() => store.remove(localGenerations.map(row => row.id)));
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(sortedAndFilteredGenerations.length / ITEMS_PER_PAGE);
  const paginatedGenerations = sortedAndFilteredGenerations.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="w-full space-y-4">
      {storageFailure && <p role="alert" className="text-sm text-destructive">{storageFailure}</p>}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl sm:text-2xl font-bold">Previous Generations</h2>
          
          <div className="flex flex-col sm:flex-row gap-4">
            {localGenerations.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearHistory}
                disabled={mutating}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear History
              </Button>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Search:</span>
              <div className="relative w-full sm:w-[200px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search prompts..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8"
                />
              </div>
            </div>

            {availableModels.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">Models:</span>
                <Select
                  value={selectedModels.join(",")}
                  onValueChange={(value) => {
                    const models = value.split(",").filter(Boolean);
                    setSelectedModels(models);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue>
                      {selectedModels.length === 0 || selectedModels.length === availableModels.length
                        ? "All Models"
                        : `${selectedModels.length} Selected`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        className={cn(
                          "cursor-pointer",
                          selectedModels.includes(model.id) && "bg-accent"
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedModels((prev) => {
                            const isSelected = prev.includes(model.id);
                            if (isSelected) {
                              return prev.filter((id) => id !== model.id);
                            }
                            return [...prev, model.id];
                          });
                        }}
                      >
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">NSFW:</span>
              <Select
                value={nsfwFilter}
                onValueChange={(value) => setNsfwFilter(value as NSFWFilter)}
              >
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NSFW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 px-2 sm:px-4"
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  // On mobile, show fewer page numbers
                  if (typeof window !== "undefined" && window.innerWidth < 640) {
                    return page === 1 || 
                           page === totalPages || 
                           page === currentPage ||
                           Math.abs(page - currentPage) <= 1;
                  }
                  return true;
                })
                .map((page, index, array) => (
                  <>
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="px-1">...</span>
                    )}
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="h-8 w-8 p-0"
                    >
                      {page}
                    </Button>
                  </>
                ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 px-2 sm:px-4"
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {paginatedGenerations
          .filter(generation => 
            nsfwFilter !== "hide" || !generation.output.has_nsfw_concepts?.[0]
          )
          .map((generation) => {
            const media = generation.output.images[0];
            if (!media) return null;
            const isNSFW = generation.output.has_nsfw_concepts?.[0];
            const shouldBlur = isNSFW && nsfwFilter === "blur";
            const isVideo = media.content_type?.startsWith("video/");

            return (
              <Card key={generation.id} className="overflow-hidden group cursor-pointer hover:ring-2 hover:ring-primary transition-all">
                <CardContent className="p-0">
                  <div className="flex flex-col">
                    <div 
                      onClick={() => {
                        setSelectedGeneration(generation);
                        setSelectedImageIndex(0);
                      }}
                      className="relative aspect-square"
                    >
                      {isVideo ? (
                        <video
                          src={media.url}
                          playsInline
                          muted
                          loop
                          autoPlay
                          className={`absolute inset-0 object-cover w-full h-full transition-all ${
                            shouldBlur ? "blur-xl" : ""
                          }`}
                        />
                      ) : (
                        <img
                          src={media.url}
                          alt={generation.prompt}
                          className={`absolute inset-0 object-cover w-full h-full transition-all ${
                            shouldBlur ? "blur-xl" : ""
                          }`}
                        />
                      )}
                      <div className="absolute top-2 left-2">
                        <Badge variant="secondary" className="bg-black/50 text-white border-none">
                          {isVideo ? (
                            <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
                              <Film className="h-3 w-3" />
                              Video
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
                              <ImageIcon className="h-3 w-3" />
                              Image
                            </span>
                          )}
                        </Badge>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {!isVideo && (
                          <SaveToAlbumButton
                            imageUrl={media.url}
                            prompt={generation.prompt}
                            modelName={generation.modelName}
                          />
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 bg-black/20 hover:bg-black/40 backdrop-blur-[2px] text-white"
                          onClick={() =>
                            downloadMedia(
                              media.url,
                              `generation-${generation.id}`,
                              media.content_type
                            )
                          }
                        >
                          <Download className="h-4 w-4" />
                          <span className="sr-only">Download image</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 bg-black/20 hover:bg-red-500/40 backdrop-blur-[2px] text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(generation.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete image</span>
                        </Button>
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">{generation.modelName}</span>
                        {isNSFW && (
                          <Badge variant="destructive" className="text-[10px]">NSFW</Badge>
                        )}
                      </div>
                      <p className="text-xs line-clamp-3">{truncateText(generation.prompt)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(generation.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
        })}
      </div>

      {selectedGeneration && selectedImageIndex !== null && (() => {
        const media = selectedGeneration.output.images[selectedImageIndex];
        if (!media) return null;
        return (
          <Lightbox
            isOpen={true}
            onClose={() => {
              setSelectedImageIndex(null);
              setSelectedGeneration(null);
            }}
            imageUrl={media.url}
            contentType={media.content_type}
            onNext={selectedImageIndex < selectedGeneration.output.images.length - 1 
              ? () => setSelectedImageIndex(i => i !== null ? i + 1 : null)
              : undefined}
            onPrevious={selectedImageIndex > 0
              ? () => setSelectedImageIndex(i => i !== null ? i - 1 : null)
              : undefined}
            hasNext={selectedImageIndex < selectedGeneration.output.images.length - 1}
            hasPrevious={selectedImageIndex > 0}
            onDownload={() => {
              downloadMedia(
                media.url,
                `generation-${selectedGeneration.id}-${selectedImageIndex}`,
                media.content_type
              );
            }}
            onDelete={() => handleDelete(selectedGeneration.id)}
            isNSFW={selectedGeneration.output.has_nsfw_concepts?.[selectedImageIndex] ?? false}
            onNSFWToggle={handleNSFWToggle}
          >
            <div className="space-y-4">
              {!media.content_type?.startsWith("video/") && (
                <SaveToAlbumButton
                  imageUrl={media.url}
                  prompt={selectedGeneration.prompt}
                  modelName={selectedGeneration.modelName}
                  variant="full"
                  className="w-full"
                />
              )}
              <div>
                <h3 className="font-medium mb-1">Prompt</h3>
                <p className="text-sm text-muted-foreground">{selectedGeneration.prompt}</p>
              </div>
              <Separator />
              <div>
                <h3 className="font-medium mb-1">Model</h3>
                <p className="text-sm text-muted-foreground">{selectedGeneration.modelName}</p>
              </div>
              <Separator />
              <div>
                <h3 className="font-medium mb-1">Generated</h3>
                <p className="text-sm text-muted-foreground">
                  {formatDistanceToNow(selectedGeneration.timestamp, { addSuffix: true })}
                </p>
              </div>
            </div>
          </Lightbox>
        );
      })()}
    </div>
  );
} 