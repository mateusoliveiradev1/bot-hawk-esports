import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  CommandInteraction,
  ChannelType,
  CategoryChannel,
  VoiceChannel,
  TextChannel,
  PermissionFlagsBits,
  ComponentType
} from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';
import { PresenceService } from '@/services/presence.service';
import { BadgeService } from '@/services/badge.service';
import { DatabaseService } from '@/database/database.service';
import { getChannelConfig, formatCleanupTime } from '../../config/channels.config.js';

/**
 * Check-in command - Start presence tracking session
 */
const checkin: Command = {
  data: new SlashCommandBuilder()
    .setName('checkin')
    .setDescription('🎮 Fazer check-in para iniciar uma sessão de presença')
    .addStringOption(option =>
      option
        .setName('tipo')
        .setDescription('Tipo de sessão')
        .setRequired(true)
        .addChoices(
          { name: '🎯 Matchmaking (MM)', value: 'mm' },
          { name: '⚔️ Scrim', value: 'scrim' },
          { name: '🏆 Campeonato', value: 'campeonato' },
          { name: '🎖️ Ranked', value: 'ranked' }
        )
    )
    .addStringOption(option =>
      option
        .setName('nome')
        .setDescription('Nome da partida/evento (obrigatório para scrim e campeonato)')
        .setRequired(false)
        .setMaxLength(50)
    ) as SlashCommandBuilder,
  
  category: CommandCategory.GENERAL,
  cooldown: 10, // 10 seconds cooldown to prevent spam
  
  async execute(interaction: CommandInteraction | ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const logger = new Logger();
    const database = new DatabaseService();
    const presenceService = new PresenceService(client);
    const badgeService = new BadgeService(client);

    try {
      await interaction.deferReply();

      const tipo = (interaction as ChatInputCommandInteraction).options.getString('tipo', true);
      const nome = (interaction as ChatInputCommandInteraction).options.getString('nome');
      const userId = interaction.user.id;
      const guildId = interaction.guild!.id;
      const member = interaction.member;

      // Validate required name for scrim and campeonato
      if ((tipo === 'scrim' || tipo === 'campeonato') && !nome) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Nome Obrigatório')
          .setDescription(`Para sessões de **${getTipoDisplayName(tipo)}**, você deve informar o nome da partida/evento.`)
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Check if user is registered
      const user = await database.client.user.findUnique({
        where: { id: userId },
        include: { stats: true }
      });

      if (!user) {
        const registerEmbed = new EmbedBuilder()
          .setTitle('❌ Usuário Não Registrado')
          .setDescription('Você precisa se registrar primeiro usando `/register` para fazer check-in!')
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [registerEmbed] });
        return;
      }

      // Attempt check-in via PresenceService
      const sessionName = nome || `${interaction.user.displayName} - ${getTipoDisplayName(tipo)}`;
      const checkInResult = await presenceService.checkIn(
        guildId,
        userId,
        sessionName, // location field
        `Tipo: ${tipo}${nome ? ` | Nome: ${nome}` : ''}`, // note field
        interaction.user.id, // ipAddress placeholder
        `Discord Bot - ${tipo}` // deviceInfo
      );

      if (!checkInResult.success) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erro no Check-in')
          .setDescription(checkInResult.message)
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Create or get voice/text channels
      const channelResult = await createSessionChannels(interaction as ChatInputCommandInteraction, tipo, sessionName, nome || undefined);
      
      // Calculate XP and streak info
      const xpGained = calculateSessionXP(tipo);
      const currentStreak = 0; // TODO: Implement streak system
      
      // Schedule punishment checks for this session
      const sessionStartTime = new Date();
      const punishmentService = client.punishmentService;
      
      // Schedule no-show-up check (1 hour after check-in)
      setTimeout(async () => {
        if (channelResult.voiceChannel) {
          await punishmentService.checkNoShowUpPunishment(
            userId,
            guildId,
            sessionStartTime,
            channelResult.voiceChannel.id
          );
        }
      }, 60 * 60 * 1000); // 1 hour
      
      // Schedule no-checkout check (6 hours after check-in)
      setTimeout(async () => {
        await punishmentService.checkNoCheckoutPunishment(
          userId,
          guildId,
          sessionStartTime,
          channelResult.voiceChannel?.id
        );
      }, 6 * 60 * 60 * 1000); // 6 hours
      
      // Award XP for check-in
      await database.client.user.update({
        where: { id: userId },
        data: {
          xp: { increment: xpGained }
        }
      });

      // Update user stats separately
      await database.client.userStats.upsert({
        where: { userId },
        update: {
          commandsUsed: { increment: 1 }
        },
        create: {
          userId,
          commandsUsed: 1
        }
      });

      // Check for presence-related badges
      await checkPresenceBadges(badgeService, userId, tipo);

      // Create success embed
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Check-in Realizado!')
        .setDescription(`Sessão de **${getTipoDisplayName(tipo)}** iniciada com sucesso!`)
        .setColor(0x00ff00)
        .addFields(
          {
            name: '👤 Usuário',
            value: interaction.user.displayName,
            inline: true
          },
          {
            name: '🎮 Tipo de Sessão',
            value: getTipoDisplayName(tipo),
            inline: true
          },
          {
            name: '⏰ Início',
            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
            inline: true
          }
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      if (nome) {
        successEmbed.addFields({
          name: '📝 Nome da Sessão',
          value: nome,
          inline: false
        });
      }

      successEmbed.addFields(
        {
          name: '🎯 XP Ganho',
          value: `+${xpGained} XP`,
          inline: true
        },
        {
          name: '🔥 Streak Atual',
          value: `${currentStreak} dias`,
          inline: true
        }
      );

      if (channelResult.voiceChannel) {
        successEmbed.addFields({
          name: '🔊 Canal de Voz',
          value: `<#${channelResult.voiceChannel.id}>`,
          inline: true
        });
      }

      if (channelResult.textChannel) {
        successEmbed.addFields({
          name: '💬 Canal de Texto',
          value: `<#${channelResult.textChannel.id}>`,
          inline: true
        });
      }

      // Create action buttons
      const actionButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`checkout_${userId}`)
            .setLabel('🚪 Check-out')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`invite_players_${userId}`)
            .setLabel('👥 Convidar Jogadores')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`confirm_presence_${userId}`)
            .setLabel('✅ Confirmar Presença')
            .setStyle(ButtonStyle.Primary)
        );

      // Create secondary action buttons
      const secondaryButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ranking_presence`)
            .setLabel('🏆 Ver Ranking')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`session_info_${userId}`)
            .setLabel('📊 Info da Sessão')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`session_participants_${userId}`)
            .setLabel('👤 Participantes')
            .setStyle(ButtonStyle.Secondary)
        );

      const response = await interaction.editReply({
        embeds: [successEmbed],
        components: [actionButtons, secondaryButtons]
      });

      // Setup button collector
      setupButtonCollector(response, interaction as ChatInputCommandInteraction, presenceService, userId, guildId, channelResult);

      logger.info(`User ${userId} checked in successfully for ${tipo} session`);

    } catch (error) {
      logger.error('Error in checkin command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro Interno')
        .setDescription('Ocorreu um erro ao processar seu check-in. Tente novamente em alguns instantes.')
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
 * Get display name for session type
 */
function getTipoDisplayName(tipo: string): string {
  const displayNames: Record<string, string> = {
    mm: '🎯 Matchmaking',
    scrim: '⚔️ Scrim',
    campeonato: '🏆 Campeonato',
    ranked: '🎖️ Ranked'
  };
  return displayNames[tipo] || tipo;
}

/**
 * Calculate XP based on session type
 */
function calculateSessionXP(tipo: string): number {
  const xpValues: Record<string, number> = {
    mm: 25,
    scrim: 50,
    campeonato: 100,
    ranked: 75
  };
  return xpValues[tipo] || 25;
}

/**
 * Create session channels based on type
 */
async function createSessionChannels(
  interaction: ChatInputCommandInteraction,
  tipo: string,
  sessionName: string,
  nome?: string
): Promise<{ voiceChannel?: VoiceChannel; textChannel?: TextChannel }> {
  try {
    const guild = interaction.guild!;
    const member = interaction.member!;
    
    // Find or create category
    let category: CategoryChannel | null = null;
    const categoryName = tipo === 'mm' ? '🎯 Matchmaking' : `🎮 ${sessionName}`;
    
    category = guild.channels.cache.find(
      (channel): channel is CategoryChannel => 
        channel.type === ChannelType.GuildCategory && 
        channel.name === categoryName
    ) || null;

    if (!category) {
      category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          },
        ],
      });
    }

    // Get configuration for this session type
    const config = getChannelConfig(tipo);
    
    // Create voice channel
    const voiceChannelName = nome 
      ? `🔊 ${nome}` 
      : (tipo === 'mm' ? `🔊 ${interaction.user.displayName}` : `🔊 ${sessionName}`);
    
    const voiceChannel = await guild.channels.create({
      name: voiceChannelName,
      type: ChannelType.GuildVoice,
      parent: category,
      userLimit: config.maxUsers || 10,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
        },
      ],
    });

    // Create text channel if needed
    let textChannel: TextChannel | undefined;
    if (config.createTextChannel) {
      const textChannelName = nome 
        ? `💬 ${nome.toLowerCase().replace(/\s+/g, '-')}` 
        : `💬 ${sessionName.toLowerCase().replace(/\s+/g, '-')}`;
      
      textChannel = await guild.channels.create({
        name: textChannelName,
        type: ChannelType.GuildText,
        parent: category,
        topic: `Canal de texto para ${sessionName}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
        ],
      });

      // Send welcome message in text channel
      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`🎮 ${nome || sessionName}`)
        .setDescription(`Canal criado para a sessão de **${getTipoDisplayName(tipo)}**\n\nBoa sorte e divirtam-se! 🎯`)
        .setColor(0x00ff00)
        .setTimestamp();

      await textChannel.send({ embeds: [welcomeEmbed] });
    }

    // Schedule automatic cleanup for temporary channels
    scheduleChannelCleanup(voiceChannel, textChannel, tipo);

    return { voiceChannel, textChannel };

  } catch (error) {
    console.error('Error creating session channels:', error);
    return {};
  }
}

