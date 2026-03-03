# Infrastructure Audit — Radul Platform

> Research report on the current state of the codebase to inform the platform evolution roadmap.
> Generated February 2026. Covers 8 areas: template packs, api_crud worker, SaaS billing, channel partners, modules system, onboarding flow, custom fields/JSONB config, navigation structure.

---

## 1. Template Packs

### Files

| File                                 | Lines    | Purpose                                              |
| ------------------------------------ | -------- | ---------------------------------------------------- |
| `data/template-packs/index.ts`       | 60       | Central registry — `PACKS` map, lookup helpers       |
| `data/template-packs/types.ts`       | 290      | All TypeScript types for pack system                 |
| `services/template-packs.ts`         | 1101     | Apply/clear/validate logic — 16-step ordered process |
| `workers/api-crud/src/index.ts`      | (router) | Exposes `/template-packs/clear` endpoint             |
| `data/template-packs/padrao.ts`      | —        | Pack: Padrão (genérico)                              |
| `data/template-packs/juridico.ts`    | —        | Pack: Jurídico (advocacia)                           |
| `data/template-packs/comercio.ts`    | —        | Pack: Comércio (varejo/atacado)                      |
| `data/template-packs/consultoria.ts` | —        | Pack: Consultoria                                    |
| `data/template-packs/saude.ts`       | —        | Pack: Saúde                                          |
| `data/template-packs/revenda.ts`     | —        | Pack: Revenda                                        |

### Key Exports / Functions

```
data/template-packs/index.ts
├── PACKS: Record<string, TemplatePack>     — 6 packs registered
├── getAllPackSummaries(): PackSummary[]
├── getPackByKey(key): TemplatePack | undefined
└── getPackKeys(): string[]

data/template-packs/types.ts
├── TemplatePack (top-level: metadata + all entities + modules: ModuleKey[])
├── PackMetadata, PackTenantConfig
├── PackServiceCategory, PackServiceType
├── PackWorkflowTemplate (embeds steps[] + transitions[])
├── PackDeadlineRule, PackStepTaskTemplate, PackStepForm
├── PackDocumentTemplate, PackRole (with permissions[])
├── PackService (supports products + services: item_kind, pricing, stock, scheduling, delivery, composition)
├── PackOcrConfig, PackSummary
└── packToSummary(pack): PackSummary

services/template-packs.ts
├── applyTemplatePack(pack, tenantId, onProgress?): Promise<ApplyPackResult>
│   └── 16-step ordered process (see below)
├── clearPackData(tenantId): Promise<{success, error?}>
│   └── Delegates to Worker /template-packs/clear endpoint
└── validatePack(pack): {valid, errors[]}
    └── Comprehensive ref_key cross-reference validation
```

### Current Capabilities

**16-Step Apply Process** (respects FK dependency order):

| Step | Entity                      | Details                                                                                                                                                                                                                                                                       |
| ---- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `service_categories`        | Creates with `ref_key` → UUID mapping                                                                                                                                                                                                                                         |
| 2    | `workflow_templates`        | Creates with ref mapping                                                                                                                                                                                                                                                      |
| 3    | `workflow_steps`            | Nested under templates, includes `step_type`, `sla_hours`, `can_skip`                                                                                                                                                                                                         |
| 4    | `service_types`             | Links to categories + workflows via ref                                                                                                                                                                                                                                       |
| 5    | Bidirectional linking       | Sets `workflow_template_id` on service_types                                                                                                                                                                                                                                  |
| 6    | `workflow_step_transitions` | Cross-references step refs                                                                                                                                                                                                                                                    |
| 7    | `deadline_rules`            | Links to steps + service types                                                                                                                                                                                                                                                |
| 8    | `roles`                     | Creates tenant roles with re-fetch fallback                                                                                                                                                                                                                                   |
| 9    | `role_permissions`          | Maps permission codes → global permission IDs                                                                                                                                                                                                                                 |
| 10   | `step_task_templates`       | Resolves `assigned_role` via role ref                                                                                                                                                                                                                                         |
| 11   | `step_forms`                | `form_schema_json`, `validation_rules_json`                                                                                                                                                                                                                                   |
| 12   | `document_templates`        | HTML content, variables, header/footer, page config                                                                                                                                                                                                                           |
| 13   | Services catalog            | Measurement units resolution, PDV fields (`item_kind`, `sell_price`, `cost_price`, `sku`, `track_stock`, `stock_quantity`, `min_stock`, `duration_minutes`, `scheduling`, `separation`, `delivery`, `commission_percent`, `composition`), plus `service_compositions` linking |
| 14   | `tenant_modules`            | Skip existing duplicates, enable modules from `pack.modules[]`                                                                                                                                                                                                                |
| 15   | `ocr_config`                | Optional, linked to workflow steps                                                                                                                                                                                                                                            |
| 16   | Tenant config update        | Merges pack config into `tenants.config` JSONB: `specialty`, `agent_type`, `agent_name`, `show_price`, `allow_payment`, `template_pack`, `template_pack_version`, `template_pack_applied_at`; sets tenant's `workflow_template_id` to first workflow                          |

