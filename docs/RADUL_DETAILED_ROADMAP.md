# RADUL — ROADMAP DETALHADO DE EVOLUÇÃO PARA PLATAFORMA

> Este documento é a versão executável da Parte 7 do [RADUL_PLATFORM_EVOLUTION.md](RADUL_PLATFORM_EVOLUTION.md).
> Cada item contém especificação técnica, migrations, arquivos afetados, dependências, critérios de aceitação e estimativa de esforço.

**Contexto técnico-base (snapshot Março 2026):**

- 55 migrations, 80+ tabelas, 169 telas, 72 CrudScreens
- Worker `api-crud` com 1.220 linhas, 7 CRUD actions, 28 endpoints
- `applyTemplatePack()` = 17-step ordered apply (ref-key → UUID, inclui custom_fields)
- `services/crud.ts` = `buildSearchParams()` + `normalizeCrudList()` (max 8 filtros)
- SaaS Billing = 5 planos, PIX recorrente, `services/saas-billing.ts` (1.973 lines)
- Channel Partners = referral codes, comissões 20%, cálculo mensal
- Módulos = 13 opt-in, dependency graph, fail-closed context
- Onboarding = 4-step wizard, `runOnboarding()` com 8 sub-steps
- Export contábil = `services/accounting-export.ts` (866 lines), 7 docs, `buildCsv()` + `shareCsvFile()`

---

## Índice

