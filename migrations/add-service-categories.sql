-- Migration: Add service_categories table and link to service_types
-- Applied: 2026-02-17 via api_dinamico

-- 1. Create the service_categories table
CREATE TABLE IF NOT EXISTS service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#0a7ea4',
  icon VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP DEFAULT NULL
);

-- 2. Add category_id FK to service_types
ALTER TABLE service_types
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES service_categories(id);
