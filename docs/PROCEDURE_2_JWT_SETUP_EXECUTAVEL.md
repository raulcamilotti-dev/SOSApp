# 🚀 PROCEDURE 2: JWT Setup — GUIA PASSO-A-PASSO EXECUTÁVEL

**Status:** 🔴 CRÍTICO - Começar HOJE  
**Duração Estimada:** 2-3 horas  
**Resultado:** Worker gerará JWT tokens, frontend pode integrar  
**Próximo:** Frontend integration (Semana 2)

---

## ⚡ QUICKSTART (5 MINUTOS)

Quer ver se já está funcionando? Execute:

```bash
# Terminal 1: Abrir workers/api-crud
cd c:\Users\raulc\OneDrive\Documentos\GitHub\SOSApp\workers\api-crud

# Listar secrets (ver se JWT_SECRET existe)
npx wrangler secret list

# Testar JWT existente
npm test && npm run test:jwt

# Result esperado:
# ✓ JWT creation works
# ✓ JWT verification works
```

Se os testes **FALHAREM** → continue lendo.  
Se os testes **PASSAREM** → pule para Seção "Validação Final".

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### PASSO 1: Criar JWT_SECRET (5 min)

**Onde:** Terminal do seu computador

```bash
# Gerar um novo secret seguro (recomendado):
openssl rand -base64 48

# Output será algo assim:
# kQ9wJr3m0aB8Y2tX1s6LZp4uD7HcN5VfGvR2eUoWjCqTnSxM9yK8A1bP6dFh3LQe
```

**⚠️ IMPORTANTE:** Copie esse valor em local seguro (não perca!)

---

### PASSO 2: Adicionar Secret ao Wrangler (3 min)

**Onde:** Terminal

```bash
cd c:\Users\raulc\OneDrive\Documentos\GitHub\SOSApp\workers\api-crud

# Adicionar o secret
npx wrangler secret put JWT_SECRET

# Quando pedir "value", cola o output do openssl acima:
# ? Enter a secret value: [COLA AQUI:] kQ9wJr3m0aB8Y2tX1s6LZp4uD7HcN5VfGvR2eUoWjCqTnSxM9yK8A1bP6dFh3LQe

# Pressiona Enter e pronto!
```

**Verificar que foi salvo:**

```bash
npx wrangler secret list

# Output deve mostrar:
# Found 1 of 1 secrets:
# - JWT_SECRET
```

✅ **PASSO 1-2 COMPLETO**: Secret criado e salvo.

---

### PASSO 3: Verificar JWT Module (5 min)

**Arquivo:** [workers/api-crud/src/jwt.ts](../workers/api-crud/src/jwt.ts)

**Verificar se EXISTE e tem essas 2 funções:**

```bash
# Ver o arquivo:
cat workers/api-crud/src/jwt.ts | head -50
```

**Deve conter:**

```typescript
// Função 1: Gerar JWT
export async function signToken(
  payload: JwtPayload,
  secret: string,
): Promise<string> {
  // ...
}

// Função 2: Verificar JWT
export async function verifyToken(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  // ...
}
```

**Se NÃO existir:** Avisar, vou criar.  
**Se EXISTIR:** ✅ Continuar.

---

### PASSO 4: Verificar types.ts (3 min)

**Arquivo:** [workers/api-crud/src/types.ts](../workers/api-crud/src/types.ts)

**Procurar por:**

```typescript
interface Env {
  // ... outras vars
}
```

**Verificar se tem JWT_SECRET:**

```bash
# Buscar:
grep -n "JWT_SECRET" workers/api-crud/src/types.ts
```

**Se ENCONTRAR:** ✅ Ok.  
**Se NÃO ENCONTRAR:**

Abrir types.ts e adicionar:

```typescript
interface Env {
  // ... vars existentes
  JWT_SECRET: string; // ← ADI CIONAR ESSA LINHA
}
```

---

### PASSO 5: Modificar /auth/verify-password (10 min)

**Arquivo:** [workers/api-crud/src/index.ts](../workers/api-crud/src/index.ts)

**Procurar por function `handleVerifyPassword`:**

```bash
# Achar a função:
grep -n "handleVerifyPassword" workers/api-crud/src/index.ts

# Output tipo:
# 716:async function handleVerifyPassword(body: Record<string, unknown>, env: Env): Promise<Response> {
```

