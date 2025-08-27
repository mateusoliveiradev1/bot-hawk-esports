import { Message } from 'discord.js';
import { ExtendedClient } from '../types/client';
import { Logger } from '../utils/logger';

/**
 * Message events handler for auto moderation and other message-related features
 */
export class MessageEvents {
  private logger: Logger;

  constructor(private client: ExtendedClient) {
    this.logger = new Logger();
    this.setupEventListeners();
  }

  /**
   * Setup message event listeners
   */
  private setupEventListeners(): void {
    // Message create event for auto moderation
    this.client.on('messageCreate', async (message: Message) => {
      try {
        await this.handleMessageCreate(message);
      } catch (error) {
        this.logger.error('Error handling message create:', error);
      }
    });

    // Message update event for edit detection
    this.client.on('messageUpdate', async (oldMessage, newMessage) => {
      try {
        if (newMessage.partial) {
          await newMessage.fetch();
        }
        
        await this.handleMessageUpdate(oldMessage as Message, newMessage as Message);
      } catch (error) {
        this.logger.error('Error handling message update:', error);
      }
    });

    // Message delete event for logging
    this.client.on('messageDelete', async (message) => {
      try {
        if (message.partial) return;
        
        await this.handleMessageDelete(message as Message);
      } catch (error) {
        this.logger.error('Error handling message delete:', error);
      }
    });

    // Bulk message delete event
    this.client.on('messageDeleteBulk', async (messages) => {
      try {
        await this.handleBulkMessageDelete(messages);
      } catch (error) {
        this.logger.error('Error handling bulk message delete:', error);
      }
    });
  }

  /**
   * Handle message creation
   */
  private async handleMessageCreate(message: Message): Promise<void> {
    // Skip bot messages and DMs
    if (message.author.bot || !message.guild) return;

    // Process through auto moderation
    if (this.client.services?.automod) {
      await this.client.services.automod.processMessage(message);
    }

    // Add XP for message (if economy system is enabled)
    // This could be moved to a separate service later
    // await this.handleXpGain(message);
  }

  /**
   * Handle message updates (edits)
   */
  private async handleMessageUpdate(oldMessage: Message, newMessage: Message): Promise<void> {
    // Skip bot messages and DMs
    if (newMessage.author.bot || !newMessage.guild) return;

    // Only process if content actually changed
    if (oldMessage.content === newMessage.content) return;

    // Process edited message through auto moderation
    if (this.client.services?.automod) {
      await this.client.services.automod.processMessage(newMessage);
    }

    // Log message edit if logging is enabled
    await this.logMessageEdit(oldMessage, newMessage);
  }

  /**
   * Handle message deletion
   */
  private async handleMessageDelete(message: Message): Promise<void> {
    // Skip bot messages and DMs
    if (message.author.bot || !message.guild) return;

    // Log message deletion if logging is enabled
    await this.logMessageDelete(message);
  }

  /**
   * Handle bulk message deletion
   */
  private async handleBulkMessageDelete(messages: any): Promise<void> {
    // Log bulk deletion if logging is enabled
    this.logger.info(`Bulk delete: ${messages.size} messages deleted`);
  }

  /**
   * Log message edits
   */
  private async logMessageEdit(oldMessage: Message, newMessage: Message): Promise<void> {
    // Implementation for logging message edits
    // This would send to a moderation log channel if configured
  }

  /**
   * Log message deletions
   */
  private async logMessageDelete(message: Message): Promise<void> {
    // Implementation for logging message deletions
    // This would send to a moderation log channel if configured
  }

  /**
   * Handle XP gain from messages
   */
  private async handleXpGain(message: Message): Promise<void> {
    // Implementation for XP gain from messages
    // This could be integrated with the economy system
  }
}