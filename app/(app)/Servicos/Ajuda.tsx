import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface FaqItem {
  question: string;
  answer: string;
}

interface FeatureSection {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  steps?: string[];
  route?: string;
}

/* ─── Content data ───────────────────────────────────────────────────── */

const FEATURES: FeatureSection[] = [
  {
    id: "processo",
    icon: "document-text-outline",
    title: "Acompanhamento de Processos",
    description:
      "Acompanhe em tempo real as atualizações publicadas pela equipe da SOS Escritura sobre cada processo de regularização.",
    steps: [
      "Abra o processo desejado na lista",
      "Veja todas as atualizações ordenadas por data",
      "Cada atualização pode conter arquivos, documentos e informações",
      'Se houver um documento solicitado, use o botão "Enviar" para anexar',
      "O status de cada documento é atualizado automaticamente",
    ],
  },
  {
    id: "documentos",
    icon: "cloud-upload-outline",
    title: "Envio de Documentos",
    description:
      "Quando a equipe solicitar algum documento, você recebe a notificação e pode enviar diretamente pelo app, sem precisar ir até o escritório.",
    steps: [
      'Na tela do processo, localize a seção "Documentos solicitados"',
      'Toque em "Enviar" ao lado do documento necessário',
      "Selecione o arquivo (PDF ou imagem) do seu celular ou computador",
      "Após o envio, o status muda automaticamente para enviado",
      "Você pode reenviar o documento caso necessário",
    ],
  },
  {
    id: "assinaturas",
    icon: "create-outline",
    title: "Assinaturas Digitais",
    description:
      "Assine documentos digitalmente sem sair de casa. A SOS Escritura utiliza assinatura digital com validade jurídica para agilizar seus processos.",
    steps: [
      'Acesse "Minhas Assinaturas" no menu de serviços',
      "Veja os documentos pendentes de assinatura",
      "Toque no documento para visualizá-lo",
      "Assine digitalmente com um toque — rápido e seguro",
      "Acompanhe o status de cada assinatura (pendente, enviada, assinada)",
    ],
    route: "/Servicos/MinhasAssinaturas",
  },
  {
    id: "agendamento",
    icon: "calendar-outline",
    title: "Serviços e Agendamento",
    description:
      "Encontre serviços disponíveis, profissionais qualificados e agende atendimentos diretamente pelo app em 3 passos simples.",
    steps: [
      'Acesse "Serviços e Agendamento" no menu',
      "Passo 1: Escolha o tipo de serviço que precisa",
      "Passo 2: Selecione o profissional e escolha um horário disponível na agenda dele",
      "Passo 3: Revise os detalhes, adicione observações e confirme o agendamento",
      'Acompanhe seus agendamentos em "Meus Serviços"',
    ],
    route: "/Servicos/SolicitarServico",
  },
  {
    id: "meus_servicos",
    icon: "briefcase-outline",
    title: "Meus Serviços",
    description:
      "Veja o histórico de todos os serviços solicitados, reagende com horários disponíveis, crie novos agendamentos e avalie o atendimento.",
    steps: [
      'Acesse "Meus Serviços" no menu',
      "Visualize serviços pendentes, em andamento e concluídos",
      "Reagende com facilidade: veja os horários livres do profissional e escolha um novo",
      "Após concluir um encontro, agende outro com o mesmo profissional se necessário",
      "Avalie os profissionais após a conclusão do atendimento",
    ],
    route: "/Servicos/MeusServicos",
  },
  {
    id: "empresas",
    icon: "business-outline",
    title: "Minhas Empresas",
    description:
      "Se você possui imóveis vinculados a uma empresa (CNPJ), gerencie os dados empresariais e membros associados diretamente pelo app.",
    steps: [
      'Acesse "Minhas Empresas" no menu de serviços',
      "Cadastre sua empresa informando o CNPJ",
      "O sistema busca automaticamente os dados da empresa",
      "Vincule membros e gerencie permissões",
    ],
    route: "/Servicos/MinhasEmpresas",
  },
  {
    id: "notificacoes",
    icon: "notifications-outline",
    title: "Notificações",
    description:
      "Receba alertas sobre atualizações nos seus processos, documentos solicitados, agendamentos e outras comunicações importantes. Nunca perca uma novidade.",
    steps: [
      "As notificações aparecem no ícone de sino no topo da tela",
      "Toque no sino para ver todas as notificações",
      "Notificações não lidas ficam destacadas",
      "Toque em uma notificação para ir direto ao que precisa de atenção",
    ],
  },
  {
    id: "agenda",
    icon: "calendar-outline",
    title: "Minha Agenda",
    description:
      "Visualize todos os seus agendamentos, tarefas e prazos em uma única tela. Sincronize com Google Calendar, Outlook ou Apple Calendar para nunca perder um compromisso.",
    steps: [
      'Acesse "Minha Agenda" no menu de serviços',
      "Veja seus próximos compromissos organizados por dia",
      'Toque em "Sincronizar" para conectar ao seu calendário externo',
      "Gere o link de sincronização e escolha o seu provedor (Google, Outlook, Apple)",
      "Seus agendamentos serão atualizados automaticamente no calendário externo",
    ],
    route: "/Servicos/MinhaAgenda",
  },
  {
    id: "atendimento",
    icon: "chatbubbles-outline",
    title: "Atendimento / Chat",
    description:
      "Fale diretamente com a equipe da SOS Escritura pelo chat integrado. Tire dúvidas, envie informações e receba orientações em tempo real.",
    steps: [
      "O chat fica disponível na área de atendimento",
      "Envie mensagens de texto para a equipe",
      "Receba respostas diretamente no app",
      "Todo o histórico da conversa fica salvo",
    ],
  },
];

