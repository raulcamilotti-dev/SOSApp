-- 2026-02-18_tenant_unique_scope.sql
-- Purpose: enforce tenant-aware uniqueness for tenant-owned entities.
-- Execution target: api_dinamico (N8N webhook), not hardcoded app workarounds.

BEGIN;

-- =====================================================
-- CUSTOMERS
-- Previous state:
--   UNIQUE(cpf) and UNIQUE(phone) globally
-- New state:
--   UNIQUE(tenant_id, cpf) for active records
--   UNIQUE(tenant_id, phone) for active records
-- =====================================================
ALTER TABLE customers DROP CONSTRAINT IF EXISTS cpf_unique;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_key;
DROP INDEX IF EXISTS public.customers_phone_unique;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_cpf_active
  ON public.customers (tenant_id, cpf)
  WHERE deleted_at IS NULL
    AND tenant_id IS NOT NULL
    AND cpf IS NOT NULL
    AND btrim(cpf) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_phone_active
  ON public.customers (tenant_id, phone)
  WHERE deleted_at IS NULL
    AND tenant_id IS NOT NULL
    AND phone IS NOT NULL
    AND btrim(phone) <> '';

-- =====================================================
-- CALENDAR SYNC SETTINGS
-- Previous state:
--   UNIQUE(user_id) globally
-- New state:
--   UNIQUE(tenant_id, user_id) for active records
-- =====================================================
ALTER TABLE calendar_sync_settings
  DROP CONSTRAINT IF EXISTS calendar_sync_settings_user_id_key;
DROP INDEX IF EXISTS public.calendar_sync_settings_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_sync_settings_tenant_user_active
  ON public.calendar_sync_settings (tenant_id, user_id)
  WHERE deleted_at IS NULL
    AND tenant_id IS NOT NULL
    AND user_id IS NOT NULL;

COMMIT;
