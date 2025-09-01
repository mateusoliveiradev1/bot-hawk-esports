import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { StructuredLogger } from './structured-logger.service';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface BackupConfig {
  enabled: boolean;
  schedule: {
    daily: boolean;
    weekly: boolean;
    monthly: boolean;
    customCron?: string;
  };
  retention: {
    daily: number;    // days
    weekly: number;   // weeks
    monthly: number;  // months
  };
  compression: {
    enabled: boolean;
    level: number; // 1-9
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
      credentials: any;
    };
  };
  verification: {
    enabled: boolean;
    checksumAlgorithm: 'md5' | 'sha256';
  };
  notifications: {
    enabled: boolean;
    onSuccess: boolean;
    onFailure: boolean;
    channels: string[]; // Discord channel IDs
  };
}

export interface BackupMetadata {
  id: string;
  timestamp: Date;
  type: 'daily' | 'weekly' | 'monthly' | 'manual';
  size: number;
  compressed: boolean;
  checksum?: string;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
  duration?: number;
  filePath: string;
  backupPath: string;
}

export interface BackupStats {
  totalBackups: number;
  totalSize: number;
  lastBackup?: Date;
  nextScheduled?: Date;
  successRate: number;
  averageDuration: number;
  storageUsage: {
    local: number;
    cloud?: number;
  };
}

/**
 * Serviço de backup automático do banco de dados
 * Fornece backup agendado, compressão, rotação e verificação de integridade
 */
export class BackupService {
  private prisma: PrismaClient;
  private logger: StructuredLogger;
  private healthService: HealthService;
  private metricsService: MetricsService;
  private config: BackupConfig;
  private backupHistory: BackupMetadata[] = [];
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();
  private isInitialized = false;

  constructor(
    prisma: PrismaClient,
    logger: StructuredLogger,
    healthService: HealthService,
    metricsService: MetricsService,
    config: BackupConfig,
  ) {
    this.prisma = prisma;
    this.logger = logger;
    this.healthService = healthService;
    this.metricsService = metricsService;
    this.config = config;
  }

  /**
   * Inicializa o serviço de backup
   */
  async initialize(): Promise<void> {
    try {
      if (!this.config.enabled) {
        this.logger.info('Backup service is disabled');
        return;
      }

      // Criar diretórios necessários
      await this.ensureDirectories();

      // Carregar histórico de backups
      await this.loadBackupHistory();

      // Configurar agendamentos
      this.setupSchedules();

      // Health check is handled internally by the service

      this.isInitialized = true;
      this.logger.info('Backup service initialized successfully', {
        metadata: {
          config: {
            daily: this.config.schedule.daily,
            weekly: this.config.schedule.weekly,
            monthly: this.config.schedule.monthly,
            compression: this.config.compression.enabled,
            retention: this.config.retention,
          },
        }
      });
    } catch (error) {
      this.logger.error('Failed to initialize backup service', error);
      throw error;
    }
  }

  /**
   * Cria um backup manual
   */
  async createBackup(type: 'manual' | 'daily' | 'weekly' | 'monthly' = 'manual'): Promise<BackupMetadata> {
    const startTime = Date.now();
    const backupId = `${type}_${Date.now()}`;
    
    // Gerar nome do arquivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.db${this.config.compression.enabled ? '.gz' : ''}`;
    const backupPath = path.join(this.config.storage.local.path, filename);

    const metadata: BackupMetadata = {
      id: backupId,
      timestamp: new Date(),
      type,
      size: 0,
      compressed: this.config.compression.enabled,
      status: 'pending',
      filePath: backupPath,
      backupPath: backupPath,
    };

    try {
      this.logger.info(`Starting ${type} backup`, { metadata: { backupId } });

      // Gerar nome do arquivo
      const fileName = this.generateBackupFileName(type);
      const backupPath = path.join(this.config.storage.local.path, fileName);
      metadata.filePath = backupPath;

      // Criar backup do banco SQLite
      await this.createSQLiteBackup(backupPath);

      // Comprimir se habilitado
      if (this.config.compression.enabled) {
        await this.compressBackup(backupPath);
        metadata.filePath = `${backupPath}.gz`;
      }

      // Calcular tamanho e checksum
      const stats = await fs.promises.stat(metadata.filePath);
      metadata.size = stats.size;

      if (this.config.verification.enabled) {
        metadata.checksum = await this.calculateChecksum(metadata.filePath);
      }

      // Verificar integridade
      if (this.config.verification.enabled) {
        await this.verifyBackupIntegrity(metadata);
      }

      metadata.status = 'completed';
      metadata.duration = Date.now() - startTime;

      // Adicionar ao histórico
      this.backupHistory.push(metadata);
      await this.saveBackupHistory();

      // Limpar backups antigos (apenas para backups agendados)
      if (type !== 'manual') {
        await this.cleanupOldBackups(type as 'daily' | 'weekly' | 'monthly');
      }

      // Registrar métricas
      this.metricsService.recordBackup({
        type,
        duration: metadata.duration,
        size: metadata.size,
        success: true,
      });

      // Notificar sucesso
      if (this.config.notifications.onSuccess) {
        await this.notifyBackupResult(metadata, true);
      }

      this.logger.info(`Backup completed successfully`, {
        metadata: {
          backupId,
          type,
          size: metadata.size,
          duration: metadata.duration,
          compressed: metadata.compressed,
        }
      });

      return metadata;
    } catch (error) {
      metadata.status = 'failed';
      metadata.error = error instanceof Error ? error.message : String(error);
      metadata.duration = Date.now() - startTime;

      this.backupHistory.push(metadata);
      await this.saveBackupHistory();

      // Registrar métricas de falha
      this.metricsService.recordBackup({
        type,
        duration: metadata.duration,
        size: 0,
        success: false,
        error: metadata.error,
      });

      // Notificar falha
      if (this.config.notifications.onFailure) {
        await this.notifyBackupResult(metadata, false);
      }

      this.logger.error(`Backup failed`, error, {
        metadata: {
          backupId,
          type,
          duration: metadata.duration,
        }
      });

      throw error;
    }
  }

