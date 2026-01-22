# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copia só lockfiles primeiro (melhor cache + menos RAM)
COPY package.json package-lock.json ./

# npm ci é mais leve e previsível
RUN npm ci --no-audit --no-fund

# Agora copia o resto
COPY . .

# Build web (desliga coisas que não precisa)
ENV EXPO_NO_DOTENV=1
ENV CI=1

RUN npx expo export --platform web

# Serve stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
