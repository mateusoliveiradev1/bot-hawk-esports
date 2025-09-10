import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { BaseCommand } from '../../utils/base-command.util';
import { Logger } from '../../utils/logger';
import { MusicService } from '../../services/music.service';

/**
 * Play command - Plays music from YouTube or Spotify
 */
export class PlayCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('🎵 Toca uma música ou playlist')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Nome da música, URL do YouTube/Spotify ou termo de busca')
            .setRequired(true),
        )
        .addBooleanOption(option =>
          option
            .setName('shuffle')
            .setDescription('Embaralhar a playlist (padrão: false)')
            .setRequired(false),
        )
        .addBooleanOption(option =>
          option
            .setName('next')
            .setDescription('Adicionar no início da fila (padrão: false)')
            .setRequired(false),
        ) as SlashCommandBuilder,
      category: CommandCategory.MUSIC,
      cooldown: 3,
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

    // Validate voice channel
    if (!(await this.validateVoiceChannel(interaction))) {
      return;
    }

    const query = interaction.options.getString('query', true);
    const shuffle = interaction.options.getBoolean('shuffle') || false;
    const playNext = interaction.options.getBoolean('next') || false;

    try {
      await interaction.deferReply();

      // Search for tracks
      logger.debug(`🔍 Searching for: "${query}"`);
      const result = await musicService.addTrack(interaction.guildId!, query, interaction.user.id);

      if (!result.success || !result.track) {
        await this.handleTrackNotFound(interaction, query);
        return;
      }

      const tracks = [result.track];
      logger.debug(`✅ Found track: ${result.track.title} by ${result.track.artist}`);

      // Join voice channel
      const member = interaction.member as any;
      const voiceChannel = member.voice.channel;

      logger.debug(`🔗 Joining voice channel: ${voiceChannel.name}`);
      const connection = await musicService.joinChannel(voiceChannel);
      if (!connection) {
        await interaction.editReply({
          content: '❌ Não foi possível conectar ao canal de voz.',
        });
        return;
      }

      // Get current queue state and start playing if needed
      const queue = await musicService.getQueue(interaction.guildId!);
      const wasEmpty = !queue || (!queue.currentTrack && queue.tracks.length <= 1);

      if (wasEmpty || !queue?.isPlaying) {
        logger.debug('▶️ Starting playback...');
        const playResult = await musicService.playNext(interaction.guildId!);
        if (!playResult) {
          logger.error('❌ Failed to start playback');
        }
      }

      // Create and send response
      const embed = await this.createPlayEmbed(
        tracks,
        interaction.user.id,
        wasEmpty,
        queue,
        musicService,
      );
      const buttonsRow = this.createControlButtons();

      const response = await interaction.editReply({
        embeds: [embed],
        components: [buttonsRow],
      });

      // Handle button interactions
      await this.handleButtonInteractions(response, interaction, musicService, logger);

      // Log activity
      logger.info(
        `🎵 Music command executed by ${interaction.user.tag} in ${interaction.guild?.name} - Query: ${query}, Track: ${tracks[0]?.title || 'Unknown'}`,
      );
    } catch (error) {
      logger.error('Play command error:', error);
      this.logger.error('Play command error:', error);
      await interaction.reply({
        content: '❌ Ocorreu um erro ao executar o comando.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  /**
   * Validate voice channel requirements
   */
  private async validateVoiceChannel(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const member = interaction.member as any;

    if (!member?.voice?.channel) {
      await interaction.reply({
        content: '❌ Você precisa estar em um canal de voz para tocar música!',
        flags: MessageFlags.Ephemeral,
      });
      return false;
    }

    const voiceChannel = member.voice.channel;
    const permissions = voiceChannel.permissionsFor(interaction.client.user!);

    if (!permissions?.has(['Connect', 'Speak'])) {
      await interaction.reply({
        content: '❌ Não tenho permissão para conectar ou falar neste canal de voz!',
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
   * Handle track not found scenario
   */
  private async handleTrackNotFound(
    interaction: ChatInputCommandInteraction,
    query: string,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('❌ Nenhuma música encontrada')
      .setDescription(
        `Não foi possível encontrar resultados para: **${query}**\n\nTente:\n• Verificar a ortografia\n• Usar termos mais específicos\n• Usar um link direto do YouTube/Spotify`,
      )
      .setColor('#FF0000');

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Create play response embed
   */
  private async createPlayEmbed(
    tracks: any[],
    userId: string,
    wasEmpty: boolean,
    queue: any,
    musicService: MusicService,
  ): Promise<EmbedBuilder> {
    const track = tracks[0];
    const isNowPlaying = wasEmpty || !queue?.isPlaying;

    const embed = new EmbedBuilder()
      .setTitle(isNowPlaying ? '🎵 Tocando Agora' : '📋 Adicionado à Fila')
      .setDescription(`**${track.title}**\n${track.artist}`)
      .setColor(isNowPlaying ? '#00FF00' : '#0099FF')
      .addFields(
        { name: '⏱️ Duração', value: this.formatDuration(track.duration), inline: true },
        { name: '👤 Solicitado por', value: `<@${userId}>`, inline: true },
        {
          name: '🔗 Fonte',
          value: track.platform === 'youtube' ? 'YouTube' : 'Spotify',
          inline: true,
        },
      )
      .setThumbnail(track.thumbnail || '')
      .setTimestamp();

    if (!isNowPlaying && queue) {
      embed.addFields({
        name: '📍 Posição na Fila',
        value: `#${queue.tracks.length}`,
        inline: true,
      });
    }

    // Add queue info
    const currentQueue = await musicService.getQueue(queue?.guildId || '');
    if (currentQueue && currentQueue.tracks.length > 1) {
      const remainingTracks = currentQueue.tracks.length - 1;
      const totalDuration = currentQueue.tracks
        .slice(1)
        .reduce((total, track) => total + track.duration, 0);
      embed.addFields({
        name: '📊 Fila',
        value: `${remainingTracks} música${remainingTracks !== 1 ? 's' : ''} • ${this.formatDuration(totalDuration)}`,
        inline: false,
      });
    }

    return embed;
  }

  /**
   * Create control buttons
   */
  private createControlButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('music_pause')
        .setLabel('Pausar')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏸️'),
      new ButtonBuilder()
        .setCustomId('music_skip')
        .setLabel('Pular')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏭️'),
      new ButtonBuilder()
        .setCustomId('music_queue')
        .setLabel('Fila')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋'),
      new ButtonBuilder()
        .setCustomId('music_stop')
        .setLabel('Parar')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⏹️'),
    );
  }

  /**
   * Handle button interactions
   */
  private async handleButtonInteractions(
    response: any,
    interaction: ChatInputCommandInteraction,
    musicService: MusicService,
    logger: Logger,
  ): Promise<void> {
    const collector = response.createMessageComponentCollector({
      time: 300000, // 5 minutes
    });

    collector.on('collect', async i => {
      // Validate voice channel access
      const memberVoice = (i.member as any)?.voice?.channel;
      const botVoice = i.guild?.members?.me?.voice?.channel;

      if (!memberVoice || memberVoice.id !== botVoice?.id) {
        await i.reply({
          content: '❌ Você precisa estar no mesmo canal de voz que eu para usar os controles!',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        switch (i.customId) {
          case 'music_pause':
            const paused = await musicService.pause(interaction.guildId!);
            await i.reply({
              content: paused ? '⏸️ Música pausada!' : '▶️ Música retomada!',
              flags: MessageFlags.Ephemeral,
            });
            break;

          case 'music_skip':
            const skipped = await musicService.skip(interaction.guildId!);
            await i.reply({
              content: skipped ? '⏭️ Música pulada!' : '❌ Não há próxima música na fila!',
              flags: MessageFlags.Ephemeral,
            });
            break;

          case 'music_queue':
            const queueEmbed = await this.createQueueEmbed(interaction.guildId!, musicService);
            await i.reply({ embeds: [queueEmbed], flags: MessageFlags.Ephemeral });
            break;

          case 'music_stop':
            await musicService.stop(interaction.guildId!);
            await i.reply({
              content: '⏹️ Música parada e fila limpa!',
              flags: MessageFlags.Ephemeral,
            });
            break;
        }
      } catch (error) {
        logger.error('Button interaction error:', error);
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
   * Create queue embed
   */
  private async createQueueEmbed(
    guildId: string,
    musicService: MusicService,
  ): Promise<EmbedBuilder> {
    const queue = await musicService.getQueue(guildId);

    const embed = new EmbedBuilder()
      .setTitle('📋 Fila de Música')
      .setColor('#0099FF')
      .setTimestamp();

    if (!queue || queue.tracks.length === 0) {
      embed.setDescription('A fila está vazia.\n\nUse `/play` para adicionar músicas!');
      return embed;
    }

    const currentTrack = queue.currentTrack;
    if (currentTrack) {
      embed.addFields({
        name: '🎵 Tocando Agora',
        value: `**${currentTrack.title}**\n${currentTrack.artist} • ${this.formatDuration(currentTrack.duration)}\nSolicitado por <@${currentTrack.requestedBy}>`,
        inline: false,
      });
    }

    if (queue.tracks.length > 0) {
      const upcomingTracks = queue.tracks
        .slice(0, 10)
        .map((track, index) => {
          return `**${index + 1}.** ${track.title}\n${track.artist} • ${this.formatDuration(track.duration)} • <@${track.requestedBy}>`;
        })
        .join('\n\n');

      embed.addFields({
        name: `📋 Próximas (${queue.tracks.length})`,
        value:
          upcomingTracks +
          (queue.tracks.length > 10
            ? `\n\n... e mais ${queue.tracks.length - 10} música${queue.tracks.length - 10 !== 1 ? 's' : ''}`
            : ''),
        inline: false,
      });

      const totalDuration = queue.tracks.reduce((total, track) => total + track.duration, 0);
      embed.addFields({
        name: '📊 Informações',
        value: `⏱️ Duração total: ${this.formatDuration(totalDuration)}\n🔁 Loop: ${queue.loop === 'track' ? 'Música' : queue.loop === 'queue' ? 'Fila' : 'Desativado'}\n🔀 Embaralhado: ${queue.shuffle ? 'Sim' : 'Não'}`,
        inline: false,
      });
    }

    return embed;
  }

  /**
   * Format duration from milliseconds to readable format
   */
  private formatDuration(ms: number): string {
    if (!ms || ms <= 0) {
      return '0:00';
    }

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }
}

const commandInstance = new PlayCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.MUSIC,
  cooldown: 3,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;
