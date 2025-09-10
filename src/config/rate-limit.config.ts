import { RateLimitConfig } from '../utils/rate-limiter';

/**
 * Rate limiting configuration for different API endpoints and operations
 */
export interface RateLimitEndpointConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
  onLimitReached?: (req: any, res: any) => void;
}

/**
 * Comprehensive rate limiting configuration
 */
export class RateLimitConfiguration {
  // General API rate limits
  static readonly GENERAL: RateLimitEndpointConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: 'Too many requests from this IP, please try again later.',
  };

  // Authentication endpoints - very strict
  static readonly AUTH_LOGIN: RateLimitEndpointConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 minutes
    message: 'Too many login attempts. Please try again in 15 minutes.',
    skipSuccessfulRequests: true,
    keyGenerator: req => `auth-login-${req.ip}-${req.body?.username || 'unknown'}`,
  };

  static readonly AUTH_REGISTER: RateLimitEndpointConfig = {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registration attempts per hour
    message: 'Registration limit exceeded. Please try again in 1 hour.',
    keyGenerator: req => `auth-register-${req.ip}`,
  };

  static readonly AUTH_PASSWORD_RESET: RateLimitEndpointConfig = {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password reset attempts per hour
    message: 'Password reset limit exceeded. Please try again in 1 hour.',
    keyGenerator: req => `auth-reset-${req.ip}-${req.body?.email || 'unknown'}`,
  };

  // File upload endpoints
  static readonly UPLOAD_GENERAL: RateLimitEndpointConfig = {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // 10 uploads per 10 minutes
    message: 'Upload limit exceeded. Please try again in 10 minutes.',
    keyGenerator: req => `upload-${req.ip}-${req.user?.id || 'anonymous'}`,
  };

  static readonly UPLOAD_AVATAR: RateLimitEndpointConfig = {
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 5, // 5 avatar uploads per 30 minutes
    message: 'Avatar upload limit exceeded. Please try again in 30 minutes.',
    keyGenerator: req => `upload-avatar-${req.user?.id || req.ip}`,
  };

  static readonly UPLOAD_CLIPS: RateLimitEndpointConfig = {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 clip uploads per hour
    message: 'Clip upload limit exceeded. Please try again in 1 hour.',
    keyGenerator: req => `upload-clips-${req.user?.id || req.ip}`,
  };

  // API endpoints by category
  static readonly API_PUBG: RateLimitEndpointConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 PUBG API calls per minute
    message: 'PUBG API rate limit exceeded. Please try again in 1 minute.',
    keyGenerator: req => `api-pubg-${req.user?.id || req.ip}`,
  };

  static readonly API_STATS: RateLimitEndpointConfig = {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // 30 stats requests per 5 minutes
    message: 'Stats API rate limit exceeded. Please try again in 5 minutes.',
    keyGenerator: req => `api-stats-${req.user?.id || req.ip}`,
  };

  static readonly API_RANKING: RateLimitEndpointConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 ranking requests per minute
    message: 'Ranking API rate limit exceeded. Please try again in 1 minute.',
    keyGenerator: req => `api-ranking-${req.user?.id || req.ip}`,
  };

  // Admin endpoints - moderate limits
  static readonly ADMIN_GENERAL: RateLimitEndpointConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 admin requests per minute
    message: 'Admin API rate limit exceeded. Please try again in 1 minute.',
    keyGenerator: req => `admin-${req.user?.id || req.ip}`,
  };

  static readonly ADMIN_BULK_OPERATIONS: RateLimitEndpointConfig = {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 bulk operations per 5 minutes
    message: 'Bulk operation limit exceeded. Please try again in 5 minutes.',
    keyGenerator: req => `admin-bulk-${req.user?.id || req.ip}`,
  };

  // WebSocket rate limits
  static readonly WEBSOCKET_CONNECTION: RateLimitEndpointConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 connection attempts per minute
    message: 'WebSocket connection limit exceeded.',
    keyGenerator: req => `ws-connect-${req.ip}`,
  };

  static readonly WEBSOCKET_MESSAGES: RateLimitEndpointConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 messages per minute
    message: 'WebSocket message limit exceeded.',
    keyGenerator: req => `ws-msg-${req.user?.id || req.ip}`,
  };

  // Bot command rate limits (for Discord integration)
  static readonly BOT_COMMANDS: RateLimitConfig = {
    maxRequests: 5,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: (identifier: string) => `bot-cmd-${identifier}`,
  };

  static readonly BOT_MUSIC_COMMANDS: RateLimitConfig = {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: (identifier: string) => `bot-music-${identifier}`,
  };

  static readonly BOT_PUBG_COMMANDS: RateLimitConfig = {
    maxRequests: 3,
    windowMs: 60 * 1000, // 1 minute
    keyGenerator: (identifier: string) => `bot-pubg-${identifier}`,
  };

  // Security-related rate limits
  static readonly SECURITY_CAPTCHA: RateLimitEndpointConfig = {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 CAPTCHA requests per 5 minutes
    message: 'CAPTCHA request limit exceeded. Please try again in 5 minutes.',
    keyGenerator: req => `captcha-${req.ip}`,
  };

  static readonly SECURITY_2FA: RateLimitEndpointConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 2FA attempts per 15 minutes
    message: '2FA verification limit exceeded. Please try again in 15 minutes.',
    keyGenerator: req => `2fa-${req.user?.id || req.ip}`,
  };

  // Health check and monitoring - very lenient
  static readonly HEALTH_CHECK: RateLimitEndpointConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 health checks per minute
    message: 'Health check rate limit exceeded.',
    keyGenerator: req => `health-${req.ip}`,
  };

  // Development endpoints - only in development mode
  static readonly DEV_ENDPOINTS: RateLimitEndpointConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 dev requests per minute
    message: 'Development endpoint rate limit exceeded.',
    keyGenerator: req => `dev-${req.ip}`,
  };

  /**
   * Get rate limit configuration by endpoint type
   */
  static getConfig(endpoint: string): RateLimitEndpointConfig {
    const configs: Record<string, RateLimitEndpointConfig> = {
      general: this.GENERAL,
      'auth-login': this.AUTH_LOGIN,
      'auth-register': this.AUTH_REGISTER,
      'auth-password-reset': this.AUTH_PASSWORD_RESET,
      'upload-general': this.UPLOAD_GENERAL,
      'upload-avatar': this.UPLOAD_AVATAR,
      'upload-clips': this.UPLOAD_CLIPS,
      'api-pubg': this.API_PUBG,
      'api-stats': this.API_STATS,
      'api-ranking': this.API_RANKING,
      'admin-general': this.ADMIN_GENERAL,
      'admin-bulk': this.ADMIN_BULK_OPERATIONS,
      'websocket-connection': this.WEBSOCKET_CONNECTION,
      'websocket-messages': this.WEBSOCKET_MESSAGES,
      'security-captcha': this.SECURITY_CAPTCHA,
      'security-2fa': this.SECURITY_2FA,
      'health-check': this.HEALTH_CHECK,
      'dev-endpoints': this.DEV_ENDPOINTS,
    };

    return configs[endpoint] || this.GENERAL;
  }

  /**
   * Create custom rate limit configuration
   */
  static createCustomConfig(
    windowMs: number,
    max: number,
    options?: Partial<RateLimitEndpointConfig>
  ): RateLimitEndpointConfig {
    return {
      windowMs,
      max,
      message: `Rate limit exceeded. Please try again in ${Math.ceil(windowMs / 1000)} seconds.`,
      ...options,
    };
  }

  /**
   * Get bot command rate limit configuration
   */
  static getBotCommandConfig(commandType: string): RateLimitConfig {
    const configs: Record<string, RateLimitConfig> = {
      general: this.BOT_COMMANDS,
      music: this.BOT_MUSIC_COMMANDS,
      pubg: this.BOT_PUBG_COMMANDS,
    };

    return configs[commandType] || this.BOT_COMMANDS;
  }
}

