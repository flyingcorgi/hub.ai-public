import { Pool, type PoolClient } from "pg";

// Lazy initialization lets builds run without production secrets. Requests that need SQL fail
// closed when it is unconfigured. Never fall back to shared JSON or in-memory entitlements.
let pool: Pool | undefined;
export function getDb(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Database is not configured");
    pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
    // pg emits idle-client errors outside request handlers. Do not log connection credentials.
    pool.on("error", () => { /* The next operation fails closed and can reconnect. */ });
  }
  return pool;
}

export async function inTransaction<T>(db: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}
