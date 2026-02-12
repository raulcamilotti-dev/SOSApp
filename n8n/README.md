# N8N Integration

Este projeto USA a N8N como backend principal. O workflow `Ar17RgJt19MHQwbJqD8ZK` processa todas as operações de CRUD.

## Setup

### 1. Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```bash
# N8N Configuration
N8N_URL=http://localhost:5678
N8N_API_KEY=your_api_key_generated_in_n8n
N8N_WORKFLOW_ID=Ar17RgJt19MHQwbJqD8ZK

# App Configuration
EXPO_PUBLIC_API_URL=http://localhost:5678/rest/workflows
```

### 2. Gerar Chave API no N8N

1. Acesse: `http://localhost:5678/settings/api`
2. Clique em "Create API Key"
3. Copie a chave gerada
4. Cole em `N8N_API_KEY` no arquivo `.env`

### 3. GitHub Secrets

Para CI/CD, adicione secrets no GitHub:

1. Vá para: Repository → Settings → Secrets and variables → Actions
2. Adicione: `N8N_URL` e `N8N_API_KEY`

## Workflows Disponíveis

### Download (Puxar do N8N)

```bash
npm run sync:n8n:download
```

Baixa o workflow editado do N8N e salva em `n8n/workflows/Ar17RgJt19MHQwbJqD8ZK.json`

### Upload (Enviar para N8N)

```bash
npm run sync:n8n:upload
```

Envia o workflow local para o N8N (atualiza ou cria novo)

### Validate

```bash
npm run sync:n8n:validate
```

Valida a estrutura do workflow JSON

## Fluxo de Trabalho

### Local Development

1. Faça alterações no workflow no N8N
2. Rode `npm run sync:n8n:download` para sincronizar localmente
3. Commite as mudanças: `git commit -m "feat: update n8n workflow"`
4. Push para main/develop

### CI/CD (GitHub Actions)

1. Quando você faz push para `main`, o GitHub Actions:
   - Valida o workflow JSON
   - Envia para o N8N automaticamente
   - Notifica em caso de erro

## Estrutura de Pastas

```
.
├── n8n/
│   └── workflows/
│       └── Ar17RgJt19MHQwbJqD8ZK.json  (Workflow exportado)
├── scripts/
│   └── sync-n8n-workflow.js             (Script de sync)
└── .env                                  (Variáveis de ambiente)
```

## Troubleshooting

### Erro: "N8N_API_KEY not set"

```bash
# Certifique-se de ter .env configurado
cat .env | grep N8N_API_KEY

# Ou defina como variável de ambiente
export N8N_API_KEY=sua_chave_aqui
npm run sync:n8n:upload
```

### Erro: "Workflow not found in n8n"

- Verifique o `N8N_WORKFLOW_ID` correto
- Certifique-se de que o workflow existe no N8N
- Verifique acesso com a API Key

### Erro: "Network error"

- N8N está rodando? `npm run dev` (no n8n directory)
- URL correta em `N8N_URL`?
- Firewall bloqueando a conexão?

## Referência da API N8N

```javascript
// List workflows
GET /api/v1/workflows

// Get specific workflow
GET /api/v1/workflows/{id}

// Create workflow
POST /api/v1/workflows
Body: { workflow JSON }

// Update workflow
PUT /api/v1/workflows/{id}
Body: { workflow JSON }

// Delete workflow
DELETE /api/v1/workflows/{id}
```

## Links Úteis

- [N8N API Docs](https://docs.n8n.io/api/api-guides/authentication/)
- [N8N Workflow Structure](https://docs.n8n.io/workflows/creating-workflows/)
- [REST API Node](https://docs.n8n.io/nodes/n8n-nodes-base.rest_api/)
