import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { styles } from "../../../../theme/styles";

// Nível 4: Variáveis controláveis de uma tarefa
// Obs: mantemos tudo como string para facilitar a edição no app
// e deixar o backend converter conforme o tipo.
type TaskVariable = {
  id: string;
  name: string;
  label?: string | null;
  type?: string | null;
  value?: string | number | boolean | null;
  required?: boolean | null;
  task_id?: string | null;
  tenant_id?: string | null;
};

type VariableDraft = {
  id: string;
  name: string;
  value: string;
};

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const normalizeList = <T,>(data: unknown): T[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as T[]) : [];
};

export default function TaskVariablesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { taskId, taskTitle } = useLocalSearchParams<{
    taskId: string;
    taskTitle: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variables, setVariables] = useState<TaskVariable[]>([]);
  const [drafts, setDrafts] = useState<Record<string, VariableDraft>>({});

  const cardBg = useThemeColor({}, "card");
  const textPrimary = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const primaryButtonBg = useThemeColor({}, "tint");
  const primaryButtonText = useThemeColor({}, "background");
  const inputBackground = useThemeColor({}, "input");
  const inputTextColor = useThemeColor({}, "text");
  const fetchVariables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(ENDPOINT, {
        action: "list",
        table: "task_variables",
      });

      const tenantId = user?.tenant_id ?? null;
      const data = normalizeList<TaskVariable>(response.data).filter(
        (variable) => {
          const matchesTask = variable.task_id === taskId;
          const matchesTenant = tenantId
            ? !variable.tenant_id || variable.tenant_id === tenantId
            : true;
          return matchesTask && matchesTenant;
        },
      );
      setVariables(data);
      const nextDrafts: Record<string, VariableDraft> = {};
      data.forEach((variable) => {
        nextDrafts[variable.id] = {
          id: variable.id,
          name: variable.name,
          value:
            variable.value === null || variable.value === undefined
              ? ""
              : String(variable.value),
        };
      });
      setDrafts(nextDrafts);
    } catch (err: any) {
      console.error("Erro ao buscar variaveis:", err);
      setError(
        err?.response?.data?.message || "Erro ao carregar variaveis da tarefa",
      );
    } finally {
      setLoading(false);
    }
  }, [taskId, user?.tenant_id]);

  useEffect(() => {
    fetchVariables();
  }, [fetchVariables]);

  const handleChangeValue = (variableId: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [variableId]: {
        ...prev[variableId],
        value,
      },
    }));
  };

  const hasChanges = useMemo(() => {
    return variables.some((variable) => {
      const draft = drafts[variable.id];
      if (!draft) return false;
      const original =
        variable.value === null || variable.value === undefined
          ? ""
          : String(variable.value);
      return draft.value !== original;
    });
  }, [drafts, variables]);

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      const payload = Object.values(drafts).map((draft) => ({
        id: draft.id,
        name: draft.name,
        value: draft.value,
      }));

      await Promise.all(
        payload.map((item) =>
          api.post(ENDPOINT, {
            action: "update",
            table: "task_variables",
            payload: {
              id: item.id,
              name: item.name,
              value: item.value,
              tenant_id: user?.tenant_id ?? null,
            },
          }),
        ),
      );

      await fetchVariables();
    } catch (err: any) {
      console.error("Erro ao salvar variaveis:", err);
      setError(err?.response?.data?.message || "Erro ao salvar variaveis");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>
          Carregando variaveis...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <ThemedText style={{ fontSize: 24, color: primaryButtonBg }}>
          ←
        </ThemedText>
        <ThemedText
          style={{ fontSize: 16, color: primaryButtonBg, fontWeight: "600" }}
        >
          Voltar
        </ThemedText>
      </TouchableOpacity>

      <ThemedView style={[styles.processCard, { backgroundColor: cardBg }]}>
        <ThemedText style={[styles.processTitle, { color: textPrimary }]}>
          {taskTitle || "Tarefa"}
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Controle as variaveis da tarefa
        </ThemedText>
      </ThemedView>

      {error ? (
        <ThemedText style={{ marginTop: 12, color: "#d11a2a" }}>
          {error}
        </ThemedText>
      ) : null}

      <ThemedView
        style={[styles.processCard, { marginTop: 16, backgroundColor: cardBg }]}
      >
        <ThemedText
          style={[
            styles.processTitle,
            { color: textPrimary, marginBottom: 12 },
          ]}
        >
          Variaveis
        </ThemedText>
        {variables.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor }}>
            Nenhuma variavel cadastrada para esta tarefa.
          </ThemedText>
        ) : (
          <View style={{ gap: 12 }}>
            {variables.map((variable) => {
              const draft = drafts[variable.id];
              const label = variable.label || variable.name;
              const typeLabel = variable.type ? `(${variable.type})` : "";
              return (
                <View
                  key={variable.id}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    padding: 12,
                    backgroundColor: "transparent",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <ThemedText
                      style={{ color: textPrimary, fontWeight: "600" }}
                    >
                      {label}
                    </ThemedText>
                    {variable.required ? (
                      <ThemedText style={{ color: "#ef4444", fontSize: 11 }}>
                        Obrigatorio
                      </ThemedText>
                    ) : null}
                  </View>
                  {typeLabel ? (
                    <ThemedText style={{ color: mutedTextColor, fontSize: 11 }}>
                      {typeLabel}
                    </ThemedText>
                  ) : null}
                  <TextInput
                    value={draft?.value ?? ""}
                    onChangeText={(text) =>
                      handleChangeValue(variable.id, text)
                    }
                    placeholder="Digite o valor"
                    placeholderTextColor={mutedTextColor}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: inputBackground,
                      color: inputTextColor,
                      marginTop: 8,
                    }}
                  />
                </View>
              );
            })}
          </View>
        )}
      </ThemedView>

      <TouchableOpacity
        onPress={handleSave}
        disabled={!hasChanges || saving}
        style={{
          marginTop: 16,
          paddingVertical: 12,
          borderRadius: 8,
          alignItems: "center",
          backgroundColor: !hasChanges || saving ? "#9ca3af" : primaryButtonBg,
        }}
      >
        <ThemedText style={{ color: primaryButtonText, fontWeight: "700" }}>
          {saving ? "Salvando..." : "Salvar alteracoes"}
        </ThemedText>
      </TouchableOpacity>
    </ScrollView>
  );
}
