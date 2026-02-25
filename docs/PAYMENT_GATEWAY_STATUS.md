# Payment Gateway Implementation Status

**Last Updated:** 2025-01-XX  
**Owner:** Development Team  
**Status:** 🟡 **IN PROGRESS** (Phase 1 - MVP Gateway)

---

## Phase Breakdown

### ✅ Phase 0: Foundation (COMPLETE)

- [x] Core data structures (payment types, enums, interfaces)
- [x] Database schema (payments, splits, metadata tables)
- [x] Service layer foundation (interfaces, registry pattern)
- [x] Mock gateway implementation
- [x] UI component (CheckoutForm.tsx)
  - [x] Credit card with Luhn validation
  - [x] Card brand detection
  - [x] Installment selection (1-12x)
  - [x] PIX QR code generation
  - [x] Boleto barcode generation
  - [x] Status display + error handling
  - [x] Theme-aware styling
  - [x] Mobile + web responsive

**Files Created:**

- `services/payment-gateway.ts` — Gateway registry + types
- `services/payment-splits.ts` — Split calculation by context
- `services/payment-metadata.ts` — Metadata helpers
- `components/checkout/CheckoutForm.tsx` — Main UI component
- `migrations/add-payment-gateway.sql` — Database schema
- `docs/PAYMENT_GATEWAY_ROADMAP.md` — This roadmap

**Deliverables:** ✓ All checklist items complete

---

### 🟡 Phase 1: MVP Gateway (IN PROGRESS)

**Target:** 1-2 weeks | **Priority:** CRITICAL (blocks launch)

#### 1.1: MercadoPago Integration

- [ ] Create `services/gateways/mercadopago.gateway.ts`
  - [ ] CardData → Mercado Pago token conversion
  - [ ] `createPayment()` method
  - [ ] `createPaymentWithSplits()` method (commissions)
  - [ ] Error handling + retry logic
  - [ ] Webhook signature verification
  - [ ] Rate limiting awareness
- [ ] Webhook handler: `n8n/webhook-mercadopago.ts`
  - [ ] payment.updated event
  - [ ] payment.failed event
  - [ ] refund.created event
  - [ ] Signature verification
  - [ ] Idempotency handling
  - [ ] Error logging + retry queue

- [ ] Tests: `__tests__/mercadopago.gateway.test.ts`
  - [ ] Happy path: card → approved
  - [ ] Installment creation
  - [ ] Split calculation
  - [ ] Error scenarios (invalid card, insufficient funds, etc.)

**Effort:** 3-4 days | **Blocking:** Invoice payment feature

#### 1.2: PIX Integration (lite version)

- [ ] Create `services/gateways/pix.gateway.ts`
  - [ ] Use existing pix-utils for BRCode generation
  - [ ] QR code → base64 image
  - [ ] Copy-paste key generation
  - [ ] 30-minute expiration logic
  - [ ] Manual verification endpoint
  - [ ] Fallback to other methods if PIX expires
- [ ] Mock webhook for development: `n8n/webhook-pix-mock.ts`
  - [ ] Simulated payment confirmation
  - [ ] Admin can manually confirm payment
  - [ ] Real integration deferred to Phase 2
- [ ] Tests: `__tests__/pix.gateway.test.ts`
  - [ ] QR code generation
  - [ ] Copy-paste sanitization
  - [ ] Expiration handling

**Effort:** 2-3 days | **Blocking:** None (nice-to-have for MVP)

#### 1.3: Boleto Integration (mock only)

- [ ] Create `services/gateways/boleto.gateway.ts`
  - [ ] Use existing boleto-utils or similar library
  - [ ] Generate barcode number
  - [ ] Generate PDF URL
  - [ ] Set due date (default +7 days)
  - [ ] Return to user
- [ ] Tests: `__tests__/boleto.gateway.test.ts`
  - [ ] Barcode generation validation
  - [ ] PDF URL construction
  - [ ] Due date calculation

**Effort:** 1-2 days | **Blocking:** None (deferred for Phase 2)

**Phase 1 Completion Criteria:**

- [ ] MercadoPago creates real payments
- [ ] Webhook confirms payment status
- [ ] Invoice payment flow end-to-end working
- [ ] CheckoutForm integrates with real gateway
- [ ] Mock gateway still usable for dev/testing
- [ ] All tests passing

---

### 🔜 Phase 2: Integration Rails (1-2 weeks)

**Dependencies:** Phase 1 complete  
**Priority:** HIGH (enables revenue)

#### 2.1: Invoice Payment UI

