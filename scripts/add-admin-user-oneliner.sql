-- ============================================================
-- Script SQL SUPER DIRETO - Cole direto no pgAdmin
-- CPF: 07745448999
-- ============================================================

-- Isso assume que:
-- 1. A tabela users já tem um registro com CPF 07745448999
-- 2. Você quer criar um novo tenant ou usar o primeiro disponível
-- ============================================================

WITH 
-- Criar permissão admin.full
new_permission AS (
    INSERT INTO permissions (code, description, created_at)
    VALUES ('admin.full', 'Acesso total ao sistema', NOW())
    ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
    RETURNING id as permission_id
),
-- Pegar ou criar tenant
tenant_data AS (
    SELECT id as tenant_id FROM tenants LIMIT 1
),
-- Criar role admin
new_role AS (
    INSERT INTO roles (tenant_id, name, created_at)
    SELECT tenant_id, 'admin', NOW() FROM tenant_data
    ON CONFLICT DO NOTHING
    RETURNING id as role_id
),
role_data AS (
    SELECT COALESCE(
        (SELECT role_id FROM new_role),
        (SELECT id FROM roles WHERE name = 'admin' AND tenant_id = (SELECT tenant_id FROM tenant_data) LIMIT 1)
    ) as role_id
),
-- Vincular role à permissão
role_perm AS (
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT role_id, permission_id FROM role_data, new_permission
    ON CONFLICT DO NOTHING
    RETURNING role_id
),
-- Pegar ID do usuário
user_data AS (
    SELECT id as user_id FROM users WHERE cpf = '07745448999' LIMIT 1
)
-- Vincular usuário ao tenant com role admin
INSERT INTO user_tenants (user_id, tenant_id, role_id, is_active, created_at)
SELECT user_id, tenant_id, role_id, true, NOW()
FROM user_data, tenant_data, role_data
ON CONFLICT DO NOTHING
RETURNING user_id, tenant_id, role_id;

-- Verificar
SELECT 
    u.cpf,
    u.fullname,
    u.email,
    t.company_name,
    r.name as role,
    STRING_AGG(p.code, ', ') as permissions
FROM users u
JOIN user_tenants ut ON u.id = ut.user_id
JOIN tenants t ON ut.tenant_id = t.id
JOIN roles r ON ut.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
WHERE u.cpf = '07745448999'
GROUP BY u.cpf, u.fullname, u.email, t.company_name, r.name;
