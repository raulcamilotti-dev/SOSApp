/**
 * CHANNEL PARTNERS — Gestão de Parceiros de Canal
 *
 * Admin screen para gerenciar parceiros que indicam novos tenants
 * (diferente de `partners` que são executores de serviços)
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
    CrudScreen,
    type CrudFieldConfig,
    type CrudScreenHandle,
} from "@/components/ui/CrudScreen";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    generateReferralCode,
    type ChannelPartnerStatus,
    type ChannelPartnerType,
} from "@/services/channel-partners";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, TouchableOpacity, View } from "react-native";

const BUILDER_ACCENT = "#7c3aed"; // violet

// Generic row type for CrudScreen compatibility
type Row = Record<string, unknown>;

export default function ChannelPartnersScreen() {
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<CrudFieldConfig<Row>[]>([]);
  const crudRef = useRef<CrudScreenHandle>(null);
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");

  // Load schema
  useEffect(() => {
    (async () => {
      try {
        // Define custom fields for channel partners
        const customFields: CrudFieldConfig<Row>[] = [
          {
            key: "type",
            label: "Tipo de Parceiro",
            type: "select",
            required: true,
            options: [
              { label: "Contador", value: "accountant" },
              { label: "Consultoria", value: "consultant" },
              { label: "Agência/Software House", value: "agency" },
              { label: "Influenciador", value: "influencer" },
              { label: "Associação (CDL, ACE, Sebrae)", value: "association" },
              { label: "Revendedor", value: "reseller" },
              { label: "Outro", value: "other" },
            ],
            visibleInList: true,
            visibleInForm: true,
          },
          {
            key: "contact_name",
            label: "Nome do Contato",
            type: "text",
            required: true,
            visibleInList: true,
            visibleInForm: true,
          },
          {
            key: "contact_email",
            label: "Email do Contato",
            type: "email",
            required: true,
            visibleInList: true,
            visibleInForm: true,
          },
          {
            key: "contact_phone",
            label: "Telefone",
            type: "phone",
            visibleInList: false,
            visibleInForm: true,
          },
          {
            key: "company_name",
            label: "Nome da Empresa",
            type: "text",
            visibleInList: true,
            visibleInForm: true,
          },
          {
            key: "document_number",
            label: "CPF/CNPJ",
            type: "masked",
            maskType: "cpf_cnpj",
            visibleInList: false,
            visibleInForm: true,
          },
          {
            key: "referral_code",
            label: "Código de Indicação",
            type: "text",
            placeholder: "Auto-gerado se vazio",
            required: false,
            visibleInList: true,
            visibleInForm: true,
            section: "Sistema de Indicação",
          },
          {
            key: "commission_rate",
            label: "Taxa de Comissão (%)",
            type: "number",
            placeholder: "20.00",
            visibleInList: true,
            visibleInForm: true,
          },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: [
              { label: "Pendente (aguardando aprovação)", value: "pending" },
              { label: "Ativo", value: "active" },
              { label: "Inativo", value: "inactive" },
              { label: "Suspenso", value: "suspended" },
              { label: "Cancelado", value: "churned" },
            ],
            visibleInList: true,
            visibleInForm: true,
          },
          {
            key: "pix_key",
            label: "Chave PIX",
            type: "text",
            visibleInList: false,
            visibleInForm: true,
            section: "Dados Bancários",
          },
          {
            key: "pix_key_type",
            label: "Tipo de Chave PIX",
            type: "select",
            options: [
              { label: "CPF", value: "cpf" },
              { label: "CNPJ", value: "cnpj" },
              { label: "Email", value: "email" },
              { label: "Telefone", value: "phone" },
              { label: "Chave Aleatória", value: "random" },
            ],
            visibleInList: false,
            visibleInForm: true,
          },
          {
            key: "bank_name",
            label: "Banco",
            type: "text",
            visibleInList: false,
            visibleInForm: true,
          },
          {
            key: "bank_agency",
            label: "Agência",
            type: "text",
            visibleInList: false,
            visibleInForm: true,
          },
          {
            key: "bank_account_number",
            label: "Conta",
            type: "text",
            visibleInList: false,
            visibleInForm: true,
          },
          {
            key: "bank_account_type",
            label: "Tipo de Conta",
            type: "select",
            options: [
              { label: "Conta Corrente", value: "checking" },
              { label: "Poupança", value: "savings" },
            ],
            visibleInList: false,
            visibleInForm: true,
          },
          {
            key: "notes",
            label: "Observações",
            type: "multiline",
            visibleInList: false,
            visibleInForm: true,
            section: "Informações Adicionais",
          },
        ];

        setFields(customFields);
      } catch (error) {
        Alert.alert("Erro", getApiErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadItems = useCallback(async () => {
    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "channel_partners",
      ...buildSearchParams([], { sortColumn: "created_at DESC" }),
    });
    return normalizeCrudList<Row>(response.data).filter(
      (item) => !item.deleted_at,
    );
  }, []);

  const createItem = useCallback(async (payload: Partial<Row>) => {
    // Auto-gera código se não preenchido
    if (!payload.referral_code && payload.contact_name && payload.type) {
      payload.referral_code = generateReferralCode(
        String(payload.contact_name),
        payload.type as ChannelPartnerType,
      );
    }

    const response = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "channel_partners",
      payload: {
        ...payload,
        status: payload.status ?? "pending",
        commission_rate: payload.commission_rate ?? 20.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    return response.data;
  }, []);

  const updateItem = useCallback(
    async (payload: Partial<Row> & { id?: string | null }) => {
      const response = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "channel_partners",
        payload: {
          ...payload,
          updated_at: new Date().toISOString(),
        },
      });
      return response.data;
    },
    [],
  );

  const deleteItem = useCallback(
    async (payload: Partial<Row> & { id?: string | null }) => {
      const response = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "channel_partners",
        payload: {
          id: payload.id,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      return response.data;
    },
    [],
  );

  const getId = useCallback((item: Row) => String(item.id ?? ""), []);

  const getTitle = useCallback(
    (item: Row) => String(item.company_name ?? item.contact_name ?? "Parceiro"),
    [],
  );

  const getDetails = useCallback((item: Row) => {
    const typeLabels: Record<ChannelPartnerType, string> = {
      accountant: "Contador",
      consultant: "Consultoria",
      agency: "Agência",
      influencer: "Influenciador",
      association: "Associação",
      reseller: "Revendedor",
      other: "Outro",
    };

    const statusLabels = {
      pending: "Pendente",
      active: "Ativo",
      inactive: "Inativo",
      suspended: "Suspenso",
      churned: "Cancelado",
    };

    return [
      {
        label: "Tipo",
        value:
          typeLabels[item.type as ChannelPartnerType] ||
          String(item.type ?? "-"),
      },
      { label: "Contato", value: String(item.contact_name ?? "-") },
      { label: "Email", value: String(item.contact_email ?? "-") },
      { label: "Código", value: String(item.referral_code ?? "-") },
      { label: "Comissão", value: `${item.commission_rate ?? 20}%` },
      {
        label: "Status",
        value:
          statusLabels[item.status as ChannelPartnerStatus] ||
          String(item.status ?? "-"),
      },
    ];
  }, []);

  const renderItemActions = useCallback((item: Row) => {
    const referralCode = String(item.referral_code ?? "");
    return (
      <>
        <ThemedText
          style={{
            fontSize: 11,
            fontWeight: "600",
            marginTop: 8,
            marginBottom: 4,
          }}
        >
          Ações
        </ThemedText>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              router.push(`/(app)/Administrador/channel-partner-dashboard`);
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: "#2563eb",
              borderRadius: 6,
            }}
          >
            <ThemedText
              style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}
            >
              Ver Dashboard
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              const link = `https://app.radul.com.br/registro?ref=${referralCode}`;
              try {
                await Clipboard.setStringAsync(link);
                Alert.alert("Copiado!", `Link de indicação copiado: ${link}`);
              } catch {
                Alert.alert("Link de Indicação", link);
              }
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: "#16a34a",
              borderRadius: 6,
            }}
          >
            <ThemedText
              style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}
            >
              📋 Copiar Link
            </ThemedText>
          </TouchableOpacity>
        </View>
      </>
    );
  }, []);

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando...</ThemedText>
      </ThemedView>
    );
  }

  /* ── Cross-promo: builder CTA ── */
  const builderCTA = useMemo(
    () => (
      <TouchableOpacity
        onPress={() =>
          router.push("/(app)/Administrador/builder-dashboard" as any)
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: BUILDER_ACCENT + "30",
          backgroundColor: BUILDER_ACCENT + "0A",
        }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            backgroundColor: BUILDER_ACCENT + "1A",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name="cube-outline" size={14} color={BUILDER_ACCENT} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: textColor,
            }}
          >
            Também seja um Criador
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 11,
              color: mutedTextColor,
            }}
          >
            Crie Template Packs e ganhe por instalação
          </ThemedText>
        </View>
        <Ionicons name="arrow-forward" size={14} color={BUILDER_ACCENT} />
      </TouchableOpacity>
    ),
    [textColor, mutedTextColor],
  );

  return (
    <CrudScreen<Row>
      tableName="channel_partners"
      title="Parceiros de Canal"
      subtitle="Contadores, consultorias, agências e influenciadores que indicam novos tenants"
      searchPlaceholder="Buscar por nome, email ou código..."
      searchFields={[
        "contact_name",
        "company_name",
        "contact_email",
        "referral_code",
      ]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getId={getId}
      getTitle={getTitle}
      getDetails={getDetails}
      renderItemActions={renderItemActions}
      controlRef={crudRef}
      addButtonLabel="+ Novo Parceiro"
      headerActions={builderCTA}
    />
  );
}
