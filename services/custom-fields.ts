/**
 * Custom Fields Service — A.1 Roadmap Item
 *
 * Manages custom field definitions and values for the Radul Platform.
 * Allows tenants to add custom fields to any whitelisted table without
 * altering the database schema.
 *
 * Architecture:
 * - Definitions stored in `custom_field_definitions` (schema per tenant+table)
 * - Values stored in `custom_field_values` (actual data per record)
 * - Integrates with CrudScreen via `useCustomFields` hook
 *
 * @see migrations/add-custom-fields.sql
 * @see hooks/use-custom-fields.ts
 */

import type {
    CrudFieldConfig,
    CrudFieldType,
    MaskPreset,
} from "@/components/ui/CrudScreen";
import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Well-known tables for the custom fields admin UI dropdown.
 * NOT a whitelist — custom fields can target ANY table or entity.
 * Custom entities use "entity::<ref_key>" as target_table.
 */
export const CUSTOM_FIELDS_WELL_KNOWN_TABLES = [
  "customers",
  "service_orders",
  "leads",
  "partners",
  "companies",
  "products",
  "suppliers",
  "contracts",
  "invoices",
] as const;

export type CustomFieldTargetTable = string;

/** Custom fields are enabled for ALL tables (whitelist removed in v2). */
export function isCustomFieldsEnabled(_table: string): boolean {
  return true;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Raw row from custom_field_definitions table */
export interface CustomFieldDefinition {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  target_table: string;
  field_key: string;
  label: string;
  placeholder?: string | null;
  field_type: string;
  required: boolean;
  visible_in_list: boolean;
  visible_in_form: boolean;
  read_only: boolean;
  section?: string | null;
  sort_order: number;
  default_value?: string | null;
  options: { label: string; value: string }[] | null;
  validation_rules: Record<string, unknown> | null;
  mask_type?: string | null;
  reference_config: {
    table?: string;
    labelField?: string;
    idField?: string;
    searchField?: string;
  } | null;
  show_when?: {
    field: string;
    operator: string;
    value: string;
  } | null;
  is_system: boolean;
  pack_ref_key?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

/** Raw row from custom_field_values table */
export interface CustomFieldValue {
  id: string;
  tenant_id: string;
  definition_id: string;
  target_table: string;
  target_id: string;
  value: string | null;
  value_json: unknown | null;
  created_at: string;
  updated_at: string;
}

/** A custom field value keyed by field_key for easy form state merge */
export type CustomFieldValuesMap = Record<string, string>;

/* ------------------------------------------------------------------ */
/*  Definition CRUD                                                    */
/* ------------------------------------------------------------------ */

/**
 * Load all custom field definitions for a tenant + table.
 * Excludes soft-deleted definitions.
 */
export async function loadCustomFieldDefinitions(
  tenantId: string,
  targetTable: string,
): Promise<CustomFieldDefinition[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "custom_field_definitions",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "target_table", value: targetTable },
      ],
      {
        combineType: "AND",
        sortColumn: "sort_order ASC, created_at ASC",
        autoExcludeDeleted: true,
      },
    ),
  });
  return normalizeCrudList<CustomFieldDefinition>(res.data);
}

/**
 * Load ALL custom field definitions for a tenant (all tables).
 * Used by admin screen.
 */
export async function loadAllCustomFieldDefinitions(
  tenantId: string,
): Promise<CustomFieldDefinition[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "custom_field_definitions",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
      sortColumn: "target_table ASC, sort_order ASC",
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<CustomFieldDefinition>(res.data);
}

/**
 * Create a new custom field definition.
 */
export async function createCustomFieldDefinition(
  payload: Partial<CustomFieldDefinition>,
): Promise<CustomFieldDefinition> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "custom_field_definitions",
    payload: {
      ...payload,
      options: payload.options ? JSON.stringify(payload.options) : "[]",
      validation_rules: payload.validation_rules
        ? JSON.stringify(payload.validation_rules)
        : "{}",
      reference_config: payload.reference_config
        ? JSON.stringify(payload.reference_config)
        : "{}",
      show_when: payload.show_when ? JSON.stringify(payload.show_when) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  return normalizeCrudOne<CustomFieldDefinition>(res.data);
}

/**
 * Update a custom field definition.
 */
export async function updateCustomFieldDefinition(
  payload: Partial<CustomFieldDefinition> & { id: string },
): Promise<CustomFieldDefinition> {
  const updatePayload: Record<string, unknown> = { ...payload };

  // Serialize JSONB fields
  if (payload.options !== undefined) {
    updatePayload.options = JSON.stringify(payload.options ?? []);
  }
  if (payload.validation_rules !== undefined) {
    updatePayload.validation_rules = JSON.stringify(
      payload.validation_rules ?? {},
    );
  }
  if (payload.reference_config !== undefined) {
    updatePayload.reference_config = JSON.stringify(
      payload.reference_config ?? {},
    );
  }
  if (payload.show_when !== undefined) {
    updatePayload.show_when = payload.show_when
      ? JSON.stringify(payload.show_when)
      : null;
  }

  updatePayload.updated_at = new Date().toISOString();

  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "custom_field_definitions",
    payload: updatePayload,
  });
  return normalizeCrudOne<CustomFieldDefinition>(res.data);
}

