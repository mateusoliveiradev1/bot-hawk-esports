import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';

/**
 * Bootstrap command - Automatically sets up the server with channels, roles, and content
 */
const bootstrap: Command = {
  data: new SlashCommandBuilder()
    .setName('bootstrap')
    .setDescription('🚀 Configura automaticamente o servidor com canais, cargos e conteúdos')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Modo de configuração')
        .setRequired(false)
        .addChoices(
          { name: '🔧 Completo (Recomendado)', value: 'full' },
          { name: '📝 Apenas Canais', value: 'channels' },
          { name: '👥 Apenas Cargos', value: 'roles' },
          { name: '⚙️ Apenas Configurações', value: 'config' },
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false) as SlashCommandBuilder,
  
  category: CommandCategory.ADMIN,
  cooldown: 60,
  permissions: ['Administrator'],
  
  async execute(interaction, client: ExtendedClient) {
    const logger = new Logger();
    const mode = (interaction as any).options?.getString('mode') || 'full';
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const guild = interaction.guild!;
      const setupResults: string[] = [];
      
      // Verificar se já foi configurado
      const existingConfig = await client.database.client.guildConfig.findUnique({
        where: { guildId: guild.id },
      });
      
      const configData = existingConfig?.config as any;
      if (configData?.isSetup && mode === 'full') {
        const confirmEmbed = new EmbedBuilder()
          .setTitle('⚠️ Servidor já configurado')
          .setDescription('Este servidor já foi configurado anteriormente. Deseja reconfigurar?')
          .setColor('#FFA500')
          .addFields(
            { name: '📅 Configurado em', value: existingConfig ? `<t:${Math.floor(existingConfig.createdAt.getTime() / 1000)}:F>` : 'Não disponível', inline: true },
            { name: '🔧 Última atualização', value: existingConfig ? `<t:${Math.floor(existingConfig.updatedAt.getTime() / 1000)}:R>` : 'Não disponível', inline: true },
          );
        
        const confirmRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('bootstrap_confirm')
              .setLabel('Sim, reconfigurar')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🔄'),
            new ButtonBuilder()
              .setCustomId('bootstrap_cancel')
              .setLabel('Cancelar')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❌'),
          );
        
        await interaction.editReply({
          embeds: [confirmEmbed],
          components: [confirmRow],
        });
        
        // Aguardar confirmação
        const filter = (i: any) => i.user.id === interaction.user.id;
        const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 30000 });
        
        collector?.on('collect', async (i) => {
          if (i.customId === 'bootstrap_cancel') {
            await i.update({
              embeds: [new EmbedBuilder().setTitle('❌ Configuração cancelada').setColor('#FF0000')],
              components: [],
            });
            return;
          }
          
          if (i.customId === 'bootstrap_confirm') {
            await i.update({
              embeds: [new EmbedBuilder().setTitle('🔄 Reconfigurando servidor...').setColor('#0099FF')],
              components: [],
            });
            
            // Continuar com a configuração
            await performBootstrap();
          }
        });
        
        collector?.on('end', (collected) => {
          if (collected.size === 0) {
            interaction.editReply({
              embeds: [new EmbedBuilder().setTitle('⏰ Tempo esgotado').setColor('#FF0000')],
              components: [],
            });
          }
        });
        
        return;
      }
      
      const performBootstrap = async () => {
        const progressEmbed = new EmbedBuilder()
          .setTitle('🚀 Configurando servidor...')
          .setDescription('Por favor, aguarde enquanto configuramos tudo para você.')
          .setColor('#0099FF')
          .setFooter({ text: 'Isso pode levar alguns minutos' });
        
        await interaction.editReply({ embeds: [progressEmbed], components: [] });
        
        // 1. Criar/Atualizar cargos
        if (mode === 'full' || mode === 'roles') {
          setupResults.push(await setupRoles(guild));
        }
        
        // 2. Criar/Atualizar canais
        if (mode === 'full' || mode === 'channels') {
          setupResults.push(await setupChannels(guild));
        }
        
        // 3. Configurar banco de dados
        if (mode === 'full' || mode === 'config') {
          setupResults.push(await setupDatabase(guild, client));
        }
        
        // 4. Configurar permissões
        if (mode === 'full') {
          setupResults.push(await setupPermissions(guild));
        }
        
        // 5. Enviar mensagens de boas-vindas
        if (mode === 'full') {
          setupResults.push(await setupWelcomeMessages(guild));
        }
        
        // Resultado final
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Servidor configurado com sucesso!')
          .setDescription('Todas as configurações foram aplicadas. Seu servidor está pronto para uso!')
          .setColor('#00FF00')
          .addFields(
            { name: '📊 Resultados', value: setupResults.join('\n'), inline: false },
            { name: '🎯 Próximos passos', value: '• Use `/help` para ver todos os comandos\n• Configure as notificações com `/config`\n• Adicione usuários PUBG com `/register`', inline: false },
          )
          .setFooter({ text: `Configurado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [successEmbed] });
        
        logger.info(`Server ${guild.name} (${guild.id}) bootstrapped by ${interaction.user.tag}`);
      };
      
      await performBootstrap();
      
    } catch (error) {
      logger.error('Bootstrap command error:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro na configuração')
        .setDescription('Ocorreu um erro durante a configuração do servidor. Verifique as permissões do bot.')
        .setColor('#FF0000')
        .addFields(
          { name: '🔍 Detalhes', value: error instanceof Error ? error.message : 'Erro desconhecido' },
        );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

/**
 * Setup server roles
 */
async function setupRoles(guild: any): Promise<string> {
  const logger = new Logger();
  let created = 0;
  let updated = 0;
  
  const roles = [
    // PUBG Ranks
    { name: '🏆 Conqueror', color: '#FFD700', position: 20 },
    { name: '💎 Ace', color: '#B9F2FF', position: 19 },
    { name: '👑 Crown', color: '#DDA0DD', position: 18 },
    { name: '💍 Diamond', color: '#87CEEB', position: 17 },
    { name: '🥉 Platinum', color: '#E5E4E2', position: 16 },
    { name: '🥈 Gold', color: '#FFD700', position: 15 },
    { name: '🥇 Silver', color: '#C0C0C0', position: 14 },
    { name: '🔰 Bronze', color: '#CD7F32', position: 13 },
    
    // Internal Ranks
    { name: '⭐ Lenda', color: '#FF6B6B', position: 12 },
    { name: '🔥 Mestre', color: '#4ECDC4', position: 11 },
    { name: '⚡ Expert', color: '#45B7D1', position: 10 },
    { name: '🎯 Avançado', color: '#96CEB4', position: 9 },
    { name: '📈 Intermediário', color: '#FFEAA7', position: 8 },
    { name: '🌱 Iniciante', color: '#DDA0DD', position: 7 },
    
    // Special Roles
    { name: '🎖️ MVP', color: '#FF0000', position: 25 },
    { name: '🏅 Top Player', color: '#FFA500', position: 24 },
    { name: '🎮 Gamer Ativo', color: '#00FF00', position: 6 },
    { name: '🎵 Music Lover', color: '#9B59B6', position: 5 },
    { name: '🎬 Clip Master', color: '#E74C3C', position: 4 },
    { name: '🧠 Quiz Champion', color: '#3498DB', position: 3 },
    { name: '✅ Verificado', color: '#2ECC71', position: 2 },
    { name: '👋 Novo Membro', color: '#95A5A6', position: 1 },
  ];
  
  for (const roleData of roles) {
    try {
      const existingRole = guild.roles.cache.find((r: any) => r.name === roleData.name);
      
      if (existingRole) {
        await existingRole.edit({
          color: roleData.color,
          position: roleData.position,
        });
        updated++;
      } else {
        await guild.roles.create({
          name: roleData.name,
          color: roleData.color,
          position: roleData.position,
          mentionable: false,
        });
        created++;
      }
    } catch (error) {
      logger.error(`Error creating/updating role ${roleData.name}:`, error);
    }
  }
  
  return `🎭 **Cargos**: ${created} criados, ${updated} atualizados`;
}

/**
 * Setup server channels
 */
async function setupChannels(guild: any): Promise<string> {
  const logger = new Logger();
  let created = 0;
  let updated = 0;
  
  const channels = [
    // Categories
    { name: '📋 INFORMAÇÕES', type: ChannelType.GuildCategory, position: 0 },
    { name: '💬 CHAT GERAL', type: ChannelType.GuildCategory, position: 1 },
    { name: '🎮 PUBG', type: ChannelType.GuildCategory, position: 2 },
    { name: '🎵 MÚSICA', type: ChannelType.GuildCategory, position: 3 },
    { name: '🎯 JOGOS & QUIZZES', type: ChannelType.GuildCategory, position: 4 },
    { name: '🎬 CLIPS & HIGHLIGHTS', type: ChannelType.GuildCategory, position: 5 },
    { name: '🔧 ADMINISTRAÇÃO', type: ChannelType.GuildCategory, position: 6 },
    
    // Information channels
    { name: '📜-regras', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES' },
    { name: '📢-anúncios', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES' },
    { name: '🎉-eventos', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES' },
    { name: '📊-rankings', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES' },
    
    // General chat
    { name: '💬-geral', type: ChannelType.GuildText, category: '💬 CHAT GERAL' },
    { name: '🤖-comandos', type: ChannelType.GuildText, category: '💬 CHAT GERAL' },
    { name: '👋-boas-vindas', type: ChannelType.GuildText, category: '💬 CHAT GERAL' },
    
    // PUBG channels
    { name: '🎮-pubg-geral', type: ChannelType.GuildText, category: '🎮 PUBG' },
    { name: '📈-stats-pubg', type: ChannelType.GuildText, category: '🎮 PUBG' },
    { name: '🏆-ranking-pubg', type: ChannelType.GuildText, category: '🎮 PUBG' },
    { name: '👥-procurar-squad', type: ChannelType.GuildText, category: '🎮 PUBG' },
    { name: '🎯-scrims', type: ChannelType.GuildText, category: '🎮 PUBG' },
    
    // Music channels
    { name: '🎵-música', type: ChannelType.GuildText, category: '🎵 MÚSICA' },
    { name: '🎧-queue', type: ChannelType.GuildText, category: '🎵 MÚSICA' },
    { name: '🔊-música-voice', type: ChannelType.GuildVoice, category: '🎵 MÚSICA' },
    
    // Games & Quizzes
    { name: '🎯-mini-games', type: ChannelType.GuildText, category: '🎯 JOGOS & QUIZZES' },
    { name: '🧠-quizzes', type: ChannelType.GuildText, category: '🎯 JOGOS & QUIZZES' },
    { name: '🏅-desafios', type: ChannelType.GuildText, category: '🎯 JOGOS & QUIZZES' },
    { name: '🎖️-badges', type: ChannelType.GuildText, category: '🎯 JOGOS & QUIZZES' },
    
    // Clips & Highlights
    { name: '🎬-clips', type: ChannelType.GuildText, category: '🎬 CLIPS & HIGHLIGHTS' },
    { name: '⭐-highlights', type: ChannelType.GuildText, category: '🎬 CLIPS & HIGHLIGHTS' },
    { name: '📊-clip-rankings', type: ChannelType.GuildText, category: '🎬 CLIPS & HIGHLIGHTS' },
    
    // Administration
    { name: '🔧-admin', type: ChannelType.GuildText, category: '🔧 ADMINISTRAÇÃO' },
    { name: '📝-logs', type: ChannelType.GuildText, category: '🔧 ADMINISTRAÇÃO' },
    { name: '🎫-tickets', type: ChannelType.GuildText, category: '🔧 ADMINISTRAÇÃO' },
    
    // Voice channels
    { name: '🎮 Squad 1', type: ChannelType.GuildVoice, category: '🎮 PUBG' },
    { name: '🎮 Squad 2', type: ChannelType.GuildVoice, category: '🎮 PUBG' },
    { name: '🎮 Squad 3', type: ChannelType.GuildVoice, category: '🎮 PUBG' },
    { name: '💬 Chat Geral', type: ChannelType.GuildVoice, category: '💬 CHAT GERAL' },
    { name: '🎯 Scrims', type: ChannelType.GuildVoice, category: '🎮 PUBG' },
  ];
  
  const categories = new Map<string, any>();
  
  // Create categories first
  for (const channelData of channels.filter(c => c.type === ChannelType.GuildCategory)) {
    try {
      const existingCategory = guild.channels.cache.find((c: any) => c.name === channelData.name && c.type === ChannelType.GuildCategory);
      
      if (!existingCategory) {
        const category = await guild.channels.create({
          name: channelData.name,
          type: channelData.type,
          position: channelData.position,
        });
        categories.set(channelData.name, category);
        created++;
      } else {
        categories.set(channelData.name, existingCategory);
        updated++;
      }
    } catch (error) {
      logger.error(`Error creating category ${channelData.name}:`, error);
    }
  }
  
  // Create other channels
  for (const channelData of channels.filter(c => c.type !== ChannelType.GuildCategory)) {
    try {
      const existingChannel = guild.channels.cache.find((c: any) => c.name === channelData.name);
      
      if (!existingChannel) {
        const parent = channelData.category ? categories.get(channelData.category) : null;
        
        await guild.channels.create({
          name: channelData.name,
          type: channelData.type,
          parent: parent?.id,
        });
        created++;
      } else {
        updated++;
      }
    } catch (error) {
      logger.error(`Error creating channel ${channelData.name}:`, error);
    }
  }
  
  return `📺 **Canais**: ${created} criados, ${updated} atualizados`;
}

/**
 * Setup database configuration
 */
async function setupDatabase(guild: any, client: ExtendedClient): Promise<string> {
  try {
    const guildConfig = await client.database.client.guildConfig.upsert({
      where: { guildId: guild.id },
      update: {
        config: {
          isSetup: true,
          welcomeChannelId: guild.channels.cache.find((c: any) => c.name === '👋-boas-vindas')?.id,
          logsChannelId: guild.channels.cache.find((c: any) => c.name === '📝-logs')?.id,
          musicChannelId: guild.channels.cache.find((c: any) => c.name === '🎵-música')?.id,
          rankingChannelId: guild.channels.cache.find((c: any) => c.name === '📊-rankings')?.id,
          clipsChannelId: guild.channels.cache.find((c: any) => c.name === '🎬-clips')?.id,
          autoRoleEnabled: true,
          welcomeMessageEnabled: true,
          rankingNotificationsEnabled: true,
          badgeNotificationsEnabled: true,
        },
      },
      create: {
        guildId: guild.id,
        config: {
          isSetup: true,
          welcomeChannelId: guild.channels.cache.find((c: any) => c.name === '👋-boas-vindas')?.id,
          logsChannelId: guild.channels.cache.find((c: any) => c.name === '📝-logs')?.id,
          musicChannelId: guild.channels.cache.find((c: any) => c.name === '🎵-música')?.id,
          rankingChannelId: guild.channels.cache.find((c: any) => c.name === '📊-rankings')?.id,
          clipsChannelId: guild.channels.cache.find((c: any) => c.name === '🎬-clips')?.id,
          autoRoleEnabled: true,
          welcomeMessageEnabled: true,
          rankingNotificationsEnabled: true,
          badgeNotificationsEnabled: true,
        },
      },
    });
    
    // Create guild entry
    await client.database.guilds.upsert({
      id: guild.id,
      name: guild.name,
      ownerId: guild.ownerId,
    });
    
    return '💾 **Banco de dados**: Configurado com sucesso';
  } catch (error) {
    return '💾 **Banco de dados**: Erro na configuração';
  }
}

/**
 * Setup channel permissions
 */
async function setupPermissions(guild: any): Promise<string> {
  const logger = new Logger();
  let configured = 0;
  
  try {
    const everyoneRole = guild.roles.everyone;
    const verificadoRole = guild.roles.cache.find((r: any) => r.name === '✅ Verificado');
    
    // Configure admin channels permissions
    const adminChannels = guild.channels.cache.filter((c: any) => 
      c.name.includes('admin') || c.name.includes('logs') || c.name.includes('tickets'),
    );
    
    for (const channel of adminChannels.values()) {
      await channel.permissionOverwrites.edit(everyoneRole, {
        ViewChannel: false,
      });
      configured++;
    }
    
    // Configure verification requirement for main channels
    if (verificadoRole) {
      const mainChannels = guild.channels.cache.filter((c: any) => 
        !c.name.includes('admin') && !c.name.includes('logs') && 
        !c.name.includes('boas-vindas') && c.type !== ChannelType.GuildCategory,
      );
      
      for (const channel of mainChannels.values()) {
        await channel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: false,
          Connect: false,
        });
        
        await channel.permissionOverwrites.edit(verificadoRole, {
          SendMessages: true,
          Connect: true,
        });
        configured++;
      }
    }
    
    return `🔒 **Permissões**: ${configured} canais configurados`;
  } catch (error) {
    logger.error('Error setting up permissions:', error);
    return '🔒 **Permissões**: Erro na configuração';
  }
}

/**
 * Setup welcome messages
 */
async function setupWelcomeMessages(guild: any): Promise<string> {
  try {
    const welcomeChannel = guild.channels.cache.find((c: any) => c.name === '👋-boas-vindas');
    const rulesChannel = guild.channels.cache.find((c: any) => c.name === '📜-regras');
    const commandsChannel = guild.channels.cache.find((c: any) => c.name === '🤖-comandos');
    
    if (welcomeChannel) {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🎉 Bem-vindo ao Hawk Esports!')
        .setDescription('Seja bem-vindo ao nosso servidor de PUBG! Aqui você encontrará tudo sobre rankings, estatísticas, clips e muito mais.')
        .setColor('#00FF00')
        .addFields(
          { name: '📋 Primeiro passo', value: `Leia as regras em ${rulesChannel || '#📜-regras'}`, inline: true },
          { name: '🎮 Segundo passo', value: 'Use `/register` para cadastrar seu nick PUBG', inline: true },
          { name: '🤖 Comandos', value: `Veja todos os comandos em ${commandsChannel || '#🤖-comandos'}`, inline: true },
        )
        .setFooter({ text: 'Hawk Esports - PUBG Community' })
        .setTimestamp();
      
      await welcomeChannel.send({ embeds: [welcomeEmbed] });
    }
    
    if (rulesChannel) {
      const rulesEmbed = new EmbedBuilder()
        .setTitle('📜 Regras do Servidor')
        .setDescription('Para manter um ambiente saudável e divertido para todos, siga estas regras:')
        .setColor('#FFD700')
        .addFields(
          { name: '1️⃣ Respeito', value: 'Trate todos com respeito e cordialidade', inline: false },
          { name: '2️⃣ Spam', value: 'Não faça spam em canais de texto ou voz', inline: false },
          { name: '3️⃣ Conteúdo', value: 'Mantenha o conteúdo apropriado e relacionado ao canal', inline: false },
          { name: '4️⃣ Trapaça', value: 'Não toleramos trapaças ou hacks no PUBG', inline: false },
          { name: '5️⃣ Verificação', value: 'Use `/register` para se verificar e acessar todos os canais', inline: false },
        )
        .setFooter({ text: 'O não cumprimento das regras pode resultar em punições' });
      
      await rulesChannel.send({ embeds: [rulesEmbed] });
    }
    
    return '💬 **Mensagens**: Enviadas com sucesso';
  } catch (error) {
    return '💬 **Mensagens**: Erro no envio';
  }
}

export default bootstrap;