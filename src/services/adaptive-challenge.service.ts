import { Client } from 'discord.js';
import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { CacheService } from './cache.service';
import { ChallengeService, ChallengeDefinition } from './challenge.service';
import * as cron from 'node-cron';

export interface PlayerStats {
  userId: string;
  averageKills: number;
  averageDamage: number;
  averageSurvivalTime: number;
  winRate: number;
  headShotRate: number;
  gamesPlayed: number;
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'master';
  preferredGameModes: string[];
  activityLevel: 'low' | 'medium' | 'high';
  lastActive: Date;
}

export interface AdaptiveChallenge extends ChallengeDefinition {
  adaptedFor: string; // userId
  originalDifficulty: string;
  adaptationReason: string;
  personalizedTarget: number;
  motivationalMessage: string;
}

export interface ChallengeTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  baseTarget: number;
  scalingFactor: number;
  minTarget: number;
  maxTarget: number;
  skillRequirement: string[];
  motivationalMessages: string[];
  adaptationRules: {
    beginner: { multiplier: number; bonus: string };
    intermediate: { multiplier: number; bonus: string };
    advanced: { multiplier: number; bonus: string };
    expert: { multiplier: number; bonus: string };
    master: { multiplier: number; bonus: string };
  };
}

export class AdaptiveChallengeService {
  private client: Client;
  private logger: Logger;
  private database: DatabaseService;
  private cache: CacheService;
  private challengeService: ChallengeService;
  private adaptiveTemplates: Map<string, ChallengeTemplate> = new Map();
  private playerStatsCache: Map<string, PlayerStats> = new Map();
  private adaptationJob?: cron.ScheduledTask;

  constructor(client: Client) {
    this.client = client;
    this.logger = (client as any).logger;
    this.database = (client as any).database;
    this.cache = (client as any).cache;
    this.challengeService = (client as any).services?.challenge;

    this.initializeAdaptiveTemplates();
    this.scheduleAdaptiveGeneration();
  }