**Ref-Key System**: Packs use `ref_key` strings (not UUIDs) for internal cross-referencing. UUIDs are generated at apply-time. A `RefMap` (`Record<string, string>`) tracks `ref_key → UUID` mappings per entity type.

**Resilience Pattern**: Each step has `try/catch` + re-fetch fallback for missed refs. Errors are collected in `ApplyPackResult.errors[]` but don't stop the process.

**Validation**: `validatePack()` checks duplicate ref_keys and all cross-reference resolution (`category_ref`, `workflow_ref`, `step_ref`, `role_ref`, `type_ref`), validates transitions, deadline rules, task templates, forms, services, OCR configs.

### What Would Need to Change for Evolution

1. **Pack versioning** — currently `version` is a string in metadata but there's no migration/upgrade logic between pack versions. If a tenant applied pack v1 and v2 is released, there's no diff/merge strategy.
2. **Pack customization persistence** — when a tenant modifies pack-created data, there's no tracking of what's "pack-original" vs "tenant-customized". `clearPackData()` deletes everything the pack created, including tenant modifications.
3. **Agent Pack integration** — agent packs exist separately (`data/agent-packs/`). Currently not part of the template pack apply flow. Could be unified.
4. **Pack marketplace** — packs are hardcoded in `index.ts`. No dynamic loading from a database or external source.
5. **I18n** — labels and descriptions in packs are hardcoded in Portuguese. Supporting multiple languages would require a label-override mechanism.

---

## 2. api_crud Worker

### Files

| File                             | Lines | Purpose                                  |
| -------------------------------- | ----- | ---------------------------------------- |
| `workers/api-crud/src/index.ts`  | 1220  | Main Cloudflare Worker — complete router |
| `workers/api-crud/wrangler.toml` | —     | Worker configuration (secrets, env vars) |

### Key Endpoints

#### Public (no auth, rate-limited)

| Route                          | Method | Purpose                                                                          |
| ------------------------------ | ------ | -------------------------------------------------------------------------------- |
| `/health`                      | GET    | Health check                                                                     |
| `/auth/set-password`           | POST   | Set password (bcrypt cost 12)                                                    |
| `/auth/verify-password`        | POST   | Verify password (bcrypt + progressive plaintext→bcrypt upgrade + JWT generation) |
| `/auth/request-password-reset` | POST   | Generate 24h reset token (crypto.getRandomValues)                                |
| `/auth/confirm-password-reset` | POST   | Validate token + bcrypt rehash + JWT for immediate login                         |

#### Authenticated (Bearer JWT or X-Api-Key)

| Route                   | Method | Purpose                                                                                                |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `/api_crud`             | POST   | Dynamic CRUD: list, create, update, delete, count, aggregate, batch_create                             |
| `/api_dinamico`         | POST   | Arbitrary SQL (with blocked-pattern protection)                                                        |
| `/tables_info`          | POST   | Column info per table                                                                                  |
| `/tables`               | GET    | List all public tables                                                                                 |
| `/dns/create-subdomain` | POST   | Cloudflare API → create `{slug}.radul.com.br` CNAME                                                    |
| `/resolve-domain`       | POST   | Slug + custom_domains JSONB containment query                                                          |
| `/marketplace/*`        | POST   | 5 endpoints: resolve-customer, order-summary, create-order-records, confirm-payment, cancel-order      |
| `/cart/*`               | POST   | 2 endpoints: remove-item, clear                                                                        |
| `/financial/*`          | POST   | 5 endpoints: monthly-revenue, delinquent-customers, overdue-entries, delinquency-summary, mark-overdue |
| `/template-packs/*`     | POST   | 1 endpoint: clear (reverse-dependency-order deletion)                                                  |

### Key Infrastructure

| Feature               | Implementation                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**              | `authenticate()` → JWT Bearer (priority 1) → API key X-Api-Key (priority 2, legacy). `resolveUserAuthContext()` → `users.tenant_id/role` first → `user_tenants` + `roles` fallback |
| **CORS**              | Allowed origins list (localhost, radul.com.br, sosescritura.com.br, Expo dev, Cloudflare). Preflight handling.                                                                     |
| **Rate Limiting**     | Sliding window per IP per auth endpoint. Configurable limits per path.                                                                                                             |
| **SQL Safety**        | `api_dinamico` blocks: `DROP`, `TRUNCATE`, `ALTER`, `GRANT`, `REVOKE`, `CREATE USER/ROLE`                                                                                          |
| **DNS**               | Cloudflare API integration to create CNAME records. Reserved names check (`www`, `api`, `app`, `admin`, etc.)                                                                      |
| **Domain Resolution** | `SELECT * FROM tenants WHERE slug = $1 OR custom_domains @> $2::jsonb`                                                                                                             |
| **Error Handling**    | Error messages sanitized before returning to client                                                                                                                                |

### Current Capabilities

