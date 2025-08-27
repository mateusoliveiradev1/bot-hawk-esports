import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, Collection } from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';

/**
 * Clean old messages from channels
 */
async function cleanOldMessages(guild: any): Promise<string> {
  const logger = new Logger();
  let cleaned = 0;
  
  try {
    const channels = guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildText);
    
    for (const channel of channels.values()) {
      try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const oldMessages = messages.filter((msg: any) => 
          Date.now() - msg.createdTimestamp > 14 * 24 * 60 * 60 * 1000 // 14 dias
        );
        
        if (oldMessages.size > 0) {
          await channel.bulkDelete(oldMessages, true);
          cleaned += oldMessages.size;
        }
      } catch (error) {
        // Ignorar erros de canais específicos
        logger.warn(`Could not clean messages in ${channel.name}:`, error);
      }
    }
    
    return `🧹 **Limpeza**: ${cleaned} mensagens antigas removidas`;
  } catch (error) {
    logger.error('Error cleaning messages:', error);
    return '🧹 **Limpeza**: Erro na limpeza de mensagens';
  }
}

/**
 * Create progress embed with visual progress bar
 */
function createProgressEmbed(step: number, total: number, currentTask: string): EmbedBuilder {
  const percentage = Math.round((step / total) * 100);
  const progressBar = '█'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
  
  return new EmbedBuilder()
    .setTitle('🚀 Configurando Servidor Perfeito')
    .setDescription(`**${currentTask}**\n\n🔄 Progresso: ${percentage}%\n\`${progressBar}\` ${step}/${total}`)
    .setColor('#00D4AA')
    .setFooter({ text: 'Criando a experiência Discord perfeita...' })
    .setTimestamp();
}

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
          { name: '🏗️ Configuração Inicial', value: 'initial' },
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
        const totalSteps = mode === 'full' ? 7 : mode === 'initial' ? 4 : 3;
        let currentStep = 0;
        
        // Passo 0: Limpeza inicial
        if (mode === 'full') {
          currentStep++;
          await interaction.editReply({ embeds: [createProgressEmbed(currentStep, totalSteps, '🧹 Limpando mensagens antigas...')], components: [] });
          setupResults.push(await cleanOldMessages(guild));
        }
        
        // Passo 1: Criar/Atualizar cargos
        if (mode === 'full' || mode === 'roles') {
          currentStep++;
          await interaction.editReply({ embeds: [createProgressEmbed(currentStep, totalSteps, '👥 Configurando sistema de cargos...')], components: [] });
          setupResults.push(await setupRoles(guild));
        }
        
        // Passo 2: Criar/Atualizar canais
        if (mode === 'full' || mode === 'channels') {
          currentStep++;
          await interaction.editReply({ embeds: [createProgressEmbed(currentStep, totalSteps, '📺 Criando canais especializados...')], components: [] });
          setupResults.push(await setupChannels(guild, 'full'));
        } else if (mode === 'initial') {
          currentStep++;
          await interaction.editReply({ embeds: [createProgressEmbed(currentStep, totalSteps, '📺 Criando canais essenciais...')], components: [] });
          setupResults.push(await setupChannels(guild, 'initial'));
        }
        
        // Passo 3: Configurar banco de dados
        if (mode === 'full' || mode === 'config') {
          currentStep++;
          await interaction.editReply({ embeds: [createProgressEmbed(currentStep, totalSteps, '💾 Configurando banco de dados...')], components: [] });
          setupResults.push(await setupDatabase(guild, client));
        }
        
        // Passo 4: Configurar permissões
        if (mode === 'full') {
          currentStep++;
          await interaction.editReply({ embeds: [createProgressEmbed(currentStep, totalSteps, '🔒 Aplicando permissões de segurança...')], components: [] });
          setupResults.push(await setupPermissions(guild));
        }
        
        // Passo 5: Enviar mensagens de boas-vindas
        if (mode === 'full') {
          currentStep++;
          await interaction.editReply({ embeds: [createProgressEmbed(currentStep, totalSteps, '💬 Criando mensagens de boas-vindas...')], components: [] });
          setupResults.push(await setupWelcomeMessages(guild));
        }
        
        // Passo 6: Configurações finais e reações automáticas
        if (mode === 'full') {
          currentStep++;
          await interaction.editReply({ embeds: [createProgressEmbed(currentStep, totalSteps, '⚡ Aplicando toques finais...')], components: [] });
          setupResults.push(await setupFinalTouches(guild));
          
          // Add automatic reactions and interactive elements
          await setupAutomaticReactions(guild);
          await setupInteractiveElements(guild);
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
  
  // Staff Roles (Highest Priority)
  const staffRoles = [
    { name: '👑 Fundador', color: '#FFD700', position: 50, permissions: ['ADMINISTRATOR'] },
    { name: '🛡️ Admin', color: '#E74C3C', position: 49, permissions: ['MANAGE_GUILD', 'MANAGE_CHANNELS', 'MANAGE_ROLES'] },
    { name: '⚔️ Moderador', color: '#3498DB', position: 48, permissions: ['MANAGE_MESSAGES', 'KICK_MEMBERS', 'MUTE_MEMBERS'] },
    { name: '🎯 Helper', color: '#2ECC71', position: 47, permissions: ['MANAGE_MESSAGES'] },
    { name: '🤖 Bot Manager', color: '#7289DA', position: 46, permissions: ['MANAGE_WEBHOOKS'] },
  ];

  // VIP & Special Roles
  const vipRoles = [
    { name: '💎 VIP Diamond', color: '#B9F2FF', position: 45 },
    { name: '🌟 VIP Gold', color: '#FFD700', position: 44 },
    { name: '⭐ VIP Silver', color: '#C0C0C0', position: 43 },
    { name: '🎵 DJ Oficial', color: '#1ABC9C', position: 42 },
    { name: '🎨 Designer', color: '#E67E22', position: 41 },
    { name: '📹 Streamer', color: '#9146FF', position: 40 },
    { name: '🎬 Content Creator', color: '#FF69B4', position: 39 },
  ];

  // Achievement Roles
  const achievementRoles = [
    { name: '🏆 Campeão', color: '#FFD700', position: 38 },
    { name: '🥇 MVP da Temporada', color: '#F39C12', position: 37 },
    { name: '🎯 Sniper Elite', color: '#FF6B6B', position: 36 },
    { name: '🔥 Clutch Master', color: '#FF4500', position: 35 },
    { name: '👑 Chicken Dinner King', color: '#FFA500', position: 34 },
    { name: '🎖️ Veterano', color: '#8B4513', position: 33 },
  ];

  // PUBG Competitive Ranks
  const pubgCompetitiveRanks = [
    { name: '🏆 Conqueror', color: '#9C27B0', position: 32 },
    { name: '💎 Grandmaster', color: '#FF1744', position: 31 },
    { name: '🔥 Master', color: '#FF6B6B', position: 30 },
    { name: '💠 Diamond', color: '#B9F2FF', position: 29 },
    { name: '🥈 Platinum', color: '#E5E4E2', position: 28 },
    { name: '🥇 Gold', color: '#FFD700', position: 27 },
    { name: '🥉 Silver', color: '#C0C0C0', position: 26 },
    { name: '🟤 Bronze', color: '#CD7F32', position: 25 },
  ];

  // Activity & Engagement Roles
  const activityRoles = [
    { name: '🔥 Ativo', color: '#FF4500', position: 24 },
    { name: '💬 Conversador', color: '#00CED1', position: 23 },
    { name: '🎮 Gamer Dedicado', color: '#32CD32', position: 22 },
    { name: '🎉 Animador', color: '#FF69B4', position: 21 },
    { name: '🤝 Colaborativo', color: '#20B2AA', position: 20 },
  ];

  // Squad & Team Roles
  const squadRoles = [
    { name: '🎯 IGL (In-Game Leader)', color: '#FF6347', position: 19 },
    { name: '🔫 Fragger', color: '#DC143C', position: 18 },
    { name: '🛡️ Support', color: '#4169E1', position: 17 },
    { name: '🎯 Sniper', color: '#8B008B', position: 16 },
    { name: '🏃 Entry Fragger', color: '#FF8C00', position: 15 },
  ];

  // Game Mode Preferences
  const gameModeRoles = [
    { name: '👤 Solo Player', color: '#708090', position: 14 },
    { name: '👥 Duo Player', color: '#4682B4', position: 13 },
    { name: '🎮 Squad Player', color: '#228B22', position: 12 },
    { name: '📱 Mobile Player', color: '#FF1493', position: 11 },
    { name: '💻 PC Player', color: '#6495ED', position: 10 },
  ];

  // Notification Roles
  const notificationRoles = [
    { name: '🔔 Eventos', color: '#FFA500', position: 9 },
    { name: '🏆 Torneios', color: '#FFD700', position: 8 },
    { name: '🎉 Anúncios', color: '#FF69B4', position: 7 },
    { name: '🎵 Música', color: '#9370DB', position: 6 },
    { name: '🎬 Streams', color: '#9146FF', position: 5 },
  ];

  // Basic Member Roles
  const basicRoles = [
    { name: '✅ Verificado', color: '#2ECC71', position: 4 },
    { name: '🌱 Iniciante', color: '#95A5A6', position: 3 },
    { name: '👋 Novo Membro', color: '#BDC3C7', position: 2 },
  ];

  // Combine all roles
  const roles = [
    ...staffRoles,
    ...vipRoles,
    ...achievementRoles,
    ...pubgCompetitiveRanks,
    ...activityRoles,
    ...squadRoles,
    ...gameModeRoles,
    ...notificationRoles,
    ...basicRoles,
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

// Interface for channel configuration
interface ChannelConfig {
  name: string;
  type: ChannelType;
  category?: string;
  topic?: string;
  position?: number;
  userLimit?: number;
}

/**
 * Setup server channels
 */
async function setupChannels(guild: any, mode: string = 'full'): Promise<string> {
  const logger = new Logger();
  let created = 0;
  let updated = 0;
  
  // Define canais essenciais para configuração inicial
  const essentialChannels: ChannelConfig[] = [
    // Categories
    { name: '📋 INFORMAÇÕES', type: ChannelType.GuildCategory, position: 0 },
    { name: '💬 CHAT GERAL', type: ChannelType.GuildCategory, position: 1 },
    
    // Essential information channels
    { name: '📜-regras', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES', topic: '📋 Leia as regras do servidor antes de participar das atividades' },
    { name: '📢-anúncios', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES', topic: '📢 Anúncios importantes e atualizações do servidor' },
    { name: '👋-boas-vindas', type: ChannelType.GuildText, category: '💬 CHAT GERAL', topic: '👋 Canal de boas-vindas para novos membros' },
    
    // Essential general chat
    { name: '💬-geral', type: ChannelType.GuildText, category: '💬 CHAT GERAL', topic: '💬 Conversa geral da comunidade' },
    { name: '🤖-comandos', type: ChannelType.GuildText, category: '💬 CHAT GERAL', topic: '🤖 Use os comandos do bot aqui para não poluir outros canais' },
  ];
  
  // Define todos os canais para configuração completa
  const allChannels: ChannelConfig[] = [
    // Categories
    { name: '📋 INFORMAÇÕES', type: ChannelType.GuildCategory, position: 0 },
    { name: '💬 CHAT GERAL', type: ChannelType.GuildCategory, position: 1 },
    { name: '🎮 PUBG COMPETITIVO', type: ChannelType.GuildCategory, position: 2 },
    { name: '🎯 PUBG CASUAL', type: ChannelType.GuildCategory, position: 3 },
    { name: '🎵 MÚSICA & ENTRETENIMENTO', type: ChannelType.GuildCategory, position: 4 },
    { name: '🎲 JOGOS & ATIVIDADES', type: ChannelType.GuildCategory, position: 5 },
    { name: '🎬 CONTEÚDO & MÍDIA', type: ChannelType.GuildCategory, position: 6 },
    { name: '🏆 COMPETIÇÕES & EVENTOS', type: ChannelType.GuildCategory, position: 7 },
    { name: '🤝 COMUNIDADE', type: ChannelType.GuildCategory, position: 8 },
    { name: '🔧 ADMINISTRAÇÃO', type: ChannelType.GuildCategory, position: 9 },
    
    // Information channels
    { name: '📜-regras', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES', topic: '📋 Leia as regras do servidor antes de participar das atividades' },
    { name: '📢-anúncios', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES', topic: '📢 Anúncios importantes e atualizações do servidor' },
    { name: '🎉-eventos', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES', topic: '🎉 Eventos especiais e competições da comunidade' },
    { name: '📊-rankings-geral', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES', topic: '📊 Rankings gerais e estatísticas globais do servidor' },
    { name: '📋-changelog', type: ChannelType.GuildText, category: '📋 INFORMAÇÕES', topic: '📋 Atualizações do bot, novidades e mudanças no servidor' },
    
    // General chat
    { name: '💬-geral', type: ChannelType.GuildText, category: '💬 CHAT GERAL', topic: '💬 Conversa geral da comunidade' },
    { name: '🤖-comandos', type: ChannelType.GuildText, category: '💬 CHAT GERAL', topic: '🤖 Use os comandos do bot aqui para não poluir outros canais' },
    { name: '👋-boas-vindas', type: ChannelType.GuildText, category: '💬 CHAT GERAL', topic: '👋 Canal de boas-vindas para novos membros' },
    { name: '🎭-off-topic', type: ChannelType.GuildText, category: '💬 CHAT GERAL', topic: '🎭 Conversas aleatórias, memes e assuntos diversos' },
    { name: '🔗-links-úteis', type: ChannelType.GuildText, category: '💬 CHAT GERAL', topic: '🔗 Links úteis, recursos e ferramentas para PUBG' },
    
    // PUBG Competitive channels
    { name: '🏆-ranking-competitivo', type: ChannelType.GuildText, category: '🎮 PUBG COMPETITIVO', topic: '🏆 Rankings oficiais, temporadas e competições do servidor' },
    { name: '🎯-scrims', type: ChannelType.GuildText, category: '🎮 PUBG COMPETITIVO', topic: '🎯 Organize e participe de scrimmages e treinos competitivos' },
    { name: '📈-stats-pro', type: ChannelType.GuildText, category: '🎮 PUBG COMPETITIVO', topic: '📈 Estatísticas avançadas, análises e progresso competitivo' },
    { name: '🎮-estratégias', type: ChannelType.GuildText, category: '🎮 PUBG COMPETITIVO', topic: '🎮 Discussões sobre estratégias, táticas e meta do jogo' },
    { name: '🔥-highlights-pro', type: ChannelType.GuildText, category: '🎮 PUBG COMPETITIVO', topic: '🔥 Melhores jogadas competitivas e momentos épicos' },
    
    // PUBG Casual channels
    { name: '🎮-pubg-geral', type: ChannelType.GuildText, category: '🎯 PUBG CASUAL', topic: '🎮 Discussões gerais sobre PUBG, dicas e novidades do jogo' },
    { name: '👥-procurar-squad', type: ChannelType.GuildText, category: '🎯 PUBG CASUAL', topic: '👥 Encontre parceiros para jogar, forme squads e organize partidas' },
    { name: '📱-pubg-mobile', type: ChannelType.GuildText, category: '🎯 PUBG CASUAL', topic: '📱 Discussões específicas sobre PUBG Mobile' },
    { name: '🎪-partidas-custom', type: ChannelType.GuildText, category: '🎯 PUBG CASUAL', topic: '🎪 Organize partidas customizadas e eventos casuais' },
    { name: '📸-screenshots', type: ChannelType.GuildText, category: '🎯 PUBG CASUAL', topic: '📸 Compartilhe screenshots, skins e momentos do jogo' },
    
    // Music & Entertainment channels
    { name: '🎵-música', type: ChannelType.GuildText, category: '🎵 MÚSICA & ENTRETENIMENTO', topic: '🎵 Comandos de música, pedidos de músicas e controle do bot' },
    { name: '🎧-queue', type: ChannelType.GuildText, category: '🎵 MÚSICA & ENTRETENIMENTO', topic: '🎧 Visualize a fila de reprodução atual e próximas músicas' },
    { name: '🎤-karaokê', type: ChannelType.GuildText, category: '🎵 MÚSICA & ENTRETENIMENTO', topic: '🎤 Organize sessões de karaokê e cante junto' },
    { name: '🎬-filmes-séries', type: ChannelType.GuildText, category: '🎵 MÚSICA & ENTRETENIMENTO', topic: '🎬 Discussões sobre filmes, séries e entretenimento' },
    { name: '📺-watch-party', type: ChannelType.GuildText, category: '🎵 MÚSICA & ENTRETENIMENTO', topic: '📺 Organize sessões para assistir conteúdo juntos' },
    
    // Games & Activities
    { name: '🎯-mini-games', type: ChannelType.GuildText, category: '🎲 JOGOS & ATIVIDADES', topic: '🎯 Mini-games divertidos e desafios rápidos da comunidade' },
    { name: '🧠-quizzes', type: ChannelType.GuildText, category: '🎲 JOGOS & ATIVIDADES', topic: '🧠 Quizzes sobre PUBG, jogos em geral e conhecimentos diversos' },
    { name: '🏅-desafios', type: ChannelType.GuildText, category: '🎲 JOGOS & ATIVIDADES', topic: '🏅 Desafios especiais, missões da comunidade e competições temáticas' },
    { name: '🎖️-badges', type: ChannelType.GuildText, category: '🎲 JOGOS & ATIVIDADES', topic: '🎖️ Sistema de conquistas, badges especiais e recompensas' },
    { name: '🎲-outros-jogos', type: ChannelType.GuildText, category: '🎲 JOGOS & ATIVIDADES', topic: '🎲 Discussões sobre outros jogos além do PUBG' },
    { name: '🃏-jogos-de-mesa', type: ChannelType.GuildText, category: '🎲 JOGOS & ATIVIDADES', topic: '🃏 Jogos de mesa online, cartas e atividades em grupo' },
    
    // Content & Media
    { name: '🎬-clips', type: ChannelType.GuildText, category: '🎬 CONTEÚDO & MÍDIA', topic: '🎬 Compartilhe seus melhores clips e jogadas épicas' },
    { name: '⭐-highlights', type: ChannelType.GuildText, category: '🎬 CONTEÚDO & MÍDIA', topic: '⭐ Os melhores highlights da comunidade selecionados' },
    { name: '📊-clip-rankings', type: ChannelType.GuildText, category: '🎬 CONTEÚDO & MÍDIA', topic: '📊 Rankings dos melhores clips e votações da comunidade' },
    { name: '📹-streams', type: ChannelType.GuildText, category: '🎬 CONTEÚDO & MÍDIA', topic: '📹 Divulgue suas lives e acompanhe streamers da comunidade' },
    { name: '🎨-arte-criativa', type: ChannelType.GuildText, category: '🎬 CONTEÚDO & MÍDIA', topic: '🎨 Arte, designs, wallpapers e criações da comunidade' },
    { name: '📝-conteúdo-escrito', type: ChannelType.GuildText, category: '🎬 CONTEÚDO & MÍDIA', topic: '📝 Guias, tutoriais, análises e conteúdo escrito' },
    
    // Competitions & Events
    { name: '🏆-torneios', type: ChannelType.GuildText, category: '🏆 COMPETIÇÕES & EVENTOS', topic: '🏆 Torneios oficiais, inscrições e resultados' },
    { name: '🎪-eventos-especiais', type: ChannelType.GuildText, category: '🏆 COMPETIÇÕES & EVENTOS', topic: '🎪 Eventos temáticos, celebrações e atividades especiais' },
    { name: '🥇-hall-da-fama', type: ChannelType.GuildText, category: '🏆 COMPETIÇÕES & EVENTOS', topic: '🥇 Campeões, recordes e conquistas memoráveis' },
    { name: '📅-calendário', type: ChannelType.GuildText, category: '🏆 COMPETIÇÕES & EVENTOS', topic: '📅 Cronograma de eventos, torneios e atividades programadas' },
    { name: '🎁-premiações', type: ChannelType.GuildText, category: '🏆 COMPETIÇÕES & EVENTOS', topic: '🎁 Sistema de recompensas, prêmios e sorteios' },
    
    // Community
    { name: '💡-sugestões', type: ChannelType.GuildText, category: '🤝 COMUNIDADE', topic: '💡 Sugestões para melhorar o servidor e a comunidade' },
    { name: '🆘-suporte', type: ChannelType.GuildText, category: '🤝 COMUNIDADE', topic: '🆘 Tire dúvidas e receba ajuda da comunidade' },
    { name: '🤝-parcerias', type: ChannelType.GuildText, category: '🤝 COMUNIDADE', topic: '🤝 Propostas de parcerias e colaborações' },
    { name: '📢-divulgação', type: ChannelType.GuildText, category: '🤝 COMUNIDADE', topic: '📢 Divulgue seu conteúdo, canal ou servidor (com moderação)' },
    { name: '🎂-aniversários', type: ChannelType.GuildText, category: '🤝 COMUNIDADE', topic: '🎂 Comemore aniversários e datas especiais dos membros' },
    { name: '💬-feedback', type: ChannelType.GuildText, category: '🤝 COMUNIDADE', topic: '💬 Feedback sobre o servidor, bot e experiência geral' },
    
    // Administration
    { name: '🔧-admin-geral', type: ChannelType.GuildText, category: '🔧 ADMINISTRAÇÃO', topic: '🔧 Canal geral da administração para discussões internas' },
    { name: '📝-logs', type: ChannelType.GuildText, category: '🔧 ADMINISTRAÇÃO', topic: '📝 Logs automáticos do servidor: entradas, saídas, moderação e atividades importantes' },
    { name: '🎫-tickets', type: ChannelType.GuildText, category: '🔧 ADMINISTRAÇÃO', topic: '🎫 Sistema de tickets para suporte, dúvidas e solicitações dos membros' },
    
    // Voice channels - General
    { name: '🔊 Lobby Geral', type: ChannelType.GuildVoice, category: '💬 CHAT GERAL', userLimit: 15 },
    { name: '💬 Conversa Livre', type: ChannelType.GuildVoice, category: '💬 CHAT GERAL', userLimit: 10 },
    { name: '🎭 Sala Privada 1', type: ChannelType.GuildVoice, category: '💬 CHAT GERAL', userLimit: 5 },
    { name: '🎭 Sala Privada 2', type: ChannelType.GuildVoice, category: '💬 CHAT GERAL', userLimit: 5 },
    
    // Voice channels - PUBG Competitive
    { name: '🏆 Scrimmage', type: ChannelType.GuildVoice, category: '🎮 PUBG COMPETITIVO', userLimit: 4 },
    { name: '🎯 Treino Competitivo', type: ChannelType.GuildVoice, category: '🎮 PUBG COMPETITIVO', userLimit: 4 },
    { name: '📊 Análise Tática', type: ChannelType.GuildVoice, category: '🎮 PUBG COMPETITIVO', userLimit: 8 },
    { name: '🔥 Squad Pro 1', type: ChannelType.GuildVoice, category: '🎮 PUBG COMPETITIVO', userLimit: 4 },
    { name: '🔥 Squad Pro 2', type: ChannelType.GuildVoice, category: '🎮 PUBG COMPETITIVO', userLimit: 4 },
    
    // Voice channels - PUBG Casual
    { name: '🎮 Squad Casual 1', type: ChannelType.GuildVoice, category: '🎯 PUBG CASUAL', userLimit: 4 },
    { name: '🎮 Squad Casual 2', type: ChannelType.GuildVoice, category: '🎯 PUBG CASUAL', userLimit: 4 },
    { name: '🎮 Squad Casual 3', type: ChannelType.GuildVoice, category: '🎯 PUBG CASUAL', userLimit: 4 },
    { name: '🎮 Squad Casual 4', type: ChannelType.GuildVoice, category: '🎯 PUBG CASUAL', userLimit: 4 },
    { name: '📱 PUBG Mobile', type: ChannelType.GuildVoice, category: '🎯 PUBG CASUAL', userLimit: 6 },
    { name: '🎪 Partidas Custom', type: ChannelType.GuildVoice, category: '🎯 PUBG CASUAL', userLimit: 10 },
    
    // Voice channels - Music & Entertainment
    { name: '🎵 Música Principal', type: ChannelType.GuildVoice, category: '🎵 MÚSICA & ENTRETENIMENTO', userLimit: 20 },
    { name: '🎤 Karaokê', type: ChannelType.GuildVoice, category: '🎵 MÚSICA & ENTRETENIMENTO', userLimit: 12 },
    { name: '📺 Watch Party', type: ChannelType.GuildVoice, category: '🎵 MÚSICA & ENTRETENIMENTO', userLimit: 15 },
    { name: '🎬 Cinema', type: ChannelType.GuildVoice, category: '🎵 MÚSICA & ENTRETENIMENTO', userLimit: 10 },
    
    // Voice channels - Games & Activities
    { name: '🎲 Outros Jogos', type: ChannelType.GuildVoice, category: '🎲 JOGOS & ATIVIDADES', userLimit: 8 },
    { name: '🃏 Jogos de Mesa', type: ChannelType.GuildVoice, category: '🎲 JOGOS & ATIVIDADES', userLimit: 6 },
    { name: '🧠 Quiz & Desafios', type: ChannelType.GuildVoice, category: '🎲 JOGOS & ATIVIDADES', userLimit: 10 },
    
    // Voice channels - Events
    { name: '🏆 Torneio Oficial', type: ChannelType.GuildVoice, category: '🏆 COMPETIÇÕES & EVENTOS', userLimit: 20 },
    { name: '🎪 Evento Especial', type: ChannelType.GuildVoice, category: '🏆 COMPETIÇÕES & EVENTOS', userLimit: 15 },
    { name: '📹 Transmissão', type: ChannelType.GuildVoice, category: '🏆 COMPETIÇÕES & EVENTOS', userLimit: 5 },
    
    // Voice channels - Community
    { name: '🤝 Reunião Staff', type: ChannelType.GuildVoice, category: '🤝 COMUNIDADE', userLimit: 8 },
    { name: '💡 Brainstorm', type: ChannelType.GuildVoice, category: '🤝 COMUNIDADE', userLimit: 6 },
    { name: '🆘 Suporte Voz', type: ChannelType.GuildVoice, category: '🤝 COMUNIDADE', userLimit: 4 },
  ];
  
  // Choose which channels to create based on mode
  const channels = mode === 'essential' ? essentialChannels : allChannels;
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
        
        const channelOptions: any = {
          name: channelData.name,
          type: channelData.type,
          parent: parent?.id,
        };
        
        // Add topic for text channels
        if (channelData.topic) {
          channelOptions.topic = channelData.topic;
        }
        
        // Add user limit for voice channels
        if (channelData.userLimit && channelData.type === ChannelType.GuildVoice) {
          channelOptions.userLimit = channelData.userLimit;
        }
        
        await guild.channels.create(channelOptions);
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
        config: JSON.stringify({
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
        }),
      },
      create: {
        guildId: guild.id,
        config: JSON.stringify({
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
        }),
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
 * Setup automatic reactions
 */
async function setupAutomaticReactions(guild: any) {
  // Add automatic reactions to welcome and rules messages
  const welcomeChannel = guild.channels.cache.find((c: any) => c.name === '👋-boas-vindas');
  const rulesChannel = guild.channels.cache.find((c: any) => c.name === '📜-regras');
  
  if (welcomeChannel) {
    const messages = await welcomeChannel.messages.fetch({ limit: 10 });
    const latestMessages = messages.first(3);
    
    for (const message of latestMessages) {
      if (message.author.bot && message.embeds.length > 0) {
        await message.react('🦅');
        await message.react('🎮');
        await message.react('🏆');
        await message.react('❤️');
      }
    }
  }
  
  if (rulesChannel) {
    const messages = await rulesChannel.messages.fetch({ limit: 10 });
    const ruleMessages = messages.filter((m: any) => m.author.bot && m.embeds.length > 0);
    
    for (const message of ruleMessages.values()) {
      await message.react('✅'); // Accept rules
      await message.react('📋'); // Read rules
    }
  }
}

/**
 * Setup interactive elements
 */
async function setupInteractiveElements(guild: any) {
  const commandsChannel = guild.channels.cache.find((c: any) => c.name === '🤖-comandos');
  
  if (commandsChannel) {
    // Create interactive command guide
    const commandGuideEmbed = new EmbedBuilder()
      .setTitle('🤖 Guia Interativo de Comandos')
      .setDescription(`
        ### 🎮 **Comandos Principais do Hawk Esports**
        
        Clique nas reações abaixo para ver os comandos de cada categoria!
      `)
      .addFields(
        { name: '🎯 PUBG & Stats', value: '`/stats` `/ranking` `/register`\n`/scrim` `/squad` `/match`', inline: true },
        { name: '🎵 Música', value: '`/play` `/skip` `/queue`\n`/volume` `/pause` `/resume`', inline: true },
        { name: '🎲 Diversão', value: '`/quiz` `/game` `/challenge`\n`/badge` `/daily` `/profile`', inline: true },
        { name: '🛠️ Utilidades', value: '`/help` `/ping` `/server`\n`/user` `/avatar` `/invite`', inline: true },
        { name: '🏆 Competitivo', value: '`/tournament` `/team` `/scrim`\n`/analyze` `/coach` `/review`', inline: true },
        { name: '🎨 Personalização', value: '`/color` `/nickname` `/status`\n`/theme` `/banner` `/signature`', inline: true }
      )
      .setColor(0x7289DA)
      .setFooter({ text: 'Use /help [comando] para detalhes específicos!' })
      .setTimestamp();
    
    const commandMessage = await commandsChannel.send({ embeds: [commandGuideEmbed] });
    
    // Add reaction roles for command categories
    await commandMessage.react('🎯'); // PUBG commands
    await commandMessage.react('🎵'); // Music commands
    await commandMessage.react('🎲'); // Fun commands
    await commandMessage.react('🛠️'); // Utility commands
    await commandMessage.react('🏆'); // Competitive commands
    await commandMessage.react('🎨'); // Customization commands
  }
  
  // Setup role selection in appropriate channel
  const communityChannel = guild.channels.cache.find((c: any) => c.name === '💬-geral');
  
  if (communityChannel) {
    const roleSelectionEmbed = new EmbedBuilder()
      .setTitle('🎭 Seleção de Cargos')
      .setDescription(`
        ### 🔔 **Escolha suas notificações:**
        
        Reaja com os emojis abaixo para receber notificações sobre:
      `)
      .addFields(
        { name: '🏆 Torneios', value: 'Seja notificado sobre competições oficiais', inline: true },
        { name: '🎉 Eventos', value: 'Receba avisos sobre eventos especiais', inline: true },
        { name: '🎵 Música', value: 'Notificações sobre sessões musicais', inline: true },
        { name: '🎬 Streams', value: 'Avisos quando membros estão fazendo live', inline: true },
        { name: '📢 Anúncios', value: 'Atualizações importantes do servidor', inline: true },
        { name: '🎮 Partidas', value: 'Convites para jogos e scrimmages', inline: true }
      )
      .setColor(0x00AE86)
      .setFooter({ text: 'Você pode alterar suas escolhas a qualquer momento!' });
    
    const roleMessage = await communityChannel.send({ embeds: [roleSelectionEmbed] });
    
    // Add reactions for role selection
    await roleMessage.react('🏆');
    await roleMessage.react('🎉');
    await roleMessage.react('🎵');
    await roleMessage.react('🎬');
    await roleMessage.react('📢');
    await roleMessage.react('🎮');
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
      // Main Welcome Embed
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🦅 Bem-vindo ao Hawk Esports!')
        .setDescription(`
          ### 🎉 **Seja muito bem-vindo(a) à nossa comunidade!**
          
          Você acabou de entrar no **servidor Discord mais completo** para jogadores de PUBG! 
          Aqui temos tudo que você precisa para elevar seu jogo ao próximo nível.
        `)
        .setColor(0x00D4AA)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .setFooter({ text: '🦅 Hawk Esports - Dominando os Battlegrounds desde 2024', iconURL: guild.iconURL() })
        .setTimestamp();
      
      // Features Embed
      const featuresEmbed = new EmbedBuilder()
        .setTitle('🌟 O que você encontrará aqui:')
        .addFields(
          { name: '🎮 PUBG Competitivo', value: '• Rankings oficiais\n• Scrimmages diárias\n• Análises táticas\n• Treinos em equipe', inline: true },
          { name: '🏆 Torneios & Eventos', value: '• Competições semanais\n• Prêmios incríveis\n• Hall da Fama\n• Eventos especiais', inline: true },
          { name: '🎵 Entretenimento', value: '• Bot de música premium\n• Watch parties\n• Karaokê\n• Cinema comunitário', inline: true },
          { name: '🎯 Atividades', value: '• Mini-games únicos\n• Quizzes PUBG\n• Desafios diários\n• Sistema de badges', inline: true },
          { name: '🎬 Conteúdo', value: '• Compartilhe clips\n• Rankings de highlights\n• Suporte a streamers\n• Arte da comunidade', inline: true },
          { name: '🤝 Comunidade', value: '• Suporte 24/7\n• Parcerias\n• Feedback ativo\n• Ambiente acolhedor', inline: true }
        )
        .setColor(0xFF6B35)
        .setFooter({ text: 'Explore todos os canais e descubra ainda mais!' });
      
      // Quick Start Embed
      const quickStartEmbed = new EmbedBuilder()
        .setTitle('🚀 Primeiros Passos')
        .setDescription(`
          ### Para começar sua jornada:
          
          **1.** 📜 Leia as regras em <#${rulesChannel?.id}>
          **2.** 🤖 Teste comandos em <#${commandsChannel?.id}>
          **3.** 🎮 Escolha seus cargos de notificação
          **4.** 👥 Encontre uma squad em <#${guild.channels.cache.find((c: any) => c.name === '👥-procurar-squad')?.id}>
          **5.** 🎉 Participe dos eventos e se divirta!
          
          ### 🎁 **Bônus de Boas-vindas:**
          • **50 XP** para começar
          • Acesso a **canais VIP** por 7 dias
          • **Badge especial** de novo membro
        `)
        .setColor(0x00AE86)
        .setFooter({ text: 'Dúvidas? Use /help ou pergunte no suporte!' });
      
      await welcomeChannel.send({ embeds: [welcomeEmbed, featuresEmbed, quickStartEmbed] });
    }
    
    if (rulesChannel) {
      // Main Rules Embed
      const rulesEmbed = new EmbedBuilder()
        .setTitle('📜 Regras Oficiais do Servidor')
        .setDescription(`
          ### 🛡️ **Para manter nossa comunidade incrível, siga estas diretrizes:**
          
          *Ao permanecer no servidor, você automaticamente concorda com todas as regras abaixo.*
        `)
        .setColor(0xE74C3C)
        .setThumbnail(guild.iconURL())
        .setFooter({ text: 'Regras atualizadas em ' + new Date().toLocaleDateString('pt-BR') });
      
      // Respect Rules
      const respectEmbed = new EmbedBuilder()
        .setTitle('🤝 Respeito e Convivência')
        .addFields(
          { name: '✅ Permitido', value: '• Tratamento respeitoso\n• Discussões construtivas\n• Ajudar outros membros\n• Diversidade de opiniões', inline: true },
          { name: '❌ Proibido', value: '• Discriminação/Preconceito\n• Assédio ou bullying\n• Ataques pessoais\n• Comportamento tóxico', inline: true },
          { name: '⚖️ Consequência', value: '**Advertência → Mute → Ban**\n\nToxicidade não será tolerada!', inline: true }
        )
        .setColor(0x2ECC71);
      
      // Communication Rules
      const communicationEmbed = new EmbedBuilder()
        .setTitle('💬 Comunicação e Canais')
        .addFields(
          { name: '📍 Use o canal correto', value: '• PUBG → Canais PUBG\n• Música → Canais de música\n• Comandos → #🤖-comandos\n• Suporte → #🆘-suporte', inline: false },
          { name: '🚫 Evite', value: '• Spam ou flood\n• CAPS LOCK excessivo\n• Mensagens repetitivas\n• Off-topic em canais específicos', inline: true },
          { name: '💡 Dicas', value: '• Use threads para discussões longas\n• Reaja em vez de comentar\n• Seja claro e objetivo\n• Use spoilers quando necessário', inline: true }
        )
        .setColor(0x3498DB);
      
      // Gaming Rules
      const gamingEmbed = new EmbedBuilder()
        .setTitle('🎮 Jogos e Competições')
        .addFields(
          { name: '🏆 Fair Play', value: '• Jogue limpo sempre\n• Sem cheats ou exploits\n• Respeite adversários\n• Aceite derrotas com dignidade', inline: true },
          { name: '🎯 Competições', value: '• Siga regras específicas\n• Chegue no horário\n• Comunique problemas\n• Mantenha espírito esportivo', inline: true },
          { name: '⚠️ Punições', value: '**Trapaça = Ban imediato**\n\nTorneios têm regras próprias!', inline: true }
        )
        .setColor(0x9B59B6);
      
      // Content Rules
      const contentEmbed = new EmbedBuilder()
        .setTitle('🔒 Conteúdo e Mídia')
        .addFields(
          { name: '✅ Compartilhe', value: '• Clips épicos de PUBG\n• Arte da comunidade\n• Memes apropriados\n• Conteúdo educativo', inline: true },
          { name: '❌ Não compartilhe', value: '• Conteúdo NSFW\n• Material com direitos autorais\n• Links suspeitos\n• Conteúdo ofensivo', inline: true },
          { name: '📱 Redes Sociais', value: `Divulgação permitida em:\n<#${guild.channels.cache.find((c: any) => c.name === '📢-divulgação')?.id}>`, inline: true }
        )
        .setColor(0xF39C12);
      
      // Punishment System
      const punishmentEmbed = new EmbedBuilder()
        .setTitle('⚖️ Sistema de Punições')
        .setDescription(`
          ### 📊 **Níveis de Punição:**
          
          **🟡 Nível 1 - Advertência**
          • Primeira infração leve
          • Aviso público ou privado
          • Registro no sistema
          
          **🟠 Nível 2 - Mute Temporário**
          • Reincidência ou infração média
          • 1h a 24h sem poder falar
          • Revisão do comportamento
          
          **🔴 Nível 3 - Ban Temporário**
          • Infrações graves ou repetidas
          • 1 dia a 1 semana fora do servidor
          • Chance de recurso
          
          **⚫ Nível 4 - Ban Permanente**
          • Infrações muito graves
          • Comportamento inaceitável
          • Sem direito a recurso
          
          ### 🛡️ **A staff se reserva o direito de aplicar punições conforme a gravidade da situação.**
        `)
        .setColor(0xE74C3C)
        .setFooter({ text: 'Dúvidas sobre punições? Contate a administração.' });
      
      await rulesChannel.send({ embeds: [rulesEmbed, respectEmbed, communicationEmbed, gamingEmbed, contentEmbed, punishmentEmbed] });
    }
    
    return '💬 **Mensagens**: Enviadas com sucesso';
  } catch (error) {
    return '💬 **Mensagens**: Erro no envio';
  }
}

/**
 * Setup final touches and interactive features
 */
async function setupFinalTouches(guild: any): Promise<string> {
  const logger = new Logger();
  let features = 0;
  
  try {
    // Setup server boost tracking
    const boostChannel = guild.channels.cache.find((c: any) => c.name === '📢-anúncios');
    if (boostChannel) {
      const boostEmbed = new EmbedBuilder()
        .setTitle('💎 Sistema de Boost Ativo!')
        .setDescription('Obrigado por apoiar nosso servidor! Boosts nos ajudam a manter recursos premium.')
        .setColor(0xFF73FA)
        .addFields(
          { name: '🎁 Benefícios do Boost', value: '• Qualidade de áudio superior\n• Mais emojis personalizados\n• Banner do servidor\n• Vanity URL personalizada', inline: true },
          { name: '🏆 Recompensas', value: '• Cargo especial de Booster\n• Acesso a canais VIP\n• Prioridade em eventos\n• Badge exclusivo', inline: true }
        )
        .setFooter({ text: 'Cada boost faz a diferença! 💜' });
      
      await boostChannel.send({ embeds: [boostEmbed] });
      features++;
    }
    
    // Setup activity tracking
    const activityChannel = guild.channels.cache.find((c: any) => c.name === '📊-rankings-geral');
    if (activityChannel) {
      const activityEmbed = new EmbedBuilder()
        .setTitle('📊 Sistema de Atividade')
        .setDescription('Ganhe XP participando da comunidade e suba nos rankings!')
        .setColor(0x00D4AA)
        .addFields(
          { name: '💬 Como ganhar XP', value: '• Enviar mensagens (+1-3 XP)\n• Participar de voice (+5 XP/min)\n• Reagir a mensagens (+1 XP)\n• Completar desafios (+10-50 XP)', inline: true },
          { name: '🏆 Recompensas', value: '• Cargos de nível\n• Acesso a recursos especiais\n• Badges exclusivos\n• Prêmios mensais', inline: true }
        )
        .setFooter({ text: 'Use /rank para ver seu progresso!' });
      
      await activityChannel.send({ embeds: [activityEmbed] });
      features++;
    }
    
    return `⚡ **Recursos**: ${features} sistemas ativados`;
  } catch (error) {
    logger.error('Error setting up final touches:', error);
    return '⚡ **Recursos**: Erro na ativação';
  }
}

export default bootstrap;