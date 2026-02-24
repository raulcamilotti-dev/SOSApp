# Roles System — Comprehensive Research Report

> Generated: June 2025 · Based on full codebase audit of SOSApp

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Onboarding Flow — Role Creation](#2-onboarding-flow--role-creation)
3. [Template Pack Flow — Role Creation](#3-template-pack-flow--role-creation)
4. [default_client_role Usage](#4-default_client_role-usage)
5. [Hardcoded Role Names — Complete Inventory](#5-hardcoded-role-names--complete-inventory)
6. [Admin Roles Management Screen](#6-admin-roles-management-screen)
7. [Permission System Integration](#7-permission-system-integration)
8. [Risks & Recommendations](#8-risks--recommendations)

---

## 1. Database Schema

### 1.1 `roles` table

Inferred from CRUD usage across `services/onboarding.ts`, `services/template-packs.ts`, `app/(app)/Administrador/roles.tsx`:

| Column       | Type                     | Nullable | Default             | Notes                                                |
| ------------ | ------------------------ | -------- | ------------------- | ---------------------------------------------------- |
| `id`         | UUID                     | NO       | `gen_random_uuid()` | Primary key                                          |
| `tenant_id`  | UUID (FK → `tenants.id`) | NO       | —                   | Tenant isolation                                     |
| `name`       | TEXT / VARCHAR           | NO       | —                   | Role name (e.g., "admin", "Gestor")                  |
| `created_at` | TIMESTAMP WITH TIME ZONE | YES      | `now()`             | Auto-generated                                       |
| `updated_at` | TIMESTAMP WITH TIME ZONE | YES      | `now()`             | Auto-generated                                       |
| `deleted_at` | TIMESTAMP WITH TIME ZONE | YES      | NULL                | Soft-delete support (confirmed in `clearPackData()`) |

**Evidence:**

- `roles.tsx` creates with `{ tenant_id, name }` → CrudScreen auto-adds `created_at`/`updated_at`
- `onboarding.ts:282` creates `{ name: "Administrador", tenant_id }`
- `template-packs.ts` (Step 8) creates `{ tenant_id, name }` for each `PackRole`
- `clearPackData()` soft-deletes via `UPDATE roles SET deleted_at = '...' WHERE tenant_id = '...'`

### 1.2 `role_permissions` table

| Column          | Type                         | Nullable | Default | Notes                                |
| --------------- | ---------------------------- | -------- | ------- | ------------------------------------ |
| `role_id`       | UUID (FK → `roles.id`)       | NO       | —       | Composite PK part 1                  |
| `permission_id` | UUID (FK → `permissions.id`) | NO       | —       | Composite PK part 2                  |
| `deleted_at`    | TIMESTAMP WITH TIME ZONE     | YES      | NULL    | Confirmed in copilot-instructions.md |

**Note:** This table has **NO `id` column** — it uses the composite key `(role_id, permission_id)`. This is documented in the copilot instructions under "Tables without `id` column."

**Evidence:**

- `permissions.sync.ts:148` creates `{ role_id: roleId, permission_id: permId }`
- `roles.tsx:82` lists with filter `{ field: "role_id", value: roleId }`
- `template-packs.ts` (Step 9) creates `{ role_id, permission_id }` for each pack permission
- `onboarding.ts:75` creates `{ role_id: roleId, permission_id: adminPermId }`

### 1.3 `permissions` table

| Column        | Type                     | Nullable | Default             | Notes                                         |
| ------------- | ------------------------ | -------- | ------------------- | --------------------------------------------- |
| `id`          | UUID                     | NO       | `gen_random_uuid()` | Primary key                                   |
| `code`        | TEXT / VARCHAR           | NO       | —                   | Unique permission code (e.g., `"admin.full"`) |
| `description` | TEXT                     | YES      | —                   | Portuguese description                        |
| `created_at`  | TIMESTAMP WITH TIME ZONE | YES      | `now()`             | Auto-generated                                |

**Evidence:**

- `permissions.sync.ts:108` creates `{ code, description }` from `PERMISSION_METADATA`
- `permissions.sync.ts:131` lists all permissions, maps `p.code → p.id`

### 1.4 `user_tenants` table

| Column       | Type                     | Nullable | Default             | Notes                           |
| ------------ | ------------------------ | -------- | ------------------- | ------------------------------- |
| `id`         | UUID                     | NO       | `gen_random_uuid()` | Primary key                     |
| `user_id`    | UUID (FK → `users.id`)   | NO       | —                   |                                 |
| `tenant_id`  | UUID (FK → `tenants.id`) | NO       | —                   |                                 |
| `role_id`    | UUID (FK → `roles.id`)   | YES      | NULL                | Nullable — set after role found |
| `is_active`  | BOOLEAN                  | YES      | true                |                                 |
| `created_at` | TIMESTAMP WITH TIME ZONE | YES      | `now()`             |                                 |
| `updated_at` | TIMESTAMP WITH TIME ZONE | YES      | `now()`             |                                 |

**Evidence:**

- `onboarding.ts:266` creates `{ user_id, tenant_id }` (no role_id yet)
- `onboarding.ts:300` updates `{ id: userTenantId, role_id: adminRoleId }`
- `tenant-resolver.ts:226` creates `{ user_id, tenant_id, role_id, is_active: true }`
- `usePermissions()` hook fetches user_tenants → role_id → role_permissions chain

---

## 2. Onboarding Flow — Role Creation

**File:** `services/onboarding.ts` (343 lines)

### Flow Summary

```
runOnboarding(userId, companyData, packKey, onProgress)
│
├─ 1. createTenant(companyData)
│     → Creates tenant row with company_name, config.brand, slug, plan: "free"
│
├─ 2. createSubdomainDNS(tenantId, slug)         [best-effort]
│
├─ 3. linkUserToTenant(userId, tenantId)
│     → Creates user_tenants row (NO role_id yet)
│
├─ 4. applyTemplatePack(pack, tenantId, progress)
│     → Step 8: Creates roles from pack.roles[]
│     → Step 9: Creates role_permissions from pack.roles[].permissions[]
│     → (see Section 3 for full details)
│
├─ 5. findAdminRoleId(tenantId)
│     → Lists ALL roles for tenant
│     → Finds first where name contains "admin" (case-insensitive)
│     │
│     ├─ If found → use that role ID
│     └─ If NOT found → creates role named "Administrador"
│                        → calls assignAdminFullPermission(newRoleId)
│                           → fetches all permissions
│                           → finds permission with code "admin.full"
│                           → creates role_permissions row
│
├─ 6. Update user_tenants.role_id = adminRoleId
│
└─ 7. Update users.role = "admin"
```

### Key Functions

**`findAdminRoleId(tenantId)`** (`onboarding.ts:54-68`):

```typescript
// Lists roles for tenant, finds first with "admin" in name
const roles = normalizeCrudList<{ id: string; name: string }>(
  rolesRes.data,
).filter((r) => !r.deleted_at);
const adminRole = roles.find((r) => r.name.toLowerCase().includes("admin"));
return adminRole?.id ?? null;
```

**`assignAdminFullPermission(roleId)`** (`onboarding.ts:70-99`):

```typescript
// Fetches all permissions, finds "admin.full", creates role_permissions row
const adminPerm = permissions.find((p) => p.code === "admin.full");
await api.post(CRUD_ENDPOINT, {
  action: "create",
  table: "role_permissions",
  payload: { role_id: roleId, permission_id: adminPerm.id },
});
```

### Critical Observations

1. **Two paths to admin role creation:**
   - **Path A (normal):** Template pack creates the admin role (all 6 packs include one) → `findAdminRoleId()` discovers it
   - **Path B (fallback):** If pack failed or has no admin role → creates "Administrador" manually + assigns `admin.full`

2. **Gap:** Path B only assigns `admin.full` (1 permission). Path A assigns whatever the pack defines (usually `admin.full` only for padrao, or a larger set via `assignDefaultPermissionsToRole` in `roles.tsx`).

3. **users.role field:** After role creation, `users.role` is set to the string `"admin"`. This is a **separate field** from `user_tenants.role_id` — it's a legacy/convenience field checked by `isUserAdmin()`.

---

## 3. Template Pack Flow — Role Creation

**File:** `services/template-packs.ts` (1125 lines)

### Apply Order (Steps 8-10 relevant to roles)

```
applyTemplatePack(pack, tenantId, progress)
│
├─ Steps 1-7: Categories, Workflows, Steps, ServiceTypes, Transitions, Deadlines
│
├─ Step 8: ROLES
│   for each pack.roles[] {
│     → CRUD create: { tenant_id, name: role.name }
│     → Store role.ref_key → created UUID in roleRefs map
│   }
│
├─ Step 9: ROLE PERMISSIONS
│   → Fetch ALL permissions from DB
│   → Build permissionCodeToId map (code → UUID)
│   for each role in pack.roles[] {
│     for each permCode in role.permissions[] {
│       → Resolve permCode → permission UUID
│       → CRUD create: { role_id: roleRefs[role.ref_key], permission_id }
│     }
│   }
│
├─ Step 10: STEP TASK TEMPLATES
│   → Uses roleRefs[task.assigned_role_ref] to assign tasks to roles
│
└─ Steps 11-16: Documents, Services, Modules, OCR, Tenant Config
```

### All Template Pack Roles

#### `padrao` (Empresa de Serviços — Padrão)

| ref_key         | name       | permissions                                                                                                                                                                                                                 |
| --------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role_admin`    | `admin`    | `admin.full`                                                                                                                                                                                                                |
| `role_gestor`   | `Gestor`   | document.read/write, project.read/write, workflow.read/write, task.read/write, customer.read/write, service.read/request, process_update.read/write, user.read, calendar.sync, appointment.read/write, financial.read/write |
| `role_operador` | `Operador` | customer.read/write, service.read/request, process_update.read/write, task.read/write, calendar.sync, appointment.read/write, financial.read                                                                                |
| `role_client`   | `client`   | service.read, process_update.read, document.read, review.write                                                                                                                                                              |

#### `juridico` (Escritório de Advocacia)

| ref_key                 | name               | permissions                                                                                                                      |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `role_advogado`         | `Advogado`         | service.read/request, customer.read/write, document.read/write, workflow.read, task.read/write, calendar.sync, appointment.write |
| `role_estagiario`       | `Estagiário`       | service.read, customer.read, document.read, task.read/write                                                                      |
| `role_cliente_juridico` | `Cliente (Portal)` | service.read, document.read, review.write                                                                                        |

#### `comercio` (Comércio & Varejo)

| ref_key           | name         | permissions                                                                       |
| ----------------- | ------------ | --------------------------------------------------------------------------------- |
| `role_vendedor`   | `Vendedor`   | service.read/request, customer.read/write, stock.read, sale.read, task.read/write |
| `role_estoquista` | `Estoquista` | stock.read/write, purchase.read/write, task.read/write                            |
| `role_entregador` | `Entregador` | service.read/request, task.read/write                                             |

#### `consultoria` (Consultoria & Projetos)

| ref_key                    | name                             | permissions                                                                                                                                           |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role_consultor`           | `Consultor / Gerente de Projeto` | service.read/request, customer.read/write, document.read/write, workflow.read, task.read/write, calendar.sync, appointment.write, financial.dashboard |
| `role_analista`            | `Analista / Executor`            | service.read, customer.read, document.read/write, task.read/write, calendar.sync                                                                      |
| `role_cliente_consultoria` | `Cliente (Portal)`               | service.read, document.read, review.write                                                                                                             |

#### `saude` (Saúde & Bem-estar)

| ref_key              | name                    | permissions                                                                                                                      |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `role_profissional`  | `Profissional de Saúde` | service.read/request, customer.read/write, document.read/write, workflow.read, task.read/write, calendar.sync, appointment.write |
| `role_recepcionista` | `Recepcionista`         | service.read/request, customer.read/write, calendar.sync, appointment.write, task.read                                           |
| `role_paciente`      | `Paciente (Portal)`     | service.read, document.read, review.write                                                                                        |

#### `revenda` (Distribuição & Revenda)

| ref_key                | name                   | permissions                                                                                                                                                                      |
| ---------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role_account_manager` | `Gerente de Contas`    | service.read/request, customer.read/write, document.read/write, workflow.read, task.read/write, calendar.sync, appointment.write, financial.dashboard, process_update.read/write |
| `role_suporte_tecnico` | `Suporte Técnico`      | service.read/request, customer.read, task.read/write, calendar.sync                                                                                                              |
| `role_sub_cliente`     | `Sub-Cliente (Portal)` | service.read, document.read, review.write                                                                                                                                        |

### Key Observation

Only the `padrao` pack includes an `admin` role. The other 5 packs define **specialist roles only** (no admin). This means:

- For non-padrao packs, `findAdminRoleId()` will **NOT find** an existing admin role
- The fallback in `onboarding.ts` will create an "Administrador" role + assign `admin.full`
- This "Administrador" role won't have the full 50+ permissions that `DEFAULT_ROLE_PERMISSIONS["admin"]` defines

---

## 4. default_client_role Usage

### Database Column

```sql
-- From migrations/add-tenant-slug-custom-domains.sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_client_role TEXT DEFAULT 'client';
```

### Usage Chain

```
User visits {slug}.radul.com.br
│
├─ core/auth/tenant-context.ts
│   → Detects is_platform_root = false, extracts tenant_slug from subdomain
│
├─ core/auth/AuthContext.tsx → tryAutoResolveTenant()
│   → Called after login/register/googleLogin/govBrLogin
│   → if (!user.tenant_id && user.id):
│       → resolveTenantFromContext(context)
│           → Finds tenant by slug or custom_domains
│           → Returns { tenant: { id, default_client_role, ... } }
│       → autoLinkUserToTenant(userId, tenantId, result.tenant.default_client_role ?? "client")
│
├─ services/tenant-resolver.ts → autoLinkUserToTenant()
│   → Checks existing user_tenants (avoid duplicate)
│   → Finds role by name:
│       1. Exact match: role.name === roleName
│       2. Fallback: case-insensitive partial match (role.name includes roleName)
│   → Creates user_tenants row with matched role_id
│   → If no role matched → creates user_tenants WITHOUT role_id (null)
```

### Where `default_client_role` Is Set

1. **Migration default:** `'client'`
2. **Onboarding:** `services/onboarding.ts` does NOT explicitly set `default_client_role` — it remains the migration default
3. **Admin UI:** Not exposed in any admin screen currently — must be set via direct DB update or `api_dinamico`

### Role Name Matching in `autoLinkUserToTenant()`

The function (`tenant-resolver.ts:198-240`) searches for a role matching the `default_client_role` value:

```typescript
// 1. Try exact match
const exactMatch = roles.find((r) => r.name === roleName);

// 2. Fallback: partial case-insensitive
if (!exactMatch) {
  const lower = roleName.toLowerCase();
  const partialMatch = roles.find((r) => r.name.toLowerCase().includes(lower));
}
```

**Implication:** If `default_client_role = "client"` (default) and the tenant applied the `padrao` pack, the role named `"client"` will be matched. For `juridico` pack, `"Cliente (Portal)"` will be matched via partial match. For `comercio` pack, there is **no client-like role** — the user will be linked without a role.

---

## 5. Hardcoded Role Names — Complete Inventory

### 5.1 `core/auth/auth.utils.ts` — Role Classification Sets

```typescript
// Lines 12-25
export const ADMIN_ROLE_VALUES = new Set([
  "admin",
  "administrator",
  "adm",
  "superadmin",
  "root",
]);

export const OPERATOR_ROLE_VALUES = new Set([
  "operador",
  "operador_interno",
  "operador_parceiro",
  "partner_operator",
  "oper",
  "gestor",
  "supervisor",
  "backoffice",
  "staff",
]);

export const USER_ROLE_SUGGESTIONS = {
  admin: [...ADMIN_ROLE_VALUES],
  operator: [...OPERATOR_ROLE_VALUES],
  client: ["user", "cliente", "customer", "guest"],
};
```

**Used by:** `isUserAdmin(user)`, `isUserOperator(user)` — these check the `users.role` string field (not the DB `roles` table).

### 5.2 `core/auth/permissions.ts` — DEFAULT_ROLE_PERMISSIONS

5 preset keys that determine auto-assigned permissions when a role is created:

| Key                   | Permission Count | Notable Permissions                                          |
| --------------------- | ---------------- | ------------------------------------------------------------ |
| `"admin"`             | ~50+             | Everything, including `admin.full`                           |
| `"manager"`           | ~26              | Read/write most entities, no deletes, no admin.full          |
| `"client"`            | ~16              | Read-only + service.request, appointment.write, review.write |
| `"operador"`          | ~44              | Client perms + write access + financial + PDV                |
| `"operador_parceiro"` | ~22              | Client read + task.write + limited write access              |

### 5.3 `core/auth/permissions.sync.ts` — Fuzzy Name Matching

`assignDefaultPermissionsToRole(roleId, roleName)` (line 122-188):

```typescript
// 1. Normalize: lowercase + trim
const normalized = roleName.toLowerCase().trim();

// 2. Direct lookup
let defaultPerms = DEFAULT_ROLE_PERMISSIONS[normalized];

// 3. Partial matching fallback
if (!defaultPerms) {
  if (normalized.includes("admin"))          → DEFAULT_ROLE_PERMISSIONS["admin"]
  if (normalized.includes("manager")
    || normalized.includes("gestor"))        → DEFAULT_ROLE_PERMISSIONS["manager"]
  if (normalized.includes("parceiro")
    || normalized.includes("partner"))       → DEFAULT_ROLE_PERMISSIONS["operador_parceiro"]
  if (normalized.includes("client")
    || normalized.includes("cliente"))       → DEFAULT_ROLE_PERMISSIONS["client"]
  // (no match for "operador" via partial — only direct lookup)
}
```

### 5.4 `services/onboarding.ts` — Hardcoded Strings

| Location | String            | Usage                                                       |
| -------- | ----------------- | ----------------------------------------------------------- |
| Line 63  | `"admin"`         | `name.toLowerCase().includes("admin")` — finding admin role |
| Line 75  | `"admin.full"`    | Permission code for admin role                              |
| Line 282 | `"Administrador"` | Fallback role name when no admin role exists                |
| Line 321 | `"admin"`         | Value set on `users.role` field                             |

### 5.5 `services/tenant-resolver.ts` — Hardcoded Strings

| Location | String     | Usage                                                         |
| -------- | ---------- | ------------------------------------------------------------- |
| Line 213 | `"client"` | Default fallback when `default_client_role` is null/undefined |

### 5.6 Template Pack Data — Role Names

All role names defined in pack `.ts` files (see Section 3 for full table):

| Pack          | Role Names                                                                        |
| ------------- | --------------------------------------------------------------------------------- |
| `padrao`      | `"admin"`, `"Gestor"`, `"Operador"`, `"client"`                                   |
| `juridico`    | `"Advogado"`, `"Estagiário"`, `"Cliente (Portal)"`                                |
| `comercio`    | `"Vendedor"`, `"Estoquista"`, `"Entregador"`                                      |
| `consultoria` | `"Consultor / Gerente de Projeto"`, `"Analista / Executor"`, `"Cliente (Portal)"` |
| `saude`       | `"Profissional de Saúde"`, `"Recepcionista"`, `"Paciente (Portal)"`               |
| `revenda`     | `"Gerente de Contas"`, `"Suporte Técnico"`, `"Sub-Cliente (Portal)"`              |

### 5.7 `core/auth/auth.utils.ts` — Special Tenant Detection

```typescript
// Line 67-74
const RADUL_TENANT_IDS = new Set(["RADUL_TENANT_UUID_HERE"]);
const RADUL_EMAILS = new Set(["raul@domain.com"]);
export const isRadulUser = (user: any) => { ... };
```

### Complete Hardcoded Role String Map

| String                | Where Used                                                            | Purpose                                  |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| `"admin"`             | auth.utils, permissions.ts, permissions.sync, onboarding, padrao pack | Admin role detection + permission preset |
| `"administrator"`     | auth.utils ADMIN_ROLE_VALUES                                          | Legacy admin role variant                |
| `"adm"`               | auth.utils ADMIN_ROLE_VALUES                                          | Legacy admin role variant                |
| `"superadmin"`        | auth.utils ADMIN_ROLE_VALUES                                          | Super-admin role variant                 |
| `"root"`              | auth.utils ADMIN_ROLE_VALUES                                          | Root user variant                        |
| `"Administrador"`     | onboarding.ts:282                                                     | Fallback role creation                   |
| `"manager"`           | permissions.ts, permissions.sync                                      | Manager permission preset                |
| `"gestor"`            | auth.utils OPERATOR_ROLE_VALUES, permissions.sync                     | Maps to manager preset                   |
| `"operador"`          | auth.utils, permissions.ts                                            | Operator role classification + preset    |
| `"operador_interno"`  | auth.utils OPERATOR_ROLE_VALUES                                       | Internal operator variant                |
| `"operador_parceiro"` | auth.utils, permissions.ts                                            | Partner operator preset                  |
| `"partner_operator"`  | auth.utils OPERATOR_ROLE_VALUES                                       | English partner operator variant         |
| `"supervisor"`        | auth.utils OPERATOR_ROLE_VALUES                                       | Supervisor classification                |
| `"backoffice"`        | auth.utils OPERATOR_ROLE_VALUES                                       | Back-office classification               |
| `"staff"`             | auth.utils OPERATOR_ROLE_VALUES                                       | Staff classification                     |
| `"client"`            | permissions.ts, permissions.sync, tenant-resolver, padrao pack        | Client role preset + default             |
| `"cliente"`           | auth.utils USER_ROLE_SUGGESTIONS, permissions.sync                    | Client variant (Portuguese)              |
| `"customer"`          | auth.utils USER_ROLE_SUGGESTIONS                                      | Client variant (English)                 |
| `"guest"`             | auth.utils USER_ROLE_SUGGESTIONS                                      | Guest user classification                |
| `"user"`              | auth.utils USER_ROLE_SUGGESTIONS                                      | Generic user classification              |
| `"admin.full"`        | onboarding.ts, permissions.ts                                         | The "god mode" permission code           |

---

## 6. Admin Roles Management Screen

**File:** `app/(app)/Administrador/roles.tsx` (288 lines)

### Access Control

```typescript
<ProtectedRoute requiredPermission={PERMISSIONS.ROLE_MANAGE}>
  <CrudScreen ... />
</ProtectedRoute>
```

### Data Loading (`listRows()`)

Parallel fetch of 3 tables + client-side join:

```
1. Fetch roles WHERE tenant_id = user.tenant_id, sorted by name ASC
2. Fetch ALL role_permissions (no tenant filter — composite key table)
3. Fetch ALL permissions (global table)

Client-side join:
  → Group role_permissions by role_id
  → Map permission_id → permission.code
  → Add computed fields:
    - role_permissions_count: number of permissions
    - role_permissions_preview: first 3 permission codes as comma-separated string
```

### Role Creation (`createRow()`)

```typescript
const createRow = async (payload: Partial<RoleRow>) => {
  const result = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "roles",
    payload,
  });
  // Auto-assign default permissions based on role name
  const created = normalizeCrudList<RoleRow>(result.data);
  if (created.length > 0) {
    await assignDefaultPermissionsToRole(
      created[0].id,
      String(payload.name ?? ""),
    );
  }
  return result;
};
```

**Key:** `assignDefaultPermissionsToRole()` is called automatically on every role creation from this screen, using the fuzzy name matching from `permissions.sync.ts`.

### CrudScreen Fields

| Key                        | Label          | Type                | Visible in List | Visible in Form |
| -------------------------- | -------------- | ------------------- | --------------- | --------------- |
| `id`                       | Id             | text                | no              | no              |
| `tenant_id`                | Tenant         | reference → tenants | yes             | yes             |
| `name`                     | Nome           | text                | yes             | yes             |
| `created_at`               | Criado Em      | datetime            | yes             | no (readOnly)   |
| `role_permissions_count`   | Qtd Permissões | number              | yes             | no              |
| `role_permissions_preview` | Permissões     | text                | yes             | no              |

### Action Buttons Per Role

1. **"Permissões"** → navigates to `/Administrador/role_permissions?roleId={id}&tenantId={tenantId}`
2. **"Matriz"** → navigates to `/Administrador/role_permissions_matrix?roleId={id}`

---

## 7. Permission System Integration

### How Permissions Are Checked at Runtime

```
User logs in
│
├─ AuthContext loads user data (includes user.role string)
│
├─ usePermissions() hook (core/auth/permissions.ts)
│   │
│   ├─ 1. Fetch user_tenants WHERE user_id AND tenant_id
│   │     → Get role_id from user_tenants row
│   │
│   ├─ 2. Fetch role_permissions WHERE role_id
│   │     → Get array of permission_ids
│   │
│   ├─ 3. Fetch permissions WHERE id IN (permission_ids)
│   │     → Get permission codes
│   │
│   └─ 4. Build permissions Set<string>
│         → If "admin.full" is present → user has ALL permissions
│
├─ ProtectedRoute component
│   → Checks permissions.has(requiredPermission) || permissions.has("admin.full")
│
└─ isUserAdmin(user) — SEPARATE check
    → Checks users.role string against ADMIN_ROLE_VALUES set
    → Does NOT check role_permissions at all
```

### Two Parallel Authorization Systems

| System                                                           | Based On                        | Checked By                           | Scope                                  |
| ---------------------------------------------------------------- | ------------------------------- | ------------------------------------ | -------------------------------------- |
| **Role string** (`users.role`)                                   | Hardcoded string on user record | `isUserAdmin()`, `isUserOperator()`  | Global — same across all tenants       |
| **Role permissions** (`user_tenants.role_id → role_permissions`) | FK chain in DB                  | `usePermissions()`, `ProtectedRoute` | Per-tenant — different role per tenant |

**Risk:** These two systems can be out of sync. A user could have `users.role = "admin"` (passing `isUserAdmin()`) but have a role with zero permissions in `role_permissions`.

### `admin.full` — The God Permission

When a user's role has `admin.full` in `role_permissions`, the `usePermissions()` hook treats them as having **every permission**. This is the intended behavior for tenant admins.

### Permission Sync Flow

```
syncPermissions()
│
├─ Fetch all permissions from DB
├─ Get all permission codes from PERMISSIONS constant
├─ For each code NOT in DB → create permission row
└─ Return void (idempotent)
```

This is called during app initialization to ensure the `permissions` table has all 40+ defined permission codes.

---

## 8. Risks & Recommendations

### 8.1 Permission Gap — Non-Padrao Packs

**Problem:** When a tenant onboards with a non-padrao pack (juridico, comercio, etc.), the pack does NOT include an admin role. The onboarding fallback creates "Administrador" with only `admin.full`. However, the `roles.tsx` screen calls `assignDefaultPermissionsToRole()` which would give all 50+ permissions — but this only runs when roles are created from the admin screen, not during onboarding.

**Impact:** The onboarding admin gets `admin.full` (which grants all access via the god-permission logic), so functionally there's no access issue. But the role_permissions table won't have granular entries, which could affect future audit/reporting features.

**Recommendation:** Call `assignDefaultPermissionsToRole(adminRoleId, "admin")` in the onboarding flow after creating the fallback "Administrador" role.

### 8.2 Comercio Pack — No Client Role

**Problem:** The `comercio` pack defines Vendedor, Estoquista, Entregador — none contain "client" or "cliente" in the name. If `default_client_role = "client"` (the default), `autoLinkUserToTenant()` will fail to find a matching role and link the user without a role_id.

**Impact:** Users auto-linked via subdomain will have `role_id = null` in `user_tenants`, meaning `usePermissions()` returns an empty set — zero access.

**Recommendation:** Either:

- Add a `"Cliente"` role to the comercio pack
- Set `default_client_role = "Vendedor"` for comercio tenants
- Handle `role_id = null` in `usePermissions()` by assigning a minimum permission set

### 8.3 Dual Authorization System Drift

**Problem:** `users.role` (string field) and `user_tenants.role_id` (FK to roles table) represent two independent authorization tracks. `isUserAdmin()` checks the string; `usePermissions()` checks the FK chain. Nothing keeps them in sync.

**Impact:** Possible scenarios:

- User has `users.role = "admin"` but `user_tenants.role_id` points to a non-admin role
- User has `users.role = "user"` but `user_tenants.role_id` points to an admin role with `admin.full`
- Multi-tenant: user has different roles per tenant via `user_tenants`, but `users.role` is a single global value

**Recommendation:** Long-term, deprecate `users.role` in favor of the tenant-scoped `user_tenants.role_id` chain. Short-term, ensure both are set consistently in onboarding and role-change operations.

### 8.4 Fuzzy Name Matching — Fragile

**Problem:** `assignDefaultPermissionsToRole()` uses `.includes()` for partial matching. A role named "Administrador de Vendas" would match the "admin" preset despite being a sales admin. "Parceiro Comercial" would match "operador_parceiro" preset.

**Impact:** Unexpected permission assignments for roles with ambiguous names.

**Recommendation:** Use exact matching from a curated map rather than substring matching. Or, add a `preset` field to the `roles` table that explicitly links to a `DEFAULT_ROLE_PERMISSIONS` key.

### 8.5 default_client_role Not Configurable in UI

**Problem:** The `tenants.default_client_role` column is only set via the migration default (`"client"`) or direct DB edits. There's no admin UI to change it.

**Impact:** Tenants cannot configure which role auto-linked users receive without developer intervention.

**Recommendation:** Add `default_client_role` as a field in the tenant settings / `gestao-tenant.tsx` screen, with a dropdown populated from the tenant's roles.

---

## Appendix: File Reference

| File                                            | Lines | Purpose                                                                 |
| ----------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| `services/onboarding.ts`                        | 343   | Tenant creation + admin role assignment                                 |
| `services/template-packs.ts`                    | 1125  | Pack application (roles at steps 8-9)                                   |
| `services/tenant-resolver.ts`                   | ~300  | Domain → tenant resolution + auto-link                                  |
| `core/auth/permissions.ts`                      | 704   | PERMISSIONS constants, DEFAULT_ROLE_PERMISSIONS, usePermissions hook    |
| `core/auth/permissions.sync.ts`                 | 188   | syncPermissions(), assignDefaultPermissionsToRole()                     |
| `core/auth/auth.utils.ts`                       | 110   | ADMIN_ROLE_VALUES, isUserAdmin(), isUserOperator()                      |
| `core/auth/AuthContext.tsx`                     | 783   | tryAutoResolveTenant() → autoLinkUserToTenant()                         |
| `app/(app)/Administrador/roles.tsx`             | 288   | Admin CrudScreen for roles management                                   |
| `data/template-packs/types.ts`                  | 290   | PackRole interface definition                                           |
| `data/template-packs/index.ts`                  | 60    | Pack registry (6 packs)                                                 |
| `data/template-packs/padrao.ts`                 | 893   | Default pack — 4 roles: admin, Gestor, Operador, client                 |
| `data/template-packs/juridico.ts`               | ~860  | Legal pack — 3 roles: Advogado, Estagiário, Cliente (Portal)            |
| `data/template-packs/comercio.ts`               | ~750  | Commerce pack — 3 roles: Vendedor, Estoquista, Entregador               |
| `data/template-packs/consultoria.ts`            | ~780  | Consulting pack — 3 roles: Consultor, Analista, Cliente (Portal)        |
| `data/template-packs/saude.ts`                  | ~780  | Health pack — 3 roles: Profissional, Recepcionista, Paciente (Portal)   |
| `data/template-packs/revenda.ts`                | ~930  | Resale pack — 3 roles: Gerente de Contas, Suporte, Sub-Cliente (Portal) |
| `migrations/add-tenant-slug-custom-domains.sql` | —     | Adds default_client_role column                                         |
