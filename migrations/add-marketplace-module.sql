-- Seed "marketplace" module for all existing tenants (enabled by default)
-- This ensures every tenant can access the Marketplace de Packs screens.
-- ON CONFLICT prevents duplicates if module was already seeded.

INSERT INTO tenant_modules (id, tenant_id, module_key, enabled, created_at, updated_at)
SELECT
  gen_random_uuid(),
  t.id,
  'marketplace',
  true,
  NOW(),
  NOW()
FROM tenants t
ON CONFLICT (tenant_id, module_key) DO NOTHING;
