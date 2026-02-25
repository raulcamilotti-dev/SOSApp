# Payment Gateway: Developer Reference Guide

## Quick Navigation

### 📋 Documentation

- **Roadmap:** [docs/PAYMENT_GATEWAY_ROADMAP.md](PAYMENT_GATEWAY_ROADMAP.md) — Full 6-phase implementation plan
- **Status:** [docs/PAYMENT_GATEWAY_STATUS.md](PAYMENT_GATEWAY_STATUS.md) — Live tracking of progress
- **This File:** Quick reference for developers

### 🔧 Services (Core Logic)

- **Gateway Interface:** [services/payment-gateway.ts](../services/payment-gateway.ts)
  - CardData, CreatePaymentRequest, PaymentResponse types
  - IPaymentGateway interface
  - Mock gateway implementation
  - Registry pattern for multiple gateways
- **Split Calculation:** [services/payment-splits.ts](../services/payment-splits.ts)
  - autoCalculateSplits(context) function
  - Support: marketplace, plan_subscription, process_charge, manual_invoice
  - Returns: SplitRecipient array with amounts and percentages
- **Metadata Helpers:** [services/payment-metadata.ts](../services/payment-metadata.ts)
  - Flexible key-value storage utilities
  - Type hints for validation

### 🎨 UI Components (User-Facing)

- **CheckoutForm:** [components/checkout/CheckoutForm.tsx](../components/checkout/CheckoutForm.tsx)
  - Main payment entry point
  - Props: CheckoutFormProps interface
  - Features:
    - Credit card: Luhn validation, brand detection, installments (1-12x)
    - PIX: QR code, copy-paste, 30-min expiration
    - Boleto: barcode, PDF link
    - Status display and error handling
    - Theme-aware (light/dark mode)
    - Mobile + web responsive

  **Import:**

  ```typescript
  import { CheckoutForm } from '@/components/checkout/CheckoutForm';

  <CheckoutForm
    amount={totalCents}
    currency="BRL"
    customer={customer}
    context="process_charge"
    contextReferenceId={invoiceId}
    onSuccess={(payment) => { /* handle */ }}
    onError={(error) => { /* handle */ }}
    tenant={tenant}
    theme={theme}
  />
  ```

### 🗄️ Database

- **Migration:** [migrations/add-payment-gateway.sql](../migrations/add-payment-gateway.sql)
  - Tables: payments, payment_split_logs, payment_metadata
  - Triggers: auto-update timestamps, soft delete
  - Functions: calculate_payment_splits()
  - Indexes: optimized for payment queries

  **Tables:**

  ```sql
  -- Main payment table (50 columns)
  payments
    ├─ id, tenant_id, customer_id
    ├─ amount_cents, method (credit_card|pix|boleto|manual), status
    ├─ context (marketplace|plan_subscription|process_charge|manual_invoice)
    ├─ card_brand, card_last4, card_holder_name
    ├─ pix_qr_code, pix_copy_paste, pix_expires_at
    ├─ boleto_barcode, boleto_pdf_url, boleto_due_date
    ├─ installments, installment_amount_cents
    ├─ splits JSONB, metadata JSONB
    ├─ created_at, updated_at, deleted_at
    └─ Indexed on: tenant_id, customer_id, status, method, context, created_at

  -- Commission tracking
  payment_split_logs
    ├─ payment_id, recipient_type (tenant|partner|platform|financial)
    ├─ recipient_id, amount_cents, percentage
    ├─ status (pending|scheduled|processing|completed|failed|cancelled)
    ├─ payout_method, payout_reference
    ├─ scheduled_at, completed_at
    └─ Indexed on: payment_id, recipient_id, status, tenant_id

  -- Extensible metadata
  payment_metadata
    ├─ payment_id, key, value, value_type
    └─ UNIQUE(payment_id, key)
  ```

### 🚀 Integration Points

#### From Invoice Detail Screen

```typescript
import { CheckoutForm } from '@/components/checkout/CheckoutForm';

const handlePayment = async (payment: PaymentResponse) => {
  // Create payment record in database
  await api.post(CRUD_ENDPOINT, {
    action: 'create',
    table: 'payments',
    payload: {
      tenant_id: invoice.tenant_id,
      customer_id: invoice.customer_id,
      amount_cents: invoice.total_cents,
      method: payment.method,
      status: payment.status,
      context: 'process_charge',
      context_reference_id: invoice.id,
      card_brand: payment.cardBrand,
      card_last4: payment.cardLast4,
      // ... other fields
    }
  })

  // Update invoice
  await api.post(CRUD_ENDPOINT, {
    action: 'update',
    table: 'invoices',
    payload: { id: invoice.id, status: 'paid', payment_id: payment.paymentId }
  })
}

<CheckoutForm
  amount={invoice.total_cents}
  customer={{ id: customer.id, email: customer.email, name: customer.name }}
  context="process_charge"
  contextReferenceId={invoice.id}
  onSuccess={handlePayment}
  tenant={tenant}
/>
```

