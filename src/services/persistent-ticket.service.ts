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
    this.logger = new Logger();
    this.database = client.database;
    this.client = client;
    this.ticketService = new TicketService(client);
    this.loggingService = new LoggingService(client, client.database);
    
    this.loadConfigurations();
    this.setupEventListeners();
  }

  /**
   * Load persistent ticket configurations from database
   */
  private async loadConfigurations(): Promise<void> {
    try {
      const configs = await this.database.client.persistentTicketConfig.findMany();
      
      for (const config of configs) {
        this.configs.set(config.guildId, {
          guildId: config.guildId,
          channelId: config.channelId,
          categoryId: config.categoryId || undefined,
          supportRoleId: config.supportRoleId || undefined,
          logChannelId: config.logChannelId || undefined,
          maxTicketsPerUser: config.maxTicketsPerUser || 3,
          autoClose: config.autoClose || false,
          autoCloseHours: config.autoCloseHours || 24
        });
      }
      
      this.logger.info(`Loaded ${configs.length} persistent ticket configurations`);
      
      // Initialize embeds for all configured guilds
      await this.initializeAllEmbeds();
    } catch (error) {
      this.logger.error('Failed to load persistent ticket configurations:', error);
    }
  }

  /**
   * Setup event listeners for button interactions
   */
  private setupEventListeners(): void {
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;
      
      const customId = interaction.customId;
      
      if (customId.startsWith('ticket_')) {
        await this.handleTicketButton(interaction);
      }
    });
  }

  /**
   * Handle ticket button interactions
   */
  private async handleTicketButton(interaction: ButtonInteraction): Promise<void> {
    try {
      const action = interaction.customId.split('_')[1];
      const guildId = interaction.guildId!;
      const userId = interaction.user.id;
      
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
          await interaction.reply({
            content: '❌ Ação não reconhecida.',
            ephemeral: true
          });
      }
    } catch (error) {
      this.logger.error('Error handling ticket button:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar sua solicitação.',
          ephemeral: true
        });
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
    const config = this.configs.get(guildId);
    if (!config) {
      await interaction.reply({
        content: '❌ Sistema de tickets não configurado neste servidor.',
        ephemeral: true
      });
      return;
    }

    // Check if user already has maximum tickets
    const userTickets = this.ticketService.getUserTickets(guildId, userId)
      .filter(ticket => ticket.status !== 'closed');
    
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
      await interaction.editReply({
        content: `❌ ${result.message}`
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎟️ Ticket Criado!')
      .setDescription(`Seu ticket foi criado com sucesso!\n\n**Canal:** ${result.channel ? `<#${result.channel.id}>` : 'Canal não disponível'}\n**ID:** \`${result.ticket?.id}\``)
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Log ticket creation
    await this.logTicketAction('create', guildId, result.ticket!, interaction.user);
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
      const config = this.configs.get(guildId);
      if (!config) {
        this.logger.warn(`No persistent ticket config found for guild ${guildId}`);
        return false;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        this.logger.warn(`Guild ${guildId} not found`);
        return false;
      }

      const channel = guild.channels.cache.get(config.channelId) as TextChannel;
      if (!channel) {
        this.logger.warn(`Ticket channel ${config.channelId} not found in guild ${guildId}`);
        return false;
      }

      // Delete existing embed message if exists
      const existingMessageId = this.embedMessages.get(guildId);
      if (existingMessageId) {
        try {
          const existingMessage = await channel.messages.fetch(existingMessageId);
          await existingMessage.delete();
        } catch (error) {
          // Message might already be deleted, ignore error
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

      const message = await channel.send({
        embeds: [embed],
        components: [buttons]
      });

      // Store message ID
      this.embedMessages.set(guildId, message.id);

      // Save to database
      await this.database.client.persistentTicketMessage.upsert({
        where: { guildId },
        update: { messageId: message.id },
        create: {
          guildId,
          channelId: config.channelId,
          messageId: message.id
        }
      });

      this.logger.info(`Initialized persistent ticket embed for guild ${guildId}`);
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
    for (const guildId of this.configs.keys()) {
      await this.initializeEmbed(guildId);
      // Add delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
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
      const config: PersistentTicketConfig = {
        guildId,
        channelId,
        categoryId: options.categoryId,
        supportRoleId: options.supportRoleId,
        logChannelId: options.logChannelId,
        maxTicketsPerUser: options.maxTicketsPerUser || 3,
        autoClose: options.autoClose || false,
        autoCloseHours: options.autoCloseHours || 24
      };

      // Save to database
      await this.database.client.persistentTicketConfig.upsert({
        where: { guildId },
        update: config,
        create: config
      });

      // Update local config
      this.configs.set(guildId, config);

      // Initialize embed
      await this.initializeEmbed(guildId);

      this.logger.info(`Configured persistent tickets for guild ${guildId}`);
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
      const config = this.configs.get(guildId);
      if (!config?.logChannelId) return;

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      const logChannel = guild.channels.cache.get(config.logChannelId) as TextChannel;
      if (!logChannel) return;

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
          { name: 'ID do Ticket', value: ticket.id, inline: true },
          { name: 'Usuário', value: `<@${user.id}>`, inline: true },
          { name: 'Título', value: ticket.title, inline: true },
          { name: 'Prioridade', value: ticket.priority, inline: true },
          { name: 'Status', value: ticket.status, inline: true },
          { name: 'Canal', value: ticket.channelId ? `<#${ticket.channelId}>` : 'N/A', inline: true }
        )
        .setColor(action === 'create' ? 0x00ff00 : action === 'close' ? 0xff0000 : 0x0099ff)
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Failed to log ticket action:', error);
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
      await this.database.client.persistentTicketConfig.delete({
        where: { guildId }
      });

      await this.database.client.persistentTicketMessage.delete({
        where: { guildId }
      });

      this.configs.delete(guildId);
      this.embedMessages.delete(guildId);

      this.logger.info(`Removed persistent ticket configuration for guild ${guildId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to remove persistent ticket configuration for guild ${guildId}:`, error);
      return false;
    }
  }
}