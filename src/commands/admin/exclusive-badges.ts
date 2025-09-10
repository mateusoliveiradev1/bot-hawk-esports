import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  User,
  MessageFlags,
} from 'discord.js';
import { ExtendedClient } from '../../types/client';
import { Command, CommandCategory } from '../../types/command';
import { BadgeOptimizationService } from '../../services/badge-optimization.service';
import { BadgeService } from '../../services/badge.service';

const exclusiveBadges: Command = {
  category: CommandCategory.ADMIN,
  data: new SlashCommandBuilder()
    .setName('exclusive-badges')
    .setDescription('Gerenciar badges exclusivas e fundador')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand.setName('create-founder').setDescription('Criar todas as badges fundador'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('award-founder')
        .setDescription('Conceder badge fundador a um usuário')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para receber a badge fundador')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('award-early-adopter')
        .setDescription('Conceder badge pioneiro a um usuário')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para receber a badge pioneiro')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('award-beta-tester')
        .setDescription('Conceder badge beta tester a um usuário')
        .addUserOption(option =>
          option
            .setName('usuario')
            .setDescription('Usuário para receber a badge beta tester')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list-exclusive')
        .setDescription('Listar todas as badges exclusivas e seus portadores'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('verify-founder')
        .setDescription('Verificar e validar badges fundador existentes'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('auto-award')
        .setDescription('Conceder badges automáticas baseadas em critérios'),
    ),

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    // Client is now passed as parameter
    const badgeOptimizationService = client.services?.badgeOptimization;
    const badgeService = client.services?.badge;

    if (!badgeOptimizationService || !badgeService) {
      await interaction.reply({
        content: '❌ Serviços não disponíveis no momento.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const subcommand = interaction.options.getSubcommand();

    if (!badgeOptimizationService || !badgeService) {
      await interaction.reply({
        content: '❌ Serviços de badges não estão disponíveis.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    switch (subcommand) {
      case 'create-founder':
        await handleCreateFounder(interaction, badgeOptimizationService);
        break;
      case 'award-founder':
        await handleAwardFounder(interaction, badgeOptimizationService, badgeService);
        break;
      case 'award-early-adopter':
        await handleAwardEarlyAdopter(interaction, badgeService);
        break;
      case 'award-beta-tester':
        await handleAwardBetaTester(interaction, badgeService);
        break;
      case 'list-exclusive':
        await handleListExclusive(interaction, badgeService);
        break;
      case 'verify-founder':
        await handleVerifyFounder(interaction, badgeService);
        break;
      case 'auto-award':
        await handleAutoAward(interaction, client, badgeService);
        break;
      default:
        await interaction.reply({
          content: '❌ Subcomando não reconhecido.',
          flags: MessageFlags.Ephemeral,
        });
        break;
    }
  },
};

async function handleCreateFounder(
  interaction: ChatInputCommandInteraction,
  service: BadgeOptimizationService,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    await service.createFounderBadges();

    const embed = new EmbedBuilder()
      .setTitle('✅ Badges Fundador Criadas')
      .setDescription('Todas as badges exclusivas foram criadas com sucesso!')
      .addFields(
        { name: '👑 Fundador', value: 'Badge exclusiva do fundador', inline: true },
        { name: '🌟 Pioneiro', value: 'Primeiros 100 membros', inline: true },
        { name: '🧪 Beta Tester', value: 'Testadores da fase beta', inline: true },
      )
      .setColor('#FFD700')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error creating founder badges:', error);
    await interaction.editReply({
      content: '❌ Erro ao criar badges fundador. Verifique os logs.',
    });
  }
}

async function handleAwardFounder(
  interaction: ChatInputCommandInteraction,
  optimizationService: BadgeOptimizationService,
  badgeService: BadgeService,
) {
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser('usuario', true);

  try {
    const awarded = await optimizationService.awardFounderBadge(user.id);

    if (awarded) {
      const embed = new EmbedBuilder()
        .setTitle('👑 Badge Fundador Concedida!')
        .setDescription(`**${user.displayName}** recebeu a badge fundador!`)
        .addFields(
          { name: '🎁 Recompensas', value: '5000 XP\n2500 Moedas\nCargo Fundador', inline: true },
          { name: '⭐ Raridade', value: 'Fundador (Única)', inline: true },
        )
        .setColor('#FFD700')
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({
        content: '❌ Não foi possível conceder a badge fundador. O usuário pode já possuí-la.',
      });
    }
  } catch (error) {
    console.error('Error awarding founder badge:', error);
    await interaction.editReply({
      content: '❌ Erro ao conceder badge fundador.',
    });
  }
}

async function handleAwardEarlyAdopter(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
) {
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser('usuario', true);

  try {
    const awarded = await badgeService.awardBadge(user.id, 'early_adopter');

    if (awarded) {
      const embed = new EmbedBuilder()
        .setTitle('🌟 Badge Pioneiro Concedida!')
        .setDescription(`**${user.displayName}** recebeu a badge pioneiro!`)
        .addFields(
          { name: '🎁 Recompensas', value: '2000 XP\n1000 Moedas\nCargo Pioneiro', inline: true },
          { name: '⭐ Raridade', value: 'Exclusiva', inline: true },
        )
        .setColor('#FF1493')
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({
        content: '❌ Não foi possível conceder a badge pioneiro. O usuário pode já possuí-la.',
      });
    }
  } catch (error) {
    console.error('Error awarding early adopter badge:', error);
    await interaction.editReply({
      content: '❌ Erro ao conceder badge pioneiro.',
    });
  }
}

async function handleAwardBetaTester(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
) {
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser('usuario', true);

  try {
    const awarded = await badgeService.awardBadge(user.id, 'beta_tester');

    if (awarded) {
      const embed = new EmbedBuilder()
        .setTitle('🧪 Badge Beta Tester Concedida!')
        .setDescription(`**${user.displayName}** recebeu a badge beta tester!`)
        .addFields(
          { name: '🎁 Recompensas', value: '1500 XP\n750 Moedas\nCargo Beta Tester', inline: true },
          { name: '⭐ Raridade', value: 'Exclusiva', inline: true },
        )
        .setColor('#FF1493')
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({
        content: '❌ Não foi possível conceder a badge beta tester. O usuário pode já possuí-la.',
      });
    }
  } catch (error) {
    console.error('Error awarding beta tester badge:', error);
    await interaction.editReply({
      content: '❌ Erro ao conceder badge beta tester.',
    });
  }
}

async function handleListExclusive(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const exclusiveBadgeIds = ['founder', 'early_adopter', 'beta_tester'];
    const embed = new EmbedBuilder()
      .setTitle('👑 Badges Exclusivas')
      .setDescription('Lista de todas as badges exclusivas e seus portadores')
      .setColor('#FFD700')
      .setTimestamp();

    for (const badgeId of exclusiveBadgeIds) {
      // Get users with this badge from database
      const client = interaction.client as ExtendedClient;
      const userBadges = await client.database.client.userBadge.findMany({
        where: { badgeId },
        include: { user: true },
      });

      const badgeInfo = badgeService.getAvailableBadges(true).find(b => b.id === badgeId);
      if (badgeInfo) {
        const holders =
          userBadges.length > 0
            ? userBadges.map(ub => `<@${ub.userId}>`).join(', ')
            : 'Nenhum portador';

        embed.addFields({
          name: `${badgeInfo.icon} ${badgeInfo.name}`,
          value: `**Portadores (${userBadges.length}):** ${holders}`,
          inline: false,
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error listing exclusive badges:', error);
    await interaction.editReply({
      content: '❌ Erro ao listar badges exclusivas.',
    });
  }
}

async function handleVerifyFounder(
  interaction: ChatInputCommandInteraction,
  badgeService: BadgeService,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const client = interaction.client as ExtendedClient;
    const founderUserId = process.env.FOUNDER_USER_ID;

    if (!founderUserId) {
      await interaction.editReply({
        content: '❌ ID do fundador não configurado na variável FOUNDER_USER_ID.',
      });
      return;
    }

    // Check if founder has the founder badge
    const founderBadge = await client.database.client.userBadge.findFirst({
      where: {
        userId: founderUserId,
        badgeId: 'founder',
      },
    });

    // Check for unauthorized founder badges
    const unauthorizedFounders = await client.database.client.userBadge.findMany({
      where: {
        badgeId: 'founder',
        userId: { not: founderUserId },
      },
    });

    const embed = new EmbedBuilder()
      .setTitle('🔍 Verificação de Badges Fundador')
      .setColor('#FFD700')
      .setTimestamp();

    if (founderBadge) {
      embed.addFields({
        name: '✅ Fundador Verificado',
        value: `<@${founderUserId}> possui a badge fundador corretamente.`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '❌ Fundador Sem Badge',
        value: `<@${founderUserId}> não possui a badge fundador!`,
        inline: false,
      });
    }

    if (unauthorizedFounders.length > 0) {
      const unauthorizedList = unauthorizedFounders.map(ub => `<@${ub.userId}>`).join(', ');
      embed.addFields({
        name: '⚠️ Badges Não Autorizadas',
        value: `${unauthorizedFounders.length} usuários possuem badge fundador indevidamente:\n${unauthorizedList}`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '✅ Verificação Completa',
        value: 'Nenhuma badge fundador não autorizada encontrada.',
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error verifying founder badges:', error);
    await interaction.editReply({
      content: '❌ Erro ao verificar badges fundador.',
    });
  }
}

async function handleAutoAward(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  badgeService: BadgeService,
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    let awardedCount = 0;
    const results: string[] = [];

    // Auto-award early adopter to first 100 members
    const guild = interaction.guild;
    if (guild) {
      const members = await guild.members.fetch();
      const sortedMembers = members
        .filter(member => !member.user.bot)
        .sort((a, b) => a.joinedTimestamp! - b.joinedTimestamp!)
        .first(100);

      for (const member of sortedMembers.values()) {
        const hasEarlyAdopter = await client.database.client.userBadge.findFirst({
          where: {
            userId: member.id,
            badgeId: 'early_adopter',
          },
        });

        if (!hasEarlyAdopter) {
          const awarded = await badgeService.awardBadge(member.id, 'early_adopter', false);
          if (awarded) {
            awardedCount++;
            results.push(`🌟 ${member.displayName} - Pioneiro`);
          }
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🤖 Concessão Automática de Badges')
      .setDescription(
        `Processo concluído! ${awardedCount} badges foram concedidas automaticamente.`,
      )
      .setColor('#00CED1')
      .setTimestamp();

    if (results.length > 0) {
      const resultText = results.slice(0, 10).join('\n');
      const remaining = results.length > 10 ? `\n... e mais ${results.length - 10} badges` : '';

      embed.addFields({
        name: '🎁 Badges Concedidas',
        value: resultText + remaining,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '📋 Resultado',
        value: 'Nenhuma nova badge foi concedida. Todos os critérios já foram atendidos.',
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in auto-award:', error);
    await interaction.editReply({
      content: '❌ Erro durante a concessão automática de badges.',
    });
  }
}

export default exclusiveBadges;
