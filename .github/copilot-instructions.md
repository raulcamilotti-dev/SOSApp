# SOSApp Copilot Instructions

## Project Overview

**Radul Platform** — Expo React Native app (iOS, Android, web). Configurable operations platform for any service business. 3-layer architecture: **Core Platform** (CrudScreen, Workflow Engine, Kanban, RBAC, Notifications, Calendar, api_crud) → **Optional Modules** (Financial, CRM, Partners, Documents, AI, BI, ONR, Time Tracking, Portal) → **Template Packs** (data-driven vertical config: Genérico, Advocacia, Cobrança, Cartório).

**Key principle:** 88% of codebase is universal. Verticals are in Template Pack data, not code. Cartórios are NOT the target audience — they're service providers accessed via the ONR integration module.

### Design Rules

1. **If it's CRUD, use CrudScreen** — user learns once, knows everything
2. **Config in database, not code** — tenants customize via data
3. **New feature = optional module** — tenant activates only what they need
4. **Generic naming in core, domain naming in template** — code says "entity", template says "imóvel"
5. **Tenant autonomy > feature power** — if tenant can't configure it alone in 10 min, simplify
6. **Template Pack resolves the vertical** — niche is in pre-configured data, not screens
7. **Each module is simple in isolation** — invoicing is a list with statuses, not SAP Finance

### Partner Strategy

| Strategy                     | When                       | Examples                                                                 |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| **BUILD**                    | Competitive differentiator | Workflow Engine, CrudScreen, Kanban                                      |
| **EMBED** (OSS self-hosted)  | Mature OSS exists          | N8N (backend), Documenso (signatures), Metabase (BI), Tesseract.js (OCR) |
| **INTEGRATE** (external API) | Regulated/commoditized     | MercadoPago, ENotas, WhatsApp, BrasilAPI, Gov.br                         |

**Rule:** Every partner consumed via `services/partner.ts` wrapper. Never call partner API directly from components.

### Strategic Documents

- **Product Strategy:** [docs/ESTRATEGIA_PRODUTO.md](../docs/ESTRATEGIA_PRODUTO.md)
- **Market Study:** [docs/ESTUDO_MERCADO.md](../docs/ESTUDO_MERCADO.md)

---

## Architecture & Key Patterns

### Routing & Structure

- **File-based routing** via `expo-router` in `app/` directory
- **Root layout** ([app/\_layout.tsx](../app/_layout.tsx)): AuthProvider → TenantThemeProvider → AuthGate → Slot
- **Groups:** `app/(app)/Servicos/` (client), `app/(app)/Administrador/` (admin), `app/(auth)/`, `app/(public)/`
- **Path alias:** `@/*` → root. Use `router.push()` / `router.replace()` for navigation
- **Theme:** `useThemeColor()` hook, `Colors` from [components/themed-color.tsx](../components/themed-color.tsx), light/dark mode via `useColorScheme()`

### API Integration

- **Centralized service:** [services/api.ts](../services/api.ts) — axios instance with `baseURL` from `EXPO_PUBLIC_API_BASE_URL`
- **Auth:** Token in `expo-secure-store`, `X-Api-Key` header for Worker auth
- **Error handling:** try-catch with user-facing error states; `getApiErrorMessage()` for normalized messages

### Entity Hierarchy (B2B2C)

| Entity          | Role                       | Key Table                |
| --------------- | -------------------------- | ------------------------ |
| **SuperTenant** | Platform Owner (Raul)      | —                        |
| **Tenant**      | System Buyer (company/org) | `tenants`                |
| **User**        | Person who logs in         | `users` + `user_tenants` |
| **Customer**    | End client of tenant       | `customers`              |
| **Partner**     | Service provider/operator  | `partners`               |
| **Company**     | B2B grouping               | `companies`              |

**4 role archetypes:** Admin Tenant (full access), Operador Tenant (limited admin), Operador Parceiro (sees only their assigned customers via `users.partner_id → partners.id → customers.partner_id`), Client User (portal-only).

### Multi-Domain Auth

