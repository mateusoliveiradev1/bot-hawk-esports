import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { DatabaseService } from '../../database/database.service';

/**
 * Economy command - Shows user economy stats and leaderboards
 */
const economy: Command = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('💰 Visualize informações de economia e XP')
    .addSubcommand(subcommand =>
      subcommand
        .setName('perfil')
        .setDescription('Mostra suas informações de economia')
        .addUserOption(option =>
          option.setName('usuario')
            .setDescription('Ver economia de outro usuário')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ranking')
        .setDescription('Ranking de economia')
        .addStringOption(option =>
          option.setName('tipo')
            .setDescription('Tipo de ranking')
            .setRequired(true)
            .addChoices(
              { name: '⭐ XP', value: 'xp' },
              { name: '💰 Moedas', value: 'coins' },
              { name: '📊 Nível', value: 'level' }
            )
        )
        .addIntegerOption(option =>
          option.setName('limite')
            .setDescription('Número de usuários no ranking (padrão: 10)')
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(25)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('historico')
        .setDescription('Histórico de transações')
        .addIntegerOption(option =>
          option.setName('limite')
            .setDescription('Número de transações (padrão: 10)')
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(50)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('daily')
        .setDescription('Resgatar recompensa diária')
    ) as SlashCommandBuilder,
  
  category: CommandCategory.ECONOMY,
  cooldown: 5,
  
  async execute(interaction: any, client: ExtendedClient) {
    const logger = new Logger();
    const database = new DatabaseService();
    
    try {
      const subcommand = interaction.options.getSubcommand();
      
      switch (subcommand) {
        case 'perfil':
          await handleEconomyProfile(interaction, database, logger);
          break;
        case 'ranking':
          await handleEconomyRanking(interaction, database, client, logger);
          break;
        case 'historico':
          await handleTransactionHistory(interaction, database, logger);
          break;
        case 'daily':
          await handleDailyReward(interaction, database, logger);
          break;
      }
    } catch (error) {
      logger.error('Error in economy command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar o comando de economia.')
        .setTimestamp();
      
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
};

/**
 * Handle "perfil" subcommand - Show user's economy profile
 */
async function handleEconomyProfile(
  interaction: any,
  database: DatabaseService,
  logger: Logger
) {
  const targetUser = interaction.options.getUser('usuario') || interaction.user;
  const userId = targetUser.id;
  
  await interaction.deferReply();
  
  try {
    // Get user data
    const userData = await database.users.findById(userId);
    
    if (!userData) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Usuário não encontrado')
        .setDescription('Este usuário não está registrado no sistema.')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    // Calculate level from XP
    const level = calculateLevel(userData.xp || 0);
    const currentLevelXP = calculateXPForLevel(level);
    const nextLevelXP = calculateXPForLevel(level + 1);
    const progressXP = (userData.xp || 0) - currentLevelXP;
    const neededXP = nextLevelXP - currentLevelXP;
    const progressPercentage = Math.floor((progressXP / neededXP) * 100);
    
    // Create progress bar
    const progressBar = createProgressBar(progressPercentage);
    
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle(`💰 Economia de ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: '📊 Nível', value: `**${level}**`, inline: true },
        { name: '⭐ XP Total', value: `**${userData.xp || 0}**`, inline: true },
        { name: '💰 Moedas', value: `**${userData.coins || 0}**`, inline: true },
        { 
          name: '📈 Progresso para o próximo nível', 
          value: `${progressBar}\n**${progressXP}**/${neededXP} XP (${progressPercentage}%)`, 
          inline: false 
        }
      )
      .setTimestamp();
    
    // Add recent activity if available
    const recentTransactions = await database.client.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3
    });
    
    if (recentTransactions.length > 0) {
      const activityText = recentTransactions
        .map(tx => {
          const sign = tx.amount >= 0 ? '+' : '';
          const emoji = tx.type === 'xp' ? '⭐' : '💰';
          return `${emoji} ${sign}${tx.amount} - ${tx.reason}`;
        })
        .join('\n');
      
      embed.addFields({
        name: '📋 Atividade Recente',
        value: activityText,
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    logger.error('Error fetching economy profile:', error);
    throw error;
  }
}

/**
 * Handle "ranking" subcommand - Show economy leaderboard
 */
async function handleEconomyRanking(
  interaction: any,
  database: DatabaseService,
  client: ExtendedClient,
  logger: Logger
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
        title = '⭐ Ranking de XP';
        emoji = '⭐';
        break;
      case 'coins':
        orderBy = { coins: 'desc' };
        title = '💰 Ranking de Moedas';
        emoji = '💰';
        break;
      case 'level':
        orderBy = { xp: 'desc' }; // Level is calculated from XP
        title = '📊 Ranking de Nível';
        emoji = '📊';
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
        coins: true
      }
    });
    
    if (users.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle(title)
        .setDescription('Nenhum usuário encontrado no ranking.')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor('#ffd700')
      .setTitle(title)
      .setDescription(`Top ${limit} usuários`)
      .setTimestamp();
    
    const rankingText = await Promise.all(
      users.map(async (user, index) => {
        try {
          const discordUser = await client.users.fetch(user.id);
          const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}º`;
          
          let value: string;
          switch (type) {
            case 'xp':
              value = `${user.xp || 0} XP`;
              break;
            case 'coins':
              value = `${user.coins || 0} moedas`;
              break;
            case 'level':
              const level = calculateLevel(user.xp || 0);
              value = `Nível ${level} (${user.xp || 0} XP)`;
              break;
            default:
              value = '0';
          }
          
          return `${medal} **${discordUser.username}** - ${value}`;
        } catch {
          return `${index + 1}º **Usuário Desconhecido** - 0`;
        }
      })
    );
    
    embed.addFields({
      name: '📊 Ranking',
      value: rankingText.join('\n'),
      inline: false
    });
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    logger.error('Error fetching economy ranking:', error);
    throw error;
  }
}

/**
 * Handle "historico" subcommand - Show transaction history
 */
async function handleTransactionHistory(
  interaction: any,
  database: DatabaseService,
  logger: Logger
) {
  const limit = interaction.options.getInteger('limite') || 10;
  const userId = interaction.user.id;
  
  await interaction.deferReply();
  
  try {
    const transactions = await database.client.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    
    if (transactions.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('📋 Histórico de Transações')
        .setDescription('Você ainda não possui transações registradas.')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('📋 Histórico de Transações')
      .setDescription(`Últimas ${transactions.length} transações`)
      .setTimestamp();
    
    const transactionText = transactions
      .map(tx => {
        const date = new Date(tx.createdAt).toLocaleDateString('pt-BR');
        const sign = tx.amount >= 0 ? '+' : '';
        const emoji = tx.type === 'xp' ? '⭐' : '💰';
        const typeText = tx.type === 'xp' ? 'XP' : 'Moedas';
        
        return `${emoji} **${sign}${tx.amount}** ${typeText}\n*${tx.reason}* • ${date}`;
      })
      .join('\n\n');
    
    // Split into multiple fields if too long
    if (transactionText.length > 1024) {
      const chunks = transactionText.match(/[\s\S]{1,1024}/g) || [];
      chunks.forEach((chunk, index) => {
        embed.addFields({
          name: index === 0 ? '💳 Transações' : '\u200b',
          value: chunk,
          inline: false
        });
      });
    } else {
      embed.addFields({
        name: '💳 Transações',
        value: transactionText,
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    logger.error('Error fetching transaction history:', error);
    throw error;
  }
}

/**
 * Handle "daily" subcommand - Claim daily reward
 */
async function handleDailyReward(
  interaction: any,
  database: DatabaseService,
  logger: Logger
) {
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
          gte: today
        }
      }
    });
    
    if (existingClaim) {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('⏰ Recompensa Diária')
        .setDescription('Você já resgatou sua recompensa diária hoje!\n\nVolte amanhã para resgatar novamente.')
        .setTimestamp();
      
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
          lt: today
        }
      }
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
        lastDaily: new Date()
      }
    });
    
    // Update coins using the database service method (handles transaction creation)
    await database.users.updateCoins(userId, coinReward, 'Daily reward');
    
    // Update XP using the database service method
    await database.users.updateXP(userId, xpReward);
    
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🎁 Recompensa Diária Resgatada!')
      .setDescription(`Parabéns! Você resgatou sua recompensa diária.`)
      .addFields(
        { name: '⭐ XP Ganho', value: `+${xpReward} XP`, inline: true },
        { name: '💰 Moedas Ganhas', value: `+${coinReward} moedas`, inline: true },
        { name: '🔥 Sequência', value: `${currentStreak} dias`, inline: true }
      )
      .setFooter({ text: 'Volte amanhã para continuar sua sequência!' })
      .setTimestamp();
    
    if (currentStreak > 1) {
      embed.addFields({
        name: '🚀 Bônus de Sequência',
        value: `+${Math.floor(streakMultiplier * 100)}% de bônus por ${currentStreak} dias consecutivos!`,
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
    
    logger.info(`Daily reward claimed by user ${userId}: ${xpReward} XP, ${coinReward} coins (streak: ${currentStreak})`);
    
  } catch (error) {
    logger.error('Error claiming daily reward:', error);
    throw error;
  }
}

/**
 * Calculate level from XP
 */
function calculateLevel(xp: number): number {
  // Level formula: level = floor(sqrt(xp / 100))
  // This means: Level 1 = 100 XP, Level 2 = 400 XP, Level 3 = 900 XP, etc.
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Calculate XP required for a specific level
 */
function calculateXPForLevel(level: number): number {
  // XP formula: xp = (level - 1)^2 * 100
  return Math.pow(level - 1, 2) * 100;
}

/**
 * Create a progress bar
 */
function createProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.floor((percentage / 100) * length);
  const empty = length - filled;
  
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export default economy;