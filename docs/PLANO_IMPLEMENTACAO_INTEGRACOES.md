# Plano de Implementação — Integrações SOS Escritura

> **Data:** 15/02/2026 · **Atualizado:** 16/02/2026 (v8)  
> **Status geral:** Tudo implementado! Services, hooks, componentes, telas admin (8), Plausible em 12+ telas, cache BrasilAPI, feriados nos prazos, kanban via process-engine, CPF validation, testes unitários (19 passing). **Fase 6 (Companies)** ✅, **Fase 7 (Navegação)** ✅, **Fase 8 (Protocolos Polimórficos)** ✅ — protocolos e certidões agora suportam vínculo polimórfico (entity_type + entity_id) a qualquer entidade + referência a cartório via diretório. Faltam apenas: credenciais externas, N8N webhooks, Plausible self-hosted, migration SQL (pendente execução).

---

## Legenda

- ✅ = Feito
- 🔲 = A fazer
- 🔑 = Requer credencial/contrato externo
- ⏳ = Depende de etapa anterior

---

## Fase 1 — BrasilAPI (Prioridade ALTA, 0 dependências externas)

> **Por quê primeiro:** Não precisa de credencial, API gratuita, impacto imediato na UX de cadastro.

| #    | Tarefa                                                                                  | Tipo       | Estimativa | Status |
| ---- | --------------------------------------------------------------------------------------- | ---------- | ---------- | ------ |
| 1.1  | Service `brasil-api.ts`                                                                 | Código     | —          | ✅     |
| 1.2  | Tabela `brasil_api_cache` no banco                                                      | Migration  | —          | ✅     |
| 1.3  | Criar hook `useCepAutoFill` (chama `autoFillFromCep`, preenche form)                    | Código     | 30min      | ✅     |
| 1.4  | Criar hook `useCnpjLookup` (chama `lookupCnpj`, retorna dados empresa)                  | Código     | 30min      | ✅     |
| 1.5  | Integrar CEP auto-fill em `properties.tsx` (Admin) via `renderCustomField`              | Wiring     | 20min      | ✅     |
| 1.6  | ~~Integrar CEP auto-fill em `customers.tsx`~~ (tabela não tem campos de endereço)       | —          | —          | N/A    |
| 1.7  | ~~Integrar CEP auto-fill em `SolicitarServico.tsx`~~ (sem campos de endereço)           | —          | —          | N/A    |
| 1.8  | ~~Integrar CNPJ lookup em `customers.tsx`~~ (tabela não tem campo CNPJ)                 | —          | —          | N/A    |
| 1.9  | Usar `validateCpf()` + `formatCpf()` no login e cadastro                                | Wiring     | 15min      | ✅     |
| 1.10 | Componente `StateCityPicker` (Modal+FlatList, IBGE via BrasilAPI)                       | Componente | 45min      | ✅     |
| 1.11 | Componente `CepInput` (input + auto-fill + loading + ícone busca)                       | Componente | 40min      | ✅     |
| 1.12 | Usar `listHolidays()` no cálculo de prazos (`gestor-prazos.tsx`)                        | Wiring     | 30min      | ✅     |
| 1.13 | Cache BrasilAPI em `brasil_api_cache` (salvar/ler via CRUD automático)                  | Código     | 30min      | ✅     |
| 1.14 | Testes unitários: `validateCpf`, `validateCnpj`, `formatCep`, `formatCpf`, `formatCnpj` | Teste      | 20min      | ✅     |
| 1.15 | Teste integração: `lookupCep("01310100")` retorna dados                                 | Teste      | 15min      | 🔲     |
| 1.16 | Prop `renderCustomField` adicionada ao `CrudScreen.tsx`                                 | Infra      | —          | ✅     |
| 1.17 | `validateCpf()` + `formatCpf()` no campo CPF de `customers.tsx` via `renderCustomField` | Wiring     | 15min      | ✅     |

### Como testar:

```bash
# No console do app ou script:
import { lookupCep, autoFillFromCep } from '@/services/brasil-api';
const addr = await autoFillFromCep('01310100');
console.log(addr); // { cep: "01310-100", state: "SP", city: "São Paulo", ... }
```

---

## Fase 2 — Plausible Analytics (Prioridade ALTA, quase pronto)

> **Por quê:** Tracking de pageview já funciona. Faltam só os eventos de negócio e dashboard admin.