Unified login/register resolves tenant by domain. **`core/auth/tenant-context.ts`** detects `is_platform_root`. **`services/tenant-resolver.ts`** resolves domain → tenant via `slug` match or `custom_domains` JSONB scan. After auth, `tryAutoResolveTenant()` auto-links user to resolved tenant (best-effort, never breaks auth). Platform root (`app.radul.com.br`, `localhost`) never auto-links.

**Key columns on `tenants`:** `slug` (unique, URL-safe, used in `{slug}.radul.com.br`), `custom_domains` (JSONB array), `default_client_role` (default `'client'`).

### Tenant Branding

Auth screens adapt via `useTenantBranding()` hook → `tenants.config.brand` JSONB (`{ "brand": { "name": "...", "primary_color": "#hex" } }`). `getAuthColors()` returns full palette respecting dark mode. Onboarding (Step 1) collects: company name, WhatsApp, CNPJ, brand name, primary color (8 presets + custom hex), web slug.

### Screen Reuse Patterns

**Every business process = `service_order` + `workflow_template`. New verticals reuse existing screens:**

| Screen                                | What                             | Reuse Strategy            |
| ------------------------------------- | -------------------------------- | ------------------------- |
| **Kanban** (`kanban-processos.tsx`)   | Visual pipeline by workflow step | ALL process types         |
| **Processo** (`Processo.tsx`)         | Process detail + timeline        | ALL service orders        |
| **Portal Público** (`/p/[token].tsx`) | Client read-only portal          | ALL processes             |
| **CrudScreen** (generic)              | Any CRUD table                   | Tenant + partner filtered |

✅ **Reuse** when feature is a process with steps, a CRUD list/form, or a client-facing view. ❌ **Create** only for fundamentally different UX (dashboards, calendar, maps).

### Partner Scope Pattern

`usePartnerScope()` from [hooks/use-partner-scope.ts](../hooks/use-partner-scope.ts) resolves current user's partner context. Admin/tenant users → `isPartnerUser = false`, see all. Partner operators → filter by `partnerId` or `customerIds`. CrudScreen: filter `loadItems` client-side. Custom screens: pass `partnerId` to service functions. Self-partner: `is_internal: true` on `partners` table for tenant's own ops.

### Trigger Screen → Process Pattern

Dashboard shows actionable data → action button → service function checks duplicates → creates `service_order` + `service_order_context` → navigates to Kanban/Processo. The trigger screen does NOT manage the process — workflow engine handles it.

---

## CRUD System (api_crud)

### Overview

All DB operations go through **Cloudflare Worker** (`sos-api-crud`). App sends POST to `api_crud` with `action` + `table` + filters/payload. **CrudScreen** ([components/ui/CrudScreen.tsx](../components/ui/CrudScreen.tsx)) is the core DNA — ~3,000-line generic CRUD component, **49+ screens** use it. Types: `CrudFieldConfig<T>`, `CrudFieldType`, `CrudScreenHandle` — see source file for full definitions.

**Field types:** `text`, `multiline`, `json`, `reference`, `boolean`, `select`, `date`, `datetime`, `currency`, `number`, `email`, `phone`, `url`, `masked`.

**Capabilities:** Schema-driven fields via `convertTableInfoToFields()`, batch reference resolution (1 req/table via `in` operator), quick-create nested entities, AI insights, 4-tier responsive layout, field validation (`validate`), conditional visibility (`showWhen`), field sections, masked input (CPF/CNPJ/CEP/phone), server-side pagination, KeyboardAvoidingView, readOnly on all types, smart type detection.

**Not yet:** Bulk actions, CSV/PDF export, table view for desktop.

### Endpoint & Constants

```ts
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
  API_DINAMICO,
} from "@/services/crud";
```

### Actions

| Action         | Purpose                             | Returns                  |
| -------------- | ----------------------------------- | ------------------------ |
| `list`         | SELECT with filters/sort/pagination | `[{row}, ...]`           |
| `create`       | INSERT row                          | `[{full row with id}]`   |
| `update`       | UPDATE row(s)                       | `[{full updated row}]`   |
| `delete`       | Soft-delete (sets `deleted_at`)     | `[{deleted row}]`        |
| `count`        | COUNT with filter support           | `[{count: N}]`           |
| `aggregate`    | SUM/COUNT/AVG/MIN/MAX + GROUP BY    | `[{group + agg values}]` |
| `batch_create` | Multi-row INSERT                    | `[{row1}, {row2}, ...]`  |

