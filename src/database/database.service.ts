import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';
import { EmbedBuilder, TextChannel } from 'discord.js';
import { StructuredLogger, StructuredLoggerConfig } from '../services/structured-logger.service';

/**
 * Database service class for managing Prisma client and database operations
 */
export class DatabaseService {
  private prisma: PrismaClient;
  private logger: Logger;
  private structuredLogger: StructuredLogger;
  private isConnected: boolean = false;

  /**
   * Get Prisma client instance
   */
  get client(): PrismaClient {
    return this.prisma;
  }

  constructor(structuredLoggerConfig?: StructuredLoggerConfig) {
    this.logger = new Logger();
    this.structuredLogger = new StructuredLogger(
      structuredLoggerConfig || {
        level: 'info',
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        logDir: './logs',
        maxFiles: 14,
        maxSize: '20m',
        enableConsole: true,
        enableFile: true,
      },
    );
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
          // Log database operation with structured logger
          this.structuredLogger.logDatabase('query', 'unknown', e.duration, true);

          if (e.duration > 1000) {
            // Log slow queries (>1s)
            this.logger.warn(`Slow query detected (${e.duration}ms):`, {
              metadata: {
                query: e.query?.substring(0, 200) + '...',
                params: e.params,
                timestamp: new Date().toISOString(),
                duration: e.duration,
              },
            });
          }
        });
      } catch (queryEventError) {
        this.logger.debug('Query event listener not available:', queryEventError);
      }

      try {
        // @ts-ignore - Prisma event types may vary by version
        this.prisma.$on('error', (e: any) => {
          this.structuredLogger.logDatabase(
            'error',
            'unknown',
            0,
            false,
            new Error(e.message || e),
          );
          this.logger.error('Database error event:', e);
        });
      } catch (errorEventError) {
        this.logger.debug('Error event listener not available:', errorEventError);
      }

      // Temporarily disabled info event listener to debug startup issue
      // try {
      //   // @ts-ignore - Prisma event types may vary by version
      //   this.prisma.$on('info', (e: any) => {
      //     this.logger.info('Database info event:', e.message || e);
      //     // Continue execution after logging
      //   });
      // } catch (infoEventError) {
      //   this.logger.debug('Info event listener not available:', infoEventError);
      // }

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
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.prisma.$connect();
        this.isConnected = true;

        const duration = Date.now() - startTime;
        this.structuredLogger.logDatabase('connect', 'database', duration, true);

        this.logger.info('✅ Connected to database successfully');

        // Test the connection
        const isHealthy = await this.healthCheck();
        if (!isHealthy) {
          throw new Error('Database health check failed after connection');
        }

        return; // Success, exit retry loop
      } catch (error) {
        lastError = error;

        this.structuredLogger.logDatabase('connect', 'database', 0, false, error);

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
    const startTime = Date.now();

    try {
      await this.prisma.$disconnect();
      this.isConnected = false;

      const duration = Date.now() - startTime;
      this.structuredLogger.logDatabase('disconnect', 'database', duration, true);

      this.logger.info('✅ Disconnected from database successfully');
    } catch (error) {
      this.structuredLogger.logDatabase('disconnect', 'database', 0, false, error);

      this.logger.error('❌ Failed to disconnect from database:', error);
      throw error;
    }
  }

  /**
   * Health check for database connection
   */
  public async healthCheck(): Promise<boolean> {
    const startTime = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      const duration = Date.now() - startTime;
      this.structuredLogger.logDatabase('healthCheck', 'database', duration, true);

      return true;
    } catch (error) {
      this.structuredLogger.logDatabase('healthCheck', 'database', 0, false, error);

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
   * Execute raw SQL query
   */
  public async query(sql: string, params?: any[]): Promise<any[]> {
    if (!this.isConnected) {
      throw new Error('Database is not connected. Call connect() first.');
    }

    try {
      // For queries with parameters, use $queryRaw with template literal
      if (params && params.length > 0) {
        // Replace ? placeholders with actual values for $queryRawUnsafe
        let processedSql = sql;
        params.forEach((param, index) => {
          const placeholder = '$' + (index + 1);
          if (typeof param === 'string') {
            processedSql = processedSql.replace('?', `'${param.replace(/'/g, '\'\'')}'`);
          } else if (param === null) {
            processedSql = processedSql.replace('?', 'NULL');
          } else {
            processedSql = processedSql.replace('?', String(param));
          }
        });
        return await this.prisma.$queryRawUnsafe(processedSql);
      } else {
        // For simple queries without parameters
        return await this.prisma.$queryRawUnsafe(sql);
      }
    } catch (error) {
      this.logger.error('Database query failed:', {
        error: error as Error,
      });
      throw error;
    }
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
        throw new Error(
          `Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
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
      if (xpGain > 10000) {
        // Reasonable limit to prevent abuse
        throw new Error('XP gain exceeds maximum allowed value');
      }

      try {
        return await this.prisma.$transaction(async prisma => {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, xp: true, totalXp: true, level: true },
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
        throw new Error(
          `XP update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },

    /**
     * Update user coins
     */
    updateCoins: async (userId: string, amount: number, reason: string) => {
      return this.prisma.$transaction(async prisma => {
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
      const orderBy =
        type === 'xp'
          ? { totalXp: 'desc' as const }
          : type === 'level'
            ? { level: 'desc' as const }
            : { coins: 'desc' as const };

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
    upsert: async (data: { id: string; name: string; icon?: string; ownerId: string }) => {
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
      try {
        const result = await this.prisma.pUBGStats.upsert({
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

        this.logger.info(`PUBG stats updated for user ${userId}:`, {
          metadata: {
            gameMode: stats.gameMode,
            seasonId: stats.seasonId,
            rankPoints: stats.currentRankPoint,
            tier: stats.currentTier,
          },
        });

        return result;
      } catch (error) {
        this.logger.error(`Failed to update PUBG stats for user ${userId}:`, error);
        throw error;
      }
    },

    /**
     * Get PUBG stats for user
     */
    getUserStats: async (userId: string, seasonId?: string, gameMode?: string) => {
      try {
        const where: any = { userId };
        if (seasonId) {
          where.seasonId = seasonId;
        }
        if (gameMode) {
          where.gameMode = gameMode;
        }

        return await this.prisma.pUBGStats.findMany({
          where,
          orderBy: {
            lastUpdated: 'desc',
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                pubgUsername: true,
                pubgPlatform: true,
              },
            },
          },
        });
      } catch (error) {
        this.logger.error(`Failed to get PUBG stats for user ${userId}:`, error);
        throw error;
      }
    },

    /**
     * Get PUBG leaderboard
     */
    getLeaderboard: async (gameMode: string, seasonId: string, limit: number = 10) => {
      try {
        return await this.prisma.pUBGStats.findMany({
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
                pubgUsername: true,
                pubgPlatform: true,
              },
            },
          },
        });
      } catch (error) {
        this.logger.error(`Failed to get PUBG leaderboard for ${gameMode}/${seasonId}:`, error);
        throw error;
      }
    },

    /**
     * Delete old PUBG stats
     */
    cleanupOldStats: async (retentionDays: number = 90) => {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const result = await this.prisma.pUBGStats.deleteMany({
          where: {
            lastUpdated: {
              lt: cutoffDate,
            },
          },
        });

        this.logger.info(`Cleaned up ${result.count} old PUBG stats records`);
        return result;
      } catch (error) {
        this.logger.error('Failed to cleanup old PUBG stats:', error);
        throw error;
      }
    },

    /**
     * Get PUBG stats summary
     */
    getStatsSummary: async () => {
      try {
        const [totalStats, uniqueUsers, latestSeason] = await Promise.all([
          this.prisma.pUBGStats.count(),
          this.prisma.pUBGStats.groupBy({
            by: ['userId'],
            _count: true,
          }),
          this.prisma.pUBGStats.findFirst({
            orderBy: {
              lastUpdated: 'desc',
            },
            select: {
              seasonId: true,
            },
          }),
        ]);

        return {
          totalStats,
          uniqueUsers: uniqueUsers.length,
          latestSeason: latestSeason?.seasonId,
        };
      } catch (error) {
        this.logger.error('Failed to get PUBG stats summary:', error);
        throw error;
      }
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
      const results = await this.prisma.$transaction(async prisma => {
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
        transactionCutoff.setDate(transactionCutoff.getDate() - retentionDays * 3);

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

      this.logger.info('Database cleanup completed:', {
        metadata: {
          auditLogsDeleted: results.auditLogs,
          rankingSnapshotsDeleted: results.rankingSnapshots,
          transactionsDeleted: results.transactions,
          retentionDays,
        },
      });
    } catch (error) {
      this.logger.error('Database cleanup failed:', error);
      throw new Error(
        `Cleanup operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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
              in: await this.prisma.badge
                .findMany({ select: { id: true } })
                .then(badges => badges.map(b => b.id)),
            },
          },
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
        issues: [
          `Integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
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

  /**
   * Log to Discord channel with formatted embed
   */
  private async logToChannel(
    channel: TextChannel | null,
    title: string,
    status: 'success' | 'warning' | 'error',
    userId?: string,
    pubgName?: string,
    playerId?: string,
    platform?: string,
    message?: string,
    details?: string,
    error?: any,
  ): Promise<void> {
    if (!channel) {
      return;
    }

    try {
      const colors = {
        success: 0x00ff00,
        warning: 0xffaa00,
        error: 0xff0000,
      };

      const embed = new EmbedBuilder()
        .setTitle(`🗃️ Database | ${title}`)
        .setColor(colors[status])
        .setTimestamp();

      if (userId) {
        embed.addFields({ name: '👤 User ID', value: userId, inline: true });
      }
      if (pubgName) {
        embed.addFields({ name: '🎮 PUBG Name', value: pubgName, inline: true });
      }
      if (playerId) {
        embed.addFields({ name: '🆔 Player ID', value: playerId, inline: true });
      }
      if (platform) {
        embed.addFields({ name: '🖥️ Platform', value: platform, inline: true });
      }
      if (message) {
        embed.addFields({ name: '📝 Message', value: message, inline: false });
      }
      if (details) {
        embed.addFields({ name: '📊 Details', value: details, inline: false });
      }
      if (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        embed.addFields({ name: '❌ Error', value: errorMsg.substring(0, 1024), inline: false });
      }

      await channel.send({ embeds: [embed] });
    } catch (logError) {
      this.logger.error('Failed to send log to Discord channel:', logError);
    }
  }
}
