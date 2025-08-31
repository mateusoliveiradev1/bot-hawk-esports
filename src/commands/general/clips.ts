import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  CommandInteraction,
  MessageFlags,
} from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { BadgeService } from '../../services/badge.service';
import { DatabaseService } from '../../database/database.service';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';

const prisma = new PrismaClient();
const database = new DatabaseService();

const data = new SlashCommandBuilder()
  .setName('clips')
  .setDescription('Sistema de clips e highlights')
  .addSubcommand(subcommand =>
    subcommand
      .setName('upload')
      .setDescription('Fazer upload de um clip')
      .addAttachmentOption(option =>
        option.setName('video').setDescription('Arquivo de vídeo do clip').setRequired(true),
      )
      .addStringOption(option =>
        option.setName('title').setDescription('Título do clip').setRequired(true).setMaxLength(100),
      )
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('Descrição do clip')
          .setRequired(false)
          .setMaxLength(500),
      )
      .addStringOption(option =>
        option
          .setName('game')
          .setDescription('Jogo do clip')
          .setRequired(false)
          .addChoices(
            { name: 'PUBG', value: 'pubg' },
            { name: 'Valorant', value: 'valorant' },
            { name: 'CS2', value: 'cs2' },
            { name: 'Apex Legends', value: 'apex' },
            { name: 'Fortnite', value: 'fortnite' },
            { name: 'Outros', value: 'outros' },
          ),
      )
      .addStringOption(option =>
        option
          .setName('tags')
          .setDescription('Tags do clip (separadas por vírgula)')
          .setRequired(false)
          .setMaxLength(200),
      ),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('Listar clips')
      .addStringOption(option =>
        option
          .setName('filter')
          .setDescription('Filtrar clips')
          .setRequired(false)
          .addChoices(
            { name: 'Meus clips', value: 'my' },
            { name: 'Mais curtidos', value: 'top' },
            { name: 'Recentes', value: 'recent' },
            { name: 'Em destaque', value: 'featured' },
            { name: 'Por jogo', value: 'game' },
          ),
      )
      .addStringOption(option =>
        option
          .setName('game')
          .setDescription('Filtrar por jogo')
          .setRequired(false)
          .addChoices(
            { name: 'PUBG', value: 'pubg' },
            { name: 'Valorant', value: 'valorant' },
            { name: 'CS2', value: 'cs2' },
            { name: 'Apex Legends', value: 'apex' },
            { name: 'Fortnite', value: 'fortnite' },
            { name: 'Outros', value: 'outros' },
          ),
      ),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('vote')
      .setDescription('Votar em um clip')
      .addStringOption(option =>
        option.setName('clip_id').setDescription('ID do clip').setRequired(true),
      )
      .addStringOption(option =>
        option
          .setName('vote_type')
          .setDescription('Tipo de voto')
          .setRequired(true)
          .addChoices(
            { name: '👍 Curtir', value: 'like' },
            { name: '👎 Não curtir', value: 'dislike' },
          ),
      ),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('info')
      .setDescription('Ver informações detalhadas de um clip')
      .addStringOption(option =>
        option.setName('clip_id').setDescription('ID do clip').setRequired(true),
      ),
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Deletar um clip (apenas o autor ou moderadores)')
      .addStringOption(option =>
        option.setName('clip_id').setDescription('ID do clip').setRequired(true),
      ),
  );

