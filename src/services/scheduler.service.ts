import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { RankingService } from './ranking.service';
import { BadgeService } from './badge.service';
import { PresenceService } from './presence.service';
import { ClipService } from './clip.service';
import { WeaponMasteryService } from './weapon-mastery.service';
import { ExtendedClient } from '../types/client';
import { EmbedBuilder, TextChannel } from 'discord.js';
import * as cron from 'node-cron';

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  errorCount: number;
  averageExecutionTime: number;
  handler: () => Promise<void>;
}

export interface TaskExecution {
  taskId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  success: boolean;
  error?: string;
  result?: any;
}

export interface SchedulerStats {
  totalTasks: number;
  activeTasks: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  uptime: number;
  lastUpdate: Date;
}

/**
 * Scheduler Service for managing automated tasks
 */
export class SchedulerService {
  private logger: Logger;
  private cache: CacheService;
  private database: DatabaseService;
  private rankingService: RankingService;
  private badgeService: BadgeService;
  private presenceService: PresenceService;
  private clipService: ClipService;
  private weaponMasteryService: WeaponMasteryService;
  private client: ExtendedClient;

  private tasks: Map<string, ScheduledTask> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private executions: TaskExecution[] = [];
  private startTime: Date = new Date();

  private readonly maxExecutionHistory = 1000;

  constructor(client: ExtendedClient) {
    if (!client) {
      throw new Error('ExtendedClient is required');
    }

    this.logger = new Logger();
    this.client = client;

    // Validate required services
    if (!client.cache) {
      throw new Error('CacheService is required');
    }
    if (!client.database) {
      throw new Error('DatabaseService is required');
    }

    this.cache = client.cache;
    this.database = client.database;

    try {
      this.rankingService = new RankingService(client);
      this.badgeService = new BadgeService(client, (client as any).xpService, (client as any).services?.logging);
      this.presenceService = new PresenceService(client);
      this.clipService = new ClipService(client);
      this.weaponMasteryService = new WeaponMasteryService(client);

      this.initializeTasks();
      this.startTasks();
      this.startMonitoring();

      this.logger.info('SchedulerService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SchedulerService:', error);
      throw error;
    }
  }

  /**
   * Initialize all scheduled tasks
   */
  private initializeTasks(): void {
    // Daily tasks
    this.addTask({
      id: 'daily_ranking_update',
      name: 'Atualização de Rankings Diários',
      description: 'Atualiza rankings PUBG e internos diariamente',
      cronExpression: '0 6 * * *', // 6:00 AM daily
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.updateDailyRankings.bind(this),
    });

    this.addTask({
      id: 'daily_presence_reset',
      name: 'Reset de Presença Diário',
      description: 'Reseta contadores de presença diários',
      cronExpression: '0 0 * * *', // Midnight daily
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.resetDailyPresence.bind(this),
    });

    this.addTask({
      id: 'daily_challenges',
      name: 'Desafios Diários',
      description: 'Gera novos desafios diários para os usuários',
      cronExpression: '0 8 * * *', // 8:00 AM daily
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.generateDailyChallenges.bind(this),
    });

    this.addTask({
      id: 'daily_backup',
      name: 'Backup Diário',
      description: 'Realiza backup dos dados importantes',
      cronExpression: '0 2 * * *', // 2:00 AM daily
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.performDailyBackup.bind(this),
    });

    // Weekly tasks
    this.addTask({
      id: 'weekly_ranking_update',
      name: 'Atualização de Rankings Semanais',
      description: 'Atualiza rankings semanais e distribui recompensas',
      cronExpression: '0 10 * * 1', // 10:00 AM on Mondays
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.updateWeeklyRankings.bind(this),
    });

    this.addTask({
      id: 'weekly_challenges',
      name: 'Desafios Semanais',
      description: 'Gera novos desafios semanais',
      cronExpression: '0 9 * * 1', // 9:00 AM on Mondays
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.generateWeeklyChallenges.bind(this),
    });

    this.addTask({
      id: 'weekly_stats_report',
      name: 'Relatório Semanal',
      description: 'Gera relatório semanal de atividades',
      cronExpression: '0 18 * * 0', // 6:00 PM on Sundays
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.generateWeeklyReport.bind(this),
    });

    // Monthly tasks
    this.addTask({
      id: 'monthly_ranking_update',
      name: 'Atualização de Rankings Mensais',
      description: 'Atualiza rankings mensais e distribui recompensas especiais',
      cronExpression: '0 12 1 * *', // 12:00 PM on 1st of each month
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.updateMonthlyRankings.bind(this),
    });

    this.addTask({
      id: 'monthly_challenges',
      name: 'Desafios Mensais',
      description: 'Gera novos desafios mensais',
      cronExpression: '0 11 1 * *', // 11:00 AM on 1st of each month
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.generateMonthlyChallenges.bind(this),
    });

    this.addTask({
      id: 'monthly_cleanup',
      name: 'Limpeza Mensal',
      description: 'Remove dados antigos e otimiza o banco de dados',
      cronExpression: '0 3 1 * *', // 3:00 AM on 1st of each month
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.performMonthlyCleanup.bind(this),
    });

    // Hourly tasks
    this.addTask({
      id: 'hourly_pubg_update',
      name: 'Atualização PUBG Horária',
      description: 'Atualiza dados PUBG dos usuários ativos',
      cronExpression: '0 * * * *', // Every hour
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.updatePUBGData.bind(this),
    });

    this.addTask({
      id: 'hourly_cache_cleanup',
      name: 'Limpeza de Cache Horária',
      description: 'Remove entradas expiradas do cache',
      cronExpression: '30 * * * *', // 30 minutes past every hour
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.cleanupCache.bind(this),
    });

    // Every 6 hours
    this.addTask({
      id: 'weapon_mastery_sync',
      name: 'Sincronização de Maestria de Armas',
      description: 'Sincroniza dados de maestria de armas de todos os usuários',
      cronExpression: '0 */6 * * *', // Every 6 hours
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.syncWeaponMastery.bind(this),
    });

    // Every 15 minutes
    this.addTask({
      id: 'presence_auto_checkout',
      name: 'Auto Check-out de Presença',
      description: 'Realiza check-out automático de usuários inativos',
      cronExpression: '*/15 * * * *', // Every 15 minutes
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.autoCheckoutInactiveUsers.bind(this),
    });

    // Every 5 minutes
    this.addTask({
      id: 'badge_progress_check',
      name: 'Verificação de Progresso de Badges',
      description: 'Verifica e atualiza progresso de badges automáticas',
      cronExpression: '*/5 * * * *', // Every 5 minutes
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.checkBadgeProgress.bind(this),
    });

    // Every 10 minutes
    this.addTask({
      id: 'ticket_cleanup_processor',
      name: 'Processador de Limpeza de Tickets',
      description: 'Processa tarefas pendentes de limpeza de canais de ticket',
      cronExpression: '*/10 * * * *', // Every 10 minutes
      enabled: true,
      runCount: 0,
      errorCount: 0,
      averageExecutionTime: 0,
      handler: this.processTicketCleanupTasks.bind(this),
    });

    this.logger.info(`Initialized ${this.tasks.size} scheduled tasks`);
  }

