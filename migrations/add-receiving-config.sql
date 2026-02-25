-- ================================================================
-- MIGRATION: Tenant/Partner Receiving Config + Service Split Rules
-- Created: 2026-02-24
-- Purpose: Store gateway receiving config and per-service split rules
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. TENANTS: receiving config
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payments_enabled BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_gateway_provider VARCHAR(50) DEFAULT 'asaas';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS asaas_wallet_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS card_enabled BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pix_enabled BOOLEAN DEFAULT false;

-- ──────────────────────────────────────────────────────────────────
-- 2. PARTNERS: receiving config
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE partners ADD COLUMN IF NOT EXISTS asaas_wallet_id TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS payout_enabled BOOLEAN DEFAULT true;

-- ──────────────────────────────────────────────────────────────────
-- 3. SERVICE SPLIT RULES (per service + optional partner)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_split_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id UUID NOT NULL REFERENCES tenants(id),
    service_id UUID NOT NULL REFERENCES services(id),
    partner_id UUID REFERENCES partners(id),

    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('radul', 'tenant', 'partner')),
    percentage NUMERIC(5,2),
    fixed_amount NUMERIC(10,2),

    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    notes TEXT,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,

    CONSTRAINT service_split_value CHECK (
        (percentage IS NOT NULL OR fixed_amount IS NOT NULL)
    ),
    CONSTRAINT service_split_percentage CHECK (
        percentage IS NULL OR (percentage >= 0 AND percentage <= 100)
    ),
    CONSTRAINT service_split_fixed_amount CHECK (
        fixed_amount IS NULL OR fixed_amount >= 0
    ),
    CONSTRAINT service_split_partner_rule CHECK (
        (recipient_type = 'partner' AND partner_id IS NOT NULL) OR
        (recipient_type IN ('tenant', 'radul') AND partner_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_service_split_rules_tenant
  ON service_split_rules(tenant_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_split_rules_service
  ON service_split_rules(service_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_split_rules_partner
  ON service_split_rules(partner_id) WHERE partner_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_split_rules_active
  ON service_split_rules(is_active) WHERE is_active = true;
