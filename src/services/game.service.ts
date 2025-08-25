import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { User, GuildMember, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { ExtendedClient } from '../types/client';

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: 'pubg' | 'general' | 'gaming' | 'esports';
  points: number;
  timeLimit: number; // seconds
}

export interface QuizSession {
  id: string;
  guildId: string;
  channelId: string;
  hostId: string;
  participants: Map<string, QuizParticipant>;
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  isActive: boolean;
  startedAt: Date;
  settings: QuizSettings;
}

export interface QuizParticipant {
  userId: string;
  username: string;
  score: number;
  correctAnswers: number;
  totalAnswers: number;
  streak: number;
  lastAnswerTime: number;
}

export interface QuizSettings {
  questionCount: number;
  timePerQuestion: number;
  category: 'pubg' | 'general' | 'gaming' | 'esports' | 'mixed';
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  allowMultipleAttempts: boolean;
  showCorrectAnswer: boolean;
}

export interface MiniGame {
  id: string;
  name: string;
  description: string;
  type: 'reaction' | 'typing' | 'math' | 'memory' | 'trivia';
  difficulty: 'easy' | 'medium' | 'hard';
  duration: number; // seconds
  rewards: {
    xp: number;
    coins: number;
    badges?: string[];
  };
}

export interface GameSession {
  id: string;
  gameId: string;
  guildId: string;
  channelId: string;
  hostId: string;
  participants: Map<string, GameParticipant>;
  isActive: boolean;
  startedAt: Date;
  endsAt: Date;
  data: any; // Game-specific data
}

export interface GameParticipant {
  userId: string;
  username: string;
  score: number;
  joinedAt: Date;
  data: any; // Game-specific participant data
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly' | 'special';
  category: 'pubg' | 'social' | 'gaming' | 'participation';
  requirements: ChallengeRequirement[];
  rewards: {
    xp: number;
    coins: number;
    badges?: string[];
  };
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}

export interface ChallengeRequirement {
  type: 'kills' | 'wins' | 'games' | 'messages' | 'voice_time' | 'quiz_score' | 'mini_game_wins';
  target: number;
  current?: number;
}

export interface ChallengeProgress {
  userId: string;
  challengeId: string;
  progress: Map<string, number>; // requirement type -> current value
  completed: boolean;
  completedAt?: Date;
  claimed: boolean;
}

/**
 * Game Service for handling mini-games, quizzes, and challenges
 */
export class GameService {
  private logger: Logger;
  private cache: CacheService;
  private database: DatabaseService;
  private client: ExtendedClient;
  
  private quizSessions: Map<string, QuizSession> = new Map();
  private gameSessions: Map<string, GameSession> = new Map();
  private activeChallenges: Map<string, Challenge> = new Map();
  private challengeProgress: Map<string, Map<string, ChallengeProgress>> = new Map(); // userId -> challengeId -> progress
  
  private readonly pubgQuestions: QuizQuestion[] = [
    {
      id: 'pubg_1',
      question: 'Qual é o nome do mapa original do PUBG?',
      options: ['Erangel', 'Miramar', 'Sanhok', 'Vikendi'],
      correctAnswer: 0,
      difficulty: 'easy',
      category: 'pubg',
      points: 10,
      timeLimit: 30,
    },
    {
      id: 'pubg_2',
      question: 'Quantos jogadores podem participar de uma partida clássica do PUBG?',
      options: ['50', '80', '100', '120'],
      correctAnswer: 2,
      difficulty: 'easy',
      category: 'pubg',
      points: 10,
      timeLimit: 30,
    },
    {
      id: 'pubg_3',
      question: 'Qual arma tem o maior dano por tiro no PUBG?',
      options: ['AWM', 'Kar98k', 'M24', 'Win94'],
      correctAnswer: 0,
      difficulty: 'medium',
      category: 'pubg',
      points: 15,
      timeLimit: 45,
    },
    {
      id: 'pubg_4',
      question: 'Em que ano o PUBG foi lançado oficialmente?',
      options: ['2016', '2017', '2018', '2019'],
      correctAnswer: 1,
      difficulty: 'medium',
      category: 'pubg',
      points: 15,
      timeLimit: 30,
    },
    {
      id: 'pubg_5',
      question: 'Qual é a velocidade máxima da zona azul no final do jogo?',
      options: ['5 m/s', '7.5 m/s', '10 m/s', '12.5 m/s'],
      correctAnswer: 1,
      difficulty: 'hard',
      category: 'pubg',
      points: 20,
      timeLimit: 60,
    },
  ];
  
