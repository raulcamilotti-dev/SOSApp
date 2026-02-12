-- Migração: Adicionar role_id como foreign key na tabela users
-- Data: 2026-02-11
-- Descrição: Vincula users à tabela roles através de role_id
-- Mantém coluna role para compatibilidade retroativa

-- 1. Adiciona a coluna role_id (nullable inicialmente para dados históricos)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID;

-- 2. Adiciona comentário descritivo
COMMENT ON COLUMN users.role_id IS 'Foreign key para a role do usuário';

-- 3. Migra dados existentes de role (texto) para role_id
-- Estratégia: faz match entre role text (case-insensitive) e role name
-- Para "admin", seleciona a primeira role admin disponível
-- Para "client", seleciona a role client disponível

-- Criar tabela temporária para mapping
CREATE TEMP TABLE role_mapping AS
SELECT DISTINCT LOWER(users.role) as user_role_text, roles.id as role_id
FROM users
CROSS JOIN LATERAL (
  SELECT id 
  FROM roles 
  WHERE LOWER(roles.name) = LOWER(users.role)
    AND roles.deleted_at IS NULL
  ORDER BY roles.created_at ASC
  LIMIT 1
) roles
WHERE users.role IS NOT NULL
  AND users.deleted_at IS NULL;

-- Aplicar mapping
UPDATE users
SET role_id = role_mapping.role_id
FROM role_mapping
WHERE LOWER(users.role) = role_mapping.user_role_text
  AND users.role_id IS NULL
  AND users.deleted_at IS NULL;

-- Log: Exibir resultado
SELECT 'Role migration completed' as status, COUNT(*) as users_updated FROM users WHERE role_id IS NOT NULL;

-- 4. Cria índice para performance
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- 5. Adiciona foreign key (com ON DELETE SET NULL para manter histórico)
ALTER TABLE users 
ADD CONSTRAINT fk_users_role_id 
FOREIGN KEY (role_id) 
REFERENCES roles(id) 
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Verificação final (descomentar para debug)
-- SELECT 
--   email, 
--   fullname, 
--   users.role as role_text, 
--   role_id,
--   COALESCE(roles.name, 'ORPHANED') as role_name
-- FROM users
-- LEFT JOIN roles ON users.role_id = roles.id
-- WHERE users.deleted_at IS NULL
-- ORDER BY users.created_at DESC;
