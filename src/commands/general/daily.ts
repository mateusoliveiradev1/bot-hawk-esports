import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { DatabaseService } from '../../database/database.service';
import { BadgeService } from '../../services/badge.service';

/**
 * Daily rewards command - Daily login rewards with streak system
 */
const daily: Command = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('🎁 Resgata sua recompensa diária e vê seu streak de login')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Ação a ser executada')
        .setRequired(false)
        .addChoices(
          { name: '🎁 Resgatar Recompensa', value: 'claim' },
          { name: '📊 Ver Streak', value: 'streak' },
          { name: '🏆 Ranking de Streaks', value: 'leaderboard' },
          { name: '📅 Calendário Mensal', value: 'calendar' }
        )
    ) as SlashCommandBuilder,

  category: CommandCategory.GENERAL,
  cooldown: 5,

  async execute(interaction: any, client: ExtendedClient) {
    const logger = new Logger();
    const database = client.database;
    const xpService = (client as any).xpService;
    const badgeService = (client as any).badgeService;

    try {
      // Check if user is registered
      const user = await database.client.user.findUnique({
        where: { id: interaction.user.id },
        include: {
          stats: true,
        },
      });

      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Usuário Não Registrado')
          .setDescription(
            'Você precisa se registrar primeiro usando `/register` para acessar recompensas diárias!'
          )
          .setColor(0xff0000)
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const action = interaction.options.getString('action') || 'claim';

      switch (action) {
        case 'claim':
          await claimDailyReward(interaction, database, badgeService, user);
          break;
        case 'streak':
          await showStreakInfo(interaction, database, user);
          break;
        case 'leaderboard':
          await showStreakLeaderboard(interaction, database);
          break;
        case 'calendar':
          await showMonthlyCalendar(interaction, database, user);
          break;
        default:
          await claimDailyReward(interaction, database, badgeService, user);
      }
    } catch (error) {
      logger.error('Error in daily command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar sua recompensa diária. Tente novamente.')
        .setColor(0xff0000)
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  },
};

/**
 * Claim daily reward
 */
