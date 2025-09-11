/**
 * 🦅 Hawk Esports - Builder de Embeds Padronizados
 *
 * Este arquivo implementa o sistema de embeds seguindo o guia de identidade visual
 * do Hawk Esports, garantindo consistência e modernidade em todas as mensagens.
 *
 * @version 2.0
 * @author Hawk Esports Development Team
 */

import { EmbedBuilder, User, Guild } from 'discord.js';
import { THEME_COLORS } from '../constants/colors';
import { HAWK_EMOJIS, EmojiUtils } from '../constants/hawk-emojis';

/**
 * Classe principal para criação de embeds padronizados do Hawk Esports
 */
export class HawkEmbedBuilder {
  /**
   * Cria embed base com identidade visual Hawk
   */
  static createBaseEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(THEME_COLORS.HAWK_PRIMARY)
      .setFooter({
        text: '🦅 Hawk Esports • Dominando os Battlegrounds',
        iconURL: 'https://cdn.discordapp.com/icons/guild_id/guild_icon.png', // Substituir pela URL real
      })
      .setTimestamp();
  }

  /**
   * Cria embed de sucesso
   */
  static createSuccessEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.SUCCESS)
      .setTitle(`${HAWK_EMOJIS.SUCCESS} ${title}`)
      .setDescription(description || 'Operação realizada com sucesso!')
      .setFooter({ text: '🦅 Hawk Esports System' });
  }

  /**
   * Cria embed de erro
   */
  static createErrorEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.ERROR)
      .setTitle(`${HAWK_EMOJIS.ERROR} ${title}`)
      .setDescription(description || 'Ocorreu um erro. Tente novamente ou contate o suporte.')
      .setFooter({ text: '🦅 Hawk Esports System' });
  }

  /**
   * Cria embed de aviso
   */
  static createWarningEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.WARNING)
      .setTitle(`${HAWK_EMOJIS.WARNING} ${title}`)
      .setDescription(description || 'Atenção necessária.')
      .setFooter({ text: '🦅 Hawk Esports System' });
  }

  /**
   * Cria embed informativo
   */
  static createInfoEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.INFO)
      .setTitle(`${HAWK_EMOJIS.INFO} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports System' });
  }

  /**
   * Cria embed de carregamento
   */
  static createLoadingEmbed(action: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.INFO)
      .setTitle(`${HAWK_EMOJIS.LOADING} Processando...`)
      .setDescription(`${action} em andamento. Aguarde um momento.`)
      .setFooter({ text: '🦅 Hawk Esports System' });
  }

  /**
   * Alias para createInfoEmbed
   */
  static createInfo(title: string, description?: string, options?: any): EmbedBuilder {
    return this.createInfoEmbed(title, description);
  }

  /**
   * Alias para createSuccessEmbed
   */
  static createSuccess(title: string, description?: string, options?: any): EmbedBuilder {
    return this.createSuccessEmbed(title, description);
  }

  /**
   * Alias para createErrorEmbed
   */
  static createError(title: string, description?: string, options?: any): EmbedBuilder {
    return this.createErrorEmbed(title, description);
  }

  /**
   * Alias para createWarningEmbed
   */
  static createWarning(title: string, description?: string, options?: any): EmbedBuilder {
    return this.createWarningEmbed(title, description);
  }

  // ==================== EMBEDS POR CATEGORIA ====================

  /**
   * Cria embed para sistema PUBG
   */
  static createPUBGEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.PUBG)
      .setTitle(`${HAWK_EMOJIS.PUBG} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports PUBG System' });
  }

  /**
   * Cria embed para rankings
   */
  static createRankingEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.RANKING)
      .setTitle(`${HAWK_EMOJIS.RANKING} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports Ranking System' });
  }

  /**
   * Cria embed para badges com raridade
   */
  static createBadgeEmbed(rarity: string, title: string, description?: string): EmbedBuilder {
    const rarityColors: Record<string, number> = {
      common: THEME_COLORS.COMMON,
      uncommon: THEME_COLORS.UNCOMMON,
      rare: THEME_COLORS.RARE,
      epic: THEME_COLORS.EPIC,
      legendary: THEME_COLORS.LEGENDARY,
      mythic: THEME_COLORS.MYTHIC,
    };

    const rarityEmoji = EmojiUtils.getRarityEmoji(rarity);
    const color = rarityColors[rarity.toLowerCase()] || THEME_COLORS.BADGES;

    return this.createBaseEmbed()
      .setColor(color)
      .setTitle(`${rarityEmoji} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports Badge System' });
  }

  /**
   * Cria embed para perfil de usuário
   */
  static createProfileEmbed(user: User, title?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.PROFILE)
      .setTitle(`${HAWK_EMOJIS.PROFILE} ${title || `Perfil de ${user.displayName}`}`)
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .setFooter({ text: '🦅 Hawk Esports Profile System' });
  }

  /**
   * Cria embed para sistema de música
   */
  static createMusicEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.MUSIC)
      .setTitle(`${HAWK_EMOJIS.MUSIC} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports Music System' });
  }

  /**
   * Cria embed para economia
   */
  static createEconomyEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.ECONOMY)
      .setTitle(`${HAWK_EMOJIS.COIN} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports Economy System' });
  }

  /**
   * Cria embed para tickets
   */
  static createTicketEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.TICKETS)
      .setTitle(`${HAWK_EMOJIS.TICKET} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports Support System' });
  }

  /**
   * Cria embed para administração
   */
  static createAdminEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.ADMIN)
      .setTitle(`${HAWK_EMOJIS.ADMIN} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports Admin System' });
  }

  /**
   * Cria embed para mini-games
   */
  static createGameEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.GAMES)
      .setTitle(`${HAWK_EMOJIS.GAME} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports Gaming System' });
  }

  // ==================== EMBEDS ESPECIAIS ====================

  /**
   * Cria embed premium/VIP
   */
  static createPremiumEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.PREMIUM)
      .setTitle(`${HAWK_EMOJIS.CROWN} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports Premium System' });
  }

  /**
   * Cria embed para eventos
   */
  static createEventEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.EVENT)
      .setTitle(`${HAWK_EMOJIS.EVENT} ${title}`)
      .setDescription(description)
      .setFooter({ text: '🦅 Hawk Esports Events' });
  }

  /**
   * Cria embed para manutenção
   */
  static createMaintenanceEmbed(title: string, description?: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(THEME_COLORS.MAINTENANCE)
      .setTitle(`${HAWK_EMOJIS.SETTINGS} ${title}`)
      .setDescription(description || 'Sistema em manutenção. Voltaremos em breve!')
      .setFooter({ text: '🦅 Hawk Esports Maintenance' });
  }

  // ==================== UTILITÁRIOS RESPONSIVOS ====================

  /**
   * Adapta conteúdo para dispositivos móveis
   */
  static adaptForMobile(content: string, maxLength: number = 1000): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength - 3) + '...';
  }

  /**
   * Cria embed adaptado para mobile
   */
  static createMobileEmbed(title: string, content: string): EmbedBuilder {
    return this.createBaseEmbed()
      .setTitle(this.adaptForMobile(title, 200))
      .setDescription(this.adaptForMobile(content, 800))
      .setFooter({ text: '🦅 Hawk Esports' });
  }

  /**
   * Cria embed com progresso visual
   */
  static createProgressEmbed(
    title: string,
    current: number,
    max: number,
    description?: string
  ): EmbedBuilder {
    const percentage = Math.min((current / max) * 100, 100);
    const progressBar = EmojiUtils.createProgressBar(current, max, 10);

    const progressText = `${description || 'Progresso'}: ${current}/${max} (${percentage.toFixed(1)}%)\n\`${progressBar}\``;

    return this.createBaseEmbed()
      .setTitle(`${HAWK_EMOJIS.CHART} ${title}`)
      .setDescription(progressText)
      .setFooter({ text: '🦅 Hawk Esports Progress System' });
  }

  /**
   * Cria embed de leaderboard
   */
  static createLeaderboardEmbed(
    title: string,
    entries: Array<{ name: string; value: string; position: number }>
  ): EmbedBuilder {
    const embed = this.createRankingEmbed(title);

    entries.forEach((entry, index) => {
      const emoji = EmojiUtils.getRankingEmoji(entry.position);
      embed.addFields({
        name: `${emoji} #${entry.position} ${entry.name}`,
        value: entry.value,
        inline: false,
      });
    });

    return embed;
  }

  /**
   * Cria embed com estatísticas formatadas
   */
  static createStatsEmbed(title: string, stats: Record<string, number>): EmbedBuilder {
    const embed = this.createBaseEmbed()
      .setTitle(`${HAWK_EMOJIS.STATS} ${title}`)
      .setColor(THEME_COLORS.PROFILE);

    Object.entries(stats).forEach(([key, value]) => {
      embed.addFields({
        name: key,
        value: value.toLocaleString(),
        inline: true,
      });
    });

    return embed.setFooter({ text: '🦅 Hawk Esports Statistics' });
  }

  // ==================== EMBEDS DE PAGINAÇÃO ====================

  /**
   * Cria embed paginado
   */
  static createPaginatedEmbed(
    title: string,
    items: string[],
    currentPage: number,
    itemsPerPage: number = 10
  ): EmbedBuilder {
    const totalPages = Math.ceil(items.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = items.slice(startIndex, endIndex);

    const embed = this.createBaseEmbed()
      .setTitle(`${HAWK_EMOJIS.HAWK} ${title}`)
      .setDescription(pageItems.join('\n'))
      .setFooter({
        text: `🦅 Hawk Esports • Página ${currentPage}/${totalPages}`,
      });

    return embed;
  }

  // ==================== EMBEDS DINÂMICOS ====================

  /**
   * Atualiza embed com novo progresso
   */
  static updateEmbedProgress(embed: EmbedBuilder, progress: number): EmbedBuilder {
    const progressBar = EmojiUtils.createProgressBar(progress, 100, 10);
    const currentDescription = embed.data.description || '';

    // Remove barra de progresso anterior se existir
    const newDescription = currentDescription.replace(/Progresso:.*\n`.*`/g, '');

    return embed.setDescription(`${newDescription}\n\nProgresso: ${progress}%\n\`${progressBar}\``);
  }

  /**
   * Adiciona campo de timestamp personalizado
   */
  static addCustomTimestamp(embed: EmbedBuilder, label: string, timestamp: Date): EmbedBuilder {
    return embed.addFields({
      name: `${HAWK_EMOJIS.CLOCK} ${label}`,
      value: `<t:${Math.floor(timestamp.getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  /**
   * Adiciona autor com avatar
   */
  static addAuthor(embed: EmbedBuilder, user: User, prefix?: string): EmbedBuilder {
    return embed.setAuthor({
      name: `${prefix || ''}${user.displayName}`,
      iconURL: user.displayAvatarURL({ size: 64 }),
    });
  }
}

export default HawkEmbedBuilder;
