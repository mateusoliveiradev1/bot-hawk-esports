import { Guild, Role, GuildMember, PermissionFlagsBits, ColorResolvable } from 'discord.js';
import { Logger } from '../utils/logger';
import { DEFAULT_ROLES, RoleConfig, CHANNEL_PERMISSIONS } from '../config/roles.config';

/**
 * Role Manager Service
 * Manages server roles and permissions
 */
export class RoleManagerService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Initialize roles in guild
   */
  async initializeGuildRoles(guild: Guild): Promise<void> {
    try {
      this.logger.info(`Initializing roles for guild: ${guild.name}`);

      for (const [key, roleConfig] of Object.entries(DEFAULT_ROLES)) {
        await this.ensureRoleExists(guild, roleConfig);
      }

      this.logger.info(`Successfully initialized roles for guild: ${guild.name}`);
    } catch (error) {
      this.logger.error(`Failed to initialize roles for guild ${guild.name}:`, error);
    }
  }

  /**
   * Ensure role exists in guild
   */
  private async ensureRoleExists(guild: Guild, roleConfig: RoleConfig): Promise<Role | null> {
    try {
      // Check if role already exists
      let role = guild.roles.cache.find(r => r.name === roleConfig.name);

      if (!role) {
        // Create the role
        role = await guild.roles.create({
          name: roleConfig.name,
          color: roleConfig.color as ColorResolvable,
          permissions: roleConfig.permissions,
          hoist: roleConfig.hoist || false,
          mentionable: roleConfig.mentionable || false,
        });

        this.logger.info(`Created role: ${roleConfig.name}`);
      } else {
        // Update existing role if needed
        const needsUpdate =
          role.color !== parseInt(roleConfig.color?.replace('#', '') || '0', 16) ||
          role.hoist !== (roleConfig.hoist || false) ||
          role.mentionable !== (roleConfig.mentionable || false);

        if (needsUpdate) {
          await role.edit({
            color: roleConfig.color as ColorResolvable,
            hoist: roleConfig.hoist || false,
            mentionable: roleConfig.mentionable || false,
          });

          this.logger.info(`Updated role: ${roleConfig.name}`);
        }
      }

      return role;
    } catch (error) {
      this.logger.error(`Failed to ensure role exists: ${roleConfig.name}`, error);
      return null;
    }
  }

  /**
   * Add new member role to user
   */
  async addNewMemberRole(member: GuildMember): Promise<boolean> {
    try {
      const newMemberRole = member.guild.roles.cache.find(
        role => role.name === DEFAULT_ROLES.NEW_MEMBER?.name,
      );

      if (!newMemberRole) {
        // Try to create the role if it doesn't exist
        if (DEFAULT_ROLES.NEW_MEMBER) {
          const createdRole = await this.ensureRoleExists(member.guild, DEFAULT_ROLES.NEW_MEMBER);
          if (createdRole) {
            await member.roles.add(createdRole);
            this.logger.info(`Added new member role to ${member.user.tag}`);
            return true;
          }
        }
        return false;
      }

      await member.roles.add(newMemberRole);
      this.logger.info(`Added new member role to ${member.user.tag}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to add new member role to ${member.user.tag}:`, error);
      return false;
    }
  }

  /**
   * Promote member from new member to verified
   */
  async promoteToVerified(member: GuildMember): Promise<boolean> {
    try {
      const newMemberRole = member.guild.roles.cache.find(
        role => role.name === DEFAULT_ROLES.NEW_MEMBER?.name,
      );
      const verifiedRole = member.guild.roles.cache.find(
        role => role.name === DEFAULT_ROLES.VERIFIED_MEMBER?.name,
      );

      if (!verifiedRole) {
        if (DEFAULT_ROLES.VERIFIED_MEMBER) {
          const createdRole = await this.ensureRoleExists(
            member.guild,
            DEFAULT_ROLES.VERIFIED_MEMBER,
          );
          if (!createdRole) {
            return false;
          }
        } else {
          return false;
        }
      }

      // Remove new member role and add verified role
      const rolesToAdd = [verifiedRole!];
      const rolesToRemove = newMemberRole ? [newMemberRole] : [];

      if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove);
      }
      await member.roles.add(rolesToAdd);

      this.logger.info(`Promoted ${member.user.tag} to verified member`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to promote ${member.user.tag} to verified:`, error);
      return false;
    }
  }

  /**
   * Setup channel permissions for new members
   */
  async setupChannelPermissions(guild: Guild): Promise<void> {
    try {
      const newMemberRole = guild.roles.cache.find(
        role => role.name === DEFAULT_ROLES.NEW_MEMBER?.name,
      );

      if (!newMemberRole) {
        this.logger.warn(`New member role not found in guild ${guild.name}`);
        return;
      }

      // Find general channel
      const generalChannel = guild.channels.cache.find(
        channel =>
          channel.name.toLowerCase().includes('geral') ||
          channel.name.toLowerCase().includes('general') ||
          channel.name.toLowerCase().includes('chat'),
      );

      if (
        generalChannel &&
        generalChannel.isTextBased() &&
        'permissionOverwrites' in generalChannel
      ) {
        await generalChannel.permissionOverwrites.edit(newMemberRole, CHANNEL_PERMISSIONS.GENERAL);
        this.logger.info('Setup general channel permissions for new members');
      }

      // Find welcome channel
      const welcomeChannel = guild.channels.cache.find(
        channel =>
          channel.name.toLowerCase().includes('welcome') ||
          channel.name.toLowerCase().includes('bem-vindo'),
      );

      if (
        welcomeChannel &&
        welcomeChannel.isTextBased() &&
        'permissionOverwrites' in welcomeChannel
      ) {
        await welcomeChannel.permissionOverwrites.edit(newMemberRole, CHANNEL_PERMISSIONS.WELCOME);
        this.logger.info('Setup welcome channel permissions for new members');
      }

      // Find rules channel
      const rulesChannel = guild.channels.cache.find(
        channel =>
          channel.name.toLowerCase().includes('rules') ||
          channel.name.toLowerCase().includes('regras'),
      );

      if (rulesChannel && rulesChannel.isTextBased() && 'permissionOverwrites' in rulesChannel) {
        await rulesChannel.permissionOverwrites.edit(newMemberRole, CHANNEL_PERMISSIONS.RULES);
        this.logger.info('Setup rules channel permissions for new members');
      }
    } catch (error) {
      this.logger.error(`Failed to setup channel permissions for guild ${guild.name}:`, error);
    }
  }

  /**
   * Get member's highest role level
   */
  getMemberRoleLevel(member: GuildMember): number {
    const roleHierarchy = [
      DEFAULT_ROLES.NEW_MEMBER?.name,
      DEFAULT_ROLES.VERIFIED_MEMBER?.name,
      DEFAULT_ROLES.BASIC_MEMBER?.name,
    ].filter(Boolean);

    for (let i = roleHierarchy.length - 1; i >= 0; i--) {
      if (member.roles.cache.some(role => role.name === roleHierarchy[i])) {
        return i + 1;
      }
    }

    return 0;
  }

  /**
   * Check if member has minimum role level
   */
  hasMinimumRoleLevel(member: GuildMember, minLevel: number): boolean {
    return this.getMemberRoleLevel(member) >= minLevel;
  }
}
