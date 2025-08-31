import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { PUBGService } from './pubg.service';
import { LoggingService } from './logging.service';
import { ExtendedClient } from '../types/client';
import {
  PUBGPlatform,
  PUBGGameMode,
  PUBGRankTier,
  InternalRankingEntry,
  PUBGRankingEntry,
} from '../types/pubg';
import { GuildMember, Role, EmbedBuilder, TextChannel } from 'discord.js';

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
    // PUBG stats
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
    // Internal stats
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
 * Serviço de ranking que gerencia rankings PUBG e internos
 */
export class RankingService {
  private logger: Logger;
  private cache: CacheService;
  private database: DatabaseService;
  private pubgService: PUBGService;
  private loggingService: LoggingService;
  private client: ExtendedClient;

  private rankings: Map<string, Map<string, UserRankingData>> = new Map(); // guildId -> userId -> data
  private snapshots: Map<string, RankingSnapshot[]> = new Map(); // guildId -> snapshots
  private roleRewards: Map<string, RoleReward[]> = new Map(); // guildId -> role rewards

  private readonly updateIntervals = {
    daily: 24 * 60 * 60 * 1000, // 24 hours
    weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
    monthly: 30 * 24 * 60 * 60 * 1000, // 30 days
    realtime: 3 * 60 * 1000, // 3 minutes for real-time updates
    hourly: 60 * 60 * 1000, // 1 hour for competitive seasons
  };

  // Pesos para cálculo de scores
  private readonly rankingWeights = {
    pubg: {
      rankPoints: 0.4, // 40% - Pontos de rank PUBG
      kda: 0.25, // 25% - KDA
      winRate: 0.2, // 20% - Taxa de vitória
      averageDamage: 0.15, // 15% - Dano médio
    },
    internal: {
      level: 0.3, // 30% - Nível do usuário
      xp: 0.2, // 20% - XP total
      activity: 0.25, // 25% - Atividade (mensagens + voz)
      achievements: 0.25, // 25% - Conquistas (badges + desafios)
    },
    hybrid: {
      pubgScore: 0.6, // 60% - Score PUBG composto
      internalScore: 0.4, // 40% - Score interno composto
    },
  };

  constructor(client: ExtendedClient) {
    this.client = client;
    this.logger = new Logger();
    this.cache = new CacheService();
    this.database = new DatabaseService();
    this.pubgService = new PUBGService();
    this.loggingService = new LoggingService(client, this.database);

    this.loadRankings();
    this.loadRoleRewards();
    this.startRankingUpdater();
    this.startSnapshotScheduler();
  }

  /**
   * Carrega rankings do banco de dados
   */
  private async loadRankings(): Promise<void> {
    try {
      const guilds = this.client.guilds.cache;
      
      for (const [guildId] of guilds) {
        const guildRankings = new Map<string, UserRankingData>();
        
        // Carregar dados do banco usando User model
        const users = await this.database.client.user.findMany({
          include: {
            guilds: {
              where: { guildId },
            },
          },
        });

        for (const user of users) {
          if (user.guilds.length > 0) {
            const userData: UserRankingData = {
              userId: user.id,
              username: user.username,
              pubgName: user.pubgUsername || undefined,
              pubgPlatform: user.pubgPlatform as PUBGPlatform,
              stats: {
                kills: 0,
                wins: 0,
                games: 0,
                damage: 0,
                headshots: 0,
                kda: 0,
                winRate: 0,
                averageDamage: 0,
                rankPoints: 0,
                tier: PUBGRankTier.BRONZE,
                subTier: '',
                level: user.level || 1,
                xp: user.xp || 0,
                coins: user.coins || 0,
                messages: user.messagesCount || 0,
                 voiceTime: 0, // voiceTime não existe no modelo User
                quizScore: 0,
                miniGameWins: 0,
                badgeCount: 0,
                checkIns: 0,
                clipsUploaded: 0,
                clipsVotes: 0,
              },
              lastUpdated: new Date(user.updatedAt || Date.now()),
            };
            
            guildRankings.set(user.id, userData);
          }
        }
        
        this.rankings.set(guildId, guildRankings);
      }
      
      this.logger.info(`Loaded rankings for ${guilds.size} guilds`);
    } catch (error) {
      this.logger.error('Error loading rankings:', error);
    }
  }

