/* ================================================================== */
/*  SQL builder utilities — shared across all CRUD actions             */
/*  Faithfully replicates the N8N Code node logic from api_crud_v2     */
/* ================================================================== */

import type { CrudRequestBody, QueryResult } from "./types";

/* ------------------------------------------------------------------ */
/*  Identifier validation (SQL injection prevention)                   */
/* ------------------------------------------------------------------ */

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Columns that MUST NOT be set via the generic api_crud endpoint.
 * These require dedicated secure endpoints (e.g., /auth/set-password).
 */
const PROTECTED_COLUMNS = new Set(["password_hash"]);

export function validateIdentifier(name: string): string {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error("Invalid identifier: " + name);
  }
  return '"' + name + '"';
}

/* ------------------------------------------------------------------ */
/*  Operator map (11 operators)                                        */
/* ------------------------------------------------------------------ */

const OPERATOR_MAP: Record<string, string> = {
  equal: "=",
  not_equal: "!=",
  like: "LIKE",
  ilike: "ILIKE",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  in: "IN",
  is_null: "IS NULL",
  is_not_null: "IS NOT NULL",
};

/* ------------------------------------------------------------------ */
/*  Filter parsing (search_field1..8 + legacy fallback)                */
/* ------------------------------------------------------------------ */

interface ParsedFilter {
  field: string;
  value: string;
  op: string;
}

function buildFilters(body: CrudRequestBody): ParsedFilter[] {
  const filters: ParsedFilter[] = [];

  const bodyRec = body as unknown as Record<string, unknown>;
  for (let i = 1; i <= 8; i++) {
    const field = bodyRec[`search_field${i}`] as string | undefined;
    const value = bodyRec[`search_value${i}`] as string | undefined;
    const op = (bodyRec[`search_operator${i}`] as string) || "equal";
    if (!field) continue;
    validateIdentifier(field);
    filters.push({ field, value: String(value ?? ""), op: op.toLowerCase() });
  }

  // Legacy search format fallback
  if (filters.length === 0 && body.search && body.search_field) {
    validateIdentifier(body.search_field);
    filters.push({ field: body.search_field, value: body.search, op: "ilike" });
  }

  return filters;
}

/* ------------------------------------------------------------------ */
/*  WHERE clause builder (parameterized)                               */
/* ------------------------------------------------------------------ */

export interface WhereResult {
  where: string;
  params: unknown[];
  paramIndex: number;
}

export function buildWhere(body: CrudRequestBody, startIndex = 1): WhereResult {
  const filters = buildFilters(body);
  const combineType = (body.combine_type || "AND").toUpperCase();
  const whereParts: string[] = [];
  const params: unknown[] = [];
  let paramIndex = startIndex;

  for (const f of filters) {
    const field = '"' + f.field + '"';
    const sqlOp = OPERATOR_MAP[f.op] || "=";

    if (sqlOp === "IS NULL" || sqlOp === "IS NOT NULL") {
      whereParts.push(field + " " + sqlOp);
      continue;
    }

    if (sqlOp === "IN") {
      const arr = String(f.value)
        .split(",")
        .map((v) => v.trim());
      const placeholders = arr.map((_, j) => "$" + (paramIndex + j)).join(", ");
      whereParts.push(field + " IN (" + placeholders + ")");
      params.push(...arr);
      paramIndex += arr.length;
      continue;
    }

    if (sqlOp === "LIKE" || sqlOp === "ILIKE") {
      whereParts.push(field + " " + sqlOp + " $" + paramIndex);
      const v = String(f.value);
      params.push(v.includes("%") ? v : "%" + v + "%");
      paramIndex++;
      continue;
    }

    whereParts.push(field + " " + sqlOp + " $" + paramIndex);
    params.push(f.value);
    paramIndex++;
  }

  // Auto-exclude soft-deleted rows (opt-in)
  if (body.auto_exclude_deleted) {
    whereParts.push('"deleted_at" IS NULL');
  }

  const where = whereParts.length
    ? "WHERE " + whereParts.join(" " + combineType + " ")
    : "";

  return { where, params, paramIndex };
}

/* ================================================================== */
/*  Action builders — each returns { query, params }                   */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  LIST                                                               */
/* ------------------------------------------------------------------ */

