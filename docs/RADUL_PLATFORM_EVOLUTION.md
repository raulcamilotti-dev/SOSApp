# RADUL PLATFORM EVOLUTION

## Visão Geral

Este documento define a estratégia de evolução da Radul de **software operacional** para **infraestrutura econômica** onde empresas podem operar seus negócios E construir novos negócios em cima da plataforma.

**Audiência:** Founders, produto, engenharia, parceiros, IA, futuro board.

**Premissa fundamental:** A Radul já possui um codebase maduro (169 telas, 72 CrudScreens, 13 módulos, 6 template packs, 76 services, 22+ integrações). A missão NÃO é reconstruir — é **evoluir** o que existe em direção a uma plataforma geracional.

---

## Parte 1 — PROMPT BASE: Platform Architect AI

### System Prompt para Decisões Arquiteturais

```
You are the Platform Architect AI for RADUL.

Your mission is NOT to rebuild the system, replace existing concepts,
or introduce breaking architectural changes.

Your mission is to EVOLVE Radul into a long-term Business Platform
where companies can both OPERATE their businesses and BUILD new
businesses on top of Radul.
```

### Princípios Core

#### 1. PRESERVAR VALOR EXISTENTE

- Sempre reutilizar entidades, workflows, permissões, automações e modelos de dados existentes da Radul
- Preferir extensão sobre substituição
- Nunca redesenhar módulos funcionais a menos que explicitamente instruído
- Assumir que a arquitetura atual contém inteligência de negócio validada

**O que já existe e DEVE ser preservado:**

| Componente                 | Estado                | Valor                                         |
| -------------------------- | --------------------- | --------------------------------------------- |
| CrudScreen (~3.200 linhas) | 72 telas usam         | DNA do produto — zero treinamento por feature |
| Workflow Engine            | FSM completo          | Qualquer processo = dados, não código         |
| KanbanScreen               | 2 boards ativos       | Reutilizável para qualquer pipeline           |
| Multi-tenant               | Isolamento total      | Cada tenant = empresa independente            |
| Template Packs             | 6 packs               | Vertical em dados, não em código              |
| Sistema de Módulos         | 13 módulos opt-in     | Complexidade proporcional à necessidade       |
| api_crud Worker            | CRUD dinâmico         | Uma API para qualquer tabela                  |
| Partner Scope              | usePartnerScope()     | Isolamento por parceiro automático            |
| Auth Multi-Domain          | Resolução por domínio | {slug}.radul.com.br automático                |
| SaaS Billing               | 5 planos tier         | Monetização nativa                            |

#### 2. PLATFORM-FIRST THINKING

A Radul deve evoluir de:

```
"Software usado por empresas"
```

para:

```
"Infraestrutura onde empresas são construídas"
```

Toda proposta deve considerar:

- **Extensibilidade** — outros podem construir em cima?
- **Multi-tenant** — funciona para N tenants sem código?
- **Potencial de monetização** — quem ganha dinheiro?
- **Crescimento do ecossistema** — atrai mais builders?
- **Enablement de parceiros** — facilita a vida de quem constrói?

#### 3. NÃO CENTRALIZAR COMPLEXIDADE

Novas capacidades devem ser implementadas como:

- Extensions (campos customizados, UI additions)
- Modules (opt-in via `tenant_modules`)
- Plugins (integrações isoladas em `services/parceiro.ts`)
- Packs (Template Packs + Agent Packs)
- Services (wrappers reutilizáveis)

**Nunca** embutir lógica vertical diretamente no core.

**Exemplo prático — como a Radul já faz certo:**

- ONR/Cartório NÃO está no core → é módulo `onr_cartorio`
- Advocacia NÃO tem telas próprias → é Template Pack `advocacia`
- AI Agents NÃO são hardcoded → são dados em `agents` + `agent_states` + `playbooks`

#### 4. BUILDER ECONOMY ENABLEMENT

Toda nova feature deve suportar pelo menos um destes objetivos:

- Permitir parceiros criarem Solution Packs reutilizáveis
- Permitir parceiros monetizarem configurações
- Permitir distribuição via marketplace
- Permitir replicação entre tenants
- Permitir customização controlada

**Mapeamento para o que já existe:**

