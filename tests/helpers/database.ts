import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { setImmediate as nextTurn } from "node:timers/promises";

// Real PostgreSQL SQL engine in WASM, in-memory and loopback only. Production uses PostgreSQL.
// One connection avoids PGlite's query-level multiplexing of different SQL transactions.
export async function isolatedDatabase(options: { maxConnections?: number } = {}) {
  const engine = await PGlite.create();
  // Multi-process HTTP/browser smoke tests may opt into multiplexing. Do not use multiplexed
  // connections to claim independent PostgreSQL transaction/isolation coverage.
  const server = new PGLiteSocketServer({ db: engine, host: "127.0.0.1", port: 0, maxConnections: options.maxConnections ?? 1 });
  await server.start();
  const connectionString = `postgres://postgres:postgres@${server.getServerConn()}/postgres`;
  const pool = new Pool({ connectionString, max: 1 });
  return {
    pool, connectionString,
    async close() {
      await pool.end();
      await server.stop();
      // pglite-socket 0.2.x schedules socket-close/detach with setImmediate and stop() does
      // not await those callbacks. Drain them before destroying the WASM engine.
      await nextTurn();
      await nextTurn();
      await engine.close();
    },
  };
}
