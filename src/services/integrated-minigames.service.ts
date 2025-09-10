import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { DatabaseService } from '../database/database.service';
import { Logger } from '../utils/logger';
import { ExtendedClient } from '../types/client';

/**
 * Types for Integrated Mini-Games
 */
export interface MiniGameSession {
  id: string;
  type: MiniGameType;
  guildId: string;
  channelId: string;
  hostId: string;
  participants: Map<string, MiniGameParticipant>;
  status: 'waiting' | 'active' | 'finished';
  settings: MiniGameSettings;
  data: any;
  startTime?: Date;
  endTime?: Date;
  rewards: MiniGameRewards;
}

export interface MiniGameParticipant {
  userId: string;
  username: string;
  score: number;
  joinedAt: Date;
  isReady: boolean;
  data: any;
}

export interface MiniGameSettings {
  maxParticipants: number;
  duration: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  rounds?: number;
  timePerRound?: number;
  allowSpectators: boolean;
  requireReady: boolean;
}

export interface MiniGameRewards {
  winner: { xp: number; coins: number; badges?: string[] };
  participant: { xp: number; coins: number };
  special?: { condition: string; xp: number; coins: number; badge?: string };
}

export type MiniGameType =
  | 'guess_the_weapon'
  | 'pubg_trivia_battle'
  | 'reaction_tournament'
  | 'word_association'
  | 'strategy_challenge'
  | 'team_battle'
  | 'survival_quiz'
  | 'esports_prediction';

export interface MiniGameDefinition {
  id: string;
  name: string;
  description: string;
  type: MiniGameType;
  emoji: string;
  category: 'individual' | 'team' | 'tournament';
  minParticipants: number;
  maxParticipants: number;
  defaultSettings: MiniGameSettings;
  rewards: MiniGameRewards;
}

/**
 * Integrated Mini-Games Service
 * Provides advanced mini-games with competitions, tournaments and team battles
 */
export class IntegratedMiniGamesService {
  private readonly logger = new Logger();
  private readonly database: DatabaseService;
  private readonly client: ExtendedClient;
  private readonly activeSessions = new Map<string, MiniGameSession>();
  private readonly tournaments = new Map<string, TournamentData>();

