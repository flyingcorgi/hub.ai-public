// Personal albums store metadata and image Blobs in account/device-scoped browser IndexedDB.
// Independent from Queue history. Browser storage can be evicted: export backups regularly.
export interface Album {
  id: string;
  name: string;
  // Default albums can't be deleted or renamed — always present, always in this order.
  isDefault: boolean;
  createdAt: number;
}

export interface AlbumItem {
  id: string;
  albumId: string;
  // Ephemeral blob: display URL, not persisted. The picker reads bytes as a data URL before
  // generation; a blob URL must never be sent to the server/provider or saved in a workflow.
  url: string;
  contentType: string;
  // Optional context carried over from the generation this was saved from.
  prompt?: string;
  modelName?: string;
  addedAt: number;
  // User-provided display name for this image — defaults to "Image 1", "Image 2", etc.
  // based on position within the album when no name is given.
  name?: string;
  // Freeform tags for character-consistency references (e.g. "face", "body").
  // Used by the prompt builder to auto-inject reference directives like "Use face from @image0".
  tags?: string[];
}

export const DEFAULT_ALBUMS: Album[] = [
  { id: "default-my-mirror", name: "My Mirror", isDefault: true, createdAt: 0 },
  { id: "default-my-captions", name: "My Captions", isDefault: true, createdAt: 0 },
  { id: "default-my-goddesses", name: "My Goddesses", isDefault: true, createdAt: 0 },
];
