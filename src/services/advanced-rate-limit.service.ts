import { Logger, LogCategory } from '../utils/logger';
import { CacheService } from './cache.service';
import { RateLimiter, RateLimitConfig, RateLimitResult } from '../utils/rate-limiter';
import { RateLimitConfiguration, RateLimitEndpointConfig } from '../config/rate-limit.config';
import { StructuredLogger } from './structured-logger.service';

/**
 * Advanced rate limiting result with additional metadata
 */
export interface AdvancedRateLimitResult extends RateLimitResult {
  violationLevel: 'none' | 'warning' | 'critical';
  suspiciousActivity: boolean;
  recommendedAction: 'allow' | 'throttle' | 'block' | 'captcha';
  metadata: {
    userAgent?: string;
    country?: string;
    previousViolations: number;
    accountAge?: number;
    trustScore: number;
  };
}

/**
 * Rate limiting violation record
 */
interface RateLimitViolation {
  identifier: string;
  endpoint: string;
  timestamp: Date;
  violationType: 'soft' | 'hard';
  userAgent?: string;
  ip?: string;
  userId?: string;
}

/**
 * User trust score factors
 */
interface TrustScoreFactors {
  accountAge: number; // days
  successfulRequests: number;
  failedRequests: number;
  violationHistory: number;
  verifiedEmail: boolean;
  twoFactorEnabled: boolean;
  premiumUser: boolean;
}

/**
 * Advanced Rate Limiting Service
 * Provides intelligent rate limiting with user behavior analysis,
 * progressive penalties, and adaptive thresholds
 */
export class AdvancedRateLimitService {
  private readonly logger = new Logger();
  private readonly structuredLogger: StructuredLogger;
  private readonly rateLimiters = new Map<string, RateLimiter>();
  private readonly violationHistory = new Map<string, RateLimitViolation[]>();
  private readonly trustScores = new Map<string, number>();
  private readonly suspiciousIPs = new Set<string>();
  private readonly whitelistedIPs = new Set<string>();
  private readonly blacklistedIPs = new Set<string>();

  constructor(
    private readonly cacheService: CacheService,
    structuredLogger?: StructuredLogger,
  ) {
    this.structuredLogger = structuredLogger || new StructuredLogger({
      level: 'info',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      logDir: './logs',
      maxFiles: 14,
      maxSize: '20m',
      enableConsole: true,
      enableFile: true,
    }, 'AdvancedRateLimitService');

    this.initializeRateLimiters();
    this.loadWhitelistedIPs();
    this.startCleanupTasks();
  }

  /**
   * Initialize rate limiters for different endpoint types
   */
  private initializeRateLimiters(): void {
    const endpointTypes = [
      'general', 'auth-login', 'auth-register', 'upload-general',
      'api-pubg', 'api-stats', 'admin-general', 'security-captcha',
    ];

    endpointTypes.forEach(type => {
      const config = RateLimitConfiguration.getConfig(type);
      const rateLimitConfig: RateLimitConfig = {
        maxRequests: config.max,
        windowMs: config.windowMs,
        keyGenerator: config.keyGenerator,
        onLimitReached: (identifier, resetTime) => {
          this.handleRateLimitViolation(identifier, type, 'hard');
        },
      };

      this.rateLimiters.set(type, new RateLimiter(rateLimitConfig));
    });

    this.logger.info('Advanced rate limiters initialized', {
      category: LogCategory.SECURITY,
      metadata: { endpointTypes: endpointTypes.length },
    });
  }

