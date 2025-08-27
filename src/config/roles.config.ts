import { PermissionFlagsBits } from 'discord.js';

/**
 * Role configuration interface
 */
export interface RoleConfig {
  name: string;
  color?: string;
  permissions: bigint[];
  hoist?: boolean;
  mentionable?: boolean;
  position?: number;
}

/**
 * Default roles configuration
 */
export const DEFAULT_ROLES: Record<string, RoleConfig> = {
  NEW_MEMBER: {
    name: '👋 Novo Membro',
    color: '#95a5a6',
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.UseExternalEmojis,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak
    ],
    hoist: false,
    mentionable: false,
    position: 1
  },
  VERIFIED_MEMBER: {
    name: '✅ Verificado',
    color: '#2ecc71',
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.UseExternalEmojis,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.UseVAD,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles
    ],
    hoist: false,
    mentionable: false,
    position: 2
  },
  BASIC_MEMBER: {
    name: '👤 Membro',
    color: '#3498db',
    permissions: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.UseExternalEmojis,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.UseVAD,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.UseApplicationCommands
    ],
    hoist: false,
    mentionable: true,
    position: 3
  }
};

/**
 * Channel-specific permissions for new members
 */
export const CHANNEL_PERMISSIONS = {
  GENERAL: {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AddReactions: true,
    UseExternalEmojis: true,
    EmbedLinks: false,
    AttachFiles: false
  },
  WELCOME: {
    ViewChannel: true,
    SendMessages: false,
    ReadMessageHistory: true,
    AddReactions: true
  },
  RULES: {
    ViewChannel: true,
    SendMessages: false,
    ReadMessageHistory: true,
    AddReactions: false
  }
};

/**
 * Get role configuration by name
 */
export function getRoleConfig(roleName: string): RoleConfig | undefined {
  return Object.values(DEFAULT_ROLES).find(role => role.name === roleName);
}

/**
 * Get all role names
 */
export function getAllRoleNames(): string[] {
  return Object.values(DEFAULT_ROLES).map(role => role.name);
}

/**
 * Check if role exists in configuration
 */
export function isConfiguredRole(roleName: string): boolean {
  return getAllRoleNames().includes(roleName);
}