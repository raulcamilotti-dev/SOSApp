import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    countConversationsToday,
    getAtendimentoRobotStatus,
    listConversationMessages,
    listConversations,
    sendManualMessage,
    setAtendimentoRobotActive,
    type OperatorChatMessage,
    type OperatorConversation,
} from "@/services/operator-chat";
import { sendOperatorToWebhook } from "@/services/robot";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type MessageRole = "human" | "robot" | "client";

function getMessageRole(tipo: string): MessageRole {
  const normalized = tipo.trim().toLowerCase();

  if (["manual", "operator", "operador", "atendente"].includes(normalized)) {
    return "human";
  }

  if (
    ["ai", "ia", "bot", "robot", "assistant", "automation"].includes(normalized)
  ) {
    return "robot";
  }

  if (
    [
      "client",
      "cliente",
      "customer",
      "human",
      "humano",
      "incoming",
      "inbound",
      "received",
      "user",
    ].includes(normalized)
  ) {
    return "client";
  }

  return "client";
}

function getMessageRoleLabel(role: MessageRole): string {
  if (role === "human") return "Humano";
  if (role === "robot") return "Robô";
  return "Cliente";
}

function isOperatorMessage(tipo: string): boolean {
  const normalized = tipo.trim().toLowerCase();
  return ["manual", "operator", "operador"].includes(normalized);
}

type PendingOutboxMessage = {
  id: string;
  sessionId: string;
  text: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
};

const OPERATOR_OUTBOX_KEY = "operator-chat-outbox-v1";
const OUTBOX_RETRY_INTERVAL_MS = 30000;
const CONVERSATIONS_REFRESH_INTERVAL_MS = 30000;
const MESSAGES_REFRESH_INTERVAL_MS = 15000;
const ROBOT_STATUS_REFRESH_INTERVAL_MS = 45000;

