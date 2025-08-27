import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger.js';
import { CacheService } from './cache.service.js';

export interface ActivityType {
  MM: 25;
  SCRIM: 50;
  CAMPEONATO: 100;
  RANKED: 75;
}

export interface TimeBonusXP {
  '1h': 25;
  '2h': 50;
  '3h+': 100;
}

export interface XPGainResult {
  userId: string;
  baseXP: number;
  bonusXP: number;
  totalXP: number;
  newLevel: number;
  oldLevel: number;
  leveledUp: boolean;
}

export class XPService {
  private prisma: PrismaClient;
  private logger: Logger;
  private cache: CacheService;
  
  // XP base por tipo de atividade
  private readonly ACTIVITY_XP: Record<string, number> = {
    MM: 25,
    SCRIM: 50,
    CAMPEONATO: 100,
    RANKED: 75,
    DAILY_CHALLENGE: 50,
    ACHIEVEMENT: 100,
    BADGE_EARNED: 25,
    QUIZ_COMPLETED: 30,
    CLIP_APPROVED: 40,
    CHECK_IN: 10,
  };

  // Bônus XP por tempo de atividade
  private readonly TIME_BONUS_XP: Record<string, number> = {
    '1h': 25,
    '2h': 50,
    '3h+': 100,
  };

  // Fórmula para calcular XP necessário para próximo nível
  private readonly XP_PER_LEVEL = 100;
  private readonly XP_MULTIPLIER = 1.2;

  constructor(prisma: PrismaClient, logger: Logger, cache: CacheService) {
    this.prisma = prisma;
    this.logger = logger;
    this.cache = cache;
  }

  /**
   * Calcula XP necessário para um nível específico
   */
  public calculateXPForLevel(level: number): number {
    if (level <= 1) return 0;
    
    let totalXP = 0;
    for (let i = 1; i < level; i++) {
      totalXP += Math.floor(this.XP_PER_LEVEL * Math.pow(this.XP_MULTIPLIER, i - 1));
    }
    return totalXP;
  }

  /**
   * Calcula nível baseado no XP total
   */
  public calculateLevelFromXP(totalXP: number): number {
    let level = 1;
    let xpRequired = 0;
    
    while (xpRequired <= totalXP) {
      level++;
      xpRequired += Math.floor(this.XP_PER_LEVEL * Math.pow(this.XP_MULTIPLIER, level - 2));
    }
    
    return level - 1;
  }

