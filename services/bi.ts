/**
 * BI Dashboard Service — Module-specific KPIs, charts, and tables.
 *
 * Each module function fetches tenant-scoped data via Metabase native SQL.
 * The tenant_id is always locked server-side — users cannot switch tenants.
 */

import {
    executeNativeQuery,
    getPostgresDatabaseId,
    isMetabaseAvailable,
} from "@/services/metabase";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface BiKpi {
  key: string;
  label: string;
  value: number | string;
  icon: string;
  color?: string;
  suffix?: string;
}

export interface BiChartItem {
  label: string;
  value: number;
}

export interface BiChart {
  key: string;
  label: string;
  type: "bar" | "line" | "horizontal";
  data: BiChartItem[];
}

export interface BiTable {
  key: string;
  label: string;
  columns: string[];
  rows: string[][];
}

export interface BiModuleData {
  kpis: BiKpi[];
  charts: BiChart[];
  tables: BiTable[];
}

export type BiModuleKey =
  | "geral"
  | "vendas"
  | "financeiro"
  | "processos"
  | "crm"
  | "estoque"
  | "compras";

export interface BiModuleDef {
  key: BiModuleKey;
  label: string;
  icon: string;
}

export const BI_MODULES: BiModuleDef[] = [
  { key: "geral", label: "Geral", icon: "grid-outline" },
  { key: "vendas", label: "Vendas", icon: "cart-outline" },
  { key: "financeiro", label: "Financeiro", icon: "wallet-outline" },
  { key: "processos", label: "Processos", icon: "git-network-outline" },
  { key: "crm", label: "CRM", icon: "people-outline" },
  { key: "estoque", label: "Estoque", icon: "cube-outline" },
  { key: "compras", label: "Compras", icon: "bag-handle-outline" },
];

/* ================================================================== */
/*  SQL helpers                                                        */
/* ================================================================== */

let _pgDbId: number | null = null;

async function getPgId(): Promise<number> {
  if (_pgDbId !== null) return _pgDbId;
  const id = await getPostgresDatabaseId();
  if (!id) throw new Error("PostgreSQL database not found in Metabase");
  _pgDbId = id;
  return id;
}

