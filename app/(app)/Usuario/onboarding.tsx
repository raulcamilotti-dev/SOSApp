/* ------------------------------------------------------------------ */
/*  Onboarding Wizard                                                  */
/*                                                                     */
/*  Self-service setup flow for new tenants:                           */
/*    Step 1 — Company info (name, WhatsApp, CNPJ)                     */
/*    Step 2 — Choose vertical (template pack)                         */
/*    Step 3 — Applying configuration (progress)                       */
/*    Step 4 — Done! Welcome.                                          */
/* ------------------------------------------------------------------ */

import { useAuth } from "@/core/auth/AuthContext";
import { getAllPackSummaries, type PackSummary } from "@/data/template-packs";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    generateSlug,
    runOnboarding,
    type OnboardingCompanyData,
} from "@/services/onboarding";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const VERTICAL_ICONS: Record<string, string> = {
  cartorio: "🏛️",
  generico: "🔧",
  advocacia: "⚖️",
  contabilidade: "📊",
  imobiliaria: "🏠",
};

const STEP_LABELS = ["Sua Empresa", "Sua Vertical", "Configurando", "Pronto!"];

const COLOR_PRESETS = [
  { hex: "#2563eb", label: "Azul" },
  { hex: "#E53E3E", label: "Vermelho" },
  { hex: "#DD6B20", label: "Laranja" },
  { hex: "#38A169", label: "Verde" },
  { hex: "#805AD5", label: "Roxo" },
  { hex: "#D53F8C", label: "Pink" },
  { hex: "#319795", label: "Teal" },
  { hex: "#2D3748", label: "Escuro" },
];

/* ================================================================== */
/*  Screen                                                             */
/* ================================================================== */

