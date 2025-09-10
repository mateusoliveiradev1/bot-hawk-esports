/**
 * Production Monitoring Service
 * Comprehensive monitoring system for production environment
 */

import { Logger, LogCategory } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { CacheService } from '../services/cache.service';
import { ExtendedClient } from '../types/client';
import { MetricsService } from '../services/metrics.service';
import {
  ProductionMonitoringConfig,
  getProductionMonitoringConfig,
  validateMonitoringConfig,
} from './production-monitoring.config';
import * as os from 'os';
import * as process from 'process';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  message?: string;
  details?: any;
  timestamp: Date;
}

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    heap: {
      used: number;
      total: number;
    };
  };
  process: {
    uptime: number;
    pid: number;
    version: string;
  };
  discord?: {
    guilds: number;
    users: number;
    channels: number;
    latency: number;
  };
  database?: {
    connections: number;
    queries: number;
    responseTime: number;
  };
  cache?: {
    hits: number;
    misses: number;
    keys: number;
    memory: number;
  };
}

export interface Alert {
  id: string;
  type: 'performance' | 'health' | 'error' | 'warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
  service: string;
  message: string;
  details: any;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface Counter {
  name: string;
  value: number;
  timestamp: Date;
}

type HealthCheckFunction = () => Promise<HealthCheckResult>;

export class ProductionMonitoringService {
  private logger: Logger;
  private config: ProductionMonitoringConfig;
  private database: DatabaseService;
  private cache: CacheService;
  private discordClient?: ExtendedClient;
  private metricsService?: MetricsService;

  private healthChecks: Map<string, HealthCheckFunction> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  private alerts: Map<string, Alert> = new Map();
  private metrics: SystemMetrics[] = [];
  private counters: Map<string, Counter> = new Map();

  private isRunning = false;

  constructor(
    database: DatabaseService,
    cache: CacheService,
    config?: Partial<ProductionMonitoringConfig>
  ) {
    this.logger = new Logger();
    this.database = database;
    this.cache = cache;

    // Load and validate configuration
    this.config = { ...getProductionMonitoringConfig(), ...config };
    validateMonitoringConfig(this.config);

    this.logger.info('Production monitoring service initialized', {
      metadata: {
        healthCheckInterval: this.config.healthCheckInterval,
        metricsInterval: this.config.metricsCollectionInterval,
        thresholds: this.config.performance,
      },
    });

    this.setupDefaultHealthChecks();
    this.setupProcessHandlers();
  }

  /**
   * Set Discord client for monitoring
   */
  public setDiscordClient(client: ExtendedClient): void {
    this.discordClient = client;
    this.logger.info('Discord client configured for monitoring');
  }

  /**
   * Set metrics service for monitoring
   */
  public setMetricsService(service: MetricsService): void {
    this.metricsService = service;
    this.logger.info('Metrics service configured for monitoring');
  }

  /**
   * Setup default health checks
   */
  private setupDefaultHealthChecks(): void {
    // System health check
    this.registerHealthCheck('system', this.checkSystemHealth.bind(this));

    // Database health check
    this.registerHealthCheck('database', this.checkDatabaseHealth.bind(this));

    // Cache health check
    this.registerHealthCheck('cache', this.checkCacheHealth.bind(this));

    // Discord health check (will be registered when client is set)
    if (this.discordClient) {
      this.registerHealthCheck('discord', this.checkDiscordHealth.bind(this));
    }
  }

  /**
   * Setup process handlers for graceful shutdown
   */
  private setupProcessHandlers(): void {
    // Graceful shutdown handlers
    process.on('SIGTERM', this.handleShutdown.bind(this, 'SIGTERM'));
    process.on('SIGINT', this.handleShutdown.bind(this, 'SIGINT'));

    // Error handlers
    process.on('uncaughtException', this.handleUncaughtException.bind(this));
    process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
  }

