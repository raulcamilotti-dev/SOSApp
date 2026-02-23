/**
 * Marketplace Service
 *
 * Public-facing catalog queries, search, and marketplace configuration.
 * This service handles all READ operations for the online store.
 * No auth required for browsing.
 *
 * Tables: services, service_categories, tenants, partners
 * Depends on: services/crud.ts, services/api.ts
 */

import { api } from "./api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
  type CrudFilter,
} from "./crud";
import type { QuoteItemInput } from "./quotes";

/* ───────────────────────────────────────────────────────────────── */
/* Performance Logging Utility                                        */
/* ───────────────────────────────────────────────────────────────── */

const PERF_DEBUG = __DEV__; // Enable only in dev mode

type PerfContext = {
  startTime: number;
  lastMark?: number;
  logs: { timestamp: number; message: string }[];
};

function createPerfContext(): PerfContext {
  return {
    startTime: performance.now(),
    logs: [],
  };
}

function markPerfStep(ctx: PerfContext, stepName: string, details?: string) {
  const now = performance.now();
  const elapsed = now - ctx.startTime;
  const sinceLast = ctx.lastMark ? now - ctx.lastMark : elapsed;

  const message = `[${elapsed.toFixed(2)}ms, +${sinceLast.toFixed(2)}ms] ${stepName}${details ? ` — ${details}` : ""}`;
  ctx.logs.push({ timestamp: now, message });
  ctx.lastMark = now;

  if (PERF_DEBUG) {
    console.log(`[MARKETPLACE_PERF] ${message}`);
  }
}

