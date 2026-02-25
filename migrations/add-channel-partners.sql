-- ═══════════════════════════════════════════════════════════════════
-- CHANNEL PARTNERS SYSTEM — Sistema de Afiliados/Parceiros de Canal
-- ═══════════════════════════════════════════════════════════════════
-- 
-- Criado: 2026-02-24
-- 
-- Conceito:
-- - `partners` = Prestadores DENTRO do tenant (executam serviços)
-- - `channel_partners` = Indicadores EXTERNOS (trazem novos tenants)
-- 
-- Fluxo:
-- 1. Channel partner se cadastra e ganha código único (CONTADOR-JOAO-2026)
-- 2. Indica empresas via link ?ref=CONTADOR-JOAO-2026
-- 3. Empresa cria tenant → registro em channel_partner_referrals
-- 4. Empresa paga → comissão calculada automaticamente
-- 5. Channel partner vê dashboard de comissões
--
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 1. CHANNEL PARTNERS — Cadastro de parceiros de canal
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channel_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tipo de parceiro
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'accountant',      -- Contador
        'consultant',      -- Consultoria
        'agency',          -- Agência/Software House
        'influencer',      -- Influenciador
        'association',     -- CDL, ACE, Sebrae
        'reseller',        -- Revendedor
        'other'
    )),
    
    -- Dados do parceiro
    company_name VARCHAR(255),
    contact_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL UNIQUE,
    contact_phone VARCHAR(50),
    document_number VARCHAR(20),  -- CPF ou CNPJ
    
    -- Sistema de indicação
    referral_code VARCHAR(50) UNIQUE NOT NULL,  -- Ex: CONTADOR-JOAO-2026
    commission_rate NUMERIC(5,2) DEFAULT 20.00,  -- Percentual de comissão (padrão 20%)
    
    -- Status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN (
        'pending',    -- Aguardando aprovação
        'active',     -- Ativo e pode indicar
        'inactive',   -- Inativo temporariamente
        'suspended',  -- Suspenso por violação
        'churned'     -- Saiu do programa
    )),
    
    -- Dados bancários para pagamento
    bank_name VARCHAR(100),
    bank_account_type VARCHAR(20),  -- checking, savings
    bank_account_number VARCHAR(50),
    bank_agency VARCHAR(20),
    pix_key VARCHAR(255),
    pix_key_type VARCHAR(20),  -- cpf, cnpj, email, phone, random
    
    -- Configuração personalizada
    config JSONB DEFAULT '{}',  -- Branding, comissões customizadas, materiais, etc
    
    -- Metadata
    notes TEXT,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_channel_partners_type ON channel_partners(type);
CREATE INDEX idx_channel_partners_status ON channel_partners(status);
CREATE INDEX idx_channel_partners_referral_code ON channel_partners(referral_code);
CREATE INDEX idx_channel_partners_email ON channel_partners(contact_email);
CREATE INDEX idx_channel_partners_deleted ON channel_partners(deleted_at);

COMMENT ON TABLE channel_partners IS 'Parceiros de canal que indicam novos tenants e ganham comissão';
COMMENT ON COLUMN channel_partners.type IS 'Tipo de parceiro: contador, consultoria, agência, influencer, etc';
COMMENT ON COLUMN channel_partners.referral_code IS 'Código único de indicação (CONTADOR-JOAO-2026)';
COMMENT ON COLUMN channel_partners.commission_rate IS 'Percentual de comissão sobre MRR do tenant indicado';

-- ───────────────────────────────────────────────────────────────────
-- 2. CHANNEL PARTNER REFERRALS — Tracking de tenants indicados
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channel_partner_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relacionamentos
    channel_partner_id UUID NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Tracking
    referral_code VARCHAR(50) NOT NULL,  -- Código usado na indicação
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    
    -- Status do relacionamento
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',    -- Tenant criado mas não pagou ainda
        'active',     -- Tenant pagante ativo
        'churned',    -- Tenant cancelou
        'suspended'   -- Indicação suspensa (fraude, etc)
    )),
    
    -- Configuração de comissão (snapshot no momento da conversão)
    commission_rate NUMERIC(5,2) NOT NULL,  -- Taxa de comissão acordada
    commission_type VARCHAR(50) DEFAULT 'recurring' CHECK (commission_type IN (
        'recurring',  -- Comissão mensal recorrente
        'one_time',   -- Comissão única no primeiro pagamento
        'tiered'      -- Comissão com tiers diferentes
    )),
    
    -- Métricas financeiras
    first_payment_at TIMESTAMP,
    last_payment_at TIMESTAMP,
    total_months_paid INTEGER DEFAULT 0,
    total_paid NUMERIC(12,2) DEFAULT 0,  -- Total pago pelo tenant
    total_commission_earned NUMERIC(12,2) DEFAULT 0,  -- Total de comissão gerada
    total_commission_paid NUMERIC(12,2) DEFAULT 0,  -- Total de comissão já paga ao parceiro
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(tenant_id)  -- Cada tenant só pode ter 1 indicador
);

