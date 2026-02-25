import { asaasCreateCharge, asaasGetStatus } from "@/services/partner";
import {
    type CreatePaymentRequest,
    type CreatePaymentResponse,
    type IPaymentGateway,
    type PaymentGatewayProvider,
    type PaymentStatus,
    type WebhookEvent,
} from "@/services/payment-gateway";

const PROVIDER: PaymentGatewayProvider = "asaas";

export class AsaasGateway implements IPaymentGateway {
  readonly provider = PROVIDER;

  async createPayment(
    request: CreatePaymentRequest,
  ): Promise<CreatePaymentResponse> {
    const customer = request.customer;
    const amountCents = request.amount;

    const payload = {
      amount_cents: amountCents,
      method: request.method,
      description: request.description,
      due_date: request.metadata?.due_date
        ? String(request.metadata.due_date)
        : undefined,
      installments: request.installments,
      external_reference: request.metadata?.external_reference
        ? String(request.metadata.external_reference)
        : undefined,
      card_data: request.cardData
        ? {
            holderName: request.cardData.holderName,
            number: request.cardData.number,
            expiryMonth: request.cardData.expirationMonth,
            expiryYear: request.cardData.expirationYear,
            ccv: request.cardData.cvv,
          }
        : undefined,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        cpfCnpj: customer.documentNumber,
        phone: customer.phone,
        address: customer.address?.street,
        addressNumber: customer.address?.number,
        complement: customer.address?.complement,
        province: customer.address?.neighborhood,
        postalCode: customer.address?.zipCode,
        city: customer.address?.city,
        state: customer.address?.state,
      },
    };

    const response = await asaasCreateCharge(payload);

    return {
      paymentId: response.transactionId,
      transactionId: response.transactionId,
      status: response.status,
      pixQrCode: response.pixQrCodeBase64,
      pixCopyPaste: response.pixCopyPaste,
      boletoBarcode: response.boletoBarcode,
      boletoPdfUrl: response.boletoPdfUrl,
      expiresAt: response.pixExpiresAt
        ? new Date(response.pixExpiresAt)
        : undefined,
      gatewayResponse: response.raw ?? response,
    };
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentStatus> {
    const response = await asaasGetStatus({ transaction_id: transactionId });

    return {
      paymentId: response.transactionId,
      transactionId: response.transactionId,
      status: response.status,
      amount: response.amount ?? 0,
      paidAt: response.status === "approved" ? new Date() : undefined,
      gatewayResponse: response.raw ?? response,
    };
  }

  async processWebhook(_event: WebhookEvent): Promise<void> {
    throw new Error("Webhook processado no worker Asaas");
  }

  async cancelPayment(_transactionId: string): Promise<void> {
    throw new Error("Cancelamento via Asaas ainda nao implementado");
  }
}
