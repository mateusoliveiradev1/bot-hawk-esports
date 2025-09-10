import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  User,
} from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { BaseCommand } from '../../utils/base-command.util';
import { PUNISHMENT_CONFIG } from '../../config/punishment.config';
import { PunishmentService } from '../../services/punishment.service';

/**
 * Punishment management command using BaseCommand pattern
 */
class PunishmentCommand extends BaseCommand {
  /**
   * Execute the punishment command
   */
  public async execute(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void> {
    await this.executeWithErrorHandling(
      interaction,
      client,
      async () => {
        // Validate guild context
        this.validateGuildContext(interaction);

        // Validate punishment service
        const punishmentService = client.services?.punishment;
        this.validateService(punishmentService, 'Punishment');

        // Defer reply for processing
        await this.deferWithLoading(interaction);

        // Route to appropriate subcommand handler
        const subcommand = interaction.options.getSubcommand();
        await this.routeSubcommand(interaction, punishmentService, subcommand);
      },
      'punishment command execution',
    );
  }

  /**
   * Route to appropriate subcommand handler
   */
  private async routeSubcommand(
    interaction: ChatInputCommandInteraction,
    punishmentService: PunishmentService,
    subcommand: string,
  ): Promise<void> {
    const guildId = interaction.guild!.id;

    switch (subcommand) {
      case 'history':
        await this.handleHistory(interaction, punishmentService);
        break;

      case 'warnings':
        await this.handleWarnings(interaction, punishmentService);
        break;

      case 'config':
        await this.handleConfig(interaction);
        break;

      case 'stats':
        await this.handleStats(interaction, punishmentService, guildId);
        break;

      default:
        await this.handleInvalidSubcommand(interaction, subcommand, guildId, punishmentService);
    }
  }

  /**
   * Handle punishment history subcommand
   */
  private async handleHistory(
    interaction: ChatInputCommandInteraction,
    punishmentService: PunishmentService,
  ): Promise<void> {
    const targetUser = interaction.options.getUser('usuario', true);

    // Validate user input
    if (!targetUser) {
      throw new Error('Usuário não encontrado');
    }

    const punishments = punishmentService.getUserPunishments(targetUser.id);

    const embed = new EmbedBuilder()
      .setTitle(`📋 Histórico de Punições - ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(0xff9500)
      .setTimestamp();

    if (punishments.length === 0) {
      embed.setDescription('✅ Este usuário não possui punições registradas.');
    } else {
      const recentPunishments = punishments.slice(0, 10); // Show last 10 punishments
      let description = `**Total de Punições:** ${punishments.length}\n\n`;

      recentPunishments.forEach((punishment: any, index: number) => {
        const date = new Date(punishment.timestamp).toLocaleDateString('pt-BR');
        const typeEmoji = this.getTypeEmoji(punishment.type);

        description += `${typeEmoji} **${punishment.type.replace('_', ' ').toUpperCase()}**\n`;
        description += `📅 ${date} | 💰 -${punishment.penalty.coins} moedas | ⭐ -${punishment.penalty.xp} XP\n`;
        description += `📝 ${punishment.reason}\n\n`;
      });

      if (punishments.length > 10) {
        description += `*... e mais ${punishments.length - 10} punições antigas*`;
      }

      embed.setDescription(description);
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle warnings subcommand
   */
  private async handleWarnings(
    interaction: ChatInputCommandInteraction,
    punishmentService: PunishmentService,
  ): Promise<void> {
    const targetUser = interaction.options.getUser('usuario', true);
    const guildId = interaction.guild!.id;

    // Validate user input
    if (!targetUser) {
      throw new Error('Usuário não encontrado');
    }

    const warnings = await punishmentService.getUserWarnings(targetUser.id, guildId);

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Avisos Ativos - ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(0xffa500)
      .setTimestamp();

    if (warnings.length === 0) {
      embed.setDescription('✅ Este usuário não possui avisos ativos.');
    } else {
      let description = `**Avisos Ativos:** ${warnings.length}/${PUNISHMENT_CONFIG.warnings.maxWarnings}\n\n`;

      warnings.forEach((warning: any, index: number) => {
        const issueDate = new Date(warning.issuedAt).toLocaleDateString('pt-BR');
        const expiryDate = new Date(warning.expiresAt).toLocaleDateString('pt-BR');
        const typeEmoji = this.getTypeEmoji(warning.type);

        description += `${typeEmoji} **Aviso ${index + 1}**\n`;
        description += `📅 Emitido: ${issueDate} | Expira: ${expiryDate}\n`;
        description += `📝 ${warning.reason}\n\n`;
      });

      // Warning about escalation
      if (warnings.length >= PUNISHMENT_CONFIG.warnings.maxWarnings - 1) {
        description += '🚨 **ATENÇÃO:** Próximo aviso resultará em penalidade escalada!';
      }

      embed.setDescription(description);
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle config subcommand
   */
  private async handleConfig(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('⚙️ Configurações do Sistema de Punições')
      .setColor(0x0099ff)
      .setTimestamp();

    let description = `**Status:** ${PUNISHMENT_CONFIG.enabled ? '✅ Ativo' : '❌ Desativado'}\n\n`;

    description += '**📋 Penalidades:**\n';
    description += `• **Não Check-out:** -${PUNISHMENT_CONFIG.penalties.no_checkout.xpPenalty} XP, -${PUNISHMENT_CONFIG.penalties.no_checkout.coinsPenalty} moedas\n`;
    description += `• **Não Compareceu:** -${PUNISHMENT_CONFIG.penalties.no_show_up.xpPenalty} XP, -${PUNISHMENT_CONFIG.penalties.no_show_up.coinsPenalty} moedas\n`;
    description += `• **Saída Precoce:** -${PUNISHMENT_CONFIG.penalties.early_leave.xpPenalty} XP, -${PUNISHMENT_CONFIG.penalties.early_leave.coinsPenalty} moedas\n\n`;

    description += '**⚠️ Sistema de Avisos:**\n';
    description += `• **Máximo de Avisos:** ${PUNISHMENT_CONFIG.warnings.maxWarnings}\n`;
    description += `• **Duração do Aviso:** ${PUNISHMENT_CONFIG.warnings.warningDuration} horas\n`;
    description += `• **Penalidade Escalada:** -${PUNISHMENT_CONFIG.warnings.escalationPenalty.xpPenalty} XP, -${PUNISHMENT_CONFIG.warnings.escalationPenalty.coinsPenalty} moedas\n\n`;

    description += '**⏰ Tempos Limite:**\n';
    description += `• **Sem Check-out:** ${PUNISHMENT_CONFIG.timeouts.noCheckoutTimeout} horas\n`;
    description += `• **Não Compareceu:** ${PUNISHMENT_CONFIG.timeouts.noShowUpTimeout} hora(s)\n`;
    description += `• **Saída Precoce:** ${PUNISHMENT_CONFIG.timeouts.earlyLeaveTimeout} hora(s)\n`;

    embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle stats subcommand
   */
  private async handleStats(
    interaction: ChatInputCommandInteraction,
    punishmentService: PunishmentService,
    guildId: string,
  ): Promise<void> {
    // This would require additional methods in PunishmentService to get guild stats
    const embed = new EmbedBuilder()
      .setTitle('📊 Estatísticas de Punições do Servidor')
      .setColor(0x9932cc)
      .setTimestamp();

    // For now, show a placeholder message
    embed.setDescription(
      '📈 **Estatísticas em Desenvolvimento**\n\n' +
        'As estatísticas detalhadas de punições estarão disponíveis em breve. ' +
        'Isso incluirá:\n\n' +
        '• Total de punições por tipo\n' +
        '• Usuários mais punidos\n' +
        '• Tendências mensais\n' +
        '• Taxa de reincidência\n' +
        '• Efetividade do sistema de avisos',
    );

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle invalid subcommand
   */
  private async handleInvalidSubcommand(
    interaction: ChatInputCommandInteraction,
    subcommand: string,
    guildId: string,
    punishmentService: PunishmentService,
  ): Promise<void> {
    this.logger.warn(`Invalid subcommand received: ${subcommand}`);

    const embed = new EmbedBuilder()
      .setTitle('❌ Subcomando Inválido')
      .setDescription(`Subcomando '${subcommand}' não reconhecido.`)
      .setColor(0xff0000);

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Get emoji for punishment type
   */
  private getTypeEmoji(type: string): string {
    const typeEmojis: Record<string, string> = {
      no_checkout: '🚪',
      no_show_up: '👻',
      early_leave: '🏃',
      warning_escalation: '🚨',
    };

    return typeEmojis[type] || '❓';
  }
}

/**
 * Create punishment command instance
 */
const punishmentCommand = new PunishmentCommand();

/**
 * Punishment management command - View and manage user punishments
 */
const punishment: Command = {
  data: new SlashCommandBuilder()
    .setName('punishment')
    .setDescription('🔨 Gerenciar sistema de punições')
    .addSubcommand(subcommand =>
      subcommand
        .setName('history')
        .setDescription('Ver histórico de punições de um usuário')
        .addUserOption(option =>
          option.setName('usuario').setDescription('Usuário para ver o histórico').setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('warnings')
        .setDescription('Ver avisos ativos de um usuário')
        .addUserOption(option =>
          option.setName('usuario').setDescription('Usuário para ver os avisos').setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('config').setDescription('Ver configurações do sistema de punições'),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('stats').setDescription('Ver estatísticas gerais de punições do servidor'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) as SlashCommandBuilder,

  category: CommandCategory.ADMIN,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    await punishmentCommand.execute(interaction, client);
  },
};

export default punishment;
