import { api } from "./api";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * API backend URL — Cloudflare Worker (primary) or N8N webhook (fallback).
 *
 * Set EXPO_PUBLIC_API_BASE_URL env var to override. Defaults to the
 * Cloudflare Worker URL. If you need to fall back to N8N, set it to
 * "https://n8n.sosescritura.com.br/webhook".
 */
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";

export const CRUD_ENDPOINT = `${API_BASE}/api_crud`;
export const API_DINAMICO = `${API_BASE}/api_dinamico`;

/* ------------------------------------------------------------------ */
/*  Search-params builder (new N8N filter format)                      */
/* ------------------------------------------------------------------ */

export interface CrudFilter {
  field: string;
  value: string;
  operator?: string; // default 'equal'   — also supports: 'not_equal','like','gt','gte','lt','lte'
}

export interface CrudListOptions {
  combineType?: "AND" | "OR";
  sortColumn?: string;
  limit?: number;
  offset?: number;
  /** When true, the server adds `WHERE deleted_at IS NULL` automatically (does NOT consume a filter slot). */
  autoExcludeDeleted?: boolean;
  /** Select only specific columns. When omitted, returns all columns (SELECT *). */
  fields?: string[];
}

/* ------------------------------------------------------------------ */
/*  Aggregation types                                                  */
/* ------------------------------------------------------------------ */

export type AggregateFunction = "SUM" | "COUNT" | "AVG" | "MIN" | "MAX";

export interface AggregateColumn {
  /** Aggregate function to apply */
  function: AggregateFunction;
  /** Column to aggregate. Use "*" for COUNT(*). */
  field: string;
  /** Alias for the result column (e.g. "total_amount"). Auto-generated if omitted. */
  alias?: string;
}

export interface AggregateOptions {
  /** Columns to GROUP BY */
  groupBy?: string[];
  /** Filters (reuses CrudFilter, max 8) */
  filters?: CrudFilter[];
  /** How to combine filters */
  combineType?: "AND" | "OR";
  /** Sort column + direction (e.g. "total DESC") */
  sortColumn?: string;
  /** Maximum rows to return */
  limit?: number;
  /** When true, auto-adds `deleted_at IS NULL` filter */
  autoExcludeDeleted?: boolean;
}

/**
 * Build flat search_field1…search_field8, search_value1…search_value8,
 * search_operator1…search_operator8 params for the N8N api_crud list action.
 *
 * Usage:
 * ```ts
 * const res = await api.post(CRUD_ENDPOINT, {
 *   action: 'list',
 *   table: 'notifications',
 *   ...buildSearchParams(
 *     [{ field: 'user_id', value: userId }],
 *     { sortColumn: 'created_at' },
 *   ),
 * });
 * ```
 */
export function buildSearchParams(
  filters: CrudFilter[],
  options?: CrudListOptions,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  filters.slice(0, 8).forEach((f, i) => {
    const n = i + 1;
    params[`search_field${n}`] = f.field;
    params[`search_value${n}`] = String(f.value);
    if (f.operator) params[`search_operator${n}`] = f.operator;
  });

  if (options?.combineType) params.combine_type = options.combineType;
  if (options?.sortColumn) params.sort_column = options.sortColumn;
  if (options?.limit != null) params.limit = String(options.limit);
  if (options?.offset != null) params.offset = String(options.offset);
  // Server-side deleted_at filter — does NOT consume a filter slot
  if (options?.autoExcludeDeleted) params.auto_exclude_deleted = true;
  // Field selection — SELECT only specific columns
  if (options?.fields?.length) params.fields = options.fields;

  return params;
}

/* ------------------------------------------------------------------ */
/*  Normalize helpers                                                  */
/* ------------------------------------------------------------------ */

/** Normalize any api_crud response shape into an array */
export function normalizeCrudList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const body = data as Record<string, unknown> | undefined;
  const list = body?.data ?? body?.value ?? body?.items ?? [];
  return Array.isArray(list) ? (list as T[]) : [];
}

/** Extract single-record from api_crud create / update response */
export function normalizeCrudOne<T>(data: unknown): T {
  if (Array.isArray(data)) return data[0] as T;
  const body = data as Record<string, unknown> | undefined;
  return (body?.data ?? body?.value ?? body) as T;
}

/* ------------------------------------------------------------------ */
/*  Aggregation                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build the payload for an `action: "aggregate"` request to api_crud.
 *
 * Example:
 * ```ts
 * const payload = buildAggregatePayload("service_orders", [
 *   { function: "SUM", field: "total_amount", alias: "total" },
 *   { function: "COUNT", field: "*", alias: "qty" },
 * ], {
 *   groupBy: ["status"],
 *   filters: [{ field: "tenant_id", value: tenantId }],
 *   sortColumn: "total DESC",
 *   autoExcludeDeleted: true,
 * });
 * ```
 */
