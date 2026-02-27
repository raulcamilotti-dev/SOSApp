/* ================================================================== */
/*  Marketplace Endpoints — SOS API CRUD Worker                        */
/*                                                                     */
/*  Dedicated server-side endpoints for marketplace checkout.           */
/*  All queries use parametrized $N placeholders (no SQL injection).   */
/*  Write operations run inside PostgreSQL transactions for atomicity. */
/*                                                                     */
/*  Endpoints:                                                         */
/*    POST /marketplace/resolve-customer                               */
/*    POST /marketplace/order-summary                                  */
/*    POST /marketplace/create-order-records                           */
/*    POST /marketplace/confirm-payment                                */
/*    POST /marketplace/cancel-order                                   */
/* ================================================================== */

import { executeQuery, executeTransaction } from "./db";
import type { Env } from "./types";

/* ── Response helpers ── */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}

/* ── SQL helpers ── */

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Build a parametrized INSERT ... RETURNING * from a key-value payload.
 * Column names are validated against a safe identifier regex.
 */
function buildInsert(
  table: string,
  payload: Record<string, unknown>,
): { sql: string; params: unknown[] } {
  if (!IDENTIFIER_RE.test(table)) throw new Error("Invalid table: " + table);

  const keys = Object.keys(payload).filter((k) => IDENTIFIER_RE.test(k));
  if (keys.length === 0) throw new Error("No valid columns for INSERT");

  const columns = keys.map((k) => `"${k}"`).join(", ");
  const params = keys.map((k) =>
    payload[k] !== undefined ? payload[k] : null,
  );
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

  return {
    sql: `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`,
    params,
  };
}

/* ================================================================== */
/*  POST /marketplace/resolve-customer                                 */
/*                                                                     */
/*  Finds an existing customer by user_id, cpf, or email (priority     */
/*  order). Creates a new one if not found.                            */
/*  Replaces the old resolveOnlineCustomer that used raw SQL.          */
/* ================================================================== */

export async function handleResolveCustomer(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const tenantId = String(body.tenant_id ?? "");
  if (!tenantId) return errorResponse(400, "tenant_id is required");

  const userId = body.user_id ? String(body.user_id) : null;
  const cpf = body.cpf ? String(body.cpf) : null;
  const email = body.email ? String(body.email) : null;
  const name = body.name ? String(body.name) : null;
  const phone = body.phone ? String(body.phone) : null;

  const result = await executeTransaction(env, async (query) => {
    // Build parametrized OR conditions with priority ordering
    const conditions: string[] = [];
    const params: unknown[] = [tenantId]; // $1
    let idx = 2;
    const indices: Record<string, number> = {};

    if (userId) {
      indices.userId = idx;
      conditions.push(`"user_id" = $${idx++}`);
      params.push(userId);
    }
    if (cpf) {
      indices.cpf = idx;
      conditions.push(`"cpf" = $${idx++}`);
      params.push(cpf);
    }
    if (email) {
      indices.email = idx;
      conditions.push(`"email" = $${idx++}`);
      params.push(email);
    }

    if (conditions.length > 0) {
      // Priority: user_id (1) > cpf (2) > email (3)
      const caseParts: string[] = [];
      if (indices.userId)
        caseParts.push(`WHEN "user_id" = $${indices.userId} THEN 1`);
      if (indices.cpf) caseParts.push(`WHEN "cpf" = $${indices.cpf} THEN 2`);
      if (indices.email)
        caseParts.push(`WHEN "email" = $${indices.email} THEN 3`);

      const orderClause =
        caseParts.length > 0
          ? `ORDER BY CASE ${caseParts.join(" ")} ELSE 4 END`
          : "";

      const rows = (await query(
        `SELECT "id" FROM "customers"
         WHERE "tenant_id" = $1 AND "deleted_at" IS NULL
           AND (${conditions.join(" OR ")})
         ${orderClause}
         LIMIT 1`,
        params,
      )) as Record<string, unknown>[];

      if (rows.length > 0 && rows[0]?.id) {
        return { customer_id: String(rows[0].id), created: false };
      }
    }

    // Not found — create new customer
    const now = new Date().toISOString();
    const rows = (await query(
      `INSERT INTO "customers" ("tenant_id", "name", "email", "phone", "cpf", "user_id", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING "id"`,
      [tenantId, name || "Cliente Online", email, phone, cpf, userId, now, now],
    )) as Record<string, unknown>[];

    if (!rows[0]?.id) throw new Error("Failed to create customer");
    return { customer_id: String(rows[0].id), created: true };
  });

  return jsonResponse(result);
}

