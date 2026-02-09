import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../../../theme/styles";

type Project = {
  id: string;
  title: string;
  description?: string | null;
  customer_name?: string | null;
  status?: string | null;
  due_date?: string | null;
};

type Task = {
  id: string;
  project_id: string;
  assigned_to?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type User = {
  id?: string | number | null;
  name?: string | null;
  nome?: string | null;
  full_name?: string | null;
  cliente?: string | null;
  customer_name?: string | null;
  razao_social?: string | null;
  fantasia?: string | null;
  email?: string | null;
  email_address?: string | null;
  mail?: string | null;
  telefone?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  celular?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;
  cpf?: string | null;
  documento?: string | null;
  document?: string | null;
  documento_cpf?: string | null;
  [key: string]: unknown;
};

const ENDPOINTS = {
  listProjects: "https://n8n.sosescritura.com.br/webhook/listProjects",
  listTasks: "https://n8n.sosescritura.com.br/webhook/listTasks",
  createTask: "https://n8n.sosescritura.com.br/webhook/createTask",
  updateTask: "https://n8n.sosescritura.com.br/webhook/updateTask",
  listUsers: "https://n8n.sosescritura.com.br/webhook/client_all",
};

const isEndpointReady = (url: string) => url.startsWith("http");

export default function GestorPrazosDetailScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string | string[] }>();
  const projectId = Array.isArray(params.projectId)
    ? params.projectId[0]
    : params.projectId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [savingUpdates, setSavingUpdates] = useState<Record<string, boolean>>(
    {},
  );
  const [updateErrors, setUpdateErrors] = useState<Record<string, boolean>>({});

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    assigned_to: "",
    title: "",
    due_date: "",
    start_date: "",
    status: "todo",
    priority: "medium",
    description: "",
  });
  const [assignedDropdownOpen, setAssignedDropdownOpen] = useState(false);
  const [assignedSearch, setAssignedSearch] = useState("");
  const [assignedLabel, setAssignedLabel] = useState("");
  const [showTaskStartDatePicker, setShowTaskStartDatePicker] = useState(false);
  const [showTaskDueDatePicker, setShowTaskDueDatePicker] = useState(false);

  const tintColor = useThemeColor({}, "tint");
  const cardBg = useThemeColor({}, "card");
  const textPrimary = useThemeColor({}, "text");
  const listItemBg = useThemeColor({}, "card");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");

  const primaryButtonBg = useThemeColor({}, "tint");
  const primaryButtonText = useThemeColor({}, "background");

  const modalBackdrop = "rgba(0,0,0,0.55)";
  const inputBackground = useThemeColor({}, "input");
  const inputTextColor = useThemeColor({}, "text");
  const placeholderColor = useThemeColor({}, "muted");

  const getUserDisplayName = useCallback((u: User) => {
    return (
      (u.name as string) ||
      (u.nome as string) ||
      (u.full_name as string) ||
      (u.cliente as string) ||
      (u.customer_name as string) ||
      (u.razao_social as string) ||
      (u.fantasia as string) ||
      (u.email as string) ||
      (u.id != null ? String(u.id) : "")
    ).trim();
  }, []);

  const getUserEmail = useCallback((u: User) => {
    return (
      (u.email as string) ||
      (u.email_address as string) ||
      (u.mail as string) ||
      ""
    ).trim();
  }, []);

  const getUserPhone = useCallback((u: User) => {
    return (
      (u.telefone as string) ||
      (u.phone as string) ||
      (u.phone_number as string) ||
      (u.celular as string) ||
      (u.mobile as string) ||
      (u.whatsapp as string) ||
      ""
    ).trim();
  }, []);

  const getUserCpf = useCallback((u: User) => {
    return (
      (u.cpf as string) ||
      (u.documento_cpf as string) ||
      (u.documento as string) ||
      (u.document as string) ||
      ""
    ).trim();
  }, []);

  const getUserListLine = useCallback(
    (u: User) => {
      const name = getUserDisplayName(u) || "(Sem nome)";
      const email = getUserEmail(u) || "-";
      const phone = getUserPhone(u) || "-";
      const cpf = getUserCpf(u) || "-";
      return `${name} - ${email} - ${phone} - ${cpf}`;
    },
    [getUserCpf, getUserDisplayName, getUserEmail, getUserPhone],
  );

  const getUserSearchText = useCallback(
    (u: User) => {
      return [
        getUserDisplayName(u),
        getUserEmail(u),
        getUserPhone(u),
        getUserCpf(u),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    },
    [getUserCpf, getUserDisplayName, getUserEmail, getUserPhone],
  );

  const filteredAssignedUsers = useMemo(() => {
    const term = assignedSearch.trim().toLowerCase();
    if (!term) {
      return users;
    }
    return users.filter((u) => getUserSearchText(u).includes(term));
  }, [assignedSearch, getUserSearchText, users]);

  const formatDateDDMMYYYY = useCallback((date: Date) => {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, []);

  const toIsoDate = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      return "";
    }
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const formatDateLabel = useCallback(
    (value?: string | null) => {
      if (!value) {
        return "";
      }
      const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (ddmmyyyy) {
        return value;
      }
      const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) {
        const [, yyyy, mm, dd] = iso;
        return `${dd}/${mm}/${yyyy}`;
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return formatDateDDMMYYYY(parsed);
      }
      return value;
    },
    [formatDateDDMMYYYY],
  );

  const parseDateForSort = useCallback((task: Task) => {
    const value = task.due_date || task.start_date || task.created_at || "";
    if (!value) {
      return Number.POSITIVE_INFINITY;
    }
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return new Date(`${iso[1]}-${iso[2]}-${iso[3]}`).getTime();
    }
    const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) {
      return new Date(`${br[3]}-${br[2]}-${br[1]}`).getTime();
    }
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
  }, []);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => parseDateForSort(a) - parseDateForSort(b));
  }, [parseDateForSort, tasks]);

  const updateTaskLocal = useCallback(
    (taskId: string, changes: Partial<Task>) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...changes } : t)),
      );
    },
    [],
  );

  const persistTaskUpdate = useCallback(
    async (taskId: string, changes: Partial<Task>) => {
      if (!isEndpointReady(ENDPOINTS.updateTask)) {
        setError("Configure o endpoint de atualização de tarefas.");
        return;
      }
      if (!projectId) {
        setError("Projeto inválido.");
        return;
      }

      setSavingUpdates((prev) => ({ ...prev, [taskId]: true }));
      setUpdateErrors((prev) => ({ ...prev, [taskId]: false }));

      const payload: Record<string, unknown> = {
        task_id: taskId,
        project_id: projectId,
        ...(user?.id ? { user_id: user.id } : {}),
        ...changes,
      };

      if (typeof changes.start_date === "string") {
        payload.start_date = toIsoDate(changes.start_date);
      }
      if (typeof changes.due_date === "string") {
        payload.due_date = toIsoDate(changes.due_date);
      }

      try {
        await api.post(ENDPOINTS.updateTask, payload);
      } catch {
        setUpdateErrors((prev) => ({ ...prev, [taskId]: true }));
      } finally {
        setSavingUpdates((prev) => ({ ...prev, [taskId]: false }));
      }
    },
    [projectId, toIsoDate, user?.id],
  );

  const fetchData = useCallback(async () => {
    if (!projectId) {
      setError("Projeto inválido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const projectPromise = isEndpointReady(ENDPOINTS.listProjects)
        ? api.post<Project[]>(ENDPOINTS.listProjects, { user_id: user?.id })
        : null;
      const taskPromise = isEndpointReady(ENDPOINTS.listTasks)
        ? api.post<Task[]>(ENDPOINTS.listTasks, {
            user_id: user?.id,
            project_id: projectId,
          })
        : null;

      const [projectsRes, tasksRes] = await Promise.allSettled([
        projectPromise,
        taskPromise,
      ]);

      if (projectsRes.status === "fulfilled") {
        const data = projectsRes.value?.data;
        const list = Array.isArray(data) ? data : [];
        setProject(list.find((p) => p.id === projectId) ?? null);
      } else {
        setProject(null);
      }

      if (tasksRes.status === "fulfilled") {
        const data = tasksRes.value?.data;
        const list = Array.isArray(data) ? data : [];
        setTasks(list.filter((t) => t.project_id === projectId));
      } else {
        setTasks([]);
      }

      if (isEndpointReady(ENDPOINTS.listUsers)) {
        try {
          const usersRes = await api.get<User[]>(ENDPOINTS.listUsers);
          const data = usersRes.data;
          if (Array.isArray(data)) {
            setUsers(data);
          } else if (Array.isArray((data as any)?.data)) {
            setUsers((data as any).data);
          } else {
            setUsers([]);
          }
        } catch {
          try {
            const usersRes = await api.post<User[]>(ENDPOINTS.listUsers, {
              user_id: user?.id,
            });
            const data = usersRes.data;
            if (Array.isArray(data)) {
              setUsers(data);
            } else if (Array.isArray((data as any)?.data)) {
              setUsers((data as any).data);
            } else {
              setUsers([]);
            }
          } catch {
            setUsers([]);
          }
        }
      } else {
        setUsers([]);
      }
    } catch {
      setError("Falha ao carregar tarefas.");
    } finally {
      setLoading(false);
    }
  }, [projectId, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateTask = async () => {
    if (!isEndpointReady(ENDPOINTS.createTask)) {
      setError("Configure o endpoint de criação de tarefas em ENDPOINTS.");
      return;
    }
    if (!projectId) {
      setError("Projeto inválido.");
      return;
    }
    setTaskError(null);
    setError(null);
    setSavingTask(true);
    try {
      const safeTitle = taskForm.title.trim() || "Sem título";
      const payload = {
        ...taskForm,
        title: safeTitle,
        start_date: toIsoDate(taskForm.start_date),
        due_date: toIsoDate(taskForm.due_date),
        project_id: projectId,
        ...(user?.id ? { user_id: user.id } : {}),
      };

      try {
        await api.post(ENDPOINTS.createTask, payload);
      } catch {
        await api.get(ENDPOINTS.createTask, { params: payload });
      }

      setTaskModalOpen(false);
      setTaskForm({
        assigned_to: "",
        title: "",
        due_date: "",
        start_date: "",
        status: "todo",
        priority: "medium",
        description: "",
      });
      setAssignedLabel("");
      setAssignedSearch("");
      setAssignedDropdownOpen(false);
      await fetchData();
    } catch {
      setTaskError("Falha ao criar tarefa.");
      setError("Falha ao criar tarefa.");
    } finally {
      setSavingTask(false);
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
        <ThemedText style={{ marginTop: 12 }}>Carregando...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ThemedView style={[styles.processCard, { backgroundColor: cardBg }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ color: tintColor, fontWeight: "600" }}>
            ← Voltar
          </ThemedText>
        </TouchableOpacity>
        <ThemedText style={[styles.processTitle, { color: textPrimary }]}>
          {project?.title || "Projeto"}
        </ThemedText>
        {project?.customer_name ? (
          <ThemedText style={{ color: mutedTextColor, fontSize: 12 }}>
            Cliente: {project.customer_name}
          </ThemedText>
        ) : null}
        {project?.due_date ? (
          <ThemedText style={{ color: mutedTextColor, fontSize: 12 }}>
            Prazo: {formatDateLabel(project.due_date)}
          </ThemedText>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            onPress={() => {
              setTaskError(null);
              setTaskModalOpen(true);
            }}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              backgroundColor: primaryButtonBg,
              borderRadius: 6,
            }}
          >
            <ThemedText style={{ color: primaryButtonText, fontWeight: "700" }}>
              + Nova tarefa
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>

      {error ? (
        <ThemedText style={{ marginTop: 12, color: "#d11a2a" }}>
          {error}
        </ThemedText>
      ) : null}

      <ThemedView
        style={[styles.processCard, { marginTop: 16, backgroundColor: cardBg }]}
      >
        <ThemedText style={[styles.processTitle, { color: textPrimary }]}>
          Tarefas
        </ThemedText>
        {sortedTasks.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor }}>
            Nenhuma tarefa cadastrada.
          </ThemedText>
        ) : (
          <View style={{ gap: 12 }}>
            {sortedTasks.map((task) => (
              <View
                key={task.id}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: listItemBg,
                }}
              >
                <ThemedText style={{ fontWeight: "700", color: textPrimary }}>
                  Título
                </ThemedText>
                <TextInput
                  value={task.title}
                  onChangeText={(text) =>
                    updateTaskLocal(task.id, { title: text })
                  }
                  onBlur={() =>
                    persistTaskUpdate(task.id, { title: task.title.trim() })
                  }
                  placeholder="Título"
                  placeholderTextColor={placeholderColor}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: inputBackground,
                    color: inputTextColor,
                    marginTop: 6,
                  }}
                />

                <View style={{ marginTop: 10 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Início (DD/MM/AAAA)
                  </ThemedText>
                  <TextInput
                    value={formatDateLabel(task.start_date)}
                    onChangeText={(text) =>
                      updateTaskLocal(task.id, { start_date: text })
                    }
                    onBlur={() =>
                      persistTaskUpdate(task.id, {
                        start_date: task.start_date || "",
                      })
                    }
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor={placeholderColor}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: inputBackground,
                      color: inputTextColor,
                      marginTop: 6,
                    }}
                  />
                </View>

                <View style={{ marginTop: 10 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Prazo (DD/MM/AAAA)
                  </ThemedText>
                  <TextInput
                    value={formatDateLabel(task.due_date)}
                    onChangeText={(text) =>
                      updateTaskLocal(task.id, { due_date: text })
                    }
                    onBlur={() =>
                      persistTaskUpdate(task.id, {
                        due_date: task.due_date || "",
                      })
                    }
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor={placeholderColor}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: inputBackground,
                      color: inputTextColor,
                      marginTop: 6,
                    }}
                  />
                </View>

                <View style={{ marginTop: 10 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Status
                  </ThemedText>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    {(["todo", "in_progress", "done"] as const).map(
                      (status) => {
                        const selected = task.status === status;
                        return (
                          <TouchableOpacity
                            key={status}
                            onPress={() => {
                              updateTaskLocal(task.id, { status });
                              void persistTaskUpdate(task.id, { status });
                            }}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: selected ? tintColor : borderColor,
                              backgroundColor: selected ? "#e5f3f7" : "#fff",
                            }}
                          >
                            <ThemedText
                              style={{ color: "#0b0b0b", fontSize: 12 }}
                            >
                              {status === "todo"
                                ? "A fazer"
                                : status === "in_progress"
                                  ? "Em andamento"
                                  : "Concluída"}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      },
                    )}
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Prioridade
                  </ThemedText>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    {(["low", "medium", "high"] as const).map((priority) => {
                      const selected = task.priority === priority;
                      return (
                        <TouchableOpacity
                          key={priority}
                          onPress={() => {
                            updateTaskLocal(task.id, { priority });
                            void persistTaskUpdate(task.id, { priority });
                          }}
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: selected ? tintColor : borderColor,
                            backgroundColor: selected ? "#e5f3f7" : "#fff",
                          }}
                        >
                          <ThemedText
                            style={{ color: "#0b0b0b", fontSize: 12 }}
                          >
                            {priority === "low"
                              ? "Baixa"
                              : priority === "medium"
                                ? "Média"
                                : "Alta"}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Descrição
                  </ThemedText>
                  <TextInput
                    value={task.description ?? ""}
                    onChangeText={(text) =>
                      updateTaskLocal(task.id, { description: text })
                    }
                    onBlur={() =>
                      persistTaskUpdate(task.id, {
                        description: task.description ?? "",
                      })
                    }
                    placeholder="Descrição"
                    placeholderTextColor={placeholderColor}
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: inputBackground,
                      color: inputTextColor,
                      marginTop: 6,
                      minHeight: 80,
                    }}
                  />
                </View>

                {savingUpdates[task.id] ? (
                  <ThemedText style={{ marginTop: 8, fontSize: 12 }}>
                    Salvando...
                  </ThemedText>
                ) : null}
                {updateErrors[task.id] ? (
                  <ThemedText
                    style={{ marginTop: 6, fontSize: 12, color: "#d11a2a" }}
                  >
                    Falha ao salvar. Tente novamente.
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ThemedView>

      <Modal
        transparent
        visible={taskModalOpen}
        animationType="slide"
        onRequestClose={() => setTaskModalOpen(false)}
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
            style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16 }}
          >
            <ThemedText style={[styles.processTitle, { color: "#0b0b0b" }]}>
              Nova tarefa
            </ThemedText>
            {taskError ? (
              <ThemedText style={{ marginTop: 8, color: "#d11a2a" }}>
                {taskError}
              </ThemedText>
            ) : null}
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Título
              </ThemedText>
              <TextInput
                value={taskForm.title}
                onChangeText={(text) =>
                  setTaskForm((prev) => ({ ...prev, title: text }))
                }
                placeholder="Título da tarefa"
                placeholderTextColor={placeholderColor}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: inputBackground,
                  color: inputTextColor,
                  marginTop: 6,
                }}
              />
            </View>
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Responsável
              </ThemedText>
              <Pressable
                onPress={() => setAssignedDropdownOpen((open) => !open)}
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
                <ThemedText style={{ color: inputTextColor }}>
                  {assignedLabel || "Selecionar responsável"}
                </ThemedText>
              </Pressable>

              {assignedDropdownOpen ? (
                <View
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    backgroundColor: "#fff",
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{ padding: 10, borderBottomWidth: 1, borderColor }}
                  >
                    <TextInput
                      value={assignedSearch}
                      onChangeText={setAssignedSearch}
                      placeholder="Buscar usuário"
                      placeholderTextColor={placeholderColor}
                      style={{ color: inputTextColor }}
                    />
                  </View>
                  <ScrollView style={{ maxHeight: 220 }}>
                    {filteredAssignedUsers.length === 0 ? (
                      <ThemedText
                        style={{
                          padding: 12,
                          color: mutedTextColor,
                          fontSize: 12,
                        }}
                      >
                        Nenhum usuário encontrado.
                      </ThemedText>
                    ) : (
                      filteredAssignedUsers.map((u, index) => {
                        const displayLine = getUserListLine(u);
                        const key =
                          u.id != null
                            ? String(u.id)
                            : `${displayLine}-${index}`;
                        return (
                          <TouchableOpacity
                            key={key}
                            onPress={() => {
                              setTaskForm((prev) => ({
                                ...prev,
                                assigned_to: u.id != null ? String(u.id) : "",
                              }));
                              setAssignedLabel(displayLine);
                              setAssignedSearch("");
                              setAssignedDropdownOpen(false);
                            }}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              borderBottomWidth: 1,
                              borderColor: "#f1f5f9",
                              backgroundColor:
                                taskForm.assigned_to &&
                                u.id != null &&
                                String(u.id) === taskForm.assigned_to
                                  ? "#e5f3f7"
                                  : "#fff",
                            }}
                          >
                            <ThemedText style={{ color: "#0b0b0b" }}>
                              {displayLine}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              ) : null}
            </View>
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Status
              </ThemedText>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {(["todo", "in_progress", "done"] as const).map((status) => {
                  const selected = taskForm.status === status;
                  return (
                    <TouchableOpacity
                      key={status}
                      onPress={() =>
                        setTaskForm((prev) => ({ ...prev, status }))
                      }
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected ? tintColor : borderColor,
                        backgroundColor: selected ? "#e5f3f7" : "#fff",
                      }}
                    >
                      <ThemedText style={{ color: "#0b0b0b", fontSize: 12 }}>
                        {status === "todo"
                          ? "A fazer"
                          : status === "in_progress"
                            ? "Em andamento"
                            : "Concluída"}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Início
              </ThemedText>
              {Platform.OS === "web" ? (
                <TextInput
                  value={taskForm.start_date}
                  onChangeText={(text) =>
                    setTaskForm((prev) => ({ ...prev, start_date: text }))
                  }
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={placeholderColor}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: inputBackground,
                    color: inputTextColor,
                    marginTop: 6,
                  }}
                />
              ) : (
                <>
                  <Pressable
                    onPress={() => setShowTaskStartDatePicker(true)}
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
                    <ThemedText style={{ color: inputTextColor }}>
                      {taskForm.start_date || "Selecionar data"}
                    </ThemedText>
                  </Pressable>
                  {showTaskStartDatePicker ? (
                    <DateTimePicker
                      value={
                        taskForm.start_date
                          ? new Date(
                              toIsoDate(taskForm.start_date) || Date.now(),
                            )
                          : new Date()
                      }
                      mode="date"
                      display={Platform.OS === "ios" ? "inline" : "default"}
                      onChange={(_, date) => {
                        setShowTaskStartDatePicker(false);
                        if (date) {
                          setTaskForm((prev) => ({
                            ...prev,
                            start_date: formatDateDDMMYYYY(date),
                          }));
                        }
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Prazo
              </ThemedText>
              {Platform.OS === "web" ? (
                <TextInput
                  value={taskForm.due_date}
                  onChangeText={(text) =>
                    setTaskForm((prev) => ({ ...prev, due_date: text }))
                  }
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={placeholderColor}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: inputBackground,
                    color: inputTextColor,
                    marginTop: 6,
                  }}
                />
              ) : (
                <>
                  <Pressable
                    onPress={() => setShowTaskDueDatePicker(true)}
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
                    <ThemedText style={{ color: inputTextColor }}>
                      {taskForm.due_date || "Selecionar data"}
                    </ThemedText>
                  </Pressable>
                  {showTaskDueDatePicker ? (
                    <DateTimePicker
                      value={
                        taskForm.due_date
                          ? new Date(toIsoDate(taskForm.due_date) || Date.now())
                          : new Date()
                      }
                      mode="date"
                      display={Platform.OS === "ios" ? "inline" : "default"}
                      onChange={(_, date) => {
                        setShowTaskDueDatePicker(false);
                        if (date) {
                          setTaskForm((prev) => ({
                            ...prev,
                            due_date: formatDateDDMMYYYY(date),
                          }));
                        }
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Prioridade
              </ThemedText>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {(["low", "medium", "high"] as const).map((level) => {
                  const selected = taskForm.priority === level;
                  return (
                    <TouchableOpacity
                      key={level}
                      onPress={() =>
                        setTaskForm((prev) => ({ ...prev, priority: level }))
                      }
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected ? tintColor : borderColor,
                        backgroundColor: selected ? "#e5f3f7" : "#fff",
                      }}
                    >
                      <ThemedText style={{ color: "#0b0b0b", fontSize: 12 }}>
                        {level === "low"
                          ? "Baixa"
                          : level === "medium"
                            ? "Média"
                            : "Alta"}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Descrição
              </ThemedText>
              <TextInput
                value={taskForm.description}
                onChangeText={(text) =>
                  setTaskForm((prev) => ({ ...prev, description: text }))
                }
                placeholder="Descrição"
                placeholderTextColor={placeholderColor}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: inputBackground,
                  color: inputTextColor,
                  marginTop: 6,
                  minHeight: 80,
                }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setTaskModalOpen(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: "#fff",
                }}
              >
                <ThemedText style={{ color: "#0b0b0b", fontWeight: "600" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCreateTask}
                disabled={savingTask}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  backgroundColor: primaryButtonBg,
                  opacity: savingTask ? 0.7 : 1,
                }}
              >
                <ThemedText
                  style={{ color: primaryButtonText, fontWeight: "600" }}
                >
                  {savingTask ? "Salvando..." : "Salvar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
