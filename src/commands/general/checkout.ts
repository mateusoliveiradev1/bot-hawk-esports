import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  CommandInteraction,
  ChannelType,
  VoiceChannel,
  TextChannel,
  CategoryChannel,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { PresenceService } from '../../services/presence.service';
import { BadgeService } from '../../services/badge.service';
import { DatabaseService } from '../../database/database.service';
import { PresenceEnhancementsService } from '../../services/presence-enhancements.service';

/**
 * Check-out command - End presence tracking session
 */
const checkout: Command = {
  data: new SlashCommandBuilder()
    .setName('checkout')
    .setDescription('🚪 Fazer check-out para finalizar sua sessão de presença ativa'),

  category: CommandCategory.GENERAL,
  cooldown: 5, // 5 seconds cooldown

  async execute(
    interaction: CommandInteraction | ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void> {
    const logger = new Logger();
    const database = client.database;
    const presenceService = (client as any).presenceService;
    const presenceEnhancementsService = (client as any).presenceEnhancementsService;
    const xpService = (client as any).xpService;
    const badgeService = (client as any).badgeService;

    try {
      await interaction.deferReply();

      const userId = interaction.user.id;
      const guildId = interaction.guild!.id;

      // Check if user is registered
      const user = await database.client.user.findUnique({
        where: { id: userId },
        include: { stats: true },
      });

      if (!user) {
        const registerEmbed = new EmbedBuilder()
          .setTitle('❌ Usuário Não Registrado')
          .setDescription(
            'Você precisa se registrar primeiro usando `/register` para fazer check-out!',
          )
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [registerEmbed] });
        return;
      }

      // Get current active session info before checkout
      const userSession = presenceService.getActiveSession(guildId, userId);

      if (!userSession) {
        const noSessionEmbed = new EmbedBuilder()
          .setTitle('❌ Nenhuma Sessão Ativa')
          .setDescription(
            'Você não possui uma sessão ativa para fazer check-out.\n\nUse `/checkin` para iniciar uma nova sessão!',
          )
          .setColor(0xff0000)
          .addFields({
            name: '💡 Dica',
            value: 'Você pode verificar suas sessões recentes usando `/profile`',
            inline: false,
          })
          .setTimestamp();

        await interaction.editReply({ embeds: [noSessionEmbed] });
        return;
      }

      // Calculate session duration
      const sessionStart = new Date(userSession.checkInTime);
      const sessionEnd = new Date();
      const durationMs = sessionEnd.getTime() - sessionStart.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));
      const durationHours = Math.floor(durationMinutes / 60);
      const remainingMinutes = durationMinutes % 60;

      // Attempt check-out via PresenceEnhancementsService (with fallback to PresenceService)
      let checkOutResult;
      if (presenceEnhancementsService) {
        try {
          checkOutResult = await presenceEnhancementsService.enhancedCheckOut(
            guildId,
            userId,
            'Check-out via comando /checkout',
          );
        } catch (error) {
          logger.warn(
            'PresenceEnhancementsService checkout failed, falling back to PresenceService:',
            error,
          );
          checkOutResult = await presenceService.checkOut(
            guildId,
            userId,
            'Check-out via comando /checkout',
          );
        }
      } else {
        checkOutResult = await presenceService.checkOut(
          guildId,
          userId,
          'Check-out via comando /checkout',
        );
      }

      if (!checkOutResult.success) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erro no Check-out')
          .setDescription(checkOutResult.message)
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Calculate XP and rewards based on session duration
      const sessionXP = calculateSessionXP(durationMinutes, userSession.location || '');
      const bonusXP = calculateBonusXP(durationMinutes);
      const totalXP = sessionXP + bonusXP;

      // Update user XP
      const updatedUser = await database.client.user.update({
        where: { id: userId },
        data: {
          xp: { increment: totalXP },
        },
        include: { stats: true },
      });

      // Update user stats separately
      await database.client.userStats.upsert({
        where: { userId },
        update: {
          voiceTime: { increment: durationMinutes * 60 }, // Convert to seconds
        },
        create: {
          userId,
          voiceTime: durationMinutes * 60,
        },
      });

      // Check for session-based badges
      await checkSessionBadges(badgeService, userId, durationMinutes, 0); // TODO: Implement sessions count

      // Handle channel cleanup
      const channelCleanup = await cleanupSessionChannels(
        interaction as ChatInputCommandInteraction,
        userSession.location || '',
      );

      // Create success embed
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Check-out Realizado!')
        .setDescription('Sessão finalizada com sucesso! Obrigado por jogar conosco! 🎮')
        .setColor(0x00ff00)
        .addFields(
          {
            name: '👤 Usuário',
            value: interaction.user.displayName,
            inline: true,
          },
          {
            name: '⏰ Início da Sessão',
            value: `<t:${Math.floor(sessionStart.getTime() / 1000)}:F>`,
            inline: true,
          },
          {
            name: '🏁 Fim da Sessão',
            value: `<t:${Math.floor(sessionEnd.getTime() / 1000)}:F>`,
            inline: true,
          },
          {
            name: '⏱️ Duração Total',
            value: formatDuration(durationHours, remainingMinutes),
            inline: true,
          },
          {
            name: '🎯 XP da Sessão',
            value: `+${sessionXP} XP`,
            inline: true,
          },
          {
            name: '🎁 Bônus de Tempo',
            value: bonusXP > 0 ? `+${bonusXP} XP` : 'Nenhum',
            inline: true,
          },
          {
            name: '🏆 XP Total Ganho',
            value: `**+${totalXP} XP**`,
            inline: false,
          },
          {
            name: '📊 XP Total',
            value: `${updatedUser.xp.toLocaleString()} XP`,
            inline: true,
          },
          {
            name: '🎮 Sessões Completadas',
            value: '0', // TODO: Implement sessions count
            inline: true,
          },
          {
            name: '⏰ Tempo Total de Jogo',
            value: formatTotalPlayTime(updatedUser.stats?.voiceTime || 0),
            inline: true,
          },
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      // Add session location info if available
      if (userSession.location) {
        successEmbed.addFields({
          name: '📍 Sessão',
          value: userSession.location,
          inline: false,
        });
      }

      // Add channel cleanup info
      if (channelCleanup.channelsRemoved > 0) {
        successEmbed.addFields({
          name: '🧹 Limpeza de Canais',
          value: `${channelCleanup.channelsRemoved} canal(is) removido(s) automaticamente`,
          inline: false,
        });
      }

      // Create action buttons
      const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`new_checkin_${userId}`)
          .setLabel('🎮 Novo Check-in')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('ranking_presence')
          .setLabel('🏆 Ver Ranking')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`profile_${userId}`)
          .setLabel('👤 Meu Perfil')
          .setStyle(ButtonStyle.Secondary),
      );

      const response = await interaction.editReply({
        embeds: [successEmbed],
        components: [actionButtons],
      });

      // Setup button collector
      setupButtonCollector(response, interaction as ChatInputCommandInteraction, userId);

      logger.info(`User ${userId} checked out successfully after ${durationMinutes} minutes`);
    } catch (error) {
      logger.error('Error in checkout command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro Interno')
        .setDescription(
          'Ocorreu um erro ao processar seu check-out. Tente novamente em alguns instantes.',
        )
        .setColor(0xff0000)
        .setTimestamp();

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  },
};

