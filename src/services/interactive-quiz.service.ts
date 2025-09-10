import { ExtendedClient } from '../types/client';
import { DatabaseService } from '../database/database.service';
import { CacheService } from './cache.service';
import { Logger } from '../utils/logger';
import {
  EmbedBuilder,
  User,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';

// Enhanced Quiz Types
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  category: string;
  subcategory?: string;
  points: number;
  timeLimit: number;
  explanation?: string;
  imageUrl?: string;
  videoUrl?: string;
  tags: string[];
  source?: string;
  lastUpdated: Date;
}

export interface QuizCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: number;
  subcategories: QuizSubcategory[];
  totalQuestions: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
}

export interface QuizSubcategory {
  id: string;
  name: string;
  description: string;
  questionCount: number;
}

export interface QuizSession {
  id: string;
  hostId: string;
  channelId: string;
  guildId: string;
  participants: Map<string, QuizParticipant>;
  settings: QuizSettings;
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  status: 'waiting' | 'active' | 'paused' | 'finished';
  startTime: Date;
  endTime?: Date;
  leaderboard: QuizParticipant[];
  totalPrizePool: number;
}

export interface QuizParticipant {
  userId: string;
  username: string;
  score: number;
  correctAnswers: number;
  totalAnswers: number;
  streak: number;
  maxStreak: number;
  averageResponseTime: number;
  badges: string[];
  joinTime: Date;
  lastAnswerTime?: Date;
}

export interface QuizSettings {
  category: string;
  subcategory?: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed' | 'adaptive';
  questionCount: number;
  timePerQuestion: number;
  maxParticipants: number;
  allowHints: boolean;
  showExplanations: boolean;
  enablePowerUps: boolean;
  prizeMode: 'winner-takes-all' | 'top-3' | 'participation';
  customQuestions?: QuizQuestion[];
}

export interface QuizStats {
  totalQuizzes: number;
  totalQuestions: number;
  averageScore: number;
  bestStreak: number;
  favoriteCategory: string;
  totalTimeSpent: number;
  badgesEarned: string[];
  achievements: QuizAchievement[];
}

export interface QuizAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlockedAt: Date;
  progress?: number;
  maxProgress?: number;
}

export interface PowerUp {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  effect: 'skip_question' | 'extra_time' | 'eliminate_option' | 'double_points' | 'freeze_time';
  duration?: number;
  uses: number;
}

export class InteractiveQuizService {
  private client: ExtendedClient;
  private database: DatabaseService;
  private cache: CacheService;
  private logger: Logger;
  private activeSessions: Map<string, QuizSession> = new Map();
  private questionPool: Map<string, QuizQuestion[]> = new Map();
  private categories: QuizCategory[] = [];
  private achievements: QuizAchievement[] = [];
  private powerUps: PowerUp[] = [];

  constructor(client: ExtendedClient) {
    this.client = client;
    this.database = client.database;
    this.cache = client.cache;
    this.logger = client.logger;

    this.initializeQuizData();
    this.setupEventHandlers();
  }

  /**
   * Initialize quiz categories, questions, and achievements
   */
  private async initializeQuizData(): Promise<void> {
    try {
      await this.loadCategories();
      await this.loadQuestions();
      await this.loadAchievements();
      await this.loadPowerUps();

      this.logger.info('Interactive Quiz Service initialized successfully');
    } catch (error: any) {
      this.logger.error('Failed to initialize Interactive Quiz Service:', error);
    }
  }

