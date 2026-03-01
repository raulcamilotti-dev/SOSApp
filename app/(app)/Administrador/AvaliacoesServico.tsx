import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { filterActive } from "@/core/utils/soft-delete";
import { useSafeTenantId } from "@/hooks/use-safe-tenant-id";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    type CrudFilter,
} from "@/services/crud";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const listRows = async (tenantId?: string): Promise<Row[]> => {
  const filters: CrudFilter[] = [];
  if (tenantId) {
    filters.push({ field: "tenant_id", value: tenantId });
  }
  const response = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_reviews",
    ...buildSearchParams(filters, { sortColumn: "created_at" }),
  });
  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return filterActive(Array.isArray(list) ? (list as Row[]) : []);
};

const createRow = async (payload: Partial<Row>): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "service_reviews",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "service_reviews",
    payload,
  });
  return response.data;
};

export default function AvaliacoesServicoAdminScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    reviewId?: string;
    tenantId?: string;
  }>();
  const reviewIdParam = Array.isArray(params.reviewId)
    ? params.reviewId[0]
    : params.reviewId;
  const tenantIdParam = Array.isArray(params.tenantId)
    ? params.tenantId[0]
    : params.tenantId;
  const { tenantId, isUrlOverride } = useSafeTenantId(tenantIdParam);
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const loadRowsWithRelations = useMemo(() => {
    return async (): Promise<Row[]> => {
      const tenantFilters: CrudFilter[] = tenantId
        ? [{ field: "tenant_id", value: tenantId }]
        : [];
      const [reviewRows, logsResponse] = await Promise.all([
        listRows(tenantId),
        api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "review_logs",
          ...buildSearchParams(tenantFilters),
        }),
      ]);

      const logsRaw = logsResponse.data;
      const logs = filterActive(
        Array.isArray(logsRaw)
          ? (logsRaw as Row[])
          : (((logsRaw as any)?.data ?? []) as Row[]),
      );

      return reviewRows
        .filter((review) => {
          if (reviewIdParam && String(review.id ?? "") !== reviewIdParam) {
            return false;
          }
          return true;
        })
        .map((review) => {
          const reviewId = String(review.id ?? "");
          const logsCount = logs.filter(
            (log) => String(log.review_id ?? "") === reviewId,
          ).length;

          return {
            ...review,
            review_logs_count: logsCount,
          };
        });
    };
  }, [reviewIdParam, tenantId]);

  const createWithContext = useMemo(() => {
    return async (payload: Partial<Row>): Promise<unknown> => {
      return createRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [tenantId]);

  const updateWithContext = useMemo(() => {
    return async (
      payload: Partial<Row> & { id?: string | null },
    ): Promise<unknown> => {
      return updateRow({
        ...payload,
        tenant_id: tenantId ?? payload.tenant_id,
      });
    };
  }, [tenantId]);

  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "tenant_id",
      label: "Tenant",
      type: "reference",
      referenceTable: "tenants",
      referenceLabelField: "company_name",
      referenceSearchField: "company_name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
      visibleInForm: !isUrlOverride,
    },
    {
      key: "service_id",
      label: "Serviço",
      type: "reference",
      referenceTable: "services",
      referenceLabelField: "name",
      referenceSearchField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "partner_id",
      label: "Parceiro",
      type: "reference",
      referenceTable: "partners",
      referenceLabelField: "display_name",
      referenceSearchField: "display_name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "customer_id",
      label: "Cliente",
      type: "reference",
      referenceTable: "customers",
      referenceLabelField: "name",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "appointment_id",
      label: "Agendamento",
      type: "reference",
      referenceTable: "service_appointments",
      referenceLabelField: "scheduled_start",
      referenceSearchField: "scheduled_start",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "rating",
      label: "Nota (1-5)",
      placeholder: "5",
      required: true,
      visibleInList: true,
    },
    { key: "comment", label: "Comentário", type: "multiline" },
    {
      key: "is_public",
      label: "Público",
      placeholder: "true/false",
      visibleInList: true,
    },
    { key: "created_at", label: "Criado em", readOnly: true },
    { key: "deleted_at", label: "Deletado em", readOnly: true },
  ];

  return (
    <CrudScreen<Row>
      title="Avaliações"
      subtitle="Gestão de reviews de serviços"
      fields={fields}
      loadItems={loadRowsWithRelations}
      createItem={createWithContext}
      updateItem={updateWithContext}
      getDetails={(item) => [
        { label: "Tenant", value: String(item.tenant_id ?? "-") },
        { label: "Agendamento", value: String(item.appointment_id ?? "-") },
        { label: "Nota", value: String(item.rating ?? "-") },
        {
          label: "Logs",
          value: String(item.review_logs_count ?? 0),
        },
      ]}
      renderItemActions={(item) => {
        const reviewId = String(item.id ?? "");
        const tenantId = String(item.tenant_id ?? "");
        const logsCount = Number(item.review_logs_count ?? 0);

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/LogsAvaliacoes" as any,
                  params: { reviewId, tenantId },
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
                Logs ({Number.isFinite(logsCount) ? logsCount : 0})
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => {
        const rating = String(item.rating ?? "");
        const created = String(item.created_at ?? "");
        return rating ? `Nota ${rating} · ${created}` : "Avaliação";
      }}
    />
  );
}
