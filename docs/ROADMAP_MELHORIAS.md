# Roadmap de Melhorias — SOS Platform vs Mercado

_Gerado em Fevereiro 2026 • Baseado na auditoria do codebase (98 telas, 53 admin pages, 49 CrudScreens, 8 módulos, 5+1 packs, 43 services) + análise competitiva de 12 plataformas_

---

## 1. Onde Estamos Hoje — Snapshot do Produto

### Métricas do Codebase

| Métrica                     | Contagem                                            |
| --------------------------- | --------------------------------------------------- |
| Telas totais (`app/(app)/`) | 98                                                  |
| Telas usando CrudScreen     | 49                                                  |
| Páginas admin registradas   | 53                                                  |
| Service files (`services/`) | 43                                                  |
| Módulos definidos           | 8 (1 core + 7 opcionais)                            |
| Template Packs              | 5 (cartório, advocacia, genérico, cobrança, padrão) |
| Agent Packs                 | 1 (genérico)                                        |
| Hooks                       | 8                                                   |
| Migrations                  | 19                                                  |
| Telas públicas (sem auth)   | 3 (`/p/:token`, `/p/review/:token`, `/q/:token`)    |
| Telas de auth               | 3 (login, register, forgot-password)                |
| Integrações externas        | 22+                                                 |

### Módulos e Status

| Módulo             | Status          | Telas | Funcionalidade Principal                                                    |
| ------------------ | --------------- | ----- | --------------------------------------------------------------------------- |
| **Core**           | ✅ Sempre ativo | ~30   | CrudScreen, Workflow, Kanban, Users, Calendar, Notifications                |
| **Financial**      | ✅ Completo     | 7     | Dashboard, AR/AP, Faturas, Pagamentos, Inadimplentes, Conciliação, Ganhos   |
| **Partners**       | ✅ Completo     | 6     | Parceiros, Disponibilidade, Folgas, Execuções, Avaliações, Logs             |
| **Documents**      | ✅ Completo     | 6     | Templates, Editor, Assinaturas, OCR Config/Results, Generator               |
| **ONR & Cartório** | ✅ Completo     | 3     | Protocolos, Certidões, Cartórios                                            |
| **AI & Automação** | ✅ Completo     | 10    | Agents, States, Playbooks (3), Handoff, Steps, Bindings, Packs, Automations |
| **BI & Analytics** | ✅ Completo     | 1     | Metabase embedded                                                           |
| **CRM & Leads**    | ✅ Completo     | 5     | Kanban leads, Leads CRUD, Lead detail, Campanhas, Dashboard campanhas       |

### Capacidades SaaS

| Capacidade                                    | Status |
| --------------------------------------------- | ------ |
| Multi-tenant isolation                        | ✅     |
| Multi-domain auth (subdomain + custom domain) | ✅     |
| Tenant branding (logo, cor, nome)             | ✅     |
| SaaS billing (5 planos tier)                  | ✅     |
| PIX recorrente mensal                         | ✅     |
| Super-admin dashboard                         | ✅     |
| Template packs onboarding                     | ✅     |
| Agent packs onboarding                        | ✅     |
| GlobalSearch (navegação)                      | ✅     |
| Breadcrumbs (hierarquia)                      | ✅     |
| Permission-based navigation                   | ✅     |
| Module-based navigation                       | ✅     |

---

## 2. Matriz Competitiva — SOS vs Mercado (Fev 2026)

### Feature Comparison (20 capabilities × 6 competitors)

