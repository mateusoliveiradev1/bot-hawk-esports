import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { RankingService } from './ranking.service';
import { BadgeService } from './badge.service';
import { PresenceService } from './presence.service';
import { ClipService } from './clip.service';
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
  private client: ExtendedClient;
  
  private tasks: Map<string, ScheduledTask> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private executions: TaskExecution[] = [];
  private startTime: Date = new Date();
  
  private readonly maxExecutionHistory = 1000;

  constructor(client: ExtendedClient) {
    this.logger = new Logger();
    this.cache = new CacheService();
    this.database = new DatabaseService();
    this.rankingService = new RankingService(client);
    this.badgeService = new BadgeService(client);
    this.presenceService = new PresenceService(client);
    this.clipService = new ClipService(client);
    this.client = client;
    
    this.initializeTasks();
    this.startTasks();
    this.startMonitoring();
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
    
    this.logger.info(`Initialized ${this.tasks.size} scheduled tasks`);
  }

  /**
   * Add a new scheduled task
   */
  private addTask(task: ScheduledTask): void {
    this.tasks.set(task.id, task);
  }

  /**
   * Start all enabled tasks
   */
  private startTasks(): void {
    for (const [taskId, task] of this.tasks) {
      if (task.enabled) {
        this.startTask(taskId);
      }
    }
    
    this.logger.info(`Started ${this.cronJobs.size} scheduled tasks`);
  }

  /**
   * Start a specific task
   */
  private startTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }
    
    try {
      const cronJob = cron.schedule(task.cronExpression, async () => {
        await this.executeTask(taskId);
      }, {
        scheduled: false,
        timezone: 'America/Sao_Paulo',
      });
      
      cronJob.start();
      this.cronJobs.set(taskId, cronJob);
      
      // Calculate next run time
      task.nextRun = this.getNextRunTime(task.cronExpression);
      
      this.logger.debug(`Started task: ${task.name}`);
    } catch (error) {
      this.logger.error(`Failed to start task ${taskId}:`, error);
    }
  }

  /**
   * Stop a specific task
   */
  private stopTask(taskId: string): void {
    const cronJob = this.cronJobs.get(taskId);
    if (cronJob) {
      cronJob.stop();
      this.cronJobs.delete(taskId);
      
      const task = this.tasks.get(taskId);
      if (task) {
        task.nextRun = undefined;
      }
      
      this.logger.debug(`Stopped task: ${taskId}`);
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }
    
    const execution: TaskExecution = {
      taskId,
      startTime: new Date(),
      success: false,
    };
    
    try {
      this.logger.info(`Executing task: ${task.name}`);
      
      await task.handler();
      
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.success = true;
      
      // Update task statistics
      task.lastRun = execution.startTime;
      task.nextRun = this.getNextRunTime(task.cronExpression);
      task.runCount++;
      
      // Update average execution time
      if (task.averageExecutionTime === 0) {
        task.averageExecutionTime = execution.duration;
      } else {
        task.averageExecutionTime = (task.averageExecutionTime + execution.duration) / 2;
      }
      
      this.logger.info(`Task completed: ${task.name} (${execution.duration}ms)`);
      
    } catch (error) {
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.error = error instanceof Error ? error.message : String(error);
      
      task.errorCount++;
      
      this.logger.error(`Task failed: ${task.name}`, error);
    }
    
    // Store execution history
    this.executions.push(execution);
    if (this.executions.length > this.maxExecutionHistory) {
      this.executions.shift();
    }
  }

  /**
   * Get next run time for cron expression
   */
  private getNextRunTime(cronExpression: string): Date {
    try {
      // Simple approximation - in production, use a proper cron parser
      const now = new Date();
      return new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    } catch (error) {
      return new Date(Date.now() + 60 * 60 * 1000);
    }
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    // Monitor task health every 5 minutes
    setInterval(() => {
      this.monitorTaskHealth();
    }, 5 * 60 * 1000);
    
    // Log statistics every hour
    setInterval(() => {
      this.logStatistics();
    }, 60 * 60 * 1000);
  }

  /**
   * Monitor task health
   */
  private monitorTaskHealth(): void {
    const now = new Date();
    
    for (const [taskId, task] of this.tasks) {
      if (!task.enabled) {
        continue;
      }
      
      // Check if task should have run by now
      if (task.nextRun && now > task.nextRun) {
        const delay = now.getTime() - task.nextRun.getTime();
        if (delay > 5 * 60 * 1000) { // 5 minutes late
          this.logger.warn(`Task ${task.name} is ${Math.round(delay / 1000)}s late`);
        }
      }
      
      // Check error rate
      if (task.runCount > 0) {
        const errorRate = task.errorCount / task.runCount;
        if (errorRate > 0.5) { // More than 50% failure rate
          this.logger.warn(`Task ${task.name} has high error rate: ${Math.round(errorRate * 100)}%`);
        }
      }
    }
  }

  /**
   * Log statistics
   */
  private logStatistics(): void {
    const stats = this.getStatistics();
    
    this.logger.info('Scheduler Statistics:', {
      totalTasks: stats.totalTasks,
      activeTasks: stats.activeTasks,
      totalExecutions: stats.totalExecutions,
      successRate: `${Math.round((stats.successfulExecutions / stats.totalExecutions) * 100)}%`,
      averageExecutionTime: `${Math.round(stats.averageExecutionTime)}ms`,
      uptime: `${Math.round(stats.uptime / 1000 / 60)}min`,
    });
  }

  // Task Handlers

  /**
   * Update daily rankings
   */
  private async updateDailyRankings(): Promise<void> {
    // TODO: Implement updateAllRankings method or make it public
    // await this.rankingService.updateAllRankings();
    
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
    // TODO: Implement updateAllRankings method or make it public
    // await this.rankingService.updateAllRankings();
    
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
    // TODO: Implement updateAllRankings method or make it public
    // await this.rankingService.updateAllRankings();
    
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
    // TODO: Implement resetDailyStats method in PresenceService
    // await this.presenceService.resetDailyStats();
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
    });
    
    for (const user of activeUsers) {
      try {
        if (user.pubgUsername && user.pubgPlatform) {
          // TODO: Need to get guildId from context or pass it as parameter
          // await this.rankingService.updateUserRanking(guildId, user.id);
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
    // TODO: Implement autoCheckoutInactive method in PresenceService
    // await this.presenceService.autoCheckoutInactive();
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
      // TODO: Fix backup - commenting out until models are corrected
      this.logger.info('Daily backup temporarily disabled - models need update');
      return;
      
      /*
      // Create backup of critical data
      const backupData = {
        timestamp: new Date(),
        users: await this.database.client.user.count(),
        guilds: await this.database.client.guild.count(),
        userStats: await this.database.client.userStats.count(),
        pubgStats: await this.database.client.pUBGStats.count()
      };
      
      // Store backup info (in production, you'd save to external storage)
      await this.cache.set('daily_backup', JSON.stringify(backupData), 7 * 24 * 60 * 60); // 7 days
      
      this.logger.info('Daily backup completed', backupData);
      */
    } catch (error) {
      this.logger.error('Failed to perform daily backup:', error);
    }
  }

  /**
   * Perform monthly cleanup
   */
  private async performMonthlyCleanup(): Promise<void> {
    try {
      // TODO: Fix cleanup - commenting out until models are corrected
      this.logger.info('Monthly cleanup temporarily disabled - models need update');
      return;
      
      /*
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Clean up old audit logs
      const deletedLogs = await this.database.client.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: thirtyDaysAgo
          }
        }
      });
      
      // Clean up old quiz results
      const deletedQuizResults = await this.database.client.quizResult.deleteMany({
        where: {
          completedAt: {
            lt: thirtyDaysAgo
          }
        }
      });
      
      // Clean up old game results
      const deletedGameResults = await this.database.client.gameResult.deleteMany({
        where: {
          completedAt: {
            lt: thirtyDaysAgo
          }
        }
      });
      
      this.logger.info('Monthly cleanup completed', {
        deletedLogs: deletedLogs.count,
        deletedQuizResults: deletedQuizResults.count,
        deletedGameResults: deletedGameResults.count
      });
      */
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
  private async generateChallengesForGuild(guildId: string, period: 'daily' | 'weekly' | 'monthly'): Promise<any[]> {
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
    case 1: return { xp: 500, coins: 200 };
    case 2: return { xp: 300, coins: 120 };
    case 3: return { xp: 200, coins: 80 };
    default: return { xp: 100, coins: 40 };
    }
  }

  /**
   * Get monthly rewards
   */
  private getMonthlyRewards(position: number): { xp: number; coins: number } {
    switch (position) {
    case 1: return { xp: 2000, coins: 1000 };
    case 2: return { xp: 1500, coins: 750 };
    case 3: return { xp: 1000, coins: 500 };
    case 4: return { xp: 750, coins: 375 };
    case 5: return { xp: 500, coins: 250 };
    default: return { xp: 250, coins: 125 };
    }
  }

  /**
   * Send ranking notification
   */
  private async sendRankingNotification(guildId: string, period: string, ranking: any[]): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }
      
      // Find announcement channel
      const announcementChannel = guild.channels.cache.find(
        channel => channel.name.includes('anúncios') || channel.name.includes('announcements'),
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
  private async sendChallengeNotification(guildId: string, period: string, challenges: any[]): Promise<void> {
    // Implementation for challenge notifications
  }

  /**
   * Generate guild weekly report
   */
  private async generateGuildWeeklyReport(guildId: string): Promise<any> {
    // TODO: Fix weekly report - commenting out until models are corrected
    const stats = {
      newUsers: 0,
      activeUsers: 0,
      totalMessages: 0,
      completedQuizzes: 0,
      uploadedClips: 0,
    };
    
    /*
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const stats = {
      newUsers: await this.database.client.userGuild.count({
        where: {
          guildId,
          joinedAt: { gte: weekAgo }
        }
      }),
      activeUsers: await this.database.client.presence.count({
        where: {
          timestamp: { gte: weekAgo },
          user: {
            guilds: {
              some: {
                guildId: guildId
              }
            }
          }
        }
      }),
      totalMessages: 0, // Would need message tracking
      completedQuizzes: await this.database.client.quizResult.count({
        where: {
          completedAt: { gte: weekAgo },
          quiz: {
            guildId: guildId
          }
        }
      }),
      uploadedClips: await this.database.client.clip.count({
        where: {
          guildId,
          createdAt: { gte: weekAgo }
        }
      })
    };
    */
    
    return stats;
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
        channel => channel.name.includes('anúncios') || channel.name.includes('announcements'),
      ) as TextChannel;
      
      if (!announcementChannel) {
        return;
      }
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📊 Relatório Semanal')
        .setDescription('Resumo das atividades da semana')
        .addFields(
          { name: '👥 Novos Usuários', value: report.newUsers.toString(), inline: true },
          { name: '🟢 Usuários Ativos', value: report.activeUsers.toString(), inline: true },
          { name: '🧠 Quizzes Completados', value: report.completedQuizzes.toString(), inline: true },
          { name: '🎬 Clips Enviados', value: report.uploadedClips.toString(), inline: true },
        )
        .setTimestamp();
      
      await announcementChannel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error(`Failed to send weekly report for ${guildId}:`, error);
    }
  }

  // Public methods

  /**
   * Get scheduler statistics
   */
  public getStatistics(): SchedulerStats {
    const totalExecutions = this.executions.length;
    const successfulExecutions = this.executions.filter(e => e.success).length;
    const failedExecutions = totalExecutions - successfulExecutions;
    
    const totalExecutionTime = this.executions
      .filter(e => e.duration)
      .reduce((sum, e) => sum + e.duration!, 0);
    
    const averageExecutionTime = totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0;
    
    return {
      totalTasks: this.tasks.size,
      activeTasks: this.cronJobs.size,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
      uptime: Date.now() - this.startTime.getTime(),
      lastUpdate: new Date(),
    };
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