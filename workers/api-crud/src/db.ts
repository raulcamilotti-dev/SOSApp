/* ================================================================== */
/*  PostgreSQL connection — direct TCP via pg + nodejs_compat           */
/*  CONNECTION_URL stored as Wrangler secret (DATABASE_URL)             */
/*  When SSL is enabled on PG, migrate to Hyperdrive for pooling       */
/* ================================================================== */

import { Client } from "pg";
import type { Env } from "./types";

/**
 * Execute a parameterized query against PostgreSQL.
 *
 * Uses the `pg` npm package with Cloudflare Workers `nodejs_compat`
 * flag, which enables TCP socket support at the edge.
 *
 * Connection string is stored as a Wrangler secret (DATABASE_URL).
 * When Easypanel PG gets SSL enabled, migrate to Hyperdrive for
 * connection pooling + query caching.
 */
export async function executeQuery(
  env: Env,
  query: string,
  params: unknown[] = [],
): Promise<unknown[]> {
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: false,
  });

  try {
    await client.connect();
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    // Close connection (Hyperdrive handles pooling at the proxy level)
    try {
      await client.end();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Execute multiple queries within a PostgreSQL transaction.
 *
 * Uses a single connection for all queries. Commits on success,
 * rolls back on error. The callback receives a `query` function
 * that shares the same connection/transaction.
 *
 * Usage:
 *   const result = await executeTransaction(env, async (query) => {
 *     const rows = await query("INSERT INTO t (a) VALUES ($1) RETURNING *", [val]);
 *     await query("UPDATE t2 SET b = $1 WHERE id = $2", [x, y]);
 *     return rows;
 *   });
 */
export async function executeTransaction<T>(
  env: Env,
  callback: (
    query: (sql: string, params?: unknown[]) => Promise<unknown[]>,
  ) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: false,
  });

  try {
    await client.connect();
    await client.query("BEGIN");

    const queryFn = async (
      sql: string,
      params: unknown[] = [],
    ): Promise<unknown[]> => {
      const result = await client.query(sql, params);
      return result.rows;
    };

    const result = await callback(queryFn);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors
    }
    throw err;
  } finally {
    try {
      await client.end();
    } catch {
      // Ignore close errors
    }
  }
}
