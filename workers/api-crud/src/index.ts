/* ================================================================== */
/*  SOS API CRUD — Cloudflare Worker                                   */
/*  Replaces N8N api_crud webhook with edge-native execution           */
/*                                                                     */
/*  Endpoints:                                                         */
/*    POST /api_crud      — 7 CRUD actions (list/create/update/etc.)   */
/*    POST /api_dinamico  — Execute raw SQL (restricted)               */
/*    POST /tables_info   — Table schema introspection                 */
/*    GET  /tables        — List all public tables                     */
/*    GET  /health        — Health check                               */
/*    POST /marketplace/* — Dedicated marketplace checkout endpoints   */
/* ================================================================== */

import { executeQuery } from "./db";
import {
    handleCancelOrder,
    handleConfirmPayment,
    handleCreateOrderRecords,
    handleOrderSummary,
    handleResolveCustomer,
} from "./marketplace";
import {
    buildAggregate,
    buildBatchCreate,
    buildCount,
    buildCreate,
    buildDelete,
    buildList,
    buildUpdate,
} from "./sql-builder";
import type { CrudRequestBody, Env } from "./types";

/* ------------------------------------------------------------------ */
/*  CORS headers                                                       */
/* ------------------------------------------------------------------ */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Api-Key, X-Request-Id",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
    ...(extraHeaders ?? {}),
  };

  // Match N8N behavior: empty result = empty string, not []
  const responseBody =
    Array.isArray(body) && body.length === 0 ? "" : JSON.stringify(body);

  return new Response(responseBody, { status, headers });
}

function errorResponse(status: number, message: string): Response {
  return corsResponse(status, { error: message });
}

/* ------------------------------------------------------------------ */
/*  Auth middleware                                                     */
/* ------------------------------------------------------------------ */

function authenticate(request: Request, env: Env): boolean {
  // API key from header (same pattern as N8N Header Auth)
  const apiKey = request.headers.get("X-Api-Key");
  if (!apiKey) return false;
  return apiKey === env.API_KEY;
}

/* ------------------------------------------------------------------ */
/*  Route: POST /api_crud                                              */
/* ------------------------------------------------------------------ */

async function handleCrud(body: CrudRequestBody, env: Env): Promise<Response> {
  const action = (body.action || "").toLowerCase();

  try {
    let queryResult;

    switch (action) {
      case "list":
        queryResult = buildList(body);
        break;
      case "create":
        queryResult = buildCreate(body);
        break;
      case "update":
        queryResult = buildUpdate(body);
        break;
      case "delete":
        queryResult = buildDelete(body);
        break;
      case "count":
        queryResult = buildCount(body);
        break;
      case "aggregate":
        queryResult = buildAggregate(body);
        break;
      case "batch_create":
        queryResult = buildBatchCreate(body);
        break;
      default:
        return errorResponse(400, "Unknown action: " + action);
    }

    const rows = await executeQuery(env, queryResult.query, queryResult.params);
    return corsResponse(200, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api_crud]", action, body.table, message);
    return errorResponse(400, message);
  }
}

/* ------------------------------------------------------------------ */
/*  Route: POST /api_dinamico                                          */
/* ------------------------------------------------------------------ */

async function handleDinamico(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const sql = body.sql as string | undefined;
  if (!sql || typeof sql !== "string") {
    return errorResponse(400, "sql is required");
  }

  try {
    const rows = await executeQuery(env, sql);
    return corsResponse(200, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api_dinamico]", message);
    return errorResponse(400, message);
  }
}

/* ------------------------------------------------------------------ */
/*  Route: POST /tables_info                                           */
/* ------------------------------------------------------------------ */

async function handleTablesInfo(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const tableName = body.table_name as string | undefined;
  if (!tableName) {
    return errorResponse(400, "table_name is required");
  }

  // Validate table name to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    return errorResponse(400, "Invalid table_name: " + tableName);
  }

  const query = `
    SELECT
      c.column_name,
      c.data_type,
      c.udt_name,
      c.is_nullable,
      c.column_default,
      fk.referenced_table_name,
      fk.referenced_column_name
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT
        kcu.column_name,
        ccu.table_name AS referenced_table_name,
        ccu.column_name AS referenced_column_name
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.constraint_column_usage ccu
        ON kcu.constraint_name = ccu.constraint_name
        AND kcu.constraint_schema = ccu.constraint_schema
      JOIN information_schema.table_constraints tc
        ON tc.constraint_name = kcu.constraint_name
        AND tc.constraint_schema = kcu.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND kcu.table_schema = 'public'
        AND kcu.table_name = $1
    ) fk ON fk.column_name = c.column_name
    WHERE c.table_schema = 'public'
      AND c.table_name = $1
    ORDER BY c.ordinal_position
  `;

  try {
    const rows = await executeQuery(env, query, [tableName]);
    return corsResponse(200, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(400, message);
  }
}

/* ------------------------------------------------------------------ */
/*  Route: GET /tables                                                 */
/* ------------------------------------------------------------------ */

