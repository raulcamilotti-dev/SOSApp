/**
 * Contracts Service — SLA & Contract Management
 *
 * Manages service contracts between tenants and their customers.
 *
 * Architecture:
 *   - contracts table: contract header (dates, values, SLA, status, auto-renew)
 *   - contract_service_orders: many-to-many link contracts ↔ service orders
 *   - Integrates with document_templates for contract generation
 *   - Integrates with document_signatures for digital signing (Documenso)
 *   - Status lifecycle: draft → active → (expired | cancelled | renewed)
 *
 * SLA tracking:
 *   - sla_response_hours: max time to first response (e.g., 24h)
 *   - sla_resolution_hours: max time to resolve/complete (e.g., 72h)
 *   - SLA compliance checked against service_order timestamps
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
    type CrudFilter,
    type CrudListOptions,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ContractStatus =
  | "draft"
  | "active"
  | "expired"
  | "cancelled"
  | "renewed";

export type ContractType =
  | "prestacao_servico"
  | "manutencao"
  | "consultoria"
  | "assinatura"
  | "outro";

export interface Contract {
  id: string;
  tenant_id: string;
  customer_id: string;
  title: string;
  description?: string | null;
  contract_type: ContractType;
  total_value?: number | null;
  monthly_value?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  renewal_date?: string | null;
  signed_at?: string | null;
  status: ContractStatus;
  auto_renew: boolean;
  renewal_period_months: number;
  renewal_alert_days: number;
  sla_response_hours?: number | null;
  sla_resolution_hours?: number | null;
  document_template_id?: string | null;
  document_signature_id?: string | null;
  generated_document_id?: string | null;
  terms?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface ContractServiceOrder {
  id: string;
  contract_id: string;
  service_order_id: string;
  created_at?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const CONTRACT_STATUSES: {
  value: ContractStatus;
  label: string;
  color: string;
  icon: string;
}[] = [
  {
    value: "draft",
    label: "Rascunho",
    color: "#94a3b8",
    icon: "create-outline",
  },
  {
    value: "active",
    label: "Ativo",
    color: "#22c55e",
    icon: "checkmark-circle-outline",
  },
  {
    value: "expired",
    label: "Expirado",
    color: "#f59e0b",
    icon: "time-outline",
  },
  {
    value: "cancelled",
    label: "Cancelado",
    color: "#ef4444",
    icon: "close-circle-outline",
  },
  {
    value: "renewed",
    label: "Renovado",
    color: "#3b82f6",
    icon: "refresh-outline",
  },
];

export const CONTRACT_TYPES: {
  value: ContractType;
  label: string;
}[] = [
  { value: "prestacao_servico", label: "Prestação de Serviço" },
  { value: "manutencao", label: "Manutenção" },
  { value: "consultoria", label: "Consultoria" },
  { value: "assinatura", label: "Assinatura" },
  { value: "outro", label: "Outro" },
];

/* ------------------------------------------------------------------ */
/*  Contract CRUD                                                      */
/* ------------------------------------------------------------------ */

export async function listContracts(
  tenantId: string,
  filters?: CrudFilter[],
  options?: CrudListOptions,
): Promise<Contract[]> {
  const baseFilters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    ...(filters ?? []),
  ];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "contracts",
    ...buildSearchParams(baseFilters, {
      sortColumn: options?.sortColumn ?? "created_at DESC",
      ...options,
    }),
  });
  return normalizeCrudList<Contract>(res.data).filter((c) => !c.deleted_at);
}

export async function getContractById(
  contractId: string,
): Promise<Contract | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "contracts",
    ...buildSearchParams([{ field: "id", value: contractId }]),
  });
  const list = normalizeCrudList<Contract>(res.data);
  return list.length > 0 ? list[0] : null;
}

export async function createContract(
  payload: Omit<Contract, "id" | "created_at" | "updated_at" | "deleted_at">,
): Promise<Contract> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "contracts",
    payload: {
      ...payload,
      status: payload.status || "draft",
      contract_type: payload.contract_type || "prestacao_servico",
      auto_renew: payload.auto_renew ?? false,
      renewal_period_months: payload.renewal_period_months ?? 12,
      renewal_alert_days: payload.renewal_alert_days ?? 30,
    },
  });
  return normalizeCrudOne<Contract>(res.data);
}

