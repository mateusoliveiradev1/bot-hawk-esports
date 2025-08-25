/**
 * PUBG Platform enumeration
 */
export enum PUBGPlatform {
  STEAM = 'steam',
  XBOX = 'xbox',
  PSN = 'psn',
  STADIA = 'stadia',
  KAKAO = 'kakao'
}

/**
 * PUBG Game Mode enumeration
 */
export enum PUBGGameMode {
  SOLO = 'solo',
  DUO = 'duo',
  SQUAD = 'squad',
  SOLO_FPP = 'solo-fpp',
  DUO_FPP = 'duo-fpp',
  SQUAD_FPP = 'squad-fpp'
}

/**
 * PUBG Season Type enumeration
 */
export enum PUBGSeasonType {
  DIVISION = 'division',
  BATTLEROYALE = 'battleroyale'
}

/**
 * PUBG Rank Tier enumeration
 */
export enum PUBGRankTier {
  BRONZE = 'Bronze',
  SILVER = 'Silver',
  GOLD = 'Gold',
  PLATINUM = 'Platinum',
  DIAMOND = 'Diamond',
  MASTER = 'Master',
  GRANDMASTER = 'Grandmaster'
}

/**
 * PUBG Player interface
 */
export interface PUBGPlayer {
  id: string;
  name: string;
  platform: PUBGPlatform;
  createdAt: string;
  updatedAt: string;
  patchVersion: string;
  titleId: string;
  shardId: string;
  stats?: PUBGPlayerStats;
  seasonStats?: PUBGSeasonStats[];
  recentMatches?: PUBGMatch[];
}

/**
 * PUBG Player Statistics interface
 */
export interface PUBGPlayerStats {
  playerId: string;
  gameModeStats: Record<PUBGGameMode, PUBGGameModeStats>;
  bestRankPoint: number;
  rankPointTitle: string;
  lastUpdated: string;
}

/**
 * PUBG Game Mode Statistics interface
 */
export interface PUBGGameModeStats {
  assists: number;
  boosts: number;
  dBNOs: number;
  dailyKills: number;
  dailyWins: number;
  damageDealt: number;
  days: number;
  headshotKills: number;
  heals: number;
  killPoints: number;
  kills: number;
  longestKill: number;
  longestTimeSurvived: number;
  losses: number;
  maxKillStreaks: number;
  mostSurvivalTime: number;
  rankPoints: number;
  rankPointsTitle: string;
  revives: number;
  rideDistance: number;
  roadKills: number;
  roundMostKills: number;
  roundsPlayed: number;
  suicides: number;
  swimDistance: number;
  teamKills: number;
  timeSurvived: number;
  top10s: number;
  vehicleDestroys: number;
  walkDistance: number;
  weaponsAcquired: number;
  weeklyKills: number;
  weeklyWins: number;
  winPoints: number;
  wins: number;
}

/**
 * PUBG Season Statistics interface
 */
export interface PUBGSeasonStats {
  seasonId: string;
  playerId: string;
  gameMode: PUBGGameMode;
  currentTier: {
    tier: PUBGRankTier;
    subTier: string;
  };
  currentRankPoint: number;
  bestTier: {
    tier: PUBGRankTier;
    subTier: string;
  };
  bestRankPoint: number;
  roundsPlayed: number;
  avgRank: number;
  avgSurvivalTime: number;
  top10Ratio: number;
  winRatio: number;
  assists: number;
  wins: number;
  kda: number;
  kdr: number;
  averageDamage: number;
  headshots: number;
  headshotRatio: number;
  vehicleDestroys: number;
  roadKills: number;
  dailyKills: number;
  weeklyKills: number;
  roundMostKills: number;
  maxKillStreaks: number;
  longestKill: number;
}

/**
 * PUBG Match interface
 */
export interface PUBGMatch {
  id: string;
  gameMode: PUBGGameMode;
  mapName: string;
  duration: number;
  createdAt: string;
  seasonState: string;
  participants: PUBGParticipant[];
  rosters: PUBGRoster[];
  telemetryUrl?: string;
}

/**
 * PUBG Match Participant interface
 */
export interface PUBGParticipant {
  playerId: string;
  playerName: string;
  stats: {
    DBNOs: number;
    assists: number;
    boosts: number;
    damageDealt: number;
    deathType: string;
    headshotKills: number;
    heals: number;
    killPlace: number;
    killPoints: number;
    killPointsDelta: number;
    kills: number;
    lastKillPoints: number;
    lastWinPoints: number;
    longestKill: number;
    mostDamage: number;
    name: string;
    playerId: string;
    rankPoints: number;
    revives: number;
    rideDistance: number;
    roadKills: number;
    teamKills: number;
    timeSurvived: number;
    vehicleDestroys: number;
    walkDistance: number;
    weaponsAcquired: number;
    winPlace: number;
    winPoints: number;
    winPointsDelta: number;
  };
}

/**
 * PUBG Match Roster interface
 */
export interface PUBGRoster {
  rosterId: string;
  participants: string[];
  won: boolean;
  stats: {
    rank: number;
    teamId: number;
  };
}

/**
 * PUBG Season interface
 */
export interface PUBGSeason {
  id: string;
  isCurrentSeason: boolean;
  isOffseason: boolean;
}

/**
 * PUBG API Response interface
 */
export interface PUBGAPIResponse<T> {
  data: T;
  included?: any[];
  links?: {
    self: string;
  };
  meta?: any;
}

/**
 * PUBG API Error interface
 */
export interface PUBGAPIError {
  title: string;
  detail: string;
  status: string;
  code?: string;
}

/**
 * PUBG Leaderboard Entry interface
 */
export interface PUBGLeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  stats: {
    rankPoints: number;
    wins: number;
    games: number;
    winRatio: number;
    averageDamage: number;
    kills: number;
    kda: number;
    tier: PUBGRankTier;
    subTier: string;
  };
  change: {
    rank: number;
    points: number;
  };
  lastUpdated: string;
}

/**
 * Internal Ranking System interfaces
 */
export interface InternalRanking {
  userId: string;
  username: string;
  level: number;
  xp: number;
  totalXp: number;
  rank: number;
  previousRank: number;
  coins: number;
  badges: string[];
  stats: {
    commandsUsed: number;
    messagesCount: number;
    voiceTime: number;
    gamesPlayed: number;
    quizzesCompleted: number;
    clipsUploaded: number;
    checkIns: number;
    dailyStreak: number;
    weeklyStreak: number;
    monthlyStreak: number;
  };
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Ranking Period enumeration
 */
export enum RankingPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  ALL_TIME = 'all_time'
}

/**
 * Ranking Type enumeration
 */
export enum RankingType {
  PUBG = 'pubg',
  INTERNAL = 'internal',
  KILLS = 'kills',
  WINS = 'wins',
  DAMAGE = 'damage',
  KDA = 'kda',
  XP = 'xp',
  LEVEL = 'level',
  COINS = 'coins'
}