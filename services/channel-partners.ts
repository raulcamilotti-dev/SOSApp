/**
 * CHANNEL PARTNERS SERVICE — Sistema de Afiliados/Parceiros de Canal
 *
 * Gerencia parceiros que INDICAM novos tenants (diferente de `partners` que executam serviços).
 *
 * Fluxo:
 * 1. Channel partner se cadastra → ganha código único
 * 2. Indica empresas via ?ref=CODIGO
 * 3. Empresa se registra → cria referral
 * 4. Empresa paga → calcula comissão automaticamente
 * 5. Dashboard mostra performance + ganhos
 */

import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    countCrud,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "@/services/crud";

const log = __DEV__ ? console.log : () => {};

/* ═══════════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════════ */

export type ChannelPartnerType =
  | "accountant"
  | "consultant"
  | "agency"
  | "influencer"
  | "association"
  | "reseller"
  | "other";

export type ChannelPartnerStatus =
  | "pending"
  | "active"
  | "inactive"
  | "suspended"
  | "churned";

export type ReferralStatus = "pending" | "active" | "churned" | "suspended";

export type CommissionStatus =
  | "pending"
  | "approved"
  | "paid"
  | "cancelled"
  | "disputed";

export interface ChannelPartner {
  id: string;
  type: ChannelPartnerType;
  company_name?: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  document_number?: string;
  referral_code: string;
  commission_rate: number;
  status: ChannelPartnerStatus;
  bank_name?: string;
  bank_account_type?: string;
  bank_account_number?: string;
  bank_agency?: string;
  pix_key?: string;
  pix_key_type?: string;
  config?: Record<string, unknown>;
  notes?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface ChannelPartnerReferral {
  id: string;
  channel_partner_id: string;
  tenant_id: string;
  referral_code: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  status: ReferralStatus;
  commission_rate: number;
  commission_type: "recurring" | "one_time" | "tiered";
  first_payment_at?: string;
  last_payment_at?: string;
  total_months_paid: number;
  total_paid: number;
  total_commission_earned: number;
  total_commission_paid: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelPartnerCommission {
  id: string;
  channel_partner_id: string;
  referral_id: string;
  tenant_id: string;
  month_reference: string;
  tenant_plan: string;
  plan_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: CommissionStatus;
  paid_at?: string;
  paid_amount?: number;
  payment_method?: string;
  payment_reference?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelPartnerDashboard {
  channel_partner_id: string;
  contact_name: string;
  company_name?: string;
  type: ChannelPartnerType;
  status: ChannelPartnerStatus;
  default_commission_rate: number;
  total_referrals: number;
  active_referrals: number;
  pending_referrals: number;
  churned_referrals: number;
  total_commission_earned: number;
  total_commission_paid: number;
  commission_pending: number;
  monthly_recurring_commission: number;
  first_referral_at?: string;
  last_referral_at?: string;
}

/* ═══════════════════════════════════════════════════════════
 * CHANNEL PARTNER CRUD
 * ═══════════════════════════════════════════════════════════ */

/**
 * Gera código de indicação único a partir do nome/empresa
 * Ex: "João Silva Contador" → "CONTADOR-JOAO-2026"
 */
export function generateReferralCode(
  name: string,
  type: ChannelPartnerType,
): string {
  const year = new Date().getFullYear();
  const typeLabel = {
    accountant: "CONTADOR",
    consultant: "CONSULTOR",
    agency: "AGENCIA",
    influencer: "INFLUENCER",
    association: "ASSOC",
    reseller: "REVENDEDOR",
    other: "PARCEIRO",
  }[type];

  const firstName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .split(" ")[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 10);

  return `${typeLabel}-${firstName}-${year}`;
}

/**
 * Cria um novo channel partner
 */
export async function createChannelPartner(
  data: Partial<ChannelPartner>,
): Promise<ChannelPartner> {
  // Auto-gera código se não fornecido
  if (!data.referral_code && data.contact_name && data.type) {
    data.referral_code = generateReferralCode(data.contact_name, data.type);
  }

  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "channel_partners",
    payload: {
      ...data,
      status: data.status ?? "pending", // Requer aprovação por padrão
      commission_rate: data.commission_rate ?? 20.0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  return normalizeCrudOne<ChannelPartner>(response.data);
}

/**
 * Atualiza channel partner
 */
export async function updateChannelPartner(
  id: string,
  data: Partial<ChannelPartner>,
): Promise<ChannelPartner> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "channel_partners",
    payload: {
      id,
      ...data,
      updated_at: new Date().toISOString(),
    },
  });

  return normalizeCrudOne<ChannelPartner>(response.data);
}

/**
 * Busca channel partner por código de indicação
 */
export async function getChannelPartnerByReferralCode(
  referralCode: string,
): Promise<ChannelPartner | null> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partners",
    ...buildSearchParams([
      { field: "referral_code", value: referralCode, operator: "equal" },
    ]),
  });

  const list = normalizeCrudList<ChannelPartner>(response.data);
  return list.find((p) => !p.deleted_at && p.status === "active") ?? null;
}

