-- ================================================================
-- Migration: Pack Marketplace MVP
-- Phase: A.5 (RADUL_DETAILED_ROADMAP.md)
-- Description: Tables for the Pack Marketplace — a browsable store
--              where tenants discover, install, and manage packs.
-- ================================================================

-- ── marketplace_packs ──────────────────────────────────────────
-- Each row is a published (or draft/pending) template pack that
-- any tenant can browse and install into their environment.

CREATE TABLE IF NOT EXISTS marketplace_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Builder info
    builder_id UUID NOT NULL REFERENCES users(id),
    builder_tenant_id UUID REFERENCES tenants(id),

    -- Pack identity
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    long_description TEXT,                            -- markdown
    icon VARCHAR(50) DEFAULT '📦',
    category VARCHAR(50) NOT NULL,                    -- juridico, saude, comercio, servicos, etc.
    tags JSONB DEFAULT '[]',                          -- ["advocacia","contratos","compliance"]

    -- Pack payload (the actual TemplatePack JSON)
    pack_data JSONB NOT NULL,
    agent_pack_data JSONB,                            -- AgentTemplatePack opcional

    -- Versioning & status
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',      -- draft | pending_review | published | rejected | archived
    rejection_reason TEXT,

    -- Pricing
    pricing_type VARCHAR(20) NOT NULL DEFAULT 'free', -- free | one_time | monthly
    price_cents INTEGER DEFAULT 0,                    -- centavos BRL

    -- Stats
    download_count INTEGER DEFAULT 0,
    rating_avg NUMERIC(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,

    -- Flags
    is_official BOOLEAN DEFAULT false,                -- packs do Radul

    -- Rich content
    preview_images JSONB DEFAULT '[]',                -- URLs de screenshots
    requirements JSONB DEFAULT '{}',                  -- { "modules": ["financial","crm"] }

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ── marketplace_installs ───────────────────────────────────────
-- Tracks which tenant installed which pack (and the version).

CREATE TABLE IF NOT EXISTS marketplace_installs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
    installed_version VARCHAR(20) NOT NULL,
    installed_by UUID REFERENCES users(id),
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    uninstalled_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',              -- active | uninstalled
    UNIQUE(tenant_id, pack_id)
);

-- ── Indexes ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_mp_category   ON marketplace_packs(category)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mp_status     ON marketplace_packs(status)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mp_slug       ON marketplace_packs(slug)             WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mp_official   ON marketplace_packs(is_official)      WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX IF NOT EXISTS idx_mp_builder    ON marketplace_packs(builder_id)       WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mi_tenant     ON marketplace_installs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mi_pack       ON marketplace_installs(pack_id);
CREATE INDEX IF NOT EXISTS idx_mi_status     ON marketplace_installs(status);
