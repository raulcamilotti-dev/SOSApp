import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { seedDefaultChartOfAccounts } from "@/services/chart-of-accounts";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { useCallback, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    Text,
    TouchableOpacity,
} from "react-native";

type Row = Record<string, unknown>;

const TABLE = "chart_of_accounts";

const TYPE_OPTIONS = [
  { label: "Receita", value: "revenue" },
  { label: "Custo", value: "cost" },
  { label: "Despesa", value: "expense" },
];

const LEVEL_OPTIONS = [
  { label: "1 — Grupo", value: "1" },
  { label: "2 — Subgrupo", value: "2" },
  { label: "3 — Conta (lançamento)", value: "3" },
];

export default function PlanoDeContasScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const [seeding, setSeeding] = useState(false);
  const controlRef = useRef<any>(null);
  const tintColor = useThemeColor({}, "tint");
  const onTintTextColor = useThemeColor({}, "background");

  const loadItems = useCallback(async () => {
    if (!tenantId) return [];
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE,
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        sortColumn: "display_order ASC, code ASC",
      }),
      auto_exclude_deleted: true,
    });
    return filterActive(normalizeCrudList<Row>(res.data));
  }, [tenantId]);

  const createItem = useCallback(
    async (payload: Partial<Row>) => {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: TABLE,
        payload: { ...payload, tenant_id: tenantId },
      });
      return res.data;
    },
    [tenantId],
  );

  const updateItem = useCallback(
    async (payload: Partial<Row> & { id?: string | null }) => {
      if (!payload.id) throw new Error("Id obrigatório para atualizar");
      const res = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: TABLE,
        payload,
      });
      return res.data;
    },
    [],
  );

  const deleteItem = useCallback(
    async (payload: Partial<Row> & { id?: string | null }) => {
      if (!payload.id) throw new Error("Id obrigatório para deletar");
      const res = await api.post(CRUD_ENDPOINT, {
        action: "delete",
        table: TABLE,
        payload: { id: payload.id },
      });
      return res.data;
    },
    [],
  );

  const handleSeedDefaults = useCallback(async () => {
    if (!tenantId) return;

    const doSeed = async () => {
      setSeeding(true);
      try {
        await seedDefaultChartOfAccounts(tenantId);
        controlRef.current?.reload();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Erro ao carregar plano padrão";
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Erro", msg);
        }
      } finally {
        setSeeding(false);
      }
    };

    if (Platform.OS === "web") {
      if (
        window.confirm(
          "Deseja carregar o plano de contas padrão? Contas existentes serão mantidas.",
        )
      ) {
        doSeed();
      }
    } else {
      Alert.alert(
        "Plano Padrão",
        "Deseja carregar o plano de contas padrão? Contas existentes serão mantidas.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Carregar", onPress: doSeed },
        ],
      );
    }
  }, [tenantId]);

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "code",
      label: "Código",
      type: "text",
      required: true,
      placeholder: "Ex: 1.1.01",
      section: "Identificação",
    },
    {
      key: "name",
      label: "Nome da Conta",
      type: "text",
      required: true,
      placeholder: "Ex: Honorários Advocatícios",
    },
    {
      key: "parent_id",
      label: "Conta Pai",
      type: "reference",
      referenceTable: "chart_of_accounts",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      referenceLabelFormatter: (
        item: Record<string, unknown>,
        _defaultLabel: string,
      ) => {
        const code = String(item.code ?? "");
        const name = String(item.name ?? "");
        return code ? `${code} — ${name}` : name;
      },
      referenceFilter: (item: Record<string, unknown>) => {
        // Only show non-leaf accounts as parents
        const isLeaf = item.is_leaf;
        return isLeaf !== true && isLeaf !== "true";
      },
    },
    {
      key: "type",
      label: "Tipo",
      type: "select",
      options: TYPE_OPTIONS,
      required: true,
      section: "Classificação",
    },
    {
      key: "level",
      label: "Nível",
      type: "select",
      options: LEVEL_OPTIONS,
      required: true,
    },
    {
      key: "is_leaf",
      label: "Conta de Lançamento",
      type: "boolean",
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
    },
    {
      key: "display_order",
      label: "Ordem de Exibição",
      type: "number",
      placeholder: "Ex: 10",
      section: "Configuração",
    },
    {
      key: "description",
      label: "Descrição",
      type: "multiline",
      placeholder: "Descrição opcional da conta",
    },
    {
      key: "is_system_default",
      label: "Padrão do Sistema",
      type: "boolean",
      readOnly: true,
      visibleInForm: true,
      visibleInList: false,
    },
  ];

  return (
    <CrudScreen<Row>
      controlRef={controlRef}
      title="Plano de Contas"
      subtitle="Classificação hierárquica para lançamentos financeiros"
      searchPlaceholder="Buscar por código ou nome..."
      searchFields={["code", "name", "type"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const code = String(item.code ?? "");
        const name = String(item.name ?? "");
        return code ? `${code} — ${name}` : name;
      }}
      getDetails={(item) => {
        const typeMap: Record<string, string> = {
          revenue: "Receita",
          cost: "Custo",
          expense: "Despesa",
        };
        const levelMap: Record<string, string> = {
          "1": "Grupo",
          "2": "Subgrupo",
          "3": "Conta",
        };
        return [
          { label: "Tipo", value: typeMap[String(item.type ?? "")] ?? "-" },
          {
            label: "Nível",
            value: levelMap[String(item.level ?? "")] ?? "-",
          },
          {
            label: "Lançamento",
            value: item.is_leaf ? "Sim" : "Não",
          },
          {
            label: "Ativo",
            value: item.is_active === false ? "Inativo" : "Ativo",
          },
        ];
      }}
      headerActions={
        <TouchableOpacity
          onPress={handleSeedDefaults}
          disabled={seeding}
          style={{
            backgroundColor: seeding ? "#94a3b8" : tintColor,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          {seeding ? <ActivityIndicator size="small" color="#fff" /> : null}
          <Text
            style={{ color: onTintTextColor, fontWeight: "600", fontSize: 13 }}
          >
            {seeding ? "Carregando..." : "Carregar Plano Padrão"}
          </Text>
        </TouchableOpacity>
      }
    />
  );
}
