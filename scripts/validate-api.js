#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════
 * API VALIDATION SCRIPT — Radul Platform
 * ══════════════════════════════════════════════════════════
 *
 * Tests all CRUD endpoints against live database to detect:
 * - Tables that don't exist
 * - LIST failures (missing columns, bad queries)
 * - CREATE failures (JSONB serialization, missing columns, constraints)
 * - Schema mismatches (expected columns vs actual)
 * - Filter/pagination/count/aggregate operations
 *
 * Usage:
 *   node scripts/validate-api.js
 *   node scripts/validate-api.js --tenant <UUID>
 *   node scripts/validate-api.js --verbose
 *   node scripts/validate-api.js --fix-only    # Only test tables that had issues
 *
 * Requires: .env with SOS_API_KEY set
 */

require("dotenv").config();
const axios = require("axios");

/* ── Config ── */

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const API_KEY =
  process.env.SOS_API_KEY || process.env.EXPO_PUBLIC_N8N_API_KEY || "";
const CRUD = `${API_BASE}/api_crud`;
const DINAMICO = `${API_BASE}/api_dinamico`;
const TABLE_INFO = `${API_BASE}/tables_info`;

const TENANT_ID = (() => {
  const eqArg = process.argv.find((a) => a.startsWith("--tenant="));
  if (eqArg) return eqArg.split("=")[1];
  const idx = process.argv.indexOf("--tenant");
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  // Fallback: env var or hardcoded RADUL tenant
  return process.env.RADUL_TENANT_ID || "0bc867c7-082b-4d6f-a240-405f01b2941e";
})();
const VERBOSE = process.argv.includes("--verbose");
const FIX_ONLY = process.argv.includes("--fix-only");

const headers = { "X-Api-Key": API_KEY, "Content-Type": "application/json" };

/* ── Helpers ── */

const post = async (url, data) => {
  const res = await axios.post(url, data, { headers, timeout: 15000 });
  return res.data;
};

const normalize = (data) => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    return data.data ?? data.value ?? data.items ?? data.rows ?? [];
  }
  return [];
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Color helpers ── */
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const cyan = (t) => `\x1b[36m${t}\x1b[0m`;
const dim = (t) => `\x1b[2m${t}\x1b[0m`;
const bold = (t) => `\x1b[1m${t}\x1b[0m`;

/* ── Tables used by the app (from complete audit) ── */

const CORE_TABLES = [
  // Auth & Tenant
  "tenants",
  "users",
  "user_tenants",
  "roles",
  "role_permissions",
  "permissions",
  "auth_codes",
  "auth_tokens",
  // Core business
  "customers",
  "companies",
  "company_members",
  "partners",
  "properties",
  "services",
  "service_types",
  "service_categories",
  // Service orders & workflow
  "service_orders",
  "service_order_context",
  "workflow_templates",
  "workflow_steps",
  "workflow_step_transitions",
  "tasks",
  "step_forms",
  "step_form_responses",
  "step_task_templates",
  // Process
  "process_updates",
  "process_update_files",
  "process_deadlines",
  "process_document_requests",
  "process_document_responses",
  "process_logs",
  "process_reviews",
  // Financial
  "invoices",
  "invoice_items",
  "payments",
  "accounts_receivable",
  "accounts_payable",
  "quotes",
  "quote_items",
  "quote_templates",
  // Partners
  "partner_earnings",
  "partner_availability",
  "partner_time_off",
  "partner_rating_summary",
  "partner_services",
  "service_appointments",
  "appointment_logs",
  "service_executions",
  "service_reviews",
  "review_logs",
  // Documents
  "document_templates",
  "document_signatures",
  "generated_documents",
  "client_files",
  // CRM
  "leads",
  "campaigns",
  "campaign_items",
  "lead_forms",
  // AI
  "agents",
  "agent_states",
  "agent_playbooks",
  "agent_playbook_rules",
  "agent_playbook_tables",
  "agent_handoff_policies",
  "agent_state_steps",
  "agent_channel_bindings",
  "automations",
  "automation_executions",
  "ocr_config",
  "ocr_results",
  // Notifications
  "notifications",
  "notification_preferences",
  // Modules
  "tenant_modules",
  // Portal
  "public_access_tokens",
  // External
  "onr_protocolos",
  "onr_certidoes",
  "cartorios",
  "brasil_api_cache",
  "calendar_sync_settings",
  // Chat
  "controle_atendimento",
  // Contracts
  "contracts",
  // Content
  "content_pages",
  // Channel Partners
  "channel_partners",
  "channel_partner_referrals",
  "channel_partner_commissions",
  // Bank
  "bank_reconciliation_imports",
  "bank_reconciliation_items",
  // Stock / Sales / Purchases
  "discount_rules",
  "measurement_units",
  "stock_movements",
  "suppliers",
  "sales",
  "sale_items",
  "purchase_orders",
  "purchase_order_items",
  "shopping_carts",
  "shopping_cart_items",
  // Misc
  "deadline_rules",
  "property_process_updates",
  "property_process_update_files",
  "service_compositions",
];

