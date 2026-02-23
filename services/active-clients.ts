/**
 * Active Clients Service
 *
 * Provides utilities for tracking and calculating "active clients".
 * An active client is any customer with an interaction within the last 90 days.
 *
 * Architecture:
 * - `last_interaction_at` column on customers table (updated by nightly N8N cron)
 * - `active_client_count` column on tenants table (cached count, updated by cron)
 * - `consecutive_months_below` column on tenants.config (for auto-downgrade delay)
 *
 * The nightly cron job scans all tables with customer_id for latest activity:
 *   service_orders, invoices, payments, process_updates, service_appointments,
 *   controle_atendimento, public_access_tokens, quotes, generated_documents, etc.
 *
 * Monthly auto-tier logic:
 * - At month-end, count active clients per tenant
 * - If count > plan limit -> auto-upgrade (generate PIX for new plan)
 * - If count < plan lower bound for 2 consecutive months -> auto-downgrade
 */

import { api } from "./api";
import {
    API_DINAMICO,
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "./crud";
import {
    ACTIVE_CLIENT_WINDOW_DAYS,
    getRecommendedPlan,
    PLAN_ORDER,
    PLAN_TIERS,
    subscribeToPlan,
} from "./saas-billing";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ActiveClientSummary {
  tenantId: string;
  totalStoredClients: number;
  activeClients: number;
  currentPlan: string;
  recommendedPlan: string;
  needsUpgrade: boolean;
  needsDowngrade: boolean;
  consecutiveMonthsBelow: number;
}

export interface MonthlyTierResult {
  tenantId: string;
  previousPlan: string;
  newPlan: string | null;
  action: "upgrade" | "downgrade" | "none";
  activeClients: number;
  pixGenerated?: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Tables with `customer_id` column that count as "interaction".
 * The nightly cron scans these for MAX(updated_at) or MAX(created_at) per customer.
 */
export const INTERACTION_TABLES = [
  { table: "service_orders", dateField: "updated_at" },
  { table: "invoices", dateField: "updated_at" },
  { table: "payments", dateField: "created_at" },
  { table: "process_updates", dateField: "created_at" },
  { table: "service_appointments", dateField: "updated_at" },
  { table: "quotes", dateField: "updated_at" },
  { table: "generated_documents", dateField: "created_at" },
  { table: "client_files", dateField: "created_at" },
  { table: "process_document_responses", dateField: "created_at" },
  { table: "service_executions", dateField: "updated_at" },
  { table: "service_reviews", dateField: "created_at" },
] as const;

/** How many consecutive months below plan threshold before auto-downgrade */
export const DOWNGRADE_DELAY_MONTHS = 2;

/* ------------------------------------------------------------------ */
/*  SQL for N8N Cron (reference)                                       */
/* ------------------------------------------------------------------ */

/**
 * SQL to update `last_interaction_at` on customers table.
 * This is meant to be run as a nightly N8N cron via api_dinamico.
 *
 * The query finds the MAX date across all interaction tables per customer,
 * then updates customers.last_interaction_at.
 *
 * @returns SQL string for api_dinamico
 */
export function getUpdateLastInteractionSQL(): string {
  const unionParts = INTERACTION_TABLES.map(
    ({ table, dateField }) =>
      `SELECT customer_id, MAX(${dateField}) AS last_activity FROM ${table} WHERE customer_id IS NOT NULL GROUP BY customer_id`,
  );

  return `
    WITH all_interactions AS (
      ${unionParts.join("\n      UNION ALL\n      ")}
    ),
    latest_per_customer AS (
      SELECT customer_id, MAX(last_activity) AS last_activity
      FROM all_interactions
      GROUP BY customer_id
    )
    UPDATE customers c
    SET last_interaction_at = lpc.last_activity
    FROM latest_per_customer lpc
    WHERE c.id = lpc.customer_id
      AND (c.last_interaction_at IS NULL OR c.last_interaction_at < lpc.last_activity);
  `;
}

/**
 * SQL to update active_client_count on tenants table.
 * Run after updating last_interaction_at.
 */
export function getUpdateActiveClientCountSQL(): string {
  return `
    UPDATE tenants t
    SET active_client_count = sub.cnt
    FROM (
      SELECT tenant_id, COUNT(*) AS cnt
      FROM customers
      WHERE last_interaction_at >= NOW() - INTERVAL '${ACTIVE_CLIENT_WINDOW_DAYS} days'
        AND deleted_at IS NULL
      GROUP BY tenant_id
    ) sub
    WHERE t.id = sub.tenant_id;
  `;
}

/* ------------------------------------------------------------------ */
/*  Service Functions                                                  */
/* ------------------------------------------------------------------ */

/**
 * Trigger nightly recalculation of last_interaction_at via api_dinamico.
 * Called by N8N cron workflow or manually by super-admin.
 */
export async function recalculateActiveClients(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Step 1: Update last_interaction_at on customers
    await api.post(API_DINAMICO, {
      sql: getUpdateLastInteractionSQL(),
    });

    // Step 2: Update active_client_count on tenants
    await api.post(API_DINAMICO, {
      sql: getUpdateActiveClientCountSQL(),
    });

    return { success: true };
  } catch (err) {
    console.error("[Active Clients] Recalculation failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Recalculation failed",
    };
  }
}

/**
 * Get the active client summary for a specific tenant.
 */
export async function getActiveClientSummary(
  tenantId: string,
): Promise<ActiveClientSummary | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([{ field: "id", value: tenantId }]),
    });
    const tenants = normalizeCrudList<Record<string, unknown>>(res.data);
    const tenant = tenants[0];
    if (!tenant) return null;

    const plan = String(tenant.plan ?? "free");
    const activeCount = Number(tenant.active_client_count ?? 0);

    // Count total stored
    const totalRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "customers",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        fields: ["id"],
      }),
    });
    const totalStored = normalizeCrudList(totalRes.data).length;

    const config = parseConfig(tenant.config);
    const consecutiveMonthsBelow = Number(config.consecutive_months_below ?? 0);

    const recommendedPlan = getRecommendedPlan(activeCount);
    const currentPlanIdx = PLAN_ORDER.indexOf(plan);
    const recommendedIdx = PLAN_ORDER.indexOf(recommendedPlan);

    return {
      tenantId,
      totalStoredClients: totalStored,
      activeClients: activeCount,
      currentPlan: plan,
      recommendedPlan,
      needsUpgrade: recommendedIdx > currentPlanIdx,
      needsDowngrade:
        recommendedIdx < currentPlanIdx &&
        consecutiveMonthsBelow >= DOWNGRADE_DELAY_MONTHS,
      consecutiveMonthsBelow,
    };
  } catch {
    return null;
  }
}

