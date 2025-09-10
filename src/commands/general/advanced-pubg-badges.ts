import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { AdvancedPUBGBadgesService } from '../../services/advanced-pubg-badges.service';
import { DatabaseService } from '../../database/database.service';
import { BaseCommand, CommandHandlerFactory } from '../../utils/base-command.util';
import { ServiceValidator } from '../../utils/service-validator.util';
import { ErrorHandler } from '../../utils/error-handler.util';

class AdvancedBadgesCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('advanced-badges')
        .setDescription('Gerenciar badges avançadas do PUBG')
        .addSubcommand(subcommand =>
          subcommand
            .setName('progress')
            .setDescription('Ver seu progresso em badges avançadas')
            .addUserOption(option =>
              option
                .setName('user')
                .setDescription('Usuário para verificar (opcional)')
                .setRequired(false)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('streaks')
            .setDescription('Ver suas sequências atuais')
            .addUserOption(option =>
              option
                .setName('user')
                .setDescription('Usuário para verificar (opcional)')
                .setRequired(false)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('consistency')
            .setDescription('Ver estatísticas de consistência')
            .addUserOption(option =>
              option
                .setName('user')
                .setDescription('Usuário para verificar (opcional)')
                .setRequired(false)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('weapons')
            .setDescription('Ver progresso de maestria de armas')
            .addUserOption(option =>
              option
                .setName('user')
                .setDescription('Usuário para verificar (opcional)')
                .setRequired(false)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('leaderboard')
            .setDescription('Ver ranking de badges avançadas')
            .addStringOption(option =>
              option
                .setName('type')
                .setDescription('Tipo de ranking')
                .setRequired(true)
                .addChoices(
                  { name: 'Sequências de Vitórias', value: 'win_streaks' },
                  { name: 'Consistência Top 10', value: 'consistency' },
                  { name: 'Maestria de Armas', value: 'weapon_mastery' },
                  { name: 'Badges Avançadas', value: 'advanced_badges' }
                )
            )
        ) as SlashCommandBuilder,
      category: CommandCategory.GENERAL,
      cooldown: 10,
    });
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'progress':
        await this.handleProgress(interaction, client);
        break;
      case 'streaks':
        await this.handleStreaks(interaction, client);
        break;
      case 'consistency':
        await this.handleConsistency(interaction, client);
        break;
      case 'weapons':
        await this.handleWeapons(interaction, client);
        break;
      case 'leaderboard':
        await this.handleLeaderboard(interaction, client);
        break;
      default:
        await interaction.reply({ content: 'Subcomando não reconhecido.', ephemeral: true });
    }
  }

  async handleProgress(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const advancedService = (client as any).advancedPUBGBadgesService as AdvancedPUBGBadgesService;

    this.validateService(advancedService, 'Serviço de badges avançadas');

    await this.executeWithErrorHandling(
      interaction,
      client,
      async () => {
        await this.deferWithLoading(interaction);
        const progress = await advancedService.getUserAdvancedProgress(targetUser.id);
        // TODO: Create embed and reply with progress data
        await this.safeReply(interaction, {
          content: `Progresso de badges avançadas para ${targetUser.displayName} carregado com sucesso!`,
        });
      },
      'handleProgress'
    );
  }

  async handleStreaks(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const advancedService = (client as any).advancedPUBGBadgesService as AdvancedPUBGBadgesService;

    this.validateService(advancedService, 'Serviço de badges avançadas');

    await this.executeWithErrorHandling(
      interaction,
      client,
      async () => {
        await this.deferWithLoading(interaction);
        const progress = await advancedService.getUserAdvancedProgress(targetUser.id);
        // TODO: Create embed and reply with streaks data
        await this.safeReply(interaction, {
          content: `Sequências de ${targetUser.displayName} carregadas com sucesso!`,
        });
      },
      'handleStreaks'
    );
  }

  async handleConsistency(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const advancedService = (client as any).advancedPUBGBadgesService as AdvancedPUBGBadgesService;

    this.validateService(advancedService, 'Serviço de badges avançadas');

    await this.executeWithErrorHandling(
      interaction,
      client,
      async () => {
        await this.deferWithLoading(interaction);
        const progress = await advancedService.getUserAdvancedProgress(targetUser.id);
        // TODO: Create embed and reply with consistency data
        await this.safeReply(interaction, {
          content: `Estatísticas de consistência de ${targetUser.displayName} carregadas com sucesso!`,
        });
      },
      'handleConsistency'
    );
  }

  async handleWeapons(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const advancedService = (client as any).advancedPUBGBadgesService as AdvancedPUBGBadgesService;

    this.validateService(advancedService, 'Serviço de badges avançadas');

    await this.executeWithErrorHandling(
      interaction,
      client,
      async () => {
        await this.deferWithLoading(interaction);
        const progress = await advancedService.getUserAdvancedProgress(targetUser.id);
        // TODO: Create embed and reply with weapon mastery data
        await this.safeReply(interaction, {
          content: `Maestria de armas de ${targetUser.displayName} carregada com sucesso!`,
        });
      },
      'handleWeapons'
    );
  }

  async handleLeaderboard(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const type = interaction.options.getString('type', true);
    const advancedService = (client as any).advancedPUBGBadgesService as AdvancedPUBGBadgesService;
    const database = client.database as DatabaseService;

    this.validateService(advancedService, 'Serviço de badges avançadas');
    this.validateService(database, 'Serviço de banco de dados');

    await this.executeWithErrorHandling(
      interaction,
      client,
      async () => {
        await this.deferWithLoading(interaction);
        // TODO: Create leaderboard logic based on type
        await this.safeReply(interaction, {
          content: `Ranking de ${type} carregado com sucesso!`,
        });
      },
      'handleLeaderboard'
    );
  }
}

const commandInstance = new AdvancedBadgesCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.GENERAL,
  cooldown: 10,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;
