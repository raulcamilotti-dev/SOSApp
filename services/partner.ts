import { N8N_API_KEY } from "@/services/api";

const ASAAS_WORKER_URL = process.env.EXPO_PUBLIC_ASAAS_WORKER_URL ?? "";

const ASAAS_API_KEY = process.env.EXPO_PUBLIC_ASAAS_WORKER_KEY ?? N8N_API_KEY;

type AsaasChargeRequest = {
  amount_cents: number;
  method: "pix" | "boleto" | "credit_card";
  description?: string;
  due_date?: string;
  installments?: number;
  external_reference?: string;
  card_data?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  customer: {
    id?: string;
    name: string;
    email?: string | null;
    cpfCnpj?: string | null;
    phone?: string | null;
    address?: string | null;
    addressNumber?: string | null;
    complement?: string | null;
    province?: string | null;
    postalCode?: string | null;
    city?: string | null;
    state?: string | null;
  };
};

type AsaasChargeResponse = {
  transactionId: string;
  status: "pending" | "approved" | "failed" | "processing";
  boletoBarcode?: string;
  boletoPdfUrl?: string;
  pixQrCodeBase64?: string;
  pixCopyPaste?: string;
  pixExpiresAt?: string;
  raw?: unknown;
};

type AsaasPixOutRequest = {
  amount_cents: number;
  pix_key: string;
  pix_key_type?: string;
  description?: string;
  external_reference?: string;
};

type AsaasPixOutResponse = {
  transferId: string;
  status: string;
  raw?: unknown;
};

type AsaasStatusRequest = {
  transaction_id: string;
};

type AsaasStatusResponse = {
  transactionId: string;
  status: "pending" | "approved" | "failed" | "processing";
  amount?: number | null;
  raw?: unknown;
};

async function postPartner<T>(path: string, body: unknown): Promise<T> {
  if (!ASAAS_WORKER_URL) {
    throw new Error("Asaas worker URL nao configurada");
  }

  const response = await fetch(`${ASAAS_WORKER_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": ASAAS_API_KEY ?? "",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.error ?? "Falha ao chamar parceiro";
    throw new Error(message);
  }

  return data as T;
}

export async function asaasCreateCharge(
  payload: AsaasChargeRequest,
): Promise<AsaasChargeResponse> {
  return postPartner<AsaasChargeResponse>("/asaas/charge", payload);
}

export async function asaasPixOut(
  payload: AsaasPixOutRequest,
): Promise<AsaasPixOutResponse> {
  return postPartner<AsaasPixOutResponse>("/asaas/pix-out", payload);
}

export async function asaasGetStatus(
  payload: AsaasStatusRequest,
): Promise<AsaasStatusResponse> {
  return postPartner<AsaasStatusResponse>("/asaas/status", payload);
}
