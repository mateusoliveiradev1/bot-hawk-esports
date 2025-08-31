import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { DatabaseService } from '../../database/database.service';
import { PUBGService } from '../../services/pubg.service';
import { BadgeService } from '../../services/badge.service';
import { RankingService } from '../../services/ranking.service';
import { PresenceService } from '../../services/presence.service';

/**
 * Profile command - Shows user profile with PUBG stats, badges, and progress
 */
const profile: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('👤 Mostra seu perfil completo com estatísticas e progresso')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Usuário para ver o perfil (deixe vazio para ver o seu)')
        .setRequired(false),
    )
    .addBooleanOption(option =>
      option
        .setName('public')
        .setDescription('Tornar a resposta pública (padrão: privado)')
        .setRequired(false),
    ) as SlashCommandBuilder,

  category: CommandCategory.GENERAL,
  cooldown: 10,

  async execute(interaction: any, client: ExtendedClient) {
    const logger = new Logger();
    const db = client.database;
    const pubgService = (client as any).pubgService;
    const xpService = (client as any).xpService;
    const badgeService = (client as any).badgeService;
    const rankingService = (client as any).rankingService;
    const presenceService = (client as any).presenceService;

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const isPublic = interaction.options.getBoolean('public') || false;
    const isOwnProfile = targetUser.id === interaction.user.id;

    try {
      await interaction.deferReply({ ephemeral: !isPublic });

      // Get user data from database
      const userData = await db.users.findById(targetUser.id);

      if (!userData) {
        const notFoundEmbed = new EmbedBuilder()
          .setTitle('❌ Usuário não encontrado')
          .setDescription(
            `${isOwnProfile ? 'Você ainda não está' : 'Este usuário não está'} registrado no sistema.\n\nUse \`/register\` para se cadastrar!`,
          )
          .setColor('#FF0000');

        await interaction.editReply({ embeds: [notFoundEmbed] });
        return;
      }

      // Get additional data
      const [pubgStats, userBadges, rankingData, presenceStats] = await Promise.all([
        userData?.pubgUsername
          ? pubgService.getPlayerStats(
              userData.pubgUsername,
              (userData.pubgPlatform as any) || 'steam',
            )
          : null,
        badgeService.getUserBadges(targetUser.id),
        rankingService.getUserRank(targetUser.id, 'weekly', 'pubg'),
        null, // presenceService.getUserStats not implemented yet
      ]);

      // Create main profile embed
      const profileEmbed = new EmbedBuilder()
        .setTitle(`👤 Perfil de ${targetUser.displayName}`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setColor('#0099FF')
        .setTimestamp();

      // Basic info
      const createdAt = userData.createdAt
        ? new Date(userData.createdAt).toLocaleDateString('pt-BR')
        : 'Desconhecido';
      const updatedAt = userData.updatedAt
        ? `<t:${Math.floor(new Date(userData.updatedAt).getTime() / 1000)}:R>`
        : 'Nunca';

      profileEmbed.addFields(
        { name: '📅 Membro desde', value: createdAt, inline: true },
        { name: '🔄 Última atualização', value: updatedAt, inline: true },
        { name: '🎯 Nível', value: `${userData.level} (${userData.xp} XP)`, inline: true },
      );

      // PUBG Info
      if (userData.pubgUsername) {
        const platformEmoji =
          userData.pubgPlatform === 'steam' ? '💻' : userData.pubgPlatform === 'xbox' ? '🎮' : '🎮';
        profileEmbed.addFields({
          name: '🎮 PUBG',
          value: `${platformEmoji} ${userData.pubgUsername}\n🏆 Sem rank disponível`,
          inline: true,
        });
      } else {
        profileEmbed.addFields({
          name: '🎮 PUBG',
          value: '❌ Não registrado\nUse `/register` para cadastrar',
          inline: true,
        });
      }

      // Economy
      profileEmbed.addFields({
        name: '💰 Economia',
        value: `🪙 ${userData.coins || 0} moedas`,
        inline: true,
      });

      // Badges preview (top 3)
      const topBadges = userBadges.slice(0, 3);
      if (topBadges.length > 0) {
        const badgeText = topBadges.map((badge: any) => `${badge.emoji} ${badge.name}`).join('\n');
        const totalBadges = userBadges.length;
        profileEmbed.addFields({
          name: `🏅 Badges (${totalBadges})`,
          value: `${badgeText}${totalBadges > 3 ? `\n... e mais ${totalBadges - 3}` : ''}`,
          inline: true,
        });
      } else {
        profileEmbed.addFields({
          name: '🏅 Badges (0)',
          value: 'Nenhuma badge conquistada',
          inline: true,
        });
      }

      // Rankings
      if (rankingData) {
        profileEmbed.addFields({
          name: '📊 Rankings',
          value: `🎮 PUBG: #${rankingData.rank}/${rankingData.total}\n⭐ Interno: #${rankingData.rank}/${rankingData.total}`,
          inline: true,
        });
      }

      // Presence stats not available yet
      profileEmbed.addFields({ name: '⏰ Presença', value: 'Dados não disponíveis', inline: true });

      // Activity stats
      const activityStats = [
        `🎵 ${userData.stats?.commandsUsed || 0} comandos usados`,
        `🎯 ${userData.stats?.gamesPlayed || 0} jogos jogados`,
        `🎬 ${userData.stats?.clipsUploaded || 0} clips enviados`,
        `💬 ${userData.stats?.messagesCount || 0} mensagens`,
      ].join('\n');

      profileEmbed.addFields({ name: '📈 Atividade', value: activityStats, inline: false });

      // Progress bar for next level
      const xpForNextLevel = (userData.level + 1) * 1000; // Simple formula
      const xpProgress = userData.xp % 1000;
      const progressPercentage = Math.floor((xpProgress / 1000) * 100);
      const progressBar = createProgressBar(progressPercentage, 20);

      profileEmbed.addFields({
        name: '📊 Progresso para o próximo nível',
        value: `${progressBar} ${progressPercentage}%\n${xpProgress}/1000 XP`,
        inline: false,
      });

      // Footer with additional info
      profileEmbed.setFooter({
        text: `ID: ${targetUser.id} • ${isOwnProfile ? 'Seu perfil' : `Perfil de ${targetUser.username}`}`,
        iconURL: client.user?.displayAvatarURL(),
      });

      // Create action buttons
      const buttonsRow = new ActionRowBuilder<ButtonBuilder>();

      if (isOwnProfile) {
        buttonsRow.addComponents(
          new ButtonBuilder()
            .setCustomId('profile_badges')
            .setLabel('Ver Badges')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🏅'),
          new ButtonBuilder()
            .setCustomId('profile_stats')
            .setLabel('Estatísticas PUBG')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎮')
            .setDisabled(!userData.pubgUsername),
          new ButtonBuilder()
            .setCustomId('profile_achievements')
            .setLabel('Conquistas')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏆'),
          new ButtonBuilder()
            .setLabel('Dashboard')
            .setStyle(ButtonStyle.Link)
            .setURL('https://your-dashboard-url.com/profile')
            .setEmoji('🌐'),
        );
      } else {
        buttonsRow.addComponents(
          new ButtonBuilder()
            .setCustomId('profile_badges')
            .setLabel('Ver Badges')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🏅'),
          new ButtonBuilder()
            .setCustomId('profile_compare')
            .setLabel('Comparar')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚖️'),
        );
      }

      const response = await interaction.editReply({
        embeds: [profileEmbed],
        components: [buttonsRow],
      });

      // Handle button interactions
      const collector = response.createMessageComponentCollector({
        time: 300000, // 5 minutes
      });

      collector.on('collect', async (i: any) => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({
            content: '❌ Apenas quem executou o comando pode usar estes botões.',
            ephemeral: true,
          });
          return;
        }

        switch (i.customId) {
          case 'profile_badges':
            const badgesEmbed = await createBadgesEmbed(targetUser, userBadges);
            await i.reply({ embeds: [badgesEmbed], flags: MessageFlags.Ephemeral });
            break;

          case 'profile_stats':
            if (pubgStats) {
              const statsEmbed = await createPUBGStatsEmbed(targetUser, pubgStats, userData);
              await i.reply({ embeds: [statsEmbed], flags: MessageFlags.Ephemeral });
            }
            break;

          case 'profile_achievements':
            const achievementsEmbed = await createAchievementsEmbed(targetUser, userData);
            await i.reply({ embeds: [achievementsEmbed], flags: MessageFlags.Ephemeral });
            break;

          case 'profile_compare':
            const compareEmbed = new EmbedBuilder()
              .setTitle('⚖️ Comparação de Perfis')
              .setDescription(
                'Funcionalidade em desenvolvimento!\nEm breve você poderá comparar estatísticas entre jogadores.',
              )
              .setColor('#FFA500');
            await i.reply({ embeds: [compareEmbed], flags: MessageFlags.Ephemeral });
            break;
        }
      });

      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
    } catch (error) {
      logger.error('Profile command error:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao carregar o perfil.')
        .setColor('#FF0000');

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  },
};

