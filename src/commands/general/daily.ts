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
import { BaseCommand } from '../../utils/base-command.util';

const logger = new Logger();

/**
 * Daily rewards command - Daily login rewards with streak system
 */
class DailyCommand extends BaseCommand {
  constructor() {
    super({
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
              { name: '📅 Calendário Mensal', value: 'calendar' },
            ),
        ) as SlashCommandBuilder,
      category: CommandCategory.GENERAL,
      cooldown: 5,
    });
  }

  async execute(interaction: any, client: ExtendedClient) {
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
            'Você precisa estar registrado para usar este comando.\n\n' +
              'Use `/register-server` para se registrar no servidor.',
          )
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      const action = interaction.options.getString('action') || 'claim';

      switch (action) {
        case 'claim':
          await this.claimDailyReward(interaction, database, badgeService, user);
          break;
        case 'streak':
          await this.showStreakInfo(interaction, database, user);
          break;
        case 'leaderboard':
          await this.showStreakLeaderboard(interaction, database);
          break;
        case 'calendar':
          await this.showMonthlyCalendar(interaction, database, user);
          break;
        default:
          await this.claimDailyReward(interaction, database, badgeService, user);
      }
    } catch (error) {
      logger.error('Error in daily command:', error);
      const embed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar o comando. Tente novamente.')
        .setColor(0xff0000)
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    }
  }

  /**
   * Claim daily reward
   */
  private async claimDailyReward(
    interaction: ChatInputCommandInteraction,
    database: DatabaseService,
    badgeService: BadgeService,
    user: any,
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
            'Use `/daily streak` para ver detalhes do seu streak!',
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
          .setStyle(ButtonStyle.Secondary),
      );

      const response = await interaction.reply({
        embeds: [embed],
        components: [actionButtons],
      });

      this.setupButtonCollector(response, interaction, database, user);
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
    const bonusReward = this.getStreakBonus(newStreak);

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
        lastDaily: now,
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
        const badgeName = this.getStreakBadgeName(milestone);
        try {
          await badgeService.awardBadge(user.id, badgeName, true);
          earnedBadges.push(badgeName);
        } catch (error) {
          logger.error(`Error awarding streak badge for ${milestone} days:`, error);
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
          `💰 Moedas: ${updatedUser.coins.toLocaleString()}`,
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
        value: `${nextMilestone} dias (faltam ${daysToNext} dias)\n🏅 ${this.getStreakBadgeName(nextMilestone)}`,
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
        .setStyle(ButtonStyle.Secondary),
    );

    const response = await interaction.reply({
      embeds: [embed],
      components: [actionButtons],
    });

    this.setupButtonCollector(response, interaction, database, updatedUser);
  }

  /**
   * Show streak information
   */
  private async showStreakInfo(interaction: any, database: DatabaseService, user: any) {
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

    // Calculate streak statistics
    const milestones = [7, 14, 30, 60, 100, 365];
    const currentStreak = user.dailyStreak || 0;
    const nextMilestone = milestones.find(m => m > currentStreak);
    const lastMilestone = milestones.filter(m => m <= currentStreak).pop() || 0;

    // Progress to next milestone
    let progressText = '';
    if (nextMilestone) {
      const progress = ((currentStreak - lastMilestone) / (nextMilestone - lastMilestone)) * 100;
      const progressBar = this.createProgressBar(progress);
      progressText = `\n\n**Progresso para próximo marco:**\n${progressBar} ${progress.toFixed(1)}%\n🎯 ${nextMilestone} dias (faltam ${nextMilestone - currentStreak} dias)`;
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Informações do Streak')
      .setDescription(
        `${streakEmoji} **Status:** ${streakStatus}\n` +
          `🔥 **Streak atual:** ${currentStreak} dias\n` +
          `📅 **Último resgate:** ${lastClaim ? lastClaim.toLocaleDateString('pt-BR') : 'Nunca'}\n` +
          `🏅 **Último marco:** ${lastMilestone} dias${progressText}`,
      )
      .setColor(currentStreak > 0 ? 0x00ff00 : 0xff0000)
      .setTimestamp();

    // Add milestone information
    const milestoneInfo = milestones
      .map(days => {
        const status = currentStreak >= days ? '✅' : '⏳';
        const badgeName = this.getStreakBadgeName(days);
        return `${status} ${days} dias - ${badgeName}`;
      })
      .join('\n');

    embed.addFields({
      name: '🏆 Marcos de Streak',
      value: milestoneInfo,
      inline: false,
    });

    const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('daily_claim')
        .setLabel('🎁 Resgatar')
        .setStyle(ButtonStyle.Success)
        .setDisabled(streakStatus === 'Resgatado hoje'),
      new ButtonBuilder()
        .setCustomId('daily_leaderboard')
        .setLabel('🏆 Ranking')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('daily_calendar')
        .setLabel('📅 Calendário')
        .setStyle(ButtonStyle.Secondary),
    );

    const response = await interaction.reply({
      embeds: [embed],
      components: [actionButtons],
    });

    this.setupButtonCollector(response, interaction, database, user);
  }

  /**
   * Show streak leaderboard
   */
  private async showStreakLeaderboard(interaction: any, database: DatabaseService) {
    try {
      const topUsers = await database.client.user.findMany({
        where: {
          dailyStreak: {
            gt: 0,
          },
        },
        orderBy: {
          dailyStreak: 'desc',
        },
        take: 15,
        select: {
          id: true,
          dailyStreak: true,
          lastDaily: true,
        },
      });

      if (topUsers.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('🏆 Ranking de Streaks Diários')
          .setDescription('Nenhum usuário com streak ativo encontrado!')
          .setColor(0xffa500)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
      }

      // Get user info from Discord
      const leaderboardData = [];
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        try {
          const discordUser = await interaction.client.users.fetch(user.id);
          const lastClaim = (user as any).lastDaily ? new Date((user as any).lastDaily) : null;
          const today = new Date();
          const isActive = lastClaim && (today.getTime() - lastClaim.getTime()) < 48 * 60 * 60 * 1000; // 48 hours

          leaderboardData.push({
            position: i + 1,
            username: discordUser.username,
            streak: user.dailyStreak,
            isActive,
            lastClaim: lastClaim ? lastClaim.toLocaleDateString('pt-BR') : 'Nunca',
          });
        } catch (error) {
          // Skip users that can't be fetched
          continue;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🏆 Ranking de Streaks Diários')
        .setDescription(
          'Top usuários com maiores streaks de login consecutivos:\n\n' +
            leaderboardData
              .map(user => {
                const medal = user.position <= 3 ? ['🥇', '🥈', '🥉'][user.position - 1] : `${user.position}.`;
                const status = user.isActive ? '🔥' : '💔';
                return `${medal} **${user.username}** - ${status} ${user.streak} dias`;
              })
              .join('\n'),
        )
        .setColor(0xffd700)
        .setFooter({
          text: '🔥 = Streak ativo • 💔 = Streak quebrado',
        })
        .setTimestamp();

      const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('daily_claim')
          .setLabel('🎁 Resgatar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('daily_streak')
          .setLabel('📊 Meu Streak')
          .setStyle(ButtonStyle.Primary),
      );

      const response = await interaction.reply({
        embeds: [embed],
        components: [actionButtons],
      });

      this.setupButtonCollector(response, interaction, database, null);
    } catch (error) {
      logger.error('Error showing streak leaderboard:', error);
      const embed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Erro ao carregar o ranking de streaks.')
        .setColor(0xff0000)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }

  /**
   * Show monthly calendar
   */
  private async showMonthlyCalendar(interaction: any, database: DatabaseService, user: any) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const today = now.getDate();

    // Get user's daily claims for current month
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    // For simplicity, we'll show a text-based calendar
    const daysInMonth = monthEnd.getDate();
    const firstDayOfWeek = monthStart.getDay(); // 0 = Sunday

    let calendar = '```\n';
    calendar += 'Dom Seg Ter Qua Qui Sex Sáb\n';

    // Add empty spaces for days before month starts
    const dayCounter = 1;
    let weekLine = '';

    // Fill empty days at start
    for (let i = 0; i < firstDayOfWeek; i++) {
      weekLine += '    ';
    }

    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, ' ');
      
      // Check if this day was claimed (simplified - would need actual claim data)
      const isToday = day === today;
      const isClaimed = day < today && user.dailyStreak > 0; // Simplified logic
      
      if (isToday) {
        weekLine += `[${dayStr}]`;
      } else if (isClaimed) {
        weekLine += ` ${dayStr}✓`;
      } else {
        weekLine += ` ${dayStr} `;
      }

      // New line after Saturday
      if ((firstDayOfWeek + day - 1) % 7 === 6) {
        calendar += weekLine + '\n';
        weekLine = '';
      }
    }

    // Add remaining line if needed
    if (weekLine.trim()) {
      calendar += weekLine + '\n';
    }

    calendar += '```';

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];

    const embed = new EmbedBuilder()
      .setTitle(`📅 Calendário de ${monthNames[currentMonth]} ${currentYear}`)
      .setDescription(
        calendar +
        '\n**Legenda:**\n' +
        '`[XX]` - Hoje\n' +
        '`XX✓` - Dia resgatado\n' +
        '`XX ` - Dia não resgatado\n\n' +
        `**Streak atual:** ${user.dailyStreak} dias\n` +
        `**Dias restantes no mês:** ${daysInMonth - today}`,
      )
      .setColor(0x00aaff)
      .setTimestamp();

    const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('daily_claim')
        .setLabel('🎁 Resgatar Hoje')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('daily_streak')
        .setLabel('📊 Ver Streak')
        .setStyle(ButtonStyle.Primary),
    );

    const response = await interaction.reply({
      embeds: [embed],
      components: [actionButtons],
    });

    this.setupButtonCollector(response, interaction, database, user);
  }

  /**
   * Setup button collector for interactions
   */
  private setupButtonCollector(
    response: any,
    interaction: ChatInputCommandInteraction,
    database: DatabaseService,
    user: any,
  ) {
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000, // 5 minutes
    });

    collector.on('collect', async (buttonInteraction: any) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: 'Apenas quem executou o comando pode usar estes botões.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        const action = buttonInteraction.customId.replace('daily_', '');
        
        // Get fresh user data
        const freshUser = user || await database.client.user.findUnique({
          where: { id: interaction.user.id },
          include: { stats: true },
        });

        switch (action) {
          case 'claim':
            await buttonInteraction.deferUpdate();
            await this.claimDailyReward(buttonInteraction, database, (interaction.client as any).badgeService, freshUser);
            break;
          case 'streak':
            await buttonInteraction.deferUpdate();
            await this.showStreakInfo(buttonInteraction, database, freshUser);
            break;
          case 'leaderboard':
            await buttonInteraction.deferUpdate();
            await this.showStreakLeaderboard(buttonInteraction, database);
            break;
          case 'calendar':
            await buttonInteraction.deferUpdate();
            await this.showMonthlyCalendar(buttonInteraction, database, freshUser);
            break;
        }
      } catch (error) {
        logger.error('Error handling button interaction:', error);
      }
    });

    collector.on('end', () => {
      // Disable buttons after collector ends
      const disabledComponents = response.components?.map((row: any) => {
        const newRow = new ActionRowBuilder();
        row.components.forEach((component: any) => {
          if (component.type === 2) { // Button
            newRow.addComponents(
              ButtonBuilder.from(component).setDisabled(true),
            );
          }
        });
        return newRow;
      });

      if (disabledComponents) {
        response.edit({ components: disabledComponents }).catch(() => {});
      }
    });
  }

  /**
   * Get streak bonus rewards
   */
  private getStreakBonus(streak: number): { xp: number; coins: number } {
    if (streak >= 365) {return { xp: 500, coins: 1000 };} // 1 year
    if (streak >= 100) {return { xp: 200, coins: 400 };} // 100 days
    if (streak >= 60) {return { xp: 100, coins: 200 };} // 2 months
    if (streak >= 30) {return { xp: 50, coins: 100 };} // 1 month
    if (streak >= 14) {return { xp: 25, coins: 50 };} // 2 weeks
    if (streak >= 7) {return { xp: 10, coins: 25 };} // 1 week
    return { xp: 0, coins: 0 };
  }

  /**
   * Get streak badge name
   */
  private getStreakBadgeName(days: number): string {
    const badges: Record<number, string> = {
      7: 'Dedicado Semanal',
      14: 'Consistente Quinzenal',
      30: 'Veterano Mensal',
      60: 'Lenda Bimestral',
      100: 'Mestre da Consistência',
      365: 'Imortal do Login',
    };
    return badges[days] || 'Badge Desconhecida';
  }

  /**
   * Create progress bar
   */
  private createProgressBar(percentage: number, length: number = 10): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}

// Create instance and export
const dailyCommand = new DailyCommand();

// Legacy exports for compatibility
export const data = dailyCommand.data;
export const category = dailyCommand.category;
export const cooldown = dailyCommand.cooldown;
export const execute = dailyCommand.execute.bind(dailyCommand);

export default {
  data: dailyCommand.data,
  category: dailyCommand.category,
  cooldown: dailyCommand.cooldown,
  execute: dailyCommand.execute.bind(dailyCommand),
};
