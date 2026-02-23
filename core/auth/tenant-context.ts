import Constants from "expo-constants";
import { Platform } from "react-native";

export type TenantContextPayload = {
  tenant_slug?: string;
  tenant_subdomain?: string;
  tenant_hint?: string;
  app_slug?: string;
  app_name?: string;
  host?: string;
  hostname?: string;
  pathname?: string;
  search?: string;
  partner_id?: string;
  referral_code?: string;
  utm_source?: string;
  utm_campaign?: string;
  platform?: string;
  /** True when the hostname is the main platform (app.radul.com.br) — not a tenant domain */
  is_platform_root?: boolean;
};

const RESERVED_SUBDOMAINS = new Set([
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

const DOMAIN_PART_STOPWORDS = new Set(["com", "br", "net", "org", "co", "io"]);

function normalizeHint(value: string | null | undefined): string | undefined {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized || undefined;
}

function extractTenantFromHostname(
  hostname: string,
  rootDomain: string,
): string | undefined {
  const host = normalizeHint(hostname);
  const root = normalizeHint(rootDomain);
  if (!host || !root || host === "localhost") return undefined;

  if (host === root) return undefined;

  if (host.endsWith(`.${root}`)) {
    const prefix = host.slice(0, -(root.length + 1));
    const labels = prefix.split(".").filter(Boolean);
    for (let index = labels.length - 1; index >= 0; index -= 1) {
      const label = labels[index];
      if (!RESERVED_SUBDOMAINS.has(label)) {
        return label;
      }
    }
    return undefined;
  }

  const labels = host.split(".").filter(Boolean);
  const fallback = labels.find(
    (label) =>
      !RESERVED_SUBDOMAINS.has(label) && !DOMAIN_PART_STOPWORDS.has(label),
  );
  return fallback;
}

export function buildTenantContextPayload(): TenantContextPayload {
  const extra =
    Constants.expoConfig?.extra ??
    (Constants.manifest as any)?.extra ??
    (Constants.manifest2 as any)?.extra?.expoClient?.extra ??
    (Constants.manifest2 as any)?.extra ??
    {};

  const appSlug = String(
    Constants.expoConfig?.slug ?? extra.appSlug ?? "",
  ).trim();
  const appName = String(
    Constants.expoConfig?.name ?? extra.appName ?? "",
  ).trim();
  const rootDomain =
    String(
      extra.rootDomain ??
        extra.root_domain ??
        process.env.EXPO_PUBLIC_ROOT_DOMAIN ??
        "radul.com.br",
    )
      .trim()
      .toLowerCase() || "radul.com.br";

  if (Platform.OS !== "web" || typeof window === "undefined") {
    const tenantSlug = String(
      extra.tenantSlug ??
        extra.tenant_slug ??
        process.env.EXPO_PUBLIC_TENANT_SLUG ??
        appSlug,
    ).trim();

    return {
      tenant_slug: tenantSlug || undefined,
      tenant_hint: tenantSlug || undefined,
      app_slug: appSlug || undefined,
      app_name: appName || undefined,
      platform: Platform.OS,
    };
  }

  const host = String(window.location.host ?? "").trim();
  const hostname = String(window.location.hostname ?? "").trim();
  const pathname = String(window.location.pathname ?? "").trim();
  const search = String(window.location.search ?? "").trim();
  const params = new URLSearchParams(window.location.search ?? "");

  const tenantFromHost = extractTenantFromHostname(hostname, rootDomain);
  const tenantFromQuery =
    normalizeHint(params.get("tenant")) ??
    normalizeHint(params.get("tenant_slug")) ??
    normalizeHint(params.get("tenantSubdomain")) ??
    normalizeHint(params.get("t"));
  const tenantFromEnv = normalizeHint(
    String(
      extra.tenantSlug ??
        extra.tenant_slug ??
        process.env.EXPO_PUBLIC_TENANT_SLUG ??
        "",
    ),
  );

  const tenantHint = tenantFromQuery ?? tenantFromHost ?? tenantFromEnv;

  // Detect platform root: radul.com.br bare domain or "app" subdomain
  const hostLower = hostname.toLowerCase();
  const isPlatformRoot =
    hostLower === rootDomain ||
    hostLower === `app.${rootDomain}` ||
    hostLower === `www.${rootDomain}` ||
    hostLower === "localhost";

  return {
    tenant_slug: tenantHint,
    tenant_subdomain: tenantFromHost,
    tenant_hint: tenantHint,
    app_slug: appSlug || undefined,
    app_name: appName || undefined,
    host: host || undefined,
    hostname: hostname || undefined,
    pathname: pathname || undefined,
    search: search || undefined,
    partner_id:
      normalizeHint(params.get("partner_id")) ??
      normalizeHint(params.get("partner")) ??
      normalizeHint(params.get("parceiro")) ??
      undefined,
    referral_code:
      normalizeHint(params.get("ref")) ??
      normalizeHint(params.get("referral")) ??
      normalizeHint(params.get("indicacao")) ??
      normalizeHint(params.get("source")) ??
      undefined,
    utm_source: normalizeHint(params.get("utm_source")) ?? undefined,
    utm_campaign: normalizeHint(params.get("utm_campaign")) ?? undefined,
    platform: Platform.OS,
    is_platform_root: isPlatformRoot,
  };
}
