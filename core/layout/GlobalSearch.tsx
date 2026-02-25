import { ADMIN_PAGES } from "@/core/admin/admin-pages";
import { useAuth } from "@/core/auth/AuthContext";
import { isRadulUser } from "@/core/auth/auth.utils";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
    Dimensions,
    FlatList,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Extra non-admin searchable routes                                  */
/* ------------------------------------------------------------------ */

interface SearchItem {
  id: string;
  title: string;
  description: string;
  group: string;
  icon: string;
  route: string;
  keywords?: string[];
}

const EXTRA_ROUTES: SearchItem[] = [
  {
    id: "home",
    title: "Início",
    description: "Tela principal do app",
    group: "Navegação",
    icon: "home-outline",
    route: "/",
    keywords: ["home", "inicio", "dashboard"],
  },
  {
    id: "atendimento",
    title: "Atendimento",
    description: "Chat de atendimento ao cliente",
    group: "Serviços",
    icon: "chatbubble-ellipses-outline",
    route: "/Servicos/atendimento",
    keywords: ["chat", "conversa", "mensagem"],
  },
  {
    id: "servicos",
    title: "Serviços",
    description: "Lista de serviços disponíveis",
    group: "Serviços",
    icon: "construct-outline",
    route: "/Servicos/servicos",
  },
  {
    id: "meus_servicos",
    title: "Meus Serviços",
    description: "Serviços contratados e em andamento",
    group: "Serviços",
    icon: "documents-outline",
    route: "/Servicos/MeusServicos",
    keywords: ["pedidos", "contratados"],
  },
  {
    id: "meus_trabalhos",
    title: "Meus Trabalhos",
    description: "Trabalhos atribuídos a você",
    group: "Serviços",
    icon: "hammer-outline",
    route: "/Servicos/MeusTrabalhos",
    keywords: ["tarefas", "atribuidos"],
  },
  {
    id: "parceiro_canal",
    title: "Parceiro de Canal",
    description: "Indicacoes e comissoes do canal",
    group: "Serviços",
    icon: "ribbon-outline",
    route: "/Servicos/ParceiroCanal",
    keywords: ["parceiro", "canal", "indicacao", "comissao"],
  },
  {
    id: "minha_agenda",
    title: "Minha Agenda",
    description: "Agendamentos e compromissos",
    group: "Serviços",
    icon: "calendar-outline",
    route: "/Servicos/MinhaAgenda",
    keywords: ["agenda", "calendario", "compromisso"],
  },
  {
    id: "minhas_assinaturas",
    title: "Minhas Assinaturas",
    description: "Documentos para assinar digitalmente",
    group: "Serviços",
    icon: "pencil-outline",
    route: "/Servicos/MinhasAssinaturas",
    keywords: ["assinatura", "documento", "assinar"],
  },
  {
    id: "minhas_empresas",
    title: "Minhas Empresas",
    description: "Empresas vinculadas à sua conta",
    group: "Serviços",
    icon: "business-outline",
    route: "/Servicos/MinhasEmpresas",
    keywords: ["empresa", "cnpj"],
  },
  {
    id: "imoveis",
    title: "Imóveis",
    description: "Consultar e gerenciar imóveis",
    group: "Serviços",
    icon: "home-outline",
    route: "/Servicos/Imoveis",
    keywords: ["imovel", "propriedade", "property"],
  },
  {
    id: "solicitar_servico",
    title: "Solicitar Serviço",
    description: "Abrir uma nova solicitação de serviço",
    group: "Serviços",
    icon: "add-circle-outline",
    route: "/Servicos/SolicitarServico",
    keywords: ["novo", "solicitar", "abrir"],
  },
  {
    id: "ajuda",
    title: "Ajuda",
    description: "Central de ajuda e suporte",
    group: "Serviços",
    icon: "help-circle-outline",
    route: "/Servicos/Ajuda",
    keywords: ["ajuda", "suporte", "help", "faq"],
  },
  {
    id: "perfil",
    title: "Perfil",
    description: "Seus dados e configurações de conta",
    group: "Usuário",
    icon: "person-outline",
    route: "/Usuario/Perfil",
    keywords: ["perfil", "conta", "dados", "profile"],
  },
  {
    id: "calendar_sync",
    title: "Sincronizar Calendário",
    description: "Conectar com Google Calendar ou Outlook",
    group: "Usuário",
    icon: "sync-outline",
    route: "/Usuario/CalendarSync",
    keywords: ["calendario", "google", "outlook", "sync"],
  },
  {
    id: "change_password",
    title: "Alterar Senha",
    description: "Modificar sua senha de acesso",
    group: "Usuário",
    icon: "lock-closed-outline",
    route: "/Usuario/change-password",
    keywords: ["senha", "password", "alterar"],
  },
  {
    id: "administrador",
    title: "Administração",
    description: "Painel de administração do sistema",
    group: "Navegação",
    icon: "settings-outline",
    route: "/Administrador",
    keywords: ["admin", "configuracao", "painel"],
  },
  {
    id: "notificacoes",
    title: "Notificações",
    description: "Ver todas as notificações",
    group: "Navegação",
    icon: "notifications-outline",
    route: "/Notificacoes",
    keywords: ["notificacao", "alerta", "aviso"],
  },
];

