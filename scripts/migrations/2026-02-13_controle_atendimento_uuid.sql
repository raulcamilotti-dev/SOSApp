-- Add UUID id to controle_atendimento and backfill existing rows
-- Keeps script idempotent so it can be re-run safely.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.controle_atendimento
  ADD COLUMN IF NOT EXISTS id UUID;

UPDATE public.controle_atendimento
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.controle_atendimento
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.controle_atendimento
  ALTER COLUMN id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_controle_atendimento_id
  ON public.controle_atendimento(id);
