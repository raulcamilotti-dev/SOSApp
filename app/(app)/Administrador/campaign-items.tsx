/**
 * CONTEÚDOS DE CAMPANHA — Posts, Blogs, Anúncios, Indicações etc.
 *
 * CrudScreen de nível abaixo da Campanha.
 * Gerencia publicações individuais (posts, blogs, ads, vídeos, reels,
 * stories, e-mails, indicações) com agendamento, status e métricas.
 *
 * Recebe `campaignId` via route params (navegação a partir de Campanhas).
 *
 * Inclui botão "✨ Gerar com IA" que usa o perfil de marketing do tenant
 * para gerar conteúdos criativos via IA e inseri-los como rascunhos.
 */

import {
    CrudScreen,
    type CrudFieldConfig,
    type CrudScreenHandle,
} from "@/components/ui/CrudScreen";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    CAMPAIGN_ITEM_PLATFORMS,
    CAMPAIGN_ITEM_STATUSES,
    CAMPAIGN_ITEM_TYPES,
    getItemPlatformConfig,
    getItemStatusConfig,
    getItemTypeConfig,
} from "@/services/campaigns";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    generateMarketingContent,
    GENERATION_MODES,
    isProfileComplete,
    loadMarketingProfile,
    type AiContentSuggestion,
    type GenerationMode,
    type MarketingProfile,
} from "@/services/marketing-ai";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type DetailItem = { label: string; value: string };
type Row = Record<string, unknown>;

