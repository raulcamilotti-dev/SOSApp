-- Migration: tenant_modules
-- Fase 0 — Sistema de módulos opt-in por tenant

CREATE TABLE IF NOT EXISTS tenant_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, module_key)
);

-- Index for fast lookup by tenant
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_id ON tenant_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_lookup ON tenant_modules(tenant_id, module_key, enabled);

-- Insert core module for all existing tenants (always enabled)
INSERT INTO tenant_modules (tenant_id, module_key, enabled)
SELECT id, 'core', true FROM tenants
ON CONFLICT (tenant_id, module_key) DO NOTHING;

-- Insert default modules for all existing tenants
INSERT INTO tenant_modules (tenant_id, module_key, enabled)
SELECT t.id, m.key, true
FROM tenants t
CROSS JOIN (VALUES
  ('partners'),
  ('documents'),
  ('onr_cartorio'),
  ('ai_automation'),
  ('bi_analytics')
) AS m(key)
ON CONFLICT (tenant_id, module_key) DO NOTHING;
