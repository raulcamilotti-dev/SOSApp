# Plano Go-To-Market — Radul Platform

_Fevereiro 2026 • Baseado em revisão completa do produto (98 telas, 49 CrudScreens, 8 módulos, 5 template packs) e estudo de mercado (12 concorrentes, 20 gaps analisados)_

---

## Revisão Estratégica: Estado Atual

### O que já temos (e que 99% dos concorrentes BR NÃO têm)

| Capacidade                                            | Status       | Diferencial vs Mercado                     |
| ----------------------------------------------------- | ------------ | ------------------------------------------ |
| CrudScreen genérico (49 telas)                        | ✅ Maduro    | Nenhum concorrente BR tem componente assim |
| Workflow Engine com FSM                               | ✅ Maduro    | Pipefy tem, mas sem integrações BR         |
| CRM + Kanban de Leads                                 | ✅ Completo  | Concorrentes verticais não têm CRM         |
| Financeiro completo (AR/AP, faturas, conciliação OFX) | ✅ Completo  | Clio tem, Pipefy não                       |
| Portal público (/p/:token + /q/:token)                | ✅ Completo  | Raro em plataformas BR                     |
| AI Agents (9 telas + packs)                           | ✅ Completo  | NENHUM concorrente BR tem                  |
| Template Packs (5 verticais)                          | ✅ Completo  | Diferencial único — onboarding 15min       |
| SaaS Billing com PIX recorrente                       | ✅ Completo  | Auto-suficiente para cobrar                |
| Multi-domain auth + branding                          | ✅ Completo  | Cada tenant tem subdomínio próprio         |
| Assinatura digital (Documenso)                        | ✅ Integrado | ICP-Brasil + eletrônica                    |
| Integrações BR (Gov.br, BrasilAPI, ONR)               | ✅ Nativas   | Exclusivo — nenhum SaaS estrangeiro tem    |
| BI embeddado (Metabase)                               | ✅ Integrado | Concorrentes cobram extra por BI           |

### Gaps restantes (NÃO bloqueiam lançamento)

| Gap                               | Impacto                 | Workaround atual                             |
| --------------------------------- | ----------------------- | -------------------------------------------- |
| Payment gateway (MercadoPago)     | Pagamento online direto | PIX manual funciona — gateway é conveniência |
| Time tracking                     | Billing por hora        | Planilha do parceiro — não bloqueia vendas   |
| NFSe automática                   | Compliance fiscal       | Tenant emite NF manual — comum no BR         |
| Formulários públicos (/f/:formId) | Captação automática     | Lead manual + WhatsApp funciona              |

**Conclusão: O produto está pronto para ir ao mercado.** Os gaps são conveniências, não bloqueadores.

---

## Correção de Posicionamento: Quem é o Cliente

### O que NÃO somos

A Radul **não é software para cartórios**. Cartórios são instituições reguladas que podem ser acessadas como _integrações_ (protocolar documentos, emitir certidões) por qualquer empresa que precise, dentro do seu fluxo de trabalho — assim como se emite uma NF ou se consulta um CEP.

### Quem é nosso cliente

O cliente da Radul é **qualquer empresa ou profissional que presta serviços, vende produtos, ou precisa organizar suas operações**:

| Perfil de Cliente               | Exemplos de Empresas                                                    | O que usam na Radul                                                             |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Prestadores de serviço**      | Manutenção, limpeza, reformas, instalações, assistência técnica         | Workflow + Kanban + Portal cliente + Orçamentos + Financeiro                    |
| **Consultores & Agências**      | Consultorias empresariais, agências de marketing, escritórios de design | CRM + Projetos (workflow) + Time tracking + Financeiro + Portal cliente         |
| **Escritórios de Advocacia**    | Advogados autônomos, escritórios de advocacia, jurídico corporativo     | Workflow jurídico + Documentos + Prazos + CRM + Financeiro                      |
| **Vendedores de Produtos**      | E-commerce pequeno, distribuidores, representantes comerciais           | ERP simples (estoque/pedidos via CrudScreen) + Financeiro + CRM                 |
| **Gestores de Atividades**      | Empresas de projeto, PMOs, coordenadores de equipes                     | Kanban + Workflow + Tarefas + Dashboard                                         |
| **Empresas de Cobrança**        | Assessorias de cobrança, departamentos financeiros                      | Workflow de cobrança + Inadimplentes + Financeiro + Portal                      |
| **Despachantes**                | Despachantes imobiliários, documentais, Detran                          | Workflow + Prazos + Portal cliente + Integração ONR (quando precisa protocolar) |
| **Contabilidades**              | Escritórios contábeis, departamentos fiscais                            | Workflow de entregas + Clientes + Prazos + Documentos                           |
| **Imobiliárias & Construtoras** | Imobiliárias, incorporadoras, construtoras                              | CRM + Workflow + Parceiros + Financeiro + Integração ONR (para registros)       |

