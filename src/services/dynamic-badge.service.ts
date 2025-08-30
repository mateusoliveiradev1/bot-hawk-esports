import { ExtendedClient } from '../types/client';
import { Logger } from '../utils/logger';
import { BadgeService } from './badge.service';
import { PUBGService } from './pubg.service';
import { DatabaseService } from '../database/database.service';
import { CacheService } from './cache.service';

export interface DynamicBadgeRule {
  id: string;
  name: string;
  description: string;
  condition: string; // JavaScript condition to evaluate
  badgeTemplate: {
    name: string;
    description: string;
    icon: string;
    category: 'pubg' | 'achievement' | 'social' | 'special';
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
    xpReward?: number;
          coinReward?: number;
          roleReward?: string;
          titleReward?: string;
  };
  cooldown: number; // Minutes between checks
  maxAwards: number; // Max times this can be awarded per user
  frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  isActive: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  requirements?: {
    minRank?: number;
    minKills?: number;
    minGames?: number;
    seasonOnly?: boolean;
  };
}

export interface PUBGStatsContext {
  userId: string;
  currentStats: any;
  dailyStats: any;
  weeklyStats: any;
  seasonStats: any;
  recentMatches: any[];
  rankingData: any;
  weaponStats: any;
  isWeekend: boolean;
  currentHour: number;
  timeframe: 'daily' | 'weekly' | 'monthly' | 'seasonal';
}

