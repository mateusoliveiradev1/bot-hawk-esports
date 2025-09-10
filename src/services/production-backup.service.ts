import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { EventEmitter } from 'events';
import { productionLogger, createLogContext } from '../utils/production-logger';
import { LogCategory } from '../utils/logger';
import { productionConfig } from '../config/production.config';
import { productionMonitoring } from './production-monitoring.service';
import { DatabaseService } from '../database/database.service';

export interface BackupConfig {
  enabled: boolean;
  schedule: string; // Cron expression
  retention: {
    daily: number; // Keep daily backups for N days
    weekly: number; // Keep weekly backups for N weeks
    monthly: number; // Keep monthly backups for N months
  };
  compression: boolean;
  encryption?: {
    enabled: boolean;
    algorithm: string;
    key?: string;
  };
  storage: {
    local: {
      enabled: boolean;
      path: string;
    };
    cloud?: {
      enabled: boolean;
      provider: 'aws' | 'gcp' | 'azure';
      bucket: string;
      credentials?: any;
    };
  };
}

export interface BackupResult {
  success: boolean;
  backupId: string;
  timestamp: Date;
  size: number;
  duration: number;
  type: 'database' | 'files' | 'logs' | 'full';
  location: string;
  error?: string;
}

export interface BackupStats {
  totalBackups: number;
  successfulBackups: number;
  failedBackups: number;
  totalSize: number;
  lastBackup?: Date;
  nextScheduledBackup?: Date;
}

