import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  ChatInputCommandInteraction,
  User,
  TextChannel,
} from 'discord.js';
import { ExtendedClient } from '../../types/client';
import {
  InteractiveQuizService,
  QuizSession,
  QuizSettings,
  QuizCategory,
  QuizQuestion,
} from '../../services/interactive-quiz.service';
import { BaseCommand } from '../../utils/base-command.util';
import { CommandCategory } from '../../types/command';

class InteractiveQuizCommand extends BaseCommand {
  constructor() {
    super({
      category: CommandCategory.GENERAL,
      cooldown: 3,
  data: new SlashCommandBuilder()
    .setName('quiz-interativo')
    .setDescription('Sistema de quizzes interativos aprimorado')
    .addSubcommand(subcommand =>
      subcommand
        .setName('criar')
        .setDescription('Criar uma nova sessão de quiz')
        .addStringOption(option =>
          option
            .setName('categoria')
            .setDescription('Categoria do quiz')
            .setRequired(true)
            .addChoices(
              { name: '🗺️ PUBG - Mapas & Localizações', value: 'pubg_maps' },
              { name: '🔫 PUBG - Armas & Equipamentos', value: 'pubg_weapons' },
              { name: '🏆 PUBG - Esports & Competitivo', value: 'pubg_esports' },
              { name: '⚙️ PUBG - Mecânicas & Sistema', value: 'pubg_mechanics' },
              { name: '🎮 Gaming Geral', value: 'gaming_general' },
              { name: '🎯 Esports Geral', value: 'esports_general' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('dificuldade')
            .setDescription('Nível de dificuldade')
            .setRequired(false)
            .addChoices(
              { name: '🟢 Fácil', value: 'easy' },
              { name: '🟡 Médio', value: 'medium' },
              { name: '🔴 Difícil', value: 'hard' },
              { name: '🌈 Misto', value: 'mixed' },
              { name: '🧠 Adaptativo', value: 'adaptive' },
            ),
        )
        .addIntegerOption(option =>
          option
            .setName('perguntas')
            .setDescription('Número de perguntas (5-50)')
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(50),
        )
        .addIntegerOption(option =>
          option
            .setName('tempo')
            .setDescription('Tempo por pergunta em segundos (10-120)')
            .setRequired(false)
            .setMinValue(10)
            .setMaxValue(120),
        )
        .addIntegerOption(option =>
          option
            .setName('max-participantes')
            .setDescription('Máximo de participantes (2-20)')
            .setRequired(false)
            .setMinValue(2)
            .setMaxValue(20),
        )
        .addBooleanOption(option =>
          option.setName('dicas').setDescription('Permitir dicas durante o quiz').setRequired(false),
        )
        .addBooleanOption(option =>
          option
            .setName('explicacoes')
            .setDescription('Mostrar explicações após cada pergunta')
            .setRequired(false),
        )
        .addBooleanOption(option =>
          option
            .setName('power-ups')
            .setDescription('Habilitar power-ups durante o quiz')
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('participar')
        .setDescription('Participar de uma sessão de quiz ativa')
        .addStringOption(option =>
          option.setName('sessao').setDescription('ID da sessão de quiz').setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('iniciar')
        .setDescription('Iniciar uma sessão de quiz criada')
        .addStringOption(option =>
          option.setName('sessao').setDescription('ID da sessão de quiz').setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Ver status de uma sessão de quiz')
        .addStringOption(option =>
          option.setName('sessao').setDescription('ID da sessão de quiz').setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('estatisticas')
        .setDescription('Ver suas estatísticas de quiz')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para ver estatísticas (deixe vazio para suas próprias)')
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ranking')
        .setDescription('Ver ranking de uma categoria')
        .addStringOption(option =>
          option
            .setName('categoria')
            .setDescription('Categoria do ranking')
            .setRequired(true)
            .addChoices(
              { name: '🗺️ PUBG - Mapas & Localizações', value: 'pubg_maps' },
              { name: '🔫 PUBG - Armas & Equipamentos', value: 'pubg_weapons' },
              { name: '🏆 PUBG - Esports & Competitivo', value: 'pubg_esports' },
              { name: '⚙️ PUBG - Mecânicas & Sistema', value: 'pubg_mechanics' },
              { name: '🎮 Gaming Geral', value: 'gaming_general' },
              { name: '🎯 Esports Geral', value: 'esports_general' },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('categorias').setDescription('Ver todas as categorias disponíveis'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('adicionar-pergunta')
        .setDescription('Adicionar uma pergunta personalizada (Admin apenas)')
        .addStringOption(option =>
          option.setName('pergunta').setDescription('Texto da pergunta').setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('opcoes')
            .setDescription('Opções separadas por | (ex: Opção1|Opção2|Opção3|Opção4)')
            .setRequired(true),
        )
        .addIntegerOption(option =>
          option
            .setName('resposta-correta')
            .setDescription('Índice da resposta correta (1-4)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(4),
        )
        .addStringOption(option =>
          option
            .setName('categoria')
            .setDescription('Categoria da pergunta')
            .setRequired(true)
            .addChoices(
              { name: '🗺️ PUBG - Mapas & Localizações', value: 'pubg_maps' },
              { name: '🔫 PUBG - Armas & Equipamentos', value: 'pubg_weapons' },
              { name: '🏆 PUBG - Esports & Competitivo', value: 'pubg_esports' },
              { name: '⚙️ PUBG - Mecânicas & Sistema', value: 'pubg_mechanics' },
              { name: '🎮 Gaming Geral', value: 'gaming_general' },
              { name: '🎯 Esports Geral', value: 'esports_general' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('dificuldade')
            .setDescription('Dificuldade da pergunta')
            .setRequired(true)
            .addChoices(
              { name: '🟢 Fácil', value: 'easy' },
              { name: '🟡 Médio', value: 'medium' },
              { name: '🔴 Difícil', value: 'hard' },
              { name: '⚫ Expert', value: 'expert' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('explicacao')
            .setDescription('Explicação da resposta correta')
            .setRequired(false),
        )
        .addIntegerOption(option =>
          option
            .setName('pontos')
            .setDescription('Pontos da pergunta (5-50)')
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(50),
        )
        .addIntegerOption(option =>
          option
            .setName('tempo')
            .setDescription('Tempo limite em segundos (10-120)')
            .setRequired(false)
            .setMinValue(10)
            .setMaxValue(120),
        ),
    ) as SlashCommandBuilder,
    });
  }

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as ExtendedClient;
    const quizService = (client as any).interactiveQuizService as InteractiveQuizService;

    if (!quizService) {
      return interaction.reply({
        content: '❌ Serviço de quiz não está disponível no momento.',
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'criar':
          await this.handleCreateQuiz(interaction, quizService);
          break;
        case 'participar':
          await this.handleJoinQuiz(interaction, quizService);
          break;
        case 'iniciar':
          await this.handleStartQuiz(interaction, quizService);
          break;
        case 'status':
          await this.handleQuizStatus(interaction, quizService);
          break;
        case 'estatisticas':
          await this.handleUserStats(interaction, quizService);
          break;
        case 'ranking':
          await this.handleLeaderboard(interaction, quizService);
          break;
        case 'categorias':
          await this.handleCategories(interaction, quizService);
          break;
        case 'adicionar-pergunta':
          await this.handleAddQuestion(interaction, quizService);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            ephemeral: true,
          });
      }
    } catch (error: any) {
      console.error('Error in interactive quiz command:', error);

      const errorMessage = error.message || 'Ocorreu um erro inesperado.';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `❌ ${errorMessage}`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `❌ ${errorMessage}`,
          ephemeral: true,
        });
      }
    }
  }

  async handleCreateQuiz(
    interaction: ChatInputCommandInteraction,
    quizService: InteractiveQuizService,
  ) {
    const category = interaction.options.getString('categoria', true);
    const difficulty = interaction.options.getString('dificuldade') || 'mixed';
    const questionCount = interaction.options.getInteger('perguntas') || 10;
    const timePerQuestion = interaction.options.getInteger('tempo') || 30;
    const maxParticipants = interaction.options.getInteger('max-participantes') || 10;
    const allowHints = interaction.options.getBoolean('dicas') ?? true;
    const showExplanations = interaction.options.getBoolean('explicacoes') ?? true;
    const enablePowerUps = interaction.options.getBoolean('power-ups') ?? false;

    const settings: QuizSettings = {
      category,
      difficulty: difficulty as any,
      questionCount,
      timePerQuestion,
      maxParticipants,
      allowHints,
      showExplanations,
      enablePowerUps,
      prizeMode: 'top-3',
    };

    const session = await quizService.createQuizSession(
      interaction.user.id,
      interaction.channelId,
      interaction.guildId!,
      settings,
    );

    const categoryInfo = quizService.getCategories().find(c => c.id === category);
    const difficultyEmoji = {
      easy: '🟢',
      medium: '🟡',
      hard: '🔴',
      expert: '⚫',
      mixed: '🌈',
      adaptive: '🧠',
    };

    const embed = new EmbedBuilder()
      .setTitle('🎯 Nova Sessão de Quiz Criada!')
      .setDescription(`**ID da Sessão:** \`${session.id}\`\n\n**Configurações:**`)
      .addFields(
        {
          name: '📂 Categoria',
          value: `${categoryInfo?.icon} ${categoryInfo?.name}`,
          inline: true,
        },
        {
          name: '⚡ Dificuldade',
          value: `${difficultyEmoji[difficulty as keyof typeof difficultyEmoji]} ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`,
          inline: true,
        },
        {
          name: '❓ Perguntas',
          value: `${questionCount} perguntas`,
          inline: true,
        },
        {
          name: '⏱️ Tempo por Pergunta',
          value: `${timePerQuestion} segundos`,
          inline: true,
        },
        {
          name: '👥 Máx. Participantes',
          value: `${maxParticipants} jogadores`,
          inline: true,
        },
        {
          name: '🎁 Prêmio Total',
          value: `${session.totalPrizePool} moedas`,
          inline: true,
        },
        {
          name: '⚙️ Recursos',
          value: [
            allowHints ? '💡 Dicas habilitadas' : '🚫 Dicas desabilitadas',
            showExplanations ? '📖 Explicações habilitadas' : '🚫 Explicações desabilitadas',
            enablePowerUps ? '⚡ Power-ups habilitados' : '🚫 Power-ups desabilitados',
          ].join('\n'),
          inline: false,
        },
      )
      .setColor(categoryInfo?.color || 0x00ae86)
      .setFooter({ text: 'Use /quiz-interativo participar para entrar na sessão!' })
      .setTimestamp();

    const joinButton = new ButtonBuilder()
      .setCustomId(`quiz_join_${session.id}`)
      .setLabel('🎯 Participar')
      .setStyle(ButtonStyle.Primary);

    const startButton = new ButtonBuilder()
      .setCustomId(`quiz_start_${session.id}`)
      .setLabel('▶️ Iniciar Quiz')
      .setStyle(ButtonStyle.Success);

    const statusButton = new ButtonBuilder()
      .setCustomId(`quiz_status_${session.id}`)
      .setLabel('📊 Status')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      joinButton,
      startButton,
      statusButton,
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });

    // Set up button interactions
    const collector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 600000, // 10 minutes
    });

    collector?.on('collect', async buttonInteraction => {
      if (buttonInteraction.customId.startsWith('quiz_join_')) {
        await this.handleJoinButton(buttonInteraction, quizService, session.id);
      } else if (buttonInteraction.customId.startsWith('quiz_start_')) {
        await this.handleStartButton(buttonInteraction, quizService, session.id);
      } else if (buttonInteraction.customId.startsWith('quiz_status_')) {
        await this.handleStatusButton(buttonInteraction, quizService, session.id);
      }
    });
  }

  async handleJoinQuiz(
    interaction: ChatInputCommandInteraction,
    quizService: InteractiveQuizService,
  ) {
    const sessionId = interaction.options.getString('sessao', true);

    const joined = await quizService.joinQuizSession(sessionId, interaction.user);

    if (joined) {
      await interaction.reply({
        content: '✅ Você entrou na sessão de quiz com sucesso!',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '⚠️ Você já está participando desta sessão.',
        ephemeral: true,
      });
    }
  }

  async handleStartQuiz(
    interaction: ChatInputCommandInteraction,
    quizService: InteractiveQuizService,
  ) {
    const sessionId = interaction.options.getString('sessao', true);
    const session = quizService.getQuizSession(sessionId);

    if (!session) {
      return interaction.reply({
        content: '❌ Sessão de quiz não encontrada.',
        ephemeral: true,
      });
    }

    if (session.hostId !== interaction.user.id) {
      return interaction.reply({
        content: '❌ Apenas o criador da sessão pode iniciar o quiz.',
        ephemeral: true,
      });
    }

    await quizService.startQuizSession(sessionId);

    await interaction.reply({
      content: '🚀 Quiz iniciado! A primeira pergunta será enviada em breve.',
      ephemeral: true,
    });

    // Start the quiz loop
    await this.runQuizLoop(interaction.channel as TextChannel, quizService, sessionId);
  }

  async handleQuizStatus(
    interaction: ChatInputCommandInteraction,
    quizService: InteractiveQuizService,
  ) {
    const sessionId = interaction.options.getString('sessao', true);
    const session = quizService.getQuizSession(sessionId);

    if (!session) {
      return interaction.reply({
        content: '❌ Sessão de quiz não encontrada.',
        ephemeral: true,
      });
    }

    const statusEmoji = {
      waiting: '⏳',
      active: '🔴',
      paused: '⏸️',
      finished: '✅',
    };

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji[session.status]} Status da Sessão`)
      .setDescription(`**ID:** \`${session.id}\``)
      .addFields(
        {
          name: '📊 Status',
          value: session.status.charAt(0).toUpperCase() + session.status.slice(1),
          inline: true,
        },
        {
          name: '👥 Participantes',
          value: `${session.participants.size}/${session.settings.maxParticipants}`,
          inline: true,
        },
        {
          name: '❓ Progresso',
          value: `${session.currentQuestionIndex}/${session.questions.length}`,
          inline: true,
        },
      )
      .setColor(0x00ae86)
      .setTimestamp();

    if (session.participants.size > 0) {
      const participantsList = Array.from(session.participants.values())
        .map(p => `• ${p.username} - ${p.score} pts`)
        .slice(0, 10)
        .join('\n');

      embed.addFields({
        name: '🏆 Participantes',
        value: participantsList || 'Nenhum participante',
        inline: false,
      });
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  async handleUserStats(
    interaction: ChatInputCommandInteraction,
    quizService: InteractiveQuizService,
  ) {
    const targetUser = interaction.options.getUser('usuario') || interaction.user;
    const stats = await quizService.getUserStats(targetUser.id);

    const embed = new EmbedBuilder()
      .setTitle(`📊 Estatísticas de Quiz - ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        {
          name: '🎯 Quizzes Completados',
          value: stats.totalQuizzes.toString(),
          inline: true,
        },
        {
          name: '❓ Perguntas Respondidas',
          value: stats.totalQuestions.toString(),
          inline: true,
        },
        {
          name: '📈 Pontuação Média',
          value: Math.round(stats.averageScore).toString(),
          inline: true,
        },
        {
          name: '🔥 Melhor Sequência',
          value: stats.bestStreak.toString(),
          inline: true,
        },
        {
          name: '❤️ Categoria Favorita',
          value: stats.favoriteCategory,
          inline: true,
        },
        {
          name: '⏱️ Tempo Total',
          value: `${Math.round(stats.totalTimeSpent / 60)} min`,
          inline: true,
        },
      )
      .setColor(0x00ae86)
      .setTimestamp();

    if (stats.achievements.length > 0) {
      const achievementsList = stats.achievements
        .slice(0, 5)
        .map(a => `${a.icon} ${a.name}`)
        .join('\n');

      embed.addFields({
        name: '🏆 Conquistas Recentes',
        value: achievementsList,
        inline: false,
      });
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  async handleLeaderboard(
    interaction: ChatInputCommandInteraction,
    quizService: InteractiveQuizService,
  ) {
    const category = interaction.options.getString('categoria', true);
    const leaderboard = await quizService.getCategoryLeaderboard(category, 10);

    const categoryInfo = quizService.getCategories().find(c => c.id === category);

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Ranking - ${categoryInfo?.name}`)
      .setDescription('Top 10 jogadores nesta categoria')
      .setColor(categoryInfo?.color || 0x00ae86)
      .setTimestamp();

    if (leaderboard.length === 0) {
      embed.addFields({
        name: '📭 Nenhum Dado',
        value: 'Ainda não há estatísticas para esta categoria.',
        inline: false,
      });
    } else {
      const rankings = leaderboard
        .map((user, index) => {
          const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
          return `${medal} **${user.username}** - ${user.total_score} pts (${user.quiz_count} quizzes)`;
        })
        .join('\n');

      embed.addFields({
        name: '🏆 Rankings',
        value: rankings,
        inline: false,
      });
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  async handleCategories(
    interaction: ChatInputCommandInteraction,
    quizService: InteractiveQuizService,
  ) {
    const categories = quizService.getCategories();

    const embed = new EmbedBuilder()
      .setTitle('📚 Categorias de Quiz Disponíveis')
      .setDescription('Escolha uma categoria para seus quizzes!')
      .setColor(0x00ae86)
      .setTimestamp();

    for (const category of categories) {
      const difficultyText = {
        easy: '🟢 Fácil',
        medium: '🟡 Médio',
        hard: '🔴 Difícil',
        mixed: '🌈 Misto',
      };

      embed.addFields({
        name: `${category.icon} ${category.name}`,
        value: [
          category.description,
          `**Perguntas:** ${category.totalQuestions}`,
          `**Dificuldade:** ${difficultyText[category.difficulty as keyof typeof difficultyText]}`,
          `**Subcategorias:** ${category.subcategories.length}`,
        ].join('\n'),
        inline: true,
      });
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  async handleAddQuestion(
    interaction: ChatInputCommandInteraction,
    quizService: InteractiveQuizService,
  ) {
    // Check if user has admin permissions
    if (!interaction.memberPermissions?.has('Administrator')) {
      return interaction.reply({
        content: '❌ Você precisa de permissões de administrador para adicionar perguntas.',
        ephemeral: true,
      });
    }

    const question = interaction.options.getString('pergunta', true);
    const optionsStr = interaction.options.getString('opcoes', true);
    const correctAnswer = interaction.options.getInteger('resposta-correta', true) - 1; // Convert to 0-based index
    const category = interaction.options.getString('categoria', true);
    const difficulty = interaction.options.getString('dificuldade', true);
    const explanation = interaction.options.getString('explicacao');
    const points = interaction.options.getInteger('pontos') || 15;
    const timeLimit = interaction.options.getInteger('tempo') || 30;

    const options = optionsStr.split('|').map(opt => opt.trim());

    if (options.length < 2 || options.length > 4) {
      return interaction.reply({
        content: '❌ Você deve fornecer entre 2 e 4 opções separadas por |',
        ephemeral: true,
      });
    }

    if (correctAnswer < 0 || correctAnswer >= options.length) {
      return interaction.reply({
        content: '❌ Índice da resposta correta inválido.',
        ephemeral: true,
      });
    }

    try {
      const questionId = await quizService.addCustomQuestion({
        question,
        options,
        correctAnswer,
        difficulty: difficulty as any,
        category,
        points,
        timeLimit,
        explanation: explanation || undefined,
        tags: ['custom', category],
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Pergunta Adicionada com Sucesso!')
        .setDescription(`**ID:** \`${questionId}\``)
        .addFields(
          {
            name: '❓ Pergunta',
            value: question,
            inline: false,
          },
          {
            name: '📝 Opções',
            value: options.map((opt, i) => `${i + 1}. ${opt}`).join('\n'),
            inline: false,
          },
          {
            name: '✅ Resposta Correta',
            value: `${correctAnswer + 1}. ${options[correctAnswer]}`,
            inline: true,
          },
          {
            name: '📂 Categoria',
            value: category,
            inline: true,
          },
          {
            name: '⚡ Dificuldade',
            value: difficulty,
            inline: true,
          },
        )
        .setColor(0x00ff00)
        .setTimestamp();

      if (explanation) {
        embed.addFields({
          name: '💡 Explicação',
          value: explanation,
          inline: false,
        });
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error: any) {
      await interaction.reply({
        content: `❌ Erro ao adicionar pergunta: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  async handleJoinButton(
    buttonInteraction: any,
    quizService: InteractiveQuizService,
    sessionId: string,
  ) {
    try {
      const joined = await quizService.joinQuizSession(sessionId, buttonInteraction.user);

      if (joined) {
        await buttonInteraction.reply({
          content: '✅ Você entrou na sessão de quiz com sucesso!',
          ephemeral: true,
        });
      } else {
        await buttonInteraction.reply({
          content: '⚠️ Você já está participando desta sessão.',
          ephemeral: true,
        });
      }
    } catch (error: any) {
      await buttonInteraction.reply({
        content: `❌ ${error.message}`,
        ephemeral: true,
      });
    }
  }

  async handleStartButton(
    buttonInteraction: any,
    quizService: InteractiveQuizService,
    sessionId: string,
  ) {
    const session = quizService.getQuizSession(sessionId);

    if (!session) {
      return buttonInteraction.reply({
        content: '❌ Sessão de quiz não encontrada.',
        ephemeral: true,
      });
    }

    if (session.hostId !== buttonInteraction.user.id) {
      return buttonInteraction.reply({
        content: '❌ Apenas o criador da sessão pode iniciar o quiz.',
        ephemeral: true,
      });
    }

    try {
      await quizService.startQuizSession(sessionId);

      await buttonInteraction.reply({
        content: '🚀 Quiz iniciado! A primeira pergunta será enviada em breve.',
        ephemeral: true,
      });

      // Start the quiz loop
      await this.runQuizLoop(buttonInteraction.channel as TextChannel, quizService, sessionId);
    } catch (error: any) {
      await buttonInteraction.reply({
        content: `❌ ${error.message}`,
        ephemeral: true,
      });
    }
  }

  async handleStatusButton(
    buttonInteraction: any,
    quizService: InteractiveQuizService,
    sessionId: string,
  ) {
    const session = quizService.getQuizSession(sessionId);

    if (!session) {
      return buttonInteraction.reply({
        content: '❌ Sessão de quiz não encontrada.',
        ephemeral: true,
      });
    }

    const statusEmoji = {
      waiting: '⏳',
      active: '🔴',
      paused: '⏸️',
      finished: '✅',
    };

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji[session.status]} Status da Sessão`)
      .setDescription(`**ID:** \`${session.id}\``)
      .addFields(
        {
          name: '📊 Status',
          value: session.status.charAt(0).toUpperCase() + session.status.slice(1),
          inline: true,
        },
        {
          name: '👥 Participantes',
          value: `${session.participants.size}/${session.settings.maxParticipants}`,
          inline: true,
        },
        {
          name: '❓ Progresso',
          value: `${session.currentQuestionIndex}/${session.questions.length}`,
          inline: true,
        },
      )
      .setColor(0x00ae86)
      .setTimestamp();

    if (session.participants.size > 0) {
      const participantsList = Array.from(session.participants.values())
        .map(p => `• ${p.username} - ${p.score} pts`)
        .slice(0, 10)
        .join('\n');

      embed.addFields({
        name: '🏆 Participantes',
        value: participantsList || 'Nenhum participante',
        inline: false,
      });
    }

    await buttonInteraction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  async runQuizLoop(channel: TextChannel, quizService: InteractiveQuizService, sessionId: string) {
    const session = quizService.getQuizSession(sessionId);
    if (!session) {
      return;
    }

    while (session.status === 'active') {
      const currentQuestion = quizService.getCurrentQuestion(sessionId);
      if (!currentQuestion) {
        break;
      }

      // Send question
      const questionEmbed = new EmbedBuilder()
        .setTitle(`❓ Pergunta ${session.currentQuestionIndex + 1}/${session.questions.length}`)
        .setDescription(currentQuestion.question)
        .addFields(
          currentQuestion.options.map((option, index) => ({
            name: `${String.fromCharCode(65 + index)}. ${option}`,
            value: '\u200b',
            inline: false,
          })),
        )
        .setColor(0x00ae86)
        .setFooter({
          text: `⏱️ ${currentQuestion.timeLimit} segundos | 💎 ${currentQuestion.points} pontos`,
        })
        .setTimestamp();

      if (currentQuestion.imageUrl) {
        questionEmbed.setImage(currentQuestion.imageUrl);
      }

      const answerButtons = currentQuestion.options.map((_, index) =>
        new ButtonBuilder()
          .setCustomId(`answer_${sessionId}_${index}`)
          .setLabel(String.fromCharCode(65 + index))
          .setStyle(ButtonStyle.Primary),
      );

      const rows = [];
      for (let i = 0; i < answerButtons.length; i += 5) {
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(answerButtons.slice(i, i + 5)),
        );
      }

      const questionMessage = await channel.send({
        embeds: [questionEmbed],
        components: rows,
      });

      // Collect answers
      const answerCollector = questionMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: currentQuestion.timeLimit * 1000,
      });

      const answeredUsers = new Set<string>();

      answerCollector.on('collect', async answerInteraction => {
        if (!answerInteraction.customId.startsWith(`answer_${sessionId}_`)) {
          return;
        }
        if (answeredUsers.has(answerInteraction.user.id)) {
          return answerInteraction.reply({
            content: '⚠️ Você já respondeu esta pergunta!',
            ephemeral: true,
          });
        }

        const answerIndex = parseInt(answerInteraction.customId.split('_')[2]);
        const responseTime = (Date.now() - questionMessage.createdTimestamp) / 1000;

        try {
          const result = await quizService.submitAnswer(
            sessionId,
            answerInteraction.user.id,
            answerIndex,
            responseTime,
          );
          answeredUsers.add(answerInteraction.user.id);

          const resultEmoji = result.correct ? '✅' : '❌';
          const responseText = result.correct
            ? `${resultEmoji} Correto! +${result.points} pontos`
            : `${resultEmoji} Incorreto!`;

          await answerInteraction.reply({
            content: responseText,
            ephemeral: true,
          });
        } catch (error: any) {
          await answerInteraction.reply({
            content: `❌ ${error.message}`,
            ephemeral: true,
          });
        }
      });

      // Wait for time to expire
      await new Promise(resolve => setTimeout(resolve, currentQuestion.timeLimit * 1000));
      answerCollector.stop();

      // Show correct answer and explanation
      const correctOption = currentQuestion.options[currentQuestion.correctAnswer];
      const resultEmbed = new EmbedBuilder()
        .setTitle('📊 Resultado da Pergunta')
        .setDescription(
          `**Resposta Correta:** ${String.fromCharCode(65 + currentQuestion.correctAnswer)}. ${correctOption}`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

      if (currentQuestion.explanation) {
        resultEmbed.addFields({
          name: '💡 Explicação',
          value: currentQuestion.explanation,
          inline: false,
        });
      }

      // Show current leaderboard
      const participants = Array.from(session.participants.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (participants.length > 0) {
        const leaderboardText = participants
          .map((p, i) => `${i + 1}. ${p.username} - ${p.score} pts`)
          .join('\n');

        resultEmbed.addFields({
          name: '🏆 Placar Atual',
          value: leaderboardText,
          inline: false,
        });
      }

      await channel.send({ embeds: [resultEmbed] });

      // Move to next question
      const hasNext = await quizService.nextQuestion(sessionId);
      if (!hasNext) {
        break;
      }

      // Wait before next question
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Show final results
    await this.showFinalResults(channel, quizService, sessionId);
  }

  async showFinalResults(
    channel: TextChannel,
    quizService: InteractiveQuizService,
    sessionId: string,
  ) {
    const session = quizService.getQuizSession(sessionId);
    if (!session) {
      return;
    }

    const finalEmbed = new EmbedBuilder()
      .setTitle('🏁 Quiz Finalizado!')
      .setDescription('Parabéns a todos os participantes!')
      .setColor(0xffd700)
      .setTimestamp();

    if (session.leaderboard.length > 0) {
      const podium = session.leaderboard.slice(0, 3);
      const podiumText = podium
        .map((p, i) => {
          const medals = ['🥇', '🥈', '🥉'];
          return `${medals[i]} **${p.username}** - ${p.score} pontos (${p.correctAnswers}/${p.totalAnswers} corretas)`;
        })
        .join('\n');

      finalEmbed.addFields({
        name: '🏆 Pódio',
        value: podiumText,
        inline: false,
      });

      if (session.leaderboard.length > 3) {
        const others = session.leaderboard
          .slice(3, 10)
          .map((p, i) => `${i + 4}. ${p.username} - ${p.score} pts`)
          .join('\n');

        if (others) {
          finalEmbed.addFields({
            name: '📊 Outros Participantes',
            value: others,
            inline: false,
          });
        }
      }
    }

    const duration = session.endTime
      ? Math.round((session.endTime.getTime() - session.startTime.getTime()) / 1000 / 60)
      : 0;

    finalEmbed.addFields({
      name: '📈 Estatísticas da Sessão',
      value: [
        `⏱️ Duração: ${duration} minutos`,
        `👥 Participantes: ${session.participants.size}`,
        `❓ Perguntas: ${session.questions.length}`,
        `🎁 Prêmio Total: ${session.totalPrizePool} moedas`,
      ].join('\n'),
      inline: false,
    });

    await channel.send({ embeds: [finalEmbed] });
  }
}

export default new InteractiveQuizCommand();