  // Game definitions
  private readonly gameDefinitions: MiniGameDefinition[] = [
    {
      id: 'guess_the_weapon',
      name: 'Adivinhe a Arma',
      description: 'Adivinhe a arma PUBG baseada em dicas e estatísticas!',
      type: 'guess_the_weapon',
      emoji: '🔫',
      category: 'individual',
      minParticipants: 1,
      maxParticipants: 10,
      defaultSettings: {
        maxParticipants: 10,
        duration: 120,
        difficulty: 'medium',
        rounds: 5,
        timePerRound: 30,
        allowSpectators: true,
        requireReady: false,
      },
      rewards: {
        winner: { xp: 100, coins: 50, badges: ['weapon_master'] },
        participant: { xp: 25, coins: 10 },
        special: { condition: 'perfect_score', xp: 150, coins: 75, badge: 'weapon_expert' },
      },
    },
    {
      id: 'pubg_trivia_battle',
      name: 'Batalha de Trivia PUBG',
      description: 'Competição de conhecimento sobre PUBG e esports!',
      type: 'pubg_trivia_battle',
      emoji: '🧠',
      category: 'tournament',
      minParticipants: 2,
      maxParticipants: 16,
      defaultSettings: {
        maxParticipants: 16,
        duration: 300,
        difficulty: 'medium',
        rounds: 10,
        timePerRound: 20,
        allowSpectators: true,
        requireReady: true,
      },
      rewards: {
        winner: { xp: 200, coins: 100, badges: ['trivia_champion'] },
        participant: { xp: 50, coins: 20 },
        special: { condition: 'fastest_answers', xp: 250, coins: 125, badge: 'speed_demon' },
      },
    },
    {
      id: 'reaction_tournament',
      name: 'Torneio de Reflexos',
      description: 'Torneio eliminatório de testes de reação!',
      type: 'reaction_tournament',
      emoji: '⚡',
      category: 'tournament',
      minParticipants: 4,
      maxParticipants: 32,
      defaultSettings: {
        maxParticipants: 32,
        duration: 600,
        difficulty: 'hard',
        rounds: 3,
        timePerRound: 60,
        allowSpectators: true,
        requireReady: true,
      },
      rewards: {
        winner: { xp: 300, coins: 150, badges: ['reaction_king'] },
        participant: { xp: 75, coins: 30 },
        special: { condition: 'sub_200ms', xp: 400, coins: 200, badge: 'lightning_reflexes' },
      },
    },
    {
      id: 'word_association',
      name: 'Associação de Palavras PUBG',
      description: 'Conecte palavras relacionadas ao universo PUBG!',
      type: 'word_association',
      emoji: '🔗',
      category: 'individual',
      minParticipants: 2,
      maxParticipants: 8,
      defaultSettings: {
        maxParticipants: 8,
        duration: 180,
        difficulty: 'medium',
        rounds: 8,
        timePerRound: 15,
        allowSpectators: true,
        requireReady: false,
      },
      rewards: {
        winner: { xp: 120, coins: 60 },
        participant: { xp: 30, coins: 15 },
        special: { condition: 'creative_answers', xp: 180, coins: 90, badge: 'word_wizard' },
      },
    },
    {
      id: 'strategy_challenge',
      name: 'Desafio Estratégico',
      description: 'Resolva cenários táticos e situações de combate!',
      type: 'strategy_challenge',
      emoji: '🎯',
      category: 'individual',
      minParticipants: 1,
      maxParticipants: 6,
      defaultSettings: {
        maxParticipants: 6,
        duration: 240,
        difficulty: 'hard',
        rounds: 6,
        timePerRound: 45,
        allowSpectators: true,
        requireReady: false,
      },
      rewards: {
        winner: { xp: 180, coins: 90, badges: ['strategist'] },
        participant: { xp: 45, coins: 20 },
        special: { condition: 'tactical_genius', xp: 250, coins: 125, badge: 'master_tactician' },
      },
    },
    {
      id: 'team_battle',
      name: 'Batalha em Equipe',
      description: 'Competição por equipes com desafios variados!',
      type: 'team_battle',
      emoji: '👥',
      category: 'team',
      minParticipants: 4,
      maxParticipants: 12,
      defaultSettings: {
        maxParticipants: 12,
        duration: 450,
        difficulty: 'medium',
        rounds: 5,
        timePerRound: 60,
        allowSpectators: true,
        requireReady: true,
      },
      rewards: {
        winner: { xp: 150, coins: 75, badges: ['team_player'] },
        participant: { xp: 60, coins: 25 },
        special: { condition: 'perfect_teamwork', xp: 200, coins: 100, badge: 'squad_leader' },
      },
    },
    {
      id: 'survival_quiz',
      name: 'Quiz de Sobrevivência',
      description: 'Teste seus conhecimentos de sobrevivência no PUBG!',
      type: 'survival_quiz',
      emoji: '🏃',
      category: 'individual',
      minParticipants: 1,
      maxParticipants: 15,
      defaultSettings: {
        maxParticipants: 15,
        duration: 200,
        difficulty: 'medium',
        rounds: 12,
        timePerRound: 25,
        allowSpectators: true,
        requireReady: false,
      },
      rewards: {
        winner: { xp: 140, coins: 70, badges: ['survivor'] },
        participant: { xp: 35, coins: 15 },
        special: { condition: 'no_mistakes', xp: 210, coins: 105, badge: 'survival_expert' },
      },
    },
    {
      id: 'esports_prediction',
      name: 'Previsões Esports',
      description: 'Preveja resultados de partidas e torneios!',
      type: 'esports_prediction',
      emoji: '🔮',
      category: 'individual',
      minParticipants: 2,
      maxParticipants: 20,
      defaultSettings: {
        maxParticipants: 20,
        duration: 300,
        difficulty: 'hard',
        rounds: 8,
        timePerRound: 30,
        allowSpectators: true,
        requireReady: false,
      },
      rewards: {
        winner: { xp: 160, coins: 80, badges: ['prophet'] },
        participant: { xp: 40, coins: 18 },
        special: { condition: 'perfect_predictions', xp: 240, coins: 120, badge: 'oracle' },
      },
    },
  ];

