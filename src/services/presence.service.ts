import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { BadgeService } from './badge.service';
import { ExtendedClient } from '../types/client';
import { EmbedBuilder, GuildMember, TextChannel } from 'discord.js';

export interface PresenceRecord {
  id: string;
  userId: string;
  guildId: string;
  type: 'check_in' | 'check_out';
  timestamp: Date;
  location?: string;
  note?: string;
  ipAddress?: string;
  deviceInfo?: string;
}

export interface PresenceSession {
  id: string;
  userId: string;
  guildId: string;
  checkInTime: Date;
  checkOutTime?: Date;
  duration?: number; // in minutes
  location?: string;
  note?: string;
  status: 'active' | 'completed';
}

export interface PresenceStats {
  userId: string;
  guildId: string;
  totalSessions: number;
  totalDuration: number; // in minutes
  averageDuration: number;
  longestSession: number;
  shortestSession: number;
  checkInsThisWeek: number;
  checkInsThisMonth: number;
  currentStreak: number;
  longestStreak: number;
  lastCheckIn?: Date;
  lastCheckOut?: Date;
}

export interface PresenceReport {
  guildId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalUsers: number;
  totalSessions: number;
  totalDuration: number;
  averageSessionDuration: number;
  mostActiveUser: {
    userId: string;
    username: string;
    sessions: number;
    duration: number;
  } | null;
  dailyStats: {
    date: string;
    sessions: number;
    duration: number;
    uniqueUsers: number;
  }[];
  userStats: {
    userId: string;
    username: string;
    sessions: number;
    duration: number;
    averageDuration: number;
  }[];
}

export interface PresenceSettings {
  guildId: string;
  enabled: boolean;
  requireLocation: boolean;
  allowNotes: boolean;
  autoCheckOut: boolean;
  autoCheckOutHours: number;
  notificationChannelId?: string;
  streakRewards: {
    days: number;
    xp: number;
    coins: number;
    badgeId?: string;
  }[];
  dailyRewards: {
    xp: number;
    coins: number;
  };
}

/**
 * Presence Service for managing check-in/check-out system
 */
export class PresenceService {
  private logger: Logger;
  private cache: CacheService;
  private database: DatabaseService;
  private badgeService: BadgeService;
  private client: ExtendedClient;
  
  private activeSessions: Map<string, Map<string, PresenceSession>> = new Map(); // guildId -> userId -> session
  private presenceStats: Map<string, Map<string, PresenceStats>> = new Map(); // guildId -> userId -> stats
  private guildSettings: Map<string, PresenceSettings> = new Map(); // guildId -> settings
  
  private readonly maxSessionDuration = 24 * 60; // 24 hours in minutes
  private readonly streakGracePeriod = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

  constructor(client: ExtendedClient) {
    this.logger = new Logger();
    this.cache = new CacheService();
    this.database = new DatabaseService();
    this.badgeService = new BadgeService(client);
    this.client = client;
    
    this.loadActiveSessions();
    this.loadPresenceStats();
    this.loadGuildSettings();
    this.startAutoCheckOutScheduler();
    this.startStreakChecker();
  }

  /**
   * Load active sessions from database
   */
  private async loadActiveSessions(): Promise<void> {
    try {
      // TODO: Update Presence model to include required fields (checkOutTime, guildId, checkInTime, location, note)
      // Current Presence model only has: id, userId, type, timestamp, metadata, createdAt
      /*
      const activeSessions = await this.database.client.presence.findMany({
        where: {
          type: 'checkin'
        },
        orderBy: {
          timestamp: 'desc'
        }
      });
      
      for (const session of activeSessions) {
        // TODO: Extract guildId from metadata or add to model
        // TODO: Map timestamp to checkInTime
        // TODO: Extract location and note from metadata
      }
      */
      
      this.logger.info('Active sessions loading disabled - needs Presence model update');
    } catch (error) {
      this.logger.error('Failed to load active sessions:', error);
    }
  }

  /**
   * Load presence statistics
   */
  private async loadPresenceStats(): Promise<void> {
    try {
      // TODO: Update to work with current Presence model structure
      // Current model has: id, userId, type, timestamp, metadata, createdAt
      // Need fields: guildId, checkInTime, checkOutTime, duration
      // These should be extracted from metadata or added to model
      
      this.logger.info('Presence statistics loading disabled - needs model update');
    } catch (error) {
      this.logger.error('Failed to load presence stats:', error);
    }
  }

