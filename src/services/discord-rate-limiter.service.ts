import { Collection } from 'discord.js';
import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { AdvancedRateLimitService } from './advanced-rate-limit.service';
import { RateLimitConfiguration } from '../config/rate-limit.config';

/**
 * Discord command rate limiting result
 */
export interface DiscordRateLimitResult {
  allowed: boolean;
  timeLeft?: number;
  violationLevel: 'none' | 'warning' | 'moderate' | 'severe' | 'critical';
  action: 'allow' | 'warn' | 'cooldown' | 'timeout' | 'ban';
  reason?: string;
}

/**
 * User rate limit data
 */
interface UserRateLimitData {
  commandCount: number;
  lastCommand: number;
  violations: number;
  penaltyMultiplier: number;
  timeoutUntil?: number;
  warningCount: number;
}

/**
 * Command rate limit configuration
 */
interface CommandRateLimitConfig {
  maxCommands: number;
  windowMs: number;
  cooldownMs: number;
  maxViolations: number;
  penaltyMultiplier: number;
}

/**
 * Enhanced Discord command rate limiter with progressive penalties
 */
export class DiscordRateLimiterService {
  private logger: Logger;
  private cacheService: CacheService;
  private advancedRateLimit: AdvancedRateLimitService;
  private userLimits: Collection<string, UserRateLimitData>;
  private commandConfigs: Map<string, CommandRateLimitConfig>;
  private globalConfig: CommandRateLimitConfig;
  private cleanupInterval: NodeJS.Timeout;

  constructor(cacheService: CacheService, advancedRateLimit: AdvancedRateLimitService) {
    this.logger = new Logger();
    this.cacheService = cacheService;
    this.advancedRateLimit = advancedRateLimit;
    this.userLimits = new Collection();
    this.commandConfigs = new Map();

    // Global rate limit configuration
    this.globalConfig = {
      maxCommands: 10, // 10 commands per window
      windowMs: 60 * 1000, // 1 minute
      cooldownMs: 3 * 1000, // 3 seconds base cooldown
      maxViolations: 5, // Max violations before timeout
      penaltyMultiplier: 2, // Multiply cooldown by this on violations
    };

    this.setupCommandConfigs();
    this.startCleanupInterval();
  }

  /**
   * Setup command-specific rate limit configurations
   */
  private setupCommandConfigs(): void {
    // Admin commands - stricter limits
    this.commandConfigs.set('admin', {
      maxCommands: 5,
      windowMs: 60 * 1000,
      cooldownMs: 5 * 1000,
      maxViolations: 3,
      penaltyMultiplier: 3,
    });

    // Music commands - moderate limits
    this.commandConfigs.set('music', {
      maxCommands: 15,
      windowMs: 60 * 1000,
      cooldownMs: 2 * 1000,
      maxViolations: 8,
      penaltyMultiplier: 1.5,
    });

    // PUBG commands - API rate limit consideration
    this.commandConfigs.set('pubg', {
      maxCommands: 8,
      windowMs: 60 * 1000,
      cooldownMs: 5 * 1000,
      maxViolations: 4,
      penaltyMultiplier: 2.5,
    });

    // Moderation commands - very strict
    this.commandConfigs.set('moderation', {
      maxCommands: 3,
      windowMs: 60 * 1000,
      cooldownMs: 10 * 1000,
      maxViolations: 2,
      penaltyMultiplier: 4,
    });

    // Fun/General commands - lenient
    this.commandConfigs.set('fun', {
      maxCommands: 20,
      windowMs: 60 * 1000,
      cooldownMs: 1 * 1000,
      maxViolations: 10,
      penaltyMultiplier: 1.2,
    });

    this.logger.info(`Configured rate limits for ${this.commandConfigs.size} command categories`);
  }