  /**
   * Carrega recompensas de roles do banco de dados
   */
  private async loadRoleRewards(): Promise<void> {
    try {
      // Load role rewards from guild configs since roleReward table doesn't exist
      const guildConfigs = await this.database.client.guildConfig.findMany();
      
      for (const config of guildConfigs) {
        if (!this.roleRewards.has(config.guildId)) {
          this.roleRewards.set(config.guildId, []);
        }
        
        try {
          const configData = JSON.parse(config.config || '{}');
          const roleRewards = configData.roleRewards || [];
          
          for (const reward of roleRewards) {
            this.roleRewards.get(config.guildId)!.push({
              rankRange: [reward.minRank || 1, reward.maxRank || 10],
              roleId: reward.roleId,
              roleName: reward.roleName,
              temporary: reward.temporary || false,
              duration: reward.duration,
            });
          }
        } catch (parseError) {
          this.logger.warn(`Error parsing guild config for ${config.guildId}:`, parseError);
        }
      }
    } catch (error) {
      this.logger.error('Error loading role rewards:', error);
    }
  }

  /**
   * Inicia o atualizador automático de rankings
   */
  private startRankingUpdater(): void {
    // Atualização em tempo real a cada 3 minutos
    setInterval(() => {
      this.updateAllRankings();
    }, this.updateIntervals.realtime);

    // Atualização completa diária
    setInterval(() => {
      this.createDailySnapshots();
    }, this.updateIntervals.daily);
  }

