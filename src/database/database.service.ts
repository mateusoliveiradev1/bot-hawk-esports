import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';

/**
 * Database service class for managing Prisma client and database operations
 */
export class DatabaseService {
  private prisma: PrismaClient;
  private logger: Logger;
  private isConnected: boolean = false;

  /**
   * Get Prisma client instance
   */
  get client(): PrismaClient {
    return this.prisma;
  }

  constructor() {
    this.logger = new Logger();
    this.prisma = new PrismaClient({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
      errorFormat: 'pretty',
    });

    this.setupEventListeners();
  }

  /**
   * Setup Prisma event listeners for logging
   */
  private setupEventListeners(): void {
    // Query event listener commented out due to TypeScript compatibility issues
    // this.prisma.$on('query', (e: any) => {
    //   this.logger.database('query', e.target || 'unknown', e.duration, {
    //     query: e.query,
    //     params: e.params,
    //     timestamp: new Date().toISOString()
    //   });
    // });

    // Event listeners commented out due to TypeScript compatibility issues
    // this.prisma.$on('error', (e: any) => {
    //   this.logger.error('Database error:', e);
    // });
    // this.prisma.$on('info', (e: any) => {
    //   this.logger.info('Database info:', e);
    // });
    // this.prisma.$on('warn', (e: any) => {
    //   this.logger.warn('Database warning:', e);
    // });
  }

  /**
   * Connect to the database
   */
  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.isConnected = true;
      this.logger.info('✅ Connected to database successfully');
      
