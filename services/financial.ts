/**
 * Financial Service
 *
 * Manages partner earnings, invoices, invoice items, and payments.
 * Provides aggregation helpers for the financial dashboard.
 *
 * Tables: partner_earnings, invoices, invoice_items, payments
 * Depends on: services/crud.ts, services/api.ts
 */

import { api } from "./api";
import {
    aggregateCrud,
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
    type CrudFilter,
    type CrudListOptions,
} from "./crud";
import { asaasPixOut } from "./partner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type EarningType = "commission" | "fee" | "bonus" | "deduction";
export type EarningStatus = "pending" | "approved" | "paid" | "cancelled";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
export type PaymentStatus = "pending" | "confirmed" | "failed" | "refunded";
export type PaymentMethod =
  | "pix"
  | "credit_card"
  | "boleto"
  | "transfer"
  | "cash"
  | "other";
export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

export type AccountEntryType =
  | "invoice"
  | "service_fee"
  | "partner_payment"
  | "expense"
  | "salary"
  | "tax"
  | "refund"
  | "transfer"
  | "other";
export type AccountEntryStatus =
  | "pending"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled";
export type RecurrenceType =
  | "none"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

/* ---------- Accounts Payable ---------- */

export interface AccountPayable {
  id: string;
  tenant_id: string;
  description: string;
  type: AccountEntryType;
  category?: string | null;
  partner_id?: string | null;
  partner_earning_id?: string | null;
  service_order_id?: string | null;
  supplier_id?: string | null;
  purchase_order_id?: string | null;
  supplier_name?: string | null;
  amount: number;
  amount_paid: number;
  status: AccountEntryStatus;
  currency: string;
  due_date: string;
  paid_at?: string | null;
  competence_date?: string | null;
  recurrence: RecurrenceType;
  recurrence_parent_id?: string | null;
  payment_method?: string | null;
  pix_key?: string | null;
  pix_key_type?: PixKeyType | null;
  pix_payload?: string | null;
  bank_info?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ---------- Accounts Receivable ---------- */

export interface AccountReceivable {
  id: string;
  tenant_id: string;
  description: string;
  type: AccountEntryType;
  category?: string | null;
  customer_id?: string | null;
  invoice_id?: string | null;
  sale_id?: string | null;
  service_order_id?: string | null;
  quote_id?: string | null;
  amount: number;
  amount_received: number;
  status: AccountEntryStatus;
  currency: string;
  due_date: string;
  received_at?: string | null;
  competence_date?: string | null;
  recurrence: RecurrenceType;
  recurrence_parent_id?: string | null;
  payment_method?: string | null;
  pix_key?: string | null;
  pix_key_type?: PixKeyType | null;
  pix_payload?: string | null;
  pix_qr_base64?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ---------- Partner Earnings ---------- */

export interface PartnerEarning {
  id: string;
  tenant_id: string;
  partner_id: string;
  sale_id?: string | null;
  service_order_id?: string | null;
  appointment_id?: string | null;
  description: string;
  amount: number;
  type: EarningType;
  status: EarningStatus;
  pix_key?: string | null;
  pix_key_type?: PixKeyType | null;
  paid_at?: string | null;
  paid_by?: string | null;
  payment_reference?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ---------- Invoice ---------- */

export interface Invoice {
  id: string;
  tenant_id: string;
  customer_id?: string | null;
  sale_id?: string | null;
  service_order_id?: string | null;
  quote_id?: string | null;
  invoice_number?: string | null;
  title: string;
  description?: string | null;
  status: InvoiceStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  issued_at?: string | null;
  due_at?: string | null;
  paid_at?: string | null;
  pix_key?: string | null;
  pix_key_type?: PixKeyType | null;
  pix_qr_code?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ---------- Payment ---------- */

export interface Payment {
  id: string;
  tenant_id: string;
  invoice_id?: string | null;
  partner_earning_id?: string | null;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  gateway_reference?: string | null;
  gateway_payload?: Record<string, unknown> | null;
  pix_key?: string | null;
  pix_transaction_id?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  paid_at?: string | null;
  confirmed_by?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Partner Earnings CRUD                                              */
/* ------------------------------------------------------------------ */

export async function listPartnerEarnings(
  filters: CrudFilter[] = [],
  options?: CrudListOptions,
): Promise<PartnerEarning[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_earnings",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      ...options,
    }),
  });
  return normalizeCrudList<PartnerEarning>(res.data).filter(
    (item) => !item.deleted_at,
  );
}

export async function createPartnerEarning(
  payload: Partial<PartnerEarning>,
): Promise<PartnerEarning> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "partner_earnings",
    payload,
  });
  return normalizeCrudOne<PartnerEarning>(res.data);
}

