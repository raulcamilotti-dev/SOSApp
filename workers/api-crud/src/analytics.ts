/* ================================================================== */
/*  Cloudflare Web Analytics (RUM) — GraphQL Proxy Handler             */
/*  Proxies analytics queries to Cloudflare GraphQL Analytics API      */
/*  using the same Global API Key + Email already configured for DNS.  */
/* ================================================================== */

import type { Env } from "./types";

/* ── Types ── */

interface AnalyticsRequestBody {
  /** Query type */
  type:
    | "overview"
    | "timeseries"
    | "top_pages"
    | "countries"
    | "browsers"
    | "devices"
    | "referrers"
    | "hosts";
  /** ISO 8601 start date (e.g., "2024-01-01T00:00:00Z") */
  start: string;
  /** ISO 8601 end date (e.g., "2024-01-31T23:59:59Z") */
  end: string;
  /** Optional hostname filter for multi-tenant scoping */
  hostnames?: string[];
  /** Max results for grouped queries (default: 20) */
  limit?: number;
}

const CF_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

/* ── GraphQL query builders ── */

function buildDateFilter(start: string, end: string): string {
  return `{ datetime_geq: "${start}" }, { datetime_leq: "${end}" }`;
}

function buildHostnameFilter(hostnames?: string[]): string {
  if (!hostnames || hostnames.length === 0) return "";
  if (hostnames.length === 1) {
    return `, { requestHost: "${hostnames[0]}" }`;
  }
  const list = hostnames.map((h) => `"${h}"`).join(", ");
  return `, { requestHost_in: [${list}] }`;
}

function buildSiteTagFilter(siteTag: string): string {
  return `, { siteTag: "${siteTag}" }`;
}

function buildFilter(
  siteTag: string,
  start: string,
  end: string,
  hostnames?: string[],
): string {
  return `{ AND: [${buildDateFilter(start, end)}${buildSiteTagFilter(siteTag)}${buildHostnameFilter(hostnames)}] }`;
}

/** Overview KPIs: total visits, page views */
function queryOverview(
  accountId: string,
  siteTag: string,
  start: string,
  end: string,
  hostnames?: string[],
): string {
  const filter = buildFilter(siteTag, start, end, hostnames);
  return `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        total: rumPageloadEventsAdaptiveGroups(filter: ${filter}, limit: 1) {
          count
          sum { visits }
          avg { sampleInterval }
        }
      }
    }
  }`;
}

/** Timeseries: visits and page views over time, grouped by day or hour */
function queryTimeseries(
  accountId: string,
  siteTag: string,
  start: string,
  end: string,
  hostnames?: string[],
  limit = 365,
): string {
  const filter = buildFilter(siteTag, start, end, hostnames);
  // If range is <= 2 days, group by hour; otherwise by day
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const rangeDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
  const dimension = rangeDays <= 2 ? "datetimeHour" : "date";
  const orderBy = rangeDays <= 2 ? "datetimeHour_ASC" : "date_ASC";

  return `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        series: rumPageloadEventsAdaptiveGroups(
          filter: ${filter}
          limit: ${limit}
          orderBy: [${orderBy}]
        ) {
          count
          sum { visits }
          dimensions { ${dimension} }
        }
      }
    }
  }`;
}

/** Top pages by page views */
function queryTopPages(
  accountId: string,
  siteTag: string,
  start: string,
  end: string,
  hostnames?: string[],
  limit = 20,
): string {
  const filter = buildFilter(siteTag, start, end, hostnames);
  return `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        topPages: rumPageloadEventsAdaptiveGroups(
          filter: ${filter}
          limit: ${limit}
          orderBy: [count_DESC]
        ) {
          count
          sum { visits }
          dimensions { requestPath }
        }
      }
    }
  }`;
}

/** Visits by country */
function queryCountries(
  accountId: string,
  siteTag: string,
  start: string,
  end: string,
  hostnames?: string[],
  limit = 20,
): string {
  const filter = buildFilter(siteTag, start, end, hostnames);
  return `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        countries: rumPageloadEventsAdaptiveGroups(
          filter: ${filter}
          limit: ${limit}
          orderBy: [count_DESC]
        ) {
          count
          sum { visits }
          dimensions { countryName }
        }
      }
    }
  }`;
}