async function execute(
  interaction: CommandInteraction | ChatInputCommandInteraction,
  client: ExtendedClient,
): Promise<void> {
  const subcommand = (interaction as ChatInputCommandInteraction).options.getSubcommand();
  const xpService = (client as any).xpService;
  const badgeService = (client as any).badgeService;

  try {
    switch (subcommand) {
      case 'upload':
        await handleUpload(interaction as ChatInputCommandInteraction, badgeService);
        break;
      case 'list':
        await handleList(interaction as ChatInputCommandInteraction);
        break;
      case 'vote':
        await handleVote(interaction as ChatInputCommandInteraction, badgeService);
        break;
      case 'info':
        await handleInfo(interaction as ChatInputCommandInteraction);
        break;
      case 'delete':
        await handleDelete(interaction as ChatInputCommandInteraction);
        break;
      default:
        await interaction.reply({
          content: '❌ Subcomando não reconhecido.',
          flags: MessageFlags.Ephemeral,
        });
    }
  } catch (error) {
    console.error('Erro no comando clips:', error);
    const errorMessage = '❌ Ocorreu um erro ao processar o comando.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleUpload(interaction: ChatInputCommandInteraction, badgeService: BadgeService) {
  await interaction.deferReply();

  const attachment = interaction.options.getAttachment('video');
  const title = interaction.options.getString('title', true);
  const description = interaction.options.getString('description') || '';
  const gameType = interaction.options.getString('game') || 'outros';
  const tagsInput = interaction.options.getString('tags') || '';
  const tags = tagsInput
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);

  if (!attachment) {
    await interaction.editReply('❌ Nenhum arquivo foi anexado.');
    return;
  }

  // Verificar se é um arquivo de vídeo
  const allowedTypes = ['video/mp4', 'video/webm', 'video/mov', 'video/avi', 'video/quicktime'];
  if (!allowedTypes.includes(attachment.contentType || '')) {
    await interaction.editReply(
      '❌ Apenas arquivos de vídeo são permitidos (MP4, WebM, MOV, AVI).',
    );
    return;
  }

  // Verificar tamanho do arquivo (máximo 50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (attachment.size > maxSize) {
    await interaction.editReply('❌ O arquivo deve ter no máximo 50MB.');
    return;
  }

  try {
    // Salvar clip no banco de dados
    const clip = await prisma.clip.create({
      data: {
        userId: interaction.user.id,
        guildId: interaction.guildId!,
        title,
        description,
        url: attachment.url,
        fileSize: attachment.size,
        gameType,
        tags: JSON.stringify(tags),
        likes: 0,
        dislikes: 0,
        views: 0,
      },
    });

    // Atualizar estatísticas do usuário e dar XP
    await prisma.user.upsert({
      where: { id: interaction.user.id },
      update: {
        xp: { increment: 10 },
        coins: { increment: 5 },
      },
      create: {
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator,
        xp: 10,
        coins: 5,
      },
    });

    // Atualizar progresso de badges
    try {
      await badgeService.updateProgress(interaction.user.id, 'clips_uploaded', 1);
    } catch (error) {
      console.log('Badge service not available:', error);
    }

    const embed = new EmbedBuilder()
      .setTitle('🎬 Clip Enviado com Sucesso!')
      .setDescription(`**${title}**\n${description}`)
      .addFields(
        {
          name: '🎮 Jogo',
          value: getGameEmoji(gameType) + ' ' + gameType.toUpperCase(),
          inline: true,
        },
        { name: '🆔 ID do Clip', value: `\`${clip.id}\``, inline: true },
        { name: '📊 Votos', value: '👍 0 | 👎 0', inline: true },
      )
      .setColor(0x00ff00)
      .setTimestamp()
      .setFooter({
        text: `Enviado por ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
      });

    if (tags.length > 0) {
      embed.addFields({
        name: '🏷️ Tags',
        value: tags.map(tag => `\`${tag}\``).join(' '),
        inline: false,
      });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`clip_like_${clip.id}`)
        .setLabel('👍 Curtir')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`clip_dislike_${clip.id}`)
        .setLabel('👎')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`clip_info_${clip.id}`)
        .setLabel('ℹ️ Info')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Erro ao salvar clip:', error);
    await interaction.editReply('❌ Erro ao salvar o clip. Tente novamente.');
  }
}