CREATE INDEX idx_channel_partner_referrals_partner ON channel_partner_referrals(channel_partner_id);
CREATE INDEX idx_channel_partner_referrals_tenant ON channel_partner_referrals(tenant_id);
CREATE INDEX idx_channel_partner_referrals_status ON channel_partner_referrals(status);
CREATE INDEX idx_channel_partner_referrals_code ON channel_partner_referrals(referral_code);

COMMENT ON TABLE channel_partner_referrals IS 'Tracking de tenants indicados por channel partners';
COMMENT ON COLUMN channel_partner_referrals.status IS 'pending = criou conta, active = pagando, churned = cancelou';
COMMENT ON COLUMN channel_partner_referrals.commission_rate IS 'Snapshot da taxa no momento da conversão';

-- ───────────────────────────────────────────────────────────────────
-- 3. CHANNEL PARTNER COMMISSIONS — Registro mensal de comissões
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channel_partner_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relacionamentos
    channel_partner_id UUID NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
    referral_id UUID NOT NULL REFERENCES channel_partner_referrals(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Período de referência
    month_reference VARCHAR(7) NOT NULL,  -- '2026-02' (YYYY-MM)
    
    -- Dados do plano do tenant naquele mês
    tenant_plan VARCHAR(50),  -- 'free', 'starter', 'growth', 'scale', 'enterprise'
    plan_amount NUMERIC(12,2),  -- Valor do plano naquele mês
    
    -- Cálculo da comissão
    commission_rate NUMERIC(5,2) NOT NULL,
    commission_amount NUMERIC(12,2) NOT NULL,  -- Valor calculado da comissão
    
    -- Status de pagamento
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',     -- Comissão calculada, aguardando pagamento
        'approved',    -- Aprovada para pagamento
        'paid',        -- Paga ao parceiro
        'cancelled',   -- Cancelada (tenant churned antes do pagamento)
        'disputed'     -- Em disputa
    )),
    
    -- Pagamento
    paid_at TIMESTAMP,
    paid_amount NUMERIC(12,2),
    payment_method VARCHAR(50),  -- pix, transfer, boleto
    payment_reference VARCHAR(255),  -- ID da transação
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(referral_id, month_reference)  -- 1 comissão por indicação por mês
);

CREATE INDEX idx_channel_partner_commissions_partner ON channel_partner_commissions(channel_partner_id);
CREATE INDEX idx_channel_partner_commissions_referral ON channel_partner_commissions(referral_id);
CREATE INDEX idx_channel_partner_commissions_month ON channel_partner_commissions(month_reference);
CREATE INDEX idx_channel_partner_commissions_status ON channel_partner_commissions(status);

COMMENT ON TABLE channel_partner_commissions IS 'Registro mensal de comissões geradas e pagas';
COMMENT ON COLUMN channel_partner_commissions.month_reference IS 'Mês de referência no formato YYYY-MM';
COMMENT ON COLUMN channel_partner_commissions.status IS 'pending, approved, paid, cancelled, disputed';

-- ───────────────────────────────────────────────────────────────────
-- 4. VIEWS — Dashboards consolidados
-- ───────────────────────────────────────────────────────────────────

