import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';
import { MusicService } from '@/services/music.service';

/**
 * Play command - Plays music from YouTube or Spotify
 */
const play: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎵 Toca uma música ou playlist')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Nome da música, URL do YouTube/Spotify ou termo de busca')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName('shuffle')
        .setDescription('Embaralhar playlist (apenas para playlists)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('priority')
        .setDescription('Adicionar no início da fila')
        .setRequired(false)
    ),
  
  category: CommandCategory.MUSIC,
  cooldown: 3,
  
  async execute(interaction, client: ExtendedClient) {
    const logger = new Logger();
    const musicService = new MusicService();
    
    const query = interaction.options.getString('query', true);
    const shuffle = interaction.options.getBoolean('shuffle') || false;
    const priority = interaction.options.getBoolean('priority') || false;
    
    try {
      // Check if user is in a voice channel
      const member = interaction.member as any;
      if (!member?.voice?.channel) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erro')
          .setDescription('Você precisa estar em um canal de voz para tocar música!')
          .setColor('#FF0000');
        
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }
      
      const voiceChannel = member.voice.channel;
      
      // Check bot permissions
      const permissions = voiceChannel.permissionsFor(client.user!);
      if (!permissions?.has(['Connect', 'Speak'])) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Sem Permissões')
          .setDescription('Não tenho permissão para conectar ou falar neste canal de voz!')
          .setColor('#FF0000');
        
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        return;
      }
      
      await interaction.deferReply();
      
      // Search for tracks
      const searchResult = await musicService.searchTracks(query, interaction.user.id);
      
      if (!searchResult.success || !searchResult.tracks || searchResult.tracks.length === 0) {
        const notFoundEmbed = new EmbedBuilder()
          .setTitle('❌ Nenhuma música encontrada')
          .setDescription(`Não foi possível encontrar resultados para: **${query}**\n\nTente:\n• Verificar a ortografia\n• Usar termos mais específicos\n• Usar um link direto do YouTube/Spotify`)
          .setColor('#FF0000');
        
        await interaction.editReply({ embeds: [notFoundEmbed] });
        return;
      }
      
      const tracks = searchResult.tracks;
      const isPlaylist = tracks.length > 1;
      
      // Join voice channel and add tracks to queue
      const queue = await musicService.joinVoiceChannel(voiceChannel, interaction.channel!);
      
      if (shuffle && isPlaylist) {
        // Shuffle tracks except the first one
        const firstTrack = tracks[0];
        const remainingTracks = tracks.slice(1);
        for (let i = remainingTracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remainingTracks[i], remainingTracks[j]] = [remainingTracks[j], remainingTracks[i]];
        }
        tracks.splice(1, tracks.length - 1, ...remainingTracks);
      }
      
      // Add tracks to queue
      const addedTracks = [];
      for (const track of tracks) {
        const success = await musicService.addToQueue(interaction.guildId!, track, priority);
        if (success) {
          addedTracks.push(track);
        }
      }
      
      if (addedTracks.length === 0) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erro')
          .setDescription('Não foi possível adicionar as músicas à fila.')
          .setColor('#FF0000');
        
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
      
      // Start playing if queue was empty
      const wasEmpty = queue.tracks.length === addedTracks.length;
      if (wasEmpty) {
        await musicService.play(interaction.guildId!);
      }
      
      // Create response embed
      let embed: EmbedBuilder;
      
      if (isPlaylist) {
        embed = new EmbedBuilder()
          .setTitle('📋 Playlist Adicionada')
          .setDescription(`**${addedTracks.length}** músicas foram adicionadas à fila${shuffle ? ' (embaralhadas)' : ''}!`)
          .setColor('#00FF00')
          .addFields(
            { name: '🎵 Primeira Música', value: `**${addedTracks[0].title}**\n${addedTracks[0].author}`, inline: true },
            { name: '⏱️ Duração Total', value: formatDuration(addedTracks.reduce((total, track) => total + track.duration, 0)), inline: true },
            { name: '👤 Solicitado por', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setThumbnail(addedTracks[0].thumbnail)
          .setTimestamp();
      } else {
        const track = addedTracks[0];
        embed = new EmbedBuilder()
          .setTitle(wasEmpty ? '🎵 Tocando Agora' : '📋 Adicionado à Fila')
          .setDescription(`**${track.title}**\n${track.author}`)
          .setColor(wasEmpty ? '#00FF00' : '#0099FF')
          .addFields(
            { name: '⏱️ Duração', value: formatDuration(track.duration), inline: true },
            { name: '👤 Solicitado por', value: `<@${interaction.user.id}>`, inline: true },
            { name: '🔗 Fonte', value: track.source === 'youtube' ? 'YouTube' : 'Spotify', inline: true }
          )
          .setThumbnail(track.thumbnail)
          .setTimestamp();
        
        if (!wasEmpty) {
          const queuePosition = queue.tracks.length - addedTracks.length + 1;
          embed.addFields(
            { name: '📍 Posição na Fila', value: `#${queuePosition}`, inline: true }
          );
        }
      }
      
      // Add queue info
      if (queue.tracks.length > 1) {
        const remainingTracks = queue.tracks.length - 1;
        const totalDuration = queue.tracks.slice(1).reduce((total, track) => total + track.duration, 0);
        embed.addFields(
          { name: '📊 Fila', value: `${remainingTracks} música${remainingTracks !== 1 ? 's' : ''} • ${formatDuration(totalDuration)}`, inline: false }
        );
      }
      
      // Create control buttons
      const buttonsRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
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
            .setEmoji('⏹️')
        );
      
      const response = await interaction.editReply({
        embeds: [embed],
        components: [buttonsRow]
      });
      
      // Handle button interactions
      const collector = response.createMessageComponentCollector({
        time: 300000 // 5 minutes
      });
      
      collector.on('collect', async (i) => {
        // Check if user is in the same voice channel
        const memberVoice = (i.member as any)?.voice?.channel;
        const botVoice = i.guild?.members?.me?.voice?.channel;
        
        if (!memberVoice || memberVoice.id !== botVoice?.id) {
          await i.reply({ 
            content: '❌ Você precisa estar no mesmo canal de voz que eu para usar os controles!', 
            ephemeral: true 
          });
          return;
        }
        
        switch (i.customId) {
          case 'music_pause':
            const paused = await musicService.pause(interaction.guildId!);
            await i.reply({ 
              content: paused ? '⏸️ Música pausada!' : '▶️ Música retomada!', 
              ephemeral: true 
            });
            break;
            
          case 'music_skip':
            const skipped = await musicService.skip(interaction.guildId!);
            if (skipped) {
              await i.reply({ content: '⏭️ Música pulada!', ephemeral: true });
            } else {
              await i.reply({ content: '❌ Não há próxima música na fila!', ephemeral: true });
            }
            break;
            
          case 'music_queue':
            const queueEmbed = await createQueueEmbed(interaction.guildId!, musicService);
            await i.reply({ embeds: [queueEmbed], ephemeral: true });
            break;
            
          case 'music_stop':
            await musicService.stop(interaction.guildId!);
            await i.reply({ content: '⏹️ Música parada e fila limpa!', ephemeral: true });
            break;
        }
      });
      
      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
      
      // Log music activity
      logger.music(`Music played by ${interaction.user.tag} in ${interaction.guild?.name}`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        query,
        tracksAdded: addedTracks.length,
        isPlaylist
      });
      
    } catch (error) {
      logger.error('Play command error:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao tentar tocar a música.')
        .setColor('#FF0000');
      
      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
};