All write actions return `RETURNING *`. Empty result = `""` (not `[]`).

### Filter Format

Use `buildSearchParams()` from `services/crud.ts`. Generates `search_field1..8` / `search_value1..8` / `search_operator1..8`.

**Operators:** `equal` (default), `not_equal`, `like`, `ilike`, `gt`, `gte`, `lt`, `lte`, `in`, `is_null`, `is_not_null`. Max 8 filters. `combine_type: "AND" | "OR"`. `sort_column: "created_at DESC"` (multi-column OK). `auto_exclude_deleted: true` adds `WHERE deleted_at IS NULL` without consuming filter slot.

**Standard CRUD pattern:**

```ts
const res = await api.post(CRUD_ENDPOINT, {
  action: "list",
  table: "TABLE",
  ...buildSearchParams([{ field: "X", value: Y }], {
    sortColumn: "created_at DESC",
  }),
});
const items = normalizeCrudList<T>(res.data).filter((item) => !item.deleted_at);
```

### Key Exports (services/crud.ts)

`CRUD_ENDPOINT`, `API_DINAMICO`, `CrudFilter`, `CrudListOptions`, `buildSearchParams()`, `normalizeCrudList<T>()`, `normalizeCrudOne<T>()`, `batchCreate<T>()`, `countCrud()`, `aggregateCrud<T>()`, `buildAggregatePayload()`, `createCrudService<T>()`.

### api_crud Limitations

No JOINs (client-side reference cache), no transactions, no batch update/delete, max 8 filters (use `api_dinamico` for complex queries).

### Schema Introspection (services/schema.ts)

`getTableInfo(table)` returns `TableInfoRow[]` (column_name, data_type, udt_name, is_nullable, column_default, referenced_table_name). `convertTableInfoToFields<T>()` auto-generates `CrudFieldConfig<T>[]` — FK→reference, boolean→boolean, json→json, timestamps→datetime, `*_amount`→currency, email→email, etc. System columns excluded: `id`, `created_at`, `updated_at`, `deleted_at`.

---

## KanbanScreen

**`KanbanScreen<T>`** ([components/ui/KanbanScreen.tsx](../components/ui/KanbanScreen.tsx)) — generic reusable Kanban board, same pattern as CrudScreen. Theme-aware, horizontal scroll with web arrows, built-in move modal (long-press), search, pull-to-refresh, custom cards via `renderCard` or default via `getCardTitle`+`getCardFields`+`getCardActions`. Header slots, create button, extra modals slot, ref with `reload()`. See source file for types and props.

**Used by:** `kanban-processos.tsx` (ServiceOrderItem, workflow_steps columns) and `crm-kanban.tsx` (Lead, KANBAN_STAGES columns).

---

## Backend Architecture

### Cloudflare Worker (Primary API)

**Worker:** `sos-api-crud` | **URL:** `https://api-crud.sosescritura.com.br` (dev: `https://sos-api-crud.raulcamilotti-c44.workers.dev`) | **Source:** `workers/api-crud/` | **Auth:** `X-Api-Key` header | **DB:** Direct TCP PostgreSQL (no SSL)

| Endpoint        | Method | Purpose                                                               |
| --------------- | ------ | --------------------------------------------------------------------- |
| `/api_crud`     | POST   | Dynamic CRUD (list/create/update/delete/count/aggregate/batch_create) |
| `/api_dinamico` | POST   | Arbitrary SQL (`{ sql: "SELECT ..." }`) — migrations, complex joins   |
| `/tables_info`  | POST   | Column info (`{ table_name: "..." }`)                                 |
| `/tables`       | GET    | List all public tables                                                |
| `/health`       | GET    | Health check (no auth)                                                |

**Response:** 200 with `[{rows}]` or `""`, 400 with `{"error": "..."}`, 401 Unauthorized. Backward-compatible paths (`/webhook/api_crud`) supported.

