/**
 * Punishment System Configuration
 * Defines penalties for various infractions in the check-in/check-out system
 */

export interface PunishmentConfig {
  enabled: boolean;
  penalties: {
    no_checkout: {
      xpPenalty: number;
      coinsPenalty: number;
      rankPointsPenalty: number;
      description: string;
    };
    no_show_up: {
      xpPenalty: number;
      coinsPenalty: number;
      rankPointsPenalty: number;
      description: string;
    };
    early_leave: {
      xpPenalty: number;
      coinsPenalty: number;
      rankPointsPenalty: number;
      description: string;
    };
  };
  warnings: {
    maxWarnings: number;
    warningDuration: number; // in hours
    escalationPenalty: {
      xpPenalty: number;
      coinsPenalty: number;
      rankPointsPenalty: number;
    };
  };
  timeouts: {
    noCheckoutTimeout: number; // in hours
    noShowUpTimeout: number; // in hours
    earlyLeaveTimeout: number; // in hours
  };
}

export const PUNISHMENT_CONFIG: PunishmentConfig = {
  enabled: true,
  penalties: {
    no_checkout: {
      xpPenalty: 50,
      coinsPenalty: 25,
      rankPointsPenalty: 10,
      description: 'Não fez check-out adequadamente'
    },
    no_show_up: {
      xpPenalty: 100,
      coinsPenalty: 50,
      rankPointsPenalty: 20,
      description: 'Não compareceu à sessão após check-in'
    },
    early_leave: {
      xpPenalty: 30,
      coinsPenalty: 15,
      rankPointsPenalty: 5,
      description: 'Saiu da sessão muito cedo'
    }
  },
  warnings: {
    maxWarnings: 3,
    warningDuration: 24, // 24 hours
    escalationPenalty: {
      xpPenalty: 200,
      coinsPenalty: 100,
      rankPointsPenalty: 50
    }
  },
  timeouts: {
    noCheckoutTimeout: 2, // 2 hours after session should end
    noShowUpTimeout: 1, // 1 hour after check-in
    earlyLeaveTimeout: 0.5 // 30 minutes minimum session time
  }
};

export type PunishmentType = 'no_checkout' | 'no_show_up' | 'early_leave';

export interface PunishmentRecord {
  id: string;
  userId: string;
  guildId: string;
  type: 'no_checkout' | 'no_show_up' | 'early_leave' | 'warning_escalation';
  penalty: {
    xp: number;
    coins: number;
    rankPoints: number;
  };
  reason: string;
  sessionId?: string;
  channelId?: string;
  timestamp: Date;
  appealable: boolean;
  appealed: boolean;
  appealReason?: string;
  appealedAt?: Date;
  reversedBy?: string;
  reversedAt?: Date;
}

export interface UserWarning {
  id: string;
  userId: string;
  guildId: string;
  type: 'no_checkout' | 'no_show_up' | 'early_leave';
  reason: string;
  issuedAt: Date;
  expiresAt: Date;
  active: boolean;
}

/**
 * Get punishment configuration for a specific infraction type
 */
export function getPunishmentConfig(type: keyof PunishmentConfig['penalties']): PunishmentConfig['penalties'][keyof PunishmentConfig['penalties']] {
  return PUNISHMENT_CONFIG.penalties[type];
}

/**
 * Calculate escalated penalty based on warning count
 */
export function calculateEscalatedPenalty(warningCount: number): { xp: number; coins: number; rankPoints: number } {
  const baseEscalation = PUNISHMENT_CONFIG.warnings.escalationPenalty;
  const multiplier = Math.min(warningCount, 5); // Cap at 5x multiplier
  
  return {
    xp: baseEscalation.xpPenalty * multiplier,
    coins: baseEscalation.coinsPenalty * multiplier,
    rankPoints: baseEscalation.rankPointsPenalty * multiplier
  };
}

/**
 * Check if user should receive escalated punishment
 */
export function shouldEscalatePunishment(warningCount: number): boolean {
  return warningCount >= PUNISHMENT_CONFIG.warnings.maxWarnings;
}

/**
 * Format punishment reason for display
 */
export function formatPunishmentReason(type: keyof PunishmentConfig['penalties'], details?: string): string {
  const config = getPunishmentConfig(type);
  return details ? `${config.description}: ${details}` : config.description;
}