  private readonly miniGames: MiniGame[] = [
    {
      id: 'reaction_test',
      name: 'Teste de Reação',
      description: 'Seja o primeiro a reagir quando aparecer o emoji!',
      type: 'reaction',
      difficulty: 'easy',
      duration: 30,
      rewards: { xp: 25, coins: 10 },
    },
    {
      id: 'typing_race',
      name: 'Corrida de Digitação',
      description: 'Digite a frase o mais rápido possível!',
      type: 'typing',
      difficulty: 'medium',
      duration: 60,
      rewards: { xp: 50, coins: 25 },
    },
    {
      id: 'math_challenge',
      name: 'Desafio Matemático',
      description: 'Resolva problemas matemáticos rapidamente!',
      type: 'math',
      difficulty: 'medium',
      duration: 45,
      rewards: { xp: 40, coins: 20 },
    },
    {
      id: 'memory_game',
      name: 'Jogo da Memória',
      description: 'Memorize a sequência de emojis!',
      type: 'memory',
      difficulty: 'hard',
      duration: 90,
      rewards: { xp: 75, coins: 40 },
    },
  ];

  constructor(client: ExtendedClient) {
    this.logger = new Logger();
    this.cache = new CacheService();
    this.database = new DatabaseService();
    this.client = client;
    
    this.loadActiveChallenges();
    this.startChallengeScheduler();
  }

  /**
   * Load active challenges from database
   */
  private async loadActiveChallenges(): Promise<void> {
    try {
      const challenges = await this.database.client.challenge.findMany({
        where: {
          isActive: true,
          endDate: {
            gte: new Date(),
          },
        },
      });

      for (const challenge of challenges) {
        const challengeData: Challenge = {
          id: challenge.id,
          name: challenge.name,
          description: challenge.description,
          type: challenge.type as 'daily' | 'weekly' | 'monthly' | 'special',
          category: challenge.gameType as 'pubg' | 'social' | 'gaming' | 'participation',
          requirements: challenge.requirements ? JSON.parse(challenge.requirements as string) : [],
          rewards: challenge.rewards ? JSON.parse(challenge.rewards as string) : { xp: 0, coins: 0 },
          startDate: challenge.startDate,
          endDate: challenge.endDate,
          isActive: challenge.isActive,
        };
        
        this.activeChallenges.set(challenge.id, challengeData);
      }
      
      this.logger.info(`Loaded ${challenges.length} active challenges`);
    } catch (error) {
      this.logger.error('Failed to load active challenges:', error);
    }
  }

  /**
   * Start challenge scheduler for daily/weekly/monthly challenges
   */
  private startChallengeScheduler(): void {
    // Check every hour for new challenges
    setInterval(async () => {
      await this.createScheduledChallenges();
      await this.expireOldChallenges();
    }, 60 * 60 * 1000);
  }