export function buildList(body: CrudRequestBody): QueryResult {
  const table = body.table;
  if (!table) throw new Error("table is required");
  validateIdentifier(table);

  // Field selection
  let selectClause = "*";
  if (Array.isArray(body.fields) && body.fields.length > 0) {
    selectClause = body.fields.map((f) => validateIdentifier(f)).join(", ");
  }

  const { where, params } = buildWhere(body);

  // Sort
  let orderBy = "ORDER BY 1"; // default fallback
  if (body.sort_column) {
    const sortParts = body.sort_column.split(",").map((s) => {
      const parts = s.trim().split(/\s+/);
      const col = parts[0];
      const dir = (parts[1] || "").toUpperCase();
      if (col !== "*") validateIdentifier(col);
      return dir === "DESC" ? '"' + col + '" DESC' : '"' + col + '" ASC';
    });
    orderBy = "ORDER BY " + sortParts.join(", ");
  }

  // Pagination
  let limitClause = "";
  if (body.limit != null) {
    limitClause = "LIMIT " + parseInt(String(body.limit), 10);
  }
  let offsetClause = "";
  if (body.offset != null) {
    offsetClause = "OFFSET " + parseInt(String(body.offset), 10);
  }

  const query =
    "SELECT " +
    selectClause +
    ' FROM "' +
    table +
    '" ' +
    where +
    " " +
    orderBy +
    " " +
    limitClause +
    " " +
    offsetClause;

  return { query: query.replace(/\s+/g, " ").trim(), params };
}

/* ------------------------------------------------------------------ */
/*  CREATE                                                             */
/* ------------------------------------------------------------------ */

export function buildCreate(body: CrudRequestBody): QueryResult {
  const table = body.table;
  if (!table) throw new Error("table is required");
  validateIdentifier(table);

  const payload = body.payload;
  if (!payload || Array.isArray(payload)) {
    throw new Error("payload object is required for create");
  }

  const keys = Object.keys(payload).filter(
    (k) => IDENTIFIER_RE.test(k) && !PROTECTED_COLUMNS.has(k),
  );
  if (keys.length === 0) throw new Error("No valid columns in payload");

  const columns = keys.map((k) => '"' + k + '"').join(", ");
  const params: unknown[] = [];
  const placeholders = keys.map((k, i) => {
    params.push(payload[k] !== undefined ? payload[k] : null);
    return "$" + (i + 1);
  });

  const query =
    'INSERT INTO "' +
    table +
    '" (' +
    columns +
    ") VALUES (" +
    placeholders.join(", ") +
    ") RETURNING *";

  return { query, params };
}

/* ------------------------------------------------------------------ */
/*  UPDATE                                                             */
/* ------------------------------------------------------------------ */

export function buildUpdate(body: CrudRequestBody): QueryResult {
  const table = body.table;
  if (!table) throw new Error("table is required");
  validateIdentifier(table);

  const payload = body.payload;
  if (!payload || Array.isArray(payload)) {
    throw new Error("payload object is required for update");
  }

  // Special case: controle_atendimento uses session_id instead of id
  const matchColumn = table === "controle_atendimento" ? "session_id" : "id";
  const matchValue = payload[matchColumn];
  if (!matchValue) throw new Error(matchColumn + " is required for update");

  const keys = Object.keys(payload).filter(
    (k) =>
      k !== matchColumn && IDENTIFIER_RE.test(k) && !PROTECTED_COLUMNS.has(k),
  );
  if (keys.length === 0) throw new Error("No columns to update");

  const params: unknown[] = [];
  let paramIndex = 1;

  const setParts = keys.map((k) => {
    params.push(payload[k] !== undefined ? payload[k] : null);
    return '"' + k + '" = $' + paramIndex++;
  });

  params.push(matchValue);
  const query =
    'UPDATE "' +
    table +
    '" SET ' +
    setParts.join(", ") +
    ' WHERE "' +
    matchColumn +
    '" = $' +
    paramIndex +
    " RETURNING *";

  return { query, params };
}

/* ------------------------------------------------------------------ */
/*  DELETE (soft-delete)                                                */
/* ------------------------------------------------------------------ */

export function buildDelete(body: CrudRequestBody): QueryResult {
  const table = body.table;
  if (!table) throw new Error("table is required");
  validateIdentifier(table);

  const payload = (body.payload as Record<string, unknown>) ?? {};
  const id = payload.id;
  if (!id) throw new Error("id is required for delete");

  const deletedAt = (payload.deleted_at as string) || new Date().toISOString();
  const query =
    'UPDATE "' + table + '" SET "deleted_at" = $1 WHERE "id" = $2 RETURNING *';
  const params = [deletedAt, id];

  return { query, params };
}

/* ------------------------------------------------------------------ */
/*  COUNT                                                              */
/* ------------------------------------------------------------------ */

export function buildCount(body: CrudRequestBody): QueryResult {
  const table = body.table;
  if (!table) throw new Error("table is required");
  validateIdentifier(table);

  const { where, params } = buildWhere(body);
  const query = 'SELECT COUNT(*)::int AS count FROM "' + table + '" ' + where;

  return { query: query.trim(), params };
}

/* ------------------------------------------------------------------ */
/*  AGGREGATE                                                          */
/* ------------------------------------------------------------------ */

const ALLOWED_FUNCTIONS = new Set(["SUM", "COUNT", "AVG", "MIN", "MAX"]);