async function handleList(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const filter = interaction.options.getString('filter') || 'recent';
  const gameType = interaction.options.getString('game');

  const whereClause: any = {
    guildId: interaction.guildId,
  };
  let orderBy: any = { createdAt: 'desc' };

  switch (filter) {
    case 'my':
      whereClause.userId = interaction.user.id;
      break;
    case 'top':
      orderBy = { likes: 'desc' };
      break;
    case 'featured':
      whereClause.isFeatured = true;
      break;
    case 'game':
      if (gameType) {
        whereClause.gameType = gameType;
      }
      break;
  }

  try {
    const clips = await prisma.clip.findMany({
      where: whereClause,
      orderBy,
      take: 10,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        votes: true,
      },
    });

    if (clips.length === 0) {
      await interaction.editReply('📭 Nenhum clip encontrado com os filtros selecionados.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎬 Lista de Clips')
      .setDescription(getFilterDescription(filter, gameType))
      .setColor(0x0099ff)
      .setTimestamp();

    clips.forEach((clip, index) => {
      const username = clip.user?.username || 'Usuário Desconhecido';
      const votes = `👍 ${clip.likes} | 👎 ${clip.dislikes}`;
      const gameEmoji = getGameEmoji(clip.gameType || 'outros');
      const featured = clip.isFeatured ? '⭐ ' : '';

      embed.addFields({
        name: `${index + 1}. ${featured}${clip.title}`,
        value:
          `${gameEmoji} **${(clip.gameType || 'outros').toUpperCase()}** | ${votes} | 👁️ ${clip.views}\n` +
          `📤 Por: ${username} | 🆔 \`${clip.id}\`\n` +
          `${clip.description ? clip.description.substring(0, 100) + (clip.description.length > 100 ? '...' : '') : 'Sem descrição'}`,
        inline: false,
      });
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('clips_refresh')
        .setLabel('🔄 Atualizar')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('clips_filter')
        .setLabel('🔍 Filtrar')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Erro ao listar clips:', error);
    await interaction.editReply('❌ Erro ao carregar a lista de clips.');
  }
}

async function handleVote(interaction: ChatInputCommandInteraction, badgeService: BadgeService) {
  const clipId = interaction.options.getString('clip_id', true);
  const voteType = interaction.options.getString('vote_type', true);

  try {
    // Verificar se o clip existe
    const clip = await prisma.clip.findUnique({
      where: { id: clipId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!clip) {
      await interaction.reply({
        content: '❌ Clip não encontrado.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Verificar se o usuário já votou neste clip
    const existingVote = await prisma.clipVote.findUnique({
      where: {
        userId_clipId: {
          userId: interaction.user.id,
          clipId: clipId,
        },
      },
    });

    if (existingVote) {
      // Se já votou, verificar se é o mesmo tipo de voto
      if (existingVote.type === voteType) {
        await interaction.reply({
          content: '❌ Você já votou desta forma neste clip.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Remover voto anterior e atualizar contadores
      await prisma.clipVote.delete({
        where: { id: existingVote.id },
      });

      const oldVoteUpdate =
        existingVote.type === 'like' ? { likes: { decrement: 1 } } : { dislikes: { decrement: 1 } };

      await prisma.clip.update({
        where: { id: clipId },
        data: oldVoteUpdate,
      });
    }

    // Não permitir votar no próprio clip
    if (clip.userId === interaction.user.id) {
      await interaction.reply({
        content: '❌ Você não pode votar no seu próprio clip.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Registrar o novo voto
    await prisma.clipVote.create({
      data: {
        userId: interaction.user.id,
        clipId: clipId,
        type: voteType,
      },
    });

    // Atualizar contadores do clip
    const updateData =
      voteType === 'like' ? { likes: { increment: 1 } } : { dislikes: { increment: 1 } };

    const updatedClip = await prisma.clip.update({
      where: { id: clipId },
      data: updateData,
    });

    // Dar XP para o autor do clip se foi like
    if (voteType === 'like') {
      await prisma.user.upsert({
        where: { id: clip.userId },
        update: {
          xp: { increment: 2 },
        },
        create: {
          id: clip.userId,
          username: 'Unknown',
          discriminator: '0000',
          xp: 2,
        },
      });

      // Atualizar progresso de badges
      try {
        await badgeService.updateProgress(clip.userId, 'clips_votes', 1);
      } catch (error) {
        console.log('Badge service not available:', error);
      }
    }

    const voteEmoji = voteType === 'like' ? '👍' : '👎';
    const voteText = voteType === 'like' ? 'curtiu' : 'não curtiu';

    await interaction.reply({
      content:
        `${voteEmoji} Você ${voteText} o clip "**${clip.title}**"!\n` +
        `📊 Votos atuais: 👍 ${updatedClip.likes} | 👎 ${updatedClip.dislikes}`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Erro ao votar no clip:', error);
    await interaction.reply({
      content: '❌ Erro ao processar o voto.',
      ephemeral: true,
    });
  }
}

async function handleInfo(interaction: ChatInputCommandInteraction) {
  const clipId = interaction.options.getString('clip_id', true);

  try {
    const clip = await prisma.clip.findUnique({
      where: { id: clipId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        votes: {
          select: {
            type: true,
            user: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    if (!clip) {
      await interaction.reply({
        content: '❌ Clip não encontrado.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Incrementar visualizações
    await prisma.clip.update({
      where: { id: clipId },
      data: { views: { increment: 1 } },
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎬 ${clip.title}`)
      .setDescription(clip.description || 'Sem descrição')
      .addFields(
        { name: '👤 Autor', value: clip.user?.username || 'Desconhecido', inline: true },
        {
          name: '🎮 Jogo',
          value:
            getGameEmoji(clip.gameType || 'outros') +
            ' ' +
            (clip.gameType || 'outros').toUpperCase(),
          inline: true,
        },
        {
          name: '📊 Estatísticas',
          value: `👍 ${clip.likes} | 👎 ${clip.dislikes} | 👁️ ${clip.views + 1}`,
          inline: true,
        },
        {
          name: '📅 Enviado em',
          value: `<t:${Math.floor(clip.createdAt.getTime() / 1000)}:F>`,
          inline: true,
        },
        {
          name: '📁 Tamanho',
          value: clip.fileSize ? formatFileSize(clip.fileSize) : 'Desconhecido',
          inline: true,
        },
        { name: '🆔 ID', value: `\`${clip.id}\``, inline: true },
      )
      .setColor(clip.isFeatured ? 0xffd700 : 0x0099ff)
      .setTimestamp();

    const tags = clip.tags ? JSON.parse(clip.tags) : [];
    if (tags && tags.length > 0) {
      embed.addFields({
        name: '🏷️ Tags',
        value: tags.map((tag: string) => `\`${tag}\``).join(' '),
        inline: false,
      });
    }

    if (clip.isFeatured) {
      embed.setFooter({ text: '⭐ Clip em destaque' });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`clip_like_${clip.id}`)
        .setLabel('👍 Curtir')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`clip_dislike_${clip.id}`)
        .setLabel('👎')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setLabel('🔗 Ver Clip').setStyle(ButtonStyle.Link).setURL(clip.url),
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Erro ao buscar informações do clip:', error);
    await interaction.reply({
      content: '❌ Erro ao carregar informações do clip.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
  const clipId = interaction.options.getString('clip_id', true);

  try {
    // Verificar se o clip existe
    const clip = await prisma.clip.findUnique({
      where: { id: clipId },
    });

    if (!clip) {
      await interaction.reply({
        content: '❌ Clip não encontrado.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Verificar permissões (autor ou moderador)
    const isAuthor = clip.userId === interaction.user.id;
    const isModerator = interaction.memberPermissions?.has('ModerateMembers');

    if (!isAuthor && !isModerator) {
      await interaction.reply({
        content: '❌ Você só pode deletar seus próprios clips ou precisa ser moderador.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Deletar votos relacionados
    await prisma.clipVote.deleteMany({
      where: { clipId: clipId },
    });

    // Deletar o clip
    await prisma.clip.delete({
      where: { id: clipId },
    });

    await interaction.reply({
      content: `✅ Clip "**${clip.title}**" foi deletado com sucesso.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Erro ao deletar clip:', error);
    await interaction.reply({
      content: '❌ Erro ao deletar o clip.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

function getGameEmoji(gameType: string): string {
  const emojis: Record<string, string> = {
    pubg: '🔫',
    valorant: '🎯',
    cs2: '💥',
    apex: '🏆',
    fortnite: '🏗️',
    outros: '🎮',
  };
  return emojis[gameType] || '🎮';
}

function getFilterDescription(filter: string, gameType?: string | null): string {
  switch (filter) {
    case 'my':
      return 'Mostrando seus clips';
    case 'top':
      return 'Mostrando clips mais curtidos';
    case 'featured':
      return 'Mostrando clips em destaque';
    case 'game':
      return gameType
        ? `Mostrando clips de: ${gameType.toUpperCase()}`
        : 'Mostrando todos os clips';
    case 'recent':
      return 'Mostrando clips mais recentes';
    default:
      return 'Mostrando clips mais recentes';
  }
}

function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) {
    return '0 Bytes';
  }
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}

const clips: Command = {
  data,
  category: CommandCategory.CLIPS,
  cooldown: 5,
  execute,
};

export default clips;