  /**
   * Create scheduled challenges
   */
  private async createScheduledChallenges(): Promise<void> {
    const now = new Date();
    const today = now.toDateString();
    
    // Daily challenges
    const dailyExists = Array.from(this.activeChallenges.values())
      .some(c => c.type === 'daily' && c.startDate.toDateString() === today);
    
    if (!dailyExists) {
      await this.createDailyChallenge();
    }
    
    // Weekly challenges (every Monday)
    if (now.getDay() === 1) { // Monday
      const weeklyExists = Array.from(this.activeChallenges.values())
        .some(c => c.type === 'weekly' && this.isSameWeek(c.startDate, now));
      
      if (!weeklyExists) {
        await this.createWeeklyChallenge();
      }
    }
    
    // Monthly challenges (first day of month)
    if (now.getDate() === 1) {
      const monthlyExists = Array.from(this.activeChallenges.values())
        .some(c => c.type === 'monthly' && c.startDate.getMonth() === now.getMonth());
      
      if (!monthlyExists) {
        await this.createMonthlyChallenge();
      }
    }
  }

  /**
   * Create daily challenge
   */
  private async createDailyChallenge(): Promise<void> {
    const dailyChallenges = [
      {
        name: 'Caçador Diário',
        description: 'Consiga 5 kills em partidas do PUBG',
        category: 'pubg' as const,
        requirements: [{ type: 'kills' as const, target: 5 }],
        rewards: { xp: 100, coins: 50 },
      },
      {
        name: 'Socialização',
        description: 'Envie 20 mensagens no servidor',
        category: 'social' as const,
        requirements: [{ type: 'messages' as const, target: 20 }],
        rewards: { xp: 75, coins: 30 },
      },
      {
        name: 'Quiz Master',
        description: 'Acerte 10 perguntas em quizzes',
        category: 'gaming' as const,
        requirements: [{ type: 'quiz_score' as const, target: 10 }],
        rewards: { xp: 125, coins: 60 },
      },
    ];
    
    const randomChallenge = dailyChallenges[Math.floor(Math.random() * dailyChallenges.length)];
    
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    await this.createChallenge({
      ...randomChallenge,
      type: 'daily',
      startDate,
      endDate,
    } as Omit<Challenge, 'id' | 'isActive'>);
  }

  /**
   * Create weekly challenge
   */
  private async createWeeklyChallenge(): Promise<void> {
    const weeklyChallenges = [
      {
        name: 'Dominador Semanal',
        description: 'Vença 3 partidas do PUBG',
        category: 'pubg' as const,
        requirements: [{ type: 'wins' as const, target: 3 }],
        rewards: { xp: 300, coins: 150, badges: ['weekly_winner'] },
      },
      {
        name: 'Participação Ativa',
        description: 'Passe 2 horas em canais de voz',
        category: 'participation' as const,
        requirements: [{ type: 'voice_time' as const, target: 7200 }], // 2 hours in seconds
        rewards: { xp: 250, coins: 100 },
      },
    ];
    
    const randomChallenge = weeklyChallenges[Math.floor(Math.random() * weeklyChallenges.length)];
    
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    
    await this.createChallenge({
      ...randomChallenge,
      type: 'weekly',
      startDate,
      endDate,
    } as Omit<Challenge, 'id' | 'isActive'>);
  }

  /**
   * Create monthly challenge
   */
  private async createMonthlyChallenge(): Promise<void> {
    const monthlyChallenges = [
      {
        name: 'Lenda do Mês',
        description: 'Jogue 50 partidas do PUBG',
        category: 'pubg' as const,
        requirements: [{ type: 'games' as const, target: 50 }],
        rewards: { xp: 1000, coins: 500, badges: ['monthly_legend'] },
      },
      {
        name: 'Mestre dos Mini-Games',
        description: 'Vença 20 mini-games',
        category: 'gaming' as const,
        requirements: [{ type: 'mini_game_wins' as const, target: 20 }],
        rewards: { xp: 800, coins: 400, badges: ['game_master'] },
      },
    ];
    
    const randomChallenge = monthlyChallenges[Math.floor(Math.random() * monthlyChallenges.length)];
    
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    
    await this.createChallenge({
      ...randomChallenge,
      type: 'monthly',
      startDate,
      endDate,
    } as Omit<Challenge, 'id' | 'isActive'>);
  }

