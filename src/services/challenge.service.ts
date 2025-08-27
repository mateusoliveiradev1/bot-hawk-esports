import { Client } from 'discord.js';
import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { CacheService } from './cache.service';
import { XPService } from './xp.service';
import { BadgeService } from './badge.service';
import * as cron from 'node-cron';

export interface ChallengeDefinition {
  id: string;
  name: string;
  description: string;
  type:
    | 'kills'
    | 'games'
    | 'damage'
    | 'headshots'
    | 'revives'
    | 'wins'
    | 'survival_time'
    | 'distance';
  target: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  rewards: {
    xp: number;
    coins: number;
    badge?: string;
  };
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  timeLimit: number; // in hours
  isActive: boolean;
}

export interface UserChallenge {
  id: string;
  userId: string;
  challengeId: string;
  progress: number;
  target: number;
  completed: boolean;
  completedAt?: Date;
  startedAt: Date;
  expiresAt: Date;
  rewards?: {
    xp: number;
    coins: number;
    badge?: string;
  };
}

export interface DailyChallengeSet {
  date: string;
  challenges: ChallengeDefinition[];
  createdAt: Date;
}

export class ChallengeService {
  private client: Client;
  private logger: Logger;
  private database: DatabaseService;
  private cache: CacheService;
  private xpService: XPService;
  private badgeService: BadgeService;
  private challengeTemplates: Map<string, ChallengeDefinition> = new Map();
  private rotationJob?: cron.ScheduledTask;

  constructor(client: Client) {
    this.client = client;
    this.logger = (client as any).logger;
    this.database = (client as any).database;
    this.cache = (client as any).cache;
    this.xpService = (client as any).services?.xp;
    this.badgeService = (client as any).services?.badge;

    this.initializeChallengeTemplates();
    this.scheduleDailyRotation();
  }