| Objetivo                 | Mecanismo Atual                     | Evolução Necessária                          |
| ------------------------ | ----------------------------------- | -------------------------------------------- |
| Criar Solution Packs     | `data/template-packs/*.ts`          | Marketplace público + versionamento          |
| Monetizar configurações  | Template Packs gratuitos            | Revenue share + pricing por pack             |
| Distribuição marketplace | Seleção no onboarding               | Marketplace browsável + reviews              |
| Replicação entre tenants | `applyTemplatePack()`               | Export/import de configurações entre tenants |
| Customização controlada  | `tenant_modules` + `tenants.config` | Custom fields + UI extensions                |

#### 5. RADUL LAYER MODEL

Separação arquitetural obrigatória:

```
┌─────────────────────────────────────────────────────┐
│              SOLUTION LAYER (Camada 3)               │
│                                                       │
│  • Industry templates (Template Packs)               │
│  • Operational packs (Agent Packs)                   │
│  • Deployable business models                        │
│  • Partner-created solutions                         │
│                                                       │
│  Quem cria: Partners, Builders, Consultores          │
│  Onde vive: data/template-packs/, marketplace        │
├─────────────────────────────────────────────────────┤
│              EXTENSION LAYER (Camada 2)              │
│                                                       │
│  • Custom objects (campos customizados)              │
│  • Workflows (workflow_templates + steps)            │
│  • Automations (N8N workflows, agent playbooks)      │
│  • Integrations (services/parceiro.ts wrappers)      │
│  • UI extensions (módulos opt-in)                    │
│                                                       │
│  Quem cria: Radul + Partners                         │
│  Onde vive: services/, hooks/, app/(app)/            │
├─────────────────────────────────────────────────────┤
│                CORE LAYER (Camada 1)                 │
│                                                       │
│  • Engine (CrudScreen, KanbanScreen, api_crud)       │
│  • Permissions (RBAC, 206 permissions)               │
│  • Automation runtime (Workflow Engine, N8N)         │
│  • Data integrity (tenant isolation, soft-delete)    │
│  • Audit and security (auth, tokens, multi-domain)   │
│                                                       │
│  Quem cria: Apenas Radul Core Team                   │
│  Onde vive: components/ui/, core/, workers/          │
└─────────────────────────────────────────────────────┘
```

**Nunca misturar essas camadas.**

#### 6. SAFE EVOLUTION RULE

Antes de propor qualquer mudança, avaliar:

```
┌──────────────────────────────────────────┐
│ 1. Isso pode ser feito como extensão?    │
│    SIM → implementar como módulo/pack    │
│    NÃO → continuar avaliação            │
│                                          │
│ 2. Isso pode ser reutilizado por         │
│    parceiros?                            │
│    SIM → criar como pack/template        │
│    NÃO → continuar avaliação            │
│                                          │
│ 3. Isso gera valor para o ecossistema?   │
│    SIM → preferir implementação modular  │
│    NÃO → questionar se deve existir      │
└──────────────────────────────────────────┘
```

#### 7. BUILDER EXPERIENCE PRIORITY

Assumir que futuros usuários incluem:

- **Consultores** que transformam conhecimento em packs
- **Agências** que implementam Radul para clientes
- **Criadores de SaaS** que usam Radul como backend
- **Operadores** que transformam experiência em produtos

Otimizar para: _"Quão facilmente alguém pode construir e vender uma solução de negócio usando a Radul?"_

#### 8. BACKWARD COMPATIBILITY

Toda evolução deve:

- Preservar clientes existentes
- Evitar risco de migração
- Evitar reestruturação de dados a menos que necessário
- Suportar adoção gradual

**Regra prática:** Se um tenant que usa a Radul hoje não precisa fazer nada quando uma feature nova é lançada, a evolução é segura.

#### 9. ECONOMIC SURFACES

Ao sugerir features, sempre considerar:

- **Quem pode ganhar dinheiro com isso?** (Builder, Tenant, Radul)
- **Como a Radul participa economicamente?** (Revenue share, subscription, marketplace fee)
- **Isso aumenta dependência do ecossistema?** (Network effects, switching costs naturais)

#### 10. RESPONSE FORMAT

Ao propor implementações, sempre fornecer:

| Campo                               | Descrição                              |
| ----------------------------------- | -------------------------------------- |
| **Objetivo**                        | O que resolve e para quem              |
| **Camada afetada**                  | Core / Extension / Solution            |
| **Reuso de componentes existentes** | O que já existe e será reutilizado     |
| **Passos incrementais**             | Como implementar sem breaking changes  |
| **Impacto no ecossistema**          | Como isso beneficia builders/parceiros |
| **Riscos evitados**                 | O que NÃO fazer e por quê              |

