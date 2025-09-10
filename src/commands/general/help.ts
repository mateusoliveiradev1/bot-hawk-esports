import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  AutocompleteInteraction,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';
import { HawkComponentFactory } from '../../utils/hawk-component-factory';
import { HAWK_EMOJIS } from '../../constants/hawk-emojis';
import { BaseCommand } from '../../utils/base-command.util';

/**
 * Help command - Shows all available commands organized by category
 */
class HelpCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription(`${HAWK_EMOJIS.HELP} Mostra todos os comandos disponíveis`)
        .addStringOption(option =>
          option
            .setName('command')
            .setDescription('Comando específico para obter ajuda detalhada')
            .setRequired(false)
            .setAutocomplete(true)
        ) as SlashCommandBuilder,
      category: CommandCategory.GENERAL,
      cooldown: 5,
    });
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const specificCommand = interaction.options.getString('command');

    try {
      if (specificCommand) {
        await this.handleSpecificCommand(interaction, client, specificCommand);
        return;
      }

      await this.handleGeneralHelp(interaction, client);
    } catch (error) {
      this.logger.error('Help command error:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao carregar a ajuda.')
        .setColor('#FF0000');

      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
  }

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedValue = interaction.options.getFocused();
    const client = interaction.client as ExtendedClient;

    const commands = Array.from(client.commands.values())
      .filter((cmd: any) => cmd.data.name.includes(focusedValue.toLowerCase()))
      .slice(0, 25)
      .map((cmd: any) => ({
        name: `/${cmd.data.name} - ${cmd.data.description}`,
        value: cmd.data.name,
      }));

    await interaction.respond(commands);
  }

  private async handleSpecificCommand(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
    commandName: string
  ): Promise<void> {
    const command = client.commands.get(commandName);

    if (!command) {
      const notFoundEmbed = HawkEmbedBuilder.createError(
        `${HAWK_EMOJIS.SYSTEM.ERROR} Comando Não Encontrado`,
        `O comando \`${commandName}\` não existe.\n\n${HAWK_EMOJIS.SYSTEM.INFO} Use \`/help\` para ver todos os comandos disponíveis.`
      );

      await interaction.reply({ embeds: [notFoundEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    const commandEmbed = HawkEmbedBuilder.createInfo(
      `${HAWK_EMOJIS.SYSTEM.HELP} Ajuda: /${command.data.name}`,
      (command.data as any).description
    ).addFields(
      {
        name: `${HAWK_EMOJIS.SYSTEM.CATEGORY} Categoria`,
        value: this.getCategoryName(command.category),
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.SYSTEM.TIME} Cooldown`,
        value: `${command.cooldown || 0} segundos`,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.SYSTEM.PERMISSIONS} Permissões`,
        value: command.permissions?.join(', ') || 'Nenhuma',
        inline: true,
      }
    );

    if (command.aliases && command.aliases.length > 0) {
      commandEmbed.addFields({
        name: '🔗 Aliases',
        value: command.aliases.map((alias: string) => `\`${alias}\``).join(', '),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [commandEmbed], flags: MessageFlags.Ephemeral });
  }

  private async handleGeneralHelp(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const mainEmbed = HawkEmbedBuilder.createInfo(
      `${HAWK_EMOJIS.SYSTEM.HELP} Central de Ajuda - Hawk Esports Bot`,
      `${HAWK_EMOJIS.SYSTEM.INFO} Selecione uma categoria abaixo para ver os comandos disponíveis ou use o menu para navegar.`
    )
      .setThumbnail(client.user?.displayAvatarURL() ?? null)
      .addFields(
        {
          name: `${HAWK_EMOJIS.PUBG} PUBG`,
          value: 'Comandos relacionados ao PUBG, rankings e estatísticas',
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.MUSIC} Música`,
          value: 'Sistema de música com playlists e controles',
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.GAMING.CONTROLLER} Jogos`,
          value: 'Mini-games, quizzes e desafios interativos',
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.VIDEO} Clips`,
          value: 'Sistema de clips e highlights',
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.SYSTEM.USER} Perfil`,
          value: 'Comandos de perfil e estatísticas pessoais',
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.SYSTEM.ADMIN} Admin`,
          value: 'Comandos administrativos (apenas admins)',
          inline: true,
        }
      )
      .setFooter({
        text: 'Use /help <comando> para ajuda específica • Hawk Esports',
        iconURL: client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId('help_category_select')
      .setPlaceholder('🔍 Selecione uma categoria para ver os comandos')
      .addOptions([
        {
          label: 'Geral',
          description: 'Comandos básicos e utilitários',
          value: 'general',
          emoji: '📋',
        },
        {
          label: 'PUBG',
          description: 'Rankings, stats e comandos PUBG',
          value: 'pubg',
          emoji: '🎮',
        },
        {
          label: 'Música',
          description: 'Player de música e controles',
          value: 'music',
          emoji: '🎵',
        },
        {
          label: 'Jogos',
          description: 'Mini-games e quizzes',
          value: 'games',
          emoji: '🎯',
        },
        {
          label: 'Clips',
          description: 'Upload e votação de clips',
          value: 'clips',
          emoji: '🎬',
        },
        {
          label: 'Perfil',
          description: 'Perfil e estatísticas pessoais',
          value: 'profile',
          emoji: '👤',
        },
        {
          label: 'Administração',
          description: 'Comandos administrativos',
          value: 'admin',
          emoji: '🔧',
        },
      ]);

    const buttonsRow = HawkComponentFactory.createButtonRow([
      HawkComponentFactory.createButton({
        id: 'help_quick_start',
        label: 'Início Rápido',
        style: ButtonStyle.Primary,
        emoji: '🚀',
      }),
      HawkComponentFactory.createButton({
        id: 'help_features',
        label: 'Funcionalidades',
        style: ButtonStyle.Secondary,
        emoji: '⭐',
      }),
      HawkComponentFactory.createButton({
        label: 'Dashboard',
        style: ButtonStyle.Link,
        url: 'https://your-dashboard-url.com',
        emoji: '🌐',
      }),
      HawkComponentFactory.createButton({
        label: 'Suporte',
        style: ButtonStyle.Link,
        url: 'https://discord.gg/your-support-server',
        emoji: '💬',
      }),
    ]);

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelect);

    const response = await interaction.reply({
      embeds: [mainEmbed],
      components: [selectRow, buttonsRow],
      flags: MessageFlags.Ephemeral,
    });

    await this.handleInteractions(response, interaction, client);
  }

  private async handleInteractions(
    response: any,
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient
  ): Promise<void> {
    const collector = response.createMessageComponentCollector({
      time: 300000, // 5 minutes
    });

    collector.on('collect', async (i: any) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: `${HAWK_EMOJIS.ERROR} Apenas quem executou o comando pode usar este menu.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (i.isStringSelectMenu() && i.customId === 'help_category_select') {
        const category = i.values[0];
        const categoryEmbed = await this.getCategoryEmbed(category ?? '', client);
        await i.update({ embeds: [categoryEmbed] });
      }

      if (i.isButton()) {
        switch (i.customId) {
          case 'help_quick_start':
            const quickStartEmbed = this.getQuickStartEmbed();
            await i.update({ embeds: [quickStartEmbed] });
            break;

          case 'help_features':
            const featuresEmbed = this.getFeaturesEmbed();
            await i.update({ embeds: [featuresEmbed] });
            break;
        }
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }

  private async getCategoryEmbed(category: string, client: ExtendedClient): Promise<any> {
    const categoryMap: { [key: string]: CommandCategory } = {
      general: CommandCategory.GENERAL,
      pubg: CommandCategory.PUBG,
      music: CommandCategory.MUSIC,
      games: CommandCategory.GAMES,
      clips: CommandCategory.CLIPS,
      profile: CommandCategory.GENERAL,
      admin: CommandCategory.ADMIN,
    };

    const categoryEnum = categoryMap[category] ?? CommandCategory.GENERAL;
    const commands = Array.from(client.commands.values()).filter(
      (cmd: any) => cmd.category === categoryEnum
    );

    if (commands.length === 0) {
      return HawkEmbedBuilder.createWarning(
        `${HAWK_EMOJIS.SYSTEM.HELP} Comandos - ${this.getCategoryName(categoryEnum)}`,
        `${HAWK_EMOJIS.WARNING} Nenhum comando encontrado nesta categoria.`
      );
    }

    const embed = HawkEmbedBuilder.createInfo(
      `${HAWK_EMOJIS.SYSTEM.HELP} Comandos - ${this.getCategoryName(categoryEnum)}`,
      ''
    );

    const commandList = commands
      .map((cmd: any) => {
        const cooldown = cmd.cooldown ? ` (${cmd.cooldown}s)` : '';
        const permissions = cmd.permissions?.length ? ' 🔒' : '';
        return `**/${cmd.data.name}**${cooldown}${permissions}\n${cmd.data.description}`;
      })
      .join('\n\n');

    embed.setDescription(commandList);

    if (categoryEnum === CommandCategory.ADMIN) {
      embed.setFooter({
        text: `${HAWK_EMOJIS.SYSTEM.LOCK} = Requer permissões especiais • Hawk Esports`,
      });
    } else {
      embed.setFooter({ text: 'Hawk Esports' });
    }

    return embed;
  }

  private getQuickStartEmbed(): any {
    return HawkEmbedBuilder.createSuccess(
      `${HAWK_EMOJIS.SYSTEM.ROCKET} Início Rápido`,
      `${HAWK_EMOJIS.SYSTEM.INFO} Siga estes passos para começar a usar o bot:`
    )
      .addFields(
        {
          name: `${HAWK_EMOJIS.USER} Registro`,
          value: 'Use `/register` para cadastrar seu nick PUBG e plataforma',
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.PROFILE} Perfil`,
          value: 'Veja seu perfil com `/profile` e suas estatísticas',
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.TROPHY} Rankings`,
          value: 'Confira os rankings com `/ranking pubg` ou `/ranking internal`',
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.MUSIC} Música`,
          value: 'Toque música com `/play <música>` e controle com `/queue`',
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.GAME} Jogos`,
          value: 'Participe de quizzes com `/quiz start` e mini-games',
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.VIDEO} Clips`,
          value: 'Envie seus clips com `/clip upload` e vote nos melhores',
          inline: false,
        }
      )
      .setFooter({
        text: `${HAWK_EMOJIS.SYSTEM.TIP} Dica: Use /help <comando> para ajuda específica • Hawk Esports`,
      });
  }

  private getFeaturesEmbed(): any {
    return HawkEmbedBuilder.createInfo(
      `${HAWK_EMOJIS.SYSTEM.STAR} Funcionalidades Principais`,
      `${HAWK_EMOJIS.SYSTEM.INFO} Conheça todas as funcionalidades do Hawk Esports Bot:`
    )
      .addFields(
        {
          name: `${HAWK_EMOJIS.PUBG} Sistema PUBG Completo`,
          value: `${HAWK_EMOJIS.SYSTEM.BULLET} Rankings diários, semanais e mensais\n${HAWK_EMOJIS.SYSTEM.BULLET} Estatísticas detalhadas\n${HAWK_EMOJIS.SYSTEM.BULLET} Cargos automáticos por rank\n${HAWK_EMOJIS.SYSTEM.BULLET} Integração com API oficial`,
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.MUSIC} Player de Música Avançado`,
          value: `${HAWK_EMOJIS.SYSTEM.BULLET} Suporte a YouTube e Spotify\n${HAWK_EMOJIS.SYSTEM.BULLET} Playlists personalizadas\n${HAWK_EMOJIS.SYSTEM.BULLET} Filtros de áudio\n${HAWK_EMOJIS.SYSTEM.BULLET} Queue persistente`,
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.GAMING.CONTROLLER} Sistema de Gamificação`,
          value: `${HAWK_EMOJIS.SYSTEM.BULLET} Mini-games interativos\n${HAWK_EMOJIS.SYSTEM.BULLET} Quizzes com rankings\n${HAWK_EMOJIS.SYSTEM.BULLET} Badges automáticas\n${HAWK_EMOJIS.SYSTEM.BULLET} Sistema de XP e moedas`,
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.VIDEO} Clips e Highlights`,
          value: `${HAWK_EMOJIS.SYSTEM.BULLET} Upload de vídeos\n${HAWK_EMOJIS.SYSTEM.BULLET} Sistema de votação\n${HAWK_EMOJIS.SYSTEM.BULLET} Rankings semanais\n${HAWK_EMOJIS.SYSTEM.BULLET} Moderação automática`,
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.SYSTEM.CHART} Dashboard Web`,
          value: `${HAWK_EMOJIS.SYSTEM.BULLET} Interface moderna\n${HAWK_EMOJIS.SYSTEM.BULLET} Estatísticas em tempo real\n${HAWK_EMOJIS.SYSTEM.BULLET} Controles administrativos\n${HAWK_EMOJIS.SYSTEM.BULLET} Visualização de dados`,
          inline: false,
        },
        {
          name: `${HAWK_EMOJIS.SYSTEM.ADMIN} Administração Completa`,
          value: `${HAWK_EMOJIS.SYSTEM.BULLET} Auto-setup do servidor\n${HAWK_EMOJIS.SYSTEM.BULLET} Sistema de logs\n${HAWK_EMOJIS.SYSTEM.BULLET} Moderação automática\n${HAWK_EMOJIS.SYSTEM.BULLET} Backup de dados`,
          inline: false,
        }
      )
      .setFooter({ text: 'Hawk Esports - A melhor experiência PUBG no Discord' });
  }

  private getCategoryName(category: CommandCategory): string {
    const categoryNames: Record<CommandCategory, string> = {
      [CommandCategory.GENERAL]: '📋 Geral',
      [CommandCategory.PUBG]: '🎮 PUBG',
      [CommandCategory.MUSIC]: '🎵 Música',
      [CommandCategory.GAMES]: '🎯 Jogos',
      [CommandCategory.CLIPS]: '🎬 Clips',
      [CommandCategory.ADMIN]: '🔧 Administração',
      [CommandCategory.MODERATION]: '🛡️ Moderação',
      [CommandCategory.UTILITY]: '🔧 Utilitários',
      [CommandCategory.RANKING]: '📊 Ranking',
      [CommandCategory.FUN]: '🎉 Diversão',
      [CommandCategory.ECONOMY]: '💰 Economia',
      [CommandCategory.BADGES]: '🏆 Badges',
    };

    return categoryNames[category] || 'Desconhecido';
  }
}

const commandInstance = new HelpCommand();

export const command = {
  data: commandInstance.data,
  category: commandInstance.category,
  cooldown: commandInstance.cooldown,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
  autocomplete: (interaction: AutocompleteInteraction) => commandInstance.autocomplete(interaction),
};

export default command;
