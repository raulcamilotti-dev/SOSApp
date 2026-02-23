/**
 * Template Editor – Rich HTML editor with variable insertion.
 *
 * Receives `?id=<uuid>` to edit an existing template,
 * or no param to create a new one.
 * Also accepts `?starter=contrato|procuracao|declaracao` for quick-start.
 */
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    ALL_AVAILABLE_VARIABLES,
    COMMON_VARIABLES,
    CUSTOMER_VARIABLES,
    EMPRESA_VARIABLES,
    PARTNER_VARIABLES,
    PROCESS_VARIABLES,
    PROPERTY_VARIABLES,
    STARTER_TEMPLATES,
    TEMPLATE_CATEGORIES,
    createTemplate,
    extractVariableKeys,
    getTemplate,
    updateTemplate,
    type DocumentTemplate,
    type TemplateVariable,
} from "@/services/document-templates";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ─── Toolbar formatting commands ────────────────────────────────────── */

const TOOLBAR_ACTIONS = [
  { cmd: "bold", icon: "text-outline" as const, label: "B" },
  { cmd: "italic", icon: "text-outline" as const, label: "I" },
  { cmd: "underline", icon: "text-outline" as const, label: "U" },
  { cmd: "insertUnorderedList", icon: "list-outline" as const, label: "•" },
  { cmd: "insertOrderedList", icon: "list-outline" as const, label: "1." },
  { cmd: "justifyLeft", icon: "reorder-four-outline" as const, label: "←" },
  { cmd: "justifyCenter", icon: "reorder-four-outline" as const, label: "↔" },
  { cmd: "justifyRight", icon: "reorder-four-outline" as const, label: "→" },
];

/* ─── Variable palette groups ────────────────────────────────────────── */

const VAR_GROUPS = [
  { title: "Imóvel", vars: PROPERTY_VARIABLES, color: "#3b82f6" },
  { title: "Cliente", vars: CUSTOMER_VARIABLES, color: "#10b981" },
  { title: "Empresa", vars: EMPRESA_VARIABLES, color: "#6366f1" },
  { title: "Parceiro", vars: PARTNER_VARIABLES, color: "#ec4899" },
  { title: "Processo", vars: PROCESS_VARIABLES, color: "#8b5cf6" },
  { title: "Geral", vars: COMMON_VARIABLES, color: "#f59e0b" },
];