  /**
   * Inicia o agendador de snapshots
   */
  private startSnapshotScheduler(): void {
    // Snapshots semanais (domingo à meia-noite)
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(0, 0, 0, 0);
    
    setTimeout(() => {
      this.createWeeklySnapshots();
      setInterval(() => {
        this.createWeeklySnapshots();
      }, this.updateIntervals.weekly);
    }, nextSunday.getTime() - now.getTime());

    // Snapshots mensais (primeiro dia do mês)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    setTimeout(() => {
      this.createMonthlySnapshots();
      setInterval(() => {
        this.createMonthlySnapshots();
      }, this.updateIntervals.monthly);
    }, nextMonth.getTime() - now.getTime());
  }

  /**
   * Atualiza o ranking de um usuário específico
   */
  public async updateUserRanking(guildId: string, userId: string): Promise<void> {
    try {
      if (!this.rankings.has(guildId)) {
        this.rankings.set(guildId, new Map());
      }

      const guildRankings = this.rankings.get(guildId)!;
      let userData = guildRankings.get(userId);

      if (!userData) {
        // Criar novo usuário
        const member = await this.client.guilds.cache.get(guildId)?.members.fetch(userId);
        if (!member) {return;}

        userData = {
          userId,
          username: member.user.username,
          stats: {
            kills: 0, wins: 0, games: 0, damage: 0, headshots: 0,
            kda: 0, winRate: 0, averageDamage: 0, rankPoints: 0,
            tier: PUBGRankTier.BRONZE, subTier: '',
            level: 1, xp: 0, coins: 0, messages: 0, voiceTime: 0,
            quizScore: 0, miniGameWins: 0, badgeCount: 0,
            checkIns: 0, clipsUploaded: 0, clipsVotes: 0,
          },
          lastUpdated: new Date(),
        };
      }

      // Atualizar dados PUBG se disponível
      if (userData.pubgName && userData.pubgPlatform) {
        try {
          const pubgStats = await this.pubgService.getPlayerStats(
            userData.pubgName,
            userData.pubgPlatform,
          );

          if (pubgStats && pubgStats.gameModeStats) {
            // Use squad stats as default, fallback to other modes
            const modeStats = pubgStats.gameModeStats[PUBGGameMode.SQUAD] || 
                             pubgStats.gameModeStats[PUBGGameMode.DUO] || 
                             pubgStats.gameModeStats[PUBGGameMode.SOLO] ||
                             Object.values(pubgStats.gameModeStats)[0];
            
            if (modeStats) {
              userData.stats.kills = modeStats.kills || 0;
              userData.stats.wins = modeStats.wins || 0;
              userData.stats.games = modeStats.roundsPlayed || 0;
              userData.stats.damage = modeStats.damageDealt || 0;
              userData.stats.headshots = modeStats.headshotKills || 0;
              userData.stats.kda = modeStats.kills / Math.max(modeStats.losses, 1);
              userData.stats.winRate = (modeStats.wins / Math.max(modeStats.roundsPlayed, 1)) * 100;
              userData.stats.averageDamage = modeStats.damageDealt / Math.max(modeStats.roundsPlayed, 1);
              userData.stats.rankPoints = modeStats.rankPoints || 0;
              userData.stats.tier = PUBGRankTier.BRONZE; // Will be updated from season stats
              userData.stats.subTier = '';
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to update PUBG stats for ${userId}:`, error);
        }
      }

      // Atualizar dados internos do banco
      try {
        const internalData = await this.database.client.user.findFirst({
          where: { id: userId },
        });

        if (internalData) {
          userData.stats.level = internalData.level || 1;
          userData.stats.xp = internalData.xp || 0;
          userData.stats.coins = internalData.coins || 0;
          userData.stats.messages = internalData.messagesCount || 0;
          userData.stats.voiceTime = 0; // voiceTime não existe no modelo User
          userData.stats.badgeCount = 0; // Will be calculated from badges relation
        }
      } catch (error) {
        this.logger.warn(`Failed to update internal stats for ${userId}:`, error);
      }

      userData.lastUpdated = new Date();
      guildRankings.set(userId, userData);

      // Salvar no banco
      await this.saveUserRanking(guildId, userData);

      await this.logRankingOperation(
        'updateUserRanking',
        'success',
        `Updated ranking for user ${userId}`,
        { userId, pubgName: userData.pubgName },
      );
    } catch (error) {
      this.logger.error(`Error updating user ranking for ${userId}:`, error);
      await this.logRankingOperation(
        'updateUserRanking',
        'error',
        `Failed to update ranking for user ${userId}`,
        { userId, error: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  /**
   * Atualiza todos os rankings
   */
  public async updateAllRankings(): Promise<void> {
    try {
      for (const [guildId, guildRankings] of this.rankings) {
        for (const userId of guildRankings.keys()) {
          await this.updateUserRanking(guildId, userId);
        }
      }
    } catch (error) {
      this.logger.error('Error updating all rankings:', error);
    }
  }

  /**
   * Obtém ranking PUBG
   */
  public getPUBGRanking(
    guildId: string,
    period: RankingPeriod,
    gameMode: PUBGGameMode = PUBGGameMode.SQUAD_FPP,
    sortBy: 'kills' | 'wins' | 'kda' | 'rankPoints' | 'winRate' = 'rankPoints',
    limit: number = 50,
  ): PUBGRankingEntry[] {
    const guildRankings = this.rankings.get(guildId);
    if (!guildRankings) {return [];}

    const users = Array.from(guildRankings.values())
      .filter(user => user.pubgName && this.isInPeriod(user.lastUpdated, period))
      .sort((a, b) => {
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
      })
      .slice(0, limit);

    return users.map((user, index) => ({
      rank: index + 1,
      userId: user.userId,
      username: user.username,
      pubgName: user.pubgName!,
      pubgPlatform: user.pubgPlatform!,
      stats: {
        kills: user.stats.kills,
        wins: user.stats.wins,
        games: user.stats.games,
        damage: user.stats.damage,
        headshots: user.stats.headshots,
        kda: user.stats.kda,
        winRate: user.stats.winRate,
        averageDamage: user.stats.averageDamage,
        rankPoints: user.stats.rankPoints,
        tier: user.stats.tier,
        subTier: user.stats.subTier,
      },
      lastUpdated: user.lastUpdated,
    }));
  }

  /**
   * Obtém ranking interno
   */
  public getInternalRanking(
    guildId: string,
    period: RankingPeriod,
    sortBy:
      | 'level'
      | 'xp'
      | 'coins'
      | 'messages'
      | 'voiceTime'
      | 'quizScore'
      | 'miniGameWins'
      | 'badgeCount' = 'level',
    limit: number = 50,
  ): InternalRankingEntry[] {
    const guildRankings = this.rankings.get(guildId);
    if (!guildRankings) {return [];}

    const users = Array.from(guildRankings.values())
      .filter(user => this.isInPeriod(user.lastUpdated, period))
      .sort((a, b) => {
        switch (sortBy) {
          case 'level':
            return b.stats.level - a.stats.level;
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
          default:
            return b.stats.level - a.stats.level;
        }
      })
      .slice(0, limit);

    return users.map((user, index) => ({
      rank: index + 1,
      userId: user.userId,
      username: user.username,
      stats: {
        level: user.stats.level,
        xp: user.stats.xp,
        coins: user.stats.coins,
        messages: user.stats.messages,
        voiceTime: user.stats.voiceTime,
        quizScore: user.stats.quizScore,
        miniGameWins: user.stats.miniGameWins,
        badgeCount: user.stats.badgeCount,
        checkIns: user.stats.checkIns,
        clipsUploaded: user.stats.clipsUploaded,
        clipsVotes: user.stats.clipsVotes,
      },
      lastUpdated: user.lastUpdated,
    }));
  }

  /**
   * Obtém a posição de um usuário no ranking
   */
  public getUserRank(
    guildId: string,
    userId: string,
    type: 'pubg' | 'internal',
    sortBy?: string,
  ): { rank: number; total: number } | null {
    const guildRankings = this.rankings.get(guildId);
    if (!guildRankings) {return null;}

    const users = Array.from(guildRankings.values());
    if (type === 'pubg') {
      const pubgUsers = users.filter(u => u.pubgName);
      const sortedUsers = pubgUsers.sort((a, b) => b.stats.rankPoints - a.stats.rankPoints);
      const userIndex = sortedUsers.findIndex(u => u.userId === userId);
      return userIndex >= 0 ? { rank: userIndex + 1, total: sortedUsers.length } : null;
    } else {
      const sortedUsers = users.sort((a, b) => b.stats.level - a.stats.level);
      const userIndex = sortedUsers.findIndex(u => u.userId === userId);
      return userIndex >= 0 ? { rank: userIndex + 1, total: sortedUsers.length } : null;
    }
  }

  /**
   * Cria snapshots diários
   */
  private async createDailySnapshots(): Promise<void> {
    const today = new Date();
    const period: RankingPeriod = {
      type: 'daily',
      startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
    };

    for (const guildId of this.rankings.keys()) {
      await this.createSnapshot(guildId, period, 'pubg');
      await this.createSnapshot(guildId, period, 'internal');
    }
  }

  /**
   * Cria snapshots semanais
   */
  private async createWeeklySnapshots(): Promise<void> {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    
    const period: RankingPeriod = {
      type: 'weekly',
      startDate: startOfWeek,
      endDate: new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000),
    };

    for (const guildId of this.rankings.keys()) {
      await this.createSnapshot(guildId, period, 'pubg');
      await this.createSnapshot(guildId, period, 'internal');
    }
  }

  /**
   * Cria snapshots mensais
   */
  private async createMonthlySnapshots(): Promise<void> {
    const today = new Date();
    const period: RankingPeriod = {
      type: 'monthly',
      startDate: new Date(today.getFullYear(), today.getMonth(), 1),
      endDate: new Date(today.getFullYear(), today.getMonth() + 1, 1),
    };

    for (const guildId of this.rankings.keys()) {
      await this.createSnapshot(guildId, period, 'pubg');
      await this.createSnapshot(guildId, period, 'internal');
    }
  }

  /**
   * Cria um snapshot do ranking
   */
  private async createSnapshot(
    guildId: string,
    period: RankingPeriod,
    type: 'pubg' | 'internal',
    gameMode?: PUBGGameMode,
  ): Promise<void> {
    try {
      const guildRankings = this.rankings.get(guildId);
      if (!guildRankings) {return;}

      const users = Array.from(guildRankings.values())
        .filter(user => {
          if (type === 'pubg' && !user.pubgName) {return false;}
          return this.isInPeriod(user.lastUpdated, period);
        });

      const snapshot: RankingSnapshot = {
        id: `${guildId}_${type}_${period.type}_${Date.now()}`,
        guildId,
        period,
        type,
        gameMode,
        data: users,
        createdAt: new Date(),
      };

      if (!this.snapshots.has(guildId)) {
        this.snapshots.set(guildId, []);
      }

      this.snapshots.get(guildId)!.push(snapshot);

      // Salvar no banco usando RankingSnapshot model
       await this.database.client.rankingSnapshot.create({
         data: {
           userId: 'system', // Sistema snapshot
           guildId: snapshot.guildId,
           type: snapshot.type,
           period: snapshot.period.type,
           rank: 0, // Rank padrão para snapshots do sistema
           value: 0, // Valor padrão
           metadata: JSON.stringify({
             period: snapshot.period,
             gameMode: snapshot.gameMode,
             data: snapshot.data,
           }),
           date: snapshot.createdAt,
         },
       });

      this.logger.info(`Created ${type} snapshot for guild ${guildId} (${period.type})`);
    } catch (error) {
      this.logger.error(`Error creating snapshot for guild ${guildId}:`, error);
    }
  }

  /**
   * Atualiza atribuições de roles baseadas no ranking
   */
  private async updateRoleAssignments(): Promise<void> {
    try {
      for (const [guildId, roleRewards] of this.roleRewards) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {continue;}

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

        await this.updateRolesForRanking(guild, pubgRanking, roleRewards, 'pubg');
        await this.updateRolesForRanking(guild, internalRanking, roleRewards, 'internal');
      }
    } catch (error) {
      this.logger.error('Error updating role assignments:', error);
    }
  }

  /**
   * Atualiza roles para um ranking específico
   */
  private async updateRolesForRanking(
    guild: any,
    ranking: any[],
    roleRewards: RoleReward[],
    type: 'pubg' | 'internal',
  ): Promise<void> {
    try {
      for (let i = 0; i < ranking.length; i++) {
        const user = ranking[i];
        const member = await guild.members.fetch(user.userId).catch(() => null);
        if (!member) {continue;}

        const userRank = i + 1;
        const applicableRewards = roleRewards.filter(reward => 
          userRank >= reward.rankRange[0] && userRank <= reward.rankRange[1],
        );

        for (const reward of applicableRewards) {
          const role = guild.roles.cache.get(reward.roleId);
          if (!role) {continue;}

          if (!member.roles.cache.has(reward.roleId)) {
            await member.roles.add(role);
            this.logger.info(`Added role ${role.name} to ${member.user.username} (rank ${userRank})`);

            if (reward.temporary && reward.duration) {
              setTimeout(async () => {
                try {
                  await member.roles.remove(role);
                  this.logger.info(`Removed temporary role ${role.name} from ${member.user.username}`);
                } catch (error) {
                  this.logger.error('Error removing temporary role:', error);
                }
              }, reward.duration * 60 * 60 * 1000);
            }
          }
        }

        // Remover roles que não se aplicam mais
        const currentRoles = member.roles.cache;
        for (const [roleId, role] of currentRoles) {
          const roleReward = roleRewards.find(r => r.roleId === roleId);
          if (roleReward && (userRank < roleReward.rankRange[0] || userRank > roleReward.rankRange[1])) {
            await member.roles.remove(role);
            this.logger.info(`Removed role ${role.name} from ${member.user.username} (no longer qualified)`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error updating roles for ${type} ranking:`, error);
    }
  }

  /**
   * Configura recompensas de roles
   */
  public async configureRoleRewards(guildId: string, roleRewards: RoleReward[]): Promise<void> {
    try {
      this.roleRewards.set(guildId, roleRewards);

      // Salvar no banco usando GuildConfig
    const configData = {
      roleRewards: roleRewards.map(reward => ({
        roleId: reward.roleId,
        roleName: reward.roleName,
        minRank: reward.rankRange[0],
        maxRank: reward.rankRange[1],
        temporary: reward.temporary,
        duration: reward.duration || null,
      })),
    };
    
    await this.database.client.guildConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        config: JSON.stringify(configData),
      },
      update: {
        config: JSON.stringify(configData),
      },
    });

      this.logger.info(`Configured ${roleRewards.length} role rewards for guild ${guildId}`);
    } catch (error) {
      this.logger.error('Error configuring role rewards:', error);
      throw error;
    }
  }

  /**
   * Obtém estatísticas do ranking
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
    const pubgUsers = users.filter(u => u.pubgName);
    const averageLevel = users.reduce((sum, u) => sum + u.stats.level, 0) / users.length;
    
    const topPlayer = users
      .sort((a, b) => b.stats.level - a.stats.level)[0]?.username || null;

    return {
      totalUsers: users.length,
      pubgUsers: pubgUsers.length,
      averageLevel: Math.round(averageLevel * 100) / 100,
      topPlayer,
    };
  }

  /**
   * Obtém ranking histórico
   */
  public getHistoricalRanking(
    guildId: string,
    type: 'pubg' | 'internal',
    period: 'daily' | 'weekly' | 'monthly',
    limit: number = 10,
  ): RankingSnapshot[] {
    const guildSnapshots = this.snapshots.get(guildId) || [];
    return guildSnapshots
      .filter(s => s.type === type && s.period.type === period)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Força atualização de um usuário
   */
  public async forceUpdateUser(guildId: string, userId: string): Promise<boolean> {
    try {
      await this.updateUserRanking(guildId, userId);
      return true;
    } catch (error) {
      this.logger.error(`Error force updating user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Obtém dados de ranking de um usuário
   */
  public getUserRankingData(guildId: string, userId: string): UserRankingData | null {
    const guildRankings = this.rankings.get(guildId);
    return guildRankings?.get(userId) || null;
  }

  /**
   * Limpa cache de rankings
   */
  public async clearCache(guildId?: string): Promise<void> {
    if (guildId) {
      this.rankings.delete(guildId);
      this.snapshots.delete(guildId);
    } else {
      this.rankings.clear();
      this.snapshots.clear();
    }
    
    await this.loadRankings();
  }

  /**
   * Calcula score PUBG composto
   */
  private calculatePUBGScore(stats: UserRankingData['stats']): number {
    const weights = this.rankingWeights.pubg;
    
    const normalizedRankPoints = Math.min(stats.rankPoints / 5000, 1); // Normalizar para 0-1
    const normalizedKDA = Math.min(stats.kda / 5, 1);
    const normalizedWinRate = stats.winRate / 100;
    const normalizedDamage = Math.min(stats.averageDamage / 500, 1);
    
    return (
      normalizedRankPoints * weights.rankPoints +
      normalizedKDA * weights.kda +
      normalizedWinRate * weights.winRate +
      normalizedDamage * weights.averageDamage
    ) * 100;
  }

  /**
   * Calcula score interno composto
   */
  private calculateInternalScore(stats: UserRankingData['stats']): number {
    const weights = this.rankingWeights.internal;
    
    const normalizedLevel = Math.min(stats.level / 100, 1);
    const normalizedXP = Math.min(stats.xp / 100000, 1);
    const normalizedActivity = Math.min((stats.messages + stats.voiceTime / 3600) / 1000, 1);
    const normalizedAchievements = Math.min((stats.badgeCount + stats.miniGameWins) / 50, 1);
    
    return (
      normalizedLevel * weights.level +
      normalizedXP * weights.xp +
      normalizedActivity * weights.activity +
      normalizedAchievements * weights.achievements
    ) * 100;
  }

  /**
   * Calcula score híbrido
   */
  private calculateHybridScore(stats: UserRankingData['stats']): number {
    const weights = this.rankingWeights.hybrid;
    const pubgScore = this.calculatePUBGScore(stats);
    const internalScore = this.calculateInternalScore(stats);
    
    return pubgScore * weights.pubgScore + internalScore * weights.internalScore;
  }

  /**
   * Obtém ranking híbrido
   */
  public getHybridRanking(
    guildId: string,
    period: RankingPeriod,
    limit: number = 50,
  ): Array<UserRankingData & { hybridScore: number; rank: number }> {
    const guildRankings = this.rankings.get(guildId);
    if (!guildRankings) {return [];}

    const users = Array.from(guildRankings.values())
      .filter(user => this.isInPeriod(user.lastUpdated, period))
      .map(user => ({
        ...user,
        hybridScore: this.calculateHybridScore(user.stats),
      }))
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, limit)
      .map((user, index) => ({
        ...user,
        rank: index + 1,
      }));

    return users;
  }

  /**
   * Verifica se uma data está dentro do período
   */
  private isInPeriod(date: Date, period: RankingPeriod): boolean {
    return date >= period.startDate && date <= period.endDate;
  }

  /**
   * Salva dados de ranking de usuário no banco
   */
  private async saveUserRanking(guildId: string, userData: UserRankingData): Promise<void> {
    try {
      // Update user data
      await this.database.client.user.upsert({
        where: { id: userData.userId },
        create: {
           id: userData.userId,
           username: userData.username,
           discriminator: '0000', // Valor padrão para Discord discriminator
           pubgUsername: userData.pubgName,
           pubgPlatform: userData.pubgPlatform,
           level: userData.stats.level,
           xp: userData.stats.xp,
           coins: userData.stats.coins,
           messagesCount: userData.stats.messages,
         },
        update: {
          username: userData.username,
          pubgUsername: userData.pubgName,
          pubgPlatform: userData.pubgPlatform,
          level: userData.stats.level,
          xp: userData.stats.xp,
          coins: userData.stats.coins,
          messagesCount: userData.stats.messages,
        },
      });

      // Ensure user is in guild
      await this.database.client.userGuild.upsert({
        where: {
           userId_guildId: {
             userId: userData.userId,
             guildId: guildId,
           },
         },
        create: {
          userId: userData.userId,
          guildId: guildId,
          isActive: true,
        },
        update: {
          isActive: true,
        },
      });

      // Create ranking snapshot
       const hybridScore = this.calculateHybridScore(userData.stats);
       await this.database.client.rankingSnapshot.create({
         data: {
           userId: userData.userId,
           guildId: guildId,
           type: 'hybrid',
           period: 'all_time',
           rank: 0, // Será calculado posteriormente
           value: hybridScore,
           metadata: JSON.stringify(userData.stats),
         },
       });
    } catch (error) {
      this.logger.error('Error saving user ranking:', error);
      throw error;
    }
  }

  /**
   * Registra operação de ranking
   */
  private async logRankingOperation(
    operation: string,
    status: 'success' | 'warning' | 'error',
    message: string,
    data?: {
      userId?: string;
      pubgName?: string;
      playerId?: string;
      platform?: PUBGPlatform;
      details?: string;
      error?: string;
      [key: string]: any;
    },
  ): Promise<void> {
    try {
      const guild = this.client.guilds.cache.first();
      if (!guild) {
        this.logger.warn('No guild found for ranking operation log');
        return;
      }

      await this.loggingService.logApiOperation(
        guild.id,
        'RankingService',
        operation,
        status === 'success',
        data?.userId,
        status === 'error' ? message : undefined,
        {
          pubgName: data?.pubgName,
          playerId: data?.playerId,
          platform: data?.platform,
          details: data?.details,
          error: data?.error,
          ...data,
        },
      );
    } catch (logError) {
      this.logger.error('Erro ao registrar operação de ranking:', logError);
    }
  }

  /**
   * Obtém estatísticas de balanceamento do ranking
   */
  public getRankingBalance(guildId: string): {
    totalUsers: number;
    activeUsers: number;
    pubgUsers: number;
    averageHybridScore: number;
    scoreDistribution: { range: string; count: number }[];
    topPerformers: { category: string; userId: string; username: string; score: number }[];
  } {
    const guildRankings = this.rankings.get(guildId);
    if (!guildRankings) {
      return {
        totalUsers: 0,
        activeUsers: 0,
        pubgUsers: 0,
        averageHybridScore: 0,
        scoreDistribution: [],
        topPerformers: [],
      };
    }

    const users = Array.from(guildRankings.values());
    const activeUsers = users.filter(u => u.stats.messages > 0 || u.stats.voiceTime > 0);
    const pubgUsers = users.filter(u => u.pubgName);

    const hybridScores = users.map(u => this.calculateHybridScore(u.stats));
    const averageHybridScore = hybridScores.reduce((a, b) => a + b, 0) / hybridScores.length || 0;

    // Distribuição de scores
    const scoreRanges = [
      { range: '0-20', min: 0, max: 20 },
      { range: '21-40', min: 21, max: 40 },
      { range: '41-60', min: 41, max: 60 },
      { range: '61-80', min: 61, max: 80 },
      { range: '81-100', min: 81, max: 100 },
    ];

    const scoreDistribution = scoreRanges.map(range => ({
      range: range.range,
      count: hybridScores.filter(score => score >= range.min && score <= range.max).length,
    }));

    // Top performers por categoria
    const topPerformers = [
      { category: 'pubg_score', userId: '', username: 'N/A', score: 0 },
      { category: 'internal_score', userId: '', username: 'N/A', score: 0 },
      { category: 'activity', userId: '', username: 'N/A', score: 0 },
      { category: 'skill', userId: '', username: 'N/A', score: 0 },
    ];

    return {
      totalUsers: users.length,
      activeUsers: activeUsers.length,
      pubgUsers: pubgUsers.length,
      averageHybridScore: Math.round(averageHybridScore * 100) / 100,
      scoreDistribution,
      topPerformers,
    };
  }
}