async function handleTables(env: Env): Promise<Response> {
  const query = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  try {
    const rows = await executeQuery(env, query);
    return corsResponse(200, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(400, message);
  }
}

/* ------------------------------------------------------------------ */
/*  Health check                                                       */
/* ------------------------------------------------------------------ */

async function handleHealth(env: Env): Promise<Response> {
  try {
    const rows = await executeQuery(env, "SELECT 1 AS ok");
    return corsResponse(200, {
      status: "ok",
      timestamp: new Date().toISOString(),
      db: rows.length > 0 ? "connected" : "error",
    });
  } catch (err) {
    return corsResponse(503, {
      status: "error",
      timestamp: new Date().toISOString(),
      db: "disconnected",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Route: POST /dns/create-subdomain                                  */
/*  Creates {slug}.radul.com.br → A record pointing to server IP       */
/* ------------------------------------------------------------------ */

const DNS_TARGET_IP = "104.248.63.102";
const DNS_ZONE_DOMAIN = "radul.com.br";

async function handleDnsCreateSubdomain(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const slug = (body.slug as string | undefined)?.trim();
  if (!slug) {
    return errorResponse(400, "slug is required");
  }

  // Validate slug format (URL-safe, lowercase, no dots)
  if (!/^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/.test(slug)) {
    return errorResponse(400, "Invalid slug format: " + slug);
  }

  // Prevent creating records for reserved subdomains
  const RESERVED = new Set([
    "app",
    "api",
    "www",
    "mail",
    "smtp",
    "imap",
    "pop",
    "ftp",
    "admin",
    "ns1",
    "ns2",
    "cdn",
    "static",
    "assets",
    "staging",
    "dev",
    "test",
    "n8n",
    "api-crud",
  ]);
  if (RESERVED.has(slug)) {
    return errorResponse(400, "Reserved subdomain: " + slug);
  }

  const apiKey = env.CLOUDFLARE_DNS_API_KEY;
  const email = env.CLOUDFLARE_DNS_EMAIL;
  const zoneId = env.CLOUDFLARE_ZONE_ID;

  if (!apiKey || !email || !zoneId) {
    console.error(
      "[dns] Missing CLOUDFLARE_DNS_API_KEY, CLOUDFLARE_DNS_EMAIL, or CLOUDFLARE_ZONE_ID",
    );
    return errorResponse(500, "DNS service not configured");
  }

  const recordName = `${slug}.${DNS_ZONE_DOMAIN}`;

  try {
    // 1. Check if the record already exists
    const listUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(recordName)}`;
    const listRes = await fetch(listUrl, {
      headers: {
        "X-Auth-Key": apiKey,
        "X-Auth-Email": email,
        "Content-Type": "application/json",
      },
    });
    const listData = (await listRes.json()) as {
      success: boolean;
      result: { id: string; name: string }[];
    };

    if (listData.success && listData.result?.length > 0) {
      // Record already exists — return success (idempotent)
      return corsResponse(200, {
        success: true,
        message: "DNS record already exists",
        record_name: recordName,
        existing: true,
      });
    }

    // 2. Create the A record with proxy enabled
    const createUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        "X-Auth-Key": apiKey,
        "X-Auth-Email": email,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "A",
        name: slug, // Cloudflare auto-appends the zone domain
        content: DNS_TARGET_IP,
        ttl: 1, // 1 = automatic
        proxied: true,
      }),
    });

    const createData = (await createRes.json()) as {
      success: boolean;
      errors?: { message: string }[];
      result?: { id: string; name: string };
    };

    if (!createData.success) {
      const errMsg =
        createData.errors?.map((e) => e.message).join(", ") ||
        "Unknown Cloudflare error";
      console.error("[dns] Cloudflare create error:", errMsg);
      return errorResponse(400, "DNS creation failed: " + errMsg);
    }

    return corsResponse(200, {
      success: true,
      message: "DNS record created",
      record_name: recordName,
      record_id: createData.result?.id,
      existing: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[dns] Error:", message);
    return errorResponse(500, "DNS creation error: " + message);
  }
}

/* ================================================================== */
/*  Main fetch handler                                                 */
/* ================================================================== */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check — no auth required
    if (path === "/health" || path === "/") {
      return handleHealth(env);
    }

    // Auth check for all other routes
    if (!authenticate(request, env)) {
      return errorResponse(401, "Unauthorized");
    }

    try {
      // Route: POST /api_crud  (or /webhook/api_crud for backward compat)
      if (
        request.method === "POST" &&
        (path === "/api_crud" || path === "/webhook/api_crud")
      ) {
        const body = (await request.json()) as CrudRequestBody;
        return handleCrud(body, env);
      }

      // Route: POST /api_dinamico (or /webhook/api_dinamico)
      if (
        request.method === "POST" &&
        (path === "/api_dinamico" || path === "/webhook/api_dinamico")
      ) {
        const body = (await request.json()) as Record<string, unknown>;
        return handleDinamico(body, env);
      }

      // Route: POST /tables_info (or /webhook/tables_info)
      if (
        request.method === "POST" &&
        (path === "/tables_info" || path === "/webhook/tables_info")
      ) {
        const body = (await request.json()) as Record<string, unknown>;
        return handleTablesInfo(body, env);
      }

      // Route: GET /tables (or /webhook/tables)
      if (
        request.method === "GET" &&
        (path === "/tables" || path === "/webhook/tables")
      ) {
        return handleTables(env);
      }

      // Route: POST /dns/create-subdomain
      if (request.method === "POST" && path === "/dns/create-subdomain") {
        const body = (await request.json()) as Record<string, unknown>;
        return handleDnsCreateSubdomain(body, env);
      }

      // Route: POST /marketplace/* — dedicated marketplace endpoints
      if (request.method === "POST" && path.startsWith("/marketplace/")) {
        const body = (await request.json()) as Record<string, unknown>;
        switch (path) {
          case "/marketplace/resolve-customer":
            return handleResolveCustomer(body, env);
          case "/marketplace/order-summary":
            return handleOrderSummary(body, env);
          case "/marketplace/create-order-records":
            return handleCreateOrderRecords(body, env);
          case "/marketplace/confirm-payment":
            return handleConfirmPayment(body, env);
          case "/marketplace/cancel-order":
            return handleCancelOrder(body, env);
          default:
            return errorResponse(404, "Not found: " + path);
        }
      }

      return errorResponse(404, "Not found: " + path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[worker_error]", path, message);
      return errorResponse(500, "Internal error: " + message);
    }
  },
};
