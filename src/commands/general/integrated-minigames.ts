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
import { CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { BaseCommand } from '../../utils/base-command.util';
import { IntegratedMiniGamesService, MiniGameDefinition, MiniGameSession } from '../../services/integrated-minigames.service';
import { DatabaseService } from '../../database/database.service';

/**
 * Integrated Mini-Games command - Advanced mini-games with competitions and tournaments
 */
class IntegratedMinigamesCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('minigames')
        .setDescription('🎮 Mini-games integrados com competições, torneios e desafios em equipe')
    .addSubcommand(subcommand =>
      subcommand
        .setName('listar')
        .setDescription('📋 Ver todos os mini-games disponíveis'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('criar')
        .setDescription('🆕 Criar uma nova sessão de mini-game')
        .addStringOption(option =>
          option
            .setName('jogo')
            .setDescription('Escolha o tipo de mini-game')
            .setRequired(true)
            .addChoices(
              { name: '🔫 Adivinhe a Arma', value: 'guess_the_weapon' },
              { name: '🧠 Batalha de Trivia PUBG', value: 'pubg_trivia_battle' },
              { name: '⚡ Torneio de Reflexos', value: 'reaction_tournament' },
              { name: '🔗 Associação de Palavras', value: 'word_association' },
              { name: '🎯 Desafio Estratégico', value: 'strategy_challenge' },
              { name: '👥 Batalha em Equipe', value: 'team_battle' },
              { name: '🏃 Quiz de Sobrevivência', value: 'survival_quiz' },
              { name: '🔮 Previsões Esports', value: 'esports_prediction' },
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
              { name: '💀 Extremo', value: 'extreme' },
            ),
        )
        .addIntegerOption(option =>
          option
            .setName('max-participantes')
            .setDescription('Número máximo de participantes (2-32)')
            .setRequired(false)
            .setMinValue(2)
            .setMaxValue(32),
        )
        .addIntegerOption(option =>
          option
            .setName('duracao')
            .setDescription('Duração em segundos (60-600)')
            .setRequired(false)
            .setMinValue(60)
            .setMaxValue(600),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('entrar')
        .setDescription('🚪 Entrar em uma sessão de mini-game ativa')
        .addStringOption(option =>
          option
            .setName('sessao')
            .setDescription('ID da sessão para entrar')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('iniciar')
        .setDescription('▶️ Iniciar uma sessão de mini-game criada')
        .addStringOption(option =>
          option
            .setName('sessao')
            .setDescription('ID da sessão para iniciar')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('📊 Ver status de uma sessão de mini-game')
        .addStringOption(option =>
          option
            .setName('sessao')
            .setDescription('ID da sessão para verificar')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('estatisticas')
        .setDescription('📈 Ver suas estatísticas de mini-games')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para ver estatísticas (opcional)')
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ranking')
        .setDescription('🏆 Ver ranking de mini-games')
        .addStringOption(option =>
          option
            .setName('tipo')
            .setDescription('Tipo de jogo para o ranking')
            .setRequired(false)
            .addChoices(
              { name: '🔫 Adivinhe a Arma', value: 'guess_the_weapon' },
              { name: '🧠 Batalha de Trivia', value: 'pubg_trivia_battle' },
              { name: '⚡ Torneio de Reflexos', value: 'reaction_tournament' },
              { name: '🎯 Desafio Estratégico', value: 'strategy_challenge' },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('torneio')
        .setDescription('🏟️ Criar ou participar de torneios')
        .addStringOption(option =>
          option
            .setName('acao')
            .setDescription('Ação do torneio')
            .setRequired(true)
            .addChoices(
              { name: '🆕 Criar Torneio', value: 'create' },
              { name: '📋 Listar Torneios', value: 'list' },
              { name: '🚪 Entrar no Torneio', value: 'join' },
              { name: '📊 Status do Torneio', value: 'status' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('tipo')
            .setDescription('Tipo de jogo para o torneio')
            .setRequired(false)
            .addChoices(
              { name: '🧠 Batalha de Trivia', value: 'pubg_trivia_battle' },
              { name: '⚡ Torneio de Reflexos', value: 'reaction_tournament' },
              { name: '👥 Batalha em Equipe', value: 'team_battle' },
            ),
        ),
    ) as SlashCommandBuilder,
      category: CommandCategory.GENERAL,
      cooldown: 10,
    });
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    const miniGamesService = new IntegratedMiniGamesService(client);

    try {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'listar':
          await this.handleListGames(interaction, miniGamesService);
          break;
        case 'criar':
          await this.handleCreateSession(interaction, miniGamesService);
          break;
        case 'entrar':
          await this.handleJoinSession(interaction, miniGamesService);
          break;
        case 'iniciar':
          await this.handleStartSession(interaction, miniGamesService);
          break;
        case 'status':
          await this.handleSessionStatus(interaction, miniGamesService);
          break;
        case 'estatisticas':
          await this.handleUserStats(interaction, miniGamesService);
          break;
        case 'ranking':
          await this.handleRanking(interaction, miniGamesService);
          break;
        case 'torneio':
          await this.handleTournament(interaction, miniGamesService);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      this.logger.error('Erro ao executar comando de mini-games integrados:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ Erro ao executar comando: ${errorMessage}`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content: `❌ Erro ao executar comando: ${errorMessage}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }

  /**
   * Handle list games subcommand
   */
  private async handleListGames(
  interaction: ChatInputCommandInteraction,
  miniGamesService: IntegratedMiniGamesService,
) {
  const games = miniGamesService.getAvailableGames();

  const embed = new EmbedBuilder()
    .setTitle('🎮 Mini-Games Integrados Disponíveis')
    .setDescription(
      '**Arena de Competições PUBG** 🏟️\n\n' +
      'Escolha seu desafio e compete com outros jogadores!\n\n' +
      '```yaml\nCada vitória te aproxima do topo do ranking global!```',
    )
    .setColor(0x00d4ff)
    .setThumbnail('https://cdn.discordapp.com/emojis/852869487845515264.png')
    .setTimestamp();

  // Group games by category
  const categories = {
    individual: games.filter(g => g.category === 'individual'),
    team: games.filter(g => g.category === 'team'),
    tournament: games.filter(g => g.category === 'tournament'),
  };

  // Individual games
  if (categories.individual.length > 0) {
    const individualGames = categories.individual
      .map(game => 
        `${game.emoji} **${game.name}**\n` +
        `*${game.description}*\n` +
        `👥 ${game.minParticipants}-${game.maxParticipants} jogadores • ` +
        `🎁 ${game.rewards.winner.xp} XP • 🪙 ${game.rewards.winner.coins} moedas`,
      )
      .join('\n\n');
    
    embed.addFields({
      name: '🎯 Jogos Individuais',
      value: individualGames,
      inline: false,
    });
  }

  // Team games
  if (categories.team.length > 0) {
    const teamGames = categories.team
      .map(game => 
        `${game.emoji} **${game.name}**\n` +
        `*${game.description}*\n` +
        `👥 ${game.minParticipants}-${game.maxParticipants} jogadores • ` +
        `🎁 ${game.rewards.winner.xp} XP • 🪙 ${game.rewards.winner.coins} moedas`,
      )
      .join('\n\n');
    
    embed.addFields({
      name: '👥 Jogos em Equipe',
      value: teamGames,
      inline: false,
    });
  }

  // Tournament games
  if (categories.tournament.length > 0) {
    const tournamentGames = categories.tournament
      .map(game => 
        `${game.emoji} **${game.name}**\n` +
        `*${game.description}*\n` +
        `👥 ${game.minParticipants}-${game.maxParticipants} jogadores • ` +
        `🎁 ${game.rewards.winner.xp} XP • 🪙 ${game.rewards.winner.coins} moedas`,
      )
      .join('\n\n');
    
    embed.addFields({
      name: '🏆 Torneios',
      value: tournamentGames,
      inline: false,
    });
  }

  embed.addFields(
    {
      name: '🎮 Como Jogar',
      value: '• Use `/minigames criar` para criar uma sessão\n• Outros jogadores podem entrar com `/minigames entrar`\n• O criador inicia com `/minigames iniciar`',
      inline: true,
    },
    {
      name: '🏆 Sistema de Recompensas',
      value: '• **XP:** Experiência para subir de nível\n• **Moedas:** Compre itens na loja\n• **Badges:** Conquistas especiais\n• **Ranking:** Posição global',
      inline: true,
    },
  )
  .setFooter({ text: 'PUBG Mini-Games Integrados • Use os comandos para começar!' });

  await interaction.reply({ embeds: [embed] });
}

  /**
   * Handle create session subcommand
   */
  private async handleCreateSession(
  interaction: ChatInputCommandInteraction,
  miniGamesService: IntegratedMiniGamesService,
) {
  const gameId = interaction.options.getString('jogo', true);
  const difficulty = interaction.options.getString('dificuldade') as 'easy' | 'medium' | 'hard' | 'extreme' || 'medium';
  const maxParticipants = interaction.options.getInteger('max-participantes');
  const duration = interaction.options.getInteger('duracao');

  const customSettings: any = { difficulty };
  if (maxParticipants) {customSettings.maxParticipants = maxParticipants;}
  if (duration) {customSettings.duration = duration;}

  const session = await miniGamesService.createSession(
    gameId,
    interaction.guildId!,
    interaction.channelId,
    interaction.user.id,
    customSettings,
  );

  if (!session) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Erro ao Criar Sessão')
      .setDescription('Não foi possível criar a sessão do mini-game. Verifique os parâmetros.')
      .setColor(0xff0000)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Auto-join the creator
  miniGamesService.joinSession(session.id, interaction.user.id, interaction.user.username);

  const games = miniGamesService.getAvailableGames();
  const gameDefinition = games.find(g => g.id === gameId)!;

  const embed = new EmbedBuilder()
    .setTitle(`${gameDefinition.emoji} Sessão Criada: ${gameDefinition.name}`)
    .setDescription(
      `**${gameDefinition.description}**\n\n` +
      `🆔 **ID da Sessão:** \`${session.id}\`\n` +
      `👤 **Criador:** ${interaction.user.username}\n` +
      `👥 **Participantes:** 1/${session.settings.maxParticipants}\n` +
      `⏱️ **Duração:** ${session.settings.duration}s\n` +
      `🎯 **Dificuldade:** ${this.getDifficultyEmoji(session.settings.difficulty)} ${session.settings.difficulty}\n\n` +
      '**Para participar:**\n' +
      `\`/minigames entrar sessao:${session.id}\`\n\n` +
      '**Para iniciar:**\n' +
      `\`/minigames iniciar sessao:${session.id}\``,
    )
    .setColor(0x00ff00)
    .addFields(
      {
        name: '🎁 Recompensas do Vencedor',
        value: `🎯 ${gameDefinition.rewards.winner.xp} XP\n🪙 ${gameDefinition.rewards.winner.coins} moedas${gameDefinition.rewards.winner.badges ? '\n🏆 Badges especiais' : ''}`,
        inline: true,
      },
      {
        name: '🎁 Recompensas de Participação',
        value: `🎯 ${gameDefinition.rewards.participant.xp} XP\n🪙 ${gameDefinition.rewards.participant.coins} moedas`,
        inline: true,
      },
    )
    .setFooter({ text: `Mínimo de ${gameDefinition.minParticipants} jogadores necessário para iniciar` })
    .setTimestamp();

  const joinButton = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`minigame_join_${session.id}`)
        .setLabel('🚪 Entrar na Sessão')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`minigame_start_${session.id}`)
        .setLabel('▶️ Iniciar Jogo')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`minigame_status_${session.id}`)
        .setLabel('📊 Ver Status')
        .setStyle(ButtonStyle.Secondary),
    );

  await interaction.reply({ embeds: [embed], components: [joinButton] });
}

  /**
   * Handle join session subcommand
   */
  private async handleJoinSession(
  interaction: ChatInputCommandInteraction,
  miniGamesService: IntegratedMiniGamesService,
) {
  const sessionId = interaction.options.getString('sessao', true);
  
  const success = miniGamesService.joinSession(sessionId, interaction.user.id, interaction.user.username);
  
  if (!success) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Não Foi Possível Entrar')
      .setDescription(
        'Não foi possível entrar na sessão. Possíveis motivos:\n' +
        '• Sessão não encontrada ou já iniciada\n' +
        '• Sessão lotada\n' +
        '• Você já está participando',
      )
      .setColor(0xff0000)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const session = miniGamesService.getSession(sessionId);
  if (!session) {return;}

  const embed = new EmbedBuilder()
    .setTitle('✅ Entrada Confirmada!')
    .setDescription(
      'Você entrou na sessão com sucesso!\n\n' +
      `👥 **Participantes:** ${session.participants.size}/${session.settings.maxParticipants}\n` +
      '⏳ **Status:** Aguardando início',
    )
    .setColor(0x00ff00)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

  /**
   * Handle start session subcommand
   */
  private async handleStartSession(
  interaction: ChatInputCommandInteraction,
  miniGamesService: IntegratedMiniGamesService,
) {
  const sessionId = interaction.options.getString('sessao', true);
  const session = miniGamesService.getSession(sessionId);
  
  if (!session) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Sessão Não Encontrada')
      .setDescription('A sessão especificada não foi encontrada.')
      .setColor(0xff0000)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (session.hostId !== interaction.user.id) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Sem Permissão')
      .setDescription('Apenas o criador da sessão pode iniciá-la.')
      .setColor(0xff0000)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const started = await miniGamesService.startSession(sessionId);
  
  if (!started) {
    const games = miniGamesService.getAvailableGames();
    const gameDefinition = games.find(g => g.type === session.type);
    
    const embed = new EmbedBuilder()
      .setTitle('❌ Não Foi Possível Iniciar')
      .setDescription(
        'Não foi possível iniciar a sessão. Possíveis motivos:\n' +
        `• Participantes insuficientes (mínimo: ${gameDefinition?.minParticipants})\n` +
        '• Nem todos os jogadores estão prontos\n' +
        '• Sessão já foi iniciada',
      )
      .setColor(0xff0000)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 Jogo Iniciado!')
    .setDescription(
      'A sessão foi iniciada com sucesso!\n\n' +
      `👥 **Participantes:** ${session.participants.size}\n` +
      `⏱️ **Duração:** ${session.settings.duration}s\n` +
      '🎯 **Que comece a diversão!**',
    )
    .setColor(0x00ff00)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // Start the actual game logic here based on game type
  await this.startGameLogic(interaction, session, miniGamesService);
}

  /**
   * Handle session status subcommand
   */
  private async handleSessionStatus(
  interaction: ChatInputCommandInteraction,
  miniGamesService: IntegratedMiniGamesService,
) {
  const sessionId = interaction.options.getString('sessao', true);
  const session = miniGamesService.getSession(sessionId);
  
  if (!session) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Sessão Não Encontrada')
      .setDescription('A sessão especificada não foi encontrada.')
      .setColor(0xff0000)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const games = miniGamesService.getAvailableGames();
  const gameDefinition = games.find(g => g.type === session.type)!;
  
  const participants = Array.from(session.participants.values())
    .map(p => `• ${p.username} (${p.score} pontos)`)
    .join('\n') || 'Nenhum participante';

  const statusEmoji = {
    waiting: '⏳',
    active: '🎮',
    finished: '✅',
  }[session.status];

  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji} Status da Sessão: ${gameDefinition.name}`)
    .setDescription(
      `🆔 **ID:** \`${session.id}\`\n` +
      `👤 **Criador:** <@${session.hostId}>\n` +
      `📊 **Status:** ${session.status}\n` +
      `👥 **Participantes:** ${session.participants.size}/${session.settings.maxParticipants}\n` +
      `⏱️ **Duração:** ${session.settings.duration}s\n` +
      `🎯 **Dificuldade:** ${this.getDifficultyEmoji(session.settings.difficulty)} ${session.settings.difficulty}`,
    )
    .addFields({
      name: '👥 Lista de Participantes',
      value: participants,
      inline: false,
    })
    .setColor(session.status === 'active' ? 0x00ff00 : session.status === 'finished' ? 0x0099ff : 0xffa500)
    .setTimestamp();

  if (session.startTime) {
    embed.addFields({
      name: '⏰ Iniciado em',
      value: `<t:${Math.floor(session.startTime.getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  if (session.endTime) {
    embed.addFields({
      name: '🏁 Finalizado em',
      value: `<t:${Math.floor(session.endTime.getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  await interaction.reply({ embeds: [embed] });
}

  /**
   * Handle user stats subcommand
   */
  private async handleUserStats(
  interaction: ChatInputCommandInteraction,
  miniGamesService: IntegratedMiniGamesService,
) {
  const targetUser = interaction.options.getUser('usuario') || interaction.user;
  const stats = await miniGamesService.getUserStats(targetUser.id);
  
  if (!stats) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Estatísticas Não Encontradas')
      .setDescription('Não foi possível carregar as estatísticas do usuário.')
      .setColor(0xff0000)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const embed = new EmbedBuilder()
    .setTitle(`📈 Estatísticas de Mini-Games: ${targetUser.username}`)
    .setDescription(
      '**Resumo Geral dos Mini-Games** 🎮\n\n' +
      'Estatísticas completas de desempenho e conquistas!',
    )
    .setThumbnail(targetUser.displayAvatarURL({ forceStatic: false }))
    .addFields(
      {
        name: '🎯 Experiência Total',
        value: `${stats.totalXP.toLocaleString()} XP`,
        inline: true,
      },
      {
        name: '🪙 Moedas Totais',
        value: `${stats.totalCoins.toLocaleString()} moedas`,
        inline: true,
      },
      {
        name: '🏆 Badges Conquistadas',
        value: `${stats.badgesEarned} total\n${stats.miniGameBadges} de mini-games`,
        inline: true,
      },
    )
    .setColor(0x00d4ff)
    .setFooter({ text: 'PUBG Mini-Games • Continue jogando para melhorar suas stats!' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

  /**
   * Handle ranking subcommand
   */
  private async handleRanking(
  interaction: ChatInputCommandInteraction,
  miniGamesService: IntegratedMiniGamesService,
) {
  const gameType = interaction.options.getString('tipo');
  
  const embed = new EmbedBuilder()
    .setTitle('🏆 Ranking de Mini-Games')
    .setDescription(
      '**Sistema de Ranking Global** 🌟\n\n' +
      'Rankings baseados em desempenho, vitórias e pontuação!\n\n' +
      '```yaml\nEm breve: Rankings detalhados por categoria!```',
    )
    .addFields({
      name: '🚧 Em Desenvolvimento',
      value: 'O sistema de ranking está sendo implementado e estará disponível em breve!\n\nRecursos planejados:\n• Rankings por jogo\n• Rankings globais\n• Histórico de desempenho\n• Temporadas competitivas',
      inline: false,
    })
    .setColor(0xffa500)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

  /**
   * Handle tournament subcommand
   */
  private async handleTournament(
  interaction: ChatInputCommandInteraction,
  miniGamesService: IntegratedMiniGamesService,
) {
  const action = interaction.options.getString('acao', true);
  
  const embed = new EmbedBuilder()
    .setTitle('🏟️ Sistema de Torneios')
    .setDescription(
      '**Torneios Competitivos** 🏆\n\n' +
      'Participe de torneios eliminatórios com grandes prêmios!\n\n' +
      '```yaml\nSistema de torneios em desenvolvimento!```',
    )
    .addFields({
      name: '🚧 Em Desenvolvimento',
      value: 'O sistema de torneios está sendo implementado!\n\nRecursos planejados:\n• Torneios eliminatórios\n• Brackets automáticos\n• Prêmios especiais\n• Torneios sazonais\n• Sistema de classificação',
      inline: false,
    })
    .setColor(0xffa500)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

  /**
   * Start game logic based on game type
   */
  private async startGameLogic(
  interaction: ChatInputCommandInteraction,
  session: MiniGameSession,
  miniGamesService: IntegratedMiniGamesService,
) {
  // This would contain the actual game logic for each game type
  // For now, just show a placeholder
  
  const embed = new EmbedBuilder()
    .setTitle('🎮 Jogo em Andamento')
    .setDescription(
      `**${session.type.replace('_', ' ').toUpperCase()}**\n\n` +
      'O jogo está rodando! A lógica específica do jogo será implementada aqui.\n\n' +
      '```yaml\nLógica do jogo em desenvolvimento!```',
    )
    .setColor(0x00ff00)
    .setTimestamp();

  setTimeout(async () => {
    await interaction.followUp({ embeds: [embed] });
    
    // End the session after duration
    setTimeout(async () => {
      await miniGamesService.endSession(session.id);
      
      const endEmbed = new EmbedBuilder()
        .setTitle('🏁 Jogo Finalizado')
        .setDescription('O jogo foi finalizado! Recompensas foram distribuídas.')
        .setColor(0x0099ff)
        .setTimestamp();
      
      await interaction.followUp({ embeds: [endEmbed] });
    }, session.settings.duration * 1000);
  }, 2000);
}

  /**
   * Get difficulty emoji
   */
  private getDifficultyEmoji(difficulty: string): string {
  const emojis = {
    easy: '🟢',
    medium: '🟡',
    hard: '🔴',
    extreme: '💀',
  };
  return emojis[difficulty as keyof typeof emojis] || '⚪';
}

}

const commandInstance = new IntegratedMinigamesCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.GENERAL,
  cooldown: 5,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) => 
    commandInstance.execute(interaction, client),
};

export default command;