function getPerfReport(ctx: PerfContext, functionName: string): string {
  const totalMs = performance.now() - ctx.startTime;
  return `[${functionName}] Total: ${totalMs.toFixed(2)}ms\n${ctx.logs.map((l) => `  • ${l.message}`).join("\n")}`;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A product/service visible on the public marketplace */
export interface MarketplaceProduct {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  slug: string;
  item_kind: "product" | "service";
  category_id?: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  sell_price: number;
  online_price: number | null;
  /** Effective price: online_price ?? sell_price */
  price: number;
  image_url?: string | null;
  sku?: string | null;
  track_stock: boolean;
  stock_quantity: number;
  is_composition: boolean;
  weight_grams: number;
  dimension_length_cm: number;
  dimension_width_cm: number;
  dimension_height_cm: number;
  commission_percent: number;
  unit_id?: string | null;
  unit_name?: string | null;
  duration_minutes?: number | null;
  requires_scheduling?: boolean;
  sort_order: number;
  /** Pricing model: 'fixed' = normal price, 'quote' = requires quote */
  pricing_type: "fixed" | "quote";
  /** Linked quote template ID (used when pricing_type = 'quote') */
  quote_template_id?: string | null;
  /** FK to service_types — required when creating service_orders */
  service_type_id?: string | null;
}

/** Marketplace configuration stored in tenants.config.marketplace */
export interface MarketplaceConfig {
  enabled: boolean;
  commission_percent: number;
  pix_key?: string | null;
  pix_key_type?: string | null;
  pix_merchant_name?: string | null;
  pix_merchant_city?: string | null;
  min_order_value: number;
  free_shipping_above?: number | null;
  default_partner_id?: string | null;
  correios_cep_origin?: string | null;
  banner_url?: string | null;
  about_text?: string | null;
}

/** Category for the public marketplace */
export interface MarketplaceCategory {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  product_count: number;
}

/** Result from marketplace search */
export interface MarketplaceSearchResult {
  products: MarketplaceProduct[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Tenant marketplace info for the public store header */
export interface MarketplaceTenantInfo {
  tenant_id: string;
  company_name: string;
  slug: string;
  brand_name?: string | null;
  primary_color?: string | null;
  marketplace: MarketplaceConfig;
}

const DEFAULT_MARKETPLACE_CONFIG: MarketplaceConfig = {
  enabled: false,
  commission_percent: 0,
  min_order_value: 0,
};

/* ------------------------------------------------------------------ */
/*  Slug generation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Generate a URL-safe slug from product name.
 * Reuses the same logic as tenant slug generation.
 */
export function generateProductSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/* ------------------------------------------------------------------ */
/*  Tenant / Config Resolution                                         */
/* ------------------------------------------------------------------ */

/**
 * Resolve tenant marketplace info from a tenant slug.
 * Used by public routes to load the store header and verify marketplace is enabled.
 */
export async function getMarketplaceTenantInfo(
  tenantSlug: string,
): Promise<MarketplaceTenantInfo | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([{ field: "slug", value: tenantSlug }], {
        autoExcludeDeleted: true,
        limit: 1,
      }),
    });
    const tenants = normalizeCrudList<Record<string, unknown>>(res.data);
    if (tenants.length === 0) return null;

    const tenant = tenants[0];
    const config =
      typeof tenant.config === "object" && tenant.config
        ? (tenant.config as Record<string, unknown>)
        : {};
    const brand = (config.brand as Record<string, unknown>) ?? {};
    const marketplace = (config.marketplace as Record<string, unknown>) ?? {};

    const mktConfig: MarketplaceConfig = {
      enabled: Boolean(marketplace.enabled),
      commission_percent: Number(marketplace.commission_percent ?? 0),
      pix_key: marketplace.pix_key ? String(marketplace.pix_key) : null,
      pix_key_type: marketplace.pix_key_type
        ? String(marketplace.pix_key_type)
        : null,
      pix_merchant_name: marketplace.pix_merchant_name
        ? String(marketplace.pix_merchant_name)
        : null,
      pix_merchant_city: marketplace.pix_merchant_city
        ? String(marketplace.pix_merchant_city)
        : null,
      min_order_value: Number(marketplace.min_order_value ?? 0),
      free_shipping_above: marketplace.free_shipping_above
        ? Number(marketplace.free_shipping_above)
        : null,
      default_partner_id: marketplace.default_partner_id
        ? String(marketplace.default_partner_id)
        : null,
      correios_cep_origin: marketplace.correios_cep_origin
        ? String(marketplace.correios_cep_origin)
        : null,
      banner_url: marketplace.banner_url
        ? String(marketplace.banner_url)
        : null,
      about_text: marketplace.about_text
        ? String(marketplace.about_text)
        : null,
    };

    return {
      tenant_id: String(tenant.id),
      company_name: String(tenant.company_name ?? ""),
      slug: String(tenant.slug ?? ""),
      brand_name: brand.name ? String(brand.name) : null,
      primary_color: brand.primary_color ? String(brand.primary_color) : null,
      marketplace: mktConfig,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Catalog Queries (Public)                                           */
/* ------------------------------------------------------------------ */

function mapProduct(
  item: Record<string, unknown>,
  category?: Record<string, unknown> | null,
): MarketplaceProduct {
  const sellPrice = Number(item.sell_price ?? 0);
  const onlinePrice =
    item.online_price != null ? Number(item.online_price) : null;
  return {
    id: String(item.id),
    tenant_id: String(item.tenant_id ?? ""),
    name: String(item.name ?? ""),
    description: item.description ? String(item.description) : null,
    slug: String(item.slug ?? ""),
    item_kind: String(item.item_kind ?? "product") as "product" | "service",
    category_id: item.category_id ? String(item.category_id) : null,
    category_name: category ? String(category.name ?? "") : null,
    category_slug: category
      ? category.slug
        ? String(category.slug)
        : null
      : null,
    sell_price: sellPrice,
    online_price: onlinePrice,
    price: onlinePrice ?? sellPrice,
    image_url: item.image_url ? String(item.image_url) : null,
    sku: item.sku ? String(item.sku) : null,
    track_stock: Boolean(item.track_stock),
    stock_quantity: Number(item.stock_quantity ?? 0),
    is_composition: Boolean(item.is_composition),
    weight_grams: Number(item.weight_grams ?? 0),
    dimension_length_cm: Number(item.dimension_length_cm ?? 0),
    dimension_width_cm: Number(item.dimension_width_cm ?? 0),
    dimension_height_cm: Number(item.dimension_height_cm ?? 0),
    commission_percent: Number(item.commission_percent ?? 0),
    unit_id: item.unit_id ? String(item.unit_id) : null,
    unit_name: null, // resolved separately if needed
    duration_minutes: item.duration_minutes
      ? Number(item.duration_minutes)
      : null,
    requires_scheduling: Boolean(item.requires_scheduling),
    sort_order: Number(item.sort_order ?? 0),
    pricing_type: String(item.pricing_type ?? "fixed") as "fixed" | "quote",
    quote_template_id: item.quote_template_id
      ? String(item.quote_template_id)
      : null,
    service_type_id: item.service_type_id ? String(item.service_type_id) : null,
  };
}

/**
 * List published products for a tenant's marketplace.
 * Supports pagination, category filtering, search, and price sorting.
 */
export async function listMarketplaceProducts(params: {
  tenantId: string;
  categoryId?: string;
  search?: string;
  sortBy?: "price_asc" | "price_desc" | "name" | "newest";
  page?: number;
  pageSize?: number;
  itemKind?: "product" | "service";
}): Promise<MarketplaceSearchResult> {
  const perf = createPerfContext();

  try {
    const {
      tenantId,
      categoryId,
      search,
      sortBy = "name",
      page = 1,
      pageSize = 20,
    } = params;

    markPerfStep(
      perf,
      "START listMarketplaceProducts",
      `tenantId=${tenantId}, page=${page}, pageSize=${pageSize}`,
    );

    const filters: CrudFilter[] = [
      { field: "tenant_id", value: tenantId },
      { field: "is_published", value: "true", operator: "equal" },
    ];

    if (categoryId) {
      filters.push({ field: "category_id", value: categoryId });
    }

    if (params.itemKind) {
      filters.push({ field: "item_kind", value: params.itemKind });
    }

    if (search?.trim()) {
      filters.push({
        field: "name",
        value: `%${search.trim()}%`,
        operator: "ilike",
      });
    }

    markPerfStep(
      perf,
      "Filters built",
      `count=${filters.length}, search=${search ? "yes" : "no"}`,
    );

    let sortColumn = "sort_order ASC, name ASC";
    switch (sortBy) {
      case "price_asc":
        sortColumn = "sell_price ASC";
        break;
      case "price_desc":
        sortColumn = "sell_price DESC";
        break;
      case "newest":
        sortColumn = "created_at DESC";
        break;
      case "name":
      default:
        sortColumn = "name ASC";
        break;
    }

    markPerfStep(perf, "Sort column determined", `sortBy=${sortBy}`);

    const offset = (page - 1) * pageSize;

    markPerfStep(perf, "Pagination calculated", `offset=${offset}`);

    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "services",
      ...buildSearchParams(filters, {
        sortColumn,
        limit: pageSize + 1, // fetch 1 extra to check hasMore
        offset,
        autoExcludeDeleted: true,
      }),
    });

    markPerfStep(
      perf,
      "Products API call complete",
      `raw_count=${Array.isArray(res.data) ? res.data.length : 0}`,
    );

    const rawItems = normalizeCrudList<Record<string, unknown>>(res.data);
    const hasMore = rawItems.length > pageSize;
    const items = hasMore ? rawItems.slice(0, pageSize) : rawItems;

    markPerfStep(
      perf,
      "Products normalized",
      `items=${items.length}, hasMore=${hasMore}`,
    );

    // Batch-resolve categories
    const categoryIds = [
      ...new Set(items.map((i) => String(i.category_id ?? "")).filter(Boolean)),
    ];

    markPerfStep(
      perf,
      "Category IDs extracted",
      `unique_categories=${categoryIds.length}`,
    );

    const categoryMap = new Map<string, Record<string, unknown>>();

    if (categoryIds.length > 0) {
      try {
        const catRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_categories",
          ...buildSearchParams(
            [{ field: "id", value: categoryIds.join(","), operator: "in" }],
            { autoExcludeDeleted: true },
          ),
        });

        markPerfStep(
          perf,
          "Categories API call complete",
          `fetched=${Array.isArray(catRes.data) ? catRes.data.length : 0}`,
        );

        const cats = normalizeCrudList<Record<string, unknown>>(catRes.data);
        cats.forEach((cat) => categoryMap.set(String(cat.id), cat));

        markPerfStep(
          perf,
          "Category map built",
          `total_categories=${categoryMap.size}`,
        );
      } catch (catErr) {
        markPerfStep(
          perf,
          "Category fetch failed (degrading gracefully)",
          String(catErr),
        );
        // Categories are optional — degrade gracefully
      }
    }

    const products = items.map((item) => {
      const catId = String(item.category_id ?? "");
      const cat = catId ? (categoryMap.get(catId) ?? null) : null;
      return mapProduct(item, cat);
    });

    markPerfStep(perf, "Products mapped", `final_count=${products.length}`);

    if (PERF_DEBUG) {
      console.log(`\n${getPerfReport(perf, "listMarketplaceProducts")}\n`);
    }

    return {
      products,
      total: -1, // We don't have total count with this pagination approach
      page,
      pageSize,
      hasMore,
    };
  } catch (error) {
    if (PERF_DEBUG) {
      console.error(
        `\n${getPerfReport(perf, "listMarketplaceProducts")}\nERROR: ${error}\n`,
      );
    }
    throw error;
  }
}

