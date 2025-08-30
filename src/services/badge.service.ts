import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { ExtendedClient } from '../types/client';
import { XPService } from './xp.service.js';
import { User, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'pubg' | 'social' | 'gaming' | 'participation' | 'special' | 'achievement';
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
    | 'badges_earned';
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
 * Badge Service for automatic badge distribution and gamification
 */
export class BadgeService {
  private logger: Logger;
  private cache: CacheService;
  private database: DatabaseService;
  private client: ExtendedClient;
  private xpService: XPService;

  private badges: Map<string, BadgeDefinition> = new Map();
  private userBadges: Map<string, Set<string>> = new Map(); // userId -> badgeIds
  private badgeProgress: Map<string, Map<string, BadgeProgress>> = new Map(); // userId -> badgeId -> progress

  // ID do fundador (exclusivo)
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

  constructor(client: ExtendedClient, xpService: XPService) {
    // Validate required dependencies
    if (!client) {
      throw new Error('❌ ExtendedClient is required for BadgeService');
    }
    if (!client.cache) {
      throw new Error('❌ CacheService is required for BadgeService');
    }
    if (!client.database) {
      throw new Error('❌ DatabaseService is required for BadgeService');
    }
    if (!xpService) {
      throw new Error('❌ XPService is required for BadgeService');
    }

    this.logger = new Logger();
    this.cache = client.cache;
    this.database = client.database;
    this.client = client;
    this.xpService = xpService;

    // Initialize asynchronously with error handling
    this.initializeAsync().catch(error => {
      this.logger.error('❌ Failed to initialize BadgeService:', error);
    });
  }

  /**
   * Async initialization wrapper
   */
  private async initializeAsync(): Promise<void> {
    try {
      await this.initializeBadges();
      await this.loadUserBadges();
      this.startProgressTracker();
      this.logger.info('✅ BadgeService initialized successfully');
    } catch (error) {
      this.logger.error('❌ BadgeService initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize all badge definitions with validation and error handling
   */
  private async initializeBadges(): Promise<void> {
    try {
      this.logger.info('🔄 Initializing badge definitions...');
      const badgeDefinitions: Omit<BadgeDefinition, 'createdAt'>[] = [
        // PUBG Badges
        {
          id: 'first_kill',
          name: 'Primeira Eliminação',
          description: 'Consiga sua primeira eliminação no PUBG',
          icon: '🎯',
          category: 'pubg',
          rarity: 'common',
          requirements: [{ type: 'kills', operator: 'gte', value: 1 }],
          rewards: { xp: 50, coins: 25 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'killer_instinct',
          name: 'Instinto Assassino',
          description: 'Consiga 100 eliminações no PUBG',
          icon: '💀',
          category: 'pubg',
          rarity: 'uncommon',
          requirements: [{ type: 'kills', operator: 'gte', value: 100 }],
          rewards: { xp: 200, coins: 100 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'death_dealer',
          name: 'Ceifador',
          description: 'Consiga 500 eliminações no PUBG',
          icon: '⚔️',
          category: 'pubg',
          rarity: 'rare',
          requirements: [{ type: 'kills', operator: 'gte', value: 500 }],
          rewards: { xp: 500, coins: 250 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'legendary_slayer',
          name: 'Matador Lendário',
          description: 'Consiga 1000 eliminações no PUBG',
          icon: '🗡️',
          category: 'pubg',
          rarity: 'legendary',
          requirements: [{ type: 'kills', operator: 'gte', value: 1000 }],
          rewards: { xp: 1000, coins: 500, role: 'legendary_slayer' },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'first_win',
          name: 'Primeira Vitória',
          description: 'Vença sua primeira partida no PUBG',
          icon: '🏆',
          category: 'pubg',
          rarity: 'common',
          requirements: [{ type: 'wins', operator: 'gte', value: 1 }],
          rewards: { xp: 100, coins: 50 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'winner_winner',
          name: 'Winner Winner',
          description: 'Vença 10 partidas no PUBG',
          icon: '🥇',
          category: 'pubg',
          rarity: 'uncommon',
          requirements: [{ type: 'wins', operator: 'gte', value: 10 }],
          rewards: { xp: 300, coins: 150 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'champion',
          name: 'Campeão',
          description: 'Vença 50 partidas no PUBG',
          icon: '👑',
          category: 'pubg',
          rarity: 'rare',
          requirements: [{ type: 'wins', operator: 'gte', value: 50 }],
          rewards: { xp: 750, coins: 375 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'headshot_master',
          name: 'Mestre dos Headshots',
          description: 'Consiga 100 headshots no PUBG',
          icon: '🎯',
          category: 'pubg',
          rarity: 'rare',
          requirements: [{ type: 'headshots', operator: 'gte', value: 100 }],
          rewards: { xp: 400, coins: 200 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'damage_dealer',
          name: 'Causador de Dano',
          description: 'Cause 100,000 de dano total no PUBG',
          icon: '💥',
          category: 'pubg',
          rarity: 'uncommon',
          requirements: [{ type: 'damage', operator: 'gte', value: 100000 }],
          rewards: { xp: 350, coins: 175 },
          isSecret: false,
          isActive: true,
        },

        // Social Badges
        {
          id: 'chatterbox',
          name: 'Tagarela',
          description: 'Envie 1000 mensagens no servidor',
          icon: '💬',
          category: 'social',
          rarity: 'common',
          requirements: [{ type: 'messages', operator: 'gte', value: 1000 }],
          rewards: { xp: 200, coins: 100 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'social_butterfly',
          name: 'Borboleta Social',
          description: 'Passe 100 horas em canais de voz',
          icon: '🦋',
          category: 'social',
          rarity: 'uncommon',
          requirements: [{ type: 'voice_time', operator: 'gte', value: 360000 }], // 100 hours in seconds
          rewards: { xp: 500, coins: 250 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'reaction_king',
          name: 'Rei das Reações',
          description: 'Receba 500 reações em suas mensagens',
          icon: '👑',
          category: 'social',
          rarity: 'rare',
          requirements: [{ type: 'reactions', operator: 'gte', value: 500 }],
          rewards: { xp: 300, coins: 150 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'inviter',
          name: 'Recrutador',
          description: 'Convide 10 pessoas para o servidor',
          icon: '📨',
          category: 'social',
          rarity: 'uncommon',
          requirements: [{ type: 'invites', operator: 'gte', value: 10 }],
          rewards: { xp: 400, coins: 200 },
          isSecret: false,
          isActive: true,
        },

        // Gaming Badges
        {
          id: 'quiz_master',
          name: 'Mestre dos Quizzes',
          description: 'Acerte 100 perguntas em quizzes',
          icon: '🧠',
          category: 'gaming',
          rarity: 'uncommon',
          requirements: [{ type: 'quiz_score', operator: 'gte', value: 100 }],
          rewards: { xp: 300, coins: 150 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'game_champion',
          name: 'Campeão dos Jogos',
          description: 'Vença 50 mini-games',
          icon: '🎮',
          category: 'gaming',
          rarity: 'rare',
          requirements: [{ type: 'mini_game_wins', operator: 'gte', value: 50 }],
          rewards: { xp: 600, coins: 300 },
          isSecret: false,
          isActive: true,
        },

        // Participation Badges
        {
          id: 'daily_warrior',
          name: 'Guerreiro Diário',
          description: 'Faça check-in por 7 dias consecutivos',
          icon: '📅',
          category: 'participation',
          rarity: 'common',
          requirements: [{ type: 'consecutive_days', operator: 'gte', value: 7 }],
          rewards: { xp: 150, coins: 75 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'monthly_legend',
          name: 'Lenda Mensal',
          description: 'Faça check-in por 30 dias consecutivos',
          icon: '🗓️',
          category: 'participation',
          rarity: 'epic',
          requirements: [{ type: 'consecutive_days', operator: 'gte', value: 30 }],
          rewards: { xp: 1000, coins: 500, role: 'monthly_legend' },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'clip_creator',
          name: 'Criador de Clips',
          description: 'Envie 25 clips',
          icon: '🎬',
          category: 'participation',
          rarity: 'uncommon',
          requirements: [{ type: 'clips_uploaded', operator: 'gte', value: 25 }],
          rewards: { xp: 250, coins: 125 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'clip_star',
          name: 'Estrela dos Clips',
          description: 'Receba 100 votos positivos em seus clips',
          icon: '⭐',
          category: 'participation',
          rarity: 'rare',
          requirements: [{ type: 'clips_votes', operator: 'gte', value: 100 }],
          rewards: { xp: 400, coins: 200 },
          isSecret: false,
          isActive: true,
        },

        // Achievement Badges
        {
          id: 'level_10',
          name: 'Nível 10',
          description: 'Alcance o nível 10',
          icon: '🔟',
          category: 'achievement',
          rarity: 'common',
          requirements: [{ type: 'level', operator: 'gte', value: 10 }],
          rewards: { coins: 100 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'level_50',
          name: 'Nível 50',
          description: 'Alcance o nível 50',
          icon: '🏅',
          category: 'achievement',
          rarity: 'rare',
          requirements: [{ type: 'level', operator: 'gte', value: 50 }],
          rewards: { coins: 500, role: 'veteran' },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'millionaire',
          name: 'Milionário',
          description: 'Acumule 1,000,000 moedas',
          icon: '💰',
          category: 'achievement',
          rarity: 'legendary',
          requirements: [{ type: 'coins_earned', operator: 'gte', value: 1000000 }],
          rewards: { role: 'millionaire' },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'collector',
          name: 'Colecionador',
          description: 'Colete 25 badges diferentes',
          icon: '🏆',
          category: 'achievement',
          rarity: 'epic',
          requirements: [{ type: 'badges_earned', operator: 'gte', value: 25 }],
          rewards: { xp: 1000, coins: 500 },
          isSecret: false,
          isActive: true,
        },

        // Special/Secret Badges
        {
          id: 'founder',
          name: 'Fundador',
          description: 'Badge exclusiva do fundador do Hawk Esports',
          icon: '👑',
          category: 'special',
          rarity: 'mythic',
          requirements: [], // Manually awarded - exclusive to founder
          rewards: { role: 'founder', xp: 5000, coins: 2500 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'early_adopter',
          name: 'Pioneiro',
          description: 'Um dos primeiros 100 membros da comunidade',
          icon: '🌟',
          category: 'special',
          rarity: 'legendary',
          requirements: [], // Manually awarded based on join date
          rewards: { role: 'early_adopter', xp: 2000, coins: 1000 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'beta_tester',
          name: 'Beta Tester',
          description: 'Participou dos testes beta do bot',
          icon: '🧪',
          category: 'special',
          rarity: 'epic',
          requirements: [], // Manually awarded
          rewards: { role: 'beta_tester', xp: 1500, coins: 750 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'easter_egg',
          name: 'Caçador de Easter Eggs',
          description: 'Encontrou um easter egg secreto',
          icon: '🥚',
          category: 'special',
          rarity: 'legendary',
          requirements: [], // Manually awarded
          rewards: { xp: 500, coins: 250 },
          isSecret: true,
          isActive: true,
        },
        {
          id: 'night_owl',
          name: 'Coruja Noturna',
          description: 'Ativo durante as madrugadas',
          icon: '🦉',
          category: 'special',
          rarity: 'rare',
          requirements: [], // Complex logic required
          rewards: { xp: 200, coins: 100 },
          isSecret: true,
          isActive: true,
        },
      ];

      // No need to check existing badges when using upsert

      // Create or update badges
      for (const badgeData of badgeDefinitions) {
        await this.database.client.badge.upsert({
          where: { id: badgeData.id },
          update: {
            name: badgeData.name,
            description: badgeData.description,
            icon: badgeData.icon,
            category: badgeData.category,
            rarity: badgeData.rarity,
            requirements: JSON.stringify(badgeData.requirements),
            isSecret: badgeData.isSecret,
            isActive: badgeData.isActive,
          },
          create: {
            id: badgeData.id,
            name: badgeData.name,
            description: badgeData.description,
            icon: badgeData.icon,
            category: badgeData.category,
            rarity: badgeData.rarity,
            requirements: JSON.stringify(badgeData.requirements),
            isSecret: badgeData.isSecret,
            isActive: badgeData.isActive,
          },
        });

        this.badges.set(badgeData.id, {
          ...badgeData,
          createdAt: new Date(),
        });
      }

      // Load all badges from database
      const allBadges = await this.database.client.badge.findMany();
      for (const badge of allBadges) {
        this.badges.set(badge.id, {
          id: badge.id,
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          category: badge.category as any,
          rarity: badge.rarity as any,
          requirements: JSON.parse(badge.requirements as string),
          isSecret: badge.isSecret,
          isActive: badge.isActive,
          createdAt: badge.createdAt,
        });
      }

      this.logger.info(`✅ Initialized ${this.badges.size} badges successfully`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize badges:', error);
      throw error;
    }
  }

  /**
   * Load user badges from database with validation and error handling
   */
  private async loadUserBadges(): Promise<void> {
    try {
      this.logger.info('🔄 Loading user badges from database...');

      if (!this.database?.client) {
        throw new Error('Database client not available');
      }

      const userBadges = await this.database.client.userBadge.findMany({
        select: {
          userId: true,
          badgeId: true,
          earnedAt: true,
        },
      });

      let loadedCount = 0;
      let errorCount = 0;

      for (const userBadge of userBadges) {
        try {
          // Validate user badge data
          if (!userBadge.userId || typeof userBadge.userId !== 'string') {
            this.logger.warn('⚠️ Invalid userId in user badge:', userBadge);
            errorCount++;
            continue;
          }

          if (!userBadge.badgeId || typeof userBadge.badgeId !== 'string') {
            this.logger.warn('⚠️ Invalid badgeId in user badge:', userBadge);
            errorCount++;
            continue;
          }

          // Verify badge exists in our definitions
          if (!this.badges.has(userBadge.badgeId)) {
            this.logger.warn(
              `⚠️ User has badge that doesn't exist in definitions: ${userBadge.badgeId}`
            );
            errorCount++;
            continue;
          }

          if (!this.userBadges.has(userBadge.userId)) {
            this.userBadges.set(userBadge.userId, new Set());
          }
          this.userBadges.get(userBadge.userId)!.add(userBadge.badgeId);
          loadedCount++;
        } catch (error) {
          this.logger.error('❌ Error processing user badge:', { userBadge, error });
          errorCount++;
        }
      }

      this.logger.info(
        `✅ Loaded ${loadedCount} badges for ${this.userBadges.size} users` +
          (errorCount > 0 ? ` (${errorCount} errors)` : '')
      );
    } catch (error) {
      this.logger.error('❌ Failed to load user badges:', error);
      throw error;
    }
  }

  /**
   * Start progress tracker for automatic badge checking
   */
  private startProgressTracker(): void {
    // Check badge progress every 5 minutes
    setInterval(
      async () => {
        await this.checkAllBadgeProgress();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Update user progress for badge requirements with validation and error handling
   */
  public async updateProgress(
    userId: string,
    requirementType: string,
    value: number,
    operation: 'set' | 'increment' = 'increment'
  ): Promise<void> {
    try {
      // Validate input parameters
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('Invalid userId provided');
      }

      if (
        !requirementType ||
        typeof requirementType !== 'string' ||
        requirementType.trim().length === 0
      ) {
        throw new Error('Invalid requirementType provided');
      }

      if (typeof value !== 'number' || !isFinite(value) || value < 0) {
        throw new Error('Invalid value provided - must be a non-negative finite number');
      }

      if (!['set', 'increment'].includes(operation)) {
        throw new Error('Invalid operation - must be "set" or "increment"');
      }

      // Sanitize inputs
      userId = userId.trim();
      requirementType = requirementType.trim();

      if (!this.badgeProgress.has(userId)) {
        this.badgeProgress.set(userId, new Map());
      }

      const userProgress = this.badgeProgress.get(userId)!;
      let updatedBadges = 0;
      const awardedBadges: string[] = [];

      // Update progress for all relevant badges
      for (const [badgeId, badge] of this.badges) {
        try {
          if (!badge.isActive) {
            continue;
          }

          // Skip if user already has this badge
          if (this.userBadges.get(userId)?.has(badgeId)) {
            continue;
          }

          // Check if badge has this requirement type
          const hasRequirement = badge.requirements.some(req => req.type === requirementType);
          if (!hasRequirement) {
            continue;
          }

          if (!userProgress.has(badgeId)) {
            userProgress.set(badgeId, {
              userId,
              badgeId,
              requirements: new Map(),
              completed: false,
            });
          }

          const progress = userProgress.get(badgeId)!;
          const currentValue = progress.requirements.get(requirementType) || 0;

          const newValue = operation === 'set' ? value : currentValue + value;

          // Ensure new value is valid
          if (typeof newValue !== 'number' || !isFinite(newValue) || newValue < 0) {
            this.logger.warn(`⚠️ Invalid calculated value for ${badgeId}: ${newValue}`);
            continue;
          }

          progress.requirements.set(requirementType, newValue);
          updatedBadges++;

          // Check if badge requirements are met
          if (this.checkBadgeRequirements(badge, progress.requirements)) {
            const awarded = await this.awardBadge(userId, badgeId);
            if (awarded) {
              awardedBadges.push(badge.name);
            }
          }
        } catch (error) {
          this.logger.error(`❌ Error updating progress for badge ${badgeId}:`, error);
        }
      }

      // Log progress update (only for significant updates)
      if (updatedBadges > 0) {
        this.logger.debug(
          `📊 Updated progress for ${updatedBadges} badges for user ${userId}` +
            (awardedBadges.length > 0 ? ` - Awarded: ${awardedBadges.join(', ')}` : '')
        );
      }
    } catch (error) {
      this.logger.error('❌ Failed to update badge progress:', {
        userId,
        requirementType,
        value,
        operation,
        error,
      });
      throw error;
    }
  }

  /**
   * Check if badge requirements are met
   */
  private checkBadgeRequirements(
    badge: BadgeDefinition,
    userProgress: Map<string, number>
  ): boolean {
    for (const requirement of badge.requirements) {
      const currentValue = userProgress.get(requirement.type) || 0;

      switch (requirement.operator) {
        case 'gte':
          if (currentValue < (requirement.value as number)) {
            return false;
          }
          break;
        case 'lte':
          if (currentValue > (requirement.value as number)) {
            return false;
          }
          break;
        case 'eq':
          if (currentValue !== (requirement.value as number)) {
            return false;
          }
          break;
        case 'between':
          const [min, max] = requirement.value as [number, number];
          if (currentValue < min || currentValue > max) {
            return false;
          }
          break;
      }
    }

    return true;
  }

  /**
   * Award badge to user with validation and error handling
   */
  public async awardBadge(
    userId: string,
    badgeId: string,
    notify: boolean = true
  ): Promise<boolean> {
    try {
      // Validate input parameters
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('Invalid userId provided');
      }

      if (!badgeId || typeof badgeId !== 'string' || badgeId.trim().length === 0) {
        throw new Error('Invalid badgeId provided');
      }

      // Sanitize inputs
      userId = userId.trim();
      badgeId = badgeId.trim();

      // Check if user already has this badge
      if (this.userBadges.get(userId)?.has(badgeId)) {
        this.logger.debug(`🔄 User ${userId} already has badge ${badgeId}`);
        return false;
      }

      const badge = this.badges.get(badgeId);
      if (!badge) {
        this.logger.error(`❌ Badge not found: ${badgeId}`);
        return false;
      }

      // Check if badge is active
      if (!badge.isActive) {
        this.logger.warn(`⚠️ Attempted to award inactive badge: ${badgeId}`);
        return false;
      }

      // Check if it's the founder badge and user is not the founder
      if (badgeId === 'founder' && userId !== this.FOUNDER_USER_ID) {
        this.logger.warn(`⚠️ Attempted to award founder badge to non-founder user: ${userId}`);
        return false;
      }

      // Validate database connection
      if (!this.database?.client) {
        throw new Error('Database client not available');
      }

      // Use transaction for atomicity
      const result = await this.database.client.$transaction(async tx => {
        // Double-check in database to prevent race conditions
        const existingBadge = await tx.userBadge.findUnique({
          where: {
            userId_badgeId: {
              userId,
              badgeId,
            },
          },
        });

        if (existingBadge) {
          return false; // Badge already exists
        }

        // Add to database
        await tx.userBadge.create({
          data: {
            userId,
            badgeId,
            earnedAt: new Date(),
          },
        });

        return true;
      });

      if (!result) {
        this.logger.debug(`🔄 Badge ${badgeId} already exists for user ${userId} (race condition)`);
        return false;
      }

      // Add to memory
      if (!this.userBadges.has(userId)) {
        this.userBadges.set(userId, new Set());
      }
      this.userBadges.get(userId)!.add(badgeId);

      // Award rewards (non-blocking)
      if (badge.rewards) {
        this.awardBadgeRewards(userId, badge.rewards).catch(error => {
          this.logger.error(`❌ Failed to award badge rewards for ${badgeId}:`, error);
        });
      }

      // Send notification (non-blocking)
      if (notify) {
        this.sendBadgeNotification(userId, badge).catch(error => {
          this.logger.error(`❌ Failed to send badge notification for ${badgeId}:`, error);
        });
      }

      // Update cache
      await this.cache.del(`user_badges_${userId}`);

      this.logger.info(
        `✅ Badge awarded: ${badge.name} (${badgeId}) to user ${userId} - Rarity: ${badge.rarity}`
      );

      // Check for collector badge (non-blocking)
      const userBadgeCount = this.userBadges.get(userId)?.size || 0;
      if (userBadgeCount >= 25) {
        this.updateProgress(userId, 'badges_earned', userBadgeCount, 'set').catch(error => {
          this.logger.error('❌ Failed to update collector badge progress:', error);
        });
      }

      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to award badge ${badgeId} to user ${userId}:`, error);

      // Clean up memory state if database operation failed
      if (this.userBadges.get(userId)?.has(badgeId)) {
        this.userBadges.get(userId)!.delete(badgeId);
        this.logger.debug(`🧹 Cleaned up memory state for failed badge award: ${badgeId}`);
      }

      return false;
    }
  }

  /**
   * Award badge rewards with validation and error handling
   */
  private async awardBadgeRewards(userId: string, rewards: any): Promise<void> {
    try {
      // Validate input parameters
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('Invalid userId provided for rewards');
      }

      if (!rewards || typeof rewards !== 'object') {
        throw new Error('Invalid rewards object provided');
      }

      const rewardResults: string[] = [];

      // Award XP using XPService
      if (rewards.xp && typeof rewards.xp === 'number' && rewards.xp > 0) {
        try {
          if (!this.xpService) {
            throw new Error('XPService not available');
          }

          await this.xpService.addXP(userId, 'BADGE_EARNED', undefined, rewards.xp / 25); // Normalize to base XP
          rewardResults.push(`XP: ${rewards.xp}`);
          this.logger.debug(`✅ XP awarded to user ${userId}: ${rewards.xp}`);
        } catch (error) {
          this.logger.error(`❌ Failed to award XP to user ${userId}:`, error);
          throw error;
        }
      }

      // Award coins
      if (rewards.coins && typeof rewards.coins === 'number' && rewards.coins > 0) {
        try {
          if (!this.database?.users) {
            throw new Error('Database users service not available');
          }

          await this.database.users.updateCoins(userId, rewards.coins, 'Badge reward');
          rewardResults.push(`Coins: ${rewards.coins}`);
          this.logger.debug(`✅ Coins awarded to user ${userId}: ${rewards.coins}`);
        } catch (error) {
          this.logger.error(`❌ Failed to award coins to user ${userId}:`, error);
          throw error;
        }
      }

      // Award role (would integrate with role management)
      if (rewards.role && typeof rewards.role === 'string' && rewards.role.trim().length > 0) {
        try {
          // TODO: Integrate with role management service when available
          rewardResults.push(`Role: ${rewards.role}`);
          this.logger.debug(`✅ Role marked for award to user ${userId}: ${rewards.role}`);
        } catch (error) {
          this.logger.error(`❌ Failed to award role to user ${userId}:`, error);
          // Don't throw for role errors as it's not critical
        }
      }

      if (rewardResults.length > 0) {
        this.logger.info(`🎁 Rewards awarded to user ${userId}: ${rewardResults.join(', ')}`);
      } else {
        this.logger.debug(`ℹ️ No valid rewards to award for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to award rewards to user ${userId}:`, error);
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Send badge notification to user with validation and error handling
   */
  private async sendBadgeNotification(userId: string, badge: BadgeDefinition): Promise<void> {
    try {
      // Validate input parameters
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('Invalid userId provided for notification');
      }

      if (!badge || typeof badge !== 'object') {
        throw new Error('Invalid badge object provided for notification');
      }

      // Validate required badge properties
      if (!badge.name || !badge.description || !badge.rarity || !badge.category) {
        throw new Error('Badge missing required properties for notification');
      }

      // Validate client availability
      if (!this.client || !this.client.users) {
        throw new Error('Discord client not available for notifications');
      }

      // Fetch user with timeout and validation
      let user;
      try {
        user = await Promise.race([
          this.client.users.fetch(userId),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('User fetch timeout')), 5000)
          ),
        ]);
      } catch (error) {
        this.logger.warn(`⚠️ Failed to fetch user ${userId} for badge notification:`, error);
        return;
      }

      if (!user) {
        this.logger.warn(`⚠️ User ${userId} not found for badge notification`);
        return;
      }

      // Build embed with error handling
      let embed;
      try {
        embed = new EmbedBuilder()
          .setTitle('🎉 Nova Badge Conquistada!')
          .setDescription(`Parabéns! Você conquistou a badge **${badge.name}**!`)
          .addFields(
            { name: 'Descrição', value: badge.description.slice(0, 1024), inline: false }, // Limit field length
            {
              name: 'Raridade',
              value: `${this.rarityEmojis[badge.rarity] || '⚪'} ${badge.rarity.toUpperCase()}`,
              inline: true,
            },
            { name: 'Categoria', value: badge.category.toUpperCase(), inline: true }
          )
          .setColor((this.rarityColors[badge.rarity] || '#95A5A6') as any)
          .setTimestamp();

        // Safely set thumbnail
        try {
          const avatarURL = (user as any).displayAvatarURL({ size: 256 });
          if (avatarURL) {
            embed.setThumbnail(avatarURL);
          }
        } catch (error) {
          this.logger.debug(`Could not set thumbnail for user ${userId}:`, error);
        }

        // Add rewards if available
        if (badge.rewards && typeof badge.rewards === 'object') {
          const rewardsText: string[] = [];

          if (badge.rewards.xp && typeof badge.rewards.xp === 'number' && badge.rewards.xp > 0) {
            rewardsText.push(`+${badge.rewards.xp} XP`);
          }

          if (
            badge.rewards.coins &&
            typeof badge.rewards.coins === 'number' &&
            badge.rewards.coins > 0
          ) {
            rewardsText.push(`+${badge.rewards.coins} moedas`);
          }

          if (
            badge.rewards.role &&
            typeof badge.rewards.role === 'string' &&
            badge.rewards.role.trim().length > 0
          ) {
            rewardsText.push(`Cargo: ${badge.rewards.role.trim()}`);
          }

          if (rewardsText.length > 0) {
            embed.addFields({
              name: 'Recompensas',
              value: rewardsText.join('\n').slice(0, 1024),
              inline: false,
            });
          }
        }
      } catch (error) {
        this.logger.error(`❌ Failed to build embed for badge ${badge.id}:`, error);
        return;
      }

      // Send notification with fallback
      try {
        await (user as any).send({ embeds: [embed] });
        this.logger.debug(`✅ Badge notification sent to user ${userId} for badge ${badge.id}`);
      } catch (dmError) {
        this.logger.warn(`⚠️ Could not send DM badge notification to user ${userId}:`, dmError);

        // TODO: Implement fallback to notification channel
        // For now, just log the failure
        this.logger.info(
          `📢 Badge notification fallback needed for user ${userId}, badge: ${badge.name}`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send badge notification to user ${userId}:`, error);
    }
  }

  /**
   * Get user badges
   */
  public getUserBadges(userId: string): BadgeDefinition[] {
    const userBadgeIds = this.userBadges.get(userId) || new Set();
    const badges: BadgeDefinition[] = [];

    for (const badgeId of userBadgeIds) {
      const badge = this.badges.get(badgeId);
      if (badge) {
        badges.push(badge);
      }
    }

    return badges.sort((a, b) => {
      const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
      return rarityOrder.indexOf(b.rarity) - rarityOrder.indexOf(a.rarity);
    });
  }

  /**
   * Get all available badges (excluding secret ones for non-owners)
   */
  public getAvailableBadges(includeSecret: boolean = false): BadgeDefinition[] {
    const badges = Array.from(this.badges.values()).filter(
      badge => badge.isActive && (includeSecret || !badge.isSecret)
    );

    return badges.sort((a, b) => {
      const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
      return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
    });
  }

  /**
   * Get badge by ID
   */
  public getBadge(badgeId: string): BadgeDefinition | null {
    return this.badges.get(badgeId) || null;
  }

  /**
   * Check if user has badge
   */
  public hasBadge(userId: string, badgeId: string): boolean {
    return this.userBadges.get(userId)?.has(badgeId) || false;
  }

  /**
   * Get user badge progress
   */
  public getUserProgress(userId: string, badgeId: string): BadgeProgress | null {
    return this.badgeProgress.get(userId)?.get(badgeId) || null;
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
    const totalBadges = this.badges.size;
    const totalAwarded = await this.database.client.userBadge.count();

    const rarityDistribution: Record<string, number> = {};
    const categoryDistribution: Record<string, number> = {};

    for (const badge of this.badges.values()) {
      rarityDistribution[badge.rarity] = (rarityDistribution[badge.rarity] || 0) + 1;
      categoryDistribution[badge.category] = (categoryDistribution[badge.category] || 0) + 1;
    }

    return {
      totalBadges,
      totalAwarded,
      rarityDistribution: rarityDistribution,
      categoryDistribution,
    };
  }

  /**
   * Check all badge progress (called periodically)
   */
  public async checkAllBadgeProgress(): Promise<void> {
    try {
      this.logger.info('Checking badge progress for all users...');

      // Get all users from database
      const users = await this.database.client.user.findMany({
        include: {
          pubgStats: true,
          badges: {
            include: {
              badge: true,
            },
          },
        },
      });

      for (const user of users) {
        const pubgStats = (user as any).pubgStats || [];
        await this.checkUserBadgeProgress(user.id, {
          xp: user.xp || 0,
          coins: user.coins || 0,
          level: this.calculateLevel(user.xp || 0),
          badges_earned: user.badges?.length || 0,
          kills: pubgStats.reduce((sum: number, stat: any) => sum + (stat.kills || 0), 0),
          wins: pubgStats.reduce((sum: number, stat: any) => sum + (stat.wins || 0), 0),
          damage: pubgStats.reduce((sum: number, stat: any) => sum + (stat.damage || 0), 0),
          headshots: pubgStats.reduce((sum: number, stat: any) => sum + (stat.headshots || 0), 0),
          games: pubgStats.reduce((sum: number, stat: any) => sum + (stat.gamesPlayed || 0), 0),
          consecutive_days: 0, // Will be implemented with presence system
          // Add more stats as needed
        });
      }

      this.logger.info('Badge progress check completed');
    } catch (error) {
      this.logger.error('Failed to check badge progress:', error);
    }
  }

  /**
   * Check badge progress for a specific user
   */
  public async checkUserBadgeProgress(
    userId: string,
    userStats: Record<string, number>
  ): Promise<void> {
    try {
      const availableBadges = this.getAvailableBadges(false);

      for (const badge of availableBadges) {
        // Skip if user already has this badge
        if (this.hasBadge(userId, badge.id)) {
          continue;
        }

        // Check if requirements are met
        const requirementsMet = badge.requirements.every(requirement => {
          const currentValue = userStats[requirement.type] || 0;

          switch (requirement.operator) {
            case 'gte':
              return currentValue >= (requirement.value as number);
            case 'lte':
              return currentValue <= (requirement.value as number);
            case 'eq':
              return currentValue === (requirement.value as number);
            case 'between':
              const [min, max] = requirement.value as [number, number];
              return currentValue >= min && currentValue <= max;
            default:
              return false;
          }
        });

        if (requirementsMet) {
          await this.awardBadge(userId, badge.id);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to check badge progress for user ${userId}:`, error);
    }
  }

  /**
   * Calculate level from XP
   */
  private calculateLevel(xp: number): number {
    return Math.floor(Math.sqrt(xp / 100)) + 1;
  }

  /**
   * Create custom badge (admin only)
   */
  public async createCustomBadge(badgeData: Omit<BadgeDefinition, 'createdAt'>): Promise<boolean> {
    try {
      // Check if badge ID already exists
      if (this.badges.has(badgeData.id)) {
        return false;
      }

      // Add to database
      await this.database.client.badge.create({
        data: {
          id: badgeData.id,
          name: badgeData.name,
          description: badgeData.description,
          icon: badgeData.icon,
          category: badgeData.category,
          rarity: badgeData.rarity,
          requirements: JSON.stringify(badgeData.requirements),
          isSecret: badgeData.isSecret,
          isActive: badgeData.isActive,
        },
      });

      // Add to memory
      this.badges.set(badgeData.id, {
        ...badgeData,
        createdAt: new Date(),
      });

      this.logger.info(
        `Custom badge created: ${badgeData.name} (${badgeData.id}) - Category: ${badgeData.category}`
      );

      return true;
    } catch (error) {
      this.logger.error(`Failed to create custom badge ${badgeData.id}:`, error);
      return false;
    }
  }

  /**
   * Remove badge from user
   */
  public async removeBadge(userId: string, badgeId: string): Promise<boolean> {
    try {
      // Remove from database
      await this.database.client.userBadge.deleteMany({
        where: { userId, badgeId },
      });

      // Remove from memory
      this.userBadges.get(userId)?.delete(badgeId);

      this.logger.info(`Badge removed: ${badgeId} from user ${userId}`);

      return true;
    } catch (error) {
      this.logger.error(`Failed to remove badge ${badgeId} from user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get leaderboard of users with most badges
   */
  public getBadgeLeaderboard(limit: number = 10): Array<{ userId: string; badgeCount: number }> {
    const leaderboard: Array<{ userId: string; badgeCount: number }> = [];

    for (const [userId, badges] of this.userBadges) {
      leaderboard.push({ userId, badgeCount: badges.size });
    }

    return leaderboard.sort((a, b) => b.badgeCount - a.badgeCount).slice(0, limit);
  }

  /**
   * Get rarity color for embeds
   */
  public getRarityColor(rarity: string): string {
    return this.rarityColors[rarity] || '#95A5A6';
  }

  /**
   * Get rarity emoji
   */
  public getRarityEmoji(rarity: string): string {
    return this.rarityEmojis[rarity] || '⚪';
  }

  /**
   * Award founder badge (only to founder)
   */
  public async awardFounderBadge(): Promise<boolean> {
    return this.awardBadge(this.FOUNDER_USER_ID, 'founder', true);
  }

  /**
   * Create weapon mastery badges dynamically
   */
  private async createWeaponMasteryBadges(): Promise<Omit<BadgeDefinition, 'createdAt'>[]> {
    const badges: Omit<BadgeDefinition, 'createdAt'>[] = [];

    // Common weapon types and their display names
    const weaponTypes = [
      { key: 'AKM', name: 'AKM', icon: '🔫' },
      { key: 'M416', name: 'M416', icon: '🔫' },
      { key: 'SCAR-L', name: 'SCAR-L', icon: '🔫' },
      { key: 'M16A4', name: 'M16A4', icon: '🔫' },
      { key: 'Kar98k', name: 'Kar98k', icon: '🎯' },
      { key: 'AWM', name: 'AWM', icon: '🎯' },
      { key: 'M24', name: 'M24', icon: '🎯' },
      { key: 'UMP45', name: 'UMP45', icon: '🔫' },
      { key: 'Vector', name: 'Vector', icon: '🔫' },
      { key: 'S12K', name: 'S12K', icon: '💥' },
    ];

    // Create badges for different mastery levels
    const masteryLevels = [
      { level: 20, tier: 'uncommon', name: 'Aprendiz', xp: 100, coins: 500 },
      { level: 40, tier: 'rare', name: 'Especialista', xp: 250, coins: 1000 },
      { level: 60, tier: 'epic', name: 'Veterano', xp: 500, coins: 2000 },
      { level: 80, tier: 'legendary', name: 'Mestre', xp: 1000, coins: 5000 },
      { level: 100, tier: 'mythic', name: 'Lenda', xp: 2000, coins: 10000 },
    ];

    for (const weapon of weaponTypes) {
      for (const mastery of masteryLevels) {
        badges.push({
          id: `weapon_mastery_${weapon.key.toLowerCase()}_${mastery.level}`,
          name: `${mastery.name} ${weapon.name}`,
          description: `Alcançou nível ${mastery.level} de maestria com ${weapon.name}`,
          icon: weapon.icon,
          category: 'pubg',
          rarity: mastery.tier as any,
          requirements: [
            { type: 'kills' as const, operator: 'gte' as const, value: mastery.level * 10 },
          ],
          rewards: {
            xp: mastery.xp,
            coins: mastery.coins,
          },
          isSecret: false,
          isActive: true,
        });
      }
    }

    return badges;
  }

  /**
   * Create survival mastery badges dynamically
   */
  private async createSurvivalMasteryBadges(): Promise<Omit<BadgeDefinition, 'createdAt'>[]> {
    const badges: Omit<BadgeDefinition, 'createdAt'>[] = [];

    const survivalCategories = [
      { key: 'fortitude', name: 'Resistência', icon: '🛡️' },
      { key: 'healing', name: 'Cura', icon: '💊' },
      { key: 'support', name: 'Suporte', icon: '🤝' },
      { key: 'weapons', name: 'Armamento', icon: '⚔️' },
      { key: 'driving', name: 'Condução', icon: '🚗' },
    ];

    const masteryLevels = [
      { level: 20, tier: 'uncommon', name: 'Aprendiz', xp: 100, coins: 500 },
      { level: 40, tier: 'rare', name: 'Especialista', xp: 250, coins: 1000 },
      { level: 60, tier: 'epic', name: 'Veterano', xp: 500, coins: 2000 },
      { level: 80, tier: 'legendary', name: 'Mestre', xp: 1000, coins: 5000 },
      { level: 100, tier: 'mythic', name: 'Lenda', xp: 2000, coins: 10000 },
    ];

    for (const category of survivalCategories) {
      for (const mastery of masteryLevels) {
        badges.push({
          id: `survival_mastery_${category.key}_${mastery.level}`,
          name: `${mastery.name} de ${category.name}`,
          description: `Alcançou nível ${mastery.level} de maestria em ${category.name}`,
          icon: category.icon,
          category: 'pubg',
          rarity: mastery.tier as any,
          requirements: [
            { type: 'games' as const, operator: 'gte' as const, value: mastery.level * 5 },
          ],
          rewards: {
            xp: mastery.xp,
            coins: mastery.coins,
          },
          isSecret: false,
          isActive: true,
        });
      }
    }

    return badges;
  }

  /**
   * Sync badges with PUBG API medals
   */
  public async syncPUBGBadges(): Promise<void> {
    try {
      this.logger.info('Starting PUBG badges synchronization...');

      // Check if we have PUBG service available
      const pubgService = (this.client as any).pubgService;
      if (!pubgService) {
        this.logger.warn('PUBG service not available for badge sync');
        await this.logToChannel('⚠️ **Badge Sync Warning**', {
          event: 'PUBG Badge Sync',
          status: 'Warning',
          message: 'PUBG service not available',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check PUBG service health
      try {
        const healthCheck = await pubgService.healthCheck();
        if (!healthCheck.isHealthy) {
          this.logger.warn('PUBG service is unhealthy, skipping badge sync');
          await this.logToChannel('⚠️ **Badge Sync Warning**', {
            event: 'PUBG Badge Sync',
            status: 'Warning',
            message: 'PUBG service is unhealthy',
            details: healthCheck,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      } catch (error) {
        this.logger.error('Failed to check PUBG service health:', error);
        await this.logToChannel('❌ **Badge Sync Error**', {
          event: 'PUBG Badge Sync',
          status: 'Error',
          message: 'Failed to check PUBG service health',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Get weapon mastery badges
      const weaponMasteryBadges = await this.createWeaponMasteryBadges();

      // Get survival mastery badges
      const survivalMasteryBadges = await this.createSurvivalMasteryBadges();

      // Static PUBG achievement badges
      const staticPubgBadges: Omit<BadgeDefinition, 'createdAt'>[] = [
        {
          id: 'pubg_conqueror',
          name: 'Conquistador PUBG',
          description: 'Alcançou o rank Conquistador no PUBG Ranked',
          icon: '🏆',
          category: 'pubg',
          rarity: 'mythic',
          requirements: [{ type: 'rank' as const, operator: 'gte' as const, value: 2000 }],
          rewards: { xp: 1000, coins: 500, role: 'conqueror' },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_ace',
          name: 'Ace PUBG',
          description: 'Eliminou 4+ inimigos em uma única partida',
          icon: '🎯',
          category: 'pubg',
          rarity: 'epic',
          requirements: [
            {
              type: 'kills' as const,
              operator: 'gte' as const,
              value: 4,
              timeframe: 'daily' as const,
            },
          ],
          rewards: { xp: 500, coins: 250 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_survivor',
          name: 'Sobrevivente PUBG',
          description: 'Sobreviveu até o Top 10 em 100 partidas',
          icon: '🛡️',
          category: 'pubg',
          rarity: 'rare',
          requirements: [{ type: 'games' as const, operator: 'gte' as const, value: 100 }],
          rewards: { xp: 300, coins: 150 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_marksman',
          name: 'Atirador de Elite PUBG',
          description: 'Conseguiu 500+ headshots no PUBG',
          icon: '🎯',
          category: 'pubg',
          rarity: 'rare',
          requirements: [{ type: 'headshots' as const, operator: 'gte' as const, value: 500 }],
          rewards: { xp: 400, coins: 200 },
          isSecret: false,
          isActive: true,
        },
        {
          id: 'pubg_damage_king',
          name: 'Rei do Dano PUBG',
          description: 'Causou mais de 1,000,000 de dano total',
          icon: '💥',
          category: 'pubg',
          rarity: 'epic',
          requirements: [{ type: 'damage' as const, operator: 'gte' as const, value: 1000000 }],
          rewards: { xp: 750, coins: 375 },
          isSecret: false,
          isActive: true,
        },
      ];

      const allBadges = [...staticPubgBadges, ...weaponMasteryBadges, ...survivalMasteryBadges];
      let syncedCount = 0;

      for (const badgeData of allBadges) {
        try {
          // Check if badge already exists
          const existingBadge = await this.database.client.badge.findUnique({
            where: { id: badgeData.id },
          });

          if (existingBadge) {
            // Update existing badge
            await this.database.client.badge.update({
              where: { id: badgeData.id },
              data: {
                name: badgeData.name,
                description: badgeData.description,
                icon: badgeData.icon,
                category: badgeData.category,
                rarity: badgeData.rarity,
                requirements: JSON.stringify(badgeData.requirements),
                isSecret: badgeData.isSecret,
                isActive: badgeData.isActive,
              },
            });
          } else {
            // Create new badge
            await this.database.client.badge.create({
              data: {
                id: badgeData.id,
                name: badgeData.name,
                description: badgeData.description,
                icon: badgeData.icon,
                category: badgeData.category,
                rarity: badgeData.rarity,
                requirements: JSON.stringify(badgeData.requirements),
                isSecret: badgeData.isSecret,
                isActive: badgeData.isActive,
              },
            });
          }

          // Update in memory
          this.badges.set(badgeData.id, {
            ...badgeData,
            createdAt: new Date(),
          });

          syncedCount++;
        } catch (error) {
          this.logger.error(`Failed to sync PUBG badge '${badgeData.name}':`, error);
        }
      }

      // Update cache
      await this.cache.set('pubg_badges_synced', new Date().toISOString(), 86400); // 24h

      // Log successful sync
      await this.logToChannel('✅ **Badge Sync Success**', {
        event: 'PUBG Badge Sync',
        status: 'Success',
        message: `Synced ${syncedCount}/${allBadges.length} badges`,
        details: {
          weaponMastery: weaponMasteryBadges.length,
          survivalMastery: survivalMasteryBadges.length,
          static: staticPubgBadges.length,
          total: allBadges.length,
          synced: syncedCount,
        },
        timestamp: new Date().toISOString(),
      });

      this.logger.info(
        `PUBG badges synchronization completed. Synced ${syncedCount}/${allBadges.length} badges (${weaponMasteryBadges.length} weapon mastery, ${survivalMasteryBadges.length} survival mastery, ${staticPubgBadges.length} static)`
      );
    } catch (error) {
      this.logger.error('Failed to sync PUBG badges:', error);

      // Log error to Discord
      await this.logToChannel('❌ **Badge Sync Error**', {
        event: 'PUBG Badge Sync',
        status: 'Error',
        message: 'Failed to sync PUBG badges',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Check and award PUBG badges based on user stats
   */
  public async checkPUBGBadges(userId: string, pubgStats: any): Promise<string[]> {
    try {
      if (!pubgStats) {
        this.logger.warn(`No PUBG stats provided for user ${userId}`);
        return [];
      }

      const awardedBadges: string[] = [];

      // Get PUBG badges
      const pubgBadges = Array.from(this.badges.values()).filter(
        badge => badge.category === 'pubg' && badge.isActive
      );

      if (pubgBadges.length === 0) {
        this.logger.warn('No active PUBG badges found');
        return [];
      }

      for (const badge of pubgBadges) {
        // Skip if user already has this badge
        if (this.hasBadge(userId, badge.id)) {
          continue;
        }

        // Check requirements
        const requirementsMet = badge.requirements.every(requirement => {
          const statValue = this.getPUBGStatValue(pubgStats, requirement.type);

          switch (requirement.operator) {
            case 'gte':
              return statValue >= (requirement.value as number);
            case 'lte':
              return statValue <= (requirement.value as number);
            case 'eq':
              return statValue === (requirement.value as number);
            case 'between':
              const [min, max] = requirement.value as [number, number];
              return statValue >= min && statValue <= max;
            default:
              return false;
          }
        });

        if (requirementsMet) {
          const awarded = await this.awardBadge(userId, badge.id);
          if (awarded) {
            awardedBadges.push(badge.name);
          }
        }
      }

      // Log badge check if any badges were awarded
      if (awardedBadges.length > 0) {
        await this.logToChannel('🏆 **PUBG Badges Awarded**', {
          event: 'PUBG Badge Check',
          status: 'Success',
          userId: userId,
          badges: awardedBadges,
          stats: {
            kills: pubgStats.kills || 0,
            wins: pubgStats.wins || 0,
            games: pubgStats.roundsPlayed || 0,
            rank: pubgStats.currentRankPoint || 0,
          },
          timestamp: new Date().toISOString(),
        });
      }

      return awardedBadges;
    } catch (error) {
      this.logger.error(`Failed to check PUBG badges for user ${userId}:`, error);

      // Log error to Discord
      await this.logToChannel('❌ **Badge Check Error**', {
        event: 'PUBG Badge Check',
        status: 'Error',
        userId: userId,
        message: 'Failed to check PUBG badges',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      return [];
    }
  }

  /**
   * Log events to Discord channel
   */
  private async logToChannel(title: string, data: any): Promise<void> {
    try {
      const logChannelId = process.env.LOGS_API_CHANNEL_ID;
      if (!logChannelId) {
        this.logger.warn('LOGS_API_CHANNEL_ID not configured');
        return;
      }

      const channel = (await this.client.channels.fetch(logChannelId)) as TextChannel;
      if (!channel) {
        this.logger.warn(`Log channel ${logChannelId} not found`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setTimestamp()
        .setColor(
          data.status === 'Success' ? '#00FF00' : data.status === 'Warning' ? '#FFA500' : '#FF0000'
        );

      // Add fields based on data
      if (data.event) {
        embed.addFields({ name: 'Event', value: data.event, inline: true });
      }
      if (data.status) {
        embed.addFields({ name: 'Status', value: data.status, inline: true });
      }
      if (data.userId) {
        embed.addFields({ name: 'User ID', value: data.userId, inline: true });
      }
      if (data.message) {
        embed.addFields({ name: 'Message', value: data.message, inline: false });
      }
      if (data.error) {
        embed.addFields({ name: 'Error', value: `\`\`\`${data.error}\`\`\``, inline: false });
      }

      if (data.details) {
        embed.addFields({
          name: 'Details',
          value: `\`\`\`json\n${JSON.stringify(data.details, null, 2)}\`\`\``,
          inline: false,
        });
      }

      if (data.badges && Array.isArray(data.badges)) {
        embed.addFields({ name: 'Badges Awarded', value: data.badges.join(', '), inline: false });
      }

      if (data.stats) {
        embed.addFields({
          name: 'Stats',
          value: `\`\`\`json\n${JSON.stringify(data.stats, null, 2)}\`\`\``,
          inline: false,
        });
      }

      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Failed to log to Discord channel:', error);
    }
  }

  /**
   * Get PUBG stat value by requirement type
   */
  private getPUBGStatValue(pubgStats: any, requirementType: string): number {
    if (!pubgStats) {
      return 0;
    }

    switch (requirementType) {
      case 'kills':
        return pubgStats.kills || 0;
      case 'wins':
        return pubgStats.wins || 0;
      case 'games':
        return pubgStats.roundsPlayed || 0;
      case 'damage':
        return pubgStats.damageDealt || 0;
      case 'headshots':
        return pubgStats.headshotKills || 0;
      case 'rank':
        return pubgStats.currentRankPoint || 0;
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
        const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
        return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
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
    try {
      const userBadges = this.getUserBadges(userId);

      const stats = {
        total: userBadges.length,
        byRarity: {
          common: 0,
          uncommon: 0,
          rare: 0,
          epic: 0,
          legendary: 0,
          mythic: 0,
        },
        byCategory: {} as Record<string, number>,
        rarest: null as BadgeDefinition | null,
      };

      let rarestRarityValue = 0;
      const rarityValues = {
        common: 1,
        uncommon: 2,
        rare: 3,
        epic: 4,
        legendary: 5,
        mythic: 6,
      };

      for (const badge of userBadges) {
        // Count by rarity
        stats.byRarity[badge.rarity]++;

        // Count by category
        stats.byCategory[badge.category] = (stats.byCategory[badge.category] || 0) + 1;

        // Find rarest
        const rarityValue = rarityValues[badge.rarity];
        if (rarityValue > rarestRarityValue) {
          rarestRarityValue = rarityValue;
          stats.rarest = badge;
        }
      }

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get badge stats for user ${userId}:`, error);
      return {
        total: 0,
        byRarity: {
          common: 0,
          uncommon: 0,
          rare: 0,
          epic: 0,
          legendary: 0,
          mythic: 0,
        },
        byCategory: {},
        rarest: null,
      };
    }
  }

  /**
   * Clear badge cache for user or globally
   */
  public async clearBadgeCache(userId?: string): Promise<void> {
    try {
      if (userId) {
        // Clear specific user cache
        await this.cache.del(`user_badges_${userId}`);
        await this.cache.del(`user_badge_progress_${userId}`);
        this.logger.debug(`🧹 Cleared badge cache for user ${userId}`);
      } else {
        // Clear all badge-related cache
        const cacheKeys = [
          'badge_stats',
          'badge_leaderboard',
          'available_badges',
          'badge_categories',
        ];

        for (const key of cacheKeys) {
          await this.cache.del(key);
        }

        this.logger.info('🧹 Cleared all badge cache');
      }
    } catch (error) {
      this.logger.error('❌ Failed to clear badge cache:', error);
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
      // Check badge definitions
      const badgeIds = Array.from(this.badges.keys());
      const activeBadges = Array.from(this.badges.values()).filter(b => b.isActive);

      if (badgeIds.length === 0) {
        issues.push('No badge definitions found');
      }

      // Check for badges with invalid properties
      for (const [id, badge] of this.badges) {
        if (!badge.name || badge.name.trim().length === 0) {
          issues.push(`Badge ${id} has invalid name`);
        }

        if (!badge.description || badge.description.trim().length === 0) {
          issues.push(`Badge ${id} has invalid description`);
        }

        if (!badge.requirements || badge.requirements.length === 0) {
          issues.push(`Badge ${id} has no requirements`);
        }

        if (!this.rarityColors[badge.rarity]) {
          issues.push(`Badge ${id} has invalid rarity: ${badge.rarity}`);
        }
      }

      // Check user badges for orphaned references
      let totalUserBadges = 0;
      for (const [userId, userBadgeSet] of this.userBadges) {
        for (const badgeId of userBadgeSet) {
          totalUserBadges++;
          if (!this.badges.has(badgeId)) {
            orphanedUserBadges++;
            issues.push(`User ${userId} has orphaned badge: ${badgeId}`);
          }
        }
      }

      // Check database consistency (if available)
      if (this.database?.client) {
        try {
          const dbBadgeCount = await this.database.client.badge.count();
          const memoryBadgeCount = this.badges.size;

          if (dbBadgeCount !== memoryBadgeCount) {
            issues.push(
              `Database badge count (${dbBadgeCount}) doesn't match memory (${memoryBadgeCount})`
            );
          }
        } catch (error) {
          issues.push(
            `Failed to validate database consistency: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      const stats = {
        totalBadges: badgeIds.length,
        activeBadges: activeBadges.length,
        userBadgesCount: totalUserBadges,
        orphanedUserBadges,
      };

      const isValid = issues.length === 0;

      if (isValid) {
        this.logger.info('✅ Badge system integrity validation passed');
      } else {
        this.logger.warn(`⚠️ Badge system integrity validation found ${issues.length} issues`);
      }

      return { isValid, issues, stats };
    } catch (error) {
      this.logger.error('❌ Failed to validate badge integrity:', error);
      return {
        isValid: false,
        issues: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
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

      const rarityStats: Record<string, { count: number; awarded: number }> = {};
      const categoryStats: Record<string, { count: number; awarded: number }> = {};
      const badgeHolders: Record<string, number> = {};

      // Initialize stats
      for (const badge of this.badges.values()) {
        if (!rarityStats[badge.rarity]) {
          rarityStats[badge.rarity] = { count: 0, awarded: 0 };
        }
        rarityStats[badge.rarity]!.count++;

        if (!categoryStats[badge.category]) {
          categoryStats[badge.category] = { count: 0, awarded: 0 };
        }
        categoryStats[badge.category]!.count++;

        badgeHolders[badge.id] = 0;
      }

      // Count awarded badges
      for (const userBadgeSet of this.userBadges.values()) {
        totalAwarded += userBadgeSet.size;

        for (const badgeId of userBadgeSet) {
          const badge = this.badges.get(badgeId);
          if (badge) {
            rarityStats[badge.rarity]!.awarded++;
            categoryStats[badge.category]!.awarded++;
            badgeHolders[badgeId]!++;
          }
        }
      }

      // Calculate percentages and create distribution
      const rarityDistribution: Record<
        string,
        { count: number; awarded: number; percentage: number }
      > = {};
      for (const [rarity, stats] of Object.entries(rarityStats)) {
        rarityDistribution[rarity] = {
          ...stats,
          percentage: totalAwarded > 0 ? (stats.awarded / totalAwarded) * 100 : 0,
        };
      }

      const categoryDistribution: Record<
        string,
        { count: number; awarded: number; percentage: number }
      > = {};
      for (const [category, stats] of Object.entries(categoryStats)) {
        categoryDistribution[category] = {
          ...stats,
          percentage: totalAwarded > 0 ? (stats.awarded / totalAwarded) * 100 : 0,
        };
      }

      // Get top badges by holder count
      const topBadges = Object.entries(badgeHolders)
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

      // Get users with most rare badges
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
          averageBadgesPerUser: Math.round(averageBadgesPerUser * 100) / 100,
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
   * Cleanup orphaned user badges
   */
  public async cleanupOrphanedBadges(): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      for (const [userId, userBadgeSet] of this.userBadges) {
        const badgesToRemove: string[] = [];

        for (const badgeId of userBadgeSet) {
          if (!this.badges.has(badgeId)) {
            badgesToRemove.push(badgeId);
          }
        }

        for (const badgeId of badgesToRemove) {
          try {
            userBadgeSet.delete(badgeId);

            // Remove from database if available
            if (this.database?.client) {
              await this.database.client.userBadge.deleteMany({
                where: {
                  userId,
                  badgeId,
                },
              });
            }

            cleaned++;
            this.logger.debug(`🧹 Removed orphaned badge ${badgeId} from user ${userId}`);
          } catch (error) {
            errors.push(
              `Failed to remove badge ${badgeId} from user ${userId}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        // Remove empty user badge sets
        if (userBadgeSet.size === 0) {
          this.userBadges.delete(userId);
        }
      }

      if (cleaned > 0) {
        this.logger.info(`🧹 Cleaned up ${cleaned} orphaned badges`);
      }

      return { cleaned, errors };
    } catch (error) {
      this.logger.error('❌ Failed to cleanup orphaned badges:', error);
      return { cleaned, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }
}
