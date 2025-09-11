import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  TextChannel,
  CategoryChannel,
} from 'discord.js';
import { BaseCommand } from '../../utils/base-command.util';
import { CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { PersistentTicketService } from '../../services/persistent-ticket.service';
import { Logger } from '../../utils/logger';

const logger = new Logger();

class PersistentTicketsCommand extends BaseCommand {
  constructor() {
    super({
      category: CommandCategory.ADMIN,
      cooldown: 5,
    });
  }

  data = new SlashCommandBuilder()
    .setName('persistent-tickets')
    .setDescription('Configurar sistema de tickets persistente')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Configurar o sistema de tickets persistente')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Canal onde o embed de tickets será enviado')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('category')
            .setDescription('Categoria onde os tickets serão criados')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
        .addRoleOption(option =>
          option
            .setName('support-role')
            .setDescription('Cargo que pode gerenciar tickets')
            .setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName('log-channel')
            .setDescription('Canal para logs de tickets')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('max-tickets')
            .setDescription('Máximo de tickets por usuário (padrão: 3)')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('auto-close')
            .setDescription('Fechar tickets automaticamente após inatividade')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('auto-close-hours')
            .setDescription('Horas de inatividade antes do fechamento automático (padrão: 24)')
            .setMinValue(1)
            .setMaxValue(168)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('refresh')
        .setDescription('Atualizar o embed de tickets no canal configurado')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Verificar status do sistema de tickets persistente')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remover configuração do sistema de tickets persistente')
    );

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guildId!;

      // Get or create persistent ticket service
      let persistentTicketService = client.persistentTicketService;
      if (!persistentTicketService) {
        persistentTicketService = new PersistentTicketService(client);
        client.persistentTicketService = persistentTicketService;
      }

      switch (subcommand) {
        case 'setup':
          await handleSetup(interaction, persistentTicketService, guildId);
          break;
        case 'refresh':
          await handleRefresh(interaction, persistentTicketService, guildId);
          break;
        case 'status':
          await handleStatus(interaction, persistentTicketService, guildId);
          break;
        case 'remove':
          await handleRemove(interaction, persistentTicketService, guildId);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            ephemeral: true,
          });
      }
    } catch (error) {
      logger.error('Error in persistent-tickets command:', error);

      const errorMessage = '❌ Ocorreu um erro ao executar o comando.';

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      } else if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      }
    }
  }
}

/**
 * Handle setup subcommand
 */
