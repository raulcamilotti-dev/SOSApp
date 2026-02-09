import { useAuth } from "@/core/auth/AuthContext";
import { getUser, setProfileCompleted } from "@/core/auth/auth.storage";
import { isUserProfileComplete } from "@/core/auth/auth.utils";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

  const isComplete = useMemo(() => isUserProfileComplete(user), [user]);

  useEffect(() => {
    if (isComplete) {
      router.replace("/Usuario/Perfil");
    }
  }, [isComplete, router]);

  const buildUserPatch = (base: any) => {
    if (!base || typeof base !== "object") return {};
    const raw = base.user ?? base.json ?? base.data?.[0] ?? base.data ?? base;
    return {
      id: raw.user_id ?? raw.userId ?? raw.id,
      fullname: raw.fullname ?? raw.full_name ?? raw.name ?? raw.nome,
      name: raw.name ?? raw.nome,
      email: raw.email,
      cpf: raw.cpf,
      phone: raw.phone ?? raw.telefone ?? raw.phone_number,
      telefone: raw.telefone,
      role: raw.role ?? raw.user_role ?? raw.perfil ?? raw.type,
    };
  };

  const handleSave = async () => {
    let userId = user?.id;
    let resolvedEmail = user?.email;
    let resolvedGoogleSub = (user as any)?.google_sub;

    if (!userId) {
      const stored = await getUser();
      userId =
        stored?.id ?? (stored as any)?.user_id ?? (stored as any)?.userId;
      resolvedEmail = resolvedEmail ?? stored?.email;
      resolvedGoogleSub = resolvedGoogleSub ?? (stored as any)?.google_sub;
    }

    if (!userId) {
      try {
        const checkResponse = await fetch(
          "https://n8n.sosescritura.com.br/webhook/user_update_check",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: resolvedEmail,
              google_sub: resolvedGoogleSub,
            }),
          },
        );

        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          const checkPayload = Array.isArray(checkData)
            ? checkData[0]
            : checkData;
          const patchFromCheck = buildUserPatch(checkPayload);
          userId =
            (patchFromCheck as any).id ??
            (checkPayload as any)?.id ??
            (checkPayload as any)?.user_id;

          if (userId) {
            await updateUser(patchFromCheck as any);
          }
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

      const response = await fetch(
        "https://n8n.sosescritura.com.br/webhook/user_update",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            cpf: nextCpf,
            phone: nextPhone,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Falha ao atualizar usuário");
      }

      const data = await response.json();
      const payload = Array.isArray(data) ? data[0] : data;

      const patchFromPayload = buildUserPatch(payload);

      await updateUser({
        ...patchFromPayload,
        cpf: nextCpf,
        phone: nextPhone,
      });
      await setProfileCompleted(userId, true);
      router.replace("/Usuario/Perfil");
    } catch (err) {
      console.error("ERRO AO ATUALIZAR PERFIL", err);
      setError("Não foi possível salvar seus dados.");
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
