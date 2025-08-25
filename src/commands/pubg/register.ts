import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import { Command, CommandCategory } from '@/types/command';
import { ExtendedClient } from '@/types/client';
import { PUBGPlatform } from '@/types/pubg';
import { Logger } from '@/utils/logger';

/**
 * Register command - Secure PUBG onboarding with nick and platform validation
 */
const register: Command = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('🎮 Registra seu nick PUBG e plataforma para acessar o servidor')
    .addStringOption(option =>
      option.setName('nick')
        .setDescription('Seu nick exato no PUBG')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(16)
    )
    .addStringOption(option =>
      option.setName('platform')
        .setDescription('Plataforma onde você joga PUBG')
        .setRequired(true)
        .addChoices(
          { name: '🖥️ Steam (PC)', value: 'steam' },
          { name: '🎮 Xbox', value: 'xbox' },
          { name: '🎯 PlayStation', value: 'psn' },
          { name: '📱 Mobile', value: 'mobile' },
          { name: '🎮 Stadia', value: 'stadia' }
        )
    )
    .setDMPermission(false),
  
  category: CommandCategory.PUBG,
  cooldown: 30,
  
  async execute(interaction, client: ExtendedClient) {
    const logger = new Logger();
    const nick = interaction.options.getString('nick', true);
    const platform = interaction.options.getString('platform', true) as PUBGPlatform;
    
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const guild = interaction.guild!;
      const member = interaction.member!;
      
      // Verificar se o usuário já está registrado
      const existingUser = await client.database.client.user.findUnique({
        where: { id: interaction.user.id },
        include: { pubgStats: true }
      });
      
      if (existingUser && existingUser.pubgUsername && existingUser.isVerified) {
        const alreadyRegisteredEmbed = new EmbedBuilder()
          .setTitle('⚠️ Já registrado')
          .setDescription('Você já está registrado no sistema!')
          .setColor('#FFA500')
          .addFields(
            { name: '🎮 Nick PUBG', value: existingUser.pubgUsername, inline: true },
            { name: '🖥️ Plataforma', value: getPlatformName(existingUser.pubgPlatform as PUBGPlatform), inline: true },
            { name: '📅 Registrado em', value: `<t:${Math.floor(existingUser.createdAt.getTime() / 1000)}:F>`, inline: false }
          )
          .setFooter({ text: 'Use /profile para ver suas estatísticas' });
        
        const updateRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('update_registration')
              .setLabel('Atualizar Registro')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🔄')
          );
        
        const response = await interaction.editReply({
          embeds: [alreadyRegisteredEmbed],
          components: [updateRow]
        });
        
        // Handle update button
        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000
        });
        
        collector.on('collect', async (i) => {
          if (i.user.id !== interaction.user.id) {
            await i.reply({ content: '❌ Apenas quem executou o comando pode usar este botão.', ephemeral: true });
            return;
          }
          
          if (i.customId === 'update_registration') {
            await i.update({ components: [] });
            await performRegistration(true);
          }
        });
        
        collector.on('end', () => {
          interaction.editReply({ components: [] }).catch(() => {});
        });
        
        return;
      }
      
      await performRegistration(false);
      
      async function performRegistration(isUpdate: boolean) {
        // Validar nick PUBG
        const nickValidation = validatePUBGNick(nick);
        if (!nickValidation.valid) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Nick inválido')
            .setDescription(nickValidation.reason!)
            .setColor('#FF0000')
            .addFields(
              { name: '📝 Formato correto', value: '• 3-16 caracteres\n• Apenas letras, números e underscore\n• Não pode começar ou terminar com underscore', inline: false }
            );
          
          await interaction.editReply({ embeds: [errorEmbed], components: [] });
          return;
        }
        
        // Verificar se o nick já está em uso
        const existingNick = await client.database.client.user.findFirst({
          where: {
            pubgUsername: nick,
            pubgPlatform: platform,
            guildId: guild.id,
            id: { not: interaction.user.id }
          }
        });
        
        if (existingNick) {
          const duplicateEmbed = new EmbedBuilder()
            .setTitle('❌ Nick já registrado')
            .setDescription(`O nick **${nick}** na plataforma **${getPlatformName(platform)}** já está registrado por outro usuário.`)
            .setColor('#FF0000')
            .addFields(
              { name: '💡 Dica', value: 'Verifique se digitou seu nick corretamente ou se está usando a plataforma correta.', inline: false }
            );
          
          await interaction.editReply({ embeds: [duplicateEmbed], components: [] });
          return;
        }
        
        // Buscar dados do jogador na API do PUBG
        const loadingEmbed = new EmbedBuilder()
          .setTitle('🔍 Verificando dados...')
          .setDescription('Buscando suas estatísticas no PUBG. Isso pode levar alguns segundos.')
          .setColor('#0099FF')
          .setFooter({ text: 'Por favor, aguarde...' });
        
        await interaction.editReply({ embeds: [loadingEmbed], components: [] });
        
        try {
          // Tentar buscar o jogador na API do PUBG
          const playerData = await client.pubgService.getPlayerByName(nick, platform);
          
          if (!playerData) {
            const notFoundEmbed = new EmbedBuilder()
              .setTitle('❌ Jogador não encontrado')
              .setDescription(`Não foi possível encontrar o jogador **${nick}** na plataforma **${getPlatformName(platform)}**.`)
              .setColor('#FF0000')
              .addFields(
                { name: '🔍 Verifique', value: '• Se o nick está correto\n• Se a plataforma está correta\n• Se o perfil não é privado\n• Se você jogou recentemente', inline: false },
                { name: '⚠️ Importante', value: 'Seu perfil PUBG deve ser público e você deve ter jogado pelo menos uma partida recentemente.', inline: false }
              )
              .setFooter({ text: 'Tente novamente após verificar os dados' });
            
            const retryRow = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('retry_registration')
                  .setLabel('Tentar Novamente')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('🔄'),
                new ButtonBuilder()
                  .setCustomId('manual_verification')
                  .setLabel('Verificação Manual')
                  .setStyle(ButtonStyle.Secondary)
                  .setEmoji('👤')
              );
            
            const response = await interaction.editReply({
              embeds: [notFoundEmbed],
              components: [retryRow]
            });
            
            const collector = response.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 300000 // 5 minutes
            });
            
            collector.on('collect', async (i) => {
              if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ Apenas quem executou o comando pode usar este botão.', ephemeral: true });
                return;
              }
              
              if (i.customId === 'retry_registration') {
                await i.update({ components: [] });
                await performRegistration(isUpdate);
              } else if (i.customId === 'manual_verification') {
                await i.update({ components: [] });
                await requestManualVerification();
              }
            });
            
            return;
          }
          
          // Salvar dados do usuário
          const userData = await client.database.client.user.upsert({
            where: { id: interaction.user.id },
            update: {
              pubgUsername: nick,
              pubgPlatform: platform,
              isVerified: true,
              updatedAt: new Date()
            },
            create: {
              id: interaction.user.id,
              guildId: guild.id,
              username: interaction.user.username,
              discriminator: interaction.user.discriminator,
              pubgUsername: nick,
              pubgPlatform: platform,
              isVerified: true
            }
          });
          
          // Salvar estatísticas PUBG
          if (playerData.stats) {
            await client.database.client.pUBGStats.upsert({
              where: {
                userId_guildId: {
                  userId: interaction.user.id,
                  guildId: guild.id
                }
              },
              update: {
                currentSeason: playerData.stats.currentSeason,
                currentTier: playerData.stats.currentTier,
                currentRankPoints: playerData.stats.currentRankPoints,
                kills: playerData.stats.kills,
                deaths: playerData.stats.deaths,
                assists: playerData.stats.assists,
                wins: playerData.stats.wins,
                top10s: playerData.stats.top10s,
                matches: playerData.stats.matches,
                avgDamage: playerData.stats.avgDamage,
                longestKill: playerData.stats.longestKill,
                headshots: playerData.stats.headshots,
                updatedAt: new Date()
              },
              create: {
                userId: interaction.user.id,
                guildId: guild.id,
                pubgId: playerData.id,
                currentSeason: playerData.stats.currentSeason,
                currentTier: playerData.stats.currentTier,
                currentRankPoints: playerData.stats.currentRankPoints,
                kills: playerData.stats.kills,
                deaths: playerData.stats.deaths,
                assists: playerData.stats.assists,
                wins: playerData.stats.wins,
                top10s: playerData.stats.top10s,
                matches: playerData.stats.matches,
                avgDamage: playerData.stats.avgDamage,
                longestKill: playerData.stats.longestKill,
                headshots: playerData.stats.headshots
              }
            });
          }
          
          // Adicionar cargo de verificado
          const verifiedRole = guild.roles.cache.find((role: any) => role.name === '✅ Verificado');
          if (verifiedRole && 'roles' in member) {
            await (member as any).roles.add(verifiedRole);
          }
          
          // Remover cargo de novo membro
          const newMemberRole = guild.roles.cache.find((role: any) => role.name === '👋 Novo Membro');
          if (newMemberRole && 'roles' in member) {
            await (member as any).roles.remove(newMemberRole).catch(() => {});
          }
          
          // Adicionar cargo baseado no rank PUBG
          if (playerData.stats?.currentTier) {
            await assignRankRole(member, playerData.stats.currentTier, guild);
          }
          
          // Criar embed de sucesso
          const successEmbed = new EmbedBuilder()
            .setTitle('✅ Registro concluído com sucesso!')
            .setDescription(`Bem-vindo ao **${guild.name}**, ${interaction.user}! Seu registro foi verificado e você agora tem acesso completo ao servidor.`)
            .setColor('#00FF00')
            .addFields(
              { name: '🎮 Nick PUBG', value: nick, inline: true },
              { name: '🖥️ Plataforma', value: getPlatformName(platform), inline: true },
              { name: '🏆 Rank Atual', value: playerData.stats?.currentTier || 'Não classificado', inline: true }
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({ text: 'Use /profile para ver suas estatísticas completas' })
            .setTimestamp();
          
          if (playerData.stats) {
            successEmbed.addFields(
              { name: '📊 Estatísticas', value: `**Kills:** ${playerData.stats.kills}\n**K/D:** ${(playerData.stats.kills / Math.max(playerData.stats.deaths, 1)).toFixed(2)}\n**Vitórias:** ${playerData.stats.wins}\n**Top 10:** ${playerData.stats.top10s}`, inline: true },
              { name: '🎯 Performance', value: `**Dano Médio:** ${playerData.stats.avgDamage}\n**Kill Mais Longo:** ${playerData.stats.longestKill}m\n**Headshots:** ${playerData.stats.headshots}`, inline: true }
            );
          }
          
          await interaction.editReply({ embeds: [successEmbed], components: [] });
          
          // Enviar notificação no canal de boas-vindas
          const welcomeChannel = guild.channels.cache.find((c: any) => c.name === '👋-boas-vindas');
          if (welcomeChannel && 'send' in welcomeChannel) {
            const welcomeEmbed = new EmbedBuilder()
              .setTitle('🎉 Novo membro verificado!')
              .setDescription(`${interaction.user} se juntou ao servidor como **${nick}** (${getPlatformName(platform)})`)
              .setColor('#00FF00')
              .setThumbnail(interaction.user.displayAvatarURL())
              .setTimestamp();
            
            await (welcomeChannel as any).send({ embeds: [welcomeEmbed] });
          }
          
          // Log da ação
          logger.info(`User ${interaction.user.tag} registered as ${nick} on ${platform} in guild ${guild.name}`);
          
          // Atualizar progresso de badges
          await client.badgeService.updateUserProgress(interaction.user.id, guild.id, 'registration', 1);
          
        } catch (error) {
          logger.error('PUBG API error during registration:', error);
          
          const apiErrorEmbed = new EmbedBuilder()
            .setTitle('⚠️ Erro na verificação')
            .setDescription('Ocorreu um erro ao verificar seus dados no PUBG. Você pode tentar novamente ou solicitar verificação manual.')
            .setColor('#FFA500')
            .addFields(
              { name: '🔧 O que fazer?', value: '• Tente novamente em alguns minutos\n• Verifique se seus dados estão corretos\n• Solicite verificação manual se o problema persistir', inline: false }
            );
          
          const errorRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('retry_registration')
                .setLabel('Tentar Novamente')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄'),
              new ButtonBuilder()
                .setCustomId('manual_verification')
                .setLabel('Verificação Manual')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👤')
            );
          
          await interaction.editReply({
            embeds: [apiErrorEmbed],
            components: [errorRow]
          });
        }
      }
      
      async function requestManualVerification() {
        // Criar ticket para verificação manual
        const ticketEmbed = new EmbedBuilder()
          .setTitle('🎫 Verificação Manual Solicitada')
          .setDescription('Sua solicitação de verificação manual foi enviada para os administradores.')
          .setColor('#0099FF')
          .addFields(
            { name: '📝 Dados informados', value: `**Nick:** ${nick}\n**Plataforma:** ${getPlatformName(platform)}`, inline: false },
            { name: '⏰ Próximos passos', value: 'Um administrador irá verificar seus dados manualmente e liberar seu acesso em breve.', inline: false }
          )
          .setFooter({ text: 'Aguarde a verificação manual' });
        
        await interaction.editReply({ embeds: [ticketEmbed], components: [] });
        
        // Notificar administradores
        const adminChannel = guild.channels.cache.find((c: any) => c.name === '🔧-admin');
        if (adminChannel && 'send' in adminChannel) {
          const adminNotificationEmbed = new EmbedBuilder()
            .setTitle('🎫 Nova solicitação de verificação manual')
            .setDescription(`${interaction.user} solicitou verificação manual.`)
            .setColor('#FFA500')
            .addFields(
              { name: '👤 Usuário', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
              { name: '🎮 Nick PUBG', value: nick, inline: true },
              { name: '🖥️ Plataforma', value: getPlatformName(platform), inline: true }
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();
          
          const adminRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`approve_manual_${interaction.user.id}`)
                .setLabel('Aprovar')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
              new ButtonBuilder()
                .setCustomId(`reject_manual_${interaction.user.id}`)
                .setLabel('Rejeitar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
            );
          
          await (adminChannel as any).send({
            embeds: [adminNotificationEmbed],
            components: [adminRow]
          });
        }
        
        // Salvar dados temporários para verificação manual
        await client.database.client.user.upsert({
          where: { id: interaction.user.id },
          update: {
            pubgUsername: nick,
            pubgPlatform: platform,
            isVerified: false,
            updatedAt: new Date()
          },
          create: {
            id: interaction.user.id,
            guildId: guild.id,
            username: interaction.user.username,
            discriminator: interaction.user.discriminator,
            pubgUsername: nick,
            pubgPlatform: platform,
            isVerified: false
          }
        });
      }
      
    } catch (error) {
      logger.error('Register command error:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Erro no registro')
        .setDescription('Ocorreu um erro interno durante o registro. Tente novamente em alguns minutos.')
        .setColor('#FF0000')
        .setFooter({ text: 'Se o problema persistir, contate um administrador' });
      
      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
  }
};

