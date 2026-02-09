import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { styles } from "../../theme/styles";

type Project = {
  id: string;
  title: string;
  description?: string | null;
  customer_name?: string | null;
  status?: string | null;
  due_date?: string | null;
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
  createProject: "https://n8n.sosescritura.com.br/webhook/createProject",
  listUsers: "https://n8n.sosescritura.com.br/webhook/client_all",
};

const isEndpointReady = (url: string) => url.startsWith("http");

export default function GestorPrazosScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({
    title: "",
    customer_name: "",
    due_date: "",
    description: "",
  });
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

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

  const filteredUsers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) {
      return users;
    }
    return users.filter((u) => getUserSearchText(u).includes(term));
  }, [customerSearch, getUserSearchText, users]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projectPromise = isEndpointReady(ENDPOINTS.listProjects)
        ? api.post<Project[]>(ENDPOINTS.listProjects, { user_id: user?.id })
        : null;

      const [projectsRes] = await Promise.allSettled([projectPromise]);

      if (projectsRes.status === "fulfilled") {
        const data = projectsRes.value?.data;
        setProjects(Array.isArray(data) ? data : []);
      } else {
        setProjects([]);
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

      if (!isEndpointReady(ENDPOINTS.listProjects)) {
        setError("Configure o endpoint de projetos em ENDPOINTS.");
      }
    } catch {
      setError("Falha ao carregar projetos/tarefas.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateProject = async () => {
    if (!isEndpointReady(ENDPOINTS.createProject)) {
      setError("Configure o endpoint de criação de projetos em ENDPOINTS.");
      return;
    }
    try {
      await api.post(ENDPOINTS.createProject, {
        ...projectForm,
        user_id: user?.id,
      });
      setProjectModalOpen(false);
      setCustomerDropdownOpen(false);
      setCustomerSearch("");
      setProjectForm({
        title: "",
        customer_name: "",
        due_date: "",
        description: "",
      });
      await fetchData();
    } catch {
      setError("Falha ao criar projeto.");
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
        <ThemedText style={[styles.processTitle, { color: textPrimary }]}>
          Gestor de prazos
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Controle projetos, prazos e tarefas por cliente.
        </ThemedText>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            onPress={() => setProjectModalOpen(true)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              backgroundColor: primaryButtonBg,
              borderRadius: 6,
            }}
          >
            <ThemedText style={{ color: primaryButtonText, fontWeight: "700" }}>
              + Novo projeto
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/Administrador/gestor-prazos/tarefas")}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              backgroundColor: "#111827",
              borderRadius: 6,
            }}
          >
            <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
              Ver tarefas
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
          Projetos
        </ThemedText>
        {projects.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor }}>
            Nenhum projeto cadastrado.
          </ThemedText>
        ) : (
          <View style={{ gap: 12 }}>
            {projects.map((project) => (
              <TouchableOpacity
                key={project.id}
                onPress={() =>
                  router.push({
                    pathname: "/Administrador/gestor-prazos/[projectId]",
                    params: { projectId: project.id },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  padding: 12,
                  backgroundColor: listItemBg,
                }}
              >
                <ThemedText style={{ fontWeight: "700", color: textPrimary }}>
                  {project.title}
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  Cliente do projeto: {project.customer_name || "Não informado"}
                </ThemedText>
                {project.status ? (
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Status: {project.status}
                  </ThemedText>
                ) : null}
                {project.due_date ? (
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Prazo: {project.due_date}
                  </ThemedText>
                ) : null}
                {project.description ? (
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Descrição: {project.description}
                  </ThemedText>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ThemedView>
      <Modal
        transparent
        visible={projectModalOpen}
        animationType="slide"
        onRequestClose={() => setProjectModalOpen(false)}
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
              Novo projeto
            </ThemedText>
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Título
              </ThemedText>
              <TextInput
                value={projectForm.title}
                onChangeText={(text) =>
                  setProjectForm((prev) => ({ ...prev, title: text }))
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
            </View>
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Cliente
              </ThemedText>
              <Pressable
                onPress={() => setCustomerDropdownOpen((open) => !open)}
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
                  {projectForm.customer_name || "Selecionar cliente"}
                </ThemedText>
              </Pressable>

              {customerDropdownOpen ? (
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
                      value={customerSearch}
                      onChangeText={setCustomerSearch}
                      placeholder="Buscar cliente"
                      placeholderTextColor={placeholderColor}
                      style={{ color: inputTextColor }}
                    />
                  </View>
                  <ScrollView style={{ maxHeight: 220 }}>
                    {filteredUsers.length === 0 ? (
                      <ThemedText
                        style={{
                          padding: 12,
                          color: mutedTextColor,
                          fontSize: 12,
                        }}
                      >
                        Nenhum cliente encontrado.
                      </ThemedText>
                    ) : (
                      filteredUsers.map((u, index) => {
                        const displayLine = getUserListLine(u);
                        const key =
                          u.id != null
                            ? String(u.id)
                            : `${displayLine}-${index}`;
                        return (
                          <TouchableOpacity
                            key={key}
                            onPress={() => {
                              setProjectForm((prev) => ({
                                ...prev,
                                customer_name: getUserDisplayName(u),
                              }));
                              setCustomerSearch("");
                              setCustomerDropdownOpen(false);
                            }}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              backgroundColor:
                                projectForm.customer_name ===
                                getUserDisplayName(u)
                                  ? "#e5f3f7"
                                  : "#fff",
                              borderBottomWidth: 1,
                              borderColor: "#f1f5f9",
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
                Prazo (DD/MM/AAAA)
              </ThemedText>
              <TextInput
                value={projectForm.due_date}
                onChangeText={(text) =>
                  setProjectForm((prev) => ({ ...prev, due_date: text }))
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
            <View style={{ marginTop: 12 }}>
              <ThemedText style={{ fontSize: 12, color: "#374151" }}>
                Descrição
              </ThemedText>
              <TextInput
                value={projectForm.description}
                onChangeText={(text) =>
                  setProjectForm((prev) => ({ ...prev, description: text }))
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
                onPress={() => setProjectModalOpen(false)}
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
                onPress={handleCreateProject}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  backgroundColor: primaryButtonBg,
                }}
              >
                <ThemedText
                  style={{ color: primaryButtonText, fontWeight: "600" }}
                >
                  Salvar
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
