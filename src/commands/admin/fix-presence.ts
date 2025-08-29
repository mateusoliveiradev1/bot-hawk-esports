import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  CommandInteraction,
  PermissionFlagsBits
} from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';
import { PresenceFixesService } from '@/services/presence-fixes.service';

/**
 * Admin command to fix presence system issues
 */
const fixPresence: Command = {
  data: new SlashCommandBuilder()
    .setName('fix-presence')
    .setDescription('🔧 Corrigir problemas no sistema de presença (Admin)')
    .addStringOption(option =>
      option
        .setName('tipo')
        .setDescription('Tipo de correção a executar')
        .setRequired(true)
        .addChoices(
          { name: '🔄 Corrigir inconsistências de dados', value: 'data' },
          { name: '🎮 Melhorar integração PUBG', value: 'pubg' },
          { name: '⚡ Otimizar performance', value: 'performance' },
          { name: '🛠️ Executar todas as correções', value: 'all' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,
  
  category: CommandCategory.ADMIN,
  cooldown: 60, // 1 minute cooldown
  
  async execute(interaction: CommandInteraction | ChatInputCommandInteraction, client: ExtendedClient): Promise<void> {
    const logger = new Logger();
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const tipo = (interaction as ChatInputCommandInteraction).options.getString('tipo', true);
      const userId = interaction.user.id;
      const guildId = interaction.guild!.id;
      
      // Check if user has admin permissions
      const member = interaction.member;
      if (!member || !member.permissions || !(member.permissions as any).has(PermissionFlagsBits.Administrator)) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Acesso Negado')
          .setDescription('Você precisa ter permissões de administrador para usar este comando.')
          .setColor(0xff0000)
          .setTimestamp();
        
        await interaction.editReply({ embeds: [errorEmbed] });
        return;
      }
      
      const presenceFixesService = new PresenceFixesService(client);
      
      // Create initial embed
      const initialEmbed = new EmbedBuilder()
        .setTitle('🔧 Iniciando Correções do Sistema de Presença')
        .setDescription('Executando correções... Por favor, aguarde.')
        .setColor(0xffaa00)
        .setTimestamp();
      
      await interaction.editReply({ embeds: [initialEmbed] });
      
      let results: string[] = [];
      
      try {
        switch (tipo) {
          case 'data':
            await presenceFixesService.fixPresenceDataInconsistencies();
            results.push('✅ Inconsistências de dados corrigidas');
            break;
            
          case 'pubg':
            await presenceFixesService.enhancePUBGIntegration();
            results.push('✅ Integração PUBG melhorada');
            break;
            
          case 'performance':
            await presenceFixesService.optimizePresencePerformance();
            results.push('✅ Performance otimizada');
            break;
            
          case 'all':
            await presenceFixesService.runAllFixes();
            results.push('✅ Todas as correções executadas com sucesso');
            break;
            
          default:
            throw new Error('Tipo de correção inválido');
        }
        
        // Create success embed
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Correções Concluídas')
          .setDescription('As correções do sistema de presença foram executadas com sucesso!')
          .setColor(0x00ff00)
          .addFields(
            {
              name: '🔧 Tipo de Correção',
              value: getFixTypeDisplayName(tipo),
              inline: true
            },
            {
              name: '👤 Executado por',
              value: interaction.user.displayName,
              inline: true
            },
            {
              name: '⏰ Horário',
              value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
              inline: true
            },
            {
              name: '📊 Resultados',
              value: results.join('\n'),
              inline: false
            }
          )
          .setTimestamp();
        
        await interaction.editReply({ embeds: [successEmbed] });
        
        logger.info(`Presence fixes executed by ${userId}: ${tipo}`);
        
      } catch (fixError) {
        logger.error('Error executing presence fixes:', fixError);
        
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Erro nas Correções')
          .setDescription(`Ocorreu um erro ao executar as correções: ${fixError instanceof Error ? fixError.message : 'Erro desconhecido'}`)
          .setColor(0xff0000)
          .addFields(
            {
              name: '🔧 Tipo de Correção',
              value: getFixTypeDisplayName(tipo),
              inline: true
            },
            {
              name: '⏰ Horário',
              value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
              inline: true
            }
          )
          .setTimestamp();
        
        await interaction.editReply({ embeds: [errorEmbed] });
      }
      
    } catch (error) {
      logger.error('Error in fix-presence command:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro Interno')
        .setDescription('Ocorreu um erro interno ao processar o comando.')
        .setColor(0xff0000)
        .setTimestamp();
      
      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};

/**
 * Get display name for fix type
 */
function getFixTypeDisplayName(tipo: string): string {
  switch (tipo) {
    case 'data':
      return '🔄 Correção de Inconsistências de Dados';
    case 'pubg':
      return '🎮 Melhoria da Integração PUBG';
    case 'performance':
      return '⚡ Otimização de Performance';
    case 'all':
      return '🛠️ Todas as Correções';
    default:
      return 'Desconhecido';
  }
}

export default fixPresence;