  /**
   * Initialize adaptive challenge templates
   */
  private initializeAdaptiveTemplates(): void {
    const templates: ChallengeTemplate[] = [
      {
        id: 'adaptive_kills',
        name: 'Caçada Personalizada',
        description: 'Elimine {target} inimigos baseado no seu desempenho',
        type: 'kills',
        baseTarget: 8,
        scalingFactor: 1.2,
        minTarget: 3,
        maxTarget: 30,
        skillRequirement: ['beginner', 'intermediate', 'advanced', 'expert', 'master'],
        motivationalMessages: [
          'Você consegue superar seu recorde anterior!',
          'Mostre suas habilidades de combate!',
          'Hora de dominar o campo de batalha!',
          'Seus inimigos não sabem o que os espera!',
          'Lenda em ação - elimine com precisão!',
        ],
        adaptationRules: {
          beginner: { multiplier: 0.6, bonus: '+50% XP para iniciantes' },
          intermediate: { multiplier: 0.8, bonus: '+25% XP extra' },
          advanced: { multiplier: 1.0, bonus: 'Recompensa padrão' },
          expert: { multiplier: 1.3, bonus: '+30% coins extras' },
          master: { multiplier: 1.6, bonus: 'Badge exclusiva + 50% rewards' },
        },
      },
      {
        id: 'adaptive_damage',
        name: 'Destruição Calculada',
        description: 'Cause {target} de dano baseado na sua média',
        type: 'damage',
        baseTarget: 2000,
        scalingFactor: 1.15,
        minTarget: 800,
        maxTarget: 8000,
        skillRequirement: ['intermediate', 'advanced', 'expert', 'master'],
        motivationalMessages: [
          'Maximize seu potencial de dano!',
          'Cada tiro deve contar!',
          'Destruição total é o objetivo!',
          'Mostre o poder do seu arsenal!',
          'Devastação absoluta te aguarda!',
        ],
        adaptationRules: {
          beginner: { multiplier: 0.7, bonus: '+40% XP para aprendizado' },
          intermediate: { multiplier: 0.9, bonus: '+20% XP extra' },
          advanced: { multiplier: 1.1, bonus: '+10% coins extras' },
          expert: { multiplier: 1.4, bonus: '+40% rewards totais' },
          master: { multiplier: 1.8, bonus: 'Badge lendária + 60% rewards' },
        },
      },
      {
        id: 'adaptive_survival',
        name: 'Sobrevivência Inteligente',
        description: 'Sobreviva por {target} segundos baseado no seu histórico',
        type: 'survival_time',
        baseTarget: 900, // 15 minutes
        scalingFactor: 1.1,
        minTarget: 300, // 5 minutes
        maxTarget: 2400, // 40 minutes
        skillRequirement: ['beginner', 'intermediate', 'advanced', 'expert', 'master'],
        motivationalMessages: [
          'A paciência é uma virtude no PUBG!',
          'Sobrevivência é arte, domine-a!',
          'Cada segundo conta na zona!',
          'Mostre sua resistência!',
          'Lenda da sobrevivência em ação!',
        ],
        adaptationRules: {
          beginner: { multiplier: 0.5, bonus: '+60% XP para persistência' },
          intermediate: { multiplier: 0.7, bonus: '+30% XP extra' },
          advanced: { multiplier: 1.0, bonus: 'Recompensa equilibrada' },
          expert: { multiplier: 1.2, bonus: '+25% coins extras' },
          master: { multiplier: 1.5, bonus: 'Badge de sobrevivência + 45% rewards' },
        },
      },
      {
        id: 'adaptive_headshots',
        name: 'Precisão Personalizada',
        description: 'Consiga {target} headshots com base na sua precisão',
        type: 'headshots',
        baseTarget: 5,
        scalingFactor: 1.3,
        minTarget: 2,
        maxTarget: 20,
        skillRequirement: ['intermediate', 'advanced', 'expert', 'master'],
        motivationalMessages: [
          'Mire na cabeça, acerte o coração!',
          'Precisão é sua marca registrada!',
          'Cada headshot é uma obra de arte!',
          'Sniper nato em ação!',
          'Lenda da precisão absoluta!',
        ],
        adaptationRules: {
          beginner: { multiplier: 0.4, bonus: '+70% XP para treino de mira' },
          intermediate: { multiplier: 0.7, bonus: '+35% XP extra' },
          advanced: { multiplier: 1.0, bonus: '+15% coins extras' },
          expert: { multiplier: 1.4, bonus: '+45% rewards totais' },
          master: { multiplier: 1.9, bonus: 'Badge sniper elite + 70% rewards' },
        },
      },
      {
        id: 'adaptive_wins',
        name: 'Vitória Adaptativa',
        description: 'Conquiste {target} vitórias baseado no seu win rate',
        type: 'wins',
        baseTarget: 2,
        scalingFactor: 1.0,
        minTarget: 1,
        maxTarget: 8,
        skillRequirement: ['intermediate', 'advanced', 'expert', 'master'],
        motivationalMessages: [
          'A vitória está ao seu alcance!',
          'Chicken Dinner te espera!',
          'Domine o campo de batalha!',
          'Campeão nato em ação!',
          'Lenda das vitórias consecutivas!',
        ],
        adaptationRules: {
          beginner: { multiplier: 0.5, bonus: '+100% XP para primeira vitória' },
          intermediate: { multiplier: 0.8, bonus: '+50% XP extra' },
          advanced: { multiplier: 1.0, bonus: '+25% coins extras' },
          expert: { multiplier: 1.2, bonus: '+50% rewards totais' },
          master: { multiplier: 1.5, bonus: 'Badge campeão + 75% rewards' },
        },
      },
      {
        id: 'adaptive_games',
        name: 'Consistência Adaptativa',
        description: 'Jogue {target} partidas mantendo seu nível',
        type: 'games',
        baseTarget: 5,
        scalingFactor: 1.0,
        minTarget: 2,
        maxTarget: 15,
        skillRequirement: ['beginner', 'intermediate', 'advanced', 'expert', 'master'],
        motivationalMessages: [
          'Consistência é a chave do sucesso!',
          'Cada partida é uma oportunidade!',
          'Mantenha o ritmo de jogo!',
          'Dedicação será recompensada!',
          'Lenda da consistência!',
        ],
        adaptationRules: {
          beginner: { multiplier: 0.6, bonus: '+40% XP para dedicação' },
          intermediate: { multiplier: 0.8, bonus: '+20% XP extra' },
          advanced: { multiplier: 1.0, bonus: 'Recompensa padrão' },
          expert: { multiplier: 1.1, bonus: '+15% coins extras' },
          master: { multiplier: 1.3, bonus: 'Badge dedicação + 30% rewards' },
        },
      },
    ];

    templates.forEach(template => {
      this.adaptiveTemplates.set(template.id, template);
    });

    this.logger.info(`Initialized ${templates.length} adaptive challenge templates`);
  }

