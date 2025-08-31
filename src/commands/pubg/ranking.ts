import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { RankingService } from '../../services/ranking.service';
import { DatabaseService } from '../../database/database.service';

/**
 * Ranking command - Shows PUBG and internal rankings
 */
const ranking: Command = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('📊 Mostra os rankings do servidor')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Tipo de ranking')
        .setRequired(true)
        .addChoices(
          { name: '🎮 PUBG - Diário', value: 'pubg_daily' },
          { name: '🎮 PUBG - Semanal', value: 'pubg_weekly' },
          { name: '🎮 PUBG - Mensal', value: 'pubg_monthly' },
          { name: '⭐ Interno - XP', value: 'internal_xp' },
          { name: '💰 Interno - Moedas', value: 'internal_coins' },
          { name: '🏅 Interno - Badges', value: 'internal_badges' },
          { name: '⏰ Presença', value: 'presence' },
          { name: '🎵 Música', value: 'music' },
          { name: '🎯 Jogos', value: 'games' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('page')
        .setDescription('Página do ranking (padrão: 1)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .addBooleanOption(option =>
      option
        .setName('public')
        .setDescription('Tornar a resposta pública (padrão: privado)')
        .setRequired(false)
    ) as SlashCommandBuilder,

  category: CommandCategory.PUBG,
  cooldown: 15,

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    const logger = new Logger();
    const rankingService = new RankingService(client);
    const db = new DatabaseService();

    if (!interaction.isCommand()) return;

    const rankingType = interaction.options.getString('type', true);
    const page = interaction.options.getInteger('page') || 1;
    const isPublic = interaction.options.getBoolean('public') || false;

    if (!rankingType) {
      await interaction.reply({
        content: '❌ Tipo de ranking não especificado.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.deferReply({ ephemeral: !isPublic });

      const limit = 10;
      const offset = (page - 1) * limit;

      const allTimePeriod = {
        type: 'all_time' as const,
        startDate: new Date(0),
        endDate: new Date(),
      };

      let rankingData: any[] = [];
      let totalCount = 0;
      let embed: EmbedBuilder;

      switch (rankingType) {
        case 'pubg_daily':
        case 'pubg_weekly':
        case 'pubg_monthly':
          const period = rankingType.split('_')[1] as 'daily' | 'weekly' | 'monthly';
          const now = new Date();
          let rankingPeriod;
          
          switch (period) {
            case 'daily':
              rankingPeriod = {
                type: 'daily' as const,
                startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
                endDate: now,
              };
              break;
            case 'weekly':
              rankingPeriod = {
                type: 'weekly' as const,
                startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                endDate: now,
              };
              break;
            case 'monthly':
              rankingPeriod = {
                type: 'monthly' as const,
                startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
                endDate: now,
              };
              break;
            default:
              throw new Error(`Período inválido: ${period}`);
          }
          try {
            const pubgRanking = await rankingService.getPUBGRanking(
              interaction.guildId!,
              rankingPeriod!,
              undefined,
              'rankPoints',
              limit
            );
            rankingData = pubgRanking;
            totalCount = pubgRanking.length;
            embed = await createPUBGRankingEmbed(
              rankingData,
              period,
              page,
              totalCount,
              interaction.user.id
            );
          } catch (error) {
            logger.error(`Error fetching PUBG ranking (${period}):`, error);
            throw new Error(`Erro ao buscar ranking PUBG ${period}. Tente novamente mais tarde.`);
          }
          break;

        case 'internal_xp':
          try {
            const xpRanking = await rankingService.getInternalRanking(
              interaction.guildId!,
              allTimePeriod,
              'xp',
              limit
            );
            rankingData = xpRanking;
            totalCount = xpRanking.length;
            embed = await createInternalRankingEmbed(
              rankingData,
              'XP',
              page,
              totalCount,
              interaction.user.id,
              client
            );
          } catch (error) {
            logger.error('Error fetching XP ranking:', error);
            throw new Error('Erro ao buscar ranking de XP. Tente novamente mais tarde.');
          }
          break;

        case 'internal_coins':
          try {
            const coinsRanking = await rankingService.getInternalRanking(
              interaction.guildId!,
              allTimePeriod,
              'coins',
              limit
            );
            rankingData = coinsRanking;
            totalCount = coinsRanking.length;
            embed = await createInternalRankingEmbed(
              rankingData,
              'Moedas',
              page,
              totalCount,
              interaction.user.id,
              client
            );
          } catch (error) {
            logger.error('Error fetching coins ranking:', error);
            throw new Error('Erro ao buscar ranking de moedas. Tente novamente mais tarde.');
          }
          break;

        case 'internal_badges':
          try {
            const badgesRanking = await rankingService.getInternalRanking(
              interaction.guildId!,
              allTimePeriod,
              'badgeCount',
              limit
            );
            rankingData = badgesRanking;
            totalCount = badgesRanking.length;
            embed = await createInternalRankingEmbed(
              rankingData,
              'Badges',
              page,
              totalCount,
              interaction.user.id,
              client
            );
          } catch (error) {
            logger.error('Error fetching badges ranking:', error);
            throw new Error('Erro ao buscar ranking de badges. Tente novamente mais tarde.');
          }
          break;

        case 'presence':
          const presenceRanking = await getPresenceRanking(
            interaction.guildId!,
            limit as any,
            offset as any
          );
          rankingData = (presenceRanking as any).rankings || [];
          totalCount = (presenceRanking as any).total || 0;
          embed = await createPresenceRankingEmbed(
            rankingData,
            page,
            totalCount,
            interaction.user.id,
            client
          );
          break;

        case 'music':
          const musicRanking = await getMusicRanking(interaction.guildId!, limit, offset);
          rankingData = musicRanking.rankings;
          totalCount = musicRanking.total;
          embed = await createActivityRankingEmbed(
            rankingData,
            'Música',
            page,
            totalCount,
            interaction.user.id,
            client,
            '🎵'
          );
          break;

        case 'games':
          const gamesRanking = await getGamesRanking(interaction.guildId!, limit, offset);
          rankingData = gamesRanking.rankings;
          totalCount = gamesRanking.total;
          embed = await createActivityRankingEmbed(
            rankingData,
            'Jogos',
            page,
            totalCount,
            interaction.user.id,
            client,
            '🎯'
          );
          break;

        default:
          throw new Error('Tipo de ranking inválido');
      }

      // Create navigation buttons
      const buttonsRow = new ActionRowBuilder<ButtonBuilder>();

      if (page > 1) {
        buttonsRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`ranking_${rankingType}_${page - 1}`)
            .setLabel('◀️ Anterior')
            .setStyle(ButtonStyle.Primary)
        );
      }

      buttonsRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`ranking_${rankingType}_refresh`)
          .setLabel('🔄 Atualizar')
          .setStyle(ButtonStyle.Secondary)
      );

      if (offset + limit < totalCount) {
        buttonsRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`ranking_${rankingType}_${page + 1}`)
            .setLabel('Próxima ▶️')
            .setStyle(ButtonStyle.Primary)
        );
      }

      // Add quick navigation select menu
      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ranking_quick_nav')
          .setPlaceholder('🔍 Navegar para outro ranking')
          .addOptions([
            { label: '🎮 PUBG Diário', value: 'pubg_daily', emoji: '🎮' },
            { label: '🎮 PUBG Semanal', value: 'pubg_weekly', emoji: '🎮' },
            { label: '🎮 PUBG Mensal', value: 'pubg_monthly', emoji: '🎮' },
            { label: '⭐ XP Interno', value: 'internal_xp', emoji: '⭐' },
            { label: '💰 Moedas', value: 'internal_coins', emoji: '💰' },
            { label: '🏅 Badges', value: 'internal_badges', emoji: '🏅' },
            { label: '⏰ Presença', value: 'presence', emoji: '⏰' },
            { label: '🎵 Música', value: 'music', emoji: '🎵' },
            { label: '🎯 Jogos', value: 'games', emoji: '🎯' },
          ])
      );

      const response = await interaction.editReply({
        embeds: [embed],
        components: [selectRow, buttonsRow],
      });

      // Handle interactions
      const collector = response.createMessageComponentCollector({
        time: 300000, // 5 minutes
      });

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({
            content: '❌ Apenas quem executou o comando pode usar estes controles.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (i.isStringSelectMenu() && i.customId === 'ranking_quick_nav') {
          const newType = i.values[0];
          // Recursively call the same logic with new type
          await i.deferUpdate();
          // Re-execute with new parameters (simplified for brevity)
          const newEmbed = await getRankingEmbed(
            newType as string,
            1,
            interaction.guildId!,
            interaction.user.id,
            client
          );
          await i.editReply({ embeds: [newEmbed] });
        }

        if (i.isButton()) {
          const [, type, action] = i.customId.split('_');

          if (action === 'refresh') {
            await i.deferUpdate();
            const refreshedEmbed = await getRankingEmbed(
              rankingType,
              page,
              interaction.guildId!,
              interaction.user.id,
              client
            );
            await i.editReply({ embeds: [refreshedEmbed] });
          } else {
            const newPage = parseInt(action || '1');
            await i.deferUpdate();
            const newEmbed = await getRankingEmbed(
              rankingType,
              newPage,
              interaction.guildId!,
              interaction.user.id,
              client
            );
            await i.editReply({ embeds: [newEmbed] });
          }
        }
      });

      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
    } catch (error) {
      logger.error('Ranking command error:', error);

      // Log detalhado para o canal de logs da API se for erro relacionado ao PUBG
      if (client.services?.logging && rankingType.startsWith('pubg_')) {
        await client.services.logging.logApiOperation(
          interaction.guildId!,
          'PUBG',
          'get_pubg_ranking',
          false,
          error instanceof Error ? error.message : 'Erro desconhecido',
          `Erro no ranking PUBG - Usuário: ${interaction.user.tag}, Tipo: ${rankingType}`,
          {
            userId: interaction.user.id,
            rankingType,
            page,
            command: 'ranking',
          }
        );
      }

      const errorMessage =
        error instanceof Error && error.message.startsWith('Erro ao buscar')
          ? error.message
          : 'Ocorreu um erro ao buscar o ranking. Tente novamente em alguns minutos.';

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro no ranking')
        .setDescription(errorMessage)
        .setColor('#FF0000')
        .addFields({
          name: '💡 Dicas',
          value:
            '• Verifique sua conexão\n• Tente novamente em alguns minutos\n• Use um tipo de ranking diferente',
          inline: false,
        })
        .setFooter({ text: 'Se o problema persistir, contate um administrador' });

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed], components: [] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  },
};

