/* ================================================================== */
/*  Public API v1 — RESTful Router                                     */
/*                                                                      */
/*  Exposes tenant-scoped CRUD over REST with automatic tenant_id       */
/*  isolation. All queries are filtered by the API key's tenant_id.     */
/*                                                                      */
/*  MVP Endpoints (read-only):                                          */
/*    GET  /v1/:table          → List with filters, pagination, sort    */
/*    GET  /v1/:table/:id      → Get single record by ID               */
/*    GET  /v1/:table/count    → Count matching records                 */
/*    GET  /v1/:table/schema   → Column metadata                       */
/*                                                                      */
/*  Query Parameters:                                                   */
/*    ?field=value             → Exact match (equal)                     */
/*    ?field__gte=value        → Greater than or equal                   */
/*    ?field__ilike=value      → Case-insensitive LIKE (%value%)        */
/*    ?field__in=a,b,c         → IN operator                            */
/*    ?field__is_null=true     → IS NULL / IS NOT NULL                  */
/*    ?_sort=field             → Sort ascending                         */
/*    ?_sort=-field            → Sort descending                        */
/*    ?_limit=20               → Limit (max 100, default 20)            */
/*    ?_offset=0               → Offset for pagination                  */
/*    ?_fields=a,b,c           → Select specific columns                */
/*    ?_deleted=true           → Include soft-deleted records            */
/* ================================================================== */

import {
    authenticateApiKey,
    checkRateLimit,
    rateLimitHeaders,
    validateScope,
    validateTableAccess,
    type AuthError,
    type RateLimitResult,
} from "./api-key-auth";
import { executeQuery } from "./db";
import { buildCount, buildList, validateIdentifier } from "./sql-builder";
import type {
    CrudRequestBody,
    Env,
    PublicApiContext,
    PublicApiError,
    PublicApiResponse,
} from "./types";

/* ── Constants ─────────────────────────────────────────────────────── */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Map of query param operator suffixes to api_crud operator names.
 * Usage: ?price__gte=100 → operator "gte", field "price", value "100"
 */
const OPERATOR_SUFFIXES: Record<string, string> = {
  equal: "equal",
  not_equal: "not_equal",
  like: "like",
  ilike: "ilike",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  in: "in",
  is_null: "is_null",
  is_not_null: "is_not_null",
};

/** System query parameter prefixes — not treated as field filters */
const SYSTEM_PARAMS = new Set([
  "_sort",
  "_limit",
  "_offset",
  "_fields",
  "_deleted",
]);

/* ── CORS for v1 ───────────────────────────────────────────────────── */

/**
 * CORS headers for public API — completely open (CORS: *).
 * Public APIs must be accessible from any origin.
 */
function getV1CorsHeaders(): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Api-Key",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

/* ── Response helpers ──────────────────────────────────────────────── */

