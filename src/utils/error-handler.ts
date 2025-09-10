import { Logger, LogCategory } from './logger';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error categories for better classification
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NETWORK = 'network',
  DATABASE = 'database',
  EXTERNAL_API = 'external_api',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  CIRCUIT_BREAKER = 'circuit_breaker',
  CACHE = 'cache',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

/**
 * Enhanced error interface
 */
export interface EnhancedError extends Error {
  code?: string;
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  context?: Record<string, any>;
  retryable?: boolean;
  timestamp?: Date;
  correlationId?: string;
  userId?: string;
  operation?: string;
}

/**
 * Error handling configuration
 */
export interface ErrorHandlerConfig {
  enableStackTrace?: boolean;
  enableContextLogging?: boolean;
  enableMetrics?: boolean;
  maxContextSize?: number;
  sensitiveFields?: string[];
}

/**
 * Error metrics interface
 */
export interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  retryableErrors: number;
  nonRetryableErrors: number;
  averageErrorsPerHour: number;
  lastError?: {
    message: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    timestamp: Date;
  };
}

/**
 * Centralized error handler with enhanced features
 */
export class ErrorHandler {
  private readonly logger = new Logger();
  private readonly metrics = new Map<string, number>();
  private readonly errorHistory: EnhancedError[] = [];
  private readonly maxHistorySize = 1000;

  constructor(private readonly config: ErrorHandlerConfig = {}) {
    this.config = {
      enableStackTrace: true,
      enableContextLogging: true,
      enableMetrics: true,
      maxContextSize: 1000,
      sensitiveFields: ['password', 'token', 'apiKey', 'secret', 'authorization'],
      ...config,
    };
  }

  /**
   * Handle and log error with enhanced context
   */
  public handleError(error: Error | EnhancedError, context?: Record<string, any>): EnhancedError {
    const enhancedError = this.enhanceError(error, context);

    // Log the error
    this.logError(enhancedError);

    // Update metrics
    if (this.config.enableMetrics) {
      this.updateMetrics(enhancedError);
    }

    // Store in history
    this.addToHistory(enhancedError);

    return enhancedError;
  }

  /**
   * Create a standardized error
   */
  public createError(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: Record<string, any>,
  ): EnhancedError {
    const error = new Error(message) as EnhancedError;
    error.category = category;
    error.severity = severity;
    error.context = context;
    error.timestamp = new Date();
    error.retryable = this.isRetryableCategory(category);

    return this.handleError(error);
  }

