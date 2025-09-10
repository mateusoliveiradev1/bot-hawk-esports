import { createClient, RedisClientType, createCluster, RedisClusterType } from 'redis';
import { Logger, LogCategory } from '../utils/logger';
import { getCacheConfig, validateCacheConfig, CacheConfig } from '../config/cache.config';
import {
  getRedisProductionConfig,
  getRedisOptions,
  redisHealthCheckConfig,
  redisMonitoringConfig,
} from '../config/redis-production.config';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Cache statistics interface
 */
export interface CacheStats {
  redis: {
    connected: boolean;
    memory: string;
    keys: number;
    hits: number;
    misses: number;
    hitRate: number;
    avgResponseTime: number;
    slowQueries: number;
  };
  memory: {
    size: number;
    keys: number;
    maxSize: number;
    usage: number;
  };
  performance: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    avgOperationTime: number;
  };
}

/**
 * Cache operation result
 */
export interface CacheOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  source: 'redis' | 'memory' | 'none';
  responseTime: number;
}

/**
 * Optimized Cache Service for Production
 * Features: Redis clustering, compression, pipelining, advanced monitoring
 */
export class OptimizedCacheService {
  private client: RedisClientType | RedisClusterType | undefined;
  private logger: Logger;
  private config: CacheConfig;
  private isConnected: boolean = false;
  private memoryCache: Map<string, { value: any; expires: number; size: number }> = new Map();
  private memoryCacheSize: number = 0;
  private useMemoryFallback: boolean = false;
  private useMemoryOnly: boolean = false;

  // Performance tracking
  private stats = {
    hits: 0,
    misses: 0,
    operations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    responseTimes: [] as number[],
    slowQueries: 0,
  };

  // Pipeline support
  private pipeline: any[] = [];
  private pipelineTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.logger = new Logger();
    this.config = getCacheConfig();

    try {
      validateCacheConfig(this.config);
    } catch (error) {
      this.logger.error('Invalid cache configuration', {
        category: LogCategory.CACHE,
        error: error as Error,
      });
      throw error;
    }

