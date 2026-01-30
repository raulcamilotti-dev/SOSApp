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

export default function AtendimentoScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    AsyncStorage.getItem("chatSessionId").then((stored) => {
      if (stored) {
        setSessionId(stored);
      } else {
        const newId = `sess-${Date.now()}-${Math.random()}`;
        AsyncStorage.setItem("chatSessionId", newId);
        setSessionId(newId);
      }
    });
  }, []);

  async function handleSend(text: string) {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      from: "Você",
      text,
      phone: (await AsyncStorage.getItem("userPhone")) ?? "",
      time: now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      // Recupera o user_id do AsyncStorage (ajuste a chave conforme necessário)
      const user_id = await AsyncStorage.getItem("user_id");

      const reply = await sendToRobot({
        message: text,
        sessionId,
        user_id: user_id ?? "", // Garante que user_id nunca será undefined
        channel: "app",
        channel_identifier: "sos-escritura",
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

  // Scroll to latest message
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Helper to format time
  function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Add timestamp to messages
  const messagesWithTime = messages.map((msg) => ({
    ...msg,
    time: msg.id.includes("-")
      ? formatTime(new Date(Number(msg.id.split("-")[1])))
      : "",
  }));

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: 48,
          paddingBottom: 16,
          paddingHorizontal: 20,
          backgroundColor: "#1e293b",
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: "#334155",
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#2563eb",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 20 }}>
            A
          </Text>
        </View>
        <View>
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>
            Ana (Atendimento)
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 13 }}>Online</Text>
        </View>
      </View>

      {/* CHAT */}
      <FlatList
        ref={flatListRef}
        data={messagesWithTime}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.from === "Você" ? "flex-end" : "flex-start",
              backgroundColor: item.from === "Você" ? "#2563eb" : "#1e293b",
              padding: 12,
              borderRadius: 18,
              marginBottom: 10,
              maxWidth: "80%",
              marginHorizontal: 10,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 15 }}>{item.text}</Text>
            <Text
              style={{
                color: "#cbd5e1",
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

      {/* INPUT */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          backgroundColor: "#1e293b",
          borderTopWidth: 1,
          borderTopColor: "#334155",
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Digite sua mensagem…"
          placeholderTextColor="#64748b"
          style={{
            flex: 1,
            borderWidth: 0,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 10,
            color: "#fff",
            backgroundColor: "#334155",
            fontSize: 15,
          }}
          onSubmitEditing={() => handleSend(input)}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => handleSend(input)}
          style={{
            backgroundColor: input.trim() ? "#2563eb" : "#334155",
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 999,
            marginLeft: 8,
            opacity: input.trim() ? 1 : 0.6,
          }}
          disabled={!input.trim()}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>
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
