/**
 * Recebimentos — Admin screen
 *
 * Configures payment receiving for the tenant.
 * Toggle flags (payments_enabled, pix_enabled, card_enabled) live on `tenants`.
 * Gateway-specific config (wallet_id, access_token, etc.) and PIX fields
 * live on `bank_accounts` (via gateway_config JSONB + pix_key columns).
 *
 * The screen loads gateway bank_accounts and lets the admin select the
 * primary gateway account whose config is used for payment processing.
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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    RefreshControl,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ─── Constants ─── */

const PIX_KEY_TYPES = [
  { label: "CPF", value: "cpf" },
  { label: "CNPJ", value: "cnpj" },
  { label: "E-mail", value: "email" },
  { label: "Telefone", value: "phone" },
  { label: "Chave aleatória", value: "random" },
];

const GATEWAY_PROVIDER_LABELS: Record<string, string> = {
  asaas: "Asaas",
  mercadopago: "Mercado Pago",
  stripe: "Stripe",
  pagseguro: "PagSeguro",
};

/* ─── Types ─── */

type TenantToggles = {
  id: string;
  payments_enabled?: boolean;
  pix_enabled?: boolean;
  card_enabled?: boolean;
};

type BankAccount = {
  id: string;
  bank_id: string;
  account_name?: string;
  gateway_config?: Record<string, unknown>;
  is_primary_gateway?: boolean;
  pix_key?: string;
  pix_key_type?: string;
  pix_merchant_name?: string;
  pix_merchant_city?: string;
  deleted_at?: string;
};

type Bank = {
  id: string;
  name: string;
  is_payment_gateway?: boolean;
  gateway_provider?: string;
  deleted_at?: string;
};

/* ─── Helper ─── */

