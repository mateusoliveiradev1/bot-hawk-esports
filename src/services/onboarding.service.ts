import {
  Client,
  GuildMember,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  ButtonInteraction,
} from 'discord.js';
import { ExtendedClient } from '../types/client';
import { Logger } from '../utils/logger';
import { RoleManagerService } from './role-manager.service';

export interface OnboardingConfig {
  onboardingEnabled: boolean;
  welcomeChannelId?: string;
  welcomeMessage?: string;
  welcomeDMEnabled: boolean;
  autoRoleEnabled: boolean;
}

export interface WelcomeStats {
  totalMembers: number;
  verifiedMembers: number;
  newMembers: number;
  verificationRate: number;
}

/**
 * Service responsible for handling member onboarding and welcome messages
 */
export class OnboardingService {
  private client: ExtendedClient;
  private logger: Logger;
  private roleManager: RoleManagerService;

  constructor(client: ExtendedClient) {
    this.client = client;
    this.logger = new Logger();
    this.roleManager = new RoleManagerService();
    this.setupButtonHandlers();
  }

  /**
   * Handle new member joining the guild
   */
  async handleMemberJoin(member: GuildMember): Promise<void> {
    try {
      const config = await this.getGuildConfig(member.guild.id);

      if (!config.onboardingEnabled) {
        this.logger.info(`Onboarding disabled for guild ${member.guild.name}`);
        return;
      }

      // Create or update user record
      await this.createUserRecord(member);

      // Add new member role if auto role is enabled
      if (config.autoRoleEnabled) {
        await this.addNewMemberRole(member);
      }

      // Send welcome message to channel
      if (config.welcomeChannelId) {
        await this.sendWelcomeMessage(member, config);
      }

      // Send welcome DM if enabled
      if (config.welcomeDMEnabled) {
        await this.sendWelcomeDM(member, config);
      }

      this.logger.info(`Successfully onboarded member ${member.user.tag} in ${member.guild.name}`);
    } catch (error) {
      this.logger.error(`Failed to handle member join for ${member.user.tag}:`, error);
    }
  }

