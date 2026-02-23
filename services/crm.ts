/**
 * CRM Service Layer
 *
 * Manages leads, lead activities, and the Lead → Customer conversion flow.
 *
 * Architecture:
 *   Lead (CRM)  →  Customer (Pré-cadastro)  →  User (Conta)
 *   - Lead: someone who showed interest (pipeline: novo → convertido | perdido)
 *   - Customer: active client with CPF/CNPJ (may not have an app account)
 *   - User: authenticated app account (customers.user_id links to it)
 *
 * On conversion, the service checks if a Customer with the same CPF/email/phone
 * already exists. If so, it links the lead to the existing customer instead of
 * creating a duplicate.
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

export type LeadStatus =
  | "novo"
  | "contactado"
  | "qualificado"
  | "proposta"
  | "negociacao"
  | "convertido"
  | "perdido";

export type LeadSource =
  | "manual"
  | "whatsapp"
  | "formulario"
  | "indicacao"
  | "website"
  | "telefone"
  | "campanha";

export type LeadPriority = "baixa" | "media" | "alta" | "urgente";

export type ActivityType =
  | "nota"
  | "ligacao"
  | "email"
  | "whatsapp"
  | "reuniao"
  | "proposta"
  | "follow_up";

export interface Lead {
  id: string;
  tenant_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
  company_name?: string | null;
  status: LeadStatus;
  source?: LeadSource | string | null;
  source_detail?: string | null;
  assigned_to?: string | null;
  estimated_value?: number | string | null;
  interested_service_type_id?: string | null;
  campaign_id?: string | null;
  customer_id?: string | null;
  converted_at?: string | null;
  lost_reason?: string | null;
  notes?: string | null;
  tags?: string | null;
  priority?: LeadPriority | null;
  next_follow_up_at?: string | null;
  last_contact_at?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  tenant_id: string;
  type: ActivityType | string;
  title?: string | null;
  description?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
  user_id?: string | null;
  tenant_id?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Pipeline Configuration                                             */
/* ------------------------------------------------------------------ */

export const LEAD_STATUSES: {
  value: LeadStatus;
  label: string;
  color: string;
  icon: string;
}[] = [
  {
    value: "novo",
    label: "Novo",
    color: "#3b82f6",
    icon: "sparkles-outline",
  },
  {
    value: "contactado",
    label: "Contactado",
    color: "#8b5cf6",
    icon: "chatbubble-outline",
  },
  {
    value: "qualificado",
    label: "Qualificado",
    color: "#f59e0b",
    icon: "checkmark-circle-outline",
  },
  {
    value: "proposta",
    label: "Proposta",
    color: "#06b6d4",
    icon: "document-text-outline",
  },
  {
    value: "negociacao",
    label: "Negociação",
    color: "#ec4899",
    icon: "swap-horizontal-outline",
  },
  {
    value: "convertido",
    label: "Convertido",
    color: "#22c55e",
    icon: "checkmark-done-outline",
  },
  {
    value: "perdido",
    label: "Perdido",
    color: "#ef4444",
    icon: "close-circle-outline",
  },
];

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: "manual", label: "Cadastro Manual" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "formulario", label: "Formulário" },
  { value: "indicacao", label: "Indicação" },
  { value: "website", label: "Website" },
  { value: "telefone", label: "Telefone" },
  { value: "campanha", label: "Campanha" },
];

export const LEAD_PRIORITIES: {
  value: LeadPriority;
  label: string;
  color: string;
}[] = [
  { value: "baixa", label: "Baixa", color: "#22c55e" },
  { value: "media", label: "Média", color: "#f59e0b" },
  { value: "alta", label: "Alta", color: "#f97316" },
  { value: "urgente", label: "Urgente", color: "#ef4444" },
];

