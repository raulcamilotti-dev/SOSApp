# Radul Platform — Public REST API Reference (v1)

## Overview

The Radul Platform Public API provides read-only REST access to your tenant's data. Designed for integrations, dashboards, and third-party tools.

- **Base URL (Production):** `https://api-crud.sosescritura.com.br/v1`
- **Base URL (Dev):** `https://sos-api-crud.raulcamilotti-c44.workers.dev/v1`
- **Protocol:** HTTPS only
- **Format:** JSON
- **CORS:** `Access-Control-Allow-Origin: *` (accessible from any origin)
- **Version:** v1 (read-only MVP)

---

## Authentication

All requests must include an API key in the `Authorization` header using the Bearer scheme.

```
Authorization: Bearer rk_live_<your-api-key-here>
```

### Key Format

| Environment | Format                   | Example               |
| ----------- | ------------------------ | --------------------- |
| **Live**    | `rk_live_{40 hex chars}` | `rk_live_a1b2c3d4...` |
| **Test**    | `rk_test_{40 hex chars}` | `rk_test_f9e8d7c6...` |

### Creating API Keys

API keys are managed via the admin panel: **Administrador → Configurações → Chaves de API**.

When a key is created:

1. The **plaintext key** is shown **once** — copy it immediately
2. Only an HMAC-SHA256 hash is stored in the database
3. Keys can be scoped to specific tables and operations
4. Each key belongs to a single tenant — all queries are automatically filtered by `tenant_id`

### Key Properties

| Property                | Type     | Default    | Description                                     |
| ----------------------- | -------- | ---------- | ----------------------------------------------- |
| `name`                  | string   | (required) | Human-readable name for the key                 |
| `environment`           | string   | `"live"`   | `"live"` or `"test"`                            |
| `scopes`                | string[] | `["read"]` | Allowed operations: `read`, `write`, `delete`   |
| `allowed_tables`        | string[] | `[]`       | Explicit table whitelist (empty = use defaults) |
| `rate_limit_per_minute` | number   | `60`       | Max requests per minute                         |
| `expires_at`            | datetime | `null`     | Optional expiration date                        |

---

## Tenant Isolation

**All queries are automatically scoped to your tenant.** The API key is linked to a `tenant_id`, and every request automatically includes `WHERE tenant_id = '{your_tenant_id}'`. You cannot access data from other tenants, and you cannot override this filter.

---

## Endpoints

### `GET /v1`

Returns API information and current key context.

**Response:**

```json
{
  "data": {
    "api": "Radul Platform Public API",
    "version": "v1",
    "docs": "https://docs.radul.com.br/api",
    "scopes": ["read"],
    "tenant_id": "abc-123-...",
    "rate_limit": {
      "limit": 60,
      "remaining": 58,
      "reset": 1710000000
    }
  }
}
```

---

### `GET /v1/:table`

List records from a table with filtering, sorting, and pagination.

**Example:**

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/customers?status=active&_sort=-created_at&_limit=10"
```

**Response:**

```json
{
  "data": [
    { "id": "uuid-1", "name": "João Silva", "status": "active", ... },
    { "id": "uuid-2", "name": "Maria Santos", "status": "active", ... }
  ],
  "meta": {
    "total": 157,
    "limit": 10,
    "offset": 0,
    "has_more": true
  }
}
```

---

### `GET /v1/:table/:id`

Get a single record by ID. Automatically enforces `tenant_id` and `deleted_at IS NULL`.

**Example:**

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/customers/uuid-1"
```

**Response:**

```json
{
  "data": {
    "id": "uuid-1",
    "name": "João Silva",
    "email": "joao@example.com",
    "tenant_id": "abc-123-...",
    "created_at": "2026-01-15T10:30:00Z",
    ...
  }
}
```

If not found: `404 NOT_FOUND`.

---

### `GET /v1/:table/count`

Count records matching filters. Supports the same query parameters as list.

**Example:**

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/invoices/count?status=paid"
```

**Response:**

```json
{
  "data": {
    "count": 42
  }
}
```

---

### `GET /v1/:table/schema`

Get column metadata for a table (data types, nullability, foreign keys).

**Example:**

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/customers/schema"
```

