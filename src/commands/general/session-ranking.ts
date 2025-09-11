import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  CommandInteraction,
  ComponentType,
  ButtonStyle,
} from 'discord.js';
import { CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { BaseCommand } from '../../utils/base-command.util';
import { DatabaseService } from '../../database/database.service';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';
import { HawkComponentFactory } from '../../utils/hawk-component-factory';
import { HAWK_EMOJIS } from '../../constants/hawk-emojis';

interface SessionRankingData {
  userId: string;
  username: string;
  avatar?: string;
  totalSessions: number;
  totalDuration: number; // in minutes
  averageDuration: number;
  sessionTypes: {
    mm: number;
    scrim: number;
    campeonato: number;
    ranked: number;
  };
  streak: number;
  lastSession: Date;
  points: number;
  rank: number;
}

/**
 * Session ranking command - View participation-based rankings
 */
class SessionRankingCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('session-ranking')
        .setDescription(`${HAWK_EMOJIS.TROPHY} Ver ranking baseado na participação em sessões`)
        .addStringOption(option =>
          option
            .setName('periodo')
            .setDescription('Período para o ranking')
            .setRequired(false)
            .addChoices(
              { name: `${HAWK_EMOJIS.TIME.CALENDAR} Semanal`, value: 'weekly' },
              { name: `${HAWK_EMOJIS.TIME.CALENDAR} Mensal`, value: 'monthly' },
              { name: `${HAWK_EMOJIS.STATS} Geral`, value: 'all_time' }
            )
        )
        .addStringOption(option =>
          option
            .setName('tipo')
            .setDescription('Filtrar por tipo de sessão')
            .setRequired(false)
            .addChoices(
              { name: `${HAWK_EMOJIS.GAMING.GAME} Matchmaking (MM)`, value: 'mm' },
              { name: `${HAWK_EMOJIS.GAMING.CONTROLLER} Scrim`, value: 'scrim' },
              { name: `${HAWK_EMOJIS.TROPHY} Campeonato`, value: 'campeonato' },
              { name: `${HAWK_EMOJIS.MEDAL} Ranked`, value: 'ranked' }
            )
        ) as SlashCommandBuilder,
      category: CommandCategory.GENERAL,
      cooldown: 10,
    });
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const database = client.database;

    try {
      await interaction.deferReply();

      const periodo = interaction.options.getString('periodo') || 'monthly';
      const tipoFiltro = interaction.options.getString('tipo');
      const guildId = interaction.guild!.id;

      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;

      switch (periodo) {
        case 'weekly':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'all_time':
        default:
          startDate = new Date(2020, 0, 1); // Far back date
          break;
      }

      // Get session data from presence records
      const sessionData = await this.getSessionRankingData(
        database,
        guildId,
        startDate,
        tipoFiltro
      );

      if (sessionData.length === 0) {
        const noDataEmbed = HawkEmbedBuilder.createWarning(
          `${HAWK_EMOJIS.CHART} Ranking de Sessões`,
          'Nenhum dado de sessão encontrado para o período selecionado.'
        );

        await interaction.editReply({ embeds: [noDataEmbed] });
        return;
      }

      // Create ranking embed
      const embed = await this.createRankingEmbed(
        sessionData,
        periodo,
        tipoFiltro,
        interaction.user.id
      );

      // Create navigation buttons
      const buttons = HawkComponentFactory.createButtonRow([
        HawkComponentFactory.createButton({
          customId: 'session_ranking_details',
          label: 'Ver Detalhes',
          style: ButtonStyle.Primary,
          emoji: HAWK_EMOJIS.STATS,
        }),
        HawkComponentFactory.createButton({
          customId: 'session_ranking_personal',
          label: 'Meu Ranking',
          style: ButtonStyle.Secondary,
          emoji: HAWK_EMOJIS.USER,
        }),
        HawkComponentFactory.createButton({
          customId: 'session_ranking_refresh',
          label: 'Atualizar',
          style: ButtonStyle.Success,
          emoji: HAWK_EMOJIS.REFRESH,
        }),
      ]);

      const response = await interaction.editReply({
        embeds: [embed],
        components: [buttons],
      });

      // Setup button collector
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000, // 5 minutes
      });

      collector.on('collect', async buttonInteraction => {
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            content: `${HAWK_EMOJIS.ERROR} Apenas quem executou o comando pode usar estes botões.`,
            ephemeral: true,
          });
          return;
        }

        await buttonInteraction.deferUpdate();

        try {
          switch (buttonInteraction.customId) {
            case 'session_ranking_details':
              const detailsEmbed = await this.createDetailsEmbed(sessionData.slice(0, 5));
              await buttonInteraction.editReply({ embeds: [detailsEmbed] });
              break;

            case 'session_ranking_personal':
              const personalEmbed = await this.createPersonalRankingEmbed(
                sessionData,
                interaction.user.id
              );
              await buttonInteraction.editReply({ embeds: [personalEmbed] });
              break;

            case 'session_ranking_refresh':
              const newData = await this.getSessionRankingData(
                database,
                guildId,
                startDate,
                tipoFiltro
              );
              const newEmbed = await this.createRankingEmbed(
                newData,
                periodo,
                tipoFiltro,
                interaction.user.id
              );
              await buttonInteraction.editReply({ embeds: [newEmbed] });
              break;
          }
        } catch (error) {
          this.logger.error('Error handling session ranking button:', error);
        }
      });

      collector.on('end', async () => {
        try {
          const disabledButtons = HawkComponentFactory.createButtonRow(
            buttons.components.map(button =>
              HawkComponentFactory.createButton({
                customId: (button as any).customId || (button as any).data?.custom_id,
                label: (button as any).label || (button as any).data?.label || 'Button',
                style: ButtonStyle.Secondary,
                disabled: true,
              })
            )
          );

          await interaction.editReply({ components: [disabledButtons] });
        } catch (error) {
          // Ignore errors when disabling buttons (message might be deleted)
        }
      });
    } catch (error) {
      this.logger.error('Error in session-ranking command:', error);

      const errorEmbed = HawkEmbedBuilder.createError(
        `${HAWK_EMOJIS.ERROR} Erro`,
        'Ocorreu um erro ao buscar o ranking de sessões.'
      );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Get session ranking data from database
   */
  private async getSessionRankingData(
    database: DatabaseService,
    guildId: string,
    startDate: Date,
    typeFilter?: string | null
  ): Promise<SessionRankingData[]> {
    try {
      // Get all presence records for the period
      const presenceRecords = await database.client.presence.findMany({
        where: {
          guildId,
          timestamp: {
            gte: startDate,
          },
          type: 'checkin',
        },
        include: {
          user: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      // Group by user and calculate stats
      const userStatsMap = new Map<string, SessionRankingData>();

      for (const record of presenceRecords) {
        const userId = record.userId;

        // Filter by type if specified
        if (typeFilter && record.note && !record.note.toLowerCase().includes(typeFilter)) {
          continue;
        }

        let userStats = userStatsMap.get(userId);
        if (!userStats) {
          userStats = {
            userId,
            username: record.user?.username || 'Unknown',
            avatar: record.user?.avatar || undefined,
            totalSessions: 0,
            totalDuration: 0,
            averageDuration: 0,
            sessionTypes: {
              mm: 0,
              scrim: 0,
              campeonato: 0,
              ranked: 0,
            },
            streak: 0,
            lastSession: record.timestamp,
            points: 0,
            rank: 0,
          };
          userStatsMap.set(userId, userStats);
        }

        userStats.totalSessions++;

        // Determine session type from note
        if (record.note) {
          const note = record.note.toLowerCase();
          if (note.includes('mm')) {
            userStats.sessionTypes.mm++;
          } else if (note.includes('scrim')) {
            userStats.sessionTypes.scrim++;
          } else if (note.includes('campeonato')) {
            userStats.sessionTypes.campeonato++;
          } else if (note.includes('ranked')) {
            userStats.sessionTypes.ranked++;
          }
        }

        // Find corresponding checkout to calculate duration
        const checkout = await database.client.presence.findFirst({
          where: {
            userId,
            guildId,
            type: 'checkout',
            timestamp: {
              gt: record.timestamp,
            },
          },
          orderBy: {
            timestamp: 'asc',
          },
        });

        if (checkout) {
          const duration = Math.floor(
            (checkout.timestamp.getTime() - record.timestamp.getTime()) / (1000 * 60)
          );
          userStats.totalDuration += duration;
        }

        // Update last session date
        if (record.timestamp > userStats.lastSession) {
          userStats.lastSession = record.timestamp;
        }
      }

      // Calculate derived stats and points
      const rankingData: SessionRankingData[] = [];

      for (const userStats of Array.from(userStatsMap.values())) {
        userStats.averageDuration =
          userStats.totalSessions > 0
            ? Math.round(userStats.totalDuration / userStats.totalSessions)
            : 0;

        // Calculate points based on participation
        userStats.points = this.calculateSessionPoints(userStats);

        // Calculate streak (simplified - days since last session)
        const daysSinceLastSession = Math.floor(
          (Date.now() - userStats.lastSession.getTime()) / (1000 * 60 * 60 * 24)
        );
        userStats.streak = daysSinceLastSession <= 1 ? Math.max(1, userStats.totalSessions) : 0;

        rankingData.push(userStats);
      }

      // Sort by points and assign ranks
      rankingData.sort((a, b) => b.points - a.points);
      rankingData.forEach((user, index) => {
        user.rank = index + 1;
      });

      return rankingData;
    } catch (error) {
      console.error('Error getting session ranking data:', error);
      return [];
    }
  }

  /**
   * Calculate points based on session participation
   */
  private calculateSessionPoints(userStats: SessionRankingData): number {
    let points = 0;

    // Base points for sessions
    points += userStats.totalSessions * 10;

    // Bonus points for duration
    points += Math.floor(userStats.totalDuration / 60) * 5; // 5 points per hour

    // Bonus points for different session types
    points += userStats.sessionTypes.mm * 2;
    points += userStats.sessionTypes.scrim * 5;
    points += userStats.sessionTypes.campeonato * 10;
    points += userStats.sessionTypes.ranked * 8;

    // Streak bonus
    points += userStats.streak * 3;

    return points;
  }

  /**
   * Create main ranking embed
   */
  private async createRankingEmbed(
    data: SessionRankingData[],
    period: string,
    typeFilter: string | null,
    requesterId: string
  ): Promise<any> {
    const periodNames = {
      weekly: 'Semanal',
      monthly: 'Mensal',
      all_time: 'Geral',
    };

    const typeNames = {
      mm: 'Matchmaking',
      scrim: 'Scrim',
      campeonato: 'Campeonato',
      ranked: 'Ranked',
    };

    const embed = HawkEmbedBuilder.createInfo(
      `Ranking de Sessões - ${periodNames[period as keyof typeof periodNames] || 'Geral'}`,
      `${HAWK_EMOJIS.TROPHY} Confira os jogadores mais ativos do servidor!`
    ).setTimestamp();

    if (typeFilter) {
      embed.setDescription(
        `${HAWK_EMOJIS.TROPHY} Confira os jogadores mais ativos do servidor!\n\n${HAWK_EMOJIS.FILTERS.TYPE} **Filtro:** ${typeNames[typeFilter as keyof typeof typeNames] || typeFilter}\n`
      );
    }

    const top10 = data.slice(0, 10);
    let description = embed.data.description || '';

    if (top10.length === 0) {
      description += `${HAWK_EMOJIS.ERROR} Nenhum dado encontrado para o período selecionado.`;
    } else {
      description += `\n${HAWK_EMOJIS.MEDAL} **Top 10 Participantes:**\n\n`;

      top10.forEach((user, index) => {
        const medals = [HAWK_EMOJIS.FIRST_PLACE, HAWK_EMOJIS.SECOND_PLACE, HAWK_EMOJIS.THIRD_PLACE];
        const medal = index < 3 ? medals[index] : `${index + 1}º`;
        const hours = Math.floor(user.totalDuration / 60);
        const minutes = user.totalDuration % 60;

        description += `${medal} **${user.username}**\n`;
        description += `${HAWK_EMOJIS.STAR} ${user.points} pts | ${HAWK_EMOJIS.GAMING.SESSION} ${user.totalSessions} sessões | ${HAWK_EMOJIS.TIME.DURATION} ${hours}h${minutes}m\n`;

        if (user.userId === requesterId) {
          description += `${HAWK_EMOJIS.PROFILE} **(Você está aqui!)**\n`;
        }

        description += '\n';
      });

      // Show requester's position if not in top 10
      const requesterData = data.find(u => u.userId === requesterId);
      if (requesterData && requesterData.rank > 10) {
        description += `\n${HAWK_EMOJIS.RANKING} **Sua Posição:** ${requesterData.rank}º lugar (${requesterData.points} pts)`;
      }
    }

    embed.setDescription(description);

    // Add footer with stats
    if (data.length > 0) {
      const totalSessions = data.reduce((sum, user) => sum + user.totalSessions, 0);
      const totalHours = Math.floor(data.reduce((sum, user) => sum + user.totalDuration, 0) / 60);
      embed.setFooter({
        text: `${data.length} participantes • ${totalSessions} sessões • ${totalHours}h jogadas`,
      });
    }

    return embed;
  }

  /**
   * Create details embed for top users
   */
  private async createDetailsEmbed(topUsers: SessionRankingData[]): Promise<any> {
    const embed = HawkEmbedBuilder.createSuccess(
      'Detalhes dos Top Participantes',
      `${HAWK_EMOJIS.STATS} Estatísticas detalhadas dos melhores jogadores`
    ).setTimestamp();

    let description = '';

    topUsers.forEach((user, index) => {
      const medals = [HAWK_EMOJIS.FIRST_PLACE, HAWK_EMOJIS.SECOND_PLACE, HAWK_EMOJIS.THIRD_PLACE];
      const medal = index < 3 ? medals[index] : `${index + 1}º`;

      description += `${medal} **${user.username}**\n`;
      description += `${HAWK_EMOJIS.STAR} **Pontos:** ${user.points}\n`;
      description += `${HAWK_EMOJIS.GAMING.SESSION} **Sessões:** ${user.totalSessions}\n`;
      description += `${HAWK_EMOJIS.TIME.DURATION} **Tempo Total:** ${Math.floor(user.totalDuration / 60)}h ${user.totalDuration % 60}m\n`;
      description += `${HAWK_EMOJIS.SYSTEM.AVERAGE} **Média por Sessão:** ${user.averageDuration}min\n`;
      description += `${HAWK_EMOJIS.SYSTEM.STREAK} **Streak:** ${user.streak}\n`;
      description += `${HAWK_EMOJIS.TIME.LAST_SEEN} **Última Sessão:** <t:${Math.floor(user.lastSession.getTime() / 1000)}:R>\n`;

      // Session type breakdown
      const types = [];
      if (user.sessionTypes.mm > 0) {
        types.push(`${HAWK_EMOJIS.GAMING.GAME} MM: ${user.sessionTypes.mm}`);
      }
      if (user.sessionTypes.scrim > 0) {
        types.push(`${HAWK_EMOJIS.GAMING.CONTROLLER} Scrim: ${user.sessionTypes.scrim}`);
      }
      if (user.sessionTypes.campeonato > 0) {
        types.push(`${HAWK_EMOJIS.TROPHY} Camp: ${user.sessionTypes.campeonato}`);
      }
      if (user.sessionTypes.ranked > 0) {
        types.push(`${HAWK_EMOJIS.MEDAL} Ranked: ${user.sessionTypes.ranked}`);
      }

      if (types.length > 0) {
        description += `${HAWK_EMOJIS.GAMING.TYPES} **Tipos:** ${types.join(', ')}\n`;
      }

      description += '\n';
    });

    embed.setDescription(description);
    return embed;
  }

  /**
   * Create personal ranking embed
   */
  private async createPersonalRankingEmbed(
    data: SessionRankingData[],
    userId: string
  ): Promise<any> {
    const userStats = data.find(u => u.userId === userId);

    const embed = HawkEmbedBuilder.createInfo(
      'Seu Ranking Pessoal',
      `${HAWK_EMOJIS.PROFILE} Confira suas estatísticas de participação`
    ).setTimestamp();

    if (!userStats) {
      embed.setDescription(
        `${HAWK_EMOJIS.ERROR} Você ainda não possui dados de sessão registrados.`
      );
      return embed;
    }

    const hours = Math.floor(userStats.totalDuration / 60);
    const minutes = userStats.totalDuration % 60;

    let description = `${HAWK_EMOJIS.PROFILE} Confira suas estatísticas de participação\n\n`;
    description += `${HAWK_EMOJIS.TROPHY} **Posição:** ${userStats.rank}º lugar\n`;
    description += `${HAWK_EMOJIS.STAR} **Pontos:** ${userStats.points}\n\n`;

    description += `${HAWK_EMOJIS.CHART} **Estatísticas:**\n`;
    description += `• ${HAWK_EMOJIS.GAMING.SESSION} **Sessões Totais:** ${userStats.totalSessions}\n`;
    description += `• ${HAWK_EMOJIS.TIME.DURATION} **Tempo Total:** ${hours}h ${minutes}m\n`;
    description += `• ${HAWK_EMOJIS.SYSTEM.AVERAGE} **Média por Sessão:** ${userStats.averageDuration} minutos\n`;
    description += `• ${HAWK_EMOJIS.SYSTEM.STREAK} **Streak Atual:** ${userStats.streak}\n`;
    description += `• ${HAWK_EMOJIS.TIME.LAST_SEEN} **Última Sessão:** <t:${Math.floor(userStats.lastSession.getTime() / 1000)}:R>\n\n`;

    description += `${HAWK_EMOJIS.GAMING.TYPES} **Sessões por Tipo:**\n`;
    description += `• ${HAWK_EMOJIS.GAMING.GAME} **MM:** ${userStats.sessionTypes.mm}\n`;
    description += `• ${HAWK_EMOJIS.GAMING.CONTROLLER} **Scrim:** ${userStats.sessionTypes.scrim}\n`;
    description += `• ${HAWK_EMOJIS.TROPHY} **Campeonato:** ${userStats.sessionTypes.campeonato}\n`;
    description += `• ${HAWK_EMOJIS.MEDAL} **Ranked:** ${userStats.sessionTypes.ranked}\n\n`;

    // Show position relative to others
    if (userStats.rank > 1) {
      const userAbove = data[userStats.rank - 2];
      if (userAbove) {
        const pointsDiff = userAbove.points - userStats.points;
        description += `${HAWK_EMOJIS.UP} **Para subir:** ${pointsDiff} pontos (${userAbove.username})\n`;
      }
    }

    if (userStats.rank < data.length) {
      const userBelow = data[userStats.rank];
      if (userBelow) {
        const pointsLead = userStats.points - userBelow.points;
        description += `${HAWK_EMOJIS.DOWN} **Vantagem:** ${pointsLead} pontos sobre ${userBelow.username}\n`;
      }
    }

    embed.setDescription(description);
    return embed;
  }
}

const commandInstance = new SessionRankingCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.GENERAL,
  cooldown: 5,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;
