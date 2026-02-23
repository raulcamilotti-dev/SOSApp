-- ============================================================
-- Migration: Calendar Sync (iCal Feed)
-- Adiciona token de calendário ao usuário e tabela de preferências
-- ============================================================

-- 1) Token único por usuário para autenticar o feed iCal (sem JWT)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS calendar_token UUID DEFAULT gen_random_uuid() UNIQUE;

-- Gerar token para usuários existentes que ainda não têm
UPDATE users SET calendar_token = gen_random_uuid() WHERE calendar_token IS NULL;

-- 2) Preferências de sincronização do calendário
CREATE TABLE IF NOT EXISTS calendar_sync_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  
  -- O que sincronizar
  sync_appointments   BOOLEAN NOT NULL DEFAULT true,
  sync_tasks          BOOLEAN NOT NULL DEFAULT true,
  sync_deadlines      BOOLEAN NOT NULL DEFAULT true,
  
  -- Preferências de visualização
  default_reminder_minutes INTEGER NOT NULL DEFAULT 30,
  
  -- Controle
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_synced   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  
  UNIQUE(user_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_calendar_sync_user ON calendar_sync_settings(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_calendar_token ON users(calendar_token) WHERE calendar_token IS NOT NULL;

-- ============================================================
-- N8N Webhook: /webhook/calendar-feed
-- 
-- Este é o SQL que o endpoint N8N deve executar para gerar
-- os eventos do feed iCal. O endpoint recebe ?token=<uuid>
-- e retorna Content-Type: text/calendar
-- ============================================================

-- Query para buscar dados do feed (usar no N8N):
-- 
-- WITH user_info AS (
--   SELECT u.id, u.email, u.fullname, u.tenant_id, u.calendar_token,
--          cs.sync_appointments, cs.sync_tasks, cs.sync_deadlines,
--          cs.default_reminder_minutes
--   FROM users u
--   LEFT JOIN calendar_sync_settings cs ON cs.user_id = u.id AND cs.deleted_at IS NULL
--   WHERE u.calendar_token = '{{ $json.query.token }}'
--     AND u.deleted_at IS NULL
-- ),
-- appointments AS (
--   SELECT 
--     sa.id, sa.scheduled_start, sa.scheduled_end, sa.status, sa.notes,
--     'APPOINTMENT' as event_type,
--     COALESCE(sa.notes, 'Agendamento') as summary
--   FROM service_appointments sa
--   INNER JOIN user_info ui ON sa.tenant_id = ui.tenant_id
--   WHERE sa.created_by = ui.id
--     AND sa.deleted_at IS NULL
--     AND sa.status NOT IN ('cancelled')
--     AND ui.sync_appointments = true
-- ),
-- tasks AS (
--   SELECT 
--     t.id, 
--     t.start_date::timestamptz as scheduled_start, 
--     COALESCE(t.due_date::timestamptz, t.start_date::timestamptz + interval '1 hour') as scheduled_end,
--     t.status, t.description as notes,
--     'TASK' as event_type,
--     t.title as summary
--   FROM tasks t
--   INNER JOIN user_info ui ON true
--   WHERE (t.assigned_to = ui.id OR t.created_by = ui.id)
--     AND t.deleted_at IS NULL
--     AND t.status NOT IN ('done', 'completed', 'cancelled')
--     AND ui.sync_tasks = true
-- )
-- SELECT * FROM appointments
-- UNION ALL
-- SELECT * FROM tasks
-- ORDER BY scheduled_start;
