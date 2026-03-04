import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, TextInput, TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const STEP_COLOR_PRESETS = [
  { label: "Azul", value: "#3b82f6" },
  { label: "Roxo", value: "#8b5cf6" },
  { label: "Laranja", value: "#f59e0b" },
  { label: "Verde", value: "#10b981" },
  { label: "Vermelho", value: "#ef4444" },
  { label: "Índigo", value: "#6366f1" },
  { label: "Ciano", value: "#0ea5e9" },
  { label: "Rosa", value: "#ec4899" },
];

const DEFAULT_STEP_COLOR = STEP_COLOR_PRESETS[0].value;

const normalizeHexColor = (value: unknown): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash : null;
};

const listRows = async (templateId?: string): Promise<Row[]> => {
  const filters = templateId
    ? buildSearchParams([{ field: "template_id", value: templateId }], {
        sortColumn: "step_order ASC",
      })
    : { sort_column: "step_order ASC" };

  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "workflow_steps",
    ...filters,
    auto_exclude_deleted: true,
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "workflow_steps",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para atualizar");
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "workflow_steps",
    payload,
  });
  return response.data;
};

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) {
    throw new Error("Id obrigatorio para deletar");
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "delete",
    table: "workflow_steps",
    payload: {
      id: payload.id,
    },
  });
  return response.data;
};

export default function WorkflowStepsScreen() {
  const params = useLocalSearchParams<{
    templateId?: string;
    template_id?: string;
  }>();

  const templateId = useMemo(() => {
    const raw =
      (Array.isArray(params.templateId) ? params.templateId[0] : params.templateId) ??
      (Array.isArray(params.template_id) ? params.template_id[0] : params.template_id);
    return raw ? String(raw) : undefined;
  }, [params.templateId, params.template_id]);

  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const inputBg = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");

  const loadFilteredRows = useMemo(() => {
    return async (): Promise<Row[]> => {
      return listRows(templateId);
    };
  }, [templateId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      const resolvedTemplateId =
        templateId ?? (String(payload.template_id ?? "").trim() || undefined);
      if (!resolvedTemplateId) {
        throw new Error(
          "Template não informado. Abra esta tela a partir de um workflow template.",
        );
      }

      const resolvedColor = normalizeHexColor(payload.color) ?? DEFAULT_STEP_COLOR;
      return createRow({
        ...payload,
        template_id: resolvedTemplateId,
        color: resolvedColor,
      });
    };
  }, [templateId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      const resolvedColor = normalizeHexColor(payload.color) ?? DEFAULT_STEP_COLOR;
      return updateRow({
        ...payload,
        template_id: templateId ?? payload.template_id,
        color: resolvedColor,
      });
    };
  }, [templateId]);

  const fields: CrudFieldConfig<Row>[] = [
    { key: "id", label: "Id", placeholder: "Id", visibleInForm: false },
    {
      key: "template_id",
      label: "Template Id",
      placeholder: "Template Id",
      type: "reference",
      referenceTable: "workflow_templates",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      visibleInList: true,
      visibleInForm: !templateId,
    },
    {
      key: "name",
      label: "Name",
      placeholder: "Name",
      required: true,
      visibleInList: true,
    },
    {
      key: "step_order",
      label: "Step Order",
      placeholder: "Step Order",
      visibleInList: true,
    },
    {
      key: "is_terminal",
      label: "Terminal",
      type: "boolean" as const,
      visibleInList: true,
    },
    {
      key: "has_protocol",
      label: "Protocolo",
      type: "boolean" as const,
      visibleInList: true,
    },
    {
      key: "ocr_enabled",
      label: "OCR Habilitado",
      type: "boolean" as const,
    },
    {
      key: "color",
      label: "Cor",
      placeholder: "Selecione uma cor",
    },
    {
      key: "created_at",
      label: "Criado em",
      placeholder: "Created At",
      visibleInForm: false,
    },
  ];

  const renderColorField = useCallback(
    (
      field: CrudFieldConfig<Row>,
      value: string,
      onChange: (nextValue: string) => void,
    ) => {
      if (field.key !== "color") return null;
      const selectedColor = normalizeHexColor(value) ?? DEFAULT_STEP_COLOR;

      return (
        <View>
          <View style={s.colorGrid}>
            {STEP_COLOR_PRESETS.map((preset) => {
              const selected = selectedColor.toLowerCase() === preset.value.toLowerCase();
              return (
                <TouchableOpacity
                  key={preset.value}
                  onPress={() => onChange(preset.value)}
                  style={[
                    s.colorSwatch,
                    {
                      backgroundColor: preset.value,
                      borderColor: selected ? tintColor : borderColor,
                    },
                    selected && s.colorSwatchSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Cor ${preset.label}`}
                >
                  {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder="#3b82f6"
            placeholderTextColor={mutedColor}
            style={[
              s.colorInput,
              { borderColor, backgroundColor: inputBg, color: textColor },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      );
    },
    [borderColor, inputBg, mutedColor, textColor, tintColor],
  );

  return (
    <CrudScreen<Row>
      tableName="workflow_steps"
      title="Workflow Steps"
      subtitle="Gestao de steps do workflow"
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createWithContext}
      updateItem={updateWithContext}
      deleteItem={deleteRow}
      renderCustomField={renderColorField}
      getDetails={(item) => [
        { label: "Template", value: String(item.template_id ?? "-") },
        { label: "Nome", value: String(item.name ?? "-") },
        { label: "Ordem", value: String(item.step_order ?? "-") },
        { label: "Terminal", value: item.is_terminal ? "Sim" : "Não" },
        { label: "Protocolo", value: item.has_protocol ? "Sim" : "Não" },
        { label: "OCR", value: item.ocr_enabled ? "Sim" : "Não" },
      ]}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name ?? "Workflow Step")}
    />
  );
}

const s = StyleSheet.create({
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchSelected: {
    transform: [{ scale: 1.05 }],
  },
  colorInput: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
  },
});