async function claimDailyReward(
  interaction: ChatInputCommandInteraction,
  database: DatabaseService,
  badgeService: BadgeService,
  user: any
) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastClaim = user.lastDailyReward ? new Date(user.lastDailyReward) : null;
  const lastClaimDate = lastClaim
    ? new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate())
    : null;

  // Check if already claimed today
  if (lastClaimDate && lastClaimDate.getTime() === today.getTime()) {
    const nextClaim = new Date(today);
    nextClaim.setDate(nextClaim.getDate() + 1);
    const timeUntilNext = nextClaim.getTime() - now.getTime();
    const hoursLeft = Math.floor(timeUntilNext / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));

    const embed = new EmbedBuilder()
      .setTitle('⏰ Recompensa Já Resgatada')
      .setDescription(
        'Você já resgatou sua recompensa diária hoje!\n\n' +
          `**Próxima recompensa em:** ${hoursLeft}h ${minutesLeft}m\n` +
          `**Streak atual:** ${user.dailyStreak} dias\n\n` +
          'Use `/daily streak` para ver detalhes do seu streak!'
      )
      .setColor(0xffa500)
      .setTimestamp();

    const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('daily_streak')
        .setLabel('📊 Ver Streak')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('daily_calendar')
        .setLabel('📅 Calendário')
        .setStyle(ButtonStyle.Secondary)
    );

    const response = await interaction.reply({
      embeds: [embed],
      components: [actionButtons],
    });

    setupButtonCollector(response, interaction, database, user);
    return;
  }

  // Calculate streak
  let newStreak = 1;
  if (lastClaimDate) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastClaimDate.getTime() === yesterday.getTime()) {
      // Consecutive day
      newStreak = user.dailyStreak + 1;
    } else {
      // Streak broken
      newStreak = 1;
    }
  }

  // Calculate rewards based on streak
  const baseReward = { xp: 50, coins: 100 };
  const streakMultiplier = Math.min(1 + (newStreak - 1) * 0.1, 3); // Max 3x multiplier at 21 days
  const bonusReward = getStreakBonus(newStreak);

  const totalReward = {
    xp: Math.floor(baseReward.xp * streakMultiplier) + bonusReward.xp,
    coins: Math.floor(baseReward.coins * streakMultiplier) + bonusReward.coins,
  };

  // Update user in database
  const updatedUser = await database.client.user.update({
    where: { id: user.id },
    data: {
      xp: { increment: totalReward.xp },
      coins: { increment: totalReward.coins },
      dailyStreak: newStreak,
      stats: {
        update: {
          commandsUsed: { increment: 1 },
        },
      },
    },
    include: {
      stats: true,
    },
  });

  // Check for streak milestones and award badges
  const milestones = [7, 14, 30, 60, 100, 365];
  const earnedBadges = [];

  for (const milestone of milestones) {
    if (newStreak === milestone) {
      const badgeName = getStreakBadgeName(milestone);
      try {
        await badgeService.awardBadge(user.id, badgeName, true);
        earnedBadges.push(badgeName);
      } catch (error) {
        console.error(`Error awarding streak badge for ${milestone} days:`, error);
      }
    }
  }

  // Create success embed
  const embed = new EmbedBuilder()
    .setTitle('🎁 Recompensa Diária Resgatada!')
    .setDescription(
      '**Recompensas recebidas:**\n' +
        `⭐ +${totalReward.xp} XP\n` +
        `💰 +${totalReward.coins} moedas\n\n` +
        '**Streak de Login:**\n' +
        `🔥 ${newStreak} dias consecutivos\n` +
        `📈 Multiplicador: ${streakMultiplier.toFixed(1)}x\n\n` +
        (bonusReward.xp > 0 || bonusReward.coins > 0
          ? '**Bônus de Streak:**\n' +
            `🎊 +${bonusReward.xp} XP bônus\n` +
            `🎊 +${bonusReward.coins} moedas bônus\n\n`
          : '') +
        (earnedBadges.length > 0
          ? '**🏆 Badges Conquistadas:**\n' +
            earnedBadges.map(badge => `🏅 ${badge}`).join('\n') +
            '\n\n'
          : '') +
        '**Seus Totais:**\n' +
        `📊 Level: ${updatedUser.level}\n` +
        `⭐ XP: ${updatedUser.xp.toLocaleString()}\n` +
        `💰 Moedas: ${updatedUser.coins.toLocaleString()}`
    )
    .setColor(0x00ff00)
    .setFooter({
      text: `Volte amanhã para continuar seu streak! • Streak atual: ${newStreak} dias`,
    })
    .setTimestamp();

  // Add streak milestone info
  const nextMilestone = milestones.find(m => m > newStreak);
  if (nextMilestone) {
    const daysToNext = nextMilestone - newStreak;
    embed.addFields({
      name: '🎯 Próximo Marco',
      value: `${nextMilestone} dias (faltam ${daysToNext} dias)\n🏅 ${getStreakBadgeName(nextMilestone)}`,
      inline: true,
    });
  }

  const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('daily_streak')
      .setLabel('📊 Ver Streak')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('daily_leaderboard')
      .setLabel('🏆 Ranking')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('daily_calendar')
      .setLabel('📅 Calendário')
      .setStyle(ButtonStyle.Secondary)
  );

  const response = await interaction.reply({
    embeds: [embed],
    components: [actionButtons],
  });

  setupButtonCollector(response, interaction, database, updatedUser);
}

/**
 * Show streak information
 */
