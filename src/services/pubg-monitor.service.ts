import { Logger } from '../utils/logger';
import { PUBGService } from './pubg.service';
import { CacheService } from './cache.service';
import { LoggingService } from './logging.service';
import { PUBGPlatform } from '../types/pubg';

export interface PUBGMonitorConfig {
  /** Interval between health checks in milliseconds (default: 5 minutes) */
  healthCheckInterval: number;
  /** Interval between API availability tests in milliseconds (default: 2 minutes) */
  apiTestInterval: number;
  /** Maximum consecutive failures before marking as critical (default: 3) */
  maxConsecutiveFailures: number;
  /** Enable automatic recovery attempts (default: true) */
  enableAutoRecovery: boolean;
  /** Recovery attempt interval in milliseconds (default: 10 minutes) */
  recoveryInterval: number;
}

export interface PUBGMonitorStatus {
  isHealthy: boolean;
  lastHealthCheck: Date;
  lastApiTest: Date;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  uptime: number;
  apiResponseTime: number;
  circuitBreakerStatus: string;
  lastError?: string;
}

/**
 * PUBG API Monitoring Service
 * Continuously monitors PUBG API health and performance
 */
export class PUBGMonitorService {
  private readonly logger: Logger;
  private readonly pubgService: PUBGService;
  private readonly cache: CacheService;
  private readonly loggingService: LoggingService | null;

  private readonly config: PUBGMonitorConfig;
  private status: PUBGMonitorStatus;

  private healthCheckTimer?: NodeJS.Timeout;
  private apiTestTimer?: NodeJS.Timeout;
  private recoveryTimer?: NodeJS.Timeout;

  private startTime: Date;
  private isRunning: boolean = false;

  constructor(
    pubgService: PUBGService,
    cache: CacheService,
    loggingService?: LoggingService,
    config?: Partial<PUBGMonitorConfig>
  ) {
    this.logger = new Logger();
    this.pubgService = pubgService;
    this.cache = cache;
    this.loggingService = loggingService || null;

    this.config = {
      healthCheckInterval: 5 * 60 * 1000, // 5 minutes
      apiTestInterval: 2 * 60 * 1000, // 2 minutes
      maxConsecutiveFailures: 3,
      enableAutoRecovery: true,
      recoveryInterval: 10 * 60 * 1000, // 10 minutes
      ...config,
    };

    this.startTime = new Date();
    this.status = {
      isHealthy: true,
      lastHealthCheck: new Date(),
      lastApiTest: new Date(),
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      uptime: 0,
      apiResponseTime: 0,
      circuitBreakerStatus: 'closed',
    };
  }

  /**
   * Start monitoring the PUBG API
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('PUBG Monitor is already running');
      return;
    }

    this.logger.info('Starting PUBG API monitoring...', {
      metadata: {
        healthCheckInterval: this.config.healthCheckInterval,
        apiTestInterval: this.config.apiTestInterval,
        maxConsecutiveFailures: this.config.maxConsecutiveFailures,
      },
    });

    this.isRunning = true;
    this.startTime = new Date();

    // Initial health check
    await this.performHealthCheck();

    // Schedule periodic checks
    this.healthCheckTimer = setInterval(
      () => this.performHealthCheck(),
      this.config.healthCheckInterval
    );

    this.apiTestTimer = setInterval(() => this.performApiTest(), this.config.apiTestInterval);

    // Log monitoring start
    if (this.loggingService) {
      await this.loggingService.logApiOperation(
        'global',
        'PUBG Monitor',
        'Monitor Started',
        true,
        undefined,
        undefined,
        {
          healthCheckInterval: this.config.healthCheckInterval,
          apiTestInterval: this.config.apiTestInterval,
          maxConsecutiveFailures: this.config.maxConsecutiveFailures,
        }
      );
    }
  }

  /**
   * Stop monitoring the PUBG API
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('PUBG Monitor is not running');
      return;
    }

    this.logger.info('Stopping PUBG API monitoring...');
    this.isRunning = false;

    // Clear timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    if (this.apiTestTimer) {
      clearInterval(this.apiTestTimer);
      this.apiTestTimer = undefined;
    }

    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }

    // Log monitoring stop
    if (this.loggingService) {
      await this.loggingService.logApiOperation(
        'global',
        'PUBG Monitor',
        'Monitor Stopped',
        true,
        undefined,
        undefined,
        {
          totalFailures: this.status.totalFailures,
          totalSuccesses: this.status.totalSuccesses,
          uptime: Date.now() - this.startTime.getTime(),
        }
      );
    }
  }

  /**
   * Get current monitoring status
   */
  public getStatus(): PUBGMonitorStatus {
    return {
      ...this.status,
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      this.logger.info('Performing PUBG API health check...');
      const startTime = Date.now();

      const health = await this.pubgService.healthCheck();
      const responseTime = Date.now() - startTime;

      this.status.lastHealthCheck = new Date();
      this.status.apiResponseTime = responseTime;
      this.status.circuitBreakerStatus = health.circuitBreaker;

      if (health.status === 'healthy') {
        await this.handleHealthyStatus();
      } else {
        await this.handleUnhealthyStatus(health.status, `API status: ${health.status}`);
      }
    } catch (error: any) {
      this.logger.error('Health check failed:', error);
      await this.handleUnhealthyStatus('error', error.message);
    }
  }

