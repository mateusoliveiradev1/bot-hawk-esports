import { Logger } from '../utils/logger';
import { ExtendedClient } from '../types/client';
import { BadgeService } from './badge.service';
import { GuildMember, User, EmbedBuilder, TextChannel } from 'discord.js';

export interface ExclusiveBadgeRule {
  badgeId: string;
  criteria: {
    type: 'join_date' | 'user_id' | 'role' | 'manual' | 'member_count';
    value?: any;
    maxCount?: number; // For limited badges like early adopter
  };
  autoCheck: boolean;
  priority: number; // Higher priority badges are checked first
}

export interface FounderConfig {
  userId: string;
  guildId: string;
  notificationChannelId?: string;
}

/**
 * Service for managing exclusive badges with automatic verification
 */
export class ExclusiveBadgeService {
  private logger: Logger;
  private client: ExtendedClient;
  private badgeService: BadgeService;

  private exclusiveRules: Map<string, ExclusiveBadgeRule> = new Map();
  private founderConfig: FounderConfig | null = null;

  // Cache for performance
  private earlyAdopterCache: Set<string> = new Set();
  private lastEarlyAdopterCheck = 0;
  private readonly CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

  constructor(client: ExtendedClient, badgeService: BadgeService) {
    this.logger = new Logger();
    this.client = client;
    this.badgeService = badgeService;

    this.initializeRules();
    this.loadFounderConfig();
    this.startAutomaticChecks();
  }

  /**
   * Initialize exclusive badge rules
   */
  private initializeRules(): void {
    // Founder badge - only for specific user
    this.exclusiveRules.set('founder', {
      badgeId: 'founder',
      criteria: {
        type: 'user_id',
        value: process.env.FOUNDER_USER_ID,
      },
      autoCheck: true,
      priority: 1,
    });

    // Early adopter - first 100 members
    this.exclusiveRules.set('early_adopter', {
      badgeId: 'early_adopter',
      criteria: {
        type: 'member_count',
        maxCount: 100,
      },
      autoCheck: true,
      priority: 2,
    });

    // Beta tester - manually awarded
    this.exclusiveRules.set('beta_tester', {
      badgeId: 'beta_tester',
      criteria: {
        type: 'manual',
      },
      autoCheck: false,
      priority: 3,
    });
  }

  /**
   * Load founder configuration from environment
   */
  private loadFounderConfig(): void {
    const founderId = process.env.FOUNDER_USER_ID;
    const guildId = process.env.GUILD_ID;
    const notificationChannelId = process.env.FOUNDER_NOTIFICATION_CHANNEL;

    if (founderId && guildId) {
      this.founderConfig = {
        userId: founderId,
        guildId: guildId,
        notificationChannelId: notificationChannelId,
      };
    }
  }

  /**
   * Start automatic verification checks
   */
  private startAutomaticChecks(): void {
    // Check every hour
    setInterval(
      async () => {
        await this.runAutomaticVerification();
      },
      1000 * 60 * 60,
    );

    // Initial check after 30 seconds
    setTimeout(async () => {
      await this.runAutomaticVerification();
    }, 30000);
  }

  /**
   * Run automatic verification for all eligible badges
   */
  public async runAutomaticVerification(): Promise<{
    checked: number;
    awarded: number;
    errors: string[];
  }> {
    const results = {
      checked: 0,
      awarded: 0,
      errors: [] as string[],
    };

    try {
      // Sort rules by priority
      const sortedRules = Array.from(this.exclusiveRules.values())
        .filter(rule => rule.autoCheck)
        .sort((a, b) => a.priority - b.priority);

      for (const rule of sortedRules) {
        try {
          results.checked++;
          const awarded = await this.checkAndAwardBadge(rule);
          results.awarded += awarded;
        } catch (error) {
          const errorMsg = `Error checking ${rule.badgeId}: ${error}`;
          this.logger.error(errorMsg);
          results.errors.push(errorMsg);
        }
      }

      this.logger.info(`Automatic verification completed: ${results.awarded} badges awarded`);
    } catch (error) {
      this.logger.error('Error in automatic verification:', error);
      results.errors.push(`General error: ${error}`);
    }

    return results;
  }

