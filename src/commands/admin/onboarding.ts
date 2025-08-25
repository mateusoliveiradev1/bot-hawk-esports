import { SlashCommandBuilder, ChatInputCommandInteraction, CommandInteraction, PermissionFlagsBits, EmbedBuilder, ChannelType, TextChannel } from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';

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
            .setDescription('Mensagem personalizada de boas-vindas (use {user} para mencionar o usuário)')
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
      subcommand
        .setName('stats')
        .setDescription('Ver estatísticas de boas-vindas do servidor'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Testar mensagem de boas-vindas'),
    ),

  category: CommandCategory.ADMIN,

  async execute(interaction: ChatInputCommandInteraction | CommandInteraction, client: ExtendedClient) {
    if (!interaction.guild) {
      await interaction.reply({
        content: '❌ Este comando só pode ser usado em servidores!',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.isChatInputCommand()) {
      await interaction.reply({
        content: '❌ Este comando só funciona como slash command!',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
      case 'setup':
        await handleSetup(interaction, client);
        break;
      case 'toggle':
        await handleToggle(interaction, client);
        break;
      case 'stats':
        await handleStats(interaction, client);
        break;
      case 'test':
        await handleTest(interaction, client);
        break;
      default:
        await interaction.reply({
          content: '❌ Subcomando não reconhecido!',
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error('Error in onboarding command:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao executar o comando!',
        ephemeral: true,
      });
    }
  },
};

async function handleSetup(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
  const channel = interaction.options.getChannel('canal') as TextChannel;
  const customMessage = interaction.options.getString('mensagem');

  if (!client.db) {
    await interaction.reply({
      content: '❌ Banco de dados não disponível!',
      ephemeral: true,
    });
    return;
  }

  // Update guild configuration
  await client.db.client.guild.upsert({
    where: { id: interaction.guild!.id },
    update: {
      welcomeChannelId: channel.id,
      welcomeMessage: customMessage || undefined,
    },
    create: {
      id: interaction.guild!.id,
      name: interaction.guild!.name,
      icon: interaction.guild!.iconURL(),
      ownerId: interaction.guild!.ownerId,
      welcomeChannelId: channel.id,
      welcomeMessage: customMessage || undefined,
    },
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ Onboarding Configurado')
    .setDescription('Sistema de boas-vindas configurado com sucesso!')
    .addFields(
      { name: '📢 Canal', value: `${channel}`, inline: true },
      { name: '💬 Mensagem', value: customMessage || 'Mensagem padrão', inline: true },
    )
    .setColor(0x00ff00)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleToggle(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
  const enabled = interaction.options.getBoolean('ativo')!;

  if (!client.db) {
    await interaction.reply({
      content: '❌ Banco de dados não disponível!',
      ephemeral: true,
    });
    return;
  }

  // Update guild configuration
  await client.db.client.guild.upsert({
    where: { id: interaction.guild!.id },
    update: {
      onboardingEnabled: enabled,
    },
    create: {
      id: interaction.guild!.id,
      name: interaction.guild!.name,
      icon: interaction.guild!.iconURL(),
      ownerId: interaction.guild!.ownerId,
      onboardingEnabled: enabled,
    },
  });

  const embed = new EmbedBuilder()
    .setTitle(enabled ? '✅ Onboarding Ativado' : '❌ Onboarding Desativado')
    .setDescription(`Sistema de onboarding foi ${enabled ? 'ativado' : 'desativado'} com sucesso!`)
    .setColor(enabled ? 0x00ff00 : 0xff0000)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleStats(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
  if (!client.services?.onboarding) {
    await interaction.reply({
      content: '❌ Serviço de onboarding não disponível!',
      ephemeral: true,
    });
    return;
  }

  const stats = await client.services.onboarding.getWelcomeStats(interaction.guild!.id);
  const config = await client.services.onboarding.getGuildConfig(interaction.guild!.id);

  const embed = new EmbedBuilder()
    .setTitle('📊 Estatísticas de Onboarding')
    .setDescription(`Estatísticas do servidor **${interaction.guild!.name}**`)
    .addFields(
      { name: '👥 Total de Membros', value: stats.totalMembers.toString(), inline: true },
      { name: '✅ Membros Verificados', value: stats.verifiedMembers.toString(), inline: true },
      { name: '👋 Novos Membros', value: stats.newMembers.toString(), inline: true },
      { name: '📈 Taxa de Verificação', value: `${stats.verificationRate.toFixed(1)}%`, inline: true },
      { name: '🔧 Status do Sistema', value: config.onboardingEnabled ? '✅ Ativo' : '❌ Inativo', inline: true },
      { name: '📢 Canal de Boas-vindas', value: config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : 'Não configurado', inline: true },
    )
    .setColor(0x0099ff)
    .setTimestamp()
    .setFooter({ text: `Servidor: ${interaction.guild!.name}` });

  await interaction.reply({ embeds: [embed] });
}

async function handleTest(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
  if (!client.services?.onboarding) {
    await interaction.reply({
      content: '❌ Serviço de onboarding não disponível!',
      ephemeral: true,
    });
    return;
  }

  const config = await client.services.onboarding.getGuildConfig(interaction.guild!.id);
  
  if (!config.welcomeChannelId) {
    await interaction.reply({
      content: '❌ Canal de boas-vindas não configurado! Use `/onboarding setup` primeiro.',
      ephemeral: true,
    });
    return;
  }

  const welcomeChannel = interaction.guild!.channels.cache.get(config.welcomeChannelId) as TextChannel;
  
  if (!welcomeChannel) {
    await interaction.reply({
      content: '❌ Canal de boas-vindas não encontrado!',
      ephemeral: true,
    });
    return;
  }

  // Create test welcome message
  const welcomeMessage = config.welcomeMessage || 
    '🎉 Bem-vindo(a) ao **{guild}**, {user}!\n\n' +
    '📋 Para ter acesso completo ao servidor, você precisa se registrar com seu nick do PUBG.\n' +
    '🎮 Use o comando `/register` para começar!\n\n' +
    '📖 Leia as regras e divirta-se! 🚀';

  const formattedMessage = welcomeMessage
    .replace(/{user}/g, interaction.user.toString())
    .replace(/{guild}/g, interaction.guild!.name);

  const embed = new EmbedBuilder()
    .setTitle('🎉 Mensagem de Teste - Boas-vindas')
    .setDescription(formattedMessage)
    .setColor(0x00ff00)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setTimestamp()
    .setFooter({ text: 'Esta é uma mensagem de teste' });

  await welcomeChannel.send({ embeds: [embed] });
  
  await interaction.reply({
    content: `✅ Mensagem de teste enviada em ${welcomeChannel}!`,
    ephemeral: true,
  });
}