# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg \
    curl \
    jq \
    bash

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Copy and make healthcheck script executable
COPY scripts/setup/docker-healthcheck.sh /usr/local/bin/healthcheck.sh
RUN chmod +x /usr/local/bin/healthcheck.sh

# Build the application
RUN npm run build

# Create uploads directory
RUN mkdir -p uploads/clips uploads/thumbnails

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001

# Change ownership of app directory
RUN chown -R botuser:nodejs /app
USER botuser

# Expose port
EXPOSE 3001

# Health check - more robust with longer intervals for production
HEALTHCHECK --interval=60s --timeout=15s --start-period=30s --retries=3 \
    CMD /usr/local/bin/healthcheck.sh

# Start the application
CMD ["npm", "start"]