- [ ] Create `app/(app)/Pagamento/invoice-payment.tsx`
  - [ ] Invoice detail view
  - [ ] Payment status display (pending, paid, overdue)
  - [ ] "Request Payment" button (triggers CheckoutForm)
  - [ ] Payment method suggestions (based on invoice amount)
  - [ ] Installment recommendation (if credit card)
  - [ ] Confirmation message on success
- [ ] Checkout modal wrapper: `components/checkout/CheckoutModal.tsx`
  - [ ] Embeds CheckoutForm
  - [ ] Pre-fills tenant + customer + amount
  - [ ] Handles success/error callbacks
  - [ ] Tracks analytics

- [ ] Invoice update flow: `services/invoice-payment.ts`
  - [ ] createPaymentFromInvoice()
  - [ ] confirmInvoicePayment()
  - [ ] sendPaymentConfirmation()
  - [ ] Database writes

**Effort:** 3-4 days | **Blocks:** None independent | **Blocked by:** Phase 1

#### 2.2: Quote Approval + Checkout

- [ ] Create `app/(app)/Vendas/quote-checkout.tsx`
  - [ ] Quote detail view (client-facing)
  - [ ] Payment preview (total, installments, fee transparency)
  - [ ] CheckoutForm embedded
  - [ ] Success → quote approved + service order created
- [ ] Quote payment flow: `services/quote-payment.ts`
  - [ ] createPaymentFromQuote()
  - [ ] convertQuoteToInvoice()
  - [ ] createServiceOrderFromQuote()
  - [ ] Notification chain

- [ ] Public portal update: `/p/:token` route
  - [ ] Show payment button if quote not approved
  - [ ] Link to quote-checkout
  - [ ] Display payment status

**Effort:** 3-4 days | **Blocks:** Quote approval feature | **Blocked by:** Phase 1

#### 2.3: SaaS Plan Subscription Checkout

- [ ] Create `app/(app)/Administrador/billing-checkout.tsx`
  - [ ] Pricing table display
  - [ ] Plan comparison (free vs starter vs growth vs scale vs enterprise)
  - [ ] Upgrade/downgrade action buttons
  - [ ] CheckoutForm for single payment
  - [ ] Recurring billing disclaimer
- [ ] Subscription payment flow: `services/subscription-payment.ts`
  - [ ] createPaymentForPlan()
  - [ ] updateTenantSubscription()
  - [ ] createRecurringBillingRecord()
  - [ ] scheduledNextBillingCycle()
  - [ ] Seat limit unlock

- [ ] Limits enforcement: `hooks/use-tenant-limits.ts` (enhance)
  - [ ] `canAddClient()` respects plan
  - [ ] `canAddUser()` respects plan
  - [ ] Graceful upgrade prompts in UI

**Effort:** 4-5 days | **Blocks:** SaaS launch | **Blocked by:** Phase 1

**Phase 2 Completion Criteria:**

- [ ] Each integration flow (invoice, quote, plan) working end-to-end
- [ ] Database correctly updated on success
- [ ] Users receive confirmation emails
- [ ] WhatsApp notifications sent
- [ ] Manual payment fallback available for failures
- [ ] Admin can see all payments in dashboard (partial — see Phase 4)

---

### 🔜 Phase 3: Webhook Handlers (1 day)

**Dependencies:** Phase 1 + 2 complete  
**Priority:** HIGH (critical for payment confirmation)

#### 3.1: Webhook Router (N8N)

- [ ] Create `n8n/webhook-payment-router.ts` or N8N flow
  - [ ] Receives POST /webhook/payment
  - [ ] Routes by provider (mercadopago, pix, boleto)
  - [ ] Routes by event type (payment.updated, payment.failed, etc.)
  - [ ] Validates signature
  - [ ] Logs all events
  - [ ] Retries on failure

#### 3.2: Payment Confirmation Handler

- [ ] Create `services/payment-confirmation.ts`
  - [ ] markPaymentAsApproved()
  - [ ] processSplits() — create payment_split_logs
  - [ ] updateContextRecord() — invoice/quote/subscription
  - [ ] createLedgerEntries() (if accounting module active)
  - [ ] sendNotifications() — email + WhatsApp
  - [ ] updatePartnerEarnings()

#### 3.3: Failure Handler

- [ ] Create `services/payment-failure.ts`
  - [ ] markPaymentAsFailed()
  - [ ] retryLogic() — for transient failures
  - [ ] alertAdmin() — for critical failures
  - [ ] sendFailureNotification() — customer can try again
  - [ ] Cleanup (cancel QR codes, free up invoice lock, etc.)