- **7 CRUD actions**: `list` (with 11 filter operators, `combine_type`, multi-column sort, `auto_exclude_deleted`, field selection, pagination), `create`, `update`, `delete` (soft via `deleted_at`), `count`, `aggregate` (SUM/COUNT/AVG/MIN/MAX + GROUP BY), `batch_create`
- **Max 8 filters** per query (search_field1..8 / search_value1..8 / search_operator1..8)
- **Operators**: `equal`, `not_equal`, `like`, `ilike`, `gt`, `gte`, `lt`, `lte`, `in`, `is_null`, `is_not_null`
- **All writes** return `RETURNING *`
- **Progressive auth upgrade**: plaintext passwords auto-upgraded to bcrypt on login

### What Would Need to Change for Evolution

1. **JOINs** — No server-side JOINs. Everything is resolved client-side via reference cache. Complex reports require `api_dinamico` (raw SQL).
2. **Batch update/delete** — Not supported. Only `batch_create` exists.
3. **Transactions** — No transaction support. Multi-step operations (like template pack apply) rely on sequential API calls.
4. **Webhooks outgoing** — No event system to notify external services when data changes.
5. **API versioning** — No versioning. Backward-compatible paths (`/webhook/api_crud`) are supported but there's no v1/v2 strategy.
6. **Rate limiting** — Currently only on auth endpoints. Could be extended to all endpoints for abuse prevention.
7. **Audit logging** — No audit trail beyond `created_at`/`updated_at`. No "who changed what" tracking.

---

## 3. SaaS Billing

### Files

| File                         | Lines | Purpose                                                    |
| ---------------------------- | ----- | ---------------------------------------------------------- |
| `services/saas-billing.ts`   | 1472  | Core billing logic: plans, limits, subscriptions, payments |
| `services/active-clients.ts` | 404   | Active client counting, auto-tier upgrade/downgrade        |
| `hooks/use-tenant-limits.ts` | 97    | React hook wrapping `getTenantLimits()`                    |

### Key Exports / Functions

```
services/saas-billing.ts
├── Constants
│   ├── ACTIVE_CLIENT_WINDOW_DAYS = 90
│   ├── ENTERPRISE_PRICE_PER_CLIENT = 0.20
│   ├── PLAN_ORDER: string[]  — ["free", "starter", "growth", "scale", "enterprise"]
│   ├── PLAN_TIERS: Record<string, PlanTier>
│   └── PLAN_BASE_LIMITS: Record<string, {maxCustomers, maxUsers}>
├── Queries
│   ├── findRadulTenant(): Promise<TenantRow | null>           — cached
│   ├── getRadulBillingConfig(): Promise<BillingConfig>        — priority: direct cols > config.billing > defaults
│   ├── getTenantPixConfig(tenantId): Promise<PixConfig>
│   ├── getPartnerPixConfig(partnerId): Promise<PixConfig>
│   ├── getTenantUserCount(tenantId): Promise<number>
│   ├── getTenantCustomerCount(tenantId): Promise<number>
│   ├── getTenantActiveCustomerCount(tenantId): Promise<number> — 90-day window, fallback to total
│   └── getTenantLimits(tenantId): Promise<TenantLimits>       — parallel fetches, usage %, near-limit warnings
├── Guards
│   ├── canAddClient(tenantId): Promise<boolean>
│   └── canAddUser(tenantId): Promise<boolean>
├── Actions
│   ├── subscribeToPlan(buyerTenantId, targetPlan): Promise<PurchaseSeatsResult>
│   │   └── Creates Invoice + InvoiceItem + AR with PIX on Radul tenant (3-day window, recurrence:monthly)
│   ├── purchaseExtraClients(buyerTenantId, quantity): Promise<PurchaseSeatsResult>
│   │   └── Enterprise-only, R$0.20/client/month
│   ├── confirmSeatPayment(arId, confirmedBy): Promise<{success, nextArId?}>
│   │   └── Marks AR+Invoice paid → activates plan → activates channel referral → auto-generates next month billing
│   ├── generateNextMonthBilling(parentArId, notes, ar)         — internal: creates next Invoice+AR with PIX
│   └── listPendingSeatPurchases(radulTenantId): Promise<AR[]>
├── Utilities
│   ├── generateBillingPix(config): {pixPayload, pixQrBase64, gatewayTransactionId}
│   ├── getRadulTenantId(): Promise<string | null>              — session-cached
│   ├── getPlanBaseLimits(plan): {maxCustomers, maxUsers}
│   ├── getRecommendedPlan(customerCount): string
│   └── formatPlanPrice(planKey): string

services/active-clients.ts
├── Constants
│   ├── INTERACTION_TABLES: 11 tables with date fields
│   └── DOWNGRADE_DELAY_MONTHS = 2
├── SQL Generators (for N8N cron)
│   ├── getUpdateLastInteractionSQL(): string    — UNION ALL across 11 tables → UPDATE customers.last_interaction_at
│   └── getUpdateActiveClientCountSQL(): string  — COUNT per tenant into tenants.active_client_count
├── Functions
│   ├── recalculateActiveClients(): Promise<{success}>          — runs both SQLs via api_dinamico
│   ├── getActiveClientSummary(tenantId): Promise<ActiveClientSummary>
│   └── processMonthlyTierAdjustment(tenantId): Promise<MonthlyTierResult>
│       ├── Auto-upgrade: immediate → subscribeToPlan() → generates PIX
│       ├── Auto-downgrade: after 2 consecutive months below → updates tenants.plan
│       └── Counter management: increments/resets tenants.config.consecutive_months_below

hooks/use-tenant-limits.ts
└── useTenantLimits(): {limits, loading, canAddUser, canAddClient, isNearLimit, isAtLimit, isUserNearLimit, isUserAtLimit, refresh}
```