export async function updatePartnerEarning(
  payload: Partial<PartnerEarning> & { id: string },
): Promise<PartnerEarning> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "partner_earnings",
    payload,
  });
  return normalizeCrudOne<PartnerEarning>(res.data);
}

/**
 * Mark an earning as paid — sets status, paid_at, paid_by, and optional reference.
 */
export async function markEarningAsPaid(
  earningId: string,
  paidBy: string,
  paymentReference?: string,
): Promise<PartnerEarning> {
  return updatePartnerEarning({
    id: earningId,
    status: "paid",
    paid_at: new Date().toISOString(),
    paid_by: paidBy,
    ...(paymentReference ? { payment_reference: paymentReference } : {}),
  });
}

/* ------------------------------------------------------------------ */
/*  Invoice CRUD                                                       */
/* ------------------------------------------------------------------ */

export async function listInvoices(
  filters: CrudFilter[] = [],
  options?: CrudListOptions,
): Promise<Invoice[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "invoices",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      ...options,
    }),
  });
  return normalizeCrudList<Invoice>(res.data).filter(
    (item) => !item.deleted_at,
  );
}

export async function createInvoice(
  payload: Partial<Invoice>,
): Promise<Invoice> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "invoices",
    payload,
  });
  return normalizeCrudOne<Invoice>(res.data);
}

export async function updateInvoice(
  payload: Partial<Invoice> & { id: string },
): Promise<Invoice> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "invoices",
    payload,
  });
  return normalizeCrudOne<Invoice>(res.data);
}

/* ---------- Invoice Items ---------- */

export async function listInvoiceItems(
  invoiceId: string,
): Promise<InvoiceItem[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "invoice_items",
    ...buildSearchParams([{ field: "invoice_id", value: invoiceId }], {
      sortColumn: "sort_order ASC",
    }),
  });
  return normalizeCrudList<InvoiceItem>(res.data).filter(
    (item) => !item.deleted_at,
  );
}

export async function createInvoiceItem(
  payload: Partial<InvoiceItem>,
): Promise<InvoiceItem> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "invoice_items",
    payload,
  });
  return normalizeCrudOne<InvoiceItem>(res.data);
}

export async function updateInvoiceItem(
  payload: Partial<InvoiceItem> & { id: string },
): Promise<InvoiceItem> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "invoice_items",
    payload,
  });
  return normalizeCrudOne<InvoiceItem>(res.data);
}

/**
 * Recalculate invoice totals from its line items.
 * Returns the updated invoice.
 */
export async function recalculateInvoice(
  invoiceId: string,
  discount = 0,
  tax = 0,
): Promise<Invoice> {
  const items = await listInvoiceItems(invoiceId);
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.subtotal || 0),
    0,
  );
  const total = subtotal - discount + tax;
  return updateInvoice({
    id: invoiceId,
    subtotal,
    discount,
    tax,
    total: Math.max(0, total),
  });
}

/* ------------------------------------------------------------------ */
/*  Payment CRUD                                                       */
/* ------------------------------------------------------------------ */

export async function listPayments(
  filters: CrudFilter[] = [],
  options?: CrudListOptions,
): Promise<Payment[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "payments",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      ...options,
    }),
  });
  return normalizeCrudList<Payment>(res.data).filter(
    (item) => !item.deleted_at,
  );
}

export async function createPayment(
  payload: Partial<Payment>,
): Promise<Payment> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "payments",
    payload,
  });
  return normalizeCrudOne<Payment>(res.data);
}

export async function updatePayment(
  payload: Partial<Payment> & { id: string },
): Promise<Payment> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "payments",
    payload,
  });
  return normalizeCrudOne<Payment>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Dashboard Aggregations                                             */
/* ------------------------------------------------------------------ */

export interface FinancialSummary {
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  totalInvoiced: number;
  paidInvoices: number;
  overdueInvoices: number;
  totalPayments: number;
  confirmedPayments: number;
}

/**
 * Fetch aggregated financial metrics for a tenant's dashboard.
 */
