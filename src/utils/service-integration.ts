import { RateLimiter, RateLimitConfig, RateLimitPresets } from './rate-limiter';
import { ErrorHandler, ErrorCategory, ErrorSeverity, HandleErrors } from './error-handler';
import { AdvancedCache, AdvancedCacheConfig, CacheStrategy, InvalidationPattern } from './advanced-cache';
import { CacheService } from '../services/cache.service';
import { Logger } from './logger';

/**
 * Service integration configuration
 */
export interface ServiceIntegrationConfig {
  serviceName: string;
  enableRateLimit?: boolean;
  enableErrorHandling?: boolean;
  enableAdvancedCache?: boolean;
  rateLimitConfig?: RateLimitConfig;
  cacheConfig?: AdvancedCacheConfig;
  errorHandlerConfig?: {
    enableMetrics?: boolean;
    enableRetry?: boolean;
    maxRetries?: number;
  };
}

/**
 * Integrated service wrapper that combines rate limiting, error handling, and caching
 */
export class IntegratedService {
  private readonly logger = new Logger();
  private readonly rateLimiter?: RateLimiter;
  private readonly errorHandler?: ErrorHandler;
  private readonly advancedCache?: AdvancedCache;

  constructor(
    private readonly config: ServiceIntegrationConfig,
    private readonly cacheService?: CacheService,
  ) {
    // Initialize rate limiter
    if (config.enableRateLimit && config.rateLimitConfig) {
      this.rateLimiter = new RateLimiter(config.rateLimitConfig);
      this.logger.info(`Rate limiter initialized for ${config.serviceName}`);
    }

    // Initialize error handler
    if (config.enableErrorHandling) {
      this.errorHandler = new ErrorHandler(config.errorHandlerConfig);
      this.logger.info(`Error handler initialized for ${config.serviceName}`);
    }

    // Initialize advanced cache
    if (config.enableAdvancedCache && config.cacheConfig && cacheService) {
      this.advancedCache = new AdvancedCache(cacheService, config.cacheConfig);
      this.logger.info(`Advanced cache initialized for ${config.serviceName}`);
    }
  }

  /**
   * Execute operation with integrated features
   */
  async execute<T>(
    operation: () => Promise<T>,
    options: {
      operationId: string;
      cacheKey?: string;
      cacheTTL?: number;
      cacheOptions?: {
        dependencies?: string[];
        tags?: string[];
        forceRefresh?: boolean;
      };
      rateLimitKey?: string;
      errorContext?: Record<string, any>;
    },
  ): Promise<T> {
    const { operationId, cacheKey, cacheTTL, cacheOptions, rateLimitKey, errorContext } = options;

    try {
      // Check rate limit
      if (this.rateLimiter && rateLimitKey) {
        const rateLimitResult = this.rateLimiter.checkLimit(rateLimitKey);
        if (!rateLimitResult.allowed) {
          const retryAfterMs = rateLimitResult.resetTime.getTime() - Date.now();
          throw new Error(`Rate limit exceeded for ${rateLimitKey}. Retry after ${retryAfterMs}ms`);
        }
      }

      // Try cache first if enabled
      if (this.advancedCache && cacheKey) {
        const cacheResult = await this.advancedCache.get(
          cacheKey,
          operation,
          {
            ttl: cacheTTL,
            ...cacheOptions,
          },
        );

        if (cacheResult.success) {
          this.logger.debug(`Cache ${cacheResult.fromCache ? 'hit' : 'miss'} for ${operationId}`, {
            metadata: {
              cacheKey,
              fromCache: cacheResult.fromCache,
              executionTime: cacheResult.executionTime,
            },
          });
          return cacheResult.data!;
        }

        if (cacheResult.error) {
          throw cacheResult.error;
        }
      }

      // Execute operation with error handling
      if (this.errorHandler) {
        return await this.errorHandler.wrapAsync(async () => {
          return await operation();
        }, `Operation ${operationId}`)();
      }

      // Execute operation directly
      return await operation();

    } catch (error) {
      // Handle error with integrated error handler
      if (this.errorHandler) {
        throw this.errorHandler.handleError(error as Error, {
          operation: operationId,
          context: errorContext,
        });
      }

      throw error;
    }
  }