  /**
   * Load quiz categories from database or create defaults
   */
  private async loadCategories(): Promise<void> {
    this.categories = [
      {
        id: 'pubg_maps',
        name: '🗺️ PUBG - Mapas & Localizações',
        description: 'Teste seus conhecimentos sobre todos os mapas do PUBG',
        icon: '🗺️',
        color: 0x4caf50,
        totalQuestions: 150,
        difficulty: 'mixed',
        subcategories: [
          { id: 'erangel', name: 'Erangel', description: 'O mapa clássico', questionCount: 25 },
          { id: 'miramar', name: 'Miramar', description: 'O deserto', questionCount: 20 },
          { id: 'sanhok', name: 'Sanhok', description: 'A selva tropical', questionCount: 20 },
          { id: 'vikendi', name: 'Vikendi', description: 'O mapa de neve', questionCount: 18 },
          { id: 'karakin', name: 'Karakin', description: 'O mapa pequeno', questionCount: 15 },
          { id: 'paramo', name: 'Paramo', description: 'As montanhas', questionCount: 12 },
          { id: 'taego', name: 'Taego', description: 'O mapa coreano', questionCount: 22 },
          { id: 'deston', name: 'Deston', description: 'O mapa urbano', questionCount: 18 },
        ],
      },
      {
        id: 'pubg_weapons',
        name: '🔫 PUBG - Armas & Equipamentos',
        description: 'Domine o conhecimento sobre armamentos e equipamentos',
        icon: '🔫',
        color: 0xff5722,
        totalQuestions: 200,
        difficulty: 'mixed',
        subcategories: [
          {
            id: 'assault_rifles',
            name: 'Rifles de Assalto',
            description: 'ARs e suas características',
            questionCount: 35,
          },
          {
            id: 'sniper_rifles',
            name: 'Rifles de Precisão',
            description: 'Snipers e DMRs',
            questionCount: 30,
          },
          {
            id: 'smgs',
            name: 'Submetralhadoras',
            description: 'SMGs para combate próximo',
            questionCount: 25,
          },
          {
            id: 'shotguns',
            name: 'Espingardas',
            description: 'Shotguns e suas munições',
            questionCount: 20,
          },
          { id: 'pistols', name: 'Pistolas', description: 'Armas secundárias', questionCount: 15 },
          {
            id: 'throwables',
            name: 'Granadas',
            description: 'Explosivos e utilitários',
            questionCount: 20,
          },
          {
            id: 'attachments',
            name: 'Acessórios',
            description: 'Miras, canos e grips',
            questionCount: 30,
          },
          { id: 'armor', name: 'Proteção', description: 'Coletes e capacetes', questionCount: 25 },
        ],
      },
      {
        id: 'pubg_esports',
        name: '🏆 PUBG - Esports & Competitivo',
        description: 'Cenário competitivo, times e torneios',
        icon: '🏆',
        color: 0xffd700,
        totalQuestions: 120,
        difficulty: 'hard',
        subcategories: [
          {
            id: 'tournaments',
            name: 'Torneios',
            description: 'PGI, PCS, PMCO e outros',
            questionCount: 40,
          },
          {
            id: 'teams',
            name: 'Times Profissionais',
            description: 'Equipes e jogadores famosos',
            questionCount: 35,
          },
          {
            id: 'strategies',
            name: 'Estratégias Pro',
            description: 'Táticas competitivas',
            questionCount: 25,
          },
          {
            id: 'meta',
            name: 'Meta Game',
            description: 'Tendências e mudanças',
            questionCount: 20,
          },
        ],
      },
      {
        id: 'pubg_mechanics',
        name: '⚙️ PUBG - Mecânicas & Sistema',
        description: 'Mecânicas do jogo, física e sistemas internos',
        icon: '⚙️',
        color: 0x9c27b0,
        totalQuestions: 100,
        difficulty: 'medium',
        subcategories: [
          {
            id: 'ballistics',
            name: 'Balística',
            description: 'Física dos projéteis',
            questionCount: 25,
          },
          {
            id: 'vehicles',
            name: 'Veículos',
            description: 'Carros, motos e barcos',
            questionCount: 20,
          },
          { id: 'zone', name: 'Zona Azul', description: 'Mecânicas da zona', questionCount: 15 },
          {
            id: 'loot',
            name: 'Sistema de Loot',
            description: 'Spawn rates e raridade',
            questionCount: 20,
          },
          {
            id: 'ranking',
            name: 'Sistema de Rank',
            description: 'RP, tiers e seasons',
            questionCount: 20,
          },
        ],
      },
      {
        id: 'gaming_general',
        name: '🎮 Gaming Geral',
        description: 'Conhecimentos gerais sobre jogos e indústria',
        icon: '🎮',
        color: 0x2196f3,
        totalQuestions: 180,
        difficulty: 'mixed',
        subcategories: [
          {
            id: 'history',
            name: 'História dos Games',
            description: 'Evolução da indústria',
            questionCount: 40,
          },
          { id: 'genres', name: 'Gêneros', description: 'FPS, RPG, MOBA, etc.', questionCount: 30 },
          {
            id: 'companies',
            name: 'Empresas',
            description: 'Desenvolvedoras e publishers',
            questionCount: 35,
          },
          {
            id: 'hardware',
            name: 'Hardware',
            description: 'PCs, consoles e periféricos',
            questionCount: 40,
          },
          {
            id: 'streaming',
            name: 'Streaming & Content',
            description: 'Twitch, YouTube e criadores',
            questionCount: 35,
          },
        ],
      },
      {
        id: 'esports_general',
        name: '🎯 Esports Geral',
        description: 'Cenário competitivo de diversos jogos',
        icon: '🎯',
        color: 0xff9800,
        totalQuestions: 140,
        difficulty: 'hard',
        subcategories: [
          {
            id: 'lol',
            name: 'League of Legends',
            description: 'Worlds, LCS, LEC, etc.',
            questionCount: 35,
          },
          {
            id: 'csgo',
            name: 'Counter-Strike',
            description: 'Majors e cena competitiva',
            questionCount: 30,
          },
          { id: 'valorant', name: 'Valorant', description: 'VCT e Masters', questionCount: 25 },
          {
            id: 'dota2',
            name: 'Dota 2',
            description: 'The International e DPC',
            questionCount: 20,
          },
          {
            id: 'overwatch',
            name: 'Overwatch',
            description: 'OWL e competições',
            questionCount: 15,
          },
          {
            id: 'mobile',
            name: 'Mobile Esports',
            description: 'PUBG Mobile, Free Fire, etc.',
            questionCount: 15,
          },
        ],
      },
    ];
  }

