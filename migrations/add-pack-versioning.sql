-- Migration: Pack Versioning (B.5)
-- Allows builders to publish new versions and tenants to update installed packs.

CREATE TABLE IF NOT EXISTS marketplace_pack_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
    version VARCHAR(20) NOT NULL,
    pack_data JSONB NOT NULL,
    agent_pack_data JSONB,
    changelog TEXT,
    status VARCHAR(20) DEFAULT 'published',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pack_id, version)
);

CREATE INDEX IF NOT EXISTS idx_mpv_pack ON marketplace_pack_versions(pack_id);
