import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { BaseCommand } from '../../utils/base-command.util';
import { Logger } from '../../utils/logger';
import { MusicService } from '../../services/music.service';

/**
 * Queue command - Manages music queue
 */
export class QueueCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('📋 Gerencia a fila de música')
        .addSubcommand(subcommand =>
          subcommand
            .setName('show')
            .setDescription('Mostra a fila atual')
            .addIntegerOption(option =>
              option
                .setName('page')
                .setDescription('Página da fila (padrão: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(50),
            ),
        )
        .addSubcommand(subcommand =>
          subcommand.setName('clear').setDescription('Limpa toda a fila'),
        )
        .addSubcommand(subcommand =>
          subcommand.setName('shuffle').setDescription('Embaralha a fila'),
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('loop')
            .setDescription('Configura o modo de repetição')
            .addStringOption(option =>
              option
                .setName('mode')
                .setDescription('Modo de repetição')
                .setRequired(true)
                .addChoices(
                  { name: '🔁 Repetir Fila', value: 'queue' },
                  { name: '🔂 Repetir Música', value: 'track' },
                  { name: '❌ Desativar', value: 'off' },
                ),
            ),
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('remove')
            .setDescription('Remove uma música da fila')
            .addIntegerOption(option =>
              option
                .setName('position')
                .setDescription('Posição da música na fila')
                .setRequired(true)
                .setMinValue(1),
            ),
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('move')
            .setDescription('Move uma música para outra posição')
            .addIntegerOption(option =>
              option
                .setName('from')
                .setDescription('Posição atual da música')
                .setRequired(true)
                .setMinValue(1),
            )
            .addIntegerOption(option =>
              option
                .setName('to')
                .setDescription('Nova posição da música')
                .setRequired(true)
                .setMinValue(1),
            ),
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('save')
            .setDescription('Salva a fila atual como playlist')
            .addStringOption(option =>
              option.setName('name').setDescription('Nome da playlist').setRequired(true),
            ),
        ) as SlashCommandBuilder,
      category: CommandCategory.MUSIC,
      cooldown: 5,
    });
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const logger = new Logger();

    // Validate guild context
    try {
      this.validateGuildContext(interaction);
    } catch (error) {
      await this.sendGuildOnlyError(interaction);
      return;
    }

    // Get music service
    const musicService = this.getMusicService(client);
    if (!musicService) {
      await interaction.reply({
        content: '❌ O serviço de música não está disponível no momento.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      // Check voice channel for commands that modify the queue
      if (['clear', 'shuffle', 'loop', 'remove', 'move'].includes(subcommand)) {
        if (!this.validateVoiceChannelAccess(interaction)) {
          return;
        }
      }

      switch (subcommand) {
        case 'show':
          await this.handleShowQueue(interaction, musicService);
          break;
        case 'clear':
          await this.handleClearQueue(interaction, musicService);
          break;
        case 'shuffle':
          await this.handleShuffleQueue(interaction, musicService);
          break;
        case 'loop':
          await this.handleLoopQueue(interaction, musicService);
          break;
        case 'remove':
          await this.handleRemoveTrack(interaction, musicService);
          break;
        case 'move':
          await this.handleMoveTrack(interaction, musicService);
          break;
        case 'save':
          await this.handleSavePlaylist(interaction, musicService);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      logger.error('Queue command error:', error);
      this.logger.error('Queue command error:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao executar o comando.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  /**
   * Validate voice channel access for queue management
   */
  private async validateVoiceChannelAccess(
    interaction: ChatInputCommandInteraction,
  ): Promise<boolean> {
    const member = interaction.member as any;
    const memberVoice = member?.voice?.channel;
    const botVoice = interaction.guild?.members?.me?.voice?.channel;

    if (!memberVoice || memberVoice.id !== botVoice?.id) {
      await interaction.reply({
        content: '❌ Você precisa estar no mesmo canal de voz que eu para gerenciar a fila!',
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }

    return true;
  }

  /**
   * Get music service from client
   */
  private getMusicService(client: ExtendedClient): MusicService | null {
    return (client as any).musicService || new MusicService();
  }

  /**
   * Handle show queue subcommand
   */
  private async handleShowQueue(
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
  ): Promise<void> {
    const page = interaction.options.getInteger('page') || 1;
    const queue = await musicService.getQueue(interaction.guildId!);

    if (!queue || ((!queue.tracks || queue.tracks.length === 0) && !queue.currentTrack)) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle('📋 Fila de Música')
        .setDescription('A fila está vazia.\n\nUse `/play` para adicionar músicas!')
        .setColor('#FFA500');

      await interaction.reply({ embeds: [emptyEmbed] });
      return;
    }

    const embed = await this.createQueueEmbed(queue, page);
    const components = await this.createQueueComponents(queue, page);

    const response = await interaction.reply({
      embeds: [embed],
      components,
    });

    // Handle interactions
    await this.handleQueueInteractions(response, interaction, musicService, page, queue);
  }

  /**
   * Handle clear queue subcommand
   */
  private async handleClearQueue(
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
  ): Promise<void> {
    const queue = await musicService.getQueue(interaction.guildId!);

    if (!queue || !queue.tracks || queue.tracks.length === 0) {
      await interaction.reply({
        content: '❌ Não há músicas na fila para limpar.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await musicService.clearQueue(interaction.guildId!);

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Fila Limpa')
      .setDescription('Todas as músicas foram removidas da fila.')
      .setColor('#00FF00');

    await interaction.reply({ embeds: [embed] });
  }

  /**
   * Handle shuffle queue subcommand
   */
  private async handleShuffleQueue(
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
  ): Promise<void> {
    const queue = await musicService.getQueue(interaction.guildId!);

    if (!queue || !queue.tracks || queue.tracks.length < 2) {
      await interaction.reply({
        content: '❌ É necessário pelo menos 2 músicas na fila para embaralhar.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const shuffled = await musicService.toggleShuffle(interaction.guildId!);

    const embed = new EmbedBuilder()
      .setTitle(shuffled ? '🔀 Fila Embaralhada' : '❌ Erro')
      .setDescription(
        shuffled
          ? 'A ordem das músicas na fila foi embaralhada.'
          : 'Não foi possível embaralhar a fila.',
      )
      .setColor(shuffled ? '#00FF00' : '#FF0000');

    await interaction.reply({ embeds: [embed] });
  }

  /**
   * Handle loop queue subcommand
   */
  private async handleLoopQueue(
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
  ): Promise<void> {
    const mode = interaction.options.getString('mode', true) as 'off' | 'track' | 'queue';
    const loopMode = mode === 'off' ? 'none' : mode;
    await musicService.setLoop(interaction.guildId!, loopMode);

    const modeNames = {
      queue: '🔁 Repetir Fila',
      track: '🔂 Repetir Música',
      off: '❌ Desativado',
    };

    const embed = new EmbedBuilder()
      .setTitle('🔁 Modo de Repetição Alterado')
      .setDescription(`Modo de repetição definido para: **${modeNames[mode]}**`)
      .setColor('#00FF00');

    await interaction.reply({ embeds: [embed] });
  }

  /**
   * Handle remove track subcommand
   */
  private async handleRemoveTrack(
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
  ): Promise<void> {
    const position = interaction.options.getInteger('position', true);
    const queue = await musicService.getQueue(interaction.guildId!);

    if (!queue || !queue.tracks || position > queue.tracks.length) {
      await interaction.reply({
        content: `❌ A posição ${position} não existe na fila.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const trackToRemove = queue.tracks[position - 1];
    if (!trackToRemove) {
      await interaction.reply({
        content: '❌ Música não encontrada na posição especificada.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const removed = await musicService.removeFromQueue(interaction.guildId!, position - 1);

    const embed = new EmbedBuilder()
      .setTitle(removed ? '🗑️ Música Removida' : '❌ Erro')
      .setDescription(
        removed
          ? `**${trackToRemove.title}** foi removida da posição #${position}.`
          : 'Não foi possível remover a música.',
      )
      .setColor(removed ? '#00FF00' : '#FF0000');

    await interaction.reply({ embeds: [embed] });
  }

  /**
   * Handle move track subcommand
   */
  private async handleMoveTrack(
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
  ): Promise<void> {
    const from = interaction.options.getInteger('from', true);
    const to = interaction.options.getInteger('to', true);
    const queue = await musicService.getQueue(interaction.guildId!);

    if (!queue || from > queue.tracks.length || to > queue.tracks.length) {
      await interaction.reply({
        content: '❌ Uma ou ambas as posições não existem na fila.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (from === to) {
      await interaction.reply({
        content: '❌ A posição de origem e destino não podem ser iguais.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const trackToMove = queue.tracks[from - 1];
    if (!trackToMove) {
      await interaction.reply({
        content: '❌ Música não encontrada na posição especificada.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const moved = await musicService.moveInQueue(interaction.guildId!, from - 1, to - 1);

    const embed = new EmbedBuilder()
      .setTitle(moved ? '↔️ Música Movida' : '❌ Erro')
      .setDescription(
        moved
          ? `**${trackToMove.title}** foi movida da posição #${from} para #${to}.`
          : 'Não foi possível mover a música.',
      )
      .setColor(moved ? '#00FF00' : '#FF0000');

    await interaction.reply({ embeds: [embed] });
  }

  /**
   * Handle save playlist subcommand
   */
  private async handleSavePlaylist(
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
  ): Promise<void> {
    const name = interaction.options.getString('name', true);
    const queue = await musicService.getQueue(interaction.guildId!);

    if (!queue || queue.tracks.length === 0) {
      await interaction.reply({
        content: '❌ Não há músicas na fila para salvar como playlist.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const saved = await musicService.savePlaylist(interaction.user.id, name, queue.tracks);

    const embed = new EmbedBuilder()
      .setTitle(saved ? '💾 Playlist Salva' : '❌ Erro')
      .setDescription(
        saved
          ? `Playlist **${name}** foi salva com ${queue.tracks.length} música${queue.tracks.length !== 1 ? 's' : ''}.`
          : 'Não foi possível salvar a playlist.',
      )
      .setColor(saved ? '#00FF00' : '#FF0000');

    if (saved) {
      embed.addFields({
        name: '📋 Detalhes',
        value: `🎵 ${queue.tracks.length} música${queue.tracks.length !== 1 ? 's' : ''}\n⏱️ ${this.formatDuration(queue.tracks.reduce((total, track) => total + track.duration, 0))}\n👤 Criada por <@${interaction.user.id}>`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  }

  /**
   * Handle queue interactions (buttons and select menus)
   */
  private async handleQueueInteractions(
    response: any,
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
    page: number,
    queue: any,
  ): Promise<void> {
    const collector = response.createMessageComponentCollector({
      time: 300000, // 5 minutes
    });

    collector.on('collect', async (i: any) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: '❌ Apenas quem executou o comando pode usar estes controles.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        if (i.isButton()) {
          await this.handleButtonInteraction(i, interaction, musicService, page, queue);
        }

        if (i.isStringSelectMenu() && i.customId === 'queue_remove') {
          await this.handleRemoveSelectInteraction(i, interaction, musicService);
        }
      } catch (error) {
        const logger = new Logger();
        logger.error('Queue interaction error:', error);
        await i.reply({
          content: '❌ Ocorreu um erro ao processar sua solicitação.',
          flags: MessageFlags.Ephemeral,
        });
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }

  /**
   * Handle button interactions
   */
  private async handleButtonInteraction(
    i: any,
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
    page: number,
    queue: any,
  ): Promise<void> {
    const [action, value] = i.customId.split('_');

    switch (action) {
      case 'queue':
        if (value === 'prev' || value === 'next') {
          const newPage = value === 'prev' ? page - 1 : page + 1;
          const newEmbed = await this.createQueueEmbed(queue, newPage);
          const newComponents = await this.createQueueComponents(queue, newPage);
          await i.update({ embeds: [newEmbed], components: newComponents });
        }
        break;

      case 'music':
        // Validate voice channel access
        if (!this.validateVoiceChannelForInteraction(i)) {
          return;
        }

        switch (value) {
          case 'pause':
            const paused = await musicService.pause(interaction.guildId!);
            await i.reply({
              content: paused ? '⏸️ Música pausada!' : '▶️ Música retomada!',
              flags: MessageFlags.Ephemeral,
            });
            break;

          case 'skip':
            const skipped = await musicService.skip(interaction.guildId!);
            await i.reply({
              content: skipped ? '⏭️ Música pulada!' : '❌ Não há próxima música na fila!',
              flags: MessageFlags.Ephemeral,
            });
            break;

          case 'shuffle':
            await musicService.toggleShuffle(interaction.guildId!);
            await i.reply({ content: '🔀 Fila embaralhada!', flags: MessageFlags.Ephemeral });
            break;

          case 'clear':
            await musicService.clearQueue(interaction.guildId!);
            await i.reply({ content: '🗑️ Fila limpa!', flags: MessageFlags.Ephemeral });
            break;
        }
        break;
    }
  }

  /**
   * Handle remove select menu interaction
   */
  private async handleRemoveSelectInteraction(
    i: any,
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
  ): Promise<void> {
    const position = parseInt(i.values[0]);
    const removed = await musicService.removeFromQueue(interaction.guildId!, position - 1);

    if (removed) {
      await i.reply({
        content: `🗑️ Música removida da posição #${position}!`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await i.reply({
        content: '❌ Não foi possível remover a música!',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  /**
   * Validate voice channel for button interactions
   */
  private validateVoiceChannelForInteraction(i: any): boolean {
    const memberVoice = (i.member as any)?.voice?.channel;
    const botVoice = i.guild?.members?.me?.voice?.channel;

    if (!memberVoice || memberVoice.id !== botVoice?.id) {
      i.reply({
        content: '❌ Você precisa estar no mesmo canal de voz que eu para usar os controles!',
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }

    return true;
  }

  /**
   * Create queue embed
   */
  private async createQueueEmbed(queue: any, page: number = 1): Promise<EmbedBuilder> {
    const embed = new EmbedBuilder()
      .setTitle('📋 Fila de Música')
      .setColor('#0099FF')
      .setTimestamp();

    // Current track
    if (queue.currentTrack) {
      embed.addFields({
        name: '🎵 Tocando Agora',
        value: `**${queue.currentTrack.title}**\n${queue.currentTrack.author} • ${this.formatDuration(queue.currentTrack.duration)}\nSolicitado por <@${queue.currentTrack.requestedBy}>`,
        inline: false,
      });
    }

    // Queue tracks
    if (queue.tracks.length > 0) {
      const tracksPerPage = 10;
      const startIndex = (page - 1) * tracksPerPage;
      const endIndex = Math.min(startIndex + tracksPerPage, queue.tracks.length);
      const tracksToShow = queue.tracks.slice(startIndex, endIndex);

      const trackList = tracksToShow
        .map((track: any, index: number) => {
          const position = startIndex + index + 1;
          return `**${position}.** ${track.title}\n${track.author} • ${this.formatDuration(track.duration)} • <@${track.requestedBy}>`;
        })
        .join('\n\n');

      const totalPages = Math.ceil(queue.tracks.length / tracksPerPage);

      embed.addFields({
        name: `📋 Próximas (${queue.tracks.length}) - Página ${page}/${totalPages}`,
        value: trackList,
        inline: false,
      });

      // Queue info
      const totalDuration = queue.tracks.reduce(
        (total: number, track: any) => total + track.duration,
        0,
      );
      embed.addFields({
        name: '📊 Informações da Fila',
        value: `⏱️ Duração total: ${this.formatDuration(totalDuration)}\n🔁 Loop: ${this.getLoopModeText(queue.loop)}\n🔀 Embaralhado: ${queue.shuffle ? 'Sim' : 'Não'}`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '📋 Próximas',
        value: 'Nenhuma música na fila.\nUse `/play` para adicionar mais músicas!',
        inline: false,
      });
    }

    return embed;
  }

  /**
   * Create queue components
   */
  private async createQueueComponents(queue: any, page: number): Promise<any[]> {
    const components = [];

    // Control buttons
    const controlsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('music_pause')
        .setLabel('Pausar/Retomar')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏸️'),
      new ButtonBuilder()
        .setCustomId('music_skip')
        .setLabel('Pular')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏭️'),
      new ButtonBuilder()
        .setCustomId('music_shuffle')
        .setLabel('Embaralhar')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔀'),
      new ButtonBuilder()
        .setCustomId('music_clear')
        .setLabel('Limpar')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),
    );

    components.push(controlsRow);

    // Navigation buttons (if needed)
    if (queue.tracks.length > 10) {
      const totalPages = Math.ceil(queue.tracks.length / 10);
      const navRow = new ActionRowBuilder<ButtonBuilder>();

      if (page > 1) {
        navRow.addComponents(
          new ButtonBuilder()
            .setCustomId('queue_prev')
            .setLabel('◀️ Anterior')
            .setStyle(ButtonStyle.Primary),
        );
      }

      if (page < totalPages) {
        navRow.addComponents(
          new ButtonBuilder()
            .setCustomId('queue_next')
            .setLabel('Próxima ▶️')
            .setStyle(ButtonStyle.Primary),
        );
      }

      if (navRow.components.length > 0) {
        components.push(navRow);
      }
    }

    // Remove track select menu (if there are tracks)
    if (queue.tracks.length > 0) {
      const tracksToShow = queue.tracks.slice(0, 25); // Discord limit
      const removeSelect = new StringSelectMenuBuilder()
        .setCustomId('queue_remove')
        .setPlaceholder('🗑️ Selecione uma música para remover')
        .addOptions(
          tracksToShow.map((track: any, index: number) => ({
            label: `${index + 1}. ${track.title.substring(0, 90)}`,
            description: `${track.author.substring(0, 90)} • ${this.formatDuration(track.duration)}`,
            value: (index + 1).toString(),
          })),
        );

      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(removeSelect);
      components.push(selectRow);
    }

    return components;
  }

  /**
   * Get loop mode text
   */
  private getLoopModeText(mode: string): string {
    switch (mode) {
      case 'queue':
        return '🔁 Fila';
      case 'track':
        return '🔂 Música';
      default:
        return '❌ Desativado';
    }
  }

  /**
   * Format duration from milliseconds to readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
  }
}

const commandInstance = new QueueCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.MUSIC,
  cooldown: 3,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;
