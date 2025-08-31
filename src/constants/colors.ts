/**
 * Centralized color constants for consistent theming across the bot
 * Based on UI/UX audit findings and Discord.js ColorResolvable format
 */

export const THEME_COLORS = {
  // 🦅 Cores da Marca Hawk Esports
  HAWK_PRIMARY: 0x9B59B6,    // Roxo Hawk - Cor principal da marca
  HAWK_SECONDARY: 0x3498DB,  // Azul Hawk - Cor secundária
  HAWK_ACCENT: 0x00D4AA,     // Verde Hawk - Destaque e sucesso
  
  // Estados do sistema
  ERROR: 0xE74C3C,           // Vermelho - Erros, falhas
  SUCCESS: 0x2ECC71,         // Verde - Sucessos, confirmações
  WARNING: 0xF39C12,         // Laranja - Avisos, atenção
  INFO: 0x3498DB,            // Azul - Informações gerais
  PRIMARY: 0x9B59B6,         // Roxo Hawk - Ações primárias
  
  // Categorias funcionais
  PUBG: 0x9B59B6,            // Roxo - Sistema PUBG (Hawk Primary)
  MUSIC: 0x1DB954,           // Verde Spotify - Sistema de música
  ECONOMY: 0xF39C12,         // Dourado - Economia e moedas
  ADMIN: 0xE74C3C,           // Vermelho - Comandos administrativos
  PROFILE: 0x3498DB,         // Azul - Perfis e estatísticas
  GENERAL: 0x9B59B6,         // Roxo Hawk - Comandos gerais
  GAMES: 0xFF6B35,           // Laranja - Mini-games
  TICKETS: 0x2ECC71,         // Verde - Sistema de tickets
  BADGES: 0xF1C40F,          // Ouro - Badges e conquistas
  RANKING: 0x8E44AD,         // Roxo escuro - Rankings

  // Raridades (Badges/Items)
  COMMON: 0x95A5A6,          // Cinza - Comum
  UNCOMMON: 0x2ECC71,        // Verde - Incomum
  RARE: 0x3498DB,            // Azul - Raro
  EPIC: 0x9B59B6,            // Roxo - Épico (Hawk Primary)
  LEGENDARY: 0xF39C12,       // Dourado - Lendário
  MYTHIC: 0xE74C3C,          // Vermelho - Mítico

  // Estados de usuário
  ONLINE: 0x2ECC71,          // Verde - Online
  OFFLINE: 0x95A5A6,         // Cinza - Offline
  IDLE: 0xF39C12,            // Laranja - Ausente
  DND: 0xE74C3C,             // Vermelho - Não perturbe

  // Cores especiais
  PREMIUM: 0xF1C40F,         // Ouro - Recursos premium
  BOOST: 0xFF69B4,           // Rosa - Boosts do servidor
  EVENT: 0x9B59B6,           // Roxo - Eventos especiais
  MAINTENANCE: 0x95A5A6,     // Cinza - Modo manutenção
} as const;

/**
 * Color utility functions for dynamic color selection
 */
export class ColorUtils {
  /**
   * Get color by category name
   */
  static getCategoryColor(category: string): number {
    const categoryMap: Record<string, number> = {
      'PUBG': THEME_COLORS.PUBG,
      'MUSIC': THEME_COLORS.MUSIC,
      'ECONOMY': THEME_COLORS.ECONOMY,
      'ADMIN': THEME_COLORS.ADMIN,
      'PROFILE': THEME_COLORS.PROFILE,
      'GENERAL': THEME_COLORS.GENERAL,
      'GAMES': THEME_COLORS.GAMES,
      'TICKETS': THEME_COLORS.TICKETS,
      'BADGES': THEME_COLORS.BADGES,
      'RANKING': THEME_COLORS.RANKING,
    };

    return categoryMap[category.toUpperCase()] || THEME_COLORS.INFO;
  }

  /**
   * Get color by rarity level
   */
  static getRarityColor(rarity: string): number {
    const rarityMap: Record<string, number> = {
      'COMMON': THEME_COLORS.COMMON,
      'UNCOMMON': THEME_COLORS.UNCOMMON,
      'RARE': THEME_COLORS.RARE,
      'EPIC': THEME_COLORS.EPIC,
      'LEGENDARY': THEME_COLORS.LEGENDARY,
      'MYTHIC': THEME_COLORS.MYTHIC,
    };

    return rarityMap[rarity.toUpperCase()] || THEME_COLORS.COMMON;
  }