**Response:**

```json
{
  "data": [
    {
      "column_name": "id",
      "data_type": "uuid",
      "udt_name": "uuid",
      "is_nullable": "NO",
      "column_default": "gen_random_uuid()",
      "referenced_table_name": null
    },
    {
      "column_name": "tenant_id",
      "data_type": "uuid",
      "udt_name": "uuid",
      "is_nullable": "NO",
      "column_default": null,
      "referenced_table_name": "tenants"
    },
    ...
  ]
}
```

---

## Query Parameters

### Filtering

Add query parameters to filter results. Use double-underscore suffixes to specify operators.

| Syntax                     | Operator      | SQL Equivalent          | Example                         |
| -------------------------- | ------------- | ----------------------- | ------------------------------- |
| `?field=value`             | `equal`       | `field = 'value'`       | `?status=active`                |
| `?field__not_equal=value`  | `not_equal`   | `field != 'value'`      | `?status__not_equal=cancelled`  |
| `?field__like=value`       | `like`        | `field LIKE 'value'`    | `?name__like=%Silva%`           |
| `?field__ilike=value`      | `ilike`       | `field ILIKE '%value%'` | `?name__ilike=silva`            |
| `?field__gt=value`         | `gt`          | `field > 'value'`       | `?amount__gt=100`               |
| `?field__gte=value`        | `gte`         | `field >= 'value'`      | `?amount__gte=100`              |
| `?field__lt=value`         | `lt`          | `field < 'value'`       | `?created_at__lt=2026-01-01`    |
| `?field__lte=value`        | `lte`         | `field <= 'value'`      | `?due_date__lte=2026-03-31`     |
| `?field__in=val1,val2`     | `in`          | `field IN ('v1','v2')`  | `?status__in=paid,overdue`      |
| `?field__is_null=true`     | `is_null`     | `field IS NULL`         | `?deleted_at__is_null=true`     |
| `?field__is_not_null=true` | `is_not_null` | `field IS NOT NULL`     | `?partner_id__is_not_null=true` |

> **Note:** For `ilike`, wildcards `%` are automatically added around the value if not already present. For `like`, you must provide your own wildcards.

**Combining filters:** All filters are combined with `AND`. Maximum **7 custom filters** per request (1 slot is reserved for mandatory `tenant_id`).

**The `tenant_id` filter cannot be overridden** — it's always applied automatically.

### Sorting

| Parameter | Description                        | Example                                   |
| --------- | ---------------------------------- | ----------------------------------------- |
| `_sort`   | Sort columns. Prefix `-` for DESC. | `_sort=-created_at` or `_sort=name,-date` |

Default: `_sort=-created_at` (newest first).

Multiple sort columns: `_sort=-status,name` → `ORDER BY status DESC, name ASC`.

### Pagination

| Parameter | Description      | Default | Max   |
| --------- | ---------------- | ------- | ----- |
| `_limit`  | Records per page | `20`    | `100` |
| `_offset` | Skip N records   | `0`     | —     |

The response `meta` object includes:

```json
{
  "meta": {
    "total": 157, // Total matching records
    "limit": 20, // Applied limit
    "offset": 0, // Applied offset
    "has_more": true // Whether more records exist
  }
}
```

### Field Selection

| Parameter | Description                     | Example                        |
| --------- | ------------------------------- | ------------------------------ |
| `_fields` | Comma-separated list of columns | `_fields=id,name,email,status` |

Returns only the specified columns (plus `tenant_id` for isolation).

### Include Deleted Records

| Parameter  | Description                           | Example         |
| ---------- | ------------------------------------- | --------------- |
| `_deleted` | Set to `true` to include soft-deleted | `_deleted=true` |

By default, records with `deleted_at IS NOT NULL` are excluded.

---

## Rate Limiting

Each API key has a configurable rate limit (default: 60 requests/minute). Rate limit uses a **fixed window per minute** strategy backed by Cloudflare KV.

