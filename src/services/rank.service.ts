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
    if (!client) {
      throw new Error('Discord client is required');
    }

    this.client = client;
    this.logger = (client as any).logger;
    this.database = (client as any).database;
    this.cache = (client as any).cache;
    this.pubg = (client as any).pubg;

    // Validate required services
    if (!this.logger) {
      throw new Error('Logger service is not available');
    }
    if (!this.database?.client) {
      throw new Error('Database service is not available');
    }
    if (!this.cache) {
      throw new Error('Cache service is not available');
    }
    if (!this.pubg) {
      throw new Error('PUBG service is not available');
    }

    this.initializeRankMappings();
    this.scheduleUpdates();

    this.logger.info('🎖️ RankService initialized successfully');
  }

  /**
   * Initialize rank mappings for PUBG Season 36
   */
  private initializeRankMappings(): void {
    const mappings: RankMapping[] = [
      // Bronze
      {
        tier: 'Bronze',
        subTier: 'V',
        minRP: 0,
        maxRP: 1199,
        roleName: 'Bronze V',
        roleColor: '#CD7F32',
        priority: 1,
      },
      {
        tier: 'Bronze',
        subTier: 'IV',
        minRP: 1200,
        maxRP: 1299,
        roleName: 'Bronze IV',
        roleColor: '#CD7F32',
        priority: 2,
      },
      {
        tier: 'Bronze',
        subTier: 'III',
        minRP: 1300,
        maxRP: 1399,
        roleName: 'Bronze III',
        roleColor: '#CD7F32',
        priority: 3,
      },
      {
        tier: 'Bronze',
        subTier: 'II',
        minRP: 1400,
        maxRP: 1499,
        roleName: 'Bronze II',
        roleColor: '#CD7F32',
        priority: 4,
      },
      {
        tier: 'Bronze',
        subTier: 'I',
        minRP: 1500,
        maxRP: 1599,
        roleName: 'Bronze I',
        roleColor: '#CD7F32',
        priority: 5,
      },

      // Silver
      {
        tier: 'Silver',
        subTier: 'V',
        minRP: 1600,
        maxRP: 1699,
        roleName: 'Silver V',
        roleColor: '#C0C0C0',
        priority: 6,
      },
      {
        tier: 'Silver',
        subTier: 'IV',
        minRP: 1700,
        maxRP: 1799,
        roleName: 'Silver IV',
        roleColor: '#C0C0C0',
        priority: 7,
      },
      {
        tier: 'Silver',
        subTier: 'III',
        minRP: 1800,
        maxRP: 1899,
        roleName: 'Silver III',
        roleColor: '#C0C0C0',
        priority: 8,
      },
      {
        tier: 'Silver',
        subTier: 'II',
        minRP: 1900,
        maxRP: 1999,
        roleName: 'Silver II',
        roleColor: '#C0C0C0',
        priority: 9,
      },
      {
        tier: 'Silver',
        subTier: 'I',
        minRP: 2000,
        maxRP: 2099,
        roleName: 'Silver I',
        roleColor: '#C0C0C0',
        priority: 10,
      },

      // Gold
      {
        tier: 'Gold',
        subTier: 'V',
        minRP: 2100,
        maxRP: 2199,
        roleName: 'Gold V',
        roleColor: '#FFD700',
        priority: 11,
      },
      {
        tier: 'Gold',
        subTier: 'IV',
        minRP: 2200,
        maxRP: 2299,
        roleName: 'Gold IV',
        roleColor: '#FFD700',
        priority: 12,
      },
      {
        tier: 'Gold',
        subTier: 'III',
        minRP: 2300,
        maxRP: 2399,
        roleName: 'Gold III',
        roleColor: '#FFD700',
        priority: 13,
      },
      {
        tier: 'Gold',
        subTier: 'II',
        minRP: 2400,
        maxRP: 2499,
        roleName: 'Gold II',
        roleColor: '#FFD700',
        priority: 14,
      },
      {
        tier: 'Gold',
        subTier: 'I',
        minRP: 2500,
        maxRP: 2599,
        roleName: 'Gold I',
        roleColor: '#FFD700',
        priority: 15,
      },

      // Platinum
      {
        tier: 'Platinum',
        subTier: 'V',
        minRP: 2600,
        maxRP: 2699,
        roleName: 'Platinum V',
        roleColor: '#E5E4E2',
        priority: 16,
      },
      {
        tier: 'Platinum',
        subTier: 'IV',
        minRP: 2700,
        maxRP: 2799,
        roleName: 'Platinum IV',
        roleColor: '#E5E4E2',
        priority: 17,
      },
      {
        tier: 'Platinum',
        subTier: 'III',
        minRP: 2800,
        maxRP: 2899,
        roleName: 'Platinum III',
        roleColor: '#E5E4E2',
        priority: 18,
      },
      {
        tier: 'Platinum',
        subTier: 'II',
        minRP: 2900,
        maxRP: 2999,
        roleName: 'Platinum II',
        roleColor: '#E5E4E2',
        priority: 19,
      },
      {
        tier: 'Platinum',
        subTier: 'I',
        minRP: 3000,
        maxRP: 3099,
        roleName: 'Platinum I',
        roleColor: '#E5E4E2',
        priority: 20,
      },

      // Diamond
      {
        tier: 'Diamond',
        subTier: 'V',
        minRP: 3100,
        maxRP: 3199,
        roleName: 'Diamond V',
        roleColor: '#B9F2FF',
        priority: 21,
      },
      {
        tier: 'Diamond',
        subTier: 'IV',
        minRP: 3200,
        maxRP: 3299,
        roleName: 'Diamond IV',
        roleColor: '#B9F2FF',
        priority: 22,
      },
      {
        tier: 'Diamond',
        subTier: 'III',
        minRP: 3300,
        maxRP: 3399,
        roleName: 'Diamond III',
        roleColor: '#B9F2FF',
        priority: 23,
      },
      {
        tier: 'Diamond',
        subTier: 'II',
        minRP: 3400,
        maxRP: 3499,
        roleName: 'Diamond II',
        roleColor: '#B9F2FF',
        priority: 24,
      },
      {
        tier: 'Diamond',
        subTier: 'I',
        minRP: 3500,
        maxRP: 3599,
        roleName: 'Diamond I',
        roleColor: '#B9F2FF',
        priority: 25,
      },

      // Master
      {
        tier: 'Master',
        subTier: '',
        minRP: 3600,
        maxRP: 4999,
        roleName: 'Master',
        roleColor: '#FF6B6B',
        priority: 26,
      },

      // Conqueror (Top 500)
      {
        tier: 'Conqueror',
        subTier: '',
        minRP: 5000,
        maxRP: 999999,
        roleName: 'Conqueror',
        roleColor: '#FF0000',
        priority: 27,
      },
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
    this.updateJob = cron.schedule(
      '0 4 * * *',
      async () => {
        this.logger.info('Starting scheduled rank update (04:00 UTC)');
        await this.updateAllUserRanks();
      },
      {
        timezone: 'UTC',
      }
    );

    // Update at 16:00 UTC
    cron.schedule(
      '0 16 * * *',
      async () => {
        this.logger.info('Starting scheduled rank update (16:00 UTC)');
        await this.updateAllUserRanks();
      },
      {
        timezone: 'UTC',
      }
    );

    this.logger.info('Scheduled rank updates for 04:00 and 16:00 UTC');
  }

  /**
   * Update ranks for all users
   */
  public async updateAllUserRanks(): Promise<{
    updated: number;
    errors: number;
    total: number;
    duration: number;
  }> {
    const startTime = Date.now();

    try {
      this.logger.info('🔄 Starting bulk rank update for all users...');

      // Get all users with PUBG names
      const users = await this.database.client.user.findMany({
        where: {
          pubgUsername: {
            not: null,
          },
          NOT: {
            pubgUsername: '',
          },
        },
        select: {
          id: true,
          pubgUsername: true,
        },
      });

      if (users.length === 0) {
        this.logger.info('No users with PUBG usernames found');
        return { updated: 0, errors: 0, total: 0, duration: Date.now() - startTime };
      }

      let updatedCount = 0;
      let errorCount = 0;
      const batchSize = 10;
      const rateLimitDelay = 150; // ms between requests

      // Process users in batches to avoid overwhelming the API
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);

        const batchPromises = batch.map(async (user, index) => {
          try {
            // Stagger requests within batch
            await new Promise(resolve => setTimeout(resolve, index * 50));

            if (user.pubgUsername) {
              const updated = await this.updateUserRank(user.id, user.pubgUsername);
              return updated ? 'updated' : 'skipped';
            }
            return 'no_username';
          } catch (error) {
            this.logger.error(`Failed to update rank for user ${user.id}:`, {
              error: error instanceof Error ? error.message : String(error),
              pubgUsername: user.pubgUsername,
            });
            return 'error';
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            if (result.value === 'updated') {
              updatedCount++;
            } else if (result.value === 'error') {
              errorCount++;
            }
          } else {
            errorCount++;
          }
        });

        // Rate limiting between batches
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
        }

        // Log progress every 50 users
        if ((i + batchSize) % 50 === 0 || i + batchSize >= users.length) {
          this.logger.info(
            `Progress: ${Math.min(i + batchSize, users.length)}/${users.length} users processed`
          );
        }
      }

      const duration = Date.now() - startTime;

      // Update cache with last update time and stats
      await this.cache.set(
        'last_rank_update',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          updated: updatedCount,
          errors: errorCount,
          total: users.length,
          duration,
        }),
        86400
      );

      this.logger.info(
        `✅ Bulk rank update completed in ${duration}ms. Updated: ${updatedCount}, Errors: ${errorCount}, Total: ${users.length}`
      );

      return { updated: updatedCount, errors: errorCount, total: users.length, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('❌ Failed to update all user ranks:', {
        error: error instanceof Error ? error.message : String(error),
        duration,
      });
      throw error;
    }
  }

  /**
   * Update rank for a specific user
   */
  public async updateUserRank(
    discordId: string,
    pubgName: string,
    forceUpdate: boolean = false
  ): Promise<boolean> {
    try {
      // Input validation
      if (!discordId || typeof discordId !== 'string') {
        throw new Error('Discord ID is required and must be a string');
      }

      if (!pubgName || typeof pubgName !== 'string') {
        throw new Error('PUBG name is required and must be a string');
      }

      // Sanitize PUBG name
      const sanitizedPubgName = pubgName.trim();
      if (sanitizedPubgName.length < 3 || sanitizedPubgName.length > 24) {
        throw new Error('PUBG name must be between 3 and 24 characters');
      }

      // Check cache first (avoid too frequent updates)
      const cacheKey = `user_rank_${discordId}`;

      if (!forceUpdate) {
        const cachedData = await this.cache.get<string>(cacheKey);

        if (cachedData) {
          try {
            const parsedData = JSON.parse(cachedData);
            const lastUpdate = new Date(parsedData.lastUpdated);
            const timeDiff = Date.now() - lastUpdate.getTime();

            // Skip if updated less than 1 hour ago
            if (timeDiff < 3600000) {
              return false;
            }
          } catch (parseError) {
            // Invalid cache data, continue with update
            await this.cache.del(cacheKey);
          }
        }
      }

      // Get PUBG stats with retry logic
      let pubgStats;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          pubgStats = await this.pubg.getPlayerStats(sanitizedPubgName, PUBGPlatform.STEAM);
          break;
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            this.logger.warn(
              `Failed to get PUBG stats for ${sanitizedPubgName} after ${maxRetries} retries:`,
              error instanceof Error ? error.message : String(error)
            );
            return false;
          }
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        }
      }

      if (!pubgStats || !pubgStats.gameModeStats) {
        this.logger.warn(`No stats found for player: ${sanitizedPubgName}`);
        return false;
      }

      // Get ranked stats from squad mode (most common for ranked)
      const gameModes = ['squad-fpp', 'squad', 'solo-fpp', 'solo', 'duo-fpp', 'duo'];
      let rankedStats = null;

      for (const mode of gameModes) {
        if (pubgStats.gameModeStats && (pubgStats.gameModeStats as any)[mode]) {
          rankedStats = (pubgStats.gameModeStats as any)[mode];
          break;
        }
      }

      if (!rankedStats && pubgStats.gameModeStats) {
        // Fallback to any available game mode
        const availableModes = Object.keys(pubgStats.gameModeStats);
        if (availableModes.length > 0) {
          const firstMode = availableModes[0];
          if (firstMode) {
            rankedStats = (pubgStats.gameModeStats as any)[firstMode];
          }
        }
      }

      if (!rankedStats) {
        this.logger.warn(`No game mode stats found for player: ${sanitizedPubgName}`);
        return false;
      }

      const currentRP = Math.max(0, rankedStats.rankPoints || 0);
      const rankTitle = rankedStats.rankPointsTitle || 'Unranked';
      const titleParts = rankTitle.split(' ');
      const currentTier = titleParts[0] || 'Unranked';
      const currentSubTier = titleParts[1] || '';

      // Validate RP value
      if (!Number.isFinite(currentRP) || currentRP < 0) {
        this.logger.warn(`Invalid RP value for player ${sanitizedPubgName}: ${currentRP}`);
        return false;
      }

      // Find matching rank mapping
      const rankMapping = this.getRankMappingByRP(currentRP);
      if (!rankMapping) {
        this.logger.warn(
          `No rank mapping found for RP: ${currentRP} (player: ${sanitizedPubgName})`
        );
        return false;
      }

      // Save to database using transaction for consistency
      await this.database.client.$transaction(async tx => {
        // Update or create PUBG stats
        await tx.pUBGStats.upsert({
          where: {
            userId_seasonId_gameMode: {
              userId: discordId,
              seasonId: 'current',
              gameMode: 'squad',
            },
          },
          update: {
            currentTier: currentTier,
            currentSubTier: currentSubTier,
            currentRankPoint: currentRP,
            playerName: sanitizedPubgName,
            updatedAt: new Date(),
          },
          create: {
            userId: discordId,
            playerId: sanitizedPubgName,
            playerName: sanitizedPubgName,
            platform: 'steam',
            seasonId: 'current',
            gameMode: 'squad',
            currentTier: currentTier,
            currentSubTier: currentSubTier,
            currentRankPoint: currentRP,
          },
        });

        // Update user's PUBG username if different
        await tx.user.update({
          where: { id: discordId },
          data: {
            pubgUsername: sanitizedPubgName,
            updatedAt: new Date(),
          },
        });
      });

      // Update Discord roles (non-blocking)
      this.updateDiscordRoles(discordId, rankMapping).catch(error => {
        this.logger.error(
          `Failed to update Discord roles for user ${discordId}:`,
          error instanceof Error ? error.message : String(error)
        );
      });

      // Cache the result
      const rankData: UserRankData = {
        userId: discordId,
        pubgName: sanitizedPubgName,
        currentTier,
        currentSubTier,
        currentRP,
        lastUpdated: new Date(),
      };

      await this.cache.set(cacheKey, JSON.stringify(rankData), 7200); // 2 hours

      // Clear related cache
      await this.cache.del('rank_leaderboard');

      this.logger.info(
        `🎖️ Updated rank for ${sanitizedPubgName}: ${rankMapping.roleName} (${currentRP} RP)`
      );
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to update rank for user ${discordId}:`, {
        error: error instanceof Error ? error.message : String(error),
        pubgName: pubgName,
        discordId,
      });
      return false;
    }
  }

  /**
   * Update Discord roles based on rank
   */
  private async updateDiscordRoles(discordId: string, rankMapping: RankMapping): Promise<void> {
    try {
      // Input validation
      if (!discordId || typeof discordId !== 'string') {
        throw new Error('Discord ID is required and must be a string');
      }

      if (!rankMapping || !rankMapping.roleName) {
        throw new Error('Valid rank mapping is required');
      }

      // Get all guilds the bot is in
      const guilds = this.client.guilds.cache;

      for (const [, guild] of guilds) {
        try {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (!member) {
            continue;
          }

          // Check if member has necessary permissions (not a bot, not owner)
          if (member.user.bot) {
            this.logger.debug(`Skipping role update for bot user: ${discordId}`);
            continue;
          }

          if (member.id === guild.ownerId) {
            this.logger.debug(`Skipping role update for guild owner: ${discordId}`);
            continue;
          }

          // Remove old rank roles
          await this.removeOldRankRoles(member, guild);

          // Add new rank role
          await this.addRankRole(member, guild, rankMapping);

          this.logger.debug(
            `✅ Updated Discord roles for ${member.user.tag}: ${rankMapping.roleName}`
          );
        } catch (error) {
          this.logger.error(
            `Failed to update roles in guild ${guild.name}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    } catch (error) {
      this.logger.error(`❌ Failed to update Discord roles for ${discordId}:`, {
        error: error instanceof Error ? error.message : String(error),
        rankMapping: rankMapping?.roleName,
      });
      // Don't throw error to prevent breaking the rank update process
    }
  }

  /**
   * Remove old rank roles from member
   */
  private async removeOldRankRoles(member: GuildMember, guild: Guild): Promise<void> {
    try {
      if (!member || !member.roles) {
        return;
      }

      const rankRoleNames = Array.from(this.rankMappings.values()).map(mapping => mapping.roleName);

      const rolesToRemove = member.roles.cache.filter(role => rankRoleNames.includes(role.name));

      if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove, 'Rank update - removing old rank roles');
        this.logger.debug(`Removed ${rolesToRemove.size} old rank roles from ${member.user.tag}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to remove old rank roles from ${member?.user?.tag}:`,
        error instanceof Error ? error.message : String(error)
      );
      // Don't throw to prevent breaking the process
    }
  }

  /**
   * Add rank role to member
   */
  private async addRankRole(
    member: GuildMember,
    guild: Guild,
    rankMapping: RankMapping
  ): Promise<void> {
    try {
      if (!member || !guild || !rankMapping) {
        return;
      }

      let role = guild.roles.cache.find(r => r.name === rankMapping.roleName);

      // Create role if it doesn't exist
      if (!role) {
        try {
          role = await guild.roles.create({
            name: rankMapping.roleName,
            color: rankMapping.roleColor as any,
            reason: 'Auto-created for PUBG rank system',
            position: rankMapping.priority,
            mentionable: false,
            hoist: false,
          });

          this.logger.info(`Created new rank role: ${rankMapping.roleName} in guild ${guild.name}`);
        } catch (createError) {
          this.logger.error(
            `Failed to create role ${rankMapping.roleName}:`,
            createError instanceof Error ? createError.message : String(createError)
          );
          return;
        }
      }

      // Add role to member if they don't already have it
      if (role && !member.roles.cache.has(role.id)) {
        try {
          await member.roles.add(role, `PUBG Rank Update: ${rankMapping.roleName}`);
          this.logger.debug(`Added rank role ${rankMapping.roleName} to ${member.user.tag}`);
        } catch (addError) {
          this.logger.error(
            `Failed to add role ${rankMapping.roleName} to ${member.user.tag}:`,
            addError instanceof Error ? addError.message : String(addError)
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to add rank role to ${member?.user?.tag}:`, {
        error: error instanceof Error ? error.message : String(error),
        roleName: rankMapping?.roleName,
      });
    }
  }

  /**
   * Get rank mapping by RP
   */
  private getRankMappingByRP(rp: number): RankMapping | null {
    try {
      // Input validation
      if (!Number.isFinite(rp) || rp < 0) {
        return null;
      }

      if (!this.rankMappings || this.rankMappings.size === 0) {
        this.logger.warn('No rank mappings available');
        return null;
      }

      for (const mapping of this.rankMappings.values()) {
        if (mapping && typeof mapping.minRP === 'number' && typeof mapping.maxRP === 'number') {
          if (rp >= mapping.minRP && rp <= mapping.maxRP) {
            return mapping;
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Error finding rank mapping by RP:', {
        error: error instanceof Error ? error.message : String(error),
        rp,
      });
      return null;
    }
  }

  /**
   * Get user rank data
   */
  public async getUserRankData(discordId: string): Promise<UserRankData | null> {
    try {
      // Input validation
      if (!discordId || typeof discordId !== 'string') {
        throw new Error('Discord ID is required and must be a string');
      }

      const cacheKey = `user_rank_${discordId}`;

      try {
        const cachedData = await this.cache.get<string>(cacheKey);

        if (cachedData) {
          const parsedData = JSON.parse(cachedData);
          // Validate cached data structure
          if (parsedData && parsedData.userId && parsedData.lastUpdated) {
            return parsedData;
          }
          // Invalid cache data, remove it
          await this.cache.del(cacheKey);
        }
      } catch (cacheError) {
        this.logger.warn(
          `Cache error for user ${discordId}:`,
          cacheError instanceof Error ? cacheError.message : String(cacheError)
        );
        await this.cache.del(cacheKey);
      }

      // Get from database
      const user = await this.database.client.user.findUnique({
        where: { id: discordId },
        select: {
          pubgUsername: true,
          pubgStats: {
            where: { seasonId: 'current' },
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!user || !user.pubgUsername) {
        return null;
      }

      const pubgStats = user.pubgStats[0];
      const currentRP = Math.max(0, pubgStats?.currentRankPoint || 0);

      const rankData: UserRankData = {
        userId: discordId,
        pubgName: user.pubgUsername,
        currentTier: pubgStats?.currentTier || 'Unranked',
        currentSubTier: pubgStats?.currentSubTier || '',
        currentRP: currentRP,
        lastUpdated: pubgStats?.updatedAt || new Date(),
      };

      // Cache the result
      await this.cache.set(cacheKey, JSON.stringify(rankData), 7200);

      return rankData;
    } catch (error) {
      this.logger.error(`❌ Failed to get rank data for user ${discordId}:`, {
        error: error instanceof Error ? error.message : String(error),
        discordId,
      });
      return null;
    }
  }

  /**
   * Get rank leaderboard
   */
  public async getRankLeaderboard(limit: number = 10, guildId?: string): Promise<UserRankData[]> {
    try {
      // Input validation
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error('Limit must be an integer between 1 and 100');
      }

      if (guildId && typeof guildId !== 'string') {
        throw new Error('Guild ID must be a string');
      }

      const cacheKey = `rank_leaderboard_${limit}_${guildId || 'global'}`;

      try {
        const cachedData = await this.cache.get<string>(cacheKey);

        if (cachedData) {
          const leaderboard = JSON.parse(cachedData);
          if (Array.isArray(leaderboard)) {
            return leaderboard;
          }
          // Invalid cache data
          await this.cache.del(cacheKey);
        }
      } catch (cacheError) {
        this.logger.warn(
          'Cache error for leaderboard:',
          cacheError instanceof Error ? cacheError.message : String(cacheError)
        );
        await this.cache.del(cacheKey);
      }

      // Build where clause
      const whereClause: any = {
        pubgStats: {
          some: {
            seasonId: 'current',
            currentRankPoint: {
              gt: 0,
            },
          },
        },
      };

      // Add guild filter if specified
      if (guildId) {
        whereClause.guildId = guildId;
      }

      // Get from database
      const users = await this.database.client.user.findMany({
        where: whereClause,
        include: {
          pubgStats: {
            where: {
              seasonId: 'current',
            },
            orderBy: {
              currentRankPoint: 'desc',
            },
            take: 1,
            select: {
              playerName: true,
              currentTier: true,
              currentSubTier: true,
              currentRankPoint: true,
              updatedAt: true,
            },
          },
        },
        orderBy: [
          {
            updatedAt: 'desc',
          },
        ],
        take: limit,
      });

      const leaderboard: UserRankData[] = users
        .filter((user: any) => user.pubgStats && user.pubgStats.length > 0)
        .map((user: any, index) => {
          const pubgStats = user.pubgStats[0];
          const currentRP = Math.max(0, pubgStats?.currentRankPoint || 0);
          const rankMapping = this.getRankMappingByRP(currentRP);

          return {
            userId: user.id,
            pubgName: pubgStats?.playerName || user.pubgUsername || '',
            currentTier: pubgStats?.currentTier || 'Unranked',
            currentSubTier: pubgStats?.currentSubTier || '',
            currentRP: currentRP,
            lastUpdated: pubgStats?.updatedAt || new Date(),
            position: index + 1,
            rankMapping: rankMapping || undefined,
          };
        })
        .filter(data => data.currentRP > 0); // Ensure only users with RP > 0

      // Cache for 30 minutes
      await this.cache.set(cacheKey, JSON.stringify(leaderboard), 1800);

      return leaderboard;
    } catch (error) {
      this.logger.error('❌ Failed to get rank leaderboard:', {
        error: error instanceof Error ? error.message : String(error),
        limit,
        guildId,
      });
      return [];
    }
  }

  /**
   * Force update user rank (bypass cache)
   */
  public async forceUpdateUserRank(discordId: string, pubgName: string): Promise<boolean> {
    try {
      // Input validation
      if (!discordId || typeof discordId !== 'string') {
        throw new Error('Discord ID is required and must be a string');
      }

      if (!pubgName || typeof pubgName !== 'string') {
        throw new Error('PUBG name is required and must be a string');
      }

      // Clear related cache
      const cacheKeys = [`user_rank_${discordId}`, 'rank_leaderboard', 'rank_leaderboard_*'];

      await Promise.all(
        cacheKeys.map(key =>
          key.includes('*') ? this.cache.clearPattern(key) : this.cache.del(key)
        )
      );

      // Update rank with force flag
      const result = await this.updateUserRank(discordId, pubgName, true);

      this.logger.info(
        `🔄 Force updated rank for user ${discordId}: ${result ? 'success' : 'failed'}`
      );

      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to force update rank for user ${discordId}:`, {
        error: error instanceof Error ? error.message : String(error),
        discordId,
        pubgName,
      });
      return false;
    }
  }

  /**
   * Get all rank mappings
   */
  public getAllRankMappings(): RankMapping[] {
    try {
      if (!this.rankMappings || this.rankMappings.size === 0) {
        this.logger.warn('No rank mappings available');
        return [];
      }

      return Array.from(this.rankMappings.values())
        .filter(mapping => mapping && typeof mapping.priority === 'number')
        .sort((a, b) => a.priority - b.priority);
    } catch (error) {
      this.logger.error(
        'Error getting rank mappings:',
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Stop scheduled updates
   */
  public stopScheduledUpdates(): void {
    try {
      if (this.updateJob) {
        this.updateJob.stop();
        this.logger.info('⏹️ Stopped scheduled rank updates');
      } else {
        this.logger.debug('No scheduled updates to stop');
      }
    } catch (error) {
      this.logger.error(
        'Error stopping scheduled updates:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get next update time
   */
  public getNextUpdateTime(): Date {
    try {
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
    } catch (error) {
      this.logger.error(
        'Error calculating next update time:',
        error instanceof Error ? error.message : String(error)
      );
      // Return a default time (1 hour from now)
      const fallback = new Date();
      fallback.setHours(fallback.getHours() + 1);
      return fallback;
    }
  }

  /**
   * Get rank statistics
   */
  public async getRankStatistics(): Promise<{
    totalUsers: number;
    rankedUsers: number;
    averageRP: number;
    topTier: string;
    lastUpdate: Date | null;
    rankDistribution: Record<string, number>;
  }> {
    try {
      const stats = await this.database.client.pUBGStats.aggregate({
        where: {
          seasonId: 'current',
          currentRankPoint: {
            gt: 0,
          },
        },
        _count: {
          userId: true,
        },
        _avg: {
          currentRankPoint: true,
        },
        _max: {
          currentRankPoint: true,
          updatedAt: true,
        },
      });

      // Get total users with PUBG usernames
      const totalUsers = await this.database.client.user.count({
        where: {
          AND: [
            {
              pubgUsername: {
                not: null,
              },
            },
            {
              pubgUsername: {
                not: '',
              },
            },
          ],
        },
      });

      // Get rank distribution
      const rankDistribution: Record<string, number> = {};
      for (const mapping of this.rankMappings.values()) {
        const count = await this.database.client.pUBGStats.count({
          where: {
            seasonId: 'current',
            currentRankPoint: {
              gte: mapping.minRP,
              lte: mapping.maxRP,
            },
          },
        });
        rankDistribution[mapping.tier] = count;
      }

      // Find top tier
      const topRP = stats._max.currentRankPoint || 0;
      const topMapping = this.getRankMappingByRP(topRP);

      return {
        totalUsers,
        rankedUsers: stats._count.userId || 0,
        averageRP: Math.round(stats._avg.currentRankPoint || 0),
        topTier: topMapping?.tier || 'Unknown',
        lastUpdate: stats._max.updatedAt,
        rankDistribution,
      };
    } catch (error) {
      this.logger.error(
        '❌ Failed to get rank statistics:',
        error instanceof Error ? error.message : String(error)
      );
      return {
        totalUsers: 0,
        rankedUsers: 0,
        averageRP: 0,
        topTier: 'Unknown',
        lastUpdate: null,
        rankDistribution: {},
      };
    }
  }

  /**
   * Clear rank cache
   */
  public async clearRankCache(userId?: string): Promise<void> {
    try {
      if (userId) {
        // Clear specific user cache
        await this.cache.del(`user_rank_${userId}`);
        this.logger.debug(`Cleared rank cache for user: ${userId}`);
      } else {
        // Clear all rank-related cache
        const patterns = ['user_rank_*', 'rank_leaderboard*', 'last_rank_update'];

        await Promise.all(patterns.map(pattern => this.cache.clearPattern(pattern)));
        this.logger.info('🧹 Cleared all rank cache');
      }
    } catch (error) {
      this.logger.error('❌ Failed to clear rank cache:', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    }
  }

  /**
   * Get user rank position in leaderboard
   */
  public async getUserRankPosition(discordId: string): Promise<number | null> {
    try {
      if (!discordId || typeof discordId !== 'string') {
        return null;
      }

      const userStats = await this.database.client.pUBGStats.findFirst({
        where: {
          userId: discordId,
          seasonId: 'current',
        },
        select: {
          currentRankPoint: true,
        },
      });

      if (!userStats || !userStats.currentRankPoint) {
        return null;
      }

      const higherRankedCount = await this.database.client.pUBGStats.count({
        where: {
          seasonId: 'current',
          currentRankPoint: {
            gt: userStats.currentRankPoint,
          },
        },
      });

      return higherRankedCount + 1;
    } catch (error) {
      this.logger.error(
        `❌ Failed to get rank position for user ${discordId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }

  /**
   * Validate rank mappings
   */
  private validateRankMappings(): boolean {
    try {
      if (!this.rankMappings || this.rankMappings.size === 0) {
        this.logger.error('No rank mappings defined');
        return false;
      }

      const mappings = Array.from(this.rankMappings.values());
      const errors: string[] = [];

      // Check for required fields
      mappings.forEach((mapping, index) => {
        if (!mapping.tier) {
          errors.push(`Mapping ${index}: missing tier`);
        }
        if (!mapping.roleName) {
          errors.push(`Mapping ${index}: missing roleName`);
        }
        if (typeof mapping.minRP !== 'number') {
          errors.push(`Mapping ${index}: invalid minRP`);
        }
        if (typeof mapping.maxRP !== 'number') {
          errors.push(`Mapping ${index}: invalid maxRP`);
        }
        if (mapping.minRP >= mapping.maxRP) {
          errors.push(`Mapping ${index}: minRP >= maxRP`);
        }
      });

      // Check for overlaps
      for (let i = 0; i < mappings.length; i++) {
        for (let j = i + 1; j < mappings.length; j++) {
          const a = mappings[i];
          const b = mappings[j];

          if (a && b && a.minRP <= b.maxRP && a.maxRP >= b.minRP) {
            errors.push(`Overlap between ${a.tier} and ${b.tier}`);
          }
        }
      }

      if (errors.length > 0) {
        this.logger.error('Rank mapping validation errors:', errors);
        return false;
      }

      this.logger.info(`✅ Validated ${mappings.length} rank mappings`);
      return true;
    } catch (error) {
      this.logger.error(
        'Error validating rank mappings:',
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }
}
