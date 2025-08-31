import {
  Client,
  EmbedBuilder,
  TextChannel,
  User,
  GuildMember,
  Message,
  Guild,
  Role,
  VoiceState,
  GuildChannel,
  NonThreadGuildBasedChannel,
  PartialMessage,
  PartialGuildMember,
  Invite,
  GuildBan,
  ColorResolvable,
} from 'discord.js';
import { Logger, LogCategory } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { ExtendedClient } from '../types/client';
import { HawkEmbedBuilder } from '../utils/hawk-embed-builder';
import { HAWK_EMOJIS } from '../constants/hawk-emojis';

export interface LogConfig {
  guildId: string;
  enabled: boolean;
  channels: {
    moderation?: string;
    messages?: string;
    members?: string;
    voice?: string;
    server?: string;
    changelog?: string;
    api?: string;
  };
  events: {
    messageDelete: boolean;
    messageEdit: boolean;
    memberJoin: boolean;
    memberLeave: boolean;
    memberUpdate: boolean;
    memberBan: boolean;
    memberUnban: boolean;
    roleCreate: boolean;
    roleDelete: boolean;
    roleUpdate: boolean;
    channelCreate: boolean;
    channelDelete: boolean;
    channelUpdate: boolean;
    voiceJoin: boolean;
    voiceLeave: boolean;
    voiceMove: boolean;
    inviteCreate: boolean;
    inviteDelete: boolean;
    moderationActions: boolean;
  };
  filters: {
    ignoreBots: boolean;
    ignoreChannels: string[];
    ignoreRoles: string[];
    ignoreUsers: string[];
  };
}

export interface LogEntry {
  id: string;
  guildId: string;
  type: LogType;
  userId?: string;
  channelId?: string;
  moderatorId?: string;
  content: string;
  metadata?: any;
  timestamp: Date;
}

export enum LogType {
  MESSAGE_DELETE = 'message_delete',
  MESSAGE_EDIT = 'message_edit',
  MEMBER_JOIN = 'member_join',
  MEMBER_LEAVE = 'member_leave',
  MEMBER_UPDATE = 'member_update',
  MEMBER_BAN = 'member_ban',
  MEMBER_UNBAN = 'member_unban',
  ROLE_CREATE = 'role_create',
  ROLE_DELETE = 'role_delete',
  ROLE_UPDATE = 'role_update',
  CHANNEL_CREATE = 'channel_create',
  CHANNEL_DELETE = 'channel_delete',
  CHANNEL_UPDATE = 'channel_update',
  VOICE_JOIN = 'voice_join',
  VOICE_LEAVE = 'voice_leave',
  VOICE_MOVE = 'voice_move',
  INVITE_CREATE = 'invite_create',
  INVITE_DELETE = 'invite_delete',
  MODERATION_WARN = 'moderation_warn',
  MODERATION_MUTE = 'moderation_mute',
  MODERATION_KICK = 'moderation_kick',
  MODERATION_BAN = 'moderation_ban',
  MODERATION_UNBAN = 'moderation_unban',
  AUTOMOD_ACTION = 'automod_action',
  TICKET_CREATE = 'ticket_create',
  TICKET_CLOSE = 'ticket_close',
  CHANGELOG = 'changelog',
  API_REQUEST = 'api_request',
  API_ERROR = 'api_error',
  API_SUCCESS = 'api_success',
}

export interface ModerationLogData {
  action: string;
  moderator: User;
  target: User;
  reason: string;
  duration?: number;
  additional?: any;
}

export interface ChangelogEntry {
  version?: string;
  type: 'feature' | 'bugfix' | 'improvement' | 'breaking';
  title: string;
  description: string;
  author?: string;
  timestamp: Date;
}

/**
 * Logging Service
 * Handles automatic logging of Discord events and moderation actions
 */
export class LoggingService {
  private logger: Logger;
  private guildConfigs: Map<string, LogConfig> = new Map();
  private logQueue: LogEntry[] = [];
  private processingQueue = false;
  private queueProcessorInterval?: any;
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly BATCH_SIZE = 10;
  private readonly PROCESS_INTERVAL = 1000;

  constructor(
    private client: ExtendedClient,
    private database: DatabaseService,
  ) {
    // Validate dependencies
    if (!client) {
      throw new Error('ExtendedClient is required for LoggingService');
    }
    if (!database) {
      throw new Error('DatabaseService is required for LoggingService');
    }

    this.logger = new Logger();

    try {
      this.setupEventListeners();
      this.startQueueProcessor();
      this.logger.info('LoggingService initialized successfully', {
        category: LogCategory.SYSTEM,
        metadata: { service: 'LoggingService', status: 'initialized' },
      });
    } catch (error) {
      this.logger.error('Failed to initialize LoggingService', {
        category: LogCategory.SYSTEM,
        error: error as Error,
        metadata: { service: 'LoggingService', status: 'failed' },
      });
      throw error;
    }
  }

  /**
   * Setup Discord event listeners
   */
  private setupEventListeners(): void {
    // Message events
    this.client.on('messageDelete', this.handleMessageDelete.bind(this));
    this.client.on('messageUpdate', this.handleMessageUpdate.bind(this));
    this.client.on('messageDeleteBulk', this.handleBulkMessageDelete.bind(this));

    // Member events
    this.client.on('guildMemberAdd', this.handleMemberJoin.bind(this));
    this.client.on('guildMemberRemove', this.handleMemberLeave.bind(this));
    this.client.on('guildMemberUpdate', this.handleMemberUpdate.bind(this));
    this.client.on('guildBanAdd', this.handleMemberBan.bind(this));
    this.client.on('guildBanRemove', this.handleMemberUnban.bind(this));

    // Role events
    this.client.on('roleCreate', this.handleRoleCreate.bind(this));
    this.client.on('roleDelete', this.handleRoleDelete.bind(this));
    this.client.on('roleUpdate', this.handleRoleUpdate.bind(this));

    // Channel events
    this.client.on('channelCreate', this.handleChannelCreate.bind(this));
    this.client.on('channelDelete', this.handleChannelDelete.bind(this));
    this.client.on('channelUpdate', this.handleChannelUpdate.bind(this));

    // Voice events
    this.client.on('voiceStateUpdate', this.handleVoiceStateUpdate.bind(this));

    // Invite events
    this.client.on('inviteCreate', this.handleInviteCreate.bind(this));
    this.client.on('inviteDelete', this.handleInviteDelete.bind(this));
  }

