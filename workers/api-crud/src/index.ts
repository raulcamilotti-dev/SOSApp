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
/*    GET  /v1/:table        — Public REST API (API key auth)          */
/*    POST /marketplace/*    — Marketplace checkout endpoints          */
/*    POST /cart/*           — Shopping cart endpoints                  */
/*    POST /financial/*      — Financial dashboard endpoints           */
/*    POST /template-packs/* — Template pack management endpoints      */
/*    POST /auth/*           — Authentication endpoints (set-password) */
/* ================================================================== */

import bcrypt from "bcryptjs";
import { generateApiKey } from "./api-key-auth";
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
import { handlePublicApiRequest } from "./public-api";
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
  "https://app.sosescritura.com.br",
  "https://sosescritura.com.br",
  "https://www.sosescritura.com.br",
]);

/** Check if origin matches allowed patterns (exact, *.radul.com.br, *.sosescritura.com.br, or localhost) */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow any subdomain of radul.com.br
  if (/^https:\/\/[a-z0-9-]+\.radul\.com\.br$/.test(origin)) return true;
  // Allow any subdomain of sosescritura.com.br
  if (/^https:\/\/[a-z0-9-]+\.sosescritura\.com\.br$/.test(origin)) return true;
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
  "/auth/login": { maxRequests: 10, windowMs: 60_000 }, // 10/min
  "/auth/google": { maxRequests: 10, windowMs: 60_000 }, // 10/min
  "/auth/register": { maxRequests: 5, windowMs: 60_000 }, // 5/min
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

/** Internal tenant resolution — reusable by auth endpoints and /resolve-domain */
interface ResolvedTenant {
  id: string;
  company_name: string;
  slug: string;
  custom_domains: unknown;
  default_client_role: string;
}
interface TenantResolution {
  resolved: boolean;
  tenant: ResolvedTenant | null;
  method: "slug" | "custom_domain" | "none";
}