### Current Plan Tiers

| Plan         | Max Clients | Max Users | Monthly Price |
| ------------ | ----------- | --------- | ------------- |
| `free`       | 20          | 3         | R$ 0          |
| `starter`    | 100         | ∞         | R$ 99         |
| `growth`     | 500         | ∞         | R$ 249        |
| `scale`      | 2000        | ∞         | R$ 499        |
| `enterprise` | ∞           | ∞         | Custom        |

### Billing Flow

```
subscribeToPlan(tenantId, "growth")
  ├── Creates Invoice on Radul tenant (status: "sent")
  ├── Creates InvoiceItem
  ├── Generates PIX QR code (via Asaas gateway or manual payload)
  ├── Creates AccountReceivable (status: "pending", recurrence: "monthly")
  └── Returns {success, arId, invoiceId, pixPayload, pixQrBase64}

confirmSeatPayment(arId, confirmedBy)
  ├── Marks AR status → "received" + Invoice status → "paid"
  ├── If is_initial: activates plan on buyer tenant (UPDATE tenants.plan)
  ├── If is_initial + has referral: activates channel partner referral
  ├── generateNextMonthBilling(parentArId)
  │   ├── Creates next month's Invoice + InvoiceItem
  │   ├── Generates PIX for next month
  │   └── Creates next month's AR (linked via recurrence_parent_id)
  └── Returns {success, nextArId}
```

### What Would Need to Change for Evolution

1. **Trial period** — No free trial supported. Tenants start on Free plan immediately. A trial period would need a `trial_ends_at` field + auto-downgrade cron.
2. **Annual billing** — Only monthly currently. Annual discounts would need `recurrence: "yearly"` support + pro-rata calculations.
3. **Per-user pricing** — Current model is client-count based. Some verticals may prefer per-user pricing.
4. **Stripe/international payments** — Only PIX (BR) currently. International expansion requires Stripe or similar.
5. **Self-service downgrade** — Downgrade is auto-only (after 2 months below threshold). No self-service UI for tenant to downgrade their plan.
6. **Usage analytics** — No per-tenant usage dashboard beyond client count. Feature usage tracking would help with plan optimization.
7. **Invoicing for tenants** — SaaS invoices are on Radul tenant. Tenants can't view their own subscription invoices in a dedicated billing portal.

---

## 4. Channel Partners

### Files

| File                           | Lines | Purpose                                    |
| ------------------------------ | ----- | ------------------------------------------ |
| `services/channel-partners.ts` | 684   | Complete affiliate/referral partner system |

### Key Exports / Functions

```
services/channel-partners.ts
├── Types
│   ├── ChannelPartner: {id, name, email, type, referral_code, commission_rate, status, ...}
│   ├── ChannelPartnerReferral: {partner_id, tenant_id, utm_source/medium/campaign, status}
│   ├── ChannelPartnerCommission: {partner_id, referral_id, amount, month_reference, status}
│   └── ChannelPartnerDashboard: {totalReferrals, activeReferrals, totalCommissions, pendingCommissions, paidCommissions, ...}
├── Partner CRUD
│   ├── createChannelPartner(data): auto-generates referral code, default 20% commission, status "pending"
│   ├── updateChannelPartner(id, data)
│   ├── getChannelPartnerByReferralCode(code)
│   ├── getChannelPartnerByEmail(email)
│   └── listActiveChannelPartners()
├── Referral Tracking
│   ├── createReferral(partnerId, tenantId, utmData?): auto-"active" status
│   ├── getReferralByTenantId(tenantId)
│   ├── updateReferralStatus(referralId, status)
│   └── listReferralsByPartner(partnerId)
├── Commission Calculation
│   ├── calculateMonthlyCommissions(monthReference?): scans active referrals → generates commission records
│   └── markCommissionAsPaid(commissionId, paidBy)
├── Dashboard
│   ├── getChannelPartnerDashboard(partnerId)
│   ├── getPendingCommissionsByPartner(partnerId)
│   └── getGlobalCommissionSummary()
└── Helpers
    └── generateReferralCode(name, type): "{TYPE_LABEL}-{FIRST_NAME}-{YEAR}"
```

### Plan Prices (for commission calculation)

```typescript
PLAN_PRICES = { free: 0, starter: 99, growth: 249, scale: 499, enterprise: 0 };
```

Commission = `plan_price × commission_rate` (default 20%).

### Partner Types

