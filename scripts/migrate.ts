import { closeDb, getDb } from "../src/lib/db";
import { migrate } from "../src/lib/db/migrate";

(async () => {
  try {
    await migrate(getDb());
    console.log("Database migrations applied.");
  } catch {
    console.error("Migration failed. Check database configuration and migration checksums. No error details are logged.");
    process.exitCode = 1;
  } finally { await closeDb(); }
})();
