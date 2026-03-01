-- Migration: Add bank_account_id and chart_account_id to purchase_orders
-- These fields allow linking a purchase order to a specific bank account for payment
-- and a chart of accounts entry for financial classification.
-- When the PO generates accounts_payable, these values are passed through.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id),
  ADD COLUMN IF NOT EXISTS chart_account_id UUID REFERENCES chart_of_accounts(id);

-- Also add due_date for explicit payment due date (overrides supplier payment_terms)
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS due_date DATE;

COMMENT ON COLUMN purchase_orders.bank_account_id IS 'Bank account used to pay this purchase';
COMMENT ON COLUMN purchase_orders.chart_account_id IS 'Chart of accounts classification for this purchase';
COMMENT ON COLUMN purchase_orders.due_date IS 'Payment due date (overrides supplier payment_terms if set)';
