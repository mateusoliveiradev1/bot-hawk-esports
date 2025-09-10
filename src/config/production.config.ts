import { config } from 'dotenv';
import { join } from 'path';

// Load production environment variables
config({ path: join(process.cwd(), '.env.production') });

export const productionConfig = {
  // Environment
  nodeEnv: process.env.NODE_ENV || 'production',
  debug: process.env.DEBUG === 'true',

  // Discord
  discord: {
    token: process.env.DISCORD_TOKEN!,
    clientId: process.env.DISCORD_CLIENT_ID!,
    guildId: process.env.DISCORD_GUILD_ID!,
  },

  // Database
  database: {
    url: process.env.DATABASE_URL!,
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN || '5'),
      max: parseInt(process.env.DATABASE_POOL_MAX || '20'),
    },
    connectionTimeout: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT || '30000'),
    idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '600000'),
  },

  // Redis (optional - falls back to memory cache)
  redis: {
    url: process.env.REDIS_URL || null,
    pool: {
      min: parseInt(process.env.REDIS_POOL_MIN || '5'),
      max: parseInt(process.env.REDIS_POOL_MAX || '20'),
    },
    connectionTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT || '10000'),
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000'),
  },

  // API
  api: {
    port: parseInt(process.env.API_PORT || process.env.PORT || '3001'),
    host: process.env.API_HOST || '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    timeout: parseInt(process.env.API_TIMEOUT || '30000'),
    bodyLimit: process.env.API_BODY_LIMIT || '10mb',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'warn',
    file: process.env.LOG_FILE || 'logs/production.log',
    errorFile: process.env.LOG_ERROR_FILE || 'logs/error.log',
    maxSize: parseInt(process.env.LOG_MAX_SIZE || '10485760'),
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
    datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
    compress: process.env.LOG_COMPRESS === 'true',
  },

  // Cache
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '1800'),
    maxKeys: parseInt(process.env.CACHE_MAX_KEYS || '10000'),
    checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD || '600'),
    useClone: process.env.CACHE_USE_CLONE === 'true',
  },

  // Rate Limiting
  rateLimit: {
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30'),
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true',
    skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS === 'true',
    store: process.env.RATE_LIMIT_STORE || 'redis',
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    webhookSecret: process.env.WEBHOOK_SECRET!,
    csrfSecret: process.env.CSRF_SECRET!,
    sessionSecret: process.env.SESSION_SECRET!,
    encryptionKey: process.env.ENCRYPTION_KEY!,
    forceHttps: process.env.FORCE_HTTPS === 'true',
  },

  // Monitoring
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    sentryDsn: process.env.SENTRY_DSN,
    metricsEnabled: process.env.METRICS_ENABLED === 'true',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
    healthCheckPort: parseInt(process.env.HEALTH_CHECK_PORT || '8080'),
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
  },

  // Performance
  performance: {
    maxConcurrentCommands: parseInt(process.env.MAX_CONCURRENT_COMMANDS || '100'),
    commandTimeout: parseInt(process.env.COMMAND_TIMEOUT || '30000'),
    memoryLimit: parseInt(process.env.MEMORY_LIMIT || '512'),
    cpuLimit: parseInt(process.env.CPU_LIMIT || '1'),
  },

  // Backup
  backup: {
    interval: parseInt(process.env.BACKUP_INTERVAL || '43200000'),
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '90'),
    compression: process.env.BACKUP_COMPRESSION === 'true',
    encryption: process.env.BACKUP_ENCRYPTION === 'true',
    storagePath: process.env.BACKUP_STORAGE_PATH || 'backups/',
    s3Bucket: process.env.BACKUP_S3_BUCKET,
    s3Region: process.env.BACKUP_S3_REGION,
  },

  // Feature Flags
  features: {
    musicEnabled: process.env.FEATURE_MUSIC_ENABLED === 'true',
    pubgEnabled: process.env.FEATURE_PUBG_ENABLED === 'true',
    dashboardEnabled: process.env.FEATURE_DASHBOARD_ENABLED === 'true',
    aiEnabled: process.env.FEATURE_AI_ENABLED === 'true',
    backupEnabled: process.env.FEATURE_BACKUP_ENABLED === 'true',
    monitoringEnabled: process.env.FEATURE_MONITORING_ENABLED === 'true',
  },

  // Graceful Shutdown
  shutdown: {
    timeout: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT || '30000'),
    sigtermTimeout: parseInt(process.env.SIGTERM_TIMEOUT || '15000'),
  },
};

// Validate required environment variables
const requiredVars = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DATABASE_URL',
  'JWT_SECRET',
  'WEBHOOK_SECRET',
  'SESSION_SECRET',
];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

export default productionConfig;
