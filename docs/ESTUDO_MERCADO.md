# Estudo de Mercado — Radul Platform

## Resumo Executivo

A Radul é uma plataforma SaaS multi-tenant de **operações configurável para qualquer empresa de serviços** — prestadores, consultores, escritórios de advocacia, vendedores, gestores de atividades, empresas de cobrança, despachantes, entre outros. Após auditoria completa do codebase (~169 telas, 114 páginas admin, 80+ tabelas, 13 módulos, 6 template packs + 2 agent packs, 76 services, 22+ integrações externas), comparamos com **12 plataformas concorrentes** de 4 verticais diferentes para identificar gaps de funcionalidade.

**Resultado principal (atualizado Fev 2026):** A Radul evoluiu massivamente. **Todos os 7 gaps críticos foram resolvidos**:

1. ✅ **Financeiro** — Módulo completo: faturas, pagamentos, contas a receber/pagar, inadimplentes, recibos, dashboard, conciliação bancária OFX, DRE, export contábil
2. ✅ **Portal do Cliente** — Portal público `/p/:token` com timeline, review, estimativa de prazo/custo
3. ✅ **Orçamentos** — Sistema completo: quotes + quote_items + link público `/q/:token` com aprovação online, multi-opção (pacotes), quote templates
4. ✅ **Parceiros** — Portal dedicado: Meus Trabalhos, aceitar/recusar, ganhos, comissões, PIX, disponibilidade, folgas, channel partners
5. ✅ **CRM / Leads** — Pipeline kanban, leads CrudScreen, detalhe do lead, campanhas, dashboard de campanhas, formulários públicos, lead scoring, follow-up
6. ✅ **AI Agents** — Arquitetura completa: 9 telas admin, playbooks, handoff, channel bindings, 2 agent packs
7. ✅ **Pagamento online (gateway)** — 3 gateways implementados (Asaas + MercadoPago + Mock) via interface `IPaymentGateway`

**Gaps restantes prioritários:** Time Tracking, NFSe, Integração contábil, Visual Workflow Builder, Export CSV/PDF

---

## Metodologia

### Concorrentes Analisados

| #   | Plataforma        | Vertical           | País  | Relevância                                      |
| --- | ----------------- | ------------------ | ----- | ----------------------------------------------- |
| 1   | **Pipefy**        | Workflow/BPM       | BR    | Orquestração de processos, AI Agents, portais   |
| 2   | **Monday.com**    | Work Management    | IL/US | AI, CRM, projetos, automações                   |
| 3   | **Clio**          | Legal Practice     | CA    | Gestão jurídica, billing, client portal         |
| 4   | **Lawcus**        | Legal Practice     | US    | CRM jurídico, billing, automações, e-signatures |
| 5   | **Smokeball**     | Legal Practice     | AU/US | Auto time tracking, document automation, AI     |
| 6   | **ServiceTitan**  | Field Service      | US    | CRM, dispatch, job costing, customer portal     |
| 7   | **Housecall Pro** | Field Service      | US    | Scheduling, payments, AI team, reviews          |
| 8   | **Jobber**        | Field Service      | CA    | Quotes, scheduling, CRM, AI receptionist        |
| 9   | **e-Notariado**   | Cartórios          | BR    | Atos notariais digitais, CENSEC, apostilamento  |
| 10  | **ONR/SREI**      | Registro Imóveis   | BR    | Protocolos eletrônicos, certidões               |
| 11  | **Documenso**     | Assinatura Digital | EU    | Assinatura eletrônica open-source               |
| 12  | **DocuSign**      | Assinatura Digital | US    | Líder global em e-signatures                    |

### Stakeholders Avaliados

- **Tenants** — Empresas que usam a plataforma (escritórios, despachantes, advogados)
- **Parceiros** — Profissionais que executam serviços em campo
- **Clientes** — Pessoas físicas/jurídicas que contratam serviços
- **Operadores** — Staff interno dos tenants

---

## Estado Atual do SOS Escritura

### Pontos Fortes (já implementados)

| Área                   | Funcionalidades                                                 |
| ---------------------- | --------------------------------------------------------------- |
| **Workflow Engine**    | Templates, steps, transições, tarefas automáticas, FSM completo |
| **Kanban**             | Board visual por categoria → tipo → processo                    |
| **Assinatura Digital** | Documenso + ICP-Brasil (Lei 14.063), tracking completo          |
| **OCR**                | Tesseract.js, PDF-to-image, extração de CPF/CNPJ/datas          |
| **Document Templates** | Editor HTML, variáveis, auto-fill, geração PDF                  |
| **Calendário**         | Consolidado, multi-user, iCal sync, export .ics                 |
| **BI**                 | Metabase self-hosted, dashboard interativo, cross-filters       |
| **Multi-tenant**       | Tenant isolation, roles, permissions matrix (30+)               |
| **WhatsApp**           | Chatbot "Ana", handoff humano, toggle por sessão                |
| **Integrações BR**     | Gov.br OAuth, BrasilAPI, ReceitaWS, ONR/SREI                    |
| **Notificações**       | 9 tipos × 4 canais, preferências por usuário                    |
| **Auth**               | CPF/email, Google OAuth, Gov.br (3 níveis confiança)            |

---

## Análise de Gaps por Stakeholder

---

### 🏢 TENANTS (Empresas)

#### GAP 1: FINANCEIRO — ~~Prioridade CRÍTICA~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** Módulo financeiro completo implementado — 6 telas admin, dashboard com KPIs, gestão de inadimplência.

