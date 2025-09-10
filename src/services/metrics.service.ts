import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { CacheService } from './cache.service';
import { ExtendedClient } from '../types/client';
import { performance } from 'perf_hooks';
import * as os from 'os';
import * as process from 'process';

export interface MetricData {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram';
}

export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
    heap: {
      used: number;
      total: number;
    };
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  uptime: number;
  eventLoop: {
    delay: number;
  };
}

export interface ApplicationMetrics {
  discord: {
    guilds: number;
    users: number;
    channels: number;
    connected: boolean;
    latency: number;
  };
  database: {
    connections: number;
    queries: number;
    errors: number;
  };
  cache: {
    hits: number;
    misses: number;
    size: number;
  };
  api: {
    requests: number;
    errors: number;
    responseTime: number;
  };
}

export class MetricsService {
  private logger: Logger;
  private metrics: Map<string, MetricData> = new Map();
  private startTime: number;
  private lastCpuUsage = process.cpuUsage();
  private requestCount = 0;
  private errorCount = 0;
  private responseTimeSum = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private dbQueries = 0;
  private dbErrors = 0;
  private metricsInterval?: NodeJS.Timeout;
  private performanceHistory: Array<{ timestamp: number; metrics: SystemMetrics }> = [];
  private readonly MAX_HISTORY_SIZE = 100; // Keep last 100 measurements

  constructor(
    private databaseService?: DatabaseService,
    private cacheService?: CacheService,
    private discordClient?: ExtendedClient,
  ) {
    this.logger = new Logger();
    this.startTime = Date.now();
    this.startRealTimeMonitoring();
  }

  /**
   * Start real-time metrics collection
   */
  private startRealTimeMonitoring(): void {
    // Collect system metrics every 30 seconds
    this.metricsInterval = setInterval(async () => {
      try {
        const systemMetrics = this.getSystemMetrics();
        const appMetrics = await this.getApplicationMetrics();
        
        // Store in history for trend analysis
        this.performanceHistory.push({
          timestamp: Date.now(),
          metrics: systemMetrics,
        });
        
        // Keep history size manageable
        if (this.performanceHistory.length > this.MAX_HISTORY_SIZE) {
          this.performanceHistory.shift();
        }
        
        // Record key metrics
        this.recordMetric('system_memory_usage', systemMetrics.memory.percentage, 'gauge');
        this.recordMetric('system_cpu_usage', systemMetrics.cpu.usage, 'gauge');
        this.recordMetric('discord_latency', appMetrics.discord.latency, 'gauge');
        this.recordMetric('event_loop_delay', systemMetrics.eventLoop.delay, 'gauge');
        
        // Log performance summary every 5 minutes
        if (Date.now() % (5 * 60 * 1000) < 30000) {
          this.logPerformanceSummary(systemMetrics, appMetrics);
        }
      } catch (error) {
        this.logger.error('Error collecting real-time metrics:', error);
      }
    }, 30000); // 30 seconds
  }

  /**
   * Log performance summary
   */
  private logPerformanceSummary(systemMetrics: SystemMetrics, appMetrics: ApplicationMetrics): void {
    this.logger.info('Performance Summary', {
      metadata: {
        memory: {
          usage: `${systemMetrics.memory.percentage.toFixed(1)}%`,
          heap: `${(systemMetrics.memory.heap.used / 1024 / 1024).toFixed(1)}MB`,
        },
        cpu: `${systemMetrics.cpu.usage.toFixed(1)}%`,
        discord: {
          guilds: appMetrics.discord.guilds,
          latency: `${appMetrics.discord.latency}ms`,
          connected: appMetrics.discord.connected,
        },
        cache: {
          hitRate: `${((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100 || 0).toFixed(1)}%`,
          size: appMetrics.cache.size,
        },
        api: {
          requests: this.requestCount,
          avgResponseTime: `${(this.responseTimeSum / this.requestCount || 0).toFixed(1)}ms`,
          errorRate: `${((this.errorCount / this.requestCount) * 100 || 0).toFixed(1)}%`,
        },
        uptime: `${Math.floor(systemMetrics.uptime / 3600)}h ${Math.floor((systemMetrics.uptime % 3600) / 60)}m`,
      },
    });
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends(): {
    memoryTrend: 'increasing' | 'decreasing' | 'stable';
    cpuTrend: 'increasing' | 'decreasing' | 'stable';
    averageMemory: number;
    averageCpu: number;
  } {
    if (this.performanceHistory.length < 10) {
      return {
        memoryTrend: 'stable',
        cpuTrend: 'stable',
        averageMemory: 0,
        averageCpu: 0,
      };
    }

    const recent = this.performanceHistory.slice(-10);
    const older = this.performanceHistory.slice(-20, -10);

    const recentMemoryAvg = recent.reduce((sum, h) => sum + h.metrics.memory.percentage, 0) / recent.length;
    const olderMemoryAvg = older.reduce((sum, h) => sum + h.metrics.memory.percentage, 0) / older.length;
    const recentCpuAvg = recent.reduce((sum, h) => sum + h.metrics.cpu.usage, 0) / recent.length;
    const olderCpuAvg = older.reduce((sum, h) => sum + h.metrics.cpu.usage, 0) / older.length;

    const memoryDiff = recentMemoryAvg - olderMemoryAvg;
    const cpuDiff = recentCpuAvg - olderCpuAvg;

    return {
      memoryTrend: Math.abs(memoryDiff) < 2 ? 'stable' : memoryDiff > 0 ? 'increasing' : 'decreasing',
      cpuTrend: Math.abs(cpuDiff) < 5 ? 'stable' : cpuDiff > 0 ? 'increasing' : 'decreasing',
      averageMemory: recentMemoryAvg,
      averageCpu: recentCpuAvg,
    };
  }

  /**
   * Stop real-time monitoring
   */
  stopRealTimeMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
  }

