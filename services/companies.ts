/**
 * Companies Service
 *
 * Manages CNPJ-based company entities and their member relationships.
 * Companies are clients of a tenant — multiple users (CPFs) can be
 * linked to a company to collectively manage its properties/processes.
 *
 * Key concepts:
 * - Identity is always CPF (login, audit, etc.)
 * - Ownership can be CPF (PF) or CNPJ (PJ)
 * - tenant_id scopes everything (company is a tenant's client)
 * - company_members links CPFs to companies (admin | member)
 * - A CPF can belong to multiple companies
 * - A CPF can be invited before having an account (user_id = null)
 */

import { api } from "./api";
import { formatCnpj, lookupCnpj, validateCnpj } from "./brasil-api";
import { buildSearchParams } from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Company {
  id: string;
  tenant_id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  email?: string;
  phone?: string;
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id?: string;
  cpf: string;
  role: "admin" | "member";
  invited_by?: string;
  tenant_id: string;
  created_at?: string;
  deleted_at?: string;
}

export type OwnerKind = "cpf" | "cnpj";

/* ------------------------------------------------------------------ */
/*  Owner Resolution                                                   */
/* ------------------------------------------------------------------ */

/**
 * Determine owner kind from a document string.
 * 11 digits = CPF, 14 digits = CNPJ.
 */
export function resolveOwnerKind(
  document: string | null | undefined,
): OwnerKind {
  const digits = (document ?? "").replace(/\D/g, "");
  return digits.length === 14 ? "cnpj" : "cpf";
}

/**
 * Check if a user (by CPF) can access a property based on ownership model.
 *
 * @param userCpf - Normalized CPF of the logged-in user (11 digits)
 * @param property - The property record
 * @param companyMemberships - company_members rows for this user
 * @param customerIds - Customer IDs linked to this user (existing PF logic)
 */
export function canUserAccessProperty(
  userCpf: string,
  property: Record<string, unknown>,
  companyMemberships: CompanyMember[],
  customerIds: string[],
): boolean {
  const ownerKind =
    (property.owner_kind as string) || resolveOwnerKind(property.cpf as string);

  if (ownerKind === "cnpj" && property.company_id) {
    // PJ: user must be a member of the company
    return companyMemberships.some(
      (m) => m.company_id === property.company_id && !m.deleted_at,
    );
  }

  // PF: existing logic — CPF match or customer_id match
  const propCpf = ((property.cpf as string) ?? "").replace(/\D/g, "");
  const normalizedUser = userCpf.replace(/\D/g, "");

  if (propCpf && normalizedUser && propCpf === normalizedUser) return true;
  if (
    property.customer_id &&
    customerIds.includes(property.customer_id as string)
  )
    return true;

  return false;
}

/* ------------------------------------------------------------------ */
/*  CRUD Helpers                                                       */
/* ------------------------------------------------------------------ */

import { CRUD_ENDPOINT as CRUD } from "@/services/crud";

function normalizeCrudResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const obj = data as Record<string, unknown>;
  const list = obj?.data ?? obj?.value ?? obj?.items ?? [];
  return Array.isArray(list) ? (list as T[]) : [];
}

/* ------------------------------------------------------------------ */
/*  Company CRUD                                                       */
/* ------------------------------------------------------------------ */

export async function listCompanies(tenantId?: string): Promise<Company[]> {
  const res = await api.post(CRUD, {
    action: "list",
    table: "companies",
    ...(tenantId
      ? buildSearchParams([{ field: "tenant_id", value: tenantId }])
      : {}),
  });
  let list = normalizeCrudResponse<Company>(res.data);
  if (tenantId) {
    list = list.filter((c) => c.tenant_id === tenantId && !c.deleted_at);
  } else {
    list = list.filter((c) => !c.deleted_at);
  }
  return list;
}

