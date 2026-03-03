/**
 * Pack Marketplace — Browse, search, and install template packs.
 *
 * Shows published packs from the marketplace (official + community),
 * with category filters, search, and install/uninstall actions.
 *
 * @module A.5 — Pack Marketplace MVP
 */

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    getPackDetails,
    getTenantInstalls,
    installPack,
    listMarketplacePacks,
    MARKETPLACE_CATEGORIES,
    uninstallPack,
    type MarketplaceInstall,
    type MarketplacePack,
    type MarketplacePackListFilters,
} from "@/services/marketplace-packs";
import {
    formatPackPrice,
    packRequiresPayment,
    purchasePack,
    type PackPurchaseResult,
} from "@/services/pack-billing";
import {
    getPackRatingBreakdown,
    getPackReviews,
    getUserReviewForPack,
    markReviewHelpful,
    submitPackReview,
    type PackReview,
} from "@/services/pack-reviews";
import { hasUpdate, updateInstalledPack } from "@/services/pack-versioning";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Modal,
    Platform,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IS_DESKTOP = SCREEN_WIDTH >= 768;

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export default function MarketplaceScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  /* ---- Theme ---- */
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");

  /* ---- State ---- */
  const [packs, setPacks] = useState<MarketplacePack[]>([]);
  const [installs, setInstalls] = useState<MarketplaceInstall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSort, setActiveSort] = useState<
    "popular" | "newest" | "name" | "rating"
  >("popular");

  // Detail modal
  const [detailPack, setDetailPack] = useState<MarketplacePack | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Install/uninstall
  const [installing, setInstalling] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");

  // Payment modal (paid packs)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PackPurchaseResult | null>(
    null,
  );
  const [purchasingPack, setPurchasingPack] = useState<MarketplacePack | null>(
    null,
  );
  const [pixCopied, setPixCopied] = useState(false);

  // Reviews state
  const [reviews, setReviews] = useState<PackReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [userReview, setUserReview] = useState<PackReview | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewTitle, setReviewTitle] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [ratingBreakdown, setRatingBreakdown] = useState<
    Record<number, number>
  >({});

  /* ---- Installed pack IDs (for quick lookup) ---- */
  const installedPackIds = useMemo(
    () =>
      new Set(
        installs.filter((i) => i.status === "active").map((i) => i.pack_id),
      ),
    [installs],
  );

  /** Map pack_id → installed_version for update detection */
  const installMap = useMemo(
    () =>
      new Map(
        installs
          .filter((i) => i.status === "active")
          .map((i) => [i.pack_id, i.installed_version]),
      ),
    [installs],
  );

  /* ---- Load data ---- */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: MarketplacePackListFilters = {
        sort: activeSort,
        category: activeCategory ?? undefined,
        search: search.trim() || undefined,
      };

      const [packsList, installsList] = await Promise.all([
        listMarketplacePacks(filters),
        tenantId ? getTenantInstalls(tenantId) : Promise.resolve([]),
      ]);

      setPacks(packsList);
      setInstalls(installsList);
    } catch {
      setError("Falha ao carregar marketplace.");
    } finally {
      setLoading(false);
    }
  }, [activeSort, activeCategory, search, tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ---- Sections: official first, then community ---- */
  const officialPacks = useMemo(
    () => packs.filter((p) => p.is_official),
    [packs],
  );
  const communityPacks = useMemo(
    () => packs.filter((p) => !p.is_official),
    [packs],
  );

  /* ---- Install handler ---- */
  const handleInstall = useCallback(
    async (pack: MarketplacePack) => {
      if (!tenantId || !user?.id) {
        Alert.alert("Erro", "Usuário ou tenant não identificado.");
        return;
      }

      // ── Paid packs: generate billing first ──
      if (packRequiresPayment(pack)) {
        const priceLabel = formatPackPrice(pack);
        const trialInfo =
          pack.pricing_type === "monthly" && pack.trial_days > 0
            ? `\n\nTeste grátis por ${pack.trial_days} dias.`
            : "";
        const confirmMsg = `Adquirir "${pack.name}" por ${priceLabel}?${trialInfo}\n\nSerá gerado um PIX para pagamento.`;

        const confirmed =
          Platform.OS === "web"
            ? window.confirm(confirmMsg)
            : await new Promise<boolean>((resolve) =>
                Alert.alert("Confirmar aquisição", confirmMsg, [
                  {
                    text: "Cancelar",
                    style: "cancel",
                    onPress: () => resolve(false),
                  },
                  { text: "Continuar", onPress: () => resolve(true) },
                ]),
              );
        if (!confirmed) return;

        setInstalling(pack.id);
        setProgressLabel("Gerando cobrança...");

        try {
          const result = await purchasePack(tenantId, pack);

          if (!result.success) {
            Alert.alert("Erro", result.error || "Falha ao gerar cobrança.");
            return;
          }

          // Trial packs are installed immediately by purchasePack()
          if (result.installedImmediately) {
            Alert.alert(
              "Sucesso!",
              `Pack "${pack.name}" instalado!\n\nVocê tem ${pack.trial_days} dias de teste grátis. Após o período, a cobrança será gerada automaticamente.`,
            );
            loadData();
            return;
          }

          // Paid packs: show payment modal with PIX
          setPurchasingPack(pack);
          setPaymentResult(result);
          setPixCopied(false);
          setPaymentModalOpen(true);
        } catch {
          Alert.alert("Erro", "Falha ao processar aquisição.");
        } finally {
          setInstalling(null);
          setProgressLabel("");
        }
        return;
      }

      // ── Free packs: install directly ──
      const confirmed =
        Platform.OS === "web"
          ? window.confirm(
              `Instalar "${pack.name}"?\n\nIsso criará categorias, tipos de serviço, workflows e papéis no seu tenant.`,
            )
          : await new Promise<boolean>((resolve) =>
              Alert.alert(
                "Confirmar instalação",
                `Instalar "${pack.name}"?\n\nIsso criará categorias, tipos de serviço, workflows e papéis.`,
                [
                  {
                    text: "Cancelar",
                    style: "cancel",
                    onPress: () => resolve(false),
                  },
                  { text: "Instalar", onPress: () => resolve(true) },
                ],
              ),
            );

      if (!confirmed) return;

      setInstalling(pack.id);
      setProgressLabel("Iniciando...");

      try {
        const result = await installPack(
          tenantId,
          pack.id,
          user.id,
          (step, _progress) => setProgressLabel(step),
        );

        if (result.success) {
          Alert.alert("Sucesso!", `Pack "${pack.name}" instalado com sucesso!`);
          loadData(); // Refresh
        } else {
          Alert.alert(
            "Erro na instalação",
            result.errors.slice(0, 5).join("\n") || "Falha desconhecida.",
          );
        }
      } catch {
        Alert.alert("Erro", "Falha ao instalar o pack.");
      } finally {
        setInstalling(null);
        setProgressLabel("");
      }
    },
    [tenantId, user?.id, loadData],
  );

  /* ---- Uninstall handler ---- */
  const handleUninstall = useCallback(
    async (pack: MarketplacePack) => {
      if (!tenantId) return;

      const confirmed =
        Platform.OS === "web"
          ? window.confirm(
              `Desinstalar "${pack.name}"?\n\nIsso irá remover as configurações do pack (categorias, workflows, etc.).\n\nDados de clientes e processos NÃO serão afetados.`,
            )
          : await new Promise<boolean>((resolve) =>
              Alert.alert(
                "Confirmar desinstalação",
                `Desinstalar "${pack.name}"?\n\nConfiguração de categorias, workflows e papéis será removida.`,
                [
                  {
                    text: "Cancelar",
                    style: "cancel",
                    onPress: () => resolve(false),
                  },
                  {
                    text: "Desinstalar",
                    style: "destructive",
                    onPress: () => resolve(true),
                  },
                ],
              ),
            );

      if (!confirmed) return;

      setInstalling(pack.id);
      try {
        const result = await uninstallPack(tenantId, pack.id);
        if (result.success) {
          Alert.alert("Desinstalado", `Pack "${pack.name}" removido.`);
          loadData();
        } else {
          Alert.alert("Erro", result.errors.join("\n") || "Falha.");
        }
      } catch {
        Alert.alert("Erro", "Falha ao desinstalar.");
      } finally {
        setInstalling(null);
      }
    },
    [tenantId, loadData],
  );

  /* ---- Open detail modal ---- */
  const openDetail = useCallback(
    async (pack: MarketplacePack) => {
      setDetailPack(pack);
      setDetailModalOpen(true);
      setReviews([]);
      setUserReview(null);
      setRatingBreakdown({});
      // Optionally refresh full details
      try {
        const full = await getPackDetails(pack.id);
        if (full) setDetailPack(full);
      } catch {
        // keep the existing pack data
      }
      // Load reviews for this pack
      setReviewsLoading(true);
      try {
        const [revs, breakdown] = await Promise.all([
          getPackReviews(pack.id, { limit: 20, sort: "newest" }),
          getPackRatingBreakdown(pack.id),
        ]);
        setReviews(revs);
        setRatingBreakdown(breakdown);
        // Check if current user already reviewed
        if (user?.id) {
          const existing = await getUserReviewForPack(pack.id, user.id);
          setUserReview(existing);
        }
      } catch {
        // silent — reviews are non-critical
      } finally {
        setReviewsLoading(false);
      }
    },
    [user?.id],
  );

  /* ---- Submit review ---- */
  const handleSubmitReview = useCallback(async () => {
    if (!detailPack || !tenantId || !user?.id) return;
    const install = installs.find(
      (i) => i.pack_id === detailPack.id && i.status === "active",
    );
    if (!install) {
      Alert.alert("Erro", "Você precisa ter este pack instalado para avaliar.");
      return;
    }
    if (reviewRating < 1 || reviewRating > 5) {
      Alert.alert("Erro", "Selecione uma nota de 1 a 5 estrelas.");
      return;
    }
    setSubmittingReview(true);
    try {
      await submitPackReview({
        packId: detailPack.id,
        installId: install.id,
        tenantId,
        reviewerId: user.id,
        rating: reviewRating,
        title: reviewTitle.trim() || undefined,
        comment: reviewComment.trim() || undefined,
      });
      // Refresh reviews + pack data
      const [revs, breakdown, updatedPack] = await Promise.all([
        getPackReviews(detailPack.id, { limit: 20, sort: "newest" }),
        getPackRatingBreakdown(detailPack.id),
        getPackDetails(detailPack.id),
      ]);
      setReviews(revs);
      setRatingBreakdown(breakdown);
      if (updatedPack) setDetailPack(updatedPack);
      const existing = await getUserReviewForPack(detailPack.id, user.id);
      setUserReview(existing);
      setReviewModalOpen(false);
      setReviewTitle("");
      setReviewComment("");
      setReviewRating(5);
      loadData(); // refresh pack list ratings
      Alert.alert("Sucesso", "Avaliação enviada com sucesso!");
    } catch (err: any) {
      Alert.alert(
        "Erro",
        err?.message || "Não foi possível enviar a avaliação.",
      );
    } finally {
      setSubmittingReview(false);
    }
  }, [
    detailPack,
    tenantId,
    user?.id,
    installs,
    reviewRating,
    reviewTitle,
    reviewComment,
    loadData,
  ]);

  /* ---- Update handler ---- */
  const handleUpdate = useCallback(
    async (pack: MarketplacePack) => {
      if (!tenantId || !user?.id) {
        Alert.alert("Erro", "Usuário ou tenant não identificado.");
        return;
      }
      const installedVer = installMap.get(pack.id) ?? "0.0.0";
      const confirmMsg = `Atualizar "${pack.name}" de v${installedVer} para v${pack.version}?\n\nIsso limpará os dados do pack anterior e aplicará a nova versão.`;

      const confirmed =
        Platform.OS === "web"
          ? window.confirm(confirmMsg)
          : await new Promise<boolean>((resolve) =>
              Alert.alert("Confirmar atualização", confirmMsg, [
                {
                  text: "Cancelar",
                  style: "cancel",
                  onPress: () => resolve(false),
                },
                { text: "Atualizar", onPress: () => resolve(true) },
              ]),
            );
      if (!confirmed) return;

      setInstalling(pack.id);
      setProgressLabel("Atualizando...");

      try {
        await updateInstalledPack(tenantId, pack.id, user.id, (label) =>
          setProgressLabel(label),
        );
        Alert.alert(
          "Atualizado!",
          `"${pack.name}" atualizado para v${pack.version}.`,
        );
        loadData();
      } catch {
        Alert.alert("Erro", "Falha ao atualizar o pack.");
      } finally {
        setInstalling(null);
        setProgressLabel("");
      }
    },
    [tenantId, user?.id, installMap, loadData],
  );

  /* ---- Pack Card ---- */
  const renderPackCard = (pack: MarketplacePack) => {
    const isInstalled = installedPackIds.has(pack.id);
    const isProcessing = installing === pack.id;
    const categoryInfo = MARKETPLACE_CATEGORIES.find(
      (c) => c.value === pack.category,
    );
    const packData = pack.pack_data as any;
    const serviceTypeCount = packData?.service_types?.length ?? 0;
    const workflowCount = packData?.workflows?.length ?? 0;

    return (
      <TouchableOpacity
        key={pack.id}
        onPress={() => openDetail(pack)}
        activeOpacity={0.8}
        style={{
          backgroundColor: cardColor,
          borderRadius: 14,
          borderWidth: 1,
          borderColor,
          padding: 16,
          marginBottom: 12,
          ...(IS_DESKTOP ? { width: "48%", marginHorizontal: "1%" } : {}),
        }}
      >
        {/* Header: icon + name + official badge */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              backgroundColor: tintColor + "15",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ThemedText style={{ fontSize: 22 }}>
              {pack.icon || "📦"}
            </ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <ThemedText
                style={{ fontSize: 15, fontWeight: "700", color: textColor }}
                numberOfLines={1}
              >
                {pack.name}
              </ThemedText>
              {pack.is_official && (
                <View
                  style={{
                    backgroundColor: tintColor + "20",
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}
                >
                  <ThemedText
                    style={{ fontSize: 9, fontWeight: "700", color: tintColor }}
                  >
                    OFICIAL
                  </ThemedText>
                </View>
              )}
            </View>
            <ThemedText
              style={{ fontSize: 12, color: mutedColor }}
              numberOfLines={2}
            >
              {pack.description || "Sem descrição"}
            </ThemedText>
          </View>
        </View>

        {/* Stats row */}
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            marginTop: 12,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: borderColor,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="list-outline" size={12} color={mutedColor} />
            <ThemedText style={{ fontSize: 11, color: mutedColor }}>
              {serviceTypeCount} serviços
            </ThemedText>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="git-branch-outline" size={12} color={mutedColor} />
            <ThemedText style={{ fontSize: 11, color: mutedColor }}>
              {workflowCount} workflows
            </ThemedText>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="download-outline" size={12} color={mutedColor} />
            <ThemedText style={{ fontSize: 11, color: mutedColor }}>
              {pack.download_count}
            </ThemedText>
          </View>
          {(pack.rating_count ?? 0) > 0 && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              <ThemedText style={{ fontSize: 11 }}>⭐</ThemedText>
              <ThemedText
                style={{ fontSize: 11, fontWeight: "600", color: textColor }}
              >
                {Number(pack.rating_avg ?? 0).toFixed(1)}
              </ThemedText>
              <ThemedText style={{ fontSize: 10, color: mutedColor }}>
                ({pack.rating_count})
              </ThemedText>
            </View>
          )}
          {categoryInfo && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <ThemedText style={{ fontSize: 11 }}>
                {categoryInfo.icon}
              </ThemedText>
              <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                {categoryInfo.label}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {isInstalled && hasUpdate(pack, installMap.get(pack.id)) && (
            <TouchableOpacity
              onPress={() => handleUpdate(pack)}
              disabled={isProcessing}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: "#f59e0b20",
                alignItems: "center",
              }}
            >
              <ThemedText
                style={{ fontSize: 12, fontWeight: "700", color: "#f59e0b" }}
              >
                {isProcessing
                  ? progressLabel || "Atualizando..."
                  : "⬆ Atualizar"}
              </ThemedText>
            </TouchableOpacity>
          )}
          {isInstalled ? (
            <TouchableOpacity
              onPress={() => handleUninstall(pack)}
              disabled={isProcessing}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: "#dc262615",
                alignItems: "center",
              }}
            >
              <ThemedText
                style={{ fontSize: 12, fontWeight: "600", color: "#dc2626" }}
              >
                {isProcessing ? "Removendo..." : "Desinstalar"}
              </ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => handleInstall(pack)}
              disabled={isProcessing}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: isProcessing ? mutedColor : tintColor,
                alignItems: "center",
              }}
            >
              <ThemedText
                style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}
              >
                {isProcessing
                  ? progressLabel || "Processando..."
                  : packRequiresPayment(pack)
                    ? pack.pricing_type === "monthly" && pack.trial_days > 0
                      ? `Trial ${pack.trial_days}d grátis`
                      : `Adquirir — ${formatPackPrice(pack)}`
                    : "Instalar"}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* Version + pricing */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ThemedText style={{ fontSize: 10, color: mutedColor }}>
              v{pack.version}
            </ThemedText>
            {isInstalled && hasUpdate(pack, installMap.get(pack.id)) && (
              <View
                style={{
                  backgroundColor: "#f59e0b20",
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: 4,
                }}
              >
                <ThemedText
                  style={{ fontSize: 9, fontWeight: "700", color: "#f59e0b" }}
                >
                  ATUALIZAÇÃO
                </ThemedText>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {pack.pricing_type === "monthly" && pack.trial_days > 0 && (
              <View
                style={{
                  backgroundColor: "#16a34a20",
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: 4,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 9,
                    fontWeight: "700",
                    color: "#16a34a",
                  }}
                >
                  TRIAL {pack.trial_days}d
                </ThemedText>
              </View>
            )}
            <ThemedText
              style={{
                fontSize: 10,
                color: packRequiresPayment(pack) ? tintColor : mutedColor,
                fontWeight: packRequiresPayment(pack) ? "700" : "400",
              }}
            >
              {formatPackPrice(pack)}
            </ThemedText>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  /* ================================================================ */
  /*  Detail Modal                                                      */
  /* ================================================================ */

  const renderDetailModal = () => {
    if (!detailPack) return null;
    const isInstalled = installedPackIds.has(detailPack.id);
    const isProcessing = installing === detailPack.id;
    const packData = detailPack.pack_data as any;

    const serviceTypes = packData?.service_types ?? [];
    const workflows = packData?.workflows ?? [];
    const modules: string[] = packData?.modules ?? [];
    const roles = packData?.roles ?? [];

    return (
      <Modal
        transparent
        visible={detailModalOpen}
        animationType="slide"
        onRequestClose={() => setDetailModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "90%",
            }}
          >
            {/* Close */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  flex: 1,
                }}
              >
                <ThemedText style={{ fontSize: 28 }}>
                  {detailPack.icon || "📦"}
                </ThemedText>
                <View style={{ flex: 1 }}>
                  <ThemedText
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: textColor,
                    }}
                  >
                    {detailPack.name}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                    v{detailPack.version} · {detailPack.download_count}{" "}
                    downloads
                    {detailPack.is_official ? " · Oficial" : ""}
                  </ThemedText>
                  {/* Pricing badge */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: packRequiresPayment(detailPack)
                          ? tintColor + "20"
                          : "#16a34a20",
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: packRequiresPayment(detailPack)
                            ? tintColor
                            : "#16a34a",
                        }}
                      >
                        {formatPackPrice(detailPack)}
                      </ThemedText>
                    </View>
                    {detailPack.pricing_type === "monthly" &&
                      detailPack.trial_days > 0 && (
                        <View
                          style={{
                            backgroundColor: "#16a34a20",
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 4,
                          }}
                        >
                          <ThemedText
                            style={{
                              fontSize: 10,
                              fontWeight: "700",
                              color: "#16a34a",
                            }}
                          >
                            TRIAL {detailPack.trial_days} DIAS
                          </ThemedText>
                        </View>
                      )}
                  </View>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setDetailModalOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: borderColor + "60",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ThemedText style={{ color: mutedColor, fontSize: 16 }}>
                  ✕
                </ThemedText>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Description */}
              <ThemedText
                style={{
                  fontSize: 14,
                  color: textColor,
                  marginBottom: 16,
                  lineHeight: 20,
                }}
              >
                {detailPack.long_description ||
                  detailPack.description ||
                  "Sem descrição detalhada."}
              </ThemedText>

              {/* Includes section */}
              <ThemedText
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: textColor,
                  marginBottom: 8,
                }}
              >
                O que inclui
              </ThemedText>

              {/* Service Types */}
              {serviceTypes.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: mutedColor,
                      marginBottom: 4,
                    }}
                  >
                    Tipos de Serviço ({serviceTypes.length})
                  </ThemedText>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    {serviceTypes.map((st: any, i: number) => (
                      <View
                        key={i}
                        style={{
                          backgroundColor: tintColor + "12",
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <ThemedText style={{ fontSize: 11, color: tintColor }}>
                          {st.icon ?? "📋"} {st.name}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Workflows */}
              {workflows.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: mutedColor,
                      marginBottom: 4,
                    }}
                  >
                    Workflows ({workflows.length})
                  </ThemedText>
                  {workflows.map((wf: any, i: number) => (
                    <View key={i} style={{ marginBottom: 4 }}>
                      <ThemedText style={{ fontSize: 12, color: textColor }}>
                        • {wf.name} ({wf.steps?.length ?? 0} etapas)
                      </ThemedText>
                    </View>
                  ))}
                </View>
              )}

              {/* Modules */}
              {modules.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: mutedColor,
                      marginBottom: 4,
                    }}
                  >
                    Módulos ({modules.length})
                  </ThemedText>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    {modules.map((mod: string, i: number) => (
                      <View
                        key={i}
                        style={{
                          backgroundColor: borderColor + "40",
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <ThemedText style={{ fontSize: 11, color: textColor }}>
                          {mod}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Roles */}
              {roles.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: mutedColor,
                      marginBottom: 4,
                    }}
                  >
                    Papéis ({roles.length})
                  </ThemedText>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    {roles.map((role: any, i: number) => (
                      <View
                        key={i}
                        style={{
                          backgroundColor: borderColor + "40",
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <ThemedText style={{ fontSize: 11, color: textColor }}>
                          {role.name}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Tags */}
              {(detailPack.tags ?? []).length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: mutedColor,
                      marginBottom: 4,
                    }}
                  >
                    Tags
                  </ThemedText>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    {detailPack.tags.map((tag, i) => (
                      <View
                        key={i}
                        style={{
                          backgroundColor: borderColor + "30",
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 20,
                        }}
                      >
                        <ThemedText style={{ fontSize: 10, color: mutedColor }}>
                          #{tag}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* ── Reviews Section ── */}
              <View
                style={{
                  marginTop: 16,
                  borderTopWidth: 1,
                  borderTopColor: borderColor,
                  paddingTop: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: textColor,
                      }}
                    >
                      Avaliações
                    </ThemedText>
                    {detailPack.rating_count > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <ThemedText style={{ fontSize: 14, color: "#f59e0b" }}>
                          ⭐
                        </ThemedText>
                        <ThemedText
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: textColor,
                          }}
                        >
                          {Number(detailPack.rating_avg).toFixed(1)}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                          ({detailPack.rating_count})
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  {isInstalled && !userReview && (
                    <TouchableOpacity
                      onPress={() => {
                        setReviewRating(5);
                        setReviewTitle("");
                        setReviewComment("");
                        setReviewModalOpen(true);
                      }}
                      style={{
                        backgroundColor: tintColor,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: "#fff",
                        }}
                      >
                        Avaliar
                      </ThemedText>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Rating breakdown bar */}
                {ratingBreakdown && detailPack.rating_count > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = ratingBreakdown[star] ?? 0;
                      const pct =
                        detailPack.rating_count > 0
                          ? (count / detailPack.rating_count) * 100
                          : 0;
                      return (
                        <View
                          key={star}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 3,
                          }}
                        >
                          <ThemedText
                            style={{
                              fontSize: 11,
                              color: mutedColor,
                              width: 12,
                              textAlign: "right",
                            }}
                          >
                            {star}
                          </ThemedText>
                          <ThemedText
                            style={{ fontSize: 10, color: "#f59e0b" }}
                          >
                            ⭐
                          </ThemedText>
                          <View
                            style={{
                              flex: 1,
                              height: 6,
                              backgroundColor: borderColor + "40",
                              borderRadius: 3,
                              overflow: "hidden",
                            }}
                          >
                            <View
                              style={{
                                width: `${pct}%` as any,
                                height: "100%",
                                backgroundColor: "#f59e0b",
                                borderRadius: 3,
                              }}
                            />
                          </View>
                          <ThemedText
                            style={{
                              fontSize: 10,
                              color: mutedColor,
                              width: 20,
                              textAlign: "right",
                            }}
                          >
                            {count}
                          </ThemedText>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Reviews list */}
                {reviewsLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={tintColor}
                    style={{ marginVertical: 16 }}
                  />
                ) : reviews.length === 0 ? (
                  <ThemedText
                    style={{
                      fontSize: 13,
                      color: mutedColor,
                      fontStyle: "italic",
                      textAlign: "center",
                      paddingVertical: 16,
                    }}
                  >
                    Nenhuma avaliação ainda.
                  </ThemedText>
                ) : (
                  reviews.map((review) => (
                    <View
                      key={review.id}
                      style={{
                        borderWidth: 1,
                        borderColor,
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 8,
                        backgroundColor: cardColor + "80",
                      }}
                    >
                      {/* Stars + date */}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <ThemedText style={{ fontSize: 13, color: "#f59e0b" }}>
                          {"★".repeat(review.rating)}
                          {"☆".repeat(5 - review.rating)}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 10, color: mutedColor }}>
                          {new Date(review.created_at).toLocaleDateString(
                            "pt-BR",
                          )}
                        </ThemedText>
                      </View>
                      {/* Title */}
                      {review.title ? (
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: textColor,
                            marginBottom: 2,
                          }}
                        >
                          {review.title}
                        </ThemedText>
                      ) : null}
                      {/* Comment */}
                      {review.comment ? (
                        <ThemedText
                          style={{
                            fontSize: 12,
                            color: textColor,
                            lineHeight: 18,
                            marginBottom: 6,
                          }}
                        >
                          {review.comment}
                        </ThemedText>
                      ) : null}
                      {/* Verified badge */}
                      {review.is_verified_purchase && (
                        <ThemedText
                          style={{
                            fontSize: 10,
                            color: "#16a34a",
                            marginBottom: 4,
                          }}
                        >
                          ✓ Compra verificada
                        </ThemedText>
                      )}
                      {/* Builder response */}
                      {review.builder_response ? (
                        <View
                          style={{
                            marginTop: 6,
                            backgroundColor: tintColor + "08",
                            borderRadius: 6,
                            padding: 8,
                            borderLeftWidth: 3,
                            borderLeftColor: tintColor,
                          }}
                        >
                          <ThemedText
                            style={{
                              fontSize: 10,
                              fontWeight: "600",
                              color: tintColor,
                              marginBottom: 2,
                            }}
                          >
                            Resposta do desenvolvedor
                          </ThemedText>
                          <ThemedText
                            style={{
                              fontSize: 11,
                              color: textColor,
                              lineHeight: 16,
                            }}
                          >
                            {review.builder_response}
                          </ThemedText>
                        </View>
                      ) : null}
                      {/* Helpful button */}
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            await markReviewHelpful(review.id);
                            setReviews((prev) =>
                              prev.map((r) =>
                                r.id === review.id
                                  ? {
                                      ...r,
                                      helpful_count: (r.helpful_count ?? 0) + 1,
                                    }
                                  : r,
                              ),
                            );
                          } catch {
                            /* ignore */
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 6,
                          alignSelf: "flex-start",
                        }}
                      >
                        <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                          👍 Útil{" "}
                          {review.helpful_count > 0
                            ? `(${review.helpful_count})`
                            : ""}
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            {/* CTA */}
            <View style={{ marginTop: 16, gap: 8 }}>
              {isInstalled &&
                hasUpdate(detailPack, installMap.get(detailPack.id)) && (
                  <TouchableOpacity
                    onPress={() => {
                      setDetailModalOpen(false);
                      handleUpdate(detailPack);
                    }}
                    disabled={isProcessing}
                    style={{
                      paddingVertical: 12,
                      borderRadius: 10,
                      backgroundColor: "#f59e0b15",
                      alignItems: "center",
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: "#f59e0b",
                      }}
                    >
                      {isProcessing
                        ? progressLabel || "Atualizando..."
                        : `⬆ Atualizar para v${detailPack.version}`}
                    </ThemedText>
                  </TouchableOpacity>
                )}
              {isInstalled ? (
                <TouchableOpacity
                  onPress={() => {
                    setDetailModalOpen(false);
                    handleUninstall(detailPack);
                  }}
                  disabled={isProcessing}
                  style={{
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: "#dc262610",
                    alignItems: "center",
                  }}
                >
                  <ThemedText
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#dc2626",
                    }}
                  >
                    {isProcessing ? "Removendo..." : "Desinstalar"}
                  </ThemedText>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    setDetailModalOpen(false);
                    handleInstall(detailPack);
                  }}
                  disabled={isProcessing}
                  style={{
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: isProcessing ? mutedColor : tintColor,
                    alignItems: "center",
                  }}
                >
                  <ThemedText
                    style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}
                  >
                    {isProcessing
                      ? "Processando..."
                      : packRequiresPayment(detailPack)
                        ? detailPack.pricing_type === "monthly" &&
                          detailPack.trial_days > 0
                          ? `Começar trial de ${detailPack.trial_days} dias`
                          : `Adquirir — ${formatPackPrice(detailPack)}`
                        : "Instalar Pack"}
                  </ThemedText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setDetailModalOpen(false)}
                style={{
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{ fontSize: 13, fontWeight: "600", color: textColor }}
                >
                  Fechar
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  /* ================================================================ */
  /*  Main Render                                                       */
  /* ================================================================ */

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        {/* Header */}
        <View style={{ marginBottom: 16 }}>
          <ThemedText
            style={{ fontSize: 22, fontWeight: "bold", color: textColor }}
          >
            📦 Pack Marketplace
          </ThemedText>
          <ThemedText style={{ fontSize: 13, color: mutedColor, marginTop: 4 }}>
            Encontre e instale packs para configurar seu tenant em minutos
          </ThemedText>
        </View>

        {/* Search */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Pesquisar packs..."
          placeholderTextColor={mutedColor}
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: cardColor,
            color: textColor,
            fontSize: 14,
            marginBottom: 12,
          }}
        />

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 12 }}
          contentContainerStyle={{ gap: 8, paddingRight: 16 }}
        >
          <TouchableOpacity
            onPress={() => setActiveCategory(null)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: !activeCategory ? tintColor : borderColor + "40",
            }}
          >
            <ThemedText
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: !activeCategory ? "#fff" : textColor,
              }}
            >
              Todos
            </ThemedText>
          </TouchableOpacity>
          {MARKETPLACE_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.value}
              onPress={() =>
                setActiveCategory(
                  activeCategory === cat.value ? null : cat.value,
                )
              }
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor:
                  activeCategory === cat.value ? tintColor : borderColor + "40",
              }}
            >
              <ThemedText
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: activeCategory === cat.value ? "#fff" : textColor,
                }}
              >
                {cat.icon} {cat.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sort chips */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          {(
            [
              { key: "popular", label: "🔥 Popular" },
              { key: "newest", label: "🆕 Recentes" },
              { key: "rating", label: "⭐ Rating" },
              { key: "name", label: "🔤 Nome" },
            ] as const
          ).map((sort) => (
            <TouchableOpacity
              key={sort.key}
              onPress={() => setActiveSort(sort.key)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 6,
                backgroundColor:
                  activeSort === sort.key ? tintColor + "15" : "transparent",
                borderWidth: 1,
                borderColor: activeSort === sort.key ? tintColor : borderColor,
              }}
            >
              <ThemedText
                style={{
                  fontSize: 11,
                  fontWeight: activeSort === sort.key ? "700" : "500",
                  color: activeSort === sort.key ? tintColor : mutedColor,
                }}
              >
                {sort.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Error */}
        {error && (
          <View
            style={{
              backgroundColor: "#fee2e2",
              borderRadius: 10,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <ThemedText style={{ color: "#dc2626", fontSize: 13 }}>
              {error}
            </ThemedText>
          </View>
        )}

        {/* Loading */}
        {loading && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={tintColor} />
            <ThemedText style={{ color: mutedColor, marginTop: 8 }}>
              Carregando marketplace...
            </ThemedText>
          </View>
        )}

        {/* Empty state */}
        {!loading && packs.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ThemedText style={{ fontSize: 40, marginBottom: 12 }}>
              📦
            </ThemedText>
            <ThemedText
              style={{ fontSize: 15, fontWeight: "600", color: textColor }}
            >
              Nenhum pack encontrado
            </ThemedText>
            <ThemedText
              style={{ fontSize: 13, color: mutedColor, marginTop: 4 }}
            >
              {search || activeCategory
                ? "Tente ajustar os filtros"
                : "Packs serão publicados em breve"}
            </ThemedText>
          </View>
        )}

        {/* Official packs section */}
        {!loading && officialPacks.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <ThemedText
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: textColor,
                marginBottom: 10,
              }}
            >
              ⭐ Packs Oficiais
            </ThemedText>
            <View
              style={
                IS_DESKTOP
                  ? { flexDirection: "row", flexWrap: "wrap" }
                  : undefined
              }
            >
              {officialPacks.map(renderPackCard)}
            </View>
          </View>
        )}

        {/* Community packs section */}
        {!loading && communityPacks.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <ThemedText
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: textColor,
                marginBottom: 10,
              }}
            >
              🌐 Packs da Comunidade
            </ThemedText>
            <View
              style={
                IS_DESKTOP
                  ? { flexDirection: "row", flexWrap: "wrap" }
                  : undefined
              }
            >
              {communityPacks.map(renderPackCard)}
            </View>
          </View>
        )}
      </ScrollView>

      {renderDetailModal()}

      {/* ── Payment Modal (PIX) ── */}
      <Modal
        transparent
        visible={paymentModalOpen}
        animationType="slide"
        onRequestClose={() => {
          setPaymentModalOpen(false);
          setPurchasingPack(null);
          setPaymentResult(null);
          setPixCopied(false);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 20,
              padding: 24,
              maxHeight: "85%",
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={{ alignItems: "center", marginBottom: 20 }}>
                <ThemedText style={{ fontSize: 32, marginBottom: 8 }}>
                  {purchasingPack?.icon || "💳"}
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: textColor,
                    textAlign: "center",
                  }}
                >
                  Pagamento via PIX
                </ThemedText>
                <ThemedText
                  style={{
                    fontSize: 13,
                    color: mutedColor,
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  {purchasingPack?.name}
                </ThemedText>
              </View>

              {/* Amount */}
              {paymentResult?.totalAmount !== undefined && (
                <View
                  style={{
                    backgroundColor: tintColor + "10",
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    alignItems: "center",
                    marginBottom: 20,
                  }}
                >
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginBottom: 2 }}
                  >
                    Valor
                  </ThemedText>
                  <ThemedText
                    style={{
                      fontSize: 28,
                      fontWeight: "800",
                      color: tintColor,
                    }}
                  >
                    R${" "}
                    {(paymentResult.totalAmount / 100).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </ThemedText>
                  {purchasingPack?.pricing_type === "monthly" && (
                    <ThemedText
                      style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}
                    >
                      Cobrança mensal recorrente
                    </ThemedText>
                  )}
                </View>
              )}

              {/* PIX QR Code */}
              {paymentResult?.pixQrBase64 && (
                <View style={{ alignItems: "center", marginBottom: 16 }}>
                  <View
                    style={{
                      backgroundColor: "#fff",
                      padding: 12,
                      borderRadius: 12,
                      marginBottom: 8,
                    }}
                  >
                    <Image
                      source={{
                        uri: `data:image/png;base64,${paymentResult.pixQrBase64}`,
                      }}
                      style={{ width: 200, height: 200 }}
                      resizeMode="contain"
                    />
                  </View>
                  <ThemedText
                    style={{
                      fontSize: 11,
                      color: mutedColor,
                      textAlign: "center",
                    }}
                  >
                    Escaneie o QR Code com o app do seu banco
                  </ThemedText>
                </View>
              )}

              {/* PIX Copia e Cola */}
              {paymentResult?.pixPayload && (
                <View style={{ marginBottom: 16 }}>
                  <ThemedText
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: textColor,
                      marginBottom: 6,
                    }}
                  >
                    PIX Copia e Cola
                  </ThemedText>
                  <View
                    style={{
                      backgroundColor: backgroundColor,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor,
                      padding: 10,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 11,
                        color: mutedColor,
                        fontFamily:
                          Platform.OS === "web" ? "monospace" : undefined,
                      }}
                      numberOfLines={3}
                    >
                      {paymentResult.pixPayload}
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await Clipboard.setStringAsync(
                          paymentResult.pixPayload!,
                        );
                        setPixCopied(true);
                        setTimeout(() => setPixCopied(false), 3000);
                      } catch {
                        Alert.alert("Erro", "Falha ao copiar código PIX.");
                      }
                    }}
                    style={{
                      marginTop: 8,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: pixCopied ? "#16a34a" : tintColor,
                      alignItems: "center",
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "#fff",
                      }}
                    >
                      {pixCopied ? "✓ Código copiado!" : "Copiar código PIX"}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              )}

              {/* Info message */}
              <View
                style={{
                  backgroundColor: "#f59e0b15",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 12,
                    color: "#b45309",
                    textAlign: "center",
                    lineHeight: 18,
                  }}
                >
                  Após o pagamento, o pack será instalado automaticamente no seu
                  tenant. A confirmação pode levar alguns minutos.
                </ThemedText>
              </View>
            </ScrollView>

            {/* Close button */}
            <TouchableOpacity
              onPress={() => {
                setPaymentModalOpen(false);
                setPurchasingPack(null);
                setPaymentResult(null);
                setPixCopied(false);
              }}
              style={{
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <ThemedText
                style={{ fontSize: 14, fontWeight: "600", color: textColor }}
              >
                Fechar
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Review Form Modal ── */}
      <Modal
        transparent
        visible={reviewModalOpen}
        animationType="slide"
        onRequestClose={() => setReviewModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 20,
              padding: 24,
            }}
          >
            <ThemedText
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: textColor,
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              Avaliar Pack
            </ThemedText>

            {/* Star picker */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setReviewRating(star)}
                  style={{ padding: 4 }}
                >
                  <ThemedText
                    style={{
                      fontSize: 32,
                      color: star <= reviewRating ? "#f59e0b" : borderColor,
                    }}
                  >
                    {star <= reviewRating ? "★" : "☆"}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Title */}
            <TextInput
              value={reviewTitle}
              onChangeText={setReviewTitle}
              placeholder="Título (opcional)"
              placeholderTextColor={mutedColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                color: textColor,
                fontSize: 14,
                backgroundColor: backgroundColor,
                marginBottom: 10,
              }}
            />

            {/* Comment */}
            <TextInput
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="Comentário (opcional)"
              placeholderTextColor={mutedColor}
              multiline
              numberOfLines={4}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
                color: textColor,
                fontSize: 14,
                backgroundColor: backgroundColor,
                marginBottom: 16,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />

            {/* Buttons */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setReviewModalOpen(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{ fontSize: 14, fontWeight: "600", color: textColor }}
                >
                  Cancelar
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmitReview}
                disabled={submittingReview}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: submittingReview ? mutedColor : tintColor,
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}
                >
                  {submittingReview ? "Enviando..." : "Enviar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
