# Estudo: Prestadores de Serviço Externos dentro do Tenant

## 1. Objetivo e Contexto

### O que é

Um **prestador de serviço externo** é um profissional terceirizado (eletricista, encanador, técnico, pintor, etc.) que o tenant contrata para realizar serviços internos. Esse profissional precisa acessar telas específicas da plataforma com permissões definidas pelo tenant admin.

### O que NÃO é

| Conceito            | Prestador Externo (este estudo)         | Partner/Parceiro (sistema existente)       | Channel Partner (existente)  |
| ------------------- | --------------------------------------- | ------------------------------------------ | ---------------------------- |
| **Natureza**        | Terceirizado contratado pelo tenant     | Operador de campo permanente               | Revendedor/indicador do SaaS |
| **Vínculo**         | Temporário/por demanda                  | Fixo, com carteira de clientes             | Comercial, ganha comissão    |
| **Escopo de dados** | Vê tudo que a role permite (sem filtro) | Filtrado por `partner_id` → `customer_ids` | Sem acesso operacional       |
| **Tabela de link**  | `user_tenants` (role_id específico)     | `user_tenants` (partner_id + role_id)      | `channel_partners`           |

**Chave:** O sistema de parceiros (`usePartnerScope()`) filtra **dados** por parceiro. O prestador externo NÃO precisa de filtro de dados — ele vê tudo que suas permissões de tela permitem. É puramente **role-based access**.

---

## 2. Decisões de Design (Definidas pelo Product Owner)

| #   | Decisão                    | Resposta                                                                                                                         |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Escopo multi-tenant**    | Sim — mesmo CPF pode ser prestador em múltiplos tenants simultaneamente (leverage do modelo `user_tenants`)                      |
| 2   | **Billing**                | Conta como user do tenant, mas planos atuais não têm limite de users                                                             |
| 3   | **Pré-registro**           | Silencioso — admin adiciona CPF, sem notificação. Quando o prestador fizer login/registro, é automaticamente vinculado ao tenant |
| 4   | **Visibilidade de dados**  | Role-only — vê todos os dados nas telas permitidas, sem filtro tipo `partner_scope`                                              |
| 5   | **UX do admin**            | Wizard dedicado de 4 etapas: Nome do serviço → Permissões → CPFs → Confirmação                                                   |
| 6   | **Navegação do prestador** | Menu admin filtrado pelas permissões da role (sistema existente)                                                                 |
| 7   | **Gestão de CPFs**         | Tab/aba dentro da tela de roles para gerenciar CPFs vinculados                                                                   |
| 8   | **Revogação**              | Migrar prestador para user regular do tenant (mudar role para default), não deletar                                              |

---

## 3. Análise do Sistema Atual

### 3.1 Modelo de Dados Relevante

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│   users      │      │  user_tenants    │      │   roles     │
├─────────────┤      ├──────────────────┤      ├─────────────┤
│ id (PK)     │◄─────│ user_id (FK)     │      │ id (PK)     │
│ cpf         │      │ tenant_id (FK)   │─────►│ tenant_id   │
│ email       │      │ role_id (FK) ◄───│──────│ name        │
│ fullname    │      │ partner_id (FK)  │      │ created_at  │
│ role (TEXT) │      │ is_active (BOOL) │      │ deleted_at  │
│ tenant_id   │      │ created_at       │      └──────┬──────┘
│ role_id     │      │ deleted_at       │             │
│ partner_id  │      └──────────────────┘             │
└─────────────┘                                       │
                     ┌──────────────────┐      ┌──────┴───────┐
                     │ role_permissions │      │ permissions  │
                     ├──────────────────┤      ├──────────────┤
                     │ role_id (PK,FK)──│──────│ id (PK)      │
                     │ permission_id    │──────│ code (UNIQUE)│
                     │   (PK,FK)        │      │ description  │
                     │ deleted_at       │      └──────────────┘
                     └──────────────────┘
```

### 3.2 Sistema Dual de Autorização

O sistema tem DOIS mecanismos de autorização que operam **independentemente**:

| Aspecto            | `users.role` (Global)               | `user_tenants.role_id` (Per-Tenant)  |
| ------------------ | ----------------------------------- | ------------------------------------ |
| **Tipo**           | Campo TEXT livre                    | FK para tabela `roles`               |
| **Verificado por** | `isUserAdmin()`, `isUserOperator()` | `usePermissions()`, `ProtectedRoute` |
| **Escopo**         | App inteiro                         | Tenant específico                    |
| **Valores comuns** | "admin", "user", "parceiro"         | UUID de uma role do tenant           |

**Para prestadores externos:** `users.role = "user"` (global, sem poderes especiais) + `user_tenants.role_id = UUID da role de serviço` (permissões específicas no tenant).

### 3.3 Fluxo de Auto-Link Atual

```
Login/Registro (qualquer método)
       │
       ▼
