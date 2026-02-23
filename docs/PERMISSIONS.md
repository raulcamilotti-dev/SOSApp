# Sistema de Permissões - SOSApp

Sistema completo de controle de acesso baseado em **RBAC (Role-Based Access Control)** com suporte multi-tenant.

## 📚 Arquitetura

```
User → User_Tenant (vincula user ao tenant + role)
              ↓
           Role → Role_Permissions (associa role às permissões)
              ↓
         Permission (define o que pode ser feito)
```

## 🗂 Arquivos Principais

### Core

- `core/auth/permissions.ts` - **Definição centralizada de todas as permissões**
- `core/auth/usePermissions.ts` - Hook para verificar permissões do usuário
- `core/auth/ProtectedRoute.tsx` - Componente para proteger rotas/componentes
- `core/auth/permissions.sync.ts` - Sincronização de permissões com o banco
- `core/auth/useAutoSyncPermissions.ts` - Auto-sync ao iniciar o app

### Telas Admin

- `app/(app)/Administrador/permissions.tsx` - CRUD de permissões
- `app/(app)/Administrador/roles.tsx` - CRUD de roles (com auto-assign)
- `app/(app)/Administrador/tenants.tsx` - CRUD de tenants
- `app/(app)/Administrador/user_tenants.tsx` - Vincular usuários a tenants
- `app/(app)/Administrador/role_permissions_matrix.tsx` - Matriz visual
- `app/(app)/Administrador/permissions_sync.tsx` - Sincronizar permissões

## 🚀 Como Usar

### 1. Adicionar Nova Permissão

Edite `core/auth/permissions.ts`:

```typescript
export const PERMISSIONS = {
  // ... existentes
  INVOICE_READ: "invoice.read",
  INVOICE_WRITE: "invoice.write",
} as const;

export const PERMISSION_METADATA = {
  // ... existentes
  [PERMISSIONS.INVOICE_READ]: {
    description: "Visualizar faturas",
    category: "Faturas",
  },
  [PERMISSIONS.INVOICE_WRITE]: {
    description: "Criar/editar faturas",
    category: "Faturas",
  },
};
```

Execute **Sincronizar Permissões** no menu Administrador para criar no banco.

### 2. Proteger uma Tela Inteira

```tsx
import { ProtectedRoute } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";

export default function InvoiceScreen() {
  return (
    <ProtectedRoute requiredPermission={PERMISSIONS.INVOICE_READ}>
      <YourScreenContent />
    </ProtectedRoute>
  );
}
```

### 3. Mostrar/Esconder Elementos

```tsx
import { useHasPermission } from "@/core/auth/ProtectedRoute";
import { PERMISSIONS } from "@/core/auth/permissions";

function MyComponent() {
  const canEdit = useHasPermission(PERMISSIONS.INVOICE_WRITE);

  return (
    <View>
      <Text>Fatura #123</Text>
      {canEdit && <Button title="Editar" />}
    </View>
  );
}
```

### 4. Lógica Avançada

```tsx
import { usePermissions } from "@/core/auth/usePermissions";

function ComplexComponent() {
  const { permissions, isAdmin, hasAnyPermission } = usePermissions();

  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (hasAnyPermission([PERMISSIONS.INVOICE_READ, PERMISSIONS.PROJECT_READ])) {
    return <UserDashboard />;
  }

  return <RestrictedView />;
}
```

## 🔐 Permissões Disponíveis

### Admin

- `admin.full` - Acesso total (bypassa todas as verificações)

### Clientes

- `customer.read` - Visualizar clientes
- `customer.write` - Criar/editar clientes
- `customer.delete` - Excluir clientes

### Documentos

- `document.read` - Visualizar documentos
- `document.write` - Criar/editar documentos
- `document.delete` - Excluir documentos

### Projetos

- `project.read` - Visualizar projetos
- `project.write` - Criar/editar projetos
- `project.delete` - Excluir projetos

### Tarefas