-- Dashboard do channel partner (visão individual)
CREATE OR REPLACE VIEW channel_partner_dashboard AS
SELECT 
    cp.id AS channel_partner_id,
    cp.contact_name,
    cp.company_name,
    cp.type,
    cp.status,
    cp.commission_rate AS default_commission_rate,
    
    -- Contadores de referrals
    COUNT(DISTINCT cpr.id) AS total_referrals,
    COUNT(DISTINCT CASE WHEN cpr.status = 'active' THEN cpr.id END) AS active_referrals,
    COUNT(DISTINCT CASE WHEN cpr.status = 'pending' THEN cpr.id END) AS pending_referrals,
    COUNT(DISTINCT CASE WHEN cpr.status = 'churned' THEN cpr.id END) AS churned_referrals,
    
    -- Métricas financeiras
    COALESCE(SUM(cpr.total_commission_earned), 0) AS total_commission_earned,
    COALESCE(SUM(cpr.total_commission_paid), 0) AS total_commission_paid,
    COALESCE(SUM(cpr.total_commission_earned) - SUM(cpr.total_commission_paid), 0) AS commission_pending,
    
    -- Comissão mensal atual (soma das comissões ativas)
    COALESCE(SUM(
        CASE 
            WHEN cpr.status = 'active' AND t.config->>'billing'->>'current_plan' = 'starter' THEN 99 * (cpr.commission_rate / 100)
            WHEN cpr.status = 'active' AND t.config->>'billing'->>'current_plan' = 'growth' THEN 249 * (cpr.commission_rate / 100)
            WHEN cpr.status = 'active' AND t.config->>'billing'->>'current_plan' = 'scale' THEN 499 * (cpr.commission_rate / 100)
            ELSE 0
        END
    ), 0) AS monthly_recurring_commission,
    
    -- Datas
    MIN(cpr.created_at) AS first_referral_at,
    MAX(cpr.created_at) AS last_referral_at
    
FROM channel_partners cp
LEFT JOIN channel_partner_referrals cpr ON cp.id = cpr.channel_partner_id
LEFT JOIN tenants t ON cpr.tenant_id = t.id
WHERE cp.deleted_at IS NULL
GROUP BY cp.id, cp.contact_name, cp.company_name, cp.type, cp.status, cp.commission_rate;

COMMENT ON VIEW channel_partner_dashboard IS 'Dashboard consolidado por channel partner';

-- Dashboard global de comissões (admin)
CREATE OR REPLACE VIEW channel_commissions_summary AS
SELECT 
    DATE_TRUNC('month', cpc.created_at) AS month,
    COUNT(DISTINCT cpc.channel_partner_id) AS active_partners,
    COUNT(DISTINCT cpc.referral_id) AS paying_referrals,
    SUM(cpc.commission_amount) AS total_commission_generated,
    SUM(CASE WHEN cpc.status = 'paid' THEN cpc.paid_amount ELSE 0 END) AS total_commission_paid,
    SUM(CASE WHEN cpc.status = 'pending' THEN cpc.commission_amount ELSE 0 END) AS total_commission_pending
FROM channel_partner_commissions cpc
GROUP BY DATE_TRUNC('month', cpc.created_at)
ORDER BY month DESC;

COMMENT ON VIEW channel_commissions_summary IS 'Resumo global de comissões por mês';

-- ───────────────────────────────────────────────────────────────────
-- 5. TRIGGER — Auto-update de timestamps
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_channel_partners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_channel_partners_updated_at
    BEFORE UPDATE ON channel_partners
    FOR EACH ROW
    EXECUTE FUNCTION update_channel_partners_updated_at();

CREATE TRIGGER trigger_channel_partner_referrals_updated_at
    BEFORE UPDATE ON channel_partner_referrals
    FOR EACH ROW
    EXECUTE FUNCTION update_channel_partners_updated_at();

CREATE TRIGGER trigger_channel_partner_commissions_updated_at
    BEFORE UPDATE ON channel_partner_commissions
    FOR EACH ROW
    EXECUTE FUNCTION update_channel_partners_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- 6. SEED — Tipos de parceiros padrão (opcional)
-- ───────────────────────────────────────────────────────────────────

-- Exemplo de channel partner para testes (comentado por padrão)
-- INSERT INTO channel_partners (type, contact_name, contact_email, referral_code, commission_rate, status) 
-- VALUES 
-- ('accountant', 'João Silva', 'joao.contador@example.com', 'CONTADOR-JOAO-2026', 20.00, 'active'),
-- ('consultant', 'Maria Consulting', 'maria@consulting.com.br', 'CONSULTOR-MARIA-2026', 25.00, 'active'),
-- ('influencer', 'Paulo Negócios', 'paulo@influencer.com', 'INFLUENCER-PAULO-2026', 30.00, 'active');

-- ═══════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════