`accountant`, `consultant`, `agency`, `reseller`, `technology`, `other`

### Current Capabilities

- Full CRUD for channel partners with auto-generated referral codes
- UTM tracking on referrals (`utm_source`, `utm_medium`, `utm_campaign`)
- Monthly commission calculation based on active referrals × plan price × commission rate
- Dashboard with totals (referrals, commissions, pending, paid)
- Integration with `confirmSeatPayment()` — activates referral on first plan payment

### What Would Need to Change for Evolution

1. **Multi-tier commissions** — Currently flat rate per referral. No support for: first-month bonus, declining rates over time, or tiered rates by volume.
2. **Partner portal** — No dedicated partner login portal. Partners see data via internal admin screens. A public-facing partner portal would need a new route group.
3. **Referral link tracking** — Referral codes work but there's no UTM-to-signup auto-linking. The referral is created manually or via `onboarding.ts` if the user arrives with a referral code.
4. **Commission payout integration** — `markCommissionAsPaid()` exists but doesn't trigger actual payment. No integration with payment gateways for auto-payout.
5. **Hardcoded plan prices** — `PLAN_PRICES` is hardcoded. Should reference `PLAN_TIERS` from `saas-billing.ts` for a single source of truth.

---

## 5. Modules System

### Files

| File                              | Lines | Purpose                                                    |
| --------------------------------- | ----- | ---------------------------------------------------------- |
| `core/modules/module-config.ts`   | 332   | Module definitions, dependency graph, route-to-module maps |
| `core/modules/ModulesContext.tsx` | ~140  | React context — `isModuleEnabled()` hook                   |
| `core/modules/ModuleGate.tsx`     | ~95   | Route-level guard — redirects disabled module routes       |

### Key Exports / Functions

```
core/modules/module-config.ts
├── MODULE_KEYS: 13 modules
│   ├── CORE, PARTNERS, DOCUMENTS, ONR_CARTORIO
│   ├── AI_AUTOMATION, BI_ANALYTICS, FINANCIAL, CRM
│   └── PDV, PRODUCTS, STOCK, PURCHASES, DELIVERY
├── MODULE_DEFINITIONS: Map<ModuleKey, {key, label, description, icon, dependencies}>
├── Dependency Graph
│   ├── ONR_CARTORIO → [DOCUMENTS]
│   ├── PDV → [FINANCIAL]
│   ├── STOCK → [PRODUCTS]
│   ├── PURCHASES → [STOCK]
│   └── DELIVERY → [PDV]
├── Route Maps
│   ├── ADMIN_PAGE_MODULE_MAP: Record<string, ModuleKey>  — ~60+ admin page IDs → modules
│   └── SERVICE_ROUTE_MODULE_MAP: Record<string, ModuleKey> — service menu routes → modules
└── Helpers
    ├── getModuleDefinition(key)
    ├── getAdminPageModule(pageId): ModuleKey    — defaults to CORE
    ├── getServiceRouteModule(route): ModuleKey  — defaults to CORE
    ├── getMissingDependencies(moduleKey, enabledModules)
    └── getDependentModules(moduleKey)

core/modules/ModulesContext.tsx
├── ModulesProvider: React.FC                   — wraps app, fetches tenant_modules
├── useTenantModules(): {isModuleEnabled, loading, modules}
└── Behavior: fail-closed — only CORE on error/loading

core/modules/ModuleGate.tsx
└── ModuleGate: React.FC<{moduleKey}>           — redirects to /Servicos if module disabled
```

### How Module Filtering Works in Practice

**Admin home** (`app/(app)/Administrador/home.tsx`):

```typescript
const pageModule = getAdminPageModule(pageId);
if (!isModuleEnabled(pageModule)) continue; // Skip page from menu
```

**Services menu** (`app/(app)/Servicos/servicos.tsx`):

```typescript
const mod = item.module ?? getServiceRouteModule(item.route);
if (!isModuleEnabled(mod)) return false; // Hide service from menu
```

**Edit favorites** (`app/(app)/Administrador/edit-favorites.tsx`):

```typescript
const pageModule = getAdminPageModule(pageId);
if (!isModuleEnabled(pageModule)) continue; // Don't show disabled modules in favorites
```

**Module detail** (`app/(app)/Administrador/module-detail.tsx`): Shows pages belonging to a specific module, filtered by `isModuleEnabled()`.

### Current Capabilities

- 13 modules with dependency graph (5 dependency relationships)
- Per-tenant activation stored in `tenant_modules` table
- Automatic navigation filtering — disabled modules' pages/routes hidden from menus
- Route-level guard (ModuleGate) prevents direct URL access to disabled module pages
- CORE module always enabled, fail-closed on error
- Template packs can enable modules via `pack.modules[]`
- Admin UI for activating/deactivating modules (`modulos.tsx`)

### What Would Need to Change for Evolution

