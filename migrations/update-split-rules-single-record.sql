-- ================================================================
-- MIGRATION: Update Split Rules to Single Record Model
-- Created: 2026-02-24
-- Purpose: Change from 3-record model to single record with fixed Radul 0.5%
-- ================================================================

-- Drop old table and recreate with new structure
DROP TABLE IF EXISTS service_split_rules;

CREATE TABLE service_split_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id UUID NOT NULL REFERENCES tenants(id),
    service_id UUID NOT NULL REFERENCES services(id),
    partner_id UUID REFERENCES partners(id),

    -- Radul always gets 0.5% (hardcoded in app, stored here for audit)
    radul_percentage NUMERIC(5,2) DEFAULT 0.5 NOT NULL,

    -- Tenant split (percentage OR fixed amount)
    tenant_percentage NUMERIC(5,2),
    tenant_fixed_amount NUMERIC(10,2),

    -- Partner split (percentage OR fixed amount)
    partner_percentage NUMERIC(5,2),
    partner_fixed_amount NUMERIC(10,2),

    is_active BOOLEAN DEFAULT true,
    notes TEXT,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,

    -- Constraints
    CONSTRAINT split_percentages_valid CHECK (
        (tenant_percentage IS NULL OR (tenant_percentage >= 0 AND tenant_percentage <= 99.5)) AND
        (partner_percentage IS NULL OR (partner_percentage >= 0 AND partner_percentage <= 99.5))
    ),
    CONSTRAINT split_fixed_amounts_valid CHECK (
        (tenant_fixed_amount IS NULL OR tenant_fixed_amount >= 0) AND
        (partner_fixed_amount IS NULL OR partner_fixed_amount >= 0)
    ),
    CONSTRAINT split_tenant_value_required CHECK (
        tenant_percentage IS NOT NULL OR tenant_fixed_amount IS NOT NULL
    ),
    -- If partner_id is set, at least one partner value must be provided
    CONSTRAINT split_partner_value CHECK (
        (partner_id IS NULL) OR 
        (partner_id IS NOT NULL AND (partner_percentage IS NOT NULL OR partner_fixed_amount IS NOT NULL))
    ),
    -- Unique: one active rule per service+partner combination
    CONSTRAINT split_unique_service_partner UNIQUE (service_id, partner_id, deleted_at)
);

-- Indexes
CREATE INDEX idx_service_split_rules_tenant
  ON service_split_rules(tenant_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_service_split_rules_service
  ON service_split_rules(service_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_service_split_rules_partner
  ON service_split_rules(partner_id) WHERE partner_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_service_split_rules_active
  ON service_split_rules(is_active) WHERE is_active = true;

-- Comment for documentation
COMMENT ON TABLE service_split_rules IS 'Payment split configuration per service. Radul always gets 0.5%, tenant configures division of remaining 99.5% between themselves and partner.';
COMMENT ON COLUMN service_split_rules.radul_percentage IS 'Platform fee (fixed at 0.5%, not configurable by tenant)';
COMMENT ON COLUMN service_split_rules.tenant_percentage IS 'Tenant percentage of transaction (0-99.5%, excludes Radul 0.5%)';
COMMENT ON COLUMN service_split_rules.partner_percentage IS 'Partner percentage of transaction (0-99.5%, excludes Radul 0.5%)';
