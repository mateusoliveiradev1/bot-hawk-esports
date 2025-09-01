import { ExtendedClient } from '../types/client';
import { DatabaseService } from '../database/database.service';
import { BadgeService } from './badge.service';
import { PUBGService } from './pubg.service';
import { Logger } from '../utils/logger';

interface AdvancedBadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'pubg_advanced';
  rarity: 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  requirements: AdvancedRequirement[];
  rewards: {
    xp: number;
    coins: number;
    role?: string;
    title?: string;
  };
  isSecret: boolean;
  isActive: boolean;
  metadata?: {
    difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
    estimatedTime: string;
    completionRate: number;
  };
}

interface AdvancedRequirement {
  type: 'streak' | 'consistency' | 'weapon_mastery' | 'survival_time' | 'damage_threshold' | 'headshot_ratio';
  operator: 'gte' | 'lte' | 'eq';
  value: number;
  timeframe: 'daily' | 'weekly' | 'monthly' | 'all_time';
  additional?: {
    streakType?: 'wins' | 'top10' | 'top5' | 'kills';
    weapon?: string;
    minGames?: number;
    minKills?: number;
    consecutiveDays?: number;
  };
}

interface UserStreak {
  userId: string;
  type: 'wins' | 'top10' | 'top5' | 'kills';
  current: number;
  best: number;
  lastUpdate: Date;
  isActive: boolean;
}

interface ConsistencyStats {
  userId: string;
  totalGames: number;
  top10Finishes: number;
  top5Finishes: number;
  wins: number;
  averageRank: number;
  consistencyScore: number; // 0-100
  lastCalculated: Date;
}

interface WeaponMasteryProgress {
  userId: string;
  weapon: string;
  kills: number;
  headshots: number;
  damage: number;
  accuracy: number;
  masteryLevel: number; // 1-10
  lastUpdate: Date;
}

export class AdvancedPUBGBadgesService {
  private client: ExtendedClient;
  private database: DatabaseService;
  private badgeService: BadgeService;
  private pubgService: PUBGService;
  private logger: Logger;
  private streakCache = new Map<string, UserStreak[]>();
  private consistencyCache = new Map<string, ConsistencyStats>();
  private weaponMasteryCache = new Map<string, WeaponMasteryProgress[]>();

  constructor(client: ExtendedClient) {
    this.client = client;
    this.database = client.database as DatabaseService;
    this.badgeService = (client as any).badgeService as BadgeService;
    this.pubgService = (client as any).pubgService as PUBGService;
    this.logger = new Logger();

    this.initializeAdvancedBadges();
    this.scheduleConsistencyCalculation();
  }

