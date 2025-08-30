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
  
  // XP base por tipo de atividade (REBALANCEADO)
  private readonly ACTIVITY_XP: Record<string, number> = {
    MM: 35,              // +10 (25→35) - Matchmaking mais valorizado
    SCRIM: 65,           // +15 (50→65) - Scrimmages mais recompensadoras
    CAMPEONATO: 120,     // +20 (100→120) - Campeonatos premium
    RANKED: 85,          // +10 (75→85) - Ranked mais atrativo
    DAILY_CHALLENGE: 60, // +10 (50→60) - Desafios diários mais valiosos
    ACHIEVEMENT: 80,     // -20 (100→80) - Conquistas menos inflacionárias
    BADGE_EARNED: 35,    // +10 (25→35) - Badges mais significativas
    QUIZ_COMPLETED: 45,  // +15 (30→45) - Quiz mais educativo
    CLIP_APPROVED: 55,   // +15 (40→55) - Clips de qualidade recompensados
    CHECK_IN: 15,        // +5 (10→15) - Check-in diário mais atrativo
    WEAPON_MASTERY: 40,  // NOVO - Maestria de armas
    TOURNAMENT_WIN: 200, // NOVO - Vitória em torneio
    STREAK_BONUS: 25,    // NOVO - Bônus por sequências
  };

  // Bônus XP por tempo de atividade (REBALANCEADO)
  private readonly TIME_BONUS_XP: Record<string, number> = {
    '30m': 15,   // NOVO - Bônus para sessões curtas
    '1h': 35,    // +10 (25→35) - 1 hora mais recompensadora
    '2h': 70,    // +20 (50→70) - 2 horas significativamente melhor
    '3h': 120,   // +20 (100→120) - 3 horas premium
    '4h+': 180,  // NOVO - Sessões longas muito recompensadoras
  };

  // Multiplicadores por dificuldade de desafio
  private readonly CHALLENGE_DIFFICULTY_MULTIPLIER: Record<string, number> = {
    'easy': 1.0,
    'medium': 1.3,
    'hard': 1.6,
    'extreme': 2.0,
    'legendary': 2.5,
  };

  // Fórmula para calcular XP necessário para próximo nível (REBALANCEADA)
  private readonly XP_PER_LEVEL = 120;     // +20 (100→120) - Níveis mais desafiadores
  private readonly XP_MULTIPLIER = 1.15;   // -0.05 (1.2→1.15) - Crescimento mais suave
  private readonly MAX_LEVEL = 100;        // NOVO - Nível máximo definido
  private readonly PRESTIGE_XP_BONUS = 0.1; // NOVO - 10% bônus XP após prestígio

  constructor(client: any) {
    this.prisma = client.database.client;
    this.logger = new Logger();
    this.cache = client.cache;
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
          bonusXP = this.TIME_BONUS_XP['3h+'] || 0;
        } else if (timeSpent >= 2) {
          bonusXP = this.TIME_BONUS_XP['2h'] || 0;
        } else if (timeSpent >= 1) {
          bonusXP = this.TIME_BONUS_XP['1h'] || 0;
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
      if (cached && typeof cached === 'string') return JSON.parse(cached);

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
      if (cached && typeof cached === 'string') return JSON.parse(cached);

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

  /**
   * Adiciona XP com multiplicador de dificuldade de desafio
   */
  public async addChallengeXP(
    userId: string,
    difficulty: string,
    baseXP: number = 60
  ): Promise<XPGainResult> {
    const multiplier = this.CHALLENGE_DIFFICULTY_MULTIPLIER[difficulty] || 1.0;
    const finalXP = Math.floor(baseXP * multiplier);
    
    const challengeBaseXP = this.ACTIVITY_XP.DAILY_CHALLENGE || 1;
    return this.addXP(userId, 'DAILY_CHALLENGE', undefined, finalXP / challengeBaseXP);
  }

  /**
   * Adiciona XP de maestria de armas
   */
  public async addWeaponMasteryXP(
    userId: string,
    masteryLevel: number = 1
  ): Promise<XPGainResult> {
    const multiplier = 1 + (masteryLevel * 0.1); // 10% por nível de maestria
    return this.addXP(userId, 'WEAPON_MASTERY', undefined, multiplier);
  }

  /**
   * Adiciona XP de vitória em torneio
   */
  public async addTournamentWinXP(
    userId: string,
    tournamentTier: 'local' | 'regional' | 'national' | 'international' = 'local'
  ): Promise<XPGainResult> {
    const tierMultipliers = {
      'local': 1.0,
      'regional': 1.5,
      'national': 2.0,
      'international': 3.0
    };
    
    const multiplier = tierMultipliers[tournamentTier];
    return this.addXP(userId, 'TOURNAMENT_WIN', undefined, multiplier);
  }

  /**
   * Adiciona XP de bônus por sequência (streak)
   */
  public async addStreakBonusXP(
    userId: string,
    streakCount: number
  ): Promise<XPGainResult> {
    const multiplier = Math.min(streakCount * 0.2, 3.0); // Máximo 3x multiplier
    return this.addXP(userId, 'STREAK_BONUS', undefined, multiplier);
  }

  /**
   * Sistema de prestígio - reseta nível mas mantém bônus
   */
  public async prestigeUser(userId: string): Promise<{
    success: boolean;
    newPrestigeLevel: number;
    bonusXPPercent: number;
  }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || user.level < this.MAX_LEVEL) {
        return { success: false, newPrestigeLevel: 0, bonusXPPercent: 0 };
      }

      const newPrestigeLevel = (user.prestigeLevel || 0) + 1;
      const bonusXPPercent = newPrestigeLevel * this.PRESTIGE_XP_BONUS * 100;

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          level: 1,
          xp: 0,
          totalXp: user.totalXp, // Mantém XP total para histórico
          prestigeLevel: newPrestigeLevel,
        }
      });

      // Limpar cache
      await this.cache.del(`user_xp:${userId}`);
      await this.cache.del(`user_level:${userId}`);

      this.logger.info(`User ${userId} prestiged to level ${newPrestigeLevel}`);

      return {
        success: true,
        newPrestigeLevel,
        bonusXPPercent
      };
    } catch (error) {
      this.logger.error('Failed to prestige user:', error);
      return { success: false, newPrestigeLevel: 0, bonusXPPercent: 0 };
    }
  }

  /**
   * Calcula bônus XP baseado no prestígio
   */
  private calculatePrestigeBonus(userId: string, baseXP: number): Promise<number> {
    return new Promise(async (resolve) => {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { prestigeLevel: true }
        });

        const prestigeLevel = user?.prestigeLevel || 0;
        const bonus = baseXP * (prestigeLevel * this.PRESTIGE_XP_BONUS);
        resolve(Math.floor(bonus));
      } catch (error) {
        resolve(0);
      }
    });
  }

  /**
   * Obtém informações de prestígio do usuário
   */
  public async getUserPrestigeInfo(userId: string): Promise<{
    prestigeLevel: number;
    bonusXPPercent: number;
    canPrestige: boolean;
    nextPrestigeBenefit: string;
  } | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { level: true, prestigeLevel: true }
      });

      if (!user) return null;

      const prestigeLevel = user.prestigeLevel || 0;
      const bonusXPPercent = prestigeLevel * this.PRESTIGE_XP_BONUS * 100;
      const canPrestige = user.level >= this.MAX_LEVEL;
      const nextBonusPercent = (prestigeLevel + 1) * this.PRESTIGE_XP_BONUS * 100;

      return {
        prestigeLevel,
        bonusXPPercent,
        canPrestige,
        nextPrestigeBenefit: `+${nextBonusPercent}% XP bonus`
      };
    } catch (error) {
      this.logger.error('Failed to get prestige info:', error);
      return null;
    }
  }
}