**Dynamic SQL:** LIST parses `search_field1..8`, supports all 11 operators, `combine_type`, `fields` selection, `auto_exclude_deleted`, multi-column sort, fallback `ORDER BY 1`. All identifiers SQL-injection safe. CREATE/UPDATE/DELETE use `RETURNING *`. DELETE auto-generates `deleted_at = now()`.

### N8N (Automations)

**URL:** `https://n8n.sosescritura.com.br` | **Workflow:** `Ar17RgJt19MHQwbJqD8ZK`

Handles non-CRUD: WhatsApp chat (`/webhook/conversations*`), PDF generation (`/webhook/generate_pdf`), Gov.br OAuth, ONR/SREI, robot triggers, calendar sync, ICP-Brasil, nightly cron jobs.

### Database Schema Constraints

**Tables without `id`:** `role_permissions` (PK: `role_id` + `permission_id`), `controle_atendimento` (PK: `session_id`, no `deleted_at`). **Without `deleted_at`:** `controle_atendimento`, `service_order_context`. Never assume `ORDER BY "id"` or `deleted_at` exists for these tables.

### Key Database Tables

**Core:** `properties`, `customers`, `service_orders`, `service_order_context`, `service_types`, `service_categories`, `services`
**Workflow:** `workflow_templates`, `workflow_steps`, `workflow_step_transitions`, `tasks`, `task_variables`, `step_task_templates`, `step_forms`, `step_form_responses`
**Process:** `process_updates`, `process_update_files`, `process_deadlines`, `deadline_rules`, `process_document_requests`, `process_document_responses`, `process_logs`
**Auth:** `users`, `user_tenants`, `tenants`, `roles`, `role_permissions`, `permissions`, `auth_codes`, `auth_tokens`
**Documents:** `document_templates`, `generated_documents`, `document_signatures`, `client_files`, `protocol_documents`
**Companies:** `companies`, `company_members`, `business_units`
**Notifications:** `notifications`, `notification_preferences`, `notification_deliveries`
**Portal:** `public_access_tokens`, `process_reviews`
**Quotes:** `quotes`, `quote_items`
**Partners:** `partners`, `partner_availability`, `partner_time_off`, `partner_rating_summary`, `partner_earnings`, `service_appointments`, `appointment_logs`, `service_executions`, `service_reviews`, `review_logs`
**Financial:** `invoices`, `invoice_items`, `payments`, `accounts_receivable`, `accounts_payable`
**Chat:** `controle_atendimento`, `contexto_conversa`, `n8n_chat_histories`, `buffer_chat_history`, `buffer_mensagens_manuais`, `whatsapp_contacts`
**AI:** `analytics_events`, `agents`, `agent_states`, `automations`, `automation_executions`, `ocr_config`, `ocr_results`
**External:** `onr_protocolos`, `onr_certidoes`, `brasil_api_cache`, `cartorios`, `calendar_sync_settings`
**Buffers:** `buffer_customers`, `buffer_properties`, `properties_staging`, `properties_preview`, `customer_classifications`

---

## Template Packs

Portable JSON bundles of pre-configured data per vertical. Source: `data/template-packs/`. Service: `services/template-packs.ts` (`applyTemplatePack`, `clearPackData`, `validatePack`). Registry: `data/template-packs/index.ts` (PACKS map).

**Packs:** `generico` (8 types, 3 workflows), `advocacia` (8/3), `cobranca` (6/4), `cartorio` (6/6, ONR integration). Packs use `ref_key` identifiers (not UUIDs) for internal cross-referencing; UUIDs generated at apply-time. Apply order respects FK dependencies (categories → workflows → steps → types → transitions → rules → roles → templates → modules → config).

**Adding a pack:** Create `data/template-packs/my-vertical.ts`, register in `index.ts` PACKS map → auto-appears in admin UI.

---

## Development Workflow

**Commands:** `npm start` (dev), `npm run web`, `npm run ios`, `npm run android`, `npm run lint`, `npm run deploy:worker`, `npm run deploy:landing`

