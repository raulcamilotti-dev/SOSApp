/**
 * PAYMENT GATEWAY ABSTRACTION
 *
 * Generic interface for payment processing.
 * Supports multiple gateways (MercadoPago, Stripe, PagSeguro, Mock).
 * Supports credit card, PIX, boleto, and other payment methods.
 *
 * Usage contexts:
 * 1. Marketplace - customer buys products/services
 * 2. Plan Subscription - tenant subscribes to Radul plans
 * 3. Process Charge - ad-hoc charges within service orders
 */

import { api, getApiErrorMessage } from "@/services/api";
import { buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";

/* ═══════════════════════════════════════════════════════
 * TYPES & INTERFACES
 * ═══════════════════════════════════════════════════════ */

/** Supported payment gateways */
export type PaymentGatewayProvider =
  | "asaas"
  | "mercadopago"
  | "stripe"
  | "pagseguro"
  | "mock";

/** Payment methods */
export type PaymentMethod =
  | "credit_card"
  | "debit_card"
  | "pix"
  | "boleto"
  | "bank_transfer";

/** Payment context (where payment originates) */
export type PaymentContext =
  | "marketplace"
  | "plan_subscription"
  | "process_charge"
  | "manual_invoice";

/** Card data for credit/debit transactions */
export interface CardData {
  /** Card number (16 digits) */
  number: string;
  /** Cardholder name */
  holderName: string;
  /** Expiration month (MM) */
  expirationMonth: string;
  /** Expiration year (YY or YYYY) */
  expirationYear: string;
  /** CVV/CVC code */
  cvv: string;
  /** CPF/CNPJ of cardholder */
  documentNumber?: string;
}

/** Customer data for payment */
export interface PaymentCustomer {
  id?: string;
  name: string;
  email: string;
  documentNumber: string; // CPF or CNPJ
  phone?: string;
  address?: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
}

/** Split payment recipient */
export interface SplitRecipient {
  /** radul, tenant, or partner */
  recipientType: "radul" | "tenant" | "partner";
  /** recipient UUID (null for radul) */
  recipientId: string | null;
  /** Amount in cents (R$ 100,00 = 10000) */
  amount: number;
  /** Percentage of total (for reference) */
  percentage?: number;
}

/** Payment creation request */
export interface CreatePaymentRequest {
  /** Amount in cents (R$ 100,00 = 10000) */
  amount: number;
  /** Payment method */
  method: PaymentMethod;
  /** Customer data */
  customer: PaymentCustomer;
  /** Card data (required for credit/debit) */
  cardData?: CardData;
  /** Number of installments (1-12, only for credit_card) */
  installments?: number;
  /** Payment description */
  description: string;
  /** Context: marketplace, plan_subscription, process_charge */
  context: PaymentContext;
  /** Reference ID (service_id, subscription_id, service_order_id) */
  contextReferenceId: string;
  /** Tenant ID (null for Radul platform payments) */
  tenantId?: string | null;
  /** Split configuration (optional, auto-calculated if not provided) */
  splits?: SplitRecipient[];
  /** Metadata for payment record */
  metadata?: Record<string, unknown>;
}

/** Payment creation response */
export interface CreatePaymentResponse {
  /** Internal payment ID */
  paymentId: string;
  /** Gateway transaction ID */
  transactionId: string;
  /** Payment status */
  status: "pending" | "processing" | "approved" | "rejected" | "cancelled";
  /** Checkout URL (for redirect methods like PIX/boleto) */
  checkoutUrl?: string;
  /** PIX QR code (base64 or URL) */
  pixQrCode?: string;
  /** PIX copy-paste code (BRCode) */
  pixCopyPaste?: string;
  /** Boleto barcode */
  boletoBarcode?: string;
  /** Boleto PDF URL */
  boletoPdfUrl?: string;
  /** Expiration timestamp for checkout */
  expiresAt?: Date;
  /** Full gateway response (for debugging) */
  gatewayResponse: unknown;
}

/** Payment status query */
export interface PaymentStatus {
  paymentId: string;
  transactionId: string;
  status: "pending" | "processing" | "approved" | "rejected" | "cancelled";
  amount: number;
  paidAt?: Date;
  gatewayResponse: unknown;
}

/** Webhook event from gateway */
export interface WebhookEvent {
  /** Gateway provider that sent the event */
  provider: PaymentGatewayProvider;
  /** Event type (payment.approved, payment.rejected, etc.) */
  eventType: string;
  /** Gateway transaction ID */
  transactionId: string;
  /** Payment status */
  status: string;
  /** Full webhook payload */
  payload: unknown;
}

/* ═══════════════════════════════════════════════════════
 * GATEWAY INTERFACE
 * ═══════════════════════════════════════════════════════ */

/** Generic payment gateway interface */
export interface IPaymentGateway {
  /** Gateway provider identifier */
  readonly provider: PaymentGatewayProvider;

  /** Create a new payment */
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse>;

  /** Check payment status */
  getPaymentStatus(transactionId: string): Promise<PaymentStatus>;

  /** Process webhook event */
  processWebhook(event: WebhookEvent): Promise<void>;

  /** Cancel/refund a payment */
  cancelPayment(transactionId: string): Promise<void>;
}

/* ═══════════════════════════════════════════════════════
 * GATEWAY FACTORY
 * ═══════════════════════════════════════════════════════ */

/** Get gateway instance based on provider */
export async function getPaymentGateway(
  provider?: PaymentGatewayProvider,
): Promise<IPaymentGateway> {
  // Default to mock in development, mercadopago in production
  const gatewayProvider = provider ?? (__DEV__ ? "mock" : "asaas");

  switch (gatewayProvider) {
    case "mock":
      const { MockGateway } = await import("./gateways/mock");
      return new MockGateway();
    case "asaas":
      const { AsaasGateway } = await import("./gateways/asaas-gateway");
      return new AsaasGateway();
    case "mercadopago":
      const { MercadoPagoGateway } =
        await import("./gateways/mercadopago-gateway");
      return new MercadoPagoGateway();
    case "stripe":
      throw new Error("Stripe gateway not yet implemented");
    case "pagseguro":
      throw new Error("PagSeguro gateway not yet implemented");
    default:
      throw new Error(`Unknown payment gateway: ${gatewayProvider}`);
  }
}

/* ═══════════════════════════════════════════════════════
 * DATABASE HELPERS
 * ═══════════════════════════════════════════════════════ */

/** Save payment to database */
export async function savePaymentToDatabase(
  payment: CreatePaymentResponse,
  request: CreatePaymentRequest,
  provider: PaymentGatewayProvider,
): Promise<string> {
  try {
    const payload = {
      tenant_id: request.tenantId,
      customer_id: request.customer.id,
      amount: request.amount / 100,
      amount_cents: request.amount,
      method: request.method,
      payment_method: request.method,
      payment_id: payment.paymentId,
      transaction_id: payment.transactionId,
      status: payment.status,
      gateway_provider: provider,
      gateway_transaction_id: payment.transactionId,
      gateway_response: payment.gatewayResponse,
      gateway_metadata: {
        card_brand: request.cardData ? "unknown" : undefined,
        installments: request.installments ?? 1,
        description: request.description,
      },
      payment_context: request.context,
      context_reference_id: request.contextReferenceId,
      installments: request.installments ?? 1,
      paid_at: payment.status === "approved" ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const response = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "payments",
      payload,
    });

    const created = Array.isArray(response.data)
      ? response.data[0]
      : response.data;
    return created?.id ?? payment.paymentId;
  } catch (error) {
    console.error("Failed to save payment to database:", error);
    throw new Error(`Database error: ${getApiErrorMessage(error)}`);
  }
}

