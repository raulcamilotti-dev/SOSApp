/* ------------------------------------------------------------------ */
/*  Revenue Share Service (B.2)                                        */
/*                                                                     */
/*  Handles revenue splitting between platform (Radul) and pack        */
/*  builders for paid marketplace packs.                               */
/*                                                                     */
/*  Flow:                                                              */
/*    1. Payment confirmed → createRevenueShareRecord() auto-splits    */
/*    2. Monthly cron → processMonthlyPayouts() aggregates pending     */
/*    3. Admin pays builder via PIX → markPayoutAsPaid()               */
/*    4. Builder views earnings → getBuilderEarnings()                 */
/*                                                                     */
/*  Default split: 70% builder / 30% platform (configurable per pack)  */
/* ------------------------------------------------------------------ */

import { api, getApiErrorMessage } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
    type CrudFilter,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RevenueShare {
  id: string;
  pack_id: string;
  builder_id: string;
  install_id: string;
  invoice_id: string | null;
  ar_id: string | null;
  buyer_tenant_id: string;
  gross_amount: number;
  builder_share_percent: number;
  builder_amount: number;
  platform_amount: number;
  currency: string;
  competence: string;
  status: RevenueShareStatus;
  payout_reference: string | null;
  paid_at: string | null;
  notes: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type RevenueShareStatus = "pending" | "processed" | "paid" | "cancelled";

/** Input for creating a revenue share on payment confirmation */
export interface CreateRevenueShareInput {
  pack_id: string;
  builder_id: string;
  install_id: string;
  invoice_id?: string;
  ar_id?: string;
  buyer_tenant_id: string;
  gross_amount: number;
  /** Override per-pack share. If omitted, fetched from marketplace_packs.builder_share_percent */
  builder_share_percent?: number;
  competence?: string;
  notes?: Record<string, unknown>;
}

/** Result of a revenue share calculation */
export interface RevenueShareSplit {
  gross_amount: number;
  builder_share_percent: number;
  builder_amount: number;
  platform_amount: number;
}

/** Aggregated earnings summary for a builder */
export interface BuilderEarningsSummary {
  total_gross: number;
  total_builder_amount: number;
  total_platform_amount: number;
  total_pending: number;
  total_processed: number;
  total_paid: number;
  record_count: number;
}

/** Payout summary grouped by builder */
export interface BuilderPayoutSummary {
  builder_id: string;
  builder_name: string;
  pending_amount: number;
  pending_count: number;
  revenue_share_ids: string[];
}

export interface PayoutResult {
  success: boolean;
  processed_count: number;
  total_amount: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABLE = "revenue_shares";
const DEFAULT_BUILDER_SHARE_PERCENT = 70;
const DEFAULT_CURRENCY = "BRL";

/* ------------------------------------------------------------------ */
/*  Core: Calculate Revenue Share Split                                */
/* ------------------------------------------------------------------ */

/**
 * Pure calculation of the revenue split.
 * Does not touch the database — useful for previews & display.
 */
export function calculateRevenueShare(
  grossAmount: number,
  builderSharePercent: number = DEFAULT_BUILDER_SHARE_PERCENT,
): RevenueShareSplit {
  const clampedPercent = Math.min(100, Math.max(0, builderSharePercent));
  const builderAmount = Math.round(grossAmount * clampedPercent) / 100;
  const platformAmount = grossAmount - builderAmount;

  return {
    gross_amount: grossAmount,
    builder_share_percent: clampedPercent,
    builder_amount: builderAmount,
    platform_amount: platformAmount,
  };
}

/* ------------------------------------------------------------------ */
/*  Core: Create Revenue Share Record                                  */
/* ------------------------------------------------------------------ */

/**
 * Create a revenue share record in the database after a payment is confirmed.
 *
 * Called from confirmPackPayment() in pack-billing.ts.
 * Automatically fetches builder_share_percent from the pack if not provided.
 *
 * @returns The created revenue share record, or null on failure.
 */
export async function createRevenueShareRecord(
  input: CreateRevenueShareInput,
): Promise<RevenueShare | null> {
  try {
    // Determine builder share percent
    let sharePercent = input.builder_share_percent;
    if (sharePercent === undefined || sharePercent === null) {
      sharePercent = await getPackSharePercent(input.pack_id);
    }

    const split = calculateRevenueShare(input.gross_amount, sharePercent);

    // Determine competence (month)
    const competence =
      input.competence ?? new Date().toISOString().slice(0, 7) + "-01";

    const now = new Date().toISOString();

    const payload: Record<string, unknown> = {
      pack_id: input.pack_id,
      builder_id: input.builder_id,
      install_id: input.install_id,
      invoice_id: input.invoice_id ?? null,
      ar_id: input.ar_id ?? null,
      buyer_tenant_id: input.buyer_tenant_id,
      gross_amount: split.gross_amount,
      builder_share_percent: split.builder_share_percent,
      builder_amount: split.builder_amount,
      platform_amount: split.platform_amount,
      currency: DEFAULT_CURRENCY,
      competence,
      status: "pending",
      notes: input.notes ? JSON.stringify(input.notes) : null,
      created_at: now,
      updated_at: now,
    };

    const res = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: TABLE,
      payload,
    });

    const created = normalizeCrudOne<RevenueShare>(res.data);
    if (__DEV__) {
      console.log(
        `[Revenue Share] Created share: builder=${input.builder_id}, gross=${split.gross_amount}, builder_amount=${split.builder_amount} (${split.builder_share_percent}%)`,
      );
    }
    return created ?? null;
  } catch (err) {
    console.error(
      "[Revenue Share] Failed to create revenue share:",
      getApiErrorMessage(err),
    );
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Query: Get Builder Earnings                                        */
/* ------------------------------------------------------------------ */

/**
 * Fetch accumulated earnings for a specific builder.
 *
 * Supports optional filters by date range, pack, and status.
 */
export async function getBuilderEarnings(
  builderId: string,
  filters?: {
    /** ISO date — filter created_at >= from */
    from?: string;
    /** ISO date — filter created_at <= to */
    to?: string;
    /** Filter by specific pack */
    packId?: string;
    /** Filter by status */
    status?: RevenueShareStatus;
  },
): Promise<{
  summary: BuilderEarningsSummary;
  records: RevenueShare[];
}> {
  const crudFilters: CrudFilter[] = [{ field: "builder_id", value: builderId }];

  if (filters?.packId) {
    crudFilters.push({ field: "pack_id", value: filters.packId });
  }
  if (filters?.status) {
    crudFilters.push({ field: "status", value: filters.status });
  }
  if (filters?.from) {
    crudFilters.push({
      field: "created_at",
      value: filters.from,
      operator: "gte",
    });
  }
  if (filters?.to) {
    crudFilters.push({
      field: "created_at",
      value: filters.to,
      operator: "lte",
    });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...buildSearchParams(crudFilters, {
      sortColumn: "created_at DESC",
      autoExcludeDeleted: true,
      combineType: "AND",
    }),
  });

  const records = normalizeCrudList<RevenueShare>(res.data).filter(
    (r) => !r.deleted_at,
  );

  const summary: BuilderEarningsSummary = {
    total_gross: 0,
    total_builder_amount: 0,
    total_platform_amount: 0,
    total_pending: 0,
    total_processed: 0,
    total_paid: 0,
    record_count: records.length,
  };

  for (const r of records) {
    summary.total_gross += Number(r.gross_amount ?? 0);
    summary.total_builder_amount += Number(r.builder_amount ?? 0);
    summary.total_platform_amount += Number(r.platform_amount ?? 0);

    const amount = Number(r.builder_amount ?? 0);
    if (r.status === "pending") summary.total_pending += amount;
    else if (r.status === "processed") summary.total_processed += amount;
    else if (r.status === "paid") summary.total_paid += amount;
  }

  return { summary, records };
}

/* ------------------------------------------------------------------ */
/*  Admin: List Pending Payouts (grouped by builder)                   */
/* ------------------------------------------------------------------ */

/**
 * List all pending revenue shares grouped by builder for admin payout view.
 *
 * Returns one summary per builder with total pending amount and record IDs.
 */
export async function listPendingPayouts(): Promise<BuilderPayoutSummary[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...buildSearchParams([{ field: "status", value: "pending" }], {
      autoExcludeDeleted: true,
      sortColumn: "builder_id ASC",
    }),
  });

  const pending = normalizeCrudList<RevenueShare>(res.data).filter(
    (r) => !r.deleted_at && r.status === "pending",
  );

  // Group by builder_id
  const byBuilder = new Map<
    string,
    { amount: number; count: number; ids: string[] }
  >();

  for (const r of pending) {
    const entry = byBuilder.get(r.builder_id) ?? {
      amount: 0,
      count: 0,
      ids: [],
    };
    entry.amount += Number(r.builder_amount ?? 0);
    entry.count += 1;
    entry.ids.push(r.id);
    byBuilder.set(r.builder_id, entry);
  }

  // Resolve builder names
  const builderIds = Array.from(byBuilder.keys());
  const builderNames = await resolveBuilderNames(builderIds);

  const summaries: BuilderPayoutSummary[] = [];
  for (const [builderId, data] of byBuilder.entries()) {
    summaries.push({
      builder_id: builderId,
      builder_name: builderNames.get(builderId) ?? builderId,
      pending_amount: data.amount,
      pending_count: data.count,
      revenue_share_ids: data.ids,
    });
  }

  // Sort by pending amount descending
  summaries.sort((a, b) => b.pending_amount - a.pending_amount);
  return summaries;
}

