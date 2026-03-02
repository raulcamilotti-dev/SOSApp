# 🔐 Password Reset - Credenciais Necessárias (N8N + Worker)

## 📌 Resumo Executivo

Após a migration ser executada, o N8N precisa de **2 credenciais** para funcionar:

| #     | Nome           | Tipo              | Por Quê                   | Status             |
| ----- | -------------- | ----------------- | ------------------------- | ------------------ |
| **1** | **API_KEY**    | String (64 chars) | Authenticate N8N → Worker | ⏳ Precisa valor   |
| **2** | **PostgreSQL** | Connection        | User lookup no banco      | ⏳ Precisa valores |

---

## 1️⃣ Credencial #1: API_KEY

### O que é?

Token de autenticação usado no header `X-Api-Key` quando N8N chama o Worker.

### Como obter?

**Opção A: Se já tem valor, use este:**

```
API_KEY = [VC DEVE SABER QUAL É O SEU]
```

**Opção B: Se não tem, gere um novo:**

```bash
# Terminal (PowerShell):
$random = [System.Random]::new()
$bytes = [byte[]]::new(32)
$random.NextBytes($bytes)
[System.Convert]::ToBase64String($bytes)

# Resultado será algo como:
# M7k9X2Q1wP8vL4nJ6bF3tR5uZ0yH9sC2dE4gA7mK1qW5xL
```

**Opção C: Se usar Cloudflare Workers, já configurou antes:**

```bash
# Ver valor já salvo:
npx wrangler secret list

# Output deve mostrar:
# - API_KEY    ← Existe aqui
# - DATABASE_URL
# - JWT_SECRET
```

### Como usar no N8N?

Quando N8N pedir por "API Key Credential":

1. Nome: `API Key` (ou similar)
2. Valor: Cole a string de 64 caracteres

---

## 2️⃣ Credencial #2: PostgreSQL Database

### O que é?

Conexão ao banco de dados PostgreSQL para:

- Buscar usuários por CPF ou email
- Criar password_reset_tokens
- Validar resets

### Como obter os detalhes?

**Preencha com seus dados do banco:**

```
HOST:     localhost          [OU: seu-host-db.com]
PORT:     5432              [OU: porta customizada]
DATABASE: sosescritura       [OU: seu banco]
USER:     postgres           [OU: seu user]
PASSWORD: [VC PRECISA SABER] [Senha do usuário acima]
```

**Para encontrar:**

#### Se usa Docker/Local:

```bash
# Ver se PostgreSQL está rodando:
docker ps | grep postgres

# Ver credenciais em arquivo docker-compose (se existir):
cat docker-compose.yml | grep -A 5 "postgres"
```

#### Se usa Easypanel/Hosted:

1. Abra painel Easypanel
2. Vá em: Databases → PostgreSQL
3. Copie as credenciais de conexão (Host, Port, User, Password)

#### Se usa Supabase:

1. Dashboard → Project Settings → Database
2. Copie Connection String ou os detalhes individuais

### Como usar no N8N?

Quando N8N pedir por "PostgreSQL Credential":

1. **Host**: `localhost` ou seu hostname
2. **Port**: `5432` (padrão)
3. **Database**: `sosescritura`
4. **User**: `postgres` ou seu user
5. **Password**: Sua senha do banco
6. **SSL**: False (a menos que use SSL)

**Teste a connexão** antes de salvar (botão "Test connection")

---

## 🔍 Verificação Rápida

### Teste 1: API_KEY existe?

```bash
curl -H "X-Api-Key: [SEU_API_KEY]" \
  https://sos-api-crud.raulcamilotti-c44.workers.dev/health

# Output esperado:
# {"status":"ok","db":"connected"}
```

### Teste 2: PostgreSQL conecta?

```bash
# Via psql (se instalado):
psql -h localhost -U postgres -d sosescritura -c "SELECT COUNT(*) FROM users;"

# Via pgAdmin:
1. Abra pgAdmin
2. Servers → PostgreSQL
3. Conecte e vá em sosescritura
```

### Teste 3: Migration executada?

```sql
-- Execute no banco:
SELECT table_name FROM information_schema.tables
WHERE table_name = 'password_reset_tokens';

-- Resultado esperado:
-- password_reset_tokens
```

---

## 📋 Próximos Passos

### Passo 1: Forneça Os Valores (👈 VOCÊ É AQUI)

1. **API_KEY**: Copie do wrangler secret ou gere um novo
2. **PostgreSQL**: Dados do seu banco (host, port, user, password, database)

### Passo 2: Migration (SE AINDA NÃO FEZ)

1. Abra pgAdmin, DBeaver ou psql
2. Cole e execute o SQL da migration
3. Verifique tabela `password_reset_tokens` foi criada

### Passo 3: N8N Import

1. Abra N8N UI
2. Workflows → Import
3. Cole conteúdo do `n8n/workflows/Forgot-Password.json`

### Passo 4: Configure Credenciais

1. N8N vai pedir por 2 credenciais
2. Entrada a informação acima
3. Teste a conexão (ambas)

### Passo 5: Ative e Teste

1. Save workflow
2. Test end-to-end
3. Done! ✅

---

## ❓ Dúvidas?

**P: Onde guardo essas credenciais?**  
R: Em local seguro (LastPass, 1Password, etc). NÃO commitar no Git.

**P: Posso reutilizar credenciais existentes?**  
R: Sim! Se já tem N8N com PostgreSQL configurado, reutilize.

**P: E se esquecer a senha do banco?**  
R: Reset via seu painel (Easypanel, Supabase, etc).

**P: API_KEY pode ser qualquer string?**  
R: Recomendado 64+ caracteres. Use `openssl rand -base64 48` ou equivalente.

---

## 🚀 Quando Tudo Tiver Pronto

Você terá um sistema completo de password reset:

1. ✅ Worker pronto (endpoints deployados)
2. ✅ Database pronto (tabela migration executada)
3. ✅ N8N pronto (workflow importado + credenciais configuradas)
4. ✅ Usuários podem recuperar senha via email

**Timeline:** ~15 minutos (se já tem os valores)
