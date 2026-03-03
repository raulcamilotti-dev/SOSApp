/* ------------------------------------------------------------------ */
/*  Marketplace Packs Service                                          */
/*                                                                     */
/*  CRUD for the Pack Marketplace (A.5): browse, install, uninstall,   */
/*  publish (submit for review), and approve/reject packs.             */
/*  Internally delegates to `applyTemplatePack()` / `clearPackData()`. */
/* ------------------------------------------------------------------ */

import type { TemplatePack } from "@/data/template-packs/types";
import { api, getApiErrorMessage } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
    type CrudFilter,
} from "./crud";
import { applyTemplatePack, clearPackData } from "./template-packs";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MarketplacePack {
  id: string;
  builder_id: string;
  builder_tenant_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  long_description: string | null;
  icon: string;
  category: string;
  tags: string[];
  pack_data: TemplatePack;
  agent_pack_data: Record<string, unknown> | null;
  version: string;
  status: MarketplacePackStatus;
  rejection_reason: string | null;
  pricing_type: MarketplacePackPricing;
  price_cents: number;
  trial_days: number;
  /** Builder share percentage (default 70). Platform keeps 100 - this value. */
  builder_share_percent: number;
  download_count: number;
  rating_avg: number;
  rating_count: number;
  is_official: boolean;
  preview_images: string[];
  requirements: MarketplacePackRequirements;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type MarketplacePackStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected"
  | "archived";

export type MarketplacePackPricing = "free" | "one_time" | "monthly";

export interface MarketplacePackRequirements {
  modules?: string[];
}

export interface MarketplaceInstall {
  id: string;
  tenant_id: string;
  pack_id: string;
  installed_version: string;
  installed_by: string | null;
  installed_at: string;
  uninstalled_at: string | null;
  status: "active" | "uninstalled";
}

export interface MarketplacePackListFilters {
  category?: string;
  search?: string;
  pricing_type?: MarketplacePackPricing;
  sort?: "popular" | "newest" | "name" | "rating";
  /** When true, includes non-published packs (for builder/admin views) */
  includeAll?: boolean;
  /** Filter by builder_id (for "my packs" view) */
  builderId?: string;
  /** Filter by status (for admin review) */
  status?: MarketplacePackStatus;
}

export interface MarketplacePackSubmission {
  name: string;
  slug: string;
  description: string;
  long_description?: string;
  icon?: string;
  category: string;
  tags?: string[];
  pack_data: TemplatePack;
  agent_pack_data?: Record<string, unknown>;
  version?: string;
  pricing_type?: MarketplacePackPricing;
  price_cents?: number;
  /** Builder revenue share percentage (0-100). Default: 70 */
  builder_share_percent?: number;
  preview_images?: string[];
  requirements?: MarketplacePackRequirements;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABLE = "marketplace_packs";
const TABLE_INSTALLS = "marketplace_installs";

export const MARKETPLACE_CATEGORIES = [
  { value: "juridico", label: "Jurídico", icon: "⚖️" },
  { value: "saude", label: "Saúde", icon: "🏥" },
  { value: "comercio", label: "Comércio", icon: "🛒" },
  { value: "consultoria", label: "Consultoria", icon: "📊" },
  { value: "imobiliario", label: "Imobiliário", icon: "🏠" },
  { value: "educacao", label: "Educação", icon: "📚" },
  { value: "servicos", label: "Serviços", icon: "🔧" },
  { value: "generico", label: "Genérico", icon: "📦" },
] as const;

/* ------------------------------------------------------------------ */
/*  Browse / List                                                      */
/* ------------------------------------------------------------------ */

/**
 * List marketplace packs with optional filters.
 * By default returns only published packs (for tenant browsing).
 */
export async function listMarketplacePacks(
  filters?: MarketplacePackListFilters,
): Promise<MarketplacePack[]> {
  const crudFilters: CrudFilter[] = [];

  // Status filter
  if (filters?.status) {
    crudFilters.push({ field: "status", value: filters.status });
  } else if (!filters?.includeAll && !filters?.builderId) {
    crudFilters.push({ field: "status", value: "published" });
  }

  // Category filter
  if (filters?.category) {
    crudFilters.push({ field: "category", value: filters.category });
  }

  // Pricing type
  if (filters?.pricing_type) {
    crudFilters.push({ field: "pricing_type", value: filters.pricing_type });
  }

  // Builder filter (for "my packs")
  if (filters?.builderId) {
    crudFilters.push({ field: "builder_id", value: filters.builderId });
  }

  // Sort
  let sortColumn = "download_count DESC"; // default: popular
  if (filters?.sort === "newest") sortColumn = "created_at DESC";
  if (filters?.sort === "name") sortColumn = "name ASC";
  if (filters?.sort === "rating") sortColumn = "rating_avg DESC";

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...buildSearchParams(crudFilters, {
      sortColumn,
      autoExcludeDeleted: true,
    }),
  });

  let packs = normalizeCrudList<MarketplacePack>(res.data);

  // Client-side text search (ilike not great for multi-field search)
  if (filters?.search) {
    const term = filters.search.toLowerCase().trim();
    packs = packs.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description ?? "").toLowerCase().includes(term) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(term)),
    );
  }

  return packs;
}