  /**
   * Handle member verification (when they get verified role)
   */
  async handleMemberVerification(member: GuildMember): Promise<void> {
    try {
      // Use role manager to promote member
      const success = await this.roleManager.promoteToVerified(member);

      if (success) {
        // Update database
        if (this.client.db) {
          await this.client.db.client.user.update({
            where: { id: member.id },
            data: {
              isVerified: true,
              verifiedAt: new Date(),
              verificationMethod: 'auto',
            },
          });
        }

        this.logger.info(`Member ${member.user.tag} verified and promoted in ${member.guild.name}`);
      } else {
        this.logger.warn(`Failed to promote ${member.user.tag} to verified`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle member verification for ${member.user.tag}:`, error);
    }
  }

  /**
   * Create or update user record in database
   */
  private async createUserRecord(member: GuildMember): Promise<void> {
    if (!this.client.db) {
      return;
    }

    try {
      // Create or update user
      await this.client.db.client.user.upsert({
        where: { id: member.id },
        update: {
          username: member.user.username,
          discriminator: member.user.discriminator,
          avatar: member.user.avatar,
        },
        create: {
          id: member.id,
          username: member.user.username,
          discriminator: member.user.discriminator,
          avatar: member.user.avatar,
        },
      });

      // Create user-guild relationship
      await this.client.db.client.userGuild.upsert({
        where: {
          userId_guildId: {
            userId: member.id,
            guildId: member.guild.id,
          },
        },
        update: {
          leftAt: null,
          isActive: true,
        },
        create: {
          userId: member.id,
          guildId: member.guild.id,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create user record for ${member.user.tag}:`, error);
    }
  }

  /**
   * Add new member role and ensure basic permissions
   */
  private async addNewMemberRole(member: GuildMember): Promise<void> {
    try {
      // Initialize guild roles if needed
      await this.roleManager.initializeGuildRoles(member.guild);

      // Add new member role using role manager
      const success = await this.roleManager.addNewMemberRole(member);

      if (success) {
        // Setup channel permissions for the guild
        await this.roleManager.setupChannelPermissions(member.guild);
        this.logger.info(`Successfully setup roles and permissions for ${member.user.tag}`);
      } else {
        this.logger.warn(`Failed to add new member role to ${member.user.tag}`);
      }
    } catch (error) {
      this.logger.error(`Failed to add new member role to ${member.user.tag}:`, error);
    }
  }

  /**
   * Send welcome message to welcome channel
   */
  private async sendWelcomeMessage(member: GuildMember, config: OnboardingConfig): Promise<void> {
    try {
      const welcomeChannel = member.guild.channels.cache.get(
        config.welcomeChannelId!
      ) as TextChannel;

      if (!welcomeChannel) {
        this.logger.warn(`Welcome channel not found in guild ${member.guild.name}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🎉 Novo Membro!')
        .setDescription(
          `🎉 Bem-vindo(a) ao **${member.guild.name}**, ${member}!\n\n` +
            '🔐 **Para acessar o servidor, você precisa se registrar:**\n\n' +
            '**1️⃣ Registro Básico** (Obrigatório)\n' +
            '• Digite `/register-server` aqui no chat\n' +
            '• Libera acesso aos canais do servidor\n\n' +
            '**2️⃣ Registro PUBG** (Opcional)\n' +
            '• Digite `/register` para conectar seu PUBG\n' +
            '• Acesso a rankings e estatísticas\n\n' +
            '📨 **Verifique seu DM** - Enviamos um guia detalhado!'
        )
        .setColor(0x00ff00)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Membro #${member.guild.memberCount} • Hawk Esports` });

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('start_server_registration')
          .setLabel('🚀 Registrar no Servidor')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🚀'),
        new ButtonBuilder()
          .setCustomId('view_rules')
          .setLabel('📖 Ver Regras')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📖'),
        new ButtonBuilder()
          .setCustomId('start_registration')
          .setLabel('🎮 Registrar PUBG')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('view_commands')
          .setLabel('🤖 Ver Comandos')
          .setStyle(ButtonStyle.Secondary)
      );

      await welcomeChannel.send({
        embeds: [embed],
        components: [actionRow],
      });
    } catch (error) {
      this.logger.error(`Failed to send welcome message for ${member.user.tag}:`, error);
    }
  }

