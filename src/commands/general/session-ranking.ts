import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  CommandInteraction,
  ComponentType
} from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';
import { DatabaseService } from '@/database/database.service';

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
const sessionRanking: Command = {
  data: new SlashCommandBuilder()
    .setName('session-ranking')
    .setDescription('🏆 Ver ranking baseado na participação em sessões')
    .addStringOption(option =>
      option
        .setName('periodo')
        .setDescription('Período para o ranking')
        .setRequired(false)
        .addChoices(
          { name: '📅 Semanal', value: 'weekly' },
          { name: '📆 Mensal', value: 'monthly' },
          { name: '📊 Geral', value: 'all_time' }
        )
    )
    .addStringOption(option =>
      option
        .setName('tipo')
        .setDescription('Filtrar por tipo de sessão')
        .setRequired(false)
        .addChoices(
          { name: '🎯 Matchmaking (MM)', value: 'mm' },
          { name: '⚔️ Scrim', value: 'scrim' },
          { name: '🏆 Campeonato', value: 'campeonato' },
          { name: '🎖️ Ranked', value: 'ranked' }
        )
    ) as SlashCommandBuilder,
  
  category: CommandCategory.GENERAL,
  cooldown: 10,
  
  async execute(interaction: CommandInteraction | ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const logger = new Logger();
    const database = new DatabaseService();

    try {
      await interaction.deferReply();

      const periodo = (interaction as ChatInputCommandInteraction).options.getString('periodo') || 'monthly';
      const tipoFiltro = (interaction as ChatInputCommandInteraction).options.getString('tipo');
      const guildId = interaction.guild!.id;

      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;
      
      switch (periodo) {
        case 'weekly':
          startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
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
      const sessionData = await getSessionRankingData(database, guildId, startDate, tipoFiltro);
      
      if (sessionData.length === 0) {
        const noDataEmbed = new EmbedBuilder()
          .setTitle('📊 Ranking de Sessões')
          .setDescription('Nenhum dado de sessão encontrado para o período selecionado.')
          .setColor(0xffa500)
          .setTimestamp();

        await interaction.editReply({ embeds: [noDataEmbed] });
        return;
      }

      // Create ranking embed
      const embed = await createRankingEmbed(sessionData, periodo, tipoFiltro, interaction.user.id);
      
      // Create navigation buttons
      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('session_ranking_details')
            .setLabel('Ver Detalhes')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋'),
          new ButtonBuilder()
            .setCustomId('session_ranking_personal')
            .setLabel('Meu Ranking')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👤'),
          new ButtonBuilder()
            .setCustomId('session_ranking_refresh')
            .setLabel('Atualizar')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🔄')
        );

      const response = await interaction.editReply({ 
        embeds: [embed], 
        components: [buttons] 
      });

      // Setup button collector
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minutes
      });

      collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            content: '❌ Apenas quem executou o comando pode usar estes botões.',
            ephemeral: true
          });
          return;
        }

        await buttonInteraction.deferUpdate();

        try {
          switch (buttonInteraction.customId) {
            case 'session_ranking_details':
              const detailsEmbed = await createDetailsEmbed(sessionData.slice(0, 5));
              await buttonInteraction.editReply({ embeds: [detailsEmbed] });
              break;

            case 'session_ranking_personal':
              const personalEmbed = await createPersonalRankingEmbed(sessionData, interaction.user.id);
              await buttonInteraction.editReply({ embeds: [personalEmbed] });
              break;

            case 'session_ranking_refresh':
              const newData = await getSessionRankingData(database, guildId, startDate, tipoFiltro);
              const newEmbed = await createRankingEmbed(newData, periodo, tipoFiltro, interaction.user.id);
              await buttonInteraction.editReply({ embeds: [newEmbed] });
              break;
          }
        } catch (error) {
          logger.error('Error handling session ranking button:', error);
        }
      });

      collector.on('end', async () => {
        try {
          const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              buttons.components.map(button => 
                ButtonBuilder.from(button).setDisabled(true)
              )
            );
          
          await interaction.editReply({ components: [disabledButtons] });
        } catch (error) {
          // Ignore errors when disabling buttons (message might be deleted)
        }
      });

    } catch (error) {
      logger.error('Error in session-ranking command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao buscar o ranking de sessões.')
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

/**
 * Get session ranking data from database
 */
async function getSessionRankingData(
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
          gte: startDate
        },
        type: 'checkin'
      },
      include: {
        user: true
      },
      orderBy: {
        timestamp: 'desc'
      }
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
            ranked: 0
          },
          streak: 0,
          lastSession: record.timestamp,
          points: 0,
          rank: 0
        };
        userStatsMap.set(userId, userStats);
      }

      userStats.totalSessions++;
      
      // Determine session type from note
      if (record.note) {
        const note = record.note.toLowerCase();
        if (note.includes('mm')) userStats.sessionTypes.mm++;
        else if (note.includes('scrim')) userStats.sessionTypes.scrim++;
        else if (note.includes('campeonato')) userStats.sessionTypes.campeonato++;
        else if (note.includes('ranked')) userStats.sessionTypes.ranked++;
      }

      // Find corresponding checkout to calculate duration
      const checkout = await database.client.presence.findFirst({
        where: {
          userId,
          guildId,
          type: 'checkout',
          timestamp: {
            gt: record.timestamp
          }
        },
        orderBy: {
          timestamp: 'asc'
        }
      });

      if (checkout) {
        const duration = Math.floor((checkout.timestamp.getTime() - record.timestamp.getTime()) / (1000 * 60));
        userStats.totalDuration += duration;
      }

      // Update last session date
      if (record.timestamp > userStats.lastSession) {
        userStats.lastSession = record.timestamp;
      }
    }

    // Calculate derived stats and points
    const rankingData: SessionRankingData[] = [];
    
    for (const userStats of userStatsMap.values()) {
      userStats.averageDuration = userStats.totalSessions > 0 
        ? Math.round(userStats.totalDuration / userStats.totalSessions) 
        : 0;
      
      // Calculate points based on participation
      userStats.points = calculateSessionPoints(userStats);
      
      // Calculate streak (simplified - days since last session)
      const daysSinceLastSession = Math.floor((Date.now() - userStats.lastSession.getTime()) / (1000 * 60 * 60 * 24));
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
function calculateSessionPoints(userStats: SessionRankingData): number {
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
async function createRankingEmbed(
  data: SessionRankingData[],
  period: string,
  typeFilter: string | null,
  requesterId: string
): Promise<EmbedBuilder> {
  const periodNames = {
    weekly: 'Semanal',
    monthly: 'Mensal',
    all_time: 'Geral'
  };
  
  const typeNames = {
    mm: 'Matchmaking',
    scrim: 'Scrim',
    campeonato: 'Campeonato',
    ranked: 'Ranked'
  };

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Ranking de Sessões - ${periodNames[period as keyof typeof periodNames] || 'Geral'}`)
    .setColor(0xffd700)
    .setTimestamp();

  if (typeFilter) {
    embed.setDescription(`**Filtro:** ${typeNames[typeFilter as keyof typeof typeNames] || typeFilter}\n`);
  }

  const top10 = data.slice(0, 10);
  let description = embed.data.description || '';
  
  if (top10.length === 0) {
    description += 'Nenhum dado encontrado para o período selecionado.';
  } else {
    description += '\n**🏅 Top 10 Participantes:**\n\n';
    
    top10.forEach((user, index) => {
      const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}º`;
      const hours = Math.floor(user.totalDuration / 60);
      const minutes = user.totalDuration % 60;
      
      description += `${medal} **${user.username}**\n`;
      description += `📊 ${user.points} pts | 🎮 ${user.totalSessions} sessões | ⏱️ ${hours}h${minutes}m\n`;
      
      if (user.userId === requesterId) {
        description += `👤 **(Você está aqui!)**\n`;
      }
      
      description += '\n';
    });
    
    // Show requester's position if not in top 10
    const requesterData = data.find(u => u.userId === requesterId);
    if (requesterData && requesterData.rank > 10) {
      description += `\n📍 **Sua Posição:** ${requesterData.rank}º lugar (${requesterData.points} pts)`;
    }
  }

  embed.setDescription(description);
  
  // Add footer with stats
  if (data.length > 0) {
    const totalSessions = data.reduce((sum, user) => sum + user.totalSessions, 0);
    const totalHours = Math.floor(data.reduce((sum, user) => sum + user.totalDuration, 0) / 60);
    embed.setFooter({ 
      text: `${data.length} participantes • ${totalSessions} sessões • ${totalHours}h jogadas` 
    });
  }

  return embed;
}