export async function getFinancialSummary(
  tenantId: string,
): Promise<FinancialSummary> {
  const tenantFilter: CrudFilter[] = [{ field: "tenant_id", value: tenantId }];

  const [earningsByStatus, invoicesByStatus, paymentsByStatus] =
    await Promise.all([
      // Earnings grouped by status
      aggregateCrud<{ status: string; total: string; count: string }>(
        "partner_earnings",
        [
          { function: "SUM", field: "amount", alias: "total" },
          { function: "COUNT", field: "*", alias: "count" },
        ],
        {
          groupBy: ["status"],
          filters: tenantFilter,
          autoExcludeDeleted: true,
        },
      ),
      // Invoices grouped by status
      aggregateCrud<{ status: string; total: string; count: string }>(
        "invoices",
        [
          { function: "SUM", field: "total", alias: "total" },
          { function: "COUNT", field: "*", alias: "count" },
        ],
        {
          groupBy: ["status"],
          filters: tenantFilter,
          autoExcludeDeleted: true,
        },
      ),
      // Payments grouped by status
      aggregateCrud<{ status: string; total: string; count: string }>(
        "payments",
        [
          { function: "SUM", field: "amount", alias: "total" },
          { function: "COUNT", field: "*", alias: "count" },
        ],
        {
          groupBy: ["status"],
          filters: tenantFilter,
          autoExcludeDeleted: true,
        },
      ),
    ]);

  const sumByStatus = (
    rows: { status: string; total: string }[],
    status: string,
  ) => {
    const row = rows.find((r) => r.status === status);
    return Number(row?.total || 0);
  };
  const sumAll = (rows: { total: string }[]) =>
    rows.reduce((s, r) => s + Number(r.total || 0), 0);

  return {
    totalEarnings: sumAll(earningsByStatus),
    pendingEarnings: sumByStatus(earningsByStatus, "pending"),
    paidEarnings: sumByStatus(earningsByStatus, "paid"),
    totalInvoiced: sumAll(invoicesByStatus),
    paidInvoices: sumByStatus(invoicesByStatus, "paid"),
    overdueInvoices: sumByStatus(invoicesByStatus, "overdue"),
    totalPayments: sumAll(paymentsByStatus),
    confirmedPayments: sumByStatus(paymentsByStatus, "confirmed"),
  };
}

/**
 * Fetch partner-specific earnings summary.
 */
export async function getPartnerEarningsSummary(
  tenantId: string,
  partnerId: string,
): Promise<{
  total: number;
  pending: number;
  approved: number;
  paid: number;
}> {
  const rows = await aggregateCrud<{ status: string; total: string }>(
    "partner_earnings",
    [{ function: "SUM", field: "amount", alias: "total" }],
    {
      groupBy: ["status"],
      filters: [
        { field: "tenant_id", value: tenantId },
        { field: "partner_id", value: partnerId },
      ],
      autoExcludeDeleted: true,
    },
  );

  const byStatus = (s: string) =>
    Number(rows.find((r) => r.status === s)?.total || 0);
  return {
    total: rows.reduce((s, r) => s + Number(r.total || 0), 0),
    pending: byStatus("pending"),
    approved: byStatus("approved"),
    paid: byStatus("paid"),
  };
}

/**
 * Fetch monthly revenue breakdown for charts.
 * Uses invoices paid_at date grouped by month.
 */
export async function getMonthlyRevenue(
  tenantId: string,
  year: number,
): Promise<{ month: string; total: number }[]> {
  try {
    const res = await api.post("/financial/monthly-revenue", {
      tenantId,
      year,
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map((r: Record<string, unknown>) => ({
      month: String(r.month ?? ""),
      total: Number(r.total || 0),
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Accounts Payable CRUD                                              */
/* ------------------------------------------------------------------ */

export async function listAccountsPayable(
  filters: CrudFilter[] = [],
  options?: CrudListOptions,
): Promise<AccountPayable[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "accounts_payable",
    ...buildSearchParams(filters, {
      sortColumn: "due_date ASC",
      ...options,
    }),
  });
  return normalizeCrudList<AccountPayable>(res.data).filter(
    (item) => !item.deleted_at,
  );
}

export async function createAccountPayable(
  payload: Partial<AccountPayable>,
): Promise<AccountPayable> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "accounts_payable",
    payload,
  });
  return normalizeCrudOne<AccountPayable>(res.data);
}

export async function updateAccountPayable(
  payload: Partial<AccountPayable> & { id: string },
): Promise<AccountPayable> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "accounts_payable",
    payload,
  });
  return normalizeCrudOne<AccountPayable>(res.data);
}

