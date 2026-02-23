-- ============================================================
-- Migration: Partner-based delinquency management
-- Adds partner_id to customers + is_internal to partners
-- ============================================================

-- 1. Add partner_id FK on customers
--    Each customer can belong to one partner (the collection operator).
--    NULL means the customer has no external partner assigned.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id);

-- Index for fast partner-scoped queries
CREATE INDEX IF NOT EXISTS idx_customers_partner_id
  ON customers (partner_id)
  WHERE partner_id IS NOT NULL;

-- 2. Add is_internal flag on partners
--    When true, this partner represents the tenant itself ("self-partner").
--    All filtering uses partner_id uniformly — no null exceptions.
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- 3. Add partner_id FK on users (links operator user → partner)
--    Allows usePartnerScope to resolve which partner the user belongs to.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id);

CREATE INDEX IF NOT EXISTS idx_users_partner_id
  ON users (partner_id)
  WHERE partner_id IS NOT NULL;

-- 4. (Optional) Composite index for tenant+partner on customers
CREATE INDEX IF NOT EXISTS idx_customers_tenant_partner
  ON customers (tenant_id, partner_id);
