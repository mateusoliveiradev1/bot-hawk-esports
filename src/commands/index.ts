import {
  Collection,
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
} from 'discord.js';
import { Command, ContextMenuCommand } from '../types/command';
import { ExtendedClient } from '../types/client';
import { Logger } from '../utils/logger';
import { DiscordRateLimiterService } from '../services/discord-rate-limiter.service';
import { CacheService } from '../services/cache.service';
import { AdvancedRateLimitService } from '../services/advanced-rate-limit.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Command Manager - Handles loading and managing bot commands
 */
export class CommandManager {
  private client: ExtendedClient;
  private logger: Logger;
  public commands: Collection<string, Command>;
  public contextMenus: Collection<string, ContextMenuCommand>;
  public aliases: Collection<string, string>;
  public cooldowns: Collection<string, Collection<string, number>>;
  private commandPaths: Map<string, string>; // Map command names to file paths
  private lazyLoadingEnabled: boolean;
  private discordRateLimiter: DiscordRateLimiterService;

  constructor(client?: ExtendedClient, lazyLoading: boolean = true) {
    this.client = client!;
    this.logger = new Logger();
    this.commands = new Collection();
    this.contextMenus = new Collection();
    this.aliases = new Collection();
    this.cooldowns = new Collection();
    this.commandPaths = new Map();
    this.lazyLoadingEnabled = lazyLoading;

    // Initialize Discord rate limiter
    const cacheService = new CacheService();
    const advancedRateLimit = new AdvancedRateLimitService(cacheService);
    this.discordRateLimiter = new DiscordRateLimiterService(cacheService, advancedRateLimit);
  }

  /**
   * Load all commands from directories (with lazy loading support)
   */
  public async loadCommands(): Promise<void> {
    try {
      const commandsPath = path.join(__dirname);
      this.logger.debug(
        `${this.lazyLoadingEnabled ? 'Indexing' : 'Loading'} commands from: ${commandsPath}`
      );

      const commandFolders = fs
        .readdirSync(commandsPath)
        .filter(folder => fs.statSync(path.join(commandsPath, folder)).isDirectory());

      this.logger.debug(`Found command folders: ${commandFolders.join(', ')}`);

      for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs
          .readdirSync(folderPath)
          .filter(
            file => (file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')
          );

        this.logger.debug(
          `Found ${commandFiles.length} command files in ${folder}: ${commandFiles.join(', ')}`
        );

        for (const file of commandFiles) {
          const filePath = path.join(folderPath, file);

          if (this.lazyLoadingEnabled) {
            // Index command without loading it
            await this.indexCommand(filePath);
          } else {
            // Load command immediately (legacy behavior)
            this.logger.debug(`Loading command from: ${filePath}`);
            const command = await this.loadCommand(filePath);

            if (command) {
              this.registerCommand(command);
              this.logger.debug(`Successfully loaded command: ${command.data.name}`);
            } else {
              this.logger.warn(`Failed to load command from: ${filePath}`);
            }
          }
        }
      }

      if (this.lazyLoadingEnabled) {
        this.logger.info(`Indexed ${this.commandPaths.size} commands for lazy loading`);
      } else {
        this.logger.info(
          `Loaded ${this.commands.size} slash commands and ${this.contextMenus.size} context menu commands`
        );
      }
    } catch (error) {
      this.logger.error('Error loading commands:', error);
    }
  }

  /**
   * Index a command file for lazy loading
   */
  private async indexCommand(filePath: string): Promise<void> {
    try {
      // Quick check to get command name without full loading
      const commandModule = require(filePath);
      const command = commandModule.default || commandModule;

      if (command && command.data && command.data.name) {
        this.commandPaths.set(command.data.name, filePath);

        // Also index aliases if they exist
        if (command.aliases) {
          for (const alias of command.aliases) {
            this.aliases.set(alias, command.data.name);
          }
        }

        this.logger.debug(`Indexed command: ${command.data.name}`);
      }

      // Clear from cache to avoid memory buildup during indexing
      delete require.cache[require.resolve(filePath)];
    } catch (error) {
      this.logger.warn(`Failed to index command ${filePath}:`, error);
    }
  }

