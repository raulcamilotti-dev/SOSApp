import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity } from "react-native";

type Row = Record<string, unknown>;

const TABLE = "banks";

const listRowsForTenant = async (tenantId?: string | null): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE,
    ...buildSearchParams(filters, { sortColumn: "name ASC" }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: TABLE,
    payload,
  });
  return res.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: TABLE,
    payload,
  });
  return res.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para deletar");
  const res = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: TABLE,
    payload: { id: payload.id },
  });
  return res.data;
};

const fields: CrudFieldConfig<Row>[] = [
  {
    key: "name",
    label: "Nome do Banco",
    type: "text",
    required: true,
    placeholder: "Ex: Banco do Brasil, Nubank, Itaú",
  },
  {
    key: "bank_code",
    label: "Código COMPE",
    type: "text",
    placeholder: "Ex: 001, 260, 341",
    section: "Identificação",
  },
  {
    key: "ispb_code",
    label: "Código ISPB",
    type: "text",
    placeholder: "Ex: 00000000",
  },
  {
    key: "logo_url",
    label: "URL do Logo",
    type: "url",
    visibleInList: false,
  },
  {
    key: "is_active",
    label: "Ativo",
    type: "boolean",
  },
  {
    key: "notes",
    label: "Observações",
    type: "multiline",
    visibleInList: false,
  },
];

export default function BancosScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const loadItems = useMemo(
    () => () => listRowsForTenant(tenantId),
    [tenantId],
  );

  return (
    <CrudScreen<Row>
      title="Bancos"
      subtitle="Cadastro de bancos e instituições financeiras"
      searchPlaceholder="Buscar banco..."
      searchFields={["name", "bank_code"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createRow}
      updateItem={updateRow}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name ?? "Sem nome")}
      getDetails={(item) => [
        {
          label: "Código COMPE",
          value: String(item.bank_code ?? "-"),
        },
        {
          label: "ISPB",
          value: String(item.ispb_code ?? "-"),
        },
        {
          label: "Ativo",
          value: item.is_active === false ? "Inativo" : "Ativo",
        },
      ]}
      renderItemActions={(item) => (
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/Administrador/contas-bancarias?bankId=${String(item.id ?? "")}`,
            )
          }
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: tintColor + "15",
          }}
        >
          <ThemedText
            style={{ color: tintColor, fontWeight: "600", fontSize: 12 }}
          >
            Ver Contas →
          </ThemedText>
        </TouchableOpacity>
      )}
    />
  );
}