      // Test the connection
      await this.healthCheck();
    } catch (error) {
      this.logger.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the database
   */
  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      this.isConnected = false;
      this.logger.info('✅ Disconnected from database successfully');
    } catch (error) {
      this.logger.error('❌ Failed to disconnect from database:', error);
      throw error;
    }
  }

  /**
   * Health check for database connection
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Get Prisma client instance
   */
  public getClient(): PrismaClient {
    if (!this.isConnected) {
      throw new Error('Database is not connected. Call connect() first.');
    }
    return this.prisma;
  }

  /**
   * Check if database is connected
   */
  public isDbConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Execute a transaction
   */
  public async transaction<T>(fn: (prisma: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /**
   * Get database statistics
   */
  public async getStats(): Promise<{
    users: number;
    guilds: number;
    badges: number;
    clips: number;
    quizzes: number;
    matches: number;
  }> {
    const [users, guilds, badges, clips, quizzes, matches] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.guild.count(),
      this.prisma.badge.count(),
      this.prisma.clip.count(),
      this.prisma.quiz.count(),
      this.prisma.match.count(),
    ]);

    return {
      users,
      guilds,
      badges,
      clips,
      quizzes,
      matches,
    };
  }

  /**
   * User-related database operations
   */
  public users = {
    /**
     * Find user by Discord ID
     */
    findById: async (id: string) => {
      return this.prisma.user.findUnique({
        where: { id },
        include: {
          stats: true,
          badges: {
            include: {
              badge: true,
            },
          },
          achievements: {
            include: {
              achievement: true,
            },
          },
          pubgStats: true,
        },
      });
    },

    /**
     * Create or update user
     */
    upsert: async (data: {
      id: string;
      username: string;
      discriminator: string;
      avatar?: string;
    }) => {
      return this.prisma.user.upsert({
        where: { id: data.id },
        update: {
          username: data.username,
          discriminator: data.discriminator,
          avatar: data.avatar,
          updatedAt: new Date(),
        },
        create: {
          id: data.id,
          username: data.username,
          discriminator: data.discriminator,
          avatar: data.avatar,
          stats: {
            create: {},
          },
        },
        include: {
          stats: true,
        },
      });
    },

    /**
     * Update user XP and level
     */
    updateXP: async (userId: string, xpGain: number) => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const newXP = user.xp + xpGain;
      const newTotalXP = user.totalXp + xpGain;
      const newLevel = Math.floor(Math.sqrt(newTotalXP / 100)) + 1;

      return this.prisma.user.update({
        where: { id: userId },
        data: {
          xp: newXP,
          totalXp: newTotalXP,
          level: newLevel,
        },
      });
    },

    /**
     * Update user coins
     */
    updateCoins: async (userId: string, amount: number, reason: string) => {
      return this.prisma.$transaction(async (prisma) => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          throw new Error('User not found');
        }

        const newBalance = user.coins + amount;

        if (newBalance < 0) {
          throw new Error('Insufficient coins');
        }

        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: {
            coins: newBalance,
          },
        });

        // Create transaction record
        await prisma.transaction.create({
          data: {
            userId,
            type: amount > 0 ? 'earn' : 'spend',
            amount: Math.abs(amount),
            balance: newBalance,
            reason,
          },
        });

        return updatedUser;
      });
    },

    /**
     * Get user leaderboard
     */
    getLeaderboard: async (type: 'xp' | 'level' | 'coins', limit: number = 10) => {
      const orderBy = type === 'xp' ? { totalXp: 'desc' as const } : 
                     type === 'level' ? { level: 'desc' as const } : 
                     { coins: 'desc' as const };

      return this.prisma.user.findMany({
        orderBy,
        take: limit,
        select: {
          id: true,
          username: true,
          discriminator: true,
          avatar: true,
          level: true,
          totalXp: true,
          coins: true,
        },
      });
    },
  };

  /**
   * Guild-related database operations
   */
  public guilds = {
    /**
     * Find guild by Discord ID
     */
    findById: async (id: string) => {
      return this.prisma.guild.findUnique({
        where: { id },
        include: {
          config: true,
        },
      });
    },

    /**
     * Create or update guild
     */
    upsert: async (data: {
      id: string;
      name: string;
      icon?: string;
      ownerId: string;
    }) => {
      return this.prisma.guild.upsert({
        where: { id: data.id },
        update: {
          name: data.name,
          icon: data.icon,
          ownerId: data.ownerId,
          updatedAt: new Date(),
        },
        create: {
          id: data.id,
          name: data.name,
          icon: data.icon,
          ownerId: data.ownerId,
          config: {
            create: {},
          },
        },
        include: {
          config: true,
        },
      });
    },
  };

  /**
   * Badge-related database operations
   */
  public badges = {
    /**
     * Award badge to user
     */
    award: async (userId: string, badgeId: string, metadata?: any) => {
      return this.prisma.userBadge.create({
        data: {
          userId,
          badgeId,
          metadata,
        },
        include: {
          badge: true,
        },
      });
    },

    /**
     * Check if user has badge
     */
    hasUserBadge: async (userId: string, badgeId: string) => {
      const userBadge = await this.prisma.userBadge.findUnique({
        where: {
          userId_badgeId: {
            userId,
            badgeId,
          },
        },
      });
      return !!userBadge;
    },

    /**
     * Get all badges
     */
    findAll: async () => {
      return this.prisma.badge.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    },
  };

  /**
   * PUBG-related database operations
   */
  public pubg = {
    /**
     * Update PUBG stats for user
     */
    updateStats: async (userId: string, stats: any) => {
      return this.prisma.pUBGStats.upsert({
        where: {
          userId_seasonId_gameMode: {
            userId,
            seasonId: stats.seasonId,
            gameMode: stats.gameMode,
          },
        },
        update: {
          ...stats,
          lastUpdated: new Date(),
        },
        create: {
          userId,
          ...stats,
        },
      });
    },

    /**
     * Get PUBG leaderboard
     */
    getLeaderboard: async (gameMode: string, seasonId: string, limit: number = 10) => {
      return this.prisma.pUBGStats.findMany({
        where: {
          gameMode,
          seasonId,
        },
        orderBy: {
          currentRankPoint: 'desc',
        },
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              discriminator: true,
              avatar: true,
            },
          },
        },
      });
    },
  };

  /**
   * Cleanup old data
   */
  public async cleanup(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Clean up old audit logs
    await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    // Clean up old ranking snapshots
    await this.prisma.rankingSnapshot.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    this.logger.info('Database cleanup completed');
  }
}