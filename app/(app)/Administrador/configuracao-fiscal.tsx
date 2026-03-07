/**
 * Configuração Fiscal — Tela admin para o tenant configurar
 * os dados necessários para emissão de NF-e / NFC-e via sped-nfe.
 *
 * Salva diretamente na tabela `tenants` via fiscal-config.ts service.
 * Exibe status de prontidão em tempo real (campos obrigatórios, certificado, CSC).
 *
 * Padrão: ScrollView form (mesmo padrão de perfil-marketing.tsx).
 */

import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    type BrasilApiCity,
    listCities,
    listStates,
    lookupCepWithFallback,
} from "@/services/brasil-api";
import {
    loadTenantFiscalConfig,
    saveTenantFiscalConfig,
    type TenantFiscalConfig,
    validateTenantFiscalReadiness,
} from "@/services/fiscal-config";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TAX_REGIME_OPTIONS = [
  { label: "Simples Nacional", value: "simples_nacional" },
  { label: "Simples Nacional — Excesso", value: "simples_excesso" },
  { label: "Regime Normal", value: "regime_normal" },
  { label: "MEI", value: "mei" },
] as const;

const ENVIRONMENT_OPTIONS = [
  { label: "Homologação (testes)", value: "homologation" },
  { label: "Produção", value: "production" },
] as const;

type FiscalState = Omit<
  TenantFiscalConfig,
  | "id"
  | "tenant_id"
  | "fiscal_provider"
  | "fiscal_endpoint"
  | "fiscal_api_token"
>;

