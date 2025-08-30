import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { CommandInteraction } from 'discord.js';
import { DynamicBadgeService, DynamicBadgeRule } from '../../services/dynamic-badge.service';

export default class DynamicBadgesCommand implements Command {
  public data = new SlashCommandBuilder()
    .setName('dynamic-badges')
    .setDescription('Gerenciar sistema de badges dinâmicas baseadas em estatísticas PUBG')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Listar todas as regras de badges dinâmicas')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Ativar/desativar uma regra de badge dinâmica')
        .addStringOption(option =>
          option
            .setName('rule-id')
            .setDescription('ID da regra para ativar/desativar')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('process-user')
        .setDescription('Forçar processamento de badges para um usuário específico')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Usuário para processar badges')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('process-all')
        .setDescription('Forçar processamento de todas as badges dinâmicas')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('Ver estatísticas do sistema de badges dinâmicas')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('rule-details')
        .setDescription('Ver detalhes de uma regra específica')
        .addStringOption(option =>
          option
            .setName('rule-id')
            .setDescription('ID da regra para ver detalhes')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions('0');

  public async execute(interaction: CommandInteraction, client: ExtendedClient): Promise<void> {
    if (!client.services?.dynamicBadge) {
      await interaction.reply({
        content: '❌ Serviço de badges dinâmicas não está disponível.',
        ephemeral: true
      });
      return;
    }

    const dynamicBadgeService = client.services.dynamicBadge;
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'list':
        await this.handleListRules(interaction, dynamicBadgeService);
        break;

      case 'toggle':
        await this.handleToggleRule(interaction, dynamicBadgeService);
        break;

      case 'process-user':
        await this.handleProcessUser(interaction, dynamicBadgeService);
        break;

      case 'process-all':
        await this.handleProcessAll(interaction, dynamicBadgeService);
        break;

      case 'stats':
        await this.handleStats(interaction, dynamicBadgeService);
        break;

      case 'rule-details':
        await this.handleRuleDetails(interaction, dynamicBadgeService);
        break;

      default:
        await interaction.reply({
          content: '❌ Subcomando não reconhecido.',
          ephemeral: true
        });
        return;
    }
  }

  private async handleListRules(interaction: CommandInteraction, service: DynamicBadgeService): Promise<void> {
    const rules = service.getDynamicRules();
    
    if (rules.length === 0) {
      await interaction.reply({
        content: '📋 Nenhuma regra de badge dinâmica encontrada.',
        ephemeral: true
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎯 Regras de Badges Dinâmicas')
      .setDescription('Lista de todas as regras configuradas no sistema')
      .setColor(0x00AE86)
      .setTimestamp();

    // Group rules by frequency
    const groupedRules = {
      realtime: rules.filter(r => r.frequency === 'realtime'),
      hourly: rules.filter(r => r.frequency === 'hourly'),
      daily: rules.filter(r => r.frequency === 'daily'),
      weekly: rules.filter(r => r.frequency === 'weekly')
    };

    for (const [frequency, ruleList] of Object.entries(groupedRules)) {
      if (ruleList.length > 0) {
        const ruleText = ruleList.map(rule => {
          const status = rule.isActive ? '🟢' : '🔴';
          const priority = this.getPriorityEmoji(rule.priority);
          const rarity = this.getRarityEmoji(rule.badgeTemplate.rarity);
          return `${status} ${priority} ${rarity} **${rule.name}** (\`${rule.id}\`)`;
        }).join('\n');

        embed.addFields({
          name: `${this.getFrequencyEmoji(frequency)} ${frequency.toUpperCase()}`,
          value: ruleText,
          inline: false
        });
      }
    }

    embed.setFooter({
      text: `Total: ${rules.length} regras | Ativas: ${rules.filter(r => r.isActive).length}`
    });

    // Add action buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('refresh_rules')
          .setLabel('🔄 Atualizar')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('process_all_now')
          .setLabel('⚡ Processar Tudo')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }

  private async handleToggleRule(interaction: CommandInteraction, service: DynamicBadgeService): Promise<void> {
    const ruleId = interaction.options.getString('rule-id', true);
    const rules = service.getDynamicRules();
    const rule = rules.find(r => r.id === ruleId);

    if (!rule) {
      await interaction.reply({
        content: `❌ Regra com ID \`${ruleId}\` não encontrada.`,
        ephemeral: true
      });
      return;
    }

    const success = service.toggleRule(ruleId);
    
    if (success) {
      const newStatus = rule.isActive ? 'ativada' : 'desativada';
      const statusEmoji = rule.isActive ? '🟢' : '🔴';
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Regra Atualizada')
        .setDescription(`A regra **${rule.name}** foi ${newStatus} com sucesso.`)
        .addFields(
          {
            name: 'Status',
            value: `${statusEmoji} ${newStatus.toUpperCase()}`,
            inline: true
          },
          {
            name: 'Frequência',
            value: rule.frequency,
            inline: true
          },
          {
            name: 'Prioridade',
            value: rule.priority,
            inline: true
          }
        )
        .setColor(rule.isActive ? 0x00FF00 : 0xFF0000)
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: `❌ Falha ao alterar status da regra \`${ruleId}\`.`,
        ephemeral: true
      });
    }
  }

  private async handleProcessUser(interaction: CommandInteraction, service: DynamicBadgeService): Promise<void> {
    const user = interaction.options.getUser('user', true);
    
    await interaction.deferReply({ ephemeral: true });

    try {
      const awardedBadges = await service.processUserNow(user.id);
      
      const embed = new EmbedBuilder()
        .setTitle('⚡ Processamento Concluído')
        .setDescription(`Processamento de badges dinâmicas para ${user.toString()} finalizado.`)
        .addFields({
          name: 'Badges Conquistadas',
          value: awardedBadges.length > 0 
            ? awardedBadges.map(badge => `🏆 ${badge}`).join('\n')
            : 'Nenhuma nova badge conquistada',
          inline: false
        })
        .setColor(awardedBadges.length > 0 ? 0x00FF00 : 0xFFAA00)
        .setTimestamp()
        .setThumbnail(user.displayAvatarURL());

      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error) {
      await interaction.editReply({
        content: `❌ Erro ao processar badges para ${user.toString()}: ${error}`
      });
    }
  }

  private async handleProcessAll(interaction: CommandInteraction, service: DynamicBadgeService): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Start processing in background
      const processingPromises = [
        service.processRealtimeBadges(),
        service.processDailyBadges(),
        service.processWeeklyBadges()
      ];

      await Promise.all(processingPromises);

      const embed = new EmbedBuilder()
        .setTitle('✅ Processamento Global Concluído')
        .setDescription('Todas as badges dinâmicas foram processadas com sucesso.')
        .addFields(
          {
            name: 'Processados',
            value: '🔄 Badges em tempo real\n📅 Badges diárias\n📊 Badges semanais',
            inline: false
          }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error) {
      await interaction.editReply({
        content: `❌ Erro durante o processamento global: ${error}`
      });
    }
  }

  private async handleStats(interaction: CommandInteraction, service: DynamicBadgeService): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const stats = await service.getStatistics();
      const rules = service.getDynamicRules();
      
      // Calculate additional stats
      const rulesByFrequency = {
        realtime: rules.filter(r => r.frequency === 'realtime').length,
        hourly: rules.filter(r => r.frequency === 'hourly').length,
        daily: rules.filter(r => r.frequency === 'daily').length,
        weekly: rules.filter(r => r.frequency === 'weekly').length
      };

      const rulesByPriority = {
        critical: rules.filter(r => r.priority === 'critical').length,
        high: rules.filter(r => r.priority === 'high').length,
        medium: rules.filter(r => r.priority === 'medium').length,
        low: rules.filter(r => r.priority === 'low').length
      };

      const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas - Badges Dinâmicas')
        .setDescription('Visão geral do sistema de badges dinâmicas')
        .addFields(
          {
            name: '📋 Regras',
            value: `Total: **${stats.totalRules}**\nAtivas: **${stats.activeRules}**\nInativas: **${stats.totalRules - stats.activeRules}**`,
            inline: true
          },
          {
            name: '🏆 Conquistas',
            value: `Total: **${stats.totalAwards}**\nRecentes (24h): **${stats.recentAwards}**`,
            inline: true
          },
          {
            name: '⏱️ Por Frequência',
            value: `Tempo Real: **${rulesByFrequency.realtime}**\nDiária: **${rulesByFrequency.daily}**\nSemanal: **${rulesByFrequency.weekly}**`,
            inline: true
          },
          {
            name: '🎯 Por Prioridade',
            value: `Crítica: **${rulesByPriority.critical}**\nAlta: **${rulesByPriority.high}**\nMédia: **${rulesByPriority.medium}**\nBaixa: **${rulesByPriority.low}**`,
            inline: true
          }
        )
        .setColor(0x00AE86)
        .setTimestamp()
        .setFooter({
          text: 'Sistema de Badges Dinâmicas'
        });

      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error) {
      await interaction.editReply({
        content: `❌ Erro ao obter estatísticas: ${error}`
      });
    }
  }

  private async handleRuleDetails(interaction: CommandInteraction, service: DynamicBadgeService): Promise<void> {
    const ruleId = interaction.options.getString('rule-id', true);
    const rules = service.getDynamicRules();
    const rule = rules.find(r => r.id === ruleId);

    if (!rule) {
      await interaction.reply({
        content: `❌ Regra com ID \`${ruleId}\` não encontrada.`,
        ephemeral: true
      });
      return;
    }

    const statusEmoji = rule.isActive ? '🟢' : '🔴';
    const priorityEmoji = this.getPriorityEmoji(rule.priority);
    const rarityEmoji = this.getRarityEmoji(rule.badgeTemplate.rarity);
    const frequencyEmoji = this.getFrequencyEmoji(rule.frequency);

    const embed = new EmbedBuilder()
      .setTitle(`${rule.badgeTemplate.icon} ${rule.name}`)
      .setDescription(rule.description)
      .addFields(
        {
          name: 'ℹ️ Informações Básicas',
          value: `**ID:** \`${rule.id}\`\n**Status:** ${statusEmoji} ${rule.isActive ? 'Ativa' : 'Inativa'}\n**Categoria:** ${rule.badgeTemplate.category}`,
          inline: true
        },
        {
          name: '⚙️ Configurações',
          value: `**Frequência:** ${frequencyEmoji} ${rule.frequency}\n**Prioridade:** ${priorityEmoji} ${rule.priority}\n**Raridade:** ${rarityEmoji} ${rule.badgeTemplate.rarity}`,
          inline: true
        },
        {
          name: '🎁 Recompensas',
          value: `**XP:** ${rule.badgeTemplate.rewards.xp || 0}\n**Moedas:** ${rule.badgeTemplate.rewards.coins || 0}\n**Role:** ${rule.badgeTemplate.rewards.role || 'Nenhuma'}`,
          inline: true
        },
        {
          name: '📊 Limites',
          value: `**Cooldown:** ${rule.cooldown} minutos\n**Máx. Conquistas:** ${rule.maxAwards}`,
          inline: true
        },
        {
          name: '🔍 Condição',
          value: `\`\`\`javascript\n${rule.condition}\`\`\``,
          inline: false
        }
      )
      .setColor(this.getRarityColor(rule.badgeTemplate.rarity))
      .setTimestamp()
      .setFooter({
        text: `Badge ID: dynamic_${rule.id}`
      });

    // Add requirements if they exist
    if (rule.requirements) {
      const reqText = Object.entries(rule.requirements)
        .map(([key, value]) => `**${key}:** ${value}`)
        .join('\n');
      
      embed.addFields({
        name: '📋 Requisitos',
        value: reqText,
        inline: false
      });
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }

  private getPriorityEmoji(priority: string): string {
    const emojis = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    };
    return emojis[priority as keyof typeof emojis] || '⚪';
  }

  private getRarityEmoji(rarity: string): string {
    const emojis = {
      common: '⚪',
      uncommon: '🟢',
      rare: '🔵',
      epic: '🟣',
      legendary: '🟠',
      mythic: '🔴'
    };
    return emojis[rarity as keyof typeof emojis] || '⚪';
  }

  private getFrequencyEmoji(frequency: string): string {
    const emojis = {
      realtime: '⚡',
      hourly: '🕐',
      daily: '📅',
      weekly: '📊'
    };
    return emojis[frequency as keyof typeof emojis] || '⏰';
  }

  private getRarityColor(rarity: string): number {
    const colors = {
      common: 0x808080,
      uncommon: 0x00FF00,
      rare: 0x0080FF,
      epic: 0x8000FF,
      legendary: 0xFF8000,
      mythic: 0xFF0080
    };
    return colors[rarity as keyof typeof colors] || colors.common;
  }
}