import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  ChatInputCommandInteraction,
  CommandInteraction,
  MessageFlags,
  GuildMember,
  Guild,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { PUBGPlatform, PUBGGameMode, PUBGPlayer } from '../../types/pubg';
import { Logger } from '../../utils/logger';

const logger = new Logger();

const register: Command = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('🎮 Registra seu nick PUBG e plataforma para acessar o servidor')
    .addStringOption(option =>
      option
        .setName('nick')
        .setDescription('Seu nick exato no PUBG')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(16),
    )
    .addStringOption(option =>
      option
        .setName('platform')
        .setDescription('Plataforma onde você joga PUBG')
        .setRequired(true)
        .addChoices(
          { name: '🖥️ Steam (PC)', value: 'steam' },
          { name: '🎮 Xbox', value: 'xbox' },
          { name: '🎯 PlayStation', value: 'psn' },
          { name: '📱 Mobile', value: 'mobile' },
          { name: '🎮 Stadia', value: 'stadia' },
        ),
    )
    .setDMPermission(false) as SlashCommandBuilder,

  category: CommandCategory.PUBG,
  cooldown: 30,

  async execute(
    interaction: ChatInputCommandInteraction | CommandInteraction,
    client: ExtendedClient,
  ) {
    try {
      if (!interaction.isChatInputCommand()) {
        return;
      }

      const nick = interaction.options.getString('nick', true);
      const platform = interaction.options.getString('platform', true) as PUBGPlatform;

      if (!nick || !platform) {
        await interaction.reply({
          content: '❌ Parâmetros obrigatórios não fornecidos.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const guild = interaction.guild!;
      const member = guild.members.cache.get(interaction.user.id)!;

      // Verificar se o usuário já está registrado
      const existingUser = await client.database.client.user.findUnique({
        where: { id: interaction.user.id },
      });

      if (existingUser?.isVerified) {
        const alreadyRegisteredEmbed = new EmbedBuilder()
          .setTitle('✅ Já registrado')
          .setDescription(
            `Você já está registrado como **${existingUser.pubgUsername}** na plataforma **${getPlatformName(existingUser.pubgPlatform as PUBGPlatform)}**.`,
          )
          .setColor('#00FF00')
          .addFields(
            {
              name: '🎮 Dados atuais',
              value: `**Nick:** ${existingUser.pubgUsername}\n**Plataforma:** ${getPlatformName(existingUser.pubgPlatform as PUBGPlatform)}`,
              inline: false,
            },
            {
              name: '🔄 Quer atualizar?',
              value: 'Use o botão abaixo para atualizar seus dados de registro.',
              inline: false,
            },
          );

        const updateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('update_registration')
            .setLabel('Atualizar Registro')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄'),
        );

        const response = await interaction.reply({
          embeds: [alreadyRegisteredEmbed],
          components: [updateRow],
          flags: MessageFlags.Ephemeral,
        });

        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 300000, // 5 minutes
        });

        collector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) {
            await i.reply({
              content: '❌ Apenas quem executou o comando pode usar este botão.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          if (i.customId === 'update_registration') {
            await i.update({ components: [] });
            await performRegistration(interaction, client, nick, platform, true);
          }
        });

        collector.on('end', () => {
          interaction.editReply({ components: [] }).catch(() => {});
        });

        return;
      }

      // Executar o registro
      await performRegistration(interaction, client, nick, platform, false);
    } catch (error) {
      logger.error('Register command error:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro no registro')
        .setDescription(
          'Ocorreu um erro interno durante o registro. Tente novamente em alguns minutos.',
        )
        .setColor('#FF0000')
        .setFooter({ text: 'Se o problema persistir, contate um administrador' });

      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
  },
};