  /**
   * Check if user can execute a command
   */
  public async checkRateLimit(
    userId: string,
    guildId: string | null,
    commandName: string,
    commandCategory: string
  ): Promise<DiscordRateLimitResult> {
    try {
      // Get user data
      const userData = this.getUserData(userId);
      const config = this.getCommandConfig(commandCategory);
      const now = Date.now();

      // Check if user is in timeout
      if (userData.timeoutUntil && now < userData.timeoutUntil) {
        const timeLeft = Math.ceil((userData.timeoutUntil - now) / 1000);
        return {
          allowed: false,
          timeLeft,
          violationLevel: 'critical',
          action: 'timeout',
          reason: `User is in timeout for ${timeLeft} seconds due to rate limit violations`,
        };
      }

      // Check advanced rate limiting (IP-based, behavior analysis)
      const advancedCheck = await this.advancedRateLimit.checkRateLimit(
        `discord-${userId}`,
        guildId || 'dm',
        {
          userId: userId,
          endpoint: commandName,
        }
      );

      if (!advancedCheck.allowed) {
        this.logger.warn('Advanced rate limit violation detected', {
          userId,
          guildId,
          commandName,
        });
        return {
          allowed: false,
          timeLeft: 0,
          violationLevel:
            advancedCheck.violationLevel === 'critical'
              ? 'critical'
              : advancedCheck.violationLevel === 'warning'
                ? 'warning'
                : 'none',
          action: this.mapAdvancedAction(advancedCheck.recommendedAction),
          reason: 'Rate limit exceeded',
        };
      }

      // Check command-specific rate limits
      const rateLimitCheck = this.checkCommandRateLimit(userData, config, now);
      if (!rateLimitCheck.allowed) {
        // Record violation
        this.recordViolation(userId, userData, config, now);
        this.logger.warn('Command rate limit violation detected', {
          userId,
          guildId,
          commandName,
        });
        return rateLimitCheck;
      }

      // Update user data for successful command
      this.updateUserData(userId, userData, now);

      return {
        allowed: true,
        violationLevel: 'none',
        action: 'allow',
      };
    } catch (error) {
      this.logger.error('Error checking Discord rate limit:', { error, userId, commandName });

      // Fail safe - allow command but log error
      return {
        allowed: true,
        violationLevel: 'none',
        action: 'allow',
      };
    }
  }

  /**
   * Get user rate limit data
   */
  private getUserData(userId: string): UserRateLimitData {
    if (!this.userLimits.has(userId)) {
      this.userLimits.set(userId, {
        commandCount: 0,
        lastCommand: 0,
        violations: 0,
        penaltyMultiplier: 1,
        warningCount: 0,
      });
    }
    return this.userLimits.get(userId)!;
  }

  /**
   * Get command configuration
   */
  private getCommandConfig(category: string): CommandRateLimitConfig {
    return this.commandConfigs.get(category) || this.globalConfig;
  }

  /**
   * Check command-specific rate limits
   */
  private checkCommandRateLimit(
    userData: UserRateLimitData,
    config: CommandRateLimitConfig,
    now: number
  ): DiscordRateLimitResult {
    // Reset window if expired
    if (now - userData.lastCommand > config.windowMs) {
      userData.commandCount = 0;
    }

    // Check if too many commands in window
    if (userData.commandCount >= config.maxCommands) {
      const timeLeft = Math.ceil((config.windowMs - (now - userData.lastCommand)) / 1000);
      return {
        allowed: false,
        timeLeft,
        violationLevel: 'moderate',
        action: 'cooldown',
        reason: `Too many commands in window. ${userData.commandCount}/${config.maxCommands} used.`,
      };
    }

    // Check cooldown with penalty multiplier
    const effectiveCooldown = config.cooldownMs * userData.penaltyMultiplier;
    const timeSinceLastCommand = now - userData.lastCommand;

    if (timeSinceLastCommand < effectiveCooldown) {
      const timeLeft = Math.ceil((effectiveCooldown - timeSinceLastCommand) / 1000);
      return {
        allowed: false,
        timeLeft,
        violationLevel: userData.penaltyMultiplier > 2 ? 'severe' : 'warning',
        action: 'cooldown',
        reason: `Command on cooldown. Wait ${timeLeft} seconds.`,
      };
    }

    return {
      allowed: true,
      violationLevel: 'none',
      action: 'allow',
    };
  }