| Funcionalidade             | Clio | Lawcus | Smokeball | ServiceTitan | HousecallPro | SOS |
| -------------------------- | ---- | ------ | --------- | ------------ | ------------ | --- |
| Faturamento/Invoicing      | ✅   | ✅     | ✅        | ✅           | ✅           | ✅  |
| Contas a Receber           | ✅   | ✅     | ✅        | ✅           | ✅           | ✅  |
| Contas a Pagar             | ❌   | ❌     | ❌        | ✅           | ❌           | ✅  |
| Pagamento Online           | ✅   | ✅     | ✅        | ✅           | ✅           | ❌  |
| Trust/Escrow Accounting    | ✅   | ✅     | ✅        | ❌           | ❌           | ❌  |
| Integração QuickBooks/Xero | ✅   | ✅     | ✅        | ✅           | ✅           | ❌  |
| Recibos Automáticos        | ✅   | ✅     | ✅        | ✅           | ✅           | ✅  |
| Relatórios Financeiros     | ✅   | ✅     | ✅        | ✅           | ✅           | ✅  |
| Dashboard Financeiro       | ✅   | ✅     | ✅        | ✅           | ✅           | ✅  |
| Gestão Inadimplência       | ✅   | ❌     | ❌        | ✅           | ❌           | ✅  |

**Restante:** Pagamento online (gateway MercadoPago/Stripe) e integração contábil (Omie/Bling).

---

#### GAP 2: TIME TRACKING / CONTROLE DE HORAS — Prioridade ALTA ⬛⬛⬛⬛⬜

**O que falta:** Escritórios e despachantes cobram por hora ou por ato. Nenhum tracking de tempo existe no SOS.

| Funcionalidade           | Clio | Smokeball       | ServiceTitan | SOS |
| ------------------------ | ---- | --------------- | ------------ | --- |
| Time tracking manual     | ✅   | ✅              | ✅           | ❌  |
| Auto time tracking       | ❌   | ✅ (patenteado) | ❌           | ❌  |
| Timesheet por task       | ✅   | ✅              | ✅           | ❌  |
| Billable vs Non-billable | ✅   | ✅              | ✅           | ❌  |

**Recomendação:**

1. Tabela `time_entries` (user_id, task_id, service_order_id, start_time, end_time, billable)
2. Timer widget no Kanban e Task Detail
3. Relatório de produtividade por operador

---

#### GAP 3: CRM / PIPELINE DE VENDAS — ~~Prioridade ALTA~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** Sistema CRM completo implementado com 5 telas + 2 services.

| Funcionalidade           | Monday | Lawcus | HousecallPro | Jobber | SOS |
| ------------------------ | ------ | ------ | ------------ | ------ | --- |
| Lead pipeline/kanban     | ✅     | ✅     | ✅           | ✅     | ✅  |
| Lead scoring             | ✅     | ❌     | ❌           | ❌     | ✅  |
| Formulários de captação  | ✅     | ✅     | ✅           | ✅     | ✅  |
| Follow-up automático     | ✅     | ✅     | ✅           | ✅     | ✅  |
| Conversão lead → cliente | ✅     | ✅     | ✅           | ✅     | ✅  |
| Email marketing          | ✅     | ✅     | ✅           | ✅     | ❌  |
| Campanhas                | ✅     | ✅     | ✅           | ❌     | ✅  |
| Dashboard de campanhas   | ✅     | ❌     | ❌           | ❌     | ✅  |

**Implementado:**

1. ✅ CrudScreen `leads` (crm-leads.tsx) com campos completos
2. ✅ Kanban visual por estágio (crm-kanban.tsx) — mesmo padrão do kanban-processos
3. ✅ Detalhe do lead (crm-lead-detail.tsx) com timeline e ações
4. ✅ Campanhas (campaigns.tsx) + Dashboard de campanhas (campaign-dashboard.tsx)
5. ✅ Conversão lead → cliente via services/crm.ts

6. ✅ Formulários públicos de captação (`/f/:slug`) — services/lead-forms.ts + rota pública + admin CrudScreen
7. ✅ Lead scoring — calculateLeadScore() + updateLeadScore() + recalculateAllLeadScores()
8. ✅ Follow-up automático — getOverdueFollowUps() + scheduleFollowUp()
9. ✅ Admin de formulários (lead-forms.tsx) com copy link + WhatsApp share

**Restante:** Email marketing (integração futura com SendGrid/Resend).

---

#### GAP 4: ORÇAMENTOS / PROPOSTAS — ~~Prioridade ALTA~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** Sistema completo de orçamentos implementado com link público de aprovação.

| Funcionalidade           | ServiceTitan | HousecallPro | Jobber | SOS |
| ------------------------ | ------------ | ------------ | ------ | --- |
| Geração de orçamento     | ✅           | ✅           | ✅     | ✅  |
| Multi-opção (pacotes)    | ✅           | ✅           | ✅     | ✅  |
| Aprovação online         | ✅           | ✅           | ✅     | ✅  |
| Conversão orçamento → OS | ✅           | ✅           | ✅     | ✅  |
| Template de orçamento    | ✅           | ✅           | ✅     | ✅  |
| Validade do orçamento    | ✅           | ✅           | ✅     | ✅  |

**Implementado (adição Fev 2026):**

5. ✅ Templates de orçamento — services/quote-templates.ts + admin CrudScreen (quote-templates.tsx)
6. ✅ Multi-opção (pacotes) — is_package, package_name, quote_group_id, selectQuoteOption()
7. ✅ createMultiOptionQuotes() — gera múltiplos orçamentos agrupados para o cliente escolher

**Já existente:** quotes, quote_items, link público /q/:token, aprovação online, template variables.

**Restante:** PDF com marca do tenant (impressão), assinatura digital no orçamento.

---

#### GAP 5: CONTRATO / SLA — ~~Prioridade MÉDIA~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** Sistema de contratos implementado com SLA tracking, renovação e vínculo com OS.

