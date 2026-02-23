import { isUserProfileComplete } from "@/core/auth/auth.utils";
import { useAuth } from "@/core/auth/AuthContext";
import { getAuthColors, useTenantBranding } from "@/hooks/use-tenant-branding";
import { formatCpf, validateCpf } from "@/services/brasil-api";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const branding = useTenantBranding();
  const colors = useMemo(
    () =>
      getAuthColors(
        branding.primaryColor,
        branding.primaryDark,
        branding.primaryLight,
      ),
    [branding.primaryColor, branding.primaryDark, branding.primaryLight],
  );

  const cpfRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister() {
    try {
      setError("");
      if (password !== confirmPassword) {
        setError("Senhas não conferem");
        return;
      }

      const cpfDigits = cpf.replace(/\D/g, "");
      if (!cpfDigits || !validateCpf(cpfDigits)) {
        setError("CPF inválido");
        return;
      }

      const phoneDigits = phone.replace(/\D/g, "");
      if (!phoneDigits || phoneDigits.length < 10) {
        setError("Telefone inválido. Informe DDD + número.");
        return;
      }

      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setError("Email inválido");
        return;
      }

      setSubmitting(true);
      const result = await register({
        name,
        cpf: cpfDigits,
        phone: phoneDigits,
        email: trimmedEmail,
        password,
      });

      if (!result.user) {
        router.replace("/(auth)/login");
        return;
      }

      if (!result.user.tenant_id) {
        router.replace("/(app)/Usuario/onboarding");
      } else if (!isUserProfileComplete(result.user)) {
        router.replace("/(app)/Usuario/complete-profile");
      } else {
        router.replace("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar");
      console.error("ERRO NO HANDLE REGISTER", err);
    } finally {
      setSubmitting(false);
    }
  }

  /* ======================================================
   * Render
   * ====================================================== */
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={st.scrollContent}
          keyboardShouldPersistTaps="handled"
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
            {branding.subtitle && !branding.isPlatformRoot ? (
              <View
                style={[
                  st.tenantBadge,
                  { backgroundColor: colors.primaryLight },
                ]}
              >
                <Ionicons
                  name="business-outline"
                  size={12}
                  color={colors.primary}
                />
                <Text style={[st.tenantBadgeText, { color: colors.primary }]}>
                  {branding.subtitle}
                </Text>
              </View>
            ) : branding.isPlatformRoot ? (
              <Text style={[st.subtitleText, { color: colors.muted }]}>
                Plataforma de Operações
              </Text>
            ) : null}
          </View>

          {/* ---- Card ---- */}
          <View
            style={[
              st.card,
              {
                backgroundColor: colors.cardBg,
                shadowColor: colors.shadow,
              },
            ]}
          >
            <Text style={[st.cardTitle, { color: colors.heading }]}>
              Criar sua conta
            </Text>
            <Text style={[st.cardSubtitle, { color: colors.body }]}>
              Preencha os dados abaixo para começar
            </Text>

            {error ? (
              <View style={[st.errorBox, { backgroundColor: colors.errorBg }]}>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={colors.error}
                />
                <Text style={[st.errorText, { color: colors.error }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            {/* ---- Name ---- */}
            <Text style={[st.fieldLabel, { color: colors.body }]}>
              Nome completo *
            </Text>
            <TextInput
              placeholder="Seu nome completo"
              placeholderTextColor={colors.placeholder}
              style={[
                st.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.inputText,
                },
              ]}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => cpfRef.current?.focus()}
              blurOnSubmit={false}
              editable={!submitting}
            />

            {/* ---- CPF ---- */}
            <Text style={[st.fieldLabel, { color: colors.body }]}>CPF *</Text>
            <TextInput
              ref={cpfRef}
              placeholder="000.000.000-00"
              placeholderTextColor={colors.placeholder}
              style={[
                st.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.inputText,
                },
              ]}
              value={cpf}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, "");
                setCpf(digits.length >= 3 ? formatCpf(digits) : digits);
              }}
              keyboardType="numeric"
              maxLength={14}
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              blurOnSubmit={false}
              editable={!submitting}
            />

            {/* ---- Phone ---- */}
            <Text style={[st.fieldLabel, { color: colors.body }]}>
              Telefone *
            </Text>
            <TextInput
              ref={phoneRef}
              placeholder="(00) 00000-0000"
              placeholderTextColor={colors.placeholder}
              style={[
                st.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.inputText,
                },
              ]}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              blurOnSubmit={false}
              editable={!submitting}
            />

            {/* ---- Email ---- */}
            <Text style={[st.fieldLabel, { color: colors.body }]}>Email *</Text>
            <TextInput
              ref={emailRef}
              placeholder="seu@email.com"
              placeholderTextColor={colors.placeholder}
              style={[
                st.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.inputText,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              editable={!submitting}
            />

            {/* ---- Password ---- */}
            <Text style={[st.fieldLabel, { color: colors.body }]}>Senha *</Text>
            <View style={st.passwordContainer}>
              <TextInput
                ref={passwordRef}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showPassword}
                style={[
                  st.input,
                  st.passwordInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                    color: colors.inputText,
                  },
                ]}
                value={password}
                onChangeText={setPassword}
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                blurOnSubmit={false}
                editable={!submitting}
              />
              <Pressable
                onPress={() => setShowPassword((p) => !p)}
                style={st.eyeBtn}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            {/* ---- Confirm Password ---- */}
            <Text style={[st.fieldLabel, { color: colors.body }]}>
              Confirmar senha *
            </Text>
            <TextInput
              ref={confirmRef}
              placeholder="Digite a senha novamente"
              placeholderTextColor={colors.placeholder}
              secureTextEntry={!showPassword}
              style={[
                st.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.inputText,
                },
              ]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              returnKeyType="go"
              onSubmitEditing={handleRegister}
              editable={!submitting}
            />

            {/* ---- Register Button ---- */}
            <Pressable
              onPress={handleRegister}
              disabled={submitting}
              style={({ pressed }) => [
                st.btnPrimary,
                {
                  backgroundColor: pressed
                    ? colors.primaryDark
                    : colors.primary,
                  opacity: submitting ? 0.7 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primaryText} />
              ) : (
                <Text
                  style={[st.btnPrimaryText, { color: colors.primaryText }]}
                >
                  Criar conta
                </Text>
              )}
            </Pressable>
          </View>

          {/* ---- Footer ---- */}
          <View style={st.footer}>
            <Text style={[st.footerText, { color: colors.body }]}>
              Já tem conta?{" "}
            </Text>
            <Pressable
              onPress={() => router.replace("/(auth)/login")}
              disabled={submitting}
            >
              <Text style={[st.footerLink, { color: colors.primary }]}>
                Entrar
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ======================================================
 * Styles
 * ====================================================== */
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
  subtitleText: { fontSize: 14, marginTop: 4 },
  tenantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  tenantBadgeText: { fontSize: 12, fontWeight: "600" },
  card: {
    borderRadius: 16,
    padding: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 4,
  },
  cardTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  cardSubtitle: { fontSize: 14, marginBottom: 20 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: { fontSize: 13, fontWeight: "500", flex: 1 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    width: "100%",
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  passwordContainer: { position: "relative", width: "100%" },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: "absolute", right: 14, top: 14 },
  btnPrimary: {
    width: "100%",
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: "700" },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: "700" },
});