export async function payAccountPayableViaAsaas(params: {
  payable: AccountPayable;
  amount?: number;
  description?: string;
}): Promise<{ transferId: string; status: string }> {
  const { payable, amount, description } = params;
  const pixKey = payable.pix_key ?? "";
  if (!pixKey) {
    throw new Error("Conta a pagar sem chave PIX");
  }

  const amountToPay = amount ?? payable.amount;
  const transfer = await asaasPixOut({
    amount_cents: Math.round(amountToPay * 100),
    pix_key: pixKey,
    pix_key_type: payable.pix_key_type ?? undefined,
    description: description ?? payable.description,
    external_reference: payable.id,
  });

  await updateAccountPayable({
    id: payable.id,
    status: "paid",
    amount_paid: amountToPay,
    paid_at: new Date().toISOString(),
    payment_method: "pix",
    notes: payable.notes
      ? `${payable.notes}\nASAAS transfer: ${transfer.transferId}`
      : `ASAAS transfer: ${transfer.transferId}`,
  });

  return { transferId: transfer.transferId, status: transfer.status };
}

/* ------------------------------------------------------------------ */
/*  Accounts Receivable CRUD                                           */
/* ------------------------------------------------------------------ */

export async function listAccountsReceivable(
  filters: CrudFilter[] = [],
  options?: CrudListOptions,
): Promise<AccountReceivable[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "accounts_receivable",
    ...buildSearchParams(filters, {
      sortColumn: "due_date ASC",
      ...options,
    }),
  });
  return normalizeCrudList<AccountReceivable>(res.data).filter(
    (item) => !item.deleted_at,
  );
}

export async function createAccountReceivable(
  payload: Partial<AccountReceivable>,
): Promise<AccountReceivable> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "accounts_receivable",
    payload,
  });
  return normalizeCrudOne<AccountReceivable>(res.data);
}

export async function updateAccountReceivable(
  payload: Partial<AccountReceivable> & { id: string },
): Promise<AccountReceivable> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "accounts_receivable",
    payload,
  });
  return normalizeCrudOne<AccountReceivable>(res.data);
}

/* ------------------------------------------------------------------ */
/*  AP/AR Aggregations                                                 */
/* ------------------------------------------------------------------ */

export interface APARSummary {
  totalPayable: number;
  pendingPayable: number;
  overduePayable: number;
  paidPayable: number;
  totalReceivable: number;
  pendingReceivable: number;
  overdueReceivable: number;
  receivedTotal: number;
}

export async function getAPARSummary(tenantId: string): Promise<APARSummary> {
  const tenantFilter: CrudFilter[] = [{ field: "tenant_id", value: tenantId }];

  const [apByStatus, arByStatus] = await Promise.all([
    aggregateCrud<{ status: string; total: string }>(
      "accounts_payable",
      [{ function: "SUM", field: "amount", alias: "total" }],
      {
        groupBy: ["status"],
        filters: tenantFilter,
        autoExcludeDeleted: true,
      },
    ),
    aggregateCrud<{ status: string; total: string }>(
      "accounts_receivable",
      [{ function: "SUM", field: "amount", alias: "total" }],
      {
        groupBy: ["status"],
        filters: tenantFilter,
        autoExcludeDeleted: true,
      },
    ),
  ]);

  const sumByStatus = (
    rows: { status: string; total: string }[],
    status: string,
  ) => Number(rows.find((r) => r.status === status)?.total || 0);
  const sumAll = (rows: { total: string }[]) =>
    rows.reduce((s, r) => s + Number(r.total || 0), 0);

  return {
    totalPayable: sumAll(apByStatus),
    pendingPayable: sumByStatus(apByStatus, "pending"),
    overduePayable: sumByStatus(apByStatus, "overdue"),
    paidPayable: sumByStatus(apByStatus, "paid"),
    totalReceivable: sumAll(arByStatus),
    pendingReceivable: sumByStatus(arByStatus, "pending"),
    overdueReceivable: sumByStatus(arByStatus, "overdue"),
    receivedTotal: sumByStatus(arByStatus, "paid"),
  };
}

/* ------------------------------------------------------------------ */
/*  Delinquency / Inadimplência                                        */
/* ------------------------------------------------------------------ */

/** A customer with overdue accounts receivable */
export interface DelinquentCustomer {
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_cpf_cnpj: string | null;
  overdue_count: number;
  total_overdue: number;
  total_received: number;
  oldest_due_date: string;
  newest_due_date: string;
  days_overdue: number;
}

/** An individual overdue entry for a specific customer */
export interface OverdueEntry {
  id: string;
  description: string;
  type: string;
  category: string | null;
  amount: number;
  amount_received: number;
  balance: number;
  due_date: string;
  days_overdue: number;
  status: string;
  payment_method: string | null;
  notes: string | null;
  customer_id: string;
}