  /**
   * Load quiz questions from database or generate defaults
   */
  private async loadQuestions(): Promise<void> {
    try {
      // Load existing questions from database
      const existingQuestions = await this.database.query(
        'SELECT * FROM quiz_questions ORDER BY category, difficulty, created_at DESC',
      );

      // Organize questions by category
      for (const question of existingQuestions) {
        const category = question.category;
        if (!this.questionPool.has(category)) {
          this.questionPool.set(category, []);
        }
        this.questionPool.get(category)!.push({
          id: question.id,
          question: question.question,
          options: JSON.parse(question.options),
          correctAnswer: question.correct_answer,
          difficulty: question.difficulty,
          category: question.category,
          subcategory: question.subcategory,
          points: question.points,
          timeLimit: question.time_limit,
          explanation: question.explanation,
          imageUrl: question.image_url,
          videoUrl: question.video_url,
          tags: JSON.parse(question.tags || '[]'),
          source: question.source,
          lastUpdated: new Date(question.updated_at),
        });
      }

      // Generate default questions if none exist
      if (existingQuestions.length === 0) {
        await this.generateDefaultQuestions();
      }
    } catch (error) {
      this.logger.warn(
        'Quiz questions table not found or database error, generating default questions:',
        error,
      );
      // Generate default questions if database query fails
      await this.generateDefaultQuestions();
    }
  }