/**
 * Get a single published product by its slug.
 */
export async function getMarketplaceProductBySlug(
  tenantId: string,
  productSlug: string,
): Promise<MarketplaceProduct | null> {
  const perf = createPerfContext();

  try {
    markPerfStep(
      perf,
      "START getMarketplaceProductBySlug",
      `slug=${productSlug}`,
    );

    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "services",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "slug", value: productSlug },
          { field: "is_published", value: "true", operator: "equal" },
        ],
        { autoExcludeDeleted: true, limit: 1 },
      ),
    });
    const items = normalizeCrudList<Record<string, unknown>>(res.data);
    markPerfStep(perf, "Fetched product by slug", `found=${items.length > 0}`);

    if (items.length === 0) {
      markPerfStep(perf, "Product not found");
      return null;
    }

    const item = items[0];

    // Resolve category
    let cat: Record<string, unknown> | null = null;
    if (item.category_id) {
      markPerfStep(perf, "Fetching category", `categoryId=${item.category_id}`);

      try {
        const catRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "service_categories",
          ...buildSearchParams([
            { field: "id", value: String(item.category_id) },
          ]),
        });
        const cats = normalizeCrudList<Record<string, unknown>>(catRes.data);
        cat = cats[0] ?? null;
        markPerfStep(perf, "Category resolved", `found=${cat !== null}`);
      } catch (catError) {
        if (PERF_DEBUG)
          console.log(
            `[getMarketplaceProductBySlug] Category fetch failed:`,
            catError,
          );
        // Ignore
      }
    }

    const result = mapProduct(item, cat);
    markPerfStep(perf, "Finished mapping product");

    if (PERF_DEBUG) {
      console.log(`\n${getPerfReport(perf, "getMarketplaceProductBySlug")}\n`);
    }

    return result;
  } catch (error) {
    if (PERF_DEBUG) {
      console.error(
        `\n${getPerfReport(perf, "getMarketplaceProductBySlug")}\nERROR: ${error}\n`,
      );
    }
    return null;
  }
}

