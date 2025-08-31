import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { LoggingService } from './logging.service';
import { EmbedBuilder, TextChannel } from 'discord.js';

import {
  PUBGPlayer,
  PUBGPlayerStats,
  PUBGSeasonStats,
  PUBGMatch,
  PUBGSeason,
  PUBGAPIResponse,
  PUBGAPIError,
  PUBGPlatform,
  PUBGGameMode,
  PUBGLeaderboardEntry,
  PUBGRankTier,
  WeaponMasteryData,
  WeaponMasteryBadge,
  SurvivalMasteryData,
  SurvivalMasteryBadge,
  WeaponMedal,
  CircuitBreakerState,
  ApiOperationResult,
} from '../types/pubg';

// All interface definitions are now imported from '../types/pubg'

/**
 * PUBG API Service for fetching player data and statistics
 * Enhanced with retry logic, circuit breaker, and detailed logging
 */
export class PUBGService {
  private readonly api: AxiosInstance;
  private readonly logger: Logger;
  private readonly cache: CacheService;
  private readonly baseURL: string;
  private readonly apiKey: string | null;
  
  // Rate limiting properties
  private readonly rateLimitDelay: number = 1000; // 1 second between requests
  private lastRequestTime: number = 0;

  // Enhanced circuit breaker properties with better typing
  private circuitBreakerState: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private circuitBreakerFailures: number = 0;
  private circuitBreakerLastFailure: number = 0;
  private readonly circuitBreakerThreshold: number = 5;
  private readonly circuitBreakerTimeout: number = 60000; // 1 minute
  private readonly circuitBreakerHalfOpenMaxCalls: number = 3;
  private circuitBreakerHalfOpenCalls: number = 0;

  // Enhanced retry configuration
  private readonly maxRetries: number = 3;
  private readonly baseRetryDelay: number = 1000; // 1 second
  private readonly maxRetryDelay: number = 30000; // 30 seconds
  private readonly retryJitterFactor: number = 0.1;

  // Services
  private readonly loggingService: LoggingService | null = null;

