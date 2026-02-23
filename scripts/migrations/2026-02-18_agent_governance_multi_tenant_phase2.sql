-- 2026-02-18_agent_governance_multi_tenant_phase2.sql
-- Phase 2: webhook/channel binding + global default rollout + SOS prefilled + optional table packs
-- Execute via api_dinamico.

BEGIN;

ALTER TABLE public.agent_playbooks
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS operator_webhook_url text,
  ADD COLUMN IF NOT EXISTS config_ui jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.agent_handoff_policies
  ADD COLUMN IF NOT EXISTS pause_bot_while_operator boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.agent_channel_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  channel text NOT NULL,
  webhook_url text,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone
);

CREATE INDEX IF NOT EXISTS idx_agent_channel_bindings_tenant ON public.agent_channel_bindings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_channel_bindings_agent ON public.agent_channel_bindings (agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_channel_bindings_active
  ON public.agent_channel_bindings (tenant_id, agent_id, channel)
  WHERE deleted_at IS NULL;

COMMIT;
