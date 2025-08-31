import { EmbedBuilder, ColorResolvable, User } from 'discord.js';
import { THEME_COLORS, ColorUtils } from '../constants/colors';

/**
 * Utility class for creating standardized embeds
 * Enhanced with centralized theming and category-specific methods
 */
export class EmbedUtils {
  // Legacy colors for backward compatibility
  private static readonly COLORS = {
    ERROR: THEME_COLORS.ERROR,
    SUCCESS: THEME_COLORS.SUCCESS,
    WARNING: THEME_COLORS.WARNING,
    INFO: THEME_COLORS.INFO,
    PRIMARY: THEME_COLORS.PRIMARY,
  } as const;

  /**
   * Create a standardized error embed
   */
  static createErrorEmbed(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(this.COLORS.ERROR).setTitle(`❌ ${title}`);

    if (description) {
      embed.setDescription(description);
    }

    return embed;
  }

  /**
   * Create a standardized success embed
   */
  static createSuccessEmbed(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(this.COLORS.SUCCESS).setTitle(`✅ ${title}`);

    if (description) {
      embed.setDescription(description);
    }

    return embed;
  }

  /**
   * Create a standardized warning embed
   */
  static createWarningEmbed(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(this.COLORS.WARNING).setTitle(`⚠️ ${title}`);

    if (description) {
      embed.setDescription(description);
    }

    return embed;
  }

  /**
   * Create a standardized info embed
   */
  static createInfoEmbed(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(this.COLORS.INFO).setTitle(`ℹ️ ${title}`);

    if (description) {
      embed.setDescription(description);
    }

    return embed;
  }

  /**
   * Create a custom embed with specified color
   */
  static createCustomEmbed(
    title: string,
    color: ColorResolvable,
    description?: string
  ): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(color).setTitle(title);

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
    ACCESS_DENIED: 'Acesso Negado',
  } as const;

  /**
   * Common success messages
   */
  static readonly COMMON_SUCCESS = {
    OPERATION_COMPLETED: 'Operação Concluída',
    CONFIGURATION_UPDATED: 'Configuração Atualizada',
    DATA_SAVED: 'Dados Salvos',
    PROCESS_COMPLETED: 'Processo Concluído',
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

  /**
   * Category-specific embed creators
   */
  static createCategoryEmbed(
    category: string,
    title: string,
    description?: string
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(ColorUtils.getCategoryColor(category))
      .setTimestamp();

    if (description) {
      embed.setDescription(description);
    }

    return embed;
  }

  static createPUBGEmbed(title: string, description?: string): EmbedBuilder {
    return this.createCategoryEmbed('PUBG', `🎮 ${title}`, description);
  }

  static createMusicEmbed(title: string, description?: string): EmbedBuilder {
    return this.createCategoryEmbed('MUSIC', `🎵 ${title}`, description);
  }

  static createEconomyEmbed(title: string, description?: string): EmbedBuilder {
    return this.createCategoryEmbed('ECONOMY', `💰 ${title}`, description);
  }

  static createAdminEmbed(title: string, description?: string): EmbedBuilder {
    return this.createCategoryEmbed('ADMIN', `🔧 ${title}`, description);
  }

  static createProfileEmbed(title: string, description?: string): EmbedBuilder {
    return this.createCategoryEmbed('PROFILE', `👤 ${title}`, description);
  }

  static createRankingEmbed(title: string, description?: string): EmbedBuilder {
    return this.createCategoryEmbed('RANKING', `📊 ${title}`, description);
  }

  static createBadgeEmbed(title: string, description?: string): EmbedBuilder {
    return this.createCategoryEmbed('BADGES', `🏅 ${title}`, description);
  }

  static createTicketEmbed(title: string, description?: string): EmbedBuilder {
    return this.createCategoryEmbed('TICKETS', `🎫 ${title}`, description);
  }

  /**
   * Rarity-based embed creator
   */
  static createRarityEmbed(
    rarity: string,
    title: string,
    description?: string
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(ColorUtils.getRarityColor(rarity))
      .setTimestamp();

    if (description) {
      embed.setDescription(description);
    }

    return embed;
  }

  /**
   * User profile embed with avatar and standard formatting
   */
  static createUserProfileEmbed(
    user: User,
    title?: string,
    description?: string
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(title || `👤 Perfil de ${user.displayName}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setColor(THEME_COLORS.PROFILE)
      .setTimestamp();

    if (description) {
      embed.setDescription(description);
    }

    return embed;
  }

  /**
   * Loading embed for long operations
   */
  static createLoadingEmbed(message: string = 'Processando...'): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('⏳ Carregando')
      .setDescription(message)
      .setColor(THEME_COLORS.INFO)
      .setTimestamp();
  }

  /**
   * Maintenance embed
   */
  static createMaintenanceEmbed(
    title: string = 'Manutenção em Andamento',
    description?: string
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(`🔧 ${title}`)
      .setDescription(description || 'Este recurso está temporariamente indisponível.')
      .setColor(THEME_COLORS.MAINTENANCE)
      .setTimestamp();
  }

  /**
   * Premium feature embed
   */
  static createPremiumEmbed(
    title: string,
    description?: string
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(`👑 ${title}`)
      .setDescription(description || null)
      .setColor(THEME_COLORS.PREMIUM)
      .setTimestamp();
  }

  /**
   * Event embed
   */
  static createEventEmbed(
    title: string,
    description?: string
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(`🎉 ${title}`)
      .setDescription(description || null)
      .setColor(THEME_COLORS.EVENT)
      .setTimestamp();
  }

  /**
   * Paginated embed with page info
   */
  static createPaginatedEmbed(
    title: string,
    description: string,
    currentPage: number,
    totalPages: number,
    color?: ColorResolvable
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color || THEME_COLORS.INFO)
      .setFooter({ text: `Página ${currentPage} de ${totalPages}` })
      .setTimestamp();
  }

  /**
   * Status embed with dynamic color based on status
   */
  static createStatusEmbed(
    status: string,
    title: string,
    description?: string
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(ColorUtils.getStatusColor(status))
      .setTimestamp();

    if (description) {
      embed.setDescription(description);
    }

    return embed;
  }

  /**
   * Quick embed with just title and description
   */
  static createQuickEmbed(
    title: string,
    description: string,
    color: ColorResolvable = THEME_COLORS.INFO
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();
  }

  /**
   * Utility method to add standard footer
   */
  static addStandardFooter(
    embed: EmbedBuilder,
    text?: string,
    iconURL?: string
  ): EmbedBuilder {
    const footerText = text || 'Hawk Esports Bot';
    return embed.setFooter({ text: footerText, iconURL });
  }

  /**
   * Utility method to add author field
   */
  static addAuthor(
    embed: EmbedBuilder,
    user: User,
    prefix?: string
  ): EmbedBuilder {
    const name = prefix ? `${prefix} ${user.displayName}` : user.displayName;
    return embed.setAuthor({
      name,
      iconURL: user.displayAvatarURL({ size: 64 })
    });
  }
}
