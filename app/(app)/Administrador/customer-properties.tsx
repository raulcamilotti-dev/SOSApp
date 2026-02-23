import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { getMembershipsByUser } from "@/services/companies";
import {  buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";

/**
 * Admin screen: shows a customer's properties in the **client view** style,
 * with "Ver processo" action leading to the full timeline.
 *
 * Accepts URL params:
 *  - customerId  (customer row id)
 *  - customerCpf (customer CPF — fallback match)
 *  - tenantId    (optional tenant scope)
 *  - userId      (optional user id)
 *  - customerName (optional — display only)
 */

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

const normalizeCpf = (value: unknown) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .trim();

export default function CustomerPropertiesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    customerId?: string;
    customerCpf?: string;
    tenantId?: string;
    userId?: string;
    customerName?: string;
    companyId?: string;
  }>();

  const customerId = params.customerId ?? null;
  const customerCpf = params.customerCpf
    ? normalizeCpf(params.customerCpf)
    : null;
  const tenantId = params.tenantId ?? null;
  const customerName = params.customerName ?? null;
  const companyId = params.companyId ?? null;

  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const [loading, setLoading] = useState(true);
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [customerCpfs, setCustomerCpfs] = useState<string[]>([]);
  const [memberCompanyIds, setMemberCompanyIds] = useState<string[]>([]);
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | null>(
    null,
  );

  const resolveContext = useCallback(async () => {
    try {
      setLoading(true);

      const ids: string[] = [];
      const cpfs: string[] = [];

      if (customerId) ids.push(customerId);
      if (customerCpf) cpfs.push(customerCpf);

      // When we have a customerId, also fetch the customer's CPF for broader matching
      if (customerId) {
        try {
          const customersRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "customers",
            ...buildSearchParams([{ field: "id", value: customerId }]),
          });
          const customers = normalizeList<Row>(customersRes.data);
          const customer = customers.find(
            (c) => String(c.id ?? "") === customerId,
          );
          if (customer) {
            const cpf = normalizeCpf(customer.cpf);
            if (cpf && !cpfs.includes(cpf)) cpfs.push(cpf);
          }
        } catch {
          // ignore — we still have the customerId for matching
        }
      }

      setCustomerIds(ids);
      setCustomerCpfs(cpfs);
      setResolvedCustomerId(ids[0] ?? null);

      // Resolve company memberships for CNPJ-owned properties
      const effectiveCpf = cpfs[0] ?? null;
      const resolvedCompanyIds: string[] = [];
      if (companyId) resolvedCompanyIds.push(companyId);
      if (effectiveCpf) {
        try {
          const memberships = await getMembershipsByUser(
            effectiveCpf,
            tenantId || undefined,
          );
          memberships.forEach((m) => {
            const cId = String(m.company_id ?? "").trim();
            if (cId && !resolvedCompanyIds.includes(cId))
              resolvedCompanyIds.push(cId);
          });
        } catch {
          // ignore
        }
      }
      setMemberCompanyIds(resolvedCompanyIds);
    } finally {
      setLoading(false);
    }
  }, [customerId, customerCpf, tenantId, companyId]);

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

      const response = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "properties",
        ...buildSearchParams([], { sortColumn: "created_at" }),
      });

      const rows = normalizeList<Row>(response.data);
      const notDeletedRows = rows.filter((row) => !row.deleted_at);

      const tenantScopedRows = tenantId
        ? notDeletedRows.filter((row) => {
            const rowTenant = String(row.tenant_id ?? "").trim();
            if (!rowTenant) return true;
            return rowTenant === String(tenantId);
          })
        : notDeletedRows;

      return tenantScopedRows.filter((row) => {
        const matchesCustomerId = customerIds.includes(
          String(row.customer_id ?? ""),
        );
        const matchesCustomerCpf = customerCpfs.includes(normalizeCpf(row.cpf));
        const ownerKind = String(row.owner_kind ?? "cpf").toLowerCase();
        const rowCompanyId = String(row.company_id ?? "").trim();
        const matchesCompany =
          ownerKind === "cnpj" &&
          !!rowCompanyId &&
          memberCompanyIds.includes(rowCompanyId);

        return matchesCustomerId || matchesCustomerCpf || matchesCompany;
      });
    };
  }, [customerCpfs, customerIds, memberCompanyIds, tenantId]);

  const createItem = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      if (!resolvedCustomerId && !memberCompanyIds.length) {
        throw new Error("Cliente não identificado para criar imóvel.");
      }

      const nextPayload: Partial<Row> = {
        ...payload,
        customer_id: resolvedCustomerId ?? payload.customer_id,
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
  }, [resolvedCustomerId, memberCompanyIds.length, tenantId]);

  const updateItem = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      if (!resolvedCustomerId && !memberCompanyIds.length) {
        throw new Error("Cliente não identificado para atualizar imóvel.");
      }

      const nextPayload: Partial<Row> & { id?: string | null } = {
        ...payload,
        customer_id: resolvedCustomerId ?? payload.customer_id,
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
  }, [resolvedCustomerId, memberCompanyIds.length, tenantId]);

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

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando imóveis...</ThemedText>
      </ThemedView>
    );
  }

  if (!customerIds.length && !memberCompanyIds.length) {
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
          Nenhum cliente identificado. Verifique os parâmetros de navegação.
        </ThemedText>
      </ThemedView>
    );
  }

  const subtitle = customerName
    ? `Imóveis de ${customerName}`
    : "Imóveis do cliente";

  return (
    <CrudScreen<Row>
      title="Imóveis"
      subtitle={subtitle}
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
