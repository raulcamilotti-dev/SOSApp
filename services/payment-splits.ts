/**
 * PAYMENT SPLITS SERVICE
 *
 * Manages flexible distribution of payments between:
 * - Radul (platform)
 * - Tenant (company)
 * - Partner (service provider)
 *
 * Supports:
 * - Auto-calculation from split configurations
 * - Manual split definition
 * - Context-aware rules (marketplace, plan, process charge)
 * - Service/partner specific configurations
 */

import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import type { PaymentContext, SplitRecipient } from "./payment-gateway";

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

/** Split rule from configuration */
export interface SplitRule {
  recipient_type: "radul" | "tenant" | "partner";
  percentage?: number;
  fixed_amount?: number; // In cents
}

/** Split configuration from database */
export interface SplitConfiguration {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string;
  applies_to_context: PaymentContext | "all";
  applies_to_service_id: string | null;
  applies_to_partner_id: string | null;
  split_rules: SplitRule[];
  is_active: boolean;
  priority: number;
  deleted_at?: string | null;
}

/** Split creation request */
export interface CreateSplitRequest {
  payment_id: string;
  tenant_id?: string | null;
  splits: SplitRecipient[];
}

/** Split record in database */
export interface PaymentSplit {
  id: string;
  payment_id: string;
  tenant_id: string | null;
  recipient_type: "radul" | "tenant" | "partner";
  recipient_id: string | null;
  amount: number; // In BRL
  percentage: number | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  gateway_split_id: string | null;
  transferred_at: string | null;
  created_at: string;
  deleted_at?: string | null;
}

/* ═══════════════════════════════════════════════════════
 * SPLIT CONFIGURATION RETRIEVAL
 * ═══════════════════════════════════════════════════════ */

/**
 * Find the best matching split configuration for a payment context.
 *
 * Priority order:
 * 1. Specific service + specific partner
 * 2. Specific service + any partner
 * 3. Any service + specific partner
 * 4. Context-specific (marketplace, plan, process_charge)
 * 5. Global default ("all" context)
 */