### Sobre a funcionalidade de Cartório/ONR

A integração com cartórios (ONR/SREI, protocolos, certidões) é um **módulo opcional** — `onr_cartorio` — que qualquer empresa pode ativar quando precisa protocolar algo em cartório. Exemplos:

- Uma **imobiliária** precisa registrar uma escritura → ativa módulo ONR
- Um **despachante** precisa protocolar habilitação → ativa módulo ONR
- Uma **advocacia** precisa pedir certidão → ativa módulo ONR
- Uma **construtora** precisa averbar obra → ativa módulo ONR

**Cartório é integração, não público-alvo.**

---

## Posicionamento de Mercado

### Declaração de Posicionamento

> **Para empresas brasileiras** que precisam organizar operações, atender clientes e crescer, **a Radul** é a **plataforma de gestão configurável** que substitui 5+ ferramentas com uma só — CRM, financeiro, workflow, portal do cliente e IA, pronta para seu negócio em 15 minutos. Diferente do Pipefy (genérico e caro), ERPs tradicionais (complexos) ou ferramentas separadas (custosas e desconectadas), **a Radul se adapta ao seu negócio, não o contrário**.

### Taglines por Canal

| Canal          | Tagline                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| **Principal**  | "Sua empresa organizada em 15 minutos"                                     |
| **Google Ads** | "CRM + Financeiro + Workflow em uma só plataforma — teste grátis"          |
| **LinkedIn**   | "A plataforma que substitui 5 ferramentas para sua empresa"                |
| **Instagram**  | "Chega de planilha. Chega de WhatsApp perdido. Organize tudo em um lugar." |
| **WhatsApp**   | "Quer testar grátis? 20 clientes, sem cartão. Começa em 15 minutos."       |

### Proposta de Valor por Persona

| Persona                         | Dor principal                                       | Proposta Radul                                                     |
| ------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| **Prestador de serviço**        | Pedidos no WhatsApp, sem controle, sem financeiro   | Workflow visual + financeiro + portal do cliente em uma plataforma |
| **Consultor / dono de agência** | Projetos em 3 ferramentas, sem visão unificada      | CRM + workflow de projetos + orçamentos + IA em um lugar           |
| **Advogado gestor**             | Clio caro ($89/user), SAJ só contencioso            | Financeiro + workflow + CRM + IA por R$99/mês total                |
| **Vendedor / representante**    | Controle de pedidos em planilha, sem pipeline       | ERP simples + CRM + financeiro + orçamentos                        |
| **Gestor de equipe / PMO**      | Tarefas espalhadas, sem dashboard, sem visibilidade | Kanban + workflows + BI + dashboard financeiro                     |
| **Empresa de cobrança**         | Inadimplência sem controle, processos manuais       | Workflow de cobrança automático + financeiro + portal cliente      |
| **Despachante / imobiliária**   | Processos em caderno, sem prazo, sem transparência  | Kanban + portal cliente + ONR (quando precisa protocolar)          |

---

## Segmentação & Priorização de Verticais

### Critérios de priorização

| Critério                                  | Peso |
| ----------------------------------------- | ---- |
| Dor evidente (usa planilha/WhatsApp hoje) | 5x   |
| Disposição a pagar por software           | 4x   |
| Fit com template pack existente           | 4x   |
| Volume de empresas no BR                  | 3x   |
| Ciclo de venda curto (decide sozinho)     | 3x   |
| Match com funcionalidades atuais          | 5x   |

### Ranking de verticais (prioridade de GTM)

