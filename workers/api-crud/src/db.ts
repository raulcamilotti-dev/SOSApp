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
