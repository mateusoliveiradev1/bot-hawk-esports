import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  ButtonStyle,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';
import { HawkComponentFactory } from '../../utils/hawk-component-factory';
import { HAWK_EMOJIS } from '../../constants/hawk-emojis';
import { DatabaseService } from '../../database/database.service';
import { PUBGService } from '../../services/pubg.service';
import { BadgeService } from '../../services/badge.service';
import { RankingService } from '../../services/ranking.service';
import { PresenceService } from '../../services/presence.service';
import { BaseCommand } from '../../utils/base-command.util';

const logger = new Logger();

class ProfileCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('👤 Mostra seu perfil completo com estatísticas e progresso')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Usuário para ver o perfil (deixe vazio para ver o seu)')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('public')
            .setDescription('Tornar a resposta pública (padrão: privado)')
            .setRequired(false)
        ) as SlashCommandBuilder,
      category: CommandCategory.GENERAL,
      cooldown: 10,
    });
  }

  async execute(interaction: any, client: ExtendedClient): Promise<void> {
    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const isPublic = interaction.options.getBoolean('public') || false;
      const isOwnProfile = targetUser.id === interaction.user.id;

      // Defer reply for better UX
      await interaction.deferReply({ ephemeral: !isPublic });

      // Initialize services
      const databaseService = new DatabaseService();
      const badgeService = new BadgeService(client, null, null);
      const pubgService = new PUBGService();
      const rankingService = new RankingService(client);
      const presenceService = new PresenceService(client);

      // Get user data from database
      const userData = await databaseService.users.findById(targetUser.id);
      if (!userData) {
        const errorEmbed = HawkEmbedBuilder.createError(
          'Usuário não encontrado',
          'Este usuário não está registrado no sistema.'
        );
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Get additional data
      const [userBadges, pubgStats, rankings, presenceData] = await Promise.all([
        badgeService.getUserBadges(targetUser.id),
        userData.pubgUsername
          ? pubgService.getPlayerByName(
              userData.pubgUsername,
              (userData.pubgPlatform as any) || 'steam'
            )
          : null,
        rankingService.getUserRank(interaction.guild?.id || '', targetUser.id, 'internal'),
        presenceService.getUserStats(interaction.guild?.id || '', targetUser.id),
      ]);

      // Create main profile embed
      const profileEmbed = await this.createProfileEmbed(
        targetUser,
        userData,
        userBadges,
        pubgStats,
        rankings,
        presenceData,
        isOwnProfile
      );

      // Create action buttons
      let buttonsRow;
      if (isOwnProfile) {
        buttonsRow = HawkComponentFactory.createButtonRow([
          HawkComponentFactory.createButton({
            customId: 'profile_badges',
            label: 'Meus Badges',
            style: ButtonStyle.Primary,
            emoji: HAWK_EMOJIS.BADGE,
          }),
          HawkComponentFactory.createButton({
            customId: 'profile_stats',
            label: 'Estatísticas PUBG',
            style: ButtonStyle.Secondary,
            emoji: HAWK_EMOJIS.PUBG,
            disabled: !userData.pubgUsername,
          }),
          HawkComponentFactory.createButton({
            customId: 'profile_achievements',
            label: 'Conquistas',
            style: ButtonStyle.Secondary,
            emoji: HAWK_EMOJIS.TROPHY,
          }),
          HawkComponentFactory.createLinkButton(
            'Dashboard',
            'https://your-dashboard-url.com/profile',
            HAWK_EMOJIS.WEB
          ),
        ]);
      } else {
        buttonsRow = HawkComponentFactory.createButtonRow([
          HawkComponentFactory.createButton({
            customId: 'profile_badges_other',
            label: 'Ver Badges',
            style: ButtonStyle.Primary,
            emoji: HAWK_EMOJIS.BADGE,
          }),
          HawkComponentFactory.createButton({
            customId: 'profile_compare',
            label: 'Comparar',
            style: ButtonStyle.Secondary,
            emoji: HAWK_EMOJIS.MONEY,
          }),
        ]);
      }

      const response = await interaction.editReply({
        embeds: [profileEmbed],
        components: [buttonsRow],
      });

      // Handle button interactions
      await this.handleButtonInteractions(
        response,
        interaction,
        targetUser,
        userData,
        userBadges,
        pubgStats
      );
    } catch (error) {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao carregar o perfil. Tente novamente mais tarde.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async createProfileEmbed(
    user: any,
    userData: any,
    badges: any[],
    pubgStats: any,
    rankings: any,
    presenceData: any,
    isOwnProfile: boolean
  ): Promise<EmbedBuilder> {
    const embed = HawkEmbedBuilder.createInfo(
      `${HAWK_EMOJIS.USER} Perfil de ${user.displayName}`,
      ''
    )
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();

    // Basic info
    const joinedDate = userData.createdAt
      ? `<t:${Math.floor(new Date(userData.createdAt).getTime() / 1000)}:D>`
      : 'Não disponível';
    const lastUpdate = userData.updatedAt
      ? `<t:${Math.floor(new Date(userData.updatedAt).getTime() / 1000)}:R>`
      : 'Nunca';

    embed.addFields({
      name: `${HAWK_EMOJIS.CALENDAR} Informações Básicas`,
      value: `${HAWK_EMOJIS.CALENDAR} **Registrado:** ${joinedDate}\n${HAWK_EMOJIS.REFRESH} **Última atualização:** ${lastUpdate}`,
      inline: false,
    });

    // Level and XP
    const level = userData.level || 1;
    const xp = userData.xp || 0;
    const xpForNext = this.calculateXPForNextLevel(level);
    const xpProgress = xp % 1000; // Assuming 1000 XP per level
    const progressBar = this.createProgressBar((xpProgress / 1000) * 100, 15);

    embed.addFields({
      name: `${HAWK_EMOJIS.LEVEL} Nível e Experiência`,
      value: `${HAWK_EMOJIS.STAR} **Nível:** ${level}\n${HAWK_EMOJIS.XP} **XP:** ${xp.toLocaleString()}\n${progressBar} ${xpProgress}/${1000}`,
      inline: true,
    });

    // PUBG Info
    if (userData.pubgUsername) {
      const pubgInfo = `${HAWK_EMOJIS.PUBG} **Username:** ${userData.pubgUsername}\n${HAWK_EMOJIS.DESKTOP} **Plataforma:** ${userData.pubgPlatform?.toUpperCase() || 'STEAM'}`;
      if (pubgStats?.currentSeason) {
        const season = pubgStats.currentSeason;
        embed.addFields({
          name: `${HAWK_EMOJIS.PUBG} PUBG`,
          value: `${pubgInfo}\n${HAWK_EMOJIS.CROWN} **Rank:** ${season.tier}\n${HAWK_EMOJIS.CHART} **RP:** ${season.rankPoints}`,
          inline: true,
        });
      } else {
        embed.addFields({
          name: `${HAWK_EMOJIS.PUBG} PUBG`,
          value: pubgInfo,
          inline: true,
        });
      }
    }

    // Economy
    const coins = userData.coins || 0;
    const tokens = userData.tokens || 0;
    embed.addFields({
      name: `${HAWK_EMOJIS.MONEY} Economia`,
      value: `${HAWK_EMOJIS.COIN} **Coins:** ${coins.toLocaleString()}\n${HAWK_EMOJIS.STAR} **Tokens:** ${tokens.toLocaleString()}`,
      inline: true,
    });

    // Badges preview
    if (badges && badges.length > 0) {
      const badgePreview = badges
        .slice(0, 5)
        .map(badge => badge.emoji)
        .join(' ');
      const moreText = badges.length > 5 ? ` +${badges.length - 5}` : '';
      embed.addFields({
        name: `${HAWK_EMOJIS.BADGE} Badges (${badges.length})`,
        value: `${badgePreview}${moreText}`,
        inline: false,
      });
    }

    // Rankings preview
    if (rankings && Object.keys(rankings).length > 0) {
      const rankingText = Object.entries(rankings)
        .slice(0, 3)
        .map(
          ([type, rank]: [string, any]) =>
            `${this.getRankingEmoji(type)} **${this.getRankingName(type)}:** #${rank.position}`
        )
        .join('\n');
      embed.addFields({
        name: `${HAWK_EMOJIS.TROPHY} Rankings`,
        value: rankingText,
        inline: false,
      });
    }

    // Activity stats
    const stats = userData.stats || {};
    embed.addFields({
      name: `${HAWK_EMOJIS.CHART} Atividade`,
      value: `${HAWK_EMOJIS.MESSAGE} **Mensagens:** ${(stats.messagesCount || 0).toLocaleString()}\n${HAWK_EMOJIS.FAST} **Comandos:** ${(stats.commandsUsed || 0).toLocaleString()}\n${HAWK_EMOJIS.GAMING.CONTROLLER} **Jogos:** ${(stats.gamesPlayed || 0).toLocaleString()}`,
      inline: true,
    });

    return embed;
  }

  private async handleButtonInteractions(
    response: any,
    interaction: any,
    targetUser: any,
    userData: any,
    userBadges: any[],
    pubgStats: any
  ): Promise<void> {
    const collector = response.createMessageComponentCollector({
      time: 300000, // 5 minutes
    });

    collector.on('collect', async (i: any) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: `${HAWK_EMOJIS.ERROR} Apenas quem executou o comando pode usar estes botões.`,
          ephemeral: true,
        });
        return;
      }

      switch (i.customId) {
        case 'profile_badges':
        case 'profile_badges_other':
          const badgesEmbed = await this.createBadgesEmbed(targetUser, userBadges);
          await i.reply({ embeds: [badgesEmbed], flags: MessageFlags.Ephemeral });
          break;

        case 'profile_stats':
          if (pubgStats) {
            const statsEmbed = await this.createPUBGStatsEmbed(targetUser, pubgStats, userData);
            await i.reply({ embeds: [statsEmbed], flags: MessageFlags.Ephemeral });
          }
          break;

        case 'profile_achievements':
          const achievementsEmbed = await this.createAchievementsEmbed(targetUser, userData);
          await i.reply({ embeds: [achievementsEmbed], flags: MessageFlags.Ephemeral });
          break;

        case 'profile_compare':
          const compareEmbed = new EmbedBuilder()
            .setTitle('⚖️ Comparação de Perfis')
            .setDescription(
              'Funcionalidade em desenvolvimento!\nEm breve você poderá comparar estatísticas entre jogadores.'
            )
            .setColor('#FFA500');
          await i.reply({ embeds: [compareEmbed], flags: MessageFlags.Ephemeral });
          break;
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }

  private async createBadgesEmbed(user: any, badges: any[]): Promise<EmbedBuilder> {
    if (badges.length === 0) {
      return HawkEmbedBuilder.createWarning(
        `${HAWK_EMOJIS.BADGE} Badges de ${user.displayName}`,
        'Este usuário ainda não possui badges.\n\nParticipe das atividades do servidor para conquistar badges!'
      ).setThumbnail(user.displayAvatarURL());
    }

    const embed = HawkEmbedBuilder.createSuccess(
      `${HAWK_EMOJIS.BADGE} Badges de ${user.displayName}`,
      ''
    ).setThumbnail(user.displayAvatarURL());

    // Group badges by category
    const categories: { [key: string]: any[] } = {};
    badges.forEach(badge => {
      const category = badge.category || 'Outras';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(badge);
    });

    // Add fields for each category
    Object.entries(categories).forEach(([category, categoryBadges]) => {
      const badgeList = categoryBadges
        .map(badge => `${badge.emoji} **${badge.name}**\n${badge.description}`)
        .join('\n\n');

      embed.addFields({
        name: `${this.getCategoryEmoji(category)} ${category} (${categoryBadges.length})`,
        value: badgeList,
        inline: false,
      });
    });

    embed.setFooter({
      text: `${HAWK_EMOJIS.SYSTEM.COUNT} Total: ${badges.length} badges conquistadas`,
    });

    return embed;
  }

  private async createPUBGStatsEmbed(user: any, stats: any, userData: any): Promise<EmbedBuilder> {
    const embed = HawkEmbedBuilder.createInfo(
      `${HAWK_EMOJIS.PUBG} Estatísticas PUBG - ${user.displayName}`,
      ''
    ).setThumbnail(user.displayAvatarURL());

    // Current season stats
    if (stats.currentSeason) {
      const season = stats.currentSeason;
      embed.addFields(
        {
          name: `${HAWK_EMOJIS.TROPHY} Temporada Atual`,
          value: `**${season.seasonId}**\n${HAWK_EMOJIS.CROWN} Rank: ${season.tier}\n${HAWK_EMOJIS.CHART} RP: ${season.rankPoints}`,
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.GAMING.TARGET} Partidas`,
          value: `${HAWK_EMOJIS.PUBG} Jogadas: ${season.roundsPlayed}\n${HAWK_EMOJIS.TROPHY} Vitórias: ${season.wins}\n${HAWK_EMOJIS.CHART} Top 10: ${season.top10s}`,
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.WEAPON} Combate`,
          value: `${HAWK_EMOJIS.KILL} Kills: ${season.kills}\n${HAWK_EMOJIS.DAMAGE} Dano: ${Math.round(season.damageDealt)}\n${HAWK_EMOJIS.GAMING.TARGET} K/D: ${season.kdr?.toFixed(2)}`,
          inline: true,
        }
      );
    }

    // Lifetime stats
    if (stats.lifetime) {
      const lifetime = stats.lifetime;
      embed.addFields(
        {
          name: `${HAWK_EMOJIS.CHART} Estatísticas Gerais`,
          value: `${HAWK_EMOJIS.PUBG} Partidas: ${lifetime.roundsPlayed}\n${HAWK_EMOJIS.TROPHY} Vitórias: ${lifetime.wins}\n${HAWK_EMOJIS.KILL} Kills: ${lifetime.kills}`,
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.BADGES.PERFORMANCE} Performance`,
          value: `${HAWK_EMOJIS.GAMING.TARGET} K/D: ${lifetime.kdr?.toFixed(2)}\n${HAWK_EMOJIS.GAMING.TARGET} Dano Médio: ${Math.round(lifetime.avgDamage)}\n${HAWK_EMOJIS.SYSTEM.CLOCK} Sobrevivência: ${Math.round(lifetime.avgSurvivalTime)}min`,
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.BADGES.ACHIEVEMENT} Conquistas`,
          value: `${HAWK_EMOJIS.TROPHY} Chicken Dinners: ${lifetime.wins}\n${HAWK_EMOJIS.CHART} Top 10: ${lifetime.top10s}\n${HAWK_EMOJIS.GAMING.TARGET} Headshots: ${lifetime.headshotKills}`,
          inline: true,
        }
      );
    }

    // Recent matches
    if (stats.recentMatches && stats.recentMatches.length > 0) {
      const recentMatch = stats.recentMatches[0];
      embed.addFields({
        name: '🕐 Última Partida',
        value: `🗺️ ${recentMatch.mapName}\n🏆 #${recentMatch.winPlace}\n💀 ${recentMatch.kills} kills\n💥 ${Math.round(recentMatch.damageDealt)} dano`,
        inline: false,
      });
    }

    embed.setFooter({
      text: `PUBG: ${userData.pubgUsername} • Plataforma: ${userData.pubgPlatform?.toUpperCase()}`,
    });

    return embed;
  }

  private async createAchievementsEmbed(user: any, userData: any): Promise<EmbedBuilder> {
    const embed = HawkEmbedBuilder.createInfo(
      `${HAWK_EMOJIS.ACHIEVEMENT} Conquistas de ${user.displayName}`,
      ''
    ).setThumbnail(user.displayAvatarURL());

    // Mock achievements data - replace with actual data from database
    const achievements = [
      {
        name: 'Primeiro Registro',
        description: 'Registrou-se no sistema',
        completed: true,
        date: userData.createdAt,
      },
      {
        name: 'Veterano',
        description: 'Membro há mais de 30 dias',
        completed:
          userData.createdAt &&
          Date.now() - new Date(userData.createdAt).getTime() > 30 * 24 * 60 * 60 * 1000,
      },
      {
        name: 'Ativo',
        description: 'Enviou mais de 100 mensagens',
        completed: (userData.stats?.messagesCount || 0) >= 100,
      },
      {
        name: 'Ativo no Chat',
        description: 'Usou mais de 50 comandos',
        completed: (userData.stats?.commandsUsed || 0) >= 50,
      },
      {
        name: 'Gamer',
        description: 'Jogou mais de 20 jogos',
        completed: (userData.stats?.gamesPlayed || 0) >= 20,
      },
      {
        name: 'Criador',
        description: 'Enviou mais de 5 clips',
        completed: (userData.stats?.clipsUploaded || 0) >= 5,
      },
    ];

    const completed = achievements.filter(a => a.completed);
    const pending = achievements.filter(a => !a.completed);

    if (completed.length > 0) {
      const completedList = completed
        .map(a => `${HAWK_EMOJIS.SUCCESS} **${a.name}**\n${a.description}`)
        .join('\n\n');
      embed.addFields({
        name: `${HAWK_EMOJIS.ACHIEVEMENT} Conquistadas (${completed.length})`,
        value: completedList,
        inline: false,
      });
    }

    if (pending.length > 0) {
      const pendingList = pending
        .map(a => `${HAWK_EMOJIS.CLOCK} **${a.name}**\n${a.description}`)
        .join('\n\n');
      embed.addFields({
        name: `${HAWK_EMOJIS.CLOCK} Em Progresso (${pending.length})`,
        value: pendingList,
        inline: false,
      });
    }

    const progressPercentage = Math.round((completed.length / achievements.length) * 100);
    const progressBar = this.createProgressBar(progressPercentage, 20);

    embed.addFields({
      name: `${HAWK_EMOJIS.PROGRESS} Progresso Geral`,
      value: `${progressBar} ${progressPercentage}%\n${completed.length}/${achievements.length} conquistas`,
      inline: false,
    });

    return embed;
  }

  private calculateXPForNextLevel(level: number): number {
    return level * 1000; // Simple calculation, adjust as needed
  }

  private createProgressBar(percentage: number, length: number = 20): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private getCategoryEmoji(category: string): string {
    const emojis: { [key: string]: string } = {
      PUBG: '🎮',
      Social: '👥',
      Gaming: '🎯',
      Participation: '🎪',
      Achievement: '🏆',
      Special: '⭐',
      Outras: '🏅',
    };

    return emojis[category] || '🏅';
  }

  private getRankingEmoji(type: string): string {
    const emojis: { [key: string]: string } = {
      pubg_daily: HAWK_EMOJIS.PUBG,
      pubg_weekly: HAWK_EMOJIS.PUBG,
      pubg_monthly: HAWK_EMOJIS.PUBG,
      internal_xp: HAWK_EMOJIS.XP,
      internal_coins: HAWK_EMOJIS.COIN,
      internal_badges: HAWK_EMOJIS.BADGE,
      presence: HAWK_EMOJIS.ONLINE,
      music: HAWK_EMOJIS.MUSIC,
      games: HAWK_EMOJIS.GAMING.CONTROLLER,
    };

    return emojis[type] || HAWK_EMOJIS.TROPHY;
  }

  private getRankingName(type: string): string {
    const names: { [key: string]: string } = {
      pubg_daily: 'PUBG Diário',
      pubg_weekly: 'PUBG Semanal',
      pubg_monthly: 'PUBG Mensal',
      internal_xp: 'XP',
      internal_coins: 'Coins',
      internal_badges: 'Badges',
      presence: 'Presença',
      music: 'Música',
      games: 'Jogos',
    };

    return names[type] || type;
  }
}

const commandInstance = new ProfileCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.GENERAL,
  cooldown: 10,
  execute: (interaction: any, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;
export { ProfileCommand };
