import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { CacheService } from './cache.service';
import { PUBGService } from './pubg.service';
import { BadgeService } from './badge.service';
import { XPService } from './xp.service';
import { LoggingService } from './logging.service';
import { ExtendedClient } from '../types/client';
import { PUBGPlatform } from '../types/pubg';
import { TextChannel, EmbedBuilder } from 'discord.js';
import * as cron from 'node-cron';

export interface WeaponMasteryData {
  weaponName: string;
  level: number;
  xp: number;
  kills: number;
  headshots: number;
  damage: number;
  accuracy: number;
  tier: string;
  medals: WeaponMedal[];
  lastUpdated: Date;
}

export interface WeaponMedal {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  unlockedAt: Date;
}

export interface UserWeaponMastery {
  userId: string;
  pubgName: string;
  weapons: WeaponMasteryData[];
  totalLevel: number;
  totalXP: number;
  favoriteWeapon: string;
  lastSyncAt: Date;
}

export interface WeaponMasteryStats {
  totalUsers: number;
  totalWeapons: number;
  averageLevel: number;
  topWeapons: Array<{
    name: string;
    users: number;
    averageLevel: number;
  }>;
  topPlayers: Array<{
    userId: string;
    pubgName: string;
    totalLevel: number;
    weaponCount: number;
  }>;
}

/**
 * Weapon Mastery Service for managing PUBG weapon progression
 */
export class WeaponMasteryService {
  private client: ExtendedClient;
  private logger: Logger;
  private database: DatabaseService;
  private cache: CacheService;
  private pubg: PUBGService;
  private badge: BadgeService;
  private xp: XPService;
  private loggingService: LoggingService;

  private syncJob?: cron.ScheduledTask;
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly SYNC_INTERVAL = 21600; // 6 hours

  constructor(client: ExtendedClient, loggingService?: LoggingService) {
    this.client = client;
    this.logger = new Logger();
    this.database = client.database;
    this.cache = client.cache;
    this.pubg = (client as any).pubgService;
    this.badge = (client as any).badgeService;
    this.xp = (client as any).xpService;
    this.loggingService = loggingService || (client as any).loggingService;

    if (!this.loggingService) {
      throw new Error('LoggingService is required for WeaponMasteryService');
    }

    this.startSyncScheduler();
  }

  /**
   * Start automatic sync scheduler (every 6 hours)
   */
  private startSyncScheduler(): void {
    this.syncJob = cron.schedule(
      '0 */6 * * *',
      async () => {
        this.logger.info('Starting scheduled weapon mastery sync...');
        await this.syncAllUsersWeaponMastery();
      },
      {
        timezone: 'UTC',
      },
    );

    this.logger.info('Weapon mastery sync scheduled every 6 hours');
  }

  /**
   * Sync weapon mastery for all users
   */
  public async syncAllUsersWeaponMastery(): Promise<void> {
    try {
      this.logger.info('Starting bulk weapon mastery sync...');

      // Get all users with PUBG names
      const users = await this.database.client.user.findMany({
        where: {
          pubgUsername: {
            not: null,
          },
        },
        select: {
          id: true,
          pubgUsername: true,
        },
      });

      let syncedCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          if (user.pubgUsername) {
            const synced = await this.syncUserWeaponMastery(user.id, user.pubgUsername);
            if (synced) {
              syncedCount++;
            }
          }

          // Rate limiting: wait 200ms between requests
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          this.logger.error(`Failed to sync weapon mastery for user ${user.id}:`, error);
          errorCount++;
        }
      }

      // Update cache with last sync time
      await this.cache.set('weapon_mastery_last_sync', new Date().toISOString(), 86400);

