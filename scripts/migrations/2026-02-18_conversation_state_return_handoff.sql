-- 2026-02-18_conversation_state_return_handoff.sql
-- Ensure operator->bot return uses current conversation state key.
-- Execute via api_dinamico.

BEGIN;

ALTER TABLE public.controle_atendimento
  ADD COLUMN IF NOT EXISTS current_state_key text,
  ADD COLUMN IF NOT EXISTS paused_state_key text,
  ADD COLUMN IF NOT EXISTS return_state_key text,
  ADD COLUMN IF NOT EXISTS bot_paused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS handoff_channel text,
  ADD COLUMN IF NOT EXISTS handoff_updated_at timestamp without time zone DEFAULT now();

UPDATE public.agent_handoff_policies
SET return_to_state_key = '__CONVERSATION_CURRENT_STATE__',
    updated_at = now()
WHERE deleted_at IS NULL
  AND from_channel = 'app_atendimento'
  AND to_channel = 'app_operador'
  AND (
    return_to_state_key IS NULL
    OR btrim(return_to_state_key) = ''
    OR return_to_state_key = 'default'
  );

COMMIT;
