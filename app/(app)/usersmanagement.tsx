import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { styles } from "../theme/styles";

interface Property {
  id: string;
  cpf?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  [key: string]: any;
}

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
  properties: Property[];
}

export default function UsersManagementScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [roleUpdating, setRoleUpdating] = useState<Record<string, boolean>>({});
  const [roleError, setRoleError] = useState<Record<string, string | null>>({});

  const mutedTextColor = useThemeColor(
    { light: "#374151", dark: "#374151" },
    "text",
  );
  const primaryTextColor = useThemeColor(
    { light: "#0b0b0b", dark: "#0b0b0b" },
    "text",
  );
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({ light: "#e0e0e0", dark: "#333" }, "text");

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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.post(
        "https://n8n.sosescritura.com.br/webhook/property_list_allclients",
      );
      const list = Array.isArray(response.data) ? response.data : [];

      const properties: Property[] = list;
      const cpfs = Array.from(
        new Set(
          properties
            .map((item) => item.cpf)
            .filter((cpf): cpf is string => !!cpf),
        ),
      );

      const clientResults = await Promise.all(
        cpfs.map(async (cpf) => {
          try {
            const clientResponse = await api.post(
              "https://n8n.sosescritura.com.br/webhook/client_info",
              { cpf },
            );
            const data = clientResponse.data;
            const payload = Array.isArray(data) ? data[0] : data;
            const client: ClientInfo | null = payload
              ? {
                  id: payload.id,
                  userId:
                    String(
                      payload.user_id ?? payload.userId ?? payload.id ?? "",
                    ) || undefined,
                  cpf: payload.cpf ?? cpf,
                  fullname: payload.fullname,
                  email: payload.email,
                  phone: payload.phone,
                  role:
                    payload.role ??
                    payload.user_role ??
                    payload.userRole ??
                    payload.perfil ??
                    payload.type,
                }
              : null;
            return { cpf, client };
          } catch {
            return { cpf, client: null };
          }
        }),
      );

      const clientMap = new Map<string, ClientInfo | null>(
        clientResults.map((item) => [item.cpf, item.client]),
      );

      const grouped = cpfs.map((cpf) => ({
        cpf,
        client: clientMap.get(cpf) ?? null,
        properties: properties.filter((property) => property.cpf === cpf),
      }));

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
        ...group.properties.map((p) => p.address),
        ...group.properties.map((p) => p.city),
      ]
        .map((value) => normalize(value))
        .join(" ");
      return haystack.includes(term);
    });
  }, [groups, search]);

  const toggleGroup = (cpf: string) => {
    setExpanded((prev) => ({ ...prev, [cpf]: !prev[cpf] }));
  };

  const handleRoleChange = async (
    cpf: string,
    userId: string | undefined,
    role: "admin" | "client",
  ) => {
    try {
      setRoleError((prev) => ({ ...prev, [cpf]: null }));

      if (!userId) {
        setRoleError((prev) => ({
          ...prev,
          [cpf]: "Usuário sem identificação (user_id).",
        }));
        return;
      }

      setRoleUpdating((prev) => ({ ...prev, [cpf]: true }));

      await api.post(
        "https://n8n.sosescritura.com.br/webhook/user_role_update",
        { user_id: userId, role },
      );

      setGroups((prev) =>
        prev.map((group) =>
          group.cpf === cpf
            ? {
                ...group,
                client: group.client ? { ...group.client, role } : group.client,
              }
            : group,
        ),
      );
    } catch {
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
            placeholderTextColor="#6b7280"
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: "#ffffff",
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
          <ThemedText style={{ marginTop: 12 }}>Carregando...</ThemedText>
        </ThemedView>
      ) : error ? (
        <ThemedView style={styles.processCard}>
          <ThemedText style={{ color: "#d11a2a" }}>{error}</ThemedText>
        </ThemedView>
      ) : filteredGroups.length === 0 ? (
        <ThemedView style={styles.processCard}>
          <ThemedText style={{ color: mutedTextColor }}>
            Nenhum resultado encontrado.
          </ThemedText>
        </ThemedView>
      ) : (
        filteredGroups.map((group) => (
          <ThemedView key={group.cpf} style={styles.processCard}>
            <TouchableOpacity onPress={() => toggleGroup(group.cpf)}>
              <ThemedText
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: primaryTextColor,
                }}
              >
                {group.client?.fullname || "Cliente não informado"}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                CPF: {group.cpf}
              </ThemedText>
              {group.client?.email ? (
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  {group.client.email}
                </ThemedText>
              ) : null}
              {group.client?.phone ? (
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  {group.client.phone}
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
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["client", "admin"].map((role) => {
                    const isActive = normalizeRole(group.client?.role) === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        onPress={() =>
                          handleRoleChange(
                            group.cpf,
                            group.client?.userId,
                            role as "admin" | "client",
                          )
                        }
                        disabled={roleUpdating[group.cpf]}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: isActive ? tintColor : borderColor,
                          backgroundColor: isActive ? tintColor : "transparent",
                          opacity: roleUpdating[group.cpf] ? 0.6 : 1,
                        }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: isActive ? "#ffffff" : primaryTextColor,
                          }}
                        >
                          {role === "admin" ? "Admin" : "Cliente"}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {roleUpdating[group.cpf] ? (
                  <ActivityIndicator size="small" />
                ) : null}
              </View>
              {roleError[group.cpf] ? (
                <ThemedText style={{ fontSize: 12, color: "#d11a2a" }}>
                  {roleError[group.cpf]}
                </ThemedText>
              ) : null}
              <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                Imóveis: {group.properties.length}
              </ThemedText>
            </TouchableOpacity>

            {expanded[group.cpf] && (
              <View
                style={{
                  marginTop: 12,
                  borderTopWidth: 1,
                  borderColor,
                  paddingTop: 12,
                  gap: 8,
                }}
              >
                {group.properties.map((property) => (
                  <View
                    key={property.id}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor,
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <ThemedText style={{ fontWeight: "600" }}>
                      {property.address || "Imóvel"}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      {property.city || ""} {property.state || ""}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </ThemedView>
        ))
      )}
    </ScrollView>
  );
}
