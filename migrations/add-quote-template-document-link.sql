-- Migration: Add document_template_id to quote_templates
-- Purpose: Link quote templates to document templates for PDF/document rendering.
-- When a marketplace quote is created from a quote_template, the document_template_id
-- is copied to quotes.template_id (FK to document_templates) for document generation.

-- Check if column already exists before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quote_templates'
      AND column_name = 'document_template_id'
  ) THEN
    ALTER TABLE quote_templates
      ADD COLUMN document_template_id UUID REFERENCES document_templates(id);
  END IF;
END $$;
