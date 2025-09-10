import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChatInputCommandInteraction,
  MessageFlags,
  CommandInteraction,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { GameService, MiniGame } from '../../services/game.service';
import { DatabaseService } from '../../database/database.service';
import { BaseCommand } from '../../utils/base-command.util';

/**
 * Mini Game command - Interactive mini-games for entertainment and rewards
 */
class MinigameCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('minigame')
        .setDescription('🎮 Mini-games temáticos de PUBG para ganhar XP, moedas e badges')
        .addStringOption(option =>
          option
            .setName('game')
            .setDescription('Escolha o mini-game PUBG')
            .setRequired(false)
            .addChoices(
              { name: '⚡ Reflexos de Combate', value: 'reaction_test' },
              { name: '⌨️ Comunicação Rápida', value: 'typing_race' },
              { name: '🧮 Cálculo de Dano', value: 'math_challenge' },
              { name: '🧠 Memorização de Mapas', value: 'memory_game' },
              { name: '📦 Lootbox Virtual', value: 'lootbox' },
              { name: '🪂 Drop Aéreo', value: 'airdrop' },
              { name: '🎲 Aleatório', value: 'random' },
            ),
        ) as SlashCommandBuilder,
      category: CommandCategory.GENERAL,
      cooldown: 30, // Reduced cooldown for better UX
    });
  }

  async execute(interaction: CommandInteraction, client: ExtendedClient): Promise<void> {
    const gameService = new GameService(client);
    const database = client.database;

    try {
      // Check if user is registered
      const user = await database.client.user.findUnique({
        where: { id: interaction.user.id },
      });

      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Usuário Não Registrado')
          .setDescription(
            'Você precisa se registrar primeiro usando `/register` para jogar mini-games!',
          )
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      // Get selected game or show selection
      const selectedGame = (interaction as any).options.getString('game');

      if (!selectedGame) {
        await this.showGameSelection(interaction as ChatInputCommandInteraction, gameService);
        return;
      }

      // Check if there's already an active game in this channel
      const existingSession = gameService.getGameSession(
        `${interaction.guildId}_${interaction.channelId}`,
      );
      if (existingSession && existingSession.isActive) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Mini-Game Já Ativo')
          .setDescription(
            'Já existe um mini-game ativo neste canal! Aguarde ele terminar ou participe dele.',
          )
          .setColor(0xffa500)
          .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
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

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
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

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      // Handle different game types
      switch (gameToStart.type) {
        case 'reaction':
          await this.startReactionTest(
            interaction as ChatInputCommandInteraction,
            session,
            gameToStart,
            gameService,
          );
          break;
        case 'typing':
          await this.startTypingRace(
            interaction as ChatInputCommandInteraction,
            session,
            gameToStart,
            gameService,
          );
          break;
        case 'math':
          await this.startMathChallenge(
            interaction as ChatInputCommandInteraction,
            session,
            gameToStart,
            gameService,
          );
          break;
        case 'memory':
          await this.startMemoryGame(
            interaction as ChatInputCommandInteraction,
            session,
            gameToStart,
            gameService,
          );
          break;
        case 'lootbox':
          await this.startLootbox(
            interaction as ChatInputCommandInteraction,
            session,
            gameToStart,
            gameService,
          );
          break;
        case 'airdrop':
          await this.startAirdrop(
            interaction as ChatInputCommandInteraction,
            session,
            gameToStart,
            gameService,
          );
          break;
        default:
          throw new Error(`Unsupported game type: ${gameToStart.type}`);
      }
    } catch (error) {
      this.logger.error('Error in minigame command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao iniciar o mini-game. Tente novamente.')
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
   * Show enhanced PUBG-themed game selection menu
   */
  private async showGameSelection(
    interaction: ChatInputCommandInteraction,
    gameService: GameService,
  ) {
    const games = gameService.getMiniGames();

    const embed = new EmbedBuilder()
      .setTitle('🎮 Arena de Mini-Games PUBG')
      .setDescription(
        '**Bem-vindo à Arena de Treinamento!** 🏟️\n\n' +
          'Escolha seu desafio e prove suas habilidades de sobrevivência:\n\n' +
          '```yaml\nCada vitória te aproxima do topo do ranking!```\n\n' +
          games
            .map((game: any) => {
              const difficultyEmoji =
                {
                  easy: '🟢 **Iniciante**',
                  medium: '🟡 **Veterano**',
                  hard: '🔴 **Pro Player**',
                  extreme: '💀 **Chicken Dinner**',
                }[game.difficulty] || '⚪ **Padrão**';

              const themeEmoji =
                {
                  reaction_test: '⚡',
                  typing_race: '⌨️',
                  math_challenge: '🧮',
                  memory_game: '🧠',
                  lootbox: '📦',
                  airdrop: '🪂',
                }[game.id] || '🎯';

              return (
                `${themeEmoji} **${game.name}** ${difficultyEmoji}\n` +
                `*${game.description}*\n` +
                `⏱️ **${game.duration}s** • 🎁 **${game.rewards.xp} XP** • 🪙 **${game.rewards.coins} moedas**`
              );
            })
            .join('\n\n'),
      )
      .setColor(0xff6b35)
      .setThumbnail('https://cdn.discordapp.com/emojis/852869487845515264.png')
      .addFields(
        {
          name: '🏆 Sistema de Recompensas',
          value:
            '• **XP:** Experiência para subir de nível\n• **Moedas:** Compre itens na loja\n• **Badges:** Conquistas especiais\n• **Ranking:** Posição global',
          inline: true,
        },
        {
          name: '🎯 Dicas de Sobrevivência',
          value:
            '• Pratique regularmente\n• Mire na precisão\n• Velocidade é crucial\n• Mantenha a calma',
          inline: true,
        },
      )
      .setFooter({ text: 'PUBG Mini-Games • Escolha seu desafio abaixo!' })
      .setTimestamp();

    // Create game selection buttons with PUBG theme
    const gameButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('minigame_start_reaction_test')
        .setLabel('⚡ Reflexos')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🎯'),
      new ButtonBuilder()
        .setCustomId('minigame_start_typing_race')
        .setLabel('⌨️ Comunicação')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📡'),
      new ButtonBuilder()
        .setCustomId('minigame_start_math_challenge')
        .setLabel('🧮 Cálculos')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔢'),
      new ButtonBuilder()
        .setCustomId('minigame_start_memory_game')
        .setLabel('🧠 Memória')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🗺️'),
    );

    const specialButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('minigame_start_lootbox')
        .setLabel('📦 Lootbox')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎁'),
      new ButtonBuilder()
        .setCustomId('minigame_start_airdrop')
        .setLabel('🪂 Drop Aéreo')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📦'),
      new ButtonBuilder()
        .setCustomId('minigame_start_random')
        .setLabel('🎲 Aleatório')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❓'),
    );

    const response = await interaction.reply({
      embeds: [embed],
      components: [gameButtons, specialButtons],
    });

    // Set up enhanced button collector with better UX
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000, // 2 minutes for better UX
    });

    collector.on('collect', async (buttonInteraction: any) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: '⚠️ **Acesso Negado!** Apenas quem iniciou o comando pode selecionar o jogo! 🔒',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const gameId = buttonInteraction.customId.replace('minigame_start_', '');

      // Show loading message with PUBG theme
      const loadingEmbed = new EmbedBuilder()
        .setTitle('🎮 Preparando Arena...')
        .setDescription(
          `**Carregando ${this.getGameDisplayName(gameId)}...**\n\n` +
            '```yaml\nInicializando sistemas de combate...\nCarregando mapa...\nPreparando recompensas...```\n\n' +
            '⏳ *Aguarde alguns segundos...*',
        )
        .setColor(0xff6b35)
        .setThumbnail('https://cdn.discordapp.com/emojis/852869487845515264.png')
        .setFooter({ text: 'PUBG Mini-Games • Preparando batalha...' })
        .setTimestamp();

      await buttonInteraction.update({ embeds: [loadingEmbed], components: [] });
      collector.stop();

      // Update the original interaction options and re-execute
      (interaction as any).options = {
        getString: (name: string) => (gameId === 'random' ? 'random' : gameId),
      };

      // Small delay for better UX
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Re-execute with selected game
      await this.execute(interaction, buttonInteraction.client as ExtendedClient);
    });

    collector.on('end', async (collected, reason) => {
      if (collected.size === 0 && reason === 'time') {
        const timeoutEmbed = new EmbedBuilder()
          .setTitle('⏰ Tempo Esgotado')
          .setDescription(
            '**A seleção de mini-game expirou!**\n\n' +
              'Use `/minigame` novamente para escolher um jogo.',
          )
          .setColor(0x666666)
          .setFooter({ text: 'PUBG Mini-Games • Sessão expirada' })
          .setTimestamp();

        try {
          await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
        } catch (error) {
          // Ignore edit errors
        }
      }
    });
  }

  /**
   * Start Reaction Test game
   */
  private async startReactionTest(
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
      .setFooter({
        text: `Duração: ${game.duration}s • Recompensas: ${game.rewards.xp} XP + ${game.rewards.coins} moedas`,
      })
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

      const reactionButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
          flags: MessageFlags.Ephemeral,
        });
      });

      collector.on('end', async () => {
        await this.endReactionTest(interaction, session, game, gameService, reactions, winner);
      });
    }, delay);
  }

  /**
   * End Reaction Test and show results
   */
  private async endReactionTest(
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
        reactions
          .slice(0, 10)
          .map((reaction: any, index: number) => {
            const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}º`;
            return `${medal} **${reaction.username}** - ${reaction.time}ms`;
          })
          .join('\n'),
      )
      .setColor(0xffd700)
      .setFooter({ text: `Participantes: ${reactions.length}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });
  }

  /**
   * Start Typing Race game
   */
  private async startTypingRace(
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
      return message.channel.id === interaction.channelId && message.content.trim() === phrase;
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
      const wpm = Math.round((phrase?.length || 0) / 5 / (completionTime / 60000));

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
      await this.endTypingRace(interaction, session, game, gameService);
    });
  }

  /**
   * End Typing Race and show results
   */
  private async endTypingRace(
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
          submissions
            .slice(0, 10)
            .map((sub: any, index: number) => {
              const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}º`;
              return `${medal} **${sub.username}**\n⏱️ ${(sub.time / 1000).toFixed(2)}s • ⌨️ ${sub.wpm} WPM`;
            })
            .join('\n\n'),
      )
      .setColor(0xffd700)
      .setFooter({ text: `Participantes: ${submissions.length}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Start Math Challenge game
   */
  private async startMathChallenge(
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
      .setFooter({
        text: `Duração: ${game.duration}s • Recompensas: ${game.rewards.xp} XP + ${game.rewards.coins} moedas`,
      })
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

    await this.showMathProblem(interaction, session, game, gameService);
  }

  /**
   * Show current math problem
   */
  private async showMathProblem(
    interaction: ChatInputCommandInteraction,
    session: any,
    game: MiniGame,
    gameService: GameService,
  ) {
    const problem = session.data.problems[session.data.currentProblem];

    if (!problem) {
      await this.endMathChallenge(interaction, session, game, gameService);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🧮 Problema ${session.data.currentProblem + 1}/${session.data.problems.length}`)
      .setDescription(
        '**Quanto é:**\n\n' + `# ${problem.problem} = ?\n\n` + 'Digite apenas o número da resposta!',
      )
      .setColor(0xff6b35)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Set up message collector
    const filter = (message: any) => {
      return (
        message.channel.id === interaction.channelId && !isNaN(parseInt(message.content.trim()))
      );
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
          this.showMathProblem(interaction, session, game, gameService);
        }, 2000);
      } else {
        await message.react('❌');
      }
    });

    collector?.on('end', async () => {
      if (!answered) {
        session.data.currentProblem++;
        await this.showMathProblem(interaction, session, game, gameService);
      }
    });
  }

  /**
   * End Math Challenge and show results
   */
  private async endMathChallenge(
    interaction: ChatInputCommandInteraction,
    session: any,
    game: MiniGame,
    gameService: GameService,
  ) {
    const results = await gameService.endMiniGame(session.id);
    const scoresMap = session.data.scores;
    const scores: Array<{ userId: string; username: any; score: number }> = [];

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
        scores
          .slice(0, 10)
          .map((result: any, index: number) => {
            const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}º`;
            return `${medal} **${result.username}** - ${result.score} pontos`;
          })
          .join('\n'),
      )
      .setColor(0xffd700)
      .setFooter({ text: `Participantes: ${scores.length}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Start Memory Game
   */
  private async startMemoryGame(
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
      .setFooter({
        text: `Duração: ${game.duration}s • Recompensas: ${game.rewards.xp} XP + ${game.rewards.coins} moedas`,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    const emojis = ['🔴', '🟡', '🟢', '🔵', '🟣'];
    session.data.sequence = [];
    session.data.round = 1;
    session.data.players = new Map();

    await this.showMemorySequence(interaction, session, game, gameService, emojis);
  }

  /**
   * Show memory sequence
   */
  private async showMemorySequence(
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
      .setDescription('**Sequência:**\n\n' + `# ${session.data.sequence.join(' ')}`)
      .setColor(0x9b59b6)
      .setFooter({ text: `Tamanho: ${session.data.sequence.length} • Memorize bem!` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Show sequence for 3 seconds + 1 second per emoji
    const showTime = 3000 + session.data.sequence.length * 1000;

    setTimeout(async () => {
      await this.askMemorySequence(interaction, session, game, gameService, emojis);
    }, showTime);
  }

  /**
   * Ask user to repeat the sequence
   */
  private async askMemorySequence(
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

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
      this.endMemoryGame(interaction, session, game, gameService);
    }, 30000);
  }

  /**
   * End Memory Game and show results
   */
  private async endMemoryGame(
    interaction: ChatInputCommandInteraction,
    session: any,
    game: MiniGame,
    gameService: GameService,
  ) {
    const results = await gameService.endMiniGame(session.id);
    const playersMap = session.data.players;
    const scores: Array<{ userId: string; username: any; score: number }> = [];

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
          scores
            .slice(0, 10)
            .map((result: any, index: number) => {
              const medal = ['🥇', '🥈', '🥉'][index] || `${index + 1}º`;
              return `${medal} **${result.username}** - ${result.score} pontos`;
            })
            .join('\n'),
      )
      .setColor(0xffd700)
      .setFooter({ text: `Participantes: ${scores.length}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });
  }

  /**
   * Start Lootbox Virtual game
   */
  private async startLootbox(
    interaction: ChatInputCommandInteraction,
    session: any,
    game: MiniGame,
    gameService: GameService,
  ) {
    const lootItems = [
      { name: 'AKM', rarity: 'comum', emoji: '🔫' },
      { name: 'M416', rarity: 'comum', emoji: '🔫' },
      { name: 'AWM', rarity: 'raro', emoji: '🎯' },
      { name: 'Groza', rarity: 'épico', emoji: '💥' },
      { name: 'Capacete Nível 3', rarity: 'raro', emoji: '🪖' },
      { name: 'Colete Nível 3', rarity: 'raro', emoji: '🦺' },
      { name: 'Kit Médico', rarity: 'comum', emoji: '🏥' },
      { name: 'Bebida Energética', rarity: 'comum', emoji: '🥤' },
      { name: 'Ghillie Suit', rarity: 'lendário', emoji: '🥷' },
      { name: 'Pan', rarity: 'meme', emoji: '🍳' },
    ];

    const embed = new EmbedBuilder()
      .setTitle('📦 Lootbox Virtual PUBG')
      .setDescription(
        `**${game.description}**\n\n` +
          '🎁 **Clique nos botões para abrir as lootboxes!**\n\n' +
          '🏆 **Raridades:**\n' +
          '⚪ Comum • 🔵 Raro • 🟣 Épico • 🟡 Lendário • 🎭 Meme\n\n' +
          `⏰ Você tem ${game.duration} segundos para coletar!`,
      )
      .setColor(0x8b4513)
      .setThumbnail('https://i.imgur.com/lootbox.png')
      .setTimestamp();

    const lootboxButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('lootbox_1')
        .setLabel('Caixa 1')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('lootbox_2')
        .setLabel('Caixa 2')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('lootbox_3')
        .setLabel('Caixa 3')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('lootbox_4')
        .setLabel('Caixa 4')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('lootbox_5')
        .setLabel('Caixa 5')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({ embeds: [embed], components: [lootboxButtons] });

    const collector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: game.duration * 1000,
    });

    const openedBoxes = new Set<string>();
    const collectedItems: Array<{ userId: string; username: string; item: any }> = [];

    collector?.on('collect', async buttonInteraction => {
      if (!buttonInteraction.customId.startsWith('lootbox_')) {
        return;
      }

      const boxId = buttonInteraction.customId;
      if (openedBoxes.has(boxId)) {
        await buttonInteraction.reply({
          content: '📦 Esta caixa já foi aberta!',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      openedBoxes.add(boxId);
      const randomItem = lootItems[Math.floor(Math.random() * lootItems.length)];

      collectedItems.push({
        userId: buttonInteraction.user.id,
        username: buttonInteraction.user.username,
        item: randomItem,
      });

      const rarityColors = {
        comum: '⚪',
        raro: '🔵',
        épico: '🟣',
        lendário: '🟡',
        meme: '🎭',
      };

      await buttonInteraction.reply({
        content: `${randomItem.emoji} **${randomItem.name}** ${rarityColors[randomItem.rarity as keyof typeof rarityColors]} (${randomItem.rarity})`,
        flags: MessageFlags.Ephemeral,
      });
    });

    collector?.on('end', async () => {
      await this.endLootbox(interaction, session, game, gameService, collectedItems);
    });
  }

  /**
   * End Lootbox game and show results
   */
  private async endLootbox(
    interaction: ChatInputCommandInteraction,
    session: any,
    game: MiniGame,
    gameService: GameService,
    collectedItems: Array<{ userId: string; username: string; item: any }>,
  ) {
    const results = await gameService.endMiniGame(session.id);

    if (collectedItems.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📦 Lootbox Virtual - Finalizado')
        .setDescription('Nenhuma caixa foi aberta! 😅')
        .setColor(0xffa500)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }

    const itemCounts = collectedItems.reduce(
      (acc, { item }) => {
        acc[item.name] = (acc[item.name] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const embed = new EmbedBuilder()
      .setTitle('📦 Lootbox Virtual - Resultados')
      .setDescription(
        '🎁 **Itens Coletados:**\n\n' +
          Object.entries(itemCounts)
            .map(([itemName, count]) => {
              const item = collectedItems.find(c => c.item.name === itemName)?.item;
              return `${item?.emoji} **${itemName}** x${count}`;
            })
            .join('\n') +
          `\n\n🏆 **Total de participantes:** ${new Set(collectedItems.map(c => c.userId)).size}`,
      )
      .setColor(0x8b4513)
      .setFooter({ text: `Caixas abertas: ${collectedItems.length}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });
  }

  /**
   * Start Airdrop game
   */
  private async startAirdrop(
    interaction: ChatInputCommandInteraction,
    session: any,
    game: MiniGame,
    gameService: GameService,
  ) {
    const embed = new EmbedBuilder()
      .setTitle('🪂 Drop Aéreo Clicável')
      .setDescription(
        `**${game.description}**\n\n` +
          '✈️ **Um avião está se aproximando...**\n\n' +
          '🎯 Fique atento! O drop aéreo aparecerá em alguns segundos\n' +
          '⚡ Seja o primeiro a clicar para reivindicar o loot!\n\n' +
          `⏰ Duração total: ${game.duration} segundos`,
      )
      .setColor(0x87ceeb)
      .setThumbnail('https://i.imgur.com/airplane.png')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed], components: [] });

    // Random delay between 5-15 seconds for the airdrop to appear
    const dropDelay = Math.floor(Math.random() * 10000) + 5000;

    setTimeout(async () => {
      const airdropButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('claim_airdrop')
          .setLabel('REIVINDICAR DROP!')
          .setEmoji('🪂')
          .setStyle(ButtonStyle.Danger),
      );

      const dropEmbed = new EmbedBuilder()
        .setTitle('🪂 DROP AÉREO DISPONÍVEL!')
        .setDescription(
          '🎁 **Um drop aéreo pousou!**\n\n' +
            '⚡ **CLIQUE RÁPIDO PARA REIVINDICAR!**\n\n' +
            '🏆 Contém: AWM, Munição .300, Colete Nível 3, Kit Médico',
        )
        .setColor(0xff4500)
        .setTimestamp();

      await interaction.editReply({ embeds: [dropEmbed], components: [airdropButton] });

      const collector = interaction.channel?.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: game.duration * 1000 - dropDelay,
        max: 1, // Only first click wins
      });

      let winner: string | null = null;
      const startTime = Date.now();

      collector?.on('collect', async buttonInteraction => {
        if (buttonInteraction.customId !== 'claim_airdrop') {
          return;
        }

        winner = buttonInteraction.user.id;
        const reactionTime = Date.now() - startTime;

        await buttonInteraction.reply({
          content: `🏆 **${buttonInteraction.user.username}** reivindicou o drop aéreo em ${reactionTime}ms!`,
        });

        collector.stop();
      });

      collector?.on('end', async () => {
        await this.endAirdrop(interaction, session, game, gameService, winner);
      });
    }, dropDelay);
  }

  /**
   * End Airdrop game and show results
   */
  private async endAirdrop(
    interaction: ChatInputCommandInteraction,
    session: any,
    game: MiniGame,
    gameService: GameService,
    winner: string | null,
  ) {
    const results = await gameService.endMiniGame(session.id);

    const embed = new EmbedBuilder()
      .setTitle('🪂 Drop Aéreo - Finalizado')
      .setColor(winner ? 0x00ff00 : 0xffa500)
      .setTimestamp();

    if (winner) {
      const user = await interaction.client.users.fetch(winner);
      embed.setDescription(
        `🏆 **Vencedor:** ${user.username}\n\n` +
          '🎁 **Loot obtido:**\n' +
          '🎯 AWM + Munição .300\n' +
          '🦺 Colete Nível 3\n' +
          '🏥 Kit Médico\n' +
          '💊 Analgésicos\n\n' +
          '🎖️ Parabéns pela vitória!',
      );
    } else {
      embed.setDescription(
        '💨 **O drop aéreo foi perdido!**\n\n' +
          '😅 Ninguém conseguiu reivindicar a tempo\n' +
          '🔄 Tente novamente na próxima vez!',
      );
    }

    await interaction.editReply({ embeds: [embed], components: [] });
  }

  /**
   * Get display name for games
   */
  private getGameDisplayName(gameId: string): string {
    const names: Record<string, string> = {
      reaction_test: 'Reflexos de Combate',
      typing_race: 'Comunicação Rápida',
      math_challenge: 'Cálculo de Dano',
      memory_game: 'Memorização de Mapas',
      lootbox: 'Lootbox Virtual',
      airdrop: 'Drop Aéreo',
      random: 'Jogo Aleatório',
    };

    return names[gameId] || 'Mini-Game';
  }

  /**
   * Get emoji for game types with PUBG theme
   */
  private getGameEmoji(type: string): string {
    const emojis: Record<string, string> = {
      reaction_test: '⚡',
      typing_race: '⌨️',
      math_challenge: '🧮',
      memory_game: '🧠',
      lootbox: '📦',
      airdrop: '🪂',
      random: '🎲',
    };

    return emojis[type] || '🎮';
  }
}

const commandInstance = new MinigameCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.GENERAL,
  cooldown: 5,
  execute: (interaction: CommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;