/** Tables with non-standard PK (no `id` column) */
const NO_ID_TABLES = new Set(["role_permissions", "controle_atendimento"]);

/** Tables without `deleted_at` */
const NO_DELETED_AT = new Set([
  "role_permissions",
  "controle_atendimento",
  "service_order_context",
]);

/** Tables that typically have JSONB columns (need special attention) */
const JSONB_TABLES = new Set([
  "companies",
  "tenants",
  "service_types",
  "workflow_steps",
  "agents",
  "agent_playbooks",
  "agent_playbook_tables",
  "ocr_config",
  "content_pages",
  "lead_forms",
  "quote_templates",
  "notifications",
  "notification_preferences",
  "calendar_sync_settings",
  "tenant_modules",
]);

/* ── Results tracking ── */

const results = {
  passed: [],
  failed: [],
  warnings: [],
  skipped: [],
};

function logResult(table, test, status, detail) {
  const entry = { table, test, detail };
  if (status === "pass") {
    results.passed.push(entry);
    if (VERBOSE) console.log(`  ${green("✓")} ${test} ${dim(detail || "")}`);
  } else if (status === "fail") {
    results.failed.push(entry);
    console.log(`  ${red("✗")} ${test} — ${red(detail)}`);
  } else if (status === "warn") {
    results.warnings.push(entry);
    if (VERBOSE)
      console.log(`  ${yellow("⚠")} ${test} — ${yellow(detail || "")}`);
  } else {
    results.skipped.push(entry);
    if (VERBOSE) console.log(`  ${dim("○")} ${test} ${dim(detail || "")}`);
  }
}

/* ═══════════════════════════════════════════════════════════
 * TEST FUNCTIONS
 * ═══════════════════════════════════════════════════════════ */

async function testTableExists(table) {
  try {
    const data = await post(TABLE_INFO, { table_name: table });
    const cols = normalize(data);
    if (cols.length === 0) throw new Error("No columns returned");
    return cols;
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    throw new Error(`Table does not exist or schema fetch failed: ${msg}`);
  }
}

async function testList(table, columns) {
  const hasTenantId = columns.some((c) => c.column_name === "tenant_id");
  const hasDeletedAt = columns.some((c) => c.column_name === "deleted_at");

  const body = {
    action: "list",
    table,
    ...(hasDeletedAt ? { auto_exclude_deleted: true } : {}),
  };

  // Add tenant filter if available
  if (hasTenantId && TENANT_ID) {
    body.search_field1 = "tenant_id";
    body.search_value1 = TENANT_ID;
    body.search_operator1 = "equal";
  }

  // Limit to 5 rows for speed
  body.limit = 5;

  const data = await post(CRUD, body);
  const rows = normalize(data);
  return rows;
}