/** Summary metrics for the delinquency dashboard header */
export interface DelinquencySummary {
  totalOverdueAmount: number;
  totalDelinquents: number;
  averageDaysOverdue: number;
  oldestOverdueDays: number;
  totalOverdueEntries: number;
  totalPartialAmount: number;
}

/**
 * Fetch delinquent customers with aggregated overdue amounts.
 * Uses dedicated Worker endpoint with parametrized query.
 */
export async function getDelinquentCustomers(
  tenantId: string,
  partnerId?: string,
): Promise<DelinquentCustomer[]> {
  try {
    const res = await api.post("/financial/delinquent-customers", {
      tenantId,
      ...(partnerId ? { partnerId } : {}),
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map((r: Record<string, unknown>) => ({
      customer_id: String(r.customer_id ?? ""),
      customer_name: String(r.customer_name ?? "Cliente não identificado"),
      customer_email: r.customer_email ? String(r.customer_email) : null,
      customer_phone: r.customer_phone ? String(r.customer_phone) : null,
      customer_cpf_cnpj: r.customer_cpf_cnpj
        ? String(r.customer_cpf_cnpj)
        : null,
      overdue_count: Number(r.overdue_count || 0),
      total_overdue: Number(r.total_overdue || 0),
      total_received: Number(r.total_received || 0),
      oldest_due_date: String(r.oldest_due_date ?? ""),
      newest_due_date: String(r.newest_due_date ?? ""),
      days_overdue: Number(r.days_overdue || 0),
    }));
  } catch (err) {
    console.error("[Inadimplentes] getDelinquentCustomers error:", err);
    return [];
  }
}

/**
 * Fetch individual overdue entries for a specific customer.
 */
export async function getOverdueEntriesForCustomer(
  tenantId: string,
  customerId: string,
  partnerId?: string,
): Promise<OverdueEntry[]> {
  try {
    const res = await api.post("/financial/overdue-entries", {
      tenantId,
      customerId,
      ...(partnerId ? { partnerId } : {}),
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      description: String(r.description ?? ""),
      type: String(r.type ?? ""),
      category: r.category ? String(r.category) : null,
      amount: Number(r.amount || 0),
      amount_received: Number(r.amount_received || 0),
      balance: Number(r.balance || 0),
      due_date: String(r.due_date ?? ""),
      days_overdue: Number(r.days_overdue || 0),
      status: String(r.status ?? ""),
      payment_method: r.payment_method ? String(r.payment_method) : null,
      notes: r.notes ? String(r.notes) : null,
      customer_id: String(r.customer_id ?? ""),
    }));
  } catch (err) {
    console.error("[Inadimplentes] getOverdueEntriesForCustomer error:", err);
    return [];
  }
}

/**
 * Get summary metrics for the delinquency dashboard.
 */
export async function getDelinquencySummary(
  tenantId: string,
  partnerId?: string,
): Promise<DelinquencySummary> {
  try {
    const res = await api.post("/financial/delinquency-summary", {
      tenantId,
      ...(partnerId ? { partnerId } : {}),
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    const r = (rows[0] as Record<string, unknown>) ?? {};
    return {
      totalOverdueAmount: Number(r.total_overdue_amount || 0),
      totalDelinquents: Number(r.total_delinquents || 0),
      averageDaysOverdue: Number(r.avg_days_overdue || 0),
      oldestOverdueDays: Number(r.oldest_overdue_days || 0),
      totalOverdueEntries: Number(r.total_overdue_entries || 0),
      totalPartialAmount: Number(r.total_partial_amount || 0),
    };
  } catch (err) {
    console.error("[Inadimplentes] getDelinquencySummary error:", err);
    return {
      totalOverdueAmount: 0,
      totalDelinquents: 0,
      averageDaysOverdue: 0,
      oldestOverdueDays: 0,
      totalOverdueEntries: 0,
      totalPartialAmount: 0,
    };
  }
}

/**
 * Mark overdue entries for a customer as "overdue" status
 * (in case they were still "pending" but past due_date).
 */
export async function markEntriesAsOverdue(
  tenantId: string,
  partnerId?: string,
): Promise<number> {
  try {
    const res = await api.post("/financial/mark-overdue", {
      tenantId,
      ...(partnerId ? { partnerId } : {}),
    });
    return Number((res.data as Record<string, unknown>)?.updated || 0);
  } catch (err) {
    console.error("[Inadimplentes] markEntriesAsOverdue error:", err);
    return 0;
  }
}
