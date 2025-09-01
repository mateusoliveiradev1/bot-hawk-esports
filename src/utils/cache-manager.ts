import { DistributedCache, CacheTier, SmartTTLConfig, InvalidationRule } from './distributed-cache';
import { CacheService } from '../services/cache.service';
import { Logger } from './logger';
import { EventEmitter } from 'events';

/**
 * Cache configuration presets
 */
export const CACHE_PRESETS = {
  // High-frequency, short-lived data
  REALTIME: {
    tiers: [
      { name: 'memory', ttl: 60, priority: 1, maxSize: 1024 * 1024 }, // 1MB, 1 minute
      { name: 'redis', ttl: 300, priority: 2 }, // 5 minutes
    ],
    smartTTL: {
      baseTTL: 60,
      accessFrequencyMultiplier: 0.1,
      dataAgeMultiplier: 0.05,
      maxTTL: 300,
      minTTL: 30,
    },
  },

  // User data and preferences
  USER_DATA: {
    tiers: [
      { name: 'memory', ttl: 1800, priority: 1, maxSize: 512 * 1024 }, // 512KB, 30 minutes
      { name: 'redis', ttl: 7200, priority: 2 }, // 2 hours
    ],
    smartTTL: {
      baseTTL: 1800,
      accessFrequencyMultiplier: 0.2,
      dataAgeMultiplier: 0.1,
      maxTTL: 14400, // 4 hours
      minTTL: 300, // 5 minutes
    },
  },

  // Guild settings and configurations
  GUILD_CONFIG: {
    tiers: [
      { name: 'memory', ttl: 3600, priority: 1, maxSize: 256 * 1024 }, // 256KB, 1 hour
      { name: 'redis', ttl: 14400, priority: 2 }, // 4 hours
    ],
    smartTTL: {
      baseTTL: 3600,
      accessFrequencyMultiplier: 0.3,
      dataAgeMultiplier: 0.05,
      maxTTL: 28800, // 8 hours
      minTTL: 600, // 10 minutes
    },
  },

  // Leaderboards and rankings
  LEADERBOARD: {
    tiers: [
      { name: 'memory', ttl: 900, priority: 1, maxSize: 2 * 1024 * 1024 }, // 2MB, 15 minutes
      { name: 'redis', ttl: 3600, priority: 2 }, // 1 hour
    ],
    smartTTL: {
      baseTTL: 900,
      accessFrequencyMultiplier: 0.15,
      dataAgeMultiplier: 0.2,
      maxTTL: 7200, // 2 hours
      minTTL: 300, // 5 minutes
    },
  },

  // PUBG stats and game data
  GAME_STATS: {
    tiers: [
      { name: 'memory', ttl: 1800, priority: 1, maxSize: 1024 * 1024 }, // 1MB, 30 minutes
      { name: 'redis', ttl: 10800, priority: 2 }, // 3 hours
    ],
    smartTTL: {
      baseTTL: 1800,
      accessFrequencyMultiplier: 0.25,
      dataAgeMultiplier: 0.15,
      maxTTL: 21600, // 6 hours
      minTTL: 600, // 10 minutes
    },
  },

  // Static data (badges, achievements)
  STATIC_DATA: {
    tiers: [
      { name: 'memory', ttl: 7200, priority: 1, maxSize: 512 * 1024 }, // 512KB, 2 hours
      { name: 'redis', ttl: 86400, priority: 2 }, // 24 hours
    ],
    smartTTL: {
      baseTTL: 7200,
      accessFrequencyMultiplier: 0.1,
      dataAgeMultiplier: 0.02,
      maxTTL: 172800, // 48 hours
      minTTL: 1800, // 30 minutes
    },
  },
} as const;

/**
 * Cache key patterns for different data types
 */