/* ------------------------------------------------------------------ */
/*  Normalize text for search (remove accents, lowercase)              */
/* ------------------------------------------------------------------ */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ------------------------------------------------------------------ */
/*  Detect wide screen (desktop-like)                                  */
/* ------------------------------------------------------------------ */

const WIDE_BREAKPOINT = 768;

function useIsWide() {
  const [wide, setWide] = React.useState(
    Dimensions.get("window").width >= WIDE_BREAKPOINT,
  );
  React.useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setWide(window.width >= WIDE_BREAKPOINT);
    });
    return () => sub.remove();
  }, []);
  return wide;
}

/* ------------------------------------------------------------------ */
/*  Hook: build searchable index                                       */
/* ------------------------------------------------------------------ */

function useSearchIndex(): SearchItem[] {
  const { user } = useAuth();
  const isRadul = isRadulUser(user);

  return useMemo(() => {
    // Convert ADMIN_PAGES to SearchItem[]
    const adminItems: SearchItem[] = ADMIN_PAGES.filter((p) => {
      if (p.hidden) return false;
      if (p.superAdminOnly && !isRadul) return false;
      return true;
    }).map((p) => ({
      id: `admin_${p.id}`,
      title: p.title,
      description: p.description,
      group: p.group,
      icon: p.icon,
      route: p.route,
      keywords: [p.id, p.group.toLowerCase(), p.module],
    }));

    return [...EXTRA_ROUTES, ...adminItems];
  }, [isRadul]);
}

/* ------------------------------------------------------------------ */
/*  Search logic                                                       */
/* ------------------------------------------------------------------ */

