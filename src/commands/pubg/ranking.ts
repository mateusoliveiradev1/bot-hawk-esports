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
import { BaseCommand } from '../../utils/base-command.util';

const logger = new Logger();

class RankingCommand extends BaseCommand {
  private rankingService: RankingService;

  constructor() {
    super({
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
              { name: '🎯 Jogos', value: 'games' },
            ),
        )
        .addIntegerOption(option =>
          option
            .setName('page')
            .setDescription('Página do ranking (padrão: 1)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50),
        )
        .addBooleanOption(option =>
          option
            .setName('public')
            .setDescription('Tornar a resposta pública (padrão: privado)')
            .setRequired(false),
        ) as SlashCommandBuilder,
      category: CommandCategory.PUBG,
      cooldown: 15,
    });
    // RankingService will be initialized in execute method with client
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    this.rankingService = new RankingService(client);
    const databaseService = client.database;
    try {
      try {
        this.validateGuildContext(interaction);
      } catch (error) {
        await this.sendGuildOnlyError(interaction);
        return;
      }

      const rankingType = interaction.options.getString('type', true);
      const page = interaction.options.getInteger('page') || 1;
      const isPublic = interaction.options.getBoolean('public') || false;

      await interaction.deferReply({ ephemeral: !isPublic });

      const embed = await this.getRankingEmbed(
        rankingType,
        page,
        interaction.guildId!,
        interaction.user.id,
        client,
      );
      const components = this.createRankingComponents(rankingType, page, embed);

      const response = await interaction.editReply({
        embeds: [embed],
        components,
      });

      await this.handleRankingInteractions(response, interaction, client, rankingType);
    } catch (error) {
      await this.handleRankingError(
        error,
        interaction,
        client,
        interaction.options.getString('type', true),
      );
    }
  }

  private async getRankingEmbed(
    rankingType: string,
    page: number,
    guildId: string,
    userId: string,
    client: ExtendedClient,
  ): Promise<EmbedBuilder> {
    const limit = 10;
    const offset = (page - 1) * limit;
    let rankingData: any[] = [];
    let totalCount = 0;
    let embed: EmbedBuilder;

    switch (rankingType) {
      case 'pubg_daily':
      case 'pubg_weekly':
      case 'pubg_monthly':
        const period = rankingType.split('_')[1] as 'daily' | 'weekly' | 'monthly';
        try {
          const periodObj = {
            type: period,
            startDate: new Date(
              Date.now() -
                (period === 'daily'
                  ? 24 * 60 * 60 * 1000
                  : period === 'weekly'
                    ? 7 * 24 * 60 * 60 * 1000
                    : 30 * 24 * 60 * 60 * 1000),
            ),
            endDate: new Date(),
          } as any;
          const pubgRanking = this.rankingService.getPUBGRanking(
            guildId,
            periodObj,
            undefined,
            'rankPoints',
            limit,
          );
          rankingData = pubgRanking;
          totalCount = pubgRanking.length;
          embed = await this.createPUBGRankingEmbed(rankingData, period, page, totalCount, userId);
        } catch (error) {
          logger.error(`Error fetching PUBG ${period} ranking:`, error);
          throw new Error(`Erro ao buscar ranking PUBG ${period}. Tente novamente mais tarde.`);
        }
        break;

      case 'internal_xp':
        try {
          const allTimePeriod = {
            type: 'all_time',
            startDate: new Date(0),
            endDate: new Date(),
          } as any;
          const xpRanking = this.rankingService.getInternalRanking(
            guildId,
            allTimePeriod,
            'xp',
            limit,
          );
          rankingData = xpRanking;
          totalCount = xpRanking.length;
          embed = await this.createInternalRankingEmbed(
            rankingData,
            'XP',
            page,
            totalCount,
            userId,
            client,
          );
        } catch (error) {
          logger.error('Error fetching XP ranking:', error);
          throw new Error('Erro ao buscar ranking de XP. Tente novamente mais tarde.');
        }
        break;

      case 'internal_coins':
        try {
          const allTimePeriod = {
            type: 'all_time',
            startDate: new Date(0),
            endDate: new Date(),
          } as any;
          const coinsRanking = this.rankingService.getInternalRanking(
            guildId,
            allTimePeriod,
            'coins',
            limit,
          );
          rankingData = coinsRanking;
          totalCount = coinsRanking.length;
          embed = await this.createInternalRankingEmbed(
            rankingData,
            'Moedas',
            page,
            totalCount,
            userId,
            client,
          );
        } catch (error) {
          logger.error('Error fetching coins ranking:', error);
          throw new Error('Erro ao buscar ranking de moedas. Tente novamente mais tarde.');
        }
        break;

      case 'internal_badges':
        try {
          const allTimePeriod = {
            type: 'all_time',
            startDate: new Date(0),
            endDate: new Date(),
          } as any;
          const badgesRanking = this.rankingService.getInternalRanking(
            guildId,
            allTimePeriod,
            'badgeCount',
            limit,
          );
          rankingData = badgesRanking;
          totalCount = badgesRanking.length;
          embed = await this.createInternalRankingEmbed(
            rankingData,
            'Badges',
            page,
            totalCount,
            userId,
            client,
          );
        } catch (error) {
          logger.error('Error fetching badges ranking:', error);
          throw new Error('Erro ao buscar ranking de badges. Tente novamente mais tarde.');
        }
        break;

      case 'presence':
        const presenceRanking = await this.getPresenceRanking(guildId, limit, offset);
        rankingData = (presenceRanking as any).rankings || [];
        totalCount = (presenceRanking as any).total || 0;
        embed = await this.createPresenceRankingEmbed(
          rankingData,
          page,
          totalCount,
          userId,
          client,
        );
        break;

      case 'music':
        const musicRanking = await this.getMusicRanking(guildId, limit, offset);
        rankingData = musicRanking.rankings;
        totalCount = musicRanking.total;
        embed = await this.createActivityRankingEmbed(
          rankingData,
          'Música',
          page,
          totalCount,
          userId,
          client,
          '🎵',
        );
        break;

      case 'games':
        const gamesRanking = await this.getGamesRanking(guildId, limit, offset);
        rankingData = gamesRanking.rankings;
        totalCount = gamesRanking.total;
        embed = await this.createActivityRankingEmbed(
          rankingData,
          'Jogos',
          page,
          totalCount,
          userId,
          client,
          '🎯',
        );
        break;

      default:
        throw new Error('Tipo de ranking inválido');
    }

    return embed;
  }

  private createRankingComponents(rankingType: string, page: number, embed: EmbedBuilder): any[] {
    const buttonsRow = new ActionRowBuilder<ButtonBuilder>();
    const totalCount = this.extractTotalFromEmbed(embed);
    const limit = 10;
    const offset = (page - 1) * limit;

    if (page > 1) {
      buttonsRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`ranking_${rankingType}_${page - 1}`)
          .setLabel('◀️ Anterior')
          .setStyle(ButtonStyle.Primary),
      );
    }

    buttonsRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`ranking_${rankingType}_refresh`)
        .setLabel('🔄 Atualizar')
        .setStyle(ButtonStyle.Secondary),
    );

    if (offset + limit < totalCount) {
      buttonsRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`ranking_${rankingType}_${page + 1}`)
          .setLabel('Próxima ▶️')
          .setStyle(ButtonStyle.Primary),
      );
    }

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
        ]),
    );

    return [selectRow, buttonsRow];
  }

  private async handleRankingInteractions(
    response: any,
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
    rankingType: string,
  ): Promise<void> {
    const collector = response.createMessageComponentCollector({ time: 300000 });

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
        await i.deferUpdate();
        const newEmbed = await this.getRankingEmbed(
          newType,
          1,
          interaction.guildId!,
          interaction.user.id,
          client,
        );
        const newComponents = this.createRankingComponents(newType, 1, newEmbed);
        await i.editReply({ embeds: [newEmbed], components: newComponents });
      }

      if (i.isButton()) {
        const [, type, action] = i.customId.split('_');
        await i.deferUpdate();

        if (action === 'refresh') {
          const currentPage = this.extractPageFromComponents(i.message.components);
          const refreshedEmbed = await this.getRankingEmbed(
            type,
            currentPage,
            interaction.guildId!,
            interaction.user.id,
            client,
          );
          const refreshedComponents = this.createRankingComponents(
            type,
            currentPage,
            refreshedEmbed,
          );
          await i.editReply({ embeds: [refreshedEmbed], components: refreshedComponents });
        } else {
          const newPage = parseInt(action || '1');
          const newEmbed = await this.getRankingEmbed(
            type,
            newPage,
            interaction.guildId!,
            interaction.user.id,
            client,
          );
          const newComponents = this.createRankingComponents(type, newPage, newEmbed);
          await i.editReply({ embeds: [newEmbed], components: newComponents });
        }
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }

  private async handleRankingError(
    error: any,
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
    rankingType: string,
  ): Promise<void> {
    logger.error('Ranking command error:', error);

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
          command: 'ranking',
        },
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

  private async createPUBGRankingEmbed(
    rankings: any[],
    period: 'daily' | 'weekly' | 'monthly',
    page: number,
    total: number,
    userId: string,
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
      embed.setDescription('📊 Nenhum dado de ranking encontrado para este período.');
      return embed;
    }

    const startIndex = (page - 1) * 10;
    let description = '';
    let userPosition = -1;

    rankings.forEach((player, index) => {
      const position = startIndex + index + 1;
      const medal = this.getMedalEmoji(position);
      const kda = ((player.kills + player.assists) / Math.max(player.deaths, 1)).toFixed(2);
      const winRate = ((player.wins / Math.max(player.matches, 1)) * 100).toFixed(1);

      if (player.userId === userId) {
        userPosition = position;
      }

      description += `${medal} **${position}.** <@${player.userId}>\n`;
      description += `   📊 **${player.rating}** pts | 🎯 **${kda}** KDA | 🏆 **${winRate}%** WR\n`;
      description += `   🔫 ${player.kills}K | 💀 ${player.deaths}D | 🤝 ${player.assists}A | 🎮 ${player.matches}M\n\n`;
    });

    embed.setDescription(description);

    if (userPosition > 0) {
      embed.addFields({
        name: '👤 Sua Posição',
        value: `Você está em **${userPosition}º lugar** no ranking ${periodNames[period].toLowerCase()}!`,
        inline: false,
      });
    }

    embed.setFooter({
      text: `Página ${page} • Total: ${total} jogadores • Atualizado`,
    });

    return embed;
  }

  private async createInternalRankingEmbed(
    rankings: any[],
    type: string,
    page: number,
    total: number,
    userId: string,
    client: ExtendedClient,
  ): Promise<EmbedBuilder> {
    const typeEmojis = {
      XP: '⭐',
      Moedas: '💰',
      Badges: '🏅',
    };

    const embed = new EmbedBuilder()
      .setTitle(`${typeEmojis[type as keyof typeof typeEmojis]} Ranking ${type}`)
      .setColor('#4CAF50')
      .setTimestamp();

    if (rankings.length === 0) {
      embed.setDescription(`📊 Nenhum dado de ${type.toLowerCase()} encontrado.`);
      return embed;
    }

    const startIndex = (page - 1) * 10;
    let description = '';
    let userPosition = -1;

    rankings.forEach((user, index) => {
      const position = startIndex + index + 1;
      const medal = this.getMedalEmoji(position);
      let value: string;

      switch (type) {
        case 'XP':
          value = `${user.xp.toLocaleString()} XP`;
          break;
        case 'Moedas':
          value = `${user.coins.toLocaleString()} 💰`;
          break;
        case 'Badges':
          value = `${user.badgeCount} 🏅`;
          break;
        default:
          value = 'N/A';
      }

      if (user.userId === userId) {
        userPosition = position;
      }

      description += `${medal} **${position}.** <@${user.userId}>\n`;
      description += `   ${value}\n\n`;
    });

    embed.setDescription(description);

    if (userPosition > 0) {
      embed.addFields({
        name: '👤 Sua Posição',
        value: `Você está em **${userPosition}º lugar** no ranking de ${type.toLowerCase()}!`,
        inline: false,
      });
    }

    embed.setFooter({
      text: `Página ${page} • Total: ${total} usuários`,
    });

    return embed;
  }

  private async createPresenceRankingEmbed(
    rankings: any[],
    page: number,
    total: number,
    userId: string,
    client: ExtendedClient,
  ): Promise<EmbedBuilder> {
    const embed = new EmbedBuilder()
      .setTitle('⏰ Ranking de Presença')
      .setColor('#9C27B0')
      .setTimestamp();

    if (rankings.length === 0) {
      embed.setDescription('📊 Nenhum dado de presença encontrado.');
      return embed;
    }

    const startIndex = (page - 1) * 10;
    let description = '';
    let userPosition = -1;

    rankings.forEach((user, index) => {
      const position = startIndex + index + 1;
      const medal = this.getMedalEmoji(position);
      const hours = Math.floor(user.totalTime / 3600000);
      const minutes = Math.floor((user.totalTime % 3600000) / 60000);

      if (user.userId === userId) {
        userPosition = position;
      }

      description += `${medal} **${position}.** <@${user.userId}>\n`;
      description += `   ⏰ **${hours}h ${minutes}m** online\n\n`;
    });

    embed.setDescription(description);

    if (userPosition > 0) {
      embed.addFields({
        name: '👤 Sua Posição',
        value: `Você está em **${userPosition}º lugar** no ranking de presença!`,
        inline: false,
      });
    }

    embed.setFooter({
      text: `Página ${page} • Total: ${total} usuários`,
    });

    return embed;
  }

  private async createActivityRankingEmbed(
    rankings: any[],
    type: string,
    page: number,
    total: number,
    userId: string,
    client: ExtendedClient,
    emoji: string,
  ): Promise<EmbedBuilder> {
    const embed = new EmbedBuilder()
      .setTitle(`${emoji} Ranking de ${type}`)
      .setColor('#FF9800')
      .setTimestamp();

    if (rankings.length === 0) {
      embed.setDescription(`📊 Nenhum dado de ${type.toLowerCase()} encontrado.`);
      return embed;
    }

    const startIndex = (page - 1) * 10;
    let description = '';
    let userPosition = -1;

    rankings.forEach((user, index) => {
      const position = startIndex + index + 1;
      const medal = this.getMedalEmoji(position);
      const hours = Math.floor(user.totalTime / 3600000);
      const minutes = Math.floor((user.totalTime % 3600000) / 60000);

      if (user.userId === userId) {
        userPosition = position;
      }

      description += `${medal} **${position}.** <@${user.userId}>\n`;
      description += `   ${emoji} **${hours}h ${minutes}m** em ${type.toLowerCase()}\n\n`;
    });

    embed.setDescription(description);

    if (userPosition > 0) {
      embed.addFields({
        name: '👤 Sua Posição',
        value: `Você está em **${userPosition}º lugar** no ranking de ${type.toLowerCase()}!`,
        inline: false,
      });
    }

    embed.setFooter({
      text: `Página ${page} • Total: ${total} usuários`,
    });

    return embed;
  }

  private getMedalEmoji(position: number): string {
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

  private async getPresenceRanking(guildId: string, limit: number, offset: number) {
    // Implementation would go here - placeholder for now
    return { rankings: [], total: 0 };
  }

  private async getMusicRanking(guildId: string, limit: number, offset: number) {
    // Implementation would go here - placeholder for now
    return { rankings: [], total: 0 };
  }

  private async getGamesRanking(guildId: string, limit: number, offset: number) {
    // Implementation would go here - placeholder for now
    return { rankings: [], total: 0 };
  }

  private extractTotalFromEmbed(embed: EmbedBuilder): number {
    // Extract total count from embed footer - simplified implementation
    return 100; // Placeholder
  }

  private extractPageFromComponents(components: any[]): number {
    // Extract current page from button components - simplified implementation
    return 1; // Placeholder
  }
}

