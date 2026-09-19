import { readFile, stat } from "node:fs/promises";
import { closeDb, getDb } from "../src/lib/db";
import { importWorkflowCatalog, prepareWorkflowImport } from "../src/lib/workflows/catalog";

(async () => {
  try {
    const [file, apply, ...extra] = process.argv.slice(2);
    if (!file || (apply && apply !== "--apply") || extra.length) {
      throw new Error("Usage: npm run workflows:import -- <catalog.json> [--apply]");
    }
    if ((await stat(file)).size > 64 * 1024 * 1024) throw new Error("Catalog too large");
    const input: unknown = JSON.parse(await readFile(file, "utf8"));
    const drafts = prepareWorkflowImport(input);
    if (!apply) {
      console.log(`Validated ${drafts.length} draft workflows. No database writes. Pass --apply to import into a migrated database.`);
      return;
    }
    const count = await importWorkflowCatalog(getDb(), drafts);
    console.log(`Imported ${count} workflows as drafts. Review and publish individually. Source file unchanged.`);
  } catch {
    console.error("Catalog import failed. Check the file, validation rules, database configuration, migrations, and conflicting IDs. Source data is unchanged; no partial import is committed.");
    process.exitCode = 1;
  } finally { await closeDb(); }
})();