/**
 * Get a single published product by its ID.
 */
export async function getMarketplaceProductById(
  tenantId: string,
  productId: string,
): Promise<MarketplaceProduct | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "services",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "id", value: productId },
          { field: "is_published", value: "true", operator: "equal" },
        ],
        { autoExcludeDeleted: true, limit: 1 },
      ),
    });
    const items = normalizeCrudList<Record<string, unknown>>(res.data);
    if (items.length === 0) return null;
    return mapProduct(items[0], null);
  } catch {
    return null;
  }
}

/**
 * List categories that have published products (for the store navigation).
 */
export async function listMarketplaceCategories(
  tenantId: string,
): Promise<MarketplaceCategory[]> {
  const perf = createPerfContext();

  try {
    // ✅ Step 1: Get all categories for the tenant
    markPerfStep(
      perf,
      "START listMarketplaceCategories",
      `tenantId=${tenantId}`,
    );

    const catRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_categories",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "is_active", value: "true", operator: "equal" },
        ],
        { sortColumn: "sort_order ASC, name ASC", autoExcludeDeleted: true },
      ),
    });
    const categories = normalizeCrudList<Record<string, unknown>>(catRes.data);
    markPerfStep(perf, "Fetched categories", `count=${categories.length}`);

    if (categories.length === 0) {
      markPerfStep(perf, "No categories found, returning empty");
      return [];
    }

    // ✅ Step 2: Get ALL product counts in ONE aggregation query (GROUP BY category_id)
    // Instead of 1 + N sequential COUNT queries, this does 1 aggregation query
    markPerfStep(perf, "Making aggregate query for product counts");

    const countRes = await api.post(CRUD_ENDPOINT, {
      action: "aggregate",
      table: "services",
      aggregates: [{ function: "COUNT", field: "id", alias: "product_count" }],
      group_by: "category_id",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "is_published", value: "true", operator: "equal" },
        ],
        { autoExcludeDeleted: true },
      ),
    });
    markPerfStep(perf, "Aggregate query complete");

    // ✅ Step 3: Build map of category_id → count for O(1) lookup
    const countMap = new Map<string, number>();
    const countData = normalizeCrudList<Record<string, unknown>>(countRes.data);
    countData.forEach((row) => {
      const catId = String(row.category_id ?? "");
      const count = Number(row.product_count ?? 0);
      if (catId && count > 0) {
        countMap.set(catId, count);
      }
    });
    markPerfStep(perf, "Built count map", `entries=${countMap.size}`);

    // ✅ Step 4: Reconstruct result with product counts from map
    const result: MarketplaceCategory[] = [];
    categories.forEach((cat) => {
      const catId = String(cat.id);
      const count = countMap.get(catId) ?? 0;
      if (count > 0) {
        result.push({
          id: catId,
          name: String(cat.name ?? ""),
          slug: cat.slug ? String(cat.slug) : null,
          description: cat.description ? String(cat.description) : null,
          color: cat.color ? String(cat.color) : null,
          icon: cat.icon ? String(cat.icon) : null,
          product_count: count,
        });
      }
    });
    markPerfStep(perf, "Reconstructed result", `categories=${result.length}`);

    if (PERF_DEBUG) {
      console.log(`\n${getPerfReport(perf, "listMarketplaceCategories")}\n`);
    }

    return result;
  } catch (error) {
    if (PERF_DEBUG) {
      console.error(
        `\n${getPerfReport(perf, "listMarketplaceCategories")}\nERROR: ${error}\n`,
      );
    }
    return [];
  }
}

