import { ThemedText } from "@/components/themed-text";
import {
    convertTableInfoToFields,
    CrudScreen,
    type CrudFieldConfig,
} from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { formatCpf, validateCpf } from "@/services/brasil-api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { getTableInfo, type TableInfoRow } from "@/services/schema";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Row = Record<string, unknown>;

type CustomersDebugInfo = {
  rawCustomers: number;
  rawUsers: number;
  rawProperties: number;
  propertiesWithCustomerId: number;
  propertiesWithCpf: number;
  filteredCustomers: number;
  customersWithProperties: number;
  excludedNoData: number;
  excludedByCustomerId: number;
  excludedByTenantId: number;
  excludedByUserContext: number;
  context: {
    customerId: string;
    tenantId: string;
    userId: string;
  };
  timestamp: string;
  error?: string;
};

const CUSTOMER_CORE_FIELDS = new Set(["name", "email", "phone", "cpf"]);

const CUSTOMER_LIST_FIELDS = new Set(["name", "email", "phone", "cpf"]);

const normalizeCpf = (value: unknown): string =>
  String(value ?? "").replace(/\D/g, "");

const normalizePhone = (value: unknown): string =>
  String(value ?? "").replace(/\D/g, "");

const canonicalPhone = (value: unknown): string => {
  const digits = normalizePhone(value);
  if (digits.length > 11) return digits.slice(-11);
  return digits;
};

const arePhonesEquivalent = (left: unknown, right: unknown): boolean => {
  const leftCanonical = canonicalPhone(left);
  const rightCanonical = canonicalPhone(right);
  if (!leftCanonical || !rightCanonical) return false;
  return leftCanonical === rightCanonical;
};

const normalizeEmail = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const hasMeaningfulCustomerData = (row: Row): boolean => {
  const keys = ["name", "email", "phone", "cpf"];
  return keys.some((key) => {
    const value = row[key];
    if (value === null || value === undefined) return false;
    return String(value).trim().length > 0;
  });
};

/** PT-BR label map for customer fields */
const CUSTOMER_LABELS: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  cpf: "CPF",
  tenant_id: "Tenant",
  user_id: "Usuário vinculado",
};

/** Wrap shared convertTableInfoToFields with customer-specific visibility overrides */
const convertCustomerFields = (
  tableInfo: TableInfoRow[],
): CrudFieldConfig<Row>[] => {
  return convertTableInfoToFields(tableInfo).map((f) => ({
    ...f,
    label: CUSTOMER_LABELS[f.key] ?? f.label,
    visibleInForm: CUSTOMER_CORE_FIELDS.has(f.key),
    visibleInList: CUSTOMER_LIST_FIELDS.has(f.key),
  }));
};

const listRows = async (tenantId?: string | null): Promise<Row[]> => {
  const filters = tenantId ? [{ field: "tenant_id", value: tenantId }] : [];
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "customers",
    ...buildSearchParams(filters, { sortColumn: "name" }),
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const listUserTenants = async (): Promise<Row[]> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "user_tenants",
  });
  return normalizeList(response.data);
};

const normalizeList = (data: unknown): Row[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "customers",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "customers",
    payload,
  });
  return response.data;
};