| #   | Vertical                        | Score | Template Pack       | Plano alvo     | Ticket médio  |
| --- | ------------------------------- | ----- | ------------------- | -------------- | ------------- |
| 1   | **Prestadores de Serviço**      | 95    | ✅ genérico         | Starter-Growth | R$99-249/mês  |
| 2   | **Consultorias & Agências**     | 90    | ✅ genérico         | Starter-Growth | R$99-249/mês  |
| 3   | **Escritórios de Advocacia**    | 88    | ✅ advocacia        | Starter-Growth | R$99-249/mês  |
| 4   | **Vendedores / Representantes** | 82    | ✅ genérico         | Starter        | R$99/mês      |
| 5   | **Empresas de Cobrança**        | 80    | ✅ cobranca         | Growth-Scale   | R$249-499/mês |
| 6   | **Despachantes & Imobiliárias** | 75    | ⚠️ genérico + ONR   | Starter-Growth | R$99-249/mês  |
| 7   | **Contabilidades**              | 70    | ⚠️ genérico (to-do) | Starter-Growth | R$99-249/mês  |

### Fase 1 do GTM: Foco amplo em empresas de serviço

**Mês 1-2:** Prestadores de serviço + Consultores + Advocacia (mensagem ampla + packs prontos)
**Mês 3-4:** Expandir para vendedores, cobrança, despachantes
**Mês 5+:** Volume em todas as verticais + upsell + packs específicos sob demanda

---

## Pricing Estratégico para Lançamento

### Planos atuais (confirmados)

| Plano          | Clientes  | Preço        | Alvo                       |
| -------------- | --------- | ------------ | -------------------------- |
| **Free**       | Até 20    | R$ 0         | Validação / trial eterno   |
| **Starter**    | Até 100   | R$99/mês     | Pequenas empresas          |
| **Growth**     | Até 500   | R$249/mês    | Empresas em crescimento    |
| **Scale**      | Até 2.000 | R$499/mês    | Operações de escala        |
| **Enterprise** | Ilimitado | Sob consulta | Redes / franquias / grupos |

### Estratégia de preço para lançamento

1. **Trial generoso:** Plano Free com 20 clientes — sem cartão, sem prazo. Permite que o prospect configure e use antes de pagar.
2. **Desconto early-adopter:** Primeiros 50 tenants pagantes ganham 30% off no primeiro ano (R$69, R$174, R$349).
3. **Onboarding grátis:** Para Growth+ oferecemos 30min de call de configuração.
4. **Garantia de 30 dias:** Não gostou? Cancelamento sem burocracia.

### ROI para o cliente (pitch)

| Ferramenta substituída            | Custo individual/mês  | Radul Growth  |
| --------------------------------- | --------------------- | ------------- |
| CRM (Pipedrive/RD Station)        | R$200-500             | Incluído      |
| Workflow (Pipefy/Trello)          | R$150-500             | Incluído      |
| Financeiro (Conta Azul/ZeroPaper) | R$100-300             | Incluído      |
| Portal do cliente (custom)        | R$500-2000            | Incluído      |
| Assinatura digital (DocuSign)     | R$150-400             | Incluído      |
| BI/Relatórios (Metabase/Looker)   | R$200-500             | Incluído      |
| **TOTAL ferramentas separadas**   | **R$1.300-4.200/mês** |               |
| **Radul Growth**                  |                       | **R$249/mês** |

**Economia: 80-94%** vs stack de ferramentas separadas.

---

## Canais de Aquisição

### 1. Google Ads (Performance — conversão direta)

**Budget sugerido:** R$3.000-5.000/mês (fase inicial)

**Estratégia:**

- **Campanhas de busca** por palavras-chave de intenção alta
- **Landing pages** por perfil (prestador, consultor, advogado)
- **Extensões de sitelink** para Free trial

**Keywords prioritárias:**
| Perfil | Keywords | CPC estimado |
|---|---|---|
| Prestador de serviço | "software gestão serviços", "sistema ordem de serviço", "gestão de OS", "controle de serviços" | R$3-8 |
| Consultoria/Agência | "software gestão projetos", "plataforma gestão consultoria", "CRM para agência" | R$5-10 |
| Advocacia | "software gestão advocacia", "sistema escritório advocacia", "gestão processos jurídicos" | R$5-12 |
| Geral | "plataforma gestão empresa", "ERP simples para pequena empresa", "CRM + financeiro" | R$4-10 |

**Meta:** CPA (custo por aquisição) < R$200 para trial, < R$500 para conversão paga.

### 2. LinkedIn (B2B awareness + autoridade)

**Budget sugerido:** R$1.500-3.000/mês