export class DynamicBadgeService {
  private client: ExtendedClient;
  private logger: Logger;
  private badgeService: BadgeService;
  private pubgService: PUBGService;
  private database: DatabaseService;
  private cache: CacheService;
  private dynamicRules: Map<string, DynamicBadgeRule> = new Map();
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    client: ExtendedClient,
    badgeService: BadgeService,
    pubgService: PUBGService
  ) {
    this.client = client;
    this.logger = new Logger();
    this.badgeService = badgeService;
    this.pubgService = pubgService;
    this.database = (client as any).database;
    this.cache = (client as any).cache;
    
    this.initializeDynamicRules();
    this.startAutomaticProcessing();
  }

  /**
   * Initialize dynamic badge rules
   */
  private initializeDynamicRules(): void {
    const rules: DynamicBadgeRule[] = [
      {
        id: 'hot_streak',
        name: 'Sequência Quente',
        description: 'Venceu 3 partidas consecutivas',
        condition: 'currentStats.consecutiveWins >= 3',
        badgeTemplate: {
          name: 'Sequência Quente',
          description: 'Venceu 3 partidas consecutivas no PUBG',
          icon: '🔥',
          category: 'pubg',
          rarity: 'rare',
          xpReward: 300,
          coinReward: 150
        },
        cooldown: 1440, // 24 hours
        maxAwards: 50,
        frequency: 'realtime',
        isActive: true,
        priority: 'high'
      },
      {
        id: 'daily_dominator',
        name: 'Dominador Diário',
        description: 'Mais de 10 kills em um único dia',
        condition: 'dailyStats.kills >= 10',
        badgeTemplate: {
          name: 'Dominador Diário',
          description: 'Conseguiu 10+ kills em um único dia',
          icon: '💀',
          category: 'pubg',
          rarity: 'epic',
          xpReward: 500,
          coinReward: 250
        },
        cooldown: 1440, // 24 hours
        maxAwards: 365, // Once per day
        frequency: 'daily',
        isActive: true,
        priority: 'high'
      },
      {
        id: 'headshot_machine',
        name: 'Máquina de Headshot',
        description: '80%+ de headshots em uma sessão',
        condition: 'currentStats.headshotRatio >= 0.8 && currentStats.kills >= 5',
        badgeTemplate: {
          name: 'Máquina de Headshot',
          description: 'Conseguiu 80%+ de headshots com 5+ kills',
          icon: '🎯',
          category: 'pubg',
          rarity: 'legendary',
          xpReward: 750,
          coinReward: 375
        },
        cooldown: 720, // 12 hours
        maxAwards: 100,
        frequency: 'realtime',
        isActive: true,
        priority: 'critical'
      },
      {
        id: 'rank_climber',
        name: 'Escalador de Rank',
        description: 'Subiu 200+ pontos de rank em uma semana',
        condition: 'weeklyStats.rankImprovement >= 200',
        badgeTemplate: {
          name: 'Escalador de Rank',
          description: 'Subiu 200+ pontos de rank em uma semana',
          icon: '📈',
          category: 'pubg',
          rarity: 'epic',
          xpReward: 600,
          coinReward: 300,
          roleReward: 'rank_climber'
        },
        cooldown: 10080, // 1 week
        maxAwards: 52, // Once per week
        frequency: 'weekly',
        isActive: true,
        priority: 'high'
      },
      {
        id: 'weekend_warrior',
        name: 'Guerreiro de Fim de Semana',
        description: 'Jogou 15+ partidas no fim de semana',
        condition: 'isWeekend && weeklyStats.weekendGames >= 15',
        badgeTemplate: {
          name: 'Guerreiro de Fim de Semana',
          description: 'Jogou 15+ partidas durante o fim de semana',
          icon: '⚔️',
          category: 'pubg',
          rarity: 'uncommon',
          xpReward: 400,
          coinReward: 200
        },
        cooldown: 10080, // 1 week
        maxAwards: 52,
        frequency: 'weekly',
        isActive: true,
        priority: 'medium'
      },
      {
        id: 'clutch_master',
        name: 'Mestre do Clutch',
        description: 'Venceu uma partida sendo o último da squad',
        condition: 'recentMatches.some(match => match.clutchWin === true)',
        badgeTemplate: {
          name: 'Mestre do Clutch',
          description: 'Venceu uma partida sendo o último da squad',
          icon: '🏆',
          category: 'pubg',
          rarity: 'legendary',
          xpReward: 1000,
          coinReward: 500,
          titleReward: 'Clutch Master'
        },
        cooldown: 2880, // 48 hours
        maxAwards: 25,
        frequency: 'realtime',
        isActive: true,
        priority: 'critical'
      },
      {
        id: 'damage_dealer',
        name: 'Causador de Dano',
        description: 'Causou 2000+ de dano em uma partida',
        condition: 'recentMatches.some(match => match.damageDealt >= 2000)',
        badgeTemplate: {
          name: 'Causador de Dano',
          description: 'Causou 2000+ de dano em uma única partida',
          icon: '💥',
          category: 'pubg',
          rarity: 'rare',
          xpReward: 350,
          coinReward: 175
        },
        cooldown: 720, // 12 hours
        maxAwards: 100,
        frequency: 'realtime',
        isActive: true,
        priority: 'medium'
      },
      {
        id: 'survival_expert',
        name: 'Especialista em Sobrevivência',
        description: 'Top 10 em 5 partidas consecutivas',
        condition: 'currentStats.consecutiveTop10 >= 5',
        badgeTemplate: {
          name: 'Especialista em Sobrevivência',
          description: 'Ficou no Top 10 em 5 partidas consecutivas',
          icon: '🛡️',
          category: 'pubg',
          rarity: 'epic',
          xpReward: 500,
          coinReward: 250,
          roleReward: 'survival_expert'
        },
        cooldown: 1440, // 24 hours
        maxAwards: 30,
        frequency: 'realtime',
        isActive: true,
        priority: 'high'
      }
    ];

    for (const rule of rules) {
      this.dynamicRules.set(rule.id, rule);
    }

    this.logger.info(`Initialized ${rules.length} dynamic badge rules`);
  }

  /**
   * Start automatic processing of dynamic badges
   */
  private startAutomaticProcessing(): void {
    // Process realtime badges every 5 minutes
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processRealtimeBadges();
      }
    }, 5 * 60 * 1000);

    // Process daily badges every hour
    setInterval(async () => {
      if (new Date().getMinutes() === 0) { // On the hour
        await this.processDailyBadges();
      }
    }, 60 * 60 * 1000);

    // Process weekly badges every day at midnight
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        await this.processWeeklyBadges();
      }
    }, 60 * 60 * 1000);

    this.logger.info('Dynamic badge processing started');
  }

  /**
   * Process realtime dynamic badges
   */
  public async processRealtimeBadges(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    try {
      const realtimeRules = Array.from(this.dynamicRules.values())
        .filter(rule => rule.frequency === 'realtime' && rule.isActive);

      const activeUsers = await this.getActiveUsers();
      
      for (const user of activeUsers) {
        try {
          const context = await this.buildStatsContext(user.id);
          await this.processUserBadges(user.id, realtimeRules, context);
        } catch (error) {
          this.logger.error(`Failed to process realtime badges for user ${user.id}:`, error);
        }
      }

      this.logger.info(`Processed realtime badges for ${activeUsers.length} users`);
    } catch (error) {
      this.logger.error('Failed to process realtime badges:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process daily dynamic badges
   */
  public async processDailyBadges(): Promise<void> {
    try {
      const dailyRules = Array.from(this.dynamicRules.values())
        .filter(rule => rule.frequency === 'daily' && rule.isActive);

      const activeUsers = await this.getActiveUsers();
      
      for (const user of activeUsers) {
        try {
          const context = await this.buildStatsContext(user.id);
          await this.processUserBadges(user.id, dailyRules, context);
        } catch (error) {
          this.logger.error(`Failed to process daily badges for user ${user.id}:`, error);
        }
      }

      this.logger.info(`Processed daily badges for ${activeUsers.length} users`);
    } catch (error) {
      this.logger.error('Failed to process daily badges:', error);
    }
  }

  /**
   * Process weekly dynamic badges
   */
  public async processWeeklyBadges(): Promise<void> {
    try {
      const weeklyRules = Array.from(this.dynamicRules.values())
        .filter(rule => rule.frequency === 'weekly' && rule.isActive);

      const activeUsers = await this.getActiveUsers();
      
      for (const user of activeUsers) {
        try {
          const context = await this.buildStatsContext(user.id);
          await this.processUserBadges(user.id, weeklyRules, context);
        } catch (error) {
          this.logger.error(`Failed to process weekly badges for user ${user.id}:`, error);
        }
      }

      this.logger.info(`Processed weekly badges for ${activeUsers.length} users`);
    } catch (error) {
      this.logger.error('Failed to process weekly badges:', error);
    }
  }

  /**
   * Process badges for a specific user
   */
  private async processUserBadges(
    userId: string, 
    rules: DynamicBadgeRule[], 
    context: PUBGStatsContext
  ): Promise<string[]> {
    const awardedBadges: string[] = [];

    for (const rule of rules) {
      try {
        // Check cooldown
        const cooldownKey = `dynamic_badge_${rule.id}_${userId}`;
        const lastAwarded = await this.cache.get(cooldownKey);
        if (lastAwarded && Date.now() - parseInt(lastAwarded as string) < rule.cooldown * 60 * 1000) {
          continue;
        }

        // Check max awards
        const awardCount = await this.getUserBadgeCount(userId, rule.id);
        if (awardCount >= rule.maxAwards) {
          continue;
        }

        // Evaluate condition
        const conditionMet = this.evaluateCondition(rule.condition, context);
        if (conditionMet) {
          const badgeId = `dynamic_${rule.id}`;
          
          // Create or update badge definition
          await this.ensureBadgeExists(badgeId, rule.badgeTemplate);
          
          // Award the badge
          const awarded = await this.badgeService.awardBadge(userId, badgeId);
          if (awarded) {
            awardedBadges.push(rule.badgeTemplate.name);
            await this.cache.set(cooldownKey, Date.now().toString(), rule.cooldown * 60);
            
            // Send notification
            await this.sendBadgeNotification(userId, rule);
            
            this.logger.info(`Awarded dynamic badge '${rule.name}' to user ${userId}`);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to process rule ${rule.id} for user ${userId}:`, error);
      }
    }

    return awardedBadges;
  }

  /**
   * Build stats context for a user
   */
  private async buildStatsContext(userId: string): Promise<PUBGStatsContext> {
    try {
      // Get user's PUBG data
      const user = await this.database.client.user.findUnique({
        where: { id: userId },
        include: {
          pubgStats: true,
          badges: true
        }
      });

      if (!user || !user.pubgUsername) {
        throw new Error('User not found or no PUBG username');
      }

      // Get current stats from PUBG API (simplified for now)
      const currentStats = {};

      // Get recent matches (simplified for now)
      const recentMatches: any[] = [];

      // Calculate daily/weekly stats
      const dailyStats = this.calculateDailyStats(recentMatches);
      const weeklyStats = this.calculateWeeklyStats(recentMatches);
      const seasonStats = user.pubgStats?.[0] || {};

      return {
        userId,
        currentStats,
        dailyStats,
        weeklyStats,
        seasonStats,
        recentMatches,
        rankingData: {},
        weaponStats: {},
        isWeekend: [0, 6].includes(new Date().getDay()),
        currentHour: new Date().getHours(),
        timeframe: 'daily'
      };
    } catch (error) {
      this.logger.error(`Failed to build stats context for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate daily stats from recent matches
   */
  private calculateDailyStats(matches: any[]): any {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayMatches = matches.filter(match => {
      const matchDate = new Date(match.createdAt);
      return matchDate >= today;
    });

    return {
      kills: todayMatches.reduce((sum, match) => sum + (match.kills || 0), 0),
      games: todayMatches.length,
      wins: todayMatches.filter(match => match.winPlace === 1).length,
      top10: todayMatches.filter(match => match.winPlace <= 10).length,
      damage: todayMatches.reduce((sum, match) => sum + (match.damageDealt || 0), 0),
      headshotKills: todayMatches.reduce((sum, match) => sum + (match.headshotKills || 0), 0)
    };
  }

  /**
   * Calculate weekly stats from recent matches
   */
  private calculateWeeklyStats(matches: any[]): any {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weekMatches = matches.filter(match => {
      const matchDate = new Date(match.createdAt);
      return matchDate >= weekAgo;
    });

    const weekendMatches = weekMatches.filter(match => {
      const matchDate = new Date(match.createdAt);
      return [0, 6].includes(matchDate.getDay());
    });

    return {
      kills: weekMatches.reduce((sum, match) => sum + (match.kills || 0), 0),
      games: weekMatches.length,
      wins: weekMatches.filter(match => match.winPlace === 1).length,
      weekendGames: weekendMatches.length,
      rankImprovement: this.calculateRankImprovement(weekMatches)
    };
  }

  /**
   * Calculate rank improvement from matches
   */
  private calculateRankImprovement(matches: any[]): number {
    if (matches.length < 2) return 0;
    
    const firstMatch = matches[matches.length - 1];
    const lastMatch = matches[0];
    
    const firstRank = firstMatch.rankPoints || 0;
    const lastRank = lastMatch.rankPoints || 0;
    
    return lastRank - firstRank;
  }

  /**
   * Evaluate condition string with context
   */
  private evaluateCondition(condition: string, context: PUBGStatsContext): boolean {
    try {
      // Create a safe evaluation context
      const evalContext = {
        currentStats: context.currentStats || {},
        dailyStats: context.dailyStats || {},
        weeklyStats: context.weeklyStats || {},
        seasonStats: context.seasonStats || {},
        recentMatches: context.recentMatches || [],
        rankingData: context.rankingData || {},
        weaponStats: context.weaponStats || {},
        isWeekend: context.isWeekend,
        currentHour: context.currentHour,
        timeframe: context.timeframe
      };

      // Use Function constructor for safer evaluation
      const func = new Function(...Object.keys(evalContext), `return ${condition}`);
      return func(...Object.values(evalContext));
    } catch (error) {
      this.logger.error(`Failed to evaluate condition '${condition}':`, error);
      return false;
    }
  }

  /**
   * Get active users with PUBG data
   */
  private async getActiveUsers(): Promise<any[]> {
    return this.database.client.user.findMany({
        where: {
          pubgUsername: { not: null },
          isVerified: true
        },
        take: 100, // Limit to avoid overwhelming the system
        orderBy: {
          lastSeen: 'desc'
        }
      });
  }

  /**
   * Get user badge count for a specific rule
   */
  private async getUserBadgeCount(userId: string, ruleId: string): Promise<number> {
    const badgeId = `dynamic_${ruleId}`;
    const count = await this.database.client.userBadge.count({
      where: {
        userId,
        badgeId
      }
    });
    return count;
  }

  /**
   * Ensure badge exists in the system
   */
  private async ensureBadgeExists(badgeId: string, template: DynamicBadgeRule['badgeTemplate']): Promise<void> {
    try {
      await this.database.client.badge.upsert({
        where: { id: badgeId },
        update: {
          name: template.name,
          description: template.description,
          icon: template.icon,
          category: template.category,
          rarity: template.rarity,
          // Rewards are handled separately in the badge awarding logic
          isActive: true
        },
        create: {
          id: badgeId,
          name: template.name,
          description: template.description,
          icon: template.icon,
          category: template.category,
          rarity: template.rarity,
          isSecret: false,
          isActive: true
        }
      });
    } catch (error) {
      this.logger.error(`Failed to ensure badge exists ${badgeId}:`, error);
    }
  }

  /**
   * Send badge notification to user
   */
  private async sendBadgeNotification(userId: string, rule: DynamicBadgeRule): Promise<void> {
    try {
      const user = await this.client.users.fetch(userId);
      if (!user) return;

      const embed = {
        title: '🏆 Nova Badge Dinâmica Conquistada!',
        description: `Parabéns! Você conquistou a badge **${rule.badgeTemplate.name}**`,
        fields: [
          {
            name: 'Descrição',
            value: rule.badgeTemplate.description,
            inline: false
          },
          {
            name: 'Recompensas',
            value: `XP: ${rule.badgeTemplate.xpReward || 0} | Moedas: ${rule.badgeTemplate.coinReward || 0}`,
            inline: true
          }
        ],
        color: this.getRarityColor(rule.badgeTemplate.rarity),
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Sistema de Badges Dinâmicas'
        }
      };

      await user.send({ embeds: [embed] }).catch(() => {
        // User has DMs disabled, ignore
      });
    } catch (error) {
      this.logger.error(`Failed to send badge notification to user ${userId}:`, error);
    }
  }

  /**
   * Get color for badge rarity
   */
  private getRarityColor(rarity: string): number {
    const colors = {
      common: 0x808080,
      uncommon: 0x00FF00,
      rare: 0x0080FF,
      epic: 0x8000FF,
      legendary: 0xFF8000,
      mythic: 0xFF0080
    };
    return colors[rarity as keyof typeof colors] || colors.common;
  }

  /**
   * Get all dynamic badge rules
   */
  public getDynamicRules(): DynamicBadgeRule[] {
    return Array.from(this.dynamicRules.values());
  }

  /**
   * Add new dynamic rule
   */
  public addDynamicRule(rule: DynamicBadgeRule): void {
    this.dynamicRules.set(rule.id, rule);
    this.logger.info(`Added dynamic rule: ${rule.name}`);
  }

  /**
   * Remove dynamic rule
   */
  public removeDynamicRule(ruleId: string): boolean {
    const removed = this.dynamicRules.delete(ruleId);
    if (removed) {
      this.logger.info(`Removed dynamic rule: ${ruleId}`);
    }
    return removed;
  }

  /**
   * Toggle rule active status
   */
  public toggleRule(ruleId: string): boolean {
    const rule = this.dynamicRules.get(ruleId);
    if (rule) {
      rule.isActive = !rule.isActive;
      this.logger.info(`Toggled rule ${ruleId}: ${rule.isActive ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  /**
   * Get statistics about dynamic badges
   */
  public async getStatistics(): Promise<{
    totalRules: number;
    activeRules: number;
    totalAwards: number;
    recentAwards: number;
  }> {
    const totalRules = this.dynamicRules.size;
    const activeRules = Array.from(this.dynamicRules.values()).filter(rule => rule.isActive).length;
    
    const dynamicBadgeIds = Array.from(this.dynamicRules.keys()).map(id => `dynamic_${id}`);
    
    const totalAwards = await this.database.client.userBadge.count({
      where: {
        badgeId: { in: dynamicBadgeIds }
      }
    });

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const recentAwards = await this.database.client.userBadge.count({
      where: {
        badgeId: { in: dynamicBadgeIds },
        earnedAt: { gte: oneDayAgo }
      }
    });

    return {
      totalRules,
      activeRules,
      totalAwards,
      recentAwards
    };
  }

  /**
   * Force process badges for a specific user
   */
  public async processUserNow(userId: string): Promise<string[]> {
    try {
      const context = await this.buildStatsContext(userId);
      const allRules = Array.from(this.dynamicRules.values()).filter(rule => rule.isActive);
      return await this.processUserBadges(userId, allRules, context);
    } catch (error) {
      this.logger.error(`Failed to process badges for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Stop automatic processing
   */
  public stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      this.logger.info('Dynamic badge processing stopped');
    }
  }

  /**
   * Restart automatic processing
   */
  public restartProcessing(): void {
    this.stopProcessing();
    this.startAutomaticProcessing();
  }
}