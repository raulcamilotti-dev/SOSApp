export const AI_AGENT_ENDPOINT =
  "https://n8n.sosescritura.com.br/webhook/ai_agent";

export const UNIVERSAL_AI_INSIGHT_PROMPT =
  "Você é um analista operacional. Gere insights objetivos e acionáveis para o contexto atual das informções relevantes da tela, ignorando as pesquisas ou informções do banco ou de Ids, pense como um assessor que está lendo a tela e ajudando o cliente. Responda em português do Brasil com tópicos curtos, sem inventar dados e usando somente o contexto fornecido com aproximadamente 100 caracteres.";

export const buildAiInsightMessage = (
  contextPayload: unknown,
  extraInstruction?: string,
) => {
  const sections = [UNIVERSAL_AI_INSIGHT_PROMPT];
  if (extraInstruction?.trim()) {
    sections.push(extraInstruction.trim());
  }
  sections.push("", "Contexto da tela (JSON):", JSON.stringify(contextPayload));
  return sections.join("\n");
};

export const extractAiInsightText = (raw: unknown): string => {
  const payload = Array.isArray(raw) ? raw[0] : raw;
  if (!payload) return "";

  if (typeof payload === "string") return payload.trim();

  if (typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    const direct =
      row.insight ??
      row.insights ??
      row.analysis ??
      row.reply ??
      row.message ??
      row.output ??
      row.result ??
      row.text;

    if (typeof direct === "string" && direct.trim()) return direct.trim();

    if (direct && typeof direct === "object") {
      const nested = direct as Record<string, unknown>;
      const nestedText =
        nested.text ??
        nested.message ??
        nested.reply ??
        nested.analysis ??
        nested.insight;
      if (typeof nestedText === "string" && nestedText.trim()) {
        return nestedText.trim();
      }
    }

    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }

  return String(payload ?? "").trim();
};