  /**
   * Create a new challenge
   */
  public async createChallenge(challengeData: Omit<Challenge, 'id' | 'isActive'>): Promise<Challenge> {
    try {
      const challenge = await this.database.client.challenge.create({
        data: {
          guildId: '1', // TODO: Add guildId parameter to method
          name: challengeData.name,
          description: challengeData.description,
          type: challengeData.type,
          gameType: challengeData.category,
          requirements: JSON.stringify(challengeData.requirements),
          rewards: JSON.stringify(challengeData.rewards),
          startDate: challengeData.startDate,
          endDate: challengeData.endDate,
          isActive: true,
        },
      });
      
      const newChallenge: Challenge = {
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        type: challenge.type as 'daily' | 'weekly' | 'monthly' | 'special',
        category: challenge.gameType as 'pubg' | 'social' | 'gaming' | 'participation',
        requirements: challenge.requirements ? JSON.parse(challenge.requirements as string) : [],
        rewards: challenge.rewards ? JSON.parse(challenge.rewards as string) : { xp: 0, coins: 0 },
        startDate: challenge.startDate,
        endDate: challenge.endDate,
        isActive: challenge.isActive,
      };
      
      this.activeChallenges.set(challenge.id, newChallenge);
      
      this.logger.game('CHALLENGE_CREATED', challenge.id, 'system', {
        name: challenge.name,
        type: challenge.type,
      });
      
      return newChallenge;
    } catch (error) {
      this.logger.error('Failed to create challenge:', error);
      throw error;
    }
  }

  /**
   * Start a quiz session
   */
  public async startQuiz(
    guildId: string,
    channelId: string,
    hostId: string,
    settings: QuizSettings,
  ): Promise<QuizSession> {
    const sessionId = `quiz_${guildId}_${Date.now()}`;
    
    // Get questions based on settings
    const questions = this.getQuizQuestions(settings);
    
    const session: QuizSession = {
      id: sessionId,
      guildId,
      channelId,
      hostId,
      participants: new Map(),
      questions,
      currentQuestionIndex: 0,
      isActive: true,
      startedAt: new Date(),
      settings,
    };
    
    this.quizSessions.set(sessionId, session);
    
    // Save to database
    await this.database.client.quiz.create({
      data: {
        id: sessionId,
        guildId,
        title: `Quiz Session ${sessionId}`,
        questions: JSON.stringify(questions),
        difficulty: settings.difficulty === 'mixed' ? 'medium' : settings.difficulty,
        category: settings.category === 'mixed' ? 'general' : settings.category,
        timeLimit: settings.timePerQuestion,
        isActive: true,
      },
    });
    
    this.logger.game('QUIZ_STARTED', sessionId, hostId, {
      guildId,
      questionCount: questions.length,
    });
    
    return session;
  }