### Rate Limit Headers

Every response includes rate limit headers:

| Header                  | Description                                 | Example      |
| ----------------------- | ------------------------------------------- | ------------ |
| `X-RateLimit-Limit`     | Maximum requests per minute                 | `60`         |
| `X-RateLimit-Remaining` | Remaining requests in current window        | `57`         |
| `X-RateLimit-Reset`     | Unix timestamp (seconds) when window resets | `1710000060` |
| `Retry-After`           | Seconds until next window (only on 429)     | `42`         |

### 429 Response

When the rate limit is exceeded:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 42 seconds.",
    "retry_after": 42
  }
}
```

### Fail-Open Strategy

If Cloudflare KV is temporarily unavailable, the rate limiter **allows** the request rather than blocking it. This ensures KV outages don't cause API downtime.

---

## Error Responses

All errors follow the same format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

### Error Codes

| HTTP | Code                  | Description                                               |
| ---- | --------------------- | --------------------------------------------------------- |
| 401  | `MISSING_API_KEY`     | No `Authorization` header provided                        |
| 401  | `INVALID_AUTH_FORMAT` | Header doesn't use `Bearer` scheme                        |
| 401  | `INVALID_KEY_FORMAT`  | Key doesn't match `rk_live_...` or `rk_test_...` format   |
| 401  | `INVALID_API_KEY`     | Key not found or HMAC verification failed                 |
| 401  | `KEY_DELETED`         | Key has been revoked                                      |
| 403  | `KEY_INACTIVE`        | Key exists but is deactivated                             |
| 403  | `KEY_EXPIRED`         | Key has passed its expiration date                        |
| 403  | `INSUFFICIENT_SCOPE`  | Key doesn't have the required scope (e.g., `read`)        |
| 403  | `TABLE_FORBIDDEN`     | Table is in the system forbidden list                     |
| 403  | `TABLE_NOT_ALLOWED`   | Table is not in the key's allowed list                    |
| 400  | `QUERY_ERROR`         | SQL query or parameter error                              |
| 404  | `NOT_FOUND`           | Record with given ID not found                            |
| 404  | `TABLE_NOT_FOUND`     | Table doesn't exist (schema endpoint)                     |
| 429  | `RATE_LIMIT_EXCEEDED` | Too many requests in the current window                   |
| 501  | `NOT_IMPLEMENTED`     | Write operations (POST/PUT/PATCH/DELETE) — coming in v1.1 |

---

## Available Tables

### Default Allowed Tables

When an API key has `allowed_tables: []` (empty), the following tables are accessible by default:

| Category          | Tables                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| **Core Business** | `customers`, `companies`, `company_members`, `properties`                                                   |
| **Services**      | `service_orders`, `service_order_context`, `service_types`, `service_categories`, `services`                |
| **Workflow**      | `workflow_templates`, `workflow_steps`                                                                      |
| **Process**       | `process_updates`, `process_deadlines`, `tasks`                                                             |
| **Financial**     | `invoices`, `invoice_items`, `payments`, `quotes`, `quote_items`, `accounts_receivable`, `accounts_payable` |
| **Partners**      | `partners`, `partner_earnings`                                                                              |
| **Documents**     | `document_templates`, `generated_documents`                                                                 |
| **CRM**           | `leads`                                                                                                     |
| **Products**      | `products`, `product_categories`, `stock_movements`, `stock_locations`                                      |
| **Purchases**     | `purchase_orders`, `purchase_order_items`, `suppliers`                                                      |
| **Contracts**     | `contracts`, `contract_service_orders`                                                                      |
| **Notifications** | `notifications`                                                                                             |
| **Custom Fields** | `custom_field_definitions`, `custom_field_values`                                                           |

### Forbidden Tables (Never Accessible)

These tables are **always blocked** regardless of `allowed_tables` configuration:

`users`, `user_tenants`, `auth_codes`, `auth_tokens`, `tenants`, `roles`, `role_permissions`, `permissions`, `api_keys`, `tenant_modules`, `n8n_chat_histories`, `buffer_chat_history`, `buffer_mensagens_manuais`, `controle_atendimento`, `contexto_conversa`

### Custom Table Access

Set `allowed_tables` on your API key to restrict access to specific tables:

```json
{
  "allowed_tables": ["customers", "invoices", "payments"]
}
```

This overrides the default whitelist — only the explicitly listed tables will be accessible.

---

## Examples

### List Active Customers

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/customers?_sort=name&_limit=50"
```