| #   | Capability                 | Pipefy | Monday | Clio | ServiceTitan | Jobber | **SOS** |
| --- | -------------------------- | ------ | ------ | ---- | ------------ | ------ | ------- |
| 1   | Workflow engine            | ✅     | ✅     | ⚠️   | ✅           | ⚠️     | **✅**  |
| 2   | CrudScreen/CRUD genérico   | ❌     | ⚠️     | ❌   | ❌           | ❌     | **✅**  |
| 3   | Kanban visual              | ✅     | ✅     | ❌   | ⚠️           | ❌     | **✅**  |
| 4   | Multi-tenant SaaS          | ❌     | ❌     | ❌   | ❌           | ❌     | **✅**  |
| 5   | Template packs (vertical)  | ⚠️     | ⚠️     | ❌   | ❌           | ❌     | **✅**  |
| 6   | CRM / Leads pipeline       | ❌     | ✅     | ⚠️   | ✅           | ✅     | **✅**  |
| 7   | Faturamento                | ❌     | ❌     | ✅   | ✅           | ✅     | **✅**  |
| 8   | Contas a Receber/Pagar     | ❌     | ❌     | ✅   | ✅           | ⚠️     | **✅**  |
| 9   | Orçamentos + aprovação     | ❌     | ❌     | ⚠️   | ✅           | ✅     | **✅**  |
| 10  | Portal público (sem login) | ❌     | ❌     | ⚠️   | ✅           | ✅     | **✅**  |
| 11  | Assinatura digital         | ❌     | ❌     | ✅   | ❌           | ❌     | **✅**  |
| 12  | OCR de documentos          | ❌     | ❌     | ⚠️   | ❌           | ❌     | **✅**  |
| 13  | AI agents com playbooks    | ✅     | ✅     | ❌   | ❌           | ⚠️     | **✅**  |
| 14  | BI embedded                | ❌     | ✅     | ⚠️   | ✅           | ⚠️     | **✅**  |
| 15  | Pagamento online           | ❌     | ❌     | ✅   | ✅           | ✅     | **❌**  |
| 16  | Time tracking              | ❌     | ✅     | ✅   | ✅           | ⚠️     | **❌**  |
| 17  | NFSe/ Nota fiscal          | ❌     | ❌     | ❌   | ❌           | ❌     | **❌**  |
| 18  | API pública / Webhooks     | ✅     | ✅     | ✅   | ✅           | ✅     | **❌**  |
| 19  | Visual workflow builder    | ✅     | ✅     | ❌   | ❌           | ❌     | **❌**  |
| 20  | Email integrado            | ⚠️     | ✅     | ✅   | ⚠️           | ⚠️     | **❌**  |

**Legenda:** ✅ = implementado completo | ⚠️ = parcial ou básico | ❌ = não existe

### Scorecard Resumido

| Plataforma       | Features ✅ | Parcial ⚠️ | Ausente ❌ | Score   |
| ---------------- | ----------- | ---------- | ---------- | ------- |
| **SOS Platform** | **15**      | **0**      | **5**      | **75%** |
| Monday.com       | 10          | 4          | 6          | 60%     |
| Pipefy           | 5           | 3          | 12         | 33%     |
| ServiceTitan     | 10          | 2          | 8          | 55%     |
| Clio             | 7           | 5          | 8          | 48%     |
| Jobber           | 6           | 5          | 9          | 43%     |

**O SOS lidera em breadth de features** para plataformas de operações configuráveis. O único gap significativo em relação a TODOS os concorrentes é **pagamento online** e **API pública**.

### Onde o SOS é ÚNICO (nenhum concorrente tem)

| Capability                                                 | Por que é único                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **CrudScreen genérico** (49 telas, 1 componente)           | Nenhum concorrente tem CRUD schema-driven que roda 49 telas diferentes                 |
| **Template Packs** (5 verticais em dados, não código)      | Pipefy/Monday têm templates mas são configuração manual, não seed de 13+ tabelas       |
| **Agent Packs** (deploy 1-click de AI agents)              | Nenhum concorrente tem onboarding de AI com pack pré-configurado                       |
| **Multi-tenant + multi-domain + branding**                 | Nenhum concorrente BR tem multi-domain auth com branding por tenant                    |
| **SaaS billing nativo**                                    | Plataformas B2B SaaS geralmente usam Stripe Billing; o SOS tem billing interno com PIX |
| **Integra BR nativa** (Gov.br, ONR, BrasilAPI, ICP-Brasil) | Nenhum concorrente internacional tem integrações brasileiras nativas                   |
| **Bank reconciliation OFX**                                | Raro em plataformas de operações (mais comum em ERPs)                                  |

---

## 3. Gaps vs Mercado — Priorização por Impacto

### 🔴 PRIORIDADE ALTA — Bloqueiam crescimento

