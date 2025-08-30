import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
} from 'discord.js';
import { Command, CommandCategory } from '../../types/command';
import { ExtendedClient } from '../../types/client';
import { Logger } from '../../utils/logger';

/**
 * Server Registration Command - Basic server registration without PUBG
 */
const registerServer: Command = {
  data: new SlashCommandBuilder()
    .setName('register-server')
    .setDescription('📝 Registra-se no servidor para acessar todos os canais')
    .setDMPermission(false) as SlashCommandBuilder,

  category: CommandCategory.GENERAL,
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction, client: ExtendedClient) {
    const logger = new Logger();

    try {
      const member = interaction.member;
      if (!member || !interaction.guild) {
        await interaction.reply({
          content: '❌ Este comando só pode ser usado em um servidor.',
          ephemeral: true,
        });
        return;
      }

      // Check if user is already registered in the database
      const existingUser = await client.database.client.user.findUnique({
        where: { id: interaction.user.id },
      });

      if (existingUser && existingUser.serverRegistered) {
        await interaction.reply({
          content:
            '✅ Você já está registrado no servidor! Use `/register` para registrar seu PUBG.',
          ephemeral: true,
        });
        return;
      }

      // Update user registration status
      await client.database.client.user.upsert({
        where: { id: interaction.user.id },
        update: {
          username: interaction.user.username,
          discriminator: interaction.user.discriminator || '0',
          avatar: interaction.user.avatar,
          serverRegistered: true,
          serverRegisteredAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          id: interaction.user.id,
          username: interaction.user.username,
          discriminator: interaction.user.discriminator || '0',
          avatar: interaction.user.avatar,
          serverRegistered: true,
          serverRegisteredAt: new Date(),
        },
      });

      // Give basic member role if configured
      if (client.services?.roleManager) {
        try {
          await client.services.roleManager.addNewMemberRole(member as any);
        } catch (error) {
          logger.warn('Failed to assign member role:', error);
        }
      }

      const successEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Registro no Servidor Concluído!')
        .setDescription(
          '🎉 **Bem-vindo(a) ao Hawk Esports!**\n\n' +
            '✅ Você foi registrado com sucesso no servidor\n' +
            '🔓 Agora você tem acesso a todos os canais\n' +
            '🎮 Para registrar seu PUBG, use `/register`\n\n' +
            '**Próximos passos:**\n' +
            '• Leia as regras em <#RULES_CHANNEL_ID>\n' +
            '• Apresente-se em <#INTRO_CHANNEL_ID>\n' +
            '• Registre seu PUBG para acessar recursos avançados'
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({
          text: 'Hawk Esports • Sistema de Registro',
          iconURL: interaction.guild.iconURL() || undefined,
        });

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('register_pubg_prompt')
          .setLabel('🎮 Registrar PUBG Agora')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎮'),
        new ButtonBuilder()
          .setCustomId('view_rules')
          .setLabel('📋 Ver Regras')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📋')
      );

      await interaction.reply({
        embeds: [successEmbed],
        components: [actionRow],
        ephemeral: false,
      });

      logger.info(`User ${interaction.user.tag} registered on server ${interaction.guild.name}`);
    } catch (error) {
      logger.error('Error in server registration:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Erro no Registro')
        .setDescription(
          'Ocorreu um erro durante o registro no servidor.\n' +
            'Por favor, tente novamente em alguns instantes.'
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
    }
  },
};

export default registerServer;