  /**
   * Initialize challenge templates
   */
  private initializeChallengeTemplates(): void {
    const templates: ChallengeDefinition[] = [
      // Easy Challenges
      {
        id: 'daily_kills_5',
        name: 'Caçador Iniciante',
        description: 'Elimine 5 inimigos em partidas do PUBG',
        type: 'kills',
        target: 5,
        difficulty: 'easy',
        rewards: { xp: 100, coins: 50 },
        icon: '🎯',
        rarity: 'common',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_games_3',
        name: 'Guerreiro Persistente',
        description: 'Complete 3 partidas do PUBG',
        type: 'games',
        target: 3,
        difficulty: 'easy',
        rewards: { xp: 75, coins: 25 },
        icon: '🎮',
        rarity: 'common',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_damage_1000',
        name: 'Causador de Dano',
        description: 'Cause 1.000 de dano em partidas',
        type: 'damage',
        target: 1000,
        difficulty: 'easy',
        rewards: { xp: 125, coins: 75 },
        icon: '💥',
        rarity: 'common',
        timeLimit: 24,
        isActive: true,
      },

      // Medium Challenges
      {
        id: 'daily_kills_10',
        name: 'Assassino Experiente',
        description: 'Elimine 10 inimigos em partidas do PUBG',
        type: 'kills',
        target: 10,
        difficulty: 'medium',
        rewards: { xp: 200, coins: 100 },
        icon: '⚔️',
        rarity: 'uncommon',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_headshots_3',
        name: 'Atirador Preciso',
        description: 'Consiga 3 headshots em partidas',
        type: 'headshots',
        target: 3,
        difficulty: 'medium',
        rewards: { xp: 250, coins: 125 },
        icon: '🎯',
        rarity: 'uncommon',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_revives_2',
        name: 'Anjo da Guarda',
        description: 'Ressuscite 2 companheiros de equipe',
        type: 'revives',
        target: 2,
        difficulty: 'medium',
        rewards: { xp: 175, coins: 100, badge: 'team_player' },
        icon: '❤️‍🩹',
        rarity: 'uncommon',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_survival_20min',
        name: 'Sobrevivente Nato',
        description: 'Sobreviva por 20 minutos em uma partida',
        type: 'survival_time',
        target: 1200, // 20 minutes in seconds
        difficulty: 'medium',
        rewards: { xp: 300, coins: 150 },
        icon: '🛡️',
        rarity: 'uncommon',
        timeLimit: 24,
        isActive: true,
      },

      // Hard Challenges
      {
        id: 'daily_kills_15',
        name: 'Máquina de Matar',
        description: 'Elimine 15 inimigos em partidas do PUBG',
        type: 'kills',
        target: 15,
        difficulty: 'hard',
        rewards: { xp: 400, coins: 200 },
        icon: '💀',
        rarity: 'rare',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_wins_2',
        name: 'Campeão Duplo',
        description: 'Vença 2 partidas do PUBG',
        type: 'wins',
        target: 2,
        difficulty: 'hard',
        rewards: { xp: 500, coins: 300, badge: 'winner_winner' },
        icon: '🏆',
        rarity: 'rare',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_damage_3000',
        name: 'Destruidor Implacável',
        description: 'Cause 3.000 de dano em partidas',
        type: 'damage',
        target: 3000,
        difficulty: 'hard',
        rewards: { xp: 350, coins: 175 },
        icon: '🔥',
        rarity: 'rare',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_headshots_7',
        name: 'Sniper Elite',
        description: 'Consiga 7 headshots em partidas',
        type: 'headshots',
        target: 7,
        difficulty: 'hard',
        rewards: { xp: 450, coins: 225 },
        icon: '🎯',
        rarity: 'rare',
        timeLimit: 24,
        isActive: true,
      },

      // Extreme Challenges
      {
        id: 'daily_kills_25',
        name: 'Lenda Assassina',
        description: 'Elimine 25 inimigos em partidas do PUBG',
        type: 'kills',
        target: 25,
        difficulty: 'extreme',
        rewards: { xp: 750, coins: 500, badge: 'legendary_killer' },
        icon: '👑',
        rarity: 'epic',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_wins_3',
        name: 'Dominador Supremo',
        description: 'Vença 3 partidas do PUBG',
        type: 'wins',
        target: 3,
        difficulty: 'extreme',
        rewards: { xp: 1000, coins: 750, badge: 'champion' },
        icon: '👑',
        rarity: 'legendary',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_damage_5000',
        name: 'Apocalipse Pessoal',
        description: 'Cause 5.000 de dano em partidas',
        type: 'damage',
        target: 5000,
        difficulty: 'extreme',
        rewards: { xp: 600, coins: 400 },
        icon: '💥',
        rarity: 'epic',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_distance_5km',
        name: 'Maratonista de Guerra',
        description: 'Percorra 5km em partidas do PUBG',
        type: 'distance',
        target: 5000, // 5km in meters
        difficulty: 'extreme',
        rewards: { xp: 400, coins: 250 },
        icon: '🏃‍♂️',
        rarity: 'epic',
        timeLimit: 24,
        isActive: true,
      },
      {
        id: 'daily_headshots_10',
        name: 'Sniper Elite',
        description: 'Consiga 10 headshots em partidas',
        type: 'headshots',
        target: 10,
        difficulty: 'extreme',
        rewards: { xp: 500, coins: 250 },
        icon: '🎯',
        rarity: 'epic',
        timeLimit: 24,
        isActive: true,
      },
    ];

    templates.forEach(template => {
      this.challengeTemplates.set(template.id, template);
    });

    this.logger.info(`Initialized ${templates.length} challenge templates`);
  }

  /**
   * Schedule daily challenge rotation at 00:00 UTC
   */
  private scheduleDailyRotation(): void {
    this.rotationJob = cron.schedule(
      '0 0 * * *',
      async () => {
        this.logger.info('Starting daily challenge rotation (00:00 UTC)');
        await this.rotateDailyChallenges();
      },
      {
        timezone: 'UTC',
        runOnInit: true,
      }
    );

    this.logger.info('Scheduled daily challenge rotation for 00:00 UTC');
  }

