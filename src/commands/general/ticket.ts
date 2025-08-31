import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ComponentType,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { Command } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { HawkEmbedBuilder } from '../../utils/hawk-embed-builder';
import { HawkComponentFactory } from '../../utils/hawk-component-factory';
import { HAWK_EMOJIS } from '../../constants/hawk-emojis';

const logger = new Logger();

export default {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription(`${HAWK_EMOJIS.SYSTEM.TICKET} Sistema de tickets para suporte`)
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Criar um novo ticket')
        .addStringOption(option =>
          option
            .setName('assunto')
            .setDescription('Assunto do ticket')
            .setRequired(true)
            .setMaxLength(100),
        )
        .addStringOption(option =>
          option
            .setName('descricao')
            .setDescription('Descrição detalhada do problema')
            .setRequired(true)
            .setMaxLength(1000),
        )
        .addStringOption(option =>
          option
            .setName('prioridade')
            .setDescription('Prioridade do ticket')
            .setRequired(false)
            .addChoices(
              { name: `${HAWK_EMOJIS.STATUS.SUCCESS} Baixa`, value: 'low' },
              { name: `${HAWK_EMOJIS.STATUS.WARNING} Média`, value: 'medium' },
              { name: `${HAWK_EMOJIS.STATUS.ERROR} Alta`, value: 'high' },
              { name: `${HAWK_EMOJIS.STATUS.ERROR} Urgente`, value: 'urgent' },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Listar seus tickets')
        .addStringOption(option =>
          option
            .setName('status')
            .setDescription('Filtrar por status')
            .setRequired(false)
            .addChoices(
              { name: 'Abertos', value: 'open' },
              { name: 'Em andamento', value: 'in_progress' },
              { name: 'Fechados', value: 'closed' },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Fechar um ticket')
        .addStringOption(option =>
          option.setName('ticket_id').setDescription('ID do ticket para fechar').setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('motivo')
            .setDescription('Motivo para fechar o ticket')
            .setRequired(false)
            .setMaxLength(500),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('panel').setDescription('Criar painel de tickets (Admin apenas)'),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('stats').setDescription('Estatísticas de tickets (Admin apenas)'),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const ticketService = client.services?.ticket;

      if (!ticketService) {
        const errorEmbed = HawkEmbedBuilder.createError(
          'Serviço Indisponível',
          `${HAWK_EMOJIS.STATUS.ERROR} O serviço de tickets não está disponível no momento.\n\n${HAWK_EMOJIS.HELP} Entre em contato com um administrador.`
        );

        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        return;
      }

      switch (subcommand) {
        case 'create':
          await handleCreateTicket(interaction, ticketService);
          break;
        case 'list':
          await handleListTickets(interaction, ticketService);
          break;
        case 'close':
          await handleCloseTicket(interaction, ticketService);
          break;
        case 'panel':
          await handleCreatePanel(interaction, ticketService);
          break;
        case 'stats':
          await handleTicketStats(interaction, ticketService);
          break;
        default:
          await interaction.reply({ content: 'Subcomando não reconhecido.', flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      logger.error('Error in ticket command:', error);

      const errorEmbed = HawkEmbedBuilder.createError(
        'Erro no Comando',
        `${HAWK_EMOJIS.STATUS.ERROR} Ocorreu um erro inesperado ao processar o comando.\n\n${HAWK_EMOJIS.HELP} Tente novamente ou entre em contato com um administrador.`
      );

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  },
} as Command;

/**
 * Handle create ticket subcommand
 */
async function handleCreateTicket(interaction: ChatInputCommandInteraction, ticketService: any) {
  const assunto = interaction.options.getString('assunto', true);
  const descricao = interaction.options.getString('descricao', true);
  const prioridade =
    (interaction.options.getString('prioridade') as 'low' | 'medium' | 'high' | 'urgent') ||
    'medium';

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await ticketService.createTicket(
    interaction.guildId!,
    interaction.user.id,
    assunto,
    descricao,
    prioridade,
  );

  if (result.success) {
    const successEmbed = HawkEmbedBuilder.createSuccess(
      'Ticket Criado com Sucesso!',
      `${HAWK_EMOJIS.STATUS.SUCCESS} Seu ticket foi criado e nossa equipe será notificada.\n\n${HAWK_EMOJIS.SYSTEM.CHANNEL} **Canal:** ${result.channel}\n${HAWK_EMOJIS.TICKETS.ID} **ID:** #${result.ticket!.id.slice(-8)}`
    )
    .addFields(
      { name: `${HAWK_EMOJIS.TICKETS.SUBJECT} Assunto`, value: assunto, inline: true },
      { name: `${HAWK_EMOJIS.TICKETS.PRIORITY} Prioridade`, value: `${getPriorityEmoji(prioridade)} ${prioridade.toUpperCase()}`, inline: true },
      { name: `${HAWK_EMOJIS.TIME.CREATED} Criado em`, value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    )
    .setFooter({ text: `${HAWK_EMOJIS.SUPPORT} Nossa equipe irá atendê-lo em breve!` });

    const actionRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: 'view_ticket',
        label: 'Ver Ticket',
        style: ButtonStyle.Primary,
        emoji: '👁️'
      }),
      HawkComponentFactory.createButton({
        customId: 'ticket_help',
        label: 'Ajuda',
        style: ButtonStyle.Secondary,
        emoji: 'ℹ️'
      })
    ]);

    await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
  } else {
    const errorEmbed = HawkEmbedBuilder.createError(
      'Erro ao Criar Ticket',
      `${HAWK_EMOJIS.STATUS.ERROR} ${result.message}\n\n${HAWK_EMOJIS.HELP} Verifique os dados e tente novamente.`
    );

    const actionRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: 'retry_ticket',
        label: 'Tentar Novamente',
        style: ButtonStyle.Primary,
        emoji: '🔄'
      })
    ]);

    await interaction.editReply({ embeds: [errorEmbed], components: [actionRow] });
  }
}

