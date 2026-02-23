/**
 * Document Generator – Fill template variables and generate PDF.
 *
 * Route: /Administrador/document-generator?templateId=<uuid>&propertyId=<uuid?>
 * 1. Loads template and its variables
 * 2. Auto-fills from property/customer/partner data when available
 * 3. Shows all variables as editable form fields
 * 4. Live HTML preview
 * 5. Generate PDF via n8n backend
 * 6. Save generated document + download
 */
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    autoFillVariables,
    buildFullHtml,
    createGeneratedDocument,
    extractVariableKeys,
    generatePdf,
    getTemplate,
    interpolateVariables,
    listTemplates,
    parseVariables,
    updateGeneratedDocument,
    type DocumentTemplate,
    type GeneratedDocument,
    type TemplateVariable,
} from "@/services/document-templates";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ── Generic entity type for selectors ── */
type Entity = Record<string, unknown>;

/* ── Helper: entity display label ── */
function entityLabel(entity: Entity, table: string): string {
  switch (table) {
    case "properties":
      return (
        `${entity.address ?? ""} ${entity.number ?? ""} - ${entity.city ?? ""}`.trim() ||
        String(entity.id ?? "")
      );
    case "customers":
      return String(
        entity.name ?? entity.full_name ?? entity.email ?? entity.id ?? "",
      );
    case "partners":
      return String(entity.name ?? entity.company_name ?? entity.id ?? "");
    default:
      return String(entity.name ?? entity.id ?? "");
  }
}

/* ── Helper: extract body from full HTML wrapper ── */
function extractDocBody(html: string): string {
  if (!html || !html.includes('<div class="doc-body">')) return html;
  const parts = html.split('<div class="doc-body">');
  if (parts.length < 2) return html;
  let body = parts[1];
  const footerIdx = body.indexOf('<div class="doc-footer">');
  if (footerIdx !== -1) body = body.substring(0, footerIdx);
  const bodyEndIdx = body.indexOf("</body>");
  if (bodyEndIdx !== -1) body = body.substring(0, bodyEndIdx);
  return body.replace(/<\/div>\s*$/, "").trim();
}