  /**
   * Wrap async function with error handling
   */
  public wrapAsync<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    operation: string,
    category: ErrorCategory = ErrorCategory.BUSINESS_LOGIC,
  ) {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        const enhancedError = this.handleError(error as Error, {
          operation,
          arguments: this.sanitizeContext({ args }),
        });
        enhancedError.category = category;
        enhancedError.operation = operation;
        throw enhancedError;
      }
    };
  }

  /**
   * Wrap sync function with error handling
   */
  public wrapSync<T extends any[], R>(
    fn: (...args: T) => R,
    operation: string,
    category: ErrorCategory = ErrorCategory.BUSINESS_LOGIC,
  ) {
    return (...args: T): R => {
      try {
        return fn(...args);
      } catch (error) {
        const enhancedError = this.handleError(error as Error, {
          operation,
          arguments: this.sanitizeContext({ args }),
        });
        enhancedError.category = category;
        enhancedError.operation = operation;
        throw enhancedError;
      }
    };
  }

  /**
   * Check if error is retryable
   */
  public isRetryable(error: Error | EnhancedError): boolean {
    const enhancedError = error as EnhancedError;

    if (enhancedError.retryable !== undefined) {
      return enhancedError.retryable;
    }

    if (enhancedError.category) {
      return this.isRetryableCategory(enhancedError.category);
    }

    // Default heuristics
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /temporary/i,
      /rate.?limit/i,
      /503/,
      /502/,
      /504/,
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Get error metrics
   */
  public getMetrics(): ErrorMetrics {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentErrors = this.errorHistory.filter(
      error => error.timestamp && error.timestamp > oneHourAgo,
    );

    const errorsByCategory = Object.values(ErrorCategory).reduce(
      (acc, category) => {
        acc[category] = recentErrors.filter(error => error.category === category).length;
        return acc;
      },
      {} as Record<ErrorCategory, number>,
    );

    const errorsBySeverity = Object.values(ErrorSeverity).reduce(
      (acc, severity) => {
        acc[severity] = recentErrors.filter(error => error.severity === severity).length;
        return acc;
      },
      {} as Record<ErrorSeverity, number>,
    );

    const retryableErrors = recentErrors.filter(error => error.retryable).length;
    const nonRetryableErrors = recentErrors.length - retryableErrors;

    const lastError = this.errorHistory[this.errorHistory.length - 1];

    return {
      totalErrors: this.errorHistory.length,
      errorsByCategory,
      errorsBySeverity,
      retryableErrors,
      nonRetryableErrors,
      averageErrorsPerHour: recentErrors.length,
      lastError: lastError
        ? {
            message: lastError.message,
            category: lastError.category || ErrorCategory.UNKNOWN,
            severity: lastError.severity || ErrorSeverity.MEDIUM,
            timestamp: lastError.timestamp || new Date(),
          }
        : undefined,
    };
  }

  /**
   * Clear error history
   */
  public clearHistory(): void {
    this.errorHistory.length = 0;
    this.metrics.clear();
  }

  /**
   * Enhance error with additional context
   */
  private enhanceError(error: Error | EnhancedError, context?: Record<string, any>): EnhancedError {
    const enhancedError = error as EnhancedError;

    if (!enhancedError.timestamp) {
      enhancedError.timestamp = new Date();
    }

    if (!enhancedError.category) {
      enhancedError.category = this.categorizeError(error);
    }

    if (!enhancedError.severity) {
      enhancedError.severity = this.determineSeverity(error);
    }

    if (enhancedError.retryable === undefined) {
      enhancedError.retryable = this.isRetryableCategory(enhancedError.category);
    }

    if (context) {
      enhancedError.context = {
        ...enhancedError.context,
        ...this.sanitizeContext(context),
      };
    }

    return enhancedError;
  }

  /**
   * Categorize error based on message and properties
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return ErrorCategory.AUTHORIZATION;
    }
    if (message.includes('network') || message.includes('connection')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('database') || message.includes('sql')) {
      return ErrorCategory.DATABASE;
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorCategory.RATE_LIMIT;
    }
    if (message.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }
    if (message.includes('circuit breaker')) {
      return ErrorCategory.CIRCUIT_BREAKER;
    }
    if (message.includes('cache')) {
      return ErrorCategory.CACHE;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();

    if (message.includes('critical') || message.includes('fatal')) {
      return ErrorSeverity.CRITICAL;
    }
    if (message.includes('database') || message.includes('system')) {
      return ErrorSeverity.HIGH;
    }
    if (message.includes('validation') || message.includes('rate limit')) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM;
  }

  /**
   * Check if error category is retryable
   */
  private isRetryableCategory(category: ErrorCategory): boolean {
    const retryableCategories = [
      ErrorCategory.NETWORK,
      ErrorCategory.TIMEOUT,
      ErrorCategory.RATE_LIMIT,
      ErrorCategory.EXTERNAL_API,
      ErrorCategory.CIRCUIT_BREAKER,
    ];

    return retryableCategories.includes(category);
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: EnhancedError): void {
    const logData = {
      category: LogCategory.SYSTEM,
      error,
      metadata: {
        errorCategory: error.category,
        errorSeverity: error.severity,
        retryable: error.retryable,
        operation: error.operation,
        correlationId: error.correlationId,
        userId: error.userId,
        ...(this.config.enableContextLogging && error.context ? { context: error.context } : {}),
      },
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error(`CRITICAL ERROR: ${error.message}`, logData);
        break;
      case ErrorSeverity.HIGH:
        this.logger.error(`HIGH SEVERITY: ${error.message}`, logData);
        break;
      case ErrorSeverity.MEDIUM:
        this.logger.warn(`MEDIUM SEVERITY: ${error.message}`, logData);
        break;
      case ErrorSeverity.LOW:
        this.logger.info(`LOW SEVERITY: ${error.message}`, logData);
        break;
      default:
        this.logger.error(error.message, logData);
    }
  }

  /**
   * Update error metrics
   */
  private updateMetrics(error: EnhancedError): void {
    const category = error.category || ErrorCategory.UNKNOWN;
    const severity = error.severity || ErrorSeverity.MEDIUM;

    this.incrementMetric('total_errors');
    this.incrementMetric(`category_${category}`);
    this.incrementMetric(`severity_${severity}`);

    if (error.retryable) {
      this.incrementMetric('retryable_errors');
    } else {
      this.incrementMetric('non_retryable_errors');
    }
  }

  /**
   * Add error to history
   */
  private addToHistory(error: EnhancedError): void {
    this.errorHistory.push(error);

    // Keep history size manageable
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.splice(0, this.errorHistory.length - this.maxHistorySize);
    }
  }

  /**
   * Increment metric counter
   */
  private incrementMetric(key: string): void {
    this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
  }

  /**
   * Sanitize context to remove sensitive information
   */
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized = { ...context };

    const sanitizeValue = (obj: any, path: string[] = []): any => {
      if (obj === null || obj === undefined) {
        return obj;
      }

      if (typeof obj === 'object') {
        if (Array.isArray(obj)) {
          return obj.map((item, index) => sanitizeValue(item, [...path, index.toString()]));
        }

        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = [...path, key];
          const fullPath = currentPath.join('.');

          if (
            this.config.sensitiveFields?.some(field =>
              fullPath.toLowerCase().includes(field.toLowerCase()),
            )
          ) {
            result[key] = '[REDACTED]';
          } else {
            result[key] = sanitizeValue(value, currentPath);
          }
        }
        return result;
      }

      return obj;
    };

    const result = sanitizeValue(sanitized);

    // Limit context size
    const contextString = JSON.stringify(result);
    if (this.config.maxContextSize && contextString.length > this.config.maxContextSize) {
      return {
        ...result,
        _truncated: true,
        _originalSize: contextString.length,
      };
    }

    return result;
  }
}

