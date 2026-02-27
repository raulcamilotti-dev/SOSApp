/**
 * Contracts Service — SLA & Contract Management
 *
 * Manages service contracts between tenants and their customers.
 *
 * Architecture:
 *   - contracts table: contract header (dates, values, SLA, status, billing model)
 *   - contract_service_orders: many-to-many link contracts ↔ service orders
 *   - contract_invoices: junction linking contracts to invoices with period/hours
 *   - Integrates with document_templates for contract/report generation
 *   - Integrates with document_signatures for digital signing (Documenso)
 *   - Status lifecycle: draft → active → suspended → (completed | cancelled | expired)
 *
 * Billing models:
 *   - fixed_monthly: fixed monthly value, invoice generated every month
 *   - hourly: billed by actual_hours on tasks, invoice = hours × hourly_rate
 *   - fixed_plus_excess: fixed monthly + excess hours over included_hours_monthly
 *   - per_delivery: one invoice per completed service order
 *
 * SLA tracking:
 *   - sla_response_hours: max time to first response (e.g., 24h)
 *   - sla_resolution_hours: max time to resolve/complete (e.g., 72h)
 *   - SLA compliance checked against service_order timestamps
 */

import { api } from "./api";
import {
    aggregateCrud,
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
  | "suspended"
  | "completed"
  | "expired"
  | "cancelled";

export type ContractType =
  | "prestacao_servico"
  | "manutencao"
  | "consultoria"
  | "assinatura"
  | "outro";

export type BillingModel =
  | "fixed_monthly"
  | "hourly"
  | "fixed_plus_excess"
  | "per_delivery";

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
  report_template_id?: string | null;
  billing_model?: BillingModel | null;
  hourly_rate?: number | null;
  included_hours_monthly?: number | null;
  excess_hourly_rate?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  terms?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface ContractInvoice {
  id: string;
  contract_id: string;
  invoice_id: string;
  period_start?: string | null;
  period_end?: string | null;
  hours_consumed?: number | null;
  hours_included?: number | null;
  hours_excess?: number | null;
  notes?: string | null;
  created_at?: string;
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
    value: "suspended",
    label: "Suspenso",
    color: "#f59e0b",
    icon: "pause-circle-outline",
  },
  {
    value: "completed",
    label: "Concluído",
    color: "#3b82f6",
    icon: "trophy-outline",
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

export const BILLING_MODELS: {
  value: BillingModel;
  label: string;
  description: string;
}[] = [
  {
    value: "fixed_monthly",
    label: "Valor Fixo Mensal",
    description: "Cobra valor fixo todo mês, independente de horas",
  },
  {
    value: "hourly",
    label: "Por Hora",
    description: "Cobra por hora trabalhada (actual_hours nas tarefas)",
  },
  {
    value: "fixed_plus_excess",
    label: "Fixo + Excedente",
    description: "Valor fixo com horas incluídas; excedente cobrado à parte",
  },
  {
    value: "per_delivery",
    label: "Por Entrega",
    description: "Cobra por processo/OS concluída",
  },
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
 * Creates a new contract with extended dates, marking the old one as "completed".
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

  // Mark old as completed (renewed into a new contract)
  const oldUpdated = await updateContract(contractId, { status: "completed" });

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

/* ------------------------------------------------------------------ */
/*  Billing model helpers                                              */
/* ------------------------------------------------------------------ */

/** Get billing model label */
export function getBillingModelLabel(model?: BillingModel | null): string {
  return BILLING_MODELS.find((m) => m.value === model)?.label ?? "Fixo Mensal";
}

/* ------------------------------------------------------------------ */
/*  Contract ↔ Invoice links (contract_invoices)                       */
/* ------------------------------------------------------------------ */

export async function linkContractToInvoice(payload: {
  contract_id: string;
  invoice_id: string;
  period_start?: string;
  period_end?: string;
  hours_consumed?: number;
  hours_included?: number;
  hours_excess?: number;
  notes?: string;
}): Promise<ContractInvoice> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "contract_invoices",
    payload,
  });
  return normalizeCrudOne<ContractInvoice>(res.data);
}

export async function getContractInvoices(
  contractId: string,
): Promise<ContractInvoice[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "contract_invoices",
    ...buildSearchParams([{ field: "contract_id", value: contractId }], {
      sortColumn: "period_start DESC",
    }),
  });
  return normalizeCrudList<ContractInvoice>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Hours aggregation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Get total actual_hours from all tasks linked to a contract's service orders.
 * Uses contract_service_orders → tasks aggregation.
 *
 * @param contractId - UUID of the contract
 * @param periodStart - Optional ISO date to filter tasks (created_at >=)
 * @param periodEnd - Optional ISO date to filter tasks (created_at <=)
 */