async function showStreakInfo(interaction: any, database: DatabaseService, user: any) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastClaim = user.lastDailyReward ? new Date(user.lastDailyReward) : null;
  const lastClaimDate = lastClaim
    ? new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate())
    : null;

  // Check if streak is still active
  let streakStatus = 'Ativo';
  let streakEmoji = '🔥';

  if (!lastClaimDate) {
    streakStatus = 'Nunca resgatou';
    streakEmoji = '❌';
  } else {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastClaimDate.getTime() < yesterday.getTime()) {
      streakStatus = 'Quebrado';
      streakEmoji = '💔';
    } else if (lastClaimDate.getTime() === today.getTime()) {
      streakStatus = 'Resgatado hoje';
      streakEmoji = '✅';
    }
  }

  // Calculate next rewards
  const nextStreak = user.dailyStreak + 1;
  const baseReward = { xp: 50, coins: 100 };
  const nextMultiplier = Math.min(1 + (nextStreak - 1) * 0.1, 3);
  const nextBonus = getStreakBonus(nextStreak);
  const nextReward = {
    xp: Math.floor(baseReward.xp * nextMultiplier) + nextBonus.xp,
    coins: Math.floor(baseReward.coins * nextMultiplier) + nextBonus.coins,
  };

  // Find next milestone
  const milestones = [7, 14, 30, 60, 100, 365];
  const nextMilestone = milestones.find(m => m > user.dailyStreak);
  const previousMilestone = milestones.filter(m => m <= user.dailyStreak).pop();

  const embed = new EmbedBuilder()
    .setTitle('📊 Informações do Streak Diário')
    .setDescription(
      '**Status Atual:**\n' +
        `${streakEmoji} Streak: ${user.dailyStreak} dias\n` +
        `📅 Status: ${streakStatus}\n` +
        (lastClaim ? `🕐 Último resgate: ${lastClaim.toLocaleDateString('pt-BR')}\n` : '') +
        `🎁 Recompensas resgatadas: ${user.stats?.dailyRewardsClaimed || 0}\n\n` +
        '**Próxima Recompensa:**\n' +
        `⭐ ${nextReward.xp} XP\n` +
        `💰 ${nextReward.coins} moedas\n` +
        `📈 Multiplicador: ${nextMultiplier.toFixed(1)}x\n\n` +
        (nextMilestone
          ? '**🎯 Próximo Marco:**\n' +
            `🏅 ${nextMilestone} dias (faltam ${nextMilestone - user.dailyStreak})\n` +
            `🏆 Recompensa: ${getStreakBadgeName(nextMilestone)}\n\n`
          : '') +
        (previousMilestone
          ? '**🏆 Último Marco Alcançado:**\n' +
            `🏅 ${previousMilestone} dias\n` +
            `🎖️ ${getStreakBadgeName(previousMilestone)}\n\n`
          : '') +
        '**💡 Dicas:**\n' +
        '• Resgatar diariamente mantém o streak\n' +
        '• Multiplicador aumenta até 3x (21 dias)\n' +
        '• Marcos especiais dão badges exclusivas\n' +
        '• Streaks maiores = recompensas maiores'
    )
    .setColor(user.dailyStreak >= 7 ? 0x00ff00 : user.dailyStreak >= 3 ? 0xffa500 : 0x0099ff)
    .setTimestamp();

  // Add streak progress bar
  if (nextMilestone) {
    const progress = (user.dailyStreak / nextMilestone) * 100;
    const progressBar = createProgressBar(progress);
    embed.addFields({
      name: `📈 Progresso para ${nextMilestone} dias`,
      value: `${progressBar} ${progress.toFixed(1)}%`,
      inline: false,
    });
  }

  const editMethod = interaction.editReply || interaction.reply;
  await editMethod.call(interaction, { embeds: [embed] });
}

/**
 * Show streak leaderboard
 */