  /**
   * Get rate limiter instance
   */
  getRateLimiter(): RateLimiter | undefined {
    return this.rateLimiter;
  }

  /**
   * Get error handler instance
   */
  getErrorHandler(): ErrorHandler | undefined {
    return this.errorHandler;
  }

  /**
   * Get advanced cache instance
   */
  getAdvancedCache(): AdvancedCache | undefined {
    return this.advancedCache;
  }

  /**
   * Get service metrics
   */
  getMetrics(): {
    rateLimiter?: any;
    errorHandler?: any;
    cache?: any;
  } {
    return {
      rateLimiter: this.rateLimiter?.getStats?.(),
      errorHandler: this.errorHandler?.getMetrics?.(),
      cache: this.advancedCache?.getMetrics(),
    };
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateCache(pattern: string): Promise<number> {
    if (!this.advancedCache) {
      return 0;
    }
    return await this.advancedCache.invalidate(pattern);
  }

  /**
   * Invalidate cache by dependency
   */
  async invalidateCacheByDependency(dependency: string): Promise<number> {
    if (!this.advancedCache) {
      return 0;
    }
    return await this.advancedCache.invalidateByDependency(dependency);
  }

  /**
   * Invalidate cache by tag
   */
  async invalidateCacheByTag(tag: string): Promise<number> {
    if (!this.advancedCache) {
      return 0;
    }
    return await this.advancedCache.invalidateByTag(tag);
  }
}

/**
 * Factory for creating integrated services with common configurations
 */
export class ServiceIntegrationFactory {
  private static readonly logger = new Logger();

  /**
   * Create PUBG service integration
   */
  static createPUBGIntegration(cacheService: CacheService): IntegratedService {
    const config: ServiceIntegrationConfig = {
      serviceName: 'PUBG',
      enableRateLimit: true,
      enableErrorHandling: true,
      enableAdvancedCache: true,
      rateLimitConfig: {
        ...RateLimitPresets.STRICT,
        windowMs: 60000, // 1 minute
        maxRequests: 100, // PUBG API limit
        keyGenerator: (req: any) => `pubg:${req.ip || 'default'}`,
      },
      cacheConfig: {
        strategy: CacheStrategy.READ_THROUGH,
        invalidationPattern: InvalidationPattern.TTL,
        defaultTTL: 300, // 5 minutes
        enableMetrics: true,
        refreshThreshold: 80, // Refresh when 80% of TTL is reached
        backgroundRefresh: true,
      },
      errorHandlerConfig: {
        enableMetrics: true,
        enableRetry: true,
        maxRetries: 3,
      },
    };

    this.logger.info('Created PUBG service integration');
    return new IntegratedService(config, cacheService);
  }

  /**
   * Create Discord service integration
   */
  static createDiscordIntegration(cacheService: CacheService): IntegratedService {
    const config: ServiceIntegrationConfig = {
      serviceName: 'Discord',
      enableRateLimit: true,
      enableErrorHandling: true,
      enableAdvancedCache: true,
      rateLimitConfig: {
        ...RateLimitPresets.MODERATE,
        windowMs: 1000, // 1 second
        maxRequests: 50, // Discord rate limit
        keyGenerator: (req: any) => `discord:${req.guildId || req.channelId || 'default'}`,
      },
      cacheConfig: {
        strategy: CacheStrategy.WRITE_THROUGH,
        invalidationPattern: InvalidationPattern.EVENT_BASED,
        defaultTTL: 600, // 10 minutes
        enableMetrics: true,
        backgroundRefresh: false,
      },
      errorHandlerConfig: {
        enableMetrics: true,
        enableRetry: true,
        maxRetries: 2,
      },
    };

    this.logger.info('Created Discord service integration');
    return new IntegratedService(config, cacheService);
  }