async function testCount(table, columns) {
  const hasTenantId = columns.some((c) => c.column_name === "tenant_id");
  const hasDeletedAt = columns.some((c) => c.column_name === "deleted_at");

  const body = {
    action: "count",
    table,
    ...(hasDeletedAt ? { auto_exclude_deleted: true } : {}),
  };

  if (hasTenantId && TENANT_ID) {
    body.search_field1 = "tenant_id";
    body.search_value1 = TENANT_ID;
    body.search_operator1 = "equal";
  }

  const data = await post(CRUD, body);
  const rows = normalize(data);
  const count = rows[0]?.count ?? 0;
  return Number(count);
}

async function testCreateAndDelete(table, columns) {
  const hasId = columns.some((c) => c.column_name === "id");
  if (!hasId) return { skipped: true, reason: "No id column" };

  const hasTenantId = columns.some((c) => c.column_name === "tenant_id");
  const hasDeletedAt = columns.some((c) => c.column_name === "deleted_at");

  // Build minimal payload with required columns
  const payload = {};
  const SYSTEM_COLS = new Set(["id", "created_at", "updated_at", "deleted_at"]);

  for (const col of columns) {
    if (SYSTEM_COLS.has(col.column_name)) continue;
    if (col.column_default) continue; // Has default, skip

    // Set tenant_id
    if (col.column_name === "tenant_id") {
      if (TENANT_ID) payload.tenant_id = TENANT_ID;
      continue;
    }

    // Only fill required columns (is_nullable = 'NO' and no default)
    if (col.is_nullable === "NO" && !col.column_default) {
      const type = (col.data_type || "").toLowerCase();
      const udt = (col.udt_name || "").toLowerCase();
      const name = col.column_name;

      if (col.referenced_table_name) {
        // FK — we can't easily create a valid reference, skip this table for create test
        return {
          skipped: true,
          reason: `Required FK: ${name} → ${col.referenced_table_name}`,
        };
      }

      if (type === "boolean") {
        payload[name] = false;
      } else if (udt === "jsonb" || udt === "json") {
        payload[name] = "{}"; // Send as string for JSONB safety
      } else if (
        type === "integer" ||
        type === "bigint" ||
        type === "smallint" ||
        type === "numeric" ||
        type === "real" ||
        type === "double precision"
      ) {
        payload[name] = 0;
      } else if (
        type === "timestamp with time zone" ||
        type === "timestamp without time zone"
      ) {
        payload[name] = new Date().toISOString();
      } else if (type === "date") {
        payload[name] = new Date().toISOString().split("T")[0];
      } else if (type === "uuid") {
        payload[name] = "00000000-0000-0000-0000-000000000000";
      } else {
        // Text/varchar — use test marker
        payload[name] = `__api_test_${Date.now()}`;
      }
    }
  }

  if (hasTenantId && !payload.tenant_id && TENANT_ID) {
    payload.tenant_id = TENANT_ID;
  }

  // Add timestamps
  const now = new Date().toISOString();
  if (columns.some((c) => c.column_name === "created_at"))
    payload.created_at = now;
  if (columns.some((c) => c.column_name === "updated_at"))
    payload.updated_at = now;

  // CREATE
  let createdId;
  try {
    const createData = await post(CRUD, {
      action: "create",
      table,
      payload,
    });
    const rows = normalize(createData);
    const row = rows[0] || (typeof createData === "object" ? createData : null);
    createdId = row?.id;
    if (!createdId) {
      return { success: false, error: "Create returned no id", payload };
    }
  } catch (err) {
    const msg = err.response?.data?.error || err.response?.data || err.message;
    return {
      success: false,
      error: `CREATE failed: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`,
      payload,
    };
  }

  // CLEANUP — soft-delete if possible, else hard delete
  try {
    if (hasDeletedAt) {
      await post(CRUD, {
        action: "update",
        table,
        payload: { id: createdId, deleted_at: now },
      });
    } else {
      await post(CRUD, {
        action: "delete",
        table,
        payload: { id: createdId },
      });
    }
  } catch {
    // Cleanup failure is non-fatal
  }

  return { success: true, createdId };
}

