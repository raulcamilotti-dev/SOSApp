# Payment Gateway Implementation Progress

## ✅ Completed

### 1. **Core Services** (`services/payment-*.ts`)

- `payment-gateway.ts` — Main interface + types
  - CardData, CreatePaymentRequest, PaymentResponse
  - Gateway interface + registry pattern
  - Mock gateway implementation
  - Support: credit card, PIX, boleto
- `payment-splits.ts` — Commission calculation
  - autoCalculateSplits() by context
  - Tenant/partner commission routing
  - Multi-recipient payments
- `payment-metadata.ts` — Context storage
  - Flexible key-value metadata
  - Type hints for validation
  - Query builders

### 2. **UI Components** (`components/checkout/`)

- `CheckoutForm.tsx` — Production-ready component
  - Credit card with Luhn validation
  - Card brand detection (Visa, Mastercard, Amex)
  - Expiration + CVV validation
  - Installment selector (1-12x)
  - PIX generation + copy-paste
  - Boleto barcode generation
  - Status banner + error handling
  - Theme-aware (light/dark mode)
  - Mobile + web responsive

### 3. **Database Schema** (`migrations/add-payment-gateway.sql`)

- `payments` table
  - 50 columns covering all payment flows
  - Soft delete support
  - Payment lifecycle (pending → approved → refunded)
  - Split tracking (denormalized JSONB)
  - Metadata extensibility
- `payment_split_logs` table
  - Commission tracking per split
  - Payout scheduling/completion
  - Recipient tracking
- `payment_metadata` table
  - Key-value context storage
  - Type hints
  - Full audit trail
- Triggers + Functions
  - auto-update timestamps
  - soft_delete_payment()
  - calculate_payment_splits()

---

## 🔜 Recommended Next Steps

### Phase 1: MVP Gateway (1-2 days)

- [ ] **Implement MercadoPago gateway** (`mercadopago.gateway.ts`)
  - createPayment() using Mercado Pago API
  - createPaymentWithSplits() for commissions
  - Webhook handler for payment confirmation
  - Error handling + retries
- [ ] **Implement PIX gateway** (`pix.gateway.ts`)
  - Mock + Real integration (Bacen API)
  - QR code generation
  - Expiration handling (30 min)
  - Manual verification
- [ ] **Implement Boleto gateway** (`boleto.gateway.ts`)
  - Boleteiro library wrapper
  - PDF generation
  - Barcode generation
  - Due date validation

### Phase 2: Integration Rails (1-2 days)

- [ ] **Invoice payment** (`app/(app)/Pagamento/invoice-payment.tsx`)
  - Trigger CheckoutForm from invoice detail
  - Auto-create payment record on success
  - Update invoice status → "paid"
  - Send payment confirmation email
- [ ] **Quote approval + payment** (`app/(app)/Vendas/quote-checkout.tsx`)
  - Link from quote portal (`/q/:token`)
  - Convert quote → invoice on payment
  - Create service_order on completion
  - Send completion notification
- [ ] **SaaS plan subscription** (`app/(app)/Administrador/billing-checkout.tsx`)
  - Tenant upgrade flow
  - Recurring payment setup
  - Seat/limit update on confirmation
  - Invoice generation for accounting

### Phase 3: Webhook Handlers (1 day)

- [ ] **Webhook Router** (`n8n/webhook-payment.ts`)
  - MercadoPago: payment.updated, payment.failed, refund.created
  - PIX: qr_code_expires, payment_confirmed
  - Manual: admin confirmation endpoint
- [ ] **Payment Confirmation Handler** (`services/payment-confirmation.ts`)
  - Mark payment as approved
  - Trigger split processing
  - Create ledger entries
  - Send notifications (email, WhatsApp)
  - Update associated records (invoice, quote, subscription)

### Phase 4: Admin Dashboard (1 day)

- [ ] **Payment Analytics** (`app/(app)/Administrador/pagamentos-dashboard.tsx`)
  - Revenue by period (daily, monthly)
  - Payment method breakdown (pie chart)
  - Split summary (partner commissions vs platform)
  - Failed payment alerts
  - Pending PIX expiration warnings