**Key deps:** expo-router, axios (centralized `api`), expo-secure-store, react-navigation, expo-haptics

**New screen:** Create `app/(app)/GroupName/screen.tsx` → auto-routed. Admin: `Administrador/`. Client: `Servicos/`. Public (no auth): `(public)/`.

---

## SaaS Billing

Active-client-count tier model. Plans by max active clients (interaction in last 90 days). Users unlimited on paid plans; Free = 3 users max. Core files: `services/saas-billing.ts`, `services/active-clients.ts`, `hooks/use-tenant-limits.ts`.

**Tiers:** `free` (20 clients, R$0), `starter` (100, R$99), `growth` (500, R$249), `scale` (2000, R$499), `enterprise` (unlimited, custom). Enterprise extra: R$0.20/client/month.

**Key columns:** `customers.last_interaction_at` (nightly cron scans 11 tables), `tenants.active_client_count` (cached), `tenants.config.billing.pix_key`.

**Flow:** `subscribeToPlan()` → creates Invoice + AR on Radul tenant with `notes.type = "saas_plan_subscription"` → PIX QR → Radul admin confirms → `confirmSeatPayment()` upgrades plan (if initial) + generates next month AR (always). Enterprise extras via `purchaseExtraClients()` with `notes.type = "saas_extra_clients"`. Auto-downgrade after 2 consecutive months below threshold.

**Key functions:** `getTenantLimits()`, `canAddClient()`, `canAddUser()`, `subscribeToPlan()`, `confirmSeatPayment()`, `processMonthlyTierAdjustment()`, `recalculateActiveClients()`.

---

## N8N & Database Policy

- Auto-check `n8n/workflows/Ar17RgJt19MHQwbJqD8ZK.json` when relevant
- Only modify N8N/database if explicitly requested or necessary for the feature
- DDL via `api_dinamico`; always run schema + duplicate checks first
- Prefer tenant-aware constraints (`tenant_id + business_key`)

**Resources:** Worker: `https://api-crud.sosescritura.com.br` | N8N: `https://n8n.sosescritura.com.br` (ID: Ar17RgJt19MHQwbJqD8ZK) | Landing: `https://radul.com.br` | Deploy: `npm run deploy:worker` | N8N sync: `npm run sync:n8n:download/upload/validate`

---

## Conventions

### CRUD Patterns

- Always use `buildSearchParams()` for filters — never handcraft `search_field1` directly
- Always use `normalizeCrudList()` / `normalizeCrudOne()` to parse responses
- Always keep client-side `.filter(item => !item.deleted_at)` as safety net
- Always use centralized `api` service; never create separate axios instances
- Prefer schema-driven fields via `getTableInfo()` over hardcoded forms
- Reference pickers must respect tenant isolation for tenant-scoped tables

### Architecture Patterns

- New business process = `service_order` + `workflow_template`, NOT a new screen
- New Kanban board = `KanbanScreen<T>` with callbacks; screen modals in `renderExtraModals`
- Partner-scoped screens use `usePartnerScope()` — CrudScreen filters `loadItems` client-side
- Trigger screens only create the `service_order` — workflow engine manages lifecycle
- Service functions with `partnerId?` param: omit = no filter = admin sees all
- Self-partner: `is_internal: true` instead of special-casing null partner_id

### Auth & Tenant

- Secure tokens in `SecureStore` (never AsyncStorage)
- Domain resolution via `services/tenant-resolver.ts` — never hardcode tenant lookups in auth
- Auto-link is best-effort (try/catch, never breaks auth); platform root never auto-links
- Tenant `slug` must be unique and URL-safe (`{slug}.radul.com.br`)

### Billing

- Limit enforcement via `services/saas-billing.ts` → `canAddClient()`, `canAddUser()`, `useTenantLimits()`
- Active client = interaction in last 90 days (`last_interaction_at` on `customers`)
- All SaaS invoices/AR on Radul tenant; `confirmSeatPayment()` handles 3 note types

### Code Style

- Named exports for reusable components, default exports for screens
- Error states: local `error` state, display via UI, never uncaught
- TypeScript strict mode; type-safe patterns preferred