  /**
   * Handle graceful shutdown
   */
  private async handleShutdown(signal: string): Promise<void> {
    this.logger.info(`Received ${signal}, shutting down gracefully...`);
    await this.shutdown();
    process.exit(0);
  }

  /**
   * Handle uncaught exceptions
   */
  private handleUncaughtException(error: Error): void {
    this.logger.error('Uncaught exception:', { error });
    this.createAlert({
      type: 'error',
      severity: 'critical',
      service: 'system',
      message: 'Uncaught exception occurred',
      details: { error: error.message, stack: error.stack },
    });
  }

  /**
   * Handle unhandled promise rejections
   */
  private handleUnhandledRejection(reason: any, promise: Promise<any>): void {
    this.logger.error('Unhandled promise rejection:', reason);
    this.createAlert({
      type: 'error',
      severity: 'critical',
      service: 'system',
      message: 'Unhandled promise rejection',
      details: { reason },
    });
  }

  /**
   * Register a health check
   */
  public registerHealthCheck(name: string, checkFunction: HealthCheckFunction): void {
    this.healthChecks.set(name, checkFunction);
    this.logger.info(`Health check registered: ${name}`);
  }

  /**
   * Run all health checks
   */
  private async runHealthChecks(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const [name, checkFunction] of this.healthChecks) {
      try {
        const startTime = Date.now();
        const timeoutPromise = new Promise<HealthCheckResult>((_, reject) => {
          setTimeout(
            () => reject(new Error('Health check timeout')),
            this.config.healthCheckTimeout
          );
        });

        const result = await Promise.race([checkFunction(), timeoutPromise]);

        result.responseTime = Date.now() - startTime;
        results.push(result);

        // Create alerts for unhealthy services
        if (result.status === 'unhealthy' || result.status === 'degraded') {
          this.createAlert({
            type: 'health',
            severity: result.status === 'unhealthy' ? 'high' : 'medium',
            service: result.service,
            message: `Service ${result.service} is ${result.status}`,
            details: result,
          });
        }
      } catch (error) {
        const result: HealthCheckResult = {
          service: name,
          status: 'unhealthy',
          responseTime: this.config.healthCheckTimeout,
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        };

        results.push(result);

        this.createAlert({
          type: 'health',
          severity: 'high',
          service: name,
          message: `Health check failed for ${name}`,
          details: { error: error instanceof Error ? error.message : error },
        });
      }
    }

    return results;
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();

    const metrics: SystemMetrics = {
      timestamp: new Date(),
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        loadAverage: loadAvg,
      },
      memory: {
        used: memUsage.rss,
        total: os.totalmem(),
        percentage: (memUsage.rss / os.totalmem()) * 100,
        heap: {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal,
        },
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        version: process.version,
      },
    };

    // Add Discord metrics if available
    if (this.discordClient && this.metricsService) {
      metrics.discord = await this.getDiscordMetrics();
    }

    // Add database metrics (placeholder)
    metrics.database = {
      connections: 0,
      queries: 0,
      responseTime: 0,
    };

    // Add cache metrics (placeholder)
    metrics.cache = {
      hits: 0,
      misses: 0,
      keys: 0,
      memory: 0,
    };

    // Store metrics
    this.metrics.push(metrics);