/** Visits by browser */
function queryBrowsers(
  accountId: string,
  siteTag: string,
  start: string,
  end: string,
  hostnames?: string[],
  limit = 15,
): string {
  const filter = buildFilter(siteTag, start, end, hostnames);
  return `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        browsers: rumPageloadEventsAdaptiveGroups(
          filter: ${filter}
          limit: ${limit}
          orderBy: [count_DESC]
        ) {
          count
          sum { visits }
          dimensions { userAgentBrowser }
        }
      }
    }
  }`;
}

/** Visits by device type */
function queryDevices(
  accountId: string,
  siteTag: string,
  start: string,
  end: string,
  hostnames?: string[],
  limit = 10,
): string {
  const filter = buildFilter(siteTag, start, end, hostnames);
  return `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        devices: rumPageloadEventsAdaptiveGroups(
          filter: ${filter}
          limit: ${limit}
          orderBy: [count_DESC]
        ) {
          count
          sum { visits }
          dimensions { deviceType }
        }
      }
    }
  }`;
}

/** Top referrers */
function queryReferrers(
  accountId: string,
  siteTag: string,
  start: string,
  end: string,
  hostnames?: string[],
  limit = 20,
): string {
  const filter = buildFilter(siteTag, start, end, hostnames);
  return `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        referrers: rumPageloadEventsAdaptiveGroups(
          filter: ${filter}
          limit: ${limit}
          orderBy: [count_DESC]
        ) {
          count
          sum { visits }
          dimensions { refererHost }
        }
      }
    }
  }`;
}

/** Available hostnames (for admin to see all tenant domains) */
function queryHosts(
  accountId: string,
  siteTag: string,
  start: string,
  end: string,
  limit = 50,
): string {
  const filter = buildFilter(siteTag, start, end);
  return `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        hosts: rumPageloadEventsAdaptiveGroups(
          filter: ${filter}
          limit: ${limit}
          orderBy: [count_DESC]
        ) {
          count
          sum { visits }
          dimensions { requestHost }
        }
      }
    }
  }`;
}

/* ── Execute GraphQL query ── */