  /**
   * Record a metric value
   */
  recordMetric(
    name: string,
    value: number,
    type: MetricData['type'] = 'gauge',
    labels?: Record<string, string>,
  ): void {
    const metric: MetricData = {
      name,
      value,
      timestamp: Date.now(),
      type,
      labels,
    };

    this.metrics.set(name, metric);
  }

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const existing = this.metrics.get(name);
    const newValue = existing ? existing.value + value : value;
    this.recordMetric(name, newValue, 'counter', labels);
  }

  /**
   * Record API request metrics
   */
  recordApiRequest(responseTime: number, statusCode: number, endpoint?: string): void {
    this.requestCount++;
    this.responseTimeSum += responseTime;

    if (statusCode >= 400) {
      this.errorCount++;
    }

    this.recordMetric('api_requests_total', this.requestCount, 'counter');
    this.recordMetric('api_errors_total', this.errorCount, 'counter');
    this.recordMetric('api_response_time_avg', this.responseTimeSum / this.requestCount, 'gauge');
    this.recordMetric('api_response_time_last', responseTime, 'gauge');

    if (endpoint) {
      this.incrementCounter('api_requests_by_endpoint', 1, {
        endpoint,
        status: statusCode.toString(),
      });
    }
  }

  /**
   * Record cache metrics
   */
  recordCacheHit(): void {
    this.cacheHits++;
    this.recordMetric('cache_hits_total', this.cacheHits, 'counter');
    this.updateCacheMetrics();
  }

  recordCacheMiss(): void {
    this.cacheMisses++;
    this.recordMetric('cache_misses_total', this.cacheMisses, 'counter');
    this.updateCacheMetrics();
  }

  private updateCacheMetrics(): void {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? (this.cacheHits / total) * 100 : 0;
    this.recordMetric('cache_hit_rate', hitRate, 'gauge');
  }

  /**
   * Record database metrics
   */
  recordDatabaseQuery(responseTime: number, success: boolean = true): void {
    this.dbQueries++;
    if (!success) {
      this.dbErrors++;
    }

    this.recordMetric('db_queries_total', this.dbQueries, 'counter');
    this.recordMetric('db_errors_total', this.dbErrors, 'counter');
    this.recordMetric('db_query_time_last', responseTime, 'gauge');
  }

  /**
   * Record backup metrics
   */
  recordBackup(data: {
    type: string;
    duration: number;
    size: number;
    success: boolean;
    error?: string;
  }): void {
    this.recordMetric('backup_total', 1, 'counter', {
      type: data.type,
      success: data.success.toString(),
    });
    this.recordMetric('backup_duration_last', data.duration, 'gauge', { type: data.type });
    this.recordMetric('backup_size_last', data.size, 'gauge', { type: data.type });

    if (!data.success && data.error) {
      this.recordMetric('backup_errors_total', 1, 'counter', {
        type: data.type,
        error: data.error,
      });
    }
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Calculate CPU usage
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
    const cpuPercent = (currentCpuUsage.user + currentCpuUsage.system) / 1000000; // Convert to seconds
    this.lastCpuUsage = process.cpuUsage();

    // Measure event loop delay
    const start = performance.now();
    setImmediate(() => {
      const delay = performance.now() - start;
      this.recordMetric('event_loop_delay', delay, 'gauge');
    });

    return {
      memory: {
        used: Math.round(usedMem / 1024 / 1024), // MB
        total: Math.round(totalMem / 1024 / 1024), // MB
        percentage: Math.round((usedMem / totalMem) * 100),
        heap: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        },
      },
      cpu: {
        usage: Math.round(cpuPercent * 100) / 100,
        loadAverage: os.loadavg(),
      },
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      eventLoop: {
        delay: this.metrics.get('event_loop_delay')?.value || 0,
      },
    };
  }

  /**
   * Get current application metrics
   */
  async getApplicationMetrics(): Promise<ApplicationMetrics> {
    const discordMetrics = this.getDiscordMetrics();
    const databaseMetrics = await this.getDatabaseMetrics();
    const cacheMetrics = this.getCacheMetrics();
    const apiMetrics = this.getApiMetrics();

    return {
      discord: discordMetrics,
      database: databaseMetrics,
      cache: cacheMetrics,
      api: apiMetrics,
    };
  }

  private getDiscordMetrics() {
    if (!this.discordClient || !this.discordClient.isReady()) {
      return {
        guilds: 0,
        users: 0,
        channels: 0,
        connected: false,
        latency: -1,
      };
    }

    const guilds = this.discordClient.guilds.cache.size;
    const users = this.discordClient.guilds.cache.reduce(
      (acc, guild) => acc + guild.memberCount,
      0,
    );
    const channels = this.discordClient.channels.cache.size;
    const latency = this.discordClient.ws.ping;

    // Record Discord metrics
    this.recordMetric('discord_guilds', guilds, 'gauge');
    this.recordMetric('discord_users', users, 'gauge');
    this.recordMetric('discord_channels', channels, 'gauge');
    this.recordMetric('discord_latency', latency, 'gauge');

    return {
      guilds,
      users,
      channels,
      connected: true,
      latency,
    };
  }

  private async getDatabaseMetrics() {
    let connections = 0;

    if (this.databaseService) {
      try {
        // Check if database is connected
        await this.databaseService.healthCheck();
        connections = 1; // Basic connection check
      } catch (error) {
        this.logger.warn('Failed to get database metrics:', error);
      }
    }

    return {
      connections,
      queries: this.dbQueries,
      errors: this.dbErrors,
    };
  }

  private getCacheMetrics() {
    let size = 0;

    if (this.cacheService) {
      try {
        // Cache size tracking would need to be implemented in CacheService
        // For now, we'll use 0 as placeholder
        size = 0;
      } catch (error) {
        this.logger.warn('Failed to get cache size:', error);
      }
    }

    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size,
    };
  }

  private getApiMetrics() {
    return {
      requests: this.requestCount,
      errors: this.errorCount,
      responseTime: this.requestCount > 0 ? this.responseTimeSum / this.requestCount : 0,
    };
  }

  /**
   * Get all metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    for (const [name, metric] of this.metrics) {
      let line = `# TYPE ${name} ${metric.type}\n`;

      if (metric.labels) {
        const labelStr = Object.entries(metric.labels)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');
        line += `${name}{${labelStr}} ${metric.value} ${metric.timestamp}\n`;
      } else {
        line += `${name} ${metric.value} ${metric.timestamp}\n`;
      }

      lines.push(line);
    }

    return lines.join('');
  }

  /**
   * Get all metrics as JSON
   */
  getAllMetrics(): Record<string, MetricData> {
    return Object.fromEntries(this.metrics);
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimeSum = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.dbQueries = 0;
    this.dbErrors = 0;
  }

  /**
   * Start periodic metrics collection
   */
  startPeriodicCollection(intervalMs: number = 60000): void {
    setInterval(async () => {
      try {
        const systemMetrics = this.getSystemMetrics();
        const appMetrics = await this.getApplicationMetrics();

        // Record system metrics
        this.recordMetric('system_memory_used', systemMetrics.memory.used, 'gauge');
        this.recordMetric('system_memory_percentage', systemMetrics.memory.percentage, 'gauge');
        this.recordMetric('system_cpu_usage', systemMetrics.cpu.usage, 'gauge');
        this.recordMetric('system_uptime', systemMetrics.uptime, 'gauge');

        this.logger.debug('Metrics collected successfully');
      } catch (error) {
        this.logger.error('Failed to collect periodic metrics:', error);
      }
    }, intervalMs);

    this.logger.info(`Started periodic metrics collection (interval: ${intervalMs}ms)`);
  }
}