1. **Module billing** — Currently modules are free/on/off. No per-module pricing. Could tie module activation to plan tiers (e.g., CRM only on Growth+).
2. **Module feature flags** — Binary on/off. No support for partial features within a module (e.g., CRM basic vs CRM advanced).
3. **Module usage metrics** — No tracking of which modules are actively used vs just enabled.
4. **Cross-module integration** — Modules operate independently. No formal integration API between modules (e.g., CRM lead → Financial invoice).
5. **PORTAL module** — Currently commented out in `MODULE_KEYS`. Would need implementation for a dedicated client portal module.

---

## 6. Onboarding Flow

### Files

| File                     | Lines | Purpose                                                  |
| ------------------------ | ----- | -------------------------------------------------------- |
| `services/onboarding.ts` | 484   | Self-service tenant creation + template pack application |

### Key Exports / Functions

```
services/onboarding.ts
├── Constants
│   ├── DEFAULT_TENANT_ROLES = [
│   │   {name: "Administrador", type: "admin"},
│   │   {name: "Cliente", type: "client"},
│   │   {name: "Parceiro", type: "operador_parceiro"}
│   │ ]
│   └── SUPER_ADMIN_ROLE = {name: "Super Admin", type: "superadmin"} — only for Radul tenant
├── Functions
│   ├── createTenant(data): Promise<Tenant>
│   │   └── Creates tenant with config JSONB {cnpj, brand: {name, primary_color}}, plan="free", max_users=2
│   ├── ensureDefaultRoles(tenantId): Promise<void>
│   │   └── Creates 3 standard roles + Super Admin for Radul
│   ├── runOnboarding(userId, companyData, packKey, onProgress?): Promise<{tenantId, success}>
│   │   ├── 1. Create tenant (company_name, whatsapp, cnpj, slug, brand config)
│   │   ├── 2. DNS subdomain creation ({slug}.radul.com.br via Worker)
│   │   ├── 3. Default roles (3 standard + Super Admin if Radul)
│   │   ├── 4. Link user to tenant (user_tenants)
│   │   ├── 5. Apply template pack (if packKey provided)
│   │   ├── 6. Seed chart of accounts (contábil categories)
│   │   └── 7. Assign admin role + initial permissions
│   └── generateSlug(text): string
│       └── URL-safe slug from company name
```

### Onboarding Steps

```
User completes registration → Auth context has user but no tenant
→ Onboarding screen appears with steps:
  Step 1: Company info (name, WhatsApp, CNPJ, brand name, primary color, slug)
  Step 2: Select template pack
  Step 3: runOnboarding() executes:
    1. createTenant() → tenant record with config JSONB
    2. DNS → {slug}.radul.com.br CNAME
    3. ensureDefaultRoles() → 3 roles
    4. Link user → user_tenants record
    5. applyTemplatePack() → 16-step process
    6. Seed chart of accounts → accounting categories
    7. Assign admin role + permissions
  → User redirected to app with tenant context
```

### Current Capabilities

- Self-service tenant creation with brand customization
- Automatic DNS subdomain creation via Cloudflare API
- Template pack application during onboarding (optional)
- Default role structure with admin, client, partner archetypes
- Chart of accounts seeding for financial module
- Progress callback for UI progress bar
- URL-safe slug generation from company name

### What Would Need to Change for Evolution

1. **Invite-based onboarding** — Currently only self-registration. No ability for an existing tenant admin to invite users who auto-join the correct tenant.
2. **Team setup** — No step for inviting initial team members during onboarding. The creator is the only user.
3. **Industry detection** — Template pack selection is manual. Could auto-suggest based on CNPJ activity code (CNAE) from ReceitaWS.
4. **Onboarding wizard** — Currently a single-screen flow. A multi-step wizard with preview of what the pack includes would improve UX.
5. **Custom domain setup** — DNS only creates subdomains. Custom domain (`app.clientdomain.com`) requires manual configuration.
6. **Referral code capture** — The `channel-partners` referral code isn't captured during onboarding UI. The integration exists in `confirmSeatPayment()` but the referral tracking should start at signup.

---

## 7. Custom Fields / JSONB Config

### Files (no dedicated file — pattern used across services)