tryAutoResolveTenant(userId, tenantContext)
       │
       ├── resolveTenantFromContext(hostname) → detecta tenant por domínio/subdomain
       │
       └── autoLinkUserToTenant(userId, tenantId, default_client_role)
              │
              ├── 1. Já existe user_tenants? → return (skip)
              ├── 2. Buscar roles do tenant → match por nome (exact > partial)
              ├── 3. Criar user_tenants (user_id, tenant_id, role_id, is_active=true)
              └── 4. Sync users.tenant_id e users.role_id
       │
       ▼
tryAutoLinkCompanies(userId, cpf)
       │
       ├── Buscar company_members com mesmo CPF e sem user_id
       └── Atualizar company_members.user_id = userId (link)
```

**Padrão chave:** `tryAutoLinkCompanies` já faz matching por CPF para vincular automaticamente. Este mesmo padrão pode ser estendido para prestadores de serviço.

### 3.4 Criação de Roles Existente

Três caminhos atuais:

1. **Onboarding** → `ensureDefaultRoles()` → cria Administrador, Cliente, Parceiro
2. **Template Pack** → roles específicas do pack (Advogado, Vendedor, etc.)
3. **Admin CrudScreen** → `roles.tsx` → criação manual + `assignDefaultPermissionsToRole()`

**`assignDefaultPermissionsToRole()`** usa matching fuzzy (`.includes()`) em presets:

- Nome contém "admin" → preset admin (~50+ permissions)
- Nome contém "manager"/"gestor" → preset manager (~26)
- Nome contém "parceiro"/"partner" → preset operador_parceiro (~22)
- Nome contém "client"/"cliente" → preset client (~16)
- **Nenhum match → ZERO permissões**

**Implicação positiva:** Nomes de serviço como "Eletricista", "Encanador" NÃO matcham nenhum preset → recebem zero permissões por padrão → correto porque o wizard define permissões explicitamente.

### 3.5 Navegação Filtrada por Permissões

```
PermissionsContext (4-step pipeline)
  ├── 1. Buscar user_tenants → extrair role_id
  ├── 2. Buscar role_permissions pelo role_id
  ├── 3. Buscar permissions por IDs
  └── 4. Montar Set<string> de códigos (e.g., "customers.view")

AppFooter
  ├── hasAnyPermission(ADMIN_PANEL_PERMISSIONS) → mostra tab "Admin"
  └── else → mostra tab "Atendimento"

admin-pages.ts
  ├── Filtra por módulos ativos (useTenantModules)
  ├── Filtra por superAdminOnly
  └── Filtra por requiredAnyPermissions → só mostra páginas permitidas

ProtectedRoute
  └── Wraps tela individual com check de permissão
