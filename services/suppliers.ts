/**
 * Suppliers Service
 *
 * CRUD operations for the dedicated suppliers table.
 * Suppliers are separate from partners (partners = operators/sellers,
 * suppliers = companies you buy from).
 *
 * Tables: suppliers
 * Depends on: services/crud.ts, services/api.ts
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
    type CrudFilter,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  trade_name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  contact_person?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  is_active: boolean;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                               */
/* ------------------------------------------------------------------ */

export async function listSuppliers(
  tenantId: string,
  options?: { activeOnly?: boolean; limit?: number; offset?: number },
): Promise<Supplier[]> {
  const filters: CrudFilter[] = [{ field: "tenant_id", value: tenantId }];
  if (options?.activeOnly) {
    filters.push({ field: "is_active", value: "true", operator: "equal" });
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "suppliers",
    ...buildSearchParams(filters, {
      sortColumn: "name ASC",
      autoExcludeDeleted: true,
      limit: options?.limit,
      offset: options?.offset,
    }),
  });

  return normalizeCrudList<Supplier>(res.data);
}

export async function getSupplier(supplierId: string): Promise<Supplier> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "suppliers",
    ...buildSearchParams([{ field: "id", value: supplierId }]),
  });
  const items = normalizeCrudList<Supplier>(res.data);
  if (!items.length) throw new Error("Fornecedor não encontrado");
  return items[0];
}

export async function createSupplier(
  tenantId: string,
  data: Partial<
    Omit<
      Supplier,
      "id" | "tenant_id" | "created_at" | "updated_at" | "deleted_at"
    >
  >,
): Promise<Supplier> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "suppliers",
    payload: {
      tenant_id: tenantId,
      name: data.name ?? "",
      trade_name: data.trade_name ?? null,
      document: data.document ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      zip_code: data.zip_code ?? null,
      contact_person: data.contact_person ?? null,
      payment_terms: data.payment_terms ?? null,
      notes: data.notes ?? null,
      is_active: data.is_active ?? true,
    },
  });
  return normalizeCrudOne<Supplier>(res.data);
}

export async function updateSupplier(
  supplierId: string,
  changes: Partial<Supplier>,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "suppliers",
    payload: {
      id: supplierId,
      ...changes,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "suppliers",
    payload: { id: supplierId, deleted_at: new Date().toISOString() },
  });
}