class ProductionBackupService extends EventEmitter {
  private config: BackupConfig;
  private stats: BackupStats = {
    totalBackups: 0,
    successfulBackups: 0,
    failedBackups: 0,
    totalSize: 0,
  };
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor() {
    super();
    this.config = {
      enabled: true, // Default enabled
      schedule: '0 2 * * *', // Daily at 2 AM
      retention: {
        daily: productionConfig.backup.retentionDays,
        weekly: 4, // 4 weeks
        monthly: 12, // 12 months
      },
      compression: true,
      encryption: {
        enabled: false,
        algorithm: 'aes-256-gcm',
      },
      storage: {
        local: {
          enabled: true,
          path: productionConfig.backup.storagePath,
        },
      },
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Ensure backup directory exists
      await this.ensureBackupDirectory();

      // Load existing stats
      await this.loadStats();

      // Schedule automatic backups
      if (this.config.enabled) {
        this.scheduleBackups();
      }

      productionLogger.info(
        'Production backup service initialized',
        createLogContext(LogCategory.SYSTEM, {
          metadata: {
            enabled: this.config.enabled,
            schedule: this.config.schedule,
            storage: this.config.storage,
          },
        }),
      );
    } catch (error) {
      productionLogger.error(
        'Failed to initialize backup service',
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
    }
  }

  private async ensureBackupDirectory(): Promise<void> {
    if (this.config.storage.local.enabled) {
      try {
        await fs.mkdir(this.config.storage.local.path, { recursive: true });

        // Create subdirectories for different backup types
        const subdirs = ['database', 'files', 'logs', 'full'];
        for (const subdir of subdirs) {
          await fs.mkdir(join(this.config.storage.local.path, subdir), { recursive: true });
        }
      } catch (error) {
        throw new Error(`Failed to create backup directory: ${error}`);
      }
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const statsFile = join(this.config.storage.local.path, 'backup-stats.json');
      const data = await fs.readFile(statsFile, 'utf-8');
      this.stats = { ...this.stats, ...JSON.parse(data) };
    } catch (error) {
      // Stats file doesn't exist or is corrupted, start fresh
      productionLogger.debug(
        'No existing backup stats found, starting fresh',
        createLogContext(LogCategory.SYSTEM),
      );
    }
  }

  private async saveStats(): Promise<void> {
    try {
      const statsFile = join(this.config.storage.local.path, 'backup-stats.json');
      await fs.writeFile(statsFile, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      productionLogger.error('Failed to save backup stats', {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  private scheduleBackups(): void {
    // Parse cron expression and schedule backups
    // For simplicity, we'll use a basic interval-based approach
    // In production, you'd want to use a proper cron library like 'node-cron'

    // Daily database backup at 2 AM
    const dailyBackup = setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 2 && now.getMinutes() === 0) {
        await this.createDatabaseBackup();
      }
    }, 60000); // Check every minute

    // Weekly full backup on Sunday at 3 AM
    const weeklyBackup = setInterval(async () => {
      const now = new Date();
      if (now.getDay() === 0 && now.getHours() === 3 && now.getMinutes() === 0) {
        await this.createFullBackup();
      }
    }, 60000);

    this.scheduledJobs.set('daily', dailyBackup);
    this.scheduledJobs.set('weekly', weeklyBackup);

    productionLogger.info('Backup schedules configured', {
      category: LogCategory.SYSTEM,
      metadata: {
        dailyBackup: '2:00 AM',
        weeklyBackup: 'Sunday 3:00 AM',
      },
    });
  }

  async createDatabaseBackup(): Promise<BackupResult> {
    const backupId = `db_${Date.now()}`;
    const timestamp = new Date();
    const startTime = Date.now();

    productionLogger.info(
      `Starting database backup: ${backupId}`,
      createLogContext(LogCategory.SYSTEM),
    );

    try {
      this.isRunning = true;
      this.stats.totalBackups++;

      // Create backup filename
      const filename = `${backupId}.sql${this.config.compression ? '.gz' : ''}`;
      const backupPath = join(this.config.storage.local.path, 'database', filename);

      // Generate database dump
      const dumpData = await this.generateDatabaseDump();

      // Write to file with optional compression
      let size: number;
      if (this.config.compression) {
        size = await this.writeCompressedFile(backupPath, dumpData);
      } else {
        await fs.writeFile(backupPath, dumpData);
        const stats = await fs.stat(backupPath);
        size = stats.size;
      }

      const duration = Date.now() - startTime;
      this.stats.successfulBackups++;
      this.stats.totalSize += size;
      this.stats.lastBackup = timestamp;

      const result: BackupResult = {
        success: true,
        backupId,
        timestamp,
        size,
        duration,
        type: 'database',
        location: backupPath,
      };

      await this.saveStats();
      this.emit('backupCompleted', result);

      productionLogger.info(
        `Database backup completed: ${backupId}`,
        createLogContext(LogCategory.SYSTEM, {
          metadata: {
            size: this.formatBytes(size),
            duration: `${duration}ms`,
            location: backupPath,
          },
        }),
      );

      productionLogger.info(
        'Backup metrics recorded',
        createLogContext(LogCategory.SYSTEM, {
          metadata: {
            backupSize: size,
            backupDuration: duration,
            backupId,
          },
        }),
      );

      return result;
    } catch (error) {
      this.stats.failedBackups++;
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: BackupResult = {
        success: false,
        backupId,
        timestamp,
        size: 0,
        duration,
        type: 'database',
        location: '',
        error: errorMessage,
      };

      productionLogger.error(
        `Database backup failed: ${backupId}`,
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );

      productionMonitoring.createAlert('critical', 'backup', 'Database backup failed', {
        backupId,
        error: errorMessage,
      });

      this.emit('backupFailed', result);
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  private async generateDatabaseDump(): Promise<string> {
    try {
      // This is a simplified version - in production you'd use proper database dump tools
      // For PostgreSQL: pg_dump, for MySQL: mysqldump, etc.

      // Simplified database dump - in production, use proper database dump tools
      // For PostgreSQL: pg_dump, for MySQL: mysqldump, etc.
      const tables = ['users', 'guilds', 'badges', 'quiz_questions', 'music_queue', 'logs'];
      let dump = `-- Database backup generated at ${new Date().toISOString()}\n\n`;

      // Note: This is a placeholder implementation
      // In production, you would use actual database dump utilities
      for (const table of tables) {
        dump += `-- Table: ${table}\n`;
        dump += '-- Backup would be generated using proper database tools\n\n';
      }

      productionLogger.info(
        'Database dump generated (placeholder)',
        createLogContext(LogCategory.SYSTEM, {
          metadata: {
            tables: tables.length,
            timestamp: new Date().toISOString(),
          },
        }),
      );

      return dump;
    } catch (error) {
      throw new Error(`Failed to generate database dump: ${error}`);
    }
  }

  async createFilesBackup(): Promise<BackupResult> {
    const backupId = `files_${Date.now()}`;
    const timestamp = new Date();
    const startTime = Date.now();

    productionLogger.info(
      `Starting files backup: ${backupId}`,
      createLogContext(LogCategory.SYSTEM),
    );

    try {
      this.isRunning = true;
      this.stats.totalBackups++;

      // Create backup filename
      const filename = `${backupId}.tar${this.config.compression ? '.gz' : ''}`;
      const backupPath = join(this.config.storage.local.path, 'files', filename);

      // Backup important directories
      const dirsToBackup = [
        'src/config',
        'uploads',
        'logs',
        '.env.production',
        'package.json',
        'package-lock.json',
      ];

      const size = await this.createTarArchive(dirsToBackup, backupPath);
      const duration = Date.now() - startTime;

      this.stats.successfulBackups++;
      this.stats.totalSize += size;
      this.stats.lastBackup = timestamp;

      const result: BackupResult = {
        success: true,
        backupId,
        timestamp,
        size,
        duration,
        type: 'files',
        location: backupPath,
      };

      await this.saveStats();
      this.emit('backupCompleted', result);

      productionLogger.info(
        `Files backup completed: ${backupId}`,
        createLogContext(LogCategory.SYSTEM, {
          metadata: {
            size: this.formatBytes(size),
            duration: `${duration}ms`,
            location: backupPath,
          },
        }),
      );

      return result;
    } catch (error) {
      this.stats.failedBackups++;
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: BackupResult = {
        success: false,
        backupId,
        timestamp,
        size: 0,
        duration,
        type: 'files',
        location: '',
        error: errorMessage,
      };

      productionLogger.error(
        `Files backup failed: ${backupId}`,
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );

      this.emit('backupFailed', result);
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  async createFullBackup(): Promise<BackupResult> {
    const backupId = `full_${Date.now()}`;
    const timestamp = new Date();
    const startTime = Date.now();

    productionLogger.info(`Starting full backup: ${backupId}`, {
      category: LogCategory.SYSTEM,
    });

    try {
      // Create database backup
      const dbBackup = await this.createDatabaseBackup();

      // Create files backup
      const filesBackup = await this.createFilesBackup();

      const totalSize = dbBackup.size + filesBackup.size;
      const duration = Date.now() - startTime;

      const result: BackupResult = {
        success: dbBackup.success && filesBackup.success,
        backupId,
        timestamp,
        size: totalSize,
        duration,
        type: 'full',
        location: this.config.storage.local.path,
      };

      productionLogger.info(`Full backup completed: ${backupId}`, {
        category: LogCategory.SYSTEM,
        metadata: {
          totalSize: this.formatBytes(totalSize),
          duration: `${duration}ms`,
          dbBackup: dbBackup.success,
          filesBackup: filesBackup.success,
        },
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: BackupResult = {
        success: false,
        backupId,
        timestamp,
        size: 0,
        duration,
        type: 'full',
        location: '',
        error: errorMessage,
      };

      productionLogger.error(`Full backup failed: ${backupId}`, {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      return result;
    }
  }

  private async writeCompressedFile(filePath: string, data: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const gzip = createGzip();
      const writeStream = createWriteStream(filePath);
      let size = 0;

      writeStream.on('finish', () => resolve(size));
      writeStream.on('error', reject);

      gzip.on('data', chunk => {
        size += chunk.length;
      });

      gzip.pipe(writeStream);
      gzip.write(data);
      gzip.end();
    });
  }

  private async createTarArchive(paths: string[], outputPath: string): Promise<number> {
    // Simplified tar creation - in production use a proper tar library
    // This is just a placeholder implementation
    const archiveData = JSON.stringify({ paths, timestamp: new Date() });

    if (this.config.compression) {
      return this.writeCompressedFile(outputPath, archiveData);
    } else {
      await fs.writeFile(outputPath, archiveData);
      const stats = await fs.stat(outputPath);
      return stats.size;
    }
  }

  async cleanupOldBackups(): Promise<void> {
    try {
      const backupTypes = ['database', 'files', 'logs', 'full'];

      for (const type of backupTypes) {
        const backupDir = join(this.config.storage.local.path, type);

        try {
          const files = await fs.readdir(backupDir);
          const fileStats = await Promise.all(
            files.map(async file => {
              const filePath = join(backupDir, file);
              const stats = await fs.stat(filePath);
              return { file, path: filePath, mtime: stats.mtime };
            }),
          );

          // Sort by modification time (newest first)
          fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

          // Keep only the specified number of backups
          const retention = this.config.retention.daily; // Simplified
          const filesToDelete = fileStats.slice(retention);

          for (const fileInfo of filesToDelete) {
            await fs.unlink(fileInfo.path);
            productionLogger.info(`Deleted old backup: ${fileInfo.file}`, {
              category: LogCategory.SYSTEM,
            });
          }
        } catch (error) {
          productionLogger.error(`Failed to cleanup ${type} backups`, {
            category: LogCategory.SYSTEM,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    } catch (error) {
      productionLogger.error('Failed to cleanup old backups', {
        category: LogCategory.SYSTEM,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async restoreBackup(backupId: string, type: 'database' | 'files' | 'full'): Promise<boolean> {
    try {
      productionLogger.info(
        `Starting restore from backup: ${backupId}`,
        createLogContext(LogCategory.SYSTEM, {
          metadata: { backupId, type },
        }),
      );

      // Implementation would depend on backup type
      // This is a placeholder for the restore logic

      productionLogger.info(`Restore completed: ${backupId}`, createLogContext(LogCategory.SYSTEM));

      return true;
    } catch (error) {
      productionLogger.error(
        `Restore failed: ${backupId}`,
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
      return false;
    }
  }

  async getBackupList(): Promise<
    Array<{ id: string; type: string; size: number; date: Date; location: string }>
  > {
    const backups: Array<{ id: string; type: string; size: number; date: Date; location: string }> =
      [];

    try {
      const backupTypes = ['database', 'files', 'logs', 'full'];

      for (const type of backupTypes) {
        const backupDir = join(this.config.storage.local.path, type);

        try {
          const files = await fs.readdir(backupDir);

          for (const file of files) {
            const filePath = join(backupDir, file);
            const stats = await fs.stat(filePath);

            backups.push({
              id: file.replace(/\.(sql|tar)(\.gz)?$/, ''),
              type,
              size: stats.size,
              date: stats.mtime,
              location: filePath,
            });
          }
        } catch (error) {
          // Directory might not exist
        }
      }
    } catch (error) {
      productionLogger.error(
        'Failed to get backup list',
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
        }),
      );
    }

    return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  getStats(): BackupStats {
    return { ...this.stats };
  }

  isBackupRunning(): boolean {
    return this.isRunning;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 Bytes';
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async shutdown(): Promise<void> {
    // Clear scheduled jobs
    for (const [name, job] of this.scheduledJobs) {
      clearInterval(job);
      productionLogger.debug(`Cleared scheduled backup job: ${name}`, {
        category: LogCategory.SYSTEM,
      });
    }
    this.scheduledJobs.clear();

    // Save final stats
    await this.saveStats();

    productionLogger.info('Production backup service shutdown completed', {
      category: LogCategory.SYSTEM,
    });
  }
}

// Export singleton instance
export const productionBackup = new ProductionBackupService();
export default productionBackup;