| File                                             | Config Path                               | Purpose                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/saas-billing.ts`                       | `tenants.config.billing`                  | `pix_key`, `pix_key_type`                                                                                                                    |
| `services/onboarding.ts`                         | `tenants.config.brand`                    | `name`, `primary_color`                                                                                                                      |
| `services/marketplace.ts`                        | `tenants.config.marketplace`              | Marketplace configuration                                                                                                                    |
| `services/marketing-ai.ts`                       | `tenants.config.marketing_profile`        | Persistent AI marketing profile                                                                                                              |
| `services/template-packs.ts`                     | `tenants.config.*`                        | `specialty`, `agent_type`, `agent_name`, `show_price`, `allow_payment`, `template_pack`, `template_pack_version`, `template_pack_applied_at` |
| `services/active-clients.ts`                     | `tenants.config.consecutive_months_below` | Auto-downgrade delay counter                                                                                                                 |
| `app/(app)/Administrador/marketplace-config.tsx` | `tenants.config.marketplace`              | Admin UI for marketplace settings                                                                                                            |
| `app/(app)/Administrador/perfil-marketing.tsx`   | `tenants.config.marketing_profile`        | Admin UI for marketing profile                                                                                                               |
| `migrations/add-bank-account-pix-merchant.sql`   | —                                         | Note: PIX migrating from config.billing to `bank_accounts` table                                                                             |

### JSONB Config Structure

```jsonc
// tenants.config JSONB column
{
  // Set by onboarding
  "cnpj": "12.345.678/0001-99",
  "brand": {
    "name": "My Brand",
    "primary_color": "#2563eb",
  },

  // Set by template pack application
  "specialty": "advocacia",
  "agent_type": "legal",
  "agent_name": "Assistente Jurídico",
  "show_price": true,
  "allow_payment": true,
  "template_pack": "juridico",
  "template_pack_version": "1.0.0",
  "template_pack_applied_at": "2026-02-01T00:00:00.000Z",

  // Set by SaaS billing
  "billing": {
    "pix_key": "12345678901",
    "pix_key_type": "cpf",
  },

  // Set by marketplace
  "marketplace": {
    /* marketplace-specific config */
  },

  // Set by marketing AI
  "marketing_profile": {
    /* persistent AI profile */
  },

  // Set by active-clients auto-tier
  "consecutive_months_below": 0,
}
```

### Config Access Pattern

All services follow the same pattern:

```typescript
// Read: fetch tenant → parse config JSONB → access nested path
const tenant = await fetchTenant(tenantId);
const config =
  typeof tenant.config === "string" ? JSON.parse(tenant.config) : tenant.config;
const value = config?.billing?.pix_key;

// Write: merge into existing config JSONB
const existing = parseConfig(tenant.config);
await api.post(CRUD_ENDPOINT, {
  action: "update",
  table: "tenants",
  payload: { id: tenantId, config: { ...existing, newField: "value" } },
});
```

### Priority Pattern

`getRadulBillingConfig()` demonstrates the priority pattern used for PIX config:

```
Direct column (tenants.pix_key) > JSONB (tenants.config.billing.pix_key) > Hardcoded default
```

### Current Capabilities

- Schemaless config extension via `tenants.config` JSONB
- Each service "owns" a namespace within the config (billing, brand, marketplace, etc.)
- Config survives schema changes — no migration needed to add new config fields
- Config merging preserves existing values when adding new fields

### What Would Need to Change for Evolution

1. **No custom fields for entities** — `tenants.config` is tenant-level only. There's no custom fields system for `customers`, `service_orders`, or other entities. Entity-level custom fields would need a `custom_fields` JSONB column on each entity table + UI rendering in CrudScreen.
2. **No config schema validation** — Config is schemaless. No validation of required fields, types, or allowed values. A JSON Schema per config namespace would prevent invalid config states.
3. **Config migration** — When moving config to dedicated columns (like PIX → `bank_accounts`), the priority pattern must be maintained for backward compatibility. This is fragile.
4. **Config versioning** — No version tracking on config changes. No audit trail of what changed and when in the config JSONB.
5. **No typed config access** — Config access is via string keys with manual casting. TypeScript types for each config namespace would improve safety.
6. **No admin UI for arbitrary config** — Each config namespace requires its own admin screen. A generic config editor (like CrudScreen but for JSONB) would reduce boilerplate.

---

## 8. Navigation Structure

### Files

| File                                         | Lines | Purpose                                              |
| -------------------------------------------- | ----- | ---------------------------------------------------- |
| `core/navigation/breadcrumbs.ts`             | 173   | Route segment → PT-BR label mapping (~80+ segments)  |
| `core/modules/module-config.ts`              | 332   | `ADMIN_PAGE_MODULE_MAP` + `SERVICE_ROUTE_MODULE_MAP` |
| `core/modules/ModulesContext.tsx`            | ~140  | `isModuleEnabled()` hook                             |
| `core/modules/ModuleGate.tsx`                | ~95   | Route-level guard                                    |
| `app/(app)/Administrador/home.tsx`           | —     | Admin home — filters pages by module                 |
| `app/(app)/Servicos/servicos.tsx`            | —     | Services menu — filters items by module              |
| `app/(app)/Administrador/edit-favorites.tsx` | —     | Favorites editor — filters by module                 |
| `app/(app)/Administrador/module-detail.tsx`  | —     | Module detail — shows pages for a module             |

### Navigation Architecture

```
app/
├── _layout.tsx            → AuthProvider > PermissionsProvider > TenantThemeProvider > AuthGate > Slot
├── (auth)/                → Login, Register, Forgot Password (public, no tenant required)
├── (public)/              → Public routes: /p/:token (portal), /q/:token (quotes), /f/:slug (lead forms)
└── (app)/
    ├── Administrador/     → Admin pages (~60+ screens)
    │   ├── home.tsx       → Admin dashboard: pages filtered by getAdminPageModule() + isModuleEnabled()
    │   ├── modulos.tsx    → Module activation/deactivation UI
    │   ├── module-detail.tsx → Pages belonging to a specific module
    │   └── [60+ screens] → CrudScreens for each entity/feature
    └── Servicos/
        ├── servicos.tsx   → Service menu: items filtered by getServiceRouteModule() + isModuleEnabled()
        └── [service screens]