  /**
   * Schedule adaptive challenge generation
   */
  private scheduleAdaptiveGeneration(): void {
    // Gerar desafios adaptativos às 6:00 AM todos os dias
    this.adaptationJob = cron.schedule('0 6 * * *', async () => {
      this.logger.info('Starting adaptive challenge generation...');
      await this.generateAdaptiveChallenges();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo',
    });

    this.logger.info('Adaptive challenge generation scheduled for 6:00 AM daily');
  }

  /**
   * Generate adaptive challenges for all active users
   */
  public async generateAdaptiveChallenges(): Promise<void> {
    try {
      const activeUsers = await this.getActiveUsers();
      this.logger.info(`Generating adaptive challenges for ${activeUsers.length} active users`);

      for (const userId of activeUsers) {
        await this.generateUserAdaptiveChallenges(userId);
        // Pequeno delay para evitar sobrecarga
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.logger.info('Adaptive challenge generation completed');
    } catch (error) {
      this.logger.error('Failed to generate adaptive challenges:', error);
    }
  }

  /**
   * Generate adaptive challenges for a specific user
   */
  public async generateUserAdaptiveChallenges(userId: string): Promise<AdaptiveChallenge[]> {
    try {
      const playerStats = await this.getPlayerStats(userId);
      const adaptiveChallenges: AdaptiveChallenge[] = [];

      // Selecionar 2-4 desafios baseados no perfil do jogador
      const challengeCount = this.calculateChallengeCount(playerStats);
      const selectedTemplates = this.selectTemplatesForPlayer(playerStats, challengeCount);

      for (const template of selectedTemplates) {
        const adaptiveChallenge = await this.createAdaptiveChallenge(userId, template, playerStats);
        adaptiveChallenges.push(adaptiveChallenge);
      }

      // Salvar desafios no banco de dados
      await this.saveAdaptiveChallenges(userId, adaptiveChallenges);

      this.logger.info(`Generated ${adaptiveChallenges.length} adaptive challenges for user ${userId}`);
      return adaptiveChallenges;
    } catch (error) {
      this.logger.error(`Failed to generate adaptive challenges for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get player statistics
   */
  private async getPlayerStats(userId: string): Promise<PlayerStats> {
    // Verificar cache primeiro
    if (this.playerStatsCache.has(userId)) {
      const cached = this.playerStatsCache.get(userId)!;
      // Cache válido por 6 horas
      if (Date.now() - cached.lastActive.getTime() < 6 * 60 * 60 * 1000) {
        return cached;
      }
    }

    try {
      // Buscar estatísticas do banco de dados
      const userStats = await this.database.client.userStats.findUnique({
        where: { userId },
      });

      // Buscar estatísticas PUBG separadamente
      const pubgStats = await this.database.client.pUBGStats.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      // Não há tabela GameHistory, usar dados do PUBGStats
      const gameHistory: any[] = [];

      let stats: PlayerStats;

      if (userStats && pubgStats) {
        const totalGames = pubgStats.roundsPlayed || 0;

        stats = {
          userId,
          averageKills: totalGames > 0 ? pubgStats.kills / totalGames : 0,
          averageDamage: totalGames > 0 ? pubgStats.damageDealt / totalGames : 0,
          averageSurvivalTime: 0, // Não disponível no PUBGStats
          winRate: totalGames > 0 ? pubgStats.wins / totalGames : 0,
          headShotRate: pubgStats.kills > 0 ? pubgStats.headshotKills / pubgStats.kills : 0,
          gamesPlayed: totalGames,
          skillLevel: this.calculateSkillLevel(pubgStats),
          preferredGameModes: [pubgStats.gameMode || 'solo'],
          activityLevel: this.calculateActivityLevel([]),
          lastActive: new Date(),
        };
      } else {
        // Usuário novo ou sem estatísticas
        stats = {
          userId,
          averageKills: 0,
          averageDamage: 0,
          averageSurvivalTime: 0,
          winRate: 0,
          headShotRate: 0,
          gamesPlayed: 0,
          skillLevel: 'beginner',
          preferredGameModes: [],
          activityLevel: 'low',
          lastActive: new Date(),
        };
      }

      // Atualizar cache
      this.playerStatsCache.set(userId, stats);
      return stats;
    } catch (error) {
      this.logger.error(`Failed to get player stats for ${userId}:`, error);
      // Retornar estatísticas padrão em caso de erro
      return {
        userId,
        averageKills: 0,
        averageDamage: 0,
        averageSurvivalTime: 0,
        winRate: 0,
        headShotRate: 0,
        gamesPlayed: 0,
        skillLevel: 'beginner',
        preferredGameModes: [],
        activityLevel: 'low',
        lastActive: new Date(),
      };
    }
  }

  /**
   * Calculate skill level based on stats
   */
  private calculateSkillLevel(pubgStats: any): PlayerStats['skillLevel'] {
    const kd = pubgStats.kills / Math.max(pubgStats.deaths, 1);
    const winRate = pubgStats.wins / Math.max(pubgStats.gamesPlayed, 1);
    const avgDamage = pubgStats.totalDamage / Math.max(pubgStats.gamesPlayed, 1);

    const score = (kd * 30) + (winRate * 40) + (avgDamage / 50);

    if (score >= 80) {return 'master';}
    if (score >= 60) {return 'expert';}
    if (score >= 40) {return 'advanced';}
    if (score >= 20) {return 'intermediate';}
    return 'beginner';
  }

  /**
   * Extract preferred game modes
   */
  private extractPreferredModes(games: any[]): string[] {
    const modeCount = new Map<string, number>();
    games.forEach(game => {
      const mode = game.gameMode || 'solo';
      modeCount.set(mode, (modeCount.get(mode) || 0) + 1);
    });

    return Array.from(modeCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([mode]) => mode);
  }

  /**
   * Calculate activity level
   */
  private calculateActivityLevel(games: any[]): PlayerStats['activityLevel'] {
    const recentGames = games.filter(game => {
      const gameDate = new Date(game.createdAt);
      const daysDiff = (Date.now() - gameDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7; // Últimos 7 dias
    });

    if (recentGames.length >= 15) {return 'high';}
    if (recentGames.length >= 5) {return 'medium';}
    return 'low';
  }

  /**
   * Calculate challenge count based on player profile
   */
  private calculateChallengeCount(stats: PlayerStats): number {
    let baseCount = 2;

    // Mais desafios para jogadores mais ativos
    if (stats.activityLevel === 'high') {baseCount += 2;}
    else if (stats.activityLevel === 'medium') {baseCount += 1;}

    // Mais desafios para jogadores mais experientes
    if (stats.skillLevel === 'expert' || stats.skillLevel === 'master') {baseCount += 1;}

    return Math.min(baseCount, 5); // Máximo 5 desafios
  }

  /**
   * Select templates for player
   */
  private selectTemplatesForPlayer(stats: PlayerStats, count: number): ChallengeTemplate[] {
    const availableTemplates = Array.from(this.adaptiveTemplates.values())
      .filter(template => template.skillRequirement.includes(stats.skillLevel));

    // Priorizar tipos de desafio baseados no perfil do jogador
    const prioritizedTemplates = this.prioritizeTemplates(availableTemplates, stats);

    // Selecionar templates únicos
    const selected: ChallengeTemplate[] = [];
    const usedTypes = new Set<string>();

    for (const template of prioritizedTemplates) {
      if (selected.length >= count) {break;}
      if (!usedTypes.has(template.type)) {
        selected.push(template);
        usedTypes.add(template.type);
      }
    }

    // Se não temos templates suficientes, adicionar mais (permitindo duplicação de tipos)
    if (selected.length < count) {
      const remaining = prioritizedTemplates.filter(t => !selected.includes(t));
      selected.push(...remaining.slice(0, count - selected.length));
    }

    return selected;
  }

  /**
   * Prioritize templates based on player stats
   */
  private prioritizeTemplates(templates: ChallengeTemplate[], stats: PlayerStats): ChallengeTemplate[] {
    return templates.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Priorizar baseado nas forças do jogador
      if (a.type === 'kills' && stats.averageKills > 5) {scoreA += 10;}
      if (b.type === 'kills' && stats.averageKills > 5) {scoreB += 10;}

      if (a.type === 'damage' && stats.averageDamage > 1500) {scoreA += 10;}
      if (b.type === 'damage' && stats.averageDamage > 1500) {scoreB += 10;}

      if (a.type === 'wins' && stats.winRate > 0.1) {scoreA += 15;}
      if (b.type === 'wins' && stats.winRate > 0.1) {scoreB += 15;}

      if (a.type === 'headshots' && stats.headShotRate > 0.2) {scoreA += 12;}
      if (b.type === 'headshots' && stats.headShotRate > 0.2) {scoreB += 12;}

      if (a.type === 'survival_time' && stats.averageSurvivalTime > 600) {scoreA += 8;}
      if (b.type === 'survival_time' && stats.averageSurvivalTime > 600) {scoreB += 8;}

      // Adicionar aleatoriedade para variedade
      scoreA += Math.random() * 5;
      scoreB += Math.random() * 5;

      return scoreB - scoreA;
    });
  }

  /**
   * Create adaptive challenge
   */
  private async createAdaptiveChallenge(
    userId: string,
    template: ChallengeTemplate,
    stats: PlayerStats,
  ): Promise<AdaptiveChallenge> {
    const adaptationRule = template.adaptationRules[stats.skillLevel];
    const personalizedTarget = this.calculatePersonalizedTarget(template, stats);
    const motivationalMessage = template.motivationalMessages[
      Math.floor(Math.random() * template.motivationalMessages.length)
    ]!;

    const baseRewards = this.calculateBaseRewards(template, stats.skillLevel);
    const adaptedRewards = {
      xp: Math.floor(baseRewards.xp * adaptationRule.multiplier),
      coins: Math.floor(baseRewards.coins * adaptationRule.multiplier),
      badge: stats.skillLevel === 'master' ? `adaptive_${template.type}_master` : undefined,
    };

    return {
      id: `adaptive_${template.id}_${userId}_${Date.now()}`,
      name: template.name,
      description: template.description.replace('{target}', personalizedTarget.toString()),
      type: template.type as any,
      target: personalizedTarget,
      difficulty: this.mapSkillToDifficulty(stats.skillLevel),
      rewards: adaptedRewards,
      icon: this.getIconForType(template.type),
      rarity: this.getRarityForSkill(stats.skillLevel),
      timeLimit: 24,
      isActive: true,
      adaptedFor: userId,
      originalDifficulty: stats.skillLevel,
      adaptationReason: adaptationRule.bonus,
      personalizedTarget,
      motivationalMessage,
    };
  }

  /**
   * Calculate personalized target
   */
  private calculatePersonalizedTarget(template: ChallengeTemplate, stats: PlayerStats): number {
    let target = template.baseTarget;

    // Ajustar baseado nas estatísticas do jogador
    switch (template.type) {
      case 'kills':
        if (stats.averageKills > 0) {
          target = Math.max(template.minTarget, Math.min(template.maxTarget, 
            Math.floor(stats.averageKills * template.scalingFactor)));
        }
        break;
      case 'damage':
        if (stats.averageDamage > 0) {
          target = Math.max(template.minTarget, Math.min(template.maxTarget, 
            Math.floor(stats.averageDamage * template.scalingFactor)));
        }
        break;
      case 'survival_time':
        if (stats.averageSurvivalTime > 0) {
          target = Math.max(template.minTarget, Math.min(template.maxTarget, 
            Math.floor(stats.averageSurvivalTime * template.scalingFactor)));
        }
        break;
      case 'wins':
        target = Math.max(template.minTarget, Math.min(template.maxTarget, 
          Math.ceil(template.baseTarget * (stats.winRate > 0.05 ? 1.2 : 0.8))));
        break;
      case 'headshots':
        if (stats.headShotRate > 0) {
          target = Math.max(template.minTarget, Math.min(template.maxTarget, 
            Math.ceil(template.baseTarget * (1 + stats.headShotRate))));
        }
        break;
      default:
        target = template.baseTarget;
    }

    // Aplicar multiplicador de skill level
    const skillMultiplier = template.adaptationRules[stats.skillLevel].multiplier;
    target = Math.floor(target * skillMultiplier);

    return Math.max(template.minTarget, Math.min(template.maxTarget, target));
  }

  /**
   * Calculate base rewards
   */
  private calculateBaseRewards(template: ChallengeTemplate, skillLevel: string): { xp: number; coins: number } {
    const baseXP = 150;
    const baseCoins = 75;

    const difficultyMultipliers = {
      beginner: 1.0,
      intermediate: 1.2,
      advanced: 1.4,
      expert: 1.6,
      master: 2.0,
    };

    const multiplier = difficultyMultipliers[skillLevel as keyof typeof difficultyMultipliers] || 1.0;

    return {
      xp: Math.floor(baseXP * multiplier),
      coins: Math.floor(baseCoins * multiplier),
    };
  }

  /**
   * Map skill level to difficulty
   */
  private mapSkillToDifficulty(skillLevel: string): 'easy' | 'medium' | 'hard' | 'extreme' {
    switch (skillLevel) {
      case 'beginner': return 'easy';
      case 'intermediate': return 'medium';
      case 'advanced': return 'hard';
      case 'expert':
      case 'master': return 'extreme';
      default: return 'easy';
    }
  }

  /**
   * Get icon for challenge type
   */
  private getIconForType(type: string): string {
    const icons: Record<string, string> = {
      kills: '⚔️',
      damage: '💥',
      survival_time: '🛡️',
      headshots: '🎯',
      wins: '🏆',
      games: '🎮',
      revives: '❤️‍🩹',
    };
    return icons[type] || '🎯';
  }

  /**
   * Get rarity for skill level
   */
  private getRarityForSkill(skillLevel: string): 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' {
    switch (skillLevel) {
      case 'beginner': return 'common';
      case 'intermediate': return 'uncommon';
      case 'advanced': return 'rare';
      case 'expert': return 'epic';
      case 'master': return 'legendary';
      default: return 'common';
    }
  }

  /**
   * Save adaptive challenges
   */
  private async saveAdaptiveChallenges(userId: string, challenges: AdaptiveChallenge[]): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0]!;

      for (const challenge of challenges) {
        // First create or update the challenge record
        await this.database.client.challenge.upsert({
          where: {
            id: challenge.id,
          },
          update: {
            name: challenge.name,
            description: challenge.description,
            type: challenge.type,
            target: challenge.target,
            difficulty: challenge.difficulty,
            rewards: JSON.stringify(challenge.rewards),
            metadata: JSON.stringify({
              originalDifficulty: challenge.originalDifficulty,
              adaptationReason: challenge.adaptationReason,
              motivationalMessage: challenge.motivationalMessage,
            }),
          },
          create: {
            id: challenge.id,
            name: challenge.name,
            description: challenge.description,
            type: challenge.type,
            target: challenge.target,
            difficulty: challenge.difficulty,
            rewards: JSON.stringify(challenge.rewards),
            metadata: JSON.stringify({
              originalDifficulty: challenge.originalDifficulty,
              adaptationReason: challenge.adaptationReason,
              motivationalMessage: challenge.motivationalMessage,
            }),
          },
        });

        // Then create or update the user challenge record
        await this.database.client.userChallenge.upsert({
          where: {
            userId_challengeId: {
              userId,
              challengeId: challenge.id,
            },
          },
          update: {
            progress: 0,
            target: challenge.target,
            completed: false,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
          },
          create: {
            userId,
            challengeId: challenge.id,
            progress: 0,
            target: challenge.target,
            completed: false,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to save adaptive challenges:', error);
      throw error;
    }
  }

  /**
   * Get active users for challenge generation
   */
  private async getActiveUsers(): Promise<string[]> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const activeUsers = await this.database.client.userStats.findMany({
        where: {
          updatedAt: {
            gte: sevenDaysAgo,
          },
        },
        select: {
          userId: true,
        },
      });

      return activeUsers.map(user => user.userId);
    } catch (error) {
      this.logger.error('Failed to get active users:', error);
      return [];
    }
  }

  /**
   * Get user's adaptive challenges
   */
  public async getUserAdaptiveChallenges(userId: string): Promise<AdaptiveChallenge[]> {
    try {
      const today = new Date().toISOString().split('T')[0]!;
      
      const userChallenges = await this.database.client.userChallenge.findMany({
        where: {
          userId,
          createdAt: {
            gte: new Date(today + 'T00:00:00.000Z'),
            lt: new Date(today + 'T23:59:59.999Z'),
          },
          challengeId: {
            startsWith: 'adaptive_',
          },
        },
        include: {
          challenge: true,
        },
      });

      return userChallenges.map(uc => {
        const adaptationData = JSON.parse(uc.challenge?.metadata || '{}');
        const typeMatch = uc.challengeId.match(/adaptive_(\w+)_/);
        const challengeType = typeMatch ? typeMatch[1] : 'kills';
        
        return {
          id: uc.challengeId,
          name: adaptationData.name || 'Desafio Adaptativo',
          description: adaptationData.description || 'Desafio personalizado baseado no seu desempenho',
          type: challengeType as any,
          target: uc.target,
          difficulty: this.mapSkillToDifficulty(adaptationData.originalDifficulty || 'intermediate'),
          rewards: JSON.parse(uc.challenge?.rewards || '{}'),
          icon: this.getIconForType(challengeType),
          rarity: this.getRarityForSkill(adaptationData.originalDifficulty || 'intermediate'),
          timeLimit: 24,
          isActive: !uc.completed,
          adaptedFor: userId,
          originalDifficulty: adaptationData.originalDifficulty || 'intermediate',
          adaptationReason: adaptationData.adaptationReason || 'Personalizado para você',
          personalizedTarget: uc.target,
          motivationalMessage: adaptationData.motivationalMessage || 'Você consegue superar este desafio!',
        };
      });
    } catch (error) {
      this.logger.error(`Failed to get adaptive challenges for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Force generate challenges for testing
   */
  public async forceGenerateForUser(userId: string): Promise<AdaptiveChallenge[]> {
    this.logger.info(`Force generating adaptive challenges for user ${userId}`);
    return await this.generateUserAdaptiveChallenges(userId);
  }

  /**
   * Get adaptation statistics
   */
  public async getAdaptationStats(): Promise<{
    totalAdaptiveChallenges: number;
    completionRateBySkill: Record<string, number>;
    averageTargetAdjustment: number;
    mostPopularChallengeTypes: string[];
  }> {
    try {
      const today = new Date().toISOString().split('T')[0]!;
      
      const adaptiveChallenges = await this.database.client.userChallenge.findMany({
        where: {
          createdAt: {
            gte: new Date(today + 'T00:00:00.000Z'),
            lt: new Date(today + 'T23:59:59.999Z'),
          },
          challengeId: {
            startsWith: 'adaptive_',
          },
        },
        include: {
          challenge: true,
        },
      });

      const totalAdaptiveChallenges = adaptiveChallenges.length;
      const completionRateBySkill: Record<string, number> = {};
      const skillCounts: Record<string, { total: number; completed: number }> = {};
      const challengeTypes: string[] = [];
      let totalTargetAdjustment = 0;
      let adjustmentCount = 0;

      // Calcular estatísticas
      for (const challenge of adaptiveChallenges) {
        const adaptationData = JSON.parse(challenge.challenge?.metadata || '{}');
        const skill = adaptationData.originalDifficulty || 'intermediate';
        
        // Inicializar contadores de skill
        if (!skillCounts[skill]) {
          skillCounts[skill] = { total: 0, completed: 0 };
        }
        
        skillCounts[skill].total++;
        if (challenge.completed) {
          skillCounts[skill].completed++;
        }
        
        // Extrair tipo do desafio do ID
        const typeMatch = challenge.challengeId.match(/adaptive_(\w+)_/);
        if (typeMatch) {
          challengeTypes.push(typeMatch[1]!);
        }
        
        // Calcular ajuste de target (comparado com base)
        const template = this.adaptiveTemplates.get(`adaptive_${typeMatch?.[1]}`);
        if (template) {
          const adjustment = challenge.target / template.baseTarget;
          totalTargetAdjustment += adjustment;
          adjustmentCount++;
        }
      }

      // Calcular taxas de conclusão por skill
      Object.keys(skillCounts).forEach(skill => {
        const { total, completed } = skillCounts[skill];
        completionRateBySkill[skill] = total > 0 ? completed / total : 0;
      });

      // Tipos mais populares
      const typeCount = challengeTypes.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const mostPopularChallengeTypes = Object.entries(typeCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([type]) => type);

      const averageTargetAdjustment = adjustmentCount > 0 ? totalTargetAdjustment / adjustmentCount : 1.0;

      return {
        totalAdaptiveChallenges,
        completionRateBySkill,
        averageTargetAdjustment,
        mostPopularChallengeTypes,
      };
    } catch (error) {
      this.logger.error('Failed to get adaptation stats:', error);
      return {
        totalAdaptiveChallenges: 0,
        completionRateBySkill: {},
        averageTargetAdjustment: 1.0,
        mostPopularChallengeTypes: [],
      };
    }
  }

  /**
   * Update adaptive challenge progress
   */
  public async updateAdaptiveChallengeProgress(
    userId: string,
    challengeType: string,
    progress: number,
  ): Promise<boolean> {
    try {
      const today = new Date().toISOString().split('T')[0]!;
      
      const challenge = await this.database.client.userChallenge.findFirst({
        where: {
          userId,
          challengeId: {
            contains: `adaptive_${challengeType}_`,
          },
          completed: false,
          createdAt: {
            gte: new Date(today + 'T00:00:00.000Z'),
            lt: new Date(today + 'T23:59:59.999Z'),
          },
        },
      });

      if (!challenge) {
        return false;
      }

      const newProgress = challenge.progress + progress;
      const isCompleted = newProgress >= challenge.target;

      await this.database.client.userChallenge.update({
        where: {
          id: challenge.id,
        },
        data: {
          progress: newProgress,
          completed: isCompleted,
          completedAt: isCompleted ? new Date() : null,
        },
      });

      if (isCompleted) {
        // Award rewards - get rewards from the Challenge model
        const challengeData = await this.database.client.challenge.findUnique({
          where: { id: challenge.challengeId },
        });
        
        if (challengeData?.rewards) {
          const rewards = JSON.parse(challengeData.rewards);
          if (rewards.xp || rewards.coins) {
            // Update user XP and coins in the User model
            await this.database.client.user.update({
              where: { id: userId },
              data: {
                xp: { increment: rewards.xp || 0 },
                coins: { increment: rewards.coins || 0 },
              },
            });
          }
        }

        this.logger.info(`User ${userId} completed adaptive challenge: ${challengeType}`);
      }

      return isCompleted;
    } catch (error) {
      this.logger.error('Error updating adaptive challenge progress:', error);
      return false;
    }
  }

  /**
   * Stop scheduled generation
   */
  public stopScheduledGeneration(): void {
    if (this.adaptationJob) {
      this.adaptationJob.stop();
      this.logger.info('Adaptive challenge generation stopped');
    }
  }

  /**
   * Clear player stats cache
   */
  public clearStatsCache(): void {
    this.playerStatsCache.clear();
    this.logger.info('Player stats cache cleared');
  }
}