/* ------------------------------------------------------------------ */
/*  Admin: Process Monthly Payouts                                     */
/* ------------------------------------------------------------------ */

/**
 * Batch-mark all pending revenue shares as "processed" for a given month.
 *
 * This signals that the admin has acknowledged these payouts and will
 * pay builders manually via PIX. Does NOT mark as "paid" — that happens
 * when admin calls markPayoutAsPaid() after the actual PIX transfer.
 *
 * @param monthReference - e.g. "2026-03" (defaults to current month)
 * @returns Summary of processed payouts
 */
export async function processMonthlyPayouts(
  monthReference?: string,
): Promise<PayoutResult> {
  const month = monthReference ?? new Date().toISOString().slice(0, 7); // "2026-03"
  const competenceLike = `${month}%`;

  try {
    // Fetch pending shares for this month
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE,
      ...buildSearchParams(
        [
          { field: "status", value: "pending" },
          { field: "competence", value: competenceLike, operator: "like" },
        ],
        { combineType: "AND", autoExcludeDeleted: true },
      ),
    });

    const pendingShares = normalizeCrudList<RevenueShare>(res.data).filter(
      (r) => !r.deleted_at && r.status === "pending",
    );

    if (pendingShares.length === 0) {
      return { success: true, processed_count: 0, total_amount: 0 };
    }

    let processedCount = 0;
    let totalAmount = 0;
    const now = new Date().toISOString();

    for (const share of pendingShares) {
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: TABLE,
          payload: {
            id: share.id,
            status: "processed",
            updated_at: now,
          },
        });
        processedCount += 1;
        totalAmount += Number(share.builder_amount ?? 0);
      } catch (err) {
        console.error(
          `[Revenue Share] Failed to process share ${share.id}:`,
          getApiErrorMessage(err),
        );
      }
    }

    if (__DEV__) {
      console.log(
        `[Revenue Share] Processed ${processedCount} payouts for ${month}, total= R$ ${totalAmount.toFixed(2)}`,
      );
    }

    return {
      success: true,
      processed_count: processedCount,
      total_amount: totalAmount,
    };
  } catch (err) {
    console.error("[Revenue Share] processMonthlyPayouts error:", err);
    return {
      success: false,
      processed_count: 0,
      total_amount: 0,
      error: getApiErrorMessage(err, "Erro ao processar payouts mensais"),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Admin: Mark Payout as Paid                                         */
/* ------------------------------------------------------------------ */

/**
 * Mark one or more revenue share records as "paid" after manual PIX.
 *
 * @param revenueShareIds - Array of revenue_share IDs to mark as paid
 * @param payoutReference - External reference (PIX transaction ID, bank ref, etc.)
 */
export async function markPayoutAsPaid(
  revenueShareIds: string[],
  payoutReference: string,
): Promise<{ success: boolean; paid_count: number; error?: string }> {
  if (!revenueShareIds.length) {
    return { success: false, paid_count: 0, error: "Nenhum ID informado" };
  }

  const now = new Date().toISOString();
  let paidCount = 0;

  for (const id of revenueShareIds) {
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: TABLE,
        payload: {
          id,
          status: "paid",
          payout_reference: payoutReference,
          paid_at: now,
          updated_at: now,
        },
      });
      paidCount += 1;
    } catch (err) {
      console.error(
        `[Revenue Share] Failed to mark ${id} as paid:`,
        getApiErrorMessage(err),
      );
    }
  }

  return { success: paidCount > 0, paid_count: paidCount };
}

