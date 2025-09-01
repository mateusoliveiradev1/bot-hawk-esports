import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

export interface LogContext {
  userId?: string;
  guildId?: string;
  channelId?: string;
  commandName?: string;
  requestId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  duration?: number;
  statusCode?: number;
  errorCode?: string;
  stackTrace?: string;
  metadata?: Record<string, any>;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  context?: LogContext;
  environment: string;
  version: string;
  hostname: string;
  pid: number;
}

export interface StructuredLoggerConfig {
  level: string;
  environment: string;
  version: string;
  logDir: string;
  maxFiles: number;
  maxSize: string;
  enableConsole: boolean;
  enableFile: boolean;
  enableElastic?: boolean;
  elasticConfig?: {
    host: string;
    index: string;
    apiKey?: string;
  };
  enableDiscord?: boolean;
  discordConfig?: {
    webhookUrl: string;
    minLevel: string;
  };
}

export interface LoggerConfig {
  level: string;
  environment: string;
  version: string;
  logDir: string;
  maxFiles: number;
  maxSize: string;
  enableConsole: boolean;
  enableFile: boolean;
  enableElastic?: boolean;
  elasticConfig?: {
    host: string;
    index: string;
    apiKey?: string;
  };
  enableDiscord?: boolean;
  discordConfig?: {
    webhookUrl: string;
    minLevel: string;
  };
}

export class StructuredLogger {
  private logger: winston.Logger;
  private config: LoggerConfig;
  private hostname: string;
  private pid: number;