/* ================================================================== */
/*  POST /marketplace/order-summary                                    */
/*                                                                     */
/*  Returns order counts grouped by online_status.                     */
/*  Single parametrized GROUP BY — replaces raw SQL from frontend.     */
/* ================================================================== */

export async function handleOrderSummary(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const tenantId = String(body.tenant_id ?? "");
  if (!tenantId) return errorResponse(400, "tenant_id is required");

  const rows = (await executeQuery(
    env,
    `SELECT "online_status", COUNT(*)::int AS "count"
     FROM "sales"
     WHERE "tenant_id" = $1 AND "channel" = 'online' AND "deleted_at" IS NULL
     GROUP BY "online_status"`,
    [tenantId],
  )) as Record<string, unknown>[];

  const summary: Record<string, number> = {
    pending_payment: 0,
    payment_confirmed: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    completed: 0,
    cancelled: 0,
    return_requested: 0,
  };

  for (const row of rows) {
    const status = String(row.online_status ?? "");
    if (status in summary) summary[status] = Number(row.count ?? 0);
  }

  return jsonResponse(summary);
}

/* ================================================================== */
/*  POST /marketplace/create-order-records                             */
/*                                                                     */
/*  Creates ALL records for an online order in one transaction:         */
/*  sale → sale_items → invoice → invoice_items → AR → earnings →     */
/*  appointments → stock_movements.                                    */
/*                                                                     */
/*  Replaces ~20+ sequential CRUD calls from the frontend.            */
/*  Atomic: if any step fails, everything rolls back.                  */
/* ================================================================== */

interface OrderItem {
  payload: Record<string, unknown>;
  is_composition_parent: boolean;
  service_id: string;
  composition_parent_service_id?: string | null;
  track_stock: boolean;
  item_kind: string;
  quantity: number;
}

interface StockDeduction {
  service_id: string;
  quantity: number; // negative for deductions
}

