# 🚀 Quick Start - N8N Sync Setup

## ✅ Configuração do `.env` (Local)

O arquivo `.env` já está criado na raiz do projeto. Você deve editá-lo com seus valores:

```bash
# 1. Abra o .env com seu editor
code .env

# 2. Substitute esses valores:
N8N_URL=http://localhost:5678          # URL do seu N8N
N8N_API_KEY=sua_chave_api_aqui         # Copie de N8N Settings → API
N8N_WORKFLOW_ID=Ar17RgJt19MHQwbJqD8ZK  # ID do workflow (manter igual)
EXPO_PUBLIC_API_URL=http://localhost:5678/rest/workflows
```

### Onde encontrar a Chave API?

1. Abra N8N: `http://localhost:5678`
2. Vá para: **Settings** (⚙️) → **API**
3. Clique em **Create API Key**
4. Copie a chave (você não verá novamente!)
5. Cole em `N8N_API_KEY=`

### ⚠️ IMPORTANTE: `.gitignore`

O `.env` está no `.gitignore`, então **NÃO será commitado** (seguro! ✅)

```bash
# Verificar:
git status
# Output: .env será mostrado com "Untracked" ou "modified" mas NÃO vai ser commitado
```

## 🔧 Teste Localmente

```bash
# Validate estrutura do workflow
npm run sync:n8n:validate

# Download do workflow atual do N8N
npm run sync:n8n:download

# Ver o arquivo baixado
cat n8n/workflows/Ar17RgJt19MHQwbJqD8ZK.json | head -20
```

## 📝 Fazer o Commit

```bash
# 1. Verificar arquivos a commitar
git status

# Saída esperada:
# new file:   .env                  (não vai aparecer aqui - está no .gitignore)
# modified:   .gitignore
# modified:   package.json
# new file:   .github/workflows/sync-n8n.yml
# new file:   n8n/README.md
# new file:   n8n/workflows/Ar17RgJt19MHQwbJqD8ZK.json
# new file:   scripts/sync-n8n-workflow.js
# modified:   docs/N8N_GITHUB_SETUP.md

# 2. Adicionar arquivo
git add .

# 3. Commit
git commit -m "feat: add n8n workflow sync integration with github actions"

# 4. Push
git push origin main
```

## 🎯 Verificar no GitHub

Após fazer push, vá para:

1. **GitHub Repository → Actions tab**
2. Procure por **"Sync N8N Workflows"**
3. Veja o workflow rodar! ✅

Se tudo correr bem:

- ✅ Workflow JSON é validado
- ✅ Enviado para o N8N automaticamente (usando seus secrets)
- ✅ Sucesso!

## 📋 Checklist Pré-Commit

- [ ] Editei `.env` com valores reais
- [ ] Testei localmente: `npm run sync:n8n:validate`
- [ ] Verifiquei que `.env` não aparece em `git status`
- [ ] Adicionei GitHub Secrets (`N8N_URL`, `N8N_API_KEY`)
- [ ] Tudo pronto para fazer commit!

## ❌ Troubleshooting

### "N8N_API_KEY not set"

```bash
# Verifique o .env:
cat .env | grep N8N_API_KEY

# Se estiver vazio, copie a chave novamente do N8N
```

### ".env aparecendo em git status"

```bash
# Remove do git (se commitou por acidente):
git rm --cached .env
git add .env
git commit -m "refactor: remove .env from tracking"
git push
```

### GitHub Actions falhando

1. Vá para GitHub Secrets (Settings → Secrets)
2. Verifique se `N8N_URL` e `N8N_API_KEY` existem
3. Tente fazer push novamente para rodar o workflow

---

**Próximo passo:** Depois que o GitHub Actions rodar com sucesso, você pode editar o workflow no N8N e sincronizar com confiança! 🚀