function jsonResponse(
  status: number,
  body: PublicApiResponse | PublicApiError,
  extraHeaders?: Headers,
): Response {
  const headers = new Headers(getV1CorsHeaders());
  headers.set("Content-Type", "application/json");

  // Merge rate limit headers
  if (extraHeaders) {
    extraHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  extraHeaders?: Headers,
): Response {
  return jsonResponse(status, { error: { code, message } }, extraHeaders);
}

function rateLimitErrorResponse(result: RateLimitResult): Response {
  const headers = rateLimitHeaders(result);
  return jsonResponse(
    429,
    {
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded. Try again in ${result.retryAfter ?? 60} seconds.`,
        retry_after: result.retryAfter,
      },
    },
    headers,
  );
}

/* ── Query parameter parsing ───────────────────────────────────────── */

/**
 * Parse URL query parameters into a CrudRequestBody that buildList/buildCount
 * can consume. Automatically injects tenant_id filter.
 *
 * Supports operator suffixes: ?field__operator=value
 * Example: ?status__in=paid,overdue&amount__gte=100&_sort=-created_at&_limit=10
 */
function parseQueryParams(url: URL, tenantId: string): CrudRequestBody {
  const body: CrudRequestBody = {
    action: "list",
    table: "", // Set by caller
    auto_exclude_deleted: true,
  };

  // System params
  const sortParam = url.searchParams.get("_sort");
  const limitParam = url.searchParams.get("_limit");
  const offsetParam = url.searchParams.get("_offset");
  const fieldsParam = url.searchParams.get("_fields");
  const deletedParam = url.searchParams.get("_deleted");

  // Sort
  if (sortParam) {
    const sortParts = sortParam.split(",").map((s) => {
      const trimmed = s.trim();
      if (trimmed.startsWith("-")) {
        return trimmed.substring(1) + " DESC";
      }
      return trimmed + " ASC";
    });
    body.sort_column = sortParts.join(", ");
  } else {
    body.sort_column = "created_at DESC";
  }

  // Pagination
  const limit = limitParam
    ? Math.min(parseInt(limitParam, 10) || DEFAULT_LIMIT, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offset = offsetParam ? parseInt(offsetParam, 10) || 0 : 0;
  body.limit = limit;
  body.offset = offset;

  // Field selection
  if (fieldsParam) {
    body.fields = fieldsParam
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  }

  // Include deleted
  if (deletedParam === "true") {
    body.auto_exclude_deleted = false;
  }

  // Build filters from query params (max 8 — reserve slot 1 for tenant_id)
  // Slot 1 is ALWAYS tenant_id (mandatory isolation)
  body.search_field1 = "tenant_id";
  body.search_value1 = tenantId;
  body.search_operator1 = "equal";
  body.combine_type = "AND";

  let filterIndex = 2;
  const MAX_FILTERS = 8; // api_crud supports search_field1..8

  for (const [key, value] of url.searchParams.entries()) {
    if (filterIndex > MAX_FILTERS) break;
    if (SYSTEM_PARAMS.has(key)) continue;

    // Parse operator suffix: field__operator
    let field: string;
    let operator: string;

    const doubleUnderscoreIdx = key.lastIndexOf("__");
    if (doubleUnderscoreIdx > 0) {
      const suffix = key.substring(doubleUnderscoreIdx + 2);
      if (OPERATOR_SUFFIXES[suffix]) {
        field = key.substring(0, doubleUnderscoreIdx);
        operator = OPERATOR_SUFFIXES[suffix];
      } else {
        field = key;
        operator = "equal";
      }
    } else {
      field = key;
      operator = "equal";
    }

    // Prevent overriding tenant_id filter
    if (field === "tenant_id") continue;

    // For ilike, wrap with wildcards if not already present
    let filterValue = value;
    if (operator === "ilike" && !value.includes("%")) {
      filterValue = `%${value}%`;
    }

    // Set filter in CrudRequestBody format
    const fieldKey = `search_field${filterIndex}` as keyof CrudRequestBody;
    const valueKey = `search_value${filterIndex}` as keyof CrudRequestBody;
    const operatorKey =
      `search_operator${filterIndex}` as keyof CrudRequestBody;

    (body as any)[fieldKey] = field;
    (body as any)[valueKey] = filterValue;
    (body as any)[operatorKey] = operator;

    filterIndex++;
  }

  return body;
}

/* ── Route handlers ────────────────────────────────────────────────── */

/**
 * GET /v1/:table — List records with filters, pagination, sort
 */
async function handleList(
  table: string,
  url: URL,
  context: PublicApiContext,
  env: Env,
  rlHeaders: Headers,
): Promise<Response> {
  const body = parseQueryParams(url, context.tenantId);
  body.table = table;

  try {
    validateIdentifier(table);

    // Build and execute list query
    const { query, params } = buildList(body);
    const rows = await executeQuery(env, query, params);

    // Build count query for total (same filters, no limit/offset)
    const countBody = { ...body, action: "count" };
    delete (countBody as any).limit;
    delete (countBody as any).offset;
    delete (countBody as any).sort_column;
    const { query: countQuery, params: countParams } = buildCount(countBody);
    const countResult = await executeQuery(env, countQuery, countParams);
    const total =
      countResult.length > 0 ? (countResult[0] as { count: number }).count : 0;

    const limit = parseInt(String(body.limit ?? DEFAULT_LIMIT), 10);
    const offset = parseInt(String(body.offset ?? 0), 10);

    const response: PublicApiResponse = {
      data: rows,
      meta: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
      },
    };

    return jsonResponse(200, response, rlHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to query data";
    return errorResponse(400, "QUERY_ERROR", message, rlHeaders);
  }
}

/**
 * GET /v1/:table/:id — Get single record by ID
 */
async function handleGet(
  table: string,
  id: string,
  context: PublicApiContext,
  env: Env,
  rlHeaders: Headers,
): Promise<Response> {
  try {
    validateIdentifier(table);

    const query = `SELECT * FROM "${table}" WHERE "id" = $1 AND "tenant_id" = $2 AND "deleted_at" IS NULL LIMIT 1`;
    const rows = await executeQuery(env, query, [id, context.tenantId]);

    if (!rows || rows.length === 0) {
      return errorResponse(404, "NOT_FOUND", `Record not found`, rlHeaders);
    }

    const response: PublicApiResponse = {
      data: rows[0],
    };

    return jsonResponse(200, response, rlHeaders);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch record";
    return errorResponse(400, "QUERY_ERROR", message, rlHeaders);
  }
}

/**
 * GET /v1/:table/count — Count matching records
 */
async function handleCount(
  table: string,
  url: URL,
  context: PublicApiContext,
  env: Env,
  rlHeaders: Headers,
): Promise<Response> {
  const body = parseQueryParams(url, context.tenantId);
  body.table = table;
  body.action = "count";

  try {
    validateIdentifier(table);

    const { query, params } = buildCount(body);
    const rows = await executeQuery(env, query, params);
    const count = rows.length > 0 ? (rows[0] as { count: number }).count : 0;

    const response: PublicApiResponse<{ count: number }> = {
      data: { count },
    };

    return jsonResponse(200, response, rlHeaders);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to count records";
    return errorResponse(400, "QUERY_ERROR", message, rlHeaders);
  }
}

/**
 * GET /v1/:table/schema — Column metadata for the table
 */
async function handleSchema(
  table: string,
  context: PublicApiContext,
  env: Env,
  rlHeaders: Headers,
): Promise<Response> {
  try {
    validateIdentifier(table);

    const query = `
      SELECT
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        (
          SELECT ccu.table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.table_name = $1
            AND kcu.column_name = c.column_name
          LIMIT 1
        ) AS referenced_table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
      ORDER BY c.ordinal_position
    `;

    const rows = await executeQuery(env, query, [table]);

    if (!rows || rows.length === 0) {
      return errorResponse(
        404,
        "TABLE_NOT_FOUND",
        `Table "${table}" not found or has no columns`,
        rlHeaders,
      );
    }

    const response: PublicApiResponse = {
      data: rows,
    };

    return jsonResponse(200, response, rlHeaders);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch schema";
    return errorResponse(400, "QUERY_ERROR", message, rlHeaders);
  }
}

/* ── Main router ───────────────────────────────────────────────────── */

/**
 * Handle a public API v1 request.
 *
 * Called from the main worker index.ts when path starts with /v1/.
 * Handles its own auth, rate limiting, CORS, and routing.
 *
 * @returns Response — always, including errors
 */
export async function handlePublicApiRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getV1CorsHeaders(),
    });
  }

  // ── Authenticate ──
  const authResult = await authenticateApiKey(request, env);
  if (!authResult.success) {
    const err = authResult as AuthError;
    return errorResponse(err.status, err.code, err.message);
  }
  const context = authResult.context;

  // ── Rate limit ──
  const rlResult = await checkRateLimit(
    context.apiKey.id,
    context.apiKey.rate_limit_per_minute,
    env,
  );
  const rlHeaders = rateLimitHeaders(rlResult);

  if (!rlResult.allowed) {
    return rateLimitErrorResponse(rlResult);
  }

  // ── Parse route: /v1/:table[/:idOrAction] ──
  const pathParts = url.pathname
    .replace(/^\/v1\/?/, "")
    .split("/")
    .filter(Boolean);

  if (pathParts.length === 0 || !pathParts[0]) {
    // GET /v1 → API info
    return jsonResponse(
      200,
      {
        data: {
          api: "Radul Platform Public API",
          version: "v1",
          docs: "https://docs.radul.com.br/api",
          scopes: context.scopes,
          tenant_id: context.tenantId,
          rate_limit: {
            limit: rlResult.limit,
            remaining: rlResult.remaining,
            reset: rlResult.resetAt,
          },
        },
      },
      rlHeaders,
    );
  }

  const table = pathParts[0];
  const secondSegment = pathParts[1]; // could be an ID or "count" or "schema"

  // ── Validate table access ──
  const tableError = validateTableAccess(context, table);
  if (tableError) {
    return errorResponse(
      tableError.status,
      tableError.code,
      tableError.message,
      rlHeaders,
    );
  }

  // ── Route by method + path ──

  // MVP: Read-only (GET only)
  if (method !== "GET") {
    // Validate scope for future write operations
    const scopeMap: Record<string, string> = {
      POST: "write",
      PUT: "write",
      PATCH: "write",
      DELETE: "delete",
    };
    const requiredScope = scopeMap[method];
    if (requiredScope) {
      const scopeError = validateScope(context, requiredScope);
      if (scopeError) {
        return errorResponse(
          scopeError.status,
          scopeError.code,
          scopeError.message,
          rlHeaders,
        );
      }
    }

    return errorResponse(
      501,
      "NOT_IMPLEMENTED",
      `${method} operations will be available in v1.1. Currently only GET (read) is supported.`,
      rlHeaders,
    );
  }

  // Scope check for read
  const readScopeError = validateScope(context, "read");
  if (readScopeError) {
    return errorResponse(
      readScopeError.status,
      readScopeError.code,
      readScopeError.message,
      rlHeaders,
    );
  }

  // GET /v1/:table/count
  if (secondSegment === "count") {
    return handleCount(table, url, context, env, rlHeaders);
  }

  // GET /v1/:table/schema
  if (secondSegment === "schema") {
    return handleSchema(table, context, env, rlHeaders);
  }

  // GET /v1/:table/:id
  if (secondSegment) {
    return handleGet(table, secondSegment, context, env, rlHeaders);
  }

  // GET /v1/:table
  return handleList(table, url, context, env, rlHeaders);
}
