# Estratégia: Workflow Engine como Produto de Entrada

> _"O workflow é a porta de entrada. A plataforma completa é o destino."_

## Resumo Executivo

A Radul possui um **Workflow Engine completo** — FSM (máquina de estados finita), formulários por etapa, tarefas automáticas, SLA/prazos, kanban visual, portal público, e automações — que hoje serve como motor interno da plataforma. Este documento analisa como **vender o workflow isoladamente** como produto de entrada para empresas que precisam de controle de processos internos (compras, RH, TI, compliance, contratos, etc.), e como essa estratégia gera **upsell natural** para a plataforma completa.

**A tese:** Toda empresa média brasileira (20-250 funcionários) tem 3-5 processos internos rodando em email, WhatsApp e planilha. Um workflow simples a R$99/mês resolve a dor imediata. Uma vez dentro, o cliente descobre que precisa de CRM, financeiro, parceiros, documentos — e migra para a plataforma completa.

---

## O Que o Workflow Engine Já Faz Hoje

### Capacidades Core (prontas para uso)

| Capacidade                   | Como Funciona                                                                                            | Diferencial                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Máquina de estados (FSM)** | 5 estados (`not_started → active → paused → finished/cancelled`) + transições configuráveis entre etapas | Robusto como Pipefy, sem custo de Pipefy                         |
| **Etapas visuais (Kanban)**  | Cada workflow vira um board kanban com colunas coloridas, drag-drop, busca, filtros                      | KanbanScreen genérico — mesmo componente serve qualquer processo |
| **Formulários por etapa**    | JSON schema com 6 tipos de campo (text, select, currency, date, number, multiline)                       | Coleta dados estruturados em cada fase do processo               |
| **Tarefas automáticas**      | Templates de tarefas criados automaticamente ao entrar em cada etapa                                     | Com atribuição por role, prazo em dias, prioridade (5 níveis)    |
| **SLA / Prazos**             | Deadline rules com cálculo automático de data limite, notificação antecipada                             | Rastreamento visual + escalação configurável                     |
| **Transições condicionais**  | Padrões complexos: linear, loop-back (revisão), skip-ahead, early exit, ciclo de renovação               | 7 padrões de transição comprovados em 20+ workflows              |
| **Portal público**           | Link `/p/:token` para acompanhamento externo sem login                                                   | Cliente/solicitante acompanha status sem instalar app            |
| **Formulários públicos**     | Link `/f/:slug` para abertura de solicitações externas                                                   | Qualquer pessoa abre um chamado/requisição via link              |
| **Assinatura digital**       | Documenso integrado (eletrônica + ICP-Brasil)                                                            | Contratos e aprovações com validade jurídica                     |
| **OCR integrado**            | Tesseract.js extrai dados de documentos/comprovantes                                                     | Reembolso de despesas, análise de NFs, etc.                      |
| **Audit trail**              | `process_logs` com JSONB completo de cada ação                                                           | Compliance, ISO, LGPD — trilha de auditoria                      |
| **Template Packs**           | Workflows pré-configurados por vertical em JSON puro                                                     | Deploy de novo processo em 5 minutos, zero código                |
| **Multi-tenant**             | Cada empresa tem workflows isolados                                                                      | Um deploy serve infinitas empresas                               |

### Números Comprovados

```
╔═══════════════════════════════════════════════════════╗
║  20+ workflows pré-configurados (6 template packs)    ║
║  7 padrões de transição comprovados                   ║
║  3 a 10 etapas por workflow (média: 5)                ║
║  6 tipos de campo em formulários                      ║
║  5 níveis de prioridade para tarefas                  ║
║  5 estados de processo (FSM completa)                 ║
║  100% configurável via dados (zero código)            ║
║  Portal público + formulários públicos                ║
║  Assinatura digital + OCR integrados                  ║
╚═══════════════════════════════════════════════════════╝
```

---

## Por Que Vender o Workflow Separadamente?

### O Problema das Empresas Brasileiras

| Realidade                                                        | Dado                   |
| ---------------------------------------------------------------- | ---------------------- |
| **72% das PMEs** perdem dinheiro com compras não autorizadas     | SEBRAE 2024            |
| **15+ documentos/etapas** por contratação CLT                    | Legislação trabalhista |
| **R$5K-20K por auditoria** quando feita manualmente              | Mercado de consultoria |
| **3M de reclamações/ano** de empresas sem sistema de atendimento | PROCON                 |
| **Email + WhatsApp** é o "sistema" de 80% das empresas           | Observação de mercado  |

