-- Migration: Add deleted_at to tenant_modules
-- Reason: tenant_modules was missing deleted_at column, causing pack-export
--         to fail when using autoExcludeDeleted (adds WHERE "deleted_at" IS NULL)
-- Date: 2026-02-XX

ALTER TABLE tenant_modules
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- Verify
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'tenant_modules'
   AND column_name = 'deleted_at';
