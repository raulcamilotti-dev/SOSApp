/**
 * Service Orders - Service Layer
 *
 * CRUD operations for service_orders, service_order_context,
 * process_updates, and process_update_files tables.
 */

import { api } from "./api";
import type { CrudFilter } from "./crud";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
  normalizeCrudOne,
} from "./crud";

// ── Types ──

export interface ServiceOrder {
  id: string;
  tenant_id: string;
  partner_id?: string | null;
  customer_id?: string | null;
  service_type_id?: string | null;
  service_id?: string | null;
  appointment_id?: string | null;
  template_id?: string | null;
  current_step_id?: string | null;
  process_status: string;
  title?: string | null;
  description?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface ServiceOrderContext {
  id: string;
  service_order_id: string;
  entity_type: string;
  entity_id: string;
}

export interface ProcessUpdate {
  id: string;
  service_order_id: string;
  title?: string | null;
  description?: string | null;
  created_by?: string | null;
  is_client_visible?: boolean;
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface ProcessUpdateFile {
  id: string;
  process_update_id: string;
  file_name?: string | null;
  description?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  file_data?: string | null;
  storage_type?: "drive" | "database" | "both";
  drive_file_id?: string | null;
  drive_web_view_link?: string | null;
  drive_web_content_link?: string | null;
  is_client_visible?: boolean;
  include_in_protocol?: boolean;
  created_at?: string;
  deleted_at?: string | null;
}

// ── Service Orders CRUD ──

export async function listServiceOrders(
  filters?: CrudFilter[],
  options?: { sortColumn?: string },
): Promise<ServiceOrder[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_orders",
    ...(filters && filters.length > 0
      ? buildSearchParams(filters, {
          sortColumn: options?.sortColumn ?? "created_at DESC",
        })
      : { sort_column: options?.sortColumn ?? "created_at DESC" }),
  });
  return normalizeCrudList<ServiceOrder>(res.data).filter((o) => !o.deleted_at);
}

export async function getServiceOrder(
  id: string,
): Promise<ServiceOrder | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_orders",
    ...buildSearchParams([{ field: "id", value: id }]),
  });
  const list = normalizeCrudList<ServiceOrder>(res.data).filter(
    (o) => !o.deleted_at,
  );
  return list[0] ?? null;
}

export async function createServiceOrder(
  payload: Partial<ServiceOrder>,
): Promise<ServiceOrder> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "service_orders",
    payload,
  });
  return normalizeCrudOne<ServiceOrder>(res.data);
}

export async function updateServiceOrder(
  payload: Partial<ServiceOrder> & { id: string },
): Promise<ServiceOrder> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_orders",
    payload,
  });
  return normalizeCrudOne<ServiceOrder>(res.data);
}

// ── Service Order Context ──

export async function listServiceOrderContexts(
  serviceOrderId: string,
): Promise<ServiceOrderContext[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_order_context",
    ...buildSearchParams([
      { field: "service_order_id", value: serviceOrderId },
    ]),
  });
  // Keep client-side filter as safety net
  return normalizeCrudList<ServiceOrderContext>(res.data).filter(
    (c) => c.service_order_id === serviceOrderId,
  );
}

export async function createServiceOrderContext(
  payload: Omit<ServiceOrderContext, "id">,
): Promise<ServiceOrderContext> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "service_order_context",
    payload,
  });
  return normalizeCrudOne<ServiceOrderContext>(res.data);
}

// ── Lookup helpers ──

/** Find the service order linked to a property via context table */
export async function findServiceOrderByProperty(
  propertyId: string,
): Promise<ServiceOrder | null> {
  // First find contexts linked to this property
  const contextsRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_order_context",
    ...buildSearchParams([{ field: "entity_id", value: propertyId }]),
  });

  const contexts = normalizeCrudList<ServiceOrderContext>(contextsRes.data);
  const propertyContext = contexts.find(
    (c) => c.entity_type === "property" && c.entity_id === propertyId,
  );

  if (!propertyContext) return null;

  // Then fetch only the specific service order
  return getServiceOrder(propertyContext.service_order_id);
}

/** Find service orders for a given customer */
export async function listServiceOrdersByCustomer(
  customerId: string,
): Promise<ServiceOrder[]> {
  return listServiceOrders([{ field: "customer_id", value: customerId }], {
    sortColumn: "created_at DESC",
  });
}

// ── Process Updates ──

export async function listProcessUpdates(
  serviceOrderId: string,
): Promise<ProcessUpdate[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "process_updates",
    ...buildSearchParams([
      { field: "service_order_id", value: serviceOrderId },
    ]),
  });
  // Keep client-side filter as safety net
  return normalizeCrudList<ProcessUpdate>(res.data)
    .filter((u) => !u.deleted_at)
    .filter((u) => String(u.service_order_id) === String(serviceOrderId));
}

export async function createProcessUpdate(
  payload: Partial<ProcessUpdate>,
): Promise<ProcessUpdate> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "process_updates",
    payload,
  });
  return normalizeCrudOne<ProcessUpdate>(res.data);
}

// ── Process Update Files ──

export async function listProcessUpdateFiles(
  processUpdateIds: string[],
): Promise<ProcessUpdateFile[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "process_update_files",
    // Server-side filter when we have IDs; use 'in' for multiple
    ...(processUpdateIds.length === 1
      ? buildSearchParams([
          { field: "process_update_id", value: processUpdateIds[0] },
        ])
      : processUpdateIds.length > 1
        ? buildSearchParams([
            {
              field: "process_update_id",
              value: processUpdateIds.join(","),
              operator: "in",
            },
          ])
        : {}),
  });
  const idSet = new Set(processUpdateIds);
  // Always apply client-side filter for correctness
  return normalizeCrudList<ProcessUpdateFile>(res.data)
    .filter((f) => !f.deleted_at)
    .filter((f) => idSet.has(String(f.process_update_id)));
}

export async function createProcessUpdateFile(
  payload: Partial<ProcessUpdateFile>,
): Promise<ProcessUpdateFile> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "process_update_files",
    payload,
  });
  return normalizeCrudOne<ProcessUpdateFile>(res.data);
}

/** Get a display title for a service order */
export function getServiceOrderTitle(order: ServiceOrder): string {
  return (
    order.title ||
    order.description ||
    `Ordem de serviço ${order.id.slice(0, 8)}`
  );
}
