import { privateJson } from "./responses";

// Original operator files are readable only through the explicit local export CLI.
export async function retiredGameRoute(_request: Request, _context: { params: Promise<Record<string, string>> }) {
  return privateJson({ error: "Server game storage is retired. Use browser saves; legacy files require an explicit local operator export." }, 410);
}
