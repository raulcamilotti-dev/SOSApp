import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../../theme/styles";

interface ClientInfo {
  id?: string;
  userId?: string;
  cpf?: string;
  fullname?: string;
  email?: string;
  phone?: string;
  role?: string;
}

interface UserGroup {
  cpf: string;
  client: ClientInfo | null;
}

const normalize = (value?: string | null) =>
  (value ?? "").toString().toLowerCase();

const normalizeRole = (value?: string | null) => {
  const role = normalize(value);
  if (role === "admin" || role === "administrator" || role === "adm") {
    return "admin";
  }
  if (role === "client" || role === "cliente" || role === "user") {
    return "client";
  }
  return "client";
};

const mergeClientInfo = (
  primary: ClientInfo | null,
  fallback: ClientInfo | null,
): ClientInfo | null => {
  if (!primary && !fallback) return null;
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    id: primary.id ?? fallback.id,
    userId: primary.userId ?? fallback.userId,
    cpf: primary.cpf ?? fallback.cpf,
    fullname: primary.fullname ?? fallback.fullname,
    email: primary.email ?? fallback.email,
    phone: primary.phone ?? fallback.phone,
    role: primary.role ?? fallback.role,
  };
};

export default function UsersManagementScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [search, setSearch] = useState("");
  const [roleUpdating, setRoleUpdating] = useState<Record<string, boolean>>({});
  const [roleError, setRoleError] = useState<Record<string, string | null>>({});

  const mutedTextColor = useThemeColor({}, "muted");
  const primaryTextColor = useThemeColor({}, "text");
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const inputBackground = useThemeColor({}, "input");
  const cardColor = useThemeColor({}, "card");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const clientsResponse = await api.post(
        "https://n8n.sosescritura.com.br/webhook/client_all",
      );

      const clientsList = Array.isArray(clientsResponse.data)
        ? clientsResponse.data
        : [];

      if (clientsList[0]) {
        console.log("[role-update] client sample", clientsList[0]);
        console.log("[role-update] client keys", Object.keys(clientsList[0]));
      }

      const clients = clientsList
        .map((payload: any): ClientInfo | null => {
          if (!payload) return null;
          const cpf = payload.cpf ?? payload.document ?? payload.cpf_cnpj;
          if (!cpf) return null;
          return {
            id: payload.id,
            userId:
              String(payload.user_id ?? payload.userId ?? payload.id ?? "") ||
              undefined,
            cpf,
            fullname: payload.fullname ?? payload.name,
            email: payload.email,
            phone: payload.phone ?? payload.telefone,
            role:
              payload.role ??
              payload.user_role ??
              payload.userRole ??
              payload.perfil ??
              payload.type,
          };
        })
        .filter((client): client is ClientInfo => !!client);

      const clientMap = new Map<string, ClientInfo | null>(
        clients.map((client) => [client.cpf ?? "", client]),
      );

      const cpfs = Array.from(
        new Set(clients.map((client) => client.cpf ?? "").filter(Boolean)),
      );

      const grouped = cpfs.map((cpf) => {
        return {
          cpf,
          client: mergeClientInfo(clientMap.get(cpf) ?? null, null),
        };
      });

      grouped.sort((a, b) =>
        normalize(a.client?.fullname).localeCompare(
          normalize(b.client?.fullname),
        ),
      );

      setGroups(grouped);
    } catch {
      setError("Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredGroups = useMemo(() => {
    const term = normalize(search);
    if (!term) return groups;
    return groups.filter((group) => {
      const client = group.client;
      const haystack = [
        client?.fullname,
        client?.email,
        client?.phone,
        group.cpf,
      ]
        .map((value) => normalize(value))
        .join(" ");
      return haystack.includes(term);
    });
  }, [groups, search]);

  const handleRoleChange = async (
    cpf: string,
    userId: string | undefined,
    role: "admin" | "client",
  ) => {
    try {
      console.log("[role-update] click", { cpf, userId, role });
      setRoleError((prev) => ({ ...prev, [cpf]: null }));

      setRoleUpdating((prev) => ({ ...prev, [cpf]: true }));

      const resolvedUserId = userId;
      if (!resolvedUserId) {
        console.warn("[role-update] no userId resolved", { cpf });
        setRoleError((prev) => ({
          ...prev,
          [cpf]: "Usuário sem identificação (user_id).",
        }));
        return;
      }

      console.log("[role-update] sending request", {
        endpoint: "https://n8n.sosescritura.com.br/webhook/client_role_update",
        user_id: resolvedUserId,
        role,
      });

      await api.post(
        "https://n8n.sosescritura.com.br/webhook/client_role_update",
        { user_id: resolvedUserId, role },
      );

      console.log("[role-update] request success", {
        user_id: resolvedUserId,
        role,
      });

      setGroups((prev) =>
        prev.map((group) =>
          group.cpf === cpf
            ? {
                ...group,
                client: group.client
                  ? { ...group.client, role, userId: resolvedUserId }
                  : group.client,
              }
            : group,
        ),
      );
    } catch (err) {
      console.error("[role-update] request failed", err);
      setRoleError((prev) => ({
        ...prev,
        [cpf]: "Não foi possível atualizar o perfil.",
      }));
    } finally {
      setRoleUpdating((prev) => ({ ...prev, [cpf]: false }));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ThemedView style={styles.processCard}>
        <ThemedText style={[styles.processTitle, { color: primaryTextColor }]}>
          Gestão de usuários
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Clientes, customers vinculados e imóveis associados.
        </ThemedText>

        <View style={{ marginTop: 12 }}>
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            Pesquisar por cliente, CPF ou imóvel
          </ThemedText>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Ex.: Raul ou Rua das Palmeiras"
            placeholderTextColor={mutedTextColor}
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: inputBackground,
              color: primaryTextColor,
              marginTop: 6,
            }}
          />
        </View>
      </ThemedView>

      {loading ? (
        <ThemedView
          style={[
            styles.container,
            { justifyContent: "center", alignItems: "center" },
          ]}
        >
          <ActivityIndicator size="large" />
        </ThemedView>
      ) : null}

      {error ? (
        <ThemedText style={{ color: tintColor, marginTop: 12 }}>
          {error}
        </ThemedText>
      ) : null}

      {!loading && !error
        ? filteredGroups.map((group) => {
            const role = normalizeRole(group.client?.role);
            const resolvedClient = mergeClientInfo(group.client, null);
            const resolvedUserId = resolvedClient?.userId;
            const displayName =
              resolvedClient?.fullname ||
              resolvedClient?.email ||
              "Cliente não informado";
            return (
              <TouchableOpacity
                key={group.cpf}
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  backgroundColor: cardColor,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: primaryTextColor,
                  }}
                >
                  {displayName}
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  CPF: {group.cpf}
                </ThemedText>
                {resolvedClient?.email ? (
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    {resolvedClient.email}
                  </ThemedText>
                ) : null}
                {resolvedClient?.phone ? (
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    {resolvedClient.phone}
                  </ThemedText>
                ) : null}
                <View
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Perfil:
                  </ThemedText>
                  {["admin", "client"].map((value) => {
                    const selected = role === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        onPress={() =>
                          handleRoleChange(
                            group.cpf,
                            resolvedUserId,
                            value as any,
                          )
                        }
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: selected ? tintColor : borderColor,
                          backgroundColor: selected
                            ? tintColor + "22"
                            : cardColor,
                        }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 12,
                            color: primaryTextColor,
                          }}
                        >
                          {value === "admin" ? "Admin" : "Cliente"}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {roleUpdating[group.cpf] ? (
                  <ActivityIndicator size="small" />
                ) : null}
                {roleError[group.cpf] ? (
                  <ThemedText style={{ fontSize: 12, color: tintColor }}>
                    {roleError[group.cpf]}
                  </ThemedText>
                ) : null}
              </TouchableOpacity>
            );
          })
        : null}
    </ScrollView>
  );
}