### A Oportunidade do "Primeiro Contato"

```
      HOJE                         COM WORKFLOW STANDALONE
      ────                         ──────────────────────

   Empresa média          →    "Preciso organizar minhas compras"
   (50-250 funcionários)        ↓
                                Workflow de Compras (R$99/mês)
                                ↓
                                "Funcionou! Agora quero para RH"
                                ↓
                                + Workflow de RH (+R$0, mesmo plano)
                                ↓
                                "Preciso faturar os clientes"
                                ↓
                                Upgrade para Growth (R$249/mês)
                                + Módulo Financeiro
                                ↓
                                "Preciso de CRM para vendas"
                                ↓
                                + Módulo CRM (+R$0, mesmo plano)
                                ↓
                                Plataforma completa — R$249-499/mês
```

**O workflow é o cavalo de Tróia.** Resolve uma dor pontual, cria dependência, e abre a porta para upsell orgânico.

---

## Análise Competitiva: Workflow Standalone

### Concorrentes Diretos no Brasil

| Plataforma         | Preço          | Workflow Builder | Formulários | SLA | Portal | Assinatura | OCR | Multi-tenant |
| ------------------ | -------------- | ---------------- | ----------- | --- | ------ | ---------- | --- | ------------ |
| **Pipefy**         | R$500+/mês     | ✅ Visual        | ✅          | ✅  | ❌     | ❌         | ❌  | ❌           |
| **Monday.com**     | R$100-400/mês  | ✅ Visual        | ⚠️          | ⚠️  | ❌     | ❌         | ❌  | ❌           |
| **Kissflow**       | US$15/user/mês | ✅ Visual        | ✅          | ✅  | ❌     | ❌         | ❌  | ❌           |
| **Fluig (TOTVS)**  | R$2.000+/mês   | ✅               | ✅          | ✅  | ❌     | ✅         | ❌  | ❌           |
| **Zeev (Stoque)**  | R$500+/mês     | ✅ Visual        | ✅          | ✅  | ❌     | ✅         | ❌  | ❌           |
| **Radul Workflow** | R$99/mês       | ⚠️ Editor visual | ✅          | ✅  | ✅     | ✅         | ✅  | ✅           |

### Vantagens Competitivas do Radul Workflow

| Vantagem                 | Detalhe                                            | Quem não tem                               |
| ------------------------ | -------------------------------------------------- | ------------------------------------------ |
| **Preço agressivo**      | R$99/mês vs R$500+ do Pipefy/Zeev                  | Todos                                      |
| **Usuários ilimitados**  | No plano pago, sem limite de seats                 | Pipefy, Monday, Kissflow (cobram por seat) |
| **Portal público**       | Solicitante acompanha sem login via `/p/:token`    | Pipefy, Monday, Kissflow, Zeev             |
| **Formulários públicos** | Qualquer pessoa abre solicitação via `/f/:slug`    | Monday, Kissflow                           |
| **Assinatura digital**   | Documenso (eletrônica + ICP-Brasil) integrado      | Pipefy, Monday, Kissflow                   |
| **OCR**                  | Tesseract.js extrai dados de comprovantes          | Pipefy, Monday, Kissflow, Zeev             |
| **Integrações BR**       | Gov.br, BrasilAPI (CPF/CNPJ), PIX nativo           | Pipefy (parcial), todos os internacionais  |
| **Multi-tenant nativo**  | Um deploy serve N empresas                         | Nenhum concorrente de workflow             |
| **Self-hosted**          | R$280/mês de infra vs custos SaaS                  | Todos são SaaS puro                        |
| **Template Packs**       | Workflow pronto em 5 min, não em 5 horas de config | Nenhum oferece packs data-driven           |

### Desvantagem Principal (e Como Resolver)

| Desvantagem                          | Impacto                                            | Solução                                                | Esforço     |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------ | ----------- |
| **Sem visual workflow builder**      | O editor é lista de cards, não grafo node-and-edge | Editor visual drag-drop (roadmap já previsto)          | 4-6 semanas |
| **Kanban bypassa transições**        | Quick-advance não valida regras de transição       | Forçar `moveToStep()` no kanban                        | 1-2 dias    |
| **Sem aprovação multi-nível nativa** | Precisa usar forms + review como workaround        | Novo tipo de step "approval" com N aprovadores         | 2-3 semanas |
| **Sem sub-processos**                | Não pode aninhar workflow dentro de workflow       | Contexto de `service_order_context` pode linkar sub-OS | 2-3 semanas |
| **Sem condicional runtime**          | `condition_json` existe mas não é avaliado         | Implementar engine de condição                         | 2-3 semanas |

