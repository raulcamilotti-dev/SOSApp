import { ThemedText } from "@/components/themed-text";
import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

type Row = Record<string, unknown>;

const normalizeList = (data: unknown): Row[] => {
  const list = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return Array.isArray(list) ? (list as Row[]) : [];
};

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

const formatDate = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("pt-BR");
};

const listRows = async (tenantId?: string | null): Promise<Row[]> => {
  const tenantFilters = tenantId
    ? buildSearchParams([{ field: "tenant_id", value: tenantId }])
    : {};
  const [
    partnersResponse,
    availabilityResponse,
    timeOffResponse,
    ratingsResponse,
  ] = await Promise.all([
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "partners",
      ...tenantFilters,
    }),
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "partner_availability",
    }),
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "partner_time_off",
    }),
    api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "partner_rating_summary",
    }),
  ]);

  const partners = filterActive(normalizeList(partnersResponse.data));
  const availability = filterActive(normalizeList(availabilityResponse.data));
  const timeOff = filterActive(normalizeList(timeOffResponse.data));
  const ratings = filterActive(normalizeList(ratingsResponse.data));

  const availabilityByPartner = new Map<string, Row[]>();
  for (const row of availability) {
    const partnerId = String(row.partner_id ?? "");
    if (!partnerId) continue;
    const list = availabilityByPartner.get(partnerId) ?? [];
    list.push(row);
    availabilityByPartner.set(partnerId, list);
  }

  const timeOffByPartner = new Map<string, Row[]>();
  for (const row of timeOff) {
    const partnerId = String(row.partner_id ?? "");
    if (!partnerId) continue;
    const list = timeOffByPartner.get(partnerId) ?? [];
    list.push(row);
    timeOffByPartner.set(partnerId, list);
  }

  const ratingByPartner = new Map<string, Row>();
  for (const row of ratings) {
    const partnerId = String(row.partner_id ?? "");
    if (!partnerId) continue;
    ratingByPartner.set(partnerId, row);
  }

  return partners.map((partner) => {
    const partnerId = String(partner.id ?? "");
    const partnerAvailability = availabilityByPartner.get(partnerId) ?? [];
    const partnerTimeOff = timeOffByPartner.get(partnerId) ?? [];
    const partnerRating = ratingByPartner.get(partnerId);

    const availabilitySummary = partnerAvailability
      .sort((a, b) => Number(a.weekday ?? 0) - Number(b.weekday ?? 0))
      .map((row) => {
        const weekday = Number(row.weekday ?? -1);
        const day = WEEKDAY_LABELS[weekday] ?? String(row.weekday ?? "?");
        const start = String(row.start_time ?? "").trim();
        const end = String(row.end_time ?? "").trim();
        return `${day} ${start}-${end}`;
      })
      .join(" · ");

    const upcomingTimeOff = partnerTimeOff
      .sort(
        (a, b) =>
          new Date(String(a.start_date ?? "")).getTime() -
          new Date(String(b.start_date ?? "")).getTime(),
      )
      .slice(0, 3)
      .map((row) => {
        const start = formatDate(row.start_date);
        const end = formatDate(row.end_date);
        const reason = String(row.reason ?? "").trim();
        return reason ? `${start}→${end} (${reason})` : `${start}→${end}`;
      })
      .join(" · ");

    const avgRatingRaw = Number(partnerRating?.avg_rating ?? 0);
    const totalReviewsRaw = Number(partnerRating?.total_reviews ?? 0);
    const avgRating = Number.isFinite(avgRatingRaw)
      ? avgRatingRaw.toFixed(2)
      : "0.00";
    const totalReviews = Number.isFinite(totalReviewsRaw)
      ? String(totalReviewsRaw)
      : "0";

    return {
      ...partner,
      partner_availability_count: partnerAvailability.length,
      partner_time_off_count: partnerTimeOff.length,
      partner_rating_count: Number(totalReviews),
      partner_availability_summary:
        availabilitySummary || "Sem disponibilidade cadastrada",
      partner_time_off_summary: upcomingTimeOff || "Sem folgas cadastradas",
      partner_rating_summary: `${avgRating} (${totalReviews} avaliações)`,
    };
  });
};

const createRow = async (
  payload: Partial<Row>,
  tenantId?: string | null,
  userId?: string | null,
): Promise<unknown> => {
  if (tenantId) payload.tenant_id = tenantId;
  if (userId) payload.created_by = userId;
  const response = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "partners",
    payload,
  });
  return response.data;
};

const updateRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  const response = await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "partners",
    payload,
  });
  return response.data;
};

export default function ParceirosAdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  const loadFilteredRows = useMemo(() => () => listRows(tenantId), [tenantId]);

  const createRowBound = useMemo(
    () => (payload: Partial<Row>) => createRow(payload, tenantId, user?.id),
    [tenantId, user?.id],
  );

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
      visibleInList: false,
      visibleInForm: false,
    },
    {
      key: "user_id",
      label: "Usuário",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
      required: true,
      visibleInList: true,
    },
    {
      key: "display_name",
      label: "Nome do parceiro",
      placeholder: "Ex: João Silva",
      visibleInList: true,
    },
    {
      key: "is_active",
      label: "Ativo",
      type: "boolean",
      visibleInList: true,
    },
    {
      key: "pix_key",
      label: "Chave PIX",
      placeholder: "CPF, email, telefone ou chave aleatória",
      section: "Dados Financeiros",
    },
    {
      key: "pix_key_type",
      label: "Tipo da Chave PIX",
      type: "select",
      options: [
        { label: "CPF", value: "cpf" },
        { label: "CNPJ", value: "cnpj" },
        { label: "E-mail", value: "email" },
        { label: "Telefone", value: "phone" },
        { label: "Chave Aleatória", value: "random" },
      ],
    },
    {
      key: "bank_name",
      label: "Banco",
      placeholder: "Ex: Nubank, Itaú, Bradesco",
    },
    {
      key: "created_by",
      label: "Criado por",
      type: "reference",
      referenceTable: "users",
      referenceLabelField: "fullname",
      referenceSearchField: "fullname",
      referenceIdField: "id",
      readOnly: true,
      visibleInForm: false,
    },
    {
      key: "created_at",
      label: "Criado em",
      readOnly: true,
      visibleInForm: false,
    },
    {
      key: "updated_at",
      label: "Atualizado em",
      readOnly: true,
      visibleInForm: false,
    },
    {
      key: "deleted_at",
      label: "Deletado em",
      readOnly: true,
      visibleInForm: false,
    },
  ];

  return (
    <CrudScreen<Row>
      title="Parceiros"
      subtitle="Gestão de parceiros com disponibilidade, folgas e média de avaliações"
      fields={fields}
      loadItems={loadFilteredRows}
      createItem={createRowBound}
      updateItem={updateRow}
      getDetails={(item) => [
        { label: "Tenant", value: String(item.tenant_id ?? "-") },
        { label: "Usuário", value: String(item.user_id ?? "-") },
        { label: "Nome do parceiro", value: String(item.display_name ?? "-") },
        {
          label: "Ativo",
          value:
            item.is_active === true ||
            String(item.is_active).toLowerCase() === "true"
              ? "Ativo"
              : "Inativo",
        },
        {
          label: "PIX",
          value: item.pix_key
            ? `${String(item.pix_key)} (${String(item.pix_key_type ?? "").toUpperCase()})`
            : "Não cadastrado",
        },
        {
          label: "Banco",
          value: String(item.bank_name ?? "-"),
        },
        {
          label: "Disponibilidade",
          value: String(
            item.partner_availability_summary ??
              "Sem disponibilidade cadastrada",
          ),
        },
        {
          label: "Folgas",
          value: String(
            item.partner_time_off_summary ?? "Sem folgas cadastradas",
          ),
        },
        {
          label: "Média",
          value: String(item.partner_rating_summary ?? "0.00 (0 avaliações)"),
        },
      ]}
      renderItemActions={(item) => {
        const partnerId = String(item.id ?? "");
        const tenantId = String(item.tenant_id ?? "");
        const availabilityCount = Number(item.partner_availability_count ?? 0);
        const timeOffCount = Number(item.partner_time_off_count ?? 0);
        const ratingCount = Number(item.partner_rating_count ?? 0);

        return (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/DisponibilidadeParceiro" as any,
                  params: { partnerId, tenantId },
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
                Disponibilidade (
                {Number.isFinite(availabilityCount) ? availabilityCount : 0})
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/FolgasParceiro" as any,
                  params: { partnerId, tenantId },
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
                Folgas ({Number.isFinite(timeOffCount) ? timeOffCount : 0})
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Administrador/ResumoAvaliacaoParceiro" as any,
                  params: { partnerId, tenantId },
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
                Média ({Number.isFinite(ratingCount) ? ratingCount : 0})
              </ThemedText>
            </TouchableOpacity>
          </View>
        );
      }}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.display_name ?? "Parceiro")}
    />
  );
}
