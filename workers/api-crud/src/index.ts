/* ================================================================== */
/*  SOS API CRUD — Cloudflare Worker                                   */
/*  Replaces N8N api_crud webhook with edge-native execution           */
/*                                                                     */
/*  Endpoints:                                                         */
/*    POST /api_crud         — 7 CRUD actions (list/create/update/etc.)*/
/*    POST /api_dinamico     — Execute raw SQL (restricted)            */
/*    POST /tables_info      — Table schema introspection              */
/*    GET  /tables           — List all public tables                  */
/*    GET  /health           — Health check                            */
/*    POST /marketplace/*    — Marketplace checkout endpoints          */
/*    POST /cart/*           — Shopping cart endpoints                  */
/*    POST /financial/*      — Financial dashboard endpoints           */
/*    POST /template-packs/* — Template pack management endpoints      */
/*    POST /auth/*           — Authentication endpoints (set-password) */
/* ================================================================== */

import bcrypt from "bcryptjs";
import { executeQuery } from "./db";
import {
  handleDelinquencySummary,
  handleDelinquentCustomers,
  handleMarkOverdue,
  handleMonthlyRevenue,
  handleOverdueEntries,
} from "./financial";
import { signToken, verifyToken, type JwtPayload } from "./jwt";
import {
  handleCancelOrder,
  handleConfirmPayment,
  handleCreateOrderRecords,
  handleOrderSummary,
  handleResolveCustomer,
} from "./marketplace";
import { handleClearCart, handleRemoveCartItem } from "./shopping-cart";
import {
  buildAggregate,
  buildBatchCreate,
  buildCount,
  buildCreate,
  buildDelete,
  buildList,
  buildUpdate,
} from "./sql-builder";
import { handleClearPackData } from "./template-packs";
import type { CrudRequestBody, Env } from "./types";

/* ------------------------------------------------------------------ */
/*  CORS headers — B3 fix: restrict to known domains                   */
/* ------------------------------------------------------------------ */

const ALLOWED_ORIGINS = new Set([
  "https://app.radul.com.br",
  "https://radul.com.br",
  "https://www.radul.com.br",
  "https://api-crud.sosescritura.com.br",
]);

/** Check if origin matches allowed patterns (exact, *.radul.com.br, or localhost) */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow any subdomain of radul.com.br
  if (/^https:\/\/[a-z0-9-]+\.radul\.com\.br$/.test(origin)) return true;
  // Allow localhost for development (any port)
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowedOrigin = isAllowedOrigin(origin)
    ? origin!
    : ALLOWED_ORIGINS.values().next().value!;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Api-Key, X-Request-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Per-request CORS headers set at the start of each fetch */
let _currentCorsHeaders: Record<string, string> = {};

function corsResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ..._currentCorsHeaders,
    ...(extraHeaders ?? {}),
  };

  // Match N8N behavior: empty result = empty string, not []
  const responseBody =
    Array.isArray(body) && body.length === 0 ? "" : JSON.stringify(body);

  return new Response(responseBody, { status, headers });
}

/** B15 fix: sanitize error messages — strip DB internals from user-facing errors */
function sanitizeErrorMessage(raw: string): string {
  // Remove PostgreSQL internal details (column names, table names, constraint names)
  let msg = raw;
  // Strip "relation/column/constraint" references
  msg = msg.replace(
    /\b(relation|column|constraint|index|table|schema)\s+"[^"]+"/gi,
    "$1",
  );
  // Strip "at character N" position hints
  msg = msg.replace(/\s+at character \d+/gi, "");
  // Strip SQL state codes
  msg = msg.replace(/\s*\(SQLSTATE\s+[A-Z0-9]+\)/gi, "");
  // Strip file/line references
  msg = msg.replace(/\s+at\s+[\w./]+:\d+:\d+/g, "");
  return msg.trim();
}

function errorResponse(status: number, message: string): Response {
  // In production, sanitize error messages to prevent info disclosure
  const safeMessage = sanitizeErrorMessage(message);
  return corsResponse(status, { error: safeMessage });
}

/* ------------------------------------------------------------------ */
/*  B10: In-memory rate limiter for auth endpoints                     */
/*  Sliding window per IP — prevents brute-force credential attacks    */
/* ------------------------------------------------------------------ */

interface RateBucket {
  timestamps: number[];
}

/** Per-isolate rate limit store (resets on worker restart/cold start) */
const rateLimitStore = new Map<string, RateBucket>();

/** Clean up old entries every N calls to prevent unbounded memory growth */
let rateLimitCleanupCounter = 0;
const RATE_LIMIT_CLEANUP_INTERVAL = 100;