async function performRegistration(
  interaction: ChatInputCommandInteraction | CommandInteraction,
  client: ExtendedClient,
  nick: string,
  platform: PUBGPlatform,
  isUpdate: boolean,
) {
  try {
    // Validar nick PUBG
    const nickValidation = validatePUBGNick(nick);
    if (!nickValidation.valid) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Nick inválido')
        .setDescription(nickValidation.reason!)
        .setColor('#FF0000')
        .addFields({
          name: '📝 Formato correto',
          value:
            '• 3-16 caracteres\n• Apenas letras, números e underscore\n• Não pode começar ou terminar com underscore',
          inline: false,
        });

      await interaction.editReply({ embeds: [errorEmbed], components: [] });
      return;
    }

    // Verificar se o nick já está em uso
    const existingNick = await client.database.client.user.findFirst({
      where: {
        pubgUsername: nick,
        pubgPlatform: platform,
        id: { not: interaction.user.id },
      },
    });

    if (existingNick) {
      const duplicateEmbed = new EmbedBuilder()
        .setTitle('❌ Nick já registrado')
        .setDescription(
          `O nick **${nick}** na plataforma **${getPlatformName(platform)}** já está registrado por outro usuário.`,
        )
        .setColor('#FF0000')
        .addFields({
          name: '💡 Dica',
          value:
            'Verifique se digitou seu nick corretamente ou se está usando a plataforma correta.',
          inline: false,
        });

      await interaction.editReply({ embeds: [duplicateEmbed], components: [] });
      return;
    }

    // Buscar dados do jogador na API do PUBG
    const loadingEmbed = new EmbedBuilder()
      .setTitle('🔍 Verificando dados...')
      .setDescription('Buscando suas estatísticas no PUBG. Isso pode levar alguns segundos.')
      .setColor('#0099FF')
      .setFooter({ text: 'Por favor, aguarde...' });

    await interaction.editReply({ embeds: [loadingEmbed], components: [] });

    // Verificar se o serviço PUBG está disponível
    if (!client.services?.pubg) {
      const serviceErrorEmbed = new EmbedBuilder()
        .setTitle('❌ Serviço indisponível')
        .setDescription(
          'O serviço PUBG está temporariamente indisponível. Tente novamente mais tarde.',
        )
        .setColor('#FF0000')
        .setFooter({ text: 'Contate um administrador se o problema persistir' });

      await interaction.editReply({ embeds: [serviceErrorEmbed], components: [] });
      return;
    }

    // Tentar buscar o jogador na API do PUBG
    const playerData: PUBGPlayer | null = await client.services.pubg.getPlayerByName(
      nick,
      platform,
    );

    if (!playerData) {
      await handlePlayerNotFound(interaction, client, nick, platform, isUpdate);
      return;
    }

    // Salvar dados do usuário
    const userData = await client.database.client.user.upsert({
      where: { id: interaction.user.id },
      update: {
        pubgUsername: nick,
        pubgPlatform: platform,
        isVerified: true,
        updatedAt: new Date(),
      },
      create: {
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator,
        pubgUsername: nick,
        pubgPlatform: platform,
        isVerified: true,
      },
    });

    // Salvar estatísticas PUBG
    if (playerData.stats?.gameModeStats) {
      const gameModes = Object.keys(playerData.stats.gameModeStats) as PUBGGameMode[];
      const primaryMode = gameModes.find(mode => mode === PUBGGameMode.SQUAD) || gameModes[0];
      const stats = primaryMode ? playerData.stats.gameModeStats[primaryMode] : null;

      if (stats && primaryMode) {
        try {
          await client.database.client.pUBGStats.upsert({
            where: {
              userId_seasonId_gameMode: {
                userId: interaction.user.id,
                seasonId: 'current',
                gameMode: primaryMode as string,
              },
            },
            update: {
              kills: Math.max(0, stats.kills || 0),
              deaths: Math.max(0, (stats.roundsPlayed || 0) - (stats.wins || 0)),
              assists: Math.max(0, stats.assists || 0),
              wins: Math.max(0, stats.wins || 0),
              top10s: Math.max(0, stats.top10s || 0),
              roundsPlayed: Math.max(0, stats.roundsPlayed || 0),
              damageDealt: Math.max(0, stats.damageDealt || 0),
              longestKill: Math.max(0, stats.longestKill || 0),
              headshotKills: Math.max(0, stats.headshotKills || 0),
              walkDistance: Math.max(0, stats.walkDistance || 0),
              rideDistance: Math.max(0, stats.rideDistance || 0),
              weaponsAcquired: Math.max(0, stats.weaponsAcquired || 0),
              boosts: Math.max(0, stats.boosts || 0),
              heals: Math.max(0, stats.heals || 0),
              revives: Math.max(0, stats.revives || 0),
              teamKills: Math.max(0, stats.teamKills || 0),
              timeSurvived: Math.max(0, stats.timeSurvived || 0),
              updatedAt: new Date(),
            },
            create: {
              userId: interaction.user.id,
              playerId: playerData.id,
              playerName: playerData.name,
              platform: platform,
              seasonId: 'current',
              gameMode: primaryMode as string,
              kills: stats.kills || 0,
              deaths: (stats.roundsPlayed || 0) - (stats.wins || 0),
              assists: stats.assists || 0,
              wins: stats.wins || 0,
              top10s: stats.top10s || 0,
              roundsPlayed: stats.roundsPlayed || 0,
              damageDealt: stats.damageDealt || 0,
              longestKill: stats.longestKill || 0,
              headshotKills: stats.headshotKills || 0,
              walkDistance: stats.walkDistance || 0,
              rideDistance: stats.rideDistance || 0,
              weaponsAcquired: stats.weaponsAcquired || 0,
              boosts: stats.boosts || 0,
              heals: stats.heals || 0,
              revives: stats.revives || 0,
              teamKills: stats.teamKills || 0,
              timeSurvived: stats.timeSurvived || 0,
              updatedAt: new Date(),
            },
          });
        } catch (error) {
          logger.error('Error saving PUBG stats:', error);
        }
      }
    }

    // Atribuir cargo baseado no rank
    const guild = interaction.guild;
    if (!guild) {
      logger.warn('Guild not found for rank role assignment');
    } else {
      const member = guild.members.cache.get(interaction.user.id);
      if (member && playerData.stats?.rankPointTitle) {
        await assignRankRole(member, playerData.stats.rankPointTitle, guild);
      }
    }

    // Embed de sucesso
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Registro concluído!')
      .setDescription(
        `Parabéns! Você foi registrado com sucesso como **${nick}** na plataforma **${getPlatformName(platform)}**.`,
      )
      .setColor('#00FF00')
      .addFields(
        {
          name: '🎮 Dados registrados',
          value: `**Nick:** ${nick}\n**Plataforma:** ${getPlatformName(platform)}`,
          inline: true,
        },
        {
          name: '🏆 Rank atual',
          value: playerData.stats?.rankPointTitle || 'Não classificado',
          inline: true,
        },
        {
          name: '📊 Estatísticas',
          value: `**Kills:** ${playerData.stats?.gameModeStats?.[PUBGGameMode.SQUAD]?.kills || 0}\n**Wins:** ${playerData.stats?.gameModeStats?.[PUBGGameMode.SQUAD]?.wins || 0}`,
          inline: true,
        },
      )
      .setFooter({ text: 'Agora você tem acesso completo ao servidor!' });

    await interaction.editReply({ embeds: [successEmbed], components: [] });

    logger.info(
      `User ${interaction.user.tag} registered as ${nick} on ${platform} in guild ${guild.name}`,
    );

    // Log de sucesso para o canal de logs da API
    if (client.services?.logging) {
      await client.services.logging.logApiOperation(
        interaction.guildId!,
        'PUBG',
        'PUBG Registration',
        true,
        undefined,
        `Registro PUBG concluído - Usuário: ${interaction.user.tag}, Nick: ${nick}, Plataforma: ${getPlatformName(platform)}`,
        {
          userId: interaction.user.id,
          nick,
          platform: getPlatformName(platform),
          rank: playerData.stats?.rankPointTitle || 'Não classificado',
        },
      );
    }

    // Atualizar progresso de badges
    if (client.services?.badge) {
      await client.services.badge.updateProgress(interaction.user.id, 'registration', 1);
    }
  } catch (error) {
    logger.error('PUBG API error during registration:', error);
    await handleRegistrationError(interaction, client, nick, platform, isUpdate, error);
  }
}

