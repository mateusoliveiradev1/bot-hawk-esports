import { Client, Collection } from 'discord.js';
import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { CacheService } from '../services/cache.service';
import { PUBGService } from '../services/pubg.service';
import { MusicService } from '../services/music.service';
import { BadgeService } from '../services/badge.service';
import { GameService } from '../services/game.service';
import { RankingService } from '../services/ranking.service';
import { PresenceService } from '../services/presence.service';
import { ClipService } from '../services/clip.service';
import { SchedulerService } from '../services/scheduler.service';
import { APIService } from '../services/api.service';
import { OnboardingService } from '../services/onboarding.service';
import { PunishmentService } from '../services/punishment.service';
import { AutoModerationService } from '../services/automod.service';
import { CommandManager } from '../commands';
import { Command } from './command';

/**
 * Extended Discord Client with additional services and collections
 */
export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
  cooldowns: Collection<string, Collection<string, number>>;
  logger: Logger;
  database: DatabaseService;
  cache: CacheService;
  pubgService: PUBGService;
  musicService: MusicService;
  gameService: GameService;
  badgeService: BadgeService;
  rankingService: RankingService;
  presenceService: PresenceService;
  clipService: ClipService;
  schedulerService: SchedulerService;
  apiService: APIService;
  onboardingService: OnboardingService;
  punishmentService: PunishmentService;
  automodService: AutoModerationService;
  // New properties for the updated architecture
  db?: DatabaseService;
  services?: {
    pubg: PUBGService;
    music: MusicService;
    badge: BadgeService;
    game: GameService;
    ranking: RankingService;
    presence: PresenceService;
    clip: ClipService;
    scheduler: SchedulerService;
    api: APIService;
    onboarding: OnboardingService;
    punishment: PunishmentService;
    automod: AutoModerationService;
  };
}

/**
 * Bot configuration interface
 */
export interface BotConfig {
  token: string;
  clientId: string;
  guildId?: string;
  prefix: string;
  ownerId: string;
  developers: string[];
  supportServer: string;
  inviteUrl: string;
  website: string;
  version: string;
  environment: 'development' | 'production' | 'testing';
}

/**
 * Guild configuration interface
 */
export interface GuildConfig {
  id: string;
  name: string;
  prefix: string;
  language: string;
  timezone: string;
  welcomeChannel?: string;
  logChannel?: string;
  moderationChannel?: string;
  musicChannel?: string;
  rankingChannel?: string;
  announcementChannel?: string;
  autoRoles: string[];
  disabledCommands: string[];
  customCommands: Record<string, string>;
  features: {
    autoModeration: boolean;
    welcomeMessages: boolean;
    levelSystem: boolean;
    musicSystem: boolean;
    rankingSystem: boolean;
    badgeSystem: boolean;
    gameSystem: boolean;
    clipSystem: boolean;
    economySystem: boolean;
  };
  permissions: {
    adminRoles: string[];
    moderatorRoles: string[];
    djRoles: string[];
    verifiedRoles: string[];
  };
  limits: {
    maxWarnings: number;
    maxMuteTime: number;
    maxQueueSize: number;
    maxClipSize: number;
    dailyXpLimit: number;
  };
}

/**
 * User data interface
 */
export interface UserData {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  pubgUsername?: string;
  pubgPlatform?: 'steam' | 'xbox' | 'psn' | 'stadia';
  isVerified: boolean;
  level: number;
  xp: number;
  coins: number;
  badges: string[];
  achievements: string[];
  stats: {
    commandsUsed: number;
    messagesCount: number;
    voiceTime: number;
    gamesPlayed: number;
    quizzesCompleted: number;
    clipsUploaded: number;
    checkIns: number;
  };
  preferences: {
    language: string;
    timezone: string;
    notifications: boolean;
    privacy: 'public' | 'friends' | 'private';
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Command cooldown interface
 */
export interface CommandCooldown {
  userId: string;
  commandName: string;
  expiresAt: number;
}

/**
 * Bot statistics interface
 */
export interface BotStats {
  guilds: number;
  users: number;
  channels: number;
  commands: number;
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  database: {
    connections: number;
    queries: number;
    avgResponseTime: number;
  };
  cache: {
    keys: number;
    memory: number;
    hitRate: number;
  };
}