const FAQ: FaqItem[] = [
  {
    question: "Preciso ir até o escritório para enviar documentos?",
    answer:
      "Não! Você pode enviar todos os documentos diretamente pelo app. Basta acessar o processo do seu imóvel e usar o botão de envio na seção de documentos solicitados.",
  },
  {
    question: "Como sei se meu documento foi recebido?",
    answer:
      "Após o envio, o status do documento muda automaticamente na tela do processo. Além disso, você receberá uma notificação confirmando o recebimento.",
  },
  {
    question: "A assinatura digital tem validade jurídica?",
    answer:
      "Sim! Utilizamos plataformas de assinatura digital com validade jurídica, conforme a legislação brasileira (MP 2.200-2).",
  },
  {
    question: "Posso usar o app pelo computador?",
    answer:
      "Sim! O SOS Escritura funciona tanto no celular (Android e iOS) quanto pelo navegador do computador, mantendo todas as funcionalidades.",
  },
  {
    question: "Como faço para cadastrar meu imóvel?",
    answer:
      "O cadastro do imóvel é feito pela equipe da SOS Escritura no início do processo de regularização. Assim que cadastrado, o imóvel aparece automaticamente na sua conta.",
  },
  {
    question: "Posso acompanhar mais de um imóvel ao mesmo tempo?",
    answer:
      "Sim! Todos os seus imóveis ficam listados na tela de Imóveis, e cada um possui seu próprio histórico de atualizações e documentos.",
  },
  {
    question: "O que fazer se o envio de documento falhar?",
    answer:
      'Se houver algum problema no envio, tente novamente usando o botão "Enviar novamente". Caso persista, entre em contato com a equipe pelo chat.',
  },
  {
    question: "Como entro em contato com a equipe SOS Escritura?",
    answer:
      "Você pode usar o chat integrado no app, enviar um e-mail para contato@sosescrituras.com.br ou ligar para nosso telefone de atendimento.",
  },
  {
    question: "Como funciona o reagendamento?",
    answer:
      "Ao tocar em Reagendar, o app mostra automaticamente os horários livres do profissional nos próximos dias. Basta escolher o horário desejado e confirmar.",
  },
  {
    question: "Posso agendar mais de um encontro dentro do mesmo processo?",
    answer:
      "Sim! Após a conclusão ou cancelamento de um agendamento, o botão 'Novo Agendamento' permite marcar outro encontro com o mesmo profissional, sem limite de vezes.",
  },
];