/**
 * Create details embed for top users
 */
async function createDetailsEmbed(topUsers: SessionRankingData[]): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle('📋 Detalhes dos Top Participantes')
    .setColor(0x00ff00)
    .setTimestamp();

  let description = '';
  
  topUsers.forEach((user, index) => {
    const medal = ['🥇', '🥈', '🥉', '4º', '5º'][index] || `${index + 1}º`;
    
    description += `${medal} **${user.username}**\n`;
    description += `📊 **Pontos:** ${user.points}\n`;
    description += `🎮 **Sessões:** ${user.totalSessions}\n`;
    description += `⏱️ **Tempo Total:** ${Math.floor(user.totalDuration / 60)}h ${user.totalDuration % 60}m\n`;
    description += `📈 **Média por Sessão:** ${user.averageDuration}min\n`;
    description += `🔥 **Streak:** ${user.streak}\n`;
    description += `📅 **Última Sessão:** <t:${Math.floor(user.lastSession.getTime() / 1000)}:R>\n`;
    
    // Session type breakdown
    const types = [];
    if (user.sessionTypes.mm > 0) types.push(`MM: ${user.sessionTypes.mm}`);
    if (user.sessionTypes.scrim > 0) types.push(`Scrim: ${user.sessionTypes.scrim}`);
    if (user.sessionTypes.campeonato > 0) types.push(`Camp: ${user.sessionTypes.campeonato}`);
    if (user.sessionTypes.ranked > 0) types.push(`Ranked: ${user.sessionTypes.ranked}`);
    
    if (types.length > 0) {
      description += `🎯 **Tipos:** ${types.join(', ')}\n`;
    }
    
    description += '\n';
  });

  embed.setDescription(description);
  return embed;
}