/**
 * Get priority emoji for tickets
 */
function getPriorityEmoji(priority: string): string {
  const priorityEmojis: Record<string, string> = {
    low: HAWK_EMOJIS.STATUS.SUCCESS,
    medium: HAWK_EMOJIS.STATUS.WARNING,
    high: HAWK_EMOJIS.STATUS.ERROR,
    urgent: HAWK_EMOJIS.STATUS.ERROR
  };
  return priorityEmojis[priority] || HAWK_EMOJIS.STATUS.WARNING;
}

/**
 * Handle list tickets subcommand
 */
async function handleListTickets(interaction: ChatInputCommandInteraction, ticketService: any) {
  const status = interaction.options.getString('status') as
    | 'open'
    | 'in_progress'
    | 'closed'
    | null;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userTickets = ticketService.getUserTickets(interaction.guildId!, interaction.user.id);
  let filteredTickets = userTickets;

  if (status) {
    filteredTickets = userTickets.filter((ticket: any) => ticket.status === status);
  }

  if (filteredTickets.length === 0) {
    const noTicketsEmbed = HawkEmbedBuilder.createWarning(
      'Nenhum Ticket Encontrado',
      status 
        ? `${HAWK_EMOJIS.STATUS.WARNING} Você não possui tickets com status "${status}".\n\n${HAWK_EMOJIS.TICKETS.CREATE} Use \`/ticket create\` para criar um novo ticket.`
        : `${HAWK_EMOJIS.STATUS.WARNING} Você ainda não possui tickets.\n\n${HAWK_EMOJIS.TICKETS.CREATE} Use \`/ticket create\` para criar seu primeiro ticket.`
    );

    const actionRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: 'create_ticket',
        label: 'Criar Ticket',
        style: ButtonStyle.Primary,
        emoji: '🎫'
      })
    ]);

    await interaction.editReply({ embeds: [noTicketsEmbed], components: [actionRow] });
    return;
  }

  const statusEmojis = {
    open: HAWK_EMOJIS.STATUS.INFO,
    in_progress: HAWK_EMOJIS.STATUS.WARNING,
    closed: HAWK_EMOJIS.STATUS.SUCCESS,
  };

  const ticketList = filteredTickets
    .map((ticket: any) => {
      const statusEmoji = statusEmojis[ticket.status as keyof typeof statusEmojis];
      const priorityEmoji = getPriorityEmoji(ticket.priority);
      const channelMention = ticket.channelId ? `<#${ticket.channelId}>` : `${HAWK_EMOJIS.STATUS.ERROR} Canal removido`;

      return (
        `${statusEmoji} **#${ticket.id.slice(-8)}** - ${ticket.title}\n` +
        `${priorityEmoji} ${ticket.priority.toUpperCase()} | ${channelMention}\n` +
        `${HAWK_EMOJIS.TIME.CREATED} <t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>`
      );
    })
    .join('\n\n');

  const listEmbed = HawkEmbedBuilder.createInfo(
    'Seus Tickets',
    ticketList
  )
  .setFooter({ 
    text: `${HAWK_EMOJIS.STATS} Total: ${filteredTickets.length} ticket(s) ${status ? `| Filtro: ${status}` : ''}` 
  });

  const actionRow = HawkComponentFactory.createActionRow([
    HawkComponentFactory.createButton({
      customId: 'create_ticket',
      label: 'Novo Ticket',
      style: ButtonStyle.Primary,
      emoji: '🎫'
    }),
    HawkComponentFactory.createButton({
      customId: 'refresh_tickets',
      label: 'Atualizar',
      style: ButtonStyle.Secondary,
      emoji: '🔄'
    })
  ]);

  await interaction.editReply({ embeds: [listEmbed], components: [actionRow] });
}

