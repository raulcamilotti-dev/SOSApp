-- Migration: Add PIX default columns to tenants and partners
-- Purpose: Allow tenants and partners to store their default PIX key 
--          directly as columns (not buried in config JSONB)
-- Run via: api_dinamico

-- =============================================
-- TENANTS: add pix_key, pix_key_type, pix_merchant_name, pix_merchant_city
-- =============================================

-- 1. PIX key (CNPJ, CPF, email, phone, or random key)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pix_key TEXT;

-- 2. PIX key type: cpf, cnpj, email, phone, evp (random)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pix_key_type TEXT DEFAULT 'cnpj';

-- 3. Merchant name for PIX payload (max 25 chars per BACEN spec)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pix_merchant_name TEXT;

-- 4. Merchant city for PIX payload (max 15 chars per BACEN spec)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pix_merchant_city TEXT;

-- =============================================
-- PARTNERS: add pix_merchant_name, pix_merchant_city (pix_key + pix_key_type already exist)
-- =============================================

-- 5. Merchant name for partner PIX (already has pix_key + pix_key_type)
ALTER TABLE partners ADD COLUMN IF NOT EXISTS pix_merchant_name TEXT;

-- 6. Merchant city for partner PIX
ALTER TABLE partners ADD COLUMN IF NOT EXISTS pix_merchant_city TEXT;

-- =============================================
-- SEED: Set Radul tenant PIX from config.billing
-- =============================================

-- 7. Copy Radul's PIX data from config JSONB to direct columns
UPDATE tenants 
SET pix_key = config->'billing'->>'pix_key',
    pix_key_type = COALESCE(config->'billing'->>'pix_key_type', 'cnpj'),
    pix_merchant_name = COALESCE(config->'billing'->>'pix_merchant_name', company_name),
    pix_merchant_city = COALESCE(config->'billing'->>'pix_merchant_city', 'Curitiba')
WHERE slug = 'radul' 
  AND config->'billing'->>'pix_key' IS NOT NULL
  AND config->'billing'->>'pix_key' != '';