**Prioridade de resolução:** Visual workflow builder > aprovação multi-nível > condicional runtime. Os outros são nice-to-have para V1.

---

## Top 10 Casos de Uso para Entrada

### Ranking por Impacto × Facilidade de Implementação

| #   | Caso de Uso                          | Etapas | Vantagem Radul                  | SAM Brasil (R$/ano) | Esforço       |
| --- | ------------------------------------ | ------ | ------------------------------- | ------------------- | ------------- |
| 1   | **Aprovação de Compras**             | 8      | Financeiro + AP integration     | R$7-18M             | Template pack |
| 2   | **Admissão de Funcionários (RH)**    | 8      | Documenso + deadline rules      | R$15-30M            | Template pack |
| 3   | **Gestão de Contratos**              | 9      | Documenso + contracts + SLA     | R$12-30M            | Template pack |
| 4   | **Chamados de TI (Helpdesk)**        | 9      | Portal público + forms públicos | R$8-20M             | Template pack |
| 5   | **Solicitação de Orçamento Interno** | 7      | Multi-nível + módulo financeiro | R$10-25M            | Template pack |
| 6   | **Reembolso de Despesas**            | 7      | OCR + financeiro + PIX          | R$6-15M             | Template pack |
| 7   | **Auditoria de Conformidade**        | 10     | Step forms + logs + docs        | R$5-15M             | Template pack |
| 8   | **Reclamação de Cliente (CAPA)**     | 9      | Portal público + ISO compliance | R$4-10M             | Template pack |
| 9   | **Aprovação de Documentos**          | 8      | Document templates + Documenso  | R$5-12M             | Template pack |
| 10  | **Homologação de Fornecedores**      | 8      | BrasilAPI CNPJ + step forms     | R$3-8M              | Template pack |

**SAM combinado: R$75-183M/ano** apenas no Brasil.

**Fato crucial:** Cada caso de uso é implementável como um **template pack** — dados pré-configurados, zero código novo. O motor já existe.

---

## Detalhamento dos 3 Casos de Uso Prioritários

### 1. Aprovação de Compras (Procurement Workflow)

**Por que é a melhor porta de entrada:** Toda empresa com 20+ funcionários faz compras. É a dor mais universal e a mais fácil de demonstrar ROI (economia em compras não autorizadas).

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Requisição  │────→│   Cotação    │────→│  Aprovação   │
│  (solicitante│     │ (3 fornec.)  │     │  (gestor)    │
│  preenche    │     │ step form    │     │              │
│  formulário) │     │ com valores  │     │ se >R$5K:    │
└──────────────┘     └──────────────┘     │ → diretoria  │
                                          └──────┬───────┘
                                                 │
                     ┌──────────────┐     ┌──────┴───────┐
                     │ Conferência  │←────│  Recebimento │
                     │ (almoxarife  │     │ (NF + item)  │
                     │  confere)    │     │              │
                     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐     ┌──────────────┐
                     │  Pagamento   │────→│  Concluído   │
                     │ (financeiro  │     │ (terminal)   │
                     │  agenda PIX) │     │              │
                     └──────────────┘     └──────────────┘