/**
 * Handle close ticket subcommand
 */
async function handleCloseTicket(interaction: ChatInputCommandInteraction, ticketService: any) {
  const ticketId = interaction.options.getString('ticket_id', true);
  const motivo = interaction.options.getString('motivo') || 'Não especificado';

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Check if user owns the ticket or has permission to close it
  const ticket = ticketService.getTicketData(interaction.guildId!, ticketId);
  if (!ticket) {
    const errorEmbed = HawkEmbedBuilder.createError(
      'Ticket Não Encontrado',
      `${HAWK_EMOJIS.STATUS.ERROR} O ticket especificado não foi encontrado.\n\n${HAWK_EMOJIS.TICKETS.ID} Verifique se o ID está correto: \`${ticketId}\``
    );

    const actionRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: 'list_tickets',
        label: 'Ver Meus Tickets',
        style: ButtonStyle.Primary,
        emoji: '📋'
      })
    ]);

    await interaction.editReply({ embeds: [errorEmbed], components: [actionRow] });
    return;
  }

  // Check permissions
  const member = interaction.member;
  const canClose =
    ticket.userId === interaction.user.id ||
    (member &&
      'permissions' in member &&
      typeof member.permissions !== 'string' &&
      member.permissions.has(PermissionFlagsBits.ManageMessages));

  if (!canClose) {
    const errorEmbed = HawkEmbedBuilder.createError(
      'Sem Permissão',
      `${HAWK_EMOJIS.STATUS.ERROR} Você só pode fechar seus próprios tickets.\n\n${HAWK_EMOJIS.SYSTEM.PERMISSIONS} Ou precisa ter permissão de moderação para fechar tickets de outros usuários.`
    );

    const actionRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: 'list_my_tickets',
        label: 'Meus Tickets',
        style: ButtonStyle.Primary,
        emoji: '📋'
      })
    ]);

    await interaction.editReply({ embeds: [errorEmbed], components: [actionRow] });
    return;
  }

  const result = await ticketService.closeTicket(
    interaction.guildId!,
    ticketId,
    interaction.user.id,
    motivo,
  );

  if (result.success) {
    const successEmbed = HawkEmbedBuilder.createSuccess(
      'Ticket Fechado com Sucesso',
      `${HAWK_EMOJIS.STATUS.SUCCESS} O ticket #${ticketId.slice(-8)} foi fechado e arquivado.`
    )
    .addFields(
      { name: `${HAWK_EMOJIS.TICKETS.REASON} Motivo`, value: motivo, inline: false },
      { name: `${HAWK_EMOJIS.MODERATOR} Fechado por`, value: interaction.user.tag, inline: true },
      { name: `${HAWK_EMOJIS.TIME.CLOSED} Fechado em`, value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    );

    const actionRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: 'list_tickets',
        label: 'Ver Tickets',
        style: ButtonStyle.Secondary,
        emoji: '📋'
      }),
      HawkComponentFactory.createButton({
        customId: 'create_ticket',
        label: 'Novo Ticket',
        style: ButtonStyle.Primary,
        emoji: '🎫'
      })
    ]);

    await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
  } else {
    const errorEmbed = HawkEmbedBuilder.createError(
      'Erro ao Fechar Ticket',
      `${HAWK_EMOJIS.STATUS.ERROR} ${result.message}\n\n${HAWK_EMOJIS.HELP} Tente novamente ou entre em contato com um administrador.`
    );

    const actionRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: 'retry_close',
        label: 'Tentar Novamente',
        style: ButtonStyle.Primary,
        emoji: '🔄'
      })
    ]);

    await interaction.editReply({ embeds: [errorEmbed], components: [actionRow] });
  }
}

