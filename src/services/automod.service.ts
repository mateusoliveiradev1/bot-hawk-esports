import { Client, Message, TextChannel, EmbedBuilder, GuildMember } from 'discord.js';
import { DatabaseService } from '../database/database.service';
import { PunishmentService } from './punishment.service';
import { Logger } from '../utils/logger';
import { 
  AutoModConfig, 
  DEFAULT_AUTOMOD_CONFIG, 
  PROFANITY_LIST, 
  SUSPICIOUS_PATTERNS,
  ViolationType,
  PunishmentType,
  ModerationResult
} from '../config/automod.config';

/**
 * Auto Moderation Service
 * Handles automatic moderation of messages including spam, profanity, and suspicious links
 */
export class AutoModerationService {
  private logger: Logger;
  private userMessageHistory: Map<string, Message[]> = new Map();
  private userViolations: Map<string, number> = new Map();
  private guildConfigs: Map<string, AutoModConfig> = new Map();

  constructor(
    private client: Client,
    private db: DatabaseService,
    private punishmentService: PunishmentService
  ) {
    this.logger = new Logger();
    this.logger.info('Auto Moderation Service initialized');
    this.loadConfigurations();
    this.startCleanupInterval();
  }

  /**
   * Carrega as configurações de auto moderação para todas as guildas
   */
  private async loadConfigurations(): Promise<void> {
    try {
      // Por enquanto, usa a configuração padrão para todas as guildas
      // No futuro, isso pode ser carregado do banco de dados
      this.client.guilds.cache.forEach(guild => {
        this.guildConfigs.set(guild.id, { ...DEFAULT_AUTOMOD_CONFIG });
      });
      
      this.logger.info(`Loaded auto moderation configs for ${this.guildConfigs.size} guilds`);
    } catch (error) {
      this.logger.error('Failed to load auto moderation configurations:', error);
    }
  }

  /**
   * Obtém a configuração de auto moderação para uma guilda
   */
  private getGuildConfig(guildId: string): AutoModConfig {
    return this.guildConfigs.get(guildId) || DEFAULT_AUTOMOD_CONFIG;
  }

  /**
   * Processa uma mensagem através dos filtros de moderação
   */
  async processMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;

    const config = this.getGuildConfig(message.guild.id);
    if (!config.enabled) return;

    // Verifica se o usuário/canal/cargo está isento
    if (this.isExempt(message, config)) return;

    // Armazena a mensagem para detecção de spam
    this.storeMessage(message);

