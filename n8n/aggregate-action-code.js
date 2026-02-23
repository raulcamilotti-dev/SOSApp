/**
 * N8N Code Node — api_crud "aggregate" action
 *
 * Add this as a new branch in the Switch2 node (action = "aggregate").
 * Connect it to a new Code node → Execute SQL → Respond 200.
 *
 * INPUT (from webhook body):
 * {
 *   "action": "aggregate",
 *   "table": "service_orders",
 *   "aggregates": [
 *     { "function": "SUM", "field": "total_amount", "alias": "total" },
 *     { "function": "COUNT", "field": "*", "alias": "qty" }
 *   ],
 *   "group_by": ["status"],                    // optional
 *   "search_field1": "tenant_id",              // optional filters (1..8)
 *   "search_value1": "some-uuid",
 *   "search_operator1": "equal",
 *   "combine_type": "AND",                     // optional, default AND
 *   "sort_column": "total DESC",               // optional
 *   "limit": "10"                              // optional
 * }
 *
 * OUTPUT: parameterized SQL query string + params array
 */

// ── Whitelist to prevent SQL injection ──────────────────────────────
const ALLOWED_FUNCTIONS = new Set(["SUM", "COUNT", "AVG", "MIN", "MAX"]);
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function sanitizeIdentifier(name) {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

// ── Parse request body ──────────────────────────────────────────────
const body = $input.first().json.body || $input.first().json;
const table = body.table;
const aggregates = body.aggregates || [];
const groupBy = body.group_by || [];
const sortColumn = body.sort_column || "";
const limit = body.limit ? parseInt(body.limit, 10) : null;
const combineType = (body.combine_type || "AND").toUpperCase();

if (!table || !IDENTIFIER_RE.test(table)) {
  throw new Error(`Invalid table name: ${table}`);
}
if (!aggregates.length) {
  throw new Error("At least one aggregate column is required");
}

// ── Build SELECT clause ─────────────────────────────────────────────
const selectParts = [];
const params = [];
let paramIndex = 1;

// Add group-by columns to SELECT
for (const col of groupBy) {
  selectParts.push(sanitizeIdentifier(col));
}

// Add aggregate expressions
for (const agg of aggregates) {
  const fn = (agg.function || "").toUpperCase();
  if (!ALLOWED_FUNCTIONS.has(fn)) {
    throw new Error(`Invalid aggregate function: ${fn}`);
  }
  const field = agg.field === "*" ? "*" : sanitizeIdentifier(agg.field);
  const alias = agg.alias
    ? sanitizeIdentifier(agg.alias)
    : sanitizeIdentifier(`${fn.toLowerCase()}_${agg.field}`);
  selectParts.push(`${fn}(${field}) AS ${alias}`);
}

// ── Build WHERE clause (reuse existing filter pattern) ──────────────
const conditions = [];
const operatorMap = {
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

for (let i = 1; i <= 8; i++) {
  const field = body[`search_field${i}`];
  const value = body[`search_value${i}`];
  const op = (body[`search_operator${i}`] || "equal").toLowerCase();

  if (!field) continue;
  if (!IDENTIFIER_RE.test(field)) {
    throw new Error(`Invalid filter field: ${field}`);
  }

  const sqlOp = operatorMap[op];
  if (!sqlOp) {
    throw new Error(`Unknown operator: ${op}`);
  }

  if (op === "is_null") {
    conditions.push(`"${field}" IS NULL`);
  } else if (op === "is_not_null") {
    conditions.push(`"${field}" IS NOT NULL`);
  } else if (op === "in") {
    const values = String(value)
      .split(",")
      .map((v) => v.trim());
    const placeholders = values.map((v) => {
      params.push(v);
      return `$${paramIndex++}`;
    });
    conditions.push(`"${field}" IN (${placeholders.join(", ")})`);
  } else {
    params.push(value);
    conditions.push(`"${field}" ${sqlOp} $${paramIndex++}`);
  }
}

// ── Build GROUP BY clause ───────────────────────────────────────────
const groupByClause = groupBy.length
  ? `GROUP BY ${groupBy.map(sanitizeIdentifier).join(", ")}`
  : "";

// ── Build ORDER BY clause ───────────────────────────────────────────
let orderByClause = "";
if (sortColumn) {
  // Validate sort column parts (column + optional ASC/DESC)
  const sortParts = sortColumn.split(",").map((s) => {
    const parts = s.trim().split(/\s+/);
    const col = parts[0];
    const dir = (parts[1] || "").toUpperCase();
    if (!IDENTIFIER_RE.test(col) && col !== "*") {
      throw new Error(`Invalid sort column: ${col}`);
    }
    return dir === "DESC" ? `"${col}" DESC` : `"${col}" ASC`;
  });
  orderByClause = `ORDER BY ${sortParts.join(", ")}`;
}

// ── Build LIMIT clause ──────────────────────────────────────────────
const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : "";

// ── Assemble final SQL ──────────────────────────────────────────────
const whereClause = conditions.length
  ? `WHERE ${conditions.join(` ${combineType} `)}`
  : "";

const sql = [
  `SELECT ${selectParts.join(", ")}`,
  `FROM "${table}"`,
  whereClause,
  groupByClause,
  orderByClause,
  limitClause,
]
  .filter(Boolean)
  .join(" ");

return [{ json: { query: sql, params } }];
