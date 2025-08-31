import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

/**
 * Factory class for creating standardized Discord components
 * Ensures consistency across all bot interactions
 */
export class ComponentFactory {
  /**
   * Navigation Components
   */

  /**
   * Create standard navigation buttons for paginated content
   */
  static createNavigationButtons(
    currentPage: number,
    totalPages: number,
    customIdPrefix: string = 'nav',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_first`)
        .setLabel('⏮️ Primeiro')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_prev`)
        .setLabel('◀️ Anterior')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_home`)
        .setLabel('🏠 Início')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_next`)
        .setLabel('Próximo ▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_last`)
        .setLabel('⏭️ Último')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages),
    );
  }

  /**
   * Create simple navigation buttons (prev/next only)
   */
  static createSimpleNavigation(
    currentPage: number,
    totalPages: number,
    customIdPrefix: string = 'nav',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_prev`)
        .setLabel('◀️ Anterior')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_info`)
        .setLabel(`${currentPage}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_next`)
        .setLabel('Próximo ▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages),
    );
  }

  /**
   * Action Buttons
   */

  /**
   * Create confirmation buttons (Yes/No)
   */
  static createConfirmationButtons(
    customIdPrefix: string = 'confirm',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_yes`)
        .setLabel('✅ Confirmar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_no`)
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Danger),
    );
  }

  /**
   * Create action buttons with custom options
   */
  static createActionButtons(
    actions: Array<{
      id: string;
      label: string;
      emoji?: string;
      style?: ButtonStyle;
      disabled?: boolean;
    }>,
    customIdPrefix: string = 'action',
  ): ActionRowBuilder<ButtonBuilder> {
    const buttons = actions.map(action =>
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_${action.id}`)
        .setLabel(action.emoji ? `${action.emoji} ${action.label}` : action.label)
        .setStyle(action.style || ButtonStyle.Primary)
        .setDisabled(action.disabled || false),
    );

    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5));
  }

  /**
   * Profile action buttons
   */
  static createProfileButtons(
    customIdPrefix: string = 'profile',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_stats`)
        .setLabel('📊 Estatísticas')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_badges`)
        .setLabel('🏅 Badges')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_achievements`)
        .setLabel('🏆 Conquistas')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_compare`)
        .setLabel('⚖️ Comparar')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  /**
   * Music control buttons
   */
  static createMusicControls(
    isPlaying: boolean = false,
    customIdPrefix: string = 'music',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_prev`)
        .setLabel('⏮️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_playpause`)
        .setLabel(isPlaying ? '⏸️' : '▶️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_next`)
        .setLabel('⏭️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_stop`)
        .setLabel('⏹️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}_queue`)
        .setLabel('📋 Fila')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  /**
   * Select Menus
   */

  /**
   * Create category selection menu
   */
  static createCategoryMenu(
    categories: Array<{
      value: string;
      label: string;
      description?: string;
      emoji?: string;
    }>,
    customId: string = 'category_select',
    placeholder: string = '🎯 Escolha uma categoria...',
  ): ActionRowBuilder<StringSelectMenuBuilder> {
    const options = categories.map(cat =>
      new StringSelectMenuOptionBuilder()
        .setValue(cat.value)
        .setLabel(cat.label)
        .setDescription(cat.description || `Comandos de ${cat.label}`)
        .setEmoji(cat.emoji || '📁'),
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(...options.slice(0, 25)); // Discord limit

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  }

  /**
   * Create help command menu
   */
  static createHelpMenu(
    customId: string = 'help_category',
  ): ActionRowBuilder<StringSelectMenuBuilder> {
    const categories = [
      {
        value: 'pubg',
        label: 'PUBG',
        description: 'Comandos relacionados ao PUBG, rankings e estatísticas',
        emoji: '🎮',
      },
      {
        value: 'music',
        label: 'Música',
        description: 'Sistema de música com playlists e controles',
        emoji: '🎵',
      },
      {
        value: 'games',
        label: 'Jogos',
        description: 'Mini-games, quizzes e desafios interativos',
        emoji: '🎯',
      },
      {
        value: 'clips',
        label: 'Clips',
        description: 'Sistema de clips e highlights',
        emoji: '🎬',
      },
      {
        value: 'profile',
        label: 'Perfil',
        description: 'Comandos de perfil e estatísticas pessoais',
        emoji: '👤',
      },
      {
        value: 'admin',
        label: 'Admin',
        description: 'Comandos administrativos (apenas admins)',
        emoji: '🔧',
      },
    ];

    return this.createCategoryMenu(categories, customId, '📚 Selecione uma categoria de ajuda...');
  }

  /**
   * Create ranking type menu
   */
  static createRankingMenu(
    customId: string = 'ranking_type',
  ): ActionRowBuilder<StringSelectMenuBuilder> {
    const rankingTypes = [
      {
        value: 'pubg_daily',
        label: 'PUBG - Diário',
        description: 'Ranking PUBG das últimas 24 horas',
        emoji: '🎮',
      },
      {
        value: 'pubg_weekly',
        label: 'PUBG - Semanal',
        description: 'Ranking PUBG dos últimos 7 dias',
        emoji: '🎮',
      },
      {
        value: 'pubg_monthly',
        label: 'PUBG - Mensal',
        description: 'Ranking PUBG do último mês',
        emoji: '🎮',
      },
      {
        value: 'internal_xp',
        label: 'Interno - XP',
        description: 'Ranking de experiência do servidor',
        emoji: '⭐',
      },
      {
        value: 'internal_coins',
        label: 'Interno - Moedas',
        description: 'Ranking de moedas do servidor',
        emoji: '💰',
      },
      {
        value: 'internal_badges',
        label: 'Interno - Badges',
        description: 'Ranking de badges conquistadas',
        emoji: '🏅',
      },
    ];

    return this.createCategoryMenu(rankingTypes, customId, '📊 Escolha o tipo de ranking...');
  }

  /**
   * Modals
   */

  /**
   * Create feedback modal
   */
  static createFeedbackModal(
    customId: string = 'feedback_modal',
  ): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId(customId)
      .setTitle('💬 Enviar Feedback');

    const titleInput = new TextInputBuilder()
      .setCustomId('feedback_title')
      .setLabel('Título do Feedback')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Resumo do seu feedback...')
      .setRequired(true)
      .setMaxLength(100);

    const messageInput = new TextInputBuilder()
      .setCustomId('feedback_message')
      .setLabel('Mensagem')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Descreva seu feedback detalhadamente...')
      .setRequired(true)
      .setMaxLength(1000);

    const typeInput = new TextInputBuilder()
      .setCustomId('feedback_type')
      .setLabel('Tipo (bug/sugestão/elogio/outro)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('bug')
      .setRequired(false)
      .setMaxLength(20);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput),
    );

    return modal;
  }

  /**
   * Create report modal
   */
  static createReportModal(
    customId: string = 'report_modal',
  ): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId(customId)
      .setTitle('🚨 Reportar Problema');

    const reasonInput = new TextInputBuilder()
      .setCustomId('report_reason')
      .setLabel('Motivo do Report')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Spam, comportamento inadequado, etc.')
      .setRequired(true)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('report_description')
      .setLabel('Descrição Detalhada')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Descreva o problema em detalhes...')
      .setRequired(true)
      .setMaxLength(1000);

    const evidenceInput = new TextInputBuilder()
      .setCustomId('report_evidence')
      .setLabel('Evidências (links, IDs, etc.)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Links para mensagens, IDs de usuários, etc.')
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(evidenceInput),
    );

    return modal;
  }

  /**
   * Utility Methods
   */

  /**
   * Create disabled button (for placeholders)
   */
  static createDisabledButton(
    label: string,
    emoji?: string,
  ): ButtonBuilder {
    return new ButtonBuilder()
      .setCustomId('disabled_placeholder')
      .setLabel(emoji ? `${emoji} ${label}` : label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);
  }

  /**
   * Create link button
   */
  static createLinkButton(
    label: string,
    url: string,
    emoji?: string,
  ): ButtonBuilder {
    const button = new ButtonBuilder()
      .setLabel(emoji ? `${emoji} ${label}` : label)
      .setStyle(ButtonStyle.Link)
      .setURL(url);

    return button;
  }

  /**
   * Create refresh button
   */
  static createRefreshButton(
    customId: string = 'refresh',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel('🔄 Atualizar')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  /**
   * Create close/dismiss button
   */
  static createCloseButton(
    customId: string = 'close',
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel('❌ Fechar')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  /**
   * Combine multiple action rows (max 5 components per row)
   */
  static combineActionRows(
    ...rows: ActionRowBuilder<any>[]
  ): ActionRowBuilder<any>[] {
    return rows.slice(0, 5); // Discord limit of 5 action rows
  }

  /**
   * Create custom select menu with validation
   */
  static createCustomSelectMenu(
    customId: string,
    placeholder: string,
    options: Array<{
      value: string;
      label: string;
      description?: string;
      emoji?: string;
      default?: boolean;
    }>,
    minValues: number = 1,
    maxValues: number = 1,
  ): ActionRowBuilder<StringSelectMenuBuilder> {
    const selectOptions = options.slice(0, 25).map(option =>
      new StringSelectMenuOptionBuilder()
        .setValue(option.value)
        .setLabel(option.label)
        .setDescription(option.description || '')
        .setDefault(option.default || false)
        .setEmoji(option.emoji || ''),
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(minValues)
      .setMaxValues(Math.min(maxValues, options.length))
      .addOptions(...selectOptions);

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  }
}

/**
 * Common component configurations
 */
export const COMPONENT_CONFIGS = {
  TIMEOUTS: {
    SHORT: 30000,    // 30 seconds
    MEDIUM: 300000,  // 5 minutes
    LONG: 900000,    // 15 minutes
  },
  LIMITS: {
    BUTTONS_PER_ROW: 5,
    ACTION_ROWS: 5,
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