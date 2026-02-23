# GitHub Setup para N8N Integration

## Pré-requisitos

1. ✅ Conta no GitHub
2. ✅ Workflow criado no N8N (ID: `Ar17RgJt19MHQwbJqD8ZK`)
3. ✅ Chave API gerada no N8N

## Passo 1: Gerar Chave API no N8N

1. Abra N8N: `http://localhost:5678` ou seu servidor remoto
2. Vá para: **Settings** (⚙️) → **API**
3. Clique em "Create API Key"
4. Selecione a opção **VisualStudio** (ou a que você criou)
5. Copie a chave gerada
6. **Salve em local seguro** - Você não verá novamente

## Passo 2: Adicionar Secrets no GitHub

### Via Interface Web

1. Vá para seu repositório: `https://github.com/seu-usuario/SOSApp`
2. **Settings** → **Secrets and variables** → **Actions**
3. Clique em **New repository secret**

#### Secret 1: N8N_URL

- **Name**: `N8N_URL`
- **Secret**: `http://localhost:5678` (ou seu URL remoto)
- Clique em **Add secret**

#### Secret 2: N8N_API_KEY

- **Name**: `N8N_API_KEY`
- **Secret**: `cole_sua_chave_aqui`
- Clique em **Add secret**

### Via GitHub CLI

```bash
# Se está usando GitHub CLI:
gh secret set N8N_URL --body "http://localhost:5678"
gh secret set N8N_API_KEY --body "sua_chave_api_aqui"
```

## Passo 3: Verificar Configuração

```bash
# Na raiz do projeto, crie .env local (não commitir):
echo "N8N_URL=http://localhost:5678" > .env
echo "N8N_API_KEY=sua_chave_api_aqui" >> .env

# Teste localmente:
npm run sync:n8n:validate
npm run sync:n8n:download
```

## Passo 4: Fazer Primeiro Commit

```bash
git add n8n/workflows/Ar17RgJt19MHQwbJqD8ZK.json
git add .github/workflows/sync-n8n.yml
git add package.json
git commit -m "feat: add n8n workflow sync integration"
git push origin main
```

Você verá o GitHub Actions rodar automaticamente! ✅

## Fluxo de Sincronização

```
┌─────────────────────────────────────────────────────┐
│ Você edita workflow no N8N                           │
│ (http://localhost:5678/workflows/Ar17RgJt19...) │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
        npm run sync:n8n:download
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│ Arquivo local: n8n/workflows/Ar17RgJt19....json │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
        git add & git push
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ GitHub Actions roda (main branch)                   │
│ sync-n8n.yml                                        │
└──────────────┬─────────────────────────────────────┘
               │
               ▼
      npm run sync:n8n:upload
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ Workflow atualizado no N8N                           │
└──────────────────────────────────────────────────────┘
```

## Troubleshooting

### Erro: "Workflow validation failed"

```bash
# Validate localmente:
npm run sync:n8n:validate

# Check do arquivo JSON:
cat n8n/workflows/Ar17RgJt19....json | jq .
```

### Erro: "Authentication failed"

- Verifique se `N8N_API_KEY` está correto no GitHub Secrets
- A chave pode ter expirado → gere uma nova no N8N
- Confirme `N8N_URL` correto (com protocolo http/https)

### GitHub Actions não roda

1. Vá para: **Actions** tab do repositório
2. Procure por **Sync N8N Workflows**
3. Veja os logs:
   ```
   View workflow runs → click na entrada mais recente
   ```

## Secrets de Segurança

⚠️ **IMPORTANTE:**

- Nunca faça commit do `.env` com a chave real
- Use `git` para adicionar ao `.gitignore`:

  ```bash
  echo ".env" >> .gitignore
  git add .gitignore
  git commit -m "chore: ignore .env file"
  git push
  ```

- GitHub Secrets são criptografados e seguros ✅
- Só o GitHub Actions tem acesso durante a execução
- Você não consegue visualizar depois de criado (por segurança)

## Próximas Etapas

1. ✅ Testar workflow: `npm run sync:n8n:validate`
2. ✅ Fazer push: `git push origin main`
3. ✅ Verificar Actions: GitHub → Actions tab
4. ✅ Editar workflow no N8N com segurança de sincronização automática!

---

**Documentação N8N:** https://docs.n8n.io/api/api-guides/authentication/
