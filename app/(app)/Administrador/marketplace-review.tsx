/**
 * Marketplace Review — SuperAdmin screen to approve/reject marketplace packs.
 *
 * Shows packs in "pending_review" status. Admin can:
 *  - Preview pack contents (entity counts, metadata)
 *  - Approve → publishes the pack
 *  - Reject → returns to builder with reason
 *
 * @module A.5 — Pack Marketplace MVP
 */

import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    approveRejectPack,
    archivePack,
    listMarketplacePacks,
    MARKETPLACE_CATEGORIES,
    type MarketplacePack,
    type MarketplacePackStatus,
} from "@/services/marketplace-packs";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ================================================================== */
/*  Status Helpers                                                      */
/* ================================================================== */

const STATUS_CONFIG: Record<
  MarketplacePackStatus,
  { label: string; color: string; bg: string }
> = {
  draft: { label: "Rascunho", color: "#6b7280", bg: "#f3f4f6" },
  pending_review: { label: "Pendente", color: "#d97706", bg: "#fef3c7" },
  published: { label: "Publicado", color: "#059669", bg: "#d1fae5" },
  rejected: { label: "Rejeitado", color: "#dc2626", bg: "#fee2e2" },
  archived: { label: "Arquivado", color: "#6b7280", bg: "#f3f4f6" },
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export default function MarketplaceReviewScreen() {
  const isFocused = useIsFocused();

  /* ---- Theme ---- */
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ---- State ---- */
  const [packs, setPacks] = useState<MarketplacePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"pending_review" | "all">(
    "pending_review",
  );

  // Detail / action modal
  const [selectedPack, setSelectedPack] = useState<MarketplacePack | null>(
    null,
  );
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);

  /* ---- Load packs ---- */
  const loadPacks = useCallback(async () => {
    try {
      const list = await listMarketplacePacks({
        status: filter === "pending_review" ? "pending_review" : undefined,
        includeAll: filter === "all",
      });
      setPacks(list);
    } catch (err) {
      console.error("[MarketplaceReview]", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      loadPacks();
    }
  }, [isFocused, loadPacks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPacks();
  }, [loadPacks]);

  /* ---- Approve ---- */
  const handleApprove = useCallback(
    async (pack: MarketplacePack) => {
      const doApprove = async () => {
        setProcessing(true);
        try {
          await approveRejectPack(pack.id, "published");
          Alert.alert(
            "Aprovado!",
            `Pack "${pack.name}" publicado no marketplace.`,
          );
          setActionModalOpen(false);
          setSelectedPack(null);
          loadPacks();
        } catch (err: any) {
          Alert.alert("Erro", err?.message || "Falha ao aprovar.");
        } finally {
          setProcessing(false);
        }
      };

      if (Platform.OS === "web") {
        if (window.confirm(`Aprovar e publicar "${pack.name}"?`)) {
          doApprove();
        }
      } else {
        Alert.alert("Aprovar pack", `Publicar "${pack.name}" no marketplace?`, [
          { text: "Cancelar", style: "cancel" },
          { text: "Aprovar", onPress: doApprove },
        ]);
      }
    },
    [loadPacks],
  );

  /* ---- Reject ---- */
  const handleReject = useCallback(
    async (pack: MarketplacePack) => {
      if (!rejectReason.trim()) {
        Alert.alert("Motivo obrigatório", "Informe o motivo da rejeição.");
        return;
      }

      setProcessing(true);
      try {
        await approveRejectPack(pack.id, "rejected", rejectReason.trim());
        Alert.alert("Rejeitado", `Pack "${pack.name}" rejeitado.`);
        setActionModalOpen(false);
        setSelectedPack(null);
        setRejectReason("");
        loadPacks();
      } catch (err: any) {
        Alert.alert("Erro", err?.message || "Falha ao rejeitar.");
      } finally {
        setProcessing(false);
      }
    },
    [rejectReason, loadPacks],
  );

  /* ---- Archive / Remove ---- */
  const handleArchive = useCallback(
    async (pack: MarketplacePack) => {
      const doArchive = async () => {
        setProcessing(true);
        try {
          await archivePack(pack.id);
          Alert.alert(
            "Removido",
            `Pack "${pack.name}" foi removido do marketplace.`,
          );
          setActionModalOpen(false);
          setSelectedPack(null);
          loadPacks();
        } catch (err: any) {
          Alert.alert("Erro", err?.message || "Falha ao remover.");
        } finally {
          setProcessing(false);
        }
      };

      if (Platform.OS === "web") {
        if (
          window.confirm(
            `Remover "${pack.name}" do marketplace? O pack ficará arquivado e não será mais visível para tenants.`,
          )
        ) {
          doArchive();
        }
      } else {
        Alert.alert(
          "Remover do Marketplace",
          `"${pack.name}" ficará arquivado e não será mais visível para tenants. Deseja continuar?`,
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Remover", style: "destructive", onPress: doArchive },
          ],
        );
      }
    },
    [loadPacks],
  );

  /* ---- Parse pack_data summary ---- */
  const getPackSummary = (pack: MarketplacePack) => {
    const data = pack.pack_data as any;
    if (!data) return [];
    const summary: { label: string; count: number }[] = [];
    const keys = [
      { k: "service_categories", l: "Categorias" },
      { k: "service_types", l: "Tipos de Serviço" },
      { k: "workflows", l: "Workflows" },
      { k: "workflow_steps", l: "Etapas" },
      { k: "roles", l: "Papéis" },
      { k: "document_templates", l: "Docs" },
      { k: "deadline_rules", l: "Prazos" },
      { k: "modules", l: "Módulos" },
    ];
    for (const { k, l } of keys) {
      const arr = data[k];
      if (Array.isArray(arr) && arr.length > 0) {
        summary.push({ label: l, count: arr.length });
      }
    }
    return summary;
  };

  /* ---- Category label ---- */
  const getCategoryLabel = (cat: string) => {
    const found = MARKETPLACE_CATEGORIES.find((c) => c.value === cat);
    return found ? `${found.icon} ${found.label}` : cat;
  };

  /* ================================================================ */
  /*  Render                                                            */
  /* ================================================================ */

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12, color: mutedColor }}>
          Carregando...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={{ marginBottom: 16 }}>
          <ThemedText
            style={{ fontSize: 22, fontWeight: "bold", color: textColor }}
          >
            🔍 Revisar Packs
          </ThemedText>
          <ThemedText style={{ fontSize: 13, color: mutedColor, marginTop: 4 }}>
            Aprovar ou rejeitar packs enviados por builders
          </ThemedText>
        </View>

        {/* Filter chips */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => setFilter("pending_review")}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor:
                filter === "pending_review" ? tintColor : cardColor,
              borderWidth: 1,
              borderColor:
                filter === "pending_review" ? tintColor : borderColor,
            }}
          >
            <ThemedText
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: filter === "pending_review" ? "#fff" : textColor,
              }}
            >
              Pendentes (
              {packs.filter((p) => p.status === "pending_review").length})
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter("all")}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: filter === "all" ? tintColor : cardColor,
              borderWidth: 1,
              borderColor: filter === "all" ? tintColor : borderColor,
            }}
          >
            <ThemedText
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: filter === "all" ? "#fff" : textColor,
              }}
            >
              Todos
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Pack list */}
        {packs.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Ionicons
              name="checkmark-circle-outline"
              size={40}
              color={mutedColor}
            />
            <ThemedText
              style={{ color: mutedColor, fontSize: 14, marginTop: 8 }}
            >
              {filter === "pending_review"
                ? "Nenhum pack pendente de revisão"
                : "Nenhum pack encontrado"}
            </ThemedText>
          </View>
        ) : (
          packs.map((pack) => {
            const statusInfo =
              STATUS_CONFIG[pack.status] ?? STATUS_CONFIG.draft;
            const summary = getPackSummary(pack);

            return (
              <TouchableOpacity
                key={pack.id}
                onPress={() => {
                  setSelectedPack(pack);
                  setActionModalOpen(true);
                  setRejectReason("");
                }}
                style={{
                  backgroundColor: cardColor,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor,
                  padding: 16,
                  marginBottom: 10,
                }}
              >
                {/* Title Row */}
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <ThemedText style={{ fontSize: 20 }}>
                    {pack.icon || "📦"}
                  </ThemedText>
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: textColor,
                      }}
                    >
                      {pack.name}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                      {pack.slug} · v{pack.version || "1.0.0"}
                    </ThemedText>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: statusInfo.bg,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: statusInfo.color,
                      }}
                    >
                      {statusInfo.label}
                    </ThemedText>
                  </View>
                </View>

                {/* Description */}
                <ThemedText
                  style={{ fontSize: 12, color: mutedColor, marginTop: 8 }}
                  numberOfLines={2}
                >
                  {pack.description}
                </ThemedText>

                {/* Category + stats */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginTop: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <View
                    style={{
                      backgroundColor: inputBg,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}
                  >
                    <ThemedText style={{ fontSize: 10, color: mutedColor }}>
                      {getCategoryLabel(pack.category || "generico")}
                    </ThemedText>
                  </View>
                  {summary.slice(0, 3).map((s) => (
                    <View
                      key={s.label}
                      style={{
                        backgroundColor: inputBg,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}
                    >
                      <ThemedText style={{ fontSize: 10, color: mutedColor }}>
                        {s.count} {s.label}
                      </ThemedText>
                    </View>
                  ))}
                </View>

                {/* Submitted date */}
                {pack.created_at && (
                  <ThemedText
                    style={{ fontSize: 10, color: mutedColor, marginTop: 6 }}
                  >
                    Enviado em{" "}
                    {new Date(pack.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </ThemedText>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ── Action Modal ── */}
      <Modal
        visible={actionModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setActionModalOpen(false)}
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
              maxHeight: "85%",
            }}
          >
            {selectedPack && (
              <>
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 16,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={{
                        fontSize: 18,
                        fontWeight: "700",
                        color: textColor,
                      }}
                    >
                      {selectedPack.icon || "📦"} {selectedPack.name}
                    </ThemedText>
                    <ThemedText
                      style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}
                    >
                      {selectedPack.slug} · v{selectedPack.version || "1.0.0"} ·{" "}
                      {getCategoryLabel(selectedPack.category || "generico")}
                    </ThemedText>
                  </View>
                  <TouchableOpacity
                    onPress={() => setActionModalOpen(false)}
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

                <ScrollView style={{ maxHeight: 400 }}>
                  {/* Description */}
                  <ThemedText
                    style={{ fontSize: 13, color: textColor, marginBottom: 12 }}
                  >
                    {selectedPack.description}
                  </ThemedText>
                  {selectedPack.long_description && (
                    <ThemedText
                      style={{
                        fontSize: 12,
                        color: mutedColor,
                        marginBottom: 12,
                        lineHeight: 18,
                      }}
                    >
                      {selectedPack.long_description}
                    </ThemedText>
                  )}

                  {/* Pack Contents Summary */}
                  <ThemedText
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: textColor,
                      marginBottom: 8,
                    }}
                  >
                    Conteúdo do Pack
                  </ThemedText>
                  {getPackSummary(selectedPack).map((s) => (
                    <View
                      key={s.label}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        paddingVertical: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor + "30",
                      }}
                    >
                      <ThemedText style={{ fontSize: 12, color: textColor }}>
                        {s.label}
                      </ThemedText>
                      <ThemedText
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: tintColor,
                        }}
                      >
                        {s.count}
                      </ThemedText>
                    </View>
                  ))}

                  {/* Tags */}
                  {selectedPack.tags &&
                    (selectedPack.tags as string[]).length > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 4,
                          marginTop: 12,
                        }}
                      >
                        {(selectedPack.tags as string[]).map((tag) => (
                          <View
                            key={tag}
                            style={{
                              backgroundColor: inputBg,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 4,
                            }}
                          >
                            <ThemedText
                              style={{ fontSize: 10, color: mutedColor }}
                            >
                              #{tag}
                            </ThemedText>
                          </View>
                        ))}
                      </View>
                    )}

                  {/* Builder info + Pricing */}
                  {selectedPack.builder_id && (
                    <ThemedText
                      style={{ fontSize: 11, color: mutedColor, marginTop: 12 }}
                    >
                      Builder: {selectedPack.builder_id}
                    </ThemedText>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      marginTop: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                      Preço:{" "}
                      {selectedPack.pricing_type === "free"
                        ? "Gratuito"
                        : `R$ ${((selectedPack.price_cents ?? 0) / 100).toFixed(2)} (${selectedPack.pricing_type === "monthly" ? "mensal" : "único"})`}
                    </ThemedText>
                    {selectedPack.pricing_type !== "free" && (
                      <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                        Revenue share: Builder{" "}
                        {selectedPack.builder_share_percent ?? 70}% · Plataforma{" "}
                        {(
                          100 - (selectedPack.builder_share_percent ?? 70)
                        ).toFixed(0)}
                        %
                      </ThemedText>
                    )}
                  </View>

                  {/* Reject reason if already rejected */}
                  {selectedPack.status === "rejected" &&
                    selectedPack.rejection_reason && (
                      <View
                        style={{
                          backgroundColor: "#fee2e2",
                          borderRadius: 8,
                          padding: 10,
                          marginTop: 12,
                        }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color: "#dc2626",
                          }}
                        >
                          Motivo da rejeição:
                        </ThemedText>
                        <ThemedText
                          style={{
                            fontSize: 12,
                            color: "#dc2626",
                            marginTop: 4,
                          }}
                        >
                          {selectedPack.rejection_reason}
                        </ThemedText>
                      </View>
                    )}

                  {/* Remove / Archive action — available for published and pending packs */}
                  {selectedPack.status !== "archived" &&
                    selectedPack.status !== "draft" && (
                      <TouchableOpacity
                        onPress={() => handleArchive(selectedPack)}
                        disabled={processing}
                        style={{
                          marginTop: 16,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: processing ? mutedColor : "#f59e0b",
                          alignItems: "center",
                          flexDirection: "row",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        <Ionicons
                          name="archive-outline"
                          size={18}
                          color="#fff"
                        />
                        <ThemedText
                          style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: 13,
                          }}
                        >
                          Remover do Marketplace
                        </ThemedText>
                      </TouchableOpacity>
                    )}

                  {/* Actions for pending_review */}
                  {selectedPack.status === "pending_review" && (
                    <View style={{ marginTop: 20 }}>
                      {/* Reject reason input */}
                      <ThemedText
                        style={{
                          fontSize: 12,
                          color: mutedColor,
                          marginBottom: 4,
                        }}
                      >
                        Motivo da rejeição (obrigatório para rejeitar):
                      </ThemedText>
                      <TextInput
                        value={rejectReason}
                        onChangeText={setRejectReason}
                        placeholder="Descreva o que precisa ser corrigido..."
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
                          fontSize: 13,
                          minHeight: 60,
                          textAlignVertical: "top",
                          marginBottom: 12,
                        }}
                      />

                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {/* Reject */}
                        <TouchableOpacity
                          onPress={() => handleReject(selectedPack)}
                          disabled={processing}
                          style={{
                            flex: 1,
                            paddingVertical: 12,
                            borderRadius: 10,
                            backgroundColor: processing
                              ? mutedColor
                              : "#dc2626",
                            alignItems: "center",
                            flexDirection: "row",
                            justifyContent: "center",
                            gap: 6,
                          }}
                        >
                          <Ionicons
                            name="close-circle-outline"
                            size={18}
                            color="#fff"
                          />
                          <ThemedText
                            style={{
                              color: "#fff",
                              fontWeight: "700",
                              fontSize: 13,
                            }}
                          >
                            Rejeitar
                          </ThemedText>
                        </TouchableOpacity>

                        {/* Approve */}
                        <TouchableOpacity
                          onPress={() => handleApprove(selectedPack)}
                          disabled={processing}
                          style={{
                            flex: 1,
                            paddingVertical: 12,
                            borderRadius: 10,
                            backgroundColor: processing
                              ? mutedColor
                              : "#059669",
                            alignItems: "center",
                            flexDirection: "row",
                            justifyContent: "center",
                            gap: 6,
                          }}
                        >
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={18}
                            color="#fff"
                          />
                          <ThemedText
                            style={{
                              color: "#fff",
                              fontWeight: "700",
                              fontSize: 13,
                            }}
                          >
                            Aprovar
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </ScrollView>

                {/* Close button */}
                <TouchableOpacity
                  onPress={() => setActionModalOpen(false)}
                  style={{
                    marginTop: 12,
                    paddingVertical: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor,
                    alignItems: "center",
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    Fechar
                  </ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
