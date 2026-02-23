/**
 * useMarketplaceTenant — Resolves marketplace tenant context from the URL.
 *
 * On web: extracts tenant slug from subdomain or path (e.g. /loja/meu-tenant).
 * On native: reads from env/config.
 *
 * Returns the tenant info, marketplace config, products, categories,
 * branding colors, and loading/error states.
 *
 * Usage:
 *   const { tenant, config, products, categories, loading, error } = useMarketplaceTenant("meu-tenant");
 */

import { buildTenantContextPayload } from "@/core/auth/tenant-context";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    getMarketplaceConfig,
    listMarketplaceCategories,
    listMarketplaceProducts,
    type MarketplaceCategory,
    type MarketplaceConfig,
    type MarketplaceProduct,
} from "@/services/marketplace";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MarketplaceTenantInfo {
  tenant_id: string;
  company_name: string;
  slug: string;
  brand_name: string;
  primary_color: string;
  primary_dark: string;
  primary_light: string;
  banner_url?: string | null;
  about_text?: string | null;
}

export interface MarketplaceTenantState {
  /** Resolved tenant info (null while loading or if not found) */
  tenant: MarketplaceTenantInfo | null;
  /** Marketplace configuration for the tenant */
  config: MarketplaceConfig | null;
  /** Published products for the store */
  products: MarketplaceProduct[];
  /** Available categories (with product counts) */
  categories: MarketplaceCategory[];
  /** True while initial data is being fetched */
  loading: boolean;
  /** True while products are being refreshed (search/filter) */
  loadingProducts: boolean;
  /** Error message if resolution or data fetch failed */
  error: string | null;
  /** Whether marketplace is enabled for this tenant */
  isEnabled: boolean;
  /** Whether this is a valid resolved tenant */
  isResolved: boolean;
  /** Partner ID from URL params (for referral tracking) */
  partnerId: string | null;
  /** Referral code from URL params */
  referralCode: string | null;
  /** UTM source from URL params */
  utmSource: string | null;
  /** UTM campaign from URL params */
  utmCampaign: string | null;
  /** Reload all marketplace data */
  reload: () => void;
  /** Search/filter products by query */
  searchProducts: (query: string) => void;
  /** Filter products by category ID (null = all) */
  filterByCategory: (categoryId: string | null) => void;
}

/* ------------------------------------------------------------------ */
/*  Color helpers (same as use-tenant-branding.ts)                     */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
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

function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r * (1 - amount),
    rgb.g * (1 - amount),
    rgb.b * (1 - amount),
  );
}

function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  );
}

function validHex(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : null;
}

function parseConfig(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null)
    return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * @param tenantSlugOverride — Explicit tenant slug (e.g., from route param).
 *   When provided, takes priority over URL-based detection.
 */