export const CACHE_PATTERNS = {
  USER: {
    profile: (userId: string) => `user:profile:${userId}`,
    settings: (userId: string) => `user:settings:${userId}`,
    badges: (userId: string) => `user:badges:${userId}`,
    stats: (userId: string) => `user:stats:${userId}`,
    presence: (userId: string) => `user:presence:${userId}`,
  },
  GUILD: {
    settings: (guildId: string) => `guild:settings:${guildId}`,
    config: (guildId: string) => `guild:config:${guildId}`,
    members: (guildId: string) => `guild:members:${guildId}`,
    roles: (guildId: string) => `guild:roles:${guildId}`,
  },
  LEADERBOARD: {
    xp: (guildId: string) => `leaderboard:xp:${guildId}`,
    level: (guildId: string) => `leaderboard:level:${guildId}`,
    pubg: (guildId: string) => `leaderboard:pubg:${guildId}`,
    global: (type: string) => `leaderboard:global:${type}`,
  },
  PUBG: {
    player: (playerId: string) => `pubg:player:${playerId}`,
    stats: (playerId: string, season: string) => `pubg:stats:${playerId}:${season}`,
    matches: (playerId: string) => `pubg:matches:${playerId}`,
    weapons: (playerId: string) => `pubg:weapons:${playerId}`,
  },
  SYSTEM: {
    commands: () => 'system:commands',
    config: () => 'system:config',
    status: () => 'system:status',
    metrics: () => 'system:metrics',
  },
} as const;

/**
 * Predefined invalidation rules
 */
const INVALIDATION_RULES: InvalidationRule[] = [
  {
    pattern: 'user:*',
    triggers: ['user:updated', 'user:deleted'],
    cascading: true,
    dependencies: ['leaderboard', 'guild:members'],
  },
  {
    pattern: 'guild:*',
    triggers: ['guild:updated', 'guild:settings:changed'],
    cascading: true,
  },
  {
    pattern: 'leaderboard:*',
    triggers: ['user:xp:updated', 'user:level:updated', 'pubg:stats:updated'],
  },
  {
    pattern: 'pubg:*',
    triggers: ['pubg:match:completed', 'pubg:stats:refreshed'],
  },
  {
    pattern: 'system:*',
    triggers: ['system:restart', 'config:updated'],
  },
];

/**
 * Cache manager with intelligent distribution and invalidation
 */
export class CacheManager extends EventEmitter {
  private readonly logger = new Logger();
  private readonly caches = new Map<string, DistributedCache>();
  private readonly cacheService: CacheService;
  private initialized = false;

  constructor(cacheService: CacheService) {
    super();
    this.cacheService = cacheService;
  }

  /**
   * Initialize cache manager with presets
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize cache instances for each preset
      for (const [name, preset] of Object.entries(CACHE_PRESETS)) {
        const cache = new DistributedCache(this.cacheService, {
          tiers: [...preset.tiers],
          smartTTLConfig: preset.smartTTL,
          cleanupIntervalMs: 60000, // 1 minute
          refreshIntervalMs: 300000, // 5 minutes
        });

        // Add invalidation rules
        INVALIDATION_RULES.forEach(rule => {
          cache.addInvalidationRule(rule);
        });

        // Forward events
        cache.on('set', (data) => this.emit('cache:set', { cache: name, ...data }));
        cache.on('delete', (data) => this.emit('cache:delete', { cache: name, ...data }));
        cache.on('invalidate', (data) => this.emit('cache:invalidate', { cache: name, ...data }));

        this.caches.set(name.toLowerCase(), cache);
      }

      this.initialized = true;
      this.logger.info('Cache manager initialized', {
        metadata: {
          caches: this.caches.size,
          presets: Object.keys(CACHE_PRESETS),
        },
      });

    } catch (error) {
      this.logger.error('Failed to initialize cache manager', { error });
      throw error;
    }
  }

  /**
   * Get cache instance by type
   */
  getCache(type: keyof typeof CACHE_PRESETS): DistributedCache {
    const cache = this.caches.get(type.toLowerCase());
    if (!cache) {
      throw new Error(`Cache type '${type}' not found`);
    }
    return cache;
  }

  /**
   * User data operations
   */
  readonly user = {
    get: async <T>(userId: string, type: keyof typeof CACHE_PATTERNS.USER, fallback?: () => Promise<T>) => {
      const cache = this.getCache('USER_DATA');
      const key = CACHE_PATTERNS.USER[type](userId);
      return cache.get(key, fallback, {
        dependencies: [`user:${userId}`],
        tags: ['user', type],
      });
    },

    set: async <T>(userId: string, type: keyof typeof CACHE_PATTERNS.USER, value: T, ttl?: number) => {
      const cache = this.getCache('USER_DATA');
      const key = CACHE_PATTERNS.USER[type](userId);
      return cache.set(key, value, {
        ttl,
        dependencies: [`user:${userId}`],
        tags: ['user', type],
      });
    },

    invalidate: async (userId: string, type?: keyof typeof CACHE_PATTERNS.USER) => {
      const cache = this.getCache('USER_DATA');
      if (type) {
        const key = CACHE_PATTERNS.USER[type](userId);
        return cache.delete(key);
      } else {
        return cache.invalidateByDependency(`user:${userId}`);
      }
    },
  };

