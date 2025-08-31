import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { ExtendedClient } from '../types/client';
import { EmbedBuilder, TextChannel, User } from 'discord.js';
import {
  PUNISHMENT_CONFIG,
  PunishmentRecord,
  UserWarning,
  getPunishmentConfig,
  calculateEscalatedPenalty,
  shouldEscalatePunishment,
  formatPunishmentReason,
} from '../config/punishment.config';

export interface PunishmentOptions {
  sessionId?: string;
  channelId?: string;
  reason?: string;
  appealable?: boolean;
}

/**
 * Punishment Service for managing user penalties and warnings
 */
export class PunishmentService {
  private logger: Logger;
  private database: DatabaseService;
  private client: ExtendedClient;
  private warnings: Map<string, UserWarning[]> = new Map(); // userId -> warnings
  private punishments: Map<string, PunishmentRecord[]> = new Map(); // userId -> punishments

  constructor(client: ExtendedClient, database: DatabaseService) {
    this.client = client;
    this.database = database;
    this.logger = new Logger();
    this.loadWarningsAndPunishments();
  }

  /**
   * Load existing warnings and punishments from database
   */
  private async loadWarningsAndPunishments(): Promise<void> {
    try {
      // Load warnings (implement when database schema is ready)
      // const warnings = await this.database.client.userWarning.findMany({
      //   where: { active: true }
      // });

      // Load punishments (implement when database schema is ready)
      // const punishments = await this.database.client.punishmentRecord.findMany({
      //   orderBy: { timestamp: 'desc' }
      // });

      this.logger.info('Loaded punishment system data');
    } catch (error) {
      this.logger.error('Failed to load punishment data:', error);
    }
  }

