/* ------------------------------------------------------------------ */
/*  Pack Billing Service (B.1)                                         */
/*                                                                     */
/*  Handles pricing & billing for marketplace packs.                   */
/*  Follows the same pattern as saas-billing.ts:                       */
/*    Invoice → InvoiceItem → recalculate → PIX → AR                  */
/*  All revenue goes to Radul tenant (platform owner).                 */
/* ------------------------------------------------------------------ */

import { api, getApiErrorMessage } from "./api";
import {
    KNOWN_ACCOUNT_CODES,
    resolveChartAccountId,
} from "./chart-of-accounts";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";
import {
    createAccountReceivable,
    createInvoice,
    createInvoiceItem,
    recalculateInvoice,
    updateAccountReceivable,
} from "./financial";
import type { MarketplacePack } from "./marketplace-packs";
import { asaasCreateCharge } from "./partner";
import { generatePixPayload, generatePixQRCodeBase64 } from "./pix";
import { getRadulTenantId, type BillingConfig } from "./saas-billing";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PackPurchaseResult {
  success: boolean;
  /** Error message on failure */
  error?: string;
  /** Invoice ID created on Radul tenant */
  invoiceId?: string;
  /** Accounts Receivable ID created on Radul tenant */
  accountReceivableId?: string;
  /** PIX copia-e-cola payload */
  pixPayload?: string | null;
  /** PIX QR code as base64 image */
  pixQrBase64?: string | null;
  /** Price in BRL (reais) */
  totalAmount: number;
  /** Whether the pack was installed immediately (free or trial) */
  installedImmediately?: boolean;
}

export interface PackPaymentConfirmResult {
  success: boolean;
  error?: string;
  /** Next month AR ID for monthly packs */
  nextArId?: string;
  /** Whether the pack was auto-installed after payment confirmation */
  installed?: boolean;
}

/** Notes JSONB stored in invoices/AR for pack purchases */
export interface PackBillingNotes {
  type: "marketplace_pack_one_time" | "marketplace_pack_monthly";
  pack_id: string;
  pack_name: string;
  pack_slug: string;
  builder_id: string;
  buyer_tenant_id: string;
  buyer_tenant_name: string;
  price_cents: number;
  pricing_type: "one_time" | "monthly";
  /** For monthly: whether this is the first charge (initial=true) or renewal */
  is_initial?: boolean;
  /** Competence month (YYYY-MM-01) for monthly charges */
  competence?: string;
  /** Parent invoice ID (for renewals) */
  invoice_id?: string;
  /** Gateway transaction ID (Asaas) */
  asaas_transaction_id?: string | null;
  /** Trial days for monthly packs */
  trial_days?: number;
  /** Trial end date ISO string */
  trial_end_date?: string;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

interface TenantRow {
  id: string;
  company_name?: string;
  slug?: string;
  pix_key?: string;
  pix_key_type?: string;
  pix_merchant_name?: string;
  pix_merchant_city?: string;
  config?: string | Record<string, unknown>;
}

const RADUL_BILLING_DEFAULTS = {
  pix_key: "",
  pix_key_type: "cpf",
  pix_merchant_name: "RADUL PLATFORM",
  pix_merchant_city: "SAO PAULO",
};

/** Get the Radul tenant row (platform owner). */
async function findRadulTenant(): Promise<TenantRow | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([
        { field: "slug", value: "radul", operator: "equal" },
      ]),
    });
    const tenants = normalizeCrudList<TenantRow>(res.data);
    if (tenants.length > 0) return tenants[0];

    // Fallback by company name
    const res2 = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([
        { field: "company_name", value: "%radul%", operator: "ilike" },
      ]),
    });
    const tenants2 = normalizeCrudList<TenantRow>(res2.data);
    return tenants2[0] ?? null;
  } catch {
    return null;
  }
}

/** Parse tenant config safely. */
function parseConfig(
  config: string | Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!config) return {};
  if (typeof config === "object") return config;
  try {
    return JSON.parse(config);
  } catch {
    return {};
  }
}

/** Get Radul's PIX billing config. */
async function getRadulBillingConfig(): Promise<BillingConfig> {
  const radul = await findRadulTenant();
  if (!radul) return RADUL_BILLING_DEFAULTS as BillingConfig;

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

  const cfg = parseConfig(radul.config);
  const billing = (cfg.billing ?? {}) as Record<string, unknown>;

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

/** Get buyer tenant info. */
async function getTenantInfo(tenantId: string): Promise<TenantRow | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tenants",
      ...buildSearchParams([{ field: "id", value: tenantId }]),
    });
    const list = normalizeCrudList<TenantRow>(res.data);
    return list[0] ?? null;
  } catch {
    return null;
  }
}

