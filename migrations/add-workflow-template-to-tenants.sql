-- Add workflow_template_id to tenants table
-- Links a tenant to a specific workflow template so they see only that workflow's steps
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS workflow_template_id UUID REFERENCES workflow_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN tenants.workflow_template_id IS 'Workflow template assigned to this tenant; determines which steps they see';
