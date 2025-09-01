import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';
import { HawkComponentFactory } from '../../utils/hawk-component-factory';
import { HAWK_EMOJIS } from '../../constants/hawk-emojis';
import { DatabaseService } from '../../database/database.service';
import { BaseCommand } from '../../utils/base-command.util';

/**
 * Economy command - Shows user economy stats and leaderboards
 */
class EconomyCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription(`${HAWK_EMOJIS.ECONOMY.MONEY} Visualize informações de economia e XP`)
        .addSubcommand(subcommand =>
          subcommand
            .setName('perfil')
            .setDescription('Mostra suas informações de economia')
            .addUserOption(option =>
              option
                .setName('usuario')
                .setDescription('Ver economia de outro usuário')
                .setRequired(false),
            ),
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('ranking')
            .setDescription('Ranking de economia')
            .addStringOption(option =>
              option
                .setName('tipo')
                .setDescription('Tipo de ranking')
                .setRequired(true)
                .addChoices(
                  { name: `${HAWK_EMOJIS.SYSTEM.STAR} XP`, value: 'xp' },
                  { name: `${HAWK_EMOJIS.ECONOMY.COIN} Moedas`, value: 'coins' },
                  { name: `${HAWK_EMOJIS.SYSTEM.LEVEL} Nível`, value: 'level' },
                ),
            )
            .addIntegerOption(option =>
              option
                .setName('limite')
                .setDescription('Número de usuários no ranking (padrão: 10)')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(25),
            ),
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('historico')
            .setDescription('Histórico de transações')
            .addIntegerOption(option =>
              option
                .setName('limite')
                .setDescription('Número de transações (padrão: 10)')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(50),
            ),
        )
        .addSubcommand(subcommand =>
          subcommand.setName('daily').setDescription('Resgatar recompensa diária'),
        ) as SlashCommandBuilder,
      category: CommandCategory.ECONOMY,
      cooldown: 5,
    });
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const database = client.database;

    try {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'perfil':
          await this.handleEconomyProfile(interaction, database);
          break;
        case 'ranking':
          await this.handleEconomyRanking(interaction, database, client);
          break;
        case 'historico':
          await this.handleTransactionHistory(interaction, database);
          break;
        case 'daily':
          await this.handleDailyReward(interaction, database);
          break;
      }
    } catch (error) {
      this.logger.error('Error in economy command:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar o comando de economia.')
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  }

  /**
   * Handle "perfil" subcommand - Show user's economy profile
   */
  private async handleEconomyProfile(interaction: ChatInputCommandInteraction, database: DatabaseService) {
  const targetUser = interaction.options.getUser('usuario') || interaction.user;
  const userId = targetUser.id;

  await interaction.deferReply();

  try {
    // Get user data
    const userData = await database.users.findById(userId);

    if (!userData) {
      const embed = HawkEmbedBuilder.createError(
        `${HAWK_EMOJIS.ERROR} Usuário não encontrado`,
        'Este usuário não está registrado no sistema.',
      );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Calculate level from XP
    const level = this.calculateLevel(userData.xp || 0);
    const currentLevelXP = this.calculateXPForLevel(level);
    const nextLevelXP = this.calculateXPForLevel(level + 1);
    const progressXP = (userData.xp || 0) - currentLevelXP;
    const neededXP = nextLevelXP - currentLevelXP;
    const progressPercentage = Math.floor((progressXP / neededXP) * 100);

    // Create progress bar
    const progressBar = this.createProgressBar(progressPercentage);

    const embed = HawkEmbedBuilder.createSuccess(
      `${HAWK_EMOJIS.ECONOMY.MONEY} Economia de ${targetUser.username}`,
      '',
    )
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: `${HAWK_EMOJIS.SYSTEM.LEVEL} Nível`, value: `**${level}**`, inline: true },
        { name: `${HAWK_EMOJIS.SYSTEM.STAR} XP Total`, value: `**${userData.xp || 0}**`, inline: true },
        { name: `${HAWK_EMOJIS.ECONOMY.COIN} Moedas`, value: `**${userData.coins || 0}**`, inline: true },
        {
          name: `${HAWK_EMOJIS.SYSTEM.PROGRESS} Progresso para o próximo nível`,
          value: `${progressBar}\n**${progressXP}**/${neededXP} XP (${progressPercentage}%)`,
          inline: false,
        },
      );

    // Add recent activity if available
    const recentTransactions = await database.client.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    if (recentTransactions.length > 0) {
      const activityText = recentTransactions
        .map(tx => {
          const sign = tx.amount >= 0 ? '+' : '';
          const emoji = tx.type === 'xp' ? HAWK_EMOJIS.SYSTEM.STAR : HAWK_EMOJIS.ECONOMY.COIN;
          return `${emoji} ${sign}${tx.amount} - ${tx.reason}`;
        })
        .join('\n');

      embed.addFields({
        name: `${HAWK_EMOJIS.SYSTEM.ACTIVITY} Atividade Recente`,
        value: activityText,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    this.logger.error('Error fetching economy profile:', error);
    throw error;
  }
  }

  /**
   * Handle "ranking" subcommand - Show economy leaderboard
   */
  private async handleEconomyRanking(
    interaction: ChatInputCommandInteraction,
    database: DatabaseService,
    client: ExtendedClient,
  ) {
  const type = interaction.options.getString('tipo');
  const limit = interaction.options.getInteger('limite') || 10;

  await interaction.deferReply();

  try {
    let orderBy: any;
    let title: string;
    let emoji: string;

    switch (type) {
      case 'xp':
        orderBy = { xp: 'desc' };
        title = `${HAWK_EMOJIS.SYSTEM.STAR} Ranking de XP`;
        emoji = HAWK_EMOJIS.SYSTEM.STAR;
        break;
      case 'coins':
        orderBy = { coins: 'desc' };
        title = `${HAWK_EMOJIS.ECONOMY.COIN} Ranking de Moedas`;
        emoji = HAWK_EMOJIS.ECONOMY.COIN;
        break;
      case 'level':
        orderBy = { xp: 'desc' }; // Level is calculated from XP
        title = `${HAWK_EMOJIS.SYSTEM.LEVEL} Ranking de Nível`;
        emoji = HAWK_EMOJIS.SYSTEM.LEVEL;
        break;
      default:
        throw new Error('Invalid ranking type');
    }

    const users = await database.client.user.findMany({
      orderBy,
      take: limit,
      select: {
        id: true,
        xp: true,
        coins: true,
      },
    });

    if (users.length === 0) {
      const embed = HawkEmbedBuilder.createWarning(
        title,
        'Nenhum usuário encontrado no ranking.',
      );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = HawkEmbedBuilder.createInfo(
      title,
      `Top ${limit} usuários`,
    );

    const rankingText = await Promise.all(
      users.map(async (user, index) => {
        try {
          const discordUser = await client.users.fetch(user.id);
          const medal = index < 3 ? [HAWK_EMOJIS.FIRST_PLACE, HAWK_EMOJIS.SECOND_PLACE, HAWK_EMOJIS.THIRD_PLACE][index] : `${index + 1}º`;

          let value: string;
          switch (type) {
            case 'xp':
              value = `${user.xp || 0} XP`;
              break;
            case 'coins':
              value = `${user.coins || 0} moedas`;
              break;
            case 'level':
              const level = this.calculateLevel(user.xp || 0);
              value = `Nível ${level} (${user.xp || 0} XP)`;
              break;
            default:
              value = '0';
          }

          return `${medal} **${discordUser.username}** - ${value}`;
        } catch {
          return `${index + 1}º **Usuário Desconhecido** - 0`;
        }
      }),
    );

    embed.addFields({
      name: `${HAWK_EMOJIS.SYSTEM.RANKING} Ranking`,
      value: rankingText.join('\n'),
      inline: false,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    this.logger.error('Error fetching economy ranking:', error);
    throw error;
  }
  }

  /**
   * Handle "historico" subcommand - Show transaction history
   */
  private async handleTransactionHistory(
    interaction: ChatInputCommandInteraction,
    database: DatabaseService,
  ) {
  const limit = interaction.options.getInteger('limite') || 10;
  const userId = interaction.user.id;

  await interaction.deferReply();

  try {
    const transactions = await database.client.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (transactions.length === 0) {
      const embed = HawkEmbedBuilder.createWarning(
        `${HAWK_EMOJIS.SYSTEM.ACTIVITY} Histórico de Transações`,
        'Você ainda não possui transações registradas.',
      );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = HawkEmbedBuilder.createInfo(
      `${HAWK_EMOJIS.SYSTEM.ACTIVITY} Histórico de Transações`,
      `Últimas ${transactions.length} transações`,
    );

    const transactionText = transactions
      .map(tx => {
        const date = new Date(tx.createdAt).toLocaleDateString('pt-BR');
        const sign = tx.amount >= 0 ? '+' : '';
        const emoji = tx.type === 'xp' ? HAWK_EMOJIS.SYSTEM.STAR : HAWK_EMOJIS.ECONOMY.COIN;
        const typeText = tx.type === 'xp' ? 'XP' : 'Moedas';

        return `${emoji} **${sign}${tx.amount}** ${typeText}\n*${tx.reason}* • ${date}`;
      })
      .join('\n\n');

    // Split into multiple fields if too long
    if (transactionText.length > 1024) {
      const chunks = transactionText.match(/[\s\S]{1,1024}/g) || [];
      chunks.forEach((chunk, index) => {
        embed.addFields({
          name: index === 0 ? `${HAWK_EMOJIS.ECONOMY.TRANSACTION} Transações` : '\u200b',
          value: chunk,
          inline: false,
        });
      });
    } else {
      embed.addFields({
        name: `${HAWK_EMOJIS.ECONOMY.TRANSACTION} Transações`,
        value: transactionText,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    this.logger.error('Error fetching transaction history:', error);
    throw error;
  }
  }

  /**
   * Handle "daily" subcommand - Claim daily reward
   */
  private async handleDailyReward(interaction: ChatInputCommandInteraction, database: DatabaseService) {
  const userId = interaction.user.id;

  await interaction.deferReply();

  try {
    // Check if user already claimed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingClaim = await database.client.transaction.findFirst({
      where: {
        userId,
        reason: 'Daily reward',
        createdAt: {
          gte: today,
        },
      },
    });

    if (existingClaim) {
      const embed = HawkEmbedBuilder.createWarning(
        `${HAWK_EMOJIS.SYSTEM.TIME} Recompensa Diária`,
        'Você já resgatou sua recompensa diária hoje!\n\nVolte amanhã para resgatar novamente.',
      );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Calculate streak
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayClaim = await database.client.transaction.findFirst({
      where: {
        userId,
        reason: 'Daily reward',
        createdAt: {
          gte: yesterday,
          lt: today,
        },
      },
    });

    // Get current streak from user data or calculate
    const userData = await database.users.findById(userId);
    let currentStreak = 1;

    if (yesterdayClaim && userData?.dailyStreak) {
      currentStreak = userData.dailyStreak + 1;
    }

    // Calculate rewards based on streak
    const baseXP = 50;
    const baseCoins = 25;
    const streakMultiplier = Math.min(currentStreak * 0.1, 2); // Max 2x multiplier

    const xpReward = Math.floor(baseXP * (1 + streakMultiplier));
    const coinReward = Math.floor(baseCoins * (1 + streakMultiplier));

    // Award rewards
    await database.users.updateXP(userId, xpReward);
    await database.users.updateCoins(userId, coinReward, 'Daily reward');

    // Update streak in user data
    await database.client.user.update({
      where: { id: userId },
      data: {
        dailyStreak: currentStreak,
        lastDaily: new Date(),
      },
    });

    // Update coins using the database service method (handles transaction creation)
    await database.users.updateCoins(userId, coinReward, 'Daily reward');

    // Update XP using the database service method
    await database.users.updateXP(userId, xpReward);

    const embed = HawkEmbedBuilder.createSuccess(
      `${HAWK_EMOJIS.ECONOMY.REWARD} Recompensa Diária Resgatada!`,
      'Parabéns! Você resgatou sua recompensa diária.',
    )
      .addFields(
        { name: `${HAWK_EMOJIS.SYSTEM.STAR} XP Ganho`, value: `+${xpReward} XP`, inline: true },
        { name: `${HAWK_EMOJIS.ECONOMY.COIN} Moedas Ganhas`, value: `+${coinReward} moedas`, inline: true },
        { name: `${HAWK_EMOJIS.SYSTEM.STREAK} Sequência`, value: `${currentStreak} dias`, inline: true },
      )
      .setFooter({ text: 'Volte amanhã para continuar sua sequência!' });

    if (currentStreak > 1) {
      embed.addFields({
        name: `${HAWK_EMOJIS.SYSTEM.BOOST} Bônus de Sequência`,
        value: `+${Math.floor(streakMultiplier * 100)}% de bônus por ${currentStreak} dias consecutivos!`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    this.logger.info(
      `Daily reward claimed by user ${userId}: ${xpReward} XP, ${coinReward} coins (streak: ${currentStreak})`,
    );
  } catch (error) {
    this.logger.error('Error claiming daily reward:', error);
    throw error;
  }
  }

  /**
   * Calculate level from XP
   */
  private calculateLevel(xp: number): number {
    // Level formula: level = floor(sqrt(xp / 100))
    // This means: Level 1 = 100 XP, Level 2 = 400 XP, Level 3 = 900 XP, etc.
    return Math.floor(Math.sqrt(xp / 100)) + 1;
  }

  /**
   * Calculate XP required for a specific level
   */
  private calculateXPForLevel(level: number): number {
    // XP formula: xp = (level - 1)^2 * 100
    return Math.pow(level - 1, 2) * 100;
  }

  /**
   * Create a progress bar
   */
  private createProgressBar(percentage: number, length: number = 10): string {
    const filled = Math.floor((percentage / 100) * length);
    const empty = length - filled;

    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}

// Create instance and export
const commandInstance = new EconomyCommand();

export const command = {
  data: commandInstance.data,
  category: commandInstance.category,
  cooldown: commandInstance.cooldown,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) => 
    commandInstance.execute(interaction, client),
};

// Utility function exports for compatibility
export function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function calculateXPForLevel(level: number): number {
  return Math.pow(level - 1, 2) * 100;
}

export function createProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.floor((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export default command;