/**
 * Create badges embed
 */
async function createBadgesEmbed(user: any, badges: any[]): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle(`🏅 Badges de ${user.displayName}`)
    .setThumbnail(user.displayAvatarURL())
    .setColor('#FFD700')
    .setTimestamp();

  if (badges.length === 0) {
    embed.setDescription(
      'Este usuário ainda não possui badges.\n\nParticipe das atividades do servidor para conquistar badges!',
    );
    return embed;
  }

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
      name: `${getCategoryEmoji(category)} ${category} (${categoryBadges.length})`,
      value: badgeList,
      inline: false,
    });
  });

  embed.setFooter({ text: `Total: ${badges.length} badges conquistadas` });

  return embed;
}

/**
 * Create PUBG stats embed
 */
async function createPUBGStatsEmbed(user: any, stats: any, userData: any): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle(`🎮 Estatísticas PUBG - ${user.displayName}`)
    .setThumbnail(user.displayAvatarURL())
    .setColor('#FF6B35')
    .setTimestamp();

  // Current season stats
  if (stats.currentSeason) {
    const season = stats.currentSeason;
    embed.addFields(
      {
        name: '🏆 Temporada Atual',
        value: `**${season.seasonId}**\n🥇 Rank: ${season.tier}\n📊 RP: ${season.rankPoints}`,
        inline: true,
      },
      {
        name: '🎯 Partidas',
        value: `🎮 Jogadas: ${season.roundsPlayed}\n🏆 Vitórias: ${season.wins}\n📈 Top 10: ${season.top10s}`,
        inline: true,
      },
      {
        name: '⚔️ Combate',
        value: `💀 Kills: ${season.kills}\n💥 Dano: ${Math.round(season.damageDealt)}\n🎯 K/D: ${season.kdr?.toFixed(2)}`,
        inline: true,
      },
    );
  }

  // Lifetime stats
  if (stats.lifetime) {
    const lifetime = stats.lifetime;
    embed.addFields(
      {
        name: '📊 Estatísticas Gerais',
        value: `🎮 Partidas: ${lifetime.roundsPlayed}\n🏆 Vitórias: ${lifetime.wins}\n💀 Kills: ${lifetime.kills}`,
        inline: true,
      },
      {
        name: '🏅 Performance',
        value: `🎯 K/D: ${lifetime.kdr?.toFixed(2)}\n💥 Dano Médio: ${Math.round(lifetime.avgDamage)}\n⏱️ Sobrevivência: ${Math.round(lifetime.avgSurvivalTime)}min`,
        inline: true,
      },
      {
        name: '🎖️ Conquistas',
        value: `🥇 Chicken Dinners: ${lifetime.wins}\n📈 Top 10: ${lifetime.top10s}\n🔫 Headshots: ${lifetime.headshotKills}`,
        inline: true,
      },
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

/**
 * Create achievements embed
 */
async function createAchievementsEmbed(user: any, userData: any): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Conquistas de ${user.displayName}`)
    .setThumbnail(user.displayAvatarURL())
    .setColor('#9B59B6')
    .setTimestamp();

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
    const completedList = completed.map(a => `✅ **${a.name}**\n${a.description}`).join('\n\n');
    embed.addFields({
      name: `🏆 Conquistadas (${completed.length})`,
      value: completedList,
      inline: false,
    });
  }

  if (pending.length > 0) {
    const pendingList = pending.map(a => `⏳ **${a.name}**\n${a.description}`).join('\n\n');
    embed.addFields({
      name: `⏳ Em Progresso (${pending.length})`,
      value: pendingList,
      inline: false,
    });
  }

  const progressPercentage = Math.round((completed.length / achievements.length) * 100);
  const progressBar = createProgressBar(progressPercentage, 20);

  embed.addFields({
    name: '📊 Progresso Geral',
    value: `${progressBar} ${progressPercentage}%\n${completed.length}/${achievements.length} conquistas`,
    inline: false,
  });

  return embed;
}

/**
 * Create progress bar
 */
function createProgressBar(percentage: number, length: number = 20): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Get category emoji
 */
function getCategoryEmoji(category: string): string {
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

export default profile;
