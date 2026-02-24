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
import {
    bootstrapMarketplace,
    listMarketplaceCategories,
    listMarketplaceProducts,
    type MarketplaceBootstrap,
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

  /* ── Main initialization (fully parallel — no sequential dependency) ── */
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

      const t0 = __DEV__ ? performance.now() : 0;

      // Fire ALL three queries in parallel — each one resolves tenant by slug
      // internally via a sub-select, so there's no need to wait for a tenant ID.
      const [bootstrapResult, productsResult, categoriesResult] =
        await Promise.allSettled([
          bootstrapMarketplace(resolvedSlug),
          listMarketplaceProducts({ tenantSlug: resolvedSlug, pageSize: 999 }),
          listMarketplaceCategories(undefined, undefined, resolvedSlug),
        ]);

      if (__DEV__) {
        const elapsed = performance.now() - t0;
        console.log(
          `[MARKETPLACE_HOOK] Parallel init done in ${elapsed.toFixed(0)}ms`,
        );
      }

      // --- Bootstrap (tenant info + config) ---
      const bootstrap: MarketplaceBootstrap | null =
        bootstrapResult.status === "fulfilled" ? bootstrapResult.value : null;

      if (!bootstrap) {
        setError("Loja não encontrada. Verifique o endereço.");
        setTenant(null);
        setConfig(null);
        setAllProducts([]);
        setProducts([]);
        setCategories([]);
        return;
      }

      setTenant(bootstrap.info as MarketplaceTenantInfo);
      setConfig(bootstrap.config);

      // --- Products ---
      const productList =
        productsResult.status === "fulfilled"
          ? productsResult.value.products
          : [];
      setAllProducts(productList as MarketplaceProduct[]);
      setProducts(productList as MarketplaceProduct[]);

      // --- Categories ---
      const categoryList =
        categoriesResult.status === "fulfilled" ? categoriesResult.value : [];
      setCategories(categoryList);

      // Validate marketplace is enabled
      if (!bootstrap.config?.enabled) {
        setError("Esta loja não está disponível no momento.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar a loja.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [resolvedSlug]);

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