/**
 * Create PUBG ranking embed
 */
async function createPUBGRankingEmbed(
  rankings: any[],
  period: 'daily' | 'weekly' | 'monthly',
  page: number,
  total: number,
  userId: string
): Promise<EmbedBuilder> {
  const periodNames = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
  };

  const embed = new EmbedBuilder()
    .setTitle(`🎮 Ranking PUBG ${periodNames[period]}`)
    .setColor('#FF6B35')
    .setTimestamp();

  if (rankings.length === 0) {
    embed.setDescription(
      'Nenhum jogador encontrado neste ranking.\n\nUse `/register` para se cadastrar e aparecer nos rankings!'
    );
    return embed;
  }

  const rankingText = rankings
    .map((user, index) => {
      const position = (page - 1) * 10 + index + 1;
      const medal = getMedalEmoji(position);
      const isCurrentUser = user.userId === userId;
      const highlight = isCurrentUser ? '**' : '';

      const stats = [
        `🏆 ${user.currentRank || 'Sem rank'}`,
        `📊 ${user.rankPoints || 0} RP`,
        `💀 ${user.kills || 0} kills`,
        `🏆 ${user.wins || 0} vitórias`,
      ].join(' • ');

      return `${highlight}${medal} **#${position}** <@${user.userId}>${highlight}\n${stats}`;
    })
    .join('\n\n');

  embed.setDescription(rankingText);

  // Add pagination info
  const totalPages = Math.ceil(total / 10);
  embed.setFooter({
    text: `Página ${page}/${totalPages} • Total: ${total} jogadores • Atualizado a cada hora`,
  });

  // Find user's position if not on current page
  const userRank = rankings.find(r => r.userId === userId);
  if (!userRank && total > 0) {
    // Add user's position info
    embed.addFields({
      name: '📍 Sua Posição',
      value: 'Use os botões para navegar até sua posição no ranking.',
      inline: false,
    });
  }

  return embed;
}

