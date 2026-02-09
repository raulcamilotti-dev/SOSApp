import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../../../theme/styles";

type Project = {
  id: string;
  title: string;
  customer_name?: string | null;
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
  [key: string]: unknown;
};

const ENDPOINTS = {
  listProjects: "https://n8n.sosescritura.com.br/webhook/listProjects",
  listTasks: "https://n8n.sosescritura.com.br/webhook/listTasks",
  listUsers: "https://n8n.sosescritura.com.br/webhook/client_all",
};

const isEndpointReady = (url: string) => url.startsWith("http");

const formatDateDDMMYYYY = (value?: string | null) => {
  if (!value) {
    return "";
  }
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    return value;
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return `${dd}/${mm}/${yyyy}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, "0");
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const yyyy = parsed.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return value;
};

const parseDateForSort = (task: Task) => {
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
};

const getUserDisplayName = (u: User) => {
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
};

export default function GestorPrazosTarefasScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "todo" | "in_progress" | "done"
  >("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const cardBg = useThemeColor({}, "card");
  const textPrimary = useThemeColor({}, "text");
  const listItemBg = useThemeColor({}, "card");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBackground = useThemeColor({}, "input");
  const inputTextColor = useThemeColor({}, "text");
  const placeholderColor = useThemeColor({}, "muted");

  const projectById = useMemo(() => {
    return new Map(projects.map((p) => [p.id, p]));
  }, [projects]);

  const userById = useMemo(() => {
    return new Map(
      users.filter((u) => u.id != null).map((u) => [String(u.id), u]),
    );
  }, [users]);

  const parseFilterDate = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) {
      return new Date(`${br[3]}-${br[2]}-${br[1]}`).getTime();
    }
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      return new Date(`${iso[1]}-${iso[2]}-${iso[3]}`).getTime();
    }
    const parsed = new Date(trimmed).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }, []);

  const filteredTasks = useMemo(() => {
    const fromTs = parseFilterDate(dateFrom);
    const toTs = parseFilterDate(dateTo);
    return tasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }
      if (fromTs == null && toTs == null) {
        return true;
      }
      const taskTs = parseDateForSort(task);
      if (fromTs != null && taskTs < fromTs) {
        return false;
      }
      if (toTs != null && taskTs > toTs) {
        return false;
      }
      return true;
    });
  }, [dateFrom, dateTo, parseFilterDate, statusFilter, tasks]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort(
      (a, b) => parseDateForSort(a) - parseDateForSort(b),
    );
  }, [filteredTasks]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projectPromise = isEndpointReady(ENDPOINTS.listProjects)
        ? api.post<Project[]>(ENDPOINTS.listProjects, { user_id: user?.id })
        : null;
      const taskPromise = isEndpointReady(ENDPOINTS.listTasks)
        ? api.post<Task[]>(ENDPOINTS.listTasks, { user_id: user?.id })
        : null;

      const [projectsRes, tasksRes] = await Promise.allSettled([
        projectPromise,
        taskPromise,
      ]);

      if (projectsRes.status === "fulfilled") {
        const data = projectsRes.value?.data;
        setProjects(Array.isArray(data) ? data : []);
      } else {
        setProjects([]);
      }

      if (tasksRes.status === "fulfilled") {
        const data = tasksRes.value?.data;
        setTasks(Array.isArray(data) ? data : []);
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
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
          Todas as tarefas
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Visão geral para priorizar o trabalho
        </ThemedText>
      </ThemedView>

      <ThemedView
        style={[styles.processCard, { marginTop: 16, backgroundColor: cardBg }]}
      >
        <ThemedText style={[styles.processTitle, { color: textPrimary }]}>
          Filtros
        </ThemedText>
        <View style={{ marginTop: 8 }}>
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            Período (DD/MM/AAAA)
          </ThemedText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            <TextInput
              value={dateFrom}
              onChangeText={setDateFrom}
              placeholder="De"
              placeholderTextColor={placeholderColor}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBackground,
                color: inputTextColor,
              }}
            />
            <TextInput
              value={dateTo}
              onChangeText={setDateTo}
              placeholder="Até"
              placeholderTextColor={placeholderColor}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBackground,
                color: inputTextColor,
              }}
            />
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            Status
          </ThemedText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            {(["all", "todo", "in_progress", "done"] as const).map((status) => {
              const selected = statusFilter === status;
              return (
                <TouchableOpacity
                  key={status}
                  onPress={() => setStatusFilter(status)}
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
                    {status === "all"
                      ? "Todos"
                      : status === "todo"
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
      </ThemedView>

      {error ? (
        <ThemedText style={{ marginTop: 12, color: "#d11a2a" }}>
          {error}
        </ThemedText>
      ) : null}

      <ThemedView
        style={[styles.processCard, { marginTop: 16, backgroundColor: cardBg }]}
      >
        {sortedTasks.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor }}>
            Nenhuma tarefa encontrada.
          </ThemedText>
        ) : (
          <View style={{ gap: 12 }}>
            {sortedTasks.map((task) => {
              const project = projectById.get(task.project_id);
              const assigned = task.assigned_to
                ? userById.get(String(task.assigned_to))
                : null;
              return (
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
                    {task.title}
                  </ThemedText>
                  {project ? (
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Projeto: {project.title}
                    </ThemedText>
                  ) : null}
                  {project?.customer_name ? (
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Cliente: {project.customer_name}
                    </ThemedText>
                  ) : null}
                  {assigned ? (
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Responsável: {getUserDisplayName(assigned)}
                    </ThemedText>
                  ) : null}
                  {task.start_date ? (
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Início: {formatDateDDMMYYYY(task.start_date)}
                    </ThemedText>
                  ) : null}
                  {task.due_date ? (
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Prazo: {formatDateDDMMYYYY(task.due_date)}
                    </ThemedText>
                  ) : null}
                  {task.status ? (
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Status: {task.status}
                    </ThemedText>
                  ) : null}
                  {task.priority ? (
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Prioridade: {task.priority}
                    </ThemedText>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ThemedView>
    </ScrollView>
  );
}
