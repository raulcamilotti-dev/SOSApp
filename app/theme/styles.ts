import { Appearance, Platform, StyleSheet } from "react-native";
import Colors from "./colors";

const theme = Appearance.getColorScheme() === "dark" ? "dark" : "light";
const palette = Colors[theme];

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
    backgroundColor: palette.background,
  },

  container: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 0,
    backgroundColor: palette.background,
  },
  listContainer: {
    padding: 24,
    paddingBottom: 140,
  },

  card: {
    width: "100%",
    backgroundColor: palette.card,
    padding: spacing.lg,
    borderRadius: radius.md,
    ...(Platform.OS !== "web" ? shadows.card : {}),
  },

  /* ---------- TEXTO PRINCIPAL ---------- */

  title: {
    ...typography.title,
    color: palette.text,
    marginBottom: spacing.md,
    textAlign: "center",
  },

  text: {
    ...typography.body,
    color: palette.text,
  },

  mutedText: {
    ...typography.body,
    color: palette.muted,
  },

  /* ---------- LABEL / META ---------- */

  label: {
    ...typography.label,
    color: palette.muted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },

  /* ---------- LINKS / AÇÕES ---------- */

  link: {
    marginTop: spacing.md,
    color: palette.tint,
    textAlign: "center",
    fontWeight: "500",
  },

  /* ---------- INPUT ---------- */

  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: palette.input,
    color: palette.text,
  },

  inputError: {
    borderColor: "#E74C3C",
  },

  /* ---------- BOTÃO ---------- */

  button: {
    width: "100%",
    backgroundColor: palette.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.lg,
    alignItems: "center",
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: palette.card,
    fontWeight: "600",
  },

  /* ---------- PROCESSOS ---------- */

  processCard: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 12,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 3,
        }),
  },

  processTitle: {
    ...typography.subtitle,
    color: palette.text,
    marginBottom: spacing.xs,
  },

  processSubtitle: {
    ...typography.body,
    color: palette.muted,
    marginBottom: spacing.sm,
  },

  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: `${palette.tint}20`,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },

  statusText: {
    fontSize: 12,
    fontWeight: "500",
    color: palette.tint,
  },
  infoBlock: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: 12,
  },

  infoRow: {
    marginBottom: 10,
  },

  infoLabel: {
    fontSize: 12,
    color: palette.muted,
    marginBottom: 2,
  },

  infoValue: {
    fontSize: 14,
    color: palette.text,
    fontWeight: "500",
  },
});

export default styles;