/**
 * Soft-delete a custom field definition.
 * System definitions (is_system=true) cannot be deleted by tenants.
 */
export async function deleteCustomFieldDefinition(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "custom_field_definitions",
    payload: {
      id,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Value CRUD                                                         */
/* ------------------------------------------------------------------ */

/**
 * Load custom field values for multiple target records (batch).
 * Returns a map: targetId → { fieldKey → value }
 *
 * Uses the `in` operator for batch loading (1 request per table).
 */
export async function loadCustomFieldValues(
  tenantId: string,
  targetTable: string,
  targetIds: string[],
): Promise<Record<string, CustomFieldValuesMap>> {
  if (!targetIds.length) return {};

  // Chunk IDs to avoid overly long queries (max 50 per request)
  const CHUNK_SIZE = 50;
  const allValues: CustomFieldValue[] = [];

  for (let i = 0; i < targetIds.length; i += CHUNK_SIZE) {
    const chunk = targetIds.slice(i, i + CHUNK_SIZE);
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "custom_field_values",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "target_table", value: targetTable },
          { field: "target_id", value: chunk.join(","), operator: "in" },
        ],
        { combineType: "AND" },
      ),
    });
    allValues.push(...normalizeCrudList<CustomFieldValue>(res.data));
  }

  // We need definitions to map definition_id → field_key
  const definitions = await loadCustomFieldDefinitions(tenantId, targetTable);
  const defMap = new Map(definitions.map((d) => [d.id, d.field_key]));

  // Build the result map
  const result: Record<string, CustomFieldValuesMap> = {};
  for (const val of allValues) {
    const fieldKey = defMap.get(val.definition_id);
    if (!fieldKey) continue;

    if (!result[val.target_id]) {
      result[val.target_id] = {};
    }
    // For json fields, use value_json; otherwise use value
    result[val.target_id][fieldKey] =
      val.value_json != null
        ? JSON.stringify(val.value_json)
        : (val.value ?? "");
  }

  return result;
}

/**
 * Load custom field values for a single record.
 */
export async function loadCustomFieldValuesForRecord(
  tenantId: string,
  targetTable: string,
  targetId: string,
): Promise<CustomFieldValuesMap> {
  const map = await loadCustomFieldValues(tenantId, targetTable, [targetId]);
  return map[targetId] ?? {};
}

/**
 * Save custom field values for a single record.
 * Uses upsert pattern (create or update based on existing values).
 */
export async function saveCustomFieldValues(
  tenantId: string,
  targetTable: string,
  targetId: string,
  values: CustomFieldValuesMap,
  definitions: CustomFieldDefinition[],
): Promise<void> {
  if (!Object.keys(values).length) return;

  // Load existing values to determine create vs update
  const existingRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "custom_field_values",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "target_table", value: targetTable },
        { field: "target_id", value: targetId },
      ],
      { combineType: "AND" },
    ),
  });
  const existingValues = normalizeCrudList<CustomFieldValue>(existingRes.data);
  const existingMap = new Map(existingValues.map((v) => [v.definition_id, v]));

  // Map field_key → definition for lookups
  const defByKey = new Map(definitions.map((d) => [d.field_key, d]));

  const now = new Date().toISOString();

  // Process each field value
  const promises: Promise<unknown>[] = [];

  for (const [fieldKey, rawValue] of Object.entries(values)) {
    const definition = defByKey.get(fieldKey);
    if (!definition) continue;

    const isJsonField = definition.field_type === "json";
    const existing = existingMap.get(definition.id);

    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      definition_id: definition.id,
      target_table: targetTable,
      target_id: targetId,
      value: isJsonField ? null : rawValue || null,
      value_json: isJsonField ? (rawValue ? rawValue : null) : null,
      updated_at: now,
    };

    if (existing) {
      // Update existing value
      payload.id = existing.id;
      promises.push(
        api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "custom_field_values",
          payload,
        }),
      );
    } else {
      // Create new value
      payload.created_at = now;
      promises.push(
        api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "custom_field_values",
          payload,
        }),
      );
    }
  }

  // Execute all upserts in parallel
  await Promise.all(promises);
}

/* ------------------------------------------------------------------ */
/*  CrudScreen Integration — Definition → CrudFieldConfig converter    */
/* ------------------------------------------------------------------ */

/** Prefix for custom field keys in form state to avoid collisions with native fields */
export const CUSTOM_FIELD_PREFIX = "__cf_";

/**
 * Convert a custom field definition to a CrudFieldConfig compatible with CrudScreen.
 * The key is prefixed with `__cf_` to avoid collisions with native columns.
 */
