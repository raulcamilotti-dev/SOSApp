# 🔐 Recomendações N8N: Login & Registro — Diagnóstico + Plano de Ação

**Data:** Março 1, 2026  
**Workflow:** Ar17RgJt19MHQwbJqD8ZK (N8N Platform)  
**Endpoint Atual:** https://n8n.sosescritura.com.br

---

## 🔍 O QUE ESPERAMOS VER NO N8N

Baseado no código do frontend (AuthContext.tsx), o N8N recebe:

### **Workflow: /webhook/login**

**Entrada Esperada (POST):**

```json
{
  "cpf": "12345678910",
  "password": "senha_plaintext",
  "tenant_slug": "meu-escritorio",
  "tenant_subdomain": "meu-escritorio.radul.com.br",
  "tenant_hint": "meu-escritorio",
  "app_slug": "sos",
  "host": "meu-escritorio.radul.com.br",
  "hostname": "meu-escritorio.radul.com.br",
  "pathname": "/",
  "partner_id": null,
  "referral_code": null,
  "utm_source": null,
  "utm_campaign": null,
  "tenant_context": {...}
}
```

**Saída Esperada (Login Bem-Sucedido):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "cpf": "12345678910",
    "role": "client",
    "tenant_id": "uuid"
  },
  "token": "jwt_token_ou_session"
}
```

---

### **Workflow: /webhook/register**

**Entrada Esperada (POST):**

```json
{
  "cpf": "12345678910",
  "email": "novo@example.com",
  "phone": "11999999999",
  "fullname": "João Silva",
  "password": "senha_plaintext",
  "company_name": "Empresa XYZ",
  "cnpj": "12345678901234",
  "tenant_slug": "empresa-xyz",
  "tenant_subdomain": "empresa-xyz.radul.com.br",
  "tenant_hint": "empresa-xyz",
  "app_slug": "sos",
  "host": "app.radul.com.br",
  "hostname": "app.radul.com.br",
  "pathname": "/",
  "partner_id": null,
  "referral_code": null,
  "utm_source": null,
  "utm_campaign": null,
  "tenant_context": {...}
}
```

**Saída Esperada (Registro Bem-Sucedido):**

```json
{
  "user": {
    "id": "uuid",
    "email": "novo@example.com",
    "cpf": "12345678910",
    "fullname": "João Silva",
    "tenant_id": "uuid",
    "role": "tenant_admin"
  },
  "token": "jwt_token_ou_session"
}
```

---

## ⚠️ PROBLEMAS IDENTIFICADOS NO N8N

Baseado na análise do Worker e Frontend, esperamos encontrar:

### **Problema 1: Validação de Senha em Plaintext**

**O que PROVAVELMENTE está acontecendo:**

```SQL
-- N8N Query (improvável ser assim, mas seria):
SELECT password_hash FROM users WHERE cpf = $1;
-- Depois compara em JavaScript:
if (body.password === user.password_hash) { ... }
```

**Risco:**

- ❌ Senhas armazenadas em plaintext
- ❌ Comparação direta sem bcrypt
- ❌ Sem proteção ainda força bruta
- ❌ Senhas expostas em logs do N8N

---

### **Problema 2: Registro sem Hashing**

**O que PROVAVELMENTE está acontecendo:**

```SQL
-- N8N: INSERT direto
INSERT INTO users (cpf, email, password_hash, fullname, ...)
VALUES ($1, $2, $3, $4, ...);
-- $3 é a senha em PLAINTEXT passada direto
```

**Risco:**

- ❌ Senhas não hashadas no registro
- ❌ Sem progressão para bcrypt
- ❌ Problemas de compliance (LGPD, segurança)

---

### **Problema 3: N8N não usa os Endpoints do Worker**

**O que DEVERIA estar acontecendo:**

```
N8N /webhook/login
  → HTTP Request para Worker /auth/verify-password
     { identifier: cpf, password }
  → Worker retorna { verified: true, token: "jwt..." }
  → N8N passa token para frontend
```

**Status Atual:**

- ❌ N8N não chama Worker
- ❌ Toda a validação fica em N8N
- ❌ Sem benefício do bcrypt do Worker

---

## ✅ RECOMENDAÇÕES PARA N8N

### **RECOMENDAÇÃO 1: Login Seguro**

**Atualmente (❌ Inseguro):**

```
[HTTP Request Node] → N8N queries database for password_hash
  ↓
[JS Filter Node] → if (plaintext === hash) ❌ INSEGURO
  ↓
[Return Node] → {user, token}
```

**Recomendado (✅ Seguro):**

```
[HTTP Request Node]
  → GET body.cpf e body.password
  ↓
[HTTP Request Node] (NEW)
  → POST https://api-crud.sosescritura.com.br/auth/verify-password
  → Headers: {"X-Api-Key": "seu-api-key"}
  → Body: {identifier: cpf, password}
  ↓