/**
 * Check and award presence-related badges
 */
async function checkPresenceBadges(badgeService: BadgeService, userId: string, tipo: string): Promise<void> {
  try {
    // Award first check-in badge
    await badgeService.awardBadge(userId, 'first_checkin', false);
    
    // Award type-specific badges
    const typeBadges: Record<string, string> = {
      mm: 'mm_player',
      scrim: 'scrim_warrior',
      campeonato: 'tournament_fighter',
      ranked: 'ranked_grinder'
    };
    
    if (typeBadges[tipo]) {
      await badgeService.awardBadge(userId, typeBadges[tipo], false);
    }
  } catch (error) {
    console.error('Error checking presence badges:', error);
  }
}

/**
 * Setup button collector for interactive responses
 */
function setupButtonCollector(
  response: any,
  interaction: ChatInputCommandInteraction,
  presenceService: PresenceService,
  userId: string,
  guildId: string,
  channelResult: { voiceChannel?: VoiceChannel; textChannel?: TextChannel }
): void {
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes
  });

  collector.on('collect', async (buttonInteraction: any) => {
    // Allow other users to interact with invite and presence buttons
    const allowedForAll = [
      `invite_players_${userId}`,
      `confirm_presence_${userId}`,
      `session_participants_${userId}`,
      'ranking_presence'
    ];
    
    const isOwnerOnly = !allowedForAll.some(id => buttonInteraction.customId.includes(id.replace(`_${userId}`, '')));
    
    if (isOwnerOnly && buttonInteraction.user.id !== userId) {
      await buttonInteraction.reply({
        content: '❌ Você não pode usar os botões de outro usuário!',
        ephemeral: true,
      });
      return;
    }

    try {
      if (buttonInteraction.customId === `checkout_${userId}`) {
        // Handle checkout via button
        const checkoutResult = await presenceService.checkOut(guildId, userId, 'Check-out via botão');
        
        const embed = new EmbedBuilder()
          .setTitle(checkoutResult.success ? '✅ Check-out Realizado' : '❌ Erro no Check-out')
          .setDescription(checkoutResult.message)
          .setColor(checkoutResult.success ? 0x00ff00 : 0xff0000)
          .setTimestamp();

        await buttonInteraction.reply({ embeds: [embed], ephemeral: true });
        
        if (checkoutResult.success) {
          // Disable buttons after successful checkout
          const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('checkout_disabled')
                .setLabel('✅ Check-out Realizado')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true)
            );
          
          await response.edit({ components: [disabledButtons] });
        }
      } else if (buttonInteraction.customId === `invite_players_${userId}`) {
        // Handle player invitation
        const inviteEmbed = new EmbedBuilder()
          .setTitle('👥 Convidar Jogadores')
          .setDescription(
            `**Como convidar jogadores para a sessão:**\n\n` +
            `🔊 **Canal de Voz:** ${channelResult.voiceChannel ? `<#${channelResult.voiceChannel.id}>` : 'Não disponível'}\n` +
            `💬 **Canal de Texto:** ${channelResult.textChannel ? `<#${channelResult.textChannel.id}>` : 'Não disponível'}\n\n` +
            `📋 **Instruções:**\n` +
            `• Compartilhe os links dos canais com seus amigos\n` +
            `• Eles podem entrar diretamente nos canais\n` +
            `• Use o botão "✅ Confirmar Presença" quando chegarem\n` +
            `• O criador da sessão pode fazer check-out por todos`
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await buttonInteraction.reply({ embeds: [inviteEmbed], ephemeral: true });
        
      } else if (buttonInteraction.customId === `confirm_presence_${userId}`) {
        // Handle presence confirmation
        const confirmingUser = buttonInteraction.user;
        const isInVoiceChannel = channelResult.voiceChannel?.members.has(confirmingUser.id);
        
        if (!isInVoiceChannel) {
          await buttonInteraction.reply({
            content: `❌ Você precisa estar no canal de voz ${channelResult.voiceChannel ? `<#${channelResult.voiceChannel.id}>` : ''} para confirmar presença!`,
            ephemeral: true
          });
          return;
        }

        // Store presence confirmation (you might want to save this to database)
        const confirmEmbed = new EmbedBuilder()
          .setTitle('✅ Presença Confirmada!')
          .setDescription(
            `${confirmingUser.displayName} confirmou presença na sessão!\n\n` +
            `⏰ **Confirmado em:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
            `🔊 **Canal:** ${channelResult.voiceChannel ? `<#${channelResult.voiceChannel.id}>` : 'N/A'}\n\n` +
            `💡 **Lembre-se:** Faça check-out quando sair para evitar penalidades!`
          )
          .setColor(0x00ff00)
          .setThumbnail(confirmingUser.displayAvatarURL())
          .setTimestamp();

        await buttonInteraction.reply({ embeds: [confirmEmbed], ephemeral: true });
        
        // Notify in text channel if available
        if (channelResult.textChannel) {
          const notificationEmbed = new EmbedBuilder()
            .setDescription(`✅ ${confirmingUser.displayName} confirmou presença na sessão!`)
            .setColor(0x00ff00)
            .setTimestamp();
          
          await channelResult.textChannel.send({ embeds: [notificationEmbed] });
        }
        
      } else if (buttonInteraction.customId === `session_participants_${userId}`) {
        // Show session participants
        const voiceMembers = channelResult.voiceChannel?.members;
        const participantsList = voiceMembers?.map(member => `• ${member.displayName}`).join('\n') || 'Nenhum participante no canal de voz';
        
        const participantsEmbed = new EmbedBuilder()
          .setTitle('👤 Participantes da Sessão')
          .setDescription(
            `**Canal de Voz:** ${channelResult.voiceChannel ? `<#${channelResult.voiceChannel.id}>` : 'N/A'}\n\n` +
            `**Participantes Ativos (${voiceMembers?.size || 0}):**\n${participantsList}\n\n` +
            `💡 **Dica:** Use "✅ Confirmar Presença" para registrar sua participação!`
          )
          .setColor(0x3498db)
          .setTimestamp();

        await buttonInteraction.reply({ embeds: [participantsEmbed], ephemeral: true });
        
      } else if (buttonInteraction.customId === 'ranking_presence') {
        // Show presence ranking
        await buttonInteraction.reply({
          content: '🏆 Use o comando `/ranking presence` para ver o ranking completo de presença!',
          ephemeral: true,
        });
      } else if (buttonInteraction.customId === `session_info_${userId}`) {
        // Show session info
        const sessionStart = Math.floor(Date.now() / 1000);
        const infoEmbed = new EmbedBuilder()
          .setTitle('📊 Informações da Sessão')
          .setDescription('Detalhes da sua sessão ativa')
          .addFields(
            { name: '⏰ Início', value: `<t:${sessionStart}:F>`, inline: true },
            { name: '⏱️ Duração', value: `<t:${sessionStart}:R>`, inline: true },
            { name: '🎮 Status', value: '🟢 Ativa', inline: true }
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await buttonInteraction.reply({ embeds: [infoEmbed], ephemeral: true });
      }
    } catch (error) {
      console.error('Error handling button interaction:', error);
      await buttonInteraction.reply({
        content: '❌ Erro ao processar ação. Tente novamente.',
        ephemeral: true,
      });
    }
  });

  collector.on('end', async () => {
    try {
      // Disable buttons after collector expires
      const expiredButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('expired')
            .setLabel('⏰ Botões Expirados')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
      
      await response.edit({ components: [expiredButtons] });
    } catch (error) {
      // Ignore errors when editing expired messages
    }
  });
}

/**
 * Schedule automatic cleanup for temporary channels
 */
function scheduleChannelCleanup(
  voiceChannel: VoiceChannel,
  textChannel?: TextChannel,
  tipo?: string
): void {
  // Get configuration for this session type
  const config = getChannelConfig(tipo);
  const cleanupTime = config.cleanupTime;
  
  console.log(`Canais programados para limpeza automática em ${formatCleanupTime(cleanupTime)}`);

  // Schedule voice channel cleanup
  setTimeout(async () => {
    try {
      // Check if channel still exists and is empty
      try {
        const updatedChannel = await voiceChannel.fetch().catch(() => null);
        if (updatedChannel && updatedChannel.members.size === 0) {
          await updatedChannel.delete('Limpeza automática - tempo limite atingido');
          console.log(`Auto-deleted voice channel: ${voiceChannel.name}`);
        }
      } catch (error) {
        // Channel might have been deleted already
      }
    } catch (error) {
      console.error('Error in scheduled voice channel cleanup:', error);
    }
  }, cleanupTime);

  // Schedule text channel cleanup (if exists)
  if (textChannel) {
    setTimeout(async () => {
      try {
        // Check if channel still exists and has minimal activity
        try {
          const updatedChannel = await textChannel.fetch().catch(() => null);
          if (updatedChannel) {
            const messages = await updatedChannel.messages.fetch({ limit: 5 });
            const userMessages = messages.filter(msg => !msg.author.bot);
            
            // Remove if no recent user activity
            if (userMessages.size <= 1) {
              await updatedChannel.delete('Limpeza automática - tempo limite atingido');
              console.log(`Auto-deleted text channel: ${textChannel.name}`);
            }
          }
        } catch (error) {
          // Channel might have been deleted already
        }
      } catch (error) {
        console.error('Error in scheduled text channel cleanup:', error);
      }
    }, cleanupTime);
  }
}

export default checkin;