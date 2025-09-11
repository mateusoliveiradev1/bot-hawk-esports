import { EventEmitter } from 'events';
import { productionCache } from './production-cache.service';
import { productionLogger, createLogContext } from '../utils/production-logger';
import { LogCategory } from '../utils/logger';
import { productionConfig } from '../config/production.config';
import { productionMonitoring } from './production-monitoring.service';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (identifier: string) => string;
  onLimitReached?: (identifier: string, resetTime: number) => void;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
}

export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  activeWindows: number;
  topOffenders: Array<{ identifier: string; requests: number }>;
}

class ProductionRateLimiterService extends EventEmitter {
  private defaultConfig: RateLimitConfig;
  private stats: RateLimitStats = {
    totalRequests: 0,
    blockedRequests: 0,
    activeWindows: 0,
    topOffenders: [],
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.defaultConfig = {
      windowMs: productionConfig.rateLimit.window,
      maxRequests: productionConfig.rateLimit.maxRequests,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (identifier: string) => `rate_limit:${identifier}`,
    };
    this.setupCleanup();
  }

  private setupCleanup(): void {
    // Clean up expired rate limit windows every minute
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredWindows();
    }, 60000); // 1 minute
  }

  private async cleanupExpiredWindows(): Promise<void> {
    try {
      // This is handled by Redis TTL and cache cleanup
      // Just update stats
      const stats = await this.getStats();
      this.stats.activeWindows = stats.activeWindows;
    } catch (error) {
      productionLogger.error('Failed to cleanup expired rate limit windows', {
        category: LogCategory.SECURITY,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async checkRateLimit(
    identifier: string,
    config: Partial<RateLimitConfig> = {}
  ): Promise<RateLimitResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const key = finalConfig.keyGenerator!(identifier);
    const now = Date.now();
    const windowStart = Math.floor(now / finalConfig.windowMs) * finalConfig.windowMs;
    const windowKey = `${key}:${windowStart}`;
    const resetTime = windowStart + finalConfig.windowMs;

    this.stats.totalRequests++;
    productionMonitoring.incrementCounter('rateLimitChecks');

    try {
      // Get current count for this window
      const currentCount = (await productionCache.get<number>(windowKey)) || 0;
      const newCount = currentCount + 1;

      // Check if limit exceeded
      if (newCount > finalConfig.maxRequests) {
        this.stats.blockedRequests++;
        productionMonitoring.incrementCounter('rateLimitBlocked');

        // Log rate limit exceeded
        productionLogger.warn(
          `Rate limit exceeded for ${identifier}`,
          createLogContext(LogCategory.SECURITY, {
            metadata: {
              identifier,
              currentCount: newCount,
              maxRequests: finalConfig.maxRequests,
              windowMs: finalConfig.windowMs,
              resetTime,
            },
          })
        );

        // Create security alert
        productionMonitoring.createAlert('warning', 'security', 'Rate limit exceeded', {
          identifier,
          requests: newCount,
          limit: finalConfig.maxRequests,
        });

        // Call callback if provided
        if (finalConfig.onLimitReached) {
          finalConfig.onLimitReached(identifier, resetTime);
        }

        this.emit('limitReached', { identifier, requests: newCount, resetTime });

        return {
          allowed: false,
          remaining: 0,
          resetTime,
          totalHits: newCount,
        };
      }

      // Update count with TTL
      const ttlSeconds = Math.ceil((resetTime - now) / 1000);
      await productionCache.set(windowKey, newCount, { ttl: ttlSeconds });

      const remaining = Math.max(0, finalConfig.maxRequests - newCount);

      productionLogger.debug(
        `Rate limit check passed for ${identifier}`,
        createLogContext(LogCategory.SECURITY, {
          metadata: {
            identifier,
            requests: newCount,
            remaining,
            resetTime,
          },
        })
      );

      return {
        allowed: true,
        remaining,
        resetTime,
        totalHits: newCount,
      };
    } catch (error) {
      productionLogger.error(
        `Rate limit check failed for ${identifier}`,
        createLogContext(LogCategory.SECURITY, {
          error: error instanceof Error ? error : new Error(String(error)),
        })
      );

      // On error, allow the request but log it
      return {
        allowed: true,
        remaining: finalConfig.maxRequests,
        resetTime,
        totalHits: 0,
      };
    }
  }

  async resetRateLimit(
    identifier: string,
    config: Partial<RateLimitConfig> = {}
  ): Promise<boolean> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const key = finalConfig.keyGenerator!(identifier);

    try {
      // Clear all windows for this identifier
      await productionCache.clear(`rate_limit:${identifier}`);

      productionLogger.info(
        `Rate limit reset for ${identifier}`,
        createLogContext(LogCategory.SECURITY, {
          metadata: { identifier },
        })
      );

      return true;
    } catch (error) {
      productionLogger.error(
        `Failed to reset rate limit for ${identifier}`,
        createLogContext(LogCategory.SECURITY, {
          error: error instanceof Error ? error : new Error(String(error)),
        })
      );
      return false;
    }
  }

  async getRemainingRequests(
    identifier: string,
    config: Partial<RateLimitConfig> = {}
  ): Promise<{ remaining: number; resetTime: number }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const key = finalConfig.keyGenerator!(identifier);
    const now = Date.now();
    const windowStart = Math.floor(now / finalConfig.windowMs) * finalConfig.windowMs;
    const windowKey = `${key}:${windowStart}`;
    const resetTime = windowStart + finalConfig.windowMs;

    try {
      const currentCount = (await productionCache.get<number>(windowKey)) || 0;
      const remaining = Math.max(0, finalConfig.maxRequests - currentCount);

      return { remaining, resetTime };
    } catch (error) {
      productionLogger.error(`Failed to get remaining requests for ${identifier}`, {
        category: LogCategory.SECURITY,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return { remaining: finalConfig.maxRequests, resetTime };
    }
  }

  async getStats(): Promise<RateLimitStats> {
    try {
      // Get cache stats to estimate active windows
      const cacheStats = await productionCache.getStats();

      // Estimate active windows (rough approximation)
      this.stats.activeWindows = Math.floor(cacheStats.totalKeys * 0.1); // Assume 10% are rate limit keys

      return { ...this.stats };
    } catch (error) {
      productionLogger.error('Failed to get rate limiter stats', {
        category: LogCategory.SECURITY,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return { ...this.stats };
    }
  }

  // Predefined rate limiters for common use cases
  async checkCommandRateLimit(userId: string): Promise<RateLimitResult> {
    return this.checkRateLimit(`command:${userId}`, {
      windowMs: productionConfig.rateLimit.window,
      maxRequests: productionConfig.rateLimit.maxRequests,
    });
  }

  async checkAPIRateLimit(ip: string): Promise<RateLimitResult> {
    return this.checkRateLimit(`api:${ip}`, {
      windowMs: productionConfig.rateLimit.window,
      maxRequests: productionConfig.rateLimit.maxRequests,
    });
  }

  async checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
    return this.checkRateLimit(`login:${ip}`, {
      windowMs: 900000, // 15 minutes
      maxRequests: 5, // 5 attempts per 15 minutes
    });
  }

  async checkUploadRateLimit(userId: string): Promise<RateLimitResult> {
    return this.checkRateLimit(`upload:${userId}`, {
      windowMs: 3600000, // 1 hour
      maxRequests: 10, // 10 uploads per hour
    });
  }

  async checkMessageRateLimit(userId: string): Promise<RateLimitResult> {
    return this.checkRateLimit(`message:${userId}`, {
      windowMs: 60000, // 1 minute
      maxRequests: 30, // 30 messages per minute
    });
  }

  // Advanced rate limiting with burst allowance
  async checkBurstRateLimit(
    identifier: string,
    burstConfig: {
      burstSize: number;
      refillRate: number; // tokens per second
      maxTokens: number;
    }
  ): Promise<RateLimitResult> {
    const key = `burst:${identifier}`;
    const now = Date.now();

    try {
      const bucket = (await productionCache.get<{
        tokens: number;
        lastRefill: number;
      }>(key)) || {
        tokens: burstConfig.maxTokens,
        lastRefill: now,
      };

      // Calculate tokens to add based on time passed
      const timePassed = (now - bucket.lastRefill) / 1000;
      const tokensToAdd = Math.floor(timePassed * burstConfig.refillRate);
      const newTokens = Math.min(burstConfig.maxTokens, bucket.tokens + tokensToAdd);

      if (newTokens < 1) {
        // No tokens available
        const resetTime = now + ((1 - newTokens) / burstConfig.refillRate) * 1000;

        productionLogger.warn(`Burst rate limit exceeded for ${identifier}`, {
          category: LogCategory.SECURITY,
          metadata: {
            identifier,
            tokens: newTokens,
            resetTime,
          },
        });

        return {
          allowed: false,
          remaining: 0,
          resetTime: Math.floor(resetTime),
          totalHits: 0,
        };
      }

      // Consume one token
      const updatedBucket = {
        tokens: newTokens - 1,
        lastRefill: now,
      };

      await productionCache.set(key, updatedBucket, { ttl: 3600 }); // 1 hour TTL

      return {
        allowed: true,
        remaining: Math.floor(updatedBucket.tokens),
        resetTime: now + (burstConfig.maxTokens / burstConfig.refillRate) * 1000,
        totalHits: 0,
      };
    } catch (error) {
      productionLogger.error(`Burst rate limit check failed for ${identifier}`, {
        category: LogCategory.SECURITY,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      return {
        allowed: true,
        remaining: burstConfig.maxTokens,
        resetTime: now + 60000,
        totalHits: 0,
      };
    }
  }

  // IP-based rate limiting with automatic blocking
  async checkIPRateLimit(ip: string): Promise<RateLimitResult & { blocked: boolean }> {
    const result = await this.checkRateLimit(`ip:${ip}`, {
      windowMs: 60000, // 1 minute
      maxRequests: 100, // 100 requests per minute
    });

    // Check if IP should be temporarily blocked
    if (!result.allowed && result.totalHits > 150) {
      await this.blockIP(ip, 300000); // Block for 5 minutes
      return { ...result, blocked: true };
    }

    return { ...result, blocked: false };
  }

  private async blockIP(ip: string, durationMs: number): Promise<void> {
    const blockKey = `blocked_ip:${ip}`;
    const ttlSeconds = Math.ceil(durationMs / 1000);

    await productionCache.set(blockKey, true, { ttl: ttlSeconds });

    productionLogger.warn(
      `IP ${ip} temporarily blocked`,
      createLogContext(LogCategory.SECURITY, {
        metadata: {
          ip,
          duration: durationMs,
          reason: 'Rate limit exceeded',
        },
      })
    );

    productionMonitoring.createAlert('critical', 'security', 'IP temporarily blocked', {
      ip,
      duration: durationMs,
    });
  }

  async isIPBlocked(ip: string): Promise<boolean> {
    const blockKey = `blocked_ip:${ip}`;
    return await productionCache.exists(blockKey);
  }

  async unblockIP(ip: string): Promise<boolean> {
    const blockKey = `blocked_ip:${ip}`;
    const result = await productionCache.delete(blockKey);

    if (result) {
      productionLogger.info(
        `IP ${ip} unblocked`,
        createLogContext(LogCategory.SECURITY, {
          metadata: { ip },
        })
      );
    }

    return result;
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    productionLogger.info(
      'Production rate limiter service shutdown completed',
      createLogContext(LogCategory.SYSTEM)
    );
  }

  // Middleware for Express.js
  createExpressMiddleware(config: Partial<RateLimitConfig> = {}) {
    return async (req: any, res: any, next: any) => {
      const identifier = req.ip || req.connection.remoteAddress || 'unknown';
      const result = await this.checkRateLimit(identifier, config);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': config.maxRequests || this.defaultConfig.maxRequests,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
      });

      if (!result.allowed) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        });
      }

      next();
    };
  }
}

// Export singleton instance
export const productionRateLimiter = new ProductionRateLimiterService();
export default productionRateLimiter;