  /**
   * Check and award badge based on rule
   */
  private async checkAndAwardBadge(rule: ExclusiveBadgeRule): Promise<number> {
    let awardedCount = 0;

    switch (rule.criteria.type) {
      case 'user_id':
        awardedCount = await this.checkFounderBadge(rule);
        break;
      case 'member_count':
        awardedCount = await this.checkEarlyAdopterBadge(rule);
        break;
      default:
        this.logger.warn(`Unknown criteria type: ${rule.criteria.type}`);
    }

    return awardedCount;
  }

  /**
   * Check and award founder badge
   */
  private async checkFounderBadge(rule: ExclusiveBadgeRule): Promise<number> {
    if (!this.founderConfig || !rule.criteria.value) {
      return 0;
    }

    const founderId = rule.criteria.value;

    // Check if founder already has the badge
    if (this.badgeService.hasBadge(founderId, 'founder')) {
      return 0;
    }

    // Award founder badge
    const awarded = await this.badgeService.awardBadge(founderId, 'founder', true);

    if (awarded) {
      await this.sendFounderNotification(founderId);
      this.logger.info(`Founder badge awarded to ${founderId}`);
      return 1;
    }

    return 0;
  }

  /**
   * Check and award early adopter badges
   */
  private async checkEarlyAdopterBadge(rule: ExclusiveBadgeRule): Promise<number> {
    const now = Date.now();

    // Use cache if recent
    if (now - this.lastEarlyAdopterCheck < this.CACHE_DURATION && this.earlyAdopterCache.size > 0) {
      return 0;
    }

    let awardedCount = 0;
    const maxCount = rule.criteria.maxCount || 100;

    try {
      // Get all guilds the bot is in
      for (const [guildId, guild] of this.client.guilds.cache) {
        try {
          // Check if guild is available and accessible
          if (!guild.available) {
            this.logger.debug(`Guild ${guildId} is not available, skipping`);
            continue;
          }

          // Fetch all members with error handling
          const members = await guild.members.fetch().catch(err => {
            this.logger.warn(`Failed to fetch members for guild ${guildId}: ${err.message}`);
            return new Map();
          });

          if (members.size === 0) {
            this.logger.debug(`No members found in guild ${guildId}`);
            continue;
          }

          // Filter and sort by join date
          const eligibleMembers = Array.from(members.values())
            .filter(member => !member.user.bot && member.joinedTimestamp)
            .sort((a, b) => (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0))
            .slice(0, maxCount);

          // Award badges to eligible members who don't have it
          for (const member of eligibleMembers) {
            try {
              if (!this.badgeService.hasBadge(member.id, 'early_adopter')) {
                const awarded = await this.badgeService.awardBadge(member.id, 'early_adopter', false);
                if (awarded) {
                  awardedCount++;
                  this.earlyAdopterCache.add(member.id);

                  // Send notification with error handling
                  await this.sendEarlyAdopterNotification(member).catch(err => {
                    this.logger.warn(`Failed to send early adopter notification to ${member.id}: ${err.message}`);
                  });
                }
              } else {
                this.earlyAdopterCache.add(member.id);
              }
            } catch (memberError) {
              this.logger.warn(`Error processing member ${member.id} in guild ${guildId}: ${memberError.message}`);
            }
          }
        } catch (error) {
          this.logger.warn(`Error processing guild ${guildId}: ${error.message}`);
        }
      }

      this.lastEarlyAdopterCheck = now;
    } catch (error) {
      this.logger.error('Error in early adopter check:', error);
    }

    return awardedCount;
  }

