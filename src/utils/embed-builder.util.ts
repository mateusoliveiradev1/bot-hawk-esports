import { EmbedBuilder, ColorResolvable } from 'discord.js';

/**
 * Utility class for creating standardized embeds
 */
export class EmbedUtils {
  // Standard colors
  private static readonly COLORS = {
    ERROR: 0xFF0000,
    SUCCESS: 0x00FF00,
    WARNING: 0xFFFF00,
    INFO: 0x0099FF,
    PRIMARY: 0x5865F2
  } as const;

  /**
   * Create a standardized error embed
   */
  static createErrorEmbed(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(this.COLORS.ERROR)
      .setTitle(`❌ ${title}`);
    
    if (description) {
      embed.setDescription(description);
    }
    
    return embed;
  }

  /**
   * Create a standardized success embed
   */
  static createSuccessEmbed(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(this.COLORS.SUCCESS)
      .setTitle(`✅ ${title}`);
    
    if (description) {
      embed.setDescription(description);
    }
    
    return embed;
  }

  /**
   * Create a standardized warning embed
   */
  static createWarningEmbed(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(this.COLORS.WARNING)
      .setTitle(`⚠️ ${title}`);
    
    if (description) {
      embed.setDescription(description);
    }
    
    return embed;
  }

  /**
   * Create a standardized info embed
   */
  static createInfoEmbed(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(this.COLORS.INFO)
      .setTitle(`ℹ️ ${title}`);
    
    if (description) {
      embed.setDescription(description);
    }
    
    return embed;
  }

  /**
   * Create a custom embed with specified color
   */
  static createCustomEmbed(title: string, color: ColorResolvable, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title);
    
    if (description) {
      embed.setDescription(description);
    }
    
    return embed;
  }

  /**
   * Common error messages
   */
  static readonly COMMON_ERRORS = {
    USER_NOT_REGISTERED: 'Usuário Não Registrado',
    USER_NOT_FOUND: 'Usuário não encontrado',
    INTERNAL_ERROR: 'Erro Interno',
    INSUFFICIENT_PERMISSIONS: 'Permissões Insuficientes',
    INVALID_PARAMETERS: 'Parâmetros Inválidos',
    SERVICE_UNAVAILABLE: 'Serviço Indisponível',
    NOT_FOUND: 'Não Encontrado',
    ACCESS_DENIED: 'Acesso Negado'
  } as const;

  /**
   * Common success messages
   */
  static readonly COMMON_SUCCESS = {
    OPERATION_COMPLETED: 'Operação Concluída',
    CONFIGURATION_UPDATED: 'Configuração Atualizada',
    DATA_SAVED: 'Dados Salvos',
    PROCESS_COMPLETED: 'Processo Concluído'
  } as const;

  /**
   * Quick methods for common error embeds
   */
  static userNotRegistered(description?: string): EmbedBuilder {
    return this.createErrorEmbed(this.COMMON_ERRORS.USER_NOT_REGISTERED, description);
  }

  static userNotFound(description?: string): EmbedBuilder {
    return this.createErrorEmbed(this.COMMON_ERRORS.USER_NOT_FOUND, description);
  }

  static internalError(description?: string): EmbedBuilder {
    return this.createErrorEmbed(this.COMMON_ERRORS.INTERNAL_ERROR, description);
  }

  static insufficientPermissions(description?: string): EmbedBuilder {
    return this.createErrorEmbed(this.COMMON_ERRORS.INSUFFICIENT_PERMISSIONS, description);
  }

  static accessDenied(description?: string): EmbedBuilder {
    return this.createErrorEmbed(this.COMMON_ERRORS.ACCESS_DENIED, description);
  }

  static serviceUnavailable(description?: string): EmbedBuilder {
    return this.createErrorEmbed(this.COMMON_ERRORS.SERVICE_UNAVAILABLE, description);
  }

  /**
   * Quick methods for common success embeds
   */
  static operationCompleted(description?: string): EmbedBuilder {
    return this.createSuccessEmbed(this.COMMON_SUCCESS.OPERATION_COMPLETED, description);
  }

  static configurationUpdated(description?: string): EmbedBuilder {
    return this.createSuccessEmbed(this.COMMON_SUCCESS.CONFIGURATION_UPDATED, description);
  }
}