/**
 * Gestão do Tenant — Admin screen
 *
 * Shows tenant info, plan usage (customer count vs limit),
 * billing status, and subscription management.
 * This is NOT the super-admin SaaS dashboard — it's for each tenant's own admin.
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useTenantTheme } from "@/core/context/TenantThemeContext";
import { useTenantLimits } from "@/hooks/use-tenant-limits";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    CRUD_ENDPOINT,
    aggregateCrud,
    buildSearchParams,
    normalizeCrudList,
} from "@/services/crud";
import {
    ENTERPRISE_PRICE_PER_CLIENT,
    PLAN_ORDER,
    PLAN_TIERS,
    formatPlanPrice,
} from "@/services/saas-billing";

import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TenantInfo = {
  id: string;
  company_name?: string;
  whatsapp_number?: string;
  slug?: string;
  custom_domains?: string[] | string | null;
  plan?: string;
  status?: string;
  created_at?: string;
  config?: Record<string, unknown>;
};

/**
 * Display-ready plan list.
 * Derived from PLAN_TIERS — no duplicates.
 * "trial" maps to "free" for display.
 */
const DISPLAY_PLANS = PLAN_ORDER.map((key) => {
  const tier = PLAN_TIERS[key];
  return {
    key,
    label: tier.label,
    maxCustomers: tier.maxCustomers,
    maxUsers: tier.maxUsers,
    price: formatPlanPrice(key),
    extraInfo:
      key === "enterprise"
        ? `+ R$ ${ENTERPRISE_PRICE_PER_CLIENT.toFixed(2)}/cliente extra`
        : undefined,
  };
});

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GestaoTenantScreen() {
  const { user, availableTenants } = useAuth();
  const tenantId = user?.tenant_id;
  const router = useRouter();
  const { limits: tenantLimits } = useTenantLimits();

  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");
  const { reload: reloadTheme } = useTenantTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [serviceOrderCount, setServiceOrderCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /* ── Branding state ── */
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [brandName, setBrandName] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);

  /* ── Domain / Link state ── */
  const [linkCopied, setLinkCopied] = useState(false);
  const [domainRequest, setDomainRequest] = useState("");
  const [requestingDomain, setRequestingDomain] = useState(false);
  const [domainRequestSent, setDomainRequestSent] = useState(false);

  const PRESET_COLORS = [
    "#2563eb",
    "#dc2626",
    "#ea580c",
    "#16a34a",
    "#7c3aed",
    "#db2777",
    "#0d9488",
    "#1e293b",
  ];

  const currentTenantName =
    availableTenants?.find((t) => String(t.id) === String(tenantId))
      ?.company_name ?? "Empresa";

  const loadData = useCallback(async () => {
    if (!tenantId) return;

    try {
      setError(null);

      // Fetch tenant info
      const tenantRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams([{ field: "id", value: tenantId }]),
      });
      const tenants = normalizeCrudList<TenantInfo>(tenantRes.data);
      const tenantInfo = tenants[0] ?? null;
      setTenant(tenantInfo);

      // Initialize brand state from config
      const cfg = tenantInfo?.config as Record<string, any> | undefined;
      const savedColor = cfg?.brand?.primary_color;
      const savedName = cfg?.brand?.name;
      if (savedColor && /^#[a-fA-F0-9]{6}$/.test(String(savedColor))) {
        setBrandColor(String(savedColor));
      }
      if (savedName) setBrandName(String(savedName));

      // Count customers for this tenant
      const [custAgg, userAgg, orderAgg] = await Promise.all([
        aggregateCrud<{ total: string }>(
          "customers",
          [{ function: "COUNT", field: "id", alias: "total" }],
          {
            filters: [{ field: "tenant_id", value: tenantId }],
          },
        ),
        aggregateCrud<{ total: string }>(
          "user_tenants",
          [{ function: "COUNT", field: "user_id", alias: "total" }],
          {
            filters: [{ field: "tenant_id", value: tenantId }],
          },
        ),
        aggregateCrud<{ total: string }>(
          "service_orders",
          [{ function: "COUNT", field: "id", alias: "total" }],
          {
            filters: [{ field: "tenant_id", value: tenantId }],
          },
        ),
      ]);

      setCustomerCount(Number(custAgg[0]?.total ?? 0));
      setUserCount(Number(userAgg[0]?.total ?? 0));
      setServiceOrderCount(Number(orderAgg[0]?.total ?? 0));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar dados";
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

  /* ── Save brand color ── */
  const saveBrand = useCallback(async () => {
    if (!tenantId || !tenant) return;
    setSavingBrand(true);
    try {
      // Merge into existing config
      const existingConfig =
        typeof tenant.config === "object" && tenant.config ? tenant.config : {};
      const newConfig = {
        ...existingConfig,
        brand: {
          ...((existingConfig as Record<string, any>).brand ?? {}),
          primary_color: brandColor,
          name: brandName || tenant.company_name || "",
        },
      };
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "tenants",
        payload: { id: tenantId, config: newConfig },
      });
      // Refresh theme across the app
      reloadTheme();
      Alert.alert("Sucesso", "Cor da marca atualizada!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      Alert.alert("Erro", msg);
    } finally {
      setSavingBrand(false);
    }
  }, [tenantId, tenant, brandColor, brandName, reloadTheme]);

  /* ── Tenant subdomain/link helpers ── */
  const tenantSlug = tenant?.slug ?? "";
  const tenantSubdomainUrl = tenantSlug
    ? `https://${tenantSlug}.radul.com.br`
    : "";

  const parsedCustomDomains: string[] = (() => {
    const raw = tenant?.custom_domains;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
      } catch {
        return raw.trim() ? [raw.trim()] : [];
      }
    }
    return [];
  })();

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      Alert.alert("Erro", "Não foi possível copiar o link.");
    }
  }, []);

  const handleRequestDomain = useCallback(async () => {
    const domain = domainRequest.trim().toLowerCase();
    if (!domain) {
      Alert.alert("Domínio inválido", "Informe o domínio desejado.");
      return;
    }
    // Basic domain format validation
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain)) {
      Alert.alert(
        "Formato inválido",
        "Informe um domínio válido. Ex: app.meudominio.com.br",
      );
      return;
    }
    setRequestingDomain(true);
    try {
      // Create a support request / notification to Radul admin
      await api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "notifications",
        payload: {
          tenant_id: tenantId,
          user_id: user?.id ?? null,
          type: "domain_request",
          title: "Solicitação de domínio personalizado",
          body: `Tenant "${tenant?.company_name ?? tenantId}" solicitou o domínio: ${domain}`,
          metadata: JSON.stringify({
            requested_domain: domain,
            tenant_slug: tenantSlug,
            tenant_name: tenant?.company_name,
            requested_by: user?.email ?? user?.id,
            requested_at: new Date().toISOString(),
          }),
          created_at: new Date().toISOString(),
        },
      });
      setDomainRequestSent(true);
      setDomainRequest("");
      Alert.alert(
        "Solicitação enviada!",
        `Seu pedido para o domínio "${domain}" foi registrado. Nossa equipe entrará em contato em breve.`,
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erro ao enviar solicitação";
      Alert.alert("Erro", msg);
    } finally {
      setRequestingDomain(false);
    }
  }, [domainRequest, tenantId, tenant, tenantSlug, user]);

  const openLink = useCallback((url: string) => {
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }, []);

  // Resolve plan: "trial" maps to "free" for display
  const planKey = tenant?.plan === "trial" ? "free" : (tenant?.plan ?? "free");
  const planTier = PLAN_TIERS[planKey] ?? PLAN_TIERS.free;
  const planPrice = formatPlanPrice(planKey);
  const planMaxCustomers = planTier.maxCustomers;

  // Active client usage
  const activeClientCount = tenantLimits?.currentCustomers ?? customerCount;
  const customerUsagePercent =
    tenantLimits?.usagePercent ??
    (planMaxCustomers != null && planMaxCustomers > 0
      ? Math.min((activeClientCount / planMaxCustomers) * 100, 100)
      : 0);
  const isNearLimit =
    tenantLimits?.isNearLimit ??
    (customerUsagePercent >= 80 && customerUsagePercent < 100);
  const isAtLimit = tenantLimits?.isAtLimit ?? customerUsagePercent >= 100;

  // User limits (Free = 3, paid = unlimited)
  const effectiveMaxUsers = tenantLimits?.maxUsers ?? planTier.maxUsers;
  const userUsagePercent =
    tenantLimits?.userUsagePercent ??
    (effectiveMaxUsers != null && effectiveMaxUsers > 0
      ? Math.min((userCount / effectiveMaxUsers) * 100, 100)
      : 0);
  const userIsAtLimit = tenantLimits?.isUserAtLimit ?? false;
  const userIsNearLimit = tenantLimits?.isUserNearLimit ?? false;

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: textColor }}>
          {currentTenantName}
        </Text>
        <Text style={{ fontSize: 14, color: mutedColor }}>
          Gestão da empresa e plano
        </Text>
      </View>

      {error && (
        <View
          style={{
            backgroundColor: "#fef2f2",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <Text style={{ color: "#dc2626", fontSize: 13 }}>⚠️ {error}</Text>
        </View>
      )}

      {/* Plan card */}
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 14,
          padding: 20,
          borderWidth: 1,
          borderColor,
          gap: 16,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="ribbon-outline" size={24} color={tintColor} />
            <View>
              <Text
                style={{ fontSize: 18, fontWeight: "700", color: textColor }}
              >
                Plano {planTier.label}
              </Text>
              <Text style={{ fontSize: 13, color: mutedColor }}>
                {planPrice}
              </Text>
            </View>
          </View>
          <View
            style={{
              backgroundColor: isAtLimit
                ? "#fef2f2"
                : isNearLimit
                  ? "#fffbeb"
                  : "#f0fdf4",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: isAtLimit
                  ? "#dc2626"
                  : isNearLimit
                    ? "#d97706"
                    : "#16a34a",
              }}
            >
              {tenant?.status === "active" ? "Ativo" : (tenant?.status ?? "—")}
            </Text>
          </View>
        </View>

        {/* Active client usage bar */}
        <View style={{ gap: 6 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: textColor }}>
              Clientes Ativos
            </Text>
            <Text style={{ fontSize: 13, color: mutedColor }}>
              {activeClientCount}
              {planMaxCustomers != null
                ? ` / ${planMaxCustomers}`
                : " (ilimitado)"}
            </Text>
          </View>
          {planMaxCustomers != null && (
            <View
              style={{
                height: 8,
                backgroundColor: `${borderColor}`,
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${customerUsagePercent}%`,
                  backgroundColor: isAtLimit
                    ? "#dc2626"
                    : isNearLimit
                      ? "#d97706"
                      : tintColor,
                  borderRadius: 4,
                }}
              />
            </View>
          )}
          <Text style={{ fontSize: 11, color: mutedColor }}>
            Clientes com atividade nos ultimos 90 dias. Total cadastrados:{" "}
            {customerCount}.
          </Text>
          {isAtLimit && (
            <Text style={{ fontSize: 12, color: "#dc2626" }}>
              Limite atingido! Faca upgrade para adicionar mais clientes.
            </Text>
          )}
          {isNearLimit && !isAtLimit && (
            <Text style={{ fontSize: 12, color: "#d97706" }}>
              Voce esta proximo do limite do seu plano.
            </Text>
          )}
        </View>

        {/* User count — billing-aware */}
        <View style={{ gap: 6 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: textColor }}>
              Usuarios
            </Text>
            <Text style={{ fontSize: 13, color: mutedColor }}>
              {userCount}
              {effectiveMaxUsers != null
                ? ` / ${effectiveMaxUsers}`
                : " (ilimitado)"}
            </Text>
          </View>
          {effectiveMaxUsers != null && (
            <View
              style={{
                height: 8,
                backgroundColor: `${borderColor}`,
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${userUsagePercent}%`,
                  backgroundColor: userIsAtLimit
                    ? "#dc2626"
                    : userIsNearLimit
                      ? "#d97706"
                      : tintColor,
                  borderRadius: 4,
                }}
              />
            </View>
          )}
          {userIsAtLimit && (
            <Pressable
              onPress={() =>
                router.push("/Administrador/comprar-usuarios" as any)
              }
              style={{
                backgroundColor: "#fef2f2",
                borderRadius: 8,
                padding: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 4,
              }}
            >
              <Ionicons name="cart-outline" size={16} color="#dc2626" />
              <Text style={{ fontSize: 12, color: "#dc2626", flex: 1 }}>
                Limite de usuarios atingido! Faca upgrade para o Starter.
              </Text>
              <Text
                style={{ fontSize: 12, fontWeight: "700", color: "#dc2626" }}
              >
                Upgrade
              </Text>
            </Pressable>
          )}
          {userIsNearLimit && !userIsAtLimit && (
            <Text style={{ fontSize: 12, color: "#d97706" }}>
              Proximo do limite de usuarios.
            </Text>
          )}
        </View>
      </View>

      {/* Stats grid */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <StatCard
          icon="people-outline"
          label="Clientes"
          value={String(customerCount)}
          color={tintColor}
          cardBg={cardBg}
          textColor={textColor}
          mutedColor={mutedColor}
          borderColor={borderColor}
        />
        <StatCard
          icon="person-outline"
          label="Usuários"
          value={String(userCount)}
          color="#8b5cf6"
          cardBg={cardBg}
          textColor={textColor}
          mutedColor={mutedColor}
          borderColor={borderColor}
        />
        <StatCard
          icon="briefcase-outline"
          label="Processos"
          value={String(serviceOrderCount)}
          color="#16a34a"
          cardBg={cardBg}
          textColor={textColor}
          mutedColor={mutedColor}
          borderColor={borderColor}
        />
      </View>

      {/* Tenant info */}
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 14,
          padding: 20,
          borderWidth: 1,
          borderColor,
          gap: 14,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
          Informações da Empresa
        </Text>
        <InfoRow
          label="Nome"
          value={tenant?.company_name ?? "—"}
          textColor={textColor}
          mutedColor={mutedColor}
        />
        <InfoRow
          label="WhatsApp"
          value={tenant?.whatsapp_number ?? "—"}
          textColor={textColor}
          mutedColor={mutedColor}
        />
        <InfoRow
          label="Plano"
          value={planTier.label}
          textColor={textColor}
          mutedColor={mutedColor}
        />
        <InfoRow
          label="Criado em"
          value={
            tenant?.created_at
              ? new Date(tenant.created_at).toLocaleDateString("pt-BR")
              : "—"
          }
          textColor={textColor}
          mutedColor={mutedColor}
        />
        <InfoRow
          label="ID"
          value={tenant?.id ?? "—"}
          textColor={textColor}
          mutedColor={mutedColor}
        />
      </View>

      {/* Seu Link & Domínio */}
      {tenantSlug ? (
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 14,
            padding: 20,
            borderWidth: 1,
            borderColor,
            gap: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="link-outline" size={22} color={tintColor} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
              Seu Link & Domínio
            </Text>
          </View>

          {/* Subdomain URL */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: textColor }}>
              Link do seu sistema
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Pressable
                onPress={() => openLink(tenantSubdomainUrl)}
                style={{
                  flex: 1,
                  backgroundColor: `${tintColor}10`,
                  borderWidth: 1,
                  borderColor: tintColor,
                  borderRadius: 10,
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="globe-outline" size={18} color={tintColor} />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: tintColor,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {tenantSubdomainUrl}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => copyToClipboard(tenantSubdomainUrl)}
                style={{
                  backgroundColor: linkCopied ? "#16a34a" : tintColor,
                  borderRadius: 10,
                  padding: 14,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name={linkCopied ? "checkmark" : "copy-outline"}
                  size={18}
                  color="#fff"
                />
              </Pressable>
            </View>
            <Text style={{ fontSize: 11, color: mutedColor }}>
              {linkCopied
                ? "Link copiado!"
                : "Este é o endereço exclusivo da sua empresa. Compartilhe com sua equipe e clientes."}
            </Text>
          </View>

          {/* Custom domains (if any) */}
          {parsedCustomDomains.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text
                style={{ fontSize: 13, fontWeight: "600", color: textColor }}
              >
                Domínios personalizados
              </Text>
              {parsedCustomDomains.map((domain) => (
                <View
                  key={domain}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: `${tintColor}08`,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={16}
                    color="#16a34a"
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      color: textColor,
                      flex: 1,
                    }}
                  >
                    {domain}
                  </Text>
                  <Pressable
                    onPress={() => copyToClipboard(`https://${domain}`)}
                  >
                    <Ionicons
                      name="copy-outline"
                      size={16}
                      color={mutedColor}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Request custom domain */}
          <View
            style={{
              gap: 8,
              borderTopWidth: 1,
              borderTopColor: borderColor,
              paddingTop: 16,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: textColor }}>
              Solicitar domínio personalizado
            </Text>
            <Text style={{ fontSize: 12, color: mutedColor }}>
              Quer usar seu próprio domínio (ex: app.suaempresa.com.br)?
              Solicite abaixo e nossa equipe configurará para você.
            </Text>
            {domainRequestSent ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: "#dcfce7",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                <Text style={{ fontSize: 13, color: "#15803d", flex: 1 }}>
                  Solicitação enviada! Entraremos em contato em breve.
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={domainRequest}
                  onChangeText={setDomainRequest}
                  placeholder="app.suaempresa.com.br"
                  placeholderTextColor={mutedColor}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={{
                    flex: 1,
                    backgroundColor: inputBg,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 14,
                    color: textColor,
                  }}
                />
                <Pressable
                  onPress={handleRequestDomain}
                  disabled={requestingDomain}
                  style={{
                    backgroundColor: requestingDomain ? mutedColor : tintColor,
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {requestingDomain ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text
                      style={{
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      Solicitar
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {/* Branding / Personalização */}
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 14,
          padding: 20,
          borderWidth: 1,
          borderColor,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="color-palette-outline" size={22} color={tintColor} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
            Personalização
          </Text>
        </View>

        {/* Brand name */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: textColor }}>
            Nome da marca
          </Text>
          <TextInput
            value={brandName}
            onChangeText={setBrandName}
            placeholder={tenant?.company_name ?? "Nome da empresa"}
            placeholderTextColor={mutedColor}
            style={{
              backgroundColor: inputBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 10,
              padding: 12,
              fontSize: 14,
              color: textColor,
            }}
          />
          <Text style={{ fontSize: 11, color: mutedColor }}>
            Exibido no login e cabeçalhos. Deixe vazio para usar o nome da
            empresa.
          </Text>
        </View>

        {/* Color presets */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: textColor }}>
            Cor principal
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {PRESET_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setBrandColor(c)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: c,
                  borderWidth: brandColor === c ? 3 : 1,
                  borderColor: brandColor === c ? textColor : `${c}66`,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {brandColor === c && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Custom hex */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: brandColor,
              borderWidth: 1,
              borderColor,
            }}
          />
          <TextInput
            value={brandColor}
            onChangeText={(t) => {
              const cleaned = t.startsWith("#") ? t : `#${t}`;
              if (cleaned.length <= 7) setBrandColor(cleaned);
            }}
            placeholder="#2563eb"
            placeholderTextColor={mutedColor}
            maxLength={7}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              backgroundColor: inputBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 10,
              padding: 12,
              fontSize: 14,
              color: textColor,
              fontFamily: "monospace",
            }}
          />
        </View>

        {/* Save button */}
        <Pressable
          onPress={saveBrand}
          disabled={savingBrand}
          style={{
            backgroundColor: savingBrand ? `${tintColor}66` : tintColor,
            borderRadius: 10,
            paddingVertical: 12,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
          }}
        >
          {savingBrand ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                Salvar Personalização
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Plan comparison */}
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 14,
          padding: 20,
          borderWidth: 1,
          borderColor,
          gap: 14,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
          Planos Disponíveis
        </Text>
        {DISPLAY_PLANS.map((p) => {
          const isCurrent = p.key === planKey;
          return (
            <View
              key={p.key}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
                opacity: isCurrent ? 1 : 0.7,
              }}
            >
              <View style={{ gap: 2 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: isCurrent ? "700" : "500",
                    color: textColor,
                  }}
                >
                  {p.label}
                  {isCurrent ? " ← Atual" : ""}
                </Text>
                <Text style={{ fontSize: 12, color: mutedColor }}>
                  ate{" "}
                  {p.maxCustomers != null
                    ? `${p.maxCustomers} clientes ativos`
                    : "ilimitado"}
                  {p.maxUsers != null
                    ? ` / ${p.maxUsers} usuarios`
                    : " / usuarios ilimitados"}
                </Text>
                {p.extraInfo && (
                  <Text style={{ fontSize: 11, color: tintColor }}>
                    {p.extraInfo}
                  </Text>
                )}
              </View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: isCurrent ? tintColor : mutedColor,
                }}
              >
                {p.price}
              </Text>
            </View>
          );
        })}
        <Pressable
          onPress={() => router.push("/Administrador/comprar-usuarios" as any)}
          style={{
            backgroundColor: tintColor,
            borderRadius: 10,
            paddingVertical: 12,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
            Upgrade de Plano
          </Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: mutedColor, textAlign: "center" }}>
          Escolha um plano com mais capacidade de clientes
        </Text>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper components                                                  */
/* ------------------------------------------------------------------ */

function StatCard({
  icon,
  label,
  value,
  color,
  cardBg,
  textColor,
  mutedColor,
  borderColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
  cardBg: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: cardBg,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor,
        alignItems: "center",
        gap: 6,
      }}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ fontSize: 22, fontWeight: "800", color: textColor }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: mutedColor }}>{label}</Text>
    </View>
  );
}

function InfoRow({
  label,
  value,
  textColor,
  mutedColor,
}: {
  label: string;
  value: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 13, color: mutedColor }}>{label}</Text>
      <Text
        style={{ fontSize: 13, fontWeight: "600", color: textColor }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
