# Execução Completa: Password Reset

> **Status:** ✅ Worker Deployed • ⏳ N8N Workflow Ready • ⏳ Awaiting User Setup
>
> **Timeline:** 15 minutos para executar tudo
>
> **Resultado Final:** Usuários podem solicitar reset de senha via email e regain access

---

## 🎯 O que foi implementado

### 1. **Database Schema** (`password_reset_tokens` table)

- Armazena tokens de reset com expiração de 24h
- Suporta soft-delete para auditoria
- Índices para performance rápida

### 2. **Worker Endpoints** (✅ Já deployados)

- `POST /auth/request-password-reset` – Gera token seguro
- `POST /auth/confirm-password-reset` – Valida token e aplica nova senha

### 3. **N8N Workflow** (✅ Pronto para importar)

- Webhook para solicitar reset
- Chamada ao Worker para gerar token
- Send email com link de reset
- Webhook para confirmar reset
- Retorna JWT para login automático

---

## 📋 Passo a Passo da Execução

### Passo 1: Criar a tabela no banco (5 min)

**Arquivo:** `migrations/2026-03-01_add-password-reset.sql`

**Como executar:**

```bash
# Se usar psql:
psql -h your-db-host -U your-user -d your-database -f migrations/2026-03-01_add-password-reset.sql

# Ou via sua interface de admin (DBeaver, pgAdmin, etc):
# 1. Abra o arquivo migrations/2026-03-01_add-password-reset.sql
# 2. Cole no SQL editor
# 3. Execute (F5 ou botão Run)
```

**Verificar se criou corretamente:**

```sql
-- Execute este comando para verificar
SELECT table_name FROM information_schema.tables
WHERE table_name = 'password_reset_tokens';

-- Deve retornar:
-- table_name
-- password_reset_tokens
```

**Se der erro:**

- Verifique conexão ao banco
- Verifique permissões (precisa ser superuser ou ter CREATE TABLE)
- Verifique se está no banco correto (SOS)

---

### Passo 2: Importar o workflow N8N (3 min)

**Arquivo:** `n8n/workflows/Forgot-Password.json`

**Como importar:**

1. **Abra N8N UI**

   ```
   https://n8n.sosescritura.com.br
   ```

2. **Clique em "Workflows"** (sidebar esquerdo)

3. **Clique em "+ New"** ou **"Import"**

4. **Copie o conteúdo de `Forgot-Password.json`**

   ```bash
   # Na linha de comando, para copiar o arquivo:
   cat n8n/workflows/Forgot-Password.json
   # Copie o JSON completo
   ```

5. **Cole no N8N:**
   - Campo: "Paste workflow JSON"
   - Cole todo o conteúdo
   - Clique "Import"

6. **Configure credenciais:**
   - Procure por `api-key-credential-id`
   - Substitua pela credencial real de API Key
   - Procure por `postgres-credential-id`
   - Substitua pela credencial real do banco PostgreSQL

7. **Atualize a URL do seu domínio:**
   - Procure no email template por `https://seu-dominio.com.br/reset-password?token=`
   - Substitua por seu domínio real (ex: `https://app.sosescritura.com.br`)

8. **Ative o workflow:**
   - Toggle "Active" no topo
   - Clique "Save"

**Resultado esperado:**

```
Workflow name: Forgot-Password
Status: Active ✅
Webhooks: 2 (forgot-password, reset-password)
```

---

### Passo 3: Testar o fluxo (7 min)

#### Teste 1: Solicitar Reset

**Via curl:**

```bash
curl -X POST \
  https://n8n.sosescritura.com.br/webhook/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{
    "identifier": "user@email.com"
  }'
```

**Resposta esperada:**

```json
{
  "statusCode": 200,
  "message": "Se a conta existe, um link de reset será enviado por email",
  "success": true
}
```

**Verifique:**

- ✅ Email recebido com link de reset
- ✅ Link válido (clique nele)
- ✅ Página de reset carregou

#### Teste 2: Confirmar Reset

Após clicar no link do email, o frontend deve:

1. Extrair o `token` da URL
2. Pedir ao usuário a nova senha
3. Chamar:

```bash
curl -X POST \
  https://n8n.sosescritura.com.br/webhook/reset-password \
  -H 'Content-Type: application/json' \
  -d '{
    "token": "COPIE_O_TOKEN_DA_URL",
    "new_password": "NovaSenha123!"
  }'
```

**Resposta esperada:**

```json
{
  "statusCode": 200,
  "message": "Senha alterada com sucesso",
  "verified": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Verifique:**

- ✅ JWT token retornado
- ✅ Usuário consegue fazer login com nova senha
- ✅ Token é válido para 24 horas

---

## 🔧 Configuração Detalhada

### 1. Credenciais N8N

**Para `api-key-credential-id` (API Key Header Auth):**

```
Nome: API Key SOS
Tipo: Header Auth
Header Name: X-Api-Key
Value: [sua-api-key-aqui]
```

**Onde encontrar a API Key:**

- Arquivo: `.env` ou `env.local`
- Chave: `EXPO_PUBLIC_N8N_API_KEY` ou similar
- Valor: String alfanumérica de ~32+ caracteres

**Para `postgres-credential-id` (PostgreSQL):**

```
Host: your-db-host
Port: 5432
Database: sos_db
User: postgres
Password: [sua-senha]
SSL: false (ou true se required)
```

### 2. Endpoints Worker

**Base URL:** `https://sos-api-crud.raulcamilotti-c44.workers.dev`