```

**Resultado:** O prestador com role "Eletricista" verá automaticamente APENAS as telas cujas permissões foram atribuídas à role dele. Zero código novo necessário para filtragem de navegação.

---

## 4. Arquitetura Proposta

### 4.1 Mudanças no Banco de Dados

#### Nova Tabela: `service_provider_invites`

O desafio principal é: como vincular um CPF a uma role ANTES do usuário existir no sistema?

**`user_tenants` requer `user_id` (FK para `users`)** — não é possível criar um link sem o usuário. Precisamos de uma tabela intermediária para "convites pendentes":

```sql
CREATE TABLE service_provider_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    role_id UUID NOT NULL REFERENCES roles(id),
    cpf VARCHAR(11) NOT NULL,          -- CPF sem formatação (apenas dígitos)
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | linked | revoked
    invited_by UUID REFERENCES users(id),           -- admin que adicionou
    linked_user_id UUID REFERENCES users(id),       -- preenchido após auto-link
    linked_at TIMESTAMP,                            -- quando foi vinculado
    notes TEXT,                                     -- observações opcionais
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    UNIQUE(tenant_id, role_id, cpf)     -- mesmo CPF não pode ter 2 convites para mesma role
);
```

**Por que uma tabela separada em vez de estender `user_tenants`?**

| Abordagem                         | Prós                                                                                    | Contras                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Tabela separada** (recomendado) | Sem impacto na auth existente, auditoria clara, status lifecycle próprio, query simples | Mais uma tabela                                                                                                    |
| **Estender `user_tenants`**       | Menos tabelas                                                                           | `user_id` é NOT NULL conceptualmente, precisaria mudar para nullable em todo o sistema, risco alto de side effects |
| **Flag na tabela `roles`**        | Simples                                                                                 | Roles não são 1:1 com CPFs — uma role pode ter N CPFs                                                              |

#### Nova Coluna na Tabela `roles`: `is_service_provider`

```sql
ALTER TABLE roles ADD COLUMN is_service_provider BOOLEAN DEFAULT false;
```

**Propósito:** Distinguir roles de serviço de roles regulares (admin, cliente, parceiro). Permite:

- Filtrar no wizard "Terceirização" (só mostra roles de serviço)
- Filtrar na tela `roles.tsx` (marcar como "Serviço Terceirizado")
- Na revogação, saber que a role era de prestador
- Evitar exibir roles de serviço em dropdowns de roles regulares

### 4.2 Diagrama de Entidades Completo

```
┌─────────────┐       ┌───────────────────────┐       ┌─────────────┐
│   tenants    │       │ service_provider      │       │   roles     │
│             ◄├───────┤ _invites              ├──────►│             │
│              │       ├───────────────────────┤       │ + is_service│
│              │       │ tenant_id (FK)        │       │ _provider   │
│              │       │ role_id (FK)          │       │   (BOOL)    │
│              │       │ cpf (VARCHAR 11)      │       │             │
│              │       │ status (pending/      │       └──────┬──────┘
│              │       │   linked/revoked)     │              │
│              │       │ invited_by (FK→users) │              │
│              │       │ linked_user_id        │       ┌──────┴──────┐
│              │       │   (FK→users, nullable)│       │ role_       │
│              │       └───────────────────────┘       │ permissions │
│              │                                       └─────────────┘
│              │       ┌──────────────────┐
│              ├───────┤  user_tenants    │ (sem mudanças)
│              │       │ role_id → roles  │
│              │       │ user_id → users  │
└──────────────┘       └──────────────────┘
```

### 4.3 Fluxo de Auto-Link para Prestadores

Após login/registro, adicionar um passo ao pipeline de auto-link:

```
Login/Registro (qualquer método)
       │
       ▼
tryAutoResolveTenant(userId, tenantContext)    ← existente, sem mudanças
       │
       ▼
tryAutoLinkCompanies(userId, cpf)             ← existente, sem mudanças
       │
       ▼
tryAutoLinkServiceProviders(userId, cpf)      ← NOVO
       │
       ├── 1. Buscar service_provider_invites com cpf = X e status = 'pending'
       │
       ├── 2. Para cada invite pendente:
       │      ├── a. Verificar se user_tenants já existe para (userId, tenantId)
       │      ├── b. Se NÃO existe → criar user_tenants com role_id do invite
       │      ├── c. Se JÁ existe → atualizar role_id para a role do invite
       │      │      (prestador pode já ser "Cliente" daquele tenant)
       │      ├── d. Atualizar invite: status='linked', linked_user_id, linked_at
       │      └── e. NÃO mudar users.role (manter "user" global)
       │
       └── 3. Retornar contagem de links criados
```

**Ponto crítico:** Se o prestador já tem `user_tenants` para aquele tenant (por exemplo, como "Cliente"), o auto-link deve **upgradar a role** para a de serviço, não criar duplicata.

---

## 5. Fluxo do Wizard de Terceirização

### 5.1 Visão Geral

```
┌─────────────────────────────────────────────────────────┐
│                 WIZARD DE TERCEIRIZAÇÃO                  │
│                                                          │
│  Step 1        Step 2           Step 3       Step 4      │
│  ┌──────┐     ┌──────────┐    ┌──────┐     ┌──────────┐ │
│  │ Nome │────►│ Permis-  │───►│ CPFs │────►│ Confirmar│ │
│  │ do   │     │ sões     │    │      │     │ & Criar  │ │
│  │Serviço│    │ (matriz) │    │      │     │          │ │
│  └──────┘     └──────────┘    └──────┘     └──────────┘ │
│                                                          │
│  "Eletricista" [✓] customers   "123.456..."  Resumo    │
│                 [✓] .view      "987.654..."  + Salvar  │
│                 [✓] service_   "..."                    │
│                 [ ] orders                              │
│                     .create                             │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Step 1: Nome do Serviço

```
┌─────────────────────────────────────┐
│  Terceirização de Serviço           │
│                                     │
│  Qual serviço está terceirizando?   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Ex: Eletricista, Encanador  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ⚠️ Uma role será criada com este   │
│     nome para gerenciar o acesso    │
│     desses profissionais.           │
│                                     │
│  [Próximo →]                        │
└─────────────────────────────────────┘
```

**Validações:**

