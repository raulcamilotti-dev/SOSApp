import { styles } from "@/app/theme/styles";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export type CrudFieldType = "text" | "multiline" | "json";

export type CrudFieldConfig<T> = {
  key: keyof T & string;
  label: string;
  placeholder?: string;
  type?: CrudFieldType;
  required?: boolean;
  visibleInList?: boolean;
  visibleInForm?: boolean;
  readOnly?: boolean;
};

type DetailItem = { label: string; value: string };

type Props<T> = {
  title: string;
  subtitle?: string;
  fields: CrudFieldConfig<T>[];
  loadItems: () => Promise<T[]>;
  createItem: (payload: Partial<T>) => Promise<unknown>;
  updateItem: (
    payload: Partial<T> & { id?: string | null },
  ) => Promise<unknown>;
  getId: (item: T) => string;
  getTitle: (item: T) => string;
  getDetails?: (item: T) => DetailItem[];
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export function CrudScreen<T extends Record<string, unknown>>({
  title,
  subtitle,
  fields,
  loadItems,
  createItem,
  updateItem,
  getId,
  getTitle,
  getDetails,
}: Props<T>) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<T[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const isFocused = useIsFocused();

  const formFields = useMemo(
    () => fields.filter((field) => field.visibleInForm !== false),
    [fields],
  );

  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");
  const inputBackground = useThemeColor({}, "input");
  const onTintTextColor = useThemeColor({}, "background");
  const modalBackdrop = "rgba(0, 0, 0, 0.55)";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await loadItems();
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setError("Falha ao carregar dados");
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadItems]);

  useEffect(() => {
    if (isFocused) {
      load();
    }
  }, [isFocused, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const resetForm = useCallback(() => {
    const nextState: Record<string, string> = {};
    formFields.forEach((field) => {
      nextState[field.key] = "";
    });
    setFormState(nextState);
    setFormError(null);
    setEditingId(null);
  }, [formFields]);

  const openCreate = useCallback(() => {
    setModalMode("create");
    resetForm();
    setModalOpen(true);
  }, [resetForm]);

  const openEdit = useCallback(
    (item: T) => {
      const nextState: Record<string, string> = {};
      formFields.forEach((field) => {
        const value = item[field.key];
        if (field.type === "json") {
          nextState[field.key] = value ? JSON.stringify(value, null, 2) : "";
        } else {
          nextState[field.key] = value ? String(value) : "";
        }
      });
      setFormState(nextState);
      setFormError(null);
      setModalMode("edit");
      setEditingId(getId(item));
      setModalOpen(true);
    },
    [formFields, getId],
  );

  const handleSave = useCallback(async () => {
    const payload: Record<string, unknown> = {};
    for (const field of formFields) {
      if (field.readOnly) {
        continue;
      }
      const rawValue = formState[field.key] ?? "";
      if (field.required && !rawValue.trim()) {
        setFormError(`Informe ${field.label.toLowerCase()}.`);
        return;
      }
      if (field.type === "json" && rawValue.trim()) {
        try {
          payload[field.key] = JSON.parse(rawValue);
        } catch {
          setFormError(`Configuração inválida em ${field.label}.`);
          return;
        }
      } else {
        payload[field.key] = rawValue.trim() || undefined;
      }
    }

    if (modalMode === "edit" && !editingId) {
      setFormError("Registro inválido para edição.");
      return;
    }

    try {
      setSaving(true);
      setFormError(null);
      if (modalMode === "create") {
        await createItem(payload as Partial<T>);
      } else {
        await updateItem({
          ...payload,
          id: editingId,
        } as unknown as Partial<T> & { id?: string | null });
      }
      setModalOpen(false);
      resetForm();
      load();
    } catch {
      setFormError("Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }, [
    formFields,
    formState,
    modalMode,
    createItem,
    updateItem,
    editingId,
    load,
    resetForm,
  ]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => getTitle(a).localeCompare(getTitle(b)));
  }, [items, getTitle]);

  if (loading) {
    return (
      <ThemedView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando...</ThemedText>
      </ThemedView>
    );
  }

  const detailsFromFields = (item: T): DetailItem[] =>
    fields
      .filter((field) => field.visibleInList)
      .map((field) => ({
        label: field.label,
        value: formatValue(item[field.key]),
      }));

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <ThemedView style={styles.processCard}>
        <ThemedText style={[styles.processTitle, { color: textColor }]}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText
            style={[styles.processSubtitle, { color: mutedTextColor }]}
          >
            {subtitle}
          </ThemedText>
        ) : null}
        <TouchableOpacity
          onPress={openCreate}
          style={{
            marginTop: 12,
            paddingVertical: 10,
            paddingHorizontal: 12,
            backgroundColor: tintColor,
            borderRadius: 6,
            alignItems: "center",
          }}
        >
          <ThemedText style={{ color: onTintTextColor, fontWeight: "600" }}>
            Adicionar
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {error ? (
        <ThemedText style={{ color: tintColor, marginTop: 12 }}>
          {error}
        </ThemedText>
      ) : null}

      {sortedItems.length === 0 && !error ? (
        <ThemedText style={{ color: mutedTextColor, marginTop: 12 }}>
          Nenhum registro encontrado.
        </ThemedText>
      ) : null}

      {sortedItems.map((item) => {
        const details = getDetails ? getDetails(item) : detailsFromFields(item);
        return (
          <ThemedView
            key={getId(item)}
            style={[
              styles.processCard,
              {
                marginTop: 12,
                borderColor: borderColor,
                backgroundColor: cardColor,
              },
            ]}
          >
            <ThemedText
              style={{ fontSize: 16, fontWeight: "600", color: textColor }}
            >
              {getTitle(item)}
            </ThemedText>
            <TouchableOpacity
              onPress={() => openEdit(item)}
              style={{ marginTop: 8 }}
            >
              <ThemedText style={{ color: tintColor, fontWeight: "600" }}>
                Editar
              </ThemedText>
            </TouchableOpacity>
            <View style={{ marginTop: 6, gap: 4 }}>
              {details.map((detail) => (
                <ThemedText
                  key={`${getId(item)}-${detail.label}`}
                  style={{ fontSize: 12, color: mutedTextColor }}
                >
                  {detail.label}: {detail.value || "-"}
                </ThemedText>
              ))}
            </View>
          </ThemedView>
        );
      })}

      <Modal
        transparent
        visible={modalOpen}
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: modalBackdrop,
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 12,
              padding: 16,
              maxHeight: "90%",
            }}
          >
            <ThemedText style={[styles.processTitle, { color: textColor }]}>
              {modalMode === "create" ? "Novo" : "Editar"}
            </ThemedText>

            <ScrollView
              style={{ marginTop: 12 }}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {formFields.map((field) => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    {field.label}
                  </ThemedText>
                  <TextInput
                    value={formState[field.key] ?? ""}
                    onChangeText={(text) =>
                      setFormState((prev) => ({ ...prev, [field.key]: text }))
                    }
                    placeholder={field.placeholder ?? field.label}
                    placeholderTextColor={mutedTextColor}
                    multiline={
                      field.type === "multiline" || field.type === "json"
                    }
                    editable={!field.readOnly}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      minHeight:
                        field.type === "multiline" || field.type === "json"
                          ? 90
                          : undefined,
                      backgroundColor: inputBackground,
                      color: textColor,
                      marginTop: 6,
                      textAlignVertical:
                        field.type === "multiline" || field.type === "json"
                          ? "top"
                          : "auto",
                    }}
                  />
                </View>
              ))}
            </ScrollView>

            {formError ? (
              <ThemedText style={{ color: tintColor, marginTop: 8 }}>
                {formError}
              </ThemedText>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 12,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: cardColor,
                }}
              >
                <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  backgroundColor: saving ? mutedTextColor : tintColor,
                }}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "700" }}
                >
                  {saving ? "Salvando..." : "Salvar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
