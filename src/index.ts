import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  EmbedBuilder,
  ChannelType,
  TextChannel,
} from 'discord.js';
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
import { ChallengeService } from '@/services/challenge.service';
import { RankService } from '@/services/rank.service';
import { OnboardingService } from './services/onboarding.service';
import { PunishmentService } from './services/punishment.service';
import { AutoModerationService } from './services/automod.service';
import { TicketService } from './services/ticket.service';
import { LoggingService } from './services/logging.service';
import { WeaponMasteryService } from './services/weapon-mastery.service';
import { RoleManagerService } from './services/role-manager.service';
import { XPService } from './services/xp.service';
import { PersistentTicketService } from './services/persistent-ticket.service';
import { PresenceFixesService } from './services/presence-fixes.service';
import { BadgeAuditService } from './services/badge-audit.service';
import { PresenceEnhancementsService } from './services/presence-enhancements.service';
import { BadgeOptimizationService } from './services/badge-optimization.service';
import { ExclusiveBadgeService } from './services/exclusive-badge.service';
import { DynamicBadgeService } from './services/dynamic-badge.service';
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
    api: APIService;
    automod: AutoModerationService;
    xp: XPService;
    badge: BadgeService;
    badgeOptimization: BadgeOptimizationService;
    exclusiveBadge: ExclusiveBadgeService;
    dynamicBadge: DynamicBadgeService;
    challenge: ChallengeService;
    logging: LoggingService;
    music: MusicService;
    onboarding: OnboardingService;
    presence: PresenceService;
    presenceEnhancements: PresenceEnhancementsService;
    pubg: PUBGService;
    punishment: PunishmentService;
    rank: RankService;
    roleManager: RoleManagerService;
    scheduler: SchedulerService;
    weaponMastery: WeaponMasteryService;
    clip: ClipService;
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
    const pubgService = new PUBGService(this.cache);
    const loggingService = new LoggingService(this.client, this.db);

    // Assign logging service and pubg service to client BEFORE creating RankService
    this.client.loggingService = loggingService;
    (this.client as any).pubg = pubgService;

    // Initialize XPService first as it's needed by other services
    const xpService = new XPService(this.client);
    const badgeService = new BadgeService(this.client, xpService, loggingService);

    this.services = {
      api: new APIService(this.client),
      automod: new AutoModerationService(this.client, this.db, punishmentService),
      xp: xpService,
      badge: badgeService,
      badgeOptimization: new BadgeOptimizationService(this.client, badgeService, pubgService),
      exclusiveBadge: new ExclusiveBadgeService(this.client, badgeService),
      dynamicBadge: new DynamicBadgeService(this.client, badgeService, pubgService),
      challenge: new ChallengeService(this.client),
      logging: loggingService,
      music: new MusicService(this.cache, this.db),
      onboarding: new OnboardingService(this.client),
      presence: new PresenceService(this.client),
      presenceEnhancements: new PresenceEnhancementsService(this.client),
      pubg: pubgService,
      punishment: punishmentService,
      rank: new RankService(this.client),
      roleManager: roleManagerService,
      scheduler: new SchedulerService(this.client),
      weaponMastery: new WeaponMasteryService(this.client),
      clip: new ClipService(this.client),
    } as any;

    // Attach individual services to client for direct access
    this.client.musicService = this.services.music;
    this.client.badgeService = this.services.badge;
    this.client.presenceService = this.services.presence;
    this.client.schedulerService = this.services.scheduler;
    this.client.apiService = this.services.api;
    (this.client as any).onboardingService = this.services.onboarding;
    (this.client as any).punishmentService = this.services.punishment;
    // Attach services to client as any to avoid type issues
    (this.client as any).automodService = this.services.automod;
    (this.client as any).ticketService = ticketService;
    (this.client as any).weaponMasteryService = this.services.weaponMastery;

    // Initialize PersistentTicketService
    (this.client as any).persistentTicketService = new PersistentTicketService(this.client);

    // Initialize PresenceFixesService
    (this.client as any).presenceFixesService = new PresenceFixesService(this.client);

    // Initialize BadgeAuditService
    (this.client as any).badgeAuditService = new BadgeAuditService(
      this.client,
      this.services.badge,
      this.db
    );

    // Initialize PresenceEnhancementsService
    (this.client as any).presenceEnhancementsService = this.services.presenceEnhancements;

    // Initialize BadgeOptimizationService
    (this.client as any).badgeOptimizationService = this.services.badgeOptimization;

    // Initialize ExclusiveBadgeService
    (this.client as any).exclusiveBadgeService = this.services.exclusiveBadge;

    // Initialize DynamicBadgeService
    (this.client as any).dynamicBadgeService = this.services.dynamicBadge;

    (this.client as any).roleManagerService = this.services.roleManager;
    (this.client as any).pubgService = this.services.pubg;
    (this.client as any).challengeService = this.services.challenge;
    (this.client as any).rankService = this.services.rank;
    (this.client as any).xpService = this.services.xp;
    (this.client as any).badgeService = this.services.badge;
    // rankingService is not implemented yet
    (this.client as any).presenceService = this.services.presence;

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
    const required = ['DISCORD_TOKEN', 'DATABASE_URL', 'PUBG_API_KEY'];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Log optional services status
    if (!process.env.REDIS_URL) {
      this.logger.info('⚠️ Redis URL not provided - cache will use memory fallback');
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

      // Test cache connection if Redis is available
      if (this.cache.isRedisConnected()) {
        await this.cache.set('bot:startup', Date.now().toString(), 60);
        const testValue = await this.cache.get('bot:startup');

        if (!testValue) {
          this.logger.warn('⚠️ Cache test failed, but continuing with fallback');
        } else {
          this.logger.info('✅ Cache service connected and tested');
        }
      } else {
        this.logger.info('✅ Cache service initialized with memory fallback');
      }
    } catch (error) {
      this.logger.warn('⚠️ Cache initialization failed, continuing with fallback:', error);
      // Don't throw error, allow bot to continue without Redis
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
      this.logger.info(
        `✅ Loaded ${stats.total} commands (${stats.slash} slash, ${stats.context} context)`
      );
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
      this.logger.info(
        `📊 Serving ${this.client.guilds.cache.size} guilds with ${this.client.users.cache.size} users`
      );

      // Set bot activity
      this.client.user.setActivity({
        name: 'PUBG matches and managing servers',
        type: ActivityType.Watching,
      });

      // Register slash commands with Discord API
      try {
        const { CommandDeployer } = await import('./deploy-commands');
        const deployer = new CommandDeployer(
          process.env.DISCORD_TOKEN!,
          process.env.DISCORD_CLIENT_ID!
        );

        // Deploy commands to all guilds the bot is in
        for (const guild of this.client.guilds.cache.values()) {
          await deployer.deployGuild(guild.id);
        }

        this.logger.info('✅ Slash commands registered with Discord API');
      } catch (error) {
        this.logger.error('Failed to register slash commands with Discord API:', error);
      }

      // Initialize persistent ticket service for all guilds
      try {
        const persistentTicketService = (this.client as any)
          .persistentTicketService as PersistentTicketService;
        if (persistentTicketService) {
          for (const guild of this.client.guilds.cache.values()) {
            await persistentTicketService.initializeEmbed(guild.id);
          }
          this.logger.info('✅ Persistent ticket service initialized for all guilds');
        }
      } catch (error) {
        this.logger.error('Failed to initialize persistent ticket service:', error);
      }

      this.logger.info('🎉 Hawk Esports Bot is ready!');
    });

    // Interaction handling
    this.client.on('interactionCreate', async interaction => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.commands.handleSlashCommand(interaction, this.client);
        } else if (interaction.isContextMenuCommand()) {
          await this.commands.handleContextCommand(interaction, this.client);
        } else if (interaction.isAutocomplete()) {
          await this.commands.handleAutocomplete(interaction, this.client);
        } else if (interaction.isButton()) {
          // Handle registration button interactions
          if (
            interaction.customId === 'start_server_registration' ||
            interaction.customId === 'registration_help' ||
            interaction.customId === 'view_rules' ||
            interaction.customId === 'register_pubg_prompt'
          ) {
            if (this.services.onboarding) {
              await this.services.onboarding.handleRegistrationButton(interaction);
            }
          }
          // Handle ticket-related button interactions
          else if (
            interaction.customId.includes('ticket') ||
            interaction.customId.includes('priority') ||
            interaction.customId === 'create_ticket_panel'
          ) {
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
    this.client.on('guildCreate', async guild => {
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

        // Initialize persistent ticket service for new guild
        try {
          const persistentTicketService = (this.client as any)
            .persistentTicketService as PersistentTicketService;
          if (persistentTicketService) {
            await persistentTicketService.initializeEmbed(guild.id);
            this.logger.info(`✅ Initialized persistent ticket service for guild: ${guild.name}`);
          }
        } catch (error) {
          this.logger.error(
            `Failed to initialize persistent ticket service for guild ${guild.name}:`,
            error
          );
        }
      } catch (error) {
        this.logger.error('Failed to initialize new guild:', error);
      }
    });

    this.client.on('guildDelete', async guild => {
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
                          '💡 **Dica:** Use `/checkin` novamente para criar uma nova sessão!'
                      )
                      .setColor(0xffa500)
                      .setThumbnail(member.displayAvatarURL())
                      .setTimestamp();

                    await textChannel.send({ embeds: [autoCheckoutEmbed] });
                  }

                  // Update presence service if available
                  if (this.services.presence) {
                    await this.services.presence.checkOut(
                      userId,
                      oldState.guild.id,
                      'Auto check-out - left voice channel'
                    );
                  }

                  // Check for early leave punishment
                  if (this.services.punishment) {
                    // Estimate session start time (this could be improved by storing actual session data)
                    const estimatedSessionStart = new Date(Date.now() - 30 * 60 * 1000); // Assume session started 30 min ago as minimum
                    await this.services.punishment.checkEarlyLeavePunishment(
                      userId,
                      oldState.guild.id,
                      estimatedSessionStart,
                      leftChannel.id
                    );
                  }

                  this.logger.info(
                    `Auto check-out performed for user ${userId} from channel ${leftChannel.name}`
                  );
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
    this.client.on('messageCreate', async message => {
      if (message.author.bot || !message.guild) {
        return;
      }

      try {
        // Update user activity
        await this.db.client.user.upsert({
          where: { id: message.author.id },
          update: {
            lastSeen: new Date(),
            messagesCount: { increment: 1 },
          },
          create: {
            id: message.author.id,
            username: message.author.username,
            discriminator: message.author.discriminator || '0',
            avatar: message.author.avatar,
            lastSeen: new Date(),
            messagesCount: 1,
          },
        });

        // Check for badge progress
        await this.services.badge.updateProgress(message.author.id, 'messages', 1);
      } catch (error) {
        this.logger.error('Message handling error:', error);
      }
    });

    // Error handling
    this.client.on('error', error => {
      this.logger.error('Discord client error:', {
        error: error instanceof Error ? error : new Error(String(error))
      });
    });

    this.client.on('warn', warning => {
      this.logger.warn('Discord client warning:', {
        metadata: { warning: String(warning) }
      });
    });

    // Graceful shutdown handling
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Promise Rejection:', {
        metadata: { reason, promise }
      });
    });
    process.on('uncaughtException', error => {
      this.logger.error('Uncaught Exception:', {
        error: error instanceof Error ? error : new Error(String(error))
      });
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
  bot.start().catch(error => {
    console.error('Failed to start bot:', error);
    process.exit(1);
  });
}

export default HawkEsportsBot;