  /**
   * Manually award beta tester badge
   */
  public async awardBetaTesterBadge(userId: string, awardedBy: string): Promise<boolean> {
    try {
      // Check if user already has the badge
      if (this.badgeService.hasBadge(userId, 'beta_tester')) {
        return false;
      }

      // Award the badge
      const awarded = await this.badgeService.awardBadge(userId, 'beta_tester', true);

      if (awarded) {
        // Log the manual award
        await this.logManualAward(userId, 'beta_tester', awardedBy);
        this.logger.info(`Beta tester badge manually awarded to ${userId} by ${awardedBy}`);
      }

      return awarded;
    } catch (error) {
      this.logger.error('Error awarding beta tester badge:', error);
      return false;
    }
  }

  /**
   * Verify all exclusive badges for a specific user
   */
  public async verifyUserExclusiveBadges(userId: string): Promise<{
    eligible: string[];
    awarded: string[];
    errors: string[];
  }> {
    const results = {
      eligible: [] as string[],
      awarded: [] as string[],
      errors: [] as string[],
    };

    try {
      for (const [badgeId, rule] of this.exclusiveRules) {
        try {
          const isEligible = await this.checkUserEligibility(userId, rule);

          if (isEligible) {
            results.eligible.push(badgeId);

            if (!this.badgeService.hasBadge(userId, badgeId)) {
              const awarded = await this.badgeService.awardBadge(userId, badgeId, true);
              if (awarded) {
                results.awarded.push(badgeId);
              }
            }
          }
        } catch (error) {
          results.errors.push(`Error checking ${badgeId}: ${error}`);
        }
      }
    } catch (error) {
      results.errors.push(`General error: ${error}`);
    }

    return results;
  }

  /**
   * Check if user is eligible for a specific exclusive badge
   */
  private async checkUserEligibility(userId: string, rule: ExclusiveBadgeRule): Promise<boolean> {
    switch (rule.criteria.type) {
      case 'user_id':
        return userId === rule.criteria.value;

      case 'member_count':
        // Check if user is in the first N members of any guild
        for (const [guildId, guild] of this.client.guilds.cache) {
          try {
            const member = guild.members.cache.get(userId);
            if (!member) {
              continue;
            }

            const members = await guild.members.fetch();
            const sortedMembers = members
              .filter(m => !m.user.bot)
              .sort((a, b) => (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0))
              .first(rule.criteria.maxCount || 100);

            if (sortedMembers.some(member => member.id === userId)) {
              return true;
            }
          } catch (error) {
            this.logger.error(`Error checking member eligibility in guild ${guildId}:`, error);
          }
        }
        return false;

      case 'manual':
        // Manual badges are not auto-eligible
        return false;

      default:
        return false;
    }
  }

