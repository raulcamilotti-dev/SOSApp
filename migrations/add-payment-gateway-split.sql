-- ================================================================
-- MIGRATION: Add Payment Gateway & Split Configuration
-- Created: 2026-02-24
-- Purpose: Add credit card gateway support + flexible split payment
-- ================================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Extend payments table with gateway columns
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Gateway provider identifier (mercadopago, stripe, pagseguro, mock, etc.)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS gateway_provider VARCHAR(50);

-- External transaction ID from gateway (for reconciliation)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(255);

-- Full gateway response (for debugging/audit)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS gateway_response JSONB;

-- Gateway metadata (card_brand, last_4_digits, installments, etc.)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS gateway_metadata JSONB;

-- Context of payment (marketplace, plan_subscription, process_charge)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS payment_context VARCHAR(50);

-- Reference ID for context (service_id, subscription_id, service_order_id)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS context_reference_id UUID;

-- Payment installments (1 = à vista, 2-12 = parcelado)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS installments INTEGER DEFAULT 1;

-- URL for webhook callback from gateway
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_gateway_transaction 
ON payments(gateway_transaction_id) WHERE gateway_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_context 
ON payments(payment_context, context_reference_id) WHERE payment_context IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_gateway_provider 
ON payments(gateway_provider) WHERE gateway_provider IS NOT NULL;

