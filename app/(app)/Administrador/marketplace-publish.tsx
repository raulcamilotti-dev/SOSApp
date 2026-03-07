/**
 * Marketplace Publish — Submit a pack for marketplace review.
 *
 * Two workflows:
 *  1. "Export & Publish": Export from current tenant (via pack-export) then submit
 *  2. "Paste JSON": Provide pack_data JSON directly (for external builders)
 *
 * After submission, the pack goes to "pending_review" for SuperAdmin approval.
 *
 * @module A.5 — Pack Marketplace MVP
 */

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import type { TemplatePack } from "@/data/template-packs";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    MARKETPLACE_CATEGORIES,
    submitPackForReview,
    type MarketplacePackSubmission,
} from "@/services/marketplace-packs";
import {
    countTenantEntities,
    exportTenantAsPack,
    type PackExportOptions,
    type TenantEntityCounts,
} from "@/services/pack-export";
import {
    incrementVersion,
    publishNewVersion,
} from "@/services/pack-versioning";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    Switch,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const PRICING_OPTIONS = [
  { value: "free", label: "Gratuito" },
  { value: "one_time", label: "Pagamento Único" },
  { value: "monthly", label: "Assinatura" },
] as const;

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export default function MarketplacePublishScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const userId = user?.id;

  /* ---- Version mode (when editing an existing pack) ---- */
  const params = useLocalSearchParams<{
    packId?: string;
    packName?: string;
    currentVersion?: string;
  }>();
  const isVersionMode = !!params.packId;

  /* ---- Theme ---- */
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ---- State: source mode ---- */
  const [sourceMode, setSourceMode] = useState<"export" | "paste">("export");

  /* ---- State: metadata ---- */
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [icon, setIcon] = useState("📦");
  const [category, setCategory] = useState("generico");
  const [pricingType, setPricingType] = useState<
    "free" | "one_time" | "monthly"
  >("free");
  const [priceCents, setPriceCents] = useState("");
  const [builderSharePercent, setBuilderSharePercent] = useState("70");
  const [tags, setTags] = useState("");

  /* ---- State: export mode ---- */
  const [entityCounts, setEntityCounts] = useState<TenantEntityCounts | null>(
    null,
  );
  const [countsLoading, setCountsLoading] = useState(false);
  const [includeToggles, setIncludeToggles] = useState({
    service_categories: true,
    service_types: true,
    workflows: true,
    deadline_rules: true,
    step_forms: true,
    step_task_templates: true,
    roles: true,
    document_templates: true,
    custom_fields: true,
    entity_definitions: true,
    services: false,
    ocr_configs: false,
    modules: true,
  });

  /* ---- State: paste mode ---- */
  const [rawJson, setRawJson] = useState("");

  /* ---- State: version mode ---- */
  const [newVersion, setNewVersion] = useState(() =>
    params.currentVersion
      ? incrementVersion(params.currentVersion, "patch")
      : "1.0.0",
  );
  const [changelog, setChangelog] = useState("");
  const [versionType, setVersionType] = useState<"patch" | "minor" | "major">(
    "patch",
  );

  /* ---- State: submission ---- */
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  /* ---- Auto-generate slug from name ---- */
  useEffect(() => {
    if (name) {
      const s = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
      setSlug(s);
    }
  }, [name]);

  /* ---- Load entity counts for export mode ---- */
  useEffect(() => {
    if (sourceMode === "export" && tenantId && !entityCounts) {
      setCountsLoading(true);
      countTenantEntities(tenantId)
        .then(setEntityCounts)
        .catch(() => setEntityCounts(null))
        .finally(() => setCountsLoading(false));
    }
  }, [sourceMode, tenantId, entityCounts]);

  /* ---- Auto-fill name in version mode ---- */
  useEffect(() => {
    if (isVersionMode && params.packName && !name) {
      setName(params.packName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVersionMode, params.packName]);

  /* ---- Recalculate version when type changes ---- */
  useEffect(() => {
    if (isVersionMode && params.currentVersion) {
      setNewVersion(incrementVersion(params.currentVersion, versionType));
    }
  }, [isVersionMode, params.currentVersion, versionType]);

  /* ---- Toggle helper ---- */
  const toggleInclude = useCallback((key: keyof typeof includeToggles) => {
    setIncludeToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* ---- Submit handler ---- */
  const handleSubmit = useCallback(async () => {
    if (!userId) {
      Alert.alert("Erro", "Usuário não identificado.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setProgressLabel("Preparando...");

    try {
      /* ── Build pack data from source mode ── */
      let packData: unknown;

      if (sourceMode === "export") {
        if (!tenantId) {
          Alert.alert("Erro", "Tenant não identificado.");
          setSubmitting(false);
          return;
        }

        setProgressLabel("Exportando configuração do tenant...");
        const exportOptions: PackExportOptions = {
          name: name.trim() || params.packName || "Pack",
          slug: slug.trim() || "pack",
          description: description.trim() || "Nova versão",
          icon,
          include: includeToggles,
        };

        const result = await exportTenantAsPack(tenantId, exportOptions);

        if (!result.validation.valid) {
          setError(
            "Pack exportado tem problemas:\n" +
              result.validation.errors.slice(0, 5).join("\n"),
          );
          setSubmitting(false);
          return;
        }

        packData = result.pack;
      } else {
        setProgressLabel("Validando JSON...");
        if (!rawJson.trim()) {
          Alert.alert("Erro", "Cole o JSON do pack.");
          setSubmitting(false);
          return;
        }

        try {
          packData = JSON.parse(rawJson.trim());
        } catch {
          Alert.alert("Erro", "JSON inválido. Verifique a sintaxe.");
          setSubmitting(false);
          return;
        }
      }

      /* ── Version mode: publish new version ── */
      if (isVersionMode && params.packId) {
        if (!newVersion.trim()) {
          Alert.alert("Campo obrigatório", "Informe a versão.");
          setSubmitting(false);
          return;
        }

        setProgressLabel("Publicando nova versão...");

        await publishNewVersion(
          params.packId,
          newVersion.trim(),
          packData as TemplatePack,
          changelog.trim() || undefined,
          userId,
        );

        Alert.alert(
          "Versão publicada!",
          `Versão ${newVersion.trim()} publicada com sucesso. Tenants instalados poderão atualizar.`,
        );

        setChangelog("");
        setSubmitting(false);
        setProgressLabel("");
        return;
      }

      /* ── New pack mode: validate and submit for review ── */
      if (!name.trim()) {
        Alert.alert("Campo obrigatório", "Informe o nome do pack.");
        setSubmitting(false);
        return;
      }
      if (!slug.trim()) {
        Alert.alert("Campo obrigatório", "Informe o slug do pack.");
        setSubmitting(false);
        return;
      }
      if (!description.trim()) {
        Alert.alert("Campo obrigatório", "Informe uma descrição.");
        setSubmitting(false);
        return;
      }

      setProgressLabel("Enviando para revisão...");

      const submission: MarketplacePackSubmission = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        long_description: longDescription.trim() || undefined,
        icon,
        category,
        pricing_type: pricingType,
        price_cents: pricingType === "free" ? 0 : parseInt(priceCents, 10) || 0,
        builder_share_percent:
          pricingType === "free"
            ? 70
            : Math.min(100, Math.max(0, parseFloat(builderSharePercent) || 70)),
        tags: tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        pack_data: packData as TemplatePack,
      };

      await submitPackForReview(submission, userId, tenantId);

      Alert.alert(
        "Pack enviado!",
        "Seu pack foi enviado para revisão. Você será notificado quando for aprovado.",
      );

      // Reset form
      setName("");
      setSlug("");
      setDescription("");
      setLongDescription("");
      setIcon("📦");
      setCategory("generico");
      setPricingType("free");
      setPriceCents("");
      setBuilderSharePercent("70");
      setTags("");
      setRawJson("");
    } catch (err: any) {
      const msg = err?.normalizedMessage || err?.message || "Falha ao enviar.";
      setError(msg);
    } finally {
      setSubmitting(false);
      setProgressLabel("");
    }
  }, [
    userId,
    tenantId,
    name,
    slug,
    description,
    longDescription,
    icon,
    category,
    pricingType,
    priceCents,
    builderSharePercent,
    tags,
    sourceMode,
    rawJson,
    includeToggles,
    isVersionMode,
    params.packId,
    params.packName,
    newVersion,
    changelog,
  ]);

  /* ---- Shared field input style ---- */
  const inputStyle = {
    borderWidth: 1,
    borderColor,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: inputBg,
    color: textColor,
    fontSize: 14,
    marginTop: 6,
  } as const;

  /* ================================================================ */
  /*  Render                                                            */
  /* ================================================================ */

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <ThemedText
            style={{ fontSize: 22, fontWeight: "bold", color: textColor }}
          >
            {isVersionMode ? "📦 Nova Versão" : "🚀 Publicar Pack"}
          </ThemedText>
          <ThemedText style={{ fontSize: 13, color: mutedColor, marginTop: 4 }}>
            {isVersionMode
              ? `Versão atual: v${params.currentVersion ?? "1.0.0"} • ${params.packName ?? "Pack"}`
              : "Exporte sua configuração ou cole um JSON para publicar no marketplace"}
          </ThemedText>
        </View>

        {/* ── Version Mode: Version UI ── */}
        {isVersionMode && (
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 14,
              borderWidth: 1,
              borderColor,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: textColor,
                marginBottom: 12,
              }}
            >
              Tipo de Versão
            </ThemedText>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {(
                [
                  { key: "patch", label: "Patch", desc: "Correções" },
                  { key: "minor", label: "Minor", desc: "Novos recursos" },
                  { key: "major", label: "Major", desc: "Mudanças grandes" },
                ] as const
              ).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setVersionType(opt.key)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor:
                      versionType === opt.key ? tintColor : borderColor,
                    backgroundColor:
                      versionType === opt.key ? tintColor + "10" : inputBg,
                    alignItems: "center",
                  }}
                >
                  <ThemedText
                    style={{
                      fontSize: 13,
                      fontWeight: versionType === opt.key ? "700" : "500",
                      color: versionType === opt.key ? tintColor : textColor,
                    }}
                  >
                    {opt.label}
                  </ThemedText>
                  <ThemedText
                    style={{
                      fontSize: 10,
                      color: mutedColor,
                      marginTop: 2,
                    }}
                  >
                    {opt.desc}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <View
              style={{
                backgroundColor: tintColor + "10",
                borderRadius: 8,
                padding: 12,
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                Nova versão
              </ThemedText>
              <ThemedText
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: tintColor,
                  marginTop: 2,
                }}
              >
                v{newVersion}
              </ThemedText>
            </View>

            <ThemedText
              style={{ fontSize: 12, color: mutedColor, marginBottom: 6 }}
            >
              Changelog (opcional)
            </ThemedText>
            <TextInput
              value={changelog}
              onChangeText={setChangelog}
              placeholder="O que mudou nesta versão? Ex: Adicionado workflow de atendimento, corrigido template X..."
              placeholderTextColor={mutedColor}
              multiline
              style={{
                ...inputStyle,
                minHeight: 100,
                textAlignVertical: "top",
              }}
            />
          </View>
        )}

        {/* Source mode toggle — hidden in version mode */}
        {!isVersionMode && (
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => setSourceMode("export")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: sourceMode === "export" ? tintColor : borderColor,
                backgroundColor:
                  sourceMode === "export" ? tintColor + "10" : cardColor,
                alignItems: "center",
              }}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color={sourceMode === "export" ? tintColor : mutedColor}
              />
              <ThemedText
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: sourceMode === "export" ? tintColor : textColor,
                  marginTop: 4,
                }}
              >
                Exportar do Tenant
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSourceMode("paste")}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: sourceMode === "paste" ? tintColor : borderColor,
                backgroundColor:
                  sourceMode === "paste" ? tintColor + "10" : cardColor,
                alignItems: "center",
              }}
            >
              <Ionicons
                name="code-slash-outline"
                size={20}
                color={sourceMode === "paste" ? tintColor : mutedColor}
              />
              <ThemedText
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: sourceMode === "paste" ? tintColor : textColor,
                  marginTop: 4,
                }}
              >
                Colar JSON
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Metadata Section — hidden in version mode ── */}
        {!isVersionMode && (
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 14,
              borderWidth: 1,
              borderColor,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <ThemedText
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: textColor,
                marginBottom: 12,
              }}
            >
              Informações do Pack
            </ThemedText>

            {/* Name */}
            <View style={{ marginBottom: 12 }}>
              <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                Nome *
              </ThemedText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Ex: Clínica Veterinária"
                placeholderTextColor={mutedColor}
                style={inputStyle}
              />
            </View>

            {/* Slug */}
            <View style={{ marginBottom: 12 }}>
              <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                Slug *
              </ThemedText>
              <TextInput
                value={slug}
                onChangeText={setSlug}
                placeholder="clinica_veterinaria"
                placeholderTextColor={mutedColor}
                autoCapitalize="none"
                style={inputStyle}
              />
            </View>

            {/* Description */}
            <View style={{ marginBottom: 12 }}>
              <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                Descrição curta *
              </ThemedText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Configuração completa para clínicas veterinárias"
                placeholderTextColor={mutedColor}
                multiline
                style={{
                  ...inputStyle,
                  minHeight: 60,
                  textAlignVertical: "top",
                }}
              />
            </View>

            {/* Long Description */}
            <View style={{ marginBottom: 12 }}>
              <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                Descrição detalhada (opcional)
              </ThemedText>
              <TextInput
                value={longDescription}
                onChangeText={setLongDescription}
                placeholder="Descreva o que está incluso, para quem é ideal, etc."
                placeholderTextColor={mutedColor}
                multiline
                style={{
                  ...inputStyle,
                  minHeight: 80,
                  textAlignVertical: "top",
                }}
              />
            </View>

            {/* Icon */}
            <View style={{ marginBottom: 12 }}>
              <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                Ícone (emoji)
              </ThemedText>
              <TextInput
                value={icon}
                onChangeText={setIcon}
                placeholder="📦"
                placeholderTextColor={mutedColor}
                style={{
                  ...inputStyle,
                  width: 60,
                  textAlign: "center",
                  fontSize: 20,
                }}
              />
            </View>

            {/* Category */}
            <View style={{ marginBottom: 12 }}>
              <ThemedText
                style={{ fontSize: 12, color: mutedColor, marginBottom: 6 }}
              >
                Categoria
              </ThemedText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {MARKETPLACE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    onPress={() => setCategory(cat.value)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                      backgroundColor:
                        category === cat.value ? tintColor + "18" : inputBg,
                      borderWidth: 1,
                      borderColor:
                        category === cat.value ? tintColor : borderColor,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 11,
                        fontWeight: category === cat.value ? "700" : "500",
                        color: category === cat.value ? tintColor : textColor,
                      }}
                    >
                      {cat.icon} {cat.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Tags */}
            <View style={{ marginBottom: 12 }}>
              <ThemedText style={{ fontSize: 12, color: mutedColor }}>
                Tags (separadas por vírgula)
              </ThemedText>
              <TextInput
                value={tags}
                onChangeText={setTags}
                placeholder="pet, veterinário, banho, tosa"
                placeholderTextColor={mutedColor}
                style={inputStyle}
              />
            </View>

            {/* Pricing */}
            <View style={{ marginBottom: 4 }}>
              <ThemedText
                style={{ fontSize: 12, color: mutedColor, marginBottom: 6 }}
              >
                Preço
              </ThemedText>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {PRICING_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setPricingType(opt.value)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                      backgroundColor:
                        pricingType === opt.value ? tintColor + "18" : inputBg,
                      borderWidth: 1,
                      borderColor:
                        pricingType === opt.value ? tintColor : borderColor,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontSize: 11,
                        fontWeight: pricingType === opt.value ? "700" : "500",
                        color:
                          pricingType === opt.value ? tintColor : textColor,
                      }}
                    >
                      {opt.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
              {pricingType !== "free" && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <ThemedText style={{ color: mutedColor, marginRight: 4 }}>
                    R$
                  </ThemedText>
                  <TextInput
                    value={priceCents}
                    onChangeText={(t) => setPriceCents(t.replace(/[^\d]/g, ""))}
                    placeholder="0"
                    placeholderTextColor={mutedColor}
                    keyboardType="number-pad"
                    style={{ ...inputStyle, width: 100, marginTop: 0 }}
                  />
                  <ThemedText
                    style={{ color: mutedColor, marginLeft: 6, fontSize: 11 }}
                  >
                    reais
                  </ThemedText>
                </View>
              )}
              {pricingType !== "free" && (
                <View style={{ marginTop: 10 }}>
                  <ThemedText
                    style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}
                  >
                    Sua participação na receita (%)
                  </ThemedText>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <TextInput
                      value={builderSharePercent}
                      onChangeText={(t) =>
                        setBuilderSharePercent(t.replace(/[^\d.]/g, ""))
                      }
                      placeholder="70"
                      placeholderTextColor={mutedColor}
                      keyboardType="decimal-pad"
                      style={{ ...inputStyle, width: 80, marginTop: 0 }}
                    />
                    <ThemedText
                      style={{
                        color: mutedColor,
                        marginLeft: 6,
                        fontSize: 11,
                      }}
                    >
                      % (plataforma fica com{" "}
                      {(100 - (parseFloat(builderSharePercent) || 70)).toFixed(
                        0,
                      )}
                      %)
                    </ThemedText>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Source-specific Section — hidden in version mode ── */}
        {!isVersionMode &&
          (sourceMode === "export" ? (
            <View
              style={{
                backgroundColor: cardColor,
                borderRadius: 14,
                borderWidth: 1,
                borderColor,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <ThemedText
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: textColor,
                  marginBottom: 12,
                }}
              >
                O que incluir
              </ThemedText>

              {countsLoading ? (
                <ActivityIndicator style={{ marginVertical: 12 }} />
              ) : (
                Object.entries(includeToggles).map(([key, value]) => {
                  const count =
                    entityCounts?.[key as keyof TenantEntityCounts] ?? 0;
                  const labelMap: Record<string, string> = {
                    service_categories: "Categorias de Serviço",
                    service_types: "Tipos de Serviço",
                    workflows: "Workflows",
                    deadline_rules: "Regras de Prazo",
                    step_forms: "Formulários de Etapa",
                    step_task_templates: "Templates de Tarefas",
                    roles: "Papéis & Permissões",
                    document_templates: "Modelos de Documento",
                    custom_fields: "Campos Customizados",
                    entity_definitions: "Entidades Customizadas",
                    services: "Serviços",
                    ocr_configs: "Configs OCR",
                    modules: "Módulos",
                  };

                  return (
                    <View
                      key={key}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor + "30",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <ThemedText style={{ fontSize: 13, color: textColor }}>
                          {labelMap[key] ?? key}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 11, color: mutedColor }}>
                          {count} registros
                        </ThemedText>
                      </View>
                      <Switch
                        value={value}
                        onValueChange={() =>
                          toggleInclude(key as keyof typeof includeToggles)
                        }
                        trackColor={{
                          false: borderColor,
                          true: tintColor + "80",
                        }}
                        thumbColor={value ? tintColor : "#f4f3f4"}
                      />
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: cardColor,
                borderRadius: 14,
                borderWidth: 1,
                borderColor,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <ThemedText
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: textColor,
                  marginBottom: 8,
                }}
              >
                Pack JSON
              </ThemedText>
              <ThemedText
                style={{ fontSize: 11, color: mutedColor, marginBottom: 8 }}
              >
                Cole o JSON do TemplatePack exportado. Deve seguir a
                especificação do Builder Portal.
              </ThemedText>
              <TextInput
                value={rawJson}
                onChangeText={setRawJson}
                placeholder='{ "metadata": { ... }, "service_categories": [ ... ] }'
                placeholderTextColor={mutedColor}
                multiline
                style={{
                  ...inputStyle,
                  minHeight: 200,
                  textAlignVertical: "top",
                  fontFamily: Platform.OS === "web" ? "monospace" : "Courier",
                  fontSize: 12,
                }}
              />
            </View>
          ))}

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

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: submitting ? mutedColor : tintColor,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          {submitting ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <ActivityIndicator size="small" color="#fff" />
              <ThemedText
                style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}
              >
                {progressLabel || "Enviando..."}
              </ThemedText>
            </View>
          ) : (
            <ThemedText
              style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}
            >
              {isVersionMode ? "Publicar Versão" : "Enviar para Revisão"}
            </ThemedText>
          )}
        </TouchableOpacity>

        {/* Help text */}
        <View style={{ paddingHorizontal: 4 }}>
          <ThemedText
            style={{ fontSize: 11, color: mutedColor, lineHeight: 16 }}
          >
            {isVersionMode
              ? "A nova versão será publicada imediatamente. Tenants que já têm o pack instalado poderão atualizar."
              : "Após enviar, um administrador irá revisar seu pack. Packs aprovados ficam disponíveis no Marketplace para todos os tenants instalarem. Packs rejeitados podem ser editados e reenviados."}
          </ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}
