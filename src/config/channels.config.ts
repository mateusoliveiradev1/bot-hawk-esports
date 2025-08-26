/**
 * Configuration for channel management and cleanup
 */

export interface ChannelConfig {
  /** Time in milliseconds before automatic cleanup */
  cleanupTime: number;
  /** Maximum number of users allowed in voice channel */
  maxUsers?: number;
  /** Whether to create a text channel alongside voice channel */
  createTextChannel: boolean;
  /** Category name pattern for organizing channels */
  categoryPattern: string;
}

/**
 * Channel configuration by session type
 */
export const CHANNEL_CONFIGS: Record<string, ChannelConfig> = {
  mm: {
    cleanupTime: 4 * 60 * 60 * 1000, // 4 hours
    maxUsers: 10,
    createTextChannel: true,
    categoryPattern: '🎮 Matchmaking'
  },
  scrim: {
    cleanupTime: 6 * 60 * 60 * 1000, // 6 hours
    maxUsers: 10,
    createTextChannel: true,
    categoryPattern: '⚔️ Scrims'
  },
  campeonato: {
    cleanupTime: 12 * 60 * 60 * 1000, // 12 hours
    maxUsers: 20,
    createTextChannel: true,
    categoryPattern: '🏆 Campeonatos'
  },
  ranked: {
    cleanupTime: 8 * 60 * 60 * 1000, // 8 hours
    maxUsers: 10,
    createTextChannel: true,
    categoryPattern: '🎯 Ranked'
  }
};

/**
 * Default configuration for unknown session types
 */
export const DEFAULT_CHANNEL_CONFIG: ChannelConfig = {
  cleanupTime: 4 * 60 * 60 * 1000, // 4 hours
  maxUsers: 10,
  createTextChannel: true,
  categoryPattern: '🎮 Sessões'
};

/**
 * Get configuration for a specific session type
 */
export function getChannelConfig(sessionType?: string): ChannelConfig {
  if (!sessionType) return DEFAULT_CHANNEL_CONFIG;
  return CHANNEL_CONFIGS[sessionType.toLowerCase()] || DEFAULT_CHANNEL_CONFIG;
}

/**
 * Convert milliseconds to human readable format
 */
export function formatCleanupTime(milliseconds: number): string {
  const hours = Math.floor(milliseconds / (60 * 60 * 1000));
  const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));
  
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}