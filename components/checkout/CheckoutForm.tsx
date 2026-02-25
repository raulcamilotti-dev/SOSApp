/**
 * CHECKOUT FORM — Flexible payment checkout component
 * Supports: Credit card, PIX, Boleto
 */

import { useThemeColor } from "@/hooks/use-theme-color";
import {
    getPaymentGateway,
    type PaymentGatewayProvider,
} from "@/services/payment-gateway";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export interface CheckoutFormProps {
  amount: number;
  context:
    | "marketplace"
    | "plan_subscription"
    | "process_charge"
    | "manual_invoice";
  customerId: string;
  customerEmail: string;
  customerName: string;
  customerDocument?: string;
  customerPhone?: string;
  customerAddress?: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  gatewayProvider?: PaymentGatewayProvider;
  onSuccess: (paymentId: string, transactionId: string) => void;
  onError?: (error: string) => void;
  description?: string;
}

type PaymentMethodType = "credit_card" | "pix" | "boleto";

const validateCardNumber = (number: string): boolean => {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 13) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
};

const formatCardNumber = (text: string): string => {
  const digits = text.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(\d{4})/g, "$1 ").trim();
};

const formatExpiration = (text: string): string => {
  const digits = text.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
  }
  return digits;
};

export function CheckoutForm({
  amount,
  context,
  customerId,
  customerEmail,
  customerName,
  customerDocument,
  customerPhone,
  customerAddress,
  gatewayProvider,
  onSuccess,
  onError,
  description,
}: CheckoutFormProps) {
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodType>("credit_card");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expiration, setExpiration] = useState("");
  const [cvv, setCvv] = useState("");
  const [installments, setInstallments] = useState("1");

  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  const [boletoBarcode, setBoletoBarcode] = useState<string | null>(null);

  const [result, setResult] = useState<{
    status: "pending" | "approved" | "rejected";
    paymentId: string;
    transactionId: string;
  } | null>(null);

  const isCardValid = validateCardNumber(cardNumber);
  const isExpirationValid = expiration.length === 5;
  const isCvvValid = cvv.length >= 3;

  const isFormValid =
    isCardValid && isExpirationValid && isCvvValid && cardHolder.trim();

  const handlePayment = useCallback(async () => {
    if (loading || !isFormValid) return;

    setLoading(true);
    setError(null);

    try {
      const provider = gatewayProvider ?? (__DEV__ ? "mock" : "asaas");
      const gateway = await getPaymentGateway(provider);
      if (provider === "asaas" && !customerDocument) {
        throw new Error("CPF/CNPJ do cliente e obrigatorio");
      }

      const response = await gateway.createPayment({
        amount,
        method: "credit_card",
        customer: {
          id: customerId,
          name: customerName,
          email: customerEmail,
          documentNumber: customerDocument ?? "",
          phone: customerPhone,
          address: customerAddress,
        },
        cardData: {
          number: cardNumber.replace(/\s/g, ""),
          holderName: cardHolder.trim(),
          expirationMonth: expiration.slice(0, 2),
          expirationYear: expiration.slice(3, 5),
          cvv: cvv.trim(),
        },
        installments: Number(installments),
        description: description ?? "Pagamento via checkout",
        context,
        contextReferenceId: customerId,
      });

      setResult({
        status: response.status === "approved" ? "approved" : "pending",
        paymentId: response.paymentId,
        transactionId: response.transactionId,
      });

      onSuccess(response.paymentId, response.transactionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao processar";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [
    amount,
    cardHolder,
    cardNumber,
    context,
    customerAddress,
    customerDocument,
    customerEmail,
    customerId,
    customerName,
    customerPhone,
    cvv,
    description,
    expiration,
    gatewayProvider,
    installments,
    isFormValid,
    loading,
    onError,
    onSuccess,
  ]);

  const handleGeneratePix = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = gatewayProvider ?? (__DEV__ ? "mock" : "asaas");
      const gateway = await getPaymentGateway(provider);
      if (provider === "asaas" && !customerDocument) {
        throw new Error("CPF/CNPJ do cliente e obrigatorio");
      }

      const response = await gateway.createPayment({
        amount,
        method: "pix",
        customer: {
          id: customerId,
          name: customerName,
          email: customerEmail,
          documentNumber: customerDocument ?? "",
          phone: customerPhone,
          address: customerAddress,
        },
        description: description ?? "Pagamento PIX",
        context,
        contextReferenceId: customerId,
      });

      setPixQrCode(response.pixQrCode ?? null);
      setPixCopyPaste(response.pixCopyPaste ?? null);

      setResult({
        status: response.status === "approved" ? "approved" : "pending",
        paymentId: response.paymentId,
        transactionId: response.transactionId,
      });

      onSuccess(response.paymentId, response.transactionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao gerar PIX";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [
    amount,
    context,
    customerAddress,
    customerDocument,
    customerEmail,
    customerId,
    customerName,
    customerPhone,
    description,
    gatewayProvider,
    onError,
    onSuccess,
  ]);

  const handleGenerateBoleto = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = gatewayProvider ?? (__DEV__ ? "mock" : "asaas");
      const gateway = await getPaymentGateway(provider);
      if (provider === "asaas" && !customerDocument) {
        throw new Error("CPF/CNPJ do cliente e obrigatorio");
      }

      const response = await gateway.createPayment({
        amount,
        method: "boleto",
        customer: {
          id: customerId,
          name: customerName,
          email: customerEmail,
          documentNumber: customerDocument ?? "",
          phone: customerPhone,
          address: customerAddress,
        },
        description: description ?? "Pagamento via boleto",
        context,
        contextReferenceId: customerId,
      });

      setBoletoBarcode(response.boletoBarcode ?? null);

      setResult({
        status: response.status === "approved" ? "approved" : "pending",
        paymentId: response.paymentId,
        transactionId: response.transactionId,
      });

      onSuccess(response.paymentId, response.transactionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao gerar boleto";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [
    amount,
    context,
    customerAddress,
    customerDocument,
    customerEmail,
    customerId,
    customerName,
    customerPhone,
    description,
    gatewayProvider,
    onError,
    onSuccess,
  ]);

  const handleCopyPix = useCallback(async () => {
    if (!pixCopyPaste) return;
    try {
      await Clipboard.setStringAsync(pixCopyPaste);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
    } catch {
      Alert.alert("Erro", "Falha ao copiar código PIX");
    }
  }, [pixCopyPaste]);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {result && (
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor:
                result.status === "approved" ? "#10b981" : "#f59e0b",
            },
          ]}
        >
          <Ionicons
            name={result.status === "approved" ? "checkmark-circle" : "time"}
            size={20}
            color="#fff"
          />
          <Text style={{ color: "#fff", marginLeft: 8, fontWeight: "600" }}>
            {result.status === "approved"
              ? "✓ Pagamento aprovado!"
              : "⏳ Aguardando confirmação..."}
          </Text>
        </View>
      )}

      {error && !result && (
        <View style={[styles.errorBanner, { borderColor: "#ef4444" }]}>
          <Ionicons name="alert-circle" size={20} color="#ef4444" />
          <Text style={{ color: "#ef4444", marginLeft: 8, flex: 1 }}>
            {error}
          </Text>
        </View>
      )}

      <View
        style={[
          styles.methodTabs,
          { borderBottomColor: borderColor, backgroundColor: cardBg },
        ]}
      >
        {(["credit_card", "pix", "boleto"] as PaymentMethodType[]).map(
          (method) => (
            <TouchableOpacity
              key={method}
              onPress={() => {
                setPaymentMethod(method);
                setResult(null);
                setError(null);
              }}
              style={[
                styles.methodTab,
                {
                  borderBottomColor:
                    paymentMethod === method ? tintColor : "transparent",
                  borderBottomWidth: paymentMethod === method ? 2 : 0,
                },
              ]}
            >
              <Ionicons
                name={
                  method === "credit_card"
                    ? "card"
                    : method === "pix"
                      ? "qr-code"
                      : "document-text"
                }
                size={18}
                color={paymentMethod === method ? tintColor : mutedColor}
                style={{ marginRight: 6 }}
              />
              <Text
                style={{
                  color: paymentMethod === method ? tintColor : mutedColor,
                  fontWeight: paymentMethod === method ? "700" : "500",
                  fontSize: 12,
                }}
              >
                {method === "credit_card"
                  ? "Cartão"
                  : method === "pix"
                    ? "PIX"
                    : "Boleto"}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {paymentMethod === "credit_card" && (
            <>
              <Text style={[styles.label, { color: textColor }]}>
                Número do Cartão
              </Text>
              <TextInput
                value={formatCardNumber(cardNumber)}
                onChangeText={(text) =>
                  setCardNumber(text.replace(/\D/g, "").slice(0, 19))
                }
                placeholder="0000 0000 0000 0000"
                placeholderTextColor={mutedColor}
                keyboardType="number-pad"
                maxLength={24}
                style={[
                  styles.input,
                  {
                    borderColor: isCardValid ? tintColor : borderColor,
                    color: textColor,
                    backgroundColor: cardBg,
                  },
                ]}
              />

              <Text style={[styles.label, { color: textColor, marginTop: 12 }]}>
                Nome do Titular
              </Text>
              <TextInput
                value={cardHolder}
                onChangeText={setCardHolder}
                placeholder="NOME COMPLETO"
                placeholderTextColor={mutedColor}
                autoCapitalize="characters"
                style={[
                  styles.input,
                  { borderColor, color: textColor, backgroundColor: cardBg },
                ]}
              />

              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: textColor }]}>
                    Válido até
                  </Text>
                  <TextInput
                    value={expiration}
                    onChangeText={(text) =>
                      setExpiration(formatExpiration(text))
                    }
                    placeholder="MM/YY"
                    placeholderTextColor={mutedColor}
                    keyboardType="number-pad"
                    maxLength={5}
                    style={[
                      styles.input,
                      {
                        borderColor: isExpirationValid
                          ? tintColor
                          : borderColor,
                        color: textColor,
                        backgroundColor: cardBg,
                      },
                    ]}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: textColor }]}>CVV</Text>
                  <TextInput
                    value={cvv}
                    onChangeText={(text) =>
                      setCvv(text.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="123"
                    placeholderTextColor={mutedColor}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    style={[
                      styles.input,
                      {
                        borderColor: isCvvValid ? tintColor : borderColor,
                        color: textColor,
                        backgroundColor: cardBg,
                      },
                    ]}
                  />
                </View>
              </View>

              <Text style={[styles.label, { color: textColor, marginTop: 12 }]}>
                Parcelado em:
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[1, 2, 3, 4, 6, 12].map((count) => (
                  <TouchableOpacity
                    key={count}
                    onPress={() => setInstallments(count.toString())}
                    style={[
                      styles.installmentBtn,
                      {
                        backgroundColor:
                          installments === count.toString()
                            ? tintColor
                            : cardBg,
                        borderColor:
                          installments === count.toString()
                            ? tintColor
                            : borderColor,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          installments === count.toString()
                            ? "#fff"
                            : textColor,
                        fontWeight: "600",
                      }}
                    >
                      {count}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {paymentMethod === "pix" && (
            <View>
              <Text style={[styles.label, { color: textColor }]}>
                Código PIX
              </Text>
              {pixQrCode ? (
                <>
                  <Text
                    style={{
                      color: mutedColor,
                      fontSize: 12,
                      marginTop: 12,
                    }}
                  >
                    Ou copie e cole o código:
                  </Text>
                  <TouchableOpacity
                    onPress={handleCopyPix}
                    style={[
                      styles.pixContainer,
                      {
                        backgroundColor: cardBg,
                        borderColor: pixCopied ? tintColor : borderColor,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: textColor,
                        fontFamily: "monospace",
                        fontSize: 11,
                        flex: 1,
                      }}
                      numberOfLines={2}
                    >
                      {pixCopyPaste}
                    </Text>
                    <Ionicons
                      name={pixCopied ? "checkmark" : "copy"}
                      size={16}
                      color={pixCopied ? tintColor : mutedColor}
                      style={{ marginLeft: 8 }}
                    />
                  </TouchableOpacity>
                  {pixCopied && (
                    <Text
                      style={{
                        color: tintColor,
                        fontSize: 12,
                        marginTop: 8,
                        fontWeight: "600",
                      }}
                    >
                      ✓ Copiado!
                    </Text>
                  )}
                </>
              ) : (
                <Text style={{ color: mutedColor, marginTop: 12 }}>
                  Clique em Gerar PIX abaixo
                </Text>
              )}
            </View>
          )}

          {paymentMethod === "boleto" && (
            <View>
              <Text style={[styles.label, { color: textColor }]}>
                Código de Barras
              </Text>
              {boletoBarcode ? (
                <View
                  style={[
                    styles.barcodeContainer,
                    { backgroundColor: cardBg, borderColor },
                  ]}
                >
                  <Text
                    style={{
                      color: textColor,
                      fontFamily: "monospace",
                      fontSize: 11,
                      textAlign: "center",
                      letterSpacing: 1,
                    }}
                  >
                    {boletoBarcode}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: mutedColor, marginTop: 12 }}>
                  Clique em Gerar Boleto abaixo
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.footer,
          { borderTopColor: borderColor, backgroundColor: cardBg },
        ]}
      >
        <View>
          <Text style={[styles.totalLabel, { color: mutedColor }]}>Total</Text>
          <Text style={[styles.totalAmount, { color: textColor }]}>
            R$ {amount.toFixed(2).replace(".", ",")}
          </Text>
        </View>

        <TouchableOpacity
          onPress={
            paymentMethod === "credit_card"
              ? handlePayment
              : paymentMethod === "pix"
                ? handleGeneratePix
                : handleGenerateBoleto
          }
          disabled={
            loading ||
            result !== null ||
            (paymentMethod === "credit_card" && !isFormValid)
          }
          style={[
            styles.payBtn,
            {
              backgroundColor:
                loading ||
                result !== null ||
                (paymentMethod === "credit_card" && !isFormValid)
                  ? mutedColor
                  : tintColor,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={16} color="#fff" />
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "700",
                  marginLeft: 6,
                  fontSize: 13,
                }}
              >
                {paymentMethod === "credit_card"
                  ? "Pagar"
                  : paymentMethod === "pix"
                    ? "Gerar PIX"
                    : "Gerar Boleto"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
  },

  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    margin: 12,
    borderRadius: 8,
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    margin: 12,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },

  methodTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 12,
  },

  methodTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },

  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },

  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },

  installmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 50,
    alignItems: "center",
  },

  pixContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },

  barcodeContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
  },

  footer: {
    borderTopWidth: 1,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  totalLabel: {
    fontSize: 12,
    marginBottom: 2,
  },

  totalAmount: {
    fontSize: 20,
    fontWeight: "700",
  },

  payBtn: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