function esc(tenantId: string): string {
  return tenantId.replace(/'/g, "''");
}

async function queryOne(sql: string): Promise<any[]> {
  try {
    const dbId = await getPgId();
    const result = await executeNativeQuery(dbId, sql);
    return result?.data?.rows?.[0] ?? [];
  } catch {
    return [];
  }
}

async function queryAll(sql: string): Promise<any[][]> {
  try {
    const dbId = await getPgId();
    const result = await executeNativeQuery(dbId, sql);
    return result?.data?.rows ?? [];
  } catch {
    return [];
  }
}

async function queryTable(
  sql: string,
): Promise<{ columns: string[]; rows: string[][] }> {
  try {
    const dbId = await getPgId();
    const result = await executeNativeQuery(dbId, sql);
    const cols = (result?.data?.cols ?? []).map(
      (c: any) => c.display_name || c.name,
    );
    const rows = (result?.data?.rows ?? []).map((r: any[]) =>
      r.map((v) => (v === null || v === undefined ? "-" : String(v))),
    );
    return { columns: cols, rows };
  } catch {
    return { columns: [], rows: [] };
  }
}

function toChart(rows: any[][]): BiChartItem[] {
  return rows.map((r) => ({
    label: String(r[0] ?? ""),
    value: Number(r[1] ?? 0),
  }));
}

function fmtBrl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ================================================================== */
/*  Module: Geral (Overview)                                           */
/* ================================================================== */

async function loadModuleGeral(tenantId: string): Promise<BiModuleData> {
  const tid = esc(tenantId);
  const B = `WHERE tenant_id = '${tid}' AND deleted_at IS NULL`;

  const [
    custRow,
    soRow,
    salesRow,
    salesTotalRow,
    arRow,
    apRow,
    leadsRow,
    productsRow,
  ] = await Promise.all([
    queryOne(`SELECT COUNT(*)::int FROM customers ${B}`),
    queryOne(`SELECT COUNT(*)::int FROM service_orders ${B}`),
    queryOne(`SELECT COUNT(*)::int FROM sales ${B} AND status = 'completed'`),
    queryOne(
      `SELECT COALESCE(SUM(total),0)::numeric FROM sales ${B} AND status = 'completed'`,
    ),
    queryOne(
      `SELECT COALESCE(SUM(amount),0)::numeric FROM accounts_receivable ${B} AND status IN ('pending','partial','overdue')`,
    ),
    queryOne(
      `SELECT COALESCE(SUM(amount),0)::numeric FROM accounts_payable ${B} AND status IN ('pending','partial','overdue')`,
    ),
    queryOne(`SELECT COUNT(*)::int FROM leads ${B}`),
    queryOne(`SELECT COUNT(*)::int FROM services ${B} AND is_active = true`),
  ]);

  const kpis: BiKpi[] = [
    {
      key: "customers",
      label: "Clientes",
      value: Number(custRow[0] ?? 0),
      icon: "people-outline",
      color: "#8b5cf6",
    },
    {
      key: "sales_count",
      label: "Vendas",
      value: Number(salesRow[0] ?? 0),
      icon: "cart-outline",
      color: "#10b981",
    },
    {
      key: "sales_total",
      label: "Faturamento",
      value: fmtBrl(Number(salesTotalRow[0] ?? 0)),
      icon: "trending-up-outline",
      color: "#059669",
    },
    {
      key: "service_orders",
      label: "Ordens de Serviço",
      value: Number(soRow[0] ?? 0),
      icon: "document-text-outline",
      color: "#f59e0b",
    },
    {
      key: "ar_pending",
      label: "A Receber",
      value: fmtBrl(Number(arRow[0] ?? 0)),
      icon: "arrow-down-circle-outline",
      color: "#3b82f6",
    },
    {
      key: "ap_pending",
      label: "A Pagar",
      value: fmtBrl(Number(apRow[0] ?? 0)),
      icon: "arrow-up-circle-outline",
      color: "#ef4444",
    },
    {
      key: "leads",
      label: "Leads",
      value: Number(leadsRow[0] ?? 0),
      icon: "megaphone-outline",
      color: "#ec4899",
    },
    {
      key: "products",
      label: "Produtos/Serviços",
      value: Number(productsRow[0] ?? 0),
      icon: "cube-outline",
      color: "#6366f1",
    },
  ];

  const [salesByMonth, custByMonth] = await Promise.all([
    queryAll(
      `SELECT to_char(created_at, 'MM/YY') AS lbl, COALESCE(SUM(total),0)::numeric AS val FROM sales ${B} AND status = 'completed' AND created_at >= NOW() - INTERVAL '6 months' GROUP BY lbl ORDER BY MIN(created_at)`,
    ),
    queryAll(
      `SELECT to_char(created_at, 'MM/YY') AS lbl, COUNT(*)::int AS val FROM customers ${B} AND created_at >= NOW() - INTERVAL '6 months' GROUP BY lbl ORDER BY MIN(created_at)`,
    ),
  ]);

  const charts: BiChart[] = [
    {
      key: "sales_by_month",
      label: "Faturamento — Últimos 6 meses",
      type: "bar",
      data: toChart(salesByMonth),
    },
    {
      key: "cust_by_month",
      label: "Novos Clientes — Últimos 6 meses",
      type: "line",
      data: toChart(custByMonth),
    },
  ];

  return { kpis, charts, tables: [] };
}

/* ================================================================== */
/*  Module: Vendas (PDV)                                               */
/* ================================================================== */

async function loadModuleVendas(tenantId: string): Promise<BiModuleData> {
  const tid = esc(tenantId);
  const B = `WHERE tenant_id = '${tid}' AND deleted_at IS NULL`;
  const COMPLETED = `${B} AND status = 'completed'`;

  const [totalRow, countRow, ticketRow, todayRow, cancelledRow] =
    await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(total),0)::numeric FROM sales ${COMPLETED}`,
      ),
      queryOne(`SELECT COUNT(*)::int FROM sales ${COMPLETED}`),
      queryOne(
        `SELECT COALESCE(AVG(total),0)::numeric FROM sales ${COMPLETED}`,
      ),
      queryOne(
        `SELECT COALESCE(SUM(total),0)::numeric, COUNT(*)::int FROM sales ${COMPLETED} AND created_at::date = CURRENT_DATE`,
      ),
      queryOne(`SELECT COUNT(*)::int FROM sales ${B} AND status = 'cancelled'`),
    ]);

  const kpis: BiKpi[] = [
    {
      key: "total_revenue",
      label: "Receita Total",
      value: fmtBrl(Number(totalRow[0] ?? 0)),
      icon: "cash-outline",
      color: "#10b981",
    },
    {
      key: "total_sales",
      label: "Total Vendas",
      value: Number(countRow[0] ?? 0),
      icon: "receipt-outline",
      color: "#3b82f6",
    },
    {
      key: "avg_ticket",
      label: "Ticket Médio",
      value: fmtBrl(Number(ticketRow[0] ?? 0)),
      icon: "pricetag-outline",
      color: "#8b5cf6",
    },
    {
      key: "today_revenue",
      label: "Vendas Hoje",
      value: fmtBrl(Number(todayRow[0] ?? 0)),
      icon: "today-outline",
      color: "#059669",
    },
    {
      key: "today_count",
      label: "Qtd Hoje",
      value: Number(todayRow[1] ?? 0),
      icon: "bag-check-outline",
      color: "#0ea5e9",
    },
    {
      key: "cancelled",
      label: "Canceladas",
      value: Number(cancelledRow[0] ?? 0),
      icon: "close-circle-outline",
      color: "#ef4444",
    },
  ];

  const [byMonth, byPayment, topProducts] = await Promise.all([
    queryAll(
      `SELECT to_char(s.created_at, 'MM/YY') AS lbl, COALESCE(SUM(s.total),0)::numeric AS val FROM sales s WHERE s.tenant_id = '${tid}' AND s.deleted_at IS NULL AND s.status = 'completed' AND s.created_at >= NOW() - INTERVAL '6 months' GROUP BY lbl ORDER BY MIN(s.created_at)`,
    ),
    queryAll(
      `SELECT COALESCE(NULLIF(payment_method,''), 'N/I') AS lbl, COUNT(*)::int AS val FROM sales ${COMPLETED} GROUP BY lbl ORDER BY val DESC LIMIT 8`,
    ),
    queryAll(
      `SELECT COALESCE(si.description, 'Item') AS lbl, SUM(si.subtotal)::numeric AS val FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.tenant_id = '${tid}' AND s.deleted_at IS NULL AND s.status = 'completed' AND si.deleted_at IS NULL GROUP BY lbl ORDER BY val DESC LIMIT 10`,
    ),
  ]);

  const charts: BiChart[] = [
    {
      key: "revenue_by_month",
      label: "Receita por Mês",
      type: "bar",
      data: toChart(byMonth),
    },
    {
      key: "by_payment",
      label: "Vendas por Forma de Pagamento",
      type: "horizontal",
      data: toChart(byPayment),
    },
    {
      key: "top_products",
      label: "Top 10 Produtos/Serviços",
      type: "horizontal",
      data: toChart(topProducts),
    },
  ];

  const recentSales = await queryTable(
    `SELECT to_char(s.created_at, 'DD/MM HH24:MI') AS "Data", COALESCE(s.payment_method, '-') AS "Pagamento", s.total::numeric AS "Total", s.status AS "Status" FROM sales s WHERE s.tenant_id = '${tid}' AND s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 10`,
  );

  return {
    kpis,
    charts,
    tables: [{ key: "recent_sales", label: "Últimas Vendas", ...recentSales }],
  };
}

/* ================================================================== */
/*  Module: Financeiro                                                 */
/* ================================================================== */

async function loadModuleFinanceiro(tenantId: string): Promise<BiModuleData> {
  const tid = esc(tenantId);
  const B = `WHERE tenant_id = '${tid}' AND deleted_at IS NULL`;

  const [arTotal, arPaid, apTotal, apPaid, arOverdue, apOverdue] =
    await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(amount),0)::numeric FROM accounts_receivable ${B} AND status IN ('pending','partial','overdue')`,
      ),
      queryOne(
        `SELECT COALESCE(SUM(amount_received),0)::numeric FROM accounts_receivable ${B} AND status = 'paid'`,
      ),
      queryOne(
        `SELECT COALESCE(SUM(amount),0)::numeric FROM accounts_payable ${B} AND status IN ('pending','partial','overdue')`,
      ),
      queryOne(
        `SELECT COALESCE(SUM(amount_paid),0)::numeric FROM accounts_payable ${B} AND status = 'paid'`,
      ),
      queryOne(
        `SELECT COUNT(*)::int FROM accounts_receivable ${B} AND status = 'overdue'`,
      ),
      queryOne(
        `SELECT COUNT(*)::int FROM accounts_payable ${B} AND status = 'overdue'`,
      ),
    ]);

  const arTotalVal = Number(arTotal[0] ?? 0);
  const apTotalVal = Number(apTotal[0] ?? 0);

  const kpis: BiKpi[] = [
    {
      key: "ar_pending",
      label: "A Receber (Pendente)",
      value: fmtBrl(arTotalVal),
      icon: "arrow-down-circle-outline",
      color: "#3b82f6",
    },
    {
      key: "ar_received",
      label: "Recebido",
      value: fmtBrl(Number(arPaid[0] ?? 0)),
      icon: "checkmark-circle-outline",
      color: "#10b981",
    },
    {
      key: "ap_pending",
      label: "A Pagar (Pendente)",
      value: fmtBrl(apTotalVal),
      icon: "arrow-up-circle-outline",
      color: "#f59e0b",
    },
    {
      key: "ap_paid",
      label: "Pago",
      value: fmtBrl(Number(apPaid[0] ?? 0)),
      icon: "card-outline",
      color: "#8b5cf6",
    },
    {
      key: "balance",
      label: "Saldo (Receber − Pagar)",
      value: fmtBrl(arTotalVal - apTotalVal),
      icon: "swap-horizontal-outline",
      color: arTotalVal >= apTotalVal ? "#059669" : "#ef4444",
    },
    {
      key: "ar_overdue",
      label: "Receber Vencidos",
      value: Number(arOverdue[0] ?? 0),
      icon: "alert-circle-outline",
      color: "#ef4444",
    },
    {
      key: "ap_overdue",
      label: "Pagar Vencidos",
      value: Number(apOverdue[0] ?? 0),
      icon: "warning-outline",
      color: "#dc2626",
    },
  ];

  const [arByMonth, apByMonth, arByStatus] = await Promise.all([
    queryAll(
      `SELECT to_char(due_date, 'MM/YY') AS lbl, COALESCE(SUM(amount),0)::numeric AS val FROM accounts_receivable ${B} AND due_date >= NOW() - INTERVAL '6 months' AND due_date <= NOW() + INTERVAL '3 months' GROUP BY lbl ORDER BY MIN(due_date)`,
    ),
    queryAll(
      `SELECT to_char(due_date, 'MM/YY') AS lbl, COALESCE(SUM(amount),0)::numeric AS val FROM accounts_payable ${B} AND due_date >= NOW() - INTERVAL '6 months' AND due_date <= NOW() + INTERVAL '3 months' GROUP BY lbl ORDER BY MIN(due_date)`,
    ),
    queryAll(
      `SELECT status AS lbl, COUNT(*)::int AS val FROM accounts_receivable ${B} GROUP BY lbl ORDER BY val DESC`,
    ),
  ]);

  const charts: BiChart[] = [
    {
      key: "ar_by_month",
      label: "Contas a Receber por Mês",
      type: "bar",
      data: toChart(arByMonth),
    },
    {
      key: "ap_by_month",
      label: "Contas a Pagar por Mês",
      type: "bar",
      data: toChart(apByMonth),
    },
    {
      key: "ar_by_status",
      label: "Recebíveis por Status",
      type: "horizontal",
      data: toChart(arByStatus),
    },
  ];

  const upcomingAR = await queryTable(
    `SELECT description AS "Descrição", amount::numeric AS "Valor", to_char(due_date, 'DD/MM/YY') AS "Vencimento", status AS "Status" FROM accounts_receivable ${B} AND status IN ('pending','partial','overdue') ORDER BY due_date ASC LIMIT 10`,
  );

  return {
    kpis,
    charts,
    tables: [
      {
        key: "upcoming_ar",
        label: "Próximos Recebimentos",
        ...upcomingAR,
      },
    ],
  };
}

