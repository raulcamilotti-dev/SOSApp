import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    CRUD_ENDPOINT,
    buildSearchParams,
    normalizeCrudList,
} from "@/services/crud";
import { buildQuoteUrl } from "@/services/quotes";
import { Ionicons } from "@expo/vector-icons";
import * as ExpoClipboard from "expo-clipboard";
import { useCallback, useMemo, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";

type Row = Record<string, unknown>;

const loadItemsForTenant = async (tenantId?: string | null): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "quotes",
    ...buildSearchParams(filters, { sortColumn: "created_at DESC" }),
  });
  return filterActive(normalizeCrudList<Row>(res.data));
};

const createItemBase = async (
  payload: Partial<Row>,
  tenantId?: string | null,
): Promise<unknown> => {
  if (tenantId) payload.tenant_id = tenantId;

  // Auto-calculate total from subtotal - discount
  const subtotal = Number(payload.subtotal ?? 0);
  const discount = Number(payload.discount ?? 0);
  payload.total = Math.round((subtotal - discount) * 100) / 100;

  // Auto-generate token if not provided
  if (!payload.token) {
    const uuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `q-${Date.now()}`;
    payload.token = uuid;
  }

  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "quotes",
    payload,
  });
  return res.data;
};

const updateItemBase = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  // Auto-calculate total
  const subtotal = Number(payload.subtotal ?? 0);
  const discount = Number(payload.discount ?? 0);
  payload.total = Math.round((subtotal - discount) * 100) / 100;

  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "quotes",
    payload,
  });
  return res.data;
};

const copyToClipboard = async (text: string): Promise<boolean> => {
  if (Platform.OS === "web" && navigator?.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await ExpoClipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  viewed: "Visualizado",
  approved: "Aprovado",
  rejected: "Rejeitado",
  expired: "Expirado",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280",
  sent: "#2563eb",
  viewed: "#8b5cf6",
  approved: "#16a34a",
  rejected: "#dc2626",
  expired: "#d97706",
};

const formatCurrency = (value: unknown): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatDate = (value: unknown): string => {
  if (!value) return "-";
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
};

const fields: CrudFieldConfig<Row>[] = [
  {
    key: "tenant_id",
    label: "Tenant",
    type: "reference",
    referenceTable: "tenants",
    referenceLabelField: "company_name",
    referenceSearchField: "company_name",
    required: true,
    visibleInForm: false,
  },
  {
    key: "service_order_id",
    label: "Ordem de Serviço",
    type: "reference",
    referenceTable: "service_orders",
    referenceLabelField: "title",
    referenceSearchField: "title",
    required: true,
    section: "Referências",
  },
  {
    key: "workflow_step_id",
    label: "Etapa do Workflow",
    type: "reference",
    referenceTable: "workflow_steps",
    referenceLabelField: "name",
    referenceSearchField: "name",
  },
  {
    key: "created_by",
    label: "Criado por",
    type: "reference",
    referenceTable: "users",
    referenceLabelField: "fullname",
    referenceSearchField: "fullname",
    readOnly: true,
  },
  {
    key: "title",
    label: "Título",
    placeholder: "Ex: Orçamento Serviço X",
    required: true,
    visibleInList: true,
    section: "Dados do Orçamento",
  },
  {
    key: "description",
    label: "Descrição",
    type: "multiline",
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { label: "Rascunho", value: "draft" },
      { label: "Enviado", value: "sent" },
      { label: "Visualizado", value: "viewed" },
      { label: "Aprovado", value: "approved" },
      { label: "Rejeitado", value: "rejected" },
      { label: "Expirado", value: "expired" },
    ],
    required: true,
    visibleInList: true,
  },
  {
    key: "subtotal",
    label: "Subtotal",
    type: "currency",
    section: "Valores",
  },
  {
    key: "discount",
    label: "Desconto",
    type: "currency",
  },
  {
    key: "total",
    label: "Total",
    type: "currency",
    visibleInList: true,
    readOnly: true,
  },
  {
    key: "valid_until",
    label: "Válido até",
    type: "date",
    section: "Datas",
  },
  {
    key: "approved_at",
    label: "Aprovado em",
    type: "datetime",
    readOnly: true,
    showWhen: (state) => state.status === "approved",
  },
  {
    key: "rejected_at",
    label: "Rejeitado em",
    type: "datetime",
    readOnly: true,
    showWhen: (state) => state.status === "rejected",
  },
  {
    key: "rejection_reason",
    label: "Motivo da Rejeição",
    type: "multiline",
    readOnly: true,
    showWhen: (state) => state.status === "rejected",
  },
  {
    key: "option_label",
    label: "Opção (Pacote)",
    placeholder: "Ex: Básico, Premium",
    section: "Multi-Opção",
    showWhen: (state) => !!state.quote_group_id,
  },
  {
    key: "quote_group_id",
    label: "Grupo de Opções",
    readOnly: true,
  },
  {
    key: "is_selected_option",
    label: "Opção Selecionada",
    type: "boolean",
    readOnly: true,
    showWhen: (state) => !!state.quote_group_id,
  },
  {
    key: "notes",
    label: "Observações",
    type: "multiline",
    section: "Observações",
  },
  {
    key: "token",
    label: "Token (link público)",
    readOnly: true,
    visibleInForm: false,
  },
  {
    key: "pdf_url",
    label: "URL do PDF",
    type: "url",
    section: "Anexos",
  },
];