| Funcionalidade                 | Clio | ServiceTitan | SOS                             |
| ------------------------------ | ---- | ------------ | ------------------------------- |
| Templates de contrato          | ✅   | ✅           | ⚠️ parcial (document_templates) |
| Assinatura digital de contrato | ✅   | ✅           | ✅ (via Documenso)              |
| SLA tracking                   | ❌   | ✅           | ✅                              |
| Renovação automática           | ✅   | ✅           | ✅                              |
| Vínculo contrato ↔ OS          | ✅   | ✅           | ✅                              |

**Implementado:**

1. ✅ Tabela `contracts` (tenant_id, customer_id, status, SLA, auto_renew, document links)
2. ✅ Tabela `contract_service_orders` (many-to-many contrato ↔ OS)
3. ✅ services/contracts.ts — CRUD, renewContract(), checkSlaCompliance(), getUpcomingRenewals(), getAutoRenewableContracts()
4. ✅ Admin CrudScreen (contracts.tsx) com campos de SLA, renovação condicional, botão Renovar
5. ✅ Integração com document_templates e document_signatures

**Restante:** Alerta automático de vencimento via N8N (cron).

---

#### GAP 6: INTEGRAÇÃO CONTÁBIL/ERP — Prioridade MÉDIA ⬛⬛⬛⬜⬜

| Funcionalidade            | Clio | Smokeball | HousecallPro | Jobber | SOS |
| ------------------------- | ---- | --------- | ------------ | ------ | --- |
| QuickBooks                | ✅   | ✅        | ✅           | ✅     | ❌  |
| Xero                      | ✅   | ❌        | ❌           | ❌     | ❌  |
| Omie / Conta Azul / Bling | N/A  | N/A       | N/A          | N/A    | ❌  |
| NFe/NFSe                  | N/A  | N/A       | N/A          | N/A    | ❌  |
| Webhook/API aberta        | ✅   | ✅        | ✅           | ✅     | ❌  |

**Recomendação:**

1. Fase 1: Export CSV/PDF de relatórios financeiros
2. Fase 2: API REST pública para integrações
3. Fase 3: Integração Omie/Bling/Conta Azul (mais usados no BR)

---

### 👤 CLIENTES (End Users)

#### GAP 7: PORTAL DO CLIENTE SELF-SERVICE — ~~Prioridade CRÍTICA~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** Portal público `/p/:token` implementado com timeline, review e estimativa. Pagamento integrado via 3 gateways (Asaas, MercadoPago, Mock).

| Funcionalidade         | Smokeball | ServiceTitan | HousecallPro | Jobber | SOS               |
| ---------------------- | --------- | ------------ | ------------ | ------ | ----------------- |
| Portal web (sem app)   | ✅        | ✅           | ✅           | ✅     | ✅ (`/p/:token`)  |
| Histórico de serviços  | ✅        | ✅           | ✅           | ✅     | ✅                |
| Aprovação de orçamento | ❌        | ✅           | ✅           | ✅     | ✅ (`/q/:token`)  |
| Pagamento online       | ✅        | ✅           | ✅           | ✅     | ✅ (3 gateways)   |
| Upload de documentos   | ✅        | ❌           | ❌           | ❌     | ✅                |
| Chat com operador      | ✅        | ❌           | ✅           | ❌     | ✅                |
| Tracking em tempo real | ❌        | ✅           | ✅           | ❌     | ✅ (timeline + %) |
| Agendamento online     | ❌        | ✅           | ✅           | ✅     | ✅                |

**Recomendação:**

1. **Web App PWA** — Versão web do portal do cliente (expo web já suporta)
2. **Link direto por WhatsApp** — "Acompanhe seu processo: https://app.sosescritura.com.br/p/ABC123"
3. **QR Code no protocolo físico** → link direto para acompanhar

---

#### GAP 8: PAGAMENTO / CHECKOUT — ~~⚠️ PARCIAL~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** 3 gateways de pagamento implementados via interface `IPaymentGateway`: Asaas (PIX + boleto + cartão), MercadoPago (PIX + cartão), Mock (desenvolvimento). Worker dedicado `asaas-webhook` para webhooks de confirmação.

| Funcionalidade               | ServiceTitan | HousecallPro | Jobber | SOS                                             |
| ---------------------------- | ------------ | ------------ | ------ | ----------------------------------------------- |
| Cartão de crédito            | ✅           | ✅           | ✅     | ✅ (via Asaas + MercadoPago)                    |
| PIX                          | N/A          | N/A          | N/A    | ✅ (copia e cola + QR Code + BRCode + gateways) |
| Boleto                       | N/A          | N/A          | N/A    | ✅ (via Asaas)                                  |
| Parcelamento / Financiamento | ✅           | ✅           | ❌     | ❌                                              |
| InstaPay (depósito rápido)   | ❌           | ✅           | ❌     | ❌                                              |
| Recibo automático            | ✅           | ✅           | ✅     | ✅                                              |

**Implementado:**

1. ✅ `services/pix.ts` — wrapper pix-utils para gerar BRCode + QR Code base64
2. ✅ PIX copia e cola em faturas, SaaS billing, e contas a receber
3. ✅ Validação de chave PIX (CPF, CNPJ, email, telefone, chave aleatória)
4. ✅ `services/payment-gateway.ts` — interface `IPaymentGateway` com 3 implementações
5. ✅ `workers/asaas-webhook/` — Cloudflare Worker para webhooks de pagamento
6. ✅ Admin CrudScreen `payments.tsx` com status lifecycle

**Restante:**

1. Split payment (parceiro recebe X%, tenant recebe Y%)
2. Parcelamento automático via gateway

---

#### GAP 9: AVALIAÇÃO / REVIEW AUTOMATIZADO — ~~Prioridade MÉDIA~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** Review automático implementado via portal público `/p/review/:token`.

