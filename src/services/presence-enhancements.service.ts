import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { ExtendedClient } from '../types/client';
import { PUBGService } from './pubg.service';
import { PunishmentService } from './punishment.service';
import { PresenceService } from './presence.service';
import { BadgeService } from './badge.service';
import { EmbedBuilder, TextChannel, GuildMember } from 'discord.js';
import { PUBGPlatform, PUBGGameMode } from '../types/pubg';

export interface PresenceEnhancement {
  id: string;
  userId: string;
  guildId: string;
  type: 'pubg_validation' | 'auto_punishment' | 'performance_optimization' | 'streak_bonus';
  description: string;
  appliedAt: Date;
  success: boolean;
  details?: any;
}

export interface PUBGPresenceValidation {
  userId: string;
  pubgUsername?: string;
  pubgPlatform?: PUBGPlatform;
  isValid: boolean;
  lastValidated: Date;
  validationErrors?: string[];
  stats?: {
    matches: number;
    kills: number;
    wins: number;
    kda: number;
    rank: string;
  };
}

export interface AutoPunishmentConfig {
  enabled: boolean;
  checkInterval: number; // minutes
  gracePeriod: number; // minutes
  escalationThreshold: number;
  notificationChannelId?: string;
}

/**
 * Enhanced Presence Service with PUBG API integration and automatic penalties
 */
export class PresenceEnhancementsService {
  private logger: Logger;
  private database: DatabaseService;
  private client: ExtendedClient;
  private pubgService: PUBGService;
  private punishmentService: PunishmentService;
  private presenceService: PresenceService;
  private badgeService: BadgeService;

  private enhancements: Map<string, PresenceEnhancement[]> = new Map(); // userId -> enhancements
  private pubgValidations: Map<string, PUBGPresenceValidation> = new Map(); // userId -> validation
  private autoPunishmentConfig: AutoPunishmentConfig;

  private readonly validationCacheTime = 30 * 60 * 1000; // 30 minutes
  private readonly maxRetries = 3;

  constructor(client: ExtendedClient) {
    this.client = client;
    this.database = client.database;
    this.logger = new Logger();
    this.pubgService = new PUBGService(client.cache);
    this.punishmentService = new PunishmentService(client, client.database);
    this.presenceService = new PresenceService(client);
    this.badgeService = new BadgeService(client, (client as any).xpService);

    this.autoPunishmentConfig = {
      enabled: true,
      checkInterval: 15, // Check every 15 minutes
      gracePeriod: 5, // 5 minutes grace period
      escalationThreshold: 3,
      notificationChannelId: undefined,
    };

    this.initializeEnhancements();
    this.startAutoPunishmentMonitoring();
  }

  /**
   * Initialize presence enhancements
   */
  private async initializeEnhancements(): Promise<void> {
    try {
      this.logger.info('Initializing presence enhancements...');

      // Load existing enhancements from database (when schema is ready)
      // const enhancements = await this.database.client.presenceEnhancement.findMany();

      // Load PUBG validations from cache
      await this.loadPUBGValidations();

      this.logger.info('Presence enhancements initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize presence enhancements:', error);
    }
  }

  /**
   * Load PUBG validations from cache or database
   */
  private async loadPUBGValidations(): Promise<void> {
    try {
      const users = await this.database.client.user.findMany({
        where: {
          pubgUsername: { not: null },
        },
        select: {
          id: true,
          pubgUsername: true,
          pubgPlatform: true,
        },
      });

      for (const user of users) {
        if (user.pubgUsername && user.pubgPlatform) {
          const validation: PUBGPresenceValidation = {
            userId: user.id,
            pubgUsername: user.pubgUsername,
            pubgPlatform: user.pubgPlatform as PUBGPlatform,
            isValid: false,
            lastValidated: new Date(0), // Force revalidation
            validationErrors: [],
          };

          this.pubgValidations.set(user.id, validation);
        }
      }

      this.logger.info(`Loaded ${this.pubgValidations.size} PUBG validations`);
    } catch (error) {
      this.logger.error('Failed to load PUBG validations:', error);
    }
  }