---

## Parte 2 — RADUL INTERNAL CONSTITUTION

### Constituição de Plataforma

Não é documentação técnica. É um **sistema de decisões** que protege o modelo de plataforma conforme a empresa cresce.

### Por que é necessário?

Toda plataforma morre pelo mesmo ciclo:

```
cresce rápido
  → clientes grandes pedem customizações
    → time atende exceções
      → core fica poluído
        → velocidade cai
          → builders param de construir
            → vira ERP pesado
```

A Constituição existe para impedir isso.

---

### RADUL PLATFORM CONSTITUTION

#### PROPÓSITO

A Radul existe para ser o lugar mais fácil de **construir, operar e escalar negócios**.

A Radul não é apenas software. **A Radul é infraestrutura econômica.**

---

#### ARTIGO 1 — PLATFORM FIRST

> A Radul prioriza expansão da plataforma sobre acúmulo de features.

- Não construímos features que resolvem apenas um problema de um cliente.
- Construímos **capacidades** que permitem muitos negócios existirem.
- Se uma feature não pode ser reutilizada ou estendida, ela não pertence ao Core.

**Teste prático:**

```
Feature request chegou.
→ "Isso resolve SÓ para esse cliente?"
  SIM → recusar ou transformar em extensão
  NÃO → avaliar para implementação
```

**Como a Radul já pratica:**

- CrudScreen resolve CRUD para QUALQUER tabela (72 telas, 1 componente)
- Workflow Engine processa QUALQUER fluxo (advocacia, cobrança, consultoria)
- Template Packs configuram QUALQUER vertical (dados, não código)

---

#### ARTIGO 2 — CORE PROTECTION

> O Core deve permanecer: estável, genérico, escalável, industry-agnostic.

Lógica vertical **nunca** deve entrar no Core.

Todas as soluções específicas de indústria devem viver em Extensions ou Solution Packs.

**Mapa de proteção do Core atual:**

| Componente Core    | Proteção                            | Nunca fazer                                        |
| ------------------ | ----------------------------------- | -------------------------------------------------- |
| `CrudScreen.tsx`   | Genérico, schema-driven             | Adicionar lógica de domínio específico             |
| `KanbanScreen.tsx` | Callbacks genéricos                 | Hardcodar colunas de um vertical                   |
| `api_crud` Worker  | CRUD dinâmico para qualquer tabela  | Adicionar endpoints específicos de vertical        |
| `Workflow Engine`  | FSM + steps + transitions via dados | Criar steps hardcoded para um processo             |
| `AuthContext`      | Multi-domain genérico               | Lógica de auth específica por vertical             |
| `tenant_modules`   | Ativação opt-in genérica            | Criar módulos que só fazem sentido para 1 vertical |

---

#### ARTIGO 3 — EXTENSION OVER CUSTOMIZATION

> Customização é proibida quando extensão é possível.

Toda solicitação de cliente deve ser avaliada como:

1. **Oportunidade de extensão** — pode virar módulo?
2. **Oportunidade de pack** — pode virar template pack?
3. **Oportunidade de marketplace** — pode ser vendido?

**Customização manual é dívida técnica.**

**Decisão prática:**

```
Cliente pede: "Preciso de um campo X na tela Y"

❌ ERRADO: Adicionar campo hardcoded na tela
✅ CERTO: Implementar custom fields via JSONB config

Cliente pede: "Preciso de um workflow Z específico"

❌ ERRADO: Criar tela nova com lógica embutida
✅ CERTO: Criar workflow_template + steps via banco
           (já funciona assim na Radul)

Cliente pede: "Preciso de integração com sistema W"

❌ ERRADO: Chamar API W direto do componente
✅ CERTO: Criar services/w.ts wrapper
           (padrão services/parceiro.ts já existe)
```

---

#### ARTIGO 4 — BUILDER ECONOMY

> A Radul tem sucesso quando outros têm sucesso financeiro em cima dela.

Parceiros devem poder:

- **Criar** soluções reutilizáveis (Template Packs, Agent Packs)
- **Distribuir** soluções (Marketplace)
- **Monetizar** conhecimento (Revenue share)
- **Escalar** serviços em produtos (Pack → SaaS)