/* ------------------------------------------------------------------ */
/*  Admin: Cancel Revenue Share                                        */
/* ------------------------------------------------------------------ */

/**
 * Cancel a revenue share record (e.g. refund, chargeback).
 */
export async function cancelRevenueShare(
  revenueShareId: string,
  reason?: string,
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const notes = reason
      ? JSON.stringify({ cancel_reason: reason })
      : undefined;

    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: TABLE,
      payload: {
        id: revenueShareId,
        status: "cancelled",
        notes,
        updated_at: now,
      },
    });
    return true;
  } catch (err) {
    console.error(
      "[Revenue Share] Failed to cancel share:",
      getApiErrorMessage(err),
    );
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Query: Revenue Shares for a Pack                                   */
/* ------------------------------------------------------------------ */

/**
 * Fetch all revenue share records for a specific pack.
 * Useful for the pack detail/analytics view.
 */
export async function getPackRevenueShares(
  packId: string,
): Promise<RevenueShare[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...buildSearchParams([{ field: "pack_id", value: packId }], {
      autoExcludeDeleted: true,
      sortColumn: "created_at DESC",
    }),
  });

  return normalizeCrudList<RevenueShare>(res.data).filter((r) => !r.deleted_at);
}

/* ------------------------------------------------------------------ */
/*  Query: Revenue Shares for a Buyer Tenant                           */
/* ------------------------------------------------------------------ */

