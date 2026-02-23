# SOSApp Copilot Instructions

## Project Overview

**SOS Platform** (formerly SOS Escritura) is an Expo-based React Native app (iOS, Android, web) — a **configurable operations platform** for any service-based business. Architecture: file-based routing with tab navigation, centralized API layer via N8N + PostgreSQL, schema-driven CrudScreen, data-driven workflow engine, and modular optional features.

### Product Vision

The platform follows a **3-layer architecture**:

1. **Core Platform** (always on): CrudScreen, Workflow Engine, Kanban, Users/RBAC, Notifications, Calendar, api_crud
2. **Optional Modules** (tenant activates what they need): Financial, CRM, Partners, Documents+, AI, BI, Time Tracking, Client Portal, ONR/Cartório (integration)
3. **Template Packs** (data, not code): Pre-configured service types, workflows, forms, and terminology per vertical (Genérico, Advocacia, Cobrança, Cartório integration, Contabilidade)

**Key principle:** 88% of the codebase is universal (any business). Only 4% are integrations (ONR/cartório module). The vertical is in the Template Pack (database configuration), not in code. Cartórios are NOT a target audience — they are service providers accessed via the ONR integration module by any business that needs to file documents at a notary office.

### Product Design Rules

1. **If it's CRUD, use CrudScreen** — the user learns once and knows everything
2. **Configuration in the database, not in code** — tenants customize via data
3. **New feature = optional module** — tenant activates only what they need
4. **Generic naming in core, domain naming in template** — code says "entity", template says "imóvel" or "processo"
5. **Tenant autonomy > feature power** — if a tenant can't configure it alone in 10 minutes, simplify it
6. **Template Pack resolves the vertical** — the niche is in pre-configured data, not hard-coded screens
7. **Each module is simple in isolation** — invoicing is a list with statuses, not SAP Finance

### Partner Strategy

The SOS is the **orchestrator, not the musician**. External partners are consumed invisibly — the user never leaves the SOS:

| Strategy                            | When                                       | Examples                                                                                        |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **BUILD**                           | It's our competitive differentiator        | Workflow Engine, CrudScreen, Kanban                                                             |
| **EMBED** (open-source self-hosted) | Mature OSS exists                          | N8N (backend), Documenso (signatures), Metabase (BI), Tesseract.js (OCR), Plausible (analytics) |
| **INTEGRATE** (external API)        | Regulated, commoditized, or years to build | MercadoPago (payments), ENotas (NFSe), WhatsApp, BrasilAPI, Gov.br                              |

**Rule:** Every partner MUST be consumed via a `services/partner.ts` wrapper. Never call a partner API directly from a component. This ensures swapping partners = changing 1 file, zero screens.

### Strategic Documents

- **Product Strategy:** [docs/ESTRATEGIA_PRODUTO.md](../docs/ESTRATEGIA_PRODUTO.md) — 3-layer architecture, module system, template packs, partner strategy, full roadmap
- **Market Study:** [docs/ESTUDO_MERCADO.md](../docs/ESTUDO_MERCADO.md) — 20 feature gaps vs 12 competitors, prioritization matrix

## Architecture & Key Patterns

### Routing Structure

- **File-based routing** via `expo-router` with `app/` directory convention
- **Root layout** ([app/\_layout.tsx](../app/_layout.tsx)): Theme provider, Stack navigation (tabs + modal)
- **App screens** live in `app/(app)/` with two main groups: `Servicos/` (client-facing) and `Administrador/` (admin-facing)
- **Auth screens** live in `app/(auth)/`
- **Public screens** live in `app/(public)/` — no auth required (e.g., portal público `/p/:token`, orçamento `/q/:token`)
- Page names map directly to routes; use `router.push()` and `router.replace()` for navigation

### API Integration

- **Centralized service**: [services/api.ts](../services/api.ts) exports axios instance with `baseURL: 'https://api.sosescrituras.com.br'`
- **Auth pattern**: Token stored in `expo-secure-store` (see `app/(auth)/`)
- **Error handling**: Use try-catch with user-facing error states; avoid exposing raw API errors

### Theme & Colors

- **Light/Dark mode**: `useColorScheme()` from `react-native` returns 'light'|'dark'
- **Themed components**: [components/themed-text.tsx](../components/themed-text.tsx) and `ThemedView` accept `lightColor`/`darkColor` props
- **Theme constants**: [components/themed-color.tsx](../components/themed-color.tsx) defines `Colors` and theme types per platform
- Apply theme colors via `useThemeColor()` hook for dynamic mode support

### Component Patterns

- Use **TypeScript** strictly (`"strict": true` in [tsconfig.json](../tsconfig.json))
- Path alias `@/*` resolves to root directory
- Reusable UI components in [components/](../components/) (text, view, tabs, icons)
- Platform-specific files: `.ios.ts`, `.web.ts` extensions (e.g., [hooks/use-color-scheme.web.ts](../hooks/use-color-scheme.web.ts))

### Entity Hierarchy (B2B2C Model)

| Entity          | Role                        | Key Table                | Description                                           |
| --------------- | --------------------------- | ------------------------ | ----------------------------------------------------- |
| **SuperTenant** | Platform Owner              | —                        | Raul — manages all tenants                            |
| **Tenant**      | System Buyer                | `tenants`                | Company/org that buys the SOS platform                |
| **User**        | Person who logs in          | `users` + `user_tenants` | Has role(s) within a tenant                           |
| **Customer**    | End client of tenant        | `customers`              | The person/company the tenant serves                  |
| **Partner**     | Service provider / Operator | `partners`               | External (or internal) operator assigned to customers |
| **Company**     | B2B grouping                | `companies`              | Groups customers under a corporate entity             |

**4 user role archetypes:**

1. **Admin Tenant** — full access to tenant's data and configuration
2. **Operador Tenant** — internal operator with limited admin access
3. **Operador Parceiro** — partner operator, sees only their assigned customers (via `users.partner_id → partners.id`)
4. **Client User** — external customer with portal-only access

**FK chain for partner scoping:** `users.partner_id → partners.id`, `customers.partner_id → partners.id`. A partner operator user sees only the customers assigned to the same partner.

### Multi-Domain Auth Flow

The platform supports **unified login/register** across multiple domains, automatically resolving which tenant a user belongs to based on the domain they access.

**Domain setup:**

| Domain Pattern           | Example                   | Resolution                              | Post-Auth Behavior                            |
| ------------------------ | ------------------------- | --------------------------------------- | --------------------------------------------- |
| **Platform root**        | `app.radul.com.br`        | `is_platform_root = true`               | User creates own tenant via onboarding wizard |
| **Tenant subdomain**     | `servicos.radul.com.br`   | Resolve `slug = "servicos"` → tenant    | Auto-link user as client of that tenant       |
| **Tenant custom domain** | `app.sosescritura.com.br` | Resolve `custom_domains` match → tenant | Auto-link user as client of that tenant       |

**Architecture layers:**

1. **`core/auth/tenant-context.ts`** — Detects `is_platform_root` by comparing hostname against `radul.com.br` / `app.radul.com.br` / `localhost` variants. Extracts `tenant_slug` from subdomain.
2. **`services/tenant-resolver.ts`** — `resolveTenantFromContext(context)` resolves domain → tenant via slug match or `custom_domains` JSONB scan. `autoLinkUserToTenant(userId, tenantId, role?)` creates `user_tenants` link with the tenant's `default_client_role`.
3. **`core/auth/AuthContext.tsx`** — All 4 auth functions (`login`, `googleLogin`, `govBrLogin`, `register`) call `tryAutoResolveTenant()` after `checkAndMergeUserData()`. If user has no `tenant_id` and domain resolves to a tenant, auto-links them.
4. **`migrations/add-tenant-slug-custom-domains.sql`** — Adds `slug` (unique text), `custom_domains` (JSONB array), `default_client_role` (text, default `'client'`) to `tenants` table.

**Auto-resolution flow (inside each auth function):**

```
login/register → checkAndMergeUserData(user)
  → if (!user.tenant_id && user.id):
    → tryAutoResolveTenant(userId, tenantContext)
      → if is_platform_root → skip (null)
      → resolveTenantFromContext(context)
        → try slug match via api_crud (search_field: "slug")
        → try custom_domains match (scan all tenants)
      → if tenant found → autoLinkUserToTenant(userId, tenantId, defaultRole)
        → check existing user_tenants (avoid duplicate)
        → find role by name matching defaultRole
        → create user_tenants row
      → return tenantId (or null)
    → if resolvedTenantId → set mergedUser.tenant_id
  → loadAvailableTenants(mergedUser)
```

**Key columns on `tenants` table:**

- `slug` — URL-safe unique identifier (e.g., `"servicos"`, `"advocacia-silva"`). Used for subdomain resolution: `{slug}.radul.com.br`
- `custom_domains` — JSONB array of custom domain strings (e.g., `["app.sosescritura.com.br", "sos.meudominio.com"]`)
- `default_client_role` — Role name to assign when auto-linking (default: `"client"`)