**Phase 3 Completion Criteria:**

- [ ] All payment state transitions automatic via webhooks
- [ ] No manual intervention needed for successful payments
- [ ] Failures logged + visible in admin dashboard
- [ ] Customers notified of success/failure within 5 seconds

---

### 🔜 Phase 4: Admin Dashboard (1 day)

**Dependencies:** Phase 1-3 complete  
**Priority:** MEDIUM (for operations team)

#### 4.1: Payment Analytics

- [ ] Create `app/(app)/Administrador/pagamentos-dashboard.tsx`
  - [ ] Revenue by period (daily, monthly) — line chart
  - [ ] Payment method breakdown — pie chart
  - [ ] Split summary — bar chart (partner commission %)
  - [ ] Failed payment alerts — banner
  - [ ] Pending PIX expiration warnings — list
  - [ ] Top customers by revenue — table
  - [ ] Net revenue after splits — KPI card

#### 4.2: Payment Management

- [ ] Create `app/(app)/Administrador/pagamentos-list.tsx`
  - [ ] CrudScreen of `payments` table
  - [ ] Filters: status, method, date range, context, customer
  - [ ] Refund action button (triggers refund flow)
  - [ ] Manual payment record option
  - [ ] Duplicate detection (same customer, same amount, same minute)
  - [ ] Export to CSV (for accounting)

#### 4.3: Split Management

- [ ] Create `app/(app)/Administrador/comissoes-list.tsx`
  - [ ] CrudScreen of `payment_split_logs` table
  - [ ] Automatic payouts view (when scheduled becomes completed)
  - [ ] Manual payout option (for exceptions)
  - [ ] Partner reconciliation (compare splits vs partner claims)

**Phase 4 Completion Criteria:**

- [ ] Admin has complete visibility into payment flows
- [ ] Can manually intervene in failures
- [ ] Can reconcile with accounting
- [ ] Can track profitability by revenue stream

---

### 🔜 Phase 5: Testing (1 day)

**Dependencies:** Phase 1-4 complete  
**Priority:** MEDIUM (for stability)

#### 5.1: Unit Tests

- [ ] `__tests__/payment-gateway.test.ts` — Gateway interface
- [ ] `__tests__/payment-splits.test.ts` — Split calculation
- [ ] `__tests__/payment-types.test.ts` — Type guards + conversions
- [ ] `__tests__/card-validation.test.ts` — Luhn + brand detection

#### 5.2: Integration Tests

- [ ] `__tests__/e2e-mock-gateway.test.ts`
  - [ ] Full checkout with mock provider
  - [ ] Database persistence
  - [ ] Soft delete behavior
  - [ ] Split creation

- [ ] `__tests__/e2e-invoice-payment.test.ts`
  - [ ] Invoice → payment → invoice status update
  - [ ] Email notification sent
  - [ ] Dashboard reflects change

- [ ] `__tests__/e2e-quote-approval.test.ts`
  - [ ] Quote → checkout → approval → invoice → service order
  - [ ] Customer notifications

#### 5.3: E2E Tests (if using Detox/Playwright)

- [ ] Full user flow from quote link to payment confirmation

**Phase 5 Completion Criteria:**

- [ ] All payment code paths have test coverage > 80%
- [ ] Mock gateway can simulate all scenarios (success, failure, refund)
- [ ] Integration tests pass consistently
- [ ] No flaky tests

---

### 🔜 Phase 6: Production Hardening (ongoing)

**Dependencies:** Parallel to earlier phases  
**Priority:** HIGH (for production readiness)

- [ ] PCI compliance checklist
  - [ ] No card data on app servers (delegate to gateway)
  - [ ] HTTPS everywhere
  - [ ] Secure storage of API keys (CI/CD secrets)
  - [ ] Regular penetration testing
- [ ] Rate limiting
  - [ ] POST /checkout limited to 10 req/min per IP
  - [ ] Webhook endpoint idempotent
- [ ] Fraud detection
  - [ ] CVV attempts (max 3 per card)
  - [ ] Duplicate transaction detection (same customer, same amount, < 1 min)
  - [ ] High-value payment alerts
  - [ ] Geographic mismatch warning
- [ ] Chargeback / Dispute handling
  - [ ] API to retrieve dispute info from gateway
  - [ ] Evidence uploader (invoice, communication logs)
  - [ ] Outcome notification to customer
- [ ] Reconciliation
  - [ ] Daily batch: compare payments table vs gateway API
  - [ ] Flag mismatches for investigation
  - [ ] Generate reconciliation report for accountant
