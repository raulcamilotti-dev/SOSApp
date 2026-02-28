# Estratégia de Produto — Radul Platform

## O Dilema

Existe uma tensão real entre três forças:

```
         COMPLEXIDADE
         (muitas features, ERP)
              ▲
              │   ⚠️ Zona de perigo:
              │   treinamento obrigatório,
              │   SAP, Salesforce, Totvs
              │
              │         ★ Zona ideal:
              │         features ricas MAS
              │         cada uma simples
              │
NICHADO ◄─────┼─────► UNIVERSAL
(só 1 tipo)    │      (qualquer empresa)
              │
              │   ★ Você está aqui:
              │   motor genérico +
              │   packs por vertical
              │
              ▼
         SIMPLICIDADE
         (fácil, intuitivo, CRUD)
```

**A pergunta certa não é** "devo ser ERP ou vertical?" — **é:** "como adiciono capacidades sem sacrificar a autonomia do cliente?"

---

## O DNA do Produto (o que NÃO pode mudar)

A auditoria completa do codebase revela que o SOSApp tem um DNA técnico muito específico e valioso. Esse DNA é a essência que deve ser **preservada a todo custo**:

### Os 5 Pilares do DNA

| #   | Pilar                     | Como funciona hoje                                                                                                                                                                       | Por que é valioso                                                                                           |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | **CRUD-first**            | CrudScreen genérico (~3.200 linhas) renderiza qualquer tabela. **72 telas** usam o mesmo componente.                                                                                     | O usuário aprende UMA vez e sabe usar TUDO. Zero treinamento por feature nova.                              |
| 2   | **Schema-driven**         | `getTableInfo()` + `convertTableInfoToFields()` geram telas a partir do banco. `tables.tsx` é um code generator em tempo real.                                                           | Adicionar entidade nova = criar tabela + gerar tela. 5 minutos, não 5 dias.                                 |
| 3   | **Data-driven workflows** | Workflow engine completo (steps, transições, forms, SLA, tasks) configurado 100% via banco de dados.                                                                                     | Processo novo = registros no banco. Não precisa de desenvolvedor.                                           |
| 4   | **Multi-tenant isolado**  | `tenant_id` em tudo + multi-domain auth + tenant branding + SaaS billing por plano. Cada tenant é uma empresa independente.                                                              | Mesmo app, infinitas configurações. Um tenant é consultoria, outro é advocacia.                             |
| 5   | **Modules desacoplados**  | 13 módulos opt-in (core, financeiro, parceiros, documentos, ONR, AI, BI, CRM, PDV, produtos, estoque, compras, entregas). Navegação filtra automaticamente por módulos ativos do tenant. | Features são plug-ins, não monolito. Menus somem/aparecem por módulo ativo. ONR é integração, não vertical. |

### O número que importa

```
╔══════════════════════════════════════════╗
║  88% do codebase é UNIVERSAL             ║
║   8% é híbrido (engine genérico,         ║
║       nomenclatura de domínio)           ║
║   4% são integrações (ONR/cartório —     ║
║       módulo opcional para qualquer      ║
║       empresa que precise protocolar)    ║
╚══════════════════════════════════════════╝
```

**~160 de 169 telas** funcionam para qualquer tipo de empresa, sem mudança alguma. O financeiro, CRM, parceiros, AI agents, documentos, marketplace, PDV, estoque e workflows são 100% genéricos. As 4% verticais são integrações (ONR para protocolos em cartório) que qualquer empresa pode usar quando precisa.

---

## O Modelo Mental: Não é ERP. É Plataforma de Operações.

### O que você NÃO é

| Modelo                    | Exemplo                                              | Por que não é você                                                     |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| **ERP genérico**          | SAP, Totvs, Omie                                     | Tenta fazer tudo, exige implementador, meses de setup, caro            |
| **Vertical SaaS fechado** | Clio (só advocacia), ServiceTitan (só field service) | Código amarrado ao domínio, não serve para outro tipo de empresa       |
| **No-code/Low-code**      | Pipefy, Monday                                       | Flexível mas raso — o usuário constrói do zero, sem opinião de produto |

### O que você É

**Plataforma de Operações Configurável** — como Notion, mas para operações empresariais.

| Aspecto        | Notion                       | SOS Platform                                                  |
| -------------- | ---------------------------- | ------------------------------------------------------------- |
| Unidade básica | Página/Database              | CrudScreen/Tabela                                             |
| Personalização | Templates                    | Templates de workflow + catálogo de serviços                  |
| Complexidade   | O usuário monta o que quiser | O sistema já vem montado, o tenant ajusta                     |
| Público        | Qualquer pessoa              | Qualquer empresa de serviços                                  |
| Diferencial    | Flexível + bonito            | Flexível + opinado (já vem com workflow, kanban, assinaturas) |

**A frase que define o produto:**

> _"Tudo que sua empresa precisa para operar, sem precisar de alguém para te ensinar a usar."_

---

## Princípios de Design — As 7 Regras

Toda nova feature DEVE passar por estes 7 filtros antes de ser implementada:

### Regra 1: Se é CRUD, use CrudScreen

> "Se a feature pode ser modelada como uma tabela com campos, ela DEVE usar CrudScreen."

Por quê: O usuário já sabe usar. Não precisa aprender UI nova. Consistência = intuitividade.

**Exemplos:**

- ✅ `invoices` — é uma tabela com campos → CrudScreen
- ✅ `quotes` — é uma tabela com campos → CrudScreen
- ✅ `leads` — é uma tabela com campos → CrudScreen
- ✅ `time_entries` — é uma tabela com campos → CrudScreen
- ❌ Kanban board — precisa de UI especial → componente dedicado (mas poucos desses)

### Regra 2: Configuração no Banco, não no Código

> "Se o tenant pode querer de um jeito diferente, não pode estar hardcoded."

Por quê: Cada tenant é um tipo de empresa diferente. O que a advocacia chama de "processo", a consultoria chama de "projeto", e a prestadora chama de "ordem de serviço".

**Exemplos:**

- ✅ Tipos de serviço → tabela `service_types` (tenant configura)
- ✅ Workflow → tabela `workflow_templates` + `workflow_steps` (tenant configura)
- ✅ Permissões → tabela `role_permissions` (tenant configura)
- ❌ Tela com campos fixos que só servem para um domínio

### Regra 3: Feature Nova = Módulo Opcional

> "Nenhuma feature nova deve ser obrigatória. O tenant ativa o que precisa."

Por quê: Complexidade percebida = número de coisas visíveis. Se mostro 50 menus, parece SAP. Se mostro 8, parece Notion.

**Como implementar:** Uma tabela `tenant_modules` controla quais módulos estão ativos. Rotas/menus filtram com base nisso.

```
tenant_modules:
| tenant_id | module     | enabled |
|-----------|------------|---------|
| abc123    | financeiro | true    |
| abc123    | crm        | false   |
| abc123    | parceiros  | true    |
| def456    | financeiro | true    |
| def456    | crm        | true    |
| def456    | parceiros  | false   |
```

### Regra 4: Naming Genérico no Core, Naming de Domínio no Template

> "O código diz 'entity'. O template do cartório traduz para 'imóvel'. O template da advocacia traduz para 'processo'."

Por quê: Preserva universalidade do motor. Customização é na camada de apresentação/configuração.

**Exemplo concreto:**

- Engine: `service_orders` → campo `entity_id`, `entity_type`
- Template Advocacia: entity_type = "case", label exibe "Processo Judicial"
- Template Consultoria: entity_type = "project", label exibe "Projeto"
- Template Genérico: entity_type = "service", label exibe "Ordem de Serviço"

### Regra 5: Autonomia do Tenant > Poder da Feature

> "Se o tenant precisa ligar para o suporte para usar, a feature está errada."

Por quê: Esse é o diferencial competitivo. Pipefy e Monday são flexíveis mas exigem consultoria. A promessa do SOS é: **funciona out of the box.**

**Teste prático:** Antes de mergear, pergunte: _"Um dono de escritório de 3 pessoas consegue configurar isso sozinho em 10 minutos?"_ Se não, simplifique.

