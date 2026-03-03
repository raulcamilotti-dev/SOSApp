/**
 * API Keys Service — Client-side management of public API keys
 *
 * Handles CRUD operations for api_keys table.
 * The key generation happens server-side — the plaintext key is returned
 * exactly ONCE on creation, then only the prefix is visible.
 *
 * Flow:
 *   1. Admin creates key via createApiKey() → gets { key: "rk_live_...", record }
 *   2. Admin copies key (shown once, never stored in plaintext)
 *   3. External developer uses key in Authorization: Bearer rk_live_...
 *   4. Worker validates via HMAC-SHA256 hash match
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ApiKeyEnvironment = "live" | "test";

export type ApiKeyScope = "read" | "write" | "delete";

export interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  environment: ApiKeyEnvironment;
  scopes: ApiKeyScope[];
  allowed_tables: string[];
  rate_limit_per_minute: number;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  environment?: ApiKeyEnvironment;
  scopes?: ApiKeyScope[];
  allowed_tables?: string[];
  rate_limit_per_minute?: number;
  expires_at?: string | null;
}

export interface CreateApiKeyResult {
  /** The plaintext API key — shown ONCE, never stored */
  plaintext_key: string;
  /** The created record (without key_hash for security) */
  record: ApiKeyRecord;
}

export interface UpdateApiKeyInput {
  id: string;
  name?: string;
  scopes?: ApiKeyScope[];
  allowed_tables?: string[];
  rate_limit_per_minute?: number;
  is_active?: boolean;
  expires_at?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Internal endpoint                                                  */
/* ------------------------------------------------------------------ */

/**
 * API base URL — same worker, different endpoint for key management.
 * Key creation uses a dedicated endpoint because it needs to:
 *   1. Generate the random key
 *   2. HMAC-SHA256 hash it
 *   3. Store the hash
 *   4. Return the plaintext ONCE
 */
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";

const API_KEYS_ENDPOINT = `${API_BASE}/api-keys`;

/* ------------------------------------------------------------------ */
/*  CRUD Operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * List API keys for a tenant.
 * Returns keys without the hash (only prefix visible).
 */
export async function listApiKeys(tenantId: string): Promise<ApiKeyRecord[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "api_keys",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
      sortColumn: "created_at DESC",
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<ApiKeyRecord>(res.data).filter((k) => !k.deleted_at);
}

/**
 * Create a new API key.
 * Returns the plaintext key ONCE — caller must display it to the user
 * for copying before it's gone forever.
 *
 * This calls a dedicated worker endpoint that handles key generation
 * and HMAC hashing server-side.
 */
export async function createApiKey(
  tenantId: string,
  userId: string,
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  const res = await api.post(API_KEYS_ENDPOINT, {
    action: "create",
    tenant_id: tenantId,
    user_id: userId,
    ...input,
  });

  const data = res.data;
  // The endpoint returns { plaintext_key, record }
  if (data && typeof data === "object" && "plaintext_key" in data) {
    return data as CreateApiKeyResult;
  }

  throw new Error("Unexpected response format from API key creation");
}

/**
 * Update an existing API key (name, scopes, tables, rate limit, active status).
 * Cannot change the key itself or the hash.
 */
export async function updateApiKey(
  input: UpdateApiKeyInput,
): Promise<ApiKeyRecord> {
  const { id, ...payload } = input;
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "api_keys",
    payload: {
      id,
      ...payload,
      updated_at: new Date().toISOString(),
      // Serialize arrays as JSON strings for JSONB columns
      ...(payload.scopes ? { scopes: JSON.stringify(payload.scopes) } : {}),
      ...(payload.allowed_tables
        ? { allowed_tables: JSON.stringify(payload.allowed_tables) }
        : {}),
    },
  });
  return normalizeCrudOne<ApiKeyRecord>(res.data);
}

/**
 * Soft-delete an API key.
 */
export async function deleteApiKey(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "api_keys",
    payload: {
      id,
      is_active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Toggle API key active status.
 */
export async function toggleApiKey(
  id: string,
  isActive: boolean,
): Promise<ApiKeyRecord> {
  return updateApiKey({ id, is_active: isActive });
}

/**
 * Revoke an API key (deactivate without deleting).
 */
export async function revokeApiKey(id: string): Promise<ApiKeyRecord> {
  return toggleApiKey(id, false);
}

/* ------------------------------------------------------------------ */
/*  Helper: format key display                                         */
/* ------------------------------------------------------------------ */

/**
 * Format a key prefix for display: "rk_live_abc1" → "rk_live_abc1••••••••"
 */
export function formatKeyPrefix(prefix: string): string {
  return `${prefix}${"•".repeat(8)}`;
}

/**
 * Format scopes for display: ["read", "write"] → "Leitura, Escrita"
 */
export function formatScopes(scopes: ApiKeyScope[]): string {
  const labels: Record<ApiKeyScope, string> = {
    read: "Leitura",
    write: "Escrita",
    delete: "Exclusão",
  };
  return scopes.map((s) => labels[s] || s).join(", ");
}

/**
 * Format environment for display: "live" → "Produção", "test" → "Teste"
 */
export function formatEnvironment(env: ApiKeyEnvironment): string {
  return env === "live" ? "Produção" : "Teste";
}

/**
 * Get default allowed tables list (matches DEFAULT_ALLOWED_TABLES in api-key-auth.ts).
 */
export const DEFAULT_ALLOWED_TABLES = [
  "customers",
  "companies",
  "company_members",
  "service_orders",
  "service_order_context",
  "service_types",
  "service_categories",
  "services",
  "workflow_templates",
  "workflow_steps",
  "workflow_step_transitions",
  "tasks",
  "process_updates",
  "process_deadlines",
  "process_document_requests",
  "process_document_responses",
  "invoices",
  "invoice_items",
  "payments",
  "accounts_receivable",
  "accounts_payable",
  "quotes",
  "quote_items",
  "partners",
  "partner_earnings",
  "leads",
  "contracts",
  "products",
  "product_compositions",
  "stock_movements",
  "stock_locations",
  "purchase_orders",
  "purchase_order_items",
  "delivery_orders",
  "notifications",
  "custom_field_definitions",
  "custom_field_values",
] as const;
