import { jest } from '@jest/globals';
import { HealthService, ServiceHealth } from '../../src/services/health.service';
import { DatabaseService } from '../../src/database/database.service';
import { CacheService } from '../../src/services/cache.service';
import { SchedulerService } from '../../src/services/scheduler.service';
import { LoggingService } from '../../src/services/logging.service';
import { PUBGService } from '../../src/services/pubg.service';
import { MetricsService } from '../../src/services/metrics.service';
import { AlertService } from '../../src/services/alert.service';
import { StructuredLogger } from '../../src/services/structured-logger.service';
import { ExtendedClient } from '../../src/types/client';

// Mock StructuredLogger
jest.mock('../../src/services/structured-logger.service', () => ({
  StructuredLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    logPerformance: jest.fn(),
  })),
}));

// Mock MetricsService
jest.mock('../../src/services/metrics.service', () => ({
  MetricsService: jest.fn().mockImplementation(() => ({
    recordMetric: jest.fn(),
    getSystemMetrics: jest.fn().mockReturnValue({
      memory: { used: 100, total: 1000, percentage: 10 },
      cpu: { usage: 5, loadAverage: [0.1, 0.2, 0.3] },
    }),
  })),
}));

// Mock services
const mockDatabaseService = {
  healthCheck: jest.fn(),
} as any;

const mockCacheService = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
} as any;

const mockSchedulerService = {
  getActiveJobs: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({
    totalTasks: 0,
    activeTasks: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
  }),
} as any;

const mockLoggingService = {
  getStats: jest.fn().mockReturnValue({
    queueSize: 0,
    configuredGuilds: 0,
  }),
} as any;

const mockPubgService = {
  healthCheck: jest.fn(),
} as any;

const mockMetricsService = {
  recordMetric: jest.fn(),
  getSystemMetrics: jest.fn().mockReturnValue({
    memory: { used: 100, total: 1000, percentage: 10 },
    cpu: { usage: 5, loadAverage: [0.1, 0.2, 0.3] },
  }),
} as any;

const mockAlertService = {
  sendAlert: jest.fn(),
} as any;

const mockStructuredLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  logPerformance: jest.fn(),
} as any;

const mockClient = {
  isReady: jest.fn().mockReturnValue(true),
  guilds: {
    cache: new Map([['guild1', {}], ['guild2', {}]]),
  },
  users: {
    cache: new Map([['user1', {}], ['user2', {}], ['user3', {}]]),
  },
  ws: {
    ping: 50,
  },
} as any;

const mockAlertConfig = {
  enabled: true,
  channels: ['123456789'],
  enabledChannels: ['discord' as const],
  thresholds: {
    responseTime: 5000,
    errorRate: 0.1,
    memoryUsage: 0.9,
  },
};

const mockLoggerConfig = {
  level: 'info',
  format: 'json',
  outputs: ['console'],
  environment: 'test',
  version: '1.0.0',
  logDir: './logs',
  maxFiles: 5,
  maxSize: '10m',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  enableConsole: true,
  enableFile: true,
};