### Regra 6: Template Pack Resolve a Vertical

> "O nicho não está no código. Está no template pack pré-configurado."

Por quê: O motor é universal. O que muda entre uma advocacia e uma consultoria são:

- Tipos de serviço cadastrados
- Workflow templates pré-configurados
- Campos customizados por tipo de serviço
- Labels e terminologia
- Integrações ativadas

Isso tudo é DADO, não CÓDIGO.

### Regra 7: Cada Módulo é Simples Isoladamente

> "Faturamento não é SAP Finance. É uma lista de faturas com status. CRM não é Salesforce. É um kanban de leads."

Por quê: A soma de 10 módulos simples cria um sistema poderoso. Mas cada módulo individual deve ser compreensível em 30 segundos.

---

## Arquitetura em 3 Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                   CAMADA 3: TEMPLATE PACKS                   │
│                                                               │
│  📋 Jurídico (Advocacia)     📋 Comércio (Varejo/Atacado)    │
│  • service_types: ação cível, • service_types: venda,        │
│    contrato, consultoria        estoque, compra, entrega     │
│  • workflows: petição →       • workflows: pedido →           │
│    protocolo → audiência →      separação → expedição →      │
│    sentença                     entrega                      │
│  • módulos: docs + financeiro • módulos: pdv+stock+delivery  │
│                                                               │
│  📋 Consultoria              📋 Padrão (Genérico)            │
│  • service_types: projeto,    • service_types: (tenant cria) │
│    diagnóstico, suporte       • workflows: (tenant config.)  │
│  • workflows: proposta →      • módulos: core                │
│    kickoff → entregas                                        │
│                                                               │
│  📋 Saúde                    📋 Revenda                      │
│  • service_types: consulta,   • service_types: encomenda,    │
│    exame, procedimento          recebimento, expedição       │
│  • módulos: parceiros+fin.   • módulos: pdv+stock+purchases │
│                                                               │
│  🤖 Agent Packs (IA) — 2 packs                              │
│  • agents: atendimento,       • playbooks: regras, tabelas   │
│    operacional, supervisão    • handoff: WhatsApp → Operador │
│  • states: online/offline     • bindings: canal ↔ agente     │
└─────────────────────────────────────────────────────────────┘
                         ↕ configura
┌─────────────────────────────────────────────────────────────┐
│                 CAMADA 2: MÓDULOS OPCIONAIS                  │
│                 (tenant ativa o que precisa)                  │
│                                                               │
│  💰 Financeiro      📊 CRM/Leads     🔧 Parceiros           │
│  • invoices         • leads+kanban    • partner portal       │
│  • payments         • campanhas       • aceitar/recusar      │
│  • quotes           • follow-ups      • ganhos/comissões     │
│  • bank reconcil.   • conversão       • disponibilidade      │
│  • inadimplentes    • dashboard       • folgas               │
│                                                               │
│  📄 Documentos+     🤖 AI / Automação 📈 BI / Analytics     │
│  • templates        • 9 telas agents  • dashboards           │
│  • assinaturas      • agent packs     • reports              │
│  • OCR              • playbooks       • cross-filter         │
│  • template editor  • handoff policies                       │
│                                                               │
│  🏛️ ONR & Cartório  💳 SaaS Billing   🌐 Portal Cliente     │
│  • protocolos ONR   • 5 planos tier   • link público         │
│  • certidões        • PIX recorrente  • aprovação online     │
│  • cartórios        • dashboard SaaS  • review automático    │
│                                                               │
│  🛒 PDV & Produtos  📦 Estoque        🚚 Compras/Entregas   │
│  • catálogo         • movimentações   • pedidos de compra    │
│  • shopping cart    • locais estoque  • fornecedores         │
│  • checkout         • alertas         • expedição            │
│  • marketplace      • separação       • rastreamento         │
│  • composições/BOM  • kanban          • rotas                │
└─────────────────────────────────────────────────────────────┘
                         ↕ construído sobre
┌─────────────────────────────────────────────────────────────┐
│                    CAMADA 1: CORE PLATFORM                    │
│                    (sempre ligado, universal)                 │
│                                                               │
│  🔄 CrudScreen    📋 Workflow Engine   📌 Kanban             │
│  (72 telas,       (qualquer processo)  (qualquer board)      │
│  qualquer tabela)                                             │
│                                                               │
│  👥 Users/Roles   🏢 Multi-tenant      🔐 Auth              │
│  (RBAC, 206      (isolamento +        (CPF, OAuth, Gov.br   │
│   permissions)    multi-domain)        + multi-domain)       │
│                                                               │
│  🔔 Notificações  📅 Calendário        📊 api_crud          │
│  (9 tipos,        (iCal, export)       (endpoint dinâmico    │
│   4 canais)                             para qualquer        │
│                                         tabela)              │
│                                                               │
│  🔍 GlobalSearch  🧭 Breadcrumbs       🎨 Tenant Branding   │
│  (busca telas,    (navegação           (cor, logo, nome      │
│   desktop+mobile)  hierárquica)         por domínio)         │
│                                                               │
│  💳 Payment GW    📄 Content Pages     🤝 Channel Partners  │
│  (Asaas, MP,      (blog, landing       (referral codes,     │
│   Mock — 3 GW)     pages, CMS)          comissões)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Classificação das Features do Estudo de Mercado

Revisitando os 20 gaps identificados no estudo de mercado, agora sob a ótica de **"é universal?"**:

### ✅ Features Universais (servem qualquer empresa)

| Gap | Feature                    | Por que é universal                    | Complexidade p/ usuário             |
| --- | -------------------------- | -------------------------------------- | ----------------------------------- |
| 1   | **Faturamento** ✅         | Toda empresa emite fatura              | BAIXA — é um CrudScreen de invoices |
| 2   | **Time Tracking**          | Toda empresa de serviço controla tempo | BAIXA — timer + CrudScreen          |
| 3   | **CRM / Leads** ✅         | Toda empresa capta clientes            | BAIXA — kanban de leads             |
| 4   | **Orçamentos** ✅          | Toda empresa faz proposta              | BAIXA — CrudScreen de quotes        |
| 5   | **Contratos/SLA** ✅       | Toda empresa tem contratos             | BAIXA — CrudScreen + template       |
| 7   | **Portal cliente web** ✅  | Todo cliente quer acompanhar           | MÉDIA — PWA/link público            |
| 8   | **Pagamento online** ✅    | Todo cliente quer pagar fácil          | MÉDIA — integração gateway          |
| 9   | **Review automático**      | Todo serviço pode ser avaliado         | BAIXA — automação existente         |
| 10  | **Estimativa prazo/custo** | Todo cliente quer saber antes          | BAIXA — campos em service_types     |
| 11  | **Portal parceiro**        | Toda empresa com terceiros             | BAIXA — tela dedicada por role      |
| 12  | **Distribuição trabalho**  | Toda empresa com equipe                | MÉDIA — matching engine             |
| 13  | **Comissionamento**        | Todo parceiro quer ver ganhos          | BAIXA — CrudScreen                  |
| 14  | **Email integrado**        | Toda empresa usa email                 | MÉDIA — integração Gmail/Outlook    |
| 16  | **AI assistente**          | Qualquer contexto                      | MÉDIA — copilot no kanban           |

### 🔶 Features Localizadas (específicas do Brasil, mas multi-vertical)

| Gap | Feature                                           | Verticais que usam |
| --- | ------------------------------------------------- | ------------------ |
| 6   | **Integração contábil** (Omie, Bling, Conta Azul) | Todas no Brasil    |
| 19  | **NFSe automática**                               | Todas no Brasil    |

### 🔴 Features Verticais (específicas de um segmento)

| Gap | Feature                     | Vertical                                         | Como isolar                                 |
| --- | --------------------------- | ------------------------------------------------ | ------------------------------------------- |
| 15  | **Dispatch com mapa**       | Field service                                    | Módulo "campo"                              |
| 17  | **Visual workflow builder** | Power users / BPM                                | Módulo "avançado"                           |
| 18  | **e-Notariado/CENSEC**      | Empresas que precisam de protocolos em cartório  | Módulo opcional `onr_cartorio` (integração) |
| 20  | **Tabela emolumentos**      | Empresas que trabalham com registros em cartório | Módulo opcional `onr_cartorio` (integração) |

