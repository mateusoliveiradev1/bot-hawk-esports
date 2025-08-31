import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageFlags,
  User,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { WeaponMasteryData, UserWeaponMastery } from '../../services/weapon-mastery.service';
import { Logger } from '../../utils/logger';

const logger = new Logger();

const weaponMastery: Command = {
  data: new SlashCommandBuilder()
    .setName('weapon-mastery')
    .setDescription('Visualizar maestria de armas PUBG')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('Ver sua maestria de armas')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Usuário para visualizar (opcional)')
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('sync').setDescription('Sincronizar maestria de armas com a API PUBG'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('Ver ranking de maestria de armas')
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Número de jogadores no ranking (1-20)')
            .setMinValue(1)
            .setMaxValue(20)
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('stats').setDescription('Ver estatísticas gerais de maestria de armas'),
    ) as SlashCommandBuilder,

  category: CommandCategory.PUBG,
  cooldown: 15,

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    if (!interaction.isCommand()) {return;}
    
    const subcommand = interaction.options.getSubcommand();

    try {
      // Verificar se o serviço de maestria de armas está disponível
      if (!client.services?.weaponMastery) {
        const serviceErrorEmbed = new EmbedBuilder()
          .setTitle('❌ Serviço indisponível')
          .setDescription('O serviço de maestria de armas está temporariamente indisponível.')
          .setColor('#FF0000')
          .setFooter({ text: 'Tente novamente mais tarde' });
        
        await interaction.reply({ embeds: [serviceErrorEmbed], flags: MessageFlags.Ephemeral });
        return;
      }

      switch (subcommand) {
        case 'view':
          await handleViewCommand(interaction, client);
          break;
        case 'sync':
          await handleSyncCommand(interaction, client);
          break;
        case 'leaderboard':
          await handleLeaderboardCommand(interaction, client);
          break;
        case 'stats':
          await handleStatsCommand(interaction, client);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      logger.error('Error in weapon-mastery command:', error);

      // Log detalhado para o canal de logs da API
      if (client.services?.logging) {
        await client.services.logging.logApiOperation(
          interaction.guildId!,
          'WeaponMastery',
          'weapon_mastery_command',
          false,
          error instanceof Error ? error.message : 'Erro desconhecido',
          undefined,
          {
            userId: interaction.user.id,
            command: 'weapon-mastery',
            subcommand,
          },
        );
      }

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro no comando')
        .setDescription('Ocorreu um erro ao executar o comando de maestria de armas.')
        .setColor('#FF0000')
        .addFields({
          name: '💡 Dicas',
          value:
            '• Verifique se sua conta PUBG está vinculada\n• Tente novamente em alguns minutos\n• Use `/register` se ainda não se registrou',
          inline: false,
        })
        .setFooter({ text: 'Se o problema persistir, contate um administrador' });

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  },
};

export default weaponMastery;

/**
 * Handle view subcommand
 */
async function handleViewCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
): Promise<void> {
  const targetUser: User = interaction.options.getUser('user') || interaction.user;
  const userId = targetUser.id;

  await interaction.deferReply();

  try {
    // Buscar dados do usuário no banco de dados
    const user = await client.database.client.user.findUnique({
      where: { id: userId },

    });

    if (!user || !user.pubgUsername) {
      const notFoundEmbed = new EmbedBuilder()
        .setTitle('❌ Usuário não encontrado')
        .setDescription(
          targetUser.id === interaction.user.id
            ? 'Você ainda não está registrado no sistema PUBG. Use `/register` primeiro.'
            : `${targetUser.username} não está registrado no sistema PUBG.`,
        )
        .setColor('#FF0000');

      await interaction.editReply({ embeds: [notFoundEmbed] });
      return;
    }

    // Buscar dados de maestria do usuário
    const masteryData = await client.weaponMasteryService.getUserWeaponMastery(user.id);

    if (!masteryData || masteryData.weapons.length === 0) {
      const noDataEmbed = new EmbedBuilder()
        .setTitle('📊 Dados não sincronizados')
        .setDescription(
          targetUser.id === interaction.user.id
            ? 'Você ainda não sincronizou sua maestria de armas. Use `/weapon-mastery sync` primeiro.'
            : `${targetUser.username} ainda não sincronizou a maestria de armas.`,
        )
        .setColor('#FFA500');

      await interaction.editReply({ embeds: [noDataEmbed] });
      return;
    }

    // Criar embed com dados de maestria
    const masteryEmbed = createMasteryEmbed(masteryData.weapons, targetUser);
    await interaction.editReply({ embeds: [masteryEmbed] });
  } catch (error) {
    logger.error('Error fetching user weapon mastery data:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro interno')
      .setDescription('Ocorreu um erro ao buscar os dados de maestria de armas.')
      .setColor('#FF0000');
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle sync subcommand
 */
async function handleSyncCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
): Promise<void> {
  const userId = interaction.user.id;

  try {
    // Buscar dados do usuário no banco de dados
    const user = await client.database.client.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.pubgUsername) {
      const notRegisteredEmbed = new EmbedBuilder()
        .setTitle('❌ Não registrado')
        .setDescription('Você precisa se registrar no PUBG primeiro. Use `/register`.') 
        .setColor('#FF0000');

      await interaction.reply({ embeds: [notRegisteredEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Mostrar embed de carregamento
    const loadingEmbed = new EmbedBuilder()
      .setTitle('🔄 Sincronizando...')
      .setDescription('Buscando dados de maestria de armas na API do PUBG...')
      .setColor('#FFA500');

    await interaction.reply({ embeds: [loadingEmbed] });

    try {
      // Buscar dados de maestria na API
      const masteryData = await client.services.weaponMastery.getUserWeaponMastery(
        user.id,
      );

      if (!masteryData || masteryData.weapons.length === 0) {
        const noDataEmbed = new EmbedBuilder()
          .setTitle('📊 Nenhum dado encontrado')
          .setDescription('Não foram encontrados dados de maestria de armas para sua conta.')
          .setColor('#FFA500');

        await interaction.editReply({ embeds: [noDataEmbed] });
        return;
      }

      // Sincronizar dados no banco de dados
      await client.services.weaponMastery.syncUserWeaponMastery(userId, user.pubgUsername);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Sincronização concluída')
        .setDescription(`Dados de maestria de ${masteryData.weapons.length} armas foram sincronizados com sucesso!`)
        .setColor('#00FF00');

      await interaction.editReply({ embeds: [successEmbed] });
    } catch (apiError) {
      logger.error('Error syncing weapon mastery:', apiError);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro na sincronização')
        .setDescription('Ocorreu um erro ao sincronizar os dados de maestria de armas.')
        .setColor('#FF0000');

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  } catch (error) {
    logger.error('Error in sync command:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro interno')
      .setDescription('Ocorreu um erro interno durante a sincronização.')
      .setColor('#FF0000');
    
    if (interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Handle leaderboard subcommand
 */
async function handleLeaderboardCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
): Promise<void> {
  const limit = Math.min(interaction.options.getInteger('limit') || 10, 20);

  await interaction.deferReply();

  try {
    // Verificar se o serviço de maestria de armas está disponível
    if (!client.services?.weaponMastery) {
      throw new Error('Weapon mastery service not available');
    }

    const leaderboard = await client.services.weaponMastery.getWeaponMasteryLeaderboard(limit);

    if (leaderboard.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('📊 Ranking de Maestria de Armas')
        .setDescription('Nenhum dado de maestria encontrado ainda.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#4caf50')
      .setTitle('🏆 Ranking de Maestria de Armas')
      .setDescription('Top jogadores por nível total de maestria')
      .setTimestamp();

    let description = '';
    const medals = ['🥇', '🥈', '🥉'];

    for (let i = 0; i < leaderboard.length; i++) {
      const player = leaderboard[i];
      const medal = medals[i] || `**${i + 1}.**`;

      description += `${medal} **${player?.pubgName || 'N/A'}**\n`;
      description += `├ Nível Total: **${player?.totalLevel || 0}**\n`;
      description += `├ XP Total: **${player?.totalXP?.toLocaleString() || '0'}**\n`;
      description += `├ Armas: **${player?.weaponCount || 0}**\n`;
      description += `└ Favorita: **${player?.favoriteWeapon || 'N/A'}**\n\n`;
    }

    embed.setDescription(description);
    embed.setFooter({ text: `Mostrando top ${leaderboard.length} jogadores` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error in leaderboard command:', error);

    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('❌ Erro')
      .setDescription('Não foi possível carregar o ranking de maestria de armas.')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

/**
 * Handle stats subcommand
 */
async function handleStatsCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
): Promise<void> {
  await interaction.deferReply();

  try {
    // Verificar se o serviço de maestria de armas está disponível
    if (!client.services?.weaponMastery) {
      throw new Error('Weapon mastery service not available');
    }

    const stats = await client.services.weaponMastery.getWeaponMasteryStats();

    const embed = new EmbedBuilder()
      .setColor('#2196f3')
      .setTitle('📊 Estatísticas de Maestria de Armas')
      .addFields(
        {
          name: '👥 Usuários',
          value: `**${stats.totalUsers || 0}** jogadores\n**${stats.totalWeapons || 0}** armas registradas`,
          inline: true,
        },
        {
          name: '📈 Médias',
          value: `**${(stats.averageLevel || 0).toFixed(1)}** nível médio por jogador`,
          inline: true,
        },
        {
          name: '🔫 Armas Populares',
          value:
            stats.topWeapons
              ?.slice(0, 5)
              ?.map(
                (weapon: any, index: number) =>
                  `**${index + 1}.** ${weapon.name} (${weapon.users} usuários)`,
              )
              ?.join('\n') || 'Nenhuma arma registrada',
          inline: false,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error in stats command:', error);

    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('❌ Erro')
      .setDescription('Não foi possível carregar as estatísticas de maestria de armas.')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

/**
 * Display weapon mastery with pagination
 */
async function displayWeaponMastery(
  interaction: ChatInputCommandInteraction,
  masteryData: UserWeaponMastery,
  targetUser: any,
): Promise<void> {
  const weaponsPerPage = 5;
  const totalPages = Math.ceil(masteryData.weapons.length / weaponsPerPage);
  let currentPage = 0;

  const generateEmbed = (page: number): EmbedBuilder => {
    const start = page * weaponsPerPage;
    const end = start + weaponsPerPage;
    const weaponsOnPage = masteryData.weapons.slice(start, end);

    const embed = new EmbedBuilder()
      .setColor('#4caf50')
      .setTitle(`🔫 Maestria de Armas - ${masteryData.pubgName}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields({
        name: '📊 Resumo Geral',
        value:
          `**Nível Total:** ${masteryData.totalLevel}\n` +
          `**XP Total:** ${masteryData.totalXP.toLocaleString()}\n` +
          `**Armas Dominadas:** ${masteryData.weapons.length}\n` +
          `**Arma Favorita:** ${masteryData.favoriteWeapon}`,
        inline: false,
      })
      .setFooter({
        text: `Página ${page + 1} de ${totalPages} • Última sincronização: ${masteryData.lastSyncAt.toLocaleDateString('pt-BR')}`,
      })
      .setTimestamp();

    // Add weapons on current page
    for (const weapon of weaponsOnPage) {
      const progressBar = createProgressBar(weapon.level, 100);
      const medalCount = weapon.medals.length;

      embed.addFields({
        name: `${getWeaponEmoji(weapon.weaponName)} ${weapon.weaponName}`,
        value:
          `**Nível:** ${weapon.level} ${progressBar}\n` +
          `**XP:** ${weapon.xp.toLocaleString()}\n` +
          `**Tier:** ${weapon.tier}\n` +
          `**Medalhas:** ${medalCount} 🏅`,
        inline: true,
      });
    }

    return embed;
  };

  const generateButtons = (page: number): ActionRowBuilder<ButtonBuilder> => {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('weapon_mastery_prev')
        .setLabel('◀️ Anterior')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('weapon_mastery_next')
        .setLabel('Próxima ▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1),
      new ButtonBuilder()
        .setCustomId('weapon_mastery_sync')
        .setLabel('🔄 Sincronizar')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(targetUser.id !== interaction.user.id),
    );
  };

  const embed = generateEmbed(currentPage);
  const buttons = generateButtons(currentPage);

  const message = await interaction.editReply({
    embeds: [embed],
    components: totalPages > 1 ? [buttons] : [],
  });

  if (totalPages <= 1) {
    return;
  }

  // Handle button interactions
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes
  });

  collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: '❌ Apenas quem executou o comando pode usar estes botões.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await buttonInteraction.deferUpdate();

    switch (buttonInteraction.customId) {
      case 'weapon_mastery_prev':
        currentPage = Math.max(0, currentPage - 1);
        break;
      case 'weapon_mastery_next':
        currentPage = Math.min(totalPages - 1, currentPage + 1);
        break;
      case 'weapon_mastery_sync':
        // Handle sync button
        await handleSyncFromButton(buttonInteraction, interaction.client as ExtendedClient);
        return;
    }

    const newEmbed = generateEmbed(currentPage);
    const newButtons = generateButtons(currentPage);

    await buttonInteraction.editReply({
      embeds: [newEmbed],
      components: [newButtons],
    });
  });

  collector.on('end', async () => {
    try {
      const disabledButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...buttons.components.map(button => ButtonBuilder.from(button).setDisabled(true)),
      );

      await interaction.editReply({
        components: [disabledButtons],
      });
    } catch (error) {
      // Ignore errors when disabling buttons (message might be deleted)
    }
  });
}

/**
 * Handle sync from button interaction
 */
async function handleSyncFromButton(
  buttonInteraction: ButtonInteraction,
  client: ExtendedClient,
): Promise<void> {
  const userId = buttonInteraction.user.id;

  try {
    // Get user from database
    const user = await client.database.client.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.pubgUsername) {
      await buttonInteraction.followUp({
        content: '❌ Você precisa vincular sua conta PUBG primeiro.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await buttonInteraction.followUp({
      content: '🔄 Sincronizando dados de maestria de armas...',
      flags: MessageFlags.Ephemeral,
    });

    // Force sync weapon mastery
    const synced = await (client as any).weaponMasteryService.forceSyncUserWeaponMastery(
      userId,
      user.pubgUsername,
    );

    if (synced) {
      await buttonInteraction.followUp({
        content:
          '✅ Dados sincronizados com sucesso! Use o comando novamente para ver as atualizações.',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await buttonInteraction.followUp({
        content: '❌ Falha na sincronização. Tente novamente mais tarde.',
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error('Error in sync from button:', error);

    await buttonInteraction.followUp({
      content: '❌ Erro durante a sincronização.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Create a progress bar for weapon level
 */
function createProgressBar(current: number, max: number, length: number = 10): string {
  const percentage = Math.min(Math.max(current, 0) / Math.max(max, 1), 1);
  const filled = Math.round(percentage * length);
  const empty = Math.max(length - filled, 0);

  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${max}`;
}

/**
 * Get emoji for weapon type
 */
function getWeaponEmoji(weaponName: string): string {
  if (!weaponName || typeof weaponName !== 'string') {
    return '🔫';
  }

  const weaponEmojis: Record<string, string> = {
    // Assault Rifles
    AKM: '🔫',
    M416: '🔫',
    'SCAR-L': '🔫',
    M16A4: '🔫',
    'AUG A3': '🔫',
    QBZ95: '🔫',
    Groza: '🔫',
    'Beryl M762': '🔫',
    'Mk47 Mutant': '🔫',
    G36C: '🔫',
    ACE32: '🔫',
    FAMAS: '🔫',
    
    // SMGs
    UMP45: '🔫',
    Vector: '🔫',
    Uzi: '🔫',
    'Tommy Gun': '🔫',
    MP5K: '🔫',
    Bizon: '🔫',
    P90: '🔫',
    JS9: '🔫',
    
    // Sniper Rifles
    Kar98k: '🎯',
    M24: '🎯',
    AWM: '🎯',
    Win94: '🎯',
    'Mosin-Nagant': '🎯',
    'Lynx AMR': '🎯',
    
    // DMRs
    SKS: '🎯',
    Mini14: '🎯',
    'Mk14 EBR': '🎯',
    QBU88: '🎯',
    SLR: '🎯',
    VSS: '🎯',
    Mk12: '🎯',
    
    // Shotguns
    S1897: '💥',
    S686: '💥',
    S12K: '💥',
    DBS: '💥',
    'Sawed-off': '💥',
    O12: '💥',
    
    // LMGs
    M249: '💪',
    'DP-27': '💪',
    MG3: '💪',
    
    // Pistols
    P1911: '🔫',
    P92: '🔫',
    R1895: '🔫',
    P18C: '🔫',
    R45: '🔫',
    Deagle: '🔫',
    Skorpion: '🔫',
    
    // Crossbows
    Crossbow: '🏹',
    
    // Throwables
    'Frag Grenade': '💣',
    'Smoke Grenade': '💨',
    'Stun Grenade': '⚡',
    'Molotov Cocktail': '🔥',
    
    // Melee
    Pan: '🍳',
    Crowbar: '🔧',
    Machete: '🔪',
    Sickle: '🔪',
  };

  return weaponEmojis[weaponName] || '🔫';
}

/**
 * Create mastery embed for weapon mastery data
 */
function createMasteryEmbed(weaponMasteryData: any[], targetUser: User): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🔫 Maestria de Armas - ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .setColor('#4CAF50')
    .setTimestamp();

  if (weaponMasteryData.length === 0) {
    embed.setDescription('Nenhum dado de maestria de armas encontrado.');
    return embed;
  }

  // Calcular estatísticas gerais
  const totalLevel = weaponMasteryData.reduce((sum, weapon) => sum + (weapon.level || 0), 0);
  const totalXP = weaponMasteryData.reduce((sum, weapon) => sum + (weapon.xp || 0), 0);
  const maxLevelWeapons = weaponMasteryData.filter(weapon => weapon.level >= 100).length;

  // Encontrar arma favorita (maior nível)
  const favoriteWeapon = weaponMasteryData.reduce((prev, current) => 
    (prev.level || 0) > (current.level || 0) ? prev : current,
  );

  embed.addFields({
    name: '📊 Resumo Geral',
    value: 
      `**Nível Total:** ${totalLevel}\n` +
      `**XP Total:** ${totalXP.toLocaleString()}\n` +
      `**Armas Registradas:** ${weaponMasteryData.length}\n` +
      `**Armas Dominadas:** ${maxLevelWeapons}\n` +
      `**Arma Favorita:** ${favoriteWeapon.weaponName || 'N/A'} (Nível ${favoriteWeapon.level || 0})`,
    inline: false,
  });

  // Mostrar top 10 armas
  const topWeapons = weaponMasteryData
    .sort((a, b) => (b.level || 0) - (a.level || 0))
    .slice(0, 10);

  let weaponsText = '';
  topWeapons.forEach((weapon, index) => {
    const emoji = getWeaponEmoji(weapon.weaponName);
    const progressBar = createProgressBar(weapon.level || 0, 100, 8);
    
    weaponsText += `**${index + 1}.** ${emoji} ${weapon.weaponName}\n`;
    weaponsText += `├ Nível: **${weapon.level || 0}** ${progressBar}\n`;
    weaponsText += `├ XP: **${(weapon.xp || 0).toLocaleString()}**\n`;
    weaponsText += `└ Tier: **${weapon.tier || 'N/A'}**\n\n`;
  });

  if (weaponsText) {
    embed.addFields({
      name: '🏆 Top 10 Armas',
      value: weaponsText,
      inline: false,
    });
  }

  embed.setFooter({ 
    text: `Total de ${weaponMasteryData.length} armas registradas`, 
  });

  return embed;
}
