import { lstat, readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { parseGameArchive, MAX_GAME_ARCHIVE_BYTES } from "../../src/lib/private-storage/game-archive";
import { imageDataUrl, validateImage, MAX_IMAGE_BYTES } from "../../src/lib/private-storage/album-archive";

async function readBounded(file: string, limit: number) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error("Invalid local file");
  const bytes = await readFile(file);
  if (bytes.length > limit) throw new Error("Oversized file");
  return bytes;
}
export async function exportLegacyGame(directory: string, destination: string) {
  const source = await realpath(directory), output = path.resolve(destination);
  const relative = path.relative(source, await realpath(path.dirname(output)));
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Output must be outside source");
  const sessions: unknown = JSON.parse((await readBounded(path.join(source, "goon-game-sessions.json"), MAX_GAME_ARCHIVE_BYTES)).toString("utf8"));
  let rules: unknown = null;
  try { rules = JSON.parse((await readBounded(path.join(source, "goon-game-rules.json"), 1024 * 1024)).toString("utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (!Array.isArray(sessions)) throw new Error("Invalid sessions");
  let estimatedBytes = Buffer.byteLength(JSON.stringify(sessions));
  // Existing local album-image messages become self-contained; no backend/browser lookup later.
  for (const session of sessions) {
    if (!session || !Array.isArray(session.messages)) throw new Error("Invalid session");
    for (const message of session.messages) {
      const url = message?.imageUrl;
      if (typeof url !== "string" || !url.startsWith("/api/album-media/")) continue;
      const match = /^\/api\/album-media\/([a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif))$/.exec(url);
      if (!match || (await lstat(path.join(source, "album-media"))).isSymbolicLink()) throw new Error("Unsafe media path");
      const bytes = await readBounded(path.join(source, "album-media", match[1]), MAX_IMAGE_BYTES);
      estimatedBytes += Math.ceil(bytes.length / 3) * 4;
      if (estimatedBytes > MAX_GAME_ARCHIVE_BYTES) throw new Error("Oversized export");
      const type = `image/${["jpg", "jpeg"].includes(match[2]) ? "jpeg" : match[2]}`;
      const blob = new Blob([new Uint8Array(bytes)], { type }); await validateImage(blob);
      message.imageUrl = await imageDataUrl(blob);
    }
  }
  const archive = parseGameArchive({ format: "fetishui-game", version: 1, exportedAt: Date.now(), sessions, rules });
  const json = JSON.stringify(archive);
  if (Buffer.byteLength(json) > MAX_GAME_ARCHIVE_BYTES) throw new Error("Oversized export");
  await writeFile(output, json, { flag: "wx", mode: 0o600 });
  return archive.sessions.length;
}