export default function DocumentGeneratorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    templateId?: string;
    propertyId?: string;
    draftId?: string;
  }>();
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  /* ── Theme ── */
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardBg = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const bgColor = useThemeColor({}, "background");

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [docName, setDocName] = useState("");
  const [previewVisible, setPreviewVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedPdf, setGeneratedPdf] = useState<{
    base64: string;
    url?: string;
  } | null>(null);
  const [selectTemplateVisible, setSelectTemplateVisible] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const editorRef = useRef<any>(null);

  // Entity selectors
  const [property, setProperty] = useState<Entity | null>(null);
  const [customer, setCustomer] = useState<Entity | null>(null);
  const [partner, setPartner] = useState<Entity | null>(null);

  // Entity picker modal
  const [entityPickerVisible, setEntityPickerVisible] = useState(false);
  const [entityPickerTable, setEntityPickerTable] = useState("");
  const [entityPickerTitle, setEntityPickerTitle] = useState("");
  const [entityPickerItems, setEntityPickerItems] = useState<Entity[]>([]);
  const [entityPickerLoading, setEntityPickerLoading] = useState(false);
  const [entityPickerSearch, setEntityPickerSearch] = useState("");
  const entityPickerCallback = useRef<((e: Entity) => void) | null>(null);

  /* ── Recompute auto-fill whenever entities change ── */
  const reAutoFill = useCallback(
    (
      vars: TemplateVariable[],
      prop?: Entity | null,
      cust?: Entity | null,
      part?: Entity | null,
    ) => {
      const autoValues = autoFillVariables(vars, {
        property: prop ?? property ?? undefined,
        customer: cust ?? customer ?? undefined,
        user: user as unknown as Entity | undefined,
      });
      // Also fill partner variables manually
      const p = part ?? partner;
      if (p) {
        if (p.name) autoValues.parceiro_nome = String(p.name);
        if (p.email) autoValues.parceiro_email = String(p.email);
        if (p.phone) autoValues.parceiro_telefone = String(p.phone);
      }
      setValues((prev) => ({ ...prev, ...autoValues }));
    },
    [property, customer, partner, user],
  );

  /* ── Load template ── */
  const loadTemplate = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const t = await getTemplate(id);
        if (!t) {
          Alert.alert("Erro", "Modelo não encontrado.");
          return;
        }
        setTemplate(t);

        // Parse variables
        let vars = parseVariables(t.variables);
        // If no variables saved, try extracting from HTML
        if (vars.length === 0 && t.content_html) {
          const keys = extractVariableKeys(t.content_html);
          vars = keys.map((k) => ({
            key: k,
            label: k
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            type: "text" as const,
            required: false,
            source: "manual" as const,
          }));
        }
        setVariables(vars);

        // Auto-fill
        const autoValues = autoFillVariables(vars, {
          property: property ?? undefined,
          customer: customer ?? undefined,
          user: user as unknown as Entity | undefined,
        });
        setValues(autoValues);
        setDocName(t.name);
        setEditedContent(null);
        setEditMode(false);
      } catch (err) {
        Alert.alert(
          "Erro",
          err instanceof Error ? err.message : "Falha ao carregar modelo",
        );
      } finally {
        setLoading(false);
      }
    },
    [property, customer, user],
  );

  /* ── Load as blank template ── */
  const loadBlankTemplate = useCallback(() => {
    const blank: DocumentTemplate = {
      id: "",
      name: "Documento em Branco",
      description: "Documento livre",
      content_html: "<p><br></p>",
      category: "outros",
      variables: [],
      page_config: {
        size: "A4",
        orientation: "portrait",
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
      },
      header_html: "",
      footer_html: "",
      is_active: true,
    };
    setTemplate(blank);
    setVariables([]);
    setValues({});
    setDocName("Documento em Branco");
    setLoading(false);
  }, []);

  /* ── Load property data if provided ── */
  useEffect(() => {
    if (!params.propertyId) return;
    (async () => {
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "properties",
          ...buildSearchParams([{ field: "id", value: params.propertyId! }]),
        });
        const list = normalizeCrudList<Entity>(res.data);
        const found = list.find((p) => String(p.id) === params.propertyId);
        if (found) setProperty(found);

        if (found?.customer_id) {
          const custRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "customers",
            ...buildSearchParams([
              { field: "id", value: String(found.customer_id) },
            ]),
          });
          const customers = normalizeCrudList<Entity>(custRes.data);
          const cust = customers.find(
            (c) => String(c.id) === String(found.customer_id),
          );
          if (cust) setCustomer(cust);
        }
      } catch {
        // ignore
      }
    })();
  }, [params.propertyId]);

  /* ── Initial load ── */
  useEffect(() => {
    if (params.draftId) {
      // Draft loading handled below
      return;
    }
    if (params.templateId) {
      loadTemplate(params.templateId);
    } else {
      setLoading(true);
      listTemplates(tenantId)
        .then((list) => {
          setTemplates(list.filter((t) => t.is_active !== false));
          setSelectTemplateVisible(true);
        })
        .catch(() => {
          Alert.alert("Erro", "Não foi possível carregar modelos.");
        })
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.templateId]);

  /* ── Load draft for editing ── */
  useEffect(() => {
    if (!params.draftId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "generated_documents",
          ...buildSearchParams([{ field: "id", value: params.draftId! }]),
        });
        const list = normalizeCrudList<GeneratedDocument>(res.data);
        const draft = list[0];
        if (!draft) {
          Alert.alert("Erro", "Rascunho não encontrado.");
          setLoading(false);
          return;
        }
        setSavingDraftId(draft.id);

        // Load the template if available
        if (draft.template_id) {
          await loadTemplate(draft.template_id);
        }

        // Restore draft name
        if (draft.name) setDocName(draft.name);

        // Restore variables
        if (draft.variables_used) {
          const vars =
            typeof draft.variables_used === "string"
              ? JSON.parse(draft.variables_used)
              : draft.variables_used;
          if (vars && typeof vars === "object") {
            setValues((prev) => ({ ...prev, ...vars }));
          }
        }

        // Restore edited content (extract body if full HTML)
        if (draft.filled_html) {
          const body = extractDocBody(draft.filled_html);
          setEditedContent(body);
          setEditMode(true);
        }

        // Restore PDF if available
        if (draft.pdf_base64 || draft.pdf_url) {
          setGeneratedPdf({
            base64: draft.pdf_base64 ?? "",
            url: draft.pdf_url,
          });
        }
      } catch {
        Alert.alert("Erro", "Falha ao carregar rascunho.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.draftId]);

  /* ── Update a variable value ── */
  const updateValue = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  /* ── Generate filled HTML ── */
  const filledHtml = template
    ? interpolateVariables(template.content_html, values)
    : "";
  /* ── Final content (user-edited or auto-generated) ── */
  const finalContent = editedContent ?? filledHtml;
  const finalFullHtml = template ? buildFullHtml(template, finalContent) : "";

  /* ── Preview with highlighted unfilled variables ── */
  const previewHtml = useMemo(() => {
    if (!template) return "";
    if (editedContent !== null) {
      return buildFullHtml(template, editedContent);
    }
    return buildFullHtml(
      template,
      template.content_html.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
        if (values[k]?.trim()) {
          return `<span style="background:#d1fae5;color:#065f46;padding:1px 4px;border-radius:3px;">${values[k]}</span>`;
        }
        return `<span style="background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:3px;font-weight:600;">{{${k}}}</span>`;
      }),
    );
  }, [template, editedContent, values]);

  /* ── Check if all required vars are filled ── */
  const missingRequired = variables.filter(
    (v) => v.required && !values[v.key]?.trim(),
  );

  /* ── Open entity picker ── */
  const openEntityPicker = useCallback(
    async (table: string, title: string, onSelect: (e: Entity) => void) => {
      setEntityPickerTable(table);
      setEntityPickerTitle(title);
      setEntityPickerSearch("");
      setEntityPickerLoading(true);
      setEntityPickerVisible(true);
      entityPickerCallback.current = onSelect;

      try {
        const filters = tenantId
          ? [{ field: "tenant_id", value: tenantId }]
          : [];
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table,
          ...buildSearchParams(filters, {
            sortColumn: table === "properties" ? "address" : "name",
            autoExcludeDeleted: true,
          }),
        });
        setEntityPickerItems(normalizeCrudList<Entity>(res.data));
      } catch {
        setEntityPickerItems([]);
      } finally {
        setEntityPickerLoading(false);
      }
    },
    [tenantId],
  );

  /* ── Filtered entity items ── */
  const filteredEntityItems = useMemo(() => {
    if (!entityPickerSearch.trim()) return entityPickerItems;
    const q = entityPickerSearch.toLowerCase();
    return entityPickerItems.filter((e) =>
      entityLabel(e, entityPickerTable).toLowerCase().includes(q),
    );
  }, [entityPickerItems, entityPickerSearch, entityPickerTable]);

  /* ── Filtered templates for picker ── */
  const filteredTemplates = useMemo(() => {
    if (!templateSearch.trim()) return templates;
    const q = templateSearch.toLowerCase();
    return templates.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q),
    );
  }, [templates, templateSearch]);

  /* ── Generate PDF ── */
  const handleGeneratePdf = async () => {
    if (missingRequired.length > 0) {
      Alert.alert(
        "Campos obrigatórios",
        `Preencha: ${missingRequired.map((v) => v.label).join(", ")}`,
      );
      return;
    }

    setGenerating(true);
    try {
      const result = await generatePdf({
        html: finalFullHtml,
        documentName: docName || template?.name || "documento",
        pageConfig: template?.page_config ?? undefined,
      });

      setGeneratedPdf({ base64: result.pdf_base64, url: result.url });
      Alert.alert("PDF Gerado!", "O PDF foi gerado com sucesso.");
    } catch (err) {
      Alert.alert(
        "Erro",
        err instanceof Error ? err.message : "Falha ao gerar PDF",
      );
    } finally {
      setGenerating(false);
    }
  };

  /* ── Save generated document to DB ── */
  const handleSave = async (asDraft = false) => {
    if (!template) return;
    setSaving(true);
    try {
      const payload: Partial<GeneratedDocument> = {
        template_id: template.id || undefined,
        property_id: (property?.id as string) ?? params.propertyId ?? undefined,
        name: docName || template.name || "Documento",
        filled_html: finalFullHtml,
        variables_used: values,
        status: asDraft ? "draft" : generatedPdf ? "generated" : "draft",
        pdf_base64: generatedPdf?.base64 ?? undefined,
        pdf_url: generatedPdf?.url ?? undefined,
        tenant_id: tenantId ?? undefined,
        created_by: user?.id ?? undefined,
      };

      if (savingDraftId) {
        await updateGeneratedDocument({ id: savingDraftId, ...payload });
      } else {
        const result = await createGeneratedDocument(payload);
        // Store the new ID so subsequent saves update instead of creating
        const created = Array.isArray(result) ? result[0] : result;
        if (
          created &&
          typeof created === "object" &&
          "id" in (created as Record<string, unknown>)
        ) {
          setSavingDraftId((created as Record<string, unknown>).id as string);
        }
      }

      const msg = asDraft
        ? "Rascunho salvo com sucesso!"
        : "Documento salvo com sucesso!";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Salvo!", msg);
      }
      // Only navigate back for final save, not draft
      if (!asDraft) {
        router.back();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao salvar";
      if (Platform.OS === "web") {
        window.alert("Erro: " + msg);
      } else {
        Alert.alert("Erro", msg);
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── Download PDF (web + native) ── */
  const handleDownloadPdf = () => {
    if (!generatedPdf) {
      Alert.alert("Aviso", "Gere o PDF primeiro antes de fazer download.");
      return;
    }
    if (Platform.OS === "web") {
      try {
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${generatedPdf.base64}`;
        link.download = `${docName || "documento"}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        if (generatedPdf.url) {
          window.open(generatedPdf.url, "_blank");
        }
      }
    } else if (generatedPdf.url) {
      Linking.openURL(generatedPdf.url);
    } else {
      Alert.alert("Aviso", "Download não disponível nesta plataforma.");
    }
  };

  /* ── Category color mapping ── */
  const categoryColor = (cat?: string) => {
    const map: Record<string, string> = {
      contrato: "#3b82f6",
      procuracao: "#8b5cf6",
      declaracao: "#10b981",
      requerimento: "#f59e0b",
      recibo: "#06b6d4",
      orcamento: "#ec4899",
      notificacao: "#ef4444",
      outros: "#6b7280",
    };
    return map[cat ?? ""] ?? "#6b7280";
  };

  /* ── Variable type → input component ── */
  const renderVariableInput = (v: TemplateVariable) => {
    const val = values[v.key] ?? "";

    return (
      <View key={v.key} style={{ marginBottom: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginBottom: 4,
          }}
        >
          <ThemedText
            style={{ fontSize: 13, fontWeight: "600", color: textColor }}
          >
            {v.label}
          </ThemedText>
          {v.required && (
            <ThemedText style={{ color: "#ef4444", fontSize: 12 }}>
              *
            </ThemedText>
          )}
          {v.source !== "manual" && (
            <View
              style={{
                backgroundColor:
                  v.source === "property"
                    ? "#3b82f620"
                    : v.source === "customer"
                      ? "#10b98120"
                      : "#8b5cf620",
                borderRadius: 4,
                paddingHorizontal: 5,
                paddingVertical: 1,
              }}
            >
              <ThemedText
                style={{
                  fontSize: 9,
                  fontWeight: "600",
                  color:
                    v.source === "property"
                      ? "#3b82f6"
                      : v.source === "customer"
                        ? "#10b981"
                        : "#8b5cf6",
                }}
              >
                auto
              </ThemedText>
            </View>
          )}
        </View>
        <TextInput
          value={val}
          onChangeText={(t) => updateValue(v.key, t)}
          placeholder={v.label}
          placeholderTextColor={mutedColor}
          multiline={v.type === "textarea"}
          keyboardType={
            v.type === "number" || v.type === "currency"
              ? "decimal-pad"
              : v.type === "cpf" || v.type === "cnpj"
                ? "number-pad"
                : "default"
          }
          style={{
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor: val.trim()
              ? borderColor
              : v.required
                ? "#f59e0b50"
                : borderColor,
            borderRadius: 8,
            padding: 10,
            fontSize: 14,
            color: textColor,
            minHeight: v.type === "textarea" ? 80 : undefined,
            textAlignVertical: v.type === "textarea" ? "top" : undefined,
          }}
        />
      </View>
    );
  };

  /* ── Entity selector button ── */
  const renderEntitySelector = (opts: {
    icon: string;
    label: string;
    selectedLabel?: string;
    selected: boolean;
    color: string;
    onPress: () => void;
    onClear?: () => void;
  }) => (
    <TouchableOpacity
      onPress={opts.onPress}
      style={{
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: opts.selected ? opts.color : borderColor,
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Ionicons
        name={opts.icon as any}
        size={16}
        color={opts.selected ? opts.color : mutedColor}
      />
      <ThemedText
        style={{
          color: opts.selected ? textColor : mutedColor,
          fontSize: 14,
          flex: 1,
        }}
        numberOfLines={1}
      >
        {opts.selected ? opts.selectedLabel : opts.label}
      </ThemedText>
      {opts.selected && opts.onClear && (
        <TouchableOpacity
          onPress={opts.onClear}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={18} color={mutedColor} />
        </TouchableOpacity>
      )}
      {!opts.selected && (
        <Ionicons name="chevron-forward" size={16} color={mutedColor} />
      )}
    </TouchableOpacity>
  );

  /* ── Loading state ── */
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
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
    >
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={textColor} />
        </TouchableOpacity>
        <ThemedText
          style={{ fontSize: 22, fontWeight: "700", color: textColor, flex: 1 }}
        >
          Gerar Documento
        </ThemedText>
        {template && (
          <TouchableOpacity
            onPress={() => {
              setSelectTemplateVisible(true);
              setTemplateSearch("");
            }}
            style={{
              backgroundColor: tintColor + "15",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <ThemedText
              style={{ fontSize: 12, color: tintColor, fontWeight: "600" }}
            >
              Trocar modelo
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>

      {template && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              backgroundColor: categoryColor(template.category) + "20",
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <ThemedText
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: categoryColor(template.category),
              }}
            >
              {template.category}
            </ThemedText>
          </View>
          <ThemedText
            style={{ fontSize: 13, color: mutedColor, flex: 1 }}
            numberOfLines={1}
          >
            {template.name}
            {template.description ? ` — ${template.description}` : ""}
          </ThemedText>
        </View>
      )}

      {/* ── Document name ── */}
      <ThemedText
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: textColor,
          marginBottom: 4,
        }}
      >
        Nome do documento
      </ThemedText>
      <TextInput
        value={docName}
        onChangeText={setDocName}
        placeholder="ex: Contrato - João Silva"
        placeholderTextColor={mutedColor}
        style={{
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor,
          borderRadius: 10,
          padding: 12,
          fontSize: 14,
          color: textColor,
          marginBottom: 16,
        }}
      />

      {/* ── Entity selectors ── */}
      <ThemedText
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: textColor,
          marginBottom: 6,
        }}
      >
        Preencher automaticamente de:
      </ThemedText>
      <ThemedText style={{ fontSize: 11, color: mutedColor, marginBottom: 8 }}>
        Selecione entidades para auto-preencher as variáveis do documento
      </ThemedText>

      {renderEntitySelector({
        icon: "person-outline",
        label: "Selecionar cliente (opcional)",
        selectedLabel: customer
          ? entityLabel(customer, "customers")
          : undefined,
        selected: !!customer,
        color: "#10b981",
        onPress: () =>
          openEntityPicker("customers", "Selecionar Cliente", (c) => {
            setCustomer(c);
            setEntityPickerVisible(false);
            reAutoFill(variables, property, c, partner);
          }),
        onClear: () => {
          setCustomer(null);
          reAutoFill(variables, property, null, partner);
        },
      })}

      {renderEntitySelector({
        icon: "home-outline",
        label: "Selecionar imóvel (opcional)",
        selectedLabel: property
          ? entityLabel(property, "properties")
          : undefined,
        selected: !!property,
        color: "#3b82f6",
        onPress: () =>
          openEntityPicker("properties", "Selecionar Imóvel", (p) => {
            setProperty(p);
            setEntityPickerVisible(false);
            reAutoFill(variables, p, customer, partner);
            // Also try to load linked customer
            if (p.customer_id && !customer) {
              api
                .post(CRUD_ENDPOINT, {
                  action: "list",
                  table: "customers",
                  ...buildSearchParams([
                    { field: "id", value: String(p.customer_id) },
                  ]),
                })
                .then((res) => {
                  const list = normalizeCrudList<Entity>(res.data);
                  const cust = list.find(
                    (c) => String(c.id) === String(p.customer_id),
                  );
                  if (cust) {
                    setCustomer(cust);
                    reAutoFill(variables, p, cust, partner);
                  }
                })
                .catch(() => {});
            }
          }),
        onClear: () => {
          setProperty(null);
          reAutoFill(variables, null, customer, partner);
        },
      })}

      {renderEntitySelector({
        icon: "briefcase-outline",
        label: "Selecionar parceiro (opcional)",
        selectedLabel: partner ? entityLabel(partner, "partners") : undefined,
        selected: !!partner,
        color: "#8b5cf6",
        onPress: () =>
          openEntityPicker("partners", "Selecionar Parceiro", (p) => {
            setPartner(p);
            setEntityPickerVisible(false);
            reAutoFill(variables, property, customer, p);
          }),
        onClear: () => {
          setPartner(null);
          reAutoFill(variables, property, customer, null);
        },
      })}

      <View style={{ height: 8 }} />

      {/* ── Variables form ── */}
      {variables.length > 0 && (
        <View
          style={{
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <ThemedText
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: textColor,
              marginBottom: 4,
            }}
          >
            Preencher variáveis ({variables.length})
          </ThemedText>
          {missingRequired.length > 0 && (
            <ThemedText
              style={{ fontSize: 11, color: "#f59e0b", marginBottom: 8 }}
            >
              {missingRequired.length} campo(s) obrigatório(s) faltando
            </ThemedText>
          )}
          {variables.map((v) => renderVariableInput(v))}
        </View>
      )}

      {/* ── Content Editor Toggle ── */}
      {template && (
        <TouchableOpacity
          onPress={() => {
            if (!editMode) {
              if (editedContent === null) setEditedContent(filledHtml);
              setEditMode(true);
              // Initialize contentEditable on next frame
              setTimeout(() => {
                if (editorRef.current && Platform.OS === "web") {
                  editorRef.current.innerHTML = editedContent ?? filledHtml;
                }
              }, 50);
            } else {
              setEditMode(false);
            }
          }}
          style={{
            backgroundColor: editMode ? tintColor + "20" : cardBg,
            borderWidth: 1,
            borderColor: editMode ? tintColor : borderColor,
            borderRadius: 10,
            paddingVertical: 10,
            paddingHorizontal: 14,
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons
            name={editMode ? "code-slash-outline" : "create-outline"}
            size={16}
            color={editMode ? tintColor : mutedColor}
          />
          <ThemedText
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: editMode ? tintColor : mutedColor,
            }}
          >
            {editMode ? "Fechar Editor" : "Editar Conteúdo"}
          </ThemedText>
          {editedContent !== null && !editMode && (
            <View
              style={{
                backgroundColor: "#f59e0b20",
                borderRadius: 4,
                paddingHorizontal: 5,
                paddingVertical: 1,
                marginLeft: 4,
              }}
            >
              <ThemedText
                style={{ fontSize: 9, fontWeight: "600", color: "#f59e0b" }}
              >
                editado
              </ThemedText>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* ── Content Editor ── */}
      {editMode && template && (
        <View
          style={{
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor: tintColor + "40",
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <ThemedText
              style={{ fontSize: 14, fontWeight: "700", color: textColor }}
            >
              Editor de Conteúdo
            </ThemedText>
            {editedContent !== null && (
              <TouchableOpacity
                onPress={() => {
                  setEditedContent(null);
                  if (editorRef.current && Platform.OS === "web") {
                    editorRef.current.innerHTML = filledHtml;
                  }
                }}
                style={{
                  backgroundColor: "#f59e0b15",
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <ThemedText
                  style={{ fontSize: 11, fontWeight: "600", color: "#f59e0b" }}
                >
                  Resetar do modelo
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>

          {Platform.OS === "web" ? (
            <View>
              {/* Formatting toolbar */}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 4,
                  marginBottom: 8,
                  paddingBottom: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: borderColor,
                }}
              >
                {[
                  {
                    cmd: "bold",
                    icon: "B",
                    style: { fontWeight: "700" as const },
                  },
                  {
                    cmd: "italic",
                    icon: "I",
                    style: { fontStyle: "italic" as const },
                  },
                  {
                    cmd: "underline",
                    icon: "U",
                    style: { textDecorationLine: "underline" as const },
                  },
                  { cmd: "insertUnorderedList", icon: "• Lista" },
                  { cmd: "insertOrderedList", icon: "1. Lista" },
                ].map((btn) => (
                  <TouchableOpacity
                    key={btn.cmd}
                    onPress={() => {
                      (document as any).execCommand(btn.cmd, false, null);
                      if (editorRef.current) {
                        setEditedContent(editorRef.current.innerHTML);
                      }
                    }}
                    style={{
                      backgroundColor: bgColor,
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      minWidth: 36,
                      alignItems: "center",
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: textColor,
                        ...(btn.style ?? {}),
                      }}
                    >
                      {btn.icon}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              {/* contentEditable editor */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  if (editorRef.current) {
                    setEditedContent(editorRef.current.innerHTML);
                  }
                }}
                style={{
                  minHeight: 300,
                  maxHeight: 500,
                  overflowY: "auto" as any,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 8,
                  padding: 12,
                  outline: "none",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "#222",
                  backgroundColor: "#fff",
                }}
              />
            </View>
          ) : (
            <TextInput
              multiline
              value={editedContent ?? filledHtml}
              onChangeText={setEditedContent}
              placeholderTextColor={mutedColor}
              style={{
                minHeight: 300,
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                color: textColor,
                backgroundColor: cardBg,
                textAlignVertical: "top",
              }}
            />
          )}
        </View>
      )}

      {/* ── Action buttons ── */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <TouchableOpacity
          onPress={() => setPreviewVisible(true)}
          disabled={!template}
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
          onPress={handleGeneratePdf}
          disabled={generating || !template}
          style={{
            flex: 1,
            backgroundColor: generating ? "#10b98166" : "#10b981",
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {generating ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Ionicons name="document-outline" size={18} color="white" />
              <ThemedText
                style={{ color: "white", fontWeight: "700", fontSize: 15 }}
              >
                Gerar PDF
              </ThemedText>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Generated PDF actions ── */}
      {generatedPdf && (
        <View
          style={{
            backgroundColor: "#10b98115",
            borderWidth: 1,
            borderColor: "#10b98140",
            borderRadius: 12,
            padding: 14,
            marginBottom: 12,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="checkmark-circle" size={20} color="#10b981" />
            <ThemedText
              style={{ fontSize: 14, fontWeight: "700", color: "#10b981" }}
            >
              PDF gerado com sucesso!
            </ThemedText>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={handleDownloadPdf}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: "#3b82f6",
                borderRadius: 8,
                paddingVertical: 10,
              }}
            >
              <Ionicons name="download-outline" size={16} color="white" />
              <ThemedText
                style={{ fontSize: 13, fontWeight: "600", color: "white" }}
              >
                Download PDF
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleSave(false)}
              disabled={saving}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: tintColor,
                borderRadius: 8,
                paddingVertical: 10,
              }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={16} color="white" />
                  <ThemedText
                    style={{ fontSize: 13, fontWeight: "600", color: "white" }}
                  >
                    Salvar
                  </ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Save draft (without PDF) ── */}
      {!generatedPdf && template && (
        <TouchableOpacity
          onPress={() => handleSave(true)}
          disabled={saving}
          style={{
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={mutedColor} />
          ) : (
            <>
              <Ionicons name="save-outline" size={16} color={mutedColor} />
              <ThemedText
                style={{ color: mutedColor, fontWeight: "600", fontSize: 13 }}
              >
                Salvar como rascunho
              </ThemedText>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/*  MODALS                                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {/* ── Preview Modal ── */}
      <Modal
        visible={previewVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewVisible(false)}
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
              maxHeight: "90%",
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
                Preview do Documento
              </ThemedText>
              <TouchableOpacity onPress={() => setPreviewVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ThemedText
              style={{ fontSize: 11, color: "#666", marginBottom: 8 }}
            >
              Campos preenchidos em{" "}
              <ThemedText style={{ color: "#065f46", fontWeight: "600" }}>
                verde
              </ThemedText>
              , não preenchidos em{" "}
              <ThemedText style={{ color: "#92400e", fontWeight: "600" }}>
                amarelo
              </ThemedText>
            </ThemedText>
            <ScrollView style={{ flex: 1 }}>
              {Platform.OS === "web" ? (
                <div
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                  className="preview-html-container"
                />
              ) : (
                <View
                  style={{
                    padding: 16,
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    borderRadius: 8,
                  }}
                >
                  <ThemedText
                    style={{ color: "#222", fontSize: 13, lineHeight: 20 }}
                  >
                    {filledHtml
                      .replace(/<[^>]*>/g, " ")
                      .replace(/&nbsp;/g, " ")
                      .replace(/\s+/g, " ")
                      .trim()}
                  </ThemedText>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Template Selector Modal ── */}
      <Modal
        visible={selectTemplateVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSelectTemplateVisible(false);
          if (!template) router.back();
        }}
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
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <ThemedText
                style={{ fontSize: 17, fontWeight: "700", color: textColor }}
              >
                Selecionar Modelo
              </ThemedText>
              <TouchableOpacity
                onPress={() => {
                  setSelectTemplateVisible(false);
                  if (!template) router.back();
                }}
              >
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: bgColor,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 10,
                marginBottom: 12,
                gap: 6,
              }}
            >
              <Ionicons name="search" size={16} color={mutedColor} />
              <TextInput
                value={templateSearch}
                onChangeText={setTemplateSearch}
                placeholder="Buscar modelo..."
                placeholderTextColor={mutedColor}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: textColor,
                }}
              />
              {templateSearch.length > 0 && (
                <TouchableOpacity onPress={() => setTemplateSearch("")}>
                  <Ionicons name="close-circle" size={16} color={mutedColor} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView>
              {/* Blank template option */}
              <TouchableOpacity
                onPress={() => {
                  setSelectTemplateVisible(false);
                  loadBlankTemplate();
                }}
                style={{
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#8b5cf640",
                  borderRadius: 10,
                  marginBottom: 8,
                  backgroundColor: "#8b5cf608",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: "#8b5cf615",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="add" size={20} color="#8b5cf6" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: "#8b5cf6",
                    }}
                  >
                    Documento em Branco
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                    Começar do zero, sem modelo
                  </ThemedText>
                </View>
              </TouchableOpacity>

              {/* Template list */}
              {filteredTemplates.length === 0 && (
                <ThemedText
                  style={{
                    fontSize: 13,
                    color: mutedColor,
                    textAlign: "center",
                    paddingVertical: 20,
                  }}
                >
                  {templateSearch
                    ? "Nenhum modelo encontrado"
                    : "Nenhum modelo disponível"}
                </ThemedText>
              )}

              {filteredTemplates.map((t) => {
                const color = categoryColor(t.category);
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => {
                      setSelectTemplateVisible(false);
                      loadTemplate(t.id);
                    }}
                    style={{
                      padding: 14,
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 10,
                      marginBottom: 8,
                      backgroundColor: cardBg,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: color + "20",
                          borderRadius: 4,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <ThemedText
                          style={{ fontSize: 10, fontWeight: "600", color }}
                        >
                          {t.category}
                        </ThemedText>
                      </View>
                      <ThemedText
                        style={{
                          fontSize: 15,
                          fontWeight: "700",
                          color: textColor,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {t.name}
                      </ThemedText>
                    </View>
                    {t.description && (
                      <ThemedText
                        style={{
                          fontSize: 12,
                          color: mutedColor,
                          marginTop: 4,
                        }}
                        numberOfLines={2}
                      >
                        {t.description}
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Entity Picker Modal (generic) ── */}
      <Modal
        visible={entityPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEntityPickerVisible(false)}
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
                marginBottom: 10,
              }}
            >
              <ThemedText
                style={{ fontSize: 17, fontWeight: "700", color: textColor }}
              >
                {entityPickerTitle}
              </ThemedText>
              <TouchableOpacity onPress={() => setEntityPickerVisible(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: bgColor,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 10,
                marginBottom: 12,
                gap: 6,
              }}
            >
              <Ionicons name="search" size={16} color={mutedColor} />
              <TextInput
                value={entityPickerSearch}
                onChangeText={setEntityPickerSearch}
                placeholder="Buscar..."
                placeholderTextColor={mutedColor}
                autoFocus
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: textColor,
                }}
              />
              {entityPickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setEntityPickerSearch("")}>
                  <Ionicons name="close-circle" size={16} color={mutedColor} />
                </TouchableOpacity>
              )}
            </View>

            {entityPickerLoading ? (
              <ActivityIndicator
                size="large"
                color={tintColor}
                style={{ paddingVertical: 30 }}
              />
            ) : (
              <ScrollView>
                {filteredEntityItems.length === 0 && (
                  <ThemedText
                    style={{
                      fontSize: 13,
                      color: mutedColor,
                      textAlign: "center",
                      paddingVertical: 20,
                    }}
                  >
                    {entityPickerSearch
                      ? "Nenhum resultado encontrado"
                      : "Nenhum registro disponível"}
                  </ThemedText>
                )}
                {filteredEntityItems.map((item) => (
                  <TouchableOpacity
                    key={String(item.id)}
                    onPress={() => {
                      entityPickerCallback.current?.(item);
                    }}
                    style={{
                      padding: 12,
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 10,
                      marginBottom: 6,
                      backgroundColor: cardBg,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: textColor,
                      }}
                      numberOfLines={1}
                    >
                      {entityLabel(item, entityPickerTable)}
                    </ThemedText>
                    {item.email && (
                      <ThemedText
                        style={{
                          fontSize: 11,
                          color: mutedColor,
                          marginTop: 2,
                        }}
                      >
                        {String(item.email)}
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