| #   | Gap                      | O que falta                                                      | Concorrentes que têm                  | Impacto no negócio                                            | Esforço |
| --- | ------------------------ | ---------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- | ------- |
| 1   | **Pagamento online**     | Gateway MercadoPago/Stripe para PIX, cartão, boleto              | Clio, ServiceTitan, Jobber, Housecall | Tenant não consegue cobrar online; cliente precisa pagar fora | 3-4 sem |
| 2   | **Time tracking**        | `time_entries`, timer no kanban/tasks, timesheet, billable hours | Monday, Clio, Smokeball, ServiceTitan | Escritórios que cobram por hora não conseguem controlar tempo | 2-3 sem |
| 3   | **Formulários públicos** | Rota `/f/:formId` que gera lead automaticamente                  | Monday, Pipefy, HousecallPro, Jobber  | CRM existe mas não tem entrada automática de leads            | 1-2 sem |

### 🟡 PRIORIDADE MÉDIA — Aumentam competitividade

| #   | Gap                           | O que falta                                              | Concorrentes que têm                       | Impacto no negócio                             | Esforço |
| --- | ----------------------------- | -------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- | ------- |
| 4   | **Follow-up automático**      | Automação N8N: lead sem resposta X dias → WhatsApp/email | Monday, Lawcus, HousecallPro, Jobber       | Leads esfriam se não contactados rapidamente   | 1-2 sem |
| 5   | **NFSe automática**           | Integração ENotas/Focus NFe                              | Nenhum concorrente internacional (gap BR)  | Compliance fiscal para empresas brasileiras    | 2-3 sem |
| 6   | **API pública REST**          | Webhook outgoing + REST endpoints documentados           | Pipefy, Monday, Clio, ServiceTitan, Jobber | Tenants com dev team não conseguem integrar    | 3-4 sem |
| 7   | **Integração contábil**       | Omie/Bling API sync                                      | Nenhum concorrente (gap BR)                | Contadores precisam exportar dados manualmente | 2-3 sem |
| 8   | **Export CSV/PDF**            | Botão export em CrudScreen                               | Todos os concorrentes                      | Dados ficam presos na plataforma               | 1-2 sem |
| 9   | **Multi-opção em orçamentos** | Pacotes Bronze/Prata/Ouro em quotes                      | ServiceTitan, HousecallPro, Jobber         | Menos flexibilidade na proposta comercial      | 1 sem   |

### 🟢 PRIORIDADE BAIXA — Nice-to-have

| #   | Gap                         | O que falta                          | Esforço |
| --- | --------------------------- | ------------------------------------ | ------- |
| 10  | **Visual workflow builder** | Editor drag-drop de steps            | 4-6 sem |
| 11  | **Dispatch com mapa**       | Mapa com pins de parceiros/trabalhos | 3-4 sem |
| 12  | **Email integrado**         | Gmail/Outlook dentro do app          | 3-4 sem |
| 13  | **Lead scoring**            | Score automático por atividade       | 1-2 sem |
| 14  | **Check-in/out GPS**        | Parceiro marca presença por geoloc.  | 2-3 sem |
| 15  | **Template orçamento**      | Salvar orçamentos modelo             | 1 sem   |
| 16  | **NPS tracking**            | Métricas de satisfação               | 1 sem   |
| 17  | **e-Notariado/CENSEC**      | Integração atos notariais            | 4-6 sem |
| 18  | **Tabela emolumentos**      | Cálculo automático por estado        | 2-3 sem |

---

## 4. Plano de Melhorias — Próximas 12 Semanas

### Sprint 1 (Semanas 1-3): Monetização Completa

> **Objetivo:** Fechar o ciclo de cobrança. Tenant cobra, cliente paga, NF é emitida.

| #   | Entregável                         | Arquivos                             | Tipo       | Prioridade |
| --- | ---------------------------------- | ------------------------------------ | ---------- | ---------- |
| 1.1 | **Gateway MercadoPago**            | `services/mercadopago.ts`            | Integração | 🔴         |
| 1.2 | Botão "Pagar" na fatura do portal  | `app/(public)/p/[token].tsx` update  | UI         | 🔴         |
| 1.3 | Checkout inline (PIX QR + cartão)  | Nova tela pública `/pay/:invoiceId`  | UI         | 🔴         |
| 1.4 | Webhook de confirmação             | N8N webhook → update `payments`      | Backend    | 🔴         |
| 1.5 | Split payment config               | Campo `commission_split` em partners | Config     | 🟡         |
| 1.6 | Notificação "Pagamento confirmado" | `services/notification-events.ts`    | Auto       | 🟡         |