  // Weapon data for guessing game
  private readonly weaponData = [
    {
      name: 'AKM',
      category: 'Assault Rifle',
      damage: 49,
      range: 'Medium-Long',
      ammo: '7.62mm',
      hints: [
        'Rifle de assalto soviético',
        'Usa munição 7.62mm',
        'Alto dano por tiro',
        'Recuo considerável',
      ],
    },
    {
      name: 'M416',
      category: 'Assault Rifle',
      damage: 43,
      range: 'Medium-Long',
      ammo: '5.56mm',
      hints: [
        'Rifle de assalto versátil',
        'Aceita muitos attachments',
        'Munição 5.56mm',
        'Boa estabilidade',
      ],
    },
    {
      name: 'AWM',
      category: 'Sniper Rifle',
      damage: 120,
      range: 'Long',
      ammo: '.300 Magnum',
      hints: [
        'Sniper mais poderosa',
        'Mata com headshot em qualquer capacete',
        'Munição especial',
        'Só no airdrop',
      ],
    },
    {
      name: 'Kar98k',
      category: 'Sniper Rifle',
      damage: 79,
      range: 'Long',
      ammo: '7.62mm',
      hints: ['Sniper clássica', 'Bolt-action', 'Munição 7.62mm', 'Headshot letal até nível 2'],
    },
    {
      name: 'UMP45',
      category: 'SMG',
      damage: 39,
      range: 'Short-Medium',
      ammo: '.45 ACP',
      hints: [
        'Submetralhadora confiável',
        'Munição .45 ACP',
        'Boa para close combat',
        'Baixo recuo',
      ],
    },
  ];

  constructor(client: ExtendedClient) {
    this.client = client;
    this.database = new DatabaseService();
  }

  /**
   * Get available mini-games
   */
  public getAvailableGames(): MiniGameDefinition[] {
    return [...this.gameDefinitions];
  }

  /**
   * Create a new mini-game session
   */
  public async createSession(
    gameId: string,
    guildId: string,
    channelId: string,
    hostId: string,
    customSettings?: Partial<MiniGameSettings>,
  ): Promise<MiniGameSession | null> {
    const gameDefinition = this.gameDefinitions.find(g => g.id === gameId);
    if (!gameDefinition) {
      return null;
    }

    const sessionId = `${guildId}_${channelId}_${Date.now()}`;
    const settings = { ...gameDefinition.defaultSettings, ...customSettings };

    const session: MiniGameSession = {
      id: sessionId,
      type: gameDefinition.type,
      guildId,
      channelId,
      hostId,
      participants: new Map(),
      status: 'waiting',
      settings,
      data: this.initializeGameData(gameDefinition.type),
      rewards: gameDefinition.rewards,
    };

    this.activeSessions.set(sessionId, session);

    this.logger.info(`Created mini-game session: ${gameId} in ${guildId}/${channelId}`);
    return session;
  }

  /**
   * Join a mini-game session
   */
  public joinSession(sessionId: string, userId: string, username: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'waiting') {
      return false;
    }

    if (session.participants.size >= session.settings.maxParticipants) {
      return false;
    }
    if (session.participants.has(userId)) {
      return false;
    }

