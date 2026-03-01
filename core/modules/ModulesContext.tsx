/**
 * ModulesContext — Provides enabled modules for the current tenant.
 *
 * Fetches tenant_modules from backend on mount and when tenant changes.
 * Exposes `isModuleEnabled(key)` to check if a module is active.
 *
 * Usage:
 * ```tsx
 * const { isModuleEnabled } = useTenantModules();
 * if (isModuleEnabled("partners")) { ... }
 * ```
 */

import { useAuth } from "@/core/auth/AuthContext";
import { MODULE_KEYS, type ModuleKey } from "@/core/modules/module-config";
import { api } from "@/services/api";
import { CRUD_ENDPOINT, normalizeCrudList } from "@/services/crud";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TenantModuleRow {
  id: string;
  tenant_id: string;
  module_key: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ModulesContextType {
  /** Set of currently enabled module keys */
  enabledModules: Set<ModuleKey>;
  /** Check if a specific module is enabled for the current tenant */
  isModuleEnabled: (key: ModuleKey) => boolean;
  /** Whether module data is still loading */
  loading: boolean;
  /** Reload modules from server */
  refresh: () => Promise<void>;
}

const ModulesContext = createContext<ModulesContextType>(undefined!);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [enabledModules, setEnabledModules] = useState(
    () => new Set<ModuleKey>([MODULE_KEYS.CORE]),
  );
  const [loading, setLoading] = useState(true);

  const fetchModules = useCallback(async () => {
    if (!tenantId) {
      // No tenant selected — only core enabled
      setEnabledModules(new Set([MODULE_KEYS.CORE]));
      setLoading(false);
      return;
    }

    try {
      const response = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenant_modules",
        search_field1: "tenant_id",
        search_value1: tenantId,
        search_operator1: "equal",
        search_field2: "enabled",
        search_value2: "true",
        search_operator2: "equal",
        combine_type: "AND",
      });

      const rows = normalizeCrudList<TenantModuleRow>(response.data);
      const keys = new Set<ModuleKey>([MODULE_KEYS.CORE]);

      for (const row of rows) {
        if (row.enabled) {
          keys.add(row.module_key as ModuleKey);
        }
      }

      setEnabledModules(keys);
    } catch (error) {
      console.error("Failed to load tenant modules:", error);
      // On error, fail-closed: only core module enabled (security-safe default)
      setEnabledModules(new Set<ModuleKey>([MODULE_KEYS.CORE]));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    fetchModules();
  }, [fetchModules]);

  const isModuleEnabled = useCallback(
    (key: ModuleKey) => {
      // Core is always enabled
      if (key === MODULE_KEYS.CORE) return true;
      return enabledModules.has(key);
    },
    [enabledModules],
  );

  const value = useMemo<ModulesContextType>(
    () => ({
      enabledModules,
      isModuleEnabled,
      loading,
      refresh: fetchModules,
    }),
    [enabledModules, isModuleEnabled, loading, fetchModules],
  );

  return (
    <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useTenantModules(): ModulesContextType {
  const context = useContext(ModulesContext);
  if (!context) {
    throw new Error("useTenantModules must be used within a ModulesProvider");
  }
  return context;
}