/**
 * Get composition children for a product (kit details).
 */
export async function getProductCompositionChildren(
  productId: string,
): Promise<{ id: string; name: string; quantity: number; price: number }[]> {
  const perf = createPerfContext();

  try {
    markPerfStep(
      perf,
      "START getProductCompositionChildren",
      `productId=${productId}`,
    );

    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_compositions",
      ...buildSearchParams([{ field: "parent_service_id", value: productId }]),
    });
    const compositions = normalizeCrudList<Record<string, unknown>>(res.data);
    markPerfStep(perf, "Fetched compositions", `count=${compositions.length}`);

    // Collect all unique child IDs (avoid N+1)
    const childIds = Array.from(
      new Set(
        compositions
          .map((comp) => String(comp.child_service_id ?? ""))
          .filter((id) => id.trim()),
      ),
    );
    markPerfStep(perf, "Deduped child IDs", `unique=${childIds.length}`);

    if (childIds.length === 0) {
      markPerfStep(perf, "No children found");
      return [];
    }

    // Batch fetch all children in 1 request via "in" operator
    try {
      markPerfStep(perf, "Making batch fetch for children");

      const childRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "services",
        ...buildSearchParams([
          { field: "id", value: childIds.join(","), operator: "in" },
        ]),
      });
      const childServices = normalizeCrudList<Record<string, unknown>>(
        childRes.data,
      );
      markPerfStep(
        perf,
        "Batch fetch complete",
        `fetched=${childServices.length}`,
      );

      // Build a map for quick lookup
      const serviceMap = new Map(childServices.map((s) => [String(s.id), s]));
      markPerfStep(perf, "Built service map", `entries=${serviceMap.size}`);

      // Reconstruct results in original composition order, matching quantity from composition
      const children: {
        id: string;
        name: string;
        quantity: number;
        price: number;
      }[] = [];
      for (const comp of compositions) {
        const childId = String(comp.child_service_id ?? "");
        const child = serviceMap.get(childId);
        if (child) {
          const onlinePrice =
            child.online_price != null ? Number(child.online_price) : null;
          children.push({
            id: childId,
            name: String(child.name ?? ""),
            quantity: Number(comp.quantity ?? 1),
            price: onlinePrice ?? Number(child.sell_price ?? 0),
          });
        }
      }
      markPerfStep(perf, "Reconstructed children", `result=${children.length}`);

      if (PERF_DEBUG) {
        console.log(
          `\n${getPerfReport(perf, "getProductCompositionChildren")}\n`,
        );
      }

      return children;
    } catch (innerError) {
      if (PERF_DEBUG) {
        console.error(
          `[getProductCompositionChildren batch error] ${innerError}`,
        );
      }
      return [];
    }
  } catch (error) {
    if (PERF_DEBUG) {
      console.error(
        `\n${getPerfReport(perf, "getProductCompositionChildren")}\nERROR: ${error}\n`,
      );
    }
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Admin: Marketplace Config                                          */
/* ------------------------------------------------------------------ */

/**
 * Read the marketplace configuration for a tenant.
 */
export async function getMarketplaceConfig(
  tenantId: string,
): Promise<MarketplaceConfig> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([{ field: "id", value: tenantId }]),
    });
    const tenants = normalizeCrudList<Record<string, unknown>>(res.data);
    if (tenants.length === 0) return { ...DEFAULT_MARKETPLACE_CONFIG };

    const config =
      typeof tenants[0].config === "object" && tenants[0].config
        ? (tenants[0].config as Record<string, unknown>)
        : {};
    const marketplace = (config.marketplace as Record<string, unknown>) ?? {};

    return {
      enabled: Boolean(marketplace.enabled),
      commission_percent: Number(marketplace.commission_percent ?? 0),
      pix_key: marketplace.pix_key ? String(marketplace.pix_key) : null,
      pix_key_type: marketplace.pix_key_type
        ? String(marketplace.pix_key_type)
        : null,
      pix_merchant_name: marketplace.pix_merchant_name
        ? String(marketplace.pix_merchant_name)
        : null,
      pix_merchant_city: marketplace.pix_merchant_city
        ? String(marketplace.pix_merchant_city)
        : null,
      min_order_value: Number(marketplace.min_order_value ?? 0),
      free_shipping_above: marketplace.free_shipping_above
        ? Number(marketplace.free_shipping_above)
        : null,
      default_partner_id: marketplace.default_partner_id
        ? String(marketplace.default_partner_id)
        : null,
      correios_cep_origin: marketplace.correios_cep_origin
        ? String(marketplace.correios_cep_origin)
        : null,
      banner_url: marketplace.banner_url
        ? String(marketplace.banner_url)
        : null,
      about_text: marketplace.about_text
        ? String(marketplace.about_text)
        : null,
    };
  } catch {
    return { ...DEFAULT_MARKETPLACE_CONFIG };
  }
}

