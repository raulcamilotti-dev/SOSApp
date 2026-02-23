-- ============================================================
-- Migration: Add estimate fields to service_orders
-- Fase 1.3 — Estimativa de prazo/custo por ordem de serviço
--
-- O parceiro preenche após atendimento inicial / orçamento.
-- Valores exibidos no portal público e na tela do Processo.
-- ============================================================

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS estimated_cost        NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS estimated_duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_completion_date DATE;

COMMENT ON COLUMN service_orders.estimated_cost IS 'Custo estimado em R$ — preenchido pelo parceiro após avaliação inicial';
COMMENT ON COLUMN service_orders.estimated_duration_days IS 'Prazo estimado em dias úteis — preenchido pelo parceiro';
COMMENT ON COLUMN service_orders.estimated_completion_date IS 'Data prevista de conclusão — calculada ou preenchida manualmente';
