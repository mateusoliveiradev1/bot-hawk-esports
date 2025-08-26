import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { ExtendedClient } from '../types/client';
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
  type: 'kills' | 'wins' | 'games' | 'rank' | 'streak' | 'damage' | 'headshots' | 
        'messages' | 'voice_time' | 'reactions' | 'invites' | 'quiz_score' | 
        'mini_game_wins' | 'clips_uploaded' | 'clips_votes' | 'check_ins' | 
        'consecutive_days' | 'level' | 'coins_earned' | 'badges_earned';
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
  
  private badges: Map<string, BadgeDefinition> = new Map();
  private userBadges: Map<string, Set<string>> = new Map(); // userId -> badgeIds
  private badgeProgress: Map<string, Map<string, BadgeProgress>> = new Map(); // userId -> badgeId -> progress
  
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

  constructor(client: ExtendedClient) {
    this.logger = new Logger();
    this.cache = new CacheService();
    this.database = new DatabaseService();
    this.client = client;
    
    this.initializeBadges();
    this.loadUserBadges();
    this.startProgressTracker();
  }

  /**
   * Initialize all badge definitions
   */
  private async initializeBadges(): Promise<void> {
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
        description: 'Um dos primeiros membros do servidor',
        icon: '🌟',
        category: 'special',
        rarity: 'mythic',
        requirements: [], // Manually awarded
        rewards: { role: 'founder' },
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
    
    this.logger.info(`Initialized ${this.badges.size} badges`);
  }

  /**
   * Load user badges from database
   */
  private async loadUserBadges(): Promise<void> {
    try {
      const userBadges = await this.database.client.userBadge.findMany();
      
      for (const userBadge of userBadges) {
        if (!this.userBadges.has(userBadge.userId)) {
          this.userBadges.set(userBadge.userId, new Set());
        }
        this.userBadges.get(userBadge.userId)!.add(userBadge.badgeId);
      }
      
      this.logger.info(`Loaded badges for ${this.userBadges.size} users`);
    } catch (error) {
      this.logger.error('Failed to load user badges:', error);
    }
  }

  /**
   * Start progress tracker for automatic badge checking
   */
  private startProgressTracker(): void {
    // Check badge progress every 5 minutes
    setInterval(async () => {
      await this.checkAllBadgeProgress();
    }, 5 * 60 * 1000);
  }

  /**
   * Update user progress for badge requirements
   */
  public async updateProgress(
    userId: string,
    requirementType: string,
    value: number,
    operation: 'set' | 'increment' = 'increment',
  ): Promise<void> {
    if (!this.badgeProgress.has(userId)) {
      this.badgeProgress.set(userId, new Map());
    }
    
    const userProgress = this.badgeProgress.get(userId)!;
    
    // Update progress for all relevant badges
    for (const [badgeId, badge] of this.badges) {
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
      progress.requirements.set(requirementType, newValue);
      
      // Check if badge requirements are met
      if (this.checkBadgeRequirements(badge, progress.requirements)) {
        await this.awardBadge(userId, badgeId);
      }
    }
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
   * Award badge to user
   */
  public async awardBadge(userId: string, badgeId: string, notify: boolean = true): Promise<boolean> {
    try {
      // Check if user already has this badge
      if (this.userBadges.get(userId)?.has(badgeId)) {
        return false;
      }
      
      const badge = this.badges.get(badgeId);
      if (!badge) {
        this.logger.error(`Badge not found: ${badgeId}`);
        return false;
      }
      
      // Add to database
      await this.database.client.userBadge.create({
        data: {
          userId,
          badgeId,
          earnedAt: new Date(),
        },
      });
      
      // Add to memory
      if (!this.userBadges.has(userId)) {
        this.userBadges.set(userId, new Set());
      }
      this.userBadges.get(userId)!.add(badgeId);
      
      // Award rewards
      if (badge.rewards) {
        await this.awardBadgeRewards(userId, badge.rewards);
      }
      
      // Send notification
      if (notify) {
        await this.sendBadgeNotification(userId, badge);
      }
      
      this.logger.info(`Badge awarded: ${badge.name} (${badgeId}) to user ${userId} - Rarity: ${badge.rarity}`);
      
      // Check for collector badge
      const userBadgeCount = this.userBadges.get(userId)?.size || 0;
      if (userBadgeCount >= 25) {
        await this.updateProgress(userId, 'badges_earned', userBadgeCount, 'set');
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to award badge ${badgeId} to user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Award badge rewards
   */
  private async awardBadgeRewards(userId: string, rewards: any): Promise<void> {
    try {
      // Award XP
      if (rewards.xp) {
        await this.database.users.updateXP(userId, rewards.xp);
        this.logger.info(`XP awarded to user ${userId}: ${rewards.xp}`);
      }
      
      // Award coins
      if (rewards.coins) {
        await this.database.users.updateCoins(userId, rewards.coins, 'Badge reward');
        this.logger.info(`Coins awarded to user ${userId}: ${rewards.coins}`);
      }
      
      // Award role (would integrate with role management)
      if (rewards.role) {
        // This would call the role service to assign role
        this.logger.info(`Role awarded to user ${userId}: ${rewards.role}`);
      }
      
      this.logger.info(`Rewards awarded to user ${userId}:`, rewards);
    } catch (error) {
      this.logger.error(`Failed to award rewards to user ${userId}:`, error);
    }
  }

  /**
   * Send badge notification to user
   */
  private async sendBadgeNotification(userId: string, badge: BadgeDefinition): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) {
        return;
      }
      
      const embed = new EmbedBuilder()
        .setTitle('🎉 Nova Badge Conquistada!')
        .setDescription(`Parabéns! Você conquistou a badge **${badge.name}**!`)
        .addFields(
          { name: 'Descrição', value: badge.description, inline: false },
          { name: 'Raridade', value: `${this.rarityEmojis[badge.rarity]} ${badge.rarity.toUpperCase()}`, inline: true },
          { name: 'Categoria', value: badge.category.toUpperCase(), inline: true },
        )
        .setColor((this.rarityColors[badge.rarity] || '#95A5A6') as any)
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();
      
      if (badge.rewards) {
        let rewardsText = '';
        if (badge.rewards.xp) {
          rewardsText += `+${badge.rewards.xp} XP\n`;
        }
        if (badge.rewards.coins) {
          rewardsText += `+${badge.rewards.coins} moedas\n`;
        }
        if (badge.rewards.role) {
          rewardsText += `Cargo: ${badge.rewards.role}\n`;
        }
        
        if (rewardsText) {
          embed.addFields({ name: 'Recompensas', value: rewardsText, inline: false });
        }
      }
      
      await user.send({ embeds: [embed] }).catch(() => {
        // If DM fails, could send to a notification channel
        this.logger.warn(`Could not send badge notification to user ${userId}`);
      });
      
      // Badge notification sent successfully
      
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
    const badges = Array.from(this.badges.values())
      .filter(badge => badge.isActive && (includeSecret || !badge.isSecret));
    
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
    raretyDistribution: Record<string, number>;
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
      raretyDistribution: rarityDistribution,
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
  public async checkUserBadgeProgress(userId: string, userStats: Record<string, number>): Promise<void> {
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
      
      this.logger.info(`Custom badge created: ${badgeData.name} (${badgeData.id}) - Category: ${badgeData.category}`);
      
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
    
    return leaderboard
      .sort((a, b) => b.badgeCount - a.badgeCount)
      .slice(0, limit);
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
}