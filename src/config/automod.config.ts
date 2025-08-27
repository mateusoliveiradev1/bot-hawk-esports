/**
 * Auto Moderation Configuration
 * Configurações para o sistema de moderação automática
 */

export interface AutoModConfig {
  enabled: boolean;
  spamDetection: {
    enabled: boolean;
    maxMessages: number;
    timeWindow: number; // em segundos
    maxDuplicates: number;
    duplicateTimeWindow: number; // em segundos
  };
  profanityFilter: {
    enabled: boolean;
    strictMode: boolean;
    customWords: string[];
  };
  linkFilter: {
    enabled: boolean;
    allowWhitelisted: boolean;
    blockInvites: boolean;
    blockSuspicious: boolean;
    whitelist: string[];
    blacklist: string[];
  };
  capsFilter: {
    enabled: boolean;
    maxPercentage: number;
    minLength: number;
  };
  punishments: {
    warn: {
      enabled: boolean;
      deleteMessage: boolean;
    };
    mute: {
      enabled: boolean;
      duration: number; // em minutos
      deleteMessage: boolean;
    };
    kick: {
      enabled: boolean;
      deleteMessage: boolean;
    };
    ban: {
      enabled: boolean;
      deleteMessage: boolean;
      deleteMessageDays: number;
    };
  };
  escalation: {
    enabled: boolean;
    warnThreshold: number;
    muteThreshold: number;
    kickThreshold: number;
    banThreshold: number;
    resetTime: number; // em horas
  };
  logging: {
    enabled: boolean;
    channelId?: string;
    logWarnings: boolean;
    logMutes: boolean;
    logKicks: boolean;
    logBans: boolean;
    logDeletedMessages: boolean;
  };
  exemptions: {
    roles: string[];
    channels: string[];
    users: string[];
  };
}

/**
 * Configuração padrão da auto moderação
 */
export const DEFAULT_AUTOMOD_CONFIG: AutoModConfig = {
  enabled: true,
  spamDetection: {
    enabled: true,
    maxMessages: 5,
    timeWindow: 10,
    maxDuplicates: 3,
    duplicateTimeWindow: 30,
  },
  profanityFilter: {
    enabled: true,
    strictMode: false,
    customWords: [],
  },
  linkFilter: {
    enabled: true,
    allowWhitelisted: true,
    blockInvites: true,
    blockSuspicious: true,
    whitelist: [
      'youtube.com',
      'youtu.be',
      'twitch.tv',
      'discord.gg',
      'github.com',
      'twitter.com',
      'instagram.com',
      'facebook.com',
      'reddit.com',
      'pubg.com',
      'steam.com',
      'steamcommunity.com',
    ],
    blacklist: [
      'bit.ly',
      'tinyurl.com',
      'shorturl.at',
    ],
  },
  capsFilter: {
    enabled: true,
    maxPercentage: 70,
    minLength: 10,
  },
  punishments: {
    warn: {
      enabled: true,
      deleteMessage: true,
    },
    mute: {
      enabled: true,
      duration: 10,
      deleteMessage: true,
    },
    kick: {
      enabled: true,
      deleteMessage: true,
    },
    ban: {
      enabled: true,
      deleteMessage: true,
      deleteMessageDays: 1,
    },
  },
  escalation: {
    enabled: true,
    warnThreshold: 3,
    muteThreshold: 5,
    kickThreshold: 8,
    banThreshold: 10,
    resetTime: 24,
  },
  logging: {
    enabled: true,
    logWarnings: true,
    logMutes: true,
    logKicks: true,
    logBans: true,
    logDeletedMessages: true,
  },
  exemptions: {
    roles: [], // IDs dos cargos isentos
    channels: [], // IDs dos canais isentos
    users: [], // IDs dos usuários isentos
  },
};

/**
 * Lista de palavrões em português e inglês
 */
export const PROFANITY_LIST = {
  portuguese: [
    'porra', 'merda', 'caralho', 'puta', 'fdp', 'filho da puta',
    'buceta', 'cu', 'cuzao', 'cuzão', 'babaca', 'idiota',
    'imbecil', 'burro', 'otario', 'otário', 'desgraça',
    'vagabundo', 'safado', 'piranha', 'vadia', 'prostituta',
  ],
  english: [
    'fuck', 'shit', 'bitch', 'asshole', 'damn', 'hell',
    'crap', 'piss', 'dick', 'cock', 'pussy', 'whore',
    'slut', 'bastard', 'motherfucker', 'nigger', 'faggot',
    'retard', 'gay', 'lesbian', 'homo', 'tranny',
  ],
};

/**
 * Padrões de links suspeitos
 */
export const SUSPICIOUS_PATTERNS = [
  /discord\.gg\/[a-zA-Z0-9]+/gi, // Convites do Discord
  /discordapp\.com\/invite\/[a-zA-Z0-9]+/gi,
  /discord\.com\/invite\/[a-zA-Z0-9]+/gi,
  /bit\.ly\/[a-zA-Z0-9]+/gi, // Links encurtados
  /tinyurl\.com\/[a-zA-Z0-9]+/gi,
  /t\.co\/[a-zA-Z0-9]+/gi,
  /goo\.gl\/[a-zA-Z0-9]+/gi,
  /shorturl\.at\/[a-zA-Z0-9]+/gi,
  /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi, // URLs genéricas
];

/**
 * Tipos de violação da auto moderação
 */
export enum ViolationType {
  SPAM = 'spam',
  PROFANITY = 'profanity',
  SUSPICIOUS_LINK = 'suspicious_link',
  DISCORD_INVITE = 'discord_invite',
  EXCESSIVE_CAPS = 'excessive_caps',
  DUPLICATE_MESSAGE = 'duplicate_message',
}

/**
 * Tipos de punição
 */
export enum PunishmentType {
  WARN = 'warn',
  MUTE = 'mute',
  KICK = 'kick',
  BAN = 'ban',
}

/**
 * Interface para resultado da moderação
 */
export interface ModerationResult {
  violated: boolean;
  violationType?: ViolationType;
  reason?: string;
  punishment?: PunishmentType;
  escalated?: boolean;
}