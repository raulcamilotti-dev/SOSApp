/**
 * SaaS Dashboard Service
 * Cross-tenant metrics for platform operators (super-admin).
 * Uses api_dinamico for aggregate SQL queries across tenants.
 */
import { api } from "@/services/api";
import { API_DINAMICO, normalizeCrudList } from "@/services/crud";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenantOverview {
  id: string;
  company_name: string;
  plan: string | null;
  status: string | null;
  specialty: string | null;
  created_at: string;
  user_count: string;
  module_count: string;
  service_order_count: string;
  lead_count: string;
  last_activity: string | null;
}

export interface SaaSKPIs {
  total_tenants: number;
  active_tenants: number;
  total_users: number;
  total_service_orders: number;
  total_leads: number;
  total_modules_active: number;
}

export interface ModulePopularity {
  module_key: string;
  tenant_count: string;
}

export interface TenantGrowth {
  month: string;
  new_tenants: string;
}

export interface UserGrowth {
  month: string;
  new_users: string;
}

export interface RecentTenant {
  id: string;
  company_name: string;
  plan: string | null;
  status: string | null;
  specialty: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API Calls
// ---------------------------------------------------------------------------

/**
 * Fetch high-level SaaS KPIs (single query with subselects).
 */
export async function fetchSaaSKPIs(): Promise<SaaSKPIs> {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL) AS total_tenants,
      (SELECT COUNT(DISTINCT t.id) FROM tenants t
        INNER JOIN user_tenants ut ON ut.tenant_id = t.id
        WHERE t.deleted_at IS NULL) AS active_tenants,
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS total_users,
      (SELECT COUNT(*) FROM service_orders WHERE deleted_at IS NULL) AS total_service_orders,
      (SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL) AS total_leads,
      (SELECT COUNT(*) FROM tenant_modules WHERE enabled = true) AS total_modules_active
  `;
  const res = await api.post(API_DINAMICO, { sql });
  const rows = normalizeCrudList<any>(res.data);
  const r = rows[0] || {};
  return {
    total_tenants: Number(r.total_tenants) || 0,
    active_tenants: Number(r.active_tenants) || 0,
    total_users: Number(r.total_users) || 0,
    total_service_orders: Number(r.total_service_orders) || 0,
    total_leads: Number(r.total_leads) || 0,
    total_modules_active: Number(r.total_modules_active) || 0,
  };
}

/**
 * Fetch per-tenant breakdown with activity counts.
 */
export async function fetchTenantOverview(): Promise<TenantOverview[]> {
  const sql = `
    SELECT
      t.id,
      t.company_name,
      t.plan,
      t.status,
      t.config->>'specialty' AS specialty,
      t.created_at,
      COALESCE(u.user_count, 0) AS user_count,
      COALESCE(m.module_count, 0) AS module_count,
      COALESCE(so.so_count, 0) AS service_order_count,
      COALESCE(l.lead_count, 0) AS lead_count,
      GREATEST(
        COALESCE(u.last_user, t.created_at::timestamptz),
        COALESCE(so.last_so, t.created_at::timestamptz),
        COALESCE(l.last_lead, t.created_at::timestamptz)
      ) AS last_activity
    FROM tenants t
    LEFT JOIN (
      SELECT tenant_id, COUNT(*) AS user_count, MAX(created_at) AS last_user
      FROM user_tenants GROUP BY tenant_id
    ) u ON u.tenant_id = t.id
    LEFT JOIN (
      SELECT tenant_id, COUNT(*) AS module_count
      FROM tenant_modules WHERE enabled = true GROUP BY tenant_id
    ) m ON m.tenant_id = t.id
    LEFT JOIN (
      SELECT tenant_id, COUNT(*) AS so_count, MAX(created_at) AS last_so
      FROM service_orders WHERE deleted_at IS NULL GROUP BY tenant_id
    ) so ON so.tenant_id = t.id
    LEFT JOIN (
      SELECT tenant_id, COUNT(*) AS lead_count, MAX(created_at) AS last_lead
      FROM leads WHERE deleted_at IS NULL GROUP BY tenant_id
    ) l ON l.tenant_id = t.id
    WHERE t.deleted_at IS NULL
    ORDER BY t.created_at DESC
  `;
  const res = await api.post(API_DINAMICO, { sql });
  return normalizeCrudList<TenantOverview>(res.data);
}

/**
 * Module popularity — how many tenants use each module.
 */
export async function fetchModulePopularity(): Promise<ModulePopularity[]> {
  const sql = `
    SELECT module_key, COUNT(DISTINCT tenant_id) AS tenant_count
    FROM tenant_modules
    WHERE enabled = true
    GROUP BY module_key
    ORDER BY tenant_count DESC
  `;
  const res = await api.post(API_DINAMICO, { sql });
  return normalizeCrudList<ModulePopularity>(res.data);
}

/**
 * Tenant growth per month (last 12 months).
 */
export async function fetchTenantGrowth(): Promise<TenantGrowth[]> {
  const sql = `
    SELECT
      TO_CHAR(created_at, 'YYYY-MM') AS month,
      COUNT(*) AS new_tenants
    FROM tenants
    WHERE deleted_at IS NULL
      AND created_at >= NOW() - INTERVAL '12 months'
    GROUP BY TO_CHAR(created_at, 'YYYY-MM')
    ORDER BY month ASC
  `;
  const res = await api.post(API_DINAMICO, { sql });
  return normalizeCrudList<TenantGrowth>(res.data);
}

/**
 * User growth per month (last 12 months).
 */
export async function fetchUserGrowth(): Promise<UserGrowth[]> {
  const sql = `
    SELECT
      TO_CHAR(created_at, 'YYYY-MM') AS month,
      COUNT(*) AS new_users
    FROM users
    WHERE deleted_at IS NULL
      AND created_at >= NOW() - INTERVAL '12 months'
    GROUP BY TO_CHAR(created_at, 'YYYY-MM')
    ORDER BY month ASC
  `;
  const res = await api.post(API_DINAMICO, { sql });
  return normalizeCrudList<UserGrowth>(res.data);
}

/**
 * Most recently created tenants.
 */
export async function fetchRecentTenants(limit = 5): Promise<RecentTenant[]> {
  const sql = `
    SELECT id, company_name, plan, status, config->>'specialty' AS specialty, created_at
    FROM tenants
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  const res = await api.post(API_DINAMICO, { sql });
  return normalizeCrudList<RecentTenant>(res.data);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-friendly module label */
const MODULE_LABELS: Record<string, string> = {
  core: "Core",
  partners: "Parceiros",
  documents: "Documentos",
  onr_cartorio: "ONR & Cartório",
  ai_automation: "IA & Automação",
  bi_analytics: "BI & Analytics",
  financial: "Financeiro",
  crm: "CRM & Leads",
};

export function getModuleLabel(key: string): string {
  return MODULE_LABELS[key] || key;
}

/** Format relative time in Portuguese */
export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Nunca";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d atrás`;
  const months = Math.floor(days / 30);
  return `${months}m atrás`;
}

/** Format month label (2024-03 → Mar/24) */
export function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  const monthNames = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  const idx = parseInt(month, 10) - 1;
  return `${monthNames[idx] || month}/${year?.slice(2)}`;
}
