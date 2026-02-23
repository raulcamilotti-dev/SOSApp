-- Migration: Add CNPJ lookup fields to companies table
-- These columns mirror the BrasilAPI / ReceitaWS CNPJ response
-- so that all consulted data is persisted on the company record.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS situacao_cadastral TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS data_situacao_cadastral TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS cnae_fiscal TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS cnae_fiscal_descricao TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS porte TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS natureza_juridica TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15,2);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS data_inicio_atividade TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS cnaes_secundarios JSONB;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS qsa JSONB;
