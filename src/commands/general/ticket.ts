import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ComponentType,
} from 'discord.js';
import { Command } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';

const logger = new Logger();

export default {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Sistema de tickets para suporte')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Criar um novo ticket')
        .addStringOption(option =>
          option
            .setName('assunto')
            .setDescription('Assunto do ticket')
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption(option =>
          option
            .setName('descricao')
            .setDescription('Descrição detalhada do problema')
            .setRequired(true)
            .setMaxLength(1000)
        )
        .addStringOption(option =>
          option
            .setName('prioridade')
            .setDescription('Prioridade do ticket')
            .setRequired(false)
            .addChoices(
              { name: '🟢 Baixa', value: 'low' },
              { name: '🟡 Média', value: 'medium' },
              { name: '🟠 Alta', value: 'high' },
              { name: '🔴 Urgente', value: 'urgent' }
            )
        )
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
              { name: 'Fechados', value: 'closed' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Fechar um ticket')
        .addStringOption(option =>
          option.setName('ticket_id').setDescription('ID do ticket para fechar').setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('motivo')
            .setDescription('Motivo para fechar o ticket')
            .setRequired(false)
            .setMaxLength(500)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName('panel').setDescription('Criar painel de tickets (Admin apenas)')
    )
    .addSubcommand(subcommand =>
      subcommand.setName('stats').setDescription('Estatísticas de tickets (Admin apenas)')
    ),

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    try {
      const subcommand = interaction.options.getSubcommand();
      const ticketService = client.services?.ticket;

      if (!ticketService) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erro')
          .setDescription('Serviço de tickets não está disponível.')
          .setColor('#FF0000');

        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
          await interaction.reply({ content: 'Subcomando não reconhecido.', ephemeral: true });
      }
    } catch (error) {
      logger.error('Error in ticket command:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao processar o comando.')
        .setColor('#FF0000');

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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

  await interaction.deferReply({ ephemeral: true });

  const result = await ticketService.createTicket(
    interaction.guildId!,
    interaction.user.id,
    assunto,
    descricao,
    prioridade
  );

  if (result.success) {
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Ticket Criado!')
      .setDescription(
        `Seu ticket foi criado com sucesso!\n\n**Canal:** ${result.channel}\n**ID:** #${result.ticket!.id.slice(-8)}`
      )
      .setColor('#00FF00')
      .addFields(
        { name: '📝 Assunto', value: assunto, inline: true },
        { name: '📊 Prioridade', value: prioridade.toUpperCase(), inline: true },
        { name: '⏰ Criado em', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setFooter({ text: 'Nossa equipe irá atendê-lo em breve!' });

    await interaction.editReply({ embeds: [successEmbed] });
  } else {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro ao Criar Ticket')
      .setDescription(result.message)
      .setColor('#FF0000');

    await interaction.editReply({ embeds: [errorEmbed] });
  }
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

  await interaction.deferReply({ ephemeral: true });

  const userTickets = ticketService.getUserTickets(interaction.guildId!, interaction.user.id);
  let filteredTickets = userTickets;

  if (status) {
    filteredTickets = userTickets.filter((ticket: any) => ticket.status === status);
  }

  if (filteredTickets.length === 0) {
    const noTicketsEmbed = new EmbedBuilder()
      .setTitle('📋 Seus Tickets')
      .setDescription(
        status ? `Você não possui tickets com status "${status}".` : 'Você não possui tickets.'
      )
      .setColor('#FFA500')
      .setFooter({ text: 'Use /ticket create para criar um novo ticket' });

    await interaction.editReply({ embeds: [noTicketsEmbed] });
    return;
  }

  const statusEmojis = {
    open: '🟢',
    in_progress: '🟡',
    closed: '🔴',
  };

  const priorityEmojis = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    urgent: '🔴',
  };

  const ticketList = filteredTickets
    .map((ticket: any) => {
      const statusEmoji = statusEmojis[ticket.status as keyof typeof statusEmojis];
      const priorityEmoji = priorityEmojis[ticket.priority as keyof typeof priorityEmojis];
      const channelMention = ticket.channelId ? `<#${ticket.channelId}>` : 'Canal removido';

      return (
        `${statusEmoji} **#${ticket.id.slice(-8)}** - ${ticket.title}\n` +
        `${priorityEmoji} ${ticket.priority.toUpperCase()} | ${channelMention}\n` +
        `📅 <t:${Math.floor(ticket.createdAt.getTime() / 1000)}:R>`
      );
    })
    .join('\n\n');

  const listEmbed = new EmbedBuilder()
    .setTitle('📋 Seus Tickets')
    .setDescription(ticketList)
    .setColor('#0099FF')
    .setFooter({ text: `Total: ${filteredTickets.length} ticket(s)` });

  await interaction.editReply({ embeds: [listEmbed] });
}

/**
 * Handle close ticket subcommand
 */
async function handleCloseTicket(interaction: ChatInputCommandInteraction, ticketService: any) {
  const ticketId = interaction.options.getString('ticket_id', true);
  const motivo = interaction.options.getString('motivo') || 'Não especificado';

  await interaction.deferReply({ ephemeral: true });

  // Check if user owns the ticket or has permission to close it
  const ticket = ticketService.getTicketData(interaction.guildId!, ticketId);
  if (!ticket) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Ticket Não Encontrado')
      .setDescription('O ticket especificado não foi encontrado.')
      .setColor('#FF0000');

    await interaction.editReply({ embeds: [errorEmbed] });
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
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Sem Permissão')
      .setDescription(
        'Você só pode fechar seus próprios tickets ou precisa ter permissão de moderação.'
      )
      .setColor('#FF0000');

    await interaction.editReply({ embeds: [errorEmbed] });
    return;
  }

  const result = await ticketService.closeTicket(
    interaction.guildId!,
    ticketId,
    interaction.user.id,
    motivo
  );

  if (result.success) {
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Ticket Fechado')
      .setDescription(`Ticket #${ticketId.slice(-8)} foi fechado com sucesso.`)
      .setColor('#00FF00')
      .addFields(
        { name: '📝 Motivo', value: motivo, inline: false },
        { name: '👤 Fechado por', value: interaction.user.tag, inline: true },
        { name: '⏰ Fechado em', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      );

    await interaction.editReply({ embeds: [successEmbed] });
  } else {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro ao Fechar Ticket')
      .setDescription(result.message)
      .setColor('#FF0000');

    await interaction.editReply({ embeds: [errorEmbed] });
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
        'Você precisa ter permissão de "Gerenciar Servidor" para criar painéis de ticket.'
      )
      .setColor('#FF0000');

    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
        '🔴 **Urgente** - Problemas críticos que precisam de atenção imediata'
    )
    .setColor('#0099FF')
    .setThumbnail(interaction.guild?.iconURL() || null)
    .setFooter({ text: 'Clique no botão abaixo para criar um ticket' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('create_ticket_panel')
      .setLabel('Criar Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫')
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

    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

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
      { name: '🏁 Tempo Médio de Resolução', value: `${stats.avgResolutionTime} min`, inline: true }
    )
    .setFooter({ text: 'Estatísticas do servidor atual' })
    .setTimestamp();

  await interaction.editReply({ embeds: [statsEmbed] });
}
