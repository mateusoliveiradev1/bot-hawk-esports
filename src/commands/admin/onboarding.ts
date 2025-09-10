import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  CommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  TextChannel,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { BaseCommand, CommandHandlerFactory } from '../../utils/base-command.util';
import { ServiceValidator } from '../../utils/service-validator.util';

class OnboardingCommand extends BaseCommand {
  async handleSetup(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void> {
    this.validateGuildContext(interaction);
    this.validateUserPermissions(interaction, [PermissionFlagsBits.Administrator]);

    const channel = interaction.options.getChannel('canal', true) as TextChannel;
    const customMessage = interaction.options.getString('mensagem');

    ServiceValidator.validateObjectProperties({ channel }, ['channel'], 'onboarding setup');

    if (channel.type !== ChannelType.GuildText) {
      await this.safeReply(interaction, {
        content: '❌ O canal deve ser um canal de texto.',
        ephemeral: true,
      });
      return;
    }

    // Simulate database save operation
    const config = {
      guildId: interaction.guild!.id,
      welcomeChannelId: channel.id,
      welcomeMessage: customMessage || 'Bem-vindo(a) ao servidor, {user}! 🎉',
      enabled: true,
    };

    const embed = new EmbedBuilder()
      .setTitle('✅ Onboarding Configurado')
      .setDescription('Sistema de boas-vindas configurado com sucesso!')
      .addFields(
        { name: '📢 Canal', value: `<#${channel.id}>`, inline: true },
        { name: '💬 Mensagem', value: config.welcomeMessage, inline: false },
      )
      .setColor('#00FF00')
      .setTimestamp();

    await this.safeReply(interaction, { embeds: [embed] });
  }

  async handleToggle(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void> {
    this.validateGuildContext(interaction);
    this.validateUserPermissions(interaction, [PermissionFlagsBits.Administrator]);

    const enabled = interaction.options.getBoolean('ativo', true);

    // Simulate database update operation
    const status = enabled ? 'ativado' : 'desativado';
    const color = enabled ? '#00FF00' : '#FF6B6B';
    const emoji = enabled ? '✅' : '❌';

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} Sistema ${status.charAt(0).toUpperCase() + status.slice(1)}`)
      .setDescription(`O sistema de onboarding foi **${status}** com sucesso.`)
      .setColor(color)
      .setTimestamp();

    await this.safeReply(interaction, { embeds: [embed] });
  }

  async handleStats(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void> {
    this.validateGuildContext(interaction);

    await this.deferWithLoading(interaction);

    // Simulate stats retrieval
    const stats = {
      totalWelcomes: 156,
      thisMonth: 23,
      thisWeek: 8,
      averagePerDay: 1.2,
      enabled: true,
    };

    const embed = new EmbedBuilder()
      .setTitle('📊 Estatísticas de Boas-vindas')
      .addFields(
        {
          name: '👥 Total de Boas-vindas',
          value: stats.totalWelcomes.toLocaleString(),
          inline: true,
        },
        { name: '📅 Este Mês', value: stats.thisMonth.toString(), inline: true },
        { name: '📆 Esta Semana', value: stats.thisWeek.toString(), inline: true },
        { name: '📈 Média Diária', value: stats.averagePerDay.toFixed(1), inline: true },
        { name: '⚙️ Status', value: stats.enabled ? '✅ Ativo' : '❌ Inativo', inline: true },
      )
      .setColor('#4A90E2')
      .setTimestamp();

    await this.safeReply(interaction, { embeds: [embed] });
  }

  async handleTest(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void> {
    this.validateGuildContext(interaction);
    this.validateUserPermissions(interaction, [PermissionFlagsBits.Administrator]);

    const testMessage = `Bem-vindo(a) ao servidor, ${interaction.user}! 🎉\n\nEsta é uma mensagem de teste do sistema de onboarding.`;

    const embed = new EmbedBuilder()
      .setTitle('🧪 Teste de Boas-vindas')
      .setDescription(testMessage)
      .setColor('#FFD700')
      .setFooter({ text: 'Esta é uma mensagem de teste' })
      .setTimestamp();

    await this.safeReply(interaction, { embeds: [embed] });
  }
}

const commandInstance = new OnboardingCommand();

export const onboarding: Command = {
  data: new SlashCommandBuilder()
    .setName('onboarding')
    .setDescription('Configurar sistema de onboarding e boas-vindas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Configurar canal de boas-vindas e mensagens')
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('Canal para enviar mensagens de boas-vindas')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('mensagem')
            .setDescription(
              'Mensagem personalizada de boas-vindas (use {user} para mencionar o usuário)',
            )
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Ativar/desativar sistema de onboarding')
        .addBooleanOption(option =>
          option
            .setName('ativo')
            .setDescription('Ativar ou desativar o onboarding')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('stats').setDescription('Ver estatísticas de boas-vindas do servidor'),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('test').setDescription('Testar mensagem de boas-vindas'),
    ),

  category: CommandCategory.ADMIN,

  execute: CommandHandlerFactory.createSubcommandRouter({
    setup: (interaction, client) => commandInstance.handleSetup(interaction, client),
    toggle: (interaction, client) => commandInstance.handleToggle(interaction, client),
    stats: (interaction, client) => commandInstance.handleStats(interaction, client),
    test: (interaction, client) => commandInstance.handleTest(interaction, client),
  }),
};

export default onboarding;
