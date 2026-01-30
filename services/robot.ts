const N8N_WEBHOOK_URL =
  "https://n8n.sosescritura.com.br/webhook/2cf66772-377e-4617-8d3a-faf145f56ffd";

export async function sendToRobot(payload: {
  message: string;
  sessionId: string;
  user_id: string;
  channel: string;
  channel_identifier: string;
}) {
  const res = await fetch(N8N_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("Erro ao falar com o robô");
  }

  const data = await res.json();

  const item = Array.isArray(data) ? data[0] : data;
  return (
    item?.reply ||
    item?.message ||
    item?.output ||
    "Não consegui processar sua solicitação."
  );
}