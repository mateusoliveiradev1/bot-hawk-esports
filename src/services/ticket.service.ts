import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, TextChannel, CategoryChannel, User, GuildMember } from 'discord.js';
import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { LoggingService } from './logging.service';
import { ExtendedClient } from '../types/client';

export interface TicketData {
  id: string;
  userId: string;
  guildId: string;
  channelId?: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  tags?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketSettings {
  guildId: string;
  enabled: boolean;
  categoryId?: string;
  logChannelId?: string;
  supportRoleId?: string;
  maxTicketsPerUser: number;
  autoAssign: boolean;
  requireReason: boolean;
  allowAnonymous: boolean;
  closeAfterInactivity: number; // hours
  notificationSettings: {
    onCreate: boolean;
    onAssign: boolean;
    onClose: boolean;
    onReopen: boolean;
  };
}

export class TicketService {
  private logger: Logger;
  private database: DatabaseService;
  private client: ExtendedClient;
  private loggingService: LoggingService;
  private ticketSettings: Map<string, TicketSettings> = new Map();
  private activeTickets: Map<string, Map<string, TicketData>> = new Map(); // guildId -> userId -> ticket

  constructor(client: ExtendedClient) {
    this.logger = new Logger();
    this.database = client.database;
    this.client = client;
    this.loggingService = new LoggingService(client, client.database);
    
    this.loadTicketSettings();
    this.loadActiveTickets();
    this.startInactivityChecker();
  }

  /**
   * Load ticket settings from database
   */
  private async loadTicketSettings(): Promise<void> {
    try {
      // Load from database when implemented
      // For now, use default settings
      this.logger.info('Ticket settings loaded');
    } catch (error) {
      this.logger.error('Failed to load ticket settings:', error);
    }
  }

  /**
   * Load active tickets from database
   */
  private async loadActiveTickets(): Promise<void> {
    try {
      const tickets = await this.database.client.ticket.findMany({
        where: {
          status: {
            in: ['open', 'in_progress']
          }
        }
      });

      for (const ticket of tickets) {
        if (!this.activeTickets.has(ticket.guildId)) {
          this.activeTickets.set(ticket.guildId, new Map());
        }
        
        this.activeTickets.get(ticket.guildId)!.set(ticket.userId, {
          id: ticket.id,
          userId: ticket.userId,
          guildId: ticket.guildId,
          channelId: ticket.channelId || undefined,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status as 'open' | 'in_progress' | 'closed',
          priority: ticket.priority as 'low' | 'medium' | 'high' | 'urgent',
          assignedTo: ticket.assignedTo || undefined,
          tags: ticket.tags || undefined,
          metadata: ticket.metadata,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt
        });
      }

      this.logger.info(`Loaded ${tickets.length} active tickets`);
    } catch (error) {
      this.logger.error('Failed to load active tickets:', error);
    }
  }

  /**
   * Start inactivity checker
   */
  private startInactivityChecker(): void {
    setInterval(async () => {
      await this.checkInactiveTickets();
    }, 60 * 60 * 1000); // Check every hour
  }

  /**
   * Check for inactive tickets and close them
   */
  private async checkInactiveTickets(): Promise<void> {
    try {
      let closedCount = 0;
      
      for (const [guildId, guildTickets] of this.activeTickets) {
        const settings = this.getTicketSettings(guildId);
        if (!settings.enabled || settings.closeAfterInactivity <= 0) continue;

        const inactivityThreshold = new Date(Date.now() - settings.closeAfterInactivity * 60 * 60 * 1000);
        const ticketsToClose: TicketData[] = [];

        // Collect tickets that need to be closed
        for (const [userId, ticket] of guildTickets) {
          if (ticket.updatedAt < inactivityThreshold) {
            ticketsToClose.push(ticket);
          }
        }

        // Close tickets with proper error handling
        for (const ticket of ticketsToClose) {
          try {
            const result = await this.closeTicket(
              guildId, 
              ticket.id, 
              'system', 
              `Fechado automaticamente por inatividade (${settings.closeAfterInactivity}h sem atividade)`
            );
            
            if (result.success) {
              closedCount++;
              this.logger.info(`Auto-closed inactive ticket: ${ticket.id} in guild ${guildId}`);
            } else {
              this.logger.warn(`Failed to auto-close ticket ${ticket.id}: ${result.message}`);
            }
          } catch (error) {
            this.logger.error(`Error auto-closing ticket ${ticket.id}:`, error);
          }
        }
      }
      
      if (closedCount > 0) {
        this.logger.info(`Inactivity check completed: ${closedCount} tickets closed`);
      }
    } catch (error) {
      this.logger.error('Error checking inactive tickets:', error);
    }
  }