/* ================================================================== */
/*  Module: Processos (Service Orders / Workflows)                     */
/* ================================================================== */

async function loadModuleProcessos(tenantId: string): Promise<BiModuleData> {
  const tid = esc(tenantId);
  const B = `WHERE tenant_id = '${tid}' AND deleted_at IS NULL`;

  const [soTotal, soOpen, soFinished, tasksOpen, overdueRow, avgDaysRow] =
    await Promise.all([
      queryOne(`SELECT COUNT(*)::int FROM service_orders ${B}`),
      queryOne(
        `SELECT COUNT(*)::int FROM service_orders ${B} AND finished_at IS NULL`,
      ),
      queryOne(
        `SELECT COUNT(*)::int FROM service_orders ${B} AND finished_at IS NOT NULL`,
      ),
      queryOne(
        `SELECT COUNT(*)::int FROM tasks ${B} AND COALESCE(status,'') NOT IN ('completed','done','finished')`,
      ),
      queryOne(
        `SELECT COUNT(*)::int FROM process_deadlines ${B} AND status != 'completed' AND due_date < NOW()`,
      ),
      queryOne(
        `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) / 86400), 0)::numeric FROM service_orders ${B} AND finished_at IS NOT NULL AND started_at IS NOT NULL`,
      ),
    ]);

  const kpis: BiKpi[] = [
    {
      key: "total",
      label: "Total Processos",
      value: Number(soTotal[0] ?? 0),
      icon: "layers-outline",
      color: "#3b82f6",
    },
    {
      key: "open",
      label: "Em Andamento",
      value: Number(soOpen[0] ?? 0),
      icon: "time-outline",
      color: "#f59e0b",
    },
    {
      key: "finished",
      label: "Concluídos",
      value: Number(soFinished[0] ?? 0),
      icon: "checkmark-done-outline",
      color: "#10b981",
    },
    {
      key: "tasks_open",
      label: "Tarefas Pendentes",
      value: Number(tasksOpen[0] ?? 0),
      icon: "checkbox-outline",
      color: "#6366f1",
    },
    {
      key: "overdue",
      label: "Prazos Vencidos",
      value: Number(overdueRow[0] ?? 0),
      icon: "alert-circle-outline",
      color: "#ef4444",
    },
    {
      key: "avg_days",
      label: "Tempo Médio (dias)",
      value: Math.round(Number(avgDaysRow[0] ?? 0)),
      icon: "hourglass-outline",
      color: "#8b5cf6",
    },
  ];

  const [soByMonth, soByStatus, tasksByStatus, deadlineSituation] =
    await Promise.all([
      queryAll(
        `SELECT to_char(created_at, 'MM/YY') AS lbl, COUNT(*)::int AS val FROM service_orders ${B} AND created_at >= NOW() - INTERVAL '6 months' GROUP BY lbl ORDER BY MIN(created_at)`,
      ),
      queryAll(
        `SELECT COALESCE(NULLIF(process_status,''), 'N/I') AS lbl, COUNT(*)::int AS val FROM service_orders ${B} GROUP BY lbl ORDER BY val DESC LIMIT 10`,
      ),
      queryAll(
        `SELECT COALESCE(NULLIF(status,''), 'sem status') AS lbl, COUNT(*)::int AS val FROM tasks ${B} GROUP BY lbl ORDER BY val DESC LIMIT 8`,
      ),
      queryAll(
        `SELECT CASE WHEN status = 'completed' THEN 'Concluído' WHEN due_date < NOW() THEN 'Vencido' WHEN due_date < NOW() + INTERVAL '3 days' THEN 'Vencendo' ELSE 'No prazo' END AS lbl, COUNT(*)::int AS val FROM process_deadlines ${B} GROUP BY lbl ORDER BY val DESC`,
      ),
    ]);

  const charts: BiChart[] = [
    {
      key: "so_by_month",
      label: "Ordens de Serviço por Mês",
      type: "bar",
      data: toChart(soByMonth),
    },
    {
      key: "so_by_status",
      label: "Processos por Status",
      type: "horizontal",
      data: toChart(soByStatus),
    },
    {
      key: "tasks_by_status",
      label: "Tarefas por Status",
      type: "horizontal",
      data: toChart(tasksByStatus),
    },
    {
      key: "deadline_situation",
      label: "Situação dos Prazos",
      type: "horizontal",
      data: toChart(deadlineSituation),
    },
  ];

  const recentSOs = await queryTable(
    `SELECT title AS "Título", COALESCE(process_status, '-') AS "Status", to_char(started_at, 'DD/MM/YY') AS "Início", to_char(created_at, 'DD/MM/YY') AS "Criação" FROM service_orders ${B} ORDER BY created_at DESC LIMIT 10`,
  );

  return {
    kpis,
    charts,
    tables: [
      { key: "recent_sos", label: "Últimas Ordens de Serviço", ...recentSOs },
    ],
  };
}

