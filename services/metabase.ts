/**
 * Metabase BI Service
 *
 * Self-hosted Business Intelligence & Reporting.
 * Provides dashboard embedding, question results, and collection browsing.
 *
 * Docs: https://www.metabase.com/docs/latest/api-documentation
 *
 * This service provides:
 * - Dashboard listing & embedding
 * - Question (saved query) execution
 * - Collection browsing
 * - Database metadata
 */

import Constants from "expo-constants";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const extra =
  Constants.expoConfig?.extra ??
  (Constants.manifest as any)?.extra ??
  (Constants.manifest2 as any)?.extra?.expoClient?.extra ??
  (Constants.manifest2 as any)?.extra ??
  {};

const METABASE_CONFIG = {
  /**
   * Metabase instance URL.
   */
  instanceUrl:
    (extra.metabaseUrl as string | undefined) ??
    process.env.EXPO_PUBLIC_METABASE_URL ??
    "https://bi.sosescritura.com.br",

  /**
   * API key for Metabase REST API.
   * Generate in: Admin → Settings → Authentication → API Keys
   */
  apiKey:
    (extra.metabaseApiKey as string | undefined) ??
    process.env.EXPO_PUBLIC_METABASE_API_KEY ??
    "",
} as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getMetabaseConfig() {
  return { ...METABASE_CONFIG };
}

function isMetabaseAvailable(): boolean {
  return !!(METABASE_CONFIG.instanceUrl && METABASE_CONFIG.apiKey);
}

async function metabaseFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${METABASE_CONFIG.instanceUrl}/api${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": METABASE_CONFIG.apiKey,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Metabase API ${res.status}: ${text}`);
  }

  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Collections                                                        */
/* ------------------------------------------------------------------ */

export interface MetabaseCollection {
  id: number;
  name: string;
  description?: string;
  slug?: string;
  color?: string;
  personal_owner_id?: number | null;
}

/** List all collections */
async function getCollections(): Promise<MetabaseCollection[]> {
  return metabaseFetch<MetabaseCollection[]>("/collection");
}

/** Get items in a collection */
async function getCollectionItems(
  collectionId: number | "root",
): Promise<{ data: any[] }> {
  return metabaseFetch(`/collection/${collectionId}/items`);
}

/* ------------------------------------------------------------------ */
/*  Dashboards                                                         */
/* ------------------------------------------------------------------ */

export interface MetabaseDashboard {
  id: number;
  name: string;
  description?: string;
  collection_id?: number | null;
  creator?: { common_name: string };
  created_at: string;
  updated_at: string;
}

/** List all dashboards */
async function getDashboards(): Promise<MetabaseDashboard[]> {
  return metabaseFetch<MetabaseDashboard[]>("/dashboard");
}

