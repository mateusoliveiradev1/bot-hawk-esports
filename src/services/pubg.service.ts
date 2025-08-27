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

  constructor(cache?: CacheService) {
    this.logger = new Logger();
    this.cache = cache || new CacheService();
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
  public async getPlayerByName(playerName: string, platform: PUBGPlatform = PUBGPlatform.STEAM): Promise<PUBGPlayer | null> {
    try {
      const cacheKey = this.cache.keyGenerators.pubgPlayer(`${platform}:${playerName}`);
      const cached = await this.cache.get<PUBGPlayer>(cacheKey);
      
      if (cached) {
        this.logger.pubg('PLAYER_CACHE_HIT', cached.id);
        return cached;
      }

      // Check if API key is available
      if (!this.apiKey) {
        this.logger.warn('PUBG API key not available, returning mock player data');
        return this.createMockPlayer(playerName, platform);
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
      // Return mock data as fallback
      return this.createMockPlayer(playerName, platform);
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
   * Create mock player data for fallback
   */
  private createMockPlayer(playerName: string, platform: PUBGPlatform): PUBGPlayer {
    return {
      type: 'player',
      id: `mock_${playerName}_${Date.now()}`,
      attributes: {
        name: playerName,
        shardId: platform,
        stats: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        patchVersion: '',
        titleId: 'pubg',
      },
      relationships: {
        matches: {
          data: []
        }
      }
    } as PUBGPlayer;
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
        `/shards/${platform}/players/${playerId}/weapon_mastery`,
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
        `/shards/${platform}/players/${playerId}/survival_mastery`,
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
    'AKM', 'M416', 'SCAR-L', 'M16A4', 'AUG', 'Groza', 'Beryl M762', 'QBZ', 'G36C', 'K2', 'MK47 Mutant', 'ACE32', 'FAMAS',
    // SMGs
    'UMP45', 'Vector', 'Uzi', 'Tommy Gun', 'MP5K', 'Bizon', 'P90', 'MP9', 'JS9',
    // Sniper Rifles
    'Kar98k', 'M24', 'AWM', 'Win94', 'Mosin Nagant', 'Lynx AMR', 'M40A5',
    // DMRs
    'SKS', 'Mini 14', 'Mk14 EBR', 'SLR', 'QBU', 'VSS', 'Dragunov',
    // LMGs
    'M249', 'DP-27', 'DP-28', 'MG3',
    // Shotguns
    'S1897', 'S686', 'S12K', 'DBS', 'Sawed-off', 'O12',
    // Pistols
    'P92', 'P1911', 'P18C', 'R1895', 'R45', 'Skorpion', 'Deagle', 'P320',
    // Crossbows
    'Crossbow',
    // Throwables
    'Frag Grenade', 'Smoke Grenade', 'Stun Grenade', 'Molotov Cocktail', 'C4', 'Decoy Grenade', 'Sticky Bomb',
    // Melee
    'Pan', 'Crowbar', 'Sickle', 'Machete', 'Katana'
  ];

  /**
   * Map weapon keys to display names
   */
  private getWeaponDisplayName(weaponKey: string): string {
    const weaponMap: Record<string, string> = {
      'Item_Weapon_AK47_C': 'AKM',
      'Item_Weapon_M416_C': 'M416',
      'Item_Weapon_SCAR-L_C': 'SCAR-L',
      'Item_Weapon_M16A4_C': 'M16A4',
      'Item_Weapon_AUG_C': 'AUG',
      'Item_Weapon_Groza_C': 'Groza',
      'Item_Weapon_Beryl762_C': 'Beryl M762',
      'Item_Weapon_QBZ95_C': 'QBZ',
      'Item_Weapon_G36C_C': 'G36C',
      'Item_Weapon_K2_C': 'K2',
      'Item_Weapon_Mk47Mutant_C': 'MK47 Mutant',
      'Item_Weapon_ACE32_C': 'ACE32',
      'Item_Weapon_FAMAS_C': 'FAMAS',
      'Item_Weapon_UMP_C': 'UMP45',
      'Item_Weapon_Vector_C': 'Vector',
      'Item_Weapon_Uzi_C': 'Uzi',
      'Item_Weapon_Thompson_C': 'Tommy Gun',
      'Item_Weapon_MP5K_C': 'MP5K',
      'Item_Weapon_PP19Bizon_C': 'Bizon',
      'Item_Weapon_P90_C': 'P90',
      'Item_Weapon_MP9_C': 'MP9',
      'Item_Weapon_JS9_C': 'JS9',
      'Item_Weapon_Kar98k_C': 'Kar98k',
      'Item_Weapon_M24_C': 'M24',
      'Item_Weapon_AWM_C': 'AWM',
      'Item_Weapon_Win1894_C': 'Win94',
      'Item_Weapon_Mosin_C': 'Mosin Nagant',
      'Item_Weapon_LynxAMR_C': 'Lynx AMR',
      'Item_Weapon_M40A5_C': 'M40A5',
      'Item_Weapon_SKS_C': 'SKS',
      'Item_Weapon_Mini14_C': 'Mini 14',
      'Item_Weapon_Mk14_C': 'Mk14 EBR',
      'Item_Weapon_SLR_C': 'SLR',
      'Item_Weapon_QBU88_C': 'QBU',
      'Item_Weapon_VSS_C': 'VSS',
      'Item_Weapon_Dragunov_C': 'Dragunov',
      'Item_Weapon_M249_C': 'M249',
      'Item_Weapon_DP27_C': 'DP-27',
      'Item_Weapon_DP28_C': 'DP-28',
      'Item_Weapon_MG3_C': 'MG3',
      'Item_Weapon_Winchester_C': 'S1897',
      'Item_Weapon_DoubleBarrel_C': 'S686',
      'Item_Weapon_Saiga12_C': 'S12K',
      'Item_Weapon_DBS_C': 'DBS',
      'Item_Weapon_SawedOff_C': 'Sawed-off',
      'Item_Weapon_OriginS12_C': 'O12',
      'Item_Weapon_Beretta686_C': 'S686',
      'Item_Weapon_P92_C': 'P92',
      'Item_Weapon_M1911_C': 'P1911',
      'Item_Weapon_Glock_C': 'P18C',
      'Item_Weapon_Rhino_C': 'R1895',
      'Item_Weapon_R45_C': 'R45',
      'Item_Weapon_vz61Skorpion_C': 'Skorpion',
      'Item_Weapon_DesertEagle_C': 'Deagle',
      'Item_Weapon_P320_C': 'P320',
      'Item_Weapon_Crossbow_C': 'Crossbow',
      'Item_Weapon_FlashBang_C': 'Stun Grenade',
      'Item_Weapon_Grenade_C': 'Frag Grenade',
      'Item_Weapon_SmokeBomb_C': 'Smoke Grenade',
      'Item_Weapon_Molotov_C': 'Molotov Cocktail',
      'Item_Weapon_C4_C': 'C4',
      'Item_Weapon_DecoyGrenade_C': 'Decoy Grenade',
      'Item_Weapon_StickyBomb_C': 'Sticky Bomb',
      'Item_Weapon_Pan_C': 'Pan',
      'Item_Weapon_Crowbar_C': 'Crowbar',
      'Item_Weapon_Sickle_C': 'Sickle',
      'Item_Weapon_Machete_C': 'Machete',
      'Item_Weapon_Katana_C': 'Katana'
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
      if (level >= 80) tier = 'Legendary';
      else if (level >= 60) tier = 'Epic';
      else if (level >= 40) tier = 'Rare';
      else if (level >= 20) tier = 'Uncommon';

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
        if (level >= 80) tier = 'Legendary';
        else if (level >= 60) tier = 'Epic';
        else if (level >= 40) tier = 'Rare';
        else if (level >= 20) tier = 'Uncommon';

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
      await this.cache.clearPattern('pubg:*');
      this.logger.info('PUBG cache cleared');
    } catch (error) {
      this.logger.error('Failed to clear PUBG cache:', error);
    }
  }
}