```

**Template Pack: `compras`**

| Entidade           | Configuração                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| **Workflow**       | "Aprovação de Compras" — 8 etapas                                                                    |
| **Step Forms**     | "Dados da Requisição" (item, quantidade, justificativa, urgência, centro de custo)                   |
|                    | "Cotação de Fornecedores" (fornecedor1/valor1, fornecedor2/valor2, fornecedor3/valor3, recomendação) |
| **Task Templates** | "Solicitar 3 cotações" (2 dias, obrigatória), "Verificar budget do centro de custo" (1 dia)          |
| **Deadline Rules** | Cotação: 3 dias (alta), Aprovação: 2 dias (crítica), Recebimento: 15 dias (média)                    |
| **Transições**     | Aprovação → Cotação ("Refazer cotação"), Conferência → Recebimento ("Item divergente")               |
| **Service Types**  | "Compra Materiais", "Compra Serviços", "Compra Equipamentos"                                         |

**Pitch de Venda:**

> _"Quanto você perde por mês com compras sem aprovação? Com a Radul, toda compra passa por cotação, aprovação e conferência — com prazo, audit trail, e visibilidade para a diretoria. R$99/mês, usuários ilimitados."_

---

### 2. Admissão de Funcionários (HR Onboarding)

**Por que é forte:** Legislação CLT exige 15+ documentos por contratação. Falhar = multa. Documenso para contrato e assinatura digital é diferencial matador.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Vaga Aprovada│────→│ Documentação │────→│  Documentos  │
│ (RH inicia)  │     │ Solicitada   │     │  Recebidos   │
│              │     │ (checklist   │     │ (RH confere) │
│              │     │  enviado)    │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
     ┌──────────────┐     ┌──────────────┐  ┌────┴─────────┐
     │  Contrato    │←────│   Exame      │←─│   eSocial    │
     │  Assinado    │     │  Admissional │  │  Cadastrado  │
     │ (Documenso)  │     │ (prazo: 3d)  │  │ (prazo: 1d)  │
     └──────┬───────┘     └──────────────┘  └──────────────┘
            │
     ┌──────┴───────┐     ┌──────────────┐
     │ Treinamento  │────→│  Integração  │
     │  Agendado    │     │  Concluída   │
     │              │     │ (terminal)   │
     └──────────────┘     └──────────────┘
```

**Template Pack: `rh_admissao`**

| Entidade           | Configuração                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Workflow**       | "Admissão de Funcionário" — 8 etapas                                                                  |
| **Step Forms**     | "Dados do Candidato" (nome, CPF, RG, endereço, cargo, salário, data prevista)                         |
|                    | "Checklist Documental" (CTPS, RG, CPF, título eleitor, reservista, comprovante endereço — checkboxes) |
|                    | "Resultado Exame Admissional" (data, resultado: apto/inapto, observações)                             |
| **Task Templates** | "Enviar checklist de documentos" (1 dia, obrig.), "Agendar exame admissional" (2 dias, obrig.)        |
|                    | "Cadastrar no eSocial" (1 dia, obrig., atribuído a RH), "Preparar contrato" (1 dia, obrig.)           |
| **Deadline Rules** | Documentação: 5 dias (alta), eSocial: 1 dia (urgente), Exame: 3 dias (crítica)                        |
| **Transições**     | Exame → Documentação ("Exame inapto — revisar documentação")                                          |

**Pitch de Venda:**

> _"Cada contratação CLT tem 15+ etapas obrigatórias. Perca uma e leve multa. Com a Radul, cada admissão é um workflow com checklist, prazos, assinatura digital do contrato, e acompanhamento do candidato pelo portal."_

---

### 3. Chamados de TI (IT Helpdesk)

**Por que é forte:** Formulário público para abertura (zero login), portal público para acompanhamento, review automático pós-resolução. Substitui Zendesk/Freshdesk a 1/5 do preço.

```
     ┌──────────────┐
     │  Formulário  │ ← /f/helpdesk (link público)
     │   Público    │
     └──────┬───────┘
            │
     ┌──────┴───────┐     ┌──────────────┐     ┌──────────────┐
     │  Triagem     │────→│Classificação │────→│  Atribuição  │
     │ (TI avalia)  │     │ (P1-P4)      │     │ (técnico)    │
     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                      │
     ┌──────────────┐     ┌──────────────┐     ┌──────┴───────┐
     │  Validação   │←────│  Resolução   │←────│ Diagnóstico  │
     │ (solicitante │     │ (aplicar fix)│     │ (investigar) │
     │  confirma)   │     │              │     │              │
     └──────┬───────┘     └──────────────┘     └──────────────┘
            │
     ┌──────┴───────┐     ┌──────────────┐
     │ Encerramento │────→│  Pesquisa de │
     │ (terminal)   │     │ Satisfação   │ ← /p/review/:token
     └──────────────┘     └──────────────┘
```

**Pitch de Venda:**

> _"Seu time de TI atende chamados por WhatsApp? Perca chamados, esqueça prazos, e o diretor nunca sabe quantos tickets estão abertos. Com a Radul, qualquer funcionário abre chamado por link, acompanha pelo portal, e o gestor tem kanban com SLA. R$99/mês, sem limite de usuários — o Zendesk cobra R$250/agente."_

---

