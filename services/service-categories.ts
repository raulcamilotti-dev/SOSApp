import { api } from "./api";
import { CRUD_ENDPOINT, normalizeCrudList, normalizeCrudOne } from "./crud";

export type ServiceCategory = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export type CreateServiceCategoryPayload = Omit<
  ServiceCategory,
  "id" | "created_at" | "updated_at" | "deleted_at"
>;

export type UpdateServiceCategoryPayload = Partial<
  Omit<ServiceCategory, "id" | "created_at" | "updated_at" | "tenant_id">
>;

const ENDPOINT = CRUD_ENDPOINT;

export async function listServiceCategories(): Promise<ServiceCategory[]> {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "service_categories",
  });
  return normalizeCrudList<ServiceCategory>(response.data).filter(
    (row) => !row.deleted_at,
  );
}

export async function createServiceCategory(
  payload: CreateServiceCategoryPayload,
): Promise<ServiceCategory> {
  const response = await api.post(ENDPOINT, {
    action: "create",
    table: "service_categories",
    payload,
  });
  const created = normalizeCrudOne<ServiceCategory>(response.data);
  if (!created) {
    throw new Error("Resposta inválida ao criar categoria de serviço");
  }
  return created;
}

export async function updateServiceCategory(
  payload: UpdateServiceCategoryPayload & { id?: string | null },
): Promise<ServiceCategory> {
  if (!payload.id) {
    throw new Error("Id obrigatório para atualizar");
  }
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "service_categories",
    payload,
  });
  const updated = normalizeCrudOne<ServiceCategory>(response.data);
  if (!updated) {
    throw new Error("Resposta inválida ao atualizar categoria de serviço");
  }
  return updated;
}

export async function deleteServiceCategory(id: string): Promise<unknown> {
  if (!id) {
    throw new Error("Id obrigatório para deletar");
  }
  const response = await api.post(ENDPOINT, {
    action: "delete",
    table: "service_categories",
    payload: { id },
  });
  return response.data;
}
