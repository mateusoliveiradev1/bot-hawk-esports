import { StructuredLoggerConfig } from '../services/structured-logger.service';
import { BackupConfig } from '../services/backup.service';

export interface AlertConfig {
  enabled: boolean;
  enabledChannels: ('discord' | 'email' | 'webhook')[];
  channels: {
    discord: {
      enabled: boolean;
      webhook: string;
      username: string;
      avatar?: string;
    };
    email: {
      enabled: boolean;
      smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
          user: string;
          pass: string;
        };
      };
      from: string;
      to: string[];
    };
    webhook: {
      enabled: boolean;
      url: string;
      headers: Record<string, string>;
      timeout: number;
    };
  };
  rules: {
    memoryUsage: {
      enabled: boolean;
      warningThreshold: number;
      criticalThreshold: number;
      checkInterval: number;
    };
    errorRate: {
      enabled: boolean;
      warningThreshold: number;
      criticalThreshold: number;
      timeWindow: number;
    };
    databaseConnection: {
      enabled: boolean;
      checkInterval: number;
      timeout: number;
    };
    discordConnection: {
      enabled: boolean;
      checkInterval: number;
      timeout: number;
    };
    apiResponseTime: {
      enabled: boolean;
      warningThreshold: number;
      criticalThreshold: number;
      checkInterval: number;
    };
  };
  cooldown: {
    warning: number;
    critical: number;
    resolved: number;
  };
}

export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  retries: number;
}

export interface MetricsConfig {
  enabled: boolean;
  collectInterval: number;
  retentionDays: number;
}

/**
 * Monitoring and logging configuration
 */
export interface MonitoringConfig {
  logging: StructuredLoggerConfig;
  alerts: AlertConfig;
  healthCheck: HealthCheckConfig;
  metrics: MetricsConfig;
  backup: BackupConfig;
}

/**
 * Default monitoring configuration
 */
export const defaultMonitoringConfig: MonitoringConfig = {
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    logDir: process.env.LOG_DIR || './logs',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '14'),
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    enableConsole: process.env.LOG_CONSOLE !== 'false',
    enableFile: process.env.LOG_FILE !== 'false',
    enableElastic: process.env.ELASTICSEARCH_URL ? true : false,
    elasticConfig: process.env.ELASTICSEARCH_URL
      ? {
          host: process.env.ELASTICSEARCH_URL,
          index: process.env.ELASTICSEARCH_INDEX || 'bot-hawk-logs',
          apiKey: process.env.ELASTICSEARCH_API_KEY,
        }
      : undefined,
    enableDiscord: process.env.DISCORD_LOG_WEBHOOK ? true : false,
    discordConfig: process.env.DISCORD_LOG_WEBHOOK
      ? {
          webhookUrl: process.env.DISCORD_LOG_WEBHOOK,
          minLevel: process.env.DISCORD_LOG_MIN_LEVEL || 'error',
        }
      : undefined,
  },
  alerts: {
    enabled: process.env.ALERTS_ENABLED !== 'false',
    enabledChannels: [
      ...(process.env.DISCORD_ALERT_WEBHOOK ? ['discord' as const] : []),
      ...(process.env.SMTP_HOST ? ['email' as const] : []),
      ...(process.env.ALERT_WEBHOOK_URL ? ['webhook' as const] : []),
    ],
    channels: {
      discord: {
        enabled: process.env.DISCORD_ALERT_WEBHOOK ? true : false,
        webhook: process.env.DISCORD_ALERT_WEBHOOK || '',
        username: process.env.DISCORD_ALERT_USERNAME || 'Bot Hawk Alerts',
        avatar: process.env.DISCORD_ALERT_AVATAR,
      },
      email: {
        enabled: process.env.SMTP_HOST ? true : false,
        smtp: {
          host: process.env.SMTP_HOST || '',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || '',
          },
        },
        from: process.env.ALERT_EMAIL_FROM || '',
        to: process.env.ALERT_EMAIL_TO?.split(',') || [],
      },
      webhook: {
        enabled: process.env.ALERT_WEBHOOK_URL ? true : false,
        url: process.env.ALERT_WEBHOOK_URL || '',
        headers: process.env.ALERT_WEBHOOK_HEADERS
          ? JSON.parse(process.env.ALERT_WEBHOOK_HEADERS)
          : {},
        timeout: parseInt(process.env.ALERT_WEBHOOK_TIMEOUT || '5000'),
      },
    },
    rules: {
      memoryUsage: {
        enabled: true,
        warningThreshold: parseInt(process.env.MEMORY_WARNING_THRESHOLD || '80'),
        criticalThreshold: parseInt(process.env.MEMORY_CRITICAL_THRESHOLD || '90'),
        checkInterval: 30000,
      },
      errorRate: {
        enabled: true,
        warningThreshold: parseInt(process.env.ERROR_RATE_WARNING || '5'),
        criticalThreshold: parseInt(process.env.ERROR_RATE_CRITICAL || '10'),
        timeWindow: 300000, // 5 minutes
      },
      databaseConnection: {
        enabled: true,
        checkInterval: 30000,
        timeout: 5000,
      },
      discordConnection: {
        enabled: true,
        checkInterval: 30000,
        timeout: 5000,
      },
      apiResponseTime: {
        enabled: true,
        warningThreshold: parseInt(process.env.API_RESPONSE_WARNING || '1000'),
        criticalThreshold: parseInt(process.env.API_RESPONSE_CRITICAL || '5000'),
        checkInterval: 60000,
      },
    },
    cooldown: {
      warning: 300000, // 5 minutes
      critical: 600000, // 10 minutes
      resolved: 60000, // 1 minute
    },
  },
  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES || '3'),
  },
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    collectInterval: parseInt(process.env.METRICS_COLLECT_INTERVAL || '60000'), // 1 minute
    retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '30'),
  },
  backup: {
    enabled: process.env.BACKUP_ENABLED !== 'false',
    schedule: {
      daily: process.env.BACKUP_DAILY !== 'false',
      weekly: process.env.BACKUP_WEEKLY === 'true',
      monthly: process.env.BACKUP_MONTHLY === 'true',
      customCron: process.env.BACKUP_CUSTOM_CRON,
    },
    retention: {
      daily: parseInt(process.env.BACKUP_RETENTION_DAILY || '7'),
      weekly: parseInt(process.env.BACKUP_RETENTION_WEEKLY || '4'),
      monthly: parseInt(process.env.BACKUP_RETENTION_MONTHLY || '12'),
    },
    compression: {
      enabled: process.env.BACKUP_COMPRESSION !== 'false',
      level: parseInt(process.env.BACKUP_COMPRESSION_LEVEL || '6'),
    },
    storage: {
      local: {
        enabled: true,
        path: process.env.BACKUP_DIR || './backups',
      },
    },
    verification: {
      enabled: process.env.BACKUP_VERIFICATION !== 'false',
      checksumAlgorithm: (process.env.BACKUP_CHECKSUM_ALGORITHM as 'md5' | 'sha256') || 'sha256',
    },
    notifications: {
      enabled: process.env.BACKUP_NOTIFICATIONS_ENABLED === 'true',
      onSuccess: process.env.BACKUP_NOTIFY_SUCCESS === 'true',
      onFailure: process.env.BACKUP_NOTIFY_FAILURE !== 'false',
      channels: process.env.BACKUP_NOTIFICATION_CHANNELS
        ? process.env.BACKUP_NOTIFICATION_CHANNELS.split(',')
        : [],
    },
  },
};