#### From Quote Public Portal

```typescript
import { CheckoutForm } from '@/components/checkout/CheckoutForm';

const handleQuotePayment = async (payment: PaymentResponse) => {
  // 1. Create payment
  const paymentRecord = await createPayment({...})

  // 2. Convert quote → invoice (if needed)
  const invoice = await createInvoiceFromQuote(quote.id, paymentRecord.id)

  // 3. Create service order (process starts)
  const serviceOrder = await createServiceOrderFromQuote(quote.id)

  // 4. Notifications
  await sendConfirmationEmail(customer.email)
}

<CheckoutForm
  amount={quote.totalCents}
  customer={{ id: customer.id, email: customer.email, name: customer.name }}
  context="process_charge"
  contextReferenceId={quote.id}
  onSuccess={handleQuotePayment}
  tenant={tenant}
/>
```

#### From SaaS Billing Page

```typescript
import { CheckoutForm } from '@/components/checkout/CheckoutForm';

const plans = {
  starter: { cents: 9900, seats: 100 },
  growth: { cents: 24900, seats: 500 },
  scale: { cents: 49900, seats: 2000 }
}

const handlePlanUpgrade = async (payment: PaymentResponse) => {
  // 1. Create payment
  const paymentRecord = await createPayment({
    context: 'plan_subscription',
    contextReferenceId: 'plan_' + planName + '_monthly'
  })

  // 2. Update tenant subscription
  await api.post(CRUD_ENDPOINT, {
    action: 'update',
    table: 'tenants',
    payload: {
      id: tenant.id,
      plan: planName,
      active_seats: plans[planName].seats,
      billing_cycle_start: NOW(),
      billing_cycle_end: add(NOW(), { months: 1 })
    }
  })

  // 3. Create AR for next month (already set up for auto-payment)
  await scheduleNextBillingCycle(tenant.id)
}

<CheckoutForm
  amount={plans[upgradeToplan].cents}
  customer={{ id: tenant.id, email: tenant.admin_email, name: tenant.company_name }}
  context="plan_subscription"
  contextReferenceId={`plan_${planName}_monthly`}
  onSuccess={handlePlanUpgrade}
  tenant={tenant}
/>
```

### 📊 Admin Dashboard Integration

#### Access Payment List

```typescript
import { CrudScreen } from '@/components/ui/CrudScreen';

<CrudScreen<Payment>
  title="Pagamentos"
  fields={[
    { key: 'id', label: 'ID', visibleInList: false },
    { key: 'created_at', label: 'Data', type: 'datetime' },
    { key: 'customer_id', label: 'Cliente', type: 'reference', referenceTable: 'customers' },
    { key: 'amount_cents', label: 'Valor', type: 'currency' },
    { key: 'method', label: 'Método', type: 'select', options: [
      { label: 'Cartão', value: 'credit_card' },
      { label: 'PIX', value: 'pix' },
      { label: 'Boleto', value: 'boleto' }
    ]},
    { key: 'status', label: 'Status', type: 'select', options: [
      { label: 'Pendente', value: 'pending' },
      { label: 'Aprovado', value: 'approved' },
      { label: 'Falhou', value: 'failed' }
    ]},
  ]}
  loadItems={async () => {
    const res = await api.post(CRUD_ENDPOINT, {
      action: 'list',
      table: 'payments',
      search_field1: 'tenant_id',
      search_value1: user.tenant_id,
      search_operator1: 'equal',
      sort_column: 'created_at DESC'
    })
    return normalizeCrudList(res.data)
  }}
  // ... other props
/>
```

### 🧪 Testing

#### Mock Gateway Testing

```typescript
import { getPaymentGateway } from "@/services/payment-gateway";

it("should process credit card payment", async () => {
  const gateway = getPaymentGateway("mock");

  const response = await gateway.createPayment({
    amount: 10000,
    method: "credit_card",
    cardNumber: "4111111111111111",
    cardHolder: "Test User",
    cvv: "123",
    expirationMonth: 12,
    expirationYear: 2025,
    installments: 1,
  });

  expect(response.status).toBe("approved");
  expect(response.cardLast4).toBe("1111");
  expect(response.cardBrand).toBe("Visa");
});

it("should calculate splits correctly", async () => {
  const splits = await autoCalculateSplits({
    context: "process_charge",
    contextReferenceId: invoiceId,
    amount: 10000,
    tenantId: tenant.id,
    customerId: customer.id,
  });

  // Example: invoice payment splits 10% to platform, rest to tenant
  expect(splits).toContainEqual({
    recipient_type: "platform",
    recipient_id: "platform",
    amount_cents: 1000, // 10%
    percentage: 10,
  });
  expect(splits).toContainEqual({
    recipient_type: "tenant",
    recipient_id: tenant.id,
    amount_cents: 9000, // 90%
    percentage: 90,
  });
});
```