### Resultado: **14 de 20 gaps (70%) são features universais.**

O estudo de mercado NÃO está pedindo que você se nicha. Está pedindo que você construa features que **toda empresa precisa** — e a maioria já foi implementada.

---

## Como Construir Sem Perder a Essência

### O Teste do CrudScreen

Para cada feature nova, faça a pergunta:

```
"Essa feature pode ser um CrudScreen com N campos?"

SIM → implementar como CrudScreen (consistente, zero treinamento)
NÃO → é uma das RARAS exceções que justifica UI dedicada
      (kanban, calendário, dashboard, mapa — coisas visuais)
```

### Mapa de implementação: Feature → Como implementar preservando o DNA

| Feature            | Tabelas                      | Como o usuário usa                                                                                                                    | Treinamento necessário         |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Faturamento**    | `invoices`, `invoice_items`  | CrudScreen de faturas. Status: rascunho → enviada → paga → vencida. PDF automático.                                                   | ZERO — já sabe usar CrudScreen |
| **Orçamentos**     | `quotes`, `quote_items`      | CrudScreen. Link público para cliente aprovar. Ao aprovar → cria service_order automático.                                            | ZERO                           |
| **CRM / Leads**    | `leads`                      | Kanban visual (mesmo padrão do kanban-processos). Arrastar = mudar stage.                                                             | ZERO — já sabe usar kanban     |
| **Time Tracking**  | `time_entries`               | Botão ▶️ no task-detail e no kanban. CrudScreen para ver/editar entradas.                                                             | MÍNIMO — um botão              |
| **Comissões**      | `partner_earnings`           | CrudScreen read-only para parceiro. Admin vê tudo, parceiro vê os seus.                                                               | ZERO                           |
| **Estimativa**     | Campos em `service_types`    | Campos `estimated_cost_min`, `estimated_cost_max`, `estimated_days` no CrudScreen de ServiceTypes. Exibe na tela de SolicitarServico. | ZERO — são campos              |
| **Reviews**        | Automação no workflow engine | Ao concluir processo → automação existente dispara link de avaliação.                                                                 | ZERO — automação configurada   |
| **Portal cliente** | Rota pública `/p/:token`     | Link compartilhável via WhatsApp. Exibe timeline do processo (read-only).                                                             | ZERO — é um link               |
| **Pagamento**      | `payments` + gateway         | Botão "Pagar" na fatura do portal. PIX QR code, link cartão.                                                                          | MÍNIMO — um botão              |

### O que NÃO implementar como CrudScreen (UI especial justificada)

| Feature               | UI Dedicada                 | Justificativa                                              |
| --------------------- | --------------------------- | ---------------------------------------------------------- |
| Kanban de leads (CRM) | Board com colunas drag-drop | Visualização é o valor — tabela não funciona para pipeline |
| Dashboard financeiro  | Cards + gráficos Metabase   | Resumo visual, não lista de registros                      |
| Timer de tempo        | Widget flutuante / inline   | Interação de 1 clique, não formulário                      |
| Mapa de dispatch      | Mapa com pins               | Geográfico, não tabular                                    |

---

## Sistema de Módulos — Implementação

### Tabela `tenant_modules`

```sql
CREATE TABLE tenant_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    module_key VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    enabled_at TIMESTAMP,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, module_key)
);
```

### Módulos Definidos

| module_key      | Label                       | Inclui                                                                                                                            | Dependências | Status |
| --------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| `core`          | Core (sempre ativo)         | CrudScreen, Workflow, Kanban, Users, Calendar, Notifications, Clientes, Empresas                                                  | —            | ✅     |
| `financial`     | Financeiro                  | Dashboard, Contas a Receber/Pagar, Faturas, Pagamentos, Inadimplentes, Ganhos, DRE                                                | core         | ✅     |
| `partners`      | Gestão de Parceiros         | Parceiros, Meus Trabalhos, Ganhos, Aceitar/Recusar, Comissões PIX, Channel Partners                                               | core         | ✅     |
| `documents`     | Documentos Avançados        | Templates, Assinaturas Digitais, OCR Config/Results, Gerador de Documentos                                                        | core         | ✅     |
| `onr_cartorio`  | ONR & Cartório (Integração) | Protocolos ONR, Certidões, Cadastro de Cartórios — disponível para qualquer empresa que precise protocolar documentos em cartório | documents    | ✅     |
| `ai_automation` | IA & Automação              | Agents, insights por tela, OCR inteligente, Marketing AI                                                                          | core         | ✅     |
| `bi_analytics`  | BI & Analytics              | Metabase dashboards embedded, relatórios, cross-filter                                                                            | core         | ✅     |
| `crm`           | CRM & Leads                 | leads, pipeline, kanban, campanhas, follow-ups, conversão lead→cliente, formulários públicos                                      | core         | ✅     |
| `pdv`           | PDV / Ponto de Venda        | Shopping cart, checkout, marketplace, catálogo público                                                                            | products     | ✅     |
| `products`      | Produtos & Serviços         | Catálogo de produtos, composições/BOM, custos, categorias                                                                         | core         | ✅     |
| `stock`         | Estoque                     | Movimentações, locais de estoque, alertas, separação kanban                                                                       | products     | ✅     |
| `purchases`     | Compras                     | Pedidos de compra, fornecedores, recebimento                                                                                      | products     | ✅     |
| `delivery`      | Entregas                    | Expedição, rastreamento, rotas de entrega                                                                                         | stock        | ✅     |

### Como afeta a navegação

```typescript
// Exemplo conceitual — filtrar menus por módulos ativos
const activeModules = useTenantModules(); // from context/API

const menuItems = allMenuItems.filter(
  (item) => !item.requiredModule || activeModules.includes(item.requiredModule),
);
```

**Efeito:** Tenant que ativa só `core` + `financeiro` vê 12 menus. Tenant que ativa tudo vê 30. A complexidade é **proporcional ao que o tenant precisa**, não ao que o sistema tem.

---

## Template Packs — Como Nichar Sem Nichar

### O conceito

Um Template Pack é um **pacote de dados pré-configurados** (não código) que transforma o SOS Platform no "SOS para [vertical]":

```
Template Pack = {
    service_categories: [...],    // categorias pré-cadastradas
    service_types: [...],         // tipos de serviço com preços/prazos
    workflow_templates: [...],    // fluxos de trabalho pré-montados
    workflow_steps: [...],        // etapas de cada fluxo
    step_forms: [...],            // formulários por etapa
    deadline_rules: [...],        // SLAs por etapa
    roles: [...],                 // papéis com permissões ajustadas
    document_templates: [...],    // modelos de documentos
    modules_enabled: [...],       // quais módulos vêm ativados
    labels: {...}                 // terminologia customizada
}
```

### Exemplos de Template Packs

| Pack                  | Categorias                                      | Workflows                                     | Módulos                                   | Terminologia                         |
| --------------------- | ----------------------------------------------- | --------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| **Padrão (Genérico)** | (o tenant cria as suas)                         | (o tenant configura os seus)                  | core                                      | (usa termos padrão)                  |
| **Jurídico**          | Consultoria, Contencioso, Contratos, Compliance | Petição → Protocolo → Audiência → Sentença    | core + documentos + financeiro            | "Processo", "Causa", "Honorários"    |
| **Comércio**          | Vendas, Estoque, Compras, Entregas              | Pedido → Separação → Expedição → Entrega      | core + pdv + products + stock + delivery  | "Produto", "Pedido", "Estoque"       |
| **Consultoria**       | Projeto, Diagnóstico, Implementação, Suporte    | Proposta → Kickoff → Entregas → Encerramento  | core + crm + financeiro                   | "Projeto", "Entregável", "Sprint"    |
| **Saúde**             | Consulta, Exame, Procedimento, Retorno          | Agendamento → Triagem → Atendimento → Alta    | core + parceiros + financeiro             | "Paciente", "Consulta", "Prontuário" |
| **Revenda**           | Produtos, Catálogo, Marketplace, Pedidos        | Encomenda → Recebimento → Expedição → Entrega | core + pdv + products + stock + purchases | "Fornecedor", "Lote", "Margem"       |