export function definitionToCrudField(
  def: CustomFieldDefinition,
): CrudFieldConfig<any> {
  const prefixedKey = `${CUSTOM_FIELD_PREFIX}${def.field_key}`;

  const field: CrudFieldConfig<any> = {
    key: prefixedKey,
    label: def.label,
    placeholder: def.placeholder || def.label,
    type: (def.field_type || "text") as CrudFieldType,
    required: def.required,
    visibleInList: def.visible_in_list,
    visibleInForm: def.visible_in_form,
    readOnly: def.read_only,
    section: def.section || "Campos Personalizados",
    // Custom field validation
    validate: buildValidator(def),
  };

  // Select options
  if (def.field_type === "select" && def.options?.length) {
    field.options = def.options;
  }

  // Mask type
  if (def.field_type === "masked" && def.mask_type) {
    field.maskType = def.mask_type as MaskPreset;
  }

  // Reference config
  if (def.field_type === "reference" && def.reference_config) {
    field.referenceTable = def.reference_config.table;
    field.referenceLabelField = def.reference_config.labelField || "name";
    field.referenceIdField = def.reference_config.idField || "id";
    field.referenceSearchField = def.reference_config.searchField || "name";
  }

  // showWhen (v1: only between custom fields)
  if (def.show_when) {
    const condField = `${CUSTOM_FIELD_PREFIX}${def.show_when.field}`;
    const condValue = def.show_when.value;
    const condOperator = def.show_when.operator || "equal";

    field.showWhen = (formState: Record<string, string>) => {
      const currentValue = formState[condField] ?? "";
      switch (condOperator) {
        case "equal":
          return currentValue === condValue;
        case "not_equal":
          return currentValue !== condValue;
        case "not_empty":
          return currentValue.trim() !== "";
        case "empty":
          return currentValue.trim() === "";
        default:
          return true;
      }
    };
  }

  // Default value (for json template)
  if (def.field_type === "json" && def.default_value) {
    try {
      field.jsonTemplate = JSON.parse(def.default_value);
    } catch {
      // Invalid JSON template — ignore
    }
  }

  return field;
}

/**
 * Build a validator function from validation_rules JSONB.
 * Currently supports: regex, min, max, minLength, maxLength.
 */
function buildValidator(
  def: CustomFieldDefinition,
):
  | ((value: string, formState: Record<string, string>) => string | null)
  | undefined {
  const rules = def.validation_rules;
  if (!rules || !Object.keys(rules).length) return undefined;

  return (value: string) => {
    if (!value && !def.required) return null;

    const regex = rules.regex as string | undefined;
    if (regex) {
      try {
        if (!new RegExp(regex).test(value)) {
          return `${def.label} não atende ao formato esperado`;
        }
      } catch {
        // Invalid regex — skip validation
      }
    }

    const min = rules.min as number | undefined;
    if (min != null) {
      const num = parseFloat(value);
      if (!isNaN(num) && num < min) {
        return `${def.label} deve ser no mínimo ${min}`;
      }
    }

    const max = rules.max as number | undefined;
    if (max != null) {
      const num = parseFloat(value);
      if (!isNaN(num) && num > max) {
        return `${def.label} deve ser no máximo ${max}`;
      }
    }

    const minLength = rules.minLength as number | undefined;
    if (minLength != null && value.length < minLength) {
      return `${def.label} deve ter no mínimo ${minLength} caracteres`;
    }

    const maxLength = rules.maxLength as number | undefined;
    if (maxLength != null && value.length > maxLength) {
      return `${def.label} deve ter no máximo ${maxLength} caracteres`;
    }

    return null;
  };
}

/**
 * Convert an array of definitions to CrudFieldConfig[] for CrudScreen merge.
 * Only includes visible_in_form=true definitions.
 */
export function definitionsToCrudFields(
  definitions: CustomFieldDefinition[],
): CrudFieldConfig<any>[] {
  return definitions
    .filter((d) => !d.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(definitionToCrudField);
}

/**
 * Extract custom field values from form state.
 * Strips the `__cf_` prefix and returns only custom field entries.
 */
export function extractCustomFieldValues(
  formState: Record<string, string>,
): CustomFieldValuesMap {
  const result: CustomFieldValuesMap = {};
  for (const [key, value] of Object.entries(formState)) {
    if (key.startsWith(CUSTOM_FIELD_PREFIX)) {
      const fieldKey = key.slice(CUSTOM_FIELD_PREFIX.length);
      result[fieldKey] = value;
    }
  }
  return result;
}

/**
 * Merge custom field values into form state with prefixed keys.
 * Used when loading a record for editing.
 */
export function mergeCustomFieldValuesIntoFormState(
  formState: Record<string, string>,
  customValues: CustomFieldValuesMap,
): Record<string, string> {
  const merged = { ...formState };
  for (const [fieldKey, value] of Object.entries(customValues)) {
    merged[`${CUSTOM_FIELD_PREFIX}${fieldKey}`] = value;
  }
  return merged;
}

/**
 * Merge custom field values into item data for list display.
 * Used when rendering items in the CrudScreen list.
 */
export function mergeCustomFieldValuesIntoItem<
  T extends Record<string, unknown>,
>(item: T, customValues: CustomFieldValuesMap): T {
  const merged = { ...item };
  for (const [fieldKey, value] of Object.entries(customValues)) {
    (merged as any)[`${CUSTOM_FIELD_PREFIX}${fieldKey}`] = value;
  }
  return merged;
}
