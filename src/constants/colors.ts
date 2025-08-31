/**
 * Centralized color constants for consistent theming across the bot
 * Based on UI/UX audit findings and Discord.js ColorResolvable format
 */

export const THEME_COLORS = {
  // State Colors - For system feedback
  ERROR: 0xFF0000,      // Red - Errors, failures, critical issues
  SUCCESS: 0x00FF00,    // Green - Success messages, confirmations
  WARNING: 0xFFFF00,    // Yellow - Warnings, cautions, attention needed
  INFO: 0x0099FF,       // Blue - General information, neutral messages
  PRIMARY: 0x5865F2,    // Discord Purple - Primary actions, branding

  // Category Colors - For different bot functionalities
  PUBG: 0x9B59B6,       // Purple - PUBG related commands and features
  MUSIC: 0x00AE86,      // Teal - Music system, playlists, audio
  ECONOMY: 0xFF6B35,    // Orange - Economy, coins, transactions
  ADMIN: 0x3498DB,      // Blue - Administrative commands and tools
  PROFILE: 0x0099FF,    // Light Blue - User profiles and statistics
  GENERAL: 0x5865F2,    // Discord Purple - General purpose commands
  GAMES: 0xE74C3C,      // Red - Gaming activities, challenges
  TICKETS: 0x2ECC71,    // Green - Support tickets, help system
  BADGES: 0xF39C12,     // Gold - Achievements, rewards, badges
  RANKING: 0x8E44AD,    // Dark Purple - Rankings, leaderboards

  // Rarity Colors - For badges and special items
  COMMON: 0x95A5A6,     // Gray - Common items
  UNCOMMON: 0x2ECC71,   // Green - Uncommon items
  RARE: 0x3498DB,       // Blue - Rare items
  EPIC: 0x9B59B6,       // Purple - Epic items
  LEGENDARY: 0xF39C12,  // Gold - Legendary items
  MYTHIC: 0xE74C3C,     // Red - Mythic items

  // Status Colors - For various states
  ONLINE: 0x2ECC71,     // Green - Online, active, available
  OFFLINE: 0x95A5A6,    // Gray - Offline, inactive, unavailable
  IDLE: 0xF39C12,       // Orange - Idle, away, partially active
  DND: 0xE74C3C,        // Red - Do not disturb, busy

  // Special Colors - For unique contexts
  PREMIUM: 0xF1C40F,    // Gold - Premium features, VIP
  BOOST: 0xFF69B4,      // Pink - Server boosts, special perks
  EVENT: 0x9B59B6,      // Purple - Special events, limited time
  MAINTENANCE: 0x95A5A6, // Gray - Maintenance mode, downtime
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
  SUCCESS_SCHEME: {
    primary: THEME_COLORS.SUCCESS,
    secondary: THEME_COLORS.ONLINE,
    accent: THEME_COLORS.UNCOMMON,
  },
  ERROR_SCHEME: {
    primary: THEME_COLORS.ERROR,
    secondary: THEME_COLORS.DND,
    accent: THEME_COLORS.MYTHIC,
  },
  INFO_SCHEME: {
    primary: THEME_COLORS.INFO,
    secondary: THEME_COLORS.ADMIN,
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