**Important rules:**

- Platform root (`app.radul.com.br`) NEVER auto-links — user goes through onboarding to create own tenant
- Auto-link is **best-effort** (try/catch → null) — never breaks the auth flow
- If user already has `tenant_id`, auto-resolve is skipped
- If user is already linked to the resolved tenant, no duplicate `user_tenants` row is created
- The `PLATFORM_ROOT_HOSTS` set in `tenant-resolver.ts` includes `localhost` and `127.0.0.1` for dev

### Tenant Branding (Auth Screens)

Auth screens (login, register, forgot-password) adapt their visual identity based on which domain the user accesses:

**Hook:** `useTenantBranding()` from `hooks/use-tenant-branding.ts`

```typescript
const {
  brandName,
  primaryColor,
  primaryDark,
  primaryLight,
  isPlatformRoot,
  loading,
  companyName,
  subtitle,
} = useTenantBranding();
```

**Behavior per domain:**

| Domain                                     | brandName                             | primaryColor                              | subtitle                  |
| ------------------------------------------ | ------------------------------------- | ----------------------------------------- | ------------------------- |
| `app.radul.com.br` (platform root)         | "Radul"                               | `#2563eb`                                 | "Plataforma de Operações" |
| `servicos.radul.com.br` (tenant subdomain) | `config.brand.name` or `company_name` | `config.brand.primary_color` or `#2563eb` | "Área de {company_name}"  |
| `app.sosescritura.com.br` (custom domain)  | same as above                         | same as above                             | same as above             |

**Data source:** `tenants.config` JSONB column, sub-object `brand`:

```json
{ "brand": { "name": "Meu Escritório", "primary_color": "#E53E3E" } }
```

**Color system:** `getAuthColors(primary, primaryDark, primaryLight)` returns a full palette (screen bg, card bg, input styles, text colors, error colors) that respects dark mode via `Appearance.getColorScheme()`.

**Design pattern:** All 3 auth screens share the same visual structure:

1. **Logo circle** — first letter of `brandName` on `primaryLight` background
2. **Brand title** — `brandName` in bold
3. **Tenant badge** (non-platform-root only) — pill badge with business icon + "Área de {company}"
4. **Card** with form fields, all using `colors.*` from `getAuthColors()`

**To add branding for a tenant:** Update `tenants.config` JSONB to include `{ "brand": { "name": "...", "primary_color": "#hexcolor" } }`.

### Onboarding Branding Fields

During tenant creation (onboarding wizard — `app/(app)/Usuario/onboarding.tsx`), Step 1 collects branding alongside company info:

| Field               | Required | Default                          | Stored in                            |
| ------------------- | -------- | -------------------------------- | ------------------------------------ |
| **Nome da empresa** | ✅       | —                                | `tenants.company_name`               |
| **WhatsApp**        | ✅       | Pre-filled from user profile     | `tenants.whatsapp_number`            |
| **CNPJ**            | ❌       | —                                | `tenants.config.cnpj`                |
| **Nome da marca**   | ❌       | Falls back to `company_name`     | `tenants.config.brand.name`          |
| **Cor principal**   | ❌       | `#2563eb` (Radul blue)           | `tenants.config.brand.primary_color` |
| **Endereço web**    | ❌       | Auto-generated from company name | `tenants.slug`                       |

**Color picker:** 8 preset swatches (blue, red, orange, green, purple, pink, teal, dark) + custom hex input. Preview circle shown beside hex field.

**Slug:** Shown as `https://{slug}.radul.com.br`. Auto-generated via `generateSlug()` from `services/onboarding.ts` (removes accents, lowercases, replaces non-alphanumeric with hyphens).

**Service flow:** `OnboardingCompanyData` type includes optional `brand_name`, `primary_color`, `slug`. `createTenant()` always writes `config.brand` (using defaults when fields are empty), and saves `slug` to the tenants row.

### Screen Reuse & Business Process Patterns

**Core Principle: Every business process = a `service_order` with a `workflow_template`. New verticals reuse existing screens — never create dedicated screens per process type.**

Instead of building custom screens for each business vertical (debt collection, legal process, property registration, etc.), the platform reuses the same core screens with scoped data:

| Reusable Screen          | File                         | What It Does                               | How It's Reused                                                                    |
| ------------------------ | ---------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Kanban**               | `kanban-processos.tsx`       | Visual pipeline grouped by workflow step   | ALL process types — columns come from `workflow_steps`, cards are `service_orders` |
| **Processo**             | `Processo.tsx`               | Single process detail + timeline + updates | ALL service orders — renders fields from `service_order_context`                   |
| **Portal Público**       | `app/(public)/p/[token].tsx` | Client-facing read-only portal             | ALL processes with `public_access_tokens`                                          |
| **ContasAReceber**       | `ContasAReceber.tsx`         | Financial receivables (CrudScreen)         | All tenants — scoped by partner via `usePartnerScope` client-side filter           |
| **Inadimplentes**        | `Inadimplentes.tsx`          | Overdue payment dashboard + trigger        | All tenants — scoped by `partnerId` passed to SQL functions                        |
| **CrudScreen** (generic) | `CrudScreen.tsx`             | Any CRUD table                             | Tenant + partner filtered via `loadItems`                                          |

**Pattern: New business capability = Template Pack + service function, NOT new screens.**

Example — Debt Collection (Cobrança):

1. **Template Pack** (`data/template-packs/cobranca.ts`) defines: 6 service types, 4 workflow templates (7-step collection process), forms, documents, roles
2. **Service function** (`services/collection.ts`) creates a `service_order` and links `accounts_receivable` entries via `service_order_context`
3. **Inadimplentes screen** triggers collection via "Iniciar Cobrança" button → creates SO → navigates to Kanban
4. The process follows the standard workflow engine: **Kanban → Processo → Portal → process_updates → deadlines → step_forms**
5. **Zero new screens were created** — all existing screens are reused with the new workflow template

**When to create a new screen vs. reuse:**

- ✅ **Reuse** when the feature is a process with steps → service_order + workflow_template
- ✅ **Reuse** when the feature is a CRUD list/form → CrudScreen with field config
- ✅ **Reuse** when the feature needs a client-facing view → Portal Público with public_access_token
- ❌ **Create** only when the UX is fundamentally different (e.g., Inadimplentes dashboard with KPIs, calendar view, BI dashboards)

### Partner Scope Pattern (usePartnerScope)

For B2B2C multi-tenancy, partner operators must see only their assigned data. The `usePartnerScope()` hook ([hooks/use-partner-scope.ts](../hooks/use-partner-scope.ts)) resolves the current user's partner context:

```typescript
import { usePartnerScope } from "@/hooks/use-partner-scope";

const { partnerId, isPartnerUser, customerIds, isInternalPartner, loading } =
  usePartnerScope();
```

**Scoping rules:**

- **Admin/tenant users:** `isPartnerUser = false` → see all data (no filtering needed)
- **Partner operators:** `isPartnerUser = true` → filter by `partnerId` or `customerIds`
- **Internal partner** (`is_internal = true`): Tenant's own "self-partner" for uniform filtering

**Usage patterns by screen type:**

| Screen Type                 | Scoping Method                                                        | Example                                                        |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| CrudScreen-based            | Filter `loadItems` result client-side using `customerIds` Set         | ContasAReceber filters `item.customer_id`                      |
| Custom SQL screens          | Pass `partnerId` to service functions that add `WHERE partner_id = ?` | Inadimplentes passes `partnerId` to `getDelinquentCustomers()` |
| Financial service functions | All accept optional `partnerId?` parameter                            | `getDelinquencySummary(tenantId, partnerId?)`                  |

**CrudScreen scoping pattern:**

```typescript
const { isPartnerUser, customerIds } = usePartnerScope();

const loadItems = useMemo(
  () => async () => {
    const items = await loadItemsForTenant(tenantId);
    if (!isPartnerUser || customerIds.length === 0) return items;
    const allowedSet = new Set(customerIds);
    return items.filter((item) =>
      allowedSet.has(String(item.customer_id ?? "")),
    );
  },
  [tenantId, isPartnerUser, customerIds],
);
```

### Self-Partner Pattern

When a tenant does their own operations (not delegating to external partners), they create an **internal partner** record (`is_internal: true` on `partners` table). This allows uniform `WHERE partner_id = ?` filtering without special-casing "tenant does it themselves". The tenant's operator users get `users.partner_id` pointing to this self-partner.

### Trigger Screen → Process Pattern

Some screens act as **triggers** for starting a new business process. The pattern is:

1. **Dashboard/list screen** shows actionable data (e.g., Inadimplentes shows overdue customers)
2. **Action button** on each item (e.g., "Iniciar Cobrança")
3. **Service function** checks for duplicates (`hasActiveCollection`) → creates `service_order` + `service_order_context` → returns the SO ID
4. **Navigate** to Kanban or Processo screen: `router.push({ pathname: "/Servicos/Processo", params: { serviceOrderId } } as any)`
5. From there, standard workflow engine takes over (steps, tasks, forms, deadlines, portal)

**Key: the trigger screen does NOT manage the process. It only creates the service_order and hands off to the workflow engine.**

---

## CRUD System (api_crud)

### Overview

All database operations go through a **Cloudflare Worker** (`sos-api-crud`). The app sends POST requests to `api_crud` with an `action` + `table` + optional filters/payload. The Worker builds dynamic SQL with parameterized queries and executes against PostgreSQL via direct TCP connection.

**The CrudScreen component** ([components/ui/CrudScreen.tsx](../components/ui/CrudScreen.tsx)) is the core DNA of the product — a ~3,000-line generic, schema-aware CRUD component that renders any table. **37+ screens** use it. Any improvement to CrudScreen benefits ALL screens automatically.

### CrudScreen Field Types (CrudFieldConfig<T>)

```typescript
export type CrudFieldType =
  | "text"
  | "multiline"
  | "json"
  | "reference"
  | "boolean"
  | "select"
  | "date"
  | "datetime"
  | "currency"
  | "number"
  | "email"
  | "phone"
  | "url"
  | "masked";

export type CrudFieldConfig<T> = {
  key: keyof T & string;
  label: string;
  placeholder?: string;
  type?: CrudFieldType; // defaults to "text"
  options?: CrudSelectOption[]; // for type="select"
  required?: boolean; // empty string check on save
  visibleInList?: boolean; // show in card detail
  visibleInForm?: boolean; // show in create/edit modal
  readOnly?: boolean; // works on ALL field types including boolean/reference
  validate?: (
    value: string,
    formState: Record<string, string>,
  ) => string | null; // custom validation
  showWhen?: (formState: Record<string, string>) => boolean; // conditional visibility
  section?: string; // field section/group header
  maskType?: "cpf" | "cnpj" | "cep" | "phone" | "cpf_cnpj"; // for type="masked"
  referenceTable?: string; // FK table for type="reference"
  referenceLabelField?: string; // display column
  referenceIdField?: string; // PK column (default "id")
  referenceSearchField?: string; // search column for reference picker
  referenceFilter?: (item, state) => boolean;
  referenceLabelFormatter?: (item, defaultLabel, state) => string;
};
```

### CrudScreen Props<T>

```typescript
type Props<T> = {
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  searchFields?: string[]; // which keys are searchable
  fields: CrudFieldConfig<T>[];
  loadItems: () => Promise<T[]>;
  paginatedLoadItems?: (params: {
    limit: number;
    offset: number;
  }) => Promise<T[]>;
  pageSize?: number; // default 20, used with paginatedLoadItems
  createItem: (payload) => Promise<unknown>;
  updateItem: (payload) => Promise<unknown>;
  deleteItem?: (payload) => Promise<unknown>;
  getId: (item: T) => string;
  getTitle: (item: T) => string;
  getDetails?: (item: T) => DetailItem[];
  renderItemActions?: (item: T) => ReactNode;
  renderCustomField?: (
    field,
    value,
    onChange,
    formState,
    setFormState,
  ) => ReactNode | null;
};
```

### CrudScreen Capabilities & Limitations

| Feature                | Status | Notes                                                                |
| ---------------------- | ------ | -------------------------------------------------------------------- |
| Schema-driven fields   | ✅     | `convertTableInfoToFields()` auto-generates from DB schema           |
| Reference resolution   | ✅     | Auto-fetches FK labels. ⚠️ N+1 problem (1 request per ref per row)   |
| Quick-create nested    | ✅     | Create referenced entities inline with modal stack                   |
| AI insights button     | ✅     | Sends screen context to N8N AI agent                                 |
| Diagnostics system     | ✅     | Full error diagnostic with copy-to-clipboard                         |
| Responsive 4-tier      | ✅     | <360, <768, <1200, ≥1200 breakpoints                                 |
| Client-side search     | ✅     | String includes() across configured fields                           |
| Date/datetime picker   | ✅     | Native picker mobile, `<input type="date">` web, pt-BR locale        |
| Currency/number input  | ✅     | `decimal-pad` keyboard, R$ formatting, auto-parse on save            |
| Field validation       | ✅     | `validate?: (value, formState) => string \| null` per field          |
| Conditional visibility | ✅     | `showWhen?: (formState) => boolean` hides fields from form           |
| KeyboardAvoidingView   | ✅     | Wraps form modal on iOS/Android                                      |
| Email/phone/url types  | ✅     | Proper keyboards + autoCapitalize/autoComplete                       |
| readOnly on all types  | ✅     | Works on boolean, reference, select — not just text                  |
| Smart type detection   | ✅     | `*_amount`→currency, `*_at`→datetime, `email`→email, etc.            |
| Required field marker  | ✅     | `*` shown next to required field labels                              |
| Server-side pagination | ✅     | Optional `paginatedLoadItems` prop, 20/page, "Carregar mais" UI      |
| Batch ref resolution   | ✅     | 1 request per ref table via `in` operator, chunked at 50 IDs         |
| Masked input           | ✅     | `type: "masked"` + `maskType` prop (cpf, cnpj, cep, phone, cpf_cnpj) |
| Field sections/groups  | ✅     | `section` prop renders headers when section changes between fields   |
| Bulk actions           | ❌     | No multi-select                                                      |
| Export CSV/PDF         | ❌     | No export capability                                                 |
| Table view (desktop)   | ❌     | Always card list — no column grid                                    |

### Roadmap: CrudScreen Improvements (Fase -1)

When implementing CrudScreen improvements, follow this priority:

**Tier 1 (Critical — blocks financial modules): ✅ ALL DONE**

1. ✅ `date`/`datetime` field type with native date picker
2. ✅ `currency`/`number` field type with numeric keyboard + locale formatting
3. ✅ Server-side pagination via `paginatedLoadItems` prop + `limit`/`offset` in `buildSearchParams`
4. ✅ Batch reference resolution (1 request per ref table via `in` operator)
5. ✅ Field-level validation: `validate?: (value, formState) => string | null`
6. ✅ `KeyboardAvoidingView` in edit modal

**Tier 2 (Important — CRM, Portal, Partners): ✅ ALL DONE** 7. ✅ `email`/`phone`/`url` field types with proper keyboards 8. ✅ `masked` field type (CPF/CNPJ/CEP/phone) with `maskType` prop 9. ✅ Conditional visibility: `showWhen?: (formState) => boolean` 10. ✅ Field sections: `section?: string` renders headers when section changes 11. ✅ Fix `readOnly` on boolean and reference types 12. ✅ Auto-exclude soft-deleted: `autoExcludeDeleted` option in `buildSearchParams`

**Tier 3 (Scale):** 13. CSV/PDF export from list view 14. Bulk selection + actions 15. Table view for desktop alongside card view 16. ✅ Consolidate copies of `convertTableInfoToFields` into 1 shared utility 17. ✅ Smart type detection: `*_amount` → currency, `*_at` → datetime, `email` → email 18. ✅ Aggregation endpoint: `action: "aggregate"` with SUM, COUNT, AVG, GROUP BY

### Endpoint & Constants

```ts
// services/crud.ts
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://api-crud.sosescritura.com.br";
export const CRUD_ENDPOINT = `${API_BASE}/api_crud`;
export const API_DINAMICO = `${API_BASE}/api_dinamico`;
```

### Actions

| Action         | Purpose                                | Required Body Fields                                                                                               | Returns                        |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `list`         | SELECT rows with optional filters/sort | `action`, `table`, optional `search_field1..8`, `sort_column`, `limit`, `offset`, `fields`, `auto_exclude_deleted` | `[{row}, ...]`                 |
| `create`       | INSERT a new row                       | `action`, `table`, `payload: { field: value, ... }`                                                                | `[{full row with id, ...}]` ✅ |
| `update`       | UPDATE existing row(s)                 | `action`, `table`, `payload: { id: '...', field: value, ... }`                                                     | `[{full updated row}]` ✅      |
| `delete`       | Soft-delete (sets `deleted_at`)        | `action`, `table`, `payload: { id: '...', deleted_at?: '...' }`                                                    | `[{deleted row}]` ✅           |
| `count`        | COUNT rows **with filter support**     | `action`, `table`, optional `search_field1..8`, `auto_exclude_deleted`                                             | `[{count: N}]` ✅              |
| `aggregate`    | SUM/COUNT/AVG/MIN/MAX with GROUP BY    | `action`, `table`, `aggregates: [{function, field, alias}]`, optional `group_by`, filters                          | `[{group + agg values}]`       |
| `batch_create` | INSERT multiple rows in one request    | `action`, `table`, `payload: [{...}, {...}, ...]` (array)                                                          | `[{row1}, {row2}, ...]` ✅     |