async function resolveTenantInternal(
  env: Env,
  slug?: string,
  hostname?: string,
): Promise<TenantResolution> {
  const cleanSlug = (slug ?? "").toLowerCase().trim();
  const cleanHostname = (hostname ?? "").toLowerCase().trim();

  if (!cleanSlug && !cleanHostname) {
    return { resolved: false, tenant: null, method: "none" };
  }

  // 1. Try slug match first (fast — indexed column)
  if (cleanSlug) {
    const slugResult = await executeQuery(
      env,
      `SELECT id, company_name, slug, custom_domains, default_client_role
       FROM tenants
       WHERE slug = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [cleanSlug],
    );
    if (slugResult.length > 0) {
      return {
        resolved: true,
        tenant: slugResult[0] as ResolvedTenant,
        method: "slug",
      };
    }
  }

  // 2. Try custom_domains JSONB containment
  if (cleanHostname) {
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
      [JSON.stringify([cleanHostname]), JSON.stringify(cleanHostname)],
    );
    if (domainResult.length > 0) {
      return {
        resolved: true,
        tenant: domainResult[0] as ResolvedTenant,
        method: "custom_domain",
      };
    }
  }

  return { resolved: false, tenant: null, method: "none" };
}

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
    const result = await resolveTenantInternal(env, slug, hostname);
    return corsResponse(200, result);
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

    return corsResponse(200, { success: true, user_id: userId });
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
        // Expose role and tenant_id at top level for N8N workflow consumption
        response.role = authContext.role;
        response.tenant_id = authContext.tenant_id;
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
  forTenantId?: string,
): Promise<{ tenant_id: string; role: string }> {
  const fallback = { tenant_id: "", role: "user" };

  // Resolve tenant + role from user_tenants + roles (tenant-scoped RBAC)
  // NOTE: We do NOT use users.role (global) anymore — it causes cross-tenant contamination.
  // The per-tenant role from user_tenants.role_id → roles is the source of truth.
  try {
    let rows: unknown[];
    if (forTenantId) {
      // Specific tenant — filter by tenant_id
      rows = await executeQuery(
        env,
        'SELECT ut."tenant_id", COALESCE(r."key", r."name", \'user\') AS role FROM "user_tenants" ut LEFT JOIN "roles" r ON r."id" = ut."role_id" WHERE ut."user_id" = $1 AND ut."tenant_id" = $2 AND ut."deleted_at" IS NULL LIMIT 1',
        [userId, forTenantId],
      );
    } else {
      // No specific tenant — get the first linked tenant (fallback scenario)
      rows = await executeQuery(
        env,
        'SELECT ut."tenant_id", COALESCE(r."key", r."name", \'user\') AS role FROM "user_tenants" ut LEFT JOIN "roles" r ON r."id" = ut."role_id" WHERE ut."user_id" = $1 AND ut."deleted_at" IS NULL ORDER BY ut."created_at" ASC LIMIT 1',
        [userId],
      );
    }

    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0] as {
        tenant_id?: string | null;
        role?: string | null;
      };
      return {
        tenant_id: String(row.tenant_id ?? ""),
        role: String(row.role ?? "user"),
      };
    }
  } catch {
    // ignore and fallback below
  }

  // No user_tenants record — return safe default
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

/* ------------------------------------------------------------------ */
/*  Route: POST /auth/register                                         */
/*  Creates new user (or recovers existing without password) and       */
/*  auto-links to tenant resolved from hostname/slug.                  */
/*  Returns { user, token } for immediate login.                       */
/* ------------------------------------------------------------------ */

async function handleRegister(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const cpf = String(body.cpf ?? "")
    .replace(/\D/g, "")
    .trim();
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");
  const hostname = String(body.hostname ?? "").trim();
  const tenantSlug = String(body.tenant_slug ?? "").trim();

  if (!cpf) {
    return errorResponse(400, "CPF é obrigatório");
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return errorResponse(
      400,
      `Senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return errorResponse(
      400,
      `Senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres`,
    );
  }
  if (!name) {
    return errorResponse(400, "Nome é obrigatório");
  }

  try {
    // 1. Check if user already exists by CPF
    const existing = await executeQuery(
      env,
      'SELECT "id", "password_hash", "fullname", "email", "phone", "role" FROM "users" WHERE "cpf" = $1 AND "deleted_at" IS NULL LIMIT 1',
      [cpf],
    );

    let userId: string;
    let userRole: string;
    let userFullname: string;
    let userEmail: string;
    let userPhone: string;

    if (existing.length > 0) {
      const existingUser = existing[0] as {
        id: string;
        password_hash: string | null;
        fullname: string | null;
        email: string | null;
        phone: string | null;
        role: string | null;
      };

      if (existingUser.password_hash) {
        // User already has a password — cannot re-register
        return errorResponse(
          409,
          "CPF já cadastrado. Faça login ou recupere sua senha.",
        );
      }

      // User exists but has no password (pre-created) — set password and use existing
      const hash = bcrypt.hashSync(password, BCRYPT_COST);
      await executeQuery(
        env,
        'UPDATE "users" SET "password_hash" = $1, "fullname" = COALESCE(NULLIF($2, \'\'), "fullname"), "email" = COALESCE(NULLIF($3, \'\'), "email"), "phone" = COALESCE(NULLIF($4, \'\'), "phone"), "updated_at" = NOW() WHERE "id" = $5',
        [hash, name, email, phone, existingUser.id],
      );

      userId = existingUser.id;
      userRole = existingUser.role ?? "user";
      userFullname = name || existingUser.fullname || "";
      userEmail = email || existingUser.email || "";
      userPhone = phone || existingUser.phone || "";
    } else {
      // 2. Create new user
      const hash = bcrypt.hashSync(password, BCRYPT_COST);
      const newId = crypto.randomUUID();
      await executeQuery(
        env,
        'INSERT INTO "users" ("id", "cpf", "email", "fullname", "phone", "password_hash", "role", "created_at", "updated_at") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
        [newId, cpf, email || null, name, phone || null, hash, "user"],
      );
      userId = newId;
      userRole = "user";
      userFullname = name;
      userEmail = email;
      userPhone = phone;
    }

    // 3. Resolve tenant from hostname/slug
    let tenantId = "";
    try {
      let tenantResolution = await resolveTenantInternal(
        env,
        tenantSlug,
        hostname,
      );

      // Platform root fallback: if resolution failed and hostname is a platform root,
      // derive slug from root domain and try again (e.g., app.radul.com.br → slug "radul")
      if (!tenantResolution.resolved && !tenantSlug) {
        const PLATFORM_ROOT_HOSTS = new Set([
          "app.radul.com.br",
          "www.radul.com.br",
          "radul.com.br",
        ]);
        const cleanHost = hostname.toLowerCase().trim();
        if (PLATFORM_ROOT_HOSTS.has(cleanHost)) {
          const platformSlug = "radul";
          tenantResolution = await resolveTenantInternal(env, platformSlug);
        }
      }

      if (tenantResolution.resolved && tenantResolution.tenant) {
        const tenant = tenantResolution.tenant;
        tenantId = tenant.id;

        // Check if user_tenants link already exists
        const existingLink = await executeQuery(
          env,
          'SELECT "user_id" FROM "user_tenants" WHERE "user_id" = $1 AND "tenant_id" = $2 AND "deleted_at" IS NULL LIMIT 1',
          [userId, tenantId],
        );

        if (existingLink.length === 0) {
          // Find role_id for the tenant's default_client_role
          // IMPORTANT: Filter by tenant_id to avoid cross-tenant role contamination
          const defaultRole = tenant.default_client_role || "client";
          let roleId: string | null = null;
          try {
            const roles = await executeQuery(
              env,
              'SELECT "id" FROM "roles" WHERE ("key" = $1 OR "name" = $1) AND "tenant_id" = $2 AND "deleted_at" IS NULL LIMIT 1',
              [defaultRole, tenantId],
            );
            if (roles.length > 0) {
              roleId = (roles[0] as { id: string }).id;
            }
          } catch {
            /* role lookup non-critical */
          }

          // Create user_tenants link
          await executeQuery(
            env,
            'INSERT INTO "user_tenants" ("id", "user_id", "tenant_id", "role_id", "is_active", "created_at") VALUES ($1, $2, $3, $4, true, NOW())',
            [crypto.randomUUID(), userId, tenantId, roleId],
          );

          // Update role from tenant context
          if (defaultRole) userRole = defaultRole;
        }

        // Persist tenant_id on the users table for convenience (last-used tenant).
        // NOTE: We intentionally do NOT update users.role globally here.
        // Per-tenant roles are managed exclusively via user_tenants.role_id → roles.
        // Writing role globally would contaminate cross-tenant sessions.
        try {
          await executeQuery(
            env,
            'UPDATE "users" SET "tenant_id" = $1, "updated_at" = NOW() WHERE "id" = $2',
            [tenantId, userId],
          );
        } catch {
          /* best-effort sync */
        }
      }
    } catch (err) {
      // Tenant resolution/linking is best-effort — never breaks registration
      console.warn(
        "[auth/register] Tenant auto-link failed:",
        err instanceof Error ? err.message : String(err),
      );
    }

    // 4. Generate JWT
    const token = await signToken(
      { sub: userId, tenant_id: tenantId, role: userRole },
      env.JWT_SECRET,
    );

    // 5. Return user + token
    return corsResponse(200, {
      user: {
        id: userId,
        cpf,
        email: userEmail,
        fullname: userFullname,
        phone: userPhone,
        role: userRole,
        tenant_id: tenantId || null,
      },
      token,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[auth/register]", message);
    return errorResponse(500, "Falha no registro. Tente novamente.");
  }
}

/* ------------------------------------------------------------------ */
/*  Route: POST /auth/login                                            */
/*  Verifies credentials and resolves tenant from hostname/slug.       */
/*  Auto-links user to tenant if not already linked.                   */
/*  Returns { user, token } with full user data.                       */
/* ------------------------------------------------------------------ */

async function handleLogin(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const identifier = String(body.cpf ?? body.identifier ?? "").trim();
  const password = String(body.password ?? "");
  const hostname = String(body.hostname ?? "").trim();
  const tenantSlug = String(body.tenant_slug ?? "").trim();

  if (!identifier || !password) {
    return errorResponse(400, "CPF/email e senha são obrigatórios");
  }

  try {
    // 1. Find user by CPF or email
    const users = await executeQuery(
      env,
      'SELECT "id", "cpf", "email", "fullname", "phone", "role", "password_hash" FROM "users" WHERE ("cpf" = $1 OR "email" = $1) AND "deleted_at" IS NULL LIMIT 1',
      [identifier],
    );

    if (users.length === 0) {
      return errorResponse(401, "Credenciais inválidas");
    }

    const user = users[0] as {
      id: string;
      cpf: string | null;
      email: string | null;
      fullname: string | null;
      phone: string | null;
      role: string | null;
      password_hash: string | null;
    };

    if (!user.password_hash) {
      return errorResponse(401, "Credenciais inválidas");
    }

    // 2. Verify password
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(user.password_hash);
    let verified = false;

    if (isBcryptHash) {
      verified = bcrypt.compareSync(password, user.password_hash);
    } else {
      // Legacy plaintext comparison + progressive upgrade
      verified = user.password_hash === password;
      if (verified) {
        try {
          const hash = bcrypt.hashSync(password, BCRYPT_COST);
          await executeQuery(
            env,
            'UPDATE "users" SET "password_hash" = $1, "updated_at" = NOW() WHERE "id" = $2',
            [hash, user.id],
          );
        } catch {
          /* upgrade non-critical */
        }
      }
    }

    if (!verified) {
      return errorResponse(401, "Credenciais inválidas");
    }

    // 3. Resolve tenant from hostname/slug and auto-link
    // IMPORTANT: Do NOT use user.role (global) as the starting value.
    // The per-tenant role from user_tenants.role_id is the source of truth.
    // Using user.role would cause cross-tenant role contamination (e.g., user
    // who is admin on tenant A would appear as admin on tenant B).
    let userRole = "user";
    let tenantId = "";

    try {
      const tenantResolution = await resolveTenantInternal(
        env,
        tenantSlug,
        hostname,
      );
      if (tenantResolution.resolved && tenantResolution.tenant) {
        const tenant = tenantResolution.tenant;
        tenantId = tenant.id;

        // Check if user_tenants link exists for this tenant
        // COALESCE fallback is "user" (safe default) — never use the global users.role
        const existingLink = await executeQuery(
          env,
          'SELECT ut."tenant_id", COALESCE(r."key", r."name", \'user\') AS role FROM "user_tenants" ut LEFT JOIN "roles" r ON r."id" = ut."role_id" WHERE ut."user_id" = $1 AND ut."tenant_id" = $2 AND ut."deleted_at" IS NULL LIMIT 1',
          [user.id, tenantId],
        );

        if (existingLink.length > 0) {
          // User already linked — use the role from that link
          const link = existingLink[0] as { tenant_id: string; role: string };
          userRole = link.role;
        } else {
          // Auto-link user to tenant (best-effort)
          const defaultRole = tenant.default_client_role || "client";
          let roleId: string | null = null;
          try {
            const roles = await executeQuery(
              env,
              'SELECT "id" FROM "roles" WHERE ("key" = $1 OR "name" = $1) AND "tenant_id" = $2 AND "deleted_at" IS NULL LIMIT 1',
              [defaultRole, tenantId],
            );
            if (roles.length > 0) {
              roleId = (roles[0] as { id: string }).id;
            }
          } catch {
            /* role lookup non-critical */
          }

          try {
            await executeQuery(
              env,
              'INSERT INTO "user_tenants" ("id", "user_id", "tenant_id", "role_id", "is_active", "created_at") VALUES ($1, $2, $3, $4, true, NOW())',
              [crypto.randomUUID(), user.id, tenantId, roleId],
            );
            userRole = defaultRole;
          } catch {
            /* auto-link non-critical */
          }
        }
      } else {
        // No tenant from hostname — fallback to existing user_tenants (first link)
        const authContext = await resolveUserAuthContext(env, user.id);
        tenantId = authContext.tenant_id;
        userRole = authContext.role;
      }
    } catch {
      // Tenant resolution failed — fallback to existing context
      const authContext = await resolveUserAuthContext(env, user.id);
      tenantId = authContext.tenant_id;
      userRole = authContext.role;
    }

    // 4. Generate JWT
    const token = await signToken(
      { sub: user.id, tenant_id: tenantId, role: userRole },
      env.JWT_SECRET,
    );

    // 5. Return user + token
    return corsResponse(200, {
      user: {
        id: user.id,
        cpf: user.cpf,
        email: user.email,
        fullname: user.fullname,
        phone: user.phone,
        role: userRole,
        tenant_id: tenantId || null,
      },
      token,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[auth/login]", message);
    return errorResponse(500, "Falha no login. Tente novamente.");
  }
}

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string;
  exp?: string;
  iss?: string;
  name?: string;
  picture?: string;
  sub?: string;
}

function parseAllowedGoogleClientIds(env: Env): Set<string> {
  const raw = String(env.GOOGLE_CLIENT_IDS ?? "").trim();
  if (!raw) return new Set();
  const ids = raw
    .split(/[,\s;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(ids);
}

async function verifyGoogleIdToken(
  idToken: string,
  env: Env,
): Promise<GoogleTokenInfo> {
  const tokenInfoUrl = new URL("https://oauth2.googleapis.com/tokeninfo");
  tokenInfoUrl.searchParams.set("id_token", idToken);

  const response = await fetch(tokenInfoUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Token do Google inválido");
  }

  const payload = (await response.json()) as GoogleTokenInfo & {
    error_description?: string;
  };

  if (!payload.sub) {
    throw new Error("Token do Google sem identificador");
  }

  const issuer = String(payload.iss ?? "").trim();
  const validIssuer =
    issuer === "accounts.google.com" ||
    issuer === "https://accounts.google.com";
  if (!validIssuer) {
    throw new Error("Emissor do token Google inválido");
  }

  const expUnix = Number(payload.exp ?? "0");
  if (!Number.isFinite(expUnix) || expUnix <= Math.floor(Date.now() / 1000)) {
    throw new Error("Token do Google expirado");
  }

  const allowedClientIds = parseAllowedGoogleClientIds(env);
  const aud = String(payload.aud ?? "").trim();
  if (allowedClientIds.size > 0 && (!aud || !allowedClientIds.has(aud))) {
    throw new Error("Token Google com client_id não autorizado");
  }

  return payload;
}

async function handleGoogleLogin(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const idToken = String(body.id_token ?? "").trim();
  const hostname = String(body.hostname ?? "").trim();
  const tenantSlug = String(body.tenant_slug ?? "").trim();

  if (!idToken) {
    return errorResponse(400, "id_token é obrigatório");
  }

  try {
    // 1. Validate Google token and extract profile
    const google = await verifyGoogleIdToken(idToken, env);
    const email = String(google.email ?? "")
      .trim()
      .toLowerCase();
    const fullname = String(google.name ?? "").trim();
    const emailVerified =
      String(google.email_verified ?? "").toLowerCase() === "true";

    if (!email) {
      return errorResponse(400, "Conta Google sem e-mail");
    }

    if (!emailVerified) {
      return errorResponse(401, "E-mail Google não verificado");
    }

    // 2. Find existing user by email or create one
    const users = await executeQuery(
      env,
      'SELECT "id", "cpf", "email", "fullname", "phone", "role" FROM "users" WHERE LOWER("email") = $1 AND "deleted_at" IS NULL LIMIT 1',
      [email],
    );

    let userId = "";
    let userCpf: string | null = null;
    let userEmail = email;
    let userFullname = fullname;
    let userPhone: string | null = null;
    let userRole = "user";

    if (users.length > 0) {
      const existing = users[0] as {
        id: string;
        cpf: string | null;
        email: string | null;
        fullname: string | null;
        phone: string | null;
        role: string | null;
      };
      userId = existing.id;
      userCpf = existing.cpf;
      userEmail = existing.email ?? email;
      userFullname = existing.fullname ?? fullname;
      userPhone = existing.phone;
      // NOTE: Do NOT use existing.role (global) — it causes cross-tenant contamination.
      // Per-tenant role will be resolved below from user_tenants.role_id → roles.
      userRole = "user";

      if (fullname && fullname !== existing.fullname) {
        try {
          await executeQuery(
            env,
            'UPDATE "users" SET "fullname" = $1, "updated_at" = NOW() WHERE "id" = $2',
            [fullname, existing.id],
          );
          userFullname = fullname;
        } catch {
          /* best effort */
        }
      }
    } else {
      const newUserId = crypto.randomUUID();
      await executeQuery(
        env,
        'INSERT INTO "users" ("id", "email", "fullname", "role", "created_at", "updated_at") VALUES ($1, $2, $3, $4, NOW(), NOW())',
        [newUserId, email, fullname || null, "user"],
      );
      userId = newUserId;
      userRole = "user";
      userFullname = fullname;
    }

    // 3. Resolve tenant from hostname/slug and auto-link user_tenants
    let tenantId = "";
    try {
      const tenantResolution = await resolveTenantInternal(
        env,
        tenantSlug,
        hostname,
      );
      if (tenantResolution.resolved && tenantResolution.tenant) {
        const tenant = tenantResolution.tenant;
        tenantId = tenant.id;

        const existingLink = await executeQuery(
          env,
          'SELECT ut."tenant_id", COALESCE(r."key", r."name", \'user\') AS role FROM "user_tenants" ut LEFT JOIN "roles" r ON r."id" = ut."role_id" WHERE ut."user_id" = $1 AND ut."tenant_id" = $2 AND ut."deleted_at" IS NULL LIMIT 1',
          [userId, tenantId],
        );

        if (existingLink.length > 0) {
          const link = existingLink[0] as { role: string };
          userRole = link.role;
        } else {
          const defaultRole = tenant.default_client_role || "client";
          let roleId: string | null = null;
          try {
            const roles = await executeQuery(
              env,
              'SELECT "id" FROM "roles" WHERE ("key" = $1 OR "name" = $1) AND "tenant_id" = $2 AND "deleted_at" IS NULL LIMIT 1',
              [defaultRole, tenantId],
            );
            if (roles.length > 0) {
              roleId = (roles[0] as { id: string }).id;
            }
          } catch {
            /* role lookup non-critical */
          }

          try {
            await executeQuery(
              env,
              'INSERT INTO "user_tenants" ("id", "user_id", "tenant_id", "role_id", "is_active", "created_at") VALUES ($1, $2, $3, $4, true, NOW())',
              [crypto.randomUUID(), userId, tenantId, roleId],
            );
            userRole = defaultRole;
          } catch {
            /* auto-link non-critical */
          }
        }
      } else {
        const authContext = await resolveUserAuthContext(env, userId);
        tenantId = authContext.tenant_id;
        userRole = authContext.role;
      }
    } catch {
      const authContext = await resolveUserAuthContext(env, userId);
      tenantId = authContext.tenant_id;
      userRole = authContext.role;
    }

    // 4. Generate JWT and return login payload
    const token = await signToken(
      { sub: userId, tenant_id: tenantId, role: userRole },
      env.JWT_SECRET,
    );

    return corsResponse(200, {
      user: {
        id: userId,
        cpf: userCpf,
        email: userEmail,
        fullname: userFullname || null,
        phone: userPhone,
        role: userRole,
        tenant_id: tenantId || null,
      },
      token,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[auth/google]", message);

    if (message.toLowerCase().includes("inválido")) {
      return errorResponse(401, "Token Google inválido");
    }
    if (message.toLowerCase().includes("expirado")) {
      return errorResponse(401, "Token Google expirado");
    }
    return errorResponse(500, "Falha no login com Google. Tente novamente.");
  }
}

/* ================================================================== */
/*  API Key Management (server-side key generation)                    */
/* ================================================================== */

async function handleApiKeyCreate(
  request: Request,
  env: Env,
  authPayload: JwtPayload,
): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "create").trim();

    if (action !== "create") {
      return corsResponse(400, {
        error: "Only 'create' action supported on /api-keys",
      });
    }

    const tenantId = String(
      body.tenant_id ?? authPayload.tenant_id ?? "",
    ).trim();
    const userId = String(body.user_id ?? authPayload.sub ?? "").trim();

    if (!tenantId) {
      return corsResponse(400, { error: "tenant_id is required" });
    }

    const name = String(body.name ?? "").trim();
    if (!name) {
      return corsResponse(400, { error: "name is required" });
    }

    const environment = String(body.environment ?? "live").trim();
    if (environment !== "live" && environment !== "test") {
      return corsResponse(400, {
        error: "environment must be 'live' or 'test'",
      });
    }

    // Parse scopes
    let scopes = ["read"];
    if (body.scopes) {
      const rawScopes = Array.isArray(body.scopes)
        ? body.scopes
        : typeof body.scopes === "string"
          ? JSON.parse(body.scopes)
          : ["read"];
      const validScopes = new Set(["read", "write", "delete"]);
      scopes = rawScopes
        .map((s: unknown) => String(s).trim().toLowerCase())
        .filter((s: string) => validScopes.has(s));
      if (scopes.length === 0) scopes = ["read"];
    }

    // Parse allowed_tables
    let allowedTables: string[] = [];
    if (body.allowed_tables) {
      const rawTables = Array.isArray(body.allowed_tables)
        ? body.allowed_tables
        : typeof body.allowed_tables === "string"
          ? JSON.parse(body.allowed_tables)
          : [];
      allowedTables = rawTables
        .map((t: unknown) => String(t).trim().toLowerCase())
        .filter(Boolean);
    }

    const rateLimitPerMinute = Number(body.rate_limit_per_minute) || 60;
    const expiresAt = body.expires_at ? String(body.expires_at) : null;

    // Generate key server-side using HMAC-SHA256
    const hmacSecret = env.JWT_SECRET || env.API_KEY;
    const generated = await generateApiKey(
      environment as "live" | "test",
      hmacSecret,
    );

    // Insert record into DB
    const now = new Date().toISOString();
    const insertQuery = `
      INSERT INTO api_keys (
        tenant_id, name, key_hash, key_prefix, environment,
        scopes, allowed_tables, rate_limit_per_minute,
        expires_at, is_active, created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12
      ) RETURNING *
    `;
    const params = [
      tenantId,
      name,
      generated.hash,
      generated.prefix,
      environment,
      JSON.stringify(scopes),
      JSON.stringify(allowedTables),
      rateLimitPerMinute,
      expiresAt,
      userId || null,
      now,
      now,
    ];

    const result = await executeQuery(env, insertQuery, params);
    const record =
      Array.isArray(result) && result.length > 0 ? result[0] : null;

    if (!record) {
      return corsResponse(500, { error: "Failed to create API key" });
    }

    // Return plaintext key ONCE + record (without hash for security display)
    return corsResponse(201, {
      plaintext_key: generated.plaintext,
      record: {
        ...record,
        key_hash: undefined, // Don't expose the hash to the client
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api_key_create_error]", message);
    return corsResponse(500, { error: "Failed to create API key" });
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
        case "/auth/register":
          return handleRegister(body, env);
        case "/auth/login":
          return handleLogin(body, env);
        case "/auth/google":
          return handleGoogleLogin(body, env);
        default:
          return errorResponse(404, "Not found: " + path);
      }
    }

    // Public API v1 — uses its own auth (API keys), not internal auth
    // Must be BEFORE authenticate() since it handles its own CORS + auth
    if (path.startsWith("/v1/") || path === "/v1") {
      return handlePublicApiRequest(request, env);
    }

    // Auth check for all other routes
    const authPayload = await authenticate(request, env);
    if (!authPayload) {
      return errorResponse(401, "Unauthorized");
    }

    try {
      // Route: POST /api-keys — Create API key (server-side generation)
      if (request.method === "POST" && path === "/api-keys") {
        return handleApiKeyCreate(request, env, authPayload);
      }

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
