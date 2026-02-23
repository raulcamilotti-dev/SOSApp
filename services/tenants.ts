import { api } from "./api";
import { CRUD_ENDPOINT } from "./crud";

export type TenantConfig = Record<string, unknown>;

export type Tenant = {
  id: string;
  company_name?: string | null;
  whatsapp_number?: string | null;
  plan?: string | null;
  status?: string | null;
  config?: TenantConfig | null;
  workflow_template_id?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export type CreateTenantPayload = {
  company_name: string;
  whatsapp_number?: string;
  plan?: string;
  status?: string;
  config?: TenantConfig;
};

export type UpdateTenantPayload = {
  id: string;
  company_name?: string;
  whatsapp_number?: string;
  plan?: string;
  status?: string;
  config?: TenantConfig;
  workflow_template_id?: string | null;
};

const TENANT_ENDPOINT = CRUD_ENDPOINT;

const normalizeTenant = (payload: any): Tenant => {
  if (!payload || typeof payload !== "object") {
    return { id: "" } as Tenant;
  }
  return {
    id: payload.id ?? payload.tenant_id ?? payload.uuid ?? "",
    company_name: payload.company_name ?? payload.company ?? null,
    whatsapp_number:
      payload.whatsapp_number ?? payload.whatsapp ?? payload.phone ?? null,
    plan: payload.plan ?? null,
    status: payload.status ?? null,
    config: payload.config ?? payload.settings ?? null,
    workflow_template_id: payload.workflow_template_id ?? null,
    created_at: payload.created_at ?? null,
    ...payload,
  } as Tenant;
};

export async function listTenants(): Promise<Tenant[]> {
  const response = await api.post(TENANT_ENDPOINT, {
    action: "list",
    table: "tenants",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? list.map(normalizeTenant) : [];
}

export async function createTenant(
  payload: CreateTenantPayload,
): Promise<Tenant> {
  const response = await api.post(TENANT_ENDPOINT, {
    action: "create",
    table: "tenants",
    payload,
  });
  const data = response.data;
  const base = Array.isArray(data) ? data[0] : (data?.data ?? data);
  return normalizeTenant(base);
}

export async function updateTenant(
  payload: UpdateTenantPayload,
): Promise<Tenant> {
  const response = await api.post(TENANT_ENDPOINT, {
    action: "update",
    table: "tenants",
    payload,
  });
  const data = response.data;
  const base = Array.isArray(data) ? data[0] : (data?.data ?? data);
  return normalizeTenant(base);
}
