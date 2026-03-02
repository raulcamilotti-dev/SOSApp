-- Add PIX merchant fields to bank_accounts
-- These fields are required for PIX BRCode generation (EMV standard).
-- Previously stored in tenants.config.billing JSONB, now moved to bank_accounts
-- for a proper per-account PIX configuration.

ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS pix_merchant_name VARCHAR(25),
  ADD COLUMN IF NOT EXISTS pix_merchant_city VARCHAR(15);

COMMENT ON COLUMN bank_accounts.pix_merchant_name IS 'Merchant name for PIX BRCode (max 25 chars, EMV standard)';
COMMENT ON COLUMN bank_accounts.pix_merchant_city IS 'Merchant city for PIX BRCode (max 15 chars, EMV standard)';
