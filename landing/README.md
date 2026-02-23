# Radul Landing Page

Site institucional da plataforma Radul (radul.com.br).

## Estrutura

```
landing/
├── index.html      # Página principal (hero, features, pricing, verticals, CTA)
├── styles.css      # Estilos (responsive, dark theme ready)
├── favicon.svg     # Favicon SVG com gradiente
└── README.md       # Este arquivo
```

## Deploy

### Opção 1 — Cloudflare Pages (recomendado)

```bash
# No dashboard Cloudflare: Pages > Create > Connect to Git
# Build command: (vazio — é HTML estático)
# Build output directory: landing/
```

### Opção 2 — Vercel

```bash
cd landing
npx vercel --prod
```

### Opção 3 — Nginx (VPS)

```nginx
server {
    listen 80;
    server_name radul.com.br www.radul.com.br;
    root /var/www/radul-landing;
    index index.html;

    # Proxy app.radul.com.br → Expo web
    # Proxy *.radul.com.br → Expo web (tenant subdomains)
}
```

## Arquitetura de Domínios

| Domínio               | Destino                  | Propósito                       |
| --------------------- | ------------------------ | ------------------------------- |
| `radul.com.br`        | Landing page (este HTML) | Institucional + contratação     |
| `app.radul.com.br`    | Expo web app             | App principal                   |
| `TENANT.radul.com.br` | Expo web app             | Acesso por subdomínio do tenant |
| `app.clienteX.com.br` | CNAME → app.radul.com.br | Custom domain do tenant         |

## Redirecionamento de Login/Cadastro

Os botões de `Entrar` e `Criar Conta` no `index.html` resolvem o destino dinamicamente no navegador, com base no domínio atual:

- Em domínio institucional (`DOMINIO.com` ou `DOMINIO.com.br`) → direciona para `app.DOMINIO.com` ou `app.DOMINIO.com.br`
- Em `app.DOMINIO...` ou subdomínios de tenant (`tenant.DOMINIO...`) → mantém o mesmo host
- Em ambiente local (`localhost`) → mantém o mesmo origin

Exemplo atual de operação:

- `sosescritura.com.br` / `www.sosescritura.com.br` → `app.sosescritura.com.br`
- `app.sosescritura.com.br` → permanece em `app.sosescritura.com.br`

Além disso, parâmetros de origem/parceria são preservados no redirecionamento (`partner_id`, `ref`, `referral_code`, `tenant`, `tenant_slug`, `utm_*`, `gclid`, `fbclid`).

## Pricing Model — Per Customer

Todos os módulos são inclusos em todos os planos. A cobrança escala pelo número de clientes cadastrados.

| Plano      | Clientes   | Preço        | Usuários   |
| ---------- | ---------- | ------------ | ---------- |
| Grátis     | Até 20     | R$ 0         | 2          |
| Starter    | Até 100    | R$ 99/mês    | Ilimitados |
| Growth     | Até 500    | R$ 249/mês   | Ilimitados |
| Scale      | Até 2.000  | R$ 499/mês   | Ilimitados |
| Enterprise | Ilimitados | Sob consulta | Ilimitados |

Extras: R$ 49/mês domínio personalizado, R$ 0,50/cliente extra além do limite do plano.

## Customização

- Cores: variáveis CSS em `:root` no `styles.css`
- Preços: editar diretamente no `index.html` seção `#planos`
- WhatsApp Enterprise: trocar número no link do botão Enterprise
- Screenshots: substituir o placeholder `.hero-mockup` por `<img>`
