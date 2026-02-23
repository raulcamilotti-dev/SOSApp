-- ============================================================================
-- Migration: Generic Service Orders Engine
-- Date: 2026-02-16
-- Description: Creates service_orders as the central process entity,
--              replacing properties as the workflow anchor.
--              Migrates existing property process data to new structure.
-- ============================================================================

-- ─── 1. CREATE service_orders ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  customer_id     UUID REFERENCES customers(id),
  service_type_id UUID NOT NULL REFERENCES service_types(id),
  service_id      UUID REFERENCES services(id),
  appointment_id  UUID REFERENCES service_appointments(id),
  template_id     UUID REFERENCES workflow_templates(id),
  current_step_id UUID REFERENCES workflow_steps(id),
  process_status  VARCHAR(50) DEFAULT 'active',
  title           TEXT NOT NULL,
  description     TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_orders_tenant ON service_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_customer ON service_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_service_type ON service_orders(service_type_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_template ON service_orders(template_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_current_step ON service_orders(current_step_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(process_status);
CREATE INDEX IF NOT EXISTS idx_service_orders_appointment ON service_orders(appointment_id);

-- ─── 2. CREATE service_order_context (polymorphic) ──────────────────────────
CREATE TABLE IF NOT EXISTS service_order_context (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  entity_type      VARCHAR(100) NOT NULL,
  entity_id        UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_soc_order ON service_order_context(service_order_id);
CREATE INDEX IF NOT EXISTS idx_soc_entity ON service_order_context(entity_type, entity_id);

-- ─── 3. CREATE process_updates (replaces property_process_updates) ──────────
CREATE TABLE IF NOT EXISTS process_updates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id  UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  title             VARCHAR(500) NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  created_by        UUID,
  is_client_visible BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_process_updates_order ON process_updates(service_order_id);

-- ─── 4. CREATE process_update_files (replaces property_process_update_files) ─
CREATE TABLE IF NOT EXISTS process_update_files (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_update_id     UUID NOT NULL REFERENCES process_updates(id) ON DELETE CASCADE,
  file_name             VARCHAR(500) NOT NULL,
  description           TEXT,
  mime_type             VARCHAR(255),
  file_size             BIGINT,
  file_data             TEXT,
  storage_type          VARCHAR(50) DEFAULT 'database',
  drive_file_id         VARCHAR(500),
  drive_web_view_link   TEXT,
  drive_web_content_link TEXT,
  is_client_visible     BOOLEAN NOT NULL DEFAULT true,
  include_in_protocol   BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_puf_update ON process_update_files(process_update_id);

-- ─── 5. ALTER workflow_templates: add service_type_id + tenant_id ────────────
ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS service_type_id UUID REFERENCES service_types(id),
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- ─── 6. ALTER tasks: add service_order_id ───────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES service_orders(id);

-- ─── 7. ALTER process_deadlines: add service_order_id ───────────────────────
ALTER TABLE process_deadlines
  ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES service_orders(id);

-- ─── 8. ALTER process_document_requests: add service_order_id + process_update_id
ALTER TABLE process_document_requests
  ADD COLUMN IF NOT EXISTS service_order_id UUID,
  ADD COLUMN IF NOT EXISTS process_update_id UUID;

-- Done: DDL complete
SELECT 'DDL migration completed successfully' AS result;