| #    | Tarefa                                                                        | Tipo      | Estimativa | Status         |
| ---- | ----------------------------------------------------------------------------- | --------- | ---------- | -------------- |
| 2.1  | Service `plausible.ts`                                                        | Código    | —          | ✅             |
| 2.2  | Wiring `trackPageView` no `_layout.tsx`                                       | Wiring    | —          | ✅             |
| 2.3  | Wiring `trackLogin` nos 3 métodos                                             | Wiring    | —          | ✅             |
| 2.4  | **Decidir:** Plausible Cloud ou Self-hosted?                                  | Decisão   | —          | ✅ Self-hosted |
| 2.5  | Registrar site `app.sosescrituras.com.br` no Plausible                        | Config    | 10min      | 🔲             |
| 2.6  | Preencher `EXPO_PUBLIC_PLAUSIBLE_API_KEY` no `.env`                           | Config    | 5min       | ⏳ 2.5         |
| 2.7  | Adicionar `trackSignup("cpf")` no `register.tsx`                              | Wiring    | 5min       | ✅             |
| 2.8  | Adicionar `trackProcessStep` no `kanban-processos.tsx`                        | Wiring    | 10min      | ✅             |
| 2.9  | `trackProcessStarted` / `trackProcessCompleted` no `process-engine.ts`        | Wiring    | 15min      | ✅             |
| 2.10 | ~~Adicionar `trackProcessCompleted` no final de processo~~ (merge com 2.9)    | —         | —          | —              |
| 2.11 | Adicionar `trackDocumentSigned` em `document-signatures.tsx` + `Processo.tsx` | Wiring    | 5min       | ✅             |
| 2.12 | Adicionar `trackDocumentGenerated` em `document-generator.tsx`                | Wiring    | 5min       | ✅             |
| 2.13 | Adicionar `trackServiceRequested` em `SolicitarServico.tsx`                   | Wiring    | 5min       | ✅             |
| 2.14 | Adicionar `trackChatStarted` em `atendimento.tsx`                             | Wiring    | 5min       | ✅             |
| 2.15 | Adicionar `trackOcrPerformed` em `ocr-results.tsx` + `Processo.tsx`           | Wiring    | 5min       | ✅             |
| 2.16 | Tela Admin `analytics.tsx` (dashboard: stats, timeseries, top pages)          | Tela nova | 2h         | ✅             |
| 2.17 | Testar em produção: verificar eventos no dashboard Plausible                  | Teste     | 15min      | ⏳ 2.5         |

### Como testar (dev):

```
# Eventos aparecem no console em __DEV__:
[Plausible] pageview {}
[Plausible] login { method: "cpf" }
```

### Opções Plausible (decisão 2.4):

| Opção                    | Custo    | Prós                            | Contras                              |
| ------------------------ | -------- | ------------------------------- | ------------------------------------ |
| **Plausible Cloud**      | €9/mês   | Zero manutenção, pronto em 5min | Dados nos servidores deles (EU)      |
| **Self-hosted (Docker)** | Gratuito | LGPD total, dados seus          | Precisa servidor + manter atualizado |

**Recomendação:** Começar com Cloud (rápido), migrar para self-hosted depois se necessário.

---

## Fase 3 — Gov.br Login (Prioridade MÉDIA, requer registro externo)

> **Por quê:** Frontend pronto, mas precisa de credenciais Gov.br e webhook N8N.

| #    | Tarefa                                                         | Tipo      | Estimativa | Status      |
| ---- | -------------------------------------------------------------- | --------- | ---------- | ----------- |
| 3.1  | Service `gov-br.ts`                                            | Código    | —          | ✅          |
| 3.2  | `govBrLogin()` no AuthContext                                  | Código    | —          | ✅          |
| 3.3  | Botão "Entrar com Gov.br" na tela login                        | UI        | —          | ✅          |
| 3.4  | Colunas Gov.br na tabela `users`                               | Migration | —          | ✅          |
| 3.5  | Env vars no `.env` e `app.json`                                | Config    | —          | ✅          |
| 3.6  | 🔑 **Registrar app no Gov.br** (acesso.gov.br)                 | Externo   | 1-3 dias   | 🔲          |
|      | → Acessar https://acesso.gov.br                                |           |            |             |
|      | → Menu "Integração" → "Solicitar credenciais"                  |           |            |             |
|      | → Informar redirect URI: `portalimoveis://` + web URL          |           |            |             |
|      | → Scopes: openid, email, phone, profile, govbr_confiabilidades |           |            |             |
|      | → Aguardar aprovação (pode levar dias)                         |           |            |             |
| 3.7  | Preencher `EXPO_PUBLIC_GOVBR_CLIENT_ID` e `SECRET` no `.env`   | Config    | 5min       | ⏳ 3.6      |
| 3.8  | Preencher `govBrClientId` e `govBrClientSecret` no `app.json`  | Config    | 5min       | ⏳ 3.6      |
| 3.9  | **Criar N8N webhook `govbr_login`**                            | N8N       | 1-2h       | 🔲          |
|      | → Webhook node: POST `/webhook/govbr_login`                    |           |            |             |
|      | → Recebe: `{ cpf, name, email, phone, nivel_confianca, ... }`  |           |            |             |
|      | → SQL: `SELECT * FROM users WHERE cpf = $1`                    |           |            |             |
|      | → Se existe: UPDATE govbr\_\*, retornar JWT + user             |           |            |             |
|      | → Se não existe: INSERT novo user, retornar JWT + user         |           |            |             |
|      | → Copiar lógica do `Login` webhook existente para gerar token  |           |            |             |
| 3.10 | Testar fluxo completo em staging (`sso.staging.acesso.gov.br`) | Teste     | 30min      | ⏳ 3.7, 3.9 |
| 3.11 | Trocar `EXPO_PUBLIC_GOVBR_ENV` de `staging` para `production`  | Config    | 5min       | ⏳ 3.10     |
| 3.12 | Exibir nível de confiança (bronze/prata/ouro) no `Perfil.tsx`  | UI        | 30min      | ⏳ 3.10     |
| 3.13 | Desabilitar botão Gov.br se `!isGovBrConfigured()`             | UI Polish | 15min      | ✅          |
| 3.14 | Teste: login Gov.br → tenant selection → perfil                | Teste E2E | 20min      | ⏳ 3.10     |