## Modelo de Negócio: Land & Expand

### Jornada do Cliente

```
MESES 0-3: LAND (Workflow Standalone)
═══════════════════════════════════════
R$99/mês (Starter) ou R$0 (Free, 20 processos ativos)
├── 1 workflow ativo (ex: Compras)
├── Kanban visual
├── Portal público para solicitantes
├── Formulários públicos de abertura
├── SLA + prazos automáticos
└── Ilimitado: usuários, formulários, etapas

MESES 3-6: EXPAND (Mais Workflows)
═══════════════════════════════════════
Mesmo R$99/mês (o tenant cria mais workflows)
├── + Workflow de RH (Admissão)
├── + Workflow de TI (Helpdesk)
├── + Workflow de Contratos
└── O cliente percebe: "isso é mais que workflow"

MESES 6-12: UPSELL (Plataforma Completa)
═══════════════════════════════════════
Upgrade para Growth (R$249/mês) ou Scale (R$499/mês)
├── + Módulo Financeiro (faturas, pagamentos, contas)
├── + Módulo CRM (leads, pipeline, campanhas)
├── + Módulo Documentos (templates, assinaturas, OCR)
├── + Módulo Parceiros (terceirização, comissões)
├── + AI Agents (atendimento automatizado)
└── De "ferramenta de workflow" → "plataforma de operações"

RESULTADO: ARPU sobe de R$99 → R$249-499/mês (+150-400%)
```

### Métricas-Alvo

| Métrica                | Mês 1 | Mês 3   | Mês 6   | Mês 12   |
| ---------------------- | ----- | ------- | ------- | -------- |
| Tenants no free        | 30    | 100     | 250     | 500      |
| Tenants pagantes       | 5     | 25      | 60      | 150      |
| MRR                    | R$500 | R$2.500 | R$8.000 | R$25.000 |
| ARPU                   | R$99  | R$100   | R$135   | R$170    |
| Churn mensal           | —     | 8%      | 5%      | 3%       |
| Upsell rate (→ Growth) | —     | 5%      | 15%     | 25%      |

---

## Plano de Implementação

### Fase 1: Template Packs de Processos Internos (2-3 semanas)

Criar os template packs como dados pré-configurados — **zero código novo**:

| #   | Pack         | Arquivo                             | Workflows                                              | Prioridade |
| --- | ------------ | ----------------------------------- | ------------------------------------------------------ | ---------- |
| 1   | `compras`    | `data/template-packs/compras.ts`    | Aprovação de Compras (8 etapas)                        | 🔴 Alta    |
| 2   | `rh`         | `data/template-packs/rh.ts`         | Admissão (8 etapas), Desligamento (6 etapas)           | 🔴 Alta    |
| 3   | `helpdesk`   | `data/template-packs/helpdesk.ts`   | Chamado TI (9 etapas), Requisição de Acesso (5 etapas) | 🟡 Média   |
| 4   | `contratos`  | `data/template-packs/contratos.ts`  | Ciclo de Vida de Contrato (9 etapas)                   | 🟡 Média   |
| 5   | `compliance` | `data/template-packs/compliance.ts` | Auditoria (10 etapas), CAPA (9 etapas)                 | 🟢 Baixa   |

**Como funciona:** Registrar cada pack em `data/template-packs/index.ts` → aparece automaticamente na UI de onboarding → tenant seleciona → inserts no banco → pronto.

### Fase 2: Melhorias de Engine para BPM (3-4 semanas)

| #   | Melhoria                                    | Impacto                                                                          | Esforço     |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------- | ----------- |
| 1   | **Forçar validação de transição no Kanban** | Consistency — transições são respeitadas                                         | 1-2 dias    |
| 2   | **Aprovação multi-nível**                   | Step type "approval" com N aprovadores, threshold (todos/maioria/qualquer)       | 2-3 semanas |
| 3   | **Condicionais runtime**                    | Avaliar `condition_json` antes de permitir transição (baseado em form responses) | 2 semanas   |
| 4   | **Notificações de prazo**                   | Cron N8N que verifica `process_deadlines` próximos e envia push/email            | 1 semana    |
| 5   | **Dashboard de processos**                  | Tela com KPIs: processos ativos, SLA cumprido %, tempo médio por etapa           | 1-2 semanas |

### Fase 3: Visual Workflow Builder (4-6 semanas)

