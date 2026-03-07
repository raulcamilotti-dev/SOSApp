/**
 * Entity Builder Service — CRUD for dynamic entity definitions & records.
 *
 * Works with two tables:
 *   - entity_definitions: metadata about custom entities
 *   - entity_records: JSONB data rows for those entities
 *
 * Custom fields for entities use target_table = "entity::<ref_key>"
 * in the custom_field_definitions table.
 */

import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    type CrudFilter,
    normalizeCrudList,
    normalizeCrudOne,
} from "@/services/crud";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Prefix used in custom_field_definitions.target_table for entity fields */
export const ENTITY_TARGET_PREFIX = "entity::";

/** Build the target_table value for a custom entity */
export const entityTargetTable = (refKey: string): string =>
  `${ENTITY_TARGET_PREFIX}${refKey}`;

/** Check if a target_table string refers to a custom entity */
export const isEntityTarget = (targetTable: string): boolean =>
  targetTable.startsWith(ENTITY_TARGET_PREFIX);

/** Extract the ref_key from an entity target_table string */
export const extractEntityRefKey = (targetTable: string): string =>
  targetTable.replace(ENTITY_TARGET_PREFIX, "");

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EntityDefinition {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  ref_key: string;
  name: string;
  name_plural?: string;
  description?: string;
  icon?: string;
  parent_table?: string;
  parent_label?: string;
  is_system?: boolean;
  module_key?: string;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface EntityRecord {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  entity_definition_id: string;
  parent_record_id?: string;
  data: Record<string, unknown>;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

/* ------------------------------------------------------------------ */
/*  Well-known parent tables (for wizard dropdown)                     */
/* ------------------------------------------------------------------ */

export const PARENT_TABLE_OPTIONS: { label: string; value: string }[] = [
  { label: "(Nenhum — entidade independente)", value: "" },
  { label: "Clientes", value: "customers" },
  { label: "Ordens de Serviço", value: "service_orders" },
  { label: "Leads", value: "leads" },
  { label: "Parceiros", value: "partners" },
  { label: "Empresas", value: "companies" },
  { label: "Produtos", value: "products" },
  { label: "Fornecedores", value: "suppliers" },
  { label: "Contratos", value: "contracts" },
  { label: "Faturas", value: "invoices" },
];

/** Icon options for entity picker */
export const ENTITY_ICON_OPTIONS: { label: string; value: string }[] = [
  { label: "📄 Documento", value: "document-outline" },
  { label: "📋 Lista", value: "list-outline" },
  { label: "🩺 Saúde", value: "medkit-outline" },
  { label: "🔧 Ferramenta", value: "build-outline" },
  { label: "📦 Caixa", value: "cube-outline" },
  { label: "🏷️ Tag", value: "pricetag-outline" },
  { label: "📊 Gráfico", value: "bar-chart-outline" },
  { label: "🗂️ Pasta", value: "folder-outline" },
  { label: "👤 Pessoa", value: "person-outline" },
  { label: "🏢 Empresa", value: "business-outline" },
  { label: "🔬 Ciência", value: "flask-outline" },
  { label: "📝 Nota", value: "create-outline" },
  { label: "⭐ Estrela", value: "star-outline" },
  { label: "🔔 Notificação", value: "notifications-outline" },
  { label: "📅 Calendário", value: "calendar-outline" },
  { label: "🗺️ Mapa", value: "map-outline" },
  { label: "💰 Dinheiro", value: "cash-outline" },
  { label: "⚙️ Engrenagem", value: "cog-outline" },
];

/* ------------------------------------------------------------------ */
/*  Entity Definition CRUD                                             */
/* ------------------------------------------------------------------ */

/** Load all entity definitions for a tenant */
export async function loadEntityDefinitions(
  tenantId: string,
): Promise<EntityDefinition[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "entity_definitions",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
      sortColumn: "name ASC",
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<EntityDefinition>(res.data);
}

/** Load a single entity definition by ID */
export async function loadEntityDefinition(
  id: string,
): Promise<EntityDefinition | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "entity_definitions",
    ...buildSearchParams([{ field: "id", value: id }]),
  });
  const list = normalizeCrudList<EntityDefinition>(res.data);
  return list[0] ?? null;
}