COMMENT ON COLUMN payments.gateway_provider IS 'Payment gateway: mercadopago, stripe, pagseguro, mock';
COMMENT ON COLUMN payments.gateway_transaction_id IS 'External transaction ID for reconciliation';
COMMENT ON COLUMN payments.gateway_response IS 'Full response from gateway API';
COMMENT ON COLUMN payments.gateway_metadata IS 'Card brand, last 4 digits, installments config';
COMMENT ON COLUMN payments.payment_context IS 'Context: marketplace, plan_subscription, process_charge';
COMMENT ON COLUMN payments.context_reference_id IS 'FK to context entity (service_id, subscription_id, etc)';
COMMENT ON COLUMN payments.installments IS 'Number of installments (1 = cash, 2-12 = installments)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Create payment_splits table (flexible distribution)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS payment_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Links
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id),
    
    -- Split recipient
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('radul', 'tenant', 'partner')),
    recipient_id UUID, -- NULL for radul, tenant_id for tenant, partner_id for partner
    
    -- Split amount
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    percentage NUMERIC(5, 2), -- Percentage of total (for reference/recalculation)
    
    -- Split status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    
    -- Gateway split data (for reconciliation with gateway's split feature)
    gateway_split_id VARCHAR(255), -- External split ID from gateway
    gateway_split_response JSONB,
    
    -- Transfer tracking
    transferred_at TIMESTAMP,
    transfer_reference VARCHAR(255), -- Bank transfer reference or gateway transfer ID
    
    -- Metadata
    notes TEXT,
    metadata JSONB,
    
    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_recipient CHECK (
        (recipient_type = 'radul' AND recipient_id IS NULL) OR
        (recipient_type != 'radul' AND recipient_id IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_splits_payment ON payment_splits(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_splits_recipient ON payment_splits(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_payment_splits_tenant ON payment_splits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_splits_status ON payment_splits(status);
CREATE INDEX IF NOT EXISTS idx_payment_splits_gateway ON payment_splits(gateway_split_id) WHERE gateway_split_id IS NOT NULL;

COMMENT ON TABLE payment_splits IS 'Flexible payment distribution between Radul, Tenant, and Partners';
COMMENT ON COLUMN payment_splits.recipient_type IS 'radul (platform), tenant (company), partner (professional)';
COMMENT ON COLUMN payment_splits.recipient_id IS 'NULL for radul, UUID for tenant/partner';
COMMENT ON COLUMN payment_splits.amount IS 'Split amount in BRL';
COMMENT ON COLUMN payment_splits.percentage IS 'Percentage of total payment (for reference)';
COMMENT ON COLUMN payment_splits.gateway_split_id IS 'External split ID from gateway API';
COMMENT ON COLUMN payment_splits.transferred_at IS 'When funds were transferred to recipient';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Create split_configurations table (reusable templates)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS split_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ownership
    tenant_id UUID REFERENCES tenants(id),
    
    -- Configuration identity
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Context rules (when this split applies)
    applies_to_context VARCHAR(50), -- marketplace, plan_subscription, process_charge, all
    applies_to_service_id UUID, -- NULL = all services, UUID = specific service
    applies_to_partner_id UUID, -- NULL = all partners, UUID = specific partner
    
    -- Split rules (JSONB array for flexibility)
    -- Example: [
    --   { "recipient_type": "radul", "percentage": 5, "fixed_amount": null },
    --   { "recipient_type": "tenant", "percentage": 70, "fixed_amount": null },
    --   { "recipient_type": "partner", "percentage": 25, "fixed_amount": null }
    -- ]
    split_rules JSONB NOT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Priority (higher number = higher priority when multiple configs match)
    priority INTEGER DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_split_configs_tenant ON split_configurations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_split_configs_context ON split_configurations(applies_to_context);
CREATE INDEX IF NOT EXISTS idx_split_configs_active ON split_configurations(is_active) WHERE is_active = true;

COMMENT ON TABLE split_configurations IS 'Reusable split templates by context (marketplace, plans, charges)';
COMMENT ON COLUMN split_configurations.applies_to_context IS 'marketplace, plan_subscription, process_charge, or all';
COMMENT ON COLUMN split_configurations.split_rules IS 'Array of split rules with recipient_type, percentage, fixed_amount';
COMMENT ON COLUMN split_configurations.priority IS 'Higher priority wins when multiple configs match';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. Create default Radul split configuration for plan subscriptions
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO split_configurations (
    name,
    description,
    applies_to_context,
    split_rules,
    is_active,
    priority
) VALUES (
    'Radul Platform Fee - Plan Subscriptions',
    'Platform receives 100% of plan subscription payments',
    'plan_subscription',
    '[{"recipient_type": "radul", "percentage": 100, "fixed_amount": null}]'::JSONB,
    true,
    100
) ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. Sample split configurations (can be customized per tenant)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Example: Marketplace with platform fee
INSERT INTO split_configurations (
    name,
    description,
    applies_to_context,
    split_rules,
    is_active,
    priority
) VALUES (
    'Default Marketplace Split',
    'Platform 5%, Tenant 95% for marketplace sales',
    'marketplace',
    '[
        {"recipient_type": "radul", "percentage": 5, "fixed_amount": null},
        {"recipient_type": "tenant", "percentage": 95, "fixed_amount": null}
    ]'::JSONB,
    false, -- Disabled by default, tenant activates if needed
    50
) ON CONFLICT DO NOTHING;

-- Example: Process charge with partner
INSERT INTO split_configurations (
    name,
    description,
    applies_to_context,
    split_rules,
    is_active,
    priority
) VALUES (
    'Process Charge with Partner',
    'Tenant 70%, Partner 30% for process charges with assigned partner',
    'process_charge',
    '[
        {"recipient_type": "tenant", "percentage": 70, "fixed_amount": null},
        {"recipient_type": "partner", "percentage": 30, "fixed_amount": null}
    ]'::JSONB,
    false, -- Disabled by default
    50
) ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. Add columns to invoices for gateway integration
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Link to payment gateway checkout session
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS checkout_url TEXT;

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS checkout_expires_at TIMESTAMP;

COMMENT ON COLUMN invoices.checkout_url IS 'Payment gateway checkout link for customer';
COMMENT ON COLUMN invoices.checkout_expires_at IS 'Checkout session expiration timestamp';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION COMPLETE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Verification query:
-- SELECT 
--     'payments' as table_name,
--     column_name,
--     data_type
-- FROM information_schema.columns
-- WHERE table_name = 'payments' 
--   AND column_name IN ('gateway_provider', 'gateway_transaction_id', 'payment_context', 'installments')
-- UNION ALL
-- SELECT 'payment_splits', column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'payment_splits'
-- ORDER BY table_name, column_name;