| #   | Feature                    | Descrição                                                  |
| --- | -------------------------- | ---------------------------------------------------------- |
| 1   | **Editor node-and-edge**   | Grafo visual com etapas como nós e transições como arestas |
| 2   | **Drag-drop de etapas**    | Criar/posicionar etapas visualmente                        |
| 3   | **Painel de propriedades** | Editar forms, tasks, deadlines ao clicar numa etapa        |
| 4   | **Preview de execução**    | Simular o fluxo antes de publicar                          |

**Nota:** Esta é a feature mais solicitada pelo mercado (Pipefy e Monday têm), mas **não é bloqueante para V1**. O editor vertical de cards atual funciona — é menos sexy, mas resolve. Priorizar os template packs prontos para venda imediata.

### Fase 4: Landing Page & Campanhas (2 semanas)

| #   | Ação                                                                     | Detalhe                                                                               |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | **Landing page `/workflow`**                                             | Página dedicada para "Gestão de Processos Internos" com demos por caso de uso         |
| 2   | **Google Ads: workflow**                                                 | Keywords: "sistema de workflow", "aprovação de compras", "controle de processos"      |
| 3   | **LinkedIn: decisores**                                                  | Diretores de operações, gerentes de RH, controllers financeiros                       |
| 4   | **Webinar: "5 processos internos que toda empresa deveria automatizar"** | Lead generation + demonstração ao vivo                                                |
| 5   | **Blog posts**                                                           | "Como organizar compras internas", "Checklist de admissão CLT", "SLA para TI interna" |

---

## Pricing para Workflow Standalone

### Opção A: Manter Planos Existentes (Recomendado)

Usar os mesmos planos da Radul Platform, mas posicionar o workflow como caso de uso:

| Plano       | Preço     | Limite                    | Posicionamento Workflow                |
| ----------- | --------- | ------------------------- | -------------------------------------- |
| **Free**    | R$0       | 20 clientes, 3 usuários   | "Teste com 1 workflow"                 |
| **Starter** | R$99/mês  | 100 clientes, ilimitado   | "Workflows ilimitados para sua equipe" |
| **Growth**  | R$249/mês | 500 clientes, ilimitado   | "Workflows + Financeiro + CRM"         |
| **Scale**   | R$499/mês | 2.000 clientes, ilimitado | "Plataforma completa de operações"     |

**Vantagem:** Não fragmenta o produto. O cliente entra pelo workflow e naturalmente descobre os módulos adicionais.

### Opção B: Plano Workflow-Only (Alternativa)

| Plano              | Preço     | Limite                           | Inclui                                        |
| ------------------ | --------- | -------------------------------- | --------------------------------------------- |
| **Workflow Free**  | R$0       | 3 workflows, 10 processos ativos | Kanban, portal, forms                         |
| **Workflow Pro**   | R$79/mês  | Ilimitado                        | Kanban, portal, forms, SLA, tasks, automações |
| **Radul Platform** | R$249/mês | Tudo                             | Workflow + 13 módulos                         |

**Desvantagem:** Cria um sub-produto que precisa de landing page, billing, e support separados. Mais complexidade operacional.

**Recomendação: Opção A.** O workflow é o gancho, não o produto final. Manter planos unificados simplifica tudo e maximiza upsell.

---

## Comparativo de Preço: Radul vs Concorrentes

| Cenário                    | Pipefy  | Monday  | Kissflow | Fluig   | Zeev    | **Radul** |
| -------------------------- | ------- | ------- | -------- | ------- | ------- | --------- |
| 10 usuários, 3 workflows   | R$500   | R$300   | R$750    | R$2.000 | R$500   | **R$99**  |
| 50 usuários, 5 workflows   | R$2.500 | R$1.500 | R$3.750  | R$5.000 | R$2.500 | **R$99**  |
| 100 usuários, 10 workflows | R$5.000 | R$3.000 | R$7.500  | R$8.000 | R$5.000 | **R$249** |

**O diferencial de preço é 5-50x.** A razão: concorrentes cobram por seat. Radul cobra por volume de clientes/processos. Para processos internos (onde os "clientes" são funcionários), o plano Starter (R$99) serve a maioria das empresas.

---

## Estratégia de Conteúdo: Primeiro Contato

### Blog Posts (SEO)

