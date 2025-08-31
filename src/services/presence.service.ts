import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { BadgeService } from './badge.service';
import { ExtendedClient } from '../types/client';
import { PUBGService } from './pubg.service';
import { EmbedBuilder, GuildMember, TextChannel } from 'discord.js';

export interface PresenceRecord {
  id: string;
  userId: string;
  guildId: string;
  type: 'checkin' | 'checkout'; // Fixed: standardized types
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
  private pubgService: PUBGService;
  private client: ExtendedClient;

  private activeSessions: Map<string, Map<string, PresenceSession>> = new Map(); // guildId -> userId -> session
  private presenceStats: Map<string, Map<string, PresenceStats>> = new Map(); // guildId -> userId -> stats
  private guildSettings: Map<string, PresenceSettings> = new Map(); // guildId -> settings
  private dailyStats: Map<string, any> = new Map(); // guildId -> daily stats

  private readonly maxSessionDuration = 24 * 60; // 24 hours in minutes
  private readonly streakGracePeriod = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

  constructor(client: ExtendedClient) {
    this.logger = new Logger();
    this.cache = client.cache;
    this.database = client.database;
    this.badgeService =
      (client as any).services?.badge || new BadgeService(client, (client as any).services?.xp, (client as any).services?.logging);
    this.pubgService = client.pubgService; // Added PUBG service integration
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
      const activeSessions = await this.database.client.presence.findMany({
        where: {
          type: 'checkin',
          checkOutTime: null, // Only sessions that haven't been checked out
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          guild: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          checkInTime: 'desc',
        },
      });

      for (const session of activeSessions) {
        if (!this.activeSessions.has(session.guildId)) {
          this.activeSessions.set(session.guildId, new Map());
        }

        const guildSessions = this.activeSessions.get(session.guildId)!;
        guildSessions.set(session.userId, {
          id: session.id,
          userId: session.userId,
          guildId: session.guildId,
          checkInTime: session.checkInTime || session.timestamp,
          location: session.location || 'Unknown',
          note: session.note || undefined,
          status: 'active' as const,
        });
      }

      this.logger.info(`Loaded ${activeSessions.length} active presence sessions`);
    } catch (error) {
      this.logger.error('Failed to load active sessions:', error);
    }
  }

  /**
   * Load presence statistics
   */
  private async loadPresenceStats(): Promise<void> {
    try {
      // Load daily stats for all guilds
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dailyPresences = await this.database.client.presence.findMany({
        where: {
          checkInTime: {
            gte: today,
          },
          checkOutTime: {
            not: null,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      // Calculate daily statistics
      for (const presence of dailyPresences) {
        const guildStats = this.dailyStats.get(presence.guildId) || {
          totalCheckIns: 0,
          totalDuration: 0,
          uniqueUsers: new Set(),
          averageDuration: 0,
        };

        guildStats.totalCheckIns++;
        guildStats.uniqueUsers.add(presence.userId);

        if (presence.checkInTime && presence.checkOutTime) {
          const duration = presence.checkOutTime.getTime() - presence.checkInTime.getTime();
          guildStats.totalDuration += duration;
        }

        guildStats.averageDuration =
          guildStats.totalCheckIns > 0 ? guildStats.totalDuration / guildStats.totalCheckIns : 0;

        this.dailyStats.set(presence.guildId, guildStats);
      }

      this.logger.info(`Loaded presence statistics for ${this.dailyStats.size} guilds`);
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
          streakRewards: configData?.presenceStreakRewards
            ? JSON.parse(configData.presenceStreakRewards)
            : [
                { days: 7, xp: 100, coins: 50 },
                { days: 30, xp: 500, coins: 250 },
                { days: 90, xp: 1500, coins: 750 },
                { days: 365, xp: 10000, coins: 5000, badgeId: 'yearly_attendance' },
              ],
          dailyRewards: configData?.presenceDailyRewards
            ? JSON.parse(configData.presenceDailyRewards)
            : {
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
    setInterval(
      async () => {
        await this.performAutoCheckOuts();
      },
      60 * 60 * 1000
    );
  }

  /**
   * Start streak checker
   */
  private startStreakChecker(): void {
    // Check streaks every day at midnight
    setInterval(
      async () => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() < 5) {
          await this.updateAllStreaks();
        }
      },
      5 * 60 * 1000
    );
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
    deviceInfo?: string
  ): Promise<{ success: boolean; message: string; session?: PresenceSession }> {
    try {
      // Check if user is already checked in
      const existingCheckIn = await this.database.client.presence.findFirst({
        where: {
          userId,
          type: 'checkin',
          metadata: JSON.stringify({
            guildId: guildId,
          }),
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      // Check if there's a corresponding checkout
      if (existingCheckIn) {
        const checkOut = await this.database.client.presence.findFirst({
          where: {
            userId,
            type: 'checkout',
            timestamp: {
              gt: existingCheckIn.timestamp,
            },
            metadata: JSON.stringify({
              guildId: guildId,
            }),
          },
        });

        if (!checkOut) {
          return {
            success: false,
            message: 'Você já está em uma sessão ativa. Faça checkout primeiro.',
          };
        }
      }

      const presenceRecord = await this.database.client.presence.create({
        data: {
          userId,
          guildId,
          type: 'checkin',
          checkInTime: new Date(),
          location,
          note,
          metadata: JSON.stringify({
            ipAddress,
            deviceInfo,
          }),
        },
      });

      // Create session object for response
      const session: PresenceSession = {
        id: presenceRecord.id,
        userId,
        guildId,
        checkInTime: presenceRecord.timestamp,
        location,
        note,
        status: 'active',
      };

      // Add to active sessions
      if (!this.activeSessions.has(guildId)) {
        this.activeSessions.set(guildId, new Map());
      }
      this.activeSessions.get(guildId)!.set(userId, session);

      // Award check-in rewards
      await this.awardDailyRewards(userId, guildId);

      // Send notification
      await this.sendCheckInNotification(userId, guildId, session);

      this.logger.info(`User ${userId} checked in to guild ${guildId}`);

      return {
        success: true,
        message: `Check-in realizado com sucesso às ${new Date().toLocaleString('pt-BR')}.`,
        session,
      };

      /*
      return {
        success: false,
        message: 'Check-in temporariamente desabilitado para manutenção do modelo de dados.'
      };
      */
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
    note?: string
  ): Promise<{ success: boolean; message: string; session?: PresenceSession }> {
    try {
      // Check if user has an active session
      const activeSession = this.activeSessions.get(guildId)?.get(userId);
      if (!activeSession) {
        return {
          success: false,
          message: 'Você não possui uma sessão ativa para fazer checkout.',
        };
      }

      // Find the most recent check-in
      const lastCheckIn = await this.database.client.presence.findFirst({
        where: {
          userId,
          type: 'checkin',
          metadata: JSON.stringify({
            guildId: guildId,
          }),
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      if (!lastCheckIn) {
        return {
          success: false,
          message: 'Nenhum check-in encontrado para fazer checkout.',
        };
      }

      const presenceRecord = await this.database.client.presence.create({
        data: {
          userId,
          guildId,
          type: 'checkout',
          checkOutTime: new Date(),
          note,
          metadata: JSON.stringify({
            checkInId: lastCheckIn.id,
          }),
        },
      });

      // Calculate session duration
      const duration = presenceRecord.timestamp.getTime() - lastCheckIn.timestamp.getTime();
      const durationMinutes = Math.floor(duration / (1000 * 60));

      // Update session
      const updatedSession: PresenceSession = {
        ...activeSession,
        checkOutTime: presenceRecord.timestamp,
        duration: durationMinutes,
        status: 'completed',
      };

      // Remove from active sessions
      this.activeSessions.get(guildId)?.delete(userId);

      // Award session rewards
      await this.awardSessionRewards(userId, guildId, durationMinutes);

      // Update user stats
      await this.updateUserStats(guildId, userId);

      // Send notification
      await this.sendCheckOutNotification(userId, guildId, updatedSession);

      this.logger.info(
        `User ${userId} checked out from guild ${guildId} after ${durationMinutes} minutes`
      );

      return {
        success: true,
        message: `Check-out realizado com sucesso às ${new Date().toLocaleString('pt-BR')}. Sessão: ${durationMinutes} minutos.`,
        session: updatedSession,
      };

      /*
      return {
        success: false,
        message: 'Check-out temporariamente desabilitado para manutenção do modelo de dados.'
      };
      */
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
    endDate: Date
  ): Promise<PresenceReport> {
    try {
      // Get all presence records for the period
      const presences = await this.database.client.presence.findMany({
        where: {
          guildId,
          checkInTime: {
            gte: startDate,
            lte: endDate,
          },
          checkOutTime: {
            not: null,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: {
          checkInTime: 'asc',
        },
      });

      // Calculate basic stats
      const totalSessions = presences.length;
      const uniqueUsers = new Set(presences.map(p => p.userId));
      const totalUsers = uniqueUsers.size;

      let totalDuration = 0;
      const userStatsMap = new Map<
        string,
        {
          userId: string;
          username: string;
          sessions: number;
          duration: number;
        }
      >();

      const dailyStatsMap = new Map<
        string,
        {
          date: string;
          sessions: number;
          duration: number;
          uniqueUsers: Set<string>;
        }
      >();

      // Process each presence record
      for (const presence of presences) {
        if (!presence.checkInTime || !presence.checkOutTime) {
          continue;
        }

        const duration = presence.checkOutTime.getTime() - presence.checkInTime.getTime();
        const durationMinutes = Math.floor(duration / (1000 * 60));
        totalDuration += durationMinutes;

        // Update user stats
        const userKey = presence.userId;
        const userStats = userStatsMap.get(userKey) || {
          userId: presence.userId,
          username: 'Unknown',
          sessions: 0,
          duration: 0,
        };
        userStats.sessions++;
        userStats.duration += durationMinutes;
        userStatsMap.set(userKey, userStats);

        // Update daily stats
        if (presence.checkInTime) {
          const dateKey = presence.checkInTime.toISOString().split('T')[0];
          if (dateKey) {
            const dailyStats = dailyStatsMap.get(dateKey) || {
              date: dateKey,
              sessions: 0,
              duration: 0,
              uniqueUsers: new Set<string>(),
            };
            dailyStats.sessions++;
            dailyStats.duration += durationMinutes;
            dailyStats.uniqueUsers.add(presence.userId);
            dailyStatsMap.set(dateKey, dailyStats);
          }
        }
      }

      // Find most active user
      let mostActiveUser = null;
      let maxDuration = 0;
      for (const userStats of userStatsMap.values()) {
        if (userStats.duration > maxDuration) {
          maxDuration = userStats.duration;
          mostActiveUser = {
            userId: userStats.userId,
            username: userStats.username,
            sessions: userStats.sessions,
            duration: userStats.duration,
          };
        }
      }

      // Convert daily stats
      const dailyStats = Array.from(dailyStatsMap.values())
        .map(stats => ({
          date: stats.date,
          sessions: stats.sessions,
          duration: stats.duration,
          uniqueUsers: stats.uniqueUsers.size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Convert user stats with average duration
      const userStats = Array.from(userStatsMap.values())
        .map(stats => ({
          ...stats,
          averageDuration: stats.sessions > 0 ? Math.floor(stats.duration / stats.sessions) : 0,
        }))
        .sort((a, b) => b.duration - a.duration);

      const report: PresenceReport = {
        guildId,
        period: { start: startDate, end: endDate },
        totalUsers,
        totalSessions,
        totalDuration,
        averageSessionDuration: totalSessions > 0 ? Math.floor(totalDuration / totalSessions) : 0,
        mostActiveUser,
        dailyStats,
        userStats,
      };

      this.logger.info(
        `Generated presence report for guild ${guildId}: ${totalSessions} sessions, ${totalUsers} users`
      );
      return report;
    } catch (error) {
      this.logger.error(`Failed to generate guild report for ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Configure guild presence settings
   */
  public async configureGuildSettings(
    guildId: string,
    settings: Partial<PresenceSettings>
  ): Promise<void> {
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
          config: JSON.stringify(configData),
        },
        create: {
          guildId,
          config: JSON.stringify(configData),
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
   * Auto checkout inactive users (called by SchedulerService)
   */
  public async autoCheckoutInactive(): Promise<void> {
    try {
      this.logger.info('Starting auto checkout of inactive users');
      await this.performAutoCheckOuts();
      this.logger.info('Completed auto checkout of inactive users');
    } catch (error) {
      this.logger.error('Failed to auto checkout inactive users:', error);
    }
  }

  /**
   * Calculate user's current balance based on transactions
   */
  private async calculateUserBalance(userId: string): Promise<number> {
    try {
      // Get user's current coins from User model
      const user = await this.database.client.user.findUnique({
        where: { id: userId },
        select: { coins: true },
      });

      return user?.coins || 0;
    } catch (error) {
      this.logger.error(`Failed to calculate balance for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Update user statistics
   */
  private async updateUserStats(guildId: string, userId: string): Promise<void> {
    try {
      // Get all presence records for this user in this guild
      const presences = await this.database.client.presence.findMany({
        where: {
          userId,
          guildId,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      if (presences.length === 0) {
        return;
      }

      // Calculate statistics from presence records
      const checkIns = presences.filter(p => p.type === 'checkin').length;
      const checkOuts = presences.filter(p => p.type === 'checkout').length;

      // Calculate total time spent (sum of completed sessions)
      let totalTimeMinutes = 0;
      const completedSessions = [];

      // Group check-ins and check-outs into sessions
      for (const presence of presences) {
        if (presence.type === 'checkin' && presence.checkInTime) {
          // Find corresponding checkout
          const checkout = presences.find(
            p => p.type === 'checkout' && p.checkOutTime && p.checkOutTime > presence.checkInTime!
          );

          if (checkout && checkout.checkOutTime) {
            const sessionDuration = Math.floor(
              (checkout.checkOutTime.getTime() - presence.checkInTime.getTime()) / (1000 * 60)
            );
            totalTimeMinutes += sessionDuration;
            completedSessions.push({
              checkInTime: presence.checkInTime,
              checkOutTime: checkout.checkOutTime,
              duration: sessionDuration,
            });
          }
        }
      }

      // Calculate streaks
      const currentStreak = this.calculateCurrentStreak(completedSessions);
      const longestStreak = this.calculateLongestStreak(completedSessions);

      // Update UserStats
      await this.database.client.userStats.upsert({
        where: { userId },
        update: {
          checkIns,
          updatedAt: new Date(),
        },
        create: {
          userId,
          checkIns,
        },
      });

      this.logger.info(
        `Updated stats for user ${userId}: ${checkIns} check-ins, ${totalTimeMinutes} minutes, streak: ${currentStreak}`
      );
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

    const sortedPresences = presences.sort(
      (a, b) => b.checkInTime.getTime() - a.checkInTime.getTime()
    );
    const now = new Date();
    let streak = 0;
    let lastDate: Date | null = null;

    for (const presence of sortedPresences) {
      const presenceDate = new Date(presence.checkInTime);
      presenceDate.setHours(0, 0, 0, 0);

      if (lastDate === null) {
        // First presence
        const daysDiff = Math.floor(
          (now.getTime() - presenceDate.getTime()) / (24 * 60 * 60 * 1000)
        );
        if (daysDiff <= 1) {
          streak = 1;
          lastDate = presenceDate;
        } else {
          break;
        }
      } else {
        // Check if this presence is consecutive
        const daysDiff = Math.floor(
          (lastDate.getTime() - presenceDate.getTime()) / (24 * 60 * 60 * 1000)
        );
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

    const sortedPresences = presences.sort(
      (a, b) => a.checkInTime.getTime() - b.checkInTime.getTime()
    );
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
        const daysDiff = Math.floor(
          (presenceDate.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000)
        );

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
  private async awardSessionRewards(
    guildId: string,
    userId: string,
    duration: number
  ): Promise<void> {
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

        this.logger.info(
          `Awarded session rewards to user ${userId}: ${bonusXP} XP, ${bonusCoins} coins for ${duration} minutes`
        );
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

                // Calculate current balance
                const currentBalance = await this.calculateUserBalance(userId);

                // Record transaction
                await this.database.client.transaction.create({
                  data: {
                    userId,
                    type: 'earn',
                    amount: reward.coins,
                    balance: currentBalance + reward.coins,
                    reason: `${reward.days} day streak reward`,
                    metadata: JSON.stringify({ xp: reward.xp, coins: reward.coins }),
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
  private async sendCheckInNotification(
    guildId: string,
    userId: string,
    session: PresenceSession
  ): Promise<void> {
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
          { name: '📍 Local', value: session.location || 'Não informado', inline: true }
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
  private async sendCheckOutNotification(
    guildId: string,
    userId: string,
    session: PresenceSession
  ): Promise<void> {
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
          {
            name: '⏰ Check-out',
            value: session.checkOutTime?.toLocaleString('pt-BR') || 'N/A',
            inline: true,
          },
          { name: '⏱️ Duração', value: this.formatDuration(session.duration || 0), inline: true }
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
    endDate: Date
  ): Promise<string> {
    try {
      // Get all presence records for the period
      const presences = await this.database.client.presence.findMany({
        where: {
          guildId,
          checkInTime: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
        orderBy: {
          checkInTime: 'asc',
        },
      });

      // Create CSV header
      const csvHeader = 'Usuario,Discord ID,Check-in,Check-out,Duracao (min),Local,Observacao\n';

      // Process each presence record
      const csvRows: string[] = [];
      for (const presence of presences) {
        const username = 'Unknown';
        const discordId = presence.userId;
        const checkIn = presence.checkInTime ? presence.checkInTime.toLocaleString('pt-BR') : 'N/A';
        const checkOut = presence.checkOutTime
          ? presence.checkOutTime.toLocaleString('pt-BR')
          : 'Em andamento';

        let duration = 'N/A';
        if (presence.checkInTime && presence.checkOutTime) {
          const durationMs = presence.checkOutTime.getTime() - presence.checkInTime.getTime();
          const durationMinutes = Math.floor(durationMs / (1000 * 60));
          duration = durationMinutes.toString();
        }

        const location = presence.location || 'Não informado';
        const note = presence.note || 'Sem observação';

        // Escape CSV values (handle commas and quotes)
        const escapeCsv = (value: string) => {
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        };

        const row = [
          escapeCsv(username),
          escapeCsv(discordId),
          escapeCsv(checkIn),
          escapeCsv(checkOut),
          escapeCsv(duration),
          escapeCsv(location),
          escapeCsv(note),
        ].join(',');

        csvRows.push(row);
      }

      const csvContent = csvHeader + csvRows.join('\n');

      this.logger.info(`Exported ${presences.length} presence records for guild ${guildId}`);
      return csvContent;
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
