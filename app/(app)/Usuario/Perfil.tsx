import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const mutedTextColor = useThemeColor({}, "muted");

  if (!user) return null;

  const handleLogout = () => {
    Alert.alert("Logout", "Tem certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/(app)");
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1 }}>
      <ThemedView>
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <ThemedText type="title">{user.fullname || user.name}</ThemedText>
          <ThemedText style={{ color: mutedTextColor, marginTop: 4 }}>
            {user.role}
          </ThemedText>
        </View>
        <View style={{ marginTop: 24 }}>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>
            Informações Pessoais
          </ThemedText>
          <ProfileCard
            label="Nome Completo"
            value={user.fullname || user.name}
            mutedTextColor={mutedTextColor}
          />
          <ProfileCard
            label="CPF"
            value={user.cpf}
            mutedTextColor={mutedTextColor}
          />
          <ProfileCard
            label="Email"
            value={user.email}
            mutedTextColor={mutedTextColor}
          />
          <ProfileCard
            label="Telefone"
            value={user.phone || "-"}
            mutedTextColor={mutedTextColor}
          />
        </View>
        <View style={{ marginTop: 32 }}>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>
            Segurança
          </ThemedText>
          <ActionButton
            label="Alterar Senha"
            onPress={() => router.push("/(app)/Usuario/change-password")}
          />
        </View>
        <TouchableOpacity
          onPress={handleLogout}
          style={{ marginTop: 40, marginBottom: 24 }}
        >
          <View style={{ alignItems: "center" }}>
            <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>
              Sair da Conta
            </ThemedText>
          </View>
        </TouchableOpacity>
      </ThemedView>
    </ScrollView>
  );
}

function ProfileCard({
  label,
  value,
  mutedTextColor,
}: {
  label: string;
  value?: string;
  mutedTextColor: string;
}) {
  return (
    <View style={styles.processCard}>
      <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
        {label}
      </ThemedText>
      <ThemedText style={{ fontSize: 14, fontWeight: "600", marginTop: 2 }}>
        {value || "-"}
      </ThemedText>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={{ marginBottom: 10 }}>
      <ThemedText style={{ fontSize: 14, fontWeight: "600" }}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}
