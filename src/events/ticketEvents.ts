import {
  ButtonInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { ExtendedClient } from '../types/client';
import { Logger } from '../utils/logger';

const logger = new Logger();

/**
 * Handle ticket-related button interactions
 */
export async function handleTicketButtonInteraction(
  interaction: ButtonInteraction,
  client: ExtendedClient,
): Promise<void> {
  try {
    const ticketService = client.services?.ticket;
    if (!ticketService) {
      await interaction.reply({ content: 'Serviço de tickets não disponível.', flags: MessageFlags.Ephemeral });
      return;
    }

    const customId = interaction.customId;

    if (customId === 'create_ticket_panel') {
      await handleCreateTicketFromPanel(interaction, ticketService);
    } else if (customId.startsWith('ticket_claim_')) {
      const ticketId = customId.replace('ticket_claim_', '');
      await handleClaimTicket(interaction, ticketService, ticketId);
    } else if (customId.startsWith('ticket_priority_')) {
      const ticketId = customId.replace('ticket_priority_', '');
      await handleChangePriority(interaction, ticketService, ticketId);
    } else if (customId.startsWith('ticket_close_')) {
      const ticketId = customId.replace('ticket_close_', '');
      await handleCloseTicketButton(interaction, ticketService, ticketId);
    } else if (customId.startsWith('priority_')) {
      await handlePrioritySelection(interaction, ticketService);
    }
  } catch (error) {
    logger.error('Error handling ticket button interaction:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Erro ao processar interação.', flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Handle ticket-related modal submissions
 */
export async function handleTicketModalSubmission(
  interaction: ModalSubmitInteraction,
  client: ExtendedClient,
): Promise<void> {
  try {
    const ticketService = client.services?.ticket;
    if (!ticketService) {
      await interaction.reply({ content: 'Serviço de tickets não disponível.', flags: MessageFlags.Ephemeral });
      return;
    }

    const customId = interaction.customId;

    if (customId === 'create_ticket_modal') {
      await handleCreateTicketModal(interaction, ticketService);
    } else if (customId.startsWith('close_ticket_modal_')) {
      const ticketId = customId.replace('close_ticket_modal_', '');
      await handleCloseTicketModal(interaction, ticketService, ticketId);
    }
  } catch (error) {
    logger.error('Error handling ticket modal submission:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Erro ao processar modal.', flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Handle create ticket from panel
 */
async function handleCreateTicketFromPanel(
  interaction: ButtonInteraction,
  ticketService: any,
): Promise<void> {
  const modal = new ModalBuilder().setCustomId('create_ticket_modal').setTitle('Criar Novo Ticket');

  const titleInput = new TextInputBuilder()
    .setCustomId('ticket_title')
    .setLabel('Assunto do Ticket')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Descreva brevemente o problema...')
    .setRequired(true)
    .setMaxLength(100);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('ticket_description')
    .setLabel('Descrição Detalhada')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Descreva detalhadamente o problema ou dúvida...')
    .setRequired(true)
    .setMaxLength(1000);

  const priorityInput = new TextInputBuilder()
    .setCustomId('ticket_priority')
    .setLabel('Prioridade (low, medium, high, urgent)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('medium')
    .setRequired(false)
    .setValue('medium')
    .setMaxLength(10);

  const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
  const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
  const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(priorityInput);

  modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

  await interaction.showModal(modal);
}

/**
 * Handle create ticket modal submission
 */
async function handleCreateTicketModal(
  interaction: ModalSubmitInteraction,
  ticketService: any,
): Promise<void> {
  const title = interaction.fields.getTextInputValue('ticket_title');
  const description = interaction.fields.getTextInputValue('ticket_description');
  const priorityInput = interaction.fields.getTextInputValue('ticket_priority') || 'medium';

  // Validate priority
  const validPriorities = ['low', 'medium', 'high', 'urgent'];
  const priority = validPriorities.includes(priorityInput.toLowerCase())
    ? (priorityInput.toLowerCase() as 'low' | 'medium' | 'high' | 'urgent')
    : 'medium';

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await ticketService.createTicket(
    interaction.guildId!,
    interaction.user.id,
    title,
    description,
    priority,
  );

  if (result.success) {
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Ticket Criado!')
      .setDescription(
        `Seu ticket foi criado com sucesso!\n\n**Canal:** ${result.channel}\n**ID:** #${result.ticket!.id.slice(-8)}`,
      )
      .setColor('#00FF00')
      .addFields(
        { name: '📝 Assunto', value: title, inline: true },
        { name: '📊 Prioridade', value: priority.toUpperCase(), inline: true },
        { name: '⏰ Criado em', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
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
 * Handle claim ticket
 */
async function handleClaimTicket(
  interaction: ButtonInteraction,
  ticketService: any,
  ticketId: string,
): Promise<void> {
  // Check if user has permission to claim tickets
  const member = interaction.member;
  if (
    !member ||
    !('permissions' in member) ||
    typeof member.permissions === 'string' ||
    !member.permissions.has(PermissionFlagsBits.ManageMessages)
  ) {
    await interaction.reply({
      content: 'Você precisa ter permissão de moderação para assumir tickets.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await ticketService.assignTicket(
    interaction.guildId!,
    ticketId,
    interaction.user.id,
  );

  if (result.success) {
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Ticket Assumido')
      .setDescription(`Você assumiu o ticket #${ticketId.slice(-8)} com sucesso!`)
      .setColor('#00FF00')
      .setFooter({ text: 'Boa sorte resolvendo o problema!' });

    await interaction.editReply({ embeds: [successEmbed] });
  } else {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro')
      .setDescription(result.message)
      .setColor('#FF0000');

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle change priority
 */
async function handleChangePriority(
  interaction: ButtonInteraction,
  ticketService: any,
  ticketId: string,
): Promise<void> {
  // Check if user has permission to change priority
  const member = interaction.member;
  if (
    !member ||
    !('permissions' in member) ||
    typeof member.permissions === 'string' ||
    !member.permissions.has(PermissionFlagsBits.ManageMessages)
  ) {
    await interaction.reply({
      content: 'Você precisa ter permissão de moderação para alterar prioridade.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const priorityEmbed = new EmbedBuilder()
    .setTitle('📊 Alterar Prioridade')
    .setDescription(`Selecione a nova prioridade para o ticket #${ticketId.slice(-8)}:`)
    .setColor('#0099FF');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`priority_low_${ticketId}`)
      .setLabel('Baixa')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🟢'),
    new ButtonBuilder()
      .setCustomId(`priority_medium_${ticketId}`)
      .setLabel('Média')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🟡'),
    new ButtonBuilder()
      .setCustomId(`priority_high_${ticketId}`)
      .setLabel('Alta')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🟠'),
    new ButtonBuilder()
      .setCustomId(`priority_urgent_${ticketId}`)
      .setLabel('Urgente')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔴'),
  );

  await interaction.reply({ embeds: [priorityEmbed], components: [row], flags: MessageFlags.Ephemeral });
}

/**
 * Handle priority selection
 */
async function handlePrioritySelection(
  interaction: ButtonInteraction,
  ticketService: any,
): Promise<void> {
  const parts = interaction.customId.split('_');
  const priority = parts[1];
  const ticketId = parts[2];

  if (!priority || !ticketId) {
    await interaction.reply({ content: 'Erro ao processar prioridade.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  // Update ticket priority in database
  try {
    await ticketService.database.client.ticket.update({
      where: { id: ticketId },
      data: {
        priority,
        updatedAt: new Date(),
      },
    });

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Prioridade Alterada')
      .setDescription(
        `A prioridade do ticket #${ticketId.slice(-8)} foi alterada para **${priority.toUpperCase()}**.`,
      )
      .setColor('#00FF00');

    await interaction.editReply({ embeds: [successEmbed], components: [] });

    // Update the ticket channel if it exists
    const ticket = ticketService.getTicketData(interaction.guildId!, ticketId);
    if (ticket?.channelId) {
      const channel = interaction.client.channels.cache.get(ticket.channelId);
      if (channel && 'send' in channel) {
        const priorityEmojis = {
          low: '🟢',
          medium: '🟡',
          high: '🟠',
          urgent: '🔴',
        };

        const updateEmbed = new EmbedBuilder()
          .setTitle('📊 Prioridade Atualizada')
          .setDescription(
            `A prioridade deste ticket foi alterada para ${priorityEmojis[priority as keyof typeof priorityEmojis]} **${priority.toUpperCase()}** por ${interaction.user}.`,
          )
          .setColor('#FFA500')
          .setTimestamp();

        await channel.send({ embeds: [updateEmbed] });
      }
    }
  } catch (error) {
    logger.error('Error updating ticket priority:', error);

    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro')
      .setDescription('Erro ao alterar prioridade do ticket.')
      .setColor('#FF0000');

    await interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
}

/**
 * Handle close ticket button
 */
async function handleCloseTicketButton(
  interaction: ButtonInteraction,
  ticketService: any,
  ticketId: string,
): Promise<void> {
  const ticket = ticketService.getTicketData(interaction.guildId!, ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket não encontrado.', flags: MessageFlags.Ephemeral });
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
    await interaction.reply({
      content: 'Você só pode fechar seus próprios tickets ou precisa ter permissão de moderação.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`close_ticket_modal_${ticketId}`)
    .setTitle('Fechar Ticket');

  const reasonInput = new TextInputBuilder()
    .setCustomId('close_reason')
    .setLabel('Motivo para fechar o ticket')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Descreva o motivo para fechar este ticket...')
    .setRequired(false)
    .setMaxLength(500);

  const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

/**
 * Handle close ticket modal
 */
async function handleCloseTicketModal(
  interaction: ModalSubmitInteraction,
  ticketService: any,
  ticketId: string,
): Promise<void> {
  const reason = interaction.fields.getTextInputValue('close_reason') || 'Não especificado';

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await ticketService.closeTicket(
    interaction.guildId!,
    ticketId,
    interaction.user.id,
    reason,
  );

  if (result.success) {
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Ticket Fechado')
      .setDescription(`Ticket #${ticketId.slice(-8)} foi fechado com sucesso.`)
      .setColor('#00FF00')
      .addFields(
        { name: '📝 Motivo', value: reason, inline: false },
        { name: '👤 Fechado por', value: interaction.user.tag, inline: true },
        { name: '⏰ Fechado em', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
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