### Passo a passo para registrar no Gov.br:

1. Acesse https://www.gov.br/conecta/catalogo
2. Solicite acesso ao **Login Único** (categoria Autenticação)
3. Preencha dados do sistema: nome "SOS Escritura", URLs de callback
4. Callback URLs necessárias:
   - Web: `https://app.sosescritura.com.br/auth/callback`
   - iOS/Android: `portalimoveis://`
5. Aguarde e-mail com `client_id` e `client_secret`

---

## Fase 4 — ReceitaWS (Prioridade BAIXA, complementa BrasilAPI)

> **Por quê:** BrasilAPI já faz CNPJ lookup. ReceitaWS adiciona Simples Nacional + QSA detalhado.

| #   | Tarefa                                                                                            | Tipo       | Estimativa | Status                 |
| --- | ------------------------------------------------------------------------------------------------- | ---------- | ---------- | ---------------------- |
| 4.1 | Service `receita-ws.ts`                                                                           | Código     | —          | ✅                     |
| 4.2 | Env var `EXPO_PUBLIC_RECEITAWS_TOKEN`                                                             | Config     | —          | ✅ (token configurado) |
| 4.3 | Componente `CnpjDetail` (mostra sócios, Simples, atividade, BrasilAPI+ReceitaWS)                  | Componente | 1h         | ✅                     |
| 4.4 | ~~Integrar em `customers.tsx`~~ → Tela standalone `cnpj-consulta.tsx` (tabela customers sem CNPJ) | Tela nova  | 30min      | ✅                     |
| 4.5 | Colunas ONR em `properties.tsx` admin (protocolo, status, matrícula, livro)                       | Wiring     | 30min      | ✅                     |
| 4.6 | Mostrar rate limit info na UI (3 req/min grátis) + fila automática                                | UI         | 15min      | ✅                     |
| 4.7 | Token ReceitaWS obtido (3 req/min)                                                                | Decisão    | —          | ✅                     |
| 4.8 | Teste: consultar CNPJ real, verificar dados retornados                                            | Teste      | 10min      | 🔲                     |

---

## Fase 5 — ONR / SREI (Prioridade ALTA para o negócio, requer convênio)

> **Por quê:** Core do negócio (registro de imóveis), mas depende de contrato com ONR.

### Fase 5A — Preparação (enquanto aguarda convênio)

