-- Migration: Add partner_id to core operational tables
-- Purpose: Enable partner-scoped filtering (like tenant_id) on service_orders, quotes, contracts, accounts_receivable
-- Date: 2026-02-28
--
-- After this migration, partner operators can be filtered directly by partner_id
-- instead of the indirect customers.partner_id → service_orders.customer_id path.

-- 1. service_orders — the core process table
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id);

CREATE INDEX IF NOT EXISTS idx_service_orders_partner_id
  ON service_orders (partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_tenant_partner
  ON service_orders (tenant_id, partner_id)
  WHERE partner_id IS NOT NULL;

-- 2. quotes — proposals linked to service orders
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id);

CREATE INDEX IF NOT EXISTS idx_quotes_partner_id
  ON quotes (partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_tenant_partner
  ON quotes (tenant_id, partner_id)
  WHERE partner_id IS NOT NULL;

-- 3. contracts — ongoing agreements with customers
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id);

CREATE INDEX IF NOT EXISTS idx_contracts_partner_id
  ON contracts (partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_partner
  ON contracts (tenant_id, partner_id)
  WHERE partner_id IS NOT NULL;

-- 4. accounts_receivable — financial receivables
ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id);

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_partner_id
  ON accounts_receivable (partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_tenant_partner
  ON accounts_receivable (tenant_id, partner_id)
  WHERE partner_id IS NOT NULL;
