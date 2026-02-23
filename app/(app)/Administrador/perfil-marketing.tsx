/**
 * Perfil de Marketing — Tela dedicada para o tenant configurar
 * seu perfil de marketing que será usado pelo assistente criativo de IA.
 *
 * Os dados são salvos em tenants.config.marketing_profile (JSONB).
 * O perfil é utilizado pelas funções de geração de conteúdo em marketing-ai.ts.
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    EMPTY_MARKETING_PROFILE,
    isProfileComplete,
    loadMarketingProfile,
    type MarketingProfile,
    PROFILE_FIELDS,
    saveMarketingProfile,
} from "@/services/marketing-ai";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function PerfilMarketingScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── State ── */
  const [profile, setProfile] = useState<MarketingProfile>({
    ...EMPTY_MARKETING_PROFILE,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  /* ── Load ── */
  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      const saved = await loadMarketingProfile(tenantId);
      setProfile(saved);
      setDirty(false);
    } catch {
      setError("Falha ao carregar perfil de marketing.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    if (!tenantId) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await saveMarketingProfile(tenantId, profile);
      setDirty(false);
      setSuccessMsg("Perfil de marketing salvo com sucesso!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar";
      setError(msg);
      Alert.alert("Erro", msg);
    } finally {
      setSaving(false);
    }
  }, [tenantId, profile]);

  /* ── Update field ── */
  const updateField = useCallback(
    (key: keyof MarketingProfile, value: string) => {
      setProfile((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
      setSuccessMsg(null);
    },
    [],
  );

  /* ── Completeness ── */
  const complete = isProfileComplete(profile);
  const filledCount = PROFILE_FIELDS.filter(
    (f) => (profile[f.key] ?? "").trim().length > 0,
  ).length;
  const totalFields = PROFILE_FIELDS.length;
  const completionPct = Math.round((filledCount / totalFields) * 100);

  /* ── Loading state ── */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <Text style={{ color: mutedColor, marginTop: 12, fontSize: 14 }}>
          Carregando perfil...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── Header ── */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: textColor,
              marginBottom: 4,
            }}
          >
            Perfil de Marketing
          </Text>
          <Text style={{ fontSize: 13, color: mutedColor, lineHeight: 18 }}>
            Configure o perfil da sua empresa para que a IA gere conteúdo
            personalizado e relevante para o seu negócio.
          </Text>
        </View>

        {/* ── Completion indicator ── */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor,
            marginBottom: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: complete ? "#16a34a20" : `${tintColor}15`,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name={complete ? "checkmark-circle" : "color-palette-outline"}
              size={22}
              color={complete ? "#16a34a" : tintColor}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: textColor }}>
              {complete ? "Perfil pronto para uso" : "Complete seu perfil"}
            </Text>
            <Text style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}>
              {filledCount} de {totalFields} campos preenchidos ({completionPct}
              %)
            </Text>
            {/* Progress bar */}
            <View
              style={{
                height: 4,
                backgroundColor: `${borderColor}60`,
                borderRadius: 2,
                marginTop: 8,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: 4,
                  width: `${completionPct}%` as any,
                  backgroundColor: complete ? "#16a34a" : tintColor,
                  borderRadius: 2,
                }}
              />
            </View>
          </View>
        </View>

        {/* ── Info card ── */}
        <View
          style={{
            backgroundColor: `${tintColor}08`,
            borderRadius: 10,
            padding: 14,
            borderWidth: 1,
            borderColor: `${tintColor}20`,
            marginBottom: 24,
            flexDirection: "row",
            gap: 10,
          }}
        >
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={tintColor}
            style={{ marginTop: 1 }}
          />
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              color: mutedColor,
              lineHeight: 18,
            }}
          >
            Quanto mais detalhado o perfil, melhor a qualidade do conteúdo
            gerado pela IA. Preencha pelo menos &ldquo;Descrição do
            Negócio&rdquo; e &ldquo;Público-Alvo&rdquo; para começar.
          </Text>
        </View>

        {/* ── Fields ── */}
        {PROFILE_FIELDS.map((field) => {
          const value = profile[field.key] ?? "";
          const filled = value.trim().length > 0;
          return (
            <View key={field.key} style={{ marginBottom: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: textColor,
                  }}
                >
                  {field.label}
                </Text>
                {filled && (
                  <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                )}
              </View>
              <TextInput
                value={value}
                onChangeText={(text) => updateField(field.key, text)}
                placeholder={field.placeholder}
                placeholderTextColor={`${mutedColor}80`}
                multiline={field.multiline}
                style={{
                  borderWidth: 1,
                  borderColor: filled ? `${tintColor}40` : borderColor,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: inputBg,
                  color: textColor,
                  fontSize: 14,
                  lineHeight: 20,
                  minHeight: field.multiline ? 80 : undefined,
                  textAlignVertical: field.multiline ? "top" : "auto",
                }}
              />
            </View>
          );
        })}

        {/* ── Error ── */}
        {error && (
          <View
            style={{
              backgroundColor: "#dc262615",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              flexDirection: "row",
              gap: 8,
            }}
          >
            <Ionicons name="alert-circle" size={16} color="#dc2626" />
            <Text style={{ flex: 1, color: "#dc2626", fontSize: 13 }}>
              {error}
            </Text>
          </View>
        )}

        {/* ── Success ── */}
        {successMsg && (
          <View
            style={{
              backgroundColor: "#16a34a15",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              flexDirection: "row",
              gap: 8,
            }}
          >
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text style={{ flex: 1, color: "#16a34a", fontSize: 13 }}>
              {successMsg}
            </Text>
          </View>
        )}

        {/* ── Save button ── */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !dirty}
          style={{
            backgroundColor: saving || !dirty ? `${mutedColor}40` : tintColor,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            marginTop: 8,
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="save-outline" size={18} color="#fff" />
          )}
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            {saving ? "Salvando..." : "Salvar Perfil"}
          </Text>
        </TouchableOpacity>

        {!dirty && !successMsg && (
          <Text
            style={{
              fontSize: 12,
              color: mutedColor,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            Nenhuma alteração pendente
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
