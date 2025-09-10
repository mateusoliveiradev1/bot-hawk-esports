import { Logger, LogCategory } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { ExtendedClient } from '../types/client';
import { TextChannel, EmbedBuilder } from 'discord.js';
import * as nodemailer from 'nodemailer';

export interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  source: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  cooldownMs: number;
  channels: AlertChannel[];
  lastTriggered?: Date;
}

export interface AlertChannel {
  type: 'discord' | 'email' | 'webhook';
  target: string; // Channel ID, email, or webhook URL
  enabled: boolean;
}

export interface AlertConfig {
  discordChannelId?: string;
  emailConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    from: string;
    to: string[];
  };
  webhookUrl?: string;
  enabledChannels: ('discord' | 'email' | 'webhook')[];
}

export class AlertService {
  private logger: Logger;
  private alerts: Map<string, Alert> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private emailTransporter?: nodemailer.Transporter;

  constructor(
    private config: AlertConfig,
    private databaseService?: DatabaseService,
    private discordClient?: ExtendedClient,
  ) {
    this.logger = new Logger();
    this.setupEmailTransporter();
    this.setupDefaultRules();
  }

  /**
   * Setup email transporter if configured
   */
  private setupEmailTransporter(): void {
    if (this.config.emailConfig) {
      try {
        this.emailTransporter = nodemailer.createTransport(this.config.emailConfig);
        this.logger.info('Email transporter configured successfully');
      } catch (error) {
        this.logger.error('Failed to setup email transporter:', error);
      }
    }
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        condition: 'memory_percentage > threshold',
        threshold: 85,
        enabled: true,
        cooldownMs: 300000, // 5 minutes
        channels: [
          {
            type: 'discord',
            target: this.config.discordChannelId || '',
            enabled: !!this.config.discordChannelId,
          },
        ],
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: 'error_rate > threshold',
        threshold: 10, // 10 errors per minute
        enabled: true,
        cooldownMs: 600000, // 10 minutes
        channels: [
          {
            type: 'discord',
            target: this.config.discordChannelId || '',
            enabled: !!this.config.discordChannelId,
          },
        ],
      },
      {
        id: 'database_connection_failed',
        name: 'Database Connection Failed',
        condition: 'database_status == "unhealthy"',
        threshold: 1,
        enabled: true,
        cooldownMs: 180000, // 3 minutes
        channels: [
          {
            type: 'discord',
            target: this.config.discordChannelId || '',
            enabled: !!this.config.discordChannelId,
          },
          { type: 'email', target: 'admin', enabled: !!this.config.emailConfig },
        ],
      },
      {
        id: 'discord_disconnected',
        name: 'Discord Bot Disconnected',
        condition: 'discord_connected == false',
        threshold: 1,
        enabled: true,
        cooldownMs: 120000, // 2 minutes
        channels: [{ type: 'email', target: 'admin', enabled: !!this.config.emailConfig }],
      },
      {
        id: 'high_response_time',
        name: 'High API Response Time',
        condition: 'api_response_time > threshold',
        threshold: 5000, // 5 seconds
        enabled: true,
        cooldownMs: 900000, // 15 minutes
        channels: [
          {
            type: 'discord',
            target: this.config.discordChannelId || '',
            enabled: !!this.config.discordChannelId,
          },
        ],
      },
      {
        id: 'pubg_api_circuit_breaker_open',
        name: 'PUBG API Circuit Breaker Open',
        condition: 'pubg_circuit_breaker_state == "OPEN"',
        threshold: 1,
        enabled: true,
        cooldownMs: 300000, // 5 minutes
        channels: [
          {
            type: 'discord',
            target: this.config.discordChannelId || '',
            enabled: !!this.config.discordChannelId,
          },
        ],
      },
      {
        id: 'redis_connection_failed',
        name: 'Redis Connection Failed',
        condition: 'redis_status == "unhealthy"',
        threshold: 1,
        enabled: true,
        cooldownMs: 180000, // 3 minutes
        channels: [
          {
            type: 'discord',
            target: this.config.discordChannelId || '',
            enabled: !!this.config.discordChannelId,
          },
        ],
      },
      {
        id: 'spotify_api_unavailable',
        name: 'Spotify API Unavailable',
        condition: 'spotify_status == "unavailable"',
        threshold: 1,
        enabled: true,
        cooldownMs: 600000, // 10 minutes
        channels: [
          {
            type: 'discord',
            target: this.config.discordChannelId || '',
            enabled: !!this.config.discordChannelId,
          },
        ],
      },
      {
        id: 'high_cpu_usage',
        name: 'High CPU Usage',
        condition: 'cpu_percentage > threshold',
        threshold: 80,
        enabled: true,
        cooldownMs: 300000, // 5 minutes
        channels: [
          {
            type: 'discord',
            target: this.config.discordChannelId || '',
            enabled: !!this.config.discordChannelId,
          },
        ],
      },
    ];

    defaultRules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });

    this.logger.info(`Configured ${defaultRules.length} default alert rules`);
  }

  /**
   * Create and send an alert
   */
  async createAlert(
    type: Alert['type'],
    title: string,
    message: string,
    source: string,
    metadata?: Record<string, any>,
  ): Promise<string> {
    const alertId = `${source}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alert: Alert = {
      id: alertId,
      type,
      title,
      message,
      source,
      timestamp: new Date(),
      resolved: false,
      metadata,
    };

    this.alerts.set(alertId, alert);

    // Send alert through configured channels
    await this.sendAlert(alert);

    // Store in database if available
    if (this.databaseService) {
      try {
        await this.storeAlertInDatabase(alert);
      } catch (error) {
        this.logger.error('Failed to store alert in database:', error);
      }
    }

    this.logger.info(`Alert created: ${title}`, {
      category: LogCategory.SYSTEM,
      metadata: { alertId, type, source, ...metadata },
    });

    return alertId;
  }

  /**
   * Check metrics against alert rules
   */
  async checkAlertRules(metrics: Record<string, any>): Promise<void> {
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) {
        continue;
      }

      // Check cooldown
      const lastTriggered = this.cooldowns.get(ruleId);
      if (lastTriggered && Date.now() - lastTriggered < rule.cooldownMs) {
        continue;
      }

      try {
        const shouldTrigger = this.evaluateCondition(rule, metrics);

        if (shouldTrigger) {
          await this.triggerAlert(rule, metrics);
          this.cooldowns.set(ruleId, Date.now());
        }
      } catch (error) {
        this.logger.error(`Failed to evaluate rule ${rule.name}:`, error);
      }
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(rule: AlertRule, metrics: Record<string, any>): boolean {
    try {
      // Simple condition evaluation - in production, use a proper expression evaluator
      const condition = rule.condition
        .replace(/memory_percentage/g, metrics.memory_percentage || 0)
        .replace(/cpu_percentage/g, metrics.cpu_percentage || 0)
        .replace(/error_rate/g, metrics.error_rate || 0)
        .replace(/database_status/g, `"${metrics.database_status || 'unknown'}"`)
        .replace(/redis_status/g, `"${metrics.redis_status || 'unknown'}"`)
        .replace(/spotify_status/g, `"${metrics.spotify_status || 'unknown'}"`)
        .replace(/pubg_circuit_breaker_state/g, `"${metrics.pubg_circuit_breaker_state || 'CLOSED'}"`)
        .replace(/discord_connected/g, metrics.discord_connected || false)
        .replace(/api_response_time/g, metrics.api_response_time || 0)
        .replace(/threshold/g, rule.threshold.toString());

      // Use Function constructor for safe evaluation (better than eval)
      const result = new Function('return ' + condition)();
      return Boolean(result);
    } catch (error) {
      this.logger.error(`Failed to evaluate condition for rule ${rule.name}:`, error);
      return false;
    }
  }

  /**
   * Trigger an alert based on a rule
   */
  private async triggerAlert(rule: AlertRule, metrics: Record<string, any>): Promise<void> {
    const type: Alert['type'] =
      rule.threshold > 90 ? 'critical' : rule.threshold > 70 ? 'warning' : 'info';

    let message = `Alert rule "${rule.name}" has been triggered.\n`;
    message += `Condition: ${rule.condition}\n`;
    message += `Threshold: ${rule.threshold}\n`;
    message += `Current metrics: ${JSON.stringify(metrics, null, 2)}`;

    await this.createAlert(type, rule.name, message, 'alert_rule', {
      ruleId: rule.id,
      condition: rule.condition,
      threshold: rule.threshold,
      metrics,
    });
  }

  /**
   * Send alert through configured channels
   */
  private async sendAlert(alert: Alert): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.enabledChannels.includes('discord') && this.config.discordChannelId) {
      promises.push(this.sendDiscordAlert(alert));
    }

    if (this.config.enabledChannels.includes('email') && this.config.emailConfig) {
      promises.push(this.sendEmailAlert(alert));
    }

    if (this.config.enabledChannels.includes('webhook') && this.config.webhookUrl) {
      promises.push(this.sendWebhookAlert(alert));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Send alert to Discord channel
   */
  private async sendDiscordAlert(alert: Alert): Promise<void> {
    try {
      if (!this.discordClient || !this.discordClient.isReady()) {
        throw new Error('Discord client not ready');
      }

      const channel = await this.discordClient.channels.fetch(this.config.discordChannelId!);
      if (!channel || !channel.isTextBased()) {
        throw new Error('Invalid Discord channel');
      }

      const embed = new EmbedBuilder()
        .setTitle(`🚨 ${alert.title}`)
        .setDescription(alert.message)
        .setColor(this.getAlertColor(alert.type))
        .addFields(
          { name: 'Source', value: alert.source, inline: true },
          { name: 'Type', value: alert.type.toUpperCase(), inline: true },
          { name: 'Time', value: alert.timestamp.toISOString(), inline: true },
        )
        .setTimestamp(alert.timestamp);

      if (alert.metadata) {
        embed.addFields({
          name: 'Metadata',
          value: `\`\`\`json\n${JSON.stringify(alert.metadata, null, 2)}\`\`\``,
          inline: false,
        });
      }

      await (channel as TextChannel).send({ embeds: [embed] });
      this.logger.debug(`Discord alert sent for: ${alert.title}`);
    } catch (error) {
      this.logger.error('Failed to send Discord alert:', error);
    }
  }

  /**
   * Send alert via email
   */
  private async sendEmailAlert(alert: Alert): Promise<void> {
    try {
      if (!this.emailTransporter || !this.config.emailConfig) {
        throw new Error('Email not configured');
      }

      const subject = `[${alert.type.toUpperCase()}] ${alert.title}`;
      const html = `
        <h2>🚨 Alert: ${alert.title}</h2>
        <p><strong>Type:</strong> ${alert.type.toUpperCase()}</p>
        <p><strong>Source:</strong> ${alert.source}</p>
        <p><strong>Time:</strong> ${alert.timestamp.toISOString()}</p>
        <p><strong>Message:</strong></p>
        <pre>${alert.message}</pre>
        ${alert.metadata ? `<p><strong>Metadata:</strong></p><pre>${JSON.stringify(alert.metadata, null, 2)}</pre>` : ''}
      `;

      await this.emailTransporter.sendMail({
        from: this.config.emailConfig.from,
        to: this.config.emailConfig.to,
        subject,
        html,
      });

      this.logger.debug(`Email alert sent for: ${alert.title}`);
    } catch (error) {
      this.logger.error('Failed to send email alert:', error);
    }
  }

  /**
   * Send alert to webhook
   */
  private async sendWebhookAlert(alert: Alert): Promise<void> {
    try {
      if (!this.config.webhookUrl) {
        throw new Error('Webhook URL not configured');
      }

      const payload = {
        alert_id: alert.id,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        source: alert.source,
        timestamp: alert.timestamp.toISOString(),
        resolved: alert.resolved,
        metadata: alert.metadata,
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
      }

      this.logger.debug(`Webhook alert sent for: ${alert.title}`);
    } catch (error) {
      this.logger.error('Failed to send webhook alert:', error);
    }
  }

  /**
   * Get color for alert type
   */
  private getAlertColor(type: Alert['type']): number {
    switch (type) {
      case 'critical':
        return 0xff0000; // Red
      case 'warning':
        return 0xffa500; // Orange
      case 'info':
        return 0x0099ff; // Blue
      default:
        return 0x808080; // Gray
    }
  }

  /**
   * Store alert in database
   */
  private async storeAlertInDatabase(alert: Alert): Promise<void> {
    if (!this.databaseService) {
      return;
    }

    try {
      // This would need to be implemented based on your database schema
      // For now, just log that we would store it
      this.logger.debug(`Would store alert in database: ${alert.id}`);
    } catch (error) {
      this.logger.error('Failed to store alert in database:', error);
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy?: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();
    alert.metadata = { ...alert.metadata, resolvedBy };

    this.logger.info(`Alert resolved: ${alert.title}`, {
      category: LogCategory.SYSTEM,
      metadata: { alertId, resolvedBy, resolvedAt: alert.resolvedAt },
    });

    return true;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Add or update alert rule
   */
  setAlertRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.logger.info(`Alert rule updated: ${rule.name}`);
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Enable/disable alert rule
   */
  toggleAlertRule(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return false;
    }

    rule.enabled = enabled;
    this.logger.info(`Alert rule ${enabled ? 'enabled' : 'disabled'}: ${rule.name}`);
    return true;
  }

  /**
   * Start monitoring (integrate with metrics service)
   */
  startMonitoring(
    metricsCallback: () => Promise<Record<string, any>>,
    intervalMs: number = 60000,
  ): void {
    setInterval(async () => {
      try {
        const metrics = await metricsCallback();
        await this.checkAlertRules(metrics);
      } catch (error) {
        this.logger.error('Failed to check alert rules:', error);
      }
    }, intervalMs);

    this.logger.info(`Started alert monitoring (interval: ${intervalMs}ms)`);
  }

  /**
   * Cleanup old alerts
   */
  cleanupOldAlerts(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    // 7 days default
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const [alertId, alert] of this.alerts) {
      if (alert.timestamp.getTime() < cutoff) {
        this.alerts.delete(alertId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info(`Cleaned up ${cleaned} old alerts`);
    }
  }
}