export async function getSplitConfiguration(params: {
  context: PaymentContext;
  tenantId?: string | null;
  serviceId?: string | null;
  partnerId?: string | null;
}): Promise<SplitConfiguration | null> {
  try {
    const filters = [{ field: "is_active", value: "true" }];

    // Filter by tenant (null = platform-level configs)
    if (params.tenantId) {
      filters.push({ field: "tenant_id", value: params.tenantId });
    }

    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "split_configurations",
      ...buildSearchParams(filters, { sortColumn: "priority DESC" }),
    });

    const configs = normalizeCrudList<SplitConfiguration>(response.data).filter(
      (c) => !c.deleted_at,
    );

    if (configs.length === 0) return null;

    // Score each configuration by specificity
    const scored = configs
      .map((config) => {
        let score = config.priority;

        // Context match
        if (config.applies_to_context === params.context) {
          score += 100;
        } else if (config.applies_to_context === "all") {
          score += 10;
        } else {
          return null; // Doesn't match context
        }

        // Service match
        if (config.applies_to_service_id === params.serviceId) {
          score += 50;
        } else if (config.applies_to_service_id !== null) {
          return null; // Specific to different service
        }

        // Partner match
        if (config.applies_to_partner_id === params.partnerId) {
          score += 50;
        } else if (config.applies_to_partner_id !== null) {
          return null; // Specific to different partner
        }

        return { config, score };
      })
      .filter(
        (x): x is { config: SplitConfiguration; score: number } => x !== null,
      );

    if (scored.length === 0) return null;

    // Return highest scoring configuration
    scored.sort((a, b) => b.score - a.score);
    return scored[0].config;
  } catch (error) {
    console.error("Failed to get split configuration:", error);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
 * SPLIT CALCULATION
 * ═══════════════════════════════════════════════════════ */

/**
 * Calculate split amounts from configuration rules.
 *
 * Supports:
 * - Percentage-based splits
 * - Fixed amount splits
 * - Mixed (fixed + percentage on remainder)
 *
 * @param totalAmount - Total payment amount in cents
 * @param rules - Split rules from configuration
 * @param tenantId - Tenant ID for tenant recipient
 * @param partnerId - Partner ID for partner recipient
 * @returns Array of split recipients with calculated amounts
 */
export function calculateSplits(
  totalAmount: number,
  rules: SplitRule[],
  tenantId?: string | null,
  partnerId?: string | null,
): SplitRecipient[] {
  const splits: SplitRecipient[] = [];
  let remainingAmount = totalAmount;

  // Step 1: Process all fixed amounts first
  for (const rule of rules) {
    if (rule.fixed_amount !== null && rule.fixed_amount !== undefined) {
      const amount = Math.min(rule.fixed_amount, remainingAmount);

      splits.push({
        recipientType: rule.recipient_type,
        recipientId:
          rule.recipient_type === "radul"
            ? null
            : rule.recipient_type === "tenant"
              ? (tenantId ?? null)
              : (partnerId ?? null),
        amount,
        percentage: undefined,
      });

      remainingAmount -= amount;
    }
  }

  // Step 2: Process percentage splits on remaining amount
  const percentageRules = rules.filter(
    (r) => r.percentage !== null && r.percentage !== undefined,
  );

  for (const rule of percentageRules) {
    if (!rule.percentage) continue;

    // Calculate amount from percentage
    const amount = Math.round((remainingAmount * rule.percentage) / 100);

    splits.push({
      recipientType: rule.recipient_type,
      recipientId:
        rule.recipient_type === "radul"
          ? null
          : rule.recipient_type === "tenant"
            ? (tenantId ?? null)
            : (partnerId ?? null),
      amount,
      percentage: rule.percentage,
    });
  }

  // Step 3: Handle rounding errors - add remainder to first split
  const calculatedTotal = splits.reduce((sum, s) => sum + s.amount, 0);
  const roundingError = totalAmount - calculatedTotal;

  if (roundingError !== 0 && splits.length > 0) {
    splits[0].amount += roundingError;
  }

  // Step 4: Filter out splits for missing recipients (e.g., partner split when no partner)
  return splits.filter((split) => {
    if (split.recipientType === "radul") return true;
    if (split.recipientType === "tenant")
      return tenantId !== null && tenantId !== undefined;
    if (split.recipientType === "partner")
      return partnerId !== null && partnerId !== undefined;
    return true;
  });
}

/**
 * Auto-calculate splits for a payment based on context.
 *
 * Falls back to single recipient (tenant or platform) if no configuration found.
 */
export async function autoCalculateSplits(params: {
  totalAmount: number; // In cents
  context: PaymentContext;
  tenantId?: string | null;
  serviceId?: string | null;
  partnerId?: string | null;
}): Promise<SplitRecipient[]> {
  // Get matching configuration
  const config = await getSplitConfiguration({
    context: params.context,
    tenantId: params.tenantId,
    serviceId: params.serviceId,
    partnerId: params.partnerId,
  });

  if (config) {
    return calculateSplits(
      params.totalAmount,
      config.split_rules,
      params.tenantId,
      params.partnerId,
    );
  }

  // Fallback: default splits by context
  switch (params.context) {
    case "plan_subscription":
      // Platform receives 100%
      return [
        {
          recipientType: "radul",
          recipientId: null,
          amount: params.totalAmount,
          percentage: 100,
        },
      ];

    case "marketplace":
    case "process_charge":
      // Tenant receives 100% (no platform fee by default)
      if (params.tenantId) {
        return [
          {
            recipientType: "tenant",
            recipientId: params.tenantId,
            amount: params.totalAmount,
            percentage: 100,
          },
        ];
      }
      // Fallback to platform if no tenant
      return [
        {
          recipientType: "radul",
          recipientId: null,
          amount: params.totalAmount,
          percentage: 100,
        },
      ];

    default:
      // Unknown context - send to platform
      return [
        {
          recipientType: "radul",
          recipientId: null,
          amount: params.totalAmount,
          percentage: 100,
        },
      ];
  }
}

/* ═══════════════════════════════════════════════════════
 * DATABASE OPERATIONS
 * ═══════════════════════════════════════════════════════ */

/**
 * Save splits to database.
 */
export async function saveSplits(
  request: CreateSplitRequest,
): Promise<string[]> {
  try {
    const payloads = request.splits.map((split) => ({
      payment_id: request.payment_id,
      tenant_id: request.tenant_id,
      recipient_type: split.recipientType,
      recipient_id: split.recipientId,
      amount: split.amount / 100, // Convert cents to BRL
      percentage: split.percentage ?? null,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const response = await api.post(CRUD_ENDPOINT, {
      action: "batch_create",
      table: "payment_splits",
      payloads,
    });

    const created = Array.isArray(response.data) ? response.data : [];
    return created.map((s: any) => s.id);
  } catch (error) {
    console.error("Failed to save splits:", error);
    throw new Error(`Database error: ${getApiErrorMessage(error)}`);
  }
}

/**
 * Get splits for a payment.
 */
export async function getPaymentSplits(
  paymentId: string,
): Promise<PaymentSplit[]> {
  try {
    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "payment_splits",
      ...buildSearchParams([{ field: "payment_id", value: paymentId }]),
    });

    return normalizeCrudList<PaymentSplit>(response.data).filter(
      (s) => !s.deleted_at,
    );
  } catch (error) {
    console.error("Failed to get payment splits:", error);
    return [];
  }
}

/**
 * Update split status (e.g., mark as transferred).
 */
export async function updateSplitStatus(
  splitId: string,
  status: PaymentSplit["status"],
  transferReference?: string,
): Promise<void> {
  try {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "payment_splits",
      payload: {
        id: splitId,
        status,
        transferred_at:
          status === "completed" ? new Date().toISOString() : null,
        transfer_reference: transferReference ?? null,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to update split status:", error);
    throw new Error(`Database error: ${getApiErrorMessage(error)}`);
  }
}

/**
 * Get splits by recipient (for partner/tenant earnings tracking).
 */
export async function getSplitsByRecipient(
  recipientType: "radul" | "tenant" | "partner",
  recipientId?: string | null,
): Promise<PaymentSplit[]> {
  try {
    const filters = [
      { field: "recipient_type", value: recipientType as string },
    ];

    if (recipientType !== "radul" && recipientId) {
      filters.push({ field: "recipient_id", value: recipientId });
    }

    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "payment_splits",
      ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
    });

    return normalizeCrudList<PaymentSplit>(response.data).filter(
      (s) => !s.deleted_at,
    );
  } catch (error) {
    console.error("Failed to get splits by recipient:", error);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════
 * CONFIGURATION MANAGEMENT
 * ═══════════════════════════════════════════════════════ */

/**
 * Create a new split configuration.
 */
export async function createSplitConfiguration(config: {
  tenantId?: string | null;
  name: string;
  description?: string;
  appliesToContext: PaymentContext | "all";
  appliesToServiceId?: string | null;
  appliesToPartnerId?: string | null;
  splitRules: SplitRule[];
  isActive?: boolean;
  priority?: number;
  createdBy?: string;
}): Promise<string> {
  try {
    const payload = {
      tenant_id: config.tenantId,
      name: config.name,
      description: config.description ?? null,
      applies_to_context: config.appliesToContext,
      applies_to_service_id: config.appliesToServiceId ?? null,
      applies_to_partner_id: config.appliesToPartnerId ?? null,
      split_rules: config.splitRules,
      is_active: config.isActive ?? true,
      priority: config.priority ?? 0,
      created_by: config.createdBy ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const response = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "split_configurations",
      payload,
    });

    const created = Array.isArray(response.data)
      ? response.data[0]
      : response.data;
    return created?.id;
  } catch (error) {
    console.error("Failed to create split configuration:", error);
    throw new Error(`Database error: ${getApiErrorMessage(error)}`);
  }
}

/**
 * List split configurations for a tenant.
 */
export async function listSplitConfigurations(
  tenantId?: string | null,
): Promise<SplitConfiguration[]> {
  try {
    const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];

    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "split_configurations",
      ...buildSearchParams(filters, {
        sortColumn: "priority DESC, created_at DESC",
      }),
    });

    return normalizeCrudList<SplitConfiguration>(response.data).filter(
      (c) => !c.deleted_at,
    );
  } catch (error) {
    console.error("Failed to list split configurations:", error);
    return [];
  }
}
