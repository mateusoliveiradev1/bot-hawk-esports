import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  User,
} from 'discord.js';
import { PUBGPlatform, PUBGGameMode } from '../../types/pubg';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { BaseCommand } from '../../utils/base-command.util';
import { CommandCategory } from '../../types/command';

const logger = new Logger();

class PubgCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('pubg')
        .setDescription('Comandos relacionados ao PUBG')
        .addSubcommand(subcommand =>
          subcommand
            .setName('link')
            .setDescription('Vincular sua conta PUBG ao Discord')
            .addStringOption(option =>
              option
                .setName('username')
                .setDescription('Seu nome de usuário no PUBG')
                .setRequired(true)
            )
            .addStringOption(option =>
              option
                .setName('platform')
                .setDescription('Plataforma onde você joga PUBG')
                .setRequired(true)
                .addChoices(
                  { name: 'Steam', value: 'steam' },
                  { name: 'Xbox', value: 'xbox' },
                  { name: 'PlayStation', value: 'psn' },
                  { name: 'Stadia', value: 'stadia' },
                  { name: 'Kakao', value: 'kakao' }
                )
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('stats')
            .setDescription('Ver estatísticas PUBG suas ou de outro usuário')
            .addUserOption(option =>
              option
                .setName('usuario')
                .setDescription('Usuário para ver as estatísticas (deixe vazio para ver as suas)')
                .setRequired(false)
            )
            .addStringOption(option =>
              option
                .setName('modo')
                .setDescription('Modo de jogo para ver as estatísticas')
                .setRequired(false)
                .addChoices(
                  { name: 'Solo', value: 'solo' },
                  { name: 'Duo', value: 'duo' },
                  { name: 'Squad', value: 'squad' },
                  { name: 'Solo FPP', value: 'solo-fpp' },
                  { name: 'Duo FPP', value: 'duo-fpp' },
                  { name: 'Squad FPP', value: 'squad-fpp' }
                )
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('compare')
            .setDescription('Comparar estatísticas PUBG entre dois usuários')
            .addUserOption(option =>
              option
                .setName('usuario1')
                .setDescription('Primeiro usuário para comparar')
                .setRequired(true)
            )
            .addUserOption(option =>
              option
                .setName('usuario2')
                .setDescription('Segundo usuário para comparar (deixe vazio para comparar consigo)')
                .setRequired(false)
            )
            .addStringOption(option =>
              option
                .setName('modo')
                .setDescription('Modo de jogo para comparar')
                .setRequired(false)
                .addChoices(
                  { name: 'Solo', value: 'solo' },
                  { name: 'Duo', value: 'duo' },
                  { name: 'Squad', value: 'squad' },
                  { name: 'Solo FPP', value: 'solo-fpp' },
                  { name: 'Duo FPP', value: 'duo-fpp' },
                  { name: 'Squad FPP', value: 'squad-fpp' }
                )
            )
        ),
      category: CommandCategory.PUBG,
      cooldown: 5,
    });
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    try {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'link':
          await this.handleLinkCommand(interaction, client);
          break;
        case 'stats':
          await this.handleStatsCommand(interaction, client);
          break;
        case 'compare':
          await this.handleCompareCommand(interaction, client);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            ephemeral: true,
          });
      }
    } catch (error) {
      logger.error('Error in PUBG command:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ Erro ao executar comando: ${errorMessage}`,
        });
      } else {
        await interaction.reply({
          content: `❌ Erro ao executar comando: ${errorMessage}`,
          ephemeral: true,
        });
      }
    }
  }

  private async handleLinkCommand(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ) {
    const username = interaction.options.getString('username', true);
    const platform = interaction.options.getString('platform', true) as PUBGPlatform;

    await interaction.deferReply({ ephemeral: true });

    try {
      if (!client.services?.pubg) {
        const serviceErrorEmbed = new EmbedBuilder()
          .setTitle('❌ Serviço indisponível')
          .setDescription('O serviço PUBG está temporariamente indisponível.')
          .setColor('#FF0000');

        await interaction.editReply({ embeds: [serviceErrorEmbed] });
        return;
      }

      const pubgService = client.services.pubg;

      // Buscar jogador na API do PUBG
      const player = await pubgService.getPlayerByName(username, platform);
      if (!player) {
        await interaction.editReply({
          content: `❌ Jogador **${username}** não encontrado na plataforma **${platform.toUpperCase()}**.`,
        });
        return;
      }

      // Verificar se já existe uma conta vinculada
      const existingUser = await client.database.client.user.findUnique({
        where: { id: interaction.user.id },
      });

      // Salvar ou atualizar no banco de dados
      await client.database.client.user.upsert({
        where: { id: interaction.user.id },
        update: {
          pubgUsername: player.name,
          pubgPlatform: platform,
        },
        create: {
          id: interaction.user.id,
          username: interaction.user.username,
          discriminator: interaction.user.discriminator || '0',
          avatar: interaction.user.avatar,
          pubgUsername: player.name,
          pubgPlatform: platform,
        },
      });

      // Buscar estatísticas iniciais
      const stats = await pubgService.getPlayerStats(player.name, platform);

      const embed = new EmbedBuilder()
        .setTitle('✅ Conta PUBG vinculada com sucesso!')
        .setDescription(
          `Sua conta **${player.name}** foi vinculada à plataforma **${platform.toUpperCase()}**.`
        )
        .addFields(
          { name: '👤 Jogador', value: player.name, inline: true },
          { name: '🎮 Plataforma', value: platform.toUpperCase(), inline: true },
          { name: '🆔 ID do Jogador', value: player.id, inline: true }
        )
        .setColor(0x00ff00)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      if (stats) {
        const squadStats = stats.gameModeStats['squad'];
        if (squadStats) {
          embed.addFields(
            { name: '🎯 Estatísticas Rápidas (Squad)', value: '\u200B', inline: false },
            { name: '🎮 Partidas', value: squadStats.roundsPlayed.toString(), inline: true },
            { name: '🏆 Vitórias', value: squadStats.wins.toString(), inline: true },
            { name: '💀 Kills', value: squadStats.kills.toString(), inline: true }
          );
        }
      }

      if (existingUser?.pubgUsername) {
        embed.setFooter({ text: `Conta anterior: ${existingUser.pubgUsername}` });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error linking PUBG account for user ${interaction.user.id}:`, error);

      let errorMessage = 'Erro desconhecido';
      if (error instanceof Error) {
        if (error.message.includes('Player not found')) {
          errorMessage = `Jogador **${username}** não encontrado na plataforma **${platform.toUpperCase()}**.`;
        } else if (error.message.includes('API key')) {
          errorMessage = 'Erro de configuração da API. Contate um administrador.';
        } else {
          errorMessage = error.message;
        }
      }

      await interaction.editReply({
        content: `❌ Erro ao vincular conta PUBG: ${errorMessage}`,
      });
    }
  }

  private async handleStatsCommand(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ) {
    const targetUser = interaction.options.getUser('usuario') || interaction.user;
    const gameMode = (interaction.options.getString('modo') as PUBGGameMode) || PUBGGameMode.SQUAD;

    await interaction.deferReply();

    try {
      if (!client.services?.pubg) {
        const serviceErrorEmbed = new EmbedBuilder()
          .setTitle('❌ Serviço indisponível')
          .setDescription('O serviço PUBG está temporariamente indisponível.')
          .setColor('#FF0000');

        await interaction.editReply({ embeds: [serviceErrorEmbed] });
        return;
      }

      const pubgService = client.services.pubg;

      // Buscar dados do usuário no banco
      const userData = await client.database.client.user.findUnique({
        where: { id: targetUser.id },
      });
      if (!userData || !userData.pubgUsername) {
        await interaction.editReply({
          content: `❌ ${targetUser.id === interaction.user.id ? 'Você não tem' : `**${targetUser.username}** não tem`} uma conta PUBG vinculada. Use \`/pubg link\` para vincular.`,
        });
        return;
      }

      // Buscar estatísticas atualizadas
      const stats = await pubgService.getPlayerStats(
        userData.pubgUsername,
        userData.pubgPlatform as PUBGPlatform
      );
      if (!stats) {
        await interaction.editReply({
          content: `❌ Não foi possível obter as estatísticas de **${userData.pubgUsername}**.`,
        });
        return;
      }

      const modeStats = stats.gameModeStats[gameMode];
      if (!modeStats) {
        await interaction.editReply({
          content: `❌ Nenhuma estatística encontrada para o modo **${gameMode.toUpperCase()}**.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📊 Estatísticas PUBG - ${userData.pubgUsername}`)
        .setDescription(
          `Modo: **${gameMode.toUpperCase()}** | Plataforma: **${userData.pubgPlatform?.toUpperCase()}**`
        )
        .addFields(
          { name: '🎮 Partidas', value: modeStats.roundsPlayed.toString(), inline: true },
          { name: '🏆 Vitórias', value: modeStats.wins.toString(), inline: true },
          {
            name: '📈 Taxa de Vitória',
            value: `${((modeStats.wins / modeStats.roundsPlayed) * 100).toFixed(1)}%`,
            inline: true,
          },
          { name: '💀 Kills', value: modeStats.kills.toString(), inline: true },
          { name: '⚰️ Mortes', value: modeStats.losses.toString(), inline: true },
          {
            name: '📊 K/D',
            value: pubgService
              .calculateKDA(modeStats.kills, modeStats.losses, modeStats.assists || 0)
              .toFixed(2),
            inline: true,
          },
          {
            name: '💥 Dano Total',
            value: Math.round(modeStats.damageDealt).toLocaleString(),
            inline: true,
          },
          {
            name: '🎯 Dano Médio',
            value: Math.round(modeStats.damageDealt / modeStats.roundsPlayed).toLocaleString(),
            inline: true,
          },
          { name: '🎯 Headshots', value: modeStats.headshotKills.toString(), inline: true },
          {
            name: '🚗 Distância Percorrida',
            value: `${(modeStats.rideDistance / 1000).toFixed(1)} km`,
            inline: true,
          },
          {
            name: '🏃 Distância Caminhada',
            value: `${(modeStats.walkDistance / 1000).toFixed(1)} km`,
            inline: true,
          },
          {
            name: '⏱️ Tempo Sobrevivido',
            value: `${Math.round(modeStats.timeSurvived / 60)} min`,
            inline: true,
          }
        )
        .setColor(0x0099ff)
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Última atualização' });

      // Adicionar informações de rank se disponível
      if (stats.bestRankPoint > 0) {
        embed.addFields({
          name: '🏅 Melhor Rank',
          value: `${stats.bestRankPoint} RP`,
          inline: true,
        });
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`pubg_refresh_${targetUser.id}`)
          .setLabel('🔄 Atualizar')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`pubg_modes_${targetUser.id}`)
          .setLabel('🎮 Outros Modos')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error(`Error getting PUBG stats for user ${targetUser.id}:`, error);
      await interaction.editReply({
        content: `❌ Erro ao buscar estatísticas: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      });
    }
  }

  private async handleCompareCommand(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ) {
    const user1 = interaction.options.getUser('usuario1', true);
    const user2 = interaction.options.getUser('usuario2') || interaction.user;
    const gameMode = (interaction.options.getString('modo') as PUBGGameMode) || PUBGGameMode.SQUAD;

    await interaction.deferReply();

    try {
      if (!client.services?.pubg) {
        const serviceErrorEmbed = new EmbedBuilder()
          .setTitle('❌ Serviço indisponível')
          .setDescription('O serviço PUBG está temporariamente indisponível.')
          .setColor('#FF0000');

        await interaction.editReply({ embeds: [serviceErrorEmbed] });
        return;
      }

      const pubgService = client.services.pubg;

      // Buscar dados dos dois usuários
      const [userData1, userData2] = await Promise.all([
        client.database.client.user.findUnique({ where: { id: user1.id } }),
        client.database.client.user.findUnique({ where: { id: user2.id } }),
      ]);

      // Verificar se ambos têm contas vinculadas
      if (!userData1 || !userData1.pubgUsername) {
        await interaction.editReply({
          content: `❌ **${user1.username}** não tem uma conta PUBG vinculada.`,
        });
        return;
      }

      if (!userData2 || !userData2.pubgUsername) {
        await interaction.editReply({
          content: `❌ **${user2.username}** não tem uma conta PUBG vinculada.`,
        });
        return;
      }

      // Buscar estatísticas de ambos os usuários
      const [stats1, stats2] = await Promise.all([
        pubgService.getPlayerStats(userData1.pubgUsername, userData1.pubgPlatform as PUBGPlatform),
        pubgService.getPlayerStats(userData2.pubgUsername, userData2.pubgPlatform as PUBGPlatform),
      ]);

      if (!stats1 || !stats2) {
        await interaction.editReply({
          content: '❌ Não foi possível obter as estatísticas de um ou ambos os jogadores.',
        });
        return;
      }

      const modeStats1 = stats1.gameModeStats[gameMode];
      const modeStats2 = stats2.gameModeStats[gameMode];

      if (!modeStats1 || !modeStats2) {
        await interaction.editReply({
          content: `❌ Estatísticas do modo **${gameMode.toUpperCase()}** não encontradas para um ou ambos os jogadores.`,
        });
        return;
      }

      // Calcular métricas para comparação
      const kda1 = pubgService.calculateKDA(
        modeStats1.kills,
        modeStats1.losses,
        modeStats1.assists || 0
      );
      const kda2 = pubgService.calculateKDA(
        modeStats2.kills,
        modeStats2.losses,
        modeStats2.assists || 0
      );
      const winRate1 = (modeStats1.wins / modeStats1.roundsPlayed) * 100;
      const winRate2 = (modeStats2.wins / modeStats2.roundsPlayed) * 100;
      const avgDamage1 = modeStats1.damageDealt / modeStats1.roundsPlayed;
      const avgDamage2 = modeStats2.damageDealt / modeStats2.roundsPlayed;

      const embed = new EmbedBuilder()
        .setTitle(`⚔️ Comparação PUBG - ${gameMode.toUpperCase()}`)
        .setDescription(`**${userData1.pubgUsername}** vs **${userData2.pubgUsername}**`)
        .addFields(
          {
            name: '👤 Jogadores',
            value: `${userData1.pubgUsername}\n${userData2.pubgUsername}`,
            inline: true,
          },
          {
            name: '🎮 Partidas',
            value: `${modeStats1.roundsPlayed}\n${modeStats2.roundsPlayed}`,
            inline: true,
          },
          { name: '🏆 Vitórias', value: `${modeStats1.wins}\n${modeStats2.wins}`, inline: true },
          {
            name: '📈 Taxa de Vitória',
            value: `${winRate1.toFixed(1)}%\n${winRate2.toFixed(1)}%`,
            inline: true,
          },
          { name: '💀 Kills', value: `${modeStats1.kills}\n${modeStats2.kills}`, inline: true },
          { name: '📊 K/D', value: `${kda1.toFixed(2)}\n${kda2.toFixed(2)}`, inline: true },
          {
            name: '💥 Dano Médio',
            value: `${Math.round(avgDamage1).toLocaleString()}\n${Math.round(avgDamage2).toLocaleString()}`,
            inline: true,
          },
          {
            name: '🎯 Headshots',
            value: `${modeStats1.headshotKills}\n${modeStats2.headshotKills}`,
            inline: true,
          },
          {
            name: '⏱️ Tempo Médio',
            value: `${Math.round(modeStats1.timeSurvived / 60)} min\n${Math.round(modeStats2.timeSurvived / 60)} min`,
            inline: true,
          }
        )
        .setColor(0xff6600)
        .setTimestamp();

      // Adicionar vencedor em cada categoria
      const comparisons = [
        {
          name: '🏆 Melhor Taxa de Vitória',
          winner: winRate1 > winRate2 ? userData1.pubgUsername : userData2.pubgUsername,
        },
        {
          name: '💀 Mais Kills',
          winner:
            modeStats1.kills > modeStats2.kills ? userData1.pubgUsername : userData2.pubgUsername,
        },
        {
          name: '📊 Melhor K/D',
          winner: kda1 > kda2 ? userData1.pubgUsername : userData2.pubgUsername,
        },
        {
          name: '💥 Maior Dano Médio',
          winner: avgDamage1 > avgDamage2 ? userData1.pubgUsername : userData2.pubgUsername,
        },
      ];

      const winnersText = comparisons.map(comp => `${comp.name}: **${comp.winner}**`).join('\n');
      embed.addFields({ name: '🎖️ Vencedores por Categoria', value: winnersText, inline: false });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error comparing PUBG stats:', error);
      await interaction.editReply({
        content: `❌ Erro ao comparar estatísticas: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      });
    }
  }
}

// Exportações para compatibilidade
const commandInstance = new PubgCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.PUBG,
  cooldown: 5,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;
