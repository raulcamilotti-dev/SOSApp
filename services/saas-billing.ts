/**
 * SaaS Billing Service — Active-Client-Tier Monthly Subscriptions
 *
 * The SOS platform uses an ACTIVE client-count-based tier model.
 * "Active client" = any customer with interaction in the last 90 days.
 * Each plan defines max active clients AND max users.
 *
 * Tiers:
 *   Free       — up to 20 active clients, up to 3 users,   R$ 0/mês
 *   Starter    — up to 100 active clients, unlimited users, R$ 99/mês
 *   Growth     — up to 500 active clients, unlimited users, R$ 249/mês
 *   Scale      — up to 2000 active clients, unlimited users, R$ 499/mês
 *   Enterprise — unlimited active clients, unlimited users, sob consulta
 *
 * Active client window: rolling 90 days based on `customers.last_interaction_at`.
 * A nightly N8N cron job recalculates `last_interaction_at` by scanning all
 * tables with `customer_id` for the most recent activity.
 *
 * Monthly auto-tier adjustment:
 * - If active client count exceeds current plan at month-end → auto-upgrade
 *   (generates PIX for next month's full plan price)
 * - If active client count is below for 2 consecutive months → auto-downgrade
 *
 * When a tenant upgrades, this service:
 * 1. Creates an invoice on the Radul super-admin tenant (the platform owner)
 * 2. Creates an accounts_receivable entry (recurrence: "monthly") with PIX QR
 * 3. After initial payment: activates plan + generates next month AR automatically
 * 4. Each subsequent monthly payment generates the next month's AR
 *
 * Enterprise tenants can buy extra client slots at R$ 0,20/client/month.
 *
 * The Radul tenant is the creditor — all invoices/AR entries are created
 * on the Radul tenant, with the buying tenant referenced in notes.
 */