  /**
   * Get quiz questions based on settings
   */
  private getQuizQuestions(settings: QuizSettings): QuizQuestion[] {
    let availableQuestions = [...this.pubgQuestions];
    
    // Filter by category
    if (settings.category !== 'mixed') {
      availableQuestions = availableQuestions.filter(q => q.category === settings.category);
    }
    
    // Filter by difficulty
    if (settings.difficulty !== 'mixed') {
      availableQuestions = availableQuestions.filter(q => q.difficulty === settings.difficulty);
    }
    
    // Shuffle and take requested amount
    const shuffled = availableQuestions.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(settings.questionCount, shuffled.length));
  }

  /**
   * Join quiz session
   */
  public joinQuiz(sessionId: string, userId: string, username: string): boolean {
    const session = this.quizSessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }
    
    if (!session.participants.has(userId)) {
      session.participants.set(userId, {
        userId,
        username,
        score: 0,
        correctAnswers: 0,
        totalAnswers: 0,
        streak: 0,
        lastAnswerTime: 0,
      });
      
      this.logger.game('QUIZ_JOINED', sessionId, userId, { username });
    }
    
    return true;
  }

  /**
   * Submit quiz answer
   */
  public async submitQuizAnswer(
    sessionId: string,
    userId: string,
    answerIndex: number,
  ): Promise<{ correct: boolean; points: number; streak: number } | null> {
    const session = this.quizSessions.get(sessionId);
    if (!session || !session.isActive) {
      return null;
    }
    
    const participant = session.participants.get(userId);
    if (!participant) {
      return null;
    }
    
    const currentQuestion = session.questions[session.currentQuestionIndex];
    if (!currentQuestion) {
      return null;
    }
    
    const isCorrect = answerIndex === currentQuestion.correctAnswer;
    const now = Date.now();
    
    participant.totalAnswers++;
    participant.lastAnswerTime = now;
    
    let points = 0;
    if (isCorrect) {
      participant.correctAnswers++;
      participant.streak++;
      
      // Calculate points with streak bonus
      points = currentQuestion.points + (participant.streak * 2);
      participant.score += points;
      
      // Update challenge progress
      await this.updateChallengeProgress(userId, 'quiz_score', 1);
    } else {
      participant.streak = 0;
    }
    
    this.logger.game('QUIZ_ANSWER', sessionId, userId, {
      questionIndex: session.currentQuestionIndex,
      correct: isCorrect,
      points,
    });
    
    return {
      correct: isCorrect,
      points,
      streak: participant.streak,
    };
  }

  /**
   * Get quiz session
   */
  public getQuizSession(sessionId: string): QuizSession | null {
    return this.quizSessions.get(sessionId) || null;
  }

  /**
   * End quiz session
   */
  public async endQuiz(sessionId: string): Promise<QuizParticipant[]> {
    const session = this.quizSessions.get(sessionId);
    if (!session) {
      return [];
    }
    
    session.isActive = false;
    
    // Get final results sorted by score
    const results = Array.from(session.participants.values())
      .sort((a, b) => b.score - a.score);
    
    // Save results to database
    for (const participant of results) {
      await this.database.client.quizResult.create({
        data: {
          quizId: sessionId,
          userId: participant.userId,
          score: participant.score,
          totalQuestions: participant.totalAnswers,
          answers: {}, // Store participant answers if available
        },
      });
    }
    
    // Update quiz as completed
    await this.database.client.quiz.update({
      where: { id: sessionId },
      data: { 
        isActive: false,
      },
    });
    
    this.quizSessions.delete(sessionId);
    
    this.logger.game('QUIZ_ENDED', sessionId, results[0]?.userId || 'none', {
      participantCount: results.length,
      winner: results[0]?.username,
    });
    
    return results;
  }

  /**
   * Start a mini-game
   */
  public async startMiniGame(
    gameId: string,
    guildId: string,
    channelId: string,
    hostId: string,
  ): Promise<GameSession | null> {
    const game = this.miniGames.find(g => g.id === gameId);
    if (!game) {
      return null;
    }
    
    const sessionId = `game_${guildId}_${Date.now()}`;
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + game.duration * 1000);
    
    const session: GameSession = {
      id: sessionId,
      gameId,
      guildId,
      channelId,
      hostId,
      participants: new Map(),
      isActive: true,
      startedAt: startTime,
      endsAt: endTime,
      data: this.initializeGameData(game.type),
    };
    
    this.gameSessions.set(sessionId, session);
    
    // Auto-end game after duration
    setTimeout(async () => {
      await this.endMiniGame(sessionId);
    }, game.duration * 1000);
    
    this.logger.game('MINI_GAME_STARTED', sessionId, hostId, {
      gameId,
      guildId,
    });
    
    return session;
  }

  /**
   * Initialize game-specific data
   */
  private initializeGameData(gameType: string): any {
    switch (gameType) {
    case 'reaction':
      return {
        targetEmoji: '🎯',
        hasStarted: false,
        winner: null,
      };
    case 'typing':
      const phrases = [
        'The quick brown fox jumps over the lazy dog',
        'PUBG is the best battle royale game ever created',
        'Hawk Esports dominates the battlefield with skill and strategy',
      ];
      return {
        phrase: phrases[Math.floor(Math.random() * phrases.length)],
        submissions: new Map(),
      };
    case 'math':
      return {
        problems: this.generateMathProblems(5),
        currentProblem: 0,
      };
    case 'memory':
      return {
        sequence: this.generateEmojiSequence(5),
        revealed: false,
        submissions: new Map(),
      };
    default:
      return {};
    }
  }

  /**
   * Generate math problems
   */
  private generateMathProblems(count: number): Array<{ problem: string; answer: number }> {
    const problems = [];
    
    for (let i = 0; i < count; i++) {
      const a = Math.floor(Math.random() * 50) + 1;
      const b = Math.floor(Math.random() * 50) + 1;
      const operation = ['+', '-', '*'][Math.floor(Math.random() * 3)];
      
      let problem: string;
      let answer: number;
      
      switch (operation) {
      case '+':
        problem = `${a} + ${b}`;
        answer = a + b;
        break;
      case '-':
        problem = `${a} - ${b}`;
        answer = a - b;
        break;
      case '*':
        problem = `${a} × ${b}`;
        answer = a * b;
        break;
      default:
        problem = `${a} + ${b}`;
        answer = a + b;
      }
      
      problems.push({ problem, answer });
    }
    
    return problems;
  }

  /**
   * Generate emoji sequence for memory game
   */
  private generateEmojiSequence(length: number): string[] {
    const emojis = ['🎯', '🎮', '🏆', '⚡', '🔥', '💎', '🌟', '🎊'];
    const sequence: string[] = [];
    
    for (let i = 0; i < length; i++) {
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)] || '🎯';
      sequence.push(randomEmoji);
    }
    
    return sequence;
  }

  /**
   * Join mini-game
   */
  public joinMiniGame(sessionId: string, userId: string, username: string): boolean {
    const session = this.gameSessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }
    
    if (!session.participants.has(userId)) {
      session.participants.set(userId, {
        userId,
        username,
        score: 0,
        joinedAt: new Date(),
        data: {},
      });
      
      this.logger.game('MINI_GAME_JOINED', sessionId, userId, { username });
    }
    
    return true;
  }

  /**
   * End mini-game
   */
  public async endMiniGame(sessionId: string): Promise<GameParticipant[]> {
    const session = this.gameSessions.get(sessionId);
    if (!session) {
      return [];
    }
    
    session.isActive = false;
    
    const results = Array.from(session.participants.values())
      .sort((a, b) => b.score - a.score);
    
    // Award rewards to winner
    if (results.length > 0) {
      const winner = results[0];
      const game = this.miniGames.find(g => g.id === session.gameId);
      
      if (game && winner) {
        // Update challenge progress for winner
        await this.updateChallengeProgress(winner.userId, 'mini_game_wins', 1);
        
        // Save game result
        await this.database.client.gameResult.create({
          data: {
            userId: winner.userId,
            challengeId: session.gameId, // Using gameId as challengeId
            score: winner.score,
            timeSpent: Math.floor((new Date().getTime() - session.startedAt.getTime()) / 1000),
            data: JSON.stringify({ gameType: game.type, rewards: game.rewards }),
          },
        });
      }
    }
    
    this.gameSessions.delete(sessionId);
    
    this.logger.game('MINI_GAME_ENDED', sessionId, results[0]?.userId || 'none', {
      participantCount: results.length,
      winner: results[0]?.username,
    });
    
    return results;
  }

  /**
   * Get available mini-games
   */
  public getMiniGames(): MiniGame[] {
    return [...this.miniGames];
  }

  /**
   * Get active challenges
   */
  public getActiveChallenges(): Challenge[] {
    return Array.from(this.activeChallenges.values());
  }

  /**
   * Get user challenge progress
   */
  public getUserChallengeProgress(userId: string): Map<string, ChallengeProgress> {
    return this.challengeProgress.get(userId) || new Map();
  }

  /**
   * Update challenge progress
   */
  public async updateChallengeProgress(
    userId: string,
    requirementType: string,
    increment: number,
  ): Promise<void> {
    if (!this.challengeProgress.has(userId)) {
      this.challengeProgress.set(userId, new Map());
    }
    
    const userProgress = this.challengeProgress.get(userId)!;
    
    for (const challenge of this.activeChallenges.values()) {
      const requirement = challenge.requirements.find(r => r.type === requirementType);
      if (!requirement) {
        continue;
      }
      
      if (!userProgress.has(challenge.id)) {
        userProgress.set(challenge.id, {
          userId,
          challengeId: challenge.id,
          progress: new Map(),
          completed: false,
          claimed: false,
        });
      }
      
      const progress = userProgress.get(challenge.id)!;
      const currentValue = progress.progress.get(requirementType) || 0;
      const newValue = currentValue + increment;
      
      progress.progress.set(requirementType, newValue);
      
      // Check if challenge is completed
      if (newValue >= requirement.target && !progress.completed) {
        progress.completed = true;
        progress.completedAt = new Date();
        
        this.logger.game('CHALLENGE_COMPLETED', challenge.id, userId, {
          challengeName: challenge.name,
        });
        
        // Notify user about completion
        // This would typically send a DM or channel message
      }
    }
  }

  /**
   * Claim challenge rewards
   */
  public async claimChallengeRewards(userId: string, challengeId: string): Promise<boolean> {
    const userProgress = this.challengeProgress.get(userId);
    if (!userProgress) {
      return false;
    }
    
    const progress = userProgress.get(challengeId);
    if (!progress || !progress.completed || progress.claimed) {
      return false;
    }
    
    const challenge = this.activeChallenges.get(challengeId);
    if (!challenge) {
      return false;
    }
    
    progress.claimed = true;
    
    // Award rewards (this would integrate with economy/badge systems)
    this.logger.game('CHALLENGE_REWARDS_CLAIMED', challengeId, userId, {
      rewards: challenge.rewards,
    });
    
    return true;
  }

  /**
   * Expire old challenges
   */
  private async expireOldChallenges(): Promise<void> {
    const now = new Date();
    const expiredChallenges = [];
    
    for (const [id, challenge] of this.activeChallenges) {
      if (challenge.endDate < now) {
        expiredChallenges.push(id);
      }
    }
    
    for (const id of expiredChallenges) {
      this.activeChallenges.delete(id);
      
      await this.database.client.challenge.update({
        where: { id },
        data: { isActive: false },
      });
      
      this.logger.game('CHALLENGE_EXPIRED', id, 'system');
    }
  }

  /**
   * Check if two dates are in the same week
   */
  private isSameWeek(date1: Date, date2: Date): boolean {
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const startOfWeek1 = new Date(date1.getTime() - (date1.getDay() * 24 * 60 * 60 * 1000));
    const startOfWeek2 = new Date(date2.getTime() - (date2.getDay() * 24 * 60 * 60 * 1000));
    
    return Math.abs(startOfWeek1.getTime() - startOfWeek2.getTime()) < oneWeek;
  }

  /**
   * Get game session
   */
  public getGameSession(sessionId: string): GameSession | null {
    return this.gameSessions.get(sessionId) || null;
  }

  /**
   * Cleanup expired sessions
   */
  public cleanup(): void {
    const now = new Date();
    
    // Clean up expired game sessions
    for (const [id, session] of this.gameSessions) {
      if (session.endsAt < now) {
        this.gameSessions.delete(id);
      }
    }
    
    // Clean up old quiz sessions (older than 1 hour)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    for (const [id, session] of this.quizSessions) {
      if (session.startedAt < oneHourAgo) {
        this.quizSessions.delete(id);
      }
    }
  }
}