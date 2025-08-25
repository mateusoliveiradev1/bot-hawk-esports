import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';
import { MusicService } from '@/services/music.service';

/**
 * Queue command - Manages music queue
 */
const queue: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('📋 Gerencia a fila de música')
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Mostra a fila atual')
        .addIntegerOption(option =>
          option.setName('page')
            .setDescription('Página da fila (padrão: 1)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Limpa toda a fila')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('shuffle')
        .setDescription('Embaralha a fila')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('loop')
        .setDescription('Configura o modo de repetição')
        .addStringOption(option =>
          option.setName('mode')
            .setDescription('Modo de repetição')
            .setRequired(true)
            .addChoices(
              { name: '🔁 Repetir Fila', value: 'queue' },
              { name: '🔂 Repetir Música', value: 'track' },
              { name: '❌ Desativar', value: 'off' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove uma música da fila')
        .addIntegerOption(option =>
          option.setName('position')
            .setDescription('Posição da música na fila')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('move')
        .setDescription('Move uma música para outra posição')
        .addIntegerOption(option =>
          option.setName('from')
            .setDescription('Posição atual da música')
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption(option =>
          option.setName('to')
            .setDescription('Nova posição da música')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('save')
        .setDescription('Salva a fila atual como playlist')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Nome da playlist')
            .setRequired(true)
            .setMaxLength(50)
        )
    ),
  
  category: CommandCategory.MUSIC,
  cooldown: 5,
  
  async execute(interaction, client: ExtendedClient) {
    const logger = new Logger();
    const musicService = new MusicService();
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      // Check if user is in voice channel for most commands
      if (['clear', 'shuffle', 'loop', 'remove', 'move'].includes(subcommand)) {
        const member = interaction.member as any;
        const memberVoice = member?.voice?.channel;
        const botVoice = interaction.guild?.members?.me?.voice?.channel;
        
        if (!memberVoice || memberVoice.id !== botVoice?.id) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Erro')
            .setDescription('Você precisa estar no mesmo canal de voz que eu para gerenciar a fila!')
            .setColor('#FF0000');
          
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          return;
        }
      }
      
      switch (subcommand) {
        case 'show':
          await handleShowQueue(interaction, musicService);
          break;
          
        case 'clear':
          await handleClearQueue(interaction, musicService);
          break;
          
        case 'shuffle':
          await handleShuffleQueue(interaction, musicService);
          break;
          
        case 'loop':
          await handleLoopQueue(interaction, musicService);
          break;
          
        case 'remove':
          await handleRemoveTrack(interaction, musicService);
          break;
          
        case 'move':
          await handleMoveTrack(interaction, musicService);
          break;
          
        case 'save':
          await handleSavePlaylist(interaction, musicService);
          break;
      }
      
    } catch (error) {
      logger.error('Queue command error:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao gerenciar a fila.')
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
 * Handle show queue subcommand
 */
async function handleShowQueue(interaction: any, musicService: MusicService) {
  const page = interaction.options.getInteger('page') || 1;
  const queue = await musicService.getQueue(interaction.guildId!);
  
  if (!queue || (queue.tracks.length === 0 && !queue.currentTrack)) {
    const emptyEmbed = new EmbedBuilder()
      .setTitle('📋 Fila de Música')
      .setDescription('A fila está vazia.\n\nUse `/play` para adicionar músicas!')
      .setColor('#FFA500');
    
    await interaction.reply({ embeds: [emptyEmbed] });
    return;
  }
  
  const embed = await createQueueEmbed(queue, page);
  const components = await createQueueComponents(queue, page);
  
  const response = await interaction.reply({
    embeds: [embed],
    components
  });
  
  // Handle interactions
  const collector = response.createMessageComponentCollector({
    time: 300000 // 5 minutes
  });
  
  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: '❌ Apenas quem executou o comando pode usar estes controles.', ephemeral: true });
      return;
    }
    
    if (i.isButton()) {
      const [action, value] = i.customId.split('_');
      
      switch (action) {
        case 'queue':
          if (value === 'prev' || value === 'next') {
            const newPage = value === 'prev' ? page - 1 : page + 1;
            const newEmbed = await createQueueEmbed(queue, newPage);
            const newComponents = await createQueueComponents(queue, newPage);
            await i.update({ embeds: [newEmbed], components: newComponents });
          }
          break;
          
        case 'music':
          // Handle music controls
          const memberVoice = (i.member as any)?.voice?.channel;
          const botVoice = i.guild?.members?.me?.voice?.channel;
          
          if (!memberVoice || memberVoice.id !== botVoice?.id) {
            await i.reply({ 
              content: '❌ Você precisa estar no mesmo canal de voz que eu para usar os controles!', 
              ephemeral: true 
            });
            return;
          }
          
          switch (value) {
            case 'pause':
              const paused = await musicService.pause(interaction.guildId!);
              await i.reply({ 
                content: paused ? '⏸️ Música pausada!' : '▶️ Música retomada!', 
                ephemeral: true 
              });
              break;
              
            case 'skip':
              const skipped = await musicService.skip(interaction.guildId!);
              if (skipped) {
                await i.reply({ content: '⏭️ Música pulada!', ephemeral: true });
              } else {
                await i.reply({ content: '❌ Não há próxima música na fila!', ephemeral: true });
              }
              break;
              
            case 'shuffle':
              await musicService.shuffleQueue(interaction.guildId!);
              await i.reply({ content: '🔀 Fila embaralhada!', ephemeral: true });
              break;
              
            case 'clear':
              await musicService.clearQueue(interaction.guildId!);
              await i.reply({ content: '🗑️ Fila limpa!', ephemeral: true });
              break;
          }
          break;
      }
    }
    
    if (i.isStringSelectMenu() && i.customId === 'queue_remove') {
      const position = parseInt(i.values[0]);
      const removed = await musicService.removeFromQueue(interaction.guildId!, position - 1);
      
      if (removed) {
        await i.reply({ content: `🗑️ Música removida da posição #${position}!`, ephemeral: true });
      } else {
        await i.reply({ content: '❌ Não foi possível remover a música!', ephemeral: true });
      }
    }
  });
  
  collector.on('end', () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}

/**
 * Handle clear queue subcommand
 */
async function handleClearQueue(interaction: any, musicService: MusicService) {
  const cleared = await musicService.clearQueue(interaction.guildId!);
  
  const embed = new EmbedBuilder()
    .setTitle(cleared ? '🗑️ Fila Limpa' : '❌ Erro')
    .setDescription(cleared ? 'Todas as músicas foram removidas da fila.' : 'Não foi possível limpar a fila.')
    .setColor(cleared ? '#00FF00' : '#FF0000');
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle shuffle queue subcommand
 */
async function handleShuffleQueue(interaction: any, musicService: MusicService) {
  const shuffled = await musicService.shuffleQueue(interaction.guildId!);
  
  const embed = new EmbedBuilder()
    .setTitle(shuffled ? '🔀 Fila Embaralhada' : '❌ Erro')
    .setDescription(shuffled ? 'A ordem das músicas na fila foi embaralhada.' : 'Não foi possível embaralhar a fila.')
    .setColor(shuffled ? '#00FF00' : '#FF0000');
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle loop queue subcommand
 */
async function handleLoopQueue(interaction: any, musicService: MusicService) {
  const mode = interaction.options.getString('mode', true) as 'queue' | 'track' | 'off';
  const success = await musicService.setLoop(interaction.guildId!, mode);
  
  const modeNames = {
    queue: '🔁 Repetir Fila',
    track: '🔂 Repetir Música',
    off: '❌ Desativado'
  };
  
  const embed = new EmbedBuilder()
    .setTitle(success ? '🔁 Modo de Repetição Alterado' : '❌ Erro')
    .setDescription(success ? `Modo de repetição definido para: **${modeNames[mode]}**` : 'Não foi possível alterar o modo de repetição.')
    .setColor(success ? '#00FF00' : '#FF0000');
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle remove track subcommand
 */
async function handleRemoveTrack(interaction: any, musicService: MusicService) {
  const position = interaction.options.getInteger('position', true);
  const queue = await musicService.getQueue(interaction.guildId!);
  
  if (!queue || position > queue.tracks.length) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Posição Inválida')
      .setDescription(`A posição ${position} não existe na fila.`)
      .setColor('#FF0000');
    
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    return;
  }
  
  const trackToRemove = queue.tracks[position - 1];
  const removed = await musicService.removeFromQueue(interaction.guildId!, position - 1);
  
  const embed = new EmbedBuilder()
    .setTitle(removed ? '🗑️ Música Removida' : '❌ Erro')
    .setDescription(removed ? `**${trackToRemove.title}** foi removida da posição #${position}.` : 'Não foi possível remover a música.')
    .setColor(removed ? '#00FF00' : '#FF0000');
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle move track subcommand
 */
async function handleMoveTrack(interaction: any, musicService: MusicService) {
  const from = interaction.options.getInteger('from', true);
  const to = interaction.options.getInteger('to', true);
  const queue = await musicService.getQueue(interaction.guildId!);
  
  if (!queue || from > queue.tracks.length || to > queue.tracks.length) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Posição Inválida')
      .setDescription('Uma ou ambas as posições não existem na fila.')
      .setColor('#FF0000');
    
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    return;
  }
  
  if (from === to) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Posições Iguais')
      .setDescription('A posição de origem e destino não podem ser iguais.')
      .setColor('#FF0000');
    
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    return;
  }
  
  const trackToMove = queue.tracks[from - 1];
  const moved = await musicService.moveInQueue(interaction.guildId!, from - 1, to - 1);
  
  const embed = new EmbedBuilder()
    .setTitle(moved ? '↔️ Música Movida' : '❌ Erro')
    .setDescription(moved ? `**${trackToMove.title}** foi movida da posição #${from} para #${to}.` : 'Não foi possível mover a música.')
    .setColor(moved ? '#00FF00' : '#FF0000');
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle save playlist subcommand
 */
async function handleSavePlaylist(interaction: any, musicService: MusicService) {
  const name = interaction.options.getString('name', true);
  const queue = await musicService.getQueue(interaction.guildId!);
  
  if (!queue || queue.tracks.length === 0) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Fila Vazia')
      .setDescription('Não há músicas na fila para salvar como playlist.')
      .setColor('#FF0000');
    
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    return;
  }
  
  // This would save to database - simplified for now
  const saved = await musicService.savePlaylist(interaction.user.id, name, queue.tracks);
  
  const embed = new EmbedBuilder()
    .setTitle(saved ? '💾 Playlist Salva' : '❌ Erro')
    .setDescription(saved ? `Playlist **${name}** foi salva com ${queue.tracks.length} música${queue.tracks.length !== 1 ? 's' : ''}.` : 'Não foi possível salvar a playlist.')
    .setColor(saved ? '#00FF00' : '#FF0000');
  
  if (saved) {
    embed.addFields(
      { name: '📋 Detalhes', value: `🎵 ${queue.tracks.length} música${queue.tracks.length !== 1 ? 's' : ''}\n⏱️ ${formatDuration(queue.tracks.reduce((total, track) => total + track.duration, 0))}\n👤 Criada por <@${interaction.user.id}>`, inline: false }
    );
  }
  
  await interaction.reply({ embeds: [embed] });
}

/**
 * Create queue embed
 */
async function createQueueEmbed(queue: any, page: number = 1): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle('📋 Fila de Música')
    .setColor('#0099FF')
    .setTimestamp();
  
  // Current track
  if (queue.currentTrack) {
    embed.addFields({
      name: '🎵 Tocando Agora',
      value: `**${queue.currentTrack.title}**\n${queue.currentTrack.author} • ${formatDuration(queue.currentTrack.duration)}\nSolicitado por <@${queue.currentTrack.requestedBy}>`,
      inline: false
    });
  }
  
  // Queue tracks
  if (queue.tracks.length > 0) {
    const tracksPerPage = 10;
    const startIndex = (page - 1) * tracksPerPage;
    const endIndex = Math.min(startIndex + tracksPerPage, queue.tracks.length);
    const tracksToShow = queue.tracks.slice(startIndex, endIndex);
    
    const trackList = tracksToShow.map((track: any, index: number) => {
      const position = startIndex + index + 1;
      return `**${position}.** ${track.title}\n${track.author} • ${formatDuration(track.duration)} • <@${track.requestedBy}>`;
    }).join('\n\n');
    
    const totalPages = Math.ceil(queue.tracks.length / tracksPerPage);
    
    embed.addFields({
      name: `📋 Próximas (${queue.tracks.length}) - Página ${page}/${totalPages}`,
      value: trackList,
      inline: false
    });
    
    // Queue info
    const totalDuration = queue.tracks.reduce((total: number, track: any) => total + track.duration, 0);
    embed.addFields({
      name: '📊 Informações da Fila',
      value: `⏱️ Duração total: ${formatDuration(totalDuration)}\n🔁 Loop: ${getLoopModeText(queue.loop)}\n🔀 Embaralhado: ${queue.shuffle ? 'Sim' : 'Não'}`,
      inline: false
    });
  } else {
    embed.addFields({
      name: '📋 Próximas',
      value: 'Nenhuma música na fila.\nUse `/play` para adicionar mais músicas!',
      inline: false
    });
  }
  
  return embed;
}

/**
 * Create queue components
 */
async function createQueueComponents(queue: any, page: number): Promise<any[]> {
  const components = [];
  
  // Control buttons
  const controlsRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
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
        .setEmoji('🗑️')
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
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    if (page < totalPages) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId('queue_next')
          .setLabel('Próxima ▶️')
          .setStyle(ButtonStyle.Primary)
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
          description: `${track.author.substring(0, 90)} • ${formatDuration(track.duration)}`,
          value: (index + 1).toString()
        }))
      );
    
    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(removeSelect);
    
    components.push(selectRow);
  }
  
  return components;
}

/**
 * Get loop mode text
 */
function getLoopModeText(mode: string): string {
  switch (mode) {
    case 'queue': return '🔁 Fila';
    case 'track': return '🔂 Música';
    default: return '❌ Desativado';
  }
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

export default queue;