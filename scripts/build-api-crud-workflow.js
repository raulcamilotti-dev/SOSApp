#!/usr/bin/env node
/**
 * Generates the improved api_crud N8N workflow JSON.
 *
 * Improvements over original:
 * 1. CREATE returns full row with id (INSERT ... RETURNING *)
 * 2. UPDATE returns full row (UPDATE ... RETURNING *)
 * 3. DELETE returns deleted row (UPDATE deleted_at ... RETURNING *)
 * 4. LIST: multi-column sort, auto_exclude_deleted, field selection, identifier validation
 * 5. COUNT now supports all filters (was broken/filterless before)
 * 6. New BATCH_CREATE action for multi-row inserts
 * 7. All actions use parameterized SQL (no SQL injection)
 * 8. Unified architecture: Code (build SQL) → Execute Query → Respond
 *
 * Usage: node scripts/build-api-crud-workflow.js
 * Output: n8n/workflows/api_crud_v2.json
 */

const fs = require("fs");
const path = require("path");

// ── Reusable filter-building code (shared between list, count) ─────
const FILTER_CODE = `
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function validateId(name) {
  if (!IDENTIFIER_RE.test(name)) throw new Error("Invalid identifier: " + name);
  return '"' + name + '"';
}

const OPERATOR_MAP = {
  equal: "=", not_equal: "!=", like: "LIKE", ilike: "ILIKE",
  gt: ">", gte: ">=", lt: "<", lte: "<=",
  in: "IN", is_null: "IS NULL", is_not_null: "IS NOT NULL",
};

function buildFilters(body) {
  const filters = [];
  for (let i = 1; i <= 8; i++) {
    const field = body["search_field" + i];
    const value = body["search_value" + i];
    const op = body["search_operator" + i] || "equal";
    if (!field) continue;
    validateId(field);
    filters.push({ field, value, op: op.toLowerCase() });
  }
  // Legacy search format
  if (filters.length === 0 && body.search && body.search_field) {
    validateId(body.search_field);
    filters.push({ field: body.search_field, value: body.search, op: "ilike" });
  }
  return filters;
}

function buildWhere(body) {
  const filters = buildFilters(body);
  const combineType = (body.combine_type || "AND").toUpperCase();
  const whereParts = [];
  const params = [];
  let paramIndex = 1;

  for (const f of filters) {
    const field = '"' + f.field + '"';
    const sqlOp = OPERATOR_MAP[f.op] || "=";

    if (sqlOp === "IS NULL" || sqlOp === "IS NOT NULL") {
      whereParts.push(field + " " + sqlOp);
      continue;
    }
    if (sqlOp === "IN") {
      const arr = String(f.value).split(",").map(v => v.trim());
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
`.trim();

// ── Code for each action ───────────────────────────────────────────

const CODE_LIST = `
${FILTER_CODE}

const body = $input.first().json.body ?? $input.first().json;
const table = body.table;
if (!table) throw new Error("table is required");
validateId(table);

const { where, params } = buildWhere(body);

// Field selection: body.fields = ["id", "name", "created_at"]
let selectExpr = "*";
if (body.fields && Array.isArray(body.fields) && body.fields.length > 0) {
  selectExpr = body.fields.map(f => validateId(f)).join(", ");
}

// Multi-column sort: "status ASC, created_at DESC"
let sortExpr = "1";
if (body.sort_column) {
  const sortParts = body.sort_column.split(",").map(s => {
    const parts = s.trim().split(/\\s+/);
    const col = parts[0];
    const dir = parts[1] && ["ASC","DESC"].includes(parts[1].toUpperCase()) ? parts[1].toUpperCase() : "ASC";
    validateId(col);
    return '"' + col + '" ' + dir;
  });
  sortExpr = sortParts.join(", ");
} else if (body.sort) {
  const dir = (body.direction || "ASC").toUpperCase();
  validateId(body.sort);
  sortExpr = '"' + body.sort + '" ' + dir;
}

const limit = body.limit ? "LIMIT " + parseInt(body.limit, 10) : "";
const offset = body.offset ? "OFFSET " + parseInt(body.offset, 10) : "";

const query = "SELECT " + selectExpr + ' FROM "' + table + '" ' + where + " ORDER BY " + sortExpr + " " + limit + " " + offset;
return [{ json: { query, params } }];
`.trim();

