import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { getCacheManager } from '../utils/cache-manager';
import { DatabaseService } from '../database/database.service';
import { ExtendedClient } from '../types/client';
import { XPService } from './xp.service.js';
import { LoggingService } from './logging.service';
import { User, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import { BaseService } from './base.service';
import { ServiceValidator, CommonValidationRules } from '../utils/service-validator.util';
import { ErrorHandler } from '../utils/error-handler.util';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'pubg' | 'social' | 'gaming' | 'participation' | 'special' | 'achievement' | 'streak' | 'community' | 'collaboration' | 'seasonal';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  requirements: BadgeRequirement[];
  rewards?: {
    xp?: number;
    coins?: number;
    role?: string;
  };
  isSecret: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface BadgeRequirement {
  type:
    | 'kills'
    | 'wins'
    | 'games'
    | 'rank'
    | 'streak'
    | 'damage'
    | 'headshots'
    | 'messages'
    | 'voice_time'
    | 'reactions'
    | 'invites'
    | 'quiz_score'
    | 'mini_game_wins'
    | 'clips_uploaded'
    | 'clips_votes'
    | 'check_ins'
    | 'consecutive_days'
    | 'level'
    | 'coins_earned'
    | 'badges_earned'
    | 'daily_streak'
    | 'weekly_streak'
    | 'monthly_streak'
    | 'event_participation'
    | 'team_wins'
    | 'assists'
    | 'revives'
    | 'shared_clips'
    | 'community_votes'
    | 'tournament_participation'
    | 'seasonal_activity'
    | 'distance'
    | 'survival_time'
    | 'vehicle_kills'
    | 'top_10_finishes';
  operator: 'gte' | 'lte' | 'eq' | 'between';
  value: number | [number, number];
  timeframe?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  additional?: any; // For complex requirements
}

export interface UserBadge {
  userId: string;
  badgeId: string;
  earnedAt: Date;
  progress?: Map<string, number>;
  notified: boolean;
}

export interface BadgeProgress {
  userId: string;
  badgeId: string;
  requirements: Map<string, number>; // requirement type -> current value
  completed: boolean;
  completedAt?: Date;
}

/**
 * Service for managing user badges and achievements
 */
export class BadgeService extends BaseService {
  private xpService: XPService;
  private loggingService: LoggingService;
  private cacheManager: any; // Will be initialized in initialize() method

  private badges: Map<string, BadgeDefinition> = new Map();
  private userBadges: Map<string, Set<string>> = new Map(); // userId -> badgeIds
  private badgeProgress: Map<string, Map<string, BadgeProgress>> = new Map(); // userId -> badgeId -> progress

  // Configuration
  private readonly FOUNDER_USER_ID = process.env.FOUNDER_USER_ID || 'YOUR_DISCORD_ID_HERE';

  private readonly rarityColors: Record<string, string> = {
    common: '#95A5A6',
    uncommon: '#2ECC71',
    rare: '#3498DB',
    epic: '#9B59B6',
    legendary: '#F39C12',
    mythic: '#E74C3C',
  };

  private readonly rarityEmojis: Record<string, string> = {
    common: '⚪',
    uncommon: '🟢',
    rare: '🔵',
    epic: '🟣',
    legendary: '🟡',
    mythic: '🔴',
  };

  // Mensagens padronizadas do sistema
  private readonly MESSAGES = {
    BADGE_EARNED: {
      TITLE: '🏆 Nova Badge Conquistada!',
      DESCRIPTION: (badgeName: string) => `Parabéns! Você conquistou a badge **${badgeName}**!`,
      REWARDS: {
        XP: (amount: number) => `+${amount} XP`,
        COINS: (amount: number) => `+${amount} moedas`,
        ROLE: (roleName: string) => `Cargo desbloqueado: ${roleName}`,
      },
    },
    BADGE_REMOVED: {
      TITLE: '🗑️ Badge Removida',
      DESCRIPTION: (badgeName: string) => `A badge **${badgeName}** foi removida da sua coleção.`,
    },
    ERRORS: {
      BADGE_NOT_FOUND: (badgeId: string) => `Badge ${badgeId} não encontrada`,
      USER_ALREADY_HAS_BADGE: (userId: string, badgeId: string) => `Usuário ${userId} já possui a badge ${badgeId}`,
      USER_DOESNT_HAVE_BADGE: (userId: string, badgeId: string) => `Usuário ${userId} não possui a badge ${badgeId}`,
      DATABASE_ERROR: (operation: string, error: string) => `Erro no banco de dados durante ${operation}: ${error}`,
      CACHE_ERROR: (operation: string, error: string) => `Erro no cache durante ${operation}: ${error}`,
    },
    SUCCESS: {
      BADGE_AWARDED: (badgeName: string, userId: string) => `🏆 Badge '${badgeName}' concedida ao usuário ${userId}`,
      BADGE_REMOVED: (badgeId: string, userId: string) => `🗑️ Badge ${badgeId} removida do usuário ${userId}`,
      CACHE_CLEARED: (userId?: string) => `🧹 Cache de badges limpo${userId ? ` para usuário ${userId}` : ' globalmente'}`,
      WEEKLY_BADGES_PROCESSED: (awarded: number, removed: number) => `📅 Badges semanais processadas: ${awarded} concedidas, ${removed} removidas`,
    },
    INFO: {
      PROGRESS_UPDATED: (userId: string, requirementType: string, value: number) => `📊 Progresso atualizado para ${userId}: ${requirementType} = ${value}`,
      VALIDATION_STARTED: 'Iniciando validação automática de badges...',
      WEEKLY_PROCESSOR_STARTED: 'Processador de badges semanais iniciado',
    },
  };

  constructor(client: ExtendedClient, xpService: XPService, loggingService: LoggingService) {
    super(client, ['database', 'cache']);
    
    ServiceValidator.validateRequiredServices(client, ['database', 'cache'], 'BadgeService');
    
    this.xpService = xpService;
    this.loggingService = loggingService;
  }

  async initialize(): Promise<void> {
    await this.initializeService();
  }

  protected async initializeService(): Promise<void> {
    // Initialize cache manager
    this.cacheManager = getCacheManager();
    
    await this.initializeBadges();
    await this.loadUserBadges();
    await this.createWeeklyBadges();
    this.startProgressTracker();
    this.startAutomaticValidation();
    this.startWeeklyBadgeProcessor();
  }

  /**
   * Initialize default badges
   */
  private async initializeBadges(): Promise<void> {
    try {
      // Create default badges if they don't exist
      const defaultBadges: Omit<BadgeDefinition, 'createdAt'>[] = [
        // PUBG Badges
        {
          id: 'pubg_first_win',
          name: 'Primeira Vitória',
          description: 'Conquiste sua primeira vitória no PUBG',
          icon: '🏆',
          category: 'pubg',
          rarity: 'common',
          requirements: [
            {
              type: 'wins',
              operator: 'gte',
              value: 1,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 100,
            coins: 50,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_10_wins',
          name: 'Veterano',
          description: 'Conquiste 10 vitórias no PUBG',
          icon: '🎖️',
          category: 'pubg',
          rarity: 'uncommon',
          requirements: [
            {
              type: 'wins',
              operator: 'gte',
              value: 10,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 250,
            coins: 100,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_50_wins',
          name: 'Campeão',
          description: 'Conquiste 50 vitórias no PUBG',
          icon: '👑',
          category: 'pubg',
          rarity: 'rare',
          requirements: [
            {
              type: 'wins',
              operator: 'gte',
              value: 50,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 500,
            coins: 250,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_100_wins',
          name: 'Lenda',
          description: 'Conquiste 100 vitórias no PUBG',
          icon: '🌟',
          category: 'pubg',
          rarity: 'epic',
          requirements: [
            {
              type: 'wins',
              operator: 'gte',
              value: 100,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 1000,
            coins: 500,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_sharpshooter',
          name: 'Atirador de Elite',
          description: 'Faça 1000 headshots no PUBG',
          icon: '🎯',
          category: 'pubg',
          rarity: 'rare',
          requirements: [
            {
              type: 'headshots',
              operator: 'gte',
              value: 1000,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 750,
            coins: 300,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_damage_dealer',
          name: 'Destruidor',
          description: 'Cause 100.000 de dano no PUBG',
          icon: '💥',
          category: 'pubg',
          rarity: 'uncommon',
          requirements: [
            {
              type: 'damage',
              operator: 'gte',
              value: 100000,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 400,
            coins: 150,
          },
          isSecret: false,
          isActive: true,
        },
        // Social Badges
        {
          id: 'social_active',
          name: 'Membro Ativo',
          description: 'Envie 1000 mensagens no servidor',
          icon: '💬',
          category: 'social',
          rarity: 'common',
          requirements: [
            {
              type: 'messages',
              operator: 'gte',
              value: 1000,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 200,
            coins: 75,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'social_voice_time',
          name: 'Conversador',
          description: 'Passe 100 horas em canais de voz',
          icon: '🎤',
          category: 'social',
          rarity: 'uncommon',
          requirements: [
            {
              type: 'voice_time',
              operator: 'gte',
              value: 360000, // 100 hours in minutes
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 300,
            coins: 125,
          },
          isSecret: false,
          isActive: true,
        },
        // Level Badges
        {
          id: 'level_10',
          name: 'Novato Experiente',
          description: 'Alcance o nível 10',
          icon: '🔰',
          category: 'achievement',
          rarity: 'common',
          requirements: [
            {
              type: 'level',
              operator: 'gte',
              value: 10,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 150,
            coins: 50,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'level_25',
          name: 'Membro Dedicado',
          description: 'Alcance o nível 25',
          icon: '⭐',
          category: 'achievement',
          rarity: 'uncommon',
          requirements: [
            {
              type: 'level',
              operator: 'gte',
              value: 25,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 300,
            coins: 100,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'level_50',
          name: 'Veterano do Servidor',
          description: 'Alcance o nível 50',
          icon: '🌟',
          category: 'achievement',
          rarity: 'rare',
          requirements: [
            {
              type: 'level',
              operator: 'gte',
              value: 50,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 500,
            coins: 200,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'level_100',
          name: 'Lenda do Servidor',
          description: 'Alcance o nível 100',
          icon: '👑',
          category: 'achievement',
          rarity: 'legendary',
          requirements: [
            {
              type: 'level',
              operator: 'gte',
              value: 100,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 1000,
            coins: 500,
          },
          isSecret: false,
          isActive: true,
        },
        // Special Badges
        {
          id: 'founder',
          name: 'Fundador',
          description: 'Badge especial para o fundador do servidor',
          icon: '👨‍💼',
          category: 'special',
          rarity: 'mythic',
          requirements: [],
          rewards: {
            xp: 0,
            coins: 0,
          },
          isSecret: false,
          isActive: true,
        },
        // Streak Badges
        {
          id: 'daily_streak_7',
          name: 'Dedicado',
          description: 'Mantenha uma sequência de 7 dias consecutivos de atividade',
          icon: '🔥',
          category: 'streak',
          rarity: 'common',
          requirements: [
            {
              type: 'daily_streak',
              operator: 'gte',
              value: 7,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 200,
            coins: 100,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'daily_streak_30',
          name: 'Persistente',
          description: 'Mantenha uma sequência de 30 dias consecutivos de atividade',
          icon: '🔥',
          category: 'streak',
          rarity: 'rare',
          requirements: [
            {
              type: 'daily_streak',
              operator: 'gte',
              value: 30,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 750,
            coins: 300,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'daily_streak_100',
          name: 'Incansável',
          description: 'Mantenha uma sequência de 100 dias consecutivos de atividade',
          icon: '🔥',
          category: 'streak',
          rarity: 'legendary',
          requirements: [
            {
              type: 'daily_streak',
              operator: 'gte',
              value: 100,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 2000,
            coins: 1000,
          },
          isSecret: false,
          isActive: true,
        },
        // Community Badges
        {
          id: 'community_helper',
          name: 'Ajudante da Comunidade',
          description: 'Participe de 10 eventos da comunidade',
          icon: '🤝',
          category: 'community',
          rarity: 'uncommon',
          requirements: [
            {
              type: 'event_participation',
              operator: 'gte',
              value: 10,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 400,
            coins: 150,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'tournament_champion',
          name: 'Campeão de Torneio',
          description: 'Vença um torneio oficial da comunidade',
          icon: '🏆',
          category: 'community',
          rarity: 'epic',
          requirements: [
            {
              type: 'tournament_participation',
              operator: 'gte',
              value: 1,
              timeframe: 'all_time',
              additional: { mustWin: true },
            },
          ],
          rewards: {
            xp: 1500,
            coins: 750,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'content_creator',
          name: 'Criador de Conteúdo',
          description: 'Compartilhe 50 clips e receba 100 votos positivos',
          icon: '🎬',
          category: 'community',
          rarity: 'rare',
          requirements: [
            {
              type: 'shared_clips',
              operator: 'gte',
              value: 50,
              timeframe: 'all_time',
            },
            {
              type: 'community_votes',
              operator: 'gte',
              value: 100,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 800,
            coins: 400,
          },
          isSecret: false,
          isActive: true,
        },
        // Collaboration Badges
        {
          id: 'team_player',
          name: 'Jogador de Equipe',
          description: 'Conquiste 25 vitórias em equipe no PUBG',
          icon: '👥',
          category: 'collaboration',
          rarity: 'uncommon',
          requirements: [
            {
              type: 'team_wins',
              operator: 'gte',
              value: 25,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 500,
            coins: 200,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'lifesaver',
          name: 'Salvador',
          description: 'Reviva 100 companheiros de equipe',
          icon: '⛑️',
          category: 'collaboration',
          rarity: 'rare',
          requirements: [
            {
              type: 'revives',
              operator: 'gte',
              value: 100,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 600,
            coins: 250,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'support_master',
          name: 'Mestre do Suporte',
          description: 'Faça 500 assistências em combate',
          icon: '🎯',
          category: 'collaboration',
          rarity: 'epic',
          requirements: [
            {
              type: 'assists',
              operator: 'gte',
              value: 500,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 1000,
            coins: 500,
          },
          isSecret: false,
          isActive: true,
        },
        // Seasonal Badges
        {
          id: 'winter_warrior',
          name: 'Guerreiro do Inverno',
          description: 'Participe de eventos especiais durante o inverno',
          icon: '❄️',
          category: 'seasonal',
          rarity: 'rare',
          requirements: [
            {
              type: 'seasonal_activity',
              operator: 'gte',
              value: 5,
              timeframe: 'monthly',
              additional: { season: 'winter' },
            },
          ],
          rewards: {
            xp: 500,
            coins: 200,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'summer_champion',
          name: 'Campeão do Verão',
          description: 'Domine os torneios de verão',
          icon: '☀️',
          category: 'seasonal',
          rarity: 'epic',
          requirements: [
            {
              type: 'seasonal_activity',
              operator: 'gte',
              value: 10,
              timeframe: 'monthly',
              additional: { season: 'summer' },
            },
          ],
          rewards: {
            xp: 750,
            coins: 350,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'halloween_hunter',
          name: 'Caçador do Halloween',
          description: 'Participe dos eventos especiais de Halloween',
          icon: '🎃',
          category: 'seasonal',
          rarity: 'legendary',
          requirements: [
            {
              type: 'event_participation',
              operator: 'gte',
              value: 3,
              timeframe: 'monthly',
              additional: { eventType: 'halloween' },
            },
          ],
          rewards: {
            xp: 1000,
            coins: 500,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'new_year_legend',
          name: 'Lenda do Ano Novo',
          description: 'Celebre o Ano Novo com a comunidade',
          icon: '🎆',
          category: 'seasonal',
          rarity: 'mythic',
          requirements: [
            {
              type: 'event_participation',
              operator: 'gte',
              value: 1,
              timeframe: 'all_time',
              additional: { eventType: 'new_year' },
            },
          ],
          rewards: {
            xp: 2000,
            coins: 1000,
          },
          isSecret: false,
          isActive: true,
        },

        // PUBG Official Medal System Badges
        {
          id: 'pubg_sharpshooter',
          name: 'Atirador de Elite',
          description: 'Demonstre precisão excepcional com headshots',
          icon: '🎯',
          category: 'pubg',
          rarity: 'rare',
          requirements: [
            {
              type: 'headshots',
              operator: 'gte',
              value: 100,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 500,
            coins: 250,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_survivor',
          name: 'Sobrevivente Nato',
          description: 'Sobreviva por longos períodos sem morrer',
          icon: '🛡️',
          category: 'pubg',
          rarity: 'epic',
          requirements: [
            {
              type: 'games',
              operator: 'gte',
              value: 50,
              timeframe: 'all_time',
              additional: { minSurvivalTime: 1200 }, // 20 minutos
            },
          ],
          rewards: {
            xp: 750,
            coins: 400,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_chicken_dinner',
          name: 'Chicken Dinner',
          description: 'Conquiste sua primeira vitória no PUBG',
          icon: '🍗',
          category: 'pubg',
          rarity: 'legendary',
          requirements: [
            {
              type: 'wins',
              operator: 'gte',
              value: 1,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 1000,
            coins: 500,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_chicken_master',
          name: 'Mestre do Chicken Dinner',
          description: 'Conquiste 10 vitórias no PUBG',
          icon: '👑',
          category: 'pubg',
          rarity: 'mythic',
          requirements: [
            {
              type: 'wins',
              operator: 'gte',
              value: 10,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 2000,
            coins: 1000,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_damage_dealer',
          name: 'Causador de Dano',
          description: 'Cause uma quantidade massiva de dano',
          icon: '💥',
          category: 'pubg',
          rarity: 'rare',
          requirements: [
            {
              type: 'damage',
              operator: 'gte',
              value: 50000,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 600,
            coins: 300,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_kill_streak',
          name: 'Sequência Mortal',
          description: 'Elimine 5 inimigos em uma única partida',
          icon: '🔥',
          category: 'pubg',
          rarity: 'epic',
          requirements: [
            {
              type: 'kills',
              operator: 'gte',
              value: 5,
              timeframe: 'daily',
              additional: { singleMatch: true },
            },
          ],
          rewards: {
            xp: 800,
            coins: 450,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_distance_traveler',
          name: 'Viajante de Longa Distância',
          description: 'Percorra grandes distâncias no mapa',
          icon: '🏃',
          category: 'pubg',
          rarity: 'uncommon',
          requirements: [
            {
              type: 'distance',
              operator: 'gte',
              value: 100000, // 100km
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 400,
            coins: 200,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_top_10_consistent',
          name: 'Top 10 Consistente',
          description: 'Alcance o Top 10 em múltiplas partidas consecutivas',
          icon: '🏆',
          category: 'pubg',
          rarity: 'epic',
          requirements: [
            {
              type: 'streak',
              operator: 'gte',
              value: 5,
              timeframe: 'weekly',
              additional: { type: 'top_10' },
            },
          ],
          rewards: {
            xp: 750,
            coins: 375,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_vehicle_master',
          name: 'Mestre dos Veículos',
          description: 'Elimine inimigos usando veículos',
          icon: '🚗',
          category: 'pubg',
          rarity: 'rare',
          requirements: [
            {
              type: 'kills',
              operator: 'gte',
              value: 10,
              timeframe: 'all_time',
              additional: { weaponType: 'vehicle' },
            },
          ],
          rewards: {
            xp: 600,
            coins: 300,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_medic',
          name: 'Médico de Campo',
          description: 'Reviva companheiros de equipe múltiplas vezes',
          icon: '🏥',
          category: 'pubg',
          rarity: 'uncommon',
          requirements: [
            {
              type: 'revives',
              operator: 'gte',
              value: 25,
              timeframe: 'all_time',
            },
          ],
          rewards: {
            xp: 450,
            coins: 225,
          },
          isSecret: false,
          isActive: true,
        },
      ];

      // Add weapon mastery badges
      const weaponMasteryBadges = await this.createWeaponMasteryBadges();
      defaultBadges.push(...weaponMasteryBadges);

      // Add survival mastery badges
      const survivalMasteryBadges = await this.createSurvivalMasteryBadges();
      defaultBadges.push(...survivalMasteryBadges);

      // Store badges in memory
      for (const badgeData of defaultBadges) {
        const badge: BadgeDefinition = {
          ...badgeData,
          createdAt: new Date(),
        };
        this.badges.set(badge.id, badge);
      }

      this.logger.info(`✅ Initialized ${this.badges.size} badges`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize badges:', error);
      throw error;
    }
  }

  /**
   * Load user badges from database
   */
  private async loadUserBadges(): Promise<void> {
    try {
      if (!this.database?.client) {
        this.logger.warn('Database not available, skipping user badge loading');
        return;
      }

      const userBadges = await this.database.client.userBadge.findMany({
        include: {
          user: true,
        },
      });

      // Group badges by user
      for (const userBadge of userBadges) {
        const userId = userBadge.userId;
        
        if (!this.userBadges.has(userId)) {
          this.userBadges.set(userId, new Set());
        }
        
        const userBadgeSet = this.userBadges.get(userId)!;
        userBadgeSet.add(userBadge.badgeId);

        // Initialize progress tracking
        if (!this.badgeProgress.has(userId)) {
          this.badgeProgress.set(userId, new Map());
        }

        const userProgress = this.badgeProgress.get(userId)!;
        if (!userProgress.has(userBadge.badgeId)) {
          userProgress.set(userBadge.badgeId, {
            userId,
            badgeId: userBadge.badgeId,
            requirements: new Map(),
            completed: true,
            completedAt: userBadge.earnedAt,
          });
        }
      }

      this.logger.info(
        `✅ Loaded badges for ${this.userBadges.size} users (${userBadges.length} total badges)`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to load user badges:', error);
      throw error;
    }
  }

  /**
   * Start progress tracking for badges
   */
  private startProgressTracker(): void {
    // Track progress every 5 minutes
    setInterval(() => {
      this.checkAllBadgeProgress().catch(error => {
        this.logger.error('Error in badge progress tracker:', error);
      });
    }, 5 * 60 * 1000);
  }

  /**
   * Update progress for a specific requirement type
   */
  public async updateProgress(
    userId: string,
    requirementType: string,
    value: number,
    operation: 'set' | 'increment' = 'increment',
  ): Promise<void> {
    return ErrorHandler.executeWithLogging(
      async () => {
        // Validate inputs
        ServiceValidator.validateObjectProperties({ userId, requirementType }, ['userId', 'requirementType'], 'updateProgress parameters');
        ServiceValidator.validateRange(value, 0, Number.MAX_SAFE_INTEGER, 'value');
      if (!this.badgeProgress.has(userId)) {
        this.badgeProgress.set(userId, new Map());
      }

      const userProgress = this.badgeProgress.get(userId)!;
      const newlyEarnedBadges: string[] = [];

      // Update progress for all relevant badges
      for (const [badgeId, badge] of this.badges) {
        if (!badge.isActive) {continue;}

        // Skip if user already has this badge
        if (this.hasBadge(userId, badgeId)) {continue;}

        // Check if this badge has requirements for this type
        const relevantRequirements = badge.requirements.filter(
          req => req.type === requirementType,
        );

        if (relevantRequirements.length === 0) {continue;}

        // Initialize progress if not exists
        if (!userProgress.has(badgeId)) {
          userProgress.set(badgeId, {
            userId,
            badgeId,
            requirements: new Map(),
            completed: false,
          });
        }

        const badgeProgress = userProgress.get(badgeId)!;
        const currentValue = badgeProgress.requirements.get(requirementType) || 0;

        // Update the value
        const newValue = operation === 'set' ? value : currentValue + value;
        badgeProgress.requirements.set(requirementType, newValue);

        // Check if badge is now complete
        if (this.checkBadgeRequirements(badge, badgeProgress.requirements)) {
          badgeProgress.completed = true;
          badgeProgress.completedAt = new Date();
          
          // Award the badge
          const awarded = await this.awardBadge(userId, badgeId, true);
          if (awarded) {
            newlyEarnedBadges.push(badgeId);
          }
        }
      }

      if (newlyEarnedBadges.length > 0) {
        this.logger.info(
          `🏆 User ${userId} earned ${newlyEarnedBadges.length} new badges: ${newlyEarnedBadges.join(', ')}`,
        );
      }
      },
      this.logger,
      `updateProgress for user ${userId}`,
      `Guild: ${userId}, Type: ${requirementType}, Value: ${value}, Operation: ${operation}`,
    );
  }

  /**
   * Check if badge requirements are met
   */
  private checkBadgeRequirements(
    badge: BadgeDefinition,
    userProgress: Map<string, number>,
  ): boolean {
    for (const requirement of badge.requirements) {
      const currentValue = userProgress.get(requirement.type) || 0;
      
      switch (requirement.operator) {
        case 'gte':
          if (currentValue < (requirement.value as number)) {return false;}
          break;
        case 'lte':
          if (currentValue > (requirement.value as number)) {return false;}
          break;
        case 'eq':
          if (currentValue !== (requirement.value as number)) {return false;}
          break;
        case 'between':
          const [min, max] = requirement.value as [number, number];
          if (currentValue < min || currentValue > max) {return false;}
          break;
      }
    }
    return true;
  }

  /**
   * Award a badge to a user
   */
  public async awardBadge(
    userId: string,
    badgeId: string,
    notify: boolean = true,
  ): Promise<boolean> {
    return ErrorHandler.executeWithLogging(
      async () => {
        // Validate inputs
        ServiceValidator.validateObjectProperties({ userId, badgeId }, ['userId', 'badgeId'], 'awardBadge parameters');
        ServiceValidator.validateNonEmptyString(userId, 'userId');
        ServiceValidator.validateNonEmptyString(badgeId, 'badgeId');
        
        // Check if badge exists
      const badge = this.badges.get(badgeId);
      if (!badge) {
        this.logger.warn(this.MESSAGES.ERRORS.BADGE_NOT_FOUND(badgeId));
        return false;
      }

      // Check if user already has this badge
      if (await this.hasBadge(userId, badgeId)) {
        this.logger.debug(this.MESSAGES.ERRORS.USER_ALREADY_HAS_BADGE(userId, badgeId));
        return false;
      }

      // Add to user's badges
      if (!this.userBadges.has(userId)) {
        this.userBadges.set(userId, new Set());
      }
      
      const userBadgeSet = this.userBadges.get(userId)!;
      userBadgeSet.add(badgeId);

      // Save to database if available
      if (this.database?.client) {
        try {
          await this.database.client.userBadge.create({
            data: {
              userId,
              badgeId: badge.id,
              earnedAt: new Date(),
            },
          });
        } catch (dbError) {
          this.logger.error(this.MESSAGES.ERRORS.DATABASE_ERROR('save badge', dbError instanceof Error ? dbError.message : String(dbError)));
          // Continue anyway, badge is still awarded in memory
        }
      }

      // Award rewards if any
      if (badge.rewards) {
        await this.awardBadgeRewards(userId, badge.rewards);
      }

      // Send notification if requested
      if (notify) {
        await this.sendBadgeNotification(userId, badge);
      }

      // Invalidate user cache using distributed cache system
      try {
        await this.cacheManager.user.invalidate(userId);
      } catch (cacheError) {
        this.logger.warn(`Failed to invalidate cache for user ${userId}: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
        // Fallback to old cache clearing method
        await this.clearBadgeCache(userId);
      }

        this.logger.info(this.MESSAGES.SUCCESS.BADGE_AWARDED(badge.name, userId));
        return true;
      },
      this.logger,
      `awardBadge ${badgeId} to user ${userId}`,
      `User: ${userId}, Badge: ${badgeId}, Notify: ${notify}`,
    ) || false;
  }

  /**
   * Award badge rewards to user
   */
  private async awardBadgeRewards(userId: string, rewards: any): Promise<void> {
    try {
      // Award XP
      if (rewards.xp && this.xpService) {
        await this.xpService.addXP(userId, rewards.xp);
      }

      // Award coins
      if (rewards.coins && this.database?.client) {
        try {
          // Get or create user
          const user = await this.database.client.user.upsert({
            where: { id: userId },
            update: {
              coins: {
                increment: rewards.coins,
              },
            },
            create: {
              id: userId,
              username: 'Unknown',
              discriminator: '0000',
              coins: rewards.coins,
              xp: 0,
              level: 1,
              pubgUsername: '',
              pubgPlatform: 'steam',
            },
          });

          this.logger.debug(`💰 Awarded ${rewards.coins} coins to user ${userId}`);
        } catch (dbError) {
          this.logger.error(`Failed to award coins to user ${userId}:`, dbError);
        }
      }

      // Award role (if specified and client is available)
      if (rewards.role && this.client) {
        try {
          const guilds = this.client.guilds.cache;
          for (const guild of guilds.values()) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
              const role = guild.roles.cache.find(r => r.name === rewards.role);
              if (role) {
                await member.roles.add(role);
                this.logger.debug(`🎭 Awarded role '${rewards.role}' to user ${userId} in guild ${guild.name}`);
              }
            }
          }
        } catch (roleError) {
          this.logger.error(`Failed to award role to user ${userId}:`, roleError);
        }
      }
    } catch (error) {
      this.logger.error(`❌ Failed to award badge rewards to user ${userId}:`, error);
    }
  }

  /**
   * Send badge notification to user
   */
  private async sendBadgeNotification(userId: string, badge: BadgeDefinition): Promise<void> {
    try {
      if (!this.client) {return;}

      const user = await this.client.users.fetch(userId).catch(() => null);
      if (!user) {return;}

      const embed = new EmbedBuilder()
        .setTitle(this.MESSAGES.BADGE_EARNED.TITLE)
        .setDescription(
          `${this.MESSAGES.BADGE_EARNED.DESCRIPTION(badge.name)}\n\n` +
          `${badge.icon} **${badge.name}**\n` +
          `${badge.description}\n\n` +
          `**Raridade:** ${this.getRarityEmoji(badge.rarity)} ${badge.rarity.toUpperCase()}`,
        )
        .setColor(this.getRarityColor(badge.rarity) as any)
        .setTimestamp();

      // Add rewards info if any
      if (badge.rewards) {
        const rewardText: string[] = [];
        if (badge.rewards.xp) {rewardText.push(this.MESSAGES.BADGE_EARNED.REWARDS.XP(badge.rewards.xp));}
        if (badge.rewards.coins) {rewardText.push(this.MESSAGES.BADGE_EARNED.REWARDS.COINS(badge.rewards.coins));}   
        if (badge.rewards.role) {rewardText.push(this.MESSAGES.BADGE_EARNED.REWARDS.ROLE(badge.rewards.role));}
        
        if (rewardText.length > 0) {
          embed.addFields({
            name: '🎁 Recompensas',
            value: rewardText.join('\n'),
            inline: false,
          });
        }
      }

      await this.sendNotificationToUser(user, embed, 'badge_earned');
    } catch (error) {
      this.logger.error(`❌ Failed to send badge notification to user ${userId}:`, error);
    }
  }

  /**
   * Send badge removal notification
   */
  private async sendBadgeRemovalNotification(userId: string, badge: BadgeDefinition): Promise<void> {
    try {
      if (!this.client) {return;}

      const user = await this.client.users.fetch(userId).catch(() => null);
      if (!user) {return;}

      const embed = new EmbedBuilder()
        .setTitle(this.MESSAGES.BADGE_REMOVED.TITLE)
        .setDescription(
          `${this.MESSAGES.BADGE_REMOVED.DESCRIPTION(badge.name)}\n\n` +
          `${badge.icon} **${badge.name}**\n` +
          `${badge.description}\n\n` +
          '**Motivo:** Requisitos não atendidos\n' +
          `**Raridade:** ${this.getRarityEmoji(badge.rarity)} ${badge.rarity.toUpperCase()}`,
        )
        .setColor('#E74C3C') // Red color for removal
        .setTimestamp();

      await this.sendNotificationToUser(user, embed, 'badge_removed');
    } catch (error) {
      this.logger.error(`❌ Failed to send badge removal notification to user ${userId}:`, error);
    }
  }

  /**
   * Generic method to send notifications to users
   */
  private async sendNotificationToUser(user: User, embed: EmbedBuilder, type: 'badge_earned' | 'badge_removed'): Promise<void> {
    try {
      // Try to send DM first
      await user.send({ embeds: [embed] });
    } catch (dmError) {
      // If DM fails, try to find a suitable channel in guilds
      const guilds = this.client.guilds.cache;
      for (const guild of guilds.values()) {
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (member) {
          // Look for badge/achievement channel
          const badgeChannel = guild.channels.cache.find(
            (channel): channel is TextChannel =>
              channel.type === 0 && // Text channel
              (channel.name.includes('badge') ||
                channel.name.includes('achievement') ||
                channel.name.includes('conquista') ||
                channel.name.includes('notifica')),
          );

          if (badgeChannel) {
            const content = type === 'badge_earned' ? `${member} 🎉` : `${member}`;
            await badgeChannel.send({
              content,
              embeds: [embed],
            });
            break;
          }
        }
      }
    }
  }

  /**
   * Get user's badges
   */
  public async getUserBadges(userId: string): Promise<BadgeDefinition[]> {
    try {
      // Use distributed cache with intelligent TTL
      return await this.cacheManager.user.get(userId, 'badges', async () => {
        const userBadgeIds = this.userBadges.get(userId);
        if (!userBadgeIds) {
          return [];
        }

        const badges: BadgeDefinition[] = [];
        for (const badgeId of userBadgeIds) {
          const badge = this.badges.get(badgeId);
          if (badge) {
            badges.push(badge);
          }
        }

        return badges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
    } catch (error) {
      this.logger.warn('Erro ao buscar badges do usuário', { metadata: { userId, error } });
      
      // Fallback to direct memory access
      const userBadgeIds = this.userBadges.get(userId);
      if (!userBadgeIds) {
        return [];
      }

      const badges: BadgeDefinition[] = [];
      for (const badgeId of userBadgeIds) {
        const badge = this.badges.get(badgeId);
        if (badge) {
          badges.push(badge);
        }
      }

      return badges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
  }

  /**
   * Get all available badges
   */
  public getAvailableBadges(includeSecret: boolean = false): BadgeDefinition[] {
    const badges = Array.from(this.badges.values());
    
    if (includeSecret) {
      return badges.filter(badge => badge.isActive);
    }
    
    return badges.filter(badge => badge.isActive && !badge.isSecret);
  }

  /**
   * Get badge by ID
   */
  public getBadge(badgeId: string): BadgeDefinition | null {
    return this.badges.get(badgeId) || null;
  }

  /**
   * Check if user has a specific badge
   */
  public async hasBadge(userId: string, badgeId: string): Promise<boolean> {
    const cacheKey = `has_badge:${userId}:${badgeId}`;
    
    // Tentar buscar do cache primeiro
    if (this.cache) {
      try {
        const cached = await this.cache.get(cacheKey);
        if (cached !== null) {
          return cached === 'true';
        }
      } catch (error) {
        this.logger.warn('Erro ao buscar badge do cache', { metadata: { userId, error, badgeId } });
      }
    }

    const userBadges = this.userBadges.get(userId);
    const hasBadgeResult = userBadges ? userBadges.has(badgeId) : false;
    
    // Salvar no cache por 10 minutos
    if (this.cache) {
      try {
        await this.cache.set(cacheKey, hasBadgeResult.toString(), 600);
      } catch (error) {
        this.logger.warn('Erro ao salvar badge no cache', { metadata: { userId, error, badgeId } });
      }
    }

    return hasBadgeResult;
  }

  /**
   * Get user's progress for a specific badge
   */
  public getUserProgress(userId: string, badgeId: string): BadgeProgress | null {
    const userProgress = this.badgeProgress.get(userId);
    return userProgress ? userProgress.get(badgeId) || null : null;
  }

  /**
   * Get badge statistics
   */
  public async getBadgeStats(): Promise<{
    totalBadges: number;
    totalAwarded: number;
    rarityDistribution: Record<string, number>;
    categoryDistribution: Record<string, number>;
  }> {
    const rarityDistribution: Record<string, number> = {};
    const categoryDistribution: Record<string, number> = {};
    let totalAwarded = 0;

    // Count badges by rarity and category
    for (const badge of this.badges.values()) {
      rarityDistribution[badge.rarity] = (rarityDistribution[badge.rarity] || 0) + 1;
      categoryDistribution[badge.category] = (categoryDistribution[badge.category] || 0) + 1;
    }

    // Count total awarded badges
    for (const userBadges of this.userBadges.values()) {
      totalAwarded += userBadges.size;
    }

    return {
      totalBadges: this.badges.size,
      totalAwarded,
      rarityDistribution,
      categoryDistribution,
    };
  }

  /**
   * Check all badge progress for all users
   */
  public async checkAllBadgeProgress(): Promise<void> {
    try {
      if (!this.database?.client) {return;}

      // Get all users with their stats
      const users = await this.database.client.user.findMany({
        select: {
          id: true,
          level: true,
          xp: true,
          coins: true,
          messagesCount: true,
        },
      });

      for (const user of users) {
        const userStats: Record<string, number> = {
          level: user.level,
          xp: user.xp,
          coins: user.coins,
        };

        // PUBG stats would be added here if available from external API
        // For now, we'll use the basic user stats from the database

        await this.checkUserBadgeProgress(user.id, userStats);
        
        // Validate existing badges
        await this.validateUserBadges(user.id, userStats);
      }
    } catch (error) {
      this.logger.error('❌ Failed to check all badge progress:', error);
    }
  }

  /**
   * Validate if user still meets requirements for their current badges
   */
  public async validateUserBadges(userId: string, userStats: Record<string, number>): Promise<void> {
    try {
      const userBadgeSet = this.userBadges.get(userId);
      if (!userBadgeSet) {return;}

      const badgesToRemove: string[] = [];

      for (const badgeId of userBadgeSet) {
        const badge = this.getBadge(badgeId);
        if (!badge || !badge.isActive) {
          badgesToRemove.push(badgeId);
          continue;
        }

        // Skip validation for certain badge types that shouldn't be removed
        if (badge.category === 'special' || badge.id === 'founder' || badge.id.includes('achievement')) {
          continue;
        }

        // Check if user still meets requirements
        const userProgress = new Map<string, number>();
        for (const [key, value] of Object.entries(userStats)) {
          userProgress.set(key, value);
        }

        const stillMeetsRequirements = this.checkBadgeRequirements(badge, userProgress);
        if (!stillMeetsRequirements) {
          badgesToRemove.push(badgeId);
        }
      }

      // Remove badges that no longer meet requirements
      for (const badgeId of badgesToRemove) {
        await this.removeBadge(userId, badgeId, true);
        this.logger.info(`🔄 Auto-removed badge ${badgeId} from user ${userId} - requirements no longer met`);
      }
    } catch (error) {
      this.logger.error(`❌ Error validating badges for user ${userId}:`, error);
    }
  }

  /**
   * Start automatic badge validation process
   */
  public startAutomaticValidation(): void {
    // Run validation every 30 minutes
    setInterval(async () => {
      this.logger.info('🔄 Starting automatic badge validation...');
      await this.checkAllBadgeProgress();
      this.logger.info('✅ Automatic badge validation completed');
    }, 30 * 60 * 1000); // 30 minutes

    // Also run validation every hour for more thorough check
    setInterval(async () => {
      this.logger.info('🔍 Starting thorough badge validation...');
      await this.runThoroughValidation();
      this.logger.info('✅ Thorough badge validation completed');
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Run thorough validation including database sync
   */
  private async runThoroughValidation(): Promise<void> {
    try {
      // Validate badge integrity
      const integrity = await this.validateBadgeIntegrity();
      if (!integrity.isValid) {
        this.logger.warn('⚠️ Badge integrity issues found:', { metadata: { issues: integrity.issues } });
      }

      // Clean up orphaned badges
      const cleanup = await this.cleanupOrphanedBadges();
      if (cleanup.cleaned > 0) {
        this.logger.info(`🧹 Cleaned up ${cleanup.cleaned} orphaned badges`);
      }

      // Run full badge progress check
      await this.checkAllBadgeProgress();
    } catch (error) {
      this.logger.error('❌ Error in thorough validation:', error);
    }
  }

  /**
   * Integration methods for other services
   */

  /**
   * Update badge progress when user gains XP
   */
  public async onXPGained(userId: string, xpGained: number, newLevel: number, oldLevel: number): Promise<void> {
    try {
      // Update XP-related progress
      await this.updateProgress(userId, 'level', newLevel, 'set');
      
      // Check for level-based badges
      if (newLevel > oldLevel) {
        this.logger.info(`🎯 User ${userId} leveled up from ${oldLevel} to ${newLevel}`);
        
        // Award level milestone badges
        const levelMilestones = [5, 10, 15, 25, 30, 50, 75, 100];
        for (const milestone of levelMilestones) {
          if (newLevel >= milestone && oldLevel < milestone) {
            const badgeId = `level_${milestone}`;
            if (this.getBadge(badgeId)) {
              await this.awardBadge(userId, badgeId, true);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`❌ Error handling XP gain for user ${userId}:`, error);
    }
  }

  /**
   * Update badge progress when user ranking changes
   */
  public async onRankingUpdated(userId: string, rankingData: any): Promise<void> {
    try {
      // Update ranking-related progress
      if (rankingData.rank) {
        await this.updateProgress(userId, 'rank', rankingData.rank, 'set');
      }
      
      // Check for ranking-based badges
      if (rankingData.rank <= 10) {
        await this.awardBadge(userId, 'top_10_player', true);
      }
      if (rankingData.rank === 1) {
        await this.awardBadge(userId, 'rank_1_champion', true);
      }
      
      // Update badge count in ranking data
      const userBadges = await this.getUserBadges(userId);
      rankingData.badgeCount = userBadges.length;
    } catch (error) {
      this.logger.error(`❌ Error handling ranking update for user ${userId}:`, error);
    }
  }

  /**
   * Update badge progress when user activity occurs
   */
  public async onUserActivity(userId: string, activityType: string, value: number = 1): Promise<void> {
    try {
      const activityMappings: Record<string, string> = {
        'message_sent': 'messages',
        'voice_joined': 'voice_time',
        'reaction_added': 'reactions',
        'invite_created': 'invites',
        'quiz_completed': 'quiz_score',
        'minigame_won': 'mini_game_wins',
        'clip_uploaded': 'clips_uploaded',
        'clip_voted': 'clips_votes',
        'check_in': 'check_ins',
        'consecutive_day': 'consecutive_days',
        // New activity types for enhanced badges
        'daily_streak': 'daily_streak',
        'weekly_streak': 'weekly_streak',
        'monthly_streak': 'monthly_streak',
        'event_participation': 'event_participation',
        'team_win': 'team_wins',
        'assist': 'assists',
        'revive': 'revives',
        'shared_clip': 'shared_clips',
        'community_vote': 'community_votes',
        'tournament_participation': 'tournament_participation',
        'seasonal_activity': 'seasonal_activity',
        // PUBG specific activity types
        'distance_traveled': 'distance',
        'survival_time': 'survival_time',
        'vehicle_kill': 'vehicle_kills',
        'top_10_finish': 'top_10_finishes',
      };
      
      const mappedType = activityMappings[activityType];
      if (mappedType) {
        await this.updateProgress(userId, mappedType, value, 'increment');
      }
    } catch (error) {
      this.logger.error(`❌ Error handling user activity for user ${userId}:`, error);
    }
  }

  /**
   * Update badge progress when PUBG stats change
   */
  public async onPUBGStatsUpdated(userId: string, pubgStats: any): Promise<void> {
    try {
      const statMappings = {
        kills: pubgStats.kills || 0,
        wins: pubgStats.wins || 0,
        games: pubgStats.games || 0,
        damage: pubgStats.damage || 0,
        headshots: pubgStats.headshots || 0,
      };
      
      // Update all PUBG-related progress
      for (const [statType, value] of Object.entries(statMappings)) {
        if (value > 0) {
          await this.updateProgress(userId, statType, value, 'set');
        }
      }
      
      // Check for PUBG achievement badges
      await this.checkPUBGBadges(userId, pubgStats);
    } catch (error) {
      this.logger.error(`❌ Error handling PUBG stats update for user ${userId}:`, error);
    }
  }

  /**
   * Update daily streak progress
   */
  public async onDailyStreak(userId: string, streakCount: number): Promise<void> {
    try {
      await this.updateProgress(userId, 'daily_streak', streakCount, 'set');
      this.logger.info(`📅 Daily streak updated for user ${userId}: ${streakCount} days`);
    } catch (error) {
      this.logger.error(`❌ Error updating daily streak for user ${userId}:`, error);
    }
  }

  /**
   * Handle event participation
   */
  public async onEventParticipation(userId: string, eventType: string = 'general'): Promise<void> {
    try {
      await this.updateProgress(userId, 'event_participation', 1, 'increment');
      
      // Handle seasonal events
      if (eventType.includes('seasonal') || eventType.includes('holiday')) {
        await this.updateProgress(userId, 'seasonal_activity', 1, 'increment');
      }
      
      // Handle tournament events
      if (eventType.includes('tournament') || eventType.includes('competition')) {
        await this.updateProgress(userId, 'tournament_participation', 1, 'increment');
      }
      
      this.logger.info(`🎉 Event participation recorded for user ${userId}: ${eventType}`);
    } catch (error) {
      this.logger.error(`❌ Error recording event participation for user ${userId}:`, error);
    }
  }

  /**
   * Handle team-based activities
   */
  public async onTeamActivity(userId: string, activityType: 'win' | 'assist' | 'revive', value: number = 1): Promise<void> {
    try {
      switch (activityType) {
        case 'win':
          await this.updateProgress(userId, 'team_wins', value, 'increment');
          break;
        case 'assist':
          await this.updateProgress(userId, 'assists', value, 'increment');
          break;
        case 'revive':
          await this.updateProgress(userId, 'revives', value, 'increment');
          break;
      }
      
      this.logger.info(`🤝 Team activity recorded for user ${userId}: ${activityType} +${value}`);
    } catch (error) {
      this.logger.error(`❌ Error recording team activity for user ${userId}:`, error);
    }
  }

  /**
   * Handle community interactions
   */
  public async onCommunityInteraction(userId: string, interactionType: 'shared_clip' | 'community_vote', value: number = 1): Promise<void> {
    try {
      await this.updateProgress(userId, interactionType, value, 'increment');
      this.logger.info(`👥 Community interaction recorded for user ${userId}: ${interactionType} +${value}`);
    } catch (error) {
      this.logger.error(`❌ Error recording community interaction for user ${userId}:`, error);
    }
  }

  /**
   * Handle PUBG distance traveled for badges
   */
  public async onDistanceTraveled(userId: string, distance: number): Promise<void> {
    try {
      await this.updateProgress(userId, 'distance', distance, 'increment');
      this.logger.info(`🏃 Distance traveled recorded for user ${userId}: ${distance}km`);
    } catch (error) {
      this.logger.error(`❌ Error handling distance traveled for user ${userId}:`, error);
    }
  }

  /**
   * Handle PUBG survival time for badges
   */
  public async onSurvivalTime(userId: string, survivalTime: number): Promise<void> {
    try {
      await this.updateProgress(userId, 'survival_time', survivalTime, 'increment');
      this.logger.info(`⏱️ Survival time recorded for user ${userId}: ${survivalTime} minutes`);
    } catch (error) {
      this.logger.error(`❌ Error handling survival time for user ${userId}:`, error);
    }
  }

  /**
   * Handle PUBG vehicle kills for badges
   */
  public async onVehicleKill(userId: string, kills: number = 1): Promise<void> {
    try {
      await this.updateProgress(userId, 'vehicle_kills', kills, 'increment');
      this.logger.info(`🚗 Vehicle kills recorded for user ${userId}: +${kills}`);
    } catch (error) {
      this.logger.error(`❌ Error handling vehicle kills for user ${userId}:`, error);
    }
  }

  /**
   * Handle PUBG top 10 finishes for badges
   */
  public async onTop10Finish(userId: string): Promise<void> {
    try {
      await this.updateProgress(userId, 'top_10_finishes', 1, 'increment');
      this.logger.info(`🏆 Top 10 finish recorded for user ${userId}`);
    } catch (error) {
      this.logger.error(`❌ Error handling top 10 finish for user ${userId}:`, error);
    }
  }

  /**
   * Handle general PUBG activities for testing
   */
  public async onPubgActivity(userId: string, activityType: string, amount: number = 1): Promise<void> {
    try {
      switch (activityType) {
        case 'distance':
          await this.onDistanceTraveled(userId, amount);
          break;
        case 'survival':
          await this.onSurvivalTime(userId, amount);
          break;
        case 'vehicle_kill':
          await this.onVehicleKill(userId, amount);
          break;
        case 'top_10':
          await this.onTop10Finish(userId);
          break;
        default:
          this.logger.warn(`Unknown PUBG activity type: ${activityType}`);
      }
    } catch (error) {
      this.logger.error(`❌ Error handling PUBG activity ${activityType} for user ${userId}:`, error);
    }
  }

  /**
   * Create dynamic weekly badges
   */
  public async createWeeklyBadges(): Promise<void> {
    try {
      const weeklyBadges: Omit<BadgeDefinition, 'createdAt'>[] = [
        {
          id: 'top_1_weekly',
          name: 'Top 1 da Semana',
          description: 'Seja o jogador #1 do ranking semanal',
          icon: '👑',
          category: 'special',
          rarity: 'legendary',
          requirements: [
            {
              type: 'rank',
              operator: 'eq',
              value: 1,
              timeframe: 'weekly',
            },
          ],
          rewards: {
            xp: 500,
            coins: 1000,
            role: 'weekly_champion',
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'mvp_pubg_weekly',
          name: 'MVP PUBG Semanal',
          description: 'Seja o jogador com mais vitórias PUBG na semana',
          icon: '🏆',
          category: 'pubg',
          rarity: 'epic',
          requirements: [
            {
              type: 'wins',
              operator: 'gte',
              value: 10,
              timeframe: 'weekly',
            },
          ],
          rewards: {
            xp: 300,
            coins: 500,
          },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'rapid_evolution',
          name: 'Evolução Rápida',
          description: 'Suba 3 ou mais níveis em uma semana',
          icon: '📈',
          category: 'achievement',
          rarity: 'rare',
          requirements: [
            {
              type: 'level',
              operator: 'gte',
              value: 3,
              timeframe: 'weekly',
            },
          ],
          rewards: {
            xp: 200,
            coins: 300,
          },
          isSecret: false,
          isActive: true,
        },
      ];
      
      for (const badgeData of weeklyBadges) {
        await this.createCustomBadge(badgeData);
      }
      
      this.logger.info('✅ Weekly dynamic badges created successfully');
    } catch (error) {
      this.logger.error('❌ Error creating weekly badges:', error);
    }
  }

  /**
   * Process weekly badge assignments and removals
   */
  public async processWeeklyBadges(): Promise<void> {
    try {
      // Get ranking service if available
      const rankingService = this.client.services?.ranking;
      if (!rankingService) {
        this.logger.warn('⚠️ Ranking service not available for weekly badge processing');
        return;
      }
      
      // Process each guild
      for (const guild of this.client.guilds.cache.values()) {
        // Get weekly ranking
        const weeklyRanking = rankingService.getInternalRanking(
          guild.id,
          {
            type: 'weekly',
            startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            endDate: new Date(),
          },
          'level',
          50,
        );
        
        // Remove previous weekly badges
        const weeklyBadgeIds = ['top_1_weekly', 'mvp_pubg_weekly', 'rapid_evolution'];
        for (const userId of this.userBadges.keys()) {
          for (const badgeId of weeklyBadgeIds) {
            if (this.hasBadge(userId, badgeId)) {
              await this.removeBadge(userId, badgeId, true);
            }
          }
        }
        
        // Award new weekly badges
        if (weeklyRanking.length > 0) {
          const topPlayer = weeklyRanking[0];
          await this.awardBadge(topPlayer.userId, 'top_1_weekly', true);
        }
      }
      
      this.logger.info('✅ Weekly badges processed successfully');
    } catch (error) {
      this.logger.error('❌ Error processing weekly badges:', error);
    }
  }

  /**
   * Start weekly badge processor
   */
  private startWeeklyBadgeProcessor(): void {
    // Process weekly badges every Sunday at midnight
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(0, 0, 0, 0);
    
    const timeUntilNextSunday = nextSunday.getTime() - now.getTime();
    
    // Set initial timeout for next Sunday
    setTimeout(() => {
      this.processWeeklyBadges();
      
      // Then run every week
      setInterval(() => {
        this.processWeeklyBadges();
      }, 7 * 24 * 60 * 60 * 1000); // 7 days
    }, timeUntilNextSunday);
    
    this.logger.info(`${this.MESSAGES.INFO.WEEKLY_PROCESSOR_STARTED} - Agendado para ${nextSunday.toISOString()}`);
  }

  /**
   * Check badge progress for a specific user
   */
  public async checkUserBadgeProgress(
    userId: string,
    userStats: Record<string, number>,
  ): Promise<void> {
    try {
      for (const [statType, value] of Object.entries(userStats)) {
        await this.updateProgress(userId, statType, value, 'set');
      }
    } catch (error) {
      this.logger.error(`❌ Failed to check badge progress for user ${userId}:`, error);
    }
  }

  /**
   * Calculate level from XP (helper method)
   */
  private calculateLevel(xp: number): number {
    return Math.floor(Math.sqrt(xp / 100)) + 1;
  }

  /**
   * Register a badge (used by advanced badge services)
   */
  public async registerBadge(badgeData: any): Promise<boolean> {
    try {
      // Check if badge ID already exists
      if (this.badges.has(badgeData.id)) {
        this.logger.debug(`Badge with ID ${badgeData.id} already exists, skipping registration`);
        return true; // Return true since badge exists
      }

      const badge: BadgeDefinition = {
        id: badgeData.id,
        name: badgeData.name,
        description: badgeData.description,
        icon: badgeData.icon,
        category: badgeData.category,
        rarity: badgeData.rarity,
        requirements: badgeData.requirements,
        rewards: badgeData.rewards,
        isSecret: badgeData.isSecret || false,
        isActive: badgeData.isActive !== false, // Default to true
        createdAt: new Date(),
      };

      // Store in memory
      this.badges.set(badge.id, badge);

      this.logger.info(`✅ Registered advanced badge: ${badge.name} (${badge.id})`);
      return true;
    } catch (error) {
      this.logger.error('❌ Failed to register badge:', error);
      return false;
    }
  }

  /**
   * Create a custom badge (admin only)
   */
  public async createCustomBadge(badgeData: Omit<BadgeDefinition, 'createdAt'>): Promise<boolean> {
    try {
      // Check if badge ID already exists
      if (this.badges.has(badgeData.id)) {
        this.logger.warn(`Badge with ID ${badgeData.id} already exists`);
        return false;
      }

      const badge: BadgeDefinition = {
        ...badgeData,
        createdAt: new Date(),
      };

      // Store in memory
      this.badges.set(badge.id, badge);

      // Save to database if available
      if (this.database?.client) {
        try {
          // Note: You might need to create a Badge table in your database schema
          // This is just a placeholder for the database operation
          this.logger.debug(`Custom badge ${badge.id} would be saved to database`);
        } catch (dbError) {
          this.logger.error('Failed to save custom badge to database:', dbError);
        }
      }

      this.logger.info(`✅ Created custom badge: ${badge.name} (${badge.id})`);
      return true;
    } catch (error) {
      this.logger.error('❌ Failed to create custom badge:', error);
      return false;
    }
  }

  /**
   * Remove a badge from a user
   */
  public async removeBadge(userId: string, badgeId: string, notify: boolean = true): Promise<boolean> {
    try {
      const userBadges = this.userBadges.get(userId);
      if (!userBadges || !userBadges.has(badgeId)) {
        return false;
      }

      const badge = this.getBadge(badgeId);

      // Remove from memory
      userBadges.delete(badgeId);
      if (userBadges.size === 0) {
        this.userBadges.delete(userId);
      }

      // Remove from database if available
      if (this.database?.client) {
        await this.database.client.userBadge.deleteMany({
          where: {
            userId,
            badgeId,
          },
        });
      }

      // Invalidate user cache using distributed cache system
      try {
        await this.cacheManager.user.invalidate(userId);
      } catch (cacheError) {
        this.logger.warn(`Failed to invalidate cache for user ${userId}: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
        // Fallback to old cache clearing method
        await this.clearBadgeCache(userId);
      }

      // Send removal notification if requested and badge exists
      if (notify && badge) {
        await this.sendBadgeRemovalNotification(userId, badge);
      }

      await this.logBadgeOperation('remove', 'success', this.MESSAGES.SUCCESS.BADGE_REMOVED(badgeId, userId), {
        userId,
        badgeId,
        badgeName: badge?.name || 'Unknown',
      });

      this.logger.info(this.MESSAGES.SUCCESS.BADGE_REMOVED(badgeId, userId));
      return true;
    } catch (error) {
      await this.logBadgeOperation('remove', 'error', `Failed to remove badge ${badgeId} from user ${userId}`, {
        userId,
        badgeId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.logger.error(`❌ Failed to remove badge ${badgeId} from user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get badge leaderboard
   */
  public getBadgeLeaderboard(limit: number = 10): Array<{ userId: string; badgeCount: number }> {
    const leaderboard = Array.from(this.userBadges.entries())
      .map(([userId, badges]) => ({
        userId,
        badgeCount: badges.size,
      }))
      .sort((a, b) => b.badgeCount - a.badgeCount)
      .slice(0, limit);

    return leaderboard;
  }

  /**
   * Get rarity color
   */
  public getRarityColor(rarity: string): string {
    return (this.rarityColors[rarity] || this.rarityColors.common) as string;
  }

  /**
   * Get rarity emoji
   */
  public getRarityEmoji(rarity: string): string {
    return (this.rarityEmojis[rarity] || this.rarityEmojis.common) as string;
  }

  /**
   * Award founder badge to the founder
   */
  public async awardFounderBadge(): Promise<boolean> {
    return await this.awardBadge(this.FOUNDER_USER_ID, 'founder', true);
  }

  /**
   * Create weapon mastery badges
   */
  private async createWeaponMasteryBadges(): Promise<Omit<BadgeDefinition, 'createdAt'>[]> {
    const weapons = [
      'AKM', 'M416', 'SCAR-L', 'M16A4', 'QBZ', 'G36C',
      'Kar98k', 'M24', 'AWM', 'Win94', 'Mosin',
      'UMP45', 'Vector', 'Uzi', 'Tommy Gun',
      'M249', 'DP-28', 'MG3',
      'S686', 'S1897', 'S12K', 'DBS',
    ];

    const badges: Omit<BadgeDefinition, 'createdAt'>[] = [];

    for (const weapon of weapons) {
      badges.push({
        id: `weapon_mastery_${weapon.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: `Maestria ${weapon}`,
        description: `Domine a arma ${weapon} no PUBG`,
        icon: '🔫',
        category: 'pubg',
        rarity: 'uncommon',
        requirements: [
          {
            type: 'kills',
            operator: 'gte',
            value: 100,
            timeframe: 'all_time',
            additional: { weapon: weapon },
          },
        ],
        rewards: {
          xp: 200,
          coins: 75,
        },
        isSecret: false,
        isActive: true,
      });
    }

    return badges;
  }

  /**
   * Create survival mastery badges
   */
  private async createSurvivalMasteryBadges(): Promise<Omit<BadgeDefinition, 'createdAt'>[]> {
    return [
      {
        id: 'survival_top10_streak',
        name: 'Sobrevivente Consistente',
        description: 'Fique no Top 10 em 10 partidas consecutivas',
        icon: '🏕️',
        category: 'pubg',
        rarity: 'rare',
        requirements: [
          {
            type: 'streak',
            operator: 'gte',
            value: 10,
            timeframe: 'all_time',
            additional: { type: 'top10' },
          },
        ],
        rewards: {
          xp: 500,
          coins: 200,
        },
        isSecret: false,
        isActive: true,
      },
      {
        id: 'survival_chicken_dinner_streak',
        name: 'Rei do Frango',
        description: 'Vença 5 partidas consecutivas',
        icon: '🍗',
        category: 'pubg',
        rarity: 'epic',
        requirements: [
          {
            type: 'streak',
            operator: 'gte',
            value: 5,
            timeframe: 'all_time',
            additional: { type: 'win' },
          },
        ],
        rewards: {
          xp: 1000,
          coins: 400,
        },
        isSecret: false,
        isActive: true,
      },
    ];
  }

  /**
   * Sync PUBG badges with user stats
   */
  public async syncPUBGBadges(): Promise<void> {
    try {
      if (!this.database?.client) {
        this.logger.warn('Database not available for PUBG badge sync');
        return;
      }

      // Check if PUBG service is healthy
      const pubgService = this.client.services?.pubg;
      if (!pubgService) {
        await this.logBadgeOperation(
          'PUBG Badge Sync',
          'warning',
          'PUBG service not available',
          { timestamp: new Date().toISOString() },
        );
        return;
      }

      // Get all users with PUBG data
      const users = await this.database.client.user.findMany({
        where: {
          pubgUsername: {
            not: '',
          },
        },
        select: {
          id: true,
          pubgUsername: true,
          pubgPlatform: true,
          pubgStats: true,
        },
      });

      let syncedCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          // Get fresh PUBG stats
          if (!user.pubgUsername) {
            continue;
          }
          
          const pubgStats = await pubgService.getPlayerStats(
            user.pubgUsername,
            user.pubgPlatform as any,
          );

          if (pubgStats) {
            // Check and award PUBG badges
            const newBadges = await this.checkPUBGBadges(user.id, pubgStats);
            
            if (newBadges.length > 0) {
              await this.logBadgeOperation(
                'PUBG Badge Sync',
                'success',
                `Awarded ${newBadges.length} badges to user ${user.id}`,
                {
                  userId: user.id,
                  pubgUsername: user.pubgUsername,
                  newBadges,
                  timestamp: new Date().toISOString(),
                },
              );
            }

            syncedCount++;
          }
        } catch (userError) {
          errorCount++;
          this.logger.error(`Failed to sync PUBG badges for user ${user.id}:`, userError);
          
          await this.logBadgeOperation(
            'PUBG Badge Sync',
            'error',
            `Failed to sync badges for user ${user.id}`,
            {
              userId: user.id,
              pubgUsername: user.pubgUsername,
              error: userError instanceof Error ? userError.message : String(userError),
              timestamp: new Date().toISOString(),
            },
          );
        }
      }

      await this.logBadgeOperation(
        'PUBG Badge Sync',
        'success',
        `Completed PUBG badge sync: ${syncedCount} users synced, ${errorCount} errors`,
        {
          totalUsers: users.length,
          syncedCount,
          errorCount,
          timestamp: new Date().toISOString(),
        },
      );

      this.logger.info(
        `✅ PUBG badge sync completed: ${syncedCount}/${users.length} users synced, ${errorCount} errors`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to sync PUBG badges:', error);
      
      await this.logBadgeOperation(
        'PUBG Badge Sync',
        'error',
        'Failed to complete PUBG badge sync',
        {
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date().toISOString(),
        },
      );
    }
  }

  /**
   * Check and award PUBG-specific badges
   */
  public async checkPUBGBadges(userId: string, pubgStats: any): Promise<string[]> {
    const awardedBadges: string[] = [];

    try {
      // Update progress for PUBG stats
      const statMappings = {
        wins: this.getPUBGStatValue(pubgStats, 'wins'),
        kills: this.getPUBGStatValue(pubgStats, 'kills'),
        damage: this.getPUBGStatValue(pubgStats, 'damage'),
        headshots: this.getPUBGStatValue(pubgStats, 'headshots'),
        games: this.getPUBGStatValue(pubgStats, 'games'),
      };

      // Update all PUBG-related progress
      for (const [statType, value] of Object.entries(statMappings)) {
        if (value > 0) {
          await this.updateProgress(userId, statType, value, 'set');
        }
      }

      // Check for newly earned badges
      const userBadges = await this.getUserBadges(userId);
      const userBadgeIds = new Set(userBadges.map(b => b.id));
      
      // Get all PUBG badges
      const pubgBadges = Array.from(this.badges.values()).filter(
        badge => badge.category === 'pubg' && badge.isActive,
      );

      for (const badge of pubgBadges) {
        if (!userBadgeIds.has(badge.id)) {
          // Check if requirements are met
          const progress = this.getUserProgress(userId, badge.id);
          if (progress && progress.completed) {
            awardedBadges.push(badge.id);
          }
        }
      }

      return awardedBadges;
    } catch (error) {
      this.logger.error(`❌ Failed to check PUBG badges for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Log badge operations for monitoring
   */
  private async logBadgeOperation(
    operation: string,
    status: 'success' | 'warning' | 'error',
    message: string,
    data: any,
  ): Promise<void> {
    try {
      if (this.loggingService) {
        await this.loggingService.logApiOperation(
          this.client.guilds.cache.first()?.id || 'unknown',
          'Badge System',
          operation,
          status === 'success',
          message,
          `Badge System - ${operation}`,
          data,
        );
      }
    } catch (error) {
      this.logger.error('Failed to log badge operation:', error);
    }
  }

  /**
   * Get PUBG stat value from stats object
   */
  private getPUBGStatValue(pubgStats: any, requirementType: string): number {
    if (!pubgStats) {return 0;}

    switch (requirementType) {
      case 'wins':
        return pubgStats.wins || 0;
      case 'kills':
        return pubgStats.kills || 0;
      case 'damage':
        return pubgStats.damageDealt || pubgStats.damage || 0;
      case 'headshots':
        return pubgStats.headshotKills || pubgStats.headshots || 0;
      case 'games':
        return pubgStats.roundsPlayed || pubgStats.games || 0;
      default:
        return 0;
    }
  }

  /**
   * Get badges by category
   */
  public getBadgesByCategory(category: string): BadgeDefinition[] {
    return Array.from(this.badges.values())
      .filter(badge => badge.category === category && badge.isActive)
      .sort((a, b) => {
        const rarityOrder = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6 };
        return (rarityOrder[b.rarity as keyof typeof rarityOrder] || 0) - 
               (rarityOrder[a.rarity as keyof typeof rarityOrder] || 0);
      });
  }

  /**
   * Get user badge statistics
   */
  public async getUserBadgeStats(userId: string): Promise<{
    total: number;
    byRarity: Record<string, number>;
    byCategory: Record<string, number>;
    rarest: BadgeDefinition | null;
  }> {
    const userBadges = await this.getUserBadges(userId);
    const byRarity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let rarest: BadgeDefinition | null = null;

    const rarityOrder = { mythic: 6, legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
    let highestRarityValue = 0;

    for (const badge of userBadges) {
      // Count by rarity
      byRarity[badge.rarity] = (byRarity[badge.rarity] || 0) + 1;
      
      // Count by category
      byCategory[badge.category] = (byCategory[badge.category] || 0) + 1;
      
      // Find rarest badge
      const rarityValue = rarityOrder[badge.rarity as keyof typeof rarityOrder] || 0;
      if (rarityValue > highestRarityValue) {
        highestRarityValue = rarityValue;
        rarest = badge;
      }
    }

    return {
      total: userBadges.length,
      byRarity,
      byCategory,
      rarest,
    };
  }

  /**
   * Clear badge cache for a user or all users
   */
  public async clearBadgeCache(userId?: string): Promise<void> {
    try {
      if (!this.cache) {return;}

      if (userId) {
        // Clear specific user cache
        const cacheKeys = [
          `user_badges:${userId}`,
          `badges:progress:${userId}`,
          `badges:stats:${userId}`,
        ];
        
        // Clear all has_badge cache for this user
        const badgeIds = Array.from(this.badges.keys());
        for (const badgeId of badgeIds) {
          cacheKeys.push(`has_badge:${userId}:${badgeId}`);
        }
        
        for (const key of cacheKeys) {
          await this.cache.del(key);
        }
      } else {
        // Clear all badge-related cache patterns
        const patterns = [
          'user_badges:*',
          'has_badge:*',
          'badges:*',
        ];
        
        for (const pattern of patterns) {
          await this.cache.clearPattern(pattern);
        }
      }

      this.logger.debug(this.MESSAGES.SUCCESS.CACHE_CLEARED(userId));
    } catch (error) {
      this.logger.error(this.MESSAGES.ERRORS.CACHE_ERROR('clear cache', error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Validate badge system integrity
   */
  public async validateBadgeIntegrity(): Promise<{
    isValid: boolean;
    issues: string[];
    stats: {
      totalBadges: number;
      activeBadges: number;
      userBadgesCount: number;
      orphanedUserBadges: number;
    };
  }> {
    const issues: string[] = [];
    let orphanedUserBadges = 0;

    try {
      // Check for orphaned user badges (badges that don't exist in badge definitions)
      for (const [userId, userBadgeSet] of this.userBadges) {
        for (const badgeId of userBadgeSet) {
          if (!this.badges.has(badgeId)) {
            issues.push(`User ${userId} has orphaned badge: ${badgeId}`);
            orphanedUserBadges++;
          }
        }
      }

      // Check for badges with invalid requirements
      for (const [badgeId, badge] of this.badges) {
        if (badge.requirements.length === 0 && badgeId !== 'founder') {
          issues.push(`Badge ${badgeId} has no requirements`);
        }

        for (const req of badge.requirements) {
          if (typeof req.value !== 'number' && !Array.isArray(req.value)) {
            issues.push(`Badge ${badgeId} has invalid requirement value`);
          }
        }
      }

      const activeBadges = Array.from(this.badges.values()).filter(b => b.isActive).length;
      let totalUserBadges = 0;
      for (const userBadgeSet of this.userBadges.values()) {
        totalUserBadges += userBadgeSet.size;
      }

      return {
        isValid: issues.length === 0,
        issues,
        stats: {
          totalBadges: this.badges.size,
          activeBadges,
          userBadgesCount: totalUserBadges,
          orphanedUserBadges,
        },
      };
    } catch (error) {
      this.logger.error('❌ Failed to validate badge integrity:', error);
      issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        isValid: false,
        issues,
        stats: {
          totalBadges: 0,
          activeBadges: 0,
          userBadgesCount: 0,
          orphanedUserBadges: 0,
        },
      };
    }
  }

  /**
   * Get advanced badge statistics
   */
  public async getAdvancedBadgeStats(): Promise<{
    overview: {
      totalBadges: number;
      totalAwarded: number;
      uniqueHolders: number;
      averageBadgesPerUser: number;
    };
    distribution: {
      byRarity: Record<string, { count: number; awarded: number; percentage: number }>;
      byCategory: Record<string, { count: number; awarded: number; percentage: number }>;
    };
    topBadges: Array<{ badgeId: string; name: string; holders: number; rarity: string }>;
    rareHolders: Array<{ userId: string; badgeCount: number; rarest: string }>;
  }> {
    try {
      const totalBadges = this.badges.size;
      let totalAwarded = 0;
      const uniqueHolders = this.userBadges.size;
      
      const rarityDistribution: Record<string, { count: number; awarded: number; percentage: number }> = {};
      const categoryDistribution: Record<string, { count: number; awarded: number; percentage: number }> = {};
      const badgeHolders: Map<string, number> = new Map();

      // Initialize distributions
      for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']) {
        rarityDistribution[rarity] = { count: 0, awarded: 0, percentage: 0 };
      }
      
      for (const category of ['pubg', 'social', 'gaming', 'participation', 'special', 'achievement']) {
        categoryDistribution[category] = { count: 0, awarded: 0, percentage: 0 };
      }

      // Count badges by rarity and category
      for (const badge of this.badges.values()) {
        if (badge.rarity && rarityDistribution[badge.rarity]) {
          rarityDistribution[badge.rarity]!.count++;
        }
        if (badge.category && categoryDistribution[badge.category]) {
          categoryDistribution[badge.category]!.count++;
        }
      }

      // Count awarded badges and holders
      for (const [userId, userBadgeSet] of this.userBadges) {
        totalAwarded += userBadgeSet.size;
        
        for (const badgeId of userBadgeSet) {
          const badge = this.badges.get(badgeId);
          if (badge) {
            if (badge.rarity && rarityDistribution[badge.rarity]) {
              rarityDistribution[badge.rarity]!.awarded++;
            }
            if (badge.category && categoryDistribution[badge.category]) {
              categoryDistribution[badge.category]!.awarded++;
            }
            badgeHolders.set(badgeId, (badgeHolders.get(badgeId) || 0) + 1);
          }
        }
      }

      // Calculate percentages
      for (const rarity in rarityDistribution) {
        const dist = rarityDistribution[rarity];
        if (dist) {
          dist.percentage = totalAwarded > 0 ? (dist.awarded / totalAwarded) * 100 : 0;
        }
      }
      
      for (const category in categoryDistribution) {
        const dist = categoryDistribution[category];
        if (dist) {
          dist.percentage = totalAwarded > 0 ? (dist.awarded / totalAwarded) * 100 : 0;
        }
      }

      // Get top badges by holder count
      const topBadges = Array.from(badgeHolders.entries())
        .map(([badgeId, holders]) => {
          const badge = this.badges.get(badgeId);
          return {
            badgeId,
            name: badge?.name || 'Unknown',
            holders,
            rarity: badge?.rarity || 'unknown',
          };
        })
        .sort((a, b) => b.holders - a.holders)
        .slice(0, 10);

      // Get users with rarest badges
      const rarityValues = { mythic: 6, legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
      const rareHolders = Array.from(this.userBadges.entries())
        .map(([userId, badgeSet]) => {
          let rarest = 'common';
          let maxRarityValue = 0;

          for (const badgeId of badgeSet) {
            const badge = this.badges.get(badgeId);
            if (badge) {
              const rarityValue = rarityValues[badge.rarity as keyof typeof rarityValues] || 0;
              if (rarityValue > maxRarityValue) {
                maxRarityValue = rarityValue;
                rarest = badge.rarity;
              }
            }
          }

          return {
            userId,
            badgeCount: badgeSet.size,
            rarest,
          };
        })
        .sort((a, b) => {
          const aRarityValue = rarityValues[a.rarest as keyof typeof rarityValues] || 0;
          const bRarityValue = rarityValues[b.rarest as keyof typeof rarityValues] || 0;
          return bRarityValue - aRarityValue || b.badgeCount - a.badgeCount;
        })
        .slice(0, 10);

      const averageBadgesPerUser = uniqueHolders > 0 ? totalAwarded / uniqueHolders : 0;

      return {
        overview: {
          totalBadges,
          totalAwarded,
          uniqueHolders,
          averageBadgesPerUser,
        },
        distribution: {
          byRarity: rarityDistribution,
          byCategory: categoryDistribution,
        },
        topBadges,
        rareHolders,
      };
    } catch (error) {
      this.logger.error('❌ Failed to get advanced badge stats:', error);
      throw error;
    }
  }

  /**
   * Clean up orphaned badges
   */
  public async cleanupOrphanedBadges(): Promise<{
    cleaned: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      for (const [userId, userBadgeSet] of this.userBadges) {
        for (const badgeId of Array.from(userBadgeSet)) {
          if (!this.badges.has(badgeId)) {
            try {
              await this.removeBadge(userId, badgeId);
              cleaned++;
              this.logger.info(`🧹 Cleaned orphaned badge ${badgeId} from user ${userId}`);
            } catch (error) {
              const errorMsg = `Failed to remove orphaned badge ${badgeId} from user ${userId}: ${error}`;
              errors.push(errorMsg);
              this.logger.error(errorMsg);
            }
          }
        }
      }

      return { cleaned, errors };
    } catch (error) {
      this.logger.error('❌ Failed to cleanup orphaned badges:', error);
      errors.push(`Cleanup failed: ${error}`);
      return { cleaned, errors };
    }
  }

  /**
   * Export user badges data
   */
  public async exportUserBadges(userId?: string): Promise<any> {
    if (userId) {
      const userBadges = await this.getUserBadges(userId);
      const userProgress = this.badgeProgress.get(userId);
      
      return {
        userId,
        badges: userBadges.map(badge => ({
          id: badge.id,
          name: badge.name,
          rarity: badge.rarity,
          category: badge.category,
          earnedAt: new Date(), // You might want to store this properly
        })),
        progress: userProgress ? Array.from(userProgress.entries()).map(([badgeId, progress]) => ({
          badgeId,
          requirements: Object.fromEntries(progress.requirements),
          completed: progress.completed,
          completedAt: progress.completedAt,
        })) : [],
      };
    }

    // Export all users
    const allUsers: any[] = [];
    for (const [userId] of this.userBadges) {
      allUsers.push(this.exportUserBadges(userId));
    }
    
    return {
      exportedAt: new Date().toISOString(),
      totalUsers: allUsers.length,
      users: allUsers,
      badgeDefinitions: Array.from(this.badges.values()),
    };
  }

  /**
   * Import user badges data
   */
  public async importUserBadges(data: any): Promise<{
    imported: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let imported = 0;

    try {
      if (data.users && Array.isArray(data.users)) {
        for (const userData of data.users) {
          try {
            const userId = userData.userId;
            
            if (userData.badges && Array.isArray(userData.badges)) {
              for (const badgeData of userData.badges) {
                if (this.badges.has(badgeData.id)) {
                  const success = await this.awardBadge(userId, badgeData.id, false);
                  if (success) {
                    imported++;
                  }
                }
              }
            }
          } catch (userError) {
            errors.push(`Failed to import badges for user ${userData.userId}: ${userError}`);
          }
        }
      }

      return { imported, errors };
    } catch (error) {
      this.logger.error('❌ Failed to import user badges:', error);
      errors.push(`Import failed: ${error}`);
      return { imported, errors };
    }
  }

  /**
   * Get service health status
   */
  public getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    serviceName: string;
    details: {
      badgesLoaded: boolean;
      userBadgesLoaded: boolean;
      databaseConnected: boolean;
      cacheConnected: boolean;
      clientConnected: boolean;
      totalBadges: number;
      totalUserBadges: number;
    };
  } {
    const badgesLoaded = this.badges.size > 0;
    const userBadgesLoaded = this.userBadges.size >= 0;
    const databaseConnected = !!this.database?.client;
    const cacheConnected = !!this.cache;
    
    let totalUserBadges = 0;
    for (const userBadgeSet of this.userBadges.values()) {
      totalUserBadges += userBadgeSet.size;
    }

    const isHealthy = badgesLoaded && userBadgesLoaded;
    const isDegraded = !databaseConnected || !cacheConnected;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (!isHealthy) {
      status = 'unhealthy';
    } else if (isDegraded) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      serviceName: this.serviceName,
      details: {
        badgesLoaded,
        userBadgesLoaded,
        databaseConnected,
        cacheConnected,
        clientConnected: !!this.client,
        totalBadges: this.badges.size,
        totalUserBadges,
      },
    };
  }
}
