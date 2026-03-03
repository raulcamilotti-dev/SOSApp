-- Migration: Custom Fields System (A.1)
-- Date: 2026-04-XX
-- Purpose: Allow tenants to define custom fields on any whitelisted table
--          without altering the database schema. Values stored in dedicated tables.
--
-- Architecture:
--   custom_field_definitions → schema of custom fields per tenant+table
--   custom_field_values      → actual values per record (target_id)
--
-- Pattern: Same JSONB + UUID pattern used across the platform.
--          IF NOT EXISTS for idempotency.

-- ══════════════════════════════════════════════════
-- CUSTOM FIELD DEFINITIONS
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Target: which table this field belongs to
    target_table VARCHAR(100) NOT NULL,         -- e.g. "customers", "service_orders", "leads"

    -- Field identity
    field_key VARCHAR(100) NOT NULL,            -- slug unique per tenant+table (e.g. "numero_oab")
    label VARCHAR(255) NOT NULL,                -- display label (e.g. "Número OAB")
    placeholder VARCHAR(255),                   -- input placeholder text

    -- Field type (matches CrudFieldType)
    -- text | multiline | number | currency | date | datetime | boolean | select
    -- email | phone | url | masked | reference | json
    field_type VARCHAR(20) NOT NULL DEFAULT 'text',

    -- Field behavior
    required BOOLEAN DEFAULT false,
    visible_in_list BOOLEAN DEFAULT true,
    visible_in_form BOOLEAN DEFAULT true,
    read_only BOOLEAN DEFAULT false,
    section VARCHAR(255),                       -- form section header
    sort_order INTEGER DEFAULT 0,               -- ordering within custom fields
    default_value TEXT,                          -- default value for new records

    -- Type-specific config
    options JSONB DEFAULT '[]',                 -- for type=select: [{"label":"X","value":"x"}, ...]
    validation_rules JSONB DEFAULT '{}',        -- future: {regex, min, max, minLength, maxLength}
    mask_type VARCHAR(20),                      -- for type=masked: cpf | cnpj | cep | phone | cpf_cnpj
    reference_config JSONB DEFAULT '{}',        -- for type=reference: {"table":"x","labelField":"name","idField":"id","searchField":"name"}

    -- Conditional visibility (v1: only between custom fields)
    -- Format: {"field":"field_key","operator":"equal","value":"xxx"}
    show_when JSONB,

    -- Pack system integration
    is_system BOOLEAN DEFAULT false,            -- true = created by template pack, not editable by tenant
    pack_ref_key VARCHAR(100),                  -- reference key for pack export/import

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Unique constraint: one field_key per tenant+table
    UNIQUE(tenant_id, target_table, field_key)
);

-- ══════════════════════════════════════════════════
-- CUSTOM FIELD VALUES
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS custom_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    definition_id UUID NOT NULL REFERENCES custom_field_definitions(id),

    -- Target: which record this value belongs to
    target_table VARCHAR(100) NOT NULL,         -- denormalized from definition for query perf
    target_id UUID NOT NULL,                    -- ID of the record in the target table

    -- Value storage
    value TEXT,                                 -- serialized value (string representation)
    value_json JSONB,                           -- for json/select-multi fields

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint: one value per definition+record
    UNIQUE(tenant_id, definition_id, target_id)
);

-- ══════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════

-- Lookup definitions by tenant + table (used by useCustomFields hook)
CREATE INDEX IF NOT EXISTS idx_cfd_tenant_table
    ON custom_field_definitions(tenant_id, target_table)
    WHERE deleted_at IS NULL;

-- Lookup values by tenant + table + record (batch load for CrudScreen list)
CREATE INDEX IF NOT EXISTS idx_cfv_target
    ON custom_field_values(tenant_id, target_table, target_id);

-- Lookup values by definition (for admin/reporting)
CREATE INDEX IF NOT EXISTS idx_cfv_definition
    ON custom_field_values(definition_id);

-- Lookup definitions by pack ref key (for pack import/export)
CREATE INDEX IF NOT EXISTS idx_cfd_pack_ref
    ON custom_field_definitions(tenant_id, pack_ref_key)
    WHERE pack_ref_key IS NOT NULL;
