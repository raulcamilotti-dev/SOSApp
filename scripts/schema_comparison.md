# Comparação Schema - Seed vs Database Real

## ✅ Tabelas que NÃO TÊM tenant_id (corrigido)

- `workflow_templates` - ✅ já corrigido no seed_data_adapted.sql
- `workflow_steps` - ✅ já corrigido no seed_data_adapted.sql

## ✅ Tabelas que TÊM tenant_id (correto no seed)

- `workflow_step_transitions`
- `deadline_rules`
- `process_deadlines`
- `process_logs`

## ❌ deadline_rules - Colunas diferentes

### Seed esperava:

```sql
INSERT INTO deadline_rules (
  id, tenant_id, step_id,
  days_to_complete,
  alert_before_days,      -- ❌ NÃO EXISTE
  escalate_after_days,    -- ❌ NÃO EXISTE
  created_at
)
```

### Schema real:

```sql
deadline_rules (
  id UUID,
  tenant_id UUID,
  step_id UUID,
  days_to_complete INTEGER,
  priority VARCHAR,              -- ✅ EXISTE (não estava no seed)
  escalation_rule_json JSONB,    -- ✅ EXISTE (não estava no seed)
  notify_before_days INTEGER,    -- ✅ EXISTE (em vez de alert_before_days)
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP,
  created_by UUID,
  updated_by UUID
)
```

**Correção necessária:**

- Trocar `alert_before_days` → `notify_before_days`
- Remover `escalate_after_days` (usar `escalation_rule_json` se precisar, mas pode omitir)
- Adicionar `priority` ('high', 'medium', 'low')

## ❌ properties - Coluna customer_name não existe

### Seed esperava:

```sql
INSERT INTO properties (
  ...,
  customer_name,  -- ❌ NÃO EXISTE
  ...
)
```

### Schema real:

- Tem `customer_id` (UUID) mas NÃO tem `customer_name`
- **Solução aplicada**: Mesclar nome no campo `address` ✅ JÁ CORRIGIDO

## ⚠️ Problema Array Subscript

PostgreSQL nesta versão/configuração não aceita:

```sql
v_step_ids[1]  -- ❌ ERROR: cannot subscript type uuid
```

**Soluções aplicadas:**

1. ✅ Bulk INSERT para workflow_steps
2. ✅ SELECT array_agg() para carregar IDs
3. ✅ CTE com RETURNING para properties

**Ainda falhando em:**

- Nada! Properties agora usa CTE

## 📋 Resumo de Correções Pendentes

1. ✅ workflow_templates: remover tenant_id
2. ✅ workflow_steps: remover tenant_id
3. ✅ properties: remover customer_name, usar address
4. ✅ properties: usar CTE em vez de array subscript
5. ❌ **deadline_rules: trocar alert_before_days → notify_before_days, adicionar priority**
6. ⚠️ process_deadlines: verificar se há algum problema
7. ⚠️ process_logs: verificar se há algum problema
