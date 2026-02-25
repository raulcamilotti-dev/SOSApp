/**
 * MOCK PAYMENT GATEWAY — For development and testing
 *
 * Implements IPaymentGateway interface with simulated responses.
 * No real API calls, no credentials needed.
 *
 * Features:
 * - Simulates approval/rejection based on card number patterns
 * - Generates fake transaction IDs, QR codes, barcodes
 * - Simulates processing delays (optional)
 * - Webhook event simulation
 *
 * Usage:
 *   const gateway = new MockGateway({ autoApprove: true });
 *   const result = await gateway.createPayment(request);
 */

import type {
    CreatePaymentRequest,
    CreatePaymentResponse,
    IPaymentGateway,
    PaymentGatewayProvider,
    PaymentStatus,
    WebhookEvent,
} from "../payment-gateway";

export interface MockGatewayConfig {
  /** Auto-approve all payments (default: true) */
  autoApprove?: boolean;
  /** Simulate processing delay in milliseconds (default: 0) */
  processingDelay?: number;
  /** Failure rate 0-1 for random rejections (default: 0) */
  failureRate?: number;
}

/**
 * Mock payment gateway for testing without real API.
 */
export class MockGateway implements IPaymentGateway {
  readonly provider: PaymentGatewayProvider = "mock";
  private config: Required<MockGatewayConfig>;

  constructor(config?: MockGatewayConfig) {
    this.config = {
      autoApprove: config?.autoApprove ?? true,
      processingDelay: config?.processingDelay ?? 0,
      failureRate: config?.failureRate ?? 0,
    };
  }

  /**
   * Create a mock payment with simulated gateway response.
   *
   * Card number patterns:
   * - Ending in 0000: Rejected (insufficient funds)
   * - Ending in 1111: Rejected (invalid card)
   * - Ending in 9999: Pending (requires manual review)
   * - Other: Approved (if autoApprove=true)
   */
  async createPayment(
    request: CreatePaymentRequest,
  ): Promise<CreatePaymentResponse> {
    // Simulate network delay
    if (this.config.processingDelay > 0) {
      await this.delay(this.config.processingDelay);
    }

    const transactionId = this.generateTransactionId();
    const paymentId = this.generateUUID();

    // Determine payment status based on method and card patterns
    let status: PaymentStatus["status"] = "approved";
    let rejectionReason: string | undefined;

    if (request.method === "credit_card" || request.method === "debit_card") {
      if (!request.cardData) {
        status = "rejected";
        rejectionReason = "Card data required for card payments";
      } else {
        const lastFourDigits = request.cardData.number.slice(-4);

        // Random failure simulation
        if (
          this.config.failureRate > 0 &&
          Math.random() < this.config.failureRate
        ) {
          status = "rejected";
          rejectionReason = "Random failure simulation";
        }
        // Pattern-based failure
        else if (lastFourDigits === "0000") {
          status = "rejected";
          rejectionReason = "Insufficient funds";
        } else if (lastFourDigits === "1111") {
          status = "rejected";
          rejectionReason = "Invalid card";
        } else if (lastFourDigits === "9999") {
          status = "pending";
        } else if (!this.config.autoApprove) {
          status = "pending";
        }
      }
    } else if (request.method === "pix") {
      // PIX always starts as pending (requires user to scan QR)
      status = "pending";
    } else if (request.method === "boleto") {
      // Boleto always starts as pending (requires user to pay)
      status = "pending";
    }

    // Build response based on payment method
    const response: CreatePaymentResponse = {
      paymentId,
      transactionId,
      status,
      gatewayResponse: {
        provider: "mock",
        success: status === "approved",
        transactionId,
        timestamp: new Date().toISOString(),
        simulationMode: true,
        config: this.config,
      },
    };

    // Add method-specific data
    if (request.method === "pix") {
      response.pixQrCode = this.generateMockPixQrCode(request.amount);
      response.pixCopyPaste = this.generateMockPixCopyPaste(request.amount);
      response.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
    } else if (request.method === "boleto") {
      response.boletoBarcode = this.generateMockBoletoBarcode(request.amount);
      response.boletoPdfUrl = `https://mock-gateway.example.com/boleto/${transactionId}.pdf`;
      response.expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
    } else if (
      request.method === "credit_card" ||
      request.method === "debit_card"
    ) {
      // For card payments, add checkout URL (simulates 3DS or redirect flow)
      if (status === "pending") {
        response.checkoutUrl = `https://mock-gateway.example.com/checkout/${transactionId}`;
        response.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
      }

      // Add rejection reason to gateway response
      if (status === "rejected" && rejectionReason) {
        (response.gatewayResponse as any).error = {
          code: "payment_rejected",
          message: rejectionReason,
        };
      }
    }

    return response;
  }