  /**
   * Initialize advanced PUBG badges
   */
  private async initializeAdvancedBadges(): Promise<void> {
    try {
      const advancedBadges = await this.createAdvancedBadgeDefinitions();
      
      for (const badge of advancedBadges) {
        await this.registerAdvancedBadge(badge);
      }

      this.logger.info(`✅ Initialized ${advancedBadges.length} advanced PUBG badges`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize advanced PUBG badges:', error);
    }
  }

  /**
   * Create advanced badge definitions
   */
  private async createAdvancedBadgeDefinitions(): Promise<AdvancedBadgeDefinition[]> {
    return [
      // Chicken Dinner Streaks
      {
        id: 'chicken_dinner_streak_3',
        name: 'Sequência de Ouro',
        description: 'Vença 3 partidas consecutivas',
        icon: '🥇',
        category: 'pubg_advanced',
        rarity: 'rare',
        requirements: [{
          type: 'streak',
          operator: 'gte',
          value: 3,
          timeframe: 'all_time',
          additional: { streakType: 'wins' },
        }],
        rewards: { xp: 500, coins: 250, title: 'Vencedor Consecutivo' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'medium', estimatedTime: '1 week', completionRate: 15.0 },
      },
      {
        id: 'chicken_dinner_streak_5',
        name: 'Dominador Supremo',
        description: 'Vença 5 partidas consecutivas',
        icon: '👑',
        category: 'pubg_advanced',
        rarity: 'epic',
        requirements: [{
          type: 'streak',
          operator: 'gte',
          value: 5,
          timeframe: 'all_time',
          additional: { streakType: 'wins' },
        }],
        rewards: { xp: 1000, coins: 500, role: 'chicken_master', title: 'Dominador' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'hard', estimatedTime: '2 weeks', completionRate: 5.0 },
      },
      {
        id: 'chicken_dinner_streak_10',
        name: 'Lenda Imortal',
        description: 'Vença 10 partidas consecutivas',
        icon: '🌟',
        category: 'pubg_advanced',
        rarity: 'mythic',
        requirements: [{
          type: 'streak',
          operator: 'gte',
          value: 10,
          timeframe: 'all_time',
          additional: { streakType: 'wins' },
        }],
        rewards: { xp: 2500, coins: 1000, role: 'immortal_legend', title: 'Imortal' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'extreme', estimatedTime: '1 month', completionRate: 1.0 },
      },

      // Top 10 Consistency
      {
        id: 'top10_consistency_70',
        name: 'Sobrevivente Consistente',
        description: 'Termine no Top 10 em 70% das partidas (mín. 50 jogos)',
        icon: '🛡️',
        category: 'pubg_advanced',
        rarity: 'rare',
        requirements: [{
          type: 'consistency',
          operator: 'gte',
          value: 70,
          timeframe: 'all_time',
          additional: { minGames: 50 },
        }],
        rewards: { xp: 750, coins: 300, title: 'Consistente' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'medium', estimatedTime: '2 weeks', completionRate: 20.0 },
      },
      {
        id: 'top10_consistency_85',
        name: 'Mestre da Sobrevivência',
        description: 'Termine no Top 10 em 85% das partidas (mín. 100 jogos)',
        icon: '🏕️',
        category: 'pubg_advanced',
        rarity: 'epic',
        requirements: [{
          type: 'consistency',
          operator: 'gte',
          value: 85,
          timeframe: 'all_time',
          additional: { minGames: 100 },
        }],
        rewards: { xp: 1500, coins: 600, role: 'survival_master', title: 'Mestre Sobrevivente' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'hard', estimatedTime: '1 month', completionRate: 8.0 },
      },

      // Weapon Mastery Específica
      {
        id: 'akm_grandmaster',
        name: 'Grão-Mestre AKM',
        description: 'Alcance nível 10 de maestria com AKM',
        icon: '🔫',
        category: 'pubg_advanced',
        rarity: 'legendary',
        requirements: [{
          type: 'weapon_mastery',
          operator: 'gte',
          value: 10,
          timeframe: 'all_time',
          additional: { weapon: 'AKM' },
        }],
        rewards: { xp: 1000, coins: 400, title: 'Mestre AKM' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'hard', estimatedTime: '3 weeks', completionRate: 12.0 },
      },
      {
        id: 'kar98k_sniper_elite',
        name: 'Elite Sniper Kar98k',
        description: 'Alcance nível 10 de maestria com Kar98k',
        icon: '🎯',
        category: 'pubg_advanced',
        rarity: 'legendary',
        requirements: [{
          type: 'weapon_mastery',
          operator: 'gte',
          value: 10,
          timeframe: 'all_time',
          additional: { weapon: 'Kar98k' },
        }],
        rewards: { xp: 1000, coins: 400, title: 'Elite Sniper' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'hard', estimatedTime: '3 weeks', completionRate: 10.0 },
      },

      // Headshot Ratio
      {
        id: 'headshot_precision_50',
        name: 'Precisão Mortal',
        description: 'Mantenha 50% de taxa de headshot (mín. 500 kills)',
        icon: '💀',
        category: 'pubg_advanced',
        rarity: 'epic',
        requirements: [{
          type: 'headshot_ratio',
          operator: 'gte',
          value: 50,
          timeframe: 'all_time',
          additional: { minKills: 500 },
        }],
        rewards: { xp: 1200, coins: 500, title: 'Precisão Mortal' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'hard', estimatedTime: '1 month', completionRate: 7.0 },
      },

      // Survival Time
      {
        id: 'marathon_survivor',
        name: 'Sobrevivente Maratonista',
        description: 'Sobreviva por mais de 25 minutos em uma partida',
        icon: '⏰',
        category: 'pubg_advanced',
        rarity: 'rare',
        requirements: [{
          type: 'survival_time',
          operator: 'gte',
          value: 1500, // 25 minutes in seconds
          timeframe: 'all_time',
        }],
        rewards: { xp: 600, coins: 250, title: 'Maratonista' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'medium', estimatedTime: '1 week', completionRate: 25.0 },
      },

      // Damage Threshold
      {
        id: 'damage_dealer_2000',
        name: 'Devastador',
        description: 'Cause 2000+ de dano em uma única partida',
        icon: '💥',
        category: 'pubg_advanced',
        rarity: 'epic',
        requirements: [{
          type: 'damage_threshold',
          operator: 'gte',
          value: 2000,
          timeframe: 'all_time',
        }],
        rewards: { xp: 800, coins: 350, title: 'Devastador' },
        isSecret: false,
        isActive: true,
        metadata: { difficulty: 'hard', estimatedTime: '2 weeks', completionRate: 15.0 },
      },
    ];
  }

  /**
   * Register advanced badge with the badge service
   */
  private async registerAdvancedBadge(badge: AdvancedBadgeDefinition): Promise<void> {
    try {
      // Convert to standard badge format
      const standardBadge = {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        category: badge.category,
        rarity: badge.rarity,
        requirements: badge.requirements.map(req => ({
          type: req.type,
          operator: req.operator,
          value: req.value,
          timeframe: req.timeframe,
          additional: req.additional,
        })),
        rewards: badge.rewards,
        isSecret: badge.isSecret,
        isActive: badge.isActive,
      };

      // Register with badge service if it has a registration method
      if (typeof (this.badgeService as any).registerBadge === 'function') {
        await (this.badgeService as any).registerBadge(standardBadge);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to register advanced badge ${badge.id}:`, error);
    }
  }

  /**
   * Update user streak data
   */
  public async updateStreak(userId: string, type: 'wins' | 'top10' | 'top5' | 'kills', success: boolean): Promise<void> {
    try {
      const userStreaks = this.streakCache.get(userId) || [];
      let streak = userStreaks.find(s => s.type === type);

      if (!streak) {
        streak = {
          userId,
          type,
          current: 0,
          best: 0,
          lastUpdate: new Date(),
          isActive: true,
        };
        userStreaks.push(streak);
      }

      if (success) {
        streak.current++;
        if (streak.current > streak.best) {
          streak.best = streak.current;
        }
      } else {
        streak.current = 0;
      }

      streak.lastUpdate = new Date();
      streak.isActive = true;

      this.streakCache.set(userId, userStreaks);

      // Save to database
      await this.saveStreakData(userId, streak);

      // Check for streak badges
      await this.checkStreakBadges(userId, streak);
    } catch (error) {
      this.logger.error(`❌ Failed to update streak for user ${userId}:`, error);
    }
  }

  /**
   * Calculate consistency stats for user
   */
  public async calculateConsistency(userId: string, pubgStats: any): Promise<void> {
    try {
      const totalGames = pubgStats.games || 0;
      const top10Finishes = pubgStats.top10s || 0;
      const top5Finishes = pubgStats.top5s || 0;
      const wins = pubgStats.wins || 0;
      const averageRank = pubgStats.averageRank || 50;

      if (totalGames === 0) {return;}

      const consistencyScore = Math.round(
        ((top10Finishes / totalGames) * 70 + 
         (top5Finishes / totalGames) * 20 + 
         (wins / totalGames) * 10) * 100,
      );

      const stats: ConsistencyStats = {
        userId,
        totalGames,
        top10Finishes,
        top5Finishes,
        wins,
        averageRank,
        consistencyScore,
        lastCalculated: new Date(),
      };

      this.consistencyCache.set(userId, stats);

      // Save to database
      await this.saveConsistencyData(userId, stats);

      // Check for consistency badges
      await this.checkConsistencyBadges(userId, stats);
    } catch (error) {
      this.logger.error(`❌ Failed to calculate consistency for user ${userId}:`, error);
    }
  }

  /**
   * Update weapon mastery progress
   */
  public async updateWeaponMastery(userId: string, weaponData: any): Promise<void> {
    try {
      const userWeapons = this.weaponMasteryCache.get(userId) || [];
      
      for (const weapon of weaponData) {
        let progress = userWeapons.find(w => w.weapon === weapon.weaponName);
        
        if (!progress) {
          progress = {
            userId,
            weapon: weapon.weaponName,
            kills: 0,
            headshots: 0,
            damage: 0,
            accuracy: 0,
            masteryLevel: 0,
            lastUpdate: new Date(),
          };
          userWeapons.push(progress);
        }

        progress.kills = weapon.kills || 0;
        progress.headshots = weapon.headshots || 0;
        progress.damage = weapon.damage || 0;
        progress.accuracy = weapon.accuracy || 0;
        progress.masteryLevel = weapon.level || 0;
        progress.lastUpdate = new Date();

        // Check for weapon mastery badges
        await this.checkWeaponMasteryBadges(userId, progress);
      }

      this.weaponMasteryCache.set(userId, userWeapons);

      // Save to database
      await this.saveWeaponMasteryData(userId, userWeapons);
    } catch (error) {
      this.logger.error(`❌ Failed to update weapon mastery for user ${userId}:`, error);
    }
  }

  /**
   * Check streak badges
   */
  private async checkStreakBadges(userId: string, streak: UserStreak): Promise<void> {
    const streakBadges = [
      { id: 'chicken_dinner_streak_3', type: 'wins', value: 3 },
      { id: 'chicken_dinner_streak_5', type: 'wins', value: 5 },
      { id: 'chicken_dinner_streak_10', type: 'wins', value: 10 },
    ];

    for (const badge of streakBadges) {
      if (streak.type === badge.type && streak.current >= badge.value) {
        await this.awardAdvancedBadge(userId, badge.id);
      }
    }
  }

  /**
   * Check consistency badges
   */
  private async checkConsistencyBadges(userId: string, stats: ConsistencyStats): Promise<void> {
    const consistencyBadges = [
      { id: 'top10_consistency_70', minGames: 50, minScore: 70 },
      { id: 'top10_consistency_85', minGames: 100, minScore: 85 },
    ];

    for (const badge of consistencyBadges) {
      if (stats.totalGames >= badge.minGames && 
          (stats.top10Finishes / stats.totalGames * 100) >= badge.minScore) {
        await this.awardAdvancedBadge(userId, badge.id);
      }
    }
  }

  /**
   * Check weapon mastery badges
   */
  private async checkWeaponMasteryBadges(userId: string, progress: WeaponMasteryProgress): Promise<void> {
    const weaponBadges = [
      { id: 'akm_grandmaster', weapon: 'AKM', level: 10 },
      { id: 'kar98k_sniper_elite', weapon: 'Kar98k', level: 10 },
    ];

    for (const badge of weaponBadges) {
      if (progress.weapon === badge.weapon && progress.masteryLevel >= badge.level) {
        await this.awardAdvancedBadge(userId, badge.id);
      }
    }
  }

  /**
   * Award advanced badge to user
   */
  private async awardAdvancedBadge(userId: string, badgeId: string): Promise<void> {
    try {
      // Check if user already has this badge
      const userBadges = await this.badgeService.getUserBadges(userId);
      if (userBadges.some(b => b.id === badgeId)) {
        return; // Already has badge
      }

      // Award badge through badge service
      const success = await this.badgeService.awardBadge(userId, badgeId);
      
      if (success) {
        this.logger.info(`🏆 Advanced badge ${badgeId} awarded to user ${userId}`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to award advanced badge ${badgeId} to user ${userId}:`, error);
    }
  }

  /**
   * Save streak data to database
   */
  private async saveStreakData(userId: string, streak: UserStreak): Promise<void> {
    try {
      if (!this.database?.client) {return;}

      // TODO: Implement streak data storage using existing models or create UserStreak model
      // For now, store in cache only
      const userStreaks = this.streakCache.get(userId) || [];
      const existingIndex = userStreaks.findIndex(s => s.type === streak.type);
      
      if (existingIndex >= 0) {
        userStreaks[existingIndex] = streak;
      } else {
        userStreaks.push(streak);
      }
      
      this.streakCache.set(userId, userStreaks);
      this.logger.debug(`💾 Streak data cached for user ${userId}, type: ${streak.type}`);
    } catch (error) {
      this.logger.error(`❌ Failed to save streak data for user ${userId}:`, error);
    }
  }

  /**
   * Save consistency data to database
   */
  private async saveConsistencyData(userId: string, stats: ConsistencyStats): Promise<void> {
    try {
      if (!this.database?.client) {return;}

      // TODO: Implement consistency data storage using existing models or create Consistency model
      // For now, store in cache only
      this.consistencyCache.set(userId, stats);
      this.logger.debug(`💾 Consistency data cached for user ${userId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to save consistency data for user ${userId}:`, error);
    }
  }

  /**
   * Save weapon mastery data to database
   */
  private async saveWeaponMasteryData(userId: string, weapons: WeaponMasteryProgress[]): Promise<void> {
    try {
      if (!this.database?.client) {return;}

      // Convert WeaponMasteryProgress to the format expected by the schema
      const weaponsData = weapons.map(weapon => ({
        weaponName: weapon.weapon,
        level: weapon.masteryLevel,
        xp: weapon.masteryLevel * 100, // Estimate XP based on level
        kills: weapon.kills,
        headshots: weapon.headshots,
        damage: weapon.damage,
        accuracy: weapon.accuracy,
        tier: this.getMasteryTier(weapon.masteryLevel),
        medals: [],
        lastUpdated: weapon.lastUpdate,
      }));

      const totalLevel = weapons.reduce((sum, weapon) => sum + weapon.masteryLevel, 0);
      const totalXP = totalLevel * 100;
      const favoriteWeapon = weapons.sort((a, b) => b.masteryLevel - a.masteryLevel)[0]?.weapon || 'Unknown';

      await this.database.client.weaponMastery.upsert({
        where: { userId },
        update: {
          weapons: JSON.stringify(weaponsData),
          totalLevel,
          totalXP,
          favoriteWeapon,
          lastSyncAt: new Date(),
        },
        create: {
          userId,
          pubgName: 'Unknown', // This should be fetched from user's PUBG data
          weapons: JSON.stringify(weaponsData),
          totalLevel,
          totalXP,
          favoriteWeapon,
          lastSyncAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`❌ Failed to save weapon mastery data for user ${userId}:`, error);
    }
  }

  /**
   * Get mastery tier based on level
   */
  private getMasteryTier(level: number): string {
    if (level >= 10) {return 'Master';}
    if (level >= 8) {return 'Expert';}
    if (level >= 6) {return 'Advanced';}
    if (level >= 4) {return 'Intermediate';}
    if (level >= 2) {return 'Novice';}
    return 'Beginner';
  }

  /**
   * Schedule consistency calculation
   */
  private scheduleConsistencyCalculation(): void {
    // Calculate consistency every 6 hours
    setInterval(async () => {
      try {
        await this.calculateAllUsersConsistency();
      } catch (error) {
        this.logger.error('❌ Failed to calculate consistency for all users:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours
  }

  /**
   * Calculate consistency for all users
   */
  private async calculateAllUsersConsistency(): Promise<void> {
    try {
      if (!this.database?.client) {return;}

      const users = await this.database.client.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        // Get PUBG stats for user from database
        const pubgStats = await this.database.pubg.getUserStats(user.id);
        if (pubgStats && pubgStats.length > 0) {
          await this.calculateConsistency(user.id, pubgStats[0]);
        }
      }

      this.logger.info(`✅ Calculated consistency for ${users.length} users`);
    } catch (error) {
      this.logger.error('❌ Failed to calculate consistency for all users:', error);
    }
  }

  /**
   * Get user advanced badge progress
   */
  public async getUserAdvancedProgress(userId: string): Promise<{
    streaks: UserStreak[];
    consistency: ConsistencyStats | null;
    weaponMastery: WeaponMasteryProgress[];
  }> {
    return {
      streaks: this.streakCache.get(userId) || [],
      consistency: this.consistencyCache.get(userId) || null,
      weaponMastery: this.weaponMasteryCache.get(userId) || [],
    };
  }

  /**
   * Handle PUBG match result for advanced badges
   */
  public async onMatchResult(userId: string, matchData: any): Promise<void> {
    try {
      const rank = matchData.rank || 100;
      const kills = matchData.kills || 0;
      const damage = matchData.damage || 0;
      const headshots = matchData.headshots || 0;
      const survivalTime = matchData.survivalTime || 0;

      // Update streaks
      await this.updateStreak(userId, 'wins', rank === 1);
      await this.updateStreak(userId, 'top10', rank <= 10);
      await this.updateStreak(userId, 'top5', rank <= 5);
      await this.updateStreak(userId, 'kills', kills > 0);

      // Check single-match achievements
      if (survivalTime >= 1500) { // 25 minutes
        await this.awardAdvancedBadge(userId, 'marathon_survivor');
      }

      if (damage >= 2000) {
        await this.awardAdvancedBadge(userId, 'damage_dealer_2000');
      }

      // Check headshot ratio
      if (kills >= 500) {
        const headshotRatio = (headshots / kills) * 100;
        if (headshotRatio >= 50) {
          await this.awardAdvancedBadge(userId, 'headshot_precision_50');
        }
      }

      // Update consistency (will be calculated in scheduled task)
      // Update weapon mastery if weapon data is available
      if (matchData.weapons) {
        await this.updateWeaponMastery(userId, matchData.weapons);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to handle match result for user ${userId}:`, error);
    }
  }
}