const EMPTY_STATE: FiscalState = {
  legal_name: null,
  trade_name: null,
  cnpj: null,
  state_registration: null,
  municipal_registration: null,
  tax_regime: null,
  fiscal_street: null,
  fiscal_number: null,
  fiscal_complement: null,
  fiscal_neighborhood: null,
  fiscal_city: null,
  fiscal_state: null,
  fiscal_zip_code: null,
  fiscal_country: "1058",
  ibge_city_code: null,
  fiscal_certificate_pfx: null,
  fiscal_certificate_password: null,
  fiscal_certificate_expires_at: null,
  nfce_csc: null,
  nfce_csc_id: null,
  nfe_series: 1,
  nfe_next_number: 1,
  nfce_series: 1,
  nfce_next_number: 1,
  fiscal_default_environment: "homologation",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Simple CNPJ mask: 00.000.000/0000-00 */
const maskCnpj = (digits: string): string => {
  const d = digits.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

/** CEP mask: 00000-000 */
const maskCep = (digits: string): string => {
  const d = digits.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
};

const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
};

const certExpiryStatus = (
  iso: string | null,
): { label: string; color: string } => {
  if (!iso) return { label: "Não informado", color: "#94a3b8" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: "Data inválida", color: "#dc2626" };
  const now = new Date();
  if (d < now)
    return { label: `Expirado em ${formatDate(iso)}`, color: "#dc2626" };
  const daysLeft = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft <= 30)
    return {
      label: `Expira em ${daysLeft} dias (${formatDate(iso)})`,
      color: "#f59e0b",
    };
  return { label: `Válido até ${formatDate(iso)}`, color: "#16a34a" };
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ConfiguracaoFiscalScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── State ── */
  const [state, setState] = useState<FiscalState>({ ...EMPTY_STATE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  // City picker
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [cities, setCities] = useState<BrasilApiCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citySearch, setCitySearch] = useState("");

  // Certificate upload
  const [certFileName, setCertFileName] = useState<string | null>(null);

  /* ── Load ── */
  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setError(null);
      const config = await loadTenantFiscalConfig(tenantId);
      setState({
        legal_name: config.legal_name,
        trade_name: config.trade_name,
        cnpj: config.cnpj,
        state_registration: config.state_registration,
        municipal_registration: config.municipal_registration,
        tax_regime: config.tax_regime,
        fiscal_street: config.fiscal_street,
        fiscal_number: config.fiscal_number,
        fiscal_complement: config.fiscal_complement,
        fiscal_neighborhood: config.fiscal_neighborhood,
        fiscal_city: config.fiscal_city,
        fiscal_state: config.fiscal_state,
        fiscal_zip_code: config.fiscal_zip_code,
        fiscal_country: config.fiscal_country ?? "1058",
        ibge_city_code: config.ibge_city_code,
        fiscal_certificate_pfx: config.fiscal_certificate_pfx,
        fiscal_certificate_password: config.fiscal_certificate_password,
        fiscal_certificate_expires_at: config.fiscal_certificate_expires_at,
        nfce_csc: config.nfce_csc,
        nfce_csc_id: config.nfce_csc_id,
        nfe_series: config.nfe_series ?? 1,
        nfe_next_number: config.nfe_next_number ?? 1,
        nfce_series: config.nfce_series ?? 1,
        nfce_next_number: config.nfce_next_number ?? 1,
        fiscal_default_environment:
          config.fiscal_default_environment ?? "homologation",
      });
      setDirty(false);
    } catch {
      setError("Falha ao carregar configuração fiscal.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    if (!tenantId) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await saveTenantFiscalConfig(
        tenantId,
        state as Partial<TenantFiscalConfig>,
      );
      setDirty(false);
      setSuccessMsg("Configuração fiscal salva com sucesso!");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar";
      setError(msg);
      Alert.alert("Erro", msg);
    } finally {
      setSaving(false);
    }
  }, [tenantId, state]);

  /* ── Field update ── */
  const updateField = useCallback(
    <K extends keyof FiscalState>(key: K, value: FiscalState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
      setSuccessMsg(null);
    },
    [],
  );

  /* ── CEP auto-fill ── */
  const handleCepLookup = useCallback(async () => {
    const cep = (state.fiscal_zip_code ?? "").replace(/\D/g, "");
    if (cep.length !== 8) {
      Alert.alert("CEP inválido", "Informe um CEP com 8 dígitos.");
      return;
    }
    setCepLoading(true);
    try {
      const result = await lookupCepWithFallback(cep);
      setState((prev) => ({
        ...prev,
        fiscal_street: result.street || prev.fiscal_street,
        fiscal_neighborhood: result.neighborhood || prev.fiscal_neighborhood,
        fiscal_city: result.city || prev.fiscal_city,
        fiscal_state: result.state || prev.fiscal_state,
      }));
      setDirty(true);

      // Auto-fetch IBGE code if city and state found
      if (result.state && result.city) {
        try {
          const cityList = await listCities(result.state);
          const exact = cityList.find(
            (c) => c.nome.toLowerCase() === result.city.toLowerCase(),
          );
          if (exact) {
            setState((prev) => ({
              ...prev,
              ibge_city_code: exact.codigo_ibge,
            }));
          }
        } catch {
          // non-fatal — user can pick city manually
        }
      }
    } catch {
      Alert.alert("Erro", "Não foi possível consultar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }, [state.fiscal_zip_code]);

  /* ── City picker ── */
  const openCityPicker = useCallback(async () => {
    const uf = (state.fiscal_state ?? "").trim().toUpperCase();
    if (uf.length !== 2) {
      Alert.alert(
        "Selecione o Estado",
        "Informe a UF antes de selecionar o município.",
      );
      return;
    }
    setCityModalVisible(true);
    setCitiesLoading(true);
    setCitySearch("");
    try {
      const list = await listCities(uf);
      setCities(list);
    } catch {
      setCities([]);
      Alert.alert("Erro", "Falha ao carregar municípios.");
    } finally {
      setCitiesLoading(false);
    }
  }, [state.fiscal_state]);

  const selectCity = useCallback(
    (city: BrasilApiCity) => {
      updateField("fiscal_city", city.nome);
      updateField("ibge_city_code", city.codigo_ibge);
      setCityModalVisible(false);
    },
    [updateField],
  );

  const filteredCities = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter((c) => c.nome.toLowerCase().includes(q));
  }, [cities, citySearch]);

  /* ── UF picker (modal with states) ── */
  const [ufModalVisible, setUfModalVisible] = useState(false);
  const [states, setStates] = useState<{ sigla: string; nome: string }[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);

  const openUfPicker = useCallback(async () => {
    setUfModalVisible(true);
    setStatesLoading(true);
    try {
      const list = await listStates();
      setStates(
        list
          .map((s) => ({ sigla: s.sigla, nome: s.nome }))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
      );
    } catch {
      setStates([]);
    } finally {
      setStatesLoading(false);
    }
  }, []);

  /* ── Certificate upload ── */
  const handleCertificateUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileName = asset.name ?? "certificate.pfx";

      // Read the file as base64
      if (Platform.OS === "web") {
        // Web: use FileReader
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1] ?? "";
          updateField("fiscal_certificate_pfx", base64);
          setCertFileName(fileName);
        };
        reader.readAsDataURL(blob);
      } else {
        // Native: use expo-file-system (dynamic import)
        const fs = await import("expo-file-system");
        const base64 = await fs.readAsStringAsync(asset.uri, {
          encoding: "base64" as any,
        });
        updateField("fiscal_certificate_pfx", base64);
        setCertFileName(fileName);
      }
    } catch {
      Alert.alert("Erro", "Falha ao carregar o certificado.");
    }
  }, [updateField]);

  /* ── Readiness ── */
  const nfeReadiness = useMemo(
    () =>
      validateTenantFiscalReadiness(
        { ...state, id: "", tenant_id: tenantId ?? "" } as TenantFiscalConfig,
        "nfe",
      ),
    [state, tenantId],
  );
  const nfceReadiness = useMemo(
    () =>
      validateTenantFiscalReadiness(
        { ...state, id: "", tenant_id: tenantId ?? "" } as TenantFiscalConfig,
        "nfce",
      ),
    [state, tenantId],
  );

  /* ── Computed ── */
  const certStatus = useMemo(
    () => certExpiryStatus(state.fiscal_certificate_expires_at),
    [state.fiscal_certificate_expires_at],
  );
  const hasCert = !!state.fiscal_certificate_pfx;

  /* ── Shared styles ── */
  const inputStyle = {
    borderWidth: 1,
    borderColor,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: inputBg,
    color: textColor,
    fontSize: 14,
  } as const;

  const sectionTitleStyle = {
    fontSize: 16,
    fontWeight: "700" as const,
    color: textColor,
    marginBottom: 4,
  };

  const sectionSubtitleStyle = {
    fontSize: 12,
    color: mutedColor,
    marginBottom: 14,
  };

  const labelStyle = {
    fontSize: 13,
    fontWeight: "600" as const,
    color: textColor,
    marginBottom: 6,
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
        <Text style={{ color: mutedColor, marginTop: 12, fontSize: 14 }}>
          Carregando configuração fiscal...
        </Text>
      </View>
    );
  }

  /* ── Render ── */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── Header ── */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: textColor,
              marginBottom: 4,
            }}
          >
            Configuração Fiscal
          </Text>
          <Text style={{ fontSize: 13, color: mutedColor, lineHeight: 18 }}>
            Configure os dados fiscais da empresa para emissão de NF-e e NFC-e
            via sped-nfe (SEFAZ).
          </Text>
        </View>

        {/* ══════════════════════════════════════════
         *  READINESS STATUS
         * ══════════════════════════════════════════ */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor,
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: textColor,
              marginBottom: 12,
            }}
          >
            Status de Prontidão
          </Text>

          {/* NF-e */}
          <View style={{ marginBottom: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <Ionicons
                name={nfeReadiness.ok ? "checkmark-circle" : "close-circle"}
                size={16}
                color={nfeReadiness.ok ? "#16a34a" : "#dc2626"}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: nfeReadiness.ok ? "#16a34a" : "#dc2626",
                }}
              >
                NF-e — {nfeReadiness.ok ? "Pronto" : "Pendente"}
              </Text>
            </View>
            {nfeReadiness.missing.map((m) => (
              <Text
                key={`nfe-m-${m}`}
                style={{ fontSize: 12, color: "#dc2626", marginLeft: 22 }}
              >
                • {m}
              </Text>
            ))}
            {nfeReadiness.warnings.map((w) => (
              <Text
                key={`nfe-w-${w}`}
                style={{ fontSize: 12, color: "#f59e0b", marginLeft: 22 }}
              >
                ⚠ {w}
              </Text>
            ))}
          </View>

          {/* NFC-e */}
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <Ionicons
                name={nfceReadiness.ok ? "checkmark-circle" : "close-circle"}
                size={16}
                color={nfceReadiness.ok ? "#16a34a" : "#dc2626"}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: nfceReadiness.ok ? "#16a34a" : "#dc2626",
                }}
              >
                NFC-e — {nfceReadiness.ok ? "Pronto" : "Pendente"}
              </Text>
            </View>
            {nfceReadiness.missing.map((m) => (
              <Text
                key={`nfce-m-${m}`}
                style={{ fontSize: 12, color: "#dc2626", marginLeft: 22 }}
              >
                • {m}
              </Text>
            ))}
            {nfceReadiness.warnings.map((w) => (
              <Text
                key={`nfce-w-${w}`}
                style={{ fontSize: 12, color: "#f59e0b", marginLeft: 22 }}
              >
                ⚠ {w}
              </Text>
            ))}
          </View>
        </View>

        {/* ══════════════════════════════════════════
         *  SECTION 1: DADOS DA EMPRESA
         * ══════════════════════════════════════════ */}
        <View style={{ marginBottom: 28 }}>
          <Text style={sectionTitleStyle}>Dados da Empresa</Text>
          <Text style={sectionSubtitleStyle}>
            Informações jurídicas do emitente da nota fiscal.
          </Text>

          {/* Razão Social */}
          <Text style={labelStyle}>Razão Social *</Text>
          <TextInput
            value={state.legal_name ?? ""}
            onChangeText={(t) => updateField("legal_name", t)}
            placeholder="Razão social conforme CNPJ"
            placeholderTextColor={`${mutedColor}80`}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          {/* Nome Fantasia */}
          <Text style={labelStyle}>Nome Fantasia</Text>
          <TextInput
            value={state.trade_name ?? ""}
            onChangeText={(t) => updateField("trade_name", t)}
            placeholder="Nome fantasia"
            placeholderTextColor={`${mutedColor}80`}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          {/* CNPJ */}
          <Text style={labelStyle}>CNPJ *</Text>
          <TextInput
            value={maskCnpj(state.cnpj ?? "")}
            onChangeText={(t) => {
              const digits = t.replace(/\D/g, "").slice(0, 14);
              updateField("cnpj", digits);
            }}
            placeholder="00.000.000/0000-00"
            placeholderTextColor={`${mutedColor}80`}
            keyboardType="number-pad"
            maxLength={18}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          {/* Inscrição Estadual */}
          <Text style={labelStyle}>Inscrição Estadual</Text>
          <TextInput
            value={state.state_registration ?? ""}
            onChangeText={(t) => updateField("state_registration", t)}
            placeholder="Inscrição estadual (IE)"
            placeholderTextColor={`${mutedColor}80`}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          {/* Inscrição Municipal */}
          <Text style={labelStyle}>Inscrição Municipal</Text>
          <TextInput
            value={state.municipal_registration ?? ""}
            onChangeText={(t) => updateField("municipal_registration", t)}
            placeholder="Inscrição municipal"
            placeholderTextColor={`${mutedColor}80`}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          {/* Regime Tributário */}
          <Text style={labelStyle}>Regime Tributário *</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TAX_REGIME_OPTIONS.map((opt) => {
              const selected = state.tax_regime === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => updateField("tax_regime", opt.value)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selected ? tintColor : borderColor,
                    backgroundColor: selected ? `${tintColor}15` : inputBg,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: selected ? tintColor : textColor,
                      fontWeight: selected ? "700" : "400",
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ══════════════════════════════════════════
         *  SECTION 2: ENDEREÇO FISCAL
         * ══════════════════════════════════════════ */}
        <View style={{ marginBottom: 28 }}>
          <Text style={sectionTitleStyle}>Endereço Fiscal</Text>
          <Text style={sectionSubtitleStyle}>
            Endereço do emitente (obrigatório para NF-e/NFC-e).
          </Text>

          {/* CEP + auto-fill button */}
          <Text style={labelStyle}>CEP *</Text>
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginBottom: 14,
              alignItems: "center",
            }}
          >
            <TextInput
              value={maskCep(state.fiscal_zip_code ?? "")}
              onChangeText={(t) => {
                const digits = t.replace(/\D/g, "").slice(0, 8);
                updateField("fiscal_zip_code", digits);
              }}
              placeholder="00000-000"
              placeholderTextColor={`${mutedColor}80`}
              keyboardType="number-pad"
              maxLength={9}
              style={{ ...inputStyle, flex: 1 }}
            />
            <TouchableOpacity
              onPress={handleCepLookup}
              disabled={cepLoading}
              style={{
                backgroundColor: tintColor,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              {cepLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="search-outline" size={16} color="#fff" />
              )}
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
                Buscar
              </Text>
            </TouchableOpacity>
          </View>

          {/* Logradouro */}
          <Text style={labelStyle}>Logradouro *</Text>
          <TextInput
            value={state.fiscal_street ?? ""}
            onChangeText={(t) => updateField("fiscal_street", t)}
            placeholder="Rua, Avenida..."
            placeholderTextColor={`${mutedColor}80`}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          {/* Número + Complemento */}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Número *</Text>
              <TextInput
                value={state.fiscal_number ?? ""}
                onChangeText={(t) => updateField("fiscal_number", t)}
                placeholder="Nº"
                placeholderTextColor={`${mutedColor}80`}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={labelStyle}>Complemento</Text>
              <TextInput
                value={state.fiscal_complement ?? ""}
                onChangeText={(t) => updateField("fiscal_complement", t)}
                placeholder="Sala, Andar..."
                placeholderTextColor={`${mutedColor}80`}
                style={inputStyle}
              />
            </View>
          </View>

          {/* Bairro */}
          <Text style={labelStyle}>Bairro *</Text>
          <TextInput
            value={state.fiscal_neighborhood ?? ""}
            onChangeText={(t) => updateField("fiscal_neighborhood", t)}
            placeholder="Bairro"
            placeholderTextColor={`${mutedColor}80`}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          {/* Estado (UF picker) */}
          <Text style={labelStyle}>Estado (UF) *</Text>
          <TouchableOpacity
            onPress={openUfPicker}
            style={{
              ...inputStyle,
              marginBottom: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: state.fiscal_state ? textColor : `${mutedColor}80`,
                fontSize: 14,
              }}
            >
              {state.fiscal_state || "Selecionar estado"}
            </Text>
            <Ionicons name="chevron-down" size={16} color={mutedColor} />
          </TouchableOpacity>

          {/* Cidade + IBGE */}
          <Text style={labelStyle}>Município *</Text>
          <TouchableOpacity
            onPress={openCityPicker}
            style={{
              ...inputStyle,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: state.fiscal_city ? textColor : `${mutedColor}80`,
                fontSize: 14,
                flex: 1,
              }}
            >
              {state.fiscal_city || "Selecionar município"}
            </Text>
            <Ionicons name="chevron-down" size={16} color={mutedColor} />
          </TouchableOpacity>
          {state.ibge_city_code ? (
            <Text style={{ fontSize: 11, color: mutedColor, marginBottom: 14 }}>
              Código IBGE: {state.ibge_city_code}
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: "#f59e0b", marginBottom: 14 }}>
              ⚠ Selecione o município para preencher o código IBGE
              automaticamente
            </Text>
          )}
        </View>

        {/* ══════════════════════════════════════════
         *  SECTION 3: CERTIFICADO DIGITAL A1
         * ══════════════════════════════════════════ */}
        <View style={{ marginBottom: 28 }}>
          <Text style={sectionTitleStyle}>Certificado Digital A1</Text>
          <Text style={sectionSubtitleStyle}>
            Arquivo .pfx (PKCS#12) e senha do certificado digital tipo A1.
            Obrigatório para assinatura e transmissão.
          </Text>

          {/* Upload button */}
          <TouchableOpacity
            onPress={handleCertificateUpload}
            style={{
              borderWidth: 1,
              borderColor: hasCert ? "#16a34a" : borderColor,
              borderRadius: 10,
              borderStyle: "dashed",
              paddingVertical: 18,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: hasCert ? "#16a34a08" : inputBg,
              marginBottom: 10,
            }}
          >
            <Ionicons
              name={hasCert ? "checkmark-circle" : "cloud-upload-outline"}
              size={28}
              color={hasCert ? "#16a34a" : tintColor}
            />
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: hasCert ? "#16a34a" : tintColor,
                marginTop: 6,
              }}
            >
              {hasCert
                ? (certFileName ?? "Certificado carregado")
                : "Enviar certificado .pfx"}
            </Text>
            {hasCert && (
              <Text style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}>
                Toque para substituir
              </Text>
            )}
          </TouchableOpacity>

          {/* Certificate status */}
          {hasCert && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 10,
              }}
            >
              <Ionicons
                name="calendar-outline"
                size={14}
                color={certStatus.color}
              />
              <Text style={{ fontSize: 12, color: certStatus.color }}>
                {certStatus.label}
              </Text>
            </View>
          )}

          {/* Expiry date input */}
          <Text style={labelStyle}>Data de Expiração</Text>
          <TextInput
            value={state.fiscal_certificate_expires_at ?? ""}
            onChangeText={(t) =>
              updateField("fiscal_certificate_expires_at", t)
            }
            placeholder="YYYY-MM-DD (ex: 2027-01-15)"
            placeholderTextColor={`${mutedColor}80`}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          {/* Certificate password */}
          <Text style={labelStyle}>Senha do Certificado *</Text>
          <TextInput
            value={state.fiscal_certificate_password ?? ""}
            onChangeText={(t) => updateField("fiscal_certificate_password", t)}
            placeholder="Senha do certificado A1"
            placeholderTextColor={`${mutedColor}80`}
            secureTextEntry
            style={inputStyle}
          />
        </View>

        {/* ══════════════════════════════════════════
         *  SECTION 4: NFC-e (CSC)
         * ══════════════════════════════════════════ */}
        <View style={{ marginBottom: 28 }}>
          <Text style={sectionTitleStyle}>NFC-e — Código de Segurança</Text>
          <Text style={sectionSubtitleStyle}>
            CSC e CSC ID fornecidos pela SEFAZ do seu estado. Obrigatório apenas
            para emissão de NFC-e.
          </Text>

          <Text style={labelStyle}>CSC (Token)</Text>
          <TextInput
            value={state.nfce_csc ?? ""}
            onChangeText={(t) => updateField("nfce_csc", t)}
            placeholder="Código de segurança do contribuinte"
            placeholderTextColor={`${mutedColor}80`}
            style={{ ...inputStyle, marginBottom: 14 }}
          />

          <Text style={labelStyle}>CSC ID (Identificador)</Text>
          <TextInput
            value={state.nfce_csc_id ?? ""}
            onChangeText={(t) => updateField("nfce_csc_id", t)}
            placeholder="ID do CSC (número sequencial)"
            placeholderTextColor={`${mutedColor}80`}
            style={inputStyle}
          />
        </View>

        {/* ══════════════════════════════════════════
         *  SECTION 5: AMBIENTE
         * ══════════════════════════════════════════ */}
        <View style={{ marginBottom: 28 }}>
          <Text style={sectionTitleStyle}>Ambiente de Emissão</Text>
          <Text style={sectionSubtitleStyle}>
            Selecione homologação para testes ou produção para emissão real.
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {ENVIRONMENT_OPTIONS.map((opt) => {
              const selected = state.fiscal_default_environment === opt.value;
              const isProduction = opt.value === "production";
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() =>
                    updateField(
                      "fiscal_default_environment",
                      opt.value as "production" | "homologation",
                    )
                  }
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected
                      ? isProduction
                        ? "#16a34a"
                        : tintColor
                      : borderColor,
                    backgroundColor: selected
                      ? isProduction
                        ? "#16a34a10"
                        : `${tintColor}10`
                      : inputBg,
                    alignItems: "center",
                  }}
                >
                  <Ionicons
                    name={isProduction ? "rocket-outline" : "flask-outline"}
                    size={20}
                    color={
                      selected
                        ? isProduction
                          ? "#16a34a"
                          : tintColor
                        : mutedColor
                    }
                    style={{ marginBottom: 4 }}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: selected ? "700" : "400",
                      color: selected
                        ? isProduction
                          ? "#16a34a"
                          : tintColor
                        : textColor,
                      textAlign: "center",
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {state.fiscal_default_environment === "production" && (
            <View
              style={{
                backgroundColor: "#f59e0b15",
                borderRadius: 8,
                padding: 10,
                marginTop: 10,
                flexDirection: "row",
                gap: 8,
              }}
            >
              <Ionicons
                name="warning-outline"
                size={16}
                color="#f59e0b"
                style={{ marginTop: 1 }}
              />
              <Text style={{ flex: 1, fontSize: 12, color: "#f59e0b" }}>
                Modo produção: notas fiscais emitidas terão validade jurídica e
                serão transmitidas à SEFAZ.
              </Text>
            </View>
          )}
        </View>

        {/* ══════════════════════════════════════════
         *  SECTION 6: NUMERAÇÃO
         * ══════════════════════════════════════════ */}
        <View style={{ marginBottom: 28 }}>
          <Text style={sectionTitleStyle}>Numeração</Text>
          <Text style={sectionSubtitleStyle}>
            Série e próximo número sequencial para NF-e e NFC-e. Ajuste apenas
            se necessário (ex: migração de outro sistema).
          </Text>

          {/* NF-e */}
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>NF-e Série</Text>
              <TextInput
                value={String(state.nfe_series ?? 1)}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/\D/g, ""), 10);
                  updateField("nfe_series", isNaN(n) ? 1 : n);
                }}
                keyboardType="number-pad"
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={labelStyle}>NF-e Próximo Nº</Text>
              <TextInput
                value={String(state.nfe_next_number ?? 1)}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/\D/g, ""), 10);
                  updateField("nfe_next_number", isNaN(n) ? 1 : n);
                }}
                keyboardType="number-pad"
                style={inputStyle}
              />
            </View>
          </View>

          {/* NFC-e */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>NFC-e Série</Text>
              <TextInput
                value={String(state.nfce_series ?? 1)}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/\D/g, ""), 10);
                  updateField("nfce_series", isNaN(n) ? 1 : n);
                }}
                keyboardType="number-pad"
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={labelStyle}>NFC-e Próximo Nº</Text>
              <TextInput
                value={String(state.nfce_next_number ?? 1)}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/\D/g, ""), 10);
                  updateField("nfce_next_number", isNaN(n) ? 1 : n);
                }}
                keyboardType="number-pad"
                style={inputStyle}
              />
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════
         *  ERROR / SUCCESS / SAVE
         * ══════════════════════════════════════════ */}

        {error && (
          <View
            style={{
              backgroundColor: "#dc262615",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              flexDirection: "row",
              gap: 8,
            }}
          >
            <Ionicons name="alert-circle" size={16} color="#dc2626" />
            <Text style={{ flex: 1, color: "#dc2626", fontSize: 13 }}>
              {error}
            </Text>
          </View>
        )}

        {successMsg && (
          <View
            style={{
              backgroundColor: "#16a34a15",
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              flexDirection: "row",
              gap: 8,
            }}
          >
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text style={{ flex: 1, color: "#16a34a", fontSize: 13 }}>
              {successMsg}
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || !dirty}
          style={{
            backgroundColor: saving || !dirty ? `${mutedColor}40` : tintColor,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            marginTop: 8,
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="save-outline" size={18} color="#fff" />
          )}
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            {saving ? "Salvando..." : "Salvar Configuração"}
          </Text>
        </TouchableOpacity>

        {!dirty && !successMsg && (
          <Text
            style={{
              fontSize: 12,
              color: mutedColor,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            Nenhuma alteração pendente
          </Text>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════
       *  CITY PICKER MODAL
       * ══════════════════════════════════════════ */}
      <Modal
        visible={cityModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCityModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "80%",
              padding: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: textColor }}
              >
                Selecionar Município
              </Text>
              <TouchableOpacity onPress={() => setCityModalVisible(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            <TextInput
              value={citySearch}
              onChangeText={setCitySearch}
              placeholder="Pesquisar município..."
              placeholderTextColor={`${mutedColor}80`}
              style={{
                ...inputStyle,
                marginBottom: 10,
              }}
            />

            {citiesLoading ? (
              <ActivityIndicator
                size="small"
                color={tintColor}
                style={{ marginVertical: 20 }}
              />
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {filteredCities.length === 0 && (
                  <Text
                    style={{
                      color: mutedColor,
                      textAlign: "center",
                      paddingVertical: 20,
                    }}
                  >
                    Nenhum município encontrado
                  </Text>
                )}
                {filteredCities.map((city) => (
                  <TouchableOpacity
                    key={city.codigo_ibge}
                    onPress={() => selectCity(city)}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: borderColor,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: textColor }}>
                      {city.nome}
                    </Text>
                    <Text style={{ fontSize: 11, color: mutedColor }}>
                      IBGE: {city.codigo_ibge}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════
       *  UF PICKER MODAL
       * ══════════════════════════════════════════ */}
      <Modal
        visible={ufModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUfModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "70%",
              padding: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: "700", color: textColor }}
              >
                Selecionar Estado
              </Text>
              <TouchableOpacity onPress={() => setUfModalVisible(false)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            {statesLoading ? (
              <ActivityIndicator
                size="small"
                color={tintColor}
                style={{ marginVertical: 20 }}
              />
            ) : (
              <ScrollView>
                {states.map((s) => (
                  <TouchableOpacity
                    key={s.sigla}
                    onPress={() => {
                      updateField("fiscal_state", s.sigla);
                      // Clear city when state changes
                      updateField("fiscal_city", null);
                      updateField("ibge_city_code", null);
                      setUfModalVisible(false);
                    }}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: borderColor,
                      flexDirection: "row",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: tintColor,
                        width: 28,
                      }}
                    >
                      {s.sigla}
                    </Text>
                    <Text style={{ fontSize: 14, color: textColor, flex: 1 }}>
                      {s.nome}
                    </Text>
                    {state.fiscal_state === s.sigla && (
                      <Ionicons name="checkmark" size={18} color={tintColor} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
