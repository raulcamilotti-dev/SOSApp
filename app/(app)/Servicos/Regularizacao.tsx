import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { ScrollView, StyleSheet, View } from "react-native";

export default function RegularizacaoScreen() {
  const backgroundColor = useThemeColor({}, "background");
  const accentColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  return (
    <ScrollView style={[styles.container, { backgroundColor }]}>
      <ThemedView style={[styles.header, { borderBottomColor: borderColor }]}>
        <ThemedText type="title" style={styles.mainTitle}>
          Regularização de Imóveis
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Resolva Documentações com Segurança e Rapidez
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.content}>
        <ThemedText style={styles.sectionText}>
          A regularização de imóveis é um passo essencial para garantir que a
          sua propriedade esteja dentro da lei, pronta para ser vendida,
          transferida, financiada ou herdada sem complicações. Infelizmente,
          muitas pessoas vivem anos com pendências legais em seus imóveis sem
          saber por onde começar ou com medo da burocracia.
        </ThemedText>

        <ThemedText style={styles.sectionText}>
          Neste conteúdo, vamos explicar em detalhes o que é regularizar um
          imóvel, por que isso é importante, quais são os casos mais comuns e
          como você pode resolver isso de forma segura, com o suporte de quem
          entende do assunto.
        </ThemedText>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          O que é a regularização de imóveis?
        </ThemedText>
        <ThemedText style={styles.sectionText}>
          Regularizar um imóvel significa colocar toda a documentação da
          propriedade em conformidade com as leis brasileiras. Isso inclui
          registro em cartório, escritura pública, averbações, atualização de
          metragem e até a correção de dados cadastrais.
        </ThemedText>
        <ThemedText style={styles.sectionText}>
          Sem esse processo, o imóvel fica &quot;irregular&quot;, o que impede a
          venda, dificulta o financiamento, bloqueia a transferência para
          herdeiros e até pode gerar multas ou problemas judiciais.
        </ThemedText>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Por que regularizar seu imóvel?
        </ThemedText>
        <ThemedText style={styles.sectionText}>
          Imóveis irregulares representam riscos jurídicos, financeiros e
          patrimoniais. Além de impedir que o imóvel seja vendido ou financiado,
          a falta de documentação pode causar transtornos em heranças, doações,
          separações e outros momentos importantes da vida.
        </ThemedText>

        <ThemedText
          style={[
            styles.sectionText,
            { fontWeight: "600", color: accentColor },
          ]}
        >
          Vantagens da regularização:
        </ThemedText>
        <View style={styles.bulletList}>
          {[
            "Evita disputas judiciais e problemas com heranças",
            "Permite venda, financiamento ou doação do bem",
            "Valoriza o imóvel no mercado",
            "Traz segurança jurídica para você e sua família",
          ].map((item, idx) => (
            <View key={idx} style={styles.bulletItem}>
              <ThemedText style={styles.bullet}>•</ThemedText>
              <ThemedText style={styles.bulletText}>{item}</ThemedText>
            </View>
          ))}
        </View>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Documentações e situações mais comuns que exigem regularização
        </ThemedText>
        <View style={styles.bulletList}>
          {[
            "Imóvel sem escritura pública",
            "Contrato de compra e venda sem registro",
            "Imóvel em nome de terceiros (ex: contrato de gaveta)",
            "Área construída não averbada",
            "Imóvel sem matrícula ou com registro desatualizado",
            "Desmembramento ou unificação de lotes não oficializados",
            "Imóveis rurais sem georreferenciamento ou CCIR atualizado",
          ].map((item, idx) => (
            <View key={idx} style={styles.bulletItem}>
              <ThemedText style={styles.bullet}>•</ThemedText>
              <ThemedText style={styles.bulletText}>{item}</ThemedText>
            </View>
          ))}
        </View>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Como funciona o processo de regularização imobiliária?
        </ThemedText>
        <View style={styles.bulletList}>
          {[
            "Análise documental: avaliação da situação do imóvel",
            "Levantamento técnico: quando necessário (planta, topografia etc.)",
            "Elaboração de documentos jurídicos e técnicos",
            "Trâmites em cartório e órgãos públicos (como prefeitura e registro de imóveis)",
            "Acompanhamento e finalização com a documentação regularizada",
          ].map((item, idx) => (
            <View key={idx} style={styles.bulletItem}>
              <ThemedText style={styles.bullet}>•</ThemedText>
              <ThemedText style={styles.bulletText}>{item}</ThemedText>
            </View>
          ))}
        </View>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Quem pode fazer a regularização?
        </ThemedText>
        <ThemedText style={styles.sectionText}>
          Qualquer pessoa que possua ou utilize um imóvel pode dar entrada no
          processo. Isso inclui compradores com contrato de gaveta, herdeiros,
          cônjuges, doadores, investidores ou mesmo pessoas que receberam o
          imóvel por cessão ou uso.
        </ThemedText>
        <ThemedText style={styles.sectionText}>
          Em muitos casos, é possível regularizar mesmo sem escritura, desde que
          haja provas de posse, pagamento ou vínculo com o imóvel.
        </ThemedText>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Por que contar com especialistas?
        </ThemedText>
        <ThemedText style={styles.sectionText}>
          A regularização de imóveis envolve uma série de etapas jurídicas,
          técnicas e burocráticas. Um erro pode gerar atrasos, multas ou até a
          perda de direitos sobre o bem. Por isso, contar com uma empresa
          especializada garante mais agilidade, segurança e economia.
        </ThemedText>
        <ThemedText style={[styles.sectionText, { marginBottom: 24 }]}>
          Aqui na S.O.S. Escritura, temos mais de 30 anos de experiência em
          regularização urbana e rural, com equipe técnica e jurídica preparada
          para resolver até os casos mais complexos.
        </ThemedText>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontStyle: "italic",
    opacity: 0.8,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletList: {
    marginLeft: 8,
    marginBottom: 12,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 10,
  },
  bullet: {
    fontSize: 16,
    marginRight: 8,
    marginTop: -2,
  },
  bulletText: {
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
});