  /**
   * Get color by status
   */
  static getStatusColor(status: string): number {
    const statusMap: Record<string, number> = {
      'ONLINE': THEME_COLORS.ONLINE,
      'OFFLINE': THEME_COLORS.OFFLINE,
      'IDLE': THEME_COLORS.IDLE,
      'DND': THEME_COLORS.DND,
      'AVAILABLE': THEME_COLORS.ONLINE,
      'UNAVAILABLE': THEME_COLORS.OFFLINE,
      'ACTIVE': THEME_COLORS.ONLINE,
      'INACTIVE': THEME_COLORS.OFFLINE,
    };

    return statusMap[status.toUpperCase()] || THEME_COLORS.INFO;
  }

  /**
   * Get random color from a specific palette
   */
  static getRandomColor(palette: 'category' | 'rarity' | 'status' = 'category'): number {
    let colors: number[];

    switch (palette) {
      case 'category':
        colors = [
          THEME_COLORS.PUBG,
          THEME_COLORS.MUSIC,
          THEME_COLORS.ECONOMY,
          THEME_COLORS.ADMIN,
          THEME_COLORS.PROFILE,
          THEME_COLORS.GENERAL,
        ];
        break;
      case 'rarity':
        colors = [
          THEME_COLORS.COMMON,
          THEME_COLORS.UNCOMMON,
          THEME_COLORS.RARE,
          THEME_COLORS.EPIC,
          THEME_COLORS.LEGENDARY,
          THEME_COLORS.MYTHIC,
        ];
        break;
      case 'status':
        colors = [
          THEME_COLORS.ONLINE,
          THEME_COLORS.OFFLINE,
          THEME_COLORS.IDLE,
          THEME_COLORS.DND,
        ];
        break;
      default:
        colors = [THEME_COLORS.INFO];
    }

    return colors[Math.floor(Math.random() * colors.length)] || 0x000000;
  }

  /**
   * Convert hex color to decimal (for cases where hex is preferred)
   */
  static hexToDecimal(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
  }

  /**
   * Convert decimal to hex color
   */
  static decimalToHex(decimal: number): string {
    return `#${decimal.toString(16).toUpperCase().padStart(6, '0')}`;
  }

  /**
   * Get complementary color (opposite on color wheel)
   */
  static getComplementaryColor(color: number): number {
    const hex = color.toString(16).padStart(6, '0');
    const r = 255 - parseInt(hex.substr(0, 2), 16);
    const g = 255 - parseInt(hex.substr(2, 2), 16);
    const b = 255 - parseInt(hex.substr(4, 2), 16);
    return (r << 16) | (g << 8) | b;
  }
}

/**
 * Predefined color schemes for common use cases
 */
export const COLOR_SCHEMES = {
  // 🦅 Esquema da Marca Hawk
  HAWK_BRAND: {
    primary: THEME_COLORS.HAWK_PRIMARY,
    secondary: THEME_COLORS.HAWK_SECONDARY,
    accent: THEME_COLORS.HAWK_ACCENT,
  },
  
  // Esquemas Funcionais
  DEFAULT: {
    primary: THEME_COLORS.HAWK_PRIMARY,
    secondary: THEME_COLORS.HAWK_SECONDARY,
    accent: THEME_COLORS.HAWK_ACCENT,
  },
  SUCCESS_SCHEME: {
    primary: THEME_COLORS.SUCCESS,
    secondary: THEME_COLORS.HAWK_ACCENT,
    accent: THEME_COLORS.UNCOMMON,
  },
  ERROR_SCHEME: {
    primary: THEME_COLORS.ERROR,
    secondary: THEME_COLORS.DND,
    accent: THEME_COLORS.MYTHIC,
  },
  INFO_SCHEME: {
    primary: THEME_COLORS.INFO,
    secondary: THEME_COLORS.HAWK_SECONDARY,
    accent: THEME_COLORS.RARE,
  },
  GAMING_SCHEME: {
    primary: THEME_COLORS.PUBG,
    secondary: THEME_COLORS.GAMES,
    accent: THEME_COLORS.EPIC,
  },
  PREMIUM_SCHEME: {
    primary: THEME_COLORS.PREMIUM,
    secondary: THEME_COLORS.LEGENDARY,
    accent: THEME_COLORS.BOOST,
  },
} as const;

/**
 * Export individual colors for backward compatibility
 */
export const {
  HAWK_PRIMARY,
  HAWK_SECONDARY,
  HAWK_ACCENT,
  ERROR,
  SUCCESS,
  WARNING,
  INFO,
  PRIMARY,
  PUBG,
  MUSIC,
  ECONOMY,
  ADMIN,
  PROFILE,
  GENERAL,
  GAMES,
  TICKETS,
  BADGES,
  RANKING,
  COMMON,
  UNCOMMON,
  RARE,
  EPIC,
  LEGENDARY,
  MYTHIC,
  ONLINE,
  OFFLINE,
  IDLE,
  DND,
  PREMIUM,
  BOOST,
  EVENT,
  MAINTENANCE,
} = THEME_COLORS;