  /**
   * Generate default quiz questions
   */
  private async generateDefaultQuestions(): Promise<void> {
    const defaultQuestions: Partial<QuizQuestion>[] = [
      // PUBG Maps - Erangel
      {
        question: 'Qual é a cidade mais populosa do mapa Erangel?',
        options: ['Pochinki', 'School', 'Military Base', 'Georgopol'],
        correctAnswer: 0,
        difficulty: 'easy',
        category: 'pubg_maps',
        subcategory: 'erangel',
        points: 10,
        timeLimit: 30,
        explanation: 'Pochinki é conhecida por ser a cidade mais populosa e disputada de Erangel.',
        tags: ['erangel', 'cidades', 'hot-drop'],
      },
      {
        question: 'Quantas pontes conectam a ilha militar ao continente em Erangel?',
        options: ['1', '2', '3', '4'],
        correctAnswer: 1,
        difficulty: 'medium',
        category: 'pubg_maps',
        subcategory: 'erangel',
        points: 15,
        timeLimit: 45,
        explanation:
          'Existem duas pontes principais conectando a ilha militar: uma ao norte e outra ao sul.',
        tags: ['erangel', 'pontes', 'militar'],
      },
      // PUBG Weapons - Assault Rifles
      {
        question: 'Qual rifle de assalto tem a maior taxa de tiro no PUBG?',
        options: ['M416', 'AKM', 'Groza', 'Beryl M762'],
        correctAnswer: 2,
        difficulty: 'medium',
        category: 'pubg_weapons',
        subcategory: 'assault_rifles',
        points: 15,
        timeLimit: 30,
        explanation:
          'A Groza tem a maior taxa de tiro entre os rifles de assalto, sendo exclusiva de airdrops.',
        tags: ['groza', 'taxa-de-tiro', 'airdrop'],
      },
      {
        question: 'Qual munição é usada pela AKM?',
        options: ['5.56mm', '7.62mm', '.45 ACP', '9mm'],
        correctAnswer: 1,
        difficulty: 'easy',
        category: 'pubg_weapons',
        subcategory: 'assault_rifles',
        points: 10,
        timeLimit: 25,
        explanation: 'A AKM usa munição 7.62mm, que causa mais dano mas tem mais recuo.',
        tags: ['akm', 'municao', '7.62mm'],
      },
      // PUBG Esports
      {
        question: 'Qual foi o primeiro campeonato mundial oficial do PUBG?',
        options: [
          'PGI 2018',
          'PUBG Global Championship 2017',
          'IEM Katowice 2018',
          'Gamescom 2017',
        ],
        correctAnswer: 0,
        difficulty: 'hard',
        category: 'pubg_esports',
        subcategory: 'tournaments',
        points: 20,
        timeLimit: 45,
        explanation: 'O PUBG Global Invitational 2018 foi o primeiro campeonato mundial oficial.',
        tags: ['pgi', 'mundial', 'torneio'],
      },
      // Gaming General
      {
        question: 'Em que ano foi lançado o primeiro console de videogame?',
        options: ['1970', '1972', '1975', '1977'],
        correctAnswer: 1,
        difficulty: 'hard',
        category: 'gaming_general',
        subcategory: 'history',
        points: 20,
        timeLimit: 60,
        explanation: 'O Magnavox Odyssey foi lançado em 1972, sendo o primeiro console doméstico.',
        tags: ['historia', 'console', 'magnavox'],
      },
    ];

    // Save default questions to database (if possible) and add to memory
    for (const question of defaultQuestions) {
      const id = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Try to save to database, but continue if it fails
      try {
        await this.database.query(
          `INSERT INTO quiz_questions 
           (id, question, options, correct_answer, difficulty, category, subcategory, points, time_limit, explanation, tags, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            id,
            question.question,
            JSON.stringify(question.options),
            question.correctAnswer,
            question.difficulty,
            question.category,
            question.subcategory,
            question.points,
            question.timeLimit,
            question.explanation,
            JSON.stringify(question.tags || []),
          ],
        );
      } catch (dbError) {
        this.logger.warn(
          `Failed to save question ${id} to database, keeping in memory only:`,
          dbError,
        );
      }

      // Add to memory pool (always do this)
      const category = question.category!;
      if (!this.questionPool.has(category)) {
        this.questionPool.set(category, []);
      }
      this.questionPool.get(category)!.push({
        id,
        question: question.question!,
        options: question.options!,
        correctAnswer: question.correctAnswer!,
        difficulty: question.difficulty!,
        category: question.category!,
        subcategory: question.subcategory,
        points: question.points!,
        timeLimit: question.timeLimit!,
        explanation: question.explanation,
        tags: question.tags || [],
        lastUpdated: new Date(),
      });
    }
  }

  /**
   * Load quiz achievements
   */
  private async loadAchievements(): Promise<void> {
    this.achievements = [
      {
        id: 'first_quiz',
        name: '🎯 Primeiro Quiz',
        description: 'Complete seu primeiro quiz',
        icon: '🎯',
        rarity: 'common',
        unlockedAt: new Date(),
      },
      {
        id: 'perfect_score',
        name: '💯 Pontuação Perfeita',
        description: 'Acerte todas as perguntas de um quiz',
        icon: '💯',
        rarity: 'rare',
        unlockedAt: new Date(),
      },
      {
        id: 'speed_demon',
        name: '⚡ Demônio da Velocidade',
        description: 'Responda 10 perguntas em menos de 5 segundos cada',
        icon: '⚡',
        rarity: 'epic',
        unlockedAt: new Date(),
      },
      {
        id: 'quiz_master',
        name: '👑 Mestre dos Quizzes',
        description: 'Complete 100 quizzes',
        icon: '👑',
        rarity: 'legendary',
        unlockedAt: new Date(),
        progress: 0,
        maxProgress: 100,
      },
    ];
  }

  /**
   * Load power-ups
   */
  private async loadPowerUps(): Promise<void> {
    this.powerUps = [
      {
        id: 'skip_question',
        name: '⏭️ Pular Pergunta',
        description: 'Pula a pergunta atual sem perder pontos',
        icon: '⏭️',
        cost: 50,
        effect: 'skip_question',
        uses: 1,
      },
      {
        id: 'extra_time',
        name: '⏰ Tempo Extra',
        description: 'Adiciona 15 segundos ao tempo da pergunta',
        icon: '⏰',
        cost: 30,
        effect: 'extra_time',
        duration: 15,
        uses: 1,
      },
      {
        id: 'eliminate_option',
        name: '❌ Eliminar Opção',
        description: 'Remove duas opções incorretas',
        icon: '❌',
        cost: 40,
        effect: 'eliminate_option',
        uses: 1,
      },
      {
        id: 'double_points',
        name: '💎 Pontos Duplos',
        description: 'Dobra os pontos da próxima resposta correta',
        icon: '💎',
        cost: 75,
        effect: 'double_points',
        uses: 1,
      },
    ];
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Auto-cleanup finished sessions
    setInterval(() => {
      this.cleanupFinishedSessions();
    }, 300000); // 5 minutes
  }

  /**
   * Create a new quiz session
   */
  public async createQuizSession(
    hostId: string,
    channelId: string,
    guildId: string,
    settings: QuizSettings,
  ): Promise<QuizSession> {
    const sessionId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get questions for the session
    const questions = await this.getQuestionsForSession(settings);

    if (questions.length === 0) {
      throw new Error('Nenhuma pergunta encontrada para as configurações especificadas');
    }

    const session: QuizSession = {
      id: sessionId,
      hostId,
      channelId,
      guildId,
      participants: new Map(),
      settings,
      questions: questions.slice(0, settings.questionCount),
      currentQuestionIndex: 0,
      status: 'waiting',
      startTime: new Date(),
      leaderboard: [],
      totalPrizePool: this.calculatePrizePool(settings),
    };

    this.activeSessions.set(sessionId, session);

    // Cache session for 1 hour
    await this.cache.set(`quiz:session:${sessionId}`, session, 3600);

    this.logger.info(`Created quiz session ${sessionId} in channel ${channelId}`);

    return session;
  }

  /**
   * Get questions for a quiz session based on settings
   */
  private async getQuestionsForSession(settings: QuizSettings): Promise<QuizQuestion[]> {
    let availableQuestions: QuizQuestion[] = [];

    // Get questions from specified category
    if (this.questionPool.has(settings.category)) {
      availableQuestions = [...this.questionPool.get(settings.category)!];
    }

    // Filter by subcategory if specified
    if (settings.subcategory) {
      availableQuestions = availableQuestions.filter(q => q.subcategory === settings.subcategory);
    }

    // Filter by difficulty
    if (settings.difficulty !== 'mixed' && settings.difficulty !== 'adaptive') {
      availableQuestions = availableQuestions.filter(q => q.difficulty === settings.difficulty);
    }

    // Use custom questions if provided
    if (settings.customQuestions && settings.customQuestions.length > 0) {
      availableQuestions = [...settings.customQuestions];
    }

    // Shuffle questions
    for (let i = availableQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableQuestions[i], availableQuestions[j]] = [
        availableQuestions[j],
        availableQuestions[i],
      ];
    }

    return availableQuestions;
  }

  /**
   * Calculate prize pool based on settings
   */
  private calculatePrizePool(settings: QuizSettings): number {
    const basePool = settings.questionCount * 10;
    const difficultyMultiplier = {
      easy: 1,
      medium: 1.5,
      hard: 2,
      expert: 2.5,
      mixed: 1.8,
      adaptive: 2.2,
    };

    return Math.floor(basePool * difficultyMultiplier[settings.difficulty]);
  }

  /**
   * Join a quiz session
   */
  public async joinQuizSession(sessionId: string, user: User): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      throw new Error('Sessão de quiz não encontrada');
    }

    if (session.status !== 'waiting') {
      throw new Error('Esta sessão de quiz já começou');
    }

    if (session.participants.size >= session.settings.maxParticipants) {
      throw new Error('Esta sessão de quiz está lotada');
    }

    if (session.participants.has(user.id)) {
      return false; // Already joined
    }

    const participant: QuizParticipant = {
      userId: user.id,
      username: user.username,
      score: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      streak: 0,
      maxStreak: 0,
      averageResponseTime: 0,
      badges: [],
      joinTime: new Date(),
    };

    session.participants.set(user.id, participant);

    // Update cache
    await this.cache.set(`quiz:session:${sessionId}`, session, 3600);

    this.logger.info(`User ${user.username} joined quiz session ${sessionId}`);

    return true;
  }

  /**
   * Start a quiz session
   */
  public async startQuizSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      throw new Error('Sessão de quiz não encontrada');
    }

    if (session.status !== 'waiting') {
      throw new Error('Esta sessão de quiz já foi iniciada');
    }

    if (session.participants.size === 0) {
      throw new Error('Nenhum participante na sessão');
    }

    session.status = 'active';
    session.startTime = new Date();

    // Update cache
    await this.cache.set(`quiz:session:${sessionId}`, session, 3600);

    this.logger.info(
      `Started quiz session ${sessionId} with ${session.participants.size} participants`,
    );
  }

  /**
   * Get current question for a session
   */
  public getCurrentQuestion(sessionId: string): QuizQuestion | null {
    const session = this.activeSessions.get(sessionId);

    if (!session || session.status !== 'active') {
      return null;
    }

    if (session.currentQuestionIndex >= session.questions.length) {
      return null;
    }

    return session.questions[session.currentQuestionIndex];
  }

  /**
   * Submit an answer to a quiz question
   */
  public async submitAnswer(
    sessionId: string,
    userId: string,
    answerIndex: number,
    responseTime: number,
  ): Promise<{ correct: boolean; points: number; explanation?: string }> {
    const session = this.activeSessions.get(sessionId);

    if (!session || session.status !== 'active') {
      throw new Error('Sessão de quiz não encontrada ou não ativa');
    }

    const participant = session.participants.get(userId);
    if (!participant) {
      throw new Error('Participante não encontrado na sessão');
    }

    const currentQuestion = this.getCurrentQuestion(sessionId);
    if (!currentQuestion) {
      throw new Error('Nenhuma pergunta ativa');
    }

    const isCorrect = answerIndex === currentQuestion.correctAnswer;
    let points = 0;

    if (isCorrect) {
      // Base points
      points = currentQuestion.points;

      // Time bonus (up to 25% extra for fast answers)
      const timeBonus = Math.max(
        0,
        ((currentQuestion.timeLimit - responseTime) / currentQuestion.timeLimit) * 0.25,
      );
      points += Math.floor(points * timeBonus);

      // Streak bonus (10% per consecutive correct answer)
      const streakBonus = participant.streak * 0.1;
      points += Math.floor(points * streakBonus);

      participant.correctAnswers++;
      participant.streak++;
      participant.maxStreak = Math.max(participant.maxStreak, participant.streak);
    } else {
      participant.streak = 0;
    }

    participant.totalAnswers++;
    participant.score += points;
    participant.lastAnswerTime = new Date();

    // Update average response time
    participant.averageResponseTime =
      (participant.averageResponseTime * (participant.totalAnswers - 1) + responseTime) /
      participant.totalAnswers;

    // Update cache
    await this.cache.set(`quiz:session:${sessionId}`, session, 3600);

    return {
      correct: isCorrect,
      points,
      explanation: currentQuestion.explanation,
    };
  }

  /**
   * Move to next question
   */
  public async nextQuestion(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);

    if (!session || session.status !== 'active') {
      return false;
    }

    session.currentQuestionIndex++;

    // Check if quiz is finished
    if (session.currentQuestionIndex >= session.questions.length) {
      await this.finishQuizSession(sessionId);
      return false;
    }

    // Update cache
    await this.cache.set(`quiz:session:${sessionId}`, session, 3600);

    return true;
  }

  /**
   * Finish a quiz session
   */
  public async finishQuizSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      return;
    }

    session.status = 'finished';
    session.endTime = new Date();

    // Calculate final leaderboard
    session.leaderboard = Array.from(session.participants.values()).sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.correctAnswers !== a.correctAnswers) {
        return b.correctAnswers - a.correctAnswers;
      }
      return a.averageResponseTime - b.averageResponseTime;
    });

    // Award achievements and save stats
    await this.processQuizResults(session);

    // Update cache
    await this.cache.set(`quiz:session:${sessionId}`, session, 3600);

    this.logger.info(`Finished quiz session ${sessionId}`);
  }

  /**
   * Process quiz results and award achievements
   */
  private async processQuizResults(session: QuizSession): Promise<void> {
    for (const participant of session.participants.values()) {
      try {
        // Save quiz stats to database
        await this.database.query(
          `INSERT INTO quiz_stats 
           (user_id, session_id, score, correct_answers, total_answers, max_streak, average_response_time, completed_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            participant.userId,
            session.id,
            participant.score,
            participant.correctAnswers,
            participant.totalAnswers,
            participant.maxStreak,
            participant.averageResponseTime,
          ],
        );

        // Check for achievements
        await this.checkAchievements(participant.userId, participant, session);

        // Award XP and coins based on performance
        await this.awardRewards(participant.userId, participant, session);
      } catch (error: any) {
        this.logger.error(`Failed to process results for user ${participant.userId}:`, error);
      }
    }
  }