/* ================================================================== */
/*  Module: CRM (Leads)                                                */
/* ================================================================== */

async function loadModuleCRM(tenantId: string): Promise<BiModuleData> {
  const tid = esc(tenantId);
  const B = `WHERE tenant_id = '${tid}' AND deleted_at IS NULL`;

  const [totalRow, newRow, convertedRow, lostRow, valueRow, avgConvRow] =
    await Promise.all([
      queryOne(`SELECT COUNT(*)::int FROM leads ${B}`),
      queryOne(`SELECT COUNT(*)::int FROM leads ${B} AND status = 'novo'`),
      queryOne(
        `SELECT COUNT(*)::int FROM leads ${B} AND status = 'convertido'`,
      ),
      queryOne(`SELECT COUNT(*)::int FROM leads ${B} AND status = 'perdido'`),
      queryOne(
        `SELECT COALESCE(SUM(estimated_value),0)::numeric FROM leads ${B} AND status NOT IN ('perdido','convertido')`,
      ),
      queryOne(
        `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (converted_at - created_at)) / 86400), 0)::numeric FROM leads ${B} AND converted_at IS NOT NULL`,
      ),
    ]);

  const total = Number(totalRow[0] ?? 0);
  const converted = Number(convertedRow[0] ?? 0);
  const convRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  const kpis: BiKpi[] = [
    {
      key: "total",
      label: "Total Leads",
      value: total,
      icon: "megaphone-outline",
      color: "#3b82f6",
    },
    {
      key: "new",
      label: "Novos",
      value: Number(newRow[0] ?? 0),
      icon: "sparkles-outline",
      color: "#0ea5e9",
    },
    {
      key: "converted",
      label: "Convertidos",
      value: converted,
      icon: "checkmark-done-outline",
      color: "#10b981",
    },
    {
      key: "lost",
      label: "Perdidos",
      value: Number(lostRow[0] ?? 0),
      icon: "close-circle-outline",
      color: "#ef4444",
    },
    {
      key: "pipeline_value",
      label: "Pipeline (R$)",
      value: fmtBrl(Number(valueRow[0] ?? 0)),
      icon: "trending-up-outline",
      color: "#8b5cf6",
    },
    {
      key: "conv_rate",
      label: "Taxa de Conversão",
      value: `${convRate}%`,
      icon: "analytics-outline",
      color: "#059669",
    },
    {
      key: "avg_days",
      label: "Tempo Médio Conversão",
      value: `${Math.round(Number(avgConvRow[0] ?? 0))}d`,
      icon: "hourglass-outline",
      color: "#f59e0b",
    },
  ];

  const [byStatus, bySource, byMonth] = await Promise.all([
    queryAll(
      `SELECT status AS lbl, COUNT(*)::int AS val FROM leads ${B} GROUP BY lbl ORDER BY val DESC`,
    ),
    queryAll(
      `SELECT COALESCE(NULLIF(source,''), 'N/I') AS lbl, COUNT(*)::int AS val FROM leads ${B} GROUP BY lbl ORDER BY val DESC LIMIT 8`,
    ),
    queryAll(
      `SELECT to_char(created_at, 'MM/YY') AS lbl, COUNT(*)::int AS val FROM leads ${B} AND created_at >= NOW() - INTERVAL '6 months' GROUP BY lbl ORDER BY MIN(created_at)`,
    ),
  ]);

  const charts: BiChart[] = [
    {
      key: "by_status",
      label: "Leads por Status",
      type: "horizontal",
      data: toChart(byStatus),
    },
    {
      key: "by_source",
      label: "Leads por Fonte",
      type: "horizontal",
      data: toChart(bySource),
    },
    {
      key: "by_month",
      label: "Novos Leads por Mês",
      type: "bar",
      data: toChart(byMonth),
    },
  ];

  return { kpis, charts, tables: [] };
}

