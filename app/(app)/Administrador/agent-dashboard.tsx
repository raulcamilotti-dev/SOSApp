/**
 * Agent Dashboard — Visão unificada da configuração completa de um agente.
 *
 * Seções colapsáveis:
 * - System Prompt (com edição inline)
 * - Playbooks → Regras, Tabelas, Handoff (aninhados)
 * - Estados do Agente
 * - Canais
 *
 * Carrega todos os dados em paralelo para renderização rápida.
 */

import { useAuth } from "@/core/auth/AuthContext";
import { filterActive } from "@/core/utils/soft-delete";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api, getApiErrorMessage } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

type R = Record<string, unknown>;

type FilterDef = { field: string; value: string; operator?: string };

/* ═══════════════════════════════════════════════════════
 * API HELPER
 * ═══════════════════════════════════════════════════════ */

async function fetchRows(
  table: string,
  filters: FilterDef[],
  sort?: string,
): Promise<R[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams(filters, {
      sortColumn: sort,
      combineType: "AND",
    }),
  });
  return filterActive(normalizeCrudList<R>(res.data));
}

async function patchRow(table: string, payload: R): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table,
    payload: { ...payload, updated_at: new Date().toISOString() },
  });
}

/* ═══════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════ */

const str = (v: unknown): string => (v != null && v !== "" ? String(v) : "-");

const isTruthy = (v: unknown): boolean =>
  v === true || v === "true" || v === "1";

/* ═══════════════════════════════════════════════════════
 * MAIN COMPONENT
 * ═══════════════════════════════════════════════════════ */

