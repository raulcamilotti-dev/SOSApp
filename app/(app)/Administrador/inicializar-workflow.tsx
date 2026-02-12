/**
 * INICIALIZAR TEMPLATE DE WORKFLOW PADRÃO
 *
 * Script para criar o template de workflow padrão de regularização
 * Executar uma única vez por tenant
 */

import Colors from "@/app/theme/colors";
import { spacing, typography } from "@/app/theme/styles";
import { useAuth } from "@/core/auth/AuthContext";
import { ensureDefaultWorkflow } from "@/services/default-workflow";
import { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function InitializeWorkflowScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const handleInitialize = async () => {
    try {
      setLoading(true);
      const tenantId = user?.tenant_id;

      if (!tenantId) {
        Alert.alert("Erro", "Tenant não encontrado. Faça login novamente.");
        return;
      }

      const id = await ensureDefaultWorkflow(tenantId);
      setTemplateId(id);

      Alert.alert(
        "Sucesso",
        "Template de workflow padrão criado com 14 etapas!\n\n" +
          "1. Qualificação do cliente\n" +
          "2. Contato (WhatsApp / Email)\n" +
          "3. Indicação do cliente\n" +
          "4. Resumo simplificado dos fatos\n" +
          "5. Questionário\n" +
          "6. Obter procuração assinada\n" +
          "7. Obter contrato assinado\n" +
          "8. Documentos entregues\n" +
          "9. Documentos faltantes\n" +
          "10. Protocolo + data\n" +
          "11. Andamento / status\n" +
          "12. Decisão\n" +
          "13. Recurso\n" +
          "14. Registro entregue",
      );
    } catch (error: any) {
      Alert.alert(
        "Erro",
        error.message || "Falha ao criar template de workflow",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>⚙️</Text>
        <Text style={styles.title}>Inicializar Template de Workflow</Text>
        <Text style={styles.description}>
          Cria o template de workflow de regularização de imóveis com 14 etapas
          macro, incluindo:
        </Text>

        <View style={styles.features}>
          <Text style={styles.feature}>✓ 14 etapas do processo completo</Text>
          <Text style={styles.feature}>✓ Transições lineares e especiais</Text>
          <Text style={styles.feature}>
            ✓ 8 templates de tarefas automáticas
          </Text>
          <Text style={styles.feature}>✓ Regras de prazo por etapa</Text>
          <Text style={styles.feature}>✓ Cores personalizadas por etapa</Text>
        </View>

        {templateId && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              ✅ Template de workflow já existe!{"\n"}ID: {templateId}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleInitialize}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading
              ? "Criando..."
              : templateId
                ? "Recriar Template"
                : "Criar Template"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          ⚠️ Este processo é seguro e pode ser executado múltiplas vezes.{"\n"}
          Se o template já existir, retorna o ID existente.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    padding: spacing.lg,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    maxWidth: 500,
    alignSelf: "center",
  },
  icon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    fontSize: 24,
    color: Colors.light.text,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  description: {
    ...typography.body,
    color: Colors.light.muted,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  features: {
    width: "100%",
    backgroundColor: Colors.light.card,
    padding: spacing.lg,
    borderRadius: 8,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  feature: {
    ...typography.body,
    color: Colors.light.text,
    marginBottom: spacing.sm,
  },
  successBox: {
    backgroundColor: "#dcfce7",
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  successText: {
    ...typography.body,
    color: "#166534",
    textAlign: "center",
  },
  button: {
    backgroundColor: Colors.light.tint,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
    marginBottom: spacing.lg,
    minWidth: 200,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.body,
    fontWeight: "600",
    color: "white",
    textAlign: "center",
  },
  note: {
    ...typography.caption,
    color: Colors.light.muted,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 18,
  },
});
