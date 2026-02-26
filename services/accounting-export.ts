/**
 * Accounting Export Service
 *
 * Generates CSV data for monthly accounting closure ("Fechamento Contábil").
 * Exports all financial data for a given competence month so tenants can
 * send it to their accountant easily.
 *
 * Documents exported:
 *   1. Contas a Receber (accounts_receivable)
 *   2. Contas a Pagar (accounts_payable)
 *   3. Faturas emitidas (invoices)
 *   4. Pagamentos recebidos (payments)
 *   5. Ganhos de Parceiros (partner_earnings)
 *   6. Movimentações bancárias (bank_reconciliation_items matched)
 *   7. Resumo DRE (sales + sale_items aggregated)
 *
 * Each export function returns { csv: string; filename: string; count: number; total: number }
 * so the UI can show status indicators and trigger downloads/shares.
 */

import { Platform } from "react-native";
import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    type CrudFilter,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExportResult {
  csv: string;
  filename: string;
  count: number;
  total: number; // monetary total (R$) where applicable
}

export interface ExportDocumentDef {
  key: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  exportFn: (
    tenantId: string,
    year: number,
    month: number,
  ) => Promise<ExportResult>;
}

export interface MonthSummary {
  key: string;
  count: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format a competence period start/end as ISO date strings */
function competenceRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 1); // first day of NEXT month
  const end = endDate.toISOString().split("T")[0];
  return { start, end };
}

/** Escape a CSV field value (handles commas, quotes, newlines) */
function csvEscape(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build CSV string from array of objects and column definitions */
function buildCsv(
  rows: Record<string, unknown>[],
  columns: { key: string; header: string }[],
): string {
  const header = columns.map((c) => csvEscape(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(row[c.key])).join(","),
  );
  // BOM for Excel pt-BR encoding
  return "\uFEFF" + [header, ...lines].join("\r\n");
}

/** Format a number as Brazilian currency string for CSV */
function fmtBRL(value: unknown): string {
  const num = typeof value === "string" ? parseFloat(value) : (value as number);
  if (num == null || isNaN(num)) return "0,00";
  return num.toFixed(2).replace(".", ",");
}

/** Format a date for CSV display */
function fmtDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("pt-BR");
}

/** Build filename with tenant context */
function makeFilename(
  docType: string,
  year: number,
  month: number,
  ext = "csv",
): string {
  const mm = String(month).padStart(2, "0");
  return `${docType}_${year}-${mm}.${ext}`;
}

/* ------------------------------------------------------------------ */
/*  Fetch helpers (using api_crud)                                     */
/* ------------------------------------------------------------------ */