### 🔌 Webhook Integration (N8N)

#### Expected Webhook from MercadoPago

```json
POST /webhook/payment

{
  "type": "payment.updated",
  "data": {
    "id": "123456789",
    "status": "approved",
    "transaction_amount": 100.00,
    "payment_method_id": "visa",
    "installments": 1,
    "cardholder": { "name": "Test User" },
    "metadata": {
      "payment_id": "uuid-from-sosapp",
      "context": "process_charge",
      "tenant_id": "tenant-uuid"
    }
  }
}
```

#### N8N Webhook Handler Flow

```
1. Receive POST /webhook/payment
2. Validate signature (Mercado Pago X-Signature header)
3. Extract payment_id from metadata
4. Lookup payments table by id
5. If status=approved:
   - Call payment-confirmation.ts
   - Mark payment as approved
   - Process splits
   - Update context record (invoice, quote, subscription)
   - Queue confirmations email/WhatsApp
6. Else if status=failed:
   - Call payment-failure.ts
   - Mark payment as failed
   - Send retry notification to customer
7. Return 200 OK (idempotent)
```

---

## Common Tasks

### Add a New Gateway Provider

1. Create `services/gateways/[provider].gateway.ts` implementing `IPaymentGateway`
2. Register in `payment-gateway.ts` getPaymentGateway() function
3. Add tests in `__tests__/[provider].gateway.test.ts`
4. Add webhook handler in `n8n/webhook-[provider].ts`
5. Update CheckoutForm props to show new method option (if applicable)

### Modify Split Logic

1. Edit `services/payment-splits.ts` autoCalculateSplits() function
2. Add test cases in `__tests__/payment-splits.test.ts`
3. Update database migration if adding new recipient types
4. Notify operations team of changes to commission calculations

### Add Payment Method to Checkout

1. Add PaymentMethodType union in `services/payment-gateway.ts`
2. Add UI tab in CheckoutForm.tsx (method tabs)
3. Add form fields and validation for new method
4. Implement gateway support (see "Add a New Gateway" above)
5. Test end-to-end flow

### Debug Payment Failure

1. Check `payments` table status = 'failed'
2. Look at `payment_metadata` for error details
3. Check N8N logs if webhook failed
4. Check admin dashboard for alerts
5. If transient: use retry action in admin UI (when implemented)
6. If permanent: send support ticket to operations

---

## Troubleshooting

| Issue                        | Likely Cause             | Fix                                                      |
| ---------------------------- | ------------------------ | -------------------------------------------------------- |
| Card validation always fails | Luhn check too strict?   | Check `payment-gateway.ts` validateCard() regex          |
| PIX QR code not displaying   | pix-utils not installed? | `npm install pix-utils`                                  |
| Payment webhook not arriving | N8N not receiving?       | Check N8N logs, verify webhook URL in provider dashboard |
| Split calculation off        | Commission % incorrect   | Verify tenant billing configuration in `tenants` table   |
| Duplicate payment records    | No idempotency key       | Ensure webhook handler includes idempotency check        |

---

## Performance Tips

1. **Batch reference resolution:** Use payment_id for lookups (indexed)
2. **Avoid N+1 in Dashboard:** Use aggregate query to sum amounts by status
3. **Archive old payments:** Move payments > 1 year to archive table
4. **Cache split rules:** Load tenant commission config once, reuse
5. **Async webhooks:** Process splits/notifications in background job queue

---

## Security Checklist

- [ ] Never log full card numbers (always use last4)
- [ ] Use environment variables for API keys (never commit)
- [ ] Validate webhook signatures (prevent replay attacks)
- [ ] Rate limit checkout endpoint (prevent brute force CVV guessing)
- [ ] Sanitize user input (prevent SQL injection)
- [ ] Use HTTPS everywhere (TLS 1.2+)
- [ ] Rotate API keys monthly
- [ ] Monitor for duplicate transactions (fraud signal)
- [ ] Implement chargeback dispute handler
- [ ] Pass PCI DSS audit annually

---

## Links to Related Systems

- **Invoices:** [app/(app)/Faturamento/](../app/)
- **Quotes:** [app/(app)/Vendas/](../app/)
- **Subscriptions:** [app/(app)/Administrador/billing.tsx](../app/)
- **Notifications:** [services/notifications.ts](../services/)
- **Webhooks:** [n8n/workflows/](../n8n/)

---

**Last Updated:** Feb 2025  
**Next Review:** Monthly with team

For questions, refer to `docs/PAYMENT_GATEWAY_ROADMAP.md` or ask #payments-dev channel.