function rateLimitCleanup(windowMs: number): void {
  const now = Date.now();
  const cutoff = now - windowMs * 2; // Remove entries 2× older than window
  for (const [key, bucket] of rateLimitStore) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Check rate limit for a given key (typically IP + endpoint).
 * Returns true if the request is allowed, false if rate-limited.
 */
function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  // Periodic cleanup
  rateLimitCleanupCounter++;
  if (rateLimitCleanupCounter >= RATE_LIMIT_CLEANUP_INTERVAL) {
    rateLimitCleanupCounter = 0;
    rateLimitCleanup(windowMs);
  }

  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = rateLimitStore.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateLimitStore.set(key, bucket);
  }

  // Remove timestamps outside the window
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= maxRequests) {
    return false; // Rate limited
  }

  bucket.timestamps.push(now);
  return true; // Allowed
}

/** Extract client IP from Cloudflare headers */
function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// Rate limit config per auth endpoint
const AUTH_RATE_LIMITS = {
  "/auth/verify-password": { maxRequests: 10, windowMs: 60_000 }, // 10/min
  "/auth/set-password": { maxRequests: 5, windowMs: 60_000 }, // 5/min
  "/auth/request-password-reset": { maxRequests: 3, windowMs: 60_000 }, // 3/min
  "/auth/confirm-password-reset": { maxRequests: 5, windowMs: 60_000 }, // 5/min
} as const;

/* ------------------------------------------------------------------ */
/*  Auth middleware                                                     */
/* ------------------------------------------------------------------ */

async function authenticate(
  request: Request,
  env: Env,
): Promise<JwtPayload | null> {
  // Priority 1: Check JWT token in Authorization header (Bearer <token>)
  const authHeader = request.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const payload = await verifyToken(token, env.JWT_SECRET);
        if (payload) {
          return payload; // Valid JWT, return user context
        }
      } catch {
        // JWT verification failed, fall through to API key check
      }
    }
  }

  // Priority 2: Fall back to API key check (X-Api-Key header) for backward compatibility
  const apiKey = request.headers.get("X-Api-Key");
  if (apiKey && apiKey === env.API_KEY) {
    // Legacy API key authentication — return a synthetic payload
    // This allows the rest of the code to treat API-key auth like JWT auth
    return {
      sub: "system",
      tenant_id: "*", // API key has access to all tenants (legacy behavior)
      role: "admin",
    };
  }

  // No valid authentication found
  return null;
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
/*  B2 fix: Block destructive DDL and restrict dangerous operations     */
/* ------------------------------------------------------------------ */

/** Dangerous SQL patterns that should never come from the app */
const BLOCKED_SQL_PATTERNS = [
  /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|FUNCTION|TRIGGER|VIEW)\b/i,
  /\bTRUNCATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCOPY\b/i,
  /\bpg_dump\b/i,
  /\bpg_restore\b/i,
  /\bEXECUTE\s+IMMEDIATE\b/i,
  /\bLOAD\s+DATA\b/i,
  /\bINTO\s+OUTFILE\b/i,
  /\bINTO\s+DUMPFILE\b/i,
];