  /**
   * Create database service integration
   */
  static createDatabaseIntegration(cacheService: CacheService): IntegratedService {
    const config: ServiceIntegrationConfig = {
      serviceName: 'Database',
      enableRateLimit: false, // Usually not needed for DB
      enableErrorHandling: true,
      enableAdvancedCache: true,
      cacheConfig: {
        strategy: CacheStrategy.WRITE_THROUGH,
        invalidationPattern: InvalidationPattern.DEPENDENCY,
        defaultTTL: 1800, // 30 minutes
        enableMetrics: true,
        refreshThreshold: 90,
        backgroundRefresh: true,
      },
      errorHandlerConfig: {
        enableMetrics: true,
        enableRetry: true,
        maxRetries: 5,
      },
    };

    this.logger.info('Created Database service integration');
    return new IntegratedService(config, cacheService);
  }

  /**
   * Create custom integration
   */
  static createCustomIntegration(
    config: ServiceIntegrationConfig,
    cacheService?: CacheService,
  ): IntegratedService {
    this.logger.info(`Created custom service integration: ${config.serviceName}`);
    return new IntegratedService(config, cacheService);
  }
}

/**
 * Decorator for automatic service integration
 */
export function IntegratedOperation(
  options: {
    cacheKey?: string | ((args: any[]) => string);
    cacheTTL?: number;
    cacheOptions?: {
      dependencies?: string[];
      tags?: string[];
      forceRefresh?: boolean;
    };
    rateLimitKey?: string | ((args: any[]) => string);
    errorContext?: Record<string, any> | ((args: any[]) => Record<string, any>);
  } = {},
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const integration = (this as any).integration as IntegratedService;
      if (!integration) {
        return method.apply(this, args);
      }

      const cacheKey = typeof options.cacheKey === 'function' 
        ? options.cacheKey(args)
        : options.cacheKey;
      
      const rateLimitKey = typeof options.rateLimitKey === 'function'
        ? options.rateLimitKey(args)
        : options.rateLimitKey;
      
      const errorContext = typeof options.errorContext === 'function'
        ? options.errorContext(args)
        : options.errorContext;

      return await integration.execute(
        () => method.apply(this, args),
        {
          operationId: `${target.constructor.name}.${propertyName}`,
          cacheKey,
          cacheTTL: options.cacheTTL,
          cacheOptions: options.cacheOptions,
          rateLimitKey,
          errorContext,
        },
      );
    };
    
    return descriptor;
  };
}

/**
 * Migration helper for existing services
 */
export class ServiceMigrationHelper {
  private static readonly logger = new Logger();

  /**
   * Migrate existing service to use integrated features
   */
  static migrateService(
    serviceInstance: any,
    integration: IntegratedService,
    options: {
      methodsToWrap?: string[];
      cacheKeyGenerator?: (methodName: string, args: any[]) => string;
      rateLimitKeyGenerator?: (methodName: string, args: any[]) => string;
    } = {},
  ): void {
    const { methodsToWrap, cacheKeyGenerator, rateLimitKeyGenerator } = options;
    
    // Get all methods if not specified
    const methods = methodsToWrap || Object.getOwnPropertyNames(Object.getPrototypeOf(serviceInstance))
      .filter(name => {
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(serviceInstance), name);
        return descriptor && typeof descriptor.value === 'function' && name !== 'constructor';
      });

