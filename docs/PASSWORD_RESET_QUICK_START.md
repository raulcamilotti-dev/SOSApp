# 🚀 QUICK START: Password Reset Setup (15 min)

> Guia rápido para colocar password reset em produção agora.

---

## ⚡ Os 3 Passos (15 minutos)

### 1️⃣ Executar Migração (2 min)

```bash
# Copie todo este SQL e execute no seu banco de dados

-- Arquivo original: migrations/2026-03-01_add-password-reset.sql

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    token VARCHAR(256) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_password_reset_token ON public.password_reset_tokens(token) WHERE deleted_at IS NULL;
CREATE INDEX idx_password_reset_user_expires ON public.password_reset_tokens(user_id, expires_at) WHERE deleted_at IS NULL AND used_at IS NULL;
CREATE INDEX idx_password_reset_expires ON public.password_reset_tokens(expires_at) WHERE deleted_at IS NULL AND used_at IS NULL;

-- Verificar:
SELECT table_name FROM information_schema.tables WHERE table_name = 'password_reset_tokens';
```

**✅ Feito?** Continue para passo 2.

---

### 2️⃣ Importar Workflow N8N (5 min)

**Arquivo:** `n8n/workflows/Forgot-Password.json`

**Passos:**

1. Abra https://n8n.sosescritura.com.br
2. Menu → Workflows → Import from file
3. Selecione `Forgot-Password.json`
4. Configure 2 credenciais:
   ```
   API Key: X-Api-Key header value (procure em .env)
   PostgreSQL: Suas credenciais do banco
   ```
5. Atualize domínio no email template:
   ```
   Procure por: https://seu-dominio.com.br
   Substitua por: seu domínio real
   ```
6. Toggle "Active" ✅
7. Click "Save" ✅

**✅ Feito?** Continue para passo 3.

---

### 3️⃣ Testar (8 min)

**Teste 1: Solicitar Reset**

```bash
curl -X POST https://n8n.sosescritura.com.br/webhook/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"identifier": "seu-email@company.com"}'

# Resposta esperada:
# {"statusCode": 200, "message": "Se a conta existe...", "success": true}

✅ Cheque email - deve ter link com token
```

**Teste 2: Confirmar Reset**

```bash
# Copie o token do link: ?token=ABC123XYZ...

curl -X POST https://n8n.sosescritura.com.br/webhook/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token": "ABC123XYZ...", "new_password": "NovaSenha123!"}'

# Resposta esperada:
# {"statusCode": 200, "verified": true, "token": "eyJhb..."}

✅ Copie o JWT token
✅ Teste login com nova senha
```

---

## 🎯 Se tudo deu certo:

```
✅ password_reset_tokens table existe
✅ N8N workflow está ativo
✅ Usuário recebeu email com link
✅ Usuário conseguiu resetar senha
✅ Usuário consegue fazer login com nova senha
```

## ❌ Se algo deu errado:

| Problema                     | Solução                                             |
| ---------------------------- | --------------------------------------------------- |
| **Email não chegou**         | Verificar spam, check N8N execution logs (vermelho) |
| **Token inválido**           | Token expirou (24h) ou já foi usado, solicitar novo |
| **Worker retorna erro**      | Verificar X-Api-Key header em N8N                   |
| **Tabela não existe**        | Rodar o SQL da migração novamente                   |
| **N8N webhook não responde** | Workflow ativo? Credenciais corretas?               |

---

## 📋 Checklist Final

- [ ] Migração executada (tabela criada)
- [ ] N8N workflow importado
- [ ] Credenciais configuradas
- [ ] Domínio atualizado no email
- [ ] Workflow ativado (toggle on)
- [ ] Email de teste recebido
- [ ] Link de reset válido
- [ ] Nova senha funciona
- [ ] Login com nova senha funciona

---

## 🔍 Verificar Status

**Tabela criada?**

```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name = 'password_reset_tokens';
-- Deve retornar: 1
```

**Workflow ativo?**

```
https://n8n.sosescritura.com.br
→ Open workflow "Forgot-Password"
→ Toggle deve estar ON (azul)
```

**Worker respondendo?**

```bash
curl -X POST https://sos-api-crud.raulcamilotti-c44.workers.dev/auth/request-password-reset \
  -H 'X-Api-Key: sua-api-key' \
  -H 'Content-Type: application/json' \
  -d '{"identifier": "test@test.com"}'

# Deve retornar: {"success": true, "token": "...", ...}
# Nunca 401 (auth error) ou 500 (server error)
```

---

## 📧 Exemplo de Email Recebido

```
Assunto: Redefinir sua senha

Olá [NOME],

Você solicitou para redefinir sua senha.

Clique no link abaixo para continuar:
https://seu-dominio.com.br/reset-password?token=ABC123DEF456...

Este link é válido por 24 horas.

Se você não solicitou isso, ignore este email.

Atenciosamente,
Times de Suporte
```

---

## 🏁 Pronto!

Seu sistema de password reset está 100% funcional. Usuários agora podem:

1. Clicar "Esqueci minha senha"
2. Inserir CPF ou email
3. Receber email com link
4. Clicar link
5. Inserir nova senha
6. Fazer login com nova senha

**Tempo total: 15 minutos** ⏱️

---

Para mais detalhes, veja: `docs/EXECUCAO_PASSWORD_RESET.md`
