/* ================================================================== */
/*  Template Packs — dedicated Worker endpoints                        */
/*  Replaces raw SQL from frontend with parametrized queries            */
/*                                                                     */
/*  Endpoints:                                                         */
/*    POST /template-packs/clear  — Soft-delete all pack data for tenant*/
/* ================================================================== */

import { executeTransaction } from "./db";
import type { Env } from "./types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUUID(value: unknown, label: string): string {
  const str = String(value ?? "").trim();
  if (!UUID_RE.test(str)) {
    throw new Error(`${label} inválido: deve ser UUID v4`);
  }
  return str;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/* ------------------------------------------------------------------ */
/*  POST /template-packs/clear                                         */
/*  Body: { tenantId: string }                                         */
/*                                                                     */
/*  Soft-deletes all template-pack-related data for the tenant.        */
/*  Uses a transaction since it touches 12 tables.                     */
/*  Tables cleared (in reverse dependency order):                      */
/*    ocr_config, services, tenant_modules, document_templates,        */
/*    step_forms, step_task_templates, deadline_rules,                  */
/*    workflow_step_transitions, service_types, service_categories,     */
/*    roles, workflow_templates                                        */
/* ------------------------------------------------------------------ */

const TABLES_TO_CLEAR = [
  "ocr_config",
  "services",
  "tenant_modules",
  "document_templates",
  "step_forms",
  "step_task_templates",
  "deadline_rules",
  "workflow_step_transitions",
  "service_types",
  "service_categories",
  "roles",
  "workflow_templates",
] as const;

export async function handleClearPackData(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  try {
    const tenantId = assertUUID(body.tenantId, "tenantId");

    const result = await executeTransaction<{
      deletedCounts: Record<string, number>;
      errors: string[];
    }>(env, async (query) => {
      const deletedCounts: Record<string, number> = {};
      const errors: string[] = [];

      for (const table of TABLES_TO_CLEAR) {
        try {
          const rows = await query(
            `UPDATE "${table}" SET deleted_at = NOW() WHERE tenant_id = $1 AND deleted_at IS NULL RETURNING id`,
            [tenantId],
          );
          deletedCounts[table] = Array.isArray(rows) ? rows.length : 0;
        } catch (err) {
          errors.push(
            `clear ${table}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      return { deletedCounts, errors };
    });

    return jsonResponse(200, {
      success: result.errors.length === 0,
      deletedCounts: result.deletedCounts,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(400, { error: message });
  }
}