  /**
   * Check rate limit with advanced analysis
   */
  public async checkRateLimit(
    identifier: string,
    endpointType: string,
    metadata: {
      ip?: string;
      userAgent?: string;
      userId?: string;
      endpoint?: string;
    } = {},
  ): Promise<AdvancedRateLimitResult> {
    // Check if IP is blacklisted
    if (metadata.ip && this.blacklistedIPs.has(metadata.ip)) {
      return this.createBlockedResult('IP blacklisted');
    }

    // Check if IP is whitelisted (bypass rate limiting)
    if (metadata.ip && this.whitelistedIPs.has(metadata.ip)) {
      return this.createAllowedResult('IP whitelisted');
    }

    const rateLimiter = this.rateLimiters.get(endpointType);
    if (!rateLimiter) {
      this.logger.warn(`Rate limiter not found for endpoint type: ${endpointType}`);
      return this.createAllowedResult('No rate limiter configured');
    }

    // Get basic rate limit result
    const basicResult = rateLimiter.checkLimit(identifier);
    
    // Calculate trust score
    const trustScore = await this.calculateTrustScore(identifier, metadata);
    
    // Analyze user behavior
    const behaviorAnalysis = await this.analyzeUserBehavior(identifier, metadata);
    
    // Determine violation level
    const violationLevel = this.determineViolationLevel(basicResult, trustScore, behaviorAnalysis);
    
    // Get previous violations
    const previousViolations = this.getViolationCount(identifier);
    
    // Determine recommended action
    const recommendedAction = this.determineRecommendedAction(
      basicResult,
      violationLevel,
      trustScore,
      behaviorAnalysis,
    );

    const result: AdvancedRateLimitResult = {
      ...basicResult,
      violationLevel,
      suspiciousActivity: behaviorAnalysis.suspicious,
      recommendedAction,
      metadata: {
        userAgent: metadata.userAgent,
        previousViolations,
        trustScore,
      },
    };

    // Log the rate limit check
    await this.logRateLimitCheck(identifier, endpointType, result, metadata);

    // Handle violations
    if (!basicResult.allowed) {
      await this.handleRateLimitViolation(identifier, endpointType, 'hard', metadata);
    } else if (violationLevel === 'warning') {
      await this.handleRateLimitViolation(identifier, endpointType, 'soft', metadata);
    }

    return result;
  }