export async function getCompany(id: string): Promise<Company | null> {
  const res = await api.post(CRUD, {
    action: "list",
    table: "companies",
    ...buildSearchParams([{ field: "id", value: id }]),
  });
  const list = normalizeCrudResponse<Company>(res.data);
  return list.find((c) => c.id === id && !c.deleted_at) ?? null;
}

export async function getCompanyByCnpj(
  cnpj: string,
  tenantId: string,
): Promise<Company | null> {
  const digits = cnpj.replace(/\D/g, "");
  const list = await listCompanies(tenantId);
  return list.find((c) => c.cnpj === digits) ?? null;
}

export async function createCompany(data: Partial<Company>): Promise<Company> {
  const payload: Record<string, unknown> = { ...data };
  if (payload.cnpj) payload.cnpj = (payload.cnpj as string).replace(/\D/g, "");
  const res = await api.post(CRUD, {
    action: "create",
    table: "companies",
    payload,
  });
  const result = res.data;
  return Array.isArray(result) ? result[0] : (result?.data ?? result);
}

export async function updateCompany(
  id: string,
  data: Partial<Company>,
): Promise<Company> {
  const payload: Record<string, unknown> = { ...data, id };
  if (payload.cnpj) payload.cnpj = (payload.cnpj as string).replace(/\D/g, "");
  const res = await api.post(CRUD, {
    action: "update",
    table: "companies",
    payload,
  });
  const result = res.data;
  return Array.isArray(result) ? result[0] : (result?.data ?? result);
}

export async function deleteCompany(id: string): Promise<void> {
  await api.post(CRUD, {
    action: "update",
    table: "companies",
    payload: { id, deleted_at: new Date().toISOString() },
  });
}

/**
 * Create a company from a CNPJ lookup — auto-fills razão social, address, etc.
 * Returns the created company with all BrasilAPI data pre-filled.
 */
export async function createCompanyFromCnpj(
  cnpj: string,
  tenantId: string,
  createdByUserId: string,
): Promise<Company> {
  const digits = cnpj.replace(/\D/g, "");
  if (!validateCnpj(digits)) throw new Error("CNPJ inválido");

  // Check if already exists for this tenant
  const existing = await getCompanyByCnpj(digits, tenantId);
  if (existing) throw new Error("Empresa já cadastrada neste tenant");

  // Auto-fill from BrasilAPI
  let autoFill: Partial<Company> = {};
  try {
    const cnpjData = await lookupCnpj(digits);
    if (cnpjData) {
      autoFill = {
        razao_social: cnpjData.razao_social,
        nome_fantasia: cnpjData.nome_fantasia || undefined,
        email: cnpjData.email || undefined,
        phone: cnpjData.ddd_telefone_1 || undefined,
        address: cnpjData.logradouro || undefined,
        number: cnpjData.numero || undefined,
        complement: cnpjData.complemento || undefined,
        neighborhood: cnpjData.bairro || undefined,
        city: cnpjData.municipio || undefined,
        state: cnpjData.uf || undefined,
        postal_code: (cnpjData.cep ?? "").replace(/\D/g, "") || undefined,
      };
    }
  } catch {
    // BrasilAPI unavailable — user can fill manually
  }

  return createCompany({
    tenant_id: tenantId,
    cnpj: digits,
    razao_social: autoFill.razao_social || "Não informada",
    ...autoFill,
    created_by: createdByUserId,
  });
}

/* ------------------------------------------------------------------ */
/*  Company Members CRUD                                               */
/* ------------------------------------------------------------------ */

export async function listCompanyMembers(
  companyId?: string,
  tenantId?: string,
): Promise<CompanyMember[]> {
  const filters: { field: string; value: string }[] = [];
  if (companyId) filters.push({ field: "company_id", value: companyId });
  if (tenantId) filters.push({ field: "tenant_id", value: tenantId });
  const res = await api.post(CRUD, {
    action: "list",
    table: "company_members",
    ...(filters.length
      ? buildSearchParams(filters, { combineType: "AND" })
      : {}),
  });
  let list = normalizeCrudResponse<CompanyMember>(res.data);
  list = list.filter((m) => !m.deleted_at);
  if (companyId) list = list.filter((m) => m.company_id === companyId);
  if (tenantId) list = list.filter((m) => m.tenant_id === tenantId);
  return list;
}