    session.participants.set(userId, {
      userId,
      username,
      score: 0,
      joinedAt: new Date(),
      isReady: !session.settings.requireReady,
      data: {},
    });

    this.logger.info(`User ${userId} joined mini-game session ${sessionId}`);
    return true;
  }

  /**
   * Start a mini-game session
   */
  public async startSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'waiting') {
      return false;
    }

    const gameDefinition = this.gameDefinitions.find(g => g.type === session.type);
    if (!gameDefinition) {
      return false;
    }

    if (session.participants.size < gameDefinition.minParticipants) {
      return false;
    }

    if (session.settings.requireReady) {
      const allReady = Array.from(session.participants.values()).every(p => p.isReady);
      if (!allReady) {
        return false;
      }
    }

    session.status = 'active';
    session.startTime = new Date();

    this.logger.info(
      `Started mini-game session ${sessionId} with ${session.participants.size} participants`,
    );
    return true;
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): MiniGameSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * End a mini-game session
   */
  public async endSession(sessionId: string): Promise<MiniGameSession | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.status = 'finished';
    session.endTime = new Date();

    // Process rewards
    await this.processRewards(session);

    // Clean up after 5 minutes
    setTimeout(
      () => {
        this.activeSessions.delete(sessionId);
      },
      5 * 60 * 1000,
    );

    this.logger.info(`Ended mini-game session ${sessionId}`);
    return session;
  }

  /**
   * Initialize game-specific data
   */
  private initializeGameData(gameType: MiniGameType): any {
    switch (gameType) {
      case 'guess_the_weapon':
        return {
          currentWeapon: null,
          hintsGiven: 0,
          round: 0,
          weapons: [...this.weaponData].sort(() => Math.random() - 0.5),
        };

      case 'pubg_trivia_battle':
        return {
          questions: [],
          currentQuestion: null,
          round: 0,
          leaderboard: new Map(),
        };

      case 'reaction_tournament':
        return {
          bracket: [],
          currentMatch: null,
          round: 0,
          eliminated: new Set(),
        };

      case 'word_association':
        return {
          currentWord: '',
          usedWords: new Set(),
          chain: [],
          round: 0,
        };

      case 'strategy_challenge':
        return {
          scenarios: [],
          currentScenario: null,
          round: 0,
          solutions: new Map(),
        };

      case 'team_battle':
        return {
          teams: new Map(),
          currentChallenge: null,
          round: 0,
          teamScores: new Map(),
        };

      case 'survival_quiz':
        return {
          questions: [],
          currentQuestion: null,
          round: 0,
          streaks: new Map(),
        };

      case 'esports_prediction':
        return {
          matches: [],
          currentMatch: null,
          round: 0,
          predictions: new Map(),
        };

      default:
        return {};
    }
  }

  /**
   * Process rewards for session participants
   */
  private async processRewards(session: MiniGameSession): Promise<void> {
    try {
      const participants = Array.from(session.participants.values());
      participants.sort((a, b) => b.score - a.score);

      for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        const isWinner = i === 0;

        let xpReward = isWinner ? session.rewards.winner.xp : session.rewards.participant.xp;
        let coinReward = isWinner
          ? session.rewards.winner.coins
          : session.rewards.participant.coins;

        // Check for special conditions
        if (session.rewards.special && this.checkSpecialCondition(session, participant)) {
          xpReward = session.rewards.special.xp;
          coinReward = session.rewards.special.coins;
        }

        // Award XP and coins
        await this.database.client.user.update({
          where: { id: participant.userId },
          data: {
            xp: { increment: xpReward },
            coins: { increment: coinReward },
          },
        });

        // Award badges for winners
        if (isWinner && session.rewards.winner.badges) {
          for (const badgeId of session.rewards.winner.badges) {
            await this.awardBadge(participant.userId, badgeId);
          }
        }

        this.logger.info(`Awarded ${xpReward} XP and ${coinReward} coins to ${participant.userId}`);
      }
    } catch (error) {
      this.logger.error('Error processing mini-game rewards:', error);
    }
  }

  /**
   * Check if participant meets special reward conditions
   */
  private checkSpecialCondition(
    session: MiniGameSession,
    participant: MiniGameParticipant,
  ): boolean {
    if (!session.rewards.special) {
      return false;
    }

    const condition = session.rewards.special.condition;

    switch (condition) {
      case 'perfect_score':
        return participant.score === (session.settings.rounds || 5) * 100;

      case 'fastest_answers':
        return participant.data.averageTime && participant.data.averageTime < 5000;

      case 'sub_200ms':
        return participant.data.bestTime && participant.data.bestTime < 200;

      case 'creative_answers':
        return participant.data.creativityScore && participant.data.creativityScore > 80;

      case 'tactical_genius':
        return participant.score > (session.settings.rounds || 6) * 90;

      case 'perfect_teamwork':
        return participant.data.teamworkScore && participant.data.teamworkScore === 100;

      case 'no_mistakes':
        return participant.data.mistakes === 0;

      case 'perfect_predictions':
        return participant.data.correctPredictions === session.settings.rounds;

      default:
        return false;
    }
  }

  /**
   * Award badge to user
   */
  private async awardBadge(userId: string, badgeId: string): Promise<void> {
    try {
      await this.database.client.userBadge.upsert({
        where: {
          userId_badgeId: {
            userId,
            badgeId,
          },
        },
        update: {},
        create: {
          userId,
          badgeId,
          earnedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Error awarding badge ${badgeId} to ${userId}:`, error);
    }
  }

  /**
   * Get user mini-game statistics
   */
  public async getUserStats(userId: string): Promise<any> {
    try {
      const stats = await this.database.client.user.findUnique({
        where: { id: userId },
        select: {
          xp: true,
          coins: true,
          badges: {
            include: {
              badge: true,
            },
          },
        },
      });

      return {
        totalXP: stats?.xp || 0,
        totalCoins: stats?.coins || 0,
        badgesEarned: stats?.badges.length || 0,
        miniGameBadges:
          stats?.badges.filter(b =>
            [
              'weapon_master',
              'trivia_champion',
              'reaction_king',
              'word_wizard',
              'strategist',
              'team_player',
              'survivor',
              'prophet',
            ].includes(b.badge.id),
          ).length || 0,
      };
    } catch (error) {
      this.logger.error('Error getting user mini-game stats:', error);
      return null;
    }
  }

  /**
   * Get leaderboard for specific game type
   */
  public async getLeaderboard(gameType: MiniGameType, limit: number = 10): Promise<any[]> {
    // This would require additional database schema to track game-specific stats
    // For now, return empty array
    return [];
  }

  /**
   * Clean up inactive sessions
   */
  public cleanupInactiveSessions(): void {
    const now = new Date();
    const timeout = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.activeSessions) {
      const lastActivity = session.startTime || new Date(session.id.split('_')[2]);
      if (now.getTime() - lastActivity.getTime() > timeout) {
        this.activeSessions.delete(sessionId);
        this.logger.info(`Cleaned up inactive session: ${sessionId}`);
      }
    }
  }
}

/**
 * Tournament data interface
 */
interface TournamentData {
  id: string;
  name: string;
  gameType: MiniGameType;
  participants: string[];
  bracket: TournamentMatch[];
  status: 'registration' | 'active' | 'finished';
  startTime?: Date;
  endTime?: Date;
  prizes: {
    first: { xp: number; coins: number; badge: string };
    second: { xp: number; coins: number };
    third: { xp: number; coins: number };
  };
}

interface TournamentMatch {
  id: string;
  round: number;
  player1: string;
  player2: string;
  winner?: string;
  score?: { player1: number; player2: number };
  status: 'pending' | 'active' | 'finished';
}