const commandInstance = new RankingCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.PUBG,
  cooldown: 5,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;

// Helper functions for backward compatibility
async function createPUBGRankingEmbed(
  rankings: any[],
  period: 'daily' | 'weekly' | 'monthly',
  page: number,
  total: number,
  userId: string,
): Promise<EmbedBuilder> {
  return (commandInstance as any).createPUBGRankingEmbed(rankings, period, page, total, userId);
}

async function createInternalRankingEmbed(
  rankings: any[],
  type: string,
  page: number,
  total: number,
  userId: string,
  client: ExtendedClient,
): Promise<EmbedBuilder> {
  return (commandInstance as any).createInternalRankingEmbed(
    rankings,
    type,
    page,
    total,
    userId,
    client,
  );
}

async function createPresenceRankingEmbed(
  rankings: any[],
  page: number,
  total: number,
  userId: string,
  client: ExtendedClient,
): Promise<EmbedBuilder> {
  return (commandInstance as any).createPresenceRankingEmbed(rankings, page, total, userId, client);
}

async function createActivityRankingEmbed(
  rankings: any[],
  type: string,
  page: number,
  total: number,
  userId: string,
  client: ExtendedClient,
  emoji: string,
): Promise<EmbedBuilder> {
  return (commandInstance as any).createActivityRankingEmbed(
    rankings,
    type,
    page,
    total,
    userId,
    client,
    emoji,
  );
}

function getMedalEmoji(position: number): string {
  return (commandInstance as any).getMedalEmoji(position);
}

async function getPresenceRanking(guildId: string, limit: number, offset: number) {
  return (commandInstance as any).getPresenceRanking(guildId, limit, offset);
}

async function getMusicRanking(guildId: string, limit: number, offset: number) {
  return (commandInstance as any).getMusicRanking(guildId, limit, offset);
}

async function getGamesRanking(guildId: string, limit: number, offset: number) {
  return (commandInstance as any).getGamesRanking(guildId, limit, offset);
}

async function getRankingEmbed(
  type: string,
  page: number,
  guildId: string,
  userId: string,
  client: ExtendedClient,
): Promise<EmbedBuilder> {
  return (commandInstance as any).getRankingEmbed(type, page, guildId, userId, client);
}

// Export helper functions for backward compatibility
export {
  createPUBGRankingEmbed,
  createInternalRankingEmbed,
  createPresenceRankingEmbed,
  createActivityRankingEmbed,
  getMedalEmoji,
  getPresenceRanking,
  getMusicRanking,
  getGamesRanking,
  getRankingEmbed,
};
