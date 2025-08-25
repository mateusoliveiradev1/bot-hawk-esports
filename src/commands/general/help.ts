import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { Logger } from '@/utils/logger';

/**
 * Help command - Shows all available commands organized by category
 */
const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📚 Mostra todos os comandos disponíveis')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('Comando específico para obter ajuda detalhada')
        .setRequired(false)
        .setAutocomplete(true)
    ) as SlashCommandBuilder,
  
  category: CommandCategory.GENERAL,
  cooldown: 5,
  
  async execute(interaction: any, client: ExtendedClient) {
    const logger = new Logger();
    const specificCommand = interaction.options.getString('command');
    
    try {
      if (specificCommand) {
        // Show help for specific command
        const command = client.commands.get(specificCommand);
        
        if (!command) {
          const notFoundEmbed = new EmbedBuilder()
            .setTitle('❌ Comando não encontrado')
            .setDescription(`O comando \`${specificCommand}\` não existe.`)
            .setColor('#FF0000')
            .setFooter({ text: 'Use /help para ver todos os comandos disponíveis' });
          
          await interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
          return;
        }
        
        const commandEmbed = new EmbedBuilder()
          .setTitle(`📖 Ajuda: /${command.data.name}`)
          .setDescription((command.data as any).description)
          .setColor('#0099FF')
          .addFields(
            { name: '📂 Categoria', value: getCategoryName(command.category), inline: true },
            { name: '⏱️ Cooldown', value: `${command.cooldown || 0} segundos`, inline: true },
            { name: '🔒 Permissões', value: command.permissions?.join(', ') || 'Nenhuma', inline: true }
          );
        
        if (command.aliases && command.aliases.length > 0) {
          commandEmbed.addFields(
            { name: '🔗 Aliases', value: command.aliases.map((alias: string) => `\`${alias}\``).join(', '), inline: false }
          );
        }
        
        // Usage and examples would need to be added to Command interface if needed
        
        await interaction.reply({ embeds: [commandEmbed], ephemeral: true });
        return;
      }
      
      // Show general help with categories
      const mainEmbed = new EmbedBuilder()
        .setTitle('📚 Central de Ajuda - Hawk Esports Bot')
        .setDescription('Selecione uma categoria abaixo para ver os comandos disponíveis ou use o menu para navegar.')
        .setColor('#0099FF')
        .setThumbnail(client.user?.displayAvatarURL() ?? null)
        .addFields(
          { name: '🎮 PUBG', value: 'Comandos relacionados ao PUBG, rankings e estatísticas', inline: true },
          { name: '🎵 Música', value: 'Sistema de música com playlists e controles', inline: true },
          { name: '🎯 Jogos', value: 'Mini-games, quizzes e desafios interativos', inline: true },
          { name: '🎬 Clips', value: 'Sistema de clips e highlights', inline: true },
          { name: '👤 Perfil', value: 'Comandos de perfil e estatísticas pessoais', inline: true },
          { name: '🔧 Admin', value: 'Comandos administrativos (apenas admins)', inline: true }
        )
        .setFooter({ text: 'Use /help <comando> para ajuda específica' })
        .setTimestamp();
      
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('🔍 Selecione uma categoria para ver os comandos')
        .addOptions([
          {
            label: 'Geral',
            description: 'Comandos básicos e utilitários',
            value: 'general',
            emoji: '📋'
          },
          {
            label: 'PUBG',
            description: 'Rankings, stats e comandos PUBG',
            value: 'pubg',
            emoji: '🎮'
          },
          {
            label: 'Música',
            description: 'Player de música e controles',
            value: 'music',
            emoji: '🎵'
          },
          {
            label: 'Jogos',
            description: 'Mini-games e quizzes',
            value: 'games',
            emoji: '🎯'
          },
          {
            label: 'Clips',
            description: 'Upload e votação de clips',
            value: 'clips',
            emoji: '🎬'
          },
          {
            label: 'Perfil',
            description: 'Perfil e estatísticas pessoais',
            value: 'profile',
            emoji: '👤'
          },
          {
            label: 'Administração',
            description: 'Comandos administrativos',
            value: 'admin',
            emoji: '🔧'
          }
        ]);
      
      const buttonsRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('help_quick_start')
            .setLabel('Início Rápido')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🚀'),
          new ButtonBuilder()
            .setCustomId('help_features')
            .setLabel('Funcionalidades')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⭐'),
          new ButtonBuilder()
            .setLabel('Dashboard')
            .setStyle(ButtonStyle.Link)
            .setURL('https://your-dashboard-url.com')
            .setEmoji('🌐'),
          new ButtonBuilder()
            .setLabel('Suporte')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/your-support-server')
            .setEmoji('💬')
        );
      
      const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(categorySelect);
      
      const response = await interaction.reply({
        embeds: [mainEmbed],
        components: [selectRow, buttonsRow],
        ephemeral: true
      });
      
      // Handle interactions
      const collector = response.createMessageComponentCollector({
        time: 300000 // 5 minutes
      });
      
      collector.on('collect', async (i: any) => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: '❌ Apenas quem executou o comando pode usar este menu.', ephemeral: true });
          return;
        }
        
        if (i.isStringSelectMenu() && i.customId === 'help_category_select') {
          const category = i.values[0];
          const categoryEmbed = await getCategoryEmbed(category ?? '', client);
          await i.update({ embeds: [categoryEmbed] });
        }
        
        if (i.isButton()) {
          switch (i.customId) {
            case 'help_quick_start':
              const quickStartEmbed = getQuickStartEmbed();
              await i.update({ embeds: [quickStartEmbed] });
              break;
              
            case 'help_features':
              const featuresEmbed = getFeaturesEmbed();
              await i.update({ embeds: [featuresEmbed] });
              break;
          }
        }
      });
      
      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
      
    } catch (error) {
      logger.error('Help command error:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro')
        .setDescription('Ocorreu um erro ao carregar a ajuda.')
        .setColor('#FF0000');
      
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
  
  async autocomplete(interaction: any) {
    const focusedValue = interaction.options.getFocused();
    const client = interaction.client as ExtendedClient;
    
    const commands = Array.from(client.commands.values())
      .filter((cmd: any) => cmd.data.name.includes(focusedValue.toLowerCase()))
      .slice(0, 25)
      .map((cmd: any) => ({
        name: `/${cmd.data.name} - ${cmd.data.description}`,
        value: cmd.data.name
      }));
    
    await interaction.respond(commands);
  }
};

