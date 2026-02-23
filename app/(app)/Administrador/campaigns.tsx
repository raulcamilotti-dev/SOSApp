/**
 * CAMPANHAS — Lista de Campanhas de Marketing
 *
 * CrudScreen para gestão de campanhas com canais, budget, UTMs e status.
 * Campanhas vinculam-se a leads via lead.campaign_id para tracking de ROI.
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    CAMPAIGN_CHANNELS,
    CAMPAIGN_STATUSES,
    formatCurrency,
    getChannelConfig,
    getStatusConfig,
} from "@/services/campaigns";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

type DetailItem = { label: string; value: string };
type Row = Record<string, unknown>;

export default function CampaignsScreen() {
  const { user } = useAuth();
  const tintColor = useThemeColor({}, "tint");
  const tenantId = user?.tenant_id ?? "";

  /* ─── Fields ─── */

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "name",
      label: "Nome da Campanha",
      placeholder: "Ex: Promo Inventário Março",
      required: true,
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "channel",
      label: "Canal",
      type: "select",
      options: CAMPAIGN_CHANNELS.map((c) => ({
        label: c.label,
        value: c.value,
      })),
      required: true,
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: CAMPAIGN_STATUSES.map((s) => ({
        label: s.label,
        value: s.value,
      })),
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "budget",
      label: "Orçamento (R$)",
      type: "currency",
      placeholder: "0,00",
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "spent",
      label: "Gasto (R$)",
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
    },
    {
      key: "end_date",
      label: "Data Fim",
      type: "date",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "target_url",
      label: "URL de Destino",
      type: "url",
      placeholder: "https://seusite.com.br/landing",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "utm_source",
      label: "UTM Source",
      placeholder: "google, facebook, instagram...",
      visibleInList: false,
      visibleInForm: true,
      section: "Parâmetros UTM",
    },
    {
      key: "utm_medium",
      label: "UTM Medium",
      placeholder: "cpc, social, email...",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "utm_campaign",
      label: "UTM Campaign",
      placeholder: "identificador-da-campanha",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "utm_content",
      label: "UTM Content",
      placeholder: "variação do anúncio (opcional)",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "notes",
      label: "Observações",
      type: "multiline",
      placeholder: "Notas internas sobre a campanha...",
      visibleInList: false,
      visibleInForm: true,
      section: "Detalhes",
    },
  ];

  /* ─── CRUD Handlers ─── */

  const loadItems = async (): Promise<Row[]> => {
    if (!tenantId) return [];
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "campaigns",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        sortColumn: "created_at DESC",
      }),
    });
    return normalizeCrudList(res.data).filter(
      (r: Row) => !r.deleted_at,
    ) as Row[];
  };

  const createItem = async (payload: Row) => {
    return api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "campaigns",
      payload: { ...payload, tenant_id: tenantId },
    });
  };

  const updateItem = async (payload: Row) => {
    return api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "campaigns",
      payload,
    });
  };

  const deleteItem = async (payload: Row) => {
    return api.post(CRUD_ENDPOINT, {
      action: "delete",
      table: "campaigns",
      payload: {
        id: payload.id,
        deleted_at: new Date().toISOString(),
      },
    });
  };

  /* ─── Detail / Actions ─── */

  const getDetails = (item: Row): DetailItem[] => {
    const details: DetailItem[] = [];
    const status = getStatusConfig(String(item.status ?? "rascunho"));
    details.push({ label: "Status", value: status.label });

    const channel = getChannelConfig(String(item.channel ?? "outro"));
    details.push({ label: "Canal", value: channel.label });

    if (item.budget) {
      details.push({
        label: "Orçamento",
        value: formatCurrency(item.budget as number),
      });
    }
    if (item.spent) {
      details.push({
        label: "Gasto",
        value: formatCurrency(item.spent as number),
      });
    }
    if (item.start_date) {
      details.push({ label: "Início", value: String(item.start_date) });
    }
    if (item.end_date) {
      details.push({ label: "Fim", value: String(item.end_date) });
    }
    if (item.utm_campaign) {
      details.push({ label: "UTM Campaign", value: String(item.utm_campaign) });
    }
    if (item.notes) {
      details.push({ label: "Notas", value: String(item.notes) });
    }
    return details;
  };

  const renderItemActions = (item: Row) => {
    const status = getStatusConfig(String(item.status ?? "rascunho"));
    const channel = getChannelConfig(String(item.channel ?? "outro"));

    return (
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {/* Status badge */}
        <View
          style={{
            backgroundColor: status.color + "20",
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 8,
          }}
        >
          <Text
            style={{ color: status.color, fontSize: 11, fontWeight: "600" }}
          >
            {status.label}
          </Text>
        </View>

        {/* Channel badge */}
        <View
          style={{
            backgroundColor: channel.color + "20",
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Ionicons
            name={channel.icon as keyof typeof Ionicons.glyphMap}
            size={12}
            color={channel.color}
          />
          <Text
            style={{ color: channel.color, fontSize: 11, fontWeight: "600" }}
          >
            {channel.label}
          </Text>
        </View>

        {/* Conteúdos button */}
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/Administrador/campaign-items" as never,
              params: {
                campaignId: String(item.id),
                campaignName: String(item.name ?? ""),
              },
            })
          }
          style={{
            backgroundColor: "#8b5cf6" + "15",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Ionicons name="documents-outline" size={14} color="#8b5cf6" />
          <Text style={{ color: "#8b5cf6", fontSize: 12, fontWeight: "600" }}>
            Conteúdos
          </Text>
        </TouchableOpacity>

        {/* Dashboard button */}
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/Administrador/campaign-dashboard" as never,
              params: { campaignId: String(item.id) },
            })
          }
          style={{
            backgroundColor: tintColor + "15",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Ionicons name="bar-chart-outline" size={14} color={tintColor} />
          <Text style={{ color: tintColor, fontSize: 12, fontWeight: "600" }}>
            Dashboard
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <CrudScreen<Row>
      title="Campanhas"
      subtitle="Gerencie campanhas de marketing e acompanhe ROI"
      searchPlaceholder="Buscar por nome ou canal..."
      searchFields={["name", "channel", "utm_campaign"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getId={(item) => String(item.id)}
      getTitle={(item) => String(item.name ?? "Campanha")}
      getDetails={getDetails}
      renderItemActions={renderItemActions}
    />
  );
}
