# Radul Pack Specification — Referência Completa

> Versão 1.0 · Fevereiro 2026
> Este documento cobre 100% dos campos de `TemplatePack` e `AgentTemplatePack`.

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Conceitos Fundamentais](#conceitos-fundamentais)
3. [TemplatePack — Estrutura Completa](#templatepack--estrutura-completa)
   - [PackMetadata](#packmetadata)
   - [PackTenantConfig](#packtenantconfig)
   - [Modules](#modules)
   - [PackServiceCategory](#packservicecategory)
   - [PackServiceType](#packservicetype)
   - [PackWorkflowTemplate](#packworkflowtemplate)
   - [PackWorkflowStep](#packworkflowstep)
   - [PackWorkflowTransition](#packworkflowtransition)
   - [PackDeadlineRule](#packdeadlinerule)
   - [PackStepTaskTemplate](#packsteptasktemplate)
   - [PackStepForm](#packstepform)
   - [PackDocumentTemplate](#packdocumenttemplate)
   - [PackRole](#packrole)
   - [PackService](#packservice)
   - [PackOcrConfig](#packocrconfig)
   - [PackCustomFieldDefinition](#packcustomfielddefinition)
4. [AgentTemplatePack — Estrutura Completa](#agenttemplatepack--estrutura-completa)
   - [AgentPackMetadata](#agentpackmetadata)
   - [PackAgent](#packagent)
   - [PackPlaybook](#packplaybook)
   - [PackPlaybookRule](#packplaybookrule)
   - [PackPlaybookTable](#packplaybooktable)
   - [PackAgentState](#packagentstate)
   - [PackAgentStateStep](#packagentatestep)
   - [PackChannelBinding](#packchannelbinding)
   - [PackHandoffPolicy](#packhandoffpolicy)
   - [PackAutomation](#packautomation)
5. [Sistema de ref_key](#sistema-de-ref_key)
6. [Ordem de Aplicação (FK Dependencies)](#ordem-de-aplicação-fk-dependencies)
7. [Validação](#validação)
8. [Limites e Restrições](#limites-e-restrições)

---

## Visão Geral

Um **Pack** é um pacote portátil de dados pré-configurados que transforma a plataforma Radul em uma solução vertical para um tipo específico de negócio. Existem dois tipos:

| Tipo                  | Descrição                                                                 | Entidades            |
| --------------------- | ------------------------------------------------------------------------- | -------------------- |
| **TemplatePack**      | Categorias, tipos de serviço, workflows, roles, documentos, custom fields | 16 tipos de entidade |
| **AgentTemplatePack** | Agentes de IA, playbooks, estados, handoff, automações                    | 10 tipos de entidade |

Packs são **JSON-serializáveis** e **portáteis**: podem ser aplicados em qualquer tenant, em qualquer instância da Radul.

---

## Conceitos Fundamentais

### ref_key vs UUID

Packs **nunca usam UUIDs**. Em vez disso, cada entidade recebe um `ref_key` — uma string legível e determinística que identifica a entidade **dentro do pack**. UUIDs são gerados automaticamente no momento da aplicação.

```
✅ ref_key: "cat_consultas"
✅ ref_key: "wf_atendimento_padrao"
❌ ref_key: "550e8400-e29b-41d4-a716-446655440000"  ← NÃO use UUID
```

**Regras de ref_key:**

- Deve ser **único** dentro de cada tipo de entidade no pack
- Deve ser **snake_case**, **sem espaços**, **sem acentos**
- Prefixos sugeridos: `cat_`, `type_`, `wf_`, `step_`, `role_`, `doc_`, `form_`, `cf_`
- Máximo 100 caracteres

### Cross-references (\*\_ref)

Campos que terminam em `_ref` são **ponteiros para o ref_key de outra entidade do mesmo pack**:

```typescript
{
  ref_key: "type_banho",
  name: "Banho & Tosa",
  category_ref: "cat_servicos",  // → aponta para PackServiceCategory.ref_key
  workflow_ref: "wf_atendimento" // → aponta para PackWorkflowTemplate.ref_key
}
```

O validador verifica que todas as cross-references apontam para ref_keys existentes.

---

## TemplatePack — Estrutura Completa

```typescript
interface TemplatePack {
  metadata: PackMetadata;
  tenant_config: PackTenantConfig;
  modules: ModuleKey[];

  service_categories: PackServiceCategory[];
  service_types: PackServiceType[];
  workflow_templates: PackWorkflowTemplate[];
  deadline_rules: PackDeadlineRule[];
  step_task_templates: PackStepTaskTemplate[];
  step_forms: PackStepForm[];
  document_templates: PackDocumentTemplate[];
  roles: PackRole[];
  services: PackService[];
  ocr_configs?: PackOcrConfig[];
  custom_fields?: PackCustomFieldDefinition[];
}
```

---

### PackMetadata

Identifica o pack e aparece na UI de seleção.

| Campo         | Tipo     | Obrigatório | Descrição                                                                             |
| ------------- | -------- | :---------: | ------------------------------------------------------------------------------------- |
| `key`         | `string` |     ✅      | Identificador único do pack (ex: `"pet_shop"`, `"clinica"`). Snake_case, sem espaços. |
| `name`        | `string` |     ✅      | Nome exibido na UI (ex: `"Pet Shop & Veterinária"`)                                   |
| `description` | `string` |     ✅      | Descrição curta do vertical (1–2 frases)                                              |
| `icon`        | `string` |     ✅      | Nome de ícone Ionicons (ex: `"paw-outline"`, `"medkit-outline"`)                      |
| `color`       | `string` |     ✅      | Cor hex para o card (ex: `"#f59e0b"`)                                                 |
| `version`     | `string` |     ✅      | Versão semver (ex: `"1.0.0"`)                                                         |

**Exemplo:**

```typescript
metadata: {
  key: "pet_shop",
  name: "Pet Shop & Veterinária",
  description: "Pack para pet shops, clínicas veterinárias e serviços de banho e tosa.",
  icon: "paw-outline",
  color: "#f59e0b",
  version: "1.0.0",
}
```

---

### PackTenantConfig

Configurações que são aplicadas ao tenant ao ativar o pack. Ficam em `tenants.config`.

| Campo           | Tipo      | Obrigatório | Descrição                                                                 |
| --------------- | --------- | :---------: | ------------------------------------------------------------------------- |
| `specialty`     | `string`  |     ✅      | Identificador do segmento (ex: `"veterinario"`, `"juridico"`)             |
| `agent_type`    | `string`  |     ✅      | Tipo de personalidade do agente de IA (ex: `"generico"`, `"atendimento"`) |
| `agent_name`    | `string`  |     ✅      | Nome do agente de IA padrão (ex: `"Luna"`, `"Ana"`)                       |
| `show_price`    | `boolean` |     ✅      | Mostrar preços no portal público do cliente                               |
| `allow_payment` | `boolean` |     ✅      | Permitir pagamentos online                                                |

**Exemplo:**

```typescript
tenant_config: {
  specialty: "veterinario",
  agent_type: "atendimento",
  agent_name: "Luna",
  show_price: true,
  allow_payment: true,
}
```

---

### Modules

Array de chaves de módulos a ativar para o tenant. `"core"` é sempre ativo.

**Módulos disponíveis:**

| Chave           | Descrição                                                         |
| --------------- | ----------------------------------------------------------------- |
| `core`          | Core da plataforma (sempre ativo)                                 |
| `financial`     | Faturas, pagamentos, contas a receber/pagar, dashboard financeiro |
| `partners`      | Gestão de parceiros, comissões, meus trabalhos                    |
| `documents`     | Templates de documentos, assinaturas digitais, OCR                |
| `onr_cartorio`  | Protocolos ONR, certidões (requer `documents`)                    |
| `ai_automation` | Agentes de IA, playbooks, insights                                |
| `bi_analytics`  | Dashboards Metabase embedded, relatórios                          |
| `crm`           | CRM, leads, pipeline kanban, campanhas                            |
| `pdv`           | Ponto de venda, shopping cart, checkout (requer `products`)       |
| `products`      | Catálogo de produtos, composições/BOM                             |
| `stock`         | Controle de estoque, movimentações (requer `products`)            |
| `purchases`     | Pedidos de compra, fornecedores (requer `products`)               |
| `delivery`      | Entregas, expedição, rastreamento (requer `stock`)                |
| `time_tracking` | Controle de horas, timesheets                                     |
| `client_portal` | Portal do cliente                                                 |

**Exemplo:**

```typescript
modules: ["core", "financial", "partners", "crm"];
```

---

### PackServiceCategory

Categorias agrupam tipos de serviço. Aparecem na navegação e no kanban.

| Campo         | Tipo      | Obrigatório | Descrição                           |
| ------------- | --------- | :---------: | ----------------------------------- |
| `ref_key`     | `string`  |     ✅      | Identificador único da categoria    |
| `name`        | `string`  |     ✅      | Nome exibido (ex: `"Banho & Tosa"`) |
| `description` | `string`  |     ❌      | Descrição da categoria              |
| `color`       | `string`  |     ✅      | Cor hex (ex: `"#3b82f6"`)           |
| `icon`        | `string`  |     ✅      | Ionicons name (ex: `"cut-outline"`) |
| `sort_order`  | `number`  |     ✅      | Posição na lista (1, 2, 3...)       |
| `is_active`   | `boolean` |     ✅      | Se a categoria está ativa           |

**Exemplo:**

```typescript
{
  ref_key: "cat_banho",
  name: "Banho & Tosa",
  description: "Serviços de higiene e estética animal",
  color: "#3b82f6",
  icon: "cut-outline",
  sort_order: 1,
  is_active: true,
}
```

---

### PackServiceType

Tipos de serviço dentro de uma categoria. Definem o que o tenant oferece.

| Campo          | Tipo             | Obrigatório | Descrição                                                           |
| -------------- | ---------------- | :---------: | ------------------------------------------------------------------- |
| `ref_key`      | `string`         |     ✅      | Identificador único do tipo                                         |
| `name`         | `string`         |     ✅      | Nome do tipo (ex: `"Banho Simples"`)                                |
| `description`  | `string`         |     ❌      | Descrição detalhada                                                 |
| `icon`         | `string`         |     ✅      | Ionicons name                                                       |
| `color`        | `string`         |     ✅      | Cor hex                                                             |
| `is_active`    | `boolean`        |     ✅      | Se está ativo                                                       |
| `category_ref` | `string`         |     ✅      | → `PackServiceCategory.ref_key`                                     |
| `entity_table` | `string \| null` |     ❌      | Tabela de contexto (ex: `"properties"`). Null na maioria dos casos. |
| `workflow_ref` | `string`         |     ❌      | → `PackWorkflowTemplate.ref_key` para o fluxo padrão                |

**Exemplo:**

```typescript
{
  ref_key: "type_banho_simples",
  name: "Banho Simples",
  description: "Banho com shampoo pet e secagem",
  icon: "water-outline",
  color: "#06b6d4",
  is_active: true,
  category_ref: "cat_banho",
  workflow_ref: "wf_atendimento",
}
```

---

### PackWorkflowTemplate

Template de workflow com seus steps e transições. Define o fluxo de trabalho.

| Campo              | Tipo                       | Obrigatório | Descrição                                          |
| ------------------ | -------------------------- | :---------: | -------------------------------------------------- |
| `ref_key`          | `string`                   |     ✅      | Identificador único do workflow                    |
| `name`             | `string`                   |     ✅      | Nome do workflow (ex: `"Fluxo de Atendimento"`)    |
| `service_type_ref` | `string`                   |     ❌      | → `PackServiceType.ref_key` (vínculo bidirecional) |
| `steps`            | `PackWorkflowStep[]`       |     ✅      | Etapas do fluxo (pelo menos 1)                     |
| `transitions`      | `PackWorkflowTransition[]` |     ✅      | Transições entre etapas                            |

**Exemplo:**

```typescript
{
  ref_key: "wf_atendimento",
  name: "Fluxo de Atendimento",
  service_type_ref: "type_banho_simples",
  steps: [/* ver PackWorkflowStep */],
  transitions: [/* ver PackWorkflowTransition */],
}
```

---

### PackWorkflowStep

Uma etapa dentro de um workflow template.

| Campo          | Tipo      | Obrigatório | Descrição                                         |
| -------------- | --------- | :---------: | ------------------------------------------------- |
| `ref_key`      | `string`  |     ✅      | Identificador único do step                       |
| `name`         | `string`  |     ✅      | Nome da etapa (ex: `"Recepção"`, `"Em Execução"`) |
| `step_order`   | `number`  |     ✅      | Posição dentro do workflow (1, 2, 3...)           |
| `is_terminal`  | `boolean` |     ✅      | Se é a última etapa (resultado final)             |
| `ocr_enabled`  | `boolean` |     ❌      | Se ativa OCR nessa etapa (default: `false`)       |
| `has_protocol` | `boolean` |     ❌      | Se gera protocolo nessa etapa (default: `false`)  |

**Exemplo:**

```typescript
{
  ref_key: "step_recepcao",
  name: "Recepção",
  step_order: 1,
  is_terminal: false,
}
```

---

### PackWorkflowTransition

Define quais transições são possíveis entre steps.

| Campo            | Tipo                      | Obrigatório | Descrição                                   |
| ---------------- | ------------------------- | :---------: | ------------------------------------------- |
| `from_step_ref`  | `string`                  |     ✅      | → `PackWorkflowStep.ref_key` (origem)       |
| `to_step_ref`    | `string`                  |     ✅      | → `PackWorkflowStep.ref_key` (destino)      |
| `name`           | `string`                  |     ✅      | Nome da transição (ex: `"Iniciar Serviço"`) |
| `description`    | `string`                  |     ❌      | Descrição da transição                      |
| `condition_json` | `Record<string, unknown>` |     ❌      | Condições para a transição ser possível     |

**Nota:** Transições podem criar loops (ex: `Revisão → Em Execução`) para fluxos de retrabalho.

**Exemplo:**

```typescript
{
  from_step_ref: "step_recepcao",
  to_step_ref: "step_execucao",
  name: "Iniciar Serviço",
  description: "Animal recebido, iniciar o serviço",
}
```

---

### PackDeadlineRule

SLA por etapa do workflow — define prazos e prioridades.

| Campo                  | Tipo                      | Obrigatório | Descrição                                               |
| ---------------------- | ------------------------- | :---------: | ------------------------------------------------------- |
| `step_ref`             | `string`                  |     ✅      | → `PackWorkflowStep.ref_key`                            |
| `days_to_complete`     | `number`                  |     ✅      | Dias úteis para concluir a etapa                        |
| `priority`             | `string`                  |     ✅      | `"low"`, `"medium"`, `"high"`, `"urgent"`, `"critical"` |
| `notify_before_days`   | `number`                  |     ✅      | Dias de antecedência para notificar                     |
| `escalation_rule_json` | `Record<string, unknown>` |     ❌      | Regras de escalação automática                          |

**Exemplo:**

```typescript
{
  step_ref: "step_execucao",
  days_to_complete: 1,
  priority: "high",
  notify_before_days: 0,
}
```

---

### PackStepTaskTemplate

Tasks automáticas criadas quando o processo entra em determinada etapa.

| Campo               | Tipo                      | Obrigatório | Descrição                                               |
| ------------------- | ------------------------- | :---------: | ------------------------------------------------------- |
| `step_ref`          | `string`                  |     ✅      | → `PackWorkflowStep.ref_key`                            |
| `title`             | `string`                  |     ✅      | Título da task                                          |
| `description`       | `string`                  |     ❌      | Descrição detalhada                                     |
| `assigned_role_ref` | `string`                  |     ❌      | → `PackRole.ref_key` (atribui à role)                   |
| `is_required`       | `boolean`                 |     ✅      | Se bloqueia transição ao próximo step                   |
| `due_days`          | `number`                  |     ❌      | Prazo em dias (a partir do início da etapa)             |
| `priority`          | `string`                  |     ✅      | `"low"`, `"medium"`, `"high"`, `"urgent"`, `"critical"` |
| `template_order`    | `number`                  |     ✅      | Ordem de exibição                                       |
| `metadata_json`     | `Record<string, unknown>` |     ❌      | Metadados extras                                        |

**Exemplo:**

```typescript
{
  step_ref: "step_recepcao",
  title: "Verificar saúde do animal",
  description: "Checar vacinas, alergias e estado geral",
  assigned_role_ref: "role_atendente",
  is_required: true,
  priority: "high",
  template_order: 1,
}
```

---

### PackStepForm

Formulários que devem ser preenchidos em determinada etapa.

| Campo                   | Tipo                      | Obrigatório | Descrição                               |
| ----------------------- | ------------------------- | :---------: | --------------------------------------- |
| `step_ref`              | `string`                  |     ✅      | → `PackWorkflowStep.ref_key`            |
| `name`                  | `string`                  |     ✅      | Nome do formulário                      |
| `description`           | `string`                  |     ❌      | Descrição do formulário                 |
| `form_schema_json`      | `Record<string, unknown>` |     ✅      | Schema JSON com definição dos campos    |
| `validation_rules_json` | `Record<string, unknown>` |     ❌      | Regras de validação                     |
| `is_required`           | `boolean`                 |     ✅      | Se é obrigatório preencher              |
| `can_block_transition`  | `boolean`                 |     ❌      | Se impede a transição se não preenchido |

**Formato do `form_schema_json`:**

```json
{
  "fields": [
    {
      "key": "peso",
      "label": "Peso do animal (kg)",
      "type": "number",
      "required": true
    },
    {
      "key": "observacoes",
      "label": "Observações",
      "type": "multiline",
      "required": false
    },
    {
      "key": "tipo_pelagem",
      "label": "Tipo de pelagem",
      "type": "select",
      "options": ["Curta", "Média", "Longa"]
    }
  ]
}
```

---

### PackDocumentTemplate

Templates de documentos (contratos, recibos, notificações) com variáveis.

| Campo          | Tipo                      | Obrigatório | Descrição                                                              |
| -------------- | ------------------------- | :---------: | ---------------------------------------------------------------------- |
| `ref_key`      | `string`                  |     ✅      | Identificador único do template                                        |
| `name`         | `string`                  |     ✅      | Nome do template (ex: `"Recibo de Serviço"`)                           |
| `description`  | `string`                  |     ❌      | Descrição                                                              |
| `category`     | `string`                  |     ✅      | Categoria do documento (ex: `"recibo"`, `"contrato"`, `"notificacao"`) |
| `content_html` | `string`                  |     ✅      | HTML do documento com variáveis `{{nome}}`                             |
| `variables`    | `Record<string, unknown>` |     ✅      | Definição das variáveis usadas no template                             |
| `header_html`  | `string`                  |     ❌      | HTML do cabeçalho                                                      |
| `footer_html`  | `string`                  |     ❌      | HTML do rodapé                                                         |
| `page_config`  | `Record<string, unknown>` |     ❌      | Configuração de página (margens, orientação)                           |
| `is_active`    | `boolean`                 |     ✅      | Se o template está ativo                                               |

**Sistema de variáveis:**

Variáveis podem ter diferentes fontes (`source`):

| Source          | Descrição                  | Exemplos                                  |
| --------------- | -------------------------- | ----------------------------------------- |
| `tenant`        | Dados do tenant            | `company_name`, `cnpj`, `address`         |
| `customer`      | Dados do cliente           | `fullname`, `cpf`, `email`, `phone`       |
| `service_order` | Dados da OS                | `protocol_number`, `status`, `created_at` |
| `input`         | Entrada manual do operador | `valor_servico`, `forma_pagamento`        |
| `auto`          | Gerado automaticamente     | `current_date`, `current_time`            |

**Exemplo:**

```typescript
{
  ref_key: "doc_recibo",
  name: "Recibo de Serviço",
  category: "recibo",
  content_html: `
    <h1>RECIBO DE SERVIÇO</h1>
    <p>Empresa: {{empresa_nome}}</p>
    <p>Cliente: {{cliente_nome}}</p>
    <p>Serviço: {{servico_descricao}}</p>
    <p>Valor: R$ {{valor}}</p>
    <p>Data: {{data_emissao}}</p>
  `,
  variables: {
    empresa_nome: { source: "tenant", field: "company_name" },
    cliente_nome: { source: "customer", field: "fullname" },
    servico_descricao: { source: "input", label: "Descrição do serviço" },
    valor: { source: "input", label: "Valor do serviço", type: "currency" },
    data_emissao: { source: "auto", field: "current_date" },
  },
  is_active: true,
}
```

---

### PackRole

Papéis com permissões pré-configuradas.

| Campo         | Tipo       | Obrigatório | Descrição                                          |
| ------------- | ---------- | :---------: | -------------------------------------------------- |
| `ref_key`     | `string`   |     ✅      | Identificador único do role                        |
| `name`        | `string`   |     ✅      | Nome do papel (ex: `"Atendente"`, `"Veterinário"`) |
| `permissions` | `string[]` |     ✅      | Códigos de permissão globais                       |

**Permissões disponíveis** (as mais comuns):

| Código                  | Descrição                        |
| ----------------------- | -------------------------------- |
| `customers.view`        | Ver clientes                     |
| `customers.create`      | Criar clientes                   |
| `customers.edit`        | Editar clientes                  |
| `service_orders.view`   | Ver ordens de serviço            |
| `service_orders.create` | Criar ordens                     |
| `service_orders.edit`   | Editar ordens                    |
| `service_orders.manage` | Gerenciamento completo de ordens |
| `users.view`            | Ver usuários                     |
| `users.manage`          | Gerenciar usuários               |
| `reports.view`          | Ver relatórios                   |
| `settings.manage`       | Gerenciar configurações          |
| `workflow.manage`       | Gerenciar workflows              |
| `partners.view`         | Ver parceiros                    |
| `partners.manage`       | Gerenciar parceiros              |
| `invoices.view`         | Ver faturas                      |
| `invoices.manage`       | Gerenciar faturas                |
| `documents.view`        | Ver documentos                   |
| `documents.manage`      | Gerenciar documentos             |
| `leads.view`            | Ver leads                        |
| `leads.manage`          | Gerenciar leads                  |

**Exemplo:**

```typescript
{
  ref_key: "role_atendente",
  name: "Atendente",
  permissions: [
    "customers.view", "customers.create", "customers.edit",
    "service_orders.view", "service_orders.create",
    "reports.view",
  ],
}
```

---

### PackService

Serviços cadastrados no catálogo do tenant.

| Campo                 | Tipo                                        | Obrigatório | Descrição                                      |
| --------------------- | ------------------------------------------- | :---------: | ---------------------------------------------- |
| `name`                | `string`                                    |     ✅      | Nome do serviço (ex: `"Banho Pequeno Porte"`)  |
| `type_ref`            | `string`                                    |     ✅      | → `PackServiceType.ref_key`                    |
| `config`              | `Record<string, unknown>`                   |     ❌      | Configurações extras                           |
| `is_active`           | `boolean`                                   |     ✅      | Se está ativo                                  |
| `item_kind`           | `"product" \| "service"`                    |     ❌      | Tipo do item (default: `"service"`)            |
| `sell_price`          | `number`                                    |     ❌      | Preço de venda                                 |
| `cost_price`          | `number`                                    |     ❌      | Preço de custo                                 |
| `unit_code`           | `string`                                    |     ❌      | Unidade de medida (ex: `"un"`, `"hr"`, `"kg"`) |
| `duration_minutes`    | `number`                                    |     ❌      | Duração estimada em minutos                    |
| `requires_scheduling` | `boolean`                                   |     ❌      | Se requer agendamento                          |
| `requires_separation` | `boolean`                                   |     ❌      | Se requer separação de estoque                 |
| `requires_delivery`   | `boolean`                                   |     ❌      | Se requer entrega                              |
| `commission_percent`  | `number`                                    |     ❌      | Percentual de comissão (0–100)                 |
| `description`         | `string`                                    |     ❌      | Descrição do serviço                           |
| `sku`                 | `string`                                    |     ❌      | SKU do produto                                 |
| `track_stock`         | `boolean`                                   |     ❌      | Se controla estoque                            |
| `stock_quantity`      | `number`                                    |     ❌      | Quantidade inicial em estoque                  |
| `min_stock`           | `number`                                    |     ❌      | Estoque mínimo (alerta)                        |
| `is_composition`      | `boolean`                                   |     ❌      | Se é composição/BOM                            |
| `compositions`        | `{ child_ref: string; quantity: number }[]` |     ❌      | Componentes (se is_composition)                |

**Exemplo:**

```typescript
{
  name: "Banho Pequeno Porte",
  type_ref: "type_banho_simples",
  is_active: true,
  sell_price: 45.00,
  duration_minutes: 60,
  requires_scheduling: true,
  commission_percent: 30,
  description: "Banho completo para cães de pequeno porte (até 10kg)",
}
```

---

### PackOcrConfig

Configuração de OCR por etapa do workflow. **Opcional.**

| Campo              | Tipo       | Obrigatório | Descrição                        |
| ------------------ | ---------- | :---------: | -------------------------------- |
| `step_ref`         | `string`   |     ❌      | → `PackWorkflowStep.ref_key`     |
| `name`             | `string`   |     ✅      | Nome da configuração             |
| `description`      | `string`   |     ❌      | Descrição                        |
| `document_types`   | `string[]` |     ✅      | Tipos de documento aceitos       |
| `extract_features` | `string[]` |     ✅      | Campos a extrair                 |
| `lang`             | `string`   |     ❌      | Idioma do OCR (default: `"por"`) |
| `is_active`        | `boolean`  |     ✅      | Se está ativo                    |

---

### PackCustomFieldDefinition

Campos customizados adicionados a tabelas existentes. **Opcional.**

| Campo              | Tipo                                   | Obrigatório | Descrição                                                                                                                                                      |
| ------------------ | -------------------------------------- | :---------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref_key`          | `string`                               |     ✅      | Identificador único do campo                                                                                                                                   |
| `target_table`     | `string`                               |     ✅      | Tabela alvo (ex: `"customers"`, `"service_orders"`)                                                                                                            |
| `field_key`        | `string`                               |     ✅      | Nome do campo (snake_case, ex: `"raca_animal"`)                                                                                                                |
| `label`            | `string`                               |     ✅      | Label exibido na UI (ex: `"Raça do Animal"`)                                                                                                                   |
| `placeholder`      | `string`                               |     ❌      | Texto de placeholder                                                                                                                                           |
| `field_type`       | `string`                               |     ✅      | Tipo: `"text"`, `"number"`, `"select"`, `"boolean"`, `"date"`, `"currency"`, `"multiline"`, `"email"`, `"phone"`, `"url"`, `"masked"`, `"reference"`, `"json"` |
| `required`         | `boolean`                              |     ❌      | Se é obrigatório (default: `false`)                                                                                                                            |
| `visible_in_list`  | `boolean`                              |     ❌      | Se aparece na listagem (default: `true`)                                                                                                                       |
| `visible_in_form`  | `boolean`                              |     ❌      | Se aparece no formulário (default: `true`)                                                                                                                     |
| `read_only`        | `boolean`                              |     ❌      | Se é somente leitura (default: `false`)                                                                                                                        |
| `section`          | `string`                               |     ❌      | Seção do formulário onde o campo aparece                                                                                                                       |
| `sort_order`       | `number`                               |     ❌      | Ordem de exibição                                                                                                                                              |
| `default_value`    | `string`                               |     ❌      | Valor padrão                                                                                                                                                   |
| `options`          | `Record<string, unknown> \| unknown[]` |     ❌      | Opções para campos `select`                                                                                                                                    |
| `validation_rules` | `Record<string, unknown>`              |     ❌      | Regras de validação                                                                                                                                            |
| `mask_type`        | `string`                               |     ❌      | Tipo de máscara: `"cpf"`, `"cnpj"`, `"cep"`, `"phone"`, `"cpf_cnpj"`                                                                                           |
| `reference_config` | `Record<string, unknown>`              |     ❌      | Config para campos `reference`                                                                                                                                 |
| `show_when`        | `Record<string, unknown>`              |     ❌      | Condição de visibilidade                                                                                                                                       |

**Exemplo:**

```typescript
{
  ref_key: "cf_raca_animal",
  target_table: "customers",
  field_key: "raca_animal",
  label: "Raça do Animal",
  field_type: "text",
  section: "Dados do Pet",
  sort_order: 1,
}
```

---

## AgentTemplatePack — Estrutura Completa

```typescript
interface AgentTemplatePack {
  metadata: AgentPackMetadata;
  agents: PackAgent[];
  playbooks: PackPlaybook[];
  playbook_rules: PackPlaybookRule[];
  playbook_tables: PackPlaybookTable[];
  agent_states: PackAgentState[];
  agent_state_steps: PackAgentStateStep[];
  channel_bindings: PackChannelBinding[];
  handoff_policies: PackHandoffPolicy[];
  automations: PackAutomation[];
}
```

---

### AgentPackMetadata

Idêntica à `PackMetadata` — identifica o agent pack.

| Campo         | Tipo     | Obrigatório | Descrição                                    |
| ------------- | -------- | :---------: | -------------------------------------------- |
| `key`         | `string` |     ✅      | Identificador único (ex: `"agent_pet_shop"`) |
| `name`        | `string` |     ✅      | Nome exibido                                 |
| `description` | `string` |     ✅      | Descrição                                    |
| `icon`        | `string` |     ✅      | Ionicons name                                |
| `color`       | `string` |     ✅      | Cor hex                                      |
| `version`     | `string` |     ✅      | Versão semver                                |

---

### PackAgent

Um agente de IA com personalidade e configuração.

| Campo           | Tipo      | Obrigatório | Descrição                                              |
| --------------- | --------- | :---------: | ------------------------------------------------------ |
| `ref_key`       | `string`  |     ✅      | Identificador único                                    |
| `name`          | `string`  |     ✅      | Nome do agente                                         |
| `description`   | `string`  |     ❌      | Descrição                                              |
| `type`          | `string`  |     ✅      | Tipo: `"atendimento"`, `"operacional"`, `"supervisao"` |
| `system_prompt` | `string`  |     ✅      | System prompt do agente                                |
| `model`         | `string`  |     ❌      | Modelo LLM (ex: `"gpt-4"`)                             |
| `temperature`   | `number`  |     ❌      | Temperatura (0–2, default: 0.7)                        |
| `max_tokens`    | `number`  |     ❌      | Limite de tokens                                       |
| `is_default`    | `boolean` |     ❌      | Se é o agente padrão                                   |

---

### PackPlaybook

Manual de comportamento associado a um agente + canal.

| Campo                | Tipo      | Obrigatório | Descrição                             |
| -------------------- | --------- | :---------: | ------------------------------------- |
| `ref_key`            | `string`  |     ✅      | Identificador único                   |
| `agent_ref`          | `string`  |     ✅      | → `PackAgent.ref_key`                 |
| `name`               | `string`  |     ✅      | Nome do playbook                      |
| `description`        | `string`  |     ❌      | Descrição                             |
| `channel`            | `string`  |     ✅      | Canal: `"whatsapp"`, `"app"`, `"web"` |
| `behavior_source`    | `string`  |     ❌      | Fonte de comportamento                |
| `state_machine_mode` | `boolean` |     ❌      | Se usa máquina de estados             |
| `is_active`          | `boolean` |     ✅      | Se está ativo                         |

---

### PackPlaybookRule

Regras individuais dentro de um playbook.

| Campo          | Tipo      | Obrigatório | Descrição                                                      |
| -------------- | --------- | :---------: | -------------------------------------------------------------- |
| `ref_key`      | `string`  |     ✅      | Identificador único                                            |
| `playbook_ref` | `string`  |     ✅      | → `PackPlaybook.ref_key`                                       |
| `rule_type`    | `string`  |     ✅      | Tipo: `"greeting"`, `"farewell"`, `"escalation"`, `"behavior"` |
| `title`        | `string`  |     ✅      | Título da regra                                                |
| `content`      | `string`  |     ✅      | Conteúdo/instrução da regra                                    |
| `severity`     | `string`  |     ✅      | `"info"`, `"warning"`, `"critical"`                            |
| `sort_order`   | `number`  |     ❌      | Ordem de avaliação                                             |
| `is_active`    | `boolean` |     ✅      | Se está ativa                                                  |

---

### PackPlaybookTable

Tabelas de referência que o agente pode consultar.

| Campo          | Tipo      | Obrigatório | Descrição                           |
| -------------- | --------- | :---------: | ----------------------------------- |
| `ref_key`      | `string`  |     ✅      | Identificador único                 |
| `playbook_ref` | `string`  |     ✅      | → `PackPlaybook.ref_key`            |
| `table_name`   | `string`  |     ✅      | Nome da tabela                      |
| `description`  | `string`  |     ❌      | Descrição                           |
| `access_mode`  | `string`  |     ✅      | `"read"`, `"write"`, `"read_write"` |
| `is_active`    | `boolean` |     ✅      | Se está ativa                       |

---

### PackAgentState

Estado do agente (máquina de estados finita).

| Campo         | Tipo      | Obrigatório | Descrição                                     |
| ------------- | --------- | :---------: | --------------------------------------------- |
| `ref_key`     | `string`  |     ✅      | Identificador único                           |
| `agent_ref`   | `string`  |     ✅      | → `PackAgent.ref_key`                         |
| `state_key`   | `string`  |     ✅      | Chave do estado (ex: `"online"`, `"offline"`) |
| `name`        | `string`  |     ✅      | Nome exibido                                  |
| `description` | `string`  |     ❌      | Descrição                                     |
| `is_initial`  | `boolean` |     ✅      | Se é o estado inicial                         |
| `is_terminal` | `boolean` |     ✅      | Se é estado terminal                          |
| `is_active`   | `boolean` |     ✅      | Se está ativo                                 |

---

### PackAgentStateStep

Passos dentro de um estado do agente.

| Campo                 | Tipo      | Obrigatório | Descrição                         |
| --------------------- | --------- | :---------: | --------------------------------- |
| `ref_key`             | `string`  |     ✅      | Identificador único               |
| `state_ref`           | `string`  |     ✅      | → `PackAgentState.ref_key`        |
| `agent_ref`           | `string`  |     ✅      | → `PackAgent.ref_key`             |
| `step_key`            | `string`  |     ✅      | Chave do step                     |
| `name`                | `string`  |     ✅      | Nome do step                      |
| `instruction`         | `string`  |     ❌      | Instrução para o agente           |
| `handoff_to_operator` | `boolean` |     ❌      | Se transfere para operador humano |
| `sort_order`          | `number`  |     ❌      | Ordem                             |

---

### PackChannelBinding

Vínculo entre agente e canal de comunicação.

| Campo       | Tipo      | Obrigatório | Descrição                             |
| ----------- | --------- | :---------: | ------------------------------------- |
| `ref_key`   | `string`  |     ✅      | Identificador único                   |
| `agent_ref` | `string`  |     ✅      | → `PackAgent.ref_key`                 |
| `channel`   | `string`  |     ✅      | Canal: `"whatsapp"`, `"app"`, `"web"` |
| `is_active` | `boolean` |     ✅      | Se está ativo                         |
| `priority`  | `number`  |     ❌      | Prioridade (1 = mais alta)            |

---

### PackHandoffPolicy

Política de transferência entre canais.

| Campo            | Tipo                      | Obrigatório | Descrição                                                     |
| ---------------- | ------------------------- | :---------: | ------------------------------------------------------------- |
| `ref_key`        | `string`                  |     ✅      | Identificador único                                           |
| `agent_ref`      | `string`                  |     ✅      | → `PackAgent.ref_key`                                         |
| `name`           | `string`                  |     ✅      | Nome da política                                              |
| `from_channel`   | `string`                  |     ✅      | Canal de origem                                               |
| `to_channel`     | `string`                  |     ✅      | Canal de destino                                              |
| `trigger_type`   | `string`                  |     ✅      | Tipo de trigger (ex: `"keyword"`, `"timeout"`, `"sentiment"`) |
| `trigger_config` | `Record<string, unknown>` |     ❌      | Configuração do trigger                                       |
| `is_active`      | `boolean`                 |     ✅      | Se está ativa                                                 |

---

### PackAutomation

Automações disparadas por eventos do agente.

| Campo       | Tipo                      | Obrigatório | Descrição             |
| ----------- | ------------------------- | :---------: | --------------------- |
| `ref_key`   | `string`                  |     ✅      | Identificador único   |
| `agent_ref` | `string`                  |     ✅      | → `PackAgent.ref_key` |
| `name`      | `string`                  |     ✅      | Nome da automação     |
| `trigger`   | `string`                  |     ✅      | Evento disparador     |
| `action`    | `string`                  |     ✅      | Ação a executar       |
| `config`    | `Record<string, unknown>` |     ❌      | Configuração          |
| `is_active` | `boolean`                 |     ✅      | Se está ativa         |

---

## Sistema de ref_key

### Convenções de nomenclatura

| Entidade         | Prefixo sugerido | Exemplo                               |
| ---------------- | ---------------- | ------------------------------------- |
| ServiceCategory  | `cat_`           | `cat_banho`, `cat_consultas`          |
| ServiceType      | `type_`          | `type_banho_simples`, `type_consulta` |
| WorkflowTemplate | `wf_`            | `wf_atendimento`, `wf_urgencia`       |
| WorkflowStep     | `step_`          | `step_recepcao`, `step_execucao`      |
| Role             | `role_`          | `role_admin`, `role_atendente`        |
| DocumentTemplate | `doc_`           | `doc_recibo`, `doc_contrato`          |
| StepForm         | `form_`          | `form_checkin`, `form_diagnostico`    |
| CustomField      | `cf_`            | `cf_raca_animal`, `cf_porte`          |
| Agent            | `agent_`         | `agent_atendimento`                   |
| Playbook         | `pb_`            | `pb_whatsapp_atendimento`             |
| PlaybookRule     | `rule_`          | `rule_saudacao`                       |
| PlaybookTable    | `pbt_`           | `pbt_servicos`                        |
| AgentState       | `state_`         | `state_online`                        |
| AgentStateStep   | `ss_`            | `ss_boas_vindas`                      |
| ChannelBinding   | `cb_`            | `cb_whatsapp`                         |
| HandoffPolicy    | `hp_`            | `hp_urgencia`                         |
| Automation       | `auto_`          | `auto_notificar`                      |

### Regras de unicidade

- `ref_key` é único **por tipo de entidade** (não global)
- `cat_servicos` em `service_categories` e `cat_servicos` em `service_types` são entidades diferentes
- Mas recomendamos usar prefixos para evitar confusão

### Grafo de dependências

```
service_categories
    └── service_types
         └── workflow_templates
              ├── workflow_steps
              │    ├── workflow_step_transitions
              │    ├── deadline_rules
              │    ├── step_task_templates → roles
              │    ├── step_forms
              │    └── ocr_configs
              └── services
roles
    └── role_permissions (global permissions table)
document_templates (standalone)
custom_fields (standalone)
```

---

## Ordem de Aplicação (FK Dependencies)

O `applyTemplatePack()` aplica entidades na seguinte ordem para respeitar FKs:

1. `service_categories` → gera `categoryMap`
2. `workflow_templates` → gera `workflowMap`
3. `workflow_steps` (dentro dos templates) → gera `stepMap`
4. `service_types` → gera `serviceTypeMap`, vincula workflow
5. Atualiza vínculos bidirecionais workflow ↔ service_type
6. `workflow_step_transitions` → resolve `from_step_ref` / `to_step_ref`
7. `deadline_rules` → resolve `step_ref`
8. `roles` → gera `roleMap`
9. `role_permissions` → resolve permissões globais
10. `step_task_templates` → resolve `step_ref` + `assigned_role_ref`
11. `step_forms` → resolve `step_ref`
12. `document_templates`
13. `services` → resolve `type_ref`
14. `tenant_modules`
15. `ocr_configs` → resolve `step_ref`
16. Atualização da config do tenant
17. `custom_fields`

---

## Validação

O validador (`validatePack()`) verifica:

| Verificação                | Descrição                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------- |
| **ref_key duplicados**     | Nenhuma entidade pode ter ref_key duplicado no mesmo tipo                           |
| **category_ref**           | Cada `service_type.category_ref` deve existir em `service_categories`               |
| **workflow_ref**           | Cada `service_type.workflow_ref` (se definido) deve existir em `workflow_templates` |
| **service_type_ref**       | Cada `workflow_template.service_type_ref` deve existir em `service_types`           |
| **from/to_step_ref**       | Transições devem apontar para steps do mesmo template                               |
| **deadline step_ref**      | Deve existir em algum step de qualquer template                                     |
| **task step_ref**          | Deve existir em algum step                                                          |
| **task assigned_role_ref** | Se definido, deve existir em `roles`                                                |
| **form step_ref**          | Deve existir em algum step                                                          |
| **service type_ref**       | Deve existir em `service_types`                                                     |
| **ocr step_ref**           | Se definido, deve existir em algum step                                             |
| **custom_field ref_key**   | Únicos, com `target_table` + `field_key`                                            |
| **campos obrigatórios**    | `target_table`, `field_key`, `field_type` presentes                                 |

Execute o validador:

```bash
npx ts-node scripts/validate-pack.ts ./meu-pack.ts
```

---

## Limites e Restrições

| Limite                       | Valor                          |
| ---------------------------- | ------------------------------ |
| Categorias por pack          | Sem limite (recomendado: ≤ 10) |
| Tipos de serviço por pack    | Sem limite (recomendado: ≤ 20) |
| Workflows por pack           | Sem limite (recomendado: ≤ 10) |
| Steps por workflow           | Sem limite (recomendado: ≤ 10) |
| Roles por pack               | Sem limite (recomendado: ≤ 6)  |
| Custom fields por pack       | Sem limite (recomendado: ≤ 30) |
| Tamanho do HTML de templates | ≤ 500KB por template           |
| Tamanho total do pack JSON   | ≤ 5MB                          |
| Versão semver                | Formato `X.Y.Z` obrigatório    |

---

_Documento gerado automaticamente a partir de `data/template-packs/types.ts` e `data/agent-packs/types.ts`_
