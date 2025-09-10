import { RedisClientOptions } from 'redis';

/**
 * Cache configuration for production environment
 * Optimized Redis settings for high performance and reliability
 */
export interface CacheConfig {
  redis: {
    url: string;
    options: any;
    pool: {
      min: number;
      max: number;
    };
    connectionTimeout: number;
    commandTimeout: number;
    retryAttempts: number;
    retryDelay: number;
    lazyConnect: boolean;
    keepAlive: number;
    family: number;
  };
  memory: {
    maxSize: number;
    ttl: number;
    checkPeriod: number;
    useClone: boolean;
    deleteOnExpire: boolean;
  };
  performance: {
    compression: boolean;
    serialization: 'json' | 'msgpack';
    pipeline: {
      enabled: boolean;
      batchSize: number;
      flushInterval: number;
    };
    clustering: {
      enabled: boolean;
      nodes: string[];
      options: any;
    };
  };
  ttl: {
    default: number;
    user: number;
    guild: number;
    pubgPlayer: number;
    pubgStats: number;
    ranking: number;
    leaderboard: number;
    cooldown: number;
    session: number;
    musicQueue: number;
    quiz: number;
    clip: number;
    badge: number;
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    slowQueryThreshold: number;
    memoryWarningThreshold: number;
  };
}

/**
 * Default cache configuration for production
 */
export const defaultCacheConfig: CacheConfig = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    options: {
      socket: {
        connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT || '10000'),
        commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
        lazyConnect: true,
        keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE || '30000'),
        family: parseInt(process.env.REDIS_FAMILY || '4'), // IPv4
        reconnectStrategy: (retries: number) => {
          const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES || '10');
          if (retries > maxRetries) {
            return new Error(`Redis reconnection failed after ${maxRetries} attempts`);
          }
          // Exponential backoff with jitter
          const delay = Math.min(retries * 100, 3000) + Math.random() * 1000;
          return delay;
        },
      },
      database: parseInt(process.env.REDIS_DATABASE || '0'),
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
    },
    pool: {
      min: parseInt(process.env.REDIS_POOL_MIN || '5'),
      max: parseInt(process.env.REDIS_POOL_MAX || '20'),
    },
    connectionTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT || '10000'),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000'),
    lazyConnect: process.env.REDIS_LAZY_CONNECT !== 'false',
    keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE || '30000'),
    family: parseInt(process.env.REDIS_FAMILY || '4'),
  },
  memory: {
    maxSize: parseInt(process.env.MEMORY_CACHE_MAX_SIZE || '100'), // MB
    ttl: parseInt(process.env.MEMORY_CACHE_TTL || '300'), // 5 minutes
    checkPeriod: parseInt(process.env.MEMORY_CACHE_CHECK_PERIOD || '60'), // 1 minute
    useClone: process.env.MEMORY_CACHE_USE_CLONE === 'true',
    deleteOnExpire: process.env.MEMORY_CACHE_DELETE_ON_EXPIRE !== 'false',
  },
  performance: {
    compression: process.env.CACHE_COMPRESSION === 'true',
    serialization: (process.env.CACHE_SERIALIZATION as 'json' | 'msgpack') || 'json',
    pipeline: {
      enabled: process.env.CACHE_PIPELINE_ENABLED === 'true',
      batchSize: parseInt(process.env.CACHE_PIPELINE_BATCH_SIZE || '100'),
      flushInterval: parseInt(process.env.CACHE_PIPELINE_FLUSH_INTERVAL || '10'),
    },
    clustering: {
      enabled: process.env.REDIS_CLUSTER_ENABLED === 'true',
      nodes: process.env.REDIS_CLUSTER_NODES?.split(',') || [],
      options: {
        enableReadyCheck: false,
        redisOptions: {
          password: process.env.REDIS_PASSWORD,
        },
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
      },
    },
  },
  ttl: {
    default: parseInt(process.env.CACHE_TTL_DEFAULT || '3600'), // 1 hour
    user: parseInt(process.env.CACHE_TTL_USER || '1800'), // 30 minutes
    guild: parseInt(process.env.CACHE_TTL_GUILD || '3600'), // 1 hour
    pubgPlayer: parseInt(process.env.CACHE_TTL_PUBG_PLAYER || '7200'), // 2 hours
    pubgStats: parseInt(process.env.CACHE_TTL_PUBG_STATS || '1800'), // 30 minutes
    ranking: parseInt(process.env.CACHE_TTL_RANKING || '900'), // 15 minutes
    leaderboard: parseInt(process.env.CACHE_TTL_LEADERBOARD || '600'), // 10 minutes
    cooldown: parseInt(process.env.CACHE_TTL_COOLDOWN || '300'), // 5 minutes
    session: parseInt(process.env.CACHE_TTL_SESSION || '86400'), // 24 hours
    musicQueue: parseInt(process.env.CACHE_TTL_MUSIC_QUEUE || '3600'), // 1 hour
    quiz: parseInt(process.env.CACHE_TTL_QUIZ || '1800'), // 30 minutes
    clip: parseInt(process.env.CACHE_TTL_CLIP || '7200'), // 2 hours
    badge: parseInt(process.env.CACHE_TTL_BADGE || '3600'), // 1 hour
  },
  monitoring: {
    enabled: process.env.CACHE_MONITORING_ENABLED === 'true',
    metricsInterval: parseInt(process.env.CACHE_METRICS_INTERVAL || '60000'), // 1 minute
    slowQueryThreshold: parseInt(process.env.CACHE_SLOW_QUERY_THRESHOLD || '100'), // 100ms
    memoryWarningThreshold: parseInt(process.env.CACHE_MEMORY_WARNING_THRESHOLD || '80'), // 80%
  },
};

/**
 * Get cache configuration with environment overrides
 */
export function getCacheConfig(): CacheConfig {
  return {
    ...defaultCacheConfig,
    // Allow runtime overrides
    redis: {
      ...defaultCacheConfig.redis,
      url: process.env.REDIS_URL || defaultCacheConfig.redis.url,
    },
  };
}

/**
 * Validate cache configuration
 */
export function validateCacheConfig(config: CacheConfig): void {
  const errors: string[] = [];

  // Validate Redis URL
  if (!config.redis.url) {
    errors.push('Redis URL is required');
  }

  // Validate pool settings
  if (config.redis.pool.min < 1) {
    errors.push('Redis pool minimum must be at least 1');
  }

  if (config.redis.pool.max < config.redis.pool.min) {
    errors.push('Redis pool maximum must be greater than or equal to minimum');
  }

  // Validate timeouts
  if (config.redis.connectionTimeout < 1000) {
    errors.push('Redis connection timeout must be at least 1000ms');
  }

  if (config.redis.commandTimeout < 100) {
    errors.push('Redis command timeout must be at least 100ms');
  }

  // Validate memory cache settings
  if (config.memory.maxSize < 10) {
    errors.push('Memory cache max size must be at least 10MB');
  }

  if (config.memory.ttl < 60) {
    errors.push('Memory cache TTL must be at least 60 seconds');
  }

  // Validate TTL settings
  Object.entries(config.ttl).forEach(([key, value]) => {
    if (value < 60) {
      errors.push(`TTL for ${key} must be at least 60 seconds`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Cache configuration validation failed:\n${errors.join('\n')}`);
  }
}

export default getCacheConfig;
