import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { PUBGService } from './pubg.service';
import { CacheService } from './cache.service';
import { SchedulerService } from './scheduler.service';
import { LoggingService } from './logging.service';
import { MetricsService } from './metrics.service';
import { AlertService, AlertConfig } from './alert.service';
import { StructuredLogger, StructuredLoggerConfig } from './structured-logger.service';
import { ExtendedClient } from '../types/client';
import { performance } from 'perf_hooks';
import os from 'os';
import process from 'process';

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime: number;
  details?: string;
  metrics?: Record<string, any>;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  services: ServiceHealth[];
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
      loadAverage: number[];
    };
    disk: {
      available: number;
      total: number;
      percentage: number;
    };
  };
  discord: {
    connected: boolean;
    guilds: number;
    users: number;
    ping: number;
  };
}

export class HealthService {
  private static instance: HealthService;
  private readonly logger = new Logger();
  private structuredLogger: StructuredLogger;
  private lastHealthCheck: SystemHealth | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly healthCheckIntervalMs = 30000; // 30 seconds
  private readonly services: Map<string, () => Promise<ServiceHealth>> = new Map();
  private metricsService: MetricsService;
  private alertService?: AlertService;

  private constructor(
    private readonly client: ExtendedClient,
    private readonly databaseService: DatabaseService,
    private readonly cacheService: CacheService,
    private readonly schedulerService: SchedulerService,
    private readonly loggingService: LoggingService,
    private readonly pubgService?: PUBGService,
    private readonly alertConfig?: AlertConfig,
    private readonly loggerConfig?: StructuredLoggerConfig
  ) {
    // Setup structured logging
    const defaultLoggerConfig: StructuredLoggerConfig = {
      level: 'info',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      logDir: './logs',
      maxFiles: 14,
      maxSize: '20m',
      enableConsole: true,
      enableFile: true,
    };
    this.structuredLogger = new StructuredLogger(
      { ...defaultLoggerConfig, ...this.loggerConfig },
      'HealthService'
    );

    this.metricsService = new MetricsService(databaseService, cacheService, client);

    // Setup alert service
    if (this.alertConfig) {
      this.alertService = new AlertService(this.alertConfig, this.databaseService, this.client);
    }

    this.registerServices();
  }

