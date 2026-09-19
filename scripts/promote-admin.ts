import { closeDb, getDb } from "../src/lib/db";

// Explicit operator action only. Account creation, verification and login stay with Better Auth.
(async () => {
  try {
    const [userId, ...extra] = process.argv.slice(2);
    if (!userId || extra.length) throw new Error("A user ID is required");
    const result = await getDb().query(`UPDATE "user" SET role='admin', "updatedAt"=CURRENT_TIMESTAMP
      WHERE id=$1 AND "emailVerified"=true RETURNING id`, [userId]);
    if (!result.rowCount) throw new Error("Verified account not found");
    console.log("Verified account promoted to administrator. Current sessions use the new role on their next protected request.");
  } catch {
    console.error("Admin promotion failed. Supply an existing verified user ID and check database configuration/migrations.");
    process.exitCode = 1;
  } finally { await closeDb(); }
})();
