import { jest } from '@jest/globals';
import { BackupService } from '../../src/services/backup.service';
import { HealthService } from '../../src/services/health.service';
import { MetricsService } from '../../src/services/metrics.service';
import { StructuredLogger } from '../../src/services/structured-logger.service';
import { PrismaClient } from '@prisma/client';
import { getMonitoringConfig } from '../../src/config/monitoring.config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock file system operations
jest.mock('fs/promises');
jest.mock('fs');
jest.mock('zlib');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Backup System Integration', () => {
  let backupService: BackupService;
  let healthService: HealthService;
  let metricsService: MetricsService;
  let logger: StructuredLogger;
  let prisma: PrismaClient;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
  });

  afterAll(async () => {
    // Cleanup temporary directory
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup test configuration
    const config = {
      ...getMonitoringConfig(),
      backup: {
        enabled: true,
        schedule: {
          daily: true,
          weekly: false,
          monthly: false,
        },
        retention: {
          daily: 3,
          weekly: 2,
          monthly: 1,
        },
        compression: {
          enabled: true,
          level: 6,
        },
        storage: {
          local: {
            enabled: true,
            path: tempDir,
          },
        },
        verification: {
          enabled: true,
          checksumAlgorithm: 'sha256' as const,
        },
        notifications: {
          enabled: false,
          onSuccess: false,
          onFailure: true,
          channels: [],
        },
      },
    };

    // Initialize services
    logger = new StructuredLogger(config.logging, 'backup-integration-test');
    metricsService = new MetricsService();
    
    // Mock HealthService for integration test
    const mockHealthService = {
      registerService: jest.fn(),
      getHealthStatus: jest.fn().mockResolvedValue({ healthy: true, details: {} }),
    } as unknown as HealthService;

    // Mock PrismaClient
    prisma = {
      $queryRaw: jest.fn(),
      $disconnect: jest.fn(),
    } as unknown as PrismaClient;

    // Initialize BackupService
    backupService = new BackupService(
      prisma,
      logger,
      mockHealthService,
      metricsService,
      config.backup
    );

    // Mock file system operations
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ 
      isDirectory: () => true,
      size: 1024,
      mtime: new Date(),
    } as any);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(Buffer.from('test data'));
    mockFs.readdir.mockResolvedValue([]);
    mockFs.unlink.mockResolvedValue(undefined);
  });

  describe('Complete Backup Workflow', () => {
    it('should execute complete backup workflow successfully', async () => {
      // Step 1: Initialize backup service
      await backupService.initialize();
      
      expect(mockFs.access).toHaveBeenCalledWith(tempDir);
      
      // Step 2: Create a backup
      const mockDatabaseData = [
        { id: 1, name: 'Test User 1', email: 'test1@example.com' },
        { id: 2, name: 'Test User 2', email: 'test2@example.com' },
      ];
      
      (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockDatabaseData);
      
      const backupResult = await backupService.createBackup('manual');
      
      expect(backupResult.status).toBe('completed');
      expect(backupResult.filePath).toBeDefined();
      expect(backupResult.type).toBe('manual');
      expect(backupResult.compressed).toBe(true);
      
      // Step 3: Verify backup was recorded in metrics
      const allMetrics = metricsService.getAllMetrics();
      expect(allMetrics['backup_success_total']).toBeDefined();
      expect(allMetrics['backup_duration']).toBeDefined();
      
      // Step 4: Check backup history
      mockFs.readdir.mockResolvedValue(['backup_2024-01-15_10-00-00.db.gz']);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          timestamp: '2024-01-15T10:00:00.000Z',
          type: 'manual',
          checksum: 'abc123',
          size: 1024,
        })
      );
      
      const history = await backupService.getBackupHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('manual');
    });

    it('should handle backup failure gracefully', async () => {
      await backupService.initialize();
      
      // Simulate database error
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Database connection failed'));
      
      const backupResult = await backupService.createBackup('daily');
      
      expect(backupResult.status).toBe('failed');
      expect(backupResult.error).toContain('Database connection failed');
      
      // Verify error metrics were recorded
      const allMetrics = metricsService.getAllMetrics();
      expect(allMetrics['backup_failure_total']).toBeDefined();
    });
  });

  describe('Backup Retention and Cleanup', () => {
    it('should clean up old backups according to retention policy', async () => {
      await backupService.initialize();
      
      // Mock multiple backup files with different ages
      const now = new Date();
      const oldDate1 = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days old
      const oldDate2 = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days old
      const recentDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day old
      
      const mockFiles = [
        'backup_2024-01-15_10-00-00.db.gz', // Recent
        'backup_2024-01-10_10-00-00.db.gz', // Old (5 days)
        'backup_2024-01-05_10-00-00.db.gz', // Very old (10 days)
      ];
      
      mockFs.readdir.mockResolvedValue(mockFiles);
      mockFs.stat.mockImplementation((filePath) => {
        const fileName = path.basename(filePath as string);
        let mtime: Date;
        
        if (fileName.includes('2024-01-15')) mtime = recentDate;
        else if (fileName.includes('2024-01-10')) mtime = oldDate1;
        else mtime = oldDate2;
        
        return Promise.resolve({
          isDirectory: () => false,
          size: 1024,
          mtime,
        } as any);
      });
      
      await backupService.cleanupOldBackups();
      
      // Should delete files older than retention policy (3 days for daily backups)
      expect(mockFs.unlink).toHaveBeenCalled(); // Old files should be deleted
    });
  });

  describe('Health Monitoring Integration', () => {
    it('should register with health service and report status', async () => {
      const mockHealthService = {
        registerService: jest.fn(),
        getHealthStatus: jest.fn().mockResolvedValue({ healthy: true, details: {} }),
      } as unknown as HealthService;
      
      const backupServiceWithHealth = new BackupService(
        prisma,
        logger,
        mockHealthService,
        metricsService,
        {
          enabled: true,
          schedule: { daily: true, weekly: false, monthly: false },
          retention: { daily: 7, weekly: 4, monthly: 12 },
          compression: { enabled: true, level: 6 },
          storage: { local: { enabled: true, path: tempDir } },
          verification: { enabled: true, checksumAlgorithm: 'sha256' },
          notifications: { enabled: false, onSuccess: false, onFailure: true, channels: [] },
        }
      );
      
      await backupServiceWithHealth.initialize();
      
      expect(mockHealthService.registerService).toHaveBeenCalledWith(
        'backup',
        expect.any(Function)
      );
      
      // Test the health check function
      const healthCheckFn = (mockHealthService.registerService as jest.Mock).mock.calls[0][1];
      const healthResult = await healthCheckFn();
      
      expect(healthResult).toMatchObject({
        name: 'Backup',
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        lastCheck: expect.any(Date),
        responseTime: expect.any(Number),
      });
    });
  });

  describe('Metrics Collection Integration', () => {
    it('should collect and report backup metrics', async () => {
      await backupService.initialize();
      
      // Create multiple backups to generate metrics
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ data: 'test' }]);
      
      await backupService.createBackup('daily');
      await backupService.createBackup('manual');
      
      const metrics = metricsService.getAllMetrics();
      
      // Verify backup-specific metrics
      expect(metrics['backup_success_total']).toBeDefined();
      expect(metrics['backup_success_total'].value).toBeGreaterThanOrEqual(2);
      
      expect(metrics['backup_duration']).toBeDefined();
      expect(metrics['backup_size']).toBeDefined();
      
      // Get backup statistics
      const stats = backupService.getBackupStats();
      expect(stats).toMatchObject({
        totalBackups: expect.any(Number),
        successRate: expect.any(Number),
        storageUsage: expect.objectContaining({
          local: expect.any(Number),
        }),
      });
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary file system errors', async () => {
      await backupService.initialize();
      
      // Simulate temporary file system error
      mockFs.writeFile.mockRejectedValueOnce(new Error('Disk full'));
      mockFs.writeFile.mockResolvedValue(undefined); // Subsequent calls succeed
      
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ data: 'test' }]);
      
      // First backup should fail
      const firstResult = await backupService.createBackup('daily');
      expect(firstResult.status).toBe('failed');
      
      // Second backup should succeed (simulating recovery)
      const secondResult = await backupService.createBackup('daily');
      expect(secondResult.status).toBe('completed');
    });

    it('should handle database disconnection gracefully', async () => {
      await backupService.initialize();
      
      // Simulate database disconnection
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection lost'));
      
      const backupResult = await backupService.createBackup('daily');
      
      expect(backupResult.status).toBe('failed');
      expect(backupResult.error).toContain('Connection lost');
      
      // Verify error was logged and metrics recorded
      const metrics = metricsService.getAllMetrics();
      expect(metrics['backup_failure_total']).toBeDefined();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent backup requests safely', async () => {
      await backupService.initialize();
      
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ data: 'test' }]);
      
      // Start multiple backup operations concurrently
      const backupPromises = [
        backupService.createBackup('daily'),
        backupService.createBackup('manual'),
        backupService.createBackup('manual'),
      ];
      
      const results = await Promise.all(backupPromises);
      
      // All backups should complete (some may be queued/rejected based on implementation)
      results.forEach(result => {
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('filePath');
      });
      
      // Verify metrics reflect all operations
      const metrics = metricsService.getAllMetrics();
      expect(metrics['backup_success_total']).toBeDefined();
    });
  });
});