/**
 * Get monitoring configuration with environment overrides
 */
export function getMonitoringConfig(overrides?: Partial<MonitoringConfig>): MonitoringConfig {
  if (!overrides) {
    return defaultMonitoringConfig;
  }

  return {
    logging: {
      ...defaultMonitoringConfig.logging,
      ...overrides.logging,
    },
    alerts: {
      ...defaultMonitoringConfig.alerts,
      ...overrides.alerts,
      channels: {
        ...defaultMonitoringConfig.alerts.channels,
        ...overrides.alerts?.channels,
      },
      rules: {
        ...defaultMonitoringConfig.alerts.rules,
        ...overrides.alerts?.rules,
      },
      cooldown: {
        ...defaultMonitoringConfig.alerts.cooldown,
        ...overrides.alerts?.cooldown,
      },
    },
    healthCheck: {
      ...defaultMonitoringConfig.healthCheck,
      ...overrides.healthCheck,
    },
    metrics: {
      ...defaultMonitoringConfig.metrics,
      ...overrides.metrics,
    },
    backup: {
      ...defaultMonitoringConfig.backup,
      ...overrides.backup,
    },
  };
}

/**
 * Validate monitoring configuration
 */
export function validateMonitoringConfig(config: MonitoringConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate logging configuration
  if (!['error', 'warn', 'info', 'debug'].includes(config.logging.level)) {
    errors.push('Invalid log level. Must be one of: error, warn, info, debug');
  }

  // Validate maxSize format (should be like '20m', '100k', etc.)
  if (!config.logging.maxSize || !/^\d+[kmg]?$/i.test(config.logging.maxSize)) {
    errors.push('Log max size must be a valid size format (e.g., "20m", "100k")');
  }

  if (config.logging.maxFiles <= 0) {
    errors.push('Log max files must be greater than 0');
  }

  // Validate alert configuration
  if (config.alerts.enabled) {
    const { discord, email, webhook } = config.alerts.channels;

    if (discord.enabled && !discord.webhook) {
      errors.push('Discord webhook URL is required when Discord alerts are enabled');
    }

    if (email.enabled) {
      if (!email.smtp.host || !email.smtp.auth.user || !email.smtp.auth.pass) {
        errors.push('SMTP configuration is incomplete for email alerts');
      }
      if (email.to.length === 0) {
        errors.push('At least one email recipient is required for email alerts');
      }
    }

    if (webhook.enabled && !webhook.url) {
      errors.push('Webhook URL is required when webhook alerts are enabled');
    }

    // Validate thresholds
    const { memoryUsage, errorRate, apiResponseTime } = config.alerts.rules;

    if (memoryUsage.warningThreshold >= memoryUsage.criticalThreshold) {
      errors.push('Memory warning threshold must be less than critical threshold');
    }

    if (errorRate.warningThreshold >= errorRate.criticalThreshold) {
      errors.push('Error rate warning threshold must be less than critical threshold');
    }

    if (apiResponseTime.warningThreshold >= apiResponseTime.criticalThreshold) {
      errors.push('API response time warning threshold must be less than critical threshold');
    }
  }

  // Validate health check configuration
  if (config.healthCheck.interval <= 0) {
    errors.push('Health check interval must be greater than 0');
  }

  if (config.healthCheck.timeout <= 0) {
    errors.push('Health check timeout must be greater than 0');
  }

  if (config.healthCheck.retries < 0) {
    errors.push('Health check retries must be 0 or greater');
  }

  // Validate metrics configuration
  if (config.metrics.collectInterval <= 0) {
    errors.push('Metrics collect interval must be greater than 0');
  }

  if (config.metrics.retentionDays <= 0) {
    errors.push('Metrics retention days must be greater than 0');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