/* ------------------------------------------------------------------ */
/*  Detail                                                             */
/* ------------------------------------------------------------------ */

/**
 * Get full details of a marketplace pack by ID.
 */
export async function getPackDetails(
  packId: string,
): Promise<MarketplacePack | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...buildSearchParams([{ field: "id", value: packId }]),
  });
  const list = normalizeCrudList<MarketplacePack>(res.data);
  return list.find((p) => p.id === packId) ?? null;
}

/**
 * Get pack by slug (for URL-friendly lookups).
 */
export async function getPackBySlug(
  slug: string,
): Promise<MarketplacePack | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...buildSearchParams([{ field: "slug", value: slug }], {
      autoExcludeDeleted: true,
    }),
  });
  const list = normalizeCrudList<MarketplacePack>(res.data);
  return list.find((p) => p.slug === slug) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Install / Uninstall                                                */
/* ------------------------------------------------------------------ */

/**
 * Install a pack on a tenant.
 *
 * 1. Fetches the pack_data from marketplace_packs
 * 2. Calls applyTemplatePack() to create all entities
 * 3. Records the install in marketplace_installs
 * 4. Increments download_count
 */
export async function installPack(
  tenantId: string,
  packId: string,
  userId: string,
  onProgress?: (step: string, progress: number) => void,
): Promise<{ success: boolean; errors: string[] }> {
  // 1. Get the pack
  const pack = await getPackDetails(packId);
  if (!pack) {
    return { success: false, errors: ["Pack não encontrado."] };
  }
  if (pack.status !== "published") {
    return { success: false, errors: ["Pack não está publicado."] };
  }

  // 2. Check if already installed
  const existingInstall = await getInstallForTenant(tenantId, packId);
  if (existingInstall && existingInstall.status === "active") {
    return { success: false, errors: ["Pack já está instalado."] };
  }

  const packData = pack.pack_data as TemplatePack;

  // 3. Apply the pack
  const applyResult = await applyTemplatePack(packData, tenantId, onProgress);

  if (!applyResult.success && applyResult.errors.length > 0) {
    return { success: false, errors: applyResult.errors };
  }

  // 4. Record installation
  try {
    if (existingInstall) {
      // Re-activate previous install
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: TABLE_INSTALLS,
        payload: {
          id: existingInstall.id,
          status: "active",
          installed_version: pack.version,
          installed_by: userId,
          installed_at: new Date().toISOString(),
          uninstalled_at: null,
        },
      });
    } else {
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: TABLE_INSTALLS,
        payload: {
          tenant_id: tenantId,
          pack_id: packId,
          installed_version: pack.version,
          installed_by: userId,
          installed_at: new Date().toISOString(),
          status: "active",
        },
      });
    }
  } catch {
    // Non-fatal — the pack was applied even if tracking fails
  }

  // 5. Increment download count
  try {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: TABLE,
      payload: {
        id: packId,
        download_count: (pack.download_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
    });
  } catch {
    // Non-fatal
  }

  return {
    success: applyResult.success,
    errors: applyResult.errors,
  };
}

