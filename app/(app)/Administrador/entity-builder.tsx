/**
 * Entity Builder — Wizard screen for creating custom entities and fields.
 *
 * 4-step wizard:
 *   Step 0: Choose action (add fields, new entity, manage existing)
 *   Step 1: Configure entity metadata OR select existing table
 *   Step 2: Field editor (add/edit/remove custom fields)
 *   Step 3: Review summary & save
 *
 * Non-technical users can build custom data structures without
 * touching the database or writing code.
 */

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { CrudFieldType, MaskPreset } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import type { CustomFieldDefinition } from "@/services/custom-fields";
import { CUSTOM_FIELDS_WELL_KNOWN_TABLES } from "@/services/custom-fields";
import {
    createEntityDefinition,
    ENTITY_ICON_OPTIONS,
    entityTargetTable,
    loadEntityDefinitions,
    nameToRefKey,
    PARENT_TABLE_OPTIONS,
    type EntityDefinition
} from "@/services/entity-builder";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ================================================================== */
/*  TYPES & CONSTANTS                                                  */
/* ================================================================== */

type WizardAction = "add_fields" | "new_entity" | "manage";

interface WizardFieldDraft {
  /** Local temp key for list identity */
  _key: string;
  field_key: string;
  label: string;
  placeholder: string;
  field_type: CrudFieldType;
  mask_type: MaskPreset | "";
  required: boolean;
  visible_in_list: boolean;
  visible_in_form: boolean;
  section: string;
  sort_order: number;
}

const FIELD_TYPE_OPTIONS: { label: string; value: CrudFieldType }[] = [
  { label: "Texto", value: "text" },
  { label: "Texto longo", value: "multiline" },
  { label: "Número", value: "number" },
  { label: "Moeda (R$)", value: "currency" },
  { label: "Data", value: "date" },
  { label: "Data e hora", value: "datetime" },
  { label: "Booleano (Sim/Não)", value: "boolean" },
  { label: "Seleção", value: "select" },
  { label: "E-mail", value: "email" },
  { label: "Telefone", value: "phone" },
  { label: "URL", value: "url" },
  { label: "CPF/CNPJ/CEP (máscara)", value: "masked" },
  { label: "Referência", value: "reference" },
  { label: "JSON", value: "json" },
];

const MASK_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: "CPF", value: "cpf" },
  { label: "CNPJ", value: "cnpj" },
  { label: "CPF ou CNPJ", value: "cpf_cnpj" },
  { label: "CEP", value: "cep" },
  { label: "Telefone", value: "phone" },
];

const TABLE_LABELS: Record<string, string> = {
  customers: "Clientes",
  service_orders: "Ordens de Serviço",
  leads: "Leads",
  partners: "Parceiros",
  companies: "Empresas",
  products: "Produtos",
  suppliers: "Fornecedores",
  contracts: "Contratos",
  invoices: "Faturas",
};

const formatTableLabel = (table: string): string =>
  TABLE_LABELS[table] ?? table;

const fieldTypeLabel = (type: string): string =>
  FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;

let _draftCounter = 0;
const nextDraftKey = () => `draft_${++_draftCounter}`;