export async function handleCreateOrderRecords(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const sale = body.sale as Record<string, unknown> | undefined;
  const items = body.items as OrderItem[] | undefined;
  const invoice = body.invoice as Record<string, unknown> | undefined;
  const invoiceItems = body.invoice_items as
    | Record<string, unknown>[]
    | undefined;
  const ar = body.accounts_receivable as Record<string, unknown> | undefined;
  const partnerEarning =
    (body.partner_earning as Record<string, unknown>) ?? null;
  const appointments = (body.appointments as Record<string, unknown>[]) ?? [];
  const stockDeductions = (body.stock_deductions as StockDeduction[]) ?? [];
  const stockUserId = body.stock_user_id ? String(body.stock_user_id) : null;

  if (!sale?.tenant_id) return errorResponse(400, "sale.tenant_id is required");
  if (!items?.length) return errorResponse(400, "items are required");
  if (!invoice) return errorResponse(400, "invoice is required");
  if (!ar) return errorResponse(400, "accounts_receivable is required");

  const result = await executeTransaction(env, async (query) => {
    const now = new Date().toISOString();
    const tenantId = String(sale.tenant_id);

    // ── 1. Compute pending flags from items ──
    let hasPendingProducts = false;
    let hasPendingServices = false;
    for (const item of items) {
      if (item.item_kind === "product" && !item.is_composition_parent) {
        hasPendingProducts = true;
      }
      if (
        item.payload?.fulfillment_status === "pending" &&
        item.item_kind === "service"
      ) {
        hasPendingServices = true;
      }
    }

    // ── 2. Create sale ──
    const salePayload: Record<string, unknown> = {
      ...sale,
      has_pending_products: hasPendingProducts,
      has_pending_services: hasPendingServices,
      created_at: sale.created_at || now,
      updated_at: sale.updated_at || now,
    };
    delete salePayload.id;

    const { sql: saleSql, params: saleParams } = buildInsert(
      "sales",
      salePayload,
    );
    const saleRows = (await query(saleSql, saleParams)) as Record<
      string,
      unknown
    >[];
    const saleId = String(saleRows[0]?.id ?? "");
    if (!saleId) throw new Error("Failed to create sale");

    const shortId = saleId.slice(0, 8);

    // ── 3. Create sale_items ──
    const parentIdMap: Record<string, string> = {}; // service_id → sale_item_id
    const itemIds: string[] = [];

    for (const item of items) {
      const itemPayload = {
        ...item.payload,
        sale_id: saleId,
        created_at: item.payload.created_at || now,
      };
      const { sql, params } = buildInsert("sale_items", itemPayload);
      const rows = (await query(sql, params)) as Record<string, unknown>[];
      const itemId = String(rows[0]?.id ?? "");
      itemIds.push(itemId);

      if (item.is_composition_parent && itemId) {
        parentIdMap[item.service_id] = itemId;
      }
    }

    // ── 4. Link composition children to parents ──
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (
        !item.is_composition_parent &&
        item.composition_parent_service_id &&
        parentIdMap[item.composition_parent_service_id] &&
        itemIds[i]
      ) {
        await query(
          `UPDATE "sale_items" SET "parent_sale_item_id" = $1 WHERE "id" = $2`,
          [parentIdMap[item.composition_parent_service_id], itemIds[i]],
        );
      }
    }

    // ── 5. Create invoice ──
    const invoicePayload = {
      ...invoice,
      title: invoice.title || `Pedido Online #${shortId}`,
      created_at: invoice.created_at || now,
      updated_at: invoice.updated_at || now,
    };
    delete (invoicePayload as Record<string, unknown>).id;

    const { sql: invSql, params: invParams } = buildInsert(
      "invoices",
      invoicePayload,
    );
    const invRows = (await query(invSql, invParams)) as Record<
      string,
      unknown
    >[];
    const invoiceId = String(invRows[0]?.id ?? "");
    if (!invoiceId) throw new Error("Failed to create invoice");

    // ── 6. Create invoice_items ──
    if (invoiceItems?.length) {
      for (const invItem of invoiceItems) {
        const payload = {
          ...invItem,
          invoice_id: invoiceId,
          created_at: invItem.created_at || now,
        };
        const { sql, params } = buildInsert("invoice_items", payload);
        await query(sql, params);
      }
    }

    // ── 7. Link invoice to sale ──
    await query(
      `UPDATE "sales" SET "invoice_id" = $1, "updated_at" = $2 WHERE "id" = $3`,
      [invoiceId, now, saleId],
    );

    // ── 8. Create accounts_receivable ──
    const arPayload = {
      ...ar,
      invoice_id: invoiceId,
      description: ar.description || `Pedido Online #${shortId}`,
      notes:
        ar.notes ||
        JSON.stringify({
          sale_id: saleId,
          channel: "online",
          order_type: "marketplace",
        }),
      created_at: ar.created_at || now,
      updated_at: ar.updated_at || now,
    };
    delete (arPayload as Record<string, unknown>).id;

    const { sql: arSql, params: arParams } = buildInsert(
      "accounts_receivable",
      arPayload,
    );
    const arRows = (await query(arSql, arParams)) as Record<string, unknown>[];
    const arId = String(arRows[0]?.id ?? "");

    // ── 9. Create partner_earning (optional) ──
    let earningId: string | null = null;
    if (partnerEarning && Object.keys(partnerEarning).length > 0) {
      const earningPayload = {
        ...partnerEarning,
        sale_id: saleId,
        notes: partnerEarning.notes || `Comissão pedido online #${shortId}`,
        created_at: partnerEarning.created_at || now,
        updated_at: partnerEarning.updated_at || now,
      };
      const { sql, params } = buildInsert("partner_earnings", earningPayload);
      const rows = (await query(sql, params)) as Record<string, unknown>[];
      earningId = String(rows[0]?.id ?? "") || null;
    }

    // ── 10. Create service_appointments ──
    for (const appt of appointments) {
      const apptPayload = {
        ...appt,
        sale_id: saleId,
        notes: appt.notes
          ? `${appt.notes} — pedido #${shortId}`
          : `Agendamento pedido online #${shortId}`,
        created_at: appt.created_at || now,
        updated_at: appt.updated_at || now,
      };
      const { sql, params } = buildInsert("service_appointments", apptPayload);
      await query(sql, params);
    }

    // ── 11. Stock deductions ──
    for (const deduction of stockDeductions) {
      // Read current stock within the transaction (consistent snapshot)
      const stockRows = (await query(
        `SELECT "stock_quantity" FROM "services" WHERE "id" = $1`,
        [deduction.service_id],
      )) as Record<string, unknown>[];

      const currentQty = Number(stockRows[0]?.stock_quantity ?? 0);
      const newQty = currentQty + deduction.quantity; // quantity is negative

      // Create audit trail
      await query(
        `INSERT INTO "stock_movements"
           ("tenant_id", "service_id", "movement_type", "quantity",
            "previous_quantity", "new_quantity", "sale_id", "created_by", "created_at")
         VALUES ($1, $2, 'sale', $3, $4, $5, $6, $7, $8)`,
        [
          tenantId,
          deduction.service_id,
          deduction.quantity,
          currentQty,
          newQty,
          saleId,
          stockUserId,
          now,
        ],
      );

      // Update product stock
      await query(
        `UPDATE "services" SET "stock_quantity" = $1 WHERE "id" = $2`,
        [newQty, deduction.service_id],
      );
    }

    return {
      sale_id: saleId,
      invoice_id: invoiceId,
      ar_id: arId,
      earning_id: earningId,
      item_ids: itemIds,
    };
  });

  return jsonResponse(result);
}