- `task.read` - Visualizar tarefas
- `task.write` - Criar/editar tarefas
- `task.delete` - Excluir tarefas

### Usuários

- `user.read` - Visualizar usuários
- `user.write` - Criar/editar usuários
- `user.delete` - Excluir usuários

### Controle de Acesso

- `role.manage` - Gerenciar roles
- `permission.manage` - Gerenciar permissões
- `tenant.manage` - Gerenciar tenants

### Automações e Workflows

- `automation.run` - Executar automações
- `automation.manage` - Gerenciar automações
- `agent.manage` - Gerenciar agents
- `workflow.read` - Visualizar workflows
- `workflow.write` - Criar/editar workflows

## 🎯 Roles Padrão

Ao criar um role com estes nomes, as permissões são **atribuídas automaticamente**:

### `admin`

- Todas as permissões (incluindo `admin.full`)

### `manager` / `gestor`

- Ler/escrever: customers, documents, projects, tasks
- Executar automações
- Ler workflows e usuários

### `client` / `cliente`

- Apenas leitura: customers, documents, projects, tasks

## 📋 Workflow Típico

### Criar novo tenant com usuário admin:

1. **Criar Tenant** (menu Administrador → Tenants)
   - Nome da empresa, plano, etc.

2. **Criar Role** (menu Administrador → Roles)
   - Nome: "admin"
   - Tenant: selecione o criado acima
   - ✅ Permissões atribuídas automaticamente!

3. **Vincular Usuário** (menu Administrador → User Tenants)
   - User: selecione o usuário
   - Tenant: selecione o tenant
   - Role: selecione "admin"

4. ✅ Pronto! O usuário agora é admin desse tenant.

## 🔄 Sincronização Automática

O sistema **sincroniza permissões automaticamente** ao iniciar o app:

- Verifica permissões definidas em `permissions.ts`
- Cria no banco as que estão faltando
- Logs no console mostram o resultado

Você também pode sincronizar manualmente:

- Menu **Administrador → Sincronizar Permissões**

## 🛡 Proteção em Camadas

1. **Tela inteira**: Use `<ProtectedRoute>`
2. **Botões/Elementos**: Use `useHasPermission()`
3. **API/Backend**: Valide permissões no servidor também (não confie apenas no frontend!)

## 🧪 Testando Permissões

1. Crie um usuário de teste
2. Atribua diferentes roles
3. Navegue pelo app e veja as telas/botões mudando
4. Veja seus logs:
   ```
   [AutoSync] ✅ 5 permissões criadas automaticamente
   [Roles] Auto-atribuídas permissões padrão ao role: admin
   ```

## 📝 Boas Práticas

### ✅ Faça

- Sempre use constantes de `PERMISSIONS` (autocomplete + type-safe)
- Sincronize permissões após adicionar novas no código
- Proteja operações críticas (delete, write) com permissões específicas
- Use `isAdmin` para shortcuts quando apropriado
- Documente novas permissões em `PERMISSION_METADATA`

### ❌ Evite

- Hardcoded permission strings (`"user.write"` direto)
- Confiar apenas no frontend (valide no backend!)
- Criar muitas permissões granulares demais (comece simples)
- Esquecer de sincronizar após adicionar permissões

## 🐛 Troubleshooting

### "Acesso negado" para admin

- Verifique se o user_tenant está com `is_active: true`
- Confirme que o role tem a permissão `admin.full`

### Permissões não aparecem

- Execute "Sincronizar Permissões"
- Verifique console logs
- Confirme que adicionou em `PERMISSIONS` e `PERMISSION_METADATA`

### Role criado sem permissões

- Nome do role não é "admin", "manager" ou "client"?
- Atribua manualmente na matriz de permissões
- Ou edite `DEFAULT_ROLE_PERMISSIONS` em `permissions.ts`

## 🎓 Exemplos Completos

Veja `core/auth/PermissionExamples.tsx` para 7 exemplos práticos de uso!
