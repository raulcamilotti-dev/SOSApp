import { useAuth } from "@/core/auth/AuthContext";
import { getToken, getUser } from "@/core/auth/auth.storage";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { ThemedText } from "../../../components/themed-text";
import { ThemedView } from "../../../components/themed-view";
import { styles } from "../../theme/styles";

const DELETE_ACCOUNT_ENDPOINT =
  "https://n8n.sosescritura.com.br/webhook/userDelete";

export default function DeleteAccountScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const backgroundColor = useThemeColor({}, "background");
  const tintColor = useThemeColor({}, "tint");
  const mutedTextColor = useThemeColor({}, "muted");
  const onTintTextColor = useThemeColor({}, "background");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resolveUserId = async () => {
    if (user?.id) return user.id;
    const stored = await getUser();
    return stored?.id ?? (stored as any)?.user_id ?? (stored as any)?.userId;
  };

  const confirmDelete = () => {
    Alert.alert(
      "Excluir conta",
      "Esta acao e permanente. Tem certeza que deseja excluir sua conta?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Excluir", style: "destructive", onPress: handleDelete },
      ],
    );
  };

  const handleDelete = async () => {
    try {
      setError("");
      setLoading(true);

      const [userId, token] = await Promise.all([resolveUserId(), getToken()]);

      if (!userId || !token) {
        setError("Nao foi possivel identificar o usuario.");
        return;
      }

      const res = await fetch(DELETE_ACCOUNT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, token }),
      });

      if (!res.ok) {
        throw new Error("Falha ao excluir conta");
      }

      await logout();
      router.replace("/(auth)/login");
    } catch (err) {
      console.error("ERRO AO EXCLUIR CONTA", err);
      setError("Nao foi possivel excluir a conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor }}>
      <ThemedView style={[styles.container]}>
        <ThemedText type="title" style={{ marginBottom: 12 }}>
          Excluir conta
        </ThemedText>
        <ThemedText style={{ color: mutedTextColor, marginBottom: 16 }}>
          Ao excluir sua conta, seus dados serao removidos de forma permanente.
        </ThemedText>

        {error ? (
          <ThemedText style={{ color: tintColor, marginBottom: 12 }}>
            {error}
          </ThemedText>
        ) : null}

        <View
          style={{
            padding: 12,
            borderRadius: 10,
            backgroundColor: "#ff3b30",
            marginBottom: 16,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>
            Esta acao nao pode ser desfeita.
          </Text>
        </View>

        <TouchableOpacity
          onPress={confirmDelete}
          style={[
            styles.button,
            { backgroundColor: loading ? mutedTextColor : "#ff3b30" },
          ]}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={onTintTextColor} />
          ) : (
            <ThemedText style={{ color: onTintTextColor, fontWeight: "600" }}>
              Excluir minha conta
            </ThemedText>
          )}
        </TouchableOpacity>
      </ThemedView>
    </ScrollView>
  );
}