  /**
   * Update ticket activity timestamp
   */
  public async updateTicketActivity(guildId: string, ticketId: string): Promise<void> {
    try {
      // Update in database
      await this.database.client.ticket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date() }
      });

      // Update in cache
      const guildTickets = this.activeTickets.get(guildId);
      if (guildTickets) {
        for (const [userId, ticket] of guildTickets) {
          if (ticket.id === ticketId) {
            ticket.updatedAt = new Date();
            break;
          }
        }
      }
    } catch (error) {
      this.logger.error('Error updating ticket activity:', error);
    }
  }

  /**
   * Get ticket settings for guild
   */
  public getTicketSettings(guildId: string): TicketSettings {
    return this.ticketSettings.get(guildId) || {
      guildId,
      enabled: true,
      maxTicketsPerUser: 3,
      autoAssign: false,
      requireReason: true,
      allowAnonymous: false,
      closeAfterInactivity: 72, // 3 days
      notificationSettings: {
        onCreate: true,
        onAssign: true,
        onClose: true,
        onReopen: true
      }
    };
  }

  /**
   * Create a new ticket
   */
  public async createTicket(
    guildId: string,
    userId: string,
    title: string,
    description: string,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
  ): Promise<{ success: boolean; message: string; ticket?: TicketData; channel?: TextChannel }> {
    try {
      const settings = this.getTicketSettings(guildId);
      if (!settings.enabled) {
        return { success: false, message: 'Sistema de tickets está desabilitado neste servidor.' };
      }

      // Check if user has reached max tickets
      const userTickets = this.getUserTickets(guildId, userId);
      if (userTickets.length >= settings.maxTicketsPerUser) {
        return { success: false, message: `Você já possui ${settings.maxTicketsPerUser} tickets abertos. Feche um ticket antes de criar outro.` };
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return { success: false, message: 'Servidor não encontrado.' };
      }

      const user = await guild.members.fetch(userId).catch(() => null);
      if (!user) {
        return { success: false, message: 'Usuário não encontrado no servidor.' };
      }

      // Create ticket in database
      const ticketData = await this.database.client.ticket.create({
        data: {
          userId,
          guildId,
          title,
          description,
          priority,
          status: 'open'
        }
      });

      // Create ticket channel
      const channel = await this.createTicketChannel(guild, user.user, ticketData.id, title);
      if (!channel) {
        // Rollback database creation
        await this.database.client.ticket.delete({ where: { id: ticketData.id } });
        return { success: false, message: 'Erro ao criar canal do ticket.' };
      }

      // Update ticket with channel ID
      await this.database.client.ticket.update({
        where: { id: ticketData.id },
        data: { channelId: channel.id }
      });

      const ticket: TicketData = {
        id: ticketData.id,
        userId,
        guildId,
        channelId: channel.id,
        title,
        description,
        status: 'open',
        priority,
        createdAt: ticketData.createdAt,
        updatedAt: ticketData.updatedAt
      };

      // Add to active tickets
      if (!this.activeTickets.has(guildId)) {
        this.activeTickets.set(guildId, new Map());
      }
      this.activeTickets.get(guildId)!.set(userId, ticket);

      // Send initial message to ticket channel
      await this.sendTicketWelcomeMessage(channel, user.user, ticket);

      // Auto-assign if enabled
      if (settings.autoAssign) {
        const assignee = await this.findAvailableAssignee(guildId);
        if (assignee) {
          await this.assignTicket(guildId, ticketData.id, assignee.id);
        }
      }

      // Send notification
      if (settings.notificationSettings.onCreate) {
        await this.sendTicketNotification(guildId, 'create', ticket);
      }

      // Log ticket creation
      await this.loggingService.logTicketCreate(guild.id, {
        ticketId: ticket.id,
        userId: ticket.userId,
        channelId: ticket.channelId,
        title: ticket.title,
        description: ticket.description,
        priority: ticket.priority,
        createdAt: ticket.createdAt
      });

      this.logger.info(`Ticket created: ${ticket.id} by ${userId} in ${guildId}`);
      return { success: true, message: 'Ticket criado com sucesso!', ticket, channel };
    } catch (error) {
      this.logger.error('Error creating ticket:', error);
      return { success: false, message: 'Erro interno ao criar ticket.' };
    }
  }

  /**
   * Create ticket channel
   */
  private async createTicketChannel(
    guild: any,
    user: User,
    ticketId: string,
    title: string
  ): Promise<TextChannel | null> {
    try {
      const settings = this.getTicketSettings(guild.id);
      const channelName = `ticket-${ticketId.slice(-8)}`;

      // Find or create category
      let category: CategoryChannel | null = null;
      if (settings.categoryId) {
        category = guild.channels.cache.get(settings.categoryId) as CategoryChannel;
      }
      
      if (!category) {
        // Find tickets category or create one
        category = guild.channels.cache.find((c: any) => 
          c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket')
        ) as CategoryChannel;
        
        if (!category) {
          category = await guild.channels.create({
            name: '🎫 TICKETS',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
              }
            ]
          });
        }
      }

      // Create ticket channel
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category?.id,
        topic: `Ticket: ${title} | Usuário: ${user.tag} | ID: ${ticketId}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks
            ]
          },
          // Add support role permissions if configured
          ...(settings.supportRoleId ? [{
            id: settings.supportRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ManageMessages
            ]
          }] : [])
        ]
      });

      return channel;
    } catch (error) {
      this.logger.error('Error creating ticket channel:', error);
      return null;
    }
  }

  /**
   * Send welcome message to ticket channel
   */
  private async sendTicketWelcomeMessage(
    channel: TextChannel,
    user: User,
    ticket: TicketData
  ): Promise<void> {
    try {
      const priorityEmojis = {
        low: '🟢',
        medium: '🟡',
        high: '🟠',
        urgent: '🔴'
      };

      const embed = new EmbedBuilder()
        .setTitle(`🎫 Ticket #${ticket.id.slice(-8)}`)
        .setDescription(`**Assunto:** ${ticket.title}\n\n**Descrição:**\n${ticket.description}`)
        .setColor('#0099FF')
        .addFields(
          { name: '👤 Usuário', value: `${user}`, inline: true },
          { name: '📊 Prioridade', value: `${priorityEmojis[ticket.priority]} ${ticket.priority.toUpperCase()}`, inline: true },
          { name: '📅 Criado em', value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:F>`, inline: true }
        )
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: 'Use os botões abaixo para gerenciar este ticket' });

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_claim_${ticket.id}`)
            .setLabel('Assumir Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👋'),
          new ButtonBuilder()
            .setCustomId(`ticket_priority_${ticket.id}`)
            .setLabel('Alterar Prioridade')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📊'),
          new ButtonBuilder()
            .setCustomId(`ticket_close_${ticket.id}`)
            .setLabel('Fechar Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒')
        );

      await channel.send({ embeds: [embed], components: [row] });
      await channel.send(`${user}, seu ticket foi criado! Nossa equipe de suporte irá atendê-lo em breve.`);
    } catch (error) {
      this.logger.error('Error sending ticket welcome message:', error);
    }
  }

  /**
   * Find available assignee for ticket
   */
  private async findAvailableAssignee(guildId: string): Promise<{ id: string } | null> {
    try {
      const settings = this.getTicketSettings(guildId);
      if (!settings.supportRoleId) return null;

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return null;

      const supportRole = guild.roles.cache.get(settings.supportRoleId);
      if (!supportRole) return null;

      // Get online support members
      const onlineSupport = supportRole.members.filter(member => 
        member.presence?.status === 'online' || member.presence?.status === 'idle'
      );

      if (onlineSupport.size === 0) return null;

      // Return random online support member
       const assignee = onlineSupport.random();
       return assignee ? { id: assignee.id } : null;
    } catch (error) {
      this.logger.error('Error finding available assignee:', error);
      return null;
    }
  }

  /**
   * Auto-assign ticket to available support member
   */
  private async autoAssignTicket(guildId: string, ticketId: string): Promise<void> {
    try {
      const settings = this.getTicketSettings(guildId);
      if (!settings.supportRoleId) return;

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const supportRole = guild.roles.cache.get(settings.supportRoleId);
      if (!supportRole) return;

      // Get online support members
      const onlineSupport = supportRole.members.filter(member => 
        member.presence?.status === 'online' || member.presence?.status === 'idle'
      );

      if (onlineSupport.size === 0) return;

      // Assign to random online support member
      const assignee = onlineSupport.random();
      if (assignee) {
        await this.assignTicket(guildId, ticketId, assignee.id);
      }
    } catch (error) {
      this.logger.error('Error auto-assigning ticket:', error);
    }
  }

  /**
   * Assign ticket to user
   */
  public async assignTicket(
    guildId: string,
    ticketId: string,
    assigneeId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const ticket = this.getTicketData(guildId, ticketId);
      if (!ticket) {
        return { success: false, message: 'Ticket não encontrado.' };
      }

      // Update database
      await this.database.client.ticket.update({
        where: { id: ticketId },
        data: { 
          assignedTo: assigneeId,
          status: 'in_progress',
          updatedAt: new Date()
        }
      });

      // Update cache
      const guildTickets = this.activeTickets.get(guildId);
      if (guildTickets) {
        for (const [userId, userTicket] of guildTickets) {
          if (userTicket.id === ticketId) {
            userTicket.assignedTo = assigneeId;
            userTicket.status = 'in_progress';
            userTicket.updatedAt = new Date();
            break;
          }
        }
      }

      // Send notification to ticket channel
      if (ticket.channelId) {
        const channel = this.client.channels.cache.get(ticket.channelId) as TextChannel;
        if (channel) {
          const assignee = await this.client.users.fetch(assigneeId).catch(() => null);
          if (assignee) {
            const embed = new EmbedBuilder()
              .setTitle('🎯 Ticket Assumido')
              .setDescription(`${assignee} assumiu este ticket e irá ajudá-lo.`)
              .setColor('#00FF00')
              .setTimestamp();
            
            await channel.send({ embeds: [embed] });
          }
        }
      }

      // Send notification
      const settings = this.getTicketSettings(guildId);
      if (settings.notificationSettings.onAssign) {
        await this.sendTicketNotification(guildId, 'assign', ticket, assigneeId);
      }

      this.logger.info(`Ticket ${ticketId} assigned to ${assigneeId}`);
      return { success: true, message: 'Ticket assumido com sucesso!' };
    } catch (error) {
      this.logger.error('Error assigning ticket:', error);
      return { success: false, message: 'Erro ao assumir ticket.' };
    }
  }

  /**
   * Close ticket
   */
  public async closeTicket(
    guildId: string,
    ticketId: string,
    closedBy: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const ticket = this.getTicketData(guildId, ticketId);
      if (!ticket) {
        return { success: false, message: 'Ticket não encontrado.' };
      }

      if (ticket.status === 'closed') {
        return { success: false, message: 'Ticket já está fechado.' };
      }

      // Update database
      await this.database.client.ticket.update({
        where: { id: ticketId },
        data: { 
          status: 'closed',
          updatedAt: new Date(),
          metadata: {
            ...ticket.metadata,
            closedBy,
            closedAt: new Date().toISOString(),
            closeReason: reason
          }
        }
      });

      // Remove from active tickets
      const guildTickets = this.activeTickets.get(guildId);
      if (guildTickets) {
        for (const [userId, userTicket] of guildTickets) {
          if (userTicket.id === ticketId) {
            guildTickets.delete(userId);
            break;
          }
        }
      }

      // Archive ticket channel
      if (ticket.channelId) {
        await this.archiveTicketChannel(guildId, ticket.channelId, ticket, closedBy, reason);
      }

      // Send notification
      const settings = this.getTicketSettings(guildId);
      if (settings.notificationSettings.onClose) {
        await this.sendTicketNotification(guildId, 'close', ticket, closedBy);
      }

      // Log ticket closure
      await this.loggingService.logTicketClose(guildId, {
        ticketId: ticket.id,
        userId: ticket.userId,
        channelId: ticket.channelId!,
        title: ticket.title,
        closedBy,
        reason: reason || 'Não especificado',
        createdAt: ticket.createdAt
      });

      this.logger.info(`Ticket ${ticketId} closed by ${closedBy}`);
      return { success: true, message: 'Ticket fechado com sucesso!' };
    } catch (error) {
      this.logger.error('Error closing ticket:', error);
      return { success: false, message: 'Erro ao fechar ticket.' };
    }
  }

  /**
   * Archive ticket channel
   */
  private async archiveTicketChannel(
    guildId: string,
    channelId: string,
    ticket: TicketData,
    closedBy: string,
    reason?: string
  ): Promise<void> {
    try {
      const channel = this.client.channels.cache.get(channelId) as TextChannel;
      if (!channel) {
        this.logger.warn(`Channel ${channelId} not found for ticket ${ticket.id}`);
        return;
      }

      const guild = channel.guild;
      if (!guild) {
        this.logger.warn(`Guild not found for channel ${channelId}`);
        return;
      }

      const closer = await this.client.users.fetch(closedBy).catch(() => null);

      // Send closure message
      const embed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fechado')
        .setDescription(`Este ticket foi fechado por ${closer?.tag || 'Sistema'}.`)
        .setColor('#FF0000')
        .addFields(
          { name: '📝 Motivo', value: reason || 'Não especificado', inline: false },
          { name: '📅 Fechado em', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setTimestamp();

      try {
        await channel.send({ embeds: [embed] });
      } catch (error) {
        this.logger.warn('Could not send closure message to ticket channel:', error);
      }

      // Archive the channel with proper error handling
      await this.performChannelArchival(channel, guild, ticket);

    } catch (error) {
      this.logger.error('Error in archive ticket channel:', error);
    }
  }

  /**
   * Perform channel archival with proper error handling
   */
  private async performChannelArchival(
    channel: TextChannel,
    guild: any,
    ticket: TicketData
  ): Promise<void> {
    try {
      // Wait 10 seconds before archiving
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Check if channel still exists
      const currentChannel = this.client.channels.cache.get(channel.id) as TextChannel;
      if (!currentChannel) {
        this.logger.info(`Channel ${channel.id} already deleted`);
        return;
      }

      // Try to find or create archive category
      let archiveCategory = guild.channels.cache.find((c: any) => 
        c.type === ChannelType.GuildCategory && 
        (c.name.toLowerCase().includes('arquivo') || c.name.toLowerCase().includes('closed'))
      ) as CategoryChannel;

      if (!archiveCategory) {
        try {
          archiveCategory = await guild.channels.create({
            name: '📁 TICKETS ARQUIVADOS',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
              }
            ]
          });
          this.logger.info(`Created archive category: ${archiveCategory.name}`);
        } catch (error) {
          this.logger.error('Failed to create archive category:', error);
          // If we can't create archive category, just delete the channel
          await this.deleteChannelSafely(currentChannel, 'Failed to archive - deleting directly');
          return;
        }
      }

      try {
        // Move channel to archive category
        await currentChannel.setParent(archiveCategory.id);
        
        // Rename channel with closed prefix
        const newName = `closed-${currentChannel.name.replace(/^ticket-/, '')}`;
        await currentChannel.setName(newName);
        
        // Remove user permissions
        if (ticket.userId) {
          await currentChannel.permissionOverwrites.edit(ticket.userId, {
            ViewChannel: false,
            SendMessages: false
          });
        }

        this.logger.info(`Archived ticket channel: ${currentChannel.name}`);

        // Schedule deletion after 7 days
        setTimeout(async () => {
          await this.deleteChannelSafely(currentChannel, 'Ticket archive cleanup after 7 days');
        }, 7 * 24 * 60 * 60 * 1000); // 7 days

      } catch (archiveError) {
        this.logger.error('Error during channel archival:', archiveError);
        // If archiving fails, delete the channel directly
        await this.deleteChannelSafely(currentChannel, 'Archival failed - deleting directly');
      }

    } catch (error) {
      this.logger.error('Error in performChannelArchival:', error);
      // Last resort: try to delete the channel
      try {
        await channel.delete('Emergency cleanup');
      } catch (deleteError) {
        this.logger.error('Failed to delete channel in emergency cleanup:', deleteError);
      }
    }
  }

  /**
   * Safely delete a channel with proper error handling
   */
  private async deleteChannelSafely(channel: TextChannel, reason: string): Promise<void> {
    try {
      // Check if channel still exists
      const currentChannel = this.client.channels.cache.get(channel.id);
      if (!currentChannel) {
        this.logger.info(`Channel ${channel.id} already deleted`);
        return;
      }

      await channel.delete(reason);
      this.logger.info(`Successfully deleted ticket channel: ${channel.name}`);
    } catch (error) {
      this.logger.error(`Failed to delete channel ${channel.id}:`, error);
      
      // If deletion fails due to permissions, try to at least hide it
      try {
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
          ViewChannel: false,
          SendMessages: false
        });
        this.logger.info(`Hidden channel ${channel.name} due to deletion failure`);
      } catch (hideError) {
        this.logger.error(`Failed to hide channel ${channel.id}:`, hideError);
      }
    }
  }

  /**
   * Send ticket notification
   */
  private async sendTicketNotification(
    guildId: string,
    type: 'create' | 'assign' | 'close' | 'reopen',
    ticket: TicketData,
    actorId?: string
  ): Promise<void> {
    try {
      const settings = this.getTicketSettings(guildId);
      if (!settings.logChannelId) return;

      const channel = this.client.channels.cache.get(settings.logChannelId) as TextChannel;
      if (!channel) return;

      const user = await this.client.users.fetch(ticket.userId).catch(() => null);
      const actor = actorId ? await this.client.users.fetch(actorId).catch(() => null) : null;

      const colors = {
        create: '#00FF00',
        assign: '#0099FF',
        close: '#FF0000',
        reopen: '#FFA500'
      };

      const titles = {
        create: '🎫 Novo Ticket Criado',
        assign: '🎯 Ticket Assumido',
        close: '🔒 Ticket Fechado',
        reopen: '🔓 Ticket Reaberto'
      };

      const embed = new EmbedBuilder()
        .setTitle(titles[type])
        .setColor(colors[type] as any)
        .addFields(
          { name: '🆔 ID', value: `#${ticket.id.slice(-8)}`, inline: true },
          { name: '👤 Usuário', value: user ? `${user.tag}` : 'Desconhecido', inline: true },
          { name: '📊 Prioridade', value: ticket.priority.toUpperCase(), inline: true },
          { name: '📝 Assunto', value: ticket.title, inline: false }
        )
        .setTimestamp();

      if (actor && type !== 'create') {
        embed.addFields({ name: '👨‍💼 Ação por', value: actor.tag, inline: true });
      }

      if (ticket.channelId) {
        embed.addFields({ name: '🔗 Canal', value: `<#${ticket.channelId}>`, inline: true });
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error sending ticket notification:', error);
    }
  }

  /**
   * Get ticket by ID
   */
  public async getTicketById(guildId: string, ticketId: string): Promise<TicketData | null> {
    try {
      // Check cache first
      const guildTickets = this.activeTickets.get(guildId);
      if (guildTickets) {
        for (const ticket of guildTickets.values()) {
          if (ticket.id === ticketId) {
            return ticket;
          }
        }
      }

      // Check database
      const ticket = await this.database.client.ticket.findUnique({
        where: { id: ticketId }
      });

      if (!ticket) return null;

      return {
        id: ticket.id,
        userId: ticket.userId,
        guildId: ticket.guildId,
        channelId: ticket.channelId || undefined,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status as 'open' | 'in_progress' | 'closed',
        priority: ticket.priority as 'low' | 'medium' | 'high' | 'urgent',
        assignedTo: ticket.assignedTo || undefined,
        tags: ticket.tags || undefined,
        metadata: ticket.metadata,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      };
    } catch (error) {
      this.logger.error('Error getting ticket by ID:', error);
      return null;
    }
  }

  /**
   * Get ticket data by ID
   */
  public getTicketData(guildId: string, ticketId: string): TicketData | null {
    const guildTickets = this.activeTickets.get(guildId);
    if (!guildTickets) return null;

    for (const [userId, ticket] of guildTickets) {
      if (ticket.id === ticketId) {
        return ticket;
      }
    }
    return null;
  }

  /**
   * Get user tickets
   */
  public getUserTickets(guildId: string, userId: string): TicketData[] {
    const guildTickets = this.activeTickets.get(guildId);
    if (!guildTickets) return [];

    const userTicket = guildTickets.get(userId);
    return userTicket ? [userTicket] : [];
  }

  /**
   * Get all tickets for guild
   */
  public async getGuildTickets(guildId: string, status?: 'open' | 'in_progress' | 'closed'): Promise<TicketData[]> {
    try {
      const where: any = { guildId };
      if (status) {
        where.status = status;
      }

      const tickets = await this.database.client.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      return tickets.map(ticket => ({
        id: ticket.id,
        userId: ticket.userId,
        guildId: ticket.guildId,
        channelId: ticket.channelId || undefined,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status as 'open' | 'in_progress' | 'closed',
        priority: ticket.priority as 'low' | 'medium' | 'high' | 'urgent',
        assignedTo: ticket.assignedTo || undefined,
        tags: ticket.tags || undefined,
        metadata: ticket.metadata,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      }));
    } catch (error) {
      this.logger.error('Error getting guild tickets:', error);
      return [];
    }
  }

  /**
   * Update ticket settings
   */
  public updateTicketSettings(guildId: string, settings: Partial<TicketSettings>): void {
    const currentSettings = this.getTicketSettings(guildId);
    const newSettings = { ...currentSettings, ...settings };
    this.ticketSettings.set(guildId, newSettings);
    
    // TODO: Save to database
    this.logger.info(`Ticket settings updated for guild ${guildId}`);
  }

  /**
   * Get ticket statistics
   */
  public async getTicketStats(guildId: string): Promise<{
    total: number;
    open: number;
    inProgress: number;
    closed: number;
    avgResponseTime: number;
    avgResolutionTime: number;
  }> {
    try {
      const [total, open, inProgress, closed] = await Promise.all([
        this.database.client.ticket.count({ where: { guildId } }),
        this.database.client.ticket.count({ where: { guildId, status: 'open' } }),
        this.database.client.ticket.count({ where: { guildId, status: 'in_progress' } }),
        this.database.client.ticket.count({ where: { guildId, status: 'closed' } })
      ]);

      // TODO: Calculate actual response and resolution times
      const avgResponseTime = 30; // minutes
      const avgResolutionTime = 120; // minutes

      return {
        total,
        open,
        inProgress,
        closed,
        avgResponseTime,
        avgResolutionTime
      };
    } catch (error) {
      this.logger.error('Error getting ticket stats:', error);
      return {
        total: 0,
        open: 0,
        inProgress: 0,
        closed: 0,
        avgResponseTime: 0,
        avgResolutionTime: 0
      };
    }
  }
}