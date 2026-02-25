export type AsaasBillingType = "PIX" | "BOLETO" | "CREDIT_CARD";

export type AsaasCustomerInput = {
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

export type AsaasChargeInput = {
  billingType: AsaasBillingType;
  value: number;
  dueDate?: string;
  description?: string;
  externalReference?: string;
  installments?: number;
  customerId: string;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email?: string | null;
    cpfCnpj?: string | null;
    postalCode?: string | null;
    addressNumber?: string | null;
    address?: string | null;
    province?: string | null;
    phone?: string | null;
  };
};

export type AsaasChargeResponse = {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
};

export type AsaasPixQrResponse = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
};

export type AsaasTransferInput = {
  value: number;
  description?: string;
  pixAddressKey?: string;
  pixAddressKeyType?: string;
  externalReference?: string;
};

export type AsaasTransferResponse = {
  id: string;
  status: string;
};

export type AsaasPaymentStatusResponse = {
  id: string;
  status: string;
  value?: number;
  confirmedDate?: string;
};

export type AsaasClientEnv = {
  ASAAS_API_KEY: string;
  ASAAS_API_URL?: string;
};

const toJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const buildHeaders = (env: AsaasClientEnv) => ({
  "Content-Type": "application/json",
  access_token: env.ASAAS_API_KEY,
  "User-Agent": "RadulPlatform/1.0",
});

async function asaasFetch(
  env: AsaasClientEnv,
  path: string,
  init?: RequestInit,
): Promise<any> {
  const base =
    env.ASAAS_API_URL?.replace(/\/$/, "") ?? "https://www.asaas.com/api/v3";
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(env),
      ...(init?.headers ?? {}),
    },
  });

  const data = await toJson(response);
  if (!response.ok) {
    const message =
      data?.errors?.[0]?.description ?? data?.message ?? "Asaas request failed";
    const error = new Error(message);
    (error as any).status = response.status;
    (error as any).payload = data;
    throw error;
  }

  return data;
}

export async function findCustomer(env: AsaasClientEnv, query: string) {
  const params = new URLSearchParams(query ? { cpfCnpj: query } : undefined);
  const data = await asaasFetch(env, `/customers?${params.toString()}`);
  return Array.isArray(data?.data) ? data.data[0] : null;
}

export async function findCustomerByEmail(env: AsaasClientEnv, email: string) {
  const params = new URLSearchParams(email ? { email } : undefined);
  const data = await asaasFetch(env, `/customers?${params.toString()}`);
  return Array.isArray(data?.data) ? data.data[0] : null;
}

export async function createCustomer(
  env: AsaasClientEnv,
  input: AsaasCustomerInput,
): Promise<{ id: string }> {
  const payload = {
    name: input.name,
    email: input.email ?? undefined,
    cpfCnpj: input.cpfCnpj ?? undefined,
    phone: input.phone ?? undefined,
    address: input.address ?? undefined,
    addressNumber: input.addressNumber ?? undefined,
    complement: input.complement ?? undefined,
    province: input.province ?? undefined,
    postalCode: input.postalCode ?? undefined,
    city: input.city ?? undefined,
    state: input.state ?? undefined,
  };

  return asaasFetch(env, "/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOrCreateCustomer(
  env: AsaasClientEnv,
  input: AsaasCustomerInput,
): Promise<string> {
  if (input.id) return input.id;

  const cpfCnpj = input.cpfCnpj?.trim();
  if (cpfCnpj) {
    const existing = await findCustomer(env, cpfCnpj);
    if (existing?.id) return existing.id;
  }

  const email = input.email?.trim();
  if (email) {
    const existing = await findCustomerByEmail(env, email);
    if (existing?.id) return existing.id;
  }

  const created = await createCustomer(env, input);
  return created.id;
}

export async function createCharge(
  env: AsaasClientEnv,
  input: AsaasChargeInput,
): Promise<AsaasChargeResponse> {
  const payload = {
    customer: input.customerId,
    billingType: input.billingType,
    value: input.value,
    dueDate: input.dueDate ?? undefined,
    description: input.description ?? undefined,
    externalReference: input.externalReference ?? undefined,
    installments: input.installments ?? undefined,
    creditCard: input.creditCard ?? undefined,
    creditCardHolderInfo: input.creditCardHolderInfo ?? undefined,
  };

  return asaasFetch(env, "/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPixQrCode(
  env: AsaasClientEnv,
  paymentId: string,
): Promise<AsaasPixQrResponse> {
  return asaasFetch(env, `/payments/${paymentId}/pixQrCode`);
}

export async function createTransfer(
  env: AsaasClientEnv,
  input: AsaasTransferInput,
): Promise<AsaasTransferResponse> {
  const payload = {
    value: input.value,
    description: input.description ?? undefined,
    pixAddressKey: input.pixAddressKey ?? undefined,
    pixAddressKeyType: input.pixAddressKeyType ?? undefined,
    externalReference: input.externalReference ?? undefined,
  };

  return asaasFetch(env, "/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPaymentStatus(
  env: AsaasClientEnv,
  paymentId: string,
): Promise<AsaasPaymentStatusResponse> {
  return asaasFetch(env, `/payments/${paymentId}`);
}
