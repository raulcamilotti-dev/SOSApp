-- Migration: Document Templates & Generated Documents
-- Allows creating reusable document templates with variables,
-- then generating filled documents (HTML → PDF via n8n).

-- ─── document_templates ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  name          TEXT NOT NULL,                          -- "Contrato de Compra e Venda"
  description   TEXT,                                   -- short summary
  category      TEXT DEFAULT 'geral',                   -- geral, contrato, procuracao, declaracao …
  content_html  TEXT NOT NULL DEFAULT '',                -- full HTML body with {{variables}}
  variables     JSONB NOT NULL DEFAULT '[]',            -- [{ "key":"nome_cliente", "label":"Nome do Cliente", "type":"text", "source":"manual" }]
  header_html   TEXT DEFAULT '',                        -- optional header / letterhead
  footer_html   TEXT DEFAULT '',                        -- optional footer
  page_config   JSONB DEFAULT '{"size":"A4","orientation":"portrait","margins":{"top":20,"right":20,"bottom":20,"left":20}}',
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- ─── generated_documents ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  template_id     UUID REFERENCES document_templates(id),
  property_id     UUID REFERENCES properties(id),
  name            TEXT NOT NULL,                         -- "Contrato - João Silva - Rua X"
  filled_html     TEXT NOT NULL DEFAULT '',               -- final HTML after variable substitution
  variables_used  JSONB DEFAULT '{}',                     -- snapshot of filled variable values
  pdf_url         TEXT,                                   -- URL of generated PDF (drive/storage)
  pdf_base64      TEXT,                                   -- base64 of generated PDF (DB storage)
  status          TEXT DEFAULT 'draft',                   -- draft | generated | sent | signed
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_doc_templates_tenant ON document_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_templates_category ON document_templates(category);
CREATE INDEX IF NOT EXISTS idx_generated_docs_template ON generated_documents(template_id);
CREATE INDEX IF NOT EXISTS idx_generated_docs_property ON generated_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_generated_docs_tenant ON generated_documents(tenant_id);
