/**
 * CONTEÚDO PÚBLICO — Blog Posts & Landing Pages
 *
 * CrudScreen para gestão de conteúdo público. Cada tenant pode publicar
 * blog posts e landing pages com CTA (formulário de captação de leads).
 *
 * URLs públicas:
 *   Blog listing:  /blog/{tenantSlug}
 *   Blog post:     /blog/{tenantSlug}/{slug}
 *   Landing page:  /lp/{tenantSlug}/{slug}
 */

import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    BLOG_CATEGORIES,
    buildPageUrl,
    calculateReadingTime,
    generatePageSlug,
    getPageTypeLabel,
    getStatusConfig,
    PAGE_STATUSES,
    PAGE_TYPES,
    TEMPLATE_KEYS,
    type ContentPage,
} from "@/services/content-pages";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useMemo, useState } from "react";
import {
    Alert,
    Platform,
    Text,
    ToastAndroid,
    TouchableOpacity,
    View,
} from "react-native";

type DetailItem = { label: string; value: string };
type Row = Record<string, unknown>;

export default function ContentPagesScreen() {
  const { user } = useAuth();
  const tintColor = useThemeColor({}, "tint");
  const tenantId = user?.tenant_id ?? "";
  const [tenantSlug, setTenantSlug] = useState<string>("");

  // Resolve tenant slug for URL building
  useMemo(() => {
    if (!tenantId) return;
    api
      .post(CRUD_ENDPOINT, {
        action: "list",
        table: "tenants",
        ...buildSearchParams([{ field: "id", value: tenantId }]),
        fields: ["id", "slug"],
      })
      .then((res) => {
        const tenants = normalizeCrudList<Record<string, unknown>>(res.data);
        if (tenants.length > 0 && tenants[0].slug) {
          setTenantSlug(String(tenants[0].slug));
        }
      })
      .catch(() => {});
  }, [tenantId]);

  /* ─── Copy URL ─── */
  const copyUrl = useCallback(
    async (page: Row) => {
      if (!tenantSlug) {
        Alert.alert(
          "Slug não configurado",
          "Configure o slug da empresa em Gestão da Organização.",
        );
        return;
      }
      const url = buildPageUrl(tenantSlug, {
        page_type: String(
          page.page_type ?? "blog_post",
        ) as ContentPage["page_type"],
        slug: String(page.slug ?? ""),
      });
      if (Platform.OS === "web") {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          /* ignore */
        }
      } else {
        await Clipboard.setStringAsync(url);
      }
      if (Platform.OS === "android") {
        ToastAndroid.show("Link copiado!", ToastAndroid.SHORT);
      } else {
        Alert.alert("Link copiado!", url);
      }
    },
    [tenantSlug],
  );

  /* ─── Fields ─── */
  const fields: CrudFieldConfig<Row>[] = [
    {
      key: "page_type",
      label: "Tipo",
      type: "select",
      options: PAGE_TYPES.map((t) => ({ label: t.label, value: t.value })),
      required: true,
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "title",
      label: "Título",
      placeholder: "Ex: Como otimizar seus processos",
      required: true,
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "slug",
      label: "Slug (URL)",
      placeholder: "auto-gerado a partir do título",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: PAGE_STATUSES.map((s) => ({ label: s.label, value: s.value })),
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "excerpt",
      label: "Resumo",
      type: "multiline",
      placeholder: "Breve descrição para listagem e SEO (2-3 frases)",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "content",
      label: "Conteúdo",
      type: "multiline",
      placeholder: "Escreva o conteúdo em Markdown...",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "featured_image_url",
      label: "URL da Imagem de Capa",
      type: "url",
      placeholder: "https://...",
      visibleInList: false,
      visibleInForm: true,
    },
    // ── Categorização ──
    {
      key: "category",
      label: "Categoria",
      type: "select",
      options: BLOG_CATEGORIES.map((c) => ({ label: c, value: c })),
      visibleInList: true,
      visibleInForm: true,
      section: "Categorização",
    },
    {
      key: "author_name",
      label: "Nome do Autor",
      placeholder: "Ex: Maria Silva",
      visibleInList: true,
      visibleInForm: true,
    },
    {
      key: "is_featured",
      label: "Destaque",
      type: "boolean",
      visibleInList: false,
      visibleInForm: true,
    },
    // ── SEO ──
    {
      key: "meta_title",
      label: "Título para SEO",
      placeholder: "Deixe em branco para usar o título",
      visibleInList: false,
      visibleInForm: true,
      section: "SEO",
    },
    {
      key: "meta_description",
      label: "Descrição para SEO",
      type: "multiline",
      placeholder: "Deixe em branco para usar o resumo",
      visibleInList: false,
      visibleInForm: true,
    },
    // ── CTA ──
    {
      key: "lead_form_id",
      label: "Formulário de Captação (CTA)",
      type: "reference",
      referenceTable: "lead_forms",
      referenceLabelField: "title",
      referenceSearchField: "title",
      visibleInList: false,
      visibleInForm: true,
      section: "CTA (Call-to-Action)",
    },
    {
      key: "cta_text",
      label: "Texto do Botão CTA",
      placeholder: "Ex: Solicite um orçamento",
      visibleInList: false,
      visibleInForm: true,
    },
    {
      key: "cta_url",
      label: "URL Externa do CTA",
      type: "url",
      placeholder: "https://... (alternativa ao formulário)",
      visibleInList: false,
      visibleInForm: true,
    },
    // ── Template ──
    {
      key: "template_key",
      label: "Template",
      type: "select",
      options: TEMPLATE_KEYS.map((t) => ({
        label: `${t.label} — ${t.description}`,
        value: t.value,
      })),
      visibleInList: false,
      visibleInForm: true,
      section: "Apresentação",
    },
    {
      key: "sort_order",
      label: "Ordem",
      type: "number",
      placeholder: "0",
      visibleInList: false,
      visibleInForm: true,
      showWhen: (state) => state.page_type === "landing_page",
    },
    // ── Publicação ──
    {
      key: "published_at",
      label: "Data de Publicação",
      type: "datetime",
      visibleInList: true,
      visibleInForm: true,
      section: "Publicação",
    },
    {
      key: "scheduled_at",
      label: "Agendar para",
      type: "datetime",
      visibleInList: false,
      visibleInForm: true,
      showWhen: (state) => state.status === "scheduled",
    },
    // ── Vínculo ──
    {
      key: "campaign_id",
      label: "Campanha",
      type: "reference",
      referenceTable: "campaigns",
      referenceLabelField: "name",
      referenceSearchField: "name",
      visibleInList: false,
      visibleInForm: true,
      section: "Vínculo",
    },
    {
      key: "campaign_item_id",
      label: "Item da campanha",
      type: "reference",
      referenceTable: "campaign_items",
      referenceLabelField: "title",
      referenceSearchField: "title",
      visibleInList: false,
      visibleInForm: true,
      showWhen: (state) => !!state.campaign_id,
      referenceFilter: (
        item: Record<string, unknown>,
        state: Record<string, string>,
      ) => String(item.campaign_id ?? "") === String(state.campaign_id ?? ""),
    },
  ];

  /* ─── Load items ─── */
  const loadItems = useMemo(
    () => async () => {
      if (!tenantId) return [];
      const res = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "content_pages",
        ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
          sortColumn: "created_at DESC",
        }),
      });
      return normalizeCrudList<Row>(res.data).filter((r) => !r.deleted_at);
    },
    [tenantId],
  );

  /* ─── Create ─── */
  const createItem = useCallback(
    async (payload: Row) => {
      const title = String(payload.title ?? "");
      const slug = payload.slug
        ? String(payload.slug)
        : generatePageSlug(title);
      const content = String(payload.content ?? "");
      const readingTime = calculateReadingTime(content || null);

      // Auto-set author_name from user if empty
      const authorName =
        payload.author_name ?? user?.fullname ?? user?.name ?? "";

      // Auto-set published_at if publishing
      let publishedAt = payload.published_at;
      if (payload.status === "published" && !publishedAt) {
        publishedAt = new Date().toISOString();
      }

      return api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "content_pages",
        payload: {
          ...payload,
          tenant_id: tenantId,
          slug,
          author_name: authorName,
          reading_time_min: readingTime,
          published_at: publishedAt,
          tags: "[]",
        },
      });
    },
    [tenantId, user],
  );

  /* ─── Update ─── */
  const updateItem = useCallback(async (payload: Row) => {
    const updates = { ...payload };

    if (payload.content !== undefined) {
      updates.reading_time_min = calculateReadingTime(
        String(payload.content ?? ""),
      );
    }
    if (payload.status === "published" && !payload.published_at) {
      updates.published_at = new Date().toISOString();
    }

    return api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "content_pages",
      payload: updates,
    });
  }, []);

  /* ─── Delete ─── */
  const deleteItem = useCallback(
    async (payload: Row) =>
      api.post(CRUD_ENDPOINT, {
        action: "delete",
        table: "content_pages",
        payload: {
          id: String(payload.id),
          deleted_at: new Date().toISOString(),
        },
      }),
    [],
  );

  /* ─── Helpers ─── */
  const getTitle = (item: Row) => String(item.title ?? "Sem título");

  const getDetails = (item: Row): DetailItem[] => {
    const details: DetailItem[] = [];

    const typeLabel = getPageTypeLabel(
      String(item.page_type ?? "blog_post") as ContentPage["page_type"],
    );
    details.push({ label: "Tipo", value: typeLabel });

    const statusCfg = getStatusConfig(
      String(item.status ?? "draft") as ContentPage["status"],
    );
    details.push({ label: "Status", value: statusCfg.label });

    if (item.category) {
      details.push({ label: "Categoria", value: String(item.category) });
    }
    if (item.author_name) {
      details.push({ label: "Autor", value: String(item.author_name) });
    }
    if (item.view_count) {
      details.push({
        label: "Visualizações",
        value: String(item.view_count),
      });
    }
    if (item.reading_time_min) {
      details.push({
        label: "Leitura",
        value: `${item.reading_time_min} min`,
      });
    }
    if (item.published_at) {
      const dt = new Date(String(item.published_at));
      details.push({
        label: "Publicado em",
        value: dt.toLocaleDateString("pt-BR"),
      });
    }

    return details;
  };

  const renderItemActions = (item: Row) => {
    const status = String(item.status ?? "draft");
    const statusCfg = getStatusConfig(status as ContentPage["status"]);
    const pageType = String(item.page_type ?? "blog_post");

    return (
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}
      >
        {/* Status badge */}
        <View
          style={{
            backgroundColor: statusCfg.color + "18",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Ionicons
            name={statusCfg.icon as keyof typeof Ionicons.glyphMap}
            size={12}
            color={statusCfg.color}
          />
          <Text
            style={{ color: statusCfg.color, fontSize: 12, fontWeight: "600" }}
          >
            {statusCfg.label}
          </Text>
        </View>

        {/* Type badge */}
        <View
          style={{
            backgroundColor:
              pageType === "blog_post" ? "#3b82f618" : "#8b5cf618",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Ionicons
            name={
              pageType === "blog_post"
                ? "newspaper-outline"
                : "megaphone-outline"
            }
            size={12}
            color={pageType === "blog_post" ? "#3b82f6" : "#8b5cf6"}
          />
          <Text
            style={{
              color: pageType === "blog_post" ? "#3b82f6" : "#8b5cf6",
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {getPageTypeLabel(pageType as ContentPage["page_type"])}
          </Text>
        </View>

        {/* Featured badge */}
        {item.is_featured && (
          <View
            style={{
              backgroundColor: "#f59e0b18",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Ionicons name="star" size={12} color="#f59e0b" />
            <Text style={{ color: "#f59e0b", fontSize: 12, fontWeight: "600" }}>
              Destaque
            </Text>
          </View>
        )}

        {/* Copy URL button */}
        {status === "published" && tenantSlug && (
          <TouchableOpacity
            onPress={() => copyUrl(item)}
            style={{
              backgroundColor: tintColor + "18",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Ionicons name="link-outline" size={12} color={tintColor} />
            <Text style={{ color: tintColor, fontSize: 12, fontWeight: "600" }}>
              Copiar Link
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <CrudScreen<Row>
      title="Conteúdo Público"
      subtitle="Blog posts e landing pages com CTA de captação"
      searchPlaceholder="Buscar por título, categoria..."
      searchFields={["title", "category", "author_name", "slug"]}
      fields={fields}
      loadItems={loadItems}
      createItem={createItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
      getId={(item) => String(item.id)}
      getTitle={getTitle}
      getDetails={getDetails}
      renderItemActions={renderItemActions}
    />
  );
}
