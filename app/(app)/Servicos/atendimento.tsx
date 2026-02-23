import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { listConversationMessages } from "@/services/operator-chat";
import { sendToRobot } from "@/services/robot";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

type ChatMessage = {
  time: string;
  id: string;
  phone: string;
  from: "Você" | "Ana";
  text: string;
};

function isOperatorMessage(tipo: string): boolean {
  const normalized = tipo.trim().toLowerCase();
  return ["manual", "operator", "operador", "atendente"].includes(normalized);
}

function isRobotMessage(tipo: string): boolean {
  const normalized = tipo.trim().toLowerCase();
  return ["ai", "ia", "bot", "robot", "assistant", "automation"].includes(
    normalized,
  );
}

export default function AtendimentoScreen() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loggedPhone, setLoggedPhone] = useState<string>("");
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const inputBg = useThemeColor({}, "input");
  const onTintTextColor = useThemeColor({}, "background");

  useEffect(() => {
    const fromUser = (user?.phone ?? user?.telefone ?? "").toString().trim();
    if (fromUser) {
      setLoggedPhone(fromUser);
      return;
    }

    AsyncStorage.getItem("userPhone").then((stored) => {
      if (stored?.trim()) {
        setLoggedPhone(stored.trim());
      }
    });
  }, [user?.phone, user?.telefone]);

  const normalizePhone = (value: string): string => {
    const digits = value.replace(/\D+/g, "").trim();
    return digits || value.trim();
  };

  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      const storagePhone = (await AsyncStorage.getItem("userPhone")) ?? "";
      const sessionPhone = normalizePhone(loggedPhone || storagePhone);
      if (!sessionPhone) return;

      try {
        const rows = await listConversationMessages(sessionPhone);
        const recent = rows
          .slice()
          .sort((a, b) => {
            const timeA = new Date(a.update_message || 0).getTime();
            const timeB = new Date(b.update_message || 0).getTime();
            return timeA - timeB;
          })
          .slice(-40)
          .map((row) => {
            const from: "Você" | "Ana" = isRobotMessage(row.tipo)
              ? "Ana"
              : isOperatorMessage(row.tipo)
                ? "Ana"
                : "Você";

            const date = new Date(row.update_message || Date.now());
            return {
              id: String(row.id || crypto.randomUUID()),
              from,
              phone: sessionPhone,
              text: String(row.conteudo || ""),
              time: Number.isFinite(date.getTime()) ? formatTime(date) : now(),
            } as ChatMessage;
          })
          .filter((item) => item.text.trim().length > 0);

        if (!mounted) return;
        setMessages(recent);
      } catch {
        if (!mounted) return;
      }
    };

    loadHistory();
    return () => {
      mounted = false;
    };
  }, [loggedPhone]);

  async function handleSend(text: string) {
    if (!text.trim()) return;

    // Track chat start on first user message
    if (messages.length === 0) {
      // analytics removed
    }

    const storagePhone = (await AsyncStorage.getItem("userPhone")) ?? "";
    const sessionPhone = normalizePhone(loggedPhone || storagePhone);

    if (!sessionPhone) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          from: "Ana",
          phone: "",
          text: "Não consegui identificar seu telefone. Atualize seu perfil para continuar o atendimento.",
          time: now(),
        },
      ]);
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      from: "Você",
      text,
      phone: sessionPhone,
      time: now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const user_id = await AsyncStorage.getItem("user_id");

      const reply = await sendToRobot({
        message: text,
        sessionId: sessionPhone,
        user_id: user_id ?? "",
        channel: "app",
        channel_identifier: sessionPhone,
        tenant_id: user?.tenant_id ?? "",
        session_id: sessionPhone,
        telefone_wa: sessionPhone,
        whatsapp_number: sessionPhone,
        phone: sessionPhone,
      });

      const botMsg: ChatMessage = {
        id: crypto.randomUUID(),
        from: "Ana",
        text: reply,
        phone: "",
        time: now(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const phone = (await AsyncStorage.getItem("userPhone")) ?? "";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          from: "Ana",
          phone,
          text: "Tive um problema técnico. Tente novamente.",
          time: now(),
        },
      ]);
    }
  }

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const messagesWithTime = messages.map((msg) => ({
    ...msg,
    time: msg.id.includes("-")
      ? formatTime(new Date(Number(msg.id.split("-")[1])))
      : "",
  }));

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <View
        style={{
          paddingTop: 48,
          paddingBottom: 16,
          paddingHorizontal: 20,
          backgroundColor: cardColor,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: tintColor,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Text
            style={{ color: onTintTextColor, fontWeight: "bold", fontSize: 20 }}
          >
            A
          </Text>
        </View>
        <View>
          <Text style={{ color: textColor, fontWeight: "bold", fontSize: 18 }}>
            Ana (Atendimento)
          </Text>
          <Text style={{ color: mutedTextColor, fontSize: 13 }}>Online</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messagesWithTime}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.from === "Você" ? "flex-end" : "flex-start",
              backgroundColor: item.from === "Você" ? tintColor : cardColor,
              padding: 12,
              borderRadius: 18,
              marginBottom: 10,
              maxWidth: "80%",
              marginHorizontal: 10,
              shadowColor: borderColor,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Text
              style={{
                color: item.from === "Você" ? onTintTextColor : textColor,
                fontSize: 15,
              }}
            >
              {item.text}
            </Text>
            <Text
              style={{
                color: mutedTextColor,
                fontSize: 11,
                alignSelf: "flex-end",
                marginTop: 4,
              }}
            >
              {item.time}
            </Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 96, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          backgroundColor: cardColor,
          borderTopWidth: 1,
          borderTopColor: borderColor,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Digite sua mensagem…"
          placeholderTextColor={mutedTextColor}
          style={{
            flex: 1,
            borderWidth: 0,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 10,
            color: textColor,
            backgroundColor: inputBg,
            fontSize: 15,
          }}
          onSubmitEditing={() => handleSend(input)}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => handleSend(input)}
          style={{
            backgroundColor: input.trim() ? tintColor : borderColor,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 999,
            marginLeft: 8,
            opacity: input.trim() ? 1 : 0.6,
          }}
          disabled={!input.trim()}
        >
          <Text
            style={{
              color: input.trim() ? onTintTextColor : textColor,
              fontWeight: "bold",
              fontSize: 15,
            }}
          >
            Enviar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
function now(): string {
  const date = new Date();
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