async function fetchByCompetence(
  table: string,
  tenantId: string,
  year: number,
  month: number,
  dateField = "competence_date",
  extraFilters: CrudFilter[] = [],
): Promise<Record<string, unknown>[]> {
  const { start, end } = competenceRange(year, month);
  const filters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    { field: dateField, value: start, operator: "gte" },
    { field: dateField, value: end, operator: "lt" },
    ...extraFilters,
  ];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams(filters, {
      sortColumn: `${dateField} ASC`,
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<Record<string, unknown>>(res.data);
}

async function fetchByDateRange(
  table: string,
  tenantId: string,
  year: number,
  month: number,
  dateField: string,
  extraFilters: CrudFilter[] = [],
): Promise<Record<string, unknown>[]> {
  const { start, end } = competenceRange(year, month);
  const filters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    { field: dateField, value: start, operator: "gte" },
    { field: dateField, value: end, operator: "lt" },
    ...extraFilters,
  ];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams(filters, {
      sortColumn: `${dateField} ASC`,
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<Record<string, unknown>>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Export: Contas a Receber                                           */
/* ------------------------------------------------------------------ */

const AR_COLUMNS = [
  { key: "description", header: "Descrição" },
  { key: "type", header: "Tipo" },
  { key: "category", header: "Categoria" },
  { key: "amount_fmt", header: "Valor (R$)" },
  { key: "amount_received_fmt", header: "Recebido (R$)" },
  { key: "status", header: "Status" },
  { key: "due_date_fmt", header: "Vencimento" },
  { key: "received_at_fmt", header: "Data Recebimento" },
  { key: "competence_date_fmt", header: "Competência" },
  { key: "payment_method", header: "Forma Pagamento" },
  { key: "recurrence", header: "Recorrência" },
  { key: "notes_clean", header: "Observações" },
];

export async function exportContasAReceber(
  tenantId: string,
  year: number,
  month: number,
): Promise<ExportResult> {
  // Fetch by competence_date first; fall back to due_date for entries without competence
  const byCompetence = await fetchByCompetence(
    "accounts_receivable",
    tenantId,
    year,
    month,
    "competence_date",
  );
  const byDueDate = await fetchByDateRange(
    "accounts_receivable",
    tenantId,
    year,
    month,
    "due_date",
  );

  // Merge: use competence entries + due_date entries that don't have competence_date
  const idSet = new Set(byCompetence.map((r) => String(r.id)));
  const fallback = byDueDate.filter(
    (r) => !r.competence_date && !idSet.has(String(r.id)),
  );
  const rows = [...byCompetence, ...fallback];

  const mapped = rows.map((r) => ({
    ...r,
    amount_fmt: fmtBRL(r.amount),
    amount_received_fmt: fmtBRL(r.amount_received),
    due_date_fmt: fmtDate(r.due_date),
    received_at_fmt: fmtDate(r.received_at),
    competence_date_fmt: fmtDate(r.competence_date),
    notes_clean: r.notes
      ? typeof r.notes === "object"
        ? JSON.stringify(r.notes)
        : String(r.notes)
      : "",
  }));

  const total = rows.reduce(
    (sum, r) => sum + (parseFloat(String(r.amount ?? 0)) || 0),
    0,
  );

  return {
    csv: buildCsv(mapped, AR_COLUMNS),
    filename: makeFilename("contas_a_receber", year, month),
    count: rows.length,
    total,
  };
}

/* ------------------------------------------------------------------ */
/*  Export: Contas a Pagar                                             */
/* ------------------------------------------------------------------ */

const AP_COLUMNS = [
  { key: "description", header: "Descrição" },
  { key: "type", header: "Tipo" },
  { key: "category", header: "Categoria" },
  { key: "supplier_name", header: "Fornecedor" },
  { key: "amount_fmt", header: "Valor (R$)" },
  { key: "amount_paid_fmt", header: "Pago (R$)" },
  { key: "status", header: "Status" },
  { key: "due_date_fmt", header: "Vencimento" },
  { key: "paid_at_fmt", header: "Data Pagamento" },
  { key: "competence_date_fmt", header: "Competência" },
  { key: "payment_method", header: "Forma Pagamento" },
  { key: "recurrence", header: "Recorrência" },
  { key: "notes", header: "Observações" },
];

export async function exportContasAPagar(
  tenantId: string,
  year: number,
  month: number,
): Promise<ExportResult> {
  const byCompetence = await fetchByCompetence(
    "accounts_payable",
    tenantId,
    year,
    month,
    "competence_date",
  );
  const byDueDate = await fetchByDateRange(
    "accounts_payable",
    tenantId,
    year,
    month,
    "due_date",
  );

  const idSet = new Set(byCompetence.map((r) => String(r.id)));
  const fallback = byDueDate.filter(
    (r) => !r.competence_date && !idSet.has(String(r.id)),
  );
  const rows = [...byCompetence, ...fallback];

  const mapped = rows.map((r) => ({
    ...r,
    amount_fmt: fmtBRL(r.amount),
    amount_paid_fmt: fmtBRL(r.amount_paid),
    due_date_fmt: fmtDate(r.due_date),
    paid_at_fmt: fmtDate(r.paid_at),
    competence_date_fmt: fmtDate(r.competence_date),
  }));

  const total = rows.reduce(
    (sum, r) => sum + (parseFloat(String(r.amount ?? 0)) || 0),
    0,
  );

  return {
    csv: buildCsv(mapped, AP_COLUMNS),
    filename: makeFilename("contas_a_pagar", year, month),
    count: rows.length,
    total,
  };
}

/* ------------------------------------------------------------------ */
/*  Export: Faturas                                                     */
/* ------------------------------------------------------------------ */

const INVOICE_COLUMNS = [
  { key: "invoice_number", header: "Nº Fatura" },
  { key: "status", header: "Status" },
  { key: "subtotal_fmt", header: "Subtotal (R$)" },
  { key: "discount_fmt", header: "Desconto (R$)" },
  { key: "tax_fmt", header: "Impostos (R$)" },
  { key: "total_fmt", header: "Total (R$)" },
  { key: "issued_at_fmt", header: "Data Emissão" },
  { key: "due_at_fmt", header: "Vencimento" },
  { key: "paid_at_fmt", header: "Data Pagamento" },
  { key: "payment_method", header: "Forma Pagamento" },
  { key: "notes", header: "Observações" },
];

export async function exportFaturas(
  tenantId: string,
  year: number,
  month: number,
): Promise<ExportResult> {
  const rows = await fetchByDateRange(
    "invoices",
    tenantId,
    year,
    month,
    "issued_at",
  );

  const mapped = rows.map((r) => ({
    ...r,
    subtotal_fmt: fmtBRL(r.subtotal),
    discount_fmt: fmtBRL(r.discount),
    tax_fmt: fmtBRL(r.tax),
    total_fmt: fmtBRL(r.total),
    issued_at_fmt: fmtDate(r.issued_at),
    due_at_fmt: fmtDate(r.due_at),
    paid_at_fmt: fmtDate(r.paid_at),
  }));

  const total = rows.reduce(
    (sum, r) => sum + (parseFloat(String(r.total ?? 0)) || 0),
    0,
  );

  return {
    csv: buildCsv(mapped, INVOICE_COLUMNS),
    filename: makeFilename("faturas", year, month),
    count: rows.length,
    total,
  };
}

/* ------------------------------------------------------------------ */
/*  Export: Pagamentos                                                 */
/* ------------------------------------------------------------------ */

const PAYMENT_COLUMNS = [
  { key: "description", header: "Descrição" },
  { key: "amount_fmt", header: "Valor (R$)" },
  { key: "method", header: "Método" },
  { key: "status", header: "Status" },
  { key: "paid_at_fmt", header: "Data Pagamento" },
  { key: "gateway_ref", header: "Referência Gateway" },
  { key: "notes", header: "Observações" },
];

export async function exportPagamentos(
  tenantId: string,
  year: number,
  month: number,
): Promise<ExportResult> {
  const rows = await fetchByDateRange(
    "payments",
    tenantId,
    year,
    month,
    "paid_at",
    [{ field: "status", value: "confirmed" }],
  );

  const mapped = rows.map((r) => ({
    ...r,
    amount_fmt: fmtBRL(r.amount),
    paid_at_fmt: fmtDate(r.paid_at),
  }));

  const total = rows.reduce(
    (sum, r) => sum + (parseFloat(String(r.amount ?? 0)) || 0),
    0,
  );

  return {
    csv: buildCsv(mapped, PAYMENT_COLUMNS),
    filename: makeFilename("pagamentos", year, month),
    count: rows.length,
    total,
  };
}

/* ------------------------------------------------------------------ */
/*  Export: Ganhos de Parceiros                                        */
/* ------------------------------------------------------------------ */

const EARNINGS_COLUMNS = [
  { key: "description", header: "Descrição" },
  { key: "type", header: "Tipo" },
  { key: "amount_fmt", header: "Valor (R$)" },
  { key: "status", header: "Status" },
  { key: "paid_at_fmt", header: "Data Pagamento" },
  { key: "payment_reference", header: "Referência" },
  { key: "notes", header: "Observações" },
];

export async function exportGanhosParceiros(
  tenantId: string,
  year: number,
  month: number,
): Promise<ExportResult> {
  const rows = await fetchByDateRange(
    "partner_earnings",
    tenantId,
    year,
    month,
    "created_at",
  );

  const mapped = rows.map((r) => ({
    ...r,
    amount_fmt: fmtBRL(r.amount),
    paid_at_fmt: fmtDate(r.paid_at),
  }));

  const total = rows.reduce(
    (sum, r) => sum + (parseFloat(String(r.amount ?? 0)) || 0),
    0,
  );

  return {
    csv: buildCsv(mapped, EARNINGS_COLUMNS),
    filename: makeFilename("ganhos_parceiros", year, month),
    count: rows.length,
    total,
  };
}

/* ------------------------------------------------------------------ */
/*  Export: Movimentações Bancárias (reconciled items)                  */
/* ------------------------------------------------------------------ */

const BANK_COLUMNS = [
  { key: "transaction_date_fmt", header: "Data" },
  { key: "description", header: "Descrição" },
  { key: "amount_fmt", header: "Valor (R$)" },
  { key: "transaction_type", header: "Tipo (D/C)" },
  { key: "status", header: "Status Conciliação" },
  { key: "matched_table", header: "Vinculado a" },
  { key: "fitid", header: "ID Transação" },
];

export async function exportMovimentacoesBancarias(
  tenantId: string,
  year: number,
  month: number,
): Promise<ExportResult> {
  const rows = await fetchByDateRange(
    "bank_reconciliation_items",
    tenantId,
    year,
    month,
    "transaction_date",
  );

  const mapped = rows.map((r) => ({
    ...r,
    transaction_date_fmt: fmtDate(r.transaction_date),
    amount_fmt: fmtBRL(r.amount),
  }));

  const total = rows.reduce(
    (sum, r) => sum + (parseFloat(String(r.amount ?? 0)) || 0),
    0,
  );

  return {
    csv: buildCsv(mapped, BANK_COLUMNS),
    filename: makeFilename("movimentacoes_bancarias", year, month),
    count: rows.length,
    total,
  };
}

/* ------------------------------------------------------------------ */
/*  Export: Resumo DRE (sales aggregate)                               */
/* ------------------------------------------------------------------ */

const DRE_COLUMNS = [
  { key: "period", header: "Período" },
  { key: "kind", header: "Tipo" },
  { key: "revenue_fmt", header: "Receita Bruta (R$)" },
  { key: "cost_fmt", header: "Custo (R$)" },
  { key: "margin_fmt", header: "Margem (R$)" },
  { key: "margin_pct", header: "Margem %" },
  { key: "discount_fmt", header: "Descontos (R$)" },
  { key: "sale_count", header: "Nº Vendas" },
];

export async function exportResumoDRE(
  tenantId: string,
  year: number,
  month: number,
): Promise<ExportResult> {
  const { start, end } = competenceRange(year, month);

  // Fetch sales for the month
  const salesRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sales",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "status", value: "cancelled", operator: "not_equal" as const },
        { field: "sale_date", value: start, operator: "gte" as const },
        { field: "sale_date", value: end, operator: "lt" as const },
      ],
      { sortColumn: "sale_date ASC", autoExcludeDeleted: true },
    ),
  });
  const sales = normalizeCrudList<Record<string, unknown>>(salesRes.data);

  if (sales.length === 0) {
    return {
      csv: buildCsv([], DRE_COLUMNS),
      filename: makeFilename("resumo_dre", year, month),
      count: 0,
      total: 0,
    };
  }

  // Fetch sale_items for those sales
  const saleIds = sales.map((s) => String(s.id));
  const itemsRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "sale_items",
    ...buildSearchParams(
      [{ field: "sale_id", value: saleIds.join(","), operator: "in" as const }],
      { autoExcludeDeleted: true },
    ),
  });
  const items = normalizeCrudList<Record<string, unknown>>(itemsRes.data);

  // Aggregate by kind
  const byKind: Record<
    string,
    {
      revenue: number;
      cost: number;
      discount: number;
      count: number;
    }
  > = {};

  for (const item of items) {
    const kind = String(item.item_kind ?? "service");
    if (!byKind[kind])
      byKind[kind] = { revenue: 0, cost: 0, discount: 0, count: 0 };
    byKind[kind].revenue += parseFloat(String(item.total_price ?? 0)) || 0;
    byKind[kind].cost +=
      (parseFloat(String(item.quantity ?? 0)) || 0) *
      (parseFloat(String(item.unit_cost ?? 0)) || 0);
  }

  // Add discount from sales
  for (const sale of sales) {
    // We don't know the kind of each sale's discount, add to "total"
    const disc = parseFloat(String(sale.discount_amount ?? 0)) || 0;
    if (!byKind["total"])
      byKind["total"] = { revenue: 0, cost: 0, discount: 0, count: 0 };
    byKind["total"].discount += disc;
    byKind["total"].count += 1;
  }

  // Compute totals
  let totalRevenue = 0;
  let totalCost = 0;
  let totalDiscount = byKind["total"]?.discount ?? 0;
  const totalCount = sales.length;

  const mm = String(month).padStart(2, "0");
  const periodLabel = `${year}-${mm}`;

  const rows: Record<string, unknown>[] = [];

  for (const [kind, agg] of Object.entries(byKind)) {
    if (kind === "total") continue;
    const margin = agg.revenue - agg.cost;
    const marginPct = agg.revenue > 0 ? (margin / agg.revenue) * 100 : 0;
    totalRevenue += agg.revenue;
    totalCost += agg.cost;
    rows.push({
      period: periodLabel,
      kind: kind === "product" ? "Produto" : "Serviço",
      revenue_fmt: fmtBRL(agg.revenue),
      cost_fmt: fmtBRL(agg.cost),
      margin_fmt: fmtBRL(margin),
      margin_pct: `${marginPct.toFixed(1)}%`,
      discount_fmt: fmtBRL(0),
      sale_count: String(agg.count),
    });
  }

  // Total row
  const totalMargin = totalRevenue - totalCost;
  const totalMarginPct =
    totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
  rows.push({
    period: periodLabel,
    kind: "TOTAL",
    revenue_fmt: fmtBRL(totalRevenue),
    cost_fmt: fmtBRL(totalCost),
    margin_fmt: fmtBRL(totalMargin),
    margin_pct: `${totalMarginPct.toFixed(1)}%`,
    discount_fmt: fmtBRL(totalDiscount),
    sale_count: String(totalCount),
  });

  return {
    csv: buildCsv(rows, DRE_COLUMNS),
    filename: makeFilename("resumo_dre", year, month),
    count: sales.length,
    total: totalRevenue,
  };
}