export async function updateContract(
  contractId: string,
  payload: Partial<Contract>,
): Promise<Contract> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "contracts",
    payload: { id: contractId, ...payload },
  });
  return normalizeCrudOne<Contract>(res.data);
}

export async function deleteContract(contractId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "contracts",
    payload: { id: contractId, deleted_at: new Date().toISOString() },
  });
}

/* ------------------------------------------------------------------ */
/*  Contract ↔ Service Order links                                     */
/* ------------------------------------------------------------------ */

export async function linkContractToServiceOrder(
  contractId: string,
  serviceOrderId: string,
): Promise<ContractServiceOrder> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "contract_service_orders",
    payload: {
      contract_id: contractId,
      service_order_id: serviceOrderId,
    },
  });
  return normalizeCrudOne<ContractServiceOrder>(res.data);
}

export async function unlinkContractFromServiceOrder(
  linkId: string,
): Promise<void> {
  // Hard delete (no deleted_at on this table)
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "contract_service_orders",
    payload: { id: linkId, deleted_at: new Date().toISOString() },
  });
}

export async function getContractServiceOrders(
  contractId: string,
): Promise<ContractServiceOrder[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "contract_service_orders",
    ...buildSearchParams([{ field: "contract_id", value: contractId }]),
  });
  return normalizeCrudList<ContractServiceOrder>(res.data);
}

export async function getServiceOrderContracts(
  serviceOrderId: string,
): Promise<ContractServiceOrder[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "contract_service_orders",
    ...buildSearchParams([
      { field: "service_order_id", value: serviceOrderId },
    ]),
  });
  return normalizeCrudList<ContractServiceOrder>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Status transitions                                                 */
/* ------------------------------------------------------------------ */

/** Activate a draft contract */
export async function activateContract(contractId: string): Promise<Contract> {
  return updateContract(contractId, { status: "active" });
}

/** Cancel an active contract */
export async function cancelContract(
  contractId: string,
  reason?: string,
): Promise<Contract> {
  return updateContract(contractId, {
    status: "cancelled",
    notes: reason || undefined,
  });
}

/**
 * Renew a contract.
 * Creates a new contract with extended dates, marking the old one as "renewed".
 */
export async function renewContract(
  contractId: string,
): Promise<{ oldContract: Contract; newContract: Contract }> {
  const old = await getContractById(contractId);
  if (!old) throw new Error("Contrato não encontrado");

  // Calculate new dates
  const months = old.renewal_period_months || 12;
  const newStart = old.end_date ? new Date(old.end_date) : new Date();
  const newEnd = new Date(newStart);
  newEnd.setMonth(newEnd.getMonth() + months);
  const renewalDate = new Date(newEnd);
  renewalDate.setDate(renewalDate.getDate() - (old.renewal_alert_days || 30));

  // Mark old as renewed
  const oldUpdated = await updateContract(contractId, { status: "renewed" });

  // Create new contract
  const newContract = await createContract({
    tenant_id: old.tenant_id,
    customer_id: old.customer_id,
    title: old.title,
    description: old.description,
    contract_type: old.contract_type,
    total_value: old.total_value,
    monthly_value: old.monthly_value,
    start_date: newStart.toISOString().split("T")[0],
    end_date: newEnd.toISOString().split("T")[0],
    renewal_date: renewalDate.toISOString().split("T")[0],
    status: "active",
    auto_renew: old.auto_renew,
    renewal_period_months: old.renewal_period_months,
    renewal_alert_days: old.renewal_alert_days,
    sla_response_hours: old.sla_response_hours,
    sla_resolution_hours: old.sla_resolution_hours,
    document_template_id: old.document_template_id,
    terms: old.terms,
    notes: `Renovação do contrato anterior (${contractId.slice(0, 8)})`,
    created_by: old.created_by,
    signed_at: null,
  });

  return { oldContract: oldUpdated, newContract };
}

/* ------------------------------------------------------------------ */
/*  SLA Compliance                                                     */
/* ------------------------------------------------------------------ */

