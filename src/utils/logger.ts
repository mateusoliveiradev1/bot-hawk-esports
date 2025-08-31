import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import { THEME_COLORS } from '../constants/colors';

/**
 * Logger levels with enhanced categorization
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly',
}

/**
 * Log categories for better organization
 */
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
}

/**
 * Enhanced log context interface
 */
export interface LogContext {
  userId?: string;
  guildId?: string;
  channelId?: string;
  commandName?: string;
  category?: LogCategory;
  duration?: number;
  statusCode?: number;
  error?: Error;
  metadata?: Record<string, any>;
}

/**
 * Logger configuration interface
 */
interface LoggerConfig {
  level: LogLevel;
  file: string;
  maxSize: number;
  maxFiles: number;
  datePattern: string;
  format: winston.Logform.Format;
}

/**
 * Custom Logger class with enhanced functionality
 */
export class Logger {
  private logger!: winston.Logger;
  private config: LoggerConfig;

  constructor() {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
      file: process.env.LOG_FILE || 'logs/bot.log',
      maxSize: 5242880, // 5MB
      maxFiles: 5,
      datePattern: 'YYYY-MM-DD',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.prettyPrint(),
      ),
    };

    this.ensureLogDirectory();
    this.createLogger();
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.config.file);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Get circular replacer function for JSON.stringify
   */
  private getCircularReplacer() {
    const seen = new WeakSet();
    return (key: string, value: any) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
  }

  /**
   * Get category badge for console output
   */
  private getCategoryBadge(category: LogCategory): string {
    const badges: Record<LogCategory, string> = {
      [LogCategory.SYSTEM]: '🔧',
      [LogCategory.COMMAND]: '⚡',
      [LogCategory.API]: '🌐',
      [LogCategory.DATABASE]: '💾',
      [LogCategory.CACHE]: '⚡',
      [LogCategory.PUBG]: '🎮',
      [LogCategory.MUSIC]: '🎵',
      [LogCategory.GAME]: '🎯',
      [LogCategory.BADGE]: '🏆',
      [LogCategory.SECURITY]: '🔒',
      [LogCategory.PERFORMANCE]: '📊',
      [LogCategory.TICKET]: '🎫',
      [LogCategory.XP]: '⭐',
      [LogCategory.MODERATION]: '🛡️',
      [LogCategory.EVENT]: '📅',
    };
    return badges[category] || '📝';
  }

  /**
   * Create Winston logger instance with enhanced formatting
   */
  private createLogger(): void {
    const transports: winston.transport[] = [];

    // Enhanced console transport with category support
    transports.push(
      new winston.transports.Console({
        level: this.config.level,
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({
            format: 'HH:mm:ss',
          }),
          winston.format.printf(({ timestamp, level, message, category, userId, guildId, ...meta }) => {
            let log = `${timestamp}`;
            
            // Add category badge if present
            if (category) {
              const categoryBadge = this.getCategoryBadge(category as LogCategory);
              log += ` ${categoryBadge}`;
            }
            
            log += ` [${level}]`;
            
            // Add context info if present
            if (userId || guildId) {
              const context = [];
              if (guildId && typeof guildId === 'string') {context.push(`G:${guildId.slice(-4)}`);}
              if (userId && typeof userId === 'string') {context.push(`U:${userId.slice(-4)}`);}
              log += ` (${context.join('|')})`;
            }
            
            log += `: ${message}`;

            if (Object.keys(meta).length > 0) {
              try {
                // Safe JSON stringify to handle circular references
                log += ` ${JSON.stringify(meta, this.getCircularReplacer(), 2)}`;
              } catch (error) {
                log += ' [Object with circular reference]';
              }
            }

            return log;
          }),
        ),
      }),
    );

    // File transport
    transports.push(
      new winston.transports.File({
        filename: this.config.file,
        level: this.config.level,
        format: this.config.format,
        maxsize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        tailable: true,
      }),
    );

    // Error file transport
    transports.push(
      new winston.transports.File({
        filename: this.config.file.replace('.log', '.error.log'),
        level: LogLevel.ERROR,
        format: this.config.format,
        maxsize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        tailable: true,
      }),
    );

    this.logger = winston.createLogger({
      level: this.config.level,
      format: this.config.format,
      transports,
      exitOnError: false,
    });
  }

  /**
   * Enhanced log methods with context support
   */
  public error(message: string, context?: LogContext): void {
    this.logger.error(message, this.formatContext(context));
  }

  public warn(message: string, context?: LogContext): void {
    this.logger.warn(message, this.formatContext(context));
  }

  public info(message: string, context?: LogContext): void {
    this.logger.info(message, this.formatContext(context));
  }

  public http(message: string, context?: LogContext): void {
    this.logger.http(message, this.formatContext(context));
  }

  public verbose(message: string, context?: LogContext): void {
    this.logger.verbose(message, this.formatContext(context));
  }

  public debug(message: string, context?: LogContext): void {
    this.logger.debug(message, this.formatContext(context));
  }

  public silly(message: string, context?: LogContext): void {
    this.logger.silly(message, this.formatContext(context));
  }

  /**
   * Format log context for winston
   */
  private formatContext(context?: LogContext): any {
    if (!context) {return {};}
    
    const formatted: any = {};
    
    // Add context fields to the log entry
    if (context.userId) {formatted.userId = context.userId;}
    if (context.guildId) {formatted.guildId = context.guildId;}
    if (context.channelId) {formatted.channelId = context.channelId;}
    if (context.commandName) {formatted.commandName = context.commandName;}
    if (context.category) {formatted.category = context.category;}
    if (context.duration !== undefined) {formatted.duration = context.duration;}
    if (context.statusCode) {formatted.statusCode = context.statusCode;}
    if (context.error) {
      formatted.error = {
        name: context.error.name,
        message: context.error.message,
        stack: context.error.stack,
      };
    }
    if (context.metadata) {formatted.metadata = context.metadata;}
    
    return formatted;
  }

  /**
   * Enhanced specialized logging methods
   */
  public command(commandName: string, userId: string, guildId?: string, duration?: number, error?: Error): void {
    const level = error ? 'error' : 'info';
    const message = error 
      ? `Command failed: ${commandName} - ${error.message}`
      : `Command executed: ${commandName}`;
    
    const context: LogContext = {
      category: LogCategory.COMMAND,
      commandName,
      userId,
      guildId,
      duration,
      error,
    };
    
    this[level](message, context);
  }

  public api(
    method: string,
    endpoint: string,
    statusCode: number,
    responseTime: number,
    userId?: string,
    error?: Error,
  ): void {
    const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'http';
    const message = `API ${method} ${endpoint} - ${statusCode} (${responseTime}ms)`;
    
    const context: LogContext = {
      category: LogCategory.API,
      statusCode,
      duration: responseTime,
      userId,
      error,
      metadata: { method, endpoint },
    };
    
    this[level](message, context);
  }

  public database(operation: string, table: string, duration: number, userId?: string, error?: Error): void {
    const level = error ? 'error' : duration > 1000 ? 'warn' : 'debug';
    const message = error 
      ? `Database ${operation} failed on ${table} - ${error.message}`
      : `Database ${operation} on ${table} (${duration}ms)`;
    
    const context: LogContext = {
      category: LogCategory.DATABASE,
      duration,
      userId,
      error,
      metadata: { operation, table },
    };
    
    this[level](message, context);
  }

  public cache(operation: string, key: string, hit: boolean, userId?: string): void {
    const message = `Cache ${operation} for ${key} - ${hit ? 'HIT' : 'MISS'}`;
    
    const context: LogContext = {
      category: LogCategory.CACHE,
      userId,
      metadata: { operation, key, hit },
    };
    
    this.debug(message, context);
  }

  public pubg(operation: string, playerId?: string, responseTime?: number, userId?: string, error?: Error): void {
    const level = error ? 'error' : responseTime && responseTime > 5000 ? 'warn' : 'info';
    const message = error 
      ? `PUBG API ${operation} failed - ${error.message}`
      : `PUBG API ${operation}${responseTime ? ` (${responseTime}ms)` : ''}`;
    
    const context: LogContext = {
      category: LogCategory.PUBG,
      duration: responseTime,
      userId,
      error,
      metadata: { operation, playerId },
    };
    
    this[level](message, context);
  }

  public music(operation: string, guildId: string, userId?: string, track?: string, error?: Error): void {
    const level = error ? 'error' : 'info';
    const message = error 
      ? `Music ${operation} failed - ${error.message}`
      : `Music ${operation}${track ? `: ${track}` : ''}`;
    
    const context: LogContext = {
      category: LogCategory.MUSIC,
      guildId,
      userId,
      error,
      metadata: { operation, track },
    };
    
    this[level](message, context);
  }

  public game(operation: string, gameType: string, userId: string, guildId?: string, error?: Error): void {
    const level = error ? 'error' : 'info';
    const message = error 
      ? `Game ${operation} failed: ${gameType} - ${error.message}`
      : `Game ${operation}: ${gameType}`;
    
    const context: LogContext = {
      category: LogCategory.GAME,
      userId,
      guildId,
      error,
      metadata: { operation, gameType },
    };
    
    this[level](message, context);
  }

  public badge(operation: string, badgeId: string, userId: string, guildId?: string, error?: Error): void {
    const level = error ? 'error' : 'info';
    const message = error 
      ? `Badge ${operation} failed: ${badgeId} - ${error.message}`
      : `Badge ${operation}: ${badgeId}`;
    
    const context: LogContext = {
      category: LogCategory.BADGE,
      userId,
      guildId,
      error,
      metadata: { operation, badgeId },
    };
    
    this[level](message, context);
  }

  public security(
    event: string,
    userId: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    guildId?: string,
    channelId?: string,
    metadata?: Record<string, any>,
  ): void {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    const message = `Security event: ${event} [${severity.toUpperCase()}]`;
    
    const context: LogContext = {
      category: LogCategory.SECURITY,
      userId,
      guildId,
      channelId,
      metadata: { event, severity, ...metadata },
    };
    
    this[level](message, context);
  }

  public performance(metric: string, value: number, unit: string, userId?: string, guildId?: string): void {
    const level = this.getPerformanceLevel(metric, value, unit);
    const message = `Performance: ${metric} = ${value}${unit}`;
    
    const context: LogContext = {
      category: LogCategory.PERFORMANCE,
      userId,
      guildId,
      metadata: { metric, value, unit },
    };
    
    this[level](message, context);
  }

  public ticket(operation: string, ticketId: string, userId?: string, guildId?: string, error?: Error): void {
    const level = error ? 'error' : 'info';
    const message = error 
      ? `Ticket ${operation} failed: ${ticketId} - ${error.message}`
      : `Ticket ${operation}: ${ticketId}`;
    
    const context: LogContext = {
      category: LogCategory.TICKET,
      userId,
      guildId,
      error,
      metadata: { operation, ticketId },
    };
    
    this[level](message, context);
  }

  public xp(operation: string, userId: string, guildId?: string, amount?: number, error?: Error): void {
    const level = error ? 'error' : 'info';
    const message = error 
      ? `XP ${operation} failed for user - ${error.message}`
      : `XP ${operation}: ${amount ? `${amount} XP` : 'processed'}`;
    
    const context: LogContext = {
      category: LogCategory.XP,
      userId,
      guildId,
      error,
      metadata: { operation, amount },
    };
    
    this[level](message, context);
  }

  public moderation(action: string, targetUserId: string, moderatorId: string, guildId?: string, reason?: string, error?: Error): void {
    const level = error ? 'error' : 'info';
    const message = error 
      ? `Moderation ${action} failed - ${error.message}`
      : `Moderation ${action}: ${reason || 'No reason provided'}`;
    
    const context: LogContext = {
      category: LogCategory.MODERATION,
      userId: targetUserId,
      guildId,
      error,
      metadata: { action, moderatorId, reason },
    };
    
    this[level](message, context);
  }

  public event(eventName: string, guildId?: string, userId?: string, metadata?: Record<string, any>, error?: Error): void {
    const level = error ? 'error' : 'info';
    const message = error 
      ? `Event ${eventName} failed - ${error.message}`
      : `Event: ${eventName}`;
    
    const context: LogContext = {
      category: LogCategory.EVENT,
      userId,
      guildId,
      error,
      metadata: { eventName, ...metadata },
    };
    
    this[level](message, context);
  }

  /**
   * Get appropriate log level based on performance metrics
   */
  private getPerformanceLevel(metric: string, value: number, unit: string): 'debug' | 'warn' | 'error' {
    // Define performance thresholds
    const thresholds: Record<string, { warn: number; error: number }> = {
      'response_time_ms': { warn: 1000, error: 5000 },
      'memory_usage_mb': { warn: 500, error: 1000 },
      'cpu_usage_percent': { warn: 80, error: 95 },
      'database_query_ms': { warn: 500, error: 2000 },
    };
    
    const threshold = thresholds[`${metric}_${unit}`];
    if (!threshold) {return 'debug';}
    
    if (value >= threshold.error) {return 'error';}
    if (value >= threshold.warn) {return 'warn';}
    return 'debug';
  }

  /**
   * Get logger instance
   */
  public getInstance(): winston.Logger {
    return this.logger;
  }

  /**
   * Set log level
   */
  public setLevel(level: LogLevel): void {
    this.config.level = level;
    this.logger.level = level;
  }

  /**
   * Get current log level
   */
  public getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Create child logger with additional metadata
   */
  public child(meta: any): winston.Logger {
    return this.logger.child(meta);
  }

  /**
   * Close logger and flush all transports
   */
  public close(): Promise<void> {
    return new Promise(resolve => {
      this.logger.end(() => {
        resolve();
      });
    });
  }
}