/**
 * Uninstall a pack from a tenant.
 *
 * 1. Calls clearPackData() to remove pack entities
 * 2. Marks the install as uninstalled
 */
export async function uninstallPack(
  tenantId: string,
  packId: string,
): Promise<{ success: boolean; errors: string[] }> {
  // 1. Clear pack data
  const clearResult = await clearPackData(tenantId);

  // 2. Mark install as uninstalled
  const install = await getInstallForTenant(tenantId, packId);
  if (install) {
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: TABLE_INSTALLS,
        payload: {
          id: install.id,
          status: "uninstalled",
          uninstalled_at: new Date().toISOString(),
        },
      });
    } catch {
      // Non-fatal
    }
  }

  return {
    success: clearResult.success,
    errors: clearResult.errors,
  };
}

/* ------------------------------------------------------------------ */
/*  Install Tracking                                                   */
/* ------------------------------------------------------------------ */

/**
 * Get install record for a specific tenant + pack combination.
 */
export async function getInstallForTenant(
  tenantId: string,
  packId: string,
): Promise<MarketplaceInstall | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE_INSTALLS,
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "pack_id", value: packId },
      ],
      { combineType: "AND" },
    ),
  });
  const list = normalizeCrudList<MarketplaceInstall>(res.data);
  return list[0] ?? null;
}

/**
 * Get all active installs for a tenant.
 */
export async function getTenantInstalls(
  tenantId: string,
): Promise<MarketplaceInstall[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE_INSTALLS,
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "status", value: "active" },
      ],
      { combineType: "AND", sortColumn: "installed_at DESC" },
    ),
  });
  return normalizeCrudList<MarketplaceInstall>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Publish Flow (Builder → Review → Published)                        */
/* ------------------------------------------------------------------ */

/**
 * Submit a new pack for review (builder creates a draft and sends to review).
 */
export async function submitPackForReview(
  submission: MarketplacePackSubmission,
  builderId: string,
  builderTenantId?: string,
): Promise<MarketplacePack> {
  const now = new Date().toISOString();

  const payload = {
    builder_id: builderId,
    builder_tenant_id: builderTenantId ?? null,
    name: submission.name,
    slug: submission.slug,
    description: submission.description ?? null,
    long_description: submission.long_description ?? null,
    icon: submission.icon ?? "📦",
    category: submission.category,
    tags: JSON.stringify(submission.tags ?? []),
    pack_data: JSON.stringify(submission.pack_data),
    agent_pack_data: submission.agent_pack_data
      ? JSON.stringify(submission.agent_pack_data)
      : null,
    version: submission.version ?? "1.0.0",
    status: "pending_review" as const,
    pricing_type: submission.pricing_type ?? "free",
    price_cents: submission.price_cents ?? 0,
    builder_share_percent: submission.builder_share_percent ?? 70,
    preview_images: JSON.stringify(submission.preview_images ?? []),
    requirements: JSON.stringify(submission.requirements ?? {}),
    download_count: 0,
    is_official: false,
    created_at: now,
    updated_at: now,
  };

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: TABLE,
    payload,
  });

  return normalizeCrudOne<MarketplacePack>(res.data);
}

/**
 * Update an existing pack (builder can update drafts or rejected packs).
 */
export async function updatePack(
  packId: string,
  updates: Partial<MarketplacePackSubmission>,
): Promise<MarketplacePack> {
  const payload: Record<string, unknown> = { id: packId };

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.description !== undefined)
    payload.description = updates.description;
  if (updates.long_description !== undefined)
    payload.long_description = updates.long_description;
  if (updates.icon !== undefined) payload.icon = updates.icon;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.tags !== undefined) payload.tags = JSON.stringify(updates.tags);
  if (updates.pack_data !== undefined)
    payload.pack_data = JSON.stringify(updates.pack_data);
  if (updates.agent_pack_data !== undefined)
    payload.agent_pack_data = JSON.stringify(updates.agent_pack_data);
  if (updates.version !== undefined) payload.version = updates.version;
  if (updates.pricing_type !== undefined)
    payload.pricing_type = updates.pricing_type;
  if (updates.price_cents !== undefined)
    payload.price_cents = updates.price_cents;
  if (updates.preview_images !== undefined)
    payload.preview_images = JSON.stringify(updates.preview_images);
  if (updates.requirements !== undefined)
    payload.requirements = JSON.stringify(updates.requirements);

  payload.updated_at = new Date().toISOString();
  // Re-submit for review when updating a rejected pack
  payload.status = "pending_review";
  payload.rejection_reason = null;

  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: TABLE,
    payload,
  });

  return normalizeCrudOne<MarketplacePack>(res.data);
}