**Estratégia:**

- **Posts orgânicos 3x/semana** — dicas de gestão, cases, comparativos
- **Ads de topo de funil** — artigos de valor ("5 sinais que sua empresa precisa de um sistema")
- **Ads de fundo de funil** — demo/trial CTA com retargeting
- **Perfil do Raul** como thought leader em gestão empresarial

**Segmentação:**

- Cargo: Sócio, Diretor, Gerente, Proprietário, Consultor
- Setor: Serviços, Jurídico, Tecnologia, Consultoria, Comércio
- Tamanho: 1-200 funcionários
- Localização: Brasil

### 3. Instagram/Facebook (Visual + comunidade)

**Budget sugerido:** R$2.000-4.000/mês

**Estratégia:**

- **Reels de 30-60s** — Demo rápida de funcionalidades ("Veja como criar um orçamento em 30 segundos")
- **Carrosséis** — Antes vs Depois, comparativos de ferramentas, checklists
- **Stories** — Bastidores do produto, novas features, testimonials
- **Ads** — Retargeting de visitantes do site + lookalike de leads existentes

**Conteúdo por semana:**
| Dia | Tipo | Exemplo |
|---|---|---|
| Seg | Reel demo | "Portal do cliente em 1 minuto" |
| Qua | Carrossel educativo | "7 funcionalidades que toda empresa precisa" |
| Sex | Story interativo | Enquete "Qual seu maior problema de gestão?" |
| Sáb | Post de resultado | "Case: Reduziu 60% do tempo administrativo" |

### 4. WhatsApp (Outreach direto + referral)

**Budget:** R$0 (orgânico) + R$500/mês (API)

**Estratégia:**

- **Lista de broadcast** para contatos profissionais (consultores, advogados, prestadores)
- **Mensagem de entrada:** "Oi [nome]! Estamos lançando uma plataforma de gestão para empresas de serviço. Posso te mostrar em 10 minutos? É grátis pra testar."
- **Programa de indicação:** Cliente indica → ganha 1 mês grátis (ambos)
- **Bot de qualificação:** WhatsApp bot que qualifica lead e agenda demo

### 5. Conteúdo Orgânico (SEO + autoridade)

**Budget:** R$0 (tempo interno)

**Estratégia:**

- **Blog** em radul.com.br/blog (artigos SEO)
- **YouTube** — Tutoriais de uso, demonstrações, webinars gravados
- **Webinars mensais** — "Como organizar sua empresa com tecnologia" (gera leads)

**Calendário editorial (mês 1):**
| Semana | Blog (SEO) | YouTube | Webinar |
|---|---|---|---|
| 1 | "Software para gestão de serviços: Guia completo 2026" | "Tour completo: Radul para prestadores" | — |
| 2 | "CRM para empresas de serviço: Por que usar" | "Como o CRM Radul funciona" | — |
| 3 | "Gestão financeira para pequenas empresas" | "Faturas, contas e inadimplentes" | — |
| 4 | "Comparativo: Radul vs Pipefy vs ferramentas separadas" | "Onboarding em 15 minutos" | Webinar: "Gestão moderna para empresas de serviço" |

### 6. Parcerias Estratégicas

**Estratégia:**

- **Contadores como channel partners:** Usam Radul para seus clientes e recomendam
- **Consultores de gestão:** Recomendam Radul como ferramenta para seus clientes organizarem operações
- **Comunidades empresariais:** Sebrae, CDLs, associações comerciais locais
- **Influencers de negócios:** Empreendedores que fazem conteúdo no Instagram/YouTube

---

## Funil de Conversão

```
TOPO (Awareness)                          OBJETIVO
────────────────                          ────────
Google Ads / LinkedIn / Instagram         Visitou landing page
Blog SEO / YouTube
Webinar / Eventos
              │
              ▼
MEIO (Consideração)                       OBJETIVO
──────────────────                        ────────
Landing page → CTA "Teste Grátis"        Criou conta Free
Retargeting ads
Email nurturing (5-email sequence)
WhatsApp outreach
              │
              ▼
FUNDO (Decisão)                           OBJETIVO
────────────────                          ────────
Onboarding wizard (template pack)         Configurou o sistema
Email de onboarding (dias 1, 3, 7, 14)   Usou features core
Call de onboarding (Growth+)
              │
              ▼
CONVERSÃO                                 OBJETIVO
──────────                                ────────
In-app upgrade prompt                     Pagou Starter/Growth+
Email de fim de trial (dia 30)
WhatsApp follow-up
              │
              ▼
EXPANSÃO                                  OBJETIVO
─────────                                 ────────
Upsell (mais clientes → tier acima)       Aumentou plano
Referral program (1 mês grátis)           Indicou outros
Cross-sell módulos                        Ativou mais módulos
```

