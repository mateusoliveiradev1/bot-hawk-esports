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
import { CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { GameService, Challenge, ChallengeProgress } from '../../services/game.service';
import { DatabaseService } from '../../database/database.service';
import { BaseCommand } from '../../utils/base-command.util';

/**
 * Challenge command - Daily, weekly, and monthly challenges with rewards
 */
class ChallengeCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('challenge')
        .setDescription('🏅 Visualiza e gerencia desafios diários, semanais e mensais')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Ação a ser executada')
            .setRequired(false)
            .addChoices(
              { name: '📋 Ver Desafios Ativos', value: 'list' },
              { name: '📊 Meu Progresso', value: 'progress' },
              { name: '🎁 Resgatar Recompensas', value: 'claim' },
              { name: '📈 Estatísticas', value: 'stats' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Filtrar por tipo de desafio')
            .setRequired(false)
            .addChoices(
              { name: '📅 Diários', value: 'daily' },
              { name: '📆 Semanais', value: 'weekly' },
              { name: '🗓️ Mensais', value: 'monthly' },
              { name: '⭐ Especiais', value: 'special' },
            ),
        ) as SlashCommandBuilder,
      category: CommandCategory.GENERAL,
      cooldown: 10,
    });
  }

  async execute(interaction: any, client: ExtendedClient) {
    const logger = new Logger();
    const gameService = new GameService(client);
    const database = new DatabaseService();

    try {
      // Check if user is registered
      const user = await database.client.user.findUnique({
        where: { id: interaction.user.id },
      });

      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Usuário Não Registrado')
          .setDescription(
            'Você precisa se registrar primeiro usando `/register` para acessar desafios!',
          )
          .setColor(0xff0000)
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const action = interaction.options.getString('action') || 'list';
      const type = interaction.options.getString('type');

      switch (action) {
        case 'list':
          await this.showActiveChallenges(interaction, gameService, type);
          break;
        case 'progress':
          await this.showUserProgress(interaction, gameService, user.id, type);
          break;
        case 'claim':
          await this.showClaimableRewards(interaction, gameService, user.id);
          break;
        case 'stats':
          await this.showChallengeStats(interaction, gameService, database, user.id);
          break;
        default:
          await this.showActiveChallenges(interaction, gameService, type);
      }
    } catch (error) {
      logger.error('Error in challenge command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao acessar os desafios. Tente novamente.')
        .setColor(0xff0000)
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  }

  /**
   * Show active challenges
   */
  private async showActiveChallenges(
    interaction: ChatInputCommandInteraction,
    gameService: GameService,
    typeFilter?: string | null,
  ) {
  const challenges = gameService.getActiveChallenges();

  let filteredChallenges = challenges;
  if (typeFilter) {
    filteredChallenges = challenges.filter(c => c.type === typeFilter);
  }

  if (filteredChallenges.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🏅 Desafios Ativos')
      .setDescription(
        typeFilter
          ? `Não há desafios ${this.getChallengeTypeName(typeFilter)} ativos no momento.`
          : 'Não há desafios ativos no momento. Novos desafios são criados automaticamente!',
      )
      .setColor(0xffa500)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Group challenges by type
  const challengesByType = filteredChallenges.reduce(
    (acc, challenge) => {
      if (!acc[challenge.type]) {
        acc[challenge.type] = [];
      }
      acc[challenge.type]!.push(challenge);
      return acc;
    },
    {} as Record<string, Challenge[]>,
  );

  const embed = new EmbedBuilder()
    .setTitle('🏅 Desafios Ativos')
    .setDescription(
      Object.entries(challengesByType)
        .map(([type, challenges]) => {
          const typeEmoji = this.getChallengeTypeEmoji(type);
          const typeName = this.getChallengeTypeName(type);

          return (
            `**${typeEmoji} ${typeName}**\n` +
            challenges
              .map(challenge => {
                const timeLeft = this.getTimeLeft(challenge.endDate);
                const difficultyEmoji = this.getCategoryEmoji(challenge.category);

                return (
                  `${difficultyEmoji} **${challenge.name}**\n` +
                  `${challenge.description}\n` +
                  `🎁 ${challenge.rewards.xp} XP + ${challenge.rewards.coins} moedas\n` +
                  `⏰ ${timeLeft}`
                );
              })
              .join('\n\n')
          );
        })
        .join('\n\n'),
    )
    .setColor(0x0099ff)
    .setFooter({ text: 'Use /challenge progress para ver seu progresso!' })
    .setTimestamp();

  const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('challenge_progress')
      .setLabel('📊 Meu Progresso')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('challenge_claim')
      .setLabel('🎁 Resgatar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('challenge_stats')
      .setLabel('📈 Estatísticas')
      .setStyle(ButtonStyle.Secondary),
  );

  const response = await interaction.reply({
    embeds: [embed],
    components: [actionButtons],
  });

  // Set up button collector
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
      case 'challenge_progress':
        await this.showUserProgress(buttonInteraction, gameService, interaction.user.id);
        break;
      case 'challenge_claim':
        await this.showClaimableRewards(buttonInteraction, gameService, interaction.user.id);
        break;
      case 'challenge_stats':
        const database = new DatabaseService();
        await this.showChallengeStats(buttonInteraction, gameService, database, interaction.user.id);
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

  return response;
}

  /**
   * Show user progress on challenges
   */
  private async showUserProgress(
    interaction: any,
    gameService: GameService,
    userId: string,
    typeFilter?: string | null,
  ) {
  const userProgress = gameService.getUserChallengeProgress(userId);
  const activeChallenges = gameService.getActiveChallenges();

  let filteredChallenges = activeChallenges;
  if (typeFilter) {
    filteredChallenges = activeChallenges.filter(c => c.type === typeFilter);
  }

  if (filteredChallenges.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('📊 Meu Progresso')
      .setDescription('Não há desafios ativos para mostrar progresso.')
      .setColor(0xffa500)
      .setTimestamp();

    const editMethod = interaction.editReply || interaction.reply;
    return editMethod.call(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const progressData = filteredChallenges.map(challenge => {
    const progress = userProgress.get(challenge.id);
    const isCompleted = progress?.completed || false;
    const isClaimed = progress?.claimed || false;

    let progressText = '';
    if (progress) {
      progressText = challenge.requirements
        .map(req => {
          const current = progress.progress.get(req.type) || 0;
          const percentage = Math.min((current / req.target) * 100, 100);
          const progressBar = this.createProgressBar(percentage);

        return `${this.getRequirementEmoji(req.type)} ${this.getRequirementName(req.type)}: ${current}/${req.target}\n${progressBar} ${percentage.toFixed(1)}%`;
        })
        .join('\n');
    } else {
      progressText = challenge.requirements
        .map(req => {
          const progressBar = this.createProgressBar(0);
        return `${this.getRequirementEmoji(req.type)} ${this.getRequirementName(req.type)}: 0/${req.target}\n${progressBar} 0%`;
        })
        .join('\n');
    }

    const statusEmoji = isClaimed ? '✅' : isCompleted ? '🎁' : '⏳';
    const statusText = isClaimed
      ? 'Resgatado'
      : isCompleted
        ? 'Completo - Resgatar!'
        : 'Em Progresso';

    return (
      `${statusEmoji} **${challenge.name}**\n` +
      `${progressText}\n` +
      `📊 Status: ${statusText}\n` +
      `🎁 Recompensa: ${challenge.rewards.xp} XP + ${challenge.rewards.coins} moedas`
    );
  });

  const embed = new EmbedBuilder()
    .setTitle('📊 Meu Progresso nos Desafios')
    .setDescription(progressData.join('\n\n'))
    .setColor(0x0099ff)
    .setFooter({ text: 'Progresso atualizado em tempo real!' })
    .setTimestamp();

  const editMethod = interaction.editReply || interaction.reply;
  await editMethod.call(interaction, { embeds: [embed] });
}

  /**
   * Show claimable rewards
   */
  private async showClaimableRewards(interaction: any, gameService: GameService, userId: string) {
  const userProgress = gameService.getUserChallengeProgress(userId);
  const activeChallenges = gameService.getActiveChallenges();

  const claimableChallenges = activeChallenges.filter(challenge => {
    const progress = userProgress.get(challenge.id);
    return progress?.completed && !progress?.claimed;
  });

  if (claimableChallenges.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🎁 Recompensas Disponíveis')
      .setDescription(
        'Você não tem recompensas para resgatar no momento.\n\n' +
          'Complete desafios para ganhar XP, moedas e badges!',
      )
      .setColor(0xffa500)
      .setTimestamp();

    const editMethod = interaction.editReply || interaction.reply;
    return editMethod.call(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const totalRewards = claimableChallenges.reduce(
    (acc, challenge) => {
      acc.xp += challenge.rewards.xp;
      acc.coins += challenge.rewards.coins;
      return acc;
    },
    { xp: 0, coins: 0 },
  );

  const embed = new EmbedBuilder()
    .setTitle('🎁 Recompensas Disponíveis')
    .setDescription(
      `**Desafios Completados:** ${claimableChallenges.length}\n\n` +
        claimableChallenges
          .map(challenge => {
            const typeEmoji = this.getChallengeTypeEmoji(challenge.type);
            return (
              `${typeEmoji} **${challenge.name}**\n` +
              `🎁 ${challenge.rewards.xp} XP + ${challenge.rewards.coins} moedas`
            );
          })
          .join('\n\n') +
        '\n\n**📊 Total das Recompensas:**\n' +
        `⭐ ${totalRewards.xp} XP\n` +
        `💰 ${totalRewards.coins} moedas`,
    )
    .setColor(0x00ff00)
    .setTimestamp();

  const claimButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_all_rewards')
      .setLabel(`🎁 Resgatar Tudo (${claimableChallenges.length})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('claim_individual')
      .setLabel('📋 Resgatar Individual')
      .setStyle(ButtonStyle.Primary),
  );

  const editMethod = interaction.editReply || interaction.reply;
  const response = await editMethod.call(interaction, {
    embeds: [embed],
    components: [claimButtons],
  });

  // Set up button collector for claiming
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes
  });

  collector.on('collect', async (buttonInteraction: any) => {
    if (buttonInteraction.user.id !== userId) {
      await buttonInteraction.reply({
        content: '❌ Apenas o dono do comando pode resgatar as recompensas!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await buttonInteraction.deferUpdate();

    if (buttonInteraction.customId === 'claim_all_rewards') {
      const totalClaimed = { xp: 0, coins: 0 };
      let claimedCount = 0;

      for (const challenge of claimableChallenges) {
        const success = await gameService.claimChallengeRewards(userId, challenge.id);
        if (success) {
          totalClaimed.xp += challenge.rewards.xp;
          totalClaimed.coins += challenge.rewards.coins;
          claimedCount++;
        }
      }

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Recompensas Resgatadas!')
        .setDescription(
          `**Desafios resgatados:** ${claimedCount}/${claimableChallenges.length}\n\n` +
            '**Recompensas recebidas:**\n' +
            `⭐ +${totalClaimed.xp} XP\n` +
            `💰 +${totalClaimed.coins} moedas\n\n` +
            'Parabéns pelo seu progresso! 🎉',
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await buttonInteraction.editReply({ embeds: [successEmbed], components: [] });
    } else if (buttonInteraction.customId === 'claim_individual') {
      await this.showIndividualClaimMenu(buttonInteraction, gameService, userId, claimableChallenges);
    }
  });
}

/**
   * Show individual claim menu for multiple rewards
   */
  private async showIndividualClaimMenu(
    interaction: any,
    gameService: GameService,
    userId: string,
    claimableChallenges: Challenge[],
  ) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Resgatar Recompensas Individuais')
    .setDescription(
      'Selecione quais desafios você deseja resgatar:\n\n' +
        claimableChallenges
          .map((challenge: any, index: number) => {
            const typeEmoji = this.getChallengeTypeEmoji(challenge.type);
            return (
              `**${index + 1}.** ${typeEmoji} ${challenge.name}\n` +
              `🎁 ${challenge.rewards.xp} XP + ${challenge.rewards.coins} moedas`
            );
          })
          .join('\n\n'),
    )
    .setColor(0x0099ff)
    .setTimestamp();

  const claimButtons = claimableChallenges.slice(0, 5).map((challenge: any, index: number) =>
    new ButtonBuilder()
      .setCustomId(`claim_individual_${challenge.id}`)
      .setLabel(
        `${index + 1}. ${challenge.name.substring(0, 20)}${challenge.name.length > 20 ? '...' : ''}`,
      )
      .setStyle(ButtonStyle.Secondary),
  );

  const buttonRows = [];
  for (let i = 0; i < claimButtons.length; i += 5) {
    buttonRows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(claimButtons.slice(i, i + 5)),
    );
  }

  await interaction.editReply({
    embeds: [embed],
    components: buttonRows,
  });

  // Set up collector for individual claims
  const collector = interaction.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes
  });

  collector.on('collect', async (buttonInteraction: any) => {
    if (buttonInteraction.user.id !== userId) {
      await buttonInteraction.reply({
        content: '❌ Apenas o dono do comando pode resgatar as recompensas!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const challengeId = buttonInteraction.customId.replace('claim_individual_', '');
    const challenge = claimableChallenges.find(c => c.id === challengeId);

    if (!challenge) {
      await buttonInteraction.reply({
        content: '❌ Desafio não encontrado!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const success = await gameService.claimChallengeRewards(userId, challengeId);

    if (success) {
      await buttonInteraction.reply({
        content: `✅ **${challenge.name}** resgatado!\n🎁 +${challenge.rewards.xp} XP + ${challenge.rewards.coins} moedas`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await buttonInteraction.reply({
        content: '❌ Erro ao resgatar recompensa. Tente novamente.',
        flags: MessageFlags.Ephemeral,
      });
    }
  });
}

  /**
   * Show challenge statistics
   */
  private async showChallengeStats(
    interaction: any,
    gameService: GameService,
    database: DatabaseService,
    userId: string,
  ) {
  try {
    // Get user stats from database
    const user = await database.client.user.findUnique({
      where: { id: userId },
      include: {
        stats: true,
      },
    });

    if (!user) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Usuário Não Encontrado')
        .setDescription('Não foi possível carregar suas estatísticas.')
        .setColor(0xff0000)
        .setTimestamp();

      const editMethod = interaction.editReply || interaction.reply;
      return editMethod.call(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const userProgress = gameService.getUserChallengeProgress(userId);
    const activeChallenges = gameService.getActiveChallenges();

    const completedChallenges = Array.from(userProgress.values()).filter(p => p.completed).length;
    const claimedChallenges = Array.from(userProgress.values()).filter(p => p.claimed).length;
    const totalChallenges = activeChallenges.length;

    const completionRate = totalChallenges > 0 ? (completedChallenges / totalChallenges) * 100 : 0;

    // Calculate challenge type stats
    const typeStats = activeChallenges.reduce(
      (acc, challenge) => {
        const progress = userProgress.get(challenge.id);
        if (!acc[challenge.type]) {
          acc[challenge.type] = { total: 0, completed: 0, claimed: 0 };
        }
        if (acc[challenge.type]) {
          acc[challenge.type]!.total++;
          if (progress?.completed) {
            acc[challenge.type]!.completed++;
          }
          if (progress?.claimed) {
            acc[challenge.type]!.claimed++;
          }
        }
        return acc;
      },
      {} as Record<string, { total: number; completed: number; claimed: number }>,
    );

    const embed = new EmbedBuilder()
      .setTitle('📈 Estatísticas de Desafios')
      .setDescription(
        '**📊 Resumo Geral:**\n' +
          `• Desafios ativos: ${totalChallenges}\n` +
          `• Completados: ${completedChallenges}\n` +
          `• Resgatados: ${claimedChallenges}\n` +
          `• Taxa de conclusão: ${completionRate.toFixed(1)}%\n\n` +
          '**📋 Por Tipo:**\n' +
          Object.entries(typeStats)
            .map(([type, stats]) => {
              const typeEmoji = this.getChallengeTypeEmoji(type);
      const typeName = this.getChallengeTypeName(type);
              const rate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
              return `${typeEmoji} **${typeName}:** ${stats.completed}/${stats.total} (${rate.toFixed(1)}%)`;
            })
            .join('\n') +
          '\n\n**🎮 Atividade Geral:**\n' +
          `• Level: ${user.level}\n` +
          `• XP Total: ${user.xp.toLocaleString()}\n` +
          `• Moedas: ${user.coins.toLocaleString()}\n` +
          `• Comandos usados: ${user.stats?.commandsUsed || 0}\n` +
          `• Mensagens enviadas: ${user.stats?.messagesCount || 0}\n` +
          `• Tempo em voz: ${this.formatVoiceTime(user.stats?.voiceTime || 0)}\n` +
          `• Jogos jogados: ${user.stats?.gamesPlayed || 0}\n` +
          `• Quizzes completados: ${user.stats?.quizzesCompleted || 0}`,
      )
      .setColor(0x9b59b6)
      .setFooter({ text: `Membro desde: ${user.createdAt.toLocaleDateString('pt-BR')}` })
      .setTimestamp();

    const editMethod = interaction.editReply || interaction.reply;
    await editMethod.call(interaction, { embeds: [embed] });
  } catch (error) {
    console.error('Error showing challenge stats:', error);

    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro')
      .setDescription('Não foi possível carregar as estatísticas.')
      .setColor(0xff0000)
      .setTimestamp();

    const editMethod = interaction.editReply || interaction.reply;
    await editMethod.call(interaction, { embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
  }
}

  /**
   * Helper methods
   */
  private getChallengeTypeEmoji(type: string): string {
    const emojis = {
      daily: '📅',
      weekly: '📆',
      monthly: '🗓️',
      special: '⭐',
    };
    return emojis[type as keyof typeof emojis] || '🏅';
  }

  private getChallengeTypeName(type: string): string {
    const names = {
      daily: 'Diários',
      weekly: 'Semanais',
      monthly: 'Mensais',
      special: 'Especiais',
    };
    return names[type as keyof typeof names] || 'Desconhecido';
  }

  private getCategoryEmoji(category: string): string {
    const emojis = {
      pubg: '🎮',
      social: '💬',
      gaming: '🎯',
      participation: '🤝',
    };
    return emojis[category as keyof typeof emojis] || '🏅';
  }

  private getRequirementEmoji(type: string): string {
    const emojis = {
      kills: '💀',
      wins: '🏆',
      games: '🎮',
      messages: '💬',
      voice_time: '🎤',
      quiz_score: '🧠',
      mini_game_wins: '🎯',
    };
    return emojis[type as keyof typeof emojis] || '📊';
  }

  private getRequirementName(type: string): string {
    const names = {
      kills: 'Kills',
      wins: 'Vitórias',
      games: 'Partidas',
      messages: 'Mensagens',
      voice_time: 'Tempo em Voz',
      quiz_score: 'Pontos em Quiz',
      mini_game_wins: 'Vitórias em Mini-Games',
    };
    return names[type as keyof typeof names] || 'Desconhecido';
  }

  private createProgressBar(percentage: number, length: number = 10): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private getTimeLeft(endDate: Date): string {
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();

    if (diff <= 0) {
      return 'Expirado';
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private formatVoiceTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}

const commandInstance = new ChallengeCommand();

export const command = {
  data: commandInstance.data,
  category: commandInstance.category,
  cooldown: commandInstance.cooldown,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) => 
    commandInstance.execute(interaction, client),
};

export default command;

// Export class for testing
export { ChallengeCommand };