export default function AtendimentoOperadorScreen() {
  const { user } = useAuth();
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const inputBg = useThemeColor({}, "input");
  const onTintTextColor = useThemeColor({}, "background");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<OperatorConversation[]>(
    [],
  );
  const [messages, setMessages] = useState<OperatorChatMessage[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [todayCount, setTodayCount] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [processingOutbox, setProcessingOutbox] = useState(false);
  const [outbox, setOutbox] = useState<PendingOutboxMessage[]>([]);
  const [robotActive, setRobotActive] = useState(true);
  const [updatingRobot, setUpdatingRobot] = useState(false);

  const flatListRef = useRef<FlatList<OperatorChatMessage>>(null);
  const outboxRef = useRef<PendingOutboxMessage[]>([]);
  const lastScrollSignatureRef = useRef<string>("");
  const loadingConversationsRef = useRef(false);
  const loadingMessagesRef = useRef(false);
  const loadingRobotStatusRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const initialScrollDoneRef = useRef(false);

  const scrollToBottom = useCallback((animated = true) => {
    if (!flatListRef.current) return;
    // Use scrollToEnd with multiple attempts to ensure it works
    const doScroll = (anim: boolean) => {
      try {
        flatListRef.current?.scrollToEnd({ animated: anim });
      } catch {
        // silent
      }
    };
    // Immediate attempt
    doScroll(animated);
    // Retry after layout settles
    requestAnimationFrame(() => doScroll(animated));
    // Final safety net
    setTimeout(() => doScroll(false), 100);
    setTimeout(() => doScroll(false), 300);
  }, []);

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      if (shouldAutoScrollRef.current && messages.length > 0) {
        scrollToBottom(initialScrollDoneRef.current);
        if (!initialScrollDoneRef.current) {
          initialScrollDoneRef.current = true;
        }
      }
    },
    [messages.length, scrollToBottom],
  );

  const handleListLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      layoutHeightRef.current = e.nativeEvent.layout.height;
    },
    [],
  );

  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      // If user scrolled more than 150px from bottom, stop auto-scroll
      shouldAutoScrollRef.current = distanceFromBottom < 150;
    },
    [],
  );

  const persistOutbox = useCallback(async (items: PendingOutboxMessage[]) => {
    try {
      await AsyncStorage.setItem(OPERATOR_OUTBOX_KEY, JSON.stringify(items));
    } catch {
      // sem throw para não bloquear o fluxo de chat
    }
  }, []);

  const setOutboxAndPersist = useCallback(
    (
      updater:
        | PendingOutboxMessage[]
        | ((prev: PendingOutboxMessage[]) => PendingOutboxMessage[]),
    ) => {
      setOutbox((prev) => {
        const next =
          typeof updater === "function"
            ? (
                updater as (
                  prev: PendingOutboxMessage[],
                ) => PendingOutboxMessage[]
              )(prev)
            : updater;
        outboxRef.current = next;
        void persistOutbox(next);
        return next;
      });
    },
    [persistOutbox],
  );

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.session_id === selectedSessionId),
    [conversations, selectedSessionId],
  );

  const filteredConversations = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    if (!term) return conversations;

    return conversations.filter((item) => {
      const name = (item.nome_cliente ?? "").toLowerCase();
      const sessionId = (item.session_id ?? "").toLowerCase();
      const content = (item.conteudo ?? "").toLowerCase();
      return (
        name.includes(term) ||
        sessionId.includes(term) ||
        content.includes(term)
      );
    });
  }, [conversations, searchInput]);

  const loadConversations = useCallback(
    async (options?: { includeCount?: boolean }) => {
      if (loadingConversationsRef.current) return;
      loadingConversationsRef.current = true;

      try {
        const includeCount = options?.includeCount ?? true;
        const conversationRows = await listConversations();
        const conversationCount = includeCount
          ? await countConversationsToday()
          : 0;

        const now = new Date();
        const localTodayCount = conversationRows.filter((row) => {
          const dt = new Date(row.update_message);
          if (Number.isNaN(dt.getTime())) return false;
          return (
            dt.getDate() === now.getDate() &&
            dt.getMonth() === now.getMonth() &&
            dt.getFullYear() === now.getFullYear()
          );
        }).length;

        setConversations(conversationRows);
        setTodayCount(
          includeCount
            ? Math.max(conversationCount, localTodayCount)
            : localTodayCount,
        );

        if (conversationRows.length === 0) {
          if (selectedSessionId) {
            setSelectedSessionId("");
          }
          return;
        }

        const selectedStillExists = conversationRows.some(
          (row) => row.session_id === selectedSessionId,
        );

        if (selectedSessionId && !selectedStillExists) {
          setSelectedSessionId("");
        }
      } finally {
        loadingConversationsRef.current = false;
      }
    },
    [selectedSessionId],
  );

  const loadMessages = useCallback(async (sessionId: string) => {
    if (loadingMessagesRef.current) return;
    loadingMessagesRef.current = true;
    try {
      const rows = await listConversationMessages(sessionId);
      setMessages(rows);
    } finally {
      loadingMessagesRef.current = false;
    }
  }, []);

  const loadRobotStatus = useCallback(async (sessionId: string) => {
    if (loadingRobotStatusRef.current) return;
    loadingRobotStatusRef.current = true;
    try {
      const active = await getAtendimentoRobotStatus(sessionId);
      setRobotActive(active);
    } finally {
      loadingRobotStatusRef.current = false;
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadConversations({ includeCount: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar chat";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [loadConversations]);

  const processOutbox = useCallback(async () => {
    if (processingOutbox) return;
    const nextItem = outboxRef.current[0];
    if (!nextItem) return;

    const now = Date.now();
    const lastAttemptMs = nextItem.lastAttemptAt
      ? new Date(nextItem.lastAttemptAt).getTime()
      : 0;
    const shouldWaitRetry =
      nextItem.attempts > 0 &&
      Number.isFinite(lastAttemptMs) &&
      now - lastAttemptMs < OUTBOX_RETRY_INTERVAL_MS;
    if (shouldWaitRetry) return;

    setProcessingOutbox(true);
    setOutboxAndPersist((prev) => {
      if (!prev.length) return prev;
      if (prev[0].id !== nextItem.id) return prev;
      const first = prev[0];
      return [
        {
          ...first,
          lastAttemptAt: new Date().toISOString(),
        },
        ...prev.slice(1),
      ];
    });
    try {
      await sendOperatorToWebhook({
        message: nextItem.text,
        sessionId: nextItem.sessionId,
        user_id: String(user?.id ?? "operador"),
        channel: "app",
        channel_identifier: nextItem.sessionId,
        tenant_id: String(user?.tenant_id ?? ""),
        session_id: nextItem.sessionId,
        telefone_wa: nextItem.sessionId,
        whatsapp_number: nextItem.sessionId,
        phone: nextItem.sessionId,
      });

      setOutboxAndPersist((prev) => {
        if (!prev.length) return prev;
        if (prev[0].id !== nextItem.id) return prev;
        return prev.slice(1);
      });

      if (selectedSessionId === nextItem.sessionId) {
        await loadMessages(nextItem.sessionId);
      }
      await loadConversations({ includeCount: false });
      setError(null);
    } catch {
      setOutboxAndPersist((prev) => {
        if (!prev.length) return prev;
        if (prev[0].id !== nextItem.id) return prev;
        const failed = prev[0];
        return [
          {
            ...failed,
            attempts: failed.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
          },
          ...prev.slice(1),
        ];
      });
      setError(
        "Falha no webhook. Mensagem em fila para reenvio automático, mantendo a ordem.",
      );
    } finally {
      setProcessingOutbox(false);
    }
  }, [
    loadConversations,
    loadMessages,
    processingOutbox,
    selectedSessionId,
    setOutboxAndPersist,
    user?.id,
  ]);

  const loadSessionData = useCallback(
    async (sessionId: string, options?: { includeRobotStatus?: boolean }) => {
      setRefreshing(true);
      setError(null);
      try {
        await loadMessages(sessionId);
        if (options?.includeRobotStatus ?? false) {
          await loadRobotStatus(sessionId);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erro ao carregar histórico";
        setError(message);
      } finally {
        setRefreshing(false);
      }
    },
    [loadMessages, loadRobotStatus],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (!sessionId || sessionId === selectedSessionId) return;
      setSelectedSessionId(sessionId);
    },
    [selectedSessionId],
  );

  const handleBackToConversations = useCallback(() => {
    setSelectedSessionId("");
    setMessages([]);
    setMessageInput("");
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
  }, []);

  const handleToggleRobot = useCallback(async () => {
    if (!selectedSessionId || updatingRobot) return;

    setUpdatingRobot(true);
    setError(null);
    try {
      const nextStatus = !robotActive;
      await setAtendimentoRobotActive(selectedSessionId, nextStatus);
      setRobotActive(nextStatus);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao atualizar status do robô";
      setError(message);
    } finally {
      setUpdatingRobot(false);
    }
  }, [robotActive, selectedSessionId, updatingRobot]);

  const handleSend = useCallback(async () => {
    const text = messageInput.trim();
    if (!selectedSessionId || !text || sending) return;

    setSending(true);
    setError(null);
    try {
      await sendManualMessage(selectedSessionId, text);

      const queuedMessage: PendingOutboxMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sessionId: selectedSessionId,
        text,
        createdAt: new Date().toISOString(),
        attempts: 0,
        lastAttemptAt: undefined,
      };
      setOutboxAndPersist((prev) => [...prev, queuedMessage]);

      setMessageInput("");
      await Promise.all([
        loadMessages(selectedSessionId),
        loadConversations({ includeCount: false }),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao enviar mensagem";
      setError(message);
    } finally {
      setSending(false);
    }
  }, [
    loadConversations,
    loadMessages,
    messageInput,
    selectedSessionId,
    sending,
    setOutboxAndPersist,
  ]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(OPERATOR_OUTBOX_KEY);
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw) as PendingOutboxMessage[];
        if (!Array.isArray(parsed)) return;
        const sanitized = parsed.filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.sessionId === "string" &&
            typeof item.text === "string" &&
            typeof item.attempts === "number",
        );
        outboxRef.current = sanitized;
        setOutbox(sanitized);
      } catch {
        // ignora erro de leitura de fila
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    outboxRef.current = outbox;
  }, [outbox]);

  useEffect(() => {
    if (!outbox.length) return;
    processOutbox().catch(() => undefined);
  }, [outbox, processOutbox]);

  useEffect(() => {
    if (!outbox.length) return;
    const timer = setInterval(() => {
      processOutbox().catch(() => undefined);
    }, OUTBOX_RETRY_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [outbox.length, processOutbox]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      lastScrollSignatureRef.current = "";
      return;
    }

    loadSessionData(selectedSessionId, { includeRobotStatus: true });
  }, [loadSessionData, selectedSessionId]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations({ includeCount: false }).catch(() => undefined);
    }, CONVERSATIONS_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedSessionId) return;
    const timer = setInterval(() => {
      loadMessages(selectedSessionId).catch(() => undefined);
    }, MESSAGES_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [loadMessages, selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) return;
    const timer = setInterval(() => {
      loadRobotStatus(selectedSessionId).catch(() => undefined);
    }, ROBOT_STATUS_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [loadRobotStatus, selectedSessionId]);

  // Scroll when new messages arrive
  useEffect(() => {
    if (!selectedSessionId || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    const signature = `${selectedSessionId}:${messages.length}:${lastMessage?.id ?? ""}:${lastMessage?.update_message ?? ""}`;
    if (lastScrollSignatureRef.current === signature) return;

    lastScrollSignatureRef.current = signature;
    shouldAutoScrollRef.current = true;
    scrollToBottom(true);
  }, [messages, scrollToBottom, selectedSessionId]);

  // Scroll when session changes — reset and force scroll
  useEffect(() => {
    if (!selectedSessionId) return;
    shouldAutoScrollRef.current = true;
    initialScrollDoneRef.current = false;
    // Multiple delayed attempts for initial load
    const t1 = setTimeout(() => scrollToBottom(false), 50);
    const t2 = setTimeout(() => scrollToBottom(false), 200);
    const t3 = setTimeout(() => scrollToBottom(false), 500);
    const t4 = setTimeout(() => scrollToBottom(false), 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [scrollToBottom, selectedSessionId]);

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View>
          <ThemedText type="title">
            {selectedSessionId ? "Conversa" : "Atendimento"}
          </ThemedText>
          <ThemedText style={{ color: mutedTextColor }}>
            Conversas hoje: {todayCount}
          </ThemedText>
          <ThemedText style={{ color: mutedTextColor, fontSize: 12 }}>
            Fila pendente: {outbox.length}
            {processingOutbox ? " (enviando em ordem...)" : ""}
          </ThemedText>
        </View>

        {selectedSessionId ? (
          <Pressable
            onPress={handleToggleRobot}
            disabled={updatingRobot}
            style={({ pressed }) => [
              styles.robotButton,
              {
                backgroundColor: robotActive ? tintColor + "22" : cardColor,
                borderColor: robotActive ? tintColor : borderColor,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <ThemedText
              style={{
                color: robotActive ? tintColor : mutedTextColor,
                fontWeight: "700",
              }}
            >
              {updatingRobot
                ? "Atualizando..."
                : robotActive
                  ? "Robô ativo"
                  : "Robô pausado"}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.content}>
        {!selectedSessionId ? (
          <View style={styles.conversationsFullContainer}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Conversas
            </ThemedText>

            <View style={styles.searchRow}>
              <TextInput
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder="Pesquisar por nome, número ou mensagem"
                placeholderTextColor={mutedTextColor}
                style={[
                  styles.searchInput,
                  {
                    backgroundColor: inputBg,
                    color: textColor,
                    borderColor,
                  },
                ]}
              />
              {searchInput.trim() ? (
                <Pressable
                  onPress={handleClearSearch}
                  style={({ pressed }) => [
                    styles.clearSearchButton,
                    {
                      borderColor,
                      backgroundColor: cardColor,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <ThemedText
                    style={{ color: mutedTextColor, fontWeight: "700" }}
                  >
                    Limpar
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={tintColor} />
              </View>
            ) : (
              <FlatList
                data={filteredConversations}
                keyExtractor={(item, index) =>
                  `${item.session_id}-${item.update_message || "no-date"}-${index}`
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelectSession(item.session_id)}
                    style={({ pressed }) => [
                      styles.conversationItem,
                      {
                        backgroundColor: cardColor,
                        borderColor,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <ThemedText
                      type="default"
                      numberOfLines={1}
                      style={{ fontWeight: "700" }}
                    >
                      {item.nome_cliente || item.session_id}
                    </ThemedText>
                    <ThemedText
                      numberOfLines={1}
                      style={{ color: mutedTextColor }}
                    >
                      {item.session_id}
                    </ThemedText>
                    <ThemedText
                      numberOfLines={1}
                      style={{ color: mutedTextColor }}
                    >
                      {item.conteudo || "Sem mensagem"}
                    </ThemedText>
                    <ThemedText style={{ color: mutedTextColor, fontSize: 12 }}>
                      {formatDateTime(item.update_message)}
                    </ThemedText>
                  </Pressable>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
                ListEmptyComponent={
                  <View style={styles.emptyMessages}>
                    <ThemedText style={{ color: mutedTextColor }}>
                      {searchInput.trim()
                        ? "Nenhuma conversa encontrada para a pesquisa."
                        : "Nenhuma conversa encontrada."}
                    </ThemedText>
                  </View>
                }
              />
            )}
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.chatContainer}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
            enabled={Platform.OS !== "web"}
          >
            <View style={[styles.chatHeader, { borderColor }]}>
              <View style={styles.chatHeaderTopRow}>
                <Pressable onPress={handleBackToConversations}>
                  <ThemedText style={{ color: tintColor, fontWeight: "700" }}>
                    Voltar
                  </ThemedText>
                </Pressable>
              </View>
              <ThemedText type="subtitle">
                {selectedConversation?.nome_cliente || "Conversa"}
              </ThemedText>
              <ThemedText style={{ color: mutedTextColor }}>
                Sessão: {selectedSessionId}
              </ThemedText>
            </View>

            <View style={styles.messagesArea}>
              <FlatList
                ref={flatListRef}
                data={messages}
                style={styles.messagesList}
                keyExtractor={(item) => `${item.id}-${item.update_message}`}
                onContentSizeChange={handleContentSizeChange}
                onLayout={handleListLayout}
                onScroll={handleScroll}
                scrollEventThrottle={100}
                maintainVisibleContentPosition={
                  Platform.OS !== "web" ? { minIndexForVisible: 0 } : undefined
                }
                onScrollToIndexFailed={() => {
                  setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: false });
                  }, 80);
                }}
                renderItem={({ item }) => {
                  const role = getMessageRole(item.tipo);
                  const mine = role === "human" || isOperatorMessage(item.tipo);
                  const roleLabel = getMessageRoleLabel(role);
                  return (
                    <View
                      style={[
                        styles.messageBubble,
                        {
                          alignSelf: mine ? "flex-end" : "flex-start",
                          backgroundColor:
                            role === "human"
                              ? tintColor
                              : role === "robot"
                                ? backgroundColor
                                : cardColor,
                          borderColor:
                            role === "robot" ? tintColor : borderColor,
                        },
                      ]}
                    >
                      <ThemedText
                        style={{
                          color: mine ? onTintTextColor : mutedTextColor,
                          fontSize: 11,
                          fontWeight: "700",
                          marginBottom: 4,
                          opacity: mine ? 0.8 : 1,
                        }}
                      >
                        {roleLabel}
                      </ThemedText>
                      <ThemedText
                        style={{
                          color: mine ? onTintTextColor : textColor,
                          fontSize: 14,
                        }}
                      >
                        {item.conteudo}
                      </ThemedText>
                      <ThemedText
                        style={{
                          marginTop: 4,
                          color: mine ? onTintTextColor : mutedTextColor,
                          fontSize: 11,
                          textAlign: "right",
                          opacity: mine ? 0.8 : 1,
                        }}
                      >
                        {formatDateTime(item.update_message)}
                      </ThemedText>
                    </View>
                  );
                }}
                contentContainerStyle={styles.messagesContent}
                ListEmptyComponent={
                  <View style={styles.emptyMessages}>
                    <ThemedText style={{ color: mutedTextColor }}>
                      {refreshing
                        ? "Carregando mensagens..."
                        : "Sem mensagens para esta sessão."}
                    </ThemedText>
                  </View>
                }
                showsVerticalScrollIndicator={false}
              />
            </View>

            <View
              style={[
                styles.inputRow,
                { borderTopColor: borderColor, backgroundColor: cardColor },
              ]}
            >
              <TextInput
                value={messageInput}
                onChangeText={setMessageInput}
                placeholder="Digite a mensagem para o cliente"
                placeholderTextColor={mutedTextColor}
                style={[
                  styles.input,
                  {
                    backgroundColor: inputBg,
                    color: textColor,
                    borderColor,
                  },
                ]}
                editable={!sending}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
              <Pressable
                onPress={handleSend}
                disabled={!messageInput.trim() || sending}
                style={({ pressed }) => [
                  styles.sendButton,
                  {
                    backgroundColor: messageInput.trim()
                      ? tintColor
                      : borderColor,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "700" }}
                >
                  {sending ? "..." : "Enviar"}
                </ThemedText>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>

      {error ? (
        <View style={[styles.errorBox, { borderColor }]}>
          <ThemedText style={{ color: textColor }}>{error}</ThemedText>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  robotButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 12,
  },
  conversationsFullContainer: {
    flex: 1,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  clearSearchButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  loadingContainer: {
    paddingVertical: 16,
  },
  conversationItem: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  chatContainer: {
    flex: 1,
    minHeight: 0,
    borderRadius: 12,
    overflow: "hidden",
  },
  chatHeader: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  chatHeaderTopRow: {
    marginBottom: 6,
  },
  messagesArea: {
    flex: 1,
    minHeight: 0,
  },
  messagesContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  messagesList: {
    flex: 1,
    minHeight: 0,
  },
  emptyMessages: {
    paddingVertical: 20,
    alignItems: "center",
  },
  messageBubble: {
    maxWidth: "85%",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorBox: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
