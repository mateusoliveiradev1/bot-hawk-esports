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
  ModerationResult,
} from '../config/automod.config';

/**
 * Auto Moderation Service
 * Handles automatic moderation of messages including spam, profanity, and suspicious links
 */
export class AutoModerationService {
  private logger: Logger;
  private userMessageHistory: Map<string, Message[]> = new Map();
  private messageHistory: Map<
    string,
    Array<{ content: string; timestamp: number; channelId: string }>
  > = new Map();
  private userViolations: Map<string, number> = new Map();
  private guildConfigs: Map<string, AutoModConfig> = new Map();
  private cleanupInterval?: any;
  private startTime: number = Date.now();
  private lastCleanup?: number;

  constructor(
    private client: Client,
    private db: DatabaseService,
    private punishmentService: PunishmentService,
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
      if (!this.client?.guilds?.cache) {
        this.logger.warn('Client guilds cache not available during configuration loading');
        return;
      }

      // Por enquanto, usa a configuração padrão para todas as guildas
      // No futuro, isso pode ser carregado do banco de dados
      this.client.guilds.cache.forEach(guild => {
        if (guild?.id) {
          this.guildConfigs.set(guild.id, { ...DEFAULT_AUTOMOD_CONFIG });
        }
      });

      this.logger.info(`Loaded auto moderation configs for ${this.guildConfigs.size} guilds`);
    } catch (error) {
      this.logger.error('Failed to load auto moderation configurations:', error);
      // Fallback para configuração padrão se houver erro
      this.guildConfigs.clear();
    }
  }

  /**
   * Obtém a configuração de auto moderação para uma guilda
   */
  private getGuildConfig(guildId: string): AutoModConfig {
    if (!guildId || typeof guildId !== 'string') {
      this.logger.warn('Invalid guildId provided to getGuildConfig');
      return { ...DEFAULT_AUTOMOD_CONFIG };
    }

    return this.guildConfigs.get(guildId) || { ...DEFAULT_AUTOMOD_CONFIG };
  }

  /**
   * Processa uma mensagem através dos filtros de moderação
   */
  async processMessage(message: Message): Promise<void> {
    // Validações de entrada
    if (!message) {
      this.logger.warn('Invalid message provided to processMessage');
      return;
    }

    if (!message.guild || message.author?.bot || !message.author?.id) {
      return;
    }

    if (!message.content && !message.attachments?.size) {
      return; // Mensagem sem conteúdo relevante
    }

    const config = this.getGuildConfig(message.guild.id);
    if (!config.enabled) {
      return;
    }

    // Verifica se o usuário/canal/cargo está isento
    if (this.isExempt(message, config)) {
      return;
    }

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
    if (!message?.author?.id || !message?.channel?.id || !config?.exemptions) {
      return false;
    }

    const member = message.member;
    if (!member) {
      return false;
    }

    // Verifica usuários isentos
    if (
      Array.isArray(config.exemptions.users) &&
      config.exemptions.users.includes(message.author.id)
    ) {
      return true;
    }

    // Verifica canais isentos
    if (
      Array.isArray(config.exemptions.channels) &&
      config.exemptions.channels.includes(message.channel.id)
    ) {
      return true;
    }

    // Verifica cargos isentos
    if (Array.isArray(config.exemptions.roles) && member.roles?.cache) {
      const hasExemptRole = member.roles.cache.some(
        role => role?.id && config.exemptions.roles.includes(role.id),
      );
      if (hasExemptRole) {
        return true;
      }
    }

    // Verifica se o usuário tem permissões de administrador
    if (member.permissions?.has('Administrator')) {
      return true;
    }

    return false;
  }

  /**
   * Armazena mensagem para detecção de spam
   */
  private storeMessage(message: Message): void {
    if (!message?.author?.id) {
      this.logger.warn('Cannot store message: invalid message or author');
      return;
    }

    try {
      const userId = message.author.id;
      const userMessages = this.userMessageHistory.get(userId) || [];

      userMessages.push(message);

      // Mantém apenas as últimas 10 mensagens
      if (userMessages.length > 10) {
        userMessages.shift();
      }

      this.userMessageHistory.set(userId, userMessages);
    } catch (error) {
      this.logger.error('Error storing message for spam detection:', error);
    }
  }

  /**
   * Verifica spam
   */
  private async checkSpam(message: Message, config: AutoModConfig): Promise<ModerationResult> {
    if (!message?.author?.id || !config?.spamDetection) {
      return { violated: false };
    }

    try {
      const userId = message.author.id;
      const userMessages = this.userMessageHistory.get(userId) || [];
      const now = Date.now();

      // Verifica frequência de mensagens
      const recentMessages = userMessages.filter(
        msg =>
          msg?.createdTimestamp &&
          now - msg.createdTimestamp < config.spamDetection.timeWindow * 1000,
      );

      if (recentMessages.length >= config.spamDetection.maxMessages) {
        return {
          violated: true,
          violationType: ViolationType.SPAM,
          reason: `Enviou ${recentMessages.length} mensagens em ${config.spamDetection.timeWindow} segundos`,
          punishment: this.determinePunishment(userId, config),
        };
      }

      // Verifica mensagens duplicadas
      if (message.content && message.content.trim()) {
        const messageContent = message.content.toLowerCase().trim();
        const duplicates = userMessages.filter(
          msg =>
            msg?.content &&
            msg.content.toLowerCase().trim() === messageContent &&
            msg.createdTimestamp &&
            now - msg.createdTimestamp < config.spamDetection.duplicateTimeWindow * 1000,
        );

        if (duplicates.length >= config.spamDetection.maxDuplicates) {
          return {
            violated: true,
            violationType: ViolationType.DUPLICATE_MESSAGE,
            reason: `Enviou ${duplicates.length} mensagens duplicadas`,
            punishment: this.determinePunishment(userId, config),
          };
        }
      }

      return { violated: false };
    } catch (error) {
      this.logger.error('Error checking spam:', error);
      return { violated: false };
    }
  }

  /**
   * Verifica palavrões
   */
  private checkProfanity(message: Message, config: AutoModConfig): ModerationResult {
    if (!message?.content || !config?.profanityFilter || !message?.author?.id) {
      return { violated: false };
    }

    try {
      const content = message.content.toLowerCase().trim();
      if (!content) {
        return { violated: false };
      }

      const customWords = Array.isArray(config.profanityFilter.customWords)
        ? config.profanityFilter.customWords
        : [];
      const allProfanity = [
        ...(PROFANITY_LIST.portuguese || []),
        ...(PROFANITY_LIST.english || []),
        ...customWords,
      ].filter(word => word && typeof word === 'string');

      for (const word of allProfanity) {
        if (!word || word.length < 2) {
          continue;
        } // Evita palavras muito curtas

        try {
          const escapedWord = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');

          if (regex.test(content)) {
            return {
              violated: true,
              violationType: ViolationType.PROFANITY,
              reason: 'Linguagem inapropriada detectada',
              punishment: this.determinePunishment(message.author.id, config),
            };
          }
        } catch (regexError) {
          this.logger.warn(`Invalid regex for word: ${word}`, regexError);
          continue;
        }
      }

      return { violated: false };
    } catch (error) {
      this.logger.error('Error checking profanity:', error);
      return { violated: false };
    }
  }

  /**
   * Verifica links suspeitos
   */
  private checkSuspiciousLinks(message: Message, config: AutoModConfig): ModerationResult {
    if (!message?.content || !config?.linkFilter || !message?.author?.id) {
      return { violated: false };
    }

    try {
      const content = message.content.trim();
      if (!content) {
        return { violated: false };
      }

      // Verifica convites do Discord se bloqueados
      if (config.linkFilter.blockInvites) {
        const discordInviteRegex = /discord(?:\.gg|\.com\/invite|app\.com\/invite)\/[a-zA-Z0-9]+/gi;
        if (discordInviteRegex.test(content)) {
          return {
            violated: true,
            violationType: ViolationType.DISCORD_INVITE,
            reason: 'Convite do Discord não autorizado',
            punishment: this.determinePunishment(message.author.id, config),
          };
        }
      }

      // Verifica links suspeitos
      if (config.linkFilter.blockSuspicious && Array.isArray(SUSPICIOUS_PATTERNS)) {
        for (const pattern of SUSPICIOUS_PATTERNS) {
          if (!pattern || typeof pattern.test !== 'function') {
            continue;
          }

          try {
            if (pattern.test(content)) {
              // Verifica se o domínio está na whitelist
              const urls = content.match(pattern);
              if (urls && Array.isArray(urls)) {
                const whitelist = Array.isArray(config.linkFilter.whitelist)
                  ? config.linkFilter.whitelist
                  : [];

                for (const url of urls) {
                  if (!url || typeof url !== 'string') {
                    continue;
                  }

                  const domain = this.extractDomain(url);
                  if (domain && !whitelist.includes(domain)) {
                    return {
                      violated: true,
                      violationType: ViolationType.SUSPICIOUS_LINK,
                      reason: 'Link suspeito detectado',
                      punishment: this.determinePunishment(message.author.id, config),
                    };
                  }
                }
              }
            }
          } catch (patternError) {
            this.logger.warn('Error testing suspicious pattern:', patternError);
            continue;
          }
        }
      }

      return { violated: false };
    } catch (error) {
      this.logger.error('Error checking suspicious links:', error);
      return { violated: false };
    }
  }

  /**
   * Verifica excesso de maiúsculas
   */
  private checkExcessiveCaps(message: Message, config: AutoModConfig): ModerationResult {
    if (!message?.content || !config?.capsFilter || !message?.author?.id) {
      return { violated: false };
    }

    try {
      const content = message.content.trim();
      if (!content || content.length < (config.capsFilter.minLength || 1)) {
        return { violated: false };
      }

      const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
      const totalLetters = (content.match(/[A-Za-z]/g) || []).length;

      // Só verifica se há letras suficientes
      if (totalLetters < (config.capsFilter.minLength || 1)) {
        return { violated: false };
      }

      const percentage = (uppercaseCount / totalLetters) * 100;
      const maxPercentage = config.capsFilter.maxPercentage || 70;

      if (percentage > maxPercentage) {
        return {
          violated: true,
          violationType: ViolationType.EXCESSIVE_CAPS,
          reason: `Excesso de maiúsculas: ${percentage.toFixed(1)}%`,
          punishment: this.determinePunishment(message.author.id, config),
        };
      }

      return { violated: false };
    } catch (error) {
      this.logger.error('Error checking excessive caps:', error);
      return { violated: false };
    }
  }

  /**
   * Determina a punição baseada no histórico do usuário
   */
  private determinePunishment(userId: string, config: AutoModConfig): PunishmentType {
    if (!userId || typeof userId !== 'string' || !config?.escalation) {
      return PunishmentType.WARN;
    }

    if (!config.escalation.enabled) {
      return PunishmentType.WARN;
    }

    const violations = this.userViolations.get(userId) || 0;
    const thresholds = config.escalation;

    if (violations >= (thresholds.banThreshold || 10)) {
      return PunishmentType.BAN;
    } else if (violations >= (thresholds.kickThreshold || 8)) {
      return PunishmentType.KICK;
    } else if (violations >= (thresholds.muteThreshold || 5)) {
      return PunishmentType.MUTE;
    } else {
      return PunishmentType.WARN;
    }
  }

  /**
   * Lida com violações detectadas
   */
  private async handleViolation(
    message: Message,
    result: ModerationResult,
    config: AutoModConfig,
  ): Promise<void> {
    if (!message?.author?.id || !result?.punishment || !config) {
      this.logger.warn('Invalid parameters for handleViolation');
      return;
    }

    try {
      const userId = message.author.id;
      const member = message.member;

      if (!member) {
        this.logger.warn(`Member not found for user ${userId}`);
        return;
      }

      // Incrementa violações do usuário
      const currentViolations = this.userViolations.get(userId) || 0;
      this.userViolations.set(userId, currentViolations + 1);

      // Deleta a mensagem se configurado
      const punishmentConfig = config.punishments?.[result.punishment];
      if (punishmentConfig?.deleteMessage) {
        try {
          await message.delete();
          this.logger.debug(`Deleted message from ${userId} due to violation`);
        } catch (deleteError) {
          this.logger.warn('Failed to delete violating message:', deleteError);
        }
      }

      // Aplica a punição
      await this.applyPunishment(
        member,
        result.punishment,
        result.reason || 'Violação de auto moderação',
        config,
      );

      // Registra no log
      await this.logViolation(message, result, config);

      this.logger.info(
        `Handled violation for user ${userId}: ${result.violationType} - ${result.punishment}`,
      );
    } catch (error) {
      this.logger.error('Error handling violation:', error);
    }
  }

  /**
   * Aplica punição ao usuário
   */
  private async applyPunishment(
    member: GuildMember,
    punishment: PunishmentType,
    reason: string,
    config: AutoModConfig,
  ): Promise<void> {
    if (!member?.user?.id || !punishment || !config?.punishments) {
      this.logger.warn('Invalid parameters for applyPunishment');
      return;
    }

    const punishmentConfig = config.punishments[punishment];
    if (!punishmentConfig?.enabled) {
      this.logger.debug(`Punishment ${punishment} is disabled for guild ${member.guild.id}`);
      return;
    }

    try {
      // Verifica se o bot tem permissões necessárias
      const botMember = member.guild.members.me;
      if (!botMember) {
        this.logger.error('Bot member not found in guild');
        return;
      }

      switch (punishment) {
        case PunishmentType.WARN:
          // Log warning - punishment service is for session-based penalties
          this.logger.info(`Warning issued to ${member.user.tag}: ${reason}`);

          // Send warning message to user if possible
          try {
            const user = await this.client.users.fetch(member.user.id);
            await user.send(
              `⚠️ **Aviso de Moderação**\n\n**Servidor:** ${member.guild.name}\n**Motivo:** ${reason}\n\nPor favor, siga as regras do servidor.`,
            );
          } catch (dmError) {
            this.logger.debug(`Could not send DM to ${member.user.tag}:`, dmError);
          }
          break;

        case PunishmentType.MUTE:
          if (!botMember.permissions.has('ModerateMembers')) {
            this.logger.error('Bot lacks ModerateMembers permission for timeout');
            return;
          }

          const muteDuration = (config.punishments.mute?.duration || 10) * 60 * 1000;
          await member.timeout(muteDuration, reason);
          this.logger.info(
            `Muted ${member.user.tag} for ${config.punishments.mute?.duration || 10} minutes: ${reason}`,
          );
          break;

        case PunishmentType.KICK:
          if (!botMember.permissions.has('KickMembers')) {
            this.logger.error('Bot lacks KickMembers permission');
            return;
          }

          if (member.roles.highest.position >= botMember.roles.highest.position) {
            this.logger.error(`Cannot kick ${member.user.tag}: higher or equal role hierarchy`);
            return;
          }

          await member.kick(reason);
          this.logger.info(`Kicked ${member.user.tag}: ${reason}`);
          break;

        case PunishmentType.BAN:
          if (!botMember.permissions.has('BanMembers')) {
            this.logger.error('Bot lacks BanMembers permission');
            return;
          }

          if (member.roles.highest.position >= botMember.roles.highest.position) {
            this.logger.error(`Cannot ban ${member.user.tag}: higher or equal role hierarchy`);
            return;
          }

          await member.ban({
            reason,
            deleteMessageDays: Math.min(config.punishments.ban?.deleteMessageDays || 1, 7),
          });
          this.logger.info(`Banned ${member.user.tag}: ${reason}`);
          break;

        default:
          this.logger.warn(`Unknown punishment type: ${punishment}`);
      }
    } catch (error) {
      this.logger.error(`Failed to apply punishment ${punishment} to ${member.user.tag}:`, error);

      // Tenta aplicar uma punição menor se a atual falhar
      if (punishment === PunishmentType.BAN) {
        this.logger.info('Attempting to kick instead of ban');
        await this.applyPunishment(member, PunishmentType.KICK, reason, config);
      } else if (punishment === PunishmentType.KICK) {
        this.logger.info('Attempting to mute instead of kick');
        await this.applyPunishment(member, PunishmentType.MUTE, reason, config);
      }
    }
  }

  /**
   * Registra violação no canal de log
   */
  private async logViolation(
    message: Message,
    result: ModerationResult,
    config: AutoModConfig,
  ): Promise<void> {
    if (!config?.logging?.enabled || !config.logging.channelId || !message?.guild || !result) {
      return;
    }

    try {
      const logChannel = message.guild.channels.cache.get(config.logging.channelId) as TextChannel;
      if (!logChannel || !logChannel.isTextBased()) {
        this.logger.warn(`Log channel ${config.logging.channelId} not found or not text-based`);
        return;
      }

      // Verifica permissões do bot no canal de log
      const botMember = message.guild.members.me;
      if (!botMember) {
        this.logger.error('Bot member not found in guild');
        return;
      }

      const permissions = logChannel.permissionsFor(botMember);
      if (!permissions?.has(['SendMessages', 'EmbedLinks'])) {
        this.logger.error(`Bot lacks permissions in log channel ${config.logging.channelId}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🚨 Auto Moderação - Violação Detectada')
        .setColor(0xff0000)
        .addFields(
          { name: 'Usuário', value: `${message.author.tag} (${message.author.id})`, inline: true },
          { name: 'Canal', value: `${message.channel}`, inline: true },
          { name: 'Tipo de Violação', value: result.violationType || 'Desconhecido', inline: true },
          { name: 'Punição Aplicada', value: result.punishment || 'Nenhuma', inline: true },
          { name: 'Razão', value: result.reason || 'Não especificada', inline: false },
        )
        .setTimestamp()
        .setFooter({ text: `Guild: ${message.guild.name}` });

      // Adiciona conteúdo da mensagem se disponível e não muito longo
      if (message.content && message.content.trim()) {
        const content =
          message.content.length > 1000
            ? message.content.substring(0, 1000) + '...'
            : message.content;
        embed.addFields({
          name: 'Conteúdo da Mensagem',
          value: `\`\`\`${content}\`\`\``,
          inline: false,
        });
      }

      await logChannel.send({ embeds: [embed] });
      this.logger.debug(
        `Logged violation for user ${message.author.id} in guild ${message.guild.id}`,
      );
    } catch (error) {
      this.logger.error('Error logging violation:', error);
    }
  }

  /**
   * Extrai domínio de uma URL
   */
  private extractDomain(url: string): string | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    try {
      // Remove espaços e caracteres especiais
      const cleanUrl = url.trim();

      // Adiciona protocolo se não existir
      const urlWithProtocol = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;

      const urlObj = new URL(urlWithProtocol);
      const hostname = urlObj.hostname.toLowerCase();

      // Valida se o hostname é válido
      if (!hostname || hostname.length === 0 || hostname === 'localhost') {
        return null;
      }

      return hostname;
    } catch (error) {
      this.logger.debug(`Failed to extract domain from URL: ${url}`, error);
      return null;
    }
  }

  /**
   * Inicia limpeza automática de dados antigos
   */
  private startCleanupInterval(): void {
    try {
      // Limpa dados a cada hora
      const cleanupInterval = setInterval(
        () => {
          try {
            this.cleanupOldData();
          } catch (error) {
            this.logger.error('Error during scheduled cleanup:', error);
          }
        },
        60 * 60 * 1000,
      );

      // Armazena referência do interval para possível limpeza futura
      this.cleanupInterval = cleanupInterval;

      this.logger.info('Cleanup interval started for AutoMod service');
    } catch (error) {
      this.logger.error('Failed to start cleanup interval:', error);
    }
  }

  /**
   * Remove dados antigos para economizar memória
   */
  private cleanupOldData(): void {
    try {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 horas

      let cleanedUsers = 0;
      let cleanedMessages = 0;

      // Limpa histórico de mensagens antigas (messageHistory)
      for (const [userId, messages] of this.messageHistory.entries()) {
        if (!Array.isArray(messages)) {
          this.messageHistory.delete(userId);
          cleanedUsers++;
          continue;
        }

        const recentMessages = messages.filter(msg => {
          return msg && typeof msg.timestamp === 'number' && now - msg.timestamp < maxAge;
        });

        const removedCount = messages.length - recentMessages.length;
        cleanedMessages += removedCount;

        if (recentMessages.length === 0) {
          this.messageHistory.delete(userId);
          cleanedUsers++;
        } else if (removedCount > 0) {
          this.messageHistory.set(userId, recentMessages);
        }
      }

      // Limpa histórico de mensagens do Discord (userMessageHistory)
      for (const [userId, messages] of this.userMessageHistory.entries()) {
        if (!Array.isArray(messages)) {
          this.userMessageHistory.delete(userId);
          continue;
        }

        const recentMessages = messages.filter(msg => {
          return (
            msg && typeof msg.createdTimestamp === 'number' && now - msg.createdTimestamp < maxAge
          );
        });

        if (recentMessages.length === 0) {
          this.userMessageHistory.delete(userId);
        } else if (recentMessages.length !== messages.length) {
          this.userMessageHistory.set(userId, recentMessages);
        }
      }

      // Limpa violações muito antigas (mais de 7 dias)
      const violationMaxAge = 7 * 24 * 60 * 60 * 1000;
      let cleanedViolations = 0;

      for (const [userId, violations] of this.userViolations.entries()) {
        if (typeof violations !== 'number' || violations <= 0) {
          this.userViolations.delete(userId);
          cleanedViolations++;
        }
      }

      // Atualiza timestamp da última limpeza
      this.lastCleanup = Date.now();

      if (cleanedUsers > 0 || cleanedMessages > 0 || cleanedViolations > 0) {
        this.logger.info(
          `Cleaned up automod data: ${cleanedUsers} users, ${cleanedMessages} messages, ${cleanedViolations} violations`,
        );
      } else {
        this.logger.debug('No old automod data to clean up');
      }
    } catch (error) {
      this.logger.error('Error during cleanup of old automod data:', error);
    }
  }

  /**
   * Atualiza configuração de uma guilda
   */
  public async updateGuildConfig(guildId: string, config: Partial<AutoModConfig>): Promise<void> {
    if (!guildId || typeof guildId !== 'string') {
      throw new Error('Invalid guildId provided');
    }

    if (!config || typeof config !== 'object') {
      throw new Error('Invalid config provided');
    }

    try {
      const currentConfig = this.getGuildConfig(guildId);

      // Valida e normaliza as configurações antes de aplicar
      const validatedConfig = this.validateAndNormalizeConfig(config);
      const newConfig = { ...currentConfig, ...validatedConfig };

      this.guildConfigs.set(guildId, newConfig);

      // TODO: Salvar no banco de dados
      // await this.database.updateAutoModConfig(guildId, newConfig);

      this.logger.info(`Updated automod config for guild ${guildId}`);
    } catch (error) {
      this.logger.error(`Failed to update automod config for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Valida e normaliza configurações de auto moderação
   */
  private validateAndNormalizeConfig(config: Partial<AutoModConfig>): Partial<AutoModConfig> {
    const validatedConfig: Partial<AutoModConfig> = {};

    try {
      // Valida configuração geral
      if (typeof config.enabled === 'boolean') {
        validatedConfig.enabled = config.enabled;
      }

      // Valida configuração de spam
      if (config.spamDetection && typeof config.spamDetection === 'object') {
        validatedConfig.spamDetection = {
          enabled:
            typeof config.spamDetection.enabled === 'boolean' ? config.spamDetection.enabled : true,
          maxMessages:
            typeof config.spamDetection.maxMessages === 'number' &&
            config.spamDetection.maxMessages > 0
              ? Math.min(config.spamDetection.maxMessages, 20)
              : 5,
          timeWindow:
            typeof config.spamDetection.timeWindow === 'number' &&
            config.spamDetection.timeWindow > 0
              ? Math.min(config.spamDetection.timeWindow, 300)
              : 10,
          maxDuplicates:
            typeof config.spamDetection.maxDuplicates === 'number' &&
            config.spamDetection.maxDuplicates > 0
              ? Math.min(config.spamDetection.maxDuplicates, 10)
              : 3,
          duplicateTimeWindow:
            typeof config.spamDetection.duplicateTimeWindow === 'number' &&
            config.spamDetection.duplicateTimeWindow > 0
              ? Math.min(config.spamDetection.duplicateTimeWindow, 600)
              : 60,
        };
      }

      // Valida configuração de palavrões
      if (config.profanityFilter && typeof config.profanityFilter === 'object') {
        validatedConfig.profanityFilter = {
          enabled:
            typeof config.profanityFilter.enabled === 'boolean'
              ? config.profanityFilter.enabled
              : true,
          strictMode:
            typeof config.profanityFilter.strictMode === 'boolean'
              ? config.profanityFilter.strictMode
              : false,
          customWords: Array.isArray(config.profanityFilter.customWords)
            ? config.profanityFilter.customWords.filter(
                word => typeof word === 'string' && word.trim().length > 0,
              )
            : [],
        };
      }

      // Valida configuração de links
      if (config.linkFilter && typeof config.linkFilter === 'object') {
        validatedConfig.linkFilter = {
          enabled:
            typeof config.linkFilter.enabled === 'boolean' ? config.linkFilter.enabled : true,
          allowWhitelisted:
            typeof config.linkFilter.allowWhitelisted === 'boolean'
              ? config.linkFilter.allowWhitelisted
              : true,
          blockInvites:
            typeof config.linkFilter.blockInvites === 'boolean'
              ? config.linkFilter.blockInvites
              : true,
          blockSuspicious:
            typeof config.linkFilter.blockSuspicious === 'boolean'
              ? config.linkFilter.blockSuspicious
              : true,
          whitelist: Array.isArray(config.linkFilter.whitelist)
            ? config.linkFilter.whitelist.filter(
                domain => typeof domain === 'string' && domain.trim().length > 0,
              )
            : [],
          blacklist: Array.isArray(config.linkFilter.blacklist)
            ? config.linkFilter.blacklist.filter(
                domain => typeof domain === 'string' && domain.trim().length > 0,
              )
            : [],
        };
      }

      // Valida configuração de maiúsculas
      if (config.capsFilter && typeof config.capsFilter === 'object') {
        validatedConfig.capsFilter = {
          enabled:
            typeof config.capsFilter.enabled === 'boolean' ? config.capsFilter.enabled : true,
          maxPercentage:
            typeof config.capsFilter.maxPercentage === 'number' &&
            config.capsFilter.maxPercentage > 0 &&
            config.capsFilter.maxPercentage <= 100
              ? config.capsFilter.maxPercentage
              : 70,
          minLength:
            typeof config.capsFilter.minLength === 'number' && config.capsFilter.minLength > 0
              ? Math.min(config.capsFilter.minLength, 100)
              : 5,
        };
      }

      // Valida configuração de escalação
      if (config.escalation && typeof config.escalation === 'object') {
        validatedConfig.escalation = {
          enabled:
            typeof config.escalation.enabled === 'boolean' ? config.escalation.enabled : true,
          warnThreshold:
            typeof config.escalation.warnThreshold === 'number' &&
            config.escalation.warnThreshold > 0
              ? config.escalation.warnThreshold
              : 1,
          muteThreshold:
            typeof config.escalation.muteThreshold === 'number' &&
            config.escalation.muteThreshold > 0
              ? config.escalation.muteThreshold
              : 3,
          kickThreshold:
            typeof config.escalation.kickThreshold === 'number' &&
            config.escalation.kickThreshold > 0
              ? config.escalation.kickThreshold
              : 5,
          banThreshold:
            typeof config.escalation.banThreshold === 'number' && config.escalation.banThreshold > 0
              ? config.escalation.banThreshold
              : 10,
          resetTime:
            typeof config.escalation.resetTime === 'number' && config.escalation.resetTime > 0
              ? config.escalation.resetTime
              : 24,
        };
      }

      // Valida configuração de logging
      if (config.logging && typeof config.logging === 'object') {
        validatedConfig.logging = {
          enabled: typeof config.logging.enabled === 'boolean' ? config.logging.enabled : false,
          channelId:
            typeof config.logging.channelId === 'string' &&
            config.logging.channelId.trim().length > 0
              ? config.logging.channelId.trim()
              : '',
          logWarnings:
            typeof config.logging.logWarnings === 'boolean' ? config.logging.logWarnings : true,
          logMutes: typeof config.logging.logMutes === 'boolean' ? config.logging.logMutes : true,
          logKicks: typeof config.logging.logKicks === 'boolean' ? config.logging.logKicks : true,
          logBans: typeof config.logging.logBans === 'boolean' ? config.logging.logBans : true,
          logDeletedMessages:
            typeof config.logging.logDeletedMessages === 'boolean'
              ? config.logging.logDeletedMessages
              : true,
        };
      }

      // Valida configuração de isenções
      if (config.exemptions && typeof config.exemptions === 'object') {
        validatedConfig.exemptions = {
          users: Array.isArray(config.exemptions.users)
            ? config.exemptions.users.filter(id => typeof id === 'string' && id.trim().length > 0)
            : [],
          roles: Array.isArray(config.exemptions.roles)
            ? config.exemptions.roles.filter(id => typeof id === 'string' && id.trim().length > 0)
            : [],
          channels: Array.isArray(config.exemptions.channels)
            ? config.exemptions.channels.filter(
                id => typeof id === 'string' && id.trim().length > 0,
              )
            : [],
        };
      }

      return validatedConfig;
    } catch (error) {
      this.logger.error('Error validating automod config:', error);
      return {};
    }
  }

  /**
   * Obtém estatísticas da auto moderação
   */
  public getStats(): {
    totalViolations: number;
    activeUsers: number;
    configuredGuilds: number;
    memoryUsage: {
      guildConfigs: number;
      userViolations: number;
      messageHistory: number;
      totalMessages: number;
    };
    uptime?: number;
    lastCleanup?: number;
  } {
    try {
      const totalViolations = Array.from(this.userViolations.values())
        .filter(count => typeof count === 'number' && count > 0)
        .reduce((sum, count) => sum + count, 0);

      const totalMessages = Array.from(this.messageHistory.values())
        .filter(messages => Array.isArray(messages))
        .reduce((sum, messages) => sum + messages.length, 0);

      const totalDiscordMessages = Array.from(this.userMessageHistory.values())
        .filter(messages => Array.isArray(messages))
        .reduce((sum, messages) => sum + messages.length, 0);

      const activeGuilds = Array.from(this.guildConfigs.keys()).filter(
        guildId => typeof guildId === 'string' && guildId.length > 0,
      );

      return {
        totalViolations,
        activeUsers: this.userViolations.size,
        configuredGuilds: activeGuilds.length,
        memoryUsage: {
          guildConfigs: this.guildConfigs.size,
          userViolations: this.userViolations.size,
          messageHistory: this.messageHistory.size,
          totalMessages,
        },
        uptime: this.startTime ? Date.now() - this.startTime : undefined,
        lastCleanup: this.lastCleanup,
      };
    } catch (error) {
      this.logger.error('Error getting automod stats:', error);
      return {
        totalViolations: 0,
        activeUsers: 0,
        configuredGuilds: 0,
        memoryUsage: {
          guildConfigs: 0,
          userViolations: 0,
          messageHistory: 0,
          totalMessages: 0,
        },
      };
    }
  }

  /**
   * Reseta violações de um usuário
   */
  public resetUserViolations(userId: string): boolean {
    if (!userId || typeof userId !== 'string') {
      this.logger.warn('Invalid userId provided to resetUserViolations');
      return false;
    }

    try {
      const hadViolations = this.userViolations.has(userId);
      this.userViolations.delete(userId);

      if (hadViolations) {
        this.logger.info(`Reset violations for user ${userId}`);
      }

      return hadViolations;
    } catch (error) {
      this.logger.error(`Error resetting violations for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Obtém violações de um usuário específico
   */
  public getUserViolations(userId: string): number {
    if (!userId || typeof userId !== 'string') {
      this.logger.warn('Invalid userId provided to getUserViolations');
      return 0;
    }

    return this.userViolations.get(userId) || 0;
  }

  /**
   * Força limpeza de dados antigos
   */
  public forceCleanup(): void {
    try {
      this.cleanupOldData();
      this.logger.info('Manual cleanup completed');
    } catch (error) {
      this.logger.error('Error during manual cleanup:', error);
    }
  }

  /**
   * Desabilita o serviço e limpa recursos
   */
  public shutdown(): void {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
      }

      this.messageHistory.clear();
      this.userMessageHistory.clear();
      this.userViolations.clear();
      this.guildConfigs.clear();

      this.logger.info('AutoMod service shutdown completed');
    } catch (error) {
      this.logger.error('Error during AutoMod service shutdown:', error);
    }
  }
}
