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
    try {
      // Note: Prisma event listeners may not be available in all versions
      // Wrapping in try-catch to handle gracefully
      try {
        // @ts-ignore - Prisma event types may vary by version
        this.prisma.$on('query', (e: any) => {
          if (e.duration > 1000) { // Log slow queries (>1s)
            this.logger.warn(`Slow query detected (${e.duration}ms):`, {
              query: e.query?.substring(0, 200) + '...',
              params: e.params,
              timestamp: new Date().toISOString()
            });
          }
        });
      } catch (queryEventError) {
        this.logger.debug('Query event listener not available:', queryEventError);
      }

      try {
        // @ts-ignore - Prisma event types may vary by version
        this.prisma.$on('error', (e: any) => {
          this.logger.error('Database error event:', e);
        });
      } catch (errorEventError) {
        this.logger.debug('Error event listener not available:', errorEventError);
      }

      try {
        // @ts-ignore - Prisma event types may vary by version
        this.prisma.$on('info', (e: any) => {
          this.logger.info('Database info event:', e.message);
        });
      } catch (infoEventError) {
        this.logger.debug('Info event listener not available:', infoEventError);
      }

      try {
        // @ts-ignore - Prisma event types may vary by version
        this.prisma.$on('warn', (e: any) => {
          this.logger.warn('Database warning event:', e.message);
        });
      } catch (warnEventError) {
        this.logger.debug('Warning event listener not available:', warnEventError);
      }
    } catch (error) {
      this.logger.warn('Failed to setup database event listeners:', error);
    }
  }

  /**
   * Connect to the database with retry logic
   */
  public async connect(maxRetries: number = 3): Promise<void> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.prisma.$connect();
        this.isConnected = true;
        this.logger.info('✅ Connected to database successfully');
        
        // Test the connection
        const isHealthy = await this.healthCheck();
        if (!isHealthy) {
          throw new Error('Database health check failed after connection');
        }
        
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        this.logger.warn(`❌ Database connection attempt ${attempt}/${maxRetries} failed:`, error);
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
          this.logger.info(`Retrying database connection in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    this.logger.error('❌ Failed to connect to database after all retries');
    throw lastError;
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
     * Create or update user with validation
     */
    upsert: async (data: {
      id: string;
      username: string;
      discriminator: string;
      avatar?: string;
    }) => {
      // Validate input data
      if (!data.id || typeof data.id !== 'string') {
        throw new Error('Invalid user ID provided');
      }
      if (!data.username || typeof data.username !== 'string') {
        throw new Error('Invalid username provided');
      }
      if (!data.discriminator || typeof data.discriminator !== 'string') {
        throw new Error('Invalid discriminator provided');
      }
      
      try {
        return await this.prisma.user.upsert({
          where: { id: data.id },
          update: {
            username: data.username.substring(0, 32), // Discord username limit
            discriminator: data.discriminator,
            avatar: data.avatar,
            updatedAt: new Date(),
          },
          create: {
            id: data.id,
            username: data.username.substring(0, 32),
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
      } catch (error) {
        this.logger.error(`Failed to upsert user ${data.id}:`, error);
        throw new Error(`Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    /**
     * Update user XP and level with validation and atomic operation
     */
    updateXP: async (userId: string, xpGain: number) => {
      // Validate input
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID provided');
      }
      if (typeof xpGain !== 'number' || isNaN(xpGain)) {
        throw new Error('Invalid XP gain value');
      }
      if (xpGain < 0) {
        throw new Error('XP gain cannot be negative');
      }
      if (xpGain > 10000) { // Reasonable limit to prevent abuse
        throw new Error('XP gain exceeds maximum allowed value');
      }

      try {
        return await this.prisma.$transaction(async (prisma) => {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, xp: true, totalXp: true, level: true }
          });

          if (!user) {
            throw new Error(`User with ID ${userId} not found`);
          }

          const newXP = Math.max(0, user.xp + xpGain);
          const newTotalXP = Math.max(0, user.totalXp + xpGain);
          const newLevel = Math.floor(Math.sqrt(newTotalXP / 100)) + 1;

          return await prisma.user.update({
            where: { id: userId },
            data: {
              xp: newXP,
              totalXp: newTotalXP,
              level: newLevel,
              updatedAt: new Date(),
            },
          });
        });
      } catch (error) {
        this.logger.error(`Failed to update XP for user ${userId}:`, error);
        throw new Error(`XP update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
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
   * Cleanup old data with configurable retention periods
   */
  public async cleanup(retentionDays: number = 30): Promise<void> {
    if (retentionDays < 1) {
      throw new Error('Retention days must be at least 1');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const results = await this.prisma.$transaction(async (prisma) => {
        // Clean up old audit logs
        const auditLogsDeleted = await prisma.auditLog.deleteMany({
          where: {
            createdAt: {
              lt: cutoffDate,
            },
          },
        });

        // Clean up old ranking snapshots
        const rankingSnapshotsDeleted = await prisma.rankingSnapshot.deleteMany({
          where: {
            createdAt: {
              lt: cutoffDate,
            },
          },
        });

        // Clean up old transactions (keep financial records longer)
        const transactionCutoff = new Date();
        transactionCutoff.setDate(transactionCutoff.getDate() - (retentionDays * 3));
        
        const transactionsDeleted = await prisma.transaction.deleteMany({
          where: {
            createdAt: {
              lt: transactionCutoff,
            },
          },
        });

        return {
          auditLogs: auditLogsDeleted.count,
          rankingSnapshots: rankingSnapshotsDeleted.count,
          transactions: transactionsDeleted.count,
        };
      });

      this.logger.info(`Database cleanup completed:`, {
        auditLogsDeleted: results.auditLogs,
        rankingSnapshotsDeleted: results.rankingSnapshots,
        transactionsDeleted: results.transactions,
        retentionDays,
      });
    } catch (error) {
      this.logger.error('Database cleanup failed:', error);
      throw new Error(`Cleanup operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify database integrity and consistency
   */
  public async verifyIntegrity(): Promise<{
    isHealthy: boolean;
    issues: string[];
    stats: any;
  }> {
    const issues: string[] = [];
    let isHealthy = true;

    try {
      // Check basic connectivity
      const healthCheck = await this.healthCheck();
      if (!healthCheck) {
        issues.push('Database connectivity check failed');
        isHealthy = false;
      }

      // Check for orphaned records
      const orphanedUserBadges = await this.prisma.userBadge.count({
        where: {
          badgeId: {
            not: {
              in: await this.prisma.badge.findMany({ select: { id: true } }).then(badges => badges.map(b => b.id))
            }
          }
        },
      });
      
      if (orphanedUserBadges > 0) {
        issues.push(`Found ${orphanedUserBadges} orphaned user badges`);
        isHealthy = false;
      }

      // Check for users without stats
      const usersWithoutStats = await this.prisma.user.count({
        where: {
          stats: null,
        },
      });
      
      if (usersWithoutStats > 0) {
        issues.push(`Found ${usersWithoutStats} users without stats records`);
        isHealthy = false;
      }

      // Get current stats
      const stats = await this.getStats();

      return {
        isHealthy,
        issues,
        stats,
      };
    } catch (error) {
      this.logger.error('Database integrity check failed:', error);
      return {
        isHealthy: false,
        issues: [`Integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        stats: null,
      };
    }
  }

  /**
   * Graceful shutdown with connection cleanup
   */
  public async shutdown(): Promise<void> {
    try {
      this.logger.info('Initiating database shutdown...');
      
      // Wait for any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await this.disconnect();
      this.logger.info('✅ Database shutdown completed');
    } catch (error) {
      this.logger.error('❌ Error during database shutdown:', error);
      throw error;
    }
  }
}