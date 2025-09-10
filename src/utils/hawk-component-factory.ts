/**
 * 🦅 Hawk Esports - Factory de Componentes Interativos
 *
 * Este arquivo implementa a criação padronizada de botões, menus e modais
 * seguindo o guia de identidade visual do Hawk Esports.
 *
 * @version 2.0
 * @author Hawk Esports Development Team
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} from 'discord.js';
import { HAWK_EMOJIS, EMOJI_CONTEXTS } from '../constants/hawk-emojis.js';

/**
 * Configurações padrão para componentes
 */
export const HAWK_COMPONENT_CONFIG = {
  TIMEOUTS: {
    NAVIGATION: 300000, // 5 minutos
    INTERACTION: 180000, // 3 minutos
    QUICK_ACTION: 60000, // 1 minuto
  },
  LIMITS: {
    BUTTONS_PER_ROW: 5,
    ROWS_PER_MESSAGE: 5,
    SELECT_OPTIONS: 25,
  },
  STYLES: {
    PRIMARY: ButtonStyle.Primary,
    SECONDARY: ButtonStyle.Secondary,
    SUCCESS: ButtonStyle.Success,
    DANGER: ButtonStyle.Danger,
    LINK: ButtonStyle.Link,
  },
} as const;

/**
 * Factory principal para componentes do Hawk Esports
 */
export class HawkComponentFactory {
  // ==================== BOTÕES BÁSICOS ====================

  /**
   * Cria um botão personalizado
   */
  static createButton(options: {
    id?: string;
    customId?: string;
    label: string;
    style?: ButtonStyle;
    emoji?: string;
    disabled?: boolean;
    url?: string;
  }): ButtonBuilder {
    const button = new ButtonBuilder()
      .setLabel(options.label)
      .setStyle(options.style || ButtonStyle.Secondary);

    const customId = options.id || options.customId;
    if (customId) {
      button.setCustomId(customId);
    }

    if (options.url) {
      button.setURL(options.url).setStyle(ButtonStyle.Link);
    }

    if (options.emoji) {
      button.setEmoji(options.emoji);
    }

    if (options.disabled) {
      button.setDisabled(true);
    }

    return button;
  }

  /**
   * Cria uma linha de botões
   */
  static createButtonRow(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  }

  /**
   * Cria uma linha de ação (alias para createButtonRow)
   */
  static createActionRow(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  }

  // ==================== BOTÕES DE NAVEGAÇÃO ====================