- [Fase A — Fundação de Plataforma (Q2 2026)](#fase-a--fundação-de-plataforma-q2-2026)
  - [A.1 Custom Fields via JSONB](#a1-custom-fields-via-jsonb)
  - [A.2 Pack Export (tenant → pack)](#a2-pack-export-tenant--pack)
  - [A.3 API Pública REST v1](#a3-api-pública-rest-v1)
  - [A.4 Builder Portal (docs + SDK)](#a4-builder-portal-docs--sdk)
  - [A.5 Pack Marketplace MVP](#a5-pack-marketplace-mvp)
- [Fase B — Builder Economy (Q3 2026)](#fase-b--builder-economy-q3-2026)
  - [B.1 Pack Pricing & Billing](#b1-pack-pricing--billing)
  - [B.2 Revenue Share Engine](#b2-revenue-share-engine)
  - [B.3 Pack Reviews & Ratings](#b3-pack-reviews--ratings)
  - [B.4 Builder Dashboard](#b4-builder-dashboard)
  - [B.5 Pack Versioning](#b5-pack-versioning)
- [Fase C — Ecosystem Scale (Q4 2026)](#fase-c--ecosystem-scale-q4-2026)
  - [C.1 Visual Workflow Builder](#c1-visual-workflow-builder)
  - [C.2 No-code Pack Creator](#c2-no-code-pack-creator)
  - [C.3 Marketplace Discovery](#c3-marketplace-discovery)
  - [C.4 Builder Certifications](#c4-builder-certifications)
  - [C.5 Cross-tenant Analytics](#c5-cross-tenant-analytics)
- [Fase D — Platform Dominance (2027)](#fase-d--platform-dominance-2027)
  - [D.1 Plugin System (JS/TS)](#d1-plugin-system-jsts)
  - [D.2 White-label Completo](#d2-white-label-completo)
  - [D.3 Partner Program](#d3-partner-program)
  - [D.4 International Expansion](#d4-international-expansion)
  - [D.5 Radul Developer Conference](#d5-radul-developer-conference)
- [Grafo de Dependências](#grafo-de-dependências)
- [Métricas de Validação por Fase](#métricas-de-validação-por-fase)

---

## Fase A — Fundação de Plataforma (Q2 2026)

> **Objetivo:** Habilitar os primeiros builders externos a criar e publicar packs.
> **Duração estimada:** 8–10 semanas
> **Pré-requisito:** Nenhum — tudo se constrói sobre a base existente.

---

### A.1 Custom Fields via JSONB

**Objetivo:** Permitir que tenants e builders adicionem campos personalizados em qualquer tabela-alvo SEM alterar schema do banco.

**Camada afetada:** Extension

**Reuso de componentes existentes:**

- Padrão `tenants.config` JSONB já existe e é consultado em 8+ namespaces
- `convertTableInfoToFields()` em `CrudScreen.tsx` já gera campos a partir do schema
- `CrudFieldConfig<T>` já suporta todos os 15 field types necessários

#### Database Schema

```sql
-- Migration: 2026-04-XX_custom_fields.sql

CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    target_table VARCHAR(100) NOT NULL,        -- e.g. "customers", "service_orders"
    field_key VARCHAR(100) NOT NULL,            -- slug único por tenant+table
    field_type VARCHAR(20) NOT NULL DEFAULT 'text',
    -- field_type: text|multiline|number|currency|date|datetime|boolean|select|email|phone|url|masked|reference|json
    label VARCHAR(255) NOT NULL,
    placeholder VARCHAR(255),
    required BOOLEAN DEFAULT false,
    visible_in_list BOOLEAN DEFAULT true,
    visible_in_form BOOLEAN DEFAULT true,
    section VARCHAR(255),                       -- seção no form
    sort_order INTEGER DEFAULT 0,
    options JSONB DEFAULT '[]',                 -- para type=select: [{label,value}]
    validation_rules JSONB DEFAULT '{}',        -- regex, min, max, etc.
    mask_type VARCHAR(20),                      -- para type=masked: cpf|cnpj|cep|phone
    reference_config JSONB DEFAULT '{}',        -- para type=reference: {table, labelField, idField}
    default_value TEXT,
    show_when JSONB,                            -- conditional visibility: {field, operator, value}
    is_system BOOLEAN DEFAULT false,            -- true = criado por pack, não editável
    pack_ref_key VARCHAR(100),                  -- ref para pack export/import
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, target_table, field_key)
);

-- Valores dos custom fields por registro
CREATE TABLE IF NOT EXISTS custom_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    definition_id UUID NOT NULL REFERENCES custom_field_definitions(id),
    target_table VARCHAR(100) NOT NULL,
    target_id UUID NOT NULL,                    -- ID do registro na tabela alvo
    value TEXT,                                 -- valor serializado como string
    value_json JSONB,                           -- para campos json/select-multi
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, definition_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_cfd_tenant_table ON custom_field_definitions(tenant_id, target_table);
CREATE INDEX IF NOT EXISTS idx_cfv_target ON custom_field_values(tenant_id, target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_cfv_definition ON custom_field_values(definition_id);
```

#### Tabelas-alvo iniciais (whitelist)

```typescript
const CUSTOM_FIELDS_ALLOWED_TABLES = [
  "customers",
  "service_orders",
  "partners",
  "leads",
  "invoices",
  "quotes",
  "contracts",
  "products",
  "companies",
] as const;
```

#### Arquivos a criar

| Arquivo                                     | Tipo      | Descrição                                                                 |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| `migrations/2026-04-XX_custom_fields.sql`   | Migration | Schema acima                                                              |
| `services/custom-fields.ts`                 | Service   | CRUD de definições + resolver de valores + merge com fields do CrudScreen |
| `hooks/use-custom-fields.ts`                | Hook      | `useCustomFields(table)` → retorna `CrudFieldConfig[]` extras para merge  |
| `app/(app)/Administrador/custom-fields.tsx` | Tela      | CrudScreen admin para gerenciar definições (filter by target_table)       |

#### Arquivos a modificar

| Arquivo                         | Mudança                                                                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/CrudScreen.tsx`  | No render, após `normalizedFormFields`, fazer merge com custom fields via hook. No `handleSave`, salvar custom fields via `saveCustomFieldValues()`. No `load`, buscar custom field values junto com items. |
| `core/modules/module-config.ts` | (Opcional) Criar módulo `custom_fields` ou incluir no core. Recomendação: incluir no core pois é capacidade fundamental de plataforma.                                                                      |

#### Arquitetura do merge (CrudScreen)

```typescript
// hooks/use-custom-fields.ts

export function useCustomFields(targetTable: string): {
  customFields: CrudFieldConfig<any>[];
  loading: boolean;
  saveValues: (
    targetId: string,
    values: Record<string, string>,
  ) => Promise<void>;
  loadValues: (
    targetIds: string[],
  ) => Promise<Record<string, Record<string, string>>>;
};

// Dentro do CrudScreen, o merge acontece assim:
// const schemaFields = convertTableInfoToFields(tableInfo);  // já existe
// const { customFields } = useCustomFields(tableName);       // novo
// const mergedFields = [...schemaFields, ...customFields];   // campos nativos + custom
```

#### Fluxo de dados

```
┌──────────────────────────────────────────────────────────┐
│ CrudScreen renderiza "customers"                         │
│                                                          │
│ 1. getTableInfo("customers") → colunas nativas           │
│ 2. useCustomFields("customers") → definições custom      │
│ 3. merge = [...nativeFields, ...customFields]            │
│ 4. Renderiza form com todos os campos                    │
│                                                          │
│ Ao salvar:                                               │
│ 5. api.post(CRUD_ENDPOINT, {action:"update", ...})       │
│    → atualiza colunas nativas                            │
│ 6. saveCustomFieldValues(customerId, customValues)        │
│    → upsert em custom_field_values                       │
│                                                          │
│ Ao listar:                                               │
│ 7. load items normalmente                                │
│ 8. loadCustomFieldValues(itemIds) → batch via "in"       │
│ 9. Merge values nos items para display                   │
└──────────────────────────────────────────────────────────┘
```

#### Critérios de aceitação

- [ ] Admin pode criar custom field para qualquer tabela da whitelist
- [ ] Custom fields aparecem no form do CrudScreen automaticamente
- [ ] Valores são persistidos e recuperados corretamente
- [ ] Exportação CSV (quando implementada) inclui custom fields
- [ ] Custom fields criados por pack têm `is_system=true` e não podem ser deletados pelo tenant
- [ ] Performance: batch load de values em 1 request por tabela (operador `in`)
- [ ] `showWhen` condicional funciona entre custom fields e campos nativos

**Estimativa:** 2–3 semanas  
**Dependências:** Nenhuma  
**Risco:** Baixo — padrão JSONB já validado na plataforma

---

### A.2 Pack Export (tenant → pack) ✅ IMPLEMENTADO

> **Status:** Implementado em Março 2026.

**Objetivo:** Permitir que um tenant exporte suas configurações como um Template Pack reutilizável — o inverso do `applyTemplatePack()`.

**Camada afetada:** Solution

**Reuso de componentes existentes:**

- `applyTemplatePack()` em `services/template-packs.ts` (16 steps) define a ordem e as tabelas
- `TemplatePack` type em `data/template-packs/types.ts` define a estrutura exata do output
- `ref_key` pattern já existe para cross-referencing entre entidades

#### Arquitetura do export

O export é o **inverso exato** do apply. Onde `applyTemplatePack` lê ref_keys e cria UUIDs, o export lê UUIDs e gera ref_keys.

```
APPLY:  Pack JSON → ref_key → UUID → INSERT no banco
EXPORT: SELECT do banco → UUID → ref_key → Pack JSON
```

#### Tabelas exportadas (mesma ordem do apply, invertida para leitura)

```typescript
const EXPORT_ORDER = [
  "service_categories",
  "workflow_templates",
  "workflow_steps",
  "workflow_step_transitions",
  "service_types",
  "deadline_rules",
  "step_forms",
  "step_task_templates",
  "roles",
  "role_permissions",
  "document_templates",
  "custom_field_definitions", // NOVO (de A.1)
] as const;
```

#### Algoritmo de geração de ref_keys

```typescript
function generateRefKey(
  table: string,
  record: Record<string, unknown>,
): string {
  // Prioridade: slug > name > title > key > id (últimos 8 chars)
  const slug = record.slug ?? record.name ?? record.title ?? record.key;
  if (slug) {
    return `${table}_${slugify(String(slug))}`;
  }
  return `${table}_${String(record.id).slice(-8)}`;
}
```

#### Resolução de referências UUID → ref_key

```typescript
// Ao exportar, precisamos trocar UUIDs por ref_keys em FKs
// Ex: workflow_steps.workflow_template_id (UUID) → workflow_template_ref_key

interface RefMap {
  // table → id → ref_key
  [table: string]: Map<string, string>;
}

function buildExportRefMap(exportedData: Record<string, any[]>): RefMap {
  const refMap: RefMap = {};
  for (const [table, records] of Object.entries(exportedData)) {
    refMap[table] = new Map();
    for (const record of records) {
      const refKey = generateRefKey(table, record);
      refMap[table].set(String(record.id), refKey);
    }
  }
  return refMap;
}
```

#### Arquivos a criar

| Arquivo                                   | Tipo    | Descrição                                                   |
| ----------------------------------------- | ------- | ----------------------------------------------------------- |
| `services/pack-export.ts`                 | Service | `exportTenantAsPack(tenantId, options)` → `TemplatePack`    |
| `app/(app)/Administrador/pack-export.tsx` | Tela    | UI para selecionar o que exportar + preview + download JSON |

#### Arquivos a modificar

| Arquivo                        | Mudança                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `data/template-packs/types.ts` | Adicionar campo `custom_fields?: CustomFieldDefinition[]` ao type `TemplatePack` |
| `services/template-packs.ts`   | Step 17 no apply: criar `custom_field_definitions` do pack com `is_system=true`  |

#### Interface do serviço

```typescript
// services/pack-export.ts

export interface PackExportOptions {
  /** Nome do pack a ser gerado */
  name: string;
  /** Slug único (para registro) */
  slug: string;
  /** Descrição */
  description: string;
  /** Ícone */
  icon: string;
  /** O que incluir no export */
  include: {
    service_categories: boolean;
    service_types: boolean;
    workflows: boolean;          // templates + steps + transitions
    deadline_rules: boolean;
    step_forms: boolean;
    step_task_templates: boolean;
    roles: boolean;
    document_templates: boolean;
    custom_fields: boolean;       // de A.1
  };
  /** Filtrar por categorias específicas (null = todas) */
  categoryFilter?: string[];
  /** Filtrar por workflows específicos (null = todos) */
  workflowFilter?: string[];
}

export async function exportTenantAsPack(
  tenantId: string,
  options: PackExportOptions,
): Promise<TemplatePack> { ... }

export async function downloadPackAsJson(pack: TemplatePack): Promise<void> {
  // Web: Blob download   |   Native: expo-file-system + expo-sharing
  // Reutiliza padrão de shareCsvFile() do accounting-export.ts
}
```

#### Fluxo da tela de export

```
┌──────────────────────────────────────────────┐
│ Pack Export                                    │
│                                                │
│ Nome:        [Meu Pack de Advocacia__________] │
│ Slug:        [meu-pack-advocacia_____________] │
│ Descrição:   [Pack completo para...__________] │
│                                                │
│ ☑ Categorias de Serviço (3 encontradas)       │
│ ☑ Tipos de Serviço (8 encontrados)            │
│ ☑ Workflows + Steps (3 workflows, 14 steps)   │
│ ☑ Regras de Prazo (6 encontradas)             │
│ ☑ Formulários de Step (4 encontrados)         │
│ ☑ Templates de Documento (2 encontrados)      │
│ ☑ Custom Fields (5 definições)                │
│ ☐ Roles (não incluir)                         │
│                                                │
│ Preview:                                       │
│ { "name": "Meu Pack de Advocacia",            │
│   "slug": "meu-pack-advocacia",               │
│   "service_categories": [...],                 │
│   ...                                          │
│ }                                              │
│                                                │
│ [Exportar JSON]  [Publicar no Marketplace →]  │
└──────────────────────────────────────────────┘
```

#### Critérios de aceitação

- [x] Export gera `TemplatePack` válido que passa em `validatePack()`
- [x] Ref_keys são determinísticos (mesmo dados → mesmo ref_key)
- [x] FKs entre entidades são resolvidas para ref_keys (não UUIDs)
- [x] Pack exportado pode ser aplicado em outro tenant via `applyTemplatePack()`
- [x] Custom fields (de A.1) são incluídos no export quando selecionados
- [x] JSON gerado é downloadable (web + mobile)
- [x] Preview mostra contagem de entidades antes de exportar

#### Arquivos criados/modificados

| Arquivo                                   | Tipo       | Descrição                                                                 |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `services/pack-export.ts`                 | Criado     | ~957 linhas — exportTenantAsPack, countTenantEntities, downloadPackAsJson |
| `app/(app)/Administrador/pack-export.tsx` | Criado     | Tela admin com metadados, toggles por entidade, contagens, validação      |
| `data/template-packs/types.ts`            | Modificado | PackCustomFieldDefinition type + custom_fields? no TemplatePack           |
| `services/template-packs.ts`              | Modificado | Step 17 (custom_fields apply) + validatePack atualizado                   |
| `core/admin/admin-pages.ts`               | Modificado | Registro da página pack_export                                            |
| `core/admin/admin-modules.ts`             | Modificado | pack_export no módulo configuracoes                                       |

#### Conceito: Tenant Modelo (previsto para A.4)

Durante a implementação de A.2, surgiu a questão arquitetural de diferenciar **Tenants Modelo** (usados exclusivamente para criar packs) de **Tenants Operacionais** (usados no dia-a-dia). A decisão foi:

- **A.2:** Export funciona em qualquer tenant — não requer flag especial
- **A.4 (Builder Portal):** Introduzirá `tenants.is_model_tenant` (boolean) para distinguir tenants-modelo de operacionais. Tenants-modelo não contam para billing, aparecem em seção separada no admin, e são otimizados para o workflow de criação de packs.

**Estimativa:** 2 semanas ✅ (concluído)  
**Dependências:** A.1 (para incluir custom fields no export) ✅  
**Risco:** Baixo — é o inverso de lógica já existente e validada

---

### A.3 API Pública REST v1 ✅ IMPLEMENTADO

**Status:** ✅ Implementado — Abril 2026

**Objetivo:** Expor endpoints documentados para que terceiros (builders, integradores) possam ler e escrever dados via API autenticada, com rate limiting e scoped tokens.

**Camada afetada:** Core

**Documentação completa:** [docs/API_REFERENCE.md](./API_REFERENCE.md)

**Reuso de componentes existentes:**

- `workers/api-crud/src/index.ts` já tem router completo com 28 endpoints
- `sql-builder.ts` já gera queries seguras com `validateIdentifier()`
- Auth JWT já funciona com `{ sub, tenant_id, role }`
- `workers/api-crud/src/types.ts` já tem `Env` interface

#### Diferença: API Interna vs API Pública

| Aspecto    | API Interna (atual)                     | API Pública (v1)                                   |
| ---------- | --------------------------------------- | -------------------------------------------------- |
| Auth       | JWT (user session) + X-Api-Key (system) | API Keys com escopos por tenant                    |
| Rate limit | IP-based simples (auth endpoints)       | Tier-based por API key                             |
| Formato    | `action` + `table` como body fields     | RESTful: `GET /v1/customers`, `POST /v1/customers` |
| Docs       | Nenhuma                                 | OpenAPI/Swagger auto-gerado                        |
| Tabelas    | Qualquer tabela (trusted client)        | Whitelist configurável por tenant                  |
| Filtros    | `search_field1..8` (complexo)           | Query params: `?status=active&sort=-created_at`    |

#### Database Schema

```sql
-- Migration: 2026-04-XX_api_keys.sql

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,                    -- "Integração Omie", "Webhook ERP"
    key_hash VARCHAR(255) NOT NULL,                -- bcrypt hash do key (nunca armazenar plaintext)
    key_prefix VARCHAR(12) NOT NULL,               -- "rk_live_abc1" para identificação visual
    environment VARCHAR(10) NOT NULL DEFAULT 'live', -- 'live' | 'test'
    scopes JSONB NOT NULL DEFAULT '["read"]',      -- ["read", "write", "delete"]
    allowed_tables JSONB DEFAULT '[]',             -- [] = todas permitidas, ["customers","invoices"]
    rate_limit_per_minute INTEGER DEFAULT 60,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,                        -- null = never expires
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(key_prefix)
);

-- Rate limiting tracker (in-memory is better but DB fallback for multi-region)
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id),
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER DEFAULT 1,
    UNIQUE(api_key_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(api_key_id, window_start);
```

#### Formato do API Key

```
rk_live_<40-random-chars>
│  │     │
│  │     └─ 40 chars random (crypto.getRandomValues)
│  └─ environment (live/test)
└─ prefix "rk" (radul key)
```

- Apenas o hash bcrypt é armazenado
- `key_prefix` (primeiros 12 chars) é armazenado plain para identificação
- O key completo é mostrado APENAS no momento da criação

#### Endpoints da API Pública

Prefixo: `/v1/` — coexiste com endpoints internos existentes.

```
GET     /v1/{table}              → List (com paginação + filtros query param)
GET     /v1/{table}/:id          → Get one
POST    /v1/{table}              → Create
PUT     /v1/{table}/:id          → Update
DELETE  /v1/{table}/:id          → Soft delete

GET     /v1/{table}/count        → Count
GET     /v1/{table}/schema       → Column info (para builders)

POST    /v1/webhooks             → Register webhook
DELETE  /v1/webhooks/:id         → Remove webhook
GET     /v1/webhooks             → List registered webhooks
```

#### Query Params (filtros REST-friendly)

```
GET /v1/customers?status=active&city=São Paulo&sort=-created_at&limit=20&offset=0

Internamente traduzido para:
buildSearchParams([
  { field: "status", value: "active" },
  { field: "city", value: "São Paulo" },
], { sortColumn: "created_at DESC", limit: 20, offset: 0 })
```

**Operadores via sufixo:**

```
?amount_gte=100          → { field: "amount", value: "100", operator: "gte" }
?name_ilike=%advocacia%  → { field: "name", value: "%advocacia%", operator: "ilike" }
?status_in=active,pending → { field: "status", value: "active,pending", operator: "in" }
?deleted_at_is_null=true → { field: "deleted_at", operator: "is_null" }
```

#### Arquivos a criar

| Arquivo                                | Tipo          | Descrição                                      |
| -------------------------------------- | ------------- | ---------------------------------------------- |
| `migrations/2026-04-XX_api_keys.sql`   | Migration     | Schema de api_keys + rate_limits               |
| `workers/api-crud/src/public-api.ts`   | Worker module | Router v1 + query param parser + rate limiter  |
| `workers/api-crud/src/api-key-auth.ts` | Worker module | Autenticação via API key + scope validation    |
| `services/api-keys.ts`                 | Service       | CRUD de api_keys + geração de keys             |
| `app/(app)/Administrador/api-keys.tsx` | Tela          | CrudScreen admin para criar/gerenciar API keys |
| `docs/API_REFERENCE.md`                | Docs          | Documentação da API pública v1                 |

#### Arquivos a modificar

| Arquivo                         | Mudança                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `workers/api-crud/src/index.ts` | Adicionar rota `/v1/*` → `handlePublicApi()` no `fetch()` switch |
| `workers/api-crud/src/types.ts` | Adicionar tipos `ApiKeyRecord`, `PublicApiContext`               |

#### Flow de autenticação pública

```
Request: GET /v1/customers
Header: Authorization: Bearer rk_live_aBcD...

1. Extrair key do header
2. Buscar api_keys WHERE key_prefix = 'rk_live_aBcD'
3. Verificar bcrypt(full_key, key_hash)
4. Checar: !deleted_at, !expires_at ou expires_at > now()
5. Checar rate limit: request_count < rate_limit_per_minute
6. Checar scope: "read" ∈ scopes
7. Checar table: "customers" ∈ allowed_tables (ou [] = all)
8. Executar query com tenant_id do api_key → isolation automática
9. Retornar JSON com standard envelope
```

#### Response envelope padrão

```json
{
  "data": [...],
  "meta": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

Erros:

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Try again in 45 seconds.",
    "retry_after": 45
  }
}
```

#### Critérios de aceitação

- [x] API key pode ser criada/revogada via admin CrudScreen
- [x] Keys são HMAC-SHA256-hashed (nunca plain-text no banco) — mais rápido que bcrypt para Cloudflare Workers
- [x] Key completo mostrado APENAS na criação, depois só prefix
- [x] Rate limiting funciona (default 60 req/min por key) — via Cloudflare KV, fail-open strategy
- [x] Scopes (read/write/delete) são validados por request
- [x] `allowed_tables` whitelist é respeitada — 3-step: FORBIDDEN → explicit → DEFAULT_ALLOWED (37 tables)
- [x] Tenant isolation automática (queries sempre filtradas por `tenant_id` do key)
- [x] Paginação via `limit` + `offset` com `has_more` flag
- [x] Filtros query param via double-underscore operators (`?field__gte=100`)
- [x] `/v1/{table}/schema` retorna colunas + tipos + FK detection (para builders)
- [x] CORS permite `*` nos endpoints v1 (API pública)
- [ ] Soft delete via `DELETE` (não hard delete) — v1.1 (write endpoints)

**Notas de implementação:**

- Hash: HMAC-SHA256 via Web Crypto API (nativo no Cloudflare Workers, <1ms vs bcrypt ~100ms)
- Rate limiting: Cloudflare KV (fail-open strategy — se KV falha, permite request)
- Webhooks: Deferido para v1.1
- Scope MVP: Read-only first (list, get, count, schema). Write/delete retornam 501 NOT_IMPLEMENTED.
- Key format: `rk_{live|test}_{40 hex chars}`, prefix 16 chars para lookup no DB
- Filtros: Operadores via sufixo duplo underscore (`__gte`, `__ilike`, `__in`, etc.)
- Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After
- Tabelas: DEFAULT_ALLOWED_TABLES (37 business tables), FORBIDDEN_TABLES (15 system tables)

**Estimativa:** 3–4 semanas → ✅ Concluído em ~2 semanas  
**Dependências:** Nenhuma  
**Risco:** Médio — mitigado com HMAC-SHA256, rate limiting KV, scope validation, table whitelist

**Arquivos criados/modificados:**

| Arquivo                                | Status                  | Descrição                                                         |
| -------------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| `migrations/2026-04-15_api_keys.sql`   | ✅ Criado               | Schema de api_keys (sem api_rate_limits — usa KV)                 |
| `workers/api-crud/src/api-key-auth.ts` | ✅ Criado (~507 linhas) | Auth HMAC-SHA256 + scope + table validation + rate limit KV       |
| `workers/api-crud/src/public-api.ts`   | ✅ Criado (~586 linhas) | Router /v1/\* + query parser + 5 endpoints read-only              |
| `workers/api-crud/src/index.ts`        | ✅ Modificado           | Rota /v1/\* + /api-keys + handleApiKeyCreate                      |
| `workers/api-crud/src/types.ts`        | ✅ Modificado           | ApiKeyRecord, PublicApiContext, PublicApiResponse, PublicApiError |
| `workers/api-crud/wrangler.toml`       | ✅ Modificado           | KV binding RATE_LIMIT_KV                                          |
| `services/api-keys.ts`                 | ✅ Criado (~273 linhas) | Client service CRUD + helpers                                     |
| `app/(app)/Administrador/api-keys.tsx` | ✅ Criado (~500 linhas) | Admin CrudScreen + create modal + key reveal                      |
| `core/admin/admin-pages.ts`            | ✅ Modificado           | Entry api_keys no Sistema                                         |
| `core/admin/admin-modules.ts`          | ✅ Modificado           | api_keys no card configuracoes                                    |
| `docs/API_REFERENCE.md`                | ✅ Criado (~450 linhas) | Referência completa da API pública                                |

---

### A.4 Builder Portal (docs + SDK)

**Objetivo:** Criar a documentação e tooling para que builders possam entender, criar e publicar packs sem suporte direto.

**Camada afetada:** Solution

**Reuso de componentes existentes:**

- Content Pages (`app/(app)/Administrador/content-pages.tsx`) já tem CMS básico
- `data/template-packs/types.ts` já tem a especificação TypeScript completa
- `validatePack()` já valida ref_keys e integridade

#### O que compõe o Builder Portal

| Componente            | Formato                                                | Prioridade |
| --------------------- | ------------------------------------------------------ | ---------- |
| Pack Specification    | Markdown + TypeScript types publicados                 | P0         |
| Getting Started Guide | Markdown: "Crie seu primeiro pack em 30 min"           | P0         |
| API Reference         | Gerado do schema (A.3)                                 | P0         |
| Pack Validator (CLI)  | Script Node.js: `npx radul-validate-pack ./my-pack.ts` | P1         |
| Example Packs         | 3 packs de exemplo com complexidade crescente          | P1         |
| Video Tutorials       | 3 vídeos de 5-10 min                                   | P2         |

#### Arquivos a criar

| Arquivo                                   | Tipo    | Descrição                                                                             |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `docs/builder/PACK_SPECIFICATION.md`      | Docs    | Spec completa de TemplatePack + AgentTemplatePack com todos os campos e relationships |
| `docs/builder/GETTING_STARTED.md`         | Docs    | Tutorial passo-a-passo: criar pack → validar → aplicar → publicar                     |
| `docs/builder/API_REFERENCE.md`           | Docs    | Endpoints da API pública v1 com exemplos curl + JS                                    |
| `docs/builder/EXAMPLES.md`                | Docs    | 3 exemplos comentados (simples → médio → avançado)                                    |
| `scripts/validate-pack.ts`                | Script  | CLI validator: `npx ts-node scripts/validate-pack.ts ./my-pack.ts`                    |
| `data/template-packs/example-simple.ts`   | Exemplo | Pack mínimo: 1 categoria, 1 tipo, 1 workflow com 3 steps                              |
| `data/template-packs/example-medium.ts`   | Exemplo | Pack médio: 3 categorias, workflows com forms + deadlines                             |
| `data/template-packs/example-advanced.ts` | Exemplo | Pack completo: custom fields + agent pack + document templates                        |

#### Conteúdo do Getting Started

```markdown
# Construa seu primeiro Radul Pack

## O que é um Pack?

Um Pack é um pacote de dados pré-configurados que transforma a Radul
em uma solução vertical para um tipo específico de negócio.

## Passo 1 — Configure manualmente

Use a Radul normalmente: crie categorias, tipos de serviço,
workflows, custom fields. Configure tudo como seu cliente ideal
usaria.

## Passo 2 — Exporte como Pack

Vá em Administrador → Exportar Pack → selecione o que incluir
→ gere o JSON.

## Passo 3 — Valide

Execute: npx ts-node scripts/validate-pack.ts ./meu-pack.json

## Passo 4 — Publique

Vá em Marketplace → Publicar Pack → defina preço → envie para revisão.

## Passo 5 — Ganhe

Cada tenant que aplicar seu pack gera revenue share para você.
```

#### Critérios de aceitação

- [ ] Pack Specification cobre 100% dos campos de `TemplatePack` e `AgentTemplatePack`
- [ ] Getting Started pode ser seguido por alguém sem conhecimento do codebase
- [ ] Pack Validator roda offline e reporta todos os erros de integridade
- [ ] Example packs passam no validator e são aplicáveis em tenant limpo
- [ ] API Reference tem exemplos copy-paste funcionais

**Estimativa:** 1–2 semanas  
**Dependências:** A.2 (export), A.3 (API reference)  
**Risco:** Baixo — é documentação, não código de produção

---

### A.5 Pack Marketplace MVP

**Objetivo:** Tela browsável onde tenants podem descobrir, avaliar e aplicar packs de builders — indo além da seleção simples do onboarding.

**Camada afetada:** Solution

**Reuso de componentes existentes:**

- Onboarding Step 2 (`onboarding.tsx` lines ~500-700) já tem UI de seleção de pack
- `applyTemplatePack()` já aplica qualquer pack
- `PACKS` registry em `data/template-packs/index.ts` já cataloga packs disponíveis

#### Database Schema

```sql
-- Migration: 2026-05-XX_marketplace_packs.sql

CREATE TABLE IF NOT EXISTS marketplace_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    builder_id UUID NOT NULL REFERENCES users(id),   -- quem criou
    builder_tenant_id UUID REFERENCES tenants(id),    -- tenant do builder
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    long_description TEXT,                            -- markdown
    icon VARCHAR(50) DEFAULT '📦',
    category VARCHAR(50) NOT NULL,                    -- 'juridico','saude','comercio','consultoria','generico'
    tags JSONB DEFAULT '[]',                          -- ["advocacia","contratos","compliance"]
    pack_data JSONB NOT NULL,                         -- o TemplatePack serializado
    agent_pack_data JSONB,                            -- AgentTemplatePack opcional
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',      -- draft|pending_review|published|rejected|archived
    rejection_reason TEXT,
    pricing_type VARCHAR(20) NOT NULL DEFAULT 'free', -- free|one_time|monthly
    price_cents INTEGER DEFAULT 0,                    -- em centavos BRL
    download_count INTEGER DEFAULT 0,
    is_official BOOLEAN DEFAULT false,                -- packs do Radul
    preview_images JSONB DEFAULT '[]',                -- URLs de screenshots
    requirements JSONB DEFAULT '{}',                  -- { "modules": ["financial","crm"] }
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Registro de quem instalou qual pack
CREATE TABLE IF NOT EXISTS marketplace_installs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
    installed_version VARCHAR(20) NOT NULL,
    installed_by UUID REFERENCES users(id),
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    uninstalled_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',              -- active|uninstalled
    UNIQUE(tenant_id, pack_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_category ON marketplace_packs(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mp_status ON marketplace_packs(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mi_tenant ON marketplace_installs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mi_pack ON marketplace_installs(pack_id);
```

#### Evolução do onboarding

O onboarding Step 2 evolui de "seleção de pack estático" para "browse do marketplace":

```
ANTES: Lista estática de 6 packs (PACKS registry)
AGORA: Browse marketplace_packs WHERE status = 'published'
       + seção "Packs oficiais" (is_official=true)
       + seção "Packs da comunidade" (is_official=false)
       + filtro por categoria
       + preview antes de aplicar
```

#### Arquivos a criar

| Arquivo                                           | Tipo      | Descrição                                           |
| ------------------------------------------------- | --------- | --------------------------------------------------- |
| `migrations/2026-05-XX_marketplace_packs.sql`     | Migration | Schema acima                                        |
| `services/marketplace-packs.ts`                   | Service   | CRUD de packs + install/uninstall + publish flow    |
| `app/(app)/Administrador/marketplace.tsx`         | Tela      | Browse + filtros + preview + instalar pack          |
| `app/(app)/Administrador/marketplace-publish.tsx` | Tela      | Form para builder publicar pack (usa output do A.2) |
| `app/(app)/Administrador/marketplace-review.tsx`  | Tela      | (SuperAdmin) Aprovar/rejeitar packs pendentes       |

#### Arquivos a modificar

| Arquivo                               | Mudança                                                               |
| ------------------------------------- | --------------------------------------------------------------------- |
| `app/(app)/Usuario/onboarding.tsx`    | Step 2: trocar lista estática por query ao `marketplace_packs`        |
| `services/onboarding.ts`              | `runOnboarding`: ao aplicar pack, registrar em `marketplace_installs` |
| `core/navigation/admin-navigation.ts` | Adicionar "Marketplace" no menu admin                                 |

#### Interface do serviço

```typescript
// services/marketplace-packs.ts

/** Listar packs publicados com filtros */
export async function listPublishedPacks(filters?: {
  category?: string;
  search?: string;
  pricing_type?: "free" | "one_time" | "monthly";
  sort?: "popular" | "newest" | "name";
}): Promise<MarketplacePack[]>;

/** Obter detalhes de um pack */
export async function getPackDetails(packId: string): Promise<MarketplacePack>;

/** Instalar pack no tenant (chama applyTemplatePack internamente) */
export async function installPack(
  tenantId: string,
  packId: string,
  userId: string,
): Promise<void>;

/** Desinstalar pack do tenant (chama clearPackData internamente) */
export async function uninstallPack(
  tenantId: string,
  packId: string,
): Promise<void>;

/** Publicar pack (builder submete para review) */
export async function submitPackForReview(
  packData: TemplatePack,
  metadata: PackMetadata,
): Promise<MarketplacePack>;

/** Aprovar pack (SuperAdmin) */
export async function approveRejectPack(
  packId: string,
  decision: "published" | "rejected",
  reason?: string,
): Promise<void>;
```

#### Layout da tela Marketplace

```
┌──────────────────────────────────────────────────────────┐
│ 🏪 Marketplace                                          │
│ Encontre soluções prontas para o seu negócio             │
│                                                          │
│ [Todos] [Jurídico] [Saúde] [Comércio] [Consultoria]    │
│                                                          │
│ [🔍 Pesquisar packs...________________________]         │
│                                                          │
│ ── Packs Oficiais ──                                    │
│                                                          │
│ ┌────────┐ ┌────────┐ ┌────────┐                       │
│ │⚖️       │ │🏥       │ │🛒       │                       │
│ │Advocacia│ │Saúde   │ │Comércio │                       │
│ │Gratuito │ │Gratuito│ │Gratuito │                       │
│ │⬇ 23     │ │⬇ 15    │ │⬇ 8     │                       │
│ │★★★★☆   │ │★★★★★  │ │★★★☆☆   │                       │
│ └────────┘ └────────┘ └────────┘                       │
│                                                          │
│ ── Packs da Comunidade ──                               │
│                                                          │
│ ┌────────┐ ┌────────┐                                   │
│ │🏠       │ │📊       │                                   │
│ │Imobil.  │ │Contab.  │                                   │
│ │R$49/mês │ │R$99 1x  │                                   │
│ │⬇ 5      │ │⬇ 3      │                                   │
│ │por @joao│ │por @ana │                                   │
│ └────────┘ └────────┘                                   │
└──────────────────────────────────────────────────────────┘
```

#### Critérios de aceitação

- [ ] Tenant pode browsear packs por categoria + busca textual
- [ ] Preview do pack mostra: nome, descrição, entidades incluídas, módulos requeridos, preço
- [ ] Instalar pack chama `applyTemplatePack()` e registra em `marketplace_installs`
- [ ] Desinstalar pack chama `clearPackData()` e marca `uninstalled_at`
- [ ] Builder pode submeter pack para review (status: `pending_review`)
- [ ] SuperAdmin pode aprovar/rejeitar com motivo
- [ ] Packs oficiais (6 existentes) são migrados para `marketplace_packs` com `is_official=true`
- [ ] Onboarding Step 2 usa marketplace em vez de lista estática
- [ ] Download count incrementado a cada install

**Estimativa:** 3–4 semanas  
**Dependências:** A.2 (export gera o pack_data que é publicado)  
**Risco:** Médio — inclui mudança no onboarding flow (path crítico)

---

## Fase B — Builder Economy (Q3 2026)

> **Objetivo:** Primeiros packs pagos, revenue share e dashboard para builders.
> **Duração estimada:** 8–10 semanas
> **Pré-requisito:** Fase A completa (marketplace ativo, API pública, custom fields)

---

### B.1 Pack Pricing & Billing

**Objetivo:** Permitir que builders definam preço para seus packs e que tenants paguem para instalá-los. Reutilizar a infraestrutura de billing existente.

**Camada afetada:** Solution

**Reuso de componentes existentes:**

- `services/saas-billing.ts` já tem `subscribeToPlan()`, `confirmSeatPayment()`, invoices, payments
- `services/payment-gateway.ts` já tem interface `IPaymentGateway` com Asaas + MercadoPago + Mock
- `services/pix.ts` já gera BRCode + QR Code
- Tabelas `invoices`, `invoice_items`, `payments` já existem

#### Modelo de cobrança

| Tipo           | Fluxo                                          | Implementação                     |
| -------------- | ---------------------------------------------- | --------------------------------- |
| **Gratuito**   | Instala direto                                 | Nenhuma cobrança                  |
| **Único (R$)** | Gera invoice → PIX/cartão → confirma → instala | Reutiliza `invoices` + `payments` |

Acho que aqui, o mensal está na recorrencia do cliente pelos customers dele se ele indicar,
O que pode ser feito é vender suporte de horas para complementar o pack, mas dai o vendedor de packs pode criar esse servico dentro do seu proprio tenant

#### Modificações na tabela marketplace_packs (já criada em A.5)

```sql
-- Colunas já existem no schema de A.5:
-- pricing_type VARCHAR(20) DEFAULT 'free'     -- free|one_time|monthly
-- price_cents INTEGER DEFAULT 0               -- centavos BRL

-- Adicionar coluna para trial:
ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS
    trial_days INTEGER DEFAULT 0;  -- 0 = sem trial
```

#### Fluxo de compra

```
Tenant clica "Instalar" num pack pago
  → Gera invoice no tenant do RADUL (nota: receita é do Radul inicialmente)
     invoices.notes = { type: "marketplace_pack_purchase", pack_id, builder_id }
  → Mostra PIX QR code (ou cartão via gateway)
  → Webhook/confirmação de pagamento
  → installPack() é executado
  → marketplace_installs.status = 'active'
  → Para packs mensais: cria accounts_receivable com recorrência
```

#### Arquivos a criar

| Arquivo                    | Tipo    | Descrição                                                            |
| -------------------------- | ------- | -------------------------------------------------------------------- |
| `services/pack-billing.ts` | Service | `purchasePack()`, `processPackPayment()`, `cancelPackSubscription()` |

#### Arquivos a modificar

| Arquivo                                   | Mudança                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `services/marketplace-packs.ts`           | `installPack()` checa preço → se > 0, chama `purchasePack()` antes |
| `app/(app)/Administrador/marketplace.tsx` | Botão "Instalar" → se pago, mostra modal de pagamento              |

#### Critérios de aceitação

- [ ] Pack gratuito instala direto (sem pagamento)
- [ ] Pack pago (one_time) gera invoice + PIX → instala após pagamento
- [ ] Pack mensal gera invoice recorrente (mesmo padrão do SaaS billing)
- [ ] Trial: pack mensal com `trial_days > 0` → instala imediato, cobra após trial
- [ ] Cancelamento de pack mensal: marca `uninstalled_at` + cancela AR futuros

**Estimativa:** 2 semanas  
**Dependências:** A.5 (marketplace)  
**Risco:** Baixo — reutiliza 90% da infra de billing existente

---

### B.2 Revenue Share Engine

**Objetivo:** Distribuir receita automaticamente entre builder (criador do pack) e Radul a cada venda.

**Camada afetada:** Core

**Reuso de componentes existentes:**

- `services/channel-partners.ts` já tem `calculateMonthlyCommissions()`
- Tabela `partner_earnings` já tem modelo de ganhos por parceiro
- `PLAN_PRICES` hardcoded no channel-partners.ts (free=0, starter=99, etc.)

#### Database Schema

```sql
-- Migration: 2026-06-XX_revenue_share.sql

CREATE TABLE IF NOT EXISTS revenue_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Referências
    pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
    install_id UUID NOT NULL REFERENCES marketplace_installs(id),
    invoice_id UUID REFERENCES invoices(id),
    payment_id UUID REFERENCES payments(id),
    -- Valores
    gross_amount NUMERIC(12,2) NOT NULL,          -- valor total pago pelo tenant
    builder_share_percent NUMERIC(5,2) NOT NULL,  -- % do builder (default 70%)
    radul_share_percent NUMERIC(5,2) NOT NULL,    -- % da Radul (default 30%)
    builder_amount NUMERIC(12,2) NOT NULL,        -- gross * builder_percent
    radul_amount NUMERIC(12,2) NOT NULL,          -- gross * radul_percent
    -- Builder info
    builder_id UUID NOT NULL REFERENCES users(id),
    builder_tenant_id UUID REFERENCES tenants(id),
    -- Status
    status VARCHAR(20) DEFAULT 'pending',         -- pending|processed|paid
    paid_at TIMESTAMPTZ,
    payout_reference TEXT,                        -- ID do payout/transfer
    -- Timestamps
    period_start DATE,                            -- para packs mensais
    period_end DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_builder ON revenue_shares(builder_id);
CREATE INDEX IF NOT EXISTS idx_rs_pack ON revenue_shares(pack_id);
CREATE INDEX IF NOT EXISTS idx_rs_status ON revenue_shares(status);
```

#### Revenue share por tipo

| Tipo de pack         | Builder | Radul | Notas                          |
| -------------------- | ------- | ----- | ------------------------------ |
| Template Pack pago   | 70%     | 30%   | Padrão marketplace             |
| Agent Pack pago      | 70%     | 30%   | Inclui manutenção do agent     |
| Pack + implementação | 85%     | 15%   | Builder vende serviço agregado |

#### Fluxo

```
Pagamento confirmado (via webhook ou manual)
  → processPackPayment() detecta notes.type = "marketplace_pack_purchase"
  → Busca marketplace_packs → { price_cents, builder_id }
  → Calcula split: builder_amount = price * 0.70, radul_amount = price * 0.30
  → INSERT revenue_shares (status: 'pending')
  → Cron mensal: agrupa revenue_shares pending por builder
  → Gera payout (PIX para builder, usando pix_key do partner/user)
  → Marca status = 'paid'
```

#### Arquivos a criar

| Arquivo                                   | Tipo      | Descrição                                                                    |
| ----------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `migrations/2026-06-XX_revenue_share.sql` | Migration | Schema acima                                                                 |
| `services/revenue-share.ts`               | Service   | `calculateRevenueShare()`, `processMonthlyPayouts()`, `getBuilderEarnings()` |

#### Critérios de aceitação

- [ ] Revenue share é criado automaticamente a cada pagamento de pack
- [ ] Builder pode ver seus earnings acumulados (dashboard B.4)
- [ ] Split default 70/30 é configurável por pack no `marketplace_packs`
- [ ] Payout mensal via PIX (agrega todas as vendas do mês)
- [ ] Rastreabilidade: cada revenue_share tem link para invoice + payment + pack + install

**Estimativa:** 2 semanas  
**Dependências:** B.1 (pack billing)  
**Risco:** Médio — envolve dinheiro real; precisa de testes de aritmética rigorosos

---

### B.3 Pack Reviews & Ratings

**Objetivo:** Tenants avaliam packs instalados, gerando trust signals para o marketplace.

**Camada afetada:** Solution

**Reuso de componentes existentes:**

- Tabela `process_reviews` já tem modelo de review (rating 1–5, comment)
- Portal público `/p/review/:token` já tem UI de coleta de review

#### Database Schema

```sql
-- Migration: 2026-06-XX_pack_reviews.sql

CREATE TABLE IF NOT EXISTS pack_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
    install_id UUID NOT NULL REFERENCES marketplace_installs(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    reviewer_id UUID NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(255),
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT true,
    helpful_count INTEGER DEFAULT 0,
    builder_response TEXT,
    builder_responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(install_id, reviewer_id)  -- 1 review por install por user
);

CREATE INDEX IF NOT EXISTS idx_pr_pack ON pack_reviews(pack_id) WHERE deleted_at IS NULL;
```

#### Campos derivados em marketplace_packs

```sql
ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0;
ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
```

Recalculados via trigger ou cron após cada INSERT/UPDATE em `pack_reviews`.

#### Arquivos a criar

| Arquivo                                  | Tipo      | Descrição                                                 |
| ---------------------------------------- | --------- | --------------------------------------------------------- |
| `migrations/2026-06-XX_pack_reviews.sql` | Migration | Schema acima                                              |
| `services/pack-reviews.ts`               | Service   | `submitReview()`, `getPackReviews()`, `respondToReview()` |

#### Critérios de aceitação

- [ ] Tenant pode avaliar pack (1–5 estrelas + comentário) somente se instalou
- [ ] Builder pode responder a reviews
- [ ] `average_rating` e `review_count` atualizados automaticamente
- [ ] Reviews exibidos na página de detalhe do pack no marketplace
- [ ] Sort marketplace por rating é possível

**Estimativa:** 1 semana  
**Dependências:** A.5 (marketplace + installs)  
**Risco:** Baixo

---

### B.4 Builder Dashboard

**Objetivo:** Dashboard dedicado para builders verem vendas, earnings, reviews e métricas dos seus packs.

**Camada afetada:** Extension

**Reuso de componentes existentes:**

- Financial Dashboard (`app/(app)/Administrador/FinancialDashboard.tsx`) como padrão visual
- `aggregateCrud()` para KPIs
- CrudScreen para listagens

#### Tela principal

```
┌──────────────────────────────────────────────────────────┐
│ 🏗️ Builder Dashboard                                    │
│                                                          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │ Packs    │ │ Installs │ │ Receita  │ │ Rating   │   │
│ │ Ativos   │ │ Este mês │ │ Este mês │ │ Média    │   │
│ │    3     │ │    12    │ │ R$1.470  │ │  4.3 ★   │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                          │
│ ── Vendas Recentes ──                                   │
│ Pack Advocacia  │ Tenant XYZ │ R$49 │ há 2h            │
│ Pack Advocacia  │ Tenant ABC │ R$49 │ há 1 dia          │
│ Pack Saúde      │ Tenant DEF │ R$29 │ há 3 dias         │
│                                                          │
│ ── Reviews Recentes ──                                  │
│ ★★★★★ "Excelente, configurou tudo!" — Tenant XYZ       │
│ ★★★☆☆ "Faltam alguns workflows" — Tenant ABC           │
│                                                          │
│ ── Meus Packs ──                                        │
│ ⚖️ Advocacia Completa   │ v1.2.0 │ 23 installs │ 4.5★ │
│ 🏥 Saúde Básica          │ v1.0.0 │  8 installs │ 4.0★ │
│ 📊 Contabilidade Pro     │ draft  │  —          │  —   │
│                                                          │
│ [+ Criar Pack]  [📊 Relatórios]                         │
└──────────────────────────────────────────────────────────┘
```

#### Arquivos a criar

| Arquivo                                         | Tipo    | Descrição                                                     |
| ----------------------------------------------- | ------- | ------------------------------------------------------------- |
| `app/(app)/Administrador/builder-dashboard.tsx` | Tela    | Dashboard com KPIs + listagens                                |
| `services/builder-analytics.ts`                 | Service | `getBuilderStats()`, `getRecentSales()`, `getRecentReviews()` |

#### Critérios de aceitação

- [ ] KPIs: packs publicados, installs do mês, receita do mês, rating médio
- [ ] Lista de vendas recentes com tenant + valor + data
- [ ] Lista de reviews recentes com rating + comentário
- [ ] Lista de packs do builder com status + version + installs
- [ ] Link direto para "Criar Pack" (vai para pack-export)
- [ ] Acessível somente para users com role builder ou admin

**Estimativa:** 1.5 semanas  
**Dependências:** B.1 (billing), B.2 (revenue), B.3 (reviews)  
**Risco:** Baixo — é tela de leitura, sem escrita complexa

---

### B.5 Pack Versioning

**Objetivo:** Builders podem publicar novas versões dos seus packs. Tenants podem atualizar packs instalados.

**Camada afetada:** Solution

**Reuso de componentes existentes:**

- `marketplace_packs.version` já existe (default `1.0.0`)
- `marketplace_installs.installed_version` já registra a versão no momento do install

#### Database Schema

```sql
-- Migration: 2026-07-XX_pack_versioning.sql

CREATE TABLE IF NOT EXISTS marketplace_pack_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id UUID NOT NULL REFERENCES marketplace_packs(id),
    version VARCHAR(20) NOT NULL,                     -- semver: "1.0.0", "1.1.0"
    pack_data JSONB NOT NULL,                         -- snapshot do TemplatePack nesta versão
    agent_pack_data JSONB,                            -- snapshot do AgentTemplatePack
    changelog TEXT,                                   -- markdown: "O que mudou nesta versão"
    status VARCHAR(20) DEFAULT 'published',           -- draft|published|deprecated
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pack_id, version)
);

CREATE INDEX IF NOT EXISTS idx_mpv_pack ON marketplace_pack_versions(pack_id);
```

#### Fluxo de update

```
Builder publica v1.1.0:
  → INSERT marketplace_pack_versions (pack_id, version, pack_data, changelog)
  → UPDATE marketplace_packs SET version = '1.1.0', pack_data = <novo>

Tenant vê badge "Atualização disponível" no marketplace:
  → Mostra changelog
  → Botão "Atualizar para v1.1.0"
  → clearPackData() do pack antigo (soft-delete entidades criadas pelo pack)
  → applyTemplatePack() com pack_data da nova versão
  → UPDATE marketplace_installs SET installed_version = '1.1.0'
```

#### Arquivos a criar

| Arquivo                                     | Tipo      | Descrição                                                               |
| ------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| `migrations/2026-07-XX_pack_versioning.sql` | Migration | Schema acima                                                            |
| `services/pack-versioning.ts`               | Service   | `publishNewVersion()`, `getAvailableUpdates()`, `updateInstalledPack()` |

#### Arquivos a modificar

| Arquivo                                   | Mudança                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `app/(app)/Administrador/marketplace.tsx` | Badge "Update available" nos packs com versão > installed_version |
| `services/marketplace-packs.ts`           | `installPack()` registra version no `marketplace_installs`        |

#### Critérios de aceitação

- [ ] Builder pode publicar nova versão com changelog
- [ ] Versões anteriores são preservadas (snapshot em `pack_data`)
- [ ] Tenant vê "Atualização disponível" quando existe versão mais nova
- [ ] Update faz clear + re-apply (preservando dados do tenant que não são do pack)
- [ ] Rollback: tenant pode voltar para versão anterior

**Estimativa:** 2 semanas  
**Dependências:** A.5 (marketplace + installs)  
**Risco:** Médio — o clear + re-apply precisa preservar dados do tenant (customer records, etc.)

---

## Fase C — Ecosystem Scale (Q4 2026)

> **Objetivo:** Flywheel começa a girar — builders criam, tenants consomem, receita cresce.
> **Duração estimada:** 10–12 semanas
> **Pré-requisito:** Fases A e B completas (marketplace com billing e versioning)

---

### C.1 Visual Workflow Builder

**Objetivo:** Editor visual drag-and-drop para criar workflow_templates + steps + transitions sem escrever código ou usar CrudScreen.

**Camada afetada:** Extension

**Reuso de componentes existentes:**

- Tabelas `workflow_templates`, `workflow_steps`, `workflow_step_transitions` já existem
- `step_forms`, `step_task_templates`, `deadline_rules` já são configuráveis
- Workflow Engine já executa qualquer workflow criado via dados

#### Abordagem: Canvas com nós e conexões

**Não é** um editor de código. É um editor visual onde:

- **Nós** = `workflow_steps` (etapa: nome, cor, SLA, formulário, tasks)
- **Conexões** = `workflow_step_transitions` (de step_A para step_B, com condição opcional)
- **Canvas** = layout visual com posições X/Y salvas em `config JSONB` do step

```
┌──────────────────────────────────────────────────────────┐
│ 🔧 Workflow Builder — "Processo de Cobrança"    [Salvar] │
│                                                          │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐           │
│  │ 📋       │────→│ 📞       │────→│ 📄       │           │
│  │ Análise  │     │ Contato  │     │ Acordo   │           │
│  │ Crédito  │     │ Devedor  │     │          │           │
│  │ SLA: 2d  │     │ SLA: 5d  │     │ SLA: 3d  │           │
│  └─────────┘     └─────────┘     └──┬──────┘           │
│                                      │                   │
│                                      ├────→ ✅ Quitado   │
│                                      │                   │
│                                      └────→ ⚠️ Protesto  │
│                                                          │
│ [+ Adicionar Step]  [Zoom: 100%]  [Grid: On]           │
│                                                          │
│ ── Propriedades do Step Selecionado ──                  │
│ Nome:     [Contato Devedor_____]                        │
│ Cor:      [🔵 Azul      ▾]                              │
│ SLA:      [5] dias                                      │
│ Form:     [Selecionar formulário ▾]                     │
│ Tasks:    [+ Adicionar task automática]                  │
│ Transições: → Acordo  │  → Protesto                    │
└──────────────────────────────────────────────────────────┘
```

#### Tecnologia

| Componente       | Opção recomendada                                | Justificativa                          |
| ---------------- | ------------------------------------------------ | -------------------------------------- |
| Canvas (web)     | `reactflow` (MIT, 17K stars)                     | Líder para node-based editors em React |
| Canvas (mobile)  | Fallback para lista de steps + transition picker | Reactflow não roda em RN               |
| State management | Local state + save para banco                    | Consistente com padrão CrudScreen      |

#### Dados salvos

```typescript
// Cada step ganha posição visual no config JSONB
workflow_steps.config = {
  ...existingConfig,
  builder_position: { x: 200, y: 350 },
  builder_color: "#2563eb",
};

// O workflow template ganha metadata do builder
workflow_templates.config = {
  ...existingConfig,
  builder_layout: "horizontal", // horizontal|vertical|free
  builder_zoom: 1.0,
};
```

#### Arquivos a criar

| Arquivo                                        | Tipo       | Descrição                                                |
| ---------------------------------------------- | ---------- | -------------------------------------------------------- |
| `components/ui/WorkflowCanvas.tsx`             | Componente | Canvas visual com reactflow (web)                        |
| `components/ui/WorkflowCanvasMobile.tsx`       | Componente | Fallback mobile: lista + transitions                     |
| `app/(app)/Administrador/workflow-builder.tsx` | Tela       | Tela do builder com canvas + painel de propriedades      |
| `services/workflow-builder.ts`                 | Service    | `saveWorkflow()`, `loadWorkflow()`, `validateWorkflow()` |

#### Critérios de aceitação

- [ ] Drag-and-drop de steps no canvas (web)
- [ ] Criar conexões entre steps arrastando
- [ ] Painel de propriedades para step selecionado (nome, cor, SLA, form, tasks)
- [ ] Salvar layout gera registros em workflow_templates + steps + transitions
- [ ] Workflow criado visualmente é executável pelo workflow engine existente
- [ ] Mobile tem fallback funcional (lista + selects)
- [ ] Validação: workflow precisa ter pelo menos 1 step + 1 transition + step final

**Estimativa:** 4–5 semanas  
**Dependências:** Nenhuma técnica (mas builders precisam da fase A/B para publicar workflows como parte de packs)  
**Risco:** Alto — UX de editor visual é complexa; reactflow integration com Expo web precisa ser validada

---

### C.2 No-code Pack Creator

**Objetivo:** Interface guiada para criar Template Packs completos sem escrever TypeScript — para consultores e não-devs.

**Camada afetada:** Solution

**Reuso de componentes existentes:**

- Pack Export (A.2) gera o JSON a partir das configurações do tenant
- Visual Workflow Builder (C.1) para criar workflows visualmente
- Custom Fields (A.1) para definir campos customizados
- Marketplace publish (A.5) para publicar

#### Abordagem: Wizard de 5 steps

Em vez de "construir pack do zero", o no-code creator **guia o builder** para configurar um tenant e depois exportar:

```
Step 1: Identidade do Pack
  → Nome, slug, descrição, categoria, ícone, preço

Step 2: Categorias & Tipos de Serviço
  → CrudScreen inline para criar categorias e tipos
  → Cada tipo vira um item do pack

Step 3: Workflows
  → Visual Workflow Builder (C.1) inline
  → Cada workflow vira parte do pack

Step 4: Custom Fields
  → Definir campos extras por tabela (A.1)
  → Viram custom_field_definitions no pack

Step 5: Preview & Publicar
  → Mostra preview do pack completo (JSON formatado)
  → Valida com validatePack()
  → Publica direto no marketplace (A.5)
```

#### Arquivos a criar

| Arquivo                                    | Tipo    | Descrição                                                                  |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------- |
| `app/(app)/Administrador/pack-creator.tsx` | Tela    | Wizard 5-step com sub-componentes inline                                   |
| `services/pack-creator.ts`                 | Service | Orquestra criação: temporary tenant sandbox → configure → export → publish |

#### Critérios de aceitação

- [ ] Builder pode criar pack completo sem sair do wizard
- [ ] Cada step tem preview contínuo do pack sendo construído
- [ ] Validação automática em tempo real
- [ ] Publicação direto para marketplace ao final
- [ ] Builder pode salvar rascunho e continuar depois

**Estimativa:** 3–4 semanas  
**Dependências:** A.1 (custom fields), A.2 (export), A.5 (marketplace), C.1 (workflow builder)  
**Risco:** Médio — precisa orquestrar muitos sub-componentes num wizard coerente

---

### C.3 Marketplace Discovery

> **Status:** Implementação inicial concluída em **04/03/2026** (filtros, destaque, recomendação por módulos e persistência de sort).

**Objetivo:** Search avançado, categorias hierárquicas, packs em destaque, recomendações baseadas no perfil do tenant.

**Camada afetada:** Solution

**Reuso de componentes existentes:**

- GlobalSearch já tem busca de telas
- Marketplace MVP (A.5) já tem browse básico por categoria

#### Features

| Feature                 | Implementação                                                                 |
| ----------------------- | ----------------------------------------------------------------------------- |
| Full-text search        | `ilike` em name + description + tags (já suportado no api_crud)               |
| Categorias hierárquicas | `marketplace_packs.category` + `tags` JSONB para subcategorias                |
| Featured packs          | `marketplace_packs.is_featured BOOLEAN` (curado manualmente)                  |
| Recommended             | Based on tenant's active modules → sugerir packs que usam esses módulos       |
| Sort by                 | Popular (download_count), Newest (created_at), Rating (average_rating), Price |
| Filter by               | Price range, Rating minimum, Category, Free/Paid, Official/Community          |

#### Schema additions

```sql
ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE marketplace_packs ADD COLUMN IF NOT EXISTS featured_order INTEGER DEFAULT 0;
```

#### Critérios de aceitação

- [ ] Search retorna resultados relevantes por nome + descrição + tags
- [ ] Seção "Destaque" na home do marketplace
- [ ] Recomendações baseadas nos módulos ativos do tenant
- [ ] Todos os filtros combinam corretamente
- [ ] Sort persistente na sessão

#### Implementação inicial (04/03/2026)

- Service `services/marketplace-packs.ts` expandido com:
  - filtros combináveis (`isOfficial`, `onlyPaid`, `minRating`, faixa de preço)
  - novos sorts (`featured`, `price_asc`, `price_desc`)
  - normalização robusta de campos JSON (`tags`, `requirements`, `pack_data`)
  - recomendação por tenant via `tenant_modules` (`listRecommendedMarketplacePacks`)
- Tela `app/(app)/Administrador/marketplace.tsx` com:
  - seção **Em Destaque**
  - seção **Recomendados para seu Tenant**
  - filtros de discovery (origem, preço, nota mínima)
  - persistência do sort em `sessionStorage`
- Migration criada: `migrations/add-marketplace-discovery.sql`

**Estimativa:** 1.5 semanas  
**Dependências:** A.5 (marketplace)  
**Risco:** Baixo — incremento sobre o MVP

---

### C.4 Builder Certifications

**Objetivo:** Sistema de badges e certificações que aumentam trust no marketplace.

**Camada afetada:** Solution

#### Database Schema

```sql
CREATE TABLE IF NOT EXISTS builder_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    certification_type VARCHAR(50) NOT NULL,
    -- tipos: 'verified_builder', 'top_seller', 'radul_partner', 'expert'
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,                        -- null = permanent
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Certifications automáticas

| Badge               | Critério                            | Automático? |
| ------------------- | ----------------------------------- | ----------- |
| ✅ Verified Builder | Email verificado + 1 pack publicado | Sim         |
| ⭐ Top Seller       | > 50 installs total                 | Sim         |
| 🏆 Expert           | Rating médio > 4.5 em > 10 reviews  | Sim         |
| 🤝 Radul Partner    | Aprovação manual pela Radul         | Manual      |

**Estimativa:** 1 semana  
**Dependências:** A.5, B.3, B.4  
**Risco:** Baixo

---

### C.5 Cross-tenant Analytics

**Objetivo:** Dashboard analytics do marketplace para SuperAdmin e para builders individuais.

**Camada afetada:** Core

**Reuso de componentes existentes:**

- Metabase embeddado (já integrado via `services/metabase.ts`)
- `aggregateCrud()` para queries analíticas
- Financial Dashboard pattern para KPIs

#### Métricas disponíveis

| Para           | Métricas                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------- |
| **SuperAdmin** | Total packs, total installs, GMV marketplace, revenue share acumulado, top builders, churn de packs |
| **Builder**    | Installs/mês, revenue/mês, rating trend, reviews, retention por pack                                |
| **Tenant**     | Packs instalados, updates disponíveis, savings vs setup manual                                      |

#### Implementação

Metabase dashboards com queries SQL diretas nas tabelas `marketplace_packs`, `marketplace_installs`, `revenue_shares`, `pack_reviews`. Embeddados nas telas via `react-native-webview`.

**Estimativa:** 2 semanas  
**Dependências:** B.1–B.4  
**Risco:** Baixo — Metabase já está configurado

---

## Fase D — Platform Dominance (2027)

> **Objetivo:** Radul como default platform para negócios no Brasil.
> **Duração estimada:** 6+ meses (ongoing)
> **Pré-requisito:** Fases A–C completas, flywheel validado com primeiros builders ativos.

---

### D.1 Plugin System (JS/TS)

**Objetivo:** Permitir que builders criem extensões de UI e lógica com código JS/TS que rodam dentro da Radul sem forking do codebase.

**Camada afetada:** Core

#### Conceito

```
┌─────────────────────────────────────────────┐
│ Plugin = {                                   │
│   id: "my-custom-widget",                   │
│   type: "card_extension" | "field_type"      │
│         | "action_button" | "webhook_handler"│
│         | "dashboard_widget",               │
│   entry: "https://cdn.builder.com/plugin.js"│
│   permissions: ["read:customers"],           │
│   sandbox: true                              │
│ }                                            │
└─────────────────────────────────────────────┘
```

#### Tipos de plugin

| Tipo                | O que faz                                                | Runtime                     |
| ------------------- | -------------------------------------------------------- | --------------------------- |
| `card_extension`    | Renderiza widget extra dentro de CrudScreen cards        | iframe sandboxed            |
| `custom_field_type` | Novo tipo de campo no CrudScreen (ex: color picker, map) | React component lazy-loaded |
| `action_button`     | Botão custom em cards/header com handler serverless      | Worker endpoint             |
| `webhook_handler`   | Recebe webhooks e executa lógica                         | Cloudflare Worker           |
| `dashboard_widget`  | Widget no dashboard do tenant                            | iframe sandboxed            |

#### Segurança

- Plugins de UI rodam em `<iframe sandbox>` com PostMessage API
- Plugins serverless rodam em Cloudflare Workers isolados
- SDK define contract: `radul.getItems()`, `radul.updateItem()`, etc.
- Permissions declaradas no manifest, aprovadas pelo tenant

**Estimativa:** 8–12 semanas  
**Dependências:** A.3 (API pública como backend para plugins)

---

### D.2 White-label Completo

**Objetivo:** Tenant configura marca completa: logo, cores, fontes, domínio, emails — indistinguível de "plataforma própria".

**Camada afetada:** Core

**Reuso de componentes existentes:**

- `useTenantBranding()` já customiza auth screens
- Custom domains já funcionam via DNS worker
- `tenants.config.brand` já tem `{ name, primary_color }`

#### Extensões necessárias

```json
{
  "brand": {
    "name": "MinhaMarca",
    "primary_color": "#2563eb",
    "secondary_color": "#1e40af",
    "logo_url": "https://...",
    "favicon_url": "https://...",
    "font_family": "Inter",
    "email_from_name": "MinhaMarca",
    "email_from_address": "noreply@minhamarca.com.br",
    "footer_text": "© 2026 MinhaMarca",
    "hide_radul_badge": true,
    "custom_css": "/* overrides */"
  }
}
```

#### Critérios

- [ ] Toda tela respeita as cores do tenant (não apenas auth)
- [ ] Logo do tenant em header, sidebar, emails, PDFs
- [ ] Custom domain com SSL automático (Let's Encrypt via Cloudflare)
- [ ] Emails enviados com `from` do tenant (SPF/DKIM)
- [ ] Portal público sem menção à Radul

**Estimativa:** 3–4 semanas  
**Dependências:** Nenhuma técnica  
**Risco:** Médio — SPF/DKIM para custom email domains é complexo

---

### D.3 Partner Program

**Objetivo:** Programa formal com tiers, benefícios e SLA para builders profissionais.

**Camada afetada:** Solution

**Reuso:** `services/channel-partners.ts` (comissões, referral codes)

#### Tiers

| Tier           | Requisito                 | Benefícios                                          |
| -------------- | ------------------------- | --------------------------------------------------- |
| **Registered** | 1 pack publicado          | Profile no marketplace, basic analytics             |
| **Silver**     | 5+ installs, 4.0+ rating  | Revenue share 75% (vs 70%), priority review         |
| **Gold**       | 20+ installs, 4.5+ rating | Revenue share 80%, featured placement, co-marketing |
| **Platinum**   | 50+ installs, exclusivo   | Revenue share 85%, dedicated support, beta access   |

#### Implementação

- Tabela `builder_profiles` com tier + métricas + benefits
- Cron que recalcula tier mensalmente baseado em métricas
- Dashboard do partner program com progress bars

**Estimativa:** 2–3 semanas  
**Dependências:** B.2 (revenue share), B.3 (reviews), C.4 (certifications)

---

### D.4 International Expansion

**Objetivo:** Suportar múltiplos países, idiomas e moedas.

**Camada afetada:** Core

#### Componentes

| Componente       | Implementação                                                                |
| ---------------- | ---------------------------------------------------------------------------- |
| i18n             | `expo-localization` + `i18next` — strings externalizadas                     |
| Multi-currency   | `tenants.config.currency` (default BRL), formatadores por locale             |
| Timezone         | Already uses `America/Sao_Paulo` — generalize para `tenants.config.timezone` |
| Tax/fiscal       | Módulo por país (NFSe = BR, VAT = EU, etc.)                                  |
| Payment gateways | Stripe (international) via `IPaymentGateway` interface                       |

#### Primeiro mercado: Portugal / LATAM

- Idioma: pt-PT (90% compartilhado com pt-BR)
- Moeda: EUR
- Fiscal: Sem NFSe (mais simples)
- Gateway: Stripe (já internacional)

**Estimativa:** 6–8 semanas (i18n base) + ongoing per country  
**Dependências:** Nenhuma técnica bloqueante

---

### D.5 Radul Developer Conference

**Objetivo:** Evento anual (presencial + online) para builders, tenants e ecossistema.

**Camada afetada:** Ecosystem (não código)

#### Formato

- **Day 1:** Keynote + roadmap + demos de packs mais vendidos
- **Day 2:** Workshops (criar pack, usar API, visual workflow builder)
- **Day 3:** Hackathon (melhor pack criado em 24h ganha prize)

#### Outputs mensuráveis

- 50+ participantes no ano 1
- 10 packs criados durante o evento
- 5 novos builders ativos pós-evento

**Estimativa:** 2–3 meses de planejamento  
**Dependências:** Fases A–C completas (para ter o que ensinar)

---

## Grafo de Dependências

```
                    ┌──────┐
                    │ A.1  │ Custom Fields
                    │      │
                    └──┬───┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
         ┌──────┐          ┌──────┐
         │ A.2  │          │ A.3  │ API Pública
         │Export│          │      │
         └──┬───┘          └──┬───┘
            │                 │
            ├────────┐        │
            ▼        ▼        ▼
       ┌──────┐  ┌──────┐  ┌──────┐
       │ A.4  │  │ A.5  │  │ D.1  │ Plugin System
       │Docs  │  │ MVP  │  │      │ (futuro)
       └──────┘  └──┬───┘  └──────┘
                    │
         ┌──────────┼──────────┐
         ▼          ▼          ▼
    ┌──────┐   ┌──────┐   ┌──────┐
    │ B.1  │   │ B.3  │   │ B.5  │
    │Billing│   │Reviews│  │Version│
    └──┬───┘   └──┬───┘   └──────┘
       │          │
       ▼          ▼
    ┌──────┐   ┌──────┐
    │ B.2  │   │ B.4  │
    │Rev.Sh│   │Dashb.│
    └──┬───┘   └──────┘
       │
       ▼
    ┌──────┐
    │ D.3  │ Partner Program
    └──────┘

    ┌──────┐
    │ C.1  │ Visual Workflow Builder (independente)
    └──┬───┘
       │
       ▼
    ┌──────┐
    │ C.2  │ No-code Pack Creator
    └──────┘

    C.3 Marketplace Discovery ← A.5
    C.4 Builder Certifications ← B.3, B.4
    C.5 Cross-tenant Analytics ← B.1–B.4
    D.2 White-label ← (independente)
    D.4 International ← (independente)
```

### Caminho crítico

```
A.1 → A.2 → A.5 → B.1 → B.2 → D.3
                               ↑
A.3 ────────── (paralelo) ─────┘
```

**O que pode ser paralelizado:**

| Thread 1 (Platform Core) | Thread 2 (Builder Experience) | Thread 3 (Ecosystem)  |
| ------------------------ | ----------------------------- | --------------------- |
| A.1 Custom Fields        | A.3 API Pública               | A.4 Builder Docs      |
| A.2 Pack Export          | C.1 Visual Workflow Builder   | -                     |
| A.5 Marketplace MVP      | -                             | -                     |
| B.1 Pack Billing         | B.3 Pack Reviews              | B.4 Builder Dashboard |
| B.2 Revenue Share        | B.5 Pack Versioning           | C.4 Certifications    |

---

## Métricas de Validação por Fase

### Fase A — Fundação (Q2 2026)

| Métrica                           | Target                            | Como medir                                          |
| --------------------------------- | --------------------------------- | --------------------------------------------------- |
| Custom fields criados por tenants | > 20 definições                   | COUNT(`custom_field_definitions`)                   |
| Packs exportados                  | > 5                               | Logs de `exportTenantAsPack()`                      |
| API keys criadas                  | > 10                              | COUNT(`api_keys`)                                   |
| Packs no marketplace              | > 10 (6 oficiais + 4 de builders) | COUNT(`marketplace_packs` WHERE status='published') |
| Builder Portal page views         | > 100/mês                         | Plausible analytics                                 |

### Fase B — Builder Economy (Q3 2026)

| Métrica                      | Target    | Como medir                                         |
| ---------------------------- | --------- | -------------------------------------------------- |
| Packs pagos vendidos         | > 15      | COUNT(`marketplace_installs` WHERE pack.price > 0) |
| Revenue share distribuído    | > R$1.000 | SUM(`revenue_shares.builder_amount`)               |
| Reviews submetidos           | > 20      | COUNT(`pack_reviews`)                              |
| Builders com dashboard ativo | > 5       | Distinct users acessando builder-dashboard         |
| Pack updates publicados      | > 5       | COUNT(`marketplace_pack_versions`)                 |

### Fase C — Ecosystem Scale (Q4 2026)

| Métrica                              | Target    | Como medir                                               |
| ------------------------------------ | --------- | -------------------------------------------------------- |
| Workflows criados via Visual Builder | > 30      | Workflows com `config.builder_layout` preenchido         |
| Packs criados via No-code Creator    | > 10      | Packs com `created_via = 'no-code'`                      |
| Search queries/mês no marketplace    | > 500     | Analytics/logs                                           |
| Builders certificados                | > 10      | COUNT(`builder_certifications`)                          |
| GMV marketplace mensal               | > R$5.000 | SUM(`revenue_shares.gross_amount`) WHERE month = current |

### Fase D — Platform Dominance (2027)

| Métrica                     | Target | Como medir                                         |
| --------------------------- | ------ | -------------------------------------------------- |
| Plugins publicados          | > 5    | Plugin registry                                    |
| Tenants white-label ativos  | > 10   | Tenants com `config.brand.hide_radul_badge = true` |
| Builders no Partner Program | > 15   | COUNT(`builder_profiles`)                          |
| Países com tenants ativos   | > 2    | Distinct `tenants.config.currency` values          |
| Participantes na DevConf    | > 50   | Registros do evento                                |

---

## Resumo de Estimativas

| Fase       | Items   | Estimativa Total | Timeline          |
| ---------- | ------- | ---------------- | ----------------- |
| **Fase A** | A.1–A.5 | 11–15 semanas    | Q2 2026 (Abr–Jun) |
| **Fase B** | B.1–B.5 | 8.5–10.5 semanas | Q3 2026 (Jul–Set) |
| **Fase C** | C.1–C.5 | 10–14 semanas    | Q4 2026 (Out–Dez) |
| **Fase D** | D.1–D.5 | 20+ semanas      | 2027 (ongoing)    |

**Com paralelização (2 threads):**

| Fase       | Estimativa Paralelizada |
| ---------- | ----------------------- |
| **Fase A** | 6–8 semanas             |
| **Fase B** | 5–6 semanas             |
| **Fase C** | 6–8 semanas             |
| **Fase D** | 12+ semanas             |

---

_Roadmap detalhado — Março 2026 • Baseado na auditoria técnica completa do codebase (169 telas, 72 CrudScreens, 80+ tabelas, 55 migrations, 76 services, 28 API endpoints) e na estratégia definida em [RADUL_PLATFORM_EVOLUTION.md](RADUL_PLATFORM_EVOLUTION.md)_
