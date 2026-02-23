/**
 * Marketplace Config — Admin screen
 *
 * Allows tenant admins to configure their online marketplace/store:
 * enable/disable, commission rates, PIX settings, shipping, branding.
 * All data is stored in tenants.config.marketplace JSONB.
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    getMarketplaceConfig,
    updateMarketplaceConfig,
    type MarketplaceConfig,
} from "@/services/marketplace";
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PartnerOption = {
  id: string;
  name: string;
  is_internal?: boolean;
};

const PIX_KEY_TYPES = [
  { label: "CPF", value: "cpf" },
  { label: "CNPJ", value: "cnpj" },
  { label: "E-mail", value: "email" },
  { label: "Telefone", value: "phone" },
  { label: "Chave aleatória", value: "random" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatCurrency = (v: number): string =>
  `R$ ${v.toFixed(2).replace(".", ",")}`;

const parseCurrency = (text: string): number => {
  const cleaned = text
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

const formatCep = (digits: string): string => {
  const d = digits.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MarketplaceConfigScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partners, setPartners] = useState<PartnerOption[]>([]);

  // Form fields — mirrors MarketplaceConfig
  const [enabled, setEnabled] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState("0");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [pixMerchantName, setPixMerchantName] = useState("");
  const [pixMerchantCity, setPixMerchantCity] = useState("");
  const [minOrderValue, setMinOrderValue] = useState("0");
  const [freeShippingAbove, setFreeShippingAbove] = useState("");
  const [defaultPartnerId, setDefaultPartnerId] = useState("");
  const [correiosCepOrigin, setCorreiosCepOrigin] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [aboutText, setAboutText] = useState("");

  // Store URL preview
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);

  /* ── Load config ── */
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);

      const [config, tenantRes, partnersRes] = await Promise.all([
        getMarketplaceConfig(tenantId),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tenants",
          ...buildSearchParams([{ field: "id", value: tenantId }]),
          fields: ["id", "slug"],
        }),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "partners",
          ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
            autoExcludeDeleted: true,
          }),
        }),
      ]);

      // Populate form
      setEnabled(config.enabled);
      setCommissionPercent(String(config.commission_percent ?? 0));
      setPixKey(config.pix_key ?? "");
      setPixKeyType(config.pix_key_type ?? "cpf");
      setPixMerchantName(config.pix_merchant_name ?? "");
      setPixMerchantCity(config.pix_merchant_city ?? "");
      setMinOrderValue(String(config.min_order_value ?? 0));
      setFreeShippingAbove(
        config.free_shipping_above != null
          ? String(config.free_shipping_above)
          : "",
      );
      setDefaultPartnerId(config.default_partner_id ?? "");
      setCorreiosCepOrigin(config.correios_cep_origin ?? "");
      setBannerUrl(config.banner_url ?? "");
      setAboutText(config.about_text ?? "");

      // Tenant slug
      const tenants = normalizeCrudList<{ slug?: string }>(tenantRes.data);
      setTenantSlug(tenants[0]?.slug ?? null);

      // Partners list
      const partnerList = normalizeCrudList<PartnerOption>(
        partnersRes.data,
      ).filter((p) => !!(p.id && p.name));
      setPartners(partnerList);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar config";
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

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    if (!tenantId) return;

    // Validate
    const commission = parseFloat(commissionPercent);
    if (isNaN(commission) || commission < 0 || commission > 100) {
      Alert.alert("Erro", "Comissão deve ser entre 0% e 100%.");
      return;
    }

    if (enabled && !pixKey.trim()) {
      Alert.alert("Erro", "Informe a chave PIX para receber pagamentos.");
      return;
    }

    const cepDigits = correiosCepOrigin.replace(/\D/g, "");
    if (cepDigits && cepDigits.length !== 8) {
      Alert.alert("Erro", "CEP de origem deve ter 8 dígitos.");
      return;
    }

    setSaving(true);
    try {
      const updates: Partial<MarketplaceConfig> = {
        enabled,
        commission_percent: commission,
        pix_key: pixKey.trim() || null,
        pix_key_type: pixKey.trim() ? pixKeyType : null,
        pix_merchant_name: pixMerchantName.trim() || null,
        pix_merchant_city: pixMerchantCity.trim() || null,
        min_order_value: parseCurrency(minOrderValue),
        free_shipping_above: freeShippingAbove.trim()
          ? parseCurrency(freeShippingAbove)
          : null,
        default_partner_id: defaultPartnerId || null,
        correios_cep_origin: cepDigits || null,
        banner_url: bannerUrl.trim() || null,
        about_text: aboutText.trim() || null,
      };

      await updateMarketplaceConfig(tenantId, updates);
      Alert.alert("Sucesso", "Configuração do marketplace salva!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      Alert.alert("Erro", msg);
    } finally {
      setSaving(false);
    }
  }, [
    tenantId,
    enabled,
    commissionPercent,
    pixKey,
    pixKeyType,
    pixMerchantName,
    pixMerchantCity,
    minOrderValue,
    freeShippingAbove,
    defaultPartnerId,
    correiosCepOrigin,
    bannerUrl,
    aboutText,
  ]);

  /* ── Store URL ── */
  const storeUrl = useMemo(() => {
    if (!tenantSlug) return null;
    return `https://${tenantSlug}.radul.com.br/loja`;
  }, [tenantSlug]);

  /* ── Render helpers ── */

  const SectionHeader = ({
    icon,
    title,
    subtitle,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
  }) => (
    <View style={{ gap: 2, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={icon as any} size={18} color={tintColor} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text style={{ fontSize: 12, color: mutedColor, marginLeft: 26 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  const FieldLabel = ({
    label,
    required,
  }: {
    label: string;
    required?: boolean;
  }) => (
    <Text style={{ fontSize: 13, fontWeight: "600", color: mutedColor }}>
      {label}
      {required ? " *" : ""}
    </Text>
  );

  const inputStyle = {
    borderWidth: 1,
    borderColor,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    backgroundColor: inputBg,
    color: textColor,
    fontSize: 14,
    marginTop: 4,
  } as const;

  const cardStyle = {
    backgroundColor: cardBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor,
    gap: 14,
  } as const;

  /* ── Loading ── */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  /* ── Main ── */
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 60 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: textColor }}>
          Marketplace
        </Text>
        <Text style={{ fontSize: 14, color: mutedColor }}>
          Configure sua loja online para vender produtos e serviços
        </Text>
      </View>

      {error ? (
        <View
          style={{
            backgroundColor: "#fef2f2",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <Text style={{ color: "#dc2626", fontSize: 13 }}>⚠️ {error}</Text>
        </View>
      ) : null}

      {/* ═══ Enable toggle ═══ */}
      <View style={cardStyle}>
        <SectionHeader
          icon="storefront-outline"
          title="Status da Loja"
          subtitle="Ative para exibir sua loja online ao público"
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: textColor }}>
              Loja habilitada
            </Text>
            <Text style={{ fontSize: 12, color: mutedColor }}>
              {enabled
                ? "Sua loja está visível para o público"
                : "Sua loja está oculta"}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: borderColor, true: tintColor + "66" }}
            thumbColor={enabled ? tintColor : mutedColor}
          />
        </View>

        {/* Store URL preview */}
        {storeUrl && enabled ? (
          <View
            style={{
              backgroundColor: tintColor + "10",
              borderRadius: 8,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="link-outline" size={16} color={tintColor} />
            <Text
              style={{ fontSize: 12, color: tintColor, flex: 1 }}
              numberOfLines={1}
              selectable
            >
              {storeUrl}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ═══ Payment / PIX ═══ */}
      <View style={cardStyle}>
        <SectionHeader
          icon="card-outline"
          title="Pagamento (PIX)"
          subtitle="Dados do PIX para recebimento dos pedidos"
        />

        <View style={{ gap: 4 }}>
          <FieldLabel label="Tipo da chave" required />
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 4,
            }}
          >
            {PIX_KEY_TYPES.map((opt) => {
              const selected = pixKeyType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setPixKeyType(opt.value)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selected ? tintColor : borderColor,
                    backgroundColor: selected ? tintColor + "15" : inputBg,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: selected ? "700" : "500",
                      color: selected ? tintColor : textColor,
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <FieldLabel label="Chave PIX" required />
          <TextInput
            value={pixKey}
            onChangeText={setPixKey}
            placeholder="Sua chave PIX"
            placeholderTextColor={mutedColor}
            autoCapitalize="none"
            style={inputStyle}
          />
        </View>

        <View style={{ gap: 4 }}>
          <FieldLabel label="Nome do recebedor" />
          <TextInput
            value={pixMerchantName}
            onChangeText={setPixMerchantName}
            placeholder="Nome que aparece no PIX"
            placeholderTextColor={mutedColor}
            style={inputStyle}
          />
        </View>

        <View style={{ gap: 4 }}>
          <FieldLabel label="Cidade do recebedor" />
          <TextInput
            value={pixMerchantCity}
            onChangeText={setPixMerchantCity}
            placeholder="Ex: Curitiba"
            placeholderTextColor={mutedColor}
            style={inputStyle}
          />
        </View>
      </View>

      {/* ═══ Commission ═══ */}
      <View style={cardStyle}>
        <SectionHeader
          icon="trending-up-outline"
          title="Comissão"
          subtitle="Percentual retido pelo tenant sobre vendas de parceiros"
        />

        <View style={{ gap: 4 }}>
          <FieldLabel label="Comissão (%)" />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={commissionPercent}
              onChangeText={(t) =>
                setCommissionPercent(t.replace(/[^\d.,]/g, ""))
              }
              placeholder="0"
              placeholderTextColor={mutedColor}
              keyboardType="decimal-pad"
              style={{ ...inputStyle, flex: 1 }}
            />
            <Text style={{ fontSize: 16, fontWeight: "600", color: textColor }}>
              %
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
            O restante vai para o parceiro que vendeu o produto
          </Text>
        </View>

        <View style={{ gap: 4 }}>
          <FieldLabel label="Parceiro padrão" />
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 4,
            }}
          >
            <TouchableOpacity
              onPress={() => setDefaultPartnerId("")}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: !defaultPartnerId ? tintColor : borderColor,
                backgroundColor: !defaultPartnerId ? tintColor + "15" : inputBg,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: !defaultPartnerId ? "700" : "500",
                  color: !defaultPartnerId ? tintColor : textColor,
                }}
              >
                Nenhum
              </Text>
            </TouchableOpacity>
            {partners.map((p) => {
              const selected = defaultPartnerId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setDefaultPartnerId(p.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selected ? tintColor : borderColor,
                    backgroundColor: selected ? tintColor + "15" : inputBg,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: selected ? "700" : "500",
                      color: selected ? tintColor : textColor,
                    }}
                  >
                    {p.name}
                    {p.is_internal ? " (interno)" : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
            Parceiro associado às vendas quando nenhum parceiro foi indicado
          </Text>
        </View>
      </View>

      {/* ═══ Shipping ═══ */}
      <View style={cardStyle}>
        <SectionHeader
          icon="airplane-outline"
          title="Frete"
          subtitle="Configurações do Correios e frete grátis"
        />

        <View style={{ gap: 4 }}>
          <FieldLabel label="CEP de origem" />
          <TextInput
            value={formatCep(correiosCepOrigin)}
            onChangeText={(t) =>
              setCorreiosCepOrigin(t.replace(/\D/g, "").slice(0, 8))
            }
            placeholder="00000-000"
            placeholderTextColor={mutedColor}
            keyboardType="number-pad"
            maxLength={9}
            style={inputStyle}
          />
          <Text style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
            CEP do endereço de envio dos produtos (origem Correios)
          </Text>
        </View>

        <View style={{ gap: 4 }}>
          <FieldLabel label="Frete grátis acima de (R$)" />
          <TextInput
            value={freeShippingAbove}
            onChangeText={(t) =>
              setFreeShippingAbove(t.replace(/[^\d.,]/g, ""))
            }
            placeholder="Deixe vazio para desabilitar"
            placeholderTextColor={mutedColor}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
          {freeShippingAbove.trim() ? (
            <Text style={{ fontSize: 11, color: tintColor, marginTop: 2 }}>
              Frete grátis para pedidos acima de{" "}
              {formatCurrency(parseCurrency(freeShippingAbove))}
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
              Sem frete grátis configurado
            </Text>
          )}
        </View>
      </View>

      {/* ═══ Order Rules ═══ */}
      <View style={cardStyle}>
        <SectionHeader
          icon="receipt-outline"
          title="Regras do Pedido"
          subtitle="Valor mínimo e condições para compras"
        />

        <View style={{ gap: 4 }}>
          <FieldLabel label="Valor mínimo do pedido (R$)" />
          <TextInput
            value={minOrderValue}
            onChangeText={(t) => setMinOrderValue(t.replace(/[^\d.,]/g, ""))}
            placeholder="0"
            placeholderTextColor={mutedColor}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
          {parseCurrency(minOrderValue) > 0 ? (
            <Text style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
              Pedidos abaixo de {formatCurrency(parseCurrency(minOrderValue))}{" "}
              serão bloqueados
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
              Sem valor mínimo
            </Text>
          )}
        </View>
      </View>

      {/* ═══ Branding ═══ */}
      <View style={cardStyle}>
        <SectionHeader
          icon="brush-outline"
          title="Aparência da Loja"
          subtitle="Banner e texto sobre a empresa"
        />

        <View style={{ gap: 4 }}>
          <FieldLabel label="URL do banner" />
          <TextInput
            value={bannerUrl}
            onChangeText={setBannerUrl}
            placeholder="https://..."
            placeholderTextColor={mutedColor}
            autoCapitalize="none"
            keyboardType="url"
            style={inputStyle}
          />
          <Text style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
            Imagem exibida no topo da loja (recomendado: 1200×400px)
          </Text>
        </View>

        <View style={{ gap: 4 }}>
          <FieldLabel label="Sobre a empresa" />
          <TextInput
            value={aboutText}
            onChangeText={setAboutText}
            placeholder="Descreva sua empresa para seus clientes..."
            placeholderTextColor={mutedColor}
            multiline
            numberOfLines={4}
            style={{
              ...inputStyle,
              minHeight: 90,
              textAlignVertical: "top",
            }}
          />
        </View>
      </View>

      {/* ═══ Save button ═══ */}
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
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="save-outline" size={18} color="#fff" />
        )}
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Text>
      </TouchableOpacity>

      {/* Spacer for bottom safe area */}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}
