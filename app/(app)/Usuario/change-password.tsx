import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ThemedView } from "../../../components/themed-view";
import { useThemeColor } from "../../../hooks/use-theme-color";
import { api, getApiErrorMessage } from "../../../services/api";

type PasswordStrength = "weak" | "fair" | "good" | "strong";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const inputBg = useThemeColor({}, "input");
  const mutedTextColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const onTintTextColor = useThemeColor({}, "background");
  const borderColor = useThemeColor({}, "border");
  const cardBg = useThemeColor({}, "card");

  // Calculate password strength
  const calculateStrength = (pwd: string): PasswordStrength => {
    if (!pwd) return "weak";
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (pwd.length >= 12) strength++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[^a-zA-Z\d]/.test(pwd)) strength++;

    if (strength <= 1) return "weak";
    if (strength === 2) return "fair";
    if (strength === 3) return "good";
    return "strong";
  };

  const strength = calculateStrength(newPassword);
  const strengthColors = {
    weak: "#dc2626",
    fair: "#f97316",
    good: "#eab308",
    strong: "#22c55e",
  };

  const handleChangePassword = async () => {
    setError("");
    setSuccess(false);

    // Validation
    if (!currentPassword.trim()) {
      setError("Por favor, insira sua senha atual");
      return;
    }

    if (!newPassword.trim()) {
      setError("Por favor, insira a nova senha");
      return;
    }

    if (!confirmPassword.trim()) {
      setError("Por favor, confirme a nova senha");
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

    if (currentPassword === newPassword) {
      setError("A nova senha deve ser diferente da senha atual");
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

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Auto-close after 2 seconds
      setTimeout(() => {
        Alert.alert("Sucesso", "Senha alterada com sucesso!", [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]);
      }, 2000);
    } catch (err: any) {
      setError(
        getApiErrorMessage(err, "Erro ao alterar sua senha. Tente novamente."),
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <ThemedView style={[st.screen, { backgroundColor }]}>
        <ScrollView
          contentContainerStyle={st.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[st.card, { backgroundColor: cardBg }]}>
            <View style={[st.successIcon, { backgroundColor: "#f0fdf4" }]}>
              <Ionicons
                name="checkmark-circle-outline"
                size={48}
                color="#22c55e"
              />
            </View>
            <Text style={[st.cardTitle, { color: textColor }]}>
              Senha Alterada!
            </Text>
            <Text style={[st.cardBody, { color: textColor }]}>
              Sua senha foi alterada com sucesso. Você será redirecionado em
              breve.
            </Text>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[st.screen, { backgroundColor }]}>
      <ScrollView
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={st.header}>
          <Text style={[st.cardTitle, { color: textColor, marginBottom: 8 }]}>
            Alterar Senha
          </Text>
          <Text style={[st.cardSubtext, { color: mutedTextColor }]}>
            Atualize sua senha para manter sua conta segura
          </Text>
        </View>

        {/* Error Alert */}
        {error && (
          <View
            style={[
              st.alertBox,
              {
                backgroundColor: "#fee2e2",
                borderColor: "#fecaca",
              },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
            <Text style={[st.alertText, { color: "#dc2626" }]}>{error}</Text>
          </View>
        )}

        {/* Form Card */}
        <View style={[st.card, { backgroundColor: cardBg }]}>
          {/* Current Password */}
          <View style={st.fieldGroup}>
            <Text style={[st.label, { color: textColor }]}>Senha Atual</Text>
            <View
              style={[
                st.inputWrapper,
                {
                  borderColor,
                  backgroundColor: inputBg,
                },
              ]}
            >
              <TextInput
                placeholder="Digite sua senha atual"
                placeholderTextColor={mutedTextColor}
                secureTextEntry={!showPasswords.current}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                editable={!loading}
                style={[st.input, { color: textColor }]}
              />
              <Pressable
                onPress={() =>
                  setShowPasswords((prev) => ({
                    ...prev,
                    current: !prev.current,
                  }))
                }
              >
                <Ionicons
                  name={
                    showPasswords.current ? "eye-outline" : "eye-off-outline"
                  }
                  size={18}
                  color={mutedTextColor}
                />
              </Pressable>
            </View>
          </View>

          {/* New Password */}
          <View style={st.fieldGroup}>
            <Text style={[st.label, { color: textColor }]}>Nova Senha</Text>
            <View
              style={[
                st.inputWrapper,
                {
                  borderColor,
                  backgroundColor: inputBg,
                },
              ]}
            >
              <TextInput
                placeholder="Digite uma nova senha"
                placeholderTextColor={mutedTextColor}
                secureTextEntry={!showPasswords.new}
                value={newPassword}
                onChangeText={setNewPassword}
                editable={!loading}
                style={[st.input, { color: textColor }]}
              />
              <Pressable
                onPress={() =>
                  setShowPasswords((prev) => ({
                    ...prev,
                    new: !prev.new,
                  }))
                }
              >
                <Ionicons
                  name={showPasswords.new ? "eye-outline" : "eye-off-outline"}
                  size={18}
                  color={mutedTextColor}
                />
              </Pressable>
            </View>

            {/* Password Strength Indicator */}
            {newPassword && (
              <View style={st.strengthIndicator}>
                <View
                  style={[
                    st.strengthBar,
                    { backgroundColor: strengthColors[strength] },
                  ]}
                />
                <Text
                  style={[st.strengthText, { color: strengthColors[strength] }]}
                >
                  Força: {strength === "weak" && "Fraca"}
                  {strength === "fair" && "Razoável"}
                  {strength === "good" && "Boa"}
                  {strength === "strong" && "Forte"}
                </Text>
              </View>
            )}

            {/* Password Requirements */}
            <View style={st.requirementsBox}>
              <PasswordRequirement
                text="Mínimo 6 caracteres"
                met={newPassword.length >= 6}
                color={tintColor}
              />
              <PasswordRequirement
                text="Contém letras maiúsculas e minúsculas"
                met={/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword)}
                color={tintColor}
              />
              <PasswordRequirement
                text="Contém números"
                met={/\d/.test(newPassword)}
                color={tintColor}
              />
              <PasswordRequirement
                text="Diferente da senha atual"
                met={newPassword && currentPassword !== newPassword}
                color={tintColor}
              />
            </View>
          </View>

          {/* Confirm Password */}
          <View style={st.fieldGroup}>
            <Text style={[st.label, { color: textColor }]}>
              Confirmar Senha
            </Text>
            <View
              style={[
                st.inputWrapper,
                {
                  borderColor,
                  backgroundColor: inputBg,
                  borderColor:
                    confirmPassword && newPassword !== confirmPassword
                      ? "#fca5a5"
                      : borderColor,
                },
              ]}
            >
              <TextInput
                placeholder="Confirme a nova senha"
                placeholderTextColor={mutedTextColor}
                secureTextEntry={!showPasswords.confirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
                style={[st.input, { color: textColor }]}
              />
              <Pressable
                onPress={() =>
                  setShowPasswords((prev) => ({
                    ...prev,
                    confirm: !prev.confirm,
                  }))
                }
              >
                <Ionicons
                  name={
                    showPasswords.confirm ? "eye-outline" : "eye-off-outline"
                  }
                  size={18}
                  color={mutedTextColor}
                />
              </Pressable>
            </View>
            {confirmPassword && newPassword !== confirmPassword && (
              <Text style={[st.errorMsg, { color: "#dc2626" }]}>
                As senhas não conferem
              </Text>
            )}
          </View>
        </View>

        {/* Buttons */}
        <View style={st.buttonGroup}>
          <Pressable
            onPress={handleChangePassword}
            disabled={loading}
            style={({ pressed }) => [
              st.btnPrimary,
              {
                backgroundColor: loading ? mutedTextColor : tintColor,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={onTintTextColor} />
            ) : (
              <Text style={[st.btnText, { color: onTintTextColor }]}>
                Salvar Alterações
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            disabled={loading}
            style={({ pressed }) => [
              st.btnSecondary,
              {
                borderColor: tintColor,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[st.btnSecondaryText, { color: tintColor }]}>
              Cancelar
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function PasswordRequirement({
  text,
  met,
  color,
}: {
  text: string;
  met: boolean;
  color: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
      }}
    >
      <Ionicons
        name={met ? "checkmark-circle" : "close-circle"}
        size={16}
        color={met ? color : "#d1d5db"}
      />
      <Text
        style={{
          fontSize: 12,
          color: met ? color : "#9ca3af",
        }}
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
    paddingHorizontal: 16,
    paddingVertical: 24,
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
  },
  header: { marginBottom: 24 },
  cardTitle: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  cardSubtext: { fontSize: 13 },
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  input: { flex: 1, fontSize: 14 },
  strengthIndicator: {
    marginTop: 8,
    gap: 6,
  },
  strengthBar: {
    height: 4,
    borderRadius: 2,
    width: "100%",
  },
  strengthText: { fontSize: 12, fontWeight: "600" },
  requirementsBox: {
    marginTop: 12,
    paddingHorizontal: 12,
  },
  errorMsg: { fontSize: 12, marginTop: 6 },
  alertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  alertText: { fontSize: 13, flex: 1 },
  buttonGroup: { gap: 12 },
  btnPrimary: {
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondary: {
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  btnText: { fontSize: 15, fontWeight: "700" },
  btnSecondaryText: { fontSize: 15, fontWeight: "600" },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    alignSelf: "center",
  },
  cardBody: { fontSize: 14, lineHeight: 22, textAlign: "center" },
});