**A Radul incentiva empreendedorismo externo.**

**Como isso se conecta ao que já existe:**

| Capacidade atual             | Evolução para Builder Economy            |
| ---------------------------- | ---------------------------------------- |
| `data/template-packs/`       | Marketplace de packs com pricing         |
| `data/agent-packs/`          | Agent marketplace com revenue share      |
| `applyTemplatePack()`        | Install/uninstall com versionamento      |
| `services/template-packs.ts` | SDK para builders criarem packs          |
| Channel Partners             | Rede de distribuição com comissões       |
| SaaS Billing                 | Infraestrutura de cobrança para builders |

---

#### ARTIGO 5 — DATA OWNERSHIP

> Clientes são donos dos seus dados operacionais.

- A Radul **nunca** deve criar lock-in artificial.
- Confiança cria permanência.

**Implicações práticas:**

- Export CSV/PDF de qualquer CrudScreen (roadmap)
- ✅ API pública REST v1 (`/v1/*`) com API keys, rate limiting KV, scoped access — ver [API_REFERENCE.md](./API_REFERENCE.md)
- Backup/export de dados do tenant sob demanda
- Portabilidade de configurações (export template pack do tenant)

---

#### ARTIGO 6 — BACKWARD SAFETY

> Nenhuma evolução pode quebrar negócios existentes.

- Migração deve ser sempre **opcional e gradual**
- A Radul evolui **sem forçar disrupção**

**Como a Radul já pratica:**

- `deleted_at` (soft-delete) em vez de DELETE permanente
- `auto_exclude_deleted` no `buildSearchParams()` sem consumir filter slot
- Módulos são opt-in via `tenant_modules` — nunca forçados
- Template Packs são aditivos — nunca sobrescrevem dados existentes
- Multi-domain auth tem auto-link best-effort (try/catch, nunca quebra auth)

---

#### ARTIGO 7 — ECONOMIC ALIGNMENT

> Toda capacidade major deve responder: **Quem ganha dinheiro porque isso existe?**

A Radul cresce participando do sucesso do ecossistema.

**Modelo de receita em camadas:**

| Camada          | Quem paga  | Para quem       | Mecanismo                     |
| --------------- | ---------- | --------------- | ----------------------------- |
| **Plataforma**  | Tenant     | Radul           | SaaS Billing (5 planos tier)  |
| **Marketplace** | Tenant     | Builder + Radul | Revenue share no pack         |
| **Integrações** | Tenant     | Partner + Radul | Comissão via Channel Partners |
| **Serviços**    | End client | Tenant          | Pagamento via gateways (3 GW) |

---

#### ARTIGO 8 — INVISIBLE INFRASTRUCTURE

> A melhor versão da Radul é invisível.

Clientes devem sentir que rodam **sua própria plataforma**, enquanto a Radul alimenta por baixo.

**Como a Radul já pratica:**

- **Tenant Branding** — auth screens com logo, cor e nome do tenant
- **Custom Domains** — `app.meudominio.com.br` em vez de `radul.com.br`
- **Portal Público** — `/p/:token` e `/q/:token` sem menção à Radul
- **White-label potential** — slug + branding + custom domain = plataforma do tenant

---

#### ARTIGO 9 — BUILDER EXPERIENCE PRIORITY

> Facilidade de **construir soluções** é mais importante que facilidade de **configurar telas**.

A Radul otimiza para **criadores**, não apenas operadores.

**Prioridade de experiência:**

```
1. Builder cria pack em < 1 hora
2. Tenant aplica pack em < 15 minutos
3. Operador configura em < 10 minutos
4. Cliente usa sem treinamento
```

---

#### ARTIGO 10 — LONG TERM DECISIONS

> Receita de curto prazo **nunca** deve comprometer extensibilidade da plataforma.

A Radul é projetada para **décadas**, não trimestres.

**O teste do "cliente grande":**

```
Cliente grande oferece R$50K/mês por customização não-extensível.

PERGUNTA: Se aceitarmos, podemos vender isso para outros 100 clientes?

NÃO → Recusar ou transformar em extensão genérica
SIM → Aceitar e implementar como módulo/pack
```

---

## Parte 3 — RADUL FLYWHEEL

### Motor de Crescimento Autônomo

