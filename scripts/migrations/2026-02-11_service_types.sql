-- Create service_types table
CREATE TABLE IF NOT EXISTS public.service_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  color VARCHAR(7),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE
);

-- Create unique index for tenant_id and name (excluding soft-deleted records)
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_types_tenant_name_unique 
  ON service_types(tenant_id, name) WHERE deleted_at IS NULL;

-- Create index for tenant_id and soft delete
CREATE INDEX IF NOT EXISTS idx_service_types_tenant_id ON service_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_types_deleted_at ON service_types(deleted_at);
CREATE INDEX IF NOT EXISTS idx_service_types_is_active ON service_types(tenant_id, is_active);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_service_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_service_types_updated_at ON service_types;
CREATE TRIGGER trigger_service_types_updated_at
BEFORE UPDATE ON service_types
FOR EACH ROW
EXECUTE FUNCTION update_service_types_updated_at();

-- Add foreign key to services table linking to service_types
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_type_id UUID REFERENCES service_types(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_services_service_type_id ON services(service_type_id);
