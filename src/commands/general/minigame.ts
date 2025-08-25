import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';
import { GameService, MiniGame } from '@/services/game.service';
import { DatabaseService } from '@/database/database.service';

/**
 * Mini Game command - Interactive mini-games for entertainment and rewards
 */
const minigame: Command = {
  data: new SlashCommandBuilder()
    .setName('minigame')
    .setDescription('🎯 Inicia um mini-game interativo para ganhar XP e moedas')
    .addStringOption(option =>
      option.setName('game')
        .setDescription('Escolha o mini-game')
        .setRequired(false)
        .addChoices(
          { name: '⚡ Teste de Reação', value: 'reaction_test' },
          { name: '⌨️ Corrida de Digitação', value: 'typing_race' },
          { name: '🧮 Desafio Matemático', value: 'math_challenge' },
          { name: '🧠 Jogo da Memória', value: 'memory_game' },
          { name: '🎲 Aleatório', value: 'random' },
        ),
    ) as SlashCommandBuilder,
  
  category: CommandCategory.GENERAL,
  cooldown: 60, // 1 minute cooldown to prevent spam
  
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
          .setDescription('Você precisa se registrar primeiro usando `/register` para jogar mini-games!')
          .setColor(0xff0000)
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Get selected game or show selection
      const selectedGame = interaction.options.getString('game');
      
      if (!selectedGame) {
        await showGameSelection(interaction, gameService);
        return;
      }

      // Check if there's already an active game in this channel
      const existingSession = gameService.getGameSession(`${interaction.guildId}_${interaction.channelId}`);
      if (existingSession && existingSession.isActive) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Mini-Game Já Ativo')
          .setDescription('Já existe um mini-game ativo neste canal! Aguarde ele terminar ou participe dele.')
          .setColor(0xffa500)
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Get game info
      const games = gameService.getMiniGames();
      let gameToStart: MiniGame | undefined;
      
      if (selectedGame === 'random') {
        gameToStart = games[Math.floor(Math.random() * games.length)];
      } else {
        gameToStart = games.find((g: any) => g.id === selectedGame);
      }

      if (!gameToStart) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Jogo Não Encontrado')
          .setDescription('O mini-game selecionado não foi encontrado.')
          .setColor(0xff0000)
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Start the mini-game
      const session = await gameService.startMiniGame(
        gameToStart.id,
        interaction.guildId!,
        interaction.channelId,
        interaction.user.id,
      );

      if (!session) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Erro ao Iniciar')
          .setDescription('Não foi possível iniciar o mini-game. Tente novamente.')
          .setColor(0xff0000)
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Handle different game types
      switch (gameToStart.type) {
      case 'reaction':
        await startReactionTest(interaction, session, gameToStart, gameService);
        break;
      case 'typing':
        await startTypingRace(interaction, session, gameToStart, gameService);
        break;
      case 'math':
        await startMathChallenge(interaction, session, gameToStart, gameService);
        break;
      case 'memory':
        await startMemoryGame(interaction, session, gameToStart, gameService);
        break;
      default:
        throw new Error(`Unsupported game type: ${gameToStart.type}`);
      }

    } catch (error) {
      logger.error('Error in minigame command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao iniciar o mini-game. Tente novamente.')
        .setColor(0xff0000)
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};

/**
 * Show game selection menu
 */