async function showStreakLeaderboard(interaction: any, database: DatabaseService) {
  const topUsers = await database.client.user.findMany({
    orderBy: { dailyStreak: 'desc' },
    take: 10,
    select: {
      id: true,
      dailyStreak: true,
      stats: {
        select: {
          commandsUsed: true,
        },
      },
    },
  });

  if (topUsers.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 Ranking de Streaks Diários')
      .setDescription('Nenhum usuário encontrado no ranking.')
      .setColor(0xffa500)
      .setTimestamp();

    const editMethod = interaction.editReply || interaction.reply;
    return editMethod.call(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const leaderboardText = await Promise.all(
    topUsers.map(async (user: any, index: number) => {
      try {
        const discordUser = await interaction.client.users.fetch(user.id);
        const username = discordUser.username || 'Usuário Desconhecido';
        const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;

        // Check if streak is still active
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastClaim = user.lastDailyReward ? new Date(user.lastDailyReward) : null;
        const lastClaimDate = lastClaim
          ? new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate())
          : null;

        let statusEmoji = '🔥';
        if (!lastClaimDate) {
          statusEmoji = '❌';
        } else {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);

          if (lastClaimDate.getTime() < yesterday.getTime()) {
            statusEmoji = '💔';
          } else if (lastClaimDate.getTime() === today.getTime()) {
            statusEmoji = '✅';
          }
        }

        return (
          `${medal} **${username}** ${statusEmoji}\n` +
          `🔥 ${user.dailyStreak} dias • 🎁 ${user.stats?.dailyRewardsClaimed || 0} resgates`
        );
      } catch (error) {
        return `${index + 1}. **Usuário Desconhecido**\n🔥 ${user.dailyStreak} dias`;
      }
    })
  );

  // Find current user position
  const currentUser = await database.client.user.findUnique({
    where: { id: interaction.user.id },
    select: { dailyStreak: true },
  });

  let userPosition = 'N/A';
  if (currentUser) {
    const usersWithHigherStreak = await database.client.user.count({
      where: {
        dailyStreak: { gt: currentUser.dailyStreak },
      },
    });
    userPosition = `#${usersWithHigherStreak + 1}`;
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 Ranking de Streaks Diários')
    .setDescription(
      leaderboardText.join('\n\n') +
        (currentUser
          ? `\n\n**Sua Posição:** ${userPosition} (${currentUser.dailyStreak} dias)`
          : '')
    )
    .setColor(0xffd700)
    .setFooter({
      text: '🔥 = Ativo • ✅ = Resgatado hoje • 💔 = Quebrado • ❌ = Nunca resgatou',
    })
    .setTimestamp();

  const editMethod = interaction.editReply || interaction.reply;
  await editMethod.call(interaction, { embeds: [embed] });
}

/**
 * Show monthly calendar
 */
async function showMonthlyCalendar(interaction: any, database: DatabaseService, user: any) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  // Get user's daily reward history for this month (simulated)
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  // For now, we'll simulate based on current streak and last claim
  const lastClaim = user.lastDailyReward ? new Date(user.lastDailyReward) : null;
  const claimedDays = new Set<number>();

  if (lastClaim && lastClaim >= monthStart && lastClaim <= monthEnd) {
    // Simulate claimed days based on streak
    const claimDay = lastClaim.getDate();
    const streakStart = Math.max(1, claimDay - user.dailyStreak + 1);

    for (let day = streakStart; day <= claimDay; day++) {
      claimedDays.add(day);
    }
  }

  // Create calendar grid
  const calendar = [];
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Add header
  calendar.push(weekDays.join(' '));
  calendar.push('─'.repeat(weekDays.join(' ').length));

  // Add days
  let week = [];

  // Add empty spaces for days before month starts
  for (let i = 0; i < startDayOfWeek; i++) {
    week.push('   ');
  }

  // Add days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = day.toString().padStart(2, ' ');
    const today = now.getDate();

    let dayDisplay: string = dayStr;
    if (claimedDays.has(day)) {
      dayDisplay = `✅${day < 10 ? ' ' : ''}${day}`;
    } else if (day === today) {
      dayDisplay = `🔸${day < 10 ? ' ' : ''}${day}`;
    } else if (day > today) {
      dayDisplay = `⬜${day < 10 ? ' ' : ''}${day}`;
    } else {
      dayDisplay = `❌${day < 10 ? ' ' : ''}${day}`;
    }

    week.push(dayDisplay);

    if (week.length === 7) {
      calendar.push(week.join(' '));
      week = [];
    }
  }

  // Add remaining days if needed
  if (week.length > 0) {
    while (week.length < 7) {
      week.push('   ');
    }
    calendar.push(week.join(' '));
  }

  const monthNames = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  const claimedThisMonth = claimedDays.size;
  const possibleDays = Math.min(now.getDate(), daysInMonth);
  const completionRate = possibleDays > 0 ? (claimedThisMonth / possibleDays) * 100 : 0;

  const embed = new EmbedBuilder()
    .setTitle(`📅 Calendário de Recompensas - ${monthNames[month]} ${year}`)
    .setDescription(
      `\`\`\`\n${calendar.join('\n')}\`\`\`\n\n` +
        '**Legenda:**\n' +
        '✅ Resgatado • 🔸 Hoje • ❌ Perdido • ⬜ Futuro\n\n' +
        '**Estatísticas do Mês:**\n' +
        `🎁 Resgates: ${claimedThisMonth}/${possibleDays}\n` +
        `📊 Taxa de conclusão: ${completionRate.toFixed(1)}%\n` +
        `🔥 Streak atual: ${user.dailyStreak} dias\n` +
        `💰 Moedas ganhas: ~${claimedThisMonth * 100} (estimativa)`
    )
    .setColor(completionRate >= 80 ? 0x00ff00 : completionRate >= 50 ? 0xffa500 : 0xff0000)
    .setTimestamp();

  const editMethod = interaction.editReply || interaction.reply;
  await editMethod.call(interaction, { embeds: [embed] });
}

