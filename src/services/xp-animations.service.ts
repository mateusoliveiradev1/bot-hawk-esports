import { EmbedBuilder, User, TextChannel, GuildMember } from 'discord.js';
import { Logger } from '../utils/logger';
import { ExtendedClient } from '../types/client';
import { XPGainResult } from './xp.service';

export interface AnimationConfig {
  enableAnimations: boolean;
  enableProgressBars: boolean;
  enableLevelUpEffects: boolean;
  enableRealTimeNotifications: boolean;
  animationDuration: number; // em segundos
  progressBarStyle: 'classic' | 'modern' | 'minimal';
  levelUpStyle: 'celebration' | 'elegant' | 'gaming';
}

export interface XPAnimationData {
  userId: string;
  oldXP: number;
  newXP: number;
  oldLevel: number;
  newLevel: number;
  xpGained: number;
  progressPercentage: number;
  nextLevelXP: number;
  currentLevelXP: number;
}

export interface LevelUpAnimation {
  userId: string;
  newLevel: number;
  rewards: {
    xp: number;
    coins?: number;
    badges?: string[];
    roles?: string[];
  };
  achievements: string[];
}

export class XPAnimationsService {
  private logger: Logger;
  private client: ExtendedClient;
  private config: AnimationConfig;
  
  // Emojis para animações
  private readonly PROGRESS_EMOJIS = {
    empty: '⬜',
    filled: '🟩',
    partial: '🟨',
    complete: '✅',
  };
  
  private readonly LEVEL_UP_EMOJIS = {
    celebration: ['🎉', '🎊', '🥳', '🌟', '✨', '💫', '🎆', '🎇'],
    elegant: ['👑', '💎', '🏆', '🥇', '⭐', '🌟'],
    gaming: ['🎮', '🕹️', '🏅', '🎯', '🚀', '⚡'],
  };
  
  private readonly RARITY_COLORS = {
    common: '#95A5A6',
    uncommon: '#2ECC71',
    rare: '#3498DB',
    epic: '#9B59B6',
    legendary: '#F39C12',
    mythic: '#E74C3C',
  };

  constructor(client: ExtendedClient) {
    this.client = client;
    this.logger = new Logger();
    
    // Configuração padrão
    this.config = {
      enableAnimations: true,
      enableProgressBars: true,
      enableLevelUpEffects: true,
      enableRealTimeNotifications: true,
      animationDuration: 3,
      progressBarStyle: 'modern',
      levelUpStyle: 'gaming',
    };
    
    this.logger.info('✅ XPAnimationsService initialized');
  }

  /**
   * Criar barra de progresso animada
   */
  public createProgressBar(
    currentXP: number,
    requiredXP: number,
    style: 'classic' | 'modern' | 'minimal' = 'modern',
  ): string {
    const percentage = Math.min((currentXP / requiredXP) * 100, 100);
    const filledBars = Math.floor(percentage / 5); // 20 barras no total
    const totalBars = 20;
    
    switch (style) {
      case 'classic':
        return this.createClassicProgressBar(filledBars, totalBars, percentage);
      case 'modern':
        return this.createModernProgressBar(filledBars, totalBars, percentage);
      case 'minimal':
        return this.createMinimalProgressBar(percentage);
      default:
        return this.createModernProgressBar(filledBars, totalBars, percentage);
    }
  }

  private createClassicProgressBar(filled: number, total: number, percentage: number): string {
    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(total - filled);
    return `\`${filledBar}${emptyBar}\` ${percentage.toFixed(1)}%`;
  }

  private createModernProgressBar(filled: number, total: number, percentage: number): string {
    const filledEmoji = this.PROGRESS_EMOJIS.filled;
    const emptyEmoji = this.PROGRESS_EMOJIS.empty;
    const partialEmoji = this.PROGRESS_EMOJIS.partial;
    
    let bar = filledEmoji.repeat(filled);
    
    // Adicionar barra parcial se necessário
    if (filled < total && percentage % 5 > 2.5) {
      bar += partialEmoji;
      bar += emptyEmoji.repeat(total - filled - 1);
    } else {
      bar += emptyEmoji.repeat(total - filled);
    }
    
    return `${bar} **${percentage.toFixed(1)}%**`;
  }

  private createMinimalProgressBar(percentage: number): string {
    const blocks = Math.floor(percentage / 10);
    const bar = '▰'.repeat(blocks) + '▱'.repeat(10 - blocks);
    return `${bar} ${percentage.toFixed(1)}%`;
  }