/**
 * Calculate XP based on session duration and type
 */
function calculateSessionXP(durationMinutes: number, sessionLocation: string): number {
  const baseXPPerMinute = 2;
  let multiplier = 1;

  // Determine session type from location
  const sessionType = getSessionTypeFromLocation(sessionLocation);

  const typeMultipliers: Record<string, number> = {
    mm: 1.0,
    scrim: 1.5,
    campeonato: 2.0,
    ranked: 1.8,
  };

  multiplier = typeMultipliers[sessionType] || 1.0;

  return Math.floor(durationMinutes * baseXPPerMinute * multiplier);
}

/**
 * Calculate bonus XP for long sessions
 */
function calculateBonusXP(durationMinutes: number): number {
  if (durationMinutes >= 180) {
    // 3+ hours
    return 100;
  } else if (durationMinutes >= 120) {
    // 2+ hours
    return 50;
  } else if (durationMinutes >= 60) {
    // 1+ hour
    return 25;
  }
  return 0;
}

/**
 * Extract session type from location string
 */
function getSessionTypeFromLocation(location: string): string {
  const lowerLocation = location.toLowerCase();
  if (lowerLocation.includes('mm') || lowerLocation.includes('matchmaking')) {
    return 'mm';
  }
  if (lowerLocation.includes('scrim')) {
    return 'scrim';
  }
  if (lowerLocation.includes('campeonato') || lowerLocation.includes('tournament')) {
    return 'campeonato';
  }
  if (lowerLocation.includes('ranked')) {
    return 'ranked';
  }
  return 'mm'; // default
}