export async function getMembershipsByUser(
  userCpf: string,
  tenantId?: string,
): Promise<CompanyMember[]> {
  const digits = userCpf.replace(/\D/g, "");
  const all = await listCompanyMembers(undefined, tenantId);
  return all.filter((m) => m.cpf === digits);
}

export async function addCompanyMember(
  data: Partial<CompanyMember>,
): Promise<CompanyMember> {
  const payload: Record<string, unknown> = { ...data };
  if (payload.cpf) payload.cpf = (payload.cpf as string).replace(/\D/g, "");
  const res = await api.post(CRUD, {
    action: "create",
    table: "company_members",
    payload,
  });
  const result = res.data;
  return Array.isArray(result) ? result[0] : (result?.data ?? result);
}

export async function updateCompanyMember(
  id: string,
  data: Partial<CompanyMember>,
): Promise<CompanyMember> {
  const res = await api.post(CRUD, {
    action: "update",
    table: "company_members",
    payload: { ...data, id },
  });
  const result = res.data;
  return Array.isArray(result) ? result[0] : (result?.data ?? result);
}

export async function removeCompanyMember(id: string): Promise<void> {
  await api.post(CRUD, {
    action: "update",
    table: "company_members",
    payload: { id, deleted_at: new Date().toISOString() },
  });
}

/**
 * Invite a CPF to a company. If the CPF already has a user account,
 * automatically links the user_id.
 */
export async function inviteMemberByCpf(
  companyId: string,
  cpf: string,
  role: "admin" | "member",
  invitedByUserId: string,
  tenantId: string,
): Promise<CompanyMember> {
  const digits = cpf.replace(/\D/g, "");

  // Check if already a member
  const existing = await listCompanyMembers(companyId);
  if (existing.some((m) => m.cpf === digits)) {
    throw new Error("CPF já é membro desta empresa");
  }

  // Try to find an existing user with this CPF (for auto-link)
  let userId: string | undefined;
  try {
    const usersRes = await api.post(CRUD, {
      action: "list",
      table: "users",
      ...buildSearchParams([{ field: "cpf", value: digits }]),
    });
    const users = normalizeCrudResponse<Record<string, unknown>>(usersRes.data);
    const match = users.find(
      (u) =>
        ((u.cpf as string) ?? "").replace(/\D/g, "") === digits &&
        !u.deleted_at,
    );
    if (match) userId = match.id as string;
  } catch {
    // Users list unavailable — link later
  }

  return addCompanyMember({
    company_id: companyId,
    user_id: userId,
    cpf: digits,
    role,
    invited_by: invitedByUserId,
    tenant_id: tenantId,
  });
}

/* ------------------------------------------------------------------ */
/*  Auto-link: called after user registration / login                  */
/* ------------------------------------------------------------------ */

/**
 * After a user registers or logs in, link any pending company_members
 * rows that match their CPF but have no user_id yet.
 * Returns the number of memberships linked.
 */
export async function autoLinkUserToCompanies(
  userId: string,
  cpf: string,
): Promise<number> {
  const digits = cpf.replace(/\D/g, "");
  if (!digits || digits.length !== 11) return 0;

  const allMembers = await listCompanyMembers();
  const pending = allMembers.filter(
    (m) => m.cpf === digits && !m.user_id && !m.deleted_at,
  );

  let linked = 0;
  for (const m of pending) {
    try {
      await updateCompanyMember(m.id, { user_id: userId });
      linked++;
    } catch {
      // silently continue
    }
  }
  return linked;
}

/* ------------------------------------------------------------------ */
/*  Formatting utilities                                               */
/* ------------------------------------------------------------------ */

export { formatCnpj, validateCnpj };