  /**
   * Validate PUBG integration for user
   */
  public async validatePUBGIntegration(
    userId: string,
    guildId: string
  ): Promise<PUBGPresenceValidation> {
    try {
      let validation = this.pubgValidations.get(userId);

      // Check if validation is recent
      if (
        validation &&
        Date.now() - validation.lastValidated.getTime() < this.validationCacheTime
      ) {
        return validation;
      }

      // Check PUBG service availability
      if (!(await this.pubgService.isAPIAvailable())) {
        await this.logToChannel('⚠️ PUBG Service Unavailable', {
          event: 'PUBG Validation',
          status: 'Warning',
          userId,
          message: 'PUBG service is not available for validation',
          details: { reason: 'Service unavailable' },
        });

        validation = {
          userId,
          isValid: false,
          lastValidated: new Date(),
          validationErrors: ['PUBG service is currently unavailable'],
        };

        this.pubgValidations.set(userId, validation);
        return validation;
      }

      // Check PUBG service health
      const isHealthy = await this.pubgService.healthCheck();
      if (!isHealthy) {
        await this.logToChannel('⚠️ PUBG Service Unhealthy', {
          event: 'PUBG Validation',
          status: 'Warning',
          userId,
          message: 'PUBG service failed health check',
          details: { reason: 'Health check failed' },
        });

        validation = {
          userId,
          isValid: false,
          lastValidated: new Date(),
          validationErrors: ['PUBG service is currently unhealthy'],
        };

        this.pubgValidations.set(userId, validation);
        return validation;
      }

      // Get user data
      const user = await this.database.client.user.findUnique({
        where: { id: userId },
        select: {
          pubgUsername: true,
          pubgPlatform: true,
        },
      });

      if (!user?.pubgUsername || !user?.pubgPlatform) {
        await this.logToChannel('⚠️ PUBG Configuration Missing', {
          event: 'PUBG Validation',
          status: 'Warning',
          userId,
          message: 'User has not configured PUBG username or platform',
          details: {
            hasUsername: !!user?.pubgUsername,
            hasPlatform: !!user?.pubgPlatform,
          },
        });

        validation = {
          userId,
          isValid: false,
          lastValidated: new Date(),
          validationErrors: ['PUBG username or platform not configured'],
        };

        this.pubgValidations.set(userId, validation);
        return validation;
      }

      // Validate with PUBG API
      const pubgPlayer = await this.pubgService.getPlayerByName(
        user.pubgUsername,
        user.pubgPlatform as PUBGPlatform
      );

      if (!pubgPlayer) {
        await this.logToChannel('❌ PUBG Player Not Found', {
          event: 'PUBG Validation',
          status: 'Error',
          userId,
          pubgName: user.pubgUsername,
          platform: user.pubgPlatform,
          message: 'PUBG player not found in API',
          details: {
            username: user.pubgUsername,
            platform: user.pubgPlatform,
          },
        });

        validation = {
          userId,
          pubgUsername: user.pubgUsername,
          pubgPlatform: user.pubgPlatform as PUBGPlatform,
          isValid: false,
          lastValidated: new Date(),
          validationErrors: ['PUBG player not found or API unavailable'],
        };
      } else {
        // Get player stats
        const stats = await this.pubgService.getPlayerStats(
          pubgPlayer.id,
          user.pubgPlatform as PUBGPlatform
        );

        validation = {
          userId,
          pubgUsername: user.pubgUsername,
          pubgPlatform: user.pubgPlatform as PUBGPlatform,
          isValid: true,
          lastValidated: new Date(),
          validationErrors: [],
          stats: stats
            ? {
                matches: stats.gameModeStats?.squad?.roundsPlayed || 0,
                kills: stats.gameModeStats?.squad?.kills || 0,
                wins: stats.gameModeStats?.squad?.wins || 0,
                kda: this.pubgService.calculateKDA(
                  stats.gameModeStats?.squad?.kills || 0,
                  stats.gameModeStats?.squad?.losses || 1,
                  stats.gameModeStats?.squad?.assists || 0
                ),
                rank: stats.rankPointTitle || 'Unranked',
              }
            : undefined,
        };

        // Log successful validation
        await this.logToChannel('✅ PUBG Validation Success', {
          event: 'PUBG Validation',
          status: 'Success',
          userId,
          pubgName: user.pubgUsername,
          playerId: pubgPlayer.id,
          platform: user.pubgPlatform,
          message: 'PUBG integration validated successfully',
          details: {
            username: user.pubgUsername,
            platform: user.pubgPlatform,
            playerId: pubgPlayer.id,
            stats: validation.stats,
          },
        });
      }

      this.pubgValidations.set(userId, validation);

      // Log enhancement
      await this.logEnhancement({
        id: `pubg_validation_${Date.now()}_${userId}`,
        userId,
        guildId,
        type: 'pubg_validation',
        description: `PUBG integration validated: ${validation.isValid ? 'Success' : 'Failed'}`,
        appliedAt: new Date(),
        success: validation.isValid,
        details: validation,
      });

      return validation;
    } catch (error) {
      this.logger.error(`Failed to validate PUBG integration for user ${userId}:`, error);

      // Log error to Discord
      await this.logToChannel('❌ PUBG Validation Error', {
        event: 'PUBG Validation',
        status: 'Error',
        userId,
        message: 'Failed to validate PUBG integration',
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          stack: error instanceof Error ? error.stack : undefined,
        },
      });

      const validation: PUBGPresenceValidation = {
        userId,
        isValid: false,
        lastValidated: new Date(),
        validationErrors: [
          `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };

      this.pubgValidations.set(userId, validation);
      return validation;
    }
  }

  /**
   * Enhanced check-in with PUBG validation
   */
  public async enhancedCheckIn(
    guildId: string,
    userId: string,
    location?: string,
    note?: string
  ): Promise<{ success: boolean; message: string; validation?: PUBGPresenceValidation }> {
    try {
      // Validate PUBG integration first
      const validation = await this.validatePUBGIntegration(userId, guildId);

      // Proceed with normal check-in
      const checkInResult = await this.presenceService.checkIn(guildId, userId, location, note);

      if (checkInResult.success) {
        // Award bonus XP for valid PUBG integration
        if (validation.isValid && validation.stats) {
          const bonusXP = this.calculatePUBGBonus(validation.stats);
          if (bonusXP > 0) {
            await this.database.client.user.update({
              where: { id: userId },
              data: { xp: { increment: bonusXP } },
            });

            checkInResult.message += ` (+${bonusXP} XP bônus PUBG)`;
          }
        }

        // Schedule enhanced punishment checks
        this.scheduleEnhancedPunishmentChecks(userId, guildId);
      }

      return {
        ...checkInResult,
        validation,
      };
    } catch (error) {
      this.logger.error(`Enhanced check-in failed for user ${userId}:`, error);
      return {
        success: false,
        message: 'Erro interno durante check-in aprimorado',
      };
    }
  }

  /**
   * Enhanced check-out with performance tracking
   */
  public async enhancedCheckOut(
    guildId: string,
    userId: string,
    note?: string
  ): Promise<{ success: boolean; message: string; validation?: PUBGPresenceValidation }> {
    try {
      // Get current PUBG validation
      const validation = this.getPUBGValidation(userId);

      // Proceed with normal check-out
      const checkOutResult = await this.presenceService.checkOut(guildId, userId, note);

      if (checkOutResult.success && checkOutResult.session) {
        // Award bonus XP for valid PUBG integration and session duration
        if (validation?.isValid && validation.stats) {
          const sessionDuration = checkOutResult.session.duration || 0;
          const bonusXP = this.calculateSessionBonus(validation.stats, sessionDuration);

          if (bonusXP > 0) {
            await this.database.client.user.update({
              where: { id: userId },
              data: { xp: { increment: bonusXP } },
            });

            checkOutResult.message += ` (+${bonusXP} XP bônus sessão)`;
          }
        }

        // Log enhancement
        await this.logEnhancement({
          id: `enhanced_checkout_${Date.now()}_${userId}`,
          userId,
          guildId,
          type: 'performance_optimization',
          description: `Enhanced checkout completed with ${checkOutResult.session.duration || 0} minutes`,
          appliedAt: new Date(),
          success: true,
          details: {
            sessionDuration: checkOutResult.session.duration,
            bonusAwarded: validation?.isValid,
          },
        });
      }

      return {
        ...checkOutResult,
        validation: validation || undefined,
      };
    } catch (error) {
      this.logger.error(`Enhanced check-out failed for user ${userId}:`, error);
      return {
        success: false,
        message: 'Erro interno durante check-out aprimorado',
      };
    }
  }

  /**
   * Calculate PUBG bonus XP based on stats
   */
  private calculatePUBGBonus(stats: NonNullable<PUBGPresenceValidation['stats']>): number {
    let bonus = 0;

    // Base bonus for having valid PUBG stats
    bonus += 10;

    // KDA bonus
    if (stats.kda >= 2.0) {
      bonus += 15;
    } else if (stats.kda >= 1.5) {
      bonus += 10;
    } else if (stats.kda >= 1.0) {
      bonus += 5;
    }

    // Win rate bonus (assuming 10% is good)
    const winRate = stats.matches > 0 ? (stats.wins / stats.matches) * 100 : 0;
    if (winRate >= 20) {
      bonus += 20;
    } else if (winRate >= 15) {
      bonus += 15;
    } else if (winRate >= 10) {
      bonus += 10;
    } else if (winRate >= 5) {
      bonus += 5;
    }

    // Rank bonus
    const rankBonuses: { [key: string]: number } = {
      Master: 50,
      Diamond: 40,
      Platinum: 30,
      Gold: 20,
      Silver: 10,
      Bronze: 5,
    };

    for (const [rank, rankBonus] of Object.entries(rankBonuses)) {
      if (stats.rank.includes(rank)) {
        bonus += rankBonus;
        break;
      }
    }

    return Math.min(bonus, 100); // Cap at 100 XP bonus
  }

  /**
   * Calculate session bonus XP based on PUBG stats and session duration
   */
  private calculateSessionBonus(
    stats: NonNullable<PUBGPresenceValidation['stats']>,
    sessionDurationMinutes: number
  ): number {
    let bonusXP = 0;

    // Base bonus for session duration (1 XP per 10 minutes)
    bonusXP += Math.floor(sessionDurationMinutes / 10);

    // PUBG performance bonus
    if (stats.kda > 2.0) {
      bonusXP += 10;
    }
    if (stats.wins > 100) {
      bonusXP += 15;
    }
    if (stats.rank !== 'Unranked' && stats.rank !== 'Bronze') {
      bonusXP += 5;
    }

    // Long session bonus
    if (sessionDurationMinutes >= 120) {
      bonusXP += 20;
    } // 2+ hours
    if (sessionDurationMinutes >= 240) {
      bonusXP += 30;
    } // 4+ hours

    return Math.min(bonusXP, 75); // Cap at 75 XP
  }

  /**
   * Schedule enhanced punishment checks
   */
  private scheduleEnhancedPunishmentChecks(userId: string, guildId: string): void {
    const sessionStartTime = new Date();

    // Enhanced no-show check (30 minutes)
    setTimeout(
      async () => {
        await this.checkEnhancedNoShow(userId, guildId, sessionStartTime);
      },
      30 * 60 * 1000
    );

    // Enhanced no-checkout check (4 hours)
    setTimeout(
      async () => {
        await this.checkEnhancedNoCheckout(userId, guildId, sessionStartTime);
      },
      4 * 60 * 60 * 1000
    );

    // Enhanced early leave check (1 hour)
    setTimeout(
      async () => {
        await this.checkEnhancedEarlyLeave(userId, guildId, sessionStartTime);
      },
      60 * 60 * 1000
    );
  }

  /**
   * Enhanced no-show check with PUBG activity validation
   */
  private async checkEnhancedNoShow(
    userId: string,
    guildId: string,
    sessionStartTime: Date
  ): Promise<void> {
    try {
      const activeSession = this.presenceService.getActiveSession(guildId, userId);
      if (!activeSession) {
        return;
      } // User already checked out

      // Check if user is in voice channel
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }

      const member = guild.members.cache.get(userId);
      if (!member?.voice.channel) {
        // User not in voice channel, check PUBG activity
        const validation = await this.validatePUBGIntegration(userId, guildId);

        if (validation.isValid) {
          // Check recent PUBG matches (if API supports it)
          // For now, apply standard punishment with PUBG context
          await this.punishmentService.applyPunishment(userId, guildId, 'no_show_up', {
            reason: `Não compareceu à sessão (PUBG: ${validation.pubgUsername})`,
            sessionId: activeSession.id,
          });
        } else {
          // Apply standard punishment
          await this.punishmentService.applyPunishment(userId, guildId, 'no_show_up', {
            reason: 'Não compareceu à sessão',
            sessionId: activeSession.id,
          });
        }

        await this.logEnhancement({
          id: `auto_punishment_${Date.now()}_${userId}`,
          userId,
          guildId,
          type: 'auto_punishment',
          description: 'Enhanced no-show punishment applied',
          appliedAt: new Date(),
          success: true,
          details: { type: 'no_show_up', validation },
        });
      }
    } catch (error) {
      this.logger.error(`Enhanced no-show check failed for user ${userId}:`, error);
    }
  }

  /**
   * Enhanced no-checkout check
   */
  private async checkEnhancedNoCheckout(
    userId: string,
    guildId: string,
    sessionStartTime: Date
  ): Promise<void> {
    try {
      const activeSession = this.presenceService.getActiveSession(guildId, userId);
      if (!activeSession) {
        return;
      } // User already checked out

      // Check session duration
      const sessionDuration = Date.now() - sessionStartTime.getTime();
      const maxSessionDuration = 6 * 60 * 60 * 1000; // 6 hours

      if (sessionDuration > maxSessionDuration) {
        // Force checkout and apply punishment
        await this.presenceService.checkOut(guildId, userId, 'Auto checkout - sessão muito longa');

        await this.punishmentService.applyPunishment(userId, guildId, 'no_checkout', {
          reason: `Não fez checkout após ${Math.round(sessionDuration / (60 * 60 * 1000))} horas`,
          sessionId: activeSession.id,
        });

        await this.logEnhancement({
          id: `auto_punishment_${Date.now()}_${userId}`,
          userId,
          guildId,
          type: 'auto_punishment',
          description: 'Enhanced no-checkout punishment applied',
          appliedAt: new Date(),
          success: true,
          details: { type: 'no_checkout', duration: sessionDuration },
        });
      }
    } catch (error) {
      this.logger.error(`Enhanced no-checkout check failed for user ${userId}:`, error);
    }
  }

  /**
   * Enhanced early leave check
   */
  private async checkEnhancedEarlyLeave(
    userId: string,
    guildId: string,
    sessionStartTime: Date
  ): Promise<void> {
    try {
      const activeSession = this.presenceService.getActiveSession(guildId, userId);
      if (activeSession) {
        return;
      } // User still in session

      // Check if user left too early
      const sessionDuration = Date.now() - sessionStartTime.getTime();
      const minimumDuration = 60 * 60 * 1000; // 1 hour

      if (sessionDuration < minimumDuration) {
        await this.punishmentService.applyPunishment(userId, guildId, 'early_leave', {
          reason: `Saiu da sessão após apenas ${Math.round(sessionDuration / (60 * 1000))} minutos`,
          sessionId: `session_${sessionStartTime.getTime()}_${userId}`,
        });

        await this.logEnhancement({
          id: `auto_punishment_${Date.now()}_${userId}`,
          userId,
          guildId,
          type: 'auto_punishment',
          description: 'Enhanced early leave punishment applied',
          appliedAt: new Date(),
          success: true,
          details: { type: 'early_leave', duration: sessionDuration },
        });
      }
    } catch (error) {
      this.logger.error(`Enhanced early leave check failed for user ${userId}:`, error);
    }
  }

  /**
   * Start automatic punishment monitoring
   */
  private startAutoPunishmentMonitoring(): void {
    if (!this.autoPunishmentConfig.enabled) {
      return;
    }

    setInterval(
      async () => {
        await this.monitorActiveSessions();
      },
      this.autoPunishmentConfig.checkInterval * 60 * 1000
    );

    this.logger.info(
      `Auto punishment monitoring started (interval: ${this.autoPunishmentConfig.checkInterval} minutes)`
    );
  }

  /**
   * Monitor active sessions for potential issues
   */
  private async monitorActiveSessions(): Promise<void> {
    try {
      // Get all guilds
      const guilds = this.client.guilds.cache;

      for (const [guildId, guild] of guilds) {
        const activeSessions = this.presenceService.getActiveSessionsForGuild(guildId);

        for (const session of activeSessions) {
          const sessionDuration = Date.now() - session.checkInTime.getTime();
          const gracePeriod = this.autoPunishmentConfig.gracePeriod * 60 * 1000;

          // Check for suspicious long sessions
          if (sessionDuration > 8 * 60 * 60 * 1000) {
            // 8 hours
            this.logger.warn(
              `Suspicious long session detected: User ${session.userId} in guild ${guildId} (${Math.round(sessionDuration / (60 * 60 * 1000))} hours)`
            );

            // Send notification to admins
            await this.sendSuspiciousActivityNotification(guildId, session.userId, sessionDuration);
          }

          // Check for inactive users in voice channels
          const member = guild.members.cache.get(session.userId);
          if (member && !member.voice.channel && sessionDuration > gracePeriod) {
            this.logger.info(`User ${session.userId} not in voice channel but has active session`);
            // This will be handled by the scheduled punishment checks
          }
        }
      }
    } catch (error) {
      this.logger.error('Error monitoring active sessions:', error);
    }
  }

  /**
   * Send suspicious activity notification
   */
  private async sendSuspiciousActivityNotification(
    guildId: string,
    userId: string,
    duration: number
  ): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }

      const user = await this.client.users.fetch(userId);
      const hours = Math.round(duration / (60 * 60 * 1000));

      const embed = new EmbedBuilder()
        .setTitle('🚨 Atividade Suspeita Detectada')
        .setDescription('Sessão de presença anormalmente longa detectada.')
        .setColor(0xff6b00)
        .addFields(
          {
            name: '👤 Usuário',
            value: `${user.displayName} (${user.id})`,
            inline: true,
          },
          {
            name: '⏰ Duração da Sessão',
            value: `${hours} horas`,
            inline: true,
          },
          {
            name: '🔍 Ação Recomendada',
            value: 'Verificar se o usuário esqueceu de fazer checkout',
            inline: false,
          }
        )
        .setTimestamp();

      // Try to find admin/log channel
      const logChannel = guild.channels.cache.find(
        ch => ch.name.includes('log') || ch.name.includes('admin')
      ) as TextChannel;

      if (logChannel) {
        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      this.logger.error('Failed to send suspicious activity notification:', error);
    }
  }

  /**
   * Log enhancement activity
   */
  private async logEnhancement(enhancement: PresenceEnhancement): Promise<void> {
    try {
      if (!this.enhancements.has(enhancement.userId)) {
        this.enhancements.set(enhancement.userId, []);
      }

      this.enhancements.get(enhancement.userId)!.push(enhancement);

      // Store in database when schema is ready
      // await this.database.client.presenceEnhancement.create({ data: enhancement });

      this.logger.info(`Enhancement logged: ${enhancement.type} for user ${enhancement.userId}`);
    } catch (error) {
      this.logger.error('Failed to log enhancement:', error);
    }
  }

  /**
   * Get user enhancements
   */
  public getUserEnhancements(userId: string): PresenceEnhancement[] {
    return this.enhancements.get(userId) || [];
  }

  /**
   * Get PUBG validation for user
   */
  public getPUBGValidation(userId: string): PUBGPresenceValidation | null {
    return this.pubgValidations.get(userId) || null;
  }

  /**
   * Update auto punishment configuration
   */
  public updateAutoPunishmentConfig(config: Partial<AutoPunishmentConfig>): void {
    this.autoPunishmentConfig = { ...this.autoPunishmentConfig, ...config };
    this.logger.info('Auto punishment configuration updated:', this.autoPunishmentConfig);
  }

  /**
   * Get enhancement statistics
   */
  public getEnhancementStats(): {
    totalEnhancements: number;
    successfulEnhancements: number;
    failedEnhancements: number;
    pubgValidations: number;
    validPubgUsers: number;
    autoPunishments: number;
  } {
    let totalEnhancements = 0;
    let successfulEnhancements = 0;
    let failedEnhancements = 0;
    let autoPunishments = 0;

    for (const userEnhancements of this.enhancements.values()) {
      for (const enhancement of userEnhancements) {
        totalEnhancements++;
        if (enhancement.success) {
          successfulEnhancements++;
        } else {
          failedEnhancements++;
        }

        if (enhancement.type === 'auto_punishment') {
          autoPunishments++;
        }
      }
    }

    const pubgValidations = this.pubgValidations.size;
    const validPubgUsers = Array.from(this.pubgValidations.values()).filter(v => v.isValid).length;

    return {
      totalEnhancements,
      successfulEnhancements,
      failedEnhancements,
      pubgValidations,
      validPubgUsers,
      autoPunishments,
    };
  }

  /**
   * Clear old enhancements (cleanup)
   */
  public async clearOldEnhancements(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    let cleared = 0;

    for (const [userId, userEnhancements] of this.enhancements.entries()) {
      const filtered = userEnhancements.filter(e => e.appliedAt > cutoffDate);
      cleared += userEnhancements.length - filtered.length;

      if (filtered.length === 0) {
        this.enhancements.delete(userId);
      } else {
        this.enhancements.set(userId, filtered);
      }
    }

    this.logger.info(`Cleared ${cleared} old enhancements (older than ${olderThanDays} days)`);
    return cleared;
  }

  /**
   * Log events to Discord channel
   */
  private async logToChannel(title: string, data: any): Promise<void> {
    try {
      const logChannelId = process.env.LOGS_API_CHANNEL_ID;
      if (!logChannelId) {
        this.logger.warn('LOGS_API_CHANNEL_ID not configured');
        return;
      }

      const channel = (await this.client.channels.fetch(logChannelId)) as TextChannel;
      if (!channel) {
        this.logger.warn(`Log channel ${logChannelId} not found`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setTimestamp()
        .setColor(
          data.status === 'Success' ? '#00FF00' : data.status === 'Warning' ? '#FFA500' : '#FF0000'
        );

      // Add fields based on data
      if (data.event) {
        embed.addFields({ name: 'Event', value: data.event, inline: true });
      }
      if (data.status) {
        embed.addFields({ name: 'Status', value: data.status, inline: true });
      }
      if (data.userId) {
        embed.addFields({ name: 'User ID', value: data.userId, inline: true });
      }
      if (data.pubgName) {
        embed.addFields({ name: 'PUBG Name', value: data.pubgName, inline: true });
      }
      if (data.playerId) {
        embed.addFields({ name: 'Player ID', value: data.playerId, inline: true });
      }
      if (data.platform) {
        embed.addFields({ name: 'Platform', value: data.platform, inline: true });
      }
      if (data.message) {
        embed.addFields({ name: 'Message', value: data.message, inline: false });
      }
      if (data.error) {
        embed.addFields({ name: 'Error', value: `\`\`\`${data.error}\`\`\``, inline: false });
      }

      if (data.details) {
        embed.addFields({
          name: 'Details',
          value: `\`\`\`json\n${JSON.stringify(data.details, null, 2)}\`\`\``,
          inline: false,
        });
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Failed to log to Discord channel:', error);
    }
  }
}