  constructor(config: LoggerConfig, private serviceName: string = 'bot-hawk-esports') {
    this.config = config;
    this.hostname = require('os').hostname();
    this.pid = process.pid;
    
    this.ensureLogDirectory();
    this.setupLogger();
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * Setup Winston logger with structured format
   */
  private setupLogger(): void {
    const transports: winston.transport[] = [];

    // Console transport
    if (this.config.enableConsole) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, service, context }) => {
              const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
              return `${timestamp} [${service}] ${level}: ${message}${contextStr}`;
            }),
          ),
        }),
      );
    }

    // File transport - Combined logs
    if (this.config.enableFile) {
      transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'combined.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
          maxsize: this.parseSize(this.config.maxSize),
          maxFiles: this.config.maxFiles,
        }),
      );

      // Error logs separate file
      transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'error.log'),
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
          maxsize: this.parseSize(this.config.maxSize),
          maxFiles: this.config.maxFiles,
        }),
      );

      // Application logs (info and above)
      transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'app.log'),
          level: 'info',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
          maxsize: this.parseSize(this.config.maxSize),
          maxFiles: this.config.maxFiles,
        }),
      );

      // Debug logs separate file
      transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'debug.log'),
          level: 'debug',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
          maxsize: this.parseSize(this.config.maxSize),
          maxFiles: this.config.maxFiles,
        }),
      );
    }

    // Elasticsearch transport (if configured)
    if (this.config.enableElastic && this.config.elasticConfig) {
      // Note: You would need to install @elastic/winston-elasticsearch
      // transports.push(new ElasticsearchTransport(this.config.elasticConfig));
    }

    // Discord webhook transport for critical errors
    if (this.config.enableDiscord && this.config.discordConfig) {
      transports.push(this.createDiscordTransport());
    }

    this.logger = winston.createLogger({
      level: this.config.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: {
        service: this.serviceName,
        environment: this.config.environment,
        version: this.config.version,
        hostname: this.hostname,
        pid: this.pid,
      },
      transports,
    });

    // Handle uncaught exceptions and rejections
    this.logger.exceptions.handle(
      new winston.transports.File({
        filename: path.join(this.config.logDir, 'exceptions.log'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    );

    this.logger.rejections.handle(
      new winston.transports.File({
        filename: path.join(this.config.logDir, 'rejections.log'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    );
  }

  /**
   * Create Discord webhook transport for critical alerts
   */
  private createDiscordTransport(): winston.transport {
    const { webhookUrl, minLevel } = this.config.discordConfig!;

    return new winston.transports.Stream({
      stream: {
        write: async (message: string) => {
          try {
            const logEntry = JSON.parse(message);
            
            // Only send logs at or above the minimum level
            const levels = ['error', 'warn', 'info', 'debug'];
            const currentLevelIndex = levels.indexOf(logEntry.level);
            const minLevelIndex = levels.indexOf(minLevel);
            
            if (currentLevelIndex > minLevelIndex) {
              return;
            }

            const embed = {
              title: `🚨 ${logEntry.level.toUpperCase()} - ${logEntry.service}`,
              description: logEntry.message,
              color: this.getLogLevelColor(logEntry.level),
              fields: [
                {
                  name: 'Environment',
                  value: logEntry.environment,
                  inline: true,
                },
                {
                  name: 'Hostname',
                  value: logEntry.hostname,
                  inline: true,
                },
                {
                  name: 'Timestamp',
                  value: logEntry.timestamp,
                  inline: true,
                },
              ],
              timestamp: new Date().toISOString(),
            };

            if (logEntry.context) {
              embed.fields.push({
                name: 'Context',
                value: `\`\`\`json\n${JSON.stringify(logEntry.context, null, 2)}\`\`\``,
                inline: false,
              });
            }

            if (logEntry.stack) {
              embed.fields.push({
                name: 'Stack Trace',
                value: `\`\`\`\n${logEntry.stack.substring(0, 1000)}\`\`\``,
                inline: false,
              });
            }

            await fetch(webhookUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                embeds: [embed],
              }),
            });
          } catch (error) {
            // Avoid infinite loop by not logging this error
            console.error('Failed to send Discord webhook:', error);
          }
        },
      } as any,
      level: minLevel,
    });
  }

  /**
   * Get color for log level
   */
  private getLogLevelColor(level: string): number {
    switch (level) {
      case 'error': return 0xFF0000;   // Red
      case 'warn': return 0xFFA500;    // Orange
      case 'info': return 0x0099FF;    // Blue
      case 'debug': return 0x808080;   // Gray
      default: return 0x000000;        // Black
    }
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(size: string): number {
    const units: Record<string, number> = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024,
    };

    const match = size.toLowerCase().match(/^(\d+)(\w+)$/);
    if (!match) {
      return 10 * 1024 * 1024; // Default 10MB
    }

    const [, num, unit] = match;
    return parseInt(num) * (units[unit] || 1);
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogContext): StructuredLogger {
    const childLogger = Object.create(this);
    childLogger.logger = this.logger.child({ context });
    return childLogger;
  }

  /**
   * Log error with structured data
   */
  error(message: string, error?: Error | any, context?: LogContext): void {
    const logData: any = {
      message,
      context: { ...context },
    };

    if (error) {
      if (error instanceof Error) {
        logData.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
        logData.context.errorCode = error.name;
        logData.context.stackTrace = error.stack;
      } else {
        logData.error = error;
      }
    }

    this.logger.error(logData);
  }

  /**
   * Log warning with structured data
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn({
      message,
      context,
    });
  }

  /**
   * Log info with structured data
   */
  info(message: string, context?: LogContext): void {
    this.logger.info({
      message,
      context,
    });
  }

  /**
   * Log debug with structured data
   */
  debug(message: string, context?: LogContext): void {
    this.logger.debug({
      message,
      context,
    });
  }

  /**
   * Log HTTP request
   */
  logRequest(req: any, res: any, duration: number): void {
    const context: LogContext = {
      requestId: req.id || req.headers['x-request-id'],
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      duration,
      statusCode: res.statusCode,
      metadata: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        query: req.query,
        body: req.body,
      },
    };

    const level = res.statusCode >= 400 ? 'warn' : 'info';
    const message = `${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`;

    this.logger.log(level, {
      message,
      context,
    });
  }

  /**
   * Log Discord command execution
   */
  logCommand(commandName: string, userId: string, guildId: string, success: boolean, duration: number, error?: Error): void {
    const context: LogContext = {
      userId,
      guildId,
      commandName,
      duration,
      metadata: {
        success,
        executionTime: duration,
      },
    };

    if (error) {
      context.errorCode = error.name;
      context.stackTrace = error.stack;
    }

    const level = success ? 'info' : 'error';
    const message = `Command ${commandName} ${success ? 'executed successfully' : 'failed'} in ${duration}ms`;

    this.logger.log(level, {
      message,
      context,
    });
  }

  /**
   * Log database operation
   */
  logDatabase(operation: string, table: string, duration: number, success: boolean, error?: Error): void {
    const context: LogContext = {
      duration,
      metadata: {
        operation,
        table,
        success,
      },
    };

    if (error) {
      context.errorCode = error.name;
      context.stackTrace = error.stack;
    }

    const level = success ? 'debug' : 'error';
    const message = `Database ${operation} on ${table} ${success ? 'completed' : 'failed'} in ${duration}ms`;

    this.logger.log(level, {
      message,
      context,
    });
  }

  /**
   * Log API call to external service
   */
  logApiCall(service: string, endpoint: string, method: string, statusCode: number, duration: number, error?: Error): void {
    const context: LogContext = {
      duration,
      statusCode,
      metadata: {
        service,
        endpoint,
        method,
      },
    };

    if (error) {
      context.errorCode = error.name;
      context.stackTrace = error.stack;
    }

    const level = statusCode >= 400 ? 'warn' : 'info';
    const message = `API call to ${service} ${endpoint} - ${statusCode} - ${duration}ms`;

    this.logger.log(level, {
      message,
      context,
    });
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation: string, duration: number, metadata?: Record<string, any>): void {
    const context: LogContext = {
      duration,
      metadata: {
        operation,
        ...metadata,
      },
    };

    const level = duration > 5000 ? 'warn' : 'info'; // Warn if operation takes more than 5 seconds
    const message = `Performance: ${operation} completed in ${duration}ms`;

    this.logger.log(level, {
      message,
      context,
    });
  }

  /**
   * Log security event
   */
  logSecurity(event: string, userId?: string, ipAddress?: string, metadata?: Record<string, any>): void {
    const context: LogContext = {
      userId,
      ipAddress,
      metadata: {
        securityEvent: event,
        ...metadata,
      },
    };

    this.logger.warn({
      message: `Security event: ${event}`,
      context,
    });
  }

  /**
   * Get log statistics
   */
  async getLogStats(hours: number = 24): Promise<Record<string, any>> {
    // This would require reading log files or querying log storage
    // For now, return a placeholder
    return {
      period: `${hours} hours`,
      totalLogs: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      debugCount: 0,
      topErrors: [],
      performanceMetrics: {
        avgResponseTime: 0,
        slowestOperations: [],
      },
    };
  }

  /**
   * Search logs
   */
  async searchLogs(query: string, level?: string, limit: number = 100): Promise<LogEntry[]> {
    // This would require implementing log search functionality
    // For now, return empty array
    return [];
  }

  /**
   * Export logs for analysis
   */
  async exportLogs(startDate: Date, endDate: Date, format: 'json' | 'csv' = 'json'): Promise<string> {
    // This would require implementing log export functionality
    // For now, return empty string
    return '';
  }

  /**
   * Cleanup old logs
   */
  async cleanupLogs(maxAgeMs: number): Promise<void> {
    // This would require implementing log cleanup functionality
    // For now, just log the action
    this.info('Log cleanup requested', {
      metadata: {
        maxAgeMs,
        maxAgeDays: Math.floor(maxAgeMs / (24 * 60 * 60 * 1000)),
      },
    });
  }

  /**
   * Get logger instance for direct access
   */
  getLogger(): winston.Logger {
    return this.logger;
  }

  /**
   * Close logger and flush all transports
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.end(() => {
        resolve();
      });
    });
  }
}

/**
 * Create default structured logger configuration
 */
export function createDefaultLoggerConfig(environment: string = 'development'): LoggerConfig {
  return {
    level: environment === 'production' ? 'info' : 'debug',
    environment,
    version: process.env.npm_package_version || '1.0.0',
    logDir: path.join(process.cwd(), 'logs'),
    maxFiles: 14, // Keep 2 weeks of logs
    maxSize: '100MB',
    enableConsole: environment !== 'production',
    enableFile: true,
    enableElastic: false,
    enableDiscord: environment === 'production',
  };
}