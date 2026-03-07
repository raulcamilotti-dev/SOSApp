# Fiscal NF-e Microservice

PHP 8.2 microservice for NF-e / NFC-e emission, cancellation and correction via
[sped-nfe](https://github.com/nfephp-org/sped-nfe).

## Quick Start

```bash
cd microservices/fiscal-nfe
docker compose up -d --build
```

Health check: `curl http://localhost:8580/health`

## API

All POST endpoints require `X-Api-Key` header matching `FISCAL_API_KEY` env var.

| Method | Path         | Description              |
| ------ | ------------ | ------------------------ |
| GET    | /health      | Health check (no auth)   |
| POST   | /nfe/emit    | Emit NF-e (modelo 55)    |
| POST   | /nfce/emit   | Emit NFC-e (modelo 65)   |
| POST   | /nfe/cancel  | Cancel NF-e/NFC-e        |
| POST   | /nfe/correct | Carta de Correção (CC-e) |
| GET    | /nfe/status  | SEFAZ service status     |

### POST /nfe/emit — Payload

```json
{
  "environment": 2,
  "certificate_pfx_base64": "<base64 PFX>",
  "certificate_password": "senha",
  "infNFe": {
    "ide": { "cUF": 35, "nNF": 1, "serie": 1, "dhEmi": "2026-03-07T10:00:00-03:00", "cMunFG": "3550308" },
    "emit": { "CNPJ": "12345678000199", "xNome": "...", "IE": "...", "CRT": 3, "enderEmit": { ... } },
    "dest": { "xNome": "...", "CPF": "12345678901", ... },
    "det": [{ "prod": { ... }, "imposto": { ... } }],
    "total": { "ICMSTot": { "vNF": "100.00", ... } },
    "transp": { "modFrete": 9 },
    "pag": [{ "tPag": "01", "vPag": "100.00" }]
  }
}
```

The `infNFe` payload is built by `services/nfe-builder.ts` in the app.

### POST /nfce/emit — same as /nfe/emit plus:

```json
{
  "csc": "000001",
  "csc_id": "A1B2C3..."
}
```

### POST /nfe/cancel

```json
{
  "certificate_pfx_base64": "<base64 PFX>",
  "certificate_password": "senha",
  "access_key": "35260312345678000199550010000000011234567890",
  "protocol": "135260300000001",
  "justification": "Erro na emissão, cancelamento solicitado pelo cliente",
  "environment": 2
}
```

### POST /nfe/correct

```json
{
  "certificate_pfx_base64": "<base64 PFX>",
  "certificate_password": "senha",
  "access_key": "35260312345678000199550010000000011234567890",
  "correction_text": "Correção no endereço do destinatário: Rua ABC 123",
  "sequence": 1,
  "environment": 2
}
```

## Environment Variables

| Variable       | Default | Description                |
| -------------- | ------- | -------------------------- |
| FISCAL_API_KEY | (empty) | API key for authentication |
| APP_DEBUG      | (unset) | Show stack traces on error |

## Storage

XML files are archived in `storage/xml/{year}/{month}/{access_key}.xml`.
The `storage/` directory is mounted as a Docker volume for persistence.
