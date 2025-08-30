import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChatInputCommandInteraction,
  ButtonInteraction,
} from 'discord.js';
import { Command } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { WeaponMasteryData, UserWeaponMastery } from '../../services/weapon-mastery.service';

export default {
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
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('sync').setDescription('Sincronizar maestria de armas com a API PUBG')
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
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('stats').setDescription('Ver estatísticas gerais de maestria de armas')
    ),

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    try {
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
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error('Error in weapon-mastery command:', error);

      // Log detalhado para o canal de logs da API
      if (client.services?.pubg) {
        await client.services.pubg.logToChannel(
          '❌ Erro no Comando Weapon Mastery',
          `**Usuário:** ${interaction.user.tag}\n**Subcomando:** ${subcommand}\n**Erro:** ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
          'error'
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
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
} as Command;

/**
 * Handle view subcommand
 */
async function handleViewCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const userId = targetUser.id;

  await interaction.deferReply();

  try {
    // Get user from database
    const user = await client.database.client.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.pubgUsername) {
      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('❌ Usuário não encontrado')
        .setDescription(
          targetUser.id === interaction.user.id
            ? 'Você precisa vincular sua conta PUBG primeiro. Use `/pubg link` para vincular.'
            : 'Este usuário não possui uma conta PUBG vinculada.'
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Get weapon mastery data
    const masteryData = await (client as any).weaponMasteryService.getUserWeaponMastery(userId);

    if (!masteryData) {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('⚠️ Dados não encontrados')
        .setDescription(
          'Nenhum dado de maestria de armas encontrado. Use `/weapon-mastery sync` para sincronizar seus dados.'
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Create paginated weapon mastery display
    await displayWeaponMastery(interaction, masteryData, targetUser);
  } catch (error) {
    console.error('Error in view command:', error);

    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('❌ Erro')
      .setDescription('Não foi possível carregar os dados de maestria de armas.')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

/**
 * Handle sync subcommand
 */
async function handleSyncCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  const userId = interaction.user.id;

  await interaction.deferReply();

  try {
    // Get user from database
    const user = await client.database.client.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.pubgUsername) {
      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('❌ Conta não vinculada')
        .setDescription(
          'Você precisa vincular sua conta PUBG primeiro. Use `/pubg link` para vincular.'
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Verificar se o serviço de maestria de armas está disponível
    if (!client.services?.weaponMastery) {
      throw new Error('Weapon mastery service not available');
    }

    // Force sync weapon mastery
    const synced = await client.services.weaponMastery.forceSyncUserWeaponMastery(
      userId,
      user.pubgUsername
    );

    if (synced) {
      const embed = new EmbedBuilder()
        .setColor('#4caf50')
        .setTitle('✅ Sincronização concluída')
        .setDescription(
          `Dados de maestria de armas sincronizados com sucesso para **${user.pubgUsername}**.\n\n` +
            'Use `/weapon-mastery view` para visualizar seus dados atualizados.'
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('⚠️ Sincronização falhou')
        .setDescription(
          'Não foi possível sincronizar os dados de maestria de armas. Possíveis causas:\n\n' +
            '• Jogador não encontrado na API PUBG\n' +
            '• Dados de maestria não disponíveis\n' +
            '• Erro temporário da API\n\n' +
            'Tente novamente em alguns minutos.'
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error in sync command:', error);

    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('❌ Erro na sincronização')
      .setDescription('Ocorreu um erro durante a sincronização. Tente novamente mais tarde.')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

/**
 * Handle leaderboard subcommand
 */
async function handleLeaderboardCommand(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient
): Promise<void> {
  const limit = interaction.options.getInteger('limit') || 10;

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

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in leaderboard command:', error);

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
  client: ExtendedClient
): Promise<void> {
  await interaction.deferReply();

  try {
    const stats = await (client as any).weaponMasteryService.getWeaponMasteryStats();

    const embed = new EmbedBuilder()
      .setColor('#2196f3')
      .setTitle('📊 Estatísticas de Maestria de Armas')
      .addFields(
        {
          name: '👥 Usuários',
          value: `**${stats.totalUsers}** jogadores\n**${stats.totalWeapons}** armas registradas`,
          inline: true,
        },
        {
          name: '📈 Médias',
          value: `**${stats.averageLevel.toFixed(1)}** nível médio por jogador`,
          inline: true,
        },
        {
          name: '🔫 Armas Populares',
          value:
            stats.topWeapons
              .slice(0, 5)
              .map(
                (weapon: any, index: number) =>
                  `**${index + 1}.** ${weapon.name} (${weapon.users} usuários)`
              )
              .join('\n') || 'Nenhuma arma registrada',
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in stats command:', error);

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
  targetUser: any
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
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
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
        .setDisabled(targetUser.id !== interaction.user.id)
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
        ephemeral: true,
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
        ...buttons.components.map(button => ButtonBuilder.from(button).setDisabled(true))
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
  client: ExtendedClient
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
        ephemeral: true,
      });
      return;
    }

    await buttonInteraction.followUp({
      content: '🔄 Sincronizando dados de maestria de armas...',
      ephemeral: true,
    });

    // Force sync weapon mastery
    const synced = await (client as any).weaponMasteryService.forceSyncUserWeaponMastery(
      userId,
      user.pubgUsername
    );

    if (synced) {
      await buttonInteraction.followUp({
        content:
          '✅ Dados sincronizados com sucesso! Use o comando novamente para ver as atualizações.',
        ephemeral: true,
      });
    } else {
      await buttonInteraction.followUp({
        content: '❌ Falha na sincronização. Tente novamente mais tarde.',
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in sync from button:', error);

    await buttonInteraction.followUp({
      content: '❌ Erro durante a sincronização.',
      ephemeral: true,
    });
  }
}

/**
 * Create a progress bar for weapon level
 */
function createProgressBar(current: number, max: number, length: number = 10): string {
  const percentage = Math.min(current / max, 1);
  const filled = Math.round(length * percentage);
  const empty = length - filled;

  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${max}`;
}

/**
 * Get emoji for weapon type
 */
function getWeaponEmoji(weaponName: string): string {
  const weaponEmojis: Record<string, string> = {
    AKM: '🔫',
    M416: '🔫',
    'SCAR-L': '🔫',
    M16A4: '🔫',
    Kar98k: '🎯',
    M24: '🎯',
    AWM: '🎯',
    VSS: '🎯',
    UMP45: '🔫',
    Vector: '🔫',
    'Tommy Gun': '🔫',
    S12K: '💥',
    S1897: '💥',
    S686: '💥',
    DBS: '💥',
    P92: '🔫',
    P1911: '🔫',
    P18C: '🔫',
    R1895: '🔫',
    Crossbow: '🏹',
    Pan: '🍳',
    Machete: '🔪',
    Sickle: '🔪',
    Crowbar: '🔧',
  };

  return weaponEmojis[weaponName] || '🔫';
}
