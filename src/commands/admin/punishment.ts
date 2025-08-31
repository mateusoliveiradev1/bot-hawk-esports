import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  CommandInteraction,
  PermissionFlagsBits,
  User,
} from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';
import { PUNISHMENT_CONFIG } from '../../config/punishment.config';

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

  async execute(
    interaction: CommandInteraction | ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void> {
    const logger = new Logger();
    const punishmentService = client.services?.punishment;

    if (!punishmentService) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Serviço Indisponível')
        .setDescription('O serviço de punições não está disponível no momento.')
        .setColor(0xff0000);

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      return;
    }

    try {
      await interaction.deferReply();

      const subcommand = (interaction as ChatInputCommandInteraction).options.getSubcommand();
      const guildId = interaction.guild!.id;

      switch (subcommand) {
        case 'history':
          await handleHistoryCommand(interaction as ChatInputCommandInteraction, punishmentService);
          break;

        case 'warnings':
          await handleWarningsCommand(
            interaction as ChatInputCommandInteraction,
            punishmentService,
          );
          break;

        case 'config':
          await handleConfigCommand(interaction as ChatInputCommandInteraction);
          break;

        case 'stats':
          await handleStatsCommand(
            interaction as ChatInputCommandInteraction,
            punishmentService,
            guildId,
          );
          break;

        default:
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Subcomando Inválido')
            .setDescription('Subcomando não reconhecido.')
            .setColor(0xff0000);

          await interaction.editReply({ embeds: [errorEmbed] });
      }
    } catch (error) {
      logger.error('Error in punishment command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao executar o comando.')
        .setColor(0xff0000);

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

/**
 * Handle punishment history subcommand
 */
async function handleHistoryCommand(
  interaction: ChatInputCommandInteraction,
  punishmentService: any,
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario', true);
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
      const typeEmoji = getTypeEmoji(punishment.type);

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
async function handleWarningsCommand(
  interaction: ChatInputCommandInteraction,
  punishmentService: any,
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario', true);
  const guildId = interaction.guild!.id;
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
      const typeEmoji = getTypeEmoji(warning.type);

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
async function handleConfigCommand(interaction: ChatInputCommandInteraction): Promise<void> {
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
async function handleStatsCommand(
  interaction: ChatInputCommandInteraction,
  punishmentService: any,
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
 * Get emoji for punishment type
 */
function getTypeEmoji(type: string): string {
  const typeEmojis: Record<string, string> = {
    no_checkout: '🚪',
    no_show_up: '👻',
    early_leave: '🏃',
    warning_escalation: '🚨',
  };

  return typeEmojis[type] || '❓';
}

export default punishment;