export default function OrcamentosScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const tintColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({}, "muted");

  const loadItems = useMemo(
    () => () => loadItemsForTenant(tenantId),
    [tenantId],
  );

  const createItem = useCallback(
    (payload: Partial<Row>) => createItemBase(payload, tenantId),
    [tenantId],
  );

  const updateItem = useCallback(
    (payload: Partial<Row> & { id?: string | null }) => updateItemBase(payload),
    [],
  );

  const handleCopyLink = useCallback(async (token: string, itemId: string) => {
    const url = buildQuoteUrl(token);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedId(itemId);
      setTimeout(() => setCopiedId(null), 3000);
    }
  }, []);

  const handleShareWhatsApp = useCallback((token: string, title: string) => {
    const url = buildQuoteUrl(token);
    const text = encodeURIComponent(
      `Olá! Segue seu orçamento "${title}":\n${url}`,
    );
    const waUrl = `https://wa.me/?text=${text}`;
    if (Platform.OS === "web") {
      window.open(waUrl, "_blank");
    } else {
      Linking.openURL(waUrl);
    }
  }, []);

  return (
    <CrudScreen<Row>
      title="Orçamentos"
      subtitle="Gerencie orçamentos enviados e acompanhe aprovações"
      searchPlaceholder="Buscar por título, status..."
      searchFields={["title", "description", "status", "option_label"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const title = String(item.title ?? "Orçamento");
        const total = formatCurrency(item.total);
        return `${title} — ${total}`;
      }}
      getDetails={(item) => {
        const status = String(item.status ?? "draft");
        const details = [
          {
            label: "Status",
            value: STATUS_LABELS[status] ?? status,
          },
          {
            label: "Total",
            value: formatCurrency(item.total),
          },
          {
            label: "Válido até",
            value: formatDate(item.valid_until),
          },
          {
            label: "Criado em",
            value: formatDate(item.created_at),
          },
        ];

        if (item.rejection_reason && status === "rejected") {
          details.push({
            label: "Motivo rejeição",
            value: String(item.rejection_reason),
          });
        }

        if (item.option_label) {
          details.push({
            label: "Pacote",
            value: String(item.option_label),
          });
        }

        return details;
      }}
      renderItemActions={(item) => {
        const token = String(item.token ?? "");
        const id = String(item.id ?? "");
        const title = String(item.title ?? "Orçamento");
        const status = String(item.status ?? "draft");
        const isCopied = copiedId === id;
        const statusColor = STATUS_COLORS[status] ?? mutedColor;

        return (
          <View style={{ gap: 8, marginTop: 8 }}>
            {/* Status badge */}
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: statusColor + "1A",
                borderRadius: 6,
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderWidth: 1,
                borderColor: statusColor + "33",
              }}
            >
              <Text
                style={{
                  color: statusColor,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {STATUS_LABELS[status] ?? status}
              </Text>
            </View>

            {/* Action buttons */}
            {token ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => handleCopyLink(token, id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: isCopied ? "#16a34a" : tintColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Ionicons
                    name={isCopied ? "checkmark" : "link-outline"}
                    size={14}
                    color="#fff"
                  />
                  <Text
                    style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}
                  >
                    {isCopied ? "Copiado!" : "Copiar Link"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleShareWhatsApp(token, title)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: "#25D366",
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={14} color="#fff" />
                  <Text
                    style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}
                  >
                    WhatsApp
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      }}
    />
  );
}
