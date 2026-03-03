-- ================================================================
-- Migration: API Keys for Public REST API v1
-- Date: 2026-04-15
-- Description: Creates api_keys table for tenant-scoped API key
--              authentication on the public /v1/* endpoints.
--              Rate limiting is handled via Cloudflare KV (not DB).
-- ================================================================

-- 1. Check if table already exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'api_keys') THEN
        RAISE NOTICE 'Table api_keys already exists — skipping creation';
    ELSE
        CREATE TABLE api_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            name VARCHAR(255) NOT NULL,                        -- "Integração Omie", "Webhook ERP"
            key_hash VARCHAR(255) NOT NULL,                    -- HMAC-SHA256 hash (hex) — never store plaintext
            key_prefix VARCHAR(20) NOT NULL,                   -- "rk_live_aBcDeFgH" for visual identification
            environment VARCHAR(10) NOT NULL DEFAULT 'live',   -- 'live' | 'test'
            scopes JSONB NOT NULL DEFAULT '["read"]',          -- ["read", "write", "delete"]
            allowed_tables JSONB DEFAULT '[]',                 -- [] = default whitelist, ["customers","invoices"]
            rate_limit_per_minute INTEGER DEFAULT 60,
            last_used_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ,                            -- null = never expires
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by UUID REFERENCES users(id),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            deleted_at TIMESTAMPTZ,
            UNIQUE(key_prefix)
        );

        -- Indexes for fast lookup
        CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
        CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
        CREATE INDEX idx_api_keys_active ON api_keys(tenant_id, is_active) WHERE deleted_at IS NULL;

        RAISE NOTICE 'Table api_keys created successfully';
    END IF;
END $$;
