import { EventEmitter } from 'events';
import * as os from 'os';
import * as process from 'process';
import { productionConfig } from '../config/production.config';
import { productionLogger, createLogContext } from '../utils/production-logger';
import { LogCategory } from '../utils/logger';
import { MetricsService } from './metrics.service';
import { ExtendedClient } from '../types/client';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  responseTime?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
  process: {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
  discord: {
    guilds: number;
    users: number;
    channels: number;
    ping: number;
  };
  database: {
    connections: number;
    queries: number;
    slowQueries: number;
  };
  cache: {
    hits: number;
    misses: number;
    keys: number;
    memory: number;
  };
}

export interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  service: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: Record<string, any>;
}

class ProductionMonitoringService extends EventEmitter {
  private healthChecks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  private metrics: SystemMetrics | null = null;
  private alerts: Map<string, Alert> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private discordClient: ExtendedClient | null = null;
  private metricsService: MetricsService | null = null;

  // Counters for metrics
  private counters = {
    commands: 0,
    apiRequests: 0,
    dbQueries: 0,
    slowQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    rateLimitChecks: 0,
    rateLimitBlocked: 0,
  };

  constructor(discordClient?: ExtendedClient, metricsService?: MetricsService) {
    super();
    this.discordClient = discordClient || null;
    this.metricsService = metricsService || null;
    this.setupDefaultHealthChecks();
    // Process handlers will be setup when start() is called
  }

  setDiscordClient(client: ExtendedClient): void {
    this.discordClient = client;
  }

  setMetricsService(service: MetricsService): void {
    this.metricsService = service;
  }

  private setupDefaultHealthChecks(): void {
    // System health check
    this.registerHealthCheck('system', async () => {
      const startTime = Date.now();
      const cpuUsage = process.cpuUsage();
      const memUsage = process.memoryUsage();
      const responseTime = Date.now() - startTime;

      const memoryPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      const status =
        memoryPercentage > 90 ? 'unhealthy' : memoryPercentage > 70 ? 'degraded' : 'healthy';

      return {
        service: 'system',
        status,
        responseTime,
        timestamp: new Date(),
        metadata: {
          memory: memUsage,
          cpu: cpuUsage,
          uptime: process.uptime(),
        },
      };
    });

    // Database health check
    this.registerHealthCheck('database', async () => {
      const startTime = Date.now();
      try {
        // Simple query to check database connectivity
        // This would be replaced with actual database ping
        await new Promise(resolve => setTimeout(resolve, 10));

        const responseTime = Date.now() - startTime;
        const status = responseTime > 1000 ? 'degraded' : 'healthy';

        return {
          service: 'database',
          status,
          responseTime,
          timestamp: new Date(),
        };
      } catch (error) {
        return {
          service: 'database',
          status: 'unhealthy' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Date.now() - startTime,
          timestamp: new Date(),
        };
      }
    });

    // Redis health check
    this.registerHealthCheck('redis', async () => {
      const startTime = Date.now();
      try {
        // Redis ping would go here
        await new Promise(resolve => setTimeout(resolve, 5));

        const responseTime = Date.now() - startTime;
        const status = responseTime > 500 ? 'degraded' : 'healthy';

        return {
          service: 'redis',
          status,
          responseTime,
          timestamp: new Date(),
        };
      } catch (error) {
        return {
          service: 'redis',
          status: 'unhealthy' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
          responseTime: Date.now() - startTime,
          timestamp: new Date(),
        };
      }
    });

    // Discord health check
    this.registerHealthCheck('discord', this.checkDiscordHealth.bind(this));
  }

