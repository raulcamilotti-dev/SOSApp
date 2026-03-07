# Integração Fiscal NF-e / NFC-e — Guia Completo

## Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│  App (React Native / Expo)                                       │
│                                                                   │
│  Faturas.tsx ──► fiscal-documents.ts (orquestrador)              │
│                   │                                               │
│                   ├── fiscal-config.ts (config do tenant)         │
│                   ├── nfe-builder.ts  (monta payload)            │
│                   └── HTTP POST ──────────────────────┐          │
│                                                       │          │
│  configuracao-fiscal.tsx ──► fiscal-config.ts          │          │
│   (tela admin p/ config dados fiscais)                │          │
└───────────────────────────────────────────────────────┼──────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │ PHP Microservice │
                                              │ (Docker, :8580)  │
                                              │                   │
                                              │ sped-nfe ^5.0     │
                                              │ sped-common ^5.0  │
                                              └────────┬──────────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │    SEFAZ     │
                                                │  (Governo)   │
                                                └──────────────┘
```

## Passo a Passo de Deploy

### 1. Aplicar a migration no banco

```sql
-- Primeiro verifique se a migration anterior já foi aplicada:
-- scripts/migrations/2026-03-05_invoices_fiscal_readiness.sql

-- Depois aplique a nova:
-- scripts/migrations/2026-03-10_fiscal_certificate_and_numbering.sql
```

Pode executar via `api_dinamico`:

```ts
const sql = `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ibge_city_code VARCHAR(7) ...`;
await api.post(API_DINAMICO, { sql });
```

### 2. Deploy do microservice PHP

```bash
# No VPS (mesma máquina do N8N)
cd /opt/sosapp/microservices/fiscal-nfe

# Copiar .env
cp .env.example .env

# Editar .env — trocar FISCAL_API_KEY por uma chave segura
nano .env

# Build + start
docker compose up -d --build

# Verificar
curl http://localhost:8580/health
# Deve retornar: {"status":"ok","service":"fiscal-nfe","php":"8.2.x"}
```

### 3. Configurar variável de ambiente no app

No `.env` ou no EAS Build:

```env
EXPO_PUBLIC_FISCAL_EMISSION_ENDPOINT=http://<VPS_IP>:8580
```

Para desenvolvimento local com Docker rodando localmente:

```env
EXPO_PUBLIC_FISCAL_EMISSION_ENDPOINT=http://localhost:8580
```

### 4. Configurar dados fiscais do tenant

Na tela Admin → Financeiro → **Configuração Fiscal**, o tenant deve preencher:

1. **Dados da Empresa** — CNPJ, IE, Razão Social, Regime Tributário
2. **Endereço Fiscal** — CEP (com auto-preenchimento), UF, Cidade, Logradouro, Nº, Bairro
3. **Certificado Digital A1** — Upload do arquivo `.pfx` + senha
4. **CSC NFC-e** — Código de Segurança do Contribuinte (apenas para NFC-e)
5. **Ambiente** — Homologação (testes) ou Produção
6. **Numeração** — Série e próximo número para NF-e e NFC-e

O card **Status de Prontidão** mostra se todos os dados estão OK.

### 5. Emitir nota fiscal a partir de uma fatura

Na tela de Faturas, o botão **Emitir NF** aparece para faturas que não possuem nota
fiscal vinculada. O fluxo interno é:

1. `emitFiscalDocument()` carrega config fiscal do tenant
2. Valida prontidão (certificado, CNPJ, IE, endereço, etc.)
3. Consome próximo número fiscal (atômico via `fiscal_number_lock`)
4. `buildNFePayload()` monta o JSON no formato sped-nfe
5. POST para o microservice PHP
6. PHP usa sped-nfe para: montar XML → assinar → enviar à SEFAZ → receber protocolo
7. Resposta volta ao app: chave de acesso, protocolo, XML assinado (base64)
8. App salva na invoice: `fiscal_access_key`, `fiscal_protocol`, `fiscal_xml`, `fiscal_status`

## Arquivos Criados

| Arquivo                                                              | Linhas | Função                                              |
| -------------------------------------------------------------------- | ------ | --------------------------------------------------- |
| `scripts/migrations/2026-03-10_fiscal_certificate_and_numbering.sql` | 104    | Colunas fiscais em tenants, invoices, invoice_items |
| `services/fiscal-config.ts`                                          | 411    | CRUD config fiscal do tenant + validação prontidão  |
| `services/nfe-builder.ts`                                            | 728    | Monta payload NF-e/NFC-e para o microservice        |
| `services/fiscal-documents.ts`                                       | 354    | Orquestrador emissão (9 passos)                     |
| `app/(app)/Administrador/configuracao-fiscal.tsx`                    | ~1446  | Tela admin Config Fiscal                            |
| `core/admin/admin-pages.ts`                                          | +8     | Registro na navegação                               |
| `core/admin/admin-modules.ts`                                        | +1     | Registro no módulo financeiro                       |
| `microservices/fiscal-nfe/Dockerfile`                                | 25     | Container PHP 8.2                                   |
| `microservices/fiscal-nfe/docker-compose.yml`                        | 17     | Compose config                                      |
| `microservices/fiscal-nfe/composer.json`                             | 20     | Dependências PHP                                    |
| `microservices/fiscal-nfe/public/index.php`                          | ~180   | Router + endpoints                                  |
| `microservices/fiscal-nfe/src/Auth.php`                              | 36     | Autenticação API key                                |
| `microservices/fiscal-nfe/src/NFeService.php`                        | ~430   | Core sped-nfe wrapper                               |
| `microservices/fiscal-nfe/.env.example`                              | 5      | Template variáveis                                  |
| `microservices/fiscal-nfe/.gitignore`                                | 6      | Ignores                                             |
| `microservices/fiscal-nfe/README.md`                                 | ~100   | Documentação API                                    |

## Segurança

- **Certificado digital** é armazenado como base64 no banco (`tenants.fiscal_certificate_pfx`)
  e trafega via HTTPS para o microservice. Nunca salvo em disco no PHP (apenas em memória).
- **API Key** protege o microservice — mesma chave no `.env` do Docker e no
  `EXPO_PUBLIC_FISCAL_EMISSION_ENDPOINT` do app.
- **Senha do certificado** também trafega via HTTPS. Considere futuramente usar um vault.

## Próximos Passos (Phase 2)

- [ ] **NFS-e Nacional** — Integração com a API única de NFS-e do governo
- [ ] **DANFE PDF** — Geração de PDF da DANFE para download/impressão
- [ ] **Inutilização** — Endpoint para inutilizar faixas de numeração
- [ ] **Consulta por chave** — Endpoint para consultar NF-e na SEFAZ
- [ ] **Manifesto** — Manifestação do destinatário
- [ ] **Contingência** — Emissão em contingência (offline → transmissão posterior)
- [ ] **Webhook SEFAZ** — Monitoramento de eventos (cancelamentos de terceiros, etc.)