**v2 key improvements:** All write actions (`create`, `update`, `delete`, `batch_create`) now return `RETURNING *` — the full row including `id`, `created_at`, and all auto-generated columns. `count` now supports filters. `list` supports `fields` selection and server-side `auto_exclude_deleted`.

### Filter Format (NEW — search_field1..8)

The app uses `buildSearchParams()` from `services/crud.ts` to build flat filter parameters:

```ts
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import { api } from "@/services/api";

// List with filters
const res = await api.post(CRUD_ENDPOINT, {
  action: "list",
  table: "notifications",
  ...buildSearchParams(
    [
      { field: "user_id", value: userId },
      { field: "is_read", value: "false", operator: "equal" },
    ],
    { sortColumn: "created_at DESC", combineType: "AND" },
  ),
});
const items = normalizeCrudList<Notification>(res.data);
```

This generates flat params: `search_field1: "user_id"`, `search_value1: userId`, `search_operator1: "equal"`, `search_field2: "is_read"`, `search_value2: "false"`, etc.

**Available operators:** `equal` (default), `not_equal`, `like`, `ilike`, `gt`, `gte`, `lt`, `lte`, `in`, `is_null`, `is_not_null`

**Maximum 8 filters** per request. Use `combine_type: "AND" | "OR"` for combining.

**sort_column** accepts column name + optional direction: `"created_at DESC"`, `"name ASC"`. Multi-column sort is supported: `"status ASC, created_at DESC"`

### Key Exports from services/crud.ts

| Export                                      | Type        | Purpose                                                                        |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| `CRUD_ENDPOINT`                             | `const`     | API base + `/api_crud` (env-driven)                                            |
| `CrudFilter`                                | `interface` | `{ field, value, operator? }`                                                  |
| `CrudListOptions`                           | `interface` | `{ combineType?, sortColumn?, limit?, offset?, autoExcludeDeleted?, fields? }` |
| `buildSearchParams(filters, options?)`      | `function`  | Builds flat search params                                                      |
| `normalizeCrudList<T>(data)`                | `function`  | Normalizes response → `T[]`                                                    |
| `normalizeCrudOne<T>(data)`                 | `function`  | Extracts single record                                                         |
| `batchCreate<T>(table, items[])`            | `function`  | Multi-row INSERT via `batch_create` action → `T[]`                             |
| `countCrud(table, filters?, options?)`      | `function`  | COUNT with filters → `number`                                                  |
| `AggregateColumn`                           | `interface` | `{ function, field, alias? }`                                                  |
| `AggregateOptions`                          | `interface` | `{ groupBy?, filters?, sortColumn?, limit? }`                                  |
| `buildAggregatePayload(table, aggs, opts?)` | `function`  | Builds aggregate request payload                                               |
| `aggregateCrud<T>(table, aggs, opts?)`      | `function`  | Executes aggregate query → `T[]`                                               |
| `createCrudService<T>(endpoints)`           | `function`  | Factory for `{ list, create, update }`                                         |

### api_crud Limitations (known)

| Limitation                      | Impact                                        | Workaround                                 |
| ------------------------------- | --------------------------------------------- | ------------------------------------------ |
| **Max 8 filters**               | Cannot build complex financial queries        | Use `api_dinamico` for complex reports     |
| **No JOINs**                    | Forces N+1 in CrudScreen reference resolution | Client-side reference cache                |
| **No transactions**             | Cannot create invoice + line items atomically | Sequential creates (risk of partial state) |
| **No batch update/delete**      | Cannot update 50 rows in one call             | Loop through individual updates            |
| **Empty result = empty string** | Returns `""` instead of `[]` when 0 rows      | `normalizeCrudList()` already handles this |

**Capabilities (v2 — all confirmed working):**

- ✅ **CREATE/UPDATE/DELETE return full row** with `id`, `created_at` etc. (`RETURNING *`)
- ✅ **Batch create**: `action: "batch_create"`, `payload: [{...}, ...]` — multi-row INSERT
- ✅ **COUNT with filters**: `count` now supports all `search_field1..8` filters
- ✅ **Field selection**: `fields: ["id", "name"]` in list action → `SELECT id, name` instead of `*`
- ✅ **Server-side `auto_exclude_deleted`**: adds `WHERE deleted_at IS NULL` without consuming a filter slot
- ✅ Multi-column sort: `"status ASC, created_at DESC"` works
- ✅ `limit` + `offset` pagination via `buildSearchParams`
- ✅ All 11 operators: `equal`, `not_equal`, `like`, `ilike`, `gt`, `gte`, `lt`, `lte`, `in`, `is_null`, `is_not_null`
- ✅ `combine_type: "AND" | "OR"`
- ✅ Aggregation: SUM, COUNT, AVG, MIN, MAX with GROUP BY
- ✅ All identifiers validated (SQL injection safe)
- ✅ Legacy search format (`search` + `search_field` with ILIKE) still works

### Schema Introspection (services/schema.ts)

`getTableInfo(table)` returns `TableInfoRow[]` with:

```typescript
export type TableInfoRow = {
  column_name: string;
  data_type: string; // "uuid", "text", "boolean", "jsonb", "character varying", "timestamp with time zone"
  udt_name?: string | null; // "varchar", "int4", "timestamptz"
  is_nullable?: string | null; // "YES" | "NO"
  column_default?: string | null; // "gen_random_uuid()", "now()"
  referenced_table_name?: string | null; // FK target table (from constraint JOINs)
  referenced_column_name?: string | null; // FK target column
};
```

`convertTableInfoToFields<T>(rows)` auto-generates `CrudFieldConfig<T>[]`:

- FK columns (`referenced_table_name`) → `type: "reference"`
- `boolean` data type → `type: "boolean"`
- `json`/`jsonb` → `type: "json"`
- `is_*`/`has_*`/`can_*`/`allow_*` prefix → `type: "boolean"`
- System columns excluded: `id`, `created_at`, `updated_at`, `deleted_at`
- **⚠️ Does NOT detect:** dates → still text, money → still text, email → still text, enums → still text

### Client-Side Filtering Pattern

Always keep client-side `.filter()` as a safety fallback after server-side filtering:

```ts
const list = normalizeCrudList<Item>(res.data)
  .filter((item) => !item.deleted_at) // soft-delete safety
  .filter((item) => String(item.user_id) === String(userId)); // extra safety
```

### CrudScreen Reference Lookups

`components/ui/CrudScreen.tsx` uses raw `search_field1/value1/operator1` for reference resolution in dropdowns and labels. Key field config properties: `referenceTable`, `referenceIdField` (defaults to `"id"`), `referenceLabelField`, `referenceSearchField`, `referenceFilter`.

---

## KanbanScreen (Generic Kanban Board)

### Overview

**`KanbanScreen<T>`** ([components/ui/KanbanScreen.tsx](../components/ui/KanbanScreen.tsx)) is a generic, reusable Kanban board component — the Kanban equivalent of CrudScreen. One component renders any pipeline/board, driven by callbacks. **2 screens** currently use it.

### Key Types

```typescript
export interface KanbanColumnDef {
  id: string; // unique column identifier (step ID or status string)
  label: string; // column header text
  color: string; // header background color (hex)
  order: number; // sort position (ascending)
  description?: string;
}

export interface KanbanTheme {
  bg: string;
  cardBg: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  tintColor: string;
}

export interface KanbanScreenRef {
  reload: () => void; // force reload columns + items
}
```

### Key Props

| Prop                                  | Type                                                           | Purpose                                                  |
| ------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| `loadColumns`                         | `() => Promise<KanbanColumnDef[]>`                             | Fetch column definitions (called on mount + reload)      |
| `loadItems`                           | `() => Promise<T[]>`                                           | Fetch all items to display on the board                  |
| `getId`                               | `(item: T) => string`                                          | Extract unique ID from an item                           |
| `getColumnId`                         | `(item: T) => string`                                          | Determine which column an item belongs to                |
| `getCardTitle`                        | `(item: T) => string`                                          | Card title text                                          |
| `renderCard`                          | `(item: T, columnId: string, theme: KanbanTheme) => ReactNode` | Full custom card (overrides default)                     |
| `getCardFields`                       | `(item: T) => KanbanCardField[]`                               | Metadata rows for default card                           |
| `getCardActions`                      | `(item: T, columnId: string) => KanbanCardAction[]`            | Action buttons for default card                          |
| `onMoveItem`                          | `(item: T, toColumnId: string) => Promise<void>`               | Move handler (enables built-in move modal on long-press) |
| `onCardPress`                         | `(item: T) => void`                                            | Tap on card title                                        |
| `searchFields`                        | `(item: T) => (string \| null \| undefined)[]`                 | Searchable values per item                               |
| `renderExtraModals`                   | `() => ReactNode`                                              | Extra modals (tasks, create, etc.)                       |
| `headerBefore` / `headerAfter`        | `ReactNode`                                                    | Slots before title / after search bar                    |
| `createButtonLabel` + `onCreatePress` | `string` + `() => void`                                        | Add button next to title                                 |
| `getSubtitle`                         | `(total, visible) => string`                                   | Dynamic subtitle with counts                             |

