import { CacheService } from '../services/cache.service';
import { Logger } from './logger';
import { EventEmitter } from 'events';

/**
 * Cache tier configuration
 */
export interface CacheTier {
  name: string;
  ttl: number;
  maxSize?: number;
  priority: number;
}

/**
 * Smart TTL configuration
 */
export interface SmartTTLConfig {
  baseTTL: number;
  accessFrequencyMultiplier: number;
  dataAgeMultiplier: number;
  maxTTL: number;
  minTTL: number;
}

/**
 * Cache invalidation rule
 */
export interface InvalidationRule {
  pattern: string;
  triggers: string[];
  dependencies?: string[];
  cascading?: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
  averageAccessTime: number;
  invalidations: number;
  refreshes: number;
  tierDistribution: Record<string, number>;
}

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  value: any;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  ttl: number;
  tier: string;
  size: number;
  dependencies: Set<string>;
  tags: Set<string>;
}

/**
 * Distributed cache with intelligent TTL and automatic invalidation
 */
export class DistributedCache extends EventEmitter {
  private readonly logger = new Logger();
  private readonly entries = new Map<string, CacheEntry>();
  private readonly dependencyMap = new Map<string, Set<string>>();
  private readonly tagMap = new Map<string, Set<string>>();
  private readonly invalidationRules: InvalidationRule[] = [];
  private readonly tiers: CacheTier[];
  private readonly smartTTLConfig: SmartTTLConfig;
  private stats: CacheStats;
  private cleanupInterval?: NodeJS.Timeout;
  private refreshInterval?: NodeJS.Timeout;

  constructor(
    private readonly cacheService: CacheService,
    options: {
      tiers: CacheTier[];
      smartTTLConfig: SmartTTLConfig;
      cleanupIntervalMs?: number;
      refreshIntervalMs?: number;
    },
  ) {
    super();
    this.tiers = options.tiers.sort((a, b) => a.priority - b.priority);
    this.smartTTLConfig = options.smartTTLConfig;
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalKeys: 0,
      memoryUsage: 0,
      averageAccessTime: 0,
      invalidations: 0,
      refreshes: 0,
      tierDistribution: {},
    };

    // Initialize tier distribution
    this.tiers.forEach(tier => {
      this.stats.tierDistribution[tier.name] = 0;
    });

    // Start background processes
    this.startCleanupProcess(options.cleanupIntervalMs || 60000); // 1 minute
    this.startRefreshProcess(options.refreshIntervalMs || 300000); // 5 minutes