- [ ] **Payment Management** (`app/(app)/Administrador/pagamentos-list.tsx`)
  - CrudScreen of all payments
  - Filter by status, method, date range
  - Refund action button
  - Manual payment record option
  - Export to accounting

### Phase 5: Testing (1 day)

- [ ] **Unit tests**
  - Card validation (Luhn algorithm)
  - Split calculation logic
  - Type guards + conversions
- [ ] **Integration tests**
  - Mock gateway flow (happy path + errors)
  - Database persistence
  - Soft delete behavior
- [ ] **E2E tests**
  - Full checkout flow (credit card)
  - PIX generation + copy
  - Quote approval → payment → service order creation

### Phase 6: Production Hardening (ongoing)

- [ ] PCI compliance checklist
- [ ] Rate limiting on checkout endpoint
- [ ] Fraud detection scoring
- [ ] Chargeback/dispute handling
- [ ] Payment reconciliation helper
- [ ] Sandbox/production environment switching
- [ ] Key rotation (API keys, secrets)
- [ ] Audit logging enhanced

---

## Architecture Diagram

```
                          ┌─────────────────────┐
                          │  TENANT (admin)     │
                          │  - Dashboard        │
                          │  - Payment list     │
                          │  - Analytics        │
                          └──────────┬──────────┘
                                     │
                   ┌─────────────────┼─────────────────┐
                   │                 │                 │
                   ▼                 ▼                 ▼
        ┌──────────────────────────────────┐
        │  PAYMENT CHECKOUT                │
        │  ┌──────┬──────┬────────┐        │
        │  │Card  │ PIX  │ Boleto │        │
        │  └──┬───┴──┬───┴───┬────┘        │
        │     │      │       │             │
        └─────┼──────┼───────┼─────────────┘
              │      │       │
              ▼      ▼       ▼
        ┌────────────────────────────────┐
        │  GATEWAY LAYER                 │
        │  ┌─────────┬──────┬─────────┐  │
        │  │  Mock   │Stripe│Mercado… │  │
        │  │(Dev)    │      │Pago     │  │
        │  └──┬──────┴──┬───┴────┬────┘  │
        └─────┼─────────┼────────┼───────┘
              │         │        │
              ▼         ▼        ▼
        ┌─────────────────────────────────┐
        │  PAYMENT PROCESSOR (external)   │
        │  - Auth + Encryption            │
        │  - Tokenization                 │
        │  - Fraud detection              │
        │  - Settlement                   │
        └─────────────┬───────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │  WEBHOOK RECEIVER (N8N)         │
        │  - payment.updated              │
        │  - payment.failed               │
        │  - payment.refunded             │
        │  - qr_code.expires              │
        └─────────────┬───────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │  CONFIRMATION HANDLER           │
        │  payment-confirmation.ts        │
        │  - Order status update          │
        │  - Split processing            │
        │  - Invoice creation            │
        │  - Notifications               │
        └─────────────┬───────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │  DATABASE                       │
        │  ├─ payments                    │
        │  ├─ payment_split_logs          │
        │  ├─ payment_metadata            │
        │  ├─ invoices (updated)          │
        │  ├─ service_orders (created)    │
        │  └─ tenants (subscription)      │
        └─────────────────────────────────┘
```

---

## Usage Examples

### Example 1: Quote → Payment → Service Order

```typescript
// 1. Customer views quote (public portal)
// GET /p/:token → shows quote details

// 2. Customer clicks "Pagar"
// Opens CheckoutForm (iframe/modal)
// onSuccess callback triggers...

// 3. Create payment record
const payment = await api.post(CRUD_ENDPOINT, {
  action: "create",
  table: "payments",
  payload: {
    tenant_id: quote.tenant_id,
    customer_id: quote.customer_id,
    amount_cents: quote.total_cents,
    method: "credit_card",
    context: "process_charge",
    context_reference_id: quote.id,
    card_brand: "Visa",
    card_last4: "4242",
    status: "approved", // Or 'pending' if async verification
  },
});

// 4. Convert quote → invoice (if needed)
await createInvoiceFromQuote(quote.id, payment.id);

// 5. Create service order
await createServiceOrderFromQuote(quote.id);

// 6. Send notifications
await sendPaymentConfirmationEmail(customer_id);
await sendWhatsAppNotification(customer_id);
```