| #     | Tarefa                                                                                      | Tipo      | Estimativa | Status           |
| ----- | ------------------------------------------------------------------------------------------- | --------- | ---------- | ---------------- |
| 5A.1  | Service `onr-srei.ts`                                                                       | Código    | —          | ✅               |
| 5A.2  | Tabelas `onr_protocolos`, `onr_certidoes`, `cartorios`                                      | Migration | —          | ✅               |
| 5A.3  | Colunas ONR em `properties`                                                                 | Migration | —          | ✅               |
| 5A.4  | 🔑 **Iniciar processo de convênio com ONR**                                                 | Externo   | 30-90 dias | ⏳ email enviado |
|       | → Acessar https://www.onr.org.br/                                                           |           |            |                  |
|       | → Contato: conveniados@onr.org.br                                                           |           |            |                  |
|       | → Documentação necessária: CNPJ, objeto social, responsável técnico                         |           |            |                  |
|       | → Aguardar análise e assinatura de convênio                                                 |           |            |                  |
| 5A.5  | **Criar N8N webhook `onr_srei`** (proxy/mock)                                               | N8N       | 2-3h       | 🔲               |
|       | → Webhook node: POST `/webhook/onr_srei`                                                    |           |            |                  |
|       | → Switch por `action`: consultar_matricula, submeter_protocolo, etc.                        |           |            |                  |
|       | → Inicialmente: retornar dados mock para desenvolvimento                                    |           |            |                  |
|       | → Depois: proxy para a API real da ONR com auth/cert                                        |           |            |                  |
| 5A.6  | Tela `Administrador/onr-protocolos.tsx` — **Protocolos** (doc. p/ cartório)                 | Tela nova | 3h         | ✅               |
|       | → Vínculo polimórfico: entity_type + entity_id (Fase 8)                                     |           |            |                  |
|       | → Referência a cartório via `cartorio_id` FK                                                |           |            |                  |
|       | → Status: pendente, processando, pronto p/ envio, enviado, registrado, exigência, cancelado |
|       | → Tipos: averbação, registro, retificação, usucapião, outros                                |           |            |                  |
| 5A.7  | Tela `Administrador/onr-certidoes.tsx` — **Certidões** (docs finais)                        | Tela nova | 2h         | ✅               |
|       | → Vínculo polimórfico: entity_type + entity_id (Fase 8)                                     |           |            |                  |
|       | → Referência a cartório via `cartorio_id` FK                                                |           |            |                  |
|       | → Tipos: inteiro*teor, resumida, ônus_reais, negativa*ônus, vintenária, transcrição, outros |
|       | → Status: solicitada, processando, disponível, entregue, expirada, erro                     |           |            |                  |
| 5A.8  | Tela `Administrador/cartorios.tsx` (CRUD, 5 tipos, protocolo eletrônico)                    | Tela nova | 1.5h       | ✅               |
|       | → Diretório de cartórios (CNS, nome, endereço, website, horário)                            |           |            |                  |
|       | → Filtro por UF/cidade/tipo                                                                 |           |            |                  |
|       | → Badge "aceita protocolo eletrônico"                                                       |           |            |                  |
|       | → Migração adiciona tenant_id, website, horario_funcionamento                               |           |            |                  |
| 5A.9  | Adicionar seção ONR em `Processo.tsx` (cliente)                                             | UI        | 1h         | ✅               |
|       | → Mostra protocolos ONR com status/badges/exigências + certidões                            |           |            |                  |
| 5A.10 | Adicionar colunas ONR na tabela de `properties.tsx` (admin)                                 | UI        | 30min      | ✅               |
| 5A.11 | Testes com dados mock                                                                       | Teste     | 30min      | 🔲               |

### Fase 5B — Integração real (após convênio aprovado)

| #    | Tarefa                                                | Tipo   | Estimativa | Status  |
| ---- | ----------------------------------------------------- | ------ | ---------- | ------- |
| 5B.1 | Preencher `EXPO_PUBLIC_ONR_API_KEY` no `.env`         | Config | 5min       | ⏳ 5A.4 |
| 5B.2 | Configurar certificado mTLS no N8N                    | Config | 1h         | ⏳ 5A.4 |
| 5B.3 | Atualizar webhook `onr_srei` para chamar API real     | N8N    | 2h         | ⏳ 5B.1 |
| 5B.4 | Testar `consultarMatricula` com matrícula real        | Teste  | 30min      | ⏳ 5B.3 |
| 5B.5 | Testar `submeterProtocolo` com protocolo real         | Teste  | 1h         | ⏳ 5B.3 |
| 5B.6 | Configurar cron N8N para `sincronizarStatusProtocolo` | N8N    | 1h         | ⏳ 5B.3 |
| 5B.7 | `trackOnrProtocol` nos eventos de submissão           | Wiring | 5min       | ⏳ 5B.5 |
| 5B.8 | Teste E2E: submit protocolo → acompanhar → registrado | Teste  | 2h         | ⏳ 5B.5 |

---

## Resumo de Progresso

### Feito (código autônomo)

- ✅ **BrasilAPI:** Service, hooks (`useCepAutoFill`, `useCnpjLookup`), componentes (`CepInput`, `StateCityPicker`, `CnpjDetail`), `renderCustomField` no CrudScreen, wiring em `properties.tsx`, `validateCpf`/`formatCpf` em login+register+customers, cache automático via `brasil_api_cache`, feriados nos cálculos de prazos
- ✅ **Plausible:** Service, `trackPageView` no layout, `trackLogin` nos 3 métodos, `trackSignup` no registro, tracking em 9+ telas, `trackProcessStarted`/`trackProcessCompleted` no process-engine, dashboard `analytics.tsx`. **Self-hosted em instalação.**
- ✅ **Gov.br:** Service, AuthContext integration, botão desabilitado quando não configurado
- ✅ **ReceitaWS:** Service, componente `CnpjDetail` com fallback BrasilAPI↔ReceitaWS
- ✅ **ONR/SREI → Protocolos & Certidões:** Service, 3 telas admin (protocolos, certidões, cartórios), seção visível ao cliente em `Processo.tsx`. **Reimaginado na Fase 8:** protocolos = envelope de documentação enviada ao cartório, certidões = documentos finais recebidos. Não é API ONR — é workflow interno com diretório de cartórios.
- ✅ **Vínculo Polimórfico (Fase 8):** `entity_type` + `entity_id` em protocolos e certidões — vincula a qualquer entidade (imóvel, empresa, processo, outro). `cartorio_id` FK ao diretório de cartórios.
- ✅ **Companies/CNPJ Ownership (Fase 6):** Dual CPF/CNPJ ownership, company_members, auto-link on login, PF/PJ toggle em properties, MinhasEmpresas client screen
- ✅ **Navegação (Fase 7):** MinhasEmpresas nos atalhos de serviço, 7 telas admin adicionadas ao admin-pages.ts
- ✅ **Process Engine:** Kanban usa `moveToStep()` com validação + tarefas + deadlines (não mais raw DB update)
- ✅ **Prazos:** Cálculo de dias úteis (exclui feriados nacionais via BrasilAPI + fins de semana)

