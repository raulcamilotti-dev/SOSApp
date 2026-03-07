/* ================================================================== */
/*  Shared types for the SOS API CRUD Cloudflare Worker                */
/* ================================================================== */

export interface Env {
  DATABASE_URL: string; // set via wrangler secret put DATABASE_URL
  API_KEY: string; // set via wrangler secret put API_KEY
  JWT_SECRET: string; // set via wrangler secret put JWT_SECRET (use: openssl rand -base64 48)
  GOOGLE_CLIENT_IDS?: string; // optional comma-separated list of allowed Google OAuth client IDs
  CLOUDFLARE_DNS_API_KEY: string; // Global API Key — set via wrangler secret put CLOUDFLARE_DNS_API_KEY
  CLOUDFLARE_DNS_EMAIL: string; // Account email — set via wrangler secret put CLOUDFLARE_DNS_EMAIL
  CLOUDFLARE_ZONE_ID: string; // set via wrangler secret put CLOUDFLARE_ZONE_ID
  CLOUDFLARE_ACCOUNT_ID: string; // set via wrangler secret put CLOUDFLARE_ACCOUNT_ID (Web Analytics GraphQL)
  CF_ANALYTICS_SITE_TAG: string; // Beacon token — set via wrangler.toml [vars] or secret
  RESEND_API_KEY: string; // set via wrangler secret put RESEND_API_KEY (password reset emails)
  RESEND_FROM_EMAIL: string; // set via wrangler.toml [vars] (e.g., "Radul <noreply@radul.com.br>")
  FISCAL_CONTAINER: DurableObjectNamespace; // Workers Container binding — PHP fiscal microservice (sped-nfe)
  ENVIRONMENT: string;
  /** Cloudflare KV namespace for public API rate limiting */
  RATE_LIMIT_KV: KVNamespace;
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

/* ------------------------------------------------------------------ */
/*  Public API v1 — Types                                              */
/* ------------------------------------------------------------------ */

/** Database row from api_keys table */
export interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  environment: "live" | "test";
  scopes: string[]; // ["read", "write", "delete"]
  allowed_tables: string[]; // [] = default whitelist
  rate_limit_per_minute: number;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Authenticated context for public API requests */
export interface PublicApiContext {
  /** The api_key record used for authentication */
  apiKey: ApiKeyRecord;
  /** Tenant ID from the API key (auto-injected into all queries) */
  tenantId: string;
  /** Scopes granted to this key */
  scopes: string[];
  /** Tables this key is allowed to access (empty = default whitelist) */
  allowedTables: string[];
}

/** Standard response envelope for public API */
export interface PublicApiResponse<T = unknown> {
  data: T;
  meta?: {
    total?: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

/** Standard error envelope for public API */
export interface PublicApiError {
  error: {
    code: string;
    message: string;
    retry_after?: number;
  };
}