| Funcionalidade                | HousecallPro | Jobber | SOS |
| ----------------------------- | ------------ | ------ | --- |
| Pedido automático pós-serviço | ✅           | ✅     | ✅  |
| Redirect para Google Reviews  | ✅           | ✅     | ❌  |
| NPS tracking                  | ✅           | ❌     | ❌  |
| Badge de satisfação           | ✅           | ✅     | ❌  |

**Recomendação:**

1. Automação: ao concluir processo → enviar link de avaliação via WhatsApp/email
2. Se rating > 4 → pedir review no Google
3. Se rating < 3 → alert para gestor

---

#### GAP 10: ESTIMATIVA DE PRAZO E CUSTO — ~~Prioridade ALTA~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** Campos de estimativa implementados em `service_orders` + exibidos no portal público.

| Funcionalidade                  | ServiceTitan | HousecallPro | SOS                               |
| ------------------------------- | ------------ | ------------ | --------------------------------- |
| Estimativa de custo pré-serviço | ✅           | ✅           | ✅                                |
| Tempo médio estimado            | ✅           | ❌           | ✅                                |
| Progresso % do processo         | ❌           | ❌           | ✅ (step atual / total no portal) |

**Recomendação:**

1. Campo `estimated_cost_min/max` e `estimated_days` em `service_types`
2. Exibir na tela de solicitação antes do cliente confirmar
3. Barra de progresso com % baseada no step atual vs total de steps

---

### 🔧 PARCEIROS (Profissionais de Campo)

#### GAP 11: PORTAL DO PARCEIRO — ~~Prioridade ALTA~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** Portal dedicado completo via tela "Meus Trabalhos" + ganhos + aceitar/recusar + PIX.

| Funcionalidade            | ServiceTitan | HousecallPro | Uber/iFood modelo | SOS             |
| ------------------------- | ------------ | ------------ | ----------------- | --------------- |
| App/portal dedicado       | ✅           | ✅           | ✅                | ✅              |
| Dashboard de trabalhos    | ✅           | ✅           | ✅                | ✅              |
| Aceitar/rejeitar trabalho | ✅           | ✅           | ✅                | ✅              |
| Histórico de ganhos       | ✅           | ✅           | ✅                | ✅              |
| Checklist de execução     | ✅           | ✅           | ❌                | ✅ (step forms) |
| Check-in/check-out GPS    | ✅           | ✅           | ✅                | ❌              |

**Recomendação:**

1. Role `parceiro` com tela dedicada (Meus Trabalhos, Ganhos, Agenda)
2. Notificação push + WhatsApp quando novo trabalho disponível
3. Botão "Aceitar" / "Recusar" com SLA (aceitar em X minutos)
4. Checklist de execução (fotos antes/depois, assinatura do cliente)

---

#### GAP 12: DISTRIBUIÇÃO INTELIGENTE DE TRABALHO — Prioridade MÉDIA ⬛⬛⬛⬜⬜

| Funcionalidade             | ServiceTitan | Uber modelo | SOS |
| -------------------------- | ------------ | ----------- | --- |
| Matching por localização   | ✅           | ✅          | ❌  |
| Matching por especialidade | ✅           | ✅          | ❌  |
| Matching por rating        | ✅           | ✅          | ❌  |
| Round-robin                | ✅           | ❌          | ❌  |
| Bid system                 | ❌           | ❌          | ❌  |

**Recomendação:**

1. Algoritmo: parceiros próximos + rating alto + disponibilidade → oferecer primeiro
2. Fallback: broadcast para todos da região se ninguém aceitar em X min

---

#### GAP 13: GANHOS / COMISSIONAMENTO — ~~Prioridade ALTA~~ ✅ IMPLEMENTADO

**Atualização Fev 2026:** Tabela `partner_earnings` implementada. Admin CrudScreen + aba de ganhos no Meus Trabalhos + campos PIX.

**Implementado:**

1. ✅ Tabela `partner_earnings` (service_order_id, partner_id, amount, type, status, paid_at)
2. ✅ Dashboard: ganhos do mês, pendente, pago (aba Ganhos no Meus Trabalhos)
3. ✅ Admin: CrudScreen Ganhos de Parceiros com filtros
4. ✅ Campos PIX no parceiro: pix_key, pix_key_type, bank_name

---

### 👨‍💻 OPERADORES (Staff Interno)

#### GAP 14: EMAIL INTEGRADO — Prioridade MÉDIA ⬛⬛⬛⬜⬜

| Funcionalidade            | Clio | Smokeball | Monday | SOS |
| ------------------------- | ---- | --------- | ------ | --- |
| Email tracking per matter | ✅   | ✅ (auto) | ✅     | ❌  |
| Templates de email        | ✅   | ✅        | ✅     | ❌  |
| Email dentro do app       | ✅   | ✅        | ✅     | ❌  |

**Recomendação:**

1. Integração Gmail/Outlook via OAuth para envio dentro do app
2. Auto-vincular emails ao service_order por context (assunto, contato)

---

#### GAP 15: DISPATCH / DESPACHO INTELIGENTE — Prioridade MÉDIA ⬛⬛⬛⬜⬜

| Funcionalidade       | ServiceTitan | HousecallPro | SOS |
| -------------------- | ------------ | ------------ | --- |
| Board de despacho    | ✅           | ✅           | ❌  |
| Drag-drop atribuição | ✅           | ✅           | ❌  |
| Mapa com localização | ✅           | ✅           | ❌  |
| Otimização de rota   | ✅           | ❌           | ❌  |
| "A caminho" SMS/push | ✅           | ✅           | ❌  |

**Recomendação:**

1. Mapa na tela admin com pins de parceiros + trabalhos
2. "A caminho" notificação automática quando parceiro aceita/sai

