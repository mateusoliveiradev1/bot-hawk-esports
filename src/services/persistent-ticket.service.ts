import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  CategoryChannel,
  User,
  GuildMember,
  ButtonInteraction,
  Guild
} from 'discord.js';
import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { LoggingService } from './logging.service';
import { ExtendedClient } from '../types/client';
import { TicketService, TicketData } from './ticket.service';

export interface PersistentTicketConfig {
  guildId: string;
  channelId: string;
  categoryId?: string;
  supportRoleId?: string;
  logChannelId?: string;
  maxTicketsPerUser: number;
  autoClose: boolean;
  autoCloseHours: number;
}

/**
 * Persistent Ticket System Service
 * Manages a fixed embed with buttons in a designated channel for ticket creation
 */
export class PersistentTicketService {
  private logger: Logger;
  private database: DatabaseService;
  private client: ExtendedClient;
  private ticketService: TicketService;
  private loggingService: LoggingService;
  private configs: Map<string, PersistentTicketConfig> = new Map();
  private embedMessages: Map<string, string> = new Map(); // guildId -> messageId

  constructor(client: ExtendedClient) {
    // Validate dependencies
    if (!client) {
      throw new Error('ExtendedClient is required for PersistentTicketService');
    }
    if (!client.database) {
      throw new Error('DatabaseService is required for PersistentTicketService');
    }

    this.logger = new Logger();
    this.database = client.database;
    this.client = client;
    
    try {
      this.ticketService = new TicketService(client);
      this.loggingService = new LoggingService(client, client.database);
      
      this.loadConfigurations();
      this.setupEventListeners();
      
      this.logger.info('PersistentTicketService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize PersistentTicketService:', error);
      throw error;
    }
  }

  /**
   * Load persistent ticket configurations from database
   */
  private async loadConfigurations(): Promise<void> {
    try {
      // Check if database table exists
      if (!this.database.client.persistentTicketConfig) {
        this.logger.warn('persistentTicketConfig table not available in database');
        return;
      }

      const configs = await this.database.client.persistentTicketConfig.findMany();
      let loadedCount = 0;
      let skippedCount = 0;
      
      for (const config of configs) {
        try {
          // Validate required fields
          if (!config.guildId || !config.channelId) {
            this.logger.warn(`Skipping invalid config: missing guildId or channelId`, config);
            skippedCount++;
            continue;
          }

          // Normalize and validate values
          const normalizedConfig: PersistentTicketConfig = {
            guildId: config.guildId,
            channelId: config.channelId,
            categoryId: config.categoryId || undefined,
            supportRoleId: config.supportRoleId || undefined,
            logChannelId: config.logChannelId || undefined,
            maxTicketsPerUser: Math.max(1, Math.min(config.maxTicketsPerUser || 3, 10)),
            autoClose: Boolean(config.autoClose),
            autoCloseHours: Math.max(1, Math.min(config.autoCloseHours || 24, 168)) // Max 1 week
          };

          this.configs.set(config.guildId, normalizedConfig);
          loadedCount++;
        } catch (configError) {
          this.logger.error(`Error processing config for guild ${config.guildId}:`, configError);
          skippedCount++;
        }
      }
      
      this.logger.info(`Loaded ${loadedCount} persistent ticket configurations (${skippedCount} skipped due to errors)`);
      
      // Initialize embeds for all configured guilds
      if (loadedCount > 0) {
        await this.initializeAllEmbeds();
      }
    } catch (error) {
      this.logger.error('Failed to load persistent ticket configurations:', error);
    }
  }

  /**
   * Setup event listeners for button interactions
   */
  private setupEventListeners(): void {
    try {
      this.client.on('interactionCreate', async (interaction) => {
        try {
          if (!interaction.isButton()) return;
          if (!interaction.guildId) return;
          
          const customId = interaction.customId;
          
          if (customId && customId.startsWith('ticket_')) {
            await this.handleTicketButton(interaction);
          }
        } catch (error) {
          this.logger.error('Error in interaction event handler:', error);
        }
      });
      
      this.logger.debug('Event listeners setup successfully');
    } catch (error) {
      this.logger.error('Failed to setup event listeners:', error);
      throw error;
    }
  }

