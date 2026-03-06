/**
 * Gateway Config Service
 *
 * Resolves the primary payment gateway configuration for a tenant.
 * Reads from `bank_accounts.gateway_config` (JSONB) + `banks.gateway_provider`
 * instead of the legacy tenant-level `asaas_wallet_id` column.
 *
 * Usage:
 *   const config = await getTenantGatewayConfig(tenantId);
 *   if (config) {
 *     console.log(config.provider);     // "asaas"
 *     console.log(config.walletId);     // "wal_..."
 *     console.log(config.pixKey);       // "12345678900"
 *   }
 */

import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";

/* ─── Types ─── */

export type GatewayProvider = "asaas" | "mercadopago" | "stripe" | "pagseguro";

export interface TenantGatewayConfig {
  /** Gateway provider key */
  provider: GatewayProvider;
  /** Bank account ID (primary gateway) */
  accountId: string;
  /** Bank ID */
  bankId: string;
  /** Bank name (e.g. "Asaas") */
  bankName: string;

  /** Raw gateway_config JSONB from bank_accounts */
  gatewayConfig: Record<string, string>;

  /** Asaas-specific: wallet ID */
  walletId: string | null;

  /** PIX fields from the bank account */
  pixKey: string | null;
  pixKeyType: string | null;
  pixMerchantName: string | null;
  pixMerchantCity: string | null;
}

type BankRow = {
  id: string;
  name: string;
  gateway_provider?: string;
  is_payment_gateway?: boolean;
  deleted_at?: string;
};

type BankAccountRow = {
  id: string;
  bank_id: string;
  gateway_config?: Record<string, unknown> | string;
  is_primary_gateway?: boolean;
  pix_key?: string;
  pix_key_type?: string;
  pix_merchant_name?: string;
  pix_merchant_city?: string;
  deleted_at?: string;
};

/* ─── Helpers ─── */

const parseGatewayConfig = (
  raw: Record<string, unknown> | string | null | undefined,
): Record<string, string> => {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")]),
        );
      }
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") {
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, String(v ?? "")]),
    );
  }
  return {};
};

/* ─── Main function ─── */

/**
 * Resolve the primary payment gateway configuration for a tenant.
 *
 * Looks up `bank_accounts` with `is_primary_gateway = true` whose
 * parent bank has `is_payment_gateway = true`, and returns the
 * provider, config, and PIX fields.
 *
 * Returns `null` if no primary gateway account is configured.
 */
export async function getTenantGatewayConfig(
  tenantId: string,
): Promise<TenantGatewayConfig | null> {
  if (!tenantId) return null;

  try {
    // 1. Find gateway banks for this tenant
    const banksRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "banks",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "is_payment_gateway", value: "true" },
        ],
        { sortColumn: "name ASC" },
      ),
      auto_exclude_deleted: true,
    });
    const banks = normalizeCrudList<BankRow>(banksRes.data).filter(
      (b) => !b.deleted_at,
    );
    if (banks.length === 0) return null;

    // 2. Find bank accounts for those banks
    const bankIds = banks.map((b) => b.id);
    const accountsRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "bank_accounts",
      ...buildSearchParams(
        [{ field: "bank_id", value: bankIds.join(","), operator: "in" }],
        { sortColumn: "account_name ASC" },
      ),
      auto_exclude_deleted: true,
    });
    const accounts = normalizeCrudList<BankAccountRow>(accountsRes.data).filter(
      (a) => !a.deleted_at,
    );
    if (accounts.length === 0) return null;

    // 3. Find the primary gateway account (or fall back to first)
    const primary = accounts.find((a) => a.is_primary_gateway);
    const account = primary ?? accounts[0];

    // 4. Resolve the bank
    const bank = banks.find((b) => b.id === account.bank_id);
    if (!bank) return null;

    const provider = (bank.gateway_provider ?? "asaas") as GatewayProvider;
    const config = parseGatewayConfig(account.gateway_config);

    return {
      provider,
      accountId: account.id,
      bankId: bank.id,
      bankName: bank.name,
      gatewayConfig: config,
      walletId: config.wallet_id || null,
      pixKey: account.pix_key || null,
      pixKeyType: account.pix_key_type || null,
      pixMerchantName: account.pix_merchant_name || null,
      pixMerchantCity: account.pix_merchant_city || null,
    };
  } catch (err) {
    if (__DEV__) {
      console.warn("[gateway-config] Failed to resolve gateway:", err);
    }
    return null;
  }
}

/**
 * Convenience: get the Asaas wallet ID for a tenant.
 * Falls back to null if not configured or not Asaas.
 */
export async function getAsaasWalletId(
  tenantId: string,
): Promise<string | null> {
  const config = await getTenantGatewayConfig(tenantId);
  if (!config || config.provider !== "asaas") return null;
  return config.walletId;
}