/* ------------------------------------------------------------------ */
/*  Document Definitions (for the UI)                                  */
/* ------------------------------------------------------------------ */

export const EXPORT_DOCUMENTS: ExportDocumentDef[] = [
  {
    key: "contas_a_receber",
    label: "Contas a Receber",
    description: "Recebíveis do mês — valores, vencimentos e status",
    icon: "trending-up-outline",
    color: "#22c55e",
    exportFn: exportContasAReceber,
  },
  {
    key: "contas_a_pagar",
    label: "Contas a Pagar",
    description: "Despesas e pagamentos a fornecedores do mês",
    icon: "trending-down-outline",
    color: "#ef4444",
    exportFn: exportContasAPagar,
  },
  {
    key: "faturas",
    label: "Faturas Emitidas",
    description: "Notas e faturas emitidas no período",
    icon: "receipt-outline",
    color: "#3b82f6",
    exportFn: exportFaturas,
  },
  {
    key: "pagamentos",
    label: "Pagamentos Confirmados",
    description: "Pagamentos recebidos e confirmados no mês",
    icon: "card-outline",
    color: "#8b5cf6",
    exportFn: exportPagamentos,
  },
  {
    key: "ganhos_parceiros",
    label: "Ganhos de Parceiros",
    description: "Comissões, bônus e repasses a parceiros",
    icon: "people-outline",
    color: "#f59e0b",
    exportFn: exportGanhosParceiros,
  },
  {
    key: "movimentacoes_bancarias",
    label: "Movimentações Bancárias",
    description: "Extrato conciliado de transações bancárias",
    icon: "swap-horizontal-outline",
    color: "#14b8a6",
    exportFn: exportMovimentacoesBancarias,
  },
  {
    key: "resumo_dre",
    label: "Resumo DRE",
    description: "Receita × Custo × Margem do período",
    icon: "bar-chart-outline",
    color: "#ec4899",
    exportFn: exportResumoDRE,
  },
];

