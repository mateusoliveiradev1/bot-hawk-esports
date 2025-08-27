import { 
  Guild, 
  GuildBan, 
  Role, 
  GuildChannel, 
  Invite,
  GuildEmoji,
  Sticker,
  NonThreadGuildBasedChannel
} from 'discord.js';
import { ExtendedClient } from '../types/client';
import { Logger } from '../utils/logger';

/**
 * Handles Discord guild-related events
 */
export class GuildEvents {
  private client: ExtendedClient;
  private logger: Logger;

  constructor(client: ExtendedClient) {
    this.client = client;
    this.logger = new Logger();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Guild ban events
    this.client.on('guildBanAdd', this.handleGuildBanAdd.bind(this));
    this.client.on('guildBanRemove', this.handleGuildBanRemove.bind(this));
    
    // Role events
    this.client.on('roleCreate', this.handleRoleCreate.bind(this));
    this.client.on('roleDelete', this.handleRoleDelete.bind(this));
    this.client.on('roleUpdate', this.handleRoleUpdate.bind(this));
    
    // Channel events
    this.client.on('channelCreate', this.handleChannelCreate.bind(this));
    this.client.on('channelDelete', this.handleChannelDelete.bind(this));
    this.client.on('channelUpdate', this.handleChannelUpdate.bind(this));
    
    // Invite events
    this.client.on('inviteCreate', this.handleInviteCreate.bind(this));
    this.client.on('inviteDelete', this.handleInviteDelete.bind(this));
    
    // Emoji events
    this.client.on('emojiCreate', this.handleEmojiCreate.bind(this));
    this.client.on('emojiDelete', this.handleEmojiDelete.bind(this));
    this.client.on('emojiUpdate', this.handleEmojiUpdate.bind(this));
    
    // Sticker events
    this.client.on('stickerCreate', this.handleStickerCreate.bind(this));
    this.client.on('stickerDelete', this.handleStickerDelete.bind(this));
    this.client.on('stickerUpdate', this.handleStickerUpdate.bind(this));
    
    // Guild update events
    this.client.on('guildUpdate', this.handleGuildUpdate.bind(this));
  }

  /**
   * Handle guild ban add
   */
  private async handleGuildBanAdd(ban: GuildBan): Promise<void> {
    try {
      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle guild ban add:', error);
    }
  }

  /**
   * Handle guild ban remove (unban)
   */
  private async handleGuildBanRemove(ban: GuildBan): Promise<void> {
    try {
      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle guild ban remove:', error);
    }
  }

  /**
   * Handle role creation
   */
  private async handleRoleCreate(role: Role): Promise<void> {
    try {
      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle role create:', error);
    }
  }

  /**
   * Handle role deletion
   */
  private async handleRoleDelete(role: Role): Promise<void> {
    try {
      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle role delete:', error);
    }
  }

