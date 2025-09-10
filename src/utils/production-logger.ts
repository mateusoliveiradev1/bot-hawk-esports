import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import 'winston-daily-rotate-file';
import { productionConfig } from '../config/production.config';

/**
 * Production Logger with advanced features
 * - Daily log rotation
 * - Structured logging
 * - Error tracking
 * - Performance monitoring
 * - Security audit logs
 */

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
}

export enum LogCategory {
  SYSTEM = 'system',
  COMMAND = 'command',
  API = 'api',
  DATABASE = 'database',
  CACHE = 'cache',
  PUBG = 'pubg',
  MUSIC = 'music',
  GAME = 'game',
  BADGE = 'badge',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  TICKET = 'ticket',
  XP = 'xp',
  MODERATION = 'moderation',
  EVENT = 'event',
  ERROR = 'error',
  AUDIT = 'audit',
}

export interface ProductionLogContext {
  userId?: string;
  guildId?: string;
  channelId?: string;
  commandName?: string;
  category: LogCategory;
  duration?: number;
  statusCode?: number;
  error?: Error;
  metadata?: Record<string, any>;
  requestId?: string;
  userAgent?: string;
  ip?: string;
  timestamp?: Date;
}

class ProductionLogger {
  private logger: winston.Logger;
  private errorLogger: winston.Logger;
  private auditLogger: winston.Logger;
  private performanceLogger: winston.Logger;

  constructor() {
    this.ensureLogDirectories();
    this.createLoggers();
  }

