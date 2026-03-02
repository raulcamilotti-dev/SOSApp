# 🎯 Plano de Finalização das Pendências da Revisão de Segurança

**Data:** Março 1, 2026  
**Status:** Phase 3.2 - Continuação JWT & Security Hardening  
**Progresso Total:** 68% completo (101/~149 fixes aplicadas)

---

## 📊 Diagnóstico Atual — Login/Registro

### ❌ PROBLEMA IDENTIFICADO

**Frontend (AuthContext.tsx):**

```
✓ Chama N8N em: https://n8n.sosescritura.com.br/webhook/login (linha 567)
✓ Chama N8N em: https://n8n.sosescritura.com.br/webhook/register (linha 772)
✗ Senhas passadas em PLAINTEXT para N8N
```

**N8N Backend (Workflow Ar17RgJt19MHQwbJqD8ZK):**

```
✗ Valida senha comparando em plaintext
✗ Armazena senha_hash sem bcrypt (ou com hash simples)
✗ NÃO usa os endpoints de segurança do Worker
```

**Worker (api-crud/src/index.ts):**

```
✓ POST /auth/verify-password (linha 716) ← PRONTO para logins
✓ POST /auth/set-password (linha 655) ← PRONTO para registro/reset
✓ bcrypt com cost 12 configurado ← SEGURO
✓ Rate limiting ← JÁ IMPLEMENTADO
```

**Status: ⚠️ Endpoints prontos no Worker, mas N8N NÃO está usando**

---

## 🔄 Fluxo Atual vs. Fluxo Proposto

### ANTES (Atual - ❌ Inseguro)

```
Usuário
  ↓
Frontend (AuthContext)
  → POST https://n8n.sosescritura.com.br/webhook/login
    {cpf, password_plaintext}
  ↓
N8N Workflow Ar17RgJt19MHQwbJqD8ZK
  → SELECT password_hash FROM users WHERE cpf = ?
  → Compare password_plaintext com password_hash
  → RETORNA user + token
  ↓
Frontend armazena token no SecureStore
  ↓
API calls com Authorization: Bearer <token>
```

**Problemas:**

- ❌ Senhas em plaintext trafegam pela rede
- ❌ Senhas armazenadas sem bcrypt
- ❌ N8N centraliza validação de autenticação
- ❌ Sem progressive upgrade de hashes antigos

---

### DEPOIS (Proposto - ✅ Seguro)

```
Usuário
  ↓
Frontend (AuthContext)
  → POST https://api-crud.sosescritura.com.br/auth/verify-password
    {identifier: cpf||email, password}
  ↓
Worker (index.ts handleVerifyPassword)
  → SELECT password_hash FROM users WHERE identifier = ?
  → bcrypt.compare(password, password_hash)
  → Se válido: gera JWT com signToken()
  → RETORNA {verified: true, token: "eyJ..."}
  ↓
Frontend armazena JWT no SecureStore
  ↓
API calls com Authorization: Bearer <token>
  → Worker extrai payload do JWT (B1 - Procedure 2)
  → Injeta tenant_id automaticamente (B4 - Procedure 3)
  → Valida role server-side (B7 - Procedure 4)
```

**Benefícios:**

- ✅ Senhas nunca saem do banco (validação server-side)
- ✅ Bcrypt com cost 12 (força bruta mitigado)
- ✅ Progressive upgrade automático (senhas antigas virando bcrypt no 1º login)
- ✅ JWT para sessões (sem estado no servidor)
- ✅ Rate limiting (10 tentativas/min por IP)
- ✅ Habilita tenant isolation e RBAC server-side

---

## 📋 Matriz de Decisões Recomendadas

### **DECISÃO 1: Qual é o escopo das mudanças?**

| Opção  | Escopo                                       | Esforço     | Risco       | Recomendação    |
| ------ | -------------------------------------------- | ----------- | ----------- | --------------- |
| **1A** | Apenas adicionar JWT no Worker (Procedure 2) | ⭐ Baixo    | ⭐ Baixo    | ✅ COMEÇAR AQUI |
| **1B** | Migrar N8N login + adicionar JWT             | ⭐⭐ Médio  | ⭐⭐ Médio  | → DEPOIS        |
| **1C** | Fazer tudo: N8N + JWT + B4 + B7              | ⭐⭐⭐ Alto | ⭐⭐⭐ Alto | → FINAL         |

**RECOMENDAÇÃO:** Fazer **1A → 1B → 1C** em etapas sequenciais (3 sprints)

---

### **DECISÃO 2: Quando começar?**

| Timeline          | Prioridade | AR Identificada                               |
| ----------------- | ---------- | --------------------------------------------- |
| 🔴 AGORA          | Crítica    | B10 - Senhas plaintext é segurança crítica    |
| 🟡 Esta semana    | Alta       | B1 - JWT habilita B4 e B7                     |
| 🟢 Próxima semana | Alta       | B4 - Tenant isolation (já tem 80% do caminho) |