/** Update payment status in database */
export async function updatePaymentStatus(
  paymentId: string,
  status: string,
  gatewayResponse?: unknown,
): Promise<void> {
  try {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: "payments",
      payload: {
        id: paymentId,
        status,
        gateway_response: gatewayResponse,
        paid_at:
          status === "approved" || status === "completed"
            ? new Date().toISOString()
            : null,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to update payment status:", error);
    throw new Error(`Database error: ${getApiErrorMessage(error)}`);
  }
}

/** Get payment by transaction ID */
export async function getPaymentByTransactionId(
  transactionId: string,
): Promise<any | null> {
  try {
    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "payments",
      ...buildSearchParams([{ field: "transaction_id", value: transactionId }]),
    });

    const list = Array.isArray(response.data) ? response.data : [];
    if (list[0]) return list[0];

    const fallback = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "payments",
      ...buildSearchParams([
        { field: "gateway_transaction_id", value: transactionId },
      ]),
    });

    const fallbackList = Array.isArray(fallback.data) ? fallback.data : [];
    return fallbackList[0] ?? null;
  } catch (error) {
    console.error("Failed to get payment:", error);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
 * UTILITY FUNCTIONS
 * ═══════════════════════════════════════════════════════ */

/** Format amount to cents (BRL to cents) */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Format cents to BRL */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Format amount as BRL currency string */
export function formatBRL(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

/** Validate card number (Luhn algorithm) */
export function validateCardNumber(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/** Validate CVV */
export function validateCVV(cvv: string): boolean {
  return /^\d{3,4}$/.test(cvv);
}

/** Validate expiration date */
export function validateExpiration(month: string, year: string): boolean {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  if (m < 1 || m > 12) return false;

  const fullYear = y < 100 ? 2000 + y : y;
  const expirationDate = new Date(fullYear, m - 1);
  const today = new Date();

  return expirationDate > today;
}

/** Get card brand from number */
export function getCardBrand(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, "");

  if (/^4/.test(digits)) return "visa";
  if (/^5[1-5]/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6(?:011|5)/.test(digits)) return "discover";
  if (/^35/.test(digits)) return "jcb";
  if (/^36|38/.test(digits)) return "diners";
  if (/^60/.test(digits)) return "hipercard";
  if (/^50/.test(digits)) return "elo";

  return "unknown";
}
