import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  CommandInteraction,
  ChannelType,
  CategoryChannel,
  VoiceChannel,
  TextChannel,
  PermissionFlagsBits,
  ComponentType,
  MessageFlags,
  EmbedBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonBuilder,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { PresenceService } from '../../services/presence.service';
import { BadgeService } from '../../services/badge.service';
import { DatabaseService } from '../../database/database.service';
import { PresenceEnhancementsService } from '../../services/presence-enhancements.service';
import { getChannelConfig, formatCleanupTime } from '../../config/channels.config.js';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';
import { HawkComponentFactory } from '../../utils/hawk-component-factory';
import { HAWK_EMOJIS } from '../../constants/hawk-emojis';
import { BaseCommand } from '../../utils/base-command.util';

const logger = new Logger();

class CheckinCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('checkin')
        .setDescription(`${HAWK_EMOJIS.GAMING.CONTROLLER} Fazer check-in para iniciar uma sessão de presença`)
        .addStringOption(option =>
          option
            .setName('tipo')
            .setDescription('Tipo de sessão')
            .setRequired(true)
            .addChoices(
              { name: `${HAWK_EMOJIS.GAMING.GAME} Matchmaking (MM)`, value: 'mm' },
              { name: `${HAWK_EMOJIS.GAMING.CONTROLLER} Scrim`, value: 'scrim' },
              { name: `${HAWK_EMOJIS.TROPHY} Campeonato`, value: 'campeonato' },
              { name: `${HAWK_EMOJIS.MEDAL} Ranked`, value: 'ranked' },
            ),
        )
        .addStringOption(option =>
          option
            .setName('nome')
            .setDescription('Nome da partida/evento (obrigatório para scrim e campeonato)')
            .setRequired(false)
            .setMaxLength(50),
        ) as SlashCommandBuilder,
      category: CommandCategory.GENERAL,
      cooldown: 10,
    });
  }

  async execute(
    interaction: CommandInteraction | ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void> {
    if (!interaction.isChatInputCommand()) {return;}

    await interaction.deferReply();

    try {
      const tipo = interaction.options.getString('tipo', true);
      const nome = interaction.options.getString('nome');
      const userId = interaction.user.id;
      const guildId = interaction.guild!.id;

      // Validate required name for certain session types
      if ((tipo === 'scrim' || tipo === 'campeonato') && !nome) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Nome Obrigatório')
          .setDescription(
            `Para sessões de **${this.getTipoDisplayName(tipo)}**, é obrigatório informar um nome.`,
          )
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Check if user is registered
      const databaseService = new DatabaseService();
      const user = await databaseService.client.user.findUnique({
        where: { id: userId },
        include: { stats: true },
      });

      if (!user) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Usuário Não Registrado')
          .setDescription(
            'Você precisa estar registrado para usar este comando.\n\n' +
              'Use `/register` para se registrar primeiro.',
          )
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }

      // Try to use enhanced presence service first, fallback to regular service
      let presenceService: PresenceService | PresenceEnhancementsService;
      let pubgValidation: any = null;

      try {
        const presenceEnhancementsService = new PresenceEnhancementsService(client);
        const enhancedResult = await presenceEnhancementsService.enhancedCheckIn(
          guildId,
          userId,
          tipo,
          nome || undefined,
        );

        if (!enhancedResult.success) {
          throw new Error(enhancedResult.message);
        }

        pubgValidation = enhancedResult.validation;
        presenceService = presenceEnhancementsService;
      } catch (enhancedError) {
        logger.warn('Enhanced presence service failed, falling back to regular service:', enhancedError);
        presenceService = new PresenceService(client);
        const regularResult = await presenceService.checkIn(guildId, userId, tipo, nome || undefined);

        if (!regularResult.success) {
          throw new Error(regularResult.message);
        }
      }

      // Create session channels
      const sessionName = this.getTipoDisplayName(tipo);
      const channelResult = await this.createSessionChannels(interaction, tipo, sessionName, nome);

      // Calculate and award XP
      const baseXP = this.calculateSessionXP(tipo);
      let actualXP = baseXP;

      // Apply PUBG bonus if validation is successful
      if (pubgValidation?.isValid) {
        const pubgBonus = Math.floor(baseXP * 0.5); // 50% bonus for valid PUBG integration
        actualXP += pubgBonus;
      }

      // Update user XP and streak
        const currentStreak = user.dailyStreak || 0;
        await databaseService.client.user.update({
            where: { id: userId },
            data: {
                xp: user.xp + actualXP,
                totalXp: user.totalXp + actualXP,
                dailyStreak: currentStreak + 1,
                lastSeen: new Date(),
            },
            include: { stats: true },
        });

      // Update user stats separately
      await databaseService.client.userStats.upsert({
        where: { userId },
        update: {
          checkIns: { increment: 1 },
        },
        create: {
          userId,
          checkIns: 1,
          commandsUsed: 0,
          messagesCount: 0,
          voiceTime: 0,
          gamesPlayed: 0,
          quizzesCompleted: 0,
          clipsUploaded: 0,
        },
      });

      // Check for presence-related badges
      const badgeService = new BadgeService(client, (client as any).services?.xp, (client as any).services?.logging);
      await this.checkPresenceBadges(badgeService, userId, tipo);

      // Create success embed
      const successEmbed = await this.createSuccessEmbed(
        interaction,
        tipo,
        nome,
        actualXP,
        baseXP,
        currentStreak,
        pubgValidation,
        channelResult,
      );

      // Create action buttons
      const { actionButtons, secondaryButtons } = this.createActionButtons(userId);

      const response = await interaction.editReply({
        embeds: [successEmbed],
        components: [actionButtons, secondaryButtons],
      });

      // Setup button collector
      this.setupButtonCollector(
        response,
        interaction,
        presenceService,
        userId,
        guildId,
        channelResult,
      );

      logger.info(`User ${userId} checked in successfully for ${tipo} session`);
    } catch (error) {
      logger.error('Error in checkin command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro Interno')
        .setDescription(
          'Ocorreu um erro ao processar seu check-in. Tente novamente em alguns instantes.',
        )
        .setColor(0xff0000)
        .setTimestamp();

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }

  private getTipoDisplayName(tipo: string): string {
    const displayNames: Record<string, string> = {
      mm: '🎯 Matchmaking',
      scrim: '⚔️ Scrim',
      campeonato: '🏆 Campeonato',
      ranked: '🎖️ Ranked',
    };
    return displayNames[tipo] || tipo;
  }

  private calculateSessionXP(tipo: string): number {
    const xpValues: Record<string, number> = {
      mm: 25,
      scrim: 50,
      campeonato: 100,
      ranked: 75,
    };
    return xpValues[tipo] || 25;
  }

  private async createSessionChannels(
    interaction: ChatInputCommandInteraction,
    tipo: string,
    sessionName: string,
    nome?: string,
  ): Promise<{ voiceChannel?: VoiceChannel; textChannel?: TextChannel }> {
    try {
      const guild = interaction.guild!;
      const member = interaction.member!;

      // Find or create category
      let category: CategoryChannel | null = null;
      const categoryName = tipo === 'mm' ? '🎯 Matchmaking' : `🎮 ${sessionName}`;

      category =
        guild.channels.cache.find(
          (channel): channel is CategoryChannel =>
            channel.type === ChannelType.GuildCategory && channel.name === categoryName,
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
        : tipo === 'mm'
          ? `🔊 ${interaction.user.displayName}`
          : `🔊 ${sessionName}`;

      const voiceChannel = await guild.channels.create({
        name: voiceChannelName,
        type: ChannelType.GuildVoice,
        parent: category,
        userLimit: config.maxUsers || 10,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
            ],
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
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
        });

        // Send welcome message in text channel
        const welcomeEmbed = new EmbedBuilder()
          .setTitle(`🎮 ${nome || sessionName}`)
          .setDescription(
            `Canal criado para a sessão de **${this.getTipoDisplayName(tipo)}**\n\nBoa sorte e divirtam-se! 🎯`,
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await textChannel.send({ embeds: [welcomeEmbed] });
      }

      // Schedule automatic cleanup for temporary channels
      this.scheduleChannelCleanup(voiceChannel, textChannel, tipo);

      return { voiceChannel, textChannel };
    } catch (error) {
      console.error('Error creating session channels:', error);
      return {};
    }
  }

  private async createSuccessEmbed(
    interaction: ChatInputCommandInteraction,
    tipo: string,
    nome: string | null,
    actualXP: number,
    baseXP: number,
    currentStreak: number,
    pubgValidation: any,
    channelResult: { voiceChannel?: VoiceChannel; textChannel?: TextChannel },
  ): Promise<EmbedBuilder> {
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Check-in Realizado!')
      .setDescription(`Sessão de **${this.getTipoDisplayName(tipo)}** iniciada com sucesso!`)
      .setColor(0x00ff00)
      .addFields(
        {
          name: '👤 Usuário',
          value: interaction.user.displayName,
          inline: true,
        },
        {
          name: '🎮 Tipo de Sessão',
          value: this.getTipoDisplayName(tipo),
          inline: true,
        },
        {
          name: '⏰ Início',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true,
        },
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    if (nome) {
      successEmbed.addFields({
        name: '📝 Nome da Sessão',
        value: nome,
        inline: false,
      });
    }

    successEmbed.addFields(
      {
        name: '🎯 XP Ganho',
        value: `+${actualXP} XP${actualXP > baseXP ? ` (${baseXP} base + ${actualXP - baseXP} bônus PUBG)` : ''}`,
        inline: true,
      },
      {
        name: '🔥 Streak Atual',
        value: `${currentStreak} dias`,
        inline: true,
      },
    );

    // Add PUBG validation info if available
    if (pubgValidation) {
      const validationEmoji = pubgValidation.isValid ? '✅' : '❌';
      const validationText = pubgValidation.isValid ? 'Válida' : 'Inválida';

      successEmbed.addFields({
        name: '🎮 Integração PUBG',
        value: `${validationEmoji} ${validationText}${pubgValidation.pubgUsername ? ` (${pubgValidation.pubgUsername})` : ''}`,
        inline: true,
      });

      if (pubgValidation.isValid && pubgValidation.stats) {
        successEmbed.addFields({
          name: '📊 Stats PUBG',
          value: [
            `**KDA:** ${pubgValidation.stats.kda.toFixed(2)}`,
            `**Rank:** ${pubgValidation.stats.rank}`,
            `**Vitórias:** ${pubgValidation.stats.wins}`,
          ].join(' | '),
          inline: false,
        });
      }

      if (!pubgValidation.isValid && pubgValidation.validationErrors?.length) {
        successEmbed.addFields({
          name: '⚠️ Aviso PUBG',
          value: pubgValidation.validationErrors[0],
          inline: false,
        });
      }
    }

    if (channelResult.voiceChannel) {
      successEmbed.addFields({
        name: '🔊 Canal de Voz',
        value: `<#${channelResult.voiceChannel.id}>`,
        inline: true,
      });
    }

    if (channelResult.textChannel) {
      successEmbed.addFields({
        name: '💬 Canal de Texto',
        value: `<#${channelResult.textChannel.id}>`,
        inline: true,
      });
    }

    return successEmbed;
  }

  private createActionButtons(userId: string): {
    actionButtons: ActionRowBuilder<ButtonBuilder>;
    secondaryButtons: ActionRowBuilder<ButtonBuilder>;
  } {
    const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
        .setStyle(ButtonStyle.Primary),
    );

    const secondaryButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('ranking_presence')
        .setLabel('🏆 Ver Ranking')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`session_info_${userId}`)
        .setLabel('📊 Info da Sessão')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`session_participants_${userId}`)
        .setLabel('👤 Participantes')
        .setStyle(ButtonStyle.Secondary),
    );

    return { actionButtons, secondaryButtons };
  }

  private async checkPresenceBadges(
    badgeService: BadgeService,
    userId: string,
    tipo: string,
  ): Promise<void> {
    try {
      // Award first check-in badge
      await badgeService.awardBadge(userId, 'first_checkin', false);

      // Award type-specific badges
      const typeBadges: Record<string, string> = {
        mm: 'mm_player',
        scrim: 'scrim_warrior',
        campeonato: 'tournament_fighter',
        ranked: 'ranked_grinder',
      };

      if (typeBadges[tipo]) {
        await badgeService.awardBadge(userId, typeBadges[tipo], false);
      }
    } catch (error) {
      console.error('Error checking presence badges:', error);
    }
  }

  private setupButtonCollector(
    response: any,
    interaction: ChatInputCommandInteraction,
    presenceService: PresenceService | PresenceEnhancementsService,
    userId: string,
    guildId: string,
    channelResult: { voiceChannel?: VoiceChannel; textChannel?: TextChannel },
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
        'ranking_presence',
      ];

      const isOwnerOnly = !allowedForAll.some(id =>
        buttonInteraction.customId.includes(id.replace(`_${userId}`, '')),
      );

      if (isOwnerOnly && buttonInteraction.user.id !== userId) {
        await buttonInteraction.reply({
          content: '❌ Você não pode usar os botões de outro usuário!',
          ephemeral: true,
        });
        return;
      }

      try {
        await this.handleButtonInteraction(
          buttonInteraction,
          presenceService,
          userId,
          guildId,
          channelResult,
          response,
        );
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

  private async handleButtonInteraction(
    buttonInteraction: any,
    presenceService: PresenceService | PresenceEnhancementsService,
    userId: string,
    guildId: string,
    channelResult: { voiceChannel?: VoiceChannel; textChannel?: TextChannel },
    response: any,
  ): Promise<void> {
    if (buttonInteraction.customId === `checkout_${userId}`) {
      await this.handleCheckoutButton(buttonInteraction, presenceService, userId, guildId, response);
    } else if (buttonInteraction.customId === `invite_players_${userId}`) {
      await this.handleInvitePlayersButton(buttonInteraction, channelResult);
    } else if (buttonInteraction.customId === `confirm_presence_${userId}`) {
      await this.handleConfirmPresenceButton(buttonInteraction, channelResult);
    } else if (buttonInteraction.customId === `session_participants_${userId}`) {
      await this.handleSessionParticipantsButton(buttonInteraction, channelResult);
    } else if (buttonInteraction.customId === 'ranking_presence') {
      await this.handleRankingPresenceButton(buttonInteraction);
    } else if (buttonInteraction.customId === `session_info_${userId}`) {
      await this.handleSessionInfoButton(buttonInteraction);
    }
  }

  private async handleCheckoutButton(
    buttonInteraction: any,
    presenceService: PresenceService | PresenceEnhancementsService,
    userId: string,
    guildId: string,
    response: any,
  ): Promise<void> {
    let checkoutResult;
    if ('enhancedCheckOut' in presenceService) {
      checkoutResult = await presenceService.enhancedCheckOut(guildId, userId, 'Checkout via botão');
    } else {
      checkoutResult = await presenceService.checkOut(guildId, userId, 'Checkout via botão');
    }

    const embed = new EmbedBuilder()
      .setTitle(checkoutResult.success ? '✅ Check-out Realizado' : '❌ Erro no Check-out')
      .setDescription(checkoutResult.message)
      .setColor(checkoutResult.success ? 0x00ff00 : 0xff0000)
      .setTimestamp();

    await buttonInteraction.reply({ embeds: [embed], ephemeral: true });

    if (checkoutResult.success) {
      // Disable buttons after successful checkout
      const disabledButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('checkout_disabled')
          .setLabel('✅ Check-out Realizado')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
      );

      await response.edit({ components: [disabledButtons] });
    }
  }

  private async handleInvitePlayersButton(
    buttonInteraction: any,
    channelResult: { voiceChannel?: VoiceChannel; textChannel?: TextChannel },
  ): Promise<void> {
    const inviteEmbed = new EmbedBuilder()
      .setTitle('👥 Convidar Jogadores')
      .setDescription(
        '**Como convidar jogadores para a sessão:**\n\n' +
          `🔊 **Canal de Voz:** ${channelResult.voiceChannel ? `<#${channelResult.voiceChannel.id}>` : 'Não disponível'}\n` +
          `💬 **Canal de Texto:** ${channelResult.textChannel ? `<#${channelResult.textChannel.id}>` : 'Não disponível'}\n\n` +
          '📋 **Instruções:**\n' +
          '• Compartilhe os links dos canais com seus amigos\n' +
          '• Eles podem entrar diretamente nos canais\n' +
          '• Use o botão "✅ Confirmar Presença" quando chegarem\n' +
          '• O criador da sessão pode fazer check-out por todos',
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await buttonInteraction.reply({ embeds: [inviteEmbed], flags: MessageFlags.Ephemeral });
  }

  private async handleConfirmPresenceButton(
    buttonInteraction: any,
    channelResult: { voiceChannel?: VoiceChannel; textChannel?: TextChannel },
  ): Promise<void> {
    const confirmingUser = buttonInteraction.user;
    const isInVoiceChannel = channelResult.voiceChannel?.members.has(confirmingUser.id);

    if (!isInVoiceChannel) {
      await buttonInteraction.reply({
        content: `❌ Você precisa estar no canal de voz ${channelResult.voiceChannel ? `<#${channelResult.voiceChannel.id}>` : ''} para confirmar presença!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const confirmEmbed = new EmbedBuilder()
      .setTitle('✅ Presença Confirmada!')
      .setDescription(
        `${confirmingUser.displayName} confirmou presença na sessão!\n\n` +
          `⏰ **Confirmado em:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
          `🔊 **Canal:** ${channelResult.voiceChannel ? `<#${channelResult.voiceChannel.id}>` : 'N/A'}\n\n` +
          '💡 **Lembre-se:** Faça check-out quando sair para evitar penalidades!',
      )
      .setColor(0x00ff00)
      .setThumbnail(confirmingUser.displayAvatarURL())
      .setTimestamp();

    await buttonInteraction.reply({ embeds: [confirmEmbed], flags: MessageFlags.Ephemeral });

    // Notify in text channel if available
    if (channelResult.textChannel) {
      const notificationEmbed = new EmbedBuilder()
        .setDescription(`✅ ${confirmingUser.displayName} confirmou presença na sessão!`)
        .setColor(0x00ff00)
        .setTimestamp();

      await channelResult.textChannel.send({ embeds: [notificationEmbed] });
    }
  }

  private async handleSessionParticipantsButton(
    buttonInteraction: any,
    channelResult: { voiceChannel?: VoiceChannel; textChannel?: TextChannel },
  ): Promise<void> {
    const voiceMembers = channelResult.voiceChannel?.members;
    const participantsList =
      voiceMembers?.map(member => `• ${member.displayName}`).join('\n') ||
      'Nenhum participante no canal de voz';

    const participantsEmbed = new EmbedBuilder()
      .setTitle('👤 Participantes da Sessão')
      .setDescription(
        `**Canal de Voz:** ${channelResult.voiceChannel ? `<#${channelResult.voiceChannel.id}>` : 'N/A'}\n\n` +
          `**Participantes Ativos (${voiceMembers?.size || 0}):**\n${participantsList}\n\n` +
          '💡 **Dica:** Use "✅ Confirmar Presença" para registrar sua participação!',
      )
      .setColor(0x3498db)
      .setTimestamp();

    await buttonInteraction.reply({ embeds: [participantsEmbed], flags: MessageFlags.Ephemeral });
  }

  private async handleRankingPresenceButton(buttonInteraction: any): Promise<void> {
    await buttonInteraction.reply({
      content: '🏆 Use o comando `/ranking presence` para ver o ranking completo de presença!',
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleSessionInfoButton(buttonInteraction: any): Promise<void> {
    const sessionStart = Math.floor(Date.now() / 1000);
    const infoEmbed = new EmbedBuilder()
      .setTitle('📊 Informações da Sessão')
      .setDescription('Detalhes da sua sessão ativa')
      .addFields(
        { name: '⏰ Início', value: `<t:${sessionStart}:F>`, inline: true },
        { name: '⏱️ Duração', value: `<t:${sessionStart}:R>`, inline: true },
        { name: '🎮 Status', value: '🟢 Ativa', inline: true },
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await buttonInteraction.reply({ embeds: [infoEmbed], ephemeral: true });
  }

  private scheduleChannelCleanup(
    voiceChannel: VoiceChannel,
    textChannel?: TextChannel,
    tipo?: string,
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
}

const commandInstance = new CheckinCommand();

export const command = {
  data: commandInstance.data,
  category: commandInstance.category,
  cooldown: commandInstance.cooldown,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) => 
    commandInstance.execute(interaction, client),
};

export default command;

// Export class for testing
export { CheckinCommand };