#### O erro comum vs. o modelo de plataforma

**Empresas comuns:**

```
Mais vendas → mais clientes → mais receita
(crescimento linear, depende do time de vendas)
```

**Plataformas dominantes:**

```
Mais builders → mais soluções → mais clientes
→ mais mercado → mais builders
(crescimento exponencial, rede se alimenta sozinha)
```

#### O Flywheel da Radul

```
    ┌──────────────┐
    │   BUILDERS   │ ← Consultores, agências, especialistas
    │   ENTRAM     │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   CRIAM      │ ← Template Packs, Agent Packs,
    │   SOLUTION   │   Workflows, Integrações
    │   PACKS      │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  MARKETPLACE │ ← Novos clientes NÃO começam do zero
    │    RADUL     │   Compram "empresa pronta para rodar"
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   NOVOS      │ ← Tempo até valor: 6 meses → 2 dias
    │   NEGÓCIOS   │   Adoção explode
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   RECEITA    │ ← Revenue share:
    │ COMPARTILHADA│   Builder + Radul + Ecossistema
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │    MAIS      │ ← Especialistas escolhem Radul
    │  BUILDERS    │   ANTES do cliente existir
    └──────┬───────┘
           │
           └──────────► (ciclo reinicia maior)
```

#### Etapas do Flywheel

##### Etapa 1 — Builders Entram

**Quem são:**

- Consultores (advocacia, saúde, varejo, cobrança)
- Agências de implementação
- Especialistas operacionais
- Operadores transformando experiência em produto

**O que pensam:** _"Posso transformar meu conhecimento em produto."_

**O que a Radul oferece:** Infraestrutura completa (CrudScreen, Workflow Engine, Multi-tenant, SaaS Billing, Payment Gateways).

**Como conecta ao existente:**

- Channel Partners já existe (referral codes, comissões)
- Template Packs já podem ser criados por qualquer dev
- Agent Packs permitem deploy de IA em 1 clique

##### Etapa 2 — Builders Criam Solution Packs

**O que constroem:**

| Tipo                   | Exemplo                           | Mecanismo atual                    |
| ---------------------- | --------------------------------- | ---------------------------------- |
| Templates operacionais | "Gestão de Clínica"               | `data/template-packs/clinica.ts`   |
| Automações             | "Follow-up automático para leads" | Agent Packs + Playbooks            |
| Integrações            | "Sincronização com Omie"          | `services/omie.ts` wrapper         |
| Dashboards             | "KPIs para varejo"                | Metabase dashboards configurados   |
| Fluxos completos       | "Processo de cobrança end-to-end" | Workflow Templates + Steps + Forms |

**Conhecimento vira ativo replicável.**

##### Etapa 3 — Marketplace Radul

Novos clientes **não começam do zero**.

Entram e "compram" empresa pronta para rodar:

```
ANTES DO MARKETPLACE:
  Tenant cria conta → configura tudo manual → 2-6 semanas até operar

COM MARKETPLACE:
  Tenant cria conta → escolhe pack → aplica → 15 minutos até operar
```

**O que já existe e precisa evoluir:**

| Atual                                  | Evolução                             |
| -------------------------------------- | ------------------------------------ |
| Seleção de pack no onboarding (Step 4) | Marketplace browsável com categorias |
| 6 packs internos                       | Packs de parceiros + packs pagos     |
| `applyTemplatePack()` simples          | Install com preview + rollback       |
| Sem reviews                            | Rating + reviews por pack            |

##### Etapa 4 — Clientes Viram Builders

**O efeito exponencial:**

```
Cliente usa pack → aprende → melhora → cria variação → publica novo pack
```

Usuário vira criador. **Shopify explodiu exatamente aqui.**

**Como habilitar:**

- Export de configurações do tenant como pack
- Editor visual de packs (sem código)
- Documentação de "como criar seu primeiro pack"
- Monetização imediata (listing no marketplace)

##### Etapa 5 — Receita Compartilhada

Cada venda gera:

- **Receita para builder** (criou o pack)
- **Receita para Radul** (revenue share)
- **Retenção automática** (tenant depende do pack)

**Modelo de revenue share proposto:**

