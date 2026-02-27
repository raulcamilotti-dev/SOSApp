import { isUserProfileComplete } from "@/core/auth/auth.utils";
import { useAuth } from "@/core/auth/AuthContext";
import { extractReturnToFromUrl, saveReturnTo } from "@/core/auth/returnTo";
import { getAuthColors, useTenantBranding } from "@/hooks/use-tenant-branding";
import { validateCpf } from "@/services/brasil-api";
import {
    createGovBrAuthRequest,
    getGovBrDiscovery,
    isGovBrConfigured,
} from "@/services/gov-br";

import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useRef, useState } from "react";
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

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const router = useRouter();
  const { login, googleLogin, govBrLogin } = useAuth();
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

  const passwordRef = useRef<TextInput>(null);
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [govBrSubmitting, setGovBrSubmitting] = useState(false);
  const [error, setError] = useState("");
  const lastGoogleTokenRef = useRef<string | null>(null);

  /* ======================================================
   * Google Auth Config
   * ====================================================== */
  const extra =
    Constants.expoConfig?.extra ??
    (Constants.manifest as any)?.extra ??
    (Constants.manifest2 as any)?.extra?.expoClient?.extra ??
    (Constants.manifest2 as any)?.extra ??
    {};
  const googleWebClientId =
    (extra.googleWebClientId as string | undefined) ??
    (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID as string | undefined);
  const googleIosClientId = extra.googleIosClientId as string | undefined;
  const googleAndroidClientId = extra.googleAndroidClientId as
    | string
    | undefined;
  const isGoogleConfigured =
    Platform.OS === "web"
      ? !!googleWebClientId
      : !!googleIosClientId || !!googleAndroidClientId;

  const redirectUri =
    Platform.OS === "web"
      ? AuthSession.makeRedirectUri()
      : AuthSession.makeRedirectUri({ scheme: "portalimoveis" });

  if (__DEV__) {
    console.log("Google redirectUri:", redirectUri);
  }

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: googleWebClientId ?? "MISSING_WEB_CLIENT_ID",
    iosClientId: googleIosClientId,
    androidClientId: googleAndroidClientId,
    scopes: ["profile", "email"],
    responseType: AuthSession.ResponseType.IdToken,
    redirectUri,
  });

  /* ======================================================
   * Google Auth Response Handler
   * ====================================================== */
  useEffect(() => {
    const handleGoogleResponse = async () => {
      if (response?.type !== "success") return;

      const idToken =
        response.authentication?.idToken ??
        (response.params as { id_token?: string } | undefined)?.id_token;
      if (!idToken) {
        setError("Não foi possível obter o token do Google");
        return;
      }

      if (lastGoogleTokenRef.current === idToken || googleSubmitting) {
        return;
      }

      lastGoogleTokenRef.current = idToken;

      try {
        setGoogleSubmitting(true);
        setError("");
        // Persist returnTo from URL before login redirects lose it
        const urlReturnTo = extractReturnToFromUrl();
        if (urlReturnTo) saveReturnTo(urlReturnTo);
        const loggedUser = await googleLogin(idToken);
        if (!loggedUser.tenant_id) {
          router.replace("/(app)/Usuario/selecionar-tenant");
        } else if (!isUserProfileComplete(loggedUser)) {
          router.replace("/(app)/Usuario/complete-profile");
        } else {
          router.replace("/Usuario/Perfil");
        }
      } catch (err) {
        console.error("ERRO NO LOGIN GOOGLE", err);
        setError("Não foi possível entrar com Google");
      } finally {
        setGoogleSubmitting(false);
      }
    };

    handleGoogleResponse();
  }, [response, googleLogin, router, googleSubmitting]);

  /* ======================================================
   * Login Handler
   * ====================================================== */
  async function handleLogin() {
    try {
      setSubmitting(true);
      setError("");

      const cpfDigits = cpf.replace(/\D/g, "");
      if (cpfDigits.length === 11 && !validateCpf(cpfDigits)) {
        setError("CPF inválido");
        setSubmitting(false);
        return;
      }

      // Persist returnTo from URL before login redirects lose it
      const urlReturnTo = extractReturnToFromUrl();
      if (urlReturnTo) saveReturnTo(urlReturnTo);

      const result = await login(cpf, password);
      if (!result.tenant_id) {
        router.replace("/(app)/Usuario/selecionar-tenant");
      } else if (!isUserProfileComplete(result)) {
        router.replace("/(app)/Usuario/complete-profile");
      } else {
        router.replace("/Usuario/Perfil");
      }
    } catch (error) {
      console.error("ERRO NO HANDLE LOGIN", error);
      setError("CPF ou senha incorretos");
    } finally {
      setSubmitting(false);
    }
  }

  /* ======================================================
   * Google Login Handler
   * ====================================================== */
  async function handleGoogleLogin() {
    if (!isGoogleConfigured) {
      setError(
        Platform.OS === "web"
          ? "Configure o Client ID WEB do Google no app.json"
          : "Configure os Client IDs iOS/Android no app.json",
      );
      return;
    }

    try {
      setError("");
      const useProxy =
        Platform.OS !== "web" && Constants.appOwnership === "expo";
      const promptOptions = useProxy
        ? ({ useProxy: true } as AuthSession.AuthRequestPromptOptions)
        : undefined;
      await promptAsync(promptOptions);
    } catch (err) {
      console.error("ERRO AO INICIAR GOOGLE", err);
      setError("Não foi possível iniciar o login com Google");
    }
  }

  /* ======================================================
   * Gov.br Login Handler
   * ====================================================== */
  async function handleGovBrLogin() {
    if (!isGovBrConfigured()) {
      setError(
        "Login Gov.br não está configurado. Configure govBrClientId no app.json.",
      );
      return;
    }

    try {
      setGovBrSubmitting(true);
      setError("");

      const discovery = getGovBrDiscovery();
      const config = createGovBrAuthRequest();
      const authRequest = new AuthSession.AuthRequest(config);
      await authRequest.makeAuthUrlAsync(discovery);

      const result = await authRequest.promptAsync(discovery);

      if (result.type !== "success" || !result.params?.code) {
        if (result.type !== "dismiss") {
          setError("Autenticação Gov.br cancelada ou falhou");
        }
        return;
      }

      // Persist returnTo from URL before login redirects lose it
      const urlReturnTo = extractReturnToFromUrl();
      if (urlReturnTo) saveReturnTo(urlReturnTo);

      const loggedUser = await govBrLogin(
        result.params.code,
        authRequest.codeVerifier ?? undefined,
      );

      if (!loggedUser.tenant_id) {
        router.replace("/(app)/Usuario/selecionar-tenant");
      } else if (!isUserProfileComplete(loggedUser)) {
        router.replace("/(app)/Usuario/complete-profile");
      } else {
        router.replace("/Usuario/Perfil");
      }
    } catch (err) {
      console.error("ERRO NO LOGIN GOV.BR", err);
      setError("Não foi possível entrar com Gov.br");
    } finally {
      setGovBrSubmitting(false);
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

  const anySubmitting = submitting || googleSubmitting || govBrSubmitting;

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
              Entrar na sua conta
            </Text>
            <Text style={[st.cardSubtitle, { color: colors.body }]}>
              Informe seu CPF e senha para acessar
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

            {/* ---- CPF ---- */}
            <Text style={[st.fieldLabel, { color: colors.body }]}>CPF</Text>
            <TextInput
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
              onChangeText={setCpf}
              keyboardType="numeric"
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              editable={!anySubmitting}
            />

            {/* ---- Password ---- */}
            <Text style={[st.fieldLabel, { color: colors.body }]}>Senha</Text>
            <View style={st.passwordContainer}>
              <TextInput
                ref={passwordRef}
                placeholder="Sua senha"
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
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={!anySubmitting}
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

            {/* ---- Forgot ---- */}
            <Pressable
              onPress={() => router.push("/(auth)/forgot-password")}
              disabled={anySubmitting}
              style={st.forgotRow}
            >
              <Text style={[st.forgotText, { color: colors.primary }]}>
                Esqueci minha senha
              </Text>
            </Pressable>

            {/* ---- Login Button ---- */}
            <Pressable
              onPress={handleLogin}
              disabled={anySubmitting}
              style={({ pressed }) => [
                st.btnPrimary,
                {
                  backgroundColor: pressed
                    ? colors.primaryDark
                    : colors.primary,
                  opacity: anySubmitting ? 0.7 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primaryText} />
              ) : (
                <Text
                  style={[st.btnPrimaryText, { color: colors.primaryText }]}
                >
                  Entrar
                </Text>
              )}
            </Pressable>

            {/* ---- Divider ---- */}
            <View style={st.dividerRow}>
              <View
                style={[st.dividerLine, { backgroundColor: colors.border }]}
              />
              <Text style={[st.dividerText, { color: colors.muted }]}>ou</Text>
              <View
                style={[st.dividerLine, { backgroundColor: colors.border }]}
              />
            </View>

            {/* ---- Google ---- */}
            <Pressable
              onPress={handleGoogleLogin}
              disabled={!request || googleSubmitting || anySubmitting}
              style={({ pressed }) => [
                st.btnSocial,
                {
                  backgroundColor: pressed ? colors.border : colors.googleBg,
                  borderColor: colors.googleBorder,
                  opacity: googleSubmitting ? 0.6 : 1,
                },
              ]}
            >
              {googleSubmitting ? (
                <ActivityIndicator size="small" color={colors.googleText} />
              ) : (
                <>
                  <Ionicons
                    name="logo-google"
                    size={18}
                    color={colors.googleText}
                  />
                  <Text
                    style={[st.btnSocialText, { color: colors.googleText }]}
                  >
                    Entrar com Google
                  </Text>
                </>
              )}
            </Pressable>

            {/* ---- Gov.br ---- */}
            <Pressable
              onPress={handleGovBrLogin}
              disabled={
                govBrSubmitting || !isGovBrConfigured() || anySubmitting
              }
              style={({ pressed }) => [
                st.btnSocial,
                {
                  backgroundColor: pressed ? "#0e3d8c" : colors.govBrBg,
                  borderColor: colors.govBrBg,
                  opacity: govBrSubmitting || !isGovBrConfigured() ? 0.4 : 1,
                },
              ]}
            >
              {govBrSubmitting ? (
                <ActivityIndicator size="small" color={colors.govBrText} />
              ) : (
                <>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color={colors.govBrText}
                  />
                  <Text style={[st.btnSocialText, { color: colors.govBrText }]}>
                    {!isGovBrConfigured()
                      ? "Gov.br (não configurado)"
                      : "Entrar com Gov.br"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* ---- Footer ---- */}
          <View style={st.footer}>
            <Text style={[st.footerText, { color: colors.body }]}>
              Não tem conta?{" "}
            </Text>
            <Pressable
              onPress={() => router.push("/(auth)/register")}
              disabled={anySubmitting}
            >
              <Text style={[st.footerLink, { color: colors.primary }]}>
                Criar conta
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
  forgotRow: { alignSelf: "flex-end", marginTop: 8, marginBottom: 4 },
  forgotText: { fontSize: 13, fontWeight: "600" },
  btnPrimary: {
    width: "100%",
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: "700" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: "500", marginHorizontal: 12 },
  btnSocial: {
    width: "100%",
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 10,
  },
  btnSocialText: { fontSize: 14, fontWeight: "600" },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: "700" },
});
