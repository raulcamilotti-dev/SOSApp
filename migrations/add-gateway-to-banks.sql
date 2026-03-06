-- ============================================================
-- Migration: Add payment gateway fields to banks & bank_accounts
-- Purpose: Generalize Asaas-specific config from tenants to
--          bank/bank_account level. Any payment gateway (Asaas,
--          MercadoPago, Stripe, PagSeguro) can now be configured
--          as a bank entry with per-account gateway settings.
-- ============================================================

-- 1. Banks: mark which entries are payment gateways
ALTER TABLE banks
  ADD COLUMN IF NOT EXISTS is_payment_gateway BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE banks
  ADD COLUMN IF NOT EXISTS gateway_provider VARCHAR(50);

-- Check constraint: gateway_provider must be a known provider (or null)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_banks_gateway_provider'
  ) THEN
    ALTER TABLE banks ADD CONSTRAINT chk_banks_gateway_provider
      CHECK (gateway_provider IS NULL OR gateway_provider IN (
        'asaas', 'mercadopago', 'stripe', 'pagseguro'
      ));
  END IF;
END $$;

COMMENT ON COLUMN banks.is_payment_gateway
  IS 'True when this bank entry represents a payment gateway provider (Asaas, MercadoPago, etc.)';
COMMENT ON COLUMN banks.gateway_provider
  IS 'Payment gateway provider key: asaas, mercadopago, stripe, pagseguro. Only set when is_payment_gateway=true.';


-- 2. Bank accounts: per-account gateway config + primary marker
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS gateway_config JSONB DEFAULT '{}';

ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS is_primary_gateway BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN bank_accounts.gateway_config
  IS 'Provider-specific settings JSONB. Asaas: {"wallet_id":"wal_..."}. MercadoPago: {"access_token":"...","public_key":"..."}. Stripe: {"publishable_key":"...","secret_key":"..."}. PagSeguro: {"token":"...","email":"..."}.';
COMMENT ON COLUMN bank_accounts.is_primary_gateway
  IS 'True = this account is the active/primary payment gateway for the tenant. Only one per tenant should be true.';

-- Unique partial index: only one primary gateway per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_primary_gateway_tenant
  ON bank_accounts (tenant_id)
  WHERE is_primary_gateway = true AND deleted_at IS NULL;


-- 3. Seed gateway banks for existing tenants that have asaas_wallet_id
-- This migrates existing Asaas config from tenants.asaas_wallet_id → bank_accounts.gateway_config
-- NOTE: Run this only once. It creates an "Asaas" bank + account for each tenant with config.
DO $$
DECLARE
  t RECORD;
  bank_id UUID;
  account_id UUID;
BEGIN
  FOR t IN
    SELECT id AS tenant_id, asaas_wallet_id,
           pix_key, pix_key_type, pix_merchant_name, pix_merchant_city
    FROM tenants
    WHERE asaas_wallet_id IS NOT NULL
      AND asaas_wallet_id != ''
      AND deleted_at IS NULL
  LOOP
    -- Check if this tenant already has an Asaas gateway bank
    SELECT b.id INTO bank_id
    FROM banks b
    WHERE b.tenant_id = t.tenant_id
      AND b.is_payment_gateway = true
      AND b.gateway_provider = 'asaas'
      AND b.deleted_at IS NULL
    LIMIT 1;

    IF bank_id IS NULL THEN
      -- Create the Asaas bank entry
      INSERT INTO banks (id, tenant_id, name, bank_code, is_payment_gateway, gateway_provider, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), t.tenant_id, 'Asaas', NULL, true, 'asaas', true, NOW(), NOW())
      RETURNING id INTO bank_id;
    END IF;

    -- Check if this tenant already has an Asaas gateway account
    SELECT ba.id INTO account_id
    FROM bank_accounts ba
    WHERE ba.bank_id = bank_id
      AND ba.tenant_id = t.tenant_id
      AND ba.is_primary_gateway = true
      AND ba.deleted_at IS NULL
    LIMIT 1;

    IF account_id IS NULL THEN
      -- Create the Asaas account with migrated config
      INSERT INTO bank_accounts (
        id, tenant_id, bank_id, account_name, account_type,
        pix_key, pix_key_type, pix_merchant_name, pix_merchant_city,
        gateway_config, is_primary_gateway, is_active,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), t.tenant_id, bank_id, 'Asaas Principal', 'payment',
        t.pix_key, t.pix_key_type, t.pix_merchant_name, t.pix_merchant_city,
        jsonb_build_object('wallet_id', t.asaas_wallet_id),
        true, true,
        NOW(), NOW()
      );
    END IF;
  END LOOP;
END $$;