export default function TemplateEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    starter?: string;
  }>();
  const { user } = useAuth();

  /* ── Theme colors ── */
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardBg = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const bgColor = useThemeColor({}, "background");

  /* ── State ── */
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("geral");
  const [contentHtml, setContentHtml] = useState("");
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [varModalVisible, setVarModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);

  const editorRef = useRef<any>(null);
  const isEditing = Boolean(params.id);

  /* ── Load existing template ── */
  useEffect(() => {
    if (params.id) {
      setLoading(true);
      getTemplate(params.id)
        .then((t) => {
          if (t) {
            setName(t.name);
            setDescription(t.description ?? "");
            setCategory(t.category);
            setContentHtml(t.content_html);
            setHeaderHtml(t.header_html ?? "");
            setFooterHtml(t.footer_html ?? "");
          }
        })
        .finally(() => setLoading(false));
    } else if (params.starter && params.starter in STARTER_TEMPLATES) {
      setContentHtml(
        STARTER_TEMPLATES[params.starter as keyof typeof STARTER_TEMPLATES],
      );
      setCategory(params.starter);
      setName(
        TEMPLATE_CATEGORIES.find((c) => c.value === params.starter)?.label ??
          "Novo Modelo",
      );
    }
  }, [params.id, params.starter]);

  /* ── Collect all variables used in the HTML ── */
  const usedKeys = extractVariableKeys(contentHtml);
  const usedVars: TemplateVariable[] = usedKeys.map((key) => {
    const found = ALL_AVAILABLE_VARIABLES.find((v) => v.key === key);
    if (found) return found;
    return {
      key,
      label: key,
      type: "text" as const,
      source: "manual" as const,
    };
  });

  /* ── Insert variable at cursor (web) ── */
  const insertVariable = useCallback((key: string) => {
    const tag = `{{${key}}}`;
    if (Platform.OS === "web" && editorRef.current) {
      editorRef.current.focus();
      document.execCommand("insertText", false, tag);
    } else {
      // For native / fallback: append to content
      setContentHtml((prev) => prev + tag);
    }
    setVarModalVisible(false);
  }, []);

  /* ── Execute formatting command (web) ── */
  const execCommand = useCallback((cmd: string) => {
    if (Platform.OS === "web") {
      document.execCommand(cmd, false, undefined);
    }
  }, []);

  /* ── Save template ── */
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Erro", "Preencha o nome do modelo.");
      return;
    }
    if (!contentHtml.trim()) {
      Alert.alert("Erro", "O conteúdo do modelo está vazio.");
      return;
    }

    setSaving(true);
    try {
      // Collect all variables that are actually used in the content
      const allVars = usedVars;

      const payload: Partial<DocumentTemplate> = {
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        content_html: contentHtml,
        header_html: headerHtml || undefined,
        footer_html: footerHtml || undefined,
        variables: allVars,
        tenant_id: user?.tenant_id ?? undefined,
        created_by: user?.id ?? undefined,
      };

      if (isEditing && params.id) {
        await updateTemplate({ ...payload, id: params.id });
        Alert.alert("Sucesso", "Modelo atualizado com sucesso!");
      } else {
        await createTemplate(payload);
        Alert.alert("Sucesso", "Modelo criado com sucesso!");
      }

      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      Alert.alert("Erro", msg);
    } finally {
      setSaving(false);
    }
  };

  /* ── Preview HTML ── */
  const previewHtml = contentHtml.replace(
    /\{\{(\w+)\}\}/g,
    (_m, k) =>
      `<span style="background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:3px;font-weight:600;">{{${k}}}</span>`,
  );

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: bgColor,
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bgColor }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      {/* ── Header ── */}
      <ThemedText
        style={{
          fontSize: 22,
          fontWeight: "700",
          color: textColor,
          marginBottom: 4,
        }}
      >
        {isEditing ? "Editar Modelo" : "Novo Modelo de Documento"}
      </ThemedText>
      <ThemedText style={{ fontSize: 13, color: mutedColor, marginBottom: 16 }}>
        Crie modelos reutilizáveis com variáveis {"{{nome}}"} que serão
        preenchidas automaticamente.
      </ThemedText>

      {/* ── Name ── */}
      <ThemedText
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: textColor,
          marginBottom: 4,
        }}
      >
        Nome do Modelo *
      </ThemedText>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Ex: Contrato de Compra e Venda"
        placeholderTextColor={mutedColor}
        style={{
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor,
          borderRadius: 10,
          padding: 12,
          fontSize: 14,
          color: textColor,
          marginBottom: 12,
        }}
      />

      {/* ── Description ── */}
      <ThemedText
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: textColor,
          marginBottom: 4,
        }}
      >
        Descrição
      </ThemedText>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Breve descrição do modelo"
        placeholderTextColor={mutedColor}
        style={{
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor,
          borderRadius: 10,
          padding: 12,
          fontSize: 14,
          color: textColor,
          marginBottom: 12,
        }}
      />

      {/* ── Category selector ── */}
      <ThemedText
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: textColor,
          marginBottom: 4,
        }}
      >
        Categoria
      </ThemedText>
      <TouchableOpacity
        onPress={() => setCategoryModalVisible(true)}
        style={{
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor,
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <ThemedText style={{ color: textColor, fontSize: 14 }}>
          {TEMPLATE_CATEGORIES.find((c) => c.value === category)?.label ??
            category}
        </ThemedText>
        <Ionicons name="chevron-down" size={16} color={mutedColor} />
      </TouchableOpacity>

      {/* ── Toolbar ── */}
      <ThemedText
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: textColor,
          marginBottom: 4,
        }}
      >
        Conteúdo do Modelo *
      </ThemedText>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 4,
          marginBottom: 8,
        }}
      >
        {/* Formatting buttons */}
        {TOOLBAR_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.cmd}
            onPress={() => execCommand(action.cmd)}
            style={{
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              minWidth: 36,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                fontWeight: action.cmd === "bold" ? "900" : "400",
                fontStyle: action.cmd === "italic" ? "italic" : "normal",
                textDecorationLine:
                  action.cmd === "underline" ? "underline" : "none",
                color: textColor,
                fontSize: 14,
              }}
            >
              {action.label}
            </ThemedText>
          </TouchableOpacity>
        ))}

        {/* Heading selector */}
        {(["H1", "H2", "H3"] as const).map((h, i) => (
          <TouchableOpacity
            key={h}
            onPress={() => {
              if (Platform.OS === "web") {
                document.execCommand("formatBlock", false, `<h${i + 1}>`);
              }
            }}
            style={{
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 6,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{ fontWeight: "700", color: textColor, fontSize: 12 }}
            >
              {h}
            </ThemedText>
          </TouchableOpacity>
        ))}

        {/* Insert variable button */}
        <TouchableOpacity
          onPress={() => setVarModalVisible(true)}
          style={{
            backgroundColor: tintColor,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Ionicons name="code-outline" size={14} color="white" />
          <ThemedText
            style={{ color: "white", fontWeight: "700", fontSize: 12 }}
          >
            Variável
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* ── Rich Text Editor (web: contentEditable div) ── */}
      {Platform.OS === "web" ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: contentHtml }}
          onInput={(e: any) => setContentHtml(e.currentTarget.innerHTML)}
          style={{
            backgroundColor: cardBg,
            border: `1px solid ${borderColor}`,
            borderRadius: 10,
            padding: 16,
            minHeight: 400,
            fontSize: 14,
            lineHeight: 1.6,
            color: textColor,
            outline: "none",
            overflowY: "auto" as const,
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            caretColor: textColor,
          }}
        />
      ) : (
        <TextInput
          value={contentHtml}
          onChangeText={setContentHtml}
          multiline
          placeholder="Escreva o conteúdo do modelo aqui. Use {{variavel}} para inserir variáveis."
          placeholderTextColor={mutedColor}
          style={{
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            padding: 16,
            minHeight: 400,
            fontSize: 14,
            color: textColor,
            textAlignVertical: "top",
          }}
        />
      )}

      {/* ── Variables used badge list ── */}
      {usedVars.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <ThemedText
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: mutedColor,
              marginBottom: 6,
            }}
          >
            Variáveis no modelo ({usedVars.length}):
          </ThemedText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {usedVars.map((v) => {
              const group = VAR_GROUPS.find((g) =>
                g.vars.some((gv) => gv.key === v.key),
              );
              const bg = group?.color ?? "#6b7280";
              return (
                <View
                  key={v.key}
                  style={{
                    backgroundColor: bg + "20",
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ionicons name="code-slash-outline" size={10} color={bg} />
                  <ThemedText
                    style={{ fontSize: 11, color: bg, fontWeight: "600" }}
                  >
                    {v.label}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Cabeçalho (texto simples) ── */}
      <View style={{ marginTop: 16 }}>
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: textColor,
            marginBottom: 4,
          }}
        >
          Cabeçalho (opcional)
        </ThemedText>
        <ThemedText
          style={{ fontSize: 11, color: mutedColor, marginBottom: 4 }}
        >
          Texto exibido no topo do documento (ex: nome da empresa, endereço)
        </ThemedText>
        <TextInput
          value={headerHtml}
          onChangeText={setHeaderHtml}
          multiline
          placeholder="Ex: Minha Empresa | CNPJ 00.000.000/0001-00 | Rua Exemplo, 123"
          placeholderTextColor={mutedColor}
          style={{
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            padding: 12,
            minHeight: 50,
            fontSize: 13,
            color: textColor,
            textAlignVertical: "top",
          }}
        />
      </View>

      {/* ── Rodapé (texto simples) ── */}
      <View style={{ marginTop: 12 }}>
        <ThemedText
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: textColor,
            marginBottom: 4,
          }}
        >
          Rodapé (opcional)
        </ThemedText>
        <ThemedText
          style={{ fontSize: 11, color: mutedColor, marginBottom: 4 }}
        >
          Texto exibido no final do documento (ex: telefone, e-mail)
        </ThemedText>
        <TextInput
          value={footerHtml}
          onChangeText={setFooterHtml}
          multiline
          placeholder="Ex: Tel: (41) 99999-9999 | email@empresa.com"
          placeholderTextColor={mutedColor}
          style={{
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            padding: 12,
            minHeight: 5,
            color: textColor,
            textAlignVertical: "top",
          }}
        />
      </View>

      {/* ── Action buttons ── */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
        <TouchableOpacity
          onPress={() => setPreviewModalVisible(true)}
          style={{
            flex: 1,
            backgroundColor: "#8b5cf620",
            borderWidth: 1,
            borderColor: "#8b5cf6",
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons name="eye-outline" size={18} color="#8b5cf6" />
          <ThemedText
            style={{ color: "#8b5cf6", fontWeight: "700", fontSize: 15 }}
          >
            Preview
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            backgroundColor: saving ? `${tintColor}66` : tintColor,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="white" />
              <ThemedText
                style={{ color: "white", fontWeight: "700", fontSize: 15 }}
              >
                {isEditing ? "Salvar" : "Criar Modelo"}
              </ThemedText>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  MODALS                                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {/* ── Variable Picker Modal ── */}
      <Modal
        visible={varModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setVarModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "70%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <ThemedText
                style={{ fontSize: 17, fontWeight: "700", color: textColor }}
              >
                Inserir Variável
              </ThemedText>
              <TouchableOpacity onPress={() => setVarModalVisible(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {VAR_GROUPS.map((group) => (
                <View key={group.title} style={{ marginBottom: 14 }}>
                  <ThemedText
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: group.color,
                      marginBottom: 6,
                    }}
                  >
                    {group.title}
                  </ThemedText>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    {group.vars.map((v) => (
                      <TouchableOpacity
                        key={v.key}
                        onPress={() => insertVariable(v.key)}
                        style={{
                          backgroundColor: group.color + "15",
                          borderWidth: 1,
                          borderColor: group.color + "40",
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: group.color,
                          }}
                        >
                          {v.label}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 10, color: mutedColor }}>
                          {`{{${v.key}}}`}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Category Picker Modal ── */}
      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 14,
              padding: 20,
              width: "80%",
              maxWidth: 340,
            }}
          >
            <ThemedText
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: textColor,
                marginBottom: 12,
              }}
            >
              Selecionar Categoria
            </ThemedText>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                onPress={() => {
                  setCategory(cat.value);
                  setCategoryModalVisible(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor:
                    category === cat.value ? tintColor + "20" : "transparent",
                  marginBottom: 2,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 14,
                    fontWeight: category === cat.value ? "700" : "400",
                    color: category === cat.value ? tintColor : textColor,
                  }}
                >
                  {cat.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Preview Modal ── */}
      <Modal
        visible={previewModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "85%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <ThemedText
                style={{ fontSize: 17, fontWeight: "700", color: "#222" }}
              >
                Preview do Modelo
              </ThemedText>
              <TouchableOpacity onPress={() => setPreviewModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {Platform.OS === "web" ? (
                <div
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                  style={{
                    fontFamily: "'Helvetica Neue', Arial, sans-serif",
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "#222",
                    padding: 16,
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    backgroundColor: "#fff",
                  }}
                />
              ) : (
                <ThemedText style={{ color: "#222", fontSize: 13 }}>
                  {contentHtml.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")}
                </ThemedText>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
