# Roles, Auth & Tenant Linking — Comprehensive Research Report

> Generated February 2026 — based on full source code audit of 15+ files across auth, permissions, onboarding, tenant resolution, and navigation subsystems.

---

## Table of Contents

1. [Roles Table Structure](#1-roles-table-structure)
2. [User_Tenants Table Structure](#2-user_tenants-table-structure)
3. [CPF-Based Auth Flow](#3-cpf-based-auth-flow)
4. [Current Partner System](#4-current-partner-system)
5. [Role Creation & Management](#5-role-creation--management)
6. [Navigation Filtering by Permissions](#6-navigation-filtering-by-permissions)
7. [Default Roles](#7-default-roles)
8. [Tenant default_client_role](#8-tenant-default_client_role)

---

## 1. Roles Table Structure

**Source files:**

- [app/(app)/Administrador/roles.tsx](<../app/(app)/Administrador/roles.tsx>) — admin CrudScreen
- [migrations/add-tenant-fk-to-roles.sql](../migrations/add-tenant-fk-to-roles.sql) — tenant FK migration
- [services/onboarding.ts](../services/onboarding.ts) — role creation during onboarding

### Schema (inferred from code + migrations)

| Column       | Type        | Nullable | Default             | Notes                                     |
| ------------ | ----------- | -------- | ------------------- | ----------------------------------------- |
| `id`         | UUID        | NOT NULL | `gen_random_uuid()` | Primary key                               |
| `tenant_id`  | UUID        | YES      | —                   | FK → `tenants(id)` ON DELETE CASCADE      |
| `name`       | TEXT        | NOT NULL | —                   | Role display name (e.g., "Administrador") |
| `created_at` | TIMESTAMPTZ | YES      | `NOW()`             | Creation timestamp                        |
| `updated_at` | TIMESTAMPTZ | YES      | `NOW()`             | Last update timestamp                     |
| `deleted_at` | TIMESTAMPTZ | YES      | NULL                | Soft-delete marker                        |

**Evidence — Role creation in onboarding.ts (line ~130):**

```typescript
const rolePayload = {
  name: roleName, // e.g., "Administrador"
  tenant_id: tenantId, // scoped to tenant
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const result = await api.post(CRUD_ENDPOINT, {
  action: "create",
  table: "roles",
  payload: rolePayload,
});
```

**Evidence — CrudScreen fields in roles.tsx:**

```typescript
const fields: CrudFieldConfig<RoleItem>[] = [
  { key: "tenant_id", label: "Tenant", type: "reference", referenceTable: "tenants", ... },
  { key: "name", label: "Nome", type: "text", required: true },
  { key: "created_at", label: "Criado Em", type: "datetime", readOnly: true },
  { key: "role_permissions_count", label: "Qtd Permissões", type: "number", visibleInForm: false },
  { key: "role_permissions_preview", label: "Permissões", type: "text", visibleInForm: false },
];
```

**Key facts:**

- Roles are **tenant-scoped** — each tenant has its own set of roles
- Roles use **soft-delete** (`deleted_at`)
- The `name` field is a free-text string — there's no enum constraint
- `role_permissions_count` and `role_permissions_preview` are **computed fields** (client-side join), not DB columns

### Related: role_permissions table

| Column          | Type        | Nullable | Notes                                         |
| --------------- | ----------- | -------- | --------------------------------------------- |
| `role_id`       | UUID        | NOT NULL | FK → `roles(id)` — part of composite PK       |
| `permission_id` | UUID        | NOT NULL | FK → `permissions(id)` — part of composite PK |
| `deleted_at`    | TIMESTAMPTZ | YES      | Soft-delete                                   |

**No `id` column** — uses composite PK `(role_id, permission_id)`.

### Related: permissions table

| Column        | Type        | Nullable | Default             | Notes                     |
| ------------- | ----------- | -------- | ------------------- | ------------------------- |
| `id`          | UUID        | NOT NULL | `gen_random_uuid()` | Primary key               |
| `code`        | TEXT        | NOT NULL | —                   | Unique. e.g. `admin.full` |
| `description` | TEXT        | YES      | —                   | Human-readable desc       |
| `created_at`  | TIMESTAMPTZ | YES      | `NOW()`             | Creation timestamp        |

---

## 2. User_Tenants Table Structure

**Source files:**

- [core/auth/AuthContext.tsx](../core/auth/AuthContext.tsx) — fetches user_tenants for tenant switching
- [services/tenant-resolver.ts](../services/tenant-resolver.ts) — creates user_tenants rows on auto-link
- [migrations/add-partner-id-to-user-tenants.sql](../migrations/add-partner-id-to-user-tenants.sql) — adds partner_id
- [core/auth/PermissionsContext.tsx](../core/auth/PermissionsContext.tsx) — reads role_id from user_tenants

### Schema (inferred from code + migrations)

| Column       | Type        | Nullable | Default             | Notes                                         |
| ------------ | ----------- | -------- | ------------------- | --------------------------------------------- |
| `id`         | UUID        | NOT NULL | `gen_random_uuid()` | Primary key                                   |
| `user_id`    | UUID        | NOT NULL | —                   | FK → `users(id)`                              |
| `tenant_id`  | UUID        | NOT NULL | —                   | FK → `tenants(id)`                            |
| `role_id`    | UUID        | YES      | NULL                | FK → `roles(id)` — nullable!                  |
| `partner_id` | UUID        | YES      | NULL                | FK → `partners(id)` — controls data scope     |
| `is_active`  | BOOLEAN     | NOT NULL | `true`              | Active flag                                   |
| `created_at` | TIMESTAMPTZ | YES      | `NOW()`             | Creation timestamp                            |
| `updated_at` | TIMESTAMPTZ | YES      | `NOW()`             | Last update — note: some code paths omit this |
| `deleted_at` | TIMESTAMPTZ | YES      | NULL                | Soft-delete marker                            |

**Evidence — Auto-link creation in tenant-resolver.ts (line ~220):**

```typescript
await api.post(CRUD_ENDPOINT, {
  action: "create",
  table: "user_tenants",
  payload: {
    user_id: userId,
    tenant_id: tenantId,
    role_id: clientRoleId, // nullable — may be null if no matching role found
    is_active: true,
    created_at: new Date().toISOString(),
  },
});
```

**Evidence — Loading user_tenants in AuthContext.tsx (line ~390):**

```typescript
const userTenantRes = await api.post(CRUD_ENDPOINT, {
  action: "list",
  table: "user_tenants",
  ...buildSearchParams(
    [
      { field: "user_id", value: userId },
      { field: "is_active", value: "true" },
    ],
    { sortColumn: "created_at DESC", autoExcludeDeleted: true },
  ),
});
```

**Evidence — partner_id migration (`add-partner-id-to-user-tenants.sql`):**

```sql
ALTER TABLE user_tenants
ADD COLUMN partner_id UUID REFERENCES partners(id);
```

**Key facts:**

- `role_id` is **nullable** — a user can be linked to a tenant with no role → results in zero permissions
- `partner_id` controls **data scope** (which customers the user sees), while `role_id` controls **UI permissions** (which screens/actions are available)
- Unique constraint is NOT enforced at DB level — the code checks for duplicates before creating
- `updated_at` is sometimes omitted (e.g., quick-create in CrudScreen uses only `created_at`)

---

## 3. CPF-Based Auth Flow

**Source files:**

- [core/auth/AuthContext.tsx](../core/auth/AuthContext.tsx) — all auth flows (890 lines)
- [core/auth/auth.types.ts](../core/auth/auth.types.ts) — User, TenantOption, RegisterPayload types
- [core/auth/tenant-context.ts](../core/auth/tenant-context.ts) — domain/subdomain detection
- [services/tenant-resolver.ts](../services/tenant-resolver.ts) — auto-link logic

### 3.1 Registration Flow (new CPF)

```
User enters: name, CPF, email, phone, password
│
├─ 1. buildTenantContextPayload()
│     → Detects hostname, subdomain, query params (?tenant=, ?t=)
│     → Extracts partner_id, referral_code, utm params
│     → Returns TenantContext { hostname, tenant_slug?, partner_id?, ... }
│
├─ 2. POST /auth/register
│     Body: { cpf, email, name, phone, password, hostname, tenant_slug }
│     │
│     ├─ Server creates user in `users` table
│     ├─ Returns: { token, user: { id, cpf, email, fullname, role, ... } }
│     │
│     └─ On 409 → "CPF já cadastrado" (user already exists)
│
├─ 3. extractAuthPayload(response)
│     → Normalizes response shape (handles various API return formats)
│     → Returns { token, user }
│
├─ 4. setAuthToken(token) + SecureStore.setItemAsync("auth_token", token)
│
├─ 5. checkAndMergeUserData(userId)
│     → Fetches full user record from `users` table
│     → Merges server data with auth response data
│     → Sets user state
│
├─ 6. tryAutoResolveTenant(userId)
│     │
│     ├─ a. Calls resolveTenantFromContext(tenantContext)
│     │     → slug match → tenant found → returns { id, company_name, slug, default_client_role }
│     │     → localhost / app.radul.com.br → platform root → returns null (never auto-link)
│     │
│     ├─ b. If tenant found & not platform root:
│     │     → autoLinkUserToTenant(userId, tenantId, tenant.default_client_role ?? "client")
│     │       │
│     │       ├─ Check existing user_tenants (skip if already linked)
│     │       ├─ Find role matching default_client_role:
│     │       │   1. Exact match: roles WHERE name = defaultRole AND tenant_id
│     │       │   2. Partial match: roles WHERE name ILIKE %defaultRole% AND tenant_id
│     │       ├─ Create user_tenants row { user_id, tenant_id, role_id, is_active: true }
│     │       └─ Sync users table: update users SET tenant_id, role = "user"
│     │
│     └─ c. Sets tenant context in user state
│
├─ 7. loadAvailableTenants()
│     → Fetches all user_tenants for this user
│     → Batch-fetches tenant names + role names
│     → Builds TenantOption[] array for tenant switcher
│
└─ 8. tryAutoLinkCompanies(userId, cpf)
      → Fire-and-forget: finds company_members with matching CPF → creates user_tenants
```

### 3.2 Login Flow (existing CPF)

```
User enters: CPF, password
│
├─ 1. buildTenantContextPayload() — same as registration
│
├─ 2. POST /auth/login
│     Body: { cpf, password }
│     Returns: { token, user }
│
├─ 3-8. SAME post-auth chain as registration
│     (extractAuthPayload → setAuthToken → checkAndMergeUserData
│      → tryAutoResolveTenant → loadAvailableTenants → tryAutoLinkCompanies)
```

### 3.3 Google Login Flow

```
User taps "Login com Google"
│
├─ 1. expo-auth-session → Google OAuth → idToken
│
├─ 2. POST /auth/google
│     Body: { id_token: idToken, hostname, tenant_slug }
│     Returns: { token, user }
│     → Server creates user if not exists (by email match)
│
├─ 3-8. SAME post-auth chain
```

### 3.4 Gov.br Login Flow

```
User taps "Login com Gov.br"
│
├─ 1. expo-auth-session → Gov.br OAuth → code + codeVerifier
│
├─ 2. POST /auth/govbr
│     Body: { code, code_verifier, redirect_uri, hostname }
│     Returns: { token, user }
│     → Server creates user if not exists (by CPF from Gov.br)
│
├─ 3-8. SAME post-auth chain
```

**Key insight:** ALL four auth methods converge to the **same post-auth chain** (steps 3-8). The only difference is how the initial `{ token, user }` is obtained.

### 3.5 What happens when someone registers with a CPF that doesn't exist

1. Server creates a new `users` row with the CPF
2. `tryAutoResolveTenant` checks the current domain:
   - If on `escritorio-abc.radul.com.br` → resolves to tenant "Escritório ABC" → auto-links user with the tenant's `default_client_role`
   - If on `app.radul.com.br` or `localhost` → platform root → **no auto-link** (user has no tenant until they're manually added or join via a tenant subdomain)
3. If auto-linked, user gets a `user_tenants` row with whatever `role_id` matches the `default_client_role` string
4. `tryAutoLinkCompanies` checks if their CPF exists in `company_members` → if so, creates additional `user_tenants` rows for those tenants

---

## 4. Current Partner System

**Source files:**

- [hooks/use-partner-scope.ts](../hooks/use-partner-scope.ts) — partner scope resolution hook
- [migrations/add-partner-id-to-user-tenants.sql](../migrations/add-partner-id-to-user-tenants.sql) — schema
- [core/auth/AuthContext.tsx](../core/auth/AuthContext.tsx) — partner_id propagation
- [core/auth/auth.types.ts](../core/auth/auth.types.ts) — User type includes partner_id

### Architecture: Roles vs Partners

The partner system is **orthogonal to the role system**:

| Concept     | Controls                         | Stored In                              | Checked By                           |
| ----------- | -------------------------------- | -------------------------------------- | ------------------------------------ |
| **Role**    | UI permissions (what you CAN do) | `user_tenants.role_id` → `roles`       | `usePermissions()`, `ProtectedRoute` |
| **Partner** | Data scope (what you CAN SEE)    | `user_tenants.partner_id` → `partners` | `usePartnerScope()`                  |

A user can be an "Operador" role (sees admin screens) but scoped to a specific partner (only sees that partner's customers).

### Partner Scope Resolution

```typescript
// hooks/use-partner-scope.ts
export function usePartnerScope(): PartnerScope {
  // 1. Check if user has a partner_id (from user profile / user_tenants)
  if (!userPartnerId || canViewAllPartners) {
    // Admin/tenant user → full access, no filtering
    return { partnerId: null, isPartnerUser: false, customerIds: [] };
  }

  // 2. Check if partner is internal (self-partner)
  // partners WHERE id = userPartnerId → check is_internal flag

  // 3. Fetch customer IDs scoped to this partner
  // customers WHERE partner_id = userPartnerId → array of IDs

  return {
    partnerId: userPartnerId,
    isPartnerUser: true,
    customerIds: [...],
    isInternalPartner: boolean,
    partnerFilter: [{ field: "partner_id", value: partnerId }],
  };
}
```

### How partner_id flows through the system

1. **User_tenants** stores `partner_id` alongside `role_id`
2. **AuthContext** loads `partner_id` from `user_tenants` into the user object
3. **TenantOption** includes `partner_id` (visible in tenant switcher)
4. **usePartnerScope()** reads `user.partner_id` and resolves the full scope
5. **CrudScreen / custom screens** use `partnerFilter` to filter `loadItems` client-side
6. **Self-partner**: `is_internal: true` on `partners` table for tenant's own operations team

### Partner-related fields on key tables

- `user_tenants.partner_id` → UUID FK to `partners(id)` — which partner this user belongs to
- `customers.partner_id` → which partner manages this customer
- `partners.is_internal` → boolean, true = this is the tenant's own internal team
- `user.can_view_all_partners` → boolean override that lets a partner user see all data

---

## 5. Role Creation & Management

**Source files:**

- [services/onboarding.ts](../services/onboarding.ts) — initial role creation during tenant setup
- [services/template-packs.ts](../services/template-packs.ts) — pack-driven role creation
- [core/auth/permissions.sync.ts](../core/auth/permissions.sync.ts) — permission assignment
- [app/(app)/Administrador/roles.tsx](<../app/(app)/Administrador/roles.tsx>) — admin management screen

### 5.1 Three paths to role creation

#### Path A: Onboarding — Default Roles

During `createTenant()` in onboarding.ts, `ensureDefaultRoles()` creates 3 roles:

```typescript
const DEFAULT_TENANT_ROLES = [
  { name: "Administrador", roleType: "admin" },
  { name: "Cliente", roleType: "client" },
  { name: "Parceiro", roleType: "operador_parceiro" },
];
```

After creating each role, `assignDefaultPermissionsToRole(roleId, roleName)` is called, which uses fuzzy name matching to assign permissions from `DEFAULT_ROLE_PERMISSIONS`.

#### Path B: Template Pack Application

Template packs define roles with explicit permissions. During `applyTemplatePack()`:

1. **Step 8**: For each `PackRole` in the pack, check if role already exists (by name + tenant_id)
2. **Step 9**: If not exists → create role → assign pack-defined permissions
3. **Step 10**: If exists → skip (no overwrite)

**Example — Pack role definitions:**

| Pack          | Roles Defined                                    | Has Admin? | Has Client? |
| ------------- | ------------------------------------------------ | ---------- | ----------- |
| `padrao`      | admin, Gestor, Operador, client                  | ✅ Yes     | ✅ Yes      |
| `juridico`    | Advogado, Estagiário, Cliente (Portal)           | ❌ No      | ✅ Yes      |
| `comercio`    | Vendedor, Estoquista, Entregador                 | ❌ No      | ❌ No       |
| `consultoria` | Consultor, Analista, Cliente (Portal)            | ❌ No      | ✅ Yes      |
| `saude`       | Profissional, Recepcionista, Paciente (Portal)   | ❌ No      | ✅ Yes      |
| `revenda`     | Gerente de Contas, Suporte, Sub-Cliente (Portal) | ❌ No      | ✅ Yes      |

**Critical finding:** Only `padrao` pack includes an admin role. For all other packs, the onboarding flow creates a fallback "Administrador" role with only `admin.full` permission (1 permission instead of the full ~50+ admin set).

#### Path C: Admin Screen — Manual Creation

Via [roles.tsx](<../app/(app)/Administrador/roles.tsx>):

1. User with `ROLE_MANAGE` permission accesses the Roles screen
2. Creates role via CrudScreen → POST to `api_crud` with `action: "create", table: "roles"`
3. After creation, `assignDefaultPermissionsToRole()` auto-assigns permissions based on role name fuzzy matching

### 5.2 Permission assignment — fuzzy matching

```typescript
// core/auth/permissions.sync.ts
export async function assignDefaultPermissionsToRole(
  roleId: string,
  roleName: string,
) {
  const normalized = roleName.trim().toLowerCase();

  // 1. Direct key match
  const directMatch = DEFAULT_ROLE_PERMISSIONS[normalized];
  if (directMatch) {
    /* assign directMatch permissions */ return;
  }

  // 2. Partial match — first key where normalized.includes(key)
  const partialKey = Object.keys(DEFAULT_ROLE_PERMISSIONS).find((key) =>
    normalized.includes(key),
  );
  if (partialKey) {
    /* assign DEFAULT_ROLE_PERMISSIONS[partialKey] */ return;
  }

  // 3. No match → no permissions assigned
}
```

**DEFAULT_ROLE_PERMISSIONS presets:**

| Key                 | Permission Count | Examples                          |
| ------------------- | ---------------- | --------------------------------- |
| `admin`             | ~50+             | All permissions                   |
| `manager`           | ~26              | Most view/manage, no system admin |
| `client`            | ~16              | View own data, portal access      |
| `operador`          | ~44              | Operations, no system admin       |
| `operador_parceiro` | ~22              | Partner operations, limited scope |

**Risk:** "Administrador de Vendas" matches "admin" preset → gets full admin permissions. See Section 8 recommendations.

### 5.3 Admin Roles Screen — Data Loading

```typescript
// roles.tsx — 3-table parallel fetch + client-side join
const [rolesRes, rpRes, permsRes] = await Promise.all([
  api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "roles" /* tenant filter */,
  }),
  api.post(CRUD_ENDPOINT, { action: "list", table: "role_permissions" }),
  api.post(CRUD_ENDPOINT, { action: "list", table: "permissions" }),
]);

// Build permission map: permissionId → code
// For each role: count linked permissions + preview first 3 codes
```

**Action buttons per role:**

1. **"Permissões"** → navigates to role_permissions CrudScreen filtered by roleId
2. **"Matriz"** → navigates to permissions matrix view for the role

---

## 6. Navigation Filtering by Permissions

**Source files:**

- [core/layout/AppFooter.tsx](../core/layout/AppFooter.tsx) — bottom tab navigation
- [core/auth/PermissionsContext.tsx](../core/auth/PermissionsContext.tsx) — permission loading
- [core/auth/usePermissions.ts](../core/auth/usePermissions.ts) — permission hook
- [core/admin/admin-pages.ts](../core/admin/admin-pages.ts) — page definitions with required permissions
- [core/auth/permissions.ts](../core/auth/permissions.ts) — ADMIN_PANEL_PERMISSIONS constant

### 6.1 Permission Loading Pipeline

```
User logs in → tenant selected
│
├─ PermissionsContext.tsx — 4-step fetch:
│   │
│   ├─ Step 1: user_tenants WHERE user_id AND tenant_id → get role_id
│   ├─ Step 2: role_permissions WHERE role_id IN (...) → get permission_ids
│   ├─ Step 3: permissions WHERE id IN (...) → get permission codes
│   └─ Step 4: Build Set<string> of permission codes
│
│   ⚡ Admin shortcut: if isUserAdmin(user) → return ["admin.full"] immediately
│   (skips all DB queries)
│
└─ Exposes: { permissions, hasPermission, hasAnyPermission, hasAllPermissions, isAdmin, loading }
```

### 6.2 Bottom Tab Navigation (AppFooter.tsx)

```typescript
// core/layout/AppFooter.tsx
const { hasAnyPermission, isAdmin } = usePermissions();

// Who sees the Admin tab:
const canAccessAdmin =
  isRadulUser(user) || hasAnyPermission(ADMIN_PANEL_PERMISSIONS);

// Navigation items:
const navItems = [
  { label: "Início", route: "/(app)/home", always: true },
  { label: "Admin", route: "/(app)/Administrador", if: canAccessAdmin },
  { label: "Atendimento", route: "/(app)/Atendimento", if: !canAccessAdmin }, // mutually exclusive
  { label: "Serviços", route: "/(app)/Servicos", always: true },
  { label: "Notificações", route: "/(app)/Notificacoes", always: true },
  { label: "Perfil", route: "/(app)/Perfil", always: true },
];
```

Users without admin permissions see "Atendimento" instead of "Admin" — they never see the admin panel.

### 6.3 Admin Pages Permission Gating

Each page in `admin-pages.ts` has optional permission requirements:

```typescript
type AdminPage = {
  id: string;
  group: string;
  module: "admin" | "operacao" | "cliente";
  title: string;
  description: string;
  icon: string;
  route: string;
  hidden?: boolean;
  superAdminOnly?: boolean; // Only for Radul platform admins
  requiredAnyPermissions?: Permission[]; // User needs at least one of these
};
```

**Examples:**

- `superAdminOnly: true` → Tables, Tenants, Módulos (only Radul super-admin)
- `requiredAnyPermissions: [PERMISSIONS.TENANT_MANAGE]` → Tenant-scoped admin pages
- `requiredAnyPermissions: [PERMISSIONS.ROLE_MANAGE]` → Roles management
- `requiredAnyPermissions: [PERMISSIONS.SERVICE_VIEW]` → Service-related pages

**Additionally**, the module system (`useTenantModules()`) filters pages by which modules the tenant has activated — a page requiring the `crm` module won't appear if the tenant hasn't enabled CRM.

### 6.4 ProtectedRoute Component

Individual screens can wrap content with `ProtectedRoute`:

```tsx
<ProtectedRoute requiredPermission={PERMISSIONS.ROLE_MANAGE}>
  <CrudScreen ... />
</ProtectedRoute>
```

If the user lacks the permission, they see an "access denied" message instead of the screen.

### 6.5 The `admin.full` God Permission

When a user's role has `admin.full` in `role_permissions`:

- `hasPermission("anything")` → always returns `true`
- `hasAnyPermission([...])` → always returns `true`
- `isAdmin` flag → `true`

This means tenant admins bypass all permission checks via a single permission entry.

---

## 7. Default Roles

**Source files:**

- [services/onboarding.ts](../services/onboarding.ts) — DEFAULT_TENANT_ROLES
- [core/auth/permissions.ts](../core/auth/permissions.ts) — DEFAULT_ROLE_PERMISSIONS
- [data/template-packs/](../data/template-packs/) — pack-specific roles

### 7.1 Roles created during onboarding

Every new tenant gets 3 default roles from `ensureDefaultRoles()`:

| Role Name         | roleType            | Permissions Match                             | Permission Count |
| ----------------- | ------------------- | --------------------------------------------- | ---------------- |
| **Administrador** | `admin`             | DEFAULT_ROLE_PERMISSIONS["admin"]             | ~50+             |
| **Cliente**       | `client`            | DEFAULT_ROLE_PERMISSIONS["client"]            | ~16              |
| **Parceiro**      | `operador_parceiro` | DEFAULT_ROLE_PERMISSIONS["operador_parceiro"] | ~22              |

### 7.2 Additional roles from template packs

When a template pack is applied (during onboarding Step 3), the pack may add more roles:

- **padrao**: adds `admin` (with pack-specific permissions), `Gestor`, `Operador`, `client`
- **juridico**: adds `Advogado`, `Estagiário`, `Cliente (Portal)`
- **comercio**: adds `Vendedor`, `Estoquista`, `Entregador`
- **consultoria**: adds `Consultor`, `Analista`, `Cliente (Portal)`
- **saude**: adds `Profissional`, `Recepcionista`, `Paciente (Portal)`
- **revenda**: adds `Gerente de Contas`, `Suporte`, `Sub-Cliente (Portal)`

### 7.3 Admin role assignment after onboarding

After template pack application, the onboarding flow ensures the creating user gets admin access:

```typescript
// services/onboarding.ts — runOnboarding()
// Step: findAdminRoleId
const adminRole = roles.find(
  (r) =>
    r.name.toLowerCase().includes("admin") ||
    r.name.toLowerCase().includes("administrador"),
);

if (adminRole) {
  // Assign admin.full permission to this role
  await assignAdminFullPermission(adminRole.id);
  // Link user to tenant with this admin role
  await linkUserToTenant(userId, tenantId, adminRole.id);
} else {
  // Fallback: create "Administrador" role with admin.full only
  const fallbackRole = await createRole("Administrador", tenantId);
  await assignAdminFullPermission(fallbackRole.id);
  await linkUserToTenant(userId, tenantId, fallbackRole.id);
}

// Then set users.role = "admin" (global field)
await api.post(CRUD_ENDPOINT, {
  action: "update",
  table: "users",
  payload: { id: userId, role: "admin" },
});
```

### 7.4 Hardcoded role names inventory

~20+ hardcoded role name strings scattered across the codebase:

| String                | Where Used                         | Purpose                           |
| --------------------- | ---------------------------------- | --------------------------------- |
| `"Administrador"`     | onboarding.ts, tenant-resolver.ts  | Default admin role name           |
| `"Cliente"`           | onboarding.ts                      | Default client role name          |
| `"Parceiro"`          | onboarding.ts                      | Default partner role name         |
| `"admin"`             | auth.utils.ts, template packs      | Role value / pack role name       |
| `"client"`            | migration default, template packs  | default_client_role value         |
| `"user"`              | tenant-resolver.ts                 | Global users.role after auto-link |
| `"administrator"`     | auth.utils.ts ADMIN_ROLE_VALUES    | Admin role string variant         |
| `"superadmin"`        | auth.utils.ts ADMIN_ROLE_VALUES    | Admin role string variant         |
| `"operador"`          | auth.utils.ts, template packs      | Operator role string              |
| `"operador_parceiro"` | auth.utils.ts, template packs      | Partner operator role string      |
| `"gestor"`            | auth.utils.ts OPERATOR_ROLE_VALUES | Manager/supervisor variant        |
| `"Advogado"`          | juridico.ts pack                   | Lawyer role                       |
| `"Vendedor"`          | comercio.ts pack                   | Salesperson role                  |
| `"Consultor"`         | consultoria.ts pack                | Consultant role                   |
| `"Profissional"`      | saude.ts pack                      | Health professional role          |
| `"Gerente de Contas"` | revenda.ts pack                    | Account manager role              |

---

## 8. Tenant default_client_role

**Source files:**

- [migrations/add-tenant-slug-custom-domains.sql](../migrations/add-tenant-slug-custom-domains.sql) — column definition
- [services/onboarding.ts](../services/onboarding.ts) — sets value during tenant creation
- [services/tenant-resolver.ts](../services/tenant-resolver.ts) — reads value during auto-link

### 8.1 Column definition

```sql
-- migrations/add-tenant-slug-custom-domains.sql
ALTER TABLE tenants ADD COLUMN default_client_role TEXT DEFAULT 'client';
```

### 8.2 Value lifecycle

```
1. Migration creates column → default = 'client' (lowercase, English)

2. createTenant() in onboarding.ts sets:
   default_client_role: "Cliente"  ← Portuguese, capitalized!

3. resolveTenantFromContext() reads it:
   SELECT ... default_client_role FROM tenants WHERE slug = ?

4. tryAutoResolveTenant() passes it:
   autoLinkUserToTenant(userId, tenantId, tenant.default_client_role ?? "client")

5. autoLinkUserToTenant() uses it to find a role:
   // Step 1: exact match
   roles WHERE name = defaultRole AND tenant_id = ?
   // Step 2: fallback partial match
   roles WHERE LOWER(name) LIKE '%' || LOWER(defaultRole) || '%' AND tenant_id = ?
```

### 8.3 Usage chain diagram

```
New user registers on {slug}.radul.com.br
│
├─ resolveTenantFromContext({ slug })
│   → SELECT ... default_client_role FROM tenants WHERE slug = ?
│   → Returns "Cliente" (set by onboarding) or "client" (migration default)
│
├─ autoLinkUserToTenant(userId, tenantId, "Cliente")
│   │
│   ├─ 1. Exact match: roles WHERE name = 'Cliente' AND tenant_id = ?
│   │   → IF FOUND → use this role_id ✅
│   │
│   ├─ 2. Partial match: roles WHERE LOWER(name) LIKE '%cliente%' AND tenant_id = ?
│   │   → Could match "Cliente", "Cliente (Portal)", "Sub-Cliente (Portal)"
│   │   → Uses FIRST match found ⚠️
│   │
│   └─ 3. No match → user_tenants.role_id = NULL → zero permissions ❌
│
└─ User gets linked to tenant with the resolved role (or no role)
```

### 8.4 Potential issues

1. **Case mismatch**: Migration default is `'client'` but onboarding sets `"Cliente"`. For tenants created via onboarding → "Cliente". For tenants created via direct DB → "client". The partial match (`ILIKE '%client%'`) handles this, but exact match fails.

2. **Comercio pack has no client role**: The `comercio` pack creates Vendedor, Estoquista, Entregador — none match "client" or "Cliente". Users auto-linked to comercio tenants get `role_id = NULL`.

3. **Not configurable in UI**: There is no admin screen to change `default_client_role`. Tenants are stuck with whatever was set during onboarding unless a developer updates it directly in the DB.

4. **Ambiguous partial matching**: If a tenant has both "Cliente" and "Cliente (Portal)", the partial match returns whichever the DB query returns first — non-deterministic.

---

## 9. Dual Authorization System — Critical Architecture Note

The codebase has **two parallel authorization tracks** that operate independently:

| System                 | Storage                                     | Checked By                           | Scope                   |
| ---------------------- | ------------------------------------------- | ------------------------------------ | ----------------------- |
| **Global role string** | `users.role` (single text field)            | `isUserAdmin()`, `isUserOperator()`  | Same across ALL tenants |
| **Tenant-scoped role** | `user_tenants.role_id` → `role_permissions` | `usePermissions()`, `ProtectedRoute` | Different per tenant    |

**Why this matters:**

- A user can be `users.role = "admin"` (passing `isUserAdmin()`) but have a non-admin role with minimal permissions in a specific tenant
- A user can be `users.role = "user"` but have `admin.full` permission via their tenant role
- In multi-tenant scenarios, `users.role` is a single global value while `user_tenants.role_id` is per-tenant

**Where each is used:**

- `isUserAdmin()` → AppFooter.tsx (admin tab shortcut), auth.utils.ts (general admin check)
- `usePermissions()` → ProtectedRoute, admin-pages.ts filtering, individual screen gates

---

## 10. Risks & Recommendations

### 10.1 Non-Padrao Pack Admin Permission Gap

**Problem:** Only `padrao` pack defines an admin role. Other 5 packs trigger fallback "Administrador" with only `admin.full` (1 permission). Functionally OK (admin.full is a god-permission) but leaves `role_permissions` without granular entries.

**Recommendation:** Call `assignDefaultPermissionsToRole(adminRoleId, "admin")` in onboarding after fallback role creation.

### 10.2 Comercio Pack — Missing Client Role

**Problem:** Comercio pack creates Vendedor/Estoquista/Entregador — none match default_client_role. Auto-linked users get `role_id = NULL` → zero permissions.

**Recommendation:** Add "Cliente" role to comercio pack, or set `default_client_role = "Vendedor"` for comercio tenants.

### 10.3 Fuzzy Name Matching

**Problem:** `assignDefaultPermissionsToRole()` uses `.includes()` — "Administrador de Vendas" matches "admin" preset unexpectedly.

**Recommendation:** Use exact matching from a curated map, or add a `preset` field to the `roles` table.

### 10.4 default_client_role Not in UI

**Problem:** No admin screen to change which role auto-linked users receive.

**Recommendation:** Add `default_client_role` as a dropdown in tenant settings, populated from the tenant's roles.

### 10.5 Dual Auth System Drift

**Problem:** `users.role` and `user_tenants.role_id` can diverge.

**Recommendation:** Long-term, deprecate `users.role` in favor of tenant-scoped `user_tenants.role_id`. Short-term, ensure both are set consistently.

---

## Appendix: Key File Reference

| File                                                                                              | Purpose                                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [core/auth/AuthContext.tsx](../core/auth/AuthContext.tsx)                                         | Central auth provider — login, register, tenant switching, auto-link     |
| [core/auth/auth.types.ts](../core/auth/auth.types.ts)                                             | User, TenantOption, RegisterPayload types                                |
| [core/auth/auth.utils.ts](../core/auth/auth.utils.ts)                                             | ADMIN_ROLE_VALUES, isUserAdmin(), isUserOperator()                       |
| [core/auth/tenant-context.ts](../core/auth/tenant-context.ts)                                     | Domain/subdomain detection for tenant resolution                         |
| [core/auth/permissions.ts](../core/auth/permissions.ts)                                           | PERMISSIONS constants, DEFAULT_ROLE_PERMISSIONS, ADMIN_PANEL_PERMISSIONS |
| [core/auth/permissions.sync.ts](../core/auth/permissions.sync.ts)                                 | syncPermissions(), assignDefaultPermissionsToRole()                      |
| [core/auth/PermissionsContext.tsx](../core/auth/PermissionsContext.tsx)                           | 4-step permission loading, admin shortcut                                |
| [core/auth/usePermissions.ts](../core/auth/usePermissions.ts)                                     | Thin hook wrapper for PermissionsContext                                 |
| [core/layout/AppFooter.tsx](../core/layout/AppFooter.tsx)                                         | Bottom tab navigation with permission gating                             |
| [core/admin/admin-pages.ts](../core/admin/admin-pages.ts)                                         | Admin page definitions with requiredAnyPermissions                       |
| [services/onboarding.ts](../services/onboarding.ts)                                               | Tenant creation, ensureDefaultRoles, admin role assignment               |
| [services/tenant-resolver.ts](../services/tenant-resolver.ts)                                     | Domain → tenant resolution, autoLinkUserToTenant                         |
| [services/template-packs.ts](../services/template-packs.ts)                                       | Template pack application (roles at steps 8-10)                          |
| [app/(app)/Administrador/roles.tsx](<../app/(app)/Administrador/roles.tsx>)                       | Admin CrudScreen for role management                                     |
| [hooks/use-partner-scope.ts](../hooks/use-partner-scope.ts)                                       | Partner data scope resolution                                            |
| [migrations/add-partner-id-to-user-tenants.sql](../migrations/add-partner-id-to-user-tenants.sql) | partner_id column on user_tenants                                        |
| [migrations/add-tenant-fk-to-roles.sql](../migrations/add-tenant-fk-to-roles.sql)                 | tenant_id FK on roles                                                    |
| [migrations/add-tenant-slug-custom-domains.sql](../migrations/add-tenant-slug-custom-domains.sql) | default_client_role column on tenants                                    |