/**
 * Rate limit middleware factory
 */
export class RateLimitMiddleware {
  /**
   * Create rate limit middleware for Express
   */
  static create(config: RateLimitEndpointConfig) {
    return {
      windowMs: config.windowMs,
      max: config.max,
      message: {
        success: false,
        error: config.message || 'Rate limit exceeded',
        retryAfter: Math.ceil(config.windowMs / 1000),
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: config.keyGenerator || ((req: any) => req.ip),
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      onLimitReached: config.onLimitReached,
    };
  }

  /**
   * Create progressive rate limiting (increases penalty for repeated violations)
   */
  static createProgressive(baseConfig: RateLimitEndpointConfig) {
    const violationStore = new Map<string, { count: number; lastViolation: Date }>();

    return {
      ...this.create(baseConfig),
      keyGenerator: (req: any) => {
        const baseKey = baseConfig.keyGenerator ? baseConfig.keyGenerator(req) : req.ip;
        const violation = violationStore.get(baseKey);

        if (violation) {
          const timeSinceLastViolation = Date.now() - violation.lastViolation.getTime();
          // Reset violation count after 1 hour
          if (timeSinceLastViolation > 60 * 60 * 1000) {
            violationStore.delete(baseKey);
          }
        }

        return baseKey;
      },
      max: (req: any) => {
        const baseKey = baseConfig.keyGenerator ? baseConfig.keyGenerator(req) : req.ip;
        const violation = violationStore.get(baseKey);

        if (!violation) {
          return baseConfig.max;
        }

        // Reduce max requests based on violation count
        const penalty = Math.min(violation.count * 0.2, 0.8); // Max 80% reduction
        return Math.max(1, Math.floor(baseConfig.max * (1 - penalty)));
      },
      onLimitReached: (req: any, res: any) => {
        const baseKey = baseConfig.keyGenerator ? baseConfig.keyGenerator(req) : req.ip;
        const violation = violationStore.get(baseKey) || { count: 0, lastViolation: new Date() };

        violation.count++;
        violation.lastViolation = new Date();
        violationStore.set(baseKey, violation);

        if (baseConfig.onLimitReached) {
          baseConfig.onLimitReached(req, res);
        }
      },
    };
  }
}