/**
 * Re-submit a rejected pack back to pending_review.
 */
export async function resubmitPack(packId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: TABLE,
    payload: {
      id: packId,
      status: "pending_review",
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Admin Review (SuperAdmin)                                          */
/* ------------------------------------------------------------------ */

/**
 * Approve or reject a pack (SuperAdmin only).
 */
export async function approveRejectPack(
  packId: string,
  decision: "published" | "rejected",
  reason?: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: TABLE,
    payload: {
      id: packId,
      status: decision,
      rejection_reason: decision === "rejected" ? (reason ?? null) : null,
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Archive a pack (soft removal from marketplace — hide but don't delete).
 */
export async function archivePack(packId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: TABLE,
    payload: {
      id: packId,
      status: "archived",
      updated_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Seed Official Packs                                                */
/* ------------------------------------------------------------------ */

/**
 * Seed built-in packs into marketplace_packs with is_official=true.
 * Idempotent — only creates if slug doesn't exist.
 *
 * Called during platform setup or manually by SuperAdmin.
 */
export async function seedOfficialPacks(
  builderId: string,
): Promise<{ created: string[]; skipped: string[] }> {
  // Dynamic import to avoid circular dependency at module level
  const { PACKS } = await import("@/data/template-packs");

  const created: string[] = [];
  const skipped: string[] = [];

  for (const [key, pack] of Object.entries(PACKS)) {
    // Skip padrao — it's always applied at onboarding, not a marketplace pack
    if (key === "padrao") {
      skipped.push(key);
      continue;
    }

    // Check if slug already exists
    const existing = await getPackBySlug(key);
    if (existing) {
      skipped.push(key);
      continue;
    }

    const now = new Date().toISOString();

    try {
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: TABLE,
        payload: {
          builder_id: builderId,
          name: pack.metadata.name,
          slug: key,
          description: pack.metadata.description,
          icon: pack.metadata.icon,
          category: inferCategory(pack),
          tags: JSON.stringify([key]),
          pack_data: JSON.stringify(pack),
          version: pack.metadata.version,
          status: "published",
          pricing_type: "free",
          price_cents: 0,
          download_count: 0,
          is_official: true,
          preview_images: JSON.stringify([]),
          requirements: JSON.stringify({ modules: pack.modules }),
          created_at: now,
          updated_at: now,
        },
      });
      created.push(key);
    } catch (err) {
      console.warn(
        `[seedOfficialPacks] Failed to seed ${key}:`,
        getApiErrorMessage(err),
      );
      skipped.push(key);
    }
  }

  return { created, skipped };
}

/**
 * Infer marketplace category from pack metadata / config.
 */
function inferCategory(pack: TemplatePack): string {
  const specialty = pack.tenant_config?.specialty?.toLowerCase() ?? "";
  const key = pack.metadata.key.toLowerCase();

  if (
    specialty === "juridico" ||
    key.includes("advoc") ||
    key.includes("jurid")
  )
    return "juridico";
  if (
    specialty === "saude" ||
    key.includes("clinic") ||
    key.includes("saude") ||
    key.includes("pet")
  )
    return "saude";
  if (
    specialty === "comercio" ||
    key.includes("comerc") ||
    key.includes("varej")
  )
    return "comercio";
  if (
    specialty === "imobiliario" ||
    key.includes("imobil") ||
    key.includes("imovel")
  )
    return "imobiliario";
  if (specialty === "consultoria" || key.includes("consult"))
    return "consultoria";
  if (key.includes("educa")) return "educacao";

  return "generico";
}