  /**
   * Record a rate limit violation
   */
  private recordViolation(
    userId: string,
    userData: UserRateLimitData,
    config: CommandRateLimitConfig,
    now: number
  ): void {
    userData.violations++;
    userData.warningCount++;

    // Increase penalty multiplier
    userData.penaltyMultiplier = Math.min(
      userData.penaltyMultiplier * config.penaltyMultiplier,
      10 // Max 10x penalty
    );

    // Apply timeout if too many violations
    if (userData.violations >= config.maxViolations) {
      const timeoutDuration = Math.min(
        config.windowMs * userData.violations,
        30 * 60 * 1000 // Max 30 minutes
      );

      userData.timeoutUntil = now + timeoutDuration;
      userData.violations = 0; // Reset after timeout

      this.logger.warn(
        `User ${userId} timed out for ${timeoutDuration / 1000} seconds due to rate limit violations`
      );
    }

    // Log violation
    this.logger.debug(`Rate limit violation recorded for user ${userId}`, {
      userId: userId,
    });
  }

  /**
   * Update user data after successful command
   */
  private updateUserData(userId: string, userData: UserRateLimitData, now: number): void {
    userData.commandCount++;
    userData.lastCommand = now;

    // Gradually reduce penalty multiplier for good behavior
    if (userData.penaltyMultiplier > 1 && userData.violations === 0) {
      userData.penaltyMultiplier = Math.max(userData.penaltyMultiplier * 0.9, 1);
    }
  }

  /**
   * Map advanced rate limit violation levels
   */
  private mapAdvancedViolationLevel(
    level: number
  ): 'none' | 'warning' | 'moderate' | 'severe' | 'critical' {
    if (level <= 1) {
      return 'none';
    }
    if (level <= 2) {
      return 'warning';
    }
    if (level <= 3) {
      return 'moderate';
    }
    if (level <= 4) {
      return 'severe';
    }
    return 'critical';
  }

  /**
   * Map advanced rate limit actions
   */
  private mapAdvancedAction(action: string): 'allow' | 'warn' | 'cooldown' | 'timeout' | 'ban' {
    switch (action) {
      case 'block':
        return 'cooldown';
      case 'warn':
        return 'warn';
      case 'ban':
        return 'ban';
      default:
        return 'allow';
    }
  }

  /**
   * Get user rate limit status
   */
  public getUserStatus(userId: string): {
    commandCount: number;
    violations: number;
    penaltyMultiplier: number;
    timeoutUntil?: number;
    warningCount: number;
  } {
    const userData = this.getUserData(userId);
    return {
      commandCount: userData.commandCount,
      violations: userData.violations,
      penaltyMultiplier: userData.penaltyMultiplier,
      timeoutUntil: userData.timeoutUntil,
      warningCount: userData.warningCount,
    };
  }

  /**
   * Reset user rate limit data
   */
  public resetUser(userId: string): void {
    this.userLimits.delete(userId);
    this.logger.info(`Reset rate limit data for user ${userId}`);
  }

  /**
   * Get rate limit statistics
   */
  public getStats(): {
    totalUsers: number;
    usersInTimeout: number;
    totalViolations: number;
    averagePenaltyMultiplier: number;
  } {
    const users = Array.from(this.userLimits.values());
    const now = Date.now();

    return {
      totalUsers: users.length,
      usersInTimeout: users.filter(u => u.timeoutUntil && now < u.timeoutUntil).length,
      totalViolations: users.reduce((sum, u) => sum + u.violations, 0),
      averagePenaltyMultiplier:
        users.length > 0
          ? users.reduce((sum, u) => sum + u.penaltyMultiplier, 0) / users.length
          : 1,
    };
  }

  /**
   * Start cleanup interval to remove old data
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldData();
      },
      5 * 60 * 1000
    ); // Every 5 minutes
  }

  /**
   * Clean up old user data
   */
  private cleanupOldData(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleaned = 0;

    for (const [userId, userData] of this.userLimits.entries()) {
      // Remove users who haven't used commands in 24 hours and have no active penalties
      if (
        now - userData.lastCommand > maxAge &&
        userData.violations === 0 &&
        userData.penaltyMultiplier <= 1.1 &&
        (!userData.timeoutUntil || now > userData.timeoutUntil)
      ) {
        this.userLimits.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} old rate limit entries`);
    }
  }

  /**
   * Shutdown the service
   */
  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.logger.info('Discord rate limiter service shut down');
  }
}
