import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { ExtendedClient } from '../types/client';
import { ServiceValidator } from './service-validator.util';
import { ErrorHandler } from './error-handler.util';
import { Logger } from './logger';

/**
 * Base class for Discord commands with standardized error handling and validation
 */
export abstract class BaseCommand {
  protected logger: Logger;
  public data: any;
  public category: any;
  public cooldown: number;

  constructor(config?: { data?: any; category?: any; cooldown?: number }) {
    this.logger = new Logger();
    if (config) {
      this.data = config.data;
      this.category = config.category;
      this.cooldown = config.cooldown || 0;
    }
  }

  /**
   * Execute command with standardized error handling and logging
   */
  protected async executeWithErrorHandling(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
    operation: () => Promise<void>,
    operationName: string
  ): Promise<void> {
    return ErrorHandler.executeWithLogging(
      async () => {
        // Validate basic requirements
        this.validateInteraction(interaction);
        this.validateClient(client);

        await operation();
      },
      this.logger,
      `${operationName} for user ${interaction.user.id}`,
      `Guild: ${interaction.guild?.id}, Command: ${interaction.commandName}`
    );
  }

  /**
   * Validate interaction requirements
   */
  protected validateInteraction(interaction: ChatInputCommandInteraction): void {
    ServiceValidator.validateObjectProperties(
      { interaction },
      ['interaction'],
      'interaction validation'
    );

    if (!interaction.isCommand()) {
      throw new Error('Invalid interaction type');
    }
  }

  /**
   * Validate client and services
   */
  protected validateClient(client: ExtendedClient): void {
    ServiceValidator.validateObjectProperties({ client }, ['client'], 'client validation');
  }

  /**
   * Validate required service availability
   */
  protected validateService<T>(service: T | undefined, serviceName: string): asserts service is T {
    if (!service) {
      throw new Error(`${serviceName} service is not available`);
    }
  }

  /**
   * Send service unavailable error message
   */
  protected async sendServiceUnavailableError(
    interaction: ChatInputCommandInteraction,
    serviceName: string
  ): Promise<void> {
    await interaction.reply({
      content: `❌ O serviço ${serviceName} está temporariamente indisponível. Tente novamente mais tarde.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  /**
   * Send permission error message
   */
  protected async sendPermissionError(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      content: '❌ Você não tem permissão para executar este comando.',
      flags: MessageFlags.Ephemeral,
    });
  }

  /**
   * Send guild only error message
   */
  protected async sendGuildOnlyError(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      content: '❌ Este comando só pode ser usado em servidores.',
      flags: MessageFlags.Ephemeral,
    });
  }

  /**
   * Validate guild context
   */
  protected validateGuildContext(interaction: ChatInputCommandInteraction): void {
    if (!interaction.guild) {
      throw new Error('Command requires guild context');
    }
  }

  /**
   * Validate user permissions
   */
  protected validateUserPermissions(
    interaction: ChatInputCommandInteraction,
    requiredPermissions: bigint[]
  ): void {
    if (!interaction.guild || !interaction.member) {
      throw new Error('Cannot validate permissions outside guild context');
    }

    // Convert bigint permissions to string array for validation
    const memberPermissions = interaction.member.permissions as any;
    const userPermissionStrings = requiredPermissions.map(perm => perm.toString());
    const memberPermissionStrings = memberPermissions ? [memberPermissions.toString()] : [];

    ServiceValidator.validatePermissions(
      memberPermissionStrings,
      userPermissionStrings,
      'Required permissions not met'
    );
  }

  /**
   * Safe reply to interaction (handles already replied scenarios)
   */
  protected async safeReply(interaction: ChatInputCommandInteraction, options: any): Promise<void> {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(options);
      } else {
        await interaction.reply(options);
      }
    } catch (error) {
      this.logger.error('Failed to reply to interaction:', error);
      // Try to send a follow-up if possible
      try {
        await interaction.followUp({
          content: '❌ Ocorreu um erro ao processar sua solicitação.',
          flags: MessageFlags.Ephemeral,
        });
      } catch (followUpError) {
        this.logger.error('Failed to send follow-up message:', followUpError);
      }
    }
  }

  /**
   * Defer reply with loading message
   */
  protected async deferWithLoading(
    interaction: ChatInputCommandInteraction,
    ephemeral: boolean = false
  ): Promise<void> {
    await interaction.deferReply({ ephemeral });
  }
}

/**
 * Command handler factory for creating standardized command handlers
 */
export class CommandHandlerFactory {
  /**
   * Create a command handler with error handling
   */
  static createHandler(
    handler: (interaction: ChatInputCommandInteraction, client: ExtendedClient) => Promise<void>
  ) {
    return async (interaction: ChatInputCommandInteraction, client: ExtendedClient) => {
      const logger = new Logger();

      try {
        await handler(interaction, client);
      } catch (error) {
        logger.error('Command execution failed:', {
          error: error instanceof Error ? error : new Error(String(error)),
        });

        // Send error message to user if not already replied
        try {
          const errorContent =
            '❌ Ocorreu um erro ao executar este comando. Tente novamente mais tarde.';

          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: errorContent });
          } else {
            await interaction.reply({ content: errorContent, ephemeral: true });
          }
        } catch (replyError) {
          logger.error('Failed to send error message to user:', replyError);
        }
      }
    };
  }

  /**
   * Create a subcommand router with error handling
   */
  static createSubcommandRouter(
    handlers: Record<
      string,
      (interaction: ChatInputCommandInteraction, client: ExtendedClient) => Promise<void>
    >
  ) {
    return CommandHandlerFactory.createHandler(async (interaction, client) => {
      const subcommand = interaction.options.getSubcommand();
      const handler = handlers[subcommand];

      if (!handler) {
        throw new Error(`Unknown subcommand: ${subcommand}`);
      }

      await handler(interaction, client);
    });
  }
}