  /**
   * Adiciona XP para um usuário
   */
  public async addXP(
    userId: string,
    activityType: string,
    timeSpent?: number, // em horas
    multiplier: number = 1
  ): Promise<XPGainResult> {
    try {
      // Buscar usuário atual
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { xp: true, totalXp: true, level: true }
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Calcular XP base
      const baseXP = (this.ACTIVITY_XP[activityType.toUpperCase()] || 0) * multiplier;
      
      // Calcular bônus por tempo
      let bonusXP = 0;
      if (timeSpent) {
        if (timeSpent >= 3) {
          bonusXP = this.TIME_BONUS_XP['3h+'];
        } else if (timeSpent >= 2) {
          bonusXP = this.TIME_BONUS_XP['2h'];
        } else if (timeSpent >= 1) {
          bonusXP = this.TIME_BONUS_XP['1h'];
        }
      }

      const totalXPGain = baseXP + bonusXP;
      const newTotalXP = user.totalXp + totalXPGain;
      const newLevel = this.calculateLevelFromXP(newTotalXP);
      const leveledUp = newLevel > user.level;

      // Atualizar usuário no banco
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          xp: user.xp + totalXPGain,
          totalXp: newTotalXP,
          level: newLevel,
        }
      });

      // Limpar cache do usuário
      await this.cache.del(`user:${userId}`);
      await this.cache.del(`user:${userId}:xp`);
      await this.cache.del(`user:${userId}:level`);

      const result: XPGainResult = {
        userId,
        baseXP,
        bonusXP,
        totalXP: totalXPGain,
        newLevel,
        oldLevel: user.level,
        leveledUp
      };

      // Log da atividade
      this.logger.info(`XP gained for user ${userId}:`, {
        activity: activityType,
        baseXP,
        bonusXP,
        totalGain: totalXPGain,
        newLevel,
        leveledUp
      });

      // Se subiu de nível, processar recompensas
      if (leveledUp) {
        await this.processLevelUpRewards(userId, user.level, newLevel);
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to add XP:', error);
      throw error;
    }
  }

  /**
   * Processa recompensas por subir de nível
   */
  private async processLevelUpRewards(userId: string, oldLevel: number, newLevel: number): Promise<void> {
    try {
      // Recompensas por nível
      const coinsReward = (newLevel - oldLevel) * 50; // 50 coins por nível
      
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          coins: {
            increment: coinsReward
          }
        }
      });

      // Registrar transação
      await this.prisma.transaction.create({
        data: {
          userId,
          type: 'earn',
          amount: coinsReward,
          balance: 0, // Será atualizado por trigger ou outro processo
          reason: `Level up reward (${oldLevel} → ${newLevel})`,
          metadata: JSON.stringify({ oldLevel, newLevel })
        }
      });

      // Verificar se deve ganhar badges por nível
      await this.checkLevelBadges(userId, newLevel);

      this.logger.info(`Level up rewards processed for user ${userId}:`, {
        oldLevel,
        newLevel,
        coinsReward
      });
    } catch (error) {
      this.logger.error('Failed to process level up rewards:', error);
    }
  }

  /**
   * Verifica e concede badges baseadas no nível
   */
  private async checkLevelBadges(userId: string, level: number): Promise<void> {
    const levelBadges = [
      { level: 5, badgeName: 'Novato' },
      { level: 10, badgeName: 'Experiente' },
      { level: 25, badgeName: 'Veterano' },
      { level: 50, badgeName: 'Elite' },
      { level: 100, badgeName: 'Lenda' },
    ];

    for (const { level: requiredLevel, badgeName } of levelBadges) {
      if (level >= requiredLevel) {
        try {
          // Verificar se já tem a badge
          const existingBadge = await this.prisma.userBadge.findFirst({
            where: {
              userId,
              badge: {
                name: badgeName
              }
            }
          });

          if (!existingBadge) {
            // Buscar a badge
            const badge = await this.prisma.badge.findUnique({
              where: { name: badgeName }
            });

            if (badge) {
              // Conceder badge
              await this.prisma.userBadge.create({
                data: {
                  userId,
                  badgeId: badge.id,
                  metadata: JSON.stringify({ earnedByLevel: level })
                }
              });

              this.logger.info(`Badge '${badgeName}' awarded to user ${userId} for reaching level ${level}`);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to award level badge '${badgeName}' to user ${userId}:`, error);
        }
      }
    }
  }

  /**
   * Obtém informações de XP e nível do usuário
   */
  public async getUserXPInfo(userId: string): Promise<{
    level: number;
    xp: number;
    totalXp: number;
    xpForCurrentLevel: number;
    xpForNextLevel: number;
    xpProgress: number;
    xpProgressPercent: number;
  } | null> {
    try {
      const cacheKey = `user:${userId}:xp_info`;
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { level: true, xp: true, totalXp: true }
      });

      if (!user) return null;

      const xpForCurrentLevel = this.calculateXPForLevel(user.level);
      const xpForNextLevel = this.calculateXPForLevel(user.level + 1);
      const xpProgress = user.totalXp - xpForCurrentLevel;
      const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
      const xpProgressPercent = Math.round((xpProgress / xpNeededForNext) * 100);

      const result = {
        level: user.level,
        xp: user.xp,
        totalXp: user.totalXp,
        xpForCurrentLevel,
        xpForNextLevel,
        xpProgress,
        xpProgressPercent
      };

      // Cache por 5 minutos
      await this.cache.set(cacheKey, result, 300);
      return result;
    } catch (error) {
      this.logger.error('Failed to get user XP info:', error);
      return null;
    }
  }

  /**
   * Obtém ranking de XP
   */
  public async getXPLeaderboard(guildId?: string, limit: number = 10): Promise<Array<{
    userId: string;
    username: string;
    level: number;
    totalXp: number;
    rank: number;
  }>> {
    try {
      const cacheKey = `xp_leaderboard:${guildId || 'global'}:${limit}`;
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;

      // Query base
      let whereClause = {};
      if (guildId) {
        whereClause = {
          guilds: {
            some: {
              guildId,
              isActive: true
            }
          }
        };
      }

      const users = await this.prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          username: true,
          level: true,
          totalXp: true
        },
        orderBy: {
          totalXp: 'desc'
        },
        take: limit
      });

      const leaderboard = users.map((user, index) => ({
        userId: user.id,
        username: user.username,
        level: user.level,
        totalXp: user.totalXp,
        rank: index + 1
      }));

      // Cache por 10 minutos
      await this.cache.set(cacheKey, leaderboard, 600);
      return leaderboard;
    } catch (error) {
      this.logger.error('Failed to get XP leaderboard:', error);
      return [];
    }
  }

  /**
   * Adiciona XP por check-in com base no tipo de atividade
   */
  public async addCheckInXP(
    userId: string,
    activityType: string,
    duration?: number // em horas
  ): Promise<XPGainResult> {
    return this.addXP(userId, activityType, duration);
  }

  /**
   * Adiciona XP por desafio diário completado
   */
  public async addDailyChallengeXP(
    userId: string,
    challengeMultiplier: number = 1
  ): Promise<XPGainResult> {
    return this.addXP(userId, 'DAILY_CHALLENGE', undefined, challengeMultiplier);
  }

  /**
   * Adiciona XP por conquista/achievement
   */
  public async addAchievementXP(
    userId: string,
    achievementPoints: number = 100
  ): Promise<XPGainResult> {
    const multiplier = achievementPoints / 100; // Normalizar baseado em 100 pontos
    return this.addXP(userId, 'ACHIEVEMENT', undefined, multiplier);
  }
}