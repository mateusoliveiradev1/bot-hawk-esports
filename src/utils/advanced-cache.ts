import { CacheService } from '../services/cache.service';
import { Logger } from './logger';
import { RateLimiter, RateLimitConfig } from './rate-limiter';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './error-handler';

/**
 * Cache strategy types
 */
export enum CacheStrategy {
  WRITE_THROUGH = 'write_through',
  WRITE_BEHIND = 'write_behind',
  WRITE_AROUND = 'write_around',
  READ_THROUGH = 'read_through',
  REFRESH_AHEAD = 'refresh_ahead',
}

/**
 * Cache invalidation patterns
 */
export enum InvalidationPattern {
  TTL = 'ttl',
  LRU = 'lru',
  DEPENDENCY = 'dependency',
  EVENT_BASED = 'event_based',
}

/**
 * Advanced cache configuration
 */
export interface AdvancedCacheConfig {
  strategy: CacheStrategy;
  invalidationPattern: InvalidationPattern;
  defaultTTL: number;
  maxSize?: number;
  enableCompression?: boolean;
  enableEncryption?: boolean;
  enableMetrics?: boolean;
  rateLimitConfig?: RateLimitConfig;
  refreshThreshold?: number; // Percentage of TTL when to refresh
  backgroundRefresh?: boolean;
}

/**
 * Cache entry metadata
 */
interface CacheEntryMetadata {
  key: string;
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  ttl: number;
  size: number;
  dependencies?: string[];
  tags?: string[];
}

/**
 * Cache metrics interface
 */
export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  totalSize: number;
  averageAccessTime: number;
  evictions: number;
  refreshes: number;
}

/**
 * Cache operation result
 */
export interface CacheOperationResult<T> {
  success: boolean;
  data?: T;
  fromCache: boolean;
  executionTime: number;
  error?: Error;
}

/**
 * Advanced cache wrapper with enhanced features
 */