  /**
   * Cria botões de navegação completos do Hawk
   */
  static createHawkNavigation(
    currentPage: number,
    totalPages: number,
    customId: string = 'hawk_nav',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${customId}_first`)
        .setEmoji(EMOJI_CONTEXTS.NAVIGATION.first)
        .setLabel('Primeiro')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId(`${customId}_prev`)
        .setEmoji(EMOJI_CONTEXTS.NAVIGATION.previous)
        .setLabel('Anterior')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId(`${customId}_home`)
        .setEmoji(EMOJI_CONTEXTS.NAVIGATION.home)
        .setLabel('Hawk Home')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.PRIMARY),
      new ButtonBuilder()
        .setCustomId(`${customId}_next`)
        .setEmoji(EMOJI_CONTEXTS.NAVIGATION.next)
        .setLabel('Próximo')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY)
        .setDisabled(currentPage === totalPages),
      new ButtonBuilder()
        .setCustomId(`${customId}_last`)
        .setEmoji('⏭️')
        .setLabel('Último')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY)
        .setDisabled(currentPage === totalPages),
    );
  }

  /**
   * Cria navegação simples (anterior/próximo)
   */
  static createSimpleNavigation(
    currentPage: number,
    totalPages: number,
    customId: string = 'simple_nav',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${customId}_prev`)
        .setEmoji(HAWK_EMOJIS.PREV)
        .setLabel('Anterior')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId(`${customId}_home`)
        .setEmoji(HAWK_EMOJIS.HAWK)
        .setLabel('Hawk')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.PRIMARY),
      new ButtonBuilder()
        .setCustomId(`${customId}_next`)
        .setEmoji(HAWK_EMOJIS.NEXT)
        .setLabel('Próximo')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY)
        .setDisabled(currentPage === totalPages),
    );
  }

  // ==================== BOTÕES DE AÇÃO PRINCIPAL ====================

  /**
   * Cria botões principais do Hawk Esports
   */
  static createHawkMainActions(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('hawk_profile')
        .setEmoji(EMOJI_CONTEXTS.MAIN_ACTIONS.profile)
        .setLabel('Meu Perfil')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.PRIMARY),
      new ButtonBuilder()
        .setCustomId('hawk_ranking')
        .setEmoji(EMOJI_CONTEXTS.MAIN_ACTIONS.ranking)
        .setLabel('Rankings')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
      new ButtonBuilder()
        .setCustomId('hawk_badges')
        .setEmoji(EMOJI_CONTEXTS.MAIN_ACTIONS.badges)
        .setLabel('Badges')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
      new ButtonBuilder()
        .setCustomId('hawk_stats')
        .setEmoji(HAWK_EMOJIS.STATS)
        .setLabel('Estatísticas')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
    );
  }

  /**
   * Cria botões de confirmação
   */
  static createConfirmationButtons(
    confirmId: string = 'confirm',
    cancelId: string = 'cancel',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setEmoji(HAWK_EMOJIS.SUCCESS)
        .setLabel('Confirmar')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SUCCESS),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setEmoji(HAWK_EMOJIS.ERROR)
        .setLabel('Cancelar')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.DANGER),
    );
  }

  /**
   * Cria botões de ação personalizados
   */
  static createActionButtons(
    actions: Array<{
      id: string;
      emoji: string;
      label: string;
      style?: ButtonStyle;
      disabled?: boolean;
    }>,
  ): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    actions.slice(0, HAWK_COMPONENT_CONFIG.LIMITS.BUTTONS_PER_ROW).forEach(action => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(action.id)
          .setEmoji(action.emoji)
          .setLabel(action.label)
          .setStyle(action.style || HAWK_COMPONENT_CONFIG.STYLES.SECONDARY)
          .setDisabled(action.disabled || false),
      );
    });

    return row;
  }

  // ==================== CONTROLES DE MÚSICA ====================

  /**
   * Cria controles de música do Hawk
   */
  static createMusicControls(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('music_previous')
        .setEmoji(EMOJI_CONTEXTS.MUSIC_CONTROLS.previous)
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
      new ButtonBuilder()
        .setCustomId('music_play_pause')
        .setEmoji(EMOJI_CONTEXTS.MUSIC_CONTROLS.play)
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.PRIMARY),
      new ButtonBuilder()
        .setCustomId('music_stop')
        .setEmoji(EMOJI_CONTEXTS.MUSIC_CONTROLS.stop)
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.DANGER),
      new ButtonBuilder()
        .setCustomId('music_skip')
        .setEmoji(EMOJI_CONTEXTS.MUSIC_CONTROLS.skip)
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
      new ButtonBuilder()
        .setCustomId('music_shuffle')
        .setEmoji(EMOJI_CONTEXTS.MUSIC_CONTROLS.shuffle)
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
    );
  }

  /**
   * Cria controles de volume
   */
  static createVolumeControls(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('volume_down')
        .setEmoji(HAWK_EMOJIS.VOLUME_DOWN)
        .setLabel('Volume -')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
      new ButtonBuilder()
        .setCustomId('volume_mute')
        .setEmoji(HAWK_EMOJIS.MUTE)
        .setLabel('Mudo')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
      new ButtonBuilder()
        .setCustomId('volume_up')
        .setEmoji(HAWK_EMOJIS.VOLUME_UP)
        .setLabel('Volume +')
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
    );
  }

  // ==================== MENUS SUSPENSOS ====================

  /**
   * Cria menu principal do Hawk Esports
   */
  static createHawkMainMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('hawk_main_menu')
        .setPlaceholder('🦅 Escolha uma opção do Hawk Esports')
        .addOptions([
          {
            label: 'PUBG System',
            description: 'Rankings, estatísticas e dados PUBG',
            value: 'pubg',
            emoji: '🎮',
          },
          {
            label: 'Meu Perfil',
            description: 'Visualizar perfil e conquistas',
            value: 'profile',
            emoji: HAWK_EMOJIS.PROFILE,
          },
          {
            label: 'Rankings',
            description: 'Leaderboards e classificações',
            value: 'ranking',
            emoji: '🏆',
          },
          {
            label: 'Sistema de Badges',
            description: 'Conquistas e recompensas',
            value: 'badges',
            emoji: '🏅',
          },
          {
            label: 'Música',
            description: 'Player de música e playlists',
            value: 'music',
            emoji: HAWK_EMOJIS.MUSIC,
          },
        ]),
    );
  }

  /**
   * Cria menu de categorias
   */
  static createCategoryMenu(
    categories: Array<{
      label: string;
      description: string;
      value: string;
      emoji?: string;
    }>,
    placeholder: string = 'Selecione uma categoria',
  ): ActionRowBuilder<StringSelectMenuBuilder> {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('category_menu')
        .setPlaceholder(`${HAWK_EMOJIS.HAWK} ${placeholder}`)
        .addOptions(
          categories.slice(0, HAWK_COMPONENT_CONFIG.LIMITS.SELECT_OPTIONS).map(cat => ({
            label: cat.label,
            description: cat.description,
            value: cat.value,
            emoji: cat.emoji,
          })),
        ),
    );
  }

  /**
   * Cria menu de ranking
   */
  static createRankingMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ranking_menu')
        .setPlaceholder('🏆 Escolha um tipo de ranking')
        .addOptions([
          {
            label: 'Ranking Geral',
            description: 'Classificação geral de todos os jogadores',
            value: 'general',
            emoji: '🏆',
          },
          {
            label: 'Ranking PUBG',
            description: 'Melhores jogadores de PUBG',
            value: 'pubg',
            emoji: '🎮',
          },
          {
            label: 'Ranking de Badges',
            description: 'Jogadores com mais conquistas',
            value: 'badges',
            emoji: HAWK_EMOJIS.BADGE,
          },
          {
            label: 'Ranking Semanal',
            description: 'Melhores da semana',
            value: 'weekly',
            emoji: '📅',
          },
          {
            label: 'Ranking Mensal',
            description: 'Melhores do mês',
            value: 'monthly',
            emoji: '⭐',
          },
        ]),
    );
  }

  // ==================== MODAIS ====================

  /**
   * Cria modal de feedback
   */
  static createFeedbackModal(): ModalBuilder {
    return new ModalBuilder()
      .setCustomId('hawk_feedback_modal')
      .setTitle('🦅 Hawk Esports - Feedback')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('feedback_title')
            .setLabel('Título do Feedback')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Descreva brevemente seu feedback')
            .setRequired(true)
            .setMaxLength(100),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('feedback_description')
            .setLabel('Descrição Detalhada')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Descreva detalhadamente sua sugestão, problema ou elogio')
            .setRequired(true)
            .setMaxLength(1000),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('feedback_category')
            .setLabel('Categoria')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: PUBG, Música, Badges, Geral')
            .setRequired(false)
            .setMaxLength(50),
        ),
      );
  }

  /**
   * Cria modal de report
   */
  static createReportModal(): ModalBuilder {
    return new ModalBuilder()
      .setCustomId('hawk_report_modal')
      .setTitle('🦅 Hawk Esports - Reportar Problema')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('report_type')
            .setLabel('Tipo do Problema')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Bug, Erro, Comportamento inadequado')
            .setRequired(true)
            .setMaxLength(50),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('report_description')
            .setLabel('Descrição do Problema')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Descreva o problema em detalhes, incluindo quando ocorreu')
            .setRequired(true)
            .setMaxLength(1000),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('report_steps')
            .setLabel('Passos para Reproduzir (Opcional)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Como reproduzir o problema? Que comandos foram usados?')
            .setRequired(false)
            .setMaxLength(500),
        ),
      );
  }

  // ==================== BOTÕES UTILITÁRIOS ====================

  /**
   * Cria botão desabilitado
   */
  static createDisabledButton(label: string, emoji?: string): ButtonBuilder {
    const button = new ButtonBuilder()
      .setCustomId('disabled_button')
      .setLabel(label)
      .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY)
      .setDisabled(true);

    if (emoji) {
      button.setEmoji(emoji);
    }
    return button;
  }

  /**
   * Cria botão de link
   */
  static createLinkButton(label: string, url: string, emoji?: string): ButtonBuilder {
    const button = new ButtonBuilder()
      .setLabel(label)
      .setURL(url)
      .setStyle(HAWK_COMPONENT_CONFIG.STYLES.LINK);

    if (emoji) {
      button.setEmoji(emoji);
    }
    return button;
  }

  /**
   * Cria botão de refresh
   */
  static createRefreshButton(customId: string = 'refresh'): ButtonBuilder {
    return new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji(HAWK_EMOJIS.REFRESH)
      .setLabel('Atualizar')
      .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY);
  }

  /**
   * Cria botão de fechar
   */
  static createCloseButton(customId: string = 'close'): ButtonBuilder {
    return new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji(HAWK_EMOJIS.ERROR)
      .setLabel('Fechar')
      .setStyle(HAWK_COMPONENT_CONFIG.STYLES.DANGER);
  }

  // ==================== UTILITÁRIOS ====================

  /**
   * Combina múltiplas action rows
   */
  static combineActionRows(...rows: ActionRowBuilder<any>[]): ActionRowBuilder<any>[] {
    return rows.slice(0, HAWK_COMPONENT_CONFIG.LIMITS.ROWS_PER_MESSAGE);
  }

  /**
   * Cria botões responsivos para mobile
   */
  static createMobileButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('hawk_mobile_profile')
        .setEmoji(HAWK_EMOJIS.PROFILE)
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.PRIMARY),
      new ButtonBuilder()
        .setCustomId('hawk_mobile_rank')
        .setEmoji(HAWK_EMOJIS.TROPHY)
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
      new ButtonBuilder()
        .setCustomId('hawk_mobile_badges')
        .setEmoji(HAWK_EMOJIS.BADGE)
        .setStyle(HAWK_COMPONENT_CONFIG.STYLES.SECONDARY),
    );
  }

  /**
   * Verifica se o componente está dentro dos limites
   */
  static validateComponentLimits(components: ActionRowBuilder<any>[]): boolean {
    if (components.length > HAWK_COMPONENT_CONFIG.LIMITS.ROWS_PER_MESSAGE) {
      return false;
    }

    return components.every(row => {
      return row.components.length <= HAWK_COMPONENT_CONFIG.LIMITS.BUTTONS_PER_ROW;
    });
  }
}

export default HawkComponentFactory;
