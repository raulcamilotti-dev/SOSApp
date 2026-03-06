# Setup — umami.radul.com.br

Guia prático para publicar o Umami em `umami.radul.com.br` sem tentativa e erro.

## 1) DNS (Cloudflare)

Criar registro DNS:

- **Type:** `A`
- **Name:** `umami`
- **Content:** `104.248.63.102`
- **Proxy status:** `Proxied` (nuvem laranja)

Para diagnóstico inicial, pode alternar temporariamente para `DNS only`.

## 2) Nginx (VHost dedicado)

No servidor, criar um arquivo como:

`/etc/nginx/sites-available/umami.radul.com.br`

Template versionado no repositório:

`docs/nginx/umami.radul.com.br.conf`

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name umami.radul.com.br;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name umami.radul.com.br;

    ssl_certificate /etc/letsencrypt/live/umami.radul.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/umami.radul.com.br/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Ativar site e recarregar:

```bash
sudo cp docs/nginx/umami.radul.com.br.conf /etc/nginx/sites-available/umami.radul.com.br
sudo ln -s /etc/nginx/sites-available/umami.radul.com.br /etc/nginx/sites-enabled/umami.radul.com.br
sudo nginx -t
sudo systemctl reload nginx
```

## 3) TLS (Certbot)

Se o certificado ainda não existir:

```bash
sudo certbot --nginx -d umami.radul.com.br
```

## 4) Testes obrigatórios

Executar na ordem:

```bash
nslookup umami.radul.com.br
curl -I -H "Host: umami.radul.com.br" http://127.0.0.1
curl -I https://umami.radul.com.br
sudo tail -n 100 /var/log/nginx/error.log
```

Em PowerShell (Windows), prefira `curl.exe` para evitar alias do `Invoke-WebRequest`:

```powershell
nslookup umami.radul.com.br
curl.exe -I -H "Host: umami.radul.com.br" http://127.0.0.1
curl.exe -I https://umami.radul.com.br
```

Se houver problema de cadeia de certificado no cliente local Windows durante diagnóstico:

```powershell
curl.exe -k -I https://umami.radul.com.br
```

Resultado esperado:

- `nslookup` resolve para o IP do servidor (direto ou IPs Cloudflare se proxied).
- `curl http://127.0.0.1` com `Host` retorna `301` para HTTPS.
- `curl https://umami.radul.com.br` retorna `200` ou `302` (app do Umami).
- `error.log` sem erros de `connect() failed`, `no live upstreams`, `certificate`.

## 5) Compatibilidade com onboarding de tenants

O Worker de DNS (`/dns/create-subdomain`) agora trata `umami` como subdomínio reservado.

O onboarding do tenant também valida isso antes de criar a empresa: slugs reservados
como `umami` são bloqueados com mensagem clara para o usuário escolher outro endereço.

Isso evita conflito entre:

- host de infraestrutura: `umami.radul.com.br`
- subdomínios de tenant: `{slug}.radul.com.br`

## 6) Troubleshooting rápido

- `502 Bad Gateway`: serviço Umami não está ouvindo em `127.0.0.1:3000`.
- `525/526` com Cloudflare proxied: problema de certificado/TLS no origin.
- `404` no host correto: vhost não carregado ou `server_name` divergente.
- resolução DNS errada: limpar/ajustar registro A na zona Cloudflare.