/* ------------------------------------------------------------------ */
/*  Batch Export (all documents)                                       */
/* ------------------------------------------------------------------ */

export async function exportAllDocuments(
  tenantId: string,
  year: number,
  month: number,
  onProgress?: (docKey: string, index: number, total: number) => void,
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];
  for (let i = 0; i < EXPORT_DOCUMENTS.length; i++) {
    const doc = EXPORT_DOCUMENTS[i];
    onProgress?.(doc.key, i, EXPORT_DOCUMENTS.length);
    try {
      const result = await doc.exportFn(tenantId, year, month);
      results.push(result);
    } catch {
      // On error, push an empty result so we don't break the batch
      results.push({
        csv: "",
        filename: `erro_${doc.key}.csv`,
        count: 0,
        total: 0,
      });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Summary (quick counts without full data)                           */
/* ------------------------------------------------------------------ */

export async function getMonthSummaries(
  tenantId: string,
  year: number,
  month: number,
): Promise<MonthSummary[]> {
  // Fetch lightweight counts for each document type in parallel
  const results = await Promise.allSettled(
    EXPORT_DOCUMENTS.map(async (doc) => {
      const result = await doc.exportFn(tenantId, year, month);
      return { key: doc.key, count: result.count, total: result.total };
    }),
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { key: EXPORT_DOCUMENTS[i].key, count: 0, total: 0 };
  });
}

/* ------------------------------------------------------------------ */
/*  File sharing helpers (cross-platform)                              */
/* ------------------------------------------------------------------ */

/**
 * Share/download a single CSV file.
 * On web: triggers a browser download.
 * On native: writes to cache dir + opens share sheet.
 */
export async function shareCsvFile(
  csv: string,
  filename: string,
): Promise<void> {
  if (Platform.OS === "web") {
    // Web: trigger download via blob
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // Native: write to FileSystem + share
  const fs = (await import("expo-file-system")) as any;
  const Sharing = await import("expo-sharing");

  const fileUri =
    (fs.cacheDirectory ?? fs.default?.cacheDirectory ?? "") + filename;
  await (fs.writeAsStringAsync ?? fs.default?.writeAsStringAsync)(
    fileUri,
    csv,
    {
      encoding: "utf8" as any,
    },
  );

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "text/csv",
      dialogTitle: `Exportar ${filename}`,
      UTI: "public.comma-separated-values-text",
    });
  }
}