    this.initializeClient();
    this.startMemoryCleanup();
    this.startMetricsCollection();
  }

  /**
   * Initialize Redis client (single instance or cluster)
   */
  private initializeClient(): void {
    if (!this.config.redis.url) {
      this.logger.warn('Redis URL not provided, using memory fallback only', {
        category: LogCategory.CACHE,
        metadata: { fallback: 'memory', reason: 'no_redis_url' },
      });
      this.useMemoryFallback = true;
      return;
    }

    try {
      if (
        this.config.performance.clustering.enabled &&
        this.config.performance.clustering.nodes.length > 0
      ) {
        // Redis Cluster
        this.client = createCluster({
          rootNodes: this.config.performance.clustering.nodes.map(node => ({ url: node })),
          defaults: this.config.redis.options,
          ...this.config.performance.clustering.options,
        });

        this.logger.info('Initialized Redis cluster client', {
          category: LogCategory.CACHE,
          metadata: {
            type: 'cluster',
            nodes: this.config.performance.clustering.nodes.length,
          },
        });
      } else {
        // Single Redis instance
        this.client = createClient({
          url: this.config.redis.url,
          ...this.config.redis.options,
        } as any);

        this.logger.info('Initialized Redis single client', {
          category: LogCategory.CACHE,
          metadata: { type: 'single', url: this.config.redis.url },
        });
      }

      this.setupEventListeners();
    } catch (error) {
      this.logger.error('Failed to initialize Redis client', {
        category: LogCategory.CACHE,
        error: error as Error,
      });
      this.useMemoryFallback = true;
    }
  }

  /**
   * Setup Redis event listeners
   */
  private setupEventListeners(): void {
    if (!this.client) {
      return;
    }

    this.client.on('connect', () => {
      this.logger.info('Redis client connected', {
        category: LogCategory.CACHE,
        metadata: { event: 'connect', status: 'connected' },
      });
    });

    this.client.on('ready', () => {
      this.logger.info('Redis client ready', {
        category: LogCategory.CACHE,
        metadata: { event: 'ready', status: 'ready' },
      });
      this.isConnected = true;
      this.useMemoryFallback = false;
    });

    this.client.on('error', error => {
      this.logger.error('Redis client error', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { event: 'error', status: 'error' },
      });
      this.isConnected = false;
      this.useMemoryFallback = true;
    });

    this.client.on('end', () => {
      this.logger.info('Redis client disconnected', {
        category: LogCategory.CACHE,
        metadata: { event: 'end', status: 'disconnected' },
      });
      this.isConnected = false;
      this.useMemoryFallback = true;
    });

    this.client.on('reconnecting', () => {
      this.logger.info('Redis client reconnecting', {
        category: LogCategory.CACHE,
        metadata: { event: 'reconnecting', status: 'reconnecting' },
      });
    });
  }

  /**
   * Connect to Redis with production-optimized settings
   */
  public async connect(): Promise<void> {
    if (!this.client) {
      this.logger.info('Cache service initialized with memory fallback only', {
        category: LogCategory.CACHE,
        metadata: { fallback: 'memory', reason: 'no_client' },
      });
      return;
    }

    try {
      // Get production Redis configuration
      const redisConfig = getRedisProductionConfig();
      const redisOptions = getRedisOptions(redisConfig);

      // Create Redis client with production-optimized settings
      this.client = createClient(redisOptions as any);

      // Setup event listeners
      this.setupRedisEventListeners();

      // Connect to Redis
      await this.client.connect();

      // Apply health check configuration
      if (redisHealthCheckConfig.enabled) {
        this.setupHealthChecks();
      }

      // Apply monitoring configuration
      if (redisMonitoringConfig.enabled) {
        this.setupRedisMonitoring();
      }

      this.isConnected = true;
      this.useMemoryOnly = false;

      this.logger.info('Connected to Redis successfully with production settings', {
        category: LogCategory.CACHE,
        metadata: {
          connection: 'redis',
          status: 'connected',
          healthCheck: redisHealthCheckConfig.enabled,
          monitoring: redisMonitoringConfig.enabled,
        },
      });
    } catch (error) {
      this.logger.warn('Redis not available, using memory fallback', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { fallback: 'memory', reason: 'connection_failed' },
      });
      this.useMemoryFallback = true;
      this.isConnected = false;
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    if (this.pipelineTimer) {
      clearTimeout(this.pipelineTimer);
      await this.flushPipeline();
    }

    if (this.client) {
      try {
        await this.client.disconnect();
        this.isConnected = false;
        this.logger.info('Disconnected from Redis successfully', {
          category: LogCategory.CACHE,
          metadata: { connection: 'redis', status: 'disconnected' },
        });
      } catch (error) {
        this.logger.error('Failed to disconnect from Redis', {
          category: LogCategory.CACHE,
          error: error as Error,
        });
      }
    }
  }

  /**
   * Set a value in cache with optimizations
   */
  public async set(key: string, value: any, ttl?: number): Promise<CacheOperationResult<void>> {
    const startTime = Date.now();
    this.stats.operations++;

    try {
      const effectiveTTL = ttl || this.getTTLForKey(key);
      let serializedValue = JSON.stringify(value);

      // Apply compression if enabled and value is large enough
      if (this.config.performance.compression && serializedValue.length > 1024) {
        const compressed = await gzip(Buffer.from(serializedValue));
        serializedValue = compressed.toString('base64');
        key = `compressed:${key}`;
      }

      if (this.client && this.isConnected) {
        if (this.config.performance.pipeline.enabled) {
          this.addToPipeline('setEx', [key, effectiveTTL, serializedValue]);
        } else {
          await this.client.setEx(key, effectiveTTL, serializedValue);
        }

        const responseTime = Date.now() - startTime;
        this.trackResponseTime(responseTime);
        this.stats.successfulOperations++;

        return {
          success: true,
          source: 'redis',
          responseTime,
        };
      } else {
        // Memory fallback
        this.setMemoryCache(key, value, effectiveTTL);
        const responseTime = Date.now() - startTime;
        this.stats.successfulOperations++;

        return {
          success: true,
          source: 'memory',
          responseTime,
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.stats.failedOperations++;

      this.logger.error('Failed to set cache key', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'set', key, ttl },
      });

      return {
        success: false,
        error: error as Error,
        source: 'none',
        responseTime,
      };
    }
  }

  /**
   * Get a value from cache with optimizations
   */
  public async get<T>(key: string): Promise<CacheOperationResult<T>> {
    const startTime = Date.now();
    this.stats.operations++;

    try {
      let value: string | null = null;
      let source: 'redis' | 'memory' | 'none' = 'none';

      if (this.client && this.isConnected) {
        // Try compressed key first
        const compressedKey = `compressed:${key}`;
        value = await this.client.get(compressedKey);

        if (value) {
          // Decompress
          const compressed = Buffer.from(value, 'base64');
          const decompressed = await gunzip(compressed);
          value = decompressed.toString();
        } else {
          // Try regular key
          value = await this.client.get(key);
        }

        source = 'redis';
      } else {
        // Memory fallback
        const memoryValue = this.getMemoryCache<T>(key);
        if (memoryValue !== null) {
          value = JSON.stringify(memoryValue);
          source = 'memory';
        }
      }

      const responseTime = Date.now() - startTime;
      this.trackResponseTime(responseTime);

      if (value !== null) {
        this.stats.hits++;
        this.stats.successfulOperations++;

        return {
          success: true,
          data: JSON.parse(value),
          source,
          responseTime,
        };
      } else {
        this.stats.misses++;
        this.stats.successfulOperations++;

        return {
          success: true,
          data: undefined,
          source: 'none',
          responseTime,
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.stats.failedOperations++;

      this.logger.error('Failed to get cache key', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'get', key },
      });

      return {
        success: false,
        error: error as Error,
        source: 'none',
        responseTime,
      };
    }
  }

  /**
   * Delete a key from cache
   */
  public async del(key: string): Promise<CacheOperationResult<boolean>> {
    const startTime = Date.now();
    this.stats.operations++;

    try {
      let deleted = false;

      if (this.client && this.isConnected) {
        const result = await this.client.del([key, `compressed:${key}`]);
        deleted = result > 0;
      }

      // Also delete from memory cache
      const memoryDeleted = this.deleteMemoryCache(key);
      deleted = deleted || memoryDeleted;

      const responseTime = Date.now() - startTime;
      this.trackResponseTime(responseTime);
      this.stats.successfulOperations++;

      return {
        success: true,
        data: deleted,
        source: this.client && this.isConnected ? 'redis' : 'memory',
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.stats.failedOperations++;

      return {
        success: false,
        error: error as Error,
        source: 'none',
        responseTime,
      };
    }
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<CacheStats> {
    const redisStats = await this.getRedisStats();
    const memoryStats = this.getMemoryStats();
    const performanceStats = this.getPerformanceStats();

    return {
      redis: redisStats,
      memory: memoryStats,
      performance: performanceStats,
    };
  }

  /**
   * Pipeline support - add operation to pipeline
   */
  private addToPipeline(command: string, args: any[]): void {
    this.pipeline.push({ command, args });

    if (this.pipeline.length >= this.config.performance.pipeline.batchSize) {
      this.flushPipeline();
    } else if (!this.pipelineTimer) {
      this.pipelineTimer = setTimeout(() => {
        this.flushPipeline();
      }, this.config.performance.pipeline.flushInterval);
    }
  }

  /**
   * Flush pipeline operations
   */
  private async flushPipeline(): Promise<void> {
    if (this.pipeline.length === 0) {
      return;
    }

    if (this.pipelineTimer) {
      clearTimeout(this.pipelineTimer);
      this.pipelineTimer = null;
    }

    try {
      if (this.client && this.isConnected) {
        const multi = (this.client as any).multi();

        for (const operation of this.pipeline) {
          multi[operation.command](...operation.args);
        }

        await multi.exec();
      }
    } catch (error) {
      this.logger.error('Pipeline flush failed', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operations: this.pipeline.length },
      });
    } finally {
      this.pipeline = [];
    }
  }

  /**
   * Get TTL for specific key type
   */
  private getTTLForKey(key: string): number {
    if (key.startsWith('user:')) {
      return this.config.ttl.user;
    }
    if (key.startsWith('guild:')) {
      return this.config.ttl.guild;
    }
    if (key.startsWith('pubg:player:')) {
      return this.config.ttl.pubgPlayer;
    }
    if (key.startsWith('pubg:stats:')) {
      return this.config.ttl.pubgStats;
    }
    if (key.startsWith('ranking:')) {
      return this.config.ttl.ranking;
    }
    if (key.startsWith('leaderboard:')) {
      return this.config.ttl.leaderboard;
    }
    if (key.startsWith('cooldown:')) {
      return this.config.ttl.cooldown;
    }
    if (key.startsWith('session:')) {
      return this.config.ttl.session;
    }
    if (key.startsWith('music:')) {
      return this.config.ttl.musicQueue;
    }
    if (key.startsWith('quiz:')) {
      return this.config.ttl.quiz;
    }
    if (key.startsWith('clip:')) {
      return this.config.ttl.clip;
    }
    if (key.startsWith('badge:')) {
      return this.config.ttl.badge;
    }

    return this.config.ttl.default;
  }

  /**
   * Track response time for monitoring
   */
  private trackResponseTime(responseTime: number): void {
    this.stats.responseTimes.push(responseTime);

    // Keep only last 1000 response times
    if (this.stats.responseTimes.length > 1000) {
      this.stats.responseTimes = this.stats.responseTimes.slice(-1000);
    }

    // Track slow queries
    if (responseTime > this.config.monitoring.slowQueryThreshold) {
      this.stats.slowQueries++;
    }
  }

  /**
   * Memory cache operations
   */
  private setMemoryCache(key: string, value: any, ttl: number): void {
    const expires = Date.now() + ttl * 1000;
    const serialized = JSON.stringify(value);
    const size = Buffer.byteLength(serialized, 'utf8');

    // Check memory limit
    const maxSizeBytes = this.config.memory.maxSize * 1024 * 1024;
    if (this.memoryCacheSize + size > maxSizeBytes) {
      this.evictMemoryCache();
    }

    this.memoryCache.set(key, { value, expires, size });
    this.memoryCacheSize += size;
  }

  private getMemoryCache<T>(key: string): T | null {
    const item = this.memoryCache.get(key);
    if (!item) {
      return null;
    }

    if (Date.now() > item.expires) {
      this.memoryCache.delete(key);
      this.memoryCacheSize -= item.size;
      return null;
    }

    return item.value;
  }

  private deleteMemoryCache(key: string): boolean {
    const item = this.memoryCache.get(key);
    if (item) {
      this.memoryCache.delete(key);
      this.memoryCacheSize -= item.size;
      return true;
    }
    return false;
  }

  /**
   * Evict memory cache items (LRU-like)
   */
  private evictMemoryCache(): void {
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].expires - b[1].expires);

    // Remove oldest 25% of entries
    const toRemove = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < toRemove; i++) {
      const [key, item] = entries[i];
      this.memoryCache.delete(key);
      this.memoryCacheSize -= item.size;
    }
  }

  /**
   * Start memory cleanup interval
   */
  private startMemoryCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.memoryCache.entries()) {
        if (now > item.expires) {
          this.memoryCache.delete(key);
          this.memoryCacheSize -= item.size;
        }
      }
    }, this.config.memory.checkPeriod * 1000);
  }

  /**
   * Setup Redis event listeners
   */
  private setupRedisEventListeners(): void {
    if (!this.client) {
      return;
    }

    this.client.on('connect', () => {
      this.logger.info('Redis client connected', {
        category: LogCategory.CACHE,
      });
    });

    this.client.on('ready', () => {
      this.logger.info('Redis client ready', {
        category: LogCategory.CACHE,
      });
      this.isConnected = true;
      this.useMemoryOnly = false;
    });

    this.client.on('error', error => {
      this.logger.error('Redis client error', {
        category: LogCategory.CACHE,
        error: error as Error,
      });
      this.isConnected = false;
      this.useMemoryOnly = true;
    });

    this.client.on('close', () => {
      this.logger.warn('Redis client connection closed', {
        category: LogCategory.CACHE,
      });
      this.isConnected = false;
      this.useMemoryOnly = true;
    });

    this.client.on('reconnecting', () => {
      this.logger.info('Redis client reconnecting', {
        category: LogCategory.CACHE,
      });
    });
  }

  /**
   * Setup Redis health checks
   */
  private setupHealthChecks(): void {
    setInterval(async () => {
      if (this.client && this.isConnected) {
        try {
          await (this.client as any).ping();
        } catch (error) {
          this.logger.error('Redis health check failed', {
            category: LogCategory.CACHE,
            error: error as Error,
          });
          this.isConnected = false;
          this.useMemoryOnly = true;
        }
      }
    }, redisHealthCheckConfig.interval);
  }

  /**
   * Setup Redis monitoring
   */
  private setupRedisMonitoring(): void {
    setInterval(async () => {
      if (this.client && this.isConnected) {
        try {
          const info = await (this.client as any).info();
          this.logger.debug('Redis monitoring info', {
            category: LogCategory.CACHE,
            metadata: { info },
          });
        } catch (error) {
          this.logger.error('Redis monitoring failed', {
            category: LogCategory.CACHE,
            error: error as Error,
          });
        }
      }
    }, redisMonitoringConfig.interval);
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    if (!this.config.monitoring.enabled) {
      return;
    }

    setInterval(async () => {
      try {
        const stats = await this.getStats();

        this.logger.info('Cache metrics', {
          category: LogCategory.CACHE,
          metadata: {
            redis: stats.redis,
            memory: stats.memory,
            performance: stats.performance,
          },
        });

        // Check memory warning threshold
        if (stats.memory.usage > this.config.monitoring.memoryWarningThreshold) {
          this.logger.warn('Memory cache usage high', {
            category: LogCategory.CACHE,
            metadata: {
              usage: stats.memory.usage,
              threshold: this.config.monitoring.memoryWarningThreshold,
            },
          });
        }
      } catch (error) {
        this.logger.error('Failed to collect cache metrics', {
          category: LogCategory.CACHE,
          error: error as Error,
        });
      }
    }, this.config.monitoring.metricsInterval);
  }

  /**
   * Get Redis statistics
   */
  private async getRedisStats(): Promise<CacheStats['redis']> {
    if (!this.client || !this.isConnected) {
      return {
        connected: false,
        memory: '0B',
        keys: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        avgResponseTime: 0,
        slowQueries: 0,
      };
    }

    try {
      const info = await (this.client as any).info('memory');
      const keyspace = await (this.client as any).info('keyspace');
      const stats = await (this.client as any).info('stats');

      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const keysMatch = keyspace.match(/keys=(\d+)/);
      const hitsMatch = stats.match(/keyspace_hits:(\d+)/);
      const missesMatch = stats.match(/keyspace_misses:(\d+)/);

      const hits = hitsMatch ? parseInt(hitsMatch[1]) : 0;
      const misses = missesMatch ? parseInt(missesMatch[1]) : 0;
      const total = hits + misses;

      return {
        connected: true,
        memory: memoryMatch ? memoryMatch[1] : '0B',
        keys: keysMatch ? parseInt(keysMatch[1]) : 0,
        hits,
        misses,
        hitRate: total > 0 ? (hits / total) * 100 : 0,
        avgResponseTime: this.getAverageResponseTime(),
        slowQueries: this.stats.slowQueries,
      };
    } catch (error) {
      return {
        connected: false,
        memory: '0B',
        keys: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        avgResponseTime: 0,
        slowQueries: 0,
      };
    }
  }

  /**
   * Get memory cache statistics
   */
  private getMemoryStats(): CacheStats['memory'] {
    const maxSizeBytes = this.config.memory.maxSize * 1024 * 1024;

    return {
      size: this.memoryCacheSize,
      keys: this.memoryCache.size,
      maxSize: maxSizeBytes,
      usage: (this.memoryCacheSize / maxSizeBytes) * 100,
    };
  }

  /**
   * Get performance statistics
   */
  private getPerformanceStats(): CacheStats['performance'] {
    return {
      totalOperations: this.stats.operations,
      successfulOperations: this.stats.successfulOperations,
      failedOperations: this.stats.failedOperations,
      avgOperationTime: this.getAverageResponseTime(),
    };
  }

  /**
   * Calculate average response time
   */
  private getAverageResponseTime(): number {
    if (this.stats.responseTimes.length === 0) {
      return 0;
    }

    const sum = this.stats.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.stats.responseTimes.length;
  }

  /**
   * Key generators for consistent cache keys
   */
  public keyGenerators = {
    user: (userId: string) => `user:${userId}`,
    guild: (guildId: string) => `guild:${guildId}`,
    pubgPlayer: (playerId: string) => `pubg:player:${playerId}`,
    pubgStats: (playerId: string, seasonId: string, gameMode: string) =>
      `pubg:stats:${playerId}:${seasonId}:${gameMode}`,
    ranking: (type: string, period: string, guildId?: string) =>
      guildId ? `ranking:${type}:${period}:${guildId}` : `ranking:${type}:${period}`,
    leaderboard: (type: string, guildId?: string) =>
      guildId ? `leaderboard:${type}:${guildId}` : `leaderboard:${type}`,
    cooldown: (userId: string, commandName: string) => `cooldown:${userId}:${commandName}`,
    session: (sessionId: string) => `session:${sessionId}`,
    musicQueue: (guildId: string) => `music:queue:${guildId}`,
    quiz: (quizId: string) => `quiz:${quizId}`,
    clip: (clipId: string) => `clip:${clipId}`,
    badge: (badgeId: string) => `badge:${badgeId}`,
  };
}
