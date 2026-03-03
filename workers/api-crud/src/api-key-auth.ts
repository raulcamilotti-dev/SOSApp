/* ================================================================== */
/*  Public API v1 — API Key Authentication & Rate Limiting             */
/*                                                                      */
/*  Handles:                                                            */
/*  - HMAC-SHA256 key verification via Web Crypto (native, <1ms)        */
/*  - Scope validation (read, write, delete)                            */
/*  - Table access whitelist                                            */
/*  - Rate limiting via Cloudflare KV (persistent across isolates)      */
/*  - Automatic last_used_at update                                     */
/* ================================================================== */

import { executeQuery } from "./db";
import type { ApiKeyRecord, Env, PublicApiContext } from "./types";

/* ── Constants ─────────────────────────────────────────────────────── */

/**
 * API key format:  rk_{environment}_{40 random chars}
 * Prefix length for DB lookup: "rk_live_" (8) + first 8 random chars = 16
 */
const KEY_PREFIX_LENGTH = 16;

/**
 * Default table whitelist — when api_keys.allowed_tables is empty ([]),
 * only these tables are accessible. This prevents accidental exposure
 * of sensitive tables (users, auth_tokens, tenants, etc.).
 */
export const DEFAULT_ALLOWED_TABLES: ReadonlySet<string> = new Set([
  // Core business
  "customers",
  "companies",
  "company_members",
  "properties",

  // Services & workflow
  "service_orders",
  "service_order_context",
  "service_types",
  "service_categories",
  "services",
  "workflow_templates",
  "workflow_steps",

  // Process
  "process_updates",
  "process_deadlines",
  "tasks",

  // Financial
  "invoices",
  "invoice_items",
  "payments",
  "quotes",
  "quote_items",
  "accounts_receivable",
  "accounts_payable",

  // Partners
  "partners",
  "partner_earnings",

  // Documents
  "document_templates",
  "generated_documents",

  // CRM
  "leads",

  // Products & commerce
  "products",
  "product_categories",
  "stock_movements",
  "stock_locations",
  "purchase_orders",
  "purchase_order_items",
  "suppliers",

  // Contracts
  "contracts",
  "contract_service_orders",

  // Notifications (read-only exposure)
  "notifications",

  // Custom fields
  "custom_field_definitions",
  "custom_field_values",
]);

/**
 * Tables that are NEVER accessible via public API, regardless of
 * allowed_tables configuration. These contain auth/billing secrets.
 */
const FORBIDDEN_TABLES: ReadonlySet<string> = new Set([
  "users",
  "user_tenants",
  "auth_codes",
  "auth_tokens",
  "tenants",
  "roles",
  "role_permissions",
  "permissions",
  "api_keys", // cannot read your own keys via the API
  "tenant_modules",
  "n8n_chat_histories",
  "buffer_chat_history",
  "buffer_mensagens_manuais",
  "controle_atendimento",
  "contexto_conversa",
]);

/* ── HMAC-SHA256 helpers ───────────────────────────────────────────── */

/**
 * Compute HMAC-SHA256 hex digest of a message using Web Crypto.
 * Runs natively in Cloudflare Workers — no external deps, <1ms.
 */
async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);

  // Convert ArrayBuffer to hex string
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ── Key generation (used by services/api-keys.ts) ─────────────────── */

/**
 * Generate a new API key pair: plaintext key + HMAC hash.
 *
 * Key format: `rk_{env}_{40 random hex chars}`
 * Example:    `rk_live_<40-hex-chars>`
 *
 * Called server-side (worker) when creating a new API key.
 * The plaintext is shown to the user ONCE; only the hash is stored.
 */
export async function generateApiKey(
  environment: "live" | "test",
  hmacSecret: string,
): Promise<{ plaintext: string; hash: string; prefix: string }> {
  // Generate 40 random hex characters (20 bytes of entropy)
  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const plaintext = `rk_${environment}_${randomHex}`;
  const prefix = plaintext.substring(0, KEY_PREFIX_LENGTH);
  const hash = await hmacSha256Hex(plaintext, hmacSecret);

  return { plaintext, hash, prefix };
}

/* ── Authentication ────────────────────────────────────────────────── */

export interface AuthResult {
  success: true;
  context: PublicApiContext;
}

