import { DatabaseService } from '../database/database.service';
import { Logger } from './logger';

/**
 * Utility class for common database operations
 */
export class DatabaseUtils {
  private static logger = new Logger();

  /**
   * Find or create user in database
   */
  static async findOrCreateUser(
    database: DatabaseService,
    discordId: string,
    guildId: string,
    userData?: {
      username?: string;
      discriminator?: string;
      avatar?: string;
    },
  ) {
    try {
      // First try to find existing user
      let user = await database.client.user.findUnique({
        where: { id: discordId },
        include: {
          guilds: {
            where: { guildId },
          },
        },
      });

      // If user doesn't exist, create them
      if (!user) {
        user = await database.client.user.create({
          data: {
            id: discordId,
            username: userData?.username || 'Unknown',
            discriminator: userData?.discriminator || '0000',
            avatar: userData?.avatar,
            guilds: {
              create: {
                guildId,
                joinedAt: new Date(),
              },
            },
          },
          include: {
            guilds: {
              where: { guildId },
            },
          },
        });
        this.logger.info(`Created new user: ${discordId} in guild: ${guildId}`);
      } else if (user.guilds.length === 0) {
        // User exists but not in this guild
        await database.client.userGuild.create({
          data: {
            userId: user.id,
            guildId,
            joinedAt: new Date(),
          },
        });

        // Refetch user with guild data
        user = await database.client.user.findUnique({
          where: { id: discordId },
          include: {
            guilds: {
              where: { guildId },
            },
          },
        });
        this.logger.info(`Added existing user: ${discordId} to guild: ${guildId}`);
      }

      return user;
    } catch (error) {
      this.logger.error('Failed to find or create user:', error);
      throw error;
    }
  }

  /**
   * Update user statistics safely
   */
  static async updateUserStats(
    database: DatabaseService,
    userId: string,
    updates: {
      xp?: number;
      level?: number;
      coins?: number;
      commandsUsed?: number;
      lastActive?: Date;
    },
  ) {
    try {
      const user = await database.client.user.update({
        where: { id: userId },
        data: {
          ...(updates.xp !== undefined && { xp: { increment: updates.xp } }),
          ...(updates.level !== undefined && { level: updates.level }),
          ...(updates.coins !== undefined && { coins: { increment: updates.coins } }),
          ...(updates.commandsUsed !== undefined && {
            commandsUsed: { increment: updates.commandsUsed },
          }),
          ...(updates.lastActive && { lastActive: updates.lastActive }),
        },
      });

      return user;
    } catch (error) {
      this.logger.error(`Failed to update user stats for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Award badge to user with duplicate check
   */
  static async awardBadge(
    database: DatabaseService,
    userId: string,
    badgeId: string,
    metadata?: any,
  ) {
    try {
      // Check if user already has this badge
      const existingBadge = await database.client.userBadge.findUnique({
        where: {
          userId_badgeId: {
            userId,
            badgeId,
          },
        },
      });

      if (existingBadge) {
        this.logger.warn(`User ${userId} already has badge ${badgeId}`);
        return existingBadge;
      }

      // Award the badge
      const userBadge = await database.client.userBadge.create({
        data: {
          userId,
          badgeId,
          metadata,
          earnedAt: new Date(),
        },
        include: {
          badge: true,
        },
      });

      this.logger.info(`Awarded badge ${badgeId} to user ${userId}`);
      return userBadge;
    } catch (error) {
      this.logger.error(`Failed to award badge ${badgeId} to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Log user activity
   */
  static async logActivity(
    database: DatabaseService,
    userId: string,
    guildId: string,
    activity: {
      type: string;
      description: string;
      metadata?: any;
    },
  ) {
    try {
      await database.client.auditLog.create({
        data: {
          userId,
          guildId,
          action: activity.type,
          reason: activity.description,
          metadata: activity.metadata ? JSON.stringify(activity.metadata) : null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log activity for user ${userId}:`, error);
      // Don't throw error for logging failures
    }
  }

  /**
   * Get user with guild data
   */
  static async getUserWithGuild(database: DatabaseService, discordId: string, guildId: string) {
    try {
      return await database.client.user.findUnique({
        where: { id: discordId },
        include: {
          guilds: {
            where: { guildId },
          },
          badges: {
            include: {
              badge: true,
            },
          },
          pubgStats: true,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to get user ${discordId} for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Batch update multiple users
   */
  static async batchUpdateUsers(
    database: DatabaseService,
    updates: Array<{
      userId: string;
      data: any;
    }>,
  ) {
    try {
      const results = await Promise.allSettled(
        updates.map(update =>
          database.client.user.update({
            where: { id: update.userId },
            data: update.data,
          }),
        ),
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      this.logger.info(`Batch update completed: ${successful} successful, ${failed} failed`);

      return { successful, failed, results };
    } catch (error) {
      this.logger.error('Failed to batch update users:', error);
      throw error;
    }
  }

  /**
   * Clean up old records
   */
  static async cleanupOldRecords(
    database: DatabaseService,
    table: string,
    dateField: string,
    daysOld: number,
  ) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await (database.client as any)[table].deleteMany({
        where: {
          [dateField]: {
            lt: cutoffDate,
          },
        },
      });

      this.logger.info(`Cleaned up ${result.count} old records from ${table}`);
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup old records from ${table}:`, error);
      throw error;
    }
  }

  /**
   * Get paginated results
   */
  static async getPaginatedResults<T>(
    queryFn: (skip: number, take: number) => Promise<T[]>,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: T[]; page: number; limit: number; hasMore: boolean }> {
    try {
      const skip = (page - 1) * limit;
      const take = limit + 1; // Get one extra to check if there are more

      const results = await queryFn(skip, take);
      const hasMore = results.length > limit;

      if (hasMore) {
        results.pop(); // Remove the extra item
      }

      return {
        data: results,
        page,
        limit,
        hasMore,
      };
    } catch (error) {
      this.logger.error('Failed to get paginated results:', error);
      throw error;
    }
  }
}