---

## Metas para os Primeiros 90 Dias

### Mês 1 — Lançamento Suave (Soft Launch)

| Meta                     | Número      | Como medir             |
| ------------------------ | ----------- | ---------------------- |
| Tenants criados (Free)   | 30          | Dashboard SaaS         |
| Tenants pagantes         | 5           | Dashboard SaaS         |
| MRR (receita recorrente) | R$500-1.000 | Contas a receber Radul |
| Leads no CRM             | 100         | CRM Radul              |
| Visitantes landing page  | 2.000       | Plausible analytics    |

**Foco:** Outreach direto (WhatsApp + LinkedIn), Google Ads com keywords de intenção alta, 3-4 posts/semana no Instagram.

### Mês 2 — Aceleração

| Meta                    | Número         |
| ----------------------- | -------------- |
| Tenants criados (Free)  | 80 acumulados  |
| Tenants pagantes        | 15 acumulados  |
| MRR                     | R$2.000-3.500  |
| Leads no CRM            | 300 acumulados |
| Visitantes landing page | 5.000/mês      |

**Foco:** Escalar Google Ads, iniciar Instagram Ads, primeiro webinar, blog posts semanais, programa de indicação.

### Mês 3 — Validação

| Meta                   | Número         |
| ---------------------- | -------------- |
| Tenants criados (Free) | 150 acumulados |
| Tenants pagantes       | 30 acumulados  |
| MRR                    | R$5.000-8.000  |
| Leads no CRM           | 600 acumulados |
| Churn rate             | <10% mensal    |
| NPS                    | >40            |

**Foco:** Refinar canais com melhor ROI, case studies de early adopters, criar packs sob demanda para verticais que pedirem.

### Breakeven projetado

- **Custo fixo infra:** ~R$380/mês (10 tenants) → ~R$800/mês (50 tenants)
- **Custo ads:** R$7.000-12.000/mês
- **Breakeven:** ~30 tenants pagantes no Starter (R$99) = R$2.970/mês + 10 no Growth (R$249) = R$2.490 → **Total: ~R$5.460/mês**
- **Meta breakeven: Mês 3**

---

## Campanhas Planejadas

### Campanha 1: "Gestão de Serviços Completa" (Google Ads)

- **Canal:** Google Ads (Search)
- **Perfil:** Prestadores de serviço em geral
- **Budget:** R$2.000/mês
- **Keywords:** "software gestão serviços", "sistema ordem de serviço", "controle de serviços", "gestão de OS", "ERP simples"
- **Landing:** app.radul.com.br (plataforma principal)
- **CTA:** "Teste grátis — sua empresa organizada em 15 minutos"
- **UTM:** utm_source=google, utm_medium=cpc, utm_campaign=gestao-servicos-2026

### Campanha 2: "Gestão para Advocacia" (Google Ads)

- **Canal:** Google Ads (Search)
- **Perfil:** Escritórios de Advocacia
- **Budget:** R$1.500/mês
- **Keywords:** "software gestão advocacia", "sistema escritório advocacia", "gestão processos jurídicos", "alternativa clio"
- **Landing:** advocacia.radul.com.br
- **CTA:** "Organize seu escritório em 15 minutos — teste grátis"
- **UTM:** utm_source=google, utm_medium=cpc, utm_campaign=advocacia-search-2026

### Campanha 3: "Substitua 5 Ferramentas" (LinkedIn)

- **Canal:** LinkedIn Ads
- **Perfil:** Donos de empresa, consultores, gerentes
- **Budget:** R$2.000/mês
- **Targeting:** Sócios/Diretores/Consultores em Serviços, Jurídico, Tecnologia, Consultoria (1-200 funcionários)
- **Copy:** "Sua empresa usa CRM, planilha, WhatsApp e mais 3 ferramentas? A Radul substitui tudo por R$99/mês."
- **CTA:** "Ver demonstração" → landing page com vídeo + CTA trial
- **UTM:** utm_source=linkedin, utm_medium=sponsored, utm_campaign=substitua-5-ferramentas-2026

