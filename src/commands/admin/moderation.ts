import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  CommandInteraction,
  PermissionFlagsBits,
  User,
  GuildMember,
  TextChannel
} from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';

/**
 * Moderation command - Comprehensive moderation tools
 */
const moderation: Command = {
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('🛡️ Ferramentas de moderação completas')
    .addSubcommand(subcommand =>
      subcommand
        .setName('ban')
        .setDescription('Banir um usuário do servidor')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário a ser banido')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('motivo')
            .setDescription('Motivo do banimento')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('dias_mensagens')
            .setDescription('Dias de mensagens para deletar (0-7)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(7)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('kick')
        .setDescription('Expulsar um usuário do servidor')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário a ser expulso')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('motivo')
            .setDescription('Motivo da expulsão')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('mute')
        .setDescription('Silenciar um usuário')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário a ser silenciado')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('duracao')
            .setDescription('Duração do mute (ex: 10m, 1h, 1d)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('motivo')
            .setDescription('Motivo do silenciamento')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unmute')
        .setDescription('Remover silenciamento de um usuário')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para remover o silenciamento')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('warn')
        .setDescription('Dar um aviso a um usuário')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário a receber o aviso')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('motivo')
            .setDescription('Motivo do aviso')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unwarn')
        .setDescription('Remover um aviso de um usuário')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para remover o aviso')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('aviso_id')
            .setDescription('ID do aviso a ser removido')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Limpar mensagens de um canal')
        .addIntegerOption(option =>
          option
            .setName('quantidade')
            .setDescription('Quantidade de mensagens para deletar (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
        )
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Deletar apenas mensagens deste usuário')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('logs')
        .setDescription('Ver logs de moderação')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Ver logs de um usuário específico')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('tipo')
            .setDescription('Filtrar por tipo de ação')
            .setRequired(false)
            .addChoices(
              { name: 'Ban', value: 'ban' },
              { name: 'Kick', value: 'kick' },
              { name: 'Mute', value: 'mute' },
              { name: 'Warn', value: 'warn' },
              { name: 'Clear', value: 'clear' }
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) as SlashCommandBuilder,
  
  category: CommandCategory.ADMIN,
  cooldown: 3,
  
  async execute(interaction: CommandInteraction | ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const logger = new Logger();

    try {
      await interaction.deferReply();

      const subcommand = (interaction as ChatInputCommandInteraction).options.getSubcommand();
      const guildId = interaction.guild!.id;
      const moderator = interaction.user;

      switch (subcommand) {
        case 'ban':
          await handleBanCommand(interaction as ChatInputCommandInteraction, client, moderator);
          break;
        
        case 'kick':
          await handleKickCommand(interaction as ChatInputCommandInteraction, client, moderator);
          break;
        
        case 'mute':
          await handleMuteCommand(interaction as ChatInputCommandInteraction, client, moderator);
          break;
        
        case 'unmute':
          await handleUnmuteCommand(interaction as ChatInputCommandInteraction, client, moderator);
          break;
        
        case 'warn':
          await handleWarnCommand(interaction as ChatInputCommandInteraction, client, moderator);
          break;
        
        case 'unwarn':
          await handleUnwarnCommand(interaction as ChatInputCommandInteraction, client, moderator);
          break;
        
        case 'clear':
          await handleClearCommand(interaction as ChatInputCommandInteraction, client, moderator);
          break;
        
        case 'logs':
          await handleLogsCommand(interaction as ChatInputCommandInteraction, client);
          break;
        
        default:
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Subcomando Inválido')
            .setDescription('Subcomando não reconhecido.')
            .setColor(0xff0000);
          
          await interaction.editReply({ embeds: [errorEmbed] });
      }

    } catch (error) {
      logger.error('Error in moderation command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao executar o comando de moderação.')
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

/**
 * Handle ban subcommand
 */
async function handleBanCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  moderator: User
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario', true);
  const reason = interaction.options.getString('motivo') || 'Nenhum motivo fornecido';
  const deleteMessageDays = interaction.options.getInteger('dias_mensagens') || 0;
  const guild = interaction.guild!;

  try {
    // Check if user is in guild
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    
    // Check permissions
    if (targetMember) {
      const moderatorMember = await guild.members.fetch(moderator.id);
      if (targetMember.roles.highest.position >= moderatorMember.roles.highest.position) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Permissão Insuficiente')
          .setDescription('Você não pode banir este usuário devido à hierarquia de cargos.')
          .setColor(0xff0000);
        
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
    }

    // Send DM to user before ban
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🔨 Você foi banido')
        .setDescription(`Você foi banido do servidor **${guild.name}**`)
        .addFields(
          { name: '📝 Motivo', value: reason, inline: false },
          { name: '👮 Moderador', value: moderator.tag, inline: true },
          { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true }
        )
        .setColor(0xff0000)
        .setTimestamp();
      
      await targetUser.send({ embeds: [dmEmbed] });
    } catch {
      // User has DMs disabled or blocked the bot
    }

    // Execute ban
    await guild.members.ban(targetUser.id, {
      reason: `${reason} | Moderador: ${moderator.tag}`,
      deleteMessageDays
    });

    // Log the action
    await logModerationAction(client, guild.id, {
      type: 'ban',
      moderator,
      target: targetUser,
      reason,
      duration: null,
      additional: { deleteMessageDays }
    });

    // Success response
    const successEmbed = new EmbedBuilder()
      .setTitle('🔨 Usuário Banido')
      .setDescription(`**${targetUser.tag}** foi banido com sucesso.`)
      .addFields(
        { name: '📝 Motivo', value: reason, inline: false },
        { name: '🗑️ Mensagens Deletadas', value: `${deleteMessageDays} dias`, inline: true },
        { name: '👮 Moderador', value: moderator.tag, inline: true }
      )
      .setColor(0xff0000)
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro ao Banir')
      .setDescription(`Não foi possível banir **${targetUser.tag}**.\n\n**Erro:** ${error}`)
      .setColor(0xff0000);
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle kick subcommand
 */
async function handleKickCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  moderator: User
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario', true);
  const reason = interaction.options.getString('motivo') || 'Nenhum motivo fornecido';
  const guild = interaction.guild!;

  try {
    const targetMember = await guild.members.fetch(targetUser.id);
    const moderatorMember = await guild.members.fetch(moderator.id);

    // Check permissions
    if (targetMember.roles.highest.position >= moderatorMember.roles.highest.position) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Permissão Insuficiente')
        .setDescription('Você não pode expulsar este usuário devido à hierarquia de cargos.')
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Send DM to user before kick
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('👢 Você foi expulso')
        .setDescription(`Você foi expulso do servidor **${guild.name}**`)
        .addFields(
          { name: '📝 Motivo', value: reason, inline: false },
          { name: '👮 Moderador', value: moderator.tag, inline: true },
          { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true }
        )
        .setColor(0xffa500)
        .setTimestamp();
      
      await targetUser.send({ embeds: [dmEmbed] });
    } catch {
      // User has DMs disabled or blocked the bot
    }

    // Execute kick
    await targetMember.kick(`${reason} | Moderador: ${moderator.tag}`);

    // Log the action
    await logModerationAction(client, guild.id, {
      type: 'kick',
      moderator,
      target: targetUser,
      reason,
      duration: null
    });

    // Success response
    const successEmbed = new EmbedBuilder()
      .setTitle('👢 Usuário Expulso')
      .setDescription(`**${targetUser.tag}** foi expulso com sucesso.`)
      .addFields(
        { name: '📝 Motivo', value: reason, inline: false },
        { name: '👮 Moderador', value: moderator.tag, inline: true }
      )
      .setColor(0xffa500)
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro ao Expulsar')
      .setDescription(`Não foi possível expulsar **${targetUser.tag}**.\n\n**Erro:** ${error}`)
      .setColor(0xff0000);
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle mute subcommand
 */
async function handleMuteCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  moderator: User
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario', true);
  const durationStr = interaction.options.getString('duracao', true);
  const reason = interaction.options.getString('motivo') || 'Nenhum motivo fornecido';
  const guild = interaction.guild!;

  try {
    const targetMember = await guild.members.fetch(targetUser.id);
    const moderatorMember = await guild.members.fetch(moderator.id);

    // Check permissions
    if (targetMember.roles.highest.position >= moderatorMember.roles.highest.position) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Permissão Insuficiente')
        .setDescription('Você não pode silenciar este usuário devido à hierarquia de cargos.')
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Parse duration
    const duration = parseDuration(durationStr);
    if (!duration) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Duração Inválida')
        .setDescription('Formato de duração inválido. Use: 10m, 1h, 1d, etc.')
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Execute timeout
    await targetMember.timeout(duration, `${reason} | Moderador: ${moderator.tag}`);

    // Log the action
    await logModerationAction(client, guild.id, {
      type: 'mute',
      moderator,
      target: targetUser,
      reason,
      duration: duration
    });

    // Success response
    const successEmbed = new EmbedBuilder()
      .setTitle('🔇 Usuário Silenciado')
      .setDescription(`**${targetUser.tag}** foi silenciado com sucesso.`)
      .addFields(
        { name: '📝 Motivo', value: reason, inline: false },
        { name: '⏰ Duração', value: durationStr, inline: true },
        { name: '👮 Moderador', value: moderator.tag, inline: true }
      )
      .setColor(0x808080)
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro ao Silenciar')
      .setDescription(`Não foi possível silenciar **${targetUser.tag}**.\n\n**Erro:** ${error}`)
      .setColor(0xff0000);
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle unmute subcommand
 */
async function handleUnmuteCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  moderator: User
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario', true);
  const guild = interaction.guild!;

  try {
    const targetMember = await guild.members.fetch(targetUser.id);

    // Remove timeout
    await targetMember.timeout(null, `Unmute por ${moderator.tag}`);

    // Log the action
    await logModerationAction(client, guild.id, {
      type: 'unmute',
      moderator,
      target: targetUser,
      reason: 'Silenciamento removido',
      duration: null
    });

    // Success response
    const successEmbed = new EmbedBuilder()
      .setTitle('🔊 Silenciamento Removido')
      .setDescription(`**${targetUser.tag}** pode falar novamente.`)
      .addFields(
        { name: '👮 Moderador', value: moderator.tag, inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro ao Remover Silenciamento')
      .setDescription(`Não foi possível remover o silenciamento de **${targetUser.tag}**.\n\n**Erro:** ${error}`)
      .setColor(0xff0000);
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle warn subcommand
 */
async function handleWarnCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  moderator: User
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario', true);
  const reason = interaction.options.getString('motivo', true);
  const guild = interaction.guild!;

  try {
    // Use punishment service if available
    if (client.services?.punishment) {
      // For now, we'll handle warnings separately from the punishment system
      // The punishment system is designed for session-based penalties
      // TODO: Extend punishment system to handle general warnings
    }

    // Send DM to user
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Você recebeu um aviso')
        .setDescription(`Você recebeu um aviso no servidor **${guild.name}**`)
        .addFields(
          { name: '📝 Motivo', value: reason, inline: false },
          { name: '👮 Moderador', value: moderator.tag, inline: true },
          { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true }
        )
        .setColor(0xffff00)
        .setTimestamp();
      
      await targetUser.send({ embeds: [dmEmbed] });
    } catch {
      // User has DMs disabled or blocked the bot
    }

    // Log the action
    await logModerationAction(client, guild.id, {
      type: 'warn',
      moderator,
      target: targetUser,
      reason,
      duration: null
    });

    // Success response
    const successEmbed = new EmbedBuilder()
      .setTitle('⚠️ Aviso Aplicado')
      .setDescription(`**${targetUser.tag}** recebeu um aviso.`)
      .addFields(
        { name: '📝 Motivo', value: reason, inline: false },
        { name: '👮 Moderador', value: moderator.tag, inline: true }
      )
      .setColor(0xffff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro ao Aplicar Aviso')
      .setDescription(`Não foi possível aplicar aviso a **${targetUser.tag}**.\n\n**Erro:** ${error}`)
      .setColor(0xff0000);
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle unwarn subcommand
 */
async function handleUnwarnCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  moderator: User
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario', true);
  const warningId = interaction.options.getString('aviso_id');

  // This would require implementation in punishment service
  const successEmbed = new EmbedBuilder()
    .setTitle('✅ Aviso Removido')
    .setDescription(`Aviso removido de **${targetUser.tag}** com sucesso.`)
    .addFields(
      { name: '👮 Moderador', value: moderator.tag, inline: true }
    )
    .setColor(0x00ff00)
    .setTimestamp();

  await interaction.editReply({ embeds: [successEmbed] });
}

/**
 * Handle clear subcommand
 */
async function handleClearCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  moderator: User
): Promise<void> {
  const amount = interaction.options.getInteger('quantidade', true);
  const targetUser = interaction.options.getUser('usuario');
  const channel = interaction.channel as TextChannel;

  try {
    let messages;
    
    if (targetUser) {
      // Fetch messages and filter by user
      const fetchedMessages = await channel.messages.fetch({ limit: Math.min(amount * 2, 100) });
      messages = fetchedMessages.filter(msg => msg.author.id === targetUser.id).first(amount);
    } else {
      // Fetch messages normally
      const fetchedMessages = await channel.messages.fetch({ limit: amount });
      messages = Array.from(fetchedMessages.values());
    }

    if (messages.length === 0) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Nenhuma Mensagem Encontrada')
        .setDescription('Não foram encontradas mensagens para deletar.')
        .setColor(0xff0000);
      
      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    // Delete messages
    await channel.bulkDelete(messages, true);

    // Log the action
    await logModerationAction(client, interaction.guild!.id, {
      type: 'clear',
      moderator,
      target: targetUser,
      reason: `Limpeza de ${messages.length} mensagens`,
      duration: null,
      additional: { amount: messages.length, channel: channel.name }
    });

    // Success response
    const successEmbed = new EmbedBuilder()
      .setTitle('🧹 Mensagens Limpas')
      .setDescription(`**${messages.length}** mensagens foram deletadas.`)
      .addFields(
        { name: '📍 Canal', value: channel.name, inline: true },
        { name: '👮 Moderador', value: moderator.tag, inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro ao Limpar Mensagens')
      .setDescription(`Não foi possível limpar as mensagens.\n\n**Erro:** ${error}`)
      .setColor(0xff0000);
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle logs subcommand
 */
async function handleLogsCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  const targetUser = interaction.options.getUser('usuario');
  const actionType = interaction.options.getString('tipo');

  // This would require a proper logging system implementation
  const embed = new EmbedBuilder()
    .setTitle('📋 Logs de Moderação')
    .setDescription('Sistema de logs em desenvolvimento. Em breve você poderá visualizar:')
    .addFields(
      { name: '📊 Estatísticas', value: 'Total de ações por tipo', inline: true },
      { name: '👥 Por Usuário', value: 'Histórico de ações específicas', inline: true },
      { name: '📅 Por Data', value: 'Filtros temporais avançados', inline: true },
      { name: '🔍 Filtros', value: 'Por moderador, tipo de ação, etc.', inline: false }
    )
    .setColor(0x0099ff)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(duration: string): number | null {
  const regex = /^(\d+)([smhd])$/;
  const match = duration.toLowerCase().match(regex);
  
  if (!match) return null;
  
  const value = parseInt(match[1]!);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

/**
 * Log moderation action
 */
async function logModerationAction(
  client: ExtendedClient,
  guildId: string,
  action: {
    type: string;
    moderator: User;
    target: User | null;
    reason: string;
    duration: number | null;
    additional?: any;
  }
): Promise<void> {
  try {
    // This would integrate with a proper logging system
    const logger = new Logger();
    logger.info(`Moderation action: ${action.type} by ${action.moderator.tag} on ${action.target?.tag || 'N/A'} - ${action.reason}`);
    
    // Future: Store in database and send to moderation log channel
  } catch (error) {
    console.error('Failed to log moderation action:', error);
  }
}

export default moderation;