import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChatInputCommandInteraction,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  InteractionType,
  ModalActionRowComponentBuilder,
  ModalSubmitFields,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';
import { AdaptiveChallengeService, AdaptiveChallenge, PlayerStats } from '../../services/adaptive-challenge.service';
import { DatabaseService } from '../../database/database.service';
import { BaseCommand } from '../../utils/base-command.util';

const logger = new Logger();

/**
 * Adaptive Challenge command - Personalized challenges based on player performance
 */
class AdaptiveChallengeCommand extends BaseCommand {
  public data = new SlashCommandBuilder()
    .setName('adaptive-challenge')
    .setDescription('🎯 Desafios adaptativos personalizados baseados no seu desempenho')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Ação a ser executada')
        .setRequired(false)
        .addChoices(
          { name: '📋 Meus Desafios Adaptativos', value: 'my-challenges' },
          { name: '📊 Meu Perfil de Jogador', value: 'profile' },
          { name: '🔄 Gerar Novos Desafios', value: 'generate' },
          { name: '📈 Estatísticas de Adaptação', value: 'stats' },
          { name: '🎮 Configurar Preferências', value: 'preferences' },
        ),
    ) as SlashCommandBuilder;
  
  public category = CommandCategory.GENERAL;
  public cooldown = 5;

  constructor() {
    super();
  }

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const adaptiveService = (client as any).adaptiveChallengeService as AdaptiveChallengeService;
    const database = client.database as DatabaseService;

    if (!adaptiveService) {
      await interaction.reply({
        content: '❌ Serviço de desafios adaptativos não está disponível.',
        ephemeral: true,
      });
      return;
    }

    const action = interaction.options.getString('action') || 'my-challenges';
    const userId = interaction.user.id;

    try {
      switch (action) {
        case 'my-challenges':
          await this.handleMyChallenges(interaction, adaptiveService, userId);
          break;
        case 'profile':
          await this.handleProfile(interaction, adaptiveService, userId);
          break;
        case 'generate':
          await this.handleGenerate(interaction, adaptiveService, userId);
          break;
        case 'stats':
          await this.handleStats(interaction, adaptiveService);
          break;
        case 'preferences':
          await this.handlePreferences(interaction, database, userId);
          break;
        default:
          await this.handleMyChallenges(interaction, adaptiveService, userId);
      }
    } catch (error) {
      logger.error('Error in adaptive-challenge command:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar o comando. Tente novamente.',
          ephemeral: true,
        });
      }
    }
  }

  /**
   * Handle my challenges action
   */
  private async handleMyChallenges(
    interaction: ChatInputCommandInteraction,
    adaptiveService: AdaptiveChallengeService,
    userId: string,
  ): Promise<void> {
    await interaction.deferReply();

    const challenges = await adaptiveService.getUserAdaptiveChallenges(userId);

  if (challenges.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🎯 Desafios Adaptativos')
      .setDescription(
        '**Você não possui desafios adaptativos hoje!**\n\n' +
        '🔄 Use `/adaptive-challenge generate` para criar desafios personalizados\n' +
        '📊 Ou veja seu perfil com `/adaptive-challenge profile`',
      )
      .setColor('#FF6B6B')
      .setTimestamp();

    const generateButton = new ButtonBuilder()
      .setCustomId('generate_adaptive_challenges')
      .setLabel('🔄 Gerar Desafios')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(generateButton);

    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🎯 Seus Desafios Adaptativos')
    .setDescription('Desafios personalizados baseados no seu desempenho:')
    .setColor('#4ECDC4')
    .setTimestamp();

  challenges.forEach((challenge, index) => {
    const progressBar = this.createProgressBar(0, challenge.target); // Progress será implementado
    const rarityEmoji = this.getRarityEmoji(challenge.rarity);
    
    embed.addFields({
      name: `${challenge.icon} ${challenge.name} ${rarityEmoji}`,
      value: 
        `**${challenge.description}**\n` +
        `${progressBar} \`0/${challenge.target}\`\n` +
        `💰 **Recompensas:** ${challenge.rewards.xp} XP, ${challenge.rewards.coins} moedas\n` +
        `💡 **Dica:** ${challenge.motivationalMessage}\n` +
        `🎯 **Adaptação:** ${challenge.adaptationReason}`,
      inline: false,
    });
  });

  const refreshButton = new ButtonBuilder()
    .setCustomId('refresh_adaptive_challenges')
    .setLabel('🔄 Atualizar')
    .setStyle(ButtonStyle.Secondary);

  const profileButton = new ButtonBuilder()
    .setCustomId('view_player_profile')
    .setLabel('📊 Ver Perfil')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(refreshButton, profileButton);

  await interaction.editReply({ embeds: [embed], components: [row] });
}

  /**
   * Handle profile action
   */
  private async handleProfile(
    interaction: ChatInputCommandInteraction,
    adaptiveService: AdaptiveChallengeService,
    userId: string,
  ): Promise<void> {
  await interaction.deferReply();

  // Acessar método privado através de reflexão (para demonstração)
  const stats = await (adaptiveService as any).getPlayerStats(userId);

  const embed = new EmbedBuilder()
    .setTitle('📊 Seu Perfil de Jogador')
    .setDescription('Análise do seu desempenho para personalização de desafios')
    .setColor('#9B59B6')
    .setThumbnail(interaction.user.displayAvatarURL())
    .setTimestamp();

  // Skill Level
  const skillEmoji = this.getSkillEmoji(stats.skillLevel);
  embed.addFields({
    name: '🏆 Nível de Habilidade',
    value: `${skillEmoji} **${this.getSkillName(stats.skillLevel)}**`,
    inline: true,
  });

  // Activity Level
  const activityEmoji = this.getActivityEmoji(stats.activityLevel);
  embed.addFields({
    name: '⚡ Nível de Atividade',
    value: `${activityEmoji} **${this.getActivityName(stats.activityLevel)}**`,
    inline: true,
  });

  // Games Played
  embed.addFields({
    name: '🎮 Partidas Jogadas',
    value: `**${stats.gamesPlayed}** partidas`,
    inline: true,
  });

  // Performance Stats
  embed.addFields({
    name: '📈 Estatísticas de Performance',
    value: 
      `🎯 **Kills Médios:** ${stats.averageKills.toFixed(1)}\n` +
      `💥 **Dano Médio:** ${stats.averageDamage.toFixed(0)}\n` +
      `⏱️ **Sobrevivência Média:** ${Math.floor(stats.averageSurvivalTime / 60)}min\n` +
      `🏆 **Taxa de Vitória:** ${(stats.winRate * 100).toFixed(1)}%\n` +
      `🎯 **Taxa de Headshot:** ${(stats.headShotRate * 100).toFixed(1)}%`,
    inline: false,
  });

  // Preferred Game Modes
  if (stats.preferredGameModes.length > 0) {
    embed.addFields({
      name: '🎮 Modos Preferidos',
      value: stats.preferredGameModes.map(mode => `• ${mode}`).join('\n'),
      inline: false,
    });
  }

  // Adaptation Info
  embed.addFields({
    name: '🔧 Como Funciona a Adaptação',
    value: 
      'Os desafios são personalizados baseados em:\n' +
      '• Seu nível de habilidade atual\n' +
      '• Suas estatísticas de performance\n' +
      '• Sua frequência de jogo\n' +
      '• Seus pontos fortes e fracos',
    inline: false,
  });

  const generateButton = new ButtonBuilder()
    .setCustomId('generate_adaptive_challenges')
    .setLabel('🔄 Gerar Desafios Personalizados')
    .setStyle(ButtonStyle.Success);

  const challengesButton = new ButtonBuilder()
    .setCustomId('view_adaptive_challenges')
    .setLabel('📋 Ver Desafios Atuais')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(generateButton, challengesButton);

  await interaction.editReply({ embeds: [embed], components: [row] });
}

  /**
   * Handle generate action
   */
  private async handleGenerate(
    interaction: ChatInputCommandInteraction,
    adaptiveService: AdaptiveChallengeService,
    userId: string,
  ): Promise<void> {
  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setTitle('🔄 Gerando Desafios Adaptativos...')
    .setDescription('Analisando seu perfil e criando desafios personalizados...')
    .setColor('#F39C12')
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  try {
    const challenges = await adaptiveService.forceGenerateForUser(userId);

    if (challenges.length === 0) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro na Geração')
        .setDescription(
          'Não foi possível gerar desafios adaptativos.\n' +
          'Isso pode acontecer se você não possui estatísticas suficientes.\n\n' +
          '💡 **Dica:** Jogue algumas partidas primeiro!',
        )
        .setColor('#E74C3C')
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
      return;
    }

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Desafios Gerados com Sucesso!')
      .setDescription(
        `**${challenges.length} desafios adaptativos** foram criados especialmente para você!\n\n` +
        '🎯 Cada desafio foi personalizado baseado no seu desempenho\n' +
        '💰 Recompensas ajustadas ao seu nível de habilidade\n' +
        '📈 Dificuldade balanceada para seu progresso',
      )
      .setColor('#27AE60')
      .setTimestamp();

    challenges.forEach((challenge, index) => {
      const rarityEmoji = this.getRarityEmoji(challenge.rarity);
      successEmbed.addFields({
        name: `${challenge.icon} ${challenge.name} ${rarityEmoji}`,
        value: 
          `**${challenge.description}**\n` +
          `💰 ${challenge.rewards.xp} XP, ${challenge.rewards.coins} moedas\n` +
          `💡 ${challenge.motivationalMessage}`,
        inline: true,
      });
    });

    const viewButton = new ButtonBuilder()
      .setCustomId('view_adaptive_challenges')
      .setLabel('📋 Ver Todos os Desafios')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(viewButton);

    await interaction.editReply({ embeds: [successEmbed], components: [row] });
  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Erro na Geração')
      .setDescription(
        'Ocorreu um erro ao gerar os desafios adaptativos.\n' +
        'Tente novamente em alguns minutos.',
      )
      .setColor('#E74C3C')
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle stats action
 */
  private async handleStats(
    interaction: ChatInputCommandInteraction,
    adaptiveService: AdaptiveChallengeService,
  ): Promise<void> {
  await interaction.deferReply();

  const stats = await adaptiveService.getAdaptationStats();

  const embed = new EmbedBuilder()
    .setTitle('📈 Estatísticas de Adaptação')
    .setDescription('Dados sobre o sistema de desafios adaptativos')
    .setColor('#3498DB')
    .setTimestamp();

  embed.addFields({
    name: '📊 Desafios Adaptativos Hoje',
    value: `**${stats.totalAdaptiveChallenges}** desafios gerados`,
    inline: true,
  });

  embed.addFields({
    name: '🎯 Ajuste Médio de Dificuldade',
    value: `**${(stats.averageTargetAdjustment * 100).toFixed(0)}%** do valor base`,
    inline: true,
  });

  // Completion rates by skill
  if (Object.keys(stats.completionRateBySkill).length > 0) {
    const completionText = Object.entries(stats.completionRateBySkill)
      .map(([skill, rate]) => `• **${this.getSkillName(skill)}:** ${(rate * 100).toFixed(1)}%`)
      .join('\n');

    embed.addFields({
      name: '🏆 Taxa de Conclusão por Nível',
      value: completionText,
      inline: false,
    });
  }

  // Most popular challenge types
  if (stats.mostPopularChallengeTypes.length > 0) {
    const typesText = stats.mostPopularChallengeTypes
      .map((type, index) => `${index + 1}. **${this.getChallengeTypeName(type)}**`)
      .join('\n');

    embed.addFields({
      name: '🔥 Tipos de Desafio Mais Populares',
      value: typesText,
      inline: false,
    });
  }

  embed.addFields({
    name: '💡 Como Funciona',
    value: 
      'O sistema analisa:\n' +
      '• Suas estatísticas recentes\n' +
      '• Seu nível de habilidade\n' +
      '• Sua frequência de jogo\n' +
      '• Seus pontos fortes\n\n' +
      'E cria desafios personalizados com dificuldade e recompensas ajustadas!',
    inline: false,
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle preferences action
 */
  private async handlePreferences(
    interaction: ChatInputCommandInteraction,
    database: DatabaseService,
    userId: string,
  ): Promise<void> {
  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setTitle('🎮 Configurar Preferências')
    .setDescription(
      'Configure suas preferências para personalizar ainda mais os desafios adaptativos.\n\n' +
      '⚙️ **Em breve:** Sistema de preferências avançado\n' +
      '🎯 **Incluirá:** Tipos de desafio preferidos, dificuldade desejada, frequência',
    )
    .setColor('#9B59B6')
    .setTimestamp();

  embed.addFields({
    name: '🔧 Configurações Disponíveis',
    value: 
      '• **Tipos de Desafio:** Escolher categorias preferidas\n' +
      '• **Dificuldade:** Ajustar nível de desafio\n' +
      '• **Frequência:** Quantos desafios por dia\n' +
      '• **Notificações:** Alertas personalizados\n' +
      '• **Modos de Jogo:** Focar em modos específicos',
    inline: false,
  });

  const comingSoonButton = new ButtonBuilder()
    .setCustomId('preferences_coming_soon')
    .setLabel('🚧 Em Desenvolvimento')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const backButton = new ButtonBuilder()
    .setCustomId('back_to_adaptive_menu')
    .setLabel('🔙 Voltar')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(comingSoonButton, backButton);

  await interaction.editReply({ embeds: [embed], components: [row] });
}

  // Helper methods
  private createProgressBar(current: number, total: number, length: number = 10): string {
    const percentage = Math.min(current / total, 1);
    const filled = Math.floor(percentage * length);
    const empty = length - filled;
    
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }

  private getRarityEmoji(rarity: string): string {
    const rarityEmojis: Record<string, string> = {
      common: '⚪',
      uncommon: '🟢',
      rare: '🔵',
      epic: '🟣',
      legendary: '🟡',
    };
    return rarityEmojis[rarity] || '⚪';
  }

  private getSkillEmoji(skill: string): string {
    const skillEmojis: Record<string, string> = {
      beginner: '🌱',
      intermediate: '⚡',
      advanced: '🔥',
      expert: '💎',
      master: '👑',
    };
    return skillEmojis[skill] || '🌱';
  }

  private getSkillName(skill: string): string {
    const skillNames: Record<string, string> = {
      beginner: 'Iniciante',
      intermediate: 'Intermediário',
      advanced: 'Avançado',
      expert: 'Especialista',
      master: 'Mestre',
    };
    return skillNames[skill] || 'Iniciante';
  }

  private getActivityEmoji(activity: string): string {
    const activityEmojis: Record<string, string> = {
      low: '🐌',
      medium: '🚶',
      high: '🏃',
    };
    return activityEmojis[activity] || '🐌';
  }

  private getActivityName(activity: string): string {
    const activityNames: Record<string, string> = {
      low: 'Casual',
      medium: 'Ativo',
      high: 'Muito Ativo',
    };
    return activityNames[activity] || 'Casual';
  }

  private getChallengeTypeName(type: string): string {
    const typeNames: Record<string, string> = {
      kills: 'Eliminações',
      damage: 'Dano',
      survival_time: 'Sobrevivência',
      headshots: 'Headshots',
      wins: 'Vitórias',
      games: 'Partidas',
      revives: 'Revives',
    };
    return typeNames[type] || type;
  }
}

// Create instance and export
const adaptiveChallengeCommand = new AdaptiveChallengeCommand();

// Export individual properties for compatibility
export const data = adaptiveChallengeCommand.data;
export const category = adaptiveChallengeCommand.category;
export const cooldown = adaptiveChallengeCommand.cooldown;
export const execute = adaptiveChallengeCommand.execute.bind(adaptiveChallengeCommand);

export default {
  data: adaptiveChallengeCommand.data,
  category: adaptiveChallengeCommand.category,
  cooldown: adaptiveChallengeCommand.cooldown,
  execute: adaptiveChallengeCommand.execute.bind(adaptiveChallengeCommand),
} as Command;

export { AdaptiveChallengeCommand };