**Packs futuros possíveis:** Cartório & Registro (ONR), Cobrança, Imobiliária, Contabilidade, Despachante — definidos como possíveis expansões via criação de novos arquivos em `data/template-packs/`.

### Onboarding com Template Pack

```
1. Tenant cria conta
2. "Qual o tipo da sua empresa?" → seleciona Pack
3. Sistema aplica Pack (inserts no banco)
4. Tenant vê o sistema já configurado para o seu negócio
5. Tenant ajusta o que quiser (renomeia, adiciona, remove)
6. Pronto — operando em 15 minutos
```

**A mágica:** O tenant escolhe "Cartório" e recebe o sistema pronto com workflows, serviços e documentos do segmento. Mas por baixo, é o MESMO motor que roda para a advocacia, a imobiliária e o despachante.

---

## Roadmap Revisado: Preservando o DNA

### Princípio: Cada fase entrega valor universal, não vertical.

### Fase -1 — Fortalecer o Motor (CRUD + API) — 2-3 semanas

> **Objetivo:** O CrudScreen é o DNA do produto. Antes de construir faturamento, CRM, portal etc. EM CIMA dele, precisamos torná-lo robusto o suficiente para suportar tudo. Cada melhoria aqui beneficia TODAS as 72+ telas existentes.

#### Tier 1 — Crítico (sem isto, módulos financeiros não funcionam) — ✅ IMPLEMENTADO

| #    | Melhoria                            | Tipo   | Status                                                                |
| ---- | ----------------------------------- | ------ | --------------------------------------------------------------------- |
| -1.1 | **Tipo `date`/`datetime`**          | Campo  | ✅ DateTimePicker nativo mobile + input type="date" web, locale pt-BR |
| -1.2 | **Tipo `currency`/`number`**        | Campo  | ✅ decimal-pad keyboard, R$ formatação, parse automático no save      |
| -1.3 | **Paginação server-side**           | API+UI | ✅ `paginatedLoadItems` prop + limit/offset + "Carregar mais" UI      |
| -1.4 | **Resolver N+1 de referências**     | Perf   | ✅ Batch via operador `in`, 1 req/tabela, chunked 50 IDs              |
| -1.5 | **Validação por campo**             | Form   | ✅ `validate?: (value, formState) => string \| null`                  |
| -1.6 | **`KeyboardAvoidingView` no modal** | UX     | ✅ Wraps form modal (iOS padding, Android height)                     |

#### Tier 2 — Importante (CRM, Portal, Parceiros) — ✅ MAIORIA IMPLEMENTADA

| #     | Melhoria                                   | Tipo  | Status                                                             |
| ----- | ------------------------------------------ | ----- | ------------------------------------------------------------------ |
| -1.7  | **Tipo `email`/`phone`/`url`**             | Campo | ✅ Keyboard correto + autoCapitalize/autoComplete                  |
| -1.8  | **Tipo `masked`** (CPF/CNPJ/CEP)           | Campo | ✅ `type: "masked"` + `maskType` (cpf, cnpj, cep, phone, cpf_cnpj) |
| -1.9  | **Visibilidade condicional**               | Form  | ✅ `showWhen?: (formState) => boolean`                             |
| -1.10 | **Seções/grupos de campos**                | Form  | ✅ `section` prop renderiza cabeçalhos entre grupos                |
| -1.11 | **`readOnly` funcionar em todos os tipos** | Fix   | ✅ Boolean, Reference e Select respeitam readOnly                  |
| -1.12 | **Soft-delete automático no list**         | API   | ✅ `autoExcludeDeleted` em `buildSearchParams`                     |

#### Tier 3 — Escala

| #     | Melhoria                                  | Tipo     | Status                                                                                                               |
| ----- | ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| -1.13 | **Export CSV/PDF**                        | UI       | ❌                                                                                                                   |
| -1.14 | **Seleção em lote + ações bulk**          | UI       | ❌                                                                                                                   |
| -1.15 | **Vista tabela para desktop**             | UI       | ❌                                                                                                                   |
| -1.16 | **Consolidar `convertTableInfoToFields`** | Refactor | ✅ Exportado do CrudScreen.tsx como função compartilhada. customers.tsx usa wrapper com overrides de visibilidade.   |
| -1.17 | **Detecção inteligente de tipos**         | Schema   | ✅ `*_amount`→currency, `timestamptz`→datetime, `email`→email, `phone`→phone etc.                                    |
| -1.18 | **Agregação no api_crud**                 | API      | ✅ `aggregateCrud()` + `buildAggregatePayload()` em `services/crud.ts`. Código N8N em `n8n/aggregate-action-code.js` |

#### Ordem de Implementação

```
✅ Semana 1:  -1.1 (date) + -1.2 (currency/number) + -1.6 (KeyboardAvoiding) + -1.5 (validação) + -1.7 (email/phone/url) + -1.9 (showWhen) + -1.11 (readOnly fix) + -1.17 (smart detection)
✅ Semana 2:  -1.3 (paginação) + -1.4 (batch references)
✅ Semana 3:  -1.8 (masked) + -1.10 (sections) + -1.12 (auto soft-delete filter)
Ongoing:   -1.13 a -1.18 conforme necessidade das fases seguintes
```

**DNA preservado:** Tudo continua sendo CrudScreen. As melhorias são no COMPONENTE, não em telas individuais. Cada melhoria beneficia todas as 37+ telas automaticamente.

---

### Fase 0 — Fundação Modular (1-2 semanas) — ✅ IMPLEMENTADA

> **Objetivo:** Criar a infraestrutura de módulos para que tudo que vier depois seja opt-in.

| #   | Tarefa                                   | Tipo       | Status |
| --- | ---------------------------------------- | ---------- | ------ |
| 0.1 | Tabela `tenant_modules`                  | Migration  | ✅     |
| 0.2 | Hook `useTenantModules()` + context      | Frontend   | ✅     |
| 0.3 | Filtro de navegação por módulos ativos   | Frontend   | ✅     |
| 0.4 | Tela admin para ativar/desativar módulos | CrudScreen | ✅     |
| 0.5 | Seed dos módulos para tenants existentes | Script     | ✅     |

**DNA preservado:** Menus ficam limpos. Tenant vê SÓ o que precisa.

### Fase 1 — Portal Público (2-3 semanas)

> **Objetivo:** O cliente acompanha sem instalar. Transparência total. Não depende de modelo de monetização.

| #   | Feature                   | Implementação                                                           | Status |
| --- | ------------------------- | ----------------------------------------------------------------------- | ------ |
| 1.1 | Rota pública `/p/:token`  | Timeline do processo (read-only, sem login) + verificação CPF 4 dígitos | ✅     |
| 1.2 | Barra de progresso %      | Step atual / total steps (dado já existe)                               | ✅     |
| 1.3 | Estimativa de prazo/custo | Campos em `service_orders` (parceiro preenche após avaliação inicial)   | ✅     |
| 1.4 | Review automático         | Página pública `/p/review/:token` + botão CTA no portal concluído       | ✅     |
| 1.5 | Link no WhatsApp          | Botão WhatsApp no Processo + template com link portal e review          | ✅     |

**DNA preservado:** Nenhuma UI nova para o operador. Tudo automático ou configuração de campos.

### Fase 2 — Monetização (3-4 semanas) ✅

> **Objetivo:** O tenant pode cobrar. O cliente pode pagar. Tudo via padrões conhecidos.