export class AdvancedCache {
  private readonly logger = new Logger();
  private readonly errorHandler = new ErrorHandler();
  private readonly metadata = new Map<string, CacheEntryMetadata>();
  private readonly dependencies = new Map<string, Set<string>>();
  private readonly tags = new Map<string, Set<string>>();
  private readonly refreshQueue = new Set<string>();
  private readonly rateLimiter?: RateLimiter;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalKeys: 0,
    totalSize: 0,
    averageAccessTime: 0,
    evictions: 0,
    refreshes: 0,
  };

  constructor(
    private readonly cacheService: CacheService,
    private readonly config: AdvancedCacheConfig
  ) {
    if (config.rateLimitConfig) {
      this.rateLimiter = new RateLimiter(config.rateLimitConfig);
    }

    // Start background refresh if enabled
    if (config.backgroundRefresh) {
      this.startBackgroundRefresh();
    }
  }

  /**
   * Get value with advanced caching logic
   */
  async get<T>(
    key: string,
    fallbackFn?: () => Promise<T>,
    options?: {
      ttl?: number;
      dependencies?: string[];
      tags?: string[];
      forceRefresh?: boolean;
    }
  ): Promise<CacheOperationResult<T>> {
    const startTime = Date.now();

    try {
      // Check rate limit
      if (this.rateLimiter && !this.rateLimiter.checkLimit(key).allowed) {
        throw this.errorHandler.createError(
          'Cache operation rate limited',
          ErrorCategory.RATE_LIMIT,
          ErrorSeverity.LOW,
          { key }
        );
      }

      // Check if force refresh is requested
      if (options?.forceRefresh && fallbackFn) {
        return await this.refreshAndCache(key, fallbackFn, options);
      }

      // Try to get from cache
      const cached = await this.cacheService.get<T>(key);
      const metadata = this.metadata.get(key);

      if (cached !== null && metadata) {
        // Update access metadata
        metadata.lastAccessed = new Date();
        metadata.accessCount++;
        this.metadata.set(key, metadata);

        // Check if refresh is needed (refresh-ahead strategy)
        if (this.shouldRefresh(metadata) && fallbackFn) {
          this.scheduleRefresh(key, fallbackFn, options);
        }

        this.metrics.hits++;
        const executionTime = Date.now() - startTime;
        this.updateAverageAccessTime(executionTime);

        return {
          success: true,
          data: cached,
          fromCache: true,
          executionTime,
        };
      }

      // Cache miss - use fallback if available
      if (fallbackFn) {
        this.metrics.misses++;
        return await this.refreshAndCache(key, fallbackFn, options);
      }

      this.metrics.misses++;
      return {
        success: false,
        fromCache: false,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const enhancedError = this.errorHandler.handleError(error as Error, {
        operation: 'cache_get',
        key,
        options,
      });

      return {
        success: false,
        fromCache: false,
        executionTime: Date.now() - startTime,
        error: enhancedError,
      };
    }
  }

  /**
   * Set value with advanced caching logic
   */
  async set<T>(
    key: string,
    value: T,
    options?: {
      ttl?: number;
      dependencies?: string[];
      tags?: string[];
      strategy?: CacheStrategy;
    }
  ): Promise<CacheOperationResult<T>> {
    const startTime = Date.now();

    try {
      const ttl = options?.ttl || this.config.defaultTTL;
      const strategy = options?.strategy || this.config.strategy;

      // Apply caching strategy
      switch (strategy) {
        case CacheStrategy.WRITE_THROUGH:
          await this.writeThrough(key, value, ttl);
          break;
        case CacheStrategy.WRITE_BEHIND:
          await this.writeBehind(key, value, ttl);
          break;
        case CacheStrategy.WRITE_AROUND:
          // Don't cache, just return
          return {
            success: true,
            data: value,
            fromCache: false,
            executionTime: Date.now() - startTime,
          };
        default:
          await this.cacheService.set(key, value, ttl);
      }

      // Store metadata
      const metadata: CacheEntryMetadata = {
        key,
        createdAt: new Date(),
        lastAccessed: new Date(),
        accessCount: 0,
        ttl,
        size: this.calculateSize(value),
        dependencies: options?.dependencies,
        tags: options?.tags,
      };

      this.metadata.set(key, metadata);

      // Handle dependencies
      if (options?.dependencies) {
        this.addDependencies(key, options.dependencies);
      }

      // Handle tags
      if (options?.tags) {
        this.addTags(key, options.tags);
      }

      this.updateMetrics();

      return {
        success: true,
        data: value,
        fromCache: false,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const enhancedError = this.errorHandler.handleError(error as Error, {
        operation: 'cache_set',
        key,
        options,
      });

      return {
        success: false,
        fromCache: false,
        executionTime: Date.now() - startTime,
        error: enhancedError,
      };
    }
  }

  /**
   * Invalidate cache entries by key pattern
   */
  async invalidate(pattern: string): Promise<number> {
    try {
      const keys = await this.cacheService.keys(pattern);
      let invalidated = 0;

      for (const key of keys) {
        await this.cacheService.del(key);
        this.metadata.delete(key);
        this.removeDependencies(key);
        this.removeTags(key);
        invalidated++;
      }

      this.metrics.evictions += invalidated;
      this.updateMetrics();

      this.logger.debug(`Invalidated ${invalidated} cache entries`, {
        metadata: {
          pattern,
          invalidated,
        },
      });

      return invalidated;
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        operation: 'cache_invalidate',
        pattern,
      });
      return 0;
    }
  }

  /**
   * Invalidate by dependency
   */
  async invalidateByDependency(dependency: string): Promise<number> {
    const dependentKeys = this.dependencies.get(dependency);
    if (!dependentKeys) {
      return 0;
    }

    let invalidated = 0;
    for (const key of dependentKeys) {
      await this.cacheService.del(key);
      this.metadata.delete(key);
      this.removeDependencies(key);
      this.removeTags(key);
      invalidated++;
    }

    this.dependencies.delete(dependency);
    this.metrics.evictions += invalidated;
    this.updateMetrics();

    return invalidated;
  }

  /**
   * Invalidate by tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    const taggedKeys = this.tags.get(tag);
    if (!taggedKeys) {
      return 0;
    }

    let invalidated = 0;
    for (const key of taggedKeys) {
      await this.cacheService.del(key);
      this.metadata.delete(key);
      this.removeDependencies(key);
      this.removeTags(key);
      invalidated++;
    }

    this.tags.delete(tag);
    this.metrics.evictions += invalidated;
    this.updateMetrics();

    return invalidated;
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Warm up cache with predefined data
   */
  async warmUp(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<number> {
    let warmed = 0;

    for (const entry of entries) {
      try {
        await this.set(entry.key, entry.value, { ttl: entry.ttl });
        warmed++;
      } catch (error) {
        this.logger.warn(`Failed to warm up cache key: ${entry.key}`, { metadata: { error } });
      }
    }

    this.logger.info(`Cache warm-up completed: ${warmed}/${entries.length} entries`);
    return warmed;
  }

  /**
   * Refresh cache entry
   */
  private async refreshAndCache<T>(
    key: string,
    fallbackFn: () => Promise<T>,
    options?: {
      ttl?: number;
      dependencies?: string[];
      tags?: string[];
    }
  ): Promise<CacheOperationResult<T>> {
    const startTime = Date.now();

    try {
      const data = await fallbackFn();
      await this.set(key, data, options);
      this.metrics.refreshes++;

      return {
        success: true,
        data,
        fromCache: false,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const enhancedError = this.errorHandler.handleError(error as Error, {
        operation: 'cache_refresh',
        key,
        options,
      });

      return {
        success: false,
        fromCache: false,
        executionTime: Date.now() - startTime,
        error: enhancedError,
      };
    }
  }

  /**
   * Check if entry should be refreshed (refresh-ahead strategy)
   */
  private shouldRefresh(metadata: CacheEntryMetadata): boolean {
    if (!this.config.refreshThreshold) {
      return false;
    }

    const age = Date.now() - metadata.createdAt.getTime();
    const refreshPoint = metadata.ttl * 1000 * (this.config.refreshThreshold / 100);

    return age >= refreshPoint;
  }

  /**
   * Schedule background refresh
   */
  private scheduleRefresh<T>(key: string, fallbackFn: () => Promise<T>, options?: any): void {
    if (this.refreshQueue.has(key)) {
      return; // Already scheduled
    }

    this.refreshQueue.add(key);

    // Schedule refresh in next tick to avoid blocking
    setImmediate(async () => {
      try {
        await this.refreshAndCache(key, fallbackFn, options);
      } catch (error) {
        this.logger.warn(`Background refresh failed for key: ${key}`, { metadata: { error } });
      } finally {
        this.refreshQueue.delete(key);
      }
    });
  }

  /**
   * Write-through strategy implementation
   */
  private async writeThrough<T>(key: string, value: T, ttl: number): Promise<void> {
    // Write to cache immediately
    await this.cacheService.set(key, value, ttl);
  }

  /**
   * Write-behind strategy implementation
   */
  private async writeBehind<T>(key: string, value: T, ttl: number): Promise<void> {
    // Schedule write for later (simplified implementation)
    setImmediate(async () => {
      try {
        await this.cacheService.set(key, value, ttl);
      } catch (error) {
        this.logger.warn(`Write-behind failed for key: ${key}`, { metadata: { error } });
      }
    });
  }

  /**
   * Add dependencies for a cache key
   */
  private addDependencies(key: string, dependencies: string[]): void {
    for (const dep of dependencies) {
      if (!this.dependencies.has(dep)) {
        this.dependencies.set(dep, new Set());
      }
      this.dependencies.get(dep)!.add(key);
    }
  }

  /**
   * Remove dependencies for a cache key
   */
  private removeDependencies(key: string): void {
    for (const [dep, keys] of this.dependencies.entries()) {
      keys.delete(key);
      if (keys.size === 0) {
        this.dependencies.delete(dep);
      }
    }
  }

  /**
   * Add tags for a cache key
   */
  private addTags(key: string, tags: string[]): void {
    for (const tag of tags) {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set());
      }
      this.tags.get(tag)!.add(key);
    }
  }

  /**
   * Remove tags for a cache key
   */
  private removeTags(key: string): void {
    for (const [tag, keys] of this.tags.entries()) {
      keys.delete(key);
      if (keys.size === 0) {
        this.tags.delete(tag);
      }
    }
  }

  /**
   * Calculate approximate size of value
   */
  private calculateSize(value: any): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  /**
   * Update cache metrics
   */
  private updateMetrics(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? (this.metrics.hits / total) * 100 : 0;
    this.metrics.totalKeys = this.metadata.size;
    this.metrics.totalSize = Array.from(this.metadata.values()).reduce(
      (sum, meta) => sum + meta.size,
      0
    );
  }

  /**
   * Update average access time
   */
  private updateAverageAccessTime(executionTime: number): void {
    const currentAvg = this.metrics.averageAccessTime;
    const totalOperations = this.metrics.hits + this.metrics.misses;

    this.metrics.averageAccessTime =
      (currentAvg * (totalOperations - 1) + executionTime) / totalOperations;
  }

  /**
   * Start background refresh process
   */
  private startBackgroundRefresh(): void {
    setInterval(() => {
      this.performBackgroundMaintenance();
    }, 60000); // Every minute
  }

  /**
   * Perform background maintenance tasks
   */
  private async performBackgroundMaintenance(): Promise<void> {
    try {
      // Clean up expired metadata
      const now = Date.now();
      for (const [key, metadata] of this.metadata.entries()) {
        const expiry = metadata.createdAt.getTime() + metadata.ttl * 1000;
        if (now > expiry) {
          this.metadata.delete(key);
          this.removeDependencies(key);
          this.removeTags(key);
        }
      }

      // Update metrics
      this.updateMetrics();

      this.logger.debug('Background cache maintenance completed', {
        metadata: {
          totalKeys: this.metrics.totalKeys,
          hitRate: this.metrics.hitRate,
        },
      });
    } catch (error) {
      this.logger.warn('Background cache maintenance failed', { metadata: { error } });
    }
  }
}

