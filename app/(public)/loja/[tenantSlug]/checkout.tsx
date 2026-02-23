/**
 * PUBLIC CHECKOUT — /loja/:tenantSlug/checkout
 *
 * Multi-step checkout flow for the tenant's online marketplace:
 *   Step 1 — Shipping address (CEP auto-fill + manual fields)
 *   Step 2 — Shipping method selection (Correios rates)
 *   Step 3 — Customer identification (pre-fill from auth user)
 *   Step 4 — Order review & confirmation
 *   Step 5 — PIX payment (QR code + copy-paste)
 *
 * Authentication is REQUIRED.  If the user is not logged in,
 * a gate screen is shown with a login redirect.
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useCepAutoFill } from "@/hooks/use-cep-autofill";
import { useMarketplaceTenant } from "@/hooks/use-marketplace-tenant";
import { useShoppingCart } from "@/hooks/use-shopping-cart";
import {
    createOnlineOrder,
    type OnlineOrderResult,
} from "@/services/marketplace-checkout";
import {
    aggregatePackageDimensions,
    calculateShippingRates,
    checkFreeShipping,
    formatShippingRate,
    getCheapestRate,
    type ShippingQuoteResult,
    type ShippingRate,
} from "@/services/shipping";
import type { CartItem } from "@/services/shopping-cart";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";

/* ── Constants ──────────────────────────────────────────────────── */
const DEFAULT_PRIMARY = "#2563eb";
const BG_COLOR = "#ffffff";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const HERO_BG = "#f8fafc";
const SUCCESS_COLOR = "#16a34a";
const ERROR_COLOR = "#ef4444";

const CARD_SHADOW = Platform.select({
  web: {
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  },
  default: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
});

type CheckoutStep = 1 | 2 | 3 | 4 | 5;

/* ── Helpers ────────────────────────────────────────────────────── */

const formatCurrency = (value: number): string =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const navigateTo = (url: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.href = url;
  }
};

const formatCep = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const maskCpf = (raw: string): string => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const maskPhone = (raw: string): string => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
};

/* ═══════════════════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════════════════ */

