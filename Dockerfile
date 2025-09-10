# Multi-stage build for production optimization
FROM node:20-alpine AS base

# Install system dependencies for building native modules
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    pkgconfig \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    python3 --version && \
    which python3 && \
    which python

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Set node-gyp environment variables
ENV PYTHON=/usr/bin/python3
ENV npm_config_build_from_source=true
ENV npm_config_cache=/tmp/.npm

# Install dependencies with proper node-gyp configuration
    RUN npm install --verbose --ignore-scripts && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
COPY . .
RUN npm ci
RUN npm run build
RUN ls -la dist/

# Production stage
FROM node:20-alpine AS production

# Install only runtime dependencies
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    musl \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype \
    dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./

# Set node-gyp environment variables for production
ENV PYTHON=/usr/bin/python3
ENV npm_config_python=/usr/bin/python3
ENV npm_config_build_from_source=false
ENV npm_config_cache=/tmp/.npm

# Install production dependencies only
    RUN npm install --omit=dev --verbose --ignore-scripts && npm cache clean --force

# Copy built application
COPY --from=build --chown=botuser:nodejs /app/dist ./dist
COPY --from=build --chown=botuser:nodejs /app/src ./src
COPY --from=build --chown=botuser:nodejs /app/scripts ./scripts

# Copy configuration files (render.yaml not needed in container)

# Create necessary directories
RUN mkdir -p /app/logs /app/backups /app/temp && \
    chown -R botuser:nodejs /app

# Switch to non-root user
USER botuser

# Health check optimized for Render
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:${PORT:-10000}/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Expose port (Render uses PORT env variable)
EXPOSE ${PORT:-10000}

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]

# Labels for better container management
LABEL maintainer="Bot Hawk Esports Team"
LABEL version="1.0.0"
LABEL description="Bot Hawk Esports Discord Bot"
LABEL org.opencontainers.image.source="https://github.com/your-username/bot-hawk-esports"
LABEL render.platform="render.com"
LABEL render.service="bot-hawk-esports"