/**
 * Create personal ranking embed
 */
async function createPersonalRankingEmbed(
  data: SessionRankingData[],
  userId: string
): Promise<EmbedBuilder> {
  const userStats = data.find(u => u.userId === userId);
  
  const embed = new EmbedBuilder()
    .setTitle('👤 Seu Ranking Pessoal')
    .setColor(0x0099ff)
    .setTimestamp();

  if (!userStats) {
    embed.setDescription('❌ Você ainda não possui dados de sessão registrados.');
    return embed;
  }

  const hours = Math.floor(userStats.totalDuration / 60);
  const minutes = userStats.totalDuration % 60;
  
  let description = `**🏆 Posição:** ${userStats.rank}º lugar\n`;
  description += `**📊 Pontos:** ${userStats.points}\n\n`;
  
  description += `**📈 Estatísticas:**\n`;
  description += `• 🎮 **Sessões Totais:** ${userStats.totalSessions}\n`;
  description += `• ⏱️ **Tempo Total:** ${hours}h ${minutes}m\n`;
  description += `• 📊 **Média por Sessão:** ${userStats.averageDuration} minutos\n`;
  description += `• 🔥 **Streak Atual:** ${userStats.streak}\n`;
  description += `• 📅 **Última Sessão:** <t:${Math.floor(userStats.lastSession.getTime() / 1000)}:R>\n\n`;
  
  description += `**🎯 Sessões por Tipo:**\n`;
  description += `• 🎯 **MM:** ${userStats.sessionTypes.mm}\n`;
  description += `• ⚔️ **Scrim:** ${userStats.sessionTypes.scrim}\n`;
  description += `• 🏆 **Campeonato:** ${userStats.sessionTypes.campeonato}\n`;
  description += `• 🎖️ **Ranked:** ${userStats.sessionTypes.ranked}\n\n`;
  
  // Show position relative to others
  if (userStats.rank > 1) {
    const userAbove = data[userStats.rank - 2];
    if (userAbove) {
      const pointsDiff = userAbove.points - userStats.points;
      description += `📈 **Para subir:** ${pointsDiff} pontos (${userAbove.username})\n`;
    }
  }
  
  if (userStats.rank < data.length) {
    const userBelow = data[userStats.rank];
    if (userBelow) {
      const pointsLead = userStats.points - userBelow.points;
      description += `📉 **Vantagem:** ${pointsLead} pontos sobre ${userBelow.username}\n`;
    }
  }

  embed.setDescription(description);
  return embed;
}

export default sessionRanking;