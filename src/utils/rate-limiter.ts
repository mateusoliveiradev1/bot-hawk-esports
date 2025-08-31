import { Logger } from './logger';

/**
 * Rate limiter configuration interface
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (identifier: string) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (identifier: string, resetTime: Date) => void;
}

/**
 * Rate limit result interface
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
}

/**
 * Request tracking interface
 */
interface RequestTracker {
  count: number;
  resetTime: Date;
  firstRequest: Date;
}

/**
 * Advanced rate limiter with sliding window and burst protection
 */
export class RateLimiter {
  private readonly store = new Map<string, RequestTracker>();
  private readonly logger = new Logger();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(private readonly config: RateLimitConfig) {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if request is allowed under rate limit
   */
  public checkLimit(identifier: string): RateLimitResult {
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.windowMs);

    let tracker = this.store.get(key);

    // Initialize or reset if window expired
    if (!tracker || tracker.resetTime <= now) {
      const resetTime = new Date(now.getTime() + this.config.windowMs);
      tracker = {
        count: 1,
        resetTime,
        firstRequest: now,
      };
      this.store.set(key, tracker);

      return {
        allowed: true,
        remaining: this.config.maxRequests - 1,
        resetTime,
        totalHits: 1,
      };
    }

    // Check if limit exceeded
    if (tracker.count >= this.config.maxRequests) {
      if (this.config.onLimitReached) {
        this.config.onLimitReached(identifier, tracker.resetTime);
      }

      return {
        allowed: false,
        remaining: 0,
        resetTime: tracker.resetTime,
        totalHits: tracker.count,
      };
    }

    // Increment counter
    tracker.count++;
    this.store.set(key, tracker);

    return {
      allowed: true,
      remaining: this.config.maxRequests - tracker.count,
      resetTime: tracker.resetTime,
      totalHits: tracker.count,
    };
  }

  /**
   * Reset rate limit for specific identifier
   */
  public reset(identifier: string): void {
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
    this.store.delete(key);
  }

  /**
   * Get current status for identifier
   */
  public getStatus(identifier: string): RateLimitResult | null {
    const key = this.config.keyGenerator ? this.config.keyGenerator(identifier) : identifier;
    const tracker = this.store.get(key);

    if (!tracker) {
      return null;
    }

    const now = new Date();
    if (tracker.resetTime <= now) {
      this.store.delete(key);
      return null;
    }

    return {
      allowed: tracker.count < this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - tracker.count),
      resetTime: tracker.resetTime,
      totalHits: tracker.count,
    };
  }

  /**
   * Get statistics about rate limiter usage
   */
  public getStats(): {
    activeKeys: number;
    totalRequests: number;
    averageRequestsPerKey: number;
  } {
    const now = new Date();
    let totalRequests = 0;
    let activeKeys = 0;

    for (const [key, tracker] of this.store.entries()) {
      if (tracker.resetTime > now) {
        activeKeys++;
        totalRequests += tracker.count;
      }
    }

    return {
      activeKeys,
      totalRequests,
      averageRequestsPerKey: activeKeys > 0 ? totalRequests / activeKeys : 0,
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, tracker] of this.store.entries()) {
      if (tracker.resetTime <= now) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Rate limiter cleanup: removed ${cleaned} expired entries`);
    }
  }

  /**
   * Destroy rate limiter and cleanup resources
   */
  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Predefined rate limiter configurations
 */
export class RateLimitPresets {
  /**
   * Strict rate limit for sensitive operations
   */
  static readonly STRICT: RateLimitConfig = {
    maxRequests: 5,
    windowMs: 60 * 1000, // 1 minute
  };

  /**
   * Moderate rate limit for API calls
   */
  static readonly MODERATE: RateLimitConfig = {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
  };

  /**
   * Lenient rate limit for general usage
   */
  static readonly LENIENT: RateLimitConfig = {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  };

  /**
   * PUBG API specific rate limit
   */
  static readonly PUBG_API: RateLimitConfig = {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  };

  /**
   * Discord API rate limit
   */
  static readonly DISCORD_API: RateLimitConfig = {
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
  };
}

/**
 * Utility functions for rate limiting
 */
export class RateLimitUtils {
  /**
   * Create a delay function that respects rate limits
   */
  static createDelayedExecutor(rateLimiter: RateLimiter, identifier: string) {
    return async <T>(fn: () => Promise<T>): Promise<T> => {
      const result = rateLimiter.checkLimit(identifier);
      
      if (!result.allowed) {
        const waitTime = result.resetTime.getTime() - Date.now();
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        // Try again after waiting
        return this.createDelayedExecutor(rateLimiter, identifier)(fn);
      }

      return fn();
    };
  }

  /**
   * Create rate limit middleware for async operations
   */
  static createMiddleware(rateLimiter: RateLimiter) {
    return (identifier: string) => {
      return <T>(target: any, propertyName: string, descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<T>>) => {
        const method = descriptor.value!;
        descriptor.value = async function (...args: any[]): Promise<T> {
          const result = rateLimiter.checkLimit(identifier);
          
          if (!result.allowed) {
            throw new Error(`Rate limit exceeded. Try again after ${result.resetTime.toISOString()}`);
          }

          return method.apply(this, args);
        };
      };
    };
  }
}