import { z } from "zod";
import { StorageError } from "./database";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/);
const timestamp = z.number().int().nonnegative().safe();
export const albumSchema = z.object({ id, name: z.string().trim().min(1).max(120), isDefault: z.boolean(), createdAt: timestamp }).strict();
export const itemSchema = z.object({
  id, albumId: id, contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  prompt: z.string().max(100000).optional(), modelName: z.string().max(200).optional(), addedAt: timestamp,
  name: z.string().max(200).optional(), tags: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
}).strict();
export type AlbumItemMetadata = z.infer<typeof itemSchema>;
const archivedItemSchema = itemSchema.extend({ dataUrl: z.string().max(Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 100), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const archiveSchema = z.object({
  format: z.literal("fetishui-albums"), version: z.literal(1), exportedAt: timestamp,
  albums: z.array(albumSchema).max(2000), items: z.array(archivedItemSchema).max(10000),
}).strict();
export type AlbumArchive = z.infer<typeof archiveSchema>;
export function parseArchive(input: unknown): AlbumArchive {
  const result = archiveSchema.safeParse(input);
  if (!result.success) throw new StorageError("Invalid or unsupported album backup. No changes were imported.");
  const data = result.data;
  const albums = new Set(data.albums.map(a => a.id)), items = new Set(data.items.map(i => i.id));
  if (albums.size !== data.albums.length || items.size !== data.items.length || data.items.some(i => !albums.has(i.albumId))) {
    throw new StorageError("Backup contains duplicate IDs or missing albums. No changes were imported.");
  }
  return data;
}
export async function validateImage(blob: Blob): Promise<void> {
  if (blob.size < 12 || blob.size > MAX_IMAGE_BYTES) throw new StorageError("Images must be between 12 bytes and 20 MiB. Nothing was saved.");
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = (start: number, length: number) => String.fromCharCode(...b.slice(start, start + length));
  const valid = blob.type === "image/png" ? b.slice(0,8).every((v,i) => v === [137,80,78,71,13,10,26,10][i])
    : blob.type === "image/jpeg" ? b[0] === 255 && b[1] === 216 && b[2] === 255
    : blob.type === "image/webp" ? ascii(0,4) === "RIFF" && ascii(8,4) === "WEBP"
    : blob.type === "image/gif" ? ["GIF87a", "GIF89a"].includes(ascii(0,6)) : false;
  if (!valid) throw new StorageError("Only PNG, JPEG, WebP or GIF image files are supported. Nothing was saved.");
}
export async function imageFromDataUrl(url: string): Promise<Blob> {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(url);
  if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) || match[2].length % 4 !== 0) throw new StorageError("Invalid or oversized image data. Nothing was saved.");
  let binary: string;
  try { binary = atob(match[2]); } catch { throw new StorageError("Invalid image encoding. Nothing was saved."); }
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: match[1] }); await validateImage(blob); return blob;
}
export async function imageDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
export async function imageHash(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