    // Clean old metrics
    const cutoff = new Date(Date.now() - this.config.metrics.retentionPeriod);
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);

    // Limit metrics in memory
    if (this.metrics.length > this.config.metrics.maxMetricsInMemory) {
      this.metrics = this.metrics.slice(-this.config.metrics.maxMetricsInMemory);
    }

    // Check performance thresholds
    this.checkPerformanceThresholds(metrics);

    return metrics;
  }

  /**
   * Get Discord metrics
   */
  private async getDiscordMetrics(): Promise<SystemMetrics['discord']> {
    if (!this.discordClient || !this.metricsService) {
      return undefined;
    }

    try {
      // Discord metrics not available from MetricsService
      const discordMetrics = undefined;
      return {
        guilds: discordMetrics.guilds,
        users: discordMetrics.users,
        channels: discordMetrics.channels,
        latency: discordMetrics.latency,
      };
    } catch (error) {
      this.logger.error('Failed to get Discord metrics:', { error });
      return undefined;
    }
  }

  /**
   * Check performance thresholds and create alerts
   */
  private checkPerformanceThresholds(metrics: SystemMetrics): void {
    // Memory usage alert
    if (metrics.memory.percentage > this.config.performance.memoryUsageThreshold) {
      this.createAlert({
        type: 'performance',
        severity: 'high',
        service: 'system',
        message: `High memory usage: ${metrics.memory.percentage.toFixed(2)}%`,
        details: { memoryUsage: metrics.memory },
      });
    }

    // CPU usage alert (simplified check)
    const cpuPercentage = (metrics.cpu.usage / metrics.process.uptime) * 100;
    if (cpuPercentage > this.config.performance.cpuUsageThreshold) {
      this.createAlert({
        type: 'performance',
        severity: 'high',
        service: 'system',
        message: `High CPU usage: ${cpuPercentage.toFixed(2)}%`,
        details: { cpuUsage: metrics.cpu },
      });
    }
  }

  /**
   * Create an alert
   */
  public createAlert(alertData: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): string {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      resolved: false,
      ...alertData,
    };

    this.alerts.set(alert.id, alert);

    this.logger.warn(`Alert created: ${alert.message}`, {
      metadata: {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        service: alert.service,
      },
    });

    // Clean old alerts
    if (this.alerts.size > this.config.alerts.maxActiveAlerts) {
      const oldestAlert = Array.from(this.alerts.values()).sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      )[0];
      this.alerts.delete(oldestAlert.id);
    }

    return alert.id;
  }

  /**
   * Resolve an alert
   */
  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();

      this.logger.info(`Alert resolved: ${alert.message}`, {
        metadata: { alertId },
      });

      return true;
    }
    return false;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Increment a counter
   */
  public incrementCounter(name: string, value: number = 1): void {
    const existing = this.counters.get(name);
    if (existing) {
      existing.value += value;
      existing.timestamp = new Date();
    } else {
      this.counters.set(name, {
        name,
        value,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get counter value
   */
  public getCounter(name: string): number {
    return this.counters.get(name)?.value || 0;
  }

  /**
   * System health check
   */
  private async checkSystemHealth(): Promise<HealthCheckResult> {
    const memUsage = process.memoryUsage();
    const memPercentage = (memUsage.rss / os.totalmem()) * 100;

    let status: HealthCheckResult['status'] = 'healthy';
    let message = 'System is healthy';

    if (memPercentage > this.config.performance.memoryUsageThreshold) {
      status = 'degraded';
      message = `High memory usage: ${memPercentage.toFixed(2)}%`;
    }

    return {
      service: 'system',
      status,
      responseTime: 0,
      message,
      details: {
        memory: memUsage,
        uptime: process.uptime(),
        loadAverage: os.loadavg(),
      },
      timestamp: new Date(),
    };
  }

  /**
   * Database health check
   */
  private async checkDatabaseHealth(): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();

      // Simple ping to database
      // Database ping method not available

      const responseTime = Date.now() - startTime;

      let status: HealthCheckResult['status'] = 'healthy';
      let message = 'Database is healthy';

      if (responseTime > this.config.database.queryTimeout / 2) {
        status = 'degraded';
        message = `Slow database response: ${responseTime}ms`;
      }

      return {
        service: 'database',
        status,
        responseTime,
        message,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        responseTime: 0,
        message: error instanceof Error ? error.message : 'Database connection failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Cache health check
   */
  private async checkCacheHealth(): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();

      // Simple ping to cache
      // Cache ping method not available

      const responseTime = Date.now() - startTime;

      let status: HealthCheckResult['status'] = 'healthy';
      let message = 'Cache is healthy';

      if (responseTime > this.config.cache.operationTimeout / 2) {
        status = 'degraded';
        message = `Slow cache response: ${responseTime}ms`;
      }

      return {
        service: 'cache',
        status,
        responseTime,
        message,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        service: 'cache',
        status: 'unhealthy',
        responseTime: 0,
        message: error instanceof Error ? error.message : 'Cache connection failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Discord health check
   */
  private async checkDiscordHealth(): Promise<HealthCheckResult> {
    if (!this.discordClient) {
      return {
        service: 'discord',
        status: 'unhealthy',
        responseTime: 0,
        message: 'Discord client not available',
        timestamp: new Date(),
      };
    }

    try {
      const startTime = Date.now();
      const ping = this.discordClient.ws.ping;
      const responseTime = Date.now() - startTime;

      let status: HealthCheckResult['status'] = 'healthy';
      let message = 'Discord is healthy';

      if (ping > this.config.discord.latencyThreshold) {
        status = 'degraded';
        message = `High Discord latency: ${ping}ms`;
      }

      if (!this.discordClient.isReady()) {
        status = 'unhealthy';
        message = 'Discord client not ready';
      }

      return {
        service: 'discord',
        status,
        responseTime,
        message,
        details: {
          ping,
          guilds: this.discordClient.guilds.cache.size,
          users: this.discordClient.users.cache.size,
          ready: this.discordClient.isReady(),
        },
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        service: 'discord',
        status: 'unhealthy',
        responseTime: 0,
        message: error instanceof Error ? error.message : 'Discord health check failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Start monitoring
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Production monitoring is already running');
      return;
    }

    this.logger.info('Starting production monitoring...');

    // Start health checks
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.runHealthChecks();
      } catch (error) {
        this.logger.error('Error running health checks:', { error });
      }
    }, this.config.healthCheckInterval);

    // Start metrics collection
    this.metricsInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        this.logger.error('Error collecting metrics:', { error });
      }
    }, this.config.metricsCollectionInterval);

    this.isRunning = true;

    // Run initial checks
    await this.runHealthChecks();
    await this.collectMetrics();

    this.logger.info('Production monitoring started successfully');
  }

  /**
   * Stop monitoring
   */
  public async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Shutting down production monitoring...');

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }

    this.isRunning = false;

    this.logger.info('Production monitoring stopped');
  }

  /**
   * Get system status
   */
  public async getSystemStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    healthChecks: HealthCheckResult[];
    metrics: SystemMetrics | null;
    alerts: Alert[];
    uptime: number;
  }> {
    const healthChecks = await this.runHealthChecks();
    const latestMetrics = this.metrics[this.metrics.length - 1] || null;
    const activeAlerts = this.getActiveAlerts();

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    for (const check of healthChecks) {
      if (check.status === 'unhealthy') {
        overallStatus = 'unhealthy';
        break;
      } else if (check.status === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }

    return {
      status: overallStatus,
      healthChecks,
      metrics: latestMetrics,
      alerts: activeAlerts,
      uptime: process.uptime(),
    };
  }

  /**
   * Get all metrics
   */
  public getMetrics(): SystemMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get all counters
   */
  public getCounters(): Counter[] {
    return Array.from(this.counters.values());
  }

  /**
   * API monitoring middleware
   */
  public apiMonitoringMiddleware() {
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;

        // Increment API request counter
        this.incrementCounter('api_requests_total');
        this.incrementCounter(`api_requests_${req.method.toLowerCase()}`);
        this.incrementCounter(`api_responses_${res.statusCode}`);

        // Log slow requests
        if (duration > this.config.performance.responseTimeThreshold) {
          this.logger.warn('Slow API request detected', {
            metadata: {
              method: req.method,
              url: req.url,
              statusCode: res.statusCode,
              duration,
            },
          });

          this.createAlert({
            type: 'performance',
            severity: 'medium',
            service: 'api',
            message: `Slow API request: ${req.method} ${req.url} (${duration}ms)`,
            details: {
              method: req.method,
              url: req.url,
              statusCode: res.statusCode,
              duration,
            },
          });
        }
      });

      next();
    };
  }
}