---

#### GAP 16: AI ASSISTENTE CONTEXTUAL — ~~Prioridade MÉDIA~~ ✅ SIGNIFICATIVAMENTE EXPANDIDO

**Atualização Fev 2026:** Arquitetura completa de AI Agents implementada — 9 telas admin + agent packs.

| Funcionalidade              | Monday | Smokeball   | HousecallPro | SOS                          |
| --------------------------- | ------ | ----------- | ------------ | ---------------------------- |
| AI assistant conversacional | ✅     | ✅ (Archie) | ✅ (AI Team) | ✅ (Agents + WhatsApp bot)   |
| AI sugestão próxima etapa   | ✅     | ✅          | ✅           | ⚠️ (via playbooks, parcial)  |
| AI análise de documento     | ❌     | ❌          | ❌           | ✅ (OCR + AI insights)       |
| AI resumo de processo       | ✅     | ✅          | ❌           | ✅ (AI insights por tela)    |
| Agent playbooks             | ❌     | ❌          | ❌           | ✅ (regras + tabelas ref)    |
| Handoff bot → humano        | ✅     | ❌          | ✅           | ✅ (políticas por canal)     |
| Multi-channel bindings      | ✅     | ❌          | ❌           | ✅ (WhatsApp, app, operador) |
| Agent packs (templates)     | ❌     | ❌          | ❌           | ✅ (1-click deploy)          |

**Implementado:**

1. ✅ 3 tipos de agents (atendimento, operacional, supervisão) com CrudScreen
2. ✅ Estados de agentes (agent_states) com máquina de estados
3. ✅ Playbooks com regras e tabelas de referência (3 telas)
4. ✅ Handoff policies (transferência entre canais com regras)
5. ✅ Channel bindings (qual agente atende qual canal)
6. ✅ Agent Packs — deploy pré-configurado em 1 clique
7. ✅ AI insights contextual por tela no CrudScreen

**Restante:** Sugestão proativa de próxima etapa (baseada em histórico), NLP avançado para classificação automática.

**Recomendação:**

1. Copilot contextual no Kanban: "Este processo tem 3 documentos pendentes e prazo em 5 dias"
2. Sugestão automática de próximo passo baseada em histórico
3. Resumo de processo em linguagem natural para o cliente

---

#### GAP 17: VISUAL WORKFLOW BUILDER — Prioridade BAIXA ⬛⬛⬜⬜⬜

| Funcionalidade            | Pipefy | Monday | SOS                   |
| ------------------------- | ------ | ------ | --------------------- |
| Drag-drop workflow editor | ✅     | ✅     | ❌                    |
| Conditional branches      | ✅     | ✅     | ⚠️ (step_transitions) |
| Visual preview            | ✅     | ✅     | ❌                    |

**Recomendação (Fase futura):**

1. Editor visual de workflow com drag-drop de steps
2. Preview do fluxo como diagrama

---

## Funcionalidades Específicas do Mercado Brasileiro

### GAP 18: e-NOTARIADO / CENSEC — Prioridade MÉDIA ⬛⬛⬛⬜⬜

> **Nota de posicionamento:** Esta é uma integração para empresas que precisam protocolar documentos em cartório (imobiliárias, despachantes, advocacias, construtoras). Cartórios NÃO são o público-alvo da plataforma — são prestadores de serviço regulados que podem ser acessados via integração.

O e-Notariado é a plataforma oficial do Colégio Notarial do Brasil com:

- **CENSEC** — Central Nacional de Serviços Eletrônicos dos Notários (buscas de escrituras/procurações)
- **Apostil** — Apostilamento digital (Convenção de Haia)
- **Fluxo de Assinaturas** — Assinatura eletrônica notarial
- **Busca Testamento** — Registro central de testamentos
- **CENAD** — Central de assinatura digital notarial
- **Conta Notarial** — Pagamento de atos notariais

**SOSApp tem:** ONR/SREI (registro de imóveis), mas NÃO tem integração com e-Notariado (atos notariais).

**Recomendação:**

1. Integração CENSEC para busca de escrituras existentes
2. Integração Apostil para atos que precisam de validação internacional
3. Integração Busca Testamento para serviços de inventário

---

### GAP 19: NFe/NFSe AUTOMÁTICA — Prioridade MÉDIA ⬛⬛⬛⬜⬜

Escritórios de serviço precisam emitir nota fiscal de serviço.

**Recomendação:**

1. Integração com API de NFSe (via Focus NFe, Enotas, ou NFSe.io)
2. Auto-emissão ao marcar fatura como paga

---

### GAP 20: TABELA DE EMOLUMENTOS — Prioridade BAIXA ⬛⬛⬜⬜⬜

> **Nota:** Relevante apenas para empresas que trabalham com registros em cartório (despachantes, imobiliárias). Módulo opcional `onr_cartorio`.

Cartórios e serviços registrais seguem tabelas de emolumentos definidas por Estado.

**Recomendação:**

1. Tabela `fee_schedules` com valores por tipo de ato e estado
2. Cálculo automático de custos baseado no tipo de serviço

---

## Matriz de Priorização

### Impacto vs Esforço