| #    | Feature                   | Implementação                                             | Como usa                                                          | Status |
| ---- | ------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| 2.1  | `service_prices`          | CrudScreen — preço por tipo de serviço por tenant         | Admin preenche tabela de preços                                   | ❌     |
| 2.2  | `quotes`                  | QuoteSection + modal — itens, total, validade, desconto   | Gera orçamento em qualquer etapa do workflow, com itens dinâmicos | ✅     |
| 2.3  | Link público do orçamento | Rota `/q/:token` — cliente vê itens, total, aprova/recusa | Link via WhatsApp, botões Aprovar/Recusar + motivo                | ✅     |
| 2.4  | `invoices`                | CrudScreen — fatura com status lifecycle + PIX + anexo NF | Gerada ao aprovar orçamento ou manualmente                        | ✅     |
| 2.5  | Pagamento (PIX/cartão)    | CrudScreen `payments` — PIX, cartão, boleto, comprovante  | Registra e confirma pagamentos                                    | ✅     |
| 2.6  | Dashboard financeiro      | Tela dedicada — KPIs, receita mensal, transações recentes | Admin vê resumo financeiro completo                               | ✅     |
| 2.7  | Contas a Receber          | CrudScreen `accounts_receivable` com status lifecycle     | Lista de recebíveis, vínculos com faturas e orçamentos            | ✅     |
| 2.8  | Contas a Pagar            | CrudScreen `accounts_payable` com tags e categorização    | Despesas, pagamentos a parceiros, impostos                        | ✅     |
| 2.9  | Inadimplentes             | Tela dedicada com SQL customizado + ações por cliente     | Gestão de clientes com pagamentos em atraso + resumo financeiro   | ✅     |
| 2.10 | Recibos automáticos       | Auto-geração PDF ao confirmar pagamento em fatura         | Recibo com dados do pagamento, fatura e cliente                   | ✅     |

**DNA preservado:** 7 de 10 itens são CrudScreen puros. Recibos são geração automática. Dashboard é a única UI especial.

### Fase 3 — CRM & Captação (2-3 semanas) ✅

> **Objetivo:** O tenant não só gerencia clientes existentes — atrai novos.

| #   | Feature                  | Implementação                                                                         | Status |
| --- | ------------------------ | ------------------------------------------------------------------------------------- | ------ |
| 3.1 | Tabela `leads`           | CrudScreen + kanban (mesmo padrão do kanban-processos)                                | ✅     |
| 3.2 | Pipeline visual          | Kanban drag-drop por estágio (crm-kanban.tsx) + detalhe do lead (crm-lead-detail.tsx) | ✅     |
| 3.3 | Campanhas                | CrudScreen campanhas + dashboard de campanhas com KPIs                                | ✅     |
| 3.4 | Conversão lead → cliente | Botão "Converter" → cria customer + service_order                                     | ✅     |
| 3.5 | Formulário público embed | Rota `/f/:formId` → insere lead automaticamente                                       | ❌     |
| 3.6 | Follow-up automático     | Automação: lead sem resposta X dias → lembrete                                        | ❌     |

**DNA preservado:** Kanban existe. CrudScreen existe. É reutilização.

### Fase 4 — Parceiros (2-3 semanas) ✅

> **Objetivo:** Profissionais de campo têm experiência dedicada.

| #   | Feature               | Implementação                                                    | Status |
| --- | --------------------- | ---------------------------------------------------------------- | ------ |
| 4.1 | Tela "Meus Trabalhos" | Tela dedicada filtrada por `partner_id` com tabs e resumo ganhos | ✅     |
| 4.2 | Aceitar/Recusar       | Botões na listagem + logs + início/finalização de execução       | ✅     |
| 4.3 | `partner_earnings`    | CrudScreen admin + aba de ganhos no Meus Trabalhos + PIX + anexo | ✅     |
| 4.4 | Checklist de execução | Step forms (já existe no workflow engine)                        | ✅     |

**DNA preservado:** Usa CrudScreen + workflow engine. Nada novo no motor.

### Fase 5 — Template Packs (2-3 semanas) ✅

> **Objetivo:** Onboarding de 15 minutos para qualquer vertical.

| #   | Tarefa                                  | Tipo                                    | Status |
| --- | --------------------------------------- | --------------------------------------- | ------ |
| 5.1 | Estrutura de template pack (JSON/seed)  | Data                                    | ✅     |
| 5.2 | Script de aplicação de pack             | Backend                                 | ✅     |
| 5.3 | Tela de seleção de pack no onboarding   | UI                                      | ✅     |
| 5.4 | Pack "Cartório & Registro" (integração) | Data (para empresas que usam cartórios) | ✅     |
| 5.5 | Pack "Genérico" (empresa de serviço)    | Data                                    | ✅     |
| 5.6 | Pack "Advocacia"                        | Data                                    | ✅     |

---

## Resumo Visual da Estratégia

```
INÍCIO (2025)                  HOJE (Fev 2026)
──────────────                 ────────────────

"SOS Escritura"               "Radul Platform"
  (MVP inicial)                 (qualquer empresa)

┌─────────┐                   ┌──────────────────────────┐
│ Motor   │                   │ Motor universal           │
│ genérico│                   │ (o mesmo de sempre)       │
│ + MVP   │     ────────►     │ + 13 módulos opt-in       │
│ initial │                   │ + 6 template packs        │
│         │                   │ + 2 agent packs           │
└─────────┘                   │ + portal público          │
                              │ + financeiro completo     │
 ~82 telas                    │ + CRM com kanban          │
 42 CrudScreens               │ + AI agents (9 telas)     │
 ~38 admin pages              │ + SaaS billing            │
 ~20 services                 │ + bank reconciliation     │
 3 template packs             │ + multi-domain auth       │
 7 módulos                    │ + tenant branding         │
                              │ + global search           │
                              │ + breadcrumbs             │
                              │ + marketplace / PDV       │
                              │ + estoque + compras       │
                              │ + payment gateways (3)    │
                              │ + content pages (CMS)     │
                              │ + channel partners        │
                              │ + DRE + export contábil   │
                              │ + contratos + SLA         │
                              └──────────────────────────┘

                               169 telas
                               72 CrudScreens
                               114 admin pages
                               76 services
                               6 template packs + 2 agent packs
                               13 módulos
                               40 migrations
                               10 hooks

88% universal
 8% híbrido (engine genérico, nomenclatura de domínio)
 4% integrações (ONR/cartório, isolado em módulos opcionais)
```

---

## Estratégia de Parceiros: Build vs Embed vs Integrar

### O Princípio do "Single Pane of Glass"

O SOSApp já pratica, sem ter dado esse nome, um modelo poderoso: **o usuário nunca sai do sistema**. Cada parceiro externo é consumido de forma invisível — o cliente interage com o SOS, não com Metabase, não com Tesseract, não com Documenso.

```
O que o CLIENTE vê:                O que EXISTE por trás:
─────────────────────              ────────────────────────

  ┌───────────────┐      ┌─ N8N (backend inteiro)
  │               │      ├─ PostgreSQL (dados)
  │   SOS App     │      ├─ Documenso (assinaturas)
  │               │◄────►├─ Metabase (dashboards)
  │  (uma tela,   │      ├─ Tesseract.js (OCR)
  │   um fluxo,   │      ├─ BrasilAPI (CEP/CNPJ)
  │   uma marca)  │      ├─ ReceitaWS (sócios)
  │               │      ├─ Google Drive (arquivos)
  └───────────────┘      ├─ Gov.br (identidade)
                         ├─ WhatsApp (chat)
                         └─ Plausible (analytics)
```

**Isso É o diferencial.** Nenhum concorrente brasileiro monta essa orquestra. O Pipefy usa SendGrid, Stripe, DocuSign — mas cada um é uma conta separada, uma fatura separada, uma experiência separada.

O SOS compõe tudo num fluxo único onde o cliente só vê **uma tela, um login, uma experiência**.

---

### Inventário Atual de Parceiros

#### 🟢 Open-Source Self-Hosted (custo = infra apenas)