export async function getContractHours(
  contractId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<{
  totalHours: number;
  taskCount: number;
}> {
  // 1. Get linked service order IDs
  const links = await getContractServiceOrders(contractId);
  if (links.length === 0) return { totalHours: 0, taskCount: 0 };

  const soIds = links.map((l) => l.service_order_id);

  // 2. Aggregate actual_hours from tasks for those service orders
  const filters: CrudFilter[] = [
    { field: "service_order_id", value: soIds.join(","), operator: "in" },
    { field: "actual_hours", value: "0", operator: "gt" },
  ];
  if (periodStart) {
    filters.push({
      field: "created_at",
      value: periodStart,
      operator: "gte",
    });
  }
  if (periodEnd) {
    filters.push({ field: "created_at", value: periodEnd, operator: "lte" });
  }

  try {
    const result = await aggregateCrud<{
      sum_actual_hours: number;
      count: number;
    }>(
      "tasks",
      [
        { function: "SUM", field: "actual_hours", alias: "sum_actual_hours" },
        { function: "COUNT", field: "*", alias: "count" },
      ],
      { filters },
    );

    const row = Array.isArray(result) && result.length > 0 ? result[0] : null;
    return {
      totalHours: Number(row?.sum_actual_hours ?? 0),
      taskCount: Number(row?.count ?? 0),
    };
  } catch {
    // Fallback: manual calculation if aggregate fails
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "tasks",
      ...buildSearchParams(
        [
          {
            field: "service_order_id",
            value: soIds.join(","),
            operator: "in",
          },
        ],
        { sortColumn: "created_at DESC" },
      ),
    });
    const tasks = normalizeCrudList<{
      actual_hours?: number;
      deleted_at?: string;
    }>(res.data).filter((t) => !t.deleted_at);

    let totalHours = 0;
    let taskCount = 0;
    for (const task of tasks) {
      const hours = Number(task.actual_hours ?? 0);
      if (hours > 0) {
        totalHours += hours;
        taskCount++;
      }
    }
    return { totalHours, taskCount };
  }
}

/* ------------------------------------------------------------------ */
/*  Contract KPI summary                                               */
/* ------------------------------------------------------------------ */

export interface ContractKPI {
  totalProcesses: number;
  activeProcesses: number;
  completedProcesses: number;
  totalHoursConsumed: number;
  hoursIncludedMonthly: number;
  excessHours: number;
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
  slaCompliancePercent: number | null;
}

/**
 * Get a comprehensive KPI summary for a contract.
 */
export async function getContractKPI(contract: Contract): Promise<ContractKPI> {
  // 1. Get linked service orders
  const links = await getContractServiceOrders(contract.id);
  const soIds = links.map((l) => l.service_order_id);

  // 2. Process counts
  let activeProcesses = 0;
  let completedProcesses = 0;
  if (soIds.length > 0) {
    try {
      const soRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_orders",
        ...buildSearchParams([
          { field: "id", value: soIds.join(","), operator: "in" },
        ]),
      });
      const orders = normalizeCrudList<{
        id: string;
        status?: string;
        deleted_at?: string;
      }>(soRes.data).filter((o) => !o.deleted_at);
      activeProcesses = orders.filter(
        (o) =>
          o.status !== "completed" &&
          o.status !== "cancelled" &&
          o.status !== "concluido",
      ).length;
      completedProcesses = orders.filter(
        (o) => o.status === "completed" || o.status === "concluido",
      ).length;
    } catch {
      /* silently ignore */
    }
  }

  // 3. Hours
  const { totalHours } = await getContractHours(contract.id);
  const includedMonthly = Number(contract.included_hours_monthly ?? 0);
  const excessHours = Math.max(0, totalHours - includedMonthly);

  // 4. Invoice totals
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalPending = 0;
  const contractInvoices = await getContractInvoices(contract.id);
  if (contractInvoices.length > 0) {
    const invIds = contractInvoices.map((ci) => ci.invoice_id);
    try {
      const invRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "invoices",
        ...buildSearchParams([
          { field: "id", value: invIds.join(","), operator: "in" },
        ]),
      });
      const invoices = normalizeCrudList<{
        id: string;
        total?: number;
        status?: string;
        deleted_at?: string;
      }>(invRes.data).filter((i) => !i.deleted_at);
      for (const inv of invoices) {
        const amount = Number(inv.total ?? 0);
        totalInvoiced += amount;
        if (inv.status === "paid") totalPaid += amount;
        else if (
          inv.status === "sent" ||
          inv.status === "overdue" ||
          inv.status === "draft"
        )
          totalPending += amount;
      }
    } catch {
      /* silently ignore */
    }
  }

  return {
    totalProcesses: soIds.length,
    activeProcesses,
    completedProcesses,
    totalHoursConsumed: totalHours,
    hoursIncludedMonthly: includedMonthly,
    excessHours,
    totalInvoiced,
    totalPaid,
    totalPending,
    slaCompliancePercent: null, // computed by caller if needed
  };
}

