/* ------------------------------------------------------------------ */
/*  Builder Analytics Service                                          */
/*                                                                     */
/*  B.4 — Builder Dashboard data layer.                                */
/*  Provides KPIs, recent sales/reviews, and pack listing for          */
/*  builders (users who publish packs in the marketplace).             */
/* ------------------------------------------------------------------ */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    type CrudFilter,
} from "./crud";
import {
    listMarketplacePacks,
    type MarketplacePackStatus
} from "./marketplace-packs";
import {
    getBuilderEarnings
} from "./revenue-share";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** KPI summary for the builder dashboard header cards */
export interface BuilderKpis {
  /** Number of packs with status = "published" */
  activePacks: number;
  /** Total packs across all statuses (excl. deleted) */
  totalPacks: number;
  /** Number of new installs in the current month */
  installsThisMonth: number;
  /** Gross revenue this month (all packs combined) in cents */
  grossRevenueThisMonth: number;
  /** Net builder revenue this month (after platform fee) in cents */
  netRevenueThisMonth: number;
  /** Average rating across all published packs */
  averageRating: number;
  /** Total number of ratings across all published packs */
  totalRatings: number;
}

/** A recent sale entry for the dashboard list */
export interface BuilderSaleEntry {
  id: string;
  pack_id: string;
  pack_name: string;
  buyer_tenant_id: string;
  buyer_name: string | null;
  gross_amount: number;
  builder_amount: number;
  status: string;
  created_at: string;
}

/** A recent review entry for the dashboard list */
export interface BuilderReviewEntry {
  id: string;
  pack_id: string;
  pack_name: string;
  rating: number;
  title: string | null;
  comment: string | null;
  reviewer_name: string | null;
  builder_response: string | null;
  created_at: string;
}

/** A pack row for the "Meus Packs" tabbed list */
export interface BuilderPackRow {
  id: string;
  name: string;
  slug: string;
  icon: string;
  category: string;
  version: string;
  status: MarketplacePackStatus;
  pricing_type: string;
  price_cents: number;
  download_count: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

/** Full dashboard data returned by loadBuilderDashboard */
export interface BuilderDashboardData {
  kpis: BuilderKpis;
  recentSales: BuilderSaleEntry[];
  recentReviews: BuilderReviewEntry[];
  packs: BuilderPackRow[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABLE_INSTALLS = "marketplace_installs";
const TABLE_REVIEWS = "pack_reviews";
const TABLE_PACKS = "marketplace_packs";
const TABLE_TENANTS = "tenants";
const TABLE_USERS = "users";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Get first day of current month as ISO string */
function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

/** Batch-resolve tenant names by IDs */
async function resolveTenantNames(
  ids: string[],
): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const unique = [...new Set(ids)];
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_TENANTS,
      ...buildSearchParams([
        { field: "id", value: unique.join(","), operator: "in" },
      ]),
    });
    const list = normalizeCrudList<{
      id: string;
      company_name?: string;
      slug?: string;
    }>(res.data);
    const map: Record<string, string> = {};
    for (const t of list) {
      map[t.id] = t.company_name || t.slug || t.id.slice(0, 8);
    }
    return map;
  } catch {
    return {};
  }
}

/** Batch-resolve user display names by IDs */
async function resolveUserNames(
  ids: string[],
): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const unique = [...new Set(ids)];
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_USERS,
      ...buildSearchParams([
        { field: "id", value: unique.join(","), operator: "in" },
      ]),
    });
    const list = normalizeCrudList<{
      id: string;
      fullname?: string;
      email?: string;
    }>(res.data);
    const map: Record<string, string> = {};
    for (const u of list) {
      map[u.id] = u.fullname || u.email || u.id.slice(0, 8);
    }
    return map;
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/*  isBuilder — Check if a user has any packs in marketplace_packs     */
/* ------------------------------------------------------------------ */

/**
 * Returns true if the given userId is the builder_id on at least
 * one marketplace_packs row (any status, non-deleted).
 */
export async function isBuilder(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_PACKS,
      ...buildSearchParams([{ field: "builder_id", value: userId }], {
        autoExcludeDeleted: true,
      }),
      limit: 1,
    });
    const list = normalizeCrudList<{ id: string }>(res.data);
    return list.length > 0;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  getBuilderPacks — All packs for the builder                        */
/* ------------------------------------------------------------------ */

export async function getBuilderPacks(
  builderId: string,
): Promise<BuilderPackRow[]> {
  const packs = await listMarketplacePacks({
    builderId,
    includeAll: true,
    sort: "newest",
  });

  return packs.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    icon: p.icon,
    category: p.category,
    version: p.version,
    status: p.status,
    pricing_type: p.pricing_type,
    price_cents: p.price_cents,
    download_count: p.download_count,
    rating_avg: p.rating_avg,
    rating_count: p.rating_count,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
}

/* ------------------------------------------------------------------ */
/*  getRecentSales — Recent installs for the builder's packs           */
/* ------------------------------------------------------------------ */