  /**
   * Criar embed animado para ganho de XP
   */
  public async createXPGainEmbed(
    user: User,
    xpData: XPAnimationData,
    activityType: string,
  ): Promise<EmbedBuilder> {
    const { userId, oldXP, newXP, oldLevel, newLevel, xpGained, progressPercentage, nextLevelXP, currentLevelXP } = xpData;
    
    const embed = new EmbedBuilder()
      .setTitle('💫 XP Ganho!')
      .setDescription(`${user.displayName} ganhou **${xpGained} XP** por **${this.getActivityDisplayName(activityType)}**`)
      .setColor('#00FF00')
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();

    // Barra de progresso
    const progressBar = this.createProgressBar(
      newXP - currentLevelXP,
      nextLevelXP - currentLevelXP,
      this.config.progressBarStyle,
    );

    embed.addFields(
      {
        name: '📊 Progresso do Nível',
        value: `**Nível ${newLevel}**\n${progressBar}\n\`${newXP - currentLevelXP}/${nextLevelXP - currentLevelXP} XP\``,
        inline: false,
      },
      {
        name: '📈 Estatísticas',
        value: `**XP Total:** ${newXP.toLocaleString()}\n**Nível:** ${newLevel}\n**XP Ganho:** +${xpGained}`,
        inline: true,
      },
    );

    // Se subiu de nível, adicionar efeitos especiais
    if (newLevel > oldLevel) {
      embed.setTitle('🎉 LEVEL UP!');
      embed.setColor('#FFD700');
      embed.setDescription(`${user.displayName} subiu para o **Nível ${newLevel}**! 🎊`);
      
      const levelUpEmojis = this.LEVEL_UP_EMOJIS[this.config.levelUpStyle];
      const randomEmojis = this.getRandomEmojis(levelUpEmojis, 3);
      
      embed.addFields({
        name: `${randomEmojis.join(' ')} Parabéns!`,
        value: `Você alcançou o **Nível ${newLevel}**!\nContinue assim para desbloquear mais recompensas!`,
        inline: false,
      });
    }

    return embed;
  }

  /**
   * Criar animação de level up completa
   */
  public async createLevelUpAnimation(
    user: User,
    levelUpData: LevelUpAnimation,
    channel?: TextChannel,
  ): Promise<EmbedBuilder[]> {
    const { userId, newLevel, rewards, achievements } = levelUpData;
    const embeds: EmbedBuilder[] = [];

    // Embed principal de level up
    const mainEmbed = new EmbedBuilder()
      .setTitle('🎉 LEVEL UP ÉPICO!')
      .setDescription(`**${user.displayName}** alcançou o **Nível ${newLevel}**!`)
      .setColor('#FFD700')
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setTimestamp();

    // Adicionar efeitos visuais baseados no nível
    const levelTier = this.getLevelTier(newLevel);
    const tierEmojis = this.getTierEmojis(levelTier);
    
    mainEmbed.addFields({
      name: `${tierEmojis.join(' ')} Novo Nível Alcançado!`,
      value: `**Nível ${newLevel}** - ${this.getLevelTitle(newLevel)}\n${this.getLevelDescription(newLevel)}`,
      inline: false,
    });

    // Recompensas
    if (rewards.xp > 0 || rewards.coins || rewards.badges?.length || rewards.roles?.length) {
      let rewardsText = '';
      
      if (rewards.xp > 0) {rewardsText += `💫 **${rewards.xp} XP Bônus**\n`;}
      if (rewards.coins) {rewardsText += `🪙 **${rewards.coins} Moedas**\n`;}
      if (rewards.badges?.length) {rewardsText += `🏆 **${rewards.badges.length} Nova(s) Badge(s)**\n`;}
      if (rewards.roles?.length) {rewardsText += `👑 **${rewards.roles.length} Novo(s) Cargo(s)**\n`;}
      
      mainEmbed.addFields({
        name: '🎁 Recompensas Desbloqueadas',
        value: rewardsText,
        inline: true,
      });
    }

    // Conquistas
    if (achievements.length > 0) {
      mainEmbed.addFields({
        name: '🏅 Conquistas',
        value: achievements.map(achievement => `✨ ${achievement}`).join('\n'),
        inline: true,
      });
    }

    embeds.push(mainEmbed);

    // Embed de progresso futuro
    const nextLevelEmbed = new EmbedBuilder()
      .setTitle('🎯 Próximo Objetivo')
      .setDescription(`Continue progredindo para alcançar o **Nível ${newLevel + 1}**!`)
      .setColor('#3498DB')
      .addFields({
        name: '📈 Próximas Recompensas',
        value: this.getNextLevelRewards(newLevel + 1),
        inline: false,
      });

    embeds.push(nextLevelEmbed);

    return embeds;
  }

  /**
   * Enviar notificação em tempo real
   */
  public async sendRealTimeNotification(
    user: User,
    xpData: XPAnimationData,
    activityType: string,
    channel?: TextChannel,
  ): Promise<void> {
    if (!this.config.enableRealTimeNotifications || !channel) {return;}

    try {
      const embed = await this.createXPGainEmbed(user, xpData, activityType);
      
      const message = await channel.send({ embeds: [embed] });
      
      // Adicionar reações animadas
      if (this.config.enableAnimations) {
        const reactions = ['💫', '⭐', '🌟'];
        for (const reaction of reactions) {
          await message.react(reaction);
          await this.delay(200); // Pequeno delay entre reações
        }
      }
      
      // Auto-deletar após um tempo se não for level up
      if (xpData.newLevel === xpData.oldLevel) {
        setTimeout(() => {
          message.delete().catch(() => {});
        }, 30000); // 30 segundos
      }
    } catch (error) {
      this.logger.error('Erro ao enviar notificação em tempo real:', error);
    }
  }