export default function OnboardingScreen() {
  const router = useRouter();
  const {
    user,
    selectTenant,
    refreshAvailableTenants,
    availableTenants,
    updateUser,
  } = useAuth();

  // If user already has tenants, this is an "add new company" flow
  const isAdditionalTenant = availableTenants.length > 0 && !!user?.tenant_id;

  /* ---- Theme ---- */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const primaryColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ---- State ---- */
  const [step, setStep] = useState(0);

  // Step 1: Company
  const [companyName, setCompanyName] = useState("");
  const [whatsapp, setWhatsapp] = useState(user?.phone ?? user?.telefone ?? "");
  const [cnpj, setCnpj] = useState("");

  // Step 1: Branding
  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [customHex, setCustomHex] = useState("");
  const [slugValue, setSlugValue] = useState("");

  // Step 2: Vertical
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const packs = useMemo(() => getAllPackSummaries(), []);

  // Step 3: Progress
  const [progressLabel, setProgressLabel] = useState("");
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [progressValue, setProgressValue] = useState(0);

  // Step 4: Done
  const [result, setResult] = useState<{
    success: boolean;
    tenantId: string;
    packApplied: boolean;
    errors: string[];
  } | null>(null);

  // Errors
  const [error, setError] = useState("");

  // Pre-fill company name from user
  useEffect(() => {
    if (!companyName && user?.fullname) {
      // Don't pre-fill — let them type their company name
    }
  }, [user, companyName]);

  /* ---- Validation ---- */
  const isStep1Valid = useMemo(() => {
    return companyName.trim().length >= 2 && whatsapp.trim().length >= 8;
  }, [companyName, whatsapp]);

  /* ---- Format CNPJ ---- */
  const formatCnpj = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8)
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12)
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  /* ---- Format phone ---- */
  const formatPhone = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  /* ---- Run onboarding ---- */
  const handleApply = useCallback(async () => {
    if (!user?.id) return;
    setStep(2);
    setError("");
    setProgressValue(0);
    setProgressLabel("Iniciando...");

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 0,
      useNativeDriver: false,
    }).start();

    const companyData: OnboardingCompanyData = {
      company_name: companyName.trim(),
      whatsapp_number: whatsapp.replace(/\D/g, ""),
      cnpj: cnpj ? cnpj.replace(/\D/g, "") : undefined,
      brand_name: brandName.trim() || undefined,
      primary_color: brandColor !== "#2563eb" ? brandColor : undefined,
      slug: slugValue.trim() || undefined,
    };

    try {
      const onboardingResult = await runOnboarding(
        user.id,
        companyData,
        selectedPack,
        (label, progress) => {
          setProgressLabel(label);
          setProgressValue(progress);
          Animated.timing(progressAnim, {
            toValue: progress,
            duration: 400,
            useNativeDriver: false,
          }).start();
        },
      );

      setResult(onboardingResult);

      // Update auth context — mark user as admin since they created this tenant
      try {
        await updateUser({ role: "admin" });
      } catch {
        // Non-fatal
      }
      await refreshAvailableTenants();
      await selectTenant(onboardingResult.tenantId);

      setStep(3);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao configurar sua empresa.",
      );
      setStep(1); // go back to vertical selection
    }
  }, [
    user,
    companyName,
    whatsapp,
    cnpj,
    brandName,
    brandColor,
    slugValue,
    selectedPack,
    progressAnim,
    refreshAvailableTenants,
    selectTenant,
    updateUser,
  ]);

  /* ---- Navigation ---- */
  const handleNext = () => {
    if (step === 0 && isStep1Valid) {
      setStep(1);
    } else if (step === 1) {
      handleApply();
    }
  };

  const handleBack = () => {
    if (step === 1) setStep(0);
  };

  const handleFinish = () => {
    router.replace("/");
  };

  const handleCancel = () => {
    if (isAdditionalTenant) {
      router.back();
    }
  };

  /* ---- Render Helpers ---- */
  const { width: screenWidth } = Dimensions.get("window");
  const isWide = screenWidth > 600;

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  /* ================================================================ */
  /*  STEP 1 — Sua Empresa                                            */
  /* ================================================================ */
  const renderStep1 = () => (
    <View style={{ gap: 20 }}>
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: `${primaryColor}15`,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons name="business-outline" size={32} color={primaryColor} />
        </View>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: textColor,
            textAlign: "center",
          }}
        >
          {isAdditionalTenant ? "Nova empresa" : "Sobre sua empresa"}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: mutedColor,
            textAlign: "center",
            marginTop: 4,
          }}
        >
          Precisamos de algumas informações básicas para criar seu espaço.
        </Text>
      </View>

      {/* Company name */}
      <View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: textColor,
            marginBottom: 6,
          }}
        >
          Nome da empresa *
        </Text>
        <TextInput
          placeholder="Ex: Escritório Silva & Associados"
          placeholderTextColor={mutedColor}
          value={companyName}
          onChangeText={setCompanyName}
          style={{
            backgroundColor: inputBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            padding: 14,
            fontSize: 15,
            color: textColor,
          }}
          autoFocus
        />
      </View>

      {/* WhatsApp */}
      <View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: textColor,
            marginBottom: 6,
          }}
        >
          WhatsApp da empresa *
        </Text>
        <TextInput
          placeholder="(41) 99999-9999"
          placeholderTextColor={mutedColor}
          value={whatsapp}
          onChangeText={(t) => setWhatsapp(formatPhone(t))}
          keyboardType="phone-pad"
          maxLength={15}
          style={{
            backgroundColor: inputBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            padding: 14,
            fontSize: 15,
            color: textColor,
          }}
        />
      </View>

      {/* CNPJ (optional) */}
      <View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: textColor,
            marginBottom: 6,
          }}
        >
          CNPJ{" "}
          <Text style={{ fontWeight: "400", color: mutedColor }}>
            (opcional)
          </Text>
        </Text>
        <TextInput
          placeholder="00.000.000/0000-00"
          placeholderTextColor={mutedColor}
          value={cnpj}
          onChangeText={(t) => setCnpj(formatCnpj(t))}
          keyboardType="numeric"
          maxLength={18}
          style={{
            backgroundColor: inputBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            padding: 14,
            fontSize: 15,
            color: textColor,
          }}
        />
      </View>

      {/* ---- Branding Section ---- */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: borderColor,
          paddingTop: 20,
          marginTop: 4,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <Ionicons
            name="color-palette-outline"
            size={18}
            color={primaryColor}
          />
          <Text style={{ fontSize: 15, fontWeight: "700", color: textColor }}>
            Personalização
          </Text>
          <Text style={{ fontSize: 12, color: mutedColor }}>(opcional)</Text>
        </View>

        {/* Brand name */}
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textColor,
              marginBottom: 6,
            }}
          >
            Nome da marca{" "}
            <Text style={{ fontWeight: "400", color: mutedColor }}>
              (opcional)
            </Text>
          </Text>
          <TextInput
            placeholder={companyName || "Ex: Meu Escritório"}
            placeholderTextColor={mutedColor}
            value={brandName}
            onChangeText={setBrandName}
            style={{
              backgroundColor: inputBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 10,
              padding: 14,
              fontSize: 15,
              color: textColor,
            }}
          />
          <Text style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>
            Aparece nas telas de login e no portal. Se vazio, usa o nome da
            empresa.
          </Text>
        </View>

        {/* Primary color */}
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textColor,
              marginBottom: 8,
            }}
          >
            Cor principal{" "}
            <Text style={{ fontWeight: "400", color: mutedColor }}>
              (opcional)
            </Text>
          </Text>

          {/* Color swatches */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 10,
            }}
          >
            {COLOR_PRESETS.map((preset) => {
              const isSelected = brandColor === preset.hex;
              return (
                <Pressable
                  key={preset.hex}
                  onPress={() => {
                    setBrandColor(preset.hex);
                    setCustomHex("");
                  }}
                  style={{
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: preset.hex,
                      borderWidth: isSelected ? 3 : 1,
                      borderColor: isSelected ? textColor : `${mutedColor}40`,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                  </View>
                  <Text style={{ fontSize: 9, color: mutedColor }}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom hex input */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: brandColor,
                borderWidth: 1,
                borderColor: `${mutedColor}40`,
              }}
            />
            <TextInput
              placeholder="#2563eb"
              placeholderTextColor={mutedColor}
              value={customHex}
              onChangeText={(t) => {
                const cleaned = t.startsWith("#") ? t : `#${t}`;
                setCustomHex(cleaned);
                // Apply if valid 6-digit hex
                if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
                  setBrandColor(cleaned);
                }
              }}
              autoCapitalize="none"
              maxLength={7}
              style={{
                flex: 1,
                backgroundColor: inputBg,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                padding: 10,
                fontSize: 14,
                color: textColor,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              }}
            />
          </View>
          <Text style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>
            Cor usada nos botões, links e destaques da sua área.
          </Text>
        </View>

        {/* Slug preview */}
        <View>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textColor,
              marginBottom: 6,
            }}
          >
            Endereço web{" "}
            <Text style={{ fontWeight: "400", color: mutedColor }}>
              (opcional)
            </Text>
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                backgroundColor: `${primaryColor}12`,
                borderWidth: 1,
                borderColor,
                borderTopLeftRadius: 10,
                borderBottomLeftRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 14,
                borderRightWidth: 0,
              }}
            >
              <Text style={{ fontSize: 14, color: mutedColor }}>https://</Text>
            </View>
            <TextInput
              placeholder={generateSlug(companyName) || "minha-empresa"}
              placeholderTextColor={mutedColor}
              value={slugValue}
              onChangeText={(t) => setSlugValue(generateSlug(t))}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={60}
              style={{
                flex: 1,
                backgroundColor: inputBg,
                borderWidth: 1,
                borderColor,
                padding: 14,
                fontSize: 14,
                color: textColor,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              }}
            />
            <View
              style={{
                backgroundColor: `${primaryColor}12`,
                borderWidth: 1,
                borderColor,
                borderTopRightRadius: 10,
                borderBottomRightRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 14,
                borderLeftWidth: 0,
              }}
            >
              <Text style={{ fontSize: 14, color: mutedColor }}>
                .radul.com.br
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>
            Endereço personalizado para seus clientes acessarem. Se vazio, será
            gerado automaticamente.
          </Text>
        </View>
      </View>
    </View>
  );

  /* ================================================================ */
  /*  STEP 2 — Sua Vertical                                           */
  /* ================================================================ */
  const renderStep2 = () => (
    <View style={{ gap: 20 }}>
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: `${primaryColor}15`,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons name="grid-outline" size={32} color={primaryColor} />
        </View>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: textColor,
            textAlign: "center",
          }}
        >
          Escolha seu setor
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: mutedColor,
            textAlign: "center",
            marginTop: 4,
          }}
        >
          Vamos pré-configurar workflows, formulários e categorias do seu setor.
          Você pode personalizar tudo depois.
        </Text>
      </View>

      {/* Pack cards */}
      <View style={{ gap: 12 }}>
        {packs.map((pack: PackSummary) => {
          const isSelected = selectedPack === pack.key;
          const icon = VERTICAL_ICONS[pack.key] ?? "📋";

          return (
            <Pressable
              key={pack.key}
              onPress={() => setSelectedPack(pack.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: 16,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: isSelected ? primaryColor : borderColor,
                backgroundColor: isSelected ? `${primaryColor}08` : cardBg,
              }}
            >
              <Text style={{ fontSize: 32 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: textColor,
                  }}
                >
                  {pack.name}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: mutedColor,
                    marginTop: 2,
                  }}
                >
                  {pack.description}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    marginTop: 6,
                  }}
                >
                  <Text style={{ fontSize: 11, color: mutedColor }}>
                    {pack.serviceTypeCount} tipos de serviço
                  </Text>
                  <Text style={{ fontSize: 11, color: mutedColor }}>
                    {pack.workflowCount} workflows
                  </Text>
                  <Text style={{ fontSize: 11, color: mutedColor }}>
                    {pack.modules.length} módulos
                  </Text>
                </View>
              </View>
              {isSelected && (
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={primaryColor}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Skip option */}
      <Pressable
        onPress={() => {
          setSelectedPack(null);
          handleApply();
        }}
        style={{ alignItems: "center", padding: 12 }}
      >
        <Text style={{ fontSize: 14, color: mutedColor }}>
          Pular — vou configurar manualmente depois
        </Text>
      </Pressable>
    </View>
  );

  /* ================================================================ */
  /*  STEP 3 — Configurando                                           */
  /* ================================================================ */
  const renderStep3Applying = () => (
    <View style={{ gap: 24, alignItems: "center", paddingVertical: 40 }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: `${primaryColor}15`,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name="cog-outline" size={40} color={primaryColor} />
      </View>

      <Text
        style={{
          fontSize: 22,
          fontWeight: "700",
          color: textColor,
          textAlign: "center",
        }}
      >
        Configurando sua empresa...
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: mutedColor,
          textAlign: "center",
        }}
      >
        {progressLabel || "Preparando..."}
      </Text>

      {/* Progress bar */}
      <View
        style={{
          width: "100%",
          maxWidth: 400,
          height: 8,
          backgroundColor: borderColor,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            height: "100%",
            width: progressBarWidth,
            backgroundColor: primaryColor,
            borderRadius: 4,
          }}
        />
      </View>

      <Text style={{ fontSize: 13, color: mutedColor }}>
        {Math.round(progressValue * 100)}%
      </Text>
    </View>
  );

  /* ================================================================ */
  /*  STEP 4 — Pronto!                                                */
  /* ================================================================ */
  const renderStep4Done = () => (
    <View style={{ gap: 24, alignItems: "center", paddingVertical: 40 }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: "#dcfce7",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
      </View>

      <Text
        style={{
          fontSize: 24,
          fontWeight: "800",
          color: textColor,
          textAlign: "center",
        }}
      >
        Tudo pronto! 🎉
      </Text>

      <Text
        style={{
          fontSize: 15,
          color: mutedColor,
          textAlign: "center",
          lineHeight: 22,
          maxWidth: 360,
        }}
      >
        Sua empresa{" "}
        <Text style={{ fontWeight: "700", color: textColor }}>
          {companyName}
        </Text>{" "}
        foi criada com sucesso.
        {result?.packApplied
          ? " As configurações do seu setor já foram aplicadas."
          : ""}
      </Text>

      {result?.errors && result.errors.length > 0 && (
        <View
          style={{
            backgroundColor: "#fef3c7",
            borderRadius: 8,
            padding: 12,
            width: "100%",
          }}
        >
          <Text style={{ fontSize: 12, color: "#92400e" }}>
            ⚠️ Alguns avisos: {result.errors.join("; ")}
          </Text>
        </View>
      )}

      <View style={{ width: "100%", gap: 12, marginTop: 16 }}>
        <Pressable
          onPress={handleFinish}
          style={{
            backgroundColor: primaryColor,
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>
            Começar a usar →
          </Text>
        </Pressable>
      </View>
    </View>
  );

  /* ================================================================ */
  /*  Main Render                                                      */
  /* ================================================================ */
  const currentStepContent = () => {
    switch (step) {
      case 0:
        return renderStep1();
      case 1:
        return renderStep2();
      case 2:
        return renderStep3Applying();
      case 3:
        return renderStep4Done();
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            maxWidth: 520,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {/* Step indicator */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              marginBottom: 32,
            }}
          >
            {STEP_LABELS.map((label, i) => {
              const isActive = i === step;
              const isDone = i < step;

              return (
                <View key={i} style={{ alignItems: "center", gap: 6 }}>
                  <View
                    style={{
                      width: isWide ? 36 : 28,
                      height: isWide ? 36 : 28,
                      borderRadius: 18,
                      backgroundColor: isDone
                        ? "#16a34a"
                        : isActive
                          ? primaryColor
                          : borderColor,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {isDone ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : (
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: isActive ? "#fff" : mutedColor,
                        }}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  {isWide && (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: isActive ? "700" : "400",
                        color: isActive ? textColor : mutedColor,
                      }}
                    >
                      {label}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Card */}
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 16,
              padding: isWide ? 36 : 24,
              borderWidth: 1,
              borderColor,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.08,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            {currentStepContent()}

            {/* Error */}
            {error ? (
              <View
                style={{
                  backgroundColor: "#fef2f2",
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 16,
                }}
              >
                <Text style={{ fontSize: 13, color: "#dc2626" }}>{error}</Text>
              </View>
            ) : null}

            {/* Navigation buttons (steps 0-1 only) */}
            {step <= 1 && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 28,
                  gap: 12,
                }}
              >
                {step > 0 ? (
                  <Pressable
                    onPress={handleBack}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: textColor,
                      }}
                    >
                      ← Voltar
                    </Text>
                  </Pressable>
                ) : isAdditionalTenant ? (
                  <Pressable
                    onPress={handleCancel}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: textColor,
                      }}
                    >
                      ← Cancelar
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ flex: 1 }} />
                )}

                <Pressable
                  onPress={handleNext}
                  disabled={step === 0 && !isStep1Valid}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor:
                      step === 0 && !isStep1Valid ? borderColor : primaryColor,
                    alignItems: "center",
                    opacity: step === 0 && !isStep1Valid ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: "#fff",
                    }}
                  >
                    {step === 0 ? "Continuar →" : "Configurar →"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Footer */}
          <Text
            style={{
              textAlign: "center",
              fontSize: 12,
              color: mutedColor,
              marginTop: 24,
            }}
          >
            Radul — Plataforma de operações para empresas de serviço
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
