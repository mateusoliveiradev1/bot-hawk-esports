import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { Command } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';

const logger = new Logger();

export default {
  category: 'admin',
  data: new SlashCommandBuilder()
    .setName('ticket-config')
    .setDescription('Configurar sistema de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('timeout')
        .setDescription('Configurar tempo de inatividade para fechamento automático')
        .addIntegerOption(option =>
          option
            .setName('horas')
            .setDescription('Horas de inatividade antes do fechamento automático (0 = desabilitar)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(168) // 7 dias máximo
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('max-tickets')
        .setDescription('Configurar número máximo de tickets por usuário')
        .addIntegerOption(option =>
          option
            .setName('quantidade')
            .setDescription('Número máximo de tickets por usuário')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('auto-assign')
        .setDescription('Configurar atribuição automática de tickets')
        .addBooleanOption(option =>
          option
            .setName('ativo')
            .setDescription('Ativar ou desativar atribuição automática')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('require-reason')
        .setDescription('Configurar se motivo é obrigatório para criar tickets')
        .addBooleanOption(option =>
          option
            .setName('obrigatorio')
            .setDescription('Tornar motivo obrigatório ou opcional')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('notifications')
        .setDescription('Configurar notificações do sistema de tickets')
        .addBooleanOption(option =>
          option
            .setName('criar')
            .setDescription('Notificar quando ticket for criado')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('atribuir')
            .setDescription('Notificar quando ticket for atribuído')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('fechar')
            .setDescription('Notificar quando ticket for fechado')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('reabrir')
            .setDescription('Notificar quando ticket for reaberto')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('Ver configurações atuais do sistema de tickets')
    ),

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const ticketService = client.services?.ticket;

      if (!ticketService) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erro')
          .setDescription('Serviço de tickets não está disponível.')
          .setColor('#FF0000');
        
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }

      switch (subcommand) {
        case 'timeout':
          await handleTimeoutConfig(interaction, ticketService);
          break;
        case 'max-tickets':
          await handleMaxTicketsConfig(interaction, ticketService);
          break;
        case 'auto-assign':
          await handleAutoAssignConfig(interaction, ticketService);
          break;
        case 'require-reason':
          await handleRequireReasonConfig(interaction, ticketService);
          break;
        case 'notifications':
          await handleNotificationsConfig(interaction, ticketService);
          break;
        case 'view':
          await handleViewConfig(interaction, ticketService);
          break;
        default:
          await interaction.reply({ content: 'Subcomando não reconhecido.', ephemeral: true });
      }
    } catch (error) {
      logger.error('Error in ticket-config command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar o comando.')
        .setColor('#FF0000');
      
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
} as Command;

/**
 * Handle timeout configuration
 */
async function handleTimeoutConfig(interaction: ChatInputCommandInteraction, ticketService: any) {
  const horas = interaction.options.getInteger('horas', true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  try {
    const currentSettings = ticketService.getTicketSettings(guildId);
    const newSettings = {
      ...currentSettings,
      closeAfterInactivity: horas
    };

    await ticketService.updateTicketSettings(guildId, newSettings);

    const embed = new EmbedBuilder()
      .setTitle('✅ Configuração Atualizada')
      .setDescription(
        horas === 0 
          ? 'Fechamento automático por inatividade foi **desabilitado**.'
          : `Tickets serão fechados automaticamente após **${horas} horas** de inatividade.`
      )
      .setColor('#00FF00')
      .addFields(
        { name: '⏰ Tempo Anterior', value: `${currentSettings.closeAfterInactivity}h`, inline: true },
        { name: '🆕 Novo Tempo', value: horas === 0 ? 'Desabilitado' : `${horas}h`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error updating timeout config:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro')
      .setDescription('Não foi possível atualizar a configuração de timeout.')
      .setColor('#FF0000');
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle max tickets configuration
 */
async function handleMaxTicketsConfig(interaction: ChatInputCommandInteraction, ticketService: any) {
  const quantidade = interaction.options.getInteger('quantidade', true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  try {
    const currentSettings = ticketService.getTicketSettings(guildId);
    const newSettings = {
      ...currentSettings,
      maxTicketsPerUser: quantidade
    };

    await ticketService.updateTicketSettings(guildId, newSettings);

    const embed = new EmbedBuilder()
      .setTitle('✅ Configuração Atualizada')
      .setDescription(`Número máximo de tickets por usuário definido para **${quantidade}**.`)
      .setColor('#00FF00')
      .addFields(
        { name: '📊 Limite Anterior', value: `${currentSettings.maxTicketsPerUser}`, inline: true },
        { name: '🆕 Novo Limite', value: `${quantidade}`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error updating max tickets config:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro')
      .setDescription('Não foi possível atualizar a configuração de limite de tickets.')
      .setColor('#FF0000');
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle auto assign configuration
 */
async function handleAutoAssignConfig(interaction: ChatInputCommandInteraction, ticketService: any) {
  const ativo = interaction.options.getBoolean('ativo', true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  try {
    const currentSettings = ticketService.getTicketSettings(guildId);
    const newSettings = {
      ...currentSettings,
      autoAssign: ativo
    };

    await ticketService.updateTicketSettings(guildId, newSettings);

    const embed = new EmbedBuilder()
      .setTitle('✅ Configuração Atualizada')
      .setDescription(
        ativo 
          ? 'Atribuição automática de tickets foi **ativada**.'
          : 'Atribuição automática de tickets foi **desativada**.'
      )
      .setColor('#00FF00')
      .addFields(
        { name: '🔄 Status Anterior', value: currentSettings.autoAssign ? 'Ativo' : 'Inativo', inline: true },
        { name: '🆕 Novo Status', value: ativo ? 'Ativo' : 'Inativo', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error updating auto assign config:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro')
      .setDescription('Não foi possível atualizar a configuração de atribuição automática.')
      .setColor('#FF0000');
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle require reason configuration
 */
async function handleRequireReasonConfig(interaction: ChatInputCommandInteraction, ticketService: any) {
  const obrigatorio = interaction.options.getBoolean('obrigatorio', true);
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  try {
    const currentSettings = ticketService.getTicketSettings(guildId);
    const newSettings = {
      ...currentSettings,
      requireReason: obrigatorio
    };

    await ticketService.updateTicketSettings(guildId, newSettings);

    const embed = new EmbedBuilder()
      .setTitle('✅ Configuração Atualizada')
      .setDescription(
        obrigatorio 
          ? 'Motivo agora é **obrigatório** para criar tickets.'
          : 'Motivo agora é **opcional** para criar tickets.'
      )
      .setColor('#00FF00')
      .addFields(
        { name: '📝 Status Anterior', value: currentSettings.requireReason ? 'Obrigatório' : 'Opcional', inline: true },
        { name: '🆕 Novo Status', value: obrigatorio ? 'Obrigatório' : 'Opcional', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error updating require reason config:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro')
      .setDescription('Não foi possível atualizar a configuração de motivo obrigatório.')
      .setColor('#FF0000');
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle notifications configuration
 */
async function handleNotificationsConfig(interaction: ChatInputCommandInteraction, ticketService: any) {
  const criar = interaction.options.getBoolean('criar');
  const atribuir = interaction.options.getBoolean('atribuir');
  const fechar = interaction.options.getBoolean('fechar');
  const reabrir = interaction.options.getBoolean('reabrir');
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  try {
    const currentSettings = ticketService.getTicketSettings(guildId);
    const newNotificationSettings = {
      onCreate: criar !== null ? criar : currentSettings.notificationSettings.onCreate,
      onAssign: atribuir !== null ? atribuir : currentSettings.notificationSettings.onAssign,
      onClose: fechar !== null ? fechar : currentSettings.notificationSettings.onClose,
      onReopen: reabrir !== null ? reabrir : currentSettings.notificationSettings.onReopen
    };

    const newSettings = {
      ...currentSettings,
      notificationSettings: newNotificationSettings
    };

    await ticketService.updateTicketSettings(guildId, newSettings);

    const embed = new EmbedBuilder()
      .setTitle('✅ Notificações Atualizadas')
      .setDescription('Configurações de notificação foram atualizadas com sucesso.')
      .setColor('#00FF00')
      .addFields(
        { name: '🎫 Criar Ticket', value: newNotificationSettings.onCreate ? '✅ Ativo' : '❌ Inativo', inline: true },
        { name: '🎯 Atribuir Ticket', value: newNotificationSettings.onAssign ? '✅ Ativo' : '❌ Inativo', inline: true },
        { name: '🔒 Fechar Ticket', value: newNotificationSettings.onClose ? '✅ Ativo' : '❌ Inativo', inline: true },
        { name: '🔓 Reabrir Ticket', value: newNotificationSettings.onReopen ? '✅ Ativo' : '❌ Inativo', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error updating notifications config:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro')
      .setDescription('Não foi possível atualizar as configurações de notificação.')
      .setColor('#FF0000');
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle view configuration
 */
async function handleViewConfig(interaction: ChatInputCommandInteraction, ticketService: any) {
  const guildId = interaction.guildId!;

  await interaction.deferReply({ ephemeral: true });

  try {
    const settings = ticketService.getTicketSettings(guildId);

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Configurações do Sistema de Tickets')
      .setDescription('Configurações atuais do sistema de tickets para este servidor.')
      .setColor('#0099FF')
      .addFields(
        { name: '🔧 Sistema', value: settings.enabled ? '✅ Ativo' : '❌ Inativo', inline: true },
        { name: '📊 Max Tickets/Usuário', value: `${settings.maxTicketsPerUser}`, inline: true },
        { name: '🔄 Atribuição Automática', value: settings.autoAssign ? '✅ Ativo' : '❌ Inativo', inline: true },
        { name: '📝 Motivo Obrigatório', value: settings.requireReason ? '✅ Sim' : '❌ Não', inline: true },
        { name: '👤 Tickets Anônimos', value: settings.allowAnonymous ? '✅ Permitido' : '❌ Não Permitido', inline: true },
        { name: '⏰ Fechamento Automático', value: settings.closeAfterInactivity > 0 ? `${settings.closeAfterInactivity}h` : '❌ Desabilitado', inline: true }
      )
      .addFields(
        { name: '🔔 Notificações', value: '\u200B', inline: false },
        { name: '🎫 Criar', value: settings.notificationSettings.onCreate ? '✅' : '❌', inline: true },
        { name: '🎯 Atribuir', value: settings.notificationSettings.onAssign ? '✅' : '❌', inline: true },
        { name: '🔒 Fechar', value: settings.notificationSettings.onClose ? '✅' : '❌', inline: true },
        { name: '🔓 Reabrir', value: settings.notificationSettings.onReopen ? '✅' : '❌', inline: true }
      )
      .setTimestamp();

    if (settings.logChannelId) {
      embed.addFields({ name: '📋 Canal de Logs', value: `<#${settings.logChannelId}>`, inline: true });
    }

    if (settings.supportRoleId) {
      embed.addFields({ name: '👥 Cargo de Suporte', value: `<@&${settings.supportRoleId}>`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error viewing config:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro')
      .setDescription('Não foi possível carregar as configurações.')
      .setColor('#FF0000');
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}