export interface SlaCompliance {
  contractId: string;
  serviceOrderId: string;
  responseWithinSla: boolean | null;
  resolutionWithinSla: boolean | null;
  responseHours: number | null;
  resolutionHours: number | null;
  slaResponseLimit: number | null;
  slaResolutionLimit: number | null;
}

/**
 * Check SLA compliance for a service order against its contract.
 *
 * @param contract - Contract with SLA hours defined
 * @param serviceOrder - Service order with created_at and completed_at
 */
export function checkSlaCompliance(
  contract: Contract,
  serviceOrder: {
    id: string;
    created_at?: string;
    first_response_at?: string;
    completed_at?: string;
  },
): SlaCompliance {
  const result: SlaCompliance = {
    contractId: contract.id,
    serviceOrderId: serviceOrder.id,
    responseWithinSla: null,
    resolutionWithinSla: null,
    responseHours: null,
    resolutionHours: null,
    slaResponseLimit: contract.sla_response_hours ?? null,
    slaResolutionLimit: contract.sla_resolution_hours ?? null,
  };

  if (serviceOrder.created_at) {
    const created = new Date(serviceOrder.created_at).getTime();

    // Response SLA
    if (contract.sla_response_hours && serviceOrder.first_response_at) {
      const responded = new Date(serviceOrder.first_response_at).getTime();
      result.responseHours =
        Math.round(((responded - created) / (1000 * 60 * 60)) * 10) / 10;
      result.responseWithinSla =
        result.responseHours <= contract.sla_response_hours;
    }

    // Resolution SLA
    if (contract.sla_resolution_hours && serviceOrder.completed_at) {
      const completed = new Date(serviceOrder.completed_at).getTime();
      result.resolutionHours =
        Math.round(((completed - created) / (1000 * 60 * 60)) * 10) / 10;
      result.resolutionWithinSla =
        result.resolutionHours <= contract.sla_resolution_hours;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Renewal alerts                                                     */
/* ------------------------------------------------------------------ */

/**
 * Get contracts approaching renewal date.
 * Returns contracts where renewal_date <= today + alertDays.
 */
export async function getUpcomingRenewals(
  tenantId: string,
  alertDays?: number,
): Promise<Contract[]> {
  const days = alertDays ?? 30;
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "contracts",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "status", value: "active" },
        {
          field: "renewal_date",
          value: futureDate.toISOString().split("T")[0],
          operator: "lte",
        },
        { field: "deleted_at", value: "", operator: "is_null" },
      ],
      { sortColumn: "renewal_date ASC" },
    ),
  });
  return normalizeCrudList<Contract>(res.data);
}

/**
 * Get expired contracts that have auto_renew = true.
 * These should be renewed on next check.
 */
export async function getAutoRenewableContracts(
  tenantId: string,
): Promise<Contract[]> {
  const today = new Date().toISOString().split("T")[0];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "contracts",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "status", value: "active" },
        { field: "auto_renew", value: "true", operator: "equal" },
        { field: "end_date", value: today, operator: "lte" },
        { field: "deleted_at", value: "", operator: "is_null" },
      ],
      { sortColumn: "end_date ASC" },
    ),
  });
  return normalizeCrudList<Contract>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Get status config by value */
export function getContractStatusConfig(status: ContractStatus) {
  return (
    CONTRACT_STATUSES.find((s) => s.value === status) ?? CONTRACT_STATUSES[0]
  );
}

/** Get type label */
export function getContractTypeLabel(type: ContractType): string {
  return CONTRACT_TYPES.find((t) => t.value === type)?.label ?? "Outro";
}

/** Format currency */
export function formatContractCurrency(
  value: number | string | null | undefined,
): string {
  const num = Number(value ?? 0);
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Check if contract is active and within dates */
export function isContractActive(contract: Contract): boolean {
  if (contract.status !== "active") return false;
  if (contract.deleted_at) return false;
  const now = new Date().toISOString().split("T")[0];
  if (contract.start_date && contract.start_date > now) return false;
  if (contract.end_date && contract.end_date < now) return false;
  return true;
}