- Nome não pode ser vazio
- Nome não pode duplicar role existente do tenant
- Nome não pode conter "admin", "administrador", "super" (prevenção de escalação via fuzzy matching)

### 5.3 Step 2: Permissões

Reutilizar o componente de **Permission Matrix** existente (`role_permissions_matrix.tsx`), mas embeddado no wizard em vez de como tela separada.

```
┌─────────────────────────────────────────────┐
│  Permissões para "Eletricista"              │
│                                             │
│  O que este profissional pode acessar?      │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ Módulo         VER  CRIAR EDIT DEL  │    │
│  │ ─────────────  ───  ───── ──── ──── │    │
│  │ Clientes       [✓]  [ ]   [ ]  [ ] │    │
│  │ Ordens Serviço [✓]  [✓]   [✓]  [ ] │    │
│  │ Processos      [✓]  [ ]   [ ]  [ ] │    │
│  │ Documentos     [✓]  [ ]   [ ]  [ ] │    │
│  │ Parceiros      [ ]  [ ]   [ ]  [ ] │    │
│  │ Financeiro     [ ]  [ ]   [ ]  [ ] │    │
│  │ Configurações  [ ]  [ ]   [ ]  [ ] │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [← Voltar]    [Próximo →]                  │
└─────────────────────────────────────────────┘
```

**Regras de segurança:**

- NUNCA permitir `admin.full` (god permission)
- NUNCA permitir permissões de gestão de roles (`ROLE_MANAGE`)
- NUNCA permitir permissões de tenant admin (`TENANT_MANAGE`)
- Presets rápidos: "Somente Leitura" (apenas `.view`), "Operador Básico" (`.view` + `.create` + `.edit`)

### 5.4 Step 3: CPFs dos Profissionais

```
┌─────────────────────────────────────────────┐
│  Profissionais - "Eletricista"              │
│                                             │
│  Adicione os CPFs dos profissionais:        │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ 📋  CPF              Status         │    │
│  │ ──── ──────────────── ────────────── │    │
│  │  1   123.456.789-00   ⏳ Pendente   │ ✕  │
│  │  2   987.654.321-00   ✅ Vinculado  │ ✕  │
│  │  3   555.666.777-88   ⏳ Pendente   │ ✕  │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌──────────────────┐  [+ Adicionar]        │
│  │ CPF do prestador  │                      │
│  └──────────────────┘                       │
│                                             │
│  Máscara: 000.000.000-00                    │
│  Validação: dígitos verificadores do CPF    │
│                                             │
│  ℹ️ Quando estes CPFs fizerem login na      │
│     plataforma, serão automaticamente       │
│     vinculados ao seu tenant com a role     │
│     "Eletricista".                          │
│                                             │
│  [← Voltar]    [Próximo →]                  │
└─────────────────────────────────────────────┘
```

**Status dos CPFs:**

- **Pendente** → consta em `service_provider_invites` com `status = 'pending'` (usuário não logou ainda)
- **Vinculado** → `status = 'linked'` (usuário logou e foi auto-linked)
- **Revogado** → `status = 'revoked'` (admin removeu acesso)

**Validações:**

- CPF válido (dígitos verificadores)
- CPF não duplicado na mesma role
- CPF pode existir em outras roles/tenants (multi-tenant ok)

**Comportamento ao adicionar CPF:**

1. Validar CPF
2. Verificar se o CPF já tem user no sistema → se sim, vincular imediatamente:
   - Buscar `users` por CPF
   - Criar/atualizar `user_tenants` com a role de serviço
   - Atualizar invite para `status = 'linked'`
3. Se CPF não tem user → criar invite com `status = 'pending'`

### 5.5 Step 4: Confirmação

```
┌─────────────────────────────────────────────┐
│  Confirmar Terceirização                    │
│                                             │
│  Serviço: Eletricista                       │
│                                             │
│  Permissões:                                │
│  • Clientes — Ver                           │
│  • Ordens de Serviço — Ver, Criar, Editar   │
│  • Processos — Ver                          │
│  • Documentos — Ver                         │
│                                             │
│  Profissionais: 3 CPFs                      │
│  • 123.456.789-00 — Pendente                │
│  • 987.654.321-00 — Vinculado               │
│  • 555.666.777-88 — Pendente                │
│                                             │
│  ⚠️ Profissionais pendentes serão           │
│     vinculados automaticamente quando       │
│     fizerem login na plataforma.            │
│                                             │
│  [← Voltar]    [✓ Confirmar e Criar]        │
└─────────────────────────────────────────────┘
```

**Ao confirmar:**