export function buildAggregate(body: CrudRequestBody): QueryResult {
  const table = body.table;
  const aggregates = body.aggregates || [];
  const groupBy = body.group_by || [];

  if (!table) throw new Error("table is required");
  validateIdentifier(table);
  if (!aggregates.length) {
    throw new Error("At least one aggregate column is required");
  }

  // SELECT clause
  const selectParts: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  for (const col of groupBy) {
    selectParts.push(validateIdentifier(col));
  }

  for (const agg of aggregates) {
    const fn = (agg.function || "").toUpperCase();
    if (!ALLOWED_FUNCTIONS.has(fn)) {
      throw new Error("Invalid aggregate function: " + fn);
    }
    const field = agg.field === "*" ? "*" : validateIdentifier(agg.field);
    const alias = agg.alias
      ? validateIdentifier(agg.alias)
      : validateIdentifier(fn.toLowerCase() + "_" + agg.field);
    selectParts.push(fn + "(" + field + ") AS " + alias);
  }

  // WHERE clause
  const conditions: string[] = [];
  const bodyRec = body as unknown as Record<string, unknown>;
  for (let i = 1; i <= 8; i++) {
    const field = bodyRec[`search_field${i}`] as string | undefined;
    const value = bodyRec[`search_value${i}`] as string | undefined;
    const op = (
      (bodyRec[`search_operator${i}`] as string) || "equal"
    ).toLowerCase();
    if (!field) continue;
    validateIdentifier(field);
    const sqlOp = OPERATOR_MAP[op];
    if (!sqlOp) throw new Error("Unknown operator: " + op);

    if (op === "is_null") {
      conditions.push('"' + field + '" IS NULL');
    } else if (op === "is_not_null") {
      conditions.push('"' + field + '" IS NOT NULL');
    } else if (op === "in") {
      const values = String(value ?? "")
        .split(",")
        .map((v) => v.trim());
      const ph = values.map((v) => {
        params.push(v);
        return "$" + paramIndex++;
      });
      conditions.push('"' + field + '" IN (' + ph.join(", ") + ")");
    } else {
      params.push(value);
      conditions.push('"' + field + '" ' + sqlOp + " $" + paramIndex++);
    }
  }

  if (body.auto_exclude_deleted) {
    conditions.push('"deleted_at" IS NULL');
  }

  const combineType = (body.combine_type || "AND").toUpperCase();
  const whereClause = conditions.length
    ? "WHERE " + conditions.join(" " + combineType + " ")
    : "";
  const groupByClause = groupBy.length
    ? "GROUP BY " + groupBy.map(validateIdentifier).join(", ")
    : "";

  // Sort
  let orderByClause = "";
  if (body.sort_column) {
    const sortParts = body.sort_column.split(",").map((s) => {
      const parts = s.trim().split(/\s+/);
      const col = parts[0];
      const dir = (parts[1] || "").toUpperCase();
      if (col !== "*") validateIdentifier(col);
      return dir === "DESC" ? '"' + col + '" DESC' : '"' + col + '" ASC';
    });
    orderByClause = "ORDER BY " + sortParts.join(", ");
  }

  const limitInt = body.limit ? parseInt(String(body.limit), 10) : null;
  const limitClause = limitInt ? "LIMIT " + limitInt : "";

  const sql = [
    "SELECT " + selectParts.join(", "),
    'FROM "' + table + '"',
    whereClause,
    groupByClause,
    orderByClause,
    limitClause,
  ]
    .filter(Boolean)
    .join(" ");

  return { query: sql, params };
}

/* ------------------------------------------------------------------ */
/*  BATCH CREATE                                                       */
/* ------------------------------------------------------------------ */

export function buildBatchCreate(body: CrudRequestBody): QueryResult {
  const table = body.table;
  const items = body.payload;

  if (!table) throw new Error("table is required");
  validateIdentifier(table);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("payload must be a non-empty array for batch_create");
  }

  const first = items[0] as Record<string, unknown>;
  const keys = Object.keys(first).filter(
    (k) => IDENTIFIER_RE.test(k) && !PROTECTED_COLUMNS.has(k),
  );
  if (keys.length === 0) throw new Error("No valid columns in payload");

  const columns = keys.map((k) => '"' + k + '"').join(", ");
  const params: unknown[] = [];
  let paramIndex = 1;

  const valueRows = (items as Record<string, unknown>[]).map((item) => {
    const placeholders = keys.map((k) => {
      params.push(item[k] !== undefined ? item[k] : null);
      return "$" + paramIndex++;
    });
    return "(" + placeholders.join(", ") + ")";
  });

  const query =
    'INSERT INTO "' +
    table +
    '" (' +
    columns +
    ") VALUES " +
    valueRows.join(", ") +
    " RETURNING *";

  return { query, params };
}