| Tipo de pack             | Builder | Radul | Notas                      |
| ------------------------ | ------- | ----- | -------------------------- |
| Template Pack gratuito   | 0%      | 0%    | Atração de mercado         |
| Template Pack pago       | 70%     | 30%   | Padrão marketplace         |
| Agent Pack               | 70%     | 30%   | Inclui manutenção do agent |
| Integração               | 80%     | 20%   | Builder mantém integração  |
| Serviço de implementação | 85%     | 15%   | Channel Partner comissão   |

##### Etapa 6 — Mais Mercado Atrai Mais Builders

**O fenômeno-chave:** especialistas começam escolhendo a Radul **antes mesmo do cliente existir**.

Radul vira **default platform**. O ciclo reinicia maior.

---

### North Star Metrics da Radul

#### Builder Metrics

| Métrica                   | Descrição                        | Meta inicial |
| ------------------------- | -------------------------------- | ------------ |
| Builders ativos           | Parceiros criando/mantendo packs | 10 no ano 1  |
| Packs publicados          | Total de packs no marketplace    | 20 no ano 1  |
| Receita média por builder | Quanto cada builder ganha/mês    | R$2.000/mês  |
| % receita via marketplace | Receita de packs vs. SaaS direto | 10% no ano 2 |

#### Ecosystem Metrics

| Métrica                       | Descrição                           | Meta inicial   |
| ----------------------------- | ----------------------------------- | -------------- |
| Empresas rodando packs        | Tenants usando packs de terceiros   | 50 no ano 1    |
| Tempo até operação ativa      | Da criação da conta até 1º workflow | < 30 minutos   |
| Packs reutilizados            | Média de tenants por pack           | 5 tenants/pack |
| Net Promoter Score (builders) | Satisfação dos builders             | > 50           |

#### Economic Metrics

| Métrica                       | Descrição                              | Meta inicial        |
| ----------------------------- | -------------------------------------- | ------------------- |
| GMV dentro da Radul           | Volume total de transações processadas | R$1M/mês no ano 2   |
| Receita gerada no ecossistema | Total que builders ganham              | R$100K/mês no ano 2 |
| Revenue share                 | Receita da Radul via marketplace       | R$30K/mês no ano 2  |

---

### A Métrica Real

> **Quantas pessoas ficaram mais ricas usando a Radul este mês?**

Se esse número cresce → o flywheel está girando.

---

## Parte 4 — AGENTES DE DECISÃO

### 3 Agentes para Governança de Plataforma

Para reduzir 80% dos erros de IA/produto em sistema complexo, usar 3 "lentes" diferentes:

#### Agent 1: Platform Architect

**Papel:** Decisões estruturais

**Pergunta-chave:** _"Isso fortalece a plataforma como infraestrutura?"_

**Foco:**

- Separação de camadas (Core / Extension / Solution)
- Extensibilidade de longo prazo
- Pattern consistency
- API design
- Modelo de dados

**Quando consultar:** Antes de criar nova tabela, novo módulo, nova integração.

#### Agent 2: Builder Experience AI

**Papel:** Experiência do parceiro/builder

**Pergunta-chave:** _"Um consultor sem dev consegue criar e vender isso em menos de 1 semana?"_

**Foco:**

- Developer experience
- Documentação
- Templates e exemplos
- Marketplace UX
- Onboarding de builders

**Quando consultar:** Antes de lançar feature que builders usarão.

#### Agent 3: Core Guardian AI

**Papel:** Evitar breaking changes

**Pergunta-chave:** _"Isso quebra algo que funciona hoje?"_

**Foco:**

- Backward compatibility
- Migration safety
- Data integrity
- Performance impact
- Tenant isolation

**Quando consultar:** Antes de alterar Core Layer (CrudScreen, api_crud, auth, workflow engine).

---

## Parte 5 — REGRA DE OURO

### O Filtro Universal

A partir de agora, toda feature deve passar por esta pergunta automática:

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   "Isso ajuda alguém a CONSTRUIR UM NEGÓCIO             ║
║    dentro da Radul?"                                     ║
║                                                          ║
║   SIM → é capacidade de plataforma → priorizar          ║
║   NÃO → é apenas feature → avaliar ROI cuidadosamente   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

### Exemplos práticos com features atuais/planejadas:

