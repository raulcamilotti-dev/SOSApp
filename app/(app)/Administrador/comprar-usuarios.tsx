/**
 * Upgrade de Plano / Comprar Clientes Extras — Self-service screen
 *
 * Allows a tenant admin to:
 * 1. See current plan and usage
 * 2. Choose a higher tier → generates monthly PIX
 * 3. (Enterprise only) Buy extra client slots at R$ 0,20/client/month
 *
 * The purchase creates an invoice + accounts_receivable on the Radul tenant.
 */

import { getApiErrorMessage } from "@/services/api";

import { useAuth } from "@/core/auth/AuthContext";
import { useTenantLimits } from "@/hooks/use-tenant-limits";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    ENTERPRISE_PRICE_PER_CLIENT,
    PLAN_ORDER,
    PLAN_TIERS,
    formatPlanPrice,
    purchaseExtraClients,
    subscribeToPlan,
    type PurchaseSeatsResult,
} from "@/services/saas-billing";
import { Ionicons } from "@expo/vector-icons";
import * as ExpoClipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatCurrency = (value: number): string => {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const copyToClipboard = async (text: string) => {
  if (Platform.OS === "web" && navigator?.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await ExpoClipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function UpgradePlanoScreen() {
  const router = useRouter();
  const { user, availableTenants } = useAuth();
  const tenantId = user?.tenant_id;
  const { limits, loading: limitsLoading } = useTenantLimits();

  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [extraClientQty, setExtraClientQty] = useState(100);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseResult, setPurchaseResult] =
    useState<PurchaseSeatsResult | null>(null);
  const [copied, setCopied] = useState(false);

  const currentPlan = limits?.plan ?? "free";
  const currentPlanKey = currentPlan === "trial" ? "free" : currentPlan;
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlanKey);
  const isEnterprise = currentPlanKey === "enterprise";

  const tenantName =
    availableTenants?.find((t) => String(t.id) === String(tenantId))
      ?.company_name ?? "Empresa";

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

  const handleSubscribe = useCallback(async () => {
    if (!tenantId || !selectedPlan) return;
    setPurchasing(true);
    try {
      const result = await subscribeToPlan(tenantId, selectedPlan);
      setPurchaseResult(result);
      if (!result.success) {
        const msg = result.error ?? "Erro ao processar assinatura";
        if (Platform.OS === "web") window.alert?.(msg);
        else Alert.alert("Erro", msg);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, "Erro desconhecido");
      if (Platform.OS === "web") window.alert?.(msg);
      else Alert.alert("Erro", msg);
    } finally {
      setPurchasing(false);
    }
  }, [tenantId, selectedPlan]);

  const handleBuyExtraClients = useCallback(async () => {
    if (!tenantId) return;
    setPurchasing(true);
    try {
      const result = await purchaseExtraClients(tenantId, extraClientQty);
      setPurchaseResult(result);
      if (!result.success) {
        const msg = result.error ?? "Erro ao processar compra";
        if (Platform.OS === "web") window.alert?.(msg);
        else Alert.alert("Erro", msg);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, "Erro desconhecido");
      if (Platform.OS === "web") window.alert?.(msg);
      else Alert.alert("Erro", msg);
    } finally {
      setPurchasing(false);
    }
  }, [tenantId, extraClientQty]);

  const handleCopyPix = useCallback(async () => {
    if (!purchaseResult?.pixPayload) return;
    const ok = await copyToClipboard(purchaseResult.pixPayload);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }, [purchaseResult]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  /* ---------------------------------------------------------------- */
  /*  Loading                                                          */
  /* ---------------------------------------------------------------- */

  if (limitsLoading) {
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

  /* ---------------------------------------------------------------- */
  /*  Success State — Show PIX QR                                      */
  /* ---------------------------------------------------------------- */

  if (purchaseResult?.success) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{
          padding: 20,
          gap: 20,
          paddingBottom: 40,
          alignItems: "center",
        }}
      >
        {/* Success header */}
        <View style={{ alignItems: "center", gap: 8, paddingTop: 20 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: "#dcfce7",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="checkmark-circle" size={36} color="#16a34a" />
          </View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: textColor,
              textAlign: "center",
            }}
          >
            Pedido Gerado!
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: mutedColor,
              textAlign: "center",
              maxWidth: 300,
            }}
          >
            Pague a 1ª mensalidade via PIX para ativar seu novo plano
          </Text>
        </View>

        {/* Amount card */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 14,
            padding: 20,
            borderWidth: 1,
            borderColor,
            width: "100%",
            maxWidth: 400,
            alignItems: "center",
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 14, color: mutedColor }}>Valor mensal</Text>
          <Text style={{ fontSize: 32, fontWeight: "800", color: tintColor }}>
            {formatCurrency(purchaseResult.totalAmount)}
          </Text>
        </View>

        {/* PIX QR Code */}
        {purchaseResult.pixQrBase64 && (
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 14,
              padding: 20,
              borderWidth: 1,
              borderColor,
              width: "100%",
              maxWidth: 400,
              alignItems: "center",
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#1a1a1a" }}>
              QR Code PIX
            </Text>
            <Image
              source={{ uri: purchaseResult.pixQrBase64 }}
              style={{ width: 240, height: 240, borderRadius: 8 }}
              resizeMode="contain"
            />
            <Text style={{ fontSize: 11, color: "#666", textAlign: "center" }}>
              Escaneie o QR Code com o app do seu banco
            </Text>
          </View>
        )}

        {/* PIX Copy-Paste */}
        {purchaseResult.pixPayload && (
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 14,
              padding: 20,
              borderWidth: 1,
              borderColor,
              width: "100%",
              maxWidth: 400,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: textColor }}>
              PIX Copia e Cola
            </Text>
            <View
              style={{
                backgroundColor: bg,
                borderRadius: 8,
                padding: 12,
                borderWidth: 1,
                borderColor,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: mutedColor,
                  fontFamily: Platform.OS === "web" ? "monospace" : undefined,
                }}
                numberOfLines={3}
              >
                {purchaseResult.pixPayload}
              </Text>
            </View>
            <Pressable
              onPress={handleCopyPix}
              style={{
                backgroundColor: copied ? "#16a34a" : tintColor,
                borderRadius: 10,
                paddingVertical: 12,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={18}
                color="#fff"
              />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                {copied ? "Copiado!" : "Copiar Código PIX"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Info */}
        <View
          style={{
            backgroundColor: "#eff6ff",
            borderRadius: 10,
            padding: 14,
            width: "100%",
            maxWidth: 400,
          }}
        >
          <Text style={{ fontSize: 12, color: "#1e40af", lineHeight: 18 }}>
            💡 Após o pagamento ser confirmado, seu plano será ativado
            automaticamente. O pagamento pode levar alguns minutos para ser
            processado.
          </Text>
        </View>

        {/* Back button */}
        <Pressable
          onPress={handleBack}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 10,
            borderWidth: 1,
            borderColor,
          }}
        >
          <Text style={{ color: textColor, fontWeight: "600" }}>
            ← Voltar para Gestão
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Main Form                                                        */
  /* ---------------------------------------------------------------- */

  // Plans available for upgrade (higher tiers only, exclude enterprise = sob consulta)
  const upgradePlans = PLAN_ORDER.filter((key) => {
    const tier = PLAN_TIERS[key];
    if (key === currentPlanKey) return false;
    if (key === "free") return false;
    if (PLAN_ORDER.indexOf(key) <= currentPlanIndex) return false;
    if (tier.monthlyPrice == null) return false; // Enterprise = sob consulta
    return true;
  });

  const selectedTier = selectedPlan ? PLAN_TIERS[selectedPlan] : null;
  const totalPlanPrice = selectedTier?.monthlyPrice ?? 0;
  const extraClientTotal = Number(
    (ENTERPRISE_PRICE_PER_CLIENT * extraClientQty).toFixed(2),
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
    >
      {/* Header */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: textColor }}>
          Upgrade de Plano
        </Text>
        <Text style={{ fontSize: 14, color: mutedColor }}>
          Amplie a capacidade de clientes — {tenantName}
        </Text>
      </View>

      {/* Current usage card */}
      {limits && (
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 14,
            padding: 20,
            borderWidth: 1,
            borderColor,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
            Plano Atual
          </Text>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ fontSize: 13, color: mutedColor }}>Plano</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: textColor }}>
              {PLAN_TIERS[currentPlanKey]?.label ?? currentPlanKey}{" "}
              <Text style={{ color: mutedColor, fontWeight: "400" }}>
                ({formatPlanPrice(currentPlanKey)})
              </Text>
            </Text>
          </View>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ fontSize: 13, color: mutedColor }}>Clientes</Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: limits.isAtLimit ? "#dc2626" : textColor,
              }}
            >
              {limits.currentCustomers} / {limits.effectiveMaxCustomers ?? "∞"}
            </Text>
          </View>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ fontSize: 13, color: mutedColor }}>Usuários</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: textColor }}>
              {limits.currentUsers} (ilimitado)
            </Text>
          </View>
          {/* Usage bar */}
          {limits.effectiveMaxCustomers != null && (
            <View style={{ gap: 4 }}>
              <View
                style={{
                  height: 8,
                  backgroundColor: borderColor,
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${limits.usagePercent}%`,
                    backgroundColor: limits.isAtLimit
                      ? "#dc2626"
                      : limits.isNearLimit
                        ? "#d97706"
                        : tintColor,
                    borderRadius: 4,
                  }}
                />
              </View>
              {limits.isAtLimit && (
                <Text style={{ fontSize: 12, color: "#dc2626" }}>
                  ⚠️ Limite de clientes atingido! Faça upgrade para continuar
                  adicionando.
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Plan selection */}
      {upgradePlans.length > 0 && (
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
          <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
            Escolha seu novo plano
          </Text>

          {upgradePlans.map((planKey) => {
            const tier = PLAN_TIERS[planKey];
            const isSelected = selectedPlan === planKey;
            const isSuggested = limits?.suggestedUpgrade === planKey;

            return (
              <Pressable
                key={planKey}
                onPress={() => setSelectedPlan(isSelected ? null : planKey)}
                style={{
                  borderWidth: 2,
                  borderColor: isSelected
                    ? tintColor
                    : isSuggested
                      ? "#d97706"
                      : borderColor,
                  borderRadius: 12,
                  padding: 16,
                  backgroundColor: isSelected ? `${tintColor}10` : bg,
                  gap: 6,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name={isSelected ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={isSelected ? tintColor : mutedColor}
                    />
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: textColor,
                      }}
                    >
                      {tier.label}
                    </Text>
                    {isSuggested && (
                      <View
                        style={{
                          backgroundColor: "#fef3c7",
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 10,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            color: "#92400e",
                          }}
                        >
                          Recomendado
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "800",
                      color: isSelected ? tintColor : textColor,
                    }}
                  >
                    {formatPlanPrice(planKey)}
                  </Text>
                </View>
                <Text
                  style={{ fontSize: 13, color: mutedColor, marginLeft: 28 }}
                >
                  até {tier.maxCustomers?.toLocaleString("pt-BR") ?? "∞"}{" "}
                  clientes
                </Text>
              </Pressable>
            );
          })}

          {/* Subscribe button */}
          {selectedPlan && (
            <Pressable
              onPress={handleSubscribe}
              disabled={purchasing}
              style={{
                backgroundColor: purchasing ? borderColor : tintColor,
                borderRadius: 12,
                paddingVertical: 16,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                marginTop: 4,
              }}
            >
              {purchasing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons
                    name="arrow-up-circle-outline"
                    size={20}
                    color="#fff"
                  />
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "700",
                      fontSize: 16,
                    }}
                  >
                    Gerar PIX — {formatCurrency(totalPlanPrice)}/mês
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      )}

      {/* Enterprise: already at top tier */}
      {currentPlanKey === "enterprise" && (
        <View
          style={{
            backgroundColor: "#f0fdf4",
            borderRadius: 10,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color="#16a34a" />
          <Text style={{ fontSize: 13, color: "#166534", flex: 1 }}>
            Você já está no plano Enterprise — o mais completo!
          </Text>
        </View>
      )}

      {/* Enterprise extra clients */}
      {isEnterprise && (
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
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: textColor }}>
              Comprar Clientes Extras
            </Text>
            <Text style={{ fontSize: 13, color: mutedColor }}>
              R$ {ENTERPRISE_PRICE_PER_CLIENT.toFixed(2)} por cliente
              adicional/mês
            </Text>
          </View>

          {/* Quantity selector */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
            }}
          >
            <Pressable
              onPress={() => setExtraClientQty((q) => Math.max(10, q - 50))}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: extraClientQty <= 10 ? borderColor : tintColor,
                justifyContent: "center",
                alignItems: "center",
              }}
              disabled={extraClientQty <= 10}
            >
              <Ionicons name="remove" size={22} color="#fff" />
            </Pressable>

            <View style={{ alignItems: "center" }}>
              <Text
                style={{ fontSize: 40, fontWeight: "800", color: textColor }}
              >
                {extraClientQty}
              </Text>
              <Text style={{ fontSize: 12, color: mutedColor }}>
                cliente(s)
              </Text>
            </View>

            <Pressable
              onPress={() => setExtraClientQty((q) => Math.min(10000, q + 50))}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor:
                  extraClientQty >= 10000 ? borderColor : tintColor,
                justifyContent: "center",
                alignItems: "center",
              }}
              disabled={extraClientQty >= 10000}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
          </View>

          {/* Quick select */}
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {[50, 100, 500, 1000, 5000].map((n) => (
              <Pressable
                key={n}
                onPress={() => setExtraClientQty(n)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: extraClientQty === n ? tintColor : bg,
                  borderWidth: 1,
                  borderColor: extraClientQty === n ? tintColor : borderColor,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: extraClientQty === n ? "#fff" : textColor,
                  }}
                >
                  {n.toLocaleString("pt-BR")}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Price summary */}
          <View
            style={{
              gap: 8,
              borderTopWidth: 1,
              borderTopColor: borderColor,
              paddingTop: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontSize: 13, color: mutedColor }}>
                {extraClientQty}x cliente @ R${" "}
                {ENTERPRISE_PRICE_PER_CLIENT.toFixed(2)}
              </Text>
              <Text style={{ fontSize: 13, color: textColor }}>
                {formatCurrency(extraClientTotal)}/mês
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: textColor,
                }}
              >
                Total/mês
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: tintColor,
                }}
              >
                {formatCurrency(extraClientTotal)}
              </Text>
            </View>
          </View>

          {/* Buy button */}
          <Pressable
            onPress={handleBuyExtraClients}
            disabled={purchasing}
            style={{
              backgroundColor: purchasing ? borderColor : tintColor,
              borderRadius: 12,
              paddingVertical: 16,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="cart-outline" size={20} color="#fff" />
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  Gerar PIX — {formatCurrency(extraClientTotal)}/mês
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {/* No upgrade available + not enterprise */}
      {upgradePlans.length === 0 && !isEnterprise && (
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 14,
            padding: 20,
            borderWidth: 1,
            borderColor,
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            style={{ fontSize: 14, color: mutedColor, textAlign: "center" }}
          >
            Para o plano Enterprise, entre em contato:
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "700", color: tintColor }}>
            contato@radul.com.br
          </Text>
        </View>
      )}

      {/* Info banner */}
      <View
        style={{
          backgroundColor: "#f0fdf4",
          borderRadius: 10,
          padding: 14,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#16a34a" />
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#16a34a" }}>
            Pagamento Mensal Seguro via PIX
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: "#166534", lineHeight: 18 }}>
          • Ativação automática após confirmação do pagamento{"\n"}• Cobrança
          mensal recorrente — próximo mês gerado automaticamente
          {"\n"}• Usuários ilimitados em todos os planos pagos{"\n"}• Downgrade
          disponível ao final do ciclo
        </Text>
      </View>
    </ScrollView>
  );
}
