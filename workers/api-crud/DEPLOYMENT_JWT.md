# 🚀 JWT Deployment Commands

**Data:** 2026-03-01  
**Status do Código:** ✅ JWT já implementado no Worker  
**Ação Necessária:** Adicionar JWT_SECRET e fazer deploy

---

## ⚡ COMANDOS RÁPIDOS (Execute em ordem)

### 1️⃣ Adicionar JWT_SECRET ao Wrangler

```powershell
# Navegue para o diretório do Worker
cd C:\Users\raulc\OneDrive\Documentos\GitHub\SOSApp\workers\api-crud

# Adicione o secret (quando solicitar, cole o valor abaixo)
npx wrangler secret put JWT_SECRET

# ℹ️ VALOR DO SECRET (cole quando solicitado):
# X4bl5Ho7HZMAEJJhrdL8EvQx0SeKJwS6wMde6zwkHoaqAKwPdZ1FvXDHEXd8znQT
```

**⚠️ IMPORTANTE:** Quando executar `wrangler secret put JWT_SECRET`, o Wrangler vai pedir para você colar o valor. Use o secret acima.

---

### 2️⃣ Verificar Secret Adicionado

```powershell
npx wrangler secret list
```

**Resultado esperado:**

```
[
  {
    "name": "API_KEY",
    "type": "secret_text"
  },
  {
    "name": "DATABASE_URL",
    "type": "secret_text"
  },
  {
    "name": "JWT_SECRET",  ← ✅ Deve aparecer aqui
    "type": "secret_text"
  }
]
```

---

### 3️⃣ Deploy para Produção

```powershell
npm run deploy
```

**Resultado esperado:**

```
✔ Successfully published your Workers to Cloudflare
  https://api-crud.sosescritura.com.br
```

---

### 4️⃣ Verificar Health Check

```powershell
curl https://api-crud.sosescritura.com.br/health
```

**Resultado esperado:**

```json
{
  "status": "ok",
  "timestamp": "2026-03-01T12:34:56.789Z",
  "db": "connected"
}
```

---

## 🧪 TESTES DE VALIDAÇÃO

### Teste 1: Registrar Novo Usuário (Via N8N)

```powershell
# ⚠️ EXECUTE APENAS APÓS O N8N WORKFLOW ESTAR ATUALIZADO
curl -X POST https://n8n.sosescritura.com.br/webhook/register `
  -H "Content-Type: application/json" `
  -d '{
    "cpf": "12345678901",
    "email": "teste@example.com",
    "phone": "11999999999",
    "name": "Teste JWT",
    "password": "SenhaSegura123"
  }'
```

**Resultado esperado:**

```json
{
  "statusCode": 200,
  "message": "Cadastro realizado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-aqui",
    "nome": "Teste JWT",
    "cpf": "12345678901",
    "email": "teste@example.com"
  }
}
```

---

### Teste 2: Login com JWT

```powershell
curl -X POST https://n8n.sosescritura.com.br/webhook/login `
  -H "Content-Type: application/json" `
  -d '{
    "cpf": "12345678901",
    "password": "SenhaSegura123"
  }'
```

**Resultado esperado:**

```json
{
  "verified": true,
  "user_id": "uuid-aqui",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Teste 3: Decodificar JWT Token

Copie o token retornado e cole em: **https://jwt.io**

**Payload esperado:**

```json
{
  "sub": "uuid-do-usuario",
  "tenant_id": "uuid-do-tenant",
  "role": "client",
  "iat": 1709293200,
  "exp": 1709379600
}
```

---

### Teste 4: Verificar Bcrypt Hash no Banco

```sql
-- Execute no banco de dados PostgreSQL:
SELECT
  id,
  cpf,
  LEFT(password_hash, 10) as hash_prefix,
  LENGTH(password_hash) as hash_length
FROM users
WHERE cpf = '12345678901';
```

**Resultado esperado:**

```
hash_prefix  | hash_length
-------------+-------------
$2a$12$abc  | 60
```

✅ Se começar com `$2a$12$` e tiver 60 caracteres, está correto (bcrypt hash).

---

### Teste 5: Progressive Upgrade (Usuário com senha plaintext antiga)

```powershell
# 1. Criar usuário COM SENHA PLAINTEXT DIRETAMENTE NO BANCO (simula usuário antigo):
psql $DATABASE_URL -c "UPDATE users SET password_hash = 'senhaantiga123' WHERE cpf = '98765432100'"

