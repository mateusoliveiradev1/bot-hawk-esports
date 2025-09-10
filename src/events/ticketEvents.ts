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
import { HawkEmbedBuilder } from '../utils/hawk-embed-builder';
import { HawkComponentFactory } from '../utils/hawk-component-factory';
import { HAWK_EMOJIS } from '../constants/hawk-emojis';

const logger = new Logger();

/**
 * Handle ticket-related button interactions
 */
export async function handleTicketButtonInteraction(
  interaction: ButtonInteraction,
  client: ExtendedClient
): Promise<void> {
  try {
    const ticketService = client.services?.ticket;
    if (!ticketService) {
      await interaction.reply({
        content: 'Serviço de tickets não disponível.',
        flags: MessageFlags.Ephemeral,
      });
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
      await interaction.reply({
        content: 'Erro ao processar interação.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/**
 * Handle ticket-related modal submissions
 */
export async function handleTicketModalSubmission(
  interaction: ModalSubmitInteraction,
  client: ExtendedClient
): Promise<void> {
  try {
    const ticketService = client.services?.ticket;
    if (!ticketService) {
      await interaction.reply({
        content: 'Serviço de tickets não disponível.',
        flags: MessageFlags.Ephemeral,
      });
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
      await interaction.reply({
        content: 'Erro ao processar modal.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/**
 * Handle create ticket from panel
 */
async function handleCreateTicketFromPanel(
  interaction: ButtonInteraction,
  ticketService: any
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
 * Get priority emoji based on priority level
 */
function getPriorityEmoji(priority: string): string {
  switch (priority.toLowerCase()) {
    case 'low':
      return HAWK_EMOJIS.TICKETS.PRIORITY_LOW;
    case 'medium':
      return HAWK_EMOJIS.TICKETS.PRIORITY_MEDIUM;
    case 'high':
      return HAWK_EMOJIS.TICKETS.PRIORITY_HIGH;
    case 'urgent':
      return HAWK_EMOJIS.TICKETS.PRIORITY_URGENT;
    default:
      return HAWK_EMOJIS.TICKETS.PRIORITY_MEDIUM;
  }
}

/**
 * Handle create ticket modal submission
 */
async function handleCreateTicketModal(
  interaction: ModalSubmitInteraction,
  ticketService: any
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
    priority
  );

  if (result.success) {
    const successEmbed = HawkEmbedBuilder.createSuccess(
      'Ticket Criado com Sucesso!',
      `${HAWK_EMOJIS.TICKETS.CREATED} Seu ticket foi criado e nossa equipe será notificada!\n\n${HAWK_EMOJIS.CHANNELS.TEXT} **Canal:** ${result.channel}\n${HAWK_EMOJIS.TICKETS.ID} **ID:** \`#${result.ticket!.id.slice(-8)}\``
    )
      .addFields(
        {
          name: `${HAWK_EMOJIS.TICKETS.SUBJECT} Assunto`,
          value: `\`${title}\``,
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.TICKETS.PRIORITY} Prioridade`,
          value: `${getPriorityEmoji(priority)} ${priority.toUpperCase()}`,
          inline: true,
        },
        {
          name: `${HAWK_EMOJIS.TIME.CREATED} Criado em`,
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: false,
        }
      )
      .setFooter({
        text: `${HAWK_EMOJIS.HELP} Nossa equipe irá atendê-lo em breve!`,
        iconURL: interaction.guild?.iconURL() || undefined,
      });

    const actionRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: `ticket_view_${result.ticket!.id}`,
        label: 'Ver Ticket',
        style: ButtonStyle.Primary,
        emoji: '👁️',
      }),
    ]);

    await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
  } else {
    const errorEmbed = HawkEmbedBuilder.createError(
      'Erro ao Criar Ticket',
      `${HAWK_EMOJIS.ERROR} ${result.message}\n\n${HAWK_EMOJIS.HELP} Tente novamente ou entre em contato com um administrador.`
    );

    const retryRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: 'create_ticket_panel',
        label: 'Tentar Novamente',
        style: ButtonStyle.Secondary,
        emoji: '🔄',
      }),
    ]);

    await interaction.editReply({ embeds: [errorEmbed], components: [retryRow] });
  }
}

/**
 * Handle claim ticket
 */
async function handleClaimTicket(
  interaction: ButtonInteraction,
  ticketService: any,
  ticketId: string
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
    interaction.user.id
  );

  if (result.success) {
    const successEmbed = HawkEmbedBuilder.createSuccess(
      'Ticket Assumido',
      `${HAWK_EMOJIS.TICKETS.CLAIMED} Você assumiu o ticket #${ticketId.slice(-8)} com sucesso!\n\n${HAWK_EMOJIS.SUPPORT_SYSTEM.TEAM} Boa sorte resolvendo o problema!`
    ).addFields(
      {
        name: `${HAWK_EMOJIS.TICKETS.ID} ID do Ticket`,
        value: `\`#${ticketId.slice(-8)}\``,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.MODERATOR} Responsável`,
        value: `${interaction.user}`,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.TIME.CLAIMED} Assumido em`,
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false,
      }
    );

    const actionRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: `ticket_view_${ticketId}`,
        label: 'Ver Ticket',
        style: ButtonStyle.Primary,
        emoji: '👁️',
      }),
    ]);

    await interaction.editReply({ embeds: [successEmbed], components: [actionRow] });
  } else {
    const errorEmbed = HawkEmbedBuilder.createError(
      'Erro ao Assumir Ticket',
      `${HAWK_EMOJIS.ERROR} ${result.message}\n\n${HAWK_EMOJIS.HELP} Tente novamente ou verifique se o ticket ainda está disponível.`
    );

    const retryRow = HawkComponentFactory.createActionRow([
      HawkComponentFactory.createButton({
        customId: `ticket_claim_${ticketId}`,
        label: 'Tentar Novamente',
        style: ButtonStyle.Secondary,
        emoji: '🔄',
      }),
    ]);

    await interaction.editReply({ embeds: [errorEmbed], components: [retryRow] });
  }
}

/**
 * Handle change priority
 */
async function handleChangePriority(
  interaction: ButtonInteraction,
  ticketService: any,
  ticketId: string
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

  const priorityEmbed = HawkEmbedBuilder.createInfo(
    'Alterar Prioridade',
    `${HAWK_EMOJIS.TICKETS.PRIORITY} Selecione a nova prioridade para o ticket #${ticketId.slice(-8)}:\n\n${HAWK_EMOJIS.SUPPORT_SYSTEM.HELP} Escolha a prioridade que melhor representa a urgência do problema.`
  ).addFields(
    {
      name: `${HAWK_EMOJIS.TICKETS.ID} Ticket`,
      value: `\`#${ticketId.slice(-8)}\``,
      inline: true,
    },
    {
      name: `${HAWK_EMOJIS.MODERATOR} Alterado por`,
      value: `${interaction.user}`,
      inline: true,
    }
  );

  const row = HawkComponentFactory.createActionRow([
    HawkComponentFactory.createButton({
      customId: `priority_low_${ticketId}`,
      label: 'Baixa',
      style: ButtonStyle.Success,
      emoji: '🟢',
    }),
    HawkComponentFactory.createButton({
      customId: `priority_medium_${ticketId}`,
      label: 'Média',
      style: ButtonStyle.Primary,
      emoji: '🟡',
    }),
    HawkComponentFactory.createButton({
      customId: `priority_high_${ticketId}`,
      label: 'Alta',
      style: ButtonStyle.Secondary,
      emoji: '🟠',
    }),
    HawkComponentFactory.createButton({
      customId: `priority_urgent_${ticketId}`,
      label: 'Urgente',
      style: ButtonStyle.Danger,
      emoji: '🔴',
    }),
  ]);

  await interaction.reply({
    embeds: [priorityEmbed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handle priority selection
 */
async function handlePrioritySelection(
  interaction: ButtonInteraction,
  ticketService: any
): Promise<void> {
  const parts = interaction.customId.split('_');
  const priority = parts[1];
  const ticketId = parts[2];

  if (!priority || !ticketId) {
    await interaction.reply({
      content: 'Erro ao processar prioridade.',
      flags: MessageFlags.Ephemeral,
    });
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

    const successEmbed = HawkEmbedBuilder.createSuccess(
      'Prioridade Alterada',
      `${HAWK_EMOJIS.TICKETS.PRIORITY} A prioridade do ticket foi alterada com sucesso!`
    ).addFields(
      {
        name: `${HAWK_EMOJIS.TICKET} Ticket`,
        value: `\`#${ticketId.slice(-8)}\``,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.TICKETS.PRIORITY} Nova Prioridade`,
        value: `**${priority.toUpperCase()}**`,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.MODERATOR} Alterado por`,
        value: `${interaction.user}`,
        inline: true,
      }
    );

    await interaction.editReply({ embeds: [successEmbed], components: [] });

    // Update the ticket channel if it exists
    const ticket = ticketService.getTicketData(interaction.guildId!, ticketId);
    if (ticket?.channelId) {
      const channel = interaction.client.channels.cache.get(ticket.channelId);
      if (channel && 'send' in channel) {
        const priorityEmojis = {
          low: HAWK_EMOJIS.TICKETS.PRIORITY_LOW,
          medium: HAWK_EMOJIS.TICKETS.PRIORITY_MEDIUM,
          high: HAWK_EMOJIS.TICKETS.PRIORITY_HIGH,
          urgent: HAWK_EMOJIS.TICKETS.PRIORITY_URGENT,
        };

        const updateEmbed = HawkEmbedBuilder.createInfo(
          'Prioridade Atualizada',
          `${HAWK_EMOJIS.TICKETS.PRIORITY} A prioridade deste ticket foi alterada!`
        )
          .addFields(
            {
              name: `${HAWK_EMOJIS.TICKETS.PRIORITY} Nova Prioridade`,
              value: `${priorityEmojis[priority as keyof typeof priorityEmojis]} **${priority.toUpperCase()}**`,
              inline: true,
            },
            {
              name: `${HAWK_EMOJIS.MODERATOR} Alterado por`,
              value: `${interaction.user}`,
              inline: true,
            }
          )
          .setTimestamp();

        await channel.send({ embeds: [updateEmbed] });
      }
    }
  } catch (error) {
    logger.error('Error updating ticket priority:', error);

    const errorEmbed = HawkEmbedBuilder.createError(
      'Erro ao Alterar Prioridade',
      `${HAWK_EMOJIS.ERROR} Ocorreu um erro ao tentar alterar a prioridade do ticket. Tente novamente.`
    ).addFields(
      {
        name: `${HAWK_EMOJIS.TICKETS.ID} Ticket`,
        value: `\`#${ticketId.slice(-8)}\``,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.SUPPORT} Suporte`,
        value: 'Entre em contato com a administração se o problema persistir.',
        inline: false,
      }
    );

    await interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
}

/**
 * Handle close ticket button
 */
async function handleCloseTicketButton(
  interaction: ButtonInteraction,
  ticketService: any,
  ticketId: string
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
  ticketId: string
): Promise<void> {
  const reason = interaction.fields.getTextInputValue('close_reason') || 'Não especificado';

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await ticketService.closeTicket(
    interaction.guildId!,
    ticketId,
    interaction.user.id,
    reason
  );

  if (result.success) {
    const successEmbed = HawkEmbedBuilder.createSuccess(
      'Ticket Fechado',
      `${HAWK_EMOJIS.TICKETS.CLOSE} O ticket foi fechado com sucesso!`
    ).addFields(
      {
        name: `${HAWK_EMOJIS.TICKETS.ID} Ticket`,
        value: `\`#${ticketId.slice(-8)}\``,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.MODERATOR} Fechado por`,
        value: `${interaction.user}`,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.CLOCK} Fechado em`,
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.TICKETS.REASON} Motivo`,
        value: reason,
        inline: false,
      }
    );

    await interaction.editReply({ embeds: [successEmbed] });
  } else {
    const errorEmbed = HawkEmbedBuilder.createError(
      'Erro ao Fechar Ticket',
      `${HAWK_EMOJIS.ERROR} ${result.message}`
    ).addFields(
      {
        name: `${HAWK_EMOJIS.TICKETS.ID} Ticket`,
        value: `\`#${ticketId.slice(-8)}\``,
        inline: true,
      },
      {
        name: `${HAWK_EMOJIS.SUPPORT_SYSTEM.HELP} Suporte`,
        value: 'Entre em contato com a administração se o problema persistir.',
        inline: false,
      }
    );

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
