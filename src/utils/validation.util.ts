import { CommandInteraction, GuildMember, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { DatabaseService } from '../database/database.service';
import { EmbedUtils } from './embed-builder.util';
import { Logger } from './logger';
import * as validator from 'validator';
import * as DOMPurify from 'isomorphic-dompurify';

/**
 * Utility class for common validations with enhanced security
 */
export class ValidationUtils {
  private static readonly logger = new Logger();
  private static readonly MAX_STRING_LENGTH = 2000;
  private static readonly MAX_NUMBER_VALUE = 1000000;
  private static readonly ALLOWED_FILE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  /**
   * Check if user is registered in the system
   */
  static async validateUserRegistration(
    interaction: CommandInteraction,
    database: DatabaseService,
  ): Promise<{ isValid: boolean; user?: any }> {
    try {
      const user = await database.client.user.findUnique({
        where: { id: interaction.user.id },
        include: {
          guilds: {
            where: { guildId: interaction.guildId! },
          },
        },
      });

      if (!user || user.guilds.length === 0) {
        await interaction.editReply({
          embeds: [
            EmbedUtils.userNotRegistered(
              'Você precisa se registrar primeiro usando `/register-server`',
            ),
          ],
        });
        return { isValid: false };
      }

      return { isValid: true, user };
    } catch (error) {
      await interaction.editReply({
        embeds: [EmbedUtils.internalError('Erro ao verificar registro do usuário')],
      });
      return { isValid: false };
    }
  }

  /**
   * Check if user has required permissions with enhanced security
   */
  static async validatePermissions(
    interaction: CommandInteraction,
    requiredPermissions: bigint[],
    requireAll: boolean = true,
  ): Promise<boolean> {
    try {
      const member = interaction.member as GuildMember;

      if (!member) {
        this.logger.warn(
          `Permission validation failed: No member found for user ${interaction.user.id}`,
        );
        await interaction.editReply({
          embeds: [
            EmbedUtils.createErrorEmbed('Erro', 'Não foi possível verificar suas permissões'),
          ],
        });
        return false;
      }

      // Validate guild context
      if (!interaction.guildId || !interaction.guild) {
        this.logger.warn(
          `Permission validation failed: No guild context for user ${interaction.user.id}`,
        );
        await interaction.editReply({
          embeds: [
            EmbedUtils.createErrorEmbed('Erro', 'Este comando só pode ser usado em servidores'),
          ],
        });
        return false;
      }

      // Check if member is still in guild
      if (!member.guild || member.guild.id !== interaction.guildId) {
        this.logger.warn(
          `Permission validation failed: Member not in guild ${interaction.guildId}`,
        );
        await interaction.editReply({
          embeds: [EmbedUtils.createErrorEmbed('Erro', 'Você não está mais neste servidor')],
        });
        return false;
      }

      const hasPermissions = requireAll
        ? requiredPermissions.every(permission => member.permissions.has(permission))
        : requiredPermissions.some(permission => member.permissions.has(permission));

      if (!hasPermissions) {
        this.logger.warn(
          `Permission validation failed: User ${interaction.user.id} lacks required permissions`,
        );
        await interaction.editReply({
          embeds: [
            EmbedUtils.insufficientPermissions(
              'Você não tem permissões suficientes para executar este comando',
            ),
          ],
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Error validating permissions:', error);
      await interaction.editReply({
        embeds: [EmbedUtils.createErrorEmbed('Erro', 'Erro interno ao verificar permissões')],
      });
      return false;
    }
  }

  /**
   * Check if user is administrator
   */
  static async validateAdminPermissions(interaction: CommandInteraction): Promise<boolean> {
    return this.validatePermissions(interaction, [PermissionFlagsBits.Administrator]);
  }

  /**
   * Check if user can manage server
   */
  static async validateManageServerPermissions(interaction: CommandInteraction): Promise<boolean> {
    return this.validatePermissions(interaction, [PermissionFlagsBits.ManageGuild]);
  }

  /**
   * Check if user can moderate (kick/ban)
   */
  static async validateModerationPermissions(interaction: CommandInteraction): Promise<boolean> {
    return this.validatePermissions(interaction, [
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
    ]);
  }

  /**
   * Validate string parameter is not empty
   */
  static validateStringParameter(
    value: string | null,
    parameterName: string,
    interaction: CommandInteraction,
  ): boolean {
    if (!value || value.trim().length === 0) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed(
            'Parâmetro Inválido',
            `O parâmetro '${parameterName}' é obrigatório`,
          ),
        ],
      });
      return false;
    }
    return true;
  }

  /**
   * Validate number parameter is within range
   */
  static validateNumberParameter(
    value: number,
    min: number,
    max: number,
    parameterName: string,
    interaction: CommandInteraction,
  ): boolean {
    if (value < min || value > max) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed(
            'Parâmetro Inválido',
            `O parâmetro '${parameterName}' deve estar entre ${min} e ${max}`,
          ),
        ],
      });
      return false;
    }
    return true;
  }

  /**
   * Check if user is in voice channel (for music commands)
   */
  static validateVoiceChannel(interaction: CommandInteraction): boolean {
    const member = interaction.member as GuildMember;

    if (!member?.voice?.channel) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed(
            'Canal de Voz Necessário',
            'Você precisa estar em um canal de voz para usar este comando',
          ),
        ],
      });
      return false;
    }

    return true;
  }

  /**
   * Check if bot has required permissions in a channel
   */
  static validateBotPermissions(
    interaction: CommandInteraction,
    requiredPermissions: bigint[],
  ): boolean {
    const botMember = interaction.guild?.members.me;

    if (!botMember) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed('Erro', 'Não foi possível verificar as permissões do bot'),
        ],
      });
      return false;
    }

    const hasPermissions = requiredPermissions.every(permission =>
      botMember.permissions.has(permission),
    );

    if (!hasPermissions) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed(
            'Permissões Insuficientes',
            'O bot não tem permissões suficientes para executar esta ação',
          ),
        ],
      });
      return false;
    }

    return true;
  }

  /**
   * Sanitize and validate string input
   */
  static sanitizeString(input: string, maxLength?: number): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Remove null bytes and control characters
    // eslint-disable-next-line no-control-regex
    let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Sanitize HTML
    sanitized = DOMPurify.sanitize(sanitized, { ALLOWED_TAGS: [] });

    // Trim and limit length
    sanitized = sanitized.trim();
    const limit = maxLength || this.MAX_STRING_LENGTH;
    if (sanitized.length > limit) {
      sanitized = sanitized.substring(0, limit);
    }

    return sanitized;
  }

  /**
   * Validate and sanitize user input with comprehensive checks
   */
  static validateUserInput(
    input: string,
    fieldName: string,
    options: {
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      allowSpecialChars?: boolean;
      pattern?: RegExp;
    } = {},
  ): { isValid: boolean; sanitized: string; error?: string } {
    try {
      if (!input && options.required) {
        return {
          isValid: false,
          sanitized: '',
          error: `${fieldName} é obrigatório`,
        };
      }

      if (!input) {
        return { isValid: true, sanitized: '' };
      }

      // Sanitize input
      const sanitized = this.sanitizeString(input, options.maxLength);

      // Check length constraints
      if (options.minLength && sanitized.length < options.minLength) {
        return {
          isValid: false,
          sanitized,
          error: `${fieldName} deve ter pelo menos ${options.minLength} caracteres`,
        };
      }

      if (options.maxLength && sanitized.length > options.maxLength) {
        return {
          isValid: false,
          sanitized,
          error: `${fieldName} deve ter no máximo ${options.maxLength} caracteres`,
        };
      }

      // Check pattern if provided
      if (options.pattern && !options.pattern.test(sanitized)) {
        return {
          isValid: false,
          sanitized,
          error: `${fieldName} contém caracteres inválidos`,
        };
      }

      // Check for special characters if not allowed
      // eslint-disable-next-line no-control-regex
      if (!options.allowSpecialChars && /[<>"'&\x00-\x1f\x7f-\x9f]/.test(sanitized)) {
        return {
          isValid: false,
          sanitized,
          error: `${fieldName} contém caracteres não permitidos`,
        };
      }

      return { isValid: true, sanitized };
    } catch (error) {
      this.logger.error('Error validating user input:', error);
      return {
        isValid: false,
        sanitized: '',
        error: 'Erro interno na validação',
      };
    }
  }

  /**
   * Validate file upload with security checks
   */
  static validateFileUpload(file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer?: Buffer;
  }): { isValid: boolean; error?: string } {
    try {
      // Check file size
      if (file.size > this.MAX_FILE_SIZE) {
        return {
          isValid: false,
          error: `Arquivo muito grande. Máximo permitido: ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`,
        };
      }

      // Check file extension
      const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
      if (!this.ALLOWED_FILE_TYPES.includes(ext)) {
        return {
          isValid: false,
          error: `Tipo de arquivo não permitido. Permitidos: ${this.ALLOWED_FILE_TYPES.join(', ')}`,
        };
      }

      // Check MIME type
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return {
          isValid: false,
          error: 'Tipo MIME não permitido',
        };
      }

      // Check for null bytes in filename
      if (file.originalname.includes('\x00')) {
        return {
          isValid: false,
          error: 'Nome de arquivo inválido',
        };
      }

      // Basic magic number check for images
      if (file.buffer) {
        const magicNumbers = {
          'image/jpeg': [0xff, 0xd8, 0xff],
          'image/png': [0x89, 0x50, 0x4e, 0x47],
          'image/gif': [0x47, 0x49, 0x46],
          'image/webp': [0x52, 0x49, 0x46, 0x46],
        };

        const expectedMagic = magicNumbers[file.mimetype as keyof typeof magicNumbers];
        if (expectedMagic) {
          const fileMagic = Array.from(file.buffer.slice(0, expectedMagic.length));
          if (!expectedMagic.every((byte, index) => byte === fileMagic[index])) {
            return {
              isValid: false,
              error: 'Arquivo corrompido ou tipo incorreto',
            };
          }
        }
      }

      return { isValid: true };
    } catch (error) {
      this.logger.error('Error validating file upload:', error);
      return {
        isValid: false,
        error: 'Erro interno na validação do arquivo',
      };
    }
  }

  /**
   * Validate Discord ID format
   */
  static validateDiscordId(id: string): boolean {
    return /^\d{17,19}$/.test(id);
  }

  /**
   * Validate URL with security checks
   */
  static validateUrl(url: string): { isValid: boolean; error?: string } {
    try {
      if (!url) {
        return { isValid: false, error: 'URL é obrigatória' };
      }

      // Check if it's a valid URL
      if (!validator.isURL(url, { protocols: ['http', 'https'] })) {
        return { isValid: false, error: 'URL inválida' };
      }

      const parsedUrl = new URL(url);

      // Block localhost and private IPs
      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')
      ) {
        return { isValid: false, error: 'URLs locais não são permitidas' };
      }

      // Block suspicious protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { isValid: false, error: 'Protocolo não permitido' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'URL malformada' };
    }
  }

  /**
   * Rate limit validation for user actions
   */
  static validateRateLimit(
    userId: string,
    action: string,
    maxAttempts: number = 5,
    windowMs: number = 60000,
  ): { allowed: boolean; resetTime?: Date } {
    const key = `${userId}:${action}`;
    const now = Date.now();

    // This would typically use Redis or another persistent store
    // For now, using a simple in-memory approach
    if (!this.rateLimitStore) {
      this.rateLimitStore = new Map();
    }

    const record = this.rateLimitStore.get(key);
    if (!record || now - record.firstAttempt > windowMs) {
      this.rateLimitStore.set(key, {
        attempts: 1,
        firstAttempt: now,
      });
      return { allowed: true };
    }

    if (record.attempts >= maxAttempts) {
      return {
        allowed: false,
        resetTime: new Date(record.firstAttempt + windowMs),
      };
    }

    record.attempts++;
    this.rateLimitStore.set(key, record);
    return { allowed: true };
  }

  private static rateLimitStore:
    | Map<string, { attempts: number; firstAttempt: number }>
    | undefined;

  /**
   * Generic error handler for command execution
   */
  static async handleCommandError(
    error: any,
    interaction: CommandInteraction,
    logger?: any,
  ): Promise<void> {
    if (logger) {
      logger.error('Command execution error:', error);
    }

    const errorEmbed = EmbedUtils.internalError(
      'Ocorreu um erro interno. Tente novamente mais tarde.',
    );

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      // If we can't reply, log the error
      if (logger) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  }
}