  /**
   * Restaura um backup
   */
  async restoreBackup(backupId: string): Promise<void> {
    try {
      const backup = this.backupHistory.find(b => b.id === backupId);
      if (!backup) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      if (backup.status !== 'completed') {
        throw new Error(`Cannot restore incomplete backup: ${backupId}`);
      }

      this.logger.info(`Starting backup restoration`, { metadata: { backupId } });

      // Verificar se o arquivo existe
      if (!await this.fileExists(backup.filePath)) {
        throw new Error(`Backup file not found: ${backup.filePath}`);
      }

      // Verificar integridade antes da restauração
      if (this.config.verification.enabled && backup.checksum) {
        const currentChecksum = await this.calculateChecksum(backup.filePath);
        if (currentChecksum !== backup.checksum) {
          throw new Error(`Backup integrity check failed: ${backupId}`);
        }
      }

      // Criar backup de segurança antes da restauração
      await this.createBackup('manual');

      // Descomprimir se necessário
      let restoreFilePath = backup.filePath;
      if (backup.compressed) {
        restoreFilePath = await this.decompressBackup(backup.filePath);
      }

      // Restaurar banco de dados
      await this.restoreSQLiteBackup(restoreFilePath);

      // Limpar arquivo temporário se foi descomprimido
      if (backup.compressed && restoreFilePath !== backup.filePath) {
        await fs.promises.unlink(restoreFilePath);
      }

      this.logger.info(`Backup restored successfully`, { metadata: { backupId } });
    } catch (error) {
      this.logger.error(`Failed to restore backup`, error, { metadata: { backupId } });
      throw error;
    }
  }

  /**
   * Lista backups disponíveis
   */
  getBackupHistory(type?: 'daily' | 'weekly' | 'monthly' | 'manual'): BackupMetadata[] {
    if (type) {
      return this.backupHistory.filter(b => b.type === type);
    }
    return [...this.backupHistory];
  }

  /**
   * Obtém estatísticas de backup
   */
  getBackupStats(): BackupStats {
    const completedBackups = this.backupHistory.filter(b => b.status === 'completed');
    const totalSize = completedBackups.reduce((sum, b) => sum + b.size, 0);
    const successRate = this.backupHistory.length > 0 
      ? (completedBackups.length / this.backupHistory.length) * 100 
      : 0;
    
    const durations = completedBackups
      .filter(b => b.duration)
      .map(b => b.duration!);
    const averageDuration = durations.length > 0 
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
      : 0;

    return {
      totalBackups: this.backupHistory.length,
      totalSize,
      lastBackup: completedBackups.length > 0 
        ? completedBackups[completedBackups.length - 1].timestamp 
        : undefined,
      successRate,
      averageDuration,
      storageUsage: {
        local: totalSize,
      },
    };
  }