### Pendente (código)

- 🔲 1.15 — Teste integração `lookupCep` (requer rede)
- ✅ 4.6 — Rate limit info na UI do CnpjDetail + fila automática de requisições
- 🔲 5A.11 — Testes com dados mock ONR

### Pendente (requer ação externa / credenciais)

- ⏳ 2.5/2.6 — Registrar site no Plausible self-hosted + API key (**instalando**)
- 🔑 3.6/3.7/3.8 — Registro Gov.br + credenciais
- 🔑 3.9 — Webhook N8N `govbr_login`
- ⏳ 5A.4 — Convênio ONR (**email enviado**)
- 🔑 5A.5 — Webhook N8N `onr_srei`

---

## Cronograma Atualizado

```
✅ FEITO:   Tudo implementado!
           Services (5), hooks (2), componentes (4), telas admin (8),
           Plausible em 12+ telas + process-engine, cache BrasilAPI,
           feriados nos prazos, kanban via process-engine,
           Protocolos & Certidões com vínculo polimórfico (Fase 8),
           Cartório via FK ao diretório, CPF validation em 3 telas,
           Companies/CNPJ ownership (Fase 6), MinhasEmpresas,
           Navegação completa (Fase 7), CNPJ consulta integrada,
           testes unitários (19 passing)

AGUARDANDO: Plausible self-hosted (instalando)
            Credenciais Gov.br
            Convênio ONR (email enviado)

✅ MIGRATIONS EXECUTADAS: Fases 6 + 8 aplicadas no banco (16/02/2026)
           - companies, company_members (criadas)
           - properties: owner_kind, company_id (adicionadas)
           - onr_protocolos: entity_type, entity_id, cartorio_id (adicionadas)
           - onr_certidoes: entity_type, entity_id, cartorio_id (adicionadas)
           - cartorios: tenant_id, website, horario_funcionamento (adicionadas)
           - Function link_user_to_company_memberships (criada)
```

---

## Checklist Rápido de Credenciais

| Serviço       | O que obter                       | Onde                                | Tempo estimado |
| ------------- | --------------------------------- | ----------------------------------- | -------------- |
| **Gov.br**    | `client_id` + `client_secret`     | https://www.gov.br/conecta/catalogo | 1-7 dias       |
| **ONR/SREI**  | API key + certificado mTLS        | conveniados@onr.org.br              | 30-90 dias     |
| **Plausible** | Site registration + API key       | https://plausible.io/sites/new      | 5 minutos      |
| **ReceitaWS** | Token (opcional, grátis funciona) | https://receitaws.com.br            | Instantâneo    |
| **BrasilAPI** | Nada — 100% grátis sem auth       | —                                   | —              |

---

## Fase 6 — Companies / CNPJ Ownership (Prioridade ALTA)

> **Por quê:** Permite que imóveis sejam de propriedade de PJ (CNPJ), com múltiplos CPFs vinculados a uma empresa vendo os imóveis. Identity=CPF sempre, ownership=CPF ou CNPJ.

| #    | Tarefa                                                                     | Tipo      | Status |
| ---- | -------------------------------------------------------------------------- | --------- | ------ |
| 6.1  | Migration SQL: `companies`, `company_members`, `owner_kind` em properties  | Migration | ✅     |
| 6.2  | Service `companies.ts` (CRUD + resolveOwnerKind + canUserAccessProperty)   | Código    | ✅     |
| 6.3  | `autoLinkUserToCompanies()` — vincula user_id em memberships pendentes     | Código    | ✅     |
| 6.4  | Admin `companies.tsx` — CRUD empresas (CNPJ lookup, link membros/imóveis)  | Tela      | ✅     |
| 6.5  | Admin `company-members.tsx` — CRUD membros (auto-link user_id, badges)     | Tela      | ✅     |
| 6.6  | Client `MinhasEmpresas.tsx` — criar empresa, convidar CPFs, listar membros | Tela      | ✅     |
| 6.7  | Properties admin: PF/PJ toggle + company_id field + owner_kind em detalhes | Wiring    | ✅     |
| 6.8  | Imoveis client: filtrar por company membership (PJ properties)             | Wiring    | ✅     |
| 6.9  | AuthContext: auto-link em login/register/googleLogin/govBrLogin            | Wiring    | ✅     |
| 6.10 | TypeScript compile clean (0 errors)                                        | QA        | ✅     |
| 6.11 | Executar migration SQL no banco                                            | Deploy    | ✅     |
| 6.12 | Testar fluxo completo: criar empresa → convidar CPF → criar imóvel PJ      | Teste     | 🔲     |