export default function CustomersAdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const params = useLocalSearchParams<{
    userId?: string;
    tenantId?: string;
    customerId?: string;
  }>();
  const userIdParam = Array.isArray(params.userId)
    ? params.userId[0]
    : params.userId;
  const tenantIdParam = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const customerIdParam = Array.isArray(params.customerId)
    ? params.customerId[0]
    : params.customerId;

  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<CrudFieldConfig<Row>[]>([]);
  const [debugInfo, setDebugInfo] = useState<CustomersDebugInfo | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const info = await getTableInfo("customers");
        setFields(convertCustomerFields(info));
      } catch {
        setFields([
          {
            key: "name",
            label: "Nome",
            visibleInList: true,
            visibleInForm: true,
          },
          {
            key: "email",
            label: "E-mail",
            visibleInList: true,
            visibleInForm: true,
          },
          {
            key: "phone",
            label: "Telefone",
            visibleInList: true,
            visibleInForm: true,
          },
          {
            key: "cpf",
            label: "CPF",
            visibleInList: true,
            visibleInForm: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadRowsWithContext = useMemo(() => {
    return async (): Promise<Row[]> => {
      try {
        const [customersRows, usersRes, propertiesRes, userTenantsRows] =
          await Promise.all([
            listRows(tenantIdParam || tenantId),
            api.post(CRUD_ENDPOINT, {
              action: "list",
              table: "users",
              ...buildSearchParams([], { sortColumn: "fullname" }),
            }),
            api.post(CRUD_ENDPOINT, {
              action: "list",
              table: "properties",
              ...buildSearchParams([], { sortColumn: "created_at" }),
            }),
            userIdParam ? listUserTenants() : Promise.resolve([]),
          ]);

        const users = normalizeList(usersRes.data);
        const properties = normalizeList(propertiesRes.data);

        const relatedTenantIds = new Set<string>();
        if (userIdParam) {
          const directUser = users.find(
            (row) => String(row.id ?? "") === userIdParam,
          );
          const directTenantId = String(directUser?.tenant_id ?? "");
          if (directTenantId) relatedTenantIds.add(directTenantId);

          for (const row of userTenantsRows) {
            if (String(row.user_id ?? "") !== userIdParam) continue;
            const rowTenantId = String(row.tenant_id ?? "");
            if (rowTenantId) relatedTenantIds.add(rowTenantId);
          }
        }

        let excludedNoData = 0;
        let excludedByCustomerId = 0;
        let excludedByTenantId = 0;
        let excludedByUserContext = 0;

        const filteredCustomers = customersRows.filter((item) => {
          if (!customerIdParam && !hasMeaningfulCustomerData(item)) {
            excludedNoData += 1;
            return false;
          }

          if (customerIdParam && String(item.id ?? "") !== customerIdParam) {
            excludedByCustomerId += 1;
            return false;
          }
          if (tenantIdParam && String(item.tenant_id ?? "") !== tenantIdParam) {
            excludedByTenantId += 1;
            return false;
          }

          if (userIdParam && !tenantIdParam) {
            const rowUserId = String(item.user_id ?? "");
            if (rowUserId && rowUserId === userIdParam) return true;

            const rowTenantId = String(item.tenant_id ?? "");
            if (rowTenantId && relatedTenantIds.has(rowTenantId)) return true;

            excludedByUserContext += 1;
            return false;
          }

          return true;
        });

        const mappedCustomers = filteredCustomers.map((customer) => {
          const customerId = String(customer.id ?? "");
          const customerUserId = String(customer.user_id ?? "");
          const customerCpfDigits = normalizeCpf(customer.cpf);
          const customerPhoneDigits = canonicalPhone(customer.phone);
          const customerEmailNorm = normalizeEmail(customer.email);

          const relatedUsers = users.filter((user) => {
            const userId = String(user.id ?? "");
            const userCustomerId = String(user.customer_id ?? "");
            const userCpfDigits = normalizeCpf(user.cpf);
            const userPhoneDigits = canonicalPhone(user.phone);
            const userEmailNorm = normalizeEmail(user.email);

            if (userCustomerId && userCustomerId === customerId) return true;
            if (customerUserId && userId && userId === customerUserId)
              return true;
            if (customerCpfDigits && userCpfDigits === customerCpfDigits)
              return true;
            if (
              customerPhoneDigits &&
              userPhoneDigits &&
              arePhonesEquivalent(customerPhoneDigits, userPhoneDigits)
            )
              return true;
            if (customerEmailNorm && userEmailNorm === customerEmailNorm)
              return true;

            return false;
          });

          const preferredUser = relatedUsers[0];
          const effectiveCpfDigits =
            customerCpfDigits || normalizeCpf(preferredUser?.cpf);
          const effectiveName =
            String(customer.name ?? "").trim() ||
            String(preferredUser?.fullname ?? "").trim();
          const effectiveEmail =
            String(customer.email ?? "").trim() ||
            String(preferredUser?.email ?? "").trim();
          const effectivePhone =
            String(customer.phone ?? "").trim() ||
            String(preferredUser?.phone ?? "").trim();
          const effectiveUserId =
            customerUserId || String(preferredUser?.id ?? "").trim();

          const usersCount = relatedUsers.length;

          const propertiesCount = properties.filter((property) => {
            const propertyCustomerId = String(property.customer_id ?? "");
            if (propertyCustomerId) return propertyCustomerId === customerId;

            const propertyCpfDigits = normalizeCpf(property.cpf);
            return Boolean(
              effectiveCpfDigits && propertyCpfDigits === effectiveCpfDigits,
            );
          }).length;

          return {
            ...customer,
            name: effectiveName || customer.name,
            email: effectiveEmail || customer.email,
            phone: effectivePhone || customer.phone,
            cpf: effectiveCpfDigits || customer.cpf,
            user_id: effectiveUserId || customer.user_id,
            _effective_cpf: effectiveCpfDigits,
            users_count: usersCount,
            properties_count: propertiesCount,
          };
        });

        const mergedByIdentity = new Map<string, Row>();
        for (const customer of mappedCustomers) {
          const cpfKey = normalizeCpf(customer._effective_cpf ?? customer.cpf);
          const emailKey = normalizeEmail(customer.email);
          const phoneKey = canonicalPhone(customer.phone);
          const identityKey = cpfKey
            ? `cpf:${cpfKey}`
            : emailKey
              ? `email:${emailKey}`
              : phoneKey
                ? `phone:${phoneKey}`
                : `id:${String((customer as Row).id ?? "")}`;

          const existing = mergedByIdentity.get(identityKey);
          if (!existing) {
            mergedByIdentity.set(identityKey, customer);
            continue;
          }

          const existingProps = Number(existing.properties_count ?? 0);
          const nextProps = Number(customer.properties_count ?? 0);
          const existingUsers = Number(existing.users_count ?? 0);
          const nextUsers = Number(customer.users_count ?? 0);

          const preferred =
            nextProps > existingProps ||
            (nextProps === existingProps && nextUsers > existingUsers)
              ? customer
              : existing;
          const secondary = preferred === customer ? existing : customer;

          mergedByIdentity.set(identityKey, {
            ...secondary,
            ...preferred,
            users_count: Math.max(existingUsers, nextUsers),
            properties_count: Math.max(existingProps, nextProps),
          });
        }

        const consolidatedCustomers = Array.from(mergedByIdentity.values());

        const propertiesWithCustomerId = properties.filter((property) =>
          Boolean(String(property.customer_id ?? "").trim()),
        ).length;
        const propertiesWithCpf = properties.filter((property) =>
          Boolean(String(property.cpf ?? "").trim()),
        ).length;
        const customersWithProperties = consolidatedCustomers.filter(
          (customer) => Number(customer.properties_count ?? 0) > 0,
        ).length;

        const info: CustomersDebugInfo = {
          rawCustomers: customersRows.length,
          rawUsers: users.length,
          rawProperties: properties.length,
          propertiesWithCustomerId,
          propertiesWithCpf,
          filteredCustomers: consolidatedCustomers.length,
          customersWithProperties,
          excludedNoData,
          excludedByCustomerId,
          excludedByTenantId,
          excludedByUserContext,
          context: {
            customerId: customerIdParam ?? "",
            tenantId: tenantIdParam ?? "",
            userId: userIdParam ?? "",
          },
          timestamp: new Date().toISOString(),
        };

        setDebugInfo(info);
        console.log("[customers-debug]", info);

        return consolidatedCustomers;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        const info: CustomersDebugInfo = {
          rawCustomers: 0,
          rawUsers: 0,
          rawProperties: 0,
          propertiesWithCustomerId: 0,
          propertiesWithCpf: 0,
          filteredCustomers: 0,
          customersWithProperties: 0,
          excludedNoData: 0,
          excludedByCustomerId: 0,
          excludedByTenantId: 0,
          excludedByUserContext: 0,
          context: {
            customerId: customerIdParam ?? "",
            tenantId: tenantIdParam ?? "",
            userId: userIdParam ?? "",
          },
          timestamp: new Date().toISOString(),
          error: message,
        };
        setDebugInfo(info);
        console.log("[customers-debug:error]", info);
        throw error;
      }
    };
  }, [customerIdParam, tenantIdParam, userIdParam]);

  const subtitle = useMemo(() => {
    if (!debugInfo) return "Gestão de clientes";
    const count = debugInfo.filteredCustomers;
    return `${count} ${count === 1 ? "cliente" : "clientes"}`;
  }, [debugInfo]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      // Auto-link user_id by CPF match
      let userId = payload.user_id ?? userIdParam;
      const cpfDigits = normalizeCpf(payload.cpf);
      if (!userId && cpfDigits) {
        try {
          const usersRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "users",
            ...buildSearchParams([
              { field: "cpf", value: cpfDigits, operator: "equal" },
            ]),
          });
          const matched = normalizeList(usersRes.data);
          if (matched.length > 0) userId = String(matched[0].id ?? "");
        } catch {
          /* best-effort */
        }
      }
      return createRow({
        ...payload,
        tenant_id: tenantIdParam ?? tenantId ?? payload.tenant_id,
        user_id: userId || undefined,
      });
    };
  }, [tenantIdParam, tenantId, userIdParam]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      // Auto-link user_id by CPF match when not already set
      let userId = payload.user_id ?? userIdParam;
      const cpfDigits = normalizeCpf(payload.cpf);
      if (!userId && cpfDigits) {
        try {
          const usersRes = await api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "users",
            ...buildSearchParams([
              { field: "cpf", value: cpfDigits, operator: "equal" },
            ]),
          });
          const matched = normalizeList(usersRes.data);
          if (matched.length > 0) userId = String(matched[0].id ?? "");
        } catch {
          /* best-effort */
        }
      }
      return updateRow({
        ...payload,
        tenant_id: tenantIdParam ?? tenantId ?? payload.tenant_id,
        user_id: userId || undefined,
      });
    };
  }, [tenantIdParam, tenantId, userIdParam]);

  const contextualFields = useMemo(() => {
    return fields.map((field) => {
      // Always hide tenant_id and user_id — they are auto-filled
      if (field.key === "tenant_id" || field.key === "user_id") {
        return { ...field, visibleInForm: false };
      }
      return field;
    });
  }, [fields]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <CrudScreen<Row>
      title="Clientes"
      subtitle={subtitle}
      searchPlaceholder="Buscar cliente..."
      fields={contextualFields}
      loadItems={loadRowsWithContext}
      createItem={createWithContext}
      updateItem={updateWithContext}
      renderCustomField={(field, value, onChange) => {
        if (field.key === "cpf") {
          const digits = value.replace(/\D/g, "");
          const isValid = digits.length === 11 ? validateCpf(digits) : true;
          return (
            <View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <TextInput
                  value={formatCpf(value)}
                  onChangeText={(text) => {
                    const cleaned = text.replace(/\D/g, "").slice(0, 11);
                    onChange(formatCpf(cleaned));
                  }}
                  maxLength={14}
                  keyboardType="numeric"
                  placeholder="000.000.000-00"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: !isValid ? "#ef4444" : borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: tintColor,
                    fontSize: 14,
                  }}
                />
                {digits.length === 11 && (
                  <Ionicons
                    name={isValid ? "checkmark-circle" : "close-circle"}
                    size={20}
                    color={isValid ? "#22c55e" : "#ef4444"}
                  />
                )}
              </View>
              {!isValid && digits.length === 11 && (
                <ThemedText
                  style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}
                >
                  CPF inválido
                </ThemedText>
              )}
            </View>
          );
        }
        return null;
      }}
      getDetails={(item) => [
        { label: "Nome", value: String(item.name ?? "-") },
        { label: "E-mail", value: String(item.email ?? "-") },
        { label: "Telefone", value: String(item.phone ?? "-") },
        { label: "CPF", value: String(item.cpf ?? "-") },
        { label: "Tenant", value: String(item.tenant_id ?? "-") },
        { label: "Usuário", value: String(item.user_id ?? "-") },
        { label: "Usuários", value: String(item.users_count ?? 0) },
        { label: "Imóveis", value: String(item.properties_count ?? 0) },
      ]}
      renderItemActions={(item) => {
        const customerId = String(item.id ?? "");
        const tenantId = String(item.tenant_id ?? "");
        const userId = String(item.user_id ?? "");
        const customerCpf = String(
          item._effective_cpf ?? item.cpf ?? "",
        ).trim();
        const usersCount = Number(item.users_count ?? 0);
        const propertiesCount = Number(item.properties_count ?? 0);

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/gestao-de-usuarios" as any,
                  params: {
                    tenantId,
                    ...(userId || userIdParam
                      ? { userId: userId || userIdParam }
                      : {}),
                  },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                Usuários ({Number.isFinite(usersCount) ? usersCount : 0})
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/customer-properties" as any,
                  params: {
                    customerId,
                    tenantId,
                    ...(customerCpf ? { customerCpf } : {}),
                    ...(userId || userIdParam
                      ? { userId: userId || userIdParam }
                      : {}),
                    customerName: String(item.name ?? "").trim(),
                  },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                Imóveis (
                {Number.isFinite(propertiesCount) ? propertiesCount : 0})
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/customer-processes" as any,
                  params: {
                    customerId,
                    tenantId,
                    customerName: String(item.name ?? "").trim(),
                  },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                📋 Processos
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/customer-sales" as any,
                  params: {
                    customerId,
                    tenantId,
                    customerName: String(item.name ?? "").trim(),
                  },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                💳 Vendas
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/customer-quotes" as any,
                  params: {
                    customerId,
                    tenantId,
                    customerName: String(item.name ?? "").trim(),
                  },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                📋 Orçamentos
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/customer-payments" as any,
                  params: {
                    customerId,
                    tenantId,
                    customerName: String(item.name ?? "").trim(),
                  },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                💰 Pagamentos
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/customer-contracts" as any,
                  params: {
                    customerId,
                    tenantId,
                    customerName: String(item.name ?? "").trim(),
                  },
                })
              }
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{ color: tintColor, fontWeight: "700", fontSize: 12 }}
              >
                📄 Contratos
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const name = String(item.name ?? "").trim();
        const email = String(item.email ?? "").trim();
        const cpf = String(item.cpf ?? "").trim();
        if (name) return name;
        if (email) return email;
        if (cpf) return `CPF ${cpf}`;
        return "Cliente";
      }}
    />
  );
}