export function buildAggregatePayload(
  table: string,
  aggregates: AggregateColumn[],
  options?: AggregateOptions,
): Record<string, unknown> {
  const filterParams = buildSearchParams(options?.filters ?? [], {
    combineType: options?.combineType,
    autoExcludeDeleted: options?.autoExcludeDeleted,
  });

  return {
    action: "aggregate",
    table,
    aggregates: aggregates.map((a) => ({
      function: a.function,
      field: a.field,
      alias: a.alias ?? `${a.function.toLowerCase()}_${a.field}`,
    })),
    ...(options?.groupBy?.length ? { group_by: options.groupBy } : {}),
    ...filterParams,
    ...(options?.sortColumn ? { sort_column: options.sortColumn } : {}),
    ...(options?.limit != null ? { limit: String(options.limit) } : {}),
  };
}

/**
 * Execute an aggregate query via api_crud.
 *
 * Returns an array of result rows. Each row contains the group-by columns
 * plus the computed aggregates.
 *
 * Example:
 * ```ts
 * const results = await aggregateCrud("service_orders", [
 *   { function: "SUM", field: "total_amount", alias: "total" },
 *   { function: "COUNT", field: "*", alias: "qty" },
 * ], {
 *   groupBy: ["status"],
 *   filters: [{ field: "tenant_id", value: tenantId }],
 *   sortColumn: "total DESC",
 *   autoExcludeDeleted: true,
 * });
 * // results: [{ status: "completed", total: "15000.00", qty: "12" }, ...]
 * ```
 */
export async function aggregateCrud<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  table: string,
  aggregates: AggregateColumn[],
  options?: AggregateOptions,
): Promise<T[]> {
  const payload = buildAggregatePayload(table, aggregates, options);
  const res = await api.post(CRUD_ENDPOINT, payload);
  return normalizeCrudList<T>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Batch create                                                       */
/* ------------------------------------------------------------------ */

/**
 * Insert multiple rows in a single request. Requires the improved api_crud v2.
 *
 * Example:
 * ```ts
 * const rows = await batchCreate<Role>("roles", [
 *   { tenant_id: tid, name: "Admin" },
 *   { tenant_id: tid, name: "User" },
 * ]);
 * // rows: [{ id: "...", name: "Admin", ... }, { id: "...", name: "User", ... }]
 * ```
 */
export async function batchCreate<T>(
  table: string,
  items: Record<string, unknown>[],
): Promise<T[]> {
  if (!items.length) return [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "batch_create",
    table,
    payload: items,
  });
  return normalizeCrudList<T>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Count with filters                                                 */
/* ------------------------------------------------------------------ */

/**
 * Count rows with optional filters. Uses the improved COUNT action that now
 * supports all filter operators (in api_crud v2).
 *
 * Example:
 * ```ts
 * const total = await countCrud("customers", [
 *   { field: "tenant_id", value: tenantId },
 * ], { autoExcludeDeleted: true });
 * ```
 */
export async function countCrud(
  table: string,
  filters?: CrudFilter[],
  options?: Pick<CrudListOptions, "combineType" | "autoExcludeDeleted">,
): Promise<number> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "count",
    table,
    ...buildSearchParams(filters ?? [], {
      combineType: options?.combineType,
      autoExcludeDeleted: options?.autoExcludeDeleted,
    }),
  });
  const rows = normalizeCrudList<{ count: number | string }>(res.data);
  return rows.length > 0 ? Number(rows[0].count) : 0;
}

/* ------------------------------------------------------------------ */
/*  Generic CRUD service factory                                       */
/* ------------------------------------------------------------------ */

type Endpoints = {
  list: string;
  create: string;
  update: string;
};

export function createCrudService<T>(endpoints: Endpoints) {
  return {
    list: async (): Promise<T[]> => {
      const response = await api.post(endpoints.list);
      const data = response.data;
      const list = Array.isArray(data) ? data : (data?.data ?? []);
      return Array.isArray(list) ? (list as T[]) : [];
    },
    create: async (payload: Partial<T>): Promise<T> => {
      const response = await api.post(endpoints.create, payload);
      const data = response.data;
      const base = Array.isArray(data) ? data[0] : (data?.data ?? data);
      return base as T;
    },
    update: async (
      payload: Partial<T> & { id?: string | null },
    ): Promise<T> => {
      const response = await api.post(endpoints.update, payload);
      const data = response.data;
      const base = Array.isArray(data) ? data[0] : (data?.data ?? data);
      return base as T;
    },
  };
}
