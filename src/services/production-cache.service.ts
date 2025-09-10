import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { productionConfig } from '../config/production.config';
import { productionLogger, createLogContext } from '../utils/production-logger';
import { LogCategory } from '../utils/logger';
import { productionMonitoring } from './production-monitoring.service';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compress?: boolean;
  serialize?: boolean;
  namespace?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  totalKeys: number;
  memoryUsage: number;
}

class ProductionCacheService extends EventEmitter {
  private redis: Redis | null = null;
  private fallbackCache: Map<string, { value: any; expires: number }> = new Map();
  private isRedisConnected = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    totalKeys: 0,
    memoryUsage: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeRedis();
    this.setupFallbackCleanup();
  }

  private async initializeRedis(): Promise<void> {
    try {
      if (!productionConfig.redis.url) {
        productionLogger.warn(
          'Redis URL not provided, using memory fallback',
          createLogContext(LogCategory.CACHE),
        );
        return;
      }

      this.redis = new Redis(productionConfig.redis.url, {
        maxRetriesPerRequest: productionConfig.redis.retryAttempts,
        connectTimeout: productionConfig.redis.connectionTimeout,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        keyPrefix: 'hawk:',
      });

      this.redis.on('connect', () => {
        this.isRedisConnected = true;
        productionLogger.info('Redis connected successfully', createLogContext(LogCategory.CACHE));
      });

      this.redis.on('error', error => {
        this.isRedisConnected = false;
        this.stats.errors++;
        productionLogger.error(
          'Redis connection error',
          createLogContext(LogCategory.CACHE, { error }),
        );

        productionMonitoring.createAlert('warning', 'redis', 'Redis connection error', {
          error: error.message,
        });
      });

      this.redis.on('close', () => {
        this.isRedisConnected = false;
        productionLogger.warn('Redis connection closed', createLogContext(LogCategory.CACHE));
      });

      this.redis.on('reconnecting', () => {
        productionLogger.info('Redis reconnecting...', createLogContext(LogCategory.CACHE));
      });

      // Test connection
      await this.redis.connect();
      await this.redis.ping();
    } catch (error) {
      this.isRedisConnected = false;
      productionLogger.error(
        'Failed to initialize Redis',
        createLogContext(LogCategory.CACHE, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
    }
  }

  private setupFallbackCleanup(): void {
    // Clean up expired keys from fallback cache every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, item] of this.fallbackCache.entries()) {
        if (item.expires < now) {
          this.fallbackCache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        productionLogger.debug(
          `Cleaned ${cleaned} expired keys from fallback cache`,
          createLogContext(LogCategory.CACHE),
        );
      }
    }, 300000); // 5 minutes
  }

  private generateKey(key: string, namespace?: string): string {
    const prefix = namespace ? `${namespace}:` : '';
    return `${prefix}${key}`;
  }

  private serialize(value: any): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      productionLogger.error(
        'Failed to serialize cache value',
        createLogContext(LogCategory.CACHE, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      throw error;
    }
  }

  private deserialize(value: string): any {
    try {
      return JSON.parse(value);
    } catch (error) {
      productionLogger.error(
        'Failed to deserialize cache value',
        createLogContext(LogCategory.CACHE, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      return value; // Return as string if JSON parsing fails
    }
  }

  async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const fullKey = this.generateKey(key, options.namespace);
    const startTime = Date.now();

    try {
      let value: string | null = null;

      if (this.isRedisConnected && this.redis) {
        value = await this.redis.get(fullKey);
      } else {
        // Fallback to memory cache
        const item = this.fallbackCache.get(fullKey);
        if (item && item.expires > Date.now()) {
          value = item.value;
        } else if (item) {
          this.fallbackCache.delete(fullKey);
        }
      }

      const duration = Date.now() - startTime;

      if (value !== null) {
        this.stats.hits++;
        productionMonitoring.incrementCounter('cacheHits');

        productionLogger.debug(
          `Cache hit: ${key}`,
          createLogContext(LogCategory.CACHE, {
            duration,
            metadata: { key: fullKey },
          }),
        );

        return options.serialize !== false ? this.deserialize(value) : (value as T);
      } else {
        this.stats.misses++;
        productionMonitoring.incrementCounter('cacheMisses');

        productionLogger.debug(
          `Cache miss: ${key}`,
          createLogContext(LogCategory.CACHE, {
            duration,
            metadata: { key: fullKey },
          }),
        );

        return null;
      }
    } catch (error) {
      this.stats.errors++;
      productionLogger.error(
        `Cache get error: ${key}`,
        createLogContext(LogCategory.CACHE, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      return null;
    }
  }

  async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.generateKey(key, options.namespace);
    const ttl = options.ttl || productionConfig.cache.ttl;
    const startTime = Date.now();

    try {
      const serializedValue = options.serialize !== false ? this.serialize(value) : value;

      if (this.isRedisConnected && this.redis) {
        await this.redis.setex(fullKey, ttl, serializedValue);
      } else {
        // Fallback to memory cache
        this.fallbackCache.set(fullKey, {
          value: serializedValue,
          expires: Date.now() + ttl * 1000,
        });

        // Limit memory cache size
        if (this.fallbackCache.size > productionConfig.cache.maxKeys) {
          const firstKey = this.fallbackCache.keys().next().value;
          this.fallbackCache.delete(firstKey);
        }
      }

      this.stats.sets++;
      const duration = Date.now() - startTime;

      productionLogger.debug(
        `Cache set: ${key}`,
        createLogContext(LogCategory.CACHE, {
          duration,
          metadata: { key: fullKey, ttl },
        }),
      );

      return true;
    } catch (error) {
      this.stats.errors++;
      productionLogger.error(
        `Cache set error: ${key}`,
        createLogContext(LogCategory.CACHE, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      return false;
    }
  }

  async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.generateKey(key, options.namespace);
    const startTime = Date.now();

    try {
      if (this.isRedisConnected && this.redis) {
        const result = await this.redis.del(fullKey);
        this.stats.deletes++;

        const duration = Date.now() - startTime;
        productionLogger.debug(
          `Cache delete: ${key}`,
          createLogContext(LogCategory.CACHE, {
            duration,
            metadata: { key: fullKey, deleted: result > 0 },
          }),
        );

        return result > 0;
      } else {
        const deleted = this.fallbackCache.delete(fullKey);
        this.stats.deletes++;

        const duration = Date.now() - startTime;
        productionLogger.debug(
          `Cache delete: ${key}`,
          createLogContext(LogCategory.CACHE, {
            duration,
            metadata: { key: fullKey, deleted },
          }),
        );

        return deleted;
      }
    } catch (error) {
      this.stats.errors++;
      productionLogger.error(
        `Cache delete error: ${key}`,
        createLogContext(LogCategory.CACHE, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      return false;
    }
  }

  async clear(namespace?: string): Promise<boolean> {
    try {
      if (this.isRedisConnected && this.redis) {
        if (namespace) {
          const pattern = this.generateKey('*', namespace);
          const keys = await this.redis.keys(pattern);
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        } else {
          await this.redis.flushdb();
        }
      } else {
        if (namespace) {
          const prefix = `${namespace}:`;
          for (const key of this.fallbackCache.keys()) {
            if (key.startsWith(prefix)) {
              this.fallbackCache.delete(key);
            }
          }
        } else {
          this.fallbackCache.clear();
        }
      }

      productionLogger.info(
        `Cache cleared${namespace ? ` for namespace: ${namespace}` : ''}`,
        createLogContext(LogCategory.CACHE),
      );

      return true;
    } catch (error) {
      this.stats.errors++;
      productionLogger.error(
        'Cache clear error',
        createLogContext(LogCategory.CACHE, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      return false;
    }
  }

  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.generateKey(key, options.namespace);

    try {
      if (this.isRedisConnected && this.redis) {
        const result = await this.redis.exists(fullKey);
        return result === 1;
      } else {
        const item = this.fallbackCache.get(fullKey);
        if (item && item.expires > Date.now()) {
          return true;
        } else if (item) {
          this.fallbackCache.delete(fullKey);
        }
        return false;
      }
    } catch (error) {
      this.stats.errors++;
      productionLogger.error(
        `Cache exists error: ${key}`,
        createLogContext(LogCategory.CACHE, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      return false;
    }
  }

  async getStats(): Promise<CacheStats> {
    try {
      if (this.isRedisConnected && this.redis) {
        const info = await this.redis.info('memory');
        const memoryMatch = info.match(/used_memory:(\d+)/);
        const keysMatch = info.match(/keys=(\d+)/);

        this.stats.memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;
        this.stats.totalKeys = keysMatch ? parseInt(keysMatch[1]) : 0;
      } else {
        this.stats.totalKeys = this.fallbackCache.size;
        this.stats.memoryUsage = JSON.stringify([...this.fallbackCache.entries()]).length;
      }
    } catch (error) {
      productionLogger.error(
        'Failed to get cache stats',
        createLogContext(LogCategory.CACHE, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
    }

    return { ...this.stats };
  }

  isConnected(): boolean {
    return this.isRedisConnected;
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy' | 'degraded'; message?: string }> {
    try {
      if (this.isRedisConnected && this.redis) {
        const startTime = Date.now();
        await this.redis.ping();
        const responseTime = Date.now() - startTime;

        if (responseTime > 1000) {
          return { status: 'degraded', message: `High latency: ${responseTime}ms` };
        }
        return { status: 'healthy' };
      } else {
        return { status: 'degraded', message: 'Using memory fallback' };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    this.fallbackCache.clear();
    this.isRedisConnected = false;

    productionLogger.info(
      'Production cache service shutdown completed',
      createLogContext(LogCategory.CACHE),
    );
  }

  // Utility methods for common caching patterns
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  async mget<T = any>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
    const results: (T | null)[] = [];

    for (const key of keys) {
      results.push(await this.get<T>(key, options));
    }

    return results;
  }

  async mset(
    items: Array<{ key: string; value: any }>,
    options: CacheOptions = {},
  ): Promise<boolean[]> {
    const results: boolean[] = [];

    for (const item of items) {
      results.push(await this.set(item.key, item.value, options));
    }

    return results;
  }
}

// Export singleton instance
export const productionCache = new ProductionCacheService();
export default productionCache;
