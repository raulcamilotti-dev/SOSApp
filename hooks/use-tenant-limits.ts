/**
 * useTenantLimits Hook
 *
 * Provides real-time tenant limit info (active clients, user count).
 * Plans are based on ACTIVE client count (interaction in last 90 days).
 * Free plan also limits users to 3; paid plans have unlimited users.
 *
 * Usage:
 *   const { limits, loading, canAddUser, canAddClient, refresh } = useTenantLimits();
 *
 *   if (!canAddClient) {
 *     // Show upgrade prompt (active client limit)
 *   }
 *   if (!canAddUser) {
 *     // Show upgrade prompt (user limit — Free plan only)
 *   }
 */

import { useAuth } from "@/core/auth/AuthContext";
import { getTenantLimits, type TenantLimits } from "@/services/saas-billing";
import { useCallback, useEffect, useState } from "react";

export interface UseTenantLimitsResult {
  /** Full limit details */
  limits: TenantLimits | null;
  /** Loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether the tenant can add another user (Free: max 3, Paid: unlimited) */
  canAddUser: boolean;
  /** Whether the tenant can add another active client */
  canAddClient: boolean;
  /** Whether the tenant is near the active client limit (>=80%) */
  isNearLimit: boolean;
  /** Whether the tenant has hit the active client limit */
  isAtLimit: boolean;
  /** Whether the tenant is near the user limit (Free plan only) */
  isUserNearLimit: boolean;
  /** Whether the tenant has hit the user limit (Free plan only) */
  isUserAtLimit: boolean;
  /** Refresh limits from server */
  refresh: () => Promise<void>;
}

export function useTenantLimits(): UseTenantLimitsResult {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const [limits, setLimits] = useState<TenantLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLimits = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const result = await getTenantLimits(tenantId);
      setLimits(result);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao carregar limites";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadLimits();
  }, [loadLimits]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await loadLimits();
  }, [loadLimits]);

  return {
    limits,
    loading,
    error,
    canAddUser: limits ? !limits.isUserAtLimit : true,
    canAddClient: limits ? !limits.isAtLimit : true,
    isNearLimit: limits?.isNearLimit ?? false,
    isAtLimit: limits?.isAtLimit ?? false,
    isUserNearLimit: limits?.isUserNearLimit ?? false,
    isUserAtLimit: limits?.isUserAtLimit ?? false,
    refresh,
  };
}