/**
 * Create internal ranking embed
 */
async function createInternalRankingEmbed(
  rankings: any[],
  type: string,
  page: number,
  total: number,
  userId: string,
  client: ExtendedClient
): Promise<EmbedBuilder> {
  const typeEmojis: { [key: string]: string } = {
    XP: '⭐',
    Moedas: '💰',
    Badges: '🏅',
  };

  const embed = new EmbedBuilder()
    .setTitle(`${typeEmojis[type]} Ranking Interno - ${type}`)
    .setColor('#9B59B6')
    .setTimestamp();

  if (rankings.length === 0) {
    embed.setDescription(
      'Nenhum usuário encontrado neste ranking.\n\nParticipe das atividades do servidor para aparecer nos rankings!'
    );
    return embed;
  }

  const rankingText = rankings
    .map((user, index) => {
      const position = (page - 1) * 10 + index + 1;
      const medal = getMedalEmoji(position);
      const isCurrentUser = user.userId === userId;
      const highlight = isCurrentUser ? '**' : '';

      let value: string;
      let extra: string = '';

      switch (type) {
        case 'XP':
          value = `${user.xp || 0} XP`;
          extra = `• Nível ${user.level || 1}`;
          break;
        case 'Moedas':
          value = `${user.coins || 0} 🪙`;
          extra = user.gems ? `• ${user.gems} 💎` : '';
          break;
        case 'Badges':
          value = `${user.badgeCount || 0} badges`;
          extra = user.rarebadges ? `• ${user.rarebadges} raras` : '';
          break;
        default:
          value = '0';
      }

      return `${highlight}${medal} **#${position}** <@${user.userId}>${highlight}\n${value} ${extra}`;
    })
    .join('\n\n');

  embed.setDescription(rankingText);

  const totalPages = Math.ceil(total / 10);
  embed.setFooter({
    text: `Página ${page}/${totalPages} • Total: ${total} usuários • Atualizado em tempo real`,
  });

  return embed;
}