**DNA preservado:** Gateway é um `services/mercadopago.ts`. Troca para Stripe = muda 1 arquivo. Telas existentes (faturas, portal) ganham botão "Pagar".

### Sprint 2 (Semanas 4-6): Produtividade + Captação

> **Objetivo:** Time tracking para billing por hora + formulários públicos para gerar leads.

| #   | Entregável                          | Arquivos                         | Tipo      | Prioridade |
| --- | ----------------------------------- | -------------------------------- | --------- | ---------- |
| 2.1 | **Tabela `time_entries`**           | Migration + CrudScreen           | CRUD      | 🔴         |
| 2.2 | Timer widget no Kanban/Task Detail  | Componente `TimerWidget.tsx`     | UI        | 🔴         |
| 2.3 | Timesheet CrudScreen                | `Administrador/time-entries.tsx` | CRUD      | 🔴         |
| 2.4 | Relatório produtividade             | Dashboard com aggregateCrud      | UI        | 🟡         |
| 2.5 | **Formulário público** `/f/:formId` | `app/(public)/f/[formId].tsx`    | Rota      | 🟡         |
| 2.6 | Formulário → Lead automático        | `services/crm.ts` update         | Service   | 🟡         |
| 2.7 | Follow-up WhatsApp automático       | N8N workflow                     | Automação | 🟡         |

**DNA preservado:** `time_entries` é CrudScreen. Timer é widget reutilizável. FormData público gera lead via `services/crm.ts` existente.

### Sprint 3 (Semanas 7-9): Integrations & Export

> **Objetivo:** Conectar com ecossistema BR + permitir extrair dados.

| #   | Entregável                   | Arquivos                           | Tipo       | Prioridade |
| --- | ---------------------------- | ---------------------------------- | ---------- | ---------- |
| 3.1 | **NFSe via ENotas**          | `services/enotas.ts`               | Integração | 🟡         |
| 3.2 | Botão "Emitir NF" na fatura  | `Faturas.tsx` update               | UI         | 🟡         |
| 3.3 | **Export CSV** em CrudScreen | `CrudScreen.tsx` prop `exportable` | Core       | 🟡         |
| 3.4 | **Export PDF** em CrudScreen | `services/pdf-export.ts`           | Service    | 🟡         |
| 3.5 | API pública REST (v1)        | N8N authenticated endpoints        | Backend    | 🟡         |
| 3.6 | Webhook outgoing config      | Tabela `webhooks` + N8N triggers   | Backend    | 🟡         |

**DNA preservado:** ENotas é `services/enotas.ts` (trocar = 1 arquivo). Export é melhoria do CrudScreen (beneficia 49 telas). API pública é layer sobre api_crud existente.

### Sprint 4 (Semanas 10-12): Polish & Scale

> **Objetivo:** Refinar UX, adicionar features de polimento.

| #   | Entregável                            | Tipo       | Prioridade |
| --- | ------------------------------------- | ---------- | ---------- |
| 4.1 | Multi-opção em orçamentos (pacotes)   | UI         | 🟡         |
| 4.2 | Template de orçamento (salvar modelo) | CRUD       | 🟢         |
| 4.3 | Integração Omie (sync financeiro)     | Integração | 🟡         |
| 4.4 | Lead scoring automático               | Service    | 🟢         |
| 4.5 | NPS tracking (métricas satisfação)    | Dashboard  | 🟢         |
| 4.6 | Redirect review → Google Reviews      | Automação  | 🟢         |
| 4.7 | Email templates de notificação        | N8N        | 🟡         |
| 4.8 | SLA tracking em contratos             | CRUD       | 🟢         |

---

## 5. Métricas de Progresso — Como Medir Evolução

### Scorecard do Produto (atualizar mensalmente)

