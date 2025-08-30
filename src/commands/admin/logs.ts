import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
} from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';

/**
 * Logs command - Configure automatic logging system
 */
const logs: Command = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('🗂️ Configurar sistema de logs automático')
    .addSubcommand(subcommand =>
      subcommand
        .setName('config')
        .setDescription('Configurar canais de log')
        .addChannelOption(option =>
          option
            .setName('moderacao')
            .setDescription('Canal para logs de moderação')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName('mensagens')
            .setDescription('Canal para logs de mensagens')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName('membros')
            .setDescription('Canal para logs de membros')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName('voz')
            .setDescription('Canal para logs de voz')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName('servidor')
            .setDescription('Canal para logs gerais do servidor')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName('changelog')
            .setDescription('Canal para changelog do bot')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('eventos')
        .setDescription('Configurar quais eventos devem ser logados')
        .addBooleanOption(option =>
          option
            .setName('mensagens_deletadas')
            .setDescription('Logar mensagens deletadas')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('mensagens_editadas')
            .setDescription('Logar mensagens editadas')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('entrada_membros')
            .setDescription('Logar entrada de membros')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('saida_membros')
            .setDescription('Logar saída de membros')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('atualizacao_membros')
            .setDescription('Logar atualizações de membros')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('acoes_moderacao')
            .setDescription('Logar ações de moderação')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('eventos_voz')
            .setDescription('Logar eventos de canais de voz')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('filtros')
        .setDescription('Configurar filtros de logs')
        .addBooleanOption(option =>
          option.setName('ignorar_bots').setDescription('Ignorar ações de bots').setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('status').setDescription('Ver status atual do sistema de logs')
    )
    .addSubcommand(subcommand =>
      subcommand.setName('teste').setDescription('Enviar mensagem de teste para os canais de log')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('changelog')
        .setDescription('Adicionar entrada ao changelog')
        .addStringOption(option =>
          option
            .setName('tipo')
            .setDescription('Tipo da mudança')
            .setRequired(true)
            .addChoices(
              { name: '✨ Nova Funcionalidade', value: 'feature' },
              { name: '🐛 Correção de Bug', value: 'bugfix' },
              { name: '⚡ Melhoria', value: 'improvement' },
              { name: '💥 Mudança Importante', value: 'breaking' }
            )
        )
        .addStringOption(option =>
          option
            .setName('titulo')
            .setDescription('Título da mudança')
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption(option =>
          option
            .setName('descricao')
            .setDescription('Descrição detalhada da mudança')
            .setRequired(true)
            .setMaxLength(1000)
        )
        .addStringOption(option =>
          option
            .setName('versao')
            .setDescription('Versão (ex: v1.2.3)')
            .setRequired(false)
            .setMaxLength(20)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  category: CommandCategory.ADMIN,
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    const logger = new Logger();

    try {
      await interaction.deferReply();

      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'config':
          await handleConfigCommand(interaction, client);
          break;
        case 'eventos':
          await handleEventosCommand(interaction, client);
          break;
        case 'filtros':
          await handleFiltrosCommand(interaction, client);
          break;
        case 'status':
          await handleStatusCommand(interaction, client);
          break;
        case 'teste':
          await handleTesteCommand(interaction, client);
          break;
        case 'changelog':
          await handleChangelogCommand(interaction, client);
          break;
        default:
          await interaction.editReply({ content: '❌ Subcomando não reconhecido.' });
      }
    } catch (error) {
      logger.error('Error in logs command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao executar o comando de logs.')
        .setColor(0xff0000)
        .setTimestamp();

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};

/**
 * Handle config subcommand
 */
async function handleConfigCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  if (!client.services?.logging) {
    await interaction.editReply({ content: '❌ Serviço de logs não está disponível.' });
    return;
  }

  const guildId = interaction.guild!.id;
  const currentConfig = client.services.logging.getConfig(guildId);

  const moderacaoChannel = interaction.options.getChannel('moderacao') as TextChannel;
  const mensagensChannel = interaction.options.getChannel('mensagens') as TextChannel;
  const membrosChannel = interaction.options.getChannel('membros') as TextChannel;
  const vozChannel = interaction.options.getChannel('voz') as TextChannel;
  const servidorChannel = interaction.options.getChannel('servidor') as TextChannel;
  const changelogChannel = interaction.options.getChannel('changelog') as TextChannel;

  const updates: any = {};

  if (moderacaoChannel) {
    updates['channels.moderation'] = moderacaoChannel.id;
  }
  if (mensagensChannel) {
    updates['channels.messages'] = mensagensChannel.id;
  }
  if (membrosChannel) {
    updates['channels.members'] = membrosChannel.id;
  }
  if (vozChannel) {
    updates['channels.voice'] = vozChannel.id;
  }
  if (servidorChannel) {
    updates['channels.server'] = servidorChannel.id;
  }
  if (changelogChannel) {
    updates['channels.changelog'] = changelogChannel.id;
  }

  if (Object.keys(updates).length === 0) {
    await interaction.editReply({ content: '❌ Nenhum canal foi especificado para configuração.' });
    return;
  }

  // Update configuration
  const newChannels = { ...currentConfig.channels };
  Object.keys(updates).forEach(key => {
    const channelType = key.split('.')[1];
    newChannels[channelType as keyof typeof newChannels] = updates[key];
  });

  client.services.logging.updateGuildConfig(guildId, {
    channels: newChannels,
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ Configuração de Logs Atualizada')
    .setDescription('Os canais de log foram configurados com sucesso!')
    .setColor(0x00ff00)
    .setTimestamp();

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (moderacaoChannel) {
    fields.push({ name: '🛡️ Moderação', value: `<#${moderacaoChannel.id}>`, inline: true });
  }
  if (mensagensChannel) {
    fields.push({ name: '💬 Mensagens', value: `<#${mensagensChannel.id}>`, inline: true });
  }
  if (membrosChannel) {
    fields.push({ name: '👥 Membros', value: `<#${membrosChannel.id}>`, inline: true });
  }
  if (vozChannel) {
    fields.push({ name: '🔊 Voz', value: `<#${vozChannel.id}>`, inline: true });
  }
  if (servidorChannel) {
    fields.push({ name: '🏠 Servidor', value: `<#${servidorChannel.id}>`, inline: true });
  }
  if (changelogChannel) {
    fields.push({ name: '📋 Changelog', value: `<#${changelogChannel.id}>`, inline: true });
  }

  embed.addFields(fields);

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle eventos subcommand
 */
async function handleEventosCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  if (!client.services?.logging) {
    await interaction.editReply({ content: '❌ Serviço de logs não está disponível.' });
    return;
  }

  const guildId = interaction.guild!.id;
  const currentConfig = client.services.logging.getConfig(guildId);

  const mensagensDeletadas = interaction.options.getBoolean('mensagens_deletadas');
  const mensagensEditadas = interaction.options.getBoolean('mensagens_editadas');
  const entradaMembros = interaction.options.getBoolean('entrada_membros');
  const saidaMembros = interaction.options.getBoolean('saida_membros');
  const atualizacaoMembros = interaction.options.getBoolean('atualizacao_membros');
  const acoesModeracao = interaction.options.getBoolean('acoes_moderacao');
  const eventosVoz = interaction.options.getBoolean('eventos_voz');

  const newEvents = { ...currentConfig.events };

  if (mensagensDeletadas !== null) {
    newEvents.messageDelete = mensagensDeletadas;
  }
  if (mensagensEditadas !== null) {
    newEvents.messageEdit = mensagensEditadas;
  }
  if (entradaMembros !== null) {
    newEvents.memberJoin = entradaMembros;
  }
  if (saidaMembros !== null) {
    newEvents.memberLeave = saidaMembros;
  }
  if (atualizacaoMembros !== null) {
    newEvents.memberUpdate = atualizacaoMembros;
  }
  if (acoesModeracao !== null) {
    newEvents.moderationActions = acoesModeracao;
  }
  if (eventosVoz !== null) {
    newEvents.voiceJoin = eventosVoz;
    newEvents.voiceLeave = eventosVoz;
    newEvents.voiceMove = eventosVoz;
  }

  client.services.logging.updateGuildConfig(guildId, {
    events: newEvents,
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ Eventos de Log Configurados')
    .setDescription('As configurações de eventos foram atualizadas!')
    .setColor(0x00ff00)
    .addFields(
      {
        name: '🗑️ Mensagens Deletadas',
        value: newEvents.messageDelete ? '✅ Ativo' : '❌ Inativo',
        inline: true,
      },
      {
        name: '✏️ Mensagens Editadas',
        value: newEvents.messageEdit ? '✅ Ativo' : '❌ Inativo',
        inline: true,
      },
      {
        name: '👋 Entrada de Membros',
        value: newEvents.memberJoin ? '✅ Ativo' : '❌ Inativo',
        inline: true,
      },
      {
        name: '👋 Saída de Membros',
        value: newEvents.memberLeave ? '✅ Ativo' : '❌ Inativo',
        inline: true,
      },
      {
        name: '👤 Atualização de Membros',
        value: newEvents.memberUpdate ? '✅ Ativo' : '❌ Inativo',
        inline: true,
      },
      {
        name: '🛡️ Ações de Moderação',
        value: newEvents.moderationActions ? '✅ Ativo' : '❌ Inativo',
        inline: true,
      },
      {
        name: '🔊 Eventos de Voz',
        value: newEvents.voiceJoin ? '✅ Ativo' : '❌ Inativo',
        inline: true,
      }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle filtros subcommand
 */
async function handleFiltrosCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  if (!client.services?.logging) {
    await interaction.editReply({ content: '❌ Serviço de logs não está disponível.' });
    return;
  }

  const guildId = interaction.guild!.id;
  const currentConfig = client.services.logging.getConfig(guildId);

  const ignorarBots = interaction.options.getBoolean('ignorar_bots');

  const newFilters = { ...currentConfig.filters };

  if (ignorarBots !== null) {
    newFilters.ignoreBots = ignorarBots;
  }

  client.services.logging.updateGuildConfig(guildId, {
    filters: newFilters,
  });

  const embed = new EmbedBuilder()
    .setTitle('✅ Filtros de Log Configurados')
    .setDescription('As configurações de filtros foram atualizadas!')
    .setColor(0x00ff00)
    .addFields({
      name: '🤖 Ignorar Bots',
      value: newFilters.ignoreBots ? '✅ Ativo' : '❌ Inativo',
      inline: true,
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle status subcommand
 */
async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  if (!client.services?.logging) {
    await interaction.editReply({ content: '❌ Serviço de logs não está disponível.' });
    return;
  }

  const guildId = interaction.guild!.id;
  const config = client.services.logging.getConfig(guildId);
  const stats = client.services.logging.getStats();

  const embed = new EmbedBuilder()
    .setTitle('📊 Status do Sistema de Logs')
    .setColor(0x0099ff)
    .addFields(
      { name: '🔧 Status Geral', value: config.enabled ? '✅ Ativo' : '❌ Inativo', inline: true },
      { name: '📊 Fila de Logs', value: stats.queueSize.toString(), inline: true },
      { name: '🏠 Servidores Configurados', value: stats.configuredGuilds.toString(), inline: true }
    )
    .setTimestamp();

  // Canais configurados
  const channels: string[] = [];
  if (config.channels.moderation) {
    channels.push(`🛡️ Moderação: <#${config.channels.moderation}>`);
  }
  if (config.channels.messages) {
    channels.push(`💬 Mensagens: <#${config.channels.messages}>`);
  }
  if (config.channels.members) {
    channels.push(`👥 Membros: <#${config.channels.members}>`);
  }
  if (config.channels.voice) {
    channels.push(`🔊 Voz: <#${config.channels.voice}>`);
  }
  if (config.channels.server) {
    channels.push(`🏠 Servidor: <#${config.channels.server}>`);
  }
  if (config.channels.changelog) {
    channels.push(`📋 Changelog: <#${config.channels.changelog}>`);
  }

  if (channels.length > 0) {
    embed.addFields({ name: '📍 Canais Configurados', value: channels.join('\n'), inline: false });
  } else {
    embed.addFields({
      name: '📍 Canais Configurados',
      value: 'Nenhum canal configurado',
      inline: false,
    });
  }

  // Eventos ativos
  const activeEvents: string[] = [];
  if (config.events.messageDelete) {
    activeEvents.push('🗑️ Mensagens Deletadas');
  }
  if (config.events.messageEdit) {
    activeEvents.push('✏️ Mensagens Editadas');
  }
  if (config.events.memberJoin) {
    activeEvents.push('👋 Entrada de Membros');
  }
  if (config.events.memberLeave) {
    activeEvents.push('👋 Saída de Membros');
  }
  if (config.events.memberUpdate) {
    activeEvents.push('👤 Atualização de Membros');
  }
  if (config.events.moderationActions) {
    activeEvents.push('🛡️ Ações de Moderação');
  }
  if (config.events.voiceJoin) {
    activeEvents.push('🔊 Eventos de Voz');
  }

  embed.addFields({
    name: '📋 Eventos Ativos',
    value: activeEvents.length > 0 ? activeEvents.join('\n') : 'Nenhum evento ativo',
    inline: false,
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle teste subcommand
 */
async function handleTesteCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  if (!client.services?.logging) {
    await interaction.editReply({ content: '❌ Serviço de logs não está disponível.' });
    return;
  }

  const guildId = interaction.guild!.id;
  const config = client.services.logging.getConfig(guildId);

  // Send test messages to configured channels
  const testResults: string[] = [];

  const testEmbed = new EmbedBuilder()
    .setTitle('🧪 Teste do Sistema de Logs')
    .setDescription(
      'Esta é uma mensagem de teste para verificar se o sistema de logs está funcionando corretamente.'
    )
    .setColor(0x00ff00)
    .addFields(
      { name: '👤 Testado por', value: interaction.user.tag, inline: true },
      { name: '⏰ Data/Hora', value: new Date().toLocaleString('pt-BR'), inline: true }
    )
    .setTimestamp();

  // Test each configured channel
  const channelTests = [
    { name: 'Moderação', id: config.channels.moderation, emoji: '🛡️' },
    { name: 'Mensagens', id: config.channels.messages, emoji: '💬' },
    { name: 'Membros', id: config.channels.members, emoji: '👥' },
    { name: 'Voz', id: config.channels.voice, emoji: '🔊' },
    { name: 'Servidor', id: config.channels.server, emoji: '🏠' },
    { name: 'Changelog', id: config.channels.changelog, emoji: '📋' },
  ];

  for (const test of channelTests) {
    if (test.id) {
      try {
        const channel = client.channels.cache.get(test.id) as TextChannel;
        if (channel) {
          await channel.send({ embeds: [testEmbed] });
          testResults.push(`${test.emoji} ${test.name}: ✅ Sucesso`);
        } else {
          testResults.push(`${test.emoji} ${test.name}: ❌ Canal não encontrado`);
        }
      } catch (error) {
        testResults.push(`${test.emoji} ${test.name}: ❌ Erro ao enviar`);
      }
    }
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle('🧪 Resultados do Teste')
    .setDescription(
      testResults.length > 0 ? testResults.join('\n') : 'Nenhum canal configurado para teste.'
    )
    .setColor(testResults.some(r => r.includes('❌')) ? 0xff0000 : 0x00ff00)
    .setTimestamp();

  await interaction.editReply({ embeds: [resultEmbed] });
}

/**
 * Handle changelog subcommand
 */
async function handleChangelogCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  if (!client.services?.logging) {
    await interaction.editReply({ content: '❌ Serviço de logs não está disponível.' });
    return;
  }

  const tipo = interaction.options.getString('tipo', true) as
    | 'feature'
    | 'bugfix'
    | 'improvement'
    | 'breaking';
  const titulo = interaction.options.getString('titulo', true);
  const descricao = interaction.options.getString('descricao', true);
  const versao = interaction.options.getString('versao');

  const typeEmojis = {
    feature: '✨',
    bugfix: '🐛',
    improvement: '⚡',
    breaking: '💥',
  };

  const typeNames = {
    feature: 'Nova Funcionalidade',
    bugfix: 'Correção de Bug',
    improvement: 'Melhoria',
    breaking: 'Mudança Importante',
  };

  const changelogEntry = {
    version: versao || undefined,
    type: tipo,
    title: titulo,
    description: descricao,
    author: interaction.user.tag,
    timestamp: new Date(),
  };

  await client.services.logging.logChangelog(interaction.guild!.id, changelogEntry);

  const embed = new EmbedBuilder()
    .setTitle('✅ Changelog Adicionado')
    .setDescription('A entrada foi adicionada ao changelog com sucesso!')
    .setColor(0x00ff00)
    .addFields(
      { name: '🏷️ Tipo', value: `${typeEmojis[tipo]} ${typeNames[tipo]}`, inline: true },
      { name: '📝 Título', value: titulo, inline: true },
      { name: '🔢 Versão', value: versao || 'N/A', inline: true },
      { name: '📄 Descrição', value: descricao, inline: false },
      { name: '👤 Autor', value: interaction.user.tag, inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export default logs;
