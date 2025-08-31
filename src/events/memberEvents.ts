import { GuildMember, PartialGuildMember } from 'discord.js';
import { ExtendedClient } from '../types/client';
import { Logger } from '../utils/logger';

/**
 * Handles Discord member-related events
 */
export class MemberEvents {
  private client: ExtendedClient;
  private logger: Logger;

  constructor(client: ExtendedClient) {
    this.client = client;
    this.logger = new Logger();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Handle new member joining
    this.client.on('guildMemberAdd', this.handleMemberJoin.bind(this));

    // Handle member leaving
    this.client.on('guildMemberRemove', this.handleMemberLeave.bind(this));

    // Handle member updates (role changes, nickname changes, etc.)
    this.client.on('guildMemberUpdate', this.handleMemberUpdate.bind(this));
  }

  /**
   * Handles when a new member joins a guild
   */
  private async handleMemberJoin(member: GuildMember): Promise<void> {
    try {
      this.logger.info(`👋 New member joined: ${member.user.tag} in ${member.guild.name}`);

      // Logging is handled automatically by LoggingService

      // Handle member onboarding through dedicated service
      if (this.client.services?.onboarding) {
        await this.client.services.onboarding.handleMemberJoin(member);
      } else {
        this.logger.warn('OnboardingService not available for member join handling');
      }
    } catch (error) {
      this.logger.error('Failed to handle new member join:', error);
    }
  }

  /**
   * Handles when a member leaves a guild
   */
  private async handleMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    try {
      this.logger.info(`👋 Member left: ${member.user?.tag} from ${member.guild.name}`);

      // Logging is handled automatically by LoggingService

      // Update user-guild relationship to mark as left
      if (this.client.db) {
        await this.client.db.client.userGuild.updateMany({
          where: {
            userId: member.id,
            guildId: member.guild.id,
          },
          data: {
            leftAt: new Date(),
          },
        });
      }

      // Log member leave statistics
      if (this.client.services?.onboarding) {
        const stats = await this.client.services.onboarding.getWelcomeStats(member.guild.id);
        this.logger.info(
          `Guild ${member.guild.name} stats - Total: ${stats.totalMembers}, Verified: ${stats.verifiedMembers}`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to handle member leave:', error);
    }
  }

  /**
   * Handles when a member is updated (roles, nickname, etc.)
   */
  private async handleMemberUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    try {
      // Detect changes
      const changes: any = {};

      // Check nickname changes
      if (oldMember.nickname !== newMember.nickname) {
        changes.nickname = {
          old: oldMember.nickname,
          new: newMember.nickname,
        };
      }

      // Check role changes
      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
      const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

      if (addedRoles.size > 0 || removedRoles.size > 0) {
        changes.roles = {
          added: addedRoles.map(role => ({ id: role.id, name: role.name, color: role.hexColor })),
          removed: removedRoles.map(role => ({
            id: role.id,
            name: role.name,
            color: role.hexColor,
          })),
        };
      }

      // Log member update if there are changes
      if (Object.keys(changes).length > 0 && this.client.services?.logging) {
        // Logging is handled automatically by LoggingService
      }

      // Check if verification status changed
      const verifiedRole = newMember.guild.roles.cache.find(role => role.name === '✅ Verificado');

      if (verifiedRole) {
        const wasVerified = oldMember.roles.cache.has(verifiedRole.id);
        const isVerified = newMember.roles.cache.has(verifiedRole.id);

        // If member just got verified
        if (!wasVerified && isVerified) {
          this.logger.info(`✅ Member verified: ${newMember.user.tag} in ${newMember.guild.name}`);

          // Update verification status in database
          if (this.client.db) {
            await this.client.db.client.user.upsert({
              where: { id: newMember.id },
              update: {
                isVerified: true,
                verifiedAt: new Date(),
              },
              create: {
                id: newMember.id,
                username: newMember.user.username,
                discriminator: newMember.user.discriminator,
                isVerified: true,
                verifiedAt: new Date(),
              },
            });
          }
        }

        // If member lost verification
        if (wasVerified && !isVerified) {
          this.logger.info(
            `❌ Member unverified: ${newMember.user.tag} in ${newMember.guild.name}`,
          );

          // Update verification status in database
          if (this.client.db) {
            await this.client.db.client.user.upsert({
              where: { id: newMember.id },
              update: {
                isVerified: false,
                verifiedAt: null,
              },
              create: {
                id: newMember.id,
                username: newMember.user.username,
                discriminator: newMember.user.discriminator,
                isVerified: false,
                verifiedAt: null,
              },
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to handle member update:', error);
    }
  }
}
