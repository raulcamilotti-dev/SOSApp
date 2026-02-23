-- 2026-02-18_agent_governance_multi_tenant.sql
-- Multi-tenant governance model for app chatbot + operator handoff
-- Execute via api_dinamico (N8N), not via app-side hardcoded logic.

BEGIN;

ALTER TABLE public.agent_states
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS state_order integer,
  ADD COLUMN IF NOT EXISTS behavior_rules jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS table_scope jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS handoff_policy jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamp without time zone;

UPDATE public.agent_states s
SET tenant_id = a.tenant_id
FROM public.agents a
WHERE s.agent_id = a.id
  AND s.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_states_tenant ON public.agent_states (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_states_agent ON public.agent_states (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_states_channel ON public.agent_states (channel);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_states_tenant_agent_key_active
  ON public.agent_states (tenant_id, agent_id, state_key)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE TABLE IF NOT EXISTS public.agent_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  channel text NOT NULL DEFAULT 'app_atendimento',
  name text NOT NULL,
  description text,
  behavior_source text NOT NULL DEFAULT 'agent_system_prompt',
  inherit_system_prompt boolean NOT NULL DEFAULT true,
  state_machine_mode text NOT NULL DEFAULT 'guided',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone
);

CREATE INDEX IF NOT EXISTS idx_agent_playbooks_tenant ON public.agent_playbooks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_playbooks_agent ON public.agent_playbooks (agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_playbooks_tenant_agent_channel_active
  ON public.agent_playbooks (tenant_id, agent_id, channel)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.agent_playbook_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  playbook_id uuid NOT NULL REFERENCES public.agent_playbooks(id),
  rule_order integer NOT NULL DEFAULT 0,
  rule_type text NOT NULL DEFAULT 'policy',
  title text,
  instruction text NOT NULL,
  severity text NOT NULL DEFAULT 'normal',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone
);

CREATE INDEX IF NOT EXISTS idx_agent_playbook_rules_tenant ON public.agent_playbook_rules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_playbook_rules_playbook ON public.agent_playbook_rules (playbook_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_playbook_rules_unique_order_active
  ON public.agent_playbook_rules (playbook_id, rule_order)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.agent_playbook_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  playbook_id uuid NOT NULL REFERENCES public.agent_playbooks(id),
  table_name text NOT NULL,
  access_mode text NOT NULL DEFAULT 'read',
  is_required boolean NOT NULL DEFAULT false,
  purpose text,
  query_guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone
);

CREATE INDEX IF NOT EXISTS idx_agent_playbook_tables_tenant ON public.agent_playbook_tables (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_playbook_tables_playbook ON public.agent_playbook_tables (playbook_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_playbook_tables_unique_active
  ON public.agent_playbook_tables (playbook_id, table_name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.agent_handoff_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  playbook_id uuid REFERENCES public.agent_playbooks(id),
  from_channel text NOT NULL DEFAULT 'app_atendimento',
  to_channel text NOT NULL DEFAULT 'app_operador',
  trigger_type text NOT NULL DEFAULT 'user_request',
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  operator_can_return_to_bot boolean NOT NULL DEFAULT true,
  return_to_state_key text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone
);

CREATE INDEX IF NOT EXISTS idx_agent_handoff_policies_tenant ON public.agent_handoff_policies (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoff_policies_agent ON public.agent_handoff_policies (agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_handoff_policy_active
  ON public.agent_handoff_policies (tenant_id, agent_id, from_channel, to_channel, trigger_type)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.agent_prompt_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  source text NOT NULL DEFAULT 'legacy_system_prompt',
  raw_prompt text NOT NULL,
  extracted_sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone
);

CREATE INDEX IF NOT EXISTS idx_agent_prompt_snapshots_tenant ON public.agent_prompt_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_prompt_snapshots_agent ON public.agent_prompt_snapshots (agent_id);

CREATE TABLE IF NOT EXISTS public.agent_state_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  state_id uuid NOT NULL REFERENCES public.agent_states(id),
  step_key text NOT NULL,
  step_label text NOT NULL,
  step_order integer NOT NULL DEFAULT 10,
  instruction text NOT NULL,
  expected_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  on_success_action text,
  on_failure_action text,
  handoff_to_operator boolean NOT NULL DEFAULT false,
  return_to_bot_allowed boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone
);

CREATE INDEX IF NOT EXISTS idx_agent_state_steps_tenant ON public.agent_state_steps (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_state_steps_agent ON public.agent_state_steps (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_state_steps_state ON public.agent_state_steps (state_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_state_steps_unique_active
  ON public.agent_state_steps (state_id, step_key)
  WHERE deleted_at IS NULL;

COMMIT;