/**
 * Busca channel partner por e-mail de contato
 */
export async function getChannelPartnerByEmail(
  email: string,
): Promise<ChannelPartner | null> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partners",
    ...buildSearchParams([
      { field: "contact_email", value: email, operator: "equal" },
    ]),
  });

  const list = normalizeCrudList<ChannelPartner>(response.data);
  return list.find((p) => !p.deleted_at) ?? null;
}

/**
 * Lista channel partners ativos
 */
export async function listActiveChannelPartners(): Promise<ChannelPartner[]> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partners",
    ...buildSearchParams([{ field: "status", value: "active" }], {
      sortColumn: "created_at DESC",
    }),
  });

  return normalizeCrudList<ChannelPartner>(response.data).filter(
    (p) => !p.deleted_at,
  );
}

/* ═══════════════════════════════════════════════════════════
 * REFERRAL TRACKING
 * ═══════════════════════════════════════════════════════════ */

/**
 * Cria um referral quando um tenant se registra via código de indicação
 */
export async function createReferral(params: {
  channelPartnerId: string;
  tenantId: string;
  referralCode: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}): Promise<ChannelPartnerReferral> {
  // Busca o channel partner para pegar a taxa de comissão
  const partnerResponse = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partners",
    ...buildSearchParams([{ field: "id", value: params.channelPartnerId }]),
  });

  const partner = normalizeCrudList<ChannelPartner>(partnerResponse.data)[0];
  if (!partner) {
    throw new Error("Channel partner não encontrado");
  }

  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "channel_partner_referrals",
    payload: {
      channel_partner_id: params.channelPartnerId,
      tenant_id: params.tenantId,
      referral_code: params.referralCode,
      utm_source: params.utmSource,
      utm_medium: params.utmMedium,
      utm_campaign: params.utmCampaign,
      status: "pending", // Vira 'active' quando fizer primeiro pagamento
      commission_rate: partner.commission_rate,
      commission_type: "recurring",
      total_months_paid: 0,
      total_paid: 0,
      total_commission_earned: 0,
      total_commission_paid: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  return normalizeCrudOne<ChannelPartnerReferral>(response.data);
}

/**
 * Busca referral por tenant_id
 */
export async function getReferralByTenantId(
  tenantId: string,
): Promise<ChannelPartnerReferral | null> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partner_referrals",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }]),
  });

  const list = normalizeCrudList<ChannelPartnerReferral>(response.data);
  return list[0] ?? null;
}

/**
 * Atualiza status do referral (ex: pending → active quando tenant paga)
 */