| Parceiro       | O que faz no SOS                                       | O que substituiria                                 | Custo atual     | Custo se fizesse interno               |
| -------------- | ------------------------------------------------------ | -------------------------------------------------- | --------------- | -------------------------------------- |
| **N8N**        | Backend inteiro — API, auth, SQL, webhooks, automações | Express/NestJS + 6 meses de dev                    | ~R$100/mês VPS  | 6+ meses de backend dev                |
| **PostgreSQL** | Banco de dados — 60+ tabelas, queries dinâmicas        | Supabase ($25+/mo), Firebase (vendor lock)         | ~R$50/mês VPS   | Nada — PG é o padrão                   |
| **Documenso**  | Assinatura digital — eletrônica + ICP-Brasil           | DocuSign ($25-65/user/mo), HelloSign               | ~R$50/mês VPS   | DocuSign = R$150-400/mês por tenant    |
| **Metabase**   | BI — dashboards embedded, cross-filter, SQL queries    | Looker ($5K+/mo), Tableau ($70/user/mo)            | ~R$50/mês VPS   | 2-3 meses de dev para dashboard engine |
| **Plausible**  | Analytics — LGPD-compliant, sem cookies                | Google Analytics (privacidade), Mixpanel ($25+/mo) | ~R$30/mês VPS   | GA é gratuito mas não LGPD-safe        |
| **Nginx**      | Web server — SPA routing                               | Vercel ($20+/mo), Netlify                          | Incluído no VPS | Quase nada                             |

**Custo total self-hosted: ~R$280/mês** para ter funcionalidades que custariam **R$3.000-10.000/mês** em SaaS equivalentes.

#### 🔵 Open-Source Libraries (custo = zero)

| Biblioteca               | O que faz                    | Alternativa paga                        |
| ------------------------ | ---------------------------- | --------------------------------------- |
| **Tesseract.js**         | OCR em browser (WebAssembly) | Google Cloud Vision ($1.50/1K imagens)  |
| **pdfjs-dist**           | PDF → imagem para OCR        | Server-side Ghostscript ou PDF API paga |
| **expo-auth-session**    | OAuth flows (Google, Gov.br) | Auth0 ($23+/mo), Firebase Auth          |
| **expo-secure-store**    | Storage seguro de tokens     | Custom Keychain wrapper                 |
| **react-native-webview** | Embeddar Metabase dashboards | Custom charting library                 |

**Custo total: R$0.** E são battle-tested por milhões de desenvolvedores.

#### 🟡 APIs Externas Gratuitas

| API              | O que faz                                | Limite            | Risco                                      |
| ---------------- | ---------------------------------------- | ----------------- | ------------------------------------------ |
| **BrasilAPI**    | CEP, CNPJ, feriados, bancos              | Sem limite formal | Community-maintained — pode ficar instável |
| **ViaCEP**       | Fallback de CEP                          | Sem limite        | Estável há 10+ anos                        |
| **Google OAuth** | Login social                             | Sem limite        | Zero risco — Google manterá                |
| **Gov.br**       | Login CPF verificado (150M+ brasileiros) | Sem limite        | Governamental — estável                    |

**Custo total: R$0.** Com cache local (`brasil_api_cache`), o uso é conservador.

#### 🟠 APIs Externas Pagas/Freemium

| API                       | O que faz                                 | Custo atual                | Custo em escala                       |
| ------------------------- | ----------------------------------------- | -------------------------- | ------------------------------------- |
| **ReceitaWS**             | CNPJ detalhado (sócios, Simples Nacional) | Free (3 req/min) com queue | R$99-499/mês se volume crescer        |
| **Google Drive**          | Armazenamento de arquivos                 | Free (15GB) via N8N        | R$36/user/mês (Workspace)             |
| **WhatsApp Business API** | Chat bot + operador                       | Varia (~$0.005/msg)        | ~R$200-500/mês estimado               |
| **ONR/SREI**              | Protocolos eletrônicos                    | Emolumentos por ato        | Variável — custo repassado ao cliente |
| **Expo/EAS**              | Build & deploy                            | Free 30 builds/mo          | R$500/mês (Production plan)           |

**Custo total variável: ~R$300-1.500/mês** dependendo de volume.

---

### O Framework de Decisão: Build vs Embed vs Integrar

Para cada capacidade que o SOS precisa, há 3 caminhos possíveis. A decisão depende de 5 critérios:

```
                    BUILD                   EMBED                  INTEGRAR
                 (fazer interno)     (open-source dentro)     (API/SaaS externo)
                      │                      │                       │
Controle total   ★★★★★                 ★★★★☆                  ★★☆☆☆
Custo initial    ★☆☆☆☆ (alto)          ★★★★★ (baixo)          ★★★★☆ (baixo)
Custo recorrente ★★★★★ (zero)          ★★★★☆ (infra)          ★★☆☆☆ (por uso)
Velocidade       ★☆☆☆☆ (lento)         ★★★★☆ (rápido)         ★★★★★ (mais rápido)
Manutenção       ★☆☆☆☆ (é toda sua)    ★★★☆☆ (comunidade+vc)  ★★★★★ (é deles)
UX unificada     ★★★★★                 ★★★★☆                  ★★☆☆☆
```

### A Regra de Ouro

> **EMBED quando existir open-source maduro.**
> **INTEGRAR quando for regulado, comoditizado ou custaria anos para fazer.**
> **BUILD quando for o seu diferencial competitivo.**

### Classificação de Cada Capacidade

| Capacidade             | Decisão     | Por quê                                                                                                                                             | Exemplo               |
| ---------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Workflow engine**    | ✅ BUILD    | É o diferencial competitivo central. Nenhum parceiro dá a flexibilidade necessária. Conectaria com Pipefy/N8N mas perderia as integrações internas. | `process-engine.ts`   |
| **CrudScreen**         | ✅ BUILD    | É o DNA do produto. Nenhum framework de CRUD tem schema-driven + quick-create + reference resolution.                                               | `CrudScreen.tsx`      |
| **Backend/API**        | 🔷 EMBED    | N8N é open-source, self-hosted. Dá controle total sem escrever Express/NestJS. Migrar para backend próprio = 6 meses de reescrita sem ganho.        | N8N + PostgreSQL      |
| **Assinatura digital** | 🔷 EMBED    | Documenso é open-source, self-hosted. DocuSign custaria R$150-400/mês POR TENANT.                                                                   | Documenso             |
| **BI / Dashboards**    | 🔷 EMBED    | Metabase é open-source, self-hosted. Criar dashboard engine = 2-3 meses. Looker = R$25K+/mês.                                                       | Metabase              |
| **OCR**                | 🔷 EMBED    | Tesseract.js roda no browser. Google Vision = custo por imagem. E o OCR roda DENTRO do fluxo.                                                       | Tesseract.js          |
| **Analytics**          | 🔷 EMBED    | Plausible é LGPD-compliant self-hosted. GA não é. Mixpanel é caro.                                                                                  | Plausible             |
| **Pagamento online**   | 🔶 INTEGRAR | Ser banco não é o negócio. Stripe/MercadoPago fazem isso em 100x mais escala. Regulamentação pesada.                                                | Futuro: MercadoPago   |
| **Nota fiscal**        | 🔶 INTEGRAR | NFSe tem regras por município. ENotas/Focus NFe mantêm 5.000+ prefeituras. Impossível replicar.                                                     | Futuro: ENotas        |
| **CEP/CNPJ**           | 🔶 INTEGRAR | Dados públicos. BrasilAPI/ReceitaWS já resolvem. Não faz sentido hospedar Receita Federal.                                                          | BrasilAPI + ReceitaWS |
| **Identidade/Auth**    | 🔶 INTEGRAR | Google e Gov.br são padrões. Fazer auth próprio é reinventar a roda com risco de segurança.                                                         | Google OAuth + Gov.br |
| **WhatsApp**           | 🔶 INTEGRAR | Meta controla a API. Não tem como "embedar" WhatsApp. Mas o FLUXO do chat fica dentro do SOS.                                                       | WhatsApp Business API |
| **Storage**            | 🔶 INTEGRAR | Google Drive é free tier generoso. S3 seria mais barato em escala mas mais complexo.                                                                | Google Drive          |
| **Contabilidade/ERP**  | 🔶 INTEGRAR | Omie, Bling e Conta Azul são padrão no BR. Construir módulo contábil = regulamentação + CRC + 1 ano.                                                | Futuro: webhook + API |

---

