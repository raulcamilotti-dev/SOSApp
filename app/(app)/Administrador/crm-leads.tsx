/**
 * CRM LEADS — Lista de Leads
 *
 * CrudScreen para gestão completa de leads com todos os campos.
 * Alternativa à visualização Kanban — permite busca, filtros e edição.
 */

import {
    CrudScreen,
    type CrudFieldConfig,
    type CrudScreenHandle,
} from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    createChannelPartner,
    type ChannelPartnerType,
} from "@/services/channel-partners";
import {
    CONVERTIBLE_STATUSES,
    convertLeadToCustomer,
    getLeadStatusConfig,
    LEAD_PRIORITIES,
    LEAD_SOURCES,
    LEAD_STATUSES,
    updateLead,
    type Lead,
    type LeadStatus,
} from "@/services/crm";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Platform, Text, TouchableOpacity, View } from "react-native";

// Re-defined locally (CrudScreen does not export DetailItem)
type DetailItem = { label: string; value: string };

type Row = Record<string, unknown>;

const PARTNER_LEAD_SOURCE = "site_parceiros";

const normalizePartnerType = (raw?: string | null): ChannelPartnerType => {
  const value = String(raw ?? "").toLowerCase();
  if (value === "contador") return "accountant";
  if (value === "consultor") return "consultant";
  if (value === "agencia") return "agency";
  if (value === "revenda") return "reseller";
  if (value === "influenciador") return "influencer";
  if (value === "comunidade") return "association";
  return "other";
};

const parsePartnerNotes = (notes?: string | null) => {
  if (!notes) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { notes_original: notes } as Record<string, unknown>;
  }
};

