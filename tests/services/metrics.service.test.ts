import { jest } from '@jest/globals';
import { MetricsService } from '../../src/services/metrics.service';
import { DatabaseService } from '../../src/database/database.service';
import { CacheService } from '../../src/services/cache.service';
import { ExtendedClient } from '../../src/types/client';
import * as os from 'os';
import * as process from 'process';

describe('MetricsService', () => {
  let metricsService: MetricsService;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockClient: jest.Mocked<ExtendedClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock os module
    jest.spyOn(os, 'totalmem').mockReturnValue(8589934592); // 8GB
    jest.spyOn(os, 'freemem').mockReturnValue(4294967296); // 4GB
    jest.spyOn(os, 'loadavg').mockReturnValue([0.5, 0.3, 0.2]);
    jest.spyOn(os, 'uptime').mockReturnValue(3600); // 1 hour

    // Mock process module
    jest.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 134217728, // 128MB
      heapTotal: 67108864, // 64MB
      heapUsed: 33554432, // 32MB
      external: 8388608, // 8MB
      arrayBuffers: 1048576, // 1MB
    });
    jest.spyOn(process, 'uptime').mockReturnValue(1800); // 30 minutes
    jest.spyOn(process, 'cpuUsage').mockReturnValue({
      user: 1000000, // 1 second
      system: 500000, // 0.5 seconds
    });

    mockDatabaseService = {
      client: {
        user: {
          count: jest.fn().mockResolvedValue(1000),
        },
        ticket: {
          count: jest.fn().mockResolvedValue(500),
        },
      },
      healthCheck: jest.fn().mockResolvedValue({ healthy: true, details: {} }),
    } as unknown as jest.Mocked<DatabaseService>;

    mockCacheService = {
      keys: jest.fn().mockResolvedValue(['key1', 'key2', 'key3']),
      healthCheck: jest.fn().mockResolvedValue({ healthy: true, details: {} }),
    } as unknown as jest.Mocked<CacheService>;

    mockClient = {
      guilds: {
        cache: new Map([
          ['guild1', { memberCount: 100 }],
          ['guild2', { memberCount: 200 }],
        ]),
        size: 2,
      },
      users: {
        cache: new Map([
          ['user1', {}],
          ['user2', {}],
          ['user3', {}],
        ]),
        size: 3,
      },
      channels: {
        cache: new Map([
          ['channel1', {}],
          ['channel2', {}],
          ['channel3', {}],
          ['channel4', {}],
        ]),
        size: 4,
      },
      isReady: jest.fn().mockReturnValue(true),
      ws: {
        ping: 50,
      },
      uptime: 3600000, // 1 hour in milliseconds
    } as unknown as jest.Mocked<ExtendedClient>;

    metricsService = new MetricsService(
      mockDatabaseService,
      mockCacheService,
      mockClient
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize metrics service successfully', () => {
      expect(metricsService).toBeDefined();
      expect(metricsService.getSystemMetrics).toBeDefined();
    });

    it('should work without optional dependencies', () => {
      const serviceWithoutDeps = new MetricsService();
      expect(serviceWithoutDeps).toBeDefined();
    });
  });

  describe('System Metrics Collection', () => {
    it('should collect memory metrics', () => {
      const systemMetrics = metricsService.getSystemMetrics();
      
      expect(systemMetrics.memory).toBeDefined();
      expect(systemMetrics.memory.used).toBe(134217728);
      expect(systemMetrics.memory.total).toBe(8589934592);
      expect(systemMetrics.memory.percentage).toBeCloseTo(1.56, 1);
      expect(systemMetrics.memory.heap.used).toBe(33554432);
      expect(systemMetrics.memory.heap.total).toBe(67108864);
    });

    it('should collect CPU metrics', () => {
      const systemMetrics = metricsService.getSystemMetrics();
      
      expect(systemMetrics.cpu).toBeDefined();
      expect(systemMetrics.cpu.loadAverage).toEqual([0.5, 0.3, 0.2]);
      expect(systemMetrics.cpu.usage).toBeGreaterThanOrEqual(0);
    });

    it('should collect process metrics', () => {
      const systemMetrics = metricsService.getSystemMetrics();
      
      expect(systemMetrics.uptime).toBe(1800);
      expect(systemMetrics.eventLoop.delay).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Discord Metrics Collection', () => {
    it('should collect Discord guild metrics', async () => {
      const appMetrics = await metricsService.getApplicationMetrics();
      
      expect(appMetrics.discord.guilds).toBe(2);
      expect(appMetrics.discord.users).toBe(3);
      expect(appMetrics.discord.channels).toBe(4);
      expect(appMetrics.discord.connected).toBe(true);
      expect(appMetrics.discord.latency).toBe(50);
    });

    it('should handle Discord client not ready', async () => {
      jest.spyOn(mockClient, 'isReady').mockReturnValue(false);
      
      const appMetrics = await metricsService.getApplicationMetrics();
      
      expect(appMetrics.discord.connected).toBe(false);
    });
  });

  describe('Database Metrics Collection', () => {
    it('should collect database metrics', async () => {
      const appMetrics = await metricsService.getApplicationMetrics();
      
      expect(appMetrics.database.connections).toBeGreaterThanOrEqual(0);
      expect(mockDatabaseService.client.user.count).toHaveBeenCalled();
      expect(mockDatabaseService.client.ticket.count).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.client.user.count.mockRejectedValue(new Error('DB Error'));
      
      const appMetrics = await metricsService.getApplicationMetrics();
      
      expect(appMetrics.database.errors).toBeGreaterThan(0);
    });
  });

  describe('Cache Metrics Collection', () => {
    it('should collect cache metrics', async () => {
      const appMetrics = await metricsService.getApplicationMetrics();
      
      expect(appMetrics.cache.size).toBe(3); // 3 keys
      expect(mockCacheService.keys).toHaveBeenCalled();
    });

    it('should handle cache errors gracefully', async () => {
      mockCacheService.keys.mockRejectedValue(new Error('Cache Error'));
      
      const appMetrics = await metricsService.getApplicationMetrics();
      
      expect(appMetrics.cache.size).toBe(0);
    });
  });

  describe('Metrics Recording', () => {
    it('should record gauge metrics', () => {
      metricsService.recordMetric('test_gauge', 42, 'gauge');
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['test_gauge']).toBeDefined();
      expect(metrics['test_gauge'].value).toBe(42);
      expect(metrics['test_gauge'].type).toBe('gauge');
    });

    it('should record counter metrics', () => {
      metricsService.recordMetric('test_counter', 1, 'counter');
      metricsService.recordMetric('test_counter', 2, 'counter');
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['test_counter'].value).toBe(3); // Should accumulate
    });

    it('should record histogram metrics', () => {
      metricsService.recordMetric('test_histogram', 100, 'histogram');
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['test_histogram']).toBeDefined();
      expect(metrics['test_histogram'].type).toBe('histogram');
    });

    it('should increment counters', () => {
      metricsService.incrementCounter('requests_total');
      metricsService.incrementCounter('requests_total', 5);
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['requests_total'].value).toBe(6);
    });
  });

  describe('API Metrics', () => {
    it('should record API request metrics', () => {
      metricsService.recordApiRequest(150, 200, '/api/test');
      metricsService.recordApiRequest(200, 404, '/api/notfound');
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['api_requests_total']).toBeDefined();
      expect(metrics['api_response_time']).toBeDefined();
      expect(metrics['api_errors_total']).toBeDefined();
    });

    it('should track response times', () => {
      metricsService.recordApiRequest(100, 200);
      metricsService.recordApiRequest(200, 200);
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['api_response_time'].value).toBe(150); // Average
    });
  });

  describe('Cache Hit/Miss Tracking', () => {
    it('should record cache hits', () => {
      metricsService.recordCacheHit();
      metricsService.recordCacheHit();
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['cache_hits_total'].value).toBe(2);
    });

    it('should record cache misses', () => {
      metricsService.recordCacheMiss();
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['cache_misses_total'].value).toBe(1);
    });

    it('should calculate hit rate', () => {
      metricsService.recordCacheHit();
      metricsService.recordCacheHit();
      metricsService.recordCacheMiss();
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['cache_hit_rate'].value).toBeCloseTo(0.67, 2);
    });
  });

  describe('Database Query Tracking', () => {
    it('should record successful database queries', () => {
      metricsService.recordDatabaseQuery(50, true);
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['db_queries_total'].value).toBe(1);
      expect(metrics['db_query_duration'].value).toBe(50);
    });

    it('should record failed database queries', () => {
      metricsService.recordDatabaseQuery(100, false);
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['db_errors_total'].value).toBe(1);
    });
  });

  describe('Backup Metrics', () => {
    it('should record successful backup', () => {
      metricsService.recordBackup({
        type: 'full',
        duration: 5000,
        size: 1024000,
        success: true,
      });
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['backup_duration'].value).toBe(5000);
      expect(metrics['backup_size'].value).toBe(1024000);
      expect(metrics['backup_success_total'].value).toBe(1);
    });

    it('should record failed backup', () => {
      metricsService.recordBackup({
        type: 'incremental',
        duration: 2000,
        size: 0,
        success: false,
        error: 'Disk full',
      });
      
      const metrics = metricsService.getAllMetrics();
      expect(metrics['backup_failure_total'].value).toBe(1);
    });
  });

  describe('Prometheus Export', () => {
    it('should export metrics in Prometheus format', () => {
      metricsService.recordMetric('test_metric', 42, 'gauge');
      metricsService.incrementCounter('test_counter', 5);
      
      const prometheusOutput = metricsService.getPrometheusMetrics();
      
      expect(prometheusOutput).toContain('test_metric 42');
      expect(prometheusOutput).toContain('test_counter 5');
      expect(prometheusOutput).toContain('# TYPE');
    });

    it('should include labels in Prometheus output', () => {
      metricsService.recordMetric('labeled_metric', 10, 'gauge', { service: 'test', env: 'dev' });
      
      const prometheusOutput = metricsService.getPrometheusMetrics();
      
      expect(prometheusOutput).toContain('labeled_metric{service="test",env="dev"} 10');
    });
  });

  describe('Metrics Management', () => {
    it('should clear all metrics', () => {
      metricsService.recordMetric('test1', 10);
      metricsService.recordMetric('test2', 20);
      
      let metrics = metricsService.getAllMetrics();
      expect(Object.keys(metrics)).toHaveLength(2);
      
      metricsService.clearMetrics();
      
      metrics = metricsService.getAllMetrics();
      expect(Object.keys(metrics)).toHaveLength(0);
    });

    it('should get all metrics as object', () => {
      metricsService.recordMetric('metric1', 100);
      metricsService.recordMetric('metric2', 200);
      
      const allMetrics = metricsService.getAllMetrics();
      
      expect(allMetrics).toHaveProperty('metric1');
      expect(allMetrics).toHaveProperty('metric2');
      expect(allMetrics.metric1.value).toBe(100);
      expect(allMetrics.metric2.value).toBe(200);
    });
  });

  describe('Performance Tracking', () => {
    it('should track operation performance', () => {
      const startTime = Date.now();
      
      // Simulate some work
      setTimeout(() => {
        const duration = Date.now() - startTime;
        metricsService.recordMetric('operation_duration', duration, 'histogram');
        
        const metrics = metricsService.getAllMetrics();
        expect(metrics['operation_duration']).toBeDefined();
        expect(metrics['operation_duration'].type).toBe('histogram');
      }, 10);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing dependencies gracefully', async () => {
      const serviceWithoutDeps = new MetricsService();
      
      const systemMetrics = serviceWithoutDeps.getSystemMetrics();
      expect(systemMetrics).toBeDefined();
      
      const appMetrics = await serviceWithoutDeps.getApplicationMetrics();
      expect(appMetrics).toBeDefined();
    });

    it('should handle service errors gracefully', async () => {
      mockDatabaseService.client.user.count.mockRejectedValue(new Error('Service unavailable'));
      mockCacheService.keys.mockRejectedValue(new Error('Cache unavailable'));
      
      const appMetrics = await metricsService.getApplicationMetrics();
      
      expect(appMetrics.database.errors).toBeGreaterThan(0);
      expect(appMetrics.cache.size).toBe(0);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent metric recording', () => {
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(
          metricsService.recordMetric(`metric_${i}`, i, 'gauge')
        ));
      }
      
      return Promise.all(promises).then(() => {
        const metrics = metricsService.getAllMetrics();
        expect(Object.keys(metrics)).toHaveLength(100);
      });
    });
  });
});