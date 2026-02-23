/**
 * PUBLIC LEAD FORM — /f/:slug
 *
 * Renders a configurable lead capture form based on lead_forms table.
 * No authentication required. Accessible to anyone with the link.
 *
 * On submit, creates a Lead in the CRM (source="formulario").
 * Supports UTM parameters: ?utm_campaign, ?utm_source, ?utm_medium
 */

import {
    loadPublicLeadForm,
    submitPublicLeadForm,
    type LeadFormField,
    type PublicLeadFormData,
} from "@/services/lead-forms";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ── Constants ──────────────────────────────────────────────────── */
const DEFAULT_PRIMARY = "#2563eb";
const BG_COLOR = "#f8fafc";
const CARD_BG = "#ffffff";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const BORDER_COLOR = "#e2e8f0";
const SUCCESS_COLOR = "#22c55e";
const ERROR_COLOR = "#ef4444";

type Phase = "loading" | "form" | "success" | "inactive" | "error";

export default function PublicLeadForm() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<PublicLeadFormData | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const primaryColor = data?.primary_color || DEFAULT_PRIMARY;

  /* ── Parse UTM params from URL (web only) ──────────────────── */
  const utmParams = useMemo(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    return {
      campaign: params.get("utm_campaign") ?? undefined,
      source: params.get("utm_source") ?? undefined,
      medium: params.get("utm_medium") ?? undefined,
    };
  }, []);

  /* ── Load form data ────────────────────────────────────────── */
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const formData = await loadPublicLeadForm(slug);
        if (!formData) {
          setPhase("inactive");
          setErrorMsg("Formulário não encontrado ou desativado.");
          return;
        }
        setData(formData);
        // Initialize form values
        const initial: Record<string, string> = {};
        for (const field of formData.fields) {
          initial[field.key] = "";
        }
        setFormValues(initial);
        setPhase("form");
      } catch {
        setPhase("error");
        setErrorMsg("Erro ao carregar formulário.");
      }
    })();
  }, [slug]);

  /* ── Validation ────────────────────────────────────────────── */
  const validate = useCallback((): boolean => {
    if (!data) return false;
    const errors: Record<string, string> = {};
    for (const field of data.fields) {
      const val = (formValues[field.key] ?? "").trim();
      if (field.required && !val) {
        errors[field.key] = "Campo obrigatório";
      }
      if (
        field.type === "email" &&
        val &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
      ) {
        errors[field.key] = "E-mail inválido";
      }
      if (field.type === "phone" && val && val.replace(/\D/g, "").length < 10) {
        errors[field.key] = "Telefone inválido";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [data, formValues]);

  /* ── Submit ────────────────────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!data || submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    setErrorMsg("");
    try {
      const result = await submitPublicLeadForm(data.id, formValues, utmParams);
      if (result.success) {
        setSuccessMsg(result.message);
        setPhase("success");
      } else {
        setErrorMsg(result.message);
      }
    } catch {
      setErrorMsg("Erro ao enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }, [data, formValues, utmParams, submitting, validate]);

  /* ── Update field value ────────────────────────────────────── */
  const setFieldValue = useCallback((key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /* ── Render field ──────────────────────────────────────────── */
  const renderField = (field: LeadFormField) => {
    const value = formValues[field.key] ?? "";
    const error = fieldErrors[field.key];
    const isMultiline = field.type === "textarea";

    let keyboardType: TextInput["props"]["keyboardType"] = "default";
    if (field.type === "email") keyboardType = "email-address";
    if (field.type === "phone") keyboardType = "phone-pad";
    if (field.type === "number") keyboardType = "numeric";
    if (field.type === "cpf" || field.type === "cnpj") keyboardType = "numeric";

    let autoCapitalize: TextInput["props"]["autoCapitalize"] = "sentences";
    if (field.type === "email") autoCapitalize = "none";

    if (field.type === "select" && field.options) {
      return (
        <View key={field.key} style={s.fieldWrap}>
          <Text style={s.fieldLabel}>
            {field.label}
            {field.required ? (
              <Text style={{ color: ERROR_COLOR }}> *</Text>
            ) : null}
          </Text>
          <View style={s.selectWrap}>
            {field.options.map((opt) => {
              const isSelected = value === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[
                    s.selectOption,
                    isSelected && {
                      backgroundColor: primaryColor + "18",
                      borderColor: primaryColor,
                    },
                  ]}
                  onPress={() => setFieldValue(field.key, opt)}
                >
                  <Text
                    style={[
                      s.selectOptionText,
                      isSelected && { color: primaryColor, fontWeight: "600" },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {error ? <Text style={s.fieldError}>{error}</Text> : null}
        </View>
      );
    }

    return (
      <View key={field.key} style={s.fieldWrap}>
        <Text style={s.fieldLabel}>
          {field.label}
          {field.required ? (
            <Text style={{ color: ERROR_COLOR }}> *</Text>
          ) : null}
        </Text>
        <TextInput
          style={[
            s.input,
            isMultiline && s.inputMultiline,
            error ? s.inputError : null,
          ]}
          value={value}
          onChangeText={(t) => setFieldValue(field.key, t)}
          placeholder={field.placeholder || ""}
          placeholderTextColor={TEXT_MUTED}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={isMultiline}
          numberOfLines={isMultiline ? 4 : 1}
          textAlignVertical={isMultiline ? "top" : "center"}
        />
        {error ? <Text style={s.fieldError}>{error}</Text> : null}
      </View>
    );
  };

  /* ── Main render ───────────────────────────────────────────── */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <View
            style={[s.logoCircle, { backgroundColor: primaryColor + "20" }]}
          >
            <Ionicons
              name="document-text-outline"
              size={28}
              color={primaryColor}
            />
          </View>
          <Text style={s.headerTitle}>{data?.tenant_name || "Formulário"}</Text>
        </View>

        {/* Loading */}
        {phase === "loading" && (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={primaryColor} />
            <Text style={s.loadingText}>Carregando formulário…</Text>
          </View>
        )}

        {/* Error / Inactive */}
        {(phase === "error" || phase === "inactive") && (
          <View style={s.card}>
            <Ionicons
              name={
                phase === "inactive" ? "lock-closed-outline" : "alert-circle"
              }
              size={48}
              color={phase === "inactive" ? TEXT_MUTED : ERROR_COLOR}
            />
            <Text style={s.resultTitle}>
              {phase === "inactive" ? "Formulário Indisponível" : "Erro"}
            </Text>
            <Text style={s.resultText}>{errorMsg}</Text>
          </View>
        )}

        {/* Success */}
        {phase === "success" && (
          <View style={s.card}>
            <Ionicons name="checkmark-circle" size={48} color={SUCCESS_COLOR} />
            <Text style={s.resultTitle}>Enviado com Sucesso!</Text>
            <Text style={s.resultText}>{successMsg}</Text>
          </View>
        )}

        {/* Form */}
        {phase === "form" && data && (
          <View style={s.card}>
            <Text style={s.formTitle}>{data.title}</Text>
            {data.description ? (
              <Text style={s.formDesc}>{data.description}</Text>
            ) : null}

            {data.fields.map(renderField)}

            {errorMsg ? (
              <Text
                style={[s.fieldError, { textAlign: "center", marginTop: 8 }]}
              >
                {errorMsg}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: primaryColor }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.submitBtnText}>
                  {data.button_label || "Enviar"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <Text style={s.footer}>Powered by Radul</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Styles ──────────────────────────────────────────────────── */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
  content: {
    padding: 20,
    maxWidth: 560,
    alignSelf: "center",
    width: "100%",
    paddingBottom: 40,
  },
  header: { alignItems: "center", marginBottom: 24 },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  centered: { alignItems: "center", paddingVertical: 60 },
  loadingText: { color: TEXT_SECONDARY, marginTop: 12, fontSize: 14 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginTop: 12,
  },
  resultText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  formDesc: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 20,
    lineHeight: 20,
  },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: TEXT_PRIMARY,
    backgroundColor: "#fff",
  },
  inputMultiline: {
    minHeight: 100,
    paddingTop: 12,
  },
  inputError: { borderColor: ERROR_COLOR },
  fieldError: { color: ERROR_COLOR, fontSize: 12, marginTop: 4 },
  selectWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selectOption: {
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectOptionText: { fontSize: 14, color: TEXT_SECONDARY },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    textAlign: "center",
    color: TEXT_MUTED,
    fontSize: 12,
    marginTop: 24,
  },
});