const CODE_CREATE = `
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const body = $input.first().json.body ?? $input.first().json;
const table = body.table;
const payload = body.payload ?? {};

if (!table) throw new Error("table is required");
if (!IDENTIFIER_RE.test(table)) throw new Error("Invalid table: " + table);
if (!payload || Object.keys(payload).length === 0) throw new Error("payload is required");

const keys = Object.keys(payload).filter(k => IDENTIFIER_RE.test(k));
if (keys.length === 0) throw new Error("No valid columns in payload");

const columns = keys.map(k => '"' + k + '"').join(", ");
const placeholders = keys.map((_, i) => "$" + (i + 1)).join(", ");
const params = keys.map(k => payload[k]);

const query = 'INSERT INTO "' + table + '" (' + columns + ') VALUES (' + placeholders + ') RETURNING *';
return [{ json: { query, params } }];
`.trim();

const CODE_UPDATE = `
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const body = $input.first().json.body ?? $input.first().json;
const table = body.table;
const payload = body.payload ?? {};

if (!table) throw new Error("table is required");
if (!IDENTIFIER_RE.test(table)) throw new Error("Invalid table: " + table);

// Determine match column (id for most tables, session_id for controle_atendimento)
let matchColumn = "id";
if (table === "controle_atendimento") matchColumn = "session_id";

const matchValue = payload[matchColumn];
if (matchValue === undefined || matchValue === null) {
  throw new Error(matchColumn + " is required for update on " + table);
}

const setCols = Object.keys(payload).filter(k => k !== matchColumn && IDENTIFIER_RE.test(k));
if (setCols.length === 0) throw new Error("No columns to update");

const params = [];
let paramIndex = 1;
const setParts = setCols.map(col => {
  params.push(payload[col]);
  return '"' + col + '" = $' + paramIndex++;
});

params.push(matchValue);
const query = 'UPDATE "' + table + '" SET ' + setParts.join(", ") + ' WHERE "' + matchColumn + '" = $' + paramIndex + ' RETURNING *';

return [{ json: { query, params } }];
`.trim();

const CODE_DELETE = `
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const body = $input.first().json.body ?? $input.first().json;
const table = body.table;
const payload = body.payload ?? {};

if (!table) throw new Error("table is required");
if (!IDENTIFIER_RE.test(table)) throw new Error("Invalid table: " + table);

const id = payload.id;
if (!id) throw new Error("id is required for delete");

const deletedAt = payload.deleted_at || new Date().toISOString();
const query = 'UPDATE "' + table + '" SET "deleted_at" = $1 WHERE "id" = $2 RETURNING *';
const params = [deletedAt, id];

return [{ json: { query, params } }];
`.trim();

const CODE_COUNT = `
${FILTER_CODE}

const body = $input.first().json.body ?? $input.first().json;
const table = body.table;
if (!table) throw new Error("table is required");
validateId(table);

const { where, params } = buildWhere(body);

const query = 'SELECT COUNT(*)::int AS count FROM "' + table + '" ' + where;
return [{ json: { query, params } }];
`.trim();