/**
 * Update the marketplace configuration for a tenant.
 * Merges into tenants.config.marketplace JSONB.
 */
export async function updateMarketplaceConfig(
  tenantId: string,
  updates: Partial<MarketplaceConfig>,
): Promise<void> {
  // Read current config
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "tenants",
    ...buildSearchParams([{ field: "id", value: tenantId }]),
  });
  const tenants = normalizeCrudList<Record<string, unknown>>(res.data);
  if (tenants.length === 0) throw new Error("Tenant não encontrado");

  const currentConfig =
    typeof tenants[0].config === "object" && tenants[0].config
      ? (tenants[0].config as Record<string, unknown>)
      : {};

  const currentMarketplace =
    (currentConfig.marketplace as Record<string, unknown>) ?? {};

  const newConfig = {
    ...currentConfig,
    marketplace: {
      ...currentMarketplace,
      ...updates,
    },
  };

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "tenants",
    payload: {
      id: tenantId,
      config: newConfig,
    },
  });
}

/**
 * Toggle the is_published flag on a product/service.
 * Also auto-generates a slug if one doesn't exist.
 */
export async function toggleProductPublished(
  productId: string,
  published: boolean,
  slug?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    id: productId,
    is_published: published,
  };

  if (published && slug) {
    payload.slug = slug;
  }

  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "services",
    payload,
  });
}

/**
 * Update online-specific fields for a product.
 */
