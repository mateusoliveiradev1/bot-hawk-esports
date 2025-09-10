import { ExtendedClient } from '../types/client';
import { SystemError, ErrorCodes } from './error-handler.util';
import { Logger } from './logger';

/**
 * Validador centralizado para serviços e dependências
 */
export class ServiceValidator {
  private static logger = new Logger();

  /**
   * Valida se todos os serviços necessários estão disponíveis no client
   */
  static validateRequiredServices(
    client: ExtendedClient,
    required: Array<keyof ExtendedClient>,
    serviceName?: string,
  ): void {
    if (!client) {
      throw new SystemError('ExtendedClient is required', ErrorCodes.VALIDATION_ERROR, {
        serviceName,
      });
    }

    const missing = required.filter(service => !client[service]);
    if (missing.length > 0) {
      const context = serviceName ? { serviceName, missing } : { missing };

      throw new SystemError(
        `Missing required services: ${missing.join(', ')}`,
        ErrorCodes.SERVICE_UNAVAILABLE,
        context,
      );
    }

    this.logger.info(
      `Service validation passed for ${serviceName || 'unknown service'}: ${required.join(', ')}`,
    );
  }

  /**
   * Valida se um serviço específico está disponível
   */
  static validateService<T>(
    client: ExtendedClient,
    serviceName: keyof ExtendedClient,
    context?: string,
  ): T {
    if (!client) {
      throw new SystemError('ExtendedClient is required', ErrorCodes.VALIDATION_ERROR, { context });
    }

    const service = client[serviceName] as T;
    if (!service) {
      throw new SystemError(
        `Service ${String(serviceName)} is not available`,
        ErrorCodes.SERVICE_UNAVAILABLE,
        { serviceName, context },
      );
    }

    return service;
  }

  /**
   * Valida parâmetros de entrada
   */
  static validateInput(
    value: any,
    fieldName: string,
    rules: ValidationRule[],
    context?: string,
  ): void {
    for (const rule of rules) {
      const isValid = rule.validator(value);
      if (!isValid) {
        throw new SystemError(rule.message || `Invalid ${fieldName}`, ErrorCodes.INVALID_INPUT, {
          fieldName,
          value,
          context,
        });
      }
    }
  }

  /**
   * Valida múltiplos campos de uma vez
   */
  static validateFields(
    data: Record<string, any>,
    validations: Record<string, ValidationRule[]>,
    context?: string,
  ): void {
    for (const [fieldName, rules] of Object.entries(validations)) {
      const value = data[fieldName];
      this.validateInput(value, fieldName, rules, context);
    }
  }

  /**
   * Valida se um usuário tem permissões necessárias
   */
  static validatePermissions(
    userPermissions: string[],
    requiredPermissions: string[],
    context?: string,
  ): void {
    const missing = requiredPermissions.filter(permission => !userPermissions.includes(permission));

    if (missing.length > 0) {
      throw new SystemError(
        `Missing permissions: ${missing.join(', ')}`,
        ErrorCodes.PERMISSION_ERROR,
        { missing, context },
      );
    }
  }

  /**
   * Valida se um ID do Discord é válido
   */
  static validateDiscordId(id: string, fieldName: string = 'id'): void {
    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(id)) {
      throw new SystemError(`Invalid Discord ${fieldName}: ${id}`, ErrorCodes.INVALID_INPUT, {
        fieldName,
        value: id,
      });
    }
  }

  /**
   * Valida se um valor está dentro de um range
   */
  static validateRange(value: number, min: number, max: number, fieldName: string = 'value'): void {
    if (value < min || value > max) {
      throw new SystemError(
        `${fieldName} must be between ${min} and ${max}`,
        ErrorCodes.INVALID_INPUT,
        { fieldName, value, min, max },
      );
    }
  }

  /**
   * Valida se um array não está vazio
   */
  static validateNonEmptyArray<T>(array: T[], fieldName: string = 'array'): void {
    if (!Array.isArray(array) || array.length === 0) {
      throw new SystemError(`${fieldName} cannot be empty`, ErrorCodes.INVALID_INPUT, {
        fieldName,
        value: array,
      });
    }
  }

  /**
   * Valida se uma string não está vazia
   */
  static validateNonEmptyString(value: string, fieldName: string = 'string'): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new SystemError(`${fieldName} cannot be empty`, ErrorCodes.INVALID_INPUT, {
        fieldName,
        value,
      });
    }
  }

  /**
   * Valida se um objeto tem as propriedades necessárias
   */
  static validateObjectProperties(
    obj: any,
    requiredProperties: string[],
    objectName: string = 'object',
  ): void {
    if (!obj || typeof obj !== 'object') {
      throw new SystemError(`${objectName} must be a valid object`, ErrorCodes.INVALID_INPUT, {
        objectName,
        value: obj,
      });
    }

    const missing = requiredProperties.filter(prop => !(prop in obj) || obj[prop] === undefined);

    if (missing.length > 0) {
      throw new SystemError(
        `${objectName} missing required properties: ${missing.join(', ')}`,
        ErrorCodes.INVALID_INPUT,
        { objectName, missing, value: obj },
      );
    }
  }
}

/**
 * Interface para regras de validação
 */
export interface ValidationRule {
  validator: (value: any) => boolean;
  message?: string;
}

/**
 * Regras de validação comuns
 */
export const CommonValidationRules = {
  required: {
    validator: (value: any) => value !== undefined && value !== null && value !== '',
    message: 'Field is required',
  },

  string: {
    validator: (value: any) => typeof value === 'string',
    message: 'Field must be a string',
  },

  number: {
    validator: (value: any) => typeof value === 'number' && !isNaN(value),
    message: 'Field must be a valid number',
  },

  positiveNumber: {
    validator: (value: any) => typeof value === 'number' && value > 0,
    message: 'Field must be a positive number',
  },

  integer: {
    validator: (value: any) => Number.isInteger(value),
    message: 'Field must be an integer',
  },

  boolean: {
    validator: (value: any) => typeof value === 'boolean',
    message: 'Field must be a boolean',
  },

  array: {
    validator: (value: any) => Array.isArray(value),
    message: 'Field must be an array',
  },

  nonEmptyArray: {
    validator: (value: any) => Array.isArray(value) && value.length > 0,
    message: 'Field must be a non-empty array',
  },

  discordId: {
    validator: (value: any) => typeof value === 'string' && /^\d{17,19}$/.test(value),
    message: 'Field must be a valid Discord ID',
  },

  email: {
    validator: (value: any) =>
      typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message: 'Field must be a valid email',
  },

  url: {
    validator: (value: any) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message: 'Field must be a valid URL',
  },

  minLength: (min: number) => ({
    validator: (value: any) => typeof value === 'string' && value.length >= min,
    message: `Field must be at least ${min} characters long`,
  }),

  maxLength: (max: number) => ({
    validator: (value: any) => typeof value === 'string' && value.length <= max,
    message: `Field must be at most ${max} characters long`,
  }),

  range: (min: number, max: number) => ({
    validator: (value: any) => typeof value === 'number' && value >= min && value <= max,
    message: `Field must be between ${min} and ${max}`,
  }),
};