/* ------------------------------------------------------------------ */
/*  Invoice generation for contracts                                   */
/* ------------------------------------------------------------------ */

export interface ContractInvoiceInput {
  contract: Contract;
  periodStart: string;
  periodEnd: string;
  adjustmentDescription?: string;
  adjustmentAmount?: number;
  notes?: string;
  createdBy?: string;
}

/**
 * Generate an invoice for a contract billing period.
 *
 * For fixed_monthly: invoice = monthly_value
 * For hourly: invoice = hours × hourly_rate
 * For fixed_plus_excess: invoice = monthly_value + excess_hours × excess_hourly_rate
 * For per_delivery: invoice = count_completed × (total_value / expected_deliveries) — simplified to monthly_value
 */
export async function generateContractInvoice(
  input: ContractInvoiceInput,
): Promise<{ invoiceId: string; contractInvoiceId: string }> {
  const { contract, periodStart, periodEnd, createdBy } = input;
  const billingModel = contract.billing_model ?? "fixed_monthly";

  // Get hours for the period
  const { totalHours } = await getContractHours(
    contract.id,
    periodStart,
    periodEnd,
  );

  const includedHours = Number(contract.included_hours_monthly ?? 0);
  const hourlyRate = Number(contract.hourly_rate ?? 0);
  const excessRate = Number(contract.excess_hourly_rate ?? hourlyRate);
  const monthlyValue = Number(contract.monthly_value ?? 0);

  // Calculate base amount
  let subtotal = 0;
  let description = "";
  const periodLabel = `${formatDateShort(periodStart)} — ${formatDateShort(periodEnd)}`;

  switch (billingModel) {
    case "fixed_monthly":
      subtotal = monthlyValue;
      description = `Mensalidade — ${periodLabel}`;
      break;
    case "hourly":
      subtotal = totalHours * hourlyRate;
      description = `${totalHours.toFixed(1)}h × R$ ${hourlyRate.toFixed(2)} — ${periodLabel}`;
      break;
    case "fixed_plus_excess": {
      const excess = Math.max(0, totalHours - includedHours);
      subtotal = monthlyValue + excess * excessRate;
      description =
        excess > 0
          ? `Mensalidade + ${excess.toFixed(1)}h excedentes — ${periodLabel}`
          : `Mensalidade — ${periodLabel}`;
      break;
    }
    case "per_delivery":
      subtotal = monthlyValue;
      description = `Entrega — ${periodLabel}`;
      break;
  }

  // Apply manual adjustment
  const adjustment = Number(input.adjustmentAmount ?? 0);
  const total = Math.max(0, subtotal + adjustment);

  // Create invoice
  const invoiceRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "invoices",
    payload: {
      tenant_id: contract.tenant_id,
      customer_id: contract.customer_id,
      title: `Fatura — ${contract.title}`,
      description,
      status: "draft",
      subtotal,
      discount: adjustment < 0 ? Math.abs(adjustment) : 0,
      tax: 0,
      total,
      issued_at: new Date().toISOString(),
      due_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      notes: [
        input.notes,
        input.adjustmentDescription
          ? `Ajuste: ${input.adjustmentDescription} (R$ ${adjustment.toFixed(2)})`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      created_by: createdBy ?? null,
    },
  });
  const invoice = normalizeCrudOne<{ id: string }>(invoiceRes.data);

  // Create invoice line item
  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "invoice_items",
    payload: {
      invoice_id: invoice.id,
      description,
      quantity: 1,
      unit_price: subtotal,
      subtotal,
      sort_order: 1,
    },
  });

  // Add adjustment as second line item if applicable
  if (adjustment !== 0 && input.adjustmentDescription) {
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "invoice_items",
      payload: {
        invoice_id: invoice.id,
        description: input.adjustmentDescription,
        quantity: 1,
        unit_price: adjustment,
        subtotal: adjustment,
        sort_order: 2,
      },
    });
  }

  // Link contract ↔ invoice
  const link = await linkContractToInvoice({
    contract_id: contract.id,
    invoice_id: invoice.id,
    period_start: periodStart,
    period_end: periodEnd,
    hours_consumed: totalHours,
    hours_included: includedHours,
    hours_excess: Math.max(0, totalHours - includedHours),
    notes: description,
  });

  return { invoiceId: invoice.id, contractInvoiceId: link.id };
}

