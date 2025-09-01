import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { BadgeAuditService } from '../../services/badge-audit.service';
import { BaseCommand } from '../../utils/base-command.util';

/**
 * Admin command to audit and fix badge system issues
 */
export class AuditBadgesCommand extends BaseCommand {
  public data = new SlashCommandBuilder()
    .setName('audit-badges')
    .setDescription('🔍 Auditar e corrigir problemas no sistema de badges')
    .addSubcommand(subcommand =>
      subcommand
        .setName('run')
        .setDescription('Executar auditoria completa do sistema de badges')
        .addBooleanOption(option =>
          option
            .setName('autofix')
            .setDescription('Corrigir automaticamente problemas encontrados')
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('health').setDescription('Gerar relatório de saúde do sistema de badges'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cleanup')
        .setDescription('Limpar badges órfãs (CUIDADO: Ação irreversível)')
        .addBooleanOption(option =>
          option
            .setName('confirm')
            .setDescription('Confirmar limpeza de badges órfãs')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('validate').setDescription('Validar formato dos requisitos das badges'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  public category = CommandCategory.ADMIN;
  public cooldown = 30;

  public async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    // Validate interaction and client
    try {
      this.validateInteraction(interaction);
      this.validateClient(client);
    } catch (error) {
      return;
    }

    // Validate guild context
    try {
      this.validateGuildContext(interaction);
    } catch (error) {
      await this.sendGuildOnlyError(interaction);
      return;
    }

    // Validate admin permissions
    try {
      this.validateUserPermissions(interaction, [PermissionFlagsBits.Administrator]);
    } catch (error) {
      await this.sendPermissionError(interaction);
      return;
    }

    // Validate badge audit service
    const auditService = client.badgeAuditService || 
      (client.badgeService && client.database ? new BadgeAuditService(client, client.badgeService, client.database) : null);
    
    if (!auditService) {
      await this.sendServiceUnavailableError(interaction, 'Badge Audit');
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      await this.deferWithLoading(interaction);

      switch (subcommand) {
        case 'run':
          await this.handleAuditRun(interaction, auditService);
          break;
        case 'health':
          await this.handleHealthReport(interaction, auditService);
          break;
        case 'cleanup':
          await this.handleCleanup(interaction, auditService);
          break;
        case 'validate':
          await this.handleValidate(interaction, auditService);
          break;
        default:
          throw new Error(`Unknown subcommand: ${subcommand}`);
      }
    } catch (error) {
      this.logger.error('Badge audit command failed:', error);

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Erro na Auditoria')
        .setDescription(
          'Ocorreu um erro durante a auditoria de badges. Verifique os logs para mais detalhes.',
        )
        .setTimestamp();

      await this.safeReply(interaction, { embeds: [embed] });
    }
  }

  /**
   * Handle audit run subcommand
   */
  private async handleAuditRun(interaction: ChatInputCommandInteraction, auditService: BadgeAuditService) {
    const autofix = interaction.options.getBoolean('autofix') || false;

    const startTime = Date.now();
    const results = await auditService.runFullAudit();
    const duration = Date.now() - startTime;

    const embed = new EmbedBuilder()
      .setColor(results.fixedIssues > 0 ? '#00ff00' : '#ffa500')
      .setTitle('🔍 Auditoria de Badges Concluída')
      .setDescription(`Auditoria executada em ${duration}ms`)
      .addFields(
        {
          name: '🗑️ Badges Órfãs',
          value:
            results.orphanedBadges.length > 0
              ? `${results.orphanedBadges.length} encontradas\n\`${results.orphanedBadges.slice(0, 5).join(', ')}${results.orphanedBadges.length > 5 ? '...' : ''}\``
              : '✅ Nenhuma encontrada',
          inline: true,
        },
        {
          name: '🔄 Badges Duplicadas',
          value:
            results.duplicatedUserBadges.length > 0
              ? `${results.duplicatedUserBadges.length} usuários afetados`
              : '✅ Nenhuma encontrada',
          inline: true,
        },
        {
          name: '❌ Referências Inválidas',
          value:
            results.invalidBadgeReferences.length > 0
              ? `${results.invalidBadgeReferences.length} encontradas`
              : '✅ Nenhuma encontrada',
          inline: true,
        },
        {
          name: '📝 Definições Ausentes',
          value:
            results.missingBadgeDefinitions.length > 0
              ? `${results.missingBadgeDefinitions.length} badges\n\`${results.missingBadgeDefinitions.slice(0, 3).join(', ')}${results.missingBadgeDefinitions.length > 3 ? '...' : ''}\``
              : '✅ Nenhuma encontrada',
          inline: true,
        },
        {
          name: '⚠️ Dados Inconsistentes',
          value:
            results.inconsistentBadgeData.length > 0
              ? `${results.inconsistentBadgeData.length} badges com problemas`
              : '✅ Nenhuma encontrada',
          inline: true,
        },
        {
          name: '🔧 Correções Aplicadas',
          value:
            results.fixedIssues > 0
              ? `${results.fixedIssues} problemas corrigidos automaticamente`
              : autofix
                ? 'Nenhuma correção necessária'
                : 'Correção automática desabilitada',
          inline: true,
        },
      )
      .setTimestamp();

    // Add detailed issues if found
    if (results.inconsistentBadgeData.length > 0) {
      const issueDetails = results.inconsistentBadgeData
        .slice(0, 3)
        .map(
          issue =>
            `**${issue.badgeId}**: ${issue.issues.slice(0, 2).join(', ')}${issue.issues.length > 2 ? '...' : ''}`,
        )
        .join('\n');

      embed.addFields({
        name: '📋 Detalhes dos Problemas',
        value: issueDetails + (results.inconsistentBadgeData.length > 3 ? '\n*...e mais*' : ''),
        inline: false,
      });
    }

    const components = [];

    // Add cleanup button if orphaned badges found
    if (results.orphanedBadges.length > 0) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('cleanup_orphaned')
          .setLabel(`Limpar ${results.orphanedBadges.length} Badges Órfãs`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️'),
      );
      components.push(row);
    }

    await this.safeReply(interaction, { embeds: [embed], components });

    this.logger.info('Badge audit completed:', {
      metadata: {
        duration,
        issues: Object.entries(results).reduce(
          (acc, [key, value]) => {
            if (key !== 'fixedIssues') {
              acc[key] = Array.isArray(value) ? value.length : value;
            }
            return acc;
          },
          {} as Record<string, any>,
        ),
        fixedIssues: results.fixedIssues,
      },
    });
  }

  /**
   * Handle health report subcommand
   */
  private async handleHealthReport(interaction: ChatInputCommandInteraction, auditService: BadgeAuditService) {
    const report = await auditService.generateHealthReport();

    const embed = new EmbedBuilder()
      .setColor('#00aaff')
      .setTitle('📊 Relatório de Saúde - Sistema de Badges')
      .addFields(
        {
          name: '📈 Estatísticas Gerais',
          value: [
            `**Total de Badges:** ${report.totalBadges}`,
            `**Badges Ativas:** ${report.activeBadges}`,
            `**Badges Concedidas:** ${report.totalUserBadges}`,
            `**Usuários com Badges:** ${report.uniqueUsersWithBadges}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '📂 Por Categoria',
          value:
            Object.entries(report.badgesByCategory)
              .map(([category, count]) => `**${category}:** ${count}`)
              .join('\n') || 'Nenhuma categoria encontrada',
          inline: true,
        },
        {
          name: '💎 Por Raridade',
          value:
            Object.entries(report.badgesByRarity)
              .map(([rarity, count]) => `**${rarity}:** ${count}`)
              .join('\n') || 'Nenhuma raridade encontrada',
          inline: true,
        },
      )
      .setTimestamp();

    // Add top badge holders
    if (report.topBadgeHolders.length > 0) {
      const topHolders = report.topBadgeHolders
        .slice(0, 5)
        .map((holder, index) => `${index + 1}. <@${holder.userId}> - ${holder.badgeCount} badges`)
        .join('\n');

      embed.addFields({
        name: '🏆 Top Colecionadores',
        value: topHolders,
        inline: false,
      });
    }

    // Add issues summary
    const issuesCount = [
      report.issues.orphanedBadges.length,
      report.issues.duplicatedUserBadges.length,
      report.issues.invalidBadgeReferences.length,
      report.issues.missingBadgeDefinitions.length,
      report.issues.inconsistentBadgeData.length,
    ].reduce((sum, count) => sum + count, 0);

    embed.addFields({
      name: '⚠️ Problemas Detectados',
      value:
        issuesCount > 0
          ? `${issuesCount} problemas encontrados. Use \`/audit-badges run\` para detalhes.`
          : '✅ Nenhum problema detectado',
      inline: false,
    });

    await this.safeReply(interaction, { embeds: [embed] });

    this.logger.info('Badge health report generated:', {
      metadata: {
        totalBadges: report.totalBadges,
        activeBadges: report.activeBadges,
        totalUserBadges: report.totalUserBadges,
        uniqueUsers: report.uniqueUsersWithBadges,
        issuesFound: issuesCount,
      },
    });
  }

  /**
   * Handle cleanup subcommand
   */
  private async handleCleanup(interaction: ChatInputCommandInteraction, auditService: BadgeAuditService) {
    const confirm = interaction.options.getBoolean('confirm');

    if (!confirm) {
      const embed = new EmbedBuilder()
        .setColor('#ffa500')
        .setTitle('⚠️ Confirmação Necessária')
        .setDescription(
          'Para executar a limpeza de badges órfãs, você deve definir `confirm` como `true`.\n\n**ATENÇÃO:** Esta ação é irreversível!',
        )
        .setTimestamp();

      await this.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // First, find orphaned badges
    const auditResults = await auditService.runFullAudit();

    if (auditResults.orphanedBadges.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Nenhuma Limpeza Necessária')
        .setDescription('Não foram encontradas badges órfãs para limpar.')
        .setTimestamp();

      await this.safeReply(interaction, { embeds: [embed] });
      return;
    }

    // Perform cleanup
    const cleanedCount = await auditService.cleanupOrphanedBadges(auditResults.orphanedBadges, true);

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🗑️ Limpeza Concluída')
      .setDescription(`${cleanedCount} badges órfãs foram removidas do sistema.`)
      .addFields({
        name: '📋 Badges Removidas',
        value:
          auditResults.orphanedBadges
            .slice(0, 10)
            .map(id => `\`${id}\``)
            .join(', ') + (auditResults.orphanedBadges.length > 10 ? '\n*...e mais*' : ''),
        inline: false,
      })
      .setTimestamp();

    await this.safeReply(interaction, { embeds: [embed] });

    this.logger.info(`Cleaned up ${cleanedCount} orphaned badges:`, {
      metadata: { orphanedBadges: auditResults.orphanedBadges },
    });
  }

  /**
   * Handle validate subcommand
   */
  private async handleValidate(interaction: ChatInputCommandInteraction, auditService: BadgeAuditService) {
    const validationErrors = await auditService.validateBadgeRequirements();

    const embed = new EmbedBuilder()
      .setColor(validationErrors.length > 0 ? '#ff0000' : '#00ff00')
      .setTitle('✅ Validação de Requisitos de Badges')
      .setDescription(
        validationErrors.length > 0
          ? `${validationErrors.length} badges com requisitos inválidos encontradas.`
          : 'Todos os requisitos de badges estão válidos.',
      )
      .setTimestamp();

    if (validationErrors.length > 0) {
      const errorDetails = validationErrors
        .slice(0, 5)
        .map(error => `**${error.badgeId}:**\n${error.errors.map(e => `• ${e}`).join('\n')}`)
        .join('\n\n');

      embed.addFields({
        name: '❌ Erros Encontrados',
        value: errorDetails + (validationErrors.length > 5 ? '\n\n*...e mais*' : ''),
        inline: false,
      });
    }

    await this.safeReply(interaction, { embeds: [embed] });

    this.logger.info(`Badge requirements validation completed. Found ${validationErrors.length} errors.`);
  }
}

// Export as default for compatibility
const auditBadgesCommand = new AuditBadgesCommand();
export default auditBadgesCommand;