  /**
   * Check and award achievements
   */
  private async checkAchievements(
    userId: string,
    participant: QuizParticipant,
    session: QuizSession,
  ): Promise<void> {
    const newAchievements: string[] = [];

    // First quiz achievement
    const quizCount = await this.getUserQuizCount(userId);
    if (quizCount === 1) {
      newAchievements.push('first_quiz');
    }

    // Perfect score achievement
    if (participant.correctAnswers === participant.totalAnswers && participant.totalAnswers > 0) {
      newAchievements.push('perfect_score');
    }

    // Speed demon achievement
    if (participant.averageResponseTime < 5 && participant.totalAnswers >= 10) {
      newAchievements.push('speed_demon');
    }

    // Quiz master achievement (100 quizzes)
    if (quizCount >= 100) {
      newAchievements.push('quiz_master');
    }

    // Save new achievements
    for (const achievementId of newAchievements) {
      await this.database.query(
        'INSERT IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, NOW())',
        [userId, achievementId],
      );
    }
  }

  /**
   * Award XP and coins based on performance
   */
  private async awardRewards(
    userId: string,
    participant: QuizParticipant,
    session: QuizSession,
  ): Promise<void> {
    // Calculate XP reward
    const baseXP = participant.score * 2;
    const participationXP = session.questions.length * 5;
    const totalXP = baseXP + participationXP;

    // Calculate coin reward
    const baseCoins = Math.floor(participant.score / 10);
    const participationCoins = session.questions.length * 2;
    const totalCoins = baseCoins + participationCoins;

    // Award through XP service if available
    if (this.client.services?.xp) {
      await this.client.services.xp.addXP(userId, totalXP, 'quiz_completion');
    }

    // Save coin reward to database
    await this.database.query('UPDATE users SET coins = coins + ? WHERE user_id = ?', [
      totalCoins,
      userId,
    ]);
  }

