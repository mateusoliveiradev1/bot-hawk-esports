import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';
import { ExtendedClient } from '../types/client';

/**
 * Classe base abstrata para todos os serviços do bot
 * Reduz duplicação de código e padroniza inicialização
 */
export abstract class BaseService {
  protected logger: Logger;
  protected client: ExtendedClient;
  protected database?: DatabaseService;
  protected cache?: CacheService;
  protected serviceName: string;

  constructor(
    client: ExtendedClient,
    requiredServices: Array<keyof ExtendedClient> = ['database', 'cache'],
  ) {
    this.serviceName = this.constructor.name;
    this.validateDependencies(client, requiredServices);
    this.initializeCommonServices(client);
    this.logger.info(`✅ ${this.serviceName} initialized successfully`);
  }

  /**
   * Valida se todas as dependências necessárias estão disponíveis
   */
  private validateDependencies(
    client: ExtendedClient,
    required: Array<keyof ExtendedClient>,
  ): void {
    if (!client) {
      throw new Error('ExtendedClient is required');
    }

    const missing = required.filter(service => !client[service]);
    if (missing.length > 0) {
      throw new Error(`Missing required services for ${this.serviceName}: ${missing.join(', ')}`);
    }
  }

  /**
   * Inicializa serviços comuns
   */
  private initializeCommonServices(client: ExtendedClient): void {
    this.logger = new Logger();
    this.client = client;
    this.database = client.database;
    this.cache = client.cache;
  }

  /**
   * Executa operação com logging padronizado e tratamento de erro
   */
  protected async executeWithLogging<T>(
    operation: () => Promise<T>,
    operationName: string,
    errorMessage?: string,
  ): Promise<T> {
    try {
      const result = await operation();
      this.logger.info(`${this.serviceName}: ${operationName} completed successfully`);
      return result;
    } catch (error) {
      const message = errorMessage || `${operationName} failed`;
      this.logger.error(`${this.serviceName}: ${message}:`, error);
      throw error;
    }
  }

  /**
   * Valida se o serviço está saudável
   */
  public getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    serviceName: string;
    details: {
      databaseConnected: boolean;
      cacheConnected: boolean;
      clientConnected: boolean;
    };
  } {
    const databaseConnected = !!this.database;
    const cacheConnected = !!this.cache;
    const clientConnected = !!this.client;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!clientConnected) {
      status = 'unhealthy';
    } else if (!databaseConnected || !cacheConnected) {
      status = 'degraded';
    }

    return {
      status,
      serviceName: this.serviceName,
      details: {
        databaseConnected,
        cacheConnected,
        clientConnected,
      },
    };
  }

  /**
   * Limpa cache relacionado ao serviço
   */
  protected async clearServiceCache(pattern?: string): Promise<void> {
    if (!this.cache) {
      this.logger.warn(`${this.serviceName}: Cache service not available`);
      return;
    }

    try {
      const cachePattern = pattern || `${this.serviceName.toLowerCase()}:*`;
      await this.cache.clearPattern(cachePattern);
      this.logger.info(`${this.serviceName}: Cache cleared for pattern: ${cachePattern}`);
    } catch (error) {
      this.logger.error(`${this.serviceName}: Failed to clear cache:`, error);
    }
  }

  /**
   * Método abstrato que deve ser implementado por cada serviço
   * para inicialização específica
   */
  abstract initialize(): Promise<void>;

  /**
   * Método opcional para cleanup quando o serviço é destruído
   */
  public async cleanup(): Promise<void> {
    this.logger.info(`${this.serviceName}: Cleanup completed`);
  }
}

/**
 * Factory para criação de serviços com tratamento de erro padronizado
 */
export class ServiceFactory {
  private static logger = new Logger();

  static createService<T extends BaseService>(
    ServiceClass: new (client: ExtendedClient, ...args: any[]) => T,
    client: ExtendedClient,
    ...args: any[]
  ): T {
    try {
      return new ServiceClass(client, ...args);
    } catch (error) {
      this.logger.error(`Failed to create ${ServiceClass.name}:`, error);
      throw error;
    }
  }
}

/**
 * Container para gerenciamento de dependências de serviços
 */
export class ServiceContainer {
  private services: Map<string, any> = new Map();
  private logger = new Logger();

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
    this.logger.info(`Service registered: ${name}`);
  }

  get<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found in container`);
    }
    return service;
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  getAll(): Map<string, any> {
    return new Map(this.services);
  }

  clear(): void {
    this.services.clear();
    this.logger.info('Service container cleared');
  }
}
