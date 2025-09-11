import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { BaseCommand } from '../../utils/base-command.util';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';

/**
 * Admin command to configure ticket system settings
 */
export class TicketConfigCommand extends BaseCommand {
  public data = new SlashCommandBuilder()
    .setName('ticket-config')
    .setDescription('Configurar sistema de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('timeout')
        .setDescription('Configurar tempo de inatividade para fechamento automático')
        .addIntegerOption(
          option =>
            option
              .setName('horas')
              .setDescription(
                'Horas de inatividade antes do fechamento automático (0 = desabilitar)'
              )
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
      subcommand.setName('view').setDescription('Ver configurações atuais do sistema de tickets')
    );

  public category = CommandCategory.ADMIN;
  public cooldown = 5;

  public async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    let subcommand: string | undefined;

    try {
      // Validate interaction and client
      this.validateInteraction(interaction);
      this.validateClient(client);
      this.validateGuildContext(interaction);
      this.validateUserPermissions(interaction, [PermissionFlagsBits.Administrator]);

      // Validate required services
      const ticketService = client.services?.ticket;

      if (!ticketService) {
        await this.sendServiceUnavailableError(interaction, 'Ticket');
        return;
      }

      subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'timeout':
          await this.handleTimeoutConfig(interaction, ticketService);
          break;
        case 'max-tickets':
          await this.handleMaxTicketsConfig(interaction, ticketService);
          break;
        case 'auto-assign':
          await this.handleAutoAssignConfig(interaction, ticketService);
          break;
        case 'require-reason':
          await this.handleRequireReasonConfig(interaction, ticketService);
          break;
        case 'notifications':
          await this.handleNotificationsConfig(interaction, ticketService);
          break;
        case 'view':
          await this.handleViewConfig(interaction, ticketService);
          break;
        default:
          throw new Error(`Unknown subcommand: ${subcommand}`);
      }
    } catch (error) {
      this.logger.error('Error in ticket-config command:', {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'ticket-config',
        error,
        metadata: { subcommand },
      });

      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      const embed = HawkEmbedBuilder.createErrorEmbed(
        'Erro no Comando de Configuração de Tickets'
      ).setDescription(`Erro ao executar comando: ${errorMessage}`);

      await this.safeReply(interaction, { embeds: [embed] });
    }
  }

  /**
   * Handle timeout configuration
   */
  private async handleTimeoutConfig(interaction: ChatInputCommandInteraction, ticketService: any) {
    const horas = interaction.options.getInteger('horas', true);
    const guildId = interaction.guildId!;

    await this.deferWithLoading(interaction, true);

    try {
      const currentSettings = ticketService.getTicketSettings(guildId);
      const newSettings = {
        ...currentSettings,
        closeAfterInactivity: horas,
      };

      await ticketService.updateTicketSettings(guildId, newSettings);

      const embed = HawkEmbedBuilder.createSuccessEmbed('Configuração Atualizada')
        .setDescription(
          horas === 0
            ? 'Fechamento automático por inatividade foi **desabilitado**.'
            : `Tickets serão fechados automaticamente após **${horas} horas** de inatividade.`
        )
        .addFields(
          {
            name: '⏰ Tempo Anterior',
            value: `${currentSettings.closeAfterInactivity}h`,
            inline: true,
          },
          { name: '🆕 Novo Tempo', value: horas === 0 ? 'Desabilitado' : `${horas}h`, inline: true }
        )
        .setTimestamp();

      await this.safeReply(interaction, { embeds: [embed] });
    } catch (error) {
      throw new Error(
        `Não foi possível atualizar a configuração de timeout: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle max tickets configuration
   */
  private async handleMaxTicketsConfig(
    interaction: ChatInputCommandInteraction,
    ticketService: any
  ) {
    const quantidade = interaction.options.getInteger('quantidade', true);
    const guildId = interaction.guildId!;

    await this.deferWithLoading(interaction, true);

    try {
      const currentSettings = ticketService.getTicketSettings(guildId);
      const newSettings = {
        ...currentSettings,
        maxTicketsPerUser: quantidade,
      };

      await ticketService.updateTicketSettings(guildId, newSettings);

      const embed = HawkEmbedBuilder.createSuccessEmbed('Configuração Atualizada')
        .setDescription(`Número máximo de tickets por usuário definido para **${quantidade}**.`)
        .addFields(
          {
            name: '📊 Limite Anterior',
            value: `${currentSettings.maxTicketsPerUser}`,
            inline: true,
          },
          { name: '🆕 Novo Limite', value: `${quantidade}`, inline: true }
        )
        .setTimestamp();

      await this.safeReply(interaction, { embeds: [embed] });
    } catch (error) {
      throw new Error(
        `Não foi possível atualizar a configuração de limite de tickets: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle auto assign configuration
   */
  private async handleAutoAssignConfig(
    interaction: ChatInputCommandInteraction,
    ticketService: any
  ) {
    const ativo = interaction.options.getBoolean('ativo', true);
    const guildId = interaction.guildId!;

    await this.deferWithLoading(interaction, true);

    try {
      const currentSettings = ticketService.getTicketSettings(guildId);
      const newSettings = {
        ...currentSettings,
        autoAssign: ativo,
      };

      await ticketService.updateTicketSettings(guildId, newSettings);

      const embed = HawkEmbedBuilder.createSuccessEmbed('Configuração Atualizada')
        .setDescription(
          ativo
            ? 'Atribuição automática de tickets foi **ativada**.'
            : 'Atribuição automática de tickets foi **desativada**.'
        )
        .addFields(
          {
            name: '🔄 Status Anterior',
            value: currentSettings.autoAssign ? 'Ativo' : 'Inativo',
            inline: true,
          },
          { name: '🆕 Novo Status', value: ativo ? 'Ativo' : 'Inativo', inline: true }
        )
        .setTimestamp();

      await this.safeReply(interaction, { embeds: [embed] });
    } catch (error) {
      throw new Error(
        `Não foi possível atualizar a configuração de atribuição automática: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle require reason configuration
   */
  private async handleRequireReasonConfig(
    interaction: ChatInputCommandInteraction,
    ticketService: any
  ) {
    const obrigatorio = interaction.options.getBoolean('obrigatorio', true);
    const guildId = interaction.guildId!;

    await this.deferWithLoading(interaction, true);

    try {
      const currentSettings = ticketService.getTicketSettings(guildId);
      const newSettings = {
        ...currentSettings,
        requireReason: obrigatorio,
      };

      await ticketService.updateTicketSettings(guildId, newSettings);

      const embed = HawkEmbedBuilder.createSuccessEmbed('Configuração Atualizada')
        .setDescription(
          obrigatorio
            ? 'Motivo agora é **obrigatório** para criar tickets.'
            : 'Motivo agora é **opcional** para criar tickets.'
        )
        .addFields(
          {
            name: '📝 Status Anterior',
            value: currentSettings.requireReason ? 'Obrigatório' : 'Opcional',
            inline: true,
          },
          { name: '🆕 Novo Status', value: obrigatorio ? 'Obrigatório' : 'Opcional', inline: true }
        )
        .setTimestamp();

      await this.safeReply(interaction, { embeds: [embed] });
    } catch (error) {
      throw new Error(
        `Não foi possível atualizar a configuração de motivo obrigatório: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle notifications configuration
   */
  private async handleNotificationsConfig(
    interaction: ChatInputCommandInteraction,
    ticketService: any
  ) {
    const criar = interaction.options.getBoolean('criar');
    const atribuir = interaction.options.getBoolean('atribuir');
    const fechar = interaction.options.getBoolean('fechar');
    const reabrir = interaction.options.getBoolean('reabrir');
    const guildId = interaction.guildId!;

    await this.deferWithLoading(interaction, true);

    try {
      const currentSettings = ticketService.getTicketSettings(guildId);
      const newNotificationSettings = {
        onCreate: criar !== null ? criar : currentSettings.notificationSettings.onCreate,
        onAssign: atribuir !== null ? atribuir : currentSettings.notificationSettings.onAssign,
        onClose: fechar !== null ? fechar : currentSettings.notificationSettings.onClose,
        onReopen: reabrir !== null ? reabrir : currentSettings.notificationSettings.onReopen,
      };

      const newSettings = {
        ...currentSettings,
        notificationSettings: newNotificationSettings,
      };

      await ticketService.updateTicketSettings(guildId, newSettings);

      const embed = HawkEmbedBuilder.createSuccessEmbed('Notificações Atualizadas')
        .setDescription('Configurações de notificação foram atualizadas com sucesso.')
        .addFields(
          {
            name: '🎫 Criar Ticket',
            value: newNotificationSettings.onCreate ? '✅ Ativo' : '❌ Inativo',
            inline: true,
          },
          {
            name: '🎯 Atribuir Ticket',
            value: newNotificationSettings.onAssign ? '✅ Ativo' : '❌ Inativo',
            inline: true,
          },
          {
            name: '🔒 Fechar Ticket',
            value: newNotificationSettings.onClose ? '✅ Ativo' : '❌ Inativo',
            inline: true,
          },
          {
            name: '🔓 Reabrir Ticket',
            value: newNotificationSettings.onReopen ? '✅ Ativo' : '❌ Inativo',
            inline: true,
          }
        )
        .setTimestamp();

      await this.safeReply(interaction, { embeds: [embed] });
    } catch (error) {
      throw new Error(
        `Não foi possível atualizar as configurações de notificação: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle view configuration
   */
  private async handleViewConfig(interaction: ChatInputCommandInteraction, ticketService: any) {
    const guildId = interaction.guildId!;

    await this.deferWithLoading(interaction, true);

    try {
      const settings = ticketService.getTicketSettings(guildId);

      const embed = HawkEmbedBuilder.createInfoEmbed('Configurações do Sistema de Tickets')
        .setDescription('Configurações atuais do sistema de tickets para este servidor.')
        .addFields(
          { name: '🔧 Sistema', value: settings.enabled ? '✅ Ativo' : '❌ Inativo', inline: true },
          { name: '📊 Max Tickets/Usuário', value: `${settings.maxTicketsPerUser}`, inline: true },
          {
            name: '🔄 Atribuição Automática',
            value: settings.autoAssign ? '✅ Ativo' : '❌ Inativo',
            inline: true,
          },
          {
            name: '📝 Motivo Obrigatório',
            value: settings.requireReason ? '✅ Sim' : '❌ Não',
            inline: true,
          },
          {
            name: '👤 Tickets Anônimos',
            value: settings.allowAnonymous ? '✅ Permitido' : '❌ Não Permitido',
            inline: true,
          },
          {
            name: '⏰ Fechamento Automático',
            value:
              settings.closeAfterInactivity > 0
                ? `${settings.closeAfterInactivity}h`
                : '❌ Desabilitado',
            inline: true,
          }
        )
        .addFields(
          { name: '🔔 Notificações', value: '\u200B', inline: false },
          {
            name: '🎫 Criar',
            value: settings.notificationSettings.onCreate ? '✅' : '❌',
            inline: true,
          },
          {
            name: '🎯 Atribuir',
            value: settings.notificationSettings.onAssign ? '✅' : '❌',
            inline: true,
          },
          {
            name: '🔒 Fechar',
            value: settings.notificationSettings.onClose ? '✅' : '❌',
            inline: true,
          },
          {
            name: '🔓 Reabrir',
            value: settings.notificationSettings.onReopen ? '✅' : '❌',
            inline: true,
          }
        )
        .setTimestamp();

      if (settings.logChannelId) {
        embed.addFields({
          name: '📋 Canal de Logs',
          value: `<#${settings.logChannelId}>`,
          inline: true,
        });
      }

      if (settings.supportRoleId) {
        embed.addFields({
          name: '👥 Cargo de Suporte',
          value: `<@&${settings.supportRoleId}>`,
          inline: true,
        });
      }

      await this.safeReply(interaction, { embeds: [embed] });
    } catch (error) {
      throw new Error(
        `Não foi possível carregar as configurações: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Export as default for compatibility
const commandInstance = new TicketConfigCommand();

const command = {
  data: commandInstance.data,
  category: commandInstance.category,
  cooldown: commandInstance.cooldown,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;