const CONTACT_OPTIONS = [
  {
    icon: "mail-outline" as keyof typeof Ionicons.glyphMap,
    label: "E-mail",
    value: "contato@sosescrituras.com.br",
    action: () => Linking.openURL("mailto:contato@sosescrituras.com.br"),
  },
  {
    icon: "logo-whatsapp" as keyof typeof Ionicons.glyphMap,
    label: "WhatsApp",
    value: "(41) 99999-9999",
    action: () => Linking.openURL("https://wa.me/5541999999999"),
  },
  {
    icon: "globe-outline" as keyof typeof Ionicons.glyphMap,
    label: "Site",
    value: "www.sosescrituras.com.br",
    action: () => Linking.openURL("https://www.sosescrituras.com.br"),
  },
];

/* ─── Components ─────────────────────────────────────────────────────── */

function ExpandableCard({
  item,
  tintColor,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
  onNavigate,
}: {
  item: FeatureSection;
  tintColor: string;
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  onNavigate?: (route: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(!expanded)}
      style={[
        styles.featureCard,
        {
          backgroundColor: cardBg,
          borderColor: expanded ? tintColor + "60" : borderColor,
        },
      ]}
    >
      <View style={styles.featureHeader}>
        <View
          style={[styles.iconCircle, { backgroundColor: tintColor + "18" }]}
        >
          <Ionicons name={item.icon} size={22} color={tintColor} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.featureTitle, { color: textColor }]}>
            {item.title}
          </ThemedText>
          <ThemedText
            style={[styles.featureDesc, { color: mutedColor }]}
            numberOfLines={expanded ? undefined : 2}
          >
            {item.description}
          </ThemedText>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={mutedColor}
        />
      </View>

      {expanded && item.steps && (
        <View style={[styles.stepsContainer, { borderTopColor: borderColor }]}>
          <ThemedText
            style={[styles.stepsLabel, { color: tintColor, fontWeight: "700" }]}
          >
            Como usar:
          </ThemedText>
          {item.steps.map((step, idx) => (
            <View key={idx} style={styles.stepRow}>
              <View style={[styles.stepBadge, { backgroundColor: tintColor }]}>
                <ThemedText style={styles.stepBadgeText}>{idx + 1}</ThemedText>
              </View>
              <ThemedText style={[styles.stepText, { color: textColor }]}>
                {step}
              </ThemedText>
            </View>
          ))}
          {item.route && onNavigate && (
            <TouchableOpacity
              onPress={() => onNavigate(item.route!)}
              style={[styles.goButton, { backgroundColor: tintColor }]}
            >
              <ThemedText style={styles.goButtonText}>
                Ir para {item.title}
              </ThemedText>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function FaqCard({
  item,
  tintColor,
  cardBg,
  borderColor,
  textColor,
  mutedColor,
}: {
  item: FaqItem;
  tintColor: string;
  cardBg: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(!expanded)}
      style={[
        styles.faqCard,
        {
          backgroundColor: cardBg,
          borderColor: expanded ? tintColor + "60" : borderColor,
        },
      ]}
    >
      <View style={styles.faqHeader}>
        <Ionicons
          name="help-circle"
          size={20}
          color={tintColor}
          style={{ marginRight: 10 }}
        />
        <ThemedText style={[styles.faqQuestion, { color: textColor, flex: 1 }]}>
          {item.question}
        </ThemedText>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={mutedColor}
        />
      </View>
      {expanded && (
        <ThemedText style={[styles.faqAnswer, { color: mutedColor }]}>
          {item.answer}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}

/* ─── Main Screen ────────────────────────────────────────────────────── */

export default function AjudaScreen() {
  const router = useRouter();
  const backgroundColor = useThemeColor({}, "background");
  const tintColor = useThemeColor({}, "tint");
  const cardBg = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");

  const [activeTab, setActiveTab] = useState<
    "funcionalidades" | "faq" | "contato"
  >("funcionalidades");

  const handleNavigate = (route: string) => {
    router.push(route as any);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: tintColor + "12" }]}>
        <View
          style={[styles.heroIconCircle, { backgroundColor: tintColor + "20" }]}
        >
          <Ionicons name="help-buoy-outline" size={40} color={tintColor} />
        </View>
        <ThemedText style={[styles.heroTitle, { color: textColor }]}>
          Suporte & Ajuda
        </ThemedText>
        <ThemedText style={[styles.heroSubtitle, { color: mutedColor }]}>
          Aprenda a usar todas as funcionalidades do SOS Escritura e tire suas
          dúvidas
        </ThemedText>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(
          [
            {
              key: "funcionalidades",
              label: "Funcionalidades",
              icon: "apps-outline",
            },
            {
              key: "faq",
              label: "Perguntas Frequentes",
              icon: "chatbox-ellipses-outline",
            },
            {
              key: "contato",
              label: "Contato",
              icon: "call-outline",
            },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[
              styles.tab,
              {
                backgroundColor: activeTab === tab.key ? tintColor : cardBg,
                borderColor: activeTab === tab.key ? tintColor : borderColor,
              },
            ]}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.key ? "#fff" : mutedColor}
            />
            <ThemedText
              style={[
                styles.tabLabel,
                {
                  color: activeTab === tab.key ? "#fff" : mutedColor,
                },
              ]}
            >
              {tab.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === "funcionalidades" && (
          <>
            <ThemedText style={[styles.sectionTitle, { color: textColor }]}>
              Conheça as Funcionalidades
            </ThemedText>
            <ThemedText style={[styles.sectionSubtitle, { color: mutedColor }]}>
              Toque em cada item para ver o passo a passo de como usar
            </ThemedText>
            {FEATURES.map((feature) => (
              <ExpandableCard
                key={feature.id}
                item={feature}
                tintColor={tintColor}
                cardBg={cardBg}
                borderColor={borderColor}
                textColor={textColor}
                mutedColor={mutedColor}
                onNavigate={handleNavigate}
              />
            ))}
          </>
        )}

        {activeTab === "faq" && (
          <>
            <ThemedText style={[styles.sectionTitle, { color: textColor }]}>
              Perguntas Frequentes
            </ThemedText>
            <ThemedText style={[styles.sectionSubtitle, { color: mutedColor }]}>
              Respostas rápidas para as dúvidas mais comuns
            </ThemedText>
            {FAQ.map((faq, idx) => (
              <FaqCard
                key={idx}
                item={faq}
                tintColor={tintColor}
                cardBg={cardBg}
                borderColor={borderColor}
                textColor={textColor}
                mutedColor={mutedColor}
              />
            ))}
          </>
        )}

        {activeTab === "contato" && (
          <>
            <ThemedText style={[styles.sectionTitle, { color: textColor }]}>
              Fale Conosco
            </ThemedText>
            <ThemedText style={[styles.sectionSubtitle, { color: mutedColor }]}>
              Estamos aqui para ajudar. Escolha o canal que preferir:
            </ThemedText>

            {CONTACT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.label}
                onPress={option.action}
                style={[
                  styles.contactCard,
                  { backgroundColor: cardBg, borderColor },
                ]}
              >
                <View
                  style={[
                    styles.contactIconCircle,
                    { backgroundColor: tintColor + "18" },
                  ]}
                >
                  <Ionicons name={option.icon} size={24} color={tintColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText
                    style={[styles.contactLabel, { color: textColor }]}
                  >
                    {option.label}
                  </ThemedText>
                  <ThemedText
                    style={[styles.contactValue, { color: tintColor }]}
                  >
                    {option.value}
                  </ThemedText>
                </View>
                <Ionicons name="open-outline" size={18} color={mutedColor} />
              </TouchableOpacity>
            ))}

            <View
              style={[
                styles.tipCard,
                {
                  backgroundColor: tintColor + "10",
                  borderColor: tintColor + "30",
                },
              ]}
            >
              <Ionicons
                name="information-circle"
                size={22}
                color={tintColor}
                style={{ marginRight: 10 }}
              />
              <ThemedText style={[styles.tipText, { color: textColor }]}>
                Nosso horário de atendimento é de segunda a sexta, das 9h às
                18h. Mensagens fora desse horário serão respondidas no próximo
                dia útil.
              </ThemedText>
            </View>
          </>
        )}
      </View>

      {/* Footer spacing */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 8,
  },
  heroIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 340,
  },

  /* Tabs */
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
  },

  /* Content */
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },

  /* Feature cards */
  featureCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      },
    }),
  },
  featureHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    lineHeight: 18,
  },

  /* Steps */
  stepsContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  stepsLabel: {
    fontSize: 13,
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  goButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  goButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  /* FAQ */
  faqCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  faqQuestion: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  faqAnswer: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    paddingLeft: 30,
  },

  /* Contact */
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  contactIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  contactLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});
