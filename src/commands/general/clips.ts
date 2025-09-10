import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  AttachmentBuilder,
} from 'discord.js';
import { BaseCommand } from '../../utils/base-command.util';
import { DatabaseService } from '../../database/database.service';
import { ExtendedClient } from '../../types/client';
import { CommandCategory } from '../../types/command';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Database will be accessed through client.database

class ClipsCommand extends BaseCommand {
  constructor() {
    super({
      data: new SlashCommandBuilder()
        .setName('clips')
        .setDescription('Sistema de clips e highlights')
        .addSubcommand(subcommand =>
          subcommand
            .setName('upload')
            .setDescription('Fazer upload de um clip')
            .addAttachmentOption(option =>
              option.setName('video').setDescription('Arquivo de vídeo do clip').setRequired(true)
            )
            .addStringOption(option =>
              option
                .setName('title')
                .setDescription('Título do clip')
                .setRequired(true)
                .setMaxLength(100)
            )
            .addStringOption(option =>
              option
                .setName('description')
                .setDescription('Descrição do clip')
                .setRequired(false)
                .setMaxLength(500)
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
                  { name: 'Outros', value: 'outros' }
                )
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('list')
            .setDescription('Listar clips')
            .addStringOption(option =>
              option
                .setName('filter')
                .setDescription('Filtro para os clips')
                .setRequired(false)
                .addChoices(
                  { name: 'Meus clips', value: 'my' },
                  { name: 'Mais curtidos', value: 'top' },
                  { name: 'Em destaque', value: 'featured' },
                  { name: 'Por jogo', value: 'game' },
                  { name: 'Mais recentes', value: 'recent' }
                )
            )
            .addStringOption(option =>
              option
                .setName('game')
                .setDescription('Filtrar por jogo específico')
                .setRequired(false)
                .addChoices(
                  { name: 'PUBG', value: 'pubg' },
                  { name: 'Valorant', value: 'valorant' },
                  { name: 'CS2', value: 'cs2' },
                  { name: 'Apex Legends', value: 'apex' },
                  { name: 'Fortnite', value: 'fortnite' },
                  { name: 'Outros', value: 'outros' }
                )
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('info')
            .setDescription('Ver informações detalhadas de um clip')
            .addStringOption(option =>
              option.setName('clip_id').setDescription('ID do clip').setRequired(true)
            )
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('delete')
            .setDescription('Deletar um clip')
            .addStringOption(option =>
              option.setName('clip_id').setDescription('ID do clip para deletar').setRequired(true)
            )
        ),
      category: 'general',
      cooldown: 5,
    });
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    const database = client.database;
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'upload':
          await this.handleUpload(interaction, database);
          break;
        case 'list':
          await this.handleList(interaction, database);
          break;
        case 'info':
          await this.handleInfo(interaction, database);
          break;
        case 'delete':
          await this.handleDelete(interaction as ChatInputCommandInteraction, database);
          break;
        default:
          await interaction.reply({
            content: '❌ Subcomando não reconhecido.',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      console.error('Erro no comando clips:', error);
      const errorMessage = '❌ Ocorreu um erro ao executar o comando.';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }

  private async handleUpload(interaction: ChatInputCommandInteraction, database: DatabaseService) {
    const video = interaction.options.getAttachment('video', true);
    const title = interaction.options.getString('title', true);
    const description = interaction.options.getString('description') || null;
    const gameType = interaction.options.getString('game') || 'outros';

    // Validar arquivo de vídeo
    if (!video.contentType?.startsWith('video/')) {
      await interaction.reply({
        content: '❌ Por favor, envie apenas arquivos de vídeo.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Validar tamanho do arquivo (50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (video.size > maxSize) {
      await interaction.reply({
        content: `❌ O arquivo é muito grande. Tamanho máximo: ${this.formatFileSize(maxSize)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    try {
      // Verificar se o usuário existe no banco
      let user = await database.client.user.findUnique({
        where: { id: interaction.user.id },
      });

      if (!user) {
        user = await database.client.user.create({
          data: {
            id: interaction.user.id,
            username: interaction.user.username,
            discriminator: interaction.user.discriminator || '0',
          },
        });
      }

      // Criar registro do clip
      const clip = await database.client.clip.create({
        data: {
          title,
          description,
          url: video.url,
          gameType,
          userId: user.id,
          guildId: interaction.guildId!,
          fileSize: video.size,
          duration: null, // Pode ser implementado posteriormente
        },
      });

      const embed = HawkEmbedBuilder.createSuccessEmbed('Clip Enviado com Sucesso!')
        .setDescription(`**${title}**\n${description || 'Sem descrição'}`)
        .addFields(
          { name: '🎮 Jogo', value: gameType.toUpperCase(), inline: true },
          { name: '📁 Tamanho', value: this.formatFileSize(video.size), inline: true },
          { name: '🆔 ID do Clip', value: clip.id, inline: true }
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: `Enviado por ${interaction.user.username}` });

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('Erro ao fazer upload do clip:', error);
      await interaction.editReply({
        content: '❌ Erro ao salvar o clip. Tente novamente.',
      });
    }
  }

  private async handleList(interaction: ChatInputCommandInteraction, database: DatabaseService) {
    const filter = interaction.options.getString('filter') || 'recent';
    const gameType = interaction.options.getString('game');

    await interaction.deferReply();

    try {
      const whereClause: any = {};
      let orderBy: any = { createdAt: 'desc' };

      // Aplicar filtros
      switch (filter) {
        case 'my':
          const user = await database.client.user.findUnique({
            where: { id: interaction.user.id },
          });
          if (!user) {
            await interaction.editReply({
              content: '❌ Você ainda não enviou nenhum clip.',
            });
            return;
          }
          whereClause.userId = user.id;
          break;
        case 'top':
          orderBy = { votes: { _count: 'desc' } };
          break;
        case 'featured':
          whereClause.featured = true;
          break;
        case 'game':
          if (gameType) {
            whereClause.gameType = gameType;
          }
          break;
      }

      if (gameType && filter !== 'game') {
        whereClause.gameType = gameType;
      }

      const clips = await database.client.clip.findMany({
        where: whereClause,
        orderBy,
        take: 10,
        include: {
          user: {
            select: {
              username: true,
            },
          },
          _count: {
            select: {
              votes: true,
            },
          },
        },
      });

      if (clips.length === 0) {
        await interaction.editReply({
          content: '❌ Nenhum clip encontrado com os filtros aplicados.',
        });
        return;
      }

      const embed = HawkEmbedBuilder.createInfoEmbed('🎬 Lista de Clips')
        .setDescription(this.getFilterDescription(filter, gameType))
        .setFooter({ text: `${clips.length} clips encontrados` });

      clips.forEach((clip, index) => {
        const gameEmoji = this.getGameEmoji(clip.gameType);
        const timeAgo = new Date(clip.createdAt).toLocaleDateString('pt-BR');

        embed.addFields({
          name: `${index + 1}. ${gameEmoji} ${clip.title}`,
          value: `👤 **${clip.user.username}** | 👍 ${clip._count.votes} votos | 🕒 ${timeAgo}\n🆔 \`${clip.id}\``,
          inline: false,
        });
      });

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('Erro ao listar clips:', error);
      await interaction.editReply({
        content: '❌ Erro ao carregar a lista de clips.',
      });
    }
  }

  private async handleInfo(interaction: ChatInputCommandInteraction, database: DatabaseService) {
    const clipId = interaction.options.getString('clip_id', true);

    await interaction.deferReply();

    try {
      const clip = await database.client.clip.findUnique({
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
              userId: true,
              type: true,
            },
          },
        },
      });

      if (!clip) {
        await interaction.editReply({
          content: '❌ Clip não encontrado.',
        });
        return;
      }

      const upvotes = clip.votes.filter(vote => vote.type === 'UPVOTE').length;
      const downvotes = clip.votes.filter(vote => vote.type === 'DOWNVOTE').length;
      const totalVotes = upvotes - downvotes;

      const gameEmoji = this.getGameEmoji(clip.gameType);
      const timeAgo = new Date(clip.createdAt).toLocaleDateString('pt-BR');

      const embed = HawkEmbedBuilder.createInfoEmbed(`${gameEmoji} ${clip.title}`)
        .setDescription(clip.description || 'Sem descrição')
        .addFields(
          { name: '👤 Autor', value: clip.user.username, inline: true },
          { name: '🎮 Jogo', value: clip.gameType.toUpperCase(), inline: true },
          { name: '📁 Tamanho', value: this.formatFileSize(clip.fileSize), inline: true },
          { name: '👍 Curtidas', value: upvotes.toString(), inline: true },
          { name: '👎 Descurtidas', value: downvotes.toString(), inline: true },
          { name: '📊 Total', value: totalVotes.toString(), inline: true },
          { name: '🕒 Enviado', value: timeAgo, inline: false },
          { name: '🆔 ID', value: clipId, inline: false }
        )
        .setFooter({ text: 'Use os botões abaixo para votar no clip' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`clip_vote_up_${clipId}`)
          .setLabel('👍')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`clip_vote_down_${clipId}`)
          .setLabel('👎')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setLabel('🔗 Ver Clip').setStyle(ButtonStyle.Link).setURL(clip.url)
      );

      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
    } catch (error) {
      console.error('Erro ao buscar informações do clip:', error);
      await interaction.editReply({
        content: '❌ Erro ao carregar informações do clip.',
      });
    }
  }

  private async handleDelete(interaction: ChatInputCommandInteraction, database: DatabaseService) {
    const clipId = interaction.options.getString('clip_id', true);

    try {
      // Verificar se o clip existe
      const clip = await database.client.clip.findUnique({
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
      await database.client.clipVote.deleteMany({
        where: { clipId: clipId },
      });

      // Deletar o clip
      await database.client.clip.delete({
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

  private getGameEmoji(gameType: string): string {
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

  private getFilterDescription(filter: string, gameType?: string | null): string {
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

  private formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) {
      return '0 Bytes';
    }
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

const commandInstance = new ClipsCommand();

export const command = {
  data: commandInstance.data,
  category: CommandCategory.GENERAL,
  cooldown: 5,
  execute: (interaction: ChatInputCommandInteraction, client: ExtendedClient) =>
    commandInstance.execute(interaction, client),
};

export default command;