  private setupProcessHandlers(): void {
    // Graceful shutdown
    process.on('SIGTERM', () => {
      productionLogger.info('Received SIGTERM, starting graceful shutdown', {
        category: LogCategory.SYSTEM,
      });
      this.shutdown();
    });

    process.on('SIGINT', () => {
      productionLogger.info('Received SIGINT, starting graceful shutdown', {
        category: LogCategory.SYSTEM,
      });
      this.shutdown();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
      productionLogger.error(
        'Uncaught exception',
        createLogContext(LogCategory.SYSTEM, {
          error,
        })
      );
      this.createAlert('critical', 'system', `Uncaught exception: ${error.message}`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      productionLogger.error(
        'Unhandled promise rejection',
        createLogContext(LogCategory.SYSTEM, {
          metadata: { reason, promise },
        })
      );
      this.createAlert('critical', 'system', `Unhandled promise rejection: ${reason}`);
    });
  }

  registerHealthCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.healthChecks.set(name, check);
    productionLogger.info(`Health check registered: ${name}`, createLogContext(LogCategory.SYSTEM));
  }

  async runHealthChecks(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const [name, check] of this.healthChecks) {
      try {
        const result = await Promise.race([
          check(),
          new Promise<HealthCheckResult>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          ),
        ]);
        results.push(result);

        // Log health check result
        productionLogger.healthCheck(
          name,
          result.status,
          createLogContext(LogCategory.SYSTEM, {
            duration: result.responseTime,
            metadata: result.metadata,
          })
        );

        // Create alerts for unhealthy services
        if (result.status === 'unhealthy') {
          this.createAlert('critical', name, result.message || 'Service is unhealthy');
        } else if (result.status === 'degraded') {
          this.createAlert('warning', name, result.message || 'Service is degraded');
        }
      } catch (error) {
        const result: HealthCheckResult = {
          service: name,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        };
        results.push(result);

        productionLogger.error(
          `Health check failed: ${name}`,
          createLogContext(LogCategory.SYSTEM, {
            error: error instanceof Error ? error : new Error(String(error)),
          })
        );
      }
    }

    return results;
  }

  collectMetrics(): SystemMetrics {
    const now = new Date();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    this.metrics = {
      timestamp: now,
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        loadAverage: os.loadavg(),
      },
      memory: {
        used: memUsage.heapUsed,
        free: os.freemem(),
        total: os.totalmem(),
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: memUsage,
        cpuUsage,
      },
      discord: this.getDiscordMetrics(),
      database: {
        connections: 0, // Would be populated by database service
        queries: this.counters.dbQueries,
        slowQueries: this.counters.slowQueries,
      },
      cache: {
        hits: this.counters.cacheHits,
        misses: this.counters.cacheMisses,
        keys: 0, // Would be populated by cache service
        memory: 0,
      },
    };

    // Log performance metrics
    productionLogger.performance(
      'memory_usage',
      this.metrics.memory.percentage,
      createLogContext(LogCategory.PERFORMANCE)
    );

    productionLogger.performance(
      'cpu_usage',
      this.metrics.cpu.usage,
      createLogContext(LogCategory.PERFORMANCE)
    );

    // Check for performance alerts
    if (this.metrics.memory.percentage > 90) {
      this.createAlert(
        'critical',
        'system',
        `High memory usage: ${this.metrics.memory.percentage.toFixed(2)}%`
      );
    } else if (this.metrics.memory.percentage > 80) {
      this.createAlert(
        'warning',
        'system',
        `High memory usage: ${this.metrics.memory.percentage.toFixed(2)}%`
      );
    }

    return this.metrics;
  }

  createAlert(
    type: Alert['type'],
    service: string,
    message: string,
    metadata?: Record<string, any>
  ): void {
    const alert: Alert = {
      id: `${service}-${Date.now()}`,
      type,
      service,
      message,
      timestamp: new Date(),
      resolved: false,
      metadata,
    };

    this.alerts.set(alert.id, alert);
    this.emit('alert', alert);

    productionLogger.security(
      `Alert created: ${type}`,
      createLogContext(LogCategory.SECURITY, {
        metadata: { alert },
      })
    );
  }

  resolveAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alertResolved', alert);

      productionLogger.info(
        `Alert resolved: ${alertId}`,
        createLogContext(LogCategory.SYSTEM, {
          metadata: { alert },
        })
      );
    }
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  getMetrics(): SystemMetrics | null {
    return this.metrics;
  }

  // Counter methods for tracking metrics
  incrementCounter(counter: keyof typeof this.counters): void {
    this.counters[counter]++;
  }

  getCounters(): typeof this.counters {
    return { ...this.counters };
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Setup process handlers when starting
    this.setupProcessHandlers();

    // Run health checks every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.runHealthChecks();
    }, productionConfig.monitoring.healthCheckInterval);

    // Collect metrics every 60 seconds
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 60000);

    productionLogger.info('Production monitoring started', createLogContext(LogCategory.SYSTEM));
  }

  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    productionLogger.info('Production monitoring stopped', createLogContext(LogCategory.SYSTEM));

    // Wait for graceful shutdown timeout
    await new Promise(resolve => setTimeout(resolve, productionConfig.shutdown.timeout));
  }

  // Express middleware for API monitoring
  apiMonitoringMiddleware() {
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.incrementCounter('apiRequests');

        productionLogger.apiRequest(
          req.method,
          req.originalUrl,
          res.statusCode,
          duration,
          createLogContext(LogCategory.API, {
            requestId: req.id,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
          })
        );
      });

      next();
    };
  }

  private getDiscordMetrics() {
    if (!this.discordClient || !this.discordClient.isReady()) {
      return {
        guilds: 0,
        users: 0,
        channels: 0,
        ping: 0,
      };
    }

    try {
      const guilds = this.discordClient.guilds.cache.size;
      const users = this.discordClient.guilds.cache.reduce(
        (acc, guild) => acc + (guild.memberCount || 0),
        0
      );
      const channels = this.discordClient.channels.cache.size;
      const ping = this.discordClient.ws.ping;

      // Log Discord metrics
      productionLogger.performance(
        'discord_guilds',
        guilds,
        createLogContext(LogCategory.PERFORMANCE, {
          metadata: { service: 'discord' },
        })
      );

      productionLogger.performance(
        'discord_users',
        users,
        createLogContext(LogCategory.PERFORMANCE, {
          metadata: { service: 'discord' },
        })
      );

      productionLogger.performance(
        'discord_ping',
        ping,
        createLogContext(LogCategory.PERFORMANCE, {
          metadata: { service: 'discord' },
        })
      );

      // Create alerts for Discord connectivity issues
      if (ping > 1000) {
        this.createAlert('warning', 'discord', `High Discord latency: ${ping}ms`);
      } else if (ping > 2000) {
        this.createAlert('critical', 'discord', `Very high Discord latency: ${ping}ms`);
      }

      return {
        guilds,
        users,
        channels,
        ping,
      };
    } catch (error) {
      productionLogger.error(
        'Failed to collect Discord metrics',
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
        })
      );

      return {
        guilds: 0,
        users: 0,
        channels: 0,
        ping: -1,
      };
    }
  }

  // Enhanced health check for Discord
  private async checkDiscordHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      if (!this.discordClient) {
        return {
          service: 'discord',
          status: 'unhealthy',
          message: 'Discord client not initialized',
          responseTime: Date.now() - startTime,
          timestamp: new Date(),
        };
      }

      if (!this.discordClient.isReady()) {
        return {
          service: 'discord',
          status: 'unhealthy',
          message: 'Discord client not ready',
          responseTime: Date.now() - startTime,
          timestamp: new Date(),
        };
      }

      const ping = this.discordClient.ws.ping;
      const guilds = this.discordClient.guilds.cache.size;
      const responseTime = Date.now() - startTime;

      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let message = 'Discord connection is healthy';

      if (ping > 2000) {
        status = 'unhealthy';
        message = `Very high latency: ${ping}ms`;
      } else if (ping > 1000) {
        status = 'degraded';
        message = `High latency: ${ping}ms`;
      }

      return {
        service: 'discord',
        status,
        message,
        responseTime,
        timestamp: new Date(),
        metadata: {
          ping,
          guilds,
          users: this.discordClient.users.cache.size,
          channels: this.discordClient.channels.cache.size,
        },
      };
    } catch (error) {
      return {
        service: 'discord',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown Discord error',
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }
}

// Export singleton instance
export const productionMonitoring = new ProductionMonitoringService();
export default productionMonitoring;