/** Load a single entity definition by ref_key + tenant */
export async function loadEntityDefinitionByRefKey(
  tenantId: string,
  refKey: string,
): Promise<EntityDefinition | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "entity_definitions",
    ...buildSearchParams([
      { field: "tenant_id", value: tenantId },
      { field: "ref_key", value: refKey },
    ]),
  });
  const list = normalizeCrudList<EntityDefinition>(res.data);
  return list.find((e) => !e.deleted_at) ?? null;
}

/** Create a new entity definition */
export async function createEntityDefinition(
  payload: Partial<EntityDefinition>,
): Promise<EntityDefinition> {
  const now = new Date().toISOString();
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "entity_definitions",
    payload: {
      ...payload,
      config: payload.config ? JSON.stringify(payload.config) : "{}",
      created_at: now,
      updated_at: now,
    },
  });
  return normalizeCrudOne<EntityDefinition>(res.data);
}

/** Update an entity definition */
export async function updateEntityDefinition(
  payload: Partial<EntityDefinition> & { id: string },
): Promise<EntityDefinition> {
  const now = new Date().toISOString();
  const cleanPayload: Record<string, unknown> = { ...payload, updated_at: now };
  if (payload.config && typeof payload.config === "object") {
    cleanPayload.config = JSON.stringify(payload.config);
  }
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "entity_definitions",
    payload: cleanPayload,
  });
  return normalizeCrudOne<EntityDefinition>(res.data);
}

/** Soft-delete an entity definition */
export async function deleteEntityDefinition(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "entity_definitions",
    payload: {
      id,
      deleted_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Entity Record CRUD                                                 */
/* ------------------------------------------------------------------ */

/** Load records for an entity definition (optionally filtered by parent) */
export async function loadEntityRecords(
  tenantId: string,
  entityDefinitionId: string,
  parentRecordId?: string,
): Promise<EntityRecord[]> {
  const filters: CrudFilter[] = [
    { field: "tenant_id", value: tenantId },
    { field: "entity_definition_id", value: entityDefinitionId },
  ];
  if (parentRecordId) {
    filters.push({ field: "parent_record_id", value: parentRecordId });
  }
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "entity_records",
    ...buildSearchParams(filters, {
      sortColumn: "created_at DESC",
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<EntityRecord>(res.data);
}

/** Create a new entity record */
export async function createEntityRecord(
  payload: Partial<EntityRecord>,
): Promise<EntityRecord> {
  const now = new Date().toISOString();
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "entity_records",
    payload: {
      ...payload,
      data: payload.data ? JSON.stringify(payload.data) : "{}",
      created_at: now,
      updated_at: now,
    },
  });
  return normalizeCrudOne<EntityRecord>(res.data);
}

/** Update an entity record */
export async function updateEntityRecord(
  payload: Partial<EntityRecord> & { id: string },
): Promise<EntityRecord> {
  const now = new Date().toISOString();
  const cleanPayload: Record<string, unknown> = { ...payload, updated_at: now };
  if (payload.data && typeof payload.data === "object") {
    cleanPayload.data = JSON.stringify(payload.data);
  }
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "entity_records",
    payload: cleanPayload,
  });
  return normalizeCrudOne<EntityRecord>(res.data);
}

/** Soft-delete an entity record */
export async function deleteEntityRecord(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "entity_records",
    payload: {
      id,
      deleted_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

/** Generate a URL-safe ref_key from a display name */
export function nameToRefKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

/** Get the display label for a parent_table value */
export function getParentTableLabel(parentTable?: string): string {
  if (!parentTable) return "(Independente)";
  const option = PARENT_TABLE_OPTIONS.find((o) => o.value === parentTable);
  return option?.label ?? parentTable;
}