  /**
   * Perform API availability test
   */
  private async performApiTest(): Promise<void> {
    try {
      this.logger.info('Testing PUBG API availability...');
      const startTime = Date.now();

      const isAvailable = await this.pubgService.isAPIAvailable();
      const responseTime = Date.now() - startTime;

      this.status.lastApiTest = new Date();
      this.status.apiResponseTime = Math.min(this.status.apiResponseTime, responseTime);

      if (isAvailable) {
        await this.handleHealthyStatus();
      } else {
        await this.handleUnhealthyStatus('unavailable', 'API is not available');
      }
    } catch (error: any) {
      this.logger.error('API test failed:', error);
      await this.handleUnhealthyStatus('error', error.message);
    }
  }

  /**
   * Handle healthy API status
   */
  private async handleHealthyStatus(): Promise<void> {
    const wasUnhealthy = !this.status.isHealthy;

    this.status.isHealthy = true;
    this.status.consecutiveFailures = 0;
    this.status.totalSuccesses++;
    delete this.status.lastError;

    // Clear recovery timer if running
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }

    // Log recovery if API was previously unhealthy
    if (wasUnhealthy && this.loggingService) {
      await this.loggingService.logApiOperation(
        'global',
        'PUBG API',
        'API Recovered',
        true,
        undefined,
        undefined,
        {
          responseTime: this.status.apiResponseTime,
          totalFailures: this.status.totalFailures,
          totalSuccesses: this.status.totalSuccesses,
        }
      );
    }
  }

  /**
   * Handle unhealthy API status
   */
  private async handleUnhealthyStatus(status: string, error: string): Promise<void> {
    const wasHealthy = this.status.isHealthy;

    this.status.isHealthy = false;
    this.status.consecutiveFailures++;
    this.status.totalFailures++;
    this.status.lastError = error;

    // Log critical failure
    if (this.status.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      this.logger.error(
        `PUBG API critical failure: ${this.status.consecutiveFailures} consecutive failures`
      );

      if (this.loggingService) {
        await this.loggingService.logApiOperation(
          'global',
          'PUBG API',
          'Critical Failure',
          false,
          undefined,
          error,
          {
            status,
            consecutiveFailures: this.status.consecutiveFailures,
            lastHealthCheck: this.status.lastHealthCheck,
          }
        );
      }

      // Start recovery attempts if enabled
      if (this.config.enableAutoRecovery && !this.recoveryTimer) {
        this.startRecoveryAttempts();
      }
    } else if (wasHealthy && this.loggingService) {
      // Log first failure
      await this.loggingService.logApiOperation(
        'global',
        'PUBG API',
        'Health Check Failed',
        false,
        undefined,
        error,
        {
          status,
          consecutiveFailures: this.status.consecutiveFailures,
        }
      );
    }
  }

  /**
   * Start automatic recovery attempts
   */
  private startRecoveryAttempts(): void {
    this.logger.info('Starting automatic recovery attempts...');

    this.recoveryTimer = setInterval(async () => {
      try {
        this.logger.info('Attempting PUBG API recovery...');

        // Clear cache to force fresh requests
        await this.pubgService.clearCache();

        // Test API availability
        const isAvailable = await this.pubgService.isAPIAvailable();

        if (isAvailable) {
          this.logger.info('PUBG API recovery successful');
          await this.handleHealthyStatus();
        } else {
          this.logger.warn('PUBG API recovery attempt failed');
        }
      } catch (error: any) {
        this.logger.error('Recovery attempt failed:', error);
      }
    }, this.config.recoveryInterval);
  }

  /**
   * Force a manual recovery attempt
   */
  public async forceRecovery(): Promise<boolean> {
    try {
      this.logger.info('Forcing PUBG API recovery attempt...');

      // Clear all caches
      await this.pubgService.clearCache();

      // Perform health check
      await this.performHealthCheck();

      return this.status.isHealthy;
    } catch (error: any) {
      this.logger.error('Forced recovery failed:', error);
      return false;
    }
  }

  /**
   * Get monitoring statistics
   */
  public getStatistics(): {
    uptime: number;
    totalChecks: number;
    successRate: number;
    averageResponseTime: number;
    currentStatus: string;
  } {
    const totalChecks = this.status.totalSuccesses + this.status.totalFailures;
    const successRate = totalChecks > 0 ? (this.status.totalSuccesses / totalChecks) * 100 : 0;

    return {
      uptime: Date.now() - this.startTime.getTime(),
      totalChecks,
      successRate,
      averageResponseTime: this.status.apiResponseTime,
      currentStatus: this.status.isHealthy ? 'healthy' : 'unhealthy',
    };
  }
}