### Modelo de dados

```
companies (tenant_id, cnpj UNIQUE per tenant, razao_social, ...)
company_members (company_id FK, cpf, user_id nullable, role: admin|member)
properties.owner_kind = 'cpf' | 'cnpj'
properties.company_id FK → companies (quando owner_kind = 'cnpj')
```

### Como testar

```bash
# 1. Rodar migration
node scripts/run-api-dinamico-sql.js scripts/migrations/2026-02-16_companies_cnpj_ownership.sql

# 2. No app: Admin → Empresas → Criar com CNPJ → Adicionar membros
# 3. Admin → Properties → Criar imóvel com tipo "CNPJ (Empresa)" → Selecionar empresa
# 4. Login como CPF membro → Imóveis deve mostrar o imóvel PJ
```

---

## Fase 7 — Revisão de Navegação (Atalhos & Admin Pages)

> **Por quê:** Garantir que todas as telas criadas estão acessíveis nos menus de serviços e administração.

| #   | Tarefa                                                                | Tipo   | Status |
| --- | --------------------------------------------------------------------- | ------ | ------ |
| 7.1 | Adicionar atalho "Minhas Empresas" em `servicos.tsx`                  | Wiring | ✅     |
| 7.2 | Adicionar 7 telas admin faltantes em `admin-pages.ts`                 | Wiring | ✅     |
|     | → Empresas, Protocolos, Certidões, Cartórios, Services, Analytics     |        |        |
| 7.3 | Verificar telas dependentes aninhadas (não expor separado)            | Review | ✅     |
|     | → company-members, onr_protocolos_exigencias — acessadas via CRUD pai |        |        |
| 7.4 | TypeScript check (0 errors)                                           | QA     | ✅     |

### Critério aplicado

Telas dependentes (company-members, exigencias de protocolo) **não** ganham entrada própria no menu — são acessadas pelo CRUD pai.

---

## Fase 8 — Reimaginação: Protocolos & Certidões (Polimórfico)

> **Por quê:** O negócio **não é** um cartório — não usa API ONR diretamente. Protocolos são "envelopes de documentação" enviados **ao** cartório. Certidões são os documentos finais recebidos de volta. Precisa de flexibilidade para vincular a qualquer entidade, não só imóveis.

### Modelo Conceitual

```
┌────────────────────────────────────────────────────┐
│        VÍNCULO POLIMÓRFICO                          │
│  entity_type = 'property' | 'company' | 'process'  │
│  entity_id   = UUID da entidade                    │
├───────────────────────┬────────────────────────────┤
│  PROTOCOLOS           │  CERTIDÕES                  │
│  (doc enviada ao      │  (doc final recebida do    │
│   cartório)            │   cartório)                │
│                       │                             │
│  entity_type          │  entity_type                │
│  entity_id            │  entity_id                  │
│  cartorio_id ──FK──┐ │  cartorio_id ──FK──┐      │
│  property_id (compat) │  property_id (compat)       │
├───────────────────────┴────────────────────────────┤
│                       │                             │
│               ┌───────┴──────┐                     │
│               │  CARTÓRIOS   │ ◄───────────────────┘
│               │  (diretório) │
│               │  nome, cns   │
│               │  tenant_id   │
│               └──────────────┘
```

### Tarefas

| #    | Tarefa                                                                               | Tipo      | Status |
| ---- | ------------------------------------------------------------------------------------ | --------- | ------ |
| 8.1  | Migration SQL: `entity_type` + `entity_id` em protocolos e certidões                 | Migration | ✅     |
| 8.2  | Migration SQL: `cartorio_id` FK em protocolos e certidões                            | Migration | ✅     |
| 8.3  | Migration SQL: `tenant_id`, `website`, `horario_funcionamento` em cartórios          | Migration | ✅     |
| 8.4  | Backfill: `entity_id = property_id`, `entity_type = 'property'` para rows existentes | Migration | ✅     |
| 8.5  | `onr-protocolos.tsx`: entity_type/entity_id/cartorio_id fields + labels atualizados  | Tela      | ✅     |
| 8.6  | `onr-certidoes.tsx`: entity_type/entity_id/cartorio_id fields + labels atualizados   | Tela      | ✅     |
| 8.7  | `admin-pages.ts`: títulos/descrições atualizados (Protocolos, Certidões)             | Wiring    | ✅     |
| 8.8  | TypeScript check (0 errors)                                                          | QA        | ✅     |
| 8.9  | Executar migration SQL no banco                                                      | Deploy    | ✅     |
| 8.10 | Testar: criar protocolo com entity_type=company, vincular cartório                   | Teste     | 🔲     |