### Screens Using KanbanScreen

| Screen                  | File                                           | Type Param         | Board Source                                 |
| ----------------------- | ---------------------------------------------- | ------------------ | -------------------------------------------- |
| **Kanban de Processos** | `app/(app)/Administrador/kanban-processos.tsx` | `ServiceOrderItem` | workflow_steps columns, service_orders items |
| **CRM Pipeline**        | `app/(app)/Administrador/crm-kanban.tsx`       | `Lead`             | KANBAN_STAGES columns, leads items           |

### Usage Pattern

```tsx
import { KanbanScreen, type KanbanScreenRef } from "@/components/ui/KanbanScreen";

const kanbanRef = useRef<KanbanScreenRef>(null);

<KanbanScreen<MyItem>
  ref={kanbanRef}
  title="My Board"
  loadColumns={async () => [...]}
  loadItems={async () => [...]}
  getId={(item) => item.id}
  getColumnId={(item) => item.status}
  getCardTitle={(item) => item.name}
  onMoveItem={async (item, toCol) => { ... }}
  renderCard={(item, colId, theme) => <MyCard ... />}
  renderExtraModals={() => <MyModals ... />}
/>

// Trigger reload from outside:
kanbanRef.current?.reload();
```

### Features

| Feature                        | Status | Notes                                                      |
| ------------------------------ | ------ | ---------------------------------------------------------- |
| Generic `<T>` type             | ✅     | Same pattern as CrudScreen                                 |
| Theme-aware (light/dark)       | ✅     | 6-color KanbanTheme object                                 |
| Horizontal scroll + web arrows | ✅     | Arrow buttons on web, native scroll on mobile              |
| Built-in move modal            | ✅     | Long-press card → select target column                     |
| Built-in search                | ✅     | Filters items across `searchFields`                        |
| Pull-to-refresh (native)       | ✅     | RefreshControl on mobile                                   |
| Custom card (`renderCard`)     | ✅     | Full override with theme object                            |
| Default card                   | ✅     | getCardTitle + getCardFields + getCardActions              |
| Header slots                   | ✅     | `headerBefore` + `headerAfter` for back buttons, nav chips |
| Create button                  | ✅     | `createButtonLabel` + `onCreatePress`                      |
| Extra modals slot              | ✅     | `renderExtraModals` for screen-specific modals             |
| Ref with `reload()`            | ✅     | External trigger for data refresh                          |

---

## Backend Architecture (Cloudflare Workers + N8N)

The backend uses a **dual architecture**:

1. **Cloudflare Worker (`sos-api-crud`)** — handles all CRUD operations, dynamic SQL, and schema introspection. This is the primary API for all screen data operations.
2. **N8N (`n8n.sosescritura.com.br`)** — handles automations, cron jobs, and specialized webhooks (WhatsApp, PDF generation, Gov.br, ONR, calendar sync, robot).

### Cloudflare Worker (Primary API)