1. Criar role com `name = "Eletricista"` e `is_service_provider = true`
2. Criar `role_permissions` para cada permissão selecionada
3. Para cada CPF:
   - Buscar se user existe com esse CPF
   - Se existe → criar `user_tenants` + marcar invite como `linked`
   - Se não → criar invite como `pending`

---

## 6. Tab de CPFs na Tela de Roles

### 6.1 Integração com `roles.tsx`

A tela de roles (`roles.tsx`) atualmente mostra dois botões de ação por role:

- "Permissões (count)" → navega para `role_permissions`
- "Abrir matriz" → navega para `role_permissions_matrix`

Para roles com `is_service_provider = true`, adicionar:

- **"Prestadores (count)"** → abre modal/tab com a lista de CPFs vinculados

### 6.2 UI da Tab de CPFs

```
┌──────────────────────────────────────────────────────┐
│  Role: Eletricista  (🔧 Serviço Terceirizado)       │
│                                                       │
│  [Permissões (12)]  [Abrir Matriz]  [Prestadores (3)]│
│                                                       │
│  ┌────────────────────────────────────────────────┐   │
│  │  CPF              Nome         Status   Ação   │   │
│  │  123.456.789-00   João Silva   ✅ Ativo  [⚙️]  │   │
│  │  987.654.321-00   —            ⏳ Pend.  [✕]   │   │
│  │  555.666.777-88   Maria Costa  ✅ Ativo  [⚙️]  │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
│  ┌──────────────────┐  [+ Adicionar CPF]              │
│  │ CPF do prestador  │                                │
│  └──────────────────┘                                 │
│                                                       │
│  Ações por prestador:                                 │
│  • [⚙️] → Revogar: migra para role "Cliente"         │
│  • [✕] → Remover convite pendente                     │
└──────────────────────────────────────────────────────┘
```

### 6.3 Status dos Prestadores

| Status      | Significado                    | Ação disponível                         |
| ----------- | ------------------------------ | --------------------------------------- |
| ⏳ Pendente | CPF adicionado, user não logou | Remover convite                         |
| ✅ Ativo    | User logou e foi vinculado     | Revogar (migrar para role default)      |
| 🚫 Revogado | Admin removeu acesso           | Re-ativar (voltar para role de serviço) |

---

## 7. Fluxo de Revogação

### 7.1 Cenário: Admin remove prestador

```
Admin clica "Revogar" no prestador ativo
       │
       ▼
Buscar default_client_role do tenant
       │
       ▼
Buscar role_id correspondente (ex: "Cliente")
       │
       ▼
Atualizar user_tenants.role_id → role de "Cliente"
       │
       ▼
Atualizar service_provider_invites.status → "revoked"
       │
       ▼
User continua vinculado ao tenant como "Cliente"
(NÃO é deletado, NÃO fica sem role)
```

**Por que migrar e não deletar?**

- Decisão do PO: "migrar ele para user daquele tenant, para não ficar vazio e também não criar uma funcionalidade nova"
- User já pode ter dados associados (ordens de serviço criadas, etc.)
- Deletar `user_tenants` quebraria referências

### 7.2 Cenário: Admin remove convite pendente

- Simples: `DELETE` (soft) no `service_provider_invites` com `status = 'pending'`
- Sem impacto — user ainda não logou, não tem `user_tenants`

### 7.3 Cenário: Re-ativação

- Admin pode re-convidar um CPF revogado
- Atualizar `service_provider_invites.status` de volta para `linked` (se user existe) ou `pending`
- Atualizar `user_tenants.role_id` de volta para a role de serviço

---

## 8. Fluxo Completo: Lifecycle do Prestador

