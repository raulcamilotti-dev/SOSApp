-- ================================================================
-- ENTITY BUILDER — Dynamic Entity Definitions & Records
-- ================================================================
-- Adds two tables that enable tenant admins to create custom entities
-- (e.g., "Prontuário", "Ficha Técnica", "Controle de Qualidade")
-- without requiring code changes or schema migrations.
--
-- Works together with custom_field_definitions (EAV fields) where
-- target_table = 'entity::<ref_key>' links fields to an entity.
--
-- Execution: run via api_dinamico endpoint
-- ================================================================

-- 1. Entity Definitions — metadata about each custom entity
CREATE TABLE IF NOT EXISTS entity_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    ref_key         VARCHAR(100) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    name_plural     VARCHAR(200),
    description     TEXT,
    icon            VARCHAR(100) DEFAULT 'document-outline',
    -- Parent entity: records can be linked to a row in another table
    -- e.g., parent_table = 'customers' means each record belongs to a customer
    parent_table    VARCHAR(100),
    parent_label    VARCHAR(200),
    -- System flag: prevents tenant from deleting built-in entities
    is_system       BOOLEAN DEFAULT false,
    -- Module grouping for navigation filtering
    module_key      VARCHAR(50) DEFAULT 'core',
    -- Flexible config (future: permissions, layout, default_sort, etc.)
    config          JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE(tenant_id, ref_key)
);

-- 2. Entity Records — actual data rows for custom entities (JSONB store)
CREATE TABLE IF NOT EXISTS entity_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    entity_definition_id    UUID NOT NULL REFERENCES entity_definitions(id),
    -- Optional FK to a parent record (e.g., customer_id when parent_table = 'customers')
    parent_record_id        UUID,
    -- All field values stored as JSONB keyed by field_key
    data                    JSONB DEFAULT '{}',
    created_by              UUID,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);

-- ================================================================
-- INDEXES
-- ================================================================

-- Entity definitions: tenant lookup (active only)
CREATE INDEX IF NOT EXISTS idx_ed_tenant
    ON entity_definitions(tenant_id)
    WHERE deleted_at IS NULL;

-- Entity definitions: ref_key lookup
CREATE INDEX IF NOT EXISTS idx_ed_ref_key
    ON entity_definitions(tenant_id, ref_key)
    WHERE deleted_at IS NULL;

-- Entity records: by entity definition (list records of an entity)
CREATE INDEX IF NOT EXISTS idx_er_entity
    ON entity_records(entity_definition_id)
    WHERE deleted_at IS NULL;

-- Entity records: by parent record (e.g., all prontuários of a customer)
CREATE INDEX IF NOT EXISTS idx_er_parent
    ON entity_records(parent_record_id)
    WHERE deleted_at IS NULL;

-- Entity records: tenant lookup
CREATE INDEX IF NOT EXISTS idx_er_tenant
    ON entity_records(tenant_id)
    WHERE deleted_at IS NULL;

-- Entity records: GIN index on data JSONB for flexible queries
CREATE INDEX IF NOT EXISTS idx_er_data_gin
    ON entity_records USING GIN (data);