[JS Filter Node]
  → if (response.verified === true)
  → Extract token = response.token
  ↓
[Return Node] → {user: fetch_from_db, token}
```

**Vantagens:**

- ✅ Validação feita no Worker (server seguro)
- ✅ Bcrypt cost 12 (força bruta mitigado)
- ✅ JWT token já pronto
- ✅ Progressive upgrade automático
- ✅ Rate limiting (10/min por IP)

---

### **RECOMENDAÇÃO 2: Registro Seguro**

**Atualmente (❌ Inseguro):**

```
[HTTP Request Node] → Parse request body
  ↓
[DB Query Node] → INSERT users (cpf, email, password_hash=plaintext)
  ↓
[Return Node] → {user, token}
```

**Recomendado (✅ Seguro):**

```
[HTTP Request Node]
  → Parse request body (cpf, email, password, etc.)
  ↓
[DB Query Node]
  → INSERT users (cpf, email, password_hash=NULL)
  → Capture: user_id
  ↓
[HTTP Request Node] (NEW)
  → POST https://api-crud.sosescritura.com.br/auth/set-password
  → Headers: {"X-Api-Key": "seu-api-key"}
  → Body: {user_id, password}
  ↓
[Condition Node]
  → if (response.success === true)
  ↓
[Return Node] → {user, token}
```

**Vantagens:**

- ✅ Senha hashada com bcrypt APÓS inserção de user
- ✅ Password_hash NEVER in plaintext on DB
- ✅ Bcrypt cost 12
- ✅ Separação entre INSERT user e SET password
- ✅ Rate limiting (5/min por IP para set-password)

---

### **RECOMENDAÇÃO 3: Reset de Senha (se existe)**

**Padrão similar ao Registro:**

```
[Identificar Usuário] → SELECT user_id FROM users WHERE email = $1
  ↓
[Validar Token Reset] → if (token_válido && não_expirado)
  ↓
[HTTP Request Node] (NEW)
  → POST /auth/set-password {user_id, password}
  ↓
[Return Node] → {success: true}
```

---

## 📝 PRÓXIMOS PASSOS

### **FASE A: Diagnóstico (TODAY)**

1. **Acesse N8N:** https://n8n.sosescritura.com.br
2. **Abra workflow:** Ar17RgJt19MHQwbJqD8ZK
3. **Inspecione nós:**
   - ❓ Como a senha é validada no /webhook/login?
   - ❓ Como a senha é armazenada no /webhook/register?
   - ❓ Há reset de senha?
   - ❓ Qual SQL é usado?

4. **Documente:**
   - Screenshot dos nós
   - SQL queries usadas
   - Estrutura de response

---

### **FASE B: Implementação (PRÓXIMA SEMANA)**

**Pré-requisitos:**

- ✅ Procedure 2 (JWT) deve estar COMPLETO
- ✅ Worker `/auth/verify-password` retorna JWT
- ✅ Worker `/auth/set-password` testa OK

**Modificações N8N:**

**Passo 1: /webhook/login → chamar Worker**

```
[Recebe: cpf, password]
  ↓
[HTTP Request]
  Method: POST
  URL: https://api-crud.sosescritura.com.br/auth/verify-password
  Headers: {
    "Content-Type": "application/json",
    "X-Api-Key": "{{ $env.SOS_API_KEY }}"
  }
  Body: {
    "identifier": "{{ $json.cpf }}",
    "password": "{{ $json.password }}"
  }
  ↓
[IF verified == true]
  → Query user details: SELECT * FROM users WHERE cpf = ?
  → Return {user, token: response.token}
[ELSE]
  → Return error 401
```

**Passo 2: /webhook/register → chamar Worker após INSERT**

```
[Recebe: cpf, email, password, fullname, etc]
  ↓
[DB INSERT]
  INSERT INTO users (cpf, email, fullname, ...)
  VALUES (...)
  RETURNING id as user_id
  ↓
[HTTP Request]
  Method: POST
  URL: https://api-crud.sosescritura.com.br/auth/set-password
  Headers: {
    "Content-Type": "application/json",
    "X-Api-Key": "{{ $env.SOS_API_KEY }}"
  }
  Body: {
    "user_id": "{{ $json.user_id }}",
    "password": "{{ $json.password }}"
  }
  ↓
[IF success == true]
  → Generate JWT: POST /auth/verify-password (opcional se Procedure 2 já retorna)
  → Return {user, token}
[ELSE]
  → Rollback/Error