async function executeGraphQL(
  query: string,
  apiKey: string,
  email: string,
): Promise<unknown> {
  const response = await fetch(CF_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Key": apiKey,
      "X-Auth-Email": email,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Cloudflare GraphQL error (${response.status}): ${errorText}`,
    );
  }

  const result = (await response.json()) as {
    data?: unknown;
    errors?: { message: string }[];
  };

  if (result.errors && result.errors.length > 0) {
    throw new Error(
      `GraphQL errors: ${result.errors.map((e) => e.message).join("; ")}`,
    );
  }

  return result.data;
}

/* ── Transform helpers ── */

function extractAccountData(data: unknown, key: string): unknown[] {
  const viewer = (data as any)?.viewer;
  if (!viewer) return [];
  const accounts = viewer.accounts;
  if (!Array.isArray(accounts) || accounts.length === 0) return [];
  return accounts[0]?.[key] ?? [];
}

function transformOverview(data: unknown) {
  const items = extractAccountData(data, "total") as {
    count: number;
    sum: { visits: number };
    avg: { sampleInterval: number };
  }[];
  if (items.length === 0) {
    return { pageViews: 0, visits: 0, sampleInterval: 1 };
  }
  return {
    pageViews: items[0].count ?? 0,
    visits: items[0].sum?.visits ?? 0,
    sampleInterval: items[0].avg?.sampleInterval ?? 1,
  };
}

function transformTimeseries(data: unknown) {
  const items = extractAccountData(data, "series") as {
    count: number;
    sum: { visits: number };
    dimensions: { datetimeHour?: string; date?: string };
  }[];
  return items.map((item) => ({
    date: item.dimensions?.date ?? item.dimensions?.datetimeHour ?? "",
    pageViews: item.count ?? 0,
    visits: item.sum?.visits ?? 0,
  }));
}

function transformTopPages(data: unknown) {
  const items = extractAccountData(data, "topPages") as {
    count: number;
    sum: { visits: number };
    dimensions: { requestPath: string };
  }[];
  return items.map((item) => ({
    path: item.dimensions?.requestPath ?? "",
    pageViews: item.count ?? 0,
    visits: item.sum?.visits ?? 0,
  }));
}

function transformCountries(data: unknown) {
  const items = extractAccountData(data, "countries") as {
    count: number;
    sum: { visits: number };
    dimensions: { countryName: string };
  }[];
  return items.map((item) => ({
    country: item.dimensions?.countryName ?? "Unknown",
    pageViews: item.count ?? 0,
    visits: item.sum?.visits ?? 0,
  }));
}

function transformBrowsers(data: unknown) {
  const items = extractAccountData(data, "browsers") as {
    count: number;
    sum: { visits: number };
    dimensions: { userAgentBrowser: string };
  }[];
  return items.map((item) => ({
    browser: item.dimensions?.userAgentBrowser ?? "Unknown",
    pageViews: item.count ?? 0,
    visits: item.sum?.visits ?? 0,
  }));
}

function transformDevices(data: unknown) {
  const items = extractAccountData(data, "devices") as {
    count: number;
    sum: { visits: number };
    dimensions: { deviceType: string };
  }[];
  return items.map((item) => ({
    device: item.dimensions?.deviceType ?? "Unknown",
    pageViews: item.count ?? 0,
    visits: item.sum?.visits ?? 0,
  }));
}

function transformReferrers(data: unknown) {
  const items = extractAccountData(data, "referrers") as {
    count: number;
    sum: { visits: number };
    dimensions: { refererHost: string };
  }[];
  return items.map((item) => ({
    referrer: item.dimensions?.refererHost ?? "(direct)",
    pageViews: item.count ?? 0,
    visits: item.sum?.visits ?? 0,
  }));
}

function transformHosts(data: unknown) {
  const items = extractAccountData(data, "hosts") as {
    count: number;
    sum: { visits: number };
    dimensions: { requestHost: string };
  }[];
  return items.map((item) => ({
    hostname: item.dimensions?.requestHost ?? "",
    pageViews: item.count ?? 0,
    visits: item.sum?.visits ?? 0,
  }));
}

/* ══════════════════════════════════════════════════════════════════ */
/*  Main handler — POST /analytics/query                             */
/* ══════════════════════════════════════════════════════════════════ */

export async function handleAnalyticsQuery(
  request: Request,
  env: Env,
): Promise<Response> {
  // Validate env vars
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const siteTag = env.CF_ANALYTICS_SITE_TAG;
  const apiKey = env.CLOUDFLARE_DNS_API_KEY;
  const email = env.CLOUDFLARE_DNS_EMAIL;

  if (!accountId || !siteTag || !apiKey || !email) {
    return new Response(
      JSON.stringify({
        error:
          "Analytics not configured. Set CLOUDFLARE_ACCOUNT_ID and CF_ANALYTICS_SITE_TAG.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: AnalyticsRequestBody;
  try {
    body = (await request.json()) as AnalyticsRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { type, start, end, hostnames, limit } = body;

  if (!type || !start || !end) {
    return new Response(
      JSON.stringify({
        error: 'Missing required fields: "type", "start", "end"',
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    let query: string;
    let transform: (data: unknown) => unknown;

    switch (type) {
      case "overview":
        query = queryOverview(accountId, siteTag, start, end, hostnames);
        transform = transformOverview;
        break;
      case "timeseries":
        query = queryTimeseries(
          accountId,
          siteTag,
          start,
          end,
          hostnames,
          limit,
        );
        transform = transformTimeseries;
        break;
      case "top_pages":
        query = queryTopPages(accountId, siteTag, start, end, hostnames, limit);
        transform = transformTopPages;
        break;
      case "countries":
        query = queryCountries(
          accountId,
          siteTag,
          start,
          end,
          hostnames,
          limit,
        );
        transform = transformCountries;
        break;
      case "browsers":
        query = queryBrowsers(accountId, siteTag, start, end, hostnames, limit);
        transform = transformBrowsers;
        break;
      case "devices":
        query = queryDevices(accountId, siteTag, start, end, hostnames, limit);
        transform = transformDevices;
        break;
      case "referrers":
        query = queryReferrers(
          accountId,
          siteTag,
          start,
          end,
          hostnames,
          limit,
        );
        transform = transformReferrers;
        break;
      case "hosts":
        query = queryHosts(accountId, siteTag, start, end, limit);
        transform = transformHosts;
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown query type: ${type}` }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }

    const rawData = await executeGraphQL(query, apiKey, email);
    const result = transform(rawData);

    return new Response(JSON.stringify({ data: result, type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
