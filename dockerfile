# =========================
# 1️⃣ STAGE: build
# =========================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia apenas manifests primeiro (cache)
COPY package*.json ./

RUN npm ci --no-audit --no-fund

# Copia o restante do projeto
COPY . .

# Build do web (gera dist/)
RUN npm run build


# =========================
# 2️⃣ STAGE: nginx
# =========================
FROM nginx:alpine

# Remove config default
RUN rm /etc/nginx/conf.d/default.conf

# Copia config custom
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia arquivos buildados
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