  /**
   * Handle ticket button interactions
   */
  private async handleTicketButton(interaction: ButtonInteraction): Promise<void> {
    try {
      // Validate interaction data
      if (!interaction.customId || !interaction.guildId || !interaction.user) {
        this.logger.warn('Invalid interaction data for ticket button');
        return;
      }

      const customIdParts = interaction.customId.split('_');
      if (customIdParts.length < 2) {
        this.logger.warn(`Invalid customId format: ${interaction.customId}`);
        await interaction.reply({
          content: '❌ Formato de botão inválido.',
          ephemeral: true
        });
        return;
      }

      const action = customIdParts[1];
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      
      // Check if guild has persistent ticket configuration
      const config = this.configs.get(guildId);
      if (!config) {
        await interaction.reply({
          content: '❌ Sistema de tickets não configurado neste servidor.',
          ephemeral: true
        });
        return;
      }
      
      this.logger.debug(`Processing ticket button action: ${action} for user ${userId} in guild ${guildId}`);
      
      switch (action) {
        case 'create':
          await this.handleCreateTicket(interaction, guildId, userId);
          break;
        case 'close':
          await this.handleCloseTicket(interaction, guildId, userId);
          break;
        case 'claim':
          await this.handleClaimTicket(interaction, guildId, userId);
          break;
        default:
          this.logger.warn(`Unknown ticket action: ${action}`);
          await interaction.reply({
            content: '❌ Ação não reconhecida.',
            ephemeral: true
          });
      }
    } catch (error) {
      this.logger.error('Error handling ticket button:', error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ Ocorreu um erro ao processar sua solicitação.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ Ocorreu um erro ao processar sua solicitação.'
          });
        }
      } catch (replyError) {
        this.logger.error('Failed to send error response:', replyError);
      }
    }
  }

  /**
   * Handle ticket creation
   */
  private async handleCreateTicket(
    interaction: ButtonInteraction,
    guildId: string,
    userId: string
  ): Promise<void> {
    try {
      // Validate input parameters
      if (!guildId || !userId) {
        this.logger.warn('Invalid parameters for ticket creation');
        await interaction.reply({
          content: '❌ Dados inválidos para criação de ticket.',
          ephemeral: true
        });
        return;
      }

      const config = this.configs.get(guildId);
      if (!config) {
        this.logger.warn(`No persistent ticket config found for guild ${guildId}`);
        await interaction.reply({
          content: '❌ Sistema de tickets não configurado neste servidor.',
          ephemeral: true
        });
        return;
      }

      // Check if user already has maximum tickets
      let userTickets: any[] = [];
      try {
        userTickets = this.ticketService.getUserTickets(guildId, userId)
          .filter(ticket => ticket.status !== 'closed');
      } catch (error) {
        this.logger.error('Error getting user tickets:', error);
        await interaction.reply({
          content: '❌ Erro ao verificar tickets existentes.',
          ephemeral: true
        });
        return;
      }
      
      if (userTickets.length >= config.maxTicketsPerUser) {
        await interaction.reply({
          content: `❌ Você já possui ${config.maxTicketsPerUser} ticket(s) aberto(s). Feche um ticket existente antes de criar um novo.`,
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      // Create ticket with default values
      const result = await this.ticketService.createTicket(
        guildId,
        userId,
        'Suporte Geral',
        'Ticket criado através do sistema persistente',
        'medium'
      );

      if (!result.success) {
        this.logger.warn(`Failed to create ticket: ${result.message}`);
        await interaction.editReply({
          content: `❌ ${result.message}`
        });
        return;
      }

      if (!result.ticket) {
        this.logger.error('Ticket creation succeeded but no ticket data returned');
        await interaction.editReply({
          content: '❌ Erro interno: dados do ticket não disponíveis.'
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🎟️ Ticket Criado!')
        .setDescription(
          `Seu ticket foi criado com sucesso!\n\n` +
          `**Canal:** ${result.channel ? `<#${result.channel.id}>` : 'Canal não disponível'}\n` +
          `**ID:** \`${result.ticket.id}\`\n` +
          `**Prioridade:** ${result.ticket.priority || 'medium'}`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Log ticket creation
      try {
        await this.logTicketAction('create', guildId, result.ticket, interaction.user);
      } catch (logError) {
        this.logger.error('Failed to log ticket creation:', logError);
        // Don't fail the entire operation for logging errors
      }
      
      this.logger.info(`Persistent ticket created: ${result.ticket.id} for user ${userId} in guild ${guildId}`);
    } catch (error) {
      this.logger.error('Error in handleCreateTicket:', error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ Erro interno ao criar ticket.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ Erro interno ao criar ticket.'
          });
        }
      } catch (replyError) {
        this.logger.error('Failed to send error response in handleCreateTicket:', replyError);
      }
    }
  }

  /**
   * Handle ticket closing
   */
  private async handleCloseTicket(
    interaction: ButtonInteraction,
    guildId: string,
    userId: string
  ): Promise<void> {
    // This should only work in ticket channels
    const channel = interaction.channel as TextChannel;
    if (!channel || !channel.name.startsWith('ticket-')) {
      await interaction.reply({
        content: '❌ Este botão só funciona em canais de ticket.',
        ephemeral: true
      });
      return;
    }

    // Extract ticket ID from channel name
    const ticketId = channel.name.split('-')[1];
    if (!ticketId) {
      await interaction.reply({
        content: '❌ Não foi possível identificar o ID do ticket.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    const result = await this.ticketService.closeTicket(
      guildId,
      ticketId,
      userId,
      'Fechado pelo usuário'
    );

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.message}`
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔒 Ticket Fechado')
      .setDescription('Este ticket foi fechado e será arquivado em breve.')
      .setColor(0xff0000)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle ticket claiming by staff
   */
  private async handleClaimTicket(
    interaction: ButtonInteraction,
    guildId: string,
    userId: string
  ): Promise<void> {
    const member = interaction.member as GuildMember;
    const config = this.configs.get(guildId);
    
    // Check if user has support role
    if (config?.supportRoleId && !member.roles.cache.has(config.supportRoleId)) {
      await interaction.reply({
        content: '❌ Você não tem permissão para reivindicar tickets.',
        ephemeral: true
      });
      return;
    }

    // This should only work in ticket channels
    const channel = interaction.channel as TextChannel;
    if (!channel || !channel.name.startsWith('ticket-')) {
      await interaction.reply({
        content: '❌ Este botão só funciona em canais de ticket.',
        ephemeral: true
      });
      return;
    }

    // Extract ticket ID from channel name
    const ticketId = channel.name.split('-')[1];
    if (!ticketId) {
      await interaction.reply({
        content: '❌ Não foi possível identificar o ID do ticket.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    const result = await this.ticketService.assignTicket(guildId, ticketId, userId);

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.message}`
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('👤 Ticket Reivindicado')
      .setDescription(`Este ticket foi reivindicado por <@${userId}>.`)
      .setColor(0x0099ff)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Initialize embed for a specific guild
   */
  public async initializeEmbed(guildId: string): Promise<boolean> {
    try {
      // Validate input
      if (!guildId) {
        this.logger.warn('Invalid guildId provided to initializeEmbed');
        return false;
      }

      const config = this.configs.get(guildId);
      if (!config) {
        this.logger.warn(`No persistent ticket config found for guild ${guildId}`);
        return false;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        this.logger.warn(`Guild ${guildId} not found in client cache`);
        return false;
      }

      // Validate bot permissions in guild
      const botMember = guild.members.cache.get(this.client.user?.id || '');
      if (!botMember) {
        this.logger.warn(`Bot member not found in guild ${guildId}`);
        return false;
      }

      const channel = guild.channels.cache.get(config.channelId) as TextChannel;
      if (!channel) {
        this.logger.warn(`Ticket channel ${config.channelId} not found in guild ${guildId}`);
        return false;
      }

      // Check if channel is a text channel
      if (channel.type !== ChannelType.GuildText) {
        this.logger.warn(`Channel ${config.channelId} is not a text channel in guild ${guildId}`);
        return false;
      }

      // Check bot permissions in the channel
      const botPermissions = channel.permissionsFor(botMember);
      if (!botPermissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ViewChannel])) {
        this.logger.warn(`Bot lacks required permissions in channel ${config.channelId} in guild ${guildId}`);
        return false;
      }

      // Delete existing embed message if exists
      const existingMessageId = this.embedMessages.get(guildId);
      if (existingMessageId) {
        try {
          const existingMessage = await channel.messages.fetch(existingMessageId);
          if (existingMessage) {
            await existingMessage.delete();
            this.logger.debug(`Deleted existing embed message ${existingMessageId} in guild ${guildId}`);
          }
        } catch (error) {
          this.logger.debug(`Could not delete existing message ${existingMessageId}:`, error);
          // Message might already be deleted, continue
        }
      }

      // Create new embed
      const embed = new EmbedBuilder()
        .setTitle('🎟️ Sistema de Tickets')
        .setDescription(
          '**Precisa de ajuda?** Clique no botão abaixo para criar um ticket de suporte.\n\n' +
          '🔹 **Suporte Geral** - Dúvidas gerais sobre o servidor\n' +
          '🔹 **Problemas Técnicos** - Bugs ou problemas com o bot\n' +
          '🔹 **Denúncias** - Reportar comportamento inadequado\n' +
          '🔹 **Sugestões** - Ideias para melhorar o servidor\n\n' +
          '⚠️ **Importante:** Não abuse do sistema de tickets. Tickets desnecessários podem resultar em punições.'
        )
        .setColor(0x0099ff)
        .setThumbnail(guild.iconURL() || null)
        .setFooter({
          text: 'Hawk Esports • Sistema de Tickets',
          iconURL: this.client.user?.displayAvatarURL()
        })
        .setTimestamp();

      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_create')
            .setLabel('🎟️ Abrir Ticket')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('❌ Fechar Ticket')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('ticket_claim')
            .setLabel('👤 Reivindicar')
            .setStyle(ButtonStyle.Secondary)
        );

      // Send the embed message
      let message;
      try {
        message = await channel.send({
          embeds: [embed],
          components: [buttons]
        });
        this.logger.debug(`Sent persistent ticket embed message ${message.id} in guild ${guildId}`);
      } catch (sendError) {
        this.logger.error(`Failed to send embed message in channel ${config.channelId}:`, sendError);
        return false;
      }

      // Store message ID in memory
      this.embedMessages.set(guildId, message.id);

      // Save to database
      try {
        await this.database.client.persistentTicketMessage.upsert({
          where: { guildId },
          update: { messageId: message.id },
          create: {
            guildId,
            channelId: config.channelId,
            messageId: message.id
          }
        });
        this.logger.debug(`Saved persistent ticket message data to database for guild ${guildId}`);
      } catch (dbError) {
        this.logger.error(`Failed to save message data to database for guild ${guildId}:`, dbError);
        // Don't return false here as the message was sent successfully
      }

      this.logger.info(`Successfully initialized persistent ticket embed for guild ${guildId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to initialize persistent ticket embed for guild ${guildId}:`, error);
      return false;
    }
  }

  /**
   * Initialize embeds for all configured guilds
   */
  private async initializeAllEmbeds(): Promise<void> {
    const guildIds = Array.from(this.configs.keys());
    
    if (guildIds.length === 0) {
      this.logger.info('No persistent ticket configurations found to initialize');
      return;
    }

    this.logger.info(`Initializing persistent ticket embeds for ${guildIds.length} guilds`);
    
    let successCount = 0;
    let failureCount = 0;

    for (const guildId of guildIds) {
      try {
        const success = await this.initializeEmbed(guildId);
        if (success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to initialize embed for guild ${guildId}:`, error);
        failureCount++;
      }
      
      // Add delay to prevent rate limiting
      if (guildIds.indexOf(guildId) < guildIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.logger.info(`Embed initialization completed: ${successCount} successful, ${failureCount} failed`);
  }

  /**
   * Configure persistent tickets for a guild
   */
  public async configureGuild(
    guildId: string,
    channelId: string,
    options: Partial<PersistentTicketConfig> = {}
  ): Promise<boolean> {
    try {
      // Validate input parameters
      if (!guildId || typeof guildId !== 'string') {
        this.logger.error('Invalid guildId provided to configureGuild');
        return false;
      }

      if (!channelId || typeof channelId !== 'string') {
        this.logger.error('Invalid channelId provided to configureGuild');
        return false;
      }

      // Validate guild exists
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        this.logger.error(`Guild ${guildId} not found in client cache`);
        return false;
      }

      // Validate channel exists and is accessible
      const channel = guild.channels.cache.get(channelId);
      if (!channel) {
        this.logger.error(`Channel ${channelId} not found in guild ${guildId}`);
        return false;
      }

      if (channel.type !== ChannelType.GuildText) {
        this.logger.error(`Channel ${channelId} is not a text channel`);
        return false;
      }

      // Validate bot permissions in the channel
      const botMember = guild.members.cache.get(this.client.user!.id);
      if (!botMember) {
        this.logger.error(`Bot member not found in guild ${guildId}`);
        return false;
      }

      const permissions = channel.permissionsFor(botMember);
      if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ViewChannel])) {
        this.logger.error(`Bot lacks required permissions in channel ${channelId}`);
        return false;
      }

      // Normalize and validate options
      const maxTicketsPerUser = Math.max(1, Math.min(options.maxTicketsPerUser || 3, 10));
      const autoCloseHours = Math.max(1, Math.min(options.autoCloseHours || 24, 168)); // Max 1 week

      const config: PersistentTicketConfig = {
        guildId,
        channelId,
        categoryId: options.categoryId,
        supportRoleId: options.supportRoleId,
        logChannelId: options.logChannelId,
        maxTicketsPerUser,
        autoClose: options.autoClose || false,
        autoCloseHours
      };

      // Save to database
      try {
        await this.database.client.persistentTicketConfig.upsert({
          where: { guildId },
          update: config,
          create: config
        });
        this.logger.debug(`Saved persistent ticket configuration to database for guild ${guildId}`);
      } catch (dbError) {
        this.logger.error(`Failed to save configuration to database for guild ${guildId}:`, dbError);
        return false;
      }

      // Update local config
      this.configs.set(guildId, config);

      // Initialize embed
      try {
        const embedSuccess = await this.initializeEmbed(guildId);
        if (!embedSuccess) {
          this.logger.warn(`Failed to initialize embed for guild ${guildId}, but configuration was saved`);
        }
      } catch (embedError) {
        this.logger.error(`Failed to initialize embed for guild ${guildId}:`, embedError);
        // Don't return false here as the configuration was saved successfully
      }

      this.logger.info(`Successfully configured persistent tickets for guild ${guildId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to configure persistent tickets for guild ${guildId}:`, error);
      return false;
    }
  }

  /**
   * Log ticket actions
   */
  private async logTicketAction(
    action: 'create' | 'close' | 'claim',
    guildId: string,
    ticket: TicketData,
    user: User
  ): Promise<void> {
    try {
      // Validate input parameters
      if (!action || !['create', 'close', 'claim'].includes(action)) {
        this.logger.error(`Invalid action provided to logTicketAction: ${action}`);
        return;
      }

      if (!guildId || typeof guildId !== 'string') {
        this.logger.error('Invalid guildId provided to logTicketAction');
        return;
      }

      if (!ticket || !ticket.id) {
        this.logger.error('Invalid ticket data provided to logTicketAction');
        return;
      }

      if (!user || !user.id) {
        this.logger.error('Invalid user provided to logTicketAction');
        return;
      }

      const config = this.configs.get(guildId);
      if (!config?.logChannelId) {
        this.logger.debug(`No log channel configured for guild ${guildId}`);
        return;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        this.logger.error(`Guild ${guildId} not found in client cache`);
        return;
      }

      const logChannel = guild.channels.cache.get(config.logChannelId);
      if (!logChannel) {
        this.logger.error(`Log channel ${config.logChannelId} not found in guild ${guildId}`);
        return;
      }

      if (logChannel.type !== ChannelType.GuildText) {
        this.logger.error(`Log channel ${config.logChannelId} is not a text channel`);
        return;
      }

      // Check bot permissions in log channel
      const botMember = guild.members.cache.get(this.client.user!.id);
      if (!botMember) {
        this.logger.error(`Bot member not found in guild ${guildId}`);
        return;
      }

      const permissions = logChannel.permissionsFor(botMember);
      if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        this.logger.error(`Bot lacks required permissions in log channel ${config.logChannelId}`);
        return;
      }

      const actionEmojis = {
        create: '🎟️',
        close: '🔒',
        claim: '👤'
      };

      const actionNames = {
        create: 'Criado',
        close: 'Fechado',
        claim: 'Reivindicado'
      };

      const embed = new EmbedBuilder()
        .setTitle(`${actionEmojis[action]} Ticket ${actionNames[action]}`)
        .addFields(
          { name: 'ID do Ticket', value: ticket.id || 'N/A', inline: true },
          { name: 'Usuário', value: `<@${user.id}>`, inline: true },
          { name: 'Título', value: ticket.title || 'Sem título', inline: true },
          { name: 'Prioridade', value: ticket.priority || 'N/A', inline: true },
          { name: 'Status', value: ticket.status || 'N/A', inline: true },
          { name: 'Canal', value: ticket.channelId ? `<#${ticket.channelId}>` : 'N/A', inline: true }
        )
        .setColor(action === 'create' ? 0x00ff00 : action === 'close' ? 0xff0000 : 0x0099ff)
        .setTimestamp()
        .setFooter({
          text: `Hawk Esports • Sistema de Tickets`,
          iconURL: this.client.user?.displayAvatarURL()
        });

      try {
        await (logChannel as TextChannel).send({ embeds: [embed] });
        this.logger.debug(`Logged ticket ${action} action for ticket ${ticket.id} in guild ${guildId}`);
      } catch (sendError) {
        this.logger.error(`Failed to send log message to channel ${config.logChannelId}:`, sendError);
      }
    } catch (error) {
      this.logger.error(`Failed to log ticket action ${action} for guild ${guildId}:`, error);
    }
  }

  /**
   * Get configuration for a guild
   */
  public getConfig(guildId: string): PersistentTicketConfig | null {
    return this.configs.get(guildId) || null;
  }

  /**
   * Remove configuration for a guild
   */
  public async removeConfig(guildId: string): Promise<boolean> {
    try {
      // Validate input parameter
      if (!guildId || typeof guildId !== 'string') {
        this.logger.error('Invalid guildId provided to removeConfig');
        return false;
      }

      // Check if configuration exists
      const existingConfig = this.configs.get(guildId);
      if (!existingConfig) {
        this.logger.warn(`No persistent ticket configuration found for guild ${guildId}`);
        return true; // Consider it successful if already removed
      }

      // Remove from database
      try {
        await this.database.client.persistentTicketConfig.delete({
          where: { guildId }
        });
        this.logger.debug(`Deleted persistent ticket configuration from database for guild ${guildId}`);
      } catch (dbError) {
        this.logger.error(`Failed to delete configuration from database for guild ${guildId}:`, dbError);
        // Continue with cleanup even if database deletion fails
      }

      // Remove message record from database
      try {
        await this.database.client.persistentTicketMessage.delete({
          where: { guildId }
        });
        this.logger.debug(`Deleted persistent ticket message record from database for guild ${guildId}`);
      } catch (dbError) {
        this.logger.error(`Failed to delete message record from database for guild ${guildId}:`, dbError);
        // Continue with cleanup even if database deletion fails
      }

      // Remove from memory
      this.configs.delete(guildId);
      this.embedMessages.delete(guildId);

      this.logger.info(`Successfully removed persistent ticket configuration for guild ${guildId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to remove persistent ticket configuration for guild ${guildId}:`, error);
      return false;
    }
  }
}