export const ACTIVITY_TYPES: {
  value: ActivityType;
  label: string;
  icon: string;
}[] = [
  { value: "nota", label: "Nota", icon: "create-outline" },
  { value: "ligacao", label: "Ligação", icon: "call-outline" },
  { value: "email", label: "E-mail", icon: "mail-outline" },
  { value: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" },
  { value: "reuniao", label: "Reunião", icon: "people-outline" },
  { value: "proposta", label: "Proposta", icon: "document-text-outline" },
  { value: "follow_up", label: "Follow-up", icon: "alarm-outline" },
];

/** Pipeline stages that allow conversion (active, not terminal) */
export const CONVERTIBLE_STATUSES: LeadStatus[] = [
  "qualificado",
  "proposta",
  "negociacao",
];

/* ------------------------------------------------------------------ */
/*  Lead CRUD                                                          */
/* ------------------------------------------------------------------ */

export async function listLeads(
  tenantId: string,
  filters?: CrudFilter[],
  options?: CrudListOptions,
): Promise<Lead[]> {
  const baseFilters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    ...(filters ?? []),
  ];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "leads",
    ...buildSearchParams(baseFilters, {
      sortColumn: options?.sortColumn ?? "created_at DESC",
      ...options,
    }),
  });
  return normalizeCrudList<Lead>(res.data).filter((l) => !l.deleted_at);
}

export async function getLeadById(leadId: string): Promise<Lead | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "leads",
    ...buildSearchParams([{ field: "id", value: leadId }]),
  });
  const list = normalizeCrudList<Lead>(res.data);
  return list.length > 0 ? list[0] : null;
}

export async function createLead(
  payload: Omit<Lead, "id" | "created_at" | "updated_at" | "deleted_at">,
): Promise<Lead> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "leads",
    payload: {
      ...payload,
      status: payload.status || "novo",
      priority: payload.priority || "media",
    },
  });
  return normalizeCrudOne<Lead>(res.data);
}

export async function updateLead(
  leadId: string,
  payload: Partial<Lead>,
): Promise<Lead> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "leads",
    payload: { id: leadId, ...payload },
  });
  return normalizeCrudOne<Lead>(res.data);
}

export async function deleteLead(leadId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "leads",
    payload: { id: leadId, deleted_at: new Date().toISOString() },
  });
}

/* ------------------------------------------------------------------ */
/*  Lead Activities                                                    */
/* ------------------------------------------------------------------ */

export async function listLeadActivities(
  leadId: string,
): Promise<LeadActivity[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "lead_activities",
    ...buildSearchParams([{ field: "lead_id", value: leadId }], {
      sortColumn: "created_at DESC",
    }),
  });
  return normalizeCrudList<LeadActivity>(res.data).filter((a) => !a.deleted_at);
}

export async function createLeadActivity(
  payload: Omit<
    LeadActivity,
    "id" | "created_at" | "updated_at" | "deleted_at"
  >,
): Promise<LeadActivity> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "lead_activities",
    payload,
  });
  return normalizeCrudOne<LeadActivity>(res.data);
}

/* ------------------------------------------------------------------ */
/*  Lead → Customer Conversion                                         */
/* ------------------------------------------------------------------ */

/**
 * Find an existing customer by CPF, email, or phone (in that priority).
 * Returns the first match found, or null.
 */
export async function findExistingCustomer(
  tenantId: string,
  lead: Pick<Lead, "cpf" | "email" | "phone">,
): Promise<Customer | null> {
  const cpf = (lead.cpf ?? "").replace(/\D/g, "");
  const email = (lead.email ?? "").trim().toLowerCase();
  const phone = (lead.phone ?? "").replace(/\D/g, "");

  // Priority 1: match by CPF (most reliable identifier)
  if (cpf.length >= 11) {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "customers",
      ...buildSearchParams([
        { field: "tenant_id", value: tenantId },
        { field: "cpf", value: cpf },
      ]),
    });
    const matches = normalizeCrudList<Customer>(res.data).filter(
      (c) => !c.deleted_at,
    );
    if (matches.length > 0) return matches[0];
  }

  // Priority 2: match by email
  if (email) {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "customers",
      ...buildSearchParams([
        { field: "tenant_id", value: tenantId },
        { field: "email", value: email },
      ]),
    });
    const matches = normalizeCrudList<Customer>(res.data).filter(
      (c) => !c.deleted_at,
    );
    if (matches.length > 0) return matches[0];
  }

  // Priority 3: match by phone
  if (phone.length >= 10) {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "customers",
      ...buildSearchParams([
        { field: "tenant_id", value: tenantId },
        { field: "phone", value: phone },
      ]),
    });
    const matches = normalizeCrudList<Customer>(res.data).filter(
      (c) => !c.deleted_at,
    );
    if (matches.length > 0) return matches[0];
  }

  return null;
}

