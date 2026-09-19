import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../src/lib/auth/server";
import { isolatedDatabase } from "../tests/helpers/database";

// Prints the auth library's schema against an EMPTY test database. Review the SQL and create a
// new versioned migration on upgrades; never overwrite an already-applied migration.
async function main() {
  const db = await isolatedDatabase();
  try {
    const auth = createAuth(db.pool, { baseURL: "http://localhost:4000", secret: "schema-generation-only-not-a-real-secret" });
    const migration = await getMigrations(auth.options);
    process.stdout.write(await migration.compileMigrations());
  } finally { await db.close(); }
}
main().catch(() => { console.error("Schema generation failed"); process.exitCode = 1; });