  /**
   * Load guild settings
   */
  private async loadGuildSettings(): Promise<void> {
    try {
      const guildConfigs = await this.database.client.guildConfig.findMany();
      
      for (const config of guildConfigs) {
        const configData = config.config as any;
        const settings: PresenceSettings = {
          guildId: config.guildId,
          enabled: configData?.presenceEnabled || false,
          requireLocation: configData?.presenceRequireLocation || false,
          allowNotes: configData?.presenceAllowNotes || true,
          autoCheckOut: configData?.presenceAutoCheckOut || true,
          autoCheckOutHours: configData?.presenceAutoCheckOutHours || 12,
          notificationChannelId: configData?.presenceNotificationChannel || undefined,
          streakRewards: configData?.presenceStreakRewards ? JSON.parse(configData.presenceStreakRewards) : [
            { days: 7, xp: 100, coins: 50 },
            { days: 30, xp: 500, coins: 250 },
            { days: 90, xp: 1500, coins: 750 },
            { days: 365, xp: 10000, coins: 5000, badgeId: 'yearly_attendance' },
          ],
          dailyRewards: configData?.presenceDailyRewards ? JSON.parse(configData.presenceDailyRewards) : {
            xp: 10,
            coins: 5,
          },
        };
        
        this.guildSettings.set(config.guildId, settings);
      }
      
      this.logger.info(`Loaded presence settings for ${this.guildSettings.size} guilds`);
    } catch (error) {
      this.logger.error('Failed to load guild settings:', error);
    }
  }

  /**
   * Start auto check-out scheduler
   */
  private startAutoCheckOutScheduler(): void {
    // Check every hour for sessions that need auto check-out
    setInterval(async () => {
      await this.performAutoCheckOuts();
    }, 60 * 60 * 1000);
  }