import { api, getApiErrorMessage } from "./api";
import {
    getReferralByTenantId,
    updateReferralStatus,
} from "./channel-partners";
import {
    KNOWN_ACCOUNT_CODES,
    resolveChartAccountId,
} from "./chart-of-accounts";
import {
    aggregateCrud,
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "./crud";
import {
    createAccountReceivable,
    createInvoice,
    createInvoiceItem,
    recalculateInvoice,
    updateAccountReceivable,
} from "./financial";
import { asaasCreateCharge } from "./partner";
import { generatePixPayload, generatePixQRCodeBase64 } from "./pix";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Plan tier definitions — client-count based pricing.
 * maxCustomers: null = unlimited (Enterprise).
 * monthlyPrice: null = custom/negotiated (Enterprise base).
 */
export interface PlanTier {
  key: string;
  label: string;
  /** Max ACTIVE clients (last 90 days). null = unlimited */
  maxCustomers: number | null;
  /** Max users. null = unlimited */
  maxUsers: number | null;
  monthlyPrice: number | null;
  /** For the plan comparison: minimum client count to justify this tier */
  minCustomers: number;
}

/** Active client window in days */
export const ACTIVE_CLIENT_WINDOW_DAYS = 90;

export const PLAN_TIERS: Record<string, PlanTier> = {
  free: {
    key: "free",
    label: "Gratis",
    maxCustomers: 20,
    maxUsers: 3,
    monthlyPrice: 0,
    minCustomers: 0,
  },
  starter: {
    key: "starter",
    label: "Starter",
    maxCustomers: 100,
    maxUsers: null,
    monthlyPrice: 99,
    minCustomers: 21,
  },
  growth: {
    key: "growth",
    label: "Growth",
    maxCustomers: 500,
    maxUsers: null,
    monthlyPrice: 249,
    minCustomers: 101,
  },
  scale: {
    key: "scale",
    label: "Scale",
    maxCustomers: 2000,
    maxUsers: null,
    monthlyPrice: 499,
    minCustomers: 501,
  },
  enterprise: {
    key: "enterprise",
    label: "Enterprise",
    maxCustomers: null,
    maxUsers: null,
    monthlyPrice: null,
    minCustomers: 2001,
  },
};

/** Ordered list from cheapest to most expensive (for upgrade flow) */
export const PLAN_ORDER: string[] = [
  "free",
  "starter",
  "growth",
  "scale",
  "enterprise",
];

/** Price per extra client in Enterprise plan (BRL/month) */
export const ENTERPRISE_PRICE_PER_CLIENT = 0.2;

/**
 * Legacy compatibility: PLAN_BASE_LIMITS maps plan key → maxUsers + maxCustomers.
 * Users are no longer limited by plan; maxUsers kept as null for backward compat.
 */
const PLAN_BASE_LIMITS: Record<
  string,
  { maxUsers: number | null; maxCustomers: number | null }
> = {
  trial: { maxUsers: 3, maxCustomers: 20 },
  free: { maxUsers: 3, maxCustomers: 20 },
  starter: { maxUsers: null, maxCustomers: 100 },
  growth: { maxUsers: null, maxCustomers: 500 },
  scale: { maxUsers: null, maxCustomers: 2000 },
  enterprise: { maxUsers: null, maxCustomers: null },
};

/** Radul super-admin billing defaults (used when tenant config.billing is incomplete) */
const RADUL_BILLING_DEFAULTS = {
  pix_key: "54152041000122",
  pix_key_type: "cnpj" as const,
  pix_merchant_name: "Radul Tecnologia",
  pix_merchant_city: "Curitiba",
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TenantLimits {
  /** Current plan key (free, starter, growth, etc.) */
  plan: string;
  /** Plan tier info */
  planTier: PlanTier;
  /** Plan's base ACTIVE customer limit (null = unlimited) */
  planBaseCustomers: number | null;
  /** Extra client slots purchased (Enterprise) */
  extraClientsPurchased: number;
  /** Effective max active customers (planBase + extra). null = unlimited */
  effectiveMaxCustomers: number | null;
  /** Current ACTIVE customer count (interacted in last 90 days) */
  currentCustomers: number;
  /** Total stored customer count (all time, not just active) */
  totalStoredCustomers: number;
  /** How many active client slots remain available */
  availableSlots: number | null;
  /** Whether the tenant has hit the active client limit */
  isAtLimit: boolean;
  /** Whether the tenant is near the limit (>=80%) */
  isNearLimit: boolean;
  /** Usage percentage (0-100) based on ACTIVE customer count */
  usagePercent: number;
  /** Monthly plan price */
  monthlyPrice: number | null;
  /** Current user count */
  currentUsers: number;
  /** Plan max users (null = unlimited). Free = 3 */
  maxUsers: number | null;
  /** Whether user limit is reached */
  isUserAtLimit: boolean;
  /** Whether near user limit (>=80%) */
  isUserNearLimit: boolean;
  /** User usage percent (0-100). 0 if unlimited */
  userUsagePercent: number;
  /** Enterprise: price per extra client */
  pricePerExtraClient: number;
  /** Suggested next plan for upgrade */
  suggestedUpgrade: string | null;
  /* -- Legacy compatibility -- */
  /** @deprecated use maxUsers */
  planBaseUsers: number | null;
  /** @deprecated use extraClientsPurchased */
  extraUsersPurchased: number;
  /** @deprecated use maxUsers */
  effectiveMaxUsers: number | null;
  /** @deprecated use pricePerExtraClient */
  pricePerExtraUser: number;
  /** @deprecated use availableSlots */
  availableSeats: number | null;
}

export interface PurchaseSeatsResult {
  success: boolean;
  invoiceId?: string;
  accountReceivableId?: string;
  pixPayload?: string | null;
  pixQrBase64?: string | null;
  totalAmount: number;
  error?: string;
}

export interface BillingConfig {
  pix_key: string;
  pix_key_type: string;
  pix_merchant_name: string;
  pix_merchant_city: string;
  asaas_enabled?: boolean;
  asaas_customer_name?: string;
  asaas_customer_email?: string;
  asaas_customer_cpf?: string;
  asaas_customer_phone?: string;
}

interface TenantRow {
  id: string;
  company_name?: string;
  plan?: string;
  max_users?: number | null;
  extra_users_purchased?: number;
  price_per_extra_user?: number;
  config?: Record<string, unknown> | string | null;
  slug?: string;
  pix_key?: string | null;
  pix_key_type?: string | null;
  pix_merchant_name?: string | null;
  pix_merchant_city?: string | null;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseConfig(config: unknown): Record<string, unknown> {
  if (!config) return {};
  if (typeof config === "string") {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  if (typeof config === "object") return config as Record<string, unknown>;
  return {};
}

async function generateBillingPix(params: {
  billingConfig: BillingConfig;
  amount: number;
  description: string;
  externalReference?: string;
}): Promise<{
  pixPayload: string | null;
  pixQrBase64: string | null;
  gatewayTransactionId?: string;
}> {
  const { billingConfig, amount, description, externalReference } = params;

  if (billingConfig.asaas_enabled && billingConfig.asaas_customer_cpf) {
    const response = await asaasCreateCharge({
      amount_cents: Math.round(amount * 100),
      method: "pix",
      description,
      external_reference: externalReference,
      customer: {
        name: billingConfig.asaas_customer_name ?? "Radul",
        email: billingConfig.asaas_customer_email ?? null,
        cpfCnpj: billingConfig.asaas_customer_cpf ?? null,
        phone: billingConfig.asaas_customer_phone ?? null,
      },
    });

    return {
      pixPayload: response.pixCopyPaste ?? null,
      pixQrBase64: response.pixQrCodeBase64 ?? null,
      gatewayTransactionId: response.transactionId,
    };
  }

  const pixParams = {
    pixKey: billingConfig.pix_key,
    merchantName: billingConfig.pix_merchant_name,
    merchantCity: billingConfig.pix_merchant_city,
    amount,
    txId: externalReference ? externalReference.slice(0, 25) : undefined,
    description: description.substring(0, 72),
  };

  const pixPayload = generatePixPayload(pixParams);
  let pixQrBase64: string | null = null;
  try {
    pixQrBase64 = await generatePixQRCodeBase64(pixParams);
  } catch {
    // QR is nice-to-have
  }

  return { pixPayload, pixQrBase64 };
}

/**
 * Get the Radul super-admin tenant (platform owner).
 * Looks for tenant with slug 'radul' or is_platform_root in config.
 */
async function findRadulTenant(): Promise<TenantRow | null> {
  try {
    // Try by slug first
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([
        { field: "slug", value: "radul", operator: "equal" },
      ]),
    });
    const tenants = normalizeCrudList<TenantRow>(res.data);
    if (tenants.length > 0) return tenants[0];

    // Fallback: search by company name
    const res2 = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([
        { field: "company_name", value: "%radul%", operator: "ilike" },
      ]),
    });
    const tenants2 = normalizeCrudList<TenantRow>(res2.data);
    return tenants2[0] ?? null;
  } catch (err) {
    console.error("[SaaS Billing] Failed to find Radul tenant:", err);
    return null;
  }
}

/**
 * Get the Radul tenant's billing PIX configuration.
 * Priority: direct columns > config.billing JSONB > hardcoded defaults
 */