**Worker name:** `sos-api-crud`
**URL:** `https://sos-api-crud.raulcamilotti-c44.workers.dev` (production: `https://api-crud.sosescritura.com.br`)
**Source:** `workers/api-crud/` directory
**Runtime:** Cloudflare Workers with `nodejs_compat` flag, `pg` npm package for PostgreSQL
**Auth:** `X-Api-Key` header checked against `API_KEY` secret
**DB connection:** Direct TCP to PostgreSQL (no SSL — Hyperdrive requires SSL, PG server doesn't support it yet)

#### Worker Endpoints

| Endpoint         | Method | Path            | Auth     | Purpose                                                                                  |
| ---------------- | ------ | --------------- | -------- | ---------------------------------------------------------------------------------------- |
| **api_crud**     | POST   | `/api_crud`     | Required | Dynamic CRUD ops (list/create/update/delete/count/aggregate/batch_create)                |
| **api_dinamico** | POST   | `/api_dinamico` | Required | Execute arbitrary SQL (`{ sql: "SELECT ..." }`) — for migrations, scripts, complex joins |
| **tables_info**  | POST   | `/tables_info`  | Required | Dynamic column info via `{ table_name: "..." }` — returns schema for a specific table    |
| **tables**       | GET    | `/tables`       | Required | Lists all public tables                                                                  |
| **health**       | GET    | `/health`       | None     | Health check + DB connectivity test                                                      |

Backward-compatible paths (`/webhook/api_crud`, etc.) are also supported for migration safety.

#### Worker Project Structure

```
workers/api-crud/
├── package.json          # deps: pg, @types/pg, wrangler
├── tsconfig.json         # ES2022, bundler moduleResolution
├── wrangler.toml         # nodejs_compat, secrets config
└── src/
    ├── index.ts          # Main fetch handler: routing, CORS, auth, error handling
    ├── sql-builder.ts    # All 7 action SQL builders (list, create, update, delete, count, aggregate, batch_create)
    ├── db.ts             # PG connection via `pg` Client (ssl: false, direct TCP)
    └── types.ts          # Env, CrudRequestBody, AggregateColumn, QueryResult
```

#### Worker Secrets

| Secret         | Purpose                                               |
| -------------- | ----------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string (with `sslmode=disable`) |
| `API_KEY`      | Auth key for X-Api-Key header validation              |

#### Worker Internal Flow

```
POST /api_crud → Auth check → Parse body → Switch (by action)
  ├─ list         → sql-builder.buildList() → db.executeQuery() → Respond 200
  ├─ create       → sql-builder.buildCreate() → db.executeQuery() → Respond 200
  ├─ update       → sql-builder.buildUpdate() → db.executeQuery() → Respond 200
  ├─ delete       → sql-builder.buildDelete() → db.executeQuery() → Respond 200
  ├─ count        → sql-builder.buildCount() → db.executeQuery() → Respond 200
  ├─ aggregate    → sql-builder.buildAggregate() → db.executeQuery() → Respond 200
  └─ batch_create → sql-builder.buildBatchCreate() → db.executeQuery() → Respond 200
```

**Response format:**

- Success with results: HTTP 200, `[{id, name, ...}, ...]`
- Success with 0 results: HTTP 200, **empty string `""`** (not empty array)
- Error: HTTP 400, `{"error": "description"}`
- Auth failure: HTTP 401, `{"error": "Unauthorized"}`

### N8N (Automations & Specialized Webhooks)

**URL:** `https://n8n.sosescritura.com.br`
**Workflow ID:** `Ar17RgJt19MHQwbJqD8ZK`

N8N remains for workflows that are NOT simple CRUD — automations, cron jobs, and integrations:

| Endpoint / Webhook         | Purpose                                       | Used By                 |
| -------------------------- | --------------------------------------------- | ----------------------- |
| `/webhook/conversations`   | WhatsApp chat management                      | `operator-chat.ts`      |
| `/webhook/conversations_*` | Chat sessions, stats                          | `operator-chat.ts`      |
| `/webhook/generate_pdf`    | PDF document generation                       | `document-templates.ts` |
| `/webhook/govbr_login`     | Gov.br OAuth login                            | `gov-br.ts`             |
| `/webhook/onr_*`           | ONR/SREI notary integration                   | `onr-srei.ts`           |
| `/webhook/<robot-uuid>`    | Robot automation triggers                     | `robot.ts`              |
| `/webhook/calendar_*`      | Calendar sync operations                      | `calendar-sync.ts`      |
| `/webhook/icp_*`           | ICP-Brasil digital certificate ops            | `icp-brasil.ts`         |
| Cron jobs                  | Nightly active client tracking, notifications | N8N internal triggers   |

### Dynamic SQL Details

**LIST action:**

- Parses `search_field1..8` / `search_value1..8` / `search_operator1..8` from the request body
- Maps operators: `equal` → `=`, `like` → `LIKE`, `gt` → `>`, `in` → `IN (...)`, `is_null` → `IS NULL`, etc.
- Supports `combine_type` (AND/OR), multi-column `sort_column`, `fields` selection
- When `auto_exclude_deleted: true`, adds `WHERE deleted_at IS NULL` without consuming a filter slot
- **Uses `ORDER BY 1`** as fallback when no sort is specified
- Falls back to legacy `body.search` / `body.search_field` (ILIKE) for backward compatibility
- All identifiers validated against `/^[a-zA-Z_][a-zA-Z0-9_]*$/` (SQL injection safe)

**CREATE/UPDATE/DELETE actions:**

- All use `RETURNING *` — returns the full row including `id`, `created_at`, and auto-generated columns
- UPDATE auto-detects match column: `session_id` for `controle_atendimento`, `id` for everything else
- DELETE auto-generates `deleted_at = now()` if not provided in payload

### Database Schema Constraints

**Tables without `id` column (use composite keys):**
| Table | Primary Key | Has `deleted_at`? |
|-------|------------|-------------------|
| `role_permissions` | `role_id` + `permission_id` | Yes |
| `controle_atendimento` | `session_id` | **No** |

**Tables without `deleted_at` column:**
| Table | Has `id`? | Notes |
|-------|-----------|-------|
| `controle_atendimento` | No | PK is `session_id` |
| `service_order_context` | Yes | Links service_orders to entities (properties, etc.) |

When working with these tables:

- Never assume `ORDER BY "id"` works — use `sort_column` explicitly or rely on `ORDER BY 1`
- Never assume `deleted_at` exists — client-side `.filter(item => !item.deleted_at)` is harmless even if the field doesn't exist
- For `role_permissions`, use `referenceIdField: "role_id"` or filter by `role_id`

### Key Database Tables

**Core business:**
`properties`, `customers`, `service_orders`, `service_order_context`, `service_types`, `service_categories`, `services`

**Workflow engine:**
`workflow_templates`, `workflow_steps`, `workflow_step_transitions`, `tasks`, `task_variables`, `step_task_templates`, `step_forms`, `step_form_responses`

**Process tracking:**
`process_updates`, `process_update_files`, `process_deadlines`, `deadline_rules`, `process_document_requests`, `process_document_responses`, `process_logs`

**Auth & tenants:**
`users`, `user_tenants`, `tenants`, `roles`, `role_permissions`, `permissions`, `auth_codes`, `auth_tokens`

**Documents:**
`document_templates`, `generated_documents`, `document_signatures`, `client_files`, `protocol_documents`

**External integrations:**
`onr_protocolos`, `onr_certidoes`, `brasil_api_cache`, `cartorios`, `calendar_sync_settings`

**Companies:**
`companies`, `company_members`, `business_units`

**Notifications:**
`notifications`, `notification_preferences`, `notification_deliveries`

**Portal público:**
`public_access_tokens`, `process_reviews`

**Orçamentos (Quotes):**
`quotes`, `quote_items`

**Partners:**
`partners`, `partner_availability`, `partner_time_off`, `partner_rating_summary`, `partner_earnings`, `service_appointments`, `appointment_logs`, `service_executions`, `service_reviews`, `review_logs`

**Financial:**
`invoices`, `invoice_items`, `payments`

**WhatsApp / Chat:**
`controle_atendimento`, `contexto_conversa`, `n8n_chat_histories`, `buffer_chat_history`, `buffer_mensagens_manuais`, `whatsapp_contacts`

**Analytics & AI:**
`analytics_events`, `agents`, `agent_states`, `automations`, `automation_executions`, `ocr_config`, `ocr_results`

**Buffers & staging:**
`buffer_customers`, `buffer_properties`, `properties_staging`, `properties_preview`, `customer_classifications`

---

## Template Packs System

### Overview

Template packs are portable JSON bundles of pre-configured data for specific business verticals. When a new tenant is created (or an existing tenant switches verticals), a pack is applied to seed 13+ tables with categories, service types, workflows, roles, documents, and more.

### Architecture

```
data/template-packs/
├── types.ts          # TypeScript types (TemplatePack, PackSummary, etc.)
├── index.ts          # Pack registry (PACKS map, getAllPackSummaries, getPackByKey)
├── generico.ts       # Empresa de Serviços (Genérico) pack
├── advocacia.ts      # Escritório de Advocacia pack
└── cartorio.ts       # Cartório & Registro pack (for businesses that work WITH cartórios)

services/template-packs.ts   # Apply/clear/validate functions
app/(app)/Administrador/template-packs.tsx  # Admin UI for pack selection
```

### Available Packs

| Pack Key    | Name                           | Service Types | Workflows | Modules | Notes                                                        |
| ----------- | ------------------------------ | ------------- | --------- | ------- | ------------------------------------------------------------ |
| `generico`  | Empresa de Serviços (Genérico) | 8             | 3         | 4       | Default for most businesses                                  |
| `advocacia` | Escritório de Advocacia        | 8             | 3         | 4       | Law firms                                                    |
| `cobranca`  | Gestão de Cobrança             | 6             | 4         | 5       | Collection agencies                                          |
| `cartorio`  | Cartório & Registro de Imóveis | 6             | 6         | 6       | For businesses that file at notary offices (ONR integration) |

### Key Types

```typescript
// TemplatePack — top-level structure
interface TemplatePack {
  metadata: PackMetadata; // key, name, description, icon, color, version
  tenant_config: PackTenantConfig; // specialty, agent_type, show_price, etc.
  modules: ModuleKey[]; // which modules to activate
  service_categories: PackServiceCategory[];
  service_types: PackServiceType[];
  workflow_templates: PackWorkflowTemplate[]; // includes steps + transitions
  deadline_rules: PackDeadlineRule[];
  step_task_templates: PackStepTaskTemplate[];
  step_forms: PackStepForm[];
  document_templates: PackDocumentTemplate[];
  roles: PackRole[]; // includes permission codes
  services: PackService[];
  ocr_configs?: PackOcrConfig[];
}
```

### Reference Keys (ref_key)

Packs use string `ref_key` identifiers (NOT UUIDs) for cross-referencing entities within the same pack. UUIDs are generated at apply-time. FK relationships use `*_ref` fields that point to other entities' `ref_key`.

### Apply Order (respects FK dependencies)

1. `service_categories` → 2. `workflow_templates` → 3. `workflow_steps` → 4. `service_types` → 5. Link workflows↔types → 6. `workflow_step_transitions` → 7. `deadline_rules` → 8. `roles` → 9. `role_permissions` → 10. `step_task_templates` → 11. `step_forms` → 12. `document_templates` → 13. `services` → 14. `tenant_modules` → 15. `ocr_config` → 16. Tenant config update

### Service Functions

```typescript
import {
  applyTemplatePack,
  clearPackData,
  validatePack,
} from "@/services/template-packs";
import { getPackByKey, getAllPackSummaries } from "@/data/template-packs";

// Validate a pack before applying
const { valid, errors } = validatePack(pack);

// Apply a pack to a tenant
const result = await applyTemplatePack(pack, tenantId, (step, progress) => {
  console.log(`${step} — ${Math.round(progress * 100)}%`);
});

// Clear all pack data for a tenant (soft-delete)
const clearResult = await clearPackData(tenantId);
```

### Adding a New Pack

1. Create `data/template-packs/my-vertical.ts` with a `TemplatePack` object
2. Import and register in `data/template-packs/index.ts` (add to `PACKS` map)
3. The pack will automatically appear in the admin UI

---

## Development Workflow

### Commands

```bash
npm start              # Start dev server (choose iOS/Android/web/Go)
npm run ios            # iOS simulator
npm run android        # Android emulator
npm run web            # Web browser
npm run lint           # ESLint check
npm run reset-project  # Clear starter code, prepare blank app/
npm run deploy:worker  # Deploy Cloudflare Worker (api-crud)
npm run deploy:landing # Deploy landing page to Cloudflare Pages
```

### Key Dependencies

- **expo-router**: File-based routing
- **axios**: HTTP client (centralized in `api` service)
- **expo-secure-store**: Secure token storage
- **react-navigation**: Bottom tabs, modals, theming
- **expo-haptics**: Haptic feedback (used in `HapticTab`)

### Configuration

- **app.json**: App metadata, plugins (`expo-router`, `expo-splash-screen`, `expo-secure-store`), experiments (`typedRoutes`, `reactCompiler`)
- TypeScript strict mode enabled; prefer type-safe patterns

## Common Workflows

### Adding a New Screen

1. Create `app/(app)/GroupName/new-screen.tsx` (file-based routing auto-adds route)
2. Use `router.push('/GroupName/new-screen')` for navigation
3. For admin screens, add under `app/(app)/Administrador/`
4. For client screens, add under `app/(app)/Servicos/`
5. For public screens (no auth), add under `app/(public)/` — AuthGate skips redirect for `(public)` group

### CRUD List with Filters (Standard Pattern)

```tsx
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";

const res = await api.post(CRUD_ENDPOINT, {
  action: "list",
  table: "properties",
  ...buildSearchParams([{ field: "customer_id", value: customerId }], {
    sortColumn: "created_at DESC",
  }),
});
const items = normalizeCrudList<Property>(res.data).filter(
  (item) => !item.deleted_at,
);
```

### CRUD Create / Update

```tsx
// Create
await api.post(CRUD_ENDPOINT, {
  action: "create",
  table: "properties",
  payload: {
    address: "Rua X",
    city: "Curitiba",
    state: "PR",
    tenant_id: tenantId,
  },
});

// Update
await api.post(CRUD_ENDPOINT, {
  action: "update",
  table: "properties",
  payload: { id: propertyId, address: "Rua Y" },
});

// Soft-delete
await api.post(CRUD_ENDPOINT, {
  action: "delete",
  table: "properties",
  payload: { id: propertyId, deleted_at: new Date().toISOString() },
});
```

### Styling with Theme Colors

```tsx
import { useThemeColor } from "@/hooks/use-theme-color";
const color = useThemeColor({ light: "#0a7ea4", dark: "#fff" }, "tint");
```

## N8N Workflows & Database Context

**Automatic Consultation Rules:**

- When relevant to the request, I will automatically:
  1. Check `n8n/workflows/Ar17RgJt19MHQwbJqD8ZK.json` for available API endpoints and workflow logic
  2. Query PostgreSQL schema/tables when understanding data structure is necessary
  3. Review existing implementations to understand patterns

**Modification Policy:**

- I will ONLY suggest or implement N8N/database changes if:
  - Explicitly requested by you
  - Changes are necessary to fulfill the feature request
  - Current implementation has bugs or incompatibilities
- I will NOT make unnecessary changes or modifications unless you approve
- All changes are documented with clear rationale

**Database Change Execution Policy (SaaS multi-tenant):**

- For table/index/constraint changes (DDL), prefer `api_dinamico` with SQL migrations over hardcoded app-side workarounds.
- Before applying DDL, always run schema + duplicate-data checks to avoid breaking unique/index creation.
- Prefer tenant-aware constraints (`tenant_id + business_key`) for tenant-owned entities.
- Keep global uniqueness only for true global identity fields (e.g., `users.cpf` when used as platform login identity).

**Available Resources:**

- Cloudflare Worker (primary API): `https://sos-api-crud.raulcamilotti-c44.workers.dev` (production: `https://api-crud.sosescritura.com.br`)
- N8N Workflow (automations): `https://n8n.sosescritura.com.br` (ID: Ar17RgJt19MHQwbJqD8ZK)
- Landing page (Cloudflare Pages): `https://radul-site.pages.dev` (production: `https://radul.com.br`)
- Database: PostgreSQL (see "Key Database Tables" section above for full table list)
- Worker deploy: `npm run deploy:worker` (from root)
- N8N Sync: `npm run sync:n8n:download` (local), `npm run sync:n8n:upload`, `npm run sync:n8n:validate`

### Testing API Calls

To test api_crud calls directly, use a temporary Node.js script:

```js
const axios = require("axios");
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://api-crud.sosescritura.com.br";
const r = await axios.post(`${API_BASE}/api_crud`, {
  action: "list",
  table: "properties",
  search_field1: "customer_id",
  search_value1: "some-uuid",
  search_operator1: "equal",
  sort_column: "created_at DESC",
});
console.log(r.data);
```

## SaaS Billing (Active-Client-Tier Monthly Subscriptions)

### Overview

The SOS platform uses an **active-client-count tier model**. Plans are defined by the maximum number of **active clients** (customers with any interaction in the last 90 days). Users are **unlimited** on all paid plans; the Free plan allows up to **3 users**. When a tenant's active client count exceeds their plan limit, the system auto-upgrades and generates a PIX for the next tier. If the count drops below the threshold for 2 consecutive months, an auto-downgrade occurs. The Radul tenant (super-admin / platform owner) is the creditor — all billing invoices and accounts receivable are created on the Radul tenant.

### Active Client Definition

An **active client** is any customer record with `last_interaction_at` within the last 90 days (`ACTIVE_CLIENT_WINDOW_DAYS = 90`). Interactions are tracked by a nightly N8N cron job that scans 11 tables with `customer_id`:

- `service_orders`, `invoices`, `payments`, `quotes`, `tasks`, `process_updates`, `generated_documents`, `client_files`, `notifications`, `controle_atendimento`, `public_access_tokens`

The `customers.last_interaction_at` column is updated to `MAX(updated_at)` across all these tables. The `tenants.active_client_count` column caches the count per tenant.

### Architecture

```
services/saas-billing.ts     # Core billing engine (limits, subscribe, confirm, renewal)
services/active-clients.ts   # Active client tracking, SQL generation, monthly tier adjustment
hooks/use-tenant-limits.ts   # React hook for limit checking
app/(app)/Administrador/comprar-usuarios.tsx  # Plan upgrade + enterprise extra clients screen
app/(app)/Administrador/gestao-tenant.tsx     # Plan usage display (billing-aware, shows active clients)
migrations/add-saas-billing-columns.sql       # DDL for billing columns
migrations/add-active-client-tracking.sql     # DDL for last_interaction_at, active_client_count
scripts/setup-radul-billing.js               # One-time PIX key setup script
scripts/set-radul-slug.js                    # Set slug='radul' + plan='enterprise' on Radul tenant
```

### Plan Tiers (PLAN_TIERS)

| Plan Key     | Label      | Max Active Clients | Monthly Price | Max Users |
| ------------ | ---------- | ------------------ | ------------- | --------- |
| `free`       | Grátis     | 20                 | R$ 0          | 3         |
| `starter`    | Starter    | 100                | R$ 99/mês     | Unlimited |
| `growth`     | Growth     | 500                | R$ 249/mês    | Unlimited |
| `scale`      | Scale      | 2.000              | R$ 499/mês    | Unlimited |
| `enterprise` | Enterprise | Unlimited          | Sob consulta  | Unlimited |

**Enterprise extra clients:** R$ 0,20/client/month (`ENTERPRISE_PRICE_PER_CLIENT`). Enterprise tenants can purchase additional client slots in bulk.

**`trial` plan key** maps to `free` for display and limits. `canAddUser()` enforces the 3-user limit on Free plan; always returns `true` for paid plans.

### Database Columns

**On `customers`:**

| Column                | Type        | Default | Purpose                                   |
| --------------------- | ----------- | ------- | ----------------------------------------- |
| `last_interaction_at` | TIMESTAMPTZ | NULL    | Last activity timestamp (updated nightly) |

**On `tenants`:**

| Column                            | Type         | Default | Purpose                                          |
| --------------------------------- | ------------ | ------- | ------------------------------------------------ |
| `active_client_count`             | integer      | 0       | Cached count of active clients (updated nightly) |
| `max_users`                       | integer      | NULL    | Legacy — NULL = no limit enforced                |
| `extra_users_purchased`           | integer      | 0       | Extra client slots for Enterprise                |
| `config.billing.pix_key`          | JSONB nested | —       | Radul's PIX key for collecting payments          |
| `config.consecutive_months_below` | JSONB nested | 0       | Counter for auto-downgrade delay (2 months)      |

### Subscribe & Recurrence Flow

```
1. Tenant admin → Gestão > "Upgrade de Plano" button
2. Select target plan → "Gerar PIX" button (shows monthly tier price)
3. services/saas-billing.subscribeToPlan(tenantId, targetPlan)
   → Finds Radul tenant (by slug='radul' or company_name ILIKE '%radul%')
   → Creates Invoice on Radul tenant (competence = current month)
   → Creates InvoiceItem (plan subscription line)
   → Creates AccountReceivable (recurrence: "monthly") with PIX QR
   → notes.type = "saas_plan_subscription", notes.is_initial = true
4. Screen shows PIX QR Code + copy-paste BRCode
5. Tenant pays 1st month via PIX (bank app)
6. Radul admin marks AR entry as "paid" in ContasAReceber
7. confirmSeatPayment() auto-triggers:
   → [INITIAL ONLY] Updates tenant.plan = targetPlan
   → [ALWAYS] Generates NEXT month's Invoice + AR (recurrence_parent_id)
   → Next month AR has notes.is_initial = false, due on 5th
8. Repeat step 6-7 every month (plan stays active, next month auto-generated)
```

**Enterprise extra clients flow (separate):**

```
1. Enterprise tenant → "Comprar Clientes Extras" section
2. Select quantity → "Gerar PIX" (R$ 0,20 × qty/month)
3. services/saas-billing.purchaseExtraClients(tenantId, qty)
   → notes.type = "saas_extra_clients"
4. On payment confirmation:
   → [INITIAL ONLY] Updates tenant.extra_users_purchased += qty
   → [ALWAYS] Generates NEXT month's AR
```

### Key Service Functions & Exports (saas-billing.ts)

| Export / Function                            | Purpose                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PLAN_TIERS`                                 | Record of plan definitions (label, maxCustomers, monthlyPrice, maxUsers)           |
| `PLAN_ORDER`                                 | Array of plan keys in ascending order                                              |
| `ACTIVE_CLIENT_WINDOW_DAYS`                  | 90 — rolling window for active client counting                                     |
| `ENTERPRISE_PRICE_PER_CLIENT`                | R$ 0.20 — price per extra client/month for Enterprise                              |
| `PlanTier` (type)                            | Shape of each tier definition (includes `maxUsers: number \| null`)                |
| `TenantLimits` (type)                        | Full limit state (active clients, users, usage %, suggested upgrade)               |
| `getTenantLimits(tenantId)`                  | Returns full limit state using active client count + user limits                   |
| `getTenantActiveCustomerCount(tenantId)`     | Counts customers with `last_interaction_at` >= 90 days ago (fallback: total count) |
| `canAddClient(tenantId)`                     | Quick check: can tenant add more active customers?                                 |
| `canAddUser(tenantId)`                       | Enforces 3-user limit on Free plan; returns `true` for paid plans                  |
| `subscribeToPlan(tenantId, targetPlan)`      | Creates 1st month invoice + AR for plan tier price                                 |
| `purchaseExtraClients(tenantId, qty)`        | Enterprise only — creates AR for extra client slots                                |
| `purchaseUserSeats(tenantId, qty)` ⚠️ legacy | Wrapper that calls `purchaseExtraClients()` for backward compat                    |
| `confirmSeatPayment(arId, confirmedBy?)`     | Handles 3 note types (plan_subscription, extra_clients, user_seats)                |
| `getRecommendedPlan(customerCount)`          | Suggests cheapest plan that fits the count                                         |
| `formatPlanPrice(planKey)`                   | Returns formatted price string (e.g., "R$ 99/mês")                                 |
| `listPendingSeatPurchases(radulId)`          | Lists pending SaaS purchases for super-admin                                       |

### Key Service Functions & Exports (active-clients.ts)

| Export / Function                        | Purpose                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `INTERACTION_TABLES`                     | Array of 11 tables with `customer_id` used for interaction tracking                 |
| `DOWNGRADE_DELAY_MONTHS`                 | 2 — consecutive months below threshold before auto-downgrade                        |
| `getUpdateLastInteractionSQL()`          | Returns SQL for N8N cron: updates `last_interaction_at` from all interaction tables |
| `getUpdateActiveClientCountSQL()`        | Returns SQL for N8N cron: updates `tenants.active_client_count`                     |
| `recalculateActiveClients(tenantId)`     | On-demand recalculation for a single tenant                                         |
| `getActiveClientSummary(tenantId)`       | Detailed summary: total, active, inactive, top categories, trending                 |
| `processMonthlyTierAdjustment(tenantId)` | Monthly check: auto-upgrade with PIX or auto-downgrade after delay                  |
| `ActiveClientSummary` (type)             | Return type for `getActiveClientSummary()`                                          |
| `MonthlyTierResult` (type)               | Return type for `processMonthlyTierAdjustment()`                                    |

### Note Types in accounts_receivable.notes

| `notes.type`             | Created By                   | confirmSeatPayment Behavior                             |
| ------------------------ | ---------------------------- | ------------------------------------------------------- |
| `saas_plan_subscription` | `subscribeToPlan()`          | Initial: updates tenant.plan; Always: generates next AR |
| `saas_extra_clients`     | `purchaseExtraClients()`     | Initial: adds to extra_users_purchased; Always: next AR |
| `saas_user_seats`        | Legacy `purchaseUserSeats()` | Same as extra_clients (backward compat)                 |

### Monthly Recurrence Logic

- **Initial purchase** (`is_initial: true`): Activates plan or extra slots + generates month 2 AR
- **Renewal payments** (`is_initial: false`): Does NOT change plan/slots (already active), only generates next month AR
- **`competence_date`**: Tracks which month the payment refers to (YYYY-MM-01)
- **`recurrence_parent_id`**: Links each renewal AR to the previous month's AR (chain)
- **Due date**: Renewals are due on the 5th of the competence month

### Radul Tenant Configuration

The Radul tenant stores its PIX key in `tenants.config.billing`:

```json
{
  "billing": {
    "pix_key": "12.345.678/0001-90",
    "pix_key_type": "cnpj",
    "pix_merchant_name": "Radul Tecnologia",
    "pix_merchant_city": "Curitiba"
  }
}
```

Run `scripts/setup-radul-billing.js` to configure (set `RADUL_PIX_KEY` env var).
Run `scripts/set-radul-slug.js` to set `slug: 'radul'` + `plan: 'enterprise'` on the Radul tenant.

### Integration Points

- **ContasAReceber**: When marking an AR entry as "paid", auto-calls `confirmSeatPayment()` if the entry is a SaaS purchase (detected via `notes.type` starting with `saas_`). This triggers plan activation (if initial) and next-month AR generation (always).
- **gestao-tenant.tsx**: Uses `useTenantLimits()` hook for billing-aware client limit display + "Upgrade de Plano" button
- **onboarding.ts**: New tenants created with default `free` plan (20 clients, unlimited users)

---

## Conventions to Preserve

- **Always use `buildSearchParams()`** for CRUD list filters — never handcraft `search_field1` params directly (except in CrudScreen.tsx reference lookups)
- **Always use `normalizeCrudList()` / `normalizeCrudOne()`** to parse responses — handles `data`, `value`, `items`, and array shapes
- **Always keep client-side `.filter(item => !item.deleted_at)`** as safety net — the server does NOT auto-filter soft-deleted rows
- Always use centralized `api` service; don't create separate axios instances
- Secure token in `SecureStore` (never AsyncStorage for sensitive data)
- Use `expo-secure-store` plugin in `app.json` plugins array
- Component export pattern: named exports for reusable components, default export for screens
- Error states: set local state `error`, display via UI, never throw uncaught errors
- For table-driven admin/task screens, prefer dynamic CRUD via `api_crud` + `CrudScreen`
- Prefer schema-driven fields using `getTableInfo(table)` instead of hardcoded forms when possible
- Reference pickers in CRUD forms must respect tenant isolation by default for tenant-scoped tables (e.g., `roles`, `service_types`, `workflow_templates`)
- **New business process = service_order + workflow_template, NOT a new screen** — reuse Kanban, Processo, Portal Público
- **New Kanban board = `KanbanScreen<T>` with callbacks** — never build monolithic kanban screens; use `loadColumns`, `loadItems`, `renderCard`, `renderExtraModals` pattern. Screen-specific modals go in `renderExtraModals`.
- **Partner-scoped screens must use `usePartnerScope()`** — CrudScreen screens filter `loadItems` client-side; custom screens pass `partnerId` to service functions
- **Trigger screens only create the service_order** — they do NOT manage the process lifecycle (workflow engine handles that)
- **Service functions that accept optional `partnerId?`** must keep it backward-compatible (omit = no filter = admin sees all)
- **Self-partner for tenant's own ops**: Create partner with `is_internal: true` instead of special-casing null partner_id
- **Domain-based tenant resolution** uses `services/tenant-resolver.ts` — never hardcode tenant lookup logic in auth functions
- **Auto-link is best-effort** — `tryAutoResolveTenant()` is wrapped in try/catch; a failure must never break the auth flow
- **Platform root domains never auto-link** — `is_platform_root` detection in `tenant-context.ts` gates the skip; adjust `PLATFORM_ROOT_HOSTS` set in `tenant-resolver.ts` if adding new root domains
- **Tenant `slug` must be unique and URL-safe** — used directly in subdomain URLs (`{slug}.radul.com.br`)
- **Client limit enforcement uses `services/saas-billing.ts`** — never check limits manually; use `canAddClient(tenantId)` or `useTenantLimits()` hook. `canAddUser()` enforces 3-user limit on Free plan; always returns `true` for paid plans.
- **Active client = interaction in last 90 days** — counted via `last_interaction_at` column on `customers`, updated nightly by N8N cron scanning 11 tables. `tenants.active_client_count` caches the count.
- **Monthly tier adjustment via `processMonthlyTierAdjustment()`** — auto-upgrade generates PIX immediately; auto-downgrade only after `DOWNGRADE_DELAY_MONTHS` (2) consecutive months below threshold. Stored in `tenants.config.consecutive_months_below`.
- **All SaaS billing invoices/AR go on the Radul tenant** — the platform owner is the creditor; buyer tenant is referenced in `notes` JSON
- **Plan subscriptions via `subscribeToPlan()`** — creates invoice + AR with `notes.type = "saas_plan_subscription"`. Confirmation upgrades the tenant plan (initial) and generates next month AR (always).
- **Enterprise extra clients via `purchaseExtraClients()`** — R$ 0.20/client/month with `notes.type = "saas_extra_clients"`. Only available for Enterprise plan.
- **`confirmSeatPayment()` handles 3 note types** — `saas_plan_subscription` (upgrades plan), `saas_extra_clients` (adds client slots), `saas_user_seats` (legacy compat)
- **Monthly recurrence is AR-driven** — each `confirmSeatPayment()` creates the next month's AR with `recurrence_parent_id` linking to the previous; `is_initial` flag in notes controls whether plan is activated or just renewed