export async function updateReferralStatus(
  referralId: string,
  status: ReferralStatus,
): Promise<ChannelPartnerReferral> {
  const payload: Record<string, unknown> = {
    id: referralId,
    status,
    updated_at: new Date().toISOString(),
  };

  // Se ativando pela primeira vez, marca data do primeiro pagamento
  if (status === "active") {
    const existing = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "channel_partner_referrals",
      ...buildSearchParams([{ field: "id", value: referralId }]),
    });
    const referral = normalizeCrudList<ChannelPartnerReferral>(
      existing.data,
    )[0];
    if (referral && !referral.first_payment_at) {
      payload.first_payment_at = new Date().toISOString();
    }
  }

  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "channel_partner_referrals",
    payload,
  });

  return normalizeCrudOne<ChannelPartnerReferral>(response.data);
}

/**
 * Lista referrals de um channel partner
 */
export async function listReferralsByPartner(
  channelPartnerId: string,
): Promise<ChannelPartnerReferral[]> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partner_referrals",
    ...buildSearchParams([
      { field: "channel_partner_id", value: channelPartnerId },
    ]),
  });

  return normalizeCrudList<ChannelPartnerReferral>(response.data);
}

/* ═══════════════════════════════════════════════════════════
 * COMMISSION CALCULATION
 * ═══════════════════════════════════════════════════════════ */

/**
 * Valores dos planos (hardcoded — TODO: buscar de tenants.config.billing)
 */
const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 99,
  growth: 249,
  scale: 499,
  enterprise: 0, // Custom
};

/**
 * Calcula comissões mensais para todos os referrals ativos
 * Deve ser executado no início de cada mês via cron job
 */
export async function calculateMonthlyCommissions(
  monthReference?: string,
): Promise<{ created: number; total_amount: number }> {
  const month = monthReference ?? new Date().toISOString().slice(0, 7); // '2026-02'

  // Busca todos os referrals ativos
  const referralsResponse = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partner_referrals",
    ...buildSearchParams([{ field: "status", value: "active" }]),
  });

  const referrals = normalizeCrudList<ChannelPartnerReferral>(
    referralsResponse.data,
  );

  let created = 0;
  let totalAmount = 0;

  for (const referral of referrals) {
    try {
      // Busca dados do tenant para pegar plano atual
      const tenantResponse = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams([{ field: "id", value: referral.tenant_id }]),
      });

      const tenants = normalizeCrudList<{
        id: string;
        config?: { billing?: { current_plan?: string } };
      }>(tenantResponse.data);
      const tenant = tenants[0];

      if (!tenant) continue;

      const currentPlan = tenant.config?.billing?.current_plan ?? "free";
      const planAmount = PLAN_PRICES[currentPlan] ?? 0;

      // Não gera comissão se plano free
      if (planAmount === 0) continue;

      const commissionAmount = planAmount * (referral.commission_rate / 100);

      // Verifica se já existe comissão para este mês
      const existingResponse = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "channel_partner_commissions",
        ...buildSearchParams(
          [
            { field: "referral_id", value: referral.id },
            { field: "month_reference", value: month },
          ],
          { combineType: "AND" },
        ),
      });

      const existing = normalizeCrudList<ChannelPartnerCommission>(
        existingResponse.data,
      );

      if (existing.length > 0) {
        log(`Comissão já existe para referral ${referral.id} no mês ${month}`);
        continue;
      }

      // Cria registro de comissão
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "channel_partner_commissions",
        payload: {
          channel_partner_id: referral.channel_partner_id,
          referral_id: referral.id,
          tenant_id: referral.tenant_id,
          month_reference: month,
          tenant_plan: currentPlan,
          plan_amount: planAmount,
          commission_rate: referral.commission_rate,
          commission_amount: commissionAmount,
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });

      // Atualiza métricas do referral
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "channel_partner_referrals",
        payload: {
          id: referral.id,
          total_months_paid: referral.total_months_paid + 1,
          total_paid: referral.total_paid + planAmount,
          total_commission_earned:
            referral.total_commission_earned + commissionAmount,
          last_payment_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });

      created++;
      totalAmount += commissionAmount;
    } catch (error) {
      console.error(
        `Erro ao calcular comissão para referral ${referral.id}:`,
        getApiErrorMessage(error),
      );
    }
  }

  return { created, total_amount: totalAmount };
}