async function getRadulBillingConfig(): Promise<BillingConfig> {
  const radul = await findRadulTenant();
  if (!radul) return RADUL_BILLING_DEFAULTS as BillingConfig;

  // Priority 1: direct columns on tenant row
  const directKey = radul.pix_key?.trim();
  if (directKey) {
    return {
      pix_key: directKey,
      pix_key_type: String(
        radul.pix_key_type ?? RADUL_BILLING_DEFAULTS.pix_key_type,
      ),
      pix_merchant_name: String(
        radul.pix_merchant_name ?? RADUL_BILLING_DEFAULTS.pix_merchant_name,
      ),
      pix_merchant_city: String(
        radul.pix_merchant_city ?? RADUL_BILLING_DEFAULTS.pix_merchant_city,
      ),
      asaas_enabled: false,
    };
  }

  // Priority 2: config.billing JSONB (legacy)
  const config = parseConfig(radul.config);
  const billing = (config.billing ?? {}) as Record<string, unknown>;

  return {
    pix_key: String(billing.pix_key ?? RADUL_BILLING_DEFAULTS.pix_key),
    pix_key_type: String(
      billing.pix_key_type ?? RADUL_BILLING_DEFAULTS.pix_key_type,
    ),
    pix_merchant_name: String(
      billing.pix_merchant_name ?? RADUL_BILLING_DEFAULTS.pix_merchant_name,
    ),
    pix_merchant_city: String(
      billing.pix_merchant_city ?? RADUL_BILLING_DEFAULTS.pix_merchant_city,
    ),
    asaas_enabled: Boolean(billing.asaas_enabled),
    asaas_customer_name: billing.asaas_customer_name
      ? String(billing.asaas_customer_name)
      : undefined,
    asaas_customer_email: billing.asaas_customer_email
      ? String(billing.asaas_customer_email)
      : undefined,
    asaas_customer_cpf: billing.asaas_customer_cpf
      ? String(billing.asaas_customer_cpf)
      : undefined,
    asaas_customer_phone: billing.asaas_customer_phone
      ? String(billing.asaas_customer_phone)
      : undefined,
  };
}

/**
 * Get PIX billing config for any tenant (by ID).
 * Priority: direct columns > config.billing JSONB > null
 */