### Example 2: SaaS Plan Subscription

```typescript
// 1. Tenant views pricing page
// GET /pricing → shows plans

// 2. Tenant clicks "Upgrade to Growth"
// Opens CheckoutForm in modal
// onSuccess triggers...

// 3. Create payment record (recurring)
const payment = await api.post(CRUD_ENDPOINT, {
  action: 'create',
  table: 'payments',
  payload: {
    tenant_id: user.tenant_id,
    customer_id: user.id,  // Tenant is the customer
    amount_cents: 24900,    // R$ 249.00
    method: 'credit_card',
    context: 'plan_subscription',
    context_reference_id: 'plan_growth_monthly',
    status: 'approved'
  }
})

// 4. Update tenant subscription
await api.post(CRUD_ENDPOINT, {
  action: 'update',
  table: 'tenants',
  payload: {
    id: user.tenant_id,
    plan: 'growth',
    active_seats: 500,
    billing_cycle_start: NOW(),
    billing_cycle_end: NOW() + 30 days
  }
})

// 5. Create AR (accounts receivable) for next month
await createAccountsReceivableForNextCycle(user.tenant_id)
```

### Example 3: Invoice Payment (Admin)

```typescript
// 1. Invoice detail screen
// Shows "Pending" status button

// 2. Click "Solicitar Pagamento (PIX)"
// Modal opens CheckoutForm

// 3. On success (PIX confirmed via webhook)
const payment = await api.post(CRUD_ENDPOINT, {
  action: "create",
  table: "payments",
  payload: {
    tenant_id: invoice.tenant_id,
    customer_id: invoice.customer_id,
    amount_cents: invoice.total_cents,
    method: "pix",
    context: "process_charge",
    context_reference_id: invoice.id,
    status: "pending", // Waiting for webhook confirmation
  },
});

// 4. Update invoice status (when webhook arrives)
await api.post(CRUD_ENDPOINT, {
  action: "update",
  table: "invoices",
  payload: {
    id: invoice.id,
    status: "paid",
    paid_at: NOW(),
    payment_id: payment.id,
  },
});
```

---

## Configuration Files

### MercadoPago Init

```typescript
// services/payment-gateway.ts — add to getPaymentGateway()
if (provider === "mercadopago") {
  return new MercadoPagoGateway({
    accessToken: process.env.EXPO_PUBLIC_MERCADOPAGO_ACCESS_TOKEN!,
    publicKey: process.env.EXPO_PUBLIC_MERCADOPAGO_PUBLIC_KEY!,
    userId: process.env.EXPO_PUBLIC_MERCADOPAGO_USER_ID!,
    environment: __DEV__ ? "sandbox" : "production",
  });
}
```

### Environment Variables

```
# .env (development)
EXPO_PUBLIC_MERCADOPAGO_PUBLIC_KEY=...
EXPO_PUBLIC_MERCADOPAGO_ACCESS_TOKEN=...
EXPO_PUBLIC_MERCADOPAGO_USER_ID=...

# .env (production)
Same (via CI/CD secrets)
```

---

## Rollout Plan

**Week 1:** Implement MercadoPago gateway + invoice integration
**Week 2:** Add PIX + quote checkout
**Week 3:** SaaS billing integration + webhooks
**Week 4:** Dashboard + analytics + testing
**Week 5+:** Production hardening + compliance

---

## Monitoring & Observability

```typescript
// Log every payment event
await logPaymentEvent({
  payment_id: payment.id,
  event: "payment_created",
  context,
  method,
  status,
  timestamp: NOW(),
});

// Alert on failures
if (status === "failed") {
  await alertAdmin({
    type: "payment_failed",
    payment_id,
    reason: error.message,
    severity: "high",
  });
}

// Track metrics
metrics.increment("payment.created", { method, context });
metrics.histogram("payment.amount_cents", amount_cents, { method, context });
metrics.timing("payment.processing_time_ms", endTime - startTime);
```

Good luck! 🚀
