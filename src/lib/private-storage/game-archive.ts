import { z } from "zod";
import { StorageError } from "./database";

export const MAX_GAME_ARCHIVE_BYTES = 96 * 1024 * 1024;
export const MAX_GAME_COLLECTION_BYTES = 64 * 1024 * 1024;
const timestamp = z.number().int().nonnegative().safe();
const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/);
const imageUrl = z.string().max(28 * 1024 * 1024).refine(value => {
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Unsupported image reference");
export const gameRulesSchema = z.object({ tone: z.string().max(100000), punishmentRules: z.string().max(100000) }).strict();
export const gameSessionSchema = z.object({
  id, fetish: z.string().max(10000),
  messages: z.array(z.object({ id, role: z.enum(["domme", "user"]), type: z.enum(["text", "image"]),
    content: z.string().max(100000), imageUrl: imageUrl.optional(), timestamp }).strict()).max(10000),
  conversation: z.array(z.record(z.unknown())).max(20000), score: z.number().finite(),
  phase: z.enum(["intro", "chatting", "punishment"]), punishedUntil: timestamp,
  punishmentReason: z.string().max(100000), updatedAt: timestamp,
}).strict();
export type GameRules = z.infer<typeof gameRulesSchema>;
export type GameSession = z.infer<typeof gameSessionSchema>;
export const gameArchiveSchema = z.object({ format: z.literal("fetishui-game"), version: z.literal(1),
  exportedAt: timestamp, sessions: z.array(gameSessionSchema).max(500), rules: gameRulesSchema.nullable() }).strict();
export type GameArchive = z.infer<typeof gameArchiveSchema>;

function checkJson(value: unknown, depth = 0): void {
  if (depth > 24) throw new StorageError("Game data is too deeply nested. Nothing was saved.");
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const child of value) checkJson(child, depth + 1); return; }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new StorageError("Unsupported game data. Nothing was saved.");
      if (child !== undefined) checkJson(child, depth + 1);
    }
    return;
  }
  throw new StorageError("Unsupported game data. Nothing was saved.");
}
export function parseGameSession(input: unknown): GameSession {
  checkJson(input);
  const parsed = gameSessionSchema.safeParse(input);
  if (!parsed.success) throw new StorageError("Invalid or oversized session. Nothing was saved. Local file/blob image links must be converted to image data first.");
  const json = JSON.stringify(parsed.data);
  if (new TextEncoder().encode(json).byteLength > 32 * 1024 * 1024) throw new StorageError("This session exceeds the 32 MiB limit. Export existing saves before starting a new session.");
  return JSON.parse(json); // Capture mutable conversation refs at call time, before queued writes.
}
export function parseGameRules(input: unknown): GameRules {
  const parsed = gameRulesSchema.safeParse(input);
  if (!parsed.success) throw new StorageError("Rules are invalid or too long. Nothing was saved.");
  return parsed.data;
}
export function parseGameArchive(input: unknown): GameArchive {
  checkJson(input);
  const parsed = gameArchiveSchema.safeParse(input);
  if (!parsed.success) throw new StorageError("Invalid or unsupported game backup. Nothing was imported.");
  const data = parsed.data;
  if (new Set(data.sessions.map(s => s.id)).size !== data.sessions.length) throw new StorageError("Duplicate sessions in backup. Nothing was imported.");
  data.sessions = data.sessions.map(parseGameSession);
  return data;
}
