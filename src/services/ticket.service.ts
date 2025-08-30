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
  private inactivityInterval?: NodeJS.Timeout;
  private readonly MAX_TICKETS_PER_GUILD = 100;
  private readonly DEFAULT_INACTIVITY_HOURS = 72;

  constructor(client: ExtendedClient) {
    // Validate dependencies
    if (!client) {
      throw new Error('ExtendedClient is required for TicketService');
    }
    if (!client.database) {
      throw new Error('DatabaseService is required for TicketService');
    }

    this.logger = new Logger();
    this.database = client.database;
    this.client = client;
    this.loggingService = new LoggingService(client, client.database);
    
    try {
      this.loadTicketSettings();
      this.loadActiveTickets();
      this.startInactivityChecker();
      this.logger.info('TicketService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize TicketService:', error);
      throw error;
    }
  }

  /**
   * Load ticket settings from database
   */
  private async loadTicketSettings(): Promise<void> {
    try {
      if (!this.database?.client?.ticketSettings) {
        this.logger.warn('TicketSettings table not available in database');
        return;
      }

      const settings = await this.database.client.ticketSettings.findMany();
      
      for (const setting of settings) {
        try {
          // Validate setting data
          if (!setting.guildId) {
            this.logger.warn('Invalid ticket setting found: missing guildId');
            continue;
          }

          const parsedNotifications = this.parseNotificationSettings(setting.notificationSettings);
          
          this.ticketSettings.set(setting.guildId, {
            guildId: setting.guildId,
            enabled: Boolean(setting.enabled),
            categoryId: setting.categoryId || undefined,
            logChannelId: setting.logChannelId || undefined,
            supportRoleId: setting.supportRoleId || undefined,
            maxTicketsPerUser: Math.max(1, Math.min(setting.maxTicketsPerUser || 3, 10)), // Clamp between 1-10
            autoAssign: Boolean(setting.autoAssign),
            requireReason: Boolean(setting.requireReason),
            allowAnonymous: Boolean(setting.allowAnonymous),
            closeAfterInactivity: Math.max(0, setting.closeAfterInactivity || this.DEFAULT_INACTIVITY_HOURS),
            notificationSettings: parsedNotifications
          });
        } catch (settingError) {
          this.logger.error(`Error processing ticket setting for guild ${setting.guildId}:`, settingError);
        }
      }
      
      this.logger.info(`Loaded ${settings.length} ticket settings`);
    } catch (error) {
      this.logger.error('Failed to load ticket settings:', error);
    }
  }

  /**
   * Load active tickets from database
   */
  private async loadActiveTickets(): Promise<void> {
    try {
      if (!this.database?.client?.ticket) {
        this.logger.warn('Ticket table not available in database');
        return;
      }

      const tickets = await this.database.client.ticket.findMany({
        where: {
          status: {
            in: ['open', 'in_progress']
          }
        }
      });

      let loadedCount = 0;
      let skippedCount = 0;

      for (const ticket of tickets) {
        try {
          // Validate ticket data
          if (!ticket.guildId || !ticket.userId || !ticket.id) {
            this.logger.warn(`Invalid ticket data found: ${ticket.id}`);
            skippedCount++;
            continue;
          }

          if (!this.activeTickets.has(ticket.guildId)) {
            this.activeTickets.set(ticket.guildId, new Map());
          }
          
          const guildTickets = this.activeTickets.get(ticket.guildId)!;
          
          // Check for duplicate tickets per user
          if (guildTickets.has(ticket.userId)) {
            this.logger.warn(`Duplicate active ticket found for user ${ticket.userId} in guild ${ticket.guildId}`);
          }
          
          guildTickets.set(ticket.userId, {
            id: ticket.id,
            userId: ticket.userId,
            guildId: ticket.guildId,
            channelId: ticket.channelId || undefined,
            title: ticket.title || 'Untitled Ticket',
            description: ticket.description || 'No description provided',
            status: this.validateTicketStatus(ticket.status),
            priority: this.validateTicketPriority(ticket.priority),
            assignedTo: ticket.assignedTo || undefined,
            tags: ticket.tags || undefined,
            metadata: this.parseTicketMetadata(ticket.metadata),
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt
          });
          
          loadedCount++;
        } catch (ticketError) {
          this.logger.error(`Error processing ticket ${ticket.id}:`, ticketError);
          skippedCount++;
        }
      }

      this.logger.info(`Loaded ${loadedCount} active tickets (${skippedCount} skipped due to errors)`);
    } catch (error) {
      this.logger.error('Failed to load active tickets:', error);
    }
  }

  /**
   * Parse notification settings safely
   */
  private parseNotificationSettings(notificationSettings: any): TicketSettings['notificationSettings'] {
    try {
      if (typeof notificationSettings === 'string') {
        const parsed = JSON.parse(notificationSettings);
        return {
          onCreate: Boolean(parsed.onCreate ?? true),
          onAssign: Boolean(parsed.onAssign ?? true),
          onClose: Boolean(parsed.onClose ?? true),
          onReopen: Boolean(parsed.onReopen ?? true)
        };
      }
      
      if (typeof notificationSettings === 'object' && notificationSettings !== null) {
        return {
          onCreate: Boolean(notificationSettings.onCreate ?? true),
          onAssign: Boolean(notificationSettings.onAssign ?? true),
          onClose: Boolean(notificationSettings.onClose ?? true),
          onReopen: Boolean(notificationSettings.onReopen ?? true)
        };
      }
    } catch (error) {
      this.logger.warn('Failed to parse notification settings, using defaults:', error);
    }
    
    return {
      onCreate: true,
      onAssign: true,
      onClose: true,
      onReopen: true
    };
  }

  /**
   * Validate and normalize ticket status
   */
  private validateTicketStatus(status: any): 'open' | 'in_progress' | 'closed' {
    const validStatuses = ['open', 'in_progress', 'closed'];
    if (typeof status === 'string' && validStatuses.includes(status)) {
      return status as 'open' | 'in_progress' | 'closed';
    }
    this.logger.warn(`Invalid ticket status: ${status}, defaulting to 'open'`);
    return 'open';
  }

  /**
   * Validate and normalize ticket priority
   */
  private validateTicketPriority(priority: any): 'low' | 'medium' | 'high' | 'urgent' {
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (typeof priority === 'string' && validPriorities.includes(priority)) {
      return priority as 'low' | 'medium' | 'high' | 'urgent';
    }
    this.logger.warn(`Invalid ticket priority: ${priority}, defaulting to 'medium'`);
    return 'medium';
  }

  /**
   * Parse ticket metadata safely
   */
  private parseTicketMetadata(metadata: any): any {
    try {
      if (typeof metadata === 'string') {
        return JSON.parse(metadata);
      }
      if (typeof metadata === 'object') {
        return metadata;
      }
    } catch (error) {
      this.logger.warn('Failed to parse ticket metadata:', error);
    }
    return {};
  }

  /**
   * Start inactivity checker
   */
  private startInactivityChecker(): void {
    if (this.inactivityInterval) {
      clearInterval(this.inactivityInterval);
    }
    
    this.inactivityInterval = setInterval(async () => {
      try {
        await this.checkInactiveTickets();
      } catch (error) {
        this.logger.error('Error in inactivity checker:', error);
      }
    }, 60 * 60 * 1000); // Check every hour
    
    this.logger.debug('Ticket inactivity checker started');
  }

  /**
   * Check for inactive tickets and close them
   */
  private async checkInactiveTickets(): Promise<void> {
    try {
      let closedCount = 0;
      let warningsSent = 0;
      
      for (const [guildId, guildTickets] of this.activeTickets) {
        const settings = this.getTicketSettings(guildId);
        if (!settings.enabled || settings.closeAfterInactivity <= 0) continue;

        const inactivityThreshold = new Date(Date.now() - settings.closeAfterInactivity * 60 * 60 * 1000);
        const warningThreshold = new Date(Date.now() - (settings.closeAfterInactivity - 2) * 60 * 60 * 1000); // 2 hours before closing
        const ticketsToClose: TicketData[] = [];
        const ticketsToWarn: TicketData[] = [];

        // Collect tickets that need action
        for (const [userId, ticket] of guildTickets) {
          if (ticket.updatedAt < inactivityThreshold) {
            ticketsToClose.push(ticket);
          } else if (settings.closeAfterInactivity > 2 && ticket.updatedAt < warningThreshold && !ticket.metadata?.warningsent) {
            ticketsToWarn.push(ticket);
          }
        }

        // Send warnings first
        for (const ticket of ticketsToWarn) {
          try {
            await this.sendInactivityWarning(guildId, ticket);
            
            // Mark warning as sent
            ticket.metadata = { ...ticket.metadata, warningSent: true };
            await this.database.client.ticket.update({
              where: { id: ticket.id },
              data: { metadata: ticket.metadata }
            });
            
            warningsSent++;
            this.logger.info(`Sent inactivity warning for ticket: ${ticket.id} in guild ${guildId}`);
          } catch (error) {
            this.logger.error(`Error sending warning for ticket ${ticket.id}:`, error);
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
      
      if (closedCount > 0 || warningsSent > 0) {
        this.logger.info(`Inactivity check completed: ${closedCount} tickets closed, ${warningsSent} warnings sent`);
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
            // Reset warning flag when there's activity
            if (ticket.metadata?.warningSent) {
              ticket.metadata = { ...ticket.metadata, warningSent: false };
              await this.database.client.ticket.update({
                where: { id: ticketId },
                data: { metadata: ticket.metadata }
              });
            }
            break;
          }
        }
      }
    } catch (error) {
      this.logger.error('Error updating ticket activity:', error);
    }
  }

  /**
   * Send inactivity warning to ticket channel
   */
  private async sendInactivityWarning(guildId: string, ticket: TicketData): Promise<void> {
    try {
      if (!ticket.channelId) return;

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const channel = guild.channels.cache.get(ticket.channelId) as TextChannel;
      if (!channel) return;

      const settings = this.getTicketSettings(guildId);
      const hoursRemaining = 2; // Warning is sent 2 hours before closure

      const warningEmbed = new EmbedBuilder()
        .setTitle('⚠️ Aviso de Inatividade')
        .setDescription(
          `Este ticket será fechado automaticamente em **${hoursRemaining} horas** devido à inatividade.\n\n` +
          `Para manter o ticket aberto, envie uma mensagem neste canal.\n\n` +
          `**Configuração atual:** Fechamento após ${settings.closeAfterInactivity} horas de inatividade.`
        )
        .setColor('#FFA500')
        .addFields(
          { name: '🆔 Ticket ID', value: `#${ticket.id.slice(-8)}`, inline: true },
          { name: '📅 Criado em', value: `<t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>`, inline: true },
          { name: '📝 Última atividade', value: `<t:${Math.floor(ticket.updatedAt.getTime() / 1000)}:R>`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Sistema de Tickets Automático' });

      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_keep_open_${ticket.id}`)
            .setLabel('Manter Aberto')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId(`ticket_close_${ticket.id}`)
            .setLabel('Fechar Agora')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒')
        );

      await channel.send({ 
        content: `<@${ticket.userId}>`, 
        embeds: [warningEmbed], 
        components: [actionRow] 
      });

      this.logger.info(`Inactivity warning sent for ticket ${ticket.id} in guild ${guildId}`);
    } catch (error) {
      this.logger.error('Error sending inactivity warning:', error);
      throw error;
    }
  }

  /**
   * Get ticket settings for guild
   */
  public getTicketSettings(guildId: string): TicketSettings {
    try {
      if (!guildId || typeof guildId !== 'string') {
        this.logger.warn('Invalid guildId provided to getTicketSettings');
        return this.getDefaultTicketSettings('unknown');
      }

      const settings = this.ticketSettings.get(guildId);
      if (settings) {
        return settings;
      }

      // Create and cache default settings for new guilds
      const defaultSettings = this.getDefaultTicketSettings(guildId);
      this.ticketSettings.set(guildId, defaultSettings);
      this.logger.debug(`Created default ticket settings for guild ${guildId}`);
      
      return defaultSettings;
    } catch (error) {
      this.logger.error('Error getting ticket settings:', error);
      return this.getDefaultTicketSettings(guildId || 'unknown');
    }
  }

  /**
   * Get default ticket settings
   */
  private getDefaultTicketSettings(guildId: string): TicketSettings {
    return {
      guildId,
      enabled: true,
      maxTicketsPerUser: 3,
      autoAssign: false,
      requireReason: true,
      allowAnonymous: false,
      closeAfterInactivity: this.DEFAULT_INACTIVITY_HOURS,
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
      // Input validation
      if (!guildId || typeof guildId !== 'string') {
        this.logger.warn('Invalid guildId provided to createTicket');
        return { success: false, message: 'ID do servidor inválido.' };
      }

      if (!userId || typeof userId !== 'string') {
        this.logger.warn('Invalid userId provided to createTicket');
        return { success: false, message: 'ID do usuário inválido.' };
      }

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return { success: false, message: 'Título do ticket é obrigatório.' };
      }

      if (!description || typeof description !== 'string' || description.trim().length === 0) {
        return { success: false, message: 'Descrição do ticket é obrigatória.' };
      }

      // Sanitize and validate inputs
      title = title.trim().slice(0, 100); // Limit title length
      description = description.trim().slice(0, 2000); // Limit description length
      priority = this.validateTicketPriority(priority);

      // Check database availability
      if (!this.database?.client) {
        this.logger.error('Database not available for ticket creation');
        return { success: false, message: 'Serviço de banco de dados indisponível.' };
      }

      const settings = this.getTicketSettings(guildId);
      if (!settings.enabled) {
        return { success: false, message: 'Sistema de tickets está desabilitado neste servidor.' };
      }

      // Check guild ticket limit
      const guildTickets = await this.getGuildTickets(guildId, 'open');
      if (guildTickets.length >= this.MAX_TICKETS_PER_GUILD) {
        this.logger.warn(`Guild ${guildId} has reached maximum ticket limit`);
        return { success: false, message: 'Servidor atingiu o limite máximo de tickets abertos.' };
      }

      // Check if user has reached max tickets
      const userTickets = this.getUserTickets(guildId, userId);
      if (userTickets.length >= settings.maxTicketsPerUser) {
        return { success: false, message: `Você já possui ${settings.maxTicketsPerUser} tickets abertos. Feche um ticket antes de criar outro.` };
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        this.logger.warn(`Guild not found: ${guildId}`);
        return { success: false, message: 'Servidor não encontrado.' };
      }

      const user = await guild.members.fetch(userId).catch((error) => {
        this.logger.warn(`Failed to fetch user ${userId} in guild ${guildId}:`, error);
        return null;
      });
      if (!user) {
        return { success: false, message: 'Usuário não encontrado no servidor.' };
      }

      // Create ticket in database with error handling
      let ticketData;
      try {
        ticketData = await this.database.client.ticket.create({
          data: {
            userId,
            guildId,
            title,
            description,
            priority,
            status: 'open',
            metadata: JSON.stringify({})
          }
        });
        this.logger.debug(`Ticket created in database: ${ticketData.id}`);
      } catch (error) {
        this.logger.error('Failed to create ticket in database:', error);
        return { success: false, message: 'Erro ao salvar ticket no banco de dados.' };
      }

      // Create ticket channel with rollback on failure
      const channel = await this.createTicketChannel(guild, user.user, ticketData.id, title);
      if (!channel) {
        // Rollback database creation
        try {
          await this.database.client.ticket.delete({ where: { id: ticketData.id } });
          this.logger.debug(`Rolled back ticket creation: ${ticketData.id}`);
        } catch (rollbackError) {
          this.logger.error('Failed to rollback ticket creation:', rollbackError);
        }
        return { success: false, message: 'Erro ao criar canal do ticket.' };
      }

      // Update ticket with channel ID
      try {
        await this.database.client.ticket.update({
          where: { id: ticketData.id },
          data: { channelId: channel.id }
        });
        this.logger.debug(`Updated ticket ${ticketData.id} with channel ID: ${channel.id}`);
      } catch (error) {
        this.logger.error('Failed to update ticket with channel ID:', error);
        // Try to clean up the channel
        try {
          await channel.delete('Failed to update ticket in database');
        } catch (cleanupError) {
          this.logger.error('Failed to cleanup channel after database error:', cleanupError);
        }
        return { success: false, message: 'Erro ao atualizar informações do ticket.' };
      }

      const ticket: TicketData = {
        id: ticketData.id,
        userId,
        guildId,
        channelId: channel.id,
        title,
        description,
        status: 'open',
        priority,
        assignedTo: ticketData.assignedTo || undefined,
        tags: ticketData.tags || undefined,
        metadata: this.parseTicketMetadata(ticketData.metadata),
        createdAt: ticketData.createdAt,
        updatedAt: ticketData.updatedAt
      };

      // Add to active tickets cache
      if (!this.activeTickets.has(guildId)) {
        this.activeTickets.set(guildId, new Map());
      }
      this.activeTickets.get(guildId)!.set(userId, ticket);
      this.logger.debug(`Added ticket ${ticket.id} to active tickets cache`);

      // Send initial message to ticket channel with error handling
      try {
        await this.sendTicketWelcomeMessage(channel, user.user, ticket);
        this.logger.debug(`Welcome message sent for ticket ${ticket.id}`);
      } catch (error) {
        this.logger.error('Failed to send welcome message:', error);
        // Don't fail the entire operation for this
      }

      // Auto-assign if enabled with error handling
      if (settings.autoAssign) {
        try {
          const assignee = await this.findAvailableAssignee(guildId);
          if (assignee) {
            const assignResult = await this.assignTicket(guildId, ticketData.id, assignee.id);
            if (assignResult.success) {
              this.logger.debug(`Auto-assigned ticket ${ticket.id} to ${assignee.id}`);
            } else {
              this.logger.warn(`Failed to auto-assign ticket ${ticket.id}: ${assignResult.message}`);
            }
          } else {
            this.logger.debug(`No available assignee found for ticket ${ticket.id}`);
          }
        } catch (error) {
          this.logger.error('Error during auto-assignment:', error);
          // Don't fail the entire operation for this
        }
      }

      // Send notification with error handling
      if (settings.notificationSettings.onCreate) {
        try {
          await this.sendTicketNotification(guildId, 'create', ticket);
          this.logger.debug(`Creation notification sent for ticket ${ticket.id}`);
        } catch (error) {
          this.logger.error('Failed to send creation notification:', error);
          // Don't fail the entire operation for this
        }
      }

      // Log ticket creation with error handling
      try {
        if (this.loggingService) {
          await this.loggingService.logTicketCreate(guild.id, {
            ticketId: ticket.id,
            userId: ticket.userId,
            channelId: ticket.channelId,
            title: ticket.title,
            description: ticket.description,
            priority: ticket.priority,
            createdAt: ticket.createdAt
          });
          this.logger.debug(`Logged ticket creation for ${ticket.id}`);
        }
      } catch (error) {
        this.logger.error('Failed to log ticket creation:', error);
        // Don't fail the entire operation for this
      }

      this.logger.info(`Ticket created successfully: ${ticket.id} by ${userId} in ${guildId}`);
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
      // Input validation
      if (!guild || !user || !ticketId || !title) {
        this.logger.error('Invalid parameters provided to createTicketChannel');
        return null;
      }

      if (typeof ticketId !== 'string' || ticketId.length < 8) {
        this.logger.error('Invalid ticketId format');
        return null;
      }

      const settings = this.getTicketSettings(guild.id);
      const channelName = `ticket-${ticketId.slice(-8)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      // Validate bot permissions
      const botMember = guild.members.me;
      if (!botMember) {
        this.logger.error('Bot member not found in guild');
        return null;
      }

      const requiredPermissions = [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages
      ];

      if (!botMember.permissions.has(requiredPermissions)) {
        this.logger.error('Bot lacks required permissions to create ticket channel');
        return null;
      }

      // Find or create category with error handling
      let category: CategoryChannel | null = null;
      if (settings.categoryId) {
        try {
          const categoryChannel = guild.channels.cache.get(settings.categoryId);
          if (categoryChannel && categoryChannel.type === ChannelType.GuildCategory) {
            category = categoryChannel as CategoryChannel;
            this.logger.debug(`Using configured category: ${category.name}`);
          } else {
            this.logger.warn(`Configured category ${settings.categoryId} not found or invalid`);
          }
        } catch (error) {
          this.logger.warn('Error accessing configured category:', error);
        }
      }
      
      if (!category) {
        // Find existing tickets category
        try {
          category = guild.channels.cache.find((c: any) => 
            c.type === ChannelType.GuildCategory && 
            c.name.toLowerCase().includes('ticket')
          ) as CategoryChannel;
          
          if (category) {
            this.logger.debug(`Found existing tickets category: ${category.name}`);
          }
        } catch (error) {
          this.logger.warn('Error finding existing tickets category:', error);
        }
        
        if (!category) {
          // Create new tickets category
          try {
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
            this.logger.info(`Created new tickets category: ${category?.name || 'Unknown'}`);
          } catch (error) {
            this.logger.error('Failed to create tickets category:', error);
            // Continue without category
          }
        }
      }

      // Prepare permission overwrites
      const permissionOverwrites = [
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
        {
          id: botMember.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ];

      // Add support role permissions if configured and valid
      if (settings.supportRoleId) {
        const supportRole = guild.roles.cache.get(settings.supportRoleId);
        if (supportRole) {
          permissionOverwrites.push({
            id: settings.supportRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ManageMessages
            ]
          });
          this.logger.debug(`Added support role permissions: ${supportRole.name}`);
        } else {
          this.logger.warn(`Support role ${settings.supportRoleId} not found`);
        }
      }

      // Create ticket channel with comprehensive error handling
      let channel: TextChannel;
      try {
        const channelOptions = {
          name: channelName,
          type: ChannelType.GuildText,
          parent: category?.id,
          topic: `Ticket: ${title.slice(0, 50)} | Usuário: ${user.tag} | ID: ${ticketId}`,
          permissionOverwrites
        };

        channel = await guild.channels.create(channelOptions);
        this.logger.info(`Created ticket channel: ${channel.name} (${channel.id})`);
      } catch (error) {
        this.logger.error('Failed to create ticket channel:', error);
        return null;
      }

      // Verify channel was created successfully
      if (!channel || !channel.id) {
        this.logger.error('Channel creation returned invalid result');
        return null;
      }

      // Verify bot can access the channel
      try {
        const botPermissions = channel.permissionsFor(botMember);
        if (!botPermissions || !botPermissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
          this.logger.error('Bot cannot access created ticket channel');
          // Try to delete the problematic channel
          try {
            await channel.delete('Bot cannot access channel');
          } catch (deleteError) {
            this.logger.error('Failed to cleanup inaccessible channel:', deleteError);
          }
          return null;
        }
      } catch (error) {
        this.logger.warn('Could not verify bot permissions on created channel:', error);
      }

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
   * Perform channel archival with enhanced error handling and retry logic
   */
  private async performChannelArchival(
    channel: TextChannel,
    guild: any,
    ticket: TicketData
  ): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // Wait before archiving (progressive delay on retries)
        const delay = 10000 + (retryCount * 5000); // 10s, 15s, 20s
        await new Promise(resolve => setTimeout(resolve, delay));

        // Validate channel still exists and is accessible
        const currentChannel = await this.validateChannelAccess(channel.id);
        if (!currentChannel) {
          this.logger.info(`Channel ${channel.id} no longer accessible or deleted`);
          return;
        }

        // Validate bot permissions before proceeding
        if (!await this.validateArchivePermissions(currentChannel, guild)) {
          this.logger.warn(`Insufficient permissions to archive channel ${channel.id}`);
          await this.deleteChannelSafely(currentChannel, 'Insufficient permissions for archival');
          return;
        }

        // Get or create archive category with enhanced error handling
        const archiveCategory = await this.getOrCreateArchiveCategory(guild);
        if (!archiveCategory) {
          this.logger.error('Failed to get or create archive category after all attempts');
          await this.deleteChannelSafely(currentChannel, 'Archive category unavailable');
          return;
        }

        // Perform archival operations with individual error handling
        await this.performArchivalOperations(currentChannel, archiveCategory, ticket);
        
        // Schedule cleanup with persistent storage
        await this.scheduleChannelCleanup(currentChannel.id, ticket.id);
        
        this.logger.info(`Successfully archived ticket channel: ${currentChannel.name}`);
        return; // Success - exit retry loop

      } catch (error) {
        retryCount++;
        this.logger.error(`Archival attempt ${retryCount} failed for channel ${channel.id}:`, error);
        
        if (retryCount >= maxRetries) {
          this.logger.error(`All archival attempts failed for channel ${channel.id}`);
          // Final fallback - try to delete the channel
          await this.deleteChannelSafely(channel, 'All archival attempts failed');
          return;
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }
  }

  /**
   * Safely delete a channel with enhanced error handling and fallback strategies
   */
  private async deleteChannelSafely(channel: TextChannel, reason: string): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // Validate channel access
        const currentChannel = await this.validateChannelAccess(channel.id);
        if (!currentChannel) {
          this.logger.info(`Channel ${channel.id} already deleted or inaccessible`);
          return;
        }

        // Check deletion permissions
        const botMember = currentChannel.guild.members.cache.get(this.client.user!.id);
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
          this.logger.warn(`No permission to delete channel ${channel.id}`);
          await this.hideChannelAsFallback(currentChannel);
          return;
        }

        await currentChannel.delete(reason);
        this.logger.info(`Successfully deleted ticket channel: ${currentChannel.name}`);
        return; // Success - exit retry loop

      } catch (error) {
        retryCount++;
        this.logger.error(`Deletion attempt ${retryCount} failed for channel ${channel.id}:`, error);
        
        if (retryCount >= maxRetries) {
          this.logger.error(`All deletion attempts failed for channel ${channel.id}`);
          // Final fallback - try to hide the channel
          await this.hideChannelAsFallback(channel);
          return;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
      }
    }
  }

  /**
   * Validate channel access and return the channel if accessible
   */
  private async validateChannelAccess(channelId: string): Promise<TextChannel | null> {
    try {
      // Try to fetch from cache first
      let channel = this.client.channels.cache.get(channelId) as TextChannel;
      
      // If not in cache, try to fetch from API
      if (!channel) {
        channel = await this.client.channels.fetch(channelId) as TextChannel;
      }
      
      // Validate it's a text channel and accessible
      if (!channel || !channel.isTextBased()) {
        return null;
      }
      
      return channel;
    } catch (error) {
      this.logger.debug(`Channel ${channelId} not accessible:`, error);
      return null;
    }
  }

  /**
   * Validate bot permissions for archival operations
   */
  private async validateArchivePermissions(channel: TextChannel, guild: any): Promise<boolean> {
    try {
      const botMember = guild.members.cache.get(this.client.user!.id);
      if (!botMember) return false;

      const requiredPermissions = [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageRoles
      ];

      return requiredPermissions.every(permission => 
        botMember.permissions.has(permission) || 
        channel.permissionsFor(botMember)?.has(permission)
      );
    } catch (error) {
      this.logger.error('Error validating archive permissions:', error);
      return false;
    }
  }

  /**
   * Get or create archive category with enhanced error handling
   */
  private async getOrCreateArchiveCategory(guild: any): Promise<CategoryChannel | null> {
    try {
      // Try to find existing archive category
      let archiveCategory = guild.channels.cache.find((c: any) => 
        c.type === ChannelType.GuildCategory && 
        (c.name.toLowerCase().includes('arquivo') || 
         c.name.toLowerCase().includes('closed') ||
         c.name.toLowerCase().includes('ticket') && c.name.toLowerCase().includes('arquiv'))
      ) as CategoryChannel;

      if (archiveCategory) {
        // Validate category is not full (Discord limit: 50 channels per category)
        const channelsInCategory = guild.channels.cache.filter((c: any) => c.parentId === archiveCategory.id).size;
        if (channelsInCategory >= 49) { // Leave room for one more
          // Create a new archive category
          const newCategory = await this.createNewArchiveCategory(guild, channelsInCategory);
          if (!newCategory) {
            throw new Error('Failed to create archive category');
          }
          archiveCategory = newCategory;
        }
        return archiveCategory;
      }

      // Create new archive category
      return await this.createNewArchiveCategory(guild, 0);
    } catch (error) {
      this.logger.error('Error getting or creating archive category:', error);
      return null;
    }
  }

  /**
   * Create a new archive category
   */
  private async createNewArchiveCategory(guild: any, existingCount: number): Promise<CategoryChannel | null> {
    try {
      const categoryName = existingCount > 0 
        ? `📁 TICKETS ARQUIVADOS ${Math.floor(existingCount / 49) + 1}`
        : '📁 TICKETS ARQUIVADOS';

      const archiveCategory = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: this.client.user!.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageRoles
            ]
          }
        ]
      });
      
      this.logger.info(`Created archive category: ${archiveCategory.name}`);
      return archiveCategory;
    } catch (error) {
      this.logger.error('Failed to create archive category:', error);
      return null;
    }
  }

  /**
   * Perform individual archival operations
   */
  private async performArchivalOperations(
    channel: TextChannel,
    archiveCategory: CategoryChannel,
    ticket: TicketData
  ): Promise<void> {
    // Move channel to archive category
    try {
      await channel.setParent(archiveCategory.id);
    } catch (error) {
      this.logger.error('Failed to move channel to archive category:', error);
      throw error;
    }

    // Rename channel with closed prefix
    try {
      const newName = `closed-${channel.name.replace(/^ticket-/, '').substring(0, 90)}`; // Discord limit
      await channel.setName(newName);
    } catch (error) {
      this.logger.warn('Failed to rename archived channel:', error);
      // Non-critical error, continue
    }

    // Update channel permissions
    try {
      // Remove user permissions
      if (ticket.userId) {
        await channel.permissionOverwrites.edit(ticket.userId, {
          ViewChannel: false,
          SendMessages: false
        });
      }

      // Ensure bot can still manage the channel
      await channel.permissionOverwrites.edit(this.client.user!.id, {
        ViewChannel: true,
        ManageChannels: true,
        ManageRoles: true
      });
    } catch (error) {
      this.logger.warn('Failed to update archived channel permissions:', error);
      // Non-critical error, continue
    }
  }

  /**
   * Schedule channel cleanup with persistent tracking
   */
  private async scheduleChannelCleanup(channelId: string, ticketId: string, delayHours: number = 168): Promise<void> {
    try {
      const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000);
      
      // Store cleanup task in database for persistence
      await this.database.client.ticketCleanup.upsert({
        where: {
          channelId_ticketId: {
            channelId,
            ticketId
          }
        },
        create: {
          channelId,
          ticketId,
          scheduledFor,
          status: 'scheduled'
        },
        update: {
          scheduledFor,
          status: 'scheduled',
          retryCount: 0,
          errorMessage: null
        }
      });
      
      this.logger.info(`Scheduled cleanup for ticket channel ${channelId} at ${scheduledFor.toISOString()}`);
      
    } catch (error) {
      this.logger.error(`Failed to schedule cleanup for channel ${channelId}:`, error);
      
      // Fallback to in-memory scheduling only
      setTimeout(async () => {
        await this.performScheduledCleanup(channelId, ticketId);
      }, delayHours * 60 * 60 * 1000);
    }
  }

  /**
   * Perform scheduled cleanup of archived channels
   */
  private async performScheduledCleanup(channelId: string, ticketId: string): Promise<void> {
    try {
      const channel = await this.validateChannelAccess(channelId);
      if (channel) {
        await this.deleteChannelSafely(channel, 'Scheduled cleanup after 7 days');
      }

      // Update cleanup status in database
      await this.database.client.ticketCleanup.updateMany({
        where: { channelId, ticketId },
        data: { status: 'completed', completedAt: new Date() }
      }).catch(error => {
        this.logger.warn('Failed to update cleanup status:', error);
      });
    } catch (error) {
      this.logger.error('Error in scheduled cleanup:', error);
    }
  }

  /**
   * Hide channel as fallback when deletion fails
   */
  private async hideChannelAsFallback(channel: TextChannel): Promise<void> {
    try {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
        ViewChannel: false,
        SendMessages: false
      });
      
      // Try to rename to indicate it's hidden
      try {
        const hiddenName = `hidden-${channel.name.substring(0, 90)}`;
        await channel.setName(hiddenName);
      } catch (renameError) {
        this.logger.warn('Failed to rename hidden channel:', renameError);
      }
      
      this.logger.info(`Hidden channel ${channel.name} due to deletion failure`);
    } catch (hideError) {
      this.logger.error(`Failed to hide channel ${channel.id}:`, hideError);
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
  public async updateTicketSettings(guildId: string, settings: Partial<TicketSettings>): Promise<void> {
    try {
      const currentSettings = this.getTicketSettings(guildId);
      const newSettings = { ...currentSettings, ...settings };
      this.ticketSettings.set(guildId, newSettings);
      
      // Save to database
      await this.database.client.ticketSettings.upsert({
        where: { guildId },
        update: {
          enabled: newSettings.enabled,
          categoryId: newSettings.categoryId,
          logChannelId: newSettings.logChannelId,
          supportRoleId: newSettings.supportRoleId,
          maxTicketsPerUser: newSettings.maxTicketsPerUser,
          autoAssign: newSettings.autoAssign,
          requireReason: newSettings.requireReason,
          allowAnonymous: newSettings.allowAnonymous,
          closeAfterInactivity: newSettings.closeAfterInactivity,
          notificationSettings: JSON.stringify(newSettings.notificationSettings)
        },
        create: {
          guildId,
          enabled: newSettings.enabled,
          categoryId: newSettings.categoryId,
          logChannelId: newSettings.logChannelId,
          supportRoleId: newSettings.supportRoleId,
          maxTicketsPerUser: newSettings.maxTicketsPerUser,
          autoAssign: newSettings.autoAssign,
          requireReason: newSettings.requireReason,
          allowAnonymous: newSettings.allowAnonymous,
          closeAfterInactivity: newSettings.closeAfterInactivity,
          notificationSettings: JSON.stringify(newSettings.notificationSettings)
        }
      });
      
      this.logger.info(`Ticket settings updated for guild ${guildId}`);
    } catch (error) {
      this.logger.error('Error updating ticket settings:', error);
      throw error;
    }
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