import {
    createCharge,
    createTransfer,
    getOrCreateCustomer,
    getPaymentStatus,
    getPixQrCode,
    type AsaasBillingType,
    type AsaasClientEnv,
    type AsaasCustomerInput,
} from "./asaas-client";

export type Env = {
  ASAAS_API_KEY: string;
  ASAAS_API_URL?: string;
  API_KEY: string;
  API_CRUD_URL?: string;
  API_CRUD_KEY?: string;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Api-Key, X-Request-Id",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(status: number, body: unknown): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  };
  return new Response(JSON.stringify(body), { status, headers });
}

function corsOptionsResponse(): Response {
  return new Response(null, {
    status: 200,
    headers: CORS_HEADERS,
  });
}

function errorResponse(
  status: number,
  message: string,
  details?: unknown,
): Response {
  return corsResponse(status, { error: message, details });
}

function normalizeAsaasError(error: unknown): {
  status: number;
  message: string;
  details?: unknown;
} {
  const err = error as any;
  const status = typeof err?.status === "number" ? err.status : 500;
  const message = String(err?.message ?? "Falha na requisicao ao Asaas");
  const details = err?.payload ?? err?.details ?? null;
  return { status, message, details };
}

function authenticate(request: Request, env: Env): boolean {
  const apiKey = request.headers.get("X-Api-Key");
  return Boolean(apiKey && apiKey === env.API_KEY);
}

function normalizeBillingType(method: string): AsaasBillingType {
  switch (method) {
    case "pix":
      return "PIX";
    case "boleto":
      return "BOLETO";
    case "credit_card":
      return "CREDIT_CARD";
    default:
      throw new Error(`Metodo nao suportado: ${method}`);
  }
}

function mapStatus(
  status: string,
): "pending" | "approved" | "failed" | "processing" {
  const normalized = status.toUpperCase();
  if (["RECEIVED", "CONFIRMED"].includes(normalized)) return "approved";
  if (["PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"].includes(normalized)) {
    return "pending";
  }
  if (["CANCELLED", "REFUNDED", "CHARGEBACK"].includes(normalized))
    return "failed";
  return "processing";
}

async function handleCharge(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const amountCents = Number(body.amount_cents ?? body.amountCents ?? 0);
  const method = String(body.method ?? "").toLowerCase();
  if (!amountCents || !method) {
    return errorResponse(400, "amount_cents e method sao obrigatorios");
  }

  const customer = body.customer as AsaasCustomerInput | undefined;
  if (!customer?.name) {
    return errorResponse(400, "customer.name e obrigatorio");
  }

  const asaasEnv: AsaasClientEnv = {
    ASAAS_API_KEY: env.ASAAS_API_KEY,
    ASAAS_API_URL: env.ASAAS_API_URL,
  };

  try {
    const customerId = await getOrCreateCustomer(asaasEnv, customer);

    const billingType = normalizeBillingType(method);
    const value = amountCents / 100;

    const dueDate = body.due_date ? String(body.due_date) : undefined;
    const description = body.description ? String(body.description) : undefined;
    const externalReference = body.external_reference
      ? String(body.external_reference)
      : undefined;
    const installments = body.installments
      ? Number(body.installments)
      : undefined;

    const cardData = body.card_data as Record<string, string> | undefined;
    const charge = await createCharge(asaasEnv, {
      billingType,
      value,
      dueDate,
      description,
      externalReference,
      installments,
      customerId,
      creditCard:
        billingType === "CREDIT_CARD" && cardData
          ? {
              holderName: cardData.holderName,
              number: cardData.number,
              expiryMonth: cardData.expiryMonth,
              expiryYear: cardData.expiryYear,
              ccv: cardData.ccv,
            }
          : undefined,
      creditCardHolderInfo:
        billingType === "CREDIT_CARD"
          ? {
              name: customer.name,
              email: customer.email ?? undefined,
              cpfCnpj: customer.cpfCnpj ?? undefined,
              postalCode: customer.postalCode ?? undefined,
              addressNumber: customer.addressNumber ?? undefined,
              address: customer.address ?? undefined,
              province: customer.province ?? undefined,
              phone: customer.phone ?? undefined,
            }
          : undefined,
    });

    let pixQr: {
      encodedImage?: string;
      payload?: string;
      expirationDate?: string;
    } | null = null;
    if (billingType === "PIX" && charge?.id) {
      pixQr = await getPixQrCode(asaasEnv, charge.id);
    }

    return corsResponse(200, {
      transactionId: charge.id,
      status: mapStatus(charge.status ?? "PENDING"),
      boletoBarcode: (charge as any).barcode ?? undefined,
      boletoPdfUrl: charge.bankSlipUrl ?? charge.invoiceUrl ?? undefined,
      pixQrCodeBase64: pixQr?.encodedImage ?? undefined,
      pixCopyPaste: pixQr?.payload ?? undefined,
      pixExpiresAt: pixQr?.expirationDate ?? undefined,
      raw: charge,
    });
  } catch (error) {
    const normalized = normalizeAsaasError(error);
    return errorResponse(
      normalized.status,
      normalized.message,
      normalized.details,
    );
  }
}