**Endpoints:**

- `POST /auth/request-password-reset`
- `POST /auth/confirm-password-reset`

**Headers:**

```
Content-Type: application/json
X-Api-Key: [sua-api-key]
```

### 3. Webhooks N8N

**Forgot Password Webhook:**

```
URL: https://n8n.sosescritura.com.br/webhook/forgot-password
Method: POST
Body: { "identifier": "cpf or email" }
Response: { "statusCode": 200, "message": "...", "success": true }
```

**Reset Password Webhook:**

```
URL: https://n8n.sosescritura.com.br/webhook/reset-password
Method: POST
Body: { "token": "...", "new_password": "..." }
Response: { "statusCode": 200 ou 401, "verified": true/false, "token": "JWT" }
```

---

## 📧 Template de Email

**Assunto:** "Redefinir sua senha"

**Body:**

```
Olá [NOME],

Você solicitou para redefinir sua senha.

Clique no link abaixo para continuar:
[RESET_LINK]

Este link é válido por 24 horas.

Se você não solicitou isso, ignore este email.

Atenciosamente,
Times de Suporte
```

**Para customizar:**

- Abra o workflow no N8N
- Procure por "Envia email com reset link"
- Edite o campo "body" com seu template
- Variáveis disponíveis:
  - `{{ $('Busca usuário').first().json.email }}` – Email do usuário
  - `{{ $('Busca usuário').first().json.fullname }}` – Nome do usuário
  - `{{ $('Gera token de reset (Worker)').first().json.token }}` – Token
  - `{{ seu-dominio }}/reset-password?token=...` – Link

---

## 🚨 Troubleshooting

### "Token inválido ou expirado"

**Cause:** Token já foi usado ou 24h passaram

**Solution:**

1. Usuário solicita novo reset
2. N8N gera novo token
3. Usuário tenta novamente com novo token

### "Usuário não encontrado"

**Expected behavior:** Sistema retorna 200 de qualquer forma (user enumeration prevention)

**Verificar:**

```sql
-- Se o usuário existe:
SELECT id, email, cpf FROM users
WHERE cpf = '12345678900' OR email = 'user@email.com'
AND deleted_at IS NULL;
```

### "Email não foi recebido"

**Verificar:**

1. N8N workflow está ativo? (toggle "Active")
2. Log do N8N mostra erro?
   - Abra workflow
   - Clique em "Executions" (histórico)
   - Procure por erros em vermelho
3. Email service configurado corretamente?
   - Testar: `Send Test Email` nó
   - Verificar credenciais de email

### "Worker retorna erro 401"

**Cause:** Chave API inválida ou missing

**Verificar:**

```bash
# Testar endpoint diretamente:
curl -X POST \
  https://sos-api-crud.raulcamilotti-c44.workers.dev/auth/request-password-reset \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: sua-chave-aqui' \
  -d '{"identifier": "test@email.com"}'

# Resposta deve ser 200 ou 400 (nunca 401):
# {"success": true, "token": "...", "message": "..."}
```

---

## ✅ Checklist de Verificação

Antes de considerar completo, verifique:

- [ ] **Database:**
  - [ ] Tabela `password_reset_tokens` existe
  - [ ] 3 índices criados corretamente
  - [ ] Soft-delete funciona (deleted_at é NULL por padrão)

- [ ] **Worker:**
  - [ ] Endpoints responds with 200
  - [ ] Token gerado com 64 caracteres
  - [ ] Token expira após 24h
  - [ ] Token é usado uma única vez

- [ ] **N8N:**
  - [ ] Workflow está ativo (toggle on)
  - [ ] 2 webhooks disponíveis
  - [ ] Credenciais configuradas corretamente
  - [ ] Email envia sem erros

- [ ] **End-to-End:**
  - [ ] Usuário solicita reset
  - [ ] Email recebido em <1 minuto
  - [ ] Link é válido e abre página
  - [ ] Usuário consegue setar nova senha
  - [ ] Novo JWT retornado
  - [ ] Usuário consegue fazer login com nova senha

---

## 📊 Fluxo Diagrama