const createEmptyField = (sortOrder: number): WizardFieldDraft => ({
  _key: nextDraftKey(),
  field_key: "",
  label: "",
  placeholder: "",
  field_type: "text",
  mask_type: "",
  required: false,
  visible_in_list: true,
  visible_in_form: true,
  section: "",
  sort_order: sortOrder,
});

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function EntityBuilderScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const tenantId = user?.tenant_id ?? "";

  /* ── Theme ── */
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const bgColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");
  const onTintText = useThemeColor({}, "background");

  /* ── Wizard state ── */
  const [step, setStep] = useState(0);
  const [action, setAction] = useState<WizardAction | null>(null);

  /* ── Entity config (step 1) ── */
  const [entityName, setEntityName] = useState("");
  const [entityNamePlural, setEntityNamePlural] = useState("");
  const [entityDescription, setEntityDescription] = useState("");
  const [entityIcon, setEntityIcon] = useState("document-outline");
  const [entityParentTable, setEntityParentTable] = useState("");
  const [selectedTable, setSelectedTable] = useState("");

  /* ── Fields (step 2) ── */
  const [fields, setFields] = useState<WizardFieldDraft[]>([
    createEmptyField(0),
  ]);
  const [editingFieldIdx, setEditingFieldIdx] = useState<number | null>(null);

  /* ── Existing entities (manage mode) ── */
  const [existingEntities, setExistingEntities] = useState<EntityDefinition[]>(
    [],
  );
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [existingFields, setExistingFields] = useState<CustomFieldDefinition[]>(
    [],
  );

  /* ── Save state ── */
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /* ── Field editor modal ── */
  const [fieldModalOpen, setFieldModalOpen] = useState(false);

  /* ── Icon picker modal ── */
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  /* ================================================================ */
  /*  Data loading                                                     */
  /* ================================================================ */

  const loadExistingEntities = useCallback(async () => {
    if (!tenantId) return;
    setLoadingEntities(true);
    try {
      const entities = await loadEntityDefinitions(tenantId);
      setExistingEntities(entities);
    } catch {
      setExistingEntities([]);
    } finally {
      setLoadingEntities(false);
    }
  }, [tenantId]);

  const loadFieldsForTarget = useCallback(
    async (targetTable: string) => {
      if (!tenantId) return;
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "custom_field_definitions",
          ...buildSearchParams(
            [
              { field: "tenant_id", value: tenantId },
              { field: "target_table", value: targetTable },
            ],
            {
              sortColumn: "sort_order ASC, label ASC",
              autoExcludeDeleted: true,
            },
          ),
        });
        setExistingFields(normalizeCrudList<CustomFieldDefinition>(res.data));
      } catch {
        setExistingFields([]);
      }
    },
    [tenantId],
  );

  // Load entities when entering manage mode
  useEffect(() => {
    if (action === "manage") {
      loadExistingEntities();
    }
  }, [action, loadExistingEntities]);

  // Load existing fields when managing an entity
  useEffect(() => {
    if (action === "manage" && selectedEntityId) {
      const entity = existingEntities.find((e) => e.id === selectedEntityId);
      if (entity) {
        loadFieldsForTarget(entityTargetTable(entity.ref_key));
      }
    }
  }, [action, selectedEntityId, existingEntities, loadFieldsForTarget]);

  // Load existing fields when adding fields to existing table
  useEffect(() => {
    if (action === "add_fields" && selectedTable && step === 2) {
      loadFieldsForTarget(selectedTable);
    }
  }, [action, selectedTable, step, loadFieldsForTarget]);

  /* ================================================================ */
  /*  Computed                                                         */
  /* ================================================================ */

  const refKey = useMemo(
    () => (entityName ? nameToRefKey(entityName) : ""),
    [entityName],
  );

  const targetTable = useMemo(() => {
    if (action === "new_entity") return entityTargetTable(refKey);
    if (action === "add_fields") return selectedTable;
    if (action === "manage" && selectedEntityId) {
      const entity = existingEntities.find((e) => e.id === selectedEntityId);
      return entity ? entityTargetTable(entity.ref_key) : "";
    }
    return "";
  }, [action, refKey, selectedTable, selectedEntityId, existingEntities]);

  const validFields = useMemo(
    () =>
      fields.filter(
        (f) =>
          f.field_key.trim() &&
          f.label.trim() &&
          /^[a-z][a-z0-9_]*$/.test(f.field_key.trim()),
      ),
    [fields],
  );

  const canProceedStep1 = useMemo(() => {
    if (action === "new_entity") return entityName.trim().length >= 2;
    if (action === "add_fields") return !!selectedTable;
    if (action === "manage") return !!selectedEntityId;
    return false;
  }, [action, entityName, selectedTable, selectedEntityId]);

  const canProceedStep2 = validFields.length > 0;

  const stepLabels = ["Ação", "Configuração", "Campos", "Revisar"];

  /* ================================================================ */
  /*  Field management                                                 */
  /* ================================================================ */

  const addField = useCallback(() => {
    setFields((prev) => [...prev, createEmptyField(prev.length)]);
  }, []);

  const removeField = useCallback((idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateField = useCallback(
    (idx: number, patch: Partial<WizardFieldDraft>) => {
      setFields((prev) =>
        prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const openFieldEditor = useCallback((idx: number) => {
    setEditingFieldIdx(idx);
    setFieldModalOpen(true);
  }, []);

  const autoGenerateKey = useCallback(
    (label: string, idx: number) => {
      const key = nameToRefKey(label);
      if (key) {
        updateField(idx, { field_key: key });
      }
    },
    [updateField],
  );

  /* ================================================================ */
  /*  Save                                                             */
  /* ================================================================ */

  const handleSave = useCallback(async () => {
    if (!tenantId) return;
    setSaving(true);
    setError(null);

    try {
      let finalTargetTable = targetTable;

      // Step A: Create entity definition if new_entity
      if (action === "new_entity") {
        const entityPayload: Partial<EntityDefinition> = {
          tenant_id: tenantId,
          ref_key: refKey,
          name: entityName.trim(),
          name_plural: entityNamePlural.trim() || undefined,
          description: entityDescription.trim() || undefined,
          icon: entityIcon,
          parent_table: entityParentTable || undefined,
        };
        const created = await createEntityDefinition(entityPayload);
        finalTargetTable = entityTargetTable(created.ref_key);
      }

      // Step B: Batch create custom field definitions
      if (validFields.length > 0) {
        const now = new Date().toISOString();
        for (const field of validFields) {
          await api.post(CRUD_ENDPOINT, {
            action: "create",
            table: "custom_field_definitions",
            payload: {
              tenant_id: tenantId,
              target_table: finalTargetTable,
              field_key: field.field_key.trim(),
              label: field.label.trim(),
              placeholder: field.placeholder.trim() || null,
              field_type: field.field_type,
              mask_type:
                field.field_type === "masked" && field.mask_type
                  ? field.mask_type
                  : null,
              required: field.required,
              visible_in_list: field.visible_in_list,
              visible_in_form: field.visible_in_form,
              read_only: false,
              section: field.section.trim() || null,
              sort_order: field.sort_order,
              is_system: false,
              created_at: now,
              updated_at: now,
            },
          });
        }
      }

      setSuccess(true);
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao salvar"));
    } finally {
      setSaving(false);
    }
  }, [
    tenantId,
    targetTable,
    action,
    refKey,
    entityName,
    entityNamePlural,
    entityDescription,
    entityIcon,
    entityParentTable,
    validFields,
  ]);

  /* ================================================================ */
  /*  Navigation                                                       */
  /* ================================================================ */

  const goNext = useCallback(() => setStep((s) => Math.min(s + 1, 3)), []);
  const goBack = useCallback(() => {
    if (step === 0) {
      router.back();
    } else {
      setStep((s) => s - 1);
    }
  }, [step, router]);

  const resetWizard = useCallback(() => {
    setStep(0);
    setAction(null);
    setEntityName("");
    setEntityNamePlural("");
    setEntityDescription("");
    setEntityIcon("document-outline");
    setEntityParentTable("");
    setSelectedTable("");
    setFields([createEmptyField(0)]);
    setSelectedEntityId(null);
    setExistingFields([]);
    setSaving(false);
    setError(null);
    setSuccess(false);
  }, []);

  /* ================================================================ */
  /*  RENDER HELPERS                                                    */
  /* ================================================================ */

  const inputStyle = {
    borderWidth: 1,
    borderColor,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: inputBg,
    color: textColor,
    fontSize: 14,
  } as const;

  const renderStepIndicator = () => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: borderColor,
        backgroundColor: cardColor,
      }}
    >
      {stepLabels.map((label, idx) => {
        const isActive = idx === step;
        const isDone = idx < step;
        return (
          <View
            key={label}
            style={{
              flex: 1,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: isActive
                  ? tintColor
                  : isDone
                    ? tintColor + "40"
                    : borderColor + "60",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              {isDone ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : (
                <ThemedText
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: isActive ? onTintText : mutedColor,
                  }}
                >
                  {idx + 1}
                </ThemedText>
              )}
            </View>
            <ThemedText
              style={{
                fontSize: 10,
                fontWeight: isActive ? "700" : "400",
                color: isActive ? tintColor : mutedColor,
              }}
            >
              {label}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );

  const renderActionCard = (
    key: WizardAction,
    icon: string,
    title: string,
    description: string,
  ) => (
    <TouchableOpacity
      key={key}
      onPress={() => {
        setAction(key);
        goNext();
      }}
      style={{
        backgroundColor: cardColor,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        padding: 16,
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      }}
      activeOpacity={0.7}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: tintColor + "15",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name={icon as any} size={22} color={tintColor} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText
          style={{ fontSize: 15, fontWeight: "700", color: textColor }}
        >
          {title}
        </ThemedText>
        <ThemedText style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}>
          {description}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={mutedColor} />
    </TouchableOpacity>
  );

  const renderSelectableOption = (
    label: string,
    value: string,
    selected: boolean,
    onPress: () => void,
    subtitle?: string,
  ) => (
    <TouchableOpacity
      key={value}
      onPress={onPress}
      style={{
        backgroundColor: selected ? tintColor + "12" : cardColor,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: selected ? tintColor : borderColor,
        padding: 14,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
      activeOpacity={0.7}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? tintColor : borderColor,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {selected && (
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: tintColor,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText
          style={{
            fontSize: 14,
            fontWeight: selected ? "600" : "400",
            color: textColor,
          }}
        >
          {label}
        </ThemedText>
        {subtitle ? (
          <ThemedText style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  /* ================================================================ */
  /*  STEP 0: Choose Action                                            */
  /* ================================================================ */

  const renderStep0 = () => (
    <View style={{ padding: 16 }}>
      <ThemedText
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: textColor,
          marginBottom: 4,
        }}
      >
        O que você deseja fazer?
      </ThemedText>
      <ThemedText style={{ fontSize: 13, color: mutedColor, marginBottom: 20 }}>
        Escolha uma ação para começar
      </ThemedText>

      {renderActionCard(
        "new_entity",
        "add-circle-outline",
        "Criar nova entidade",
        "Crie uma nova ficha personalizada (ex: Prontuário, Vistoria, Ficha Técnica)",
      )}
      {renderActionCard(
        "add_fields",
        "create-outline",
        "Adicionar campos a tabela existente",
        "Adicione campos extras a Clientes, Ordens de Serviço, Leads, etc.",
      )}
      {renderActionCard(
        "manage",
        "settings-outline",
        "Gerenciar entidades existentes",
        "Veja e edite entidades e campos já criados",
      )}
    </View>
  );

  /* ================================================================ */
  /*  STEP 1: Configure Entity / Select Table                          */
  /* ================================================================ */

  const renderStep1NewEntity = () => (
    <View style={{ padding: 16 }}>
      <ThemedText
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: textColor,
          marginBottom: 16,
        }}
      >
        Configurar Entidade
      </ThemedText>

      {/* Name */}
      <View style={{ marginBottom: 14 }}>
        <ThemedText
          style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
        >
          Nome da Entidade *
        </ThemedText>
        <TextInput
          value={entityName}
          onChangeText={setEntityName}
          placeholder="Ex: Prontuário, Vistoria, Ficha Técnica"
          placeholderTextColor={mutedColor}
          style={inputStyle}
        />
        {refKey ? (
          <ThemedText style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>
            Chave: {refKey}
          </ThemedText>
        ) : null}
      </View>

      {/* Name Plural */}
      <View style={{ marginBottom: 14 }}>
        <ThemedText
          style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
        >
          Nome no plural
        </ThemedText>
        <TextInput
          value={entityNamePlural}
          onChangeText={setEntityNamePlural}
          placeholder="Ex: Prontuários, Vistorias"
          placeholderTextColor={mutedColor}
          style={inputStyle}
        />
      </View>

      {/* Description */}
      <View style={{ marginBottom: 14 }}>
        <ThemedText
          style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
        >
          Descrição
        </ThemedText>
        <TextInput
          value={entityDescription}
          onChangeText={setEntityDescription}
          placeholder="Descrição curta da entidade"
          placeholderTextColor={mutedColor}
          multiline
          style={{ ...inputStyle, minHeight: 60, textAlignVertical: "top" }}
        />
      </View>

      {/* Icon picker */}
      <View style={{ marginBottom: 14 }}>
        <ThemedText
          style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
        >
          Ícone
        </ThemedText>
        <TouchableOpacity
          onPress={() => setIconPickerOpen(true)}
          style={{
            ...inputStyle,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 12,
          }}
        >
          <Ionicons name={entityIcon as any} size={20} color={tintColor} />
          <ThemedText style={{ flex: 1, color: textColor }}>
            {ENTITY_ICON_OPTIONS.find((o) => o.value === entityIcon)?.label ??
              entityIcon}
          </ThemedText>
          <Ionicons name="chevron-down" size={16} color={mutedColor} />
        </TouchableOpacity>
      </View>

      {/* Parent table */}
      <View style={{ marginBottom: 14 }}>
        <ThemedText
          style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
        >
          Vinculada a (tabela pai)
        </ThemedText>
        <ThemedText
          style={{
            fontSize: 11,
            color: mutedColor,
            marginBottom: 8,
            lineHeight: 16,
          }}
        >
          Vincular a uma tabela permite criar registros desta entidade dentro de
          um registro pai (ex: Prontuários de um Cliente).
        </ThemedText>
        {PARENT_TABLE_OPTIONS.map((opt) =>
          renderSelectableOption(
            opt.label,
            opt.value,
            entityParentTable === opt.value,
            () => setEntityParentTable(opt.value),
          ),
        )}
      </View>
    </View>
  );

  const renderStep1AddFields = () => (
    <View style={{ padding: 16 }}>
      <ThemedText
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: textColor,
          marginBottom: 4,
        }}
      >
        Selecionar Tabela
      </ThemedText>
      <ThemedText style={{ fontSize: 13, color: mutedColor, marginBottom: 16 }}>
        Escolha a tabela onde os campos serão adicionados
      </ThemedText>

      {CUSTOM_FIELDS_WELL_KNOWN_TABLES.map((table) =>
        renderSelectableOption(
          formatTableLabel(table),
          table,
          selectedTable === table,
          () => setSelectedTable(table),
        ),
      )}
    </View>
  );

  const renderStep1Manage = () => (
    <View style={{ padding: 16 }}>
      <ThemedText
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: textColor,
          marginBottom: 4,
        }}
      >
        Entidades Existentes
      </ThemedText>
      <ThemedText style={{ fontSize: 13, color: mutedColor, marginBottom: 16 }}>
        Selecione uma entidade para ver seus campos
      </ThemedText>

      {loadingEntities ? (
        <ActivityIndicator
          size="large"
          color={tintColor}
          style={{ marginTop: 24 }}
        />
      ) : existingEntities.length === 0 ? (
        <View
          style={{
            alignItems: "center",
            paddingVertical: 32,
          }}
        >
          <Ionicons name="cube-outline" size={40} color={mutedColor} />
          <ThemedText
            style={{ fontSize: 14, color: mutedColor, marginTop: 12 }}
          >
            Nenhuma entidade personalizada encontrada.
          </ThemedText>
          <TouchableOpacity
            onPress={() => {
              setAction("new_entity");
              setStep(1);
            }}
            style={{
              marginTop: 16,
              backgroundColor: tintColor,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 8,
            }}
          >
            <ThemedText style={{ color: onTintText, fontWeight: "600" }}>
              Criar primeira entidade
            </ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        existingEntities.map((entity) =>
          renderSelectableOption(
            entity.name,
            entity.id,
            selectedEntityId === entity.id,
            () => setSelectedEntityId(entity.id),
            `${entity.ref_key}${entity.parent_table ? ` · vinculada a ${formatTableLabel(entity.parent_table)}` : ""}`,
          ),
        )
      )}
    </View>
  );

  const renderStep1 = () => {
    if (action === "new_entity") return renderStep1NewEntity();
    if (action === "add_fields") return renderStep1AddFields();
    if (action === "manage") return renderStep1Manage();
    return null;
  };

  /* ================================================================ */
  /*  STEP 2: Field Editor                                             */
  /* ================================================================ */

  const renderFieldRow = (field: WizardFieldDraft, idx: number) => (
    <View
      key={field._key}
      style={{
        backgroundColor: cardColor,
        borderRadius: 10,
        borderWidth: 1,
        borderColor,
        padding: 12,
        marginBottom: 10,
      }}
    >
      {/* Compact inline entry */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        {/* Label input */}
        <View style={{ flex: 2 }}>
          <ThemedText
            style={{ fontSize: 10, color: mutedColor, marginBottom: 2 }}
          >
            Rótulo *
          </ThemedText>
          <TextInput
            value={field.label}
            onChangeText={(text) => {
              updateField(idx, { label: text });
              // Auto-generate key if key is empty or was auto-generated
              if (
                !field.field_key ||
                field.field_key === nameToRefKey(field.label)
              ) {
                autoGenerateKey(text, idx);
              }
            }}
            placeholder="Ex: Peso"
            placeholderTextColor={mutedColor}
            style={{ ...inputStyle, paddingVertical: 8, fontSize: 13 }}
          />
        </View>

        {/* Type selector */}
        <View style={{ flex: 1 }}>
          <ThemedText
            style={{ fontSize: 10, color: mutedColor, marginBottom: 2 }}
          >
            Tipo
          </ThemedText>
          <TouchableOpacity
            onPress={() => openFieldEditor(idx)}
            style={{
              ...inputStyle,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ThemedText
              style={{ fontSize: 12, color: textColor, flex: 1 }}
              numberOfLines={1}
            >
              {fieldTypeLabel(field.field_type)}
            </ThemedText>
            <Ionicons name="chevron-down" size={12} color={mutedColor} />
          </TouchableOpacity>
        </View>

        {/* Delete button */}
        <TouchableOpacity
          onPress={() => {
            if (fields.length <= 1) return;
            if (Platform.OS === "web") {
              if (window.confirm("Remover este campo?")) removeField(idx);
            } else {
              Alert.alert("Remover campo?", "", [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Remover",
                  style: "destructive",
                  onPress: () => removeField(idx),
                },
              ]);
            }
          }}
          style={{
            marginTop: 14,
            padding: 6,
            opacity: fields.length <= 1 ? 0.3 : 1,
          }}
          disabled={fields.length <= 1}
        >
          <Ionicons name="trash-outline" size={18} color="#dc2626" />
        </TouchableOpacity>
      </View>

      {/* Key preview */}
      {field.field_key ? (
        <ThemedText style={{ fontSize: 10, color: mutedColor, marginTop: 4 }}>
          Chave: {field.field_key}
          {field.required ? " · Obrigatório" : ""}
          {field.section ? ` · Seção: ${field.section}` : ""}
        </ThemedText>
      ) : null}

      {/* Edit details button */}
      <TouchableOpacity
        onPress={() => openFieldEditor(idx)}
        style={{ marginTop: 6 }}
      >
        <ThemedText
          style={{ fontSize: 12, color: tintColor, fontWeight: "500" }}
        >
          Editar detalhes ›
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => {
    const tableLabel =
      action === "new_entity"
        ? entityName || "Nova entidade"
        : action === "add_fields"
          ? formatTableLabel(selectedTable)
          : (existingEntities.find((e) => e.id === selectedEntityId)?.name ??
            "");

    return (
      <View style={{ padding: 16 }}>
        <ThemedText
          style={{
            fontSize: 18,
            fontWeight: "700",
            color: textColor,
            marginBottom: 4,
          }}
        >
          Campos de {tableLabel}
        </ThemedText>
        <ThemedText
          style={{ fontSize: 13, color: mutedColor, marginBottom: 4 }}
        >
          Defina os campos que esta entidade terá
        </ThemedText>

        {/* Show existing fields count for context */}
        {existingFields.length > 0 && (
          <View
            style={{
              backgroundColor: tintColor + "10",
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={tintColor}
            />
            <ThemedText style={{ fontSize: 12, color: tintColor, flex: 1 }}>
              {existingFields.length} campo(s) já existente(s) nesta entidade.
              Os campos abaixo serão adicionados como novos.
            </ThemedText>
          </View>
        )}

        <View style={{ marginTop: 8 }}>
          {fields.map((field, idx) => renderFieldRow(field, idx))}
        </View>

        <TouchableOpacity
          onPress={addField}
          style={{
            borderWidth: 1,
            borderColor,
            borderStyle: "dashed",
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
            marginTop: 4,
          }}
        >
          <Ionicons name="add" size={18} color={tintColor} />
          <ThemedText
            style={{ color: tintColor, fontWeight: "600", fontSize: 14 }}
          >
            Adicionar campo
          </ThemedText>
        </TouchableOpacity>
      </View>
    );
  };

  /* ================================================================ */
  /*  STEP 3: Review & Save                                            */
  /* ================================================================ */

  const renderStep3 = () => {
    if (success) {
      return (
        <View style={{ padding: 16, alignItems: "center", paddingTop: 40 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: "#10b98120",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="checkmark-circle" size={40} color="#10b981" />
          </View>
          <ThemedText
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: textColor,
              marginBottom: 8,
            }}
          >
            Salvo com sucesso!
          </ThemedText>
          <ThemedText
            style={{
              fontSize: 14,
              color: mutedColor,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            {action === "new_entity"
              ? `A entidade "${entityName}" foi criada com ${validFields.length} campo(s).`
              : `${validFields.length} campo(s) adicionado(s) com sucesso.`}
          </ThemedText>

          <View style={{ gap: 10, width: "100%" }}>
            <TouchableOpacity
              onPress={resetWizard}
              style={{
                backgroundColor: tintColor,
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <ThemedText style={{ color: onTintText, fontWeight: "700" }}>
                Criar outra
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                Voltar para Admin
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const entityDisplayName =
      action === "new_entity"
        ? entityName
        : action === "add_fields"
          ? formatTableLabel(selectedTable)
          : (existingEntities.find((e) => e.id === selectedEntityId)?.name ??
            "");

    return (
      <View style={{ padding: 16 }}>
        <ThemedText
          style={{
            fontSize: 18,
            fontWeight: "700",
            color: textColor,
            marginBottom: 16,
          }}
        >
          Revisar e Salvar
        </ThemedText>

        {/* Entity summary card */}
        <View
          style={{
            backgroundColor: cardColor,
            borderRadius: 12,
            borderWidth: 1,
            borderColor,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <Ionicons
              name={
                action === "new_entity" ? (entityIcon as any) : "create-outline"
              }
              size={24}
              color={tintColor}
            />
            <View style={{ flex: 1 }}>
              <ThemedText
                style={{ fontSize: 16, fontWeight: "700", color: textColor }}
              >
                {entityDisplayName}
              </ThemedText>
              {action === "new_entity" && (
                <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                  Chave: {refKey}
                  {entityParentTable
                    ? ` · Vinculada a ${formatTableLabel(entityParentTable)}`
                    : " · Independente"}
                </ThemedText>
              )}
            </View>
          </View>

          {action === "new_entity" && entityDescription ? (
            <ThemedText
              style={{
                fontSize: 13,
                color: mutedColor,
                marginBottom: 12,
                lineHeight: 18,
              }}
            >
              {entityDescription}
            </ThemedText>
          ) : null}

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: borderColor,
              paddingTop: 12,
            }}
          >
            <ThemedText
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: textColor,
                marginBottom: 8,
              }}
            >
              {validFields.length} novo(s) campo(s):
            </ThemedText>
            {validFields.map((field) => (
              <View
                key={field._key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 4,
                }}
              >
                <ThemedText style={{ fontSize: 13, color: textColor, flex: 1 }}>
                  {field.label}
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                  {fieldTypeLabel(field.field_type)}
                  {field.required ? " · Obrigatório" : ""}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        {error ? (
          <View
            style={{
              backgroundColor: "#fee2e2",
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <ThemedText style={{ color: "#dc2626", fontSize: 13 }}>
              {error}
            </ThemedText>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: saving ? mutedColor : tintColor,
            borderRadius: 10,
            paddingVertical: 16,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {saving && <ActivityIndicator size="small" color="#fff" />}
          <ThemedText
            style={{ color: onTintText, fontWeight: "700", fontSize: 15 }}
          >
            {saving ? "Salvando..." : "Confirmar e Salvar"}
          </ThemedText>
        </TouchableOpacity>
      </View>
    );
  };

  /* ================================================================ */
  /*  FIELD EDITOR MODAL                                               */
  /* ================================================================ */

  const editField = editingFieldIdx !== null ? fields[editingFieldIdx] : null;

  const renderFieldEditorModal = () => (
    <Modal
      transparent
      visible={fieldModalOpen && editField !== null}
      animationType="slide"
      onRequestClose={() => setFieldModalOpen(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
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
                marginBottom: 16,
              }}
            >
              <ThemedText
                style={{ fontSize: 18, fontWeight: "700", color: textColor }}
              >
                Detalhes do Campo
              </ThemedText>
              <TouchableOpacity
                onPress={() => setFieldModalOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: borderColor + "60",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ThemedText style={{ color: mutedColor, fontSize: 16 }}>
                  ✕
                </ThemedText>
              </TouchableOpacity>
            </View>

            {editField && editingFieldIdx !== null && (
              <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
                {/* Label */}
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
                  >
                    Rótulo *
                  </ThemedText>
                  <TextInput
                    value={editField.label}
                    onChangeText={(text) => {
                      updateField(editingFieldIdx, { label: text });
                      if (
                        !editField.field_key ||
                        editField.field_key === nameToRefKey(editField.label)
                      ) {
                        autoGenerateKey(text, editingFieldIdx);
                      }
                    }}
                    placeholder="Ex: Peso do Animal"
                    placeholderTextColor={mutedColor}
                    style={inputStyle}
                  />
                </View>

                {/* Key */}
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
                  >
                    Chave (identificador) *
                  </ThemedText>
                  <TextInput
                    value={editField.field_key}
                    onChangeText={(text) =>
                      updateField(editingFieldIdx, {
                        field_key: text
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, ""),
                      })
                    }
                    placeholder="peso_animal"
                    placeholderTextColor={mutedColor}
                    autoCapitalize="none"
                    style={inputStyle}
                  />
                  <ThemedText
                    style={{ fontSize: 10, color: mutedColor, marginTop: 4 }}
                  >
                    Apenas letras minúsculas, números e underscore
                  </ThemedText>
                </View>

                {/* Placeholder */}
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
                  >
                    Placeholder
                  </ThemedText>
                  <TextInput
                    value={editField.placeholder}
                    onChangeText={(text) =>
                      updateField(editingFieldIdx, { placeholder: text })
                    }
                    placeholder="Texto exibido quando vazio"
                    placeholderTextColor={mutedColor}
                    style={inputStyle}
                  />
                </View>

                {/* Type */}
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
                  >
                    Tipo do campo *
                  </ThemedText>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    {FIELD_TYPE_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() =>
                          updateField(editingFieldIdx, {
                            field_type: opt.value,
                          })
                        }
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor:
                            editField.field_type === opt.value
                              ? tintColor
                              : borderColor,
                          backgroundColor:
                            editField.field_type === opt.value
                              ? tintColor + "15"
                              : "transparent",
                        }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 12,
                            color:
                              editField.field_type === opt.value
                                ? tintColor
                                : textColor,
                            fontWeight:
                              editField.field_type === opt.value
                                ? "600"
                                : "400",
                          }}
                        >
                          {opt.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Mask type (conditional) */}
                {editField.field_type === "masked" && (
                  <View style={{ marginBottom: 12 }}>
                    <ThemedText
                      style={{
                        fontSize: 12,
                        color: mutedColor,
                        marginBottom: 4,
                      }}
                    >
                      Tipo de máscara
                    </ThemedText>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      {MASK_TYPE_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          onPress={() =>
                            updateField(editingFieldIdx, {
                              mask_type: opt.value as MaskPreset,
                            })
                          }
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor:
                              editField.mask_type === opt.value
                                ? tintColor
                                : borderColor,
                            backgroundColor:
                              editField.mask_type === opt.value
                                ? tintColor + "15"
                                : "transparent",
                          }}
                        >
                          <ThemedText
                            style={{
                              fontSize: 12,
                              color:
                                editField.mask_type === opt.value
                                  ? tintColor
                                  : textColor,
                            }}
                          >
                            {opt.label}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Section */}
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
                  >
                    Seção no formulário
                  </ThemedText>
                  <TextInput
                    value={editField.section}
                    onChangeText={(text) =>
                      updateField(editingFieldIdx, { section: text })
                    }
                    placeholder="Ex: Dados Adicionais"
                    placeholderTextColor={mutedColor}
                    style={inputStyle}
                  />
                </View>

                {/* Toggles */}
                <View style={{ gap: 10, marginBottom: 12 }}>
                  {[
                    { key: "required", label: "Obrigatório" },
                    { key: "visible_in_list", label: "Visível na listagem" },
                    { key: "visible_in_form", label: "Visível no formulário" },
                  ].map((toggle) => (
                    <TouchableOpacity
                      key={toggle.key}
                      onPress={() =>
                        updateField(editingFieldIdx, {
                          [toggle.key]:
                            !editField[toggle.key as keyof WizardFieldDraft],
                        })
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          borderWidth: 2,
                          borderColor: editField[
                            toggle.key as keyof WizardFieldDraft
                          ]
                            ? tintColor
                            : borderColor,
                          backgroundColor: editField[
                            toggle.key as keyof WizardFieldDraft
                          ]
                            ? tintColor
                            : "transparent",
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        {editField[toggle.key as keyof WizardFieldDraft] && (
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        )}
                      </View>
                      <ThemedText style={{ fontSize: 14, color: textColor }}>
                        {toggle.label}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            <TouchableOpacity
              onPress={() => setFieldModalOpen(false)}
              style={{
                backgroundColor: tintColor,
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <ThemedText style={{ color: onTintText, fontWeight: "700" }}>
                Concluir
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  /* ================================================================ */
  /*  ICON PICKER MODAL                                                */
  /* ================================================================ */

  const renderIconPickerModal = () => (
    <Modal
      transparent
      visible={iconPickerOpen}
      animationType="fade"
      onRequestClose={() => setIconPickerOpen(false)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: cardColor,
            borderRadius: 16,
            padding: 20,
            maxHeight: "80%",
          }}
        >
          <ThemedText
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: textColor,
              marginBottom: 16,
            }}
          >
            Escolher Ícone
          </ThemedText>

          <ScrollView>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {ENTITY_ICON_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    setEntityIcon(opt.value);
                    setIconPickerOpen(false);
                  }}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor:
                      entityIcon === opt.value ? tintColor : borderColor,
                    backgroundColor:
                      entityIcon === opt.value
                        ? tintColor + "15"
                        : "transparent",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ionicons
                    name={opt.value as any}
                    size={24}
                    color={entityIcon === opt.value ? tintColor : textColor}
                  />
                  <ThemedText
                    style={{
                      fontSize: 8,
                      color: mutedColor,
                      textAlign: "center",
                    }}
                    numberOfLines={1}
                  >
                    {opt.label.replace(/^[^\s]+\s/, "")}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            onPress={() => setIconPickerOpen(false)}
            style={{
              marginTop: 16,
              borderWidth: 1,
              borderColor,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <ThemedText style={{ color: textColor, fontWeight: "600" }}>
              Fechar
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  /* ================================================================ */
  /*  MAIN RENDER                                                      */
  /* ================================================================ */

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return renderStep0();
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return null;
    }
  };

  const canGoNext =
    (step === 0 && action !== null) ||
    (step === 1 && canProceedStep1) ||
    (step === 2 && canProceedStep2);

  return (
    <ProtectedRoute requiredPermission={[PERMISSIONS.TENANT_MANAGE]}>
      <ThemedView style={{ flex: 1, backgroundColor: bgColor }}>
        {/* Step indicator */}
        {renderStepIndicator()}

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {renderStepContent()}
        </ScrollView>

        {/* Bottom navigation bar */}
        {!success && (
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: cardColor,
              borderTopWidth: 1,
              borderTopColor: borderColor,
              paddingHorizontal: 16,
              paddingVertical: 12,
              paddingBottom: Platform.OS === "ios" ? 28 : 12,
              flexDirection: "row",
              gap: 10,
            }}
          >
            <TouchableOpacity
              onPress={goBack}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                {step === 0 ? "Cancelar" : "Voltar"}
              </ThemedText>
            </TouchableOpacity>

            {step < 3 && (
              <TouchableOpacity
                onPress={goNext}
                disabled={!canGoNext}
                style={{
                  flex: 2,
                  backgroundColor: canGoNext ? tintColor : mutedColor + "40",
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{
                    color: canGoNext ? onTintText : mutedColor,
                    fontWeight: "700",
                  }}
                >
                  Continuar
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Modals */}
        {renderFieldEditorModal()}
        {renderIconPickerModal()}
      </ThemedView>
    </ProtectedRoute>
  );
}
