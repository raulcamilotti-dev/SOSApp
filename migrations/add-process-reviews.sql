-- ============================================================
-- Migration: process_reviews
-- Fase 1.4 — Avaliação pública de processos concluídos
--
-- Diferente de service_reviews (marketplace/parceiros),
-- esta tabela captura feedback do cliente sobre o processo
-- via portal público, sem necessidade de login.
-- ============================================================

CREATE TABLE IF NOT EXISTS process_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL,
  customer_id     UUID,
  token           VARCHAR(64),
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- One review per service order
CREATE UNIQUE INDEX IF NOT EXISTS uq_process_reviews_order
  ON process_reviews(service_order_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_process_reviews_tenant
  ON process_reviews(tenant_id) WHERE deleted_at IS NULL;