export async function updateProductMarketplaceFields(
  productId: string,
  fields: {
    online_price?: number | null;
    slug?: string;
    is_published?: boolean;
    weight_grams?: number;
    dimension_length_cm?: number;
    dimension_width_cm?: number;
    dimension_height_cm?: number;
  },
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "services",
    payload: {
      id: productId,
      ...fields,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Marketplace Quote Request                                          */
/* ------------------------------------------------------------------ */

export interface MarketplaceQuoteRequest {
  tenantId: string;
  serviceId: string;
  serviceName: string;
  quoteTemplateId?: string | null;
  /** Description / notes from the customer */
  customerNotes?: string;
  /** User ID of the requesting customer */
  userId: string;
  /** FK to service_types — required for creating the service_order */
  serviceTypeId?: string | null;
}

export interface MarketplaceQuoteResult {
  serviceOrderId: string;
  quoteId: string;
  quoteToken: string;
  /** Public URL for the quote */
  publicUrl: string;
}

/**
 * Request a quote for a marketplace product/service.
 *
 * Flow:
 * 1. Creates a service_order (status: "active") linked to the service
 * 2. If a quote_template is linked, applies it to pre-fill items
 * 3. Creates a quote (status: "draft") with the template items (or empty)
 * 4. Returns the quote token + public URL
 */
export async function requestMarketplaceQuote(
  params: MarketplaceQuoteRequest,
): Promise<MarketplaceQuoteResult> {
  // Lazy imports to avoid circular deps
  const { createServiceOrder } = await import("./service-orders");
  const { createQuote } = await import("./quotes");
  const { getQuoteTemplateById, applyTemplateToQuote } =
    await import("./quote-templates");

  // 1. Resolve service_type_id — required NOT NULL column.
  // Use the value from params if provided; otherwise, look it up from the service record.
  let serviceTypeId = params.serviceTypeId;
  if (!serviceTypeId) {
    try {
      const svcRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "services",
        ...buildSearchParams([{ field: "id", value: params.serviceId }], {
          limit: 1,
          fields: ["id", "service_type_id"],
        }),
      });
      const svcs = normalizeCrudList<{ id: string; service_type_id?: string }>(
        svcRes.data,
      );
      serviceTypeId = svcs[0]?.service_type_id ?? null;
    } catch {
      // Lookup failed — will fall through to the guard below
    }
  }
  if (!serviceTypeId) {
    throw new Error(
      "Não foi possível determinar o tipo de serviço (service_type_id).",
    );
  }

  // 2. Create a service order
  const so = await createServiceOrder({
    tenant_id: params.tenantId,
    service_id: params.serviceId,
    service_type_id: serviceTypeId,
    title: `Orçamento — ${params.serviceName}`,
    description: params.customerNotes || null,
    process_status: "active",
    started_at: new Date().toISOString(),
    created_by: params.userId,
  });

  // 2. Resolve template items (if any)
  let items: QuoteItemInput[] = [];
  let discount = 0;
  let validDays = 30;
  let notes: string | null = null;

  if (params.quoteTemplateId) {
    try {
      const template = await getQuoteTemplateById(params.quoteTemplateId);
      if (template) {
        const applied = applyTemplateToQuote(template);
        items = applied.items.map((it, idx) => ({
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          sort_order: it.sort_order ?? idx,
        }));
        discount = applied.discount;
        validDays = applied.validDays;
        notes = applied.notes;
      }
    } catch {
      // Template fetch failed — continue with empty items
    }
  }

  // If no template or template had no items, add a placeholder line
  if (items.length === 0) {
    items = [
      {
        description: params.serviceName,
        quantity: 1,
        unit_price: 0,
        sort_order: 0,
      },
    ];
  }

  // Add customer notes to quote notes
  if (params.customerNotes) {
    notes = notes
      ? `${notes}\n\nObservações do cliente: ${params.customerNotes}`
      : `Observações do cliente: ${params.customerNotes}`;
  }

  // Calculate valid_until date
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + validDays);

  // 3. Create the quote (use global api as authApi — it has interceptors)
  const quote = await createQuote(api, {
    tenantId: params.tenantId,
    serviceOrderId: so.id,
    templateId: params.quoteTemplateId || undefined,
    title: `Orçamento — ${params.serviceName}`,
    description: params.customerNotes || undefined,
    items,
    discount,
    validUntil: validUntil.toISOString(),
    notes: notes || undefined,
    createdBy: params.userId,
  });

  const publicUrl = `https://app.sosescrituras.com.br/q/${quote.token}`;

  return {
    serviceOrderId: so.id,
    quoteId: quote.id,
    quoteToken: quote.token,
    publicUrl,
  };
}