    try {
      let result: ModerationResult;

      // Verifica spam
      if (config.spamDetection.enabled) {
        result = await this.checkSpam(message, config);
        if (result.violated) {
          await this.handleViolation(message, result, config);
          return;
        }
      }

      // Verifica palavrões
      if (config.profanityFilter.enabled) {
        result = this.checkProfanity(message, config);
        if (result.violated) {
          await this.handleViolation(message, result, config);
          return;
        }
      }

      // Verifica links suspeitos
      if (config.linkFilter.enabled) {
        result = this.checkSuspiciousLinks(message, config);
        if (result.violated) {
          await this.handleViolation(message, result, config);
          return;
        }
      }

      // Verifica excesso de maiúsculas
      if (config.capsFilter.enabled) {
        result = this.checkExcessiveCaps(message, config);
        if (result.violated) {
          await this.handleViolation(message, result, config);
          return;
        }
      }

    } catch (error) {
      this.logger.error('Error processing message for auto moderation:', error);
    }
  }

  /**
   * Verifica se o usuário/canal/cargo está isento da moderação
   */
  private isExempt(message: Message, config: AutoModConfig): boolean {
    const member = message.member;
    if (!member) return false;

    // Verifica usuários isentos
    if (config.exemptions.users.includes(message.author.id)) return true;

    // Verifica canais isentos
    if (config.exemptions.channels.includes(message.channel.id)) return true;

    // Verifica cargos isentos
    const hasExemptRole = member.roles.cache.some(role => 
      config.exemptions.roles.includes(role.id)
    );
    if (hasExemptRole) return true;

    return false;
  }

  /**
   * Armazena mensagem para detecção de spam
   */
  private storeMessage(message: Message): void {
    const userId = message.author.id;
    const userMessages = this.userMessageHistory.get(userId) || [];
    
    userMessages.push(message);
    
    // Mantém apenas as últimas 10 mensagens
    if (userMessages.length > 10) {
      userMessages.shift();
    }
    
    this.userMessageHistory.set(userId, userMessages);
  }

  /**
   * Verifica spam
   */
  private async checkSpam(message: Message, config: AutoModConfig): Promise<ModerationResult> {
    const userId = message.author.id;
    const userMessages = this.userMessageHistory.get(userId) || [];
    const now = Date.now();
    
    // Verifica frequência de mensagens
    const recentMessages = userMessages.filter(
      msg => now - msg.createdTimestamp < config.spamDetection.timeWindow * 1000
    );
    
    if (recentMessages.length >= config.spamDetection.maxMessages) {
      return {
        violated: true,
        violationType: ViolationType.SPAM,
        reason: `Enviou ${recentMessages.length} mensagens em ${config.spamDetection.timeWindow} segundos`,
        punishment: this.determinePunishment(userId, config)
      };
    }
    
    // Verifica mensagens duplicadas
    const duplicates = userMessages.filter(
      msg => msg.content.toLowerCase() === message.content.toLowerCase() &&
             now - msg.createdTimestamp < config.spamDetection.duplicateTimeWindow * 1000
    );
    
    if (duplicates.length >= config.spamDetection.maxDuplicates) {
      return {
        violated: true,
        violationType: ViolationType.DUPLICATE_MESSAGE,
        reason: `Enviou ${duplicates.length} mensagens duplicadas`,
        punishment: this.determinePunishment(userId, config)
      };
    }
    
    return { violated: false };
  }

  /**
   * Verifica palavrões
   */
  private checkProfanity(message: Message, config: AutoModConfig): ModerationResult {
    const content = message.content.toLowerCase();
    const allProfanity = [...PROFANITY_LIST.portuguese, ...PROFANITY_LIST.english, ...config.profanityFilter.customWords];
    
    for (const word of allProfanity) {
      const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'i');
      if (regex.test(content)) {
        return {
          violated: true,
          violationType: ViolationType.PROFANITY,
          reason: `Linguagem inapropriada detectada: "${word}"`,
          punishment: this.determinePunishment(message.author.id, config)
        };
      }
    }
    
    return { violated: false };
  }

  /**
   * Verifica links suspeitos
   */
  private checkSuspiciousLinks(message: Message, config: AutoModConfig): ModerationResult {
    const content = message.content;
    
    // Verifica convites do Discord se bloqueados
    if (config.linkFilter.blockInvites) {
      const discordInviteRegex = /discord(?:\.gg|\.com\/invite|app\.com\/invite)\/[a-zA-Z0-9]+/gi;
      if (discordInviteRegex.test(content)) {
        return {
          violated: true,
          violationType: ViolationType.DISCORD_INVITE,
          reason: 'Convite do Discord não autorizado',
          punishment: this.determinePunishment(message.author.id, config)
        };
      }
    }
    
    // Verifica links suspeitos
    if (config.linkFilter.blockSuspicious) {
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(content)) {
          // Verifica se o domínio está na whitelist
          const urls = content.match(pattern);
          if (urls) {
            for (const url of urls) {
              const domain = this.extractDomain(url);
              if (domain && !config.linkFilter.whitelist.includes(domain)) {
                return {
                  violated: true,
                  violationType: ViolationType.SUSPICIOUS_LINK,
                  reason: `Link suspeito detectado: ${domain}`,
                  punishment: this.determinePunishment(message.author.id, config)
                };
              }
            }
          }
        }
      }
    }
    
    return { violated: false };
  }

  /**
   * Verifica excesso de maiúsculas
   */
  private checkExcessiveCaps(message: Message, config: AutoModConfig): ModerationResult {
    const content = message.content;
    
    if (content.length < config.capsFilter.minLength) {
      return { violated: false };
    }
    
    const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
    const percentage = (uppercaseCount / content.length) * 100;
    
    if (percentage > config.capsFilter.maxPercentage) {
      return {
        violated: true,
        violationType: ViolationType.EXCESSIVE_CAPS,
        reason: `Excesso de maiúsculas: ${percentage.toFixed(1)}%`,
        punishment: this.determinePunishment(message.author.id, config)
      };
    }
    
    return { violated: false };
  }

  /**
   * Determina a punição baseada no histórico do usuário
   */
  private determinePunishment(userId: string, config: AutoModConfig): PunishmentType {
    if (!config.escalation.enabled) {
      return PunishmentType.WARN;
    }
    
    const violations = this.userViolations.get(userId) || 0;
    
    if (violations >= config.escalation.banThreshold) {
      return PunishmentType.BAN;
    } else if (violations >= config.escalation.kickThreshold) {
      return PunishmentType.KICK;
    } else if (violations >= config.escalation.muteThreshold) {
      return PunishmentType.MUTE;
    } else {
      return PunishmentType.WARN;
    }
  }

  /**
   * Lida com violações detectadas
   */
  private async handleViolation(message: Message, result: ModerationResult, config: AutoModConfig): Promise<void> {
    try {
      const userId = message.author.id;
      const member = message.member;
      
      if (!member || !result.punishment) return;
      
      // Incrementa violações do usuário
      const currentViolations = this.userViolations.get(userId) || 0;
      this.userViolations.set(userId, currentViolations + 1);
      
      // Deleta a mensagem se configurado
      const punishmentConfig = config.punishments[result.punishment];
      if (punishmentConfig?.deleteMessage) {
        await message.delete().catch(() => {});
      }
      
      // Aplica a punição
      await this.applyPunishment(member, result.punishment, result.reason || 'Violação de auto moderação', config);
      
      // Registra no log
      await this.logViolation(message, result, config);
      
    } catch (error) {
      this.logger.error('Error handling violation:', error);
    }
  }

  /**
   * Aplica punição ao usuário
   */
  private async applyPunishment(member: GuildMember, punishment: PunishmentType, reason: string, config: AutoModConfig): Promise<void> {
    const punishmentConfig = config.punishments[punishment];
    if (!punishmentConfig?.enabled) return;
    
    try {
      switch (punishment) {
        case PunishmentType.WARN:
          // Implementar sistema de avisos
          this.logger.info(`Warning issued to ${member.user.tag}: ${reason}`);
          break;
          
        case PunishmentType.MUTE:
          await member.timeout(config.punishments.mute.duration * 60 * 1000, reason);
          this.logger.info(`Muted ${member.user.tag} for ${config.punishments.mute.duration} minutes: ${reason}`);
          break;
          
        case PunishmentType.KICK:
          await member.kick(reason);
          this.logger.info(`Kicked ${member.user.tag}: ${reason}`);
          break;
          
        case PunishmentType.BAN:
          await member.ban({ 
            reason, 
            deleteMessageDays: config.punishments.ban.deleteMessageDays 
          });
          this.logger.info(`Banned ${member.user.tag}: ${reason}`);
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to apply punishment ${punishment} to ${member.user.tag}:`, error);
    }
  }

  /**
   * Registra violação no log
   */
  private async logViolation(message: Message, result: ModerationResult, config: AutoModConfig): Promise<void> {
    if (!config.logging.enabled || !config.logging.channelId) return;
    
    try {
      const logChannel = message.guild?.channels.cache.get(config.logging.channelId) as TextChannel;
      if (!logChannel) return;
      
      const embed = new EmbedBuilder()
        .setTitle('🚨 Auto Moderação')
        .setColor(0xff0000)
        .addFields(
          { name: '👤 Usuário', value: `${message.author.tag} (${message.author.id})`, inline: true },
          { name: '📍 Canal', value: `${message.channel}`, inline: true },
          { name: '⚠️ Violação', value: result.violationType || 'Desconhecida', inline: true },
          { name: '📝 Razão', value: result.reason || 'Não especificada', inline: false },
          { name: '🔨 Punição', value: result.punishment || 'Nenhuma', inline: true },
          { name: '💬 Mensagem', value: message.content.substring(0, 1000) || 'Sem conteúdo', inline: false }
        )
        .setTimestamp();
      
      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Failed to log violation:', error);
    }
  }

  /**
   * Extrai domínio de uma URL
   */
  private extractDomain(url: string): string | null {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Inicia intervalo de limpeza
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000); // A cada hora
  }

  /**
   * Limpa dados antigos
   */
  private cleanupOldData(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    
    // Limpa histórico de mensagens antigas
    for (const [userId, messages] of this.userMessageHistory.entries()) {
      const recentMessages = messages.filter(msg => now - msg.createdTimestamp < maxAge);
      if (recentMessages.length === 0) {
        this.userMessageHistory.delete(userId);
      } else {
        this.userMessageHistory.set(userId, recentMessages);
      }
    }
    
    // Reset violações após o tempo configurado
    // Isso seria implementado com base na configuração de reset
    
    this.logger.debug('Cleaned up old auto moderation data');
  }

  /**
   * Atualiza configuração de uma guilda
   */
  public updateGuildConfig(guildId: string, config: Partial<AutoModConfig>): void {
    const currentConfig = this.getGuildConfig(guildId);
    const newConfig = { ...currentConfig, ...config };
    this.guildConfigs.set(guildId, newConfig);
    
    this.logger.info(`Updated auto moderation config for guild ${guildId}`);
  }

  /**
   * Obtém estatísticas da auto moderação
   */
  public getStats(): { totalViolations: number; activeUsers: number; configuredGuilds: number } {
    const totalViolations = Array.from(this.userViolations.values()).reduce((sum, count) => sum + count, 0);
    const activeUsers = this.userMessageHistory.size;
    const configuredGuilds = this.guildConfigs.size;
    
    return {
      totalViolations,
      activeUsers,
      configuredGuilds
    };
  }
}