  /**
   * Guild data operations
   */
  readonly guild = {
    get: async <T>(guildId: string, type: keyof typeof CACHE_PATTERNS.GUILD, fallback?: () => Promise<T>) => {
      const cache = this.getCache('GUILD_CONFIG');
      const key = CACHE_PATTERNS.GUILD[type](guildId);
      return cache.get(key, fallback, {
        dependencies: [`guild:${guildId}`],
        tags: ['guild', type],
      });
    },

    set: async <T>(guildId: string, type: keyof typeof CACHE_PATTERNS.GUILD, value: T, ttl?: number) => {
      const cache = this.getCache('GUILD_CONFIG');
      const key = CACHE_PATTERNS.GUILD[type](guildId);
      return cache.set(key, value, {
        ttl,
        dependencies: [`guild:${guildId}`],
        tags: ['guild', type],
      });
    },

    invalidate: async (guildId: string, type?: keyof typeof CACHE_PATTERNS.GUILD) => {
      const cache = this.getCache('GUILD_CONFIG');
      if (type) {
        const key = CACHE_PATTERNS.GUILD[type](guildId);
        return cache.delete(key);
      } else {
        return cache.invalidateByDependency(`guild:${guildId}`);
      }
    },
  };

  /**
   * Leaderboard operations
   */
  readonly leaderboard = {
    get: async <T>(type: keyof typeof CACHE_PATTERNS.LEADERBOARD, identifier: string, fallback?: () => Promise<T>) => {
      const cache = this.getCache('LEADERBOARD');
      const key = CACHE_PATTERNS.LEADERBOARD[type](identifier);
      return cache.get(key, fallback, {
        dependencies: ['leaderboard'],
        tags: ['leaderboard', type],
      });
    },

    set: async <T>(type: keyof typeof CACHE_PATTERNS.LEADERBOARD, identifier: string, value: T, ttl?: number) => {
      const cache = this.getCache('LEADERBOARD');
      const key = CACHE_PATTERNS.LEADERBOARD[type](identifier);
      return cache.set(key, value, {
        ttl,
        dependencies: ['leaderboard'],
        tags: ['leaderboard', type],
      });
    },

    invalidate: async (type?: keyof typeof CACHE_PATTERNS.LEADERBOARD) => {
      const cache = this.getCache('LEADERBOARD');
      if (type) {
        return cache.invalidateByTag(type);
      } else {
        return cache.invalidateByTag('leaderboard');
      }
    },
  };

  /**
   * PUBG data operations
   */
  readonly pubg = {
    get: async <T>(type: keyof typeof CACHE_PATTERNS.PUBG, playerId: string, season?: string, fallback?: () => Promise<T>) => {
      const cache = this.getCache('GAME_STATS');
      let key: string;
      
      if (type === 'stats') {
        if (!season) {
          throw new Error('Season parameter is required for PUBG stats cache');
        }
        key = CACHE_PATTERNS.PUBG[type](playerId, season);
      } else {
        key = (CACHE_PATTERNS.PUBG[type] as (playerId: string) => string)(playerId);
      }
      
      return cache.get(key, fallback, {
        dependencies: [`pubg:${playerId}`],
        tags: ['pubg', type],
      });
    },

    set: async <T>(type: keyof typeof CACHE_PATTERNS.PUBG, playerId: string, value: T, season?: string, ttl?: number) => {
      const cache = this.getCache('GAME_STATS');
      let key: string;
      
      if (type === 'stats') {
        if (!season) {
          throw new Error('Season parameter is required for PUBG stats cache');
        }
        key = CACHE_PATTERNS.PUBG[type](playerId, season);
      } else {
        key = (CACHE_PATTERNS.PUBG[type] as (playerId: string) => string)(playerId);
      }
      
      return cache.set(key, value, {
        ttl,
        dependencies: [`pubg:${playerId}`],
        tags: ['pubg', type],
      });
    },

    invalidate: async (playerId: string, type?: keyof typeof CACHE_PATTERNS.PUBG) => {
      const cache = this.getCache('GAME_STATS');
      if (type) {
        return cache.invalidateByTag(type);
      } else {
        return cache.invalidateByDependency(`pubg:${playerId}`);
      }
    },
  };

