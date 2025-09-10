import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  Message,
  CommandInteraction,
  ButtonInteraction,
  User,
  InteractionCollector,
  MessageFlags,
} from 'discord.js';
import { ComponentFactory } from './component-factory';
import { EmbedUtils } from './embed-builder.util';

/**
 * Interface for paginated data
 */
export interface PaginatedData<T = any> {
  items: T[];
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
  totalPages: number;
}

/**
 * Interface for pagination options
 */
export interface PaginationOptions {
  /** Items per page (default: 10) */
  itemsPerPage?: number;
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
  /** Custom ID prefix for buttons */
  customIdPrefix?: string;
  /** Whether to show page numbers */
  showPageNumbers?: boolean;
  /** Whether to show navigation buttons */
  showNavigation?: boolean;
  /** Whether to use simple navigation (prev/next only) */
  simpleNavigation?: boolean;
  /** Custom footer text */
  footerText?: string;
  /** Whether only the command author can interact */
  authorOnly?: boolean;
}

/**
 * Interface for embed generator function
 */
export interface EmbedGenerator<T = any> {
  (data: PaginatedData<T>, options?: any): EmbedBuilder;
}

/**
 * Utility class for handling pagination in Discord embeds
 */
export class PaginationUtil {
  /**
   * Create paginated data from an array
   */
  static createPaginatedData<T>(
    items: T[],
    currentPage: number = 1,
    itemsPerPage: number = 10,
  ): PaginatedData<T> {
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const validPage = Math.max(1, Math.min(currentPage, totalPages));

    const startIndex = (validPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = items.slice(startIndex, endIndex);

    return {
      items: pageItems,
      totalItems,
      itemsPerPage,
      currentPage: validPage,
      totalPages,
    };
  }

  /**
   * Create a paginated embed with navigation
   */
  static async createPaginatedEmbed<T>(
    interaction: CommandInteraction,
    allItems: T[],
    embedGenerator: EmbedGenerator<T>,
    options: PaginationOptions = {},
  ): Promise<void> {
    const {
      itemsPerPage = 10,
      timeout = 300000, // 5 minutes
      customIdPrefix = 'pagination',
      showPageNumbers = true,
      showNavigation = true,
      simpleNavigation = false,
      footerText,
      authorOnly = true,
    } = options;

    if (allItems.length === 0) {
      const emptyEmbed = EmbedUtils.createInfoEmbed(
        'Nenhum item encontrado',
        'Não há itens para exibir.',
      );
      await interaction.reply({ embeds: [emptyEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    let currentPage = 1;
    const totalPages = Math.ceil(allItems.length / itemsPerPage);

    // Generate initial embed and components
    const generateResponse = (page: number) => {
      const paginatedData = this.createPaginatedData(allItems, page, itemsPerPage);
      const embed = embedGenerator(paginatedData);

      // Add pagination info to footer
      if (showPageNumbers) {
        const pageInfo = `Página ${page}/${totalPages}`;
        const currentFooter = embed.data.footer?.text;
        const newFooter = footerText
          ? `${footerText} • ${pageInfo}`
          : currentFooter
            ? `${currentFooter} • ${pageInfo}`
            : pageInfo;
        embed.setFooter({ text: newFooter });
      }

      const components = [];

      if (showNavigation && totalPages > 1) {
        if (simpleNavigation) {
          components.push(
            ComponentFactory.createSimpleNavigation(page, totalPages, customIdPrefix),
          );
        } else {
          components.push(
            ComponentFactory.createNavigationButtons(page, totalPages, customIdPrefix),
          );
        }
      }

      return { embeds: [embed], components };
    };

    // Send initial response
    const response = generateResponse(currentPage);
    const message = (await interaction.reply({ ...response, fetchReply: true })) as Message;

    // If only one page, no need for collector
    if (totalPages <= 1) {
      return;
    }

    // Create button collector
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: timeout,
      filter: i => {
        if (authorOnly && i.user.id !== interaction.user.id) {
          i.reply({
            content: '❌ Apenas quem executou o comando pode navegar pelas páginas.',
            flags: MessageFlags.Ephemeral,
          });
          return false;
        }
        return i.customId.startsWith(customIdPrefix);
      },
    });

    collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
      const action = buttonInteraction.customId.split('_')[1];

      switch (action) {
        case 'first':
          currentPage = 1;
          break;
        case 'prev':
          currentPage = Math.max(1, currentPage - 1);
          break;
        case 'home':
        case 'info':
          // Do nothing, just acknowledge
          break;
        case 'next':
          currentPage = Math.min(totalPages, currentPage + 1);
          break;
        case 'last':
          currentPage = totalPages;
          break;
        default:
          return;
      }

      const newResponse = generateResponse(currentPage);
      await buttonInteraction.update(newResponse);
    });

    collector.on('end', async () => {
      try {
        // Disable all buttons when collector ends
        const finalResponse = generateResponse(currentPage);
        finalResponse.components = finalResponse.components.map(row => {
          const actionRow = row as ActionRowBuilder<ButtonBuilder>;
          actionRow.components.forEach(component => {
            if (component instanceof ButtonBuilder) {
              component.setDisabled(true);
            }
          });
          return actionRow;
        });

        await message.edit(finalResponse);
      } catch (error) {
        // Message might have been deleted
        console.error('Error disabling pagination buttons:', error);
      }
    });
  }

  /**
   * Create a simple paginated list embed
   */
  static async createSimpleList(
    interaction: CommandInteraction,
    title: string,
    items: string[],
    options: PaginationOptions & {
      description?: string;
      color?: number;
      thumbnail?: string;
      itemFormatter?: (item: string, index: number) => string;
    } = {},
  ): Promise<void> {
    const {
      description,
      color,
      thumbnail,
      itemFormatter = (item, index) => `${index + 1}. ${item}`,
      ...paginationOptions
    } = options;

    const embedGenerator: EmbedGenerator<string> = data => {
      const embed = new EmbedBuilder().setTitle(title).setColor(color || 0x3498db);

      if (description) {
        embed.setDescription(description);
      }

      if (thumbnail) {
        embed.setThumbnail(thumbnail);
      }

      if (data.items.length > 0) {
        const startIndex = (data.currentPage - 1) * data.itemsPerPage;
        const formattedItems = data.items
          .map((item, index) => itemFormatter(item, startIndex + index))
          .join('\n');

        embed.addFields({
          name: `📋 Lista (${data.totalItems} itens)`,
          value: formattedItems || 'Nenhum item encontrado',
        });
      }

      return embed;
    };

    await this.createPaginatedEmbed(interaction, items, embedGenerator, paginationOptions);
  }

  /**
   * Create a paginated ranking embed
   */
  static async createRankingList(
    interaction: CommandInteraction,
    title: string,
    rankings: Array<{
      position: number;
      name: string;
      value: string | number;
      extra?: string;
    }>,
    options: PaginationOptions & {
      description?: string;
      color?: number;
      thumbnail?: string;
      valueLabel?: string;
    } = {},
  ): Promise<void> {
    const { description, color, thumbnail, valueLabel = 'Pontos', ...paginationOptions } = options;

    const embedGenerator: EmbedGenerator<(typeof rankings)[0]> = data => {
      const embed = new EmbedBuilder().setTitle(title).setColor(color || 0xf39c12);

      if (description) {
        embed.setDescription(description);
      }

      if (thumbnail) {
        embed.setThumbnail(thumbnail);
      }

      if (data.items.length > 0) {
        const rankingText = data.items
          .map(item => {
            const medal = this.getRankingMedal(item.position);
            const extra = item.extra ? ` • ${item.extra}` : '';
            return `${medal} **${item.position}º** ${item.name}\n└ ${valueLabel}: **${item.value}**${extra}`;
          })
          .join('\n\n');

        embed.addFields({
          name: `🏆 Ranking (${data.totalItems} participantes)`,
          value: rankingText,
        });
      }

      return embed;
    };

    await this.createPaginatedEmbed(interaction, rankings, embedGenerator, paginationOptions);
  }

  /**
   * Create a paginated stats embed
   */
  static async createStatsGrid(
    interaction: CommandInteraction,
    title: string,
    stats: Array<{
      name: string;
      value: string;
      inline?: boolean;
    }>,
    options: PaginationOptions & {
      description?: string;
      color?: number;
      thumbnail?: string;
      fieldsPerPage?: number;
    } = {},
  ): Promise<void> {
    const { description, color, thumbnail, fieldsPerPage = 6, ...paginationOptions } = options;

    // Override itemsPerPage for fields
    paginationOptions.itemsPerPage = fieldsPerPage;

    const embedGenerator: EmbedGenerator<(typeof stats)[0]> = data => {
      const embed = new EmbedBuilder().setTitle(title).setColor(color || 0x9b59b6);

      if (description) {
        embed.setDescription(description);
      }

      if (thumbnail) {
        embed.setThumbnail(thumbnail);
      }

      if (data.items.length > 0) {
        data.items.forEach(stat => {
          embed.addFields({
            name: stat.name,
            value: stat.value,
            inline: stat.inline !== false, // Default to true
          });
        });
      }

      return embed;
    };

    await this.createPaginatedEmbed(interaction, stats, embedGenerator, paginationOptions);
  }

  /**
   * Get ranking medal emoji based on position
   */
  private static getRankingMedal(position: number): string {
    switch (position) {
      case 1:
        return '🥇';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      case 4:
      case 5:
        return '🏅';
      default:
        return '▫️';
    }
  }

  /**
   * Create paginated embed for search results
   */
  static async createSearchResults<T>(
    interaction: CommandInteraction,
    query: string,
    results: T[],
    embedGenerator: EmbedGenerator<T>,
    options: PaginationOptions = {},
  ): Promise<void> {
    if (results.length === 0) {
      const noResultsEmbed = EmbedUtils.createWarningEmbed(
        'Nenhum resultado encontrado',
        `Não foram encontrados resultados para: **${query}**`,
      );
      await interaction.reply({ embeds: [noResultsEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    const enhancedEmbedGenerator: EmbedGenerator<T> = data => {
      const embed = embedGenerator(data);

      // Add search info to description
      const currentDescription = embed.data.description || '';
      const searchInfo = `🔍 Resultados para: **${query}** (${data.totalItems} encontrados)`;
      const newDescription = currentDescription
        ? `${searchInfo}\n\n${currentDescription}`
        : searchInfo;

      embed.setDescription(newDescription);
      return embed;
    };

    await this.createPaginatedEmbed(interaction, results, enhancedEmbedGenerator, {
      ...options,
      footerText: options.footerText || `Busca: ${query}`,
    });
  }

  /**
   * Utility method to chunk array into pages
   */
  static chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Calculate pagination info
   */
  static calculatePagination(
    totalItems: number,
    currentPage: number,
    itemsPerPage: number,
  ): {
    totalPages: number;
    startIndex: number;
    endIndex: number;
    hasNext: boolean;
    hasPrev: boolean;
  } {
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const validPage = Math.max(1, Math.min(currentPage, totalPages));
    const startIndex = (validPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

    return {
      totalPages,
      startIndex,
      endIndex,
      hasNext: validPage < totalPages,
      hasPrev: validPage > 1,
    };
  }
}

/**
 * Common pagination configurations
 */
export const PAGINATION_CONFIGS = {
  ITEMS_PER_PAGE: {
    SMALL: 5,
    MEDIUM: 10,
    LARGE: 15,
    EXTRA_LARGE: 20,
  },
  TIMEOUTS: {
    SHORT: 60000, // 1 minute
    MEDIUM: 300000, // 5 minutes
    LONG: 900000, // 15 minutes
  },
  STYLES: {
    SIMPLE: { simpleNavigation: true, showPageNumbers: true },
    FULL: { simpleNavigation: false, showPageNumbers: true },
    MINIMAL: { simpleNavigation: true, showPageNumbers: false },
  },
} as const;
