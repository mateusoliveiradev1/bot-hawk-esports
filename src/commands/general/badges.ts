import {
  SlashCommandBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { BadgeService } from '../../services/badge.service';
import { DatabaseService } from '../../database/database.service';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';
import { HawkComponentFactory } from '../../utils/hawk-component-factory';
import { HAWK_EMOJIS } from '../../constants/hawk-emojis';
import { BaseCommand } from '../../utils/base-command.util';

/**
 * Badges command - Shows user badges and available badges
 */
class BadgesCommand extends BaseCommand {
  protected logger = new Logger();

  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('badges')
        .setDescription(`${HAWK_EMOJIS.BADGE} Visualize suas badges e progresso`)
        .addSubcommand(subcommand =>
          subcommand
            .setName('minhas')
            .setDescription('Mostra suas badges conquistadas')
            .addUserOption(option =>
              option
                .setName('usuario')
                .setDescription('Ver badges de outro usuário')
                .setRequired(false),
            ),
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
                  { name: `${HAWK_EMOJIS.GAMING.GAME} PUBG`, value: 'pubg' },
                  { name: `${HAWK_EMOJIS.SOCIAL.CHAT} Social`, value: 'social' },
                  { name: `${HAWK_EMOJIS.GAMING.CONTROLLER} Gaming`, value: 'gaming' },
                  { name: `${HAWK_EMOJIS.TIME.CALENDAR} Participação`, value: 'participation' },
                  { name: `${HAWK_EMOJIS.TROPHY} Conquistas`, value: 'achievement' },
                  { name: `${HAWK_EMOJIS.SYSTEM.STAR} Especiais`, value: 'special' },
                ),
            )
            .addStringOption(option =>
              option
                .setName('raridade')
                .setDescription('Filtrar por raridade')
                .setRequired(false)
                .addChoices(
                  { name: `${HAWK_EMOJIS.BADGES.RARITY_COMMON} Comum`, value: 'common' },
                  { name: `${HAWK_EMOJIS.BADGES.RARITY_UNCOMMON} Incomum`, value: 'uncommon' },
                  { name: `${HAWK_EMOJIS.BADGES.RARITY_RARE} Raro`, value: 'rare' },
                  { name: `${HAWK_EMOJIS.BADGES.RARITY_EPIC} Épico`, value: 'epic' },
                  { name: `${HAWK_EMOJIS.BADGES.RARITY_LEGENDARY} Lendário`, value: 'legendary' },
                  { name: `${HAWK_EMOJIS.BADGES.RARITY_MYTHIC} Mítico`, value: 'mythic' },
                ),
            ),
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
                .setAutocomplete(true),
            ),
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
                .setMaxValue(25),
            ),
        ),
      category: CommandCategory.BADGES,
      cooldown: 5,
    });
  }

  /**
   * Handle "minhas" subcommand - Show user's badges
   */
  private async handleMyBadges(
    interaction: ChatInputCommandInteraction,
    badgeService: BadgeService,
    database: DatabaseService,
  ) {
    const targetUser = interaction.options.getUser('usuario') || interaction.user;
    const userId = targetUser.id;
    const isOwnProfile = targetUser.id === interaction.user.id;

    await this.deferWithLoading(interaction);

    try {
      // Get user badges from database
      const userBadges = await database.client.userBadge.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { earnedAt: 'desc' },
      });

      if (userBadges.length === 0) {
        const embed = HawkEmbedBuilder.createWarningEmbed(
          `${HAWK_EMOJIS.BADGES.BADGE} Nenhuma Badge Encontrada`,
          `${isOwnProfile ? 'Você ainda não conquistou' : `${targetUser.username} ainda não conquistou`} nenhuma badge.\n\n${HAWK_EMOJIS.SYSTEM.INFO} Use \`/badges disponiveis\` para ver as badges disponíveis!`,
        )
          .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
          .setFooter({
            text: `${isOwnProfile ? 'Seu perfil' : `Perfil de ${targetUser.username}`} • Hawk Esports`,
            iconURL: interaction.client.user?.displayAvatarURL(),
          });

        const components = HawkComponentFactory.createActionButtons([
          {
            id: 'view_available_badges',
            label: 'Ver Badges Disponíveis',
            emoji: '📋',
            style: ButtonStyle.Primary,
          },
          {
            id: 'badge_progress',
            label: 'Meu Progresso',
            emoji: '📊',
            style: ButtonStyle.Secondary,
          },
        ]);

        await interaction.editReply({ embeds: [embed], components: [components] });
        return;
      }

      // Group badges by category and rarity
      const badgesByCategory: Record<string, any[]> = {};
      const rarityCount: Record<string, number> = {};

      for (const userBadge of userBadges) {
        const badge = userBadge.badge;
        if (!badgesByCategory[badge.category]) {
          badgesByCategory[badge.category] = [];
        }
        badgesByCategory[badge.category]!.push({ ...badge, earnedAt: userBadge.earnedAt });
        rarityCount[badge.rarity] = (rarityCount[badge.rarity] || 0) + 1;
      }

      // Create main embed with enhanced styling
      const embed = HawkEmbedBuilder.createSuccessEmbed(
        `${HAWK_EMOJIS.BADGES.COLLECTION} ${isOwnProfile ? 'Suas Badges' : `Badges de ${targetUser.username}`}`,
        `${HAWK_EMOJIS.BADGES.TOTAL} Total: **${userBadges.length}** ${userBadges.length === 1 ? 'badge conquistada' : 'badges conquistadas'}`,
      )
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setFooter({
          text: `${isOwnProfile ? 'Seu perfil' : `Perfil de ${targetUser.username}`} • Hawk Esports`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        });

      // Add rarity distribution
      if (Object.keys(rarityCount).length > 1) {
        const rarityText = Object.entries(rarityCount)
          .sort(([, a], [, b]) => b - a)
          .map(([rarity, count]) => `${this.getRarityEmoji(rarity)} ${count}`)
          .join(' • ');

        embed.addFields({
          name: `${HAWK_EMOJIS.BADGES.RARITY} Distribuição por Raridade`,
          value: rarityText,
          inline: false,
        });
      }

      const categoryNames: Record<string, string> = {
        pubg: `${HAWK_EMOJIS.PUBG} PUBG`,
        social: `${HAWK_EMOJIS.SOCIAL.CHAT} Social`,
        gaming: `${HAWK_EMOJIS.GAMING.CONTROLLER} Gaming`,
        participation: `${HAWK_EMOJIS.EVENTS.PARTICIPATION} Participação`,
        achievement: `${HAWK_EMOJIS.BADGES.ACHIEVEMENT} Conquistas`,
        special: `${HAWK_EMOJIS.BADGES.SPECIAL} Especiais`,
      };

      for (const [category, badges] of Object.entries(badgesByCategory)) {
        const categoryName = categoryNames[category] || category;
        const badgeList = badges
          .slice(0, 5) // Limit for mobile compatibility
          .map(badge => {
            const rarityEmoji = this.getRarityEmoji(badge.rarity);
            const earnedDate = new Date(badge.earnedAt).toLocaleDateString('pt-BR');
            return `${badge.icon} **${badge.name}** ${rarityEmoji}\n${HAWK_EMOJIS.TIME.CALENDAR} *${earnedDate}*`;
          })
          .join('\n\n');

        const moreCount = badges.length > 5 ? badges.length - 5 : 0;
        const fieldValue =
          badgeList +
          (moreCount > 0 ? `\n\n${HAWK_EMOJIS.SYSTEM.MORE} +${moreCount} badges...` : '');

        embed.addFields({
          name: `${categoryName} (${badges.length})`,
          value: fieldValue.length > 1024 ? fieldValue.substring(0, 1021) + '...' : fieldValue,
          inline: false,
        });
      }

      // Create action buttons
      const actionButtons = [
        {
          id: 'badge_progress',
          label: 'Ver Progresso',
          emoji: '📊',
          style: ButtonStyle.Primary,
        },
        {
          id: 'available_badges',
          label: 'Ver Disponíveis',
          emoji: '📋',
          style: ButtonStyle.Secondary,
        },
        {
          id: 'badge_ranking',
          label: 'Ranking',
          emoji: '🏆',
          style: ButtonStyle.Secondary,
        },
      ];

      const components = HawkComponentFactory.createActionButtons(actionButtons);

      await interaction.editReply({ embeds: [embed], components: [components] });
    } catch (error) {
      this.logger.error('Error fetching user badges:', error);
      throw error;
    }
  }

  /**
   * Handle "disponiveis" subcommand - Show available badges
   */
  private async handleAvailableBadges(
    interaction: ChatInputCommandInteraction,
    badgeService: BadgeService,
  ) {
    const category = interaction.options.getString('categoria');
    const rarity = interaction.options.getString('raridade');

    await this.deferWithLoading(interaction);

    try {
      let availableBadges = badgeService.getAvailableBadges(false);

      // Apply filters
      if (category) {
        availableBadges = availableBadges.filter(badge => badge.category === category);
      }

      if (rarity) {
        availableBadges = availableBadges.filter(badge => badge.rarity === rarity);
      }

      // Create filter description
      const filterText = [];
      if (category) {
        const categoryNames: Record<string, string> = {
          pubg: `${HAWK_EMOJIS.PUBG} PUBG`,
          social: `${HAWK_EMOJIS.SOCIAL.CHAT} Social`,
          gaming: `${HAWK_EMOJIS.GAMING.CONTROLLER} Gaming`,
          participation: `${HAWK_EMOJIS.EVENTS.PARTICIPATION} Participação`,
          achievement: `${HAWK_EMOJIS.BADGES.ACHIEVEMENT} Conquistas`,
          special: `${HAWK_EMOJIS.BADGES.SPECIAL} Especiais`,
        };
        filterText.push(`Categoria: ${categoryNames[category] || category}`);
      }
      if (rarity) {
        filterText.push(`Raridade: ${this.getRarityEmoji(rarity)}`);
      }

      if (availableBadges.length === 0) {
        const embed = HawkEmbedBuilder.createWarningEmbed(
          `${HAWK_EMOJIS.BADGES.AVAILABLE} Nenhuma Badge Encontrada`,
          `Nenhuma badge encontrada com os filtros aplicados.\n\n${HAWK_EMOJIS.SYSTEM.INFO} Tente remover alguns filtros ou use \`/badges disponiveis\` sem filtros.`,
        ).setFooter({
          text: `Filtros: ${filterText.join(' • ') || 'Nenhum'} • Hawk Esports`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        });

        const components = HawkComponentFactory.createActionButtons([
          {
            id: 'view_all_badges',
            label: 'Ver Todas',
            emoji: '📋',
            style: ButtonStyle.Primary,
          },
          {
            id: 'my_badges',
            label: 'Minhas Badges',
            emoji: '🗂️',
            style: ButtonStyle.Secondary,
          },
        ]);

        await interaction.editReply({ embeds: [embed], components: [components] });
        return;
      }

      // Group by category and count by rarity
      const badgesByCategory: Record<string, any[]> = {};
      const rarityCount: Record<string, number> = {};

      for (const badge of availableBadges) {
        if (!badgesByCategory[badge.category]) {
          badgesByCategory[badge.category] = [];
        }
        badgesByCategory[badge.category]!.push(badge);
        rarityCount[badge.rarity] = (rarityCount[badge.rarity] || 0) + 1;
      }

      // Create main embed with Hawk styling
      const embed = HawkEmbedBuilder.createInfoEmbed(
        `${HAWK_EMOJIS.BADGES.AVAILABLE} Badges Disponíveis`,
        `${HAWK_EMOJIS.BADGES.TOTAL} Total: **${availableBadges.length}** badges disponíveis${filterText.length > 0 ? `\n${HAWK_EMOJIS.SYSTEM.FILTER} Filtros: ${filterText.join(' • ')}` : ''}`,
      ).setFooter({
        text: 'Catálogo de Badges • Hawk Esports',
        iconURL: interaction.client.user?.displayAvatarURL(),
      });

      // Add rarity distribution if no rarity filter is applied
      if (!rarity && Object.keys(rarityCount).length > 1) {
        const rarityText = Object.entries(rarityCount)
          .sort(([, a], [, b]) => b - a)
          .map(([rarityType, count]) => `${this.getRarityEmoji(rarityType)} ${count}`)
          .join(' • ');

        embed.addFields({
          name: `${HAWK_EMOJIS.BADGES.RARITY} Distribuição por Raridade`,
          value: rarityText,
          inline: false,
        });
      }

      const categoryNames: Record<string, string> = {
        pubg: `${HAWK_EMOJIS.PUBG} PUBG`,
        social: `${HAWK_EMOJIS.SOCIAL.CHAT} Social`,
        gaming: `${HAWK_EMOJIS.GAMING.CONTROLLER} Gaming`,
        participation: `${HAWK_EMOJIS.EVENTS.PARTICIPATION} Participação`,
        achievement: `${HAWK_EMOJIS.BADGES.ACHIEVEMENT} Conquistas`,
        special: `${HAWK_EMOJIS.BADGES.SPECIAL} Especiais`,
      };

      for (const [cat, badges] of Object.entries(badgesByCategory)) {
        const categoryName = categoryNames[cat] || cat;
        const badgeList = badges
          .slice(0, 6) // Limit for mobile compatibility
          .map(badge => {
            const rarityEmoji = this.getRarityEmoji(badge.rarity);
            const rewards = [];
            if (badge.rewards?.xp) {
              rewards.push(`${HAWK_EMOJIS.SYSTEM.XP} ${badge.rewards.xp} XP`);
            }
            if (badge.rewards?.coins) {
              rewards.push(`${HAWK_EMOJIS.ECONOMY.COINS} ${badge.rewards.coins}`);
            }
            const rewardText =
              rewards.length > 0 ? `\n${HAWK_EMOJIS.SYSTEM.REWARD} ${rewards.join(' • ')}` : '';

            return `${badge.icon} **${badge.name}** ${rarityEmoji}\n${HAWK_EMOJIS.SYSTEM.INFO} *${badge.description}*${rewardText}`;
          })
          .join('\n\n');

        const moreCount = badges.length > 6 ? badges.length - 6 : 0;
        const fieldValue =
          badgeList +
          (moreCount > 0 ? `\n\n${HAWK_EMOJIS.SYSTEM.MORE} +${moreCount} badges...` : '');

        embed.addFields({
          name: `${categoryName} (${badges.length})`,
          value: fieldValue.length > 1024 ? fieldValue.substring(0, 1021) + '...' : fieldValue,
          inline: false,
        });
      }

      // Add filter and navigation components
      const filterMenu = HawkComponentFactory.createCategoryMenu(
        [
          {
            value: 'all',
            label: 'Todas as Categorias',
            description: 'Todas as categorias',
            emoji: '📋',
          },
          { value: 'pubg', label: 'PUBG', description: 'Badges do PUBG', emoji: '🎮' },
          { value: 'social', label: 'Social', description: 'Badges sociais', emoji: '💬' },
          { value: 'gaming', label: 'Gaming', description: 'Badges de jogos', emoji: '🎮' },
          {
            value: 'participation',
            label: 'Participação',
            description: 'Badges de participação',
            emoji: '🎉',
          },
          {
            value: 'achievement',
            label: 'Conquistas',
            description: 'Badges de conquistas',
            emoji: '🎖️',
          },
          { value: 'special', label: 'Especiais', description: 'Badges especiais', emoji: '✨' },
        ],
        'badge_category_filter',
      );

      const actionButtons = HawkComponentFactory.createActionButtons([
        {
          id: 'my_badges',
          label: 'Minhas Badges',
          emoji: '🗂️',
          style: ButtonStyle.Primary,
        },
        {
          id: 'badge_progress',
          label: 'Meu Progresso',
          emoji: '📊',
          style: ButtonStyle.Secondary,
        },
      ]);

      await interaction.editReply({
        embeds: [embed],
        components: [filterMenu, actionButtons],
      });
    } catch (error) {
      this.logger.error('Error fetching available badges:', error);
      throw error;
    }
  }

  /**
   * Handle "progresso" subcommand - Show badge progress
   */
  private async handleBadgeProgress(
    interaction: ChatInputCommandInteraction,
    badgeService: BadgeService,
    database: DatabaseService,
  ) {
    const badgeId = interaction.options.getString('badge', true);
    const userId = interaction.user.id;

    await this.deferWithLoading(interaction);

    try {
      const badge = badgeService.getBadge(badgeId);
      if (!badge) {
        const embed = HawkEmbedBuilder.createErrorEmbed(
          `${HAWK_EMOJIS.SYSTEM.ERROR} Badge Não Encontrada`,
          `A badge especificada não foi encontrada.\n\n${HAWK_EMOJIS.SYSTEM.INFO} Use \`/badges disponiveis\` para ver todas as badges disponíveis.`,
        ).setFooter({
          text: `Badge ID: ${badgeId} • Hawk Esports`,
          iconURL: interaction.client.user?.displayAvatarURL(),
        });

        const components = HawkComponentFactory.createActionButtons([
          {
            id: 'view_available_badges',
            label: 'Ver Disponíveis',
            emoji: '📋',
            style: ButtonStyle.Primary,
          },
        ]);

        await interaction.editReply({ embeds: [embed], components: [components] });
        return;
      }

      // Check if user already has the badge
      const hasBadge = await database.badges.hasUserBadge(userId, badgeId);

      // Create main embed with appropriate styling based on status
      const embed = hasBadge
        ? HawkEmbedBuilder.createSuccessEmbed(
            `${badge.icon} ${badge.name}`,
            `${HAWK_EMOJIS.BADGES.COMPLETED} **Badge Conquistada!**\n\n${badge.description}`,
          )
        : HawkEmbedBuilder.createProgressEmbed(
            `${badge.icon} ${badge.name}`,
            0,
            1,
            `${HAWK_EMOJIS.SYSTEM.PROGRESS} **Em Progresso**\n\n${badge.description}`,
          );

      // Get category name with emoji
      const categoryNames: Record<string, string> = {
        pubg: `${HAWK_EMOJIS.PUBG} PUBG`,
        social: `${HAWK_EMOJIS.SOCIAL.CHAT} Social`,
        gaming: `${HAWK_EMOJIS.GAMING.CONTROLLER} Gaming`,
        participation: `${HAWK_EMOJIS.EVENTS.PARTICIPATION} Participação`,
        achievement: `${HAWK_EMOJIS.BADGES.ACHIEVEMENT} Conquistas`,
        special: `${HAWK_EMOJIS.BADGES.SPECIAL} Especiais`,
      };

      const categoryDisplay = categoryNames[badge.category] || badge.category;
      const rarityDisplay = `${this.getRarityEmoji(badge.rarity)} ${badge.rarity.charAt(0).toUpperCase() + badge.rarity.slice(1)}`;
      const statusDisplay = hasBadge
        ? `${HAWK_EMOJIS.BADGES.COMPLETED} Conquistada!`
        : `${HAWK_EMOJIS.SYSTEM.PROGRESS} Em progresso`;

      embed.addFields(
        {
          name: `${HAWK_EMOJIS.SYSTEM.CATEGORY} Categoria`,
          value: categoryDisplay,
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.BADGES.RARITY} Raridade`,
          value: rarityDisplay,
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.SYSTEM.STATUS} Status`,
          value: statusDisplay,
          inline: true,
        },
      );

      // Add requirements with progress tracking
      if (badge.requirements && badge.requirements.length > 0) {
        const requirementText = badge.requirements
          .map(req => {
            const operator = this.getOperatorText(req.operator);
            const reqType = this.getRequirementTypeText(req.type);
            const progressIcon = hasBadge
              ? HAWK_EMOJIS.SYSTEM.SUCCESS
              : HAWK_EMOJIS.SYSTEM.PROGRESS;
            return `${progressIcon} ${reqType} ${operator} ${req.value}`;
          })
          .join('\n');

        embed.addFields({
          name: `${HAWK_EMOJIS.SYSTEM.REQUIREMENTS} Requisitos`,
          value: requirementText,
          inline: false,
        });
      }

      // Add rewards with enhanced display
      if (badge.rewards) {
        const rewards = [];
        if (badge.rewards.xp) {
          rewards.push(`${HAWK_EMOJIS.SYSTEM.XP} ${badge.rewards.xp} XP`);
        }
        if (badge.rewards.coins) {
          rewards.push(`${HAWK_EMOJIS.ECONOMY.COINS} ${badge.rewards.coins} moedas`);
        }
        if (badge.rewards.role) {
          rewards.push(`${HAWK_EMOJIS.SYSTEM.ROLE} Cargo: ${badge.rewards.role}`);
        }

        if (rewards.length > 0) {
          const rewardStatus = hasBadge ? 'Recompensas Recebidas' : 'Recompensas Disponíveis';
          embed.addFields({
            name: `${HAWK_EMOJIS.SYSTEM.REWARD} ${rewardStatus}`,
            value: rewards.join('\n'),
            inline: false,
          });
        }
      }

      // Add completion date if badge is earned
      if (hasBadge) {
        embed.setFooter({
          text: 'Badge conquistada • Hawk Esports',
          iconURL: interaction.client.user?.displayAvatarURL(),
        });
      } else {
        embed.setFooter({
          text: 'Continue progredindo para conquistar esta badge • Hawk Esports',
          iconURL: interaction.client.user?.displayAvatarURL(),
        });
      }

      // Create action buttons
      const actionButtons = [];

      if (!hasBadge) {
        actionButtons.push({
          id: 'badge_tips',
          label: 'Dicas',
          emoji: 'ℹ️',
          style: ButtonStyle.Secondary,
        });
      }

      actionButtons.push(
        {
          id: 'my_badges',
          label: 'Minhas Badges',
          emoji: '🗂️',
          style: ButtonStyle.Primary,
        },
        {
          id: 'available_badges',
          label: 'Ver Outras',
          emoji: '📋',
          style: ButtonStyle.Secondary,
        },
      );

      const components = HawkComponentFactory.createActionButtons(actionButtons);

      await interaction.editReply({ embeds: [embed], components: [components] });
    } catch (error) {
      this.logger.error('Error fetching badge progress:', error);
      throw error;
    }
  }

  /**
   * Handle "ranking" subcommand - Show badge leaderboard
   */
  private async handleBadgeRanking(
    interaction: ChatInputCommandInteraction,
    badgeService: BadgeService,
    client: ExtendedClient,
  ) {
    const limit = interaction.options.getInteger('limite') || 10;

    await this.deferWithLoading(interaction);

    try {
      const leaderboard = badgeService.getBadgeLeaderboard(limit);

      if (leaderboard.length === 0) {
        const embed = HawkEmbedBuilder.createWarningEmbed(
          `${HAWK_EMOJIS.TROPHY} Ranking Vazio`,
          `Nenhum usuário com badges encontrado ainda.\n\n${HAWK_EMOJIS.SYSTEM.INFO} Seja o primeiro a conquistar badges e aparecer no ranking!`,
        ).setFooter({
          text: 'Ranking de Badges • Hawk Esports',
          iconURL: interaction.client.user?.displayAvatarURL(),
        });

        const components = HawkComponentFactory.createActionButtons([
          {
            id: 'view_available_badges',
            label: 'Ver Badges',
            emoji: '📋',
            style: ButtonStyle.Primary,
          },
          {
            id: 'my_badges',
            label: 'Minhas Badges',
            emoji: '🗂️',
            style: ButtonStyle.Secondary,
          },
        ]);

        await interaction.editReply({ embeds: [embed], components: [components] });
        return;
      }

      // Create main ranking embed with Hawk styling
      const embed = HawkEmbedBuilder.createRankingEmbed(
        `${HAWK_EMOJIS.TROPHY} Ranking de Badges`,
        `${HAWK_EMOJIS.BADGES.TOTAL} Top **${limit}** usuários com mais badges conquistadas`,
      ).setFooter({
        text: 'Atualizado • Hawk Esports',
        iconURL: interaction.client.user?.displayAvatarURL(),
      });

      // Process leaderboard with enhanced display
      const rankingText = await Promise.all(
        leaderboard.slice(0, Math.min(limit, 15)).map(async (entry, index) => {
          try {
            const user = await client.users.fetch(entry.userId);
            const position = index + 1;

            // Enhanced medal system
            let positionDisplay;
            if (position === 1) {
              positionDisplay = `${HAWK_EMOJIS.FIRST_PLACE} **1º**`;
            } else if (position === 2) {
              positionDisplay = `${HAWK_EMOJIS.SECOND_PLACE} **2º**`;
            } else if (position === 3) {
              positionDisplay = `${HAWK_EMOJIS.THIRD_PLACE} **3º**`;
            } else if (position <= 10) {
              positionDisplay = `${HAWK_EMOJIS.MEDAL} **${position}º**`;
            } else {
              positionDisplay = `${HAWK_EMOJIS.STAR} **${position}º**`;
            }

            const badgeText = entry.badgeCount === 1 ? 'badge' : 'badges';
            const username =
              user.username.length > 20 ? user.username.substring(0, 17) + '...' : user.username;

            return `${positionDisplay} ${username}\n${HAWK_EMOJIS.BADGES.COLLECTION} ${entry.badgeCount} ${badgeText}`;
          } catch {
            const position = index + 1;
            const positionDisplay =
              position <= 3
                ? ['🥇', '🥈', '🥉'][position - 1]
                : `${HAWK_EMOJIS.STAR} **${position}º**`;
            const badgeText = entry.badgeCount === 1 ? 'badge' : 'badges';

            return `${positionDisplay} *Usuário Desconhecido*\n${HAWK_EMOJIS.BADGES.COLLECTION} ${entry.badgeCount} ${badgeText}`;
          }
        }),
      );

      // Split ranking into chunks for better mobile display
      const chunkSize = 5;
      const chunks = [];
      for (let i = 0; i < rankingText.length; i += chunkSize) {
        chunks.push(rankingText.slice(i, i + chunkSize));
      }

      chunks.forEach((chunk, index) => {
        const startPos = index * chunkSize + 1;
        const endPos = Math.min(startPos + chunkSize - 1, rankingText.length);
        const fieldName =
          index === 0
            ? `${HAWK_EMOJIS.TROPHY} Ranking (${startPos}-${endPos})`
            : `${HAWK_EMOJIS.SYSTEM.CONTINUE} Posições ${startPos}-${endPos}`;

        embed.addFields({
          name: fieldName,
          value: chunk.join('\n\n'),
          inline: false,
        });
      });

      // Add statistics if available
      if (leaderboard.length > 0) {
        const totalBadges = leaderboard.reduce((sum, entry) => sum + entry.badgeCount, 0);
        const avgBadges = (totalBadges / leaderboard.length).toFixed(1);
        const topUser = leaderboard[0];

        embed.addFields({
          name: `${HAWK_EMOJIS.SYSTEM.STATS} Estatísticas`,
          value: `${HAWK_EMOJIS.BADGES.TOTAL} Total de badges: **${totalBadges}**\n${HAWK_EMOJIS.SYSTEM.AVERAGE} Média por usuário: **${avgBadges}**\n${HAWK_EMOJIS.CROWN} Líder: **${topUser.badgeCount}** badges`,
          inline: false,
        });
      }

      // Create navigation and action buttons
      const actionButtons = [
        {
          id: 'my_position',
          label: 'Minha Posição',
          emoji: '👤',
          style: ButtonStyle.Primary,
        },
        {
          id: 'my_badges',
          label: 'Minhas Badges',
          emoji: '🗂️',
          style: ButtonStyle.Secondary,
        },
        {
          id: 'available_badges',
          label: 'Ver Disponíveis',
          emoji: '📋',
          style: ButtonStyle.Secondary,
        },
      ];

      const components = HawkComponentFactory.createActionButtons(actionButtons);

      await interaction.editReply({ embeds: [embed], components: [components] });
    } catch (error) {
      this.logger.error('Error fetching badge ranking:', error);
      throw error;
    }
  }

  /**
   * Get rarity emoji using Hawk standardized emojis
   */
  private getRarityEmoji(rarity: string): string {
    const rarityEmojis: Record<string, string> = {
      common: HAWK_EMOJIS.BADGES.RARITY_COMMON,
      uncommon: HAWK_EMOJIS.BADGES.RARITY_UNCOMMON,
      rare: HAWK_EMOJIS.BADGES.RARITY_RARE,
      epic: HAWK_EMOJIS.BADGES.RARITY_EPIC,
      legendary: HAWK_EMOJIS.BADGES.RARITY_LEGENDARY,
      mythic: HAWK_EMOJIS.BADGES.RARITY_MYTHIC,
    };
    return rarityEmojis[rarity] || HAWK_EMOJIS.BADGES.RARITY_COMMON;
  }

  /**
   * Get operator text
   */
  private getOperatorText(operator: string): string {
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
  private getRequirementTypeText(type: string): string {
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

  /**
   * Execute the badges command
   */
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    try {
      // Validate guild context
      try {
        this.validateGuildContext(interaction);
      } catch (error) {
        await this.sendGuildOnlyError(interaction);
        return;
      }

      // Validate client and interaction
      this.validateInteraction(interaction);
      this.validateClient(client);

      // Get services
      const badgeService = client.badgeService;
      const database = client.database;

      // Validate services
      this.validateService(badgeService, 'Badge');
      this.validateService(database, 'Database');

      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'minhas':
          await this.handleMyBadges(interaction, badgeService, database);
          break;
        case 'disponiveis':
          await this.handleAvailableBadges(interaction, badgeService);
          break;
        case 'progresso':
          await this.handleBadgeProgress(interaction, badgeService, database);
          break;
        case 'ranking':
          await this.handleBadgeRanking(interaction, badgeService, client);
          break;
        default:
          await this.safeReply(interaction, {
            content:
              '❌ Subcomando não reconhecido. Subcomandos disponíveis: minhas, disponiveis, progresso, ranking',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      this.logger.error('Error in badges command:', error);
      await this.safeReply(interaction, {
        content: '❌ Ocorreu um erro ao processar o comando de badges.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  /**
   * Handle autocomplete for badge selection
   */
  async autocomplete(interaction: any) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'badge') {
      // Note: client is not available in autocomplete context
      // For now, return empty array - this would need to be implemented differently
      return interaction.respond([]);
    }
  }
}

const commandInstance = new BadgesCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.BADGES,
  cooldown: 5,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
  autocomplete: (interaction: any) => commandInstance.autocomplete(interaction),
};

export default command;
