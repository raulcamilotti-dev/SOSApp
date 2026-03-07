import { saveToken } from "@/core/auth/auth.storage";
import { getAuthColors, useTenantBranding } from "@/hooks/use-tenant-branding";
import { api, getApiErrorMessage, setAuthToken } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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

type Step = "form" | "success" | "expired" | "error";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const branding = useTenantBranding();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [step, setStep] = useState<Step>(token ? "form" : "expired");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const colors = useMemo(
    () =>
      getAuthColors(
        branding.primaryColor,
        branding.primaryDark,
        branding.primaryLight,
      ),
    [branding.primaryColor, branding.primaryDark, branding.primaryLight],
  );

  const handleResetPassword = async () => {
    setErrorMsg("");

    if (!password.trim()) {
      setErrorMsg("Por favor, insira uma nova senha.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(
        `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      const res = await api.post("/auth/confirm-password-reset", {
        token,
        new_password: password,
      });

      const data = res.data;

      if (data?.verified === false) {
        // Token expired or invalid
        setStep("expired");
        return;
      }

      // Password updated successfully
      if (data?.token) {
        // Auto-login: save JWT token
        await saveToken(data.token);
        setAuthToken(data.token);
      }

      setStep("success");
    } catch (err: any) {
      const msg = getApiErrorMessage(
        err,
        "Erro ao redefinir senha. Tente novamente.",
      );

      // Check if it's a token-related error
      if (
        msg.toLowerCase().includes("expired") ||
        msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("token")
      ) {
        setStep("expired");
      } else {
        setStep("error");
        setErrorMsg(msg);
      }
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
            <Ionicons name="key-outline" size={32} color={colors.primary} />
          </View>
          <Text style={[st.cardTitle, { color: colors.heading }]}>
            {step === "form"
              ? "Nova senha"
              : step === "success"
                ? "Senha redefinida!"
                : step === "expired"
                  ? "Link expirado"
                  : "Erro"}
          </Text>

          {/* ── Form step ── */}
          {step === "form" && (
            <>
              <Text style={[st.cardBody, { color: colors.body }]}>
                Crie uma nova senha para sua conta. Use pelo menos{" "}
                {MIN_PASSWORD_LENGTH} caracteres.
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

              {/* Password field */}
              <View style={st.passwordContainer}>
                <TextInput
                  placeholder="Nova senha"
                  placeholderTextColor={colors.placeholder}
                  style={[
                    st.input,
                    {
                      backgroundColor: colors.inputBg,
                      color: colors.heading,
                      borderColor: colors.inputBorder,
                      paddingRight: 48,
                    },
                  ]}
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={st.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.placeholder}
                  />
                </Pressable>
              </View>

              {/* Confirm password field */}
              <TextInput
                placeholder="Confirmar nova senha"
                placeholderTextColor={colors.placeholder}
                style={[
                  st.input,
                  {
                    backgroundColor: colors.inputBg,
                    color: colors.heading,
                    borderColor: colors.inputBorder,
                  },
                ]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
              />

              {/* Password strength hints */}
              <View style={st.hints}>
                <HintRow
                  met={password.length >= MIN_PASSWORD_LENGTH}
                  text={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres`}
                  colors={colors}
                />
                <HintRow
                  met={
                    confirmPassword.length > 0 && password === confirmPassword
                  }
                  text="Senhas coincidem"
                  colors={colors}
                />
              </View>

              <Pressable
                onPress={handleResetPassword}
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
                      name="checkmark-circle-outline"
                      size={18}
                      color={colors.primaryText}
                    />
                    <Text
                      style={[st.btnPrimaryText, { color: colors.primaryText }]}
                    >
                      Redefinir senha
                    </Text>
                  </>
                )}
              </Pressable>
            </>
          )}

          {/* ── Success step ── */}
          {step === "success" && (
            <>
              <View
                style={[
                  st.statusIcon,
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
                Sua senha foi redefinida com sucesso! Você já pode acessar sua
                conta.
              </Text>

              <Pressable
                onPress={() => router.replace("/login")}
                style={({ pressed }) => [
                  st.btnPrimary,
                  {
                    backgroundColor: pressed
                      ? colors.primaryDark
                      : colors.primary,
                  },
                ]}
              >
                <Ionicons
                  name="log-in-outline"
                  size={18}
                  color={colors.primaryText}
                />
                <Text
                  style={[st.btnPrimaryText, { color: colors.primaryText }]}
                >
                  Ir para o login
                </Text>
              </Pressable>
            </>
          )}

          {/* ── Expired token step ── */}
          {step === "expired" && (
            <>
              <View
                style={[
                  st.statusIcon,
                  { backgroundColor: colors.errorBg || "#fee2e2" },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={48}
                  color={colors.error || "#dc2626"}
                />
              </View>
              <Text style={[st.cardBody, { color: colors.body }]}>
                Este link de recuperação expirou ou já foi utilizado. Solicite
                um novo link para redefinir sua senha.
              </Text>

              <Pressable
                onPress={() => router.replace("/forgot-password")}
                style={({ pressed }) => [
                  st.btnPrimary,
                  {
                    backgroundColor: pressed
                      ? colors.primaryDark
                      : colors.primary,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={colors.primaryText}
                />
                <Text
                  style={[st.btnPrimaryText, { color: colors.primaryText }]}
                >
                  Solicitar novo link
                </Text>
              </Pressable>
            </>
          )}

          {/* ── Error step ── */}
          {step === "error" && (
            <>
              <View
                style={[
                  st.statusIcon,
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
                {errorMsg || "Ocorreu um erro. Tente novamente."}
              </Text>

              <Pressable
                onPress={() => {
                  setStep("form");
                  setPassword("");
                  setConfirmPassword("");
                  setErrorMsg("");
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

          {/* ── Back to login ── */}
          <Pressable
            onPress={() => router.replace("/login")}
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

/* ── Password strength hint row ── */
function HintRow({
  met,
  text,
  colors,
}: {
  met: boolean;
  text: string;
  colors: ReturnType<typeof getAuthColors>;
}) {
  return (
    <View style={st.hintRow}>
      <Ionicons
        name={met ? "checkmark-circle" : "ellipse-outline"}
        size={14}
        color={met ? "#10b981" : colors.placeholder}
      />
      <Text
        style={[st.hintText, { color: met ? "#10b981" : colors.placeholder }]}
      >
        {text}
      </Text>
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
  alertBox: {
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  alertText: { fontSize: 13, textAlign: "center" },
  input: {
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    marginTop: 12,
    borderWidth: 1,
  },
  passwordContainer: {
    position: "relative",
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 24,
    padding: 4,
  },
  hints: {
    marginTop: 12,
    gap: 4,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hintText: {
    fontSize: 12,
  },
  statusIcon: {
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