  /**
   * Send welcome DM to new member
   */
  private async sendWelcomeDM(member: GuildMember, config: OnboardingConfig): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🎉 Bem-vindo(a) ao Hawk Esports!')
        .setDescription(
          `Olá ${member.displayName}! 👋\n\n` +
            '🔐 **Para acessar o servidor completamente, você precisa fazer 2 registros:**\n\n' +
            '**1️⃣ Registro no Servidor** (Obrigatório)\n' +
            '• Use o comando `/register-server` no servidor\n' +
            '• Isso libera o acesso aos canais básicos\n' +
            '• É rápido e simples!\n\n' +
            '**2️⃣ Registro PUBG** (Opcional, mas recomendado)\n' +
            '• Use o comando `/register` no servidor\n' +
            '• Conecta sua conta PUBG para recursos avançados\n' +
            '• Acesso a rankings, estatísticas e badges\n\n' +
            '🎯 **Dica:** Comece com `/register-server` para ter acesso imediato!'
        )
        .setColor(0x00ff00)
        .setThumbnail(member.guild.iconURL())
        .addFields(
          {
            name: '📋 Próximos Passos',
            value:
              '1. Vá para o servidor\n' +
              '2. Digite `/register-server` em qualquer canal\n' +
              '3. (Opcional) Digite `/register` para conectar seu PUBG\n' +
              '4. Leia as regras e se apresente!',
            inline: false,
          },
          {
            name: '❓ Precisa de Ajuda?',
            value: 'Mencione um moderador no servidor ou abra um ticket!',
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({
          text: 'Hawk Esports • Sistema de Registro Automático',
          iconURL: member.guild.iconURL() || undefined,
        });

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('registration_help')
          .setLabel('❓ Ajuda com Registro')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('❓'),
        new ButtonBuilder()
          .setCustomId('view_rules')
          .setLabel('📖 Ver Regras')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📖')
      );

      await member.send({
        embeds: [embed],
        components: [actionRow],
      });

      this.logger.info(`Sent detailed registration guide DM to ${member.user.tag}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome DM to ${member.user.tag}:`, error);
      // If DM fails, try to send a message in the welcome channel mentioning the user
      await this.sendFallbackWelcomeMessage(member, config);
    }
  }

  /**
   * Setup button interaction handlers
   */
  private setupButtonHandlers(): void {
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isButton()) {
        return;
      }

      const buttonInteraction = interaction as ButtonInteraction;

      try {
        switch (buttonInteraction.customId) {
          case 'view_rules':
            await this.handleViewRules(buttonInteraction);
            break;
          case 'start_registration':
            await this.handleStartRegistration(buttonInteraction);
            break;
          case 'view_commands':
            await this.handleViewCommands(buttonInteraction);
            break;
        }
      } catch (error) {
        this.logger.error('Failed to handle button interaction:', error);
      }
    });
  }

  /**
   * Handle view rules button
   */
  private async handleViewRules(interaction: ButtonInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('📖 Regras do Servidor')
      .setDescription(
        '**1.** Seja respeitoso com todos os membros\n' +
          '**2.** Não faça spam ou flood nos canais\n' +
          '**3.** Use os canais apropriados para cada tipo de conteúdo\n' +
          '**4.** Não compartilhe conteúdo ofensivo ou inadequado\n' +
          '**5.** Siga as diretrizes da comunidade do Discord\n' +
          '**6.** Registre-se com seu nick real do PUBG\n' +
          '**7.** Não faça trapaça ou use cheats\n' +
          '**8.** Divirta-se e seja parte da comunidade! 🎮'
      )
      .setColor(0xff9900)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  /**
   * Handle start registration button
   */
  private async handleStartRegistration(interaction: ButtonInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🎮 Registro PUBG')
      .setDescription(
        'Para se registrar no servidor, use o comando:\n\n' +
          '`/register nick:SEU_NICK plataforma:PLATAFORMA`\n\n' +
          '**Plataformas disponíveis:**\n' +
          '• `steam` - PC (Steam)\n' +
          '• `xbox` - Xbox\n' +
          '• `psn` - PlayStation\n' +
          '• `stadia` - Stadia\n\n' +
          '**Exemplo:**\n' +
          '`/register nick:PlayerName123 plataforma:steam`\n\n' +
          '⚠️ **Importante:** Use seu nick exato do PUBG para verificação automática!'
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  /**
   * Handle view commands button
   */
  private async handleViewCommands(interaction: ButtonInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🤖 Comandos Disponíveis')
      .setDescription(
        '**📋 Registro e Perfil:**\n' +
          '• `/register` - Registrar nick PUBG\n' +
          '• `/profile` - Ver seu perfil\n' +
          '• `/stats` - Ver suas estatísticas\n\n' +
          '**🏆 Rankings:**\n' +
          '• `/ranking` - Ver rankings do servidor\n' +
          '• `/leaderboard` - Top players\n\n' +
          '**🎮 Diversão:**\n' +
          '• `/quiz` - Quiz PUBG\n' +
          '• `/challenge` - Desafios diários\n' +
          '• `/clip` - Upload de clips\n\n' +
          '**🎵 Música:**\n' +
          '• `/play` - Tocar música\n' +
          '• `/queue` - Ver fila de música\n\n' +
          'Use `/help` para mais informações sobre cada comando!'
      )
      .setColor(0x0099ff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  /**
   * Send fallback welcome message if DM fails
   */
  private async sendFallbackWelcomeMessage(
    member: GuildMember,
    config: OnboardingConfig
  ): Promise<void> {
    try {
      const welcomeChannel = member.guild.channels.cache.get(
        config.welcomeChannelId!
      ) as TextChannel;

      if (!welcomeChannel) {
        this.logger.warn(
          `Welcome channel not found for fallback message in guild ${member.guild.name}`
        );
        return;
      }

      const fallbackEmbed = new EmbedBuilder()
        .setTitle('📨 DM Bloqueado - Instruções de Registro')
        .setDescription(
          `${member}, não conseguimos enviar um DM para você!\n\n` +
            '🔐 **Para acessar o servidor, siga estes passos:**\n\n' +
            '**1️⃣ Registro Básico** (Obrigatório)\n' +
            '• Digite `/register-server` aqui no chat\n' +
            '• Libera acesso aos canais do servidor\n\n' +
            '**2️⃣ Registro PUBG** (Opcional)\n' +
            '• Digite `/register` para conectar seu PUBG\n' +
            '• Acesso a rankings e estatísticas\n\n' +
            '💡 **Dica:** Habilite DMs de membros do servidor para receber notificações!'
        )
        .setColor(0xffa500)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Esta mensagem será deletada em 5 minutos' });

      const message = await welcomeChannel.send({ embeds: [fallbackEmbed] });

      // Delete the fallback message after 5 minutes
      setTimeout(
        async () => {
          try {
            await message.delete();
          } catch (error) {
            this.logger.warn('Failed to delete fallback welcome message:', error);
          }
        },
        5 * 60 * 1000
      );

      this.logger.info(`Sent fallback welcome message for ${member.user.tag}`);
    } catch (error) {
      this.logger.error(`Failed to send fallback welcome message for ${member.user.tag}:`, error);
    }
  }

  /**
   * Handle button interactions for registration
   */
  async handleRegistrationButton(interaction: ButtonInteraction): Promise<void> {
    try {
      if (interaction.customId === 'start_server_registration') {
        const embed = new EmbedBuilder()
          .setTitle('🚀 Como Registrar no Servidor')
          .setDescription(
            '**Para se registrar no servidor:**\n\n' +
              '1️⃣ Digite o comando: `/register-server`\n' +
              '2️⃣ Pressione Enter para executar\n' +
              '3️⃣ Pronto! Você terá acesso aos canais\n\n' +
              '💡 **Dica:** Você pode digitar o comando aqui mesmo neste canal!'
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (interaction.customId === 'registration_help') {
        const embed = new EmbedBuilder()
          .setTitle('❓ Ajuda com Registro')
          .setDescription(
            '**Precisa de ajuda? Aqui estão suas opções:**\n\n' +
              '🔹 **Registro Básico:** `/register-server`\n' +
              '   • Obrigatório para acessar o servidor\n' +
              '   • Rápido e simples\n\n' +
              '🔹 **Registro PUBG:** `/register`\n' +
              '   • Opcional, mas recomendado\n' +
              '   • Conecta sua conta PUBG\n\n' +
              '🆘 **Ainda com problemas?**\n' +
              '   • Mencione um moderador\n' +
              '   • Abra um ticket de suporte'
          )
          .setColor(0x0099ff)
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (interaction.customId === 'view_rules') {
        // Find rules channel
        const rulesChannel = interaction.guild?.channels.cache.find(
          ch => ch.name.includes('regras') || ch.name.includes('rules')
        );

        const embed = new EmbedBuilder()
          .setTitle('📖 Regras do Servidor')
          .setDescription(
            rulesChannel
              ? `📋 Confira as regras em ${rulesChannel}\n\n` +
                  '⚠️ **Importante:** Leia todas as regras antes de participar!'
              : '📋 Procure pelo canal de regras no servidor\n\n' +
                  '⚠️ **Importante:** Leia todas as regras antes de participar!'
          )
          .setColor(0xff9900)
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (error) {
      this.logger.error('Failed to handle registration button interaction:', error);

      await interaction
        .reply({
          content: '❌ Ocorreu um erro ao processar sua solicitação. Tente novamente.',
          ephemeral: true,
        })
        .catch(() => {});
    }
  }

  /**
   * Get welcome statistics for a guild
   */
  async getWelcomeStats(guildId: string): Promise<WelcomeStats> {
    if (!this.client.db) {
      return {
        totalMembers: 0,
        verifiedMembers: 0,
        newMembers: 0,
        verificationRate: 0,
      };
    }

    try {
      const guild = this.client.guilds.cache.get(guildId);
      const totalMembers = guild?.memberCount || 0;

      const verifiedMembers = await this.client.db.client.user.count({
        where: {
          isVerified: true,
          guilds: {
            some: {
              guildId: guildId,
              isActive: true,
            },
          },
        },
      });

      const newMembers = totalMembers - verifiedMembers;
      const verificationRate = totalMembers > 0 ? (verifiedMembers / totalMembers) * 100 : 0;

      return {
        totalMembers,
        verifiedMembers,
        newMembers,
        verificationRate,
      };
    } catch (error) {
      this.logger.error(`Failed to get welcome stats for guild ${guildId}:`, error);
      return {
        totalMembers: 0,
        verifiedMembers: 0,
        newMembers: 0,
        verificationRate: 0,
      };
    }
  }

  /**
   * Get guild onboarding configuration
   */
  async getGuildConfig(guildId: string): Promise<OnboardingConfig> {
    if (!this.client.db) {
      throw new Error('Database service not available');
    }

    const guild = await this.client.db.client.guild.findUnique({
      where: { id: guildId },
    });

    if (!guild) {
      // Return default configuration
      return {
        onboardingEnabled: true,
        welcomeDMEnabled: true,
        autoRoleEnabled: true,
      };
    }

    return {
      onboardingEnabled: guild.onboardingEnabled,
      welcomeChannelId: guild.welcomeChannelId || undefined,
      welcomeMessage: guild.welcomeMessage || undefined,
      welcomeDMEnabled: guild.welcomeDMEnabled,
      autoRoleEnabled: guild.autoRoleEnabled,
    };
  }

  /**
   * Update guild onboarding configuration
   */
  async updateGuildConfig(
    guildId: string,
    config: Partial<OnboardingConfig>
  ): Promise<OnboardingConfig> {
    if (!this.client.db) {
      throw new Error('Database service not available');
    }

    const guild = await this.client.db.client.guild.findUnique({
      where: { id: guildId },
    });

    if (!guild) {
      throw new Error('Guild not found');
    }

    const updatedGuild = await this.client.db.client.guild.update({
      where: { id: guildId },
      data: {
        onboardingEnabled: config.onboardingEnabled ?? guild.onboardingEnabled,
        welcomeChannelId: config.welcomeChannelId ?? guild.welcomeChannelId,
        welcomeMessage: config.welcomeMessage ?? guild.welcomeMessage,
        welcomeDMEnabled: config.welcomeDMEnabled ?? guild.welcomeDMEnabled,
        autoRoleEnabled: config.autoRoleEnabled ?? guild.autoRoleEnabled,
      },
    });

    return {
      onboardingEnabled: updatedGuild.onboardingEnabled,
      welcomeChannelId: updatedGuild.welcomeChannelId || undefined,
      welcomeMessage: updatedGuild.welcomeMessage || undefined,
      welcomeDMEnabled: updatedGuild.welcomeDMEnabled,
      autoRoleEnabled: updatedGuild.autoRoleEnabled,
    };
  }
}
