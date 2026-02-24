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
  API_DINAMICO,
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
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
/*  SQL helper: tenant filter by ID or slug                            */
/* ------------------------------------------------------------------ */

/**
 * Build a SQL clause for filtering by tenant — accepts either tenantId or tenantSlug.
 * When tenantSlug is used, a sub-select resolves the ID, allowing queries to fire
 * without first resolving the tenant in a separate round-trip.
 */
function tenantIdClause(
  tableAlias: string,
  tenantId?: string,
  tenantSlug?: string,
): string {
  if (tenantId) {
    return `${tableAlias}.tenant_id = '${tenantId}'`;
  }
  if (tenantSlug) {
    const escaped = tenantSlug.replace(/'/g, "''");
    return `${tableAlias}.tenant_id = (SELECT id FROM tenants WHERE slug = '${escaped}' AND deleted_at IS NULL LIMIT 1)`;
  }
  throw new Error("Either tenantId or tenantSlug must be provided");
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
 * Uses a single SQL query with LEFT JOIN to fetch products + category data
 * in one round-trip (replaces 2 parallel CRUD calls).
 *
 * Accepts either `tenantId` or `tenantSlug` — when slug is provided,
 * a sub-select resolves the tenant inline (no separate round-trip).
 */
export async function listMarketplaceProducts(params: {
  tenantId?: string;
  tenantSlug?: string;
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
      tenantSlug,
      categoryId,
      search,
      sortBy = "name",
      page = 1,
      pageSize = 20,
    } = params;

    markPerfStep(
      perf,
      "START listMarketplaceProducts",
      `tenantId=${tenantId ?? "slug:" + tenantSlug}, page=${page}, pageSize=${pageSize}`,
    );

    // Build WHERE clauses
    const where: string[] = [
      tenantIdClause("s", tenantId, tenantSlug),
      `s.is_published = true`,
      `s.deleted_at IS NULL`,
    ];

    if (categoryId) {
      where.push(`s.category_id = '${categoryId}'`);
    }
    if (params.itemKind) {
      where.push(`s.item_kind = '${params.itemKind}'`);
    }
    if (search?.trim()) {
      const escaped = search.trim().replace(/'/g, "''");
      where.push(`s.name ILIKE '%${escaped}%'`);
    }

    // Determine sort
    let orderBy = "s.sort_order ASC, s.name ASC";
    switch (sortBy) {
      case "price_asc":
        orderBy = "s.sell_price ASC";
        break;
      case "price_desc":
        orderBy = "s.sell_price DESC";
        break;
      case "newest":
        orderBy = "s.created_at DESC";
        break;
      case "name":
      default:
        orderBy = "s.name ASC";
        break;
    }

    const offset = (page - 1) * pageSize;

    markPerfStep(perf, "SQL built", `where=${where.length} clauses`);

    // Single query: products + category name/slug via LEFT JOIN
    const sql = `
      SELECT s.*,
             sc.name AS _cat_name,
             sc.slug AS _cat_slug
        FROM services s
        LEFT JOIN service_categories sc ON sc.id = s.category_id
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT ${pageSize + 1} OFFSET ${offset}
    `;

    markPerfStep(perf, "Executing JOIN query");

    const res = await api.post(API_DINAMICO, { sql });
    const rawItems = normalizeCrudList<Record<string, unknown>>(res.data);

    markPerfStep(perf, "Query complete", `rows=${rawItems.length}`);

    const hasMore = rawItems.length > pageSize;
    const items = hasMore ? rawItems.slice(0, pageSize) : rawItems;

    // Map rows — category fields come from the JOIN, no separate lookup needed
    const products = items.map((item) => {
      const catObj = item._cat_name
        ? { name: item._cat_name, slug: item._cat_slug }
        : null;
      return mapProduct(item, catObj as Record<string, unknown> | null);
    });

    markPerfStep(perf, "Products mapped", `final_count=${products.length}`);

    if (PERF_DEBUG) {
      console.log(`\n${getPerfReport(perf, "listMarketplaceProducts")}\n`);
    }

    return {
      products,
      total: -1,
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
 * Optimized: single SQL JOIN query instead of 2 sequential CRUD calls.
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

    const sql = `
      SELECT s.*,
             sc.name AS _cat_name,
             sc.slug AS _cat_slug
        FROM services s
        LEFT JOIN service_categories sc ON sc.id = s.category_id
       WHERE s.tenant_id = '${tenantId}'
         AND s.slug = '${productSlug}'
         AND s.is_published = true
         AND s.deleted_at IS NULL
       LIMIT 1`;

    const res = await api.post(API_DINAMICO, { sql });
    const items = normalizeCrudList<Record<string, unknown>>(res.data);
    markPerfStep(perf, "JOIN query done", `found=${items.length > 0}`);

    if (items.length === 0) {
      markPerfStep(perf, "Product not found");
      return null;
    }

    const item = items[0];
    const cat =
      item._cat_name || item._cat_slug
        ? { name: item._cat_name, slug: item._cat_slug }
        : null;

    const result = mapProduct(item, cat as Record<string, unknown> | null);
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
 *
 * Optimized: single SQL query with JOIN + COUNT instead of 2 parallel CRUD calls.
 * The `_publishedProducts` parameter is kept for backward compatibility but ignored.
 */
export async function listMarketplaceCategories(
  tenantId?: string,
  _publishedProducts?: { category_id?: string | null }[],
  tenantSlug?: string,
): Promise<MarketplaceCategory[]> {
  const perf = createPerfContext();

  try {
    markPerfStep(
      perf,
      "START listMarketplaceCategories",
      `tenantId=${tenantId ?? "slug:" + tenantSlug}`,
    );

    // Single JOIN + GROUP BY + HAVING — 1 query replaces 2 parallel CRUD calls
    const sql = `
      SELECT sc.id, sc.name, sc.slug, sc.description, sc.color, sc.icon,
             COUNT(s.id)::int AS product_count
        FROM service_categories sc
        LEFT JOIN services s
          ON s.category_id = sc.id
         AND s.is_published = true
         AND s.deleted_at IS NULL
       WHERE ${tenantIdClause("sc", tenantId, tenantSlug)}
         AND sc.is_active = true
         AND sc.deleted_at IS NULL
       GROUP BY sc.id
      HAVING COUNT(s.id) > 0
       ORDER BY sc.sort_order ASC, sc.name ASC`;

    const res = await api.post(API_DINAMICO, { sql });
    const rows = normalizeCrudList<Record<string, unknown>>(res.data);
    markPerfStep(perf, "JOIN query done", `rows=${rows.length}`);

    const result: MarketplaceCategory[] = rows.map((cat) => ({
      id: String(cat.id),
      name: String(cat.name ?? ""),
      slug: cat.slug ? String(cat.slug) : null,
      description: cat.description ? String(cat.description) : null,
      color: cat.color ? String(cat.color) : null,
      icon: cat.icon ? String(cat.icon) : null,
      product_count: Number(cat.product_count ?? 0),
    }));

    markPerfStep(perf, "Result built", `categories=${result.length}`);

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
/*  Bootstrap: single query for tenant info + config                    */
/* ------------------------------------------------------------------ */

/* Private color helpers for branding computation */
function _hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : null;
}
function _rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => {
        const v = Math.max(0, Math.min(255, Math.round(c))).toString(16);
        return v.length === 1 ? "0" + v : v;
      })
      .join("")
  );
}
function _darken(hex: string, amount: number): string {
  const rgb = _hexToRgb(hex);
  if (!rgb) return hex;
  return _rgbToHex(
    rgb.r * (1 - amount),
    rgb.g * (1 - amount),
    rgb.b * (1 - amount),
  );
}
function _lighten(hex: string, amount: number): string {
  const rgb = _hexToRgb(hex);
  if (!rgb) return hex;
  return _rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  );
}
function _validHex(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : null;
}
function _parseJsonConfig(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null)
    return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return p && typeof p === "object" ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Result of bootstrapMarketplace — has everything the hook needs from one query. */
export interface MarketplaceBootstrap {
  tenantId: string;
  info: {
    tenant_id: string;
    company_name: string;
    slug: string;
    brand_name: string;
    primary_color: string;
    primary_dark: string;
    primary_light: string;
    banner_url: string | null;
    about_text: string | null;
  };
  config: MarketplaceConfig;
}

/**
 * Bootstrap the marketplace in ONE query — returns tenant info, branding, and
 * marketplace config.  This replaces the sequential resolveTenant() +
 * getMarketplaceConfig() flow with a single round-trip.
 */
export async function bootstrapMarketplace(
  slug: string,
): Promise<MarketplaceBootstrap | null> {
  const perf = createPerfContext();
  try {
    markPerfStep(perf, "START bootstrapMarketplace", `slug=${slug}`);

    const escaped = slug.replace(/'/g, "''");
    const sql = `SELECT id, company_name, slug, config
                   FROM tenants
                  WHERE slug = '${escaped}'
                    AND deleted_at IS NULL
                  LIMIT 1`;

    const res = await api.post(API_DINAMICO, { sql });
    const rows = normalizeCrudList<Record<string, unknown>>(res.data);
    markPerfStep(perf, "Query done", `rows=${rows.length}`);

    if (rows.length === 0) return null;

    const t = rows[0];
    const tenantId = String(t.id ?? "");
    if (!tenantId) return null;

    // Parse branding from config.brand
    const cfg = _parseJsonConfig(t.config);
    const brand = (cfg?.brand ?? {}) as Record<string, unknown>;
    const primaryColor = _validHex(brand.primary_color) ?? "#2563eb";
    const marketplace = (cfg?.marketplace ?? {}) as Record<string, unknown>;

    const result: MarketplaceBootstrap = {
      tenantId,
      info: {
        tenant_id: tenantId,
        company_name: String(t.company_name ?? ""),
        slug: String(t.slug ?? slug),
        brand_name: String(brand.name ?? t.company_name ?? "").trim() || "Loja",
        primary_color: primaryColor,
        primary_dark: _darken(primaryColor, 0.15),
        primary_light: _lighten(primaryColor, 0.85),
        banner_url: marketplace.banner_url
          ? String(marketplace.banner_url)
          : null,
        about_text: marketplace.about_text
          ? String(marketplace.about_text)
          : null,
      },
      config: parseMarketplaceConfigFromRaw(t.config),
    };

    markPerfStep(perf, "Bootstrap done");
    if (PERF_DEBUG) {
      console.log(`\n${getPerfReport(perf, "bootstrapMarketplace")}\n`);
    }
    return result;
  } catch (error) {
    if (PERF_DEBUG) {
      console.error(
        `\n${getPerfReport(perf, "bootstrapMarketplace")}\nERROR: ${error}\n`,
      );
    }
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Admin: Marketplace Config                                          */
/* ------------------------------------------------------------------ */

/**
 * Parse marketplace configuration from a raw tenant config object.
 * Shared utility — avoids duplicate parsing logic between getMarketplaceConfig
 * and hooks that already have the tenant data loaded.
 */
export function parseMarketplaceConfigFromRaw(
  rawConfig: unknown,
): MarketplaceConfig {
  const config =
    typeof rawConfig === "object" && rawConfig
      ? (rawConfig as Record<string, unknown>)
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
    banner_url: marketplace.banner_url ? String(marketplace.banner_url) : null,
    about_text: marketplace.about_text ? String(marketplace.about_text) : null,
  };
}

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

    return parseMarketplaceConfigFromRaw(tenants[0].config);
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
      // Template fetch failed — continue with empty items (resolvedTemplateId stays undefined)
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
  // NOTE: Do NOT pass quoteTemplateId as templateId — quotes.template_id FK
  // references document_templates, not quote_templates.
  const quote = await createQuote(api, {
    tenantId: params.tenantId,
    serviceOrderId: so.id,
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