  /**
   * Get user's total quiz count
   */
  private async getUserQuizCount(userId: string): Promise<number> {
    const result = await this.database.query(
      'SELECT COUNT(*) as count FROM quiz_stats WHERE user_id = ?',
      [userId],
    );
    return result[0]?.count || 0;
  }

  /**
   * Get quiz session by ID
   */
  public getQuizSession(sessionId: string): QuizSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get all available categories
   */
  public getCategories(): QuizCategory[] {
    return this.categories;
  }

  /**
   * Get user quiz statistics
   */
  public async getUserStats(userId: string): Promise<QuizStats> {
    const stats = await this.database.query(
      `SELECT 
         COUNT(*) as total_quizzes,
         SUM(total_answers) as total_questions,
         AVG(score) as average_score,
         MAX(max_streak) as best_streak,
         AVG(average_response_time) as avg_response_time
       FROM quiz_stats 
       WHERE user_id = ?`,
      [userId],
    );

    const achievements = await this.database.query(
      'SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?',
      [userId],
    );

    return {
      totalQuizzes: stats[0]?.total_quizzes || 0,
      totalQuestions: stats[0]?.total_questions || 0,
      averageScore: stats[0]?.average_score || 0,
      bestStreak: stats[0]?.best_streak || 0,
      favoriteCategory: 'pubg_maps', // TODO: Calculate from data
      totalTimeSpent: stats[0]?.avg_response_time * stats[0]?.total_questions || 0,
      badgesEarned: achievements.map((a: any) => a.achievement_id),
      achievements: achievements.map((a: any) => ({
        id: a.achievement_id,
        name: this.achievements.find(ach => ach.id === a.achievement_id)?.name || 'Unknown',
        description: this.achievements.find(ach => ach.id === a.achievement_id)?.description || '',
        icon: this.achievements.find(ach => ach.id === a.achievement_id)?.icon || '🏆',
        rarity: this.achievements.find(ach => ach.id === a.achievement_id)?.rarity || 'common',
        unlockedAt: new Date(a.unlocked_at),
      })),
    };
  }