const CODE_AGGREGATE = `
// ── Whitelist to prevent SQL injection
const ALLOWED_FUNCTIONS = new Set(["SUM", "COUNT", "AVG", "MIN", "MAX"]);
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function sanitizeId(name) {
  if (!IDENTIFIER_RE.test(name)) throw new Error("Invalid identifier: " + name);
  return '"' + name + '"';
}

const OPERATOR_MAP = {
  equal: "=", not_equal: "!=", like: "LIKE", ilike: "ILIKE",
  gt: ">", gte: ">=", lt: "<", lte: "<=",
  in: "IN", is_null: "IS NULL", is_not_null: "IS NOT NULL",
};

const body = $input.first().json.body ?? $input.first().json;
const table = body.table;
const aggregates = body.aggregates || [];
const groupBy = body.group_by || [];
const sortColumn = body.sort_column || "";
const limit = body.limit ? parseInt(body.limit, 10) : null;
const combineType = (body.combine_type || "AND").toUpperCase();

if (!table || !IDENTIFIER_RE.test(table)) throw new Error("Invalid table: " + table);
if (!aggregates.length) throw new Error("At least one aggregate column is required");

// SELECT clause
const selectParts = [];
const params = [];
let paramIndex = 1;

for (const col of groupBy) selectParts.push(sanitizeId(col));

for (const agg of aggregates) {
  const fn = (agg.function || "").toUpperCase();
  if (!ALLOWED_FUNCTIONS.has(fn)) throw new Error("Invalid aggregate function: " + fn);
  const field = agg.field === "*" ? "*" : sanitizeId(agg.field);
  const alias = agg.alias ? sanitizeId(agg.alias) : sanitizeId(fn.toLowerCase() + "_" + agg.field);
  selectParts.push(fn + "(" + field + ") AS " + alias);
}

// WHERE clause (reuse filter pattern)
const conditions = [];
for (let i = 1; i <= 8; i++) {
  const field = body["search_field" + i];
  const value = body["search_value" + i];
  const op = (body["search_operator" + i] || "equal").toLowerCase();
  if (!field) continue;
  sanitizeId(field);
  const sqlOp = OPERATOR_MAP[op];
  if (!sqlOp) throw new Error("Unknown operator: " + op);

  if (op === "is_null") { conditions.push('"' + field + '" IS NULL'); }
  else if (op === "is_not_null") { conditions.push('"' + field + '" IS NOT NULL'); }
  else if (op === "in") {
    const values = String(value).split(",").map(v => v.trim());
    const ph = values.map(v => { params.push(v); return "$" + paramIndex++; });
    conditions.push('"' + field + '" IN (' + ph.join(", ") + ')');
  } else {
    params.push(value);
    conditions.push('"' + field + '" ' + sqlOp + " $" + paramIndex++);
  }
}

if (body.auto_exclude_deleted) conditions.push('"deleted_at" IS NULL');

const whereClause = conditions.length ? "WHERE " + conditions.join(" " + combineType + " ") : "";
const groupByClause = groupBy.length ? "GROUP BY " + groupBy.map(sanitizeId).join(", ") : "";

let orderByClause = "";
if (sortColumn) {
  const sortParts = sortColumn.split(",").map(s => {
    const parts = s.trim().split(/\\s+/);
    const col = parts[0];
    const dir = (parts[1] || "").toUpperCase();
    if (col !== "*") sanitizeId(col);
    return dir === "DESC" ? '"' + col + '" DESC' : '"' + col + '" ASC';
  });
  orderByClause = "ORDER BY " + sortParts.join(", ");
}

const limitClause = limit ? "LIMIT " + limit : "";

const sql = ["SELECT " + selectParts.join(", "), 'FROM "' + table + '"', whereClause, groupByClause, orderByClause, limitClause].filter(Boolean).join(" ");
return [{ json: { query: sql, params } }];
`.trim();