/**
 * Share multiple CSV files (batch export).
 * On web: downloads each file sequentially.
 * On native: shares the first file (limitation of share sheet).
 * Future: could zip them.
 */
export async function shareMultipleCsvFiles(
  files: { csv: string; filename: string }[],
): Promise<void> {
  if (Platform.OS === "web") {
    // Download all files with small delays to avoid browser blocking
    for (const file of files) {
      if (!file.csv) continue;
      await shareCsvFile(file.csv, file.filename);
      await new Promise((r) => setTimeout(r, 300));
    }
    return;
  }

  // Native: write all files, share the directory or first file
  const fs = (await import("expo-file-system")) as any;
  const Sharing = await import("expo-sharing");

  const uris: string[] = [];
  for (const file of files) {
    if (!file.csv) continue;
    const fileUri =
      (fs.cacheDirectory ?? fs.default?.cacheDirectory ?? "") + file.filename;
    await (fs.writeAsStringAsync ?? fs.default?.writeAsStringAsync)(
      fileUri,
      file.csv,
      {
        encoding: "utf8" as any,
      },
    );
    uris.push(fileUri);
  }

  // Share first file (Android/iOS share sheet doesn't support multiple files easily)
  if (uris.length > 0 && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(uris[0], {
      mimeType: "text/csv",
      dialogTitle: "Exportar Fechamento Contábil",
      UTI: "public.comma-separated-values-text",
    });
  }
}
