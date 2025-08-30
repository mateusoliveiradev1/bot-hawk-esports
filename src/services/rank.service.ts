import { Client, Guild, GuildMember, Role } from 'discord.js';
import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { CacheService } from './cache.service';
import { PUBGService } from './pubg.service';
import { PUBGPlatform } from '../types/pubg';
import cron from 'node-cron';

export interface RankMapping {
  tier: string;
  subTier: string;
  minRP: number;
  maxRP: number;
  roleName: string;
  roleColor: string;
  priority: number;
}

export interface UserRankData {
  userId: string;
  pubgName: string;
  currentTier: string;
  currentSubTier: string;
  currentRP: number;
  lastUpdated: Date;
}

export class RankService {
  private client: Client;
  private logger: Logger;
  private database: DatabaseService;
  private cache: CacheService;
  private pubg: PUBGService;
  private rankMappings: Map<string, RankMapping> = new Map();
  private updateJob?: cron.ScheduledTask;

  constructor(client: Client) {
    this.client = client;
    this.logger = (client as any).logger;
    this.database = (client as any).database;
    this.cache = (client as any).cache;
    this.pubg = (client as any).pubg;

    this.initializeRankMappings();
    this.scheduleUpdates();
  }

  /**
   * Initialize rank mappings for PUBG Season 36
   */
  private initializeRankMappings(): void {
    const mappings: RankMapping[] = [
      // Bronze
      { tier: 'Bronze', subTier: 'V', minRP: 0, maxRP: 1199, roleName: 'Bronze V', roleColor: '#CD7F32', priority: 1 },
      { tier: 'Bronze', subTier: 'IV', minRP: 1200, maxRP: 1299, roleName: 'Bronze IV', roleColor: '#CD7F32', priority: 2 },
      { tier: 'Bronze', subTier: 'III', minRP: 1300, maxRP: 1399, roleName: 'Bronze III', roleColor: '#CD7F32', priority: 3 },
      { tier: 'Bronze', subTier: 'II', minRP: 1400, maxRP: 1499, roleName: 'Bronze II', roleColor: '#CD7F32', priority: 4 },
      { tier: 'Bronze', subTier: 'I', minRP: 1500, maxRP: 1599, roleName: 'Bronze I', roleColor: '#CD7F32', priority: 5 },

      // Silver
      { tier: 'Silver', subTier: 'V', minRP: 1600, maxRP: 1699, roleName: 'Silver V', roleColor: '#C0C0C0', priority: 6 },
      { tier: 'Silver', subTier: 'IV', minRP: 1700, maxRP: 1799, roleName: 'Silver IV', roleColor: '#C0C0C0', priority: 7 },
      { tier: 'Silver', subTier: 'III', minRP: 1800, maxRP: 1899, roleName: 'Silver III', roleColor: '#C0C0C0', priority: 8 },
      { tier: 'Silver', subTier: 'II', minRP: 1900, maxRP: 1999, roleName: 'Silver II', roleColor: '#C0C0C0', priority: 9 },
      { tier: 'Silver', subTier: 'I', minRP: 2000, maxRP: 2099, roleName: 'Silver I', roleColor: '#C0C0C0', priority: 10 },

      // Gold
      { tier: 'Gold', subTier: 'V', minRP: 2100, maxRP: 2199, roleName: 'Gold V', roleColor: '#FFD700', priority: 11 },
      { tier: 'Gold', subTier: 'IV', minRP: 2200, maxRP: 2299, roleName: 'Gold IV', roleColor: '#FFD700', priority: 12 },
      { tier: 'Gold', subTier: 'III', minRP: 2300, maxRP: 2399, roleName: 'Gold III', roleColor: '#FFD700', priority: 13 },
      { tier: 'Gold', subTier: 'II', minRP: 2400, maxRP: 2499, roleName: 'Gold II', roleColor: '#FFD700', priority: 14 },
      { tier: 'Gold', subTier: 'I', minRP: 2500, maxRP: 2599, roleName: 'Gold I', roleColor: '#FFD700', priority: 15 },

      // Platinum
      { tier: 'Platinum', subTier: 'V', minRP: 2600, maxRP: 2699, roleName: 'Platinum V', roleColor: '#E5E4E2', priority: 16 },
      { tier: 'Platinum', subTier: 'IV', minRP: 2700, maxRP: 2799, roleName: 'Platinum IV', roleColor: '#E5E4E2', priority: 17 },
      { tier: 'Platinum', subTier: 'III', minRP: 2800, maxRP: 2899, roleName: 'Platinum III', roleColor: '#E5E4E2', priority: 18 },
      { tier: 'Platinum', subTier: 'II', minRP: 2900, maxRP: 2999, roleName: 'Platinum II', roleColor: '#E5E4E2', priority: 19 },
      { tier: 'Platinum', subTier: 'I', minRP: 3000, maxRP: 3099, roleName: 'Platinum I', roleColor: '#E5E4E2', priority: 20 },

      // Diamond
      { tier: 'Diamond', subTier: 'V', minRP: 3100, maxRP: 3199, roleName: 'Diamond V', roleColor: '#B9F2FF', priority: 21 },
      { tier: 'Diamond', subTier: 'IV', minRP: 3200, maxRP: 3299, roleName: 'Diamond IV', roleColor: '#B9F2FF', priority: 22 },
      { tier: 'Diamond', subTier: 'III', minRP: 3300, maxRP: 3399, roleName: 'Diamond III', roleColor: '#B9F2FF', priority: 23 },
      { tier: 'Diamond', subTier: 'II', minRP: 3400, maxRP: 3499, roleName: 'Diamond II', roleColor: '#B9F2FF', priority: 24 },
      { tier: 'Diamond', subTier: 'I', minRP: 3500, maxRP: 3599, roleName: 'Diamond I', roleColor: '#B9F2FF', priority: 25 },

      // Master
      { tier: 'Master', subTier: '', minRP: 3600, maxRP: 4999, roleName: 'Master', roleColor: '#FF6B6B', priority: 26 },

      // Conqueror (Top 500)
      { tier: 'Conqueror', subTier: '', minRP: 5000, maxRP: 999999, roleName: 'Conqueror', roleColor: '#FF0000', priority: 27 },
    ];

    mappings.forEach(mapping => {
      const key = `${mapping.tier}_${mapping.subTier || 'base'}`;
      this.rankMappings.set(key, mapping);
    });

    this.logger.info(`Initialized ${mappings.length} rank mappings for PUBG Season 36`);
  }