  /**
   * Get payment status (simulates query to gateway).
   */
  async getPaymentStatus(transactionId: string): Promise<PaymentStatus> {
    // Simulate network delay
    if (this.config.processingDelay > 0) {
      await this.delay(this.config.processingDelay);
    }

    // In mock mode, we can't actually query real status
    // Return a simplified response
    return {
      paymentId: this.generateUUID(),
      transactionId,
      status: "approved", // Mock always returns approved for queries
      amount: 0, // Unknown in mock mode
      paidAt: new Date(),
      gatewayResponse: {
        provider: "mock",
        success: true,
        transactionId,
        timestamp: new Date().toISOString(),
        simulationMode: true,
      },
    };
  }

  /**
   * Process webhook event (validates and returns parsed data).
   */
  async processWebhook(event: WebhookEvent): Promise<void> {
    // Mock gateway webhook validation (always succeeds)
    if (!event.transactionId) {
      throw new Error("Invalid webhook event: missing transactionId");
    }

    // In a real implementation, this would:
    // 1. Validate webhook signature
    // 2. Parse event type
    // 3. Update payment status in database
    // 4. Trigger side effects (send email, update order, etc.)

    console.log("[MockGateway] Webhook processed:", event);
  }

  /**
   * Cancel/refund a payment.
   */
  async cancelPayment(transactionId: string): Promise<void> {
    // Simulate network delay
    if (this.config.processingDelay > 0) {
      await this.delay(this.config.processingDelay);
    }

    // Mock always succeeds
    console.log("[MockGateway] Payment cancelled:", transactionId);
  }

  /* ═══════════════════════════════════════════════════════
   * MOCK DATA GENERATORS
   * ═══════════════════════════════════════════════════════ */

  /**
   * Generate fake UUID v4.
   */
  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Generate fake transaction ID (looks like real gateway IDs).
   */
  private generateTransactionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `MOCK_${timestamp}_${random}`.toUpperCase();
  }

  /**
   * Generate mock PIX QR code (base64 image).
   *
   * In production, this would be a real QR code image.
   * For mock, we return a data URI placeholder.
   */
  private generateMockPixQrCode(amountInCents: number): string {
    // Simple placeholder QR code (1x1 transparent PNG in base64)
    const mockQrCodeBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    return `data:image/png;base64,${mockQrCodeBase64}`;
  }

  /**
   * Generate mock PIX copy-paste code.
   *
   * Real PIX codes follow EMV QR Code standard.
   * For mock, we generate a fake code with amount embedded.
   */
  private generateMockPixCopyPaste(amountInCents: number): string {
    const amountBRL = (amountInCents / 100).toFixed(2);
    const randomKey = Math.random().toString(36).substring(2, 15);
    return `00020126360014BR.GOV.BCB.PIX0114+5511999999999520400005303986540${amountBRL.length}${amountBRL}5802BR5913MOCK GATEWAY6009SAO PAULO62070503***63${randomKey.substring(0, 4).toUpperCase()}`;
  }

  /**
   * Generate mock boleto barcode.
   *
   * Real boletos have 47-digit barcodes following FEBRABAN standard.
   * For mock, we generate a valid-looking number.
   */
  private generateMockBoletoBarcode(amountInCents: number): string {
    const bankCode = "001"; // Banco do Brasil (example)
    const currency = "9"; // Real
    const amountBRL = String(amountInCents).padStart(10, "0");
    const dueDate = this.calculateBoletoDateFactor();
    const randomField = String(Math.floor(Math.random() * 1e15)).padStart(
      15,
      "0",
    );

    // Simplified barcode structure (not fully spec-compliant)
    const barcode = `${bankCode}${currency}${dueDate}${amountBRL}${randomField}`;
    return barcode.substring(0, 47);
  }

  /**
   * Calculate boleto date factor (days since 07/10/1997).
   */
  private calculateBoletoDateFactor(): string {
    const baseDate = new Date("1997-10-07");
    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
    const diffDays = Math.floor(
      (dueDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    return String(diffDays).padStart(4, "0");
  }

  /**
   * Simulate async delay (for network latency simulation).
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ═══════════════════════════════════════════════════════
   * TEST HELPERS
   * ═══════════════════════════════════════════════════════ */

  /**
   * Simulate a webhook callback (for testing).
   *
   * Usage in tests:
   *   const gateway = new MockGateway();
   *   const payment = await gateway.createPayment(request);
   *   await gateway.simulateWebhookCallback(payment.transactionId, 'approved');
   */
  async simulateWebhookCallback(
    transactionId: string,
    status: "approved" | "rejected" | "cancelled",
  ): Promise<WebhookEvent> {
    const event: WebhookEvent = {
      provider: "mock",
      eventType: `payment.${status}`,
      transactionId,
      status,
      payload: {
        transactionId,
        status,
        paidAt: status === "approved" ? new Date().toISOString() : undefined,
        simulationMode: true,
      },
    };

    await this.processWebhook(event);
    return event;
  }
}

/**
 * Convenience function to create a mock gateway instance.
 */
export function createMockGateway(config?: MockGatewayConfig): IPaymentGateway {
  return new MockGateway(config);
}