export default function CheckoutScreen() {
  const { tenantSlug } = useLocalSearchParams<{ tenantSlug?: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  /* ── Mode-aware navigation URLs ── */
  const storeBase = tenantSlug ? `/loja/${tenantSlug}` : "/loja";
  const cartUrl = `${storeBase}/cart`;

  /* ── Data hooks ── */
  const { user, loading: authLoading } = useAuth();
  const marketplace = useMarketplaceTenant(tenantSlug);
  const cart = useShoppingCart(marketplace.tenant?.tenant_id ?? null);

  /* ── Derived ── */
  const primaryColor = marketplace.tenant?.primary_color || DEFAULT_PRIMARY;
  const brandName =
    marketplace.tenant?.brand_name ||
    marketplace.tenant?.company_name ||
    "Loja";
  const tenantId = marketplace.tenant?.tenant_id ?? "";
  const config = marketplace.config;
  const isLoading = marketplace.loading || cart.loading || authLoading;
  const isEmpty = cart.isReady && cart.items.length === 0;
  const isLoggedIn = !!user?.id;

  /* ── Step state ── */
  const [step, setStep] = useState<CheckoutStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<OnlineOrderResult | null>(
    null,
  );
  const [pixCopied, setPixCopied] = useState(false);

  /* ── Address form ── */
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [hasPortaria, setHasPortaria] = useState(false);

  const cepAutoFill = useCepAutoFill({
    onSuccess: (addr) => {
      setStreet(addr.street ?? "");
      setNeighborhood(addr.neighborhood ?? "");
      setCity(addr.city ?? "");
      setAddressState(addr.state ?? "");
    },
  });

  /* ── Shipping state ── */
  const [shippingQuote, setShippingQuote] =
    useState<ShippingQuoteResult | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null);

  /* ── Customer info ── */
  const [custName, setCustName] = useState("");
  const [custCpf, setCustCpf] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");

  /* Pre-fill customer info from auth user */
  useEffect(() => {
    if (!user) return;
    if (!custName && (user.fullname || user.name)) {
      setCustName(user.fullname || user.name || "");
    }
    if (!custCpf && user.cpf) {
      setCustCpf(user.cpf);
    }
    if (!custEmail && user.email) {
      setCustEmail(user.email);
    }
    if (!custPhone && (user.phone || user.telefone)) {
      setCustPhone(user.phone || user.telefone || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ── Free shipping check ── */
  const freeShippingApplies = useMemo(() => {
    if (!config?.free_shipping_above) return false;
    return checkFreeShipping(cart.subtotal, config.free_shipping_above);
  }, [cart.subtotal, config?.free_shipping_above]);

  const effectiveShippingCost = useMemo(() => {
    if (freeShippingApplies) return 0;
    return selectedRate?.value ?? 0;
  }, [freeShippingApplies, selectedRate?.value]);

  const orderTotal = useMemo(
    () => cart.subtotal + effectiveShippingCost,
    [cart.subtotal, effectiveShippingCost],
  );

  /* ── Shipping calculation ── */
  const handleCalculateShipping = useCallback(async () => {
    const cepDigits = cepAutoFill.cep.replace(/\D/g, "");
    if (cepDigits.length !== 8) return;
    if (!tenantId) return;

    setShippingLoading(true);
    setShippingError(null);
    setSelectedRate(null);

    try {
      const dimensions = aggregatePackageDimensions(
        cart.items.map((item: CartItem) => ({
          quantity: item.quantity,
        })),
      );

      const quote = await calculateShippingRates({
        tenantId,
        originCep: config?.correios_cep_origin ?? undefined,
        destinationCep: cepDigits,
        weightGrams: dimensions.weightGrams,
        lengthCm: dimensions.lengthCm,
        widthCm: dimensions.widthCm,
        heightCm: dimensions.heightCm,
      });

      setShippingQuote(quote);

      const validRates = quote.rates.filter((r) => !r.error);
      if (validRates.length > 0) {
        const cheapest = getCheapestRate(validRates);
        setSelectedRate(cheapest);
      } else {
        setShippingError("Nenhuma opção de frete disponível para este CEP.");
      }
    } catch {
      setShippingError("Falha ao calcular frete. Tente novamente.");
    } finally {
      setShippingLoading(false);
    }
  }, [cepAutoFill.cep, tenantId, cart.items, config?.correios_cep_origin]);

  /* ── Validation per step ── */
  const canProceedStep1 = useMemo(() => {
    const cepDigits = cepAutoFill.cep.replace(/\D/g, "");
    return (
      cepDigits.length === 8 &&
      street.trim().length > 0 &&
      number.trim().length > 0 &&
      neighborhood.trim().length > 0 &&
      city.trim().length > 0 &&
      addressState.trim().length > 0
    );
  }, [cepAutoFill.cep, street, number, neighborhood, city, addressState]);

  const canProceedStep2 = useMemo(() => {
    return freeShippingApplies || selectedRate !== null;
  }, [freeShippingApplies, selectedRate]);

  const canProceedStep3 = useMemo(() => {
    return (
      custName.trim().length >= 2 &&
      custCpf.replace(/\D/g, "").length === 11 &&
      custEmail.includes("@") &&
      custPhone.replace(/\D/g, "").length >= 10
    );
  }, [custName, custCpf, custEmail, custPhone]);

  /* ── Submit order ── */
  const handleSubmitOrder = useCallback(async () => {
    if (!user?.id || !tenantId) return;

    setSubmitting(true);
    setOrderError(null);

    try {
      const result = await createOnlineOrder({
        tenantId,
        userId: user.id,
        sessionId: cart.sessionId ?? undefined,
        customer: {
          id: user.id,
          cpf: custCpf.replace(/\D/g, ""),
          name: custName.trim(),
          email: custEmail.trim(),
          phone: custPhone.replace(/\D/g, ""),
        },
        shippingAddress: {
          cep: cepAutoFill.cep.replace(/\D/g, ""),
          street: street.trim(),
          number: number.trim(),
          complement: complement.trim() || undefined,
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: addressState.trim(),
          has_portaria: hasPortaria,
        },
        shippingCost: effectiveShippingCost,
        partnerId: marketplace.partnerId ?? undefined,
        notes: undefined,
      });

      setOrderResult(result);
      setStep(5);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Falha ao processar pedido.";
      setOrderError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    user?.id,
    tenantId,
    cart.sessionId,
    custCpf,
    custName,
    custEmail,
    custPhone,
    cepAutoFill.cep,
    street,
    number,
    complement,
    neighborhood,
    city,
    addressState,
    hasPortaria,
    effectiveShippingCost,
    marketplace.partnerId,
  ]);

  /* ── Copy PIX ── */
  const handleCopyPix = useCallback(async () => {
    if (!orderResult?.pixBrCode) return;
    try {
      await Clipboard.setStringAsync(orderResult.pixBrCode);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 3000);
    } catch {
      // silent
    }
  }, [orderResult?.pixBrCode]);

  /* ══════════════════════════════════════════════════════════════════
   * RENDER SECTIONS
   * ══════════════════════════════════════════════════════════════════ */

  /* ── Header ── */
  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: primaryColor }]}>
      <View style={styles.headerInner}>
        <TouchableOpacity
          onPress={() => navigateTo(cartUrl)}
          style={styles.headerBackBtn}
        >
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Checkout</Text>
          <Text style={styles.headerSubtitle}>{brandName}</Text>
        </View>
        {step < 5 && (
          <View style={styles.headerRight}>
            <Text style={styles.headerBadgeText}>Etapa {step}/4</Text>
          </View>
        )}
      </View>
    </View>
  );

  /* ── Step indicator ── */
  const renderStepIndicator = () => {
    const steps = [
      { num: 1 as CheckoutStep, label: "Endereço" },
      { num: 2 as CheckoutStep, label: "Frete" },
      { num: 3 as CheckoutStep, label: "Dados" },
      { num: 4 as CheckoutStep, label: "Revisão" },
    ];

    return (
      <View style={styles.stepIndicator}>
        {steps.map((s, i) => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <View key={s.num} style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  isDone && { backgroundColor: SUCCESS_COLOR },
                  isActive && { backgroundColor: primaryColor },
                  !isDone && !isActive && { backgroundColor: BORDER_COLOR },
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={14} color="#ffffff" />
                ) : (
                  <Text style={styles.stepCircleText}>{s.num}</Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  (isActive || isDone) && { color: TEXT_PRIMARY },
                ]}
              >
                {s.label}
              </Text>
              {i < steps.length - 1 && (
                <View
                  style={[
                    styles.stepLine,
                    isDone && { backgroundColor: SUCCESS_COLOR },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
    );
  };

  /* ── Step 1: Shipping Address ── */
  const renderStep1 = () => (
    <View style={[styles.sectionCard, CARD_SHADOW]}>
      <Text style={styles.sectionTitle}>Endereço de Entrega</Text>

      {/* CEP */}
      <Text style={styles.fieldLabel}>CEP *</Text>
      <View style={styles.cepRow}>
        <TextInput
          value={formatCep(cepAutoFill.cep)}
          onChangeText={(t) => cepAutoFill.setCep(t.replace(/\D/g, ""))}
          placeholder="00000-000"
          placeholderTextColor={TEXT_MUTED}
          keyboardType="number-pad"
          maxLength={9}
          style={styles.cepInput}
        />
        <TouchableOpacity
          onPress={() => cepAutoFill.lookup()}
          disabled={cepAutoFill.loading}
          style={[styles.cepBtn, { backgroundColor: primaryColor }]}
        >
          {cepAutoFill.loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.cepBtnText}>Buscar</Text>
          )}
        </TouchableOpacity>
      </View>
      {cepAutoFill.error && (
        <Text style={styles.fieldError}>{cepAutoFill.error}</Text>
      )}

      {/* Street */}
      <Text style={styles.fieldLabel}>Rua / Logradouro *</Text>
      <TextInput
        value={street}
        onChangeText={setStreet}
        placeholder="Rua, Avenida..."
        placeholderTextColor={TEXT_MUTED}
        style={styles.fieldInput}
      />

      {/* Number + Complement */}
      <View style={styles.fieldRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Número *</Text>
          <TextInput
            value={number}
            onChangeText={setNumber}
            placeholder="Nº"
            placeholderTextColor={TEXT_MUTED}
            keyboardType="number-pad"
            style={styles.fieldInput}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Complemento</Text>
          <TextInput
            value={complement}
            onChangeText={setComplement}
            placeholder="Apto, bloco..."
            placeholderTextColor={TEXT_MUTED}
            style={styles.fieldInput}
          />
        </View>
      </View>

      {/* Neighborhood */}
      <Text style={styles.fieldLabel}>Bairro *</Text>
      <TextInput
        value={neighborhood}
        onChangeText={setNeighborhood}
        placeholder="Bairro"
        placeholderTextColor={TEXT_MUTED}
        style={styles.fieldInput}
      />

      {/* City + State */}
      <View style={styles.fieldRow}>
        <View style={{ flex: 2 }}>
          <Text style={styles.fieldLabel}>Cidade *</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Cidade"
            placeholderTextColor={TEXT_MUTED}
            style={styles.fieldInput}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>UF *</Text>
          <TextInput
            value={addressState}
            onChangeText={(t) => setAddressState(t.toUpperCase().slice(0, 2))}
            placeholder="SP"
            placeholderTextColor={TEXT_MUTED}
            maxLength={2}
            autoCapitalize="characters"
            style={styles.fieldInput}
          />
        </View>
      </View>

      {/* Portaria checkbox */}
      <TouchableOpacity
        onPress={() => setHasPortaria(!hasPortaria)}
        style={styles.checkboxRow}
      >
        <Ionicons
          name={hasPortaria ? "checkbox" : "square-outline"}
          size={22}
          color={hasPortaria ? primaryColor : TEXT_MUTED}
        />
        <Text style={styles.checkboxLabel}>
          Local tem portaria / recepção para entregas
        </Text>
      </TouchableOpacity>

      {/* Next button */}
      <TouchableOpacity
        onPress={() => {
          setStep(2);
          if (!shippingQuote) handleCalculateShipping();
        }}
        disabled={!canProceedStep1}
        style={[
          styles.primaryBtn,
          {
            backgroundColor: canProceedStep1 ? primaryColor : TEXT_MUTED,
          },
        ]}
      >
        <Text style={styles.primaryBtnText}>Continuar para Frete</Text>
        <Ionicons name="arrow-forward" size={18} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );

  /* ── Step 2: Shipping Method ── */
  const renderStep2 = () => {
    const validRates = (shippingQuote?.rates ?? []).filter((r) => !r.error);

    return (
      <View style={[styles.sectionCard, CARD_SHADOW]}>
        <Text style={styles.sectionTitle}>Opções de Frete</Text>

        {freeShippingApplies && (
          <View style={styles.freeShippingBadge}>
            <Ionicons name="gift-outline" size={18} color={SUCCESS_COLOR} />
            <Text style={[styles.freeShippingText, { color: SUCCESS_COLOR }]}>
              Frete grátis! Seu pedido atingiu{" "}
              {formatCurrency(config?.free_shipping_above ?? 0)}
            </Text>
          </View>
        )}

        {shippingLoading && (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={primaryColor} />
            <Text style={styles.shippingCalcText}>Calculando frete...</Text>
          </View>
        )}

        {shippingError && !shippingLoading && (
          <View style={styles.errorBanner}>
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color={ERROR_COLOR}
            />
            <Text style={styles.errorBannerText}>{shippingError}</Text>
            <TouchableOpacity onPress={handleCalculateShipping}>
              <Text style={[styles.retryText, { color: primaryColor }]}>
                Tentar novamente
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!shippingLoading && !freeShippingApplies && validRates.length > 0 && (
          <View style={styles.ratesList}>
            {validRates.map((rate) => {
              const isSelected = selectedRate?.serviceCode === rate.serviceCode;
              return (
                <TouchableOpacity
                  key={rate.serviceCode}
                  onPress={() => setSelectedRate(rate)}
                  style={[
                    styles.rateCard,
                    isSelected && {
                      borderColor: primaryColor,
                      backgroundColor: `${primaryColor}08`,
                    },
                  ]}
                >
                  <View style={styles.rateRadio}>
                    <View
                      style={[
                        styles.radioOuter,
                        isSelected && { borderColor: primaryColor },
                      ]}
                    >
                      {isSelected && (
                        <View
                          style={[
                            styles.radioInner,
                            { backgroundColor: primaryColor },
                          ]}
                        />
                      )}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rateName}>{rate.serviceName}</Text>
                    <Text style={styles.rateDays}>
                      Entrega em até {rate.estimatedDays} dias úteis
                    </Text>
                  </View>
                  <Text style={styles.ratePrice}>
                    {formatCurrency(rate.value)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Destination summary */}
        {shippingQuote && (
          <Text style={styles.shippingDestHint}>
            Entrega para: {formatCep(cepAutoFill.cep)} — {city}/{addressState}
          </Text>
        )}

        {/* Nav buttons */}
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={() => setStep(1)}
            style={styles.secondaryBtn}
          >
            <Ionicons name="arrow-back" size={16} color={primaryColor} />
            <Text style={[styles.secondaryBtnText, { color: primaryColor }]}>
              Voltar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStep(3)}
            disabled={!canProceedStep2}
            style={[
              styles.primaryBtn,
              {
                flex: 1,
                backgroundColor: canProceedStep2 ? primaryColor : TEXT_MUTED,
              },
            ]}
          >
            <Text style={styles.primaryBtnText}>Continuar</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /* ── Step 3: Customer Info ── */
  const renderStep3 = () => (
    <View style={[styles.sectionCard, CARD_SHADOW]}>
      <Text style={styles.sectionTitle}>Seus Dados</Text>

      <Text style={styles.fieldLabel}>Nome completo *</Text>
      <TextInput
        value={custName}
        onChangeText={setCustName}
        placeholder="João da Silva"
        placeholderTextColor={TEXT_MUTED}
        autoCapitalize="words"
        style={styles.fieldInput}
      />

      <Text style={styles.fieldLabel}>CPF *</Text>
      <TextInput
        value={maskCpf(custCpf)}
        onChangeText={(t) => setCustCpf(t.replace(/\D/g, ""))}
        placeholder="000.000.000-00"
        placeholderTextColor={TEXT_MUTED}
        keyboardType="number-pad"
        maxLength={14}
        style={styles.fieldInput}
      />

      <Text style={styles.fieldLabel}>E-mail *</Text>
      <TextInput
        value={custEmail}
        onChangeText={setCustEmail}
        placeholder="joao@email.com"
        placeholderTextColor={TEXT_MUTED}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        style={styles.fieldInput}
      />

      <Text style={styles.fieldLabel}>Telefone / WhatsApp *</Text>
      <TextInput
        value={maskPhone(custPhone)}
        onChangeText={(t) => setCustPhone(t.replace(/\D/g, ""))}
        placeholder="(00) 00000-0000"
        placeholderTextColor={TEXT_MUTED}
        keyboardType="phone-pad"
        maxLength={15}
        style={styles.fieldInput}
      />

      {/* Nav buttons */}
      <View style={styles.navRow}>
        <TouchableOpacity
          onPress={() => setStep(2)}
          style={styles.secondaryBtn}
        >
          <Ionicons name="arrow-back" size={16} color={primaryColor} />
          <Text style={[styles.secondaryBtnText, { color: primaryColor }]}>
            Voltar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setStep(4)}
          disabled={!canProceedStep3}
          style={[
            styles.primaryBtn,
            {
              flex: 1,
              backgroundColor: canProceedStep3 ? primaryColor : TEXT_MUTED,
            },
          ]}
        >
          <Text style={styles.primaryBtnText}>Revisar Pedido</Text>
          <Ionicons name="arrow-forward" size={18} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  /* ── Step 4: Order Review ── */
  const renderStep4 = () => (
    <View>
      {/* Items summary */}
      <View style={[styles.sectionCard, CARD_SHADOW]}>
        <Text style={styles.sectionTitle}>Itens ({cart.itemCount})</Text>
        {cart.items.map((item: CartItem) => (
          <View key={item.id} style={styles.reviewItemRow}>
            {item.product_image_url ? (
              <Image
                source={{ uri: item.product_image_url }}
                style={styles.reviewItemImage}
              />
            ) : (
              <View style={styles.reviewItemImagePlaceholder}>
                <Ionicons name="cube-outline" size={16} color={TEXT_MUTED} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.reviewItemName} numberOfLines={1}>
                {item.product_name || "Produto"}
              </Text>
              <Text style={styles.reviewItemQty}>
                {item.quantity}x {formatCurrency(item.unit_price)}
              </Text>
            </View>
            <Text style={styles.reviewItemTotal}>
              {formatCurrency(item.unit_price * item.quantity)}
            </Text>
          </View>
        ))}
      </View>

      {/* Shipping summary */}
      <View style={[styles.sectionCard, CARD_SHADOW, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Entrega</Text>
        <Text style={styles.reviewAddressText}>
          {street}, {number}
          {complement ? ` — ${complement}` : ""}
        </Text>
        <Text style={styles.reviewAddressText}>
          {neighborhood}, {city}/{addressState} — CEP{" "}
          {formatCep(cepAutoFill.cep)}
        </Text>
        {freeShippingApplies ? (
          <View style={[styles.freeShippingBadge, { marginTop: 8 }]}>
            <Ionicons name="gift-outline" size={16} color={SUCCESS_COLOR} />
            <Text style={[styles.freeShippingText, { color: SUCCESS_COLOR }]}>
              Frete grátis
            </Text>
          </View>
        ) : selectedRate ? (
          <Text style={styles.reviewShippingRate}>
            {formatShippingRate(selectedRate)}
          </Text>
        ) : null}
      </View>

      {/* Customer summary */}
      <View style={[styles.sectionCard, CARD_SHADOW, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Comprador</Text>
        <Text style={styles.reviewCustomerText}>{custName}</Text>
        <Text style={styles.reviewCustomerText}>{maskCpf(custCpf)}</Text>
        <Text style={styles.reviewCustomerText}>{custEmail}</Text>
        <Text style={styles.reviewCustomerText}>{maskPhone(custPhone)}</Text>
      </View>

      {/* Totals */}
      <View style={[styles.sectionCard, CARD_SHADOW, { marginTop: 12 }]}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>
            {formatCurrency(cart.subtotal)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Frete</Text>
          <Text
            style={[
              styles.summaryValue,
              freeShippingApplies && { color: SUCCESS_COLOR },
            ]}
          >
            {freeShippingApplies
              ? "Grátis"
              : formatCurrency(effectiveShippingCost)}
          </Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryTotal]}>
          <Text style={styles.summaryTotalLabel}>Total</Text>
          <Text style={[styles.summaryTotalValue, { color: primaryColor }]}>
            {formatCurrency(orderTotal)}
          </Text>
        </View>

        <View style={styles.paymentHint}>
          <Ionicons name="logo-usd" size={16} color={TEXT_SECONDARY} />
          <Text style={styles.paymentHintText}>
            Pagamento via PIX — aprovação instantânea
          </Text>
        </View>
      </View>

      {/* Error */}
      {orderError && (
        <View style={[styles.errorBanner, { marginTop: 12 }]}>
          <Ionicons name="alert-circle-outline" size={18} color={ERROR_COLOR} />
          <Text style={styles.errorBannerText}>{orderError}</Text>
        </View>
      )}

      {/* Nav buttons */}
      <View style={[styles.navRow, { marginTop: 16 }]}>
        <TouchableOpacity
          onPress={() => setStep(3)}
          style={styles.secondaryBtn}
          disabled={submitting}
        >
          <Ionicons name="arrow-back" size={16} color={primaryColor} />
          <Text style={[styles.secondaryBtnText, { color: primaryColor }]}>
            Voltar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmitOrder}
          disabled={submitting}
          style={[
            styles.primaryBtn,
            {
              flex: 1,
              backgroundColor: submitting ? TEXT_MUTED : primaryColor,
            },
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={16} color="#ffffff" />
              <Text style={styles.primaryBtnText}>Confirmar Pedido</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  /* ── Step 5: PIX Payment ── */
  const renderStep5 = () => {
    if (!orderResult) return null;

    const orderId = orderResult.sale?.id ?? "";
    const shortId = orderId.slice(0, 8).toUpperCase();

    return (
      <View>
        {/* Success header */}
        <View style={[styles.sectionCard, CARD_SHADOW, styles.successCard]}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark-circle" size={48} color={SUCCESS_COLOR} />
          </View>
          <Text style={styles.successTitle}>Pedido Realizado!</Text>
          <Text style={styles.successSubtitle}>Pedido #{shortId}</Text>
          <Text style={styles.successHint}>
            Efetue o pagamento via PIX para confirmar seu pedido
          </Text>
        </View>

        {/* PIX payment */}
        <View style={[styles.sectionCard, CARD_SHADOW, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>Pagamento PIX</Text>
          <Text style={styles.pixTotal}>{formatCurrency(orderTotal)}</Text>

          {/* QR Code */}
          {orderResult.pixQrCodeBase64 && (
            <View style={styles.qrWrap}>
              <Image
                source={{ uri: orderResult.pixQrCodeBase64 }}
                style={styles.qrImage}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Copy button */}
          {orderResult.pixBrCode && (
            <TouchableOpacity
              onPress={handleCopyPix}
              style={[styles.copyBtn, { borderColor: primaryColor }]}
            >
              <Ionicons
                name={pixCopied ? "checkmark" : "copy-outline"}
                size={18}
                color={primaryColor}
              />
              <Text style={[styles.copyBtnText, { color: primaryColor }]}>
                {pixCopied ? "Copiado!" : "Copiar código PIX"}
              </Text>
            </TouchableOpacity>
          )}

          {orderResult.pixBrCode && (
            <View style={styles.pixCodeWrap}>
              <Text style={styles.pixCodeLabel}>Código PIX Copia e Cola:</Text>
              <Text style={styles.pixCodeValue} selectable>
                {orderResult.pixBrCode}
              </Text>
            </View>
          )}

          <Text style={styles.pixHint}>
            Abra o app do seu banco, escolha pagar com PIX e cole o código acima
            ou escaneie o QR Code.
          </Text>
        </View>

        {/* Back to store */}
        <TouchableOpacity
          onPress={() => navigateTo(storeBase)}
          style={[styles.primaryBtn, { marginTop: 16 }]}
        >
          <Ionicons name="storefront-outline" size={18} color="#ffffff" />
          <Text
            style={[
              styles.primaryBtnText,
              { backgroundColor: primaryColor, borderRadius: 12 },
            ]}
          >
            Voltar à loja
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  /* ── Auth gate ── */
  const renderAuthGate = () => (
    <View style={styles.authGateWrap}>
      <Ionicons name="lock-closed-outline" size={56} color={TEXT_MUTED} />
      <Text style={styles.authGateTitle}>Faça login para continuar</Text>
      <Text style={styles.authGateSubtitle}>
        Você precisa estar logado para finalizar sua compra
      </Text>
      <TouchableOpacity
        onPress={() => navigateTo("/login")}
        style={[styles.primaryBtn, { marginTop: 24 }]}
      >
        <Text
          style={[
            styles.primaryBtnText,
            { backgroundColor: primaryColor, borderRadius: 12 },
          ]}
        >
          Fazer Login
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigateTo(cartUrl)}
        style={{ marginTop: 12 }}
      >
        <Text style={[styles.authGateLink, { color: primaryColor }]}>
          Voltar ao carrinho
        </Text>
      </TouchableOpacity>
    </View>
  );

  /* ══════════════════════════════════════════════════════════════════
   * MAIN RENDER
   * ══════════════════════════════════════════════════════════════════ */

  if (isLoading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderAuthGate()}
      </View>
    );
  }

  if (isEmpty && step < 5) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.emptyWrap}>
          <Ionicons name="cart-outline" size={56} color={TEXT_MUTED} />
          <Text style={styles.emptyTitle}>Carrinho vazio</Text>
          <Text style={styles.emptySubtitle}>
            Adicione produtos antes de finalizar a compra
          </Text>
          <TouchableOpacity
            onPress={() => navigateTo(storeBase)}
            style={[styles.primaryBtn, { marginTop: 24 }]}
          >
            <Text
              style={[
                styles.primaryBtnText,
                { backgroundColor: primaryColor, borderRadius: 10 },
              ]}
            >
              Ver produtos
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && styles.scrollContentWide,
        ]}
      >
        {step < 5 && renderStepIndicator()}

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: { marginTop: 12, fontSize: 14, color: TEXT_SECONDARY },
  centered: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 8,
  },

  /* ── Header ── */
  header: { paddingTop: Platform.OS === "web" ? 0 : 48 },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerBackBtn: { marginRight: 12 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#ffffff" },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  headerRight: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerBadgeText: { fontSize: 12, fontWeight: "600", color: "#ffffff" },

  /* ── Scroll ── */
  scrollContent: { padding: 16, paddingBottom: 48 },
  scrollContentWide: { maxWidth: 720, alignSelf: "center", width: "100%" },

  /* ── Step indicator ── */
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  stepCircleText: { fontSize: 12, fontWeight: "700", color: "#ffffff" },
  stepLabel: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginLeft: 4,
    fontWeight: "600",
  },
  stepLine: {
    width: 24,
    height: 2,
    backgroundColor: BORDER_COLOR,
    marginHorizontal: 4,
  },

  /* ── Section card ── */
  sectionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 14,
  },

  /* ── Form fields ── */
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_SECONDARY,
    marginTop: 10,
    marginBottom: 4,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TEXT_PRIMARY,
    backgroundColor: HERO_BG,
  },
  fieldError: {
    fontSize: 12,
    color: ERROR_COLOR,
    marginTop: 4,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 12,
  },

  /* ── CEP ── */
  cepRow: { flexDirection: "row", gap: 8 },
  cepInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TEXT_PRIMARY,
    backgroundColor: HERO_BG,
  },
  cepBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cepBtnText: { fontSize: 13, fontWeight: "600", color: "#ffffff" },

  /* ── Checkbox ── */
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    marginBottom: 16,
  },
  checkboxLabel: { fontSize: 13, color: TEXT_SECONDARY, flex: 1 },

  /* ── Buttons ── */
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: DEFAULT_PRIMARY,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "600" },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },

  /* ── Shipping (step 2) ── */
  freeShippingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  freeShippingText: { fontSize: 13, fontWeight: "600" },
  shippingCalcText: { fontSize: 13, color: TEXT_SECONDARY },
  shippingDestHint: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 12,
    textAlign: "center",
  },
  ratesList: { gap: 8, marginBottom: 4 },
  rateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: HERO_BG,
  },
  rateRadio: { width: 24, alignItems: "center" },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: TEXT_MUTED,
    justifyContent: "center",
    alignItems: "center",
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  rateName: { fontSize: 14, fontWeight: "600", color: TEXT_PRIMARY },
  rateDays: { fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 },
  ratePrice: { fontSize: 15, fontWeight: "700", color: TEXT_PRIMARY },

  /* ── Error banner ── */
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: ERROR_COLOR,
    lineHeight: 18,
  },
  retryText: { fontSize: 13, fontWeight: "600" },

  /* ── Summary (step 4) ── */
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryLabel: { fontSize: 13, color: TEXT_SECONDARY },
  summaryValue: { fontSize: 14, fontWeight: "600", color: TEXT_PRIMARY },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    paddingTop: 12,
    marginTop: 4,
  },
  summaryTotalLabel: { fontSize: 16, fontWeight: "700", color: TEXT_PRIMARY },
  summaryTotalValue: { fontSize: 22, fontWeight: "800" },
  paymentHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
  },
  paymentHintText: { fontSize: 12, color: TEXT_SECONDARY },

  /* ── Review items (step 4) ── */
  reviewItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  reviewItemImage: { width: 44, height: 44, borderRadius: 6 },
  reviewItemImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: HERO_BG,
    justifyContent: "center",
    alignItems: "center",
  },
  reviewItemName: { fontSize: 13, fontWeight: "600", color: TEXT_PRIMARY },
  reviewItemQty: { fontSize: 12, color: TEXT_SECONDARY },
  reviewItemTotal: { fontSize: 14, fontWeight: "700", color: TEXT_PRIMARY },
  reviewAddressText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },
  reviewShippingRate: {
    fontSize: 13,
    color: TEXT_PRIMARY,
    fontWeight: "600",
    marginTop: 8,
  },
  reviewCustomerText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },

  /* ── PIX payment (step 5) ── */
  successCard: { alignItems: "center", paddingVertical: 24 },
  successIconWrap: { marginBottom: 8 },
  successTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_SECONDARY,
  },
  successHint: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginTop: 8,
    textAlign: "center",
  },
  pixTotal: {
    fontSize: 28,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginBottom: 16,
  },
  qrWrap: { alignItems: "center", marginBottom: 16 },
  qrImage: { width: 220, height: 220 },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    marginBottom: 12,
  },
  copyBtnText: { fontSize: 14, fontWeight: "700" },
  pixCodeWrap: {
    backgroundColor: HERO_BG,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  pixCodeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TEXT_MUTED,
    marginBottom: 4,
  },
  pixCodeValue: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    lineHeight: 16,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  pixHint: {
    fontSize: 12,
    color: TEXT_MUTED,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },

  /* ── Auth gate ── */
  authGateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  authGateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginTop: 16,
  },
  authGateSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
  },
  authGateLink: { fontSize: 14, fontWeight: "600" },

  /* ── Empty cart ── */
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: "center",
  },
});