**Abrir o arquivo na linha ~750 (dentro da função):**

**PROCURAR POR:**

```typescript
return corsResponse(200, {
  verified: true,
  user_id: user.id,
});
```

**SUBSTITUIR POR:**

```typescript
// Generate JWT token
let token: string | null = null;
try {
  token = await signToken(
    {
      sub: user.id,
      tenant_id: user.tenant_id || "",
      role: user.role || "client",
    },
    env.JWT_SECRET,
  );
} catch (err) {
  console.error("[handleVerifyPassword] JWT error:", err);
  // Continue mesmo se JWT falhar (backward compat)
}

return corsResponse(200, {
  verified: true,
  user_id: user.id,
  token: token || undefined, // JWT token para client
});
```

**Salvar o arquivo.**

---

### PASSO 6: Verificar Imports (5 min)

**Arquivo:** [workers/api-crud/src/index.ts](../workers/api-crud/src/index.ts)

**No TOPO do arquivo (linha 1-30), procurar por:**

```typescript
import { signToken, verifyToken, type JwtPayload } from "./jwt";
```

**Se NÃO estiver:**

Adicionar na seção de imports (entre as linhas 1-30):

```typescript
import { signToken, verifyToken, type JwtPayload } from "./jwt";
```

**Salvar.**

---

### PASSO 7: Deploy Worker (5 min)

**Terminal:**

```bash
cd c:\Users\raulc\OneDrive\Documentos\GitHub\SOSApp\workers\api-crud

# Fazer deploy:
npm run deploy

# Ou alternativa:
# npx wrangler deploy
```

**Output esperado:**

```
Deployed to: https://sos-api-crud.raulcamilotti-c44.workers.dev
```

✅ **DEPLOYMENT COMPLETO**

---

### PASSO 8: Testar com Curl (10 min)

**Teste 1: Health Check**

```bash
curl https://sos-api-crud.raulcamilotti-c44.workers.dev/health
```

**Output esperado:**

```json
{ "status": "operational" }
```

**Teste 2: Verify Password com Credentials OK**

```bash
# Substituir VALORES reais:
# - CPF: um cpf que existe na DB
# - EMAIL: email correspondente
# - PASSWORD: senha correta dele

curl -X POST https://sos-api-crud.raulcamilotti-c44.workers.dev/auth/verify-password \
  -H "X-Api-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "12345678910",
    "password": "senha_correta"
  }'
```

**Output ESPERADO:**

```json
{
  "verified": true,
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "token": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ0ZW5hbnRfaWQiOiI4NWY0MzEzNC01ZDc0LTQ0OTQtYjM3OC1hYTdkMzJmZTk5NzAiLCJyb2xlIjoiY2xpZW50In0.signature..."
}
```

**Teste 3: Verify Password com Credentials INVÁLIDO**

```bash
curl -X POST https://sos-api-crud.raulcamilotti-c44.workers.dev/auth/verify-password \
  -H "X-Api-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "12345678910",
    "password": "senha_errada"
  }'
```

**Output ESPERADO:**

```json
{
  "verified": false,
  "user_id": null
}
```

✅ **TESTES PASSARAM?** Próximo passo.

---

### PASSO 9: Validação JWT (10 min)

**Decodificar o JWT recebido no Teste 2:**

Use https://jwt.io (decode)

**Cola o token no campo "Encoded":**

```
eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJ0ZW5hbnRfaWQiOiI4NWY0MzEzNC01ZDc0LTQ0OTQtYjM3OC1hYTdkMzJmZTk5NzAiLCJyb2xlIjoiY2xpZW50In0.signature...
```

**Verificar payload:**

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000", // user_id
  "tenant_id": "85f43134-5d74-4494-b378-aa7d32fe9970", // tenant
  "role": "client"
}
```

✅ **JWT VÁLIDO**: Sub, tenant_id e role presentes.

---

### PASSO 10: Teste Antigo (Backward Compat)

**Se tiver senhas PLAINTEXT antigas no DB:**

```bash
# Test1: Senha plaintext deve ser aceita
curl -X POST https://sos-api-crud.raulcamilotti-c44.workers.dev/auth/verify-password \
  -H "X-Api-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user_antigo",
    "password": "senha_que_ta_plaintext"
  }'