### Migration SQL

```bash
# Arquivo: scripts/migrations/2026-02-16_polimorphic_protocolos_certidoes.sql
node scripts/run-api-dinamico-sql.js scripts/migrations/2026-02-16_polimorphic_protocolos_certidoes.sql
```

### Mudanças de significado

| Antes                                 | Agora                                                         |
| ------------------------------------- | ------------------------------------------------------------- |
| "Protocolos ONR" (registro no ONR)    | **Protocolos** (documentação consolidada enviada ao cartório) |
| "Certidões ONR" (certidões do ONR)    | **Certidões** (documentos finais emitidos pelo cartório)      |
| `property_id` obrigatório             | `entity_type` + `entity_id` polimórfico (property default)    |
| Sem referência a cartório estruturada | `cartorio_id` FK ao diretório de cartórios                    |
| Cartório como texto livre             | Cartório como referência + texto livre (fallback)             |

---

## Próximos Passos Imediatos

1. [x] ~~Decidir Plausible Cloud vs Self-hosted~~ → **Self-hosted** (instalando)
2. [ ] Finalizar instalação Plausible self-hosted → registrar site → preencher API key
3. [ ] Iniciar solicitação de credenciais Gov.br
4. [x] ~~Enviar e-mail para ONR sobre convênio~~ → **Enviado**
5. [x] ~~CnpjDetail em customers/properties~~ → **Tela standalone `cnpj-consulta.tsx`**
6. [x] ~~`trackProcessStarted`/`trackProcessCompleted`~~ → **Feito**
7. [ ] Criar webhook N8N `govbr_login`
8. [x] ~~Testes unitários~~ → **19 testes passing** (Jest + ts-jest)
9. [ ] Teste integração `lookupCep` (requer rede)
10. [x] ~~Companies/CNPJ Ownership (Fase 6)~~ → **Completo**
11. [x] ~~Revisão de navegação (Fase 7)~~ → **MinhasEmpresas + 7 admin pages**
12. [x] ~~Protocolos polimórficos (Fase 8)~~ → **entity_type + entity_id + cartorio_id**
13. [x] ~~Executar migrations SQL (Fases 6 + 8)~~ → **Executado e verificado no banco** (16/02)
14. [ ] Testar fluxo: protocolo com entity_type=company vinculado a cartório

---

## Inventário de Arquivos Criados/Modificados

### Arquivos novos (Fase 6 — Companies/CNPJ)

| Arquivo                                                      | Descrição                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `services/companies.ts`                                      | CRUD companies + company_members + resolveOwnerKind + autoLink  |
| `app/(app)/Administrador/companies.tsx`                      | Admin CRUD empresas (CNPJ lookup, membros, imóveis)             |
| `app/(app)/Administrador/company-members.tsx`                | Admin CRUD membros de empresa (auto-link user_id)               |
| `app/(app)/Servicos/MinhasEmpresas.tsx`                      | Client: minhas empresas, convidar membros, CNPJ auto-fill       |
| `scripts/migrations/2026-02-16_companies_cnpj_ownership.sql` | Migration: companies, company_members, owner_kind em properties |

### Arquivos novos (Fase 8 — Polimórfico)

| Arquivo                                                              | Descrição                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `scripts/migrations/2026-02-16_polimorphic_protocolos_certidoes.sql` | Migration: entity_type, entity_id, cartorio_id, cartorios tenant_id |

### Arquivos modificados (Fase 6)

| Arquivo                                  | Alteração                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `app/(app)/Administrador/properties.tsx` | PF/PJ toggle, company_id field, owner_kind in getDetails/renderCustomField |
| `app/(app)/Servicos/Imoveis.tsx`         | Company membership filter (PJ properties visible to company members)       |
| `core/auth/AuthContext.tsx`              | Auto-link company memberships on login/register/googleLogin/govBrLogin     |

### Arquivos modificados (Fase 7 — Navegação)

| Arquivo                           | Alteração                                                             |
| --------------------------------- | --------------------------------------------------------------------- |
| `app/(app)/Servicos/servicos.tsx` | Atalho "Minhas Empresas" adicionado                                   |
| `core/admin/admin-pages.ts`       | +7 entries: Empresas, Protocolos, Certidões, Cartórios, Services, etc |

### Arquivos modificados (Fase 8 — Polimórfico)