async function handlePlayerNotFound(
  interaction: ChatInputCommandInteraction | CommandInteraction,
  client: ExtendedClient,
  nick: string,
  platform: PUBGPlatform,
  isUpdate: boolean,
) {
  const notFoundEmbed = new EmbedBuilder()
    .setTitle('❌ Jogador não encontrado')
    .setDescription(
      `Não foi possível encontrar o jogador **${nick}** na plataforma **${getPlatformName(platform)}**.`,
    )
    .setColor('#FF0000')
    .addFields(
      {
        name: '🔍 Verifique',
        value:
          '• Se o nick está correto\n• Se a plataforma está correta\n• Se o perfil não é privado\n• Se você jogou recentemente',
        inline: false,
      },
      {
        name: '⚠️ Importante',
        value:
          'Seu perfil PUBG deve ser público e você deve ter jogado pelo menos uma partida recentemente.',
        inline: false,
      },
    )
    .setFooter({ text: 'Tente novamente após verificar os dados' });

  const retryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('retry_registration')
      .setLabel('Tentar Novamente')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId('manual_verification')
      .setLabel('Verificação Manual')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👤'),
  );

  const response = await interaction.editReply({
    embeds: [notFoundEmbed],
    components: [retryRow],
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes
  });

  collector.on('collect', async i => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({
        content: '❌ Apenas quem executou o comando pode usar este botão.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (i.customId === 'retry_registration') {
      await i.update({ components: [] });
      await performRegistration(interaction, client, nick, platform, isUpdate);
    } else if (i.customId === 'manual_verification') {
      await i.update({ components: [] });
      await requestManualVerification(interaction, client, nick, platform);
    }
  });

  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}

