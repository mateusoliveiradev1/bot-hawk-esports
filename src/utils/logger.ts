import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Logger levels
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly'
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
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.prettyPrint()
      )
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
   * Create Winston logger instance
   */
  private createLogger(): void {
    const transports: winston.transport[] = [];

    // Console transport
    transports.push(
      new winston.transports.Console({
        level: this.config.level,
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({
            format: 'HH:mm:ss'
          }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            let log = `${timestamp} [${level}]: ${message}`;
            
            if (Object.keys(meta).length > 0) {
              log += ` ${JSON.stringify(meta, null, 2)}`;
            }
            
            return log;
          })
        )
      })
    );

    // File transport
    transports.push(
      new winston.transports.File({
        filename: this.config.file,
        level: this.config.level,
        format: this.config.format,
        maxsize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        tailable: true
      })
    );

    // Error file transport
    transports.push(
      new winston.transports.File({
        filename: this.config.file.replace('.log', '.error.log'),
        level: LogLevel.ERROR,
        format: this.config.format,
        maxsize: this.config.maxSize,
        maxFiles: this.config.maxFiles,
        tailable: true
      })
    );

    this.logger = winston.createLogger({
      level: this.config.level,
      format: this.config.format,
      transports,
      exitOnError: false
    });
  }

  /**
   * Log error message
   */
  public error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  /**
   * Log warning message
   */
  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  /**
   * Log info message
   */
  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  /**
   * Log HTTP message
   */
  public http(message: string, meta?: any): void {
    this.logger.http(message, meta);
  }

  /**
   * Log verbose message
   */
  public verbose(message: string, meta?: any): void {
    this.logger.verbose(message, meta);
  }

  /**
   * Log debug message
   */
  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  /**
   * Log silly message
   */
  public silly(message: string, meta?: any): void {
    this.logger.silly(message, meta);
  }

  /**
   * Log command usage
   */
  public command(commandName: string, userId: string, guildId?: string, meta?: any): void {
    this.info(`Command executed: ${commandName}`, {
      userId,
      guildId,
      type: 'command',
      ...meta
    });
  }

  /**
   * Log API request
   */
  public api(method: string, endpoint: string, statusCode: number, responseTime: number, meta?: any): void {
    this.http(`API ${method} ${endpoint} - ${statusCode}`, {
      method,
      endpoint,
      statusCode,
      responseTime,
      type: 'api',
      ...meta
    });
  }

  /**
   * Log database operation
   */
  public database(operation: string, table: string, duration: number, meta?: any): void {
    this.debug(`Database ${operation} on ${table}`, {
      operation,
      table,
      duration,
      type: 'database',
      ...meta
    });
  }

  /**
   * Log cache operation
   */
  public cache(operation: string, key: string, hit: boolean, meta?: any): void {
    this.debug(`Cache ${operation} for ${key}`, {
      operation,
      key,
      hit,
      type: 'cache',
      ...meta
    });
  }

  /**
   * Log PUBG API operation
   */
  public pubg(operation: string, playerId?: string, responseTime?: number, meta?: any): void {
    this.info(`PUBG API ${operation}`, {
      operation,
      playerId,
      responseTime,
      type: 'pubg',
      ...meta
    });
  }

  /**
   * Log music operation
   */
  public music(operation: string, guildId: string, track?: string, meta?: any): void {
    this.info(`Music ${operation}`, {
      operation,
      guildId,
      track,
      type: 'music',
      ...meta
    });
  }

  /**
   * Log game operation
   */
  public game(operation: string, gameType: string, userId: string, meta?: any): void {
    this.info(`Game ${operation}: ${gameType}`, {
      operation,
      gameType,
      userId,
      type: 'game',
      ...meta
    });
  }

  /**
   * Log badge operation
   */
  public badge(operation: string, badgeId: string, userId: string, meta?: any): void {
    this.info(`Badge ${operation}: ${badgeId}`, {
      operation,
      badgeId,
      userId,
      type: 'badge',
      ...meta
    });
  }

  /**
   * Log security event
   */
  public security(event: string, userId: string, severity: 'low' | 'medium' | 'high' | 'critical', meta?: any): void {
    const logMethod = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    this[logMethod](`Security event: ${event}`, {
      event,
      userId,
      severity,
      type: 'security',
      ...meta
    });
  }

  /**
   * Log performance metrics
   */
  public performance(metric: string, value: number, unit: string, meta?: any): void {
    this.debug(`Performance: ${metric} = ${value}${unit}`, {
      metric,
      value,
      unit,
      type: 'performance',
      ...meta
    });
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
    return new Promise((resolve) => {
      this.logger.end(() => {
        resolve();
      });
    });
  }
}