  /**
   * Rotate daily challenges
   */
  public async rotateDailyChallenges(): Promise<void> {
    try {
      this.logger.info('Starting daily challenge rotation...');

      const today = new Date().toISOString().split('T')[0]!;

      // Check if challenges already exist for today
      const existingChallenges = await this.cache.get<string>(`daily_challenges_${today}`);
      if (existingChallenges && existingChallenges.trim()) {
        this.logger.info('Daily challenges already exist for today');
        return;
      }

      // Generate new challenge set
      const newChallenges = this.generateDailyChallengeSet();

      // Save to database
      await this.saveDailyChallengeSet(today, newChallenges);

      // Cache the challenges
      await this.cache.set(`daily_challenges_${today}`, JSON.stringify(newChallenges), 86400); // 24 hours

      // Assign challenges to all active users
      await this.assignChallengesToUsers(newChallenges);

      // Clean up expired challenges
      await this.cleanupExpiredChallenges();

      this.logger.info(
        `Daily challenge rotation completed. Generated ${newChallenges.length} challenges for ${today}`
      );
    } catch (error) {
      this.logger.error('Failed to rotate daily challenges:', error);
      throw error;
    }
  }

  /**
   * Generate daily challenge set
   */
  private generateDailyChallengeSet(): ChallengeDefinition[] {
    const templates = Array.from(this.challengeTemplates.values()).filter(
      template => template.isActive
    );

    // Select challenges by difficulty
    const easyTemplates = templates.filter(t => t.difficulty === 'easy');
    const mediumTemplates = templates.filter(t => t.difficulty === 'medium');
    const hardTemplates = templates.filter(t => t.difficulty === 'hard');
    const extremeTemplates = templates.filter(t => t.difficulty === 'extreme');

    const selectedChallenges: ChallengeDefinition[] = [];

    // Select 2 easy, 2 medium, 1 hard, and sometimes 1 extreme
    selectedChallenges.push(...this.selectRandomChallenges(easyTemplates, 2));
    selectedChallenges.push(...this.selectRandomChallenges(mediumTemplates, 2));
    selectedChallenges.push(...this.selectRandomChallenges(hardTemplates, 1));

    // 30% chance for extreme challenge
    if (Math.random() < 0.3 && extremeTemplates.length > 0) {
      selectedChallenges.push(...this.selectRandomChallenges(extremeTemplates, 1));
    }

    return selectedChallenges;
  }