    this.logger.info('Distributed cache initialized', {
      metadata: {
        tiers: this.tiers.length,
        smartTTL: true,
        autoInvalidation: true,
      },
    });
  }

  /**
   * Get value with intelligent caching
   */
  async get<T>(
    key: string,
    fallbackFn?: () => Promise<T>,
    options?: {
      tier?: string;
      dependencies?: string[];
      tags?: string[];
      forceRefresh?: boolean;
    },
  ): Promise<T | null> {
    const startTime = Date.now();

    try {
      // Check for force refresh
      if (options?.forceRefresh && fallbackFn) {
        const value = await fallbackFn();
        await this.set(key, value, options);
        return value;
      }

      // Try local cache first
      const localEntry = this.entries.get(key);
      if (localEntry && !this.isExpired(localEntry)) {
        this.updateAccessMetadata(localEntry);
        this.stats.hits++;
        this.updateStats(Date.now() - startTime);
        return localEntry.value;
      }

      // Try distributed cache
      const distributedValue = await this.cacheService.get<T>(key);
      if (distributedValue !== null) {
        // Update local cache
        const tier = this.selectTier(options?.tier);
        const ttl = this.calculateSmartTTL(key, tier.ttl);
        
        const entry: CacheEntry = {
          value: distributedValue,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          accessCount: 1,
          ttl,
          tier: tier.name,
          size: this.calculateSize(distributedValue),
          dependencies: new Set(options?.dependencies || []),
          tags: new Set(options?.tags || []),
        };

        this.entries.set(key, entry);
        this.updateDependencies(key, options?.dependencies || []);
        this.updateTags(key, options?.tags || []);

        this.stats.hits++;
        this.updateStats(Date.now() - startTime);
        return distributedValue;
      }

      // Cache miss - use fallback
      if (fallbackFn) {
        const value = await fallbackFn();
        await this.set(key, value, options);
        this.stats.misses++;
        this.updateStats(Date.now() - startTime);
        return value;
      }

      this.stats.misses++;
      this.updateStats(Date.now() - startTime);
      return null;

    } catch (error) {
      this.logger.error('Error getting cache value', {
        error: error as Error,
        metadata: { key, options },
      });
      
      // Try fallback on error
      if (fallbackFn) {
        try {
          return await fallbackFn();
        } catch (fallbackError) {
          this.logger.error('Fallback function failed', {
            error: fallbackError as Error,
            metadata: { key },
          });
        }
      }
      
      return null;
    }
  }

  /**
   * Set value with intelligent tiering
   */
  async set<T>(
    key: string,
    value: T,
    options?: {
      tier?: string;
      ttl?: number;
      dependencies?: string[];
      tags?: string[];
    },
  ): Promise<void> {
    try {
      const tier = this.selectTier(options?.tier);
      const ttl = options?.ttl || this.calculateSmartTTL(key, tier.ttl);
      const size = this.calculateSize(value);

      // Check tier capacity
      if (tier.maxSize && size > tier.maxSize) {
        throw new Error(`Value too large for tier ${tier.name}`);
      }

      // Create cache entry
      const entry: CacheEntry = {
        value,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 1,
        ttl,
        tier: tier.name,
        size,
        dependencies: new Set(options?.dependencies || []),
        tags: new Set(options?.tags || []),
      };

      // Store in local cache
      this.entries.set(key, entry);
      
      // Store in distributed cache
      await this.cacheService.set(key, value, ttl);

      // Update metadata
      this.updateDependencies(key, options?.dependencies || []);
      this.updateTags(key, options?.tags || []);
      this.stats.totalKeys++;
      this.stats.tierDistribution[tier.name]++;
      this.stats.memoryUsage += size;

      this.logger.debug('Cache entry set', {
        metadata: {
          key,
          tier: tier.name,
          ttl,
          size,
          dependencies: options?.dependencies?.length || 0,
          tags: options?.tags?.length || 0,
        },
      });

      this.emit('set', { key, value, tier: tier.name, ttl });

    } catch (error) {
      this.logger.error('Error setting cache value', {
        error: error as Error,
        metadata: { key, options },
      });
      throw error;
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<boolean> {
    try {
      const entry = this.entries.get(key);
      
      // Remove from local cache
      const localDeleted = this.entries.delete(key);
      
      // Remove from distributed cache
      const distributedDeleted = await this.cacheService.del(key);

      if (entry) {
        this.stats.totalKeys--;
        this.stats.tierDistribution[entry.tier]--;
        this.stats.memoryUsage -= entry.size;
        this.removeDependencies(key);
        this.removeTags(key);
      }

      const deleted = localDeleted || distributedDeleted;
      if (deleted) {
        this.emit('delete', { key });
      }

      return deleted;
    } catch (error) {
      this.logger.error('Error deleting cache entry', {
        error: error as Error,
        metadata: { key },
      });
      return false;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      let invalidated = 0;

      // Invalidate local cache
      for (const [key, entry] of this.entries.entries()) {
        if (this.matchesPattern(key, pattern)) {
          await this.delete(key);
          invalidated++;
        }
      }

      // Invalidate distributed cache
      const distributedKeys = await this.cacheService.keys(pattern);
      for (const key of distributedKeys) {
        await this.cacheService.del(key);
        if (!this.entries.has(key)) {
          invalidated++;
        }
      }

      this.stats.invalidations += invalidated;
      this.emit('invalidate', { pattern, count: invalidated });

      this.logger.debug('Cache pattern invalidated', {
        metadata: { pattern, invalidated },
      });

      return invalidated;
    } catch (error) {
      this.logger.error('Error invalidating cache pattern', {
        error: error as Error,
        metadata: { pattern },
      });
      return 0;
    }
  }

  /**
   * Invalidate by dependency
   */
  async invalidateByDependency(dependency: string): Promise<number> {
    const dependentKeys = this.dependencyMap.get(dependency) || new Set();
    let invalidated = 0;

    for (const key of dependentKeys) {
      if (await this.delete(key)) {
        invalidated++;
      }
    }

    this.stats.invalidations += invalidated;
    this.emit('invalidateDependency', { dependency, count: invalidated });

    return invalidated;
  }

  /**
   * Invalidate by tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    const taggedKeys = this.tagMap.get(tag) || new Set();
    let invalidated = 0;

    for (const key of taggedKeys) {
      if (await this.delete(key)) {
        invalidated++;
      }
    }

    this.stats.invalidations += invalidated;
    this.emit('invalidateTag', { tag, count: invalidated });

    return invalidated;
  }

  /**
   * Add invalidation rule
   */
  addInvalidationRule(rule: InvalidationRule): void {
    this.invalidationRules.push(rule);
    
    // Set up event listeners for triggers
    rule.triggers.forEach(trigger => {
      this.on(trigger, async (data: any) => {
        await this.invalidatePattern(rule.pattern);
        
        if (rule.cascading && rule.dependencies) {
          for (const dep of rule.dependencies) {
            await this.invalidateByDependency(dep);
          }
        }
      });
    });

    this.logger.debug('Invalidation rule added', {
      metadata: { pattern: rule.pattern, triggers: rule.triggers },
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.stats.hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) || 0;
    return { ...this.stats };
  }

  /**
   * Warm up cache with predefined data
   */
  async warmUp(entries: Array<{
    key: string;
    value: any;
    tier?: string;
    ttl?: number;
    dependencies?: string[];
    tags?: string[];
  }>): Promise<number> {
    let warmedUp = 0;

    for (const entry of entries) {
      try {
        await this.set(entry.key, entry.value, {
          tier: entry.tier,
          ttl: entry.ttl,
          dependencies: entry.dependencies,
          tags: entry.tags,
        });
        warmedUp++;
      } catch (error) {
        this.logger.warn('Failed to warm up cache entry', {
          error: error as Error,
          metadata: { key: entry.key },
        });
      }
    }

    this.logger.info('Cache warm-up completed', {
      metadata: { total: entries.length, successful: warmedUp },
    });

    return warmedUp;
  }

  /**
   * Cleanup expired entries
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.entries.entries()) {
      if (this.isExpired(entry, now)) {
        await this.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cache cleanup completed', {
        metadata: { cleaned },
      });
    }
  }

  /**
   * Refresh entries that are about to expire
   */
  private async refreshExpiring(): Promise<void> {
    const now = Date.now();
    let refreshed = 0;

    for (const [key, entry] of this.entries.entries()) {
      const timeToExpire = (entry.createdAt + entry.ttl * 1000) - now;
      const refreshThreshold = entry.ttl * 1000 * 0.2; // 20% of TTL

      if (timeToExpire <= refreshThreshold && timeToExpire > 0) {
        // Extend TTL for frequently accessed entries
        if (entry.accessCount > 5) {
          const newTTL = this.calculateSmartTTL(key, entry.ttl);
          entry.ttl = newTTL;
          entry.createdAt = now;
          await this.cacheService.expire(key, newTTL);
          refreshed++;
        }
      }
    }

    if (refreshed > 0) {
      this.stats.refreshes += refreshed;
      this.logger.debug('Cache refresh completed', {
        metadata: { refreshed },
      });
    }
  }

  /**
   * Calculate smart TTL based on access patterns
   */
  private calculateSmartTTL(key: string, baseTTL: number): number {
    const entry = this.entries.get(key);
    let ttl = baseTTL;

    if (entry) {
      // Increase TTL for frequently accessed items
      const accessFrequencyFactor = Math.min(
        entry.accessCount * this.smartTTLConfig.accessFrequencyMultiplier,
        3, // Max 3x multiplier
      );

      // Decrease TTL for old items
      const age = Date.now() - entry.createdAt;
      const ageFactor = Math.max(
        1 - (age / (24 * 60 * 60 * 1000)) * this.smartTTLConfig.dataAgeMultiplier,
        0.1, // Min 10% of original TTL
      );

      ttl = baseTTL * accessFrequencyFactor * ageFactor;
    }

    return Math.max(
      Math.min(ttl, this.smartTTLConfig.maxTTL),
      this.smartTTLConfig.minTTL,
    );
  }

  /**
   * Select appropriate cache tier
   */
  private selectTier(tierName?: string): CacheTier {
    if (tierName) {
      const tier = this.tiers.find(t => t.name === tierName);
      if (tier) {return tier;}
    }
    return this.tiers[0]; // Default to highest priority tier
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry, now: number = Date.now()): boolean {
    return now > entry.createdAt + entry.ttl * 1000;
  }

  /**
   * Update access metadata
   */
  private updateAccessMetadata(entry: CacheEntry): void {
    entry.lastAccessed = Date.now();
    entry.accessCount++;
  }

  /**
   * Update dependencies mapping
   */
  private updateDependencies(key: string, dependencies: string[]): void {
    dependencies.forEach(dep => {
      if (!this.dependencyMap.has(dep)) {
        this.dependencyMap.set(dep, new Set());
      }
      this.dependencyMap.get(dep)!.add(key);
    });
  }

  /**
   * Remove dependencies mapping
   */
  private removeDependencies(key: string): void {
    for (const [dep, keys] of this.dependencyMap.entries()) {
      keys.delete(key);
      if (keys.size === 0) {
        this.dependencyMap.delete(dep);
      }
    }
  }

  /**
   * Update tags mapping
   */
  private updateTags(key: string, tags: string[]): void {
    tags.forEach(tag => {
      if (!this.tagMap.has(tag)) {
        this.tagMap.set(tag, new Set());
      }
      this.tagMap.get(tag)!.add(key);
    });
  }

  /**
   * Remove tags mapping
   */
  private removeTags(key: string): void {
    for (const [tag, keys] of this.tagMap.entries()) {
      keys.delete(key);
      if (keys.size === 0) {
        this.tagMap.delete(tag);
      }
    }
  }

  /**
   * Calculate size of value
   */
  private calculateSize(value: any): number {
    return JSON.stringify(value).length;
  }

  /**
   * Check if key matches pattern
   */
  private matchesPattern(key: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(key);
  }

  /**
   * Update statistics
   */
  private updateStats(executionTime: number): void {
    this.stats.averageAccessTime = 
      (this.stats.averageAccessTime + executionTime) / 2;
  }

  /**
   * Start cleanup process
   */
  private startCleanupProcess(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(error => {
        this.logger.error('Cache cleanup failed', { error });
      });
    }, intervalMs);
  }

  /**
   * Start refresh process
   */
  private startRefreshProcess(intervalMs: number): void {
    this.refreshInterval = setInterval(() => {
      this.refreshExpiring().catch(error => {
        this.logger.error('Cache refresh failed', { error });
      });
    }, intervalMs);
  }

  /**
   * Shutdown cache
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.entries.clear();
    this.dependencyMap.clear();
    this.tagMap.clear();
    this.removeAllListeners();

    this.logger.info('Distributed cache shutdown completed');
  }
}

/**
 * Cache decorator for automatic caching
 */
export function CacheResult(
  options: {
    key?: string;
    ttl?: number;
    tier?: string;
    dependencies?: string[];
    tags?: string[];
  } = {},
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cache = (this as any).distributedCache as DistributedCache;
      if (!cache) {
        return await method.apply(this, args);
      }

      const cacheKey = options.key || `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;
      
      return await cache.get(
        cacheKey,
        () => method.apply(this, args),
        {
          tier: options.tier,
          dependencies: options.dependencies,
          tags: options.tags,
        },
      );
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
  } = {},
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      
      const cache = (this as any).distributedCache as DistributedCache;
      if (cache) {
        if (options.pattern) {
          await cache.invalidatePattern(options.pattern);
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