/** Get dashboard details (with cards) */
async function getDashboard(id: number): Promise<any> {
  return metabaseFetch(`/dashboard/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Questions (Saved queries / Cards)                                   */
/* ------------------------------------------------------------------ */

export interface MetabaseCard {
  id: number;
  name: string;
  description?: string;
  display: string; // "table", "bar", "line", "pie", "scalar", etc.
  collection_id?: number | null;
  database_id: number;
  created_at: string;
}

/** List saved questions / cards */
async function getCards(): Promise<MetabaseCard[]> {
  return metabaseFetch<MetabaseCard[]>("/card");
}

/** Execute a saved question and return results */
async function getCardResults(
  cardId: number,
  parameters?: Record<string, any>[],
): Promise<{
  data: {
    rows: any[][];
    cols: { name: string; display_name: string; base_type: string }[];
  };
}> {
  return metabaseFetch(`/card/${cardId}/query`, {
    method: "POST",
    body: JSON.stringify({ parameters: parameters ?? [] }),
  });
}

/* ------------------------------------------------------------------ */
/*  Database info                                                       */
/* ------------------------------------------------------------------ */

export interface MetabaseDatabase {
  id: number;
  name: string;
  engine: string;
  tables?: { id: number; name: string; schema: string }[];
}

/** List connected databases */
async function getDatabases(): Promise<MetabaseDatabase[]> {
  const res = await metabaseFetch<{ data: MetabaseDatabase[] }>("/database");
  return res.data ?? (res as any);
}

/* ------------------------------------------------------------------ */
/*  Embed URL (for WebView)                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a public embed URL for a dashboard.
 * Requires: Metabase Admin → Settings → Embedding → Enable public sharing
 */
function getDashboardEmbedUrl(publicUuid: string): string {
  return `${METABASE_CONFIG.instanceUrl}/public/dashboard/${publicUuid}`;
}

/**
 * Build a public embed URL for a question.
 */
function getQuestionEmbedUrl(publicUuid: string): string {
  return `${METABASE_CONFIG.instanceUrl}/public/question/${publicUuid}`;
}

/* ------------------------------------------------------------------ */
/*  Public sharing helpers                                             */
/* ------------------------------------------------------------------ */

export interface CardPublicInfo {
  cardId: number;
  name: string;
  display: string;
  publicUuid: string | null;
  embedUrl: string | null;
}

/**
 * Ensure a card has public sharing enabled. If it already has a public_uuid,
 * return it. Otherwise create a public link via the Metabase API.
 *
 * Requires: Metabase Admin → Settings → Public Sharing → Enable
 */
async function ensureCardPublicLink(cardId: number): Promise<string | null> {
  try {
    // Check if card already has a public link
    const cardDetail = await metabaseFetch<any>(`/card/${cardId}`);
    if (cardDetail.public_uuid) {
      return cardDetail.public_uuid;
    }
    // Create a public link
    const res = await metabaseFetch<{ uuid: string }>(
      `/card/${cardId}/public_link`,
      { method: "POST" },
    );
    return res.uuid ?? null;
  } catch {
    return null;
  }
}

/**
 * Get card info with public embed URL for interactive WebView embedding.
 * Automatically creates public links if needed.
 */
async function getCardPublicInfo(
  cardId: number,
  tenantId?: string,
): Promise<CardPublicInfo> {
  try {
    const cardDetail = await metabaseFetch<any>(`/card/${cardId}`);
    const publicUuid =
      cardDetail.public_uuid ?? (await ensureCardPublicLink(cardId));

    let embedUrl: string | null = null;
    if (publicUuid) {
      const base = `${METABASE_CONFIG.instanceUrl}/public/question/${publicUuid}`;
      const params = new URLSearchParams();
      if (tenantId) params.set("tenant_id", tenantId);
      const qs = params.toString();
      embedUrl = qs ? `${base}?${qs}#titled=true` : `${base}#titled=true`;
    }

    return {
      cardId,
      name: cardDetail.name ?? `Card #${cardId}`,
      display: cardDetail.display ?? "table",
      publicUuid,
      embedUrl,
    };
  } catch {
    return {
      cardId,
      name: `Card #${cardId}`,
      display: "table",
      publicUuid: null,
      embedUrl: null,
    };
  }
}

/**
 * Batch: get public embed info for multiple cards.
 */