/* ================================================================== */
/*  Module: Estoque (Stock)                                            */
/* ================================================================== */

async function loadModuleEstoque(tenantId: string): Promise<BiModuleData> {
  const tid = esc(tenantId);
  const B = `WHERE tenant_id = '${tid}' AND deleted_at IS NULL`;

  const [totalRow, lowStockRow, zeroStockRow, movRow] = await Promise.all([
    queryOne(
      `SELECT COUNT(*)::int FROM services ${B} AND is_active = true AND track_stock = true`,
    ),
    queryOne(
      `SELECT COUNT(*)::int FROM services ${B} AND is_active = true AND track_stock = true AND stock_quantity > 0 AND stock_quantity <= COALESCE(min_stock, 5)`,
    ),
    queryOne(
      `SELECT COUNT(*)::int FROM services ${B} AND is_active = true AND track_stock = true AND COALESCE(stock_quantity, 0) <= 0`,
    ),
    queryOne(
      `SELECT COUNT(*)::int FROM stock_movements WHERE tenant_id = '${tid}' AND created_at >= NOW() - INTERVAL '30 days'`,
    ),
  ]);

  const kpis: BiKpi[] = [
    {
      key: "tracked",
      label: "Produtos Rastreados",
      value: Number(totalRow[0] ?? 0),
      icon: "cube-outline",
      color: "#3b82f6",
    },
    {
      key: "low_stock",
      label: "Estoque Baixo",
      value: Number(lowStockRow[0] ?? 0),
      icon: "alert-outline",
      color: "#f59e0b",
    },
    {
      key: "zero_stock",
      label: "Sem Estoque",
      value: Number(zeroStockRow[0] ?? 0),
      icon: "close-circle-outline",
      color: "#ef4444",
    },
    {
      key: "movements_30d",
      label: "Movimentações (30d)",
      value: Number(movRow[0] ?? 0),
      icon: "swap-vertical-outline",
      color: "#8b5cf6",
    },
  ];

  const [byType, lowItems] = await Promise.all([
    queryAll(
      `SELECT movement_type AS lbl, COUNT(*)::int AS val FROM stock_movements WHERE tenant_id = '${tid}' AND created_at >= NOW() - INTERVAL '30 days' GROUP BY lbl ORDER BY val DESC`,
    ),
    queryAll(
      `SELECT name AS lbl, COALESCE(stock_quantity, 0)::int AS val FROM services ${B} AND is_active = true AND track_stock = true AND COALESCE(stock_quantity, 0) <= COALESCE(min_stock, 5) ORDER BY stock_quantity ASC LIMIT 10`,
    ),
  ]);

  const charts: BiChart[] = [
    {
      key: "movements_by_type",
      label: "Movimentações por Tipo (30 dias)",
      type: "horizontal",
      data: toChart(byType),
    },
    {
      key: "low_stock_items",
      label: "Produtos com Estoque Baixo",
      type: "horizontal",
      data: toChart(lowItems),
    },
  ];

  return { kpis, charts, tables: [] };
}

