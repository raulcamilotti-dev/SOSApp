import { isUserProfileComplete } from "@/core/auth/auth.utils";
import { useAuth } from "@/core/auth/AuthContext";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../theme/styles";

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const router = useRouter();
  const { login, googleLogin } = useAuth();

  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState("");
  const lastGoogleTokenRef = useRef<string | null>(null);

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
        const loggedUser = await googleLogin(idToken);
        console.log("GOOGLE LOGIN USER", loggedUser);
        if (!isUserProfileComplete(loggedUser)) {
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

  async function handleLogin() {
    try {
      setSubmitting(true);
      setError("");
      const result = await login(cpf, password);
      router.replace("/Usuario/Perfil");
      console.log("RETORNO DO LOGIN", result);
    } catch (error) {
      console.error("ERRO NO HANDLE LOGIN", error);
      setError("CPF ou senha incorretos");
      setSubmitting(false);
    }
  }

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

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Entrar</Text>
        {error && (
          <Text style={{ color: "#d32f2f", marginBottom: 12 }}>{error}</Text>
        )}
        <Text style={styles.label}>CPF</Text>
        <TextInput
          placeholder="CPF"
          style={styles.input}
          value={cpf}
          onChangeText={setCpf}
        />
        <Text style={styles.label}>Senha</Text>
        <TextInput
          placeholder="Senha"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          onPress={handleLogin}
          style={({ pressed }) => ({
            marginTop: 20,
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: pressed ? "#ccc" : "#eee",
            borderRadius: 6,
            alignItems: "center",
          })}
        >
          <Text style={{ fontWeight: "600" }}>
            {submitting ? "Entrando..." : "Entrar"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleGoogleLogin}
          disabled={!request || googleSubmitting}
          style={({ pressed }) => ({
            marginTop: 12,
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: pressed ? "#e5e7eb" : "#ffffff",
            borderRadius: 6,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#e5e7eb",
            opacity: googleSubmitting ? 0.6 : 1,
          })}
        >
          <Text style={{ fontWeight: "600" }}>
            {googleSubmitting ? "Conectando..." : "Entrar com Google"}
          </Text>
        </Pressable>

        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              "Esqueci minha senha",
              "Funcionalidade não implementada.",
            );
          }}
        >
          <Text style={styles.link}>Esqueci minha senha</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            router.push("/register");
          }}
        >
          <Text style={styles.link}>Criar conta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
