-- Migration: campaign_items
-- Conteúdos individuais de campanhas (posts, blogs, anúncios, vídeos, referrals, etc.)
-- Cada campanha pode ter N itens de conteúdo, cada um com seu status, métricas e agendamento.

CREATE TABLE IF NOT EXISTS campaign_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    campaign_id UUID NOT NULL REFERENCES campaigns(id),

    -- Tipo e plataforma
    item_type VARCHAR(30) NOT NULL DEFAULT 'post',
    -- item_type: 'post', 'blog', 'ad', 'video', 'reel', 'story', 'email', 'referral', 'evento', 'outro'
    platform VARCHAR(30) NOT NULL DEFAULT 'outro',
    -- platform: 'instagram', 'facebook', 'linkedin', 'google', 'youtube', 'tiktok', 'blog', 'whatsapp', 'email', 'outro'

    -- Conteúdo
    title VARCHAR(255) NOT NULL,
    content TEXT,                       -- texto do post, conteúdo do blog, copy do anúncio
    media_url TEXT,                     -- link para imagem/vídeo/arquivo
    target_url TEXT,                    -- URL de destino (CTA link)

    -- Status e agendamento
    status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    -- status: 'rascunho', 'agendado', 'publicado', 'arquivado'
    scheduled_at TIMESTAMP WITH TIME ZONE,  -- quando publicar
    published_at TIMESTAMP WITH TIME ZONE,  -- quando foi publicado
    published_url TEXT,                      -- link do conteúdo publicado (URL do post live)

    -- Métricas de performance
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    engagement INTEGER DEFAULT 0,     -- likes + comments + shares
    conversions INTEGER DEFAULT 0,
    reach INTEGER DEFAULT 0,
    cost NUMERIC(12,2) DEFAULT 0,     -- custo deste item específico (boost, ad spend)

    -- Extra
    notes JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_items_tenant ON campaign_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign ON campaign_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_items_status ON campaign_items(status);
CREATE INDEX IF NOT EXISTS idx_campaign_items_type ON campaign_items(item_type);
CREATE INDEX IF NOT EXISTS idx_campaign_items_scheduled ON campaign_items(scheduled_at) WHERE scheduled_at IS NOT NULL;