/* ------------------------------------------------------------------ */
/*  Client-facing helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * List active contracts for a specific customer.
 */
export async function listCustomerContracts(
  tenantId: string,
  customerId: string,
): Promise<Contract[]> {
  return listContracts(tenantId, [{ field: "customer_id", value: customerId }]);
}

/**
 * Count linked processes per contract (for lists).
 */
export async function getContractProcessCount(
  contractId: string,
): Promise<number> {
  const links = await getContractServiceOrders(contractId);
  return links.length;
}

/* ------------------------------------------------------------------ */
/*  Template variables for Documenso document generation               */
/* ------------------------------------------------------------------ */

export const CONTRACT_VARIABLES = [
  { key: "{{contrato_titulo}}", label: "Título do Contrato" },
  { key: "{{contrato_tipo}}", label: "Tipo do Contrato" },
  { key: "{{contrato_valor_total}}", label: "Valor Total (R$)" },
  { key: "{{contrato_valor_mensal}}", label: "Valor Mensal (R$)" },
  { key: "{{contrato_data_inicio}}", label: "Data Início" },
  { key: "{{contrato_data_fim}}", label: "Data Fim" },
  { key: "{{contrato_modelo_cobranca}}", label: "Modelo de Cobrança" },
  { key: "{{contrato_horas_incluidas}}", label: "Horas Incluídas/Mês" },
  { key: "{{contrato_valor_hora}}", label: "Valor por Hora (R$)" },
  {
    key: "{{contrato_valor_hora_excedente}}",
    label: "Valor Hora Excedente (R$)",
  },
  { key: "{{contrato_sla_resposta}}", label: "SLA Resposta (horas)" },
  { key: "{{contrato_sla_resolucao}}", label: "SLA Resolução (horas)" },
  { key: "{{contrato_termos}}", label: "Termos e Condições" },
  { key: "{{contato_nome}}", label: "Nome do Contato" },
  { key: "{{contato_email}}", label: "Email do Contato" },
  { key: "{{contato_telefone}}", label: "Telefone do Contato" },
  { key: "{{cliente_nome}}", label: "Nome do Cliente" },
  { key: "{{data_hoje}}", label: "Data de Hoje" },
];

/**
 * Build variable values for contract document template rendering.
 */
export function buildContractVariableValues(
  contract: Contract,
  customerName?: string,
): Record<string, string> {
  return {
    "{{contrato_titulo}}": contract.title || "",
    "{{contrato_tipo}}": getContractTypeLabel(contract.contract_type),
    "{{contrato_valor_total}}": formatContractCurrency(contract.total_value),
    "{{contrato_valor_mensal}}": formatContractCurrency(contract.monthly_value),
    "{{contrato_data_inicio}}": contract.start_date
      ? formatDateShort(contract.start_date)
      : "",
    "{{contrato_data_fim}}": contract.end_date
      ? formatDateShort(contract.end_date)
      : "",
    "{{contrato_modelo_cobranca}}": getBillingModelLabel(
      contract.billing_model,
    ),
    "{{contrato_horas_incluidas}}": String(
      contract.included_hours_monthly ?? 0,
    ),
    "{{contrato_valor_hora}}": formatContractCurrency(contract.hourly_rate),
    "{{contrato_valor_hora_excedente}}": formatContractCurrency(
      contract.excess_hourly_rate,
    ),
    "{{contrato_sla_resposta}}": contract.sla_response_hours
      ? `${contract.sla_response_hours}h`
      : "",
    "{{contrato_sla_resolucao}}": contract.sla_resolution_hours
      ? `${contract.sla_resolution_hours}h`
      : "",
    "{{contrato_termos}}": contract.terms || "",
    "{{contato_nome}}": contract.contact_name || "",
    "{{contato_email}}": contract.contact_email || "",
    "{{contato_telefone}}": contract.contact_phone || "",
    "{{cliente_nome}}": customerName || "",
    "{{data_hoje}}": formatDateShort(new Date().toISOString()),
  };
}

/* ------------------------------------------------------------------ */
/*  Private helpers                                                    */
/* ------------------------------------------------------------------ */

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return dateStr;
  }
}