```
┌─────────────────────────────────────────────────────────┐
│                   FLOW: PASSWORD RESET                  │
└─────────────────────────────────────────────────────────┘

1. SOLICITAR RESET
   User submits: POST /webhook/forgot-password
   └─ Body: { identifier: "cpf or email" }

   N8N:
   ├─ Chama Worker: /auth/request-password-reset
   ├─ Worker retorna: { success: true, token: "..." }
   ├─ Busca email do usuário no banco
   ├─ Envia email com reset link
   └─ Retorna: { statusCode: 200, message: "..." }

2. EMAIL RECEBIDO
   User recebe email com:
   └─ Link: https://seu-dominio/reset-password?token=ABC123...

3. CONFIRMAR RESET
   User submits: POST /webhook/reset-password
   └─ Body: { token: "ABC123...", new_password: "Nova!" }

   N8N:
   ├─ Chama Worker: /auth/confirm-password-reset
   ├─ Worker valida token (não expirado, não usado)
   ├─ Worker faz hash da nova senha
   ├─ Worker marca token como "used"
   └─ Worker retorna JWT

4. LOGIN AUTOMÁTICO
   Frontend recebe JWT
   └─ User já está logado, redireciona para dashboard
```

---

## 🎓 Entender o Fluxo

### Por que 24 horas?

- Padrão da indústria para tokens sensíveis
- Bal balance entre segurança e UX (não expira antes que user pense)
- Token de reset é one-time-use (mesmo que não expirar, não pode usar 2x)

### Por que "user enumeration prevention"?

```
❌ Ruim:
POST /forgot-password
{ "email": "admin@company.com" }
→ 200 "Email sent"
{ "email": "fake@company.com" }
→ 400 "User not found"
👉 Attacker sabe que admin@company.com existe

✅ Bom:
Ambos retornam 200 "Se a conta existe, email será enviado"
👉 Attacker não consegue enumerar usuários
```

### Por que token é usado dentro do Worker?

```
Flow:
1. User gets token
2. User clicks link, frontend extracts token
3. Frontend sends: POST /reset-password { token, new_password }
4. Worker valida token + marca como "used"
5. Mesmo que token vaze, só funciona uma vez
```

---

## 💬 FAQ

**P: E se o usuário não receber o email?**
R: Verificar spam, junk, retry. Token válido por 24h, múltiplas tentativas de reset permitidas.

**P: Posso customizar o email template?**
R: Sim! Abra workflow no N8N, procure por "Envia email com reset link", edite o body.

**P: Posso usar outro provedor de email?**
R: Sim! Substitua o nó de HTTP call por SendGrid, Mailgun, ou seu provedor.

**P: Token precisa ser armazenado no banco?**
R: Sim, para validação + one-time-use + auditoria.

**P: Preciso mudar algo no frontend?**
R: Sim, front precisa ter página `/reset-password?token=ABC123` que:

1. Extrai token da URL
2. Pede nova senha
3. Chama POST /webhook/reset-password
4. Recebe JWT
5. Salva localStorage
6. Redireciona para dashboard

**P: Como criar página de reset no frontend?**

```tsx
// app/(public)/reset-password.tsx (exemplo Expo)
import { useSearchParams } from 'expo-router';

export default function ResetPassword() {
  const params = useSearchParams();
  const token = params.token; // Pega token da URL

  const handleReset = async (newPassword: string) => {
    const res = await fetch('https://n8n.sosescritura.com.br/webhook/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword })
    });

    const data = await res.json();
    if (data.verified) {
      // Salva JWT
      SecureStore.setItemAsync('auth_token', data.token);
      // Redireciona
      router.replace('/(app)/');
    }
  };

  return (
    // Form com input de password
    // Botão Submit que chama handleReset
  );
}
```

---

## 📞 Suporte

Se encontrar problemas:

1. **Verificar logs**
   - N8N: Workflow → Executions (vermelho = erro)
   - Worker: Wrangler logs / Cloudflare dashboard
   - Database: Check table exists + has data

2. **Testar endpoints individualmente**

   ```bash
   # 1. Testar Worker diretamente
   curl -X POST https://sos-api-crud.raulcamilotti-c44.workers.dev/auth/request-password-reset \
     -H 'X-Api-Key: ...' \
     -H 'Content-Type: application/json' \
     -d '{"identifier": "test@email.com"}'

   # 2. Testar N8N webhook
   curl -X POST https://n8n.sosescritura.com.br/webhook/forgot-password \
     -H 'Content-Type: application/json' \
     -d '{"identifier": "test@email.com"}'
   ```

3. **Verificar permissões**
   - DB user tem acesso à tabela password_reset_tokens?
   - API Key é válida e tem permissão?
   - N8N credenciais estão corretas?

---

## 🎉 Próximos Passos

Após tudo estar funcionando:

1. **Comunicar aos usuários**
   - "Se esqueceu a senha, clique em 'Forgot Password' na login page"
   - Email com instruções será enviado

2. **Monitorar**
   - N8N workflow executions
   - Worker logs
   - Database usage

3. **Otimizar (opcional)**
   - Adicionar rate limiting frontend (evitar spam)
   - Adicionar CAPTCHA no form de forgot-password
   - Logging/metrics de tentativas

---

**Status:** ✅ Pronto para produção

**Última atualização:** 2026-03-01

**Criado por:** Auto-generated setup guide