    for (const methodName of methods) {
      const originalMethod = serviceInstance[methodName];
      if (typeof originalMethod !== 'function') {
        continue;
      }

      serviceInstance[methodName] = async function (...args: any[]) {
        const cacheKey = cacheKeyGenerator 
          ? cacheKeyGenerator(methodName, args)
          : `${serviceInstance.constructor.name}.${methodName}:${JSON.stringify(args)}`;
        
        const rateLimitKey = rateLimitKeyGenerator
          ? rateLimitKeyGenerator(methodName, args)
          : `${serviceInstance.constructor.name}.${methodName}`;

        return await integration.execute(
          () => originalMethod.apply(serviceInstance, args),
          {
            operationId: `${serviceInstance.constructor.name}.${methodName}`,
            cacheKey,
            rateLimitKey,
            errorContext: { methodName, args: args.length },
          },
        );
      };
    }

    // Add integration instance to service
    serviceInstance.integration = integration;

    this.logger.info(`Migrated service ${serviceInstance.constructor.name} with ${methods.length} methods`);
  }

  /**
   * Create integration configuration from existing service patterns
   */
  static analyzeAndCreateConfig(
    serviceInstance: any,
    serviceName: string,
  ): ServiceIntegrationConfig {
    const config: ServiceIntegrationConfig = {
      serviceName,
      enableRateLimit: false,
      enableErrorHandling: true,
      enableAdvancedCache: false,
    };

    // Analyze service for existing patterns
    const serviceCode = serviceInstance.toString();
    
    // Check for rate limiting patterns
    if (serviceCode.includes('rateLimitDelay') || 
        serviceCode.includes('setTimeout') ||
        serviceCode.includes('rate limit')) {
      config.enableRateLimit = true;
      config.rateLimitConfig = RateLimitPresets.MODERATE;
      this.logger.info(`Detected rate limiting patterns in ${serviceName}`);
    }

    // Check for caching patterns
    if (serviceCode.includes('cache') || 
        serviceCode.includes('Cache') ||
        serviceCode.includes('get(') ||
        serviceCode.includes('set(')) {
      config.enableAdvancedCache = true;
      config.cacheConfig = {
        strategy: CacheStrategy.READ_THROUGH,
        invalidationPattern: InvalidationPattern.TTL,
        defaultTTL: 300,
        enableMetrics: true,
      };
      this.logger.info(`Detected caching patterns in ${serviceName}`);
    }

    // Check for API patterns
    if (serviceCode.includes('axios') ||
        serviceCode.includes('fetch') ||
        serviceCode.includes('http')) {
      config.enableRateLimit = true;
      config.rateLimitConfig = RateLimitPresets.MODERATE;
      this.logger.info(`Detected API patterns in ${serviceName}`);
    }

    return config;
  }
}

/**
 * Health check utility for integrated services
 */
export class ServiceHealthChecker {
  private static readonly logger = new Logger();

  /**
   * Perform health check on integrated service
   */
  static async checkHealth(integration: IntegratedService): Promise<{
    healthy: boolean;
    metrics: any;
    issues: string[];
  }> {
    const issues: string[] = [];
    let healthy = true;

    try {
      const metrics = integration.getMetrics();
      
      // Check rate limiter health
      const rateLimiter = integration.getRateLimiter();
      if (rateLimiter) {
        // Add rate limiter specific checks
        this.logger.debug('Rate limiter is active');
      }

      // Check error handler health
      const errorHandler = integration.getErrorHandler();
      if (errorHandler) {
        // Add error handler specific checks
        this.logger.debug('Error handler is active');
      }

      // Check cache health
      const cache = integration.getAdvancedCache();
      if (cache) {
        const cacheMetrics = cache.getMetrics();
        if (cacheMetrics.hitRate < 50) {
          issues.push('Low cache hit rate detected');
        }
        this.logger.debug('Advanced cache is active', { hitRate: cacheMetrics.hitRate } as any);
      }

      if (issues.length > 0) {
        healthy = false;
      }

      return {
        healthy,
        metrics,
        issues,
      };

    } catch (error) {
      this.logger.error('Health check failed', { error });
      return {
        healthy: false,
        metrics: {},
        issues: [`Health check failed: ${(error as Error).message}`],
      };
    }
  }
}