  /**
   * Add a new scheduled task
   */
  private addTask(task: ScheduledTask): void {
    try {
      // Validate task
      if (!task || typeof task !== 'object') {
        throw new Error('Task must be a valid object');
      }
      if (!task.id || typeof task.id !== 'string') {
        throw new Error('Task ID is required and must be a string');
      }
      if (!task.name || typeof task.name !== 'string') {
        throw new Error('Task name is required and must be a string');
      }
      if (!task.cronExpression || typeof task.cronExpression !== 'string') {
        throw new Error('Cron expression is required and must be a string');
      }
      if (typeof task.handler !== 'function') {
        throw new Error('Task handler must be a function');
      }

      // Validate cron expression
      if (!cron.validate(task.cronExpression)) {
        throw new Error(`Invalid cron expression: ${task.cronExpression}`);
      }

      // Check for duplicate task IDs
      if (this.tasks.has(task.id)) {
        this.logger.warn(`Task with ID '${task.id}' already exists, replacing...`);
      }

      this.tasks.set(task.id, task);
      this.logger.debug(`Added task: ${task.name} (${task.id})`);
    } catch (error) {
      this.logger.error(`Failed to add task: ${task?.name || 'unknown'}`, error);
      throw error;
    }
  }

  /**
   * Start all enabled tasks
   */
  private startTasks(): void {
    try {
      let startedCount = 0;
      let failedCount = 0;

      for (const [taskId, task] of this.tasks) {
        if (task.enabled) {
          try {
            this.startTask(taskId);
            startedCount++;
          } catch (error) {
            this.logger.error(`Failed to start task ${task.name} (${taskId}):`, error);
            failedCount++;
          }
        }
      }

      this.logger.info(`Started ${startedCount} scheduled tasks (${failedCount} failed)`);
    } catch (error) {
      this.logger.error('Failed to start tasks:', error);
      throw error;
    }
  }

