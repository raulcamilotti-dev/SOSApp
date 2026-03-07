/* ================================================================== */
/*  Cloudflare Web Analytics — Frontend Service                        */
/*                                                                      */
/*  Calls the /analytics/query proxy endpoint on the api-crud worker.  */
/*  Provides typed helpers + multi-tenant hostname derivation.          */
/* ================================================================== */

import { api } from "@/services/api";

/* ── Constants ── */

const ANALYTICS_ENDPOINT = "/analytics/query";

/**
 * Root domain used for hostname derivation.
 * Must match the value in tenant-resolver / tenant-context.
 */
const ROOT_DOMAIN = process.env.EXPO_PUBLIC_ROOT_DOMAIN ?? "radul.com.br";

/* ── Date presets ── */

export type DatePreset = "7d" | "30d" | "90d";

export function presetToRange(preset: DatePreset): {
  start: string;
  end: string;
} {
  const now = new Date();
  const end = now.toISOString();
  const ms: Record<DatePreset, number> = {
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  const start = new Date(now.getTime() - ms[preset]).toISOString();
  return { start, end };
}

/* ── Response Types ── */

/** Overview KPI summary */
export interface WaOverview {
  totalPageViews: number;
  totalVisits: number;
  uniqueHostnames: number;
  topPage: string | null;
  topCountry: string | null;
}

/** Single timeseries data point */
export interface WaTimeseriesPoint {
  date: string;
  pageViews: number;
  visits: number;
}

/** Generic ranked item (pages, countries, browsers, devices, referrers, hosts) */
export interface WaTopItem {
  name: string;
  count: number;
}

/* ── Hostname derivation for multi-tenant scoping ── */

/**
 * Reserved subdomains that belong to the platform root tenant.
 * Any request from these hostnames maps to the Radul tenant.
 */
const ROOT_SUBDOMAINS = ["www", "app", "web", "admin"];

/**
 * Build the list of hostnames to filter analytics data for a given tenant.
 *
 * - Platform root (slug = "radul" or is_platform_root):
 *     → radul.com.br, app.radul.com.br, www.radul.com.br, web.radul.com.br
 * - Regular tenant (e.g., slug = "sosescritura"):
 *     → sosescritura.radul.com.br + any custom_domains
 *
 * @param slug       Tenant slug (e.g., "sosescritura")
 * @param isPlatformRoot  Whether this tenant is the platform owner
 * @param customDomains   Tenant's custom_domains JSONB array
 */
export function buildTenantHostnames(
  slug: string,
  isPlatformRoot = false,
  customDomains?: string[],
): string[] {
  const hostnames: string[] = [];

  if (isPlatformRoot) {
    // Platform root sees all root-level hostnames
    hostnames.push(ROOT_DOMAIN);
    for (const sub of ROOT_SUBDOMAINS) {
      hostnames.push(`${sub}.${ROOT_DOMAIN}`);
    }
  } else if (slug) {
    // Regular tenant: their subdomain (skip if slug is empty to avoid ".radul.com.br")
    hostnames.push(`${slug}.${ROOT_DOMAIN}`);
  }

  // Add custom domains if any
  if (customDomains && Array.isArray(customDomains)) {
    for (const domain of customDomains) {
      const trimmed = String(domain ?? "")
        .trim()
        .toLowerCase();
      if (trimmed && !hostnames.includes(trimmed)) {
        hostnames.push(trimmed);
      }
    }
  }

  return hostnames;
}

/* ── Base query function ── */

type AnalyticsQueryType =
  | "overview"
  | "timeseries"
  | "top_pages"
  | "countries"
  | "browsers"
  | "devices"
  | "referrers"
  | "hosts";

interface AnalyticsQueryPayload {
  type: AnalyticsQueryType;
  start: string;
  end: string;
  hostnames?: string[];
  limit?: number;
}

async function fetchAnalytics<T>(payload: AnalyticsQueryPayload): Promise<T> {
  const response = await api.post(ANALYTICS_ENDPOINT, payload);
  const body = response.data;
  // Worker wraps result in { data, type } — extract the inner data
  if (body && typeof body === "object" && "data" in body) {
    return (body as any).data as T;
  }
  return body as T;
}

/* ── Typed wrappers ── */

/** Raw shape returned by the worker for overview queries */
interface RawOverview {
  pageViews: number;
  visits: number;
  sampleInterval: number;
}

export async function getOverview(
  start: string,
  end: string,
  hostnames?: string[],
): Promise<WaOverview> {
  const raw = await fetchAnalytics<RawOverview>({
    type: "overview",
    start,
    end,
    hostnames,
  });
  return {
    totalPageViews: raw?.pageViews ?? 0,
    totalVisits: raw?.visits ?? 0,
    uniqueHostnames: 0, // enriched later in loadDashboard
    topPage: null, // enriched later in loadDashboard
    topCountry: null, // enriched later in loadDashboard
  };
}

export async function getTimeseries(
  start: string,
  end: string,
  hostnames?: string[],
): Promise<WaTimeseriesPoint[]> {
  return fetchAnalytics<WaTimeseriesPoint[]>({
    type: "timeseries",
    start,
    end,
    hostnames,
  });
}

export async function getTopPages(
  start: string,
  end: string,
  hostnames?: string[],
  limit?: number,
): Promise<WaTopItem[]> {
  const raw = await fetchAnalytics<{ path: string; pageViews: number }[]>({
    type: "top_pages",
    start,
    end,
    hostnames,
    limit,
  });
  return (raw ?? []).map((item) => ({
    name: item.path,
    count: item.pageViews,
  }));
}

export async function getCountries(
  start: string,
  end: string,
  hostnames?: string[],
  limit?: number,
): Promise<WaTopItem[]> {
  const raw = await fetchAnalytics<{ country: string; pageViews: number }[]>({
    type: "countries",
    start,
    end,
    hostnames,
    limit,
  });
  return (raw ?? []).map((item) => ({
    name: item.country,
    count: item.pageViews,
  }));
}

export async function getBrowsers(
  start: string,
  end: string,
  hostnames?: string[],
  limit?: number,
): Promise<WaTopItem[]> {
  const raw = await fetchAnalytics<{ browser: string; pageViews: number }[]>({
    type: "browsers",
    start,
    end,
    hostnames,
    limit,
  });
  return (raw ?? []).map((item) => ({
    name: item.browser,
    count: item.pageViews,
  }));
}

export async function getDevices(
  start: string,
  end: string,
  hostnames?: string[],
  limit?: number,
): Promise<WaTopItem[]> {
  const raw = await fetchAnalytics<{ device: string; pageViews: number }[]>({
    type: "devices",
    start,
    end,
    hostnames,
    limit,
  });
  return (raw ?? []).map((item) => ({
    name: item.device,
    count: item.pageViews,
  }));
}

export async function getReferrers(
  start: string,
  end: string,
  hostnames?: string[],
  limit?: number,
): Promise<WaTopItem[]> {
  const raw = await fetchAnalytics<{ referrer: string; pageViews: number }[]>({
    type: "referrers",
    start,
    end,
    hostnames,
    limit,
  });
  return (raw ?? []).map((item) => ({
    name: item.referrer || "(direto)",
    count: item.pageViews,
  }));
}

export async function getHosts(
  start: string,
  end: string,
  limit?: number,
): Promise<WaTopItem[]> {
  const raw = await fetchAnalytics<{ hostname: string; pageViews: number }[]>({
    type: "hosts",
    start,
    end,
    limit,
  });
  return (raw ?? []).map((item) => ({
    name: item.hostname,
    count: item.pageViews,
  }));
}

/* ── Aggregate loader (all-in-one for the dashboard screen) ── */

export interface WaDashboardData {
  overview: WaOverview;
  timeseries: WaTimeseriesPoint[];
  topPages: WaTopItem[];
  countries: WaTopItem[];
  browsers: WaTopItem[];
  devices: WaTopItem[];
  referrers: WaTopItem[];
  hosts: WaTopItem[];
}

/**
 * Load all analytics data needed for the Web Analytics dashboard in parallel.
 * Uses Promise.allSettled so partial failures don't block the entire dashboard.
 */
export async function loadDashboard(
  start: string,
  end: string,
  hostnames?: string[],
): Promise<WaDashboardData> {
  const [
    overviewResult,
    timeseriesResult,
    topPagesResult,
    countriesResult,
    browsersResult,
    devicesResult,
    referrersResult,
    hostsResult,
  ] = await Promise.allSettled([
    getOverview(start, end, hostnames),
    getTimeseries(start, end, hostnames),
    getTopPages(start, end, hostnames, 15),
    getCountries(start, end, hostnames, 10),
    getBrowsers(start, end, hostnames, 10),
    getDevices(start, end, hostnames, 10),
    getReferrers(start, end, hostnames, 10),
    getHosts(start, end, 10),
  ]);

  const fallbackOverview: WaOverview = {
    totalPageViews: 0,
    totalVisits: 0,
    uniqueHostnames: 0,
    topPage: null,
    topCountry: null,
  };

  const overview =
    overviewResult.status === "fulfilled"
      ? overviewResult.value
      : fallbackOverview;
  const topPages =
    topPagesResult.status === "fulfilled" ? topPagesResult.value : [];
  const countries =
    countriesResult.status === "fulfilled" ? countriesResult.value : [];
  const hosts = hostsResult.status === "fulfilled" ? hostsResult.value : [];

  // Enrich overview with data derived from other queries
  overview.uniqueHostnames = hosts.length;
  overview.topPage = topPages.length > 0 ? topPages[0].name : null;
  overview.topCountry = countries.length > 0 ? countries[0].name : null;

  return {
    overview,
    timeseries:
      timeseriesResult.status === "fulfilled" ? timeseriesResult.value : [],
    topPages,
    countries,
    browsers: browsersResult.status === "fulfilled" ? browsersResult.value : [],
    devices: devicesResult.status === "fulfilled" ? devicesResult.value : [],
    referrers:
      referrersResult.status === "fulfilled" ? referrersResult.value : [],
    hosts,
  };
}
