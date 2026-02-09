import { Platform, StyleSheet } from "react-native";

/* ======================================================
 * DESIGN TOKENS
 * ====================================================== */

/* ---------- CORES ---------- */

export const colors = {
  brand: {
    primary: "#0a7ea4",
    secondary: "#111827",
    accent: "#38bdf8",
  },

  background: {
    app: "#f7f7f7",
    card: "#ffffff",
    input: "#ffffff",
  },

  text: {
    primary: "#0b0b0b",
    secondary: "#334155",
    muted: "#64748b",
    inverse: "#ffffff",
  },

  border: {
    light: "#e5e7eb",
    medium: "#cbd5f5",
    focus: "#38bdf8",
  },
  feedback: {
    success: "#2ECC71",
    warning: "#F1C40F",
    error: "#E74C3C",
    info: "#3498DB",
  },
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
    backgroundColor: colors.background.app,
  },

  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  listContainer: {
    padding: 24,
    paddingBottom: 140,
  },

  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "transparent",
    padding: spacing.lg,
    borderRadius: radius.md,
    ...(Platform.OS !== "web" ? shadows.card : {}),
  },

  /* ---------- TEXTO PRINCIPAL ---------- */

  title: {
    ...typography.title,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: "center",
  },

  text: {
    ...typography.body,
    color: colors.text.primary,
  },

  mutedText: {
    ...typography.body,
    color: colors.text.muted,
  },

  /* ---------- LABEL / META ---------- */

  label: {
    ...typography.label,
    color: colors.text.muted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },

  /* ---------- LINKS / AÇÕES ---------- */

  link: {
    marginTop: spacing.md,
    color: colors.brand.accent,
    textAlign: "center",
    fontWeight: "500",
  },

  /* ---------- INPUT ---------- */

  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: "transparent",
    color: colors.text.primary,
  },

  inputError: {
    borderColor: colors.feedback.error,
  },

  /* ---------- BOTÃO ---------- */

  button: {
    width: "100%",
    backgroundColor: colors.brand.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.lg,
    alignItems: "center",
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: colors.text.inverse,
    fontWeight: "600",
  },

  /* ---------- PROCESSOS ---------- */

  processCard: {
    backgroundColor: "transparent",
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    marginBottom: spacing.lg,
    ...(Platform.OS !== "web" ? shadows.card : {}),
  },

  processTitle: {
    ...typography.subtitle,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },

  processSubtitle: {
    ...typography.body,
    color: colors.text.muted,
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
    color: colors.brand.accent,
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