/**
 * Validate PUBG nickname format
 */
function validatePUBGNick(nick: string): { valid: boolean; reason?: string } {
  if (nick.length < 3 || nick.length > 16) {
    return { valid: false, reason: 'O nick deve ter entre 3 e 16 caracteres.' };
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(nick)) {
    return { valid: false, reason: 'O nick pode conter apenas letras, números e underscore (_).' };
  }
  
  if (nick.startsWith('_') || nick.endsWith('_')) {
    return { valid: false, reason: 'O nick não pode começar ou terminar com underscore (_).' };
  }
  
  if (nick.includes('__')) {
    return { valid: false, reason: 'O nick não pode conter underscores consecutivos (__).' };
  }
  
  return { valid: true };
}

/**
 * Get platform display name
 */
function getPlatformName(platform: PUBGPlatform): string {
  const platformNames = {
    steam: '🖥️ Steam (PC)',
    xbox: '🎮 Xbox',
    psn: '🎯 PlayStation',
    mobile: '📱 Mobile',
    stadia: '🎮 Stadia'
  };
  
  return platformNames[platform] || platform;
}

/**
 * Assign rank role based on PUBG tier
 */
async function assignRankRole(member: any, tier: string, guild: any): Promise<void> {
  const rankRoles = {
    'Conqueror': '🏆 Conqueror',
    'Ace': '💎 Ace',
    'Crown': '👑 Crown',
    'Diamond': '💍 Diamond',
    'Platinum': '🥉 Platinum',
    'Gold': '🥈 Gold',
    'Silver': '🥇 Silver',
    'Bronze': '🔰 Bronze'
  };
  
  const roleName = rankRoles[tier as keyof typeof rankRoles];
  if (roleName) {
    const role = guild.roles.cache.find((r: any) => r.name === roleName);
    if (role && 'roles' in member) {
      await (member as any).roles.add(role).catch(() => {});
    }
  }
}

export default register;