const showAlert = (title: string, message: string) => {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

/* ═══════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════ */

export default function RecebimentosConfig() {
  const { user } = useAuth();
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── State: tenant toggles ── */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [pixEnabled, setPixEnabled] = useState(false);
  const [cardEnabled, setCardEnabled] = useState(false);

  /* ── State: gateway bank accounts ── */
  const [gatewayBanks, setGatewayBanks] = useState<Bank[]>([]);
  const [gatewayAccounts, setGatewayAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );

  /* ── State: fields from selected account ── */
  const [walletId, setWalletId] = useState("");
  const [gatewayConfig, setGatewayConfig] = useState<Record<string, string>>(
    {},
  );
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("");
  const [pixMerchantName, setPixMerchantName] = useState("");
  const [pixMerchantCity, setPixMerchantCity] = useState("");

  /* ── Derived ── */

  const bankById = useMemo(() => {
    const map = new Map<string, Bank>();
    gatewayBanks.forEach((b) => map.set(b.id, b));
    return map;
  }, [gatewayBanks]);

  const selectedAccount = useMemo(
    () => gatewayAccounts.find((a) => a.id === selectedAccountId) ?? null,
    [gatewayAccounts, selectedAccountId],
  );

  const selectedBank = useMemo(
    () =>
      selectedAccount ? (bankById.get(selectedAccount.bank_id) ?? null) : null,
    [selectedAccount, bankById],
  );

  const gatewayProvider = selectedBank?.gateway_provider ?? null;

  /* ── Load data ── */

  const populateFromAccount = useCallback((account: BankAccount) => {
    const cfg =
      account.gateway_config && typeof account.gateway_config === "object"
        ? (account.gateway_config as Record<string, string>)
        : {};
    setWalletId(String(cfg.wallet_id ?? ""));
    setGatewayConfig(
      Object.fromEntries(
        Object.entries(cfg).map(([k, v]) => [k, String(v ?? "")]),
      ),
    );
    setPixKey(String(account.pix_key ?? ""));
    setPixKeyType(String(account.pix_key_type ?? ""));
    setPixMerchantName(String(account.pix_merchant_name ?? ""));
    setPixMerchantCity(String(account.pix_merchant_city ?? ""));
  }, []);

  const selectAccount = useCallback(
    (accountId: string) => {
      setSelectedAccountId(accountId);
      const account = gatewayAccounts.find((a) => a.id === accountId);
      if (account) populateFromAccount(account);
    },
    [gatewayAccounts, populateFromAccount],
  );

  const loadData = useCallback(async () => {
    if (!user?.tenant_id) return;
    try {
      setError(null);

      // 1. Load tenant toggle flags
      const tenantRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams([{ field: "id", value: user.tenant_id }]),
        fields: "id,payments_enabled,pix_enabled,card_enabled",
      });
      const tenants = normalizeCrudList<TenantToggles>(tenantRes.data);
      const tenant = tenants[0];
      if (tenant) {
        setPaymentsEnabled(Boolean(tenant.payments_enabled));
        setPixEnabled(Boolean(tenant.pix_enabled));
        setCardEnabled(Boolean(tenant.card_enabled));
      }

      // 2. Load gateway banks
      const banksRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "banks",
        ...buildSearchParams(
          [
            { field: "tenant_id", value: user.tenant_id },
            { field: "is_payment_gateway", value: "true" },
          ],
          { sortColumn: "name ASC" },
        ),
        auto_exclude_deleted: true,
      });
      const banks = normalizeCrudList<Bank>(banksRes.data).filter(
        (b) => !b.deleted_at,
      );
      setGatewayBanks(banks);

      // 3. Load bank accounts for gateway banks
      if (banks.length > 0) {
        const bankIds = banks.map((b) => b.id);
        const accountsRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "bank_accounts",
          ...buildSearchParams(
            [{ field: "bank_id", value: bankIds.join(","), operator: "in" }],
            { sortColumn: "account_name ASC" },
          ),
          auto_exclude_deleted: true,
        });
        const accounts = normalizeCrudList<BankAccount>(
          accountsRes.data,
        ).filter((a) => !a.deleted_at);
        setGatewayAccounts(accounts);

        // 4. Auto-select primary gateway account (or first)
        const primary = accounts.find((a) => a.is_primary_gateway);
        const target = primary ?? accounts[0] ?? null;
        if (target) {
          setSelectedAccountId(target.id);
          populateFromAccount(target);
        } else {
          setSelectedAccountId(null);
        }
      } else {
        setGatewayAccounts([]);
        setSelectedAccountId(null);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar configurações"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.tenant_id, populateFromAccount]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  /* ── Save ── */

  const handleSave = useCallback(async () => {
    if (!user?.tenant_id) return;

    // Validate
    if (paymentsEnabled && gatewayProvider === "asaas" && !walletId.trim()) {
      showAlert("Campo obrigatório", "Informe o Wallet ID do Asaas.");
      return;
    }

    if (paymentsEnabled && pixEnabled && !pixKey.trim()) {
      showAlert("Campo obrigatório", "Informe a chave PIX.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // 1. Build gateway_config from current provider fields
      const newGatewayConfig: Record<string, string> = {};
      if (gatewayProvider === "asaas") {
        newGatewayConfig.wallet_id = walletId.trim();
      } else if (gatewayProvider === "mercadopago") {
        newGatewayConfig.access_token = (
          gatewayConfig.access_token ?? ""
        ).trim();
        newGatewayConfig.public_key = (gatewayConfig.public_key ?? "").trim();
      } else if (gatewayProvider === "stripe") {
        newGatewayConfig.publishable_key = (
          gatewayConfig.publishable_key ?? ""
        ).trim();
        newGatewayConfig.secret_key = (gatewayConfig.secret_key ?? "").trim();
      } else if (gatewayProvider === "pagseguro") {
        newGatewayConfig.token = (gatewayConfig.token ?? "").trim();
        newGatewayConfig.email = (gatewayConfig.email ?? "").trim();
      }

      // 2. Update tenant toggle flags + backward-compat columns
      const tenantPayload: Record<string, unknown> = {
        id: user.tenant_id,
        payments_enabled: paymentsEnabled,
        pix_enabled: pixEnabled,
        card_enabled: cardEnabled,
        // Backward compat — keep in sync with primary gateway account
        payment_gateway_provider: gatewayProvider ?? "asaas",
        asaas_wallet_id: gatewayProvider === "asaas" ? walletId.trim() : null,
        pix_key: pixKey.trim() || null,
        pix_key_type: pixKeyType || null,
        pix_merchant_name: pixMerchantName.trim() || null,
        pix_merchant_city: pixMerchantCity.trim() || null,
      };
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "tenants",
        payload: tenantPayload,
      });

      // 3. Update selected bank account if one is selected
      if (selectedAccountId) {
        // Clear is_primary_gateway on all other accounts for this tenant
        const otherAccounts = gatewayAccounts.filter(
          (a) => a.id !== selectedAccountId && a.is_primary_gateway,
        );
        for (const other of otherAccounts) {
          await api.post(CRUD_ENDPOINT, {
            action: "update",
            table: "bank_accounts",
            payload: { id: other.id, is_primary_gateway: false },
          });
        }

        // Update the selected account
        await api.post(CRUD_ENDPOINT, {
          action: "update",
          table: "bank_accounts",
          payload: {
            id: selectedAccountId,
            is_primary_gateway: true,
            gateway_config: JSON.stringify(newGatewayConfig),
            pix_key: pixKey.trim() || null,
            pix_key_type: pixKeyType || null,
            pix_merchant_name: pixMerchantName.trim() || null,
            pix_merchant_city: pixMerchantCity.trim() || null,
          },
        });
      }

      showAlert("Sucesso", "Configurações salvas com sucesso!");
      loadData();
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao salvar"));
    } finally {
      setSaving(false);
    }
  }, [
    user?.tenant_id,
    paymentsEnabled,
    pixEnabled,
    cardEnabled,
    gatewayProvider,
    walletId,
    gatewayConfig,
    pixKey,
    pixKeyType,
    pixMerchantName,
    pixMerchantCity,
    selectedAccountId,
    gatewayAccounts,
    loadData,
  ]);

  /* ── Render helpers ── */

  const inputStyle = {
    borderWidth: 1,
    borderColor,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    backgroundColor: inputBg,
    color: textColor,
  } as const;

  const renderGatewayConfigFields = () => {
    if (!gatewayProvider) return null;

    const fields: { key: string; label: string; placeholder: string }[] = [];

    if (gatewayProvider === "asaas") {
      fields.push({
        key: "wallet_id",
        label: "Asaas Wallet ID",
        placeholder: "wal_...",
      });
    } else if (gatewayProvider === "mercadopago") {
      fields.push(
        {
          key: "access_token",
          label: "Access Token",
          placeholder: "APP_USR-...",
        },
        {
          key: "public_key",
          label: "Public Key",
          placeholder: "APP_USR-...",
        },
      );
    } else if (gatewayProvider === "stripe") {
      fields.push(
        {
          key: "publishable_key",
          label: "Publishable Key",
          placeholder: "pk_live_...",
        },
        {
          key: "secret_key",
          label: "Secret Key",
          placeholder: "sk_live_...",
        },
      );
    } else if (gatewayProvider === "pagseguro") {
      fields.push(
        { key: "token", label: "Token", placeholder: "Token PagSeguro" },
        { key: "email", label: "E-mail", placeholder: "email@pagseguro" },
      );
    }

    return fields.map((f) => (
      <View key={f.key}>
        <Text style={{ marginTop: 16, color: mutedColor, fontSize: 12 }}>
          {f.label}
        </Text>
        <TextInput
          value={
            f.key === "wallet_id" ? walletId : (gatewayConfig[f.key] ?? "")
          }
          onChangeText={(text) => {
            if (f.key === "wallet_id") {
              setWalletId(text);
            } else {
              setGatewayConfig((prev) => ({ ...prev, [f.key]: text }));
            }
          }}
          placeholder={f.placeholder}
          placeholderTextColor={mutedColor}
          secureTextEntry={f.key.includes("secret") || f.key.includes("token")}
          autoCapitalize="none"
          style={inputStyle}
        />
      </View>
    ));
  };

  /* ── Loading ── */

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  /* ═══ RENDER ═══ */

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
          Configurações de Recebimento
        </Text>
        <Text style={{ fontSize: 12, color: mutedColor, marginTop: 4 }}>
          Configure o gateway de pagamento e as opções PIX/Cartão.
        </Text>
      </View>

      {error ? (
        <Text style={{ color: tintColor, marginBottom: 12 }}>{error}</Text>
      ) : null}

      {/* ── Card: Geral ── */}
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
      </View>

      {/* ── Card: Conta Gateway Principal ── */}
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
        <Text style={{ fontWeight: "700", color: textColor }}>
          Conta Gateway Principal
        </Text>
        <Text style={{ fontSize: 12, color: mutedColor, marginTop: 4 }}>
          Selecione a conta bancária de gateway usada para processar pagamentos.
        </Text>

        {gatewayAccounts.length === 0 ? (
          <View
            style={{
              marginTop: 12,
              padding: 16,
              borderRadius: 8,
              backgroundColor: `${tintColor}0A`,
              borderWidth: 1,
              borderColor: `${tintColor}30`,
            }}
          >
            <Text
              style={{
                color: mutedColor,
                fontSize: 13,
                lineHeight: 20,
              }}
            >
              Nenhuma conta gateway encontrada.{"\n\n"}
              Para configurar:{"\n"}
              1. Vá em <Text style={{ fontWeight: "700" }}>Bancos</Text> e
              cadastre o banco marcando{" "}
              <Text style={{ fontWeight: "700" }}>
                &quot;É gateway de pagamento&quot;
              </Text>
              .{"\n"}
              2. Vá em{" "}
              <Text style={{ fontWeight: "700" }}>Contas Bancárias</Text> e crie
              uma conta vinculada a esse banco.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 12, gap: 8 }}>
            {gatewayAccounts.map((account) => {
              const bank = bankById.get(account.bank_id);
              const provider = bank?.gateway_provider ?? "";
              const providerLabel =
                GATEWAY_PROVIDER_LABELS[provider] ?? provider;
              const isSelected = account.id === selectedAccountId;

              return (
                <TouchableOpacity
                  key={account.id}
                  onPress={() => selectAccount(account.id)}
                  style={{
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? tintColor : borderColor,
                    borderRadius: 10,
                    padding: 12,
                    backgroundColor: isSelected ? `${tintColor}0A` : cardBg,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: isSelected ? tintColor : borderColor,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isSelected && (
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: tintColor,
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontWeight: "600",
                          color: textColor,
                          fontSize: 14,
                        }}
                      >
                        {bank?.name ?? "Banco"} —{" "}
                        {account.account_name ?? "Conta"}
                      </Text>
                      <Text
                        style={{
                          color: mutedColor,
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        {providerLabel}
                        {account.is_primary_gateway ? " • Principal" : ""}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Card: Configuração do Gateway ── */}
      {selectedAccount && gatewayProvider ? (
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
          <Text style={{ fontWeight: "700", color: textColor }}>
            Configuração{" "}
            {GATEWAY_PROVIDER_LABELS[gatewayProvider] ?? gatewayProvider}
          </Text>

          {renderGatewayConfigFields()}
        </View>
      ) : null}

      {/* ── Card: PIX ── */}
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
          placeholder="CPF, CNPJ, e-mail ou chave aleatória"
          placeholderTextColor={mutedColor}
          style={inputStyle}
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
          style={inputStyle}
        />

        <Text style={{ marginTop: 16, color: mutedColor, fontSize: 12 }}>
          Cidade do recebedor
        </Text>
        <TextInput
          value={pixMerchantCity}
          onChangeText={setPixMerchantCity}
          placeholder="Ex: Curitiba"
          placeholderTextColor={mutedColor}
          style={inputStyle}
        />
      </View>

      {/* ── Card: Cartão ── */}
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
        <Text style={{ fontWeight: "700", color: textColor }}>Cartão</Text>

        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: textColor }}>Cartão habilitado</Text>
          <Switch value={cardEnabled} onValueChange={setCardEnabled} />
        </View>
      </View>

      {/* ── Save button ── */}
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
          {saving ? "Salvando..." : "Salvar configurações"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