/**
 * Setup button collector for daily command interactions
 */
function setupButtonCollector(
  response: any,
  interaction: ChatInputCommandInteraction,
  database: DatabaseService,
  user: any
) {
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes
  });

  collector.on('collect', async (buttonInteraction: any) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
          content: '❌ Apenas quem iniciou o comando pode usar os botões!',
          flags: MessageFlags.Ephemeral,
        });
      return;
    }

    await buttonInteraction.deferUpdate();

    switch (buttonInteraction.customId) {
      case 'daily_streak':
        await showStreakInfo(buttonInteraction, database, user);
        break;
      case 'daily_leaderboard':
        await showStreakLeaderboard(buttonInteraction, database);
        break;
      case 'daily_calendar':
        await showMonthlyCalendar(buttonInteraction, database, user);
        break;
    }
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch (error) {
      // Ignore errors when editing expired interactions
    }
  });
}

/**
 * Helper functions
 */
function getStreakBonus(streak: number): { xp: number; coins: number } {
  const bonuses = [
    { days: 7, xp: 50, coins: 100 },
    { days: 14, xp: 100, coins: 200 },
    { days: 30, xp: 200, coins: 500 },
    { days: 60, xp: 300, coins: 750 },
    { days: 100, xp: 500, coins: 1000 },
    { days: 365, xp: 1000, coins: 2000 },
  ];

  const bonus = bonuses.find(b => b.days === streak);
  return bonus ? { xp: bonus.xp, coins: bonus.coins } : { xp: 0, coins: 0 };
}

function getStreakBadgeName(days: number): string {
  const badges: Record<number, string> = {
    7: 'Dedicado Semanal',
    14: 'Persistente Quinzenal',
    30: 'Veterano Mensal',
    60: 'Lenda Bimestral',
    100: 'Mestre da Consistência',
    365: 'Imortal do Streak',
  };
  return badges[days] || `Streak de ${days} dias`;
}

function createProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export default daily;
