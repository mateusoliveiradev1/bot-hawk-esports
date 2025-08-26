import { REST, Routes } from 'discord.js';
import { Logger } from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { Command, ContextMenuCommand } from './types/command';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = new Logger();

/**
 * Deploy commands to Discord API
 */
export class CommandDeployer {
  private rest: REST;
  private clientId: string;

  constructor(token: string, clientId: string) {
    this.rest = new REST({ version: '10' }).setToken(token);
    this.clientId = clientId;
  }

  /**
   * Load all commands from the commands directory
   */
  private async loadAllCommands(): Promise<any[]> {
    const commands: any[] = [];
    const commandsPath = path.join(__dirname, 'commands');
    
    logger.info(`Loading commands from: ${commandsPath}`);
    
    try {
      if (!fs.existsSync(commandsPath)) {
        logger.error(`Commands directory does not exist: ${commandsPath}`);
        return commands;
      }
      
      const commandFolders = fs.readdirSync(commandsPath).filter(folder => 
        fs.statSync(path.join(commandsPath, folder)).isDirectory()
      );
      
      logger.info(`Found ${commandFolders.length} command folders: ${commandFolders.join(', ')}`);

      for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs.readdirSync(folderPath).filter(file => 
          (file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')
        );
        
        logger.info(`Found ${commandFiles.length} command files in ${folder}: ${commandFiles.join(', ')}`);

        for (const file of commandFiles) {
          const filePath = path.join(folderPath, file);
          
          try {
            logger.debug(`Loading command from: ${filePath}`);
            // Convert Windows path to file:// URL for ESM import
            const fileUrl = process.platform === 'win32' 
              ? `file:///${filePath.replace(/\\/g, '/')}` 
              : filePath;
            const commandModule = await import(fileUrl);
            
            // Try different export patterns
            let command: Command | ContextMenuCommand | null = null;
            
            // First try default export
            if (commandModule.default && commandModule.default.data && commandModule.default.execute) {
              command = commandModule.default;
            } else if (commandModule.default) {
              // Sometimes default export might be wrapped
              command = commandModule.default;
            } else {
              // Try to find the command in named exports
              const exportKeys = Object.keys(commandModule);
              for (const key of exportKeys) {
                const exportedItem = commandModule[key];
                if (exportedItem && exportedItem.data && exportedItem.execute) {
                  command = exportedItem;
                  break;
                }
              }
            }
            
            if (command && command.data) {
              commands.push(command.data.toJSON());
              logger.info(`✅ Loaded command: ${command.data.name}`);
            } else {
              logger.warn(`⚠️ No valid command found in ${file}`);
            }
          } catch (error) {
            logger.error(`❌ Failed to load command from ${file}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load commands:', error);
      throw error;
    }
    
    logger.info(`Total commands loaded: ${commands.length}`);
    return commands;
  }

  /**
   * Deploy commands globally
   */
  public async deployGlobal(): Promise<void> {
    try {
      logger.info('Started refreshing application (/) commands globally.');
      
      const commands = await this.loadAllCommands();
      
      const data = await this.rest.put(
        Routes.applicationCommands(this.clientId),
        { body: commands },
      ) as any[];

      logger.info(`Successfully reloaded ${data.length} application (/) commands globally.`);
    } catch (error) {
      logger.error('Failed to deploy global commands:', error);
      throw error;
    }
  }

  /**
   * Deploy commands to a specific guild (faster for development)
   */
  public async deployGuild(guildId: string): Promise<void> {
    try {
      logger.info(`Started refreshing application (/) commands for guild ${guildId}.`);
      
      const commands = await this.loadAllCommands();
      
      const data = await this.rest.put(
        Routes.applicationGuildCommands(this.clientId, guildId),
        { body: commands },
      ) as any[];

      logger.info(`Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`);
    } catch (error) {
      logger.error(`Failed to deploy guild commands for ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Clear all global commands
   */
  public async clearGlobal(): Promise<void> {
    try {
      logger.info('Clearing all global application (/) commands.');
      
      await this.rest.put(
        Routes.applicationCommands(this.clientId),
        { body: [] },
      );

      logger.info('Successfully cleared all global application (/) commands.');
    } catch (error) {
      logger.error('Failed to clear global commands:', error);
      throw error;
    }
  }

  /**
   * Clear all guild commands
   */
  public async clearGuild(guildId: string): Promise<void> {
    try {
      logger.info(`Clearing all application (/) commands for guild ${guildId}.`);
      
      await this.rest.put(
        Routes.applicationGuildCommands(this.clientId, guildId),
        { body: [] },
      );

      logger.info(`Successfully cleared all application (/) commands for guild ${guildId}.`);
    } catch (error) {
      logger.error(`Failed to clear guild commands for ${guildId}:`, error);
      throw error;
    }
  }
}

/**
 * Standalone script to deploy commands
 */
if (require.main === module) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    logger.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variables');
    process.exit(1);
  }

  const deployer = new CommandDeployer(token, clientId);

  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    try {
      switch (command) {
        case 'global':
          await deployer.deployGlobal();
          break;
        case 'guild':
          if (!guildId) {
            logger.error('Missing DISCORD_GUILD_ID environment variable for guild deployment');
            process.exit(1);
          }
          await deployer.deployGuild(guildId);
          break;
        case 'clear-global':
          await deployer.clearGlobal();
          break;
        case 'clear-guild':
          if (!guildId) {
            logger.error('Missing DISCORD_GUILD_ID environment variable for guild clearing');
            process.exit(1);
          }
          await deployer.clearGuild(guildId);
          break;
        default:
          logger.info('Usage: npm run deploy-commands <global|guild|clear-global|clear-guild>');
          logger.info('Available commands:');
          logger.info('  global       - Deploy commands globally (slower, affects all servers)');
          logger.info('  guild        - Deploy commands to specific guild (faster, for development)');
          logger.info('  clear-global - Clear all global commands');
          logger.info('  clear-guild  - Clear all guild commands');
          break;
      }
    } catch (error) {
      logger.error('Command deployment failed:', error);
      process.exit(1);
    }
  })();
}