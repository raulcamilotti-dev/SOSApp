import {
    type CreatePaymentRequest,
    type CreatePaymentResponse,
    type IPaymentGateway,
    type PaymentGatewayProvider,
    type PaymentStatus,
    type WebhookEvent,
} from "@/services/payment-gateway";

const PROVIDER: PaymentGatewayProvider = "mercadopago";

export class MercadoPagoGateway implements IPaymentGateway {
  readonly provider = PROVIDER;

  async createPayment(
    _request: CreatePaymentRequest,
  ): Promise<CreatePaymentResponse> {
    throw new Error("MercadoPago gateway nao implementado");
  }

  async getPaymentStatus(_transactionId: string): Promise<PaymentStatus> {
    throw new Error("MercadoPago gateway nao implementado");
  }

  async processWebhook(_event: WebhookEvent): Promise<void> {
    throw new Error("MercadoPago gateway nao implementado");
  }

  async cancelPayment(_transactionId: string): Promise<void> {
    throw new Error("MercadoPago gateway nao implementado");
  }
}