/** Generate PIX payload + QR code via Asaas or local pix-utils. */
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

  // Try Asaas gateway first (if configured)
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

  // Fallback: local PIX generation
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

/** Compute competence date string (YYYY-MM-01) from current date. */
function getCompetenceDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Compute next month competence from current competence string. */
function getNextMonthCompetence(current: string): string {
  if (!current) {
    const now = new Date();
    now.setMonth(now.getMonth() + 1);
    return getCompetenceDate(now);
  }
  const [year, month] = current.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

/** Compute due date for a competence period (5th of next month). */
function getDueDateForCompetence(competence: string): string {
  const [year, month] = competence.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-05`;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Check if a pack requires payment before installation.
 * Returns true for paid packs (one_time or monthly without active trial).
 */
export function packRequiresPayment(pack: MarketplacePack): boolean {
  if (pack.pricing_type === "free" || pack.price_cents <= 0) return false;
  return true;
}

/**
 * Format pack price for display.
 */
export function formatPackPrice(pack: MarketplacePack): string {
  if (pack.pricing_type === "free" || pack.price_cents <= 0) return "Grátis";
  const reais = pack.price_cents / 100;
  const formatted = reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
  if (pack.pricing_type === "monthly") return `${formatted}/mês`;
  return formatted;
}

/**
 * Purchase a marketplace pack.
 *
 * For FREE packs → returns immediately (no billing).
 * For PAID packs → creates Invoice + InvoiceItem + AR on Radul tenant + generates PIX.
 * For MONTHLY with trial_days > 0 → returns installedImmediately=true, charges after trial.
 *
 * Flow:
 *   1. Create Invoice on Radul tenant (creditor)
 *   2. Create InvoiceItem with pack details
 *   3. Recalculate invoice totals
 *   4. Generate PIX QR code
 *   5. Create Accounts Receivable record
 *   6. Return PIX data for the tenant admin to pay
 *
 * After payment is confirmed, call `confirmPackPayment()` to trigger installation.
 */
export async function purchasePack(
  buyerTenantId: string,
  pack: MarketplacePack,
): Promise<PackPurchaseResult> {
  try {
    // Free packs — no billing needed
    if (!packRequiresPayment(pack)) {
      return { success: true, totalAmount: 0, installedImmediately: true };
    }

    // Monthly with trial — install immediately, schedule first charge after trial
    if (pack.pricing_type === "monthly" && (pack as any).trial_days > 0) {
      return await createTrialInstall(buyerTenantId, pack);
    }

    // Paid pack — create billing artifacts
    const buyer = await getTenantInfo(buyerTenantId);
    if (!buyer) {
      return { success: false, totalAmount: 0, error: "Tenant não encontrado" };
    }

    const radul = await findRadulTenant();
    if (!radul) {
      return {
        success: false,
        totalAmount: 0,
        error:
          "Tenant Radul (super admin) não encontrado. Configure o tenant com slug 'radul'.",
      };
    }

    const billingConfig = await getRadulBillingConfig();
    if (!billingConfig.pix_key) {
      return {
        success: false,
        totalAmount: 0,
        error: "Chave PIX da Radul não configurada.",
      };
    }

    const totalAmount = pack.price_cents / 100; // Convert cents to BRL
    const buyerName = buyer.company_name ?? "Tenant";
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 3); // 3 days to pay

    const isMonthly = pack.pricing_type === "monthly";
    const noteType: PackBillingNotes["type"] = isMonthly
      ? "marketplace_pack_monthly"
      : "marketplace_pack_one_time";
    const competenceDate = isMonthly ? getCompetenceDate(now) : undefined;

    const invoiceTitle = `Pack "${pack.name}" — ${buyerName}`;
    const description = isMonthly
      ? `Assinatura mensal Pack "${pack.name}" — ${buyerName}`
      : `Compra Pack "${pack.name}" — ${buyerName}`;

    const notes: PackBillingNotes = {
      type: noteType,
      pack_id: pack.id,
      pack_name: pack.name,
      pack_slug: pack.slug,
      builder_id: pack.builder_id,
      buyer_tenant_id: buyerTenantId,
      buyer_tenant_name: buyerName,
      price_cents: pack.price_cents,
      pricing_type: pack.pricing_type as "one_time" | "monthly",
      is_initial: true,
      competence: competenceDate,
    };

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
      notes: JSON.stringify(notes),
    });

    // 2. Create Invoice Item
    await createInvoiceItem({
      invoice_id: invoice.id,
      description: isMonthly
        ? `Pack "${pack.name}" (mensal)`
        : `Pack "${pack.name}" (compra única)`,
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
        description: `Pack ${pack.name} - ${buyerName}`,
        externalReference: invoice.id,
      });

    // 5. Create Accounts Receivable on Radul tenant
    const chartAccountId = await resolveChartAccountId(
      radul.id,
      KNOWN_ACCOUNT_CODES.MENSALIDADES,
    );

    const arNotes: PackBillingNotes = {
      ...notes,
      invoice_id: invoice.id,
      asaas_transaction_id: gatewayTransactionId ?? null,
    };

    const ar = await createAccountReceivable({
      tenant_id: radul.id,
      description,
      type: "service_fee",
      category: `Marketplace - Pack "${pack.name}"`,
      invoice_id: invoice.id,
      amount: totalAmount,
      amount_received: 0,
      status: "pending",
      currency: "BRL",
      due_date: dueDate.toISOString().split("T")[0],
      competence_date: competenceDate ?? dueDate.toISOString().split("T")[0],
      payment_method: "pix",
      pix_key: billingConfig.pix_key,
      pix_key_type: billingConfig.pix_key_type as any,
      pix_payload: pixPayload ?? undefined,
      pix_qr_base64: pixQrBase64 ?? undefined,
      recurrence: isMonthly ? "monthly" : undefined,
      chart_account_id: chartAccountId,
      notes: JSON.stringify(arNotes),
    });

    return {
      success: true,
      invoiceId: invoice.id,
      accountReceivableId: ar.id,
      pixPayload,
      pixQrBase64,
      totalAmount,
      installedImmediately: false,
    };
  } catch (err) {
    console.error("[Pack Billing] purchasePack error:", err);
    return {
      success: false,
      totalAmount: 0,
      error: getApiErrorMessage(err, "Erro ao processar compra do pack"),
    };
  }
}

/**
 * Create a trial install for a monthly pack with trial_days > 0.
 * Installs immediately; first charge is scheduled after the trial period.
 */
async function createTrialInstall(
  buyerTenantId: string,
  pack: MarketplacePack,
): Promise<PackPurchaseResult> {
  const buyer = await getTenantInfo(buyerTenantId);
  if (!buyer) {
    return { success: false, totalAmount: 0, error: "Tenant não encontrado" };
  }

  const radul = await findRadulTenant();
  if (!radul) {
    return {
      success: false,
      totalAmount: 0,
      error: "Tenant Radul não encontrado.",
    };
  }

  const billingConfig = await getRadulBillingConfig();
  if (!billingConfig.pix_key) {
    return {
      success: false,
      totalAmount: 0,
      error: "Chave PIX da Radul não configurada.",
    };
  }

  const totalAmount = pack.price_cents / 100;
  const buyerName = buyer.company_name ?? "Tenant";
  const trialDays = (pack as any).trial_days ?? 0;
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + trialDays);

  const description = `Pack "${pack.name}" — ${buyerName} (trial ${trialDays} dias, cobra após ${trialEnd.toLocaleDateString("pt-BR")})`;

  const notes: PackBillingNotes = {
    type: "marketplace_pack_monthly",
    pack_id: pack.id,
    pack_name: pack.name,
    pack_slug: pack.slug,
    builder_id: pack.builder_id,
    buyer_tenant_id: buyerTenantId,
    buyer_tenant_name: buyerName,
    price_cents: pack.price_cents,
    pricing_type: "monthly",
    is_initial: true,
    competence: getCompetenceDate(trialEnd),
    trial_days: trialDays,
    trial_end_date: trialEnd.toISOString(),
  };

  // Create Invoice for the FIRST charge (due after trial)
  const invoice = await createInvoice({
    tenant_id: radul.id,
    title: `Pack "${pack.name}" — ${buyerName} (pós-trial)`,
    description,
    status: "sent",
    subtotal: totalAmount,
    discount: 0,
    tax: 0,
    total: totalAmount,
    issued_at: now.toISOString(),
    due_at: trialEnd.toISOString(),
    pix_key: billingConfig.pix_key,
    pix_key_type: billingConfig.pix_key_type as any,
    notes: JSON.stringify(notes),
  });

  await createInvoiceItem({
    invoice_id: invoice.id,
    description: `Pack "${pack.name}" (mensal, após trial de ${trialDays} dias)`,
    quantity: 1,
    unit_price: totalAmount,
    subtotal: totalAmount,
    sort_order: 1,
  });

  await recalculateInvoice(invoice.id);

  // Generate PIX (will be used when trial expires)
  const { pixPayload, pixQrBase64, gatewayTransactionId } =
    await generateBillingPix({
      billingConfig,
      amount: totalAmount,
      description: `Pack ${pack.name} - ${buyerName} (pós-trial)`,
      externalReference: invoice.id,
    });

  const chartAccountId = await resolveChartAccountId(
    radul.id,
    KNOWN_ACCOUNT_CODES.MENSALIDADES,
  );

  const arNotes: PackBillingNotes = {
    ...notes,
    invoice_id: invoice.id,
    asaas_transaction_id: gatewayTransactionId ?? null,
  };

  await createAccountReceivable({
    tenant_id: radul.id,
    description,
    type: "service_fee",
    category: `Marketplace - Pack "${pack.name}" (trial)`,
    invoice_id: invoice.id,
    amount: totalAmount,
    amount_received: 0,
    status: "pending",
    currency: "BRL",
    due_date: trialEnd.toISOString().split("T")[0],
    competence_date: getCompetenceDate(trialEnd),
    payment_method: "pix",
    pix_key: billingConfig.pix_key,
    pix_key_type: billingConfig.pix_key_type as any,
    pix_payload: pixPayload ?? undefined,
    pix_qr_base64: pixQrBase64 ?? undefined,
    recurrence: "monthly",
    chart_account_id: chartAccountId,
    notes: JSON.stringify(arNotes),
  });

  // Trial: pack is installed immediately — billing starts after trial
  return {
    success: true,
    invoiceId: invoice.id,
    totalAmount,
    installedImmediately: true,
  };
}

/**
 * Confirm payment for a marketplace pack purchase.
 *
 * Called by admin/webhook after PIX is confirmed.
 * - Marks AR as paid
 * - Marks Invoice as paid
 * - For initial payment: installs the pack on the buyer's tenant
 * - For monthly packs: generates next month's billing
 */
export async function confirmPackPayment(
  accountReceivableId: string,
  confirmedBy?: string,
): Promise<PackPaymentConfirmResult> {
  try {
    // 1. Fetch the AR entry
    const arRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "accounts_receivable",
      ...buildSearchParams([{ field: "id", value: accountReceivableId }]),
    });
    const arEntries = normalizeCrudList<Record<string, unknown>>(arRes.data);
    const ar = arEntries[0];
    if (!ar) {
      return { success: false, error: "Conta a receber não encontrada" };
    }

    // 2. Parse notes
    let notes: Partial<PackBillingNotes> = {};
    try {
      notes = JSON.parse(String(ar.notes ?? "{}"));
    } catch {
      /* empty */
    }

    const noteType = String(notes.type ?? "");
    const isPackBilling = [
      "marketplace_pack_one_time",
      "marketplace_pack_monthly",
    ].includes(noteType);

    if (!isPackBilling) {
      return {
        success: false,
        error: "Esta conta não é uma compra de pack do marketplace",
      };
    }

    // 3. Mark AR as paid
    await updateAccountReceivable({
      id: accountReceivableId,
      status: "paid",
      amount_received: Number(ar.amount ?? 0),
      received_at: new Date().toISOString(),
      confirmed_by: confirmedBy ?? undefined,
      confirmed_at: new Date().toISOString(),
    } as any);

    // 4. Mark invoice as paid
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
        console.warn("[Pack Billing] Failed to update invoice status:", err);
      }
    }

    // 4b. Create revenue share record (builder ↔ platform split)
    if (notes.pack_id && notes.builder_id && notes.buyer_tenant_id) {
      try {
        const { createRevenueShareRecord, findActiveInstallId } =
          await import("./revenue-share");
        const grossAmount = (notes.price_cents ?? 0) / 100;
        if (grossAmount > 0) {
          // Find active install for this pack+tenant
          const installId = await findActiveInstallId(
            String(notes.pack_id),
            String(notes.buyer_tenant_id),
          );
          if (installId) {
            await createRevenueShareRecord({
              pack_id: String(notes.pack_id),
              builder_id: String(notes.builder_id),
              install_id: installId,
              invoice_id: invoiceId || undefined,
              ar_id: accountReceivableId,
              buyer_tenant_id: String(notes.buyer_tenant_id),
              gross_amount: grossAmount,
              competence: notes.competence,
              notes: {
                pack_name: notes.pack_name,
                pack_slug: notes.pack_slug,
                pricing_type: notes.pricing_type,
                is_initial: notes.is_initial,
              },
            });
          } else {
            console.warn(
              "[Pack Billing] No active install found for revenue share — will retry after install",
            );
          }
        }
      } catch (err) {
        console.warn("[Pack Billing] Failed to create revenue share:", err);
      }
    }

    // 5. Install the pack if this is the initial payment
    const isInitial = notes.is_initial !== false;
    let installed = false;
    if (isInitial && notes.pack_id && notes.buyer_tenant_id) {
      try {
        const { installPack } = await import("./marketplace-packs");
        const installResult = await installPack(
          String(notes.buyer_tenant_id),
          String(notes.pack_id),
          confirmedBy ?? "system",
        );
        installed = installResult.success;
        if (!installResult.success) {
          console.warn(
            "[Pack Billing] Pack install after payment failed:",
            installResult.errors,
          );
        }
      } catch (err) {
        console.warn(
          "[Pack Billing] Failed to install pack after payment:",
          err,
        );
      }

      // 5b. Retry revenue share creation now that install exists (initial payment)
      if (installed && notes.builder_id) {
        try {
          const { createRevenueShareRecord, findActiveInstallId } =
            await import("./revenue-share");
          const grossAmount = (notes.price_cents ?? 0) / 100;
          if (grossAmount > 0) {
            const installId = await findActiveInstallId(
              String(notes.pack_id),
              String(notes.buyer_tenant_id),
            );
            if (installId) {
              await createRevenueShareRecord({
                pack_id: String(notes.pack_id),
                builder_id: String(notes.builder_id),
                install_id: installId,
                invoice_id: invoiceId || undefined,
                ar_id: accountReceivableId,
                buyer_tenant_id: String(notes.buyer_tenant_id),
                gross_amount: grossAmount,
                competence: notes.competence,
                notes: {
                  pack_name: notes.pack_name,
                  pack_slug: notes.pack_slug,
                  pricing_type: notes.pricing_type,
                  is_initial: true,
                },
              });
            }
          }
        } catch (err) {
          console.warn(
            "[Pack Billing] Failed to create revenue share post-install:",
            err,
          );
        }
      }
    }

    // 6. For monthly packs, generate next month's billing
    let nextArId: string | undefined;
    if (noteType === "marketplace_pack_monthly") {
      try {
        const result = await generateNextMonthPackBilling(
          accountReceivableId,
          notes as PackBillingNotes,
          ar,
        );
        nextArId = result?.arId;
      } catch (err) {
        console.warn(
          "[Pack Billing] Failed to generate next month billing:",
          err,
        );
      }
    }

    return { success: true, nextArId, installed };
  } catch (err) {
    console.error("[Pack Billing] confirmPackPayment error:", err);
    return {
      success: false,
      error: getApiErrorMessage(err, "Erro ao confirmar pagamento do pack"),
    };
  }
}

/**
 * Auto-generate next month's Invoice + AR for a monthly pack.
 * Called after confirming the current month's payment.
 */
async function generateNextMonthPackBilling(
  _parentArId: string,
  parentNotes: PackBillingNotes,
  parentAr: Record<string, unknown>,
): Promise<{ arId: string; invoiceId: string } | null> {
  const buyerTenantId = String(parentNotes.buyer_tenant_id ?? "");
  const buyerName = String(parentNotes.buyer_tenant_name ?? "Tenant");
  const totalAmount = parentNotes.price_cents / 100;
  const packName = String(parentNotes.pack_name ?? "");

  if (!buyerTenantId || totalAmount <= 0) return null;

  const currentCompetence = parentNotes.competence ?? "";
  const nextCompetence = getNextMonthCompetence(currentCompetence);
  const nextDueDate = getDueDateForCompetence(nextCompetence);

  const radul = await findRadulTenant();
  if (!radul) return null;

  const billingConfig = await getRadulBillingConfig();
  if (!billingConfig.pix_key) return null;

  const now = new Date();
  const invoiceTitle = `Pack "${packName}" — ${buyerName}`;
  const description = `Assinatura mensal Pack "${packName}" — ${buyerName} (Tenant: ${buyerTenantId})`;

  const nextNotes: PackBillingNotes = {
    ...parentNotes,
    is_initial: false,
    competence: nextCompetence,
  };

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
    notes: JSON.stringify(nextNotes),
  });

  // 2. Create Invoice Item
  await createInvoiceItem({
    invoice_id: invoice.id,
    description: `Pack "${packName}" (mensal)`,
    quantity: 1,
    unit_price: totalAmount,
    subtotal: totalAmount,
    sort_order: 1,
  });

  // 3. Recalculate
  await recalculateInvoice(invoice.id);

  // 4. Generate PIX
  const { pixPayload, pixQrBase64, gatewayTransactionId } =
    await generateBillingPix({
      billingConfig,
      amount: totalAmount,
      description: `Pack ${packName} - ${buyerName}`,
      externalReference: invoice.id,
    });

  // 5. Create AR for next month
  const chartAccountId = await resolveChartAccountId(
    radul.id,
    KNOWN_ACCOUNT_CODES.MENSALIDADES,
  );

  const arNotes: PackBillingNotes = {
    ...nextNotes,
    invoice_id: invoice.id,
    asaas_transaction_id: gatewayTransactionId ?? null,
  };

  const ar = await createAccountReceivable({
    tenant_id: radul.id,
    description,
    type: "service_fee",
    category: `Marketplace - Pack "${packName}"`,
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
    recurrence_parent_id: parentAr.id ? String(parentAr.id) : undefined,
    chart_account_id: chartAccountId,
    notes: JSON.stringify(arNotes),
  });

  return { arId: ar.id, invoiceId: invoice.id };
}

/**
 * Cancel a monthly pack subscription.
 * - Marks `marketplace_installs.uninstalled_at` and `status = 'uninstalled'`
 * - Cancels any pending (unpaid) AR entries for this pack
 */
export async function cancelPackSubscription(
  tenantId: string,
  packId: string,
): Promise<{ success: boolean; error?: string; cancelledArCount: number }> {
  try {
    // 1. Mark the install as uninstalled
    const installRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "marketplace_installs",
      ...buildSearchParams([
        { field: "tenant_id", value: tenantId },
        { field: "pack_id", value: packId },
        { field: "status", value: "active" },
      ]),
    });
    const installs = normalizeCrudList<{ id: string }>(installRes.data);

    for (const install of installs) {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "marketplace_installs",
        payload: {
          id: install.id,
          status: "uninstalled",
          uninstalled_at: new Date().toISOString(),
        },
      });
    }

    // 2. Find and cancel pending AR entries for this pack
    const radulId = await getRadulTenantId();
    let cancelledArCount = 0;

    if (radulId) {
      const arRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "accounts_receivable",
        ...buildSearchParams(
          [
            { field: "tenant_id", value: radulId },
            { field: "status", value: "pending" },
            {
              field: "category",
              value: `%Pack%${packId.slice(0, 8)}%`,
              operator: "ilike",
            },
          ],
          { sortColumn: "created_at DESC" },
        ),
      });
      const pendingArs = normalizeCrudList<{
        id: string;
        notes?: string;
        deleted_at?: string;
      }>(arRes.data).filter((ar) => !ar.deleted_at);

      for (const ar of pendingArs) {
        // Verify this AR belongs to the same tenant/pack via notes
        let arNotes: Partial<PackBillingNotes> = {};
        try {
          arNotes = JSON.parse(String(ar.notes ?? "{}"));
        } catch {
          continue;
        }

        if (
          arNotes.buyer_tenant_id === tenantId &&
          arNotes.pack_id === packId
        ) {
          await updateAccountReceivable({
            id: ar.id,
            status: "cancelled",
          } as any);
          cancelledArCount++;

          // Also cancel the linked invoice
          if (arNotes.invoice_id) {
            try {
              await api.post(CRUD_ENDPOINT, {
                action: "update",
                table: "invoices",
                payload: {
                  id: arNotes.invoice_id,
                  status: "cancelled",
                },
              });
            } catch {
              // Non-fatal
            }
          }
        }
      }
    }

    return { success: true, cancelledArCount };
  } catch (err) {
    console.error("[Pack Billing] cancelPackSubscription error:", err);
    return {
      success: false,
      error: getApiErrorMessage(err, "Erro ao cancelar assinatura"),
      cancelledArCount: 0,
    };
  }
}

/**
 * List pending pack billing entries for Radul super-admin review.
 */
export async function listPendingPackPurchases(
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
            value: "%Marketplace%",
            operator: "ilike",
          },
          { field: "status", value: "pending" },
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