async function getCardsPublicInfo(
  cardIds: number[],
  tenantId?: string,
): Promise<CardPublicInfo[]> {
  const results: CardPublicInfo[] = [];
  // Process in batches of 3 to avoid rate limits
  for (let i = 0; i < cardIds.length; i += 3) {
    const batch = cardIds.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map((id) => getCardPublicInfo(id, tenantId)),
    );
    results.push(...batchResults);
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Dashboard public embedding                                         */
/* ------------------------------------------------------------------ */

const SOS_DASHBOARD_NAME = "SOS Escritura — Painel Completo";

/**
 * Ensure a dashboard has public sharing enabled.
 */
async function ensureDashboardPublicLink(
  dashboardId: number,
): Promise<string | null> {
  try {
    const detail = await metabaseFetch<any>(`/dashboard/${dashboardId}`);
    if (detail.public_uuid) return detail.public_uuid;
    const res = await metabaseFetch<{ uuid: string }>(
      `/dashboard/${dashboardId}/public_link`,
      { method: "POST" },
    );
    return res.uuid ?? null;
  } catch {
    return null;
  }
}

/**
 * Find the SOS dashboard and return its public embed URL.
 * tenant_id is locked via URL param; Estado / Cidade / Status
 * filters remain interactive on the embedded dashboard.
 */
async function getDashboardPublicUrl(tenantId?: string): Promise<{
  dashboardId: number | null;
  publicUuid: string | null;
  embedUrl: string | null;
}> {
  try {
    const dashboards = await getDashboards();
    const sosDash = dashboards.find((d) => d.name === SOS_DASHBOARD_NAME);
    if (!sosDash)
      return { dashboardId: null, publicUuid: null, embedUrl: null };

    const publicUuid = await ensureDashboardPublicLink(sosDash.id);
    if (!publicUuid)
      return { dashboardId: sosDash.id, publicUuid: null, embedUrl: null };

    const base = `${METABASE_CONFIG.instanceUrl}/public/dashboard/${publicUuid}`;
    const params = new URLSearchParams();
    if (tenantId) params.set("tenant_id", tenantId);
    const qs = params.toString();
    const embedUrl = qs
      ? `${base}?${qs}#bordered=false&titled=true`
      : `${base}#bordered=false&titled=true`;

    return { dashboardId: sosDash.id, publicUuid, embedUrl };
  } catch {
    return { dashboardId: null, publicUuid: null, embedUrl: null };
  }
}

/* ------------------------------------------------------------------ */
/*  Tenant KPI queries                                                 */
/* ------------------------------------------------------------------ */

export interface TenantKpi {
  key: string;
  label: string;
  value: number | string;
  icon: string;
  color?: string;
}

export interface TenantKpiSet {
  tenantName: string;
  kpis: TenantKpi[];
  charts: {
    key: string;
    label: string;
    data: { label: string; value: number }[];
  }[];
  tables: {
    key: string;
    label: string;
    columns: string[];
    rows: string[][];
  }[];
}

export interface InlineCardResult {
  cardId: number;
  name: string;
  display: string;
  columns: string[];
  rows: any[][];
  error?: string;
}

/**
 * Fetch tenant-specific KPIs using native SQL against the PostgreSQL DB.
 * Requires the PostgreSQL database id from Metabase.
 */
async function getTenantKpis(
  databaseId: number,
  tenantId: string,
): Promise<TenantKpiSet> {
  // Helper: run a single SQL, return the first row
  const queryOne = async (sql: string): Promise<any[]> => {
    try {
      const result = await executeNativeQuery(databaseId, sql);
      return result?.data?.rows?.[0] ?? [];
    } catch {
      return [];
    }
  };

  const queryAll = async (sql: string): Promise<any[][]> => {
    try {
      const result = await executeNativeQuery(databaseId, sql);
      return result?.data?.rows ?? [];
    } catch {
      return [];
    }
  };

  const queryTable = async (
    sql: string,
  ): Promise<{ columns: string[]; rows: string[][] }> => {
    try {
      const result = await executeNativeQuery(databaseId, sql);
      const cols = (result?.data?.cols ?? []).map(
        (c: any) => c.display_name || c.name,
      );
      const rows = (result?.data?.rows ?? []).map((r: any[]) =>
        r.map((v) => String(v ?? "-")),
      );
      return { columns: cols, rows };
    } catch {
      return { columns: [], rows: [] };
    }
  };

  const tid = tenantId.replace(/'/g, "''"); // SQL-safe

  // ── KPIs ──────────────────────────────────────────────────────────────
  const [
    propRow,
    custRow,
    soRow,
    taskPendingRow,
    overdueRow,
    apptRow,
    docRow,
    userRow,
    partnerRow,
    tenantRow,
  ] = await Promise.all([
    queryOne(
      `SELECT COUNT(*)::int AS v FROM properties WHERE tenant_id = '${tid}' AND deleted_at IS NULL`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS v FROM customers WHERE tenant_id = '${tid}' AND deleted_at IS NULL`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS v FROM service_orders WHERE tenant_id = '${tid}' AND deleted_at IS NULL`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS v FROM tasks WHERE tenant_id = '${tid}' AND deleted_at IS NULL AND COALESCE(status,'') NOT IN ('completed','done','finished')`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS v FROM process_deadlines WHERE tenant_id = '${tid}' AND deleted_at IS NULL AND status != 'completed' AND due_date < NOW()`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS v FROM service_appointments WHERE tenant_id = '${tid}' AND deleted_at IS NULL`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS v FROM generated_documents WHERE tenant_id = '${tid}' AND deleted_at IS NULL`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS v FROM user_tenants WHERE tenant_id = '${tid}' AND is_active = true`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS v FROM partners WHERE tenant_id = '${tid}' AND deleted_at IS NULL AND is_active = true`,
    ),
    queryOne(`SELECT company_name FROM tenants WHERE id = '${tid}' LIMIT 1`),
  ]);

  const tenantName = String(tenantRow?.[0] ?? "Tenant");

  const kpis: TenantKpi[] = [
    {
      key: "properties",
      label: "Imóveis",
      value: Number(propRow?.[0] ?? 0),
      icon: "home-outline",
      color: "#0a7ea4",
    },
    {
      key: "customers",
      label: "Clientes",
      value: Number(custRow?.[0] ?? 0),
      icon: "people-outline",
      color: "#8b5cf6",
    },
    {
      key: "service_orders",
      label: "Ordens de Serviço",
      value: Number(soRow?.[0] ?? 0),
      icon: "document-text-outline",
      color: "#f59e0b",
    },
    {
      key: "pending_tasks",
      label: "Tarefas Pendentes",
      value: Number(taskPendingRow?.[0] ?? 0),
      icon: "time-outline",
      color: "#3b82f6",
    },
    {
      key: "overdue_deadlines",
      label: "Prazos Vencidos",
      value: Number(overdueRow?.[0] ?? 0),
      icon: "alert-circle-outline",
      color: "#ef4444",
    },
    {
      key: "appointments",
      label: "Agendamentos",
      value: Number(apptRow?.[0] ?? 0),
      icon: "calendar-outline",
      color: "#10b981",
    },
    {
      key: "documents",
      label: "Documentos",
      value: Number(docRow?.[0] ?? 0),
      icon: "document-outline",
      color: "#6366f1",
    },
    {
      key: "users",
      label: "Usuários",
      value: Number(userRow?.[0] ?? 0),
      icon: "person-outline",
      color: "#ec4899",
    },
    {
      key: "partners",
      label: "Parceiros",
      value: Number(partnerRow?.[0] ?? 0),
      icon: "people-circle-outline",
      color: "#14b8a6",
    },
  ];

  // ── Charts ────────────────────────────────────────────────────────────
  const [
    propByState,
    propByStatus,
    soByMonth,
    taskByStatus,
    deadlineSituation,
    ownerKind,
    propByMonth,
    custByMonth,
  ] = await Promise.all([
    queryAll(
      `SELECT COALESCE(NULLIF(state,''), 'N/I') AS lbl, COUNT(*)::int AS val FROM properties WHERE tenant_id = '${tid}' AND deleted_at IS NULL GROUP BY lbl ORDER BY val DESC LIMIT 10`,
    ),
    queryAll(
      `SELECT COALESCE(NULLIF(process_status,''), 'N/I') AS lbl, COUNT(*)::int AS val FROM properties WHERE tenant_id = '${tid}' AND deleted_at IS NULL GROUP BY lbl ORDER BY val DESC`,
    ),
    queryAll(
      `SELECT to_char(created_at, 'MM/YY') AS lbl, COUNT(*)::int AS val FROM service_orders WHERE tenant_id = '${tid}' AND deleted_at IS NULL AND created_at >= NOW() - INTERVAL '6 months' GROUP BY lbl ORDER BY MIN(created_at)`,
    ),
    queryAll(
      `SELECT COALESCE(NULLIF(status,''), 'sem status') AS lbl, COUNT(*)::int AS val FROM tasks WHERE tenant_id = '${tid}' AND deleted_at IS NULL GROUP BY lbl ORDER BY val DESC LIMIT 10`,
    ),
    queryAll(
      `SELECT CASE WHEN status = 'completed' THEN 'Concluído' WHEN due_date < NOW() THEN 'Vencido' WHEN due_date < NOW() + INTERVAL '3 days' THEN 'Vencendo' ELSE 'No prazo' END AS lbl, COUNT(*)::int AS val FROM process_deadlines WHERE tenant_id = '${tid}' AND deleted_at IS NULL GROUP BY lbl ORDER BY val DESC`,
    ),
    queryAll(
      `SELECT CASE owner_kind WHEN 'pf' THEN 'PF' WHEN 'pj' THEN 'PJ' ELSE 'N/I' END AS lbl, COUNT(*)::int AS val FROM properties WHERE tenant_id = '${tid}' AND deleted_at IS NULL GROUP BY lbl ORDER BY val DESC`,
    ),
    queryAll(
      `SELECT to_char(created_at, 'MM/YY') AS lbl, COUNT(*)::int AS val FROM properties WHERE tenant_id = '${tid}' AND deleted_at IS NULL AND created_at >= NOW() - INTERVAL '6 months' GROUP BY lbl ORDER BY MIN(created_at)`,
    ),
    queryAll(
      `SELECT to_char(created_at, 'MM/YY') AS lbl, COUNT(*)::int AS val FROM customers WHERE tenant_id = '${tid}' AND deleted_at IS NULL AND created_at >= NOW() - INTERVAL '6 months' GROUP BY lbl ORDER BY MIN(created_at)`,
    ),
  ]);

  const toChartData = (rows: any[][]) =>
    rows.map((r) => ({ label: String(r[0] ?? ""), value: Number(r[1] ?? 0) }));

  const charts = [
    {
      key: "prop_by_state",
      label: "Imóveis por Estado",
      data: toChartData(propByState),
    },
    {
      key: "prop_by_status",
      label: "Imóveis por Status do Processo",
      data: toChartData(propByStatus),
    },
    {
      key: "so_by_month",
      label: "Ordens de Serviço — Últimos 6 meses",
      data: toChartData(soByMonth),
    },
    {
      key: "tasks_by_status",
      label: "Tarefas por Status",
      data: toChartData(taskByStatus),
    },
    {
      key: "deadline_situation",
      label: "Situação dos Prazos",
      data: toChartData(deadlineSituation),
    },
    {
      key: "owner_kind",
      label: "Tipo de Proprietário",
      data: toChartData(ownerKind),
    },
    {
      key: "prop_by_month",
      label: "Novos Imóveis — Últimos 6 meses",
      data: toChartData(propByMonth),
    },
    {
      key: "cust_by_month",
      label: "Novos Clientes — Últimos 6 meses",
      data: toChartData(custByMonth),
    },
  ];

  // ── Tables ────────────────────────────────────────────────────────────
  const [recentProps, recentSOs] = await Promise.all([
    queryTable(
      `SELECT address AS "Endereço", city AS "Cidade", state AS "UF", COALESCE(process_status, '-') AS "Status", to_char(created_at, 'DD/MM/YY') AS "Data" FROM properties WHERE tenant_id = '${tid}' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10`,
    ),
    queryTable(
      `SELECT title AS "Título", COALESCE(process_status, '-') AS "Status", to_char(started_at, 'DD/MM/YY') AS "Início", to_char(created_at, 'DD/MM/YY') AS "Criação" FROM service_orders WHERE tenant_id = '${tid}' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10`,
    ),
  ]);

  const tables = [
    {
      key: "recent_properties",
      label: "Últimos Imóveis Cadastrados",
      ...recentProps,
    },
    { key: "recent_sos", label: "Últimas Ordens de Serviço", ...recentSOs },
  ];

  return { tenantName, kpis, charts, tables };
}

/**
 * Find the PostgreSQL database id in Metabase (ignoring Sample Database).
 */
async function getPostgresDatabaseId(): Promise<number | null> {
  try {
    const dbs = await getDatabases();
    const pg = dbs.find((d) => d.engine === "postgres");
    return pg?.id ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Native query (ad-hoc)                                              */
/* ------------------------------------------------------------------ */

/**
 * Execute a native SQL query against a specific database.
 * Use with caution — prefer saved questions (cards).
 */
async function executeNativeQuery(
  databaseId: number,
  sql: string,
  params?: any[],
): Promise<{
  data: {
    rows: any[][];
    cols: { name: string; display_name: string; base_type: string }[];
  };
}> {
  return metabaseFetch("/dataset", {
    method: "POST",
    body: JSON.stringify({
      database: databaseId,
      type: "native",
      native: {
        query: sql,
        "template-tags": {},
      },
      parameters: params ?? [],
    }),
  });
}

/* ------------------------------------------------------------------ */
/*  Inline card results (for embedding)                                */
/* ------------------------------------------------------------------ */

/**
 * Fetch a saved question's results for inline rendering.
 * If the question has a {{tenant_id}} template-tag, the given tenantId is passed.
 */
async function getCardResultsForTenant(
  cardId: number,
  tenantId?: string,
): Promise<InlineCardResult> {
  try {
    // Fetch full card details to inspect template-tags
    const cardDetail = await metabaseFetch<any>(`/card/${cardId}`);
    const cardName = cardDetail.name ?? `Card #${cardId}`;
    const cardDisplay = cardDetail.display ?? "table";

    // Only pass tenant_id parameter if the card's query defines the template-tag
    const templateTags =
      cardDetail.dataset_query?.native?.["template-tags"] ?? {};
    const hasTenantTag = !!templateTags["tenant_id"];

    const params =
      tenantId && hasTenantTag
        ? [
            {
              type: "category",
              target: ["variable", ["template-tag", "tenant_id"]],
              value: tenantId,
            },
          ]
        : [];

    const result = await metabaseFetch<any>(`/card/${cardId}/query`, {
      method: "POST",
      body: JSON.stringify({ parameters: params }),
    });

    const columns = (result?.data?.cols ?? []).map(
      (c: any) => c.display_name || c.name,
    );
    const rows = result?.data?.rows ?? [];

    return { cardId, name: cardName, display: cardDisplay, columns, rows };
  } catch (e: any) {
    return {
      cardId,
      name: `Card #${cardId}`,
      display: "error",
      columns: [],
      rows: [],
      error: e.message,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Exports                                                             */
/* ------------------------------------------------------------------ */

export {
    // Ad-hoc queries
    executeNativeQuery,
    getCardResults,
    // Inline card rendering
    getCardResultsForTenant,
    // Questions / Cards
    getCards,
    // Public embed (cards)
    getCardsPublicInfo,
    getCollectionItems,
    // Collections
    getCollections,
    getDashboard,
    getDashboardEmbedUrl,
    // Dashboard public URL
    getDashboardPublicUrl,
    // Dashboards
    getDashboards,
    // Database
    getDatabases,
    getMetabaseConfig,
    // Postgres DB helper
    getPostgresDatabaseId,
    getQuestionEmbedUrl,
    // Tenant KPIs
    getTenantKpis,
    isMetabaseAvailable
};

