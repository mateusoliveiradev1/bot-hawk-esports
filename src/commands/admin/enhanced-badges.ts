import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  User,
} from 'discord.js';
import { ExtendedClient } from '../../types/client';
import { BadgeService } from '../../services/badge.service';

export default {
  data: new SlashCommandBuilder()
    .setName('enhanced-badges')
    .setDescription('Gerenciar badges aprimoradas do sistema')
    .addSubcommand(subcommand =>
      subcommand
        .setName('test-streak')
        .setDescription('Testar sistema de badges de streak')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Usuário para testar')
            .setRequired(true),
        )
        .addIntegerOption(option =>
          option
            .setName('days')
            .setDescription('Número de dias de streak')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(365),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test-event')
        .setDescription('Testar participação em evento')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Usuário para testar')
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('event-type')
            .setDescription('Tipo de evento')
            .setRequired(true)
            .addChoices(
              { name: 'Evento Geral', value: 'general' },
              { name: 'Torneio', value: 'tournament' },
              { name: 'Evento Sazonal', value: 'seasonal' },
              { name: 'Competição', value: 'competition' },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test-team')
        .setDescription('Testar atividade em equipe')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Usuário para testar')
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('activity')
            .setDescription('Tipo de atividade')
            .setRequired(true)
            .addChoices(
              { name: 'Vitória em Equipe', value: 'win' },
              { name: 'Assistência', value: 'assist' },
              { name: 'Reviver Aliado', value: 'revive' },
            ),
        )
        .addIntegerOption(option =>
          option
            .setName('count')
            .setDescription('Quantidade')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test-community')
        .setDescription('Testar interação da comunidade')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Usuário para testar')
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('interaction')
            .setDescription('Tipo de interação')
            .setRequired(true)
            .addChoices(
              { name: 'Compartilhar Clip', value: 'shared_clip' },
              { name: 'Votar na Comunidade', value: 'community_vote' },
            ),
        )
        .addIntegerOption(option =>
          option
            .setName('count')
            .setDescription('Quantidade')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list-new')
        .setDescription('Listar novas badges disponíveis')
        .addStringOption(option =>
          option
            .setName('category')
            .setDescription('Filtrar por categoria')
            .setRequired(false)
            .addChoices(
              { name: 'Streak', value: 'streak' },
              { name: 'Comunidade', value: 'community' },
              { name: 'Colaboração', value: 'collaboration' },
              { name: 'Sazonal', value: 'seasonal' },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('user-progress')
        .setDescription('Ver progresso de badges de um usuário')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Usuário para verificar')
            .setRequired(true),
        ),
    )
    .setDefaultMemberPermissions('0'),

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const badgeService = client.services?.badge as BadgeService;

    if (!badgeService) {
      await interaction.reply({
        content: '❌ Serviço de badges não está disponível.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'test-streak':
        await handleTestStreak(interaction, badgeService);
        break;
      case 'test-event':
        await handleTestEvent(interaction, badgeService);
        break;
      case 'test-team':
        await handleTestTeam(interaction, badgeService);
        break;
      case 'test-community':
        await handleTestCommunity(interaction, badgeService);
        break;
      case 'list-new':
        await handleListNew(interaction, badgeService);
        break;
      case 'user-progress':
        await handleUserProgress(interaction, badgeService);
        break;
      default:
        await interaction.reply({
          content: '❌ Subcomando não reconhecido.',
          flags: MessageFlags.Ephemeral,
        });
        break;
    }
  },
};

async function handleTestStreak(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const user = interaction.options.getUser('user', true);
    const days = interaction.options.getInteger('days', true);

    await badgeService.onDailyStreak(user.id, days);

    const embed = new EmbedBuilder()
      .setTitle('✅ Teste de Streak Executado')
      .setDescription(`Streak de ${days} dias aplicado para ${user.displayName}`)
      .addFields(
        { name: '👤 Usuário', value: user.displayName, inline: true },
        { name: '📅 Dias', value: days.toString(), inline: true },
        { name: '🎯 Ação', value: 'Daily Streak Atualizado', inline: true },
      )
      .setColor('#00FF00')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro no teste de streak:', error);
    await interaction.editReply({
      content: '❌ Erro ao executar teste de streak.',
    });
  }
}

async function handleTestEvent(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const user = interaction.options.getUser('user', true);
    const eventType = interaction.options.getString('event-type', true);

    await badgeService.onEventParticipation(user.id, eventType);

    const embed = new EmbedBuilder()
      .setTitle('✅ Teste de Evento Executado')
      .setDescription(`Participação em evento registrada para ${user.displayName}`)
      .addFields(
        { name: '👤 Usuário', value: user.displayName, inline: true },
        { name: '🎉 Tipo de Evento', value: eventType, inline: true },
        { name: '🎯 Ação', value: 'Participação Registrada', inline: true },
      )
      .setColor('#00FF00')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro no teste de evento:', error);
    await interaction.editReply({
      content: '❌ Erro ao executar teste de evento.',
    });
  }
}

async function handleTestTeam(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const user = interaction.options.getUser('user', true);
    const activity = interaction.options.getString('activity', true) as 'win' | 'assist' | 'revive';
    const count = interaction.options.getInteger('count') || 1;

    await badgeService.onTeamActivity(user.id, activity, count);

    const activityNames = {
      win: 'Vitória em Equipe',
      assist: 'Assistência',
      revive: 'Reviver Aliado',
    };

    const embed = new EmbedBuilder()
      .setTitle('✅ Teste de Atividade em Equipe Executado')
      .setDescription(`Atividade em equipe registrada para ${user.displayName}`)
      .addFields(
        { name: '👤 Usuário', value: user.displayName, inline: true },
        { name: '🤝 Atividade', value: activityNames[activity], inline: true },
        { name: '🔢 Quantidade', value: count.toString(), inline: true },
      )
      .setColor('#00FF00')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro no teste de equipe:', error);
    await interaction.editReply({
      content: '❌ Erro ao executar teste de atividade em equipe.',
    });
  }
}

