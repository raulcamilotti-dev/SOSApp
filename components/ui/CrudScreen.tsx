import { styles } from "@/app/theme/styles";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { getTableInfo, type TableInfoRow } from "@/services/schema";
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

export type CrudFieldType = "text" | "multiline" | "json" | "reference";

export type CrudFieldConfig<T> = {
  key: keyof T & string;
  label: string;
  placeholder?: string;
  type?: CrudFieldType;
  required?: boolean;
  visibleInList?: boolean;
  visibleInForm?: boolean;
  readOnly?: boolean;
  referenceTable?: string;
  referenceLabelField?: string;
  referenceIdField?: string;
  referenceSearchField?: string;
  resolveReferenceLabelInList?: boolean;
};

type DetailItem = { label: string; value: string };
type ReferenceOption = { id: string; label: string; raw: any };
type QuickCreateReturnTarget =
  | { scope: "form"; fieldKey: string }
  | { scope: "quick"; fieldKey: string };
type QuickCreateSnapshot = {
  field: CrudFieldConfig<any>;
  fields: CrudFieldConfig<any>[];
  loading: boolean;
  state: Record<string, string>;
  referenceLabels: Record<string, string>;
  returnTarget: QuickCreateReturnTarget;
};

const REFERENCE_ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

type Props<T> = {
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  searchFields?: string[];
  fields: CrudFieldConfig<T>[];
  loadItems: () => Promise<T[]>;
  createItem: (payload: Partial<T>) => Promise<unknown>;
  updateItem: (
    payload: Partial<T> & { id?: string | null },
  ) => Promise<unknown>;
  deleteItem?: (
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

const SYSTEM_COLUMNS = new Set([
  "id",
  "created_at",
  "updated_at",
  "deleted_at",
]);

const humanizeLabel = (column: string) =>
  column
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatRecordDetails = (record: any) => {
  if (!record || typeof record !== "object") {
    return [] as { key: string; value: string }[];
  }
  return Object.keys(record)
    .filter((key) => !SYSTEM_COLUMNS.has(key))
    .map((key) => ({ key, value: formatValue(record[key]) }));
};

const formatItemSummary = (item: Record<string, unknown>) => {
  if (!item) return "";
  const keys = Object.keys(item)
    .filter((key) =>
      ["name", "title", "description", "fullname", "company_name"].includes(
        key,
      ),
    )
    .slice(0, 3);
  if (!keys.length) return "";
  return keys.map((key) => String(item[key] ?? "")).join(" · ");
};

const deriveReferenceLabel = (
  item: any,
  explicitLabelField?: string,
): string => {
  if (!item || typeof item !== "object") return "";
  const explicit = explicitLabelField
    ? String(item?.[explicitLabelField] ?? "")
    : "";
  if (explicit.trim()) return explicit.trim();

  const summary = formatItemSummary(item as Record<string, unknown>).trim();
  if (summary) return summary;

  // Fallback: first non-system string-ish field
  const firstKey = Object.keys(item).find(
    (key) => !SYSTEM_COLUMNS.has(key) && item?.[key] != null,
  );
  return firstKey ? String(item[firstKey] ?? "").trim() : "";
};

const convertTableInfoToFields = (
  tableInfo: TableInfoRow[],
): CrudFieldConfig<any>[] => {
  return tableInfo
    .filter((column) => !SYSTEM_COLUMNS.has(column.column_name))
    .map((column) => {
      let type: CrudFieldType = "text";
      let referenceTable: string | undefined;
      let referenceLabelField: string | undefined;

      if (column.referenced_table_name) {
        type = "reference";
        referenceTable = column.referenced_table_name;
        if (referenceTable === "tenants") {
          referenceLabelField = "company_name";
        } else if (referenceTable === "users") {
          referenceLabelField = "fullname";
        } else {
          referenceLabelField = "name";
        }
      } else if (
        column.data_type === "text" ||
        column.data_type === "json" ||
        column.data_type === "jsonb" ||
        column.data_type === "character varying"
      ) {
        type = column.data_type === "jsonb" ? "json" : "multiline";
      }

      return {
        key: column.column_name,
        label: humanizeLabel(column.column_name),
        type,
        placeholder: humanizeLabel(column.column_name),
        required: column.is_nullable === "NO" && !column.column_default,
        visibleInForm: true,
        referenceTable,
        referenceLabelField,
        referenceIdField: column.referenced_column_name ?? "id",
        referenceSearchField: column.referenced_column_name ?? "id",
      } satisfies CrudFieldConfig<any>;
    });
};

const buildCacheKey = (table: string | undefined, id: string) =>
  table ? `${table}:${id}` : id;

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
  const [referenceModalField, setReferenceModalField] =
    useState<CrudFieldConfig<any> | null>(null);
  const [referenceOptions, setReferenceOptions] = useState<ReferenceOption[]>(
    [],
  );
  const [referenceSearch, setReferenceSearch] = useState("");
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceLabels, setReferenceLabels] = useState<
    Record<string, string>
  >({});

  // Contador de nível de profundidade para z-index dinâmico
  const [modalDepth, setModalDepth] = useState(0);
  const [referenceCache, setReferenceCache] = useState<Record<string, string>>(
    {},
  );
  const [referenceModalContext, setReferenceModalContext] = useState<
    "form" | "quick"
  >("form");
  const [activeQuickFieldKey, setActiveQuickFieldKey] = useState<string | null>(
    null,
  );
  const [quickCreateModalOpen, setQuickCreateModalOpen] = useState(false);
  const [quickCreateField, setQuickCreateField] =
    useState<CrudFieldConfig<any> | null>(null);
  const [quickCreateFields, setQuickCreateFields] = useState<
    CrudFieldConfig<any>[]
  >([]);
  const [quickCreateFieldsLoading, setQuickCreateFieldsLoading] =
    useState(false);
  const [quickCreateState, setQuickCreateState] = useState<
    Record<string, string>
  >({});
  const [quickCreateReferenceLabels, setQuickCreateReferenceLabels] = useState<
    Record<string, string>
  >({});
  const [quickCreateSaving, setQuickCreateSaving] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [quickCreateReturnTarget, setQuickCreateReturnTarget] =
    useState<QuickCreateReturnTarget | null>(null);
  const [quickCreateStack, setQuickCreateStack] = useState<
    QuickCreateSnapshot[]
  >([]);
  const [referenceDetailModalOpen, setReferenceDetailModalOpen] =
    useState(false);
  const [referenceDetailData, setReferenceDetailData] = useState<any>(null);
  const [referenceDetailLoading, setReferenceDetailLoading] = useState(false);
  const [referenceDetailError, setReferenceDetailError] = useState<
    string | null
  >(null);

  const isFocused = useIsFocused();

  const formFields = useMemo(
    () =>
      fields.filter(
        (field) => field.visibleInForm !== false && field.key !== "id",
      ),
    [fields],
  );
  const formFieldKeys = useMemo(
    () => new Set(formFields.map((field) => field.key)),
    [formFields],
  );

  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");
  const tintColor = useThemeColor({}, "tint");
  const inputBackground = useThemeColor({}, "input");
  const onTintTextColor = useThemeColor({}, "background");
  const modalBackdrop = "rgba(0, 0, 0, 0.55)";

  const fetchReferenceLabel = useCallback(
    async (field: CrudFieldConfig<any>, id: string) => {
      if (!field.referenceTable) {
        return "";
      }
      const cacheKey = buildCacheKey(field.referenceTable, id);
      if (referenceCache[cacheKey]) {
        return referenceCache[cacheKey];
      }
      try {
        const response = await api.post(REFERENCE_ENDPOINT, {
          action: "list",
          table: field.referenceTable,
          search: id,
          search_field: field.referenceIdField ?? "id",
        });
        const data = response.data;
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        const first = Array.isArray(list) && list.length > 0 ? list[0] : null;
        const label = deriveReferenceLabel(first, field.referenceLabelField);
        if (label) {
          setReferenceCache((prev) => ({ ...prev, [cacheKey]: label }));
        }
        return label;
      } catch {
        return "";
      }
    },
    [referenceCache],
  );

  const getCachedReferenceLabel = useCallback(
    (field: CrudFieldConfig<any>, value: unknown) => {
      if (!value) return "";
      const id = String(value);
      const cacheKey = buildCacheKey(field.referenceTable, id);
      return referenceCache[cacheKey] ?? "";
    },
    [referenceCache],
  );

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

  useEffect(() => {
    if (!items.length) return;
    const referenceFields = fields.filter(
      (field) => field.type === "reference" && field.referenceTable,
    );
    referenceFields.forEach((field) => {
      items.forEach((item) => {
        const value = item[field.key];
        if (value) {
          fetchReferenceLabel(field, String(value));
        }
      });
    });
  }, [items, fields, fetchReferenceLabel]);

  useEffect(() => {
    if (!modalOpen) return;
    const referenceFields = formFields.filter(
      (field) => field.type === "reference" && field.referenceTable,
    );
    referenceFields.forEach((field) => {
      const value = formState[field.key];
      if (!value) return;
      fetchReferenceLabel(field, String(value)).then((label) => {
        setReferenceLabels((prev) => {
          if (!label || prev[field.key] === label) return prev;
          return { ...prev, [field.key]: label };
        });
      });
    });
  }, [fetchReferenceLabel, formFields, formState, modalOpen]);

  useEffect(() => {
    if (!quickCreateModalOpen) return;
    const referenceFields = quickCreateFields.filter(
      (field) => field.type === "reference" && field.referenceTable,
    );
    referenceFields.forEach((field) => {
      const value = quickCreateState[field.key];
      if (!value) return;
      fetchReferenceLabel(field, String(value)).then((label) => {
        setQuickCreateReferenceLabels((prev) => {
          if (!label || prev[field.key] === label) return prev;
          return { ...prev, [field.key]: label };
        });
      });
    });
  }, [
    fetchReferenceLabel,
    quickCreateFields,
    quickCreateModalOpen,
    quickCreateState,
  ]);

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
    setReferenceLabels({});
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
      const nextLabels: Record<string, string> = {};
      formFields.forEach((field) => {
        const value = item[field.key];
        if (field.type === "json") {
          nextState[field.key] = value ? JSON.stringify(value, null, 2) : "";
        } else if (field.type === "reference") {
          nextState[field.key] = value ? String(value) : "";
          const label = value ? getCachedReferenceLabel(field, value) : "";
          nextLabels[field.key] = label;
        } else {
          nextState[field.key] = value ? String(value) : "";
        }
      });
      setFormState(nextState);
      setReferenceLabels(nextLabels);
      setFormError(null);
      setModalMode("edit");
      setEditingId(getId(item));
      setModalOpen(true);
    },
    [formFields, getCachedReferenceLabel, getId],
  );
  const loadReferenceOptions = useCallback(
    async (field: CrudFieldConfig<any>, searchValue: string) => {
      if (!field.referenceTable) {
        setReferenceError("Configuração de referência inválida.");
        setReferenceOptions([]);
        return;
      }

      setReferenceLoading(true);
      setReferenceError(null);

      try {
        const searchField = field.referenceSearchField;
        const response = await api.post(REFERENCE_ENDPOINT, {
          action: "list",
          table: field.referenceTable,
          search: searchValue || undefined,
          search_field: searchField || undefined,
        });
        const data = response.data;
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        const idField = field.referenceIdField ?? "id";
        const options = Array.isArray(list)
          ? list
              .map((item) => ({
                id: String(item?.[idField] ?? item?.id ?? ""),
                label: deriveReferenceLabel(item, field.referenceLabelField),
                raw: item,
              }))
              .filter((opt) => opt.id)
          : [];
        setReferenceOptions(options);
      } catch {
        setReferenceError("Falha ao carregar dados.");
        setReferenceOptions([]);
      } finally {
        setReferenceLoading(false);
      }
    },
    [],
  );

  const openReferenceModal = useCallback(
    (field: CrudFieldConfig<any>, context: "form" | "quick") => {
      setReferenceModalContext(context);
      setActiveQuickFieldKey(context === "quick" ? field.key : null);
      setReferenceModalField(field);
      setReferenceSearch("");
      setReferenceOptions([]);
      setReferenceError(null);
      setModalDepth((prev) => prev + 1); // Incrementar profundidade
      loadReferenceOptions(field, "");
    },
    [loadReferenceOptions],
  );

  const openQuickCreate = useCallback(
    async (field: CrudFieldConfig<any>) => {
      if (!field.referenceTable) {
        setReferenceError("Configuração de referência inválida.");
        return;
      }

      const nextReturnTarget: QuickCreateReturnTarget | null =
        referenceModalContext === "form"
          ? { scope: "form", fieldKey: field.key }
          : activeQuickFieldKey
            ? { scope: "quick", fieldKey: activeQuickFieldKey }
            : null;

      if (!nextReturnTarget) {
        setReferenceError("Contexto de criação inválido.");
        return;
      }

      if (quickCreateModalOpen && quickCreateField && quickCreateReturnTarget) {
        setQuickCreateStack((prev) => [
          ...prev,
          {
            field: quickCreateField,
            fields: quickCreateFields,
            loading: quickCreateFieldsLoading,
            state: quickCreateState,
            referenceLabels: quickCreateReferenceLabels,
            returnTarget: quickCreateReturnTarget,
          },
        ]);
      }

      setReferenceModalField(null);
      setModalDepth((prev) => Math.max(0, prev - 1));

      setQuickCreateModalOpen(true);
      setQuickCreateField(field);
      setQuickCreateReturnTarget(nextReturnTarget);
      setQuickCreateFields([]);
      setQuickCreateFieldsLoading(true);
      setQuickCreateState({});
      setQuickCreateReferenceLabels({});
      setQuickCreateError(null);

      try {
        const info = await getTableInfo(field.referenceTable);
        const nextFields = convertTableInfoToFields(info);
        setQuickCreateFields(nextFields);
        const nextState: Record<string, string> = {};
        nextFields.forEach((f) => {
          nextState[f.key] = "";
        });
        setQuickCreateState(nextState);
      } catch {
        setQuickCreateError("Não foi possível carregar campos.");
        setQuickCreateFields([]);
      } finally {
        setQuickCreateFieldsLoading(false);
      }
    },
    [
      activeQuickFieldKey,
      quickCreateField,
      quickCreateFields,
      quickCreateFieldsLoading,
      quickCreateModalOpen,
      quickCreateReferenceLabels,
      quickCreateReturnTarget,
      quickCreateState,
      referenceModalContext,
    ],
  );

  const closeQuickCreate = useCallback(() => {
    if (quickCreateStack.length > 0) {
      const snapshot = quickCreateStack[quickCreateStack.length - 1];
      setQuickCreateStack((prev) => prev.slice(0, -1));
      setQuickCreateField(snapshot.field);
      setQuickCreateFields(snapshot.fields);
      setQuickCreateFieldsLoading(snapshot.loading);
      setQuickCreateState(snapshot.state);
      setQuickCreateReferenceLabels(snapshot.referenceLabels);
      setQuickCreateReturnTarget(snapshot.returnTarget);
      setQuickCreateError(null);
      return;
    }

    setQuickCreateModalOpen(false);
    setQuickCreateField(null);
    setQuickCreateFields([]);
    setQuickCreateFieldsLoading(false);
    setQuickCreateState({});
    setQuickCreateReferenceLabels({});
    setQuickCreateError(null);
    setQuickCreateReturnTarget(null);
  }, [quickCreateStack]);

  const handleQuickCreateSave = useCallback(async () => {
    if (!quickCreateField?.referenceTable || !quickCreateReturnTarget) {
      setQuickCreateError("Registro inválido.");
      return;
    }

    const payload: Record<string, unknown> = {};
    for (const field of quickCreateFields) {
      if (field.readOnly) continue;
      const rawValue = quickCreateState[field.key] ?? "";
      const trimmedValue = rawValue.trim();
      if (field.required && !trimmedValue) {
        setQuickCreateError(`Informe ${field.label.toLowerCase()}.`);
        return;
      }
      if (field.type === "json") {
        if (!trimmedValue) {
          payload[field.key] = null;
          continue;
        }
        try {
          payload[field.key] = JSON.parse(rawValue);
        } catch {
          setQuickCreateError(`Configuração inválida em ${field.label}.`);
          return;
        }
      } else {
        payload[field.key] = trimmedValue ? trimmedValue : null;
      }
    }

    try {
      setQuickCreateSaving(true);
      setQuickCreateError(null);
      const response = await api.post(REFERENCE_ENDPOINT, {
        action: "create",
        table: quickCreateField.referenceTable,
        payload,
      });
      const data = response.data;
      const base = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data);
      const createdId = String(base?.id ?? "");
      const createdLabel = quickCreateField.referenceLabelField
        ? String(base?.[quickCreateField.referenceLabelField] ?? "")
        : formatItemSummary(base as Record<string, unknown>);
      const finalLabel = createdLabel || createdId || "(novo)";

      if (createdId) {
        const cacheKey = buildCacheKey(
          quickCreateField.referenceTable,
          createdId,
        );
        setReferenceCache((prev) => ({ ...prev, [cacheKey]: finalLabel }));
      }

      if (quickCreateStack.length > 0) {
        const snapshot = quickCreateStack[quickCreateStack.length - 1];
        setQuickCreateStack((prev) => prev.slice(0, -1));
        setQuickCreateField(snapshot.field);
        setQuickCreateFields(snapshot.fields);
        setQuickCreateFieldsLoading(snapshot.loading);
        setQuickCreateReturnTarget(snapshot.returnTarget);
        setQuickCreateState((prev) => {
          const next = { ...snapshot.state };
          next[quickCreateReturnTarget.fieldKey] = createdId;
          return next;
        });
        setQuickCreateReferenceLabels((prev) => {
          const next = { ...snapshot.referenceLabels };
          next[quickCreateReturnTarget.fieldKey] = finalLabel;
          return next;
        });
        setQuickCreateError(null);
      } else {
        if (quickCreateReturnTarget.scope === "form") {
          setFormState((prev) => ({
            ...prev,
            [quickCreateReturnTarget.fieldKey]: createdId,
          }));
          setReferenceLabels((prev) => ({
            ...prev,
            [quickCreateReturnTarget.fieldKey]: finalLabel,
          }));
        }
        closeQuickCreate();
      }
    } catch {
      setQuickCreateError("Não foi possível salvar.");
    } finally {
      setQuickCreateSaving(false);
    }
  }, [
    closeQuickCreate,
    quickCreateField,
    quickCreateFields,
    quickCreateReturnTarget,
    quickCreateStack,
    quickCreateState,
  ]);

  const handleSave = useCallback(async () => {
    const payloadFields = modalMode === "create" ? fields : formFields;
    const payload: Record<string, unknown> = {};
    for (const field of payloadFields) {
      if (field.readOnly) {
        continue;
      }
      const rawValue = formState[field.key] ?? "";
      const trimmedValue = rawValue.trim();
      if (formFieldKeys.has(field.key) && field.required && !trimmedValue) {
        setFormError(`Informe ${field.label.toLowerCase()}.`);
        return;
      }
      if (field.type === "json") {
        if (!trimmedValue) {
          payload[field.key] = null;
          continue;
        }
        try {
          payload[field.key] = JSON.parse(rawValue);
        } catch {
          setFormError(`Configuração inválida em ${field.label}.`);
          return;
        }
      } else {
        payload[field.key] = trimmedValue ? trimmedValue : null;
      }
    }

    if (modalMode === "edit" && !editingId) {
      setFormError("Registro inválido para edição.");
      return;
    }

    if (modalMode === "create") {
      delete payload.id;
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
    fields,
    formFields,
    formState,
    formFieldKeys,
    modalMode,
    createItem,
    updateItem,
    editingId,
    load,
    resetForm,
  ]);

  useEffect(() => {
    if (!referenceModalField) return;
    loadReferenceOptions(referenceModalField, referenceSearch.trim());
  }, [referenceModalField, referenceSearch, loadReferenceOptions]);

  const openReferenceDetail = useCallback(
    async (field: CrudFieldConfig<any>, referenceId: string) => {
      if (!field.referenceTable) {
        setReferenceDetailError("Configuração de referência inválida.");
        return;
      }

      setReferenceDetailLoading(true);
      setReferenceDetailError(null);
      setReferenceDetailModalOpen(true);
      setModalDepth((prev) => prev + 1);

      try {
        const response = await api.post(REFERENCE_ENDPOINT, {
          action: "list",
          table: field.referenceTable,
          search: referenceId,
          search_field: field.referenceIdField ?? "id",
        });
        const data = response.data;
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        const item = Array.isArray(list) && list.length > 0 ? list[0] : null;
        if (item) {
          setReferenceDetailData(item);
        } else {
          setReferenceDetailError("Registro não encontrado.");
        }
      } catch {
        setReferenceDetailError("Falha ao carregar dados.");
      } finally {
        setReferenceDetailLoading(false);
      }
    },
    [],
  );

  const closeReferenceDetail = useCallback(() => {
    setReferenceDetailModalOpen(false);
    setReferenceDetailData(null);
    setReferenceDetailLoading(false);
    setReferenceDetailError(null);
    setModalDepth((prev) => Math.max(0, prev - 1));
  }, []);

  const detailValueIsReference = useCallback(
    (detailLabel: string): CrudFieldConfig<any> | null => {
      return (
        fields.find(
          (f) => humanizeLabel(f.key) === detailLabel && f.type === "reference",
        ) ?? null
      );
    },
    [fields],
  );

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

  const detailsFromFields = (item: T): DetailItem[] => {
    const configured = fields.filter(
      (field) => field.visibleInList !== false && field.key !== "id",
    );
    const configuredKeys = new Set(configured.map((field) => field.key));
    const extraKeys = Object.keys(item).filter(
      (key) => key !== "id" && !configuredKeys.has(key),
    );

    const orderedFields: CrudFieldConfig<any>[] = [
      ...configured,
      ...extraKeys.map(
        (key) =>
          ({
            key,
            label: humanizeLabel(key),
            type: "text" as CrudFieldType,
            visibleInList: true,
          }) satisfies CrudFieldConfig<any>,
      ),
    ];

    return orderedFields.map((field) => ({
      label: field.label,
      value:
        field.type === "reference"
          ? getCachedReferenceLabel(field, item[field.key]) || "-"
          : formatValue(item[field.key]),
    }));
  };

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
              {details.map((detail) => {
                const refField = detailValueIsReference(detail.label);
                const isRefValue =
                  refField && detail.value && detail.value !== "-";
                return (
                  <View key={`${getId(item)}-${detail.label}`}>
                    {isRefValue ? (
                      <TouchableOpacity
                        onPress={() => {
                          if (
                            refField &&
                            detail.value &&
                            detail.value !== "-"
                          ) {
                            const fieldValue = item[refField.key];
                            if (fieldValue) {
                              openReferenceDetail(refField, String(fieldValue));
                            }
                          }
                        }}
                        style={{ paddingVertical: 2 }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 12,
                            color: tintColor,
                            textDecorationLine: "underline",
                          }}
                        >
                          {detail.label}: {detail.value || "-"}
                        </ThemedText>
                      </TouchableOpacity>
                    ) : (
                      <ThemedText
                        style={{ fontSize: 12, color: mutedTextColor }}
                      >
                        {detail.label}: {detail.value || "-"}
                      </ThemedText>
                    )}
                  </View>
                );
              })}
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
                  {field.type === "reference" ? (
                    <TouchableOpacity
                      onPress={() => openReferenceModal(field, "form")}
                      style={{
                        borderWidth: 1,
                        borderColor,
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        backgroundColor: inputBackground,
                        marginTop: 6,
                      }}
                    >
                      <ThemedText style={{ color: textColor }}>
                        {referenceLabels[field.key] ||
                          (formState[field.key]
                            ? getCachedReferenceLabel(
                                field,
                                formState[field.key],
                              )
                            : "") ||
                          (formState[field.key] ? "Selecionado" : "") ||
                          field.placeholder ||
                          "Selecionar"}
                      </ThemedText>
                    </TouchableOpacity>
                  ) : (
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
                  )}
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

      <Modal
        transparent
        visible={quickCreateModalOpen}
        animationType="slide"
        onRequestClose={closeQuickCreate}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: modalBackdrop,
            justifyContent: "center",
            padding: 16,
            zIndex: 20000 + modalDepth * 1000,
            elevation: 30 + modalDepth,
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
              Criar novo
            </ThemedText>

            {quickCreateFieldsLoading ? (
              <ActivityIndicator style={{ marginTop: 12 }} />
            ) : null}

            <ScrollView
              style={{ marginTop: 12 }}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {quickCreateFields.map((field) => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    {field.label}
                  </ThemedText>

                  {field.type === "reference" ? (
                    <TouchableOpacity
                      onPress={() => openReferenceModal(field, "quick")}
                      style={{
                        borderWidth: 1,
                        borderColor,
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        backgroundColor: inputBackground,
                        marginTop: 6,
                      }}
                    >
                      <ThemedText style={{ color: textColor }}>
                        {quickCreateReferenceLabels[field.key] ||
                          (quickCreateState[field.key]
                            ? getCachedReferenceLabel(
                                field,
                                quickCreateState[field.key],
                              )
                            : "") ||
                          (quickCreateState[field.key] ? "Selecionado" : "") ||
                          field.placeholder ||
                          "Selecionar"}
                      </ThemedText>
                    </TouchableOpacity>
                  ) : (
                    <TextInput
                      value={quickCreateState[field.key] ?? ""}
                      onChangeText={(text) =>
                        setQuickCreateState((prev) => ({
                          ...prev,
                          [field.key]: text,
                        }))
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
                  )}
                </View>
              ))}
            </ScrollView>

            {quickCreateError ? (
              <ThemedText style={{ color: tintColor, marginTop: 8 }}>
                {quickCreateError}
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
                onPress={closeQuickCreate}
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
                onPress={handleQuickCreateSave}
                disabled={quickCreateSaving || quickCreateFieldsLoading}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  backgroundColor:
                    quickCreateSaving || quickCreateFieldsLoading
                      ? mutedTextColor
                      : tintColor,
                }}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "700" }}
                >
                  {quickCreateSaving ? "Salvando..." : "Salvar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Render por último para nunca ficar atrás do quick create */}
      <Modal
        transparent
        visible={!!referenceModalField}
        animationType="slide"
        onRequestClose={() => {
          setReferenceModalField(null);
          setReferenceModalContext("form");
          setActiveQuickFieldKey(null);
          setModalDepth((prev) => Math.max(0, prev - 1));
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: modalBackdrop,
            justifyContent: "center",
            padding: 16,
            zIndex: 30000 + modalDepth * 1000,
            elevation: 40 + modalDepth,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 12,
              padding: 16,
              maxHeight: "90%",
              zIndex: 30001 + modalDepth * 1000,
              elevation: 41 + modalDepth,
            }}
          >
            <ThemedText style={[styles.processTitle, { color: textColor }]}>
              Selecionar
            </ThemedText>

            <TextInput
              value={referenceSearch}
              onChangeText={setReferenceSearch}
              placeholder="Buscar"
              placeholderTextColor={mutedTextColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBackground,
                color: textColor,
                marginTop: 12,
              }}
            />

            {referenceLoading ? (
              <ActivityIndicator style={{ marginTop: 12 }} />
            ) : null}

            {referenceError ? (
              <ThemedText style={{ color: tintColor, marginTop: 8 }}>
                {referenceError}
              </ThemedText>
            ) : null}

            <TouchableOpacity
              onPress={() => {
                if (!referenceModalField) return;
                openQuickCreate(referenceModalField);
              }}
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
                + Criar Novo
              </ThemedText>
            </TouchableOpacity>

            <ScrollView style={{ marginTop: 12 }}>
              {referenceOptions.length === 0 && !referenceLoading ? (
                <ThemedText style={{ color: mutedTextColor }}>
                  Nenhum resultado encontrado.
                </ThemedText>
              ) : null}

              {referenceOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => {
                    if (!referenceModalField) return;
                    if (referenceModalContext === "form") {
                      setFormState((prev) => ({
                        ...prev,
                        [referenceModalField.key]: option.id,
                      }));
                      setReferenceLabels((prev) => ({
                        ...prev,
                        [referenceModalField.key]: option.label,
                      }));
                    } else {
                      const targetKey =
                        activeQuickFieldKey ?? referenceModalField.key;
                      setQuickCreateState((prev) => ({
                        ...prev,
                        [targetKey]: option.id,
                      }));
                      setQuickCreateReferenceLabels((prev) => ({
                        ...prev,
                        [targetKey]: option.label,
                      }));
                    }
                    setReferenceModalField(null);
                    setReferenceModalContext("form");
                    setActiveQuickFieldKey(null);
                    setModalDepth((prev) => Math.max(0, prev - 1));
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    {option.label}
                  </ThemedText>
                  {option.raw ? (
                    <View style={{ marginTop: 4, gap: 2 }}>
                      {formatRecordDetails(option.raw).map((detail) => (
                        <ThemedText
                          key={`${option.id}-${detail.key}`}
                          style={{ fontSize: 12, color: mutedTextColor }}
                        >
                          {humanizeLabel(detail.key)}: {detail.value}
                        </ThemedText>
                      ))}
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              onPress={() => {
                setReferenceModalField(null);
                setReferenceModalContext("form");
                setActiveQuickFieldKey(null);
                setModalDepth((prev) => Math.max(0, prev - 1));
              }}
              style={{
                marginTop: 12,
                paddingVertical: 10,
                paddingHorizontal: 12,
                backgroundColor: cardColor,
                borderRadius: 6,
                alignItems: "center",
                borderWidth: 1,
                borderColor,
              }}
            >
              <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                Fechar
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reference detail modal for viewing linked records */}
      <Modal
        transparent
        visible={referenceDetailModalOpen}
        animationType="slide"
        onRequestClose={closeReferenceDetail}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: modalBackdrop,
            justifyContent: "center",
            padding: 16,
            zIndex: 40000 + modalDepth * 1000,
            elevation: 50 + modalDepth,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 12,
              padding: 16,
              maxHeight: "90%",
              zIndex: 40001 + modalDepth * 1000,
              elevation: 51 + modalDepth,
            }}
          >
            <ThemedText style={[styles.processTitle, { color: textColor }]}>
              Detalhes
            </ThemedText>

            {referenceDetailLoading ? (
              <ActivityIndicator style={{ marginTop: 12 }} />
            ) : null}

            {referenceDetailError ? (
              <ThemedText style={{ color: tintColor, marginTop: 8 }}>
                {referenceDetailError}
              </ThemedText>
            ) : null}

            {referenceDetailData ? (
              <ScrollView
                style={{ marginTop: 12 }}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {formatRecordDetails(referenceDetailData).map((detail) => {
                  const refField = fields.find(
                    (f) =>
                      humanizeLabel(f.key) === detail.key &&
                      f.type === "reference",
                  );
                  const dataValue = referenceDetailData?.[detail.key];
                  const isRefValue =
                    refField && dataValue && detail.value !== "-";

                  return (
                    <View
                      key={`detail-${detail.key}`}
                      style={{ marginBottom: 8 }}
                    >
                      {isRefValue ? (
                        <TouchableOpacity
                          onPress={() => {
                            if (refField && dataValue) {
                              openReferenceDetail(refField, String(dataValue));
                            }
                          }}
                        >
                          <ThemedText
                            style={{
                              fontSize: 12,
                              color: mutedTextColor,
                              marginBottom: 2,
                            }}
                          >
                            {humanizeLabel(detail.key)}
                          </ThemedText>
                          <ThemedText
                            style={{
                              fontSize: 13,
                              color: tintColor,
                              textDecorationLine: "underline",
                              fontWeight: "500",
                            }}
                          >
                            {detail.value}
                          </ThemedText>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <ThemedText
                            style={{
                              fontSize: 12,
                              color: mutedTextColor,
                              marginBottom: 2,
                            }}
                          >
                            {humanizeLabel(detail.key)}
                          </ThemedText>
                          <ThemedText
                            style={{
                              fontSize: 13,
                              color: textColor,
                            }}
                          >
                            {detail.value}
                          </ThemedText>
                        </>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}

            <TouchableOpacity
              onPress={closeReferenceDetail}
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
                Fechar
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
