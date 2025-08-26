import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { PUBGService } from './pubg.service';
import { ExtendedClient } from '../types/client';
import { PUBGPlatform, PUBGGameMode, PUBGRankTier, InternalRankingEntry, PUBGRankingEntry } from '../types/pubg';
import { GuildMember, Role, EmbedBuilder } from 'discord.js';

export interface RankingPeriod {
  type: 'daily' | 'weekly' | 'monthly' | 'all_time';
  startDate: Date;
  endDate: Date;
}

export interface UserRankingData {
  userId: string;
  username: string;
  pubgName?: string;
  pubgPlatform?: PUBGPlatform;
  stats: {
    // PUBG Stats
    kills: number;
    wins: number;
    games: number;
    damage: number;
    headshots: number;
    kda: number;
    winRate: number;
    averageDamage: number;
    rankPoints: number;
    tier: PUBGRankTier;
    subTier: string;
    
    // Internal Stats
    level: number;
    xp: number;
    coins: number;
    messages: number;
    voiceTime: number;
    quizScore: number;
    miniGameWins: number;
    badgeCount: number;
    checkIns: number;
    clipsUploaded: number;
    clipsVotes: number;
  };
  lastUpdated: Date;
}

export interface RankingSnapshot {
  id: string;
  guildId: string;
  period: RankingPeriod;
  type: 'pubg' | 'internal';
  gameMode?: PUBGGameMode;
  data: UserRankingData[];
  createdAt: Date;
}

export interface RoleReward {
  rankRange: [number, number]; // [min, max] rank positions
  roleId: string;
  roleName: string;
  temporary: boolean;
  duration?: number; // in hours, for temporary roles
}

/**
 * Ranking Service for managing PUBG and internal rankings
 */
export class RankingService {
  private logger: Logger;
  private cache: CacheService;
  private database: DatabaseService;
  private pubgService: PUBGService;
  private client: ExtendedClient;
  
  private rankings: Map<string, Map<string, UserRankingData>> = new Map(); // guildId -> userId -> data
  private snapshots: Map<string, RankingSnapshot[]> = new Map(); // guildId -> snapshots
  private roleRewards: Map<string, RoleReward[]> = new Map(); // guildId -> role rewards
  
  private readonly updateIntervals = {
    daily: 24 * 60 * 60 * 1000, // 24 hours
    weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
    monthly: 30 * 24 * 60 * 60 * 1000, // 30 days
    realtime: 5 * 60 * 1000, // 5 minutes for real-time updates
  };

  constructor(client: ExtendedClient) {
    this.logger = new Logger();
    this.cache = client.cache;
    this.database = client.database;
    this.pubgService = client.pubgService;
    this.client = client;
    
    this.loadRankings();
    this.loadRoleRewards();
    this.startRankingUpdater();
    this.startSnapshotScheduler();
  }

  /**
   * Load rankings from database
   */
  private async loadRankings(): Promise<void> {
    try {
      const guilds = await this.database.client.guild.findMany({
        include: {
          users: {
            include: {
              user: {
                include: {
                  pubgStats: true,
                  stats: true,
                  badges: true,
                },
              },
            },
          },
        },
      });
      
      for (const guild of guilds) {
        const guildRankings = new Map<string, UserRankingData>();
        
        for (const guildUser of guild.users) {
          const user = guildUser.user;
          const pubgStats = user.pubgStats[0]; // Get latest PUBG stats
          const userStats = user.stats;
          
          // Calculate derived stats
          const games = pubgStats?.roundsPlayed || 0;
          const kills = pubgStats?.kills || 0;
          const deaths = pubgStats?.deaths || 0;
          const wins = pubgStats?.wins || 0;
          const damage = pubgStats?.damageDealt || 0;
          const headshots = pubgStats?.headshotKills || 0;
          
          const kda = deaths > 0 ? (kills + (pubgStats?.assists || 0)) / deaths : kills;
          const winRate = games > 0 ? (wins / games) * 100 : 0;
          const averageDamage = games > 0 ? damage / games : 0;
          
          const rankingData: UserRankingData = {
            userId: user.id,
            username: user.username,
            pubgName: user.pubgUsername || undefined,
            pubgPlatform: user.pubgPlatform as PUBGPlatform || undefined,
            stats: {
              // PUBG Stats
              kills,
              wins,
              games,
              damage,
              headshots,
              kda,
              winRate,
              averageDamage,
              rankPoints: pubgStats?.currentRankPoint || 0,
              tier: (pubgStats?.currentTier as PUBGRankTier) || PUBGRankTier.BRONZE,
              subTier: pubgStats?.currentSubTier || 'V',
              
              // Internal Stats
              level: user.level,
              xp: user.xp,
              coins: user.coins,
              messages: userStats?.messagesCount || 0,
              voiceTime: userStats?.voiceTime || 0,
              quizScore: userStats?.quizzesCompleted || 0,
              miniGameWins: userStats?.gamesPlayed || 0,
              badgeCount: user.badges?.length || 0,
              checkIns: userStats?.checkIns || 0,
              clipsUploaded: userStats?.clipsUploaded || 0,
              clipsVotes: 0, // Will be calculated from ClipVote relations
            },
            lastUpdated: new Date(),
          };
          
          guildRankings.set(user.id, rankingData);
        }
        
        this.rankings.set(guild.id, guildRankings);
      }
      
      this.logger.info(`Loaded rankings for ${guilds.length} guilds`);
    } catch (error) {
      this.logger.error('Failed to load rankings:', error);
    }
  }