  /**
   * Schedule automatic rank updates (08:00 and 20:00 UTC)
   */
  private scheduleUpdates(): void {
    // Update at 04:00 UTC
    this.updateJob = cron.schedule('0 4 * * *', async () => {
      this.logger.info('Starting scheduled rank update (04:00 UTC)');
      await this.updateAllUserRanks();
    }, {
      timezone: 'UTC'
    });

    // Update at 16:00 UTC
    cron.schedule('0 16 * * *', async () => {
      this.logger.info('Starting scheduled rank update (16:00 UTC)');
      await this.updateAllUserRanks();
    }, {
      timezone: 'UTC'
    });

    this.logger.info('Scheduled rank updates for 04:00 and 16:00 UTC');
  }

  /**
   * Update ranks for all users
   */
  public async updateAllUserRanks(): Promise<void> {
    try {
      this.logger.info('Starting bulk rank update for all users...');

      // Get all users with PUBG names
      const users = await this.database.client.user.findMany({
        where: {
          pubgUsername: {
            not: null
          }
        },
        select: {
          id: true,
          pubgUsername: true
        }
      });

      let updatedCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          if (user.pubgUsername) {
            const updated = await this.updateUserRank(user.id, user.pubgUsername);
            if (updated) {
              updatedCount++;
            }
          }

          // Rate limiting: wait 100ms between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          this.logger.error(`Failed to update rank for user ${user.id}:`, error);
          errorCount++;
        }
      }

      // Update cache with last update time
      await this.cache.set('last_rank_update', new Date().toISOString(), 86400);

