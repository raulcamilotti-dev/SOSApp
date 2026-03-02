import { getAuthColors, useTenantBranding } from "@/hooks/use-tenant-branding";
import { api, getApiErrorMessage } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Step = "email" | "success" | "error";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const branding = useTenantBranding();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const colors = useMemo(
    () =>
      getAuthColors(
        branding.primaryColor,
        branding.primaryDark,
        branding.primaryLight,
      ),
    [branding.primaryColor, branding.primaryDark, branding.primaryLight],
  );

  const handleRequestReset = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!email.trim()) {
      setErrorMsg("Por favor, insira seu email ou CPF");
      return;
    }

    setLoading(true);

    try {
      await api.post("/auth/request-password-reset", {
        identifier: email.trim(),
      });

      setStep("success");
      setSuccessMsg(
        "Link de recuperação enviado! Verifique seu email para redefinir sua senha.",
      );
    } catch (err: any) {
      setStep("error");
      setErrorMsg(
        getApiErrorMessage(
          err,
          "Erro ao solicitar recuperação de senha. Tente novamente.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  if (branding.loading) {
    return (
      <View style={[st.screen, { backgroundColor: colors.screenBg }]}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  return (
    <View style={[st.screen, { backgroundColor: colors.screenBg }]}>
      <ScrollView
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Header / Brand ---- */}
        <View style={st.header}>
          <View
            style={[st.logoCircle, { backgroundColor: colors.primaryLight }]}
          >
            <Text style={[st.logoText, { color: colors.primary }]}>
              {branding.brandName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[st.brandTitle, { color: colors.heading }]}>
            {branding.brandName}
          </Text>
        </View>

        {/* ---- Card ---- */}
        <View
          style={[
            st.card,
            { backgroundColor: colors.cardBg, shadowColor: colors.shadow },
          ]}
        >
          <View style={st.iconRow}>
            <Ionicons
              name="lock-closed-outline"
              size={32}
              color={colors.primary}
            />
          </View>
          <Text style={[st.cardTitle, { color: colors.heading }]}>
            Recuperar senha
          </Text>

          {step === "email" && (
            <>
              <Text style={[st.cardBody, { color: colors.body }]}>
                Insira seu email ou CPF para receber um link de recuperação de
                senha.
              </Text>

              {errorMsg ? (
                <View
                  style={[
                    st.alertBox,
                    { backgroundColor: colors.errorBg || "#fee2e2" },
                  ]}
                >
                  <Text
                    style={[st.alertText, { color: colors.error || "#dc2626" }]}
                  >
                    {errorMsg}
                  </Text>
                </View>
              ) : null}

              <TextInput
                placeholder="Email ou CPF"
                placeholderTextColor={colors.placeholder}
                style={[
                  st.input,
                  {
                    backgroundColor: colors.inputBg,
                    color: colors.heading,
                    borderColor: colors.inputBorder,
                  },
                ]}
                value={email}
                onChangeText={setEmail}
                editable={!loading}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Pressable
                onPress={handleRequestReset}
                disabled={loading}
                style={({ pressed }) => [
                  st.btnPrimary,
                  {
                    backgroundColor: loading
                      ? colors.primaryLight
                      : pressed
                        ? colors.primaryDark
                        : colors.primary,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <>
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={colors.primaryText}
                    />
                    <Text
                      style={[st.btnPrimaryText, { color: colors.primaryText }]}
                    >
                      Enviar link de recuperação
                    </Text>
                  </>
                )}
              </Pressable>
            </>
          )}

          {step === "success" && (
            <>
              <View
                style={[
                  st.successIcon,
                  { backgroundColor: colors.primary + "15" },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={48}
                  color={colors.primary}
                />
              </View>
              <Text style={[st.cardBody, { color: colors.body }]}>
                {successMsg}
              </Text>
              <Text
                style={[st.cardSubtext, { color: colors.body, marginTop: 8 }]}
              >
                Não recebeu o email? Verifique sua pasta de spam ou tente
                novamente.
              </Text>

              <Pressable
                onPress={() => {
                  setStep("email");
                  setEmail("");
                  setErrorMsg("");
                  setSuccessMsg("");
                }}
                style={({ pressed }) => [
                  st.btnPrimary,
                  {
                    backgroundColor: pressed
                      ? colors.primaryDark
                      : colors.primary,
                  },
                ]}
              >
                <Text
                  style={[st.btnPrimaryText, { color: colors.primaryText }]}
                >
                  Tentar novamente
                </Text>
              </Pressable>
            </>
          )}

          {step === "error" && (
            <>
              <View
                style={[
                  st.errorIcon,
                  { backgroundColor: colors.errorBg || "#fee2e2" },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={48}
                  color={colors.error || "#dc2626"}
                />
              </View>
              <Text style={[st.cardBody, { color: colors.body }]}>
                {errorMsg}
              </Text>

              <Pressable
                onPress={() => {
                  setStep("email");
                  setEmail("");
                  setErrorMsg("");
                  setSuccessMsg("");
                }}
                style={({ pressed }) => [
                  st.btnPrimary,
                  {
                    backgroundColor: pressed
                      ? colors.primaryDark
                      : colors.primary,
                  },
                ]}
              >
                <Text
                  style={[st.btnPrimaryText, { color: colors.primaryText }]}
                >
                  Tentar novamente
                </Text>
              </Pressable>
            </>
          )}

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              st.btnSecondary,
              {
                borderColor: pressed ? colors.primaryDark : colors.primary,
              },
            ]}
          >
            <Ionicons
              name="arrow-back-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={[st.btnSecondaryText, { color: colors.primary }]}>
              Voltar para login
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
    maxWidth: 440,
    width: "100%",
    alignSelf: "center",
  },
  header: { alignItems: "center", marginBottom: 28 },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoText: { fontSize: 28, fontWeight: "700" },
  brandTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  card: {
    borderRadius: 16,
    padding: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 4,
    marginBottom: 20,
  },
  iconRow: { alignItems: "center", marginBottom: 16 },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 4,
  },
  cardSubtext: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  input: {
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    marginTop: 12,
    borderWidth: 1,
  },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    alignSelf: "center",
  },
  errorIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    alignSelf: "center",
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 10,
    marginTop: 24,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: "700" },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 12,
  },
  btnSecondaryText: { fontSize: 15, fontWeight: "600" },
});
