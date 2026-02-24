import { useAuth } from "@/core/auth/AuthContext";
import { getUser, setProfileCompleted } from "@/core/auth/auth.storage";
import { isUserProfileComplete } from "@/core/auth/auth.utils";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { styles } from "../../theme/styles";

export default function CompleteProfile() {
  const { user, updateUser, logout } = useAuth();
  const router = useRouter();
  const initialPhone = (user?.phone ?? user?.telefone ?? "").toString().trim();
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const onTintTextColor = useThemeColor({}, "background");

  const [cpf, setCpf] = useState(user?.cpf ?? "");
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigatedRef = useRef(false);

  const isComplete = useMemo(() => isUserProfileComplete(user), [user]);

  useEffect(() => {
    if (isComplete && !saving && !navigatedRef.current) {
      navigatedRef.current = true;
      router.replace("/");
    }
  }, [isComplete, saving, router]);

  const handleSave = async () => {
    let userId = user?.id;

    if (!userId) {
      const stored = await getUser();
      userId =
        stored?.id ?? (stored as any)?.user_id ?? (stored as any)?.userId;
    }

    // Fallback: try to find user by email via api_crud
    if (!userId && user?.email) {
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "users",
          ...buildSearchParams([
            { field: "email", value: user.email, operator: "equal" },
          ]),
          limit: "1",
        });
        const rows = normalizeCrudList<any>(res.data);
        if (rows.length > 0) {
          userId = rows[0].id;
          await updateUser({ id: rows[0].id } as any);
        }
      } catch (err) {
        console.error("ERRO AO RESOLVER USUÁRIO", err);
      }
    }

    if (!userId) {
      setError("Não foi possível identificar o usuário.");
      return;
    }

    const nextCpf = cpf.trim();
    const nextPhone = phone.trim();

    if (!nextCpf || !nextPhone) {
      setError("Informe CPF e telefone para continuar.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      // Update user via api_crud (through updateUser which now persists to backend)
      await updateUser({
        cpf: nextCpf,
        phone: nextPhone,
      });
      await setProfileCompleted(userId, true);

      // Navigate — the useEffect guard also covers this via isComplete
      if (!navigatedRef.current) {
        navigatedRef.current = true;
        router.replace("/");
      }
    } catch (err) {
      console.error("ERRO AO ATUALIZAR PERFIL", err);
      setError("Não foi possível salvar seus dados. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sair", "Deseja sair da conta?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <Text style={[styles.title, { color: textColor }]}>
          Complete seu cadastro
        </Text>
        <Text style={[styles.mutedText, { color: mutedTextColor }]}>
          Para continuar, preencha os dados obrigatórios abaixo.
        </Text>

        {error ? (
          <Text style={{ color: tintColor, marginTop: 12 }}>{error}</Text>
        ) : null}

        <Text style={styles.label}>CPF</Text>
        <TextInput
          placeholder="CPF"
          style={styles.input}
          value={cpf}
          onChangeText={setCpf}
          keyboardType="numeric"
          editable={!saving}
        />

        <Text style={styles.label}>Telefone</Text>
        <TextInput
          placeholder="Telefone"
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          editable={!saving}
        />

        <Pressable
          onPress={handleSave}
          style={({ pressed }) => ({
            marginTop: 20,
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: tintColor,
            borderRadius: 6,
            alignItems: "center",
            opacity: saving ? 0.7 : 1,
          })}
          disabled={saving}
        >
          <Text style={{ fontWeight: "600", color: onTintTextColor }}>
            {saving ? "Salvando..." : "Salvar e continuar"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: cardColor,
            borderRadius: 6,
            alignItems: "center",
            borderWidth: 1,
            borderColor: borderColor,
          })}
          disabled={saving}
        >
          <Text style={{ fontWeight: "600", color: textColor }}>
            Sair da conta
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
