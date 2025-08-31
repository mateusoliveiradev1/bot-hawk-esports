import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { ExtendedClient } from '../../types/client';
import { Command, CommandCategory } from '../../types/command';
import { BadgeOptimizationService } from '../../services/badge-optimization.service';

const badgeOptimization: Command = {
  category: CommandCategory.ADMIN,
  data: new SlashCommandBuilder()
    .setName('badge-optimization')
    .setDescription('Gerenciar sistema de badges otimizado com integração PUBG')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName('sync').setDescription('Sincronizar todas as badges com dados PUBG'),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('collections').setDescription('Visualizar coleções de badges disponíveis'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('dynamic')
        .setDescription('Gerenciar badges dinâmicas')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação a ser executada')
            .setRequired(true)
            .addChoices(
              { name: 'Listar regras', value: 'list' },
              { name: 'Ativar processamento', value: 'enable' },
              { name: 'Desativar processamento', value: 'disable' },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('seasonal')
        .setDescription('Gerenciar badges sazonais')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação a ser executada')
            .setRequired(true)
            .addChoices(
              { name: 'Listar badges', value: 'list' },
              { name: 'Ativar temporada', value: 'activate' },
              { name: 'Finalizar temporada', value: 'end' },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('stats').setDescription('Visualizar estatísticas do sistema de badges'),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('optimize').setDescription('Executar otimização automática do sistema'),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as ExtendedClient;
    const badgeOptimizationService = client.badgeOptimizationService;

    if (!badgeOptimizationService) {
      await interaction.reply({
        content: '❌ Serviço de otimização de badges não está disponível.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.data[0]?.name;

    try {
      switch (subcommand) {
        case 'sync':
          await handleSync(interaction, badgeOptimizationService);
          break;
        case 'collections':
          await handleCollections(interaction, badgeOptimizationService);
          break;
        case 'dynamic':
          await handleDynamic(interaction, badgeOptimizationService);
          break;
        case 'seasonal':
          await handleSeasonal(interaction, badgeOptimizationService);
          break;
        case 'stats':
          await handleStats(interaction, badgeOptimizationService);
          break;
        case 'optimize':
          await handleOptimize(interaction, badgeOptimizationService);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            flags: MessageFlags.Ephemeral,
          });
          break;
      }
    } catch (error) {
      console.error('Erro no comando badge-optimization:', error);
      await interaction.reply({
        content: '❌ Erro interno do servidor. Tente novamente mais tarde.',
        flags: MessageFlags.Ephemeral,
      });
    }

    return;
  },
};

async function handleSync(
  interaction: ChatInputCommandInteraction,
  service: BadgeOptimizationService,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await service.syncAllBadges();

    const embed = new EmbedBuilder()
      .setTitle('🔄 Sincronização de Badges Concluída')
      .setColor('#00FF00')
      .addFields(
        { name: '📊 Badges Processadas', value: result.processed.toString(), inline: true },
        { name: '✅ Badges Atualizadas', value: result.updated.toString(), inline: true },
        { name: '🆕 Badges Criadas', value: result.created.toString(), inline: true },
        { name: '⚠️ Erros', value: result.errors.toString(), inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro na sincronização:', error);
    await interaction.editReply({
      content: '❌ Erro durante a sincronização de badges.',
    });
  }
}

async function handleCollections(
  interaction: ChatInputCommandInteraction,
  service: BadgeOptimizationService,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const collections = await service.getBadgeCollections();

    const embed = new EmbedBuilder()
      .setTitle('📚 Coleções de Badges Disponíveis')
      .setColor('#4A90E2')
      .setTimestamp();

    for (const [name, collection] of Object.entries(collections)) {
      const rarityCount = Object.entries(
        collection.badges.reduce(
          (acc, badge) => {
            const badgeObj = badge as any;
            acc[badgeObj.rarity] = (acc[badgeObj.rarity] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      )
        .map(([rarity, count]) => `${rarity}: ${count}`)
        .join(', ');

      embed.addFields({
        name: `🏆 ${collection.name}`,
        value: `**Descrição:** ${collection.description}\n**Total:** ${collection.badges.length} badges\n**Raridades:** ${rarityCount}`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao buscar coleções:', error);
    await interaction.editReply({
      content: '❌ Erro ao buscar coleções de badges.',
    });
  }
}

async function handleDynamic(
  interaction: ChatInputCommandInteraction,
  service: BadgeOptimizationService,
) {
  const action = interaction.options.get('action')?.value as string;
  await interaction.deferReply({ ephemeral: true });

  try {
    switch (action) {
      case 'list':
        const rules = await service.getDynamicBadgeRules();
        const embed = new EmbedBuilder()
          .setTitle('⚡ Regras de Badges Dinâmicas')
          .setColor('#FF6B35')
          .setTimestamp();

        rules.forEach(rule => {
          embed.addFields({
            name: `${rule.name} ${rule.isActive ? '🟢' : '🔴'}`,
            value: `**Condição:** ${rule.condition}\n**Frequência:** ${rule.frequency}\n**Última execução:** ${rule.lastExecuted ? new Date(rule.lastExecuted).toLocaleString('pt-BR') : 'Nunca'}`,
            inline: false,
          });
        });

        await interaction.editReply({ embeds: [embed] });
        break;

      case 'enable':
        await service.enableDynamicProcessing();
        await interaction.editReply({
          content: '✅ Processamento de badges dinâmicas ativado.',
        });
        break;

      case 'disable':
        await service.disableDynamicProcessing();
        await interaction.editReply({
          content: '⏸️ Processamento de badges dinâmicas desativado.',
        });
        break;
    }
  } catch (error) {
    console.error('Erro no gerenciamento dinâmico:', error);
    await interaction.editReply({
      content: '❌ Erro no gerenciamento de badges dinâmicas.',
    });
  }
}

async function handleSeasonal(
  interaction: ChatInputCommandInteraction,
  service: BadgeOptimizationService,
) {
  const action = interaction.options.get('action')?.value as string;
  await interaction.deferReply({ ephemeral: true });

  try {
    switch (action) {
      case 'list':
        const seasonalBadges = await service.getSeasonalBadges();
        const embed = new EmbedBuilder()
          .setTitle('🎭 Badges Sazonais')
          .setColor('#9B59B6')
          .setTimestamp();

        seasonalBadges.forEach(badge => {
          const status = badge.isActive ? '🟢 Ativa' : '🔴 Inativa';
          const period =
            badge.startDate && badge.endDate
              ? `${new Date(badge.startDate).toLocaleDateString('pt-BR')} - ${new Date(badge.endDate).toLocaleDateString('pt-BR')}`
              : 'Período não definido';

          embed.addFields({
            name: `${badge.icon} ${badge.name} (${status})`,
            value: `**Descrição:** ${badge.description}\n**Período:** ${period}\n**Raridade:** ${badge.rarity}`,
            inline: false,
          });
        });

        await interaction.editReply({ embeds: [embed] });
        break;

      case 'activate':
        await service.activateSeasonalBadges();
        await interaction.editReply({
          content: '🎉 Badges sazonais ativadas para a temporada atual.',
        });
        break;

      case 'end':
        await service.endSeasonalBadges();
        await interaction.editReply({
          content: '🏁 Temporada de badges sazonais finalizada.',
        });
        break;
    }
  } catch (error) {
    console.error('Erro no gerenciamento sazonal:', error);
    await interaction.editReply({
      content: '❌ Erro no gerenciamento de badges sazonais.',
    });
  }
}

async function handleStats(
  interaction: ChatInputCommandInteraction,
  service: BadgeOptimizationService,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const stats = await service.getBadgeSystemStats();

    const embed = new EmbedBuilder()
      .setTitle('📊 Estatísticas do Sistema de Badges')
      .setColor('#3498DB')
      .addFields(
        { name: '🏆 Total de Badges', value: stats.totalBadges.toString(), inline: true },
        { name: '👥 Usuários com Badges', value: stats.usersWithBadges.toString(), inline: true },
        { name: '⭐ Badge Mais Rara', value: stats.rarest || 'N/A', inline: true },
        { name: '🔥 Badge Mais Popular', value: stats.mostPopular || 'N/A', inline: true },
        {
          name: '📈 Badges Concedidas (24h)',
          value: stats.badgesGrantedToday.toString(),
          inline: true,
        },
        { name: '🎯 Taxa de Conquista', value: `${stats.completionRate.toFixed(1)}%`, inline: true },
      )
      .setTimestamp();

    if (stats.rarityDistribution) {
      const distribution = Object.entries(stats.rarityDistribution)
        .map(([rarity, count]) => `${rarity}: ${count}`)
        .join('\n');

      embed.addFields({
        name: '🎨 Distribuição por Raridade',
        value: distribution,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    await interaction.editReply({
      content: '❌ Erro ao buscar estatísticas do sistema.',
    });
  }
}

async function handleOptimize(
  interaction: ChatInputCommandInteraction,
  service: BadgeOptimizationService,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await service.runOptimization();

    const embed = new EmbedBuilder()
      .setTitle('⚡ Otimização do Sistema Concluída')
      .setColor('#E74C3C')
      .addFields(
        { name: '🔍 Badges Analisadas', value: result.analyzed.toString(), inline: true },
        { name: '🔧 Otimizações Aplicadas', value: result.optimized.toString(), inline: true },
        { name: '⏱️ Tempo de Execução', value: `${result.executionTime}ms`, inline: true },
        { name: '💾 Cache Atualizado', value: result.cacheUpdated ? '✅' : '❌', inline: true },
      )
      .setTimestamp();

    if (result.recommendations && result.recommendations.length > 0) {
      embed.addFields({
        name: '📋 Recomendações',
        value: result.recommendations.join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro na otimização:', error);
    await interaction.editReply({
      content: '❌ Erro durante a otimização do sistema.',
    });
  }
}

export default badgeOptimization;
