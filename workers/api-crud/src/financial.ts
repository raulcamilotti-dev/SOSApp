/* ================================================================== */
/*  Financial — dedicated Worker endpoints                             */
/*  Replaces raw SQL from frontend with parametrized queries            */
/*                                                                     */
/*  Endpoints:                                                         */
/*    POST /financial/monthly-revenue     — Revenue by month            */
/*    POST /financial/delinquent-customers — Customers with overdue AR  */
/*    POST /financial/overdue-entries     — Overdue entries per customer */
/*    POST /financial/delinquency-summary — Aggregate delinquency stats */
/*    POST /financial/mark-overdue        — Batch-update pending→overdue*/
/* ================================================================== */

import { executeQuery } from "./db";
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
/*  POST /financial/monthly-revenue                                    */
/*  Body: { tenantId: string, year: number }                           */
/* ------------------------------------------------------------------ */

export async function handleMonthlyRevenue(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  try {
    const tenantId = assertUUID(body.tenantId, "tenantId");
    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error("year inválido: deve ser um ano entre 2000 e 2100");
    }

    const rows = await executeQuery(
      env,
      `
        SELECT
          TO_CHAR(paid_at, 'YYYY-MM') AS month,
          COALESCE(SUM(total), 0) AS total
        FROM invoices
        WHERE tenant_id = $1
          AND status = 'paid'
          AND paid_at IS NOT NULL
          AND EXTRACT(YEAR FROM paid_at) = $2
          AND deleted_at IS NULL
        GROUP BY TO_CHAR(paid_at, 'YYYY-MM')
        ORDER BY month
      `,
      [tenantId, year],
    );

    return jsonResponse(200, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(400, { error: message });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /financial/delinquent-customers                               */
/*  Body: { tenantId: string, partnerId?: string }                     */
/* ------------------------------------------------------------------ */

export async function handleDelinquentCustomers(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  try {
    const tenantId = assertUUID(body.tenantId, "tenantId");

    // Build query with optional partner filter
    const params: unknown[] = [tenantId];
    let partnerFilter = "";
    if (body.partnerId) {
      const partnerId = assertUUID(body.partnerId, "partnerId");
      params.push(partnerId);
      partnerFilter = `AND c.partner_id = $${params.length}`;
    }

    const rows = await executeQuery(
      env,
      `
        SELECT
          ar.customer_id,
          COALESCE(c.name, 'Cliente não identificado') AS customer_name,
          c.email AS customer_email,
          c.phone AS customer_phone,
          c.cpf AS customer_cpf_cnpj,
          COUNT(ar.id)::int AS overdue_count,
          COALESCE(SUM(ar.amount), 0) AS total_overdue,
          COALESCE(SUM(ar.amount_received), 0) AS total_received,
          MIN(ar.due_date)::text AS oldest_due_date,
          MAX(ar.due_date)::text AS newest_due_date,
          EXTRACT(DAY FROM NOW() - MIN(ar.due_date))::int AS days_overdue
        FROM accounts_receivable ar
        LEFT JOIN customers c ON c.id = ar.customer_id
        WHERE ar.tenant_id = $1
          AND ar.deleted_at IS NULL
          AND ar.status IN ('overdue', 'pending')
          AND ar.due_date < CURRENT_DATE
          AND ar.customer_id IS NOT NULL
          ${partnerFilter}
        GROUP BY ar.customer_id, c.name, c.email, c.phone, c.cpf
        ORDER BY total_overdue DESC
      `,
      params,
    );

    return jsonResponse(200, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(400, { error: message });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /financial/overdue-entries                                    */
/*  Body: { tenantId: string, customerId: string, partnerId?: string } */
/* ------------------------------------------------------------------ */

export async function handleOverdueEntries(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  try {
    const tenantId = assertUUID(body.tenantId, "tenantId");
    const customerId = assertUUID(body.customerId, "customerId");

    const params: unknown[] = [tenantId, customerId];
    let partnerFilter = "";
    if (body.partnerId) {
      const partnerId = assertUUID(body.partnerId, "partnerId");
      params.push(partnerId);
      partnerFilter = `AND customer_id IN (SELECT id FROM customers WHERE partner_id = $${params.length})`;
    }

    const rows = await executeQuery(
      env,
      `
        SELECT
          id, description, type, category,
          amount, amount_received,
          (amount - amount_received) AS balance,
          due_date::text,
          EXTRACT(DAY FROM NOW() - due_date)::int AS days_overdue,
          status, payment_method, notes, customer_id
        FROM accounts_receivable
        WHERE tenant_id = $1
          AND customer_id = $2
          AND deleted_at IS NULL
          AND status IN ('overdue', 'pending')
          AND due_date < CURRENT_DATE
          ${partnerFilter}
        ORDER BY due_date ASC
      `,
      params,
    );

    return jsonResponse(200, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(400, { error: message });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /financial/delinquency-summary                                */
/*  Body: { tenantId: string, partnerId?: string }                     */
/* ------------------------------------------------------------------ */

export async function handleDelinquencySummary(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  try {
    const tenantId = assertUUID(body.tenantId, "tenantId");

    const params: unknown[] = [tenantId];
    let partnerFilter = "";
    if (body.partnerId) {
      const partnerId = assertUUID(body.partnerId, "partnerId");
      params.push(partnerId);
      partnerFilter = `AND customer_id IN (SELECT id FROM customers WHERE partner_id = $${params.length})`;
    }

    const rows = await executeQuery(
      env,
      `
        SELECT
          COALESCE(SUM(amount - amount_received), 0) AS total_overdue_amount,
          COUNT(DISTINCT customer_id)::int AS total_delinquents,
          COALESCE(AVG(EXTRACT(DAY FROM NOW() - due_date)), 0)::int AS avg_days_overdue,
          COALESCE(MAX(EXTRACT(DAY FROM NOW() - due_date)), 0)::int AS oldest_overdue_days,
          COUNT(id)::int AS total_overdue_entries,
          COALESCE(SUM(amount_received), 0) AS total_partial_amount
        FROM accounts_receivable
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND status IN ('overdue', 'pending')
          AND due_date < CURRENT_DATE
          AND customer_id IS NOT NULL
          ${partnerFilter}
      `,
      params,
    );

    return jsonResponse(200, rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(400, { error: message });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /financial/mark-overdue                                       */
/*  Body: { tenantId: string, partnerId?: string }                     */
/*  Batch-updates pending entries past due_date → "overdue" status.    */
/* ------------------------------------------------------------------ */

export async function handleMarkOverdue(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  try {
    const tenantId = assertUUID(body.tenantId, "tenantId");

    const params: unknown[] = [tenantId];
    let partnerFilter = "";
    if (body.partnerId) {
      const partnerId = assertUUID(body.partnerId, "partnerId");
      params.push(partnerId);
      partnerFilter = `AND customer_id IN (SELECT id FROM customers WHERE partner_id = $${params.length})`;
    }

    const rows = await executeQuery(
      env,
      `
        UPDATE accounts_receivable
        SET status = 'overdue', updated_at = NOW()
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND status = 'pending'
          AND due_date < CURRENT_DATE
          ${partnerFilter}
        RETURNING id
      `,
      params,
    );

    return jsonResponse(200, {
      success: true,
      updated: (rows as { id: string }[]).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(400, { error: message });
  }
}