```
ALTO IMPACTO + BAIXO ESFORÇO (Quick Wins) — ✅ TODOS FEITOS
├── ✅ Estimativa de prazo/custo nos tipos de serviço
├── ✅ Barra de progresso % no Processo
├── ✅ Review automatizado pós-serviço
├── ✅ Link público de acompanhamento
└── ✅ Ganhos do parceiro (tabela simples)

ALTO IMPACTO + MÉDIO ESFORÇO (Prioridade) — ✅ MAIORIA FEITA
├── ✅ 💰 Faturamento/Invoicing (invoices + PDF + status)
├── ✅ 💰 Pagamento online (3 gateways: Asaas + MercadoPago + Mock)
├── ✅ 📋 Orçamentos/Quotes com aprovação online + multi-opção + templates
├── ✅ 🏪 Portal do Parceiro (Meus Trabalhos + ganhos + channel partners)
├── ✅ 📊 CRM/Lead Pipeline (kanban + campanhas + conversão + lead scoring)
├── ✅ 🤖 AI Agents (9 telas + 2 agent packs)
├── ✅ 💳 SaaS Billing (planos + recorrência + dashboard)
├── ✅ 🏦 Conciliação Bancária (OFX import + matching)
├── ✅ 📝 Contratos/SLA (renovação + compliance)
├── ✅ 🛒 Marketplace/PDV (produtos + estoque + compras + entregas)
├── ✅ 📄 Content Pages (blog + landing + CMS)
├── ✅ 🤝 Channel Partners (referral codes + comissões)
└── 🔜 ⏱️ Time tracking

ALTO IMPACTO + ALTO ESFORÇO (Estratégico)
├── ✅ Portal web para clientes (/p/:token)
├── ✅ Multi-domain auth + tenant branding
├── Split payment (parceiro/tenant)
├── NFSe automática
├── Dispatch com mapa
├── API pública REST
└── Integração e-Notariado/CENSEC (módulo ONR)

BAIXO IMPACTO + ALTO ESFORÇO (Deprioritizar)
├── Visual workflow builder
├── Integração ERP (QuickBooks/Omie)
├── Email integrado
└── Otimização de rota
```

---

## Roadmap Sugerido

### Fase 1 — Monetização (4-6 semanas) ✅ IMPLEMENTADA

> **Objetivo:** Permitir que tenants cobrem e recebam pela plataforma

| #   | Feature                              | Tabelas                     | Impacto                              | Status          |
| --- | ------------------------------------ | --------------------------- | ------------------------------------ | --------------- |
| 1   | Tabela de preços por tipo de serviço | `service_prices`            | Tenants configuram preços            | ❌              |
| 2   | Orçamento/Quote                      | `quotes`, `quote_items`     | Cliente vê custo antes de aprovar    | ✅              |
| 3   | Faturamento                          | `invoices`, `invoice_items` | Gerar fatura vinculada à OS          | ✅              |
| 4   | Pagamento online                     | `payments` + gateway        | Cliente paga por link                | ✅ (3 gateways) |
| 5   | Dashboard financeiro                 | Tela dedicada               | Receita, inadimplência, ticket médio | ✅              |
| 6   | Contas a Receber/Pagar               | `accounts_*`                | Fluxo financeiro completo            | ✅              |
| 7   | Inadimplentes                        | SQL customizado             | Gestão de cobrança                   | ✅              |
| 8   | Recibos automáticos                  | PDF auto-gerado             | Comprovantes ao confirmar pagamento  | ✅              |

### Fase 2 — Experiência do Cliente (3-4 semanas) ✅ IMPLEMENTADA

> **Objetivo:** Tornar o acompanhamento do processo transparente e self-service

| #   | Feature                       | Impacto                          | Status |
| --- | ----------------------------- | -------------------------------- | ------ |
| 6   | Link público de processo      | Cliente acompanha sem login      | ✅     |
| 7   | Barra de progresso %          | Visualiza andamento              | ✅     |
| 8   | Estimativa de prazo/custo     | Transparência antes de contratar | ✅     |
| 9   | Review automatizado           | Coleta qualidade pós-serviço     | ✅     |
| 10  | Notificação proativa WhatsApp | Status updates automáticos       | ✅     |

### Fase 3 — Parceiros (3-4 semanas) ✅ IMPLEMENTADA

> **Objetivo:** Criar experiência dedicada para profissionais de campo

| #   | Feature                             | Impacto                   | Status          |
| --- | ----------------------------------- | ------------------------- | --------------- |
| 11  | Tela "Meus Trabalhos" para parceiro | Dashboard de trabalhos    | ✅              |
| 12  | Aceitar/Recusar trabalho            | Workflow de atribuição    | ✅              |
| 13  | Tracking de ganhos                  | Parceiro vê quanto ganhou | ✅              |
| 14  | Checklist de execução               | Qualidade padronizada     | ✅ (step forms) |
| 15  | Check-in/check-out                  | Controle de presença      | ❌              |

### Fase 4 — Captação (3-4 semanas) ✅ IMPLEMENTADA

> **Objetivo:** Ajudar tenants a atrair e converter novos clientes

| #   | Feature                        | Impacto                      | Status                            |
| --- | ------------------------------ | ---------------------------- | --------------------------------- |
| 16  | CRM / Lead pipeline            | Funil de vendas visual       | ✅ crm-kanban + crm-leads         |
| 17  | Detalhe do lead                | Visão 360° do prospect       | ✅ crm-lead-detail                |
| 18  | Campanhas                      | Organizar ações de marketing | ✅ campaigns + campaign-dashboard |
| 19  | Conversão lead → cliente       | Fechar vendas                | ✅ via services/crm.ts            |
| 20  | Formulário público de captação | Leads entram automaticamente | ✅ /f/:slug + lead-forms.ts       |
| 21  | Follow-up automático           | Não perder leads             | ✅ getOverdueFollowUps()          |
| 22  | Time tracking                  | Produtividade do time        | ❌                                |

### Fase 5 — AI & Automação (3-4 semanas) ✅ IMPLEMENTADA

> **Objetivo:** Agentes de IA gerenciam atendimento e operações