- [ ] Environment management
  - [ ] Sandbox for testing (API keys from .env.sandbox)
  - [ ] Production for live (API keys from secrets manager)
  - [ ] Easy switching without code changes
- [ ] Key rotation
  - [ ] Monthly API key rotation
  - [ ] Webhook secret rotation
  - [ ] Zero-downtime rotation (old + new key accepted temporarily)
- [ ] Audit logging
  - [ ] Every payment event logged
  - [ ] Admin actions logged (manual payments, refunds)
  - [ ] Query logs for compliance queries
  - [ ] Immutable audit table (no updates, only inserts)

---

## Status by Platform

| Feature                | Mobile | Web | API |
| ---------------------- | ------ | --- | --- |
| CheckoutForm (UI)      | ✅     | ✅  | —   |
| Credit card validation | ✅     | ✅  | ✅  |
| Card brand detection   | ✅     | ✅  | ✅  |
| Installments (1-12x)   | ✅     | ✅  | ✅  |
| PIX QR generation      | ✅     | ✅  | ✅  |
| Boleto barcode         | ✅     | ✅  | ✅  |
| MercadoPago gateway    | 🔜     | 🔜  | 🔜  |
| PIX real integration   | 🔜     | 🔜  | 🔜  |
| Webhook handlers       | N/A    | N/A | 🔜  |
| Invoice payment        | 🔜     | 🔜  | ✅  |
| Quote checkout         | 🔜     | 🔜  | ✅  |
| Subscription checkout  | 🔜     | 🔜  | ✅  |
| Payment dashboard      | 🔜     | 🔜  | N/A |
| Commission payouts     | 🔜     | 🔜  | 🔜  |

---

## Risk Assessment

| Risk                             | Probability | Impact | Mitigation                                  |
| -------------------------------- | ----------- | ------ | ------------------------------------------- |
| Gateway API changes              | Medium      | High   | Maintain wrapper layer + version pinning    |
| Webhook delays (missed payments) | Low         | Medium | Implement reconciliation job + manual retry |
| PCI audit fails                  | Low         | High   | Engage compliance consultant early          |
| High payment failure rate        | Medium      | Medium | A/B test different gateways early           |
| Split calculation errors         | Low         | High   | Extensive testing + audit logging           |
| Database transaction failures    | Low         | Medium | Idempotency keys + retry logic              |

---

## Success Metrics

- [ ] **Conversion rate:** > 95% for approved customers
- [ ] **Processing time:** < 3 seconds for card payment
- [ ] **PIX confirmation time:** < 30 seconds
- [ ] **Failure rate:** < 2% (excluding customer issues like insufficient funds)
- [ ] **Webhook latency:** < 5 seconds
- [ ] **Refund processing:** < 24 hours
- [ ] **Zero PCI compliance violations** in audit

---

## Team Assignments

| Phase                 | Owner            | Duration | Start  | End    |
| --------------------- | ---------------- | -------- | ------ | ------ |
| Phase 1 (MercadoPago) | Backend          | 1-2 wk   | Jan 20 | Feb 3  |
| Phase 2 (Integration) | Full-stack       | 1-2 wk   | Feb 3  | Feb 17 |
| Phase 3 (Webhooks)    | Backend          | 3-5 days | Feb 17 | Feb 24 |
| Phase 4 (Dashboard)   | Frontend         | 1-2 days | Feb 24 | Feb 28 |
| Phase 5 (Testing)     | QA               | 1-2 days | Feb 28 | Mar 5  |
| Phase 6 (Hardening)   | DevOps + Backend | Ongoing  | Jan 20 | Mar 31 |

---

## Key Documents

- Architecture: `docs/PAYMENT_GATEWAY_ROADMAP.md`
- Component Props: See `components/checkout/CheckoutForm.tsx` (interface CheckoutFormProps)
- Database: `migrations/add-payment-gateway.sql`
- Types: See `services/payment-gateway.ts` (export interfaces)

---

## How to Update This Status

```bash
# After completing each phase:
git commit -m "Phase N: payment gateway - [feature description]"

# Update this file:
# 1. Check off completed tasks
# 2. Update Phase status emoji (✅ → 🔜 → 🟡 → ✅)
# 3. Update "Last Updated" date
# 4. Commit with message like "docs: payment gateway status - phase 2 complete"
```

---

**Next Action:**  
→ Begin Phase 1.1: Implement MercadoPago gateway with test credentials  
→ Target completion: [DATE based on team availability]