  /**
   * Load a single command file
   */
  private async loadCommand(filePath: string): Promise<Command | ContextMenuCommand | null> {
    try {
      // Use require for CommonJS modules in compiled JavaScript
      delete require.cache[require.resolve(filePath)];
      const commandModule = require(filePath);
      const command = commandModule.default || commandModule;

      if (!command || typeof command !== 'object') {
        this.logger.warn(`Invalid command file: ${filePath}`);
        return null;
      }

      // Validate command structure
      if (!command.data || !command.execute) {
        this.logger.warn(`Command missing required properties: ${filePath}`);
        return null;
      }

      return command;
    } catch (error) {
      this.logger.error(`Error loading command ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Register a command
   */
  private registerCommand(command: Command | ContextMenuCommand): void {
    try {
      if ('type' in command.data && (command.data.type === 2 || command.data.type === 3)) {
        // Context menu command
        const contextCommand = command as ContextMenuCommand;
        this.contextMenus.set(contextCommand.data.name, contextCommand);
        this.logger.debug(`Registered context menu command: ${contextCommand.data.name}`);
      } else {
        // Slash command
        const slashCommand = command as Command;
        this.commands.set(slashCommand.data.name, slashCommand);

        // Register aliases if any
        if (slashCommand.aliases) {
          for (const alias of slashCommand.aliases) {
            this.aliases.set(alias, slashCommand.data.name);
          }
        }

        this.logger.debug(`Registered slash command: ${slashCommand.data.name}`);
      }
    } catch (error) {
      this.logger.error('Error registering command:', error);
    }
  }

  /**
   * Get command by name or alias (with lazy loading support)
   */
  public async getCommand(name: string): Promise<Command | null> {
    // Check if command is already loaded
    const existingCommand =
      this.commands.get(name) || this.commands.get(this.aliases.get(name) || '');
    if (existingCommand) {
      return existingCommand;
    }

    // If lazy loading is enabled, try to load the command on demand
    if (this.lazyLoadingEnabled) {
      const commandName = this.aliases.get(name) || name;
      const filePath = this.commandPaths.get(commandName);

      if (filePath) {
        this.logger.debug(`Lazy loading command: ${commandName}`);
        const command = await this.loadCommand(filePath);

        if (command) {
          this.registerCommand(command);
          this.logger.debug(`Successfully lazy loaded command: ${command.data.name}`);
          return command as Command;
        }
      }
    }

    return null;
  }

  /**
   * Get command by name or alias (synchronous - for backward compatibility)
   */
  public getCommandSync(name: string): Command | null {
    return this.commands.get(name) || this.commands.get(this.aliases.get(name) || '') || null;
  }

  /**
   * Get context menu command by name
   */
  public getContextMenu(name: string): ContextMenuCommand | null {
    return this.contextMenus.get(name) || null;
  }

  /**
   * Check if user is on cooldown
   */
  public isOnCooldown(
    commandName: string,
    userId: string
  ): { onCooldown: boolean; timeLeft?: number } {
    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Collection());
    }

    const now = Date.now();
    const timestamps = this.cooldowns.get(commandName)!;
    const command = this.commands.get(commandName);

    if (!command || !command.cooldown) {
      return { onCooldown: false };
    }

    const cooldownAmount = command.cooldown * 1000;

    if (timestamps.has(userId)) {
      const expirationTime = timestamps.get(userId)! + cooldownAmount;

      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        return { onCooldown: true, timeLeft };
      }
    }

    timestamps.set(userId, now);
    setTimeout(() => timestamps.delete(userId), cooldownAmount);

    return { onCooldown: false };
  }

  /**
   * Get all commands for a category
   */
  public getCommandsByCategory(category: string): Command[] {
    return this.commands.filter(command => command.category === category).map(cmd => cmd);
  }

  /**
   * Get command statistics
   */
  public getStats(): any {
    const categories = new Map<string, number>();

    this.commands.forEach(command => {
      const category = command.category || 'uncategorized';
      categories.set(category, (categories.get(category) || 0) + 1);
    });

    return {
      totalCommands: this.commands.size,
      contextMenus: this.contextMenus.size,
      aliases: this.aliases.size,
      categories: Object.fromEntries(categories),
      cooldowns: this.cooldowns.size,
    };
  }

  /**
   * Reload a specific command
   */
  public async reloadCommand(commandName: string): Promise<boolean> {
    try {
      const command = this.commands.get(commandName);
      if (!command) {
        return false;
      }

      // Remove from cache
      this.commands.delete(commandName);
      if (command.aliases) {
        for (const alias of command.aliases) {
          this.aliases.delete(alias);
        }
      }

      // Find and reload the command file
      const commandsPath = path.join(__dirname);
      const commandFolders = fs
        .readdirSync(commandsPath)
        .filter(folder => fs.statSync(path.join(commandsPath, folder)).isDirectory());

      for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs
          .readdirSync(folderPath)
          .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

        for (const file of commandFiles) {
          const filePath = path.join(folderPath, file);

          // Clear require cache
          delete require.cache[require.resolve(filePath)];

          const reloadedCommand = await this.loadCommand(filePath);
          if (reloadedCommand && reloadedCommand.data.name === commandName) {
            this.registerCommand(reloadedCommand);
            this.logger.info(`Reloaded command: ${commandName}`);
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`Error reloading command ${commandName}:`, error);
      return false;
    }
  }

  /**
   * Reload all commands
   */
  public async reloadAllCommands(): Promise<void> {
    this.commands.clear();
    this.contextMenus.clear();
    this.aliases.clear();
    this.cooldowns.clear();

    await this.loadCommands();
    this.logger.info('All commands reloaded');
  }

  /**
   * Handle slash command interactions
   */
  public async handleSlashCommand(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const command = await this.getCommand(interaction.commandName);
    if (!command) {
      return;
    }

    try {
      // Check advanced rate limiting first
      const rateLimitResult = await this.discordRateLimiter.checkRateLimit(
        interaction.user.id,
        interaction.guildId,
        command.data.name,
        command.category || 'general'
      );

      if (!rateLimitResult.allowed) {
        let message = '🚫 **Rate limit atingido!**\n';

        switch (rateLimitResult.action) {
          case 'timeout':
            message += `⏱️ Você está em timeout por ${rateLimitResult.timeLeft} segundos devido a violações de rate limit.`;
            break;
          case 'cooldown':
            message += `⏰ Aguarde ${rateLimitResult.timeLeft} segundos antes de usar comandos novamente.`;
            break;
          case 'warn':
            message +=
              '⚠️ Você está sendo monitorado por uso excessivo de comandos. Use com moderação.';
            break;
          case 'ban':
            message +=
              '🔨 Você foi banido temporariamente de usar comandos devido a violações graves.';
            break;
          default:
            message += `⏰ Aguarde ${rateLimitResult.timeLeft || 0} segundos antes de tentar novamente.`;
        }

        if (rateLimitResult.reason) {
          message += `\n\n**Motivo:** ${rateLimitResult.reason}`;
        }

        await interaction.reply({
          content: message,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Check basic cooldown (legacy system)
      const cooldownCheck = this.isOnCooldown(command.data.name, interaction.user.id);
      if (cooldownCheck.onCooldown) {
        await interaction.reply({
          content: `⏰ Você deve aguardar ${Math.ceil(cooldownCheck.timeLeft! / 1000)} segundos antes de usar este comando novamente.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await command.execute(interaction, client);
    } catch (error) {
      this.logger.error(`Error executing command ${command.data.name}:`, error);

      const errorMessage = 'Ocorreu um erro ao executar este comando!';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    }
  }

  /**
   * Handle context menu command interactions
   */
  public async handleContextCommand(
    interaction: ContextMenuCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const command = this.getContextMenu(interaction.commandName);
    if (!command) {
      return;
    }

    try {
      await command.execute(interaction as any, client);
    } catch (error) {
      this.logger.error(`Error executing context menu ${command.data.name}:`, error);

      const errorMessage = 'Ocorreu um erro ao executar este comando!';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    }
  }

  /**
   * Handle autocomplete interactions
   */
  public async handleAutocomplete(
    interaction: AutocompleteInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const command = await this.getCommand(interaction.commandName);
    if (!command || !command.autocomplete) {
      return;
    }

    try {
      await command.autocomplete(interaction, client);
    } catch (error) {
      this.logger.error(`Error handling autocomplete for ${command.data.name}:`, error);
    }
  }

  /**
   * Get user rate limit status
   */
  public getUserRateLimitStatus(userId: string): {
    commandCount: number;
    violations: number;
    penaltyMultiplier: number;
    timeoutUntil?: number;
    warningCount: number;
  } {
    return this.discordRateLimiter.getUserStatus(userId);
  }

  /**
   * Reset user rate limit data
   */
  public resetUserRateLimit(userId: string): void {
    this.discordRateLimiter.resetUser(userId);
  }

  /**
   * Get rate limit statistics
   */
  public getRateLimitStats(): {
    totalUsers: number;
    usersInTimeout: number;
    totalViolations: number;
    averagePenaltyMultiplier: number;
  } {
    return this.discordRateLimiter.getStats();
  }

  /**
   * Shutdown the command manager and cleanup resources
   */
  public shutdown(): void {
    this.discordRateLimiter.shutdown();
    this.logger.info('Command manager shut down');
  }
}