| #   | Feature           | Impacto                              | Status |
| --- | ----------------- | ------------------------------------ | ------ |
| 23  | Agents CrudScreen | Configurar agentes de IA             | ✅     |
| 24  | Agent States      | Controlar estados dos agentes        | ✅     |
| 25  | Playbooks         | Manuais de comportamento do agente   | ✅     |
| 26  | Handoff Policies  | Transferência bot → humano por canal | ✅     |
| 27  | Channel Bindings  | Qual agente atende qual canal        | ✅     |
| 28  | Agent Packs       | Deploy 1-click de agentes            | ✅     |

### Fase 6 — Plataforma SaaS (2-3 semanas) ✅ IMPLEMENTADA

> **Objetivo:** Monetizar a plataforma e escalar como SaaS

| #   | Feature             | Impacto                         | Status |
| --- | ------------------- | ------------------------------- | ------ |
| 29  | SaaS Billing        | Planos tier + PIX recorrente    | ✅     |
| 30  | SaaS Dashboard      | Super-admin vê todos os tenants | ✅     |
| 31  | Multi-domain auth   | Tenant por domínio automático   | ✅     |
| 32  | Tenant branding     | Auth screens personalizadas     | ✅     |
| 33  | Bank reconciliation | Conciliação bancária OFX        | ✅     |
| 34  | GlobalSearch        | Busca de telas no header        | ✅     |

### Fase 7 — Integrações BR + Produtividade + E-commerce (4-6 semanas) ✅ MAIORIA IMPLEMENTADA

> **Objetivo:** Conectar com ecossistema brasileiro, controlar tempo e expandir para e-commerce

| #   | Feature                      | Impacto                             | Status                              |
| --- | ---------------------------- | ----------------------------------- | ----------------------------------- |
| 35  | Pagamento online (gateway)   | 3 gateways via IPaymentGateway      | ✅ Asaas + MercadoPago + Mock       |
| 36  | NFSe automática              | Compliance fiscal via ENotas        | ❌                                  |
| 37  | Time tracking                | time_entries + timer + timesheets   | ❌                                  |
| 38  | Formulários públicos         | `/f/:slug` → gera lead              | ✅ lead-forms.ts + admin CrudScreen |
| 39  | Follow-up automático         | Automação para leads frios          | ✅ getOverdueFollowUps()            |
| 40  | API pública REST             | Permitir integrações de terceiros   | ❌                                  |
| 41  | Webhook outgoing             | Eventos para sistemas externos      | ❌                                  |
| 42  | Marketplace / PDV            | Catálogo + shopping cart + checkout | ✅                                  |
| 43  | Produtos & Composições (BOM) | Catálogo + custos + categorias      | ✅                                  |
| 44  | Estoque                      | Movimentações + locais + alertas    | ✅                                  |
| 45  | Compras                      | Pedidos de compra + fornecedores    | ✅                                  |
| 46  | Entregas                     | Expedição + rastreamento + rotas    | ✅                                  |
| 47  | Contratos/SLA                | Renovação + SLA tracking            | ✅                                  |
| 48  | Content Pages                | Blog + landing pages + CMS          | ✅                                  |
| 49  | Channel Partners             | Referral codes + comissões          | ✅                                  |
| 50  | Marketing AI                 | IA para campanhas e conteúdo        | ✅                                  |

### Fase 8 — Avançado (6-8 semanas)

> **Objetivo:** Features de poder para tenants maduros

| #   | Feature                 | Impacto                         |
| --- | ----------------------- | ------------------------------- |
| 51  | Tabela de emolumentos   | Cálculo automático (módulo ONR) |
| 52  | e-Notariado/CENSEC      | Buscas/validações (módulo ONR)  |
| 53  | Integração contábil     | Omie/Bling/Conta Azul           |
| 54  | Visual workflow builder | Editor drag-drop de workflows   |
| 55  | Export CSV/PDF          | Exportar dados de CrudScreens   |
| 56  | Dispatch com mapa       | Geolocalização de parceiros     |
| 57  | Email integrado         | Gmail/Outlook dentro do app     |

---

## Análise Competitiva Resumida

### Posicionamento da Radul Platform

```
                    ESPECIALIZADO (vertical)
                          │
                          │   Radul Platform ★
                          │   (qualquer empresa de serviços,
                          │    com 6 template packs + 2 agent packs,
                          │    CRM, AI agents, SaaS billing,
                          │    multi-domain auth, 72 CrudScreens)
                          │
                          │   Clio / Lawcus / Smokeball
                          │   (legal practice)
                          │
INTERNO ──────────────────┼────────────────── MARKETPLACE
(B2B SaaS)                │                   (B2C)
                          │
        Pipefy / Monday   │   ServiceTitan / Housecall Pro
        (genérico/BPM)    │   (field service)
                          │
                          │   Jobber
                          │   (home service)
                          │
                    GENERALISTA (horizontal)
```

### Diferencial Competitivo da Radul Platform (atualizado)