/**
 * Get category embed
 */
async function getCategoryEmbed(category: string, client: ExtendedClient): Promise<EmbedBuilder> {
  const categoryMap: { [key: string]: CommandCategory } = {
    'general': CommandCategory.GENERAL,
    'pubg': CommandCategory.PUBG,
    'music': CommandCategory.MUSIC,
    'games': CommandCategory.GAMES,
    'clips': CommandCategory.CLIPS,
    'profile': CommandCategory.GENERAL,
    'admin': CommandCategory.ADMIN
  };
  
  const categoryEnum = categoryMap[category] ?? CommandCategory.GENERAL;
  const commands = Array.from(client.commands.values()).filter((cmd: any) => cmd.category === categoryEnum);
  
  const embed = new EmbedBuilder()
    .setTitle(`📖 Comandos - ${getCategoryName(categoryEnum)}`)
    .setColor('#0099FF')
    .setTimestamp();
  
  if (commands.length === 0) {
    embed.setDescription('Nenhum comando encontrado nesta categoria.');
    return embed;
  }
  
  const commandList = commands.map((cmd: any) => {
    const cooldown = cmd.cooldown ? ` (${cmd.cooldown}s)` : '';
    const permissions = cmd.permissions?.length ? ' 🔒' : '';
    return `**/${cmd.data.name}**${cooldown}${permissions}\n${cmd.data.description}`;
  }).join('\n\n');
  
  embed.setDescription(commandList);
  
  if (categoryEnum === CommandCategory.ADMIN) {
    embed.setFooter({ text: '🔒 = Requer permissões especiais' });
  }
  
  return embed;
}

