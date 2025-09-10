import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
} from 'discord.js';
import { ExtendedClient } from '../../types/client';
import { PresenceEnhancementsService } from '../../services/presence-enhancements.service';
import { Logger } from '../../utils/logger';

const logger = new Logger();

export default {
  data: new SlashCommandBuilder()
    .setName('presence-enhancements')
    .setDescription('Gerenciar melhorias do sistema de presença')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName('status').setDescription('Ver status das melhorias de presença'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('validate-pubg')
        .setDescription('Validar integração PUBG de um usuário')
        .addUserOption(option =>
          option.setName('usuario').setDescription('Usuário para validar').setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('config-punishment')
        .setDescription('Configurar punições automáticas')
        .addBooleanOption(option =>
          option
            .setName('habilitado')
            .setDescription('Habilitar/desabilitar punições automáticas')
            .setRequired(false),
        )
        .addIntegerOption(option =>
          option
            .setName('intervalo')
            .setDescription('Intervalo de verificação em minutos (5-60)')
            .setMinValue(5)
            .setMaxValue(60)
            .setRequired(false),
        )
        .addIntegerOption(option =>
          option
            .setName('periodo-graca')
            .setDescription('Período de graça em minutos (1-30)')
            .setMinValue(1)
            .setMaxValue(30)
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('stats').setDescription('Ver estatísticas das melhorias'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('user-history')
        .setDescription('Ver histórico de melhorias de um usuário')
        .addUserOption(option =>
          option.setName('usuario').setDescription('Usuário para ver histórico').setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cleanup')
        .setDescription('Limpar melhorias antigas')
        .addIntegerOption(option =>
          option
            .setName('dias')
            .setDescription('Limpar melhorias mais antigas que X dias (7-90)')
            .setMinValue(7)
            .setMaxValue(90)
            .setRequired(false),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const enhancementsService = (client as any)
        .presenceEnhancementsService as PresenceEnhancementsService;

      if (!enhancementsService) {
        return await interaction.reply({
          content: '❌ Serviço de melhorias de presença não está disponível.',
          ephemeral: true,
        });
      }

      switch (subcommand) {
        case 'status':
          await handleStatus(interaction, enhancementsService);
          break;

        case 'validate-pubg':
          await handleValidatePubg(interaction, enhancementsService);
          break;

        case 'config-punishment':
          await handleConfigPunishment(interaction, enhancementsService);
          break;

        case 'stats':
          await handleStats(interaction, enhancementsService);
          break;

        case 'user-history':
          await handleUserHistory(interaction, enhancementsService);
          break;

        case 'cleanup':
          await handleCleanup(interaction, enhancementsService);
          break;

        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            ephemeral: true,
          });
          break;
      }
    } catch (error) {
      logger.error('Error in presence-enhancements command:', error);

      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `❌ Erro ao executar comando: ${errorMessage}`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `❌ Erro ao executar comando: ${errorMessage}`,
          ephemeral: true,
        });
      }
    }
    return;
  },
};

/**
 * Handle status subcommand
 */
async function handleStatus(
  interaction: ChatInputCommandInteraction,
  enhancementsService: PresenceEnhancementsService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const stats = enhancementsService.getEnhancementStats();

  const embed = new EmbedBuilder()
    .setTitle('📊 Status das Melhorias de Presença')
    .setColor(0x00ff00)
    .addFields(
      {
        name: '📈 Melhorias Totais',
        value: stats.totalEnhancements.toString(),
        inline: true,
      },
      {
        name: '✅ Sucessos',
        value: stats.successfulEnhancements.toString(),
        inline: true,
      },
      {
        name: '❌ Falhas',
        value: stats.failedEnhancements.toString(),
        inline: true,
      },
      {
        name: '🎮 Validações PUBG',
        value: stats.pubgValidations.toString(),
        inline: true,
      },
      {
        name: '✅ PUBG Válidos',
        value: stats.validPubgUsers.toString(),
        inline: true,
      },
      {
        name: '⚖️ Punições Auto',
        value: stats.autoPunishments.toString(),
        inline: true,
      },
    )
    .setTimestamp();

  // Calculate success rate
  if (stats.totalEnhancements > 0) {
    const successRate = ((stats.successfulEnhancements / stats.totalEnhancements) * 100).toFixed(1);
    embed.addFields({
      name: '📊 Taxa de Sucesso',
      value: `${successRate}%`,
      inline: true,
    });
  }

  // Calculate PUBG validation rate
  if (stats.pubgValidations > 0) {
    const validationRate = ((stats.validPubgUsers / stats.pubgValidations) * 100).toFixed(1);
    embed.addFields({
      name: '🎮 Taxa de PUBG Válido',
      value: `${validationRate}%`,
      inline: true,
    });
  }

  await interaction.followUp({ embeds: [embed] });
}