async function showGameSelection(interaction: ChatInputCommandInteraction, gameService: GameService) {
  const games = gameService.getMiniGames();
  
  const embed = new EmbedBuilder()
    .setTitle('🎯 Escolha um Mini-Game')
    .setDescription(
      'Selecione um dos mini-games disponíveis para jogar e ganhar recompensas!\n\n' +
      games.map((game: any) => {
        const difficultyEmoji = ({
          'easy': '🟢',
          'medium': '🟡',
          'hard': '🔴',
        } as Record<string, string>)[game.difficulty] || '⚪';
        
        return `**${getGameEmoji(game.type)} ${game.name}** ${difficultyEmoji}\n` +
               `${game.description}\n` +
               `⏱️ ${game.duration}s • 🎁 ${game.rewards.xp} XP + ${game.rewards.coins} moedas`;
      }).join('\n\n'),
    )
    .setColor(0x0099ff)
    .setFooter({ text: 'Use /minigame <jogo> para iniciar diretamente!' })
    .setTimestamp();

  const buttons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      ...games.slice(0, 4).map((game: any) => 
        new ButtonBuilder()
          .setCustomId(`minigame_start_${game.id}`)
          .setLabel(`${getGameEmoji(game.type)} ${game.name}`)
          .setStyle(ButtonStyle.Primary),
      ),
    );

  const randomButton = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('minigame_start_random')
        .setLabel('🎲 Jogo Aleatório')
        .setStyle(ButtonStyle.Secondary),
    );

  const response = await interaction.reply({
    embeds: [embed],
    components: [buttons, randomButton],
  });

  // Set up button collector
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000, // 1 minute
  });

  collector.on('collect', async (buttonInteraction: any) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: '❌ Apenas quem iniciou o comando pode selecionar o jogo!',
        ephemeral: true,
      });
      return;
    }

    const gameId = buttonInteraction.customId.replace('minigame_start_', '');
    
    // Update the original interaction options and re-execute
    (interaction as any).options = {
      getString: (name: string) => gameId === 'random' ? 'random' : gameId,
    };
    
    await buttonInteraction.deferUpdate();
    collector.stop();
    
    // Re-execute with selected game
    await minigame.execute(interaction, buttonInteraction.client as ExtendedClient);
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ components: [] });
    }
  });
}

/**
 * Start Reaction Test game
 */
async function startReactionTest(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
) {
  const embed = new EmbedBuilder()
    .setTitle('⚡ Teste de Reação')
    .setDescription(
      `**${game.description}**\n\n` +
      '🎯 **Como jogar:**\n' +
      '• Aguarde o emoji aparecer\n' +
      '• Seja o primeiro a clicar no botão!\n' +
      '• Quanto mais rápido, mais pontos!\n\n' +
      '⏰ Preparando... Fique atento!',
    )
    .setColor(0xffa500)
    .setFooter({ text: `Duração: ${game.duration}s • Recompensas: ${game.rewards.xp} XP + ${game.rewards.coins} moedas` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // Random delay between 3-8 seconds
  const delay = Math.random() * 5000 + 3000;
  
  setTimeout(async () => {
    const reactionEmojis = ['🔥', '⚡', '💥', '🎯', '🚀', '💎', '⭐', '🌟'];
    const emoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
    
    const reactionEmbed = new EmbedBuilder()
      .setTitle(`${emoji} AGORA! ${emoji}`)
      .setDescription('**CLIQUE NO BOTÃO AGORA!**')
      .setColor(0x00ff00)
      .setTimestamp();

    const reactionButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`reaction_click_${session.id}`)
          .setLabel(`${emoji} CLIQUE AQUI!`)
          .setStyle(ButtonStyle.Danger),
      );

    const startTime = Date.now();
    const response = await interaction.editReply({
      embeds: [reactionEmbed],
      components: [reactionButton],
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 10000, // 10 seconds to react
    });

    let winner: string | null = null;
    const reactions: Array<{ userId: string; username: string; time: number }> = [];

    collector.on('collect', async (buttonInteraction: any) => {
      const reactionTime = Date.now() - startTime;
      
      if (!winner) {
        winner = buttonInteraction.user.id;
      }
      
      reactions.push({
        userId: buttonInteraction.user.id,
        username: buttonInteraction.user.username,
        time: reactionTime,
      });

      const isWinner = buttonInteraction.user.id === winner;
      const emoji = isWinner ? '🏆' : '⏱️';
      
      await buttonInteraction.reply({
        content: `${emoji} ${reactionTime}ms ${isWinner ? '(PRIMEIRO!)' : ''}`,
        ephemeral: true,
      });
    });

    collector.on('end', async () => {
      await endReactionTest(interaction, session, game, gameService, reactions, winner);
    });
  }, delay);
}

/**
 * End Reaction Test and show results
 */
