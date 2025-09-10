import { BackupService } from '../services/backup.service';
import { getMonitoringConfig } from '../config/monitoring.config';
import { StructuredLogger } from '../services/structured-logger.service';
import { AlertService } from '../services/alert.service';
import { LogCategory } from '../utils/logger';
import cron from 'node-cron';

/**
 * Backup scheduler utility
 * Manages automatic database backups based on configuration
 */
export class BackupScheduler {
  private backupService: BackupService;
  private logger: StructuredLogger;
  private alertService: AlertService;
  private scheduledTask?: cron.ScheduledTask;
  private isRunning = false;

  constructor(backupService: BackupService, logger: StructuredLogger, alertService: AlertService) {
    this.backupService = backupService;
    this.logger = logger;
    this.alertService = alertService;
  }

  /**
   * Start the backup scheduler
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Backup scheduler is already running');
      return;
    }

    const config = getMonitoringConfig();

    if (!config.backup.enabled) {
      this.logger.info('Backup is disabled in configuration');
      return;
    }

    try {
      const config = getMonitoringConfig();

      // Get cron expression from config
      const cronExpression =
        typeof config.backup.schedule === 'string'
          ? config.backup.schedule
          : config.backup.schedule.customCron || '0 2 * * *';

      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      this.scheduledTask = cron.schedule(
        cronExpression,
        async () => {
          await this.executeBackup();
        },
        {
          scheduled: false,
          timezone: 'America/Sao_Paulo',
        },
      );

      this.scheduledTask.start();
      this.isRunning = true;

      this.logger.info('Backup scheduler started successfully', {
        metadata: {
          schedule: cronExpression,
        },
      });

      // Send startup notification if enabled
      if (config.backup.notifications.enabled) {
        await this.alertService.createAlert(
          'info',
          'Backup Scheduler Started',
          `Automatic database backups scheduled: ${config.backup.schedule}`,
          'backup_scheduler',
          {
            component: 'backup-scheduler',
            schedule: config.backup.schedule,
          },
        );
      }
    } catch (error) {
      this.logger.error('Failed to start backup scheduler', {
        error: error instanceof Error ? error.message : String(error),
        schedule: config.backup.schedule,
      });

      await this.alertService.createAlert(
        'critical',
        'Backup Scheduler Failed to Start',
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        'backup_scheduler',
        {
          component: 'backup-scheduler',
          error: String(error),
        },
      );

      throw error;
    }
  }

  /**
   * Stop the backup scheduler
   */
  public stop(): void {
    if (!this.isRunning) {
      this.logger.warn('Backup scheduler is not running');
      return;
    }

    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = undefined;
    }

    this.isRunning = false;
    this.logger.info('Backup scheduler stopped');
  }

  /**
   * Execute a manual backup
   */
  public async executeManualBackup(): Promise<void> {
    this.logger.info('Executing manual backup');
    await this.executeBackup(true);
  }

  /**
   * Get scheduler status
   */
  public getStatus(): {
    isRunning: boolean;
    nextExecution?: Date;
    schedule?: string;
  } {
    const config = getMonitoringConfig();

    return {
      isRunning: this.isRunning,
      nextExecution: undefined, // node-cron doesn't provide next execution time
      schedule:
        typeof config.backup.schedule === 'string'
          ? config.backup.schedule
          : config.backup.schedule.customCron || '0 2 * * *',
    };
  }

  /**
   * Execute backup with error handling and notifications
   */
  private async executeBackup(isManual = false): Promise<void> {
    const config = getMonitoringConfig();
    const startTime = Date.now();

    try {
      this.logger.info('Starting scheduled backup', {
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });

      const result = await this.backupService.createBackup();
      const duration = Date.now() - startTime;

      this.logger.info('Backup completed successfully', {
        metadata: {
          isManual,
          duration,
          backupPath: result.backupPath,
          size: result.size,
          compressed: result.compressed,
          checksum: result.checksum,
        },
      });

      // Send success notification if enabled
      if (config.backup.notifications.enabled && config.backup.notifications.onSuccess) {
        await this.alertService.createAlert(
          'info',
          `Database Backup ${isManual ? '(Manual)' : '(Scheduled)'} Completed`,
          `Backup created successfully in ${(duration / 1000).toFixed(2)}s\nSize: ${this.formatBytes(result.size)}\nPath: ${result.backupPath}`,
          'backup_scheduler',
          {
            component: 'backup-service',
            isManual,
            duration,
            size: result.size,
            backupPath: result.backupPath,
            checksum: result.checksum,
          },
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Backup failed', {
        isManual,
        duration,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      // Send failure notification if enabled
      if (config.backup.notifications.enabled && config.backup.notifications.onFailure) {
        await this.alertService.createAlert(
          'critical',
          `Database Backup ${isManual ? '(Manual)' : '(Scheduled)'} Failed`,
          `Backup failed after ${(duration / 1000).toFixed(2)}s\nError: ${errorMessage}`,
          'backup_scheduler',
          {
            component: 'backup-service',
            isManual,
            duration,
            error: errorMessage,
          },
        );
      }

      // Don't throw error for scheduled backups to prevent scheduler from stopping
      if (isManual) {
        throw error;
      }
    }
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 Bytes';
    }

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Create and configure backup scheduler instance
 */
export function createBackupScheduler(
  backupService: BackupService,
  logger: StructuredLogger,
  alertService: AlertService,
): BackupScheduler {
  return new BackupScheduler(backupService, logger, alertService);
}
