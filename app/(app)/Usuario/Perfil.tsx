import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemedText } from "../../../components/themed-text";
import { ThemedView } from "../../../components/themed-view";
import { useAuth } from "../../../core/auth/AuthContext";
import { useThemePreference } from "../../../hooks/use-color-scheme";
import { useThemeColor } from "../../../hooks/use-theme-color";
import Colors from "../../theme/colors";

export default function Profile() {
  const {
    user,
    logout,
    availableTenants,
    selectTenant,
    refreshAvailableTenants,
  } = useAuth();
  const router = useRouter();
  const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(
    null,
  );
  const { preference, setPreference } = useThemePreference();
  const backgroundColor = useThemeColor({}, "background");
  const tintColor = useThemeColor({}, "tint");
  const mutedTextColor = useThemeColor({}, "muted");
  // Garante fundo sÃ³lido para os cards do perfil
  const cardBg = useThemeColor(
    {
      light: Colors.light.card,
      dark: Colors.dark.card,
    },
    "card",
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      refreshAvailableTenants().catch((error) => {
        console.error("Erro ao atualizar tenants no perfil", error);
      });
    }, [refreshAvailableTenants, user]),
  );

  if (!user) return null;

  const currentTenant = availableTenants.find(
    (tenant) => String(tenant.id) === String(user.tenant_id ?? ""),
  );
  const otherTenants = availableTenants.filter(
    (tenant) => String(tenant.id) !== String(user.tenant_id ?? ""),
  );

  const handleTenantSelect = async (tenantId: string) => {
    if (!tenantId || tenantId === user.tenant_id) return;

    try {
      setSwitchingTenantId(tenantId);
      await selectTenant(tenantId);
      Alert.alert("Tenant", "Tenant da sessÃ£o atualizado com sucesso.");
    } catch (error) {
      console.error("Erro ao trocar tenant", error);
      Alert.alert("Tenant", "NÃ£o foi possÃ­vel trocar o tenant.");
    } finally {
      setSwitchingTenantId(null);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Tem certeza que deseja sair?", [
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
    <ScrollView style={{ flex: 1, backgroundColor }}>
      <ThemedView
        style={{
          flex: 1,
          alignItems: "stretch",
          justifyContent: "flex-start",
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 0,
          backgroundColor,
        }}
      >
        {/* Header com Avatar */}
        <View
          style={{
            alignItems: "center",
            paddingVertical: 24,
            borderBottomWidth: 1,
            borderBottomColor: tintColor + "20",
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: tintColor,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <ThemedText
              style={{ fontSize: 36, fontWeight: "bold", color: "#fff" }}
            >
              {user.fullname?.[0] || user.name?.[0] || "U"}
            </ThemedText>
          </View>
          <ThemedText style={{ marginTop: 4, fontSize: 18, fontWeight: "500" }}>
            {user.role}
          </ThemedText>
          <ThemedText type="title">{user.fullname || user.name}</ThemedText>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>
            InformaÃ§Ãµes Pessoais
          </ThemedText>
          <ProfileCard
            icon="id-card"
            label="CPF"
            value={user.cpf}
            cardBg={cardBg}
            tintColor={tintColor}
            mutedTextColor={mutedTextColor}
          />
          <ProfileCard
            icon="mail"
            label="Email"
            value={user.email}
            cardBg={cardBg}
            tintColor={tintColor}
            mutedTextColor={mutedTextColor}
          />
          <ProfileCard
            icon="call"
            label="Telefone"
            value={user.phone || "-"}
            cardBg={cardBg}
            tintColor={tintColor}
            mutedTextColor={mutedTextColor}
          />
        </View>

        {/* AÃ§Ãµes */}
        <View style={{ marginTop: 32 }}>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>
            Tenant da SessÃ£o
          </ThemedText>
          <ProfileCard
            icon="business"
            label="Tenant atual"
            value={`${currentTenant?.company_name || user.tenant_id || "-"}${currentTenant?.role_name ? ` Â· ${currentTenant.role_name}` : ""}`}
            cardBg={cardBg}
            tintColor={tintColor}
            mutedTextColor={mutedTextColor}
          />

          {otherTenants.length > 0 && (
            <ThemedText
              style={{
                marginTop: 2,
                marginBottom: 10,
                fontSize: 12,
                fontWeight: "600",
                color: mutedTextColor,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Trocar para outro tenant
            </ThemedText>
          )}

          {otherTenants.map((tenant) => {
            const isSwitching = switchingTenantId === tenant.id;

            const tenantLabel = tenant.company_name || tenant.id;
            const roleTag = tenant.role_name
              ? ` Â· ${tenant.role_name}`
              : "";

            return (
              <ActionButton
                key={tenant.id}
                icon="swap-horizontal"
                label={
                  isSwitching
                    ? "Trocando tenant..."
                    : `Usar: ${tenantLabel}${roleTag}`
                }
                onPress={() => handleTenantSelect(tenant.id)}
                color={tintColor}
                cardBg={cardBg}
                disabled={Boolean(switchingTenantId)}
              />
            );
          })}

          <ActionButton
            icon="add-circle"
            label="Criar Nova Empresa"
            onPress={() => {
              const msg =
                "Isso vai criar um novo espaÃ§o de trabalho separado, com sua prÃ³pria configuraÃ§Ã£o, equipe e dados.\n\nUse apenas se vocÃª realmente gerencia mais de uma empresa.";
              if (Platform.OS === "web") {
                if (window.confirm(msg)) {
                  router.push("/(app)/Usuario/onboarding" as any);
                }
              } else {
                Alert.alert("Criar nova empresa", msg, [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Continuar",
                    onPress: () =>
                      router.push("/(app)/Usuario/onboarding" as any),
                  },
                ]);
              }
            }}
            color="#16a34a"
            cardBg={cardBg}
          />

          <ThemedText
            type="subtitle"
            style={{ marginTop: 12, marginBottom: 12 }}
          >
            Aparencia
          </ThemedText>
          <ThemeChoiceButton
            icon="phone-portrait-outline"
            label="Automatico (sistema)"
            selected={preference === "system"}
            onPress={() => setPreference("system")}
            tintColor={tintColor}
            cardBg={cardBg}
          />
          <ThemeChoiceButton
            icon="sunny-outline"
            label="Modo claro"
            selected={preference === "light"}
            onPress={() => setPreference("light")}
            tintColor={tintColor}
            cardBg={cardBg}
          />
          <ThemeChoiceButton
            icon="moon-outline"
            label="Modo escuro"
            selected={preference === "dark"}
            onPress={() => setPreference("dark")}
            tintColor={tintColor}
            cardBg={cardBg}
          />

          <ThemedText
            type="subtitle"
            style={{ marginTop: 12, marginBottom: 12 }}
          >
            CalendÃ¡rio
          </ThemedText>
          <ActionButton
            icon="calendar"
            label="Sincronizar CalendÃ¡rio"
            onPress={() => router.push("/(app)/Usuario/CalendarSync" as any)}
            color={tintColor}
            cardBg={cardBg}
          />

          <ThemedText
            type="subtitle"
            style={{ marginTop: 12, marginBottom: 12 }}
          >
            SeguranÃ§a
          </ThemedText>
          <ActionButton
            icon="lock-closed"
            label="Alterar Senha"
            onPress={() => router.push("/(app)/change-password" as any)}
            color={tintColor}
            cardBg={cardBg}
          />
          <ActionButton
            icon="trash"
            label="Excluir Conta"
            onPress={() => router.push("/(app)/Usuario/delete-account" as any)}
            color="#ff3b30"
            cardBg={cardBg}
          />
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          style={{
            marginTop: 40,
            marginBottom: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#ff3b30",
              borderRadius: 12,
              paddingVertical: 16,
              paddingHorizontal: 20,
              alignItems: "center",
              ...(Platform.OS === "web"
                ? { boxShadow: "0px 4px 8px rgba(255, 59, 48, 0.3)" }
                : {
                    shadowColor: "#ff3b30",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 5,
                  }),
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Ionicons name="log-out" size={22} color="#fff" />
              <ThemedText
                style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}
              >
                Sair da Conta
              </ThemedText>
            </View>
          </View>
        </TouchableOpacity>
      </ThemedView>
    </ScrollView>
  );
}

function ProfileCard({
  icon,
  label,
  value,
  cardBg,
  tintColor,
  mutedTextColor,
}: {
  icon: string;
  label: string;
  value?: string;
  cardBg: string;
  tintColor: string;
  mutedTextColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: cardBg,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        gap: 12,
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          backgroundColor: tintColor + "20",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name={icon as any} size={20} color={tintColor} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
          {label}
        </ThemedText>
        <ThemedText style={{ fontSize: 14, fontWeight: "600", marginTop: 2 }}>
          {value || "-"}
        </ThemedText>
      </View>
    </View>
  );
}

function ThemeChoiceButton({
  icon,
  label,
  selected,
  onPress,
  tintColor,
  cardBg,
}: {
  icon: string;
  label: string;
  selected: boolean;
  onPress: () => Promise<void>;
  tintColor: string;
  cardBg: string;
}) {
  return (
    <TouchableOpacity onPress={() => void onPress()}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: cardBg,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
          gap: 12,
          borderWidth: 1,
          borderColor: selected ? tintColor : "transparent",
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: tintColor + "20",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name={icon as any} size={20} color={tintColor} />
        </View>
        <ThemedText style={{ flex: 1, fontSize: 14, fontWeight: "600" }}>
          {label}
        </ThemedText>
        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={20}
          color={selected ? tintColor : "#94a3b8"}
        />
      </View>
    </TouchableOpacity>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  color,
  cardBg,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  color: string;
  cardBg: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: cardBg,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
          gap: 12,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: color + "20",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <ThemedText style={{ fontSize: 14, fontWeight: "600", flex: 1 }}>
          {label}
        </ThemedText>
        <Ionicons name="chevron-forward" size={20} color={color} />
      </View>
    </TouchableOpacity>
  );
}