/**
 * Format duration in hours and minutes
 */
function formatDuration(hours: number, minutes: number): string {
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
}

/**
 * Format total play time in a readable format
 */
function formatTotalPlayTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h ${minutes}min`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
}

/**
 * Clean up session channels if they're empty
 */
async function cleanupSessionChannels(
  interaction: ChatInputCommandInteraction,
  sessionLocation: string,
): Promise<{ channelsRemoved: number }> {
  try {
    const guild = interaction.guild!;
    let channelsRemoved = 0;

    // Find channels related to this session
    const channels = guild.channels.cache.filter((channel: any) => {
      if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildText) {
        const channelName = channel.name.toLowerCase();
        const sessionName = sessionLocation.toLowerCase();
        const userName = interaction.user.displayName.toLowerCase();

        // Check if channel name contains session info, user name, or was created by this user
        return (
          channelName.includes(sessionName) ||
          channelName.includes(userName) ||
          (channelName.startsWith('🔊') && channelName.includes(userName)) ||
          (channelName.startsWith('💬') &&
            sessionName &&
            channelName.includes(sessionName.replace(/\s+/g, '-')))
        );
      }
      return false;
    });

    for (const [, channel] of Array.from(channels)) {
      try {
        if (channel.type === ChannelType.GuildVoice) {
          const voiceChannel = channel as VoiceChannel;
          // Remove voice channel if empty
          if (voiceChannel.members.size === 0) {
            await voiceChannel.delete('Sessão finalizada - canal vazio');
            channelsRemoved++;
          }
        } else if (channel.type === ChannelType.GuildText) {
          const textChannel = channel as TextChannel;
          // For text channels, check if they were created recently (within last 24 hours) and have minimal activity
          const channelAge = Date.now() - textChannel.createdTimestamp;
          const isRecentChannel = channelAge < 24 * 60 * 60 * 1000; // 24 hours

          if (isRecentChannel) {
            const messages = await textChannel.messages.fetch({ limit: 10 });
            const userMessages = messages.filter((msg: any) => !msg.author.bot);

            // Remove if no user messages or only system messages
            if (userMessages.size <= 1) {
              // Allow for welcome message
              await textChannel.delete('Sessão finalizada - canal temporário');
              channelsRemoved++;
            }
          }
        }
      } catch (error) {
        console.error(`Error cleaning up channel ${channel.name}:`, error);
      }
    }

    // Clean up empty categories related to the session
    const categories = guild.channels.cache.filter((channel: any) => {
      if (channel.type === ChannelType.GuildCategory) {
        const categoryName = channel.name.toLowerCase();
        const sessionName = sessionLocation.toLowerCase();
        const userName = interaction.user.displayName.toLowerCase();

        // Check if category is related to this session or user
        return (
          categoryName.includes(sessionName) ||
          categoryName.includes(userName) ||
          categoryName.includes('sessão') ||
          categoryName.includes('session') ||
          categoryName.includes('🎮') ||
          categoryName.includes('🏆')
        );
      }
      return false;
    });

    for (const category of Array.from(categories.values())) {
      const categoryChannel = category as CategoryChannel;

      // Check if category is empty or only has bot-managed channels
      const activeChannels = categoryChannel.children.cache.filter((child: any) => {
        // Don't count channels that are about to be deleted or are system channels
        const childName = child.name.toLowerCase();
        return (
          !childName.includes('logs') &&
          !childName.includes('audit') &&
          !childName.includes('sistema')
        );
      });

      if (activeChannels.size === 0) {
        try {
          await categoryChannel.delete('Categoria vazia após finalização da sessão');
          channelsRemoved++;
        } catch (error) {
          console.error(`Erro ao remover categoria ${categoryChannel.name}:`, error);
        }
      }
    }

    return { channelsRemoved };
  } catch (error) {
    console.error('Error in channel cleanup:', error);
    return { channelsRemoved: 0 };
  }
}

/**
 * Check and award session-based badges
 */
async function checkSessionBadges(
  badgeService: BadgeService,
  userId: string,
  durationMinutes: number,
  totalSessions: number,
): Promise<void> {
  try {
    // Award duration-based badges
    if (durationMinutes >= 180) {
      // 3+ hours
      await badgeService.awardBadge(userId, 'marathon_gamer', false);
    } else if (durationMinutes >= 120) {
      // 2+ hours
      await badgeService.awardBadge(userId, 'dedicated_player', false);
    } else if (durationMinutes >= 60) {
      // 1+ hour
      await badgeService.awardBadge(userId, 'committed_gamer', false);
    }

    // Award session count badges
    if (totalSessions >= 100) {
      await badgeService.awardBadge(userId, 'session_master', false);
    } else if (totalSessions >= 50) {
      await badgeService.awardBadge(userId, 'session_veteran', false);
    } else if (totalSessions >= 10) {
      await badgeService.awardBadge(userId, 'regular_player', false);
    }
  } catch (error) {
    console.error('Error checking session badges:', error);
  }
}

/**
 * Setup button collector for interactive responses
 */
function setupButtonCollector(
  response: any,
  interaction: ChatInputCommandInteraction,
  userId: string,
): void {
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes
  });

  collector.on('collect', async (buttonInteraction: any) => {
    if (buttonInteraction.user.id !== userId) {
      await buttonInteraction.reply({
        content: '❌ Você não pode usar os botões de outro usuário!',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      if (buttonInteraction.customId === `new_checkin_${userId}`) {
        await buttonInteraction.reply({
          content:
            '🎮 Use o comando `/checkin` para iniciar uma nova sessão!\n\nEscolha o tipo de sessão e, se necessário, informe o nome da partida/evento.',
          flags: MessageFlags.Ephemeral,
        });
      } else if (buttonInteraction.customId === 'ranking_presence') {
        await buttonInteraction.reply({
          content: '🏆 Use o comando `/ranking presence` para ver o ranking completo de presença!',
          flags: MessageFlags.Ephemeral,
        });
      } else if (buttonInteraction.customId === `profile_${userId}`) {
        await buttonInteraction.reply({
          content: '👤 Use o comando `/profile` para ver suas estatísticas completas!',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error('Error handling button interaction:', error);
      await buttonInteraction.reply({
        content: '❌ Erro ao processar ação. Tente novamente.',
        flags: MessageFlags.Ephemeral,
      });
    }
  });

  collector.on('end', async () => {
    try {
      // Disable buttons after collector expires
      const expiredButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('expired')
          .setLabel('⏰ Botões Expirados')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      );

      await response.edit({ components: [expiredButtons] });
    } catch (error) {
      // Ignore errors when editing expired messages
    }
  });
}

export default checkout;