export interface AuthError {
  success: false;
  status: number;
  code: string;
  message: string;
}

/**
 * Authenticate a request using API key from the Authorization header.
 *
 * Flow:
 * 1. Extract key from `Authorization: Bearer rk_live_...`
 * 2. Derive prefix → query DB for matching api_keys record
 * 3. HMAC-SHA256 verify full key against stored hash
 * 4. Validate: is_active, not deleted, not expired
 * 5. Return PublicApiContext with tenant_id, scopes, allowed_tables
 * 6. Best-effort update last_used_at (fire-and-forget)
 */
export async function authenticateApiKey(
  request: Request,
  env: Env,
): Promise<AuthResult | AuthError> {
  // 1. Extract key from Authorization header
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return {
      success: false,
      status: 401,
      code: "MISSING_API_KEY",
      message: "Authorization header is required. Use: Bearer rk_live_...",
    };
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return {
      success: false,
      status: 401,
      code: "INVALID_AUTH_FORMAT",
      message: "Invalid Authorization format. Use: Bearer rk_live_...",
    };
  }

  const apiKey = parts[1];

  // Validate key format: rk_{live|test}_{hex}
  if (!apiKey.startsWith("rk_live_") && !apiKey.startsWith("rk_test_")) {
    return {
      success: false,
      status: 401,
      code: "INVALID_KEY_FORMAT",
      message: "API key must start with rk_live_ or rk_test_",
    };
  }

  if (apiKey.length < 30) {
    return {
      success: false,
      status: 401,
      code: "INVALID_KEY_FORMAT",
      message: "API key is too short",
    };
  }

  // 2. Derive prefix and look up in DB
  const prefix = apiKey.substring(0, KEY_PREFIX_LENGTH);

  let rows: unknown[];
  try {
    rows = await executeQuery(
      env,
      `SELECT id, tenant_id, name, key_hash, key_prefix, environment,
              scopes, allowed_tables, rate_limit_per_minute,
              last_used_at, expires_at, is_active, created_by,
              created_at, updated_at, deleted_at
       FROM api_keys
       WHERE key_prefix = $1
       LIMIT 1`,
      [prefix],
    );
  } catch {
    return {
      success: false,
      status: 500,
      code: "AUTH_DB_ERROR",
      message: "Failed to verify API key",
    };
  }

  if (!rows || rows.length === 0) {
    return {
      success: false,
      status: 401,
      code: "INVALID_API_KEY",
      message: "API key not found",
    };
  }

  const record = rows[0] as ApiKeyRecord;

  // 3. HMAC-SHA256 verify
  const hmacSecret = env.JWT_SECRET || env.API_KEY;
  const expectedHash = await hmacSha256Hex(apiKey, hmacSecret);

  if (expectedHash !== record.key_hash) {
    return {
      success: false,
      status: 401,
      code: "INVALID_API_KEY",
      message: "API key verification failed",
    };
  }

  // 4. Validate state
  if (record.deleted_at) {
    return {
      success: false,
      status: 401,
      code: "KEY_DELETED",
      message: "This API key has been revoked",
    };
  }

  if (!record.is_active) {
    return {
      success: false,
      status: 403,
      code: "KEY_INACTIVE",
      message: "This API key is inactive",
    };
  }

  if (record.expires_at) {
    const expiresAt = new Date(record.expires_at);
    if (expiresAt < new Date()) {
      return {
        success: false,
        status: 403,
        code: "KEY_EXPIRED",
        message: "This API key has expired",
      };
    }
  }

  // 5. Build context
  const scopes = Array.isArray(record.scopes)
    ? record.scopes
    : (JSON.parse(record.scopes as unknown as string) as string[]);
  const allowedTables = Array.isArray(record.allowed_tables)
    ? record.allowed_tables
    : (JSON.parse(record.allowed_tables as unknown as string) as string[]);

  const context: PublicApiContext = {
    apiKey: record,
    tenantId: record.tenant_id,
    scopes,
    allowedTables,
  };

  // 6. Fire-and-forget: update last_used_at
  // We don't await this — it's a non-critical background update
  executeQuery(env, `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [
    record.id,
  ]).catch(() => {
    /* Silently ignore — non-critical */
  });

  return { success: true, context };
}

/* ── Scope validation ──────────────────────────────────────────────── */

/**
 * Check if the API key has the required scope.
 *
 * Scopes: "read" (GET), "write" (POST/PUT/PATCH), "delete" (DELETE)
 */
export function validateScope(
  context: PublicApiContext,
  requiredScope: string,
): AuthError | null {
  if (context.scopes.includes(requiredScope)) {
    return null; // Allowed
  }

  return {
    success: false,
    status: 403,
    code: "INSUFFICIENT_SCOPE",
    message: `This API key does not have the "${requiredScope}" scope`,
  };
}

/* ── Table access validation ───────────────────────────────────────── */

/**
 * Check if the API key is allowed to access the given table.
 *
 * Logic:
 * 1. Reject if table is in FORBIDDEN_TABLES (always blocked)
 * 2. If key has explicit allowed_tables → check against that list
 * 3. If key has empty allowed_tables → check against DEFAULT_ALLOWED_TABLES
 */
export function validateTableAccess(
  context: PublicApiContext,
  table: string,
): AuthError | null {
  const normalizedTable = table.trim().toLowerCase();

  // 1. Always block forbidden tables
  if (FORBIDDEN_TABLES.has(normalizedTable)) {
    return {
      success: false,
      status: 403,
      code: "TABLE_FORBIDDEN",
      message: `Table "${table}" is not accessible via the public API`,
    };
  }

  // 2. Check explicit allowed_tables (if configured)
  if (context.allowedTables.length > 0) {
    const allowed = new Set(
      context.allowedTables.map((t) => t.trim().toLowerCase()),
    );
    if (!allowed.has(normalizedTable)) {
      return {
        success: false,
        status: 403,
        code: "TABLE_NOT_ALLOWED",
        message: `This API key does not have access to table "${table}"`,
      };
    }
    return null; // Allowed via explicit list
  }

  // 3. Check default whitelist
  if (!DEFAULT_ALLOWED_TABLES.has(normalizedTable)) {
    return {
      success: false,
      status: 403,
      code: "TABLE_NOT_ALLOWED",
      message: `Table "${table}" is not in the default allowed list. Configure allowed_tables on your API key.`,
    };
  }

  return null; // Allowed via default whitelist
}

/* ── Rate limiting (Cloudflare KV) ─────────────────────────────────── */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // Unix timestamp (seconds)
  retryAfter?: number; // Seconds until next window
}

/**
 * Check and increment rate limit for an API key using Cloudflare KV.
 *
 * Strategy: Fixed window per minute.
 * KV key format: `rl:{api_key_id}:{minute_timestamp}`
 * TTL: 120 seconds (current minute + buffer for next-minute overlap)
 *
 * KV metadata stores the window start time for reset calculation.
 */
export async function checkRateLimit(
  apiKeyId: string,
  limitPerMinute: number,
  env: Env,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const currentMinute = Math.floor(now / 60);
  const kvKey = `rl:${apiKeyId}:${currentMinute}`;
  const resetAt = (currentMinute + 1) * 60; // Start of next minute

  try {
    // Read current count
    const current = await env.RATE_LIMIT_KV.get(kvKey);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= limitPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        limit: limitPerMinute,
        resetAt,
        retryAfter: resetAt - now,
      };
    }

    // Increment (fire-and-forget for speed, KV is eventually consistent)
    const newCount = count + 1;
    // Don't await — KV write is async and we don't want to block the request
    env.RATE_LIMIT_KV.put(kvKey, String(newCount), {
      expirationTtl: 120, // Auto-expire after 2 minutes
    }).catch(() => {
      /* Silently ignore KV write errors — next request will retry */
    });

    return {
      allowed: true,
      remaining: limitPerMinute - newCount,
      limit: limitPerMinute,
      resetAt,
    };
  } catch {
    // If KV is unavailable, fail open (allow the request)
    // This prevents KV outages from blocking all API traffic
    return {
      allowed: true,
      remaining: limitPerMinute,
      limit: limitPerMinute,
      resetAt,
    };
  }
}

/**
 * Build rate limit response headers (included in every public API response).
 */
export function rateLimitHeaders(result: RateLimitResult): Headers {
  const headers = new Headers();
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  headers.set("X-RateLimit-Reset", String(result.resetAt));
  if (result.retryAfter !== undefined) {
    headers.set("Retry-After", String(result.retryAfter));
  }
  return headers;
}