export default function CrmLeadsScreen() {
  const { user } = useAuth();
  const tintColor = useThemeColor({}, "tint");
  const tenantId = user?.tenant_id ?? "";
  const [showPartnerLeadsOnly, setShowPartnerLeadsOnly] = useState(false);
  const crudRef = useRef<CrudScreenHandle | null>(null);

  useEffect(() => {
    crudRef.current?.reload();
  }, [showPartnerLeadsOnly]);

  /* ─── Fields ─── */

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "name",
      label: "Nome",
      placeholder: "Nome do lead",
      required: true,
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "email",
      label: "E-mail",
      type: "email",
      placeholder: "email@exemplo.com",
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "phone",
      label: "Telefone",
      type: "phone",
      placeholder: "(11) 99999-9999",
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "cpf",
      label: "CPF/CNPJ",
      type: "masked",
      maskType: "cpf_cnpj",
      placeholder: "000.000.000-00",
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "company_name",
      label: "Empresa",
      placeholder: "Nome da empresa (se PJ)",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label })),
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "source",
      label: "Origem",
      type: "select",
      options: LEAD_SOURCES.map((s) => ({ value: s.value, label: s.label })),
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "source_detail",
      label: "Detalhe da Origem",
      placeholder: "Quem indicou, qual formulário...",
      visibleInList: false,
      visibleInForm: true,
      showWhen: (state) => !!state.source,
    },
    {
      key: "priority",
      label: "Prioridade",
      type: "select",
      options: LEAD_PRIORITIES.map((p) => ({ value: p.value, label: p.label })),
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "estimated_value",
      label: "Valor Estimado",
      type: "currency",
      placeholder: "0,00",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "interested_service_type_id",
      label: "Tipo de Serviço",
      type: "reference",
      referenceTable: "service_types",
      referenceLabelField: "name",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "assigned_to",
      label: "Responsável",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "name",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "notes",
      label: "Observações",
      type: "multiline",
      placeholder: "Notas sobre o lead...",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "tags",
      label: "Tags",
      placeholder: "tag1, tag2, tag3",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "next_follow_up_at",
      label: "Próximo Follow-up",
      type: "datetime",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "last_contact_at",
      label: "Último Contato",
      type: "datetime",
      visibleInList: false,
      visibleInForm: true,
      readOnly: true,
    },
    {
      key: "lost_reason",
      label: "Motivo da Perda",
      type: "multiline",
      visibleInList: false,
      visibleInForm: true,
      showWhen: (state) => state.status === "perdido",
      readOnly: true,
    },
    {
      key: "customer_id",
      label: "Cliente Vinculado",
      type: "reference",
      referenceTable: "customers",
      referenceLabelField: "name",
      visibleInList: false,
      visibleInForm: true,
      readOnly: true,
      showWhen: (state) => state.status === "convertido",
    },
    // Hidden fields applied on save
    {
      key: "tenant_id",
      label: "Tenant",
      visibleInList: false,
      visibleInForm: false,
    },
  ];

  /* ─── CRUD Handlers ─── */

  const loadItems = async (): Promise<Row[]> => {
    const filters = [{ field: "tenant_id", value: tenantId }];
    if (showPartnerLeadsOnly) {
      filters.push({ field: "source", value: PARTNER_LEAD_SOURCE });
    }
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "leads",
      ...buildSearchParams(filters, {
        sortColumn: "created_at DESC",
      }),
    });
    return normalizeCrudList<Row>(res.data).filter((item) => !item.deleted_at);
  };

  const paginatedLoadItems = async ({
    limit,
    offset,
  }: {
    limit: number;
    offset: number;
  }): Promise<Row[]> => {
    const filters = [{ field: "tenant_id", value: tenantId }];
    if (showPartnerLeadsOnly) {
      filters.push({ field: "source", value: PARTNER_LEAD_SOURCE });
    }
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "leads",
      ...buildSearchParams(filters, {
        sortColumn: "created_at DESC",
        limit,
        offset,
      }),
    });
    return normalizeCrudList<Row>(res.data).filter((item) => !item.deleted_at);
  };

  const createItem = async (payload: Record<string, unknown>) => {
    return api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "leads",
      payload: {
        ...payload,
        tenant_id: tenantId,
        status: payload.status || "novo",
        priority: payload.priority || "media",
      },
    });
  };

  const updateItem = async (payload: Record<string, unknown>) => {
    return api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "leads",
      payload,
    });
  };

  const deleteItem = async (payload: Record<string, unknown>) => {
    return api.post(CRUD_ENDPOINT, {
      action: "delete",
      table: "leads",
      payload: { id: payload.id, deleted_at: new Date().toISOString() },
    });
  };

  /* ─── Detail & Actions ─── */

  const getDetails = (item: Row): DetailItem[] => {
    const details: DetailItem[] = [];
    const status = item.status as LeadStatus;
    const cfg = getLeadStatusConfig(status);

    details.push({ label: "Status", value: cfg.label });

    if (item.source) {
      const src = LEAD_SOURCES.find((s) => s.value === item.source);
      details.push({
        label: "Origem",
        value: src?.label ?? String(item.source),
      });
    }
    if (item.priority) {
      const pri = LEAD_PRIORITIES.find((p) => p.value === item.priority);
      details.push({
        label: "Prioridade",
        value: pri?.label ?? String(item.priority),
      });
    }
    if (item.estimated_value) {
      const num = parseFloat(String(item.estimated_value));
      if (!isNaN(num)) {
        details.push({
          label: "Valor Estimado",
          value: num.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          }),
        });
      }
    }
    if (item.company_name) {
      details.push({ label: "Empresa", value: String(item.company_name) });
    }
    if (item.notes) {
      details.push({ label: "Notas", value: String(item.notes) });
    }
    if (item.next_follow_up_at) {
      try {
        details.push({
          label: "Próximo Follow-up",
          value: new Date(String(item.next_follow_up_at)).toLocaleDateString(
            "pt-BR",
          ),
        });
      } catch {
        /* ignore */
      }
    }
    if (item.last_contact_at) {
      try {
        details.push({
          label: "Último Contato",
          value: new Date(String(item.last_contact_at)).toLocaleDateString(
            "pt-BR",
          ),
        });
      } catch {
        /* ignore */
      }
    }

    return details;
  };

  const renderItemActions = (item: Row) => {
    const status = item.status as LeadStatus;
    const canConvert = CONVERTIBLE_STATUSES.includes(status);
    const cfg = getLeadStatusConfig(status);
    const notesMeta = parsePartnerNotes(String(item.notes ?? ""));
    const isPartnerLead = String(item.source ?? "") === PARTNER_LEAD_SOURCE;
    const isPartnerApproved = Boolean(
      notesMeta.channel_partner_id || notesMeta.partner_approved_at,
    );

    const handleApprovePartner = async () => {
      const lead = item as unknown as Lead;
      const contactEmail = String(lead.email ?? "")
        .trim()
        .toLowerCase();
      if (!contactEmail) {
        Alert.alert(
          "E-mail obrigatório",
          "Informe um e-mail válido para aprovar como parceiro.",
        );
        return;
      }

      const meta = parsePartnerNotes(lead.notes ?? "");
      const partnerType = normalizePartnerType(
        meta.partner_type as string | undefined,
      );

      const confirmApprove = async () => {
        try {
          const partner = await createChannelPartner({
            type: partnerType,
            contact_name: lead.name ?? "",
            contact_email: contactEmail,
            contact_phone: lead.phone ?? undefined,
            company_name:
              (meta.company_name as string | undefined) ??
              lead.company_name ??
              undefined,
            document_number:
              (meta.document_number as string | undefined) ??
              lead.cpf ??
              undefined,
            commission_rate: 20,
            status: "active",
            approved_by: user?.id ?? undefined,
            approved_at: new Date().toISOString(),
            notes: JSON.stringify({
              ...meta,
              lead_id: lead.id,
              source: PARTNER_LEAD_SOURCE,
            }),
          });

          const updatedNotes = {
            ...meta,
            channel_partner_id: partner.id,
            partner_approved_at: new Date().toISOString(),
            partner_referral_code: partner.referral_code,
          };

          await updateLead(lead.id, {
            status: "convertido",
            notes: JSON.stringify(updatedNotes),
            source_detail: "parceiro_canal",
          });

          Alert.alert(
            "Parceiro criado",
            `Codigo de indicacao: ${partner.referral_code}`,
          );
        } catch (e: any) {
          Alert.alert("Erro", e?.message ?? "Falha ao aprovar parceiro");
        }
      };

      if (Platform.OS === "web") {
        const ok = window.confirm(
          `Aprovar "${lead.name}" como parceiro de canal?`,
        );
        if (ok) confirmApprove();
      } else {
        Alert.alert("Aprovar Parceiro", "Deseja aprovar este lead?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Aprovar", onPress: confirmApprove },
        ]);
      }
    };

    const handleConvert = async () => {
      try {
        const result = await convertLeadToCustomer(item as unknown as Lead);
        const msg = result.isExisting
          ? `Vinculado ao cliente existente: ${result.customer.name}`
          : `Novo cliente criado: ${result.customer.name}`;
        Alert.alert("Convertido!", msg);
      } catch (e: any) {
        Alert.alert("Erro", e?.message ?? "Falha na conversão");
      }
    };

    return (
      <View
        style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}
      >
        {/* Status badge */}
        <View
          style={{
            backgroundColor: cfg.color + "20",
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: cfg.color, fontSize: 11, fontWeight: "700" }}>
            {cfg.label}
          </Text>
        </View>

        {/* Convert button */}
        {canConvert && (
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#22c55e",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
            }}
            onPress={handleConvert}
          >
            <Ionicons name="person-add-outline" size={12} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
              Converter
            </Text>
          </TouchableOpacity>
        )}

        {/* Approve channel partner */}
        {isPartnerLead && !isPartnerApproved && (
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#0ea5e9",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
            }}
            onPress={handleApprovePartner}
          >
            <Ionicons name="ribbon-outline" size={12} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
              Aprovar Parceiro
            </Text>
          </TouchableOpacity>
        )}

        {/* Kanban view */}
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: tintColor,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
          }}
          onPress={() => router.push("/Administrador/crm-kanban" as any)}
        >
          <Ionicons name="grid-outline" size={12} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
            Kanban
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <CrudScreen<Row>
      title="Leads"
      subtitle="Gestão de oportunidades de negócio"
      searchPlaceholder="Buscar lead por nome, email, telefone..."
      searchFields={["name", "email", "phone", "cpf", "company_name"]}
      fields={fields}
      loadItems={loadItems}
      paginatedLoadItems={paginatedLoadItems}
      pageSize={20}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getId={(item) => String(item.id)}
      getTitle={(item) => String(item.name ?? "—")}
      getDetails={getDetails}
      renderItemActions={renderItemActions}
      controlRef={crudRef}
      headerActions={
        <TouchableOpacity
          onPress={() => setShowPartnerLeadsOnly((prev) => !prev)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: showPartnerLeadsOnly ? "#0ea5e9" : "#e2e8f0",
          }}
        >
          <Ionicons
            name="funnel-outline"
            size={12}
            color={showPartnerLeadsOnly ? "#fff" : "#334155"}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: showPartnerLeadsOnly ? "#fff" : "#334155",
            }}
          >
            {showPartnerLeadsOnly ? "Leads Parceiros" : "Todos os Leads"}
          </Text>
        </TouchableOpacity>
      }
    />
  );
}