```

---

### **FASE C: Testes (ENQUANTO FAZ)**

1. **Teste Login:**

   ```bash
   curl -X POST https://n8n.sosescritura.com.br/webhook/login \
   -H "Content-Type: application/json" \
   -H "X-Api-Key: seu-api-key" \
   -d '{"cpf":"12345678910", "password":"teste123"}'
   ```

   Esperado: `{user, token}`

2. **Teste Register:**

   ```bash
   curl -X POST https://n8n.sosescritura.com.br/webhook/register \
   -H "Content-Type: application/json" \
   -H "X-Api-Key: seu-api-key" \
   -d '{"cpf":"99887766554", "email":"novo@test.com", "password":"teste123", "fullname":"Test User"}'
   ```

   Esperado: `{user, token}`

3. **Depois, verifica DB:**
   ```sql
   -- Senhas novas devem estar com BCRYPT, não plaintext
   SELECT id, cpf, password_hash FROM users ORDER BY created_at DESC LIMIT 5;
   -- password_hash deve começar com "$2b$" (bcrypt signature)
   ```

---

## 🎯 Checklist de Implementação

### Checklist: Modificar N8N /webhook/login

- [ ] Abrir N8N: https://n8n.sosescritura.com.br
- [ ] Editar workflow: Ar17RgJt19MHQwbJqD8ZK
- [ ] Encontrar nó de validação de senha
- [ ] Documentar SQL atual
- [ ] Remover lógica de plaintext comparison
- [ ] Adicionar HTTP Request node para Worker
- [ ] Configurar: POST /auth/verify-password
- [ ] Testar com curl
- [ ] Verificar JWT é retornado
- [ ] Deploy/Save no N8N

### Checklist: Modificar N8N /webhook/register

- [ ] Encontrar nó de insert de user
- [ ] Documentar SQL atual (se senha está sendo inserida)
- [ ] Modificar INSERT para NÃO incluir password_hash (deixar NULL)
- [ ] Após INSERT, adicionar HTTP Request node para Worker
- [ ] Configurar: POST /auth/set-password {user_id, password}
- [ ] Testar estrutura
- [ ] Verificar error handling se set-password falhar
- [ ] Deploy no N8N
- [ ] Testar registro com nova conta
- [ ] Verificar db: password_hash começa com "$2b$"

---

## 📊 Comparativo: Antes x Depois

| Aspecto                 | ANTES (Atual)             | DEPOIS (Recomendado)           |
| ----------------------- | ------------------------- | ------------------------------ |
| **Validação Password**  | Plaintext em N8N          | Bcrypt no Worker               |
| **Storage Password**    | Plaintext ou hash simples | Bcrypt cost 12                 |
| **Rate Limiting**       | ❌ Sem                    | ✅ 10/min verify, 5/min set    |
| **Hashing Location**    | N8N (se houver)           | Worker (centralizado)          |
| **Progressive Upgrade** | ❌ Sem                    | ✅ Auto upgrade ao login       |
| **JWT Generation**      | N8N                       | Worker (seguro)                |
| **Attack Surface**      | N8N exposto               | Worker (protegido, Cloudflare) |
| **Compliance**          | ❌ LGPD risk              | ✅ LGPD compliant              |
| **Auditoria**           | Difícil                   | Fácil (logs Worker)            |

---

## 🔴 DECISÃO CRÍTICA

### **RECOMENDAÇÃO FINAL:**

```
┌─────────────────────────────────────────────────────┐
│ Implementar Procedure 2 (JWT) ESTA SEMANA            │
│ Depois fazer mudanças N8N CONFORME CHECKLIST ACIMA   │
│                                                       │
│ Risco se adiar:                                       │
│ • Senhas plaintext continuam expostas                │
│ • Sem progressão para bcrypt                         │
│ • Sem proteção contra força bruta                    │
│ • LGPD compliance em risco                           │
│                                                       │
│ Ganho imediato:                                       │
│ • Encriptação bcrypt cost 12                         │
│ • Rate limiting 10/5 por minuto                      │
│ • JWT para sessões seguras                           │
│ • Progressive upgrade automático                      │
│ • Logs auditáveis                                     │
└─────────────────────────────────────────────────────┘
```

---

## ❓ PRÓXIMAS QUESTÕES PARA VOCÊ

Responda as questões abaixo para acelerar a implementação:

1. **N8N Access:**
   - [ ] Você tem acesso a https://n8n.sosescritura.com.br?
   - [ ] Consegue editar workflow Ar17RgJt19MHQwbJqD8ZK?

2. **Diagnóstico:**
   - [ ] Pode ver como /webhook/login valida senha?
   - [ ] Pode descrever a estrutura dos nós?

3. **Timeline:**
   - [ ] Procedure 2 (JWT) começa hoje?
   - [ ] Modificações N8N começam quando?

4. **API Key:**
   - [ ] N8N pode usar X-Api-Key para chamar Worker?
   - [ ] Qual é a env var para SOS_API_KEY?

---

**🚀 Próximo comando:** Confirme acesso ao N8N ou descreva a estrutura atual para que possamos montar o plano exato.