  private ensureLogDirectories(): void {
    const logDirs = ['logs', 'logs/errors', 'logs/audit', 'logs/performance'];
    logDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private createLoggers(): void {
    // Main application logger
    this.logger = winston.createLogger({
      level: productionConfig.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            message,
            ...meta,
          });
        })
      ),
      transports: [
        // Daily rotating file for all logs
        new winston.transports.DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: productionConfig.logging.datePattern,
          maxSize: productionConfig.logging.maxSize,
          maxFiles: productionConfig.logging.maxFiles,
          level: productionConfig.logging.level,
        }),
        // Console output for development
        ...(process.env.NODE_ENV !== 'production'
          ? [
              new winston.transports.Console({
                format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
              }),
            ]
          : []),
      ],
    });

    // Error-specific logger
    this.errorLogger = winston.createLogger({
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.DailyRotateFile({
          filename: 'logs/errors/error-%DATE%.log',
          datePattern: productionConfig.logging.datePattern,
          maxSize: productionConfig.logging.maxSize,
          maxFiles: productionConfig.logging.maxFiles,
          level: 'error',
        }),
      ],
    });

    // Audit logger for security events
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      transports: [
        new winston.transports.DailyRotateFile({
          filename: 'logs/audit/audit-%DATE%.log',
          datePattern: productionConfig.logging.datePattern,
          maxSize: productionConfig.logging.maxSize,
          maxFiles: '30d', // Keep audit logs for 30 days
        }),
      ],
    });

    // Performance logger
    this.performanceLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      transports: [
        new winston.transports.DailyRotateFile({
          filename: 'logs/performance/performance-%DATE%.log',
          datePattern: productionConfig.logging.datePattern,
          maxSize: productionConfig.logging.maxSize,
          maxFiles: '7d', // Keep performance logs for 7 days
        }),
      ],
    });
  }

  private sanitizeContext(context: ProductionLogContext): ProductionLogContext {
    const sanitized = { ...context };

    // Remove sensitive information
    if (sanitized.metadata) {
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization'];
      sensitiveKeys.forEach(key => {
        if (sanitized.metadata![key]) {
          sanitized.metadata![key] = '[REDACTED]';
        }
      });
    }

    return sanitized;
  }

  private formatLogEntry(level: LogLevel, message: string, context?: ProductionLogContext) {
    const sanitizedContext = context ? this.sanitizeContext(context) : {};

    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...sanitizedContext,
    };
  }

  // Main logging methods
  error(message: string, context?: ProductionLogContext): void {
    const logEntry = this.formatLogEntry(LogLevel.ERROR, message, context);
    this.logger.error(logEntry);
    this.errorLogger.error(logEntry);
  }

  warn(message: string, context?: ProductionLogContext): void {
    const logEntry = this.formatLogEntry(LogLevel.WARN, message, context);
    this.logger.warn(logEntry);
  }

  info(message: string, context?: ProductionLogContext): void {
    const logEntry = this.formatLogEntry(LogLevel.INFO, message, context);
    this.logger.info(logEntry);
  }

  debug(message: string, context?: ProductionLogContext): void {
    const logEntry = this.formatLogEntry(LogLevel.DEBUG, message, context);
    this.logger.debug(logEntry);
  }

  // Specialized logging methods
  audit(action: string, context: ProductionLogContext): void {
    const auditEntry = {
      action,
      timestamp: new Date().toISOString(),
      category: LogCategory.AUDIT,
      ...this.sanitizeContext(context),
    };
    this.auditLogger.info(auditEntry);
  }

  performance(metric: string, value: number, context?: ProductionLogContext): void {
    const performanceEntry = {
      metric,
      value,
      timestamp: new Date().toISOString(),
      category: LogCategory.PERFORMANCE,
      ...this.sanitizeContext(context || { category: LogCategory.PERFORMANCE, userId: 'system' }),
    };
    this.performanceLogger.info(performanceEntry);
  }

  security(event: string, context: ProductionLogContext): void {
    const securityEntry = {
      event,
      timestamp: new Date().toISOString(),
      category: LogCategory.SECURITY,
      severity: 'high',
      ...this.sanitizeContext(context),
    };
    this.auditLogger.warn(securityEntry);
    this.logger.warn(`Security Event: ${event}`, securityEntry);
  }

  // Command execution logging
  commandStart(commandName: string, context: ProductionLogContext): void {
    this.info(`Command started: ${commandName}`, {
      ...context,
      category: LogCategory.COMMAND,
      commandName,
    });
  }

  commandEnd(commandName: string, duration: number, context: ProductionLogContext): void {
    this.info(`Command completed: ${commandName}`, {
      ...context,
      category: LogCategory.COMMAND,
      commandName,
      duration,
    });

    // Log performance if command took too long
    if (duration > 5000) {
      this.performance('slow_command', duration, {
        ...context,
        commandName,
      });
    }
  }

  commandError(commandName: string, error: Error, context: ProductionLogContext): void {
    this.error(`Command failed: ${commandName}`, {
      ...context,
      category: LogCategory.COMMAND,
      commandName,
      error,
    });
  }

  // API request logging
  apiRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    context?: ProductionLogContext
  ): void {
    const level = statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    const message = `${method} ${url} - ${statusCode} (${duration}ms)`;

    const logEntry = this.formatLogEntry(level, message, {
      ...context,
      category: LogCategory.API,
      statusCode,
      duration,
      metadata: {
        method,
        url,
        ...context?.metadata,
      },
    });

    this.logger.log(level, logEntry);
  }

  // Database operation logging
  dbQuery(query: string, duration: number, context?: ProductionLogContext): void {
    this.debug('Database query executed', {
      ...context,
      category: LogCategory.DATABASE,
      duration,
      metadata: {
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        ...context?.metadata,
      },
    });

    // Log slow queries
    if (duration > 1000) {
      this.performance('slow_query', duration, {
        ...context,
        metadata: { query },
      });
    }
  }

  // System health logging
  healthCheck(
    service: string,
    status: 'healthy' | 'unhealthy' | 'degraded',
    context?: ProductionLogContext
  ): void {
    const level = status === 'healthy' ? LogLevel.INFO : LogLevel.WARN;
    this.logger.log(level, `Health check: ${service} - ${status}`, {
      ...context,
      category: LogCategory.SYSTEM,
      metadata: {
        service,
        status,
        ...context?.metadata,
      },
    });
  }

  // Graceful shutdown
  async close(): Promise<void> {
    const loggers = [this.logger, this.errorLogger, this.auditLogger, this.performanceLogger];

    loggers.forEach(logger => {
      logger.close();
    });
  }
}

// Helper function to create valid log context
export function createLogContext(
  category: LogCategory,
  additional?: Partial<ProductionLogContext>
): ProductionLogContext {
  return {
    category,
    userId: 'system',
    ...additional,
  };
}

// Export singleton instance
export const productionLogger = new ProductionLogger();
export default productionLogger;
