import { createClient, RedisClientType } from 'redis';
import { Logger } from '../utils/logger';

/**
 * Cache service using Redis for high-performance data caching
 */
export class CacheService {
  private client: RedisClientType;
  private logger: Logger;
  private isConnected: boolean = false;
  private defaultTTL: number = 3600; // 1 hour in seconds

  constructor() {
    this.logger = new Logger();
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            this.logger.error('Redis reconnection failed after 10 attempts');
            return new Error('Redis reconnection failed');
          }
          return Math.min(retries * 50, 1000);
        },
      },
    });

    this.setupEventListeners();
  }

  /**
   * Setup Redis event listeners
   */
  private setupEventListeners(): void {
    this.client.on('connect', () => {
      this.logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      this.logger.info('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis client error:', error);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      this.logger.info('Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      this.logger.info('Redis client reconnecting...');
    });
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.info('✅ Connected to Redis successfully');
    } catch (error) {
      this.logger.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      this.isConnected = false;
      this.logger.info('✅ Disconnected from Redis successfully');
    } catch (error) {
      this.logger.error('❌ Failed to disconnect from Redis:', error);
      throw error;
    }
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
    try {
      const serializedValue = JSON.stringify(value);
      const expiration = ttl || this.defaultTTL;
      
      await this.client.setEx(key, expiration, serializedValue);
      
      this.logger.cache('set', key, false, {
        ttl: expiration,
        size: serializedValue.length,
      });
    } catch (error) {
      this.logger.error(`Failed to set cache key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a value from cache
   */
  public async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      
      if (value === null) {
        this.logger.cache('get', key, false);
        return null;
      }

      const parsedValue = JSON.parse(value) as T;
      this.logger.cache('get', key, true);
      return parsedValue;
    } catch (error) {
      this.logger.error(`Failed to get cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * Delete a key from cache
   */
  public async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      this.logger.cache('del', key, result > 0);
      return result > 0;
    } catch (error) {
      this.logger.error(`Failed to delete cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if a key exists in cache
   */
  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to check cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set expiration time for a key
   */
  public async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttl);
      return result;
    } catch (error) {
      this.logger.error(`Failed to set expiration for cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get time to live for a key
   */
  public async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error(`Failed to get TTL for cache key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Increment a numeric value
   */
  public async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.error(`Failed to increment cache key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Decrement a numeric value
   */
  public async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(key);
    } catch (error) {
      this.logger.error(`Failed to decrement cache key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple keys at once
   */
  public async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mGet(keys);
      return values.map(value => {
        if (value === null) {
          return null;
        }
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      this.logger.error('Failed to get multiple cache keys:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  public async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    try {
      const serializedPairs: string[] = [];
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        serializedPairs.push(key, JSON.stringify(value));
      }

      await this.client.mSet(serializedPairs);

      // Set TTL for all keys if specified
      if (ttl) {
        const promises = Object.keys(keyValuePairs).map(key => 
          this.client.expire(key, ttl),
        );
        await Promise.all(promises);
      }
    } catch (error) {
      this.logger.error('Failed to set multiple cache keys:', error);
      throw error;
    }
  }

  /**
   * Get all keys matching a pattern
   */
  public async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this.logger.error(`Failed to get keys with pattern ${pattern}:`, error);
      return [];
    }
  }

  /**
   * Clear all keys matching a pattern
   */
  public async clearPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      
      const result = await this.client.del(keys);
      this.logger.info(`Cleared ${result} cache keys matching pattern: ${pattern}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to clear cache pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Flush all cache data
   */
  public async flushAll(): Promise<void> {
    try {
      await this.client.flushAll();
      this.logger.warn('All cache data has been flushed');
    } catch (error) {
      this.logger.error('Failed to flush all cache data:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired keys and optimize memory
   */
  public async cleanup(): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot perform cleanup');
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
      
      this.logger.info(`Cache cleanup completed, deleted ${totalDeleted} expired keys`);
    } catch (error) {
      this.logger.error('Error during cache cleanup:', error);
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
      this.logger.error('Failed to get cache statistics:', error);
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
    cooldown: (userId: string, commandName: string) => 
      `cooldown:${userId}:${commandName}`,
    session: (sessionId: string) => `session:${sessionId}`,
    musicQueue: (guildId: string) => `music:queue:${guildId}`,
    quiz: (quizId: string) => `quiz:${quizId}`,
    clip: (clipId: string) => `clip:${clipId}`,
    badge: (badgeId: string) => `badge:${badgeId}`,
  };
}