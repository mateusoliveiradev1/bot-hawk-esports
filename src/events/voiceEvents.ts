import { VoiceState } from 'discord.js';
import { ExtendedClient } from '../types/client';
import { Logger } from '../utils/logger';

/**
 * Handles Discord voice-related events
 */
export class VoiceEvents {
  private client: ExtendedClient;
  private logger: Logger;

  constructor(client: ExtendedClient) {
    this.client = client;
    this.logger = new Logger();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Handle voice state updates (join, leave, move, mute, deafen, etc.)
    this.client.on('voiceStateUpdate', this.handleVoiceStateUpdate.bind(this));
  }

  /**
   * Handles voice state updates
   */
  private async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    try {
      // Skip if user is a bot
      if (newState.member?.user.bot) return;

      // Determine the type of voice event
      const eventType = this.determineVoiceEventType(oldState, newState);
      if (!eventType) return;

      // Log the voice event
      if (this.client.services?.logging) {
        await this.logVoiceEvent(oldState, newState, eventType);
      }

    } catch (error) {
      this.logger.error('Failed to handle voice state update:', error);
    }
  }

  /**
   * Determine the type of voice event
   */
  private determineVoiceEventType(oldState: VoiceState, newState: VoiceState): string | null {
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // User joined a voice channel
    if (!oldChannel && newChannel) {
      return 'voiceJoin';
    }

    // User left a voice channel
    if (oldChannel && !newChannel) {
      return 'voiceLeave';
    }

    // User moved between voice channels
    if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      return 'voiceMove';
    }

    // User muted/unmuted themselves
    if (oldState.selfMute !== newState.selfMute) {
      return newState.selfMute ? 'voiceSelfMute' : 'voiceSelfUnmute';
    }

    // User deafened/undeafened themselves
    if (oldState.selfDeaf !== newState.selfDeaf) {
      return newState.selfDeaf ? 'voiceSelfDeafen' : 'voiceSelfUndeafen';
    }

    // User was server muted/unmuted
    if (oldState.serverMute !== newState.serverMute) {
      return newState.serverMute ? 'voiceServerMute' : 'voiceServerUnmute';
    }

    // User was server deafened/undeafened
    if (oldState.serverDeaf !== newState.serverDeaf) {
      return newState.serverDeaf ? 'voiceServerDeafen' : 'voiceServerUndeafen';
    }

    // User started/stopped streaming
    if (oldState.streaming !== newState.streaming) {
      return newState.streaming ? 'voiceStartStreaming' : 'voiceStopStreaming';
    }

    // User turned on/off camera
    if (oldState.selfVideo !== newState.selfVideo) {
      return newState.selfVideo ? 'voiceStartVideo' : 'voiceStopVideo';
    }

    return null;
  }

  /**
   * Log voice event
   */
  private async logVoiceEvent(oldState: VoiceState, newState: VoiceState, eventType: string): Promise<void> {
    if (!this.client.services?.logging || !newState.member) return;

    const data: any = {
      user: {
        id: newState.member.id,
        tag: newState.member.user.tag,
        username: newState.member.user.username,
        discriminator: newState.member.user.discriminator,
        avatar: newState.member.user.displayAvatarURL()
      },
      timestamp: new Date()
    };

    // Add channel information based on event type
    switch (eventType) {
      case 'voiceJoin':
        data.channel = {
          id: newState.channel!.id,
          name: newState.channel!.name,
          type: newState.channel!.type,
          memberCount: newState.channel!.members.size
        };
        break;

      case 'voiceLeave':
        data.channel = {
          id: oldState.channel!.id,
          name: oldState.channel!.name,
          type: oldState.channel!.type,
          memberCount: oldState.channel!.members.size - 1 // Subtract 1 as user is leaving
        };
        break;

      case 'voiceMove':
        data.oldChannel = {
          id: oldState.channel!.id,
          name: oldState.channel!.name,
          type: oldState.channel!.type,
          memberCount: oldState.channel!.members.size - 1
        };
        data.newChannel = {
          id: newState.channel!.id,
          name: newState.channel!.name,
          type: newState.channel!.type,
          memberCount: newState.channel!.members.size
        };
        break;

      default:
        // For mute/deafen/streaming/video events
        if (newState.channel) {
          data.channel = {
            id: newState.channel.id,
            name: newState.channel.name,
            type: newState.channel.type,
            memberCount: newState.channel.members.size
          };
        }
        
        // Add state information
        data.voiceState = {
          selfMute: newState.selfMute,
          selfDeaf: newState.selfDeaf,
          serverMute: newState.serverMute,
          serverDeaf: newState.serverDeaf,
          streaming: newState.streaming,
          selfVideo: newState.selfVideo
        };
        break;
    }

    // LoggingService handles voice events automatically through its event listeners
    // No need to manually call logEvent
  }
}