```

**Output:**

```json
{
  "verified": true,
  "user_id": "uuid",
  "token": "jwt_token"
}
```

**Depois:**

```sql
-- Verificar DB: password_hash foi atualizado para bcrypt?
SELECT password_hash FROM users
WHERE id = 'uuid_do_user_antigo'
LIMIT 1;

-- Deve começar com "$2b$" (bcrypt signature)
-- "$2b$12$..."
```

✅ **PROGRESSIVE UPGRADE FUNCIONANDO**

---

## 📝 Resumo Técnico (Para Dev)

### O que foi Implementado:

1. **JWT_SECRET** criado e armazenado em Wrangler secrets
2. **jwt.ts** módulo com signToken() e verifyToken()
3. **index.ts** modificado:
   - `handleVerifyPassword()` agora chama `signToken()` após validar password
   - Retorna `token` no response
4. **types.ts** atualizado com JWT_SECRET na interface Env
5. **Backward compat:**
   - Senhas plaintext ainda funcionam
   - Auto-upgrade para bcrypt no 1º login
6. **Rate limiting:** Já estava implementado (10/min verify, 5/min set)

### Fluxo Atual:

```
POST /auth/verify-password
  ↓
1. Busca user por identifier (cpf ou email)
2. Se plaintext: compara e depois chama set-password para upgrade
3. Se bcrypt: bcrypt.compare()
4. Se válido: signToken() → gera JWT
5. Return {verified, user_id, token}
```

### Próxima Semana:

Frontend (AuthContext.tsx) vai:

1. Chamar `/auth/verify-password` (em vez de N8N)
2. Salvar JWT no SecureStore
3. Usar JWT em Authorization header

---

## ✅ CHECKLIST FINAL

- [ ] Openssl gerar secret
- [ ] `npx wrangler secret put JWT_SECRET`
- [ ] Verificar types.ts tem JWT_SECRET
- [ ] Modificar index.ts handleVerifyPassword() para retornar token
- [ ] Adicionar import signToken em index.ts
- [ ] `npm run deploy`
- [ ] Teste Health check (curl /health)
- [ ] Teste verify-password com password OK
- [ ] Teste verify-password com password ERRADO
- [ ] Decodificar JWT em jwt.io (checar sub, tenant_id, role)
- [ ] Teste backward compat (plaintext password)
- [ ] Verificar DB password_hash foi atualizado para bcrypt

---

## 🆘 Se Algo der Errado

### Erro: "JWT_SECRET not found"

```bash
# Solução: Recriar secret
npx wrangler secret put JWT_SECRET
# (cola o valor do openssl novamente)
```

### Erro: "signToken is not defined"

```bash
# Verificar import em index.ts:
grep "import.*signToken" workers/api-crud/src/index.ts

# Se não tiver, adicionar:
# import { signToken, verifyToken } from "./jwt";
```

### Erro: "Deploy failed"

```bash
# Limpar cache e redeploy:
cd workers/api-crud
rm -rf dist/ node_modules/
npm install
npm run deploy
```

### Teste Curl retorna erro 401

```bash
# Verificar:
1. X-Api-Key está correto?
2. User existe no DB?
3. Password está correta?

# Debug:
curl -v https://sos-api-crud... (flag -v mostra detalhes)
```

---

## 🎓 Próximos Passos (Semana 2)

**Quando Procedure 2 estar 100% completo:**

→ Semana 2: Frontend Integration (AuthContext.tsx)

```typescript
// ANTES:
const res = await fetch("https://n8n.sosescritura.com.br/webhook/login", ...)

// DEPOIS:
const res = await fetch(
  "https://api-crud.sosescritura.com.br/auth/verify-password",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": env.EXPO_PUBLIC_API_KEY,
    },
    body: JSON.stringify({
      identifier: cpf,
      password,
    }),
  },
);

const data = await res.json();
if (data.token) {
  await saveToken(data.token);  // SecureStore
  setAuthToken(data.token);      // axios header
}
```

---

## 📞 Suporte

Se tiver dúvidas durante a implementação:

1. **Verificar logs:** `npx wrangler tail`
2. **Verificar syntax:** `npm run lint`
3. **Rodar testes:** `npm test`
4. **Checar DB:** Query em `password_hash` para ver se tem bcrypt

---

**🚀 VOCÊ ESTÁ PRONTO PARA COMEÇAR!**

Próximo comando: Responde se conseguiu fazer TODOS os passos até o Step 9 (Validação JWT).
