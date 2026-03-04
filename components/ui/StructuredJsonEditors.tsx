/**
 * StructuredJsonEditors — Typed editors for workflow JSON fields.
 *
 * Replaces raw JsonEditor with structured forms that provide the keys
 * and let users fill in values. Serializes to/from the same JSON format.
 *
 * 4 editors:
 *   1. ConditionBuilder     → transition condition_json
 *   2. FormSchemaBuilder    → step_form form_schema_json
 *   3. ValidationRulesBuilder → step_form validation_rules_json
 *   4. EscalationRuleBuilder → deadline escalation_rule_json
 */

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo } from "react";
import {
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ================================================================== */
/*  Shared helpers                                                     */
/* ================================================================== */

interface ThemeProps {
  textColor: string;
  mutedColor: string;
  borderColor: string;
  bgColor: string;
  inputBgColor: string;
  tintColor: string;
}

function SectionLabel({
  label,
  hint,
  mutedColor,
}: {
  label: string;
  hint?: string;
  mutedColor: string;
}) {
  return (
    <View style={{ marginTop: 6, marginBottom: 4 }}>
      <Text style={[st.sectionLabel, { color: mutedColor }]}>{label}</Text>
      {hint ? (
        <Text style={[st.hint, { color: mutedColor }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

function MiniToggle({
  label,
  value,
  onChange,
  tintColor,
  borderColor,
  textColor,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  tintColor: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      style={[st.toggleRow, { borderBottomColor: borderColor }]}
      activeOpacity={0.7}
    >
      <Text style={[st.toggleLabel, { color: textColor }]}>{label}</Text>
      <View
        style={[
          st.toggleTrack,
          { backgroundColor: value ? tintColor : borderColor },
        ]}
      >
        <View
          style={[
            st.toggleThumb,
            { transform: [{ translateX: value ? 18 : 2 }] },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

function MiniInput({
  value,
  onChangeText,
  placeholder,
  textColor,
  mutedColor,
  borderColor,
  inputBgColor,
  multiline,
  keyboardType,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  inputBgColor: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={mutedColor}
      multiline={multiline}
      keyboardType={keyboardType}
      style={[
        st.input,
        {
          backgroundColor: inputBgColor,
          borderColor,
          color: textColor,
          ...(multiline
            ? { minHeight: 50, textAlignVertical: "top" as const }
            : {}),
        },
      ]}
    />
  );
}

function AddButton({
  label,
  onPress,
  tintColor,
}: {
  label: string;
  onPress: () => void;
  tintColor: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[st.addBtn, { backgroundColor: tintColor }]}
      activeOpacity={0.7}
    >
      <Ionicons name="add" size={16} color="#fff" />
      <Text style={st.addBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function RemoveButton({
  onPress,
  mutedColor,
}: {
  onPress: () => void;
  mutedColor: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={st.removeBtn}
      activeOpacity={0.7}
    >
      <Ionicons name="close-circle" size={20} color={mutedColor} />
    </TouchableOpacity>
  );
}

function OptionPill({
  label,
  selected,
  onPress,
  tintColor,
  borderColor,
  textColor,
  mutedColor,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tintColor: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        st.pill,
        {
          backgroundColor: selected ? tintColor + "18" : "transparent",
          borderColor: selected ? tintColor : borderColor,
        },
      ]}
      activeOpacity={0.7}
    >
      <Text
        style={{
          color: selected ? tintColor : mutedColor,
          fontSize: 13,
          fontWeight: selected ? "700" : "500",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/* ================================================================== */
/*  1. ConditionBuilder (transition condition_json)                    */
/* ================================================================== */

const CONDITION_OPERATORS = [
  { label: "Igual", value: "equals" },
  { label: "Diferente", value: "not_equals" },
  { label: "Contém", value: "contains" },
  { label: "Maior que", value: "gt" },
  { label: "Menor que", value: "lt" },
] as const;

interface CustomCondition {
  field: string;
  operator: string;
  value: string;
}

interface ConditionData {
  require_form_complete?: boolean;
  require_all_tasks_done?: boolean;
  require_approval?: boolean;
  custom_conditions?: CustomCondition[];
}

export function ConditionBuilder({
  value,
  onChange,
  ...theme
}: { value: string; onChange: (v: string) => void } & ThemeProps) {
  const parsed = useMemo<ConditionData>(() => {
    const obj = safeJsonParse(value);
    if (!obj) return {};
    return {
      require_form_complete: obj.require_form_complete as boolean | undefined,
      require_all_tasks_done: obj.require_all_tasks_done as boolean | undefined,
      require_approval: obj.require_approval as boolean | undefined,
      custom_conditions: Array.isArray(obj.custom_conditions)
        ? (obj.custom_conditions as CustomCondition[])
        : undefined,
    };
  }, [value]);

  const emit = useCallback(
    (patch: Partial<ConditionData>) => {
      const next = { ...parsed, ...patch };
      // Remove falsy toggles to keep JSON clean
      if (!next.require_form_complete) delete next.require_form_complete;
      if (!next.require_all_tasks_done) delete next.require_all_tasks_done;
      if (!next.require_approval) delete next.require_approval;
      if (!next.custom_conditions?.length) delete next.custom_conditions;
      const keys = Object.keys(next);
      onChange(keys.length ? JSON.stringify(next, null, 2) : "");
    },
    [parsed, onChange],
  );

  const conditions = parsed.custom_conditions ?? [];

  const updateCondition = useCallback(
    (idx: number, patch: Partial<CustomCondition>) => {
      const updated = [...conditions];
      updated[idx] = { ...updated[idx], ...patch };
      emit({ custom_conditions: updated });
    },
    [conditions, emit],
  );

  return (
    <View
      style={[
        st.container,
        { borderColor: theme.borderColor, backgroundColor: theme.bgColor },
      ]}
    >
      <MiniToggle
        label="Exigir formulários preenchidos"
        value={!!parsed.require_form_complete}
        onChange={(v) => emit({ require_form_complete: v })}
        tintColor={theme.tintColor}
        borderColor={theme.borderColor}
        textColor={theme.textColor}
      />
      <MiniToggle
        label="Exigir todas as tarefas concluídas"
        value={!!parsed.require_all_tasks_done}
        onChange={(v) => emit({ require_all_tasks_done: v })}
        tintColor={theme.tintColor}
        borderColor={theme.borderColor}
        textColor={theme.textColor}
      />
      <MiniToggle
        label="Exigir aprovação"
        value={!!parsed.require_approval}
        onChange={(v) => emit({ require_approval: v })}
        tintColor={theme.tintColor}
        borderColor={theme.borderColor}
        textColor={theme.textColor}
      />

      <SectionLabel
        label="Condições personalizadas"
        hint="Regras extras baseadas em campos"
        mutedColor={theme.mutedColor}
      />
      {conditions.map((c, i) => (
        <View key={i} style={[st.row, { borderColor: theme.borderColor }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <MiniInput
              value={c.field}
              onChangeText={(v) => updateCondition(i, { field: v })}
              placeholder="Campo (ex: status)"
              {...theme}
            />
            <View style={st.pillRow}>
              {CONDITION_OPERATORS.map((op) => (
                <OptionPill
                  key={op.value}
                  label={op.label}
                  selected={c.operator === op.value}
                  onPress={() => updateCondition(i, { operator: op.value })}
                  {...theme}
                />
              ))}
            </View>
            <MiniInput
              value={c.value}
              onChangeText={(v) => updateCondition(i, { value: v })}
              placeholder="Valor"
              {...theme}
            />
          </View>
          <RemoveButton
            onPress={() => {
              const updated = conditions.filter((_, j) => j !== i);
              emit({ custom_conditions: updated.length ? updated : undefined });
            }}
            mutedColor={theme.mutedColor}
          />
        </View>
      ))}
      <AddButton
        label="Condição"
        onPress={() =>
          emit({
            custom_conditions: [
              ...conditions,
              { field: "", operator: "equals", value: "" },
            ],
          })
        }
        tintColor={theme.tintColor}
      />
    </View>
  );
}

/* ================================================================== */
/*  2. FormSchemaBuilder (step_form form_schema_json)                  */
/* ================================================================== */

const FORM_FIELD_TYPES = [
  { label: "Texto", value: "text" },
  { label: "Texto longo", value: "multiline" },
  { label: "Número", value: "number" },
  { label: "Seleção", value: "select" },
  { label: "Sim/Não", value: "boolean" },
  { label: "Data", value: "date" },
  { label: "Moeda", value: "currency" },
  { label: "E-mail", value: "email" },
  { label: "Telefone", value: "phone" },
] as const;

interface FormField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

export function FormSchemaBuilder({
  value,
  onChange,
  ...theme
}: { value: string; onChange: (v: string) => void } & ThemeProps) {
  const fields = useMemo<FormField[]>(() => {
    const obj = safeJsonParse(value);
    if (!obj || !Array.isArray((obj as any).fields)) return [];
    return ((obj as any).fields as FormField[]).map((f) => ({
      key: f.key ?? "",
      label: f.label ?? "",
      type: f.type ?? "text",
      required: !!f.required,
      options: Array.isArray(f.options) ? f.options : undefined,
    }));
  }, [value]);

  const emit = useCallback(
    (updated: FormField[]) => {
      if (!updated.length) {
        onChange("");
        return;
      }
      onChange(JSON.stringify({ fields: updated }, null, 2));
    },
    [onChange],
  );

  const updateField = useCallback(
    (idx: number, patch: Partial<FormField>) => {
      const updated = [...fields];
      updated[idx] = { ...updated[idx], ...patch };
      emit(updated);
    },
    [fields, emit],
  );

  const moveField = useCallback(
    (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= fields.length) return;
      const updated = [...fields];
      [updated[idx], updated[target]] = [updated[target], updated[idx]];
      emit(updated);
    },
    [fields, emit],
  );

  return (
    <View
      style={[
        st.container,
        { borderColor: theme.borderColor, backgroundColor: theme.bgColor },
      ]}
    >
      {fields.map((f, i) => (
        <View
          key={i}
          style={[
            st.fieldCard,
            {
              borderColor: theme.borderColor,
              backgroundColor: theme.inputBgColor,
            },
          ]}
        >
          <View style={st.fieldCardHeader}>
            <Text style={[st.fieldNum, { color: theme.tintColor }]}>
              #{i + 1}
            </Text>
            <View style={st.fieldCardActions}>
              {i > 0 && (
                <TouchableOpacity
                  onPress={() => moveField(i, -1)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="arrow-up"
                    size={18}
                    color={theme.mutedColor}
                  />
                </TouchableOpacity>
              )}
              {i < fields.length - 1 && (
                <TouchableOpacity
                  onPress={() => moveField(i, 1)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="arrow-down"
                    size={18}
                    color={theme.mutedColor}
                  />
                </TouchableOpacity>
              )}
              <RemoveButton
                onPress={() => emit(fields.filter((_, j) => j !== i))}
                mutedColor={theme.mutedColor}
              />
            </View>
          </View>

          <View style={st.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={[st.miniLabel, { color: theme.mutedColor }]}>
                Chave
              </Text>
              <MiniInput
                value={f.key}
                onChangeText={(v) => updateField(i, { key: v })}
                placeholder="nome_campo"
                {...theme}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.miniLabel, { color: theme.mutedColor }]}>
                Rótulo
              </Text>
              <MiniInput
                value={f.label}
                onChangeText={(v) => updateField(i, { label: v })}
                placeholder="Nome do Campo"
                {...theme}
              />
            </View>
          </View>

          <Text style={[st.miniLabel, { color: theme.mutedColor }]}>Tipo</Text>
          <View style={st.pillRow}>
            {FORM_FIELD_TYPES.map((ft) => (
              <OptionPill
                key={ft.value}
                label={ft.label}
                selected={f.type === ft.value}
                onPress={() => updateField(i, { type: ft.value })}
                {...theme}
              />
            ))}
          </View>

          <MiniToggle
            label="Obrigatório"
            value={!!f.required}
            onChange={(v) => updateField(i, { required: v })}
            tintColor={theme.tintColor}
            borderColor={theme.borderColor}
            textColor={theme.textColor}
          />

          {f.type === "select" && (
            <>
              <Text style={[st.miniLabel, { color: theme.mutedColor }]}>
                Opções (separadas por vírgula)
              </Text>
              <MiniInput
                value={(f.options ?? []).join(", ")}
                onChangeText={(v) =>
                  updateField(i, {
                    options: v
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Opção 1, Opção 2, Opção 3"
                {...theme}
              />
            </>
          )}
        </View>
      ))}
      <AddButton
        label="Campo"
        onPress={() =>
          emit([
            ...fields,
            { key: "", label: "", type: "text", required: false },
          ])
        }
        tintColor={theme.tintColor}
      />
    </View>
  );
}

/* ================================================================== */
/*  3. ValidationRulesBuilder (step_form validation_rules_json)       */
/* ================================================================== */

interface ValidationData {
  min_fields_required?: number;
  require_all_required_fields?: boolean;
  custom_message?: string;
}

export function ValidationRulesBuilder({
  value,
  onChange,
  ...theme
}: { value: string; onChange: (v: string) => void } & ThemeProps) {
  const parsed = useMemo<ValidationData>(() => {
    const obj = safeJsonParse(value);
    if (!obj) return {};
    return {
      min_fields_required:
        typeof obj.min_fields_required === "number"
          ? obj.min_fields_required
          : undefined,
      require_all_required_fields: obj.require_all_required_fields as
        | boolean
        | undefined,
      custom_message:
        typeof obj.custom_message === "string" ? obj.custom_message : undefined,
    };
  }, [value]);

  const emit = useCallback(
    (patch: Partial<ValidationData>) => {
      const next = { ...parsed, ...patch };
      if (next.min_fields_required == null || next.min_fields_required <= 0)
        delete next.min_fields_required;
      if (!next.require_all_required_fields)
        delete next.require_all_required_fields;
      if (!next.custom_message?.trim()) delete next.custom_message;
      const keys = Object.keys(next);
      onChange(keys.length ? JSON.stringify(next, null, 2) : "");
    },
    [parsed, onChange],
  );

  return (
    <View
      style={[
        st.container,
        { borderColor: theme.borderColor, backgroundColor: theme.bgColor },
      ]}
    >
      <MiniToggle
        label="Exigir todos os campos obrigatórios"
        value={!!parsed.require_all_required_fields}
        onChange={(v) => emit({ require_all_required_fields: v })}
        tintColor={theme.tintColor}
        borderColor={theme.borderColor}
        textColor={theme.textColor}
      />

      <SectionLabel
        label="Mínimo de campos preenchidos"
        mutedColor={theme.mutedColor}
      />
      <MiniInput
        value={
          parsed.min_fields_required != null
            ? String(parsed.min_fields_required)
            : ""
        }
        onChangeText={(v) =>
          emit({
            min_fields_required: v ? parseInt(v, 10) || undefined : undefined,
          })
        }
        placeholder="0"
        keyboardType="numeric"
        {...theme}
      />

      <SectionLabel
        label="Mensagem de erro personalizada"
        mutedColor={theme.mutedColor}
      />
      <MiniInput
        value={parsed.custom_message ?? ""}
        onChangeText={(v) => emit({ custom_message: v || undefined })}
        placeholder="Ex: Preencha todos os campos antes de continuar"
        multiline
        {...theme}
      />
    </View>
  );
}

/* ================================================================== */
/*  4. EscalationRuleBuilder (deadline escalation_rule_json)          */
/* ================================================================== */

const ESCALATION_ACTIONS = [
  { label: "Notificar gestor", value: "notify_manager" },
  { label: "Notificar admin", value: "notify_admin" },
  { label: "Reatribuir", value: "reassign" },
  { label: "Bloquear processo", value: "block_process" },
  { label: "Enviar notificação", value: "send_notification" },
] as const;

interface EscalationData {
  action?: string;
  notify_roles?: string;
  message?: string;
  auto_reassign_to_role?: string;
}

export function EscalationRuleBuilder({
  value,
  onChange,
  ...theme
}: { value: string; onChange: (v: string) => void } & ThemeProps) {
  const parsed = useMemo<EscalationData>(() => {
    const obj = safeJsonParse(value);
    if (!obj) return {};
    return {
      action: typeof obj.action === "string" ? obj.action : undefined,
      notify_roles:
        typeof obj.notify_roles === "string" ? obj.notify_roles : undefined,
      message: typeof obj.message === "string" ? obj.message : undefined,
      auto_reassign_to_role:
        typeof obj.auto_reassign_to_role === "string"
          ? obj.auto_reassign_to_role
          : undefined,
    };
  }, [value]);

  const emit = useCallback(
    (patch: Partial<EscalationData>) => {
      const next = { ...parsed, ...patch };
      if (!next.action) delete next.action;
      if (!next.notify_roles?.trim()) delete next.notify_roles;
      if (!next.message?.trim()) delete next.message;
      if (!next.auto_reassign_to_role?.trim())
        delete next.auto_reassign_to_role;
      const keys = Object.keys(next);
      onChange(keys.length ? JSON.stringify(next, null, 2) : "");
    },
    [parsed, onChange],
  );

  return (
    <View
      style={[
        st.container,
        { borderColor: theme.borderColor, backgroundColor: theme.bgColor },
      ]}
    >
      <SectionLabel
        label="Ação de escalação"
        hint="O que fazer quando o prazo for superado"
        mutedColor={theme.mutedColor}
      />
      <View style={st.pillRow}>
        {ESCALATION_ACTIONS.map((a) => (
          <OptionPill
            key={a.value}
            label={a.label}
            selected={parsed.action === a.value}
            onPress={() =>
              emit({ action: parsed.action === a.value ? undefined : a.value })
            }
            {...theme}
          />
        ))}
      </View>

      <SectionLabel
        label="Perfis a notificar"
        hint="Nomes de perfis separados por vírgula"
        mutedColor={theme.mutedColor}
      />
      <MiniInput
        value={parsed.notify_roles ?? ""}
        onChangeText={(v) => emit({ notify_roles: v || undefined })}
        placeholder="Ex: admin, gestor"
        {...theme}
      />

      <SectionLabel label="Mensagem" mutedColor={theme.mutedColor} />
      <MiniInput
        value={parsed.message ?? ""}
        onChangeText={(v) => emit({ message: v || undefined })}
        placeholder="Mensagem de escalação"
        multiline
        {...theme}
      />

      {parsed.action === "reassign" && (
        <>
          <SectionLabel
            label="Reatribuir para perfil"
            mutedColor={theme.mutedColor}
          />
          <MiniInput
            value={parsed.auto_reassign_to_role ?? ""}
            onChangeText={(v) =>
              emit({ auto_reassign_to_role: v || undefined })
            }
            placeholder="Ex: supervisor"
            {...theme}
          />
        </>
      )}
    </View>
  );
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const st = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 1,
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
    marginRight: 12,
  },
  toggleTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    gap: 8,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    marginTop: 4,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  removeBtn: {
    padding: 2,
  },
  fieldCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  fieldCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  fieldCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldNum: {
    fontSize: 13,
    fontWeight: "700",
  },
  fieldRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 3,
    marginTop: 4,
  },
});
