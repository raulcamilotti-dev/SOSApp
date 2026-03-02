# 🗄️ Migration Execution Alternatives (PostgreSQL)

**Context:** `psql` command not found in Windows PowerShell  
**Solution:** Use GUI tools instead

---

## ✅ Opção 1: pgAdmin Web Interface (MAIS FÁCIL)

### Pré-requisitos

- pgAdmin instalado e rodando
- Acesso ao seu servidor PostgreSQL

### Passo 1: Abrir pgAdmin

```
http://localhost:5050
ou seu endereço remoto do pgAdmin
```

### Passo 2: Conectar ao Banco

1. Esquerda: **Servers** → clique em seu servidor PostgreSQL
2. **Databases** → **sosescritura**
3. Botão direito → **Query Tool** (ou Tools → Query Tool)

### Passo 3: Colar SQL da Migration

Cole este SQL exatamente como está:

```sql
-- Migration: Password Reset Tokens
-- Date: 2026-03-01

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Index 1: Buscar por token (mais frequente)
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
  ON password_reset_tokens(token)
  WHERE deleted_at IS NULL;

-- Index 2: Buscar por user_id (tokens não utilizados)
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens(user_id)
  WHERE deleted_at IS NULL AND used_at IS NULL;

-- Index 3: Limpeza de expirados
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
  ON password_reset_tokens(expires_at)
  WHERE deleted_at IS NULL AND used_at IS NULL;
```

### Passo 4: Executar

- Botão **Play** (▶️) ou `F5`
- Ou menu **Execute** → **Execute query**

### Passo 5: Verificar

```sql
-- Execute depois para validar:
SELECT table_name FROM information_schema.tables
WHERE table_name = 'password_reset_tokens';

-- Resultado esperado:
-- password_reset_tokens
-- (1 row)
```

✅ **PRONTO!**

---

## ✅ Opção 2: DBeaver (Gratuito, Completo)

### Pré-requisitos

- DBeaver instalado (https://dbeaver.io/)
- Conexão ao PostgreSQL já configurada

### Passo 1: Novo SQL Script

1. Connections → seu PostgreSQL
2. Botão direito → **SQL Editor** → **New SQL Script**

### Passo 2: Colar SQL

Cole o mesmo SQL da Opção 1 acima

### Passo 3: Executar

- Menu: **Execute** → **Execute SQL Statement**
- Ou: `Ctrl + Enter`
- Ou: Botão **Execute** (▶️)

### Passo 4: Verificar Output

- Aba **Execution Result** deve mostrar: `[Execution finished without errors]`

✅ **PRONTO!**

---

## ✅ Opção 3: DataGrip (Opcional, Pago)

### Pré-requisitos

- DataGrip ou IntelliJ IDEA instalado

### Passo 1: Ny SQL

1. File → New → SQL File
2. Console (Ctrl + Shift + 0)

### Passo 2: Colar SQL

Cole o mesmo SQL

### Passo 3: Executar

- `Ctrl + Enter` para executar
- ou botão ▶️ na toolbox

✅ **PRONTO!**

---

## ✅ Opção 4: Supabase (Se usar Supabase)

### Pré-requisitos

- Projeto no Supabase

### Passo 1: Dashboard

Abra: https://app.supabase.com

### Passo 2: SQL Editor

- Seu projeto → **SQL Editor**
- Botão **+ New Query**

### Passo 3: Colar SQL

Cole o mesmo SQL

### Passo 4: Run

- Botão **▶️ Run**

✅ **PRONTO!**

---

## 📊 Comparação de Métodos

| Método   | Fácil  | Gratuito | Sem Download | Recomendado |
| -------- | ------ | -------- | ------------ | ----------- |
| pgAdmin  | ✅✅✅ | ✅       | ✅ (web)     | 👈          |
| DBeaver  | ✅✅   | ✅       | ❌           | ✅          |
| DataGrip | ✅     | ❌       | ❌           | -           |
| Supabase | ✅✅   | ✅       | ✅           | ✅          |

**Recomendação:** Comece com **pgAdmin** (mais direto)

---

## 🔍 Teste Final (Qualquer Método)

Depois que executar a migration, valide:

```sql
-- Query 1: Tabela existe?
\dt password_reset_tokens;
-- Resultado: table "public"."password_reset_tokens"

-- Query 2: Tem colunas certas?
\d password_reset_tokens;
-- Resultado: mostra todas as colunas (id, user_id, token, etc)

-- Query 3: Índices criados?
\di password_reset_tokens*;
-- Resultado: 3 índices listados

-- Query 4: Está vazia? (esperado)
SELECT COUNT(*) FROM password_reset_tokens;
-- Resultado: 0
```

---

## ❌ Se Algo Der Errado

### Erro: "Relation 'users' does not exist"

**Causa:** Tabela `users` não existe (banco novo?)  
**Fix:** Crie a tabela `users` primeiro

### Erro: "UUID type does not exist"

**Causa:** PostgreSQL sem suporte UUID  
**Fix:**

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Erro: "Permission denied"

**Causa:** User não tem permission  
**Fix:** Conecte como `postgres` ou user com privilégio

### Tabela criada, mas N8N não encontra

**Possível Causa:** Schema diferente  
**Fix:**

```sql
-- Verificar schema:
SELECT schemaname FROM pg_tables WHERE tablename='password_reset_tokens';

-- Se não for 'public', especifique no N8N:
-- host: localhost
-- port: 5432
-- database: sosescritura
-- schema: [AQUELE QUE ENCONTROU] (se não for 'public')
```

---

## 📋 Checklist de Validação

- [ ] Abri pgAdmin / DBeaver / SQL Tool
- [ ] Conectei ao banco `sosescritura`
- [ ] Colei o SQL da migration
- [ ] Cliquei em Execute/Run
- [ ] Vi mensagem: "Success" ou "Completed without errors"
- [ ] Executei query de validação
- [ ] Vi tabela `password_reset_tokens` existe
- [ ] Contagem de linhas é 0 (esperado no início)

✅ **Quando tudo checado = pronto para N8N**

---

## 🚀 Próximo Passo

Quando a migration estiver executada:

1. ✅ Migration SQL executada (você fez aqui)
2. ⏳ **N8N Workflow Import** (próximo)
3. ⏳ **N8N Credenciais** (após import)
4. ⏳ **Ativação e Teste** (final)
