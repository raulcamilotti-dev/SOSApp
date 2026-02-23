import { getAuthColors, useTenantBranding } from "@/hooks/use-tenant-branding";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

export default function ForgotPasswordScreen() {
  const router = useRouter();
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
      <ScrollView
        contentContainerStyle={st.scrollContent}
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
        </View>

        {/* ---- Card ---- */}
        <View
          style={[
            st.card,
            { backgroundColor: colors.cardBg, shadowColor: colors.shadow },
          ]}
        >
          <View style={st.iconRow}>
            <Ionicons
              name="lock-closed-outline"
              size={32}
              color={colors.primary}
            />
          </View>
          <Text style={[st.cardTitle, { color: colors.heading }]}>
            Recuperar senha
          </Text>
          <Text style={[st.cardBody, { color: colors.body }]}>
            Entre em contato com o suporte para redefinir sua senha. Estamos
            trabalhando para disponibilizar a recuperação automática em breve.
          </Text>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              st.btnPrimary,
              {
                backgroundColor: pressed ? colors.primaryDark : colors.primary,
              },
            ]}
          >
            <Ionicons
              name="arrow-back-outline"
              size={18}
              color={colors.primaryText}
            />
            <Text style={[st.btnPrimaryText, { color: colors.primaryText }]}>
              Voltar para login
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

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
  card: {
    borderRadius: 16,
    padding: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 4,
  },
  iconRow: { alignItems: "center", marginBottom: 12 },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  cardBody: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 10,
    marginTop: 24,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: "700" },
});
