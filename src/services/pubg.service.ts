import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
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
} from '../types/pubg';

/**
 * PUBG API Service for fetching player data and statistics
 */
export class PUBGService {
  private api: AxiosInstance;
  private logger: Logger;
  private cache: CacheService;
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly rateLimitDelay: number = 1000; // 1 second between requests
  private lastRequestTime: number = 0;

  constructor() {
    this.logger = new Logger();
    this.cache = new CacheService();
    this.baseURL = process.env.PUBG_API_BASE_URL || 'https://api.pubg.com';
    this.apiKey = process.env.PUBG_API_KEY || '';

    if (!this.apiKey) {
      this.logger.warn('PUBG API key not provided. PUBG features will be limited.');
    }

    this.api = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
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
        return config;
      },
      (error) => {
        this.logger.error('PUBG API request error:', error);
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        this.logger.pubg('API_SUCCESS', undefined, response.config.timeout, {
          url: response.config.url,
          status: response.status,
        });
        return response;
      },
      (error) => {
        const status = error.response?.status;
        const message = error.response?.data?.errors?.[0]?.detail || error.message;
        
        this.logger.error('PUBG API response error:', {
          url: error.config?.url,
          status,
          message,
        });

        // Handle specific error codes
        if (status === 429) {
          this.logger.warn('PUBG API rate limit exceeded');
        } else if (status === 404) {
          this.logger.warn('PUBG API resource not found');
        } else if (status === 401) {
          this.logger.error('PUBG API authentication failed');
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Get player by name
   */
  public async getPlayerByName(playerName: string, platform: PUBGPlatform): Promise<PUBGPlayer | null> {
    try {
      const cacheKey = this.cache.keyGenerators.pubgPlayer(`${platform}:${playerName}`);
      const cached = await this.cache.get<PUBGPlayer>(cacheKey);
      
      if (cached) {
        this.logger.pubg('PLAYER_CACHE_HIT', cached.id);
        return cached;
      }

      const response = await this.api.get<PUBGAPIResponse<PUBGPlayer[]>>(
        `/shards/${platform}/players`,
        {
          params: {
            'filter[playerNames]': playerName,
          },
        },
      );

      const players = response.data.data;
      if (!players || players.length === 0) {
        this.logger.warn(`Player not found: ${playerName} on ${platform}`);
        return null;
      }

      const player = players[0];
      
      // Cache for 1 hour
      await this.cache.set(cacheKey, player, 3600);
      
      this.logger.pubg('PLAYER_FETCHED', player?.id || 'unknown');
      return player || null;
    } catch (error) {
      this.logger.error(`Failed to get player ${playerName}:`, error);
      return null;
    }
  }

  /**
   * Get player statistics
   */
  public async getPlayerStats(
    playerId: string, 
    platform: PUBGPlatform, 
    seasonId?: string,
  ): Promise<PUBGPlayerStats | null> {
    try {
      const currentSeason = seasonId || await this.getCurrentSeason(platform);
      if (!currentSeason) {
        this.logger.error('No current season found');
        return null;
      }

      const cacheKey = this.cache.keyGenerators.pubgStats(playerId, currentSeason, 'all');
      const cached = await this.cache.get<PUBGPlayerStats>(cacheKey);
      
      if (cached) {
        this.logger.pubg('STATS_CACHE_HIT', playerId);
        return cached;
      }

      const response = await this.api.get<PUBGAPIResponse<PUBGPlayerStats>>(
        `/shards/${platform}/players/${playerId}/seasons/${currentSeason}`,
      );

      const stats = response.data.data;
      
      // Cache for 30 minutes
      await this.cache.set(cacheKey, stats, 1800);
      
      this.logger.pubg('STATS_FETCHED', playerId);
      return stats;
    } catch (error) {
      this.logger.error(`Failed to get player stats for ${playerId}:`, error);
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
    gameMode: PUBGGameMode,
  ): Promise<PUBGSeasonStats | null> {
    try {
      const cacheKey = this.cache.keyGenerators.pubgStats(playerId, seasonId, gameMode);
      const cached = await this.cache.get<PUBGSeasonStats>(cacheKey);
      
      if (cached) {
        this.logger.pubg('SEASON_STATS_CACHE_HIT', playerId);
        return cached;
      }

      const response = await this.api.get<PUBGAPIResponse<PUBGSeasonStats>>(
        `/shards/${platform}/players/${playerId}/seasons/${seasonId}/ranked`,
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
    try {
      const cacheKey = `pubg:matches:${playerId}`;
      const cached = await this.cache.get<PUBGMatch[]>(cacheKey);
      
      if (cached) {
        this.logger.pubg('MATCHES_CACHE_HIT', playerId);
        return cached;
      }

      const response = await this.api.get<PUBGAPIResponse<{ relationships: { matches: { data: { id: string }[] } } }>>(
        `/shards/${platform}/players/${playerId}`,
      );

      const matchIds = response.data.data.relationships.matches.data.map(match => match.id);
      const matches: PUBGMatch[] = [];

      // Fetch details for each match (limit to 5 most recent)
      for (const matchId of matchIds.slice(0, 5)) {
        const match = await this.getMatch(matchId, platform);
        if (match) {
          matches.push(match);
        }
      }
      
      // Cache for 15 minutes
      await this.cache.set(cacheKey, matches, 900);
      
      this.logger.pubg('MATCHES_FETCHED', playerId);
      return matches;
    } catch (error) {
      this.logger.error(`Failed to get matches for ${playerId}:`, error);
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
        `/shards/${platform}/matches/${matchId}`,
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

      const response = await this.api.get<PUBGAPIResponse<PUBGSeason[]>>(
        `/shards/${platform}/seasons`,
      );

      const seasons = response.data.data;
      const currentSeason = seasons.find(season => season.isCurrentSeason);
      
      if (!currentSeason) {
        this.logger.error('No current season found');
        return null;
      }
      
      // Cache for 24 hours
      await this.cache.set(cacheKey, currentSeason.id, 86400);
      
      return currentSeason.id;
    } catch (error) {
      this.logger.error('Failed to get current season:', error);
      return null;
    }
  }

  /**
   * Get leaderboard for a specific game mode and season
   */
  public async getLeaderboard(
    platform: PUBGPlatform,
    gameMode: PUBGGameMode,
    seasonId?: string,
  ): Promise<PUBGLeaderboardEntry[]> {
    try {
      const currentSeason = seasonId || await this.getCurrentSeason(platform);
      if (!currentSeason) {
        return [];
      }

      const cacheKey = `pubg:leaderboard:${platform}:${gameMode}:${currentSeason}`;
      const cached = await this.cache.get<PUBGLeaderboardEntry[]>(cacheKey);
      
      if (cached) {
        this.logger.pubg('LEADERBOARD_CACHE_HIT');
        return cached;
      }

      const response = await this.api.get<PUBGAPIResponse<any>>(
        `/shards/${platform}/leaderboards/${currentSeason}/${gameMode}`,
      );

      // Transform API response to leaderboard entries
      const leaderboard: PUBGLeaderboardEntry[] = response.data.data.map((entry: any, index: number) => ({
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
      
      // Cache for 1 hour
      await this.cache.set(cacheKey, leaderboard, 3600);
      
      this.logger.pubg('LEADERBOARD_FETCHED');
      return leaderboard;
    } catch (error) {
      this.logger.error('Failed to get leaderboard:', error);
      return [];
    }
  }

  /**
   * Validate player name format
   */
  public validatePlayerName(playerName: string): boolean {
    // PUBG player names are 3-16 characters, alphanumeric and some special characters
    const regex = /^[a-zA-Z0-9_-]{3,16}$/;
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
      await this.api.get('/status');
      return true;
    } catch (error) {
      this.logger.error('PUBG API is not available:', error);
      return false;
    }
  }

  /**
   * Clear all PUBG-related cache
   */
  public async clearCache(): Promise<void> {
    try {
      await this.cache.clearPattern('pubg:*');
      this.logger.info('PUBG cache cleared');
    } catch (error) {
      this.logger.error('Failed to clear PUBG cache:', error);
    }
  }
}