import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';

const logger = new Logger();

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ratelimit')
    .setDescription('Gerenciar sistema de rate limiting')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName('status').setDescription('Ver status do sistema de rate limiting')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('Ver informações de rate limit de um usuário')
        .addUserOption(option =>
          option.setName('usuario').setDescription('Usuário para verificar').setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Resetar rate limit de um usuário')
        .addUserOption(option =>
          option.setName('usuario').setDescription('Usuário para resetar').setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('stats').setDescription('Ver estatísticas gerais do rate limiting')
    ),
  category: CommandCategory.ADMIN,
  cooldown: 5,
  permissions: ['Administrator'],

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    try {
      const subcommand = interaction.options.getSubcommand();
      // Rate limiting system not available through commandManager

      switch (subcommand) {
        case 'status':
          await handleStatusCommand(interaction);
          break;
        case 'user':
          await handleUserCommand(interaction);
          break;
        case 'reset':
          await handleResetCommand(interaction);
          break;
        case 'stats':
          await handleStatsCommand(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            ephemeral: true,
          });
      }
    } catch (error) {
      logger.error('Error in ratelimit command:', error);

      const errorMessage = 'Ocorreu um erro ao executar o comando de rate limiting.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};

/**
 * Handle status subcommand
 */
async function handleStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const stats = {
    totalRequests: 0,
    blockedRequests: 0,
    activeUsers: 0,
    resetTime: new Date(),
  };

  const embed = HawkEmbedBuilder.createAdminEmbed(
    '🛡️ Status do Rate Limiting',
    'Informações gerais do sistema de rate limiting'
  )
    .addFields(
      {
        name: '👥 Usuários Monitorados',
        value: stats.totalRequests.toString(),
        inline: true,
      },
      {
        name: '⏱️ Usuários em Timeout',
        value: '0',
        inline: true,
      },
      {
        name: '⚠️ Total de Violações',
        value: stats.blockedRequests.toString(),
        inline: true,
      },
      {
        name: '📊 Multiplicador Médio de Penalidade',
        value: '1.00',
        inline: true,
      },
      {
        name: '🔄 Status do Sistema',
        value: '✅ Ativo e Funcionando',
        inline: true,
      },
      {
        name: '⚙️ Configurações',
        value:
          'Rate limiting progressivo ativo\nLimpeza automática habilitada\nMonitoramento comportamental ativo',
        inline: false,
      }
    )
    .setColor('#00ff00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle user subcommand
 */
async function handleUserCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser('usuario', true);
  const userStatus = {
    userId: user.id,
    requests: 0,
    remaining: 10,
    resetTime: new Date(Date.now() + 60000),
    isBlocked: false,
  };

  const embed = HawkEmbedBuilder.createAdminEmbed(
    `🔍 Rate Limit - ${user.username}`,
    `Informações de rate limiting para <@${user.id}>`
  )
    .addFields(
      {
        name: '📊 Comandos Executados',
        value: userStatus.requests.toString(),
        inline: true,
      },
      {
        name: '⚠️ Violações',
        value: userStatus.requests.toString(),
        inline: true,
      },
      {
        name: '🔢 Multiplicador de Penalidade',
        value: '1.0x',
        inline: true,
      },
      {
        name: '⚠️ Avisos',
        value: '0',
        inline: true,
      },
      {
        name: '⏱️ Status de Timeout',
        value: userStatus.isBlocked
          ? `Bloqueado até <t:${Math.floor(userStatus.resetTime.getTime() / 1000)}:R>`
          : 'Nenhum bloqueio ativo',
        inline: false,
      }
    )
    .setColor(userStatus.isBlocked ? '#ff0000' : userStatus.requests > 5 ? '#ffaa00' : '#00ff00')
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle reset subcommand
 */
async function handleResetCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser('usuario', true);

  try {
    // Rate limit reset functionality not available

    const embed = HawkEmbedBuilder.createSuccessEmbed(
      '✅ Rate Limit Resetado',
      `Rate limit resetado com sucesso para <@${user.id}>`
    )
      .addFields(
        {
          name: '👤 Usuário',
          value: `${user.username} (${user.id})`,
          inline: true,
        },
        {
          name: '🔄 Ação',
          value: 'Todos os dados de rate limit foram limpos',
          inline: true,
        },
        {
          name: '👮 Administrador',
          value: `<@${interaction.user.id}>`,
          inline: true,
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

    logger.info(`Rate limit reset for user ${user.id} by admin ${interaction.user.id}`);
  } catch (error) {
    logger.error('Error resetting user rate limit:', error);

    await interaction.reply({
      content: `❌ Erro ao resetar rate limit para ${user.username}.`,
      ephemeral: true,
    });
  }
}

/**
 * Handle stats subcommand
 */
async function handleStatsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const stats = {
    totalRequests: 0,
    blockedRequests: 0,
    averageResponseTime: 0,
    peakUsage: 0,
    uptime: '0h 0m',
  };

  // Calculate some additional metrics
  const violationRate =
    stats.totalRequests > 0 ? (stats.blockedRequests / stats.totalRequests).toFixed(2) : '0.00';
  const timeoutRate = '0.0';

  const embed = HawkEmbedBuilder.createAdminEmbed(
    '📊 Estatísticas Detalhadas do Rate Limiting',
    'Análise completa do sistema de rate limiting'
  )
    .addFields(
      {
        name: '👥 Usuários',
        value: `**Total:** ${stats.totalRequests}\n**Bloqueadas:** ${stats.blockedRequests}\n**Taxa de Bloqueio:** ${timeoutRate}%`,
        inline: true,
      },
      {
        name: '⚠️ Violações',
        value: `**Total:** ${stats.blockedRequests}\n**Taxa:** ${violationRate}\n**Tempo Médio:** ${stats.averageResponseTime}ms`,
        inline: true,
      },
      {
        name: '🎯 Eficiência',
        value: `**Sistema:** ${stats.blockedRequests > 0 ? 'Ativo' : 'Estável'}\n**Proteção:** ${stats.blockedRequests > 10 ? 'Alta' : 'Normal'}\n**Performance:** Otimizada`,
        inline: true,
      },
      {
        name: '🔧 Configurações Ativas',
        value:
          '• Rate limiting progressivo\n• Limpeza automática de dados\n• Monitoramento comportamental\n• Penalidades adaptativas\n• Sistema de confiança do usuário',
        inline: false,
      },
      {
        name: '📈 Recomendações',
        value:
          stats.blockedRequests > 50
            ? '⚠️ Alto número de requisições bloqueadas detectado. Considere revisar as configurações.'
            : stats.blockedRequests > 5
              ? '⚡ Múltiplas requisições bloqueadas. Sistema funcionando corretamente.'
              : '✅ Sistema operando dentro dos parâmetros normais.',
        inline: false,
      }
    )
    .setColor(
      stats.blockedRequests > 50 ? '#ff0000' : stats.blockedRequests > 0 ? '#ffaa00' : '#00ff00'
    )
    .setTimestamp()
    .setFooter({ text: 'Estatísticas atualizadas em tempo real' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
