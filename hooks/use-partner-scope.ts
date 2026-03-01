/**
 * usePartnerScope — resolves the current user's partner context.
 *
 * If the user has a partner_id on their profile, they are a "partner operator".
 * The hook returns their partnerId and the customer IDs scoped to that partner.
 *
 * For admin/tenant users (no partner_id), isPartnerUser is false and all
 * customers are accessible (no filtering needed at the hook level).
 *
 * Usage:
 *   const { partnerId, isPartnerUser, customerIds, loading } = usePartnerScope();
 *   // If isPartnerUser, filter data by partnerId or customerIds
 */

import { useAuth } from "@/core/auth/AuthContext";
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  type CrudFilter,
  normalizeCrudList,
} from "@/services/crud";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface PartnerScope {
  /** UUID of the partner this user belongs to (null if not a partner user) */
  partnerId: string | null;
  /** True when the current user is scoped to a specific partner */
  isPartnerUser: boolean;
  /** Customer IDs assigned to this partner (empty if not partner user) */
  customerIds: string[];
  /** Whether the partner is the tenant's own internal partner */
  isInternalPartner: boolean;
  /** Loading state */
  loading: boolean;
  /**
   * Ready-to-use CrudFilter array for tables that have a `partner_id` column.
   * Returns `[{ field: "partner_id", value: partnerId }]` for partner users,
   * or `[]` for admins (no filter needed — see all).
   *
   * Usage: `buildSearchParams([...otherFilters, ...partnerFilter], options)`
   */
  partnerFilter: CrudFilter[];
}

export function usePartnerScope(): PartnerScope {
  const { user } = useAuth();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [isInternalPartner, setIsInternalPartner] = useState(false);
  const [loading, setLoading] = useState(true);

  const userPartnerId_dep = (user as any)?.partner_id as string | undefined;
  const canViewAllPartners_dep = (user as any)?.can_view_all_partners === true;

  const resolve = useCallback(async () => {
    if (!user?.id) {
      setPartnerId(null);
      setCustomerIds([]);
      setIsInternalPartner(false);
      setLoading(false);
      return;
    }

    try {
      // 1. Check if user has a partner_id
      const userPartnerId = userPartnerId_dep;

      if (!userPartnerId || canViewAllPartners_dep) {
        // Not a partner user, OR has permission to view all partners — full access
        setPartnerId(null);
        setCustomerIds([]);
        setIsInternalPartner(false);
        setLoading(false);
        return;
      }

      setPartnerId(userPartnerId);

      // 2. Check if the partner is internal (self-partner)
      try {
        const partnerRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "partners",
          ...buildSearchParams([{ field: "id", value: userPartnerId }]),
        });
        const partners = normalizeCrudList<{
          id: string;
          is_internal?: boolean;
        }>(partnerRes.data);
        const partner = partners.find((p) => p.id === userPartnerId);
        setIsInternalPartner(Boolean(partner?.is_internal));
      } catch {
        setIsInternalPartner(false);
      }

      // 3. Fetch customer IDs assigned to this partner
      try {
        const customersRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "customers",
          ...buildSearchParams([{ field: "partner_id", value: userPartnerId }]),
        });
        const customers = normalizeCrudList<{
          id: string;
          deleted_at?: string;
        }>(customersRes.data);
        const ids = customers.filter((c) => !c.deleted_at).map((c) => c.id);
        setCustomerIds(ids);
      } catch {
        setCustomerIds([]);
      }
    } catch {
      setPartnerId(null);
      setCustomerIds([]);
      setIsInternalPartner(false);
    } finally {
      setLoading(false);
    }
  }, [user?.id, userPartnerId_dep, canViewAllPartners_dep]);

  useEffect(() => {
    setLoading(true);
    resolve();
  }, [resolve]);

  const partnerFilter: CrudFilter[] = useMemo(() => {
    if (!partnerId) return [];
    return [{ field: "partner_id", value: partnerId }];
  }, [partnerId]);

  return {
    partnerId,
    isPartnerUser: partnerId !== null,
    customerIds,
    isInternalPartner,
    loading,
    partnerFilter,
  };
}