### Search Customers by Name

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/customers?name__ilike=silva"
```

### Get Paid Invoices in Date Range

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/invoices?status=paid&created_at__gte=2026-01-01&created_at__lt=2026-02-01&_sort=-total_amount"
```

### Count Overdue Invoices

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/invoices/count?status__in=overdue,past_due"
```

### Get a Specific Service Order

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/service_orders/550e8400-e29b-41d4-a716-446655440000"
```

### Explore Table Schema

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/customers/schema"
```

### Paginate Through All Leads

```bash
# Page 1
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/leads?_limit=20&_offset=0"

# Page 2
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/leads?_limit=20&_offset=20"
```

### Select Specific Fields

```bash
curl -H "Authorization: Bearer rk_live_..." \
  "https://api-crud.sosescritura.com.br/v1/customers?_fields=id,name,email,phone&_sort=name"
```

---

## SDK / Client Examples

### JavaScript / TypeScript

```typescript
const API_KEY = "rk_live_...";
const BASE = "https://api-crud.sosescritura.com.br/v1";

async function listCustomers(search?: string) {
  const params = new URLSearchParams({
    _sort: "name",
    _limit: "50",
  });
  if (search) params.set("name__ilike", search);

  const res = await fetch(`${BASE}/customers?${params}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? "API error");
  }

  const { data, meta } = await res.json();
  console.log(`${meta.total} customers found, showing ${data.length}`);
  return data;
}
```

### Python

```python
import requests

API_KEY = "rk_live_..."
BASE = "https://api-crud.sosescritura.com.br/v1"

def list_invoices(status="paid", limit=20):
    resp = requests.get(
        f"{BASE}/invoices",
        headers={"Authorization": f"Bearer {API_KEY}"},
        params={"status": status, "_limit": limit, "_sort": "-created_at"},
    )
    resp.raise_for_status()
    data = resp.json()
    return data["data"], data.get("meta", {})

invoices, meta = list_invoices()
print(f"Total: {meta['total']} | Page: {len(invoices)}")
```

---

## Scopes

API keys support granular scopes:

| Scope    | HTTP Methods     | Status       |
| -------- | ---------------- | ------------ |
| `read`   | GET              | ✅ Available |
| `write`  | POST, PUT, PATCH | 🔜 v1.1      |
| `delete` | DELETE           | 🔜 v1.1      |

Currently, only the `read` scope is functional. Write and delete operations return `501 NOT_IMPLEMENTED`.

---

## Security

- **HMAC-SHA256:** Key verification uses HMAC-SHA256 via Web Crypto API (<1ms per verification)
- **Plaintext never stored:** Only the hash and a prefix (first 16 characters) are stored
- **Tenant isolation:** Every query is scoped to the key's `tenant_id` — cross-tenant access is impossible
- **Forbidden tables:** Auth/billing tables are hardcoded as inaccessible
- **Key expiration:** Optional `expires_at` for time-limited integrations
- **Revocation:** Keys can be deactivated or deleted at any time via the admin panel
- **SQL injection safe:** All identifiers are validated via `validateIdentifier()`, parameters are properly parameterized

---

## Roadmap

### v1.1 (Planned)

- **Write operations:** POST (create), PUT/PATCH (update), DELETE (soft-delete)
- **Webhooks:** Event notifications for record changes
- **Bulk operations:** Batch create/update

### v1.2 (Planned)

- **Aggregate queries:** SUM, COUNT, AVG, GROUP BY via query params
- **Relationships:** Include related records in a single request
- **API key rotation:** Generate new key while keeping the old one active temporarily

---

_API Reference — Radul Platform v1 • April 2026_