1. **Plataforma configurável** — Template Packs + Agent Packs transformam o motor genérico em solução vertical em 15 minutos
2. **Módulos opt-in** — 13 módulos ativáveis. Tenant vê só o que precisa. Complexidade = proporcional.
3. **CRM completo** — Pipeline kanban de leads, campanhas, dashboard, conversão lead→cliente, lead scoring, follow-up
4. **Financeiro completo** — Faturas, pagamentos, contas AR/AP, inadimplentes, recibos, dashboard, conciliação bancária OFX, DRE, export contábil
5. **AI Agents avançado** — 9 telas admin, playbooks, handoff, channel bindings, 2 agent packs (nenhum concorrente BR tem isso)
6. **Integrações BR nativas** — Gov.br, BrasilAPI, ONR/SREI, ICP-Brasil — nenhum concorrente internacional tem isso
7. **Workflow engine completo** — Process engine com FSM, tasks automáticas, deadlines, kanban
8. **Assinatura digital dual** — Documenso (eletrônica) + ICP-Brasil (qualificada) em uma só plataforma
9. **Portal público** — Cliente acompanha processo sem login via `/p/:token` + orçamento via `/q/:token`
10. **72 telas CrudScreen** — Usuário aprende uma vez e sabe usar tudo. Zero treinamento por feature nova.
11. **SaaS Billing nativo** — Planos tier, PIX recorrente, dashboard super-admin
12. **Multi-tenant from day 1** — Multi-domain auth, tenant branding, auto-link de usuários por domínio
13. **Custo self-hosted** — ~R$380/mês para funcionalidades equivalentes a R$3.000-10.000/mês em SaaS
14. **3 Payment Gateways** — Asaas + MercadoPago + Mock via interface `IPaymentGateway`
15. **Marketplace/E-commerce** — PDV, produtos, composições/BOM, estoque, compras, entregas, shopping cart, checkout
16. **Contratos/SLA** — Gestão de contratos com renovação automática e SLA tracking
17. **Content Pages (CMS)** — Blog, landing pages, editor de conteúdo para tenants
18. **Channel Partners** — Referral codes, comissões, tracking de indicações

### Risco Competitivo

- **Pipefy** poderia configurar um "Pipe" para qualquer vertical — mas sem integrações BR (Gov.br, ONR, PIX nativo, BrasilAPI)
- **ERPs brasileiros** (Omie, Bling) — focam em contabilidade/fiscal, não em workflow e CRM
- **Ferramentas separadas** (Pipedrive + Pipefy + Conta Azul) — caro e fragmentado. Radul substitui.

---

## Conclusão

O SOS Escritura evoluiu de um sistema com fundação operacional sólida para uma **plataforma de operações madura e abrangente** — agora rebatizada de **Radul Platform**. Desde a auditoria inicial (Jul 2025), foram implementados:

- 💰 **Módulo Financeiro completo** — faturas, pagamentos, contas a receber/pagar, inadimplentes, recibos automáticos, dashboard, conciliação bancária OFX, DRE, export contábil
- 📊 **CRM completo** — pipeline kanban de leads, detalhe do lead, campanhas com dashboard, conversão lead→cliente, lead scoring, follow-up automático
- 📊 **Orçamentos com aprovação online** — quotes + link público `/q/:token` + multi-opção (pacotes) + quote templates
- 📱 **Portal público self-service** — timeline `/p/:token`, review, estimativa prazo/custo
- 🤝 **Portal de Parceiros** — Meus Trabalhos, aceitar/recusar, ganhos, comissões, PIX, disponibilidade, folgas, channel partners
- 🤖 **AI Agents completo** — 9 telas admin, playbooks, handoff, channel bindings, 2 agent packs com deploy 1-click
- 💳 **SaaS Billing** — 5 planos tier (free→enterprise), PIX recorrente mensal, dashboard super-admin
- 🌐 **Multi-domain Auth** — resolução de tenant por domínio, auto-link, tenant branding customizado
- 🧩 **Sistema de Módulos** — 13 módulos opt-in, navegação modular automática
- 📋 **6 Template Packs + 2 Agent Packs** — Genérico, Advocacia, Cobrança, Cartório (integração), Padrão, SOS Escritura + Agent Genérico + Agent SOS Escritura
- 🏦 **Conciliação Bancária** — Import OFX, matching automático, reconciliação
- 🔍 **GlobalSearch** — Busca global de telas e funcionalidades no header
- 🔧 **CrudScreen robusto** — 72 telas, 15+ field types, validação, máscaras, seções, paginação
- 💳 **Payment Gateways** — 3 gateways (Asaas + MercadoPago + Mock) via interface `IPaymentGateway`
- 🛒 **Marketplace/E-commerce** — PDV, produtos, composições/BOM, estoque, compras, entregas, shopping cart, checkout
- 📝 **Contratos/SLA** — Gestão de contratos com renovação + SLA tracking
- 📄 **Content Pages (CMS)** — Blog, landing pages, editor de conteúdo
- 🤝 **Channel Partners** — Referral codes, comissões, tracking de indicações
- 📊 **DRE + Export Contábil** — Demonstração de resultado + export para contabilidade
- 📣 **Marketing AI** — IA para geração de conteúdo e campanhas
- 📝 **Formulários Públicos de Captação** — `/f/:slug` com admin CrudScreen + lead scoring

**Gaps restantes por prioridade:**

| Prioridade | Gap                     | Impacto                                  |
| ---------- | ----------------------- | ---------------------------------------- |
| 🔴 ALTA    | Time tracking           | Controle de produtividade e billing/hora |
| 🟡 MÉDIA   | NFSe automática         | Compliance fiscal brasileiro             |
| 🟡 MÉDIA   | Integração contábil     | Omie/Bling/Conta Azul                    |
| 🟡 MÉDIA   | API pública REST        | Permitir integrações de terceiros        |
| 🟢 BAIXA   | Visual workflow builder | Power users                              |
| 🟢 BAIXA   | Dispatch com mapa       | Field service com geolocalização         |
| 🟢 BAIXA   | Email integrado         | Gmail/Outlook dentro do app              |
| 🟢 BAIXA   | Export CSV/PDF          | Exportar dados de CrudScreens            |

**O maior ROI agora está em:** time tracking (produtividade + billing por hora), NFSe automática (compliance fiscal), e API pública REST (permitir integrações de terceiros).

---

_Estudo gerado em Julho 2025, atualizado em Fevereiro 2026 • Baseado em auditoria completa do codebase (169 telas, 114 páginas admin, 72 CrudScreens, 13 módulos, 6 template packs + 2 agent packs, 76 services, 40 migrations, 10 hooks, 3 payment gateways, 22+ integrações) + análise de 12 plataformas concorrentes_
