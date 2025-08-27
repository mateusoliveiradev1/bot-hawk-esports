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
  ColorResolvable
} from 'discord.js';
import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { ExtendedClient } from '../types/client';

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
  CHANGELOG = 'changelog'
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

  constructor(
    private client: ExtendedClient,
    private database: DatabaseService
  ) {
    this.logger = new Logger();
    this.setupEventListeners();
    this.startQueueProcessor();
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
    return this.guildConfigs.get(guildId) || this.getDefaultConfig(guildId);
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
        moderationActions: true
      },
      filters: {
        ignoreBots: true,
        ignoreChannels: [],
        ignoreRoles: [],
        ignoreUsers: []
      }
    };
  }

  /**
   * Check if event should be logged
   */
  private shouldLog(guildId: string, type: LogType, userId?: string, channelId?: string): boolean {
    const config = this.getGuildConfig(guildId);
    
    if (!config.enabled) return false;
    
    // Check if event type is enabled
    const eventKey = type.replace('_', '') as keyof typeof config.events;
    if (!config.events[eventKey as keyof typeof config.events]) return false;
    
    // Check filters
    if (userId && config.filters.ignoreUsers.includes(userId)) return false;
    if (channelId && config.filters.ignoreChannels.includes(channelId)) return false;
    
    return true;
  }

  /**
   * Add log entry to queue
   */
  private async queueLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): Promise<void> {
    const logEntry: LogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    
    this.logQueue.push(logEntry);
  }

  /**
   * Process log queue
   */
  private async processLogQueue(): Promise<void> {
    if (this.processingQueue || this.logQueue.length === 0) return;
    
    this.processingQueue = true;
    
    try {
      const entries = this.logQueue.splice(0, 10); // Process 10 at a time
      
      for (const entry of entries) {
        await this.sendLogToChannel(entry);
        await this.saveLogToDatabase(entry);
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
    setInterval(() => {
      this.processLogQueue();
    }, 1000); // Process every second
  }

  /**
   * Send log to appropriate channel
   */
  private async sendLogToChannel(entry: LogEntry): Promise<void> {
    try {
      const config = this.getGuildConfig(entry.guildId);
      const channelId = this.getLogChannelForType(entry.type, config);
      
      if (!channelId) return;
      
      const channel = this.client.channels.cache.get(channelId) as TextChannel;
      if (!channel) return;
      
      const embed = this.createLogEmbed(entry);
      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error sending log to channel:', error);
    }
  }

  /**
   * Get appropriate log channel for event type
   */
  private getLogChannelForType(type: LogType, config: LogConfig): string | undefined {
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
      
      case LogType.CHANGELOG:
        return config.channels.changelog;
      
      default:
        return config.channels.server;
    }
  }

  /**
   * Create log embed
   */
  private createLogEmbed(entry: LogEntry): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTimestamp(entry.timestamp)
      .setFooter({ text: `ID: ${entry.id}` });
    
    switch (entry.type) {
      case LogType.MESSAGE_DELETE:
        return embed
          .setTitle('🗑️ Mensagem Deletada')
          .setColor(0xff4757)
          .setDescription(entry.content)
          .addFields(
            { name: '👤 Autor', value: entry.metadata?.author || 'Desconhecido', inline: true },
            { name: '📍 Canal', value: entry.metadata?.channel || 'Desconhecido', inline: true }
          );
      
      case LogType.MESSAGE_EDIT:
        return embed
          .setTitle('✏️ Mensagem Editada')
          .setColor(0xffa502)
          .addFields(
            { name: '👤 Autor', value: entry.metadata?.author || 'Desconhecido', inline: true },
            { name: '📍 Canal', value: entry.metadata?.channel || 'Desconhecido', inline: true },
            { name: '📝 Antes', value: entry.metadata?.oldContent?.substring(0, 1024) || 'Sem conteúdo', inline: false },
            { name: '📝 Depois', value: entry.metadata?.newContent?.substring(0, 1024) || 'Sem conteúdo', inline: false }
          );
      
      case LogType.MEMBER_JOIN:
        return embed
          .setTitle('👋 Membro Entrou')
          .setColor(0x2ed573)
          .setDescription(entry.content)
          .addFields(
            { name: '👤 Usuário', value: entry.metadata?.user || 'Desconhecido', inline: true },
            { name: '📅 Conta Criada', value: entry.metadata?.accountAge || 'Desconhecido', inline: true },
            { name: '👥 Total de Membros', value: entry.metadata?.memberCount?.toString() || '0', inline: true }
          );
      
      case LogType.MEMBER_LEAVE:
        return embed
          .setTitle('👋 Membro Saiu')
          .setColor(0xff6b81)
          .setDescription(entry.content)
          .addFields(
            { name: '👤 Usuário', value: entry.metadata?.user || 'Desconhecido', inline: true },
            { name: '⏱️ Tempo no Servidor', value: entry.metadata?.timeInServer || 'Desconhecido', inline: true },
            { name: '👥 Total de Membros', value: entry.metadata?.memberCount?.toString() || '0', inline: true }
          );
      
      case LogType.MODERATION_WARN:
      case LogType.MODERATION_MUTE:
      case LogType.MODERATION_KICK:
      case LogType.MODERATION_BAN:
        return embed
          .setTitle(`🔨 ${entry.type.split('_')[1]?.toUpperCase() || 'MODERAÇÃO'}`)
          .setColor(0xff3838)
          .setDescription(entry.content)
          .addFields(
            { name: '👤 Usuário', value: entry.metadata?.target || 'Desconhecido', inline: true },
            { name: '👮 Moderador', value: entry.metadata?.moderator || 'Desconhecido', inline: true },
            { name: '📝 Motivo', value: entry.metadata?.reason || 'Não especificado', inline: false }
          );
      
      case LogType.CHANGELOG:
        return embed
          .setTitle('📋 Changelog')
          .setColor(0x3742fa)
          .setDescription(entry.content)
          .addFields(
            { name: '🏷️ Versão', value: entry.metadata?.version || 'N/A', inline: true },
            { name: '📝 Tipo', value: entry.metadata?.type || 'N/A', inline: true },
            { name: '👤 Autor', value: entry.metadata?.author || 'Sistema', inline: true }
          );
      
      default:
        return embed
          .setTitle('📊 Log do Servidor')
          .setColor(0x747d8c)
          .setDescription(entry.content);
    }
  }

  /**
   * Save log to database
   */
  private async saveLogToDatabase(entry: LogEntry): Promise<void> {
    try {
      // Implementation would depend on your database schema
      // This is a placeholder for database integration
      this.logger.debug(`Saving log entry ${entry.id} to database`);
    } catch (error) {
      this.logger.error('Error saving log to database:', error);
    }
  }

  // Event Handlers
  private async handleMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (message.partial || !message.guild) return;
    if (!this.shouldLog(message.guild.id, LogType.MESSAGE_DELETE, message.author?.id, message.channel.id)) return;
    
    const config = this.getGuildConfig(message.guild.id);
    if (config.filters.ignoreBots && message.author?.bot) return;
    
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
        attachments: message.attachments.size
      }
    });
  }

  private async handleMessageUpdate(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
    if (oldMessage.partial || newMessage.partial || !newMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;
    if (!this.shouldLog(newMessage.guild.id, LogType.MESSAGE_EDIT, newMessage.author?.id, newMessage.channel.id)) return;
    
    const config = this.getGuildConfig(newMessage.guild.id);
    if (config.filters.ignoreBots && newMessage.author?.bot) return;
    
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
        newContent: newMessage.content
      }
    });
  }

  private async handleBulkMessageDelete(messages: any): Promise<void> {
    const firstMessage = messages.first();
    if (!firstMessage?.guild) return;
    
    await this.queueLog({
      guildId: firstMessage.guild.id,
      type: LogType.MESSAGE_DELETE,
      channelId: firstMessage.channel.id,
      content: `${messages.size} mensagens deletadas em massa`,
      metadata: {
        count: messages.size,
        channel: `<#${firstMessage.channel.id}>`
      }
    });
  }

  private async handleMemberJoin(member: GuildMember): Promise<void> {
    if (!this.shouldLog(member.guild.id, LogType.MEMBER_JOIN, member.id)) return;
    
    const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
    
    await this.queueLog({
      guildId: member.guild.id,
      type: LogType.MEMBER_JOIN,
      userId: member.id,
      content: `${member.user.tag} entrou no servidor`,
      metadata: {
        user: `${member.user.tag} (${member.id})`,
        accountAge: `${accountAge} dias`,
        memberCount: member.guild.memberCount
      }
    });
  }

  private async handleMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    if (!member.guild) return;
    if (!this.shouldLog(member.guild.id, LogType.MEMBER_LEAVE, member.id)) return;
    
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
        memberCount: member.guild.memberCount
      }
    });
  }

  private async handleMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
    if (!this.shouldLog(newMember.guild.id, LogType.MEMBER_UPDATE, newMember.id)) return;
    
    const changes: string[] = [];
    
    if (oldMember.nickname !== newMember.nickname) {
      changes.push(`Apelido: ${oldMember.nickname || 'Nenhum'} → ${newMember.nickname || 'Nenhum'}`);
    }
    
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
      
      if (addedRoles.size > 0) {
        changes.push(`Cargos adicionados: ${addedRoles.map(r => r.name).join(', ')}`);
      }
      
      if (removedRoles.size > 0) {
        changes.push(`Cargos removidos: ${removedRoles.map(r => r.name).join(', ')}`);
      }
    }
    
    if (changes.length === 0) return;
    
    await this.queueLog({
      guildId: newMember.guild.id,
      type: LogType.MEMBER_UPDATE,
      userId: newMember.id,
      content: `${newMember.user.tag} foi atualizado`,
      metadata: {
        user: `${newMember.user.tag} (${newMember.id})`,
        changes: changes.join('\n')
      }
    });
  }

  private async handleMemberBan(ban: GuildBan): Promise<void> {
    if (!this.shouldLog(ban.guild.id, LogType.MEMBER_BAN, ban.user.id)) return;
    
    await this.queueLog({
      guildId: ban.guild.id,
      type: LogType.MEMBER_BAN,
      userId: ban.user.id,
      content: `${ban.user.tag} foi banido`,
      metadata: {
        user: `${ban.user.tag} (${ban.user.id})`,
        reason: ban.reason || 'Não especificado'
      }
    });
  }

  private async handleMemberUnban(ban: GuildBan): Promise<void> {
    if (!this.shouldLog(ban.guild.id, LogType.MEMBER_UNBAN, ban.user.id)) return;
    
    await this.queueLog({
      guildId: ban.guild.id,
      type: LogType.MEMBER_UNBAN,
      userId: ban.user.id,
      content: `${ban.user.tag} foi desbanido`,
      metadata: {
        user: `${ban.user.tag} (${ban.user.id})`
      }
    });
  }

  private async handleRoleCreate(role: Role): Promise<void> {
    if (!this.shouldLog(role.guild.id, LogType.ROLE_CREATE)) return;
    
    await this.queueLog({
      guildId: role.guild.id,
      type: LogType.ROLE_CREATE,
      content: `Cargo criado: ${role.name}`,
      metadata: {
        role: `${role.name} (${role.id})`,
        color: role.hexColor,
        permissions: role.permissions.toArray().join(', ')
      }
    });
  }

  private async handleRoleDelete(role: Role): Promise<void> {
    if (!this.shouldLog(role.guild.id, LogType.ROLE_DELETE)) return;
    
    await this.queueLog({
      guildId: role.guild.id,
      type: LogType.ROLE_DELETE,
      content: `Cargo deletado: ${role.name}`,
      metadata: {
        role: `${role.name} (${role.id})`
      }
    });
  }

  private async handleRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
    if (!this.shouldLog(newRole.guild.id, LogType.ROLE_UPDATE)) return;
    
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
    
    if (changes.length === 0) return;
    
    await this.queueLog({
      guildId: newRole.guild.id,
      type: LogType.ROLE_UPDATE,
      content: `Cargo atualizado: ${newRole.name}`,
      metadata: {
        role: `${newRole.name} (${newRole.id})`,
        changes: changes.join('\n')
      }
    });
  }

  private async handleChannelCreate(channel: any): Promise<void> {
    if (!channel.guild) return;
    if (!this.shouldLog(channel.guild.id, LogType.CHANNEL_CREATE)) return;
    
    await this.queueLog({
      guildId: channel.guild.id,
      type: LogType.CHANNEL_CREATE,
      channelId: channel.id,
      content: `Canal criado: ${channel.name}`,
      metadata: {
        channel: `${channel.name} (${channel.id})`,
        type: channel.type
      }
    });
  }

  private async handleChannelDelete(channel: any): Promise<void> {
    if (!channel.guild) return;
    if (!this.shouldLog(channel.guild.id, LogType.CHANNEL_DELETE)) return;
    
    await this.queueLog({
      guildId: channel.guild.id,
      type: LogType.CHANNEL_DELETE,
      channelId: channel.id,
      content: `Canal deletado: ${channel.name}`,
      metadata: {
        channel: `${channel.name} (${channel.id})`,
        type: channel.type
      }
    });
  }

  private async handleChannelUpdate(oldChannel: any, newChannel: any): Promise<void> {
    if (!oldChannel.guild || !newChannel.guild) return;
    if (!this.shouldLog(newChannel.guild.id, LogType.CHANNEL_UPDATE)) return;
    
    const changes: string[] = [];
    
    if (oldChannel.name !== newChannel.name) {
      changes.push(`Nome: ${oldChannel.name} → ${newChannel.name}`);
    }
    
    if (changes.length === 0) return;
    
    await this.queueLog({
      guildId: newChannel.guild.id,
      type: LogType.CHANNEL_UPDATE,
      channelId: newChannel.id,
      content: `Canal atualizado: ${newChannel.name}`,
      metadata: {
        channel: `${newChannel.name} (${newChannel.id})`,
        changes: changes.join('\n')
      }
    });
  }

  private async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    if (!newState.guild) return;
    
    const member = newState.member;
    if (!member) return;
    
    // User joined voice channel
    if (!oldState.channel && newState.channel) {
      if (!this.shouldLog(newState.guild.id, LogType.VOICE_JOIN, member.id)) return;
      
      await this.queueLog({
        guildId: newState.guild.id,
        type: LogType.VOICE_JOIN,
        userId: member.id,
        channelId: newState.channel.id,
        content: `${member.user.tag} entrou no canal de voz`,
        metadata: {
          user: `${member.user.tag} (${member.id})`,
          channel: newState.channel.name
        }
      });
    }
    // User left voice channel
    else if (oldState.channel && !newState.channel) {
      if (!this.shouldLog(newState.guild.id, LogType.VOICE_LEAVE, member.id)) return;
      
      await this.queueLog({
        guildId: newState.guild.id,
        type: LogType.VOICE_LEAVE,
        userId: member.id,
        channelId: oldState.channel.id,
        content: `${member.user.tag} saiu do canal de voz`,
        metadata: {
          user: `${member.user.tag} (${member.id})`,
          channel: oldState.channel.name
        }
      });
    }
    // User moved between voice channels
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      if (!this.shouldLog(newState.guild.id, LogType.VOICE_MOVE, member.id)) return;
      
      await this.queueLog({
        guildId: newState.guild.id,
        type: LogType.VOICE_MOVE,
        userId: member.id,
        channelId: newState.channel.id,
        content: `${member.user.tag} mudou de canal de voz`,
        metadata: {
          user: `${member.user.tag} (${member.id})`,
          fromChannel: oldState.channel.name,
          toChannel: newState.channel.name
        }
      });
    }
  }

  private async handleInviteCreate(invite: Invite): Promise<void> {
    if (!invite.guild || !this.shouldLog(invite.guild.id, LogType.INVITE_CREATE)) return;
    
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
        expiresAt: invite.expiresAt?.toISOString() || 'Nunca'
      }
    });
  }

  private async handleInviteDelete(invite: Invite): Promise<void> {
    if (!invite.guild || !this.shouldLog(invite.guild.id, LogType.INVITE_DELETE)) return;
    
    await this.queueLog({
      guildId: invite.guild.id,
      type: LogType.INVITE_DELETE,
      channelId: invite.channel?.id,
      content: `Convite deletado: ${invite.code}`,
      metadata: {
        code: invite.code,
        channel: invite.channel?.name || 'Desconhecido'
      }
    });
  }

  // Public Methods

  /**
   * Log moderation action
   */
  public async logModerationAction(guildId: string, data: ModerationLogData): Promise<void> {
    const actionTypes: { [key: string]: LogType } = {
      'warn': LogType.MODERATION_WARN,
      'mute': LogType.MODERATION_MUTE,
      'kick': LogType.MODERATION_KICK,
      'ban': LogType.MODERATION_BAN,
      'unban': LogType.MODERATION_UNBAN
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
        ...data.additional
      }
    });
  }

  /**
   * Log automod action
   */
  public async logAutomodAction(guildId: string, userId: string, action: string, reason: string, metadata?: any): Promise<void> {
    await this.queueLog({
      guildId,
      type: LogType.AUTOMOD_ACTION,
      userId,
      content: `Auto Moderação: ${action}`,
      metadata: {
        action,
        reason,
        ...metadata
      }
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
        author: entry.author
      }
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
    return {
      queueSize: this.logQueue.length,
      configuredGuilds: this.guildConfigs.size
    };
  }

  /**
   * Clear log queue (for testing/debugging)
   */
  public clearQueue(): void {
    this.logQueue = [];
    this.logger.info('Log queue cleared');
  }
}