  /**
   * Start streak checker
   */
  private startStreakChecker(): void {
    // Check streaks every day at midnight
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() < 5) {
        await this.updateAllStreaks();
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Check in user
   */
  public async checkIn(
    guildId: string,
    userId: string,
    location?: string,
    note?: string,
    ipAddress?: string,
    deviceInfo?: string,
  ): Promise<{ success: boolean; message: string; session?: PresenceSession }> {
    try {
      // TODO: Implement check-in with current Presence model
      // Current model: id, userId, type, timestamp, metadata, createdAt
      // Need to store guildId, location, note, ipAddress, deviceInfo in metadata
      
      const presenceRecord = await this.database.client.presence.create({
        data: {
          userId,
          type: 'checkin',
          timestamp: new Date(),
          metadata: {
            guildId,
            location,
            note,
            ipAddress,
            deviceInfo,
          },
        },
      });
      
      this.logger.info(`User ${userId} checked in to guild ${guildId}`);
      
      return {
        success: true,
        message: `Check-in realizado com sucesso às ${new Date().toLocaleString('pt-BR')}.`,
      };
      
    } catch (error) {
      this.logger.error(`Failed to check in user ${userId}:`, error);
      return {
        success: false,
        message: 'Erro interno. Tente novamente mais tarde.',
      };
    }
  }

  /**
   * Check out user
   */
  public async checkOut(
    guildId: string,
    userId: string,
    note?: string,
  ): Promise<{ success: boolean; message: string; session?: PresenceSession }> {
    try {
      // TODO: Implement check-out with current Presence model
      // Current model: id, userId, type, timestamp, metadata, createdAt
      // Need to store guildId and note in metadata
      
      const presenceRecord = await this.database.client.presence.create({
        data: {
          userId,
          type: 'checkout',
          timestamp: new Date(),
          metadata: {
            guildId,
            note,
          },
        },
      });
      
      this.logger.info(`User ${userId} checked out from guild ${guildId}`);
      
      return {
        success: true,
        message: `Check-out realizado com sucesso às ${new Date().toLocaleString('pt-BR')}.`,
      };
      
    } catch (error) {
      this.logger.error(`Failed to check out user ${userId}:`, error);
      return {
        success: false,
        message: 'Erro interno. Tente novamente mais tarde.',
      };
    }
  }

  /**
   * Get active session for user
   */
  public getActiveSession(guildId: string, userId: string): PresenceSession | null {
    return this.activeSessions.get(guildId)?.get(userId) || null;
  }

  /**
   * Get user presence stats
   */
  public getUserStats(guildId: string, userId: string): PresenceStats | null {
    return this.presenceStats.get(guildId)?.get(userId) || null;
  }

  /**
   * Get guild presence report
   */
  public async getGuildReport(
    guildId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PresenceReport> {
    try {
      // TODO: Implement report generation with current Presence model
      // Current model: id, userId, type, timestamp, metadata, createdAt
      // Need to extract guildId from metadata and handle check-in/check-out pairing
      
      this.logger.info(`Guild report generation disabled - needs model update for guild ${guildId}`);
      
      // Return empty report for now
      const report: PresenceReport = {
        guildId,
        period: { start: startDate, end: endDate },
        totalUsers: 0,
        totalSessions: 0,
        totalDuration: 0,
        averageSessionDuration: 0,
        mostActiveUser: null,
        dailyStats: [],
        userStats: [],
      };
      
      return report;
      
    } catch (error) {
      this.logger.error(`Failed to generate guild report for ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Configure guild presence settings
   */
  public async configureGuildSettings(guildId: string, settings: Partial<PresenceSettings>): Promise<void> {
    try {
      const currentSettings = this.guildSettings.get(guildId) || {
        guildId,
        enabled: false,
        requireLocation: false,
        allowNotes: true,
        autoCheckOut: true,
        autoCheckOutHours: 12,
        streakRewards: [],
        dailyRewards: { xp: 10, coins: 5 },
      };
      
      const updatedSettings = { ...currentSettings, ...settings };
      this.guildSettings.set(guildId, updatedSettings);
      
      // Save to database using config JSON field
      const configData = {
        presence: {
          enabled: updatedSettings.enabled,
          requireLocation: updatedSettings.requireLocation,
          allowNotes: updatedSettings.allowNotes,
          autoCheckOut: updatedSettings.autoCheckOut,
          autoCheckOutHours: updatedSettings.autoCheckOutHours,
          notificationChannelId: updatedSettings.notificationChannelId,
          streakRewards: updatedSettings.streakRewards,
          dailyRewards: updatedSettings.dailyRewards,
        },
      };
      
      await this.database.client.guildConfig.upsert({
        where: { guildId },
        update: {
          config: configData,
        },
        create: {
          guildId,
          config: configData,
        },
      });
      
      this.logger.info(`Updated presence settings for guild ${guildId}`);
    } catch (error) {
      this.logger.error(`Failed to configure guild settings for ${guildId}:`, error);
    }
  }

  /**
   * Perform auto check-outs
   */
  private async performAutoCheckOuts(): Promise<void> {
    try {
      for (const [guildId, guildSessions] of this.activeSessions) {
        const settings = this.guildSettings.get(guildId);
        if (!settings || !settings.autoCheckOut) {
          continue;
        }
        
        const autoCheckOutTime = settings.autoCheckOutHours * 60 * 60 * 1000; // Convert to milliseconds
        const now = new Date();
        
        for (const [userId, session] of guildSessions) {
          const sessionDuration = now.getTime() - session.checkInTime.getTime();
          
          if (sessionDuration >= autoCheckOutTime) {
            await this.checkOut(guildId, userId, 'Check-out automático');
            this.logger.info(`Auto checked out user ${userId} from guild ${guildId}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to perform auto check-outs:', error);
    }
  }

  /**
   * Update user statistics
   */
  private async updateUserStats(guildId: string, userId: string): Promise<void> {
    try {
      // TODO: Update user statistics with current Presence model
      // Current model: id, userId, type, timestamp, metadata, createdAt
      // Need to extract guildId from metadata and calculate sessions from check-in/check-out pairs
      
      this.logger.info(`User stats update disabled - needs model update for user ${userId}`);
      
    } catch (error) {
      this.logger.error(`Failed to update user stats for ${userId}:`, error);
    }
  }

  /**
   * Calculate current streak
   */
  private calculateCurrentStreak(presences: any[]): number {
    if (presences.length === 0) {
      return 0;
    }
    
    const sortedPresences = presences.sort((a, b) => b.checkInTime.getTime() - a.checkInTime.getTime());
    const now = new Date();
    let streak = 0;
    let lastDate: Date | null = null;
    
    for (const presence of sortedPresences) {
      const presenceDate = new Date(presence.checkInTime);
      presenceDate.setHours(0, 0, 0, 0);
      
      if (lastDate === null) {
        // First presence
        const daysDiff = Math.floor((now.getTime() - presenceDate.getTime()) / (24 * 60 * 60 * 1000));
        if (daysDiff <= 1) {
          streak = 1;
          lastDate = presenceDate;
        } else {
          break;
        }
      } else {
        // Check if this presence is consecutive
        const daysDiff = Math.floor((lastDate.getTime() - presenceDate.getTime()) / (24 * 60 * 60 * 1000));
        if (daysDiff === 1) {
          streak++;
          lastDate = presenceDate;
        } else if (daysDiff === 0) {
          // Same day, continue
          continue;
        } else {
          // Gap in streak
          break;
        }
      }
    }
    
    return streak;
  }

  /**
   * Calculate longest streak
   */
  private calculateLongestStreak(presences: any[]): number {
    if (presences.length === 0) {
      return 0;
    }
    
    const sortedPresences = presences.sort((a, b) => a.checkInTime.getTime() - b.checkInTime.getTime());
    let longestStreak = 0;
    let currentStreak = 0;
    let lastDate: Date | null = null;
    
    for (const presence of sortedPresences) {
      const presenceDate = new Date(presence.checkInTime);
      presenceDate.setHours(0, 0, 0, 0);
      
      if (lastDate === null) {
        currentStreak = 1;
        lastDate = presenceDate;
      } else {
        const daysDiff = Math.floor((presenceDate.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
        
        if (daysDiff === 1) {
          currentStreak++;
        } else if (daysDiff === 0) {
          // Same day, continue
          continue;
        } else {
          // Gap in streak
          longestStreak = Math.max(longestStreak, currentStreak);
          currentStreak = 1;
        }
        
        lastDate = presenceDate;
      }
    }
    
    return Math.max(longestStreak, currentStreak);
  }

  /**
   * Award daily rewards
   */
  private async awardDailyRewards(guildId: string, userId: string): Promise<void> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings) {
        return;
      }
      
      const { xp, coins } = settings.dailyRewards;
      
      // Award XP and coins to User model
      await this.database.client.user.update({
        where: { id: userId },
        data: {
          xp: { increment: xp },
          coins: { increment: coins },
        },
      });
      
      // Update check-ins counter in UserStats
      await this.database.client.userStats.upsert({
        where: { userId },
        update: {
          checkIns: { increment: 1 },
        },
        create: {
          userId,
          checkIns: 1,
        },
      });
      
      this.logger.info(`Awarded daily rewards to user ${userId}: ${xp} XP, ${coins} coins`);
    } catch (error) {
      this.logger.error(`Failed to award daily rewards to user ${userId}:`, error);
    }
  }

  /**
   * Award session rewards
   */
  private async awardSessionRewards(guildId: string, userId: string, duration: number): Promise<void> {
    try {
      // Award bonus XP based on session duration
      const bonusXP = Math.floor(duration / 30) * 5; // 5 XP per 30 minutes
      const bonusCoins = Math.floor(duration / 60) * 2; // 2 coins per hour
      
      if (bonusXP > 0 || bonusCoins > 0) {
        await this.database.client.user.update({
          where: { id: userId },
          data: {
            xp: { increment: bonusXP },
            coins: { increment: bonusCoins },
          },
        });
        
        this.logger.info(`Awarded session rewards to user ${userId}: ${bonusXP} XP, ${bonusCoins} coins for ${duration} minutes`);
      }
    } catch (error) {
      this.logger.error(`Failed to award session rewards to user ${userId}:`, error);
    }
  }

  /**
   * Update all streaks
   */
  private async updateAllStreaks(): Promise<void> {
    try {
      for (const [guildId, guildStats] of this.presenceStats) {
        const settings = this.guildSettings.get(guildId);
        if (!settings) {
          continue;
        }
        
        for (const [userId, stats] of guildStats) {
          // Check for streak rewards
          for (const reward of settings.streakRewards) {
            if (stats.currentStreak >= reward.days) {
              // Check if user already received this reward
              const existingReward = await this.database.client.transaction.findFirst({
                where: {
                  userId,
                  type: 'streak_reward',
                },
              });
              
              if (!existingReward) {
                // Award streak reward
                await this.database.client.user.update({
                  where: { id: userId },
                  data: {
                    xp: { increment: reward.xp },
                    coins: { increment: reward.coins },
                  },
                });
                
                // Record transaction
                await this.database.client.transaction.create({
                  data: {
                    userId,
                    type: 'earn',
                    amount: reward.xp,
                    balance: 0, // TODO: Calculate actual balance
                    reason: `${reward.days} day streak reward`,
                    metadata: { xp: reward.xp, coins: reward.coins },
                  },
                });
                
                // Award badge if specified
                if (reward.badgeId) {
                  await this.badgeService.awardBadge(userId, reward.badgeId);
                }
                
                this.logger.info(`Awarded ${reward.days}-day streak reward to user ${userId}`);
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to update streaks:', error);
    }
  }

  /**
   * Send check-in notification
   */
  private async sendCheckInNotification(guildId: string, userId: string, session: PresenceSession): Promise<void> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings || !settings.notificationChannelId) {
        return;
      }
      
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }
      
      const channel = guild.channels.cache.get(settings.notificationChannelId) as TextChannel;
      if (!channel) {
        return;
      }
      
      const member = await guild.members.fetch(userId);
      if (!member) {
        return;
      }
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Check-in Realizado')
        .setDescription(`${member.displayName} fez check-in`)
        .addFields(
          { name: '⏰ Horário', value: session.checkInTime.toLocaleString('pt-BR'), inline: true },
          { name: '📍 Local', value: session.location || 'Não informado', inline: true },
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      
      if (session.note) {
        embed.addFields({ name: '📝 Observação', value: session.note });
      }
      
      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error(`Failed to send check-in notification for user ${userId}:`, error);
    }
  }

  /**
   * Send check-out notification
   */
  private async sendCheckOutNotification(guildId: string, userId: string, session: PresenceSession): Promise<void> {
    try {
      const settings = this.guildSettings.get(guildId);
      if (!settings || !settings.notificationChannelId) {
        return;
      }
      
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }
      
      const channel = guild.channels.cache.get(settings.notificationChannelId) as TextChannel;
      if (!channel) {
        return;
      }
      
      const member = await guild.members.fetch(userId);
      if (!member) {
        return;
      }
      
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('🚪 Check-out Realizado')
        .setDescription(`${member.displayName} fez check-out`)
        .addFields(
          { name: '⏰ Check-in', value: session.checkInTime.toLocaleString('pt-BR'), inline: true },
          { name: '⏰ Check-out', value: session.checkOutTime?.toLocaleString('pt-BR') || 'N/A', inline: true },
          { name: '⏱️ Duração', value: this.formatDuration(session.duration || 0), inline: true },
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      
      if (session.location) {
        embed.addFields({ name: '📍 Local', value: session.location, inline: true });
      }
      
      if (session.note) {
        embed.addFields({ name: '📝 Observação', value: session.note });
      }
      
      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error(`Failed to send check-out notification for user ${userId}:`, error);
    }
  }

  /**
   * Format duration in minutes to human readable string
   */
  private formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours < 24) {
      return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
    }
    
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    
    return `${days}d${remainingHours > 0 ? ` ${remainingHours}h` : ''}${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
  }

  /**
   * Export presence data to CSV
   */
  public async exportPresenceData(
    guildId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    try {
      // TODO: Implement CSV export with current Presence model
      // Current model: id, userId, type, timestamp, metadata, createdAt
      // Need to extract guildId, location, note from metadata and pair check-ins with check-outs
      
      this.logger.info(`CSV export disabled - needs model update for guild ${guildId}`);
      
      const csvHeader = 'Usuario,Check-in,Check-out,Duracao (min),Local,Observacao\n';
      return csvHeader + 'Exportacao desabilitada - modelo precisa ser atualizado\n';
      
    } catch (error) {
      this.logger.error(`Failed to export presence data for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Get guild settings
   */
  public getGuildSettings(guildId: string): PresenceSettings | null {
    return this.guildSettings.get(guildId) || null;
  }

  /**
   * Get active sessions for guild
   */
  public getActiveSessionsForGuild(guildId: string): PresenceSession[] {
    const guildSessions = this.activeSessions.get(guildId);
    return guildSessions ? Array.from(guildSessions.values()) : [];
  }
}