function isBlockedSql(sql: string): boolean {
  const trimmed = sql.trim();
  return BLOCKED_SQL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

async function handleDinamico(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const sql = body.sql as string | undefined;
  if (!sql || typeof sql !== "string") {
    return errorResponse(400, "sql is required");
  }

  // B2: Block destructive DDL statements
  if (isBlockedSql(sql)) {
    console.error("[api_dinamico] BLOCKED destructive SQL attempt");
    return errorResponse(403, "This SQL operation is not allowed");
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

/* ------------------------------------------------------------------ */
/*  Route: POST /resolve-domain                                        */
/*  B6 fix: Server-side domain resolution instead of full tenant dump  */
/* ------------------------------------------------------------------ */

async function handleResolveDomain(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const hostname = String(body.hostname ?? "")
    .toLowerCase()
    .trim();
  const slug = String(body.slug ?? "")
    .toLowerCase()
    .trim();

  if (!hostname && !slug) {
    return errorResponse(400, "hostname or slug is required");
  }

  try {
    // 1. Try slug match first (fast — indexed column)
    if (slug) {
      const slugResult = await executeQuery(
        env,
        `SELECT id, company_name, slug, custom_domains, default_client_role
         FROM tenants
         WHERE slug = $1 AND deleted_at IS NULL
         LIMIT 1`,
        [slug],
      );
      if (slugResult.length > 0) {
        return corsResponse(200, {
          resolved: true,
          tenant: slugResult[0],
          method: "slug",
        });
      }
    }

    // 2. Try custom_domains JSONB containment (server-side, no full table dump)
    if (hostname) {
      const domainResult = await executeQuery(
        env,
        `SELECT id, company_name, slug, custom_domains, default_client_role
         FROM tenants
         WHERE deleted_at IS NULL
           AND custom_domains IS NOT NULL
           AND (
             custom_domains @> $1::jsonb
             OR custom_domains @> $2::jsonb
           )
         LIMIT 1`,
        [JSON.stringify([hostname]), JSON.stringify(hostname)],
      );
      if (domainResult.length > 0) {
        return corsResponse(200, {
          resolved: true,
          tenant: domainResult[0],
          method: "custom_domain",
        });
      }
    }

    // 3. No match
    return corsResponse(200, {
      resolved: false,
      tenant: null,
      method: "none",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[resolve-domain]", message);
    return errorResponse(500, "Domain resolution failed");
  }
}

/* ------------------------------------------------------------------ */
/*  Route: POST /auth/set-password                                     */
/*  Hashes password with bcrypt before storing — replaces plaintext    */
/* ------------------------------------------------------------------ */

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

async function handleSetPassword(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const userId = String(body.user_id ?? "").trim();
  const password = String(body.password ?? "");

  if (!userId) {
    return errorResponse(400, "user_id is required");
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return errorResponse(
      400,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return errorResponse(
      400,
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    );
  }

  try {
    // Verify user exists
    const users = await executeQuery(
      env,
      'SELECT "id" FROM "users" WHERE "id" = $1 AND "deleted_at" IS NULL LIMIT 1',
      [userId],
    );
    if (!Array.isArray(users) || users.length === 0) {
      return errorResponse(404, "User not found");
    }

    // Hash password with bcrypt
    const hash = bcrypt.hashSync(password, BCRYPT_COST);

    // Update user record
    await executeQuery(
      env,
      'UPDATE "users" SET "password_hash" = $1, "updated_at" = NOW() WHERE "id" = $2',
      [hash, userId],
    );

    return corsResponse(200, { success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[auth/set-password]", message);
    return errorResponse(500, "Failed to set password");
  }
}

/* ------------------------------------------------------------------ */
/*  Route: POST /auth/verify-password                                  */
/*  Verifies password against stored hash (bcrypt or plaintext)        */
/*  Also upgrades plaintext hashes to bcrypt on successful verify      */
/*  On success: returns JWT token for bearer authentication (B1)       */
/* ------------------------------------------------------------------ */

async function handleVerifyPassword(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const identifier = String(body.identifier ?? "").trim(); // CPF or email
  const password = String(body.password ?? "");

  if (!identifier || !password) {
    return errorResponse(400, "identifier and password are required");
  }

  try {
    // Look up user by CPF or email
    const users = await executeQuery(
      env,
      'SELECT "id", "password_hash" FROM "users" WHERE ("cpf" = $1 OR "email" = $1) AND "deleted_at" IS NULL LIMIT 1',
      [identifier],
    );

    if (!Array.isArray(users) || users.length === 0) {
      return corsResponse(200, { verified: false });
    }

    const user = users[0] as {
      id: string;
      password_hash: string | null;
    };
    const stored = user.password_hash;

    if (!stored) {
      return corsResponse(200, { verified: false });
    }

    // Detect if stored hash is bcrypt ($2a$ or $2b$ prefix)
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(stored);

    let verified = false;

    if (isBcryptHash) {
      // Modern bcrypt comparison
      verified = bcrypt.compareSync(password, stored);
    } else {
      // Legacy plaintext comparison
      verified = stored === password;

      // Progressive upgrade: hash the plaintext on successful verify
      if (verified) {
        try {
          const hash = bcrypt.hashSync(password, BCRYPT_COST);
          await executeQuery(
            env,
            'UPDATE "users" SET "password_hash" = $1, "updated_at" = NOW() WHERE "id" = $2',
            [hash, user.id],
          );
        } catch {
          // Non-critical: upgrade failed, will retry next login
        }
      }
    }

    // If password verified, generate JWT token (B1 — JWT implementation)
    let response: any = { verified, user_id: verified ? user.id : null };

    if (verified) {
      try {
        const authContext = await resolveUserAuthContext(env, user.id);
        const token = await signToken(
          {
            sub: user.id,
            tenant_id: authContext.tenant_id,
            role: authContext.role,
          },
          env.JWT_SECRET,
        );
        response.token = token;
      } catch (err) {
        // Non-critical: token generation failed
        // User can still authenticate, but won't get JWT
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[auth/verify-password] JWT generation failed:", message);
      }
    }

    return corsResponse(200, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[auth/verify-password]", message);
    return errorResponse(500, "Password verification failed");
  }
}

async function resolveUserAuthContext(
  env: Env,
  userId: string,
): Promise<{ tenant_id: string; role: string }> {
  const fallback = { tenant_id: "", role: "user" };

  // 1) Prefer direct fields on users (legacy/convenience schema)
  try {
    const users = await executeQuery(
      env,
      'SELECT "tenant_id", "role" FROM "users" WHERE "id" = $1 AND "deleted_at" IS NULL LIMIT 1',
      [userId],
    );

    if (Array.isArray(users) && users.length > 0) {
      const row = users[0] as {
        tenant_id?: string | null;
        role?: string | null;
      };
      return {
        tenant_id: String(row.tenant_id ?? ""),
        role: String(row.role ?? "user"),
      };
    }
  } catch {
    // schema may not include users.tenant_id/users.role
  }

  // 2) Fallback to user_tenants + roles (tenant-scoped RBAC schema)
  try {
    const rows = await executeQuery(
      env,
      'SELECT ut."tenant_id", COALESCE(r."key", r."name", $2) AS role FROM "user_tenants" ut LEFT JOIN "roles" r ON r."id" = ut."role_id" WHERE ut."user_id" = $1 AND ut."deleted_at" IS NULL ORDER BY ut."created_at" ASC LIMIT 1',
      [userId, fallback.role],
    );

    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0] as {
        tenant_id?: string | null;
        role?: string | null;
      };
      return {
        tenant_id: String(row.tenant_id ?? ""),
        role: String(row.role ?? fallback.role),
      };
    }
  } catch {
    // ignore and fallback below
  }

  return fallback;
}
/* ------------------------------------------------------------------ */
/*  Route: POST /auth/request-password-reset                           */
/*  Generates a reset token valid for 24 hours                         */
/*  Token can be redeemed via POST /auth/confirm-password-reset        */
/* ------------------------------------------------------------------ */

async function handleRequestPasswordReset(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const identifier = String(body.identifier ?? "").trim(); // CPF or email

  if (!identifier) {
    return errorResponse(400, "identifier (CPF or email) is required");
  }

  try {
    // 1. Look up user
    const users = await executeQuery(
      env,
      'SELECT "id", "email" FROM "users" WHERE ("cpf" = $1 OR "email" = $1) AND "deleted_at" IS NULL LIMIT 1',
      [identifier],
    );

    if (!Array.isArray(users) || users.length === 0) {
      // Always return success to prevent user enumeration
      return corsResponse(200, {
        success: true,
        message:
          "If the account exists, a reset link will be sent to your email",
      });
    }

    const user = users[0] as { id: string; email: string };

    // 2. Generate a cryptographically secure random token (32 bytes = 64 hex chars)
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(randomBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    // 3. Calculate expiration (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // 4. Insert token into password_reset_tokens table
    // First, delete any existing unused tokens for this user
    await executeQuery(
      env,
      "UPDATE password_reset_tokens SET deleted_at = NOW() WHERE user_id = $1 AND used_at IS NULL AND deleted_at IS NULL",
      [user.id],
    );

    // Now insert the new token
    await executeQuery(
      env,
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.id, token, expiresAt],
    );

    // 5. Return token to client
    // NOTE: In production, the token would be sent via email by N8N webhook.
    // For now, we return it directly for testing/demo purposes.
    return corsResponse(200, {
      success: true,
      token,
      message:
        "Reset token generated. Valid for 24 hours. Send this to the client via email.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[auth/request-password-reset]", message);
    return errorResponse(500, "Failed to generate reset token");
  }
}

/* ------------------------------------------------------------------ */
/*  Route: POST /auth/confirm-password-reset                           */
/*  Validates reset token and sets new password                        */
/*  Returns JWT token on success for immediate login                   */
/* ------------------------------------------------------------------ */

async function handleConfirmPasswordReset(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const token = String(body.token ?? "").trim();
  const newPassword = String(body.new_password ?? "");

  if (!token) {
    return errorResponse(400, "token is required");
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return errorResponse(
      400,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return errorResponse(
      400,
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    );
  }

  try {
    // 1. Look up the token (must be valid and not expired/used)
    const tokens = await executeQuery(
      env,
      "SELECT user_id FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL AND deleted_at IS NULL LIMIT 1",
      [token],
    );

    if (!Array.isArray(tokens) || tokens.length === 0) {
      return corsResponse(200, {
        verified: false,
        message: "Token is invalid or expired",
      });
    }

    const tokenRecord = tokens[0] as { user_id: string };
    const userId = tokenRecord.user_id;

    // 2. Hash the new password
    const hash = bcrypt.hashSync(newPassword, BCRYPT_COST);

    // 3. Update user password
    await executeQuery(
      env,
      'UPDATE "users" SET "password_hash" = $1, "updated_at" = NOW() WHERE "id" = $2',
      [hash, userId],
    );

    // 4. Mark token as used
    await executeQuery(
      env,
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1",
      [token],
    );

    // 5. Generate JWT token for immediate login
    let response: any = { verified: true };

    try {
      const authContext = await resolveUserAuthContext(env, userId);
      const jwtToken = await signToken(
        {
          sub: userId,
          tenant_id: authContext.tenant_id,
          role: authContext.role,
        },
        env.JWT_SECRET,
      );
      response.token = jwtToken;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        "[auth/confirm-password-reset] JWT generation failed:",
        message,
      );
    }

    return corsResponse(200, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[auth/confirm-password-reset]", message);
    return errorResponse(500, "Password reset failed");
  }
}

/* ================================================================== */
/*  Main fetch handler                                                 */
/* ================================================================== */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Set per-request CORS headers based on Origin
    _currentCorsHeaders = getCorsHeaders(request);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: _currentCorsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check — no auth required
    if (path === "/health" || path === "/") {
      return handleHealth(env);
    }

    // Auth routes — public endpoints (no auth required)
    if (request.method === "POST" && path.startsWith("/auth/")) {
      // B10: Enforce rate limiting on auth endpoints before processing
      const rateConfig =
        AUTH_RATE_LIMITS[path as keyof typeof AUTH_RATE_LIMITS];
      if (rateConfig) {
        const clientIp = getClientIp(request);
        const rateLimitKey = `${clientIp}:${path}`;
        if (
          !checkRateLimit(
            rateLimitKey,
            rateConfig.maxRequests,
            rateConfig.windowMs,
          )
        ) {
          return errorResponse(
            429,
            "Too many requests. Please try again later.",
          );
        }
      }

      const body = (await request.json()) as Record<string, unknown>;
      switch (path) {
        case "/auth/set-password":
          return handleSetPassword(body, env);
        case "/auth/verify-password":
          return handleVerifyPassword(body, env);
        case "/auth/request-password-reset":
          return handleRequestPasswordReset(body, env);
        case "/auth/confirm-password-reset":
          return handleConfirmPasswordReset(body, env);
        default:
          return errorResponse(404, "Not found: " + path);
      }
    }

    // Auth check for all other routes
    const authPayload = await authenticate(request, env);
    if (!authPayload) {
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

      // Route: POST /resolve-domain — B6: server-side tenant resolution
      if (request.method === "POST" && path === "/resolve-domain") {
        const body = (await request.json()) as Record<string, unknown>;
        return handleResolveDomain(body, env);
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

      // Route: POST /cart/* — shopping cart endpoints
      if (request.method === "POST" && path.startsWith("/cart/")) {
        const body = (await request.json()) as Record<string, unknown>;
        switch (path) {
          case "/cart/remove-item":
            return handleRemoveCartItem(body, env);
          case "/cart/clear":
            return handleClearCart(body, env);
          default:
            return errorResponse(404, "Not found: " + path);
        }
      }

      // Route: POST /financial/* — financial dashboard endpoints
      if (request.method === "POST" && path.startsWith("/financial/")) {
        const body = (await request.json()) as Record<string, unknown>;
        switch (path) {
          case "/financial/monthly-revenue":
            return handleMonthlyRevenue(body, env);
          case "/financial/delinquent-customers":
            return handleDelinquentCustomers(body, env);
          case "/financial/overdue-entries":
            return handleOverdueEntries(body, env);
          case "/financial/delinquency-summary":
            return handleDelinquencySummary(body, env);
          case "/financial/mark-overdue":
            return handleMarkOverdue(body, env);
          default:
            return errorResponse(404, "Not found: " + path);
        }
      }

      // Route: POST /template-packs/* — template pack management endpoints
      if (request.method === "POST" && path.startsWith("/template-packs/")) {
        const body = (await request.json()) as Record<string, unknown>;
        switch (path) {
          case "/template-packs/clear":
            return handleClearPackData(body, env);
          default:
            return errorResponse(404, "Not found: " + path);
        }
      }

      return errorResponse(404, "Not found: " + path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[worker_error]", path, message);
      // B15: Don't leak full error details to client
      return errorResponse(500, "Internal server error");
    }
  },
};
