-- Migration: Add foreign key constraint for tenant_id in roles table
-- This enables automatic reference field detection in CRUD screens

-- Add foreign key constraint
ALTER TABLE roles 
ADD CONSTRAINT fk_roles_tenant_id 
FOREIGN KEY (tenant_id) 
REFERENCES tenants(id) 
ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);