/**
 * Create presence ranking embed
 */
async function createPresenceRankingEmbed(
  rankings: any[],
  page: number,
  total: number,
  userId: string,
  client: ExtendedClient
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle('⏰ Ranking de Presença')
    .setColor('#2ECC71')
    .setTimestamp();

  if (rankings.length === 0) {
    embed.setDescription(
      'Nenhum usuário encontrado neste ranking.\n\nUse `/checkin` para começar a registrar sua presença!'
    );
    return embed;
  }

  const rankingText = rankings
    .map((user, index) => {
      const position = (page - 1) * 10 + index + 1;
      const medal = getMedalEmoji(position);
      const isCurrentUser = user.userId === userId;
      const highlight = isCurrentUser ? '**' : '';

      const totalHours = Math.floor((user.totalTime || 0) / 3600000);
      const streak = user.currentStreak || 0;
      const days = user.totalDays || 0;

      return `${highlight}${medal} **#${position}** <@${user.userId}>${highlight}\n🕐 ${totalHours}h • 🔥 ${streak} dias • 📅 ${days} dias total`;
    })
    .join('\n\n');

  embed.setDescription(rankingText);

  const totalPages = Math.ceil(total / 10);
  embed.setFooter({
    text: `Página ${page}/${totalPages} • Total: ${total} usuários • Atualizado diariamente`,
  });

  return embed;
}

/**
 * Create activity ranking embed
 */
async function createActivityRankingEmbed(
  rankings: any[],
  type: string,
  page: number,
  total: number,
  userId: string,
  client: ExtendedClient,
  emoji: string
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Ranking de ${type}`)
    .setColor('#3498DB')
    .setTimestamp();

  if (rankings.length === 0) {
    embed.setDescription(
      `Nenhum usuário encontrado neste ranking.\n\nParticipe das atividades de ${type.toLowerCase()} para aparecer aqui!`
    );
    return embed;
  }

  const rankingText = rankings
    .map((user, index) => {
      const position = (page - 1) * 10 + index + 1;
      const medal = getMedalEmoji(position);
      const isCurrentUser = user.userId === userId;
      const highlight = isCurrentUser ? '**' : '';

      const count = user.count || 0;
      const unit = type === 'Música' ? 'músicas' : 'jogos';

      return `${highlight}${medal} **#${position}** <@${user.userId}>${highlight}\n${emoji} ${count} ${unit}`;
    })
    .join('\n\n');

  embed.setDescription(rankingText);

  const totalPages = Math.ceil(total / 10);
  embed.setFooter({
    text: `Página ${page}/${totalPages} • Total: ${total} usuários`,
  });

  return embed;
}

/**
 * Get medal emoji for position
 */
function getMedalEmoji(position: number): string {
  switch (position) {
    case 1:
      return '🥇';
    case 2:
      return '🥈';
    case 3:
      return '🥉';
    default:
      return '🏅';
  }
}

/**
 * Get presence ranking (mock implementation)
 */
async function getPresenceRanking(guildId: string, limit: number, offset: number) {
  // This would be implemented in PresenceService
  return { rankings: [], total: 0 };
}

/**
 * Get music ranking (mock implementation)
 */
async function getMusicRanking(guildId: string, limit: number, offset: number) {
  // This would be implemented in MusicService
  return { rankings: [], total: 0 };
}

/**
 * Get games ranking (mock implementation)
 */
async function getGamesRanking(guildId: string, limit: number, offset: number) {
  // This would be implemented in GameService
  return { rankings: [], total: 0 };
}

/**
 * Get ranking embed helper
 */
async function getRankingEmbed(
  type: string,
  page: number,
  guildId: string,
  userId: string,
  client: ExtendedClient
): Promise<EmbedBuilder> {
  // Simplified implementation - would need full logic here
  return new EmbedBuilder()
    .setTitle('🔄 Carregando...')
    .setDescription('Atualizando ranking...')
    .setColor('#FFA500');
}

export default ranking;
