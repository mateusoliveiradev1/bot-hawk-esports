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
import { BaseCommand, CommandHandlerFactory } from '../../utils/base-command.util';
import { ServiceValidator } from '../../utils/service-validator.util';
import { ErrorHandler } from '../../utils/error-handler.util';

class WeaponMasteryCommand extends BaseCommand {
  constructor() {
    super({
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
        ),
      category: CommandCategory.PUBG,
      cooldown: 15,
    });
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'view':
        await this.handleView(interaction, client);
        break;
      case 'sync':
        await this.handleSync(interaction, client);
        break;
      case 'leaderboard':
        await this.handleLeaderboard(interaction, client);
        break;
      case 'stats':
        await this.handleStats(interaction, client);
        break;
      default:
        await this.safeReply(interaction, {
          content: '❌ Subcomando não reconhecido.',
          flags: MessageFlags.Ephemeral,
        });
    }
  }

  async handleView(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    this.validateService(client.services?.weaponMastery, 'WeaponMastery');
    
    const targetUser = interaction.options.getUser('user') || interaction.user;
    ServiceValidator.validateDiscordId(targetUser.id, 'user ID');
    
    await this.deferWithLoading(interaction);
    
    const masteryData = await client.services.weaponMastery.getUserWeaponMastery(targetUser.id);
    
    if (!masteryData || masteryData.weapons.length === 0) {
      await this.safeReply(interaction, {
        content: `❌ ${targetUser.id === interaction.user.id ? 'Você não possui' : `${targetUser.username} não possui`} dados de maestria de armas. Use \`/weapon-mastery sync\` para sincronizar.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    await displayWeaponMastery(interaction, masteryData, targetUser);
  }
  
  async handleSync(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    this.validateService(client.services?.weaponMastery, 'WeaponMastery');
    
    await this.deferWithLoading(interaction);
    
    // Get user's PUBG name from database first
    const pubgStats = await client.database.client.pUBGStats.findFirst({
      where: { userId: interaction.user.id },
    });
    
    if (!pubgStats?.playerName) {
      await this.safeReply(interaction, {
        content: '❌ Você precisa registrar seu nome PUBG primeiro usando `/pubg register`',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    const syncResult = await client.services.weaponMastery.syncUserWeaponMastery(interaction.user.id, pubgStats.playerName);
    
    if (!syncResult) {
      await this.safeReply(interaction, {
        content: '❌ Falha na sincronização. Verifique se seu nome PUBG está correto.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Sincronização Concluída')
      .setDescription('Maestria de armas sincronizada com sucesso!')
      .setColor('#00FF00')
      .setTimestamp();
    
    await this.safeReply(interaction, { embeds: [embed] });
  }
  
  async handleLeaderboard(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    this.validateService(client.services?.weaponMastery, 'WeaponMastery');
    
    const limit = interaction.options.getInteger('limit') || 10;
    if (limit < 1 || limit > 20) {
      await this.safeReply(interaction, {
        content: '❌ O limite deve estar entre 1 e 20.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    await this.deferWithLoading(interaction);
    
    const leaderboard = await client.services.weaponMastery.getWeaponMasteryLeaderboard(limit);
    
    if (!leaderboard || leaderboard.length === 0) {
      await this.safeReply(interaction, {
        content: '❌ Nenhum dado de maestria de armas encontrado.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('🏆 Ranking de Maestria de Armas')
      .setColor('#FFD700')
      .setTimestamp();
    
    let description = '';
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
      description += `${medal} **${entry.pubgName}** - Level ${entry.totalLevel} (${entry.weaponCount} weapons)\n`;
    }
    
    embed.setDescription(description);
    await this.safeReply(interaction, { embeds: [embed] });
  }
  
  async handleStats(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    this.validateService(client.services?.weaponMastery, 'WeaponMastery');
    
    await this.deferWithLoading(interaction);
    
    const stats = await client.services.weaponMastery.getWeaponMasteryStats();
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Estatísticas de Maestria de Armas')
      .addFields(
        { name: '👥 Jogadores Registrados', value: stats.totalPlayers.toLocaleString(), inline: true },
        { name: '🔫 Total de Kills', value: stats.totalKills.toLocaleString(), inline: true },
        { name: '🎯 Arma Mais Popular', value: stats.mostPopularWeapon || 'N/A', inline: true },
        { name: '📈 Média de Kills/Jogador', value: stats.averageKillsPerPlayer.toFixed(1), inline: true },
        { name: '🏆 Maior Maestria', value: `${stats.highestMastery?.weapon || 'N/A'} (${stats.highestMastery?.kills || 0} kills)`, inline: true },
      )
      .setColor('#4A90E2')
      .setTimestamp();
    
    await this.safeReply(interaction, { embeds: [embed] });
  }
}

const commandInstance = new WeaponMasteryCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.PUBG,
  cooldown: 15,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) => 
    commandInstance.execute(interaction, client),
};

export default command;









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
