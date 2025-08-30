import { CacheService } from '../services/cache.service';
import { Logger } from './logger';

/**
 * Utility class for common cache operations
 */
export class CacheUtils {
  private static logger = new Logger();

  /**
   * Cache key generators
   */
  static readonly KEYS = {
    USER: (discordId: string) => `user:${discordId}`,
    USER_GUILD: (discordId: string, guildId: string) => `user:${discordId}:guild:${guildId}`,
    GUILD_SETTINGS: (guildId: string) => `guild:${guildId}:settings`,
    LEADERBOARD: (guildId: string, type: string) => `leaderboard:${guildId}:${type}`,
    PRESENCE_STATS: (guildId: string) => `presence:${guildId}:stats`,
    BADGE_PROGRESS: (userId: string) => `badge:${userId}:progress`,
    COMMAND_STATS: (commandName: string) => `command:${commandName}:stats`,
    RANKING: (guildId: string, type: string) => `ranking:${guildId}:${type}`,
    PUBG_STATS: (userId: string) => `pubg:${userId}:stats`,
    WEAPON_MASTERY: (userId: string) => `weapon:${userId}:mastery`,
    TICKET_CONFIG: (guildId: string) => `ticket:${guildId}:config`,
    MUSIC_QUEUE: (guildId: string) => `music:${guildId}:queue`,
  } as const;

  /**
   * Cache TTL constants (in seconds)
   */
  static readonly TTL = {
    SHORT: 300, // 5 minutes
    MEDIUM: 1800, // 30 minutes
    LONG: 3600, // 1 hour
    VERY_LONG: 86400, // 24 hours
  } as const;