/**
 * Handle validate-pubg subcommand
 */
async function handleValidatePubg(
  interaction: ChatInputCommandInteraction,
  enhancementsService: PresenceEnhancementsService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser('usuario', true);
  const guildId = interaction.guildId!;

  const validation = await enhancementsService.validatePUBGIntegration(user.id, guildId);

  const embed = new EmbedBuilder()
    .setTitle('🎮 Validação PUBG')
    .setColor(validation.isValid ? 0x00ff00 : 0xff0000)
    .addFields(
      {
        name: '👤 Usuário',
        value: `${user.displayName} (${user.id})`,
        inline: false,
      },
      {
        name: '✅ Status',
        value: validation.isValid ? 'Válido' : 'Inválido',
        inline: true,
      },
      {
        name: '🕐 Última Validação',
        value: validation.lastValidated
          ? `<t:${Math.floor(validation.lastValidated.getTime() / 1000)}:R>`
          : 'Nunca validado',
        inline: true,
      },
    );

  if (validation.pubgUsername) {
    embed.addFields({
      name: '🎮 Username PUBG',
      value: validation.pubgUsername,
      inline: true,
    });
  }

  if (validation.pubgPlatform) {
    embed.addFields({
      name: '🖥️ Plataforma',
      value: validation.pubgPlatform,
      inline: true,
    });
  }

  if (validation.stats) {
    embed.addFields({
      name: '📊 Estatísticas PUBG',
      value: [
        `**Partidas:** ${validation.stats.matches || 0}`,
        `**Kills:** ${validation.stats.kills || 0}`,
        `**Vitórias:** ${validation.stats.wins || 0}`,
        `**KDA:** ${validation.stats.kda ? validation.stats.kda.toFixed(2) : '0.00'}`,
        `**Rank:** ${validation.stats.rank || 'N/A'}`,
      ].join('\n'),
      inline: false,
    });
  }

  if (validation.validationErrors && validation.validationErrors.length > 0) {
    embed.addFields({
      name: '❌ Erros de Validação',
      value: validation.validationErrors.join('\n'),
      inline: false,
    });
  }

  await interaction.followUp({ embeds: [embed] });
}

/**
 * Handle config-punishment subcommand
 */
async function handleConfigPunishment(
  interaction: ChatInputCommandInteraction,
  enhancementsService: PresenceEnhancementsService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const enabled = interaction.options.getBoolean('habilitado');
  const interval = interaction.options.getInteger('intervalo');
  const gracePeriod = interaction.options.getInteger('periodo-graca');

  const config: any = {};

  if (enabled !== null) {
    config.enabled = enabled;
  }
  if (interval !== null) {
    config.checkInterval = interval;
  }
  if (gracePeriod !== null) {
    config.gracePeriod = gracePeriod;
  }

  if (Object.keys(config).length === 0) {
    await interaction.followUp({
      content: '❌ Nenhuma configuração foi fornecida.',
      ephemeral: true,
    });
    return;
  }

  enhancementsService.updateAutoPunishmentConfig(config);

  const embed = new EmbedBuilder()
    .setTitle('⚖️ Configuração de Punições Automáticas Atualizada')
    .setColor(0x00ff00)
    .setDescription('As configurações foram atualizadas com sucesso.')
    .setTimestamp();

  const configFields = [];
  if (enabled !== null) {
    configFields.push(`**Habilitado:** ${enabled ? 'Sim' : 'Não'}`);
  }
  if (interval !== null) {
    configFields.push(`**Intervalo:** ${interval} minutos`);
  }
  if (gracePeriod !== null) {
    configFields.push(`**Período de Graça:** ${gracePeriod} minutos`);
  }

  if (configFields.length > 0) {
    embed.addFields({
      name: '🔧 Configurações Alteradas',
      value: configFields.join('\n'),
      inline: false,
    });
  }

  await interaction.followUp({ embeds: [embed] });
}

/**
 * Handle stats subcommand
 */