  public static getInstance(
    client: ExtendedClient,
    databaseService: DatabaseService,
    cacheService: CacheService,
    schedulerService: SchedulerService,
    loggingService: LoggingService,
    pubgService?: PUBGService,
    alertConfig?: AlertConfig,
    loggerConfig?: StructuredLoggerConfig
  ): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService(
        client,
        databaseService,
        cacheService,
        schedulerService,
        loggingService,
        pubgService,
        alertConfig,
        loggerConfig
      );
    }
    return HealthService.instance;
  }

  /**
   * Register all service health checkers
   */
  private registerServices(): void {
    // Database service
    this.services.set('database', async () => {
      const start = performance.now();
      try {
        const isHealthy = await this.databaseService.healthCheck();
        const responseTime = performance.now() - start;

        return {
          name: 'Database',
          status: isHealthy ? 'healthy' : 'unhealthy',
          lastCheck: new Date(),
          responseTime,
          details: isHealthy ? 'Connection successful' : 'Connection failed',
        };
      } catch (error) {
        const responseTime = performance.now() - start;
        return {
          name: 'Database',
          status: 'unhealthy',
          lastCheck: new Date(),
          responseTime,
          details: `Error: ${(error as Error).message}`,
        };
      }
    });

    // Cache service
    this.services.set('cache', async () => {
      const start = performance.now();
      try {
        const testKey = 'health:test';
        const testValue = `test-${Date.now()}`;

        await this.cacheService.set(testKey, testValue, 10);
        const retrieved = await this.cacheService.get(testKey);
        await this.cacheService.del(testKey);

        const isHealthy = retrieved === testValue;
        const responseTime = performance.now() - start;
        // Cache metrics not available, using basic info
        const metrics = { connected: true };

        return {
          name: 'Cache',
          status: isHealthy ? 'healthy' : 'unhealthy',
          lastCheck: new Date(),
          responseTime,
          details: isHealthy ? 'Read/write successful' : 'Read/write failed',
          metrics: {
            connected: metrics.connected,
          },
        };
      } catch (error) {
        const responseTime = performance.now() - start;
        return {
          name: 'Cache',
          status: 'unhealthy',
          lastCheck: new Date(),
          responseTime,
          details: `Error: ${(error as Error).message}`,
        };
      }
    });

    // Scheduler service
    this.services.set('scheduler', async () => {
      const start = performance.now();
      try {
        const stats = this.schedulerService.getStatistics();
        const responseTime = performance.now() - start;

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        let details = 'All tasks running normally';

        if (stats.failedExecutions > 0) {
          const failureRate = stats.failedExecutions / stats.totalExecutions;
          if (failureRate > 0.5) {
            status = 'unhealthy';
            details = `High failure rate: ${Math.round(failureRate * 100)}%`;
          } else if (failureRate > 0.1) {
            status = 'degraded';
            details = `Moderate failure rate: ${Math.round(failureRate * 100)}%`;
          }
        }

        return {
          name: 'Scheduler',
          status,
          lastCheck: new Date(),
          responseTime,
          details,
          metrics: {
            totalTasks: stats.totalTasks,
            activeTasks: stats.activeTasks,
            successfulExecutions: stats.successfulExecutions,
            failedExecutions: stats.failedExecutions,
            averageExecutionTime: stats.averageExecutionTime,
          },
        };
      } catch (error) {
        const responseTime = performance.now() - start;
        return {
          name: 'Scheduler',
          status: 'unhealthy',
          lastCheck: new Date(),
          responseTime,
          details: `Error: ${(error as Error).message}`,
        };
      }
    });

    // Logging service
    this.services.set('logging', async () => {
      const start = performance.now();
      try {
        const stats = this.loggingService.getStats();
        const responseTime = performance.now() - start;

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        let details = 'Logging system operational';

        if (stats.queueSize > 1000) {
          status = 'degraded';
          details = `High queue size: ${stats.queueSize}`;
        } else if (stats.queueSize > 5000) {
          status = 'unhealthy';
          details = `Critical queue size: ${stats.queueSize}`;
        }

        return {
          name: 'Logging',
          status,
          lastCheck: new Date(),
          responseTime,
          details,
          metrics: {
            queueSize: stats.queueSize,
            configuredGuilds: stats.configuredGuilds,
          },
        };
      } catch (error) {
        const responseTime = performance.now() - start;
        return {
          name: 'Logging',
          status: 'unhealthy',
          lastCheck: new Date(),
          responseTime,
          details: `Error: ${(error as Error).message}`,
        };
      }
    });

    // PUBG service (if available)
    if (this.pubgService) {
      this.services.set('pubg', async () => {
        const start = performance.now();
        try {
          const health = await this.pubgService!.healthCheck();
          const responseTime = performance.now() - start;

          let status: 'healthy' | 'degraded' | 'unhealthy';
          if (health.status === 'healthy') {
            status = 'healthy';
          } else if (health.status === 'degraded') {
            status = 'degraded';
          } else {
            status = 'unhealthy';
          }

          return {
            name: 'PUBG API',
            status,
            lastCheck: new Date(),
            responseTime,
            details: `API: ${health.api ? 'Online' : 'Offline'}, Cache: ${health.cache ? 'Online' : 'Offline'}`,
            metrics: {
              apiStatus: health.api,
              cacheStatus: health.cache,
              circuitBreaker: health.circuitBreaker,
              failures: health.metrics.failures,
            },
          };
        } catch (error) {
          const responseTime = performance.now() - start;
          return {
            name: 'PUBG API',
            status: 'unhealthy',
            lastCheck: new Date(),
            responseTime,
            details: `Error: ${(error as Error).message}`,
          };
        }
      });
    }

    // Discord client
    this.services.set('discord', async () => {
      const start = performance.now();
      try {
        const isReady = this.client.isReady();
        const responseTime = performance.now() - start;

        return {
          name: 'Discord Client',
          status: isReady ? 'healthy' : 'unhealthy',
          lastCheck: new Date(),
          responseTime,
          details: isReady ? 'Client connected and ready' : 'Client not ready',
          metrics: {
            guilds: this.client.guilds.cache.size,
            users: this.client.users.cache.size,
            ping: this.client.ws.ping,
            uptime: this.client.uptime,
          },
        };
      } catch (error) {
        const responseTime = performance.now() - start;
        return {
          name: 'Discord Client',
          status: 'unhealthy',
          lastCheck: new Date(),
          responseTime,
          details: `Error: ${(error as Error).message}`,
        };
      }
    });
  }

  /**
   * Perform comprehensive health check
   */
  public async performHealthCheck(): Promise<SystemHealth> {
    const start = performance.now();
    this.logger.info('Starting comprehensive health check');

    try {
      // Check all services in parallel
      const serviceChecks = Array.from(this.services.entries()).map(async ([name, checker]) => {
        try {
          return await checker();
        } catch (error) {
          this.logger.error(`Health check failed for service ${name}:`, error);
          return {
            name,
            status: 'unhealthy' as const,
            lastCheck: new Date(),
            responseTime: 0,
            details: `Health check failed: ${(error as Error).message}`,
          };
        }
      });

      const services = await Promise.all(serviceChecks);

      // Get system metrics from MetricsService
      const systemMetrics = this.metricsService.getSystemMetrics();

      // Calculate overall status
      const healthyServices = services.filter(s => s.status === 'healthy').length;
      const degradedServices = services.filter(s => s.status === 'degraded').length;
      const unhealthyServices = services.filter(s => s.status === 'unhealthy').length;

      let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
      if (unhealthyServices > 0) {
        overallStatus = unhealthyServices > services.length / 2 ? 'unhealthy' : 'degraded';
      } else if (degradedServices > 0) {
        overallStatus = 'degraded';
      } else {
        overallStatus = 'healthy';
      }

      const systemHealth: SystemHealth = {
        overall: overallStatus,
        timestamp: new Date(),
        uptime: process.uptime(),
        services,
        system: {
          memory: systemMetrics.memory,
          cpu: systemMetrics.cpu,
          disk: {
            available: 0, // Would need additional library for disk usage
            total: 0,
            percentage: 0,
          },
        },
        discord: {
          connected: this.client.isReady(),
          guilds: this.client.guilds.cache.size,
          users: this.client.users.cache.size,
          ping: this.client.ws.ping,
        },
      };

      this.lastHealthCheck = systemHealth;

      const duration = performance.now() - start;

      // Record metrics
      this.metricsService.recordMetric('health_check_duration', duration, 'gauge');
      this.metricsService.recordMetric(
        'health_check_status',
        overallStatus === 'healthy' ? 1 : 0,
        'gauge'
      );
      this.metricsService.recordMetric('health_services_total', services.length, 'gauge');
      this.metricsService.recordMetric('health_services_healthy', healthyServices, 'gauge');

      this.logger.info(`Health check completed in ${Math.round(duration)}ms`, {
        metadata: {
          overall: overallStatus,
          healthyServices,
          degradedServices,
          unhealthyServices,
          duration,
        },
      });

      // Structured logging for performance tracking
      this.structuredLogger.logPerformance('health_check', duration, {
        overallStatus,
        servicesCount: services.length,
        memoryUsage: systemMetrics.memory.percentage,
        cpuUsage: systemMetrics.cpu.usage,
        discordConnected: this.client.isReady(),
      });

      // Log critical issues
      if (overallStatus === 'unhealthy') {
        this.logger.error('System health is UNHEALTHY', {
          metadata: {
            unhealthyServices: services.filter(s => s.status === 'unhealthy').map(s => s.name),
          },
        });
        this.structuredLogger.error('System health critical', new Error('System unhealthy'), {
          metadata: {
            unhealthyServices: services.filter(s => s.status === 'unhealthy').map(s => s.name),
            timestamp: new Date().toISOString(),
          },
        });
      } else if (overallStatus === 'degraded') {
        this.logger.warn('System health is DEGRADED', {
          metadata: {
            degradedServices: services.filter(s => s.status === 'degraded').map(s => s.name),
            unhealthyServices: services.filter(s => s.status === 'unhealthy').map(s => s.name),
          },
        });
        this.structuredLogger.warn('System health degraded', {
          metadata: {
            degradedServices: services.filter(s => s.status === 'degraded').map(s => s.name),
            unhealthyServices: services.filter(s => s.status === 'unhealthy').map(s => s.name),
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Check for health-based alerts
      await this.checkHealthAlerts(systemHealth);

      return systemHealth;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      this.structuredLogger.error('Health check failed', error, {
        metadata: {
          duration: performance.now() - start,
          timestamp: new Date().toISOString(),
        },
      });
      throw error;
    }
  }

  /**
   * Get last health check result
   */
  public getLastHealthCheck(): SystemHealth | null {
    return this.lastHealthCheck;
  }

  /**
   * Start periodic health checks
   */
  public startPeriodicHealthChecks(): void {
    if (this.healthCheckInterval) {
      this.logger.warn('Periodic health checks already running');
      return;
    }

    this.logger.info(`Starting periodic health checks every ${this.healthCheckIntervalMs / 1000}s`);
    this.structuredLogger.info('Health monitoring started', {
      metadata: { intervalMs: this.healthCheckIntervalMs, timestamp: new Date().toISOString() },
    });

    // Start metrics collection
    this.metricsService.startPeriodicCollection(this.healthCheckIntervalMs);

    // Perform initial health check
    this.performHealthCheck().catch(error => {
      this.logger.error('Initial health check failed:', error);
      this.structuredLogger.error('Initial health check failed', error, {
        metadata: { timestamp: new Date().toISOString() },
      });
    });

    // Set up periodic checks
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.error('Periodic health check failed:', error);
        this.structuredLogger.error('Periodic health check failed', error, {
          metadata: { intervalMs: this.healthCheckIntervalMs, timestamp: new Date().toISOString() },
        });
      }
    }, this.healthCheckIntervalMs);

    // Start alert monitoring if configured
    if (this.alertService) {
      this.alertService.startMonitoring(async () => {
        const health = this.lastHealthCheck;
        if (!health) {
          return {};
        }

        return {
          memory_percentage: health.system.memory.percentage,
          error_rate: 0, // This would need to be tracked separately
          database_status: health.services.find(s => s.name === 'Database')?.status || 'unknown',
          discord_connected: health.discord.connected,
          api_response_time: health.services.find(s => s.name === 'PUBG API')?.responseTime || 0,
        };
      }, this.healthCheckIntervalMs);
    }
  }

  /**
   * Stop periodic health checks
   */
  public stopPeriodicHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('Stopped periodic health checks');
    }
  }

  /**
   * Get health status for a specific service
   */
  public async getServiceHealth(serviceName: string): Promise<ServiceHealth | null> {
    const checker = this.services.get(serviceName);
    if (!checker) {
      return null;
    }

    try {
      return await checker();
    } catch (error) {
      this.logger.error(`Health check failed for service ${serviceName}:`, error);
      return {
        name: serviceName,
        status: 'unhealthy',
        lastCheck: new Date(),
        responseTime: 0,
        details: `Health check failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get list of available services
   */
  public getAvailableServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Register a custom service health checker
   */
  public registerService(name: string, healthChecker: () => Promise<ServiceHealth>): void {
    this.services.set(name, healthChecker);
    this.logger.info(`Registered health checker for service: ${name}`);
  }

  /**
   * Unregister a service health checker
   */
  public unregisterService(name: string): void {
    this.services.delete(name);
    this.logger.info(`Unregistered health checker for service: ${name}`);
  }

  /**
   * Check if system is healthy
   */
  public isSystemHealthy(): boolean {
    return this.lastHealthCheck?.overall === 'healthy' || false;
  }

  /**
   * Get system uptime in human readable format
   */
  public getUptimeString(): string {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const parts = [];
    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    if (seconds > 0) {
      parts.push(`${seconds}s`);
    }

    return parts.join(' ') || '0s';
  }

  /**
   * Get metrics service instance
   */
  public getMetricsService(): MetricsService {
    return this.metricsService;
  }

  /**
   * Get metrics in Prometheus format
   */
  public getPrometheusMetrics(): string {
    return this.metricsService.getPrometheusMetrics();
  }

  /**
   * Check for health-based alerts
   */
  private async checkHealthAlerts(systemHealth: SystemHealth): Promise<void> {
    if (!this.alertService) {
      return;
    }

    try {
      // Memory usage alert
      if (systemHealth.system.memory.percentage > 90) {
        await this.alertService.createAlert(
          'critical',
          'High Memory Usage',
          `Memory usage is at ${systemHealth.system.memory.percentage.toFixed(1)}%`,
          'HealthService',
          {
            memoryUsage: systemHealth.system.memory.percentage,
            memoryUsed: systemHealth.system.memory.used,
            memoryTotal: systemHealth.system.memory.total,
          }
        );
      }

      // CPU usage alert
      if (systemHealth.system.cpu.usage > 80) {
        await this.alertService.createAlert(
          'warning',
          'High CPU Usage',
          `CPU usage is at ${systemHealth.system.cpu.usage.toFixed(1)}%`,
          'HealthService',
          {
            cpuUsage: systemHealth.system.cpu.usage,
            loadAverage: systemHealth.system.cpu.loadAverage,
          }
        );
      }

      // Discord connection alert
      if (!systemHealth.discord.connected) {
        await this.alertService.createAlert(
          'critical',
          'Discord Connection Lost',
          'Bot is disconnected from Discord',
          'HealthService',
          {
            discordPing: systemHealth.discord.ping,
            guilds: systemHealth.discord.guilds,
          }
        );
      }

      // Service health alerts
      const unhealthyServices = systemHealth.services.filter(s => s.status === 'unhealthy');
      if (unhealthyServices.length > 0) {
        await this.alertService.createAlert(
          'critical',
          'Services Unhealthy',
          `${unhealthyServices.length} service(s) are unhealthy: ${unhealthyServices.map(s => s.name).join(', ')}`,
          'HealthService',
          {
            unhealthyServices: unhealthyServices.map(s => ({
              name: s.name,
              details: s.details,
              responseTime: s.responseTime,
            })),
          }
        );
      }

      // Overall system health alert
      if (systemHealth.overall === 'unhealthy') {
        await this.alertService.createAlert(
          'critical',
          'System Health Critical',
          'Overall system health is unhealthy',
          'HealthService',
          {
            overallStatus: systemHealth.overall,
            timestamp: systemHealth.timestamp.toISOString(),
            uptime: systemHealth.uptime,
          }
        );
      }
    } catch (error) {
      this.logger.error('Failed to send health alerts:', error);
      this.structuredLogger.error('Health alert failed', error, {
        metadata: { timestamp: new Date().toISOString() },
      });
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopPeriodicHealthChecks();
    this.services.clear();
    this.lastHealthCheck = null;
    this.logger.info('Health service cleaned up');
  }
}