  constructor(cache?: CacheService, loggingService?: LoggingService) {
    this.logger = new Logger();
    this.cache = cache || new CacheService();
    this.loggingService = loggingService || null;
    this.baseURL = process.env.PUBG_API_BASE_URL || 'https://api.pubg.com';
    
    // Validate and set API key
    const rawApiKey = process.env.PUBG_API_KEY;
    if (!rawApiKey || rawApiKey === 'your-pubg-api-key-here' || rawApiKey.length < 20) {
      this.apiKey = null;
      this.logger.warn(
        '⚠️ PUBG API key not configured or invalid. Some features will use mock data.'
      );
      this.logApiOperation(
        'PUBG API Configuration',
        'warning',
        'API key not configured or invalid',
        { service: 'PUBG', operation: 'Configuration' }
      );
    } else {
      this.apiKey = rawApiKey;
      this.logger.info('✅ PUBG API key configured successfully');
      this.logApiOperation('PUBG API Configuration', 'success', 'API key configured successfully', {
        service: 'PUBG',
        operation: 'Configuration',
      });
    }

    // Create axios instance with conditional authorization
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 seconds timeout
      headers: {
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/json',
        'User-Agent': 'HawkEsports-Bot/1.0',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Log API operations using the LoggingService
   */
  private async logApiOperation(
    operation: string,
    status: 'success' | 'error' | 'warning',
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.loggingService) {
      return;
    }

    try {
      const success = status === 'success';
      await this.loggingService.logApiOperation(
        'default-guild', // TODO: Get actual guild ID
        'PUBG',
        operation,
        success,
        undefined,
        status === 'error' ? message : undefined,
        metadata
      );
    } catch (error) {
      this.logger.error('Failed to log API operation:', error);
    }
  }

  /**
   * Check if circuit breaker is open with enhanced state management
   */
  private isCircuitBreakerOpen(): boolean {
    const now = Date.now();
    
    switch (this.circuitBreakerState) {
      case CircuitBreakerState.CLOSED:
        return false;
        
      case CircuitBreakerState.OPEN:
        const timeSinceLastFailure = now - this.circuitBreakerLastFailure;
        if (timeSinceLastFailure >= this.circuitBreakerTimeout) {
          this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
          this.circuitBreakerHalfOpenCalls = 0;
          return false;
        }
        return true;
        
      case CircuitBreakerState.HALF_OPEN:
        return this.circuitBreakerHalfOpenCalls >= this.circuitBreakerHalfOpenMaxCalls;
        
      default:
        return false;
    }
  }

  /**
   * Record circuit breaker failure with enhanced state management
   */
  private async recordCircuitBreakerFailure(): Promise<void> {
    this.circuitBreakerFailures++;
    this.circuitBreakerLastFailure = Date.now();

    switch (this.circuitBreakerState) {
      case CircuitBreakerState.CLOSED:
        if (this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
          this.circuitBreakerState = CircuitBreakerState.OPEN;
          this.logger.warn(
            `🔴 PUBG API Circuit breaker opened after ${this.circuitBreakerFailures} failures`
          );
          await this.logApiOperation(
            'PUBG API Circuit Breaker Opened',
            'error',
            `Circuit breaker opened after ${this.circuitBreakerFailures} consecutive failures. API calls will be blocked for ${this.circuitBreakerTimeout / 1000} seconds.`,
            {
              service: 'PUBG',
              operation: 'Circuit Breaker',
              failures: this.circuitBreakerFailures,
              timeoutSeconds: this.circuitBreakerTimeout / 1000,
              status: 'opened',
            }
          );
        }
        break;
        
      case CircuitBreakerState.HALF_OPEN:
        this.circuitBreakerState = CircuitBreakerState.OPEN;
        this.logger.warn('🔴 PUBG API Circuit breaker reopened after half-open failure');
        await this.logApiOperation(
          'PUBG API Circuit Breaker Reopened',
          'error',
          'Circuit breaker reopened after failure during half-open state',
          {
            service: 'PUBG',
            operation: 'Circuit Breaker',
            status: 'reopened',
          }
        );
        break;
        
      case CircuitBreakerState.OPEN:
        // Already open, just log additional failure
        this.logger.warn('🔴 PUBG API Additional failure while circuit breaker is open');
        break;
    }
  }

  /**
   * Reset circuit breaker on successful request
   */
  private async resetCircuitBreaker(): Promise<void> {
    const previousState = this.circuitBreakerState;
    
    switch (this.circuitBreakerState) {
      case CircuitBreakerState.HALF_OPEN:
        this.circuitBreakerHalfOpenCalls++;
        
        // If we've had enough successful calls in half-open state, close the circuit
        if (this.circuitBreakerHalfOpenCalls >= this.circuitBreakerHalfOpenMaxCalls) {
          this.circuitBreakerState = CircuitBreakerState.CLOSED;
          this.circuitBreakerFailures = 0;
          this.circuitBreakerLastFailure = 0;
          this.circuitBreakerHalfOpenCalls = 0;
          
          this.logger.info('🟢 PUBG API Circuit breaker closed after successful half-open period');
          await this.logApiOperation(
            'PUBG API Circuit Breaker Closed',
            'success',
            'Circuit breaker closed after successful half-open period',
            {
              service: 'PUBG',
              operation: 'Circuit Breaker',
              previousState,
              newState: this.circuitBreakerState,
              successfulHalfOpenCalls: this.circuitBreakerHalfOpenMaxCalls,
            }
          );
        }
        break;
        
      case CircuitBreakerState.OPEN:
        // This shouldn't happen as open circuit should prevent requests
        this.logger.warn('⚠️ Successful request received while circuit breaker is open');
        break;
        
      case CircuitBreakerState.CLOSED:
        // Reset failure count on successful request in closed state
        if (this.circuitBreakerFailures > 0) {
          this.circuitBreakerFailures = 0;
          this.circuitBreakerLastFailure = 0;
          
          this.logger.info('🟢 PUBG API Circuit breaker failures reset after successful request');
          await this.logApiOperation(
            'PUBG API Circuit Breaker Reset',
            'success',
            'Circuit breaker failures reset after successful API request',
            {
              service: 'PUBG',
              operation: 'Circuit Breaker',
              state: this.circuitBreakerState,
              status: 'failures_reset',
            }
          );
        }
        break;
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  /**
   * Calculate exponential backoff delay for retry attempts
   */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.baseRetryDelay * Math.pow(2, attempt);
    return Math.min(exponentialDelay, this.maxRetryDelay);
  }

  /**
   * Setup axios interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.api.interceptors.request.use(
      config => {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.rateLimitDelay) {
          const delay = this.rateLimitDelay - timeSinceLastRequest;
          return new Promise(resolve => {
            setTimeout(() => {
              this.lastRequestTime = Date.now();
              resolve(config);
            }, delay);
          });
        }

        this.lastRequestTime = now;

        // Log request for debugging
        this.logger.debug(`PUBG API Request: ${config.method?.toUpperCase()} ${config.url}`);

        return config;
      },
      async (error) => {
        this.logger.error('PUBG API request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      async (response: AxiosResponse) => {
        const duration = Date.now() - this.lastRequestTime;
        this.logger.debug(
          `✅ PUBG API Response: ${response.status} ${response.config.url} (${duration}ms)`
        );

        // Log successful request to channel
        this.logApiOperation('PUBG API Request', 'success', 'Request completed successfully', {
          service: 'PUBG',
          operation: 'API Request',
          method: response.config.method?.toUpperCase(),
          endpoint: response.config.url,
          statusCode: response.status,
          responseTime: duration,
        });

        // Reset circuit breaker on success
        await this.resetCircuitBreaker();

        return response;
      },
      async (error) => {
        const duration = Date.now() - this.lastRequestTime;
        const status = error.response?.status;
        const message = error.response?.data?.errors?.[0]?.detail || error.message;

        const errorInfo = {
          url: error.config?.url,
          method: error.config?.method,
          status,
          message,
        };

        let errorMessage = 'Unknown error';
        let retryAfter = null;

        // Handle specific error codes
        if (status === 429) {
          retryAfter = error.response.headers['retry-after'];
          errorMessage = `Rate limit exceeded. Retry after: ${retryAfter || '60'}s`;
          this.logger.warn('⏱️ PUBG API: Rate limit exceeded', {
            error: new Error(errorInfo.message || 'Rate limit exceeded'),
            metadata: {
              url: errorInfo.url,
              method: errorInfo.method,
              status: errorInfo.status
            }
          });
          if (retryAfter) {
            this.logger.info(`Rate limit retry after: ${retryAfter} seconds`);
          }
        } else if (status === 404) {
          errorMessage = 'Resource not found';
          this.logger.warn('🔍 PUBG API: Resource not found', {
            error: new Error(errorInfo.message || 'Resource not found'),
            metadata: {
              url: errorInfo.url,
              method: errorInfo.method,
              status: errorInfo.status
            }
          });
        } else if (status === 401) {
          errorMessage = 'Authentication failed. Check API key';
          this.logger.error('🔐 PUBG API: Authentication failed', {
            error: new Error(errorInfo.message || 'Authentication failed'),
            metadata: {
              url: errorInfo.url,
              method: errorInfo.method,
              status: errorInfo.status
            }
          });
        } else if (status >= 500) {
          errorMessage = `Server error (${status}): ${message}`;
          this.logger.error('🚨 PUBG API: Server error', {
            error: new Error(errorInfo.message || 'Server error'),
            metadata: {
              url: errorInfo.url,
              method: errorInfo.method,
              status: errorInfo.status
            }
          });
        } else {
          errorMessage = `HTTP ${status}: ${message}`;
          this.logger.error('❌ PUBG API response error:', {
            error: new Error(errorInfo.message || 'API response error'),
            metadata: {
              url: errorInfo.url,
              method: errorInfo.method,
              status: errorInfo.status
            }
          });
        }

        // Log error to channel
        this.logApiOperation('PUBG API Request', 'error', errorMessage, {
          service: 'PUBG',
          operation: 'API Request',
          method: error.config?.method?.toUpperCase(),
          endpoint: error.config?.url,
          statusCode: status,
          responseTime: duration,
          error: message,
          ...(retryAfter && { retryAfter: `${retryAfter}s` }),
        });

        // Record circuit breaker failure for server errors
        if (status && status >= 500) {
          await this.recordCircuitBreakerFailure();
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Execute API request with retry logic and circuit breaker
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.maxRetries
  ): Promise<T> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      const error = new Error(
        'Circuit breaker is open for PUBG API. Service temporarily unavailable.'
      );
      this.logger.warn(`🔴 ${operationName}: Circuit breaker is open`);
      throw error;
    }

    let lastError: Error | AxiosError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        const duration = Date.now() - startTime;

        if (attempt > 0) {
          this.logger.info(
            `✅ ${operationName}: Succeeded on attempt ${attempt + 1} (${duration}ms)`
          );
          this.logApiOperation(
            'PUBG API Retry',
            'success',
            `${operationName} succeeded after ${attempt} retries`,
            {
              service: 'PUBG',
              operation: operationName,
              attempts: attempt + 1,
              responseTime: duration,
            }
          );
        }

        // Reset circuit breaker on successful operation
        await this.resetCircuitBreaker();

        return result;
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
          this.logger.debug(`🚫 ${operationName}: Non-retryable error detected`);
          throw error;
        }

        if (attempt < maxRetries) {
          const baseDelay = this.calculateBackoffDelay(attempt);
          // Add jitter using the configured factor
          const jitter = baseDelay * this.retryJitterFactor * (Math.random() * 2 - 1);
          const delay = Math.min(
            Math.max(100, baseDelay + jitter), // Minimum 100ms delay
            this.maxRetryDelay // Maximum delay cap
          );
          this.logger.warn(
            `⚠️ ${operationName}: Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms`,
            {
              error: new Error(error.message || 'Operation failed'),
              metadata: {
                status: error.response?.status,
                attempt: attempt + 1,
                delay: Math.round(delay),
                jitter: Math.round(jitter)
              }
            }
          );

          this.logApiOperation(
            'PUBG API Retry',
            'warning',
            `${operationName} failed, retrying in ${Math.round(delay)}ms`,
            {
              service: 'PUBG',
              operation: operationName,
              attempt: `${attempt + 1}/${maxRetries + 1}`,
              error: error.message.substring(0, 100),
              delay: `${Math.round(delay)}ms`,
            }
          );

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    this.logger.error(`❌ ${operationName}: All ${maxRetries + 1} attempts failed`, {
      error: new Error(lastError.message || 'All attempts failed'),
      metadata: {
        ...(lastError && 'response' in lastError && lastError.response && { status: lastError.response.status }),
        maxRetries: maxRetries + 1
      }
    });

    this.logApiOperation(
      'PUBG API Retry Failed',
      'error',
      `${operationName} failed after ${maxRetries + 1} attempts`,
      {
        service: 'PUBG',
        operation: operationName,
        attempts: maxRetries + 1,
        error: lastError.message.substring(0, 100),
      }
    );

    throw lastError;
  }

  /**
   * Determines if an error should not be retried
   */
  private shouldNotRetry(error: any): boolean {
    // HTTP status codes that shouldn't be retried
    const nonRetryableStatuses = [400, 401, 403, 404, 422];
    if (error.response?.status && nonRetryableStatuses.includes(error.response.status)) {
      return true;
    }

    // Network errors that shouldn't be retried
    const nonRetryableCodes = ['ENOTFOUND', 'ECONNREFUSED', 'CERT_HAS_EXPIRED'];
    if (error.code && nonRetryableCodes.includes(error.code)) {
      return true;
    }

    return false;
  }

  /**
   * Get player by name
   */
  public async getPlayerByName(
    playerName: string,
    platform: PUBGPlatform = PUBGPlatform.STEAM
  ): Promise<PUBGPlayer | null> {
    try {
      // Validate input
      if (!playerName || typeof playerName !== 'string') {
        throw new Error('Player name is required and must be a string');
      }

      if (!this.validatePlayerName(playerName)) {
        throw new Error('Invalid player name format');
      }

      if (!Object.values(PUBGPlatform).includes(platform)) {
        throw new Error('Invalid platform');
      }

      const cacheKey = this.cache.keyGenerators.pubgPlayer(
        `${platform}:${playerName.toLowerCase()}`
      );
      const cached = await this.cache.get<PUBGPlayer>(cacheKey);

      if (cached) {
        this.logger.pubg('PLAYER_CACHE_HIT', cached.id);
        await this.logApiOperation(
          'PUBG Player Cache Hit',
          'success',
          'Player data served from cache',
          {
            service: 'PUBG',
            operation: 'Get Player',
            player: playerName,
            platform: platform,
            cached: true,
          }
        );
        return cached;
      }

      // Check if API key is available
      if (!this.apiKey) {
        this.logger.warn('PUBG API key not available, returning mock player data');
        return this.createMockPlayer(playerName, platform);
      }

      const player = await this.executeWithRetry(async () => {
        const response = await this.api.get<PUBGAPIResponse<PUBGPlayer[]>>(
          `/shards/${platform}/players`,
          {
            params: {
              'filter[playerNames]': playerName,
            },
          }
        );

        const players = response.data.data;
        if (!players || players.length === 0) {
          this.logger.warn(`Player not found: ${playerName} on ${platform}`);
          return null;
        }

        const playerData = players[0];

        // Validate player data
        if (!playerData || !playerData.id || !(playerData as any).attributes?.name) {
          this.logger.error('Invalid player data received from API');
          return null;
        }

        return playerData;
      }, `getPlayerByName(${playerName})`);

      if (player) {
        // Cache for 1 hour
        await this.cache.set(cacheKey, player, 3600);
        this.logger.pubg('PLAYER_FETCHED', player.id || 'unknown');
      }

      return player;
    } catch (error) {
      this.logger.error(`Failed to get player ${playerName}:`, {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          platform,
          playerName
        }
      });

      // Try to return stale cache data
      const cacheKey = this.cache.keyGenerators.pubgPlayer(
        `${platform}:${playerName.toLowerCase()}`
      );
      const staleCache = await this.cache.get<PUBGPlayer>(cacheKey);
      if (staleCache) {
        this.logger.info(`📦 Returning stale cache for player: ${playerName}`);
        await this.logApiOperation(
          'PUBG API Stale Cache',
          'warning',
          'Serving stale cached data due to API failure',
          {
            service: 'PUBG',
            operation: 'Get Player',
            player: playerName,
            platform: platform,
            cached: true,
            stale: true,
          }
        );
        return staleCache;
      }

      // Return mock data for fallback only in development
      if (process.env.NODE_ENV === 'development') {
        return this.createMockPlayer(playerName, platform);
      }

      return null;
    }
  }

  /**
   * Get player statistics
   */
  public async getPlayerStats(
    playerId: string,
    platform: PUBGPlatform,
    seasonId?: string
  ): Promise<PUBGPlayerStats | null> {
    try {
      const currentSeason = seasonId || (await this.getCurrentSeason(platform));
      if (!currentSeason) {
        this.logger.error('No current season found');
        return null;
      }

      const cacheKey = this.cache.keyGenerators.pubgStats(playerId, currentSeason, 'all');
      const cached = await this.cache.get<PUBGPlayerStats>(cacheKey);

      if (cached) {
        this.logger.pubg('STATS_CACHE_HIT', playerId);
        await this.logApiOperation(
          'PUBG Player Stats Cache Hit',
          'success',
          'Player stats served from cache',
          {
            service: 'PUBG',
            operation: 'Get Player Stats',
            playerId: playerId.substring(0, 20) + '...',
            platform: platform,
            season: currentSeason,
            cached: true,
          }
        );
        return cached;
      }

      // Check if API key is available
      if (!this.apiKey) {
        this.logger.warn('PUBG API key not available, returning null for player stats');
        return null;
      }

      const stats = await this.executeWithRetry(async () => {
        const response = await this.api.get<PUBGAPIResponse<PUBGPlayerStats>>(
          `/shards/${platform}/players/${playerId}/seasons/${currentSeason}`
        );

        return response.data.data;
      }, `getPlayerStats(${playerId})`);

      if (stats) {
        // Cache for 30 minutes
        await this.cache.set(cacheKey, stats, 1800);
        this.logger.pubg('STATS_FETCHED', playerId);
      }

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get player stats for ${playerId}:`, error);

      // Try to return stale cache data
      const cacheKey = this.cache.keyGenerators.pubgStats(playerId, seasonId || 'current', 'all');
      const staleCache = await this.cache.get<PUBGPlayerStats>(cacheKey);
      if (staleCache) {
        this.logger.info(`📦 Returning stale cache for player stats: ${playerId}`);
        await this.logApiOperation(
          'PUBG API Stale Cache',
          'warning',
          'Serving stale cached stats due to API failure',
          {
            service: 'PUBG',
            operation: 'Get Player Stats',
            playerId: playerId.substring(0, 20) + '...',
            platform: platform,
            cached: true,
            stale: true,
          }
        );
        return staleCache;
      }

      return null;
    }
  }

  /**
   * Get player season statistics for specific game mode
   */
  public async getSeasonStats(
    playerId: string,
    platform: PUBGPlatform,
    seasonId: string,
    gameMode: PUBGGameMode
  ): Promise<PUBGSeasonStats | null> {
    try {
      const cacheKey = this.cache.keyGenerators.pubgStats(playerId, seasonId, gameMode);
      const cached = await this.cache.get<PUBGSeasonStats>(cacheKey);

      if (cached) {
        this.logger.pubg('SEASON_STATS_CACHE_HIT', playerId);
        return cached;
      }

      const response = await this.api.get<PUBGAPIResponse<PUBGSeasonStats>>(
        `/shards/${platform}/players/${playerId}/seasons/${seasonId}/ranked`
      );

      const seasonStats = response.data.data;

      // Cache for 1 hour
      await this.cache.set(cacheKey, seasonStats, 3600);

      this.logger.pubg('SEASON_STATS_FETCHED', playerId);
      return seasonStats;
    } catch (error) {
      this.logger.error(`Failed to get season stats for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Get player recent matches
   */
  public async getPlayerMatches(playerId: string, platform: PUBGPlatform): Promise<PUBGMatch[]> {
    const cacheKey = `pubg:matches:${playerId}`;

    try {
      const cached = await this.cache.get<PUBGMatch[]>(cacheKey);

      if (cached) {
        this.logger.pubg('MATCHES_CACHE_HIT', playerId);
        await this.logApiOperation(
          'PUBG Player Matches Cache Hit',
          'success',
          'Player matches served from cache',
          {
            service: 'PUBG',
            operation: 'Get Player Matches',
            playerId: playerId.substring(0, 20) + '...',
            platform: platform,
            matchesCount: cached.length,
            cached: true,
          }
        );
        return cached;
      }

      // Check if API key is available
      if (!this.apiKey) {
        this.logger.warn('PUBG API key not available, returning empty matches array');
        return [];
      }

      const matches = await this.executeWithRetry(async () => {
        const response = await this.api.get<
          PUBGAPIResponse<{ relationships: { matches: { data: { id: string }[] } } }>
        >(`/shards/${platform}/players/${playerId}`);

        const matchIds = response.data.data.relationships.matches.data.map(match => match.id);
        const matchDetails: PUBGMatch[] = [];

        // Fetch details for each match (limit to 5 most recent)
        for (const matchId of matchIds.slice(0, 5)) {
          const match = await this.getMatch(matchId, platform);
          if (match) {
            matchDetails.push(match);
          }
        }

        return matchDetails;
      }, `getPlayerMatches(${playerId})`);

      // Cache for 15 minutes
      await this.cache.set(cacheKey, matches, 900);

      this.logger.pubg('MATCHES_FETCHED', playerId);
      return matches;
    } catch (error) {
      this.logger.error(`Failed to get matches for ${playerId}:`, error);

      // Try to return stale cache data
      const staleCache = await this.cache.get<PUBGMatch[]>(cacheKey);
      if (staleCache) {
        this.logger.info(`📦 Returning stale cache for player matches: ${playerId}`);
        await this.logApiOperation(
          'PUBG Player Matches Stale Cache',
          'warning',
          'Serving stale cached matches due to API failure',
          {
            service: 'PUBG',
            operation: 'Get Player Matches',
            playerId: playerId.substring(0, 20) + '...',
            platform: platform,
            matchesCount: staleCache.length,
            cached: true,
            stale: true,
          }
        );
        return staleCache;
      }

      return [];
    }
  }

  /**
   * Get match details
   */
  public async getMatch(matchId: string, platform: PUBGPlatform): Promise<PUBGMatch | null> {
    try {
      const cacheKey = `pubg:match:${matchId}`;
      const cached = await this.cache.get<PUBGMatch>(cacheKey);

      if (cached) {
        return cached;
      }

      const response = await this.api.get<PUBGAPIResponse<PUBGMatch>>(
        `/shards/${platform}/matches/${matchId}`
      );

      const match = response.data.data;

      // Cache for 24 hours (matches don't change)
      await this.cache.set(cacheKey, match, 86400);

      return match;
    } catch (error) {
      this.logger.error(`Failed to get match ${matchId}:`, error);
      return null;
    }
  }

  /**
   * Get current season
   */
  public async getCurrentSeason(platform: PUBGPlatform): Promise<string | null> {
    try {
      const cacheKey = `pubg:season:current:${platform}`;
      const cached = await this.cache.get<string>(cacheKey);

      if (cached) {
        return cached;
      }

      // Check if API key is available
      if (!this.apiKey || this.apiKey === 'your-pubg-api-key-here') {
        this.logger.warn('PUBG API key not configured, using fallback season');
        const fallbackSeason = 'division.bro.official.pc-2018-01';
        await this.cache.set(cacheKey, fallbackSeason, 3600); // Cache for 1 hour
        return fallbackSeason;
      }

      const response = await this.api.get<PUBGAPIResponse<PUBGSeason[]>>(
        `/shards/${platform}/seasons`
      );

      const seasons = response.data.data;
      const currentSeason = seasons.find(season => season.isCurrentSeason);

      if (!currentSeason) {
        this.logger.warn('No current season found from API, using fallback');
        const fallbackSeason = 'division.bro.official.pc-2018-01';
        await this.cache.set(cacheKey, fallbackSeason, 3600); // Cache for 1 hour
        return fallbackSeason;
      }

      // Cache for 24 hours
      await this.cache.set(cacheKey, currentSeason.id, 86400);

      return currentSeason.id;
    } catch (error) {
      this.logger.warn('Failed to get current season from API, using fallback:', error.message);
      const fallbackSeason = 'division.bro.official.pc-2018-01';
      const cacheKey = `pubg:season:current:${platform}`;
      await this.cache.set(cacheKey, fallbackSeason, 3600); // Cache for 1 hour
      return fallbackSeason;
    }
  }

  /**
   * Get leaderboard for a specific game mode and season
   */
  public async getLeaderboard(
    platform: PUBGPlatform,
    gameMode: PUBGGameMode,
    seasonId?: string
  ): Promise<PUBGLeaderboardEntry[]> {
    const currentSeason = seasonId || (await this.getCurrentSeason(platform));
    if (!currentSeason) {
      return [];
    }

    const cacheKey = `pubg:leaderboard:${platform}:${gameMode}:${currentSeason}`;

    try {
      const cached = await this.cache.get<PUBGLeaderboardEntry[]>(cacheKey);

      if (cached) {
        this.logger.pubg('LEADERBOARD_CACHE_HIT');
        await this.logApiOperation(
          'PUBG Leaderboard Cache Hit',
          'success',
          'Leaderboard served from cache',
          {
            service: 'PUBG',
            operation: 'Get Leaderboard',
            platform: platform,
            gameMode: gameMode,
            season: currentSeason,
            entries: cached.length,
            cached: true,
          }
        );
        return cached;
      }

      // Check if API key is available
      if (!this.apiKey) {
        this.logger.warn('PUBG API key not available, returning empty leaderboard');
        return [];
      }

      const leaderboard = await this.executeWithRetry(async () => {
        const response = await this.api.get<PUBGAPIResponse<any>>(
          `/shards/${platform}/leaderboards/${currentSeason}/${gameMode}`
        );

        // Transform API response to leaderboard entries
        return response.data.data.map((entry: any, index: number) => ({
          rank: index + 1,
          playerId: entry.id,
          playerName: entry.attributes.name,
          stats: {
            rankPoints: entry.attributes.stats.rankPoints || 0,
            wins: entry.attributes.stats.wins || 0,
            games: entry.attributes.stats.games || 0,
            winRatio: entry.attributes.stats.winRatio || 0,
            averageDamage: entry.attributes.stats.averageDamage || 0,
            kills: entry.attributes.stats.kills || 0,
            kda: entry.attributes.stats.kda || 0,
            tier: entry.attributes.stats.tier || PUBGRankTier.BRONZE,
            subTier: entry.attributes.stats.subTier || 'V',
          },
          change: {
            rank: 0, // API doesn't provide rank change
            points: 0, // API doesn't provide points change
          },
          lastUpdated: new Date().toISOString(),
        }));
      }, `getLeaderboard(${platform}, ${gameMode})`);

      // Cache for 1 hour
      await this.cache.set(cacheKey, leaderboard, 3600);

      this.logger.pubg('LEADERBOARD_FETCHED');
      return leaderboard;
    } catch (error) {
      this.logger.error('Failed to get leaderboard:', error);

      // Try to return stale cache data
      const staleCache = await this.cache.get<PUBGLeaderboardEntry[]>(cacheKey);
      if (staleCache) {
        this.logger.info(`📦 Returning stale cache for leaderboard: ${platform}/${gameMode}`);
        await this.logApiOperation(
          'PUBG Leaderboard Stale Cache',
          'warning',
          'Serving stale cached leaderboard due to API failure',
          {
            service: 'PUBG',
            operation: 'Get Leaderboard',
            platform: platform,
            gameMode: gameMode,
            entries: staleCache.length,
            cached: true,
            stale: true,
          }
        );
        return staleCache;
      }

      return [];
    }
  }

  /**
   * Validate player name format
   */
  public validatePlayerName(playerName: string): boolean {
    if (!playerName || typeof playerName !== 'string') {
      return false;
    }

    // Trim whitespace
    playerName = playerName.trim();

    // PUBG player names are 3-16 characters, alphanumeric and some special characters
    const regex = /^[a-zA-Z0-9_-]{3,16}$/;

    // Additional checks
    if (playerName.length < 3 || playerName.length > 16) {
      return false;
    }

    // Check for consecutive special characters
    if (/[_-]{2,}/.test(playerName)) {
      return false;
    }

    // Check for starting/ending with special characters
    if (/^[_-]|[_-]$/.test(playerName)) {
      return false;
    }

    return regex.test(playerName);
  }

  /**
   * Get supported platforms
   */
  public getSupportedPlatforms(): PUBGPlatform[] {
    return Object.values(PUBGPlatform);
  }

  /**
   * Get supported game modes
   */
  public getSupportedGameModes(): PUBGGameMode[] {
    return Object.values(PUBGGameMode);
  }

  /**
   * Calculate KDA ratio
   */
  public calculateKDA(kills: number, deaths: number, assists: number): number {
    if (deaths === 0) {
      return kills + assists;
    }
    return parseFloat(((kills + assists) / deaths).toFixed(2));
  }

  /**
   * Calculate win rate percentage
   */
  public calculateWinRate(wins: number, totalGames: number): number {
    if (totalGames === 0) {
      return 0;
    }
    return parseFloat(((wins / totalGames) * 100).toFixed(2));
  }

  /**
   * Calculate average damage per game
   */
  public calculateAverageDamage(totalDamage: number, totalGames: number): number {
    if (totalGames === 0) {
      return 0;
    }
    return parseFloat((totalDamage / totalGames).toFixed(2));
  }

  /**
   * Get rank tier color for embeds
   */
  public getRankTierColor(tier: PUBGRankTier): string {
    const colors: Record<PUBGRankTier, string> = {
      [PUBGRankTier.BRONZE]: '#CD7F32',
      [PUBGRankTier.SILVER]: '#C0C0C0',
      [PUBGRankTier.GOLD]: '#FFD700',
      [PUBGRankTier.PLATINUM]: '#E5E4E2',
      [PUBGRankTier.DIAMOND]: '#B9F2FF',
      [PUBGRankTier.MASTER]: '#FF6B6B',
      [PUBGRankTier.GRANDMASTER]: '#9B59B6',
    };
    return colors[tier] || '#000000';
  }

  /**
   * Format rank display string
   */
  public formatRank(tier: PUBGRankTier, subTier: string): string {
    return `${tier} ${subTier}`;
  }

  /**
   * Check if API is available
   */
  public async isAPIAvailable(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        this.logger.warn('PUBG API key not configured');
        return false;
      }

      // Use a lightweight endpoint to check API availability
      const response = await Promise.race([
        this.api.get('/status'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('API check timeout')), 5000)),
      ]);

      this.logger.info('✅ PUBG API is available');
      return true;
    } catch (error) {
      this.logger.error('❌ PUBG API is not available:', {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { hasApiKey: !!this.apiKey },
      });
      return false;
    }
  }

  /**
   * Create mock player data for fallback
   */
  private createMockPlayer(playerName: string, platform: PUBGPlatform): PUBGPlayer {
    return {
      id: `mock_${playerName}_${Date.now()}`,
      name: playerName,
      platform: platform,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      patchVersion: '',
      titleId: 'pubg',
      shardId: platform,
      stats: undefined,
      seasonStats: [],
      recentMatches: [],
    };
  }

  /**
   * Get weapon mastery data for a player
   */
  public async getWeaponMastery(playerId: string, platform: PUBGPlatform): Promise<any | null> {
    try {
      const cacheKey = `pubg:weapon_mastery:${playerId}`;
      const cached = await this.cache.get<any>(cacheKey);

      if (cached) {
        this.logger.pubg('WEAPON_MASTERY_CACHE_HIT', playerId);
        return cached;
      }

      // Check if API key is available
      if (!this.apiKey) {
        this.logger.warn('PUBG API key not available, returning null for weapon mastery');
        return null;
      }

      const response = await this.api.get<PUBGAPIResponse<any>>(
        `/shards/${platform}/players/${playerId}/weapon_mastery`
      );

      const weaponMastery = response.data.data;

      // Cache for 1 hour
      await this.cache.set(cacheKey, weaponMastery, 3600);

      this.logger.pubg('WEAPON_MASTERY_FETCHED', playerId);
      return weaponMastery;
    } catch (error) {
      this.logger.error(`Failed to get weapon mastery for ${playerId}:`, error);
      // Return null to trigger fallback in extractWeaponMasteryBadges
      return null;
    }
  }

  /**
   * Get survival mastery data for a player
   */
  public async getSurvivalMastery(playerId: string, platform: PUBGPlatform): Promise<any | null> {
    try {
      const cacheKey = `pubg:survival_mastery:${playerId}`;
      const cached = await this.cache.get<any>(cacheKey);

      if (cached) {
        this.logger.pubg('SURVIVAL_MASTERY_CACHE_HIT', playerId);
        return cached;
      }

      const response = await this.api.get<PUBGAPIResponse<any>>(
        `/shards/${platform}/players/${playerId}/survival_mastery`
      );

      const survivalMastery = response.data.data;

      // Cache for 1 hour
      await this.cache.set(cacheKey, survivalMastery, 3600);

      this.logger.pubg('SURVIVAL_MASTERY_FETCHED', playerId);
      return survivalMastery;
    } catch (error) {
      this.logger.error(`Failed to get survival mastery for ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Complete list of all PUBG weapons
   */
  private readonly ALL_PUBG_WEAPONS = [
    // Assault Rifles
    'AKM',
    'M416',
    'SCAR-L',
    'M16A4',
    'AUG',
    'Groza',
    'Beryl M762',
    'QBZ',
    'G36C',
    'K2',
    'MK47 Mutant',
    'ACE32',
    'FAMAS',
    // SMGs
    'UMP45',
    'Vector',
    'Uzi',
    'Tommy Gun',
    'MP5K',
    'Bizon',
    'P90',
    'MP9',
    'JS9',
    // Sniper Rifles
    'Kar98k',
    'M24',
    'AWM',
    'Win94',
    'Mosin Nagant',
    'Lynx AMR',
    'M40A5',
    // DMRs
    'SKS',
    'Mini 14',
    'Mk14 EBR',
    'SLR',
    'QBU',
    'VSS',
    'Dragunov',
    // LMGs
    'M249',
    'DP-27',
    'DP-28',
    'MG3',
    // Shotguns
    'S1897',
    'S686',
    'S12K',
    'DBS',
    'Sawed-off',
    'O12',
    // Pistols
    'P92',
    'P1911',
    'P18C',
    'R1895',
    'R45',
    'Skorpion',
    'Deagle',
    'P320',
    // Crossbows
    'Crossbow',
    // Throwables
    'Frag Grenade',
    'Smoke Grenade',
    'Stun Grenade',
    'Molotov Cocktail',
    'C4',
    'Decoy Grenade',
    'Sticky Bomb',
    // Melee
    'Pan',
    'Crowbar',
    'Sickle',
    'Machete',
    'Katana',
  ];

  /**
   * Map weapon keys to display names
   */
  private getWeaponDisplayName(weaponKey: string): string {
    const weaponMap: Record<string, string> = {
      Item_Weapon_AK47_C: 'AKM',
      Item_Weapon_M416_C: 'M416',
      'Item_Weapon_SCAR-L_C': 'SCAR-L',
      Item_Weapon_M16A4_C: 'M16A4',
      Item_Weapon_AUG_C: 'AUG',
      Item_Weapon_Groza_C: 'Groza',
      Item_Weapon_Beryl762_C: 'Beryl M762',
      Item_Weapon_QBZ95_C: 'QBZ',
      Item_Weapon_G36C_C: 'G36C',
      Item_Weapon_K2_C: 'K2',
      Item_Weapon_Mk47Mutant_C: 'MK47 Mutant',
      Item_Weapon_ACE32_C: 'ACE32',
      Item_Weapon_FAMAS_C: 'FAMAS',
      Item_Weapon_UMP_C: 'UMP45',
      Item_Weapon_Vector_C: 'Vector',
      Item_Weapon_Uzi_C: 'Uzi',
      Item_Weapon_Thompson_C: 'Tommy Gun',
      Item_Weapon_MP5K_C: 'MP5K',
      Item_Weapon_PP19Bizon_C: 'Bizon',
      Item_Weapon_P90_C: 'P90',
      Item_Weapon_MP9_C: 'MP9',
      Item_Weapon_JS9_C: 'JS9',
      Item_Weapon_Kar98k_C: 'Kar98k',
      Item_Weapon_M24_C: 'M24',
      Item_Weapon_AWM_C: 'AWM',
      Item_Weapon_Win1894_C: 'Win94',
      Item_Weapon_Mosin_C: 'Mosin Nagant',
      Item_Weapon_LynxAMR_C: 'Lynx AMR',
      Item_Weapon_M40A5_C: 'M40A5',
      Item_Weapon_SKS_C: 'SKS',
      Item_Weapon_Mini14_C: 'Mini 14',
      Item_Weapon_Mk14_C: 'Mk14 EBR',
      Item_Weapon_SLR_C: 'SLR',
      Item_Weapon_QBU88_C: 'QBU',
      Item_Weapon_VSS_C: 'VSS',
      Item_Weapon_Dragunov_C: 'Dragunov',
      Item_Weapon_M249_C: 'M249',
      Item_Weapon_DP27_C: 'DP-27',
      Item_Weapon_DP28_C: 'DP-28',
      Item_Weapon_MG3_C: 'MG3',
      Item_Weapon_Winchester_C: 'S1897',
      Item_Weapon_DoubleBarrel_C: 'S686',
      Item_Weapon_Saiga12_C: 'S12K',
      Item_Weapon_DBS_C: 'DBS',
      Item_Weapon_SawedOff_C: 'Sawed-off',
      Item_Weapon_OriginS12_C: 'O12',
      Item_Weapon_Beretta686_C: 'S686',
      Item_Weapon_P92_C: 'P92',
      Item_Weapon_M1911_C: 'P1911',
      Item_Weapon_Glock_C: 'P18C',
      Item_Weapon_Rhino_C: 'R1895',
      Item_Weapon_R45_C: 'R45',
      Item_Weapon_vz61Skorpion_C: 'Skorpion',
      Item_Weapon_DesertEagle_C: 'Deagle',
      Item_Weapon_P320_C: 'P320',
      Item_Weapon_Crossbow_C: 'Crossbow',
      Item_Weapon_FlashBang_C: 'Stun Grenade',
      Item_Weapon_Grenade_C: 'Frag Grenade',
      Item_Weapon_SmokeBomb_C: 'Smoke Grenade',
      Item_Weapon_Molotov_C: 'Molotov Cocktail',
      Item_Weapon_C4_C: 'C4',
      Item_Weapon_DecoyGrenade_C: 'Decoy Grenade',
      Item_Weapon_StickyBomb_C: 'Sticky Bomb',
      Item_Weapon_Pan_C: 'Pan',
      Item_Weapon_Crowbar_C: 'Crowbar',
      Item_Weapon_Sickle_C: 'Sickle',
      Item_Weapon_Machete_C: 'Machete',
      Item_Weapon_Katana_C: 'Katana',
    };

    // Try exact match first
    if (weaponMap[weaponKey]) {
      return weaponMap[weaponKey];
    }

    // Fallback to cleaning the key
    return weaponKey
      .replace('Item_Weapon_', '')
      .replace('_C', '')
      .replace(/([A-Z])/g, ' $1')
      .trim();
  }

  /**
   * Extract weapon mastery badges from API data
   */
  public extractWeaponMasteryBadges(weaponMasteryData: any): Array<{
    weaponName: string;
    level: number;
    xp: number;
    medals: any[];
    tier: string;
  }> {
    if (!weaponMasteryData?.attributes?.weaponMasterySummary?.weaponSummaries) {
      // If no API data, return all weapons with level 0
      return this.ALL_PUBG_WEAPONS.map(weaponName => ({
        weaponName,
        level: 0,
        xp: 0,
        medals: [],
        tier: 'Bronze',
      }));
    }

    const badges: Array<{
      weaponName: string;
      level: number;
      xp: number;
      medals: any[];
      tier: string;
    }> = [];

    const weaponSummaries = weaponMasteryData.attributes.weaponMasterySummary.weaponSummaries;
    const processedWeapons = new Set<string>();

    // Process weapons from API data
    for (const [weaponKey, weaponData] of Object.entries(weaponSummaries)) {
      const weapon = weaponData as any;
      const weaponName = this.getWeaponDisplayName(weaponKey);

      // Calculate tier based on level
      const level = weapon.Level || 0;
      let tier = 'Bronze';
      if (level >= 80) {
        tier = 'Legendary';
      } else if (level >= 60) {
        tier = 'Epic';
      } else if (level >= 40) {
        tier = 'Rare';
      } else if (level >= 20) {
        tier = 'Uncommon';
      }

      badges.push({
        weaponName,
        level,
        xp: weapon.XP || 0,
        medals: weapon.Medals || [],
        tier,
      });

      processedWeapons.add(weaponName);
    }

    // Add missing weapons with level 0
    for (const weaponName of this.ALL_PUBG_WEAPONS) {
      if (!processedWeapons.has(weaponName)) {
        badges.push({
          weaponName,
          level: 0,
          xp: 0,
          medals: [],
          tier: 'Bronze',
        });
      }
    }

    return badges.sort((a, b) => b.level - a.level || a.weaponName.localeCompare(b.weaponName));
  }

  /**
   * Extract survival mastery badges from API data
   */
  public extractSurvivalMasteryBadges(survivalMasteryData: any): Array<{
    category: string;
    level: number;
    xp: number;
    tier: string;
  }> {
    if (!survivalMasteryData?.attributes) {
      return [];
    }

    const badges: Array<{
      category: string;
      level: number;
      xp: number;
      tier: string;
    }> = [];

    const attributes = survivalMasteryData.attributes;

    // Extract different survival categories
    const categories = [
      { key: 'fortitude', name: 'Fortitude' },
      { key: 'healing', name: 'Healing' },
      { key: 'support', name: 'Support' },
      { key: 'weapons', name: 'Weapons' },
      { key: 'driving', name: 'Driving' },
    ];

    for (const category of categories) {
      const categoryData = attributes[category.key];
      if (categoryData) {
        const level = categoryData.level || 0;
        let tier = 'Bronze';
        if (level >= 80) {
          tier = 'Legendary';
        } else if (level >= 60) {
          tier = 'Epic';
        } else if (level >= 40) {
          tier = 'Rare';
        } else if (level >= 20) {
          tier = 'Uncommon';
        }

        badges.push({
          category: category.name,
          level,
          xp: categoryData.xp || 0,
          tier,
        });
      }
    }

    return badges.sort((a, b) => b.level - a.level);
  }

  /**
   * Clear all PUBG-related cache
   */
  public async clearCache(): Promise<void> {
    try {
      const patterns = [
        'pubg:player:*',
        'pubg:stats:*',
        'pubg:matches:*',
        'pubg:match:*',
        'pubg:season:*',
        'pubg:leaderboard:*',
        'pubg:weapon_mastery:*',
        'pubg:survival_mastery:*',
      ];

      for (const pattern of patterns) {
        await this.cache.clearPattern(pattern);
      }

      this.logger.info('🧹 PUBG cache cleared successfully');
    } catch (error) {
      this.logger.error('Failed to clear PUBG cache:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<{
    totalKeys: number;
    patterns: Record<string, number>;
  }> {
    try {
      const patterns = {
        'pubg:player:*': 0,
        'pubg:stats:*': 0,
        'pubg:matches:*': 0,
        'pubg:leaderboard:*': 0,
        'pubg:weapon_mastery:*': 0,
        'pubg:survival_mastery:*': 0,
      };

      let totalKeys = 0;
      for (const pattern of Object.keys(patterns)) {
        const keys = await this.cache.keys(pattern);
        (patterns as any)[pattern] = keys.length;
        totalKeys += keys.length;
      }

      return { totalKeys, patterns };
    } catch (error) {
      this.logger.error('Failed to get cache stats:', error);
      return { totalKeys: 0, patterns: {} };
    }
  }

  /**
   * Health check for PUBG API service
   * @returns Promise<{ status: string; api: boolean; cache: boolean; circuitBreaker: string; metrics: object }>
   */
  public async healthCheck(): Promise<{
    status: string;
    api: boolean;
    cache: boolean;
    circuitBreaker: string;
    metrics: {
      failures: number;
      lastFailure: string | null;
      timeoutRemaining: number;
    };
  }> {
    const startTime = Date.now();
    const health = {
      status: 'healthy',
      api: false,
      cache: false,
      circuitBreaker: 'closed',
      metrics: {
        failures: this.circuitBreakerFailures,
        lastFailure: this.circuitBreakerLastFailure
          ? new Date(this.circuitBreakerLastFailure).toISOString()
          : null,
        timeoutRemaining: 0,
      },
    };

    try {
      // Check circuit breaker status
      if (this.isCircuitBreakerOpen()) {
        health.circuitBreaker = 'open';
        health.metrics.timeoutRemaining = Math.max(
          0,
          this.circuitBreakerTimeout - (Date.now() - this.circuitBreakerLastFailure)
        );
      } else if (this.circuitBreakerFailures > 0) {
        health.circuitBreaker = 'half-open';
      }

      // Test cache
      const cacheTestKey = 'pubg:health:test';
      const cacheTestValue = `test-${Date.now()}`;
      await this.cache.set(cacheTestKey, cacheTestValue, 10);
      const cacheTest = await this.cache.get(cacheTestKey);
      health.cache = cacheTest === cacheTestValue;

      if (health.cache) {
        // Cache cleanup would be handled by cache service
      }

      // Test API (only if we have an API key and circuit breaker is not open)
      if (this.apiKey && !this.isCircuitBreakerOpen()) {
        try {
          // Simple API test - get platform info
          const response = await this.api.get('/shards/steam', { timeout: 5000 });
          health.api = response.status === 200;

          if (health.api) {
            // Reset circuit breaker on successful health check
            await this.resetCircuitBreaker();
          }
        } catch (error: any) {
          this.logger.warn('PUBG API health check failed:', {
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: { status: error.response?.status },
          });
          health.api = false;

          // Record failure for server errors
          if (error.response?.status >= 500) {
            await this.recordCircuitBreakerFailure();
          }
        }
      } else if (!this.apiKey) {
        this.logger.warn('PUBG API key not configured, skipping API health check');
        health.api = false;
      } else {
        this.logger.warn('PUBG API health check skipped - circuit breaker is open');
        health.api = false;
      }

      // Overall status
      if (!health.api && !health.cache) {
        health.status = 'unhealthy';
      } else if (!health.api || !health.cache || health.circuitBreaker === 'open') {
        health.status = 'degraded';
      }
    } catch (error: any) {
      this.logger.error('Health check failed:', error);
      health.status = 'unhealthy';
      health.api = false;
      health.cache = false;
    }

    const duration = Date.now() - startTime;
    this.logger.info(`PUBG Service health check: ${health.status} (${duration}ms)`, {
      metadata: { health, duration },
    });

    // Log health check to channel
    this.logApiOperation(
      'PUBG API Health Check',
      health.status === 'healthy' ? 'success' : health.status === 'degraded' ? 'warning' : 'error',
      `Service health: ${health.status}`,
      {
        service: 'PUBG',
        operation: 'Health Check',
        apiStatus: health.api ? 'Online' : 'Offline',
        cacheStatus: health.cache ? 'Online' : 'Offline',
        circuitBreaker: health.circuitBreaker,
        responseTime: duration,
        failures: health.metrics.failures,
        timeoutRemaining:
          health.metrics.timeoutRemaining > 0
            ? `${Math.round(health.metrics.timeoutRemaining / 1000)}s`
            : 'N/A',
      }
    );

    return health;
  }
}