/**
 * Get quick start embed
 */
function getQuickStartEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🚀 Início Rápido')
    .setDescription('Siga estes passos para começar a usar o bot:')
    .setColor('#00FF00')
    .addFields(
      { name: '1️⃣ Registro', value: 'Use `/register` para cadastrar seu nick PUBG e plataforma', inline: false },
      { name: '2️⃣ Perfil', value: 'Veja seu perfil com `/profile` e suas estatísticas', inline: false },
      { name: '3️⃣ Rankings', value: 'Confira os rankings com `/ranking pubg` ou `/ranking internal`', inline: false },
      { name: '4️⃣ Música', value: 'Toque música com `/play <música>` e controle com `/queue`', inline: false },
      { name: '5️⃣ Jogos', value: 'Participe de quizzes com `/quiz start` e mini-games', inline: false },
      { name: '6️⃣ Clips', value: 'Envie seus clips com `/clip upload` e vote nos melhores', inline: false }
    )
    .setFooter({ text: 'Dica: Use /help <comando> para ajuda específica' });
}

/**
 * Get features embed
 */
function getFeaturesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('⭐ Funcionalidades Principais')
    .setDescription('Conheça todas as funcionalidades do Hawk Esports Bot:')
    .setColor('#FFD700')
    .addFields(
      { name: '🎮 Sistema PUBG Completo', value: '• Rankings diários, semanais e mensais\n• Estatísticas detalhadas\n• Cargos automáticos por rank\n• Integração com API oficial', inline: false },
      { name: '🎵 Player de Música Avançado', value: '• Suporte a YouTube e Spotify\n• Playlists personalizadas\n• Filtros de áudio\n• Queue persistente', inline: false },
      { name: '🎯 Sistema de Gamificação', value: '• Mini-games interativos\n• Quizzes com rankings\n• Badges automáticas\n• Sistema de XP e moedas', inline: false },
      { name: '🎬 Clips e Highlights', value: '• Upload de vídeos\n• Sistema de votação\n• Rankings semanais\n• Moderação automática', inline: false },
      { name: '📊 Dashboard Web', value: '• Interface moderna\n• Estatísticas em tempo real\n• Controles administrativos\n• Visualização de dados', inline: false },
      { name: '🔧 Administração Completa', value: '• Auto-setup do servidor\n• Sistema de logs\n• Moderação automática\n• Backup de dados', inline: false }
    )
    .setFooter({ text: 'Hawk Esports - A melhor experiência PUBG no Discord' });
}

/**
 * Get category display name
 */
function getCategoryName(category: CommandCategory): string {
  const categoryNames: Record<CommandCategory, string> = {
    [CommandCategory.GENERAL]: '📋 Geral',
    [CommandCategory.PUBG]: '🎮 PUBG',
    [CommandCategory.MUSIC]: '🎵 Música',
    [CommandCategory.GAMES]: '🎯 Jogos',
    [CommandCategory.CLIPS]: '🎬 Clips',
    [CommandCategory.ADMIN]: '🔧 Administração',
    [CommandCategory.MODERATION]: '🛡️ Moderação',
    [CommandCategory.UTILITY]: '🔧 Utilitários',
    [CommandCategory.RANKING]: '📊 Ranking',
    [CommandCategory.FUN]: '🎉 Diversão',
    [CommandCategory.ECONOMY]: '💰 Economia',
    [CommandCategory.BADGES]: '🏆 Badges'
  };
  
  return categoryNames[category] || 'Desconhecido';
}

export default help;