/**
 * Create queue embed
 */
async function createQueueEmbed(guildId: string, musicService: MusicService): Promise<EmbedBuilder> {
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
      value: `**${currentTrack.title}**\n${currentTrack.author} • ${formatDuration(currentTrack.duration)}\nSolicitado por <@${currentTrack.requestedBy}>`,
      inline: false
    });
  }
  
  if (queue.tracks.length > 0) {
    const upcomingTracks = queue.tracks.slice(0, 10).map((track, index) => {
      return `**${index + 1}.** ${track.title}\n${track.author} • ${formatDuration(track.duration)} • <@${track.requestedBy}>`;
    }).join('\n\n');
    
    embed.addFields({
      name: `📋 Próximas (${queue.tracks.length})`,
      value: upcomingTracks + (queue.tracks.length > 10 ? `\n\n... e mais ${queue.tracks.length - 10} música${queue.tracks.length - 10 !== 1 ? 's' : ''}` : ''),
      inline: false
    });
    
    const totalDuration = queue.tracks.reduce((total, track) => total + track.duration, 0);
    embed.addFields({
      name: '📊 Informações',
      value: `⏱️ Duração total: ${formatDuration(totalDuration)}\n🔁 Loop: ${queue.loop === 'track' ? 'Música' : queue.loop === 'queue' ? 'Fila' : 'Desativado'}\n🔀 Embaralhado: ${queue.shuffle ? 'Sim' : 'Não'}`,
      inline: false
    });
  }
  
  return embed;
}

/**
 * Format duration from milliseconds to readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
}

export default play;