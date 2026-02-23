/**
 * Fornecedores — Admin screen
 *
 * CrudScreen for the dedicated suppliers table.
 * Suppliers are companies you purchase from (separate from partners).
 *
 * Features:
 *   - CNPJ auto-lookup via BrasilAPI (auto-fills razão social, fantasia, endereço, etc.)
 *   - Also accepts CPF (no auto-fill for CPF)
 *   - Masked cpf_cnpj input field
 */

import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useCnpjLookup } from "@/hooks/use-cnpj-lookup";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import type { CrudFilter } from "@/services/crud";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Row = Record<string, unknown>;

export default function FornecedoresScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const inputBg = useThemeColor({}, "input");

  // CNPJ lookup state — we store setFormState ref to fill fields on success
  const formStateSetterRef = React.useRef<React.Dispatch<
    React.SetStateAction<Record<string, string>>
  > | null>(null);

  const {
    setCnpj: setCnpjHook,
    loading: cnpjLoading,
    error: cnpjError,
    data: cnpjData,
  } = useCnpjLookup({
    onSuccess: (company) => {
      const setter = formStateSetterRef.current;
      if (!setter) return;
      setter((prev) => ({
        ...prev,
        name: company.razao_social || prev.name || "",
        trade_name: company.nome_fantasia || prev.trade_name || "",
        email: company.email || prev.email || "",
        phone: company.ddd_telefone_1 || prev.phone || "",
        address:
          [company.logradouro, company.numero, company.complemento]
            .filter(Boolean)
            .join(", ") ||
          prev.address ||
          "",
        city: company.municipio || prev.city || "",
        state: company.uf || prev.state || "",
        zip_code: company.cep || prev.zip_code || "",
      }));
    },
  });

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const loadItems = useMemo(() => {
    return async (): Promise<Row[]> => {
      const filters: CrudFilter[] = [
        ...(tenantId ? [{ field: "tenant_id", value: tenantId }] : []),
      ];
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "suppliers",
        ...buildSearchParams(filters, {
          sortColumn: "name ASC",
          autoExcludeDeleted: true,
        }),
      });
      return normalizeCrudList<Row>(res.data);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, reloadKey]);

  const createItem = useMemo(() => {
    return async (payload: Record<string, unknown>) => {
      const res = await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "suppliers",
        payload: {
          ...payload,
          tenant_id: tenantId,
          is_active: true,
        },
      });
      reload();
      return res.data;
    };
  }, [tenantId, reload]);

  const updateItem = useMemo(() => {
    return async (payload: Record<string, unknown>) => {
      if (!payload.id) throw new Error("Id obrigatório");
      const res = await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "suppliers",
        payload: {
          ...payload,
          updated_at: new Date().toISOString(),
        },
      });
      reload();
      return res.data;
    };
  }, [reload]);

  const deleteItem = useMemo(() => {
    return async (payload: Record<string, unknown>) => {
      if (!payload.id) throw new Error("Id obrigatório");
      await api.post(CRUD_ENDPOINT, {
        action: "delete",
        table: "suppliers",
        payload: {
          id: String(payload.id),
          deleted_at: new Date().toISOString(),
        },
      });
      reload();
    };
  }, [reload]);

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", visibleInForm: false, visibleInList: false },
    {
      key: "name",
      label: "Razão Social",
      required: true,
      section: "Identificação",
      visibleInList: true,
    },
    {
      key: "trade_name",
      label: "Nome Fantasia",
      section: "Identificação",
    },
    {
      key: "document",
      label: "CNPJ/CPF",
      type: "masked",
      maskType: "cpf_cnpj",
      section: "Identificação",
      visibleInList: true,
    },
    {
      key: "email",
      label: "E-mail",
      type: "email",
      section: "Contato",
    },
    {
      key: "phone",
      label: "Telefone",
      type: "phone",
      section: "Contato",
    },
    {
      key: "contact_person",
      label: "Pessoa de Contato",
      section: "Contato",
    },
    {
      key: "address",
      label: "Endereço",
      section: "Endereço",
    },
    {
      key: "city",
      label: "Cidade",
      section: "Endereço",
    },
    {
      key: "state",
      label: "UF",
      section: "Endereço",
    },
    {
      key: "zip_code",
      label: "CEP",
      type: "masked",
      maskType: "cep",
      section: "Endereço",
    },
    {
      key: "payment_terms",
      label: "Condições de Pagamento",
      placeholder: "Ex: 30/60/90 dias",
      section: "Comercial",
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
      section: "Comercial",
    },
    {
      key: "notes",
      label: "Observações",
      type: "multiline",
      section: "Info",
    },
  ];

  return (
    <CrudScreen<Row>
      title="Fornecedores"
      subtitle="Cadastro de fornecedores"
      searchPlaceholder="Buscar por nome, CNPJ..."
      searchFields={["name", "trade_name", "document", "email"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const name = item.trade_name || item.name || "Sem nome";
        return `🏭 ${name}`;
      }}
      getDetails={(item) => [
        { label: "Razão Social", value: String(item.name ?? "-") },
        { label: "CNPJ/CPF", value: String(item.document ?? "-") },
        { label: "Telefone", value: String(item.phone ?? "-") },
        { label: "Contato", value: String(item.contact_person ?? "-") },
        { label: "Cidade", value: String(item.city ?? "-") },
        {
          label: "Status",
          value: item.is_active === false ? "Inativo" : "Ativo",
        },
      ]}
      renderCustomField={(field, value, onChange, _formState, setFormState) => {
        if (field.key !== "document") return null;

        // Store setFormState ref so CNPJ lookup callback can fill fields
        formStateSetterRef.current = setFormState;

        const digits = value.replace(/\D/g, "");
        const isCnpjLength = digits.length >= 14;

        return (
          <View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <TextInput
                value={value}
                onChangeText={(text) => {
                  onChange(text);
                  // If it looks like a CNPJ (14+ digits), trigger lookup
                  const d = text.replace(/\D/g, "");
                  if (d.length === 14) {
                    setCnpjHook(text);
                  }
                }}
                placeholder="CNPJ ou CPF"
                keyboardType="numeric"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 14,
                  color: textColor,
                  backgroundColor: inputBg,
                }}
              />
              {cnpjLoading && (
                <ActivityIndicator size="small" color={tintColor} />
              )}
              {isCnpjLength && !cnpjLoading && cnpjData && (
                <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
              )}
            </View>
            {cnpjLoading && (
              <ThemedText
                style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}
              >
                Consultando CNPJ...
              </ThemedText>
            )}
            {cnpjError && isCnpjLength && (
              <ThemedText
                style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}
              >
                {cnpjError}
              </ThemedText>
            )}
            {cnpjData && isCnpjLength && (
              <TouchableOpacity
                onPress={() => {
                  // Re-apply the CNPJ data to form state
                  setFormState((prev) => ({
                    ...prev,
                    name: cnpjData.razao_social || prev.name || "",
                    trade_name: cnpjData.nome_fantasia || prev.trade_name || "",
                    email: cnpjData.email || prev.email || "",
                    phone: cnpjData.ddd_telefone_1 || prev.phone || "",
                    address:
                      [
                        cnpjData.logradouro,
                        cnpjData.numero,
                        cnpjData.complemento,
                      ]
                        .filter(Boolean)
                        .join(", ") ||
                      prev.address ||
                      "",
                    city: cnpjData.municipio || prev.city || "",
                    state: cnpjData.uf || prev.state || "",
                    zip_code: cnpjData.cep || prev.zip_code || "",
                  }));
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 6,
                  backgroundColor: `${tintColor}15`,
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                <Ionicons name="refresh" size={14} color={tintColor} />
                <ThemedText
                  style={{ fontSize: 12, color: tintColor, fontWeight: "600" }}
                >
                  Preencher dados do CNPJ: {cnpjData.razao_social}
                </ThemedText>
              </TouchableOpacity>
            )}
            {!isCnpjLength && digits.length > 0 && digits.length <= 11 && (
              <ThemedText
                style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}
              >
                CPF detectado — preenchimento automático apenas para CNPJ
              </ThemedText>
            )}
          </View>
        );
      }}
    />
  );
}