      this.logger.info(`Bulk rank update completed. Updated: ${updatedCount}, Errors: ${errorCount}, Total: ${users.length}`);
    } catch (error) {
      this.logger.error('Failed to update all user ranks:', error);
      throw error;
    }
  }

  /**
   * Update rank for a specific user
   */
  public async updateUserRank(discordId: string, pubgName: string): Promise<boolean> {
    try {
      // Check cache first (avoid too frequent updates)
      const cacheKey = `user_rank_${discordId}`;
      const cachedData = await this.cache.get<string>(cacheKey);
      
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        const lastUpdate = new Date(parsedData.lastUpdated);
        const timeDiff = Date.now() - lastUpdate.getTime();
        
        // Skip if updated less than 1 hour ago
        if (timeDiff < 3600000) {
          return false;
        }
      }

      // Get PUBG stats
      const pubgStats = await this.pubg.getPlayerStats(pubgName, PUBGPlatform.STEAM);
      if (!pubgStats || !pubgStats.gameModeStats) {
        this.logger.warn(`No stats found for player: ${pubgName}`);
        return false;
      }

      // Get ranked stats from squad mode (most common for ranked)
      const rankedStats = pubgStats.gameModeStats['squad'] || pubgStats.gameModeStats['solo'] || Object.values(pubgStats.gameModeStats)[0];
      if (!rankedStats) {
        this.logger.warn(`No game mode stats found for player: ${pubgName}`);
        return false;
      }

      const currentRP = rankedStats.rankPoints || 0;
      const currentTier = rankedStats.rankPointsTitle?.split(' ')[0] || 'Unranked';
      const currentSubTier = rankedStats.rankPointsTitle?.split(' ')[1] || '';

      // Find matching rank mapping
      const rankMapping = this.getRankMappingByRP(currentRP);
      if (!rankMapping) {
        this.logger.warn(`No rank mapping found for RP: ${currentRP}`);
        return false;
      }

      // Save to database - update or create PUBG stats
      await this.database.client.pUBGStats.upsert({
        where: {
          userId_seasonId_gameMode: {
            userId: discordId,
            seasonId: 'current',
            gameMode: 'squad'
          }
        },
        update: {
          currentTier: currentTier,
          currentSubTier: currentSubTier,
          currentRankPoint: currentRP,
          updatedAt: new Date()
        },
        create: {
          userId: discordId,
          playerId: pubgName,
          playerName: pubgName,
          platform: 'steam',
          seasonId: 'current',
          gameMode: 'squad',
          currentTier: currentTier,
          currentSubTier: currentSubTier,
          currentRankPoint: currentRP
        }
      });

      // Update Discord roles
      await this.updateDiscordRoles(discordId, rankMapping);

      // Cache the result
      const rankData: UserRankData = {
        userId: discordId,
        pubgName,
        currentTier,
        currentSubTier,
        currentRP,
        lastUpdated: new Date()
      };
      
      await this.cache.set(cacheKey, JSON.stringify(rankData), 7200); // 2 hours

      this.logger.info(`Updated rank for ${pubgName}: ${rankMapping.roleName} (${currentRP} RP)`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to update rank for user ${discordId}:`, error);
      return false;
    }
  }

  /**
   * Update Discord roles based on rank
   */
  private async updateDiscordRoles(discordId: string, rankMapping: RankMapping): Promise<void> {
    try {
      // Get all guilds the bot is in
      const guilds = this.client.guilds.cache;
      
      for (const [, guild] of guilds) {
        try {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (!member) continue;

          // Remove old rank roles
          await this.removeOldRankRoles(member, guild);

          // Add new rank role
          await this.addRankRole(member, guild, rankMapping);
        } catch (error) {
          this.logger.error(`Failed to update roles in guild ${guild.name}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to update Discord roles for user ${discordId}:`, error);
    }
  }

  /**
   * Remove old rank roles from member
   */
  private async removeOldRankRoles(member: GuildMember, guild: Guild): Promise<void> {
    const rankRoleNames = Array.from(this.rankMappings.values()).map(mapping => mapping.roleName);
    
    const rolesToRemove = member.roles.cache.filter(role => 
      rankRoleNames.includes(role.name)
    );

    if (rolesToRemove.size > 0) {
      await member.roles.remove(rolesToRemove, 'Rank update - removing old rank roles');
    }
  }

  /**
   * Add rank role to member
   */
  private async addRankRole(member: GuildMember, guild: Guild, rankMapping: RankMapping): Promise<void> {
    let role = guild.roles.cache.find(r => r.name === rankMapping.roleName);
    
    // Create role if it doesn't exist
    if (!role) {
      role = await guild.roles.create({
        name: rankMapping.roleName,
        color: rankMapping.roleColor as any,
        reason: 'Auto-created for PUBG rank system',
        position: rankMapping.priority
      });
      
      this.logger.info(`Created new rank role: ${rankMapping.roleName} in guild ${guild.name}`);
    }

    // Add role to member
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, `PUBG Rank Update: ${rankMapping.roleName}`);
    }
  }

  /**
   * Get rank mapping by RP
   */
  private getRankMappingByRP(rp: number): RankMapping | null {
    for (const mapping of this.rankMappings.values()) {
      if (rp >= mapping.minRP && rp <= mapping.maxRP) {
        return mapping;
      }
    }
    return null;
  }

  /**
   * Get user rank data
   */
  public async getUserRankData(discordId: string): Promise<UserRankData | null> {
    try {
      const cacheKey = `user_rank_${discordId}`;
      const cachedData = await this.cache.get<string>(cacheKey);
      
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      // Get from database
      const user = await this.database.client.user.findUnique({
        where: { id: discordId },
        select: {
          pubgUsername: true,
          pubgStats: {
            where: { seasonId: 'current' },
            orderBy: { updatedAt: 'desc' },
            take: 1
          }
        }
      });

      if (!user || !user.pubgUsername) {
        return null;
      }

      const pubgStats = user.pubgStats[0];
      const rankData: UserRankData = {
        userId: discordId,
        pubgName: user.pubgUsername,
        currentTier: pubgStats?.currentTier || 'Unranked',
        currentSubTier: pubgStats?.currentSubTier || '',
        currentRP: pubgStats?.currentRankPoint || 0,
        lastUpdated: pubgStats?.updatedAt || new Date()
      };

      return rankData;
    } catch (error) {
      this.logger.error(`Failed to get rank data for user ${discordId}:`, error);
      return null;
    }
  }

  /**
   * Get rank leaderboard
   */
  public async getRankLeaderboard(limit: number = 10): Promise<UserRankData[]> {
    try {
      const users = await this.database.client.user.findMany({
        where: {
          pubgStats: {
            some: {
              currentRankPoint: {
                gt: 0
              },
              seasonId: 'current'
            }
          }
        },
        select: {
          id: true,
          pubgUsername: true,
          pubgStats: {
            where: { seasonId: 'current' },
            orderBy: { updatedAt: 'desc' },
            take: 1
          }
        },
        orderBy: {
          pubgStats: {
            _count: 'desc'
          }
        },
        take: limit
      });

      return users
        .filter(user => user.pubgStats.length > 0)
        .sort((a, b) => (b.pubgStats[0]?.currentRankPoint || 0) - (a.pubgStats[0]?.currentRankPoint || 0))
        .map((user: any) => ({
          userId: user.id,
          pubgName: user.pubgUsername || 'Unknown',
          currentTier: user.pubgStats[0]?.currentTier || 'Unranked',
          currentSubTier: user.pubgStats[0]?.currentSubTier || '',
          currentRP: user.pubgStats[0]?.currentRankPoint || 0,
          lastUpdated: user.pubgStats[0]?.updatedAt || new Date()
        }));
    } catch (error) {
      this.logger.error('Failed to get rank leaderboard:', error);
      return [];
    }
  }

  /**
   * Force update user rank (bypass cache)
   */
  public async forceUpdateUserRank(discordId: string, pubgName: string): Promise<boolean> {
    try {
      // Clear cache first
      const cacheKey = `user_rank_${discordId}`;
      await this.cache.del(cacheKey);
      
      // Update rank
      return await this.updateUserRank(discordId, pubgName);
    } catch (error) {
      this.logger.error(`Failed to force update rank for user ${discordId}:`, error);
      return false;
    }
  }

  /**
   * Get all rank mappings
   */
  public getAllRankMappings(): RankMapping[] {
    return Array.from(this.rankMappings.values())
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Stop scheduled updates
   */
  public stopScheduledUpdates(): void {
    if (this.updateJob) {
      this.updateJob.stop();
      this.logger.info('Stopped scheduled rank updates');
    }
  }

  /**
   * Get next update time
   */
  public getNextUpdateTime(): Date {
    const now = new Date();
    const today4AM = new Date(now);
    today4AM.setUTCHours(4, 0, 0, 0);
    
    const today4PM = new Date(now);
    today4PM.setUTCHours(16, 0, 0, 0);
    
    const tomorrow4AM = new Date(today4AM);
    tomorrow4AM.setDate(tomorrow4AM.getDate() + 1);

    if (now < today4AM) {
      return today4AM;
    } else if (now < today4PM) {
      return today4PM;
    } else {
      return tomorrow4AM;
    }
  }
}