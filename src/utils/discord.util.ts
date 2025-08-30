import {
  Guild,
  GuildMember,
  TextChannel,
  VoiceChannel,
  CategoryChannel,
  PermissionFlagsBits,
  ChannelType,
  User,
  Role,
  GuildChannel,
  PermissionsBitField,
} from 'discord.js';
import { Logger } from './logger';

/**
 * Utility class for common Discord operations
 */
export class DiscordUtils {
  private static logger = new Logger();

  /**
   * Permission checks
   */
  static hasPermission(member: GuildMember, permission: bigint): boolean {
    return member.permissions.has(permission);
  }

  static hasAnyPermission(member: GuildMember, permissions: bigint[]): boolean {
    return permissions.some(permission => member.permissions.has(permission));
  }

  static hasAllPermissions(member: GuildMember, permissions: bigint[]): boolean {
    return permissions.every(permission => member.permissions.has(permission));
  }

  static isAdmin(member: GuildMember): boolean {
    return this.hasPermission(member, PermissionFlagsBits.Administrator);
  }

  static isModerator(member: GuildMember): boolean {
    return this.hasAnyPermission(member, [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageMessages,
    ]);
  }

  static canManageServer(member: GuildMember): boolean {
    return this.hasAnyPermission(member, [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
    ]);
  }