const CODE_BATCH_CREATE = `
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const body = $input.first().json.body ?? $input.first().json;
const table = body.table;
const items = body.payload; // Array of objects

if (!table) throw new Error("table is required");
if (!IDENTIFIER_RE.test(table)) throw new Error("Invalid table: " + table);
if (!Array.isArray(items) || items.length === 0) throw new Error("payload must be a non-empty array for batch_create");

// Use first item's keys as column list
const keys = Object.keys(items[0]).filter(k => IDENTIFIER_RE.test(k));
if (keys.length === 0) throw new Error("No valid columns in payload");

const columns = keys.map(k => '"' + k + '"').join(", ");
const params = [];
let paramIndex = 1;

const valueRows = items.map(item => {
  const placeholders = keys.map(k => {
    params.push(item[k] !== undefined ? item[k] : null);
    return "$" + paramIndex++;
  });
  return "(" + placeholders.join(", ") + ")";
});

const query = 'INSERT INTO "' + table + '" (' + columns + ') VALUES ' + valueRows.join(", ") + ' RETURNING *';
return [{ json: { query, params } }];
`.trim();

// ── Helper: create a Postgres Execute Query node ───────────────────
function makeExecNode(name, id, position) {
  return {
    parameters: {
      operation: "executeQuery",
      query: "{{ $json.query }}",
      options: {
        queryReplacement: "={{ $json.params ?? $json.values ?? [] }}",
      },
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.6,
    position,
    id,
    name,
    credentials: {
      postgres: {
        id: "CY0Opezdi7jFknJ0",
        name: "SOS escrituras",
      },
    },
    onError: "continueErrorOutput",
  };
}

// ── Helper: create a Code node ─────────────────────────────────────
function makeCodeNode(name, id, position, jsCode) {
  return {
    parameters: { jsCode },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position,
    id,
    name,
  };
}

// ── Helper: make Switch2 rule for action ───────────────────────────
function makeActionRule(action, outputKey) {
  return {
    conditions: {
      options: {
        caseSensitive: true,
        leftValue: "",
        typeValidation: "strict",
        version: 3,
      },
      conditions: [
        {
          leftValue: "={{ $json.body.action }}",
          rightValue: action,
          operator: {
            type: "string",
            operation: "equals",
            name: "filter.operator.equals",
          },
          id: `rule-${action}`,
        },
      ],
      combinator: "and",
    },
    renameOutput: true,
    outputKey: `=${outputKey}`,
  };
}

// ── Build the workflow ─────────────────────────────────────────────
const workflow = {
  name: "api_crud",
  nodes: [
    // 1. Webhook
    {
      parameters: {
        httpMethod: "POST",
        path: "/api_crud",
        responseMode: "responseNode",
        options: {
          responseHeaders: {
            entries: [
              { name: "Access-Control-Allow-Origin", value: "*" },
              {
                name: "Access-Control-Allow-Methods",
                value: "GET,POST,OPTIONS",
              },
              {
                name: "Access-Control-Allow-Headers",
                value: "Content-Type, Authorization",
              },
            ],
          },
        },
      },
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      position: [-1280, -400],
      id: "6f40fdb8-cadd-497d-80a2-eda671331e60",
      name: "api_crud",
      webhookId: "b41ca3e0-b6fe-41a6-8314-54c9e783ddd5",
    },

    // 2. Switch by action
    {
      parameters: {
        rules: {
          values: [
            makeActionRule("list", "list"), // [0]
            makeActionRule("create", "create"), // [1]
            makeActionRule("update", "update"), // [2]
            makeActionRule("delete", "delete"), // [3]
            makeActionRule("count", "count"), // [4]
            makeActionRule("aggregate", "aggregate"), // [5]
            makeActionRule("batch_create", "batch_create"), // [6]
          ],
        },
        options: {},
      },
      type: "n8n-nodes-base.switch",
      typeVersion: 3.4,
      position: [-1000, -400],
      id: "0755f299-6370-4779-aa45-7e501d0f94de",
      name: "Switch - Action",
      alwaysOutputData: false,
    },

    // 3. Respond 200
    {
      parameters: {
        respondWith: "allIncomingItems",
        options: { responseCode: 200 },
      },
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.5,
      position: [200, -200],
      id: "5b7c127f-8508-47a7-916a-e24b3ce69e0e",
      name: "Respond 200",
    },

    // 4. Respond 400
    {
      parameters: {
        respondWith: "allIncomingItems",
        options: {
          responseCode: 400,
          responseKey:
            "={{ $json.error?.description ?? $json.message ?? 'Unknown error' }}",
        },
      },
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.5,
      position: [200, 0],
      id: "fb655d2d-132a-478b-bc8e-621fe114b67e",
      name: "Respond 400",
    },

    // ── LIST ────────────────────────────────────────────────────
    makeCodeNode("Code - List", "code-list-001", [-700, -700], CODE_LIST),
    makeExecNode("Execute SQL - List", "exec-list-001", [-350, -700]),

    // ── CREATE ──────────────────────────────────────────────────
    makeCodeNode("Code - Create", "code-create-001", [-700, -500], CODE_CREATE),
    makeExecNode("Execute SQL - Create", "exec-create-001", [-350, -500]),

    // ── UPDATE ──────────────────────────────────────────────────
    makeCodeNode("Code - Update", "code-update-001", [-700, -300], CODE_UPDATE),
    makeExecNode("Execute SQL - Update", "exec-update-001", [-350, -300]),

    // ── DELETE ──────────────────────────────────────────────────
    makeCodeNode("Code - Delete", "code-delete-001", [-700, -100], CODE_DELETE),
    makeExecNode("Execute SQL - Delete", "exec-delete-001", [-350, -100]),

    // ── COUNT ───────────────────────────────────────────────────
    makeCodeNode("Code - Count", "code-count-001", [-700, 100], CODE_COUNT),
    makeExecNode("Execute SQL - Count", "exec-count-001", [-350, 100]),

    // ── AGGREGATE ───────────────────────────────────────────────
    makeCodeNode(
      "Code - Aggregate",
      "code-agg-001",
      [-700, 300],
      CODE_AGGREGATE,
    ),
    makeExecNode("Execute SQL - Aggregate", "exec-agg-001", [-350, 300]),

    // ── BATCH CREATE ────────────────────────────────────────────
    makeCodeNode(
      "Code - BatchCreate",
      "code-batch-001",
      [-700, 500],
      CODE_BATCH_CREATE,
    ),
    makeExecNode("Execute SQL - BatchCreate", "exec-batch-001", [-350, 500]),
  ],

  pinData: {},

  connections: {
    // Webhook → Switch
    api_crud: {
      main: [[{ node: "Switch - Action", type: "main", index: 0 }]],
    },

    // Switch → Code nodes (7 outputs)
    "Switch - Action": {
      main: [
        [{ node: "Code - List", type: "main", index: 0 }], // [0] list
        [{ node: "Code - Create", type: "main", index: 0 }], // [1] create
        [{ node: "Code - Update", type: "main", index: 0 }], // [2] update
        [{ node: "Code - Delete", type: "main", index: 0 }], // [3] delete
        [{ node: "Code - Count", type: "main", index: 0 }], // [4] count
        [{ node: "Code - Aggregate", type: "main", index: 0 }], // [5] aggregate
        [{ node: "Code - BatchCreate", type: "main", index: 0 }], // [6] batch_create
      ],
    },

    // Code → Execute SQL
    "Code - List": {
      main: [[{ node: "Execute SQL - List", type: "main", index: 0 }]],
    },
    "Code - Create": {
      main: [[{ node: "Execute SQL - Create", type: "main", index: 0 }]],
    },
    "Code - Update": {
      main: [[{ node: "Execute SQL - Update", type: "main", index: 0 }]],
    },
    "Code - Delete": {
      main: [[{ node: "Execute SQL - Delete", type: "main", index: 0 }]],
    },
    "Code - Count": {
      main: [[{ node: "Execute SQL - Count", type: "main", index: 0 }]],
    },
    "Code - Aggregate": {
      main: [[{ node: "Execute SQL - Aggregate", type: "main", index: 0 }]],
    },
    "Code - BatchCreate": {
      main: [[{ node: "Execute SQL - BatchCreate", type: "main", index: 0 }]],
    },

    // Execute SQL → Respond (success → 200, error → 400)
    "Execute SQL - List": {
      main: [
        [{ node: "Respond 200", type: "main", index: 0 }],
        [{ node: "Respond 400", type: "main", index: 0 }],
      ],
    },
    "Execute SQL - Create": {
      main: [
        [{ node: "Respond 200", type: "main", index: 0 }],
        [{ node: "Respond 400", type: "main", index: 0 }],
      ],
    },
    "Execute SQL - Update": {
      main: [
        [{ node: "Respond 200", type: "main", index: 0 }],
        [{ node: "Respond 400", type: "main", index: 0 }],
      ],
    },
    "Execute SQL - Delete": {
      main: [
        [{ node: "Respond 200", type: "main", index: 0 }],
        [{ node: "Respond 400", type: "main", index: 0 }],
      ],
    },
    "Execute SQL - Count": {
      main: [
        [{ node: "Respond 200", type: "main", index: 0 }],
        [{ node: "Respond 400", type: "main", index: 0 }],
      ],
    },
    "Execute SQL - Aggregate": {
      main: [
        [{ node: "Respond 200", type: "main", index: 0 }],
        [{ node: "Respond 400", type: "main", index: 0 }],
      ],
    },
    "Execute SQL - BatchCreate": {
      main: [
        [{ node: "Respond 200", type: "main", index: 0 }],
        [{ node: "Respond 400", type: "main", index: 0 }],
      ],
    },
  },

  active: false, // User should review before activating
  settings: {
    executionOrder: "v1",
    binaryMode: "separate",
    availableInMCP: false,
  },
  versionId: "v2-improved-" + Date.now(),
  meta: {
    instanceId:
      "9c26cbc5515dd6fecda99aa713cb808530b93ecc09f927587152bdc3328eabf6",
  },
  id: "zVWdMsN4B9qsoSpv",
  tags: [],
};

// ── Write output ───────────────────────────────────────────────────
const outPath = path.join(
  __dirname,
  "..",
  "n8n",
  "workflows",
  "api_crud_v2.json",
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), "utf-8");

