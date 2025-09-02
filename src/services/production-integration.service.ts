import { ExtendedClient } from '../types/client';
import { productionMonitoring } from './production-monitoring.service';
import { MetricsService } from './metrics.service';
import { productionLogger, createLogContext } from '../utils/production-logger';
import { LogCategory } from '../utils/logger';

/**
 * Production Integration Service
 * Connects production monitoring with Discord client and other services
 */
export class ProductionIntegrationService {
  private client: ExtendedClient;
  private metricsService: MetricsService;
  private isInitialized = false;

  constructor(client: ExtendedClient) {
    this.client = client;
    this.metricsService = new MetricsService(undefined, undefined, client);
  }

  /**
   * Initialize production monitoring integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Set Discord client and metrics service in production monitoring
      productionMonitoring.setDiscordClient(this.client);
      productionMonitoring.setMetricsService(this.metricsService);

      // Setup Discord event listeners for monitoring
      this.setupDiscordEventListeners();

      // Start production monitoring
      productionMonitoring.start();

      // Setup alert handlers
      this.setupAlertHandlers();

      this.isInitialized = true;

      productionLogger.info('Production integration initialized successfully', 
        createLogContext(LogCategory.SYSTEM));
    } catch (error) {
      productionLogger.error('Failed to initialize production integration', 
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      throw error;
    }
  }

  /**
   * Setup Discord event listeners for monitoring
   */
  private setupDiscordEventListeners(): void {
    // Track command usage
    this.client.on('interactionCreate', (interaction) => {
      if (interaction.isChatInputCommand()) {
        productionMonitoring.incrementCounter('commands');
        
        productionLogger.commandStart(
          interaction.commandName,
          createLogContext(LogCategory.COMMAND, {
            commandName: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guildId,
          }),
        );
      }
    });

    // Track errors
    this.client.on('error', (error) => {
      productionMonitoring.incrementCounter('errors');
      productionMonitoring.createAlert('critical', 'discord', `Discord client error: ${error.message}`);
      
      productionLogger.error('Discord client error', 
        createLogContext(LogCategory.SYSTEM, {
          error,
        }));
    });

    // Track warnings
    this.client.on('warn', (warning) => {
      productionLogger.warn('Discord client warning', 
        createLogContext(LogCategory.SYSTEM, {
          metadata: { warning },
        }));
    });

    // Track guild events for metrics
    this.client.on('guildCreate', (guild) => {
      productionLogger.info(`Bot joined guild: ${guild.name}`, 
        createLogContext(LogCategory.SYSTEM, {
          metadata: {
            guildId: guild.id,
            guildName: guild.name,
            memberCount: guild.memberCount,
          },
        }));
    });

    this.client.on('guildDelete', (guild) => {
      productionLogger.info(`Bot left guild: ${guild.name}`, 
        createLogContext(LogCategory.SYSTEM, {
          metadata: {
            guildId: guild.id,
            guildName: guild.name,
          },
        }));
    });

    // Track ready state
    this.client.on('ready', () => {
      productionLogger.info('Discord client ready', 
        createLogContext(LogCategory.SYSTEM, {
          metadata: {
            guilds: this.client.guilds.cache.size,
            users: this.client.users.cache.size,
            channels: this.client.channels.cache.size,
          },
        }));
    });

    // Track disconnect events
    this.client.on('disconnect', () => {
      productionMonitoring.createAlert('critical', 'discord', 'Discord client disconnected');
      
      productionLogger.error('Discord client disconnected', 
        createLogContext(LogCategory.SYSTEM));
    });

    this.client.on('reconnecting', () => {
      productionLogger.warn('Discord client reconnecting', 
        createLogContext(LogCategory.SYSTEM));
    });
  }

  /**
   * Setup alert handlers
   */
  private setupAlertHandlers(): void {
    productionMonitoring.on('alert', (alert) => {
      productionLogger.security(`Alert triggered: ${alert.type}`, 
        createLogContext(LogCategory.SECURITY, {
          metadata: { alert },
        }));

      // Here you could send alerts to Discord channels, webhooks, etc.
      this.handleAlert(alert);
    });

    productionMonitoring.on('alertResolved', (alert) => {
      productionLogger.info(`Alert resolved: ${alert.id}`, 
        createLogContext(LogCategory.SYSTEM, {
          metadata: { alert },
        }));
    });
  }

  /**
   * Handle alert notifications
   */
  private async handleAlert(alert: any): Promise<void> {
    try {
      // Log the alert
      const logLevel = alert.type === 'critical' ? 'error' : 
                      alert.type === 'warning' ? 'warn' : 'info';
      
      productionLogger[logLevel](`Production Alert: ${alert.message}`, 
        createLogContext(LogCategory.SECURITY, {
          metadata: {
            alertId: alert.id,
            service: alert.service,
            type: alert.type,
            timestamp: alert.timestamp,
          },
        }));

      // Here you could implement additional alert handling:
      // - Send to Discord webhook
      // - Send to monitoring channels
      // - Trigger external monitoring systems
      // - Send email notifications
      
    } catch (error) {
      productionLogger.error('Failed to handle alert', 
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: { alert },
        }));
    }
  }

  /**
   * Get current system status
   */
  async getSystemStatus(): Promise<{
    healthy: boolean;
    services: any[];
    metrics: any;
    alerts: any[];
  }> {
    try {
      const healthChecks = await productionMonitoring.runHealthChecks();
      const metrics = productionMonitoring.getMetrics();
      const alerts = productionMonitoring.getActiveAlerts();
      
      const healthy = healthChecks.every(check => check.status === 'healthy');
      
      return {
        healthy,
        services: healthChecks,
        metrics,
        alerts,
      };
    } catch (error) {
      productionLogger.error('Failed to get system status', 
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      
      return {
        healthy: false,
        services: [],
        metrics: null,
        alerts: [],
      };
    }
  }

  /**
   * Shutdown production monitoring
   */
  async shutdown(): Promise<void> {
    try {
      await productionMonitoring.shutdown();
      
      productionLogger.info('Production integration shutdown completed', 
        createLogContext(LogCategory.SYSTEM));
    } catch (error) {
      productionLogger.error('Failed to shutdown production integration', 
        createLogContext(LogCategory.SYSTEM, {
          error: error instanceof Error ? error : new Error(String(error)),
        }));
    }
  }

  /**
   * Get metrics service instance
   */
  getMetricsService(): MetricsService {
    return this.metricsService;
  }

  /**
   * Check if integration is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export default ProductionIntegrationService;