/**
 * Convert a lead to a customer.
 *
 * 1) Checks if a customer with same CPF/email/phone already exists in the tenant.
 *    - If yes → links lead to existing customer (no duplicate created).
 *    - If no → creates a new customer from lead data.
 * 2) Updates lead: status → "convertido", customer_id set, converted_at set.
 * 3) Logs a "proposta" activity on the lead.
 *
 * Returns { lead, customer, isExisting }.
 */
export async function convertLeadToCustomer(lead: Lead): Promise<{
  lead: Lead;
  customer: Customer;
  isExisting: boolean;
}> {
  if (!lead.tenant_id) throw new Error("Lead sem tenant_id");

  // 1. Check if customer already exists
  const existing = await findExistingCustomer(lead.tenant_id, lead);

  let customer: Customer;
  let isExisting = false;

  if (existing) {
    // Link to existing customer — update customer data if richer
    customer = existing;
    isExisting = true;

    // Optionally enrich existing customer with lead data
    const updates: Record<string, unknown> = { id: existing.id };
    if (!existing.email && lead.email) updates.email = lead.email;
    if (!existing.phone && lead.phone) updates.phone = lead.phone;
    if (!existing.cpf && lead.cpf) updates.cpf = lead.cpf;
    if (Object.keys(updates).length > 1) {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "customers",
        payload: updates,
      });
    }
  } else {
    // Create new customer from lead data
    const createRes = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "customers",
      payload: {
        name: lead.name,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        cpf: lead.cpf ? lead.cpf.replace(/\D/g, "") : null,
        tenant_id: lead.tenant_id,
      },
    });
    customer = normalizeCrudOne<Customer>(createRes.data);
  }

  // 2. Update lead as converted
  const updatedLead = await updateLead(lead.id, {
    status: "convertido",
    customer_id: customer.id,
    converted_at: new Date().toISOString(),
  });

  // 3. Log conversion activity
  await createLeadActivity({
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    type: "nota",
    title: isExisting
      ? "Convertido — vinculado a cliente existente"
      : "Convertido — novo cliente criado",
    description: `Cliente: ${customer.name} (${customer.id.slice(0, 8)})`,
    created_by: null,
  });

  return { lead: updatedLead, customer, isExisting };
}

/**
 * Mark a lead as lost with a reason.
 */
export async function markLeadAsLost(
  leadId: string,
  reason: string,
): Promise<Lead> {
  return updateLead(leadId, {
    status: "perdido",
    lost_reason: reason,
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Get status config by value */
export function getLeadStatusConfig(status: LeadStatus) {
  return LEAD_STATUSES.find((s) => s.value === status) ?? LEAD_STATUSES[0];
}

/** Get activity type config by value */
export function getActivityTypeConfig(type: ActivityType | string) {
  return ACTIVITY_TYPES.find((t) => t.value === type) ?? ACTIVITY_TYPES[0];
}

/** Pipeline stages for kanban (excludes terminal states) */
export const KANBAN_STAGES: LeadStatus[] = [
  "novo",
  "contactado",
  "qualificado",
  "proposta",
  "negociacao",
];

/** All pipeline stages including terminal */
export const ALL_STAGES: LeadStatus[] = [
  "novo",
  "contactado",
  "qualificado",
  "proposta",
  "negociacao",
  "convertido",
  "perdido",
];
