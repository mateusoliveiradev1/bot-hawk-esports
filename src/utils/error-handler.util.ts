import { Logger } from './logger';

/**
 * Utilitário para tratamento padronizado de erros
 */
export class ErrorHandler {
  private static logger = new Logger();

  /**
   * Executa operação com logging padronizado
   */
  static async executeWithLogging<T>(
    operation: () => Promise<T>,
    logger: Logger,
    operationName: string,
    context?: string,
  ): Promise<T> {
    try {
      const result = await operation();
      const message = context
        ? `${context}: ${operationName} completed successfully`
        : `${operationName} completed successfully`;
      logger.info(message);
      return result;
    } catch (error) {
      const message = context ? `${context}: ${operationName} failed` : `${operationName} failed`;
      logger.error(message, error);
      throw error;
    }
  }

  /**
   * Executa operação síncrona com logging
   */
  static executeSync<T>(
    operation: () => T,
    logger: Logger,
    operationName: string,
    context?: string,
  ): T {
    try {
      const result = operation();
      const message = context
        ? `${context}: ${operationName} completed successfully`
        : `${operationName} completed successfully`;
      logger.info(message);
      return result;
    } catch (error) {
      const message = context ? `${context}: ${operationName} failed` : `${operationName} failed`;
      logger.error(message, error);
      throw error;
    }
  }

  /**
   * Wrapper para operações que podem falhar silenciosamente
   */
  static async safeExecute<T>(
    operation: () => Promise<T>,
    logger: Logger,
    operationName: string,
    defaultValue?: T,
    context?: string,
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      const message = context
        ? `${context}: ${operationName} failed (safe execution)`
        : `${operationName} failed (safe execution)`;
      logger.warn(message, error);
      return defaultValue;
    }
  }

  /**
   * Cria erro padronizado com contexto
   */
  static createError(message: string, code?: string, context?: Record<string, any>): Error {
    const error = new Error(message) as any;
    if (code) {
      error.code = code;
    }
    if (context) {
      error.context = context;
    }
    return error;
  }

  /**
   * Verifica se erro é de um tipo específico
   */
  static isErrorType(error: any, type: string): boolean {
    return error?.code === type || error?.name === type;
  }

  /**
   * Extrai informações úteis do erro
   */
  static extractErrorInfo(error: any): {
    message: string;
    code?: string;
    stack?: string;
    context?: any;
  } {
    return {
      message: error?.message || 'Unknown error',
      code: error?.code,
      stack: error?.stack,
      context: error?.context,
    };
  }
}

/**
 * Decorator para métodos que precisam de tratamento de erro
 */
export function withErrorHandling(operationName: string, context?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const logger = this.logger || new Logger();

      try {
        const result = await originalMethod.apply(this, args);
        const message = context
          ? `${context}: ${operationName} completed successfully`
          : `${operationName} completed successfully`;
        logger.info(message);
        return result;
      } catch (error) {
        const message = context ? `${context}: ${operationName} failed` : `${operationName} failed`;
        logger.error(message, error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Tipos de erro comuns do sistema
 */
export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  API_ERROR = 'API_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_INPUT = 'INVALID_INPUT',
}

/**
 * Classe para erros customizados do sistema
 */
export class SystemError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string = ErrorCodes.VALIDATION_ERROR,
    context?: Record<string, any>,
  ) {
    super(message);
    this.name = 'SystemError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}