| Arquivo                                      | Alteração                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| `app/(app)/Administrador/onr-protocolos.tsx` | entity_type/entity_id/cartorio_id fields, título "Protocolos", novos status/tipo |
| `app/(app)/Administrador/onr-certidoes.tsx`  | entity_type/entity_id/cartorio_id fields, título "Certidões", novos status/tipo  |
| `core/admin/admin-pages.ts`                  | Títulos e descrições atualizados para Protocolos e Certidões                     |

---

### Arquivos novos (Fases 1-5)

| Arquivo                                      | Descrição                                          |
| -------------------------------------------- | -------------------------------------------------- |
| `services/brasil-api.ts`                     | CEP, CNPJ, IBGE, feriados, validação CPF/CNPJ      |
| `services/receita-ws.ts`                     | CNPJ Receita Federal + Simples Nacional            |
| `services/onr-srei.ts`                       | ONR/SREI proxy via N8N webhook                     |
| `services/gov-br.ts`                         | OAuth2/OIDC Gov.br completo                        |
| `services/plausible.ts`                      | 15 eventos de negócio + Stats API                  |
| `hooks/use-cep-autofill.ts`                  | Hook auto-fill CEP com loading/error               |
| `hooks/use-cnpj-lookup.ts`                   | Hook CNPJ lookup com validação offline             |
| `components/ui/CepInput.tsx`                 | Input CEP com botão busca e auto-fill              |
| `components/ui/StateCityPicker.tsx`          | Picker UF/Cidade via Modal+FlatList (IBGE)         |
| `components/ui/CnpjDetail.tsx`               | Card CNPJ detalhado (BrasilAPI + ReceitaWS)        |
| `app/(app)/Administrador/onr-protocolos.tsx` | CRUD protocolos ONR                                |
| `app/(app)/Administrador/onr-certidoes.tsx`  | CRUD certidões ONR                                 |
| `app/(app)/Administrador/cartorios.tsx`      | CRUD cartórios                                     |
| `app/(app)/Administrador/analytics.tsx`      | Dashboard Plausible (stats, timeseries, top pages) |
| `app/(app)/Administrador/cnpj-consulta.tsx`  | Consulta CNPJ standalone (BrasilAPI + ReceitaWS)   |
| `__tests__/brasil-api.test.ts`               | 19 testes unitários (CPF/CNPJ/CEP validate+format) |
| `jest.config.js`                             | Configuração Jest + ts-jest                        |
| `scripts/migrations/add-integrations-*.sql`  | Migration: tabelas ONR, Gov.br cols, cache         |
| `docs/PLANO_IMPLEMENTACAO_INTEGRACOES.md`    | Este documento                                     |

### Arquivos modificados

| Arquivo                                               | Alteração                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `components/ui/CrudScreen.tsx`                        | Prop `renderCustomField` para campos custom no form                        |
| `app/(auth)/login.tsx`                                | `validateCpf`, Gov.br disabled quando não config                           |
| `app/(auth)/register.tsx`                             | `validateCpf`, `formatCpf`, `trackSignup("cpf")`                           |
| `app/(app)/Administrador/properties.tsx`              | CepInput + StateCityPicker via renderCustomField                           |
| `app/(app)/Servicos/SolicitarServico.tsx`             | `trackServiceRequested()`                                                  |
| `app/(app)/Servicos/atendimento.tsx`                  | `trackChatStarted("robot")`                                                |
| `app/(app)/Servicos/Processo.tsx`                     | `trackOcrPerformed()`, `trackDocumentSigned()`                             |
| `app/(app)/Administrador/document-signatures.tsx`     | `trackDocumentSigned(type)`                                                |
| `app/(app)/Administrador/document-generator.tsx`      | `trackDocumentGenerated(category)`                                         |
| `app/(app)/Administrador/ocr-results.tsx`             | `trackOcrPerformed()`                                                      |
| `app/(app)/Administrador/kanban-processos.tsx`        | `trackProcessStep(step, direction)` + usa `moveToStep()` do process-engine |
| `core/auth/AuthContext.tsx`                           | `govBrLogin()` method                                                      |
| `core/auth/auth.types.ts`                             | Gov.br fields no AuthUser type                                             |
| `app/(app)/_layout.tsx`                               | `usePlausiblePageView()` no layout                                         |
| `.env` / `.env.example`                               | Vars para Gov.br, ONR, Plausible, ReceitaWS                                |
| `app.json`                                            | Extra fields para Gov.br                                                   |
| `services/process-engine.ts`                          | `trackProcessStarted/Completed` no start/finish                            |
| `app/(app)/Administrador/gestor-prazos-processos.tsx` | Dias úteis (feriados BrasilAPI + fins de semana)                           |
| `services/brasil-api.ts`                              | Cache automático em `brasil_api_cache` (CEP, CNPJ, feriados)               |
| `app/(app)/Servicos/Processo.tsx`                     | Seção ONR (protocolos + certidões + exigências)                            |
| `app/(app)/Administrador/customers.tsx`               | CPF validation + formatting via renderCustomField                          |