export function useMarketplaceTenant(
  tenantSlugOverride?: string,
): MarketplaceTenantState {
  /* ── State ── */
  const [tenant, setTenant] = useState<MarketplaceTenantInfo | null>(null);
  const [config, setConfig] = useState<MarketplaceConfig | null>(null);
  const [allProducts, setAllProducts] = useState<MarketplaceProduct[]>([]);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  /* ── Tenant context from URL ── */
  const tenantContext = useMemo(() => buildTenantContextPayload(), []);

  const resolvedSlug = useMemo(() => {
    if (tenantSlugOverride?.trim()) return tenantSlugOverride.trim();

    // Try from tenant context (subdomain detection)
    const contextSlug = (
      tenantContext.tenant_slug ??
      tenantContext.tenant_subdomain ??
      ""
    )
      .toLowerCase()
      .trim();

    if (contextSlug) return contextSlug;

    // Platform root: derive slug from root domain (e.g. "radul.com.br" → "radul")
    // This handles www.radul.com.br/loja, app.radul.com.br/loja, radul.com.br/loja
    if (tenantContext.is_platform_root) {
      const hostname = (tenantContext.hostname ?? "").toLowerCase();
      const DOMAIN_TLDS = new Set([
        "com",
        "br",
        "net",
        "org",
        "co",
        "io",
        "app",
        "dev",
      ]);
      const RESERVED_LABELS = new Set([
        "www",
        "app",
        "web",
        "admin",
        "api",
        "staging",
        "dev",
        "local",
        "localhost",
      ]);
      const parts = hostname.split(".").filter(Boolean);
      const meaningful = parts.filter(
        (p) => !DOMAIN_TLDS.has(p) && !RESERVED_LABELS.has(p),
      );
      if (meaningful.length > 0) return meaningful[0];
    }

    // Try extract from pathname: /loja/{slug} or /loja/{slug}/...
    const pathname = (tenantContext.pathname ?? "").toLowerCase().trim();
    const lojaMatch = pathname.match(/^\/loja\/([^/]+)/);
    if (lojaMatch?.[1]) return lojaMatch[1];

    return null;
  }, [tenantSlugOverride, tenantContext]);

  /** Tracking params from URL */
  const partnerId = tenantContext.partner_id ?? null;
  const referralCode = tenantContext.referral_code ?? null;
  const utmSource = tenantContext.utm_source ?? null;
  const utmCampaign = tenantContext.utm_campaign ?? null;

  /* ── Resolve tenant ── */
  const resolveTenant = useCallback(async (): Promise<{
    tenantId: string;
    info: MarketplaceTenantInfo;
  } | null> => {
    if (!resolvedSlug) return null;

    try {
      // Lookup tenant by slug
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams([
          { field: "slug", value: resolvedSlug, operator: "equal" },
        ]),
      });
      const tenants = normalizeCrudList<Record<string, unknown>>(
        res.data,
      ).filter((t) => !t.deleted_at);

      if (tenants.length === 0) return null;

      const t = tenants[0];
      const tenantId = String(t.id ?? "");
      if (!tenantId) return null;

      // Extract branding from config
      const cfg = parseConfig(t.config);
      const brand = (cfg?.brand ?? {}) as Record<string, unknown>;
      const primaryColor = validHex(brand.primary_color) ?? "#2563eb";
      const marketplace = (cfg?.marketplace ?? {}) as Record<string, unknown>;

      const info: MarketplaceTenantInfo = {
        tenant_id: tenantId,
        company_name: String(t.company_name ?? ""),
        slug: String(t.slug ?? resolvedSlug),
        brand_name: String(brand.name ?? t.company_name ?? "").trim() || "Loja",
        primary_color: primaryColor,
        primary_dark: darken(primaryColor, 0.15),
        primary_light: lighten(primaryColor, 0.85),
        banner_url: marketplace.banner_url
          ? String(marketplace.banner_url)
          : null,
        about_text: marketplace.about_text
          ? String(marketplace.about_text)
          : null,
      };

      return { tenantId, info };
    } catch {
      return null;
    }
  }, [resolvedSlug]);

  /* ── Load all marketplace data ── */
  const loadMarketplaceData = useCallback(async (tenantId: string) => {
    const [cfgResult, productsResult, categoriesResult] =
      await Promise.allSettled([
        getMarketplaceConfig(tenantId),
        listMarketplaceProducts({ tenantId, pageSize: 999 }),
        listMarketplaceCategories(tenantId),
      ]);

    const marketplaceConfig =
      cfgResult.status === "fulfilled" ? cfgResult.value : null;
    const productList =
      productsResult.status === "fulfilled"
        ? productsResult.value.products
        : [];
    const categoryList =
      categoriesResult.status === "fulfilled" ? categoriesResult.value : [];

    return {
      config: marketplaceConfig,
      products: productList,
      categories: categoryList,
    };
  }, []);

  /* ── Main initialization ── */
  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!resolvedSlug) {
        setError("Loja não encontrada. Verifique o endereço.");
        setTenant(null);
        setConfig(null);
        setAllProducts([]);
        setProducts([]);
        setCategories([]);
        return;
      }

      // 1. Resolve tenant
      const result = await resolveTenant();
      if (!result) {
        setError("Loja não encontrada. Verifique o endereço.");
        setTenant(null);
        setConfig(null);
        setAllProducts([]);
        setProducts([]);
        setCategories([]);
        return;
      }

      setTenant(result.info);

      // 2. Load marketplace data
      const data = await loadMarketplaceData(result.tenantId);

      setConfig(data.config);
      setAllProducts(data.products as MarketplaceProduct[]);
      setProducts(data.products as MarketplaceProduct[]);
      setCategories(data.categories);

      // 3. Validate marketplace is enabled
      if (!data.config?.enabled) {
        setError("Esta loja não está disponível no momento.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar a loja.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [resolvedSlug, resolveTenant, loadMarketplaceData]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  /* ── Search & filter (client-side for simplicity) ── */
  useEffect(() => {
    if (!allProducts.length) {
      setProducts([]);
      return;
    }

    setLoadingProducts(true);

    let filtered = [...allProducts];

    // Category filter
    if (activeCategoryId) {
      filtered = filtered.filter(
        (p) => String(p.category_id ?? "") === activeCategoryId,
      );
    }

    // Search filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((p) => {
        const haystack = [p.name, p.description, p.sku, p.category_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    setProducts(filtered);
    setLoadingProducts(false);
  }, [allProducts, searchQuery, activeCategoryId]);

  /* ── Actions ── */
  const reload = useCallback(() => {
    setSearchQuery("");
    setActiveCategoryId(null);
    initialize();
  }, [initialize]);

  const searchProducts = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const filterByCategory = useCallback((categoryId: string | null) => {
    setActiveCategoryId(categoryId);
  }, []);

  /* ── Derived state ── */
  const isEnabled = Boolean(config?.enabled);
  const isResolved = tenant !== null && !loading;

  return {
    tenant,
    config,
    products,
    categories,
    loading,
    loadingProducts,
    error,
    isEnabled,
    isResolved,
    partnerId,
    referralCode,
    utmSource,
    utmCampaign,
    reload,
    searchProducts,
    filterByCategory,
  };
}
