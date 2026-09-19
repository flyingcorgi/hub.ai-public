import { privateJson } from "./responses";

// No cookies, filesystem lookup, remote fetch or migration-on-visit. Original operator files
// are preserved for the explicit CLI export, not served by any runtime endpoint.
export async function retiredAlbumRoute(_request: Request, _context: { params: Promise<Record<string, string>> }) {
  return privateJson({ error: "Server album storage is retired. Use browser albums; legacy files require an explicit local operator export." }, 410);
}
