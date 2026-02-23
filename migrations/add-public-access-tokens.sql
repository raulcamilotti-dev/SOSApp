-- ============================================================
-- Migration: public_access_tokens
-- Portal público para acompanhamento de serviços (Fase 1)
-- ============================================================

CREATE TABLE IF NOT EXISTS public_access_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           VARCHAR(64) NOT NULL UNIQUE,
  entity_type     VARCHAR(50) NOT NULL DEFAULT 'service_order',
  entity_id       UUID NOT NULL,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_revoked      BOOLEAN NOT NULL DEFAULT false,
  accessed_at     TIMESTAMPTZ,
  access_count    INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- ── Índices ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_public_access_tokens_token
  ON public_access_tokens(token) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_public_access_tokens_entity
  ON public_access_tokens(entity_type, entity_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_public_access_tokens_tenant
  ON public_access_tokens(tenant_id) WHERE deleted_at IS NULL;