```
╔════════════════════════════════════════════════════════════════╗
║                  LIFECYCLE DO PRESTADOR                       ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  1. CONVITE                                                    ║
║     Admin executa wizard → cria role + permissões + invites    ║
║     service_provider_invites: status = 'pending'               ║
║                                                                ║
║  2a. VINCULAÇÃO IMEDIATA (user já existe)                      ║
║      CPF encontrado em users →                                 ║
║      criar/atualizar user_tenants com role de serviço →        ║
║      invite: status = 'linked'                                 ║
║                                                                ║
║  2b. VINCULAÇÃO POSTERIOR (user ainda não existe)              ║
║      User faz login/registro →                                 ║
║      tryAutoLinkServiceProviders(userId, cpf) →                ║
║      encontra invite pendente → cria user_tenants →            ║
║      invite: status = 'linked'                                 ║
║                                                                ║
║  3. OPERAÇÃO                                                   ║
║     Prestador faz login →                                      ║
║     PermissionsContext carrega role_id → carrega permissions → ║
║     Navegação filtrada mostra apenas telas permitidas →        ║
║     Prestador trabalha nas telas que vê                        ║
║                                                                ║
║  4. REVOGAÇÃO                                                  ║
║     Admin revoga →                                             ║
║     user_tenants.role_id → role "Cliente" →                    ║
║     invite: status = 'revoked' →                               ║
║     Prestador continua como user regular do tenant             ║
║                                                                ║
║  5. RE-ATIVAÇÃO (opcional)                                     ║
║     Admin re-ativa →                                           ║
║     user_tenants.role_id → role de serviço →                   ║
║     invite: status = 'linked'                                  ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

---

## 9. Segurança

### 9.1 Prevenção de Escalação de Privilégios

| Risco                                              | Mitigação                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Prestador cria role com nome "Administrador"       | Wizard valida: nome não pode conter "admin", "super", "administrador"                           |
| Role de serviço recebe `admin.full`                | Wizard filtra: `admin.full` nunca aparece na matriz de permissões                               |
| Role de serviço recebe `ROLE_MANAGE`               | Wizard filtra: permissões de gestão de roles/tenants bloqueadas                                 |
| Fuzzy matching em `assignDefaultPermissionsToRole` | NÃO chamar `assignDefaultPermissionsToRole` no wizard — wizard define permissões explicitamente |
| Prestador se auto-promove                          | Sem `ROLE_MANAGE`, não pode editar roles nem permissões                                         |
| CPF forjado                                        | Validação de dígitos verificadores do CPF                                                       |

### 9.2 Isolamento de Tenant

- `service_provider_invites.tenant_id` garante que convites são tenant-scoped
- `roles.tenant_id` garante que roles são tenant-scoped
- `user_tenants` vincula user ↔ tenant com role específica
- Prestador multi-tenant: cada tenant define suas próprias permissões — sem leak entre tenants

### 9.3 Dual Auth — Considerações

O prestador terá:

- `users.role = "user"` → sem poderes globais, não é admin
- `user_tenants.role_id = UUID` → permissões específicas no tenant
- `users.tenant_id` → pode mudar se user troca de tenant ativo (irrelevante — permissões vêm de `user_tenants`)

**Risco:** Se o user já era "admin" global (`users.role = "admin"`), adicionar como prestador NÃO muda `users.role`. O auto-link não deve downgradar.

**Mitigação:** `tryAutoLinkServiceProviders` só cria/atualiza `user_tenants`. NUNCA modifica `users.role`.

---

## 10. Compatibilidade com Sistemas Existentes

### 10.1 O que NÃO muda

| Sistema                      | Impacto                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| **Roles CRUD (`roles.tsx`)** | Funciona igual — roles de serviço aparecem com badge visual "Serviço Terceirizado" |
| **Permission Matrix**        | Funciona igual — matriz editável para qualquer role                                |
| **Navigation Filtering**     | Zero mudanças — já filtra por permissões do role_id                                |
| **ProtectedRoute**           | Zero mudanças — já verifica permissões do role_id                                  |
| **PermissionsContext**       | Zero mudanças — pipeline de 4 steps funciona igual                                 |
| **Partner System**           | Não utilizado — prestador NÃO tem partner_id                                       |
| **SaaS Billing**             | Prestador conta como user — sem mudança de modelo                                  |
| **Template Packs**           | Sem impacto — packs não criam roles de serviço                                     |

### 10.2 O que MUDA

| Sistema             | Mudança                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| **AuthContext.tsx** | Adicionar `tryAutoLinkServiceProviders()` após `tryAutoLinkCompanies()` |
| **Tabela `roles`**  | Adicionar coluna `is_service_provider BOOLEAN DEFAULT false`            |
| **Nova tabela**     | `service_provider_invites`                                              |
| **`roles.tsx`**     | Badge visual + botão "Prestadores" para roles de serviço                |
| **Nova tela**       | Wizard de Terceirização (4 etapas)                                      |
| **Novo service**    | `services/service-providers.ts`                                         |

### 10.3 Conflito com `autoLinkUserToTenant`

**Cenário problemático:**

1. Admin cria invite para CPF `123.456.789-00` com role "Eletricista"
2. Prestador acessa `cartorio.radul.com.br` e faz registro
3. `tryAutoResolveTenant` executa → vincula como "Cliente" (default_client_role)
4. `tryAutoLinkServiceProviders` executa → encontra invite → precisa upgradar para "Eletricista"

**Resolução:** `tryAutoLinkServiceProviders` verifica se `user_tenants` já existe:

- Se existe com role "Cliente" → UPDATE `role_id` para role de serviço
- Se existe com role diferente (ex: "Administrador") → NÃO alterar (preservar role superior)
- Se não existe → criar com role de serviço

**Regra de precedência de roles:**

```
admin.full > Administrador > role de serviço > Cliente
```

Nunca downgradar. Só upgradar.

---

## 11. Riscos e Mitigações

| #   | Risco                                                     | Probabilidade | Impacto | Mitigação                                                                                  |
| --- | --------------------------------------------------------- | ------------- | ------- | ------------------------------------------------------------------------------------------ |
| 1   | **Fuzzy matching atribui permissões erradas**             | Média         | Alto    | NÃO usar `assignDefaultPermissionsToRole` no wizard — permissões explícitas                |
| 2   | **CPF já é admin do tenant**                              | Baixa         | Médio   | Preservar role existente se for "superior" (admin, gestor)                                 |
| 3   | **Race condition: auto-link vs invite**                   | Baixa         | Baixo   | `tryAutoLinkServiceProviders` sempre roda DEPOIS de `tryAutoResolveTenant` — pode upgradar |
| 4   | **Prestador de múltiplos tenants com roles conflitantes** | Baixa         | Baixo   | Cada tenant tem isolamento total via `user_tenants` — sem conflito                         |
| 5   | **Nome da role duplica role existente**                   | Média         | Baixo   | Validação no wizard: nome único por tenant                                                 |
| 6   | **Muitos CPFs pendentes nunca vinculados**                | Média         | Baixo   | Dashboard/indicador de invites pendentes, cleanup periódico                                |
| 7   | **Prestador revogado tenta acessar**                      | Baixa         | Baixo   | Role migrada para "Cliente" — acesso reduzido automaticamente                              |
| 8   | **default_client_role case mismatch**                     | Conhecida     | Médio   | Usar fuzzy match (case-insensitive) ao buscar role para revogação                          |

---

## 12. Roadmap de Implementação

### Fase 1 — Fundação (1-2 dias)

| #   | Tarefa                                                                  | Tipo      | Prioridade |
| --- | ----------------------------------------------------------------------- | --------- | ---------- |
| 1.1 | Migration: criar tabela `service_provider_invites`                      | Migration | Crítico    |
| 1.2 | Migration: adicionar `is_service_provider` na tabela `roles`            | Migration | Crítico    |
| 1.3 | `services/service-providers.ts` — CRUD de invites, auto-link, revogação | Service   | Crítico    |
| 1.4 | Estender `AuthContext.tsx` com `tryAutoLinkServiceProviders()`          | Auth      | Crítico    |

### Fase 2 — Wizard (2-3 dias)

| #   | Tarefa                                              | Tipo       | Prioridade |
| --- | --------------------------------------------------- | ---------- | ---------- |
| 2.1 | Tela do wizard Step 1: Nome do serviço              | UI         | Alto       |
| 2.2 | Tela do wizard Step 2: Matriz de permissões (embed) | UI         | Alto       |
| 2.3 | Tela do wizard Step 3: CPFs com validação           | UI         | Alto       |
| 2.4 | Tela do wizard Step 4: Confirmação e criação        | UI         | Alto       |
| 2.5 | Rota `app/(app)/Administrador/terceirizacao.tsx`    | Routing    | Alto       |
| 2.6 | Entrada no menu admin com permissão `ROLE_MANAGE`   | Navigation | Alto       |

### Fase 3 — Gestão (1-2 dias)

| #   | Tarefa                                                                           | Tipo | Prioridade |
| --- | -------------------------------------------------------------------------------- | ---- | ---------- |
| 3.1 | Badge "Serviço Terceirizado" em `roles.tsx` para roles com `is_service_provider` | UI   | Médio      |
| 3.2 | Botão "Prestadores (N)" em `roles.tsx` → abre modal de CPFs                      | UI   | Médio      |
| 3.3 | Modal de gestão de CPFs (adicionar, revogar, re-ativar)                          | UI   | Médio      |
| 3.4 | Indicador de invites pendentes no dashboard admin                                | UI   | Baixo      |

### Fase 4 — Polish (1 dia)

| #   | Tarefa                                                         | Tipo     | Prioridade |
| --- | -------------------------------------------------------------- | -------- | ---------- |
| 4.1 | Validação de segurança: nomes proibidos, permissões bloqueadas | Security | Alto       |
| 4.2 | Testes de auto-link com múltiplos cenários                     | Test     | Médio      |
| 4.3 | Help content para o wizard e tab de CPFs                       | UX       | Baixo      |

**Estimativa total: 5-8 dias de desenvolvimento.**

---

## 13. Service API Proposta

```typescript
// services/service-providers.ts