  /**
   * Criar efeito de celebração para level up
   */
  public async createCelebrationEffect(
    user: User,
    newLevel: number,
    channel: TextChannel,
  ): Promise<void> {
    if (!this.config.enableLevelUpEffects) {return;}

    try {
      // Mensagem de celebração temporária
      const celebrationEmojis = this.LEVEL_UP_EMOJIS[this.config.levelUpStyle];
      const randomEmojis = this.getRandomEmojis(celebrationEmojis, 5);
      
      const celebrationMessage = await channel.send(
        `${randomEmojis.join(' ')} **${user.displayName}** subiu para o **Nível ${newLevel}**! ${randomEmojis.join(' ')}`,
      );
      
      // Adicionar reações de celebração
      const reactions = ['🎉', '🎊', '🥳', '👏', '🔥'];
      for (const reaction of reactions) {
        await celebrationMessage.react(reaction);
        await this.delay(300);
      }
      
      // Deletar após 10 segundos
      setTimeout(() => {
        celebrationMessage.delete().catch(() => {});
      }, 10000);
    } catch (error) {
      this.logger.error('Erro ao criar efeito de celebração:', error);
    }
  }

  /**
   * Atualizar configurações de animação
   */
  public updateConfig(newConfig: Partial<AnimationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info(`Configurações de animação atualizadas: ${JSON.stringify(newConfig)}`);
  }

  /**
   * Obter configurações atuais
   */
  public getConfig(): AnimationConfig {
    return { ...this.config };
  }

  // Métodos auxiliares privados
  private getActivityDisplayName(activityType: string): string {
    const displayNames: Record<string, string> = {
      'MM': 'Matchmaking',
      'SCRIM': 'Scrimmage',
      'CAMPEONATO': 'Campeonato',
      'RANKED': 'Ranked',
      'DAILY_CHALLENGE': 'Desafio Diário',
      'ACHIEVEMENT': 'Conquista',
      'BADGE_EARNED': 'Badge Conquistada',
      'QUIZ_COMPLETED': 'Quiz Completado',
      'CLIP_APPROVED': 'Clip Aprovado',
      'CHECK_IN': 'Check-in',
      'WEAPON_MASTERY': 'Maestria de Arma',
      'TOURNAMENT_WIN': 'Vitória em Torneio',
      'STREAK_BONUS': 'Bônus de Sequência',
    };
    
    return displayNames[activityType] || activityType;
  }

  private getRandomEmojis(emojis: string[], count: number): string[] {
    const shuffled = [...emojis].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  private getLevelTier(level: number): 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master' {
    if (level < 10) {return 'bronze';}
    if (level < 25) {return 'silver';}
    if (level < 50) {return 'gold';}
    if (level < 75) {return 'platinum';}
    if (level < 100) {return 'diamond';}
    return 'master';
  }

  private getTierEmojis(tier: string): string[] {
    const tierEmojis = {
      bronze: ['🥉', '🟤'],
      silver: ['🥈', '⚪'],
      gold: ['🥇', '🟡'],
      platinum: ['💎', '🔷'],
      diamond: ['💠', '🔹'],
      master: ['👑', '⭐'],
    };
    
    return tierEmojis[tier as keyof typeof tierEmojis] || ['⭐'];
  }

  private getLevelTitle(level: number): string {
    const titles: Record<number, string> = {
      5: 'Iniciante Dedicado',
      10: 'Jogador Experiente',
      15: 'Veterano',
      25: 'Elite',
      30: 'Mestre',
      50: 'Lenda',
      75: 'Campeão',
      100: 'Imortal',
    };
    
    // Encontrar o título mais próximo
    const availableLevels = Object.keys(titles).map(Number).sort((a, b) => b - a);
    const titleLevel = availableLevels.find(l => level >= l);
    
    return titleLevel ? titles[titleLevel] : 'Jogador';
  }

  private getLevelDescription(level: number): string {
    const tier = this.getLevelTier(level);
    const descriptions = {
      bronze: 'Você está começando sua jornada!',
      silver: 'Progresso sólido, continue assim!',
      gold: 'Excelente dedicação ao jogo!',
      platinum: 'Você é um jogador excepcional!',
      diamond: 'Elite absoluta do servidor!',
      master: 'Lenda viva do PUBG!',
    };
    
    return descriptions[tier];
  }

  private getNextLevelRewards(nextLevel: number): string {
    const rewards = [];
    
    if (nextLevel % 5 === 0) {rewards.push('🏆 Nova Badge de Nível');}
    if (nextLevel % 10 === 0) {rewards.push('🎁 Pacote de Recompensas');}
    if (nextLevel % 25 === 0) {rewards.push('👑 Cargo Especial');}
    if (nextLevel === 50) {rewards.push('💎 Título Exclusivo');}
    if (nextLevel === 100) {rewards.push('🌟 Status de Lenda');}
    
    return rewards.length > 0 ? rewards.join('\n') : '🎯 Continue progredindo para descobrir!';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}