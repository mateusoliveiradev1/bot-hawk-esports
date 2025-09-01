import { jest } from '@jest/globals';
import { BackupService } from '../../src/services/backup.service';
import { StructuredLogger } from '../../src/services/structured-logger.service';
import { HealthService } from '../../src/services/health.service';
import { MetricsService } from '../../src/services/metrics.service';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock file system operations
jest.mock('fs/promises');
jest.mock('fs');
jest.mock('zlib');

const mockFs = fs as jest.Mocked<typeof fs>;

// Mock services
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logPerformance: jest.fn(),
} as unknown as StructuredLogger;

const mockHealthService = {
  registerService: jest.fn(),
  getHealthStatus: jest.fn().mockResolvedValue({ status: 'healthy' }),
} as unknown as HealthService;

const mockMetricsService = {
  recordMetric: jest.fn(),
  getSystemMetrics: jest.fn().mockReturnValue({
    memory: { used: 100, total: 1000, percentage: 10 },
    cpu: { usage: 5, loadAverage: [0.1, 0.2, 0.3] },
  }),
} as unknown as MetricsService;

const mockPrisma = {
  $queryRaw: jest.fn(),
  $disconnect: jest.fn(),
} as unknown as PrismaClient;

const mockConfig = {
  enabled: true,
  schedule: {
    daily: true,
    weekly: true,
    monthly: false,
  },
  retention: {
    daily: 7,
    weekly: 4,
    monthly: 12,
  },
  compression: {
    enabled: true,
    level: 6,
  },
  storage: {
    local: {
      enabled: true,
      path: './test-backups',
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
};

describe('BackupService', () => {
  let backupService: BackupService;

  beforeEach(() => {
    jest.clearAllMocks();
    backupService = new BackupService(
      mockPrisma,
      mockLogger,
      mockHealthService,
      mockMetricsService,
      mockConfig
    );
  });

  describe('Initialization', () => {
    it('should initialize backup service successfully', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      await backupService.initialize();

      expect(mockHealthService.registerService).toHaveBeenCalledWith(
        'backup',
        expect.any(Function)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'BackupService initialized successfully'
      );
    });

    it('should create backup directory if it does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory not found'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      await backupService.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith('./test-backups', { recursive: true });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Created backup directory: ./test-backups'
      );
    });

    it('should throw error if backup directory creation fails', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory not found'));
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(backupService.initialize()).rejects.toThrow(
        'Failed to initialize backup service'
      );
    });
  });

  describe('Backup Creation', () => {
    beforeEach(async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      await backupService.initialize();
    });

    it('should create backup successfully', async () => {
      const mockBackupData = Buffer.from('test backup data');
      mockPrisma.$queryRaw = jest.fn().mockResolvedValue([{ data: 'test' }]);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(mockBackupData);
      mockFs.stat.mockResolvedValue({ size: 1000 } as any);

      const result = await backupService.createBackup('manual');

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('backup_');
      expect(result.filePath).toContain('.db.gz');
      expect(mockMetricsService.recordMetric).toHaveBeenCalledWith(
        'backup_created',
        1,
        'counter'
      );
    });

    it('should handle backup creation failure', async () => {
      mockPrisma.$queryRaw = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await backupService.createBackup('manual');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Backup creation failed:',
        expect.any(Error)
      );
    });
  });

  describe('Backup History', () => {
    beforeEach(async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      await backupService.initialize();
    });

    it('should return backup history', async () => {
      const mockFiles = [
        'backup_2024-01-15_10-00-00.db.gz',
        'backup_2024-01-14_10-00-00.db.gz',
        'backup_2024-01-13_10-00-00.db.gz.meta',
      ];
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.stat.mockResolvedValue({ size: 1000, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          timestamp: '2024-01-15T10:00:00.000Z',
          type: 'daily',
          checksum: 'abc123',
        })
      );

      const history = await backupService.getBackupHistory();

      expect(history).toHaveLength(2); // Only .gz files, not .meta
      expect(history[0]).toMatchObject({
        type: 'daily',
        size: 1000,
      });
    });

    it('should handle empty backup directory', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const history = await backupService.getBackupHistory();

      expect(history).toHaveLength(0);
    });
  });

  describe('Backup Cleanup', () => {
    beforeEach(async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      await backupService.initialize();
    });

    it('should clean up old backups based on retention policy', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days old

      const mockFiles = [
        'backup_2024-01-15_10-00-00.db.gz',
        'backup_2024-01-05_10-00-00.db.gz', // Old file
      ];
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.stat.mockImplementation((filePath) => {
        const isOld = (filePath as string).includes('2024-01-05');
        return Promise.resolve({
          size: 1000,
          mtime: isOld ? oldDate : new Date(),
        } as any);
      });
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await backupService.cleanupOldBackups();

      expect(result.deletedCount).toBe(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('2024-01-05')
      );
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when service is initialized', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      await backupService.initialize();

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
});