### Campanha 4: "Chega de Planilha" (Instagram/Facebook)

- **Canal:** Instagram + Facebook Ads
- **Perfil:** Empreendedores, donos de pequenas empresas
- **Budget:** R$2.000/mês
- **Formato:** Reels (30s demo) + Carrosséis (5 funcionalidades em 5 slides)
- **Copy:** "Sua empresa ainda usa planilha pra controlar tudo? Tem um jeito melhor. Grátis pra testar."
- **Lookalike:** Baseado em visitantes do site + leads existentes
- **UTM:** utm_source=instagram, utm_medium=paid_social, utm_campaign=chega-de-planilha-2026

### Campanha 5: "Programa de Indicação" (WhatsApp + In-App)

- **Canal:** WhatsApp + E-mail
- **Perfil:** Todos os tenants existentes
- **Budget:** R$0 (custo = 1 mês grátis por indicação convertida)
- **Mecânica:** Tenant indica → amigo cria conta + paga 1º mês → ambos ganham 1 mês grátis
- **Copy WhatsApp:** "Oi [nome]! Cada amigo que você indicar pra Radul e que assinar um plano, você ganha 1 mês grátis. E ele também! Quer participar?"
- **UTM:** utm_source=whatsapp, utm_medium=referral, utm_campaign=indicacao-2026

### Campanha 6: "Webinar: Gestão Moderna para Empresas" (Orgânico + Email)

- **Canal:** Orgânico (YouTube Live + Email)
- **Perfil:** Todas
- **Budget:** R$500 (promoção do link)
- **Formato:** Webinar mensal de 40min com demonstração ao vivo
- **Captação:** Landing page de inscrição → email de lembrete → replay no YouTube
- **CTA:** "Crie sua conta grátis agora — tudo que mostrei funciona no plano Free"
- **UTM:** utm_source=youtube, utm_medium=webinar, utm_campaign=webinar-gestao-moderna-2026

### Campanha 7: "Conteúdo SEO — Blog" (Orgânico)

- **Canal:** Blog radul.com.br/blog
- **Perfil:** Todas (artigos por perfil de empresa)
- **Budget:** R$0 (tempo interno)
- **Artigos/mês:** 4 (1/semana)
- **Temas:** "Software para gestão de serviços", "ERP simples para pequena empresa", "CRM para prestadores", "Workflow: como automatizar processos"
- **Meta:** 500 visitas orgânicas/mês em 3 meses
- **UTM:** utm_source=blog, utm_medium=organic, utm_campaign=seo-content-2026

### Campanha 8: "Outreach WhatsApp — Prestadores de Serviço" (Outreach)

- **Canal:** WhatsApp (outreach direto)
- **Perfil:** Prestadores de serviço, consultores, pequenas empresas
- **Budget:** R$500/mês (WhatsApp API)
- **Lista:** 200 contatos de empresas de serviço (Google Maps, Instagram, indicações)
- **Mensagem:** "Olá [nome], sou o Raul da Radul. Criamos uma plataforma de gestão para empresas de serviço — CRM, financeiro, workflow e portal do cliente, tudo em um lugar. Posso te mostrar em 10 minutos? É gratuito."
- **UTM:** utm_source=whatsapp, utm_medium=outreach, utm_campaign=outreach-prestadores-2026

---

## Ferramentas & Infraestrutura de Marketing

### Tudo que já temos pronto na plataforma

| Necessidade              | Ferramenta na Radul                                      |
| ------------------------ | -------------------------------------------------------- |
| CRM para gerenciar leads | ✅ CRM módulo (crm-kanban + crm-leads + crm-lead-detail) |
| Campanhas com atribuição | ✅ Campaigns (UTM tracking + lead attribution)           |
| Dashboard de ROI         | ✅ Campaign Dashboard (KPIs, funnel, canal)              |
| Landing pages por perfil | ✅ Multi-domain ({slug}.radul.com.br) + tenant branding  |
| Email automático         | 🔜 Precisa integrar Resend/Sendinblue via N8N            |
| Analytics                | ✅ Plausible (self-hosted, LGPD-compliant)               |
| WhatsApp bot             | ✅ WhatsApp Business API (já integrado)                  |
| Assinatura trial → pago  | ✅ SaaS Billing (PIX recorrente in-app)                  |