export async function getRecentSales(
  builderId: string,
  limit = 10,
): Promise<BuilderSaleEntry[]> {
  // 1. Get builder's earnings (already ordered by created_at DESC)
  const from = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 3,
    1,
  ).toISOString(); // last 3 months
  const { records } = await getBuilderEarnings(builderId, { from });

  const recent = records.slice(0, limit);
  if (!recent.length) return [];

  // 2. Resolve pack names
  const packIds = [...new Set(recent.map((r) => r.pack_id))];
  const packs = await listMarketplacePacks({ builderId, includeAll: true });
  const packMap: Record<string, string> = {};
  for (const p of packs) {
    packMap[p.id] = p.name;
  }

  // 3. Resolve buyer tenant names
  const tenantIds = recent.map((r) => r.buyer_tenant_id).filter(Boolean);
  const tenantNames = await resolveTenantNames(tenantIds);

  return recent.map((r) => ({
    id: r.id,
    pack_id: r.pack_id,
    pack_name: packMap[r.pack_id] || "Pack desconhecido",
    buyer_tenant_id: r.buyer_tenant_id,
    buyer_name: tenantNames[r.buyer_tenant_id] || null,
    gross_amount: Number(r.gross_amount ?? 0),
    builder_amount: Number(r.builder_amount ?? 0),
    status: r.status,
    created_at: r.created_at,
  }));
}

/* ------------------------------------------------------------------ */
/*  getRecentReviews — Recent reviews across builder's packs           */
/* ------------------------------------------------------------------ */

export async function getRecentReviews(
  builderId: string,
  limit = 10,
): Promise<BuilderReviewEntry[]> {
  // 1. Get builder's packs
  const packs = await listMarketplacePacks({ builderId, includeAll: true });
  const packIds = packs.map((p) => p.id);
  if (!packIds.length) return [];

  // 2. Fetch reviews for all builder packs (batch via IN operator)
  const filters: CrudFilter[] = [
    { field: "pack_id", value: packIds.join(","), operator: "in" },
  ];

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE_REVIEWS,
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      autoExcludeDeleted: true,
    }),
    limit,
  });

  const reviews = normalizeCrudList<{
    id: string;
    pack_id: string;
    rating: number;
    title: string | null;
    comment: string | null;
    reviewer_id: string;
    builder_response: string | null;
    created_at: string;
  }>(res.data);

  if (!reviews.length) return [];

  // 3. Resolve reviewer names
  const reviewerIds = reviews.map((r) => r.reviewer_id).filter(Boolean);
  const reviewerNames = await resolveUserNames(reviewerIds);

  // 4. Map pack names
  const packMap: Record<string, string> = {};
  for (const p of packs) {
    packMap[p.id] = p.name;
  }

  return reviews.map((r) => ({
    id: r.id,
    pack_id: r.pack_id,
    pack_name: packMap[r.pack_id] || "Pack desconhecido",
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    reviewer_name: reviewerNames[r.reviewer_id] || null,
    builder_response: r.builder_response,
    created_at: r.created_at,
  }));
}

/* ------------------------------------------------------------------ */
/*  getBuilderKpis — Aggregated KPIs for dashboard header              */
/* ------------------------------------------------------------------ */

export async function getBuilderKpis(builderId: string): Promise<BuilderKpis> {
  const kpis: BuilderKpis = {
    activePacks: 0,
    totalPacks: 0,
    installsThisMonth: 0,
    grossRevenueThisMonth: 0,
    netRevenueThisMonth: 0,
    averageRating: 0,
    totalRatings: 0,
  };

  // 1. Pack counts & average rating
  const packs = await listMarketplacePacks({
    builderId,
    includeAll: true,
  });

  kpis.totalPacks = packs.length;
  kpis.activePacks = packs.filter((p) => p.status === "published").length;

  // Weighted average rating across published packs
  const publishedWithRatings = packs.filter(
    (p) => p.status === "published" && p.rating_count > 0,
  );
  if (publishedWithRatings.length > 0) {
    let totalWeighted = 0;
    let totalCount = 0;
    for (const p of publishedWithRatings) {
      totalWeighted += Number(p.rating_avg ?? 0) * Number(p.rating_count ?? 0);
      totalCount += Number(p.rating_count ?? 0);
    }
    kpis.averageRating = totalCount > 0 ? totalWeighted / totalCount : 0;
    kpis.totalRatings = totalCount;
  }

  // 2. Installs this month (count installs for builder's packs)
  const packIds = packs.map((p) => p.id);
  if (packIds.length > 0) {
    try {
      const installFilters: CrudFilter[] = [
        { field: "pack_id", value: packIds.join(","), operator: "in" },
        { field: "installed_at", value: monthStart(), operator: "gte" },
      ];
      const installRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: TABLE_INSTALLS,
        ...buildSearchParams(installFilters, {
          autoExcludeDeleted: true,
          combineType: "AND",
        }),
      });
      const installs = normalizeCrudList<{ id: string }>(installRes.data);
      kpis.installsThisMonth = installs.length;
    } catch {
      // Non-critical
    }
  }

  // 3. Revenue this month
  try {
    const { summary } = await getBuilderEarnings(builderId, {
      from: monthStart(),
    });
    kpis.grossRevenueThisMonth = summary.total_gross;
    kpis.netRevenueThisMonth = summary.total_builder_amount;
  } catch {
    // Non-critical
  }

  return kpis;
}

/* ------------------------------------------------------------------ */
/*  loadBuilderDashboard — Single call that loads all dashboard data   */
/* ------------------------------------------------------------------ */

/**
 * Load all data needed for the builder dashboard in one call.
 * Uses Promise.all for parallel fetching where possible.
 */
export async function loadBuilderDashboard(
  builderId: string,
): Promise<BuilderDashboardData> {
  const [kpis, recentSales, recentReviews, packs] = await Promise.all([
    getBuilderKpis(builderId),
    getRecentSales(builderId, 10),
    getRecentReviews(builderId, 10),
    getBuilderPacks(builderId),
  ]);

  return { kpis, recentSales, recentReviews, packs };
}
