import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    formatCnpj,
    lookupCnpj,
    validateCnpj,
    type BrasilApiCnpj,
} from "@/services/brasil-api";
import {
    consultCnpj,
    getRateLimitInfo,
    onRateLimitChange,
    type RateLimitInfo,
    type ReceitaWsCnpj,
} from "@/services/receita-ws";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CnpjDetailProps {
  /** Pre-filled CNPJ. If provided, auto-lookup on mount. */
  initialCnpj?: string;
  /** Show the search input. Set false to use as display-only. */
  showInput?: boolean;
  /** Called after successful lookup with data. */
  onResult?: (data: ReceitaWsCnpj | BrasilApiCnpj) => void;
  /** Called when user taps "Add company" button. Receives normalized data. */
  onAdd?: (data: ReceitaWsCnpj | BrasilApiCnpj) => void;
  /** Prefer ReceitaWS (richer data) or BrasilAPI (no rate limit). Default: "brasilapi". */
  source?: "receitaws" | "brasilapi";
}

/* ------------------------------------------------------------------ */
/*  Section Component                                                  */
/* ------------------------------------------------------------------ */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  const borderColor = useThemeColor(
    { light: "#dbe3ee", dark: "#334155" },
    "border",
  );
  return (
    <View style={[s.section, { borderBottomColor: borderColor }]}>
      <View style={s.sectionHeader}>
        <Ionicons name={icon as any} size={16} color="#2563eb" />
        <ThemedText style={s.sectionTitle}>{title}</ThemedText>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const mutedColor = useThemeColor(
    { light: "#64748b", dark: "#a8b4c7" },
    "muted",
  );
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <ThemedText style={[s.infoLabel, { color: mutedColor }]}>
        {label}
      </ThemedText>
      <ThemedText style={s.infoValue}>{value}</ThemedText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function CnpjDetail({
  initialCnpj,
  showInput = true,
  onResult,
  onAdd,
  source = "brasilapi",
}: CnpjDetailProps) {
  const inputBg = useThemeColor({ light: "#f8fafc", dark: "#1b2431" }, "input");
  const borderColor = useThemeColor(
    { light: "#dbe3ee", dark: "#334155" },
    "border",
  );
  const textColor = useThemeColor(
    { light: "#111827", dark: "#e5e7eb" },
    "text",
  );
  const cardBg = useThemeColor({ light: "#ffffff", dark: "#222b38" }, "card");
  const tintColor = useThemeColor(
    { light: "#2563eb", dark: "#60a5fa" },
    "tint",
  );
  const mutedColor = useThemeColor(
    { light: "#64748b", dark: "#a8b4c7" },
    "muted",
  );

  const [cnpjInput, setCnpjInput] = useState(initialCnpj ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReceitaWsCnpj | BrasilApiCnpj | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(
    null,
  );
  const [waitingForSlot, setWaitingForSlot] = useState(false);

  // Subscribe to rate-limit changes to show queue status
  useEffect(() => {
    const unsub = onRateLimitChange((info) => {
      setRateLimitInfo(info);
      if (!info.isQueueActive) {
        setWaitingForSlot(false);
      }
    });
    return unsub;
  }, []);

  // Countdown timer for waiting display
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (!waitingForSlot) {
      setCountdown(0);
      return;
    }
    const tick = () => {
      const info = getRateLimitInfo();
      setCountdown(Math.ceil(info.msUntilNextSlot / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [waitingForSlot]);

  const doLookup = useCallback(
    async (raw: string) => {
      const digits = raw.replace(/\D/g, "");
      if (digits.length !== 14) {
        setError("CNPJ deve conter 14 dígitos");
        return;
      }
      if (!validateCnpj(digits)) {
        setError("CNPJ inválido (dígitos verificadores não conferem)");
        return;
      }

      setLoading(true);
      setError(null);
      setData(null);

      try {
        let result: ReceitaWsCnpj | BrasilApiCnpj;

        if (source === "receitaws") {
          // Check if we'll need to wait
          const rl = getRateLimitInfo();
          if (rl.requestsUsed >= rl.maxRequests) {
            setWaitingForSlot(true);
          }
          // consultCnpj now queues automatically — no error thrown
          result = await consultCnpj(digits);
          setWaitingForSlot(false);
        } else {
          result = await lookupCnpj(digits);
        }

        setData(result);
        onResult?.(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao consultar CNPJ");
        setWaitingForSlot(false);
      } finally {
        setLoading(false);
      }
    },
    [source, onResult],
  );

  // Auto-lookup on mount if initialCnpj provided
  useEffect(() => {
    if (initialCnpj) {
      doLookup(initialCnpj);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChangeText = (text: string) => {
    const digits = text.replace(/\D/g, "");
    setCnpjInput(digits.length >= 2 ? formatCnpj(digits) : digits);
  };

  // Normalize data from both sources
  const normalized = data ? normalizeData(data, source) : null;

  return (
    <View>
      {showInput && (
        <View style={[s.inputRow, { borderColor }]}>
          <TextInput
            value={cnpjInput}
            onChangeText={handleChangeText}
            placeholder="00.000.000/0000-00"
            placeholderTextColor={mutedColor}
            keyboardType="numeric"
            maxLength={18}
            editable={!loading}
            style={[
              s.input,
              { backgroundColor: inputBg, color: textColor, borderColor },
            ]}
          />
          <TouchableOpacity
            onPress={() => doLookup(cnpjInput)}
            disabled={loading}
            style={[s.searchBtn, { backgroundColor: tintColor }]}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="search" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle" size={16} color="#ef4444" />
          <ThemedText style={s.errorText}>{error}</ThemedText>
        </View>
      )}

      {/* Rate-limit queue indicator */}
      {waitingForSlot && (
        <View style={s.queueBox}>
          <ActivityIndicator size="small" color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <ThemedText style={s.queueTitle}>
              Aguardando limite de consultas...
            </ThemedText>
            <ThemedText style={s.queueSubtitle}>
              {countdown > 0
                ? `Próxima consulta disponível em ~${countdown}s (limite: 3/min)`
                : "Processando fila..."}
            </ThemedText>
          </View>
        </View>
      )}

      {/* Rate-limit status badge (when approaching limit) */}
      {!waitingForSlot &&
        rateLimitInfo &&
        rateLimitInfo.requestsUsed >= 2 &&
        source === "receitaws" && (
          <View style={s.rateBadge}>
            <Ionicons name="speedometer-outline" size={14} color="#f59e0b" />
            <ThemedText style={s.rateBadgeText}>
              {rateLimitInfo.requestsUsed}/{rateLimitInfo.maxRequests} consultas
              usadas (limite por minuto)
            </ThemedText>
          </View>
        )}

      {loading && !showInput && (
        <ActivityIndicator size="large" style={{ marginVertical: 20 }} />
      )}

      {normalized && (
        <ScrollView style={[s.card, { backgroundColor: cardBg, borderColor }]}>
          {/* Header */}
          <View style={s.header}>
            <View
              style={[
                s.statusBadge,
                {
                  backgroundColor: normalized.isActive ? "#22c55e" : "#ef4444",
                },
              ]}
            >
              <ThemedText style={s.statusText}>
                {normalized.isActive ? "ATIVA" : normalized.situacao}
              </ThemedText>
            </View>
            <ThemedText style={s.companyName}>
              {normalized.razaoSocial}
            </ThemedText>
            {normalized.nomeFantasia && (
              <ThemedText style={[s.fantasia, { color: mutedColor }]}>
                {normalized.nomeFantasia}
              </ThemedText>
            )}
            <ThemedText style={[s.cnpjDisplay, { color: mutedColor }]}>
              {formatCnpj(normalized.cnpj)}
            </ThemedText>
          </View>

          {/* Company Info */}
          <Section title="Dados da Empresa" icon="business">
            <InfoRow
              label="Natureza Jurídica"
              value={normalized.naturezaJuridica}
            />
            <InfoRow label="Porte" value={normalized.porte} />
            <InfoRow label="Capital Social" value={normalized.capitalSocial} />
            <InfoRow label="Abertura" value={normalized.dataAbertura} />
            <InfoRow
              label="Atividade Principal"
              value={normalized.atividadePrincipal}
            />
          </Section>

          {/* Address */}
          <Section title="Endereço" icon="location">
            <InfoRow
              label="Logradouro"
              value={[
                normalized.logradouro,
                normalized.numero,
                normalized.complemento,
              ]
                .filter(Boolean)
                .join(", ")}
            />
            <InfoRow label="Bairro" value={normalized.bairro} />
            <InfoRow
              label="Cidade/UF"
              value={`${normalized.cidade}/${normalized.uf}`}
            />
            <InfoRow label="CEP" value={normalized.cep} />
          </Section>

          {/* Contact */}
          {(normalized.telefone || normalized.email) && (
            <Section title="Contato" icon="call">
              <InfoRow label="Telefone" value={normalized.telefone} />
              <InfoRow label="Email" value={normalized.email} />
            </Section>
          )}

          {/* Simples Nacional */}
          {normalized.simplesNacional !== undefined && (
            <Section title="Simples Nacional" icon="document-text">
              <InfoRow
                label="Optante"
                value={normalized.simplesNacional ? "Sim" : "Não"}
              />
              {normalized.simeiOptante !== undefined && (
                <InfoRow
                  label="MEI (SIMEI)"
                  value={normalized.simeiOptante ? "Sim" : "Não"}
                />
              )}
            </Section>
          )}

          {/* Partners (QSA) */}
          {normalized.socios.length > 0 && (
            <Section
              title={`Sócios (${normalized.socios.length})`}
              icon="people"
            >
              {normalized.socios.map((socio, i) => (
                <View
                  key={i}
                  style={[s.socioRow, { borderBottomColor: borderColor }]}
                >
                  <ThemedText style={s.socioName}>{socio.nome}</ThemedText>
                  <ThemedText style={[s.socioQual, { color: mutedColor }]}>
                    {socio.qualificacao}
                  </ThemedText>
                </View>
              ))}
            </Section>
          )}

          {onAdd && data && (
            <View style={{ padding: 16 }}>
              <TouchableOpacity
                onPress={() => onAdd(data)}
                style={{
                  backgroundColor: tintColor,
                  borderRadius: 10,
                  paddingVertical: 14,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <ThemedText
                  style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}
                >
                  Adicionar Empresa
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Normalize data from both APIs                                      */
/* ------------------------------------------------------------------ */

interface NormalizedCnpj {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  isActive: boolean;
  naturezaJuridica: string;
  porte: string;
  capitalSocial: string;
  dataAbertura: string;
  atividadePrincipal: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  simplesNacional?: boolean;
  simeiOptante?: boolean;
  socios: { nome: string; qualificacao: string }[];
}

function normalizeData(
  data: ReceitaWsCnpj | BrasilApiCnpj,
  source: "receitaws" | "brasilapi",
): NormalizedCnpj {
  if (source === "receitaws" && "status" in data) {
    const d = data as ReceitaWsCnpj;
    return {
      cnpj: d.cnpj,
      razaoSocial: d.nome,
      nomeFantasia: d.fantasia,
      situacao: d.situacao,
      isActive: d.situacao?.toUpperCase() === "ATIVA",
      naturezaJuridica: d.natureza_juridica,
      porte: d.porte,
      capitalSocial: d.capital_social
        ? `R$ ${Number(d.capital_social.replace(/\D/g, "") || 0).toLocaleString("pt-BR")}`
        : "",
      dataAbertura: d.abertura,
      atividadePrincipal: d.atividade_principal?.[0]?.text ?? "",
      logradouro: d.logradouro,
      numero: d.numero,
      complemento: d.complemento,
      bairro: d.bairro,
      cidade: d.municipio,
      uf: d.uf,
      cep: d.cep,
      telefone: d.telefone,
      email: d.email,
      simplesNacional: d.simples?.optante,
      simeiOptante: d.simei?.optante,
      socios: (d.qsa ?? []).map((s) => ({
        nome: s.nome,
        qualificacao: s.qual,
      })),
    };
  }

  // BrasilAPI
  const d = data as BrasilApiCnpj;
  return {
    cnpj: d.cnpj,
    razaoSocial: d.razao_social,
    nomeFantasia: d.nome_fantasia,
    situacao: d.descricao_situacao_cadastral,
    isActive: d.situacao_cadastral === 2, // 2 = ATIVA
    naturezaJuridica: d.natureza_juridica,
    porte: d.porte,
    capitalSocial: d.capital_social
      ? `R$ ${d.capital_social.toLocaleString("pt-BR")}`
      : "",
    dataAbertura: d.data_inicio_atividade,
    atividadePrincipal: d.cnae_fiscal_descricao,
    logradouro: d.logradouro,
    numero: d.numero,
    complemento: d.complemento,
    bairro: d.bairro,
    cidade: d.municipio,
    uf: d.uf,
    cep: d.cep,
    telefone: d.ddd_telefone_1,
    email: d.email,
    simplesNacional: undefined,
    simeiOptante: undefined,
    socios: (d.qsa ?? []).map((s) => ({
      nome: s.nome_socio,
      qualificacao: s.qualificacao_socio,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  inputRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: { color: "#ef4444", fontSize: 13, flex: 1 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    padding: 16,
    gap: 4,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  statusText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  companyName: { fontSize: 18, fontWeight: "700" },
  fantasia: { fontSize: 14 },
  cnpjDisplay: { fontSize: 13, marginTop: 2 },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#2563eb" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 13, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: "500", flex: 2, textAlign: "right" },
  socioRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  socioName: { fontSize: 14, fontWeight: "600" },
  socioQual: { fontSize: 12 },
  queueBox: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    padding: 12,
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  queueTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#92400e",
  },
  queueSubtitle: {
    fontSize: 12,
    color: "#a16207",
    marginTop: 2,
  },
  rateBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fffbeb",
    borderRadius: 6,
    marginBottom: 8,
  },
  rateBadgeText: {
    fontSize: 11,
    color: "#a16207",
  },
});

export default CnpjDetail;