/**
 * Fetch all revenue shares generated by a specific tenant's purchases.
 * Useful for admin tenant detail view.
 */
export async function getTenantRevenueShares(
  tenantId: string,
): Promise<RevenueShare[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...buildSearchParams([{ field: "buyer_tenant_id", value: tenantId }], {
      autoExcludeDeleted: true,
      sortColumn: "created_at DESC",
    }),
  });

  return normalizeCrudList<RevenueShare>(res.data).filter((r) => !r.deleted_at);
}

/* ------------------------------------------------------------------ */
/*  Internal Helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Fetch the builder_share_percent for a pack from the database.
 * Defaults to DEFAULT_BUILDER_SHARE_PERCENT if not found.
 */
async function getPackSharePercent(packId: string): Promise<number> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "marketplace_packs",
      ...buildSearchParams([{ field: "id", value: packId }]),
      fields: "id,builder_share_percent",
    });
    const packs = normalizeCrudList<{
      id: string;
      builder_share_percent?: number;
    }>(res.data);
    const pack = packs[0];
    const percent = Number(pack?.builder_share_percent ?? 0);
    return percent > 0 ? percent : DEFAULT_BUILDER_SHARE_PERCENT;
  } catch {
    return DEFAULT_BUILDER_SHARE_PERCENT;
  }
}

/**
 * Find the active install ID for a pack+tenant combination.
 * Returns null if no active install found.
 */
export async function findActiveInstallId(
  packId: string,
  tenantId: string,
): Promise<string | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "marketplace_installs",
      ...buildSearchParams(
        [
          { field: "pack_id", value: packId },
          { field: "tenant_id", value: tenantId },
          { field: "status", value: "active" },
        ],
        { combineType: "AND", sortColumn: "installed_at DESC" },
      ),
    });
    const installs = normalizeCrudList<{ id: string }>(res.data);
    return installs[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve builder IDs to display names via the users table.
 */
async function resolveBuilderNames(
  builderIds: string[],
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (builderIds.length === 0) return nameMap;

  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "users",
      ...buildSearchParams([
        { field: "id", value: builderIds.join(","), operator: "in" },
      ]),
      fields: "id,fullname,email",
    });
    const users = normalizeCrudList<{
      id: string;
      fullname?: string;
      email?: string;
    }>(res.data);
    for (const u of users) {
      nameMap.set(u.id, u.fullname?.trim() || u.email || u.id);
    }
  } catch {
    // Best-effort — return IDs as names
  }

  return nameMap;
}
