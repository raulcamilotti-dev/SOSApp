/**
 * FORMULÁRIOS DE CAPTAÇÃO — Admin CrudScreen
 *
 * Gerencia formulários públicos de captação de leads.
 * Cada formulário gera uma URL pública (/f/:slug) que pode ser compartilhada.
 * Submissões criam leads automaticamente no CRM com source="formulario".
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    buildFormUrl,
    buildFormWhatsAppUrl,
    DEFAULT_FORM_FIELDS,
    generateFormSlug,
} from "@/services/lead-forms";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useState } from "react";
import {
    Platform,
    Text,
    ToastAndroid,
    TouchableOpacity,
    View
} from "react-native";

type DetailItem = { label: string; value: string };
type Row = Record<string, unknown>;

export default function LeadFormsScreen() {
  const { user } = useAuth();
  const tintColor = useThemeColor({}, "tint");
  const tenantId = user?.tenant_id ?? "";
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* ─── Fields ─── */

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "title",
      label: "Título do Formulário",
      placeholder: "Ex: Solicite um Orçamento",
      required: true,
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "description",
      label: "Descrição",
      type: "multiline",
      placeholder: "Texto introdutório exibido acima dos campos",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "slug",
      label: "Endereço (slug)",
      placeholder: "solicite-orcamento",
      visibleInList: false,
      visibleInForm: true,
      section: "Configuração",
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "default_priority",
      label: "Prioridade Padrão",
      type: "select",
      options: [
        { label: "Baixa", value: "baixa" },
        { label: "Média", value: "media" },
        { label: "Alta", value: "alta" },
        { label: "Urgente", value: "urgente" },
      ],
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "campaign_id",
      label: "Campanha Vinculada",
      type: "reference",
      referenceTable: "campaigns",
      referenceLabelField: "name",
      referenceSearchField: "name",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "interested_service_type_id",
      label: "Tipo de Serviço",
      type: "reference",
      referenceTable: "service_types",
      referenceLabelField: "name",
      referenceSearchField: "name",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "assigned_to",
      label: "Atribuir Leads Para",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "name",
      referenceSearchField: "name",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "success_message",
      label: "Mensagem de Sucesso",
      placeholder: "Obrigado! Entraremos em contato em breve.",
      visibleInList: false,
      visibleInForm: true,
      section: "Aparência",
    },
    {
      key: "button_label",
      label: "Texto do Botão",
      placeholder: "Enviar",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "primary_color",
      label: "Cor Principal",
      placeholder: "#2563eb",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "submissions_count",
      label: "Submissões",
      type: "number",
      readOnly: true,
      visibleInList: true,
      visibleInForm: false,
    },
  ];

  /* ─── CRUD Handlers ─── */

  const loadItems = useCallback(async (): Promise<Row[]> => {
    if (!tenantId) return [];
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "lead_forms",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        sortColumn: "created_at DESC",
      }),
    });
    return normalizeCrudList(res.data).filter(
      (r: Row) => !r.deleted_at,
    ) as Row[];
  }, [tenantId]);

  const createItem = useCallback(
    async (payload: Row) => {
      const slug =
        String(payload.slug ?? "").trim() ||
        generateFormSlug(String(payload.title ?? "formulario"));

      // Set default fields JSON if not present
      const fieldsJson = JSON.stringify(DEFAULT_FORM_FIELDS);

      return api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "lead_forms",
        payload: {
          ...payload,
          tenant_id: tenantId,
          slug,
          fields: fieldsJson,
          default_source: "formulario",
        },
      });
    },
    [tenantId],
  );

  const updateItem = useCallback(async (payload: Row) => {
    const updates: Record<string, unknown> = { ...payload };
    // If slug changed, re-slug it
    if (payload.slug && typeof payload.slug === "string") {
      updates.slug = generateFormSlug(payload.slug);
    }
    return api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "lead_forms",
      payload: updates,
    });
  }, []);

  const deleteItem = useCallback(async (payload: Row) => {
    return api.post(CRUD_ENDPOINT, {
      action: "delete",
      table: "lead_forms",
      payload: {
        id: payload.id,
        deleted_at: new Date().toISOString(),
      },
    });
  }, []);

  /* ─── Copy URL helper ─── */

  const copyUrl = useCallback(async (slug: string, formId: string) => {
    const url = buildFormUrl(slug);
    if (Platform.OS === "web") {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // fallback
      }
    } else {
      await Clipboard.setStringAsync(url);
    }
    setCopiedId(formId);
    if (Platform.OS === "android") {
      ToastAndroid.show("Link copiado!", ToastAndroid.SHORT);
    }
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  /* ─── Detail / Actions ─── */

  const getDetails = useCallback((item: Row): DetailItem[] => {
    const details: DetailItem[] = [];
    const slug = String(item.slug ?? "");
    if (slug) {
      details.push({ label: "URL", value: buildFormUrl(slug) });
    }
    const subs = Number(item.submissions_count ?? 0);
    details.push({ label: "Submissões", value: String(subs) });

    const active = item.is_active;
    details.push({
      label: "Status",
      value: active === true || active === "true" ? "Ativo" : "Inativo",
    });

    if (item.primary_color) {
      details.push({ label: "Cor", value: String(item.primary_color) });
    }
    return details;
  }, []);

  const renderItemActions = useCallback(
    (item: Row) => {
      const slug = String(item.slug ?? "");
      const formId = String(item.id ?? "");
      const active = item.is_active === true || item.is_active === "true";
      const subs = Number(item.submissions_count ?? 0);
      const isCopied = copiedId === formId;

      return (
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Active/Inactive badge */}
          <View
            style={{
              backgroundColor: active ? "#22c55e20" : "#94a3b820",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: active ? "#22c55e" : "#94a3b8",
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {active ? "Ativo" : "Inativo"}
            </Text>
          </View>

          {/* Submissions count */}
          <View
            style={{
              backgroundColor: tintColor + "15",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Ionicons name="people-outline" size={12} color={tintColor} />
            <Text style={{ color: tintColor, fontSize: 11, fontWeight: "600" }}>
              {subs}
            </Text>
          </View>

          {/* Copy URL button */}
          {slug ? (
            <TouchableOpacity
              onPress={() => copyUrl(slug, formId)}
              style={{
                backgroundColor: isCopied ? "#22c55e15" : tintColor + "15",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Ionicons
                name={isCopied ? "checkmark" : "link-outline"}
                size={14}
                color={isCopied ? "#22c55e" : tintColor}
              />
              <Text
                style={{
                  color: isCopied ? "#22c55e" : tintColor,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {isCopied ? "Copiado!" : "Copiar Link"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* WhatsApp share */}
          {slug && Platform.OS === "web" ? (
            <TouchableOpacity
              onPress={() => {
                const waUrl = buildFormWhatsAppUrl(slug);
                if (Platform.OS === "web") {
                  window.open(waUrl, "_blank");
                }
              }}
              style={{
                backgroundColor: "#25d36620",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Ionicons name="logo-whatsapp" size={14} color="#25d366" />
              <Text
                style={{ color: "#25d366", fontSize: 12, fontWeight: "600" }}
              >
                WhatsApp
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    },
    [tintColor, copiedId, copyUrl],
  );

  return (
    <CrudScreen<Row>
      title="Formulários de Captação"
      subtitle="Crie formulários públicos para captar leads automaticamente"
      searchPlaceholder="Buscar por título ou slug..."
      searchFields={["title", "slug"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getId={(item) => String(item.id)}
      getTitle={(item) => String(item.title ?? "Formulário")}
      getDetails={getDetails}
      renderItemActions={renderItemActions}
    />
  );
}