console.log("✅ Workflow saved to:", outPath);
console.log("");
console.log("=== IMPROVEMENTS ===");
console.log("1. CREATE  → INSERT ... RETURNING * (returns full row with id)");
console.log("2. UPDATE  → UPDATE ... RETURNING * (returns updated row)");
console.log(
  "3. DELETE  → UPDATE deleted_at ... RETURNING * (returns deleted row)",
);
console.log(
  "4. LIST    → Multi-column sort, auto_exclude_deleted, field selection",
);
console.log(
  "5. COUNT   → Now supports all 11 filter operators (was empty/broken)",
);
console.log("6. AGGREGATE → Kept existing + added auto_exclude_deleted");
console.log("7. NEW: BATCH_CREATE → Multi-row INSERT ... RETURNING *");
console.log(
  "8. All SQL parameterized + identifiers validated (SQL injection safe)",
);
console.log("");
console.log("=== NEW ACTIONS ===");
console.log(
  '  batch_create: { action: "batch_create", table: "...", payload: [{...}, {...}] }',
);
console.log("");
console.log("=== NEW LIST OPTIONS ===");
console.log("  auto_exclude_deleted: true  → adds WHERE deleted_at IS NULL");
console.log('  fields: ["id", "name"]      → SELECT only specific columns');
console.log('  sort_column: "a ASC, b DESC" → multi-column sort (was broken)');
console.log("");
console.log("=== HOW TO IMPORT ===");
console.log("1. Go to N8N → your api_crud workflow");
console.log("2. Deactivate the current workflow");
console.log("3. Import this JSON (or create new workflow from import)");
console.log("4. Update the Postgres credentials on all Execute SQL nodes");
console.log("5. Activate the new workflow");