async function handleStats(
  interaction: ChatInputCommandInteraction,
  enhancementsService: PresenceEnhancementsService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const stats = enhancementsService.getEnhancementStats();

  const embed = new EmbedBuilder()
    .setTitle('📈 Estatísticas Detalhadas das Melhorias')
    .setColor(0x0099ff)
    .setDescription('Estatísticas completas do sistema de melhorias de presença.')
    .addFields(
      {
        name: '📊 Resumo Geral',
        value: [
          `**Total de Melhorias:** ${stats.totalEnhancements}`,
          `**Sucessos:** ${stats.successfulEnhancements}`,
          `**Falhas:** ${stats.failedEnhancements}`,
          `**Taxa de Sucesso:** ${stats.totalEnhancements > 0 ? ((stats.successfulEnhancements / stats.totalEnhancements) * 100).toFixed(1) : '0'}%`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎮 Integração PUBG',
        value: [
          `**Validações Totais:** ${stats.pubgValidations}`,
          `**Usuários Válidos:** ${stats.validPubgUsers}`,
          `**Taxa de Validação:** ${stats.pubgValidations > 0 ? ((stats.validPubgUsers / stats.pubgValidations) * 100).toFixed(1) : '0'}%`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '⚖️ Punições Automáticas',
        value: [
          `**Total Aplicadas:** ${stats.autoPunishments}`,
          `**% do Total:** ${stats.totalEnhancements > 0 ? ((stats.autoPunishments / stats.totalEnhancements) * 100).toFixed(1) : '0'}%`,
        ].join('\n'),
        inline: true,
      },
    )
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}

/**
 * Handle user-history subcommand
 */
async function handleUserHistory(
  interaction: ChatInputCommandInteraction,
  enhancementsService: PresenceEnhancementsService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser('usuario', true);
  const enhancements = enhancementsService.getUserEnhancements(user.id);

  if (enhancements.length === 0) {
    await interaction.followUp({
      content: `❌ Nenhuma melhoria encontrada para o usuário ${user.displayName}.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 Histórico de Melhorias - ${user.displayName}`)
    .setColor(0x0099ff)
    .setDescription(`Histórico completo de melhorias para ${user.displayName}.`);

  // Sort by date (most recent first)
  const sortedEnhancements = enhancements
    .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
    .slice(0, 10); // Show only last 10

  const historyText = sortedEnhancements
    .map(enhancement => {
      const typeEmoji =
        {
          pubg_validation: '🎮',
          auto_punishment: '⚖️',
          performance_optimization: '⚡',
          streak_bonus: '🔥',
        }[enhancement.type] || '📝';

      const statusEmoji = enhancement.success ? '✅' : '❌';
      const timestamp = `<t:${Math.floor(enhancement.appliedAt.getTime() / 1000)}:R>`;

      return `${typeEmoji} ${statusEmoji} **${enhancement.description}** - ${timestamp}`;
    })
    .join('\n');

  embed.addFields({
    name: '📜 Histórico (Últimas 10)',
    value: historyText || 'Nenhuma melhoria encontrada.',
    inline: false,
  });

  // Add summary
  const successCount = enhancements.filter(e => e.success).length;
  const failCount = enhancements.length - successCount;

  embed.addFields({
    name: '📊 Resumo',
    value: [
      `**Total:** ${enhancements.length}`,
      `**Sucessos:** ${successCount}`,
      `**Falhas:** ${failCount}`,
      `**Taxa de Sucesso:** ${enhancements.length > 0 ? ((successCount / enhancements.length) * 100).toFixed(1) : '0'}%`,
    ].join('\n'),
    inline: false,
  });

  await interaction.followUp({ embeds: [embed] });
}

/**
 * Handle cleanup subcommand
 */
async function handleCleanup(
  interaction: ChatInputCommandInteraction,
  enhancementsService: PresenceEnhancementsService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const days = interaction.options.getInteger('dias') || 30;

  const clearedCount = await enhancementsService.clearOldEnhancements(days);

  const embed = new EmbedBuilder()
    .setTitle('🧹 Limpeza de Melhorias Concluída')
    .setColor(0x00ff00)
    .setDescription('Limpeza de melhorias antigas concluída com sucesso.')
    .addFields({
      name: '📊 Resultados',
      value: [
        `**Melhorias Removidas:** ${clearedCount}`,
        `**Período:** Mais antigas que ${days} dias`,
        `**Data de Corte:** <t:${Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)}:F>`,
      ].join('\n'),
      inline: false,
    })
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}