| Feature                     | Ajuda a construir negócio?                       | Decisão           |
| --------------------------- | ------------------------------------------------ | ----------------- |
| **Custom Fields (JSONB)**   | SIM — builders customizam sem código             | Prioridade alta   |
| **Marketplace de Packs**    | SIM — builders vendem soluções                   | Prioridade máxima |
| **Export CSV/PDF**          | PARCIAL — facilita operação mas não cria negócio | Prioridade média  |
| **Time Tracking**           | PARCIAL — feature operacional útil para muitos   | Prioridade média  |
| **Visual Workflow Builder** | SIM — builders criam workflows sem dev           | Prioridade alta   |
| **API Pública REST**        | SIM — permite integrações de terceiros           | Prioridade alta   |
| **NFSe automática**         | NÃO diretamente — compliance localizado          | Prioridade média  |
| **Dispatch com mapa**       | NÃO diretamente — feature vertical               | Módulo opcional   |
| **Builder SDK/CLI**         | SIM — facilita criação de packs                  | Prioridade futura |
| **Pack Versioning**         | SIM — builders mantêm e evoluem packs            | Prioridade futura |

---

## Parte 6 — ANTI-PATTERNS (O que NUNCA fazer)

### 1. Competir com Builders

**Nunca fazer:**

- Pack oficial competindo diretamente com pack de parceiro
- Consultoria interna dominante
- Verticalização agressiva no core

**A Radul deve ser infraestrutura neutra.** AWS não cria startups SaaS concorrentes aos clientes.

### 2. Enterprise Custom Hell

**Nunca fazer:**

- Customização one-off para cliente grande
- Branch de código para um tenant específico
- Feature flag permanente para um cliente

**Sempre fazer:** Transformar o pedido em módulo/extensão genérico.

### 3. Poluição do Core

**Nunca fazer:**

- Adicionar campo específico de domínio no CrudScreen
- Adicionar lógica de negócio específica no api_crud Worker
- Criar tela que só funciona para um tipo de empresa

**Sempre fazer:** Usar Template Pack, módulo opt-in, ou custom field.

### 4. Lock-in Artificial

**Nunca fazer:**

- Formatos proprietários de dados
- APIs fechadas sem documentação
- Impossibilitar export/portabilidade

**Sempre fazer:** Padrões abertos, APIs documentadas, export nativo.

---

## Parte 7 — ROADMAP DE EVOLUÇÃO PARA PLATAFORMA

> **📋 Implementação detalhada:** Para especificações técnicas completas (SQL, TypeScript, arquitetura, critérios de aceite, estimativas de esforço e grafo de dependências), ver **[RADUL_DETAILED_ROADMAP.md](./RADUL_DETAILED_ROADMAP.md)**.

### Fase A — Fundação de Plataforma (Q2 2026)

> **Objetivo:** Habilitar os primeiros builders externos

| #   | Tarefa                      | Camada    | Conexão com existente                | Status          |
| --- | --------------------------- | --------- | ------------------------------------ | --------------- |
| A.1 | Custom Fields via JSONB     | Extension | Evolução de `tenants.config` pattern | ✅ Implementado |
| A.2 | Pack Export (tenant → pack) | Solution  | Inverso de `applyTemplatePack()`     | ✅ Implementado |
| A.3 | API Pública REST (v1)       | Core      | Evolução do api_crud Worker          | ✅ Implementado |
| A.4 | Builder Portal (docs + SDK) | Solution  | Evolução de `data/template-packs/`   |                 |
| A.5 | Pack Marketplace (MVP)      | Solution  | Evolução do onboarding Step 4        |                 |

### Fase B — Builder Economy (Q3 2026)

> **Objetivo:** Primeiros packs pagos e revenue share

| #   | Tarefa                 | Camada    | Conexão com existente                       |
| --- | ---------------------- | --------- | ------------------------------------------- |
| B.1 | Pack Pricing & Billing | Solution  | Reutiliza SaaS Billing (invoices, payments) |
| B.2 | Revenue Share Engine   | Core      | Evolução de `partner_earnings`              |
| B.3 | Pack Reviews & Ratings | Solution  | Reutiliza `process_reviews` pattern         |
| B.4 | Builder Dashboard      | Extension | Reutiliza Financial Dashboard pattern       |
| B.5 | Pack Versioning        | Solution  | Versionamento + rollback                    |

### Fase C — Ecosystem Scale (Q4 2026)

> **Objetivo:** Flywheel começa a girar

