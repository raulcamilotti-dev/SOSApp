import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { getMembershipsByUser } from "@/services/companies";
import {  buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const normalizeList = <T,>(data: unknown): T[] => {
  const body = data as any;
  const list = Array.isArray(data)
    ? data
    : (body?.data ?? body?.value ?? body?.items ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

const normalizeBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["true", "1", "yes", "sim", "ativo"].includes(normalized);
};

const logImoveisDebug = (label: string, payload: unknown) => {
  if (!__DEV__) return;
  console.log(`[Imoveis][${label}]`, payload);
};

export default function ImoveisServicoScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const [loadingContext, setLoadingContext] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerCpf, setCustomerCpf] = useState<string | null>(null);
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [customerCpfs, setCustomerCpfs] = useState<string[]>([]);
  const [memberCompanyIds, setMemberCompanyIds] = useState<string[]>([]);

  const normalizeCpf = (value: unknown) =>
    String(value ?? "")
      .replace(/\D/g, "")
      .trim();

  const resolveContext = useCallback(async () => {
    if (!user?.id) {
      setCustomerId(null);
      setTenantId(null);
      setLoadingContext(false);
      return;
    }

    try {
      setLoadingContext(true);

      const userTenant = String(user.tenant_id ?? "").trim();
      if (userTenant) {
        setTenantId(userTenant);
      } else {
        const userTenantsRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "user_tenants",
          ...buildSearchParams([{ field: "user_id", value: String(user.id) }]),
        });
        const userTenants = normalizeList<Row>(userTenantsRes.data);
        const firstTenant = String(
          userTenants[0]?.tenant_id ?? userTenants[0]?.id_tenant ?? "",
        ).trim();
        setTenantId(firstTenant || null);
      }

      const customersRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "customers",
        ...buildSearchParams([{ field: "user_id", value: String(user.id) }]),
      });
      const customers = normalizeList<Row>(customersRes.data);

      const userCpf = normalizeCpf(user?.cpf);
      const userEmail = String(user?.email ?? "")
        .trim()
        .toLowerCase();

      const candidateCustomers = customers.filter((row) => {
        const rowUserId = String(row.user_id ?? "").trim();
        const rowCpf = normalizeCpf(row.cpf);
        const rowEmail = String(row.email ?? "")
          .trim()
          .toLowerCase();

        return (
          rowUserId === String(user.id) ||
          (!!userCpf && rowCpf === userCpf) ||
          (!!userEmail && rowEmail === userEmail)
        );
      });

      const ids = Array.from(
        new Set(
          candidateCustomers
            .map((row) => String(row.id ?? "").trim())
            .filter(Boolean),
        ),
      );

      const cpfs = Array.from(
        new Set(
          [
            userCpf,
            ...candidateCustomers.map((row) => normalizeCpf(row.cpf)),
          ].filter(Boolean),
        ),
      );

      const nextCustomerId = ids[0] ?? "";
      const nextCustomerCpf = cpfs[0] ?? "";

      setCustomerId(nextCustomerId || null);
      setCustomerCpf(nextCustomerCpf || null);
      setCustomerIds(ids);
      setCustomerCpfs(cpfs);

      /* Resolve company memberships for CNPJ-owned properties */
      try {
        if (userCpf) {
          const memberships = await getMembershipsByUser(
            userCpf,
            userTenant || undefined,
          );
          const companyIds: string[] = memberships
            .map((m) => String(m.company_id ?? "").trim())
            .filter((id): id is string => id.length > 0);
          setMemberCompanyIds(companyIds);
          logImoveisDebug("CompanyMemberships", {
            userCpf,
            membershipsFound: memberships.length,
            companyIds,
          });
        } else {
          setMemberCompanyIds([]);
        }
      } catch {
        setMemberCompanyIds([]);
      }

      logImoveisDebug("Context", {
        userId: user?.id ?? null,
        userCpf,
        userEmail: userEmail || null,
        tenantId: userTenant || null,
        resolvedTenantId: userTenant || null,
        customersFound: customers.length,
        candidateCustomers: candidateCustomers.length,
        candidateCustomerIds: ids,
        candidateCustomerCpfs: cpfs,
        matchedCustomerId: nextCustomerId || null,
        matchedCustomerCpf: nextCustomerCpf || null,
      });
    } finally {
      setLoadingContext(false);
    }
  }, [user?.cpf, user?.email, user?.id, user?.tenant_id]);

  useEffect(() => {
    resolveContext();
  }, [resolveContext]);

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      if (
        !customerIds.length &&
        !customerCpfs.length &&
        !memberCompanyIds.length
      )
        return [];

      const requestPayload = {
        action: "list",
        table: "properties",
        ...(customerIds.length === 1
          ? buildSearchParams([{ field: "customer_id", value: customerIds[0] }])
          : {}),
      };

      logImoveisDebug("Request", {
        endpoint: CRUD_ENDPOINT,
        payload: requestPayload,
        filters: {
          tenantId,
          customerId,
          customerCpf,
          customerIds,
          customerCpfs,
          memberCompanyIds,
        },
      });

      const response = await api.post(CRUD_ENDPOINT, requestPayload);

      const rows = normalizeList<Row>(response.data);
      const notDeletedRows = rows.filter((row) => !row.deleted_at);
      const tenantScopedRows = tenantId
        ? notDeletedRows.filter((row) => {
            const rowTenant = String(row.tenant_id ?? "").trim();
            if (!rowTenant) return true;
            return rowTenant === String(tenantId);
          })
        : notDeletedRows;

      const finalRows = tenantScopedRows.filter((row) => {
        /* Match by customer_id or CPF (existing PF logic) */
        const matchesCustomerId = customerIds.includes(
          String(row.customer_id ?? ""),
        );
        const matchesCustomerCpf = customerCpfs.includes(normalizeCpf(row.cpf));

        /* Match by company membership (PJ logic) */
        const ownerKind = String(row.owner_kind ?? "cpf").toLowerCase();
        const rowCompanyId = String(row.company_id ?? "").trim();
        const matchesCompany =
          ownerKind === "cnpj" &&
          !!rowCompanyId &&
          memberCompanyIds.includes(rowCompanyId);

        return matchesCustomerId || matchesCustomerCpf || matchesCompany;
      });

      logImoveisDebug("Result", {
        totalRows: rows.length,
        notDeletedRows: notDeletedRows.length,
        rowsWithoutTenant: notDeletedRows.filter(
          (row) => !String(row.tenant_id ?? "").trim(),
        ).length,
        tenantScopedRows: tenantScopedRows.length,
        customerIdMatches: tenantScopedRows.filter((row) =>
          customerIds.includes(String(row.customer_id ?? "")),
        ).length,
        customerCpfMatches: tenantScopedRows.filter((row) =>
          customerCpfs.includes(normalizeCpf(row.cpf)),
        ).length,
        companyMatches: tenantScopedRows.filter((row) => {
          const ok = String(row.owner_kind ?? "").toLowerCase();
          const cid = String(row.company_id ?? "").trim();
          return ok === "cnpj" && !!cid && memberCompanyIds.includes(cid);
        }).length,
        finalRows: finalRows.length,
        sample: finalRows.slice(0, 5).map((row) => ({
          id: row.id,
          tenant_id: row.tenant_id,
          customer_id: row.customer_id,
          cpf: row.cpf,
          owner_kind: row.owner_kind,
          company_id: row.company_id,
          address: row.address,
        })),
      });

      return finalRows;
    };
  }, [
    customerCpf,
    customerCpfs,
    customerId,
    customerIds,
    memberCompanyIds,
    tenantId,
  ]);

  const createItem = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      if (!customerId && !memberCompanyIds.length) {
        throw new Error("Cliente não identificado para criar imóvel.");
      }

      const nextPayload: Partial<Row> = {
        ...payload,
        customer_id: customerId ?? payload.customer_id,
        tenant_id: tenantId ?? payload.tenant_id,
        process_status: String(payload.process_status ?? "").trim() || "active",
      };

      [
        "has_registry",
        "has_contract",
        "part_of_larger_area",
        "owner_relative",
        "larger_area_registry",
      ].forEach((key) => {
        if (key in nextPayload) {
          nextPayload[key] = normalizeBoolean(nextPayload[key]);
        }
      });

      const response = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "properties",
        payload: nextPayload,
      });
      return response.data;
    };
  }, [customerId, memberCompanyIds.length, tenantId]);

  const updateItem = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      if (!customerId && !memberCompanyIds.length) {
        throw new Error("Cliente não identificado para atualizar imóvel.");
      }

      const nextPayload: Partial<Row> & { id?: string | null } = {
        ...payload,
        customer_id: customerId ?? payload.customer_id,
        tenant_id: tenantId ?? payload.tenant_id,
      };

      [
        "has_registry",
        "has_contract",
        "part_of_larger_area",
        "owner_relative",
        "larger_area_registry",
      ].forEach((key) => {
        if (key in nextPayload) {
          nextPayload[key] = normalizeBoolean(nextPayload[key]);
        }
      });

      const response = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "properties",
        payload: nextPayload,
      });
      return response.data;
    };
  }, [customerId, memberCompanyIds.length, tenantId]);

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "tenant_id",
      label: "Tenant",
      visibleInForm: false,
      visibleInList: false,
    },
    {
      key: "customer_id",
      label: "Cliente",
      visibleInForm: false,
      visibleInList: false,
    },
    { key: "address", label: "Endereço", required: true, visibleInList: true },
    { key: "number", label: "Número", visibleInList: true },
    { key: "complement", label: "Complemento", visibleInList: false },
    { key: "postal_code", label: "CEP", visibleInList: true },
    { key: "city", label: "Cidade", visibleInList: true },
    { key: "state", label: "Estado", visibleInList: true },
    { key: "property_value", label: "Valor do imóvel", visibleInList: true },
    { key: "indicacao", label: "Código promocional", visibleInList: false },
    {
      key: "has_registry",
      label: "Possui registro",
      type: "boolean",
      visibleInList: true,
    },
    {
      key: "has_contract",
      label: "Possui contrato",
      type: "boolean",
      visibleInList: true,
    },
    {
      key: "part_of_larger_area",
      label: "Parte de área maior",
      type: "boolean",
      visibleInList: false,
    },
    {
      key: "owner_relative",
      label: "Proprietário é parente",
      type: "boolean",
      visibleInList: false,
    },
    {
      key: "larger_area_registry",
      label: "Área maior registrada",
      type: "boolean",
      visibleInList: false,
    },
    { key: "city_rural", label: "Cidade rural", visibleInList: false },
    {
      key: "process_status",
      label: "Status do processo",
      type: "select",
      options: [
        { label: "Ativo", value: "active" },
        { label: "Concluído", value: "completed" },
        { label: "Em espera", value: "on_hold" },
        { label: "Cancelado", value: "cancelled" },
      ],
      visibleInList: true,
    },
    {
      key: "process_started_at",
      label: "Iniciado em",
      visibleInForm: false,
      visibleInList: false,
    },
    {
      key: "process_finished_at",
      label: "Finalizado em",
      visibleInForm: false,
      visibleInList: false,
    },
    {
      key: "template_id",
      label: "Template",
      visibleInForm: false,
      visibleInList: false,
    },
    {
      key: "current_step_id",
      label: "Etapa atual",
      visibleInForm: false,
      visibleInList: false,
    },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "updated_at", label: "Atualizado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  if (loadingContext) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando imóveis...</ThemedText>
      </ThemedView>
    );
  }

  if (!customerId && !memberCompanyIds.length) {
    return (
      <ThemedView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
        }}
      >
        <ThemedText>
          Não foi possível identificar o cliente vinculado ao login atual.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <CrudScreen<Row>
      title="Imóveis"
      subtitle="Gestão dos seus imóveis"
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const address = String(item.address ?? "").trim();
        const number = String(item.number ?? "").trim();
        if (address && number) return `${address}, ${number}`;
        return address || "Imóvel";
      }}
      getDetails={(item) => [
        { label: "Cidade", value: String(item.city ?? "-") },
        { label: "Estado", value: String(item.state ?? "-") },
        { label: "CEP", value: String(item.postal_code ?? "-") },
        { label: "Status", value: String(item.process_status ?? "-") },
      ]}
      renderItemActions={(item) => {
        const propertyId = String(item.id ?? "").trim();
        if (!propertyId) return null;

        return (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Servicos/Processo",
                  params: { propertyId },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                Ver processo
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}
