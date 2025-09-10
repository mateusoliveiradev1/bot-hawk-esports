import { createClient, RedisClientType } from 'redis';
import { Logger, LogCategory } from '../utils/logger';

/**
 * Cache service using Redis for high-performance data caching with in-memory fallback
 */
export class CacheService {
  private client: RedisClientType | undefined;
  private logger: Logger;
  private isConnected: boolean = false;
  private defaultTTL: number = 3600; // 1 hour in seconds
  private memoryCache: Map<string, { value: any; expires: number }> = new Map();
  private useMemoryFallback: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private healthCheckInterval?: NodeJS.Timeout;
  private connectionRetryTimeout?: NodeJS.Timeout;
  private lastHealthCheck: number = 0;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor() {
    this.logger = new Logger();

    // Only initialize Redis client if REDIS_URL is provided
    if (process.env.REDIS_URL) {
      this.initializeRedisClient();
      this.startHealthCheck();
    } else {
      this.logger.info('Redis URL not provided, using memory fallback only', {
        category: LogCategory.CACHE,
        metadata: { fallback: 'memory', reason: 'no_redis_url' },
      });
      this.useMemoryFallback = true;
      this.isConnected = false;
    }
  }

  /**
   * Initialize Redis client with improved configuration
   */
  private initializeRedisClient(): void {
    this.client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: retries => {
          this.reconnectAttempts = retries;
          if (retries > this.maxReconnectAttempts) {
            this.logger.error('Redis reconnection failed after maximum attempts', {
              category: LogCategory.CACHE,
              metadata: { attempts: retries, maxAttempts: this.maxReconnectAttempts },
            });
            this.useMemoryFallback = true;
            return new Error('Redis reconnection failed');
          }
          const delay = Math.min(retries * 100, 3000); // Max 3 seconds
          this.logger.warn(`Redis reconnection attempt ${retries}/${this.maxReconnectAttempts} in ${delay}ms`, {
            category: LogCategory.CACHE,
            metadata: { attempt: retries, delay },
          });
          return delay;
        },
        connectTimeout: 10000, // 10 seconds
      },
    });
    this.setupEventListeners();
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    // Check Redis health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000);
  }

  /**
   * Perform Redis health check
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.client) {return;}

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      this.lastHealthCheck = Date.now();
      
      if (!this.isConnected) {
        this.logger.info('Redis health check passed - connection restored', {
          category: LogCategory.CACHE,
          metadata: { latency, status: 'healthy' },
        });
        this.isConnected = true;
        this.useMemoryFallback = false;
        this.reconnectAttempts = 0;
      }
      
      // Log performance metrics
      if (latency > 1000) {
        this.logger.warn('Redis high latency detected', {
          category: LogCategory.CACHE,
          metadata: { latency, threshold: 1000 },
        });
      }
    } catch (error) {
      if (this.isConnected) {
        this.logger.error('Redis health check failed', {
          category: LogCategory.CACHE,
          error: error as Error,
          metadata: { status: 'unhealthy' },
        });
        this.isConnected = false;
        this.useMemoryFallback = true;
      }
    }
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    if (this.connectionRetryTimeout) {
      clearTimeout(this.connectionRetryTimeout);
      this.connectionRetryTimeout = undefined;
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
    });

    this.client.on('error', error => {
      this.logger.error('Redis client error', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { event: 'error', status: 'error' },
      });
      this.isConnected = false;
    });

    this.client.on('end', () => {
      this.logger.info('Redis client disconnected', {
        category: LogCategory.CACHE,
        metadata: { event: 'end', status: 'disconnected' },
      });
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      this.logger.info('Redis client reconnecting', {
        category: LogCategory.CACHE,
        metadata: { event: 'reconnecting', status: 'reconnecting' },
      });
    });
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    // If Redis client wasn't initialized, skip connection
    if (!this.client) {
      this.logger.info('Cache service initialized with memory fallback only', {
        category: LogCategory.CACHE,
        metadata: { fallback: 'memory', reason: 'no_client' },
      });
      return;
    }

    try {
      await this.client.connect();
      this.logger.info('Connected to Redis successfully', {
        category: LogCategory.CACHE,
        metadata: { connection: 'redis', status: 'connected' },
      });
      this.useMemoryFallback = false;
    } catch (error) {
      this.logger.warn('Redis not available, using in-memory cache fallback', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { fallback: 'memory', reason: 'connection_failed' },
      });
      this.useMemoryFallback = true;
      this.isConnected = false;
      // Don't throw error, continue with memory fallback
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    // Stop health monitoring
    this.stopHealthCheck();
    
    if (!this.client) {
      return;
    }

    try {
      await this.client.disconnect();
      this.isConnected = false;
      this.logger.info('Disconnected from Redis successfully', {
        category: LogCategory.CACHE,
        metadata: { 
          connection: 'redis', 
          status: 'disconnected',
          finalStats: {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: this.getHitRate(),
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to disconnect from Redis', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { connection: 'redis', status: 'disconnect_failed' },
      });
      throw error;
    }
  }

  /**
   * Get current cache hit rate
   */
  public getHitRate(): string {
    const total = this.cacheHits + this.cacheMisses;
    if (total === 0) {return '0%';}
    return `${((this.cacheHits / total) * 100).toFixed(2)}%`;
  }

  /**
   * Get cache performance metrics
   */
  public getPerformanceMetrics(): {
    hits: number;
    misses: number;
    hitRate: string;
    isConnected: boolean;
    useMemoryFallback: boolean;
    lastHealthCheck: number;
    reconnectAttempts: number;
  } {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: this.getHitRate(),
      isConnected: this.isConnected,
      useMemoryFallback: this.useMemoryFallback,
      lastHealthCheck: this.lastHealthCheck,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Check if Redis is connected
   */
  public isRedisConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Set a value in cache
   */
  public async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      // Use memory fallback silently
      this.setMemoryCache(key, value, ttl);
      return;
    }

    try {
      const serializedValue = JSON.stringify(value);
      const expiration = ttl || this.defaultTTL;

      await this.client.setEx(key, expiration, serializedValue);

      this.logger.debug('Cache key set successfully', {
        category: LogCategory.CACHE,
        metadata: { operation: 'set', key, ttl: expiration, size: serializedValue.length },
      });
    } catch (error) {
      this.logger.error('Failed to set cache key', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'set', key, ttl: ttl || this.defaultTTL },
      });
      this.isConnected = false;
      // Don't throw error to prevent breaking the application
    }
  }

  /**
   * Get a value from cache
   */
  public async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      // Use memory fallback silently
      const result = this.getMemoryCache<T>(key);
      if (result !== null) {
        this.cacheHits++;
      } else {
        this.cacheMisses++;
      }
      return result;
    }

    try {
      const value = await this.client.get(key);

      if (value === null) {
        this.cacheMisses++;
        this.logger.debug('Cache miss', {
          category: LogCategory.CACHE,
          metadata: { operation: 'get', key, hit: false },
        });
        return null;
      }

      this.cacheHits++;
      const parsedValue = JSON.parse(value) as T;
      this.logger.debug('Cache hit', {
        category: LogCategory.CACHE,
        metadata: { operation: 'get', key, hit: true },
      });
      return parsedValue;
    } catch (error) {
      this.cacheMisses++;
      this.logger.error('Failed to get cache key', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'get', key },
      });
      this.isConnected = false;
      // Fallback to memory cache
      return this.getMemoryCache<T>(key);
    }
  }

  /**
   * Delete a key from cache
   */
  public async del(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      // Use memory fallback silently
      return this.deleteMemoryCache(key);
    }

    try {
      const result = await this.client.del(key);
      this.logger.debug('Cache key deleted', {
        category: LogCategory.CACHE,
        metadata: { operation: 'del', key, success: result > 0 },
      });
      return result > 0;
    } catch (error) {
      this.logger.error('Failed to delete cache key', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'del', key },
      });
      return false;
    }
  }

  /**
   * Check if a key exists in cache
   */
  public async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      // Use memory fallback silently
      return this.existsMemoryCache(key);
    }

    try {
      const result = await this.client.exists(key);
      this.logger.debug('Cache key existence check', {
        category: LogCategory.CACHE,
        metadata: { operation: 'exists', key, exists: result === 1 },
      });
      return result === 1;
    } catch (error) {
      this.logger.error('Failed to check if key exists', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'exists', key },
      });
      return false;
    }
  }

  /**
   * Set expiration time for a key
   */
  public async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.expire(key, ttl);
      this.logger.debug('Cache key expiration set', {
        category: LogCategory.CACHE,
        metadata: { operation: 'expire', key, ttl, success: result },
      });
      return result;
    } catch (error) {
      this.logger.error('Failed to set expiration for cache key', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'expire', key, ttl },
      });
      return false;
    }
  }

  /**
   * Get time to live for a key
   */
  public async ttl(key: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      return -1;
    }

    try {
      const ttl = await this.client.ttl(key);
      this.logger.debug('Cache key TTL retrieved', {
        category: LogCategory.CACHE,
        metadata: { operation: 'ttl', key, ttl },
      });
      return ttl;
    } catch (error) {
      this.logger.error('Failed to get TTL for cache key', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'ttl', key },
      });
      return -1;
    }
  }

  /**
   * Increment a numeric value
   */
  public async incr(key: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available');
    }

    try {
      const result = await this.client.incr(key);
      this.logger.debug('Cache key incremented', {
        category: LogCategory.CACHE,
        metadata: { operation: 'incr', key, value: result },
      });
      return result;
    } catch (error) {
      this.logger.error('Failed to increment cache key', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'incr', key },
      });
      throw error;
    }
  }

  /**
   * Decrement a numeric value
   */
  public async decr(key: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available');
    }

    try {
      const result = await this.client.decr(key);
      this.logger.debug('Cache key decremented', {
        category: LogCategory.CACHE,
        metadata: { operation: 'decr', key, value: result },
      });
      return result;
    } catch (error) {
      this.logger.error('Failed to decrement cache key', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'decr', key },
      });
      throw error;
    }
  }

  /**
   * Get multiple keys at once
   */
  public async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!this.client || !this.isConnected) {
      // Use memory fallback silently
      return keys.map(key => this.getMemoryCache<T>(key));
    }

    try {
      const values = await this.client.mGet(keys);
      let hits = 0;
      const result = values.map((value, index) => {
        if (value === null) {
          return null;
        }
        try {
          hits++;
          return JSON.parse(value) as T;
        } catch (parseError) {
          this.logger.error('Failed to parse cached value', {
            category: LogCategory.CACHE,
            error: parseError as Error,
            metadata: { operation: 'mget', key: keys[index], parseError: true },
          });
          return null;
        }
      });

      this.logger.debug('Multiple cache keys retrieved', {
        category: LogCategory.CACHE,
        metadata: { operation: 'mget', keysCount: keys.length, hits, hitRate: hits / keys.length },
      });
      return result;
    } catch (error) {
      this.logger.error('Failed to get multiple cache keys', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'mget', keysCount: keys.length },
      });
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  public async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      // Use memory fallback silently
      for (const [key, value] of Object.entries(keyValuePairs)) {
        this.setMemoryCache(key, value, ttl);
      }
      return;
    }

    try {
      const serializedPairs: string[] = [];
      let totalSize = 0;

      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serializedValue = JSON.stringify(value);
        serializedPairs.push(key, serializedValue);
        totalSize += serializedValue.length;
      }

      await this.client.mSet(serializedPairs);

      // Set TTL for all keys if specified
      if (ttl) {
        const promises = Object.keys(keyValuePairs).map(key => this.client!.expire(key, ttl));
        await Promise.all(promises);
      }

      this.logger.debug('Multiple cache keys set successfully', {
        category: LogCategory.CACHE,
        metadata: {
          operation: 'mset',
          keysCount: Object.keys(keyValuePairs).length,
          ttl: ttl || this.defaultTTL,
          totalSize,
        },
      });
    } catch (error) {
      this.logger.error('Failed to set multiple cache keys', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: {
          operation: 'mset',
          keysCount: Object.keys(keyValuePairs).length,
          ttl: ttl || this.defaultTTL,
        },
      });
      this.isConnected = false;
      // Don't throw error to prevent breaking the application
    }
  }

  /**
   * Get all keys matching a pattern
   */
  public async keys(pattern: string): Promise<string[]> {
    if (!this.client || !this.isConnected) {
      return [];
    }

    try {
      const keys = await this.client.keys(pattern);
      this.logger.debug('Cache keys retrieved by pattern', {
        category: LogCategory.CACHE,
        metadata: { operation: 'keys', pattern, count: keys.length },
      });
      return keys;
    } catch (error) {
      this.logger.error('Failed to get keys with pattern', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'keys', pattern },
      });
      return [];
    }
  }

  /**
   * Clear all keys matching a pattern
   */
  public async clearPattern(pattern: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      return 0;
    }

    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client.del(keys);
      this.logger.info('Cache keys cleared by pattern', {
        category: LogCategory.CACHE,
        metadata: { operation: 'clearPattern', pattern, keysCleared: result },
      });
      return result;
    } catch (error) {
      this.logger.error('Failed to clear cache pattern', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'clearPattern', pattern },
      });
      return 0;
    }
  }

  /**
   * Flush all cache data
   */
  public async flushAll(): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      await this.client.flushAll();
      this.logger.warn('All cache data has been flushed', {
        category: LogCategory.CACHE,
        metadata: { operation: 'flushAll', status: 'completed' },
      });
    } catch (error) {
      this.logger.error('Failed to flush all cache data', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'flushAll', status: 'failed' },
      });
      throw error;
    }
  }

  /**
   * Cleanup expired keys and optimize memory
   */
  public async cleanup(): Promise<void> {
    if (!this.client || !this.isConnected) {
      // Clean memory cache silently
      this.cleanupMemoryCache();
      return;
    }

    try {
      // Clear expired keys patterns
      const patterns = ['temp:*', 'session:*', 'cooldown:*'];
      let totalDeleted = 0;

      for (const pattern of patterns) {
        const deleted = await this.clearPattern(pattern);
        totalDeleted += deleted;
      }

      this.logger.info('Cache cleanup completed', {
        category: LogCategory.CACHE,
        metadata: { operation: 'cleanup', keysDeleted: totalDeleted, status: 'completed' },
      });
    } catch (error) {
      this.logger.error('Error during cache cleanup', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'cleanup', status: 'failed' },
      });
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<{
    keys: number;
    memory: string;
    hits: string;
    misses: string;
    hitRate: string;
  }> {
    if (!this.client || !this.isConnected) {
      return {
        keys: 0,
        memory: '0',
        hits: '0',
        misses: '0',
        hitRate: '0%',
      };
    }

    try {
      const info = await this.client.info('stats');
      const keyspace = await this.client.info('keyspace');

      // Parse info string to extract statistics
      const stats = {
        keys: 0,
        memory: '0',
        hits: '0',
        misses: '0',
        hitRate: '0%',
      };

      // Extract key count from keyspace info
      const keyspaceMatch = keyspace.match(/keys=(\d+)/);
      if (keyspaceMatch && keyspaceMatch[1]) {
        stats.keys = parseInt(keyspaceMatch[1]);
      }

      // Extract hit/miss statistics
      const hitsMatch = info.match(/keyspace_hits:(\d+)/);
      const missesMatch = info.match(/keyspace_misses:(\d+)/);

      if (hitsMatch && hitsMatch[1]) {
        stats.hits = hitsMatch[1];
      }
      if (missesMatch && missesMatch[1]) {
        stats.misses = missesMatch[1];
      }

      // Calculate hit rate
      const hits = parseInt(stats.hits);
      const misses = parseInt(stats.misses);
      const total = hits + misses;

      if (total > 0) {
        stats.hitRate = `${((hits / total) * 100).toFixed(2)}%`;
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to get cache statistics', {
        category: LogCategory.CACHE,
        error: error as Error,
        metadata: { operation: 'getStats', status: 'failed' },
      });
      return {
        keys: 0,
        memory: '0',
        hits: '0',
        misses: '0',
        hitRate: '0%',
      };
    }
  }

  /**
   * Cache key generators for different data types
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

  /**
   * Memory cache fallback methods
   */
  private setMemoryCache(key: string, value: any, ttl?: number): void {
    const expires = Date.now() + (ttl || this.defaultTTL) * 1000;
    this.memoryCache.set(key, { value, expires });
  }

  private getMemoryCache<T>(key: string): T | null {
    const cached = this.memoryCache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expires) {
      this.memoryCache.delete(key);
      return null;
    }

    return cached.value as T;
  }

  private deleteMemoryCache(key: string): boolean {
    return this.memoryCache.delete(key);
  }

  private existsMemoryCache(key: string): boolean {
    const cached = this.memoryCache.get(key);
    if (!cached) {
      return false;
    }

    if (Date.now() > cached.expires) {
      this.memoryCache.delete(key);
      return false;
    }

    return true;
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.memoryCache.entries()) {
      if (now > cached.expires) {
        this.memoryCache.delete(key);
      }
    }
  }
}
