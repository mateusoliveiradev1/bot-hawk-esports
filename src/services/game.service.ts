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
    
    try {
      if (!client) {
        throw new Error('ExtendedClient is required');
      }
      this.cache = client.cache;
      this.database = client.database;
      this.client = client;
      
      if (!this.cache) {
        this.logger.warn('CacheService not available, some features may be limited');
      }
      
      if (!this.database) {
        throw new Error('DatabaseService is required');
      }
      
      this.loadActiveChallenges();
      this.startChallengeScheduler();
      
      this.logger.info('GameService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize GameService:', error);
      throw error;
    }
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
          category: ((challenge as any).category || 'pubg') as 'pubg' | 'social' | 'gaming' | 'participation',
          requirements: challenge.requirements ? JSON.parse(challenge.requirements as string) : [],
          rewards: challenge.rewards ? JSON.parse(challenge.rewards as string) : { xp: 0, coins: 0 },
          startDate: challenge.startDate || new Date(),
          endDate: challenge.endDate || new Date(),
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
  public async createChallenge(challengeData: Omit<Challenge, 'id' | 'isActive'>, guildId?: string): Promise<Challenge> {
    try {
      // Input validation
      if (!challengeData) {
        throw new Error('Challenge data is required');
      }
      
      if (!challengeData.name || typeof challengeData.name !== 'string' || challengeData.name.trim().length === 0) {
        throw new Error('Challenge name is required and must be a non-empty string');
      }
      
      if (challengeData.name.length > 100) {
        throw new Error('Challenge name must be 100 characters or less');
      }
      
      if (!challengeData.description || typeof challengeData.description !== 'string' || challengeData.description.trim().length === 0) {
        throw new Error('Challenge description is required and must be a non-empty string');
      }
      
      if (challengeData.description.length > 500) {
        throw new Error('Challenge description must be 500 characters or less');
      }
      
      if (!['daily', 'weekly', 'monthly', 'special'].includes(challengeData.type)) {
        throw new Error('Invalid challenge type');
      }
      
      if (!['pubg', 'social', 'gaming', 'participation'].includes(challengeData.category)) {
        throw new Error('Invalid challenge category');
      }
      
      if (!Array.isArray(challengeData.requirements) || challengeData.requirements.length === 0) {
        throw new Error('Challenge requirements must be a non-empty array');
      }
      
      // Validate requirements
      for (const req of challengeData.requirements) {
        if (!req.type || !['kills', 'wins', 'games', 'messages', 'voice_time', 'quiz_score', 'mini_game_wins'].includes(req.type)) {
          throw new Error(`Invalid requirement type: ${req.type}`);
        }
        
        if (typeof req.target !== 'number' || req.target <= 0 || req.target > 10000) {
          throw new Error(`Invalid requirement target: ${req.target}. Must be between 1 and 10000`);
        }
      }
      
      // Validate rewards
      if (!challengeData.rewards || typeof challengeData.rewards !== 'object') {
        throw new Error('Challenge rewards are required');
      }
      
      if (typeof challengeData.rewards.xp !== 'number' || challengeData.rewards.xp < 0 || challengeData.rewards.xp > 10000) {
        throw new Error('Invalid XP reward. Must be between 0 and 10000');
      }
      
      if (typeof challengeData.rewards.coins !== 'number' || challengeData.rewards.coins < 0 || challengeData.rewards.coins > 10000) {
        throw new Error('Invalid coins reward. Must be between 0 and 10000');
      }
      
      // Validate dates
      if (!(challengeData.startDate instanceof Date) || isNaN(challengeData.startDate.getTime())) {
        throw new Error('Invalid start date');
      }
      
      if (!(challengeData.endDate instanceof Date) || isNaN(challengeData.endDate.getTime())) {
        throw new Error('Invalid end date');
      }
      
      if (challengeData.endDate <= challengeData.startDate) {
        throw new Error('End date must be after start date');
      }
      
      // Sanitize data
      const sanitizedData = {
        ...challengeData,
        name: challengeData.name.trim(),
        description: challengeData.description.trim(),
      };
      
      const challenge = await this.database.client.challenge.create({
        data: {
          guildId: guildId || '1', // Use provided guildId or default
          name: sanitizedData.name,
          description: sanitizedData.description,
          type: sanitizedData.type,
          requirements: JSON.stringify(sanitizedData.requirements),
          rewards: JSON.stringify(sanitizedData.rewards),
          startDate: sanitizedData.startDate,
          endDate: sanitizedData.endDate,
          isActive: true,
        },
      });
      
      const newChallenge: Challenge = {
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        type: challenge.type as 'daily' | 'weekly' | 'monthly' | 'special',
        category: sanitizedData.category,
        requirements: challenge.requirements ? JSON.parse(challenge.requirements as string) : [],
        rewards: challenge.rewards ? JSON.parse(challenge.rewards as string) : { xp: 0, coins: 0 },
        startDate: challenge.startDate || new Date(),
        endDate: challenge.endDate || new Date(),
        isActive: challenge.isActive,
      };
      
      this.activeChallenges.set(challenge.id, newChallenge);
      
      this.logger.game('CHALLENGE_CREATED', challenge.id, 'system', {
        name: challenge.name,
        type: challenge.type,
        guildId: guildId || '1',
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
    try {
      // Input validation
      if (!guildId || typeof guildId !== 'string' || guildId.trim().length === 0) {
        throw new Error('Guild ID is required and must be a non-empty string');
      }
      
      if (!channelId || typeof channelId !== 'string' || channelId.trim().length === 0) {
        throw new Error('Channel ID is required and must be a non-empty string');
      }
      
      if (!hostId || typeof hostId !== 'string' || hostId.trim().length === 0) {
        throw new Error('Host ID is required and must be a non-empty string');
      }
      
      if (!settings || typeof settings !== 'object') {
        throw new Error('Quiz settings are required');
      }
      
      // Validate settings
      if (typeof settings.questionCount !== 'number' || settings.questionCount < 1 || settings.questionCount > 50) {
        throw new Error('Question count must be between 1 and 50');
      }
      
      if (typeof settings.timePerQuestion !== 'number' || settings.timePerQuestion < 10 || settings.timePerQuestion > 300) {
        throw new Error('Time per question must be between 10 and 300 seconds');
      }
      
      if (!['pubg', 'general', 'gaming', 'esports', 'mixed'].includes(settings.category)) {
        throw new Error('Invalid quiz category');
      }
      
      if (!['easy', 'medium', 'hard', 'mixed'].includes(settings.difficulty)) {
        throw new Error('Invalid quiz difficulty');
      }
      
      if (typeof settings.allowMultipleAttempts !== 'boolean') {
        throw new Error('allowMultipleAttempts must be a boolean');
      }
      
      if (typeof settings.showCorrectAnswer !== 'boolean') {
        throw new Error('showCorrectAnswer must be a boolean');
      }
      
      // Check for existing active quiz in the same channel
      const existingQuiz = Array.from(this.quizSessions.values())
        .find(session => session.guildId === guildId && session.channelId === channelId && session.isActive);
      
      if (existingQuiz) {
        throw new Error('There is already an active quiz in this channel');
      }
      
      const sessionId = `quiz_${guildId}_${Date.now()}`;
      
      // Get questions based on settings
      const questions = this.getQuizQuestions(settings);
      
      if (questions.length === 0) {
        throw new Error('No questions available for the selected criteria');
      }
      
      const session: QuizSession = {
        id: sessionId,
        guildId: guildId.trim(),
        channelId: channelId.trim(),
        hostId: hostId.trim(),
        participants: new Map(),
        questions,
        currentQuestionIndex: 0,
        isActive: true,
        startedAt: new Date(),
        settings,
      };
      
      this.quizSessions.set(sessionId, session);
      
      // Save to database with error handling
      try {
        await this.database.client.quiz.create({
          data: {
            id: sessionId,
            guildId: guildId.trim(),
            title: `Quiz Session ${sessionId}`,
            questions: JSON.stringify(questions),
            difficulty: settings.difficulty === 'mixed' ? 'medium' : settings.difficulty,
            category: settings.category === 'mixed' ? 'general' : settings.category,
            timeLimit: settings.timePerQuestion,
            isActive: true,
          },
        });
      } catch (dbError) {
        // Remove from memory if database save fails
        this.quizSessions.delete(sessionId);
        this.logger.error('Failed to save quiz to database:', dbError);
        throw new Error('Failed to save quiz session to database');
      }
      
      this.logger.game('QUIZ_STARTED', sessionId, hostId, {
        guildId,
        channelId,
        questionCount: questions.length,
        difficulty: settings.difficulty,
        category: settings.category,
      });
      
      return session;
    } catch (error) {
      this.logger.error('Failed to start quiz:', error);
      throw error;
    }
  }

  /**
   * Get quiz questions based on settings
   */
  private getQuizQuestions(settings: QuizSettings): QuizQuestion[] {
    try {
      // Input validation
      if (!settings || typeof settings !== 'object') {
        throw new Error('Quiz settings are required');
      }
      
      if (typeof settings.questionCount !== 'number' || settings.questionCount < 1 || settings.questionCount > 50) {
        throw new Error('Question count must be between 1 and 50');
      }
      
      if (!['pubg', 'general', 'gaming', 'esports', 'mixed'].includes(settings.category)) {
        throw new Error('Invalid quiz category');
      }
      
      if (!['easy', 'medium', 'hard', 'mixed'].includes(settings.difficulty)) {
        throw new Error('Invalid quiz difficulty');
      }
      
      // Validate question pool
      if (!this.pubgQuestions || this.pubgQuestions.length === 0) {
        throw new Error('No questions available in the question pool');
      }
      
      // Validate each question in the pool
      const validQuestions = this.pubgQuestions.filter(question => {
        return question &&
               typeof question.id === 'string' &&
               typeof question.question === 'string' &&
               Array.isArray(question.options) &&
               question.options.length >= 2 &&
               typeof question.correctAnswer === 'number' &&
               question.correctAnswer >= 0 &&
               question.correctAnswer < question.options.length &&
               ['easy', 'medium', 'hard'].includes(question.difficulty) &&
               ['pubg', 'general', 'gaming', 'esports'].includes(question.category) &&
               typeof question.points === 'number' &&
               question.points > 0 &&
               typeof question.timeLimit === 'number' &&
               question.timeLimit > 0;
      });
      
      if (validQuestions.length === 0) {
        throw new Error('No valid questions found in the question pool');
      }
      
      let availableQuestions = [...validQuestions];
      
      // Filter by category
      if (settings.category !== 'mixed') {
        availableQuestions = availableQuestions.filter(q => q.category === settings.category);
        
        if (availableQuestions.length === 0) {
          this.logger.warn(`No questions found for category: ${settings.category}. Using all categories.`);
          availableQuestions = [...validQuestions];
        }
      }
      
      // Filter by difficulty
      if (settings.difficulty !== 'mixed') {
        const filteredByDifficulty = availableQuestions.filter(q => q.difficulty === settings.difficulty);
        
        if (filteredByDifficulty.length === 0) {
          this.logger.warn(`No questions found for difficulty: ${settings.difficulty}. Using all difficulties.`);
        } else {
          availableQuestions = filteredByDifficulty;
        }
      }
      
      if (availableQuestions.length === 0) {
        throw new Error('No questions match the specified criteria');
      }
      
      // Shuffle using Fisher-Yates algorithm for better randomization
      const shuffled = [...availableQuestions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      
      const requestedCount = Math.min(settings.questionCount, shuffled.length);
      const selectedQuestions = shuffled.slice(0, requestedCount);
      
      if (selectedQuestions.length < settings.questionCount) {
        this.logger.warn(`Only ${selectedQuestions.length} questions available, but ${settings.questionCount} were requested`);
      }
      
      this.logger.debug(`Selected ${selectedQuestions.length} questions for quiz`, {
        category: settings.category,
        difficulty: settings.difficulty,
        totalAvailable: availableQuestions.length,
      });
      
      return selectedQuestions;
    } catch (error) {
      this.logger.error('Failed to get quiz questions:', error);
      throw error;
    }
  }

  /**
   * Join quiz session
   */
  public async joinQuiz(sessionId: string, userId: string, username: string): Promise<boolean> {
    try {
      // Input validation
      if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        throw new Error('Session ID is required and must be a non-empty string');
      }
      
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('User ID is required and must be a non-empty string');
      }
      
      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        throw new Error('Username is required and must be a non-empty string');
      }
      
      // Sanitize inputs
      const cleanSessionId = sessionId.trim();
      const cleanUserId = userId.trim();
      const cleanUsername = username.trim().substring(0, 100); // Limit username length
      
      const session = this.quizSessions.get(cleanSessionId);
      
      if (!session) {
        this.logger.warn(`Quiz session not found: ${cleanSessionId}`);
        return false;
      }
      
      if (!session.isActive) {
        this.logger.warn(`Quiz session is not active: ${cleanSessionId}`);
        return false;
      }
      
      // Check if quiz has already started (optional restriction)
      if (session.currentQuestionIndex > 0) {
        this.logger.warn(`Cannot join quiz ${cleanSessionId}: already in progress`);
        return false;
      }
      
      if (session.participants.has(cleanUserId)) {
        this.logger.debug(`User ${cleanUserId} already joined quiz ${cleanSessionId}`);
        return true; // Already joined
      }
      
      // Check participant limit (optional)
      const maxParticipants = 50; // Configurable limit
      if (session.participants.size >= maxParticipants) {
        this.logger.warn(`Quiz ${cleanSessionId} is full (${maxParticipants} participants)`);
        return false;
      }
      
      session.participants.set(cleanUserId, {
        userId: cleanUserId,
        username: cleanUsername,
        score: 0,
        correctAnswers: 0,
        totalAnswers: 0,
        streak: 0,
        lastAnswerTime: 0,
      });
      
      this.logger.game('QUIZ_JOINED', cleanSessionId, cleanUserId, {
        username: cleanUsername,
        participantCount: session.participants.size,
        guildId: session.guildId,
      });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to join quiz:', error);
      return false;
    }
  }

  /**
   * Submit quiz answer
   */
  public async submitQuizAnswer(
    sessionId: string,
    userId: string,
    answerIndex: number,
  ): Promise<{ correct: boolean; points: number; streak: number } | null> {
    try {
      // Input validation
      if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        throw new Error('Session ID is required and must be a non-empty string');
      }
      
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('User ID is required and must be a non-empty string');
      }
      
      if (typeof answerIndex !== 'number' || answerIndex < 0 || answerIndex > 10) {
        throw new Error('Answer index must be a valid number between 0 and 10');
      }
      
      // Sanitize inputs
      const cleanSessionId = sessionId.trim();
      const cleanUserId = userId.trim();
      
      const session = this.quizSessions.get(cleanSessionId);
      if (!session || !session.isActive) {
        this.logger.warn(`Quiz session not found or inactive: ${cleanSessionId}`);
        return null;
      }
      
      const participant = session.participants.get(cleanUserId);
      if (!participant) {
        this.logger.warn(`User not in quiz session: ${cleanUserId}`);
        return null;
      }
      
      const currentQuestion = session.questions[session.currentQuestionIndex];
      if (!currentQuestion) {
        this.logger.warn(`No current question available for session: ${cleanSessionId}`);
        return null;
      }
      
      // Validate answer index against question options
      if (answerIndex >= currentQuestion.options.length) {
        throw new Error(`Invalid answer index: ${answerIndex}. Question has ${currentQuestion.options.length} options`);
      }
      
      // Check if user already answered this question (if multiple attempts not allowed)
      if (!session.settings.allowMultipleAttempts) {
        const answeredKey = `${cleanUserId}_${session.currentQuestionIndex}`;
        if ((session as any).answeredQuestions?.has(answeredKey)) {
          this.logger.warn(`User ${cleanUserId} already answered question ${session.currentQuestionIndex}`);
          return null;
        }
        
        // Track answered questions
        if (!(session as any).answeredQuestions) {
          (session as any).answeredQuestions = new Set();
        }
        (session as any).answeredQuestions.add(answeredKey);
      }
      
      const isCorrect = answerIndex === currentQuestion.correctAnswer;
      const now = Date.now();
      
      participant.totalAnswers++;
      participant.lastAnswerTime = now;
      
      let points = 0;
      if (isCorrect) {
        participant.correctAnswers++;
        participant.streak++;
        
        // Calculate points with streak bonus and time bonus
        const timeBonus = Math.max(0, Math.floor((currentQuestion.timeLimit - 10) / 5)); // Time bonus
        points = currentQuestion.points + (participant.streak * 2) + timeBonus;
        participant.score += points;
        
        // Update challenge progress with error handling
        try {
          await this.updateChallengeProgress(cleanUserId, 'quiz_score', 1);
        } catch (challengeError) {
          this.logger.warn('Failed to update challenge progress:', challengeError);
          // Don't return null, just log the error
        }
      } else {
        participant.streak = 0;
      }
      
      this.logger.game('QUIZ_ANSWER', cleanSessionId, cleanUserId, {
        questionIndex: session.currentQuestionIndex,
        answerIndex,
        correct: isCorrect,
        points,
        streak: participant.streak,
        guildId: session.guildId,
      });
      
      return {
        correct: isCorrect,
        points,
        streak: participant.streak,
      };
    } catch (error) {
      this.logger.error('Failed to submit quiz answer:', error);
      return null;
    }
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
      await this.database.client.gameResult.create({
        data: {
          challengeId: sessionId,
          userId: participant.userId,
          score: participant.score,
          data: JSON.stringify({}), // Store participant data if available
        },
      });
    }
    
    // Update challenge as completed
    await this.database.client.challenge.update({
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