  /**
   * Limpa backups antigos baseado na política de retenção
   */
  async cleanupOldBackups(type?: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    try {
      const now = new Date();
      const toDelete: BackupMetadata[] = [];

      // Filtrar backups por tipo se especificado
      const backups = type 
        ? this.backupHistory.filter(b => b.type === type)
        : this.backupHistory;

      for (const backup of backups) {
        let shouldDelete = false;
        const age = now.getTime() - backup.timestamp.getTime();

        switch (backup.type) {
          case 'daily':
            shouldDelete = age > (this.config.retention.daily * 24 * 60 * 60 * 1000);
            break;
          case 'weekly':
            shouldDelete = age > (this.config.retention.weekly * 7 * 24 * 60 * 60 * 1000);
            break;
          case 'monthly':
            shouldDelete = age > (this.config.retention.monthly * 30 * 24 * 60 * 60 * 1000);
            break;
        }

        if (shouldDelete) {
          toDelete.push(backup);
        }
      }

      // Deletar arquivos e remover do histórico
      for (const backup of toDelete) {
        try {
          if (await this.fileExists(backup.filePath)) {
            await fs.promises.unlink(backup.filePath);
          }
          
          const index = this.backupHistory.indexOf(backup);
          if (index > -1) {
            this.backupHistory.splice(index, 1);
          }

          const ageInDays = Math.floor((now.getTime() - backup.timestamp.getTime()) / (24 * 60 * 60 * 1000));
          this.logger.debug(`Deleted old backup`, {
            metadata: {
              backupId: backup.id,
              type: backup.type,
              age: ageInDays,
            }
          });
        } catch (error) {
          this.logger.warn(`Failed to delete backup file`, {
          metadata: {
            backupId: backup.id,
            filePath: backup.filePath,
            error: error instanceof Error ? error.message : String(error),
          }
        });
        }
      }

      if (toDelete.length > 0) {
        await this.saveBackupHistory();
        this.logger.info(`Cleaned up ${toDelete.length} old backups`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old backups', error);
    }
  }

  /**
   * Para o serviço de backup
   */
  async shutdown(): Promise<void> {
    try {
      // Cancelar jobs agendados
      for (const [name, timeout] of this.scheduledJobs) {
        clearTimeout(timeout);
        this.logger.debug(`Cancelled scheduled job: ${name}`);
      }
      this.scheduledJobs.clear();

      // Salvar histórico final
      await this.saveBackupHistory();

      this.isInitialized = false;
      this.logger.info('Backup service shutdown completed');
    } catch (error) {
      this.logger.error('Error during backup service shutdown', error);
    }
  }

  // Métodos privados

  private async ensureDirectories(): Promise<void> {
    const dirs = [this.config.storage.local.path];
    
    for (const dir of dirs) {
      if (!await this.directoryExists(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
        this.logger.debug(`Created backup directory: ${dir}`);
      }
    }
  }

  private setupSchedules(): void {
    // Daily backup
    if (this.config.schedule.daily) {
      this.scheduleJob('daily', '0 2 * * *', async () => { await this.createBackup('daily'); });
    }

    // Weekly backup (Sundays at 3 AM)
    if (this.config.schedule.weekly) {
      this.scheduleJob('weekly', '0 3 * * 0', async () => { await this.createBackup('weekly'); });
    }

    // Monthly backup (1st day at 4 AM)
    if (this.config.schedule.monthly) {
      this.scheduleJob('monthly', '0 4 1 * *', async () => { await this.createBackup('monthly'); });
    }

    // Custom cron
    if (this.config.schedule.customCron) {
      this.scheduleJob('custom', this.config.schedule.customCron, async () => { await this.createBackup('manual'); });
    }
  }

  private scheduleJob(name: string, cron: string, callback: () => Promise<void>): void {
    // Implementação simplificada - em produção usar biblioteca como node-cron
    const interval = this.parseCronToInterval(cron);
    if (interval > 0) {
      const timeout = setTimeout(async () => {
        try {
          await callback();
        } catch (error) {
          this.logger.error(`Scheduled backup failed: ${name}`, error);
        }
        // Reagendar
        this.scheduleJob(name, cron, callback);
      }, interval);
      
      this.scheduledJobs.set(name, timeout);
      this.logger.debug(`Scheduled backup job: ${name}`);
    }
  }

  private parseCronToInterval(cron: string): number {
    // Implementação simplificada para demonstração
    // Em produção, usar biblioteca como node-cron ou cron-parser
    if (cron === '0 2 * * *') return 24 * 60 * 60 * 1000; // Daily
    if (cron === '0 3 * * 0') return 7 * 24 * 60 * 60 * 1000; // Weekly
    if (cron === '0 4 1 * *') return 30 * 24 * 60 * 60 * 1000; // Monthly
    return 0;
  }

  private generateBackupFileName(type: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = this.config.compression.enabled ? '.db.gz' : '.db';
    return `backup_${type}_${timestamp}${extension}`;
  }

  private async createSQLiteBackup(backupPath: string): Promise<void> {
    // Para SQLite, podemos usar VACUUM INTO ou copiar o arquivo
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/dev.db';
    
    if (await this.fileExists(dbPath)) {
      await fs.promises.copyFile(dbPath, backupPath);
    } else {
      throw new Error(`Database file not found: ${dbPath}`);
    }
  }

  private async restoreSQLiteBackup(backupPath: string): Promise<void> {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/dev.db';
    
    // Fazer backup do arquivo atual
    const currentBackup = `${dbPath}.restore-backup-${Date.now()}`;
    if (await this.fileExists(dbPath)) {
      await fs.promises.copyFile(dbPath, currentBackup);
    }

    try {
      // Restaurar backup
      await fs.promises.copyFile(backupPath, dbPath);
      
      // Verificar se a restauração funcionou
      await this.prisma.$queryRaw`SELECT 1`;
      
      // Remover backup temporário
      if (await this.fileExists(currentBackup)) {
        await fs.promises.unlink(currentBackup);
      }
    } catch (error) {
      // Restaurar arquivo original em caso de erro
      if (await this.fileExists(currentBackup)) {
        await fs.promises.copyFile(currentBackup, dbPath);
        await fs.promises.unlink(currentBackup);
      }
      throw error;
    }
  }

  private async compressBackup(filePath: string): Promise<void> {
    const data = await fs.promises.readFile(filePath);
    const compressed = await gzip(data, { level: this.config.compression.level });
    await fs.promises.writeFile(`${filePath}.gz`, compressed);
    await fs.promises.unlink(filePath);
  }

  private async decompressBackup(filePath: string): Promise<string> {
    const compressed = await fs.promises.readFile(filePath);
    const decompressed = await gunzip(compressed);
    const tempPath = filePath.replace('.gz', '.temp');
    await fs.promises.writeFile(tempPath, decompressed);
    return tempPath;
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const data = await fs.promises.readFile(filePath);
    return crypto.createHash(this.config.verification.checksumAlgorithm).update(data).digest('hex');
  }

  private async verifyBackupIntegrity(metadata: BackupMetadata): Promise<void> {
    // Verificar se o arquivo pode ser lido
    if (!await this.fileExists(metadata.filePath)) {
      throw new Error('Backup file not found after creation');
    }

    // Para backups comprimidos, tentar descomprimir
    if (metadata.compressed) {
      try {
        const tempPath = await this.decompressBackup(metadata.filePath);
        await fs.promises.unlink(tempPath);
      } catch (error) {
        throw new Error('Backup compression integrity check failed');
      }
    }
  }

  private async loadBackupHistory(): Promise<void> {
    const historyPath = path.join(this.config.storage.local.path, 'backup-history.json');
    
    try {
      if (await this.fileExists(historyPath)) {
        const data = await fs.promises.readFile(historyPath, 'utf8');
        this.backupHistory = JSON.parse(data).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
        this.logger.debug(`Loaded ${this.backupHistory.length} backup records`);
      }
    } catch (error) {
      this.logger.warn('Failed to load backup history', { metadata: { error } });
      this.backupHistory = [];
    }
  }

  private async saveBackupHistory(): Promise<void> {
    const historyPath = path.join(this.config.storage.local.path, 'backup-history.json');
    
    try {
      await fs.promises.writeFile(
        historyPath,
        JSON.stringify(this.backupHistory, null, 2),
        'utf8',
      );
    } catch (error) {
      this.logger.error('Failed to save backup history', error);
    }
  }

  private async notifyBackupResult(metadata: BackupMetadata, success: boolean): Promise<void> {
    // Implementar notificações Discord aqui
    // Por enquanto apenas log
    const message = success 
      ? `✅ Backup ${metadata.type} concluído com sucesso (${this.formatBytes(metadata.size)})`
      : `❌ Backup ${metadata.type} falhou: ${metadata.error}`;
    
    this.logger.info('Backup notification', { metadata: { message, ...metadata } });
  }

  private async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = this.getBackupStats();
      const lastBackupAge = stats.lastBackup 
        ? Date.now() - stats.lastBackup.getTime()
        : null;
      
      const healthy = this.isInitialized && 
        (lastBackupAge === null || lastBackupAge < 25 * 60 * 60 * 1000); // 25 hours

      return {
        healthy,
        details: {
          initialized: this.isInitialized,
          totalBackups: stats.totalBackups,
          lastBackup: stats.lastBackup,
          successRate: stats.successRate,
          storageUsage: this.formatBytes(stats.storageUsage.local),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}