### O Padrão de Integração que Preserva o DNA

A chave é: **O parceiro faz o trabalho pesado. O SOS controla a experiência.**

```
┌─────────────────────────────────────────────────────┐
│                    CAMADA DO SOS                     │
│                                                      │
│  O que o USUÁRIO vê:                                │
│  • CrudScreen de faturas                            │
│  • Botão "Gerar PIX" na fatura                     │
│  • Botão "Emitir NF" na fatura                     │
│  • Status "Pago" / "NF emitida" no kanban          │
│  • Dashboard financeiro no Metabase                 │
│                                                      │
│  Tudo dentro do SOS. Uma tela. Um fluxo.            │
└─────────────┬───────────────────┬───────────────────┘
              │                   │
              ▼                   ▼
   ┌──────────────────┐  ┌──────────────────┐
   │  Mercado Pago    │  │  ENotas          │
   │  (gera QR PIX)   │  │  (emite NFSe)    │
   │                   │  │                   │
   │  SOS chama API    │  │  SOS chama API    │
   │  MercadoPago      │  │  ENotas retorna   │
   │  retorna link     │  │  PDF da nota      │
   │  SOS salva em     │  │  SOS salva em     │
   │  payments.pix_url │  │  invoices.nfse_url│
   └──────────────────┘  └──────────────────┘
```

**O que o cliente percebe:** "Paguei pelo SOS." "Recebi minha nota pelo SOS."
**O que aconteceu por trás:** MercadoPago processou. ENotas emitiu. O SOS orquestrou.

---

### Custo Total Projetado: Hoje vs Futuro

#### Cenário Hoje (10 tenants, uso leve)

| Componente                                                | Custo/mês       |
| --------------------------------------------------------- | --------------- |
| VPS (N8N + PostgreSQL + Documenso + Metabase + Plausible) | R$280           |
| ReceitaWS                                                 | R$0 (free tier) |
| Google Drive                                              | R$0 (free tier) |
| WhatsApp API                                              | ~R$100          |
| Expo/EAS                                                  | R$0 (free tier) |
| **TOTAL**                                                 | **~R$380/mês**  |

#### Cenário Escala (100 tenants, uso moderado)

| Componente                    | Custo/mês        | Nota                                        |
| ----------------------------- | ---------------- | ------------------------------------------- |
| VPS dedicado (2-3 servidores) | R$800            | Auto-hosted permanece                       |
| ReceitaWS (plano pago)        | R$200            | Queueing reduz uso                          |
| Google Drive (Workspace)      | R$200            | Ou migrar para S3 (~R$50)                   |
| WhatsApp API                  | R$500            | Volume de mensagens                         |
| Expo/EAS (Production)         | R$500            | Builds ilimitados                           |
| MercadoPago                   | R$0 taxa         | O custo é do cliente (taxa sobre transação) |
| ENotas                        | R$150            | Por volume de NFs                           |
| LLM (AI insights)             | R$200            | Depende do provider                         |
| **TOTAL**                     | **~R$2.550/mês** |

**Para servir 100 empresas com: backend, BI, assinatura digital, OCR, pagamento, nota fiscal, WhatsApp, AI, analytics.**

Compare com montar isso em SaaS:

- DocuSign: R$150/tenant × 100 = R$15.000/mês
- Looker: R$25.000/mês
- Pipefy: R$500/tenant × 100 = R$50.000/mês
- Auth0: R$2.000/mês

**O modelo embedded open-source reduz custos em ~90%** comparado com SaaS stack equivalente.

---

### Riscos e Mitigações

| Risco                                                            | Impacto                    | Mitigação                                                                   |
| ---------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| **N8N muda licença** (já aconteceu: community → sustainable use) | Alto — backend depende     | Já usa versão self-hosted. Pior caso: fork ou migrar para Temporal/Windmill |
| **Documenso descontinua**                                        | Médio — assinaturas param  | Open-source = fork possível. Alternativa: SignPDF.js + audit trail próprio  |
| **Metabase aumenta restrições embed**                            | Baixo — dashboards ficam   | Versão OSS continuará. Alternativa: Apache Superset                         |
| **BrasilAPI fica instável**                                      | Baixo — já tem cache       | ViaCEP como fallback para CEP. CNPJ: ReceitaWS como principal               |
| **Google Drive limita free tier**                                | Médio — uploads param      | Migrar para MinIO (S3-compatible self-hosted)                               |
| **MercadoPago taxa sobe**                                        | Baixo — é taxa de mercado  | Switch para Stripe ou PagBank. API wrapper isola a dependência              |
| **WhatsApp API pricing**                                         | Médio — custo por mensagem | Template messages são mais baratas. Consolidar notificações.                |

### Regra de Mitigação

> **Todo parceiro DEVE ser consumido via um service wrapper no SOS.**
> Nunca chamar API do parceiro diretamente de um componente.
> Sempre ter `services/parceiro.ts` como interface.

Isso já é praticado: `services/documenso.ts`, `services/brasil-api.ts`, `services/receita-ws.ts`, `services/metabase.ts`.

Se trocar Documenso por ZapSign = muda 1 arquivo (`documenso.ts`), zero componentes.
Se trocar BrasilAPI por outra API = muda 1 arquivo (`brasil-api.ts`), zero telas.

---

### Onde Cada Futuro Parceiro Se Encaixa

| Necessidade                  | Parceiro Recomendado       | Tipo        | UX no SOS                                                | Custo                                  |
| ---------------------------- | -------------------------- | ----------- | -------------------------------------------------------- | -------------------------------------- |
| **Pagamento (PIX + cartão)** | MercadoPago                | INTEGRAR    | Botão "Pagar" na fatura → abre checkout inline ou QR PIX | Taxa sobre transação (sem mensalidade) |
| **Nota fiscal (NFSe)**       | ENotas ou Focus NFe        | INTEGRAR    | Botão "Emitir NF" na fatura → retorna PDF linkado        | ~R$0,15-0,50 por nota                  |
| **Push notifications**       | Firebase (FCM) + Expo Push | INTEGRAR    | Transparente — usuário recebe push sem saber quem enviou | Free (FCM)                             |
| **Email transacional**       | Resend ou Sendinblue       | INTEGRAR    | Notificações por email com template SOS                  | Free tier generoso                     |
| **Storage em escala**        | MinIO (S3-compatible)      | EMBED       | Substitui Google Drive se atingir limite                 | Self-hosted (~R$30/mês)                |
| **PDF generation**           | Puppeteer / React-PDF      | EMBED/BUILD | Faturas, recibos, orçamentos em PDF                      | Free (open-source)                     |
| **Geolocalização**           | OpenStreetMap / Nominatim  | EMBED       | Mapa de parceiros/despacho (se implementar dispatch)     | Free (self-hosted)                     |
| **Contabilidade**            | Omie / Bling API           | INTEGRAR    | Botão "Sincronizar com Omie" nas configurações           | Free API (Omie) / R$30/mês (Bling)     |

---

### Princípio Final: O SOS é o Maestro, Não o Músico

```
Errado:  O SOS faz pagamento + nota fiscal + OCR + BI + assinatura + chat
         (impossível fazer tudo bem)

Certo:   O SOS ORQUESTRA pagamento + nota fiscal + OCR + BI + assinatura + chat
         (cada parceiro faz o que sabe, o SOS une tudo)
```

O valor do SOS não é saber processar PIX. É saber que:

1. O **orçamento aprovado** gera automaticamente uma **fatura**
2. A fatura gera um **link de pagamento** (MercadoPago faz o PIX)
3. O pagamento confirmado dispara **emissão de NF** (ENotas faz a nota)
4. A NF emitida dispara **notificação ao cliente** (WhatsApp entrega)
5. O cliente clica no link e **acompanha o processo** (SOS mostra)
6. O processo avança e **cria tarefas para o parceiro** (SOS orquestra)
7. O parceiro **assina documentos** (Documenso valida)
8. O gestor vê **tudo no dashboard** (Metabase renderiza)

**Oito parceiros diferentes. Um único fluxo. Uma única experiência.**