  /**
   * Calculate user trust score based on various factors
   */
  private async calculateTrustScore(
    identifier: string,
    metadata: { userId?: string; ip?: string },
  ): Promise<number> {
    const cacheKey = `trust_score:${identifier}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached && typeof cached === 'string') {
      return parseFloat(cached);
    }

    let trustScore = 0.5; // Base trust score

    try {
      // Get user data if userId is available
      if (metadata.userId) {
        const factors = await this.getTrustScoreFactors(metadata.userId);
        trustScore = this.calculateTrustScoreFromFactors(factors);
      }

      // Adjust based on IP reputation
      if (metadata.ip) {
        if (this.suspiciousIPs.has(metadata.ip)) {
          trustScore *= 0.5; // Reduce trust for suspicious IPs
        }
      }

      // Cache the trust score for 1 hour
      await this.cacheService.set(cacheKey, trustScore.toString(), 3600);
    } catch (error) {
      this.logger.error('Error calculating trust score', {
        category: LogCategory.SECURITY,
        error: error instanceof Error ? error : new Error('Unknown error'),
        metadata: { identifier },
      });
    }

    return Math.max(0, Math.min(1, trustScore)); // Clamp between 0 and 1
  }

  /**
   * Get trust score factors from database
   */
  private async getTrustScoreFactors(userId: string): Promise<TrustScoreFactors> {
    // This would typically query the database
    // For now, return default values
    return {
      accountAge: 30, // days
      successfulRequests: 100,
      failedRequests: 5,
      violationHistory: 0,
      verifiedEmail: true,
      twoFactorEnabled: false,
      premiumUser: false,
    };
  }

  /**
   * Calculate trust score from factors
   */
  private calculateTrustScoreFromFactors(factors: TrustScoreFactors): number {
    let score = 0.5; // Base score

    // Account age factor (newer accounts are less trusted)
    if (factors.accountAge > 365) {score += 0.2;}
    else if (factors.accountAge > 90) {score += 0.1;}
    else if (factors.accountAge < 7) {score -= 0.2;}

    // Success rate factor
    const totalRequests = factors.successfulRequests + factors.failedRequests;
    if (totalRequests > 0) {
      const successRate = factors.successfulRequests / totalRequests;
      score += (successRate - 0.5) * 0.3; // Adjust based on success rate
    }

    // Violation history penalty
    score -= factors.violationHistory * 0.1;

    // Security features bonus
    if (factors.verifiedEmail) {score += 0.1;}
    if (factors.twoFactorEnabled) {score += 0.15;}
    if (factors.premiumUser) {score += 0.1;}

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Analyze user behavior patterns
   */
  private async analyzeUserBehavior(
    identifier: string,
    metadata: { userAgent?: string; ip?: string },
  ): Promise<{ suspicious: boolean; patterns: string[] }> {
    const patterns: string[] = [];
    let suspicious = false;

    // Check for bot-like user agents
    if (metadata.userAgent) {
      const botPatterns = ['bot', 'crawler', 'spider', 'scraper', 'curl', 'wget'];
      if (botPatterns.some(pattern => metadata.userAgent!.toLowerCase().includes(pattern))) {
        patterns.push('bot-like-user-agent');
        suspicious = true;
      }
    }

    // Check request frequency patterns
    const recentRequests = await this.getRecentRequestCount(identifier);
    if (recentRequests > 50) { // More than 50 requests in the last minute
      patterns.push('high-frequency-requests');
      suspicious = true;
    }

    // Check for suspicious IP
    if (metadata.ip && this.suspiciousIPs.has(metadata.ip)) {
      patterns.push('suspicious-ip');
      suspicious = true;
    }

    return { suspicious, patterns };
  }

  /**
   * Get recent request count for identifier
   */
  private async getRecentRequestCount(identifier: string): Promise<number> {
    const cacheKey = `recent_requests:${identifier}`;
    const count = await this.cacheService.get(cacheKey);
    return count ? parseInt(String(count)) : 0;
  }

  /**
   * Determine violation level based on various factors
   */
  private determineViolationLevel(
    basicResult: RateLimitResult,
    trustScore: number,
    behaviorAnalysis: { suspicious: boolean; patterns: string[] },
  ): 'none' | 'warning' | 'critical' {
    if (!basicResult.allowed) {
      return trustScore < 0.3 || behaviorAnalysis.suspicious ? 'critical' : 'warning';
    }

    if (basicResult.remaining < 3 && (trustScore < 0.5 || behaviorAnalysis.suspicious)) {
      return 'warning';
    }

    return 'none';
  }

  /**
   * Determine recommended action based on analysis
   */
  private determineRecommendedAction(
    basicResult: RateLimitResult,
    violationLevel: 'none' | 'warning' | 'critical',
    trustScore: number,
    behaviorAnalysis: { suspicious: boolean; patterns: string[] },
  ): 'allow' | 'throttle' | 'block' | 'captcha' {
    if (violationLevel === 'critical') {
      return trustScore < 0.2 ? 'block' : 'captcha';
    }

    if (violationLevel === 'warning') {
      return behaviorAnalysis.suspicious ? 'captcha' : 'throttle';
    }

    if (!basicResult.allowed) {
      return 'throttle';
    }

    return 'allow';
  }

  /**
   * Handle rate limit violations
   */
  private async handleRateLimitViolation(
    identifier: string,
    endpointType: string,
    violationType: 'soft' | 'hard',
    metadata: {
      ip?: string;
      userAgent?: string;
      userId?: string;
      endpoint?: string;
    } = {},
  ): Promise<void> {
    const violation: RateLimitViolation = {
      identifier,
      endpoint: endpointType,
      timestamp: new Date(),
      violationType,
      userAgent: metadata.userAgent,
      ip: metadata.ip,
      userId: metadata.userId,
    };

    // Store violation
    const violations = this.violationHistory.get(identifier) || [];
    violations.push(violation);
    this.violationHistory.set(identifier, violations);

    // Mark IP as suspicious if multiple violations
    if (metadata.ip && violations.length >= 3) {
      this.suspiciousIPs.add(metadata.ip);
    }

    // Log violation
    await this.structuredLogger.warn('Rate limit violation detected', {
      metadata: {
        identifier,
        endpointType,
        violationType,
        violationCount: violations.length,
        ...metadata,
      },
    });

    // Auto-blacklist for severe violations
    if (violations.length >= 10 && metadata.ip) {
      this.blacklistedIPs.add(metadata.ip);
      await this.structuredLogger.error('IP auto-blacklisted due to repeated violations', {
        ip: metadata.ip,
        identifier,
        violationCount: violations.length,
      });
    }
  }

  /**
   * Get violation count for identifier
   */
  private getViolationCount(identifier: string): number {
    const violations = this.violationHistory.get(identifier) || [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return violations.filter(v => v.timestamp > oneHourAgo).length;
  }

  /**
   * Create allowed result
   */
  private createAllowedResult(reason: string): AdvancedRateLimitResult {
    return {
      allowed: true,
      remaining: 999,
      resetTime: new Date(Date.now() + 60000),
      totalHits: 1,
      violationLevel: 'none',
      suspiciousActivity: false,
      recommendedAction: 'allow',
      metadata: {
        previousViolations: 0,
        trustScore: 1.0,
      },
    };
  }

  /**
   * Create blocked result
   */
  private createBlockedResult(reason: string): AdvancedRateLimitResult {
    return {
      allowed: false,
      remaining: 0,
      resetTime: new Date(Date.now() + 60000),
      totalHits: 999,
      violationLevel: 'critical',
      suspiciousActivity: true,
      recommendedAction: 'block',
      metadata: {
        previousViolations: 999,
        trustScore: 0.0,
      },
    };
  }

  /**
   * Log rate limit check
   */
  private async logRateLimitCheck(
    identifier: string,
    endpointType: string,
    result: AdvancedRateLimitResult,
    metadata: any,
  ): Promise<void> {
    if (result.violationLevel !== 'none' || result.suspiciousActivity) {
      await this.structuredLogger.info('Rate limit check completed', {
        metadata: {
          identifier,
          endpointType,
          allowed: result.allowed,
          remaining: result.remaining,
          violationLevel: result.violationLevel,
          suspiciousActivity: result.suspiciousActivity,
          recommendedAction: result.recommendedAction,
          trustScore: result.metadata.trustScore,
          ...metadata,
        },
      });
    }
  }

  /**
   * Load whitelisted IPs from configuration
   */
  private loadWhitelistedIPs(): void {
    // Add localhost and common development IPs
    const defaultWhitelist = ['127.0.0.1', '::1', 'localhost'];
    defaultWhitelist.forEach(ip => this.whitelistedIPs.add(ip));

    // Load from environment variable if available
    const envWhitelist = process.env.RATE_LIMIT_WHITELIST;
    if (envWhitelist) {
      envWhitelist.split(',').forEach(ip => this.whitelistedIPs.add(ip.trim()));
    }
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    // Clean up old violations every hour
    setInterval(() => {
      this.cleanupOldViolations();
    }, 60 * 60 * 1000);

    // Clean up suspicious IPs every 24 hours
    setInterval(() => {
      this.cleanupSuspiciousIPs();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Clean up old violations
   */
  private cleanupOldViolations(): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [identifier, violations] of this.violationHistory.entries()) {
      const recentViolations = violations.filter(v => v.timestamp > oneDayAgo);
      
      if (recentViolations.length === 0) {
        this.violationHistory.delete(identifier);
      } else {
        this.violationHistory.set(identifier, recentViolations);
      }
    }
  }

  /**
   * Clean up suspicious IPs (remove after 24 hours without violations)
   */
  private cleanupSuspiciousIPs(): void {
    // This is a simplified cleanup - in production, you'd want more sophisticated logic
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    for (const ip of this.suspiciousIPs) {
      // Check if IP has recent violations
      let hasRecentViolations = false;
      
      for (const violations of this.violationHistory.values()) {
        if (violations.some(v => v.ip === ip && v.timestamp > oneWeekAgo)) {
          hasRecentViolations = true;
          break;
        }
      }
      
      if (!hasRecentViolations) {
        this.suspiciousIPs.delete(ip);
      }
    }
  }

  /**
   * Get rate limiting statistics
   */
  public getStatistics(): {
    totalViolations: number;
    suspiciousIPs: number;
    blacklistedIPs: number;
    whitelistedIPs: number;
    activeRateLimiters: number;
  } {
    let totalViolations = 0;
    for (const violations of this.violationHistory.values()) {
      totalViolations += violations.length;
    }

    return {
      totalViolations,
      suspiciousIPs: this.suspiciousIPs.size,
      blacklistedIPs: this.blacklistedIPs.size,
      whitelistedIPs: this.whitelistedIPs.size,
      activeRateLimiters: this.rateLimiters.size,
    };
  }

  /**
   * Manually whitelist an IP
   */
  public whitelistIP(ip: string): void {
    this.whitelistedIPs.add(ip);
    this.blacklistedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);
  }

  /**
   * Manually blacklist an IP
   */
  public blacklistIP(ip: string): void {
    this.blacklistedIPs.add(ip);
    this.whitelistedIPs.delete(ip);
  }

  /**
   * Reset rate limit for identifier
   */
  public resetRateLimit(identifier: string, endpointType?: string): void {
    if (endpointType) {
      const rateLimiter = this.rateLimiters.get(endpointType);
      if (rateLimiter) {
        rateLimiter.reset(identifier);
      }
    } else {
      // Reset for all endpoint types
      for (const rateLimiter of this.rateLimiters.values()) {
        rateLimiter.reset(identifier);
      }
    }

    // Clear violation history
    this.violationHistory.delete(identifier);
  }
}