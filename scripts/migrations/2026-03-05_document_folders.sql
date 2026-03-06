-- ============================================================================
-- Document folders for Biblioteca de Documentos
-- Adds folder organization on generated_documents
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  color text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER trg_document_folders_updated_at
BEFORE UPDATE ON document_folders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE generated_documents
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES document_folders(id);

CREATE INDEX IF NOT EXISTS idx_document_folders_tenant_name
  ON document_folders (tenant_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_generated_documents_tenant_folder
  ON generated_documents (tenant_id, folder_id)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_document_folders_tenant_name_active'
  ) THEN
    CREATE UNIQUE INDEX uq_document_folders_tenant_name_active
      ON document_folders (tenant_id, lower(name))
      WHERE deleted_at IS NULL;
  END IF;
END$$;

COMMIT;