  /**
   * Get guild configuration
   */
  private getGuildConfig(guildId: string): LogConfig {
    try {
      if (!guildId || typeof guildId !== 'string') {
        this.logger.warn('Invalid guildId provided to getGuildConfig', {
          category: LogCategory.SYSTEM,
          metadata: { method: 'getGuildConfig', providedGuildId: guildId },
        });
        return this.getDefaultConfig('unknown');
      }

      if (!this.guildConfigs.has(guildId)) {
        const newConfig = this.getDefaultConfig(guildId);
        this.guildConfigs.set(guildId, newConfig);
        this.logger.debug(`Created new log config for guild ${guildId}`, {
          category: LogCategory.SYSTEM,
          guildId,
          metadata: { method: 'getGuildConfig', action: 'created_config' },
        });
      }

      return this.guildConfigs.get(guildId) || this.getDefaultConfig(guildId);
    } catch (error) {
      this.logger.error('Error getting guild config', {
        category: LogCategory.SYSTEM,
        guildId,
        error: error as Error,
        metadata: { method: 'getGuildConfig' },
      });
      return this.getDefaultConfig(guildId || 'unknown');
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(guildId: string): LogConfig {
    return {
      guildId,
      enabled: true,
      channels: {},
      events: {
        messageDelete: true,
        messageEdit: true,
        memberJoin: true,
        memberLeave: true,
        memberUpdate: true,
        memberBan: true,
        memberUnban: true,
        roleCreate: true,
        roleDelete: true,
        roleUpdate: true,
        channelCreate: true,
        channelDelete: true,
        channelUpdate: true,
        voiceJoin: true,
        voiceLeave: true,
        voiceMove: true,
        inviteCreate: true,
        inviteDelete: true,
        moderationActions: true,
      },
      filters: {
        ignoreBots: true,
        ignoreChannels: [],
        ignoreRoles: [],
        ignoreUsers: [],
      },
    };
  }

  /**
   * Check if event should be logged
   */
  private shouldLog(guildId: string, type: LogType, userId?: string, channelId?: string): boolean {
    try {
      // Validate inputs
      if (!guildId || typeof guildId !== 'string') {
        this.logger.warn('Invalid guildId provided to shouldLog', {
          category: LogCategory.SYSTEM,
          metadata: { method: 'shouldLog', type, providedGuildId: guildId },
        });
        return false;
      }

      const config = this.getGuildConfig(guildId);

      if (!config.enabled) {
        return false;
      }

      // Check if event type is enabled
      const eventKey = type.replace('_', '') as keyof typeof config.events;
      if (!config.events[eventKey as keyof typeof config.events]) {
        return false;
      }

      // Check filters
      if (userId && config.filters.ignoreUsers.includes(userId)) {
        return false;
      }
      if (channelId && config.filters.ignoreChannels.includes(channelId)) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error in shouldLog', {
        category: LogCategory.SYSTEM,
        guildId,
        userId,
        channelId,
        error: error as Error,
        metadata: { method: 'shouldLog', type },
      });
      return false;
    }
  }

