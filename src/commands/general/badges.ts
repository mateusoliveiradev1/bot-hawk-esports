import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { BadgeService } from '../../services/badge.service';
import { DatabaseService } from '../../database/database.service';

/**
 * Badges command - Shows user badges and available badges
 */
const badges: Command = {
  data: new SlashCommandBuilder()
    .setName('badges')
    .setDescription('🏅 Visualize suas badges e progresso')
    .addSubcommand(subcommand =>
      subcommand
        .setName('minhas')
        .setDescription('Mostra suas badges conquistadas')
        .addUserOption(option =>
          option.setName('usuario').setDescription('Ver badges de outro usuário').setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disponiveis')
        .setDescription('Mostra todas as badges disponíveis')
        .addStringOption(option =>
          option
            .setName('categoria')
            .setDescription('Filtrar por categoria')
            .setRequired(false)
            .addChoices(
              { name: '🎮 PUBG', value: 'pubg' },
              { name: '💬 Social', value: 'social' },
              { name: '🎯 Gaming', value: 'gaming' },
              { name: '📅 Participação', value: 'participation' },
              { name: '🏆 Conquistas', value: 'achievement' },
              { name: '⭐ Especiais', value: 'special' }
            )
        )
        .addStringOption(option =>
          option
            .setName('raridade')
            .setDescription('Filtrar por raridade')
            .setRequired(false)
            .addChoices(
              { name: '⚪ Comum', value: 'common' },
              { name: '🟢 Incomum', value: 'uncommon' },
              { name: '🔵 Raro', value: 'rare' },
              { name: '🟣 Épico', value: 'epic' },
              { name: '🟠 Lendário', value: 'legendary' },
              { name: '🔴 Mítico', value: 'mythic' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('progresso')
        .setDescription('Mostra seu progresso em badges específicas')
        .addStringOption(option =>
          option
            .setName('badge')
            .setDescription('ID da badge para ver progresso')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ranking')
        .setDescription('Ranking de usuários com mais badges')
        .addIntegerOption(option =>
          option
            .setName('limite')
            .setDescription('Número de usuários no ranking (padrão: 10)')
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(25)
        )
    ) as SlashCommandBuilder,

  category: CommandCategory.BADGES,
  cooldown: 5,

  async execute(interaction: any, client: ExtendedClient) {
    const logger = new Logger();
    const badgeService = (client as any).badgeService;
    const database = client.database;

    try {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'minhas':
          await handleMyBadges(interaction, badgeService, database, logger);
          break;
        case 'disponiveis':
          await handleAvailableBadges(interaction, badgeService, logger);
          break;
        case 'progresso':
          await handleBadgeProgress(interaction, badgeService, database, logger);
          break;
        case 'ranking':
          await handleBadgeRanking(interaction, badgeService, client, logger);
          break;
      }
    } catch (error) {
      logger.error('Error in badges command:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar o comando de badges.')
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  },

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'badge') {
      // Note: client is not available in autocomplete context
      // For now, return empty array - this would need to be implemented differently
      return interaction.respond([]);
    }
  },
};

/**
 * Handle "minhas" subcommand - Show user's badges
 */
async function handleMyBadges(
  interaction: any,
  badgeService: BadgeService,
  database: DatabaseService,
  logger: Logger
) {
  const targetUser = interaction.options.getUser('usuario') || interaction.user;
  const userId = targetUser.id;

  await interaction.deferReply();

  try {
    // Get user badges from database
    const userBadges = await database.client.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    });

    if (userBadges.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('🏅 Badges')
        .setDescription(
          `${targetUser.username} ainda não conquistou nenhuma badge.\n\nUse \`/badges disponiveis\` para ver as badges disponíveis!`
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Group badges by category
    const badgesByCategory: Record<string, any[]> = {};
    for (const userBadge of userBadges) {
      const category = userBadge.badge.category;
      if (!badgesByCategory[category]) {
        badgesByCategory[category] = [];
      }
      badgesByCategory[category].push(userBadge);
    }

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle(`🏅 Badges de ${targetUser.username}`)
      .setDescription(`Total: **${userBadges.length}** badges conquistadas`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    // Add fields for each category
    const categoryNames: Record<string, string> = {
      pubg: '🎮 PUBG',
      social: '💬 Social',
      gaming: '🎯 Gaming',
      participation: '📅 Participação',
      achievement: '🏆 Conquistas',
      special: '⭐ Especiais',
    };

    for (const [category, badges] of Object.entries(badgesByCategory)) {
      const categoryName = categoryNames[category] || category;
      const badgeList = badges
        .map(ub => `${ub.badge.icon} **${ub.badge.name}** (${getRarityEmoji(ub.badge.rarity)})`)
        .join('\n');

      embed.addFields({
        name: `${categoryName} (${badges.length})`,
        value: badgeList.length > 1024 ? badgeList.substring(0, 1021) + '...' : badgeList,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error fetching user badges:', error);
    throw error;
  }
}

/**
 * Handle "disponiveis" subcommand - Show available badges
 */
async function handleAvailableBadges(interaction: any, badgeService: BadgeService, logger: Logger) {
  const category = interaction.options.getString('categoria');
  const rarity = interaction.options.getString('raridade');

  await interaction.deferReply();

  try {
    let availableBadges = badgeService.getAvailableBadges(false);

    // Apply filters
    if (category) {
      availableBadges = availableBadges.filter(badge => badge.category === category);
    }

    if (rarity) {
      availableBadges = availableBadges.filter(badge => badge.rarity === rarity);
    }

    if (availableBadges.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('🏅 Badges Disponíveis')
        .setDescription('Nenhuma badge encontrada com os filtros aplicados.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Group by category
    const badgesByCategory: Record<string, any[]> = {};
    for (const badge of availableBadges) {
      if (!badgesByCategory[badge.category]) {
        badgesByCategory[badge.category] = [];
      }
      badgesByCategory[badge.category]!.push(badge);
    }

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🏅 Badges Disponíveis')
      .setDescription(`Total: **${availableBadges.length}** badges disponíveis`)
      .setTimestamp();

    const categoryNames: Record<string, string> = {
      pubg: '🎮 PUBG',
      social: '💬 Social',
      gaming: '🎯 Gaming',
      participation: '📅 Participação',
      achievement: '🏆 Conquistas',
      special: '⭐ Especiais',
    };

    for (const [cat, badges] of Object.entries(badgesByCategory)) {
      const categoryName = categoryNames[cat] || cat;
      const badgeList = badges
        .map(badge => {
          const rarityEmoji = getRarityEmoji(badge.rarity);
          const rewards = [];
          if (badge.rewards?.xp) {
            rewards.push(`${badge.rewards.xp} XP`);
          }
          if (badge.rewards?.coins) {
            rewards.push(`${badge.rewards.coins} moedas`);
          }
          const rewardText = rewards.length > 0 ? ` • ${rewards.join(', ')}` : '';

          return `${badge.icon} **${badge.name}** (${rarityEmoji})\n*${badge.description}*${rewardText}`;
        })
        .join('\n\n');

      // Split long fields
      if (badgeList.length > 1024) {
        const chunks = badgeList.match(/[\s\S]{1,1024}/g) || [];
        chunks.forEach((chunk, index) => {
          embed.addFields({
            name: index === 0 ? `${categoryName} (${badges.length})` : '\u200b',
            value: chunk,
            inline: false,
          });
        });
      } else {
        embed.addFields({
          name: `${categoryName} (${badges.length})`,
          value: badgeList,
          inline: false,
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error fetching available badges:', error);
    throw error;
  }
}

/**
 * Handle "progresso" subcommand - Show badge progress
 */
async function handleBadgeProgress(
  interaction: any,
  badgeService: BadgeService,
  database: DatabaseService,
  logger: Logger
) {
  const badgeId = interaction.options.getString('badge');
  const userId = interaction.user.id;

  await interaction.deferReply();

  try {
    const badge = badgeService.getBadge(badgeId);
    if (!badge) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Badge não encontrada')
        .setDescription('A badge especificada não foi encontrada.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check if user already has the badge
    const hasBadge = await database.badges.hasUserBadge(userId, badgeId);

    const embed = new EmbedBuilder()
      .setColor(hasBadge ? '#00ff00' : '#ffa500')
      .setTitle(`${badge.icon} ${badge.name}`)
      .setDescription(badge.description)
      .addFields(
        { name: '📊 Categoria', value: badge.category, inline: true },
        {
          name: '💎 Raridade',
          value: `${getRarityEmoji(badge.rarity)} ${badge.rarity}`,
          inline: true,
        },
        {
          name: '✅ Status',
          value: hasBadge ? '🏅 Conquistada!' : '⏳ Não conquistada',
          inline: true,
        }
      )
      .setTimestamp();

    // Add requirements
    if (badge.requirements && badge.requirements.length > 0) {
      const requirementText = badge.requirements
        .map(req => {
          const operator = getOperatorText(req.operator);
          return `• ${getRequirementTypeText(req.type)} ${operator} ${req.value}`;
        })
        .join('\n');

      embed.addFields({
        name: '📋 Requisitos',
        value: requirementText,
        inline: false,
      });
    }

    // Add rewards
    if (badge.rewards) {
      const rewards = [];
      if (badge.rewards.xp) {
        rewards.push(`${badge.rewards.xp} XP`);
      }
      if (badge.rewards.coins) {
        rewards.push(`${badge.rewards.coins} moedas`);
      }
      if (badge.rewards.role) {
        rewards.push(`Cargo: ${badge.rewards.role}`);
      }

      if (rewards.length > 0) {
        embed.addFields({
          name: '🎁 Recompensas',
          value: rewards.join('\n'),
          inline: false,
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error fetching badge progress:', error);
    throw error;
  }
}

/**
 * Handle "ranking" subcommand - Show badge leaderboard
 */
async function handleBadgeRanking(
  interaction: any,
  badgeService: BadgeService,
  client: ExtendedClient,
  logger: Logger
) {
  const limit = interaction.options.getInteger('limite') || 10;

  await interaction.deferReply();

  try {
    const leaderboard = badgeService.getBadgeLeaderboard(limit);

    if (leaderboard.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('🏆 Ranking de Badges')
        .setDescription('Nenhum usuário com badges encontrado.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle('🏆 Ranking de Badges')
      .setDescription(`Top ${limit} usuários com mais badges`)
      .setTimestamp();

    const rankingText = await Promise.all(
      leaderboard.map(async (entry, index) => {
        try {
          const user = await client.users.fetch(entry.userId);
          const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}º`;
          return `${medal} **${user.username}** - ${entry.badgeCount} badges`;
        } catch {
          return `${index + 1}º **Usuário Desconhecido** - ${entry.badgeCount} badges`;
        }
      })
    );

    embed.addFields({
      name: '📊 Ranking',
      value: rankingText.join('\n'),
      inline: false,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error fetching badge ranking:', error);
    throw error;
  }
}

/**
 * Get rarity emoji
 */
function getRarityEmoji(rarity: string): string {
  const rarityEmojis: Record<string, string> = {
    common: '⚪',
    uncommon: '🟢',
    rare: '🔵',
    epic: '🟣',
    legendary: '🟠',
    mythic: '🔴',
  };

  return rarityEmojis[rarity] || '⚪';
}

/**
 * Get operator text
 */
function getOperatorText(operator: string): string {
  const operators: Record<string, string> = {
    gte: 'pelo menos',
    lte: 'no máximo',
    eq: 'exatamente',
    between: 'entre',
  };

  return operators[operator] || operator;
}

/**
 * Get requirement type text
 */
function getRequirementTypeText(type: string): string {
  const types: Record<string, string> = {
    kills: 'Kills',
    wins: 'Vitórias',
    headshots: 'Headshots',
    damage: 'Dano causado',
    messages: 'Mensagens enviadas',
    voice_time: 'Tempo em voz (segundos)',
    reactions: 'Reações recebidas',
    invites: 'Convites feitos',
    quiz_score: 'Pontuação em quizzes',
    mini_game_wins: 'Vitórias em mini-games',
    consecutive_days: 'Dias consecutivos',
    clips_uploaded: 'Clips enviados',
    clips_votes: 'Votos em clips',
    level: 'Nível',
    coins_earned: 'Moedas ganhas',
    badges_earned: 'Badges conquistadas',
  };

  return types[type] || type;
}

export default badges;