**RECOMENDAÇÃO:** **COMEÇAR AGORA com Procedure 2 (JWT)**

---

### **DECISÃO 3: Qual é a ordem de implementação?**

```
Semana 1 - Foundation (Procedure 2)
├── ✅ JWT module (jwt.ts) — JÁ EXISTE
├── ⚠️ Adicionar JWT_SECRET no Wrangler
├── ⚠️ Modificar /auth/verify-password para retornar JWT
├── ⚠️ Testar com test-jwt.js
└── RESULTADO: Worker emite JWTs, frontend pode receber

Semana 2 - Frontend Integration (Procedure 2 cont.)
├── ⚠️ Frontend chama /auth/verify-password (em vez de N8N)
├── ⚠️ Armazena JWT no SecureStore
├── ⚠️ Passa JWT em Authorization header
├── ⚠️ Testa login full-stack
└── RESULTADO: Login funciona sem N8N

Semana 3 - N8N Migration (Procedure 1)
├── ⚠️ Modificar N8N /webhook/register para usar /auth/set-password
├── ⚠️ Modificar N8N /webhook/login para usar /auth/verify-password
├── ⚠️ Remover lógica de senha do N8N
├── ⚠️ Testar registro full-stack
└── RESULTADO: Registro usa bcrypt do Worker

Semana 4 - Server-Side Isolation (Procedures 3 & 4)
├── ⚠️ Worker injeta tenant_id automaticamente (B4)
├── ⚠️ Worker valida role (B7)
├── ⚠️ Remover filtros tenant_id do frontend (opcional)
└── RESULTADO: Tenant isolation server-side hardened
```

**RECOMENDAÇÃO:** Começar pela **Semana 1** (Procedure 2 - JWT Setup)

---

## ✅ Detalhamento: Procedure 2 (JWT Setup) — O QUE FAZER AGORA

### **Passo 1: Adicionar JWT_SECRET ao Wrangler**

**Terminal:**

```bash
cd workers/api-crud
npx wrangler secret put JWT_SECRET
```

**Quando solicitado, cola este secret (ou gera novo com `openssl rand -base64 48`):**

```
kQ9wJr3m0aB8Y2tX1s6LZp4uD7HcN5VfGvR2eUoWjCqTnSxM9yK8A1bP6dFh3LQe
```

**Verificar:**

```bash
npx wrangler secret list
# Deve aparecer: JWT_SECRET (não mostra valor por segurança)
```

---

### **Passo 2: Verificar/Adicionar JWT_SECRET em types.ts**

**Arquivo:** [workers/api-crud/src/types.ts](workers/api-crud/src/types.ts)

**Procurar por:**

```typescript
interface Env {
  // ... outras vars
  JWT_SECRET?: string; // ← Deve estar aqui
}
```

**Se não estiver, adicionar:**

```typescript
JWT_SECRET: string; // ← Mudar de ? para obrigatório
```

---

### **Passo 3: Verificar jwt.ts (JÁ EXISTE ✅)**

**Arquivo:** [workers/api-crud/src/jwt.ts](workers/api-crud/src/jwt.ts)

**Status:** ✅ Completo — tem `signToken()` e `verifyToken()`

**Não precisa fazer nada aqui.**

---

### **Passo 4: Modificar /auth/verify-password para retornar JWT**

