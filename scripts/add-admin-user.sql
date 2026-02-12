-- ============================================================
-- Script SQL para adicionar usuário admin com permissões full
-- CPF: 07745448999
-- Data: 2026-02-11
-- ============================================================

-- ============================================================
-- PASSO 1: Criar/verificar permissão admin.full
-- ============================================================

-- Inserir permissão admin.full se não existir
INSERT INTO permissions (code, description, created_at)
VALUES ('admin.full', 'Acesso total ao sistema', NOW())
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- PASSO 2: Encontrar ou criar tenant padrão
-- ============================================================

-- Criar tenant padrão se não existir
INSERT INTO tenants (company_name, plan, status, created_at)
VALUES ('SOS Escritura', 'enterprise', 'active', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- PASSO 3: Criar role admin (vinculado ao tenant)
-- ============================================================

-- Obter o ID do tenant (primeiro tenant ou o que você criou)
DO $$
DECLARE
    v_tenant_id UUID;
    v_role_id UUID;
    v_permission_id UUID;
    v_user_id UUID;
BEGIN
    -- Encontrar o tenant (primeiro ativo ou criar)
    SELECT id INTO v_tenant_id 
    FROM tenants 
    WHERE status = 'active' 
    LIMIT 1;

    -- Se não encontrou tenant, criar um
    IF v_tenant_id IS NULL THEN
        INSERT INTO tenants (company_name, plan, status, created_at)
        VALUES ('SOS Escritura', 'enterprise', 'active', NOW())
        RETURNING id INTO v_tenant_id;
    END IF;

    -- Criar role admin para este tenant (se não existir)
    INSERT INTO roles (tenant_id, name, created_at)
    VALUES (v_tenant_id, 'admin', NOW())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_role_id;

    -- Se o role já existia, buscar o ID
    IF v_role_id IS NULL THEN
        SELECT id INTO v_role_id
        FROM roles
        WHERE tenant_id = v_tenant_id AND name = 'admin'
        LIMIT 1;
    END IF;

    -- Buscar ID da permissão admin.full
    SELECT id INTO v_permission_id
    FROM permissions
    WHERE code = 'admin.full'
    LIMIT 1;

    -- Vincular role à permissão admin.full
    IF v_role_id IS NOT NULL AND v_permission_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_role_id, v_permission_id)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ============================================================
    -- PASSO 4: Encontrar usuário por CPF
    -- ============================================================

    -- Buscar usuário pelo CPF
    SELECT id INTO v_user_id
    FROM users
    WHERE cpf = '07745448999'
    LIMIT 1;

    -- Se o usuário não existe, você precisa criá-lo primeiro
    -- (ajuste os dados conforme necessário)
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'ATENÇÃO: Usuário com CPF 07745448999 não encontrado!';
        RAISE NOTICE 'Execute este INSERT antes do script:';
        RAISE NOTICE 'INSERT INTO users (cpf, email, fullname, created_at) VALUES';
        RAISE NOTICE '(''07745448999'', ''seu@email.com'', ''Seu Nome'', NOW());';
    ELSE
        -- ============================================================
        -- PASSO 5: Vincular usuário ao tenant com role admin
        -- ============================================================

        INSERT INTO user_tenants (user_id, tenant_id, role_id, is_active, created_at)
        VALUES (v_user_id, v_tenant_id, v_role_id, true, NOW())
        ON CONFLICT DO NOTHING;

        RAISE NOTICE 'Sucesso! Usuário % vinculado ao tenant % com role admin (permissão admin.full)', v_user_id, v_tenant_id;
    END IF;

END $$;

-- ============================================================
-- VERIFICAÇÃO: Consultar o que foi criado
-- ============================================================

-- Verificar permissões do usuário
SELECT 
    u.id as user_id,
    u.cpf,
    u.fullname,
    u.email,
    t.company_name as tenant,
    r.name as role,
    p.code as permission
FROM users u
LEFT JOIN user_tenants ut ON u.id = ut.user_id
LEFT JOIN tenants t ON ut.tenant_id = t.id
LEFT JOIN roles r ON ut.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
WHERE u.cpf = '07745448999';