```

### Module-Based Filtering Flow

```
1. On mount: ModulesContext fetches tenant_modules from database
2. isModuleEnabled(key) returns true if module row exists AND is enabled, OR if key === CORE

Admin home.tsx:
  FOR each admin page definition:
    pageModule = getAdminPageModule(pageId)  // Lookup in ADMIN_PAGE_MODULE_MAP, default: CORE
    IF !isModuleEnabled(pageModule): SKIP    // Don't show in menu
    IF !canAccessPage(pageId): SKIP          // Permission check
    → Show page card

servicos.tsx:
  FOR each service menu item:
    mod = item.module ?? getServiceRouteModule(item.route)  // Lookup in SERVICE_ROUTE_MODULE_MAP
    IF !isModuleEnabled(mod): SKIP           // Don't show in menu
    → Show menu item

ModuleGate (route guard):
  IF route requires moduleKey AND !isModuleEnabled(moduleKey):
    → Redirect to /Servicos (services home)
```

### Route-to-Module Mapping Examples

**Admin Pages** (`ADMIN_PAGE_MODULE_MAP`):
| Page ID | Module |
|---------|--------|
| `invoices`, `payments`, `accounts-receivable`, `accounts-payable` | `financial` |
| `crm-leads`, `crm-kanban`, `campaigns` | `crm` |
| `partners`, `partner-earnings` | `partners` |
| `document-templates`, `generated-documents` | `documents` |
| `agents`, `agent-states`, `playbooks` | `ai_automation` |
| `products`, `product-compositions` | `products` |
| `stock-movements`, `stock-locations` | `stock` |
| `purchase-orders` | `purchases` |
| `delivery-routes`, `shipments` | `delivery` |
| `pdv`, `shopping-cart` | `pdv` |
| `onr-protocolos`, `onr-certidoes` | `onr_cartorio` |

### Current Capabilities

- File-based routing via `expo-router`
- Module-based navigation filtering (pages hidden when module disabled)
- Route-level guard prevents direct URL access to disabled modules
- Breadcrumb labels for ~80+ route segments (PT-BR)
- Permission-based page access (via `canAccessPage()`)
- Favorites system for admin pages
- Global search across all visible pages

### What Would Need to Change for Evolution

1. **Dynamic menu ordering** — Menu items are defined in code with fixed order. Tenant-configurable menu order would need a `menu_config` JSONB or table.
2. **Custom menu items** — No ability for tenants to add custom menu entries or rename existing ones. Would need a `tenant_menu_items` table.
3. **Nested navigation** — Currently flat. Deep nesting (e.g., Financial > Invoices > Invoice Detail) relies on breadcrumbs but isn't a hierarchical menu structure.
4. **Module-scoped navigation** — Route maps are centralized in `module-config.ts`. As modules grow, this file becomes a bottleneck. Each module could register its own routes.
5. **Public-facing navigation** — Portal, quote, and lead form routes are in `(public)/` but have no configurable navigation. A tenant-branded public nav could improve the white-label experience.
6. **Mobile bottom tabs** — The current tab configuration is hardcoded. Module-aware tabs (showing/hiding based on enabled modules) would improve the mobile experience.

---

## Summary Matrix

| Area                 | Files         | Maturity  | Key Strength                                           | Primary Gap                                                  |
| -------------------- | ------------- | --------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| **Template Packs**   | 8+            | ✅ High   | 16-step ordered apply with ref-key system              | No pack versioning/upgrade, no customization tracking        |
| **api_crud Worker**  | 1 main        | ✅ High   | 7 CRUD actions, 11 operators, rate limiting, JWT auth  | No JOINs, no transactions, no batch update/delete            |
| **SaaS Billing**     | 3             | ✅ High   | Auto-tier with 2-month downgrade delay, PIX recurrence | No annual billing, no self-service downgrade, PIX only       |
| **Channel Partners** | 1             | ✅ Medium | Full CRUD + commission calc + dashboard                | Hardcoded prices, no auto-payout, no partner portal          |
| **Modules System**   | 3             | ✅ High   | 13 modules, dependency graph, fail-closed              | No per-module pricing, no feature flags within modules       |
| **Onboarding**       | 1             | ✅ Medium | Self-service tenant creation + DNS + pack apply        | No team invite, no industry auto-detect, no referral capture |
| **JSONB Config**     | (distributed) | ⚠️ Medium | Schemaless extension, per-service namespaces           | No entity-level custom fields, no schema validation          |
| **Navigation**       | 4+ screens    | ✅ High   | Module-based filtering on admin + services menus       | No dynamic ordering, no custom menu items                    |

---

_Infrastructure audit — February 2026 • Based on full source code analysis of 15+ core files, 1220-line Worker, 1472-line billing service, 1101-line template pack service, 684-line channel partners service, 484-line onboarding service, 404-line active clients service._