**Arquivo:** [workers/api-crud/src/index.ts](workers/api-crud/src/index.ts#L716)  
**Linha:** ~730 (dentro de `handleVerifyPassword`)

**ANTES (linha 730):**

```typescript
return corsResponse(200, {
  verified: true,
  user_id: user.id,
});
```

**DEPOIS:**

```typescript
// Generate JWT token
const token = await signToken(
  {
    sub: user.id,
    tenant_id: user.tenant_id || "",
    role: user.role || "client",
  },
  env.JWT_SECRET,
);

return corsResponse(200, {
  verified: true,
  user_id: user.id,
  token, // ← JWT token para client armazenar
});
```

**Verificar imports no topo de index.ts (linha 24):**

```typescript
import { signToken, verifyToken, type JwtPayload } from "./jwt";
```

---

### **Passo 5: Deploiar Worker**

```bash
cd workers/api-crud
npm run deploy
# Ou: npx wrangler deploy

# Verificar health:
curl https://sos-api-crud.raulcamilotti-c44.workers.dev/health
```

---

### **Passo 6: Testar com test-jwt.js**

```bash
cd workers/api-crud
node test-jwt.js
```

**Output esperado:**

```
✓ Test 1: Login Endpoint (/auth/verify-password)
  ✓ Status: 200 ou 500
  ✓ Token retornado: eyJ...

✓ Test 2: JWT Authentication
  ✓ Status: 200
  ✓ Dados recebidos com JWT

✓ Test 3: Backward Compatibility (X-Api-Key)
  ✓ Status: 200
  ✓ API key ainda funciona
```

---

## 📍 Próximos Passos Após JWT (Semana 2)

### **Semana 2: Integração Frontend com JWT**

**Arquivo:** [core/auth/AuthContext.tsx](core/auth/AuthContext.tsx#L567)

**ANTES (linha 567):**

```typescript
const res = await fetch("https://n8n.sosescritura.com.br/webhook/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": N8N_API_KEY,
  },
  body: JSON.stringify({ cpf, password, ...tenantContext }),
});
```

**DEPOIS:**

```typescript
const res = await fetch(
  "https://api-crud.sosescritura.com.br/auth/verify-password",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": env.EXPO_PUBLIC_API_KEY,
    },
    body: JSON.stringify({
      identifier: cpf, // Email ou CPF
      password,
    }),
  },
);
```

**Extrair JWT:**

```typescript
const data = await res.json();
if (data.token) {
  await saveToken(data.token); // SecureStore
  setAuthToken(data.token); // axios Authorization header
}
```

---

## 🚀 Decisão Final Recomendada

| Aspecto                   | Recomendação                         |
| ------------------------- | ------------------------------------ |
| **O que fazer primeiro?** | Procedure 2 (JWT Setup) - 2-3 horas  |
| **Quando?**               | 🔴 AGORA (crítico)                   |
| **Quem?**                 | Dev backend + deploy                 |
| **Teste?**                | test-jwt.js na linha de comando      |
| **Depois?**               | Semana 2: Frontend (AuthContext)     |
| **Depois disso?**         | Semana 3: N8N migration              |
| **Ganho?**                | 3 procedures completas (B10, B1, B4) |

---

## 📈 Impacto na Segurança (depois de completo)

```
Status Atual:
  ❌ Senhas plaintext em N8N
  ❌ Sem JWT
  ⚠️ Validação auth apenas client-side

Após Procedure 2 (JWT):
  ✅ Senhas com bcrypt no Worker
  ✅ JWT para sessões
  ⚠️ Validação auth ainda client-side (intermediário)

Após Procedure 3 (Tenant Isolation):
  ✅ Senhas com bcrypt
  ✅ JWT por usuário
  ✅ Tenant isolation SERVER-SIDE
  ⚠️ Ainda sem role check server-side

Após Procedure 4 (RBAC):
  ✅ Senhas com bcrypt
  ✅ JWT por usuário
  ✅ Tenant isolation SERVER-SIDE
  ✅ Role check SERVER-SIDE
  🔐 SEGURO: 3 camadas de validação
```

---

## 📝 Checklist de Execução

### Procedure 2 (JWT Setup) — Esta Semana ✅

- [ ] **Passo 1:** `npx wrangler secret put JWT_SECRET`
- [ ] **Passo 2:** Verificar JWT_SECRET em types.ts
- [ ] **Passo 3:** Confirmar jwt.ts existe com signToken/verifyToken
- [ ] **Passo 4:** Modificar /auth/verify-password para retornar JWT
- [ ] **Passo 5:** `npm run deploy` no workers/api-crud
- [ ] **Passo 6:** `node test-jwt.js` (deve passar todos os testes)
- [ ] **Verificação:** Curl para /health endpoint
- [ ] **Backup:** Salvar JWT_SECRET em local seguro

### Procedure 1 (N8N Migration) — Próxima Semana

- [ ] Acessar N8N: https://n8n.sosescritura.com.br
- [ ] Abrir workflow: Ar17RgJt19MHQwbJqD8ZK
- [ ] Modificar /webhook/login → chamar /auth/verify-password
- [ ] Modificar /webhook/register → chamar /auth/set-password
- [ ] Testar registro (nova conta)
- [ ] Testar login (conta existente)
- [ ] Verificar password_hash em plaintext → bcrypt

### Procedure 3 (Tenant Isolation) — Depois

- [ ] Implementar tenant_id injection no Worker
- [ ] Testar multi-tenant isolation
- [ ] Remover filtros tenant_id do frontend (opcional)

---

## 🎓 Resumo Executivo

**Situação:** 65% segurança pronta no Worker, 35% esperando integração com N8N.

**Ação:** Implementar JWT em 3 sprints:

1. **Semana 1:** JWT no Worker (2-3h) ← **COMECE AQUI**
2. **Semana 2:** Frontend + JWT (3-4h)
3. **Semana 3:** N8N bcrypt migration (2-3h)

**Resultado:** 3 procedures críticas completas (B10, B1, B4), segurança aumenta para 85%+.

**Próximo:** Decidir quando começar Procedure 2.