export async function getTenantPixConfig(
  tenantId: string,
): Promise<BillingConfig | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([{ field: "id", value: tenantId }]),
    });
    const tenants = normalizeCrudList<TenantRow>(res.data);
    const t = tenants[0];
    if (!t) return null;

    const directKey = (t.pix_key ?? "").toString().trim();
    if (directKey) {
      return {
        pix_key: directKey,
        pix_key_type: String(t.pix_key_type ?? "cnpj"),
        pix_merchant_name: String(t.pix_merchant_name ?? t.company_name ?? ""),
        pix_merchant_city: String(t.pix_merchant_city ?? ""),
      };
    }

    // Fallback: config.billing JSONB
    const config = parseConfig(t.config);
    const billing = (config.billing ?? {}) as Record<string, unknown>;
    const key = String(billing.pix_key ?? "").trim();
    if (!key) return null;

    return {
      pix_key: key,
      pix_key_type: String(billing.pix_key_type ?? "cnpj"),
      pix_merchant_name: String(
        billing.pix_merchant_name ?? t.company_name ?? "",
      ),
      pix_merchant_city: String(billing.pix_merchant_city ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * Get PIX billing config for a partner (by ID).
 * Uses direct columns pix_key, pix_key_type, pix_merchant_name, pix_merchant_city.
 */
export async function getPartnerPixConfig(
  partnerId: string,
): Promise<BillingConfig | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "partners",
      ...buildSearchParams([{ field: "id", value: partnerId }]),
    });
    const partners = normalizeCrudList<Record<string, unknown>>(res.data);
    const p = partners[0];
    if (!p) return null;

    const key = String(p.pix_key ?? "").trim();
    if (!key) return null;

    return {
      pix_key: key,
      pix_key_type: String(p.pix_key_type ?? "cnpj"),
      pix_merchant_name: String(p.pix_merchant_name ?? p.display_name ?? ""),
      pix_merchant_city: String(p.pix_merchant_city ?? ""),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Core Functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Fetch current user count for a tenant.
 */
export async function getTenantUserCount(tenantId: string): Promise<number> {
  try {
    const rows = await aggregateCrud<{ total: string }>(
      "user_tenants",
      [{ function: "COUNT", field: "user_id", alias: "total" }],
      { filters: [{ field: "tenant_id", value: tenantId }] },
    );
    return Number(rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Fetch current customer count for a tenant.
 */
export async function getTenantCustomerCount(
  tenantId: string,
): Promise<number> {
  try {
    const rows = await aggregateCrud<{ total: string }>(
      "customers",
      [{ function: "COUNT", field: "id", alias: "total" }],
      { filters: [{ field: "tenant_id", value: tenantId }] },
    );
    return Number(rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Get a tenant's full info including billing columns.
 */
async function getTenantInfo(tenantId: string): Promise<TenantRow | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([{ field: "id", value: tenantId }]),
    });
    const tenants = normalizeCrudList<TenantRow>(res.data);
    return tenants[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the count of ACTIVE customers for a tenant.
 * "Active" = `last_interaction_at` within the last 90 days.
 * Falls back to total customer count if `last_interaction_at` column is not yet populated.
 */
export async function getTenantActiveCustomerCount(
  tenantId: string,
): Promise<{ active: number; total: number }> {
  try {
    // Total count (all stored customers)
    const totalRows = await aggregateCrud<{ total: string }>(
      "customers",
      [{ function: "COUNT", field: "id", alias: "total" }],
      { filters: [{ field: "tenant_id", value: tenantId }] },
    );
    const total = Number(totalRows[0]?.total ?? 0);

    // Try to count active (last_interaction_at within 90 days)
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - ACTIVE_CLIENT_WINDOW_DAYS);
      const cutoffStr = cutoff.toISOString().split("T")[0];

      const activeRows = await aggregateCrud<{ total: string }>(
        "customers",
        [{ function: "COUNT", field: "id", alias: "total" }],
        {
          filters: [
            { field: "tenant_id", value: tenantId },
            {
              field: "last_interaction_at",
              value: cutoffStr,
              operator: "gte",
            },
          ],
        },
      );
      const active = Number(activeRows[0]?.total ?? 0);
      // If active is 0 but total > 0, column may not be populated yet -> fallback
      if (active === 0 && total > 0) return { active: total, total };
      return { active, total };
    } catch {
      // Column doesn't exist yet — fallback to total
      return { active: total, total };
    }
  } catch {
    return { active: 0, total: 0 };
  }
}

/**
 * Get the effective limits for a tenant.
 * Active-client-tier model: limits are based on ACTIVE customer count (90-day window).
 * Free plan also limits users to 3.
 */
export async function getTenantLimits(tenantId: string): Promise<TenantLimits> {
  const [tenant, userCount, customerCounts] = await Promise.all([
    getTenantInfo(tenantId),
    getTenantUserCount(tenantId),
    getTenantActiveCustomerCount(tenantId),
  ]);

  const { active: activeCustomerCount, total: totalStoredCustomers } =
    customerCounts;
  const planKey = tenant?.plan ?? "free";
  const planTier = PLAN_TIERS[planKey] ?? PLAN_TIERS.free;
  const baseLimits = PLAN_BASE_LIMITS[planKey] ?? PLAN_BASE_LIMITS.free;
  const extraClients = Number(tenant?.extra_users_purchased ?? 0);

  // Effective max ACTIVE customers: planBase + any purchased extras (Enterprise)
  let effectiveMaxCustomers: number | null;
  if (planTier.maxCustomers != null) {
    effectiveMaxCustomers = planTier.maxCustomers + extraClients;
  } else {
    effectiveMaxCustomers = null; // Enterprise unlimited
  }

  const availableSlots =
    effectiveMaxCustomers != null
      ? Math.max(0, effectiveMaxCustomers - activeCustomerCount)
      : null;

  const isAtLimit =
    effectiveMaxCustomers != null &&
    activeCustomerCount >= effectiveMaxCustomers;
  const usagePercent =
    effectiveMaxCustomers != null && effectiveMaxCustomers > 0
      ? Math.min((activeCustomerCount / effectiveMaxCustomers) * 100, 100)
      : 0;
  const isNearLimit = usagePercent >= 80 && !isAtLimit;

  // User limits (Free = 3, paid = unlimited)
  const maxUsersForPlan = baseLimits.maxUsers;
  const isUserAtLimit = maxUsersForPlan != null && userCount >= maxUsersForPlan;
  const userUsagePercent =
    maxUsersForPlan != null && maxUsersForPlan > 0
      ? Math.min((userCount / maxUsersForPlan) * 100, 100)
      : 0;
  const isUserNearLimit = userUsagePercent >= 80 && !isUserAtLimit;

  // Suggest next tier if at limit or near limit
  let suggestedUpgrade: string | null = null;
  if (isAtLimit || isNearLimit || isUserAtLimit) {
    const currentIndex = PLAN_ORDER.indexOf(planKey);
    if (currentIndex >= 0 && currentIndex < PLAN_ORDER.length - 1) {
      suggestedUpgrade = PLAN_ORDER[currentIndex + 1];
    }
  }

  return {
    plan: planKey,
    planTier,
    planBaseCustomers: baseLimits.maxCustomers,
    extraClientsPurchased: extraClients,
    effectiveMaxCustomers,
    currentCustomers: activeCustomerCount,
    totalStoredCustomers,
    availableSlots,
    isAtLimit,
    isNearLimit,
    usagePercent,
    monthlyPrice: planTier.monthlyPrice,
    currentUsers: userCount,
    maxUsers: maxUsersForPlan,
    isUserAtLimit,
    isUserNearLimit,
    userUsagePercent,
    pricePerExtraClient: ENTERPRISE_PRICE_PER_CLIENT,
    suggestedUpgrade,
    // Legacy compatibility
    planBaseUsers: maxUsersForPlan,
    extraUsersPurchased: extraClients,
    effectiveMaxUsers: maxUsersForPlan,
    pricePerExtraUser: ENTERPRISE_PRICE_PER_CLIENT,
    availableSeats: null,
  };
}

/**
 * Check if a tenant can add more clients (customers).
 * Returns true if under the limit (or unlimited).
 */
export async function canAddClient(tenantId: string): Promise<boolean> {
  const limits = await getTenantLimits(tenantId);
  return !limits.isAtLimit;
}

/**
 * Check if a tenant can add more users.
 * Free plan: max 3 users. Paid plans: unlimited.
 */
export async function canAddUser(tenantId: string): Promise<boolean> {
  const limits = await getTenantLimits(tenantId);
  return !limits.isUserAtLimit;
}

/**
 * Subscribe a tenant to a plan (or upgrade).
 *
 * Creates:
 * 1. Invoice on the Radul tenant (the platform creditor)
 * 2. InvoiceItem for the plan subscription
 * 3. AccountReceivable on the Radul tenant (recurrence: "monthly") with PIX QR
 *
 * Returns PIX payload + QR for first month's payment.
 */
export async function subscribeToPlan(
  buyerTenantId: string,
  targetPlan: string,
): Promise<PurchaseSeatsResult> {
  try {
    const tier = PLAN_TIERS[targetPlan];
    if (!tier) {
      return {
        success: false,
        totalAmount: 0,
        error: `Plano "${targetPlan}" não existe`,
      };
    }

    if (tier.monthlyPrice == null || tier.monthlyPrice <= 0) {
      return {
        success: false,
        totalAmount: 0,
        error: `Plano "${tier.label}" requer negociação. Entre em contato.`,
      };
    }

    // Get buyer tenant info
    const buyer = await getTenantInfo(buyerTenantId);
    if (!buyer) {
      return { success: false, totalAmount: 0, error: "Tenant não encontrado" };
    }

    const totalAmount = tier.monthlyPrice;
    const buyerName = buyer.company_name ?? "Tenant";

    // Get Radul tenant (creditor)
    const radul = await findRadulTenant();
    if (!radul) {
      return {
        success: false,
        totalAmount,
        error:
          "Tenant Radul (super admin) não encontrado. Configure o tenant com slug 'radul'.",
      };
    }

    // Get billing PIX config
    const billingConfig = await getRadulBillingConfig();
    if (!billingConfig.pix_key) {
      return {
        success: false,
        totalAmount,
        error:
          "Chave PIX da Radul não configurada. Atualize tenants.config.billing.pix_key",
      };
    }

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 3); // 3 days to pay first month

    const competenceDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const invoiceTitle = `Plano ${tier.label} — ${buyerName}`;
    const description = `Assinatura mensal Plano ${tier.label} — ${buyerName} (Tenant: ${buyerTenantId})`;

    // 1. Create Invoice on Radul tenant
    const invoice = await createInvoice({
      tenant_id: radul.id,
      title: invoiceTitle,
      description,
      status: "sent",
      subtotal: totalAmount,
      discount: 0,
      tax: 0,
      total: totalAmount,
      issued_at: now.toISOString(),
      due_at: dueDate.toISOString(),
      pix_key: billingConfig.pix_key,
      pix_key_type: billingConfig.pix_key_type as any,
      notes: JSON.stringify({
        type: "saas_plan_subscription",
        buyer_tenant_id: buyerTenantId,
        buyer_tenant_name: buyerName,
        target_plan: targetPlan,
        monthly_price: totalAmount,
        is_initial: true,
        competence: competenceDate,
      }),
    });

    // 2. Create Invoice Item
    await createInvoiceItem({
      invoice_id: invoice.id,
      description: `Plano ${tier.label} (mensal) — até ${tier.maxCustomers ?? "∞"} clientes`,
      quantity: 1,
      unit_price: totalAmount,
      subtotal: totalAmount,
      sort_order: 1,
    });

    // 3. Recalculate invoice totals
    await recalculateInvoice(invoice.id);

    // 4. Generate PIX payload & QR code
    const { pixPayload, pixQrBase64, gatewayTransactionId } =
      await generateBillingPix({
        billingConfig,
        amount: totalAmount,
        description: `Plano ${tier.label} - ${buyerName}`,
        externalReference: invoice.id,
      });

    // 5. Create Accounts Receivable on Radul tenant (monthly recurrence)
    const saasChartAccountId = await resolveChartAccountId(
      radul.id,
      KNOWN_ACCOUNT_CODES.MENSALIDADES,
    );
    const ar = await createAccountReceivable({
      tenant_id: radul.id,
      description,
      type: "service_fee",
      category: `SaaS - Plano ${tier.label}`,
      invoice_id: invoice.id,
      amount: totalAmount,
      amount_received: 0,
      status: "pending",
      currency: "BRL",
      due_date: dueDate.toISOString().split("T")[0],
      competence_date: competenceDate,
      payment_method: "pix",
      pix_key: billingConfig.pix_key,
      pix_key_type: billingConfig.pix_key_type as any,
      pix_payload: pixPayload ?? undefined,
      pix_qr_base64: pixQrBase64 ?? undefined,
      recurrence: "monthly",
      chart_account_id: saasChartAccountId,
      notes: JSON.stringify({
        type: "saas_plan_subscription",
        buyer_tenant_id: buyerTenantId,
        buyer_tenant_name: buyerName,
        target_plan: targetPlan,
        monthly_price: totalAmount,
        is_initial: true,
        competence: competenceDate,
        invoice_id: invoice.id,
        asaas_transaction_id: gatewayTransactionId ?? null,
      }),
    });

    return {
      success: true,
      invoiceId: invoice.id,
      accountReceivableId: ar.id,
      pixPayload,
      pixQrBase64,
      totalAmount,
    };
  } catch (err) {
    console.error("[SaaS Billing] subscribeToPlan error:", err);
    return {
      success: false,
      totalAmount: 0,
      error: getApiErrorMessage(err, "Erro ao processar assinatura"),
    };
  }
}

/**
 * Purchase extra client slots for Enterprise plan (R$ 0,20/client/month).
 */
export async function purchaseExtraClients(
  buyerTenantId: string,
  quantity: number,
): Promise<PurchaseSeatsResult> {
  try {
    if (quantity < 1 || quantity > 10000) {
      return {
        success: false,
        totalAmount: 0,
        error: "Quantidade inválida (1-10.000)",
      };
    }

    const buyer = await getTenantInfo(buyerTenantId);
    if (!buyer) {
      return { success: false, totalAmount: 0, error: "Tenant não encontrado" };
    }

    if (buyer.plan !== "enterprise") {
      return {
        success: false,
        totalAmount: 0,
        error:
          "Compra de clientes extras disponível apenas no plano Enterprise",
      };
    }

    const totalAmount = Number(
      (ENTERPRISE_PRICE_PER_CLIENT * quantity).toFixed(2),
    );
    const buyerName = buyer.company_name ?? "Tenant";

    const radul = await findRadulTenant();
    if (!radul) {
      return {
        success: false,
        totalAmount,
        error:
          "Tenant Radul (super admin) não encontrado. Configure o tenant com slug 'radul'.",
      };
    }

    const billingConfig = await getRadulBillingConfig();
    if (!billingConfig.pix_key) {
      return {
        success: false,
        totalAmount,
        error: "Chave PIX da Radul não configurada.",
      };
    }

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 3);
    const competenceDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const invoiceTitle = `${quantity} cliente(s) extra — ${buyerName}`;
    const description = `Mensalidade ${quantity}x cliente(s) adicional(is) — ${buyerName} (Tenant: ${buyerTenantId})`;

    const invoice = await createInvoice({
      tenant_id: radul.id,
      title: invoiceTitle,
      description,
      status: "sent",
      subtotal: totalAmount,
      discount: 0,
      tax: 0,
      total: totalAmount,
      issued_at: now.toISOString(),
      due_at: dueDate.toISOString(),
      pix_key: billingConfig.pix_key,
      pix_key_type: billingConfig.pix_key_type as any,
      notes: JSON.stringify({
        type: "saas_extra_clients",
        buyer_tenant_id: buyerTenantId,
        buyer_tenant_name: buyerName,
        quantity,
        price_per_unit: ENTERPRISE_PRICE_PER_CLIENT,
        is_initial: true,
        competence: competenceDate,
      }),
    });

    await createInvoiceItem({
      invoice_id: invoice.id,
      description: `Cliente adicional (mensal) — R$ ${ENTERPRISE_PRICE_PER_CLIENT.toFixed(2)}/cliente`,
      quantity,
      unit_price: ENTERPRISE_PRICE_PER_CLIENT,
      subtotal: totalAmount,
      sort_order: 1,
    });

    await recalculateInvoice(invoice.id);

    const { pixPayload, pixQrBase64, gatewayTransactionId } =
      await generateBillingPix({
        billingConfig,
        amount: totalAmount,
        description: `${quantity}x cliente extra - ${buyerName}`,
        externalReference: invoice.id,
      });

    const extraChartAccountId = await resolveChartAccountId(
      radul.id,
      KNOWN_ACCOUNT_CODES.MENSALIDADES,
    );
    const ar = await createAccountReceivable({
      tenant_id: radul.id,
      description,
      type: "service_fee",
      category: "SaaS - Clientes Extra",
      invoice_id: invoice.id,
      amount: totalAmount,
      amount_received: 0,
      status: "pending",
      currency: "BRL",
      due_date: dueDate.toISOString().split("T")[0],
      competence_date: competenceDate,
      payment_method: "pix",
      pix_key: billingConfig.pix_key,
      pix_key_type: billingConfig.pix_key_type as any,
      pix_payload: pixPayload ?? undefined,
      pix_qr_base64: pixQrBase64 ?? undefined,
      recurrence: "monthly",
      chart_account_id: extraChartAccountId,
      notes: JSON.stringify({
        type: "saas_extra_clients",
        buyer_tenant_id: buyerTenantId,
        buyer_tenant_name: buyerName,
        quantity,
        price_per_unit: ENTERPRISE_PRICE_PER_CLIENT,
        is_initial: true,
        competence: competenceDate,
        invoice_id: invoice.id,
        asaas_transaction_id: gatewayTransactionId ?? null,
      }),
    });

    return {
      success: true,
      invoiceId: invoice.id,
      accountReceivableId: ar.id,
      pixPayload,
      pixQrBase64,
      totalAmount,
    };
  } catch (err) {
    console.error("[SaaS Billing] purchaseExtraClients error:", err);
    return {
      success: false,
      totalAmount: 0,
      error: getApiErrorMessage(err, "Erro ao processar compra"),
    };
  }
}

/**
 * Legacy wrapper — kept for backward compat. Calls subscribeToPlan.
 * @deprecated Use subscribeToPlan or purchaseExtraClients instead.
 */
export async function purchaseUserSeats(
  buyerTenantId: string,
  quantity: number,
): Promise<PurchaseSeatsResult> {
  // In the new model, this maps to buying extra Enterprise clients
  return purchaseExtraClients(buyerTenantId, quantity);
}

/**
 * Confirm payment and process the billing cycle.
 *
 * Called by the admin (super admin) after verifying PIX payment.
 * Works for both plan subscriptions and extra client purchases.
 *
 * For INITIAL payments (is_initial = true):
 *   - Plan subscription: activates the new plan on the buyer tenant
 *   - Extra clients: increments extra_users_purchased on buyer tenant
 *   - Generates next month's AR + Invoice automatically
 *
 * For RENEWAL payments (is_initial = false):
 *   - Does NOT change tenant plan or extras (already active)
 *   - Generates next month's AR + Invoice automatically
 *
 * Always:
 *   - AR entry status → "paid"
 *   - Invoice status → "paid"
 *   - Next month's AR auto-generated with recurrence_parent_id
 */
export async function confirmSeatPayment(
  accountReceivableId: string,
  confirmedBy?: string,
): Promise<{ success: boolean; error?: string; nextArId?: string }> {
  try {
    // Fetch the AR entry
    const arRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "accounts_receivable",
      ...buildSearchParams([{ field: "id", value: accountReceivableId }]),
    });
    const arEntries = normalizeCrudList<Record<string, unknown>>(arRes.data);
    const ar = arEntries[0];
    if (!ar) return { success: false, error: "Conta a receber não encontrada" };

    // Parse the notes to get buyer info
    let notes: Record<string, unknown> = {};
    try {
      notes = JSON.parse(String(ar.notes ?? "{}"));
    } catch {
      /* empty */
    }

    const noteType = String(notes.type ?? "");
    const isSaasBilling = [
      "saas_user_seats",
      "saas_plan_subscription",
      "saas_extra_clients",
    ].includes(noteType);

    if (!isSaasBilling) {
      return {
        success: false,
        error: "Esta conta não é uma assinatura SaaS",
      };
    }

    const buyerTenantId = String(notes.buyer_tenant_id ?? "");
    const isInitial = notes.is_initial === true;

    if (!buyerTenantId) {
      return {
        success: false,
        error: "Dados de compra inválidos na conta a receber",
      };
    }

    // 1. Mark AR as paid
    await updateAccountReceivable({
      id: accountReceivableId,
      status: "paid",
      amount_received: Number(ar.amount ?? 0),
      received_at: new Date().toISOString(),
      confirmed_by: confirmedBy ?? undefined,
      confirmed_at: new Date().toISOString(),
    } as any);

    // 2. Mark invoice as paid (if linked)
    const invoiceId = String(ar.invoice_id ?? notes.invoice_id ?? "");
    if (invoiceId) {
      try {
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "invoices",
          payload: {
            id: invoiceId,
            status: "paid",
            paid_at: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.warn("[SaaS Billing] Failed to update invoice status:", err);
      }
    }

    // 3. On INITIAL payment, activate the subscription
    if (isInitial) {
      const buyer = await getTenantInfo(buyerTenantId);
      if (!buyer) {
        return {
          success: false,
          error: `Tenant comprador ${buyerTenantId} não encontrado`,
        };
      }

      if (noteType === "saas_plan_subscription") {
        // Activate plan
        const targetPlan = String(notes.target_plan ?? "");
        if (targetPlan && PLAN_TIERS[targetPlan]) {
          await api.post(CRUD_ENDPOINT, {
            action: "update",
            table: "tenants",
            payload: {
              id: buyerTenantId,
              plan: targetPlan,
            },
          });
        }
      } else if (
        noteType === "saas_extra_clients" ||
        noteType === "saas_user_seats"
      ) {
        // Add extra client slots (reusing extra_users_purchased column)
        const quantity = Number(notes.quantity ?? 0);
        if (quantity > 0) {
          const currentExtra = Number(buyer.extra_users_purchased ?? 0);
          const newExtra = currentExtra + quantity;
          await api.post(CRUD_ENDPOINT, {
            action: "update",
            table: "tenants",
            payload: {
              id: buyerTenantId,
              extra_users_purchased: newExtra,
            },
          });
        }
      }
    }

    // 3.1 Activate channel referral on first plan payment
    if (isInitial && noteType === "saas_plan_subscription") {
      try {
        const referral = await getReferralByTenantId(buyerTenantId);
        if (referral && referral.status === "pending") {
          await updateReferralStatus(referral.id, "active");
        }
      } catch (err) {
        console.warn(
          "[SaaS Billing] Failed to activate channel referral:",
          err,
        );
      }
    }

    // 4. Auto-generate next month's billing (AR + Invoice)
    let nextArId: string | undefined;
    try {
      const nextResult = await generateNextMonthBilling(
        accountReceivableId,
        notes,
        ar,
      );
      nextArId = nextResult?.arId;
    } catch (err) {
      console.warn(
        "[SaaS Billing] Failed to generate next month billing:",
        err,
      );
    }

    return { success: true, nextArId };
  } catch (err) {
    console.error("[SaaS Billing] confirmSeatPayment error:", err);
    return {
      success: false,
      error: getApiErrorMessage(err, "Erro ao confirmar pagamento"),
    };
  }
}

/**
 * Auto-generate next month's Invoice + AR entry when the current month is paid.
 * Works for both plan subscriptions and extra client purchases.
 */
async function generateNextMonthBilling(
  parentArId: string,
  parentNotes: Record<string, unknown>,
  parentAr: Record<string, unknown>,
): Promise<{ arId: string; invoiceId: string } | null> {
  const buyerTenantId = String(parentNotes.buyer_tenant_id ?? "");
  const buyerName = String(parentNotes.buyer_tenant_name ?? "Tenant");
  const noteType = String(parentNotes.type ?? "");
  const totalAmount = Number(parentNotes.monthly_price ?? parentAr.amount ?? 0);

  if (!buyerTenantId || totalAmount <= 0) return null;

  // Calculate next month's competence and due date
  const currentCompetence = String(parentNotes.competence ?? "");
  const nextCompetence = getNextMonthCompetence(currentCompetence);
  const nextDueDate = getNextMonthDueDate(nextCompetence);

  // Get Radul tenant
  const radul = await findRadulTenant();
  if (!radul) return null;

  const billingConfig = await getRadulBillingConfig();
  if (!billingConfig.pix_key) return null;

  const now = new Date();

  // Build descriptions based on type
  let invoiceTitle: string;
  let description: string;
  let category: string;
  let itemDescription: string;

  if (noteType === "saas_plan_subscription") {
    const targetPlan = String(parentNotes.target_plan ?? "");
    const tier = PLAN_TIERS[targetPlan];
    const planLabel = tier?.label ?? targetPlan;
    invoiceTitle = `Plano ${planLabel} — ${buyerName}`;
    description = `Assinatura mensal Plano ${planLabel} — ${buyerName} (Tenant: ${buyerTenantId})`;
    category = `SaaS - Plano ${planLabel}`;
    itemDescription = `Plano ${planLabel} (mensal) — até ${tier?.maxCustomers ?? "∞"} clientes`;
  } else {
    const quantity = Number(parentNotes.quantity ?? 0);
    invoiceTitle = `${quantity} cliente(s) extra — ${buyerName}`;
    description = `Mensalidade ${quantity}x cliente(s) adicional(is) — ${buyerName} (Tenant: ${buyerTenantId})`;
    category = "SaaS - Clientes Extra";
    itemDescription = `Cliente adicional (mensal) — R$ ${ENTERPRISE_PRICE_PER_CLIENT.toFixed(2)}/cliente`;
  }

  // 1. Create Invoice for next month
  const invoice = await createInvoice({
    tenant_id: radul.id,
    title: invoiceTitle,
    description,
    status: "sent",
    subtotal: totalAmount,
    discount: 0,
    tax: 0,
    total: totalAmount,
    issued_at: now.toISOString(),
    due_at: `${nextDueDate}T23:59:59.000Z`,
    pix_key: billingConfig.pix_key,
    pix_key_type: billingConfig.pix_key_type as any,
    notes: JSON.stringify({
      ...parentNotes,
      is_initial: false,
      competence: nextCompetence,
    }),
  });

  // 2. Create Invoice Item
  const quantity = Number(parentNotes.quantity ?? 1);
  const unitPrice = quantity > 0 ? totalAmount / quantity : totalAmount;
  await createInvoiceItem({
    invoice_id: invoice.id,
    description: itemDescription,
    quantity,
    unit_price: unitPrice,
    subtotal: totalAmount,
    sort_order: 1,
  });

  await recalculateInvoice(invoice.id);

  // 3. Generate PIX for next month
  const { pixPayload, pixQrBase64, gatewayTransactionId } =
    await generateBillingPix({
      billingConfig,
      amount: totalAmount,
      description: invoiceTitle,
      externalReference: invoice.id,
    });

  // 4. Create AR entry for next month (linked to parent via recurrence_parent_id)
  const nextChartAccountId = await resolveChartAccountId(
    radul.id,
    KNOWN_ACCOUNT_CODES.MENSALIDADES,
  );
  const ar = await createAccountReceivable({
    tenant_id: radul.id,
    description,
    type: "service_fee",
    category,
    invoice_id: invoice.id,
    amount: totalAmount,
    amount_received: 0,
    status: "pending",
    currency: "BRL",
    due_date: nextDueDate,
    competence_date: nextCompetence,
    payment_method: "pix",
    pix_key: billingConfig.pix_key,
    pix_key_type: billingConfig.pix_key_type as any,
    pix_payload: pixPayload ?? undefined,
    pix_qr_base64: pixQrBase64 ?? undefined,
    recurrence: "monthly",
    recurrence_parent_id: parentArId,
    chart_account_id: nextChartAccountId,
    notes: JSON.stringify({
      ...parentNotes,
      is_initial: false,
      competence: nextCompetence,
      invoice_id: invoice.id,
      asaas_transaction_id: gatewayTransactionId ?? null,
    }),
  });

  return { arId: ar.id, invoiceId: invoice.id };
}

/**
 * Calculate next month's competence date (YYYY-MM-01).
 */
function getNextMonthCompetence(currentCompetence: string): string {
  let year: number;
  let month: number;

  if (currentCompetence && /^\d{4}-\d{2}/.test(currentCompetence)) {
    const parts = currentCompetence.split("-");
    year = Number(parts[0]);
    month = Number(parts[1]);
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  // Advance one month
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }

  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Calculate a due date for a given competence month (5th of that month).
 */
function getNextMonthDueDate(competence: string): string {
  const parts = competence.split("-");
  return `${parts[0]}-${parts[1]}-05`;
}

/**
 * List pending SaaS billing entries for the Radul super-admin to review.
 */
export async function listPendingSeatPurchases(
  radulTenantId: string,
): Promise<Record<string, unknown>[]> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "accounts_receivable",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: radulTenantId },
          {
            field: "category",
            value: "%SaaS%",
            operator: "ilike",
          },
          { field: "status", value: "pending", operator: "equal" },
        ],
        { sortColumn: "created_at DESC" },
      ),
    });
    return normalizeCrudList<Record<string, unknown>>(res.data).filter(
      (item) => !item.deleted_at,
    );
  } catch {
    return [];
  }
}

