-- Migration: Add display_name column to permissions table
-- Adds user-friendly display names for permissions

-- Add column if not exists
ALTER TABLE permissions 
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

-- Populate display_names with friendly names
UPDATE permissions SET display_name = 'Acesso Total - Admin' WHERE code = 'admin.full';
UPDATE permissions SET display_name = 'Ler Clientes' WHERE code = 'customer.read';
UPDATE permissions SET display_name = 'Escrever Clientes' WHERE code = 'customer.write';
UPDATE permissions SET display_name = 'Deletar Clientes' WHERE code = 'customer.delete';
UPDATE permissions SET display_name = 'Ler Documentos' WHERE code = 'document.read';
UPDATE permissions SET display_name = 'Escrever Documentos' WHERE code = 'document.write';
UPDATE permissions SET display_name = 'Ler Projetos' WHERE code = 'project.read';
UPDATE permissions SET display_name = 'Escrever Projetos' WHERE code = 'project.write';
UPDATE permissions SET display_name = 'Ler Tarefas' WHERE code = 'task.read';
UPDATE permissions SET display_name = 'Escrever Tarefas' WHERE code = 'task.write';
UPDATE permissions SET display_name = 'Ler Usuários' WHERE code = 'user.read';
UPDATE permissions SET display_name = 'Escrever Usuários' WHERE code = 'user.write';
UPDATE permissions SET display_name = 'Deletar Usuários' WHERE code = 'user.delete';
UPDATE permissions SET display_name = 'Gerenciar Roles' WHERE code = 'role.manage';
UPDATE permissions SET display_name = 'Gerenciar Permissões' WHERE code = 'permission.manage';
UPDATE permissions SET display_name = 'Gerenciar Tenants' WHERE code = 'tenant.manage';
UPDATE permissions SET display_name = 'Gerenciar Automações' WHERE code = 'automation.manage';
UPDATE permissions SET display_name = 'Gerenciar Agentes' WHERE code = 'agent.manage';
UPDATE permissions SET display_name = 'Gerenciar Workflows' WHERE code = 'workflow.manage';

-- For any permission without a display_name yet, use a formatted version of the code
UPDATE permissions 
SET display_name = CONCAT(UPPER(SUBSTRING(code, 1, 1)), LOWER(SUBSTRING(code FROM 2)))
WHERE display_name IS NULL;

-- Verify the changes
SELECT code, display_name 
FROM permissions 
ORDER BY code;
