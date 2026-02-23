import {
    getExistingReview,
    submitReview,
    validatePortalToken,
} from "@/services/portal-publico";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ── Constants ──────────────────────────────────────────────────── */
const BG_COLOR = "#f8fafc";
const CARD_BG = "#ffffff";
const BRAND_COLOR = "#0a7ea4";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const SUCCESS_COLOR = "#22c55e";
const ERROR_COLOR = "#ef4444";
const STAR_COLOR = "#f59e0b";

type Phase = "loading" | "review" | "submitted" | "already" | "error";

export default function PublicReview() {
  const { token } = useLocalSearchParams<{ token: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [tenantName, setTenantName] = useState("");
  const [orderTitle, setOrderTitle] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        // Check if token is valid
        const info = await validatePortalToken(token);
        if (!info.valid) {
          setPhase("error");
          setErrorMsg(
            info.isRevoked
              ? "Este link foi desativado."
              : "Link de avaliação não encontrado.",
          );
          return;
        }
        setTenantName(info.tenantName ?? "");
        setOrderTitle(info.title ?? "Processo");

        // Check if review already exists
        const existing = await getExistingReview(token);
        if (existing) {
          setRating(existing.rating);
          setComment(existing.comment ?? "");
          setPhase("already");
          return;
        }

        setPhase("review");
      } catch {
        setPhase("error");
        setErrorMsg("Erro ao carregar a página de avaliação.");
      }
    })();
  }, [token]);

  const handleSubmit = useCallback(async () => {
    if (!token || rating === 0) return;
    setSubmitting(true);
    try {
      const result = await submitReview(token, rating, comment);
      if (result.success) {
        setPhase("submitted");
      } else {
        setErrorMsg(result.error ?? "Erro ao enviar avaliação.");
        if (result.error?.includes("já enviada")) {
          setPhase("already");
        }
      }
    } catch {
      setErrorMsg("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }, [token, rating, comment]);

  /* ── Loading ── */
  if (phase === "loading") {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={BRAND_COLOR} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  /* ── Error ── */
  if (phase === "error") {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={56} color={ERROR_COLOR} />
        <Text style={styles.errorTitle}>Ops!</Text>
        <Text style={styles.errorSubtitle}>{errorMsg}</Text>
      </View>
    );
  }

  /* ── Already submitted ── */
  if (phase === "already") {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="checkmark-circle" size={64} color={SUCCESS_COLOR} />
        <Text style={styles.errorTitle}>Avaliação já enviada</Text>
        <Text style={styles.errorSubtitle}>
          Você já avaliou este processo. Obrigado pelo feedback!
        </Text>
        <View style={{ flexDirection: "row", marginTop: 16, gap: 4 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Ionicons
              key={star}
              name={star <= rating ? "star" : "star-outline"}
              size={28}
              color={STAR_COLOR}
            />
          ))}
        </View>
        {comment ? (
          <Text
            style={{
              marginTop: 12,
              fontSize: 14,
              color: TEXT_SECONDARY,
              textAlign: "center",
              fontStyle: "italic",
              maxWidth: 320,
            }}
          >
            &ldquo;{comment}&rdquo;
          </Text>
        ) : null}
      </View>
    );
  }

  /* ── Submitted success ── */
  if (phase === "submitted") {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="heart-circle" size={72} color={BRAND_COLOR} />
        <Text style={styles.successTitle}>Obrigado!</Text>
        <Text style={styles.successSubtitle}>
          Sua avaliação foi registrada com sucesso. Seu feedback nos ajuda a
          melhorar.
        </Text>
        <View style={{ flexDirection: "row", marginTop: 16, gap: 4 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Ionicons
              key={star}
              name={star <= rating ? "star" : "star-outline"}
              size={28}
              color={STAR_COLOR}
            />
          ))}
        </View>
      </View>
    );
  }

  /* ── Review form ── */
  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Brand header */}
      <View style={styles.brandHeader}>
        <Text style={styles.brandName}>{tenantName || "SOS Platform"}</Text>
        <Text style={styles.brandSubtitle}>Avaliação de atendimento</Text>
      </View>

      {/* Review card */}
      <View style={[styles.card, { marginTop: 24 }]}>
        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <Ionicons name="star-half-outline" size={48} color={STAR_COLOR} />
          <Text style={styles.reviewTitle}>Como foi o atendimento?</Text>
          <Text style={styles.reviewSubtitle}>{orderTitle}</Text>
        </View>

        {/* Stars */}
        <View style={styles.starsContainer}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => setRating(star)}
              style={styles.starButton}
            >
              <Ionicons
                name={star <= rating ? "star" : "star-outline"}
                size={44}
                color={star <= rating ? STAR_COLOR : TEXT_MUTED}
              />
            </TouchableOpacity>
          ))}
        </View>
        {rating > 0 && (
          <Text style={styles.ratingLabel}>
            {rating === 1
              ? "Muito ruim"
              : rating === 2
                ? "Ruim"
                : rating === 3
                  ? "Regular"
                  : rating === 4
                    ? "Bom"
                    : "Excelente"}
          </Text>
        )}

        {/* Comment */}
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Deixe um comentário (opcional)"
          multiline
          numberOfLines={4}
          style={styles.commentInput}
          placeholderTextColor={TEXT_MUTED}
          textAlignVertical="top"
        />

        {/* Error */}
        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={rating === 0 || submitting}
          style={[
            styles.submitButton,
            (rating === 0 || submitting) && styles.submitButtonDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Enviar Avaliação</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Powered by <Text style={{ fontWeight: "600" }}>SOS Platform</Text>
        </Text>
      </View>
    </ScrollView>
  );
}

/* ── Styles ── */
const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: BG_COLOR,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: TEXT_SECONDARY,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },
  errorSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
  },
  successTitle: {
    marginTop: 16,
    fontSize: 26,
    fontWeight: "700",
    color: BRAND_COLOR,
    textAlign: "center",
  },
  successSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
  },
  scrollView: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  scrollContent: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  brandHeader: {
    backgroundColor: BRAND_COLOR,
    marginHorizontal: -16,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "web" ? 32 : 56,
    paddingBottom: 24,
  },
  brandName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  brandSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    ...Platform.select({
      web: { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
      },
    }),
  },
  reviewTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginTop: 12,
  },
  reviewSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 4,
  },
  starsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginVertical: 20,
  },
  starButton: {
    padding: 4,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: STAR_COLOR,
    textAlign: "center",
    marginBottom: 20,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: TEXT_PRIMARY,
    backgroundColor: BG_COLOR,
    minHeight: 100,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: ERROR_COLOR,
    textAlign: "center",
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: BRAND_COLOR,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
    paddingVertical: 24,
    marginTop: 16,
  },
  footerText: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
});
