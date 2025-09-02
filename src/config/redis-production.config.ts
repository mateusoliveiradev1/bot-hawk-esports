// Redis client options type removed - using any for compatibility

/**
 * Redis Production Configuration
 * Optimized settings for production environment
 */
export interface RedisProductionConfig {
  // Connection settings
  url: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  
  // Connection pool settings
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  enableReadyCheck: boolean;
  
  // Performance settings
  lazyConnect: boolean;
  keepAlive: number;
  connectTimeout: number;
  commandTimeout: number;
  
  // Cluster settings (if using Redis Cluster)
  enableOfflineQueue: boolean;
  readOnly: boolean;
  
  // Memory optimization
  keyPrefix: string;
  compression: boolean;
  
  // Monitoring
  showFriendlyErrorStack: boolean;
}

/**
 * Default Redis configuration for production
 */
export const defaultRedisProductionConfig: RedisProductionConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Retry settings - more aggressive for production
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  
  // Performance optimizations
  lazyConnect: true, // Don't connect until first command
  keepAlive: 30000, // 30 seconds
  connectTimeout: 10000, // 10 seconds
  commandTimeout: 5000, // 5 seconds
  
  // Queue settings
  enableOfflineQueue: false, // Fail fast in production
  readOnly: false,
  
  // Memory optimization
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'hawk:',
  compression: true,
  
  // Monitoring
  showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
};

/**
 * Get Redis options for ioredis client
 */
export function getRedisOptions(config: RedisProductionConfig): any {
  const options: any = {
    socket: {
      host: config.host,
      port: config.port,
      connectTimeout: config.connectTimeout,
      keepAlive: config.keepAlive,
      family: 4,
    },
    password: config.password,
    database: config.db,
    
    // Connection settings
    commandsQueueMaxLength: config.maxRetriesPerRequest,
    
    // Error handling
    name: 'hawk-bot-redis',
  };
  
  // If URL is provided, parse it
  if (config.url && config.url !== 'redis://localhost:6379') {
    const url = new URL(config.url);
    if (options.socket) {
      options.socket.host = url.hostname;
      options.socket.port = parseInt(url.port) || 6379;
    }
    if (url.password) {
      options.password = url.password;
    }
    if (url.pathname && url.pathname !== '/') {
      options.database = parseInt(url.pathname.slice(1)) || 0;
    }
  }
  
  return options;
}

/**
 * Validate Redis configuration
 */
export function validateRedisConfig(config: RedisProductionConfig): void {
  if (!config.url && !config.host) {
    throw new Error('Redis URL or host must be provided');
  }
  
  if (config.port && (config.port < 1 || config.port > 65535)) {
    throw new Error('Redis port must be between 1 and 65535');
  }
  
  if (config.db && (config.db < 0 || config.db > 15)) {
    throw new Error('Redis database must be between 0 and 15');
  }
  
  if (config.connectTimeout < 1000) {
    console.warn('Redis connect timeout is very low, consider increasing it');
  }
  
  if (config.commandTimeout < 1000) {
    console.warn('Redis command timeout is very low, consider increasing it');
  }
}

/**
 * Get Redis configuration with environment overrides
 */
export function getRedisProductionConfig(): RedisProductionConfig {
  const config = { ...defaultRedisProductionConfig };
  
  // Override with environment variables
  if (process.env.REDIS_URL) {
    config.url = process.env.REDIS_URL;
  }
  
  if (process.env.REDIS_HOST) {
    config.host = process.env.REDIS_HOST;
  }
  
  if (process.env.REDIS_PORT) {
    config.port = parseInt(process.env.REDIS_PORT);
  }
  
  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }
  
  if (process.env.REDIS_DB) {
    config.db = parseInt(process.env.REDIS_DB);
  }
  
  if (process.env.REDIS_KEY_PREFIX) {
    config.keyPrefix = process.env.REDIS_KEY_PREFIX;
  }
  
  if (process.env.REDIS_CONNECT_TIMEOUT) {
    config.connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT);
  }
  
  if (process.env.REDIS_COMMAND_TIMEOUT) {
    config.commandTimeout = parseInt(process.env.REDIS_COMMAND_TIMEOUT);
  }
  
  if (process.env.REDIS_MAX_RETRIES) {
    config.maxRetriesPerRequest = parseInt(process.env.REDIS_MAX_RETRIES);
  }
  
  if (process.env.REDIS_COMPRESSION === 'false') {
    config.compression = false;
  }
  
  // Validate configuration
  validateRedisConfig(config);
  
  return config;
}

/**
 * Redis health check configuration
 */
export const redisHealthCheckConfig = {
  // Enable health checks
  enabled: process.env.REDIS_HEALTH_CHECK !== 'false',
  
  // Health check interval
  interval: parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds
  
  // Ping timeout
  pingTimeout: 2000,
  
  // Memory usage threshold (in bytes)
  memoryThreshold: 1024 * 1024 * 1024, // 1GB
  
  // Connection count threshold
  connectionThreshold: 100,
  
  // Keyspace hit ratio threshold (percentage)
  hitRatioThreshold: 0.8, // 80%
  
  // Evicted keys threshold per second
  evictedKeysThreshold: 10,
  
  // Expired keys threshold per second
  expiredKeysThreshold: 100,
};

/**
 * Redis monitoring configuration
 */
export const redisMonitoringConfig = {
  // Enable monitoring
  enabled: process.env.REDIS_MONITORING !== 'false',
  
  // Monitoring interval
  interval: parseInt(process.env.REDIS_MONITORING_INTERVAL || '60000'), // 60 seconds
  
  // Metrics collection interval
  metricsInterval: 30000, // 30 seconds
  
  // Slow log threshold (microseconds)
  slowLogThreshold: 10000, // 10ms
  
  // Alert thresholds
  alerts: {
    // Memory usage alert threshold (percentage)
    memoryUsage: 85,
    
    // Connection count alert threshold
    connectionCount: 80,
    
    // Hit ratio alert threshold (percentage)
    hitRatio: 70,
    
    // Command latency alert threshold (ms)
    commandLatency: 50,
    
    // Evicted keys per second alert threshold
    evictedKeys: 5,
  },
};