function searchItems(items: SearchItem[], query: string): SearchItem[] {
  if (!query || query.length < 1) return [];
  const q = normalize(query);
  const terms = q.split(/\s+/).filter(Boolean);

  return items
    .map((item) => {
      const haystack = normalize(
        [
          item.title,
          item.description,
          item.group,
          ...(item.keywords ?? []),
        ].join(" "),
      );
      // Every term must match
      let score = 0;
      for (const term of terms) {
        if (!haystack.includes(term)) return { item, score: 0 };
        // Bonus for title match
        if (normalize(item.title).includes(term)) score += 3;
        else score += 1;
      }
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((r) => r.item);
}

/* ------------------------------------------------------------------ */
/*  Result Row                                                         */
/* ------------------------------------------------------------------ */

function ResultRow({
  item,
  onPress,
  tintColor,
  textColor,
  mutedColor,
  cardColor,
}: {
  item: SearchItem;
  onPress: () => void;
  tintColor: string;
  textColor: string;
  mutedColor: string;
  cardColor: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.resultRow, { borderBottomColor: `${mutedColor}20` }]}
      activeOpacity={0.6}
    >
      <View style={[s.resultIcon, { backgroundColor: `${tintColor}15` }]}>
        <Ionicons name={item.icon as any} size={18} color={tintColor} />
      </View>
      <View style={s.resultText}>
        <Text style={[s.resultTitle, { color: textColor }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[s.resultDesc, { color: mutedColor }]} numberOfLines={1}>
          {item.description}
        </Text>
      </View>
      <Text style={[s.resultGroup, { color: mutedColor }]} numberOfLines={1}>
        {item.group}
      </Text>
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop inline search (expanded field + dropdown)                  */
/* ------------------------------------------------------------------ */

function DesktopSearch({
  tintColor,
  textColor,
  mutedColor,
  cardColor,
  borderColor,
  bgColor,
}: {
  tintColor: string;
  textColor: string;
  mutedColor: string;
  cardColor: string;
  borderColor: string;
  bgColor: string;
}) {
  const router = useRouter();
  const items = useSearchIndex();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const results = useMemo(() => searchItems(items, query), [items, query]);
  const showDropdown = focused && query.length > 0;

  const handleSelect = useCallback(
    (item: SearchItem) => {
      setQuery("");
      setFocused(false);
      inputRef.current?.blur();
      router.push(item.route as any);
    },
    [router],
  );

  return (
    <View style={s.desktopContainer}>
      <View
        style={[
          s.desktopInputWrap,
          {
            borderColor: focused ? tintColor : borderColor,
            backgroundColor: bgColor,
          },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={16}
          color={mutedColor}
          style={{ marginRight: 6 }}
        />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Pesquisar telas..."
          placeholderTextColor={mutedColor}
          style={[s.desktopInput, { color: textColor }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={16} color={mutedColor} />
          </Pressable>
        )}
      </View>

      {showDropdown && (
        <View
          style={[
            s.desktopDropdown,
            {
              backgroundColor: cardColor,
              borderColor,
              ...(Platform.OS === "web"
                ? { boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }
                : {}),
            },
          ]}
        >
          {results.length === 0 ? (
            <View style={s.noResults}>
              <Text style={{ color: mutedColor, fontSize: 13 }}>
                {`Nenhum resultado para \u201C${query}\u201D`}
              </Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <ResultRow
                  item={item}
                  onPress={() => handleSelect(item)}
                  tintColor={tintColor}
                  textColor={textColor}
                  mutedColor={mutedColor}
                  cardColor={cardColor}
                />
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile search (icon → full-screen modal)                           */
/* ------------------------------------------------------------------ */

function MobileSearch({
  tintColor,
  textColor,
  mutedColor,
  cardColor,
  borderColor,
  bgColor,
}: {
  tintColor: string;
  textColor: string;
  mutedColor: string;
  cardColor: string;
  borderColor: string;
  bgColor: string;
}) {
  const router = useRouter();
  const items = useSearchIndex();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);

  const results = useMemo(() => searchItems(items, query), [items, query]);

  const handleSelect = useCallback(
    (item: SearchItem) => {
      setOpen(false);
      setQuery("");
      Keyboard.dismiss();
      router.push(item.route as any);
    },
    [router],
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          justifyContent: "center",
          alignItems: "center",
        }}
        accessibilityRole="button"
        accessibilityLabel="Pesquisar"
      >
        <Ionicons name="search-outline" size={22} color={textColor} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        transparent={false}
      >
        <View style={[s.mobileModal, { backgroundColor: bgColor }]}>
          {/* Search bar */}
          <View
            style={[
              s.mobileHeader,
              { backgroundColor: cardColor, borderBottomColor: borderColor },
            ]}
          >
            <Pressable
              onPress={() => {
                setOpen(false);
                setQuery("");
              }}
              style={s.mobileBack}
            >
              <Ionicons name="arrow-back" size={22} color={textColor} />
            </Pressable>
            <View
              style={[
                s.mobileInputWrap,
                { borderColor: tintColor, backgroundColor: bgColor },
              ]}
            >
              <Ionicons
                name="search-outline"
                size={16}
                color={mutedColor}
                style={{ marginRight: 6 }}
              />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Pesquisar telas e funcionalidades..."
                placeholderTextColor={mutedColor}
                style={[s.mobileInput, { color: textColor }]}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="search"
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery("")}>
                  <Ionicons name="close-circle" size={16} color={mutedColor} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Results */}
          {query.length === 0 ? (
            <View style={s.mobileHint}>
              <Ionicons name="search" size={48} color={`${mutedColor}40`} />
              <Text style={[s.mobileHintText, { color: mutedColor }]}>
                Pesquise por telas, funcionalidades{"\n"}ou configurações
              </Text>
            </View>
          ) : results.length === 0 ? (
            <View style={s.mobileHint}>
              <Text style={{ color: mutedColor, fontSize: 14 }}>
                {`Nenhum resultado para \u201C${query}\u201D`}
              </Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <ResultRow
                  item={item}
                  onPress={() => handleSelect(item)}
                  tintColor={tintColor}
                  textColor={textColor}
                  mutedColor={mutedColor}
                  cardColor={cardColor}
                />
              )}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export: auto-picks desktop or mobile variant                  */
/* ------------------------------------------------------------------ */

export function GlobalSearch() {
  const isWide = useIsWide();
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardColor = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const bgColor = useThemeColor({}, "background");

  const colors = {
    tintColor,
    textColor,
    mutedColor,
    cardColor,
    borderColor,
    bgColor,
  };

  if (isWide) {
    return <DesktopSearch {...colors} />;
  }
  return <MobileSearch {...colors} />;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  /* --- Result row (shared) --- */
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  resultText: {
    flex: 1,
    gap: 1,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  resultDesc: {
    fontSize: 11,
  },
  resultGroup: {
    fontSize: 10,
    fontWeight: "500",
    maxWidth: 90,
    textAlign: "right",
  },
  noResults: {
    padding: 20,
    alignItems: "center",
  },

  /* --- Desktop --- */
  desktopContainer: {
    position: "relative",
    zIndex: 999,
  },
  desktopInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    width: 260,
  },
  desktopInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  } as any,
  desktopDropdown: {
    position: "absolute",
    top: 42,
    left: 0,
    right: 0,
    width: 360,
    borderWidth: 1,
    borderRadius: 10,
    zIndex: 9999,
    overflow: "hidden",
    ...(Platform.OS !== "web"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
          elevation: 8,
        }
      : {}),
  },

  /* --- Mobile --- */
  mobileModal: {
    flex: 1,
  },
  mobileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 6,
  },
  mobileBack: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  mobileInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  mobileInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  } as any,
  mobileHint: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 60,
  },
  mobileHintText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
});
