import { useState } from "react";
import {
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";
import { useThemeColor } from "../../hooks/use-theme-color";
import { api } from "../../services/api";
import { styles } from "../theme/styles";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const backgroundColor = useThemeColor(
    { light: "#fff", dark: "#1a1a1a" },
    "background",
  );
  const textColor = useThemeColor(
    { light: "#000", dark: "#fff" },
    "text",
  );
  const inputBg = useThemeColor(
    { light: "#f5f5f5", dark: "#2a2a2a" },
    "background",
  );

  const handleChangePassword = async () => {
    setError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Todos os campos são obrigatórios");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Nova senha e confirmação não conferem");
      return;
    }

    if (newPassword.length < 6) {
      setError("Nova senha deve ter pelo menos 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      const token = await SecureStore.getItemAsync("token");

      await api.post(
        "/change-password",
        {
          currentPassword,
          newPassword,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      Alert.alert("Sucesso", "Senha alterada com sucesso!", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Erro ao alterar senha. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ThemedText type="title" style={{ marginBottom: 24 }}>
        Alterar Senha
      </ThemedText> 
      {error ? (
        <ThemedText style={{ color: "#d32f2f", marginBottom: 12 }}>

          {error} 
        </ThemedText>
      ) : null}
      <TextInput
        placeholder="Senha Atual"
        placeholderTextColor={textColor + "80"}
        style={[styles.input, { backgroundColor: inputBg, color: textColor }]}
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
        editable={!loading}
      />
      <TextInput
        placeholder="Nova Senha"
        placeholderTextColor={textColor + "80"}
        style={[styles.input, { backgroundColor: inputBg, color: textColor }]}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        editable={!loading}
      />

      <TextInput
        placeholder="Confirmar Nova Senha"
        placeholderTextColor={textColor + "80"}
        style={[styles.input, { backgroundColor: inputBg, color: textColor }]}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!loading}
      />
      <TouchableOpacity
        onPress={handleChangePassword}
        style={[
          styles.button,
          { backgroundColor: loading ? "#ccc" : "#4caf50" },
        ]}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={{ color: "#fff", fontWeight: "600" }}>
            Salvar Alterações
          </ThemedText>
        )}
      </TouchableOpacity>
    </ThemedView>
  );
}
    