/* ================================================================== */
/*  POST /marketplace/confirm-payment                                  */
/*                                                                     */
/*  Confirms PIX payment for an online order:                          */
/*  updates sale → creates payment → marks invoice + AR as paid.       */
/*  All in one transaction (replaces 5 sequential CRUD calls).         */
/* ================================================================== */

export async function handleConfirmPayment(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const orderId = String(body.order_id ?? "");
  if (!orderId) return errorResponse(400, "order_id is required");

  const confirmedBy = body.confirmed_by_user_id
    ? String(body.confirmed_by_user_id)
    : null;

  await executeTransaction(env, async (query) => {
    const now = new Date().toISOString();

    // Load + validate order
    const saleRows = (await query(
      `SELECT "id", "tenant_id", "total", "invoice_id", "online_status"
       FROM "sales" WHERE "id" = $1`,
      [orderId],
    )) as Record<string, unknown>[];

    const sale = saleRows[0];
    if (!sale) throw new Error("Pedido não encontrado");
    if (sale.online_status !== "pending_payment") {
      throw new Error(
        `Pedido não está aguardando pagamento (status: ${sale.online_status})`,
      );
    }

    const tenantId = String(sale.tenant_id);
    const total = Number(sale.total ?? 0);
    const invoiceId = sale.invoice_id ? String(sale.invoice_id) : null;

    // Update sale: mark as paid
    await query(
      `UPDATE "sales"
       SET "online_status" = 'payment_confirmed', "status" = 'completed',
           "paid_at" = $1, "updated_at" = $1
       WHERE "id" = $2`,
      [now, orderId],
    );

    // Create payment record
    const { sql: paySql, params: payParams } = buildInsert("payments", {
      tenant_id: tenantId,
      sale_id: orderId,
      invoice_id: invoiceId,
      payment_method: "pix",
      amount: total,
      status: "confirmed",
      paid_at: now,
      confirmed_by: confirmedBy,
      created_at: now,
      updated_at: now,
    });
    await query(paySql, payParams);

    // Update invoice to paid
    if (invoiceId) {
      await query(
        `UPDATE "invoices"
         SET "status" = 'paid', "paid_at" = $1, "updated_at" = $1
         WHERE "id" = $2`,
        [now, invoiceId],
      );
    }

    // Update all matching accounts_receivable to paid
    if (invoiceId) {
      await query(
        `UPDATE "accounts_receivable"
         SET "status" = 'paid', "amount_received" = $1, "paid_at" = $2, "updated_at" = $2
         WHERE "invoice_id" = $3 AND "tenant_id" = $4`,
        [total, now, invoiceId, tenantId],
      );
    }
  });

  return jsonResponse({ success: true });
}

/* ================================================================== */
/*  POST /marketplace/cancel-order                                     */
/*                                                                     */
/*  Cancels an online order:                                           */
/*  reverses stock → cancels fulfillment → cancels sale/invoice/AR →  */
/*  cancels partner earnings. All in one transaction.                  */
/*  Replaces N+1 sequential CRUD calls from the frontend.             */
/* ================================================================== */