/**
 * Global error handler instance
 */
export const globalErrorHandler = new ErrorHandler();

/**
 * Decorator for automatic error handling
 */
export function HandleErrors(
  category: ErrorCategory = ErrorCategory.BUSINESS_LOGIC,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await method.apply(this, args);
      } catch (error) {
        const enhancedError = globalErrorHandler.handleError(error as Error, {
          className: target.constructor.name,
          methodName: propertyName,
          arguments: args,
        });
        enhancedError.category = category;
        enhancedError.severity = severity;
        enhancedError.operation = `${target.constructor.name}.${propertyName}`;
        throw enhancedError;
      }
    };

    return descriptor;
  };
}

/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  /**
   * Check if error is of specific category
   */
  static isCategory(error: Error | EnhancedError, category: ErrorCategory): boolean {
    return (error as EnhancedError).category === category;
  }

  /**
   * Check if error is of specific severity
   */
  static isSeverity(error: Error | EnhancedError, severity: ErrorSeverity): boolean {
    return (error as EnhancedError).severity === severity;
  }

  /**
   * Extract error code from various error types
   */
  static getErrorCode(error: Error | EnhancedError): string | undefined {
    const enhancedError = error as EnhancedError;

    if (enhancedError.code) {
      return enhancedError.code;
    }

    // Try to extract from common error patterns
    const codeMatch = error.message.match(/code[:\s]+(\w+)/i);
    if (codeMatch) {
      return codeMatch[1];
    }

    return undefined;
  }

  /**
   * Create user-friendly error message
   */
  static getUserMessage(error: Error | EnhancedError): string {
    const enhancedError = error as EnhancedError;

    switch (enhancedError.category) {
      case ErrorCategory.VALIDATION:
        return 'Please check your input and try again.';
      case ErrorCategory.AUTHENTICATION:
        return 'Authentication failed. Please log in again.';
      case ErrorCategory.AUTHORIZATION:
        return 'You do not have permission to perform this action.';
      case ErrorCategory.RATE_LIMIT:
        return 'Too many requests. Please wait a moment and try again.';
      case ErrorCategory.NETWORK:
        return 'Network error. Please check your connection and try again.';
      case ErrorCategory.TIMEOUT:
        return 'The request timed out. Please try again.';
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  }
}
