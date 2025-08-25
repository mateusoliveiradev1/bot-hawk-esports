import { Client, GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';
import { DatabaseService } from '@/database/database.service';
import { CacheService } from '@/services/cache.service';
import { PUBGService } from '@/services/pubg.service';
import { MusicService } from '@/services/music.service';
import { GameService } from '@/services/game.service';
import { BadgeService } from '@/services/badge.service';
import { RankingService } from '@/services/ranking.service';
import { PresenceService } from '@/services/presence.service';
import { ClipService } from '@/services/clip.service';
import { SchedulerService } from '@/services/scheduler.service';
import { APIService } from '@/services/api.service';
import { CommandManager } from '@/commands/index';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config();

/**
 * Main Bot Class - Hawk Esports Discord Bot
 */
class HawkEsportsBot {
  private client: ExtendedClient;
  private logger: Logger;
  private db: DatabaseService;
  private cache: CacheService;
  private services: {
    pubg: PUBGService;
    music: MusicService;
    game: GameService;
    badge: BadgeService;
    ranking: RankingService;
    presence: PresenceService;
    clip: ClipService;
    scheduler: SchedulerService;
    api: APIService;
  };
  private commands: CommandManager;
  private isShuttingDown = false;

  constructor() {
    this.logger = new Logger();
    
    // Create Discord client with required intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
      ],
      allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false
      }
    }) as ExtendedClient;

    // Initialize services
    this.db = new DatabaseService();
    this.cache = new CacheService();
    this.commands = new CommandManager();
    
    this.services = {
      pubg: new PUBGService(),
      music: new MusicService(),
      game: new GameService(),
      badge: new BadgeService(),
      ranking: new RankingService(),
      presence: new PresenceService(),
      clip: new ClipService(),
      scheduler: new SchedulerService(),
      api: new APIService()
    };

    // Attach services to client for global access
    this.client.db = this.db;
    this.client.cache = this.cache;
    this.client.services = this.services;
    this.client.commands = this.commands;
  }

  /**
   * Initialize and start the bot
   */
  async start(): Promise<void> {
    try {
      this.logger.info('🚀 Starting Hawk Esports Bot...');

      // Validate environment variables
      this.validateEnvironment();

      // Initialize database connection
      await this.initializeDatabase();

      // Initialize cache service
      await this.initializeCache();

      // Initialize services
      await this.initializeServices();

      // Load commands
      await this.loadCommands();

      // Setup event listeners
      this.setupEventListeners();

      // Login to Discord
      await this.client.login(process.env.DISCORD_TOKEN);

    } catch (error) {
      this.logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  /**
   * Validate required environment variables
   */
  private validateEnvironment(): void {
    const required = [
      'DISCORD_TOKEN',
      'DATABASE_URL',
      'REDIS_URL',
      'PUBG_API_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    this.logger.info('✅ Environment variables validated');
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
    try {
      await this.db.connect();
      
      // Run health check
      const isHealthy = await this.db.healthCheck();
      if (!isHealthy) {
        throw new Error('Database health check failed');
      }

      this.logger.info('✅ Database connected and healthy');
    } catch (error) {
      this.logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize cache service
   */
  private async initializeCache(): Promise<void> {
    try {
      await this.cache.connect();
      
      // Test cache connection
      await this.cache.set('bot:startup', Date.now().toString(), 60);
      const testValue = await this.cache.get('bot:startup');
      
      if (!testValue) {
        throw new Error('Cache test failed');
      }

      this.logger.info('✅ Cache service connected and tested');
    } catch (error) {
      this.logger.error('Cache initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize all services
   */
  private async initializeServices(): Promise<void> {
    try {
      // Initialize services in order of dependency
      await this.services.badge.initialize();
      await this.services.ranking.initialize();
      await this.services.presence.initialize();
      await this.services.game.initialize();
      await this.services.clip.initialize();
      
      // Start scheduler service
      await this.services.scheduler.start();
      
      // Start API service
      await this.services.api.start();

      this.logger.info('✅ All services initialized');
    } catch (error) {
      this.logger.error('Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load and register commands
   */
  private async loadCommands(): Promise<void> {
    try {
      await this.commands.loadCommands();
      
      const stats = this.commands.getStats();
      this.logger.info(`✅ Loaded ${stats.total} commands (${stats.slash} slash, ${stats.context} context)`);
    } catch (error) {
      this.logger.error('Command loading failed:', error);
      throw error;
    }
  }

  /**
   * Setup Discord event listeners
   */
  private setupEventListeners(): void {
    // Ready event
    this.client.once('ready', async () => {
      if (!this.client.user) return;

      this.logger.info(`🤖 Bot logged in as ${this.client.user.tag}`);
      this.logger.info(`📊 Serving ${this.client.guilds.cache.size} guilds with ${this.client.users.cache.size} users`);

      // Set bot activity
      this.client.user.setActivity({
        name: 'PUBG matches and managing servers',
        type: ActivityType.Watching
      });

      // Register slash commands
      try {
        await this.commands.registerCommands(this.client);
        this.logger.info('✅ Slash commands registered');
      } catch (error) {
        this.logger.error('Failed to register slash commands:', error);
      }

      this.logger.info('🎉 Hawk Esports Bot is ready!');
    });

    // Interaction handling
    this.client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.commands.handleSlashCommand(interaction, this.client);
        } else if (interaction.isContextMenuCommand()) {
          await this.commands.handleContextCommand(interaction, this.client);
        } else if (interaction.isAutocomplete()) {
          await this.commands.handleAutocomplete(interaction, this.client);
        }
      } catch (error) {
        this.logger.error('Interaction handling error:', error);
      }
    });

    // Guild events
    this.client.on('guildCreate', async (guild) => {
      this.logger.info(`📥 Joined new guild: ${guild.name} (${guild.id})`);
      
      try {
        // Initialize guild in database
        await this.db.client.guild.upsert({
          where: { id: guild.id },
          update: {
            name: guild.name,
            ownerId: guild.ownerId,
            memberCount: guild.memberCount
          },
          create: {
            id: guild.id,
            name: guild.name,
            ownerId: guild.ownerId,
            memberCount: guild.memberCount
          }
        });
      } catch (error) {
        this.logger.error('Failed to initialize new guild:', error);
      }
    });

    this.client.on('guildDelete', async (guild) => {
      this.logger.info(`📤 Left guild: ${guild.name} (${guild.id})`);
    });

    // Member events
    this.client.on('guildMemberAdd', async (member) => {
      try {
        // Create user record
        await this.db.users.upsert({
          id: member.id,
          username: member.user.username,
          discriminator: member.user.discriminator,
          avatar: member.user.avatar
        });

        // Create user-guild relationship
        await this.db.client.userGuild.upsert({
          where: {
            userId_guildId: {
              userId: member.id,
              guildId: member.guild.id
            }
          },
          update: {},
          create: {
            userId: member.id,
            guildId: member.guild.id
          }
        });

        this.logger.info(`👋 New member joined: ${member.user.tag} in ${member.guild.name}`);
      } catch (error) {
        this.logger.error('Failed to handle new member:', error);
      }
    });

    // Voice state updates for music
    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      try {
        await this.services.music.handleVoiceStateUpdate(oldState, newState);
      } catch (error) {
        this.logger.error('Voice state update error:', error);
      }
    });

    // Message events for activity tracking
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot || !message.guild) return;

      try {
        // Update user activity - temporarily disabled
        // TODO: Add lastSeen and messagesCount fields to User model
        // await this.db.client.user.update({
        //   where: { id: message.author.id },
        //   data: {
        //     lastSeen: new Date(),
        //     messagesCount: { increment: 1 }
        //   }
        // });

        // Check for badge progress
        await this.services.badge.checkMessageBadges(message.author.id, message.guild.id);
      } catch (error) {
        this.logger.error('Message handling error:', error);
      }
    });

    // Error handling
    this.client.on('error', (error) => {
      this.logger.error('Discord client error:', error);
    });

    this.client.on('warn', (warning) => {
      this.logger.warn('Discord client warning:', warning);
    });

    // Graceful shutdown handling
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Promise Rejection:', { reason, promise });
    });
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      this.shutdown('UNCAUGHT_EXCEPTION');
    });
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.logger.info(`🛑 Received ${signal}, shutting down gracefully...`);

    try {
      // Stop scheduler
      if (this.services.scheduler) {
        await this.services.scheduler.stop();
      }

      // Stop API service
      if (this.services.api) {
        await this.services.api.stop();
      }

      // Stop music service
      if (this.services.music) {
        await this.services.music.cleanup();
      }

      // Disconnect from Discord
      if (this.client) {
        this.client.destroy();
      }

      // Close database connection
      if (this.db) {
        await this.db.disconnect();
      }

      // Close cache connection
      if (this.cache) {
        await this.cache.disconnect();
      }

      this.logger.info('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the bot
if (require.main === module) {
  const bot = new HawkEsportsBot();
  bot.start().catch((error) => {
    console.error('Failed to start bot:', error);
    process.exit(1);
  });
}

export default HawkEsportsBot;