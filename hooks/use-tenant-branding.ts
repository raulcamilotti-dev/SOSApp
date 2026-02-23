/**
 * Hook to resolve tenant branding from the current domain context.
 *
 * On a Radul platform root domain (app.radul.com.br, localhost):
 *   → returns Radul defaults (name: "Radul", primaryColor: "#2563eb")
 *
 * On a tenant domain (subdomain or custom domain):
 *   → fetches tenant from api_crud → extracts config.brand
 *   → returns tenant-specific name + primary_color
 *
 * Usage:
 *   const { brandName, primaryColor, isPlatformRoot, loading } = useTenantBranding();
 */

import { buildTenantContextPayload } from "@/core/auth/tenant-context";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TenantBranding {
  /** Display name — "Radul" for platform root, tenant's brand name otherwise */
  brandName: string;
  /** Primary accent color (hex) */
  primaryColor: string;
  /** Darker shade of primary for pressed states */
  primaryDark: string;
  /** Lighter shade of primary for backgrounds */
  primaryLight: string;
  /** Whether this is the main Radul platform (not a specific tenant) */
  isPlatformRoot: boolean;
  /** True while still resolving tenant info */
  loading: boolean;
  /** Full tenant company name (may differ from brandName if config.brand.name is set) */
  companyName: string | null;
  /** Tenant subtitle/tagline — null for platform root */
  subtitle: string | null;
}

/* ------------------------------------------------------------------ */
/*  Radul defaults                                                     */
/* ------------------------------------------------------------------ */

const RADUL_BRAND: Omit<TenantBranding, "loading"> = {
  brandName: "Radul",
  primaryColor: "#2563eb",
  primaryDark: "#1d4ed8",
  primaryLight: "#dbeafe",
  isPlatformRoot: true,
  companyName: null,
  subtitle: "Plataforma de Operações",
};

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
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
        const hex = Math.max(0, Math.min(255, Math.round(c))).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
}

/** Darken a hex color by a percentage (0-1) */
function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r * (1 - amount),
    rgb.g * (1 - amount),
    rgb.b * (1 - amount),
  );
}

/** Lighten a hex color by mixing with white */
function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useTenantBranding(): TenantBranding {
  const [branding, setBranding] = useState<Omit<TenantBranding, "loading">>({
    ...RADUL_BRAND,
  });
  const [loading, setLoading] = useState(true);

  const tenantContext = useMemo(() => buildTenantContextPayload(), []);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        // Platform root → use Radul defaults
        if (tenantContext.is_platform_root) {
          if (!cancelled) {
            setBranding({ ...RADUL_BRAND });
            setLoading(false);
          }
          return;
        }

        const slug = (
          tenantContext.tenant_slug ??
          tenantContext.tenant_subdomain ??
          ""
        )
          .toLowerCase()
          .trim();
        const hostname = (tenantContext.hostname ?? "").toLowerCase().trim();

        // No hint → Radul defaults (native app without tenant context)
        if (!slug && !hostname) {
          if (!cancelled) {
            setBranding({ ...RADUL_BRAND });
            setLoading(false);
          }
          return;
        }

        // Try slug match
        let tenant: any = null;
        if (slug) {
          try {
            const res = await api.post(CRUD_ENDPOINT, {
              action: "list",
              table: "tenants",
              ...buildSearchParams([
                { field: "slug", value: slug, operator: "equal" },
              ]),
            });
            const tenants = normalizeCrudList<any>(res.data).filter(
              (t: any) => !t.deleted_at,
            );
            if (tenants.length > 0) tenant = tenants[0];
          } catch {
            /* continue */
          }
        }

        // Try custom domains match
        if (!tenant && hostname) {
          try {
            const res = await api.post(CRUD_ENDPOINT, {
              action: "list",
              table: "tenants",
            });
            const allTenants = normalizeCrudList<any>(res.data).filter(
              (t: any) => !t.deleted_at,
            );
            for (const t of allTenants) {
              const domains = parseDomains(t.custom_domains);
              if (domains.some((d: string) => d === hostname)) {
                tenant = t;
                break;
              }
            }
          } catch {
            /* continue */
          }
        }

        if (!tenant || cancelled) {
          if (!cancelled) {
            setBranding({ ...RADUL_BRAND });
            setLoading(false);
          }
          return;
        }

        // Extract branding from tenant config
        const config = parseConfig(tenant.config);
        const brand = config?.brand ?? {};
        const primaryColor = validHex(brand.primary_color) ?? "#2563eb";

        if (!cancelled) {
          setBranding({
            brandName:
              brand.name || tenant.company_name || RADUL_BRAND.brandName,
            primaryColor,
            primaryDark: darken(primaryColor, 0.15),
            primaryLight: lighten(primaryColor, 0.85),
            isPlatformRoot: false,
            companyName: tenant.company_name ?? null,
            subtitle: tenant.company_name
              ? `Área de ${tenant.company_name}`
              : null,
          });
        }
      } catch {
        // Best-effort — fallback to Radul defaults
        if (!cancelled) setBranding({ ...RADUL_BRAND });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolve();

    return () => {
      cancelled = true;
    };
  }, [tenantContext]);

  return { ...branding, loading };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseConfig(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null)
    return value as Record<string, any>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function parseDomains(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map((v) => String(v).toLowerCase().trim()).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed))
        return parsed
          .map((v: unknown) => String(v).toLowerCase().trim())
          .filter(Boolean);
    } catch {
      return value.trim() ? [value.toLowerCase().trim()] : [];
    }
  }
  return [];
}

function validHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : null;
}

/* ------------------------------------------------------------------ */
/*  Theme-aware color getters                                          */
/* ------------------------------------------------------------------ */

/** Returns auth screen colors that adapt to light/dark mode + tenant branding */
export function getAuthColors(
  primaryColor: string,
  primaryDark: string,
  primaryLight: string,
) {
  const isDark = Appearance.getColorScheme() === "dark";

  return {
    // Backgrounds
    screenBg: isDark ? "#0f172a" : "#f0f4ff",
    cardBg: isDark ? "#1e293b" : "#ffffff",
    inputBg: isDark ? "#0f172a" : "#f8fafc",

    // Text
    heading: isDark ? "#f1f5f9" : "#0f172a",
    body: isDark ? "#cbd5e1" : "#475569",
    muted: isDark ? "#64748b" : "#94a3b8",
    inputText: isDark ? "#e2e8f0" : "#1e293b",
    placeholder: isDark ? "#475569" : "#94a3b8",

    // Borders
    border: isDark ? "#334155" : "#e2e8f0",
    inputBorder: isDark ? "#334155" : "#cbd5e1",
    inputFocusBorder: primaryColor,

    // Brand colors
    primary: primaryColor,
    primaryDark,
    primaryLight: isDark ? `${primaryColor}20` : primaryLight,
    primaryText: "#ffffff",

    // Buttons
    googleBg: isDark ? "#1e293b" : "#ffffff",
    googleBorder: isDark ? "#334155" : "#e2e8f0",
    googleText: isDark ? "#e2e8f0" : "#1e293b",
    govBrBg: "#1351B4",
    govBrText: "#ffffff",

    // Errors
    error: "#ef4444",
    errorBg: isDark ? "#451a1a" : "#fef2f2",

    // Shadows
    shadow: isDark ? "rgba(0,0,0,0.4)" : "rgba(37,99,235,0.08)",
  };
}