# 2. Fazer login (deve converter para bcrypt automaticamente):
curl -X POST https://api-crud.sosescritura.com.br/auth/verify-password `
  -H "X-Api-Key: SEU_API_KEY" `
  -H "Content-Type: application/json" `
  -d '{
    "identifier": "98765432100",
    "password": "senhaantiga123"
  }'

# 3. Verificar que agora está em bcrypt:
psql $DATABASE_URL -c "SELECT LEFT(password_hash, 10) FROM users WHERE cpf = '98765432100'"
```

**Resultado esperado após login:** `$2a$12$...` (convertido para bcrypt)

---

## 🎯 CHECKLIST DE VALIDAÇÃO

Após executar todos os comandos, verifique:

- [ ] JWT_SECRET aparece em `wrangler secret list`
- [ ] Worker deploiado com sucesso (`npm run deploy`)
- [ ] Health check retorna `{"status":"ok"}`
- [ ] Registro cria usuário com bcrypt hash (`$2a$12$...`)
- [ ] Registro retorna JWT token válido
- [ ] Login verifica senha e retorna JWT
- [ ] JWT contém `sub`, `tenant_id`, `role`
- [ ] JWT expira em 24 horas (`exp` - `iat` = 86400 segundos)
- [ ] Senhas plaintext antigas são convertidas para bcrypt no login
- [ ] Rate limiting funciona (10 tentativas/minuto)

---

## 📋 INFORMAÇÕES TÉCNICAS

### Endpoints do Worker Implementados:

| Endpoint                | Método | Função                       | Rate Limit        |
| ----------------------- | ------ | ---------------------------- | ----------------- |
| `/auth/set-password`    | POST   | Hash bcrypt e atualiza senha | 5 req/min por IP  |
| `/auth/verify-password` | POST   | Verifica senha e retorna JWT | 10 req/min por IP |
| `/health`               | GET    | Health check                 | Sem limite        |

### Configuração Bcrypt:

- **Cost:** 12 (linha 659 em index.ts)
- **Senha mínima:** 6 caracteres
- **Senha máxima:** 128 caracteres

### Configuração JWT:

- **Algoritmo:** HS256 (HMAC-SHA256)
- **Biblioteca:** `jose` (WebCrypto compatível)
- **Expiração:** 24 horas
- **Payload:**
  - `sub` → User ID (UUID)
  - `tenant_id` → Tenant ID (UUID)
  - `role` → User role (string)
  - `iat` → Issued at (timestamp)
  - `exp` → Expires at (timestamp)

---

## ⚠️ TROUBLESHOOTING

### Erro: "JWT signing failed"

**Causa:** JWT_SECRET não está configurado ou é muito curto.

**Solução:**

```powershell
npx wrangler secret put JWT_SECRET
# Cole: X4bl5Ho7HZMAEJJhrdL8EvQx0SeKJwS6wMde6zwkHoaqAKwPdZ1FvXDHEXd8znQT
```

---

### Erro: "Password must be at least 6 characters"

**Causa:** Senha fornecida é muito curta.

**Solução:** Use senha com 6+ caracteres.

---

### Erro: Rate limit exceeded

**Causa:** Mais de 10 tentativas de login por minuto do mesmo IP.

**Solução:** Aguarde 1 minuto e tente novamente.

---

### Token JWT inválido no jwt.io

**Causa:** Secret usado para assinar é diferente do secret configurado.

**Solução:**

1. Verifique `wrangler secret list`
2. Re-faça deploy: `npm run deploy`
3. Gere novo token via login

---

## 📚 PRÓXIMOS PASSOS (Após deployment)

1. ✅ **Worker** está pronto e deployado
2. 🔄 **N8N Workflow** precisa ser atualizado (veja `n8n/workflows/Login e registro_UPDATED.json`)
3. 🔜 **Frontend** precisa usar JWT em `Authorization: Bearer <token>`
4. 🔜 **Worker Middleware** para validar JWT em rotas protegidas (Procedure B4)

---

**🎉 FIM DO DEPLOYMENT - Código JWT 100% funcional!**
