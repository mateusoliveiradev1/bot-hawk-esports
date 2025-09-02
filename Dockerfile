# Multi-stage Dockerfile for Hawk Esports Bot
# Optimized for production with reduced image size

# =============================================================================
# Stage 1: Build Dependencies and Application
# =============================================================================
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies and clean npm cache
RUN npm prune --production && npm cache clean --force

# =============================================================================
# Stage 2: Runtime Dependencies
# =============================================================================
FROM node:18-alpine AS runtime-deps

# Set working directory
WORKDIR /app

# Install only runtime system dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    jq \
    bash \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# Generate Prisma client for production
RUN npx prisma generate

# =============================================================================
# Stage 3: Final Production Image
# =============================================================================
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Install minimal runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    jq \
    bash \
    dumb-init \
    tini \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

# Create non-root user first
RUN addgroup -g 1001 -S nodejs \
    && adduser -S botuser -u 1001 -G nodejs

# Copy built application from builder stage
COPY --from=builder --chown=botuser:nodejs /app/dist ./dist
COPY --from=builder --chown=botuser:nodejs /app/package*.json ./

# Copy production dependencies from runtime-deps stage
COPY --from=runtime-deps --chown=botuser:nodejs /app/node_modules ./node_modules
COPY --from=runtime-deps --chown=botuser:nodejs /app/prisma ./prisma

# Copy necessary runtime files
COPY --chown=botuser:nodejs config ./config
COPY --chown=botuser:nodejs scripts/setup/docker-healthcheck.sh /usr/local/bin/healthcheck.sh
COPY --chown=botuser:nodejs scripts/setup/docker-entrypoint.sh /usr/local/bin/entrypoint.sh

# Make scripts executable
RUN chmod +x /usr/local/bin/healthcheck.sh /usr/local/bin/entrypoint.sh

# Create necessary directories with proper permissions
RUN mkdir -p \
    uploads/clips \
    uploads/thumbnails \
    logs \
    data \
    tmp \
    && chown -R botuser:nodejs \
    uploads \
    logs \
    data \
    tmp

# Switch to non-root user
USER botuser

# Set environment variables for production
ENV NODE_ENV=production
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

# Expose port
EXPOSE 3001

# Add labels for better image management
LABEL maintainer="Hawk Esports Team" \
      description="Hawk Esports Discord Bot - Production Optimized" \
      version="1.0.0" \
      org.opencontainers.image.title="Hawk Esports Bot" \
      org.opencontainers.image.description="Discord bot for Hawk Esports community" \
      org.opencontainers.image.vendor="Hawk Esports" \
      org.opencontainers.image.licenses="MIT"

# Health check with optimized intervals
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD /usr/local/bin/healthcheck.sh

# Use tini as init system and custom entrypoint
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["npm", "start"]