/**
 * Get the Radul tenant ID (cached after first call within session).
 */
let _radulTenantIdCache: string | null = null;

export async function getRadulTenantId(): Promise<string | null> {
  if (_radulTenantIdCache) return _radulTenantIdCache;
  const radul = await findRadulTenant();
  if (radul) _radulTenantIdCache = radul.id;
  return _radulTenantIdCache;
}

/**
 * Get plan base limits for display.
 */
export function getPlanBaseLimits(plan: string) {
  return PLAN_BASE_LIMITS[plan] ?? PLAN_BASE_LIMITS.free;
}

/**
 * Get the recommended plan for a given customer count.
 */
export function getRecommendedPlan(customerCount: number): string {
  for (const planKey of PLAN_ORDER) {
    const tier = PLAN_TIERS[planKey];
    if (tier.maxCustomers == null || customerCount <= tier.maxCustomers) {
      return planKey;
    }
  }
  return "enterprise";
}

/**
 * Format plan price for display.
 */
export function formatPlanPrice(planKey: string): string {
  const tier = PLAN_TIERS[planKey];
  if (!tier) return "—";
  if (tier.monthlyPrice == null) return "Sob consulta";
  if (tier.monthlyPrice === 0) return "R$ 0";
  return `R$ ${tier.monthlyPrice}/mês`;
}