  /**
   * Add log entry to queue
   */
  private async queueLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): Promise<void> {
    try {
      // Validate entry
      if (!entry.guildId || !entry.type || !entry.content) {
        this.logger.warn('Invalid log entry provided to queueLog');
        return;
      }

      // Check queue size limit
      if (this.logQueue.length >= this.MAX_QUEUE_SIZE) {
        this.logger.warn(`Log queue is full (${this.MAX_QUEUE_SIZE}), dropping oldest entries`);
        this.logQueue.splice(0, Math.floor(this.MAX_QUEUE_SIZE * 0.1)); // Remove 10% of oldest entries
      }

      const logEntry: LogEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
      };

      this.logQueue.push(logEntry);
    } catch (error) {
      this.logger.error('Error queuing log entry:', error);
    }
  }

  /**
   * Process log queue
   */
  private async processLogQueue(): Promise<void> {
    if (this.processingQueue || this.logQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    try {
      const batch = this.logQueue.splice(0, this.BATCH_SIZE);
      const processedCount = batch.length;

      const results = await Promise.allSettled(
        batch.map(async entry => {
          try {
            await Promise.all([this.sendLogToChannel(entry), this.saveLogToDatabase(entry)]);
            return { success: true, entry };
          } catch (error) {
            this.logger.error(`Failed to process log entry ${entry.id}:`, error);
            return { success: false, entry, error };
          }
        }),
      );

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failureCount = processedCount - successCount;

      if (failureCount > 0) {
        this.logger.warn(
          `Processed ${processedCount} log entries: ${successCount} successful, ${failureCount} failed`,
        );
      }
    } catch (error) {
      this.logger.error('Error processing log queue:', error);
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    if (this.queueProcessorInterval) {
      clearInterval(this.queueProcessorInterval);
    }

    this.queueProcessorInterval = setInterval(() => {
      this.processLogQueue().catch(error => {
        this.logger.error('Unhandled error in queue processor:', error);
      });
    }, this.PROCESS_INTERVAL);

    this.logger.debug('Log queue processor started');
  }

  /**
   * Send log to appropriate channel
   */
  private async sendLogToChannel(entry: LogEntry): Promise<void> {
    try {
      // Validate entry
      if (!entry || !entry.guildId || !entry.type) {
        this.logger.warn('Invalid log entry provided to sendLogToChannel');
        return;
      }

      const config = this.getGuildConfig(entry.guildId);
      const channelId = this.getLogChannelForType(entry.type, config);

      if (!channelId) {
        this.logger.debug(
          `No log channel configured for type ${entry.type} in guild ${entry.guildId}`,
        );
        return;
      }

      const channel = this.client.channels.cache.get(channelId) as TextChannel;
      if (!channel) {
        this.logger.warn(`Log channel ${channelId} not found or not accessible`);
        return;
      }

      // Check channel permissions
      if (!channel.permissionsFor(this.client.user!)?.has(['SendMessages', 'EmbedLinks'])) {
        this.logger.warn(`Missing permissions to send logs in channel ${channelId}`);
        return;
      }

      const embed = this.createLogEmbed(entry);
      if (!embed) {
        this.logger.warn(`Failed to create embed for log entry ${entry.id}`);
        return;
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error(`Error sending log to channel for entry ${entry.id}:`, error);
      throw error; // Re-throw to be handled by caller
    }
  }

  /**
   * Get appropriate log channel for event type
   */
  private getLogChannelForType(type: LogType, config: LogConfig): string | undefined {
    try {
      if (!type || !config || !config.channels) {
        this.logger.warn('Invalid parameters provided to getLogChannelForType');
        return undefined;
      }

      switch (type) {
        case LogType.MESSAGE_DELETE:
        case LogType.MESSAGE_EDIT:
          return config.channels.messages;

        case LogType.MEMBER_JOIN:
        case LogType.MEMBER_LEAVE:
        case LogType.MEMBER_UPDATE:
          return config.channels.members;

        case LogType.VOICE_JOIN:
        case LogType.VOICE_LEAVE:
        case LogType.VOICE_MOVE:
          return config.channels.voice;

        case LogType.MODERATION_WARN:
        case LogType.MODERATION_MUTE:
        case LogType.MODERATION_KICK:
        case LogType.MODERATION_BAN:
        case LogType.MODERATION_UNBAN:
        case LogType.AUTOMOD_ACTION:
          return config.channels.moderation;

        case LogType.TICKET_CREATE:
        case LogType.TICKET_CLOSE:
          return config.channels.moderation;

        case LogType.CHANGELOG:
          return config.channels.changelog;

        case LogType.API_REQUEST:
        case LogType.API_ERROR:
        case LogType.API_SUCCESS:
          return config.channels.api;

        default:
          return config.channels.server;
      }
    } catch (error) {
      this.logger.error('Error getting log channel for type:', error);
      return undefined;
    }
  }

  /**
   * Create log embed
   */
  private createLogEmbed(entry: LogEntry): EmbedBuilder {
    const baseEmbed = new EmbedBuilder()
      .setTimestamp(entry.timestamp)
      .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

    switch (entry.type) {
      case LogType.MESSAGE_DELETE:
        return HawkEmbedBuilder.createError(
          'Mensagem Deletada',
          entry.content
        )
        .addFields(
          { name: `${HAWK_EMOJIS.USER} Autor`, value: entry.metadata?.author || 'Desconhecido', inline: true },
          { name: `${HAWK_EMOJIS.CHANNEL} Canal`, value: entry.metadata?.channel || 'Desconhecido', inline: true },
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.MESSAGE_EDIT:
        return HawkEmbedBuilder.createWarning(
          'Mensagem Editada',
          `${HAWK_EMOJIS.EDIT} Uma mensagem foi modificada`
        )
        .addFields(
          { name: `${HAWK_EMOJIS.USER} Autor`, value: entry.metadata?.author || 'Desconhecido', inline: true },
          { name: `${HAWK_EMOJIS.CHANNEL} Canal`, value: entry.metadata?.channel || 'Desconhecido', inline: true },
          {
            name: `${HAWK_EMOJIS.LOG} Antes`,
            value: entry.metadata?.oldContent?.substring(0, 1024) || 'Sem conteúdo',
            inline: false,
          },
          {
            name: `${HAWK_EMOJIS.LOG} Depois`,
            value: entry.metadata?.newContent?.substring(0, 1024) || 'Sem conteúdo',
            inline: false,
          },
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.MEMBER_JOIN:
        return HawkEmbedBuilder.createSuccess(
          'Membro Entrou',
          `${HAWK_EMOJIS.ADD} ${entry.content}`
        )
        .addFields(
          { name: `${HAWK_EMOJIS.USER} Usuário`, value: entry.metadata?.user || 'Desconhecido', inline: true },
          {
            name: `${HAWK_EMOJIS.TIMER} Conta Criada`,
            value: entry.metadata?.accountAge || 'Desconhecido',
            inline: true,
          },
          {
            name: `${HAWK_EMOJIS.STATS} Total de Membros`,
            value: entry.metadata?.memberCount?.toString() || '0',
            inline: true,
          },
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.MEMBER_LEAVE:
        return HawkEmbedBuilder.createWarning(
          'Membro Saiu',
          `${HAWK_EMOJIS.REMOVE} ${entry.content}`
        )
        .addFields(
          { name: `${HAWK_EMOJIS.USER} Usuário`, value: entry.metadata?.user || 'Desconhecido', inline: true },
          {
            name: `${HAWK_EMOJIS.TIMER} Tempo no Servidor`,
            value: entry.metadata?.timeInServer || 'Desconhecido',
            inline: true,
          },
          {
            name: `${HAWK_EMOJIS.STATS} Total de Membros`,
            value: entry.metadata?.memberCount?.toString() || '0',
            inline: true,
          },
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.MODERATION_WARN:
      case LogType.MODERATION_MUTE:
      case LogType.MODERATION_KICK:
      case LogType.MODERATION_BAN:
        const moderationAction = entry.type.split('_')[1]?.toUpperCase() || 'MODERAÇÃO';
        const moderationEmoji = {
          'WARN': HAWK_EMOJIS.WARNING,
        'MUTE': HAWK_EMOJIS.MUTE,
        'KICK': HAWK_EMOJIS.REMOVE,
        'BAN': HAWK_EMOJIS.BANNED
      }[moderationAction] || HAWK_EMOJIS.WARNING;
        
        return HawkEmbedBuilder.createError(
          `${moderationAction} Aplicado`,
          `${moderationEmoji} ${entry.content}`
        )
        .addFields(
          { name: `${HAWK_EMOJIS.USER} Usuário`, value: entry.metadata?.target || 'Desconhecido', inline: true },
          {
            name: `${HAWK_EMOJIS.MODERATOR} Moderador`,
            value: entry.metadata?.moderator || 'Desconhecido',
            inline: true,
          },
          {
            name: `${HAWK_EMOJIS.LOG} Motivo`,
            value: entry.metadata?.reason || 'Não especificado',
            inline: false,
          },
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.TICKET_CREATE:
        return HawkEmbedBuilder.createSuccess(
          'Ticket Criado',
          `${HAWK_EMOJIS.TICKET} ${entry.content}`
        )
        .addFields(
          { name: `${HAWK_EMOJIS.USER} Usuário`, value: entry.metadata?.user || 'Desconhecido', inline: true },
          { name: `${HAWK_EMOJIS.CHANNEL} Canal`, value: entry.metadata?.channel || 'Desconhecido', inline: true },
          { name: `${HAWK_EMOJIS.TICKET} Título`, value: entry.metadata?.title || 'Sem título', inline: false },
          {
            name: `${HAWK_EMOJIS.TICKET} Descrição`,
            value: entry.metadata?.description?.substring(0, 1024) || 'Sem descrição',
            inline: false,
          },
          { name: `${HAWK_EMOJIS.STAR} Prioridade`, value: entry.metadata?.priority || 'Baixa', inline: true },
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.TICKET_CLOSE:
        return HawkEmbedBuilder.createWarning(
          'Ticket Fechado',
          `${HAWK_EMOJIS.TICKET} ${entry.content}`
        )
        .addFields(
          { name: `${HAWK_EMOJIS.USER} Usuário`, value: entry.metadata?.user || 'Desconhecido', inline: true },
          { name: `${HAWK_EMOJIS.MODERATOR} Fechado por`, value: entry.metadata?.closedBy || 'Sistema', inline: true },
          { name: `${HAWK_EMOJIS.CHANNEL} Canal`, value: entry.metadata?.channel || 'Desconhecido', inline: true },
          {
            name: `${HAWK_EMOJIS.LOG} Motivo`,
            value: entry.metadata?.reason || 'Não especificado',
            inline: false,
          },
          { name: `${HAWK_EMOJIS.TIMER} Duração`, value: entry.metadata?.duration || 'Desconhecido', inline: true },
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.CHANGELOG:
        return HawkEmbedBuilder.createInfo(
          'Changelog',
          `${HAWK_EMOJIS.LOG} ${entry.content}`
        )
        .addFields(
          { name: `${HAWK_EMOJIS.LOG} Versão`, value: entry.metadata?.version || 'N/A', inline: true },
          { name: `${HAWK_EMOJIS.LOG} Tipo`, value: entry.metadata?.type || 'N/A', inline: true },
          { name: `${HAWK_EMOJIS.ADMIN} Autor`, value: entry.metadata?.author || 'Sistema', inline: true },
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.API_SUCCESS:
        return HawkEmbedBuilder.createSuccess(
          'API Success',
          `${HAWK_EMOJIS.SUCCESS} ${entry.content}`
        )
        .addFields(
          { name: `${HAWK_EMOJIS.SETTINGS} Serviço`, value: entry.metadata?.service || 'API', inline: true },
          { name: `${HAWK_EMOJIS.SETTINGS} Operação`, value: entry.metadata?.operation || 'N/A', inline: true },
          { name: `${HAWK_EMOJIS.SUCCESS} Status`, value: entry.metadata?.status || 'Success', inline: true },
          ...(entry.metadata?.method
            ? [{ name: `${HAWK_EMOJIS.SETTINGS} Método`, value: entry.metadata.method, inline: true }]
            : []),
          ...(entry.metadata?.endpoint
            ? [{ name: `${HAWK_EMOJIS.LINK} Endpoint`, value: entry.metadata.endpoint, inline: true }]
            : []),
          ...(entry.metadata?.statusCode
            ? [{ name: `${HAWK_EMOJIS.INFO} Código`, value: entry.metadata.statusCode.toString(), inline: true }]
            : []),
          ...(entry.metadata?.responseTime
            ? [{ name: `${HAWK_EMOJIS.TIMER} Tempo`, value: `${entry.metadata.responseTime}ms`, inline: true }]
            : []),
          ...(entry.metadata?.playerId
            ? [{ name: `${HAWK_EMOJIS.USER} Player ID`, value: entry.metadata.playerId, inline: true }]
            : []),
          ...(entry.metadata?.playerName
            ? [{ name: `${HAWK_EMOJIS.PROFILE} Nome`, value: entry.metadata.playerName, inline: true }]
            : []),
          ...(entry.metadata?.platform
            ? [{ name: `${HAWK_EMOJIS.GAME} Plataforma`, value: entry.metadata.platform, inline: true }]
            : []),
          ...(entry.metadata?.badgeType
            ? [{ name: `${HAWK_EMOJIS.BADGE} Badge`, value: entry.metadata.badgeType, inline: true }]
            : []),
          ...(entry.metadata?.weaponName
            ? [{ name: `${HAWK_EMOJIS.WEAPON} Arma`, value: entry.metadata.weaponName, inline: true }]
            : []),
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.API_ERROR:
        return HawkEmbedBuilder.createError(
          `${HAWK_EMOJIS.LOG} API Error`,
          entry.content
        )
        .addFields(
          { name: `${HAWK_EMOJIS.LOG} Serviço`, value: entry.metadata?.service || 'API', inline: true },
          { name: `${HAWK_EMOJIS.LOG} Operação`, value: entry.metadata?.operation || 'N/A', inline: true },
          { name: `${HAWK_EMOJIS.LOG} Status`, value: entry.metadata?.status || 'Error', inline: true },
          ...(entry.metadata?.method
            ? [{ name: `${HAWK_EMOJIS.LOG} Método`, value: entry.metadata.method, inline: true }]
            : []),
          ...(entry.metadata?.endpoint
            ? [{ name: `${HAWK_EMOJIS.LOG} Endpoint`, value: entry.metadata.endpoint, inline: true }]
            : []),
          ...(entry.metadata?.statusCode
            ? [{ name: `${HAWK_EMOJIS.LOG} Código`, value: entry.metadata.statusCode.toString(), inline: true }]
            : []),
          ...(entry.metadata?.responseTime
            ? [{ name: `${HAWK_EMOJIS.LOG} Tempo`, value: `${entry.metadata.responseTime}ms`, inline: true }]
            : []),
          ...(entry.metadata?.playerId
            ? [{ name: `${HAWK_EMOJIS.LOG} Player ID`, value: entry.metadata.playerId, inline: true }]
            : []),
          ...(entry.metadata?.playerName
            ? [{ name: `${HAWK_EMOJIS.LOG} Nome`, value: entry.metadata.playerName, inline: true }]
            : []),
          ...(entry.metadata?.platform
            ? [{ name: `${HAWK_EMOJIS.LOG} Plataforma`, value: entry.metadata.platform, inline: true }]
            : []),
          ...(entry.metadata?.badgeType
            ? [{ name: `${HAWK_EMOJIS.LOG} Badge`, value: entry.metadata.badgeType, inline: true }]
            : []),
          ...(entry.metadata?.weaponName
            ? [{ name: `${HAWK_EMOJIS.LOG} Arma`, value: entry.metadata.weaponName, inline: true }]
            : []),
          ...(entry.metadata?.error
            ? [
                {
                  name: `${HAWK_EMOJIS.LOG} Erro`,
                  value: `\`\`\`${entry.metadata.error.substring(0, 1000)}\`\`\``,
                  inline: false,
                },
              ]
            : []),
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      case LogType.API_REQUEST:
        return HawkEmbedBuilder.createInfo(
          `${HAWK_EMOJIS.LOG} API Request`,
          entry.content
        )
        .addFields(
          { name: `${HAWK_EMOJIS.LOG} Serviço`, value: entry.metadata?.service || 'API', inline: true },
          { name: `${HAWK_EMOJIS.LOG} Operação`, value: entry.metadata?.operation || 'N/A', inline: true },
          { name: `${HAWK_EMOJIS.LOG} Status`, value: entry.metadata?.status || 'Processing', inline: true },
          ...(entry.metadata?.method
            ? [{ name: `${HAWK_EMOJIS.LOG} Método`, value: entry.metadata.method, inline: true }]
            : []),
          ...(entry.metadata?.endpoint
            ? [{ name: `${HAWK_EMOJIS.LOG} Endpoint`, value: entry.metadata.endpoint, inline: true }]
            : []),
          ...(entry.metadata?.statusCode
            ? [{ name: `${HAWK_EMOJIS.LOG} Código`, value: entry.metadata.statusCode.toString(), inline: true }]
            : []),
          ...(entry.metadata?.responseTime
            ? [{ name: `${HAWK_EMOJIS.LOG} Tempo`, value: `${entry.metadata.responseTime}ms`, inline: true }]
            : []),
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });

      default:
        return HawkEmbedBuilder.createInfo(
          `${HAWK_EMOJIS.LOG} Log do Servidor`,
          entry.content
        )
        .setTimestamp(entry.timestamp)
        .setFooter({ text: `${HAWK_EMOJIS.LOG} ID: ${entry.id}` });
    }
  }

  /**
   * Save log to database
   */
  private async saveLogToDatabase(entry: LogEntry): Promise<void> {
    try {
      // Validate entry
      if (!entry || !entry.guildId || !entry.type) {
        this.logger.warn('Invalid log entry provided to saveLogToDatabase');
        return;
      }

      // Check if database service is available
      if (!this.database) {
        this.logger.warn('Database service not available for log persistence');
        return;
      }

      // TODO: Implement actual database logging when schema is defined
      // For now, we'll just validate the structure and log the attempt
      const logData = {
        id: entry.id,
        guildId: entry.guildId,
        type: entry.type,
        content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
        userId: entry.userId || null,
        channelId: entry.channelId || null,
        timestamp: entry.timestamp,
      };

      // Placeholder for actual database insertion
      this.logger.debug('Would save log entry to database:', {
        guildId: logData.guildId,
        metadata: {
          id: logData.id,
          type: logData.type,
        },
      });
    } catch (error) {
      this.logger.error(`Error saving log entry ${entry.id} to database:`, error);
      throw error; // Re-throw to be handled by caller
    }
  }

  // Event Handlers
  private async handleMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (message.partial || !message.guild) {
      return;
    }
    if (
      !this.shouldLog(
        message.guild.id,
        LogType.MESSAGE_DELETE,
        message.author?.id,
        message.channel.id,
      )
    ) {
      return;
    }

    const config = this.getGuildConfig(message.guild.id);
    if (config.filters.ignoreBots && message.author?.bot) {
      return;
    }

    await this.queueLog({
      guildId: message.guild.id,
      type: LogType.MESSAGE_DELETE,
      userId: message.author?.id,
      channelId: message.channel.id,
      content: `Mensagem deletada em ${message.channel}`,
      metadata: {
        author: message.author?.tag,
        channel: `<#${message.channel.id}>`,
        content: message.content || 'Sem conteúdo de texto',
        attachments: message.attachments.size,
      },
    });
  }

  private async handleMessageUpdate(
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage,
  ): Promise<void> {
    if (oldMessage.partial || newMessage.partial || !newMessage.guild) {
      return;
    }
    if (oldMessage.content === newMessage.content) {
      return;
    }
    if (
      !this.shouldLog(
        newMessage.guild.id,
        LogType.MESSAGE_EDIT,
        newMessage.author?.id,
        newMessage.channel.id,
      )
    ) {
      return;
    }

    const config = this.getGuildConfig(newMessage.guild.id);
    if (config.filters.ignoreBots && newMessage.author?.bot) {
      return;
    }

    await this.queueLog({
      guildId: newMessage.guild.id,
      type: LogType.MESSAGE_EDIT,
      userId: newMessage.author?.id,
      channelId: newMessage.channel.id,
      content: `Mensagem editada em ${newMessage.channel}`,
      metadata: {
        author: newMessage.author?.tag,
        channel: `<#${newMessage.channel.id}>`,
        oldContent: oldMessage.content,
        newContent: newMessage.content,
      },
    });
  }

  private async handleBulkMessageDelete(messages: any): Promise<void> {
    const firstMessage = messages.first();
    if (!firstMessage?.guild) {
      return;
    }

    await this.queueLog({
      guildId: firstMessage.guild.id,
      type: LogType.MESSAGE_DELETE,
      channelId: firstMessage.channel.id,
      content: `${messages.size} mensagens deletadas em massa`,
      metadata: {
        count: messages.size,
        channel: `<#${firstMessage.channel.id}>`,
      },
    });
  }

  private async handleMemberJoin(member: GuildMember): Promise<void> {
    if (!this.shouldLog(member.guild.id, LogType.MEMBER_JOIN, member.id)) {
      return;
    }

    const accountAge = Math.floor(
      (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24),
    );

    await this.queueLog({
      guildId: member.guild.id,
      type: LogType.MEMBER_JOIN,
      userId: member.id,
      content: `${member.user.tag} entrou no servidor`,
      metadata: {
        user: `${member.user.tag} (${member.id})`,
        accountAge: `${accountAge} dias`,
        memberCount: member.guild.memberCount,
      },
    });
  }

  private async handleMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    if (!member.guild) {
      return;
    }
    if (!this.shouldLog(member.guild.id, LogType.MEMBER_LEAVE, member.id)) {
      return;
    }

    const timeInServer = member.joinedTimestamp
      ? Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24))
      : 0;

    await this.queueLog({
      guildId: member.guild.id,
      type: LogType.MEMBER_LEAVE,
      userId: member.id,
      content: `${member.user?.tag || 'Usuário desconhecido'} saiu do servidor`,
      metadata: {
        user: `${member.user?.tag || 'Desconhecido'} (${member.id})`,
        timeInServer: `${timeInServer} dias`,
        memberCount: member.guild.memberCount,
      },
    });
  }

  private async handleMemberUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    if (!this.shouldLog(newMember.guild.id, LogType.MEMBER_UPDATE, newMember.id)) {
      return;
    }

    const changes: string[] = [];

    if (oldMember.nickname !== newMember.nickname) {
      changes.push(
        `Apelido: ${oldMember.nickname || 'Nenhum'} → ${newMember.nickname || 'Nenhum'}`,
      );
    }

    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      const removedRoles = oldMember.roles.cache.filter(
        role => !newMember.roles.cache.has(role.id),
      );

      if (addedRoles.size > 0) {
        changes.push(`Cargos adicionados: ${addedRoles.map(r => r.name).join(', ')}`);
      }

      if (removedRoles.size > 0) {
        changes.push(`Cargos removidos: ${removedRoles.map(r => r.name).join(', ')}`);
      }
    }

    if (changes.length === 0) {
      return;
    }

    await this.queueLog({
      guildId: newMember.guild.id,
      type: LogType.MEMBER_UPDATE,
      userId: newMember.id,
      content: `${newMember.user.tag} foi atualizado`,
      metadata: {
        user: `${newMember.user.tag} (${newMember.id})`,
        changes: changes.join('\n'),
      },
    });
  }

  private async handleMemberBan(ban: GuildBan): Promise<void> {
    if (!this.shouldLog(ban.guild.id, LogType.MEMBER_BAN, ban.user.id)) {
      return;
    }

    await this.queueLog({
      guildId: ban.guild.id,
      type: LogType.MEMBER_BAN,
      userId: ban.user.id,
      content: `${ban.user.tag} foi banido`,
      metadata: {
        user: `${ban.user.tag} (${ban.user.id})`,
        reason: ban.reason || 'Não especificado',
      },
    });
  }

  private async handleMemberUnban(ban: GuildBan): Promise<void> {
    if (!this.shouldLog(ban.guild.id, LogType.MEMBER_UNBAN, ban.user.id)) {
      return;
    }

    await this.queueLog({
      guildId: ban.guild.id,
      type: LogType.MEMBER_UNBAN,
      userId: ban.user.id,
      content: `${ban.user.tag} foi desbanido`,
      metadata: {
        user: `${ban.user.tag} (${ban.user.id})`,
      },
    });
  }

  private async handleRoleCreate(role: Role): Promise<void> {
    if (!this.shouldLog(role.guild.id, LogType.ROLE_CREATE)) {
      return;
    }

    await this.queueLog({
      guildId: role.guild.id,
      type: LogType.ROLE_CREATE,
      content: `Cargo criado: ${role.name}`,
      metadata: {
        role: `${role.name} (${role.id})`,
        color: role.hexColor,
        permissions: role.permissions.toArray().join(', '),
      },
    });
  }

  private async handleRoleDelete(role: Role): Promise<void> {
    if (!this.shouldLog(role.guild.id, LogType.ROLE_DELETE)) {
      return;
    }

    await this.queueLog({
      guildId: role.guild.id,
      type: LogType.ROLE_DELETE,
      content: `Cargo deletado: ${role.name}`,
      metadata: {
        role: `${role.name} (${role.id})`,
      },
    });
  }

  private async handleRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
    if (!this.shouldLog(newRole.guild.id, LogType.ROLE_UPDATE)) {
      return;
    }

    const changes: string[] = [];

    if (oldRole.name !== newRole.name) {
      changes.push(`Nome: ${oldRole.name} → ${newRole.name}`);
    }

    if (oldRole.color !== newRole.color) {
      changes.push(`Cor: ${oldRole.hexColor} → ${newRole.hexColor}`);
    }

    if (!oldRole.permissions.equals(newRole.permissions)) {
      changes.push('Permissões alteradas');
    }

    if (changes.length === 0) {
      return;
    }

    await this.queueLog({
      guildId: newRole.guild.id,
      type: LogType.ROLE_UPDATE,
      content: `Cargo atualizado: ${newRole.name}`,
      metadata: {
        role: `${newRole.name} (${newRole.id})`,
        changes: changes.join('\n'),
      },
    });
  }

  private async handleChannelCreate(channel: any): Promise<void> {
    if (!channel.guild) {
      return;
    }
    if (!this.shouldLog(channel.guild.id, LogType.CHANNEL_CREATE)) {
      return;
    }

    await this.queueLog({
      guildId: channel.guild.id,
      type: LogType.CHANNEL_CREATE,
      channelId: channel.id,
      content: `Canal criado: ${channel.name}`,
      metadata: {
        channel: `${channel.name} (${channel.id})`,
        type: channel.type,
      },
    });
  }

  private async handleChannelDelete(channel: any): Promise<void> {
    if (!channel.guild) {
      return;
    }
    if (!this.shouldLog(channel.guild.id, LogType.CHANNEL_DELETE)) {
      return;
    }

    await this.queueLog({
      guildId: channel.guild.id,
      type: LogType.CHANNEL_DELETE,
      channelId: channel.id,
      content: `Canal deletado: ${channel.name}`,
      metadata: {
        channel: `${channel.name} (${channel.id})`,
        type: channel.type,
      },
    });
  }

  private async handleChannelUpdate(oldChannel: any, newChannel: any): Promise<void> {
    if (!oldChannel.guild || !newChannel.guild) {
      return;
    }
    if (!this.shouldLog(newChannel.guild.id, LogType.CHANNEL_UPDATE)) {
      return;
    }

    const changes: string[] = [];

    if (oldChannel.name !== newChannel.name) {
      changes.push(`Nome: ${oldChannel.name} → ${newChannel.name}`);
    }

    if (changes.length === 0) {
      return;
    }

    await this.queueLog({
      guildId: newChannel.guild.id,
      type: LogType.CHANNEL_UPDATE,
      channelId: newChannel.id,
      content: `Canal atualizado: ${newChannel.name}`,
      metadata: {
        channel: `${newChannel.name} (${newChannel.id})`,
        changes: changes.join('\n'),
      },
    });
  }

  private async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    if (!newState.guild) {
      return;
    }

    const member = newState.member;
    if (!member) {
      return;
    }

    // User joined voice channel
    if (!oldState.channel && newState.channel) {
      if (!this.shouldLog(newState.guild.id, LogType.VOICE_JOIN, member.id)) {
        return;
      }

      await this.queueLog({
        guildId: newState.guild.id,
        type: LogType.VOICE_JOIN,
        userId: member.id,
        channelId: newState.channel.id,
        content: `${member.user.tag} entrou no canal de voz`,
        metadata: {
          user: `${member.user.tag} (${member.id})`,
          channel: newState.channel.name,
        },
      });
    }
    // User left voice channel
    else if (oldState.channel && !newState.channel) {
      if (!this.shouldLog(newState.guild.id, LogType.VOICE_LEAVE, member.id)) {
        return;
      }

      await this.queueLog({
        guildId: newState.guild.id,
        type: LogType.VOICE_LEAVE,
        userId: member.id,
        channelId: oldState.channel.id,
        content: `${member.user.tag} saiu do canal de voz`,
        metadata: {
          user: `${member.user.tag} (${member.id})`,
          channel: oldState.channel.name,
        },
      });
    }
    // User moved between voice channels
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      if (!this.shouldLog(newState.guild.id, LogType.VOICE_MOVE, member.id)) {
        return;
      }

      await this.queueLog({
        guildId: newState.guild.id,
        type: LogType.VOICE_MOVE,
        userId: member.id,
        channelId: newState.channel.id,
        content: `${member.user.tag} mudou de canal de voz`,
        metadata: {
          user: `${member.user.tag} (${member.id})`,
          fromChannel: oldState.channel.name,
          toChannel: newState.channel.name,
        },
      });
    }
  }

  private async handleInviteCreate(invite: Invite): Promise<void> {
    if (!invite.guild || !this.shouldLog(invite.guild.id, LogType.INVITE_CREATE)) {
      return;
    }

    await this.queueLog({
      guildId: invite.guild.id,
      type: LogType.INVITE_CREATE,
      userId: invite.inviter?.id,
      channelId: invite.channel?.id,
      content: `Convite criado: ${invite.code}`,
      metadata: {
        code: invite.code,
        inviter: invite.inviter?.tag || 'Desconhecido',
        channel: invite.channel?.name || 'Desconhecido',
        maxUses: invite.maxUses || 'Ilimitado',
        expiresAt: invite.expiresAt?.toISOString() || 'Nunca',
      },
    });
  }

  private async handleInviteDelete(invite: Invite): Promise<void> {
    if (!invite.guild || !this.shouldLog(invite.guild.id, LogType.INVITE_DELETE)) {
      return;
    }

    await this.queueLog({
      guildId: invite.guild.id,
      type: LogType.INVITE_DELETE,
      channelId: invite.channel?.id,
      content: `Convite deletado: ${invite.code}`,
      metadata: {
        code: invite.code,
        channel: invite.channel?.name || 'Desconhecido',
      },
    });
  }

  // Public Methods

  /**
   * Log moderation action
   */
  public async logModerationAction(guildId: string, data: ModerationLogData): Promise<void> {
    const actionTypes: { [key: string]: LogType } = {
      warn: LogType.MODERATION_WARN,
      mute: LogType.MODERATION_MUTE,
      kick: LogType.MODERATION_KICK,
      ban: LogType.MODERATION_BAN,
      unban: LogType.MODERATION_UNBAN,
    };

    const logType = actionTypes[data.action.toLowerCase()] || LogType.MODERATION_WARN;

    await this.queueLog({
      guildId,
      type: logType,
      userId: data.target.id,
      moderatorId: data.moderator.id,
      content: `${data.action.toUpperCase()}: ${data.target.tag}`,
      metadata: {
        target: `${data.target.tag} (${data.target.id})`,
        moderator: `${data.moderator.tag} (${data.moderator.id})`,
        reason: data.reason,
        duration: data.duration,
        ...data.additional,
      },
    });
  }

  /**
   * Log automod action
   */
  public async logAutomodAction(
    guildId: string,
    userId: string,
    action: string,
    reason: string,
    metadata?: any,
  ): Promise<void> {
    await this.queueLog({
      guildId,
      type: LogType.AUTOMOD_ACTION,
      userId,
      content: `Auto Moderação: ${action}`,
      metadata: {
        action,
        reason,
        ...metadata,
      },
    });
  }

  /**
   * Log changelog entry
   */
  public async logChangelog(guildId: string, entry: ChangelogEntry): Promise<void> {
    await this.queueLog({
      guildId,
      type: LogType.CHANGELOG,
      content: entry.title,
      metadata: {
        version: entry.version,
        type: entry.type,
        description: entry.description,
        author: entry.author,
      },
    });
  }

  /**
   * Log ticket creation
   */
  public async logTicketCreate(guildId: string, ticketData: any): Promise<void> {
    await this.queueLog({
      guildId,
      type: LogType.TICKET_CREATE,
      userId: ticketData.userId,
      channelId: ticketData.channelId,
      content: `Ticket criado: ${ticketData.title}`,
      metadata: {
        user: `<@${ticketData.userId}>`,
        channel: ticketData.channelId ? `<#${ticketData.channelId}>` : 'Canal não definido',
        title: ticketData.title,
        description: ticketData.description,
        priority: ticketData.priority,
        ticketId: ticketData.ticketId,
      },
    });
  }

  /**
   * Log ticket closure
   */
  public async logTicketClose(guildId: string, ticketData: any): Promise<void> {
    const duration = ticketData.createdAt
      ? Math.floor((Date.now() - new Date(ticketData.createdAt).getTime()) / 1000)
      : 0;

    await this.queueLog({
      guildId,
      type: LogType.TICKET_CLOSE,
      userId: ticketData.userId,
      channelId: ticketData.channelId,
      content: `Ticket fechado: ${ticketData.title}`,
      metadata: {
        user: `<@${ticketData.userId}>`,
        channel: ticketData.channelId ? `<#${ticketData.channelId}>` : 'Canal não definido',
        title: ticketData.title,
        closedBy: ticketData.closedBy ? `<@${ticketData.closedBy}>` : 'Sistema',
        reason: ticketData.reason || 'Não especificado',
        duration: `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`,
        ticketId: ticketData.ticketId,
      },
    });
  }

  /**
   * Update guild configuration
   */
  public updateGuildConfig(guildId: string, config: Partial<LogConfig>): void {
    const currentConfig = this.getGuildConfig(guildId);
    const newConfig = { ...currentConfig, ...config };
    this.guildConfigs.set(guildId, newConfig);

    this.logger.info(`Updated logging config for guild ${guildId}`);
  }

  /**
   * Get guild configuration
   */
  public getConfig(guildId: string): LogConfig {
    return this.getGuildConfig(guildId);
  }

  /**
   * Get logging statistics
   */
  public getStats(): { queueSize: number; configuredGuilds: number } {
    try {
      return {
        queueSize: this.logQueue.length,
        configuredGuilds: this.guildConfigs.size,
      };
    } catch (error) {
      this.logger.error('Error getting logging stats:', error);
      return {
        queueSize: 0,
        configuredGuilds: 0,
      };
    }
  }

  /**
   * Log API request
   */
  public async logApiRequest(
    guildId: string,
    method: string,
    endpoint: string,
    statusCode: number,
    responseTime: number,
    userId?: string,
    additionalData?: any,
  ): Promise<void> {
    const logType = statusCode >= 400 ? LogType.API_ERROR : LogType.API_SUCCESS;
    const status = statusCode >= 400 ? 'Error' : 'Success';

    await this.queueLog({
      guildId,
      type: logType,
      userId,
      content: `API ${method} ${endpoint} - ${statusCode}`,
      metadata: {
        method,
        endpoint,
        statusCode,
        responseTime,
        status,
        timestamp: new Date().toISOString(),
        ...additionalData,
      },
    });
  }

  /**
   * Log PUBG API operation
   */
  public async logPubgApi(
    guildId: string,
    operation: string,
    playerId?: string,
    playerName?: string,
    platform?: string,
    success: boolean = true,
    responseTime?: number,
    error?: string,
    additionalData?: any,
  ): Promise<void> {
    const logType = success ? LogType.API_SUCCESS : LogType.API_ERROR;
    const status = success ? 'Success' : 'Error';

    await this.queueLog({
      guildId,
      type: logType,
      content: `PUBG API ${operation} - ${status}`,
      metadata: {
        service: 'PUBG',
        operation,
        playerId,
        playerName,
        platform,
        status,
        responseTime,
        error,
        timestamp: new Date().toISOString(),
        ...additionalData,
      },
    });
  }

  /**
   * Log badge system operation
   */
  public async logBadgeOperation(
    guildId: string,
    operation: string,
    userId: string,
    badgeType?: string,
    success: boolean = true,
    error?: string,
    additionalData?: any,
  ): Promise<void> {
    const logType = success ? LogType.API_SUCCESS : LogType.API_ERROR;
    const status = success ? 'Success' : 'Error';

    await this.queueLog({
      guildId,
      type: logType,
      userId,
      content: `Badge ${operation} - ${status}`,
      metadata: {
        service: 'Badge System',
        operation,
        badgeType,
        status,
        error,
        timestamp: new Date().toISOString(),
        ...additionalData,
      },
    });
  }

  /**
   * Log weapon mastery operation
   */
  public async logWeaponMastery(
    guildId: string,
    operation: string,
    userId: string,
    weaponName?: string,
    success: boolean = true,
    error?: string,
    additionalData?: any,
  ): Promise<void> {
    const logType = success ? LogType.API_SUCCESS : LogType.API_ERROR;
    const status = success ? 'Success' : 'Error';

    await this.queueLog({
      guildId,
      type: logType,
      userId,
      content: `Weapon Mastery ${operation} - ${status}`,
      metadata: {
        service: 'Weapon Mastery',
        operation,
        weaponName,
        status,
        error,
        timestamp: new Date().toISOString(),
        ...additionalData,
      },
    });
  }

  /**
   * Log general API operation with custom service name
   */
  public async logApiOperation(
    guildId: string,
    serviceName: string,
    operation: string,
    success: boolean = true,
    userId?: string,
    error?: string,
    additionalData?: any,
  ): Promise<void> {
    const logType = success ? LogType.API_SUCCESS : LogType.API_ERROR;
    const status = success ? 'Success' : 'Error';

    await this.queueLog({
      guildId,
      type: logType,
      userId,
      content: `${serviceName} ${operation} - ${status}`,
      metadata: {
        service: serviceName,
        operation,
        status,
        error,
        timestamp: new Date().toISOString(),
        ...additionalData,
      },
    });
  }

  /**
   * Destroy the logging service and cleanup resources
   */
  public destroy(): void {
    try {
      // Clear the queue processor interval
      if (this.queueProcessorInterval) {
        clearInterval(this.queueProcessorInterval);
        this.queueProcessorInterval = undefined;
      }

      // Process remaining queue items before shutdown
      if (this.logQueue.length > 0) {
        this.logger.info(
          `Processing ${this.logQueue.length} remaining log entries before shutdown`,
        );
        this.processLogQueue().catch(error => {
          this.logger.error('Error processing final queue batch:', error);
        });
      }

      // Clear all data structures
      this.logQueue = [];
      this.guildConfigs.clear();
      this.processingQueue = false;

      this.logger.info('LoggingService destroyed successfully');
    } catch (error) {
      this.logger.error('Error destroying LoggingService:', error);
    }
  }

  /**
   * Force process the current log queue
   */
  public async forceProcessQueue(): Promise<void> {
    try {
      if (this.processingQueue) {
        this.logger.warn('Queue is already being processed');
        return;
      }

      await this.processLogQueue();
      this.logger.info('Queue processing completed');
    } catch (error) {
      this.logger.error('Error force processing queue:', error);
      throw error;
    }
  }

  /**
   * Clear log queue (for testing/debugging)
   */
  public clearQueue(): void {
    try {
      const queueSize = this.logQueue.length;
      this.logQueue = [];
      this.logger.info(`Log queue cleared (${queueSize} entries removed)`);
    } catch (error) {
      this.logger.error('Error clearing log queue:', error);
    }
  }

  /**
   * Send test log message
   */
  public async sendTestLog(guildId: string): Promise<void> {
    try {
      if (!guildId || typeof guildId !== 'string') {
        throw new Error('Valid Guild ID is required for test log');
      }

      await this.queueLog({
        guildId,
        type: LogType.TICKET_CREATE,
        userId: '123456789',
        channelId: '987654321',
        content: 'Teste do sistema de logs - Ticket criado',
        metadata: {
          user: '<@123456789>',
          channel: '<#987654321>',
          title: 'Ticket de Teste',
          description: 'Este é um ticket de teste para verificar o sistema de logs',
          priority: 'Alta',
          ticketId: 'test-123',
        },
      });

      this.logger.info(`Test log queued successfully for guild ${guildId}`);
    } catch (error) {
      this.logger.error('Error sending test log:', error);
      throw error;
    }
  }
}
