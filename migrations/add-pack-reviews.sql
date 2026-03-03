-- Migration: Pack Reviews & Ratings (B.3)
-- Tenants can review packs they have installed. Builders can respond to reviews.
-- rating_avg / rating_count on marketplace_packs are recalculated inline in the service layer.

CREATE TABLE IF NOT EXISTS pack_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
    install_id UUID NOT NULL REFERENCES marketplace_installs(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    reviewer_id UUID NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(255),
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT true,
    helpful_count INTEGER DEFAULT 0,
    builder_response TEXT,
    builder_responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(install_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_pack_reviews_pack ON pack_reviews(pack_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pack_reviews_tenant ON pack_reviews(tenant_id) WHERE deleted_at IS NULL;

-- Add rating columns to marketplace_packs (use existing interface names)
ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) DEFAULT 0;
ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;