  /**
   * Select random challenges from templates
   */
  private selectRandomChallenges(
    templates: ChallengeDefinition[],
    count: number
  ): ChallengeDefinition[] {
    const shuffled = [...templates].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * Save daily challenge set to database
   */
  private async saveDailyChallengeSet(
    date: string,
    challenges: ChallengeDefinition[]
  ): Promise<void> {
    try {
      for (const challenge of challenges) {
        await this.database.client.challenge.upsert({
          where: {
            id: `${date}_${challenge.id}`,
          },
          update: {
            name: challenge.name,
            description: challenge.description,
            type: challenge.type,
            target: challenge.target,
            difficulty: challenge.difficulty,
            rewards: JSON.stringify(challenge.rewards),
            icon: challenge.icon,
            rarity: challenge.rarity,
            timeLimit: challenge.timeLimit,
            isActive: challenge.isActive,
            date: new Date(date),
          },
          create: {
            id: `${date}_${challenge.id}`,
            name: challenge.name,
            description: challenge.description,
            type: challenge.type,
            target: challenge.target,
            difficulty: challenge.difficulty,
            rewards: JSON.stringify(challenge.rewards),
            icon: challenge.icon,
            rarity: challenge.rarity,
            timeLimit: challenge.timeLimit,
            isActive: challenge.isActive,
            date: new Date(date),
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to save daily challenge set:', error);
      throw error;
    }
  }

  /**
   * Assign challenges to all users
   */
  private async assignChallengesToUsers(challenges: ChallengeDefinition[]): Promise<void> {
    try {
      // Get all active users
      const users = await this.database.client.user.findMany({
        select: {
          id: true,
          username: true,
          discriminator: true,
          avatar: true,
          serverRegistered: true,
          serverRegisteredAt: true,
          userChallenges: true,
        },
      });

      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      for (const user of users) {
        for (const challenge of challenges) {
          // Check if user already has this challenge
          const challengeDbId = `${today.toISOString().split('T')[0]}_${challenge.id || 'unknown'}`;
          const existingChallenge = await this.database.client.userChallenge.findFirst({
            where: {
              userId: user.id,
              challengeId: challengeDbId,
              createdAt: {
                gte: today,
                lt: tomorrow,
              },
            },
          });

          if (!existingChallenge) {
            await this.database.client.userChallenge.create({
              data: {
                userId: user.id,
                challengeId: challengeDbId,
                progress: 0,
                target: challenge.target,
                completed: false,
                expiresAt: tomorrow,
              },
            });
          }
        }
      }

      this.logger.info(`Assigned challenges to ${users.length} users`);
    } catch (error) {
      this.logger.error('Failed to assign challenges to users:', error);
      throw error;
    }
  }

  /**
   * Update user challenge progress
   */
  public async updateChallengeProgress(
    userId: string,
    type: string,
    value: number,
    date: string
  ): Promise<string[]> {
    try {
      const completedChallenges: string[] = [];

      // Get user's active challenges of this type
      const userChallenges = await this.database.client.userChallenge.findMany({
        where: {
          userId,
          completed: false,
          expiresAt: {
            gt: new Date(),
          },
          challenge: {
            date: new Date(date),
            type,
          },
        },
        include: {
          challenge: true,
        },
      });

      for (const userChallenge of userChallenges) {
        if (userChallenge.challenge.type === type) {
          const newProgress = Math.min(userChallenge.progress + value, userChallenge.target);

          await this.database.client.userChallenge.update({
            where: { id: userChallenge.id },
            data: {
              progress: newProgress,
              completed: newProgress >= userChallenge.target,
              completedAt: newProgress >= userChallenge.target ? new Date() : null,
            },
          });

          // If challenge completed, award rewards
          if (newProgress >= userChallenge.target && !userChallenge.completed) {
            await this.awardChallengeRewards(userId, userChallenge.challenge);
            completedChallenges.push(userChallenge.challenge.name);
          }
        }
      }

      return completedChallenges;
    } catch (error) {
      this.logger.error(
        `Failed to update challenge progress for user ${userId} on ${date}:`,
        error
      );
      return [];
    }
  }

  /**
   * Award challenge rewards
   */
  private async awardChallengeRewards(userId: string, challenge: any): Promise<void> {
    try {
      const rewards = JSON.parse(challenge.rewards);

      // Award XP
      if (rewards.xp && this.xpService) {
        await this.xpService.addXP(userId, 'DAILY_CHALLENGE', undefined, rewards.xp / 50);
      }

      // Award coins
      if (rewards.coins) {
        await this.database.client.user.update({
          where: { id: userId },
          data: {
            coins: {
              increment: rewards.coins,
            },
          },
        });
      }

      // Award badge
      if (rewards.badge && this.badgeService) {
        await this.badgeService.awardBadge(userId, rewards.badge);
      }

      this.logger.info(
        `Awarded challenge rewards to user ${userId}: XP=${rewards.xp}, Coins=${rewards.coins}, Badge=${rewards.badge || 'none'}`
      );
    } catch (error) {
      this.logger.error(`Failed to award challenge rewards to user ${userId}:`, error);
    }
  }

  /**
   * Get user's daily challenges
   */
  public async getUserDailyChallenges(userId: string): Promise<UserChallenge[]> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const userChallenges = await this.database.client.userChallenge.findMany({
        where: {
          userId,
          createdAt: {
            gte: today,
          },
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          challenge: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return userChallenges.map(uc => ({
        id: uc.id,
        userId: uc.userId,
        challengeId: uc.challengeId,
        progress: uc.progress,
        target: uc.target,
        completed: uc.completed,
        completedAt: uc.completedAt || undefined,
        startedAt: uc.createdAt,
        expiresAt: uc.expiresAt,
        rewards: uc.challenge.rewards ? JSON.parse(uc.challenge.rewards) : undefined,
        date: uc.challenge.date,
      }));
    } catch (error) {
      this.logger.error(`Failed to get daily challenges for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get today's challenges
   */
  public async getTodaysChallenges(date: string): Promise<ChallengeDefinition[]> {
    try {
      const today = new Date(date).toISOString().split('T')[0]!;

      // Try cache first
      const cached = await this.cache.get<string>(`daily_challenges_${today}`);
      if (cached && cached.trim()) {
        return JSON.parse(cached);
      }

      // Get from database
      const challenges = await this.database.client.challenge.findMany({
        where: {
          date: {
            gte: new Date(today),
            lt: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000),
          },
          isActive: true,
        },
      });

      const challengeDefinitions: ChallengeDefinition[] = challenges.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: (c.type || 'kills') as
          | 'kills'
          | 'games'
          | 'damage'
          | 'headshots'
          | 'revives'
          | 'wins'
          | 'survival_time'
          | 'distance',
        target: c.target || 0,
        difficulty: (c.difficulty || 'medium') as 'easy' | 'medium' | 'hard' | 'extreme',
        rewards: c.rewards ? JSON.parse(c.rewards) : { xp: 0, coins: 0 },
        icon: c.icon || '🎯',
        rarity: (c.rarity || 'common') as 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary',
        timeLimit: c.timeLimit || 24,
        isActive: c.isActive,
      }));

      // Cache for 1 hour
      await this.cache.set(`daily_challenges_${today}`, JSON.stringify(challengeDefinitions), 3600);

      return challengeDefinitions;
    } catch (error) {
      this.logger.error("Failed to get today's challenges:", error);
      return [];
    }
  }

  /**
   * Clean up expired challenges
   */
  private async cleanupExpiredChallenges(): Promise<void> {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      // Delete old user challenges
      await this.database.client.userChallenge.deleteMany({
        where: {
          expiresAt: {
            lt: threeDaysAgo,
          },
        },
      });

      // Delete old challenges
      await this.database.client.challenge.deleteMany({
        where: {
          date: {
            lt: threeDaysAgo,
          },
        },
      });

      this.logger.info('Cleaned up expired challenges');
    } catch (error) {
      this.logger.error('Failed to cleanup expired challenges:', error);
    }
  }

  /**
   * Get challenge statistics
   */
  public async getChallengeStats(): Promise<{
    totalChallenges: number;
    completedToday: number;
    activeUsers: number;
    completionRate: number;
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [totalChallenges, completedToday, activeUsers] = await Promise.all([
        this.database.client.userChallenge.count({
          where: {
            createdAt: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),
        this.database.client.userChallenge.count({
          where: {
            completed: true,
            completedAt: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),
        this.database.client.userChallenge.groupBy({
          by: ['userId'],
          where: {
            createdAt: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),
      ]);

      const completionRate = totalChallenges > 0 ? (completedToday / totalChallenges) * 100 : 0;

      return {
        totalChallenges,
        completedToday,
        activeUsers: activeUsers.length,
        completionRate: Math.round(completionRate * 100) / 100,
      };
    } catch (error) {
      this.logger.error('Failed to get challenge statistics:', error);
      return {
        totalChallenges: 0,
        completedToday: 0,
        activeUsers: 0,
        completionRate: 0,
      };
    }
  }

  /**
   * Force generate challenges for today (admin function)
   */
  public async forceGenerateTodaysChallenges(): Promise<ChallengeDefinition[]> {
    try {
      const today = new Date().toISOString().split('T')[0]!;

      // Clear existing cache
      await this.cache.del(`daily_challenges_${today}`);

      // Generate new challenges
      await this.rotateDailyChallenges();

      return await this.getTodaysChallenges(today);
    } catch (error) {
      this.logger.error("Failed to force generate today's challenges:", error);
      throw error;
    }
  }

  /**
   * Stop scheduled rotation
   */
  public stopScheduledRotation(): void {
    if (this.rotationJob) {
      this.rotationJob.stop();
      this.logger.info('Stopped scheduled challenge rotation');
    }
  }

  /**
   * Get next rotation time
   */
  public getNextRotationTime(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }
}