/**
 * Process monthly tier adjustment for a single tenant.
 * Called at month-end by N8N cron or manually.
 *
 * Auto-upgrade: immediate, generates PIX for new plan price.
 * Auto-downgrade: only after 2 consecutive months below threshold.
 */
export async function processMonthlyTierAdjustment(
  tenantId: string,
): Promise<MonthlyTierResult> {
  const summary = await getActiveClientSummary(tenantId);
  if (!summary) {
    return {
      tenantId,
      previousPlan: "unknown",
      newPlan: null,
      action: "none",
      activeClients: 0,
      error: "Tenant not found",
    };
  }

  const { currentPlan, recommendedPlan, activeClients, needsUpgrade } = summary;

  // Auto-upgrade: immediate
  if (needsUpgrade) {
    const tier = PLAN_TIERS[recommendedPlan];
    if (tier && tier.monthlyPrice != null && tier.monthlyPrice > 0) {
      try {
        const result = await subscribeToPlan(tenantId, recommendedPlan);
        return {
          tenantId,
          previousPlan: currentPlan,
          newPlan: recommendedPlan,
          action: "upgrade",
          activeClients,
          pixGenerated: result.success,
          error: result.error,
        };
      } catch (err) {
        return {
          tenantId,
          previousPlan: currentPlan,
          newPlan: recommendedPlan,
          action: "upgrade",
          activeClients,
          pixGenerated: false,
          error: err instanceof Error ? err.message : "Upgrade failed",
        };
      }
    }
  }

  // Check for potential downgrade
  const currentPlanIdx = PLAN_ORDER.indexOf(currentPlan);
  const recommendedIdx = PLAN_ORDER.indexOf(recommendedPlan);

  if (recommendedIdx < currentPlanIdx && currentPlan !== "free") {
    // Increment consecutive months below
    const config = await getTenantConfig(tenantId);
    const prevMonths = Number(config.consecutive_months_below ?? 0);
    const newMonths = prevMonths + 1;

    if (newMonths >= DOWNGRADE_DELAY_MONTHS) {
      // Auto-downgrade
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "tenants",
          payload: {
            id: tenantId,
            plan: recommendedPlan,
            config: { ...config, consecutive_months_below: 0 },
          },
        });
        return {
          tenantId,
          previousPlan: currentPlan,
          newPlan: recommendedPlan,
          action: "downgrade",
          activeClients,
        };
      } catch (err) {
        return {
          tenantId,
          previousPlan: currentPlan,
          newPlan: recommendedPlan,
          action: "downgrade",
          activeClients,
          error: err instanceof Error ? err.message : "Downgrade failed",
        };
      }
    } else {
      // Not enough consecutive months — just increment counter
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "tenants",
          payload: {
            id: tenantId,
            config: { ...config, consecutive_months_below: newMonths },
          },
        });
      } catch {
        /* best-effort */
      }
      return {
        tenantId,
        previousPlan: currentPlan,
        newPlan: null,
        action: "none",
        activeClients,
      };
    }
  }

  // Reset consecutive months below if within plan limits
  if (recommendedIdx >= currentPlanIdx) {
    const config = await getTenantConfig(tenantId);
    if (Number(config.consecutive_months_below ?? 0) > 0) {
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "tenants",
          payload: {
            id: tenantId,
            config: { ...config, consecutive_months_below: 0 },
          },
        });
      } catch {
        /* best-effort */
      }
    }
  }

  return {
    tenantId,
    previousPlan: currentPlan,
    newPlan: null,
    action: "none",
    activeClients,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseConfig(config: unknown): Record<string, unknown> {
  if (!config) return {};
  if (typeof config === "string") {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  if (typeof config === "object") return config as Record<string, unknown>;
  return {};
}

async function getTenantConfig(
  tenantId: string,
): Promise<Record<string, unknown>> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([{ field: "id", value: tenantId }]),
    });
    const tenants = normalizeCrudList<Record<string, unknown>>(res.data);
    return parseConfig(tenants[0]?.config);
  } catch {
    return {};
  }
}