      this.logger.info(
        `Weapon mastery sync completed. Synced: ${syncedCount}, Errors: ${errorCount}, Total: ${users.length}`,
      );
    } catch (error) {
      this.logger.error('Failed to sync all users weapon mastery:', error);
      throw error;
    }
  }

  /**
   * Sync weapon mastery for a specific user
   */
  public async syncUserWeaponMastery(discordId: string, pubgName: string): Promise<boolean> {
    try {
      // Check if PUBG service is available
      if (!this.pubg) {
        this.logger.error('PUBG service not available for weapon mastery sync');
        await this.logWeaponMasteryOperation({
          operation: 'Weapon Mastery Sync',
          status: 'error',
          message: 'PUBG service not available',
          data: {
            event: 'Weapon Mastery Sync',
            userId: discordId,
            pubgName: pubgName,
            timestamp: new Date().toISOString(),
          },
        });
        return false;
      }

      // Check PUBG service health
      try {
        const healthCheck = await this.pubg.healthCheck();
        if (healthCheck.status !== 'healthy' || !healthCheck.api) {
          this.logger.warn('PUBG service is unhealthy, skipping weapon mastery sync');
          await this.logWeaponMasteryOperation({
            operation: 'Weapon Mastery Sync',
            status: 'warning',
            message: 'PUBG service is unhealthy',
            data: {
              event: 'Weapon Mastery Sync',
              userId: discordId,
              pubgName: pubgName,
              details: healthCheck,
              timestamp: new Date().toISOString(),
            },
          });
          return false;
        }
      } catch (error) {
        this.logger.error('Failed to check PUBG service health:', error);
        await this.logWeaponMasteryOperation({
          operation: 'Weapon Mastery Sync',
          status: 'error',
          message: 'Failed to check PUBG service health',
          data: {
            event: 'Weapon Mastery Sync',
            userId: discordId,
            pubgName: pubgName,
            error: error instanceof Error ? error : new Error(String(error)),
            timestamp: new Date().toISOString(),
          },
        });
        return false;
      }

      // Check cache first (avoid too frequent updates)
      const cacheKey = `weapon_mastery_${discordId}`;
      const cachedData = await this.cache.get(cacheKey);

      if (cachedData) {
        const parsedData = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        if (parsedData && parsedData.lastSyncAt) {
          const lastSync = new Date(parsedData.lastSyncAt);
          const timeDiff = Date.now() - lastSync.getTime();

          // Skip if synced less than 1 hour ago
          if (timeDiff < 3600000) {
            this.logger.info(
              `Weapon mastery sync skipped for ${pubgName} - synced ${Math.round(timeDiff / 60000)} minutes ago`,
            );
            return false;
          }
        }
      }

      // Get PUBG player data
      const player = await this.pubg.getPlayerByName(pubgName);
      if (!player) {
        this.logger.warn(`Player not found: ${pubgName}`);
        await this.logWeaponMasteryOperation({
          operation: 'Weapon Mastery Sync',
          status: 'warning',
          message: 'PUBG player not found',
          data: {
            event: 'Weapon Mastery Sync',
            userId: discordId,
            pubgName: pubgName,
            timestamp: new Date().toISOString(),
          },
        });
        return false;
      }

      // Get weapon mastery data from PUBG API
      const weaponMasteryData = await this.pubg.getWeaponMastery(player.id, PUBGPlatform.STEAM);
      if (!weaponMasteryData) {
        this.logger.warn(`No weapon mastery data found for player: ${pubgName}`);
        await this.logWeaponMasteryOperation({
          operation: 'Weapon Mastery Sync',
          status: 'warning',
          message: 'No weapon mastery data found',
          data: {
            event: 'Weapon Mastery Sync',
            userId: discordId,
            pubgName: pubgName,
            playerId: player.id,
            timestamp: new Date().toISOString(),
          },
        });
        return false;
      }

      // Extract weapon mastery badges
      const weaponBadges = this.pubg.extractWeaponMasteryBadges(weaponMasteryData);

      // Process weapon mastery data
      const weapons: WeaponMasteryData[] = weaponBadges.map(badge => ({
        weaponName: badge.weaponName,
        level: badge.level,
        xp: badge.xp,
        kills: 0, // Will be populated from detailed stats if available
        headshots: 0,
        damage: 0,
        accuracy: 0,
        tier: badge.tier,
        medals: badge.medals.map(medal => ({
          id: medal.id || `medal_${Date.now()}`,
          name: medal.name || 'Unknown Medal',
          description: medal.description || '',
          icon: medal.icon || '🏅',
          rarity: this.getMedalRarity(medal.tier || 'common'),
          unlockedAt: new Date(medal.unlockedAt || Date.now()),
        })),
        lastUpdated: new Date(),
      }));

      // Calculate totals
      const totalLevel = weapons.reduce((sum, weapon) => sum + weapon.level, 0);
      const totalXP = weapons.reduce((sum, weapon) => sum + weapon.xp, 0);
      const favoriteWeapon = weapons.sort((a, b) => b.level - a.level)[0]?.weaponName || 'Unknown';

      const userMastery: UserWeaponMastery = {
        userId: discordId,
        pubgName,
        weapons,
        totalLevel,
        totalXP,
        favoriteWeapon,
        lastSyncAt: new Date(),
      };

      // Save to database
      await this.saveUserWeaponMastery(userMastery);

      // Check and award weapon mastery badges
      await this.checkWeaponMasteryBadges(discordId, weapons);

      // Award XP for weapon mastery milestones
      await this.awardMasteryXP(discordId, weapons);

      // Cache the result
      await this.cache.set(cacheKey, JSON.stringify(userMastery), this.CACHE_TTL);

      // Log successful sync
      await this.logWeaponMasteryOperation({
        operation: 'Weapon Mastery Sync',
        status: 'success',
        message: 'Weapon mastery synchronized successfully',
        data: {
          event: 'Weapon Mastery Sync',
          userId: discordId,
          pubgName: pubgName,
          details: {
            weaponsCount: weapons.length,
            totalLevel: totalLevel,
            totalXP: totalXP,
            favoriteWeapon: favoriteWeapon,
          },
          timestamp: new Date().toISOString(),
        },
      });

      this.logger.info(
        `Synced weapon mastery for ${pubgName}: ${weapons.length} weapons, ${totalLevel} total levels`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to sync weapon mastery for user ${discordId}:`, error);

      // Log error to Discord
      await this.logWeaponMasteryOperation({
        operation: 'Weapon Mastery Sync',
        status: 'error',
        message: 'Failed to sync weapon mastery',
        data: {
          event: 'Weapon Mastery Sync',
          userId: discordId,
          pubgName: pubgName,
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date().toISOString(),
        },
      });

      return false;
    }
  }

  /**
   * Save user weapon mastery to database
   */
  private async saveUserWeaponMastery(userMastery: UserWeaponMastery): Promise<void> {
    try {
      // Upsert weapon mastery record
      await this.database.client.weaponMastery.upsert({
        where: { userId: userMastery.userId },
        update: {
          pubgName: userMastery.pubgName,
          weapons: JSON.stringify(userMastery.weapons),
          totalLevel: userMastery.totalLevel,
          totalXP: userMastery.totalXP,
          favoriteWeapon: userMastery.favoriteWeapon,
          lastSyncAt: userMastery.lastSyncAt,
        },
        create: {
          userId: userMastery.userId,
          pubgName: userMastery.pubgName,
          weapons: JSON.stringify(userMastery.weapons),
          totalLevel: userMastery.totalLevel,
          totalXP: userMastery.totalXP,
          favoriteWeapon: userMastery.favoriteWeapon,
          lastSyncAt: userMastery.lastSyncAt,
        },
      });
    } catch (error) {
      this.logger.error('Failed to save weapon mastery to database:', error);
      throw error;
    }
  }

  /**
   * Check and award weapon mastery badges
   */
  private async checkWeaponMasteryBadges(
    userId: string,
    weapons: WeaponMasteryData[],
  ): Promise<void> {
    try {
      const awardedBadges: string[] = [];

      for (const weapon of weapons) {
        // Check for weapon-specific mastery badges
        const weaponBadgeId = `weapon_mastery_${weapon.weaponName.toLowerCase()}_${weapon.level}`;

        if (weapon.level >= 20 && !this.badge.hasBadge(userId, weaponBadgeId)) {
          const awarded = await this.badge.awardBadge(userId, weaponBadgeId);
          if (awarded) {
            awardedBadges.push(`${weapon.weaponName} Mastery Level ${weapon.level}`);
          }
        }
      }

      // Check for overall mastery milestones
      const totalLevel = weapons.reduce((sum, weapon) => sum + weapon.level, 0);
      const weaponCount = weapons.length;

      // Award milestone badges
      const milestones = [
        { level: 100, badge: 'weapon_master_novice', name: 'Novato das Armas' },
        { level: 250, badge: 'weapon_master_adept', name: 'Adepto das Armas' },
        { level: 500, badge: 'weapon_master_expert', name: 'Especialista em Armas' },
        { level: 1000, badge: 'weapon_master_legend', name: 'Lenda das Armas' },
      ];

      for (const milestone of milestones) {
        if (totalLevel >= milestone.level && !this.badge.hasBadge(userId, milestone.badge)) {
          const awarded = await this.badge.awardBadge(userId, milestone.badge);
          if (awarded) {
            awardedBadges.push(milestone.name);
          }
        }
      }

      if (awardedBadges.length > 0) {
        this.logger.info(
          `Awarded weapon mastery badges to user ${userId}: ${awardedBadges.join(', ')}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to check weapon mastery badges for user ${userId}:`, error);
    }
  }

  /**
   * Award XP for weapon mastery milestones
   */
  private async awardMasteryXP(userId: string, weapons: WeaponMasteryData[]): Promise<void> {
    try {
      let totalXPAwarded = 0;

      for (const weapon of weapons) {
        // Award XP based on weapon level milestones
        const levelMilestones = [20, 40, 60, 80, 100];

        for (const milestone of levelMilestones) {
          if (weapon.level >= milestone) {
            const xpAmount = milestone * 5; // 5 XP per milestone level
            await this.xp.addXP(userId, 'WEAPON_MASTERY', undefined, xpAmount / 100);
            totalXPAwarded += xpAmount;
          }
        }
      }

      if (totalXPAwarded > 0) {
        this.logger.info(`Awarded ${totalXPAwarded} XP for weapon mastery to user ${userId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to award mastery XP to user ${userId}:`, error);
    }
  }

  /**
   * Get medal rarity based on tier
   */
  private getMedalRarity(tier: string): string {
    const tierMap: Record<string, string> = {
      bronze: 'common',
      silver: 'uncommon',
      gold: 'rare',
      platinum: 'epic',
      diamond: 'legendary',
      master: 'mythic',
    };

    return tierMap[tier.toLowerCase()] || 'common';
  }

  /**
   * Get user weapon mastery data
   */
  public async getUserWeaponMastery(userId: string): Promise<UserWeaponMastery | null> {
    try {
      const cacheKey = `weapon_mastery_${userId}`;
      const cachedData = await this.cache.get(cacheKey);

      if (cachedData && typeof cachedData === 'string') {
        return JSON.parse(cachedData);
      }

      // Get from database
      const masteryRecord = await this.database.client.weaponMastery.findUnique({
        where: { userId },
      });

      if (!masteryRecord) {
        return null;
      }

      const userMastery: UserWeaponMastery = {
        userId: masteryRecord.userId,
        pubgName: masteryRecord.pubgName,
        weapons: JSON.parse(masteryRecord.weapons),
        totalLevel: masteryRecord.totalLevel,
        totalXP: masteryRecord.totalXP,
        favoriteWeapon: masteryRecord.favoriteWeapon,
        lastSyncAt: masteryRecord.lastSyncAt,
      };

      // Cache the result
      await this.cache.set(cacheKey, JSON.stringify(userMastery), this.CACHE_TTL);

      return userMastery;
    } catch (error) {
      this.logger.error(`Failed to get weapon mastery for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get weapon mastery leaderboard
   */
  public async getWeaponMasteryLeaderboard(limit: number = 10): Promise<
    Array<{
      userId: string;
      pubgName: string;
      totalLevel: number;
      totalXP: number;
      favoriteWeapon: string;
      weaponCount: number;
    }>
  > {
    try {
      const records = await this.database.client.weaponMastery.findMany({
        orderBy: {
          totalLevel: 'desc',
        },
        take: limit,
      });

      return records.map(record => ({
        userId: record.userId,
        pubgName: record.pubgName,
        totalLevel: record.totalLevel,
        totalXP: record.totalXP,
        favoriteWeapon: record.favoriteWeapon,
        weaponCount: JSON.parse(record.weapons).length,
      }));
    } catch (error) {
      this.logger.error('Failed to get weapon mastery leaderboard:', error);
      return [];
    }
  }

  /**
   * Get weapon mastery statistics
   */
  public async getWeaponMasteryStats(): Promise<WeaponMasteryStats> {
    try {
      const records = await this.database.client.weaponMastery.findMany();

      const totalUsers = records.length;
      let totalWeapons = 0;
      let totalLevels = 0;
      const weaponStats: Record<string, { users: number; totalLevel: number }> = {};

      for (const record of records) {
        const weapons: WeaponMasteryData[] = JSON.parse(record.weapons);
        totalWeapons += weapons.length;
        totalLevels += record.totalLevel;

        for (const weapon of weapons) {
          if (!weaponStats[weapon.weaponName]) {
            weaponStats[weapon.weaponName] = { users: 0, totalLevel: 0 };
          }
          weaponStats[weapon.weaponName]!.users++;
          weaponStats[weapon.weaponName]!.totalLevel += weapon.level;
        }
      }

      const topWeapons = Object.entries(weaponStats)
        .map(([name, stats]) => ({
          name,
          users: stats.users,
          averageLevel: stats.totalLevel / stats.users,
        }))
        .sort((a, b) => b.users - a.users)
        .slice(0, 10);

      const topPlayers = records
        .map(record => ({
          userId: record.userId,
          pubgName: record.pubgName,
          totalLevel: record.totalLevel,
          weaponCount: JSON.parse(record.weapons).length,
        }))
        .sort((a, b) => b.totalLevel - a.totalLevel)
        .slice(0, 10);

      return {
        totalUsers,
        totalWeapons,
        averageLevel: totalUsers > 0 ? totalLevels / totalUsers : 0,
        topWeapons,
        topPlayers,
      };
    } catch (error) {
      this.logger.error('Failed to get weapon mastery stats:', error);
      return {
        totalUsers: 0,
        totalWeapons: 0,
        averageLevel: 0,
        topWeapons: [],
        topPlayers: [],
      };
    }
  }

  /**
   * Force sync user weapon mastery (bypass cache)
   */
  public async forceSyncUserWeaponMastery(userId: string, pubgName: string): Promise<boolean> {
    try {
      // Clear cache first
      const cacheKey = `weapon_mastery_${userId}`;
      await this.cache.del(cacheKey);

      // Sync weapon mastery
      return await this.syncUserWeaponMastery(userId, pubgName);
    } catch (error) {
      this.logger.error(`Failed to force sync weapon mastery for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Stop scheduled sync
   */
  public stopScheduledSync(): void {
    if (this.syncJob) {
      this.syncJob.stop();
      this.logger.info('Stopped scheduled weapon mastery sync');
    }
  }

  /**
   * Get next sync time
   */
  public getNextSyncTime(): Date {
    const now = new Date();
    const nextSync = new Date(now);

    // Find next 6-hour interval (00:00, 06:00, 12:00, 18:00)
    const currentHour = now.getUTCHours();
    const nextSyncHour = Math.ceil((currentHour + 1) / 6) * 6;

    if (nextSyncHour >= 24) {
      nextSync.setUTCDate(nextSync.getUTCDate() + 1);
      nextSync.setUTCHours(0, 0, 0, 0);
    } else {
      nextSync.setUTCHours(nextSyncHour, 0, 0, 0);
    }

    return nextSync;
  }

  /**
   * Log weapon mastery operations using LoggingService
   */
  private async logWeaponMasteryOperation({
    operation,
    status,
    message,
    data,
  }: {
    operation: string;
    status: 'success' | 'warning' | 'error';
    message: string;
    data?: any;
  }): Promise<void> {
    try {
      const guildId = this.client.guilds.cache.first()?.id;
      if (!guildId) {
        return;
      }

      await this.loggingService.logWeaponMastery(
        guildId,
        operation,
        data?.userId || 'system',
        data?.weaponName,
        status === 'success',
        status === 'error' ? message : undefined,
        data,
      );
    } catch (error) {
      this.logger.error('Failed to log weapon mastery operation:', error);
    }
  }
}