| #   | Tarefa                  | Camada    | Conexão com existente               |
| --- | ----------------------- | --------- | ----------------------------------- |
| C.1 | Visual Workflow Builder | Extension | Evolução do workflow engine         |
| C.2 | No-code Pack Creator    | Solution  | UI para criar packs sem código      |
| C.3 | Marketplace Discovery   | Solution  | Search, categorias, featured        |
| C.4 | Builder Certifications  | Solution  | Badges, trust signals               |
| C.5 | Cross-tenant Analytics  | Core      | Metabase embeddado para marketplace |

### Fase D — Platform Dominance (2027)

> **Objetivo:** Radul como default platform

| #   | Tarefa                     | Camada    | Conexão com existente        |
| --- | -------------------------- | --------- | ---------------------------- |
| D.1 | Plugin System (JS/TS)      | Core      | Runtime de extensões         |
| D.2 | White-label completo       | Core      | Evolução de tenant branding  |
| D.3 | Partner Program            | Solution  | Evolução de Channel Partners |
| D.4 | International Expansion    | Core      | i18n, multi-currency         |
| D.5 | Radul Developer Conference | Ecosystem | Comunidade                   |

---

## Parte 8 — ESTADO ATUAL (Snapshot Março 2026)

### O que já está construído e preservado

```
╔════════════════════════════════════════════════════════╗
║  169 telas          │  72 CrudScreens                  ║
║  13 módulos opt-in  │  6 template packs                ║
║  2 agent packs      │  76 services                     ║
║  80+ tabelas        │  22+ integrações                 ║
║  3 payment gateways │  41 migrations                   ║
║  206 permissions    │  10 hooks                        ║
║  5 planos SaaS      │  Multi-domain auth               ║
║  Portal público     │  Tenant branding                 ║
║  Workflow engine    │  Kanban boards                   ║
║  AI Agents (9 telas)│  CRM completo                    ║
║  Financeiro completo│  Marketplace/PDV                 ║
║  API Pública REST   │  Custom Fields + Pack Export     ║
╚════════════════════════════════════════════════════════╝

88% universal  │  8% híbrido  │  4% integrações
```

### DNA que NUNCA muda

1. **CRUD-first** — CrudScreen genérico para qualquer tabela
2. **Schema-driven** — `getTableInfo()` gera telas a partir do banco
3. **Data-driven workflows** — Processo novo = registros no banco
4. **Multi-tenant isolado** — `tenant_id` em tudo
5. **Modules desacoplados** — Features são plug-ins, não monolito

### Parceiros estratégicos (Build / Embed / Integrate)

| Estratégia                  | Quando                  | Exemplos                                        |
| --------------------------- | ----------------------- | ----------------------------------------------- |
| **BUILD**                   | Diferencial competitivo | Workflow Engine, CrudScreen, Kanban             |
| **EMBED** (OSS self-hosted) | OSS maduro existe       | N8N, Documenso, Metabase, Tesseract.js          |
| **INTEGRATE** (API externa) | Regulado/comoditizado   | WhatsApp, BrasilAPI, Gov.br, Asaas, MercadoPago |

**Regra:** Todo parceiro consumido via `services/parceiro.ts` wrapper. Trocar parceiro = mudar 1 arquivo.

---

## Parte 9 — VISÃO DE LONGO PRAZO

### O Estágio Final (5–7 anos)

Se bem executado, empreendedores brasileiros passam a pensar:

> _"Tenho uma ideia de negócio… vou construir na Radul."_

Nesse momento:

- A Radul **deixa de disputar mercado**
- A Radul **define o mercado**

### A Posição Única

A Radul está numa posição raríssima:

- ✅ Entende operação (workflow engine, processos de negócio)
- ✅ Entende software (CrudScreen, schema-driven, multi-tenant)
- ✅ Entende plataforma (módulos, packs, marketplace)
- ✅ Controla o produto (founder-led, decisões rápidas)
- ✅ Integrações BR nativas (Gov.br, BrasilAPI, ONR, PIX)

Isso permite algo que quase ninguém no Brasil conseguiu ainda:

**Criar o Shopify / Salesforce operacional brasileiro.**

---

_Documento estratégico — Março 2026 • Baseado na Constituição de Plataforma, Flywheel de Crescimento e auditoria completa do codebase (169 telas, 114 páginas admin, 72 CrudScreens, 13 módulos, 6 template packs, 2 agent packs, 76 services, 40 migrations, 10 hooks, 3 payment gateways, 22+ integrações ativas)_