Esse é o moat competitivo: **não é o que o SOS faz, é o que o SOS conecta.**

## Perguntas que Este Documento Responde

| Pergunta                                            | Resposta                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| "Vou perder a simplicidade?"                        | Não — cada feature nova segue o padrão CrudScreen. O usuário não aprende nada novo.        |
| "Vou ficar nichado demais?"                         | Não — 88% já é universal. O nicho é no Template Pack, não no código.                       |
| "Vou virar um ERP genérico?"                        | Não — módulos são opcionais. O tenant ativa só o que precisa. Complexidade = proporcional. |
| "O cliente vai precisar de treinamento?"            | Não — se sabe usar CrudScreen, sabe usar faturamento, orçamento, CRM...                    |
| "Como diferencio para cada tipo de empresa?"        | Template Pack: dados pré-configurados + terminologia + workflows específicos. Zero código. |
| "Posso atender advocacia E consultoria E cobrança?" | Sim — mesmo motor, packs diferentes. Uma advocacia e uma consultoria usam o MESMO código.  |
| "E se quiser adicionar mais features depois?"       | Módulo novo + CrudScreen + tabela = pronto. O padrão é replicável infinitamente.           |
| "Preciso ser banco ou emissor de NF?"               | Não — MercadoPago processa PIX, ENotas emite NF. O SOS orquestra, não executa.             |
| "E se o parceiro open-source mudar a licença?"      | Todo parceiro é isolado num `services/parceiro.ts`. Trocar = 1 arquivo, zero telas.        |
| "Quanto custa manter tudo isso?"                    | ~R$380/mês hoje (10 tenants). ~R$2.550/mês em escala (100 tenants). 90% menos que SaaS.    |
| "Por que não usar Pipefy/Monday para workflows?"    | Perderia as integrações internas (OCR→assinatura→NF→pagamento) e o fluxo único do cliente. |

---

## Ação Imediata Recomendada

1. **Validar este modelo** — Releia e ajuste o que não fizer sentido para a sua visão
2. **✅ Fase -1 feita** — CrudScreen robusto: date, currency, pagination, validation, masks, sections, smart detection, aggregation
3. **✅ Fase 0 feita** — Sistema de módulos + filtro de navegação (13 módulos, ModuleGate, ModulesContext)
4. **✅ Fase 1 feita** — Portal público com timeline `/p/:token`, review `/p/review/:token`, estimativa prazo/custo
5. **✅ Fase 2 feita** — Financeiro completo: faturas, pagamentos, contas a receber/pagar, inadimplentes, recibos, dashboard, conciliação bancária OFX, DRE, export contábil
6. **✅ Fase 3 feita** — CRM: leads CrudScreen, pipeline kanban, detalhe do lead, campanhas, dashboard de campanhas, formulários públicos, lead scoring, follow-up
7. **✅ Fase 4 feita** — Parceiros: Meus Trabalhos, aceitar/recusar, ganhos, PIX, disponibilidade, folgas, channel partners
8. **✅ Fase 5 feita** — Template Packs: cartório, advocacia, genérico, cobrança, padrão, sos_escritura (6 packs)
9. **✅ Fase 6 feita** — Payment Gateways (Asaas + MercadoPago + Mock via IPaymentGateway), Contratos/SLA, Content Pages (blog/landing/CMS), Marketing AI
10. **✅ Fase 7 feita** — Marketplace/E-commerce: PDV, Produtos, Composições/BOM, Estoque (movimentações + locais + alertas + kanban separação), Compras (pedidos + fornecedores), Entregas (expedição + rastreamento + rotas), Shopping Cart, Checkout
11. **✅ Extras implementados:**
    - **AI Agents completo** — 9 telas admin (agents, states, playbooks, rules, tables, handoff, steps, bindings, agent-packs)
    - **Agent Packs** — 2 packs (genérico + sos_escritura) + serviço de aplicação
    - **SaaS Billing** — Planos tier (free/starter/growth/scale/enterprise), PIX, recorrência mensal, dashboard SaaS
    - **Bank Reconciliation** — Import OFX, matching automático, conciliação de transações
    - **Multi-Domain Auth** — Resolução de tenant por domínio/subdomain/custom domain, auto-link de usuários
    - **Tenant Branding** — Logo, cor primária, nome da marca por tenant, telas de auth personalizadas
    - **GlobalSearch** — Busca global de telas/funcionalidades no header, desktop + mobile
    - **Breadcrumbs** — Navegação hierárquica em todas as telas admin
    - **Orçamentos** — Quotes com link público `/q/:token`, aprovação online, multi-opção (pacotes), quote templates
    - **Cobrança** — Template pack de cobrança + serviço de collection via workflow engine
    - **Contratos/SLA** — contracts + contract_service_orders, renovação, SLA tracking
    - **Content Pages** — Blog, landing pages, CMS com editor
    - **Channel Partners** — Referral codes, comissões, tracking de indicações
12. **Próximo:** NFSe automática (ENotas), Time Tracking (time_entries + timer + timesheets), Visual Workflow Builder, Export CSV/PDF, Dispatch com mapa

---

## Novas Capacidades Construídas (Fev 2026)

### Sistema de AI Agents (9 telas admin + Agent Packs)

O módulo de IA evoluiu de "insights por tela" para uma **arquitetura completa de agentes conversacionais**:

| Tela                  | Função                                                               |
| --------------------- | -------------------------------------------------------------------- |
| **Agents**            | CrudScreen dos agentes (nome, tipo, versão, canal, config)           |
| **Agent States**      | Estados dos agentes (online, offline, pausado) com vínculo tenant    |
| **Agent Playbooks**   | Manuais de comportamento do agente (regras de conduta)               |
| **Playbook Rules**    | Regras individuais dentro de cada playbook                           |
| **Playbook Tables**   | Tabelas de referência que o agente pode consultar                    |
| **Handoff Policies**  | Políticas de transferência entre canais (WhatsApp → Operador)        |
| **Agent State Steps** | Passos por estado do agente (máquina de estados)                     |
| **Channel Bindings**  | Vínculos agente ↔ canal (qual agente atende qual canal)              |
| **Agent Packs**       | Packs pré-configurados de agentes (como template packs, mas para IA) |

**Agent Packs** funcionam como Template Packs: um JSON com agentes + estados + playbooks + políticas pré-configurados. O admin seleciona e aplica em 1 clique. 2 packs disponíveis (genérico + sos_escritura), cada um com 3 agentes (atendimento, operacional, supervisão) + 9 categorias de entidade.

### SaaS Billing (Monetização da Plataforma)

O SOS agora tem **billing próprio** para cobrar tenants:

- **5 planos** — Free (20 clientes), Starter (100, R$99), Growth (500, R$249), Scale (2.000, R$499), Enterprise (ilimitado)
- **Recorrência mensal PIX** — Auto-gera próxima cobrança ao confirmar pagamento
- **Dashboard SaaS** — Super-admin vê todos os tenants, planos, pagamentos pendentes
- **Upgrade in-app** — Tenant admin gera PIX e faz upgrade sem sair do app

### Bank Reconciliation (Conciliação Bancária)

- **Import OFX** — Upload de extrato bancário no formato OFX
- **Matching automático** — Cruza transações do extrato vs contas a receber/pagar
- **Conciliação manual** — Operador confirma ou ajusta matches sugeridos

### Multi-Domain Auth + Tenant Branding

- **Resolução automática** — `{slug}.radul.com.br` → resolve para o tenant correspondente, `app.radul.com.br` → plataforma root
- **Custom domains** — Tenant pode usar `app.meudominio.com.br`
- **Branding visual** — Auth screens (login, register, forgot) usam logo, cor e nome do tenant
- **Auto-link** — Novo usuário em subdomain de tenant é automaticamente vinculado como cliente daquele tenant

---

_Documento estratégico — Fevereiro 2026 • Baseado em auditoria técnica completa (169 telas, 114 páginas admin, 72 telas CrudScreen, 13 módulos ativos, 6 template packs + 2 agent packs, 76 services, 40 migrations, 10 hooks, 3 payment gateways, 22+ integrações ativas)_