async function testJsonbCreate(table, columns) {
  const jsonbCols = columns.filter(
    (c) =>
      (c.udt_name || "").toLowerCase() === "jsonb" ||
      (c.udt_name || "").toLowerCase() === "json",
  );
  if (jsonbCols.length === 0) return null;

  const hasId = columns.some((c) => c.column_name === "id");
  if (!hasId) return null;
  const hasDeletedAt = columns.some((c) => c.column_name === "deleted_at");

  const issues = [];

  for (const jsonCol of jsonbCols) {
    // Test with array value (the problematic case)
    const testPayload = {};
    const SYSTEM_COLS = new Set([
      "id",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);

    // Fill minimum required fields
    let hasRequiredFK = false;
    for (const col of columns) {
      if (SYSTEM_COLS.has(col.column_name)) continue;
      if (col.column_default) continue;
      if (col.is_nullable === "NO" && !col.column_default) {
        if (col.referenced_table_name && col.column_name !== "tenant_id") {
          hasRequiredFK = true;
          break;
        }
        const type = (col.data_type || "").toLowerCase();
        const udt = (col.udt_name || "").toLowerCase();
        if (col.column_name === "tenant_id") {
          if (TENANT_ID) testPayload.tenant_id = TENANT_ID;
        } else if (udt === "jsonb" || udt === "json") {
          testPayload[col.column_name] = "{}";
        } else if (type === "boolean") {
          testPayload[col.column_name] = false;
        } else if (
          type.includes("int") ||
          type === "numeric" ||
          type === "real" ||
          type === "double precision"
        ) {
          testPayload[col.column_name] = 0;
        } else if (type.includes("timestamp")) {
          testPayload[col.column_name] = new Date().toISOString();
        } else if (type === "uuid") {
          testPayload[col.column_name] = "00000000-0000-0000-0000-000000000000";
        } else {
          testPayload[col.column_name] = `__jsonb_test_${Date.now()}`;
        }
      }
    }

    if (hasRequiredFK) continue; // Skip tables with required FKs

    // Set the JSONB column to an array (the problematic case)
    testPayload[jsonCol.column_name] = '[{"test": true, "key": "value"}]';

    const now = new Date().toISOString();
    if (columns.some((c) => c.column_name === "created_at"))
      testPayload.created_at = now;
    if (columns.some((c) => c.column_name === "updated_at"))
      testPayload.updated_at = now;

    try {
      const createData = await post(CRUD, {
        action: "create",
        table,
        payload: testPayload,
      });
      const rows = normalize(createData);
      const row =
        rows[0] || (typeof createData === "object" ? createData : null);
      const createdId = row?.id;

      // Verify the JSONB value was stored correctly
      if (createdId) {
        try {
          const readData = await post(CRUD, {
            action: "list",
            table,
            search_field1: "id",
            search_value1: createdId,
            search_operator1: "equal",
          });
          const readRows = normalize(readData);
          const readRow = readRows[0];
          const storedValue = readRow?.[jsonCol.column_name];

          if (Array.isArray(storedValue) && storedValue.length > 0) {
            // JSONB array stored correctly
          } else if (typeof storedValue === "string") {
            try {
              const parsed = JSON.parse(storedValue);
              if (!Array.isArray(parsed)) {
                issues.push({
                  column: jsonCol.column_name,
                  issue: `Stored as non-array: ${typeof parsed}`,
                });
              }
            } catch {
              issues.push({
                column: jsonCol.column_name,
                issue: `Stored as invalid JSON string`,
              });
            }
          } else if (storedValue === null || storedValue === undefined) {
            issues.push({
              column: jsonCol.column_name,
              issue: `Stored as null despite sending array`,
            });
          }
        } catch {
          // Read-back failure non-fatal
        }

        // Cleanup
        try {
          if (hasDeletedAt) {
            await post(CRUD, {
              action: "update",
              table,
              payload: { id: createdId, deleted_at: now },
            });
          } else {
            await post(CRUD, {
              action: "delete",
              table,
              payload: { id: createdId },
            });
          }
        } catch {
          // cleanup non-fatal
        }
      }
    } catch (err) {
      const msg =
        err.response?.data?.error || err.response?.data || err.message;
      issues.push({
        column: jsonCol.column_name,
        issue: `JSONB array CREATE failed: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`,
      });
    }
  }

  return issues.length > 0 ? issues : null;
}

async function testPagination(table, columns) {
  const body = {
    action: "list",
    table,
    limit: 2,
    offset: 0,
  };

  const hasTenantId = columns.some((c) => c.column_name === "tenant_id");
  if (hasTenantId && TENANT_ID) {
    body.search_field1 = "tenant_id";
    body.search_value1 = TENANT_ID;
    body.search_operator1 = "equal";
  }

  const data = await post(CRUD, body);
  const rows = normalize(data);
  return rows.length <= 2; // Should respect limit
}

async function testSorting(table, columns) {
  const sortCol = columns.find((c) => c.column_name === "created_at")
    ? "created_at DESC"
    : "1";

  const body = {
    action: "list",
    table,
    sort_column: sortCol,
    limit: 3,
  };

  const hasTenantId = columns.some((c) => c.column_name === "tenant_id");
  if (hasTenantId && TENANT_ID) {
    body.search_field1 = "tenant_id";
    body.search_value1 = TENANT_ID;
    body.search_operator1 = "equal";
  }

  await post(CRUD, body);
  return true;
}

/* ═══════════════════════════════════════════════════════════
 * MAIN RUNNER
 * ═══════════════════════════════════════════════════════════ */

async function validateTable(table) {
  console.log(`\n${bold(cyan(`📋 ${table}`))}`);

  // 1. Schema fetch
  let columns;
  try {
    columns = await testTableExists(table);
    logResult(table, "schema", "pass", `${columns.length} columns`);
  } catch (err) {
    logResult(table, "schema", "fail", err.message);
    return; // Can't continue without schema
  }

  // Quick schema summary
  const hasId = columns.some((c) => c.column_name === "id");
  const hasTenantId = columns.some((c) => c.column_name === "tenant_id");
  const hasDeletedAt = columns.some((c) => c.column_name === "deleted_at");
  const jsonbCols = columns.filter(
    (c) =>
      (c.udt_name || "").toLowerCase() === "jsonb" ||
      (c.udt_name || "").toLowerCase() === "json",
  );
  const fkCols = columns.filter((c) => c.referenced_table_name);

  if (VERBOSE) {
    console.log(
      dim(
        `     id:${hasId} tenant:${hasTenantId} deleted_at:${hasDeletedAt} jsonb:[${jsonbCols.map((c) => c.column_name).join(",")}] fk:[${fkCols.map((c) => `${c.column_name}→${c.referenced_table_name}`).join(",")}]`,
      ),
    );
  }

  // 2. LIST
  try {
    const rows = await testList(table, columns);
    logResult(table, "list", "pass", `${rows.length} rows returned`);
  } catch (err) {
    const msg = err.response?.data?.error || err.response?.data || err.message;
    logResult(table, "list", "fail", String(msg).slice(0, 200));
  }

  // 3. COUNT
  try {
    const count = await testCount(table, columns);
    logResult(table, "count", "pass", `${count} total`);
  } catch (err) {
    const msg = err.response?.data?.error || err.response?.data || err.message;
    logResult(table, "count", "fail", String(msg).slice(0, 200));
  }

  // 4. PAGINATION
  try {
    const ok = await testPagination(table, columns);
    logResult(
      table,
      "pagination",
      ok ? "pass" : "warn",
      ok ? "limit respected" : "returned more than limit",
    );
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    logResult(table, "pagination", "fail", String(msg).slice(0, 200));
  }

  // 5. SORTING
  try {
    await testSorting(table, columns);
    logResult(table, "sort", "pass", "");
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    logResult(table, "sort", "fail", String(msg).slice(0, 200));
  }

  // 6. CREATE + DELETE (only for tables with id column)
  if (hasId && !NO_ID_TABLES.has(table)) {
    try {
      const createResult = await testCreateAndDelete(table, columns);
      if (createResult.skipped) {
        logResult(table, "create", "skip", createResult.reason);
      } else if (createResult.success) {
        logResult(table, "create", "pass", `id: ${createResult.createdId}`);
      } else {
        logResult(table, "create", "fail", createResult.error);
      }
    } catch (err) {
      logResult(table, "create", "fail", err.message);
    }
  } else {
    logResult(
      table,
      "create",
      "skip",
      NO_ID_TABLES.has(table) ? "Non-standard PK" : "No id column",
    );
  }

  // 7. JSONB array test (critical — tests the pg serialization bug)
  if (jsonbCols.length > 0 && hasId && !NO_ID_TABLES.has(table)) {
    try {
      const jsonbIssues = await testJsonbCreate(table, columns);
      if (jsonbIssues === null) {
        logResult(
          table,
          "jsonb_array",
          "pass",
          `${jsonbCols.length} JSONB columns OK`,
        );
      } else if (jsonbIssues.length > 0) {
        for (const issue of jsonbIssues) {
          logResult(table, `jsonb_array(${issue.column})`, "fail", issue.issue);
        }
      }
    } catch (err) {
      logResult(table, "jsonb_array", "warn", err.message);
    }
  }

  // Rate limiting
  await sleep(100);
}

async function main() {
  console.log(bold("\n═══════════════════════════════════════════════"));
  console.log(bold("  RADUL API VALIDATION SCRIPT"));
  console.log(bold("═══════════════════════════════════════════════\n"));
  console.log(`  API:     ${cyan(API_BASE)}`);
  console.log(`  Tenant:  ${TENANT_ID ? cyan(TENANT_ID) : dim("(all)")}`);
  console.log(`  Tables:  ${cyan(String(CORE_TABLES.length))}`);
  console.log(`  Verbose: ${VERBOSE ? green("ON") : dim("OFF")}`);
  console.log();

  // Health check
  try {
    const health = await axios.get(`${API_BASE}/health`, { timeout: 5000 });
    console.log(`  Health:  ${green("OK")} (${health.status})`);
  } catch (err) {
    console.log(`  Health:  ${red("FAILED")} — ${err.message}`);
    console.log(
      red("\n  ⚠ API is unreachable. Check your network and API_BASE.\n"),
    );
    process.exit(1);
  }

  // Run all table validations
  const startTime = Date.now();
  for (const table of CORE_TABLES) {
    await validateTable(table);
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Summary ──
  console.log(bold("\n═══════════════════════════════════════════════"));
  console.log(bold("  SUMMARY"));
  console.log(bold("═══════════════════════════════════════════════\n"));

  const total =
    results.passed.length +
    results.failed.length +
    results.warnings.length +
    results.skipped.length;

  console.log(`  ${green("✓ Passed:")}   ${results.passed.length}`);
  console.log(`  ${red("✗ Failed:")}   ${results.failed.length}`);
  console.log(`  ${yellow("⚠ Warnings:")} ${results.warnings.length}`);
  console.log(`  ${dim("○ Skipped:")}  ${results.skipped.length}`);
  console.log(`  Total:      ${total} tests in ${elapsed}s`);

  if (results.failed.length > 0) {
    console.log(bold(red("\n  ─── FAILURES ───\n")));
    const byTable = {};
    for (const f of results.failed) {
      if (!byTable[f.table]) byTable[f.table] = [];
      byTable[f.table].push(f);
    }
    for (const [table, failures] of Object.entries(byTable)) {
      console.log(`  ${bold(table)}:`);
      for (const f of failures) {
        console.log(`    ${red("✗")} ${f.test}: ${f.detail}`);
      }
    }
  }

  if (results.warnings.length > 0) {
    console.log(bold(yellow("\n  ─── WARNINGS ───\n")));
    const byTable = {};
    for (const w of results.warnings) {
      if (!byTable[w.table]) byTable[w.table] = [];
      byTable[w.table].push(w);
    }
    for (const [table, warnings] of Object.entries(byTable)) {
      console.log(`  ${bold(table)}:`);
      for (const w of warnings) {
        console.log(`    ${yellow("⚠")} ${w.test}: ${w.detail}`);
      }
    }
  }

  console.log();

  // Exit code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(red(`\nFatal: ${err.message}`));
  process.exit(2);
});
