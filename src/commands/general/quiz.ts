import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChatInputCommandInteraction,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { GameService, QuizSettings } from '../../services/game.service';
import { DatabaseService } from '../../database/database.service';

/**
 * Quiz command - Interactive PUBG and gaming quizzes with modern UI/UX
 */
const quiz: Command = {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('🎯 Inicia um quiz interativo sobre PUBG com interface moderna')
    .addStringOption(option =>
      option
        .setName('category')
        .setDescription('Categoria do quiz')
        .setRequired(false)
        .addChoices(
          { name: '🎮 PUBG - Mapas & Estratégias', value: 'pubg' },
          { name: '🔫 PUBG - Armas & Equipamentos', value: 'pubg_weapons' },
          { name: '🏆 PUBG - Esports & Competitivo', value: 'pubg_esports' },
          { name: '📚 PUBG - História & Lore', value: 'pubg_lore' },
          { name: '🎯 Gaming Geral', value: 'gaming' },
          { name: '🎲 Misto', value: 'mixed' },
        ),
    )
    .addStringOption(option =>
      option
        .setName('difficulty')
        .setDescription('Dificuldade do quiz')
        .setRequired(false)
        .addChoices(
          { name: '🟢 Iniciante (Fácil)', value: 'easy' },
          { name: '🟡 Veterano (Médio)', value: 'medium' },
          { name: '🔴 Pro Player (Difícil)', value: 'hard' },
          { name: '💀 Chicken Dinner (Extremo)', value: 'extreme' },
          { name: '🌈 Misto', value: 'mixed' },
        ),
    )
    .addIntegerOption(option =>
      option
        .setName('questions')
        .setDescription('Número de perguntas (5-25)')
        .setRequired(false)
        .setMinValue(5)
        .setMaxValue(25),
    )
    .addIntegerOption(option =>
      option
        .setName('time')
        .setDescription('Tempo por pergunta em segundos (10-180)')
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(180),
    ) as SlashCommandBuilder,

  category: CommandCategory.GENERAL,
  cooldown: 15,

  async execute(interaction: any, client: ExtendedClient) {
    const logger = new Logger();

    try {
      const gameService = client.services?.game as GameService;
      const database = client.database as DatabaseService;

      if (!gameService) {
        const embed = new EmbedBuilder()
          .setTitle('🚫 Sistema Indisponível')
          .setDescription(
            '```diff\n- O sistema de quiz está temporariamente indisponível\n+ Tente novamente em alguns minutos```',
          )
          .setColor(0xff4444)
          .setThumbnail('https://cdn.discordapp.com/emojis/852869487845515264.png')
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Get options with enhanced defaults
      const category = interaction.options.getString('category') || 'pubg';
      const difficulty = interaction.options.getString('difficulty') || 'medium';
      const questionCount = interaction.options.getInteger('questions') || 10;
      const timePerQuestion = interaction.options.getInteger('time') || 45;

      // Show quiz configuration menu if no specific options provided
      if (!interaction.options.getString('category') && !interaction.options.getString('difficulty')) {
        return await showQuizConfigurationMenu(interaction, gameService);
      }

      // Create enhanced quiz settings
      const settings: QuizSettings = {
        questionCount,
        timePerQuestion,
        category: category as any,
        difficulty: difficulty as any,
        allowMultipleAttempts: false,
        showCorrectAnswer: true,
      };

      // Start quiz session
      const session = await gameService.startQuiz(
        interaction.guildId!,
        interaction.channelId,
        interaction.user.id,
        settings,
      );

      if (!session) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Falha na Inicialização')
          .setDescription(
            '```yaml\nErro: Não foi possível criar a sessão de quiz\nMotivo: Recursos temporariamente indisponíveis\nAção: Tente novamente em alguns segundos```',
          )
          .setColor(0xffaa00)
          .addFields(
            { name: '💡 Dica', value: 'Verifique se não há outro quiz ativo neste canal', inline: false },
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Create modern PUBG-themed embed
      const categoryInfo = getCategoryInfo(category);
      const difficultyInfo = getDifficultyInfo(difficulty);
      
      const embed = new EmbedBuilder()
        .setTitle(`${categoryInfo.emoji} ${categoryInfo.name} - Quiz Iniciado!`)
        .setDescription(
          '🎯 **Prepare-se para o desafio!**\n\n' +
          `${difficultyInfo.emoji} **Nível:** ${difficultyInfo.name}\n` +
          `📊 **Perguntas:** ${questionCount} questões\n` +
          `⏱️ **Tempo:** ${timePerQuestion}s por pergunta\n` +
          '🏆 **Recompensas:** XP + Moedas + Badges\n\n' +
          '```diff\n+ Clique em \'Entrar na Batalha\' para participar!\n```\n' +
          '*O quiz começará em 15 segundos...*',
        )
        .setColor(categoryInfo.color)
        .setThumbnail(categoryInfo.thumbnail)
        .addFields(
          { 
            name: '🎮 Informações da Sessão', 
            value: `\`\`\`yaml\nID: ${session.id.slice(-8)}\nCanal: #${interaction.channel?.name || 'quiz'}\nHost: ${interaction.user.username}\`\`\``, 
            inline: false, 
          },
          { 
            name: '🏅 Sistema de Pontuação', 
            value: `• Resposta correta: **+${getPointsForDifficulty(difficulty)} pts**\n• Streak bonus: **+50% pts**\n• Tempo bonus: **até +25% pts**`, 
            inline: true, 
          },
          { 
            name: '🎁 Recompensas Possíveis', 
            value: `• **${getXPReward(difficulty, questionCount)} XP**\n• **${getCoinReward(difficulty, questionCount)} Moedas**\n• **Badges especiais**`, 
            inline: true, 
          },
        )
        .setFooter({ 
          text: `PUBG Quiz System • Participantes: 0/${getMaxParticipants()}`, 
          iconURL: 'https://cdn.discordapp.com/emojis/852869487845515264.png', 
        })
        .setTimestamp();

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`quiz_join_${session.id}`)
          .setLabel('🚀 Entrar na Batalha')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎯'),
        new ButtonBuilder()
          .setCustomId(`quiz_info_${session.id}`)
          .setLabel('📋 Regras')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('ℹ️'),
        new ButtonBuilder()
          .setCustomId(`quiz_cancel_${session.id}`)
          .setLabel('❌ Cancelar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🚫'),
      );

      await interaction.reply({
        embeds: [embed],
        components: [actionRow],
      });

      // Enhanced countdown with live updates
      await startEnhancedCountdown(interaction, session, gameService, 15);
    } catch (error) {
      logger.error('Error in quiz command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('💥 Erro Crítico')
        .setDescription(
          '```diff\n- Falha inesperada no sistema de quiz\n+ Reportando erro automaticamente...```\n\n' +
          '**Código do erro:** `QUIZ_EXEC_FAIL`\n' +
          '**Ação recomendada:** Tente novamente ou contate um administrador',
        )
        .setColor(0xff0000)
        .addFields(
          { name: '🔧 Suporte Técnico', value: 'Use `/help quiz` para mais informações', inline: false },
        )
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  },
};

// Duplicate function removed - using enhanced version below

/**
 * End quiz and show results
 */
async function endQuiz(
  interaction: ChatInputCommandInteraction,
  session: any,
  gameService: GameService,
) {
  const results = await gameService.endQuiz(session.id);

  if (results.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🏁 Quiz Finalizado')
      .setDescription('Nenhum participante completou o quiz.')
      .setColor(0xffa500)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);

  const embed = new EmbedBuilder()
    .setTitle('🏆 Resultados do Quiz')
    .setDescription(
      results
        .slice(0, 10)
        .map((participant, index) => {
          const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}º`;
          const accuracy =
            participant.totalAnswers > 0
              ? Math.round((participant.correctAnswers / participant.totalAnswers) * 100)
              : 0;

          return (
            `${medal} **${participant.username}**\n` +
            `📊 ${participant.score} pontos • ✅ ${participant.correctAnswers}/${participant.totalAnswers} (${accuracy}%)`
          );
        })
        .join('\n\n'),
    )
    .setColor(0xffd700)
    .setFooter({ text: `Participantes: ${results.length}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], components: [] });
}

/**
 * Enhanced helper functions for modern UI/UX
 */
function getCategoryInfo(category: string): { name: string; emoji: string; color: number; thumbnail: string } {
  const categories = {
    pubg: {
      name: 'PUBG - Mapas & Estratégias',
      emoji: '🗺️',
      color: 0xff6b35,
      thumbnail: 'https://cdn.discordapp.com/emojis/852869487845515264.png',
    },
    pubg_weapons: {
      name: 'PUBG - Armas & Equipamentos',
      emoji: '🔫',
      color: 0x8b0000,
      thumbnail: 'https://cdn.discordapp.com/emojis/852869487845515264.png',
    },
    pubg_esports: {
      name: 'PUBG - Esports & Competitivo',
      emoji: '🏆',
      color: 0xffd700,
      thumbnail: 'https://cdn.discordapp.com/emojis/852869487845515264.png',
    },
    pubg_lore: {
      name: 'PUBG - História & Lore',
      emoji: '📚',
      color: 0x4b0082,
      thumbnail: 'https://cdn.discordapp.com/emojis/852869487845515264.png',
    },
    gaming: {
      name: 'Gaming Geral',
      emoji: '🎯',
      color: 0x00ff7f,
      thumbnail: 'https://cdn.discordapp.com/emojis/852869487845515264.png',
    },
    mixed: {
      name: 'Quiz Misto',
      emoji: '🎲',
      color: 0x9932cc,
      thumbnail: 'https://cdn.discordapp.com/emojis/852869487845515264.png',
    },
  };
  return categories[category as keyof typeof categories] || categories.mixed;
}

function getDifficultyInfo(difficulty: string): { name: string; emoji: string; multiplier: number } {
  const difficulties = {
    easy: { name: 'Iniciante', emoji: '🟢', multiplier: 1.0 },
    medium: { name: 'Veterano', emoji: '🟡', multiplier: 1.5 },
    hard: { name: 'Pro Player', emoji: '🔴', multiplier: 2.0 },
    extreme: { name: 'Chicken Dinner', emoji: '💀', multiplier: 3.0 },
    mixed: { name: 'Misto', emoji: '🌈', multiplier: 1.75 },
  };
  return difficulties[difficulty as keyof typeof difficulties] || difficulties.medium;
}

function getPointsForDifficulty(difficulty: string): number {
  const points = { easy: 10, medium: 15, hard: 25, extreme: 40, mixed: 20 };
  return points[difficulty as keyof typeof points] || 15;
}

function getXPReward(difficulty: string, questionCount: number): number {
  const baseXP = getPointsForDifficulty(difficulty) * questionCount;
  return Math.floor(baseXP * 2.5);
}

function getCoinReward(difficulty: string, questionCount: number): number {
  const baseCoins = getPointsForDifficulty(difficulty) * questionCount;
  return Math.floor(baseCoins * 1.2);
}

function getMaxParticipants(): number {
  return 20;
}

function getDifficultyColor(difficulty: string): number {
  const colors = {
    easy: 0x00ff00,
    medium: 0xffa500,
    hard: 0xff0000,
  };
  return colors[difficulty as keyof typeof colors] || 0x0099ff;
}

/**
 * Show interactive quiz configuration menu
 */
async function showQuizConfigurationMenu(interaction: ChatInputCommandInteraction, gameService: GameService) {
  const embed = new EmbedBuilder()
    .setTitle('🎯 Configuração do Quiz PUBG')
    .setDescription(
      '**Personalize sua experiência de quiz!**\n\n' +
      '🎮 Escolha a categoria que mais te interessa\n' +
      '⚡ Selecione o nível de dificuldade\n' +
      '📊 Configure o número de perguntas\n' +
      '⏱️ Defina o tempo por pergunta\n\n' +
      '```yaml\nDica: Use os menus abaixo para configurar seu quiz ideal```',
    )
    .setColor(0x0099ff)
    .setThumbnail('https://cdn.discordapp.com/emojis/852869487845515264.png')
    .addFields(
      {
        name: '🏆 Recompensas Disponíveis',
        value: '• **XP:** 25-1000 pontos\n• **Moedas:** 15-600 moedas\n• **Badges:** Conquistas especiais',
        inline: true,
      },
      {
        name: '📈 Sistema de Ranking',
        value: '• Pontuação global\n• Streaks de vitórias\n• Estatísticas detalhadas',
        inline: true,
      },
    )
    .setFooter({ text: 'PUBG Quiz System • Selecione suas preferências abaixo' })
    .setTimestamp();

  const categorySelect = new StringSelectMenuBuilder()
    .setCustomId('quiz_category_select')
    .setPlaceholder('🎮 Escolha a categoria do quiz')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('PUBG - Mapas & Estratégias')
        .setDescription('Perguntas sobre mapas, zonas e estratégias')
        .setValue('pubg')
        .setEmoji('🗺️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('PUBG - Armas & Equipamentos')
        .setDescription('Tudo sobre armas, attachments e equipamentos')
        .setValue('pubg_weapons')
        .setEmoji('🔫'),
      new StringSelectMenuOptionBuilder()
        .setLabel('PUBG - Esports & Competitivo')
        .setDescription('Cenário competitivo e torneios')
        .setValue('pubg_esports')
        .setEmoji('🏆'),
      new StringSelectMenuOptionBuilder()
        .setLabel('PUBG - História & Lore')
        .setDescription('História do jogo e curiosidades')
        .setValue('pubg_lore')
        .setEmoji('📚'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Quiz Misto')
        .setDescription('Mistura de todas as categorias')
        .setValue('mixed')
        .setEmoji('🎲'),
    );

  const difficultySelect = new StringSelectMenuBuilder()
    .setCustomId('quiz_difficulty_select')
    .setPlaceholder('⚡ Selecione a dificuldade')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Iniciante (Fácil)')
        .setDescription('Perguntas básicas - 10 pts por acerto')
        .setValue('easy')
        .setEmoji('🟢'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Veterano (Médio)')
        .setDescription('Perguntas intermediárias - 15 pts por acerto')
        .setValue('medium')
        .setEmoji('🟡'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Pro Player (Difícil)')
        .setDescription('Perguntas avançadas - 25 pts por acerto')
        .setValue('hard')
        .setEmoji('🔴'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Chicken Dinner (Extremo)')
        .setDescription('Perguntas expert - 40 pts por acerto')
        .setValue('extreme')
        .setEmoji('💀'),
    );

  const actionRow1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect);
  const actionRow2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(difficultySelect);
  
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('quiz_quick_start')
      .setLabel('🚀 Início Rápido')
      .setStyle(ButtonStyle.Success)
      .setEmoji('⚡'),
    new ButtonBuilder()
      .setCustomId('quiz_custom_config')
      .setLabel('⚙️ Configuração Avançada')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔧'),
    new ButtonBuilder()
      .setCustomId('quiz_cancel_config')
      .setLabel('❌ Cancelar')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚫'),
  );

  await interaction.reply({
    embeds: [embed],
    components: [actionRow1, actionRow2, buttonRow],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Enhanced countdown with live updates and participant tracking
 */
async function startEnhancedCountdown(
  interaction: ChatInputCommandInteraction,
  session: any,
  gameService: GameService,
  seconds: number,
) {
  const originalMessage = await interaction.fetchReply();
  let currentSeconds = seconds;
  let participantCount = 0;

  // Set up button collector for the countdown period
  const collector = originalMessage.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: seconds * 1000,
  });

  collector.on('collect', async (buttonInteraction: any) => {
    if (buttonInteraction.customId === `quiz_join_${session.id}`) {
      const joined = await gameService.joinQuiz(
        session.id,
        buttonInteraction.user.id,
        buttonInteraction.user.username,
      );

      if (joined) {
        participantCount++;
        await buttonInteraction.reply({
          content: '✅ **Entrada confirmada!** Você está pronto para a batalha! 🎯',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await buttonInteraction.reply({
          content: '⚠️ **Já participando!** Você já está registrado neste quiz.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } else if (buttonInteraction.customId === `quiz_info_${session.id}`) {
      const categoryInfo = getCategoryInfo(session.settings.category);
      const difficultyInfo = getDifficultyInfo(session.settings.difficulty);
      
      const infoEmbed = new EmbedBuilder()
        .setTitle('📋 Regras do Quiz PUBG')
        .setDescription(
          '**Como Funciona:**\n' +
          '• Responda as perguntas usando os botões A, B, C, D\n' +
          '• Cada resposta correta ganha pontos baseados na dificuldade\n' +
          '• Respostas rápidas ganham bônus de tempo\n' +
          '• Sequências de acertos ganham bônus de streak\n\n' +
          '**Sistema de Pontuação:**\n' +
          `• Resposta correta: **${getPointsForDifficulty(session.settings.difficulty)} pontos**\n` +
          '• Bônus de tempo: **até +25%** (resposta em <50% do tempo)\n' +
          '• Bônus de streak: **+10%** por resposta consecutiva\n\n' +
          '**Recompensas Finais:**\n' +
          `• **${getXPReward(session.settings.difficulty, session.settings.questionCount)} XP** para o vencedor\n` +
          `• **${getCoinReward(session.settings.difficulty, session.settings.questionCount)} Moedas** para o vencedor\n` +
          '• **Badges especiais** para conquistas\n' +
          '• **XP de participação** para todos',
        )
        .setColor(categoryInfo.color)
        .addFields(
          {
            name: '🎯 Configuração Atual',
            value: `**Categoria:** ${categoryInfo.name}\n**Dificuldade:** ${difficultyInfo.name}\n**Perguntas:** ${session.settings.questionCount}\n**Tempo:** ${session.settings.timePerQuestion}s`,
            inline: true,
          },
          {
            name: '🏆 Ranking de Recompensas',
            value: '**1º lugar:** 100% das recompensas\n**2º lugar:** 75% das recompensas\n**3º lugar:** 50% das recompensas\n**Participação:** 25% das recompensas',
            inline: true,
          },
        )
        .setFooter({ text: 'Boa sorte na batalha! 🎮' })
        .setTimestamp();

      await buttonInteraction.reply({ embeds: [infoEmbed], flags: MessageFlags.Ephemeral });
    } else if (buttonInteraction.customId === `quiz_cancel_${session.id}`) {
      if (buttonInteraction.user.id === session.hostId) {
        collector.stop('cancelled');
        
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Quiz Cancelado')
          .setDescription('O quiz foi cancelado pelo host.')
          .setColor(0xff4444)
          .setTimestamp();

        await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
        return;
      } else {
        await buttonInteraction.reply({
          content: '⚠️ Apenas o host pode cancelar o quiz.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  });

  // Countdown timer with live updates
  const countdownInterval = setInterval(async () => {
    currentSeconds--;
    
    if (currentSeconds <= 0) {
      clearInterval(countdownInterval);
      collector.stop('timeout');
      await startQuizQuestions(interaction, session, gameService);
      return;
    }

    // Update embed every 5 seconds or in the last 5 seconds
    if (currentSeconds % 5 === 0 || currentSeconds <= 5) {
      const categoryInfo = getCategoryInfo(session.settings.category);
      const difficultyInfo = getDifficultyInfo(session.settings.difficulty);
      
      const updatedEmbed = new EmbedBuilder()
        .setTitle(`${categoryInfo.emoji} ${categoryInfo.name} - Quiz Iniciado!`)
        .setDescription(
          '🎯 **Prepare-se para o desafio!**\n\n' +
          `${difficultyInfo.emoji} **Nível:** ${difficultyInfo.name}\n` +
          `📊 **Perguntas:** ${session.settings.questionCount} questões\n` +
          `⏱️ **Tempo:** ${session.settings.timePerQuestion}s por pergunta\n` +
          '🏆 **Recompensas:** XP + Moedas + Badges\n\n' +
          `\`\`\`diff\n${currentSeconds <= 5 ? '! ' : '+ '}Quiz começando em ${currentSeconds} segundo${currentSeconds !== 1 ? 's' : ''}...\n\`\`\`\n` +
          `${currentSeconds <= 5 ? '🔥 **ÚLTIMOS SEGUNDOS!** 🔥' : '*Ainda dá tempo de entrar!*'}`,
        )
        .setColor(currentSeconds <= 5 ? 0xff4444 : categoryInfo.color)
        .setThumbnail(categoryInfo.thumbnail)
        .addFields(
          { 
            name: '🎮 Informações da Sessão', 
            value: `\`\`\`yaml\nID: ${session.id.slice(-8)}\nCanal: #${interaction.channel?.name || 'quiz'}\nHost: ${interaction.user.username}\`\`\``, 
            inline: false, 
          },
          { 
            name: '🏅 Sistema de Pontuação', 
            value: `• Resposta correta: **+${getPointsForDifficulty(session.settings.difficulty)} pts**\n• Streak bonus: **+50% pts**\n• Tempo bonus: **até +25% pts**`, 
            inline: true, 
          },
          { 
            name: '🎁 Recompensas Possíveis', 
            value: `• **${getXPReward(session.settings.difficulty, session.settings.questionCount)} XP**\n• **${getCoinReward(session.settings.difficulty, session.settings.questionCount)} Moedas**\n• **Badges especiais**`, 
            inline: true, 
          },
        )
        .setFooter({ 
          text: `PUBG Quiz System • Participantes: ${participantCount}/${getMaxParticipants()}`, 
          iconURL: 'https://cdn.discordapp.com/emojis/852869487845515264.png', 
        })
        .setTimestamp();

      try {
        await interaction.editReply({ embeds: [updatedEmbed] });
      } catch (error) {
        // Ignore edit errors during countdown
      }
    }
  }, 1000);

  collector.on('end', (collected, reason) => {
    clearInterval(countdownInterval);
    if (reason === 'cancelled') {
      return; // Already handled in the cancel button
    }
  });
}

/**
 * Start the actual quiz questions
 */
async function startQuizQuestions(
  interaction: ChatInputCommandInteraction,
  session: any,
  gameService: GameService,
) {
  try {
    // Check if we have participants
    const participants = Array.from(session.participants.values());
    if (!participants || participants.length === 0) {
      const noParticipantsEmbed = new EmbedBuilder()
        .setTitle('😔 Quiz Cancelado')
        .setDescription(
          '**Nenhum participante se inscreveu!**\n\n' +
          'O quiz foi cancelado por falta de participantes.\n' +
          'Tente novamente mais tarde quando houver mais pessoas online.',
        )
        .setColor(0xff6b6b)
        .setThumbnail('https://cdn.discordapp.com/emojis/852869487845515264.png')
        .setFooter({ text: 'PUBG Quiz System • Tente novamente mais tarde' })
        .setTimestamp();

      await interaction.editReply({ embeds: [noParticipantsEmbed], components: [] });
      return;
    }

    // Start the quiz
    const categoryInfo = getCategoryInfo(session.settings.category);
    const startEmbed = new EmbedBuilder()
      .setTitle(`🚀 ${categoryInfo.name} - Quiz Iniciado!`)
      .setDescription(
        '**A batalha começou!** 🎯\n\n' +
        `👥 **${participants.length} guerreiros** entraram na arena\n` +
        `📊 **${session.settings.questionCount} perguntas** te aguardam\n` +
        `⏱️ **${session.settings.timePerQuestion}s** por pergunta\n\n` +
        '```yaml\nPrimeira pergunta chegando em 3 segundos...```',
      )
      .setColor(categoryInfo.color)
      .setThumbnail(categoryInfo.thumbnail)
      .addFields(
        {
          name: '🏆 Participantes',
          value: participants.map((p: any, i: number) => `${i + 1}. ${p.username}`).join('\n') || 'Nenhum',
          inline: true,
        },
        {
          name: '🎯 Meta',
          value: 'Responda corretamente\ne seja o **#1** no ranking!',
          inline: true,
        },
      )
      .setFooter({ text: 'PUBG Quiz System • Boa sorte a todos!' })
      .setTimestamp();

    await interaction.editReply({ embeds: [startEmbed], components: [] });

    // Wait 3 seconds before starting questions
    await new Promise(resolve => setTimeout(resolve, 3000));

    // The quiz session is already created and active, no need to start it again
    // The GameService will handle the rest of the quiz flow through other methods

    // The GameService will handle the rest of the quiz flow
    // including questions, answers, scoring, and final results
    
  } catch (error) {
    console.error('Error starting quiz questions:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro no Quiz')
      .setDescription(
        '**Ocorreu um erro ao iniciar o quiz!**\n\n' +
        'Por favor, tente novamente em alguns instantes.\n' +
        'Se o problema persistir, contate um administrador.',
      )
      .setColor(0xff4444)
      .setFooter({ text: 'PUBG Quiz System • Erro interno' })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
}

export default quiz;
