/**
 * CONTRATOS — Admin CrudScreen
 *
 * Gerencia contratos de serviço com SLA, renovação automática,
 * vínculo com ordens de serviço e assinatura digital.
 *
 * Status: draft → active → (expired | cancelled | renewed)
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    CONTRACT_STATUSES,
    CONTRACT_TYPES,
    formatContractCurrency,
    getContractStatusConfig,
    getContractTypeLabel,
    renewContract,
} from "@/services/contracts";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Alert, Platform, Text, TouchableOpacity, View } from "react-native";

type DetailItem = { label: string; value: string };
type Row = Record<string, unknown>;

export default function ContractsScreen() {
  const { user } = useAuth();
  const tintColor = useThemeColor({}, "tint");
  const tenantId = user?.tenant_id ?? "";
  const [refreshKey, setRefreshKey] = useState(0);

  /* ─── Fields ─── */

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "title",
      label: "Título do Contrato",
      placeholder: "Ex: Contrato de Prestação de Serviços",
      required: true,
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "customer_id",
      label: "Cliente",
      type: "reference",
      referenceTable: "customers",
      referenceLabelField: "name",
      referenceSearchField: "name",
      required: true,
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "contract_type",
      label: "Tipo",
      type: "select",
      options: CONTRACT_TYPES.map((t) => ({
        label: t.label,
        value: t.value,
      })),
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: CONTRACT_STATUSES.map((s) => ({
        label: s.label,
        value: s.value,
      })),
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "description",
      label: "Descrição",
      type: "multiline",
      placeholder: "Objeto do contrato...",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "total_value",
      label: "Valor Total (R$)",
      type: "currency",
      placeholder: "0,00",
      visibleInList: true,
      visibleInForm: true,
      section: "Valores",
    },
    {
      key: "monthly_value",
      label: "Valor Mensal (R$)",
      type: "currency",
      placeholder: "0,00",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "start_date",
      label: "Data Início",
      type: "date",
      visibleInList: true,
      visibleInForm: true,
      section: "Vigência",
    },
    {
      key: "end_date",
      label: "Data Fim",
      type: "date",
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "auto_renew",
      label: "Renovação Automática",
      type: "boolean",
      visibleInList: false,
      visibleInForm: true,
      section: "Renovação",
    },
    {
      key: "renewal_period_months",
      label: "Período de Renovação (meses)",
      type: "number",
      placeholder: "12",
      visibleInList: false,
      visibleInForm: true,
      showWhen: (state) =>
        state.auto_renew === "true" || state.auto_renew === "1",
    },
    {
      key: "renewal_alert_days",
      label: "Alerta de Renovação (dias antes)",
      type: "number",
      placeholder: "30",
      visibleInList: false,
      visibleInForm: true,
      showWhen: (state) =>
        state.auto_renew === "true" || state.auto_renew === "1",
    },
    {
      key: "sla_response_hours",
      label: "SLA Resposta (horas)",
      type: "number",
      placeholder: "24",
      visibleInList: false,
      visibleInForm: true,
      section: "SLA",
    },
    {
      key: "sla_resolution_hours",
      label: "SLA Resolução (horas)",
      type: "number",
      placeholder: "72",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "document_template_id",
      label: "Template de Documento",
      type: "reference",
      referenceTable: "document_templates",
      referenceLabelField: "name",
      referenceSearchField: "name",
      visibleInList: false,
      visibleInForm: true,
      section: "Documento",
    },
    {
      key: "terms",
      label: "Termos e Condições",
      type: "multiline",
      placeholder: "Cláusulas, condições gerais...",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "notes",
      label: "Observações Internas",
      type: "multiline",
      placeholder: "Notas internas...",
      visibleInList: false,
      visibleInForm: true,
    },
  ];

  /* ─── CRUD Handlers ─── */

  const loadItems = useCallback(async (): Promise<Row[]> => {
    if (!tenantId) return [];
    try {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "contracts",
        ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
          sortColumn: "created_at DESC",
        }),
      });
      return normalizeCrudList(res.data).filter(
        (r: Row) => !r.deleted_at,
      ) as Row[];
    } catch {
      // Table may not exist yet — return empty list gracefully
      return [];
    }
  }, [tenantId]);

  const createItem = useCallback(
    async (payload: Row) => {
      return api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "contracts",
        payload: {
          ...payload,
          tenant_id: tenantId,
          status: payload.status || "draft",
          contract_type: payload.contract_type || "prestacao_servico",
          created_by: user?.id || null,
        },
      });
    },
    [tenantId, user?.id],
  );

  const updateItem = useCallback(async (payload: Row) => {
    return api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "contracts",
      payload,
    });
  }, []);

  const deleteItem = useCallback(async (payload: Row) => {
    return api.post(CRUD_ENDPOINT, {
      action: "delete",
      table: "contracts",
      payload: {
        id: payload.id,
        deleted_at: new Date().toISOString(),
      },
    });
  }, []);

  /* ─── Renew handler ─── */

  const handleRenew = useCallback(async (contractId: string) => {
    const confirm = () =>
      new Promise<boolean>((resolve) => {
        if (Platform.OS === "web") {
          resolve(window.confirm("Renovar este contrato?"));
        } else {
          Alert.alert(
            "Renovar Contrato",
            "Isso criará um novo contrato com datas estendidas. Continuar?",
            [
              { text: "Cancelar", onPress: () => resolve(false) },
              { text: "Renovar", onPress: () => resolve(true) },
            ],
          );
        }
      });

    const ok = await confirm();
    if (!ok) return;

    try {
      await renewContract(contractId);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao renovar";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Erro", msg);
      }
    }
  }, []);

  /* ─── Details / Actions ─── */

  const getDetails = useCallback((item: Row): DetailItem[] => {
    const details: DetailItem[] = [];
    const statusCfg = getContractStatusConfig(
      (item.status as string as import("@/services/contracts").ContractStatus) ??
        "draft",
    );
    details.push({ label: "Status", value: statusCfg.label });
    details.push({
      label: "Tipo",
      value: getContractTypeLabel(
        (item.contract_type as string as import("@/services/contracts").ContractType) ??
          "outro",
      ),
    });

    if (item.total_value) {
      details.push({
        label: "Valor Total",
        value: formatContractCurrency(item.total_value as number),
      });
    }
    if (item.monthly_value) {
      details.push({
        label: "Valor Mensal",
        value: formatContractCurrency(item.monthly_value as number),
      });
    }
    if (item.start_date) {
      details.push({ label: "Início", value: String(item.start_date) });
    }
    if (item.end_date) {
      details.push({ label: "Fim", value: String(item.end_date) });
    }
    if (item.sla_response_hours) {
      details.push({
        label: "SLA Resposta",
        value: `${item.sla_response_hours}h`,
      });
    }
    if (item.sla_resolution_hours) {
      details.push({
        label: "SLA Resolução",
        value: `${item.sla_resolution_hours}h`,
      });
    }
    const autoRenew = item.auto_renew === true || item.auto_renew === "true";
    if (autoRenew) {
      details.push({
        label: "Renovação",
        value: `Auto — ${item.renewal_period_months || 12} meses`,
      });
    }
    if (item.notes) {
      details.push({ label: "Notas", value: String(item.notes) });
    }

    return details;
  }, []);

  const renderItemActions = useCallback(
    (item: Row) => {
      const statusStr = String(item.status ?? "draft");
      const statusCfg = getContractStatusConfig(
        statusStr as import("@/services/contracts").ContractStatus,
      );
      const typeLbl = getContractTypeLabel(
        String(
          item.contract_type ?? "outro",
        ) as import("@/services/contracts").ContractType,
      );
      const isActive = statusStr === "active";
      const canRenew = isActive || statusStr === "expired";

      return (
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Status badge */}
          <View
            style={{
              backgroundColor: statusCfg.color + "20",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Ionicons
              name={statusCfg.icon as keyof typeof Ionicons.glyphMap}
              size={12}
              color={statusCfg.color}
            />
            <Text
              style={{
                color: statusCfg.color,
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {statusCfg.label}
            </Text>
          </View>

          {/* Type badge */}
          <View
            style={{
              backgroundColor: tintColor + "15",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: tintColor, fontSize: 11, fontWeight: "600" }}>
              {typeLbl}
            </Text>
          </View>

          {/* Value */}
          {item.total_value ? (
            <View
              style={{
                backgroundColor: "#22c55e15",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
              }}
            >
              <Text
                style={{ color: "#22c55e", fontSize: 11, fontWeight: "600" }}
              >
                {formatContractCurrency(item.total_value as number)}
              </Text>
            </View>
          ) : null}

          {/* Renew button */}
          {canRenew ? (
            <TouchableOpacity
              onPress={() => handleRenew(String(item.id))}
              style={{
                backgroundColor: "#3b82f620",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Ionicons name="refresh-outline" size={14} color="#3b82f6" />
              <Text
                style={{ color: "#3b82f6", fontSize: 12, fontWeight: "600" }}
              >
                Renovar
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    },
    [tintColor, handleRenew],
  );

  return (
    <CrudScreen<Row>
      key={refreshKey}
      title="Contratos"
      subtitle="Gerencie contratos de serviço, SLA e renovações"
      searchPlaceholder="Buscar por título ou cliente..."
      searchFields={["title", "customer_id", "status"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getId={(item) => String(item.id)}
      getTitle={(item) => String(item.title ?? "Contrato")}
      getDetails={getDetails}
      renderItemActions={renderItemActions}
    />
  );
}
