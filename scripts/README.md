# Scripts SQL - Adicionar Usuário Admin

Existem **3 scripts** para adicionar usuário admin (CPF: 07745448999) com permissão full:

## 🚀 Opção 1: Script Automático (RECOMENDADO)

**Arquivo**: `add-admin-user.sql`

Faz tudo automaticamente:

- ✅ Cria permissão `admin.full`
- ✅ Cria ou usa tenant existente
- ✅ Cria role `admin`
- ✅ Vincula role à permissão
- ✅ Vincula usuário ao tenant

```bash
# No terminal (PostgreSQL)
psql -U seu_usuario -d seu_banco -f scripts/add-admin-user.sql

# Ou copie e cole direto no pgAdmin
```

**⚠️ Importante**: Se o usuário não existir, o script vai avisar e você precisa criar antes:

```sql
INSERT INTO users (cpf, email, fullname, created_at)
VALUES ('07745448999', 'seu@email.com', 'Seu Nome', NOW());
```

---

## 📝 Opção 2: Script Manual Passo-a-Passo

**Arquivo**: `add-admin-user-simple.sql`

Para fazer manualmente. Você precisa:

1. Substituir `SEU_TENANT_ID` pelo ID do tenant
2. Substituir `SEU_ROLE_ID` pelo ID do role
3. Executar passo a passo

Use se o script automático der erro ou se preferir controle total.

---

## ⚡ Opção 3: One-Liner (Mais Rápido)

**Arquivo**: `add-admin-user-oneliner.sql`

Single query que faz tudo de uma vez usando CTE.

**Pré-requisitos**:

- ✅ Usuário com CPF 07745448999 já existe na tabela `users`
- ✅ Existe pelo menos 1 tenant na tabela `tenants`

Cole direto no pgAdmin e execute!

---

## ✅ Verificar se Funcionou

Depois de executar qualquer um dos scripts, rode:

```sql
SELECT
    u.cpf,
    u.fullname,
    u.email,
    t.company_name as tenant,
    r.name as role,
    p.code as permission
FROM users u
JOIN user_tenants ut ON u.id = ut.user_id
JOIN tenants t ON ut.tenant_id = t.id
JOIN roles r ON ut.role_id = r.id
JOIN role_permissions rp ON r.id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
WHERE u.cpf = '07745448999';
```

**Resultado esperado**:

```
cpf           | fullname  | tenant        | role  | permission
07745448999   | Seu Nome  | SOS Escritura | admin | admin.full
```

---

## 🔧 Troubleshooting

### Erro: "usuário não encontrado"

Crie o usuário primeiro:

```sql
INSERT INTO users (cpf, email, fullname, created_at)
VALUES ('07745448999', 'raul@email.com', 'Raul', NOW());
```

### Erro: "tenant não encontrado"

Crie um tenant:

```sql
INSERT INTO tenants (company_name, plan, status, created_at)
VALUES ('Minha Empresa', 'enterprise', 'active', NOW());
```

### Erro: "duplicate key" ou "conflict"

Já existe! Apenas rode a query de verificação para confirmar.

---

## 🎯 Execução Rápida (Recomendado)

1. Certifique-se que o usuário existe:

```sql
SELECT * FROM users WHERE cpf = '07745448999';
```

2. Execute o script one-liner:

```bash
# Copie todo o conteúdo de add-admin-user-oneliner.sql
# Cole no pgAdmin ou terminal psql
# Execute
```

3. Verifique:

```sql
SELECT * FROM users u
JOIN user_tenants ut ON u.id = ut.user_id
JOIN roles r ON ut.role_id = r.id
WHERE u.cpf = '07745448999';
```

4. Faça login no app e teste! 🎉
