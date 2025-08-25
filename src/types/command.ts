import { 
  SlashCommandBuilder, 
  SlashCommandSubcommandsOnlyBuilder,
  CommandInteraction, 
  ChatInputCommandInteraction,
  PermissionResolvable,
  AutocompleteInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction
} from 'discord.js';
import { ExtendedClient } from './client';

/**
 * Command category enumeration
 */
export enum CommandCategory {
  ADMIN = 'admin',
  MODERATION = 'moderation',
  MUSIC = 'music',
  GAMES = 'games',
  RANKING = 'ranking',
  PUBG = 'pubg',
  UTILITY = 'utility',
  FUN = 'fun',
  ECONOMY = 'economy',
  BADGES = 'badges',
  CLIPS = 'clips',
  GENERAL = 'general'
}

/**
 * Command interface
 */
export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | ContextMenuCommandBuilder;
  category: CommandCategory;
  cooldown?: number; // in seconds
  permissions?: PermissionResolvable[];
  ownerOnly?: boolean;
  guildOnly?: boolean;
  nsfw?: boolean;
  disabled?: boolean;
  premium?: boolean;
  aliases?: string[];
  execute: (interaction: CommandInteraction | ChatInputCommandInteraction, client: ExtendedClient) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, client: ExtendedClient) => Promise<void>;
}

/**
 * Context menu command interface
 */
export interface ContextMenuCommand {
  data: ContextMenuCommandBuilder;
  category: CommandCategory;
  cooldown?: number;
  permissions?: PermissionResolvable[];
  ownerOnly?: boolean;
  guildOnly?: boolean;
  execute: (
    interaction: MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction,
    client: ExtendedClient
  ) => Promise<void>;
}

/**
 * Command execution context
 */
export interface CommandContext {
  interaction: CommandInteraction;
  client: ExtendedClient;
  args: Record<string, any>;
  user: {
    id: string;
    tag: string;
    avatar?: string;
    isOwner: boolean;
    isDeveloper: boolean;
    permissions: string[];
  };
  guild?: {
    id: string;
    name: string;
    config: any;
    memberCount: number;
  };
  channel: {
    id: string;
    name: string;
    type: string;
  };
}

/**
 * Command validation result
 */
export interface CommandValidation {
  valid: boolean;
  error?: string;
  missingPermissions?: string[];
  cooldownRemaining?: number;
}

/**
 * Command statistics
 */
export interface CommandStats {
  name: string;
  category: CommandCategory;
  usageCount: number;
  lastUsed: Date;
  averageExecutionTime: number;
  errorCount: number;
  successRate: number;
  topUsers: Array<{
    userId: string;
    username: string;
    count: number;
  }>;
}

/**
 * Command help information
 */
export interface CommandHelp {
  name: string;
  description: string;
  category: CommandCategory;
  usage: string;
  examples: string[];
  aliases?: string[];
  permissions?: string[];
  cooldown?: number;
  premium?: boolean;
  guildOnly?: boolean;
  ownerOnly?: boolean;
}

/**
 * Command builder options
 */
export interface CommandBuilderOptions {
  name: string;
  description: string;
  category: CommandCategory;
  cooldown?: number;
  permissions?: PermissionResolvable[];
  ownerOnly?: boolean;
  guildOnly?: boolean;
  nsfw?: boolean;
  premium?: boolean;
  options?: Array<{
    name: string;
    description: string;
    type: 'string' | 'integer' | 'boolean' | 'user' | 'channel' | 'role' | 'mentionable' | 'number' | 'attachment';
    required?: boolean;
    choices?: Array<{ name: string; value: string | number }>;
    autocomplete?: boolean;
    minValue?: number;
    maxValue?: number;
    minLength?: number;
    maxLength?: number;
  }>;
  subcommands?: Array<{
    name: string;
    description: string;
    options?: any[];
  }>;
}

/**
 * Command error types
 */
export enum CommandError {
  MISSING_PERMISSIONS = 'missing_permissions',
  COOLDOWN_ACTIVE = 'cooldown_active',
  GUILD_ONLY = 'guild_only',
  OWNER_ONLY = 'owner_only',
  NSFW_ONLY = 'nsfw_only',
  PREMIUM_ONLY = 'premium_only',
  DISABLED = 'disabled',
  INVALID_ARGUMENTS = 'invalid_arguments',
  EXECUTION_ERROR = 'execution_error',
  RATE_LIMITED = 'rate_limited'
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  error?: CommandError;
  message?: string;
  data?: any;
  executionTime: number;
}