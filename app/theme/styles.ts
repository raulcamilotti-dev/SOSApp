import { Platform, StyleSheet } from "react-native";
import Colors from "./colors";

/* ======================================================
 * DESIGN TOKENS
 * ====================================================== */

/* ---------- CORES ---------- */

export const colors = {
  // Removido: agora usamos Colors do tema global
};

/* ---------- ESPAÇAMENTO ---------- */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

/* ---------- RADIUS ---------- */

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
};

/* ---------- TIPOGRAFIA ---------- */

export const typography = {
  title: {
    fontSize: 22,
    fontWeight: "600" as const,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "500" as const,
    lineHeight: 22,
  },
  body: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "500" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
  caption: {
    fontSize: 11,
    fontWeight: "400" as const,
    lineHeight: 16,
  },
};

/* ---------- SOMBRAS ---------- */

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
};

/* ======================================================
 * GLOBAL STYLES
 * ====================================================== */

export const styles = StyleSheet.create({
  /* ---------- LAYOUT ---------- */

  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },

  container: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 0,
    backgroundColor: Colors.light.background,
  },
  listContainer: {
    padding: 24,
    paddingBottom: 140,
  },

  card: {
    width: "100%",
    backgroundColor: Colors.light.card,
    padding: spacing.lg,
    borderRadius: radius.md,
    ...(Platform.OS !== "web" ? shadows.card : {}),
  },

  /* ---------- TEXTO PRINCIPAL ---------- */

  title: {
    ...typography.title,
    color: Colors.light.text,
    marginBottom: spacing.md,
    textAlign: "center",
  },

  text: {
    ...typography.body,
    color: Colors.light.text,
  },

  mutedText: {
    ...typography.body,
    color: Colors.light.muted,
  },

  /* ---------- LABEL / META ---------- */

  label: {
    ...typography.label,
    color: Colors.light.muted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },

  /* ---------- LINKS / AÇÕES ---------- */

  link: {
    marginTop: spacing.md,
    color: Colors.light.tint,
    textAlign: "center",
    fontWeight: "500",
  },

  /* ---------- INPUT ---------- */

  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: Colors.light.input,
    color: Colors.light.text,
  },

  inputError: {
    borderColor: "#E74C3C",
  },

  /* ---------- BOTÃO ---------- */

  button: {
    width: "100%",
    backgroundColor: Colors.light.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.lg,
    alignItems: "center",
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: Colors.light.card,
    fontWeight: "600",
  },

  /* ---------- PROCESSOS ---------- */

  processCard: {
    backgroundColor: Platform.OS === "web" ? "#23283a" : Colors.light.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1.5,
    borderColor: Platform.OS === "web" ? "#e5e7eb" : Colors.light.border,
    marginBottom: spacing.xxl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
    ...(Platform.OS === "web"
      ? { background: "linear-gradient(180deg, #23283a 0%, #2d3246 100%)" }
      : {}),
  },

  processTitle: {
    ...typography.subtitle,
    color: Colors.light.text,
    marginBottom: spacing.xs,
  },

  processSubtitle: {
    ...typography.body,
    color: Colors.light.muted,
    marginBottom: spacing.sm,
  },

  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E8F2FF",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },

  statusText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.light.tint,
  },
  infoBlock: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
  },

  infoRow: {
    marginBottom: 10,
  },

  infoLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 2,
  },

  infoValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
});
