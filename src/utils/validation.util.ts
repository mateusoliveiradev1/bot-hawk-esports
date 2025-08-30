import { CommandInteraction, GuildMember, PermissionFlagsBits } from 'discord.js';
import { DatabaseService } from '../database/database.service';
import { EmbedUtils } from './embed-builder.util';

/**
 * Utility class for common validations
 */
export class ValidationUtils {
  /**
   * Check if user is registered in the system
   */
  static async validateUserRegistration(
    interaction: CommandInteraction,
    database: DatabaseService
  ): Promise<{ isValid: boolean; user?: any }> {
    try {
      const user = await database.client.user.findUnique({
        where: { id: interaction.user.id },
        include: {
          guilds: {
            where: { guildId: interaction.guildId! },
          },
        },
      });

      if (!user || user.guilds.length === 0) {
        await interaction.editReply({
          embeds: [
            EmbedUtils.userNotRegistered(
              'Você precisa se registrar primeiro usando `/register-server`'
            ),
          ],
        });
        return { isValid: false };
      }

      return { isValid: true, user };
    } catch (error) {
      await interaction.editReply({
        embeds: [EmbedUtils.internalError('Erro ao verificar registro do usuário')],
      });
      return { isValid: false };
    }
  }

  /**
   * Check if user has required permissions
   */
  static async validatePermissions(
    interaction: CommandInteraction,
    requiredPermissions: bigint[]
  ): Promise<boolean> {
    const member = interaction.member as GuildMember;

    if (!member) {
      await interaction.editReply({
        embeds: [EmbedUtils.createErrorEmbed('Erro', 'Não foi possível verificar suas permissões')],
      });
      return false;
    }

    const hasPermissions = requiredPermissions.every(permission =>
      member.permissions.has(permission)
    );

    if (!hasPermissions) {
      await interaction.editReply({
        embeds: [
          EmbedUtils.insufficientPermissions(
            'Você não tem permissões suficientes para executar este comando'
          ),
        ],
      });
      return false;
    }

    return true;
  }

  /**
   * Check if user is administrator
   */
  static async validateAdminPermissions(interaction: CommandInteraction): Promise<boolean> {
    return this.validatePermissions(interaction, [PermissionFlagsBits.Administrator]);
  }

  /**
   * Check if user can manage server
   */
  static async validateManageServerPermissions(interaction: CommandInteraction): Promise<boolean> {
    return this.validatePermissions(interaction, [PermissionFlagsBits.ManageGuild]);
  }

  /**
   * Check if user can moderate (kick/ban)
   */
  static async validateModerationPermissions(interaction: CommandInteraction): Promise<boolean> {
    return this.validatePermissions(interaction, [
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
    ]);
  }

  /**
   * Validate string parameter is not empty
   */
  static validateStringParameter(
    value: string | null,
    parameterName: string,
    interaction: CommandInteraction
  ): boolean {
    if (!value || value.trim().length === 0) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed(
            'Parâmetro Inválido',
            `O parâmetro '${parameterName}' é obrigatório`
          ),
        ],
      });
      return false;
    }
    return true;
  }

  /**
   * Validate number parameter is within range
   */
  static validateNumberParameter(
    value: number,
    min: number,
    max: number,
    parameterName: string,
    interaction: CommandInteraction
  ): boolean {
    if (value < min || value > max) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed(
            'Parâmetro Inválido',
            `O parâmetro '${parameterName}' deve estar entre ${min} e ${max}`
          ),
        ],
      });
      return false;
    }
    return true;
  }

  /**
   * Check if user is in voice channel (for music commands)
   */
  static validateVoiceChannel(interaction: CommandInteraction): boolean {
    const member = interaction.member as GuildMember;

    if (!member?.voice?.channel) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed(
            'Canal de Voz Necessário',
            'Você precisa estar em um canal de voz para usar este comando'
          ),
        ],
      });
      return false;
    }

    return true;
  }

  /**
   * Check if bot has required permissions in a channel
   */
  static validateBotPermissions(
    interaction: CommandInteraction,
    requiredPermissions: bigint[]
  ): boolean {
    const botMember = interaction.guild?.members.me;

    if (!botMember) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed('Erro', 'Não foi possível verificar as permissões do bot'),
        ],
      });
      return false;
    }

    const hasPermissions = requiredPermissions.every(permission =>
      botMember.permissions.has(permission)
    );

    if (!hasPermissions) {
      interaction.editReply({
        embeds: [
          EmbedUtils.createErrorEmbed(
            'Permissões Insuficientes',
            'O bot não tem permissões suficientes para executar esta ação'
          ),
        ],
      });
      return false;
    }

    return true;
  }

  /**
   * Generic error handler for command execution
   */
  static async handleCommandError(
    error: any,
    interaction: CommandInteraction,
    logger?: any
  ): Promise<void> {
    if (logger) {
      logger.error('Command execution error:', error);
    }

    const errorEmbed = EmbedUtils.internalError(
      'Ocorreu um erro interno. Tente novamente mais tarde.'
    );

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyError) {
      // If we can't reply, log the error
      if (logger) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  }
}
