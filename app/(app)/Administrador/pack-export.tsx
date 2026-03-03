/**
 * Pack Export — Admin screen to export a tenant's configuration as a TemplatePack.
 *
 * Allows the admin to:
 *  1. Enter pack metadata (name, slug, description)
 *  2. Select which entity types to include (with entity counts)
 *  3. Export as JSON file (browser download or native share)
 *
 * Uses services/pack-export.ts for the export logic.
 */

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    countTenantEntities,
    downloadPackAsJson,
    exportTenantAsPack,
    type PackExportOptions,
    type PackExportResult,
    type TenantEntityCounts,
} from "@/services/pack-export";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

type EntityToggleKey = keyof PackExportOptions["include"];

interface EntityToggleConfig {
  key: EntityToggleKey;
  label: string;
  icon: string;
  countKey: keyof TenantEntityCounts;
  /** If true, toggle starts unchecked (opt-in). Default = checked. */
  optIn?: boolean;
}

const ENTITY_TOGGLES: EntityToggleConfig[] = [
  {
    key: "service_categories",
    label: "Categorias de Serviço",
    icon: "folder-outline",
    countKey: "service_categories",
  },
  {
    key: "service_types",
    label: "Tipos de Serviço",
    icon: "pricetag-outline",
    countKey: "service_types",
  },
  {
    key: "workflows",
    label: "Workflows (templates + etapas + transições)",
    icon: "git-branch-outline",
    countKey: "workflow_templates",
  },
  {
    key: "deadline_rules",
    label: "Regras de Prazo (SLA)",
    icon: "timer-outline",
    countKey: "deadline_rules",
  },
  {
    key: "step_forms",
    label: "Formulários de Etapa",
    icon: "document-text-outline",
    countKey: "step_forms",
  },
  {
    key: "step_task_templates",
    label: "Templates de Tarefas",
    icon: "checkbox-outline",
    countKey: "step_task_templates",
  },
  {
    key: "roles",
    label: "Papéis & Permissões",
    icon: "shield-outline",
    countKey: "roles",
  },
  {
    key: "document_templates",
    label: "Modelos de Documento",
    icon: "reader-outline",
    countKey: "document_templates",
  },
  {
    key: "custom_fields",
    label: "Campos Personalizados",
    icon: "options-outline",
    countKey: "custom_field_definitions",
  },
  {
    key: "ocr_configs",
    label: "Configurações OCR",
    icon: "scan-outline",
    countKey: "ocr_configs",
  },
  {
    key: "services",
    label: "Catálogo de Serviços",
    icon: "cart-outline",
    countKey: "services",
    optIn: true,
  },
  {
    key: "modules",
    label: "Módulos Ativos",
    icon: "apps-outline",
    countKey: "modules",
  },
  // ── AI / Agent entities ──
  {
    key: "agents",
    label: "Agentes IA",
    icon: "hardware-chip-outline",
    countKey: "agents",
    optIn: true,
  },
  {
    key: "playbooks",
    label: "Playbooks",
    icon: "book-outline",
    countKey: "playbooks",
    optIn: true,
  },
  {
    key: "playbook_rules",
    label: "Regras de Playbook",
    icon: "list-outline",
    countKey: "playbook_rules",
    optIn: true,
  },
  {
    key: "playbook_tables",
    label: "Tabelas de Playbook",
    icon: "grid-outline",
    countKey: "playbook_tables",
    optIn: true,
  },
  {
    key: "agent_states",
    label: "Estados do Agente",
    icon: "swap-horizontal-outline",
    countKey: "agent_states",
    optIn: true,
  },
  {
    key: "agent_state_steps",
    label: "Steps de Estado",
    icon: "footsteps-outline",
    countKey: "agent_state_steps",
    optIn: true,
  },
  {
    key: "channel_bindings",
    label: "Bindings de Canal",
    icon: "link-outline",
    countKey: "channel_bindings",
    optIn: true,
  },
  {
    key: "handoff_policies",
    label: "Políticas de Handoff",
    icon: "arrow-redo-outline",
    countKey: "handoff_policies",
    optIn: true,
  },
  {
    key: "automations",
    label: "Automações",
    icon: "flash-outline",
    countKey: "automations",
    optIn: true,
  },
];

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export default function PackExportScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  /* ── Theme ── */
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── State ── */
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("rocket-outline");
  const [color, setColor] = useState("#2563eb");

  // Entity toggles (default: all on except opt-in ones)
  const [toggles, setToggles] = useState<Record<EntityToggleKey, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      for (const t of ENTITY_TOGGLES) {
        initial[t.key] = !t.optIn;
      }
      return initial as Record<EntityToggleKey, boolean>;
    },
  );

  // Entity counts (loaded on mount)
  const [counts, setCounts] = useState<TenantEntityCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState<string | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<PackExportResult | null>(
    null,
  );
  const [exportError, setExportError] = useState<string | null>(null);

  /* ── Auto-generate slug from name ── */
  const handleNameChange = useCallback((text: string) => {
    setName(text);
    const autoSlug = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    setSlug(autoSlug);
  }, []);

  /* ── Load counts on mount ── */
  useEffect(() => {
    if (!tenantId) return;
    setCountsLoading(true);
    setCountsError(null);
    countTenantEntities(tenantId)
      .then((c) => setCounts(c))
      .catch(() => setCountsError("Falha ao carregar contagens"))
      .finally(() => setCountsLoading(false));
  }, [tenantId]);

  /* ── Toggle handler ── */
  const handleToggle = useCallback((key: EntityToggleKey) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* ── Export handler ── */
  const handleExport = useCallback(async () => {
    if (!tenantId) {
      Alert.alert("Erro", "Tenant não identificado.");
      return;
    }
    if (!name.trim()) {
      Alert.alert("Atenção", "Informe o nome do pack.");
      return;
    }
    if (!slug.trim()) {
      Alert.alert("Atenção", "Informe o slug do pack.");
      return;
    }

    setExporting(true);
    setExportError(null);
    setExportResult(null);

    try {
      const options: PackExportOptions = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        icon,
        color,
        include: toggles,
      };

      const result = await exportTenantAsPack(tenantId, options);
      setExportResult(result);

      if (!result.validation.valid) {
        // Show validation errors but still allow download
        const msg = `Exportado com ${result.validation.errors.length} aviso(s) de validação. Deseja baixar mesmo assim?`;
        if (Platform.OS === "web") {
          if (window.confirm(msg)) {
            await downloadPackAsJson(result.pack);
          }
        } else {
          Alert.alert("Avisos de Validação", msg, [
            { text: "Cancelar", style: "cancel" },
            {
              text: "Baixar",
              onPress: () => downloadPackAsJson(result.pack),
            },
          ]);
        }
      } else {
        await downloadPackAsJson(result.pack);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao exportar pack";
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  }, [tenantId, name, slug, description, icon, color, toggles]);

  /* ── Total entities to export ── */
  const totalSelected = counts
    ? ENTITY_TOGGLES.filter((t) => toggles[t.key]).reduce(
        (sum, t) => sum + (counts[t.countKey] ?? 0),
        0,
      )
    : 0;

  /* ── Render ── */
  return (
    <ScrollView
      style={[s.container, { backgroundColor }]}
      contentContainerStyle={s.content}
    >
      {/* Header */}
      <View style={s.header}>
        <ThemedText style={[s.title, { color: textColor }]}>
          Exportar Template Pack
        </ThemedText>
        <ThemedText style={[s.subtitle, { color: mutedColor }]}>
          Exporte a configuração deste tenant como um pack reutilizável
        </ThemedText>
      </View>

      {/* ── Metadata Card ── */}
      <View style={[s.card, { backgroundColor: cardColor, borderColor }]}>
        <ThemedText style={[s.cardTitle, { color: textColor }]}>
          Metadados do Pack
        </ThemedText>

        <View style={s.field}>
          <ThemedText style={[s.label, { color: mutedColor }]}>
            Nome *
          </ThemedText>
          <TextInput
            value={name}
            onChangeText={handleNameChange}
            placeholder="Ex: Advocacia Premium"
            placeholderTextColor={mutedColor}
            style={[
              s.input,
              { backgroundColor: inputBg, borderColor, color: textColor },
            ]}
          />
        </View>

        <View style={s.field}>
          <ThemedText style={[s.label, { color: mutedColor }]}>
            Slug (identificador único) *
          </ThemedText>
          <TextInput
            value={slug}
            onChangeText={setSlug}
            placeholder="advocacia_premium"
            placeholderTextColor={mutedColor}
            autoCapitalize="none"
            style={[
              s.input,
              { backgroundColor: inputBg, borderColor, color: textColor },
            ]}
          />
        </View>

        <View style={s.field}>
          <ThemedText style={[s.label, { color: mutedColor }]}>
            Descrição
          </ThemedText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Pack otimizado para escritórios de advocacia"
            placeholderTextColor={mutedColor}
            multiline
            style={[
              s.input,
              s.inputMultiline,
              { backgroundColor: inputBg, borderColor, color: textColor },
            ]}
          />
        </View>

        <View style={s.row}>
          <View style={[s.field, { flex: 1 }]}>
            <ThemedText style={[s.label, { color: mutedColor }]}>
              Ícone
            </ThemedText>
            <TextInput
              value={icon}
              onChangeText={setIcon}
              placeholder="rocket-outline"
              placeholderTextColor={mutedColor}
              style={[
                s.input,
                { backgroundColor: inputBg, borderColor, color: textColor },
              ]}
            />
          </View>
          <View style={[s.field, { flex: 1 }]}>
            <ThemedText style={[s.label, { color: mutedColor }]}>
              Cor
            </ThemedText>
            <View style={s.colorRow}>
              <View style={[s.colorSwatch, { backgroundColor: color }]} />
              <TextInput
                value={color}
                onChangeText={setColor}
                placeholder="#2563eb"
                placeholderTextColor={mutedColor}
                autoCapitalize="none"
                style={[
                  s.input,
                  {
                    flex: 1,
                    backgroundColor: inputBg,
                    borderColor,
                    color: textColor,
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </View>

      {/* ── Entity Selection Card ── */}
      <View style={[s.card, { backgroundColor: cardColor, borderColor }]}>
        <View style={s.cardHeaderRow}>
          <ThemedText style={[s.cardTitle, { color: textColor }]}>
            Entidades a Exportar
          </ThemedText>
          {counts && !countsLoading ? (
            <View style={[s.countBadge, { backgroundColor: tintColor + "18" }]}>
              <ThemedText style={[s.countBadgeText, { color: tintColor }]}>
                {totalSelected} itens
              </ThemedText>
            </View>
          ) : null}
        </View>

        {countsLoading ? (
          <View style={s.loadingRow}>
            <ActivityIndicator size="small" color={tintColor} />
            <ThemedText style={[s.loadingText, { color: mutedColor }]}>
              Carregando contagens...
            </ThemedText>
          </View>
        ) : countsError ? (
          <ThemedText style={[s.errorText, { color: "#dc2626" }]}>
            {countsError}
          </ThemedText>
        ) : (
          ENTITY_TOGGLES.map((toggle) => {
            const count = counts?.[toggle.countKey] ?? 0;
            const isEnabled = toggles[toggle.key];

            return (
              <TouchableOpacity
                key={toggle.key}
                style={[
                  s.toggleRow,
                  {
                    borderBottomColor: borderColor + "40",
                    opacity: count === 0 ? 0.5 : 1,
                  },
                ]}
                onPress={() => count > 0 && handleToggle(toggle.key)}
                activeOpacity={0.7}
                disabled={count === 0}
              >
                <Ionicons
                  name={toggle.icon as any}
                  size={18}
                  color={isEnabled ? tintColor : mutedColor}
                  style={s.toggleIcon}
                />
                <View style={s.toggleLabelArea}>
                  <ThemedText
                    style={[
                      s.toggleLabel,
                      { color: isEnabled ? textColor : mutedColor },
                    ]}
                  >
                    {toggle.label}
                  </ThemedText>
                  <ThemedText style={[s.toggleCount, { color: mutedColor }]}>
                    {count} {count === 1 ? "registro" : "registros"}
                  </ThemedText>
                </View>
                <Switch
                  value={isEnabled && count > 0}
                  onValueChange={() => count > 0 && handleToggle(toggle.key)}
                  trackColor={{ false: borderColor, true: tintColor + "60" }}
                  thumbColor={isEnabled ? tintColor : mutedColor}
                  disabled={count === 0}
                />
              </TouchableOpacity>
            );
          })
        )}

        {!countsLoading && !countsError && (
          <ThemedText style={[s.hint, { color: mutedColor }]}>
            O catálogo de serviços é opt-in — marque apenas se desejar incluí-lo
            no pack.
          </ThemedText>
        )}
      </View>

      {/* ── Export Result Card ── */}
      {exportResult && (
        <View style={[s.card, { backgroundColor: cardColor, borderColor }]}>
          <ThemedText style={[s.cardTitle, { color: textColor }]}>
            Resultado da Exportação
          </ThemedText>

          {/* Counts */}
          <View style={s.resultCounts}>
            {Object.entries(exportResult.counts).map(([key, val]) =>
              val > 0 ? (
                <View key={key} style={s.resultCountRow}>
                  <ThemedText
                    style={[s.resultCountLabel, { color: mutedColor }]}
                  >
                    {key.replace(/_/g, " ")}
                  </ThemedText>
                  <ThemedText
                    style={[s.resultCountValue, { color: textColor }]}
                  >
                    {val}
                  </ThemedText>
                </View>
              ) : null,
            )}
          </View>

          {/* Validation */}
          {exportResult.validation.valid ? (
            <View style={[s.validationBanner, s.validationSuccess]}>
              <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
              <ThemedText style={[s.validationText, { color: "#16a34a" }]}>
                Pack válido — todas as referências resolvidas
              </ThemedText>
            </View>
          ) : (
            <View style={s.validationErrors}>
              <View style={[s.validationBanner, s.validationWarning]}>
                <Ionicons name="warning" size={18} color="#d97706" />
                <ThemedText style={[s.validationText, { color: "#d97706" }]}>
                  {exportResult.validation.errors.length} aviso(s) de validação
                </ThemedText>
              </View>
              {exportResult.validation.errors.map((err, i) => (
                <ThemedText
                  key={i}
                  style={[s.validationErrorItem, { color: "#dc2626" }]}
                >
                  • {err}
                </ThemedText>
              ))}
            </View>
          )}

          {/* Re-download button */}
          <TouchableOpacity
            onPress={() => downloadPackAsJson(exportResult.pack)}
            style={[s.secondaryBtn, { borderColor: tintColor }]}
          >
            <Ionicons name="download-outline" size={16} color={tintColor} />
            <ThemedText style={[s.secondaryBtnText, { color: tintColor }]}>
              Baixar JSON novamente
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Export Error ── */}
      {exportError && (
        <View style={[s.card, s.errorCard]}>
          <ThemedText style={[s.errorText, { color: "#dc2626" }]}>
            {exportError}
          </ThemedText>
        </View>
      )}

      {/* ── Export Button ── */}
      <TouchableOpacity
        onPress={handleExport}
        disabled={exporting || !name.trim() || !slug.trim()}
        style={[
          s.exportBtn,
          {
            backgroundColor:
              exporting || !name.trim() || !slug.trim()
                ? mutedColor
                : tintColor,
          },
        ]}
      >
        {exporting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
        )}
        <ThemedText style={s.exportBtnText}>
          {exporting ? "Exportando..." : "Exportar Pack"}
        </ThemedText>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 80 },

  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "bold" },
  subtitle: { fontSize: 13, marginTop: 4 },

  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  field: { marginBottom: 12 },
  label: { fontSize: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 12 },
  colorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  colorSwatch: { width: 28, height: 28, borderRadius: 6 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  toggleIcon: { marginRight: 10 },
  toggleLabelArea: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: "500" },
  toggleCount: { fontSize: 11, marginTop: 1 },

  hint: { fontSize: 11, fontStyle: "italic", marginTop: 8 },

  countBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  countBadgeText: { fontSize: 12, fontWeight: "700" },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: { fontSize: 13 },
  errorText: { fontSize: 13 },
  errorCard: { backgroundColor: "#fee2e2", borderColor: "#fca5a5" },

  resultCounts: { marginBottom: 12 },
  resultCountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  resultCountLabel: { fontSize: 13, textTransform: "capitalize" },
  resultCountValue: { fontSize: 13, fontWeight: "600" },

  validationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  validationSuccess: { backgroundColor: "#dcfce7" },
  validationWarning: { backgroundColor: "#fef3c7" },
  validationText: { fontSize: 13, fontWeight: "600" },
  validationErrors: { marginBottom: 8 },
  validationErrorItem: { fontSize: 12, marginTop: 2, paddingLeft: 8 },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "600" },

  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  exportBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