/**
 * Marca comissão como paga
 */
export async function markCommissionAsPaid(
  commissionId: string,
  params: {
    paidAmount: number;
    paymentMethod: string;
    paymentReference?: string;
  },
): Promise<ChannelPartnerCommission> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "channel_partner_commissions",
    payload: {
      id: commissionId,
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_amount: params.paidAmount,
      payment_method: params.paymentMethod,
      payment_reference: params.paymentReference,
      updated_at: new Date().toISOString(),
    },
  });

  const commission = normalizeCrudOne<ChannelPartnerCommission>(response.data);

  // Atualiza total_commission_paid no referral
  const referralResponse = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partner_referrals",
    ...buildSearchParams([{ field: "id", value: commission.referral_id }]),
  });

  const referral = normalizeCrudList<ChannelPartnerReferral>(
    referralResponse.data,
  )[0];

  if (referral) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "channel_partner_referrals",
      payload: {
        id: referral.id,
        total_commission_paid:
          referral.total_commission_paid + params.paidAmount,
        updated_at: new Date().toISOString(),
      },
    });
  }

  return commission;
}

/* ═══════════════════════════════════════════════════════════
 * DASHBOARD
 * ═══════════════════════════════════════════════════════════ */

/**
 * Busca dashboard consolidado de um channel partner
 */
export async function getChannelPartnerDashboard(
  channelPartnerId: string,
): Promise<ChannelPartnerDashboard | null> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partner_dashboard",
    ...buildSearchParams([
      { field: "channel_partner_id", value: channelPartnerId },
    ]),
  });

  const list = normalizeCrudList<ChannelPartnerDashboard>(response.data);
  return list[0] ?? null;
}

/**
 * Lista comissões pendentes de um channel partner
 */
export async function getPendingCommissionsByPartner(
  channelPartnerId: string,
): Promise<ChannelPartnerCommission[]> {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partner_commissions",
    ...buildSearchParams(
      [
        { field: "channel_partner_id", value: channelPartnerId },
        { field: "status", value: "pending" },
      ],
      { combineType: "AND", sortColumn: "month_reference DESC" },
    ),
  });

  return normalizeCrudList<ChannelPartnerCommission>(response.data);
}

/**
 * Sumário financeiro global de channel partners (admin)
 */
export async function getGlobalCommissionSummary(): Promise<{
  total_partners: number;
  active_partners: number;
  total_referrals: number;
  active_referrals: number;
  total_commission_earned: number;
  total_commission_paid: number;
  total_commission_pending: number;
}> {
  // Count total partners
  const partnersCount = await countCrud("channel_partners", [
    { field: "status", value: "active" },
  ]);

  const activePartnersCount = await countCrud("channel_partners", [
    { field: "status", value: "active" },
  ]);

  // Count referrals
  const referralsCount = await countCrud("channel_partner_referrals");

  const activeReferralsCount = await countCrud("channel_partner_referrals", [
    { field: "status", value: "active" },
  ]);

  // Sum commissions (requires aggregate — simplified version)
  const commissionsResponse = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "channel_partner_commissions",
  });

  const commissions = normalizeCrudList<ChannelPartnerCommission>(
    commissionsResponse.data,
  );

  const totalEarned = commissions.reduce(
    (sum, c) => sum + c.commission_amount,
    0,
  );
  const totalPaid = commissions
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + (c.paid_amount ?? 0), 0);
  const totalPending = commissions
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + c.commission_amount, 0);

  return {
    total_partners: partnersCount,
    active_partners: activePartnersCount,
    total_referrals: referralsCount,
    active_referrals: activeReferralsCount,
    total_commission_earned: totalEarned,
    total_commission_paid: totalPaid,
    total_commission_pending: totalPending,
  };
}