async function handlePixOut(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const amountCents = Number(body.amount_cents ?? body.amountCents ?? 0);
  const pixKey = body.pix_key ? String(body.pix_key) : "";
  if (!amountCents || !pixKey) {
    return errorResponse(400, "amount_cents e pix_key sao obrigatorios");
  }

  const asaasEnv: AsaasClientEnv = {
    ASAAS_API_KEY: env.ASAAS_API_KEY,
    ASAAS_API_URL: env.ASAAS_API_URL,
  };

  try {
    const transfer = await createTransfer(asaasEnv, {
      value: amountCents / 100,
      description: body.description ? String(body.description) : undefined,
      pixAddressKey: pixKey,
      pixAddressKeyType: body.pix_key_type
        ? String(body.pix_key_type)
        : undefined,
      externalReference: body.external_reference
        ? String(body.external_reference)
        : undefined,
    });

    return corsResponse(200, {
      transferId: transfer.id,
      status: transfer.status,
      raw: transfer,
    });
  } catch (error) {
    const normalized = normalizeAsaasError(error);
    return errorResponse(
      normalized.status,
      normalized.message,
      normalized.details,
    );
  }
}

async function handleStatus(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const transactionId = body.transaction_id ? String(body.transaction_id) : "";
  if (!transactionId) {
    return errorResponse(400, "transaction_id e obrigatorio");
  }

  const asaasEnv: AsaasClientEnv = {
    ASAAS_API_KEY: env.ASAAS_API_KEY,
    ASAAS_API_URL: env.ASAAS_API_URL,
  };

  try {
    const status = await getPaymentStatus(asaasEnv, transactionId);

    return corsResponse(200, {
      transactionId: status.id,
      status: mapStatus(status.status ?? "PENDING"),
      amount: status.value ?? null,
      raw: status,
    });
  } catch (error) {
    const normalized = normalizeAsaasError(error);
    return errorResponse(
      normalized.status,
      normalized.message,
      normalized.details,
    );
  }
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const payload = (await request.json().catch(() => ({}))) as Record<
      string,
      any
    >;
    const event = payload?.event ? String(payload.event) : "unknown";
    const payment = payload?.payment ?? payload?.data ?? payload;
    const transactionId = payment?.id ? String(payment.id) : null;
    const status = payment?.status ? String(payment.status) : "PENDING";

    console.log(
      `[webhook] event=${event} transactionId=${transactionId} status=${status}`,
    );

    if (!env.API_CRUD_KEY || !env.API_CRUD_URL) {
      console.log(
        "[webhook] API_CRUD_KEY or API_CRUD_URL not configured, skipping",
      );
      return corsResponse(200, {
        ok: true,
        skipped: true,
        reason: "no_crud_config",
      });
    }

    if (!transactionId) {
      console.log("[webhook] No transactionId found in payload, skipping");
      return corsResponse(200, {
        ok: true,
        skipped: true,
        reason: "no_transaction_id",
      });
    }

    const mappedStatus = mapStatus(status);

    const listResponse = await fetch(`${env.API_CRUD_URL}/api_crud`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": env.API_CRUD_KEY,
      },
      body: JSON.stringify({
        action: "list",
        table: "payments",
        search_field1: "transaction_id",
        search_value1: transactionId,
        search_operator1: "equal",
      }),
    });

    const listText = await listResponse.text();

    let listData: any[] = [];
    try {
      const parsed = listText ? JSON.parse(listText) : [];
      listData = Array.isArray(parsed) ? parsed : [];
    } catch (parseErr) {
      console.error(
        `[webhook] Failed to parse list response: ${String(parseErr)}. Raw: ${listText?.slice(0, 500)}`,
      );
      return corsResponse(200, {
        ok: true,
        updated: false,
        reason: "crud_list_parse_error",
      });
    }

    const paymentRow = listData[0] ?? null;
    if (!paymentRow?.id) {
      console.log(
        `[webhook] No payment row found for transaction_id=${transactionId}`,
      );
      return corsResponse(200, { ok: true, updated: false });
    }

    const updateResponse = await fetch(`${env.API_CRUD_URL}/api_crud`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": env.API_CRUD_KEY,
      },
      body: JSON.stringify({
        action: "update",
        table: "payments",
        payload: {
          id: paymentRow.id,
          status: mappedStatus,
          updated_at: new Date().toISOString(),
        },
      }),
    });

    const data = await updateResponse.text();

    console.log(
      `[webhook] Updated payment ${paymentRow.id} to status=${mappedStatus} ok=${updateResponse.ok}`,
    );

    return corsResponse(200, {
      ok: true,
      updated: updateResponse.ok,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] Unhandled error: ${message}`);
    // Always return 200 to Asaas to avoid webhook penalties
    return corsResponse(200, {
      ok: false,
      error: message,
    });
  }
}

async function handleHealth(): Promise<Response> {
  return corsResponse(200, {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return corsOptionsResponse();
    }

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/asaas/webhook") {
      return handleWebhook(request, env);
    }

    if (!authenticate(request, env)) {
      return errorResponse(401, "Unauthorized");
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return handleHealth();
    }

    if (request.method === "POST" && url.pathname === "/asaas/charge") {
      return handleCharge(request, env);
    }

    if (request.method === "POST" && url.pathname === "/asaas/pix-out") {
      return handlePixOut(request, env);
    }

    if (request.method === "POST" && url.pathname === "/asaas/status") {
      return handleStatus(request, env);
    }

    return errorResponse(404, "Not Found");
  },
};