export async function handleCancelOrder(
  body: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const orderId = String(body.order_id ?? "");
  if (!orderId) return errorResponse(400, "order_id is required");

  const reason = body.reason ? String(body.reason) : null;
  const userId = body.user_id ? String(body.user_id) : null;

  await executeTransaction(env, async (query) => {
    const now = new Date().toISOString();

    // Load + validate sale
    const saleRows = (await query(
      `SELECT "id", "tenant_id", "online_status", "invoice_id"
       FROM "sales" WHERE "id" = $1`,
      [orderId],
    )) as Record<string, unknown>[];

    const sale = saleRows[0];
    if (!sale) throw new Error("Pedido não encontrado");

    const cancellable = ["pending_payment", "payment_confirmed", "processing"];
    if (!cancellable.includes(String(sale.online_status))) {
      throw new Error(
        `Não é possível cancelar pedido com status: ${sale.online_status}`,
      );
    }

    const tenantId = String(sale.tenant_id);
    const invoiceId = sale.invoice_id ? String(sale.invoice_id) : null;

    // Load sale items
    const saleItems = (await query(
      `SELECT "id", "service_id", "item_kind", "is_composition_parent",
              "quantity", "separation_status", "delivery_status"
       FROM "sale_items" WHERE "sale_id" = $1`,
      [orderId],
    )) as Record<string, unknown>[];

    // ── Reverse stock for products that track stock ──
    const productItems = saleItems.filter(
      (i) =>
        i.item_kind === "product" &&
        !i.is_composition_parent &&
        Number(i.quantity) > 0,
    );

    if (productItems.length > 0) {
      // Batch-load services to check track_stock (1 query instead of N)
      const serviceIds = [
        ...new Set(productItems.map((i) => String(i.service_id))),
      ];
      const svcPh = serviceIds.map((_, i) => `$${i + 1}`).join(", ");
      const svcRows = (await query(
        `SELECT "id", "track_stock", "stock_quantity"
         FROM "services" WHERE "id" IN (${svcPh})`,
        serviceIds,
      )) as Record<string, unknown>[];

      const svcMap = new Map(svcRows.map((s) => [String(s.id), { ...s }]));

      for (const item of productItems) {
        const svc = svcMap.get(String(item.service_id));
        if (!svc?.track_stock) continue;

        const currentQty = Number(svc.stock_quantity ?? 0);
        const returnQty = Math.abs(Number(item.quantity));
        const newQty = currentQty + returnQty;

        // Create stock_movement (return)
        await query(
          `INSERT INTO "stock_movements"
             ("tenant_id", "service_id", "movement_type", "quantity",
              "previous_quantity", "new_quantity", "sale_id",
              "created_by", "reason", "created_at")
           VALUES ($1, $2, 'return', $3, $4, $5, $6, $7, $8, $9)`,
          [
            tenantId,
            item.service_id,
            returnQty,
            currentQty,
            newQty,
            orderId,
            userId,
            reason || "Cancelamento de pedido online",
            now,
          ],
        );

        // Update product stock
        await query(
          `UPDATE "services" SET "stock_quantity" = $1 WHERE "id" = $2`,
          [newQty, item.service_id],
        );

        // Keep map updated for items with same service_id
        svc.stock_quantity = newQty;
      }
    }

    // ── Cancel all sale_items ──
    for (const item of saleItems) {
      const sepStatus =
        item.separation_status !== "not_required"
          ? "cancelled"
          : "not_required";
      const delStatus =
        item.delivery_status !== "not_required" ? "cancelled" : "not_required";

      await query(
        `UPDATE "sale_items"
         SET "fulfillment_status" = 'cancelled',
             "separation_status" = $1, "delivery_status" = $2
         WHERE "id" = $3`,
        [sepStatus, delStatus, item.id],
      );
    }

    // ── Cancel sale ──
    await query(
      `UPDATE "sales"
       SET "status" = 'cancelled', "online_status" = 'cancelled',
           "notes" = $1, "updated_at" = $2
       WHERE "id" = $3`,
      [reason ? `Cancelado: ${reason}` : "Cancelado", now, orderId],
    );

    // ── Cancel invoice ──
    if (invoiceId) {
      await query(
        `UPDATE "invoices" SET "status" = 'cancelled', "updated_at" = $1 WHERE "id" = $2`,
        [now, invoiceId],
      );
    }

    // ── Cancel accounts_receivable ──
    if (invoiceId) {
      await query(
        `UPDATE "accounts_receivable"
         SET "status" = 'cancelled', "updated_at" = $1
         WHERE "invoice_id" = $2 AND "tenant_id" = $3`,
        [now, invoiceId, tenantId],
      );
    }

    // ── Cancel partner_earnings ──
    await query(
      `UPDATE "partner_earnings"
       SET "status" = 'cancelled', "updated_at" = $1
       WHERE "sale_id" = $2 AND "tenant_id" = $3`,
      [now, orderId, tenantId],
    );
  });

  return jsonResponse({ success: true });
}