describe('HealthService', () => {
  let healthService: HealthService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset mock implementations
    mockDatabaseService.healthCheck.mockResolvedValue(true);
    mockCacheService.get.mockResolvedValue('test-123');
    mockPubgService.healthCheck.mockResolvedValue({
      status: 'healthy',
      api: true,
      cache: true,
    });
    
    // Reset HealthService singleton
    (HealthService as any).instance = null;
    
    healthService = HealthService.getInstance(
      mockClient,
      mockDatabaseService,
      mockCacheService,
      mockSchedulerService,
      mockLoggingService,
      mockPubgService,
      mockAlertConfig,
      mockLoggerConfig
    );
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = HealthService.getInstance(
        mockClient,
        mockDatabaseService,
        mockCacheService,
        mockSchedulerService,
        mockLoggingService,
        mockPubgService,
        mockAlertConfig,
        mockLoggerConfig
      );
      
      const instance2 = HealthService.getInstance(
        mockClient,
        mockDatabaseService,
        mockCacheService,
        mockSchedulerService,
        mockLoggingService,
        mockPubgService,
        mockAlertConfig,
        mockLoggerConfig
      );

      expect(instance1).toBe(instance2);
    });
  });

  describe('Service Registration', () => {
    it('should register a new service', () => {
      const mockHealthChecker = jest.fn() as any;
      mockHealthChecker.mockResolvedValue({
        name: 'test-service',
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: 100,
      });

      healthService.registerService('test-service', mockHealthChecker);
      
      const availableServices = healthService.getAvailableServices();
      expect(availableServices).toContain('test-service');
    });

    it('should unregister a service', () => {
      const mockHealthChecker = jest.fn() as any;
      mockHealthChecker.mockResolvedValue({
        name: 'test-service',
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: 100,
      });

      healthService.registerService('test-service', mockHealthChecker);
      
      healthService.unregisterService('test-service');
      
      const availableServices = healthService.getAvailableServices();
      expect(availableServices).not.toContain('test-service');
    });
  });

  describe('Health Check Execution', () => {
    it('should perform comprehensive health check with all services healthy', async () => {
      // Mock all services as healthy
      mockCacheService.get.mockResolvedValue('test-123');
      
      const healthStatus = await healthService.performHealthCheck();

      expect(healthStatus.overall).toBe('healthy');
      expect(healthStatus.services).toHaveLength(5); // database, cache, scheduler, logging, pubg
      expect(healthStatus.discord.connected).toBe(true);
      expect(healthStatus.discord.guilds).toBe(2);
      expect(healthStatus.discord.users).toBe(3);
      expect(healthStatus.discord.ping).toBe(50);
    });

    it('should detect degraded status when some services fail', async () => {
      // Make one service unhealthy
      mockDatabaseService.healthCheck.mockResolvedValue(false);
      
      const healthStatus = await healthService.performHealthCheck();
      expect(healthStatus.overall).toBe('degraded');
      expect(healthStatus.services.some(s => s.status === 'unhealthy')).toBe(true);
    });

    it('should detect unhealthy status when majority of services fail', async () => {
      // Make multiple services fail
      mockDatabaseService.healthCheck.mockResolvedValue(false);
      mockCacheService.get.mockRejectedValue(new Error('Cache error'));
      
      const healthStatus = await healthService.performHealthCheck();

      expect(healthStatus.overall).toBe('unhealthy');
      expect(healthStatus.services.filter(s => s.status === 'unhealthy').length).toBeGreaterThan(1);
    });

    it('should handle service health check errors gracefully', async () => {
      // Make a service throw an error
      mockDatabaseService.healthCheck.mockRejectedValue(new Error('Connection timeout'));
      
      const healthStatus = await healthService.performHealthCheck();

      const databaseService = healthStatus.services.find(s => s.name === 'Database');
      expect(databaseService?.status).toBe('unhealthy');
      expect(databaseService?.details).toContain('Connection timeout');
    });
  });

  describe('Individual Service Health Checks', () => {
    it('should check database service health', async () => {
      mockDatabaseService.healthCheck.mockResolvedValue(true);
      
      const serviceHealth = await healthService.getServiceHealth('database');
      expect(serviceHealth).toBeDefined();
      expect(serviceHealth?.status).toBe('healthy');
      expect(serviceHealth?.name).toBe('Database');
      expect(serviceHealth?.responseTime).toBeGreaterThan(0);
    });

    it('should check cache service health', async () => {
      mockCacheService.get.mockResolvedValue('test-value');
      
      const serviceHealth = await healthService.getServiceHealth('cache');
      expect(serviceHealth).toBeDefined();
      expect(serviceHealth?.name).toBe('Cache');
      expect(serviceHealth?.status).toBe('healthy');
      expect(serviceHealth?.responseTime).toBeGreaterThan(0);
    });

    it('should return null for non-existent service', async () => {
      const serviceHealth = await healthService.getServiceHealth('non-existent');
      
      expect(serviceHealth).toBeNull();
    });
  });

  describe('System Health Status', () => {
    it('should return true when system is healthy', async () => {
      await healthService.performHealthCheck();
      
      const isHealthy = healthService.isSystemHealthy();
      
      expect(isHealthy).toBe(true);
    });

    it('should return false when system is not healthy', async () => {
      // Make services fail
      mockDatabaseService.healthCheck.mockResolvedValue(false);
      mockCacheService.get.mockRejectedValue(new Error('Cache error'));
      
      await healthService.performHealthCheck();
      
      const isHealthy = healthService.isSystemHealthy();
      
      expect(isHealthy).toBe(false);
    });
  });

  describe('Metrics Recording', () => {
    it('should record health check metrics', async () => {
      const MockedMetricsService = require('../../src/services/metrics.service').MetricsService;
      const mockInstance = MockedMetricsService.mock.results[0]?.value;
      
      await healthService.performHealthCheck();

      expect(mockInstance?.recordMetric).toHaveBeenCalled();
    });
  });

  // Note: Logging tests are skipped due to complex mocking requirements
  // The HealthService creates its own StructuredLogger instance internally
  // which makes it difficult to mock in unit tests
});