/* ================================================================== */
/*  Shared types for the SOS API CRUD Cloudflare Worker                */
/* ================================================================== */

export interface Env {
  DATABASE_URL: string; // set via `wrangler secret put DATABASE_URL`
  API_KEY: string; // set via `wrangler secret put API_KEY`
  CLOUDFLARE_DNS_API_KEY: string; // Global API Key — set via `wrangler secret put CLOUDFLARE_DNS_API_KEY`
  CLOUDFLARE_DNS_EMAIL: string; // Account email — set via `wrangler secret put CLOUDFLARE_DNS_EMAIL`
  CLOUDFLARE_ZONE_ID: string; // set via `wrangler secret put CLOUDFLARE_ZONE_ID`
  ENVIRONMENT: string;
}

export interface CrudRequestBody {
  action: string;
  table: string;
  payload?: Record<string, unknown> | Record<string, unknown>[];
  sql?: string;
  table_name?: string;

  // Filters (search_field1..8)
  search_field1?: string;
  search_value1?: string;
  search_operator1?: string;
  search_field2?: string;
  search_value2?: string;
  search_operator2?: string;
  search_field3?: string;
  search_value3?: string;
  search_operator3?: string;
  search_field4?: string;
  search_value4?: string;
  search_operator4?: string;
  search_field5?: string;
  search_value5?: string;
  search_operator5?: string;
  search_field6?: string;
  search_value6?: string;
  search_operator6?: string;
  search_field7?: string;
  search_value7?: string;
  search_operator7?: string;
  search_field8?: string;
  search_value8?: string;
  search_operator8?: string;

  // Options
  combine_type?: string;
  sort_column?: string;
  limit?: string | number;
  offset?: string | number;
  fields?: string[];
  auto_exclude_deleted?: boolean;

  // Legacy search
  search?: string;
  search_field?: string;

  // Aggregate
  aggregates?: AggregateColumn[];
  group_by?: string[];
}

export interface AggregateColumn {
  function: string;
  field: string;
  alias?: string;
}

export interface QueryResult {
  query: string;
  params: unknown[];
}
