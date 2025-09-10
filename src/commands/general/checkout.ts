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
import { BaseCommand } from '../../utils/base-command.util';

const logger = new Logger();

class CheckoutCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('checkout')
        .setDescription('🚪 Fazer check-out para finalizar sua sessão de presença ativa'),
      category: CommandCategory.GENERAL,
      cooldown: 5, // 5 seconds cooldown
    });
  }

  async execute(
    interaction: CommandInteraction | ChatInputCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    await interaction.deferReply();

    const userId = interaction.user.id;

    // Initialize services
    const databaseService = new DatabaseService();
    const presenceService = new PresenceService(client);
    const presenceEnhancementsService = new PresenceEnhancementsService(client);
    const badgeService = new BadgeService(
      client,
      (client as any).services?.xp,
      (client as any).services?.logging
    );

    try {
      // Check if user is registered
      const user = await databaseService.client.user.findUnique({
        where: { id: userId },
        include: { stats: true },
      });
      if (!user) {
        const notRegisteredEmbed = new EmbedBuilder()
          .setTitle('❌ Usuário Não Registrado')
          .setDescription(
            'Você precisa estar registrado para usar este comando.\n\nUse `/register` para se registrar.'
          )
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [notRegisteredEmbed] });
        return;
      }

      // Check if user has an active session
      const userSession = await presenceService.getActiveSession(interaction.guildId!, userId);
      if (!userSession) {
        const noSessionEmbed = new EmbedBuilder()
          .setTitle('❌ Nenhuma Sessão Ativa')
          .setDescription(
            'Você não possui uma sessão de presença ativa.\n\nUse `/checkin` para iniciar uma nova sessão.'
          )
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [noSessionEmbed] });
        return;
      }

      // Calculate session duration
      const sessionStart = new Date(userSession.checkInTime);
      const sessionEnd = new Date();
      const durationMs = sessionEnd.getTime() - sessionStart.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;

      // Try to checkout using enhanced service first, fallback to regular service
      let checkoutResult;
      try {
        checkoutResult = await presenceEnhancementsService.enhancedCheckOut(
          interaction.guildId!,
          userId
        );
      } catch (enhancedError) {
        logger.warn('Enhanced checkout failed, falling back to regular service:', enhancedError);
        checkoutResult = await presenceService.checkOut(interaction.guildId!, userId);
      }

      if (!checkoutResult.success) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erro no Check-out')
          .setDescription(
            checkoutResult.message ||
              'Não foi possível finalizar sua sessão. Tente novamente em alguns instantes.'
          )
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Calculate XP rewards
      const sessionXP = this.calculateSessionXP(durationMinutes, userSession.location || '');
      const bonusXP = this.calculateBonusXP(durationMinutes);
      const totalXP = sessionXP + bonusXP;

      // Update user XP and stats
      const updatedUser = await databaseService.client.user.update({
        where: { id: userId },
        data: {
          xp: { increment: totalXP },
          totalXp: { increment: totalXP },
        },
        include: { stats: true },
      });

      // Update user stats separately
      await databaseService.client.userStats.upsert({
        where: { userId },
        update: {
          voiceTime: { increment: durationMinutes },
          checkIns: { increment: 1 },
        },
        create: {
          userId,
          voiceTime: durationMinutes,
          checkIns: 1,
        },
      });

      // Check for session-based badges
      await this.checkSessionBadges(
        badgeService,
        userId,
        durationMinutes,
        (user.stats?.checkIns || 0) + 1
      );

      // Clean up session channels
      const channelCleanup = await this.cleanupSessionChannels(
        interaction as ChatInputCommandInteraction,
        userSession.location || ''
      );

      // Create success embed
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Check-out Realizado com Sucesso!')
        .setDescription(
          `Sua sessão foi finalizada com sucesso!\n\n**Duração da Sessão:** ${this.formatDuration(hours, minutes)}`
        )
        .setColor(0x00ff00)
        .addFields(
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
            value: this.formatTotalPlayTime((user.stats?.voiceTime || 0) + durationMinutes),
            inline: true,
          }
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
          .setStyle(ButtonStyle.Secondary)
      );

      const response = await interaction.editReply({
        embeds: [successEmbed],
        components: [actionButtons],
      });

      // Setup button collector
      this.setupButtonCollector(response, interaction as ChatInputCommandInteraction, userId);

      logger.info(`User ${userId} checked out successfully after ${durationMinutes} minutes`);
    } catch (error) {
      logger.error('Error in checkout command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro Interno')
        .setDescription(
          'Ocorreu um erro ao processar seu check-out. Tente novamente em alguns instantes.'
        )
        .setColor(0xff0000)
        .setTimestamp();

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  }

  /**
   * Calculate XP based on session duration and type
   */
  private calculateSessionXP(durationMinutes: number, sessionLocation: string): number {
    const baseXPPerMinute = 2;
    let multiplier = 1;

    // Determine session type from location
    const sessionType = this.getSessionTypeFromLocation(sessionLocation);

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
  private calculateBonusXP(durationMinutes: number): number {
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
  private getSessionTypeFromLocation(location: string): string {
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
  private formatDuration(hours: number, minutes: number): string {
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  }

  /**
   * Format total play time in a readable format
   */
  private formatTotalPlayTime(totalMinutes: number): string {
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
  private async cleanupSessionChannels(
    interaction: ChatInputCommandInteraction,
    sessionLocation: string
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
  private async checkSessionBadges(
    badgeService: BadgeService,
    userId: string,
    durationMinutes: number,
    totalSessions: number
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
  private setupButtonCollector(
    response: any,
    interaction: ChatInputCommandInteraction,
    userId: string
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
            content:
              '🏆 Use o comando `/ranking presence` para ver o ranking completo de presença!',
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
            .setDisabled(true)
        );

        await response.edit({ components: [expiredButtons] });
      } catch (error) {
        // Ignore errors when editing expired messages
      }
    });
  }
}

const commandInstance = new CheckoutCommand();

export const command = {
  data: commandInstance.data,
  category: commandInstance.category,
  cooldown: commandInstance.cooldown,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;

// Export class for testing
export { CheckoutCommand };
