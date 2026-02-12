import { api } from "./api";

export type ServiceType = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export type CreateServiceTypePayload = Omit<
  ServiceType,
  "id" | "created_at" | "updated_at" | "deleted_at"
>;

export type UpdateServiceTypePayload = Partial<
  Omit<ServiceType, "id" | "created_at" | "updated_at" | "tenant_id">
>;

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

export async function listServiceTypes(): Promise<ServiceType[]> {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "service_types",
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? (list as ServiceType[]) : [];
}

export async function createServiceType(
  payload: CreateServiceTypePayload,
): Promise<ServiceType> {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "service_types",
    payload,
  });
  const data = response.data;
  const base = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data);
  return base as ServiceType;
}

export async function updateServiceType(
  payload: UpdateServiceTypePayload & { id?: string | null },
): Promise<ServiceType> {
  if (!payload.id) {
    throw new Error("Id obrigatorio para atualizar");
  }
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "service_types",
    payload,
  });
  const data = response.data;
  const base = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data);
  return base as ServiceType;
}

export async function deleteServiceType(id: string): Promise<unknown> {
  if (!id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(ENDPOINT, {
    action: "delete",
    table: "service_types",
    payload: { id },
  });
  return response.data;
}