/* ================================================================== */
/*  Module: Compras (Purchases)                                        */
/* ================================================================== */

async function loadModuleCompras(tenantId: string): Promise<BiModuleData> {
  const tid = esc(tenantId);
  const B = `WHERE tenant_id = '${tid}' AND deleted_at IS NULL`;

  const [totalRow, totalValueRow, pendingRow, receivedRow, suppliersRow] =
    await Promise.all([
      queryOne(`SELECT COUNT(*)::int FROM purchase_orders ${B}`),
      queryOne(
        `SELECT COALESCE(SUM(total),0)::numeric FROM purchase_orders ${B}`,
      ),
      queryOne(
        `SELECT COUNT(*)::int FROM purchase_orders ${B} AND status IN ('draft','ordered','partial_received')`,
      ),
      queryOne(
        `SELECT COUNT(*)::int FROM purchase_orders ${B} AND status = 'received'`,
      ),
      queryOne(`SELECT COUNT(*)::int FROM suppliers ${B} AND is_active = true`),
    ]);

  const kpis: BiKpi[] = [
    {
      key: "total",
      label: "Total Pedidos",
      value: Number(totalRow[0] ?? 0),
      icon: "bag-handle-outline",
      color: "#3b82f6",
    },
    {
      key: "total_value",
      label: "Valor Total",
      value: fmtBrl(Number(totalValueRow[0] ?? 0)),
      icon: "cash-outline",
      color: "#8b5cf6",
    },
    {
      key: "pending",
      label: "Pendentes",
      value: Number(pendingRow[0] ?? 0),
      icon: "time-outline",
      color: "#f59e0b",
    },
    {
      key: "received",
      label: "Recebidos",
      value: Number(receivedRow[0] ?? 0),
      icon: "checkmark-circle-outline",
      color: "#10b981",
    },
    {
      key: "suppliers",
      label: "Fornecedores",
      value: Number(suppliersRow[0] ?? 0),
      icon: "business-outline",
      color: "#6366f1",
    },
  ];

  const [byMonth, byPayment, topSuppliers] = await Promise.all([
    queryAll(
      `SELECT to_char(created_at, 'MM/YY') AS lbl, COALESCE(SUM(total),0)::numeric AS val FROM purchase_orders ${B} AND created_at >= NOW() - INTERVAL '6 months' GROUP BY lbl ORDER BY MIN(created_at)`,
    ),
    queryAll(
      `SELECT COALESCE(NULLIF(payment_method,''), 'N/I') AS lbl, COUNT(*)::int AS val FROM purchase_orders ${B} GROUP BY lbl ORDER BY val DESC LIMIT 8`,
    ),
    queryAll(
      `SELECT COALESCE(NULLIF(supplier_name,''), 'N/I') AS lbl, COALESCE(SUM(total),0)::numeric AS val FROM purchase_orders ${B} GROUP BY lbl ORDER BY val DESC LIMIT 10`,
    ),
  ]);

  const charts: BiChart[] = [
    {
      key: "by_month",
      label: "Compras por Mês",
      type: "bar",
      data: toChart(byMonth),
    },
    {
      key: "by_payment",
      label: "Por Forma de Pagamento",
      type: "horizontal",
      data: toChart(byPayment),
    },
    {
      key: "top_suppliers",
      label: "Top 10 Fornecedores",
      type: "horizontal",
      data: toChart(topSuppliers),
    },
  ];

  const recentPOs = await queryTable(
    `SELECT COALESCE(supplier_name, '-') AS "Fornecedor", total::numeric AS "Total", status AS "Status", to_char(created_at, 'DD/MM/YY') AS "Data" FROM purchase_orders ${B} ORDER BY created_at DESC LIMIT 10`,
  );

  return {
    kpis,
    charts,
    tables: [{ key: "recent_pos", label: "Últimas Compras", ...recentPOs }],
  };
}

/* ================================================================== */
/*  Module dispatcher                                                  */
/* ================================================================== */

export async function loadBiModule(
  moduleKey: BiModuleKey,
  tenantId: string,
): Promise<BiModuleData> {
  switch (moduleKey) {
    case "geral":
      return loadModuleGeral(tenantId);
    case "vendas":
      return loadModuleVendas(tenantId);
    case "financeiro":
      return loadModuleFinanceiro(tenantId);
    case "processos":
      return loadModuleProcessos(tenantId);
    case "crm":
      return loadModuleCRM(tenantId);
    case "estoque":
      return loadModuleEstoque(tenantId);
    case "compras":
      return loadModuleCompras(tenantId);
    default:
      return { kpis: [], charts: [], tables: [] };
  }
}

export { isMetabaseAvailable };
