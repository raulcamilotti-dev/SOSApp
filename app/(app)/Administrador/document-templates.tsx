/**
 * Document Templates – Admin list screen.
 *
 * Lists all templates with search/filter, allows create/edit/delete,
 * and quick-start from pre-built models (contrato, procuração, declaração).
 */
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    TEMPLATE_CATEGORIES,
    deleteTemplate,
    extractVariableKeys,
    listTemplates,
    parseVariables,
    type DocumentTemplate,
} from "@/services/document-templates";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  contrato: "document-text-outline",
  procuracao: "hand-left-outline",
  declaracao: "clipboard-outline",
  requerimento: "mail-outline",
  notificacao: "notifications-outline",
  recibo: "receipt-outline",
  geral: "document-outline",
  outro: "ellipsis-horizontal-outline",
};

export default function DocumentTemplatesScreen() {
  const router = useRouter();
  const { user } = useAuth();

  /* ── Theme ── */
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardBg = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const bgColor = useThemeColor({}, "background");

  /* ── State ── */
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  /* ── Fetch ── */
  const fetchTemplates = useCallback(async () => {
    try {
      const list = await listTemplates();
      setTemplates(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchTemplates().finally(() => setLoading(false));
  }, [fetchTemplates]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTemplates();
    setRefreshing(false);
  };

  /* ── Filter ── */
  const filtered = templates.filter((t) => {
    if (filterCategory && t.category !== filterCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  /* ── Delete ── */
  const handleDelete = (t: DocumentTemplate) => {
    const doDelete = async () => {
      try {
        await deleteTemplate(t.id);
        setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      } catch {
        if (Platform.OS === "web") {
          window.alert("Falha ao excluir modelo.");
        } else {
          Alert.alert("Erro", "Falha ao excluir modelo.");
        }
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Excluir "${t.name}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert("Excluir modelo", `Excluir "${t.name}"?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Excluir", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  /* ── Format date ── */
  const fmtDate = (s?: string) => {
    if (!s) return "";
    const d = new Date(s);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  /* ── Parse variables count ── */
  const varsCount = (t: DocumentTemplate) => {
    // First try from variables field
    const vars = parseVariables(t.variables);
    if (vars.length > 0) return vars.length;
    // Fallback: count from content_html
    if (t.content_html) return extractVariableKeys(t.content_html).length;
    return 0;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bgColor }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 4,
        }}
      >
        <View style={{ flex: 1 }}>
          <ThemedText
            style={{ fontSize: 22, fontWeight: "700", color: textColor }}
          >
            Modelos de Documentos
          </ThemedText>
          <ThemedText style={{ fontSize: 13, color: mutedColor, marginTop: 2 }}>
            Crie e gerencie modelos reutilizáveis com variáveis automáticas
          </ThemedText>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/Administrador/template-editor" as never)}
          style={{
            backgroundColor: tintColor,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons name="add" size={18} color="white" />
          <ThemedText
            style={{ color: "white", fontWeight: "700", fontSize: 14 }}
          >
            Novo
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* ── Quick-start cards ── */}
      <View style={{ marginTop: 14, marginBottom: 16 }}>
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: mutedColor,
            marginBottom: 8,
          }}
        >
          Modelos rápidos
        </ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[
              {
                key: "contrato",
                label: "Contrato",
                icon: "document-text-outline" as const,
                color: "#3b82f6",
              },
              {
                key: "procuracao",
                label: "Procuração",
                icon: "hand-left-outline" as const,
                color: "#8b5cf6",
              },
              {
                key: "declaracao",
                label: "Declaração",
                icon: "clipboard-outline" as const,
                color: "#10b981",
              },
              {
                key: "requerimento",
                label: "Requerimento",
                icon: "mail-outline" as const,
                color: "#f59e0b",
              },
              {
                key: "recibo",
                label: "Recibo",
                icon: "receipt-outline" as const,
                color: "#ef4444",
              },
              {
                key: "orcamento",
                label: "Orçamento",
                icon: "calculator-outline" as const,
                color: "#06b6d4",
              },
              {
                key: "notificacao",
                label: "Notificação",
                icon: "notifications-outline" as const,
                color: "#ec4899",
              },
            ].map((s) => (
              <TouchableOpacity
                key={s.key}
                onPress={() =>
                  router.push(
                    `/Administrador/template-editor?starter=${s.key}` as never,
                  )
                }
                style={{
                  width: 90,
                  backgroundColor: s.color + "12",
                  borderWidth: 1,
                  borderColor: s.color + "30",
                  borderRadius: 10,
                  padding: 10,
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name={s.icon as never} size={22} color={s.color} />
                <ThemedText
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: s.color,
                    textAlign: "center",
                  }}
                >
                  {s.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* ── Generated docs library link ── */}
      <TouchableOpacity
        onPress={() =>
          router.push("/Administrador/generated-documents" as never)
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: "#10b98115",
          borderWidth: 1,
          borderColor: "#10b98140",
          borderRadius: 10,
          padding: 12,
          marginBottom: 14,
        }}
      >
        <Ionicons name="folder-open-outline" size={18} color="#10b981" />
        <ThemedText
          style={{ fontSize: 13, fontWeight: "600", color: "#10b981", flex: 1 }}
        >
          Documentos Gerados
        </ThemedText>
        <Ionicons name="chevron-forward" size={16} color="#10b981" />
      </TouchableOpacity>

      {/* ── Search & Filter ── */}
      <View
        style={{
          backgroundColor: cardBg,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          padding: 14,
          marginBottom: 14,
          gap: 10,
        }}
      >
        <ThemedText
          style={{ fontSize: 14, fontWeight: "600", color: textColor }}
        >
          Pesquisa e filtros
        </ThemedText>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nome, categoria..."
          placeholderTextColor={mutedColor}
          style={{
            backgroundColor: bgColor,
            borderWidth: 1,
            borderColor,
            borderRadius: 8,
            padding: 10,
            fontSize: 14,
            color: textColor,
          }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity
              onPress={() => setFilterCategory(null)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: !filterCategory ? tintColor : borderColor,
                backgroundColor: !filterCategory
                  ? tintColor + "15"
                  : "transparent",
              }}
            >
              <ThemedText
                style={{
                  fontSize: 12,
                  fontWeight: !filterCategory ? "700" : "400",
                  color: !filterCategory ? tintColor : textColor,
                }}
              >
                Todos
              </ThemedText>
            </TouchableOpacity>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                onPress={() =>
                  setFilterCategory(
                    filterCategory === cat.value ? null : cat.value,
                  )
                }
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor:
                    filterCategory === cat.value ? tintColor : borderColor,
                  backgroundColor:
                    filterCategory === cat.value
                      ? tintColor + "15"
                      : "transparent",
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 12,
                    fontWeight: filterCategory === cat.value ? "700" : "400",
                    color: filterCategory === cat.value ? tintColor : textColor,
                  }}
                >
                  {cat.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* ── Templates list ── */}
      {loading ? (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color={tintColor} />
        </View>
      ) : filtered.length === 0 ? (
        <View
          style={{
            padding: 30,
            alignItems: "center",
            backgroundColor: cardBg,
            borderRadius: 12,
            borderWidth: 1,
            borderColor,
          }}
        >
          <Ionicons name="document-outline" size={40} color={mutedColor} />
          <ThemedText style={{ fontSize: 14, color: mutedColor, marginTop: 8 }}>
            {templates.length === 0
              ? "Nenhum modelo criado. Comece criando o primeiro!"
              : "Nenhum modelo encontrado para o filtro atual."}
          </ThemedText>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {filtered.map((t) => {
            const catLabel =
              TEMPLATE_CATEGORIES.find((c) => c.value === t.category)?.label ??
              t.category;
            const icon = CATEGORY_ICONS[t.category] ?? "document-outline";
            const count = varsCount(t);

            return (
              <View
                key={t.id}
                style={{
                  backgroundColor: cardBg,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: tintColor + "15",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name={icon} size={20} color={tintColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: textColor,
                      }}
                    >
                      {t.name}
                    </ThemedText>
                    {t.description ? (
                      <ThemedText
                        style={{ fontSize: 12, color: mutedColor }}
                        numberOfLines={1}
                      >
                        {t.description}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>

                {/* Meta info */}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: "#3b82f620",
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: "#3b82f6",
                      }}
                    >
                      {catLabel}
                    </ThemedText>
                  </View>
                  <View
                    style={{
                      backgroundColor: "#8b5cf620",
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: "#8b5cf6",
                      }}
                    >
                      {count} variáveis
                    </ThemedText>
                  </View>
                  {t.created_at && (
                    <View
                      style={{
                        backgroundColor: mutedColor + "15",
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }}
                    >
                      <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                        Criado em {fmtDate(t.created_at)}
                      </ThemedText>
                    </View>
                  )}
                </View>

                {/* Actions */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <TouchableOpacity
                    onPress={() =>
                      router.push(
                        `/Administrador/template-editor?id=${t.id}` as never,
                      )
                    }
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      backgroundColor: tintColor + "15",
                      borderRadius: 8,
                      paddingVertical: 8,
                    }}
                  >
                    <Ionicons
                      name="create-outline"
                      size={14}
                      color={tintColor}
                    />
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: tintColor,
                      }}
                    >
                      Editar
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() =>
                      router.push(
                        `/Administrador/document-generator?templateId=${t.id}` as never,
                      )
                    }
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      backgroundColor: "#10b981" + "15",
                      borderRadius: 8,
                      paddingVertical: 8,
                    }}
                  >
                    <Ionicons
                      name="document-outline"
                      size={14}
                      color="#10b981"
                    />
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: "#10b981",
                      }}
                    >
                      Gerar
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDelete(t)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      backgroundColor: "#ef444415",
                      borderRadius: 8,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
