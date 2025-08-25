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
import { OnboardingService } from './services/onboarding.service';
import { CommandManager } from './commands/index';
import { MemberEvents } from './events/memberEvents';
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
    onboarding: OnboardingService;
  };
  private commands: CommandManager;
  private isShuttingDown = false;

  constructor() {
    this.logger = new Logger();
    
    // Initialize database and cache first
    this.db = new DatabaseService();
    this.cache = new CacheService();
    
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
        GatewayIntentBits.DirectMessages,
      ],
      partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember,
      ],
      allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false,
      },
    }) as ExtendedClient;

    // Initialize command manager
    this.commands = new CommandManager(this.client);
    
    this.services = {
      pubg: new PUBGService(),
      music: new MusicService(),
      game: new GameService(this.client),
      badge: new BadgeService(this.client),
      ranking: new RankingService(this.client),
      presence: new PresenceService(this.client),
      clip: new ClipService(this.client),
      scheduler: new SchedulerService(this.client),
      api: new APIService(this.client),
      onboarding: new OnboardingService(this.client),
    };

    // Services are available through this.services, this.db, this.cache, and this.commands
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
      'PUBG_API_KEY',
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
      // Services are initialized in their constructors
      this.logger.info('All services initialized');
      
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
      if (!this.client.user) {
        return;
      }

      this.logger.info(`🤖 Bot logged in as ${this.client.user.tag}`);
      this.logger.info(`📊 Serving ${this.client.guilds.cache.size} guilds with ${this.client.users.cache.size} users`);

      // Set bot activity
      this.client.user.setActivity({
        name: 'PUBG matches and managing servers',
        type: ActivityType.Watching,
      });

      // Register slash commands
      try {
        // Commands are loaded in constructor
        this.logger.info('Commands loaded');
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
          },
          create: {
            id: guild.id,
            name: guild.name,
            ownerId: guild.ownerId,
          },
        });
      } catch (error) {
        this.logger.error('Failed to initialize new guild:', error);
      }
    });

    this.client.on('guildDelete', async (guild) => {
      this.logger.info(`📤 Left guild: ${guild.name} (${guild.id})`);
    });

    // Initialize member events handler
    new MemberEvents(this.client);

    // Voice state updates for music
    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      try {
        // Voice state updates are handled internally by MusicService
        // No external handler needed
      } catch (error) {
        this.logger.error('Voice state update error:', error);
      }
    });

    // Message events for activity tracking
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot || !message.guild) {
        return;
      }

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
        await this.services.badge.updateProgress(message.author.id, 'messages', 1);
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
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    this.logger.info(`🛑 Received ${signal}, shutting down gracefully...`);

    try {
      // Stop scheduler
      if (this.services.scheduler) {
        this.services.scheduler.shutdown();
      }

      // Stop API service
      if (this.services.api) {
        await this.services.api.stop();
      }

      // Stop music service
      if (this.services.music) {
        // Cleanup all guild connections
        for (const guildId of this.client.guilds.cache.keys()) {
          this.services.music.cleanup(guildId);
        }
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