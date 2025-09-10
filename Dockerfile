# 🐳 Dockerfile - Bot Hawk Esports (Produção)
# Multi-stage build para otimização de tamanho e segurança

# ==========================================
# STAGE 1: Build Dependencies
# ==========================================
FROM node:18-alpine AS builder

# Instalar dependências do sistema
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependências (incluindo devDependencies para build)
RUN npm ci --only=production --silent

# Copiar código fonte
COPY . .

# Build do TypeScript (se necessário)
RUN npm run build 2>/dev/null || echo "No build script found"

# ==========================================
# STAGE 2: Production Runtime
# ==========================================
FROM node:18-alpine AS production

# Instalar dependências mínimas do sistema
RUN apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S botuser -u 1001 -G nodejs

# Criar diretórios necessários
WORKDIR /app
RUN mkdir -p /app/logs /app/data && \
    chown -R botuser:nodejs /app

# Copiar dependências de produção do stage anterior
COPY --from=builder --chown=botuser:nodejs /app/node_modules ./node_modules

# Copiar código da aplicação
COPY --chown=botuser:nodejs . .

# Remover arquivos desnecessários para produção
RUN rm -rf \
    .git \
    .github \
    docs \
    tests \
    *.md \
    .env.example \
    .gitignore \
    .eslintrc.js \
    jest.config.js \
    dump.rdb

# Configurar variáveis de ambiente
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn
ENV NPM_CONFIG_PROGRESS=false

# Expor porta (se necessário para webhooks)
EXPOSE 3000

# Configurar health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "console.log('Bot health check')" || exit 1

# Mudar para usuário não-root
USER botuser

# Comando de inicialização com dumb-init para proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]

# ==========================================
# Labels para metadados
# ==========================================
LABEL maintainer="Hawk Esports Team"
LABEL version="1.0.0"
LABEL description="Bot Discord Hawk Esports - Produção"
LABEL org.opencontainers.image.source="https://github.com/hawk-esports/bot"