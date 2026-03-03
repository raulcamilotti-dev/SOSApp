-- B.2 Revenue Share Engine — Migration
-- 1. Adds builder_share_percent to marketplace_packs (configurable per pack)
-- 2. Creates revenue_shares table for tracking payment splits

-- ─── marketplace_packs: configurable split ───────────────────────────
ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS
    builder_share_percent NUMERIC(5,2) DEFAULT 70.00;

-- ─── revenue_shares table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revenue_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
    install_id UUID NOT NULL REFERENCES marketplace_installs(id),
    invoice_id UUID REFERENCES invoices(id),
    payment_id UUID REFERENCES payments(id),

    -- Amounts
    gross_amount NUMERIC(12,2) NOT NULL,
    builder_share_percent NUMERIC(5,2) NOT NULL,
    radul_share_percent NUMERIC(5,2) NOT NULL,
    builder_amount NUMERIC(12,2) NOT NULL,
    radul_amount NUMERIC(12,2) NOT NULL,

    -- Builder info
    builder_id UUID NOT NULL REFERENCES users(id),
    builder_tenant_id UUID REFERENCES tenants(id),

    -- Status: pending → processed → paid
    status VARCHAR(20) DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    payout_reference TEXT,

    -- Period (for monthly packs)
    period_start DATE,
    period_end DATE,

    -- Notes (extra metadata for debugging/audit)
    notes JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_rs_builder ON revenue_shares(builder_id);
CREATE INDEX IF NOT EXISTS idx_rs_pack ON revenue_shares(pack_id);
CREATE INDEX IF NOT EXISTS idx_rs_status ON revenue_shares(status);
CREATE INDEX IF NOT EXISTS idx_rs_builder_status ON revenue_shares(builder_id, status);