  /**
   * Channel operations
   */
  static async findChannel(
    guild: Guild,
    identifier: string,
    type?: ChannelType
  ): Promise<GuildChannel | null> {
    try {
      // Try by ID first
      let channel = guild.channels.cache.get(identifier);

      if (!channel) {
        // Try by name
        channel = guild.channels.cache.find(c => c.name.toLowerCase() === identifier.toLowerCase());
      }

      if (!channel) {
        // Try by mention format
        const mentionMatch = identifier.match(/^<#(\d+)>$/);
        if (mentionMatch && mentionMatch[1]) {
          channel = guild.channels.cache.get(mentionMatch[1]);
        }
      }

      // Check type if specified
      if (channel && type && channel.type !== type) {
        return null;
      }

      return channel && 'guild' in channel ? (channel as GuildChannel) : null;
    } catch (error) {
      this.logger.error(`Failed to find channel ${identifier}:`, error);
      return null;
    }
  }

  static async findTextChannel(guild: Guild, identifier: string): Promise<TextChannel | null> {
    const channel = await this.findChannel(guild, identifier, ChannelType.GuildText);
    return channel as TextChannel | null;
  }

  static async findVoiceChannel(guild: Guild, identifier: string): Promise<VoiceChannel | null> {
    const channel = await this.findChannel(guild, identifier, ChannelType.GuildVoice);
    return channel as VoiceChannel | null;
  }

  static async findCategory(guild: Guild, identifier: string): Promise<CategoryChannel | null> {
    const channel = await this.findChannel(guild, identifier, ChannelType.GuildCategory);
    return channel as CategoryChannel | null;
  }

  /**
   * Role operations
   */
  static async findRole(guild: Guild, identifier: string): Promise<Role | null> {
    try {
      // Try by ID first
      let role = guild.roles.cache.get(identifier);

      if (!role) {
        // Try by name
        role = guild.roles.cache.find(r => r.name.toLowerCase() === identifier.toLowerCase());
      }

      if (!role) {
        // Try by mention format
        const mentionMatch = identifier.match(/^<@&(\d+)>$/);
        if (mentionMatch && mentionMatch[1]) {
          role = guild.roles.cache.get(mentionMatch[1]);
        }
      }

      return role || null;
    } catch (error) {
      this.logger.error(`Failed to find role ${identifier}:`, error);
      return null;
    }
  }

  static async assignRole(
    member: GuildMember,
    role: Role | string,
    reason?: string
  ): Promise<boolean> {
    try {
      let roleObj: Role | null;

      if (typeof role === 'string') {
        roleObj = await this.findRole(member.guild, role);
        if (!roleObj) {
          this.logger.warn(`Role ${role} not found in guild ${member.guild.id}`);
          return false;
        }
      } else {
        roleObj = role;
      }

      if (member.roles.cache.has(roleObj.id)) {
        return true; // Already has role
      }

      await member.roles.add(roleObj, reason);
      return true;
    } catch (error) {
      this.logger.error(`Failed to assign role to ${member.id}:`, error);
      return false;
    }
  }

  static async removeRole(
    member: GuildMember,
    role: Role | string,
    reason?: string
  ): Promise<boolean> {
    try {
      let roleObj: Role | null;

      if (typeof role === 'string') {
        roleObj = await this.findRole(member.guild, role);
        if (!roleObj) {
          return true; // Role doesn't exist, consider it removed
        }
      } else {
        roleObj = role;
      }

      if (!member.roles.cache.has(roleObj.id)) {
        return true; // Doesn't have role
      }

      await member.roles.remove(roleObj, reason);
      return true;
    } catch (error) {
      this.logger.error(`Failed to remove role from ${member.id}:`, error);
      return false;
    }
  }

  /**
   * Member operations
   */
  static async findMember(guild: Guild, identifier: string): Promise<GuildMember | null> {
    try {
      // Try by ID first
      let member = guild.members.cache.get(identifier);

      if (!member) {
        // Try by username or display name
        member = guild.members.cache.find(
          m =>
            m.user.username.toLowerCase() === identifier.toLowerCase() ||
            m.displayName.toLowerCase() === identifier.toLowerCase()
        );
      }

      if (!member) {
        // Try by mention format
        const mentionMatch = identifier.match(/^<@!?(\d+)>$/);
        if (mentionMatch && mentionMatch[1]) {
          member = guild.members.cache.get(mentionMatch[1]);
        }
      }

      if (!member) {
        // Try to fetch from API
        try {
          member = await guild.members.fetch(identifier);
        } catch {
          // Ignore fetch errors
        }
      }

      return member || null;
    } catch (error) {
      this.logger.error(`Failed to find member ${identifier}:`, error);
      return null;
    }
  }

  static async kickMember(member: GuildMember, reason?: string): Promise<boolean> {
    try {
      await member.kick(reason);
      return true;
    } catch (error) {
      this.logger.error(`Failed to kick member ${member.id}:`, error);
      return false;
    }
  }

  static async banMember(
    member: GuildMember,
    reason?: string,
    deleteMessageDays?: number
  ): Promise<boolean> {
    try {
      await member.ban({
        reason,
        deleteMessageDays: deleteMessageDays || 0,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to ban member ${member.id}:`, error);
      return false;
    }
  }

  static async timeoutMember(
    member: GuildMember,
    duration: number,
    reason?: string
  ): Promise<boolean> {
    try {
      await member.timeout(duration, reason);
      return true;
    } catch (error) {
      this.logger.error(`Failed to timeout member ${member.id}:`, error);
      return false;
    }
  }

  /**
   * Message operations
   */
  static async bulkDeleteMessages(
    channel: TextChannel,
    amount: number,
    filterFn?: (msg: any) => boolean
  ): Promise<number> {
    try {
      const messages = await channel.messages.fetch({ limit: amount });
      let messagesToDelete = Array.from(messages.values());

      if (filterFn) {
        messagesToDelete = messagesToDelete.filter(filterFn);
      }

      // Discord only allows bulk delete for messages younger than 14 days
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const bulkDeleteMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);
      const individualDeleteMessages = messagesToDelete.filter(
        msg => msg.createdTimestamp <= twoWeeksAgo
      );

      let deletedCount = 0;

      // Bulk delete newer messages
      if (bulkDeleteMessages.length > 0) {
        const deleted = await channel.bulkDelete(bulkDeleteMessages, true);
        deletedCount += deleted.size;
      }

      // Individual delete older messages
      for (const message of individualDeleteMessages) {
        try {
          await message.delete();
          deletedCount++;
        } catch {
          // Ignore individual delete errors
        }
      }

      return deletedCount;
    } catch (error) {
      this.logger.error(`Failed to bulk delete messages in ${channel.id}:`, error);
      return 0;
    }
  }

  /**
   * Utility functions
   */
  static formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  static parseDuration(duration: string): number | null {
    const regex = /(\d+)([smhd])/g;
    let totalMs = 0;
    let match;

    while ((match = regex.exec(duration.toLowerCase())) !== null) {
      if (!match[1] || !match[2]) {
        continue;
      }
      const value = parseInt(match[1]);
      const unit = match[2];

      switch (unit) {
        case 's':
          totalMs += value * 1000;
          break;
        case 'm':
          totalMs += value * 60 * 1000;
          break;
        case 'h':
          totalMs += value * 60 * 60 * 1000;
          break;
        case 'd':
          totalMs += value * 24 * 60 * 60 * 1000;
          break;
      }
    }

    return totalMs > 0 ? totalMs : null;
  }

  static escapeMarkdown(text: string): string {
    return text.replace(/([*_`~\\|])/g, '\\$1');
  }

  static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  static isValidSnowflake(id: string): boolean {
    return /^\d{17,19}$/.test(id);
  }

  static getAvatarUrl(user: User, size: number = 256): string {
    return user.displayAvatarURL({ size: size as any, extension: 'png' });
  }

  /**
   * Channel permission checks
   */
  static canSendMessages(channel: TextChannel, member: GuildMember): boolean {
    return channel.permissionsFor(member)?.has(PermissionFlagsBits.SendMessages) ?? false;
  }

  static canViewChannel(channel: GuildChannel, member: GuildMember): boolean {
    return channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel) ?? false;
  }

  static canManageChannel(channel: GuildChannel, member: GuildMember): boolean {
    return channel.permissionsFor(member)?.has(PermissionFlagsBits.ManageChannels) ?? false;
  }

  static canConnectToVoice(channel: VoiceChannel, member: GuildMember): boolean {
    const permissions = channel.permissionsFor(member);
    return permissions?.has(PermissionFlagsBits.Connect) ?? false;
  }

  static canSpeakInVoice(channel: VoiceChannel, member: GuildMember): boolean {
    const permissions = channel.permissionsFor(member);
    return permissions?.has(PermissionFlagsBits.Speak) ?? false;
  }
}
