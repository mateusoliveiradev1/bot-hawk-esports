import { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder, ChannelType, TextChannel } from 'discord.js';
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
import { PunishmentService } from './services/punishment.service';
import { AutoModerationService } from './services/automod.service';
import { TicketService } from './services/ticket.service';
import { LoggingService } from './services/logging.service';
import { WeaponMasteryService } from './services/weapon-mastery.service';
import { RoleManagerService } from './services/role-manager.service';
import { CommandManager } from './commands/index';
import { MemberEvents } from './events/memberEvents';
import { MessageEvents } from './events/messageEvents';
import { handleTicketButtonInteraction, handleTicketModalSubmission } from './events/ticketEvents';
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
    punishment: PunishmentService;
    automod: AutoModerationService;
    logging: LoggingService;
    roleManager: RoleManagerService;
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
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
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

    // Attach services to client for command access
    this.client.database = this.db;
    this.client.db = this.db;
    this.client.cache = this.cache;
    this.client.logger = this.logger;
    
    // Initialize services with proper dependencies
    const ticketService = new TicketService(this.client);
    const punishmentService = new PunishmentService(this.client, this.db);
    const roleManagerService = new RoleManagerService();
    
    this.services = {
      api: new APIService(this.client),
      automod: new AutoModerationService(this.client, this.db, punishmentService),
      badge: new BadgeService(this.client),
      logging: new LoggingService(this.client, this.db),
      music: new MusicService(this.cache, this.db),
      onboarding: new OnboardingService(this.client),
      presence: new PresenceService(this.client),
      punishment: punishmentService,
      roleManager: roleManagerService,
      scheduler: new SchedulerService(this.client),
      ticket: ticketService,
      weaponMastery: new WeaponMasteryService(this.client)
    } as any;
    
    // Attach individual services to client for direct access
    this.client.musicService = this.services.music;
    this.client.badgeService = this.services.badge;
    this.client.presenceService = this.services.presence;
    this.client.schedulerService = this.services.scheduler;
    this.client.apiService = this.services.api;
    this.client.onboardingService = this.services.onboarding;
    this.client.punishmentService = this.services.punishment;
    this.client.automodService = this.services.automod;
    this.client.ticketService = ticketService;
    this.client.weaponMasteryService = this.services.weaponMastery;
    this.client.roleManagerService = this.services.roleManager;
    
    // Initialize command manager
    this.commands = new CommandManager(this.client);
    
    // Attach services to client
    this.client.services = this.services as any;

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
      await this.setupEventListeners();

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
  private async setupEventListeners(): Promise<void> {
    // Ready event
    this.client.once('clientReady', async () => {
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

      // Register slash commands with Discord API
      try {
        const { CommandDeployer } = await import('./deploy-commands');
        const deployer = new CommandDeployer(process.env.DISCORD_TOKEN!, process.env.DISCORD_CLIENT_ID!);
        
        // Deploy commands to all guilds the bot is in
        for (const guild of this.client.guilds.cache.values()) {
          await deployer.deployGuild(guild.id);
        }
        
        this.logger.info('✅ Slash commands registered with Discord API');
      } catch (error) {
        this.logger.error('Failed to register slash commands with Discord API:', error);
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
        } else if (interaction.isButton()) {
          // Handle ticket-related button interactions
          if (interaction.customId.includes('ticket') || interaction.customId.includes('priority') || interaction.customId === 'create_ticket_panel') {
            await handleTicketButtonInteraction(interaction, this.client);
          }
        } else if (interaction.isModalSubmit()) {
          // Handle ticket-related modal submissions
          if (interaction.customId.includes('ticket')) {
            await handleTicketModalSubmission(interaction, this.client);
          }
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

        // Initialize guild roles and permissions
        if (this.services.roleManager) {
          await this.services.roleManager.initializeGuildRoles(guild);
          await this.services.roleManager.setupChannelPermissions(guild);
          this.logger.info(`✅ Initialized roles and permissions for guild: ${guild.name}`);
        }
      } catch (error) {
        this.logger.error('Failed to initialize new guild:', error);
      }
    });

    this.client.on('guildDelete', async (guild) => {
      this.logger.info(`📤 Left guild: ${guild.name} (${guild.id})`);
    });

    // Initialize event handlers
    new MemberEvents(this.client);
    new MessageEvents(this.client);
    
    // Import and initialize new event handlers
    try {
      const { VoiceEvents } = await import('./events/voiceEvents');
      const { GuildEvents } = await import('./events/guildEvents');
      
      new VoiceEvents(this.client);
      new GuildEvents(this.client);
    } catch (error) {
      this.logger.error('Failed to initialize new event handlers:', error);
    }

    // Voice state updates for music and auto check-out
    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      try {
        // Handle auto check-out when user leaves session voice channel
        if (oldState.channel && !newState.channel) {
          // User left a voice channel
          const leftChannel = oldState.channel;
          const userId = oldState.member?.id;
          
          if (userId && leftChannel.name.includes('🎮')) {
            // Check if this is a session channel created by check-in
            const isSessionChannel = leftChannel.name.match(/🎮.*(?:MM|Scrim|Campeonato|Ranked)/i);
            
            if (isSessionChannel) {
              // Auto check-out logic
              const member = oldState.member;
              if (member) {
                try {
                  // Find text channel in the same category to send notification
                  const category = leftChannel.parent;
                  const textChannel = category?.children.cache.find(
                    ch => ch.type === ChannelType.GuildText && ch.name.includes('chat')
                  ) as TextChannel;
                  
                  // Send auto check-out notification
                  if (textChannel) {
                    const autoCheckoutEmbed = new EmbedBuilder()
                      .setTitle('🚪 Auto Check-out')
                      .setDescription(
                        `${member.displayName} saiu do canal de voz e foi automaticamente removido da sessão.\n\n` +
                        `⏰ **Saída detectada em:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
                        `🔊 **Canal:** ${leftChannel.name}\n\n` +
                        `💡 **Dica:** Use \`/checkin\` novamente para criar uma nova sessão!`
                      )
                      .setColor(0xffa500)
                      .setThumbnail(member.displayAvatarURL())
                      .setTimestamp();
                    
                    await textChannel.send({ embeds: [autoCheckoutEmbed] });
                  }
                  
                  // Update presence service if available
                  if (this.services.presence) {
                    await this.services.presence.checkOut(userId, oldState.guild.id, 'Auto check-out - left voice channel');
                  }
                  
                  // Check for early leave punishment
                  if (this.services.punishment) {
                    // Estimate session start time (this could be improved by storing actual session data)
                    const estimatedSessionStart = new Date(Date.now() - (30 * 60 * 1000)); // Assume session started 30 min ago as minimum
                    await this.services.punishment.checkEarlyLeavePunishment(
                      userId,
                      oldState.guild.id,
                      estimatedSessionStart,
                      leftChannel.id
                    );
                  }
                  
                  this.logger.info(`Auto check-out performed for user ${userId} from channel ${leftChannel.name}`);
                } catch (autoCheckoutError) {
                  this.logger.error('Auto check-out error:', autoCheckoutError);
                }
              }
            }
          }
        }
        
        // Voice state updates are also handled internally by MusicService
        // No additional handler needed for music functionality
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
        // Update user activity
        await this.db.client.user.upsert({
          where: { id: message.author.id },
          update: {
            lastSeen: new Date(),
            messagesCount: { increment: 1 }
          },
          create: {
            id: message.author.id,
            username: message.author.username,
            discriminator: message.author.discriminator || '0',
            avatar: message.author.avatar,
            lastSeen: new Date(),
            messagesCount: 1
          }
        });

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