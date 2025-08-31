import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';

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
    MM: 35, // +10 (25→35) - Matchmaking mais valorizado
    SCRIM: 65, // +15 (50→65) - Scrimmages mais recompensadoras
    CAMPEONATO: 120, // +20 (100→120) - Campeonatos premium
    RANKED: 85, // +10 (75→85) - Ranked mais atrativo
    DAILY_CHALLENGE: 60, // +10 (50→60) - Desafios diários mais valiosos
    ACHIEVEMENT: 80, // -20 (100→80) - Conquistas menos inflacionárias
    BADGE_EARNED: 35, // +10 (25→35) - Badges mais significativas
    QUIZ_COMPLETED: 45, // +15 (30→45) - Quiz mais educativo
    CLIP_APPROVED: 55, // +15 (40→55) - Clips de qualidade recompensados
    CHECK_IN: 15, // +5 (10→15) - Check-in diário mais atrativo
    WEAPON_MASTERY: 40, // NOVO - Maestria de armas
    TOURNAMENT_WIN: 200, // NOVO - Vitória em torneio
    STREAK_BONUS: 25, // NOVO - Bônus por sequências
  };

  // Bônus XP por tempo de atividade (REBALANCEADO)
  private readonly TIME_BONUS_XP: Record<string, number> = {
    '30m': 15, // NOVO - Bônus para sessões curtas
    '1h': 35, // +10 (25→35) - 1 hora mais recompensadora
    '2h': 70, // +20 (50→70) - 2 horas significativamente melhor
    '3h': 120, // +20 (100→120) - 3 horas premium
    '4h+': 180, // NOVO - Sessões longas muito recompensadoras
  };

  // Multiplicadores por dificuldade de desafio
  private readonly CHALLENGE_DIFFICULTY_MULTIPLIER: Record<string, number> = {
    easy: 1.0,
    medium: 1.3,
    hard: 1.6,
    extreme: 2.0,
    legendary: 2.5,
  };

  // Fórmula para calcular XP necessário para próximo nível (REBALANCEADA)
  private readonly XP_PER_LEVEL = 120; // +20 (100→120) - Níveis mais desafiadores
  private readonly XP_MULTIPLIER = 1.15; // -0.05 (1.2→1.15) - Crescimento mais suave
  private readonly MAX_LEVEL = 100; // NOVO - Nível máximo definido
  private readonly PRESTIGE_XP_BONUS = 0.1; // NOVO - 10% bônus XP após prestígio

  constructor(client: any) {
    if (!client) {
      throw new Error('Client is required for XPService');
    }

    if (!client.database?.client) {
      throw new Error('Database client is required for XPService');
    }

    if (!client.cache) {
      throw new Error('Cache service is required for XPService');
    }

    this.prisma = client.database.client;
    this.logger = new Logger();
    this.cache = client.cache;

    this.logger.info('✅ XPService initialized successfully');
  }

  /**
   * Calcula XP necessário para um nível específico
   */
  public calculateXPForLevel(level: number): number {
    if (!Number.isInteger(level) || level < 1) {
      throw new Error('Level must be a positive integer');
    }

    if (level > this.MAX_LEVEL) {
      throw new Error(`Level cannot exceed maximum level of ${this.MAX_LEVEL}`);
    }

    if (level <= 1) {
      return 0;
    }

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
    if (!Number.isFinite(totalXP) || totalXP < 0) {
      throw new Error('Total XP must be a non-negative number');
    }

    let level = 1;
    let xpRequired = 0;

    while (xpRequired <= totalXP && level < this.MAX_LEVEL) {
      level++;
      xpRequired += Math.floor(this.XP_PER_LEVEL * Math.pow(this.XP_MULTIPLIER, level - 2));
    }

    return Math.min(level - 1, this.MAX_LEVEL);
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
      // Validar entrada
      if (!userId || typeof userId !== 'string') {
        throw new Error('User ID is required and must be a string');
      }

      if (!activityType || typeof activityType !== 'string') {
        throw new Error('Activity type is required and must be a string');
      }

      if (multiplier < 0 || multiplier > 10) {
        throw new Error('Multiplier must be between 0 and 10');
      }

      if (timeSpent !== undefined && (timeSpent < 0 || timeSpent > 24)) {
        throw new Error('Time spent must be between 0 and 24 hours');
      }

      // Buscar usuário atual com transação
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          xp: true,
          totalXp: true,
          level: true,
          prestigeLevel: true,
        },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Rate limiting removido - campo lastXpGain não existe no modelo User
      const now = new Date();

      // Calcular XP base
      const activityKey = activityType.toUpperCase();
      const baseActivityXP = this.ACTIVITY_XP[activityKey];

      if (baseActivityXP === undefined) {
        this.logger.warn(`Unknown activity type: ${activityType}`);
        return {
          userId,
          baseXP: 0,
          bonusXP: 0,
          totalXP: 0,
          newLevel: user.level,
          oldLevel: user.level,
          leveledUp: false,
        };
      }

      let baseXP = Math.floor(baseActivityXP * multiplier);

      // Aplicar bônus de prestígio
      if (user.prestigeLevel && user.prestigeLevel > 0) {
        const prestigeBonus = await this.calculatePrestigeBonus(userId, baseXP);
        baseXP += prestigeBonus;
      }

      // Calcular bônus por tempo
      let bonusXP = 0;
      if (timeSpent && timeSpent > 0) {
        if (timeSpent >= 4) {
          bonusXP = this.TIME_BONUS_XP['4h+'] || 0;
        } else if (timeSpent >= 3) {
          bonusXP = this.TIME_BONUS_XP['3h'] || 0;
        } else if (timeSpent >= 2) {
          bonusXP = this.TIME_BONUS_XP['2h'] || 0;
        } else if (timeSpent >= 1) {
          bonusXP = this.TIME_BONUS_XP['1h'] || 0;
        } else if (timeSpent >= 0.5) {
          bonusXP = this.TIME_BONUS_XP['30m'] || 0;
        }
      }

      const totalXPGain = baseXP + bonusXP;
      const newTotalXP = user.totalXp + totalXPGain;
      const newLevel = this.calculateLevelFromXP(newTotalXP);
      const leveledUp = newLevel > user.level;

      // Usar transação para garantir consistência
      const updatedUser = await this.prisma.$transaction(async tx => {
        return await tx.user.update({
          where: { id: userId },
          data: {
            xp: user.xp + totalXPGain,
            totalXp: newTotalXP,
            level: newLevel,
            updatedAt: now,
          },
        });
      });

      // Limpar cache do usuário
      const cacheKeys = [
        `user:${userId}`,
        `user:${userId}:xp`,
        `user:${userId}:level`,
        `user:${userId}:xp_info`,
        'xp_leaderboard:*',
      ];

      for (const key of cacheKeys) {
        if (key.includes('*')) {
          await this.cache.clearPattern(key);
        } else {
          await this.cache.del(key);
        }
      }

      const result: XPGainResult = {
        userId,
        baseXP,
        bonusXP,
        totalXP: totalXPGain,
        newLevel,
        oldLevel: user.level,
        leveledUp,
      };

      // Log da atividade
      this.logger.info(`💫 XP gained for user ${userId}:`, {
        userId,
        metadata: {
          activity: activityType,
          baseXP,
          bonusXP,
          totalGain: totalXPGain,
          newLevel,
          leveledUp,
          prestigeLevel: user.prestigeLevel || 0,
        },
      });

      // Se subiu de nível, processar recompensas
      if (leveledUp) {
        await this.processLevelUpRewards(userId, user.level, newLevel);
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to add XP:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { activityType, timeSpent, multiplier },
      });
      throw error;
    }
  }

  /**
   * Processa recompensas por subir de nível
   */
  private async processLevelUpRewards(
    userId: string,
    oldLevel: number,
    newLevel: number
  ): Promise<void> {
    try {
      if (!userId || oldLevel >= newLevel) {
        return;
      }

      const levelsGained = newLevel - oldLevel;

      // Recompensas escalonadas por nível
      let totalCoinsReward = 0;
      for (let level = oldLevel + 1; level <= newLevel; level++) {
        if (level <= 10) {
          totalCoinsReward += 25; // Níveis iniciais: 25 coins
        } else if (level <= 25) {
          totalCoinsReward += 50; // Níveis médios: 50 coins
        } else if (level <= 50) {
          totalCoinsReward += 75; // Níveis altos: 75 coins
        } else {
          totalCoinsReward += 100; // Níveis máximos: 100 coins
        }
      }

      // Usar transação para garantir consistência
      await this.prisma.$transaction(async tx => {
        // Atualizar coins do usuário
        await tx.user.update({
          where: { id: userId },
          data: {
            coins: {
              increment: totalCoinsReward,
            },
          },
        });

        // Registrar transação
        await tx.transaction.create({
          data: {
            userId,
            type: 'earn',
            amount: totalCoinsReward,
            balance: 0, // Será atualizado por trigger ou outro processo
            reason: `Level up reward (${oldLevel} → ${newLevel})`,
            metadata: JSON.stringify({
              oldLevel,
              newLevel,
              levelsGained,
              coinsPerLevel: Math.floor(totalCoinsReward / levelsGained),
            }),
          },
        });
      });

      // Verificar se deve ganhar badges por nível
      await this.checkLevelBadges(userId, newLevel);

      this.logger.info(`🎉 Level up rewards processed for user ${userId}:`, {
        userId,
        metadata: { oldLevel, newLevel, levelsGained, totalCoinsReward },
      });
    } catch (error) {
      this.logger.error('Failed to process level up rewards:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { oldLevel, newLevel },
      });
      // Não relançar o erro para não quebrar o fluxo principal de XP
    }
  }

  /**
   * Verifica e concede badges baseadas no nível
   */
  private async checkLevelBadges(userId: string, level: number): Promise<void> {
    try {
      if (!userId || !Number.isInteger(level) || level < 1) {
        return;
      }

      const levelBadges = [
        { level: 5, badge: 'novato', name: 'Novato' },
        { level: 15, badge: 'experiente', name: 'Experiente' },
        { level: 30, badge: 'veterano', name: 'Veterano' },
        { level: 50, badge: 'elite', name: 'Elite' },
        { level: 75, badge: 'lenda', name: 'Lenda' },
        { level: 100, badge: 'imortal', name: 'Imortal' },
      ];

      // Verificar quais badges o usuário deve ter baseado no nível atual
      const eligibleBadges = levelBadges.filter(b => level >= b.level);

      if (eligibleBadges.length === 0) {
        return;
      }

      // Verificar badges já concedidos
      const existingBadges = await this.prisma.userBadge.findMany({
        where: {
          userId,
          badge: {
            name: {
              in: eligibleBadges.map(b => b.name),
            },
          },
        },
        include: {
          badge: true,
        },
      });

      const existingBadgeNames = existingBadges.map(ub => ub.badge.name);
      const newBadges = eligibleBadges.filter(b => !existingBadgeNames.includes(b.name));

      // Conceder novos badges
      for (const badgeInfo of newBadges) {
        try {
          // Buscar ou criar o badge
          const badge = await this.prisma.badge.upsert({
            where: { name: badgeInfo.name },
            update: {},
            create: {
              name: badgeInfo.name,
              description: `Alcançado ao atingir o nível ${badgeInfo.level}`,
              icon: '🏆',
              category: 'level',
              rarity: this.getBadgeRarity(badgeInfo.level),
            },
          });

          // Conceder badge ao usuário
          await this.prisma.userBadge.create({
            data: {
              userId,
              badgeId: badge.id,
              earnedAt: new Date(),
            },
          });

          this.logger.info(
            `🏆 Badge '${badgeInfo.name}' awarded to user ${userId} for reaching level ${level}`
          );
        } catch (badgeError) {
          this.logger.error(
            `Failed to award badge '${badgeInfo.badge}' to user ${userId}:`,
            badgeError
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to check level badges:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { level },
      });
    }
  }

  /**
   * Determina a raridade do badge baseado no nível
   */
  private getBadgeRarity(level: number): string {
    if (level >= 100) {
      return 'legendary';
    }
    if (level >= 75) {
      return 'epic';
    }
    if (level >= 50) {
      return 'rare';
    }
    if (level >= 30) {
      return 'uncommon';
    }
    return 'common';
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
    isMaxLevel: boolean;
    prestigeLevel: number;
    rankingPosition: number;
    accountAge: number;
  } | null> {
    try {
      if (!userId || typeof userId !== 'string') {
        throw new Error('User ID is required and must be a string');
      }

      const cacheKey = `user:${userId}:xp_info`;
      const cached = await this.cache.get(cacheKey);

      if (cached && typeof cached === 'string') {
        try {
          return JSON.parse(cached);
        } catch (parseError) {
          this.logger.warn(`Failed to parse cached XP info for user ${userId}:`, parseError);
          await this.cache.del(cacheKey);
        }
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          level: true,
          xp: true,
          totalXp: true,
          prestigeLevel: true,
          createdAt: true,
        },
      });

      if (!user) {
        return null;
      }

      const currentLevel = user.level;
      const isMaxLevel = currentLevel >= this.MAX_LEVEL;
      const nextLevel = isMaxLevel ? this.MAX_LEVEL : currentLevel + 1;

      const xpForCurrentLevel = this.calculateXPForLevel(currentLevel);
      const xpForNextLevel = isMaxLevel
        ? this.calculateXPForLevel(this.MAX_LEVEL)
        : this.calculateXPForLevel(nextLevel);

      const xpProgress = user.totalXp - xpForCurrentLevel;
      const xpNeededForNext = isMaxLevel ? 0 : xpForNextLevel - xpForCurrentLevel;

      let xpProgressPercent = 0;
      if (!isMaxLevel && xpNeededForNext > 0) {
        xpProgressPercent = Math.round((xpProgress / xpNeededForNext) * 100);
      } else if (isMaxLevel) {
        xpProgressPercent = 100;
      }

      // Calcular ranking aproximado
      const rankingPosition = await this.getUserRankingPosition(userId);

      const result = {
        level: currentLevel,
        xp: user.xp || 0,
        totalXp: user.totalXp || 0,
        xpForCurrentLevel,
        xpForNextLevel,
        xpProgress: Math.max(0, xpProgress),
        xpProgressPercent: Math.max(0, Math.min(100, xpProgressPercent)),
        isMaxLevel,
        prestigeLevel: user.prestigeLevel || 0,
        rankingPosition,
        accountAge: Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)), // dias
      };

      // Cache por 5 minutos
      await this.cache.set(cacheKey, result, 300);
      return result;
    } catch (error) {
      this.logger.error('Failed to get user XP info:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
      });
      return null;
    }
  }

  /**
   * Obtém a posição do usuário no ranking de XP
   */
  private async getUserRankingPosition(userId: string): Promise<number> {
    try {
      const result = await this.prisma.user.findMany({
        where: {
          totalXp: {
            gt: 0,
          },
        },
        select: {
          id: true,
          totalXp: true,
        },
        orderBy: {
          totalXp: 'desc',
        },
      });

      const position = result.findIndex(user => user.id === userId) + 1;
      return position || 0;
    } catch (error) {
      this.logger.error('Failed to get user ranking position:', error);
      return 0;
    }
  }

  /**
   * Obtém ranking de XP
   */
  public async getXPLeaderboard(
    guildId?: string,
    limit: number = 10
  ): Promise<
    Array<{
      userId: string;
      username: string;
      level: number;
      totalXp: number;
      rank: number;
      prestigeLevel: number;
      progressPercent: number;
      isMaxLevel: boolean;
    }>
  > {
    try {
      // Validar parâmetros
      if (limit < 1 || limit > 100) {
        throw new Error('Limit must be between 1 and 100');
      }

      if (guildId && typeof guildId !== 'string') {
        throw new Error('Guild ID must be a string');
      }

      const cacheKey = `xp_leaderboard:${guildId || 'global'}:${limit}`;
      const cached = await this.cache.get(cacheKey);

      if (cached && typeof cached === 'string') {
        try {
          return JSON.parse(cached);
        } catch (parseError) {
          this.logger.warn('Failed to parse cached leaderboard:', parseError);
          await this.cache.del(cacheKey);
        }
      }

      // Query base
      const whereClause: any = {
        totalXp: {
          gt: 0,
        },
      };

      if (guildId) {
        whereClause.guilds = {
          some: {
            guildId,
            isActive: true,
          },
        };
      }

      const users = await this.prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          username: true,
          level: true,
          totalXp: true,
          prestigeLevel: true,
          updatedAt: true,
        },
        orderBy: [
          {
            totalXp: 'desc',
          },
          {
            level: 'desc',
          },
          {
            updatedAt: 'asc', // Em caso de empate, quem chegou primeiro
          },
        ],
        take: limit,
      });

      if (users.length === 0) {
        return [];
      }

      const leaderboard = users.map((user, index) => {
        const currentLevelXP = this.calculateXPForLevel(user.level);
        const nextLevelXP =
          user.level < this.MAX_LEVEL ? this.calculateXPForLevel(user.level + 1) : currentLevelXP;
        const progressPercent =
          user.level >= this.MAX_LEVEL
            ? 100
            : Math.floor(((user.totalXp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100);

        return {
          userId: user.id,
          username: user.username || 'Unknown User',
          level: user.level,
          totalXp: user.totalXp,
          rank: index + 1,
          prestigeLevel: user.prestigeLevel || 0,
          progressPercent: Math.max(0, Math.min(100, progressPercent)),
          isMaxLevel: user.level >= this.MAX_LEVEL,
        };
      });

      // Cache por 10 minutos
      await this.cache.set(cacheKey, leaderboard, 600);

      this.logger.info('📊 XP Leaderboard generated:', {
        guildId: guildId || 'global',
        metadata: { userCount: leaderboard.length, limit },
      });

      return leaderboard;
    } catch (error) {
      this.logger.error('Failed to get XP leaderboard:', {
        error: error instanceof Error ? error : new Error(String(error)),
        guildId,
        metadata: { limit },
      });
      return [];
    }
  }

  /**
   * Adiciona XP por check-in diário
   */
  public async addCheckInXP(userId: string): Promise<XPGainResult> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Verificar se já fez check-in hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingCheckIn = await this.prisma.auditLog.findFirst({
        where: {
          userId,
          action: 'DAILY_CHECKIN',
          createdAt: {
            gte: today,
          },
        },
      });

      if (existingCheckIn) {
        throw new Error('Daily check-in already completed today');
      }

      const result = await this.addXP(userId, 'CHECK_IN');

      // Registrar atividade
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'DAILY_CHECKIN',
          target: 'XP_SYSTEM',
          metadata: JSON.stringify({ xpGained: result.totalXP }),
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add check-in XP:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
      });
      throw error;
    }
  }

  /**
   * Adiciona XP por completar desafio diário
   */
  public async addDailyChallengeXP(
    userId: string,
    difficulty: 'easy' | 'medium' | 'hard' | 'extreme' | 'legendary' = 'medium'
  ): Promise<XPGainResult> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      if (!['easy', 'medium', 'hard', 'extreme', 'legendary'].includes(difficulty)) {
        throw new Error('Invalid difficulty level');
      }

      const multiplier = this.CHALLENGE_DIFFICULTY_MULTIPLIER[difficulty] || 1;
      const result = await this.addXP(userId, 'DAILY_CHALLENGE', undefined, multiplier);

      // Registrar atividade
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'DAILY_CHALLENGE',
          target: 'XP_SYSTEM',
          metadata: JSON.stringify({
            difficulty,
            multiplier,
            xpGained: result.totalXP,
          }),
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add daily challenge XP:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { difficulty },
      });
      throw error;
    }
  }

  /**
   * Adiciona XP por conquista/achievement
   */
  public async addAchievementXP(
    userId: string,
    achievementPoints: number = 100
  ): Promise<XPGainResult> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      if (!Number.isFinite(achievementPoints) || achievementPoints <= 0) {
        throw new Error('Achievement points must be a positive number');
      }

      const multiplier = achievementPoints / 100; // Normalizar baseado em 100 pontos
      const result = await this.addXP(userId, 'ACHIEVEMENT', undefined, multiplier);

      // Registrar atividade
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'ACHIEVEMENT',
          target: 'XP_SYSTEM',
          metadata: JSON.stringify({
            achievementPoints,
            multiplier,
            xpGained: result.totalXP,
          }),
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add achievement XP:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { achievementPoints },
      });
      throw error;
    }
  }

  /**
   * Adiciona XP com multiplicador de dificuldade de desafio
   */
  public async addChallengeXP(
    userId: string,
    difficulty: string,
    baseXP: number = 60
  ): Promise<XPGainResult> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      if (!difficulty || typeof difficulty !== 'string') {
        throw new Error('Difficulty is required and must be a string');
      }

      if (!Number.isFinite(baseXP) || baseXP <= 0) {
        throw new Error('Base XP must be a positive number');
      }

      const multiplier = this.CHALLENGE_DIFFICULTY_MULTIPLIER[difficulty] || 1.0;
      const finalXP = Math.floor(baseXP * multiplier);

      const challengeBaseXP = this.ACTIVITY_XP.DAILY_CHALLENGE || 1;
      const result = await this.addXP(
        userId,
        'DAILY_CHALLENGE',
        undefined,
        finalXP / challengeBaseXP
      );

      // Registrar atividade
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'CHALLENGE',
          target: 'XP_SYSTEM',
          metadata: JSON.stringify({
            difficulty,
            baseXP,
            multiplier,
            finalXP,
            xpGained: result.totalXP,
          }),
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add challenge XP:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { difficulty, baseXP },
      });
      throw error;
    }
  }

  /**
   * Adiciona XP de maestria de armas
   */
  public async addWeaponMasteryXP(userId: string, masteryLevel: number = 1): Promise<XPGainResult> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      if (!Number.isInteger(masteryLevel) || masteryLevel < 1 || masteryLevel > 100) {
        throw new Error('Mastery level must be an integer between 1 and 100');
      }

      const multiplier = 1 + masteryLevel * 0.1; // 10% por nível de maestria
      const result = await this.addXP(userId, 'WEAPON_MASTERY', undefined, multiplier);

      // Registrar atividade
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'WEAPON_MASTERY',
          target: 'XP_SYSTEM',
          metadata: JSON.stringify({
            masteryLevel,
            multiplier,
            xpGained: result.totalXP,
          }),
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add weapon mastery XP:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { masteryLevel },
      });
      throw error;
    }
  }

  /**
   * Adiciona XP de vitória em torneio
   */
  public async addTournamentWinXP(
    userId: string,
    tournamentTier: 'local' | 'regional' | 'national' | 'international' = 'local'
  ): Promise<XPGainResult> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const validTiers = ['local', 'regional', 'national', 'international'];
      if (!validTiers.includes(tournamentTier)) {
        throw new Error('Invalid tournament tier');
      }

      const tierMultipliers = {
        local: 1.0,
        regional: 1.5,
        national: 2.0,
        international: 3.0,
      };

      const multiplier = tierMultipliers[tournamentTier];
      const result = await this.addXP(userId, 'TOURNAMENT_WIN', undefined, multiplier);

      // Registrar atividade
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'TOURNAMENT_WIN',
          target: 'XP_SYSTEM',
          metadata: JSON.stringify({
            tournamentTier,
            multiplier,
            xpGained: result.totalXP,
          }),
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add tournament win XP:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { tournamentTier },
      });
      throw error;
    }
  }

  /**
   * Adiciona XP de bônus por sequência (streak)
   */
  public async addStreakBonusXP(userId: string, streakCount: number): Promise<XPGainResult> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      if (!Number.isInteger(streakCount) || streakCount < 1) {
        throw new Error('Streak count must be a positive integer');
      }

      if (streakCount > 100) {
        throw new Error('Streak count cannot exceed 100');
      }

      const multiplier = Math.min(streakCount * 0.2, 3.0); // Máximo 3x multiplier
      const result = await this.addXP(userId, 'STREAK_BONUS', undefined, multiplier);

      // Registrar atividade no audit log
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'STREAK_BONUS',
          target: 'XP_SYSTEM',
          metadata: JSON.stringify({
            streakCount,
            multiplier,
            xpGained: result.totalXP,
          }),
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add streak bonus XP:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { streakCount },
      });
      throw error;
    }
  }

  /**
   * Sistema de prestígio - permite resetar nível em troca de bônus permanente
   */
  public async prestigeUser(userId: string): Promise<{
    success: boolean;
    newPrestigeLevel: number;
    bonusXPPercent: number;
    message: string;
  }> {
    try {
      if (!userId || typeof userId !== 'string') {
        throw new Error('User ID is required and must be a string');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          level: true,
          prestigeLevel: true,
          totalXp: true,
          xp: true,
        },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Verificar se pode fazer prestígio (nível máximo)
      if (user.level < this.MAX_LEVEL) {
        return {
          success: false,
          newPrestigeLevel: user.prestigeLevel || 0,
          bonusXPPercent: this.calculatePrestigeBonusPercent(user.prestigeLevel || 0),
          message: `Você precisa atingir o nível ${this.MAX_LEVEL} para fazer prestígio. Nível atual: ${user.level}`,
        };
      }

      const currentPrestigeLevel = user.prestigeLevel || 0;
      const maxPrestigeLevel = 10; // Limite de prestígio

      if (currentPrestigeLevel >= maxPrestigeLevel) {
        return {
          success: false,
          newPrestigeLevel: currentPrestigeLevel,
          bonusXPPercent: this.calculatePrestigeBonusPercent(currentPrestigeLevel),
          message: `Você já atingiu o nível máximo de prestígio (${maxPrestigeLevel})`,
        };
      }

      const newPrestigeLevel = currentPrestigeLevel + 1;
      const bonusXPPercent = this.calculatePrestigeBonusPercent(newPrestigeLevel);

      // Usar transação para garantir consistência
      await this.prisma.$transaction(async tx => {
        // Resetar nível mas manter XP total para histórico
        await tx.user.update({
          where: { id: userId },
          data: {
            level: 1,
            xp: 0,
            prestigeLevel: newPrestigeLevel,
            updatedAt: new Date(),
          },
        });

        // Registrar evento de prestígio
        await tx.auditLog.create({
          data: {
            userId,
            action: 'PRESTIGE',
            target: 'XP_SYSTEM',
            metadata: JSON.stringify({
              oldLevel: user.level,
              oldPrestigeLevel: currentPrestigeLevel,
              newPrestigeLevel,
              bonusXPPercent,
              totalXpKept: user.totalXp,
            }),
          },
        });
      });

      // Limpar cache relacionado
      const cacheKeys = [
        `user:${userId}`,
        `user:${userId}:xp`,
        `user:${userId}:level`,
        `user:${userId}:xp_info`,
        'xp_leaderboard:*',
      ];

      for (const key of cacheKeys) {
        if (key.includes('*')) {
          await this.cache.clearPattern(key);
        } else {
          await this.cache.del(key);
        }
      }

      this.logger.info(
        `🌟 User ${userId} prestiged to level ${newPrestigeLevel} with ${bonusXPPercent}% XP bonus`
      );

      return {
        success: true,
        newPrestigeLevel,
        bonusXPPercent,
        message: `🎉 Parabéns! Você atingiu o Prestígio ${newPrestigeLevel} e agora ganha ${bonusXPPercent}% de bônus de XP!`,
      };
    } catch (error) {
      this.logger.error('Failed to prestige user:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
      });
      throw error;
    }
  }

  /**
   * Calcula bônus XP baseado no prestígio
   */
  private async calculatePrestigeBonus(userId: string, baseXP: number): Promise<number> {
    try {
      if (!userId || !Number.isFinite(baseXP) || baseXP <= 0) {
        return 0;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { prestigeLevel: true },
      });

      if (!user || !user.prestigeLevel || user.prestigeLevel <= 0) {
        return 0;
      }

      const bonusPercent = this.calculatePrestigeBonusPercent(user.prestigeLevel);
      const bonus = Math.floor(baseXP * (bonusPercent / 100));

      return Math.max(0, bonus);
    } catch (error) {
      this.logger.error('Failed to calculate prestige bonus:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
        metadata: { baseXP },
      });
      return 0;
    }
  }

  /**
   * Calcula a porcentagem de bônus baseada no nível de prestígio
   */
  private calculatePrestigeBonusPercent(prestigeLevel: number): number {
    if (!Number.isInteger(prestigeLevel) || prestigeLevel <= 0) {
      return 0;
    }

    // Bônus escalonado: 5% para o primeiro, depois aumenta gradualmente
    if (prestigeLevel === 1) {
      return 5;
    }
    if (prestigeLevel === 2) {
      return 12;
    }
    if (prestigeLevel === 3) {
      return 20;
    }
    if (prestigeLevel === 4) {
      return 30;
    }
    if (prestigeLevel === 5) {
      return 42;
    }
    if (prestigeLevel === 6) {
      return 56;
    }
    if (prestigeLevel === 7) {
      return 72;
    }
    if (prestigeLevel === 8) {
      return 90;
    }
    if (prestigeLevel === 9) {
      return 110;
    }
    if (prestigeLevel >= 10) {
      return 135;
    } // Máximo

    return 0;
  }

  /**
   * Obtém informações de prestígio do usuário
   */
  public async getUserPrestigeInfo(userId: string): Promise<{
    prestigeLevel: number;
    bonusXPPercent: number;
    canPrestige: boolean;
    nextPrestigeBonusPercent: number;
    maxPrestigeLevel: number;
    isMaxPrestige: boolean;
  } | null> {
    try {
      if (!userId || typeof userId !== 'string') {
        throw new Error('User ID is required and must be a string');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          level: true,
          prestigeLevel: true,
        },
      });

      if (!user) {
        return null;
      }

      const prestigeLevel = user.prestigeLevel || 0;
      const maxPrestigeLevel = 10;
      const bonusXPPercent = this.calculatePrestigeBonusPercent(prestigeLevel);
      const canPrestige = user.level >= this.MAX_LEVEL && prestigeLevel < maxPrestigeLevel;
      const nextPrestigeBonusPercent =
        prestigeLevel < maxPrestigeLevel
          ? this.calculatePrestigeBonusPercent(prestigeLevel + 1)
          : bonusXPPercent;
      const isMaxPrestige = prestigeLevel >= maxPrestigeLevel;

      return {
        prestigeLevel,
        bonusXPPercent,
        canPrestige,
        nextPrestigeBonusPercent,
        maxPrestigeLevel,
        isMaxPrestige,
      };
    } catch (error) {
      this.logger.error('Failed to get user prestige info:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
      });
      return null;
    }
  }

  /**
   * Limpa cache relacionado ao XP
   */
  public async clearXPCache(userId?: string): Promise<void> {
    try {
      if (userId) {
        // Limpar cache específico do usuário
        const userCacheKeys = [
          `user:${userId}`,
          `user:${userId}:xp`,
          `user:${userId}:level`,
          `user:${userId}:xp_info`,
        ];

        for (const key of userCacheKeys) {
          await this.cache.del(key);
        }
      } else {
        // Limpar todo o cache de XP
        await this.cache.clearPattern('user:*:xp*');
        await this.cache.clearPattern('xp_leaderboard:*');
      }

      this.logger.info(`🧹 XP cache cleared${userId ? ` for user ${userId}` : ' globally'}`);
    } catch (error) {
      this.logger.error('Failed to clear XP cache:', {
        error: error instanceof Error ? error : new Error(String(error)),
        userId,
      });
    }
  }

  /**
   * Obtém estatísticas do sistema de XP
   */
  public async getXPSystemStats(): Promise<{
    totalUsers: number;
    averageLevel: number;
    maxLevel: number;
    totalPrestigeUsers: number;
    averagePrestigeLevel: number;
    topLevel: number;
    topPrestige: number;
  }> {
    try {
      const stats = await this.prisma.user.aggregate({
        _count: {
          id: true,
        },
        _avg: {
          level: true,
          prestigeLevel: true,
        },
        _max: {
          level: true,
          prestigeLevel: true,
        },
        where: {
          totalXp: {
            gt: 0,
          },
        },
      });

      const prestigeUsers = await this.prisma.user.count({
        where: {
          prestigeLevel: {
            gt: 0,
          },
        },
      });

      return {
        totalUsers: stats._count.id || 0,
        averageLevel: Math.round(stats._avg.level || 1),
        maxLevel: this.MAX_LEVEL,
        totalPrestigeUsers: prestigeUsers,
        averagePrestigeLevel: Math.round(stats._avg.prestigeLevel || 0),
        topLevel: stats._max.level || 1,
        topPrestige: stats._max.prestigeLevel || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get XP system stats:', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return {
        totalUsers: 0,
        averageLevel: 1,
        maxLevel: this.MAX_LEVEL,
        totalPrestigeUsers: 0,
        averagePrestigeLevel: 0,
        topLevel: 1,
        topPrestige: 0,
      };
    }
  }
}