  /**
   * Clean up finished sessions
   */
  private cleanupFinishedSessions(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.status === 'finished' && session.endTime) {
        const age = now - session.endTime.getTime();
        if (age > maxAge) {
          this.activeSessions.delete(sessionId);
          this.cache.del(`quiz:session:${sessionId}`);
        }
      }
    }
  }

  /**
   * Add custom question to database
   */
  public async addCustomQuestion(
    question: Omit<QuizQuestion, 'id' | 'lastUpdated'>,
  ): Promise<string> {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.database.query(
      `INSERT INTO quiz_questions 
       (id, question, options, correct_answer, difficulty, category, subcategory, points, time_limit, explanation, image_url, video_url, tags, source, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        question.question,
        JSON.stringify(question.options),
        question.correctAnswer,
        question.difficulty,
        question.category,
        question.subcategory,
        question.points,
        question.timeLimit,
        question.explanation,
        question.imageUrl,
        question.videoUrl,
        JSON.stringify(question.tags),
        question.source,
      ],
    );

    // Add to memory pool
    if (!this.questionPool.has(question.category)) {
      this.questionPool.set(question.category, []);
    }

    this.questionPool.get(question.category)!.push({
      ...question,
      id,
      lastUpdated: new Date(),
    });

    return id;
  }

  /**
   * Get leaderboard for a category
   */
  public async getCategoryLeaderboard(category: string, limit: number = 10): Promise<any[]> {
    return await this.database.query(
      `SELECT 
         u.user_id,
         u.username,
         SUM(qs.score) as total_score,
         COUNT(qs.session_id) as quiz_count,
         AVG(qs.score) as average_score,
         MAX(qs.max_streak) as best_streak
       FROM quiz_stats qs
       JOIN users u ON qs.user_id = u.user_id
       JOIN quiz_sessions qsess ON qs.session_id = qsess.id
       WHERE qsess.category = ?
       GROUP BY u.user_id, u.username
       ORDER BY total_score DESC
       LIMIT ?`,
      [category, limit],
    );
  }
}