async function handleRegistrationError(
  interaction: ChatInputCommandInteraction | CommandInteraction,
  client: ExtendedClient,
  nick: string,
  platform: PUBGPlatform,
  isUpdate: boolean,
  error: any,
) {
  // Log detalhado para o canal de logs da API
  if (client.services?.logging) {
    await client.services.logging.logApiOperation(
      interaction.guildId!,
      'PUBG',
      'PUBG Registration',
      false,
      error instanceof Error ? error.message : String(error),
      `Erro no registro PUBG - Usuário: ${interaction.user.tag}, Nick: ${nick}, Plataforma: ${platform}`,
      {
        userId: interaction.user.id,
        nick,
        platform,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      },
    );
  }

  const apiErrorEmbed = new EmbedBuilder()
    .setTitle('⚠️ Erro na verificação')
    .setDescription(
      'Ocorreu um erro ao verificar seus dados no PUBG. Você pode tentar novamente ou solicitar verificação manual.',
    )
    .setColor('#FFA500')
    .addFields({
      name: '🔧 O que fazer?',
      value:
        '• Tente novamente em alguns minutos\n• Verifique se seus dados estão corretos\n• Solicite verificação manual se o problema persistir',
      inline: false,
    });

  const errorRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('retry_registration')
      .setLabel('Tentar Novamente')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId('manual_verification')
      .setLabel('Verificação Manual')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👤'),
  );

  const response = await interaction.editReply({
    embeds: [apiErrorEmbed],
    components: [errorRow],
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes
  });

  collector.on('collect', async i => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({
        content: '❌ Apenas quem executou o comando pode usar este botão.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (i.customId === 'retry_registration') {
      await i.update({ components: [] });
      await performRegistration(interaction, client, nick, platform, isUpdate);
    } else if (i.customId === 'manual_verification') {
      await i.update({ components: [] });
      await requestManualVerification(interaction, client, nick, platform);
    }
  });

  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}

async function requestManualVerification(
  interaction: ChatInputCommandInteraction | CommandInteraction,
  client: ExtendedClient,
  nick: string,
  platform: PUBGPlatform,
) {
  // Criar ticket para verificação manual
  const ticketEmbed = new EmbedBuilder()
    .setTitle('🎫 Verificação Manual Solicitada')
    .setDescription('Sua solicitação de verificação manual foi enviada para os administradores.')
    .setColor('#0099FF')
    .addFields(
      {
        name: '📝 Dados informados',
        value: `**Nick:** ${nick}\n**Plataforma:** ${getPlatformName(platform)}`,
        inline: false,
      },
      {
        name: '⏰ Próximos passos',
        value:
          'Um administrador irá verificar seus dados manualmente e liberar seu acesso em breve.',
        inline: false,
      },
    )
    .setFooter({ text: 'Aguarde a verificação manual' });

  await interaction.editReply({ embeds: [ticketEmbed], components: [] });

  // Salvar dados temporários para verificação manual
  await client.database.client.user.upsert({
    where: { id: interaction.user.id },
    update: {
      pubgUsername: nick,
      pubgPlatform: platform,
      isVerified: false,
      updatedAt: new Date(),
    },
    create: {
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator,
      pubgUsername: nick,
      pubgPlatform: platform,
      isVerified: false,
    },
  });
}

/**
 * Validate PUBG nickname format
 */
function validatePUBGNick(nick: string): { valid: boolean; reason?: string } {
  if (nick.length < 3 || nick.length > 16) {
    return { valid: false, reason: 'O nick deve ter entre 3 e 16 caracteres.' };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(nick)) {
    return {
      valid: false,
      reason: 'O nick pode conter apenas letras, números e underscore (_).',
    };
  }

  if (nick.startsWith('_') || nick.endsWith('_')) {
    return {
      valid: false,
      reason: 'O nick não pode começar ou terminar com underscore (_).',
    };
  }

  return { valid: true };
}

/**
 * Get platform display name
 */
function getPlatformName(platform: PUBGPlatform): string {
  const platformNames: Record<PUBGPlatform, string> = {
    [PUBGPlatform.STEAM]: 'Steam (PC)',
    [PUBGPlatform.XBOX]: 'Xbox',
    [PUBGPlatform.PSN]: 'PlayStation',
    [PUBGPlatform.STADIA]: 'Stadia',
    [PUBGPlatform.KAKAO]: 'Kakao',
  };

  return platformNames[platform] || platform;
}

/**
 * Assign rank role based on PUBG tier
 */
async function assignRankRole(member: GuildMember, tier: string, guild: Guild): Promise<void> {
  try {
    // Remove existing rank roles
    const rankKeywords = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'];
    const rankRoles = guild.roles.cache.filter(role =>
      rankKeywords.some(keyword => role.name.includes(keyword)),
    );

    if (rankRoles.size > 0) {
      await member.roles.remove(rankRoles);
    }

    // Add new rank role
    const newRankRole = guild.roles.cache.find(role => role.name.includes(tier));
    if (newRankRole) {
      await member.roles.add(newRankRole);
      logger.info(`Assigned rank role ${newRankRole.name} to user ${member.user.tag}`);
    } else {
      logger.warn(`Rank role for tier ${tier} not found in guild ${guild.name}`);
    }
  } catch (error) {
    logger.error('Error assigning rank role:', error);
  }
}

export default register;
