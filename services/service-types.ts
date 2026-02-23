import { api } from "./api";
import { CRUD_ENDPOINT, normalizeCrudList, normalizeCrudOne } from "./crud";

export type ServiceType = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  category_id: string | null;
  entity_table: string | null;
  default_template_id: string | null;
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

const ENDPOINT = CRUD_ENDPOINT;

export async function listServiceTypes(): Promise<ServiceType[]> {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "service_types",
  });
  return normalizeCrudList<ServiceType>(response.data).filter(
    (row) => !row.deleted_at,
  );
}

export async function createServiceType(
  payload: CreateServiceTypePayload,
): Promise<ServiceType> {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "service_types",
    payload,
  });
  const created = normalizeCrudOne<ServiceType>(response.data);
  if (!created) {
    throw new Error("Resposta inválida ao criar tipo de serviço");
  }
  return created;
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
  const updated = normalizeCrudOne<ServiceType>(response.data);
  if (!updated) {
    throw new Error("Resposta inválida ao atualizar tipo de serviço");
  }
  return updated;
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