  /**
   * Apply punishment to a user
   */
  public async applyPunishment(
    userId: string,
    guildId: string,
    type: 'no_checkout' | 'no_show_up' | 'early_leave',
    options: PunishmentOptions = {},
  ): Promise<PunishmentRecord | null> {
    try {
      if (!PUNISHMENT_CONFIG.enabled) {
        this.logger.info(`Punishment system disabled, skipping punishment for ${userId}`);
        return null;
      }

      // Get user's current warnings
      const userWarnings = await this.getActiveWarnings(userId, guildId);
      const warningCount = userWarnings.length;

      // Determine if escalation is needed
      const shouldEscalate = shouldEscalatePunishment(warningCount);
      const penaltyConfig = getPunishmentConfig(type);

      let finalPenalty = {
        xp: penaltyConfig.xpPenalty,
        coins: penaltyConfig.coinsPenalty,
        rankPoints: penaltyConfig.rankPointsPenalty,
      };

      let punishmentType: PunishmentRecord['type'] = type;
      let reason = formatPunishmentReason(type, options.reason);

      // Apply escalation if needed
      if (shouldEscalate) {
        const escalatedPenalty = calculateEscalatedPenalty(warningCount);
        finalPenalty = {
          xp: finalPenalty.xp + escalatedPenalty.xp,
          coins: finalPenalty.coins + escalatedPenalty.coins,
          rankPoints: finalPenalty.rankPoints + escalatedPenalty.rankPoints,
        };
        punishmentType = 'warning_escalation';
        reason = `${reason} (Escalated: ${warningCount} warnings)`;
      }

      // Apply penalties to user
      await this.database.client.user.update({
        where: { id: userId },
        data: {
          xp: { decrement: finalPenalty.xp },
          coins: { decrement: finalPenalty.coins },
          // rankPoints would need to be added to user schema
        },
      });

      // Create punishment record
      const punishmentRecord: PunishmentRecord = {
        id: `punishment_${Date.now()}_${userId}`,
        userId,
        guildId,
        type: punishmentType,
        penalty: finalPenalty,
        reason,
        sessionId: options.sessionId,
        channelId: options.channelId,
        timestamp: new Date(),
        appealable: options.appealable ?? true,
        appealed: false,
      };

      // Store punishment record (implement when database schema is ready)
      // await this.database.client.punishmentRecord.create({
      //   data: punishmentRecord
      // });

      // Add to memory cache
      if (!this.punishments.has(userId)) {
        this.punishments.set(userId, []);
      }
      this.punishments.get(userId)!.push(punishmentRecord);

      // Add warning if not escalated
      if (!shouldEscalate) {
        await this.addWarning(userId, guildId, type, reason);
      } else {
        // Clear warnings after escalation
        await this.clearWarnings(userId, guildId);
      }

      // Send notification
      await this.sendPunishmentNotification(userId, guildId, punishmentRecord);

      this.logger.info(
        `Applied punishment to user ${userId}: ${type} (${finalPenalty.xp} XP, ${finalPenalty.coins} coins)`,
      );
      return punishmentRecord;
    } catch (error) {
      this.logger.error(`Failed to apply punishment to user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Add warning to user
   */
  private async addWarning(
    userId: string,
    guildId: string,
    type: 'no_checkout' | 'no_show_up' | 'early_leave',
    reason: string,
  ): Promise<void> {
    const warning: UserWarning = {
      id: `warning_${Date.now()}_${userId}`,
      userId,
      guildId,
      type,
      reason,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + PUNISHMENT_CONFIG.warnings.warningDuration * 60 * 60 * 1000),
      active: true,
    };

    // Store warning (implement when database schema is ready)
    // await this.database.client.userWarning.create({
    //   data: warning
    // });

    // Add to memory cache
    if (!this.warnings.has(userId)) {
      this.warnings.set(userId, []);
    }
    this.warnings.get(userId)!.push(warning);
  }

  /**
   * Get active warnings for user
   */
  private async getActiveWarnings(userId: string, guildId: string): Promise<UserWarning[]> {
    const now = new Date();
    const userWarnings = this.warnings.get(userId) || [];

    // Filter active and non-expired warnings
    return userWarnings.filter(
      warning => warning.active && warning.guildId === guildId && warning.expiresAt > now,
    );
  }

  /**
   * Clear all warnings for user
   */
  private async clearWarnings(userId: string, guildId: string): Promise<void> {
    const userWarnings = this.warnings.get(userId) || [];

    // Mark warnings as inactive
    userWarnings.forEach(warning => {
      if (warning.guildId === guildId) {
        warning.active = false;
      }
    });

    // Update in database (implement when schema is ready)
    // await this.database.client.userWarning.updateMany({
    //   where: { userId, guildId, active: true },
    //   data: { active: false }
    // });
  }

  /**
   * Send punishment notification to user
   */
  private async sendPunishmentNotification(
    userId: string,
    guildId: string,
    punishment: PunishmentRecord,
  ): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }

      const user = await this.client.users.fetch(userId);
      if (!user) {
        return;
      }

      // Create punishment notification embed
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Penalidade Aplicada')
        .setDescription(
          `Você recebeu uma penalidade no servidor **${guild.name}**.\n\n` +
            `**Motivo:** ${punishment.reason}\n` +
            '**Penalidades:**\n' +
            `• -${punishment.penalty.xp} XP\n` +
            `• -${punishment.penalty.coins} Moedas\n` +
            `• -${punishment.penalty.rankPoints} Pontos de Ranking\n\n` +
            `**Data:** <t:${Math.floor(punishment.timestamp.getTime() / 1000)}:F>\n\n` +
            (punishment.appealable
              ? '💡 **Recurso:** Você pode contestar esta penalidade usando `/appeal` dentro de 7 dias.'
              : '❌ **Esta penalidade não pode ser contestada.**'),
        )
        .setColor(0xff6b6b)
        .setTimestamp()
        .setFooter({ text: 'Sistema de Punições - Hawk Esports' });

      // Try to send DM first
      try {
        await user.send({ embeds: [embed] });
      } catch (dmError) {
        // If DM fails, try to send in a guild channel
        const logChannel = guild.channels.cache.find(
          ch => ch.name.includes('log') || ch.name.includes('punish'),
        ) as TextChannel;

        if (logChannel) {
          await logChannel.send({
            content: `<@${userId}>`,
            embeds: [embed],
          });
        }
      }

      // Also send to punishment log channel if exists
      const punishmentChannel = guild.channels.cache.find(
        ch => ch.name.includes('punishment') || ch.name.includes('penalidade'),
      ) as TextChannel;

      if (punishmentChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📋 Log de Penalidade')
          .setDescription(
            `**Usuário:** <@${userId}> (${user.username})\n` +
              `**Tipo:** ${punishment.type.replace('_', ' ').toUpperCase()}\n` +
              `**Motivo:** ${punishment.reason}\n` +
              `**Penalidades:** -${punishment.penalty.xp} XP, -${punishment.penalty.coins} moedas\n` +
              `**ID:** \`${punishment.id}\``,
          )
          .setColor(0xff9500)
          .setTimestamp();

        await punishmentChannel.send({ embeds: [logEmbed] });
      }
    } catch (error) {
      this.logger.error('Failed to send punishment notification:', error);
    }
  }

  /**
   * Get user's punishment history
   */
  public getUserPunishments(userId: string): PunishmentRecord[] {
    return this.punishments.get(userId) || [];
  }

  /**
   * Get user's active warnings
   */
  public async getUserWarnings(userId: string, guildId: string): Promise<UserWarning[]> {
    return await this.getActiveWarnings(userId, guildId);
  }

  /**
   * Check if user should be punished for no checkout
   */
  public async checkNoCheckoutPunishment(
    userId: string,
    guildId: string,
    sessionStartTime: Date,
    channelId?: string,
  ): Promise<void> {
    const timeoutHours = PUNISHMENT_CONFIG.timeouts.noCheckoutTimeout;
    const timeoutMs = timeoutHours * 60 * 60 * 1000;
    const now = new Date();

    if (now.getTime() - sessionStartTime.getTime() > timeoutMs) {
      await this.applyPunishment(userId, guildId, 'no_checkout', {
        reason: `Não fez check-out após ${timeoutHours} horas`,
        channelId,
      });
    }
  }

  /**
   * Check if user should be punished for not showing up
   */
  public async checkNoShowUpPunishment(
    userId: string,
    guildId: string,
    checkInTime: Date,
    voiceChannelId: string,
  ): Promise<void> {
    const timeoutHours = PUNISHMENT_CONFIG.timeouts.noShowUpTimeout;
    const timeoutMs = timeoutHours * 60 * 60 * 1000;
    const now = new Date();

    if (now.getTime() - checkInTime.getTime() > timeoutMs) {
      // Check if user ever joined the voice channel
      const guild = this.client.guilds.cache.get(guildId);
      const voiceChannel = guild?.channels.cache.get(voiceChannelId);

      if (voiceChannel && voiceChannel.isVoiceBased() && !voiceChannel.members.has(userId)) {
        await this.applyPunishment(userId, guildId, 'no_show_up', {
          reason: `Não compareceu à sessão após ${timeoutHours} hora(s)`,
          channelId: voiceChannelId,
        });
      }
    }
  }

  /**
   * Check if user left session too early
   */
  public async checkEarlyLeavePunishment(
    userId: string,
    guildId: string,
    sessionStartTime: Date,
    channelId?: string,
  ): Promise<void> {
    const minimumTimeHours = PUNISHMENT_CONFIG.timeouts.earlyLeaveTimeout;
    const minimumTimeMs = minimumTimeHours * 60 * 60 * 1000;
    const now = new Date();
    const sessionDuration = now.getTime() - sessionStartTime.getTime();

    if (sessionDuration < minimumTimeMs) {
      await this.applyPunishment(userId, guildId, 'early_leave', {
        reason: `Saiu da sessão após apenas ${Math.round(sessionDuration / (60 * 1000))} minutos`,
        channelId,
      });
    }
  }
}