### O que precisamos criar/configurar

| Item                                            | Esforço                   | Prioridade |
| ----------------------------------------------- | ------------------------- | ---------- |
| Landing page principal (radul.com.br)           | 1 dia                     | 🔴 Crítico |
| Landing pages por perfil                        | 2-3 dias                  | 🔴 Crítico |
| E-mail de welcome/onboarding (5-email sequence) | 1 dia (N8N workflow)      | 🟡 Alta    |
| Vídeo demo de 2 minutos                         | 1 dia (gravação + edição) | 🟡 Alta    |
| Conta Google Ads configurada                    | 2 horas                   | 🔴 Crítico |
| Conta LinkedIn Ads                              | 1 hora                    | 🟡 Alta    |
| Perfil Instagram @radul.tech                    | 1 hora                    | 🟡 Alta    |
| Blog setup (radul.com.br/blog)                  | 1 dia                     | 🟡 Média   |
| Pixel/conversão tracking                        | 2 horas                   | 🔴 Crítico |

---

## Orçamento Total Mensal (Fase Inicial)

| Canal                           | Budget/mês      | Leads esperados   | CPA esperado      |
| ------------------------------- | --------------- | ----------------- | ----------------- |
| Google Ads                      | R$3.500         | 50-80             | R$50-70           |
| LinkedIn Ads                    | R$2.000         | 20-30             | R$80-100          |
| Instagram/Facebook              | R$2.000         | 40-60             | R$40-50           |
| WhatsApp (API + outreach)       | R$500           | 30-50             | R$10-15           |
| Conteúdo (blog, vídeo, webinar) | R$500           | 20-30 (orgânico)  | R$15-25           |
| **TOTAL**                       | **R$8.500/mês** | **160-250 leads** | **R$40-60 médio** |

**Conversão esperada (lead → trial → pago):**

- Lead → Trial: 30-40%
- Trial → Pago: 15-25%
- **Lead → Pago: ~5-10%**
- **Custo por cliente pagante: R$400-1.200**
- **LTV estimado (12 meses, Growth): R$2.988**
- **LTV/CAC ratio: 2.5-7.5x** ✅

---

## Métricas Chave (KPIs)

### Dashboard Semanal

| Métrica        | Definição                 | Meta Mês 1 |
| -------------- | ------------------------- | ---------- |
| **Visitantes** | Visitas à landing page    | 2.000/mês  |
| **Leads**      | Cadastros no CRM          | 100/mês    |
| **Trials**     | Tenants Free criados      | 30/mês     |
| **Conversão**  | Trial → Pago              | 15%        |
| **MRR**        | Receita recorrente mensal | R$1.000    |
| **Churn**      | Cancelamentos/mês         | <10%       |
| **CAC**        | Custo de aquisição        | <R$500     |
| **NPS**        | Satisfação do cliente     | >40        |

---

## Timeline de Execução

### Semana 1 (Setup)

- [ ] Configurar Google Ads + pixel de conversão
- [ ] Criar landing page principal + landing por perfil
- [ ] Configurar Instagram @radul.tech
- [ ] Criar campanhas no CRM da Radul
- [ ] Gravar vídeo demo 2min

### Semana 2 (Lançamento)

- [ ] Ativar campanhas Google Ads (Serviços + Advocacia)
- [ ] Publicar primeiro vídeo no YouTube + Reel
- [ ] Iniciar outreach WhatsApp para prestadores (50 contatos)
- [ ] Publicar primeiro post LinkedIn
- [ ] Primeiro artigo do blog

### Semana 3 (Aceleração)

- [ ] Ativar Instagram/Facebook Ads
- [ ] Ativar LinkedIn Ads
- [ ] Segundo artigo do blog
- [ ] 3 Reels no Instagram
- [ ] Continuar outreach WhatsApp (100 contatos)

### Semana 4 (Otimização)

- [ ] Analisar métricas: CPA, CTR, taxa de conversão por canal
- [ ] Pausar keywords/ads com CPA alto
- [ ] Escalar criativos com melhor performance
- [ ] Primeiro webinar (Gestão Moderna para Empresas de Serviço)
- [ ] Ativar programa de indicação

---

_Documento vivo — atualizar semanalmente com resultados reais. O plano é iterativo: testar, medir, otimizar, escalar._
