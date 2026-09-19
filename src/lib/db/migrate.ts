import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { inTransaction } from "./index";

// Run explicitly at deploy time, never in request handlers. Lock and checksums protect against
// concurrent deploys and accidentally editing an already-applied migration.
export async function migrate(db: Pool, directory = path.join(process.cwd(), "migrations")) {
  await inTransaction(db, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(81237091)");
    await client.query(`CREATE TABLE IF NOT EXISTS app_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const files = (await readdir(directory)).filter((name) => /^\d+_[a-z_]+\.sql$/.test(name)).sort();
    for (const name of files) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query("SELECT checksum FROM app_migrations WHERE name = $1", [name]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error("An applied migration was modified");
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO app_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
    }
  });
}