  /**
   * Start a specific task
   */
  private startTask(taskId: string): void {
    try {
      if (!taskId || typeof taskId !== 'string') {
        throw new Error('Task ID must be a valid string');
      }

      const task = this.tasks.get(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      if (!task.enabled) {
        this.logger.warn(`Attempted to start disabled task: ${task.name}`);
        return;
      }

      // Stop existing job if running
      if (this.cronJobs.has(taskId)) {
        try {
          this.cronJobs.get(taskId)!.stop();
          this.cronJobs.delete(taskId);
          this.logger.debug(`Stopped existing job for task: ${task.name}`);
        } catch (error) {
          this.logger.warn(`Failed to stop existing job for task ${task.name}:`, error);
        }
      }

      // Validate cron expression before creating job
      if (!cron.validate(task.cronExpression)) {
        throw new Error(`Invalid cron expression for task ${task.name}: ${task.cronExpression}`);
      }

      // Create new cron job
      const job = cron.schedule(
        task.cronExpression,
        async () => {
          await this.executeTask(taskId);
        },
        {
          scheduled: false,
          timezone: 'America/Sao_Paulo',
        }
      );

      job.start();
      this.cronJobs.set(taskId, job);

      // Calculate next run time
      try {
        task.nextRun = this.getNextRunTime(task.cronExpression);
      } catch (error) {
        this.logger.warn(`Failed to calculate next run time for task ${task.name}:`, error);
      }

      this.logger.info(`Started task: ${task.name} (next run: ${task.nextRun?.toISOString()})`);
    } catch (error) {
      this.logger.error(`Failed to start task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Stop a specific task
   */
  private stopTask(taskId: string): void {
    try {
      if (!taskId || typeof taskId !== 'string') {
        throw new Error('Task ID must be a valid string');
      }

      const cronJob = this.cronJobs.get(taskId);
      if (cronJob) {
        try {
          cronJob.stop();
          this.cronJobs.delete(taskId);

          const task = this.tasks.get(taskId);
          if (task) {
            task.nextRun = undefined;
            this.logger.info(`Stopped task: ${task.name}`);
          } else {
            this.logger.info(`Stopped task: ${taskId}`);
          }
        } catch (error) {
          this.logger.error(`Failed to stop cron job for task ${taskId}:`, error);
          // Still remove from map even if stop failed
          this.cronJobs.delete(taskId);
        }
      } else {
        this.logger.warn(`No running job found for task: ${taskId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to stop task ${taskId}:`, error);
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(taskId: string): Promise<void> {
    if (!taskId || typeof taskId !== 'string') {
      this.logger.error('Invalid task ID provided for execution');
      return;
    }

    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.error(`Task not found for execution: ${taskId}`);
      return;
    }

    if (!task.enabled) {
      this.logger.warn(`Attempted to execute disabled task: ${task.name}`);
      return;
    }

    const execution: TaskExecution = {
      taskId,
      startTime: new Date(),
      success: false,
    };

    try {
      this.logger.info(`Executing task: ${task.name}`);

      // Validate handler exists and is callable
      if (typeof task.handler !== 'function') {
        throw new Error(`Task handler is not a function: ${task.name}`);
      }

      // Execute the task with timeout protection
      const timeoutMs = 30 * 60 * 1000; // 30 minutes timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Task execution timeout')), timeoutMs);
      });

      await Promise.race([task.handler(), timeoutPromise]);

      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.success = true;

      // Update task statistics
      task.lastRun = execution.startTime;
      try {
        task.nextRun = this.getNextRunTime(task.cronExpression);
      } catch (error) {
        this.logger.warn(`Failed to calculate next run time for ${task.name}:`, error);
      }
      task.runCount++;

      // Update average execution time with weighted average
      if (task.averageExecutionTime === 0) {
        task.averageExecutionTime = execution.duration;
      } else {
        // Use weighted average (70% old, 30% new) for smoother transitions
        task.averageExecutionTime = Math.round(
          task.averageExecutionTime * 0.7 + execution.duration * 0.3
        );
      }

      this.logger.info(`Task completed: ${task.name} (${execution.duration}ms)`);
    } catch (error) {
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.error = error instanceof Error ? error.message : String(error);

      task.errorCount++;

      this.logger.error(`Task failed: ${task.name} (${execution.duration}ms)`, error);

      // If task has too many consecutive errors, consider disabling it
      if (task.errorCount > 10 && task.runCount > 0) {
        const errorRate = task.errorCount / task.runCount;
        if (errorRate > 0.8) {
          this.logger.warn(
            `Task ${task.name} has high error rate (${Math.round(errorRate * 100)}%), consider reviewing`
          );
        }
      }
    }

    // Store execution history
    try {
      this.executions.push(execution);
      if (this.executions.length > this.maxExecutionHistory) {
        this.executions.shift();
      }
    } catch (error) {
      this.logger.error('Failed to store execution history:', error);
    }
  }

  /**
   * Get next run time for cron expression
   */
  private getNextRunTime(cronExpression: string): Date {
    try {
      if (!cronExpression || typeof cronExpression !== 'string') {
        this.logger.warn('Invalid cron expression provided, using default interval');
        return new Date(Date.now() + 60 * 60 * 1000);
      }

      // Validate cron expression format (basic validation)
      const cronParts = cronExpression.trim().split(/\s+/);
      if (cronParts.length !== 5 && cronParts.length !== 6) {
        this.logger.warn(`Invalid cron expression format: ${cronExpression}`);
        return new Date(Date.now() + 60 * 60 * 1000);
      }

      // Use node-cron to validate and get next run time
      if (cron.validate(cronExpression)) {
        // Simple approximation - in production, use a proper cron parser like 'node-cron'
        const now = new Date();
        return new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
      } else {
        this.logger.warn(`Invalid cron expression: ${cronExpression}`);
        return new Date(Date.now() + 60 * 60 * 1000);
      }
    } catch (error) {
      this.logger.error('Error calculating next run time:', error);
      return new Date(Date.now() + 60 * 60 * 1000);
    }
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    try {
      // Monitor task health every 5 minutes
      const healthInterval = setInterval(
        () => {
          try {
            this.monitorTaskHealth();
          } catch (error) {
            this.logger.error('Error during task health monitoring:', error);
          }
        },
        5 * 60 * 1000
      );

      // Log statistics every hour
      const statsInterval = setInterval(
        () => {
          try {
            this.logStatistics();
          } catch (error) {
            this.logger.error('Error during statistics logging:', error);
          }
        },
        60 * 60 * 1000
      );

      this.logger.info('Scheduler monitoring started successfully');
    } catch (error) {
      this.logger.error('Failed to start scheduler monitoring:', error);
    }
  }

  /**
   * Monitor task health
   */
  private monitorTaskHealth(): void {
    try {
      const now = new Date();
      let healthyTasks = 0;
      let unhealthyTasks = 0;
      let restartedTasks = 0;

      for (const [taskId, task] of this.tasks) {
        if (!task.enabled) {
          continue;
        }

        let isHealthy = true;

        // Check if task should have run by now
        if (task.nextRun && now > task.nextRun) {
          const delay = now.getTime() - task.nextRun.getTime();
          if (delay > 5 * 60 * 1000) {
            // 5 minutes late
            this.logger.warn(`Task ${task.name} is ${Math.round(delay / 1000)}s late`);
            isHealthy = false;
          }
        }

        // Check if task hasn't run for too long
        if (task.lastRun) {
          const timeSinceLastRun = now.getTime() - task.lastRun.getTime();
          const maxInterval = 24 * 60 * 60 * 1000; // 24 hours
          if (timeSinceLastRun > maxInterval) {
            this.logger.warn(
              `Task ${task.name} hasn't run for ${Math.round(timeSinceLastRun / 1000 / 60 / 60)} hours`
            );
            isHealthy = false;
          }
        }

        // Check error rate
        if (task.runCount > 0) {
          const errorRate = task.errorCount / task.runCount;
          if (errorRate > 0.5) {
            // More than 50% failure rate
            this.logger.warn(
              `Task ${task.name} has high error rate: ${Math.round(errorRate * 100)}%`
            );
            isHealthy = false;

            // Try to restart problematic tasks
            if (task.runCount >= 5 && errorRate > 0.8) {
              try {
                this.logger.info(`Attempting to restart problematic task: ${task.name}`);
                this.stopTask(taskId);
                setTimeout(() => this.startTask(taskId), 1000);
                restartedTasks++;
              } catch (error) {
                this.logger.error(`Failed to restart task ${task.name}:`, error);
              }
            }
          }
        }

        if (isHealthy) {
          healthyTasks++;
        } else {
          unhealthyTasks++;
        }
      }

      if (unhealthyTasks > 0 || restartedTasks > 0) {
        this.logger.info(
          `Task health check completed - Healthy: ${healthyTasks}, Unhealthy: ${unhealthyTasks}, Restarted: ${restartedTasks}`
        );
      }
    } catch (error) {
      this.logger.error('Error during task health monitoring:', error);
    }
  }

  /**
   * Log statistics
   */
  private logStatistics(): void {
    try {
      const stats = this.getStatistics();

      // Calculate success rate safely
      const successRate =
        stats.totalExecutions > 0
          ? Math.round((stats.successfulExecutions / stats.totalExecutions) * 100)
          : 0;

      // Convert uptime to hours for better readability
      const uptimeHours = Math.round((stats.uptime / 1000 / 60 / 60) * 100) / 100;

      this.logger.info('Scheduler Statistics:', {
        totalTasks: stats.totalTasks,
        activeTasks: stats.activeTasks,
        totalExecutions: stats.totalExecutions,
        successfulExecutions: stats.successfulExecutions,
        failedExecutions: stats.failedExecutions,
        successRate: `${successRate}%`,
        averageExecutionTime: `${Math.round(stats.averageExecutionTime)}ms`,
        uptime: `${uptimeHours}h`,
        lastUpdate: stats.lastUpdate.toISOString(),
      });

      // Log individual task statistics for problematic tasks
      const problematicTasks = Array.from(this.tasks.values())
        .filter(task => {
          if (task.runCount === 0) {
            return false;
          }
          const errorRate = task.errorCount / task.runCount;
          return errorRate > 0.3 || task.averageExecutionTime > 30000; // 30 seconds
        })
        .map(task => ({
          name: task.name,
          runCount: task.runCount,
          errorCount: task.errorCount,
          errorRate: `${Math.round((task.errorCount / task.runCount) * 100)}%`,
          avgTime: `${Math.round(task.averageExecutionTime)}ms`,
          lastRun: task.lastRun?.toISOString() || 'Never',
        }));

      if (problematicTasks.length > 0) {
        this.logger.warn('Tasks with issues:', problematicTasks);
      }
    } catch (error) {
      this.logger.error('Error logging scheduler statistics:', error);
    }
  }

  // Task Handlers

  /**
   * Update daily rankings
   */
  private async updateDailyRankings(): Promise<void> {
    await this.rankingService.updateAllRankings();

    // Send daily ranking notifications
    for (const guild of this.client.guilds.cache.values()) {
      try {
        const ranking = await this.rankingService.getPUBGRanking(guild.id, {
          type: 'daily',
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          endDate: new Date(),
        });
        if (ranking && ranking.length > 0) {
          await this.sendRankingNotification(guild.id, 'daily', ranking);
        }
      } catch (error) {
        this.logger.error(`Failed to send daily ranking for guild ${guild.id}:`, error);
      }
    }
  }

  /**
   * Update weekly rankings
   */
  private async updateWeeklyRankings(): Promise<void> {
    await this.rankingService.updateAllRankings();

    // Award weekly rewards
    for (const guild of this.client.guilds.cache.values()) {
      try {
        const ranking = await this.rankingService.getPUBGRanking(guild.id, {
          type: 'weekly',
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: new Date(),
        });
        if (ranking && ranking.length > 0) {
          await this.awardWeeklyRewards(guild.id, ranking);
          await this.sendRankingNotification(guild.id, 'weekly', ranking);
        }
      } catch (error) {
        this.logger.error(`Failed to process weekly ranking for guild ${guild.id}:`, error);
      }
    }
  }

  /**
   * Update monthly rankings
   */
  private async updateMonthlyRankings(): Promise<void> {
    await this.rankingService.updateAllRankings();

    // Award monthly rewards
    for (const guild of this.client.guilds.cache.values()) {
      try {
        const ranking = await this.rankingService.getPUBGRanking(guild.id, {
          type: 'monthly',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(),
        });
        if (ranking && ranking.length > 0) {
          await this.awardMonthlyRewards(guild.id, ranking);
          await this.sendRankingNotification(guild.id, 'monthly', ranking);
        }
      } catch (error) {
        this.logger.error(`Failed to process monthly ranking for guild ${guild.id}:`, error);
      }
    }
  }

  /**
   * Reset daily presence
   */
  private async resetDailyPresence(): Promise<void> {
    try {
      // Clear daily stats cache for all guilds
      const guilds = this.client.guilds.cache.keys();
      let resetCount = 0;

      for (const guildId of guilds) {
        try {
          // Clear daily presence stats from cache
          await this.cache.del(`daily_presence_stats_${guildId}`);
          await this.cache.del(`daily_active_users_${guildId}`);
          await this.cache.del(`daily_check_ins_${guildId}`);
          resetCount++;
        } catch (error) {
          this.logger.warn(`Failed to reset daily presence for guild ${guildId}:`, error);
        }
      }

      // Also clear global daily stats
      await this.cache.del('daily_presence_global_stats');

      this.logger.info(`Daily presence reset completed for ${resetCount} guilds`);
    } catch (error) {
      this.logger.error('Failed to reset daily presence:', error);
    }
  }

  /**
   * Generate daily challenges
   */
  private async generateDailyChallenges(): Promise<void> {
    for (const guild of this.client.guilds.cache.values()) {
      try {
        // Generate challenges for each guild
        const challenges = await this.generateChallengesForGuild(guild.id, 'daily');

        if (challenges.length > 0) {
          await this.sendChallengeNotification(guild.id, 'daily', challenges);
        }
      } catch (error) {
        this.logger.error(`Failed to generate daily challenges for guild ${guild.id}:`, error);
      }
    }
  }

  /**
   * Generate weekly challenges
   */
  private async generateWeeklyChallenges(): Promise<void> {
    for (const guild of this.client.guilds.cache.values()) {
      try {
        const challenges = await this.generateChallengesForGuild(guild.id, 'weekly');

        if (challenges.length > 0) {
          await this.sendChallengeNotification(guild.id, 'weekly', challenges);
        }
      } catch (error) {
        this.logger.error(`Failed to generate weekly challenges for guild ${guild.id}:`, error);
      }
    }
  }

  /**
   * Generate monthly challenges
   */
  private async generateMonthlyChallenges(): Promise<void> {
    for (const guild of this.client.guilds.cache.values()) {
      try {
        const challenges = await this.generateChallengesForGuild(guild.id, 'monthly');

        if (challenges.length > 0) {
          await this.sendChallengeNotification(guild.id, 'monthly', challenges);
        }
      } catch (error) {
        this.logger.error(`Failed to generate monthly challenges for guild ${guild.id}:`, error);
      }
    }
  }

  /**
   * Update PUBG data
   */
  private async updatePUBGData(): Promise<void> {
    // Get active users (users who have PUBG username)
    const activeUsers = await this.database.client.user.findMany({
      where: {
        pubgUsername: {
          not: null,
        },
      },
      take: 50, // Limit to avoid API rate limits
      include: {
        guilds: {
          select: {
            guildId: true,
          },
        },
      },
    });

    for (const user of activeUsers) {
      try {
        if (user.pubgUsername && user.pubgPlatform) {
          // Update ranking for each guild the user is a member of
          for (const userGuild of user.guilds) {
            try {
              await this.rankingService.updateUserRanking(userGuild.guildId, user.id);
            } catch (error) {
              this.logger.error(
                `Failed to update PUBG ranking for user ${user.id} in guild ${userGuild.guildId}:`,
                error
              );
            }
          }
        }
      } catch (error) {
        this.logger.error(`Failed to update PUBG data for user ${user.id}:`, error);
      }
    }
  }

  /**
   * Cleanup cache
   */
  private async cleanupCache(): Promise<void> {
    // TODO: Implement cleanup method in CacheService
    // await this.cache.cleanup();
  }

  /**
   * Auto checkout inactive users
   */
  private async autoCheckoutInactiveUsers(): Promise<void> {
    try {
      this.logger.info('Starting scheduled auto checkout of inactive users...');
      await this.presenceService.autoCheckoutInactive();
      this.logger.info('Scheduled auto checkout completed successfully');
    } catch (error) {
      this.logger.error('Error during scheduled auto checkout:', error);
      throw error;
    }
  }

  /**
   * Check badge progress
   */
  private async checkBadgeProgress(): Promise<void> {
    try {
      this.logger.info('Starting automatic badge progress check...');
      await this.badgeService.checkAllBadgeProgress();
      this.logger.info('Badge progress check completed successfully');
    } catch (error) {
      this.logger.error('Error during badge progress check:', error);
      throw error;
    }
  }

  /**
   * Perform daily backup
   */
  private async performDailyBackup(): Promise<void> {
    try {
      // Create backup of critical data
      const backupData = {
        timestamp: new Date(),
        users: await this.database.client.user.count(),
        guilds: await this.database.client.guild.count(),
        clips: await this.database.client.clip.count(),
        quizzes: await this.database.client.quiz.count(),
        badges: await this.database.client.badge.count(),
        presences: await this.database.client.presence.count(),
        userGuilds: await this.database.client.userGuild.count(),
      };

      // Store backup info in cache (in production, you'd save to external storage)
      await this.cache.set('daily_backup', JSON.stringify(backupData), 7 * 24 * 60 * 60); // 7 days

      // Also store backup history
      const backupHistory = (await this.cache.get('backup_history')) || '[]';
      const history = JSON.parse(backupHistory as string);
      history.push({
        date: backupData.timestamp.toISOString().split('T')[0],
        counts: backupData,
      });

      // Keep only last 30 days of backup history
      const recentHistory = history.slice(-30);
      await this.cache.set('backup_history', JSON.stringify(recentHistory), 30 * 24 * 60 * 60);

      this.logger.info('Daily backup completed', backupData);
    } catch (error) {
      this.logger.error('Failed to perform daily backup:', error);
    }
  }

  /**
   * Perform monthly cleanup
   */
  private async performMonthlyCleanup(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      const cleanupStats = {
        deletedPresences: 0,
        deletedGameResults: 0,
        deletedOldClips: 0,
        deletedExpiredTokens: 0,
        cleanedCache: 0,
      };

      // Clean up old presence records (keep only last 60 days)
      const deletedPresences = await this.database.client.presence.deleteMany({
        where: {
          createdAt: {
            lt: sixtyDaysAgo,
          },
        },
      });
      cleanupStats.deletedPresences = deletedPresences.count;

      // Clean up old quiz results (keep only last 30 days)
      const deletedGameResults = await this.database.client.gameResult.deleteMany({
        where: {
          completedAt: {
            lt: thirtyDaysAgo,
          },
        },
      });
      cleanupStats.deletedGameResults = deletedGameResults.count;

      // Clean up very old clips (keep only last 90 days for storage optimization)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const oldClips = await this.database.client.clip.findMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
        select: {
          id: true,
          url: true,
          createdAt: true,
        },
      });

      // Delete old clips and their files
      for (const clip of oldClips) {
        try {
          await this.clipService.deleteClip(clip.id);
          cleanupStats.deletedOldClips++;
        } catch (error) {
          this.logger.warn(`Failed to delete old clip ${clip.id}:`, error);
        }
      }

      // Clean up expired authentication tokens (if any)
      try {
        const expiredTokens = await this.database.client.user.updateMany({
          where: {
            lastSeen: {
              lt: thirtyDaysAgo,
            },
          },
          data: {
            // Clear any cached tokens or sensitive data for inactive users
            lastSeen: new Date(0), // Reset to epoch to indicate cleanup
          },
        });
        cleanupStats.deletedExpiredTokens = expiredTokens.count;
      } catch (error) {
        this.logger.warn('Failed to clean expired tokens:', error);
      }

      // Clean up cache
      try {
        await this.cache.cleanup();
        cleanupStats.cleanedCache = 1;
      } catch (error) {
        this.logger.warn('Failed to clean cache:', error);
      }

      this.logger.info('Monthly cleanup completed', cleanupStats);
    } catch (error) {
      this.logger.error('Failed to perform monthly cleanup:', error);
    }
  }

  /**
   * Generate weekly report
   */
  private async generateWeeklyReport(): Promise<void> {
    for (const guild of this.client.guilds.cache.values()) {
      try {
        const report = await this.generateGuildWeeklyReport(guild.id);
        await this.sendWeeklyReport(guild.id, report);
      } catch (error) {
        this.logger.error(`Failed to generate weekly report for guild ${guild.id}:`, error);
      }
    }
  }

  // Helper methods

  /**
   * Generate challenges for guild
   */
  private async generateChallengesForGuild(
    guildId: string,
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<any[]> {
    // This would generate appropriate challenges based on the period
    // For now, return empty array
    return [];
  }

  /**
   * Award weekly rewards
   */
  private async awardWeeklyRewards(guildId: string, ranking: any[]): Promise<void> {
    // Award rewards to top players
    for (let i = 0; i < Math.min(3, ranking.length); i++) {
      const player = ranking[i];
      const rewards = this.getWeeklyRewards(i + 1);

      try {
        await this.database.client.user.update({
          where: {
            id: player.userId,
          },
          data: {
            xp: { increment: rewards.xp },
            coins: { increment: rewards.coins },
          },
        });

        // Award badge for top positions
        if (i === 0) {
          await this.badgeService.awardBadge(player.userId, 'weekly_champion');
        } else if (i < 3) {
          await this.badgeService.awardBadge(player.userId, 'weekly_top3');
        }
      } catch (error) {
        this.logger.error(`Failed to award weekly rewards to ${player.userId}:`, error);
      }
    }
  }

  /**
   * Award monthly rewards
   */
  private async awardMonthlyRewards(guildId: string, ranking: any[]): Promise<void> {
    // Award rewards to top players
    for (let i = 0; i < Math.min(5, ranking.length); i++) {
      const player = ranking[i];
      const rewards = this.getMonthlyRewards(i + 1);

      try {
        await this.database.client.user.update({
          where: {
            id: player.userId,
          },
          data: {
            xp: { increment: rewards.xp },
            coins: { increment: rewards.coins },
          },
        });

        // Award badge for top positions
        if (i === 0) {
          await this.badgeService.awardBadge(player.userId, 'monthly_champion');
        } else if (i < 3) {
          await this.badgeService.awardBadge(player.userId, 'monthly_top3');
        }
      } catch (error) {
        this.logger.error(`Failed to award monthly rewards to ${player.userId}:`, error);
      }
    }
  }

  /**
   * Get weekly rewards
   */
  private getWeeklyRewards(position: number): { xp: number; coins: number } {
    switch (position) {
      case 1:
        return { xp: 500, coins: 200 };
      case 2:
        return { xp: 300, coins: 120 };
      case 3:
        return { xp: 200, coins: 80 };
      default:
        return { xp: 100, coins: 40 };
    }
  }

  /**
   * Get monthly rewards
   */
  private getMonthlyRewards(position: number): { xp: number; coins: number } {
    switch (position) {
      case 1:
        return { xp: 2000, coins: 1000 };
      case 2:
        return { xp: 1500, coins: 750 };
      case 3:
        return { xp: 1000, coins: 500 };
      case 4:
        return { xp: 750, coins: 375 };
      case 5:
        return { xp: 500, coins: 250 };
      default:
        return { xp: 250, coins: 125 };
    }
  }

  /**
   * Send ranking notification
   */
  private async sendRankingNotification(
    guildId: string,
    period: string,
    ranking: any[]
  ): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }

      // Find announcement channel
      const announcementChannel = guild.channels.cache.find(
        channel => channel.name.includes('anúncios') || channel.name.includes('announcements')
      ) as TextChannel;

      if (!announcementChannel) {
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#ffd700')
        .setTitle(`🏆 Ranking ${period.charAt(0).toUpperCase() + period.slice(1)}`)
        .setDescription('Confira os melhores jogadores do período!')
        .setTimestamp();

      let description = '';
      for (let i = 0; i < Math.min(5, ranking.length); i++) {
        const player = ranking[i];
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
        description += `${medal} <@${player.userId}> - ${player.points} pontos\n`;
      }

      embed.addFields({ name: 'Top Jogadores', value: description || 'Nenhum jogador encontrado' });

      await announcementChannel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error(`Failed to send ranking notification for ${guildId}:`, error);
    }
  }

  /**
   * Send challenge notification
   */
  private async sendChallengeNotification(
    guildId: string,
    period: string,
    challenges: any[]
  ): Promise<void> {
    // Implementation for challenge notifications
  }

  /**
   * Generate guild weekly report
   */
  private async generateGuildWeeklyReport(guildId: string): Promise<any> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      const stats = {
        newUsers: await this.database.client.userGuild.count({
          where: {
            guildId,
            joinedAt: { gte: weekAgo },
          },
        }),
        activeUsers: await this.database.client.presence
          .groupBy({
            by: ['userId'],
            where: {
              guildId,
              checkInTime: { gte: weekAgo },
            },
          })
          .then(result => result.length),
        totalPresenceSessions: await this.database.client.presence.count({
          where: {
            guildId,
            checkInTime: { gte: weekAgo },
            checkOutTime: { not: null },
          },
        }),
        completedQuizzes: await this.database.client.gameResult.count({
          where: {
            completedAt: { gte: weekAgo },
            user: {
              guilds: {
                some: {
                  guildId: guildId,
                },
              },
            },
          },
        }),
        uploadedClips: await this.database.client.clip.count({
          where: {
            guildId,
            createdAt: { gte: weekAgo },
          },
        }),
        earnedBadges: await this.database.client.userBadge.count({
          where: {
            earnedAt: { gte: weekAgo },
            user: {
              guilds: {
                some: {
                  guildId: guildId,
                },
              },
            },
          },
        }),
        totalPresenceTime: await this.database.client.presence
          .findMany({
            where: {
              guildId,
              checkInTime: { gte: weekAgo },
              checkOutTime: { not: null },
            },
            select: {
              checkInTime: true,
              checkOutTime: true,
            },
          })
          .then(presences => {
            return presences.reduce((total, presence) => {
              if (presence.checkInTime && presence.checkOutTime) {
                const duration = presence.checkOutTime.getTime() - presence.checkInTime.getTime();
                return total + Math.floor(duration / (1000 * 60)); // minutes
              }
              return total;
            }, 0);
          }),
      };

      return stats;
    } catch (error) {
      this.logger.error(`Failed to generate weekly report for guild ${guildId}:`, error);

      // Return empty stats on error
      return {
        newUsers: 0,
        activeUsers: 0,
        totalPresenceSessions: 0,
        completedQuizzes: 0,
        uploadedClips: 0,
        earnedBadges: 0,
        totalPresenceTime: 0,
      };
    }
  }

  /**
   * Send weekly report
   */
  private async sendWeeklyReport(guildId: string, report: any): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }

      const announcementChannel = guild.channels.cache.find(
        channel => channel.name.includes('anúncios') || channel.name.includes('announcements')
      ) as TextChannel;

      if (!announcementChannel) {
        return;
      }

      const totalHours = Math.floor(report.totalPresenceTime / 60);
      const totalMinutes = report.totalPresenceTime % 60;

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📊 Relatório Semanal')
        .setDescription('Resumo das atividades da semana')
        .addFields(
          { name: '👥 Novos Usuários', value: report.newUsers.toString(), inline: true },
          { name: '🟢 Usuários Ativos', value: report.activeUsers.toString(), inline: true },
          {
            name: '⏰ Sessões de Presença',
            value: report.totalPresenceSessions.toString(),
            inline: true,
          },
          { name: '🕐 Tempo Total', value: `${totalHours}h ${totalMinutes}m`, inline: true },
          {
            name: '🧠 Quizzes Completados',
            value: report.completedQuizzes.toString(),
            inline: true,
          },
          { name: '🎬 Clips Enviados', value: report.uploadedClips.toString(), inline: true },
          { name: '🏆 Badges Conquistadas', value: report.earnedBadges.toString(), inline: true }
        )
        .setTimestamp();

      await announcementChannel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error(`Failed to send weekly report for ${guildId}:`, error);
    }
  }

  /**
   * Sync weapon mastery data for all users
   */
  private async syncWeaponMastery(): Promise<void> {
    try {
      this.logger.info('Starting weapon mastery synchronization for all users');

      // Get all users with linked PUBG accounts
      const users = await this.database.client.user.findMany({
        where: {
          pubgUsername: {
            not: null,
          },
        },
        select: {
          id: true,
          pubgUsername: true,
        },
      });

      if (users.length === 0) {
        this.logger.info('No users with linked PUBG accounts found');
        return;
      }

      this.logger.info(`Found ${users.length} users with linked PUBG accounts`);

      let syncedCount = 0;
      let errorCount = 0;

      // Process users in batches to avoid API rate limits
      const batchSize = 5;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);

        const promises = batch.map(async user => {
          try {
            const synced = await this.weaponMasteryService.syncUserWeaponMastery(
              user.id,
              user.pubgUsername!
            );

            if (synced) {
              syncedCount++;
              this.logger.debug(`Synced weapon mastery for user ${user.pubgUsername}`);
            }
          } catch (error) {
            errorCount++;
            this.logger.warn(`Failed to sync weapon mastery for user ${user.pubgUsername}:`, error);
          }
        });

        await Promise.all(promises);

        // Add delay between batches to respect API limits
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
      }

      this.logger.info(
        'Weapon mastery synchronization completed. ' +
          `Synced: ${syncedCount}, Errors: ${errorCount}, Total: ${users.length}`
      );
    } catch (error) {
      this.logger.error('Failed to sync weapon mastery data:', error);
    }
  }

  /**
   * Process pending ticket cleanup tasks
   */
  private async processTicketCleanupTasks(): Promise<void> {
    try {
      const ticketService = this.client.services?.ticket;
      if (!ticketService) {
        this.logger.warn('Ticket service not available for cleanup processing');
        return;
      }

      // Get pending cleanup tasks
      const pendingTasks = await this.database.client.ticketCleanup.findMany({
        where: {
          status: 'scheduled',
          scheduledFor: {
            lte: new Date(),
          },
        },
        orderBy: {
          scheduledFor: 'asc',
        },
        take: 10, // Process up to 10 tasks per run
      });

      if (pendingTasks.length === 0) {
        return;
      }

      this.logger.info(`Processing ${pendingTasks.length} pending ticket cleanup tasks`);

      for (const task of pendingTasks) {
        try {
          // Mark as processing
          await this.database.client.ticketCleanup.update({
            where: { id: task.id },
            data: { status: 'processing' },
          });

          // Attempt to delete the channel
          const channel = this.client.channels.cache.get(task.channelId);
          if (channel && channel.isTextBased()) {
            await channel.delete('Scheduled ticket cleanup');
            this.logger.info(`Successfully deleted ticket channel: ${task.channelId}`);
          }

          // Mark as completed
          await this.database.client.ticketCleanup.update({
            where: { id: task.id },
            data: {
              status: 'completed',
              completedAt: new Date(),
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const retryCount = task.retryCount + 1;
          const maxRetries = 3;

          if (retryCount >= maxRetries) {
            // Mark as failed after max retries
            await this.database.client.ticketCleanup.update({
              where: { id: task.id },
              data: {
                status: 'failed',
                errorMessage,
                retryCount,
                completedAt: new Date(),
              },
            });
            this.logger.error(
              `Ticket cleanup failed permanently for channel ${task.channelId}:`,
              error
            );
          } else {
            // Schedule retry
            const nextRetry = new Date(Date.now() + retryCount * 30 * 60 * 1000); // Exponential backoff: 30min, 1h, 1.5h
            await this.database.client.ticketCleanup.update({
              where: { id: task.id },
              data: {
                status: 'scheduled',
                errorMessage,
                retryCount,
                scheduledFor: nextRetry,
              },
            });
            this.logger.warn(
              `Ticket cleanup retry ${retryCount}/${maxRetries} scheduled for channel ${task.channelId}`
            );
          }
        }
      }

      // Clean up old completed/failed tasks (older than 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await this.database.client.ticketCleanup.deleteMany({
        where: {
          status: { in: ['completed', 'failed'] },
          completedAt: {
            lt: thirtyDaysAgo,
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to process ticket cleanup tasks:', error);
    }
  }

  // Public methods

  /**
   * Get scheduler statistics
   */
  public getStatistics(): SchedulerStats {
    try {
      // Safely calculate execution statistics
      const totalExecutions = this.executions?.length || 0;
      const successfulExecutions =
        this.executions?.filter(e => e && e.success === true).length || 0;
      const failedExecutions = Math.max(0, totalExecutions - successfulExecutions);

      // Calculate average execution time more robustly
      const executionsWithDuration =
        this.executions?.filter(e => e && typeof e.duration === 'number' && e.duration > 0) || [];
      const totalExecutionTime = executionsWithDuration.reduce((sum, e) => sum + e.duration!, 0);
      const averageExecutionTime =
        executionsWithDuration.length > 0 ? totalExecutionTime / executionsWithDuration.length : 0;

      // Ensure uptime is always positive
      const uptime = Math.max(0, Date.now() - this.startTime.getTime());

      // Count active tasks (enabled tasks with running cron jobs)
      const activeTasks = Array.from(this.tasks.values()).filter(
        task => task.enabled && this.cronJobs.has(task.id)
      ).length;

      return {
        totalTasks: this.tasks?.size || 0,
        activeTasks,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        averageExecutionTime: Math.round(averageExecutionTime * 100) / 100, // Round to 2 decimal places
        uptime,
        lastUpdate: new Date(),
      };
    } catch (error) {
      this.logger.error('Error calculating scheduler statistics:', error);

      // Return safe default statistics
      return {
        totalTasks: 0,
        activeTasks: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        uptime: Math.max(0, Date.now() - this.startTime.getTime()),
        lastUpdate: new Date(),
      };
    }
  }

  /**
   * Get all tasks
   */
  public getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get task by ID
   */
  public getTask(taskId: string): ScheduledTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Enable task
   */
  public enableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (!task.enabled) {
      task.enabled = true;
      this.startTask(taskId);
      this.logger.info(`Enabled task: ${task.name}`);
    }

    return true;
  }

  /**
   * Disable task
   */
  public disableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.enabled) {
      task.enabled = false;
      this.stopTask(taskId);
      this.logger.info(`Disabled task: ${task.name}`);
    }

    return true;
  }

  /**
   * Execute task manually
   */
  public async executeTaskManually(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    try {
      await this.executeTask(taskId);
      return true;
    } catch (error) {
      this.logger.error(`Failed to execute task manually: ${taskId}`, error);
      return false;
    }
  }

  /**
   * Get recent executions
   */
  public getRecentExecutions(limit: number = 50): TaskExecution[] {
    return this.executions
      .slice(-limit)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * Shutdown scheduler
   */
  public shutdown(): void {
    for (const [taskId] of this.cronJobs) {
      this.stopTask(taskId);
    }

    this.logger.info('Scheduler shutdown completed');
  }
}
