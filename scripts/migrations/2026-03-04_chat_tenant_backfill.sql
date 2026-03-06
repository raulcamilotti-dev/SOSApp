-- 2026-03-04_chat_tenant_backfill.sql
-- Objetivo:
-- 1) adicionar tenant_id nas tabelas de atendimento/chat que ainda não tinham
-- 2) backfill dos registros atuais para o tenant da SOS Escritura
-- 3) deixar índices prontos para consultas por tenant + sessão
--
-- Premissa informada: as mensagens existentes pertencem ao tenant SOS Escritura.
-- Tenant SOS Escritura:
--   0999d528-0114-4399-a582-41d4ea96801f

BEGIN;

-- 1) Novas colunas tenant_id
ALTER TABLE public.n8n_chat_histories
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.buffer_mensagens_manuais
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.controle_atendimento
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 2) Índices de performance para escopo multi-tenant
CREATE INDEX IF NOT EXISTS idx_n8n_chat_histories_tenant
  ON public.n8n_chat_histories (tenant_id);

CREATE INDEX IF NOT EXISTS idx_n8n_chat_histories_tenant_session_update
  ON public.n8n_chat_histories (tenant_id, session_id, update_message DESC);

CREATE INDEX IF NOT EXISTS idx_buffer_mensagens_manuais_tenant
  ON public.buffer_mensagens_manuais (tenant_id);

CREATE INDEX IF NOT EXISTS idx_buffer_mensagens_manuais_tenant_session_created
  ON public.buffer_mensagens_manuais (tenant_id, session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_controle_atendimento_tenant
  ON public.controle_atendimento (tenant_id);

CREATE INDEX IF NOT EXISTS idx_controle_atendimento_tenant_session
  ON public.controle_atendimento (tenant_id, session_id);

-- 3) Backfill de whatsapp_contacts sem tenant (apoio para vínculo por sessão)
UPDATE public.whatsapp_contacts
SET tenant_id = '0999d528-0114-4399-a582-41d4ea96801f'::uuid
WHERE tenant_id IS NULL;

-- 4) Backfill n8n_chat_histories via whatsapp_contacts
UPDATE public.n8n_chat_histories h
SET tenant_id = w.tenant_id
FROM public.whatsapp_contacts w
WHERE h.tenant_id IS NULL
  AND w.tenant_id IS NOT NULL
  AND w.telefone_wa = h.session_id;

-- fallback final: qualquer histórico sem match vai para SOS Escritura
UPDATE public.n8n_chat_histories
SET tenant_id = '0999d528-0114-4399-a582-41d4ea96801f'::uuid
WHERE tenant_id IS NULL;

-- 5) Backfill buffer_mensagens_manuais via whatsapp_contacts
UPDATE public.buffer_mensagens_manuais b
SET tenant_id = w.tenant_id
FROM public.whatsapp_contacts w
WHERE b.tenant_id IS NULL
  AND w.tenant_id IS NOT NULL
  AND w.telefone_wa = b.session_id;

-- fallback final: qualquer buffer sem match vai para SOS Escritura
UPDATE public.buffer_mensagens_manuais
SET tenant_id = '0999d528-0114-4399-a582-41d4ea96801f'::uuid
WHERE tenant_id IS NULL;

-- 6) Backfill controle_atendimento por sessão
UPDATE public.controle_atendimento c
SET tenant_id = COALESCE(
  (SELECT w.tenant_id FROM public.whatsapp_contacts w WHERE w.telefone_wa = c.session_id AND w.tenant_id IS NOT NULL LIMIT 1),
  (SELECT h.tenant_id FROM public.n8n_chat_histories h WHERE h.session_id = c.session_id AND h.tenant_id IS NOT NULL LIMIT 1),
  (SELECT b.tenant_id FROM public.buffer_mensagens_manuais b WHERE b.session_id = c.session_id AND b.tenant_id IS NOT NULL LIMIT 1),
  '0999d528-0114-4399-a582-41d4ea96801f'::uuid
)
WHERE c.tenant_id IS NULL;

COMMIT;

-- Opcional (executar apenas após atualizar os fluxos n8n para gravar tenant_id):
-- ALTER TABLE public.n8n_chat_histories ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.buffer_mensagens_manuais ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.controle_atendimento ALTER COLUMN tenant_id SET NOT NULL;