  /**
   * Get or set cached data with fallback
   */
  static async getOrSet<T>(
    cache: CacheService,
    key: string,
    fallbackFn: () => Promise<T>,
    ttl: number = CacheUtils.TTL.MEDIUM
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await cache.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // If not in cache, get from fallback and cache it
      const data = await fallbackFn();
      await cache.set(key, data, ttl);
      return data;
    } catch (error) {
      this.logger.error(`Cache operation failed for key ${key}:`, error);
      // If cache fails, still try to get data from fallback
      return await fallbackFn();
    }
  }

  /**
   * Invalidate related cache keys
   */
  static async invalidatePattern(cache: CacheService, pattern: string): Promise<void> {
    try {
      await cache.del(pattern);
      this.logger.info(`Invalidated cache pattern: ${pattern}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate cache pattern ${pattern}:`, error);
    }
  }

  /**
   * Cache user data with automatic invalidation
   */
  static async cacheUserData<T>(
    cache: CacheService,
    discordId: string,
    guildId: string,
    data: T,
    ttl: number = CacheUtils.TTL.MEDIUM
  ): Promise<void> {
    try {
      const userKey = this.KEYS.USER(discordId);
      const userGuildKey = this.KEYS.USER_GUILD(discordId, guildId);

      await Promise.all([cache.set(userKey, data, ttl), cache.set(userGuildKey, data, ttl)]);
    } catch (error) {
      this.logger.error(`Failed to cache user data for ${discordId}:`, error);
    }
  }

  /**
   * Invalidate user-related caches
   */
  static async invalidateUserCache(
    cache: CacheService,
    discordId: string,
    guildId?: string
  ): Promise<void> {
    try {
      const keysToInvalidate = [
        this.KEYS.USER(discordId),
        this.KEYS.BADGE_PROGRESS(discordId),
        this.KEYS.PUBG_STATS(discordId),
        this.KEYS.WEAPON_MASTERY(discordId),
      ];

      if (guildId) {
        keysToInvalidate.push(
          this.KEYS.USER_GUILD(discordId, guildId),
          this.KEYS.LEADERBOARD(guildId, 'xp'),
          this.KEYS.LEADERBOARD(guildId, 'level'),
          this.KEYS.RANKING(guildId, 'internal')
        );
      }

      await Promise.all(keysToInvalidate.map(key => cache.del(key)));
    } catch (error) {
      this.logger.error(`Failed to invalidate user cache for ${discordId}:`, error);
    }
  }

  /**
   * Cache leaderboard data
   */
  static async cacheLeaderboard(
    cache: CacheService,
    guildId: string,
    type: string,
    data: any[],
    ttl: number = CacheUtils.TTL.LONG
  ): Promise<void> {
    try {
      const key = this.KEYS.LEADERBOARD(guildId, type);
      await cache.set(key, data, ttl);
    } catch (error) {
      this.logger.error(`Failed to cache leaderboard ${type} for guild ${guildId}:`, error);
    }
  }

  /**
   * Get cached leaderboard
   */
  static async getCachedLeaderboard<T>(
    cache: CacheService,
    guildId: string,
    type: string
  ): Promise<T[] | null> {
    try {
      const key = this.KEYS.LEADERBOARD(guildId, type);
      return await cache.get<T[]>(key);
    } catch (error) {
      this.logger.error(`Failed to get cached leaderboard ${type} for guild ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Cache guild settings
   */
  static async cacheGuildSettings(
    cache: CacheService,
    guildId: string,
    settings: any,
    ttl: number = CacheUtils.TTL.VERY_LONG
  ): Promise<void> {
    try {
      const key = this.KEYS.GUILD_SETTINGS(guildId);
      await cache.set(key, settings, ttl);
    } catch (error) {
      this.logger.error(`Failed to cache guild settings for ${guildId}:`, error);
    }
  }

  /**
   * Get cached guild settings
   */
  static async getCachedGuildSettings<T>(cache: CacheService, guildId: string): Promise<T | null> {
    try {
      const key = this.KEYS.GUILD_SETTINGS(guildId);
      return await cache.get<T>(key);
    } catch (error) {
      this.logger.error(`Failed to get cached guild settings for ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Batch cache operations
   */
  static async batchSet(
    cache: CacheService,
    operations: Array<{
      key: string;
      value: any;
      ttl?: number;
    }>
  ): Promise<void> {
    try {
      await Promise.all(
        operations.map(op => cache.set(op.key, op.value, op.ttl || CacheUtils.TTL.MEDIUM))
      );
    } catch (error) {
      this.logger.error('Failed to perform batch cache set:', error);
    }
  }

  /**
   * Batch cache invalidation
   */
  static async batchInvalidate(cache: CacheService, keys: string[]): Promise<void> {
    try {
      await Promise.all(keys.map(key => cache.del(key)));
    } catch (error) {
      this.logger.error('Failed to perform batch cache invalidation:', error);
    }
  }

  /**
   * Cache with automatic refresh
   */
  static async cacheWithRefresh<T>(
    cache: CacheService,
    key: string,
    refreshFn: () => Promise<T>,
    ttl: number = CacheUtils.TTL.MEDIUM,
    refreshThreshold: number = 0.8 // Refresh when 80% of TTL has passed
  ): Promise<T> {
    try {
      const cached = await cache.get<{ data: T; timestamp: number }>(key);

      if (cached) {
        const age = Date.now() - cached.timestamp;
        const maxAge = ttl * 1000; // Convert to milliseconds

        // If data is still fresh, return it
        if (age < maxAge * refreshThreshold) {
          return cached.data;
        }

        // If data is getting old, refresh in background but return current data
        if (age < maxAge) {
          // Refresh in background
          refreshFn()
            .then(newData => {
              cache.set(
                key,
                {
                  data: newData,
                  timestamp: Date.now(),
                },
                ttl
              );
            })
            .catch(error => {
              this.logger.error(`Background refresh failed for key ${key}:`, error);
            });

          return cached.data;
        }
      }

      // Data is expired or doesn't exist, fetch fresh data
      const freshData = await refreshFn();
      await cache.set(
        key,
        {
          data: freshData,
          timestamp: Date.now(),
        },
        ttl
      );

      return freshData;
    } catch (error) {
      this.logger.error(`Cache with refresh failed for key ${key}:`, error);
      return await refreshFn();
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(
    cache: CacheService,
    keyPatterns: string[]
  ): Promise<{
    totalKeys: number;
    patternCounts: Record<string, number>;
  }> {
    try {
      // This would need to be implemented based on the cache service capabilities
      // For now, return a placeholder
      return {
        totalKeys: 0,
        patternCounts: {},
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats:', error);
      return {
        totalKeys: 0,
        patternCounts: {},
      };
    }
  }
}