export default function CampaignItemsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const cardColor = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const inputBg = useThemeColor({}, "input");
  const bgColor = useThemeColor({}, "background");
  const tenantId = user?.tenant_id ?? "";
  const params = useLocalSearchParams<{
    campaignId?: string;
    campaignName?: string;
  }>();
  const campaignId = params.campaignId ?? "";
  const campaignName = params.campaignName ?? "";
  const crudRef = useRef<CrudScreenHandle>(null);

  /* ─── AI Generation state ─── */
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiMode, setAiMode] = useState<GenerationMode>("single_post");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<
    (AiContentSuggestion & { selected: boolean })[]
  >([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profile, setProfile] = useState<MarketingProfile | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);

  /* ─── Resolve campaign name ─── */
  const [resolvedName, setResolvedName] = useState(campaignName);

  useEffect(() => {
    if (resolvedName || !campaignId) return;
    (async () => {
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "campaigns",
          ...buildSearchParams([{ field: "id", value: campaignId }]),
        });
        const list = normalizeCrudList<Row>(res.data);
        if (list.length > 0 && list[0].name) {
          setResolvedName(String(list[0].name));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [campaignId, resolvedName]);

  /* ─── Load marketing profile on mount ─── */
  useEffect(() => {
    if (!tenantId || profileLoaded) return;
    (async () => {
      try {
        const loaded = await loadMarketingProfile(tenantId);
        setProfile(loaded);
        setProfileComplete(isProfileComplete(loaded));
      } catch {
        setProfile(null);
        setProfileComplete(false);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, [tenantId, profileLoaded]);

  /* ─── AI: open modal ─── */
  const openAiModal = useCallback(() => {
    if (!profileComplete) {
      Alert.alert(
        "Perfil de Marketing incompleto",
        "Para gerar conteúdo com IA, preencha pelo menos a descrição do negócio e público-alvo no Perfil de Marketing.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Ir para Perfil",
            onPress: () =>
              router.push("/Administrador/perfil-marketing" as any),
          },
        ],
      );
      return;
    }
    setAiError(null);
    setAiSuggestions([]);
    setAiSummary(null);
    setAiInstruction("");
    setAiMode("single_post");
    setAiModalOpen(true);
  }, [profileComplete, router]);

  /* ─── AI: generate content ─── */
  const handleAiGenerate = useCallback(async () => {
    if (!profile || !tenantId) return;
    try {
      setAiLoading(true);
      setAiError(null);
      setAiSuggestions([]);
      setAiSummary(null);

      const result = await generateMarketingContent({
        mode: aiMode,
        profile,
        tenantId,
        userId: user?.id,
        campaignContext: {
          name: resolvedName || campaignName || "Campanha",
        },
        userInstruction: aiInstruction.trim() || undefined,
      });

      setAiSummary(result.summary || null);
      setAiSuggestions(
        result.items.map((item) => ({ ...item, selected: true })),
      );
    } catch (err) {
      setAiError((err as Error)?.message || "Falha ao gerar conteúdo com IA");
    } finally {
      setAiLoading(false);
    }
  }, [
    profile,
    tenantId,
    aiMode,
    aiInstruction,
    user?.id,
    resolvedName,
    campaignName,
  ]);

  /* ─── AI: save selected suggestions as draft campaign_items ─── */
  const handleAiSaveSuggestions = useCallback(async () => {
    const selected = aiSuggestions.filter((s) => s.selected);
    if (selected.length === 0) {
      setAiError("Selecione ao menos um conteúdo para salvar.");
      return;
    }
    try {
      setAiSaving(true);
      setAiError(null);

      for (const suggestion of selected) {
        await api.post(CRUD_ENDPOINT, {
          action: "create",
          table: "campaign_items",
          payload: {
            tenant_id: tenantId,
            campaign_id: campaignId,
            title: suggestion.title || "Conteúdo gerado por IA",
            content: suggestion.content || "",
            item_type: suggestion.item_type || "post",
            platform: suggestion.platform || "outro",
            status: "rascunho",
            scheduled_at: suggestion.scheduled_at || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
      }

      setAiModalOpen(false);
      // Reload the CrudScreen list
      crudRef.current?.reload();
    } catch (err) {
      setAiError(
        (err as Error)?.message || "Falha ao salvar conteúdos gerados.",
      );
    } finally {
      setAiSaving(false);
    }
  }, [aiSuggestions, tenantId, campaignId]);

  /* ─── Fields ─── */

  const fields: CrudFieldConfig<Row>[] = useMemo(
    () => [
      {
        key: "title",
        label: "Título",
        placeholder: "Ex: Post Instagram — Promo Março",
        required: true,
        visibleInList: true,
        visibleInForm: true,
      },
      {
        key: "item_type",
        label: "Tipo de Conteúdo",
        type: "select" as const,
        options: CAMPAIGN_ITEM_TYPES.map((t) => ({
          label: t.label,
          value: t.value,
        })),
        required: true,
        visibleInList: true,
        visibleInForm: true,
      },
      {
        key: "platform",
        label: "Plataforma",
        type: "select" as const,
        options: CAMPAIGN_ITEM_PLATFORMS.map((p) => ({
          label: p.label,
          value: p.value,
        })),
        required: true,
        visibleInList: true,
        visibleInForm: true,
      },
      {
        key: "status",
        label: "Status",
        type: "select" as const,
        options: CAMPAIGN_ITEM_STATUSES.map((s) => ({
          label: s.label,
          value: s.value,
        })),
        visibleInList: true,
        visibleInForm: true,
      },
      {
        key: "content",
        label: "Conteúdo / Texto",
        type: "multiline" as const,
        placeholder: "Texto do post, corpo do blog, copy do anúncio...",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "media_url",
        label: "URL da Mídia",
        type: "url" as const,
        placeholder: "Link para imagem, vídeo ou criativo",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "target_url",
        label: "URL de Destino",
        type: "url" as const,
        placeholder: "Link para onde o conteúdo direciona",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "scheduled_at",
        label: "Agendado para",
        type: "datetime" as const,
        visibleInList: false,
        visibleInForm: true,
        section: "Publicação",
      },
      {
        key: "published_at",
        label: "Publicado em",
        type: "datetime" as const,
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "published_url",
        label: "URL Publicada",
        type: "url" as const,
        placeholder: "Link do post/blog publicado",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "impressions",
        label: "Impressões",
        type: "number" as const,
        placeholder: "0",
        visibleInList: false,
        visibleInForm: true,
        section: "Métricas",
      },
      {
        key: "reach",
        label: "Alcance",
        type: "number" as const,
        placeholder: "0",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "clicks",
        label: "Cliques",
        type: "number" as const,
        placeholder: "0",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "engagement",
        label: "Engajamento",
        type: "number" as const,
        placeholder: "Curtidas + comentários + compartilhamentos",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "conversions",
        label: "Conversões",
        type: "number" as const,
        placeholder: "0",
        visibleInList: false,
        visibleInForm: true,
      },
      {
        key: "cost",
        label: "Custo (R$)",
        type: "currency" as const,
        placeholder: "0,00",
        visibleInList: false,
        visibleInForm: true,
      },
    ],
    [],
  );

  /* ─── CRUD Handlers ─── */

  const loadItems = useCallback(async (): Promise<Row[]> => {
    if (!tenantId || !campaignId) return [];
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "campaign_items",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "campaign_id", value: campaignId },
        ],
        { sortColumn: "created_at DESC" },
      ),
    });
    return normalizeCrudList(res.data).filter(
      (r: Row) => !r.deleted_at,
    ) as Row[];
  }, [tenantId, campaignId]);

  const createItem = useCallback(
    async (payload: Row) => {
      return api.post(CRUD_ENDPOINT, {
        action: "create",
        table: "campaign_items",
        payload: {
          ...payload,
          tenant_id: tenantId,
          campaign_id: campaignId,
        },
      });
    },
    [tenantId, campaignId],
  );

  const updateItem = useCallback(async (payload: Row) => {
    return api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "campaign_items",
      payload,
    });
  }, []);

  const deleteItem = useCallback(async (payload: Row) => {
    return api.post(CRUD_ENDPOINT, {
      action: "delete",
      table: "campaign_items",
      payload: {
        id: payload.id,
        deleted_at: new Date().toISOString(),
      },
    });
  }, []);

  /* ─── Detail / Actions ─── */

  const getDetails = useCallback((item: Row): DetailItem[] => {
    const details: DetailItem[] = [];
    const typeConf = getItemTypeConfig(String(item.item_type ?? "outro"));
    details.push({ label: "Tipo", value: typeConf.label });

    const platConf = getItemPlatformConfig(String(item.platform ?? "outro"));
    details.push({ label: "Plataforma", value: platConf.label });

    const statusConf = getItemStatusConfig(String(item.status ?? "rascunho"));
    details.push({ label: "Status", value: statusConf.label });

    if (item.scheduled_at) {
      details.push({
        label: "Agendado",
        value: new Date(String(item.scheduled_at)).toLocaleString("pt-BR"),
      });
    }
    if (item.published_at) {
      details.push({
        label: "Publicado",
        value: new Date(String(item.published_at)).toLocaleString("pt-BR"),
      });
    }
    if (item.impressions) {
      details.push({ label: "Impressões", value: String(item.impressions) });
    }
    if (item.clicks) {
      details.push({ label: "Cliques", value: String(item.clicks) });
    }
    if (item.engagement) {
      details.push({ label: "Engajamento", value: String(item.engagement) });
    }
    if (item.conversions) {
      details.push({ label: "Conversões", value: String(item.conversions) });
    }
    if (item.cost) {
      const numCost =
        typeof item.cost === "string"
          ? parseFloat(item.cost)
          : (item.cost as number);
      if (!isNaN(numCost)) {
        details.push({
          label: "Custo",
          value: `R$ ${numCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        });
      }
    }
    return details;
  }, []);

  const renderItemActions = useCallback(
    (item: Row) => {
      const typeConf = getItemTypeConfig(String(item.item_type ?? "outro"));
      const platConf = getItemPlatformConfig(String(item.platform ?? "outro"));
      const statusConf = getItemStatusConfig(String(item.status ?? "rascunho"));

      return (
        <View
          style={{
            flexDirection: "row",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Status badge */}
          <View
            style={{
              backgroundColor: statusConf.color + "20",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: statusConf.color,
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {statusConf.label}
            </Text>
          </View>

          {/* Type badge */}
          <View
            style={{
              backgroundColor: typeConf.color + "20",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Ionicons
              name={typeConf.icon as keyof typeof Ionicons.glyphMap}
              size={11}
              color={typeConf.color}
            />
            <Text
              style={{ color: typeConf.color, fontSize: 11, fontWeight: "600" }}
            >
              {typeConf.label}
            </Text>
          </View>

          {/* Platform badge */}
          <View
            style={{
              backgroundColor: platConf.color + "20",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Ionicons
              name={platConf.icon as keyof typeof Ionicons.glyphMap}
              size={11}
              color={platConf.color}
            />
            <Text
              style={{ color: platConf.color, fontSize: 11, fontWeight: "600" }}
            >
              {platConf.label}
            </Text>
          </View>

          {/* Open published URL */}
          {item.published_url ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(String(item.published_url))}
              style={{
                backgroundColor: tintColor + "15",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Ionicons name="open-outline" size={12} color={tintColor} />
              <Text
                style={{ color: tintColor, fontSize: 11, fontWeight: "600" }}
              >
                Abrir
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    },
    [tintColor],
  );

  return (
    <View style={{ flex: 1 }}>
      <CrudScreen<Row>
        title={
          resolvedName ? `Conteúdos — ${resolvedName}` : "Conteúdos de Campanha"
        }
        subtitle="Posts, blogs, anúncios, indicações e conteúdos da campanha"
        searchPlaceholder="Buscar por título, tipo ou plataforma..."
        searchFields={["title", "item_type", "platform", "content"]}
        fields={fields}
        loadItems={loadItems}
        createItem={createItem}
        updateItem={updateItem}
        deleteItem={deleteItem}
        getId={(item) => String(item.id)}
        getTitle={(item) => String(item.title ?? "Conteúdo")}
        getDetails={getDetails}
        renderItemActions={renderItemActions}
        controlRef={crudRef}
        headerActions={
          <TouchableOpacity
            onPress={openAiModal}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: tintColor,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
            }}
          >
            <Ionicons name="sparkles-outline" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
              Gerar com IA
            </Text>
          </TouchableOpacity>
        }
      />

      {/* ═══ AI Generation Modal ═══ */}
      <Modal
        visible={aiModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAiModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 14,
              padding: 20,
              maxHeight: "92%",
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: textColor,
                }}
              >
                ✨ Gerar conteúdo com IA
              </Text>
              <TouchableOpacity onPress={() => setAiModalOpen(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Mode selector */}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: mutedColor,
                  marginBottom: 8,
                }}
              >
                Tipo de geração
              </Text>
              {GENERATION_MODES.map((mode) => {
                const isActive = aiMode === mode.value;
                return (
                  <TouchableOpacity
                    key={mode.value}
                    onPress={() => setAiMode(mode.value)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: isActive ? tintColor : borderColor,
                      backgroundColor: isActive
                        ? tintColor + "12"
                        : "transparent",
                      marginBottom: 8,
                    }}
                  >
                    <Ionicons
                      name={mode.icon as any}
                      size={20}
                      color={isActive ? tintColor : mutedColor}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: textColor,
                        }}
                      >
                        {mode.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: mutedColor,
                          marginTop: 2,
                        }}
                      >
                        {mode.description}
                      </Text>
                    </View>
                    {isActive && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={tintColor}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* User instruction */}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: mutedColor,
                  marginTop: 12,
                  marginBottom: 6,
                }}
              >
                Instrução adicional (opcional)
              </Text>
              <TextInput
                value={aiInstruction}
                onChangeText={setAiInstruction}
                placeholder="Ex: Foco em promoção de inverno para jovens 18-25"
                placeholderTextColor={mutedColor}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: inputBg,
                  color: textColor,
                  minHeight: 60,
                  textAlignVertical: "top",
                  fontSize: 14,
                }}
              />

              {/* Generate button */}
              <TouchableOpacity
                onPress={handleAiGenerate}
                disabled={aiLoading}
                style={{
                  marginTop: 16,
                  backgroundColor: aiLoading ? mutedColor : tintColor,
                  paddingVertical: 14,
                  borderRadius: 10,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {aiLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="sparkles" size={18} color="#fff" />
                )}
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
                >
                  {aiLoading ? "Gerando..." : "Gerar conteúdo"}
                </Text>
              </TouchableOpacity>

              {/* Error */}
              {aiError ? (
                <Text
                  style={{
                    color: "#dc2626",
                    marginTop: 12,
                    fontSize: 13,
                  }}
                >
                  {aiError}
                </Text>
              ) : null}

              {/* Summary */}
              {aiSummary ? (
                <View
                  style={{
                    marginTop: 14,
                    padding: 12,
                    backgroundColor: bgColor,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: textColor,
                      marginBottom: 4,
                    }}
                  >
                    Resumo da IA
                  </Text>
                  <Text style={{ fontSize: 13, color: mutedColor }}>
                    {aiSummary}
                  </Text>
                </View>
              ) : null}

              {/* Suggestion cards */}
              {aiSuggestions.length > 0 ? (
                <View style={{ marginTop: 14 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: mutedColor,
                      marginBottom: 8,
                    }}
                  >
                    Conteúdos gerados (
                    {aiSuggestions.filter((s) => s.selected).length}{" "}
                    selecionados)
                  </Text>
                  {aiSuggestions.map((suggestion, idx) => {
                    const typeConf = getItemTypeConfig(
                      suggestion.item_type || "post",
                    );
                    const platConf = getItemPlatformConfig(
                      suggestion.platform || "outro",
                    );
                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => {
                          setAiSuggestions((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, selected: !s.selected } : s,
                            ),
                          );
                        }}
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: suggestion.selected
                            ? tintColor
                            : borderColor,
                          backgroundColor: suggestion.selected
                            ? tintColor + "08"
                            : "transparent",
                          marginBottom: 10,
                        }}
                      >
                        {/* Checkbox + Title */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <Ionicons
                            name={
                              suggestion.selected
                                ? "checkbox"
                                : "square-outline"
                            }
                            size={20}
                            color={suggestion.selected ? tintColor : mutedColor}
                          />
                          <Text
                            style={{
                              flex: 1,
                              fontSize: 14,
                              fontWeight: "600",
                              color: textColor,
                            }}
                            numberOfLines={2}
                          >
                            {suggestion.title || "Sem título"}
                          </Text>
                        </View>
                        {/* Content preview */}
                        {suggestion.content ? (
                          <Text
                            style={{
                              fontSize: 12,
                              color: mutedColor,
                              marginTop: 6,
                              marginLeft: 28,
                            }}
                            numberOfLines={3}
                          >
                            {suggestion.content}
                          </Text>
                        ) : null}
                        {/* Type + Platform badges */}
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 6,
                            marginTop: 8,
                            marginLeft: 28,
                          }}
                        >
                          <View
                            style={{
                              backgroundColor: typeConf.color + "20",
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 6,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            <Ionicons
                              name={
                                typeConf.icon as keyof typeof Ionicons.glyphMap
                              }
                              size={10}
                              color={typeConf.color}
                            />
                            <Text
                              style={{
                                color: typeConf.color,
                                fontSize: 10,
                                fontWeight: "600",
                              }}
                            >
                              {typeConf.label}
                            </Text>
                          </View>
                          <View
                            style={{
                              backgroundColor: platConf.color + "20",
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 6,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 3,
                            }}
                          >
                            <Ionicons
                              name={
                                platConf.icon as keyof typeof Ionicons.glyphMap
                              }
                              size={10}
                              color={platConf.color}
                            />
                            <Text
                              style={{
                                color: platConf.color,
                                fontSize: 10,
                                fontWeight: "600",
                              }}
                            >
                              {platConf.label}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Save selected button */}
                  <TouchableOpacity
                    onPress={handleAiSaveSuggestions}
                    disabled={
                      aiSaving ||
                      aiSuggestions.filter((s) => s.selected).length === 0
                    }
                    style={{
                      marginTop: 4,
                      backgroundColor:
                        aiSaving ||
                        aiSuggestions.filter((s) => s.selected).length === 0
                          ? mutedColor
                          : "#16a34a",
                      paddingVertical: 14,
                      borderRadius: 10,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {aiSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="save-outline" size={18} color="#fff" />
                    )}
                    <Text
                      style={{
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: 15,
                      }}
                    >
                      {aiSaving
                        ? "Salvando..."
                        : `Salvar ${aiSuggestions.filter((s) => s.selected).length} como rascunho`}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