export default function AgentDashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    agentId?: string;
    tenantId?: string;
  }>();

  const agentId =
    (Array.isArray(params.agentId) ? params.agentId[0] : params.agentId) ?? "";
  const tenantId =
    (Array.isArray(params.tenantId) ? params.tenantId[0] : params.tenantId) ??
    user?.tenant_id ??
    "";

  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const inputBg = useThemeColor({}, "input");

  /* ── Data state ── */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agent, setAgent] = useState<R | null>(null);
  const [playbooks, setPlaybooks] = useState<R[]>([]);
  const [rules, setRules] = useState<R[]>([]);
  const [tables, setTables] = useState<R[]>([]);
  const [handoff, setHandoff] = useState<R[]>([]);
  const [states, setStates] = useState<R[]>([]);
  const [bindings, setBindings] = useState<R[]>([]);

  /* ── UI state ── */
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(["prompt", "playbooks"]),
  );
  const [saving, setSaving] = useState(false);

  // Edit prompt modal
  const [editPromptOpen, setEditPromptOpen] = useState(false);
  const [editPromptText, setEditPromptText] = useState("");

  // Edit rule modal
  const [editRuleOpen, setEditRuleOpen] = useState(false);
  const [editRuleData, setEditRuleData] = useState<R | null>(null);
  const [editRuleTitle, setEditRuleTitle] = useState("");
  const [editRuleInstruction, setEditRuleInstruction] = useState("");

  /* ── Toggle section expand/collapse ── */
  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* ── Load all data ── */
  const loadAll = useCallback(async () => {
    if (!agentId) return;
    try {
      setError(null);

      // Batch 1: agent + direct children (parallel)
      const [agentRows, pbs, sts, bds] = await Promise.all([
        fetchRows("agents", [{ field: "id", value: agentId }]),
        fetchRows(
          "agent_playbooks",
          [
            { field: "agent_id", value: agentId },
            { field: "tenant_id", value: tenantId },
          ],
          "created_at ASC",
        ),
        fetchRows(
          "agent_states",
          [{ field: "agent_id", value: agentId }],
          "state_key ASC",
        ),
        fetchRows("agent_channel_bindings", [
          { field: "agent_id", value: agentId },
          { field: "tenant_id", value: tenantId },
        ]),
      ]);

      const ag = agentRows[0] ?? null;
      setAgent(ag);
      setPlaybooks(pbs);
      setStates(sts);
      setBindings(bds);

      // Batch 2: playbook children (rules, tables, handoff)
      const pbIds = pbs.map((p) => String(p.id ?? "")).filter(Boolean);

      if (pbIds.length > 0) {
        const idList = pbIds.join(",");
        const [rls, tbs, hps] = await Promise.all([
          fetchRows(
            "agent_playbook_rules",
            [
              { field: "playbook_id", value: idList, operator: "in" },
              { field: "tenant_id", value: tenantId },
            ],
            "rule_order ASC, created_at ASC",
          ),
          fetchRows(
            "agent_playbook_tables",
            [
              { field: "playbook_id", value: idList, operator: "in" },
              { field: "tenant_id", value: tenantId },
            ],
            "table_name ASC",
          ),
          fetchRows("agent_handoff_policies", [
            { field: "playbook_id", value: idList, operator: "in" },
            { field: "tenant_id", value: tenantId },
          ]),
        ]);
        setRules(rls);
        setTables(tbs);
        setHandoff(hps);
      } else {
        setRules([]);
        setTables([]);
        setHandoff([]);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Falha ao carregar dados do agente"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId, tenantId]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  /* ── Save handlers ── */
  const savePrompt = useCallback(async () => {
    if (!agent?.id) return;
    try {
      setSaving(true);
      await patchRow("agents", {
        id: agent.id,
        system_prompt: editPromptText,
      });
      setAgent((prev) =>
        prev ? { ...prev, system_prompt: editPromptText } : prev,
      );
      setEditPromptOpen(false);
      Alert.alert("Sucesso", "System prompt atualizado!");
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao salvar prompt."));
    } finally {
      setSaving(false);
    }
  }, [agent?.id, editPromptText]);

  const saveRule = useCallback(async () => {
    if (!editRuleData?.id) return;
    try {
      setSaving(true);
      await patchRow("agent_playbook_rules", {
        id: editRuleData.id,
        title: editRuleTitle,
        instruction: editRuleInstruction,
      });
      setRules((prev) =>
        prev.map((r) =>
          r.id === editRuleData.id
            ? { ...r, title: editRuleTitle, instruction: editRuleInstruction }
            : r,
        ),
      );
      setEditRuleOpen(false);
      Alert.alert("Sucesso", "Regra atualizada!");
    } catch (err) {
      Alert.alert("Erro", getApiErrorMessage(err, "Falha ao salvar regra."));
    } finally {
      setSaving(false);
    }
  }, [editRuleData?.id, editRuleTitle, editRuleInstruction]);

  const copyToClipboard = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copiado", "Texto copiado para a área de transferência.");
  }, []);

  /* ── Grouping helpers ── */
  const rulesByPb = useCallback(
    (pbId: string) => rules.filter((r) => String(r.playbook_id ?? "") === pbId),
    [rules],
  );
  const tablesByPb = useCallback(
    (pbId: string) =>
      tables.filter((t) => String(t.playbook_id ?? "") === pbId),
    [tables],
  );
  const handoffByPb = useCallback(
    (pbId: string) =>
      handoff.filter((h) => String(h.playbook_id ?? "") === pbId),
    [handoff],
  );

  /* ── Counting ── */
  const agentName = str(agent?.name || agent?.model || "Agente");
  const promptText = str(agent?.system_prompt);
  const promptLineCount = promptText.split("\n").length;

  /* ═══════════════════════════════════════════════════════
   * RENDER HELPERS — badges & section chrome
   * ═══════════════════════════════════════════════════════ */

  const Badge = ({
    label,
    color: c,
    bg: b,
  }: {
    label: string;
    color: string;
    bg: string;
  }) => (
    <View
      style={{
        backgroundColor: b,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: "600", color: c }}>{label}</Text>
    </View>
  );

  const SEVERITY_COLORS: Record<string, { c: string; b: string }> = {
    critical: { c: "#dc2626", b: "#dc262620" },
    high: { c: "#ea580c", b: "#ea580c20" },
    normal: { c: tintColor, b: `${tintColor}20` },
  };

  const TYPE_COLORS: Record<string, string> = {
    policy: "#7c3aed",
    flow: "#0284c7",
    safety: "#dc2626",
    tooling: "#059669",
  };

  const SeverityBadge = ({ severity }: { severity: string }) => {
    const s = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.normal;
    return <Badge label={severity} color={s.c} bg={s.b} />;
  };

  const TypeBadge = ({ type }: { type: string }) => {
    const c = TYPE_COLORS[type] ?? mutedColor;
    return <Badge label={type} color={c} bg={`${c}20`} />;
  };

  const ActiveBadge = ({ active }: { active: boolean }) => (
    <Badge
      label={active ? "Ativo" : "Inativo"}
      color={active ? "#059669" : "#64748b"}
      bg={active ? "#05966920" : "#64748b20"}
    />
  );

  /* ── Section header with collapse chevron ── */
  const SectionHeader = ({
    sectionKey,
    title,
    count,
    icon,
  }: {
    sectionKey: string;
    title: string;
    count?: number;
    icon: string;
  }) => {
    const isExpanded = expanded.has(sectionKey);
    return (
      <TouchableOpacity
        onPress={() => toggle(sectionKey)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: cardBg,
          borderRadius: 10,
          borderWidth: 1,
          borderColor,
          marginBottom: isExpanded ? 0 : 12,
          borderBottomLeftRadius: isExpanded ? 0 : 10,
          borderBottomRightRadius: isExpanded ? 0 : 10,
        }}
        activeOpacity={0.7}
      >
        <Ionicons name={icon as any} size={18} color={tintColor} />
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: "700",
            color: textColor,
            marginLeft: 8,
          }}
        >
          {title}
        </Text>
        {count != null && (
          <View
            style={{
              backgroundColor: `${tintColor}20`,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 10,
              marginRight: 8,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: tintColor }}>
              {count}
            </Text>
          </View>
        )}
        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={mutedColor}
        />
      </TouchableOpacity>
    );
  };

  /* ── Section content wrapper ── */
  const SectionContent = ({
    sectionKey,
    children,
  }: {
    sectionKey: string;
    children: React.ReactNode;
  }) => {
    if (!expanded.has(sectionKey)) return null;
    return (
      <View
        style={{
          backgroundColor: cardBg,
          borderWidth: 1,
          borderTopWidth: 0,
          borderColor,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          paddingHorizontal: 16,
          paddingBottom: 16,
          marginBottom: 12,
        }}
      >
        {children}
      </View>
    );
  };

  /* ── Sub-section toggle (inside playbook) ── */
  const SubSectionRow = ({
    sectionKey,
    label,
    count,
  }: {
    sectionKey: string;
    label: string;
    count: number;
  }) => (
    <TouchableOpacity
      onPress={() => toggle(sectionKey)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
      }}
      activeOpacity={0.7}
    >
      <Ionicons
        name={expanded.has(sectionKey) ? "caret-down" : "caret-forward"}
        size={14}
        color={mutedColor}
      />
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: textColor,
          marginLeft: 4,
        }}
      >
        {label} ({count})
      </Text>
    </TouchableOpacity>
  );

  /* ── Nav link ── */
  const NavLink = ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{ marginTop: 6, paddingVertical: 4 }}
    >
      <Text style={{ fontSize: 12, color: tintColor, fontWeight: "600" }}>
        {label} →
      </Text>
    </TouchableOpacity>
  );

  /* ═══════════════════════════════════════════════════════
   * LOADING / ERROR STATES
   * ═══════════════════════════════════════════════════════ */

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
          Carregando configuração do agente...
        </Text>
      </View>
    );
  }

  if (!agent) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: bg,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Ionicons name="warning-outline" size={48} color={mutedColor} />
        <Text style={{ color: textColor, fontSize: 16, marginTop: 12 }}>
          Agente não encontrado
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
        >
          <Text style={{ color: tintColor, fontWeight: "600" }}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ═══════════════════════════════════════════════════════
   * MAIN RENDER
   * ═══════════════════════════════════════════════════════ */

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadAll();
            }}
          />
        }
      >
        {/* ═══ Agent Header Card ═══ */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor,
            marginBottom: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: `${tintColor}20`,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="hardware-chip-outline"
                size={22}
                color={tintColor}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: textColor,
                }}
              >
                {agentName}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  marginTop: 4,
                  flexWrap: "wrap",
                }}
              >
                <Badge
                  label={str(agent.model)}
                  color={tintColor}
                  bg={`${tintColor}15`}
                />
                <Badge
                  label={`Temp: ${str(agent.temperature)}`}
                  color={tintColor}
                  bg={`${tintColor}15`}
                />
                <Badge
                  label={`Tokens: ${str(agent.max_tokens)}`}
                  color={tintColor}
                  bg={`${tintColor}15`}
                />
                <Badge
                  label={`v${str(agent.version)}`}
                  color={tintColor}
                  bg={`${tintColor}15`}
                />
                <ActiveBadge active={isTruthy(agent.is_active)} />
                {isTruthy(agent.is_default) && (
                  <Badge label="Padrão" color="#f59e0b" bg="#f59e0b20" />
                )}
              </View>
            </View>
          </View>

          {/* Stats row */}
          <View
            style={{
              flexDirection: "row",
              gap: 16,
              marginTop: 14,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: borderColor,
              flexWrap: "wrap",
            }}
          >
            {[
              {
                label: "Playbooks",
                value: playbooks.length,
                icon: "book-outline",
              },
              {
                label: "Regras",
                value: rules.length,
                icon: "list-outline",
              },
              {
                label: "Estados",
                value: states.length,
                icon: "git-branch-outline",
              },
              {
                label: "Canais",
                value: bindings.length,
                icon: "radio-outline",
              },
            ].map((s) => (
              <View
                key={s.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Ionicons name={s.icon as any} size={14} color={mutedColor} />
                <Text style={{ fontSize: 12, color: mutedColor }}>
                  <Text style={{ fontWeight: "700", color: textColor }}>
                    {s.value}
                  </Text>{" "}
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {error && (
          <View
            style={{
              backgroundColor: "#dc262610",
              padding: 12,
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: "#dc2626", fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {/* ═══ System Prompt ═══ */}
        <SectionHeader
          sectionKey="prompt"
          title="System Prompt"
          count={promptLineCount}
          icon="document-text-outline"
        />
        <SectionContent sectionKey="prompt">
          <View
            style={{
              backgroundColor: inputBg,
              borderRadius: 8,
              padding: 12,
              maxHeight: 300,
            }}
          >
            <ScrollView nestedScrollEnabled>
              <Text
                style={{
                  fontSize: 12,
                  color: textColor,
                  lineHeight: 18,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                }}
              >
                {promptText}
              </Text>
            </ScrollView>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => {
                setEditPromptText(String(agent.system_prompt ?? ""));
                setEditPromptOpen(true);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: tintColor,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 6,
              }}
            >
              <Ionicons name="pencil" size={14} color="#fff" />
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "600",
                  fontSize: 13,
                }}
              >
                Editar Prompt
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => copyToClipboard(String(agent.system_prompt ?? ""))}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                borderWidth: 1,
                borderColor,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 6,
              }}
            >
              <Ionicons name="copy-outline" size={14} color={tintColor} />
              <Text
                style={{
                  color: tintColor,
                  fontWeight: "600",
                  fontSize: 13,
                }}
              >
                Copiar
              </Text>
            </TouchableOpacity>
          </View>
        </SectionContent>

        {/* ═══ Playbooks ═══ */}
        <SectionHeader
          sectionKey="playbooks"
          title="Playbooks"
          count={playbooks.length}
          icon="book-outline"
        />
        <SectionContent sectionKey="playbooks">
          {playbooks.length === 0 ? (
            <Text
              style={{
                color: mutedColor,
                fontStyle: "italic",
                fontSize: 13,
              }}
            >
              Nenhum playbook configurado.
            </Text>
          ) : (
            playbooks.map((pb) => {
              const pbId = String(pb.id ?? "");
              const pbKey = `pb-${pbId}`;
              const pbRules = rulesByPb(pbId);
              const pbTables = tablesByPb(pbId);
              const pbHandoff = handoffByPb(pbId);

              return (
                <View
                  key={pbId}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    marginBottom: 10,
                    overflow: "hidden",
                  }}
                >
                  {/* Playbook header */}
                  <TouchableOpacity
                    onPress={() => toggle(pbKey)}
                    style={{
                      backgroundColor: `${tintColor}08`,
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="book" size={16} color={tintColor} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: textColor,
                        }}
                      >
                        {str(pb.name)}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 6,
                          marginTop: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <Badge
                          label={str(pb.channel)}
                          color={tintColor}
                          bg={`${tintColor}15`}
                        />
                        {pb.state_machine_mode && (
                          <Badge
                            label={str(pb.state_machine_mode)}
                            color={tintColor}
                            bg={`${tintColor}15`}
                          />
                        )}
                        <ActiveBadge active={isTruthy(pb.is_active)} />
                      </View>
                    </View>
                    <Text
                      style={{
                        fontSize: 11,
                        color: mutedColor,
                        marginRight: 6,
                      }}
                    >
                      {pbRules.length}R · {pbTables.length}T ·{" "}
                      {pbHandoff.length}H
                    </Text>
                    <Ionicons
                      name={expanded.has(pbKey) ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={mutedColor}
                    />
                  </TouchableOpacity>

                  {expanded.has(pbKey) && (
                    <View style={{ padding: 12 }}>
                      {/* Playbook description (truncated) */}
                      {pb.description && (
                        <Text
                          style={{
                            fontSize: 12,
                            color: mutedColor,
                            marginBottom: 10,
                            lineHeight: 17,
                          }}
                          numberOfLines={4}
                        >
                          {String(pb.description)}
                        </Text>
                      )}

                      {/* ── Regras ── */}
                      <SubSectionRow
                        sectionKey={`${pbKey}-rules`}
                        label="Regras"
                        count={pbRules.length}
                      />
                      {expanded.has(`${pbKey}-rules`) && (
                        <View
                          style={{
                            marginLeft: 8,
                            marginBottom: 8,
                          }}
                        >
                          {pbRules.map((rule, idx) => (
                            <TouchableOpacity
                              key={String(rule.id)}
                              onPress={() => {
                                setEditRuleData(rule);
                                setEditRuleTitle(String(rule.title ?? ""));
                                setEditRuleInstruction(
                                  String(rule.instruction ?? ""),
                                );
                                setEditRuleOpen(true);
                              }}
                              style={{
                                flexDirection: "row",
                                alignItems: "flex-start",
                                paddingVertical: 6,
                                borderBottomWidth:
                                  idx < pbRules.length - 1 ? 1 : 0,
                                borderBottomColor: `${borderColor}80`,
                                gap: 6,
                              }}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: mutedColor,
                                  fontWeight: "700",
                                  minWidth: 22,
                                }}
                              >
                                {str(rule.rule_order)}.
                              </Text>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: "500",
                                    color: textColor,
                                  }}
                                  numberOfLines={1}
                                >
                                  {str(rule.title)}
                                </Text>
                                <View
                                  style={{
                                    flexDirection: "row",
                                    gap: 4,
                                    marginTop: 3,
                                  }}
                                >
                                  <TypeBadge
                                    type={String(rule.rule_type ?? "policy")}
                                  />
                                  <SeverityBadge
                                    severity={String(rule.severity ?? "normal")}
                                  />
                                  {!isTruthy(rule.is_active) && (
                                    <ActiveBadge active={false} />
                                  )}
                                </View>
                              </View>
                              <Ionicons
                                name="pencil-outline"
                                size={14}
                                color={mutedColor}
                              />
                            </TouchableOpacity>
                          ))}
                          <NavLink
                            label="Gerenciar regras"
                            onPress={() =>
                              router.push({
                                pathname:
                                  "/Administrador/agent-playbook-rules" as any,
                                params: {
                                  playbookId: pbId,
                                  tenantId,
                                },
                              })
                            }
                          />
                        </View>
                      )}

                      {/* ── Tabelas ── */}
                      <SubSectionRow
                        sectionKey={`${pbKey}-tables`}
                        label="Tabelas de Referência"
                        count={pbTables.length}
                      />
                      {expanded.has(`${pbKey}-tables`) && (
                        <View
                          style={{
                            marginLeft: 8,
                            marginBottom: 8,
                          }}
                        >
                          {pbTables.length === 0 ? (
                            <Text
                              style={{
                                fontSize: 12,
                                color: mutedColor,
                                fontStyle: "italic",
                              }}
                            >
                              Nenhuma tabela configurada.
                            </Text>
                          ) : (
                            pbTables.map((t) => (
                              <View
                                key={String(t.id)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  paddingVertical: 4,
                                  gap: 6,
                                }}
                              >
                                <Ionicons
                                  name="server-outline"
                                  size={12}
                                  color={mutedColor}
                                />
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: "500",
                                    color: textColor,
                                  }}
                                >
                                  {str(t.table_name)}
                                </Text>
                                <Badge
                                  label={str(t.access_mode)}
                                  color={tintColor}
                                  bg={`${tintColor}15`}
                                />
                                {isTruthy(t.is_required) && (
                                  <Badge
                                    label="obrigatória"
                                    color="#f59e0b"
                                    bg="#f59e0b20"
                                  />
                                )}
                              </View>
                            ))
                          )}
                          <NavLink
                            label="Gerenciar tabelas"
                            onPress={() =>
                              router.push({
                                pathname:
                                  "/Administrador/agent-playbook-tables" as any,
                                params: {
                                  playbookId: pbId,
                                  tenantId,
                                },
                              })
                            }
                          />
                        </View>
                      )}

                      {/* ── Handoff ── */}
                      <SubSectionRow
                        sectionKey={`${pbKey}-handoff`}
                        label="Handoff"
                        count={pbHandoff.length}
                      />
                      {expanded.has(`${pbKey}-handoff`) && (
                        <View
                          style={{
                            marginLeft: 8,
                            marginBottom: 8,
                          }}
                        >
                          {pbHandoff.length === 0 ? (
                            <Text
                              style={{
                                fontSize: 12,
                                color: mutedColor,
                                fontStyle: "italic",
                              }}
                            >
                              Nenhuma política configurada.
                            </Text>
                          ) : (
                            pbHandoff.map((h) => (
                              <View
                                key={String(h.id)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  paddingVertical: 4,
                                  gap: 6,
                                }}
                              >
                                <Ionicons
                                  name="swap-horizontal-outline"
                                  size={12}
                                  color={mutedColor}
                                />
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: textColor,
                                  }}
                                >
                                  {str(h.from_channel)} → {str(h.to_channel)}
                                </Text>
                                <Badge
                                  label={str(h.trigger_type)}
                                  color={tintColor}
                                  bg={`${tintColor}15`}
                                />
                              </View>
                            ))
                          )}
                          <NavLink
                            label="Gerenciar handoff"
                            onPress={() =>
                              router.push({
                                pathname:
                                  "/Administrador/agent-handoff-policies" as any,
                                params: {
                                  playbookId: pbId,
                                  tenantId,
                                  agentId,
                                },
                              })
                            }
                          />
                        </View>
                      )}

                      {/* Playbook deep link */}
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: `${borderColor}60`,
                          marginTop: 6,
                          paddingTop: 6,
                        }}
                      >
                        <NavLink
                          label="Editar playbook completo"
                          onPress={() =>
                            router.push({
                              pathname: "/Administrador/agent-playbooks" as any,
                              params: { agentId, tenantId },
                            })
                          }
                        />
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </SectionContent>

        {/* ═══ Estados ═══ */}
        <SectionHeader
          sectionKey="states"
          title="Estados"
          count={states.length}
          icon="git-branch-outline"
        />
        <SectionContent sectionKey="states">
          {states.length === 0 ? (
            <Text
              style={{
                color: mutedColor,
                fontStyle: "italic",
                fontSize: 13,
              }}
            >
              Nenhum estado configurado.
            </Text>
          ) : (
            states.map((st) => {
              const isInitial = isTruthy(st.is_initial);
              const isTerminal = isTruthy(st.is_terminal);
              return (
                <View
                  key={String(st.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: `${borderColor}60`,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: isInitial
                        ? "#05966920"
                        : isTerminal
                          ? "#dc262620"
                          : `${borderColor}40`,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: isInitial
                          ? "#059669"
                          : isTerminal
                            ? "#dc2626"
                            : mutedColor,
                      }}
                    >
                      {isInitial ? "★" : isTerminal ? "⊗" : "○"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: textColor,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      }}
                      numberOfLines={1}
                    >
                      [{str(st.state_key)}]
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: mutedColor,
                      }}
                      numberOfLines={1}
                    >
                      {str(st.state_label)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
          <NavLink
            label="Gerenciar estados"
            onPress={() =>
              router.push({
                pathname: "/Administrador/agent_states" as any,
                params: { agentId },
              })
            }
          />
        </SectionContent>

        {/* ═══ Canais ═══ */}
        <SectionHeader
          sectionKey="channels"
          title="Canais"
          count={bindings.length}
          icon="radio-outline"
        />
        <SectionContent sectionKey="channels">
          {bindings.length === 0 ? (
            <Text
              style={{
                color: mutedColor,
                fontStyle: "italic",
                fontSize: 13,
              }}
            >
              Nenhum canal configurado.
            </Text>
          ) : (
            bindings.map((b) => (
              <View
                key={String(b.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 8,
                  gap: 8,
                }}
              >
                <Ionicons name="radio" size={14} color={tintColor} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: textColor,
                    }}
                  >
                    {str(b.channel)}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: mutedColor }}
                    numberOfLines={1}
                  >
                    {str(b.webhook_url)}
                  </Text>
                </View>
                <ActiveBadge active={isTruthy(b.is_active)} />
              </View>
            ))
          )}
          <NavLink
            label="Gerenciar canais"
            onPress={() =>
              router.push({
                pathname: "/Administrador/agent-channel-bindings" as any,
                params: { agentId, tenantId },
              })
            }
          />
        </SectionContent>
      </ScrollView>

      {/* ═══ Edit System Prompt Modal ═══ */}
      <Modal
        visible={editPromptOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditPromptOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.55)",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <View
              style={{
                backgroundColor: cardBg,
                borderRadius: 12,
                padding: 16,
                maxHeight: "90%",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: textColor,
                  marginBottom: 12,
                }}
              >
                Editar System Prompt
              </Text>
              <TextInput
                value={editPromptText}
                onChangeText={setEditPromptText}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  backgroundColor: inputBg,
                  color: textColor,
                  padding: 12,
                  minHeight: 300,
                  maxHeight: 500,
                  fontSize: 13,
                  lineHeight: 18,
                  textAlignVertical: "top",
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 12,
                  justifyContent: "flex-end",
                }}
              >
                <TouchableOpacity
                  onPress={() => setEditPromptOpen(false)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <Text style={{ color: textColor, fontWeight: "600" }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={savePrompt}
                  disabled={saving}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    backgroundColor: saving ? mutedColor : tintColor,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    {saving ? "Salvando..." : "Salvar"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ Edit Rule Modal ═══ */}
      <Modal
        visible={editRuleOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditRuleOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.55)",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <View
              style={{
                backgroundColor: cardBg,
                borderRadius: 12,
                padding: 16,
                maxHeight: "90%",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: textColor,
                  marginBottom: 4,
                }}
              >
                Editar Regra
              </Text>
              {editRuleData && (
                <View
                  style={{
                    flexDirection: "row",
                    gap: 4,
                    marginBottom: 12,
                  }}
                >
                  <TypeBadge
                    type={String(editRuleData.rule_type ?? "policy")}
                  />
                  <SeverityBadge
                    severity={String(editRuleData.severity ?? "normal")}
                  />
                  <Text style={{ fontSize: 11, color: mutedColor }}>
                    #{String(editRuleData.rule_order ?? "")}
                  </Text>
                </View>
              )}

              <Text
                style={{
                  fontSize: 12,
                  color: mutedColor,
                  marginBottom: 4,
                }}
              >
                Título
              </Text>
              <TextInput
                value={editRuleTitle}
                onChangeText={setEditRuleTitle}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  backgroundColor: inputBg,
                  color: textColor,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  marginBottom: 12,
                }}
              />

              <Text
                style={{
                  fontSize: 12,
                  color: mutedColor,
                  marginBottom: 4,
                }}
              >
                Instrução
              </Text>
              <ScrollView style={{ maxHeight: 300 }}>
                <TextInput
                  value={editRuleInstruction}
                  onChangeText={setEditRuleInstruction}
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    backgroundColor: inputBg,
                    color: textColor,
                    padding: 12,
                    minHeight: 200,
                    fontSize: 13,
                    lineHeight: 18,
                    textAlignVertical: "top",
                  }}
                />
              </ScrollView>

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 12,
                  justifyContent: "flex-end",
                }}
              >
                <TouchableOpacity
                  onPress={() => setEditRuleOpen(false)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <Text style={{ color: textColor, fontWeight: "600" }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveRule}
                  disabled={saving}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    backgroundColor: saving ? mutedColor : tintColor,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    {saving ? "Salvando..." : "Salvar"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