| Métrica                     | Hoje (Fev 2026) | Meta (Mai 2026)                 | Meta (Ago 2026)      |
| --------------------------- | --------------- | ------------------------------- | -------------------- |
| Telas totais                | 98              | 110                             | 120                  |
| CrudScreens                 | 49              | 55                              | 60                   |
| Admin pages                 | 53              | 60                              | 65                   |
| Services                    | 43              | 50                              | 55                   |
| Módulos                     | 8               | 9 (+time_tracking)              | 10 (+portal_empresa) |
| Template packs              | 5               | 6 (+imobiliaria)                | 7 (+contabilidade)   |
| Agent packs                 | 1               | 2 (+atendimento)                | 3 (+vendas)          |
| Integrações                 | 22              | 25 (+MercadoPago, ENotas, Omie) | 28                   |
| Features vs competitors (%) | 75%             | 85%                             | 90%                  |
| Gaps 🔴 (bloqueiam)         | 3               | 0                               | 0                    |

### Feature Completion por Módulo

| Módulo         | Completude | Próximo marco                      |
| -------------- | ---------- | ---------------------------------- |
| Core           | 95%        | Export CSV/PDF, Table view desktop |
| Financial      | 85%        | Gateway pagamento, NFSe            |
| Partners       | 90%        | Check-in GPS, Split payment        |
| Documents      | 95%        | —                                  |
| ONR & Cartório | 90%        | e-Notariado/CENSEC                 |
| AI & Automação | 85%        | Sugestão proativa, NLP             |
| BI & Analytics | 80%        | Mais dashboards pré-prontos        |
| CRM & Leads    | 70%        | Formulários, follow-up, scoring    |
| Time Tracking  | 0%         | Tabela + timer + timesheet         |
| Portal Cliente | 60%        | Pagamento online, PWA              |

---

## 6. Riscos e Dependências

| Risco                                    | Impacto                    | Mitigação                                                              |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| MercadoPago demora para aprovar conta    | Atrasa Sprint 1            | Ter Stripe como plano B, ambos devem ter wrapper service               |
| ENotas tem complexidade por município    | Atrasa Sprint 3            | Começar com emissão manual + upload de NF como fallback                |
| Time tracking muda UX significativamente | Confusão do usuário        | Timer widget é opt-in, aparece só se módulo `time_tracking` ativo      |
| API pública expõe dados                  | Segurança                  | Token-based auth + rate limiting + tenant isolation                    |
| Export CSV/PDF em CrudScreen genérico    | Complexidade no componente | Fazer como prop opt-in (`exportable`) para não afetar telas existentes |

---

## 7. Priorização Visual — Impacto × Esforço

```
IMPACTO ALTO
│
│  ★ Pagamento online    ★ Time tracking
│  (3-4 sem, 🔴)          (2-3 sem, 🔴)
│
│  ★ NFSe (2-3 sem)     ★ API pública (3-4 sem)
│                         ★ Integração Omie (2-3 sem)
│
│  ★ Formulário público  ★ Export CSV/PDF
│  (1-2 sem, 🟡)          (1-2 sem, 🟡)
│
│  ★ Follow-up auto      ★ Multi-opção quotes
│  (1-2 sem, 🟡)          (1 sem, 🟡)
│
│                         ★ Lead scoring (1-2 sem)
│
│                                            ★ Workflow builder
│                                              (4-6 sem, 🟢)
│                                            ★ Dispatch mapa
│                                              (3-4 sem, 🟢)
│
IMPACTO BAIXO ────────────────────────────── ESFORÇO ALTO
```

---

## 8. O que NÃO Fazer (Anti-Roadmap)

Tão importante quanto saber o que construir é saber o que **não construir** para preservar o DNA:

| ❌ Não fazer                          | Por quê                                           |
| ------------------------------------- | ------------------------------------------------- |
| Tela custom por vertical              | Template Pack resolve com DADOS, não código       |
| Backend próprio (sair do N8N)         | N8N funciona. Reescrever = 6 meses sem ganho      |
| Módulo contábil completo              | Omie/Bling já fazem. INTEGRAR, não BUILD          |
| Gateway de pagamento próprio          | MercadoPago/Stripe já fazem. INTEGRAR             |
| Hosting de AI models                  | Usar OpenAI/Anthropic API via N8N. INTEGRAR       |
| Recriar Metabase                      | BI self-hosted funciona. EMBED                    |
| App nativo separado para parceiros    | Mesma app, filtrada por role. Não duplicar        |
| Migrar para Next.js/backend diferente | Expo + N8N é o stack. Refactor lateral não agrega |

---

_Documento vivo — atualizar a cada sprint. Próxima revisão: Março 2026._
