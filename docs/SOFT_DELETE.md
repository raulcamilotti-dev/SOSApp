# Soft Delete Implementation Guide

## 📋 Overview

Sistema de soft delete foi adicionado a **16 tabelas principais**:

- users, customers, tasks, projects, properties
- roles, permissions, agents, automations, reminders
- tenants, user_tenants, role_permissions, services
- workflow_templates, workflow_steps

## 🗄️ Banco de Dados

Cada tabela agora possui uma coluna `deleted_at`:

```sql
-- NULL = Ativo, TIMESTAMP = Deletado
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;

-- Índices para melhor performance em queries
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
```

## 💻 Uso no Código TypeScript

### 1. Importar Utilidades

```typescript
import {
  softDeletePayload,
  softRestorePayload,
  isActive,
  filterActive,
} from "@/core/utils/soft-delete";
```

### 2. Soft Delete (Marcar como Deletado)

**Ao invés de:**

```tsx
// ❌ Hard delete - perde dados
await api.post(ENDPOINT, {
  action: "delete",
  table: "users",
  id: userId,
});
```

**Fazer:**

```tsx
// ✅ Soft delete - preserva dados
await api.post(ENDPOINT, {
  action: "update",
  table: "users",
  payload: {
    id: userId,
    ...softDeletePayload(), // Adiciona deleted_at: <now>
  },
});
```

### 3. Listar Apenas Ativos

```tsx
// No seu loadItems callback:
const listRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "users",
  });

  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  const items = Array.isArray(list) ? list : [];

  // ✅ Filtrar apenas registros ativos (deleted_at IS NULL)
  return filterActive(items);
};
```

### 4. Restaurar Deletado (Undo)

```tsx
// Desfazer soft delete
await api.post(ENDPOINT, {
  action: "update",
  table: "users",
  payload: {
    id: userId,
    ...softRestorePayload(), // Adiciona deleted_at: null
  },
});
```

### 5. Ver Apenas Deletados

```tsx
// Listar para recuperação/administração
const listDeletedRows = async (): Promise<Row[]> => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "users",
    query: { deleted_at: { ne: null } }, // deleted_at NOT NULL
  });

  const data = response.data;
  const list = Array.isArray(data) ? data : (data?.data ?? []);
  return Array.isArray(list) ? list : [];
};
```

## 🔧 Integração com CrudScreen

Para atualizar o CrudScreen com suporte a soft delete:

```tsx
import { filterActive } from "@/core/utils/soft-delete";

const deleteRow = async (
  payload: Partial<Row> & { id?: string | null },
): Promise<unknown> => {
  if (!payload.id) throw new Error("Id obrigatório para deletar");

  // Soft delete ao invés de hard delete
  const response = await api.post(ENDPOINT, {
    action: "update",
    table: "your_table",
    payload: {
      id: payload.id,
      deleted_at: new Date().toISOString(),
    },
  });
  return response.data;
};

// No load, filtrar ativos
const load = useCallback(async () => {
  try {
    const list = await loadItems();
    // ✅ Remove deletados da listagem
    const active = filterActive(list);
    setItems(active);
  } catch {
    setError("Falha ao carregar dados");
  }
}, [loadItems]);
```

## 🛡️ Integridade Referencial

Para proteger registros relacionados:

```sql
-- Exemplo: Não permitir deletar usuário com tasks
SELECT * FROM tasks WHERE user_id = $1 AND deleted_at IS NULL;

-- Se houver resultados, mostrar aviso ao usuário
```

## 📊 Queries SQL Úteis

### Ver Estatísticas

```sql
SELECT
  tablename,
  (SELECT COUNT(*) FROM (SELECT * FROM t) WHERE deleted_at IS NULL) as ativo,
  (SELECT COUNT(*) FROM (SELECT * FROM t) WHERE deleted_at IS NOT NULL) as deletado,
  (SELECT COUNT(*) FROM (SELECT * FROM t)) as total
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'users';
```

### Limpar Deletados (Após Período)

```sql
-- Deletar registros marcados como deletados há mais de 30 dias
DELETE FROM users
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '30 days';
```

### Restaurar Todos

```sql
-- Desfazer soft delete em massa
UPDATE users SET deleted_at = NULL WHERE deleted_at IS NOT NULL;
```

## 🚀 Exemplo Completo: Usuários

```tsx
import { CrudScreen } from "@/components/ui/CrudScreen";
import { softDeletePayload } from "@/core/utils/soft-delete";
import { api } from "@/services/api";
import { filterActive } from "@/core/utils/soft-delete";

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

const listRows = async () => {
  const response = await api.post(ENDPOINT, {
    action: "list",
    table: "users",
  });
  const list = Array.isArray(response.data)
    ? response.data
    : (response.data?.data ?? []);
  return filterActive(list); // ✅ Nur show active
};

const deleteRow = async (payload) => {
  if (!payload.id) throw new Error("Id required");
  return await api.post(ENDPOINT, {
    action: "update",
    table: "users",
    payload: {
      id: payload.id,
      ...softDeletePayload(), // ✅ Soft delete
    },
  });
};

export default function UsersScreen() {
  return (
    <CrudScreen
      title="Usuários"
      fields={[
        { key: "id", label: "ID", visibleInForm: false },
        { key: "name", label: "Nome", required: true },
        { key: "email", label: "Email", required: true },
      ]}
      loadItems={listRows}
      createItem={createRow}
      updateItem={updateRow}
      deleteItem={deleteRow}
      getId={(item) => String(item.id ?? "")}
      getTitle={(item) => String(item.name ?? "Usuário")}
    />
  );
}
```

## ⚠️ Considerações

1. **Performance**: Use índices em `deleted_at` (já criados)
2. **Backup**: Soft deletes não substituem backups
3. **GDPR**: Para compliance, ainda serão necessários hard deletes após período
4. **Auditoria**: Combine com `updated_at` para rastrear quando foi deletado

## 📚 API Reference

| Função                    | Retorno                   | Uso                     |
| ------------------------- | ------------------------- | ----------------------- |
| `softDeletePayload()`     | `{ deleted_at: ISO8601 }` | Criar soft delete       |
| `softRestorePayload()`    | `{ deleted_at: null }`    | Restaurar               |
| `isDeleted(item)`         | `boolean`                 | Checar se deletado      |
| `isActive(item)`          | `boolean`                 | Checar se ativo         |
| `filterActive<T>(items)`  | `T[]`                     | Remover deletados       |
| `filterDeleted<T>(items)` | `T[]`                     | Manter apenas deletados |
| `getNowTimestamp()`       | `string`                  | ISO timestamp agora     |
