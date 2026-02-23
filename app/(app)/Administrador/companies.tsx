/**
 * Companies (Admin) — CNPJ-based company management.
 * CRUD on `companies` table.
 * Allows admin to create, edit, and list companies within the tenant.
 * Uses BrasilAPI auto-fill when creating from CNPJ.
 */
import { CnpjDetail } from "@/components/ui/CnpjDetail";
import {
    CrudScreen,
    type CrudFieldConfig,
    type CrudScreenHandle,
} from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    formatCnpj,
    validateCnpj,
    type BrasilApiCnpj,
} from "@/services/brasil-api";
import { CRUD_ENDPOINT } from "@/services/crud";
import type { ReceitaWsCnpj } from "@/services/receita-ws";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";

type Row = Record<string, string>;
/* ------------------------------------------------------------------ */
/*  CRUD helpers                                                       */
/* ------------------------------------------------------------------ */

const listRows = async (): Promise<Row[]> => {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "companies",
  });
  const data = res.data;
  const list = Array.isArray(data) ? data : (data?.data ?? data?.value ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  if (payload.cnpj) payload.cnpj = (payload.cnpj as string).replace(/\D/g, "");
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "companies",
    payload,
  });
  return res.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para atualizar");
  if (payload.cnpj) payload.cnpj = (payload.cnpj as string).replace(/\D/g, "");
  const res = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "companies",
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
    table: "companies",
    payload: { id: payload.id },
  });
  return res.data;
};

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function CompaniesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const tenantId = user?.tenant_id;
  const tintColor = useThemeColor({}, "tint");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const bgColor = useThemeColor({}, "background");

  const [cnpjModalVisible, setCnpjModalVisible] = useState(false);
  const crudRef = useRef<CrudScreenHandle | null>(null);

  /* ---- tenant-scoped CRUD ---- */

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      const rows = await listRows();
      if (!tenantId) return rows;
      return rows.filter((r) => String(r.tenant_id ?? "") === String(tenantId));
    };
  }, [tenantId]);

  const createWithTenant = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
        created_by: user?.id,
      });
    };
  }, [tenantId, user?.id]);

  const updateWithTenant = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({ ...payload });
    };
  }, []);

  /* ---- fields ---- */

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "ID", visibleInForm: false },
    // --- Identificação ---
    {
      key: "cnpj",
      label: "CNPJ",
      placeholder: "00.000.000/0000-00",
      required: true,
      section: "Identificação",
    },
    {
      key: "razao_social",
      label: "Razão Social",
      placeholder: "Razão Social da empresa",
      required: true,
    },
    {
      key: "nome_fantasia",
      label: "Nome Fantasia",
      placeholder: "Nome Fantasia",
    },
    {
      key: "situacao_cadastral",
      label: "Situação Cadastral",
      placeholder: "ATIVA, BAIXADA...",
    },
    {
      key: "data_situacao_cadastral",
      label: "Data Situação Cadastral",
      type: "date",
    },
    // --- Dados da Empresa ---
    {
      key: "natureza_juridica",
      label: "Natureza Jurídica",
      section: "Dados da Empresa",
    },
    { key: "porte", label: "Porte" },
    {
      key: "capital_social",
      label: "Capital Social",
      type: "currency",
    },
    {
      key: "data_inicio_atividade",
      label: "Data de Abertura",
      type: "date",
    },
    {
      key: "cnae_fiscal",
      label: "CNAE Fiscal",
      placeholder: "Código CNAE",
    },
    {
      key: "cnae_fiscal_descricao",
      label: "Atividade Principal",
      placeholder: "Descrição da atividade",
    },
    {
      key: "cnaes_secundarios",
      label: "Atividades Secundárias",
      type: "json",
      visibleInList: false,
    },
    {
      key: "qsa",
      label: "Quadro Societário (QSA)",
      type: "json",
      visibleInList: false,
    },
    // --- Contato ---
    {
      key: "email",
      label: "E-mail",
      type: "email",
      placeholder: "contato@empresa.com",
      section: "Contato",
    },
    {
      key: "phone",
      label: "Telefone",
      type: "phone",
      placeholder: "(00) 0000-0000",
    },
    // --- Endereço ---
    {
      key: "address",
      label: "Logradouro",
      placeholder: "Rua, Av...",
      section: "Endereço",
    },
    { key: "number", label: "Número", placeholder: "123" },
    { key: "complement", label: "Complemento", placeholder: "Sala, Andar..." },
    { key: "neighborhood", label: "Bairro" },
    { key: "city", label: "Cidade" },
    { key: "state", label: "UF" },
    { key: "postal_code", label: "CEP", placeholder: "00000-000" },
  ];

  /* ---- detail row ---- */

  const getDetails = useCallback(
    (row: Row) => [
      { label: "CNPJ", value: formatCnpj(String(row.cnpj ?? "")) },
      { label: "Razão Social", value: String(row.razao_social ?? "-") },
      { label: "Nome Fantasia", value: String(row.nome_fantasia ?? "-") },
      { label: "Situação", value: String(row.situacao_cadastral ?? "-") },
      {
        label: "Natureza Jurídica",
        value: String(row.natureza_juridica ?? "-"),
      },
      { label: "Porte", value: String(row.porte ?? "-") },
      {
        label: "Capital Social",
        value: row.capital_social
          ? `R$ ${Number(row.capital_social).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : "-",
      },
      { label: "Abertura", value: String(row.data_inicio_atividade ?? "-") },
      {
        label: "Atividade Principal",
        value: String(row.cnae_fiscal_descricao ?? "-"),
      },
      { label: "CNAE", value: String(row.cnae_fiscal ?? "-") },
      { label: "E-mail", value: String(row.email ?? "-") },
      { label: "Telefone", value: String(row.phone ?? "-") },
      {
        label: "Endereço",
        value:
          [row.address, row.number, row.complement, row.neighborhood]
            .filter(Boolean)
            .join(", ") || "-",
      },
      {
        label: "Cidade/UF",
        value: [row.city, row.state].filter(Boolean).join("/") || "-",
      },
      { label: "CEP", value: String(row.postal_code ?? "-") },
    ],
    [],
  );

  const getTitle = useCallback(
    (row: Row) =>
      String(
        row.nome_fantasia ||
          row.razao_social ||
          formatCnpj(String(row.cnpj ?? "")),
      ) +
      " — " +
      formatCnpj(String(row.cnpj ?? "")),
    [],
  );

  /* ---- custom field render (CNPJ validation) ---- */

  const renderCustomField = useCallback(
    (
      field: CrudFieldConfig<Row>,
      value: string,
      onChange: (v: string) => void,
      _formState: Record<string, string>,
      _setFormState: React.Dispatch<
        React.SetStateAction<Record<string, string>>
      >,
    ) => {
      if (field.key !== "cnpj") return null;

      const strVal = String(value ?? "");
      const digits = strVal.replace(/\D/g, "");
      const isValid = digits.length === 14 && validateCnpj(digits);
      const isPartial = digits.length > 0 && digits.length < 14;

      return (
        <View key="cnpj-field" style={{ marginBottom: 12 }}>
          <Text
            style={{ fontWeight: "600", marginBottom: 4, color: mutedColor }}
          >
            CNPJ *
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: isValid
                ? "#22c55e"
                : isPartial
                  ? mutedColor
                  : "#ef4444",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: cardColor,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 16,
                color: textColor,
              }}
              // Use as TextInput replacement for display - actual input handled by CrudScreen
            >
              {digits.length > 0 ? formatCnpj(digits) : ""}
            </Text>
            {isValid && (
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
            )}
            {!isValid && digits.length === 14 && (
              <Ionicons name="close-circle" size={20} color="#ef4444" />
            )}
          </View>
        </View>
      );
    },
    [mutedColor, cardColor, textColor],
  );

  /* ---- CNPJ → pre-fill create form ---- */

  const mapCnpjToFormData = useCallback(
    (data: ReceitaWsCnpj | BrasilApiCnpj): Record<string, string> => {
      const s = (v: unknown) => (v != null ? String(v) : "");

      // Detect source: BrasilAPI has "razao_social", ReceitaWS has "nome"
      if ("razao_social" in data) {
        const d = data as BrasilApiCnpj;
        return {
          cnpj: (d.cnpj ?? "").replace(/\D/g, ""),
          razao_social: s(d.razao_social),
          nome_fantasia: s(d.nome_fantasia),
          situacao_cadastral: s(d.descricao_situacao_cadastral),
          data_situacao_cadastral: s(d.data_situacao_cadastral),
          natureza_juridica: s(d.natureza_juridica),
          porte: s(d.porte),
          capital_social: s(d.capital_social),
          data_inicio_atividade: s(d.data_inicio_atividade),
          cnae_fiscal: s(d.cnae_fiscal),
          cnae_fiscal_descricao: s(d.cnae_fiscal_descricao),
          cnaes_secundarios: d.cnaes_secundarios
            ? JSON.stringify(d.cnaes_secundarios)
            : "",
          qsa: d.qsa ? JSON.stringify(d.qsa) : "",
          email: s(d.email),
          phone: s(d.ddd_telefone_1),
          address: s(d.logradouro),
          number: s(d.numero),
          complement: s(d.complemento),
          neighborhood: s(d.bairro),
          city: s(d.municipio),
          state: s(d.uf),
          postal_code: (d.cep ?? "").replace(/\D/g, ""),
        };
      }
      // ReceitaWS
      const d = data as ReceitaWsCnpj;
      return {
        cnpj: (d.cnpj ?? "").replace(/\D/g, ""),
        razao_social: s(d.nome),
        nome_fantasia: s(d.fantasia),
        situacao_cadastral: s(d.situacao),
        data_situacao_cadastral: s(d.data_situacao),
        natureza_juridica: s(d.natureza_juridica),
        porte: s(d.porte),
        capital_social: s(d.capital_social),
        data_inicio_atividade: s(d.abertura),
        cnae_fiscal: d.atividade_principal?.[0]?.code ?? "",
        cnae_fiscal_descricao: d.atividade_principal?.[0]?.text ?? "",
        cnaes_secundarios: d.atividades_secundarias
          ? JSON.stringify(d.atividades_secundarias)
          : "",
        qsa: d.qsa ? JSON.stringify(d.qsa) : "",
        email: s(d.email),
        phone: s(d.telefone),
        address: s(d.logradouro),
        number: s(d.numero),
        complement: s(d.complemento),
        neighborhood: s(d.bairro),
        city: s(d.municipio),
        state: s(d.uf),
        postal_code: (d.cep ?? "").replace(/\D/g, ""),
      };
    },
    [],
  );

  const handleCnpjAdd = useCallback(
    (data: ReceitaWsCnpj | BrasilApiCnpj) => {
      const formData = mapCnpjToFormData(data);
      setCnpjModalVisible(false);
      // Small delay to let modal close before opening form
      setTimeout(() => {
        crudRef.current?.openCreateWithData(formData);
      }, 300);
    },
    [mapCnpjToFormData],
  );

  /* ---- row actions: navigate to members ---- */

  const renderItemActions = useCallback(
    (row: Row) => (
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: tintColor,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            gap: 4,
          }}
          onPress={() =>
            router.push({
              pathname: "/(app)/Administrador/company-members" as never,
              params: {
                companyId: String(row.id),
                companyName: String(
                  row.nome_fantasia || row.razao_social || "",
                ),
                tenantId: String(row.tenant_id ?? tenantId ?? ""),
              },
            })
          }
        >
          <Ionicons name="people" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
            Membros
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#6366f1",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            gap: 4,
          }}
          onPress={() =>
            router.push({
              pathname: "/(app)/Administrador/customer-properties" as never,
              params: {
                companyId: String(row.id),
                tenantId: String(row.tenant_id ?? tenantId ?? ""),
              },
            })
          }
        >
          <Ionicons name="home" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
            Imóveis
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [router, tenantId, tintColor],
  );

  /* ---- CNPJ lookup modal ---- */

  const renderCnpjModal = () => (
    <Modal
      visible={cnpjModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setCnpjModalVisible(false)}
    >
      <View style={{ flex: 1, padding: 16, backgroundColor: bgColor }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "700", color: textColor }}>
            Consultar CNPJ
          </Text>
          <TouchableOpacity onPress={() => setCnpjModalVisible(false)}>
            <Ionicons name="close" size={24} color={textColor} />
          </TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          <CnpjDetail showInput source="brasilapi" onAdd={handleCnpjAdd} />
        </ScrollView>
      </View>
    </Modal>
  );

  const cnpjButton = useMemo(
    () => (
      <TouchableOpacity
        onPress={() => setCnpjModalVisible(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#6366f1",
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 8,
          gap: 6,
        }}
      >
        <Ionicons name="search" size={16} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
          Consultar CNPJ
        </Text>
      </TouchableOpacity>
    ),
    [],
  );

  return (
    <>
      <CrudScreen<Row>
        title="Empresas"
        subtitle="Consulte o CNPJ para cadastrar uma empresa"
        fields={fields}
        loadItems={loadFilteredRows}
        createItem={createWithTenant}
        updateItem={updateWithTenant}
        deleteItem={deleteRow}
        getTitle={getTitle}
        getId={(item) => String(item.id ?? "")}
        getDetails={getDetails}
        renderItemActions={renderItemActions}
        renderCustomField={renderCustomField}
        hideAddButton
        headerActions={cnpjButton}
        controlRef={crudRef}
      />
      {renderCnpjModal()}
    </>
  );
}
