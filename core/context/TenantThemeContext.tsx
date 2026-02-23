/**
 * TenantThemeContext
 *
 * Provides tenant-specific brand color overrides for the entire app.
 * Loads the tenant's `config.brand.primary_color` and derives light/dark tint variants.
 * All components using `useThemeColor({}, "tint")` or `useThemeColor({}, "primary")` will
 * automatically get the tenant's brand color instead of the default Radul blue.
 *
 * Usage:
 *   Wrap the app with <TenantThemeProvider> inside <AuthProvider>.
 *   Components call useTenantTheme() for explicit access, or just use useThemeColor
 *   which reads from this context automatically.
 */

import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TenantThemeOverrides {
  /** Light-mode tint (tenant's primary_color or default) */
  tintLight: string;
  /** Dark-mode tint (lighter variant for dark backgrounds) */
  tintDark: string;
  /** Whether custom brand is loaded */
  loaded: boolean;
  /** Force a reload (e.g. after saving new color) */
  reload: () => void;
}

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
        const h = Math.max(0, Math.min(255, Math.round(c))).toString(16);
        return h.length === 1 ? "0" + h : h;
      })
      .join("")
  );
}

/** Lighten a hex color by mixing with white (amount 0-1) */
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
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_TINT_LIGHT = "#2563eb";
const DEFAULT_TINT_DARK = "#60a5fa";

const DEFAULT_OVERRIDES: TenantThemeOverrides = {
  tintLight: DEFAULT_TINT_LIGHT,
  tintDark: DEFAULT_TINT_DARK,
  loaded: false,
  reload: () => {},
};

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const TenantThemeCtx = createContext<TenantThemeOverrides>(DEFAULT_OVERRIDES);

export function useTenantTheme(): TenantThemeOverrides {
  return useContext(TenantThemeCtx);
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function TenantThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [tintLight, setTintLight] = useState(DEFAULT_TINT_LIGHT);
  const [tintDark, setTintDark] = useState(DEFAULT_TINT_DARK);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!tenantId) {
      // No tenant — reset to defaults
      setTintLight(DEFAULT_TINT_LIGHT);
      setTintDark(DEFAULT_TINT_DARK);
      setLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tenants",
          ...buildSearchParams([{ field: "id", value: tenantId }]),
          fields: ["id", "config"],
        });
        const rows = normalizeCrudList<{ id: string; config?: any }>(res.data);
        const cfg = rows[0]?.config;
        const brandColor =
          typeof cfg === "object" && cfg?.brand?.primary_color
            ? String(cfg.brand.primary_color)
            : null;

        if (cancelled) return;

        if (brandColor && /^#[a-fA-F0-9]{6}$/.test(brandColor)) {
          setTintLight(brandColor);
          // For dark mode: lighten the brand color so it pops on dark backgrounds
          setTintDark(lighten(brandColor, 0.35));
        } else {
          setTintLight(DEFAULT_TINT_LIGHT);
          setTintDark(DEFAULT_TINT_DARK);
        }
      } catch {
        // Silently fall back to defaults
        if (!cancelled) {
          setTintLight(DEFAULT_TINT_LIGHT);
          setTintDark(DEFAULT_TINT_DARK);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadKey]);

  const value = useMemo<TenantThemeOverrides>(
    () => ({ tintLight, tintDark, loaded, reload }),
    [tintLight, tintDark, loaded, reload],
  );

  return (
    <TenantThemeCtx.Provider value={value}>{children}</TenantThemeCtx.Provider>
  );
}