/**
 * Cache decorator for automatic caching of method results
 */
export function Cacheable(
  options: {
    ttl?: number;
    keyGenerator?: (...args: any[]) => string;
    dependencies?: string[];
    tags?: string[];
  } = {}
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cache = (this as any).cache as AdvancedCache;
      if (!cache) {
        return method.apply(this, args);
      }

      const key = options.keyGenerator
        ? options.keyGenerator(...args)
        : `${target.constructor.name}.${propertyName}:${JSON.stringify(args)}`;

      const result = await cache.get(key, () => method.apply(this, args), {
        ttl: options.ttl,
        dependencies: options.dependencies,
        tags: options.tags,
      });

      if (result.success) {
        return result.data;
      }

      throw result.error || new Error('Cache operation failed');
    };

    return descriptor;
  };
}

/**
 * Cache invalidation decorator
 */
export function InvalidateCache(
  options: {
    pattern?: string;
    dependencies?: string[];
    tags?: string[];
  } = {}
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);

      const cache = (this as any).cache as AdvancedCache;
      if (cache) {
        if (options.pattern) {
          await cache.invalidate(options.pattern);
        }
        if (options.dependencies) {
          for (const dep of options.dependencies) {
            await cache.invalidateByDependency(dep);
          }
        }
        if (options.tags) {
          for (const tag of options.tags) {
            await cache.invalidateByTag(tag);
          }
        }
      }

      return result;
    };

    return descriptor;
  };
}