async function endReactionTest(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
  reactions: Array<{ userId: string; username: string; time: number }>,
  winner: string | null,
) {
  const results = await gameService.endMiniGame(session.id);
  
  if (reactions.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('⚡ Teste de Reação - Finalizado')
      .setDescription('Ninguém reagiu a tempo! 😅')
      .setColor(0xffa500)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  // Sort by reaction time
  reactions.sort((a, b) => a.time - b.time);

  const embed = new EmbedBuilder()
    .setTitle('⚡ Teste de Reação - Resultados')
    .setDescription(
      reactions.slice(0, 10).map((reaction: any, index: number) => {
        const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}º`;
        return `${medal} **${reaction.username}** - ${reaction.time}ms`;
      }).join('\n'),
    )
    .setColor(0xffd700)
    .setFooter({ text: `Participantes: ${reactions.length}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], components: [] });
}

/**
 * Start Typing Race game
 */
async function startTypingRace(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
) {
  const phrases = [
    'Winner winner chicken dinner!',
    'The zone is closing in fast!',
    'Enemy spotted in the building ahead.',
    'I need medical supplies here!',
    'Let\'s drop at School for some action.',
    'The red zone is coming, we need to move!',
    'I found a level 3 helmet and vest.',
    'There\'s a squad camping on the roof.',
    'The final circle is at Military Base.',
    'Good luck and have fun in Battlegrounds!',
  ];
  
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  
  const embed = new EmbedBuilder()
    .setTitle('⌨️ Corrida de Digitação')
    .setDescription(
      `**${game.description}**\n\n` +
      '🎯 **Digite a frase abaixo o mais rápido possível:**\n\n' +
      `\`\`\`\n${phrase}\n\`\`\`\n\n` +
      `⏰ Você tem ${game.duration} segundos!\n` +
      '📝 Digite exatamente como mostrado (case-sensitive)',
    )
    .setColor(0x0099ff)
    .setFooter({ text: `Recompensas: ${game.rewards.xp} XP + ${game.rewards.coins} moedas` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // Store the phrase in session data
  session.data.targetPhrase = phrase;
  session.data.startTime = Date.now();
  session.data.submissions = [];

  // Set up message collector for typing
  const filter = (message: any) => {
    return message.channel.id === interaction.channelId && 
           message.content.trim() === phrase;
  };

  const channel = interaction.channel;
  if (!channel || !('createMessageCollector' in channel)) {
    return;
  }
  
  const collector = channel.createMessageCollector({
    filter,
    time: game.duration * 1000,
  });

  collector?.on('collect', async (message: any) => {
    const completionTime = Date.now() - session.data.startTime;
    const wpm = Math.round(((phrase?.length || 0) / 5) / (completionTime / 60000));
    
    session.data.submissions.push({
      userId: message.author.id,
      username: message.author.username,
      time: completionTime,
      wpm,
    });

    await message.react('✅');
    
    // End immediately if someone completes it
    if (session.data.submissions.length === 1) {
      setTimeout(() => collector?.stop(), 2000); // Give 2 seconds for others
    }
  });

  collector?.on('end', async () => {
    await endTypingRace(interaction, session, game, gameService);
  });
}

/**
 * End Typing Race and show results
 */
async function endTypingRace(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
) {
  const results = await gameService.endMiniGame(session.id);
  const submissions = session.data.submissions || [];
  
  if (submissions.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('⌨️ Corrida de Digitação - Finalizada')
      .setDescription('Ninguém completou a frase a tempo! 😅')
      .setColor(0xffa500)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Sort by completion time
  submissions.sort((a: any, b: any) => a.time - b.time);

  const embed = new EmbedBuilder()
    .setTitle('⌨️ Corrida de Digitação - Resultados')
    .setDescription(
      `**Frase:** \`${session.data.targetPhrase}\`\n\n` +
      submissions.slice(0, 10).map((sub: any, index: number) => {
        const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}º`;
        return `${medal} **${sub.username}**\n⏱️ ${(sub.time / 1000).toFixed(2)}s • ⌨️ ${sub.wpm} WPM`;
      }).join('\n\n'),
    )
    .setColor(0xffd700)
    .setFooter({ text: `Participantes: ${submissions.length}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Start Math Challenge game
 */
async function startMathChallenge(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
) {
  const embed = new EmbedBuilder()
    .setTitle('🧮 Desafio Matemático')
    .setDescription(
      `**${game.description}**\n\n` +
      '🎯 **Como jogar:**\n' +
      '• Resolva os problemas matemáticos\n' +
      '• Digite apenas o número da resposta\n' +
      '• Quanto mais rápido, mais pontos!\n\n' +
      '⏰ Preparando os problemas...',
    )
    .setColor(0xff6b35)
    .setFooter({ text: `Duração: ${game.duration}s • Recompensas: ${game.rewards.xp} XP + ${game.rewards.coins} moedas` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // Generate math problems
  const problems = [];
  for (let i = 0; i < 5; i++) {
    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    const operations = ['+', '-', '*'];
    const op = operations[Math.floor(Math.random() * operations.length)];
    
    let answer;
    switch (op) {
    case '+':
      answer = a + b;
      break;
    case '-':
      answer = Math.abs(a - b); // Keep positive
      break;
    case '*':
      answer = a * b;
      break;
    default:
      answer = a + b;
    }
    
    problems.push({
      problem: `${a} ${op} ${b}`,
      answer,
    });
  }

  session.data.problems = problems;
  session.data.currentProblem = 0;
  session.data.scores = new Map();
  session.data.startTime = Date.now();

  await showMathProblem(interaction, session, game, gameService);
}

/**
 * Show current math problem
 */
async function showMathProblem(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
) {
  const problem = session.data.problems[session.data.currentProblem];
  
  if (!problem) {
    await endMathChallenge(interaction, session, game, gameService);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🧮 Problema ${session.data.currentProblem + 1}/${session.data.problems.length}`)
    .setDescription(
      '**Quanto é:**\n\n' +
      `# ${problem.problem} = ?\n\n` +
      'Digite apenas o número da resposta!',
    )
    .setColor(0xff6b35)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  // Set up message collector
  const filter = (message: any) => {
    return message.channel.id === interaction.channelId && 
           !isNaN(parseInt(message.content.trim()));
  };

  const channel = interaction.channel;
  if (!channel || !('createMessageCollector' in channel)) {
    return;
  }
  
  const collector = channel.createMessageCollector({
    filter,
    time: 15000, // 15 seconds per problem
  });

  let answered = false;

  collector?.on('collect', async (message: any) => {
    if (answered) {
      return;
    }
    
    const answer = parseInt(message.content.trim());
    
    if (answer === problem.answer) {
      answered = true;
      const responseTime = Date.now() - session.data.startTime;
      const points = Math.max(100 - Math.floor(responseTime / 100), 10);
      
      const currentScore = session.data.scores.get(message.author.id) || 0;
      session.data.scores.set(message.author.id, currentScore + points);
      session.data.scores.set(`${message.author.id}_name`, message.author.username);
      
      await message.react('✅');
      
      session.data.currentProblem++;
      session.data.startTime = Date.now();
      
      setTimeout(() => {
        collector?.stop();
        showMathProblem(interaction, session, game, gameService);
      }, 2000);
    } else {
      await message.react('❌');
    }
  });

  collector?.on('end', async () => {
    if (!answered) {
      session.data.currentProblem++;
      await showMathProblem(interaction, session, game, gameService);
    }
  });
}

/**
 * End Math Challenge and show results
 */
async function endMathChallenge(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
) {
  const results = await gameService.endMiniGame(session.id);
  const scoresMap = session.data.scores;
  const scores: Array<{userId: string, username: any, score: number}> = [];
  
  for (const [key, value] of scoresMap.entries()) {
    if (!key.includes('_name')) {
      scores.push({
        userId: key,
        username: scoresMap.get(`${key}_name`),
        score: value as number,
      });
    }
  }
  
  scores.sort((a, b) => b.score - a.score);
  
  if (scores.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🧮 Desafio Matemático - Finalizado')
      .setDescription('Ninguém resolveu os problemas! 😅')
      .setColor(0xffa500)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🧮 Desafio Matemático - Resultados')
    .setDescription(
      scores.slice(0, 10).map((result: any, index: number) => {
        const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}º`;
        return `${medal} **${result.username}** - ${result.score} pontos`;
      }).join('\n'),
    )
    .setColor(0xffd700)
    .setFooter({ text: `Participantes: ${scores.length}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Start Memory Game
 */
async function startMemoryGame(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
) {
  const embed = new EmbedBuilder()
    .setTitle('🧠 Jogo da Memória')
    .setDescription(
      `**${game.description}**\n\n` +
      '🎯 **Como jogar:**\n' +
      '• Memorize a sequência de emojis\n' +
      '• Repita a sequência clicando nos botões\n' +
      '• A sequência fica mais longa a cada rodada!\n\n' +
      '⏰ Preparando a primeira sequência...',
    )
    .setColor(0x9b59b6)
    .setFooter({ text: `Duração: ${game.duration}s • Recompensas: ${game.rewards.xp} XP + ${game.rewards.coins} moedas` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  const emojis = ['🔴', '🟡', '🟢', '🔵', '🟣'];
  session.data.sequence = [];
  session.data.round = 1;
  session.data.players = new Map();
  
  await showMemorySequence(interaction, session, game, gameService, emojis);
}

/**
 * Show memory sequence
 */
async function showMemorySequence(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
  emojis: string[],
) {
  // Add new emoji to sequence
  const newEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  session.data.sequence.push(newEmoji);
  
  const embed = new EmbedBuilder()
    .setTitle(`🧠 Rodada ${session.data.round} - Memorize a Sequência`)
    .setDescription(
      '**Sequência:**\n\n' +
      `# ${session.data.sequence.join(' ')}`,
    )
    .setColor(0x9b59b6)
    .setFooter({ text: `Tamanho: ${session.data.sequence.length} • Memorize bem!` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  // Show sequence for 3 seconds + 1 second per emoji
  const showTime = 3000 + (session.data.sequence.length * 1000);
  
  setTimeout(async () => {
    await askMemorySequence(interaction, session, game, gameService, emojis);
  }, showTime);
}

/**
 * Ask user to repeat the sequence
 */
async function askMemorySequence(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
  emojis: string[],
) {
  const embed = new EmbedBuilder()
    .setTitle(`🧠 Rodada ${session.data.round} - Repita a Sequência`)
    .setDescription(
      '**Clique nos botões na ordem correta:**\n\n' +
      `Sequência tem ${session.data.sequence.length} emojis`,
    )
    .setColor(0x9b59b6)
    .setTimestamp();

  const buttons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      ...emojis.map((emoji: string) => 
        new ButtonBuilder()
          .setCustomId(`memory_${session.id}_${emoji}`)
          .setLabel(emoji)
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  await interaction.editReply({ embeds: [embed], components: [buttons] });

  // Track user inputs
  const userInputs = new Map();
  
  const response = await interaction.editReply({ embeds: [embed] });
  
  // Simplified memory game - just end after timeout
  // In a full implementation, you would handle button interactions here
  setTimeout(() => {
    endMemoryGame(interaction, session, game, gameService);
  }, 30000);
}

/**
 * End Memory Game and show results
 */
async function endMemoryGame(
  interaction: ChatInputCommandInteraction,
  session: any,
  game: MiniGame,
  gameService: GameService,
) {
  const results = await gameService.endMiniGame(session.id);
  const playersMap = session.data.players;
  const scores: Array<{userId: string, username: any, score: number}> = [];
  
  for (const [key, value] of playersMap.entries()) {
    if (!key.includes('_name')) {
      scores.push({
        userId: key,
        username: playersMap.get(`${key}_name`),
        score: value as number,
      });
    }
  }
  
  scores.sort((a, b) => b.score - a.score);
  
  if (scores.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🧠 Jogo da Memória - Finalizado')
      .setDescription('Ninguém completou as sequências! 😅')
      .setColor(0xffa500)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🧠 Jogo da Memória - Resultados')
    .setDescription(
      `**Rodadas completadas:** ${session.data.round - 1}\n\n` +
      scores.slice(0, 10).map((result: any, index: number) => {
        const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}º`;
        return `${medal} **${result.username}** - ${result.score} pontos`;
      }).join('\n'),
    )
    .setColor(0xffd700)
    .setFooter({ text: `Participantes: ${scores.length}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], components: [] });
}

/**
 * Helper function to get game emoji
 */
function getGameEmoji(type: string): string {
  const emojis = {
    'reaction': '⚡',
    'typing': '⌨️',
    'math': '🧮',
    'memory': '🧠',
    'trivia': '🧠',
  };
  return emojis[type as keyof typeof emojis] || '🎯';
}

export default minigame;