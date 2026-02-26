/**
 * Recebimentos — Admin screen
 *
 * Tenant enables and configures payment receiving (PIX + card).
 * Stored directly in tenants columns (not onboarding).
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const PIX_KEY_TYPES = [
  { label: "CPF", value: "cpf" },
  { label: "CNPJ", value: "cnpj" },
  { label: "E-mail", value: "email" },
  { label: "Telefone", value: "phone" },
  { label: "Chave aleatoria", value: "random" },
];

const GATEWAY_OPTIONS = [
  { label: "Asaas", value: "asaas" },
  { label: "Mercado Pago", value: "mercadopago" },
  { label: "Stripe", value: "stripe" },
  { label: "PagSeguro", value: "pagseguro" },
];

type TenantReceiving = {
  id: string;
  payments_enabled?: boolean | null;
  payment_gateway_provider?: string | null;
  asaas_wallet_id?: string | null;
  pix_enabled?: boolean | null;
  card_enabled?: boolean | null;
  pix_key?: string | null;
  pix_key_type?: string | null;
  pix_merchant_name?: string | null;
  pix_merchant_city?: string | null;
};

export default function RecebimentosConfigScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [gatewayProvider, setGatewayProvider] = useState("asaas");
  const [asaasWalletId, setAsaasWalletId] = useState("");
  const [pixEnabled, setPixEnabled] = useState(false);
  const [cardEnabled, setCardEnabled] = useState(false);
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cnpj");
  const [pixMerchantName, setPixMerchantName] = useState("");
  const [pixMerchantCity, setPixMerchantCity] = useState("");

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams([{ field: "id", value: tenantId }]),
        fields: [
          "id",
          "payments_enabled",
          "payment_gateway_provider",
          "asaas_wallet_id",
          "pix_enabled",
          "card_enabled",
          "pix_key",
          "pix_key_type",
          "pix_merchant_name",
          "pix_merchant_city",
        ],
      });

      const tenants = normalizeCrudList<TenantReceiving>(res.data);
      const tenant = tenants[0];
      if (!tenant) {
        setError("Tenant nao encontrado.");
        return;
      }

      setPaymentsEnabled(Boolean(tenant.payments_enabled));
      setGatewayProvider(String(tenant.payment_gateway_provider ?? "asaas"));
      setAsaasWalletId(String(tenant.asaas_wallet_id ?? ""));
      setPixEnabled(Boolean(tenant.pix_enabled));
      setCardEnabled(Boolean(tenant.card_enabled));
      setPixKey(String(tenant.pix_key ?? ""));
      setPixKeyType(String(tenant.pix_key_type ?? "cnpj"));
      setPixMerchantName(String(tenant.pix_merchant_name ?? ""));
      setPixMerchantCity(String(tenant.pix_merchant_city ?? ""));
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Erro ao carregar");
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleSave = useCallback(async () => {
    if (!tenantId) return;

    if (
      paymentsEnabled &&
      gatewayProvider === "asaas" &&
      !asaasWalletId.trim()
    ) {
      Alert.alert(
        "Erro",
        "Informe o Asaas Wallet ID para habilitar recebimentos.",
      );
      return;
    }

    if (pixEnabled && gatewayProvider !== "asaas" && !pixKey.trim()) {
      Alert.alert("Erro", "Informe a chave PIX para habilitar PIX.");
      return;
    }

    setSaving(true);
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "tenants",
        payload: {
          id: tenantId,
          payments_enabled: paymentsEnabled,
          payment_gateway_provider: gatewayProvider || "asaas",
          asaas_wallet_id: asaasWalletId.trim() || null,
          pix_enabled: pixEnabled,
          card_enabled: cardEnabled,
          pix_key: pixKey.trim() || null,
          pix_key_type: pixKey.trim() ? pixKeyType : null,
          pix_merchant_name: pixMerchantName.trim() || null,
          pix_merchant_city: pixMerchantCity.trim() || null,
        },
      });

      Alert.alert("Sucesso", "Configuracoes de recebimento salvas!");
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Erro ao salvar");
      Alert.alert("Erro", msg);
    } finally {
      setSaving(false);
    }
  }, [
    asaasWalletId,
    cardEnabled,
    gatewayProvider,
    paymentsEnabled,
    pixEnabled,
    pixKey,
    pixKeyType,
    pixMerchantCity,
    pixMerchantName,
    tenantId,
  ]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: textColor }}>
          Configuracoes de Recebimento
        </Text>
        <Text style={{ fontSize: 12, color: mutedColor, marginTop: 4 }}>
          Habilite PIX e cartao apos concluir o cadastro do tenant.
        </Text>
      </View>

      {error ? (
        <Text style={{ color: tintColor, marginBottom: 12 }}>{error}</Text>
      ) : null}

      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <Text style={{ fontWeight: "700", color: textColor }}>Geral</Text>

        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: textColor }}>Recebimentos habilitados</Text>
          <Switch value={paymentsEnabled} onValueChange={setPaymentsEnabled} />
        </View>

        <Text style={{ marginTop: 16, color: mutedColor, fontSize: 12 }}>
          Gateway de pagamento
        </Text>
        <View
          style={{
            marginTop: 8,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {GATEWAY_OPTIONS.map((option) => {
            const selected = gatewayProvider === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setGatewayProvider(option.value)}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: selected ? `${tintColor}1A` : cardBg,
                }}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ marginTop: 16, color: mutedColor, fontSize: 12 }}>
          Asaas Wallet ID
        </Text>
        <TextInput
          value={asaasWalletId}
          onChangeText={setAsaasWalletId}
          placeholder="wal_..."
          placeholderTextColor={mutedColor}
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginTop: 6,
            backgroundColor: inputBg,
            color: textColor,
          }}
        />
      </View>

      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <Text style={{ fontWeight: "700", color: textColor }}>PIX</Text>

        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: textColor }}>PIX habilitado</Text>
          <Switch value={pixEnabled} onValueChange={setPixEnabled} />
        </View>

        <Text style={{ marginTop: 16, color: mutedColor, fontSize: 12 }}>
          Chave PIX
        </Text>
        <TextInput
          value={pixKey}
          onChangeText={setPixKey}
          placeholder="CPF, CNPJ, email ou chave aleatoria"
          placeholderTextColor={mutedColor}
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginTop: 6,
            backgroundColor: inputBg,
            color: textColor,
          }}
        />

        <Text style={{ marginTop: 16, color: mutedColor, fontSize: 12 }}>
          Tipo da chave
        </Text>
        <View
          style={{
            marginTop: 8,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {PIX_KEY_TYPES.map((option) => {
            const selected = pixKeyType === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setPixKeyType(option.value)}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: selected ? `${tintColor}1A` : cardBg,
                }}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ marginTop: 16, color: mutedColor, fontSize: 12 }}>
          Nome do recebedor
        </Text>
        <TextInput
          value={pixMerchantName}
          onChangeText={setPixMerchantName}
          placeholder="Nome curto para o QR"
          placeholderTextColor={mutedColor}
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginTop: 6,
            backgroundColor: inputBg,
            color: textColor,
          }}
        />

        <Text style={{ marginTop: 16, color: mutedColor, fontSize: 12 }}>
          Cidade do recebedor
        </Text>
        <TextInput
          value={pixMerchantCity}
          onChangeText={setPixMerchantCity}
          placeholder="Ex: Curitiba"
          placeholderTextColor={mutedColor}
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginTop: 6,
            backgroundColor: inputBg,
            color: textColor,
          }}
        />
      </View>

      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <Text style={{ fontWeight: "700", color: textColor }}>Cartao</Text>

        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: textColor }}>Cartao habilitado</Text>
          <Switch value={cardEnabled} onValueChange={setCardEnabled} />
        </View>
      </View>

      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        style={{
          backgroundColor: saving ? mutedColor : tintColor,
          borderRadius: 10,
          paddingVertical: 14,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Ionicons name="save-outline" size={18} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "700" }}>
          {saving ? "Salvando..." : "Salvar configuracoes"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
