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
import { GameService, QuizSettings } from '../../services/game.service';
import { DatabaseService } from '../../database/database.service';

/**
 * Quiz command - Interactive PUBG and gaming quizzes
 */
const quiz: Command = {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('🧠 Inicia um quiz interativo sobre PUBG e gaming')
    .addStringOption(option =>
      option
        .setName('category')
        .setDescription('Categoria do quiz')
        .setRequired(false)
        .addChoices(
          { name: '🎮 PUBG', value: 'pubg' },
          { name: '🎯 Gaming Geral', value: 'gaming' },
          { name: '🏆 Esports', value: 'esports' },
          { name: '🎲 Misto', value: 'mixed' },
        ),
    )
    .addStringOption(option =>
      option
        .setName('difficulty')
        .setDescription('Dificuldade do quiz')
        .setRequired(false)
        .addChoices(
          { name: '🟢 Fácil', value: 'easy' },
          { name: '🟡 Médio', value: 'medium' },
          { name: '🔴 Difícil', value: 'hard' },
          { name: '🌈 Misto', value: 'mixed' },
        ),
    )
    .addIntegerOption(option =>
      option
        .setName('questions')
        .setDescription('Número de perguntas (5-20)')
        .setRequired(false)
        .setMinValue(5)
        .setMaxValue(20),
    )
    .addIntegerOption(option =>
      option
        .setName('time')
        .setDescription('Tempo por pergunta em segundos (15-120)')
        .setRequired(false)
        .setMinValue(15)
        .setMaxValue(120),
    ) as SlashCommandBuilder,

  category: CommandCategory.GENERAL,
  cooldown: 30,

  async execute(interaction: any, client: ExtendedClient) {
    const logger = new Logger();
    const gameService = new GameService(client);
    const database = new DatabaseService();

    try {
      // Get options
      const category = interaction.options.getString('category') || 'pubg';
      const difficulty = interaction.options.getString('difficulty') || 'mixed';
      const questionCount = interaction.options.getInteger('questions') || 10;
      const timePerQuestion = interaction.options.getInteger('time') || 30;

      // Check if user is registered
      const user = await database.client.user.findUnique({
        where: { id: interaction.user.id },
      });

      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Usuário Não Registrado')
          .setDescription(
            'Você precisa se registrar primeiro usando `/register` para participar de quizzes!',
          )
          .setColor(0xff0000)
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Check if there's already an active quiz in this channel
      const existingSession = gameService.getQuizSession(
        `${interaction.guildId}_${interaction.channelId}`,
      );
      if (existingSession && existingSession.isActive) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Quiz Já Ativo')
          .setDescription(
            'Já existe um quiz ativo neste canal! Aguarde ele terminar ou participe dele.',
          )
          .setColor(0xffa500)
          .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Create quiz settings
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

      // Create initial embed
      const embed = new EmbedBuilder()
        .setTitle('🧠 Quiz Iniciado!')
        .setDescription(
          `**Categoria:** ${getCategoryName(category)}\n` +
            `**Dificuldade:** ${getDifficultyName(difficulty)}\n` +
            `**Perguntas:** ${questionCount}\n` +
            `**Tempo por pergunta:** ${timePerQuestion}s\n\n` +
            '🎯 **Como participar:**\n' +
            '• Clique em "Participar" para entrar no quiz\n' +
            '• Responda as perguntas usando os botões\n' +
            '• Ganhe XP e moedas baseado na sua performance!\n\n' +
            '⏰ O quiz começará em 30 segundos...',
        )
        .setColor(0x0099ff)
        .setFooter({ text: `Host: ${interaction.user.username}` })
        .setTimestamp();

      const joinButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`quiz_join_${session.id}`)
          .setLabel('🎯 Participar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`quiz_info_${session.id}`)
          .setLabel('ℹ️ Informações')
          .setStyle(ButtonStyle.Secondary),
      );

      const response = await interaction.reply({
        embeds: [embed],
        components: [joinButton],
      });

      // Auto-join the host
      await gameService.joinQuiz(session.id, interaction.user.id, interaction.user.username);

      // Set up button collector for joining
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30000, // 30 seconds to join
      });

      collector.on('collect', async (buttonInteraction: any) => {
        if (buttonInteraction.customId === `quiz_join_${session.id}`) {
          const joined = await gameService.joinQuiz(
            session.id,
            buttonInteraction.user.id,
            buttonInteraction.user.username,
          );

          if (joined) {
            await buttonInteraction.reply({
              content: '✅ Você entrou no quiz! Prepare-se para as perguntas.',
              flags: MessageFlags.Ephemeral,
            });
          } else {
            await buttonInteraction.reply({
              content: '❌ Não foi possível entrar no quiz. Você já pode estar participando.',
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (buttonInteraction.customId === `quiz_info_${session.id}`) {
          const infoEmbed = new EmbedBuilder()
            .setTitle('ℹ️ Informações do Quiz')
            .setDescription(
              '**Sistema de Pontuação:**\n' +
                '• Resposta correta: +pontos base\n' +
                '• Streak bonus: +25% por resposta consecutiva\n' +
                '• Tempo bonus: +10% se responder em <50% do tempo\n\n' +
                '**Recompensas:**\n' +
                '• 1º lugar: 100 XP + 50 moedas\n' +
                '• 2º lugar: 75 XP + 35 moedas\n' +
                '• 3º lugar: 50 XP + 25 moedas\n' +
                '• Participação: 25 XP + 10 moedas\n\n' +
                '**Dificuldades:**\n' +
                '• 🟢 Fácil: 10 pontos\n' +
                '• 🟡 Médio: 15 pontos\n' +
                '• 🔴 Difícil: 20 pontos',
            )
            .setColor(0x0099ff)
            .setTimestamp();

          await buttonInteraction.reply({ embeds: [infoEmbed], flags: MessageFlags.Ephemeral });
        }
      });

      // Start the quiz after 30 seconds
      setTimeout(async () => {
        collector.stop();
        await startQuizQuestions(interaction, session, gameService);
      }, 30000);
    } catch (error) {
      logger.error('Error in quiz command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao iniciar o quiz. Tente novamente.')
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
 * Start quiz questions
 */
async function startQuizQuestions(
  interaction: ChatInputCommandInteraction,
  session: any,
  gameService: GameService,
) {
  const currentQuestion = session.questions[session.currentQuestionIndex];

  if (!currentQuestion) {
    await endQuiz(interaction, session, gameService);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🧠 Pergunta ${session.currentQuestionIndex + 1}/${session.questions.length}`)
    .setDescription(
      `**${currentQuestion.question}**\n\n` +
        currentQuestion.options
          .map((option: string, index: number) => `${['🅰️', '🅱️', '🅲️', '🅳️'][index]} ${option}`)
          .join('\n'),
    )
    .setColor(getDifficultyColor(currentQuestion.difficulty))
    .setFooter({
      text: `⏰ ${currentQuestion.timeLimit}s • 💎 ${currentQuestion.points} pontos • Participantes: ${session.participants.size}`,
    })
    .setTimestamp();

  const answerButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...currentQuestion.options.slice(0, 4).map((_: string, index: number) =>
      new ButtonBuilder()
        .setCustomId(`quiz_answer_${session.id}_${index}`)
        .setLabel(['🅰️', '🅱️', '🅲️', '🅳️'][index] || `Opção ${index + 1}`)
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  const response = await interaction.editReply({
    embeds: [embed],
    components: [answerButtons],
  });

  // Set up answer collector
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: currentQuestion.timeLimit * 1000,
  });

  const answeredUsers = new Set<string>();

  collector.on('collect', async buttonInteraction => {
    if (answeredUsers.has(buttonInteraction.user.id)) {
      await buttonInteraction.reply({
        content: '❌ Você já respondeu esta pergunta!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const answerIndex = parseInt(buttonInteraction.customId.split('_')[3] || '0');
    const result = await gameService.submitQuizAnswer(
      session.id,
      buttonInteraction.user.id,
      answerIndex,
    );

    if (result) {
      answeredUsers.add(buttonInteraction.user.id);

      const emoji = result.correct ? '✅' : '❌';
      const streakText = result.streak > 1 ? ` (🔥 ${result.streak}x streak!)` : '';

      await buttonInteraction.reply({
        content: `${emoji} ${result.correct ? 'Correto' : 'Incorreto'}! +${result.points} pontos${streakText}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  });

  collector.on('end', async () => {
    // Show correct answer
    const correctEmbed = new EmbedBuilder()
      .setTitle('✅ Resposta Correta')
      .setDescription(
        `**${currentQuestion.question}**\n\n` +
          `**Resposta:** ${['🅰️', '🅱️', '🅲️', '🅳️'][currentQuestion.correctAnswer]} ${currentQuestion.options[currentQuestion.correctAnswer]}`,
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({
      embeds: [correctEmbed],
      components: [],
    });

    // Move to next question after 3 seconds
    setTimeout(async () => {
      session.currentQuestionIndex++;
      await startQuizQuestions(interaction, session, gameService);
    }, 3000);
  });
}

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
 * Helper functions
 */
function getCategoryName(category: string): string {
  const names = {
    pubg: '🎮 PUBG',
    gaming: '🎯 Gaming Geral',
    esports: '🏆 Esports',
    mixed: '🎲 Misto',
  };
  return names[category as keyof typeof names] || '🎲 Misto';
}

function getDifficultyName(difficulty: string): string {
  const names = {
    easy: '🟢 Fácil',
    medium: '🟡 Médio',
    hard: '🔴 Difícil',
    mixed: '🌈 Misto',
  };
  return names[difficulty as keyof typeof names] || '🌈 Misto';
}

function getDifficultyColor(difficulty: string): number {
  const colors = {
    easy: 0x00ff00,
    medium: 0xffa500,
    hard: 0xff0000,
  };
  return colors[difficulty as keyof typeof colors] || 0x0099ff;
}

export default quiz;