/**
 * Handle create panel subcommand
 */
async function handleCreatePanel(interaction: ChatInputCommandInteraction, ticketService: any) {
  // Check permissions
  const member = interaction.member;
  if (
    !member ||
    !('permissions' in member) ||
    typeof member.permissions === 'string' ||
    !member.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Sem Permissão')
      .setDescription(
        'Você precisa ter permissão de "Gerenciar Servidor" para criar painéis de ticket.',
      )
      .setColor('#FF0000');

    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    return;
  }

  const panelEmbed = new EmbedBuilder()
    .setTitle('🎫 Sistema de Tickets')
    .setDescription(
      '**Precisa de ajuda?** Crie um ticket e nossa equipe irá atendê-lo!\n\n' +
        '**Como funciona:**\n' +
        '• Clique no botão abaixo para criar um ticket\n' +
        '• Descreva seu problema ou dúvida\n' +
        '• Nossa equipe irá responder em breve\n' +
        '• O ticket será fechado quando resolvido\n\n' +
        '**Tipos de suporte:**\n' +
        '🟢 **Dúvidas gerais** - Perguntas sobre o servidor\n' +
        '🟡 **Problemas técnicos** - Bugs ou erros\n' +
        '🟠 **Denúncias** - Reportar comportamento inadequado\n' +
        '🔴 **Urgente** - Problemas críticos que precisam de atenção imediata',
    )
    .setColor('#0099FF')
    .setThumbnail(interaction.guild?.iconURL() || null)
    .setFooter({ text: 'Clique no botão abaixo para criar um ticket' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('create_ticket_panel')
      .setLabel('Criar Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫'),
  );

  await interaction.reply({ embeds: [panelEmbed], components: [row] });
}

/**
 * Handle ticket stats subcommand
 */
async function handleTicketStats(interaction: ChatInputCommandInteraction, ticketService: any) {
  // Check permissions
  const member = interaction.member;
  if (
    !member ||
    !('permissions' in member) ||
    typeof member.permissions === 'string' ||
    !member.permissions.has(PermissionFlagsBits.ManageMessages)
  ) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Sem Permissão')
      .setDescription('Você precisa ter permissão de moderação para ver estatísticas de tickets.')
      .setColor('#FF0000');

    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const stats = await ticketService.getTicketStats(interaction.guildId!);

  const statsEmbed = new EmbedBuilder()
    .setTitle('📊 Estatísticas de Tickets')
    .setColor('#0099FF')
    .addFields(
      { name: '📋 Total de Tickets', value: stats.total.toString(), inline: true },
      { name: '🟢 Abertos', value: stats.open.toString(), inline: true },
      { name: '🟡 Em Andamento', value: stats.inProgress.toString(), inline: true },
      { name: '🔴 Fechados', value: stats.closed.toString(), inline: true },
      { name: '⏱️ Tempo Médio de Resposta', value: `${stats.avgResponseTime} min`, inline: true },
      { name: '🏁 Tempo Médio de Resolução', value: `${stats.avgResolutionTime} min`, inline: true },
    )
    .setFooter({ text: 'Estatísticas do servidor atual' })
    .setTimestamp();

  await interaction.editReply({ embeds: [statsEmbed] });
}