/** Create a service provider role + invites (wizard completion) */
export async function createServiceProviderRole(params: {
  tenantId: string;
  roleName: string;
  permissionIds: string[];
  cpfs: string[];
  invitedBy: string;
}): Promise<{ roleId: string; invites: ServiceProviderInvite[] }>;

/** Add CPFs to an existing service provider role */
export async function addServiceProviderCPFs(params: {
  roleId: string;
  tenantId: string;
  cpfs: string[];
  invitedBy: string;
}): Promise<ServiceProviderInvite[]>;

/** Revoke a service provider (migrate to default role) */
export async function revokeServiceProvider(params: {
  inviteId: string;
  tenantId: string;
}): Promise<void>;

/** Re-activate a revoked service provider */
export async function reactivateServiceProvider(params: {
  inviteId: string;
  tenantId: string;
}): Promise<void>;

/** Remove a pending invite */
export async function removePendingInvite(inviteId: string): Promise<void>;

/** List invites for a role */
export async function listServiceProviderInvites(params: {
  roleId: string;
  tenantId: string;
}): Promise<ServiceProviderInvite[]>;

/** Auto-link service providers after login (called from AuthContext) */
export async function tryAutoLinkServiceProviders(
  userId: string,
  cpf: string,
): Promise<number>;

/** Check if a role is a service provider role */
export function isServiceProviderRole(role: {
  is_service_provider?: boolean;
}): boolean;
```

---

## 14. Perguntas em Aberto (para futuras decisões)

| #   | Pergunta                                           | Impacto         | Sugestão                                                                                   |
| --- | -------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| 1   | Notificação futura quando CPF é vinculado?         | UX do admin     | Notificação in-app ao admin quando invite muda de "pending" → "linked"                     |
| 2   | Limite de CPFs por role de serviço?                | Escalabilidade  | Sem limite por padrão, revisar se necessário                                               |
| 3   | Prestador pode ver em qual tenant ele é prestador? | UX do prestador | Na tela de troca de tenant, badge "Eletricista" ao lado do tenant                          |
| 4   | Dashboard consolidado de todos os prestadores?     | Admin UX        | Tela CrudScreen com join de invites + roles + users                                        |
| 5   | Histórico de quando foi vinculado/revogado?        | Auditoria       | `service_provider_invites` já tem `linked_at` + `updated_at` — suficiente                  |
| 6   | Integração com o sistema de parceiros no futuro?   | Arquitetura     | Manter separado — diferentes conceitos (partner = dados filtrados, prestador = permissões) |
| 7   | Exibir role "Eletricista" no menu do prestador?    | UX do prestador | Sim — mostra o nome da role no header/sidebar como contexto                                |

---

## 15. Resumo Executivo

### O que estamos construindo

Um sistema que permite a tenant admins **terceirizar serviços** para profissionais externos (eletricistas, encanadores, técnicos), dando acesso controlado à plataforma via:

1. **Wizard de 4 etapas** — nome do serviço → permissões → CPFs → confirmar
2. **Pré-registro silencioso** — admin adiciona CPFs, auto-link quando prestador faz login
3. **Acesso por role** — navegação filtrada automaticamente pelas permissões configuradas
4. **Revogação limpa** — migra para user regular, sem perder dados

### Quanto custa

- **~5-8 dias** de desenvolvimento
- **1 tabela nova** (`service_provider_invites`)
- **1 coluna nova** (`roles.is_service_provider`)
- **1 função no auth pipeline** (`tryAutoLinkServiceProviders`)
- **1 service novo** (`services/service-providers.ts`)
- **1 tela nova** (wizard de terceirização)
- **Enhancements** em `roles.tsx` (badge + tab de CPFs)

### O que NÃO muda

- Nenhuma mudança no sistema de permissões
- Nenhuma mudança na navegação
- Nenhuma mudança no auth flow existente (apenas adição)
- Nenhuma mudança no sistema de parceiros
- Nenhuma mudança no billing
- Nenhuma mudança no `PermissionsContext` ou `ProtectedRoute`

### DNA preservado

✅ Role-based → usa CrudScreen, roles, permissões existentes
✅ Configuração no banco, não no código → admin define tudo via wizard
✅ Autonomia do tenant → admin configura em 5 minutos sem suporte
✅ Módulo opcional → pode ser gateado por `tenant_modules` futuramente
✅ Cada feature é simples → wizard de 4 steps + tab de CPFs

---

_Estudo gerado em Fevereiro 2026 • Baseado em auditoria completa do sistema de roles, permissions, auth e auto-link (812 linhas de pesquisa + análise de 18 arquivos-chave)_