  /**
   * Load role rewards configuration
   */
  private async loadRoleRewards(): Promise<void> {
    try {
      const guildConfigs = await this.database.client.guildConfig.findMany();
      
      for (const config of guildConfigs) {
        const configData = config.config as any;
        if (configData && configData.rankingRoles) {
          const roleRewards: RoleReward[] = configData.rankingRoles;
          this.roleRewards.set(config.guildId, roleRewards);
        }
      }
      
      this.logger.info(`Loaded role rewards for ${this.roleRewards.size} guilds`);
    } catch (error) {
      this.logger.error('Failed to load role rewards:', error);
    }
  }

  /**
   * Start ranking updater
   */
  private startRankingUpdater(): void {
    // Update rankings every 5 minutes
    setInterval(async () => {
      await this.updateAllRankings();
    }, this.updateIntervals.realtime);
    
    // Update role assignments every hour
    setInterval(async () => {
      await this.updateRoleAssignments();
    }, 60 * 60 * 1000);
  }

  /**
   * Start snapshot scheduler
   */
  private startSnapshotScheduler(): void {
    // Daily snapshots at midnight
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() < 5) {
        await this.createDailySnapshots();
      }
    }, 5 * 60 * 1000);
    
    // Weekly snapshots on Monday at midnight
    setInterval(async () => {
      const now = new Date();
      if (now.getDay() === 1 && now.getHours() === 0 && now.getMinutes() < 5) {
        await this.createWeeklySnapshots();
      }
    }, 5 * 60 * 1000);
    
    // Monthly snapshots on the 1st at midnight
    setInterval(async () => {
      const now = new Date();
      if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() < 5) {
        await this.createMonthlySnapshots();
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Update user ranking data
   */
  public async updateUserRanking(guildId: string, userId: string): Promise<void> {
    try {
      const user = await this.database.client.user.findUnique({
        where: { id: userId },
        include: {
          pubgStats: { orderBy: { updatedAt: 'desc' }, take: 1 },
          stats: true,
          badges: true,
        },
      });
      
      if (!user) {
        return;
      }
      
      // Update PUBG stats if user has PUBG info
      if (user.pubgUsername && user.pubgPlatform) {
        const pubgStats = await this.pubgService.getPlayerStats(
          user.pubgUsername,
          user.pubgPlatform as PUBGPlatform,
        );
        
        if (pubgStats && pubgStats.gameModeStats) {
          // Get stats from squad mode or first available mode
          const gameModes = Object.keys(pubgStats.gameModeStats) as PUBGGameMode[];
          const primaryMode = gameModes.find(mode => mode === PUBGGameMode.SQUAD) || gameModes[0] || PUBGGameMode.SQUAD;
          const modeStats = pubgStats.gameModeStats[primaryMode];
          
          if (modeStats) {
            await this.database.client.pUBGStats.upsert({
              where: {
                userId_seasonId_gameMode: {
                  userId,
                  seasonId: 'current',
                  gameMode: primaryMode as string,
                },
              },
              update: {
                roundsPlayed: modeStats.roundsPlayed,
                kills: modeStats.kills,
                deaths: modeStats.losses, // Using losses as deaths approximation
                assists: modeStats.assists,
                wins: modeStats.wins,
                damageDealt: modeStats.damageDealt,
                headshotKills: modeStats.headshotKills,
                currentRankPoint: modeStats.rankPoints,
                currentTier: modeStats.rankPointsTitle || 'Bronze',
                currentSubTier: 'V',
                updatedAt: new Date(),
              },
              create: {
                userId,
                playerId: userId,
                playerName: user.pubgUsername,
                platform: user.pubgPlatform,
                seasonId: 'current',
                gameMode: primaryMode as string,
                roundsPlayed: modeStats.roundsPlayed,
                kills: modeStats.kills,
                deaths: modeStats.losses,
                assists: modeStats.assists,
                wins: modeStats.wins,
                damageDealt: modeStats.damageDealt,
                headshotKills: modeStats.headshotKills,
                currentRankPoint: modeStats.rankPoints,
                currentTier: modeStats.rankPointsTitle || 'Bronze',
                currentSubTier: 'V',
              },
            });
          }
        }
      }
      
      // Update ranking data in memory
      if (!this.rankings.has(guildId)) {
        this.rankings.set(guildId, new Map());
      }
      
      const guildRankings = this.rankings.get(guildId)!;
      const pubgStats = user.pubgStats[0]; // Get latest PUBG stats
      const userStats = user.stats; // Get user stats
      
      // Calculate derived stats
      const games = pubgStats?.roundsPlayed || 0;
      const kills = pubgStats?.kills || 0;
      const deaths = pubgStats?.deaths || 0;
      const wins = pubgStats?.wins || 0;
      const damage = pubgStats?.damageDealt || 0;
      const headshots = pubgStats?.headshotKills || 0;
      
      const kda = deaths > 0 ? (kills + (pubgStats?.assists || 0)) / deaths : kills;
      const winRate = games > 0 ? (wins / games) * 100 : 0;
      const averageDamage = games > 0 ? damage / games : 0;

      const rankingData: UserRankingData = {
        userId: user.id,
        username: user.username,
        pubgName: user.pubgUsername || undefined,
        pubgPlatform: user.pubgPlatform as PUBGPlatform || undefined,
        stats: {
          // PUBG Stats
          kills,
          wins,
          games,
          damage,
          headshots,
          kda,
          winRate,
          averageDamage,
          rankPoints: pubgStats?.currentRankPoint || 0,
          tier: (pubgStats?.currentTier as PUBGRankTier) || PUBGRankTier.BRONZE,
          subTier: pubgStats?.currentSubTier || 'V',
          
          // Internal Stats
          level: user.level,
          xp: user.xp,
          coins: user.coins,
          messages: userStats?.messagesCount || 0,
          voiceTime: userStats?.voiceTime || 0,
          quizScore: userStats?.quizzesCompleted || 0,
          miniGameWins: userStats?.gamesPlayed || 0,
          badgeCount: user.badges?.length || 0,
          checkIns: userStats?.checkIns || 0,
          clipsUploaded: userStats?.clipsUploaded || 0,
          clipsVotes: 0, // Will be calculated from ClipVote relations
        },
        lastUpdated: new Date(),
      };

      guildRankings.set(userId, rankingData);

      this.logger.info('USER_UPDATED', {
        guildId,
        userId,
        username: user.username,
      });
      
    } catch (error) {
      this.logger.error(`Failed to update user ranking for ${userId}:`, error);
    }
  }

  /**
   * Update all rankings
   */
  public async updateAllRankings(): Promise<void> {
    try {
      for (const guildId of Array.from(this.rankings.keys())) {
        const guildRankings = this.rankings.get(guildId)!;
        
        for (const userId of Array.from(guildRankings.keys())) {
          await this.updateUserRanking(guildId, userId);
        }
      }
      
      this.logger.debug('Updated all rankings');
    } catch (error) {
      this.logger.error('Failed to update all rankings:', error);
    }
  }

  /**
   * Get PUBG ranking for guild
   */
  public getPUBGRanking(
    guildId: string,
    period: RankingPeriod,
    gameMode: PUBGGameMode = PUBGGameMode.SQUAD_FPP,
    sortBy: 'kills' | 'wins' | 'kda' | 'rankPoints' | 'winRate' = 'rankPoints',
    limit: number = 50,
  ): PUBGRankingEntry[] {
    const guildRankings = this.rankings.get(guildId);
    if (!guildRankings) {
      return [];
    }
    
    const entries: PUBGRankingEntry[] = [];
    
    for (const [userId, data] of Array.from(guildRankings.entries())) {
      if (!data.pubgName || !data.pubgPlatform) {
        continue;
      }
      
      entries.push({
        rank: 0, // Will be set after sorting
        userId,
        username: data.username,
        pubgName: data.pubgName,
        pubgPlatform: data.pubgPlatform,
        stats: {
          kills: data.stats.kills,
          wins: data.stats.wins,
          games: data.stats.games,
          damage: data.stats.damage,
          headshots: data.stats.headshots,
          kda: data.stats.kda,
          winRate: data.stats.winRate,
          averageDamage: data.stats.averageDamage,
          rankPoints: data.stats.rankPoints,
          tier: data.stats.tier,
          subTier: data.stats.subTier,
        },
        lastUpdated: data.lastUpdated,
      });
    }
    
    // Sort by specified criteria
    entries.sort((a, b) => {
      switch (sortBy) {
      case 'kills':
        return b.stats.kills - a.stats.kills;
      case 'wins':
        return b.stats.wins - a.stats.wins;
      case 'kda':
        return b.stats.kda - a.stats.kda;
      case 'winRate':
        return b.stats.winRate - a.stats.winRate;
      case 'rankPoints':
      default:
        return b.stats.rankPoints - a.stats.rankPoints;
      }
    });
    
    // Set ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    return entries.slice(0, limit);
  }

  /**
   * Get internal ranking for guild
   */
  public getInternalRanking(
    guildId: string,
    period: RankingPeriod,
    sortBy: 'level' | 'xp' | 'coins' | 'messages' | 'voiceTime' | 'quizScore' | 'miniGameWins' | 'badgeCount' = 'level',
    limit: number = 50,
  ): InternalRankingEntry[] {
    const guildRankings = this.rankings.get(guildId);
    if (!guildRankings) {
      return [];
    }
    
    const entries: InternalRankingEntry[] = [];
    
    for (const [userId, data] of Array.from(guildRankings.entries())) {
      entries.push({
        rank: 0, // Will be set after sorting
        userId,
        username: data.username,
        stats: {
          level: data.stats.level,
          xp: data.stats.xp,
          coins: data.stats.coins,
          messages: data.stats.messages,
          voiceTime: data.stats.voiceTime,
          quizScore: data.stats.quizScore,
          miniGameWins: data.stats.miniGameWins,
          badgeCount: data.stats.badgeCount,
          checkIns: data.stats.checkIns,
          clipsUploaded: data.stats.clipsUploaded,
          clipsVotes: data.stats.clipsVotes,
        },
        lastUpdated: data.lastUpdated,
      });
    }
    
    // Sort by specified criteria
    entries.sort((a, b) => {
      switch (sortBy) {
      case 'xp':
        return b.stats.xp - a.stats.xp;
      case 'coins':
        return b.stats.coins - a.stats.coins;
      case 'messages':
        return b.stats.messages - a.stats.messages;
      case 'voiceTime':
        return b.stats.voiceTime - a.stats.voiceTime;
      case 'quizScore':
        return b.stats.quizScore - a.stats.quizScore;
      case 'miniGameWins':
        return b.stats.miniGameWins - a.stats.miniGameWins;
      case 'badgeCount':
        return b.stats.badgeCount - a.stats.badgeCount;
      case 'level':
      default:
        // Sort by level first, then by XP
        if (b.stats.level !== a.stats.level) {
          return b.stats.level - a.stats.level;
        }
        return b.stats.xp - a.stats.xp;
      }
    });
    
    // Set ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    return entries.slice(0, limit);
  }

  /**
   * Get user rank in specific ranking
   */
  public getUserRank(
    guildId: string,
    userId: string,
    type: 'pubg' | 'internal',
    sortBy?: string,
  ): { rank: number; total: number } | null {
    let ranking: any[];
    
    if (type === 'pubg') {
      ranking = this.getPUBGRanking(guildId, { type: 'all_time', startDate: new Date(0), endDate: new Date() });
    } else {
      ranking = this.getInternalRanking(guildId, { type: 'all_time', startDate: new Date(0), endDate: new Date() });
    }
    
    const userIndex = ranking.findIndex(entry => entry.userId === userId);
    if (userIndex === -1) {
      return null;
    }
    
    return {
      rank: userIndex + 1,
      total: ranking.length,
    };
  }

  /**
   * Create daily snapshots
   */
  private async createDailySnapshots(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const period: RankingPeriod = {
      type: 'daily',
      startDate: yesterday,
      endDate: today,
    };
    
    for (const guildId of Array.from(this.rankings.keys())) {
      await this.createSnapshot(guildId, period, 'pubg');
      await this.createSnapshot(guildId, period, 'internal');
    }
    
    this.logger.info('Created daily ranking snapshots');
  }

  /**
   * Create weekly snapshots
   */
  private async createWeeklySnapshots(): Promise<void> {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    lastWeek.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const period: RankingPeriod = {
      type: 'weekly',
      startDate: lastWeek,
      endDate: today,
    };
    
    for (const guildId of Array.from(this.rankings.keys())) {
      await this.createSnapshot(guildId, period, 'pubg');
      await this.createSnapshot(guildId, period, 'internal');
    }
    
    this.logger.info('Created weekly ranking snapshots');
  }

  /**
   * Create monthly snapshots
   */
  private async createMonthlySnapshots(): Promise<void> {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(1);
    lastMonth.setHours(0, 0, 0, 0);
    
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const period: RankingPeriod = {
      type: 'monthly',
      startDate: lastMonth,
      endDate: thisMonth,
    };
    
    for (const guildId of this.rankings.keys()) {
      await this.createSnapshot(guildId, period, 'pubg');
      await this.createSnapshot(guildId, period, 'internal');
    }
    
    this.logger.info('Created monthly ranking snapshots');
  }

  /**
   * Create ranking snapshot
   */
  private async createSnapshot(
    guildId: string,
    period: RankingPeriod,
    type: 'pubg' | 'internal',
    gameMode?: PUBGGameMode,
  ): Promise<void> {
    try {
      const guildRankings = this.rankings.get(guildId);
      if (!guildRankings) {
        return;
      }
      
      const data = Array.from(guildRankings.values());
      
      const snapshot: RankingSnapshot = {
        id: `${guildId}_${type}_${period.type}_${Date.now()}`,
        guildId,
        period,
        type,
        gameMode,
        data,
        createdAt: new Date(),
      };
      
      // Save to database
      await this.database.client.rankingSnapshot.create({
        data: {
          id: snapshot.id,
          userId: 'system', // System-generated snapshot
          guildId,
          type,
          period: period.type,
          rank: 0,
          value: 0,
          metadata: JSON.parse(JSON.stringify({
            gameMode: gameMode || null,
            startDate: period.startDate.toISOString(),
            endDate: period.endDate.toISOString(),
            data: JSON.stringify(data),
          })),
        },
      });
      
      // Store in memory
      if (!this.snapshots.has(guildId)) {
        this.snapshots.set(guildId, []);
      }
      this.snapshots.get(guildId)!.push(snapshot);
      
      // Keep only last 30 snapshots per guild
      const guildSnapshots = this.snapshots.get(guildId)!;
      if (guildSnapshots.length > 30) {
        guildSnapshots.splice(0, guildSnapshots.length - 30);
      }
      
      this.logger.info('SNAPSHOT_CREATED', {
        guildId,
        type,
        period: period.type,
        userCount: data.length,
      });
      
    } catch (error) {
      this.logger.error(`Failed to create snapshot for guild ${guildId}:`, error);
    }
  }

  /**
   * Update role assignments based on rankings
   */
  private async updateRoleAssignments(): Promise<void> {
    try {
      for (const [guildId, roleRewards] of Array.from(this.roleRewards.entries())) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
          continue;
        }
        
        // Get current rankings
        const pubgRanking = this.getPUBGRanking(guildId, {
          type: 'all_time',
          startDate: new Date(0),
          endDate: new Date(),
        });
        
        const internalRanking = this.getInternalRanking(guildId, {
          type: 'all_time',
          startDate: new Date(0),
          endDate: new Date(),
        });
        
        // Update PUBG role assignments
        await this.updateRolesForRanking(guild, pubgRanking, roleRewards, 'pubg');
        
        // Update internal role assignments
        await this.updateRolesForRanking(guild, internalRanking, roleRewards, 'internal');
      }
      
      this.logger.debug('Updated role assignments');
    } catch (error) {
      this.logger.error('Failed to update role assignments:', error);
    }
  }

  /**
   * Update roles for specific ranking
   */
  private async updateRolesForRanking(
    guild: any,
    ranking: any[],
    roleRewards: RoleReward[],
    type: 'pubg' | 'internal',
  ): Promise<void> {
    for (const roleReward of roleRewards) {
      const role = guild.roles.cache.get(roleReward.roleId);
      if (!role) {
        continue;
      }
      
      const [minRank, maxRank] = roleReward.rankRange;
      
      // Get users in rank range
      const usersInRange = ranking.slice(minRank - 1, maxRank);
      
      for (const entry of usersInRange) {
        try {
          const member = await guild.members.fetch(entry.userId);
          if (member && !member.roles.cache.has(roleReward.roleId)) {
            await member.roles.add(role);
            
            this.logger.info('ROLE_ASSIGNED', {
              guildId: guild.id,
              userId: entry.userId,
              roleId: roleReward.roleId,
              rank: entry.rank,
              type,
            });
          }
        } catch (error) {
          this.logger.error(`Failed to assign role to user ${entry.userId}:`, error);
        }
      }
      
      // Remove role from users outside rank range
      const membersWithRole = role.members;
      for (const [memberId, member] of membersWithRole) {
        const userInRange = usersInRange.some(entry => entry.userId === memberId);
        if (!userInRange) {
          try {
            await member.roles.remove(role);
            
            this.logger.info('ROLE_REMOVED', {
              guildId: guild.id,
              userId: memberId,
              roleId: roleReward.roleId,
              type,
            });
          } catch (error) {
            this.logger.error(`Failed to remove role from user ${memberId}:`, error);
          }
        }
      }
    }
  }

  /**
   * Configure role rewards for guild
   */
  public async configureRoleRewards(guildId: string, roleRewards: RoleReward[]): Promise<void> {
    try {
      this.roleRewards.set(guildId, roleRewards);
      
      // Save to database
      const existingConfig = await this.database.client.guildConfig.findUnique({
        where: { guildId },
      });
      
      const currentConfig = existingConfig?.config as any || {};
      currentConfig.rankingRoles = roleRewards;
      
      await this.database.client.guildConfig.upsert({
        where: { guildId },
        update: {
          config: JSON.parse(JSON.stringify(currentConfig)),
        },
        create: {
          guildId,
          config: JSON.parse(JSON.stringify({ rankingRoles: roleRewards })),
        },
      });
      
      this.logger.info('ROLE_REWARDS_CONFIGURED', {
        guildId,
        rewardCount: roleRewards.length,
      });
      
    } catch (error) {
      this.logger.error(`Failed to configure role rewards for guild ${guildId}:`, error);
    }
  }

  /**
   * Get ranking statistics
   */
  public getRankingStats(guildId: string): {
    totalUsers: number;
    pubgUsers: number;
    averageLevel: number;
    topPlayer: string | null;
  } {
    const guildRankings = this.rankings.get(guildId);
    if (!guildRankings) {
      return {
        totalUsers: 0,
        pubgUsers: 0,
        averageLevel: 0,
        topPlayer: null,
      };
    }
    
    const users = Array.from(guildRankings.values());
    const pubgUsers = users.filter(user => user.pubgName && user.pubgPlatform);
    const averageLevel = users.reduce((sum, user) => sum + user.stats.level, 0) / users.length;
    
    // Get top player by level
    const topPlayer = users.reduce((top, user) => {
      if (!top || user.stats.level > top.stats.level) {
        return user;
      }
      return top;
    }, null as UserRankingData | null);
    
    return {
      totalUsers: users.length,
      pubgUsers: pubgUsers.length,
      averageLevel: Math.round(averageLevel),
      topPlayer: topPlayer?.username || null,
    };
  }

  /**
   * Get historical ranking data
   */
  public getHistoricalRanking(
    guildId: string,
    type: 'pubg' | 'internal',
    period: 'daily' | 'weekly' | 'monthly',
    limit: number = 10,
  ): RankingSnapshot[] {
    const guildSnapshots = this.snapshots.get(guildId) || [];
    
    return guildSnapshots
      .filter(snapshot => snapshot.type === type && snapshot.period.type === period)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Force update user ranking
   */
  public async forceUpdateUser(guildId: string, userId: string): Promise<boolean> {
    try {
      await this.updateUserRanking(guildId, userId);
      return true;
    } catch (error) {
      this.logger.error(`Failed to force update user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get user ranking data
   */
  public getUserRankingData(guildId: string, userId: string): UserRankingData | null {
    const guildRankings = this.rankings.get(guildId);
    return guildRankings?.get(userId) || null;
  }

  /**
   * Clear ranking cache
   */
  public async clearCache(guildId?: string): Promise<void> {
    if (guildId) {
      this.rankings.delete(guildId);
      this.snapshots.delete(guildId);
    } else {
      this.rankings.clear();
      this.snapshots.clear();
    }
    
    this.logger.info(`Cleared ranking cache${guildId ? ` for guild ${guildId}` : ''}`);
  }
}