async function handleTestCommunity(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const user = interaction.options.getUser('user', true);
    const interactionType = interaction.options.getString('interaction', true) as 'shared_clip' | 'community_vote';
    const count = interaction.options.getInteger('count') || 1;

    await badgeService.onCommunityInteraction(user.id, interactionType, count);

    const interactionNames = {
      shared_clip: 'Compartilhar Clip',
      community_vote: 'Votar na Comunidade',
    };

    const embed = new EmbedBuilder()
      .setTitle('✅ Teste de Interação da Comunidade Executado')
      .setDescription(`Interação da comunidade registrada para ${user.displayName}`)
      .addFields(
        { name: '👤 Usuário', value: user.displayName, inline: true },
        { name: '👥 Interação', value: interactionNames[interactionType], inline: true },
        { name: '🔢 Quantidade', value: count.toString(), inline: true },
      )
      .setColor('#00FF00')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro no teste de comunidade:', error);
    await interaction.editReply({
      content: '❌ Erro ao executar teste de interação da comunidade.',
    });
  }
}

async function handleListNew(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const category = interaction.options.getString('category');
    const allBadges = badgeService.getAvailableBadges();
    
    const newCategories = ['streak', 'community', 'collaboration', 'seasonal'];
    let filteredBadges = allBadges.filter(badge => newCategories.includes(badge.category));
    
    if (category) {
      filteredBadges = filteredBadges.filter(badge => badge.category === category);
    }

    if (filteredBadges.length === 0) {
      await interaction.editReply({
        content: '❌ Nenhuma badge encontrada para os critérios especificados.',
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🆕 Novas Badges Disponíveis')
      .setDescription(category ? `Categoria: **${category}**` : 'Todas as novas categorias')
      .setColor('#3498DB')
      .setTimestamp();

    // Group badges by category
    const badgesByCategory = filteredBadges.reduce((acc, badge) => {
      if (!acc[badge.category]) {
        acc[badge.category] = [];
      }
      acc[badge.category].push(badge);
      return acc;
    }, {} as Record<string, typeof filteredBadges>);

    for (const [cat, badges] of Object.entries(badgesByCategory)) {
      const badgeList = badges
        .map(badge => `${badge.icon} **${badge.name}** (${badge.rarity})`)
        .join('\n');
      
      embed.addFields({
        name: `📂 ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
        value: badgeList.length > 1024 ? badgeList.substring(0, 1021) + '...' : badgeList,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao listar badges:', error);
    await interaction.editReply({
      content: '❌ Erro ao listar novas badges.',
    });
  }
}

async function handleUserProgress(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const user = interaction.options.getUser('user', true);
    const userBadges = await badgeService.getUserBadges(user.id);
    const badgeStats = await badgeService.getUserBadgeStats(user.id);

    const newCategories = ['streak', 'community', 'collaboration', 'seasonal'];
    const newBadges = userBadges.filter(badge => newCategories.includes(badge.category));

    const embed = new EmbedBuilder()
      .setTitle(`📊 Progresso de Badges - ${user.displayName}`)
      .setDescription('Progresso nas novas categorias de badges')
      .addFields(
        { name: '🏆 Total de Badges', value: badgeStats.total.toString(), inline: true },
        { name: '🆕 Novas Badges', value: newBadges.length.toString(), inline: true },
        { name: '💎 Badge Mais Rara', value: badgeStats.rarest?.name || 'Nenhuma', inline: true },
      )
      .setColor('#9B59B6')
      .setTimestamp();

    if (newBadges.length > 0) {
      const badgesByCategory = newBadges.reduce((acc, badge) => {
        if (!acc[badge.category]) {
          acc[badge.category] = [];
        }
        acc[badge.category].push(badge);
        return acc;
      }, {} as Record<string, typeof newBadges>);

      for (const [category, badges] of Object.entries(badgesByCategory)) {
        const badgeList = badges
          .map(badge => `${badge.icon} ${badge.name}`)
          .join('\n');
        
        embed.addFields({
          name: `📂 ${category.charAt(0).toUpperCase() + category.slice(1)}`,
          value: badgeList.length > 1024 ? badgeList.substring(0, 1021) + '...' : badgeList,
          inline: false,
        });
      }
    } else {
      embed.addFields({
        name: '📝 Status',
        value: 'Nenhuma badge das novas categorias conquistada ainda.',
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao verificar progresso:', error);
    await interaction.editReply({
      content: '❌ Erro ao verificar progresso do usuário.',
    });
  }
}