  /**
   * Handle role updates
   */
  private async handleRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
    try {
      if (!this.client.services?.logging) return;

      const changes: any = {};

      if (oldRole.name !== newRole.name) {
        changes.name = { old: oldRole.name, new: newRole.name };
      }

      if (oldRole.color !== newRole.color) {
        changes.color = { old: oldRole.hexColor, new: newRole.hexColor };
      }

      if (oldRole.position !== newRole.position) {
        changes.position = { old: oldRole.position, new: newRole.position };
      }

      if (oldRole.mentionable !== newRole.mentionable) {
        changes.mentionable = { old: oldRole.mentionable, new: newRole.mentionable };
      }

      if (oldRole.hoist !== newRole.hoist) {
        changes.hoist = { old: oldRole.hoist, new: newRole.hoist };
      }

      if (!oldRole.permissions.equals(newRole.permissions)) {
        changes.permissions = {
          old: oldRole.permissions.toArray(),
          new: newRole.permissions.toArray()
        };
      }

      if (Object.keys(changes).length > 0) {
        // Logging is handled automatically by LoggingService
      }
    } catch (error) {
      this.logger.error('Failed to handle role update:', error);
    }
  }

  /**
   * Handle channel creation
   */
  private async handleChannelCreate(channel: any): Promise<void> {
    if (!channel.guild) return;
    try {
      if (!this.client.services?.logging) return;

      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle channel create:', error);
    }
  }

  /**
   * Handle channel deletion
   */
  private async handleChannelDelete(channel: any): Promise<void> {
    if (!channel.guild) return;
    try {
      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle channel delete:', error);
    }
  }

  /**
   * Handle channel updates
   */
  private async handleChannelUpdate(oldChannel: any, newChannel: any): Promise<void> {
    if (!oldChannel.guild || !newChannel.guild) return;
    try {
      if (!this.client.services?.logging) return;

      const changes: any = {};

      if (oldChannel.name !== newChannel.name) {
        changes.name = { old: oldChannel.name, new: newChannel.name };
      }

      if (oldChannel.position !== newChannel.position) {
        changes.position = { old: oldChannel.position, new: newChannel.position };
      }

      if (oldChannel.parentId !== newChannel.parentId) {
        changes.parent = { old: oldChannel.parentId, new: newChannel.parentId };
      }

      // Check topic for text channels
      if ('topic' in oldChannel && 'topic' in newChannel && oldChannel.topic !== newChannel.topic) {
        changes.topic = { old: oldChannel.topic, new: newChannel.topic };
      }

      // Check nsfw for text channels
      if ('nsfw' in oldChannel && 'nsfw' in newChannel && oldChannel.nsfw !== newChannel.nsfw) {
        changes.nsfw = { old: oldChannel.nsfw, new: newChannel.nsfw };
      }

      // Check bitrate for voice channels
      if ('bitrate' in oldChannel && 'bitrate' in newChannel && oldChannel.bitrate !== newChannel.bitrate) {
        changes.bitrate = { old: oldChannel.bitrate, new: newChannel.bitrate };
      }

      // Check user limit for voice channels
      if ('userLimit' in oldChannel && 'userLimit' in newChannel && oldChannel.userLimit !== newChannel.userLimit) {
        changes.userLimit = { old: oldChannel.userLimit, new: newChannel.userLimit };
      }

      if (Object.keys(changes).length > 0) {
        // Logging is handled automatically by LoggingService
      }
    } catch (error) {
      this.logger.error('Failed to handle channel update:', error);
    }
  }

  /**
   * Handle invite creation
   */
  private async handleInviteCreate(invite: Invite): Promise<void> {
    try {
      if (!this.client.services?.logging || !invite.guild) return;

      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle invite create:', error);
    }
  }

  /**
   * Handle invite deletion
   */
  private async handleInviteDelete(invite: Invite): Promise<void> {
    try {
      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle invite delete:', error);
    }
  }

  /**
   * Handle emoji creation
   */
  private async handleEmojiCreate(emoji: GuildEmoji): Promise<void> {
    try {
      if (!this.client.services?.logging) return;

      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle emoji create:', error);
    }
  }

  /**
   * Handle emoji deletion
   */
  private async handleEmojiDelete(emoji: GuildEmoji): Promise<void> {
    try {
      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle emoji delete:', error);
    }
  }

  /**
   * Handle emoji updates
   */
  private async handleEmojiUpdate(oldEmoji: GuildEmoji, newEmoji: GuildEmoji): Promise<void> {
    try {
      if (!this.client.services?.logging) return;

      const changes: any = {};

      if (oldEmoji.name !== newEmoji.name) {
        changes.name = { old: oldEmoji.name, new: newEmoji.name };
      }

      if (Object.keys(changes).length > 0) {
        // Logging is handled automatically by LoggingService
      }
    } catch (error) {
      this.logger.error('Failed to handle emoji update:', error);
    }
  }

  /**
   * Handle sticker creation
   */
  private async handleStickerCreate(sticker: Sticker): Promise<void> {
    try {
      if (!this.client.services?.logging || !sticker.guild) return;

      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle sticker create:', error);
    }
  }

  /**
   * Handle sticker deletion
   */
  private async handleStickerDelete(sticker: Sticker): Promise<void> {
    try {
      // Logging is handled automatically by LoggingService
    } catch (error) {
      this.logger.error('Failed to handle sticker delete:', error);
    }
  }

  /**
   * Handle sticker updates
   */
  private async handleStickerUpdate(oldSticker: Sticker, newSticker: Sticker): Promise<void> {
    try {
      if (!this.client.services?.logging || !newSticker.guild) return;

      const changes: any = {};

      if (oldSticker.name !== newSticker.name) {
        changes.name = { old: oldSticker.name, new: newSticker.name };
      }

      if (oldSticker.description !== newSticker.description) {
        changes.description = { old: oldSticker.description, new: newSticker.description };
      }

      if (oldSticker.tags !== newSticker.tags) {
        changes.tags = { old: oldSticker.tags, new: newSticker.tags };
      }

      if (Object.keys(changes).length > 0) {
        // Logging is handled automatically by LoggingService
      }
    } catch (error) {
      this.logger.error('Failed to handle sticker update:', error);
    }
  }

  /**
   * Handle guild updates
   */
  private async handleGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
    try {
      if (!this.client.services?.logging) return;

      const changes: any = {};

      if (oldGuild.name !== newGuild.name) {
        changes.name = { old: oldGuild.name, new: newGuild.name };
      }

      if (oldGuild.description !== newGuild.description) {
        changes.description = { old: oldGuild.description, new: newGuild.description };
      }

      if (oldGuild.iconURL() !== newGuild.iconURL()) {
        changes.icon = { old: oldGuild.iconURL(), new: newGuild.iconURL() };
      }

      if (oldGuild.bannerURL() !== newGuild.bannerURL()) {
        changes.banner = { old: oldGuild.bannerURL(), new: newGuild.bannerURL() };
      }

      if (oldGuild.ownerId !== newGuild.ownerId) {
        changes.owner = { old: oldGuild.ownerId, new: newGuild.ownerId };
      }

      if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        changes.verificationLevel = { old: oldGuild.verificationLevel, new: newGuild.verificationLevel };
      }

      if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) {
        changes.defaultMessageNotifications = { 
          old: oldGuild.defaultMessageNotifications, 
          new: newGuild.defaultMessageNotifications 
        };
      }

      if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
        changes.explicitContentFilter = { 
          old: oldGuild.explicitContentFilter, 
          new: newGuild.explicitContentFilter 
        };
      }

      if (Object.keys(changes).length > 0) {
        // Logging is handled automatically by LoggingService
      }
    } catch (error) {
      this.logger.error('Failed to handle guild update:', error);
    }
  }
}