async function handleSetup(
  interaction: ChatInputCommandInteraction,
  service: PersistentTicketService,
  guildId: string
): Promise<void> {
  await interaction.deferReply();

  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const category = interaction.options.getChannel('category') as CategoryChannel;
  const supportRole = interaction.options.getRole('support-role');
  const logChannel = interaction.options.getChannel('log-channel') as TextChannel;
  const maxTickets = interaction.options.getInteger('max-tickets') || 3;
  const autoClose = interaction.options.getBoolean('auto-close') || false;
  const autoCloseHours = interaction.options.getInteger('auto-close-hours') || 24;

  // Validate channel permissions
  const botMember = interaction.guild!.members.me!;
  if (
    !channel
      .permissionsFor(botMember)
      .has([
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.UseExternalEmojis,
      ])
  ) {
    await interaction.editReply({
      content:
        '❌ O bot não tem permissões suficientes no canal especificado. Necessário: Enviar Mensagens, Incorporar Links, Usar Emojis Externos.',
    });
    return;
  }

  if (
    category &&
    !category
      .permissionsFor(botMember)
      .has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel])
  ) {
    await interaction.editReply({
      content:
        '❌ O bot não tem permissões suficientes na categoria especificada. Necessário: Gerenciar Canais, Ver Canal.',
    });
    return;
  }

  // Configure persistent tickets
  const success = await service.configureGuild(guildId, channel.id, {
    categoryId: category?.id,
    supportRoleId: supportRole?.id,
    logChannelId: logChannel?.id,
    maxTicketsPerUser: maxTickets,
    autoClose,
    autoCloseHours,
  });

  if (!success) {
    await interaction.editReply({
      content: '❌ Falha ao configurar o sistema de tickets persistente.',
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Sistema de Tickets Persistente Configurado')
    .setDescription('O sistema foi configurado com sucesso!')
    .addFields(
      { name: '📍 Canal', value: `<#${channel.id}>`, inline: true },
      {
        name: '📁 Categoria',
        value: category ? `<#${category.id}>` : 'Não definida',
        inline: true,
      },
      {
        name: '👥 Cargo de Suporte',
        value: supportRole ? `<@&${supportRole.id}>` : 'Não definido',
        inline: true,
      },
      {
        name: '📋 Canal de Logs',
        value: logChannel ? `<#${logChannel.id}>` : 'Não definido',
        inline: true,
      },
      { name: '🎟️ Max Tickets/Usuário', value: maxTickets.toString(), inline: true },
      {
        name: '⏰ Fechamento Automático',
        value: autoClose ? `${autoCloseHours}h` : 'Desabilitado',
        inline: true,
      }
    )
    .setColor(0x00ff00)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export default new PersistentTicketsCommand();

/**
 * Handle refresh subcommand
 */
async function handleRefresh(
  interaction: ChatInputCommandInteraction,
  service: PersistentTicketService,
  guildId: string
): Promise<void> {
  await interaction.deferReply();

  const config = service.getConfig(guildId);
  if (!config) {
    await interaction.editReply({
      content:
        '❌ Sistema de tickets persistente não está configurado neste servidor. Use `/persistent-tickets setup` primeiro.',
    });
    return;
  }

  const success = await service.initializeEmbed(guildId);

  if (!success) {
    await interaction.editReply({
      content: '❌ Falha ao atualizar o embed de tickets.',
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🔄 Embed Atualizado')
    .setDescription(
      `O embed de tickets foi atualizado com sucesso no canal <#${config.channelId}>.`
    )
    .setColor(0x0099ff)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle status subcommand
 */
async function handleStatus(
  interaction: ChatInputCommandInteraction,
  service: PersistentTicketService,
  guildId: string
): Promise<void> {
  const config = service.getConfig(guildId);

  if (!config) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Sistema Não Configurado')
      .setDescription(
        'O sistema de tickets persistente não está configurado neste servidor.\n\nUse `/persistent-tickets setup` para configurar.'
      )
      .setColor(0xff0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const guild = interaction.guild!;
  const channel = guild.channels.cache.get(config.channelId);
  const category = config.categoryId ? guild.channels.cache.get(config.categoryId) : null;
  const supportRole = config.supportRoleId ? guild.roles.cache.get(config.supportRoleId) : null;
  const logChannel = config.logChannelId ? guild.channels.cache.get(config.logChannelId) : null;

  const embed = new EmbedBuilder()
    .setTitle('📊 Status do Sistema de Tickets Persistente')
    .addFields(
      {
        name: '📍 Canal',
        value: channel ? `<#${channel.id}> ✅` : `ID: ${config.channelId} ❌`,
        inline: true,
      },
      {
        name: '📁 Categoria',
        value: config.categoryId
          ? category
            ? `<#${category.id}> ✅`
            : `ID: ${config.categoryId} ❌`
          : 'Não definida',
        inline: true,
      },
      {
        name: '👥 Cargo de Suporte',
        value: config.supportRoleId
          ? supportRole
            ? `<@&${supportRole.id}> ✅`
            : `ID: ${config.supportRoleId} ❌`
          : 'Não definido',
        inline: true,
      },
      {
        name: '📋 Canal de Logs',
        value: config.logChannelId
          ? logChannel
            ? `<#${logChannel.id}> ✅`
            : `ID: ${config.logChannelId} ❌`
          : 'Não definido',
        inline: true,
      },
      {
        name: '🎟️ Max Tickets/Usuário',
        value: config.maxTicketsPerUser.toString(),
        inline: true,
      },
      {
        name: '⏰ Fechamento Automático',
        value: config.autoClose ? `${config.autoCloseHours}h ✅` : 'Desabilitado ❌',
        inline: true,
      }
    )
    .setColor(0x0099ff)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle remove subcommand
 */
async function handleRemove(
  interaction: ChatInputCommandInteraction,
  service: PersistentTicketService,
  guildId: string
): Promise<void> {
  await interaction.deferReply();

  const config = service.getConfig(guildId);
  if (!config) {
    await interaction.editReply({
      content: '❌ Sistema de tickets persistente não está configurado neste servidor.',
    });
    return;
  }

  const success = await service.removeConfig(guildId);

  if (!success) {
    await interaction.editReply({
      content: '❌ Falha ao remover a configuração do sistema de tickets persistente.',
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🗑️ Configuração Removida')
    .setDescription('A configuração do sistema de tickets persistente foi removida com sucesso.')
    .setColor(0xff9900)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
