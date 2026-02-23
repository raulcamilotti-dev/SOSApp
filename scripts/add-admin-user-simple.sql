-- ============================================================
-- Script SQL SIMPLIFICADO para adicionar usuário admin
-- CPF: 07745448999
-- ============================================================
-- Use este se o script completo der erro ou se quiser fazer manualmente
-- ============================================================

-- 1. Criar permissão admin.full
INSERT INTO permissions (code, description)
VALUES ('admin.full', 'Acesso total ao sistema')
ON CONFLICT (code) DO NOTHING;

-- 2. Criar ou usar tenant existente (ajuste o ID se necessário)
-- Se você já tem um tenant, pegue o ID e use na variável abaixo

-- 3. Criar role admin
-- SUBSTITUA 'SEU_TENANT_ID' pelo ID do tenant que você quer usar
INSERT INTO roles (tenant_id, name)
VALUES ('SEU_TENANT_ID', 'admin')
RETURNING id; -- Anote este ID

-- 4. Vincular role à permissão
-- SUBSTITUA 'SEU_ROLE_ID' pelo ID retornado acima
-- SUBSTITUA 'SEU_PERMISSION_ID' pelo ID da permissão admin.full
INSERT INTO role_permissions (role_id, permission_id)
VALUES ('SEU_ROLE_ID', (SELECT id FROM permissions WHERE code = 'admin.full'))
ON CONFLICT DO NOTHING;

-- 5. Vincular seu usuário ao tenant com role admin
-- SUBSTITUA 'SEU_USER_ID' pelo ID do seu usuário
-- SUBSTITUA 'SEU_TENANT_ID' pelo ID do tenant
-- SUBSTITUA 'SEU_ROLE_ID' pelo ID do role admin criado
INSERT INTO user_tenants (user_id, tenant_id, role_id, is_active)
VALUES (
    (SELECT id FROM users WHERE cpf = '07745448999'),
    'SEU_TENANT_ID',
    'SEU_ROLE_ID',
    true
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================

-- Ver todas as permissões do seu usuário
SELECT 
    u.cpf,
    u.fullname,
    t.company_name as tenant,
    r.name as role,
    p.code as permission
FROM users u
JOIN user_tenants ut ON u.id = ut.user_id
JOIN tenants t ON ut.tenant_id = t.id
JOIN roles r ON ut.role_id = r.id
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
WHERE u.cpf = '07745448999';
