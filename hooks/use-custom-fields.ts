/**
 * useCustomFields — Hook for CrudScreen integration with custom fields.
 *
 * Loads custom field definitions for a given table name,
 * converts them to CrudFieldConfig[], and provides helpers
 * for loading/saving custom field values.
 *
 * Usage in CrudScreen:
 *   const { customFields, loadValues, saveValues, mergeIntoItem } = useCustomFields("customers");
 *   // Append customFields to fields array
 *   // Call loadValues after loading items
 *   // Call saveValues after saving native fields
 *
 * @see services/custom-fields.ts
 */

import type { CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import {
    type CustomFieldDefinition,
    type CustomFieldValuesMap,
    definitionsToCrudFields,
    extractCustomFieldValues,
    isCustomFieldsEnabled,
    loadCustomFieldDefinitions,
    loadCustomFieldValues,
    loadCustomFieldValuesForRecord,
    mergeCustomFieldValuesIntoFormState,
    mergeCustomFieldValuesIntoItem,
    saveCustomFieldValues,
} from "@/services/custom-fields";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface UseCustomFieldsResult {
  /** Whether this table supports custom fields */
  enabled: boolean;
  /** Whether definitions are still loading */
  loading: boolean;
  /** Custom field definitions (raw) */
  definitions: CustomFieldDefinition[];
  /** CrudFieldConfig[] ready to append to CrudScreen fields */
  customFields: CrudFieldConfig<any>[];
  /**
   * Load custom field values for a batch of record IDs.
   * Returns map: recordId → { fieldKey → value }
   */
  loadValues: (
    targetIds: string[],
  ) => Promise<Record<string, CustomFieldValuesMap>>;
  /**
   * Load custom field values for a single record.
   */
  loadValuesForRecord: (targetId: string) => Promise<CustomFieldValuesMap>;
  /**
   * Save custom field values for a single record.
   * Extracts __cf_ prefixed keys from formState automatically.
   */
  saveValues: (
    targetId: string,
    formState: Record<string, string>,
  ) => Promise<void>;
  /**
   * Merge custom field values into an item's data for list display.
   */
  mergeIntoItem: <T extends Record<string, unknown>>(
    item: T,
    customValues: CustomFieldValuesMap,
  ) => T;
  /**
   * Merge custom field values into form state (prefixed keys).
   */
  mergeIntoFormState: (
    formState: Record<string, string>,
    customValues: CustomFieldValuesMap,
  ) => Record<string, string>;
  /**
   * Extract custom field values from form state (strips prefix).
   */
  extractFromFormState: (
    formState: Record<string, string>,
  ) => CustomFieldValuesMap;
  /**
   * Force reload definitions (e.g. after admin changes).
   */
  reloadDefinitions: () => void;
}

export function useCustomFields(tableName?: string): UseCustomFieldsResult {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const enabled = useMemo(
    () => Boolean(tableName && isCustomFieldsEnabled(tableName)),
    [tableName],
  );

  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  // Load definitions when table or tenant changes
  const loadDefinitions = useCallback(async () => {
    if (!enabled || !tenantId || !tableName) {
      setDefinitions([]);
      return;
    }

    try {
      setLoading(true);
      const defs = await loadCustomFieldDefinitions(tenantId, tableName);
      setDefinitions(defs);
    } catch (err) {
      if (__DEV__) {
        console.warn("[useCustomFields] Failed to load definitions:", err);
      }
      setDefinitions([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, tenantId, tableName]);

  useEffect(() => {
    loadDefinitions();
  }, [loadDefinitions]);

  // Convert definitions to CrudFieldConfig[]
  const customFields = useMemo(
    () => (enabled ? definitionsToCrudFields(definitions) : []),
    [definitions, enabled],
  );

  // Load values for a batch of records
  const loadValues = useCallback(
    async (
      targetIds: string[],
    ): Promise<Record<string, CustomFieldValuesMap>> => {
      if (!enabled || !tenantId || !tableName || !targetIds.length) {
        return {};
      }
      return loadCustomFieldValues(tenantId, tableName, targetIds);
    },
    [enabled, tenantId, tableName],
  );

  // Load values for a single record
  const loadValuesForRecord = useCallback(
    async (targetId: string): Promise<CustomFieldValuesMap> => {
      if (!enabled || !tenantId || !tableName) return {};
      return loadCustomFieldValuesForRecord(tenantId, tableName, targetId);
    },
    [enabled, tenantId, tableName],
  );

  // Save values for a single record
  const saveValuesCallback = useCallback(
    async (targetId: string, formState: Record<string, string>) => {
      if (!enabled || !tenantId || !tableName) return;
      const values = extractCustomFieldValues(formState);
      if (!Object.keys(values).length) return;
      await saveCustomFieldValues(
        tenantId,
        tableName,
        targetId,
        values,
        definitions,
      );
    },
    [enabled, tenantId, tableName, definitions],
  );

  // Merge helpers (static — no tenant/table dependency)
  const mergeIntoItem = useCallback(
    <T extends Record<string, unknown>>(
      item: T,
      customValues: CustomFieldValuesMap,
    ): T => mergeCustomFieldValuesIntoItem(item, customValues),
    [],
  );

  const mergeIntoFormState = useCallback(
    (
      formState: Record<string, string>,
      customValues: CustomFieldValuesMap,
    ): Record<string, string> =>
      mergeCustomFieldValuesIntoFormState(formState, customValues),
    [],
  );

  const extractFromFormState = useCallback(
    (formState: Record<string, string>): CustomFieldValuesMap =>
      extractCustomFieldValues(formState),
    [],
  );

  return {
    enabled,
    loading,
    definitions,
    customFields,
    loadValues,
    loadValuesForRecord,
    saveValues: saveValuesCallback,
    mergeIntoItem,
    mergeIntoFormState,
    extractFromFormState,
    reloadDefinitions: loadDefinitions,
  };
}