| #   | Título                                                            | Keyword                        | Caso de Uso |
| --- | ----------------------------------------------------------------- | ------------------------------ | ----------- |
| 1   | "Como organizar compras internas na sua empresa"                  | aprovação de compras           | Compras     |
| 2   | "Checklist completo para admissão CLT em 2026"                    | admissão funcionário checklist | RH          |
| 3   | "SLA de TI: como definir e controlar prazos de chamados"          | SLA TI helpdesk                | Helpdesk    |
| 4   | "Gestão de contratos: 9 etapas que toda empresa precisa"          | gestão de contratos            | Contratos   |
| 5   | "Auditoria interna: como documentar conformidade sem planilha"    | auditoria interna ISO          | Compliance  |
| 6   | "5 processos internos que toda empresa média deveria automatizar" | automação processos internos   | Geral       |
| 7   | "Reembolso de despesas: como eliminar papel e WhatsApp"           | controle reembolso despesas    | Financeiro  |
| 8   | "Homologação de fornecedores: passo a passo digital"              | homologação fornecedores       | Compras     |

### Webinars

| #   | Tema                                                              | Público-Alvo           | CTA                    |
| --- | ----------------------------------------------------------------- | ---------------------- | ---------------------- |
| 1   | "5 processos que custam dinheiro quando feitos por email"         | Diretores de operações | Free trial             |
| 2   | "Admissão CLT digital: do recrutamento à integração em 1 sistema" | Gerentes de RH         | Template pack RH       |
| 3   | "Como montar SLA de TI sem gastar R$5K/mês"                       | Gerentes de TI         | Template pack Helpdesk |

---

## Riscos e Mitigações

| Risco                                              | Probabilidade | Impacto | Mitigação                                                                           |
| -------------------------------------------------- | ------------- | ------- | ----------------------------------------------------------------------------------- |
| **"Parece simples demais"** — cliente não vê valor | Média         | Alto    | Mostrar templates pré-prontos + demonstração de kanban + portal público             |
| **Pipefy reduz preço**                             | Baixa         | Médio   | Radul já é 5-50x mais barato + usuários ilimitados + integrações BR                 |
| **Cliente quer visual builder**                    | Alta          | Médio   | Roadmap claro + mostrar que 20+ workflows rodam sem builder visual                  |
| **Suporte de 1 pessoa**                            | Alta          | Alto    | Self-service via portal + docs + templates prontos. Escalar suporte só com receita  |
| **Distração do produto principal**                 | Média         | Médio   | NÃO criar sub-produto. É posicionamento, não produto novo. Mesmos planos, mesma app |

---

## Resumo Executivo para Tomada de Decisão

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║  WORKFLOW ENGINE → PORTA DE ENTRADA → PLATAFORMA COMPLETA    ║
║                                                               ║
║  O motor já existe (20+ workflows, FSM, kanban, portal,      ║
║  forms, SLA, OCR, assinatura digital).                        ║
║                                                               ║
║  O que PRECISA ser feito:                                     ║
║  ├── 5 template packs de processos internos (2-3 semanas)    ║
║  ├── Landing page + campanhas (2 semanas)                    ║
║  └── Melhorias de engine opcionais (3-4 semanas)             ║
║                                                               ║
║  O que NÃO precisa ser feito para V1:                        ║
║  ├── Visual workflow builder (futuro)                        ║
║  ├── Sub-processos (futuro)                                  ║
║  └── Produto separado / billing separado                     ║
║                                                               ║
║  Investimento: 4-5 semanas de trabalho                       ║
║  SAM Brasil: R$75-183M/ano                                   ║
║  Meta Mês 3: 25 clientes pagantes, R$2.500 MRR              ║
║  Meta Mês 12: 150 clientes pagantes, R$25.000 MRR           ║
║  Upsell esperado: 25% migram para Growth (R$249) em 12 meses║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### Ação Imediata

1. **Criar template pack `compras`** — maior dor universal, ROI mais fácil de demonstrar
2. **Criar template pack `rh`** — segunda maior dor, legislação como driver
3. **Landing page `/workflow`** — posicionar como "Gestão de Processos Internos"
4. **Google Ads** — keywords de workflow/processos internos
5. **Webinar** — "5 processos que custam dinheiro quando feitos por email"

---

_Documento estratégico — Fevereiro 2026 • Baseado em auditoria técnica completa do Workflow Engine (13 funções exportadas, 20+ workflows, 7 padrões de transição, 6 tipos de campo, 5 estados FSM) + análise de 6 concorrentes de BPM + 10 casos de uso horizontais_