  /**
   * Send founder notification
   */
  private async sendFounderNotification(founderId: string): Promise<void> {
    try {
      if (!this.founderConfig?.notificationChannelId) {
        return;
      }

      const channel = this.client.channels.cache.get(
        this.founderConfig.notificationChannelId,
      ) as TextChannel;
      if (!channel) {
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('👑 Badge Fundador Concedida!')
        .setDescription(`<@${founderId}> recebeu a badge exclusiva de **Fundador**!`)
        .addFields(
          { name: '🎁 Recompensas', value: '5000 XP\n2500 Moedas\nCargo Fundador', inline: true },
          { name: '⭐ Raridade', value: 'Mítica (Única)', inline: true },
        )
        .setColor('#FFD700')
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error sending founder notification:', error);
    }
  }

  /**
   * Send early adopter notification
   */
  private async sendEarlyAdopterNotification(member: GuildMember): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🌟 Badge Pioneiro Concedida!')
        .setDescription('Parabéns! Você está entre os primeiros 100 membros da comunidade!')
        .addFields(
          { name: '🎁 Recompensas', value: '2000 XP\n1000 Moedas\nCargo Pioneiro', inline: true },
          { name: '⭐ Raridade', value: 'Lendária', inline: true },
        )
        .setColor('#FF1493')
        .setTimestamp();

      // Try to send DM first, fallback to guild channel
      try {
        await member.send({ embeds: [embed] });
      } catch {
        // If DM fails, try to find a general channel
        const generalChannel = member.guild.channels.cache
          .filter(ch => ch.isTextBased())
          .find(ch => ch.name.includes('geral') || ch.name.includes('general')) as TextChannel;

        if (generalChannel) {
          await generalChannel.send({
            content: `<@${member.id}>`,
            embeds: [embed],
          });
        }
      }
    } catch (error) {
      this.logger.error('Error sending early adopter notification:', error);
    }
  }

  /**
   * Log manual badge awards
   */
  private async logManualAward(userId: string, badgeId: string, awardedBy: string): Promise<void> {
    try {
      // Log manual badge grant (using badge service audit if available)
      try {
        const auditService = (this.client as any).badgeAuditService;
        if (auditService) {
          await auditService.logBadgeGrant(userId, badgeId, 'manual_exclusive', {
            grantedBy: awardedBy,
            reason: 'Manual exclusive badge grant',
          });
        }
      } catch (error) {
        console.warn('Failed to log badge audit:', error);
      }

      // Alternative: create a simple log entry
      /* await this.client.database.client.badgeAudit.create({
        data: {
          userId,
          badgeId,
          action: 'MANUAL_AWARD',
          performedBy: awardedBy,
          details: JSON.stringify({ type: 'exclusive_badge', manual: true }),
          timestamp: new Date()
        }
      }); */
    } catch (error) {
      this.logger.error('Error logging manual award:', error);
    }
  }

  /**
   * Get exclusive badge statistics
   */
  public async getExclusiveBadgeStats(): Promise<{
    founder: { holders: number; eligible: number };
    earlyAdopter: { holders: number; maxCount: number };
    betaTester: { holders: number };
    totalExclusive: number;
  }> {
    try {
      const stats = {
        founder: { holders: 0, eligible: 1 },
        earlyAdopter: { holders: 0, maxCount: 100 },
        betaTester: { holders: 0 },
        totalExclusive: 0,
      };

      // Count badge holders
      const founderHolders = await this.client.database.client.userBadge.count({
        where: { badgeId: 'founder' },
      });

      const earlyAdopterHolders = await this.client.database.client.userBadge.count({
        where: { badgeId: 'early_adopter' },
      });

      const betaTesterHolders = await this.client.database.client.userBadge.count({
        where: { badgeId: 'beta_tester' },
      });

      stats.founder.holders = founderHolders;
      stats.earlyAdopter.holders = earlyAdopterHolders;
      stats.betaTester.holders = betaTesterHolders;
      stats.totalExclusive = founderHolders + earlyAdopterHolders + betaTesterHolders;

      return stats;
    } catch (error) {
      this.logger.error('Error getting exclusive badge stats:', error);
      return {
        founder: { holders: 0, eligible: 1 },
        earlyAdopter: { holders: 0, maxCount: 100 },
        betaTester: { holders: 0 },
        totalExclusive: 0,
      };
    }
  }

  /**
   * Remove unauthorized exclusive badges
   */
  public async removeUnauthorizedBadges(): Promise<{
    removed: number;
    errors: string[];
  }> {
    const results = {
      removed: 0,
      errors: [] as string[],
    };

    try {
      // Remove unauthorized founder badges
      if (this.founderConfig) {
        const unauthorizedFounders = await this.client.database.client.userBadge.findMany({
          where: {
            badgeId: 'founder',
            userId: { not: this.founderConfig.userId },
          },
        });

        for (const badge of unauthorizedFounders) {
          try {
            await this.client.database.client.userBadge.delete({
              where: {
                userId_badgeId: {
                  userId: badge.userId,
                  badgeId: badge.badgeId,
                },
              },
            });
            results.removed++;
          } catch (error) {
            results.errors.push(`Error removing founder badge from ${badge.userId}: ${error}`);
          }
        }
      }

      this.logger.info(`Removed ${results.removed} unauthorized exclusive badges`);
    } catch (error) {
      this.logger.error('Error removing unauthorized badges:', error);
      results.errors.push(`General error: ${error}`);
    }

    return results;
  }
}
