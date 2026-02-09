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

  const mutedTextColor = useThemeColor({}, "muted");
  const primaryTextColor = useThemeColor({}, "text");
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");
  const inputBackground = useThemeColor({}, "input");
  const cardColor = useThemeColor({}, "card");

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

  const resolveUserIdFromProperty = (property: Property) =>
    String(
      property.user_id ??
        property.user?.id ??
        property.client?.user_id ??
        property.client?.id ??
        property.customer?.user_id ??
        property.customer?.id ??
        property.client_id ??
        property.customer_id ??
        "",
    ) || undefined;

  const resolveClientFromProperty = useCallback((
    property?: Property,
  ): ClientInfo | null => {
    if (!property) return null;
    const userId = resolveUserIdFromProperty(property);
    const fullname =
      property.fullname ??
      property.name ??
      property.client_name ??
      property.customer_name ??
      property.owner_name ??
      property.client?.name ??
      property.customer?.name;
    const email =
      property.email ??
      property.client_email ??
      property.customer_email ??
      property.client?.email ??
      property.customer?.email;
    const phone =
      property.phone ??
      property.telefone ??
      property.client?.phone ??
      property.customer?.phone;
    return {
      id: property.id,
      userId,
      cpf: property.cpf ?? undefined,
      fullname: fullname ?? undefined,
      email: email ?? undefined,
      phone: phone ?? undefined,
      role: property.role ?? property.perfil ?? property.type,
    };
  }, []);

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
              "https://n8n.sosescritura.com.br/webhook/client_role_update",
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

      const grouped = cpfs.map((cpf) => {
        const cpfProperties = properties.filter(
          (property) => property.cpf === cpf,
        );
        const fallbackClient =
          cpfProperties
            .map((property) => resolveClientFromProperty(property))
            .find((client) =>
              Boolean(client?.fullname || client?.email || client?.userId),
            ) ?? null;

        return {
          cpf,
          client: mergeClientInfo(clientMap.get(cpf) ?? null, fallbackClient),
          properties: cpfProperties,
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
  }, [resolveClientFromProperty]);

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
            const fallbackClient =
              group.properties
                .map((property) => resolveClientFromProperty(property))
                .find((client) =>
                  Boolean(client?.fullname || client?.email || client?.userId),
                ) ?? null;
            const resolvedClient = mergeClientInfo(
              group.client,
              fallbackClient,
            );
            const resolvedUserId =
              resolvedClient?.userId ??
              group.properties
                .map((property) => resolveUserIdFromProperty(property))
                .find((value) => !!value);
            const displayName =
              resolvedClient?.fullname ||
              resolvedClient?.email ||
              "Cliente não informado";
            return (
              <TouchableOpacity
                key={group.cpf}
                onPress={() => toggleGroup(group.cpf)}
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
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  Imóveis: {group.properties.length}
                </ThemedText>

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
                      <View key={property.id}>
                        <ThemedText
                          style={{ fontSize: 12, color: mutedTextColor }}
                        >
                          {property.address || "Imóvel"} - {property.city || ""}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        : null}
    </ScrollView>
  );
}