  /**
   * System data operations
   */
  readonly system = {
    get: async <T>(type: keyof typeof CACHE_PATTERNS.SYSTEM, fallback?: () => Promise<T>) => {
      const cache = this.getCache('STATIC_DATA');
      const key = CACHE_PATTERNS.SYSTEM[type]();
      return cache.get(key, fallback, {
        tags: ['system', type],
      });
    },

    set: async <T>(type: keyof typeof CACHE_PATTERNS.SYSTEM, value: T, ttl?: number) => {
      const cache = this.getCache('STATIC_DATA');
      const key = CACHE_PATTERNS.SYSTEM[type]();
      return cache.set(key, value, {
        ttl,
        tags: ['system', type],
      });
    },

    invalidate: async (type?: keyof typeof CACHE_PATTERNS.SYSTEM) => {
      const cache = this.getCache('STATIC_DATA');
      if (type) {
        return cache.invalidateByTag(type);
      } else {
        return cache.invalidateByTag('system');
      }
    },
  };

  /**
   * Realtime data operations (short-lived, high-frequency)
   */
  readonly realtime = {
    get: async <T>(key: string, fallback?: () => Promise<T>) => {
      const cache = this.getCache('REALTIME');
      return cache.get(key, fallback, {
        tags: ['realtime'],
      });
    },

    set: async <T>(key: string, value: T, ttl?: number) => {
      const cache = this.getCache('REALTIME');
      return cache.set(key, value, {
        ttl,
        tags: ['realtime'],
      });
    },

    invalidate: async (pattern?: string) => {
      const cache = this.getCache('REALTIME');
      if (pattern) {
        return cache.invalidatePattern(pattern);
      } else {
        return cache.invalidateByTag('realtime');
      }
    },
  };

  /**
   * Warm up all caches with essential data
   */
  async warmUp(): Promise<void> {
    this.logger.info('Starting cache warm-up process');

    try {
      // Warm up system cache
      await this.system.set('status', {
        initialized: true,
        timestamp: Date.now(),
      });

      // Emit warm-up event for other services to populate their caches
      this.emit('warmup:start');

      this.logger.info('Cache warm-up completed successfully');
    } catch (error) {
      this.logger.error('Cache warm-up failed', { error });
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }

    return {
      caches: stats,
      totalCaches: this.caches.size,
      initialized: this.initialized,
    };
  }

  /**
   * Invalidate all caches
   */
  async invalidateAll(): Promise<void> {
    this.logger.info('Invalidating all caches');

    const promises = Array.from(this.caches.values()).map(cache => 
      cache.invalidatePattern('*'),
    );

    await Promise.all(promises);
    this.emit('invalidate:all');
  }

  /**
   * Trigger cache invalidation by event
   */
  async triggerInvalidation(event: string, data?: any): Promise<void> {
    this.logger.debug('Triggering cache invalidation', {
      metadata: { event, data },
    });

    // Emit to all caches
    for (const cache of this.caches.values()) {
      cache.emit(event, data);
    }

    this.emit('invalidation:triggered', { event, data });
  }

  /**
   * Shutdown all caches
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down cache manager');

    const promises = Array.from(this.caches.values()).map(cache => 
      cache.shutdown(),
    );

    await Promise.all(promises);
    this.caches.clear();
    this.removeAllListeners();
    this.initialized = false;

    this.logger.info('Cache manager shutdown completed');
  }
}

/**
 * Global cache manager instance
 */
let globalCacheManager: CacheManager | null = null;

/**
 * Get or create global cache manager
 */
export function getCacheManager(cacheService?: CacheService): CacheManager {
  if (!globalCacheManager && cacheService) {
    globalCacheManager = new CacheManager(cacheService);
  }
  
  if (!globalCacheManager) {
    throw new Error('Cache manager not initialized. Provide CacheService on first call.');
  }
  
  return globalCacheManager;
}

/**
 * Initialize global cache manager
 */
export async function initializeCacheManager(cacheService: CacheService): Promise<CacheManager> {